import test from 'node:test';
import {canonicalJson} from '../src/integrity.js';
import assert from 'node:assert/strict';
import {organizationModel,freshCommunicationEvents} from '../public/operations-model.js';
import {applicationPackage} from '../src/application-package.js';
import {initialSpec} from '../src/agents.js';
import {sha256} from '../src/auth.js';
import worker from '../src/index.js';

test('organization states come from recorded jobs; initial history never animates',()=>{
  const agents=[{id:'m',role:'manager'},{id:'d',role:'developer'},{id:'v',role:'virtual_customer'}];
  const now=Date.now(),ops={jobs:[{id:'a',agent_role:'developer',status:'working',lease_until:new Date(now-1).toISOString()},{id:'b',agent_role:'virtual_customer',status:'blocked',blocker:'runner_unavailable'}]};
  const model=organizationModel(agents,ops,now);assert.equal(model.manager.state,'idle');assert.equal(model.cards[1].state,'waiting');assert.equal(model.cards[2].state,'blocked');assert.equal(model.running,0);
  const events=[{id:1,actor_role:'manager',recipient_role:'developer',event_type:'task_assigned',created_at:new Date(now).toISOString()}];
  assert.deepEqual(freshCommunicationEvents(events,null,now),[]);assert.equal(freshCommunicationEvents(events,0,now).length,1);assert.equal(freshCommunicationEvents(events,1,now).length,0);assert.equal(freshCommunicationEvents(events,0,now+30000).length,0);
});
test('standalone package has independent identity, pinned digest, safe worker and routing',async()=>{
  const project={id:'12345678-1234-1234-1234-123456789abc',slug:'shop-test',active_release:3,spec:initialSpec('Furniture','Sell local furniture with verified workflows','store')};
  const bundle=await applicationPackage(project);assert.equal(bundle.digest,await sha256(canonicalJson(bundle.files)));
  assert.equal(bundle.status,'prepared');assert.equal(bundle.workerName,'somas-app-123456781234123412341234');
  const app=(await import('data:text/javascript;base64,'+Buffer.from(bundle.files['src/index.js']).toString('base64'))).default;
  assert.equal((await app.fetch(new Request('https://independent.test/'))).status,200);
  assert.equal((await app.fetch(new Request('https://independent.test/api/me'))).status,404);
  assert.equal((await (await app.fetch(new Request('https://independent.test/health'))).json()).version,3);
  assert.ok(!bundle.files['src/index.js'].includes('/manage'));
});
test('streamed JSON byte bound rejects oversized input without Content-Length',async()=>{
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"email":"'+ 'x'.repeat(13000)));controller.close();}});
  const req=new Request('https://somas.test/api/auth/register',{method:'POST',headers:{origin:'https://somas.test','content-type':'application/json','x-somas-request':'1'},body,duplex:'half'});
  const r=await worker.fetch(req,{DATABASE_URL:'postgresql://unused:unused@ep-test.neon.tech/test'});assert.equal(r.status,413);assert.equal((await r.json()).error,'payload_too_large');
});

test('canonical integrity survives JSONB-style object key reordering',()=>{assert.equal(canonicalJson({b:{d:1,c:2},a:[2,1]}),canonicalJson({a:[2,1],b:{c:2,d:1}}));});
