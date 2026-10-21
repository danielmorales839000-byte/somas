/** Opt-in real PostgreSQL test; the Neon HTTP transport is locally adapted to pg.
 * No claim of hosted Neon integration. Never use a remote/production URI here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {neonConfig} from '@neondatabase/serverless';
import worker from '../src/index.js';
import {checkDatabase} from '../scripts/check-database.mjs';
import {database} from '../src/database.js';

const uri=process.env.SOMAS_TEST_DATABASE_URL;
test('real PostgreSQL migrations, auth, ownership, project agents, management and approved release', {skip:!uri},async()=>{
  const url=new URL(uri);
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only disposable loopback PostgreSQL is allowed');
  const admin=new pg.Client({connectionString:uri});await admin.connect();
  const name='somas_test_'+randomUUID().replaceAll('-','');
  url.pathname='/'+name;
  const client=new pg.Client({connectionString:url.href});
  const previous=neonConfig.fetchFunction;
  let databaseCreated=false;
  try{
    await admin.query(`CREATE DATABASE "${name}"`);databaseCreated=true;
    await client.connect();
    for(const file of ['001_initial.sql','002_operations.sql','003_recursive_units.sql'])await client.query(await readFile('db/'+file,'utf8'));
    // Reapplying the current idempotent scripts must preserve existing tables.
    for(const file of ['001_initial.sql','002_operations.sql','003_recursive_units.sql'])await client.query(await readFile('db/'+file,'utf8'));
    neonConfig.fetchFunction=async (_target,options)=>{
      const body=JSON.parse(options.body),batch=!!body.queries;
      try{
        if(batch)await client.query(options.headers['Neon-Batch-Read-Only']==='true'?'BEGIN READ ONLY':'BEGIN');
        const results=[];
        for(const {query,params} of body.queries||[body]){
          const result=await client.query({text:query,values:params,rowMode:'array'});
          results.push({fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rowCount:result.rowCount,
            rows:result.rows.map(row=>row.map(v=>v===null?null:v instanceof Date?v.toISOString():typeof v==='object'?JSON.stringify(v):String(v)))});
        }
        if(batch)await client.query('COMMIT');
        return Response.json(batch?{results}:results[0]);
      }catch(error){if(batch)await client.query('ROLLBACK');return Response.json({message:'isolated SQL test failure',code:error.code},{status:400});}
    };
    const env={DATABASE_URL:'postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require'};
    assert.equal((await checkDatabase(database(env))).registrationSchemaReady,true);
    const origin='https://integration.test';
    const send=(path,data,cookie)=>worker.fetch(new Request(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'content-type':'application/json','x-somas-request':'1',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})}),env);
    const alice={email:'alice@example.test',password:'disposable-alice-password'};
    const registered=await send('/api/auth/register',alice);
    assert.equal(registered.status,201,await registered.clone().text());
    const cookie=registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await send('/api/me',undefined,cookie)).status,200);
    assert.equal((await send('/api/auth/register',alice)).status,409);
    assert.equal((await client.query('SELECT count(*)::int AS total FROM workspaces')).rows[0].total,1);
    const created=await send('/api/projects',{title:'Isolated Test Site',purpose:'An isolated project for validating owner management.',template:'business'},cookie);
    assert.equal(created.status,201,await created.clone().text());
    const {project}=await created.json();
    const agents=(await client.query('SELECT id,role,policy FROM agents WHERE project_id=$1',[project.id])).rows;
    assert.deepEqual(agents.map(a=>a.role).sort(),['assistant','manager','virtual_customer']);
    assert.equal(new Set(agents.map(a=>a.id)).size,3);
    assert.ok(agents.every(a=>a.policy.role===a.role&&a.policy.weights.length>0));
    assert.equal((await send('/s/'+project.slug)).status,200);
    assert.equal((await send('/s/'+project.slug+'/manage')).status,302);
    assert.equal((await send('/s/'+project.slug+'/manage',undefined,cookie)).status,200);
    const bob=await send('/api/auth/register',{email:'bob@example.test',password:'disposable-bob-password'});
    const bobCookie=bob.headers.get('set-cookie').split(';')[0];
    assert.equal((await send('/api/projects/'+project.id,undefined,bobCookie)).status,404);
    assert.equal((await send('/s/'+project.slug+'/manage',undefined,bobCookie)).status,403);
    assert.deepEqual((await (await send('/api/projects',undefined,bobCookie)).json()).projects,[]);
    const proposal=await send(`/api/projects/${project.id}/requests`,{message:'Change title to Verified Isolated Site'},cookie);
    assert.equal(proposal.status,201,await proposal.clone().text());
    const {task}=await proposal.json();
    assert.ok(!(await (await send('/s/'+project.slug)).text()).includes('<h1>Verified Isolated Site</h1>'));
    assert.equal((await send(`/api/projects/${project.id}/proposals/${task.proposalId}/approve`,{},bobCookie)).status,404);
    const approval=await send(`/api/projects/${project.id}/proposals/${task.proposalId}/approve`,{},cookie);
    assert.equal(approval.status,200,await approval.clone().text());
    assert.ok((await (await send('/s/'+project.slug)).text()).includes('<h1>Verified Isolated Site</h1>'));
    assert.equal((await send('/api/auth/logout',{},cookie)).status,200);
    assert.equal((await send('/api/me',undefined,cookie)).status,401);
    assert.equal((await send('/api/auth/login',alice)).status,200);
  }finally{
    neonConfig.fetchFunction=previous;await client.end();
    try{if(databaseCreated)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}finally{await admin.end();}
  }
});
