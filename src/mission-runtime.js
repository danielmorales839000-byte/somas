import {canonicalJson} from './integrity.js';
/** Durable shared Root/Customer runtime. All public callers provide server-authorized units.
 * SQL leases are fenced; provider absence is a blocker, never a successful execution.
 */
import {database,uuid} from './database.js';
import {newPolicy,virtualCustomerHeuristics} from './agents.js';
import {validateUnit,ROOT_ID} from './somas-core.js';
import {sha256} from './auth.js';
import {readBoundedText} from './http.js';
import {applicationPackage} from './application-package.js';

const j=JSON.stringify;
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export const LOCAL_KINDS=['assess_mission','package_application','research_document'];
export {initialCriteria} from './mission-schema.js';
import {missionBootstrapStatements} from './mission-schema.js';
export async function ensureMission(sql,unit) {
  validateUnit(unit);
  const id='mission-'+unit.id;
  await sql.transaction(missionBootstrapStatements(sql,unit));
  return (await sql`SELECT * FROM somas_runtime_missions WHERE unit_id=${unit.id}`)[0];
}
export async function enqueueJob(sql,mission,{kind,role,dedupeKey,payload={},priority=20,blocker=null}) {
  const id=uuid();
  const results=await sql.transaction([
    sql`SELECT id FROM somas_runtime_missions WHERE id=${mission.id} AND unit_id=${mission.unit_id} FOR UPDATE`,
    sql`INSERT INTO somas_runtime_jobs(id,mission_id,unit_id,kind,agent_role,dedupe_key,payload,priority,status,blocker)
      SELECT ${id},m.id,m.unit_id,${kind},${role},${dedupeKey},${j(payload)}::jsonb,${priority},${blocker?'blocked':'queued'},${blocker}
      FROM somas_runtime_missions m WHERE m.id=${mission.id} AND m.unit_id=${mission.unit_id} AND m.state='active'
        AND (SELECT count(*) FROM somas_runtime_jobs WHERE mission_id=m.id AND created_at>=date_trunc('month',now()))<m.monthly_job_limit
      ON CONFLICT(mission_id,dedupe_key) DO NOTHING RETURNING *`,
    sql`INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,recipient_role,status,summary)
      SELECT unit_id,id,${blocker?'execution_blocked':'task_assigned'},'manager',agent_role,status,${blocker||'Manager assigned '+kind} FROM somas_runtime_jobs WHERE id=${id}`,
    sql`WITH added AS (
      INSERT INTO agents(id,project_id,role,name,policy,is_core)
      SELECT ${uuid()},u.project_id,${role},${role.replaceAll('_',' ')},${j(newPolicy(role))}::jsonb,false
      FROM somas_units u WHERE u.id=${mission.unit_id} AND u.kind='customer' AND EXISTS(SELECT 1 FROM somas_runtime_jobs WHERE id=${id})
      ON CONFLICT(project_id,role) DO NOTHING RETURNING id
    ) INSERT INTO somas_runtime_events(unit_id,event_type,actor_role,status,summary)
      SELECT ${mission.unit_id},'team_changed','manager','completed',${'Specialist added: '+role} FROM added`,
    sql`INSERT INTO somas_root_agents(id,unit_id,role,policy,is_core)
      SELECT ${uuid()},u.id,${role},${j(newPolicy(role))}::jsonb,false FROM somas_units u
      WHERE u.id=${mission.unit_id} AND u.kind='root' AND EXISTS(SELECT 1 FROM somas_runtime_jobs WHERE id=${id})
      ON CONFLICT(unit_id,role) DO NOTHING`
  ]);
  return results[1][0]||null;
}
export async function scheduleAssessment(sql,unit,{priority=30,key}={}) {
  const mission=await ensureMission(sql,unit);
  const pending=(await sql`SELECT * FROM somas_runtime_jobs WHERE mission_id=${mission.id} AND kind='assess_mission' AND status IN ('queued','working','waiting') ORDER BY priority DESC LIMIT 1`)[0];
  if(pending){await sql`UPDATE somas_runtime_jobs SET priority=GREATEST(priority,${priority}) WHERE id=${pending.id}`;return pending;}
  if(!key&&Date.parse(mission.next_assessment_at)>Date.now()&&mission.last_assessed_at)return null;
  return enqueueJob(sql,mission,{kind:'assess_mission',role:'manager',priority,
    dedupeKey:key||'assessment-'+new Date().toISOString().slice(0,10)});
}
export async function claimJob(sql,{unitId,kinds=LOCAL_KINDS}) {
  const token=uuid();
  // Exhaustion is terminal. Expired leases cannot leave a fourth attempt permanently working.
  await sql`WITH exhausted AS (
    UPDATE somas_runtime_jobs SET status='failed',blocker='execution_attempts_exhausted',lease_token=NULL,lease_until=NULL
    WHERE unit_id=${unitId} AND status='working' AND lease_until<=now() AND attempts>=3 RETURNING id,unit_id,agent_role
  ) INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,status,summary)
    SELECT unit_id,id,'execution_failed',agent_role,'failed','Execution lease expired after three attempts' FROM exhausted`;
  const rows=await sql`WITH candidate AS (
    SELECT q.id FROM somas_runtime_jobs q JOIN somas_runtime_missions m ON m.id=q.mission_id
    JOIN somas_units u ON u.id=q.unit_id
    LEFT JOIN projects p ON p.id=u.project_id LEFT JOIN subscriptions s ON s.workspace_id=u.workspace_id
    LEFT JOIN workspaces w ON w.id=u.workspace_id LEFT JOIN users owner ON owner.id=w.owner_id
    WHERE q.unit_id=${unitId} AND q.kind=ANY(${kinds}::text[]) AND m.state='active'
      AND (u.kind='root' OR (p.suspended=false AND s.status IN ('trial','active') AND COALESCE(to_jsonb(owner)->>'account_status','active')='active'))
      AND q.attempts<3 AND q.next_run_at<=now()
      AND (q.status IN ('queued','waiting') OR (q.status='working' AND q.lease_until<=now()))
    ORDER BY q.priority DESC,q.created_at ASC FOR UPDATE OF q SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE somas_runtime_jobs q SET status='working',attempts=attempts+1,lease_token=${token},lease_until=now()+interval '5 minutes',blocker=NULL
    FROM candidate WHERE q.id=candidate.id RETURNING q.*
  ), event AS (
    INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,status,summary)
    SELECT unit_id,id,'execution_started',agent_role,'working','Execution lease acquired' FROM claimed
  ) SELECT * FROM claimed`;
  return rows[0]||null;
}
export async function heartbeat(sql,unitId,jobId,leaseToken) {
  const rows=await sql`UPDATE somas_runtime_jobs SET lease_until=now()+interval '5 minutes'
    WHERE id=${jobId} AND unit_id=${unitId} AND kind='browser_journey' AND lease_token=${leaseToken} AND status='working' AND lease_until>now() RETURNING id`;
  if(!rows.length)fail('lease_lost');
  return {renewed:true};
}
export async function finishJob(sql,job,result,{blocker=null,retry=false}={}) {
  if(j(result).length>60000)fail('result_too_large',413);
  const status=blocker?(retry&&job.attempts<3?'waiting':'blocked'):'completed';
  const rows=await sql`WITH finished AS (
    UPDATE somas_runtime_jobs SET status=${status},result=${j(result)}::jsonb,blocker=${blocker},lease_token=NULL,lease_until=NULL,
      completed_at=CASE WHEN ${status}='completed' THEN now() ELSE NULL END,
      next_run_at=now()+interval '2 minutes'
    WHERE id=${job.id} AND unit_id=${job.unit_id} AND status='working' AND lease_token=${job.lease_token} AND lease_until>now() RETURNING *
  ), event AS (
    INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,recipient_role,status,summary,evidence)
    SELECT unit_id,id,${blocker?'execution_blocked':'execution_completed'},agent_role,'manager',status,
      ${blocker||'Execution result recorded'},${j({method:result.method||'runtime',artifactId:result.artifactId||null})}::jsonb FROM finished
  ) SELECT * FROM finished`;
  if(!rows.length)fail('lease_lost');
  return rows[0];
}
export async function conversation(sql,unitId) {
  return sql`SELECT id,role,content,task_id,created_at FROM (
    SELECT * FROM somas_runtime_messages WHERE unit_id=${unitId} ORDER BY seq DESC LIMIT 60
  ) recent ORDER BY seq`;
}
export async function recordConversation(sql,unitId,instruction,response,taskId) {
  // Pair and events commit together; taskId references a real persisted request, not fabricated work.
  await sql.transaction([
    sql`INSERT INTO somas_runtime_messages(id,unit_id,role,content,task_id) VALUES (${uuid()},${unitId},'owner',${instruction},${taskId}),(${uuid()},${unitId},'manager',${response.slice(0,4000)},${taskId})`,
    sql`INSERT INTO somas_runtime_events(unit_id,event_type,actor_role,recipient_role,status,summary,evidence)
      VALUES (${unitId},'message_received','owner','manager','received','Owner request received',${j({taskId})}::jsonb),
      (${unitId},'manager_responded','manager','owner','waiting','Manager prepared a response and task record',${j({taskId})}::jsonb)`
  ]);
}
export async function operations(sql,unit) {
  const mission=await ensureMission(sql,unit);
  const [jobs,events,gaps,messages,artifacts]=await Promise.all([
    sql`SELECT id,kind,agent_role,priority,status,blocker,attempts,lease_until,created_at,completed_at,result FROM somas_runtime_jobs WHERE unit_id=${unit.id} ORDER BY created_at DESC LIMIT 60`,
    sql`SELECT id,event_type,actor_role,recipient_role,status,summary,evidence,job_id,created_at FROM somas_runtime_events WHERE unit_id=${unit.id} ORDER BY id DESC LIMIT 80`,
    sql`SELECT gap_key,title,status,evidence,updated_at FROM somas_runtime_gaps WHERE mission_id=${mission.id} ORDER BY updated_at DESC LIMIT 40`,
    conversation(sql,unit.id),
    sql`SELECT id,kind,digest,job_id,created_at FROM somas_runtime_artifacts WHERE unit_id=${unit.id} ORDER BY created_at DESC LIMIT 20`
  ]);
  return {mission,jobs,events,gaps,messages,artifacts,capabilities:{local:LOCAL_KINDS,browser:'scoped_external_runner',coding:'provider_not_configured',deployment:'package_only'}};
}
async function saveArtifact(sql,job,kind,body) {
  const id=uuid(),digest=await sha256(canonicalJson(body));
  // Fence artifact writes as well as completion; late or expired workers cannot publish evidence.
  const rows=await sql`INSERT INTO somas_runtime_artifacts(id,unit_id,job_id,kind,digest,body)
    SELECT ${id},unit_id,id,${kind},${digest},${j(body)}::jsonb FROM somas_runtime_jobs
    WHERE id=${job.id} AND unit_id=${job.unit_id} AND lease_token=${job.lease_token} AND lease_until>now() AND status='working' RETURNING id`;
  if(!rows.length)fail('lease_lost');
  return id;
}
async function gap(sql,mission,key,title,status,evidence) {
  await sql`INSERT INTO somas_runtime_gaps(id,mission_id,gap_key,title,status,evidence)
    VALUES (${uuid()},${mission.id},${key},${title},${status},${j(evidence)}::jsonb)
    ON CONFLICT(mission_id,gap_key) DO UPDATE SET title=EXCLUDED.title,status=EXCLUDED.status,evidence=EXCLUDED.evidence,updated_at=now()`;
}
async function executeAssessment(sql,job,env) {
  const mission=(await sql`SELECT * FROM somas_runtime_missions WHERE id=${job.mission_id}`)[0];
  const unit=(await sql`SELECT * FROM somas_units WHERE id=${job.unit_id}`)[0];
  if(unit.kind==='root') {
    // Root reads service metadata only. No customer objective, spec, conversation or research is read.
    const counts=(await sql`SELECT count(*)::int AS instances,count(*) FILTER(WHERE suspended)::int AS suspended FROM projects`)[0];
    const report={method:'platform_metadata',counts,summary:'Platform instance metadata assessed; service changes require engineering and operator approval'};
    await gap(sql,mission,'platform_verification','Hosted service quality and operational integrations require verification','unverified',{method:'source_requirement',scope:'somas_platform'});
    return {...report,artifactId:await saveArtifact(sql,job,'assessment',report)};
  }
  const project=(await sql`SELECT p.* FROM projects p WHERE p.id=${unit.project_id} AND p.workspace_id=${unit.workspace_id}`)[0];
  if(!project||project.suspended)fail('instance_unavailable');
  const requests=await sql`SELECT id,prompt,status FROM tasks WHERE project_id=${project.id} AND status IN ('needs_engineering','proposed') ORDER BY created_at DESC LIMIT 30`;
  for(const request of requests)await gap(sql,mission,'owner-request-'+request.id,request.prompt.slice(0,200),request.status==='needs_engineering'?'blocked':'open',{taskId:request.id,priority:'explicit_owner_request',reason:request.status==='needs_engineering'?'isolated_coding_provider_not_configured':'owner_release_approval_required'});
  await sql`UPDATE somas_runtime_missions SET requirements=${j(requests.map(r=>({taskId:r.id,requirement:r.prompt,status:r.status})))}::jsonb WHERE id=${mission.id}`;
  const findings=virtualCustomerHeuristics(project.spec);
  for(const finding of findings)await gap(sql,mission,'static-'+finding.kind+'-'+(await sha256(finding.title)).slice(0,12),finding.title,'open',{method:'static_heuristic',release:project.active_release,evidence:finding.evidence});
  await gap(sql,mission,'objective_workflows','Validate actual business workflows against the original objective','unverified',{objective:mission.objective,method:'mission_comparison',reason:'A content template alone does not prove the requested workflow works'});
  await gap(sql,mission,'independent_application','Deploy the application on an independent hostname','blocked',{reason:'deployment_provider_not_configured',release:project.active_release});
  await enqueueJob(sql,mission,{kind:'package_application',role:'developer',dedupeKey:'package-release-'+project.active_release,payload:{release:project.active_release},priority:25});
  if(env.ENABLE_EXTERNAL_RESEARCH==='true'&&findings.length)await enqueueJob(sql,mission,{kind:'research_document',role:'researcher',dedupeKey:'research-accessibility-release-'+project.active_release,payload:{source:'https://developer.mozilla.org/en-US/docs/Web/Accessibility',reason:'Investigate accessibility guidance while assessing current content gaps'},priority:15});
  const activeRunner=(await sql`SELECT token_hash FROM somas_runtime_runner_tokens WHERE unit_id=${unit.id} AND revoked=false AND expires_at>now() LIMIT 1`).length>0;
  const origin=env.PUBLIC_CONTROL_ORIGIN;
  await enqueueJob(sql,mission,{kind:'browser_journey',role:'virtual_customer',dedupeKey:'browser-release-'+project.active_release,
    payload:{release:project.active_release,path:'/s/'+project.slug,origin:origin||null},priority:40,
    blocker:!origin?'public_control_origin_not_configured':!activeRunner?'external_browser_runner_unavailable':null});
  await enqueueJob(sql,mission,{kind:'code_change',role:'developer',dedupeKey:'implement-objective-release-'+project.active_release,
    payload:{release:project.active_release,objective:mission.objective,ownerRequests:requests},priority:requests.length?100:35,blocker:'isolated_coding_provider_not_configured'});
  const report={method:'static_mission_assessment',release:project.active_release,findings,
    summary:'Compared stored objective with typed application and recorded unverified workflows; no browser or code execution claimed'};
  const artifactId=await saveArtifact(sql,job,'assessment',report);
  await sql`UPDATE somas_runtime_missions SET last_assessed_at=now(),next_assessment_at=now()+interval '24 hours',capabilities=${j([{kind:'content_template',release:project.active_release,verification:'source_inventory'}])}::jsonb WHERE id=${mission.id}`;
  await sql`INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,status,summary,evidence)
    VALUES (${unit.id},${job.id},'mission_assessed','manager','waiting','Mission gaps recorded; workflows remain unverified',${j({artifactId,method:report.method})}::jsonb)`;
  return {...report,artifactId};
}
export async function runLocalJobs(sql,unitId,env={},limit=2) {
  let ran=0;
  for(let i=0;i<Math.min(limit,3);i++) {
    const job=await claimJob(sql,{unitId});if(!job)break;
    try {
      let result;
      if(job.kind==='assess_mission')result=await executeAssessment(sql,job,env);
      else if(job.kind==='research_document') {
        if(env.ENABLE_EXTERNAL_RESEARCH!=='true')fail('external_research_disabled');
        const source='https://developer.mozilla.org/en-US/docs/Web/Accessibility';
        const response=await fetch(source,{redirect:'error',signal:AbortSignal.timeout(6000),headers:{accept:'text/html'}});
        if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))fail('research_source_unavailable');
        const text=await readBoundedText(response,130000);
        const excerpt=text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,1500);
        const sourceId=uuid();
        await sql`INSERT INTO research_sources(id,project_id,url,title,excerpt)
          SELECT ${sourceId},u.project_id,${source},'MDN accessibility guidance',${excerpt} FROM somas_units u
          JOIN somas_runtime_jobs q ON q.unit_id=u.id WHERE q.id=${job.id} AND q.lease_token=${job.lease_token} AND q.lease_until>now() AND u.kind='customer'`;
        result={method:'allowlisted_document_research',sourceId,source,reason:job.payload.reason,trained:false,deployed:false};
      } else {
        const project=(await sql`SELECT p.* FROM projects p JOIN somas_units u ON u.project_id=p.id AND u.workspace_id=p.workspace_id WHERE u.id=${unitId}`)[0];
        if(!project||project.active_release!==job.payload.release)fail('application_release_changed');
        const body=await applicationPackage(project);
        result={method:'typed_application_packager',artifactId:await saveArtifact(sql,job,'application_package',body),digest:body.digest,sourceRelease:body.sourceRelease,deployed:false};
      }
      await finishJob(sql,job,result);ran++;
    } catch(e) {
      // Static codes only. SQL/provider exception text must never enter the activity stream.
      if(e.message==='lease_lost')continue;
      await finishJob(sql,job,{method:'runtime',error:'execution_unavailable'},{blocker:e.message==='application_release_changed'?'application_release_changed':'execution_unavailable',retry:e.message!=='application_release_changed'});
    }
  }
  return {executions:ran};
}
export async function missionTick(env) {
  const sql=database(env);
  // Existing projects are backfilled into missions by owner access, never globally inspected by Root.
  const units=await sql`SELECT u.* FROM somas_units u JOIN somas_runtime_missions m ON m.unit_id=u.id
    LEFT JOIN projects p ON p.id=u.project_id LEFT JOIN subscriptions s ON s.workspace_id=u.workspace_id
    LEFT JOIN workspaces w ON w.id=u.workspace_id LEFT JOIN users owner ON owner.id=w.owner_id
    WHERE m.state='active' AND (m.next_assessment_at<=now() OR EXISTS(SELECT 1 FROM somas_runtime_jobs q WHERE q.unit_id=u.id AND q.kind IN ('assess_mission','package_application','research_document') AND q.status IN ('queued','waiting','working')))
      AND (u.kind='root' OR (p.suspended=false AND s.status IN ('trial','active') AND COALESCE(to_jsonb(owner)->>'account_status','active')='active'))
    ORDER BY m.next_assessment_at LIMIT 3`;
  let executions=0;
  for(const unit of units) {
    await scheduleAssessment(sql,unit);
    executions+=(await runLocalJobs(sql,unit.id,env)).executions;
    // Fairness even when monthly budget is exhausted; no tight retry loops.
    await sql`UPDATE somas_runtime_missions SET next_assessment_at=now()+interval '24 hours' WHERE unit_id=${unit.id} AND next_assessment_at<=now()`;
  }
  return {units:units.length,executions};
}
export async function configureMission(sql,unit,settings) {
  if(!['active','paused'].includes(settings.state)||!Number.isInteger(settings.monthlyJobLimit)||settings.monthlyJobLimit<1||settings.monthlyJobLimit>100)fail('invalid_mission_settings',400);
  const mission=await ensureMission(sql,unit);
  await sql.transaction([
    sql`UPDATE somas_runtime_missions SET state=${settings.state},monthly_job_limit=${settings.monthlyJobLimit} WHERE id=${mission.id}`,
    sql`INSERT INTO somas_runtime_events(unit_id,event_type,actor_role,status,summary) VALUES (${unit.id},'mission_updated','owner',${settings.state},'Mission execution state and bounded job allowance updated')`
  ]);
  return {updated:true};
}
export async function issueBrowserToken(sql,unit,hash,actorId) {
  await sql.transaction([
    sql`INSERT INTO audit_events(id,actor_id,project_id,action,metadata) VALUES (${uuid()},${actorId},${unit.project_id},'runtime_browser_credential_issued',${j({scope:'browser_journey',expiresInSeconds:3600})}::jsonb)`,
    sql`UPDATE somas_runtime_runner_tokens SET revoked=true WHERE unit_id=${unit.id}`,
    sql`INSERT INTO somas_runtime_runner_tokens(token_hash,unit_id,expires_at) VALUES (${hash},${unit.id},now()+interval '1 hour')`,
    sql`UPDATE somas_runtime_jobs SET status='queued',blocker=NULL WHERE unit_id=${unit.id} AND kind='browser_journey' AND status='blocked' AND blocker='external_browser_runner_unavailable' AND payload->>'origin' IS NOT NULL`
  ]);
}
export async function completeBrowserJob(sql,unitId,jobId,leaseToken,report) {
  // This is an attributed external report, not a trusted arbitrary success/mission-completion claim.
  if(report?.method!=='playwright_browser'||!Array.isArray(report.checks)||report.checks.length<1||report.checks.length>20||!report.checks.every(c=>typeof c.name==='string'&&c.name.length<=100&&typeof c.passed==='boolean'&&typeof c.evidence==='string'&&c.evidence.length<=500))fail('invalid_browser_report',400);
  const job=(await sql`SELECT * FROM somas_runtime_jobs WHERE id=${jobId} AND unit_id=${unitId} AND kind='browser_journey' AND status='working' AND lease_token=${leaseToken} AND lease_until>now()`)[0];
  if(!job)fail('lease_lost');
  const project=(await sql`SELECT p.active_release FROM projects p JOIN somas_units u ON u.project_id=p.id WHERE u.id=${unitId}`)[0];
  if(project?.active_release!==job.payload.release)return finishJob(sql,job,{method:'playwright_browser',error:'application_release_changed',missionVerified:false},{blocker:'application_release_changed'});
  const body={method:report.method,checks:report.checks,source:'scoped_external_runner',testedRelease:job.payload.release};
  const artifactId=await saveArtifact(sql,job,'browser_report',body);
  const passed=report.checks.every(c=>c.passed);
  const mission=(await sql`SELECT * FROM somas_runtime_missions WHERE id=${job.mission_id}`)[0];
  for(const check of report.checks.filter(c=>!c.passed))await gap(sql,mission,'browser-'+(await sha256(check.name)).slice(0,12),check.name,'open',{method:'playwright_browser',artifactId,release:job.payload.release,evidence:check.evidence,source:'scoped_external_runner'});
  await sql`INSERT INTO somas_runtime_events(unit_id,job_id,event_type,actor_role,recipient_role,status,summary,evidence)
    VALUES (${unitId},${jobId},'browser_reported','virtual_customer','manager',${passed?'completed':'blocked'},${passed?'Browser smoke checks reported; full mission remains unverified':'Browser runner reported failing checks'},${j({artifactId,passed,method:'playwright_browser'})}::jsonb)`;
  return finishJob(sql,job,{method:'playwright_browser',artifactId,passed,missionVerified:false});
}
