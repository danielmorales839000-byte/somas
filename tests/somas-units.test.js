import test from 'node:test';
import assert from 'node:assert/strict';
import {rootDescriptor,customerDescriptor} from '../src/somas-core.js';
import {proposeScopedEvolution} from '../src/somas-units.js';

const owner='f0c982ac-1987-4e75-84d7-3c637ec92dd1';
const project={id:'8837a321-43fa-44b7-9415-c53798ce0802',workspace_id:'b8b3c8c7-cc38-4a59-ab24-84d64a74906f',purpose:'Operate a booking system and continuously improve customer journeys.'};

function sqlSpy(){
  const batches=[];
  const sql=(strings,...values)=>({statement:strings.join('?'),values});
  sql.transaction=async statements=>{batches.push(statements);};
  return {sql,batches};
}

test('Root and Customer persist proposals through identical shared planner and separate agent stores',async()=>{
  const a=sqlSpy(),b=sqlSpy();
  const root=await proposeScopedEvolution(a.sql,{unit:rootDescriptor(),instruction:'Improve SOMAS subscription billing and audit reliability',changeKind:'software',actorId:owner});
  const child=await proposeScopedEvolution(b.sql,{unit:customerDescriptor(project),instruction:'Fix reservation flows and improve checkout reliability',changeKind:'software',actorId:owner});
  assert.equal(root.target,'somas_platform');
  assert.equal(child.target,'customer_application');
  assert.equal(root.status,'proposed');
  assert.equal(child.status,'proposed');
  assert.ok(a.batches[0][0].statement.includes('INSERT INTO somas_evolution_proposals'));
  assert.ok(b.batches[0][0].statement.includes('INSERT INTO somas_evolution_proposals'));
  assert.ok(a.batches[0].slice(1).every(s=>s.statement.includes('INTO somas_root_agents')));
  assert.ok(b.batches[0].slice(1).every(s=>s.statement.includes('INTO agents')));
  assert.equal(a.batches[0][0].values[4],'somas_platform');
  assert.equal(b.batches[0][0].values[4],'customer_application');
});

test('storage adapter rejects a claimed cross-scope target before any write',async()=>{
  const spy=sqlSpy();
  await assert.rejects(()=>proposeScopedEvolution(spy.sql,{unit:customerDescriptor(project),instruction:'Modify platform billing and other tenants',target:'somas_platform',actorId:owner}),/cross_scope/);
  assert.equal(spy.batches.length,0);
});
