import test from 'node:test';
import assert from 'node:assert/strict';
import {checkDatabase} from '../scripts/check-database.mjs';

test('database checker performs only read-only SELECTs and detects missing registration schema',async()=>{
  const sql=(parts)=>{assert.match(parts.join(''),/^SELECT /);return {};};
  sql.transaction=async (queries,options)=>{
    assert.equal(queries.length,2);assert.equal(options.readOnly,true);
    assert.ok(options.fetchOptions.signal instanceof AbortSignal);
    return [[{connected:1}],[]];
  };
  const result=await checkDatabase(sql);
  assert.equal(result.connected,true);assert.equal(result.registrationSchemaReady,false);
  assert.ok(result.missing.includes('sessions.token_hash'));
});

test('database checker accepts the expected v2 registration columns',async()=>{
  const expected={users:['id','email','password_hash'],workspaces:['id','owner_id','name'],subscriptions:['workspace_id','status','plan'],sessions:['token_hash','user_id','expires_at']};
  const sql=()=>({});
  sql.transaction=async()=>[[{connected:1}],Object.entries(expected).flatMap(([table_name,names])=>names.map(column_name=>({table_name,column_name})))];
  assert.deepEqual(await checkDatabase(sql),{connected:true,registrationSchemaReady:true,missing:[]});
});
