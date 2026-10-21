import pg from 'pg';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {neonConfig} from '@neondatabase/serverless';

/** Real disposable local PostgreSQL; Neon HTTPS is adapted, not hosted. */
export async function withPostgres(uri,run){
  const url=new URL(uri);
  assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Never use a hosted/production test database');
  const name='somas_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:uri});await admin.connect();
  url.pathname='/'+name;
  const pool=new pg.Pool({connectionString:url.href,max:4});
  const previous=neonConfig.fetchFunction;let created=false;
  try{
    await admin.query(`CREATE DATABASE "${name}"`);created=true;
    neonConfig.fetchFunction=async (_target,options)=>{
      const connection=await pool.connect();
      const body=JSON.parse(options.body),batch=!!body.queries;
      try{
        if(batch)await connection.query(options.headers['Neon-Batch-Read-Only']==='true'?'BEGIN READ ONLY':'BEGIN');
        const results=[];
        for(const {query,params} of body.queries||[body]){
          const result=await connection.query({text:query,values:params,rowMode:'array'});
          results.push({fields:result.fields.map(f=>({name:f.name,dataTypeID:f.dataTypeID})),rowCount:result.rowCount,
            rows:result.rows.map(row=>row.map(v=>v===null?null:v instanceof Date?v.toISOString():typeof v==='object'?JSON.stringify(v):String(v)))});
        }
        if(batch)await connection.query('COMMIT');
        return Response.json(batch?{results}:results[0]);
      }catch(error){if(batch)await connection.query('ROLLBACK');return Response.json({message:'isolated SQL test failure',code:error.code},{status:400});}
      finally{connection.release();}
    };
    await run({pool,migrate:async file=>pool.query(await readFile('db/'+file,'utf8'))});
  }finally{
    neonConfig.fetchFunction=previous;await pool.end();
    try{if(created)await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}finally{await admin.end();}
  }
}
