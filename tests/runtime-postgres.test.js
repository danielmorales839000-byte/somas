import test from 'node:test';
import {canonicalJson} from '../src/integrity.js';
import {sha256} from '../src/auth.js';
import assert from 'node:assert/strict';
import {withPostgres} from './helpers/postgres-fixture.js';
import {database} from '../src/database.js';
import worker from '../src/index.js';
import {claimJob,finishJob,heartbeat,missionTick} from '../src/mission-runtime.js';

const uri=process.env.SOMAS_TEST_DATABASE_URL;
test('durable missions: real SQL migration, tenant boundaries, fencing, budgets, conversation and independent artifact',{skip:!uri},async()=>{
  await withPostgres(uri,async({pool,migrate})=>{
    for(const file of ['001_initial.sql','002_operations.sql','003_recursive_units.sql','004_mission_runtime.sql'])await migrate(file);
    await migrate('004_mission_runtime.sql');
    const env={DATABASE_URL:'postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require',PUBLIC_CONTROL_ORIGIN:'https://runtime.test'};
    const sql=database(env),origin='https://runtime.test';
    const send=(path,data,cookie,headers={})=>worker.fetch(new Request(origin+path,{method:data?'POST':'GET',headers:{Origin:origin,'content-type':'application/json','x-somas-request':'1',...(cookie?{Cookie:cookie}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})}),env);
    const register=async email=>{
      const r=await send('/api/auth/register',{email,password:'disposable-runtime-password'});assert.equal(r.status,201);
      return {user:(await r.json()).user,cookie:r.headers.get('set-cookie').split(';')[0]};
    };
    const alice=await register('owner@example.test'),bob=await register('other@example.test');
    const create=async()=>{const r=await send('/api/projects',{title:'Mission Shop',purpose:'Sell locally made furniture with cart and checkout',template:'store'},alice.cookie);assert.equal(r.status,201,await r.clone().text());return (await r.json()).project;};
    const project=await create(),base=`/api/projects/${project.id}`,unitId='customer-'+project.id;
    assert.equal((await send(base+'/operations',undefined,bob.cookie)).status,404);
    assert.equal((await send(base+'/operations/cycle',{},bob.cookie)).status,404);
    assert.equal((await send('/api/admin/overview',undefined,alice.cookie)).status,403);
    const first=await send(base+'/operations',undefined,alice.cookie);assert.equal(first.status,200,await first.clone().text());
    let ops=await first.json();assert.match(ops.mission.objective,/furniture/);assert.ok(ops.mission.criteria.every(c=>c.status==='unverified'));
    const job=await claimJob(sql,{unitId});assert.ok(job);assert.equal(job.status,'working');
    assert.equal(await claimJob(sql,{unitId}),null); // cannot double claim while lease is live
    await assert.rejects(finishJob(sql,{...job,lease_token:'wrong'},{method:'fake'}),/lease_lost/);
    await pool.query("UPDATE somas_runtime_jobs SET lease_until=now()-interval '1 second' WHERE id=$1",[job.id]);
    const retry=await claimJob(sql,{unitId});assert.equal(retry.id,job.id);assert.notEqual(retry.lease_token,job.lease_token);
    await assert.rejects(heartbeat(sql,unitId,job.id,job.lease_token),/lease_lost/);
    await finishJob(sql,retry,{method:'lease_test'});
    const cycle=await send(base+'/operations/cycle',{},alice.cookie);assert.equal(cycle.status,200,await cycle.clone().text());
    ops=await (await send(base+'/operations',undefined,alice.cookie)).json();
    assert.ok(ops.gaps.some(g=>g.gap_key==='objective_workflows'&&g.status==='unverified'));
    assert.ok(ops.jobs.some(q=>q.kind==='code_change'&&q.status==='blocked'));
    assert.ok(ops.jobs.some(q=>q.kind==='browser_journey'&&q.blocker==='external_browser_runner_unavailable'));
    assert.ok(ops.events.some(e=>e.event_type==='execution_completed'));
    const artifact=ops.artifacts.find(a=>a.kind==='application_package');assert.ok(artifact);
    assert.equal((await send(base+'/operations/artifacts/'+artifact.id,undefined,bob.cookie)).status,404);
    const bundle=await (await send(base+'/operations/artifacts/'+artifact.id,undefined,alice.cookie)).json();
    assert.equal(bundle.status,'prepared');assert.equal(bundle.applicationId,project.id);
    assert.equal(bundle.digest,await sha256(canonicalJson(bundle.files)));assert.equal(artifact.digest,await sha256(canonicalJson(bundle)));
    assert.ok(bundle.files['wrangler.json']);assert.ok(bundle.files['src/index.js']);
    assert.ok(!bundle.files['src/index.js'].includes('/manage'));assert.ok(!JSON.stringify(bundle).includes('DATABASE_URL'));
    // Source pinning prevents proposals from overwriting intervening approved updates.
    const request=async message=>{const r=await send(base+'/requests',{message},alice.cookie);assert.equal(r.status,201,await r.clone().text());return (await r.json()).task;};
    const a=await request('Change title to Durable Furniture'),b=await request('Change description to Your local furniture store');
    const approvals=await Promise.all([a,b].map(t=>send(base+'/proposals/'+t.proposalId+'/approve',{},alice.cookie)));
    assert.deepEqual(approvals.map(r=>r.status).sort(),[200,409]);
    const rollback=await send(base+'/releases/1/rollback',{},alice.cookie);assert.equal(rollback.status,200,await rollback.clone().text());
    ops=await (await send(base+'/operations',undefined,alice.cookie)).json();assert.equal(ops.messages.length,4);
    assert.deepEqual(ops.messages.map(m=>m.role),['owner','manager','owner','manager']);
    // An attributed browser report is evidence, not permission to declare the entire mission complete.
    await send(base+'/operations/cycle',{},alice.cookie);
    const issue=await send(base+'/operations/runner-token',{},alice.cookie);assert.equal(issue.status,201);
    const {token}=await issue.json(),headers={authorization:'Bearer '+token};
    const claimed=await send('/api/runner/claim',{},null,headers);assert.equal(claimed.status,200);
    const browser=(await claimed.json()).job;assert.equal(browser.kind,'browser_journey');assert.equal(browser.payload.origin,origin);
    const report=await send('/api/runner/report',{jobId:browser.id,leaseToken:browser.leaseToken,report:{method:'playwright_browser',checks:[{name:'H1',passed:true,evidence:'One heading in Chromium'}]}},null,headers);
    assert.equal(report.status,200,await report.clone().text());const reportedJob=(await report.json()).job;assert.equal(reportedJob.result.missionVerified,false);assert.equal(reportedJob.status,'blocked');assert.equal(reportedJob.blocker,'application_release_changed');
    assert.equal((await send('/api/runner/report',{jobId:browser.id,leaseToken:browser.leaseToken,report:{method:'playwright_browser',checks:[{name:'H1',passed:true,evidence:'duplicate'}]}},null,headers)).status,409);
    // The token has no customer API access and is revoked by rotation.
    assert.equal((await send(base+'/operations',undefined,null,headers)).status,401);
    await send(base+'/operations/runner-token',{},alice.cookie);
    assert.equal((await send('/api/runner/claim',{},null,headers)).status,401);
    // Pause prevents new leases and scheduled activity. Resume and logout retain the mission.
    assert.equal((await send(base+'/operations/settings',{state:'paused',monthlyJobLimit:30},alice.cookie)).status,200);
    assert.equal(await claimJob(sql,{unitId}),null);
    await send(base+'/operations/settings',{state:'active',monthlyJobLimit:30},alice.cookie);
    await request('Change title to Logout Verification');
    await send('/api/auth/logout',{},alice.cookie);
    const tick=await missionTick(env);assert.ok(tick.executions>=1);
    // Database constraint rejects cross-unit job/evidence relationships.
    const loggedIn=await send('/api/auth/login',{email:'owner@example.test',password:'disposable-runtime-password'});
    alice.cookie=loggedIn.headers.get('set-cookie').split(';')[0];
    const other=await create();
    await send(`/api/projects/${other.id}/operations`,undefined,alice.cookie);
    await assert.rejects(pool.query(`INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,status,summary) VALUES($1,$2,'execution_completed','developer','completed','Invalid foreign unit')`,['customer-'+other.id,job.id]),e=>e.code==='23503');
    // Concurrent creation cannot exceed the free plan's three project cap.
    const creations=await Promise.all(Array.from({length:4},()=>send('/api/projects',{title:'Bounded site',purpose:'Test atomic provisioning quota'},alice.cookie)));
    assert.equal(creations.filter(r=>r.status===201).length,1);
    assert.ok(creations.filter(r=>r.status!==201).every(r=>r.status===409));
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM projects')).rows[0].n,3);
    // Root access remains separate from ownership and sees operational metadata only.
    env.ADMIN_USER_ID=alice.user.id;
    const overview=await send('/api/admin/overview',undefined,alice.cookie);assert.equal(overview.status,200);
    assert.ok(!JSON.stringify(await overview.json()).includes('furniture'));
    assert.equal((await send('/api/admin/root/operations',undefined,bob.cookie)).status,403);
    assert.equal((await send(`/api/admin/users/${alice.user.id}/status`,{status:'suspended'},alice.cookie)).status,409);
    assert.equal((await send(`/api/admin/users/${bob.user.id}/status`,{status:'suspended'},alice.cookie)).status,200);
    assert.equal((await send('/api/me',undefined,bob.cookie)).status,401);
    assert.equal((await send('/api/auth/login',{email:'other@example.test',password:'disposable-runtime-password'})).status,403);
    assert.equal((await send(`/api/admin/users/${bob.user.id}/status`,{status:'active'},alice.cookie)).status,200);
    // Budget exhaustion prevents fresh work even after repeated scheduling requests.
    await pool.query('UPDATE somas_runtime_missions SET monthly_job_limit=1 WHERE unit_id=$1',[unitId]);
    const before=(await pool.query('SELECT count(*)::int AS n FROM somas_runtime_jobs WHERE unit_id=$1',[unitId])).rows[0].n;
    await send(base+'/operations/cycle',{},alice.cookie);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM somas_runtime_jobs WHERE unit_id=$1',[unitId])).rows[0].n,before);
  });
});
