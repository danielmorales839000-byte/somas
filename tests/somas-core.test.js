import test from 'node:test';
import assert from 'node:assert/strict';
import {rootDescriptor,customerDescriptor,planEvolution,permissionsFor,authorizeEvolution,ROOT_ID} from '../src/somas-core.js';
import {newPolicy,trainVerified} from '../src/agents.js';

const project={id:'8837a321-43fa-44b7-9415-c53798ce0802',workspace_id:'b8b3c8c7-cc38-4a59-ab24-84d64a74906f',purpose:'Build a booking site with customer profiles and employee scheduling.'};

test('Root and Customer are instances of the same SOMAS planning engine',()=>{
  const root=planEvolution(rootDescriptor(),'Improve SOMAS platform billing observability and deployment reliability');
  const customer=planEvolution(customerDescriptor(project),'Improve booking checkout and reservations for our customers');
  assert.deepEqual(Object.keys(root),Object.keys(customer));
  assert.deepEqual(root.team.core,customer.team.core);
  assert.deepEqual(root.steps.map(s=>s.key),customer.steps.map(s=>s.key));
  assert.equal(root.target,'somas_platform');
  assert.equal(customer.target,'customer_application');
  assert.equal(root.requiresHumanApproval,true);
  assert.equal(customer.automaticDeployment,false);
});

test('Root mission always remains focused on SOMAS service',()=>{
  const unit=rootDescriptor();
  assert.equal(unit.id,ROOT_ID);
  assert.match(unit.mission,/SOMAS service/);
  assert.equal(permissionsFor(unit).canModifyPlatform,true);
  assert.equal(permissionsFor(unit).canModifyCustomerApplication,false);
});

test('Customer mission derives from owner project requirements, not SOMAS platform',()=>{
  const unit=customerDescriptor(project);
  assert.match(unit.mission,/booking site/);
  assert.equal(permissionsFor(unit).canModifyPlatform,false);
  assert.equal(permissionsFor(unit).canModifyCustomerApplication,true);
});

test('Customer cannot claim platform target and Root cannot claim customer target',()=>{
  assert.throws(()=>authorizeEvolution(customerDescriptor(project),'somas_platform'),/cross_scope/);
  assert.throws(()=>authorizeEvolution(rootDescriptor(),'customer_application'),/cross_scope/);
  assert.throws(()=>planEvolution(customerDescriptor(project),'Change the SOMAS hosting billing settings',{target:'somas_platform'}),/cross_scope/);
});

test('Mutating user-derived kind or parent is rejected',()=>{
  const customer=customerDescriptor(project);
  assert.throws(()=>planEvolution({...customer,kind:'root'},'Please modify deployment settings'),/invalid_root_boundary/);
  assert.throws(()=>planEvolution({...customer,parent_id:null},'Please modify deployment settings'),/invalid_customer_boundary/);
});

test('Both instance Managers can propose their own verified neural improvements',()=>{
  const rootManager=newPolicy('manager');
  const customerManager=newPolicy('manager');
  const next=trainVerified(rootManager,'Fix application bug urgently','bug');
  assert.equal(next.version,2);
  assert.equal(rootManager.version,1);
  assert.equal(customerManager.version,1);
  const r=planEvolution(rootDescriptor(),'Improve SOMAS planning decisions for deployments',{changeKind:'intelligence',managerPolicy:next});
  const c=planEvolution(customerDescriptor(project),'Improve our own restaurant manager decisions',{changeKind:'intelligence',managerPolicy:customerManager});
  assert.equal(r.changeKind,'intelligence');assert.equal(c.changeKind,'intelligence');
  assert.equal(r.implementationStatus,'not_executed');
});

test('Do not allow unvalidated tasks, invalid evolution kinds or agent privilege escalation',()=>{
  assert.throws(()=>planEvolution(rootDescriptor(),'short'),/description_must_be/);
  assert.throws(()=>planEvolution(rootDescriptor(),'Improve reliability for the service',{changeKind:'secret_escalation'}),/invalid_evolution_kind/);
  const p=permissionsFor(rootDescriptor());
  assert.equal(p.canDeployWithoutApproval,false);
  assert.equal(p.canWriteSecrets,false);
  assert.equal(p.canCreateSubinstancesWithoutApproval,false);
});

test('Manager composes task-specific specialists beyond the shared core',()=>{
  const root=planEvolution(rootDescriptor(),'Improve SOMAS subscription billing and deployment observability');
  assert.ok(root.team.specialists.includes('billing_specialist'));
  assert.ok(root.team.specialists.includes('deployment_specialist'));
  const child=planEvolution(customerDescriptor(project),'Fix reservation cancellations and checkout bugs');
  assert.ok(child.team.specialists.includes('reservation_specialist'));
  assert.ok(child.team.specialists.includes('commerce_specialist'));
  assert.ok(root.team.agents.length<=10);assert.ok(child.team.agents.length<=10);
});

test('Root and child plans cannot approve their own changes',()=>{
  for(const unit of [rootDescriptor(),customerDescriptor(project)]) {
    const plan=planEvolution(unit,'Propose a new intelligence training and release workflow',{changeKind:'intelligence'});
    assert.equal(plan.status,'proposed');
    assert.equal(plan.implementationStatus,'not_executed');
    assert.equal(plan.requiresHumanApproval,true);
    assert.equal(plan.automaticDeployment,false);
  }
});

test('mission descriptors cannot forge customer identity or replace the Root mission',()=>{
  assert.throws(()=>planEvolution({...customerDescriptor(project),id:ROOT_ID},'Improve our application design'),/invalid_customer_boundary/);
  assert.throws(()=>planEvolution({...rootDescriptor(),mission:'Work on a different customer business'},'Improve our application design'),/invalid_root_boundary/);
});
