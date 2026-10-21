import test from 'node:test';
import assert from 'node:assert/strict';
import {neonConfig} from '@neondatabase/serverless';
import worker from '../src/index.js';
import {neonFixture} from './helpers/neon-fixture.js';

const origin='https://somas.test';
const env={DATABASE_URL:'postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require'};
function request(path,data,cookie){return new Request(origin+path,{
  method:data?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','x-somas-request':'1',...(cookie?{Cookie:cookie}:{})},
  ...(data?{body:JSON.stringify(data)}:{}),
});}

test('registration/login/session/workspace flow uses the actual Neon driver with an HTTP fixture',async t=>{
  const db=neonFixture(),previous=neonConfig.fetchFunction;
  neonConfig.fetchFunction=db.fetch;t.after(()=>{neonConfig.fetchFunction=previous;});
  const derive=crypto.subtle.deriveBits.bind(crypto.subtle);
  t.mock.method(crypto.subtle,'deriveBits',(algorithm,...args)=>{
    if(algorithm.iterations>100000)throw new Error('PBKDF2 iteration counts above 100000 are not supported');
    return derive(algorithm,...args);
  });
  const credentials={email:'Alice@EXAMPLE.test',password:'disposable-test-password-01'};
  const registered=await worker.fetch(request('/api/auth/register',credentials),env);
  assert.equal(registered.status,201,await registered.clone().text());
  const cookie=registered.headers.get('set-cookie').split(';')[0];
  assert.match(registered.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  assert.match(registered.headers.get('set-cookie'),/; Secure/);
  assert.equal(db.state.users[0].email,'alice@example.test');
  assert.equal(db.state.workspaces.length,1);assert.equal(db.state.subscriptions.length,1);
  assert.equal(db.state.workspaces[0].owner_id,db.state.users[0].id);
  assert.notEqual(db.state.sessions[0].token_hash,cookie.split('=')[1]);
  assert.ok(!JSON.stringify(db.state).includes(credentials.password));
  const me=await worker.fetch(request('/api/me',undefined,cookie),env);
  assert.equal(me.status,200);assert.equal((await me.json()).user.email,'alice@example.test');
  assert.equal((await worker.fetch(request('/api/auth/register',credentials),env)).status,409);
  assert.equal(db.state.workspaces.length,1);
  assert.equal((await worker.fetch(request('/api/auth/login',{...credentials,password:'wrong-test-password'}),env)).status,401);
  assert.equal((await worker.fetch(request('/api/auth/logout',{},cookie),env)).status,200);
  assert.equal((await worker.fetch(request('/api/me',undefined,cookie),env)).status,401);
  const login=await worker.fetch(request('/api/auth/login',credentials),env);
  assert.equal(login.status,200);
  const second=await worker.fetch(request('/api/auth/register',{email:'bob@example.test',password:credentials.password}),env);
  assert.equal(second.status,201);
  const secondCookie=second.headers.get('set-cookie').split(';')[0];
  assert.equal((await worker.fetch(request('/api/projects/11111111-1111-4111-8111-111111111111',undefined,secondCookie),env)).status,404);
  assert.equal(db.state.workspaces.length,2);
  assert.notEqual(db.state.workspaces[0].owner_id,db.state.workspaces[1].owner_id);
});

test('configuration and schema failures return safe correlated errors',async t=>{
  const logs=[];t.mock.method(console,'error',line=>logs.push(line));
  const missing=await worker.fetch(request('/api/auth/register',{email:'test@example.test',password:'disposable-test-password'}),{});
  assert.equal(missing.status,503);assert.equal((await missing.json()).error,'database_not_configured');
  const db=neonFixture(),previous=neonConfig.fetchFunction;
  neonConfig.fetchFunction=db.fetch;t.after(()=>{neonConfig.fetchFunction=previous;});
  db.state.failCode='42P01';
  const response=await worker.fetch(request('/api/auth/register',{email:'test@example.test',password:'disposable-test-password'}),env);
  assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.error,'database_schema_unavailable');
  assert.equal(body.requestId,response.headers.get('x-request-id'));
  assert.ok(logs.some(line=>line.includes('registration_user_workspace')));
  assert.equal(db.state.users.length,0);
  assert.ok(!logs.join('').includes('private'));assert.ok(!logs.join('').includes('disposable'));
});

test('health reports configuration only and never claims database readiness',async t=>{
  const previous=neonConfig.fetchFunction;let calls=0;
  neonConfig.fetchFunction=()=>{calls++;throw new Error('unreachable fixture');};
  t.after(()=>{neonConfig.fetchFunction=previous;});
  const response=await worker.fetch(request('/health'),env);
  assert.equal(response.status,200);
  assert.equal((await response.json()).databaseConfigured,true);assert.equal(calls,0);
});

test('registration session failures are correlated separately from workspace creation',async t=>{
  const db=neonFixture(),previous=neonConfig.fetchFunction,logs=[];
  t.mock.method(console,'error',line=>logs.push(line));
  neonConfig.fetchFunction=(url,options)=>{
    if(JSON.parse(options.body).query?.startsWith('INSERT INTO sessions'))return Response.json({message:'private credentials',code:'08006'},{status:400});
    return db.fetch(url,options);
  };
  t.after(()=>{neonConfig.fetchFunction=previous;});
  const response=await worker.fetch(request('/api/auth/register',{email:'session@example.test',password:'disposable-test-password'}),env);
  assert.equal(response.status,503);assert.equal((await response.json()).error,'database_unavailable');
  assert.ok(logs.some(line=>line.includes('registration_session')));
  assert.ok(!logs.join('').includes('private credentials'));
  // Existing architecture: the user transaction commits before the session write.
  assert.equal(db.state.users.length,1);assert.equal(db.state.sessions.length,0);
});
