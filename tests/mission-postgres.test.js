import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import worker from '../src/index.js';
import {newPolicy,trainVerified,initialSpec} from '../src/agents.js';
import {withPostgres} from './helpers/postgres-fixture.js';

const uri=process.env.SOMAS_TEST_DATABASE_URL;
test('mission migration, admin/tenant boundaries, independent policies and promotion gates', {skip:!uri},async t=>{
  await withPostgres(uri,async({pool,migrate})=>{
    t.mock.method(console,'error',()=>{}); // Expected failure-path logs never need database details.
    await migrate('001_initial.sql');await migrate('002_operations.sql');
    const env={DATABASE_URL:'postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require'};
    const origin='https://missions.test';
    const send=(path,data,cookie,extra={})=>worker.fetch(new Request(origin+path,{
      method:data?'POST':'GET',headers:{Origin:origin,'content-type':'application/json','x-somas-request':'1',...(cookie?{Cookie:cookie}:{}),...extra},
      ...(data?{body:JSON.stringify(data)}:{}),
    }),env);
    const register=async email=>{
      const response=await send('/api/auth/register',{email,password:'disposable-mission-password'});
      assert.equal(response.status,201);
      return {user:(await response.json()).user,cookie:response.headers.get('set-cookie').split(';')[0]};
    };
    const alice=await register('alice@example.test'),bob=await register('bob@example.test');
    const snapshot=(await pool.query('SELECT id,password_hash FROM users ORDER BY id')).rows;
    const aliceWorkspace=(await pool.query('SELECT id FROM workspaces WHERE owner_id=$1',[alice.user.id])).rows[0].id;
    const bobWorkspace=(await pool.query('SELECT id FROM workspaces WHERE owner_id=$1',[bob.user.id])).rows[0].id;
    const legacyId=randomUUID(),legacyAgent=randomUUID();
    const legacyPolicy=trainVerified(newPolicy('manager'),'Fix the legacy site bug now','bug');
    await pool.query('INSERT INTO projects(id,workspace_id,slug,title,purpose,spec) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[legacyId,aliceWorkspace,'legacy-site','Legacy site','Maintain our existing reservation application',JSON.stringify(initialSpec('Legacy site','Maintain our existing reservation application'))]);
    await pool.query("INSERT INTO agents(id,project_id,role,name,policy,is_core) VALUES($1,$2,'manager','Manager',$3::jsonb,true)",[legacyAgent,legacyId,JSON.stringify(legacyPolicy)]);
    // Missing 003 fails project bootstrap atomically, without damaging auth or old projects.
    assert.equal((await send('/api/projects',{title:'New site',purpose:'Improve our customer booking application'},alice.cookie)).status,503);
    assert.equal((await pool.query('SELECT count(*)::int n FROM projects')).rows[0].n,1);
    assert.equal((await send('/api/me',undefined,alice.cookie)).status,200);
    await migrate('003_recursive_units.sql');await migrate('003_recursive_units.sql');await migrate('004_mission_runtime.sql');
    assert.deepEqual((await pool.query('SELECT id,password_hash FROM users ORDER BY id')).rows,snapshot);
    assert.deepEqual((await pool.query('SELECT policy FROM agents WHERE id=$1',[legacyAgent])).rows[0].policy,legacyPolicy);
    assert.equal((await send(`/api/projects/${legacyId}/unit`,undefined,alice.cookie)).status,200);
    assert.deepEqual((await pool.query('SELECT policy FROM agents WHERE id=$1',[legacyAgent])).rows[0].policy,legacyPolicy);
    const create=async actor=>{
      const response=await send('/api/projects',{title:'Booking application',purpose:'Improve our owners reservation and checkout application'},actor.cookie);
      assert.equal(response.status,201,await response.clone().text());return (await response.json()).project;
    };
    const project=await create(alice),other=await create(bob);
    const customerPath=`/api/projects/${project.id}/unit`;
    assert.equal((await send('/api/admin/root')).status,401);
    assert.equal((await send('/api/admin/root',undefined,alice.cookie)).status,403); // missing admin secret
    env.ADMIN_USER_ID=alice.user.id;
    assert.equal((await send('/api/admin/root/view',undefined,bob.cookie)).status,403);
    const rootPage=await send('/api/admin/root/view',undefined,alice.cookie);
    assert.equal(rootPage.status,200);assert.match(await rootPage.text(),/rootMissionForm/);
    const ownerPage=await send('/s/'+project.slug+'/manage',undefined,alice.cookie);
    assert.equal(ownerPage.status,200);assert.match(await ownerPage.text(),/unitEvolutionForm/);
    const root=(await (await send('/api/admin/root',undefined,alice.cookie)).json());
    assert.match(root.unit.mission,/SOMAS service/);assert.equal(root.agents.length,3);
    assert.equal((await send(customerPath,undefined,bob.cookie)).status,404);
    assert.equal((await send(customerPath+'/evolution',{message:'Improve the customer application'},bob.cookie)).status,404);
    assert.equal((await send(`/api/projects/${other.id}/unit`,undefined,alice.cookie)).status,404); // Root privilege is not tenant ownership
    assert.equal((await send('/api/admin/root/evolution',{message:'Improve the SOMAS platform'},bob.cookie)).status,403);
    assert.equal((await send(customerPath+'/evolution',{message:'Improve the customer application'},alice.cookie,{Origin:'https://attacker.test'})).status,403);
    const badRoot=await send('/api/admin/root/evolution',{message:'Improve the SOMAS platform',target:'customer_application'},alice.cookie);
    assert.equal(badRoot.status,403);
    assert.equal((await send(customerPath+'/evolution',{message:'Improve customer checkout',target:'somas_platform'},alice.cookie)).status,403);
    const rootPlanResponse=await send('/api/admin/root/evolution',{message:'Improve SOMAS platform security and deployment reliability',changeKind:'software'},alice.cookie);
    assert.equal(rootPlanResponse.status,201,await rootPlanResponse.clone().text());
    const rootPlan=(await rootPlanResponse.json()).proposal;
    const customerPlanResponse=await send(customerPath+'/evolution',{message:'Improve customer reservation checkout reliability',changeKind:'software',unitId:'somas-root'},alice.cookie);
    assert.equal(customerPlanResponse.status,201,await customerPlanResponse.clone().text());
    const customerPlan=(await customerPlanResponse.json()).proposal;
    assert.equal(rootPlan.target,'somas_platform');assert.equal(customerPlan.target,'customer_application');
    assert.deepEqual(rootPlan.steps.map(s=>s.key),customerPlan.steps.map(s=>s.key));
    assert.equal(customerPlan.unitId,'customer-'+project.id);
    assert.equal(rootPlan.implementationStatus,'not_executed');assert.equal(customerPlan.automaticDeployment,false);
    assert.ok(!(await (await send(`/api/projects/${other.id}/unit`,undefined,bob.cookie)).json()).proposals.length);
    assert.equal((await pool.query('SELECT active_release FROM projects WHERE id=$1',[project.id])).rows[0].active_release,1);
    const customerAgents=(await pool.query('SELECT id,role,policy FROM agents WHERE project_id=$1 ORDER BY role',[project.id])).rows;
    const customerManager=customerAgents.find(a=>a.role==='manager');
    const rootManager=root.agents.find(a=>a.role==='manager');
    const rootBefore=structuredClone(rootManager.policy);
    assert.notEqual(rootManager.id,customerManager.id);
    assert.equal((await send(`/api/admin/root/agents/${customerManager.id}/feedback`,{input:'Please fix platform bug',label:'bug'},alice.cookie)).status,404);
    // Feedback never directly changes active weights; candidates require holdout and explicit promotion.
    assert.equal((await send(`/api/admin/root/agents/${rootManager.id}/feedback`,{input:'Please fix the platform bug',label:'bogus'},alice.cookie)).status,400);
    assert.equal((await send(`/api/admin/root/agents/${randomUUID()}/feedback`,{input:'Please fix the platform bug',label:'bug'},alice.cookie)).status,404);
    for(let i=0;i<6;i++)assert.equal((await send(`/api/admin/root/agents/${rootManager.id}/feedback`,{input:`Please fix platform bug number ${i}`,label:'bug'},alice.cookie)).status,201);
    assert.deepEqual((await pool.query('SELECT policy FROM somas_root_agents WHERE id=$1',[rootManager.id])).rows[0].policy,rootBefore);
    const train=async()=>{
      const response=await send(`/api/admin/root/agents/${rootManager.id}/train`,{},alice.cookie);
      assert.equal(response.status,200,await response.clone().text());return response.json();
    };
    const candidate=await train(),stale=await train();assert.equal(candidate.evaluation.eligible,true);
    assert.equal((await send(`/api/admin/root/policies/${candidate.candidateId}/promote`,{},bob.cookie)).status,403);
    const promoted=await send(`/api/admin/root/policies/${candidate.candidateId}/promote`,{},alice.cookie);
    assert.equal(promoted.status,200,await promoted.clone().text());
    assert.equal((await send(`/api/admin/root/policies/${stale.candidateId}/promote`,{},alice.cookie)).status,409);
    assert.deepEqual((await pool.query('SELECT id,role,policy FROM agents WHERE project_id=$1 ORDER BY role',[project.id])).rows,customerAgents);
    const ineligible=await train();
    await pool.query("UPDATE somas_root_policy_candidates SET evaluation=jsonb_set(evaluation,'{eligible}','false'::jsonb) WHERE id=$1",[ineligible.candidateId]);
    assert.equal((await send(`/api/admin/root/policies/${ineligible.candidateId}/promote`,{},alice.cookie)).status,409);
    const noSnapshot=await train();
    await pool.query("UPDATE somas_root_policy_candidates SET evaluation=evaluation-'rollbackPolicy' WHERE id=$1",[noSnapshot.candidateId]);
    assert.equal((await send(`/api/admin/root/policies/${noSnapshot.candidateId}/promote`,{},alice.cookie)).status,409);
    const beforeRace=(await pool.query('SELECT policy FROM somas_root_agents WHERE id=$1',[rootManager.id])).rows[0].policy;
    const raceA=await train(),raceB=await train();
    const race=await Promise.all([raceA,raceB].map(c=>send(`/api/admin/root/policies/${c.candidateId}/promote`,{},alice.cookie)));
    assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
    const rootAfter=(await pool.query('SELECT policy FROM somas_root_agents WHERE id=$1',[rootManager.id])).rows[0].policy;
    for(let i=0;i<6;i++)assert.equal((await send(`/api/projects/${project.id}/agents/${customerManager.id}/feedback`,{input:`Change the customer design number ${i}`,label:'design'},alice.cookie)).status,201);
    const childTraining=await send(`/api/projects/${project.id}/agents/${customerManager.id}/train`,{},alice.cookie);
    assert.equal(childTraining.status,200);const childCandidate=await childTraining.json();
    assert.equal((await send(`/api/admin/root/policies/${childCandidate.candidateId}/promote`,{},alice.cookie)).status,409);
    assert.equal((await send(`/api/projects/${project.id}/policies/${childCandidate.candidateId}/promote`,{},alice.cookie)).status,200);
    assert.deepEqual((await pool.query('SELECT policy FROM somas_root_agents WHERE id=$1',[rootManager.id])).rows[0].policy,rootAfter);
    const winner=[raceA,raceB][race.findIndex(r=>r.status===200)];
    assert.equal((await send(`/api/admin/root/policies/${winner.candidateId}/rollback`,{},bob.cookie)).status,403);
    const rollback=await send(`/api/admin/root/policies/${winner.candidateId}/rollback`,{},alice.cookie);
    assert.equal(rollback.status,200,await rollback.clone().text());
    const restoredRoot=(await pool.query('SELECT policy FROM somas_root_agents WHERE id=$1',[rootManager.id])).rows[0].policy;
    assert.deepEqual(restoredRoot.weights,beforeRace.weights);assert.deepEqual(restoredRoot.bias,beforeRace.bias);
    assert.ok(restoredRoot.version>rootAfter.version);
    assert.equal((await send(`/api/admin/root/policies/${winner.candidateId}/rollback`,{},alice.cookie)).status,409);
    assert.equal((await send(`/api/projects/${project.id}/policies/${childCandidate.candidateId}/rollback`,{},bob.cookie)).status,404);
    const childRollback=await send(`/api/projects/${project.id}/policies/${childCandidate.candidateId}/rollback`,{},alice.cookie);
    assert.equal(childRollback.status,200,await childRollback.clone().text());
    const restoredChild=(await pool.query('SELECT policy FROM agents WHERE id=$1',[customerManager.id])).rows[0].policy;
    assert.deepEqual(restoredChild.weights,customerManager.policy.weights);
    assert.ok(restoredChild.version>customerManager.policy.version);
    assert.equal((await send(`/api/projects/${project.id}/policies/${childCandidate.candidateId}/rollback`,{},alice.cookie)).status,409);
    const audit=(await pool.query("SELECT actor_id,project_id,metadata FROM audit_events WHERE action='neural_policy_rollback' ORDER BY created_at")).rows;
    assert.equal(audit.length,2);assert.ok(audit.every(row=>row.actor_id===alice.user.id));
    assert.ok(audit.some(row=>row.project_id===null&&row.metadata.scope==='root'));
    await migrate('003_recursive_units.sql');
    await send('/api/admin/root',undefined,alice.cookie);await send(customerPath,undefined,alice.cookie);
    assert.deepEqual((await pool.query('SELECT policy FROM somas_root_agents WHERE id=$1',[rootManager.id])).rows[0].policy,restoredRoot);
    // Database backstops, independent of HTTP or a model's claimed scope.
    const reject=async (query,params,code='23514')=>assert.rejects(pool.query(query,params),error=>error.code===code);
    await reject("INSERT INTO somas_units(id,kind,parent_id,workspace_id,project_id,mission) VALUES($1,'customer',NULL,$2,$3,'Valid mission text')",['customer-'+project.id,aliceWorkspace,project.id]);
    await reject("INSERT INTO somas_units(id,kind,parent_id,workspace_id,project_id,mission) VALUES($1,'customer','somas-root',$2,$3,'Valid mission text')",['customer-'+project.id,bobWorkspace,project.id]);
    await reject("UPDATE somas_units SET workspace_id=$1 WHERE id=$2",[bobWorkspace,'customer-'+project.id]);
    await reject('UPDATE projects SET workspace_id=$1 WHERE id=$2',[bobWorkspace,project.id],'23503');
    await reject('UPDATE somas_evolution_proposals SET target=$1 WHERE id=$2',['somas_platform',customerPlan.id]);
    await reject('UPDATE somas_evolution_proposals SET requested_by=$1 WHERE id=$2',[bob.user.id,customerPlan.id]);
    await reject("UPDATE somas_evolution_proposals SET plan=jsonb_set(plan,'{target}','\"somas_platform\"'::jsonb) WHERE id=$1",[customerPlan.id]);
    // Removing the admin identity revokes all Root planning access without affecting customer sessions.
    delete env.ADMIN_USER_ID;
    assert.equal((await send('/api/admin/root',undefined,alice.cookie)).status,403);
    assert.equal((await send('/api/me',undefined,alice.cookie)).status,200);
  });
});
