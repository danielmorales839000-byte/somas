import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {PASSWORD_ITERATIONS,hashPassword,verifyPassword,derivePassword} from '../src/auth.js';
import {classifyFailure,reportFailure} from '../src/errors.js';

test('new hashes fit the hosted Workers cap and use standard salted PBKDF2',async t=>{
  const derive=crypto.subtle.deriveBits.bind(crypto.subtle);
  const counts=[];
  t.mock.method(crypto.subtle,'deriveBits',async (algorithm,...args)=>{
    counts.push(algorithm.iterations);
    if(algorithm.iterations>100000)throw new DOMException('Pbkdf2 failed: iteration counts above 100000 are not supported','NotSupportedError');
    return derive(algorithm,...args);
  });
  // Reproduces the previous registration failure before any DB writes.
  await assert.rejects(()=>derivePassword('disposable-test-password','a'.repeat(32),120000),/password_hash_runtime_unsupported/);
  const password='disposable-test-password';
  const stored=await hashPassword(password), second=await hashPassword(password);
  const [algorithm,iterations,salt,digest]=stored.split('$');
  assert.equal(algorithm,'pbkdf2-sha256');assert.equal(Number(iterations),100000);
  assert.equal(PASSWORD_ITERATIONS,100000);assert.notEqual(stored,second);
  assert.equal(digest,pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex'));
  assert.equal(await verifyPassword(password,stored),true);
  assert.equal(await verifyPassword('incorrect-test-password',stored),false);
  assert.ok(counts.slice(1).every(n=>n<=100000));
});

test('existing 120000-iteration hashes are read without rewriting or truncating iterations',async()=>{
  const salt='b'.repeat(32),password='previous-valid-test-password';
  const hash=`pbkdf2-sha256$120000$${salt}$${pbkdf2Sync(password,salt,120000,32,'sha256').toString('hex')}`;
  assert.equal(await verifyPassword(password,hash),true);
  assert.equal(await verifyPassword('wrong-test-password',hash),false);
});

test('malformed hashes and unbounded passwords fail closed',async()=>{
  for(const stored of ['pbkdf2-sha256$999999$a$b','pbkdf2-sha256$100000$aa$bb','garbage',null]){
    assert.equal(await verifyPassword('test-password',stored),false);
  }
  await assert.rejects(()=>hashPassword('x'.repeat(129)),/password_must/);
});

test('hosted cap never silently downgrades an existing 120000-iteration hash',async t=>{
  const password='legacy-disposable-password',salt='c'.repeat(32);
  const stored=`pbkdf2-sha256$120000$${salt}$${pbkdf2Sync(password,salt,120000,32,'sha256').toString('hex')}`;
  const original=stored,counts=[];
  const derive=crypto.subtle.deriveBits.bind(crypto.subtle);
  t.mock.method(crypto.subtle,'deriveBits',(algorithm,...args)=>{
    counts.push(algorithm.iterations);
    if(algorithm.iterations>100000)throw new Error('Pbkdf2 failed: iteration counts above 100000 are not supported (requested 120000).');
    return derive(algorithm,...args);
  });
  await assert.rejects(()=>verifyPassword(password,stored),/password_hash_runtime_unsupported/);
  assert.deepEqual(counts,[120000]);assert.equal(stored,original);
});

test('safe failure categories distinguish config/schema/runtime without exposing secrets',t=>{
  for(const [error,expected] of [
    [new Error('missing_database_url'),'database_not_configured'],
    [Object.assign(new Error('postgresql://secret@private.example/db'),{code:'42P01'}),'database_schema_unavailable'],
    [Object.assign(new Error('secret-password'),{code:'28P01'}),'database_access_unavailable'],
    [Object.assign(new Error('private server details'),{name:'NeonDbError'}),'database_unavailable'],
  ])assert.equal(classifyFailure(error).code,expected);
  const logs=[];t.mock.method(console,'error',value=>logs.push(value));
  const failure=reportFailure(new Error('postgresql://secret:password@private/db'),'registration_session');
  assert.equal(failure.status,500);assert.match(failure.requestId,/^[0-9a-f-]{36}$/);
  assert.ok(logs[0].includes(failure.requestId));
  assert.ok(!logs[0].includes('postgresql'));assert.ok(!logs[0].includes('password'));
});
