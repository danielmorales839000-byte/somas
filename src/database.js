import {neon} from '@neondatabase/serverless';
import {newPolicy,CORE_ROLES} from './agents.js';
import {missionBootstrapStatements} from './mission-schema.js';
import {customerDescriptor} from './somas-core.js';
import {rootUnitStatements,customerUnitStatements} from './somas-units.js';
const id=()=>crypto.randomUUID();
export function database(env){
  if(!env.DATABASE_URL)throw new Error('missing_database_url');
  return neon(env.DATABASE_URL);
}
export const uuid=id;
export async function getUserFromSession(sql,hash){
  const rows=await sql`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hash} AND s.expires_at>now() AND COALESCE(to_jsonb(u)->>'account_status','active')='active' LIMIT 1`;
  return rows[0]||null;
}
export async function createUser(sql,email,passwordHash){
  const userId=id(), workspaceId=id();
  await sql.transaction([
    sql`INSERT INTO users (id,email,password_hash) VALUES (${userId},${email},${passwordHash})`,
    sql`INSERT INTO workspaces (id,owner_id,name) VALUES (${workspaceId},${userId},${email.split('@')[0] + "'s workspace"})`,
    sql`INSERT INTO subscriptions (workspace_id,plan,status) VALUES (${workspaceId},'free','trial')`
  ]);
  return {id:userId,email,workspaceId};
}
export async function createSession(sql,userId,tokenHash){
  await sql`INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (${tokenHash},${userId},now()+interval '7 days')`;
}
export async function getSubscription(sql,userId){
  const rows=await sql`SELECT s.* FROM subscriptions s JOIN workspaces w ON w.id=s.workspace_id WHERE w.owner_id=${userId} LIMIT 1`;
  return rows[0]||null;
}
export async function listProjects(sql,userId){
  return await sql`SELECT p.id,p.slug,p.title,p.purpose,p.active_release,p.suspended,p.created_at FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE w.owner_id=${userId} ORDER BY p.created_at DESC LIMIT 100`;
}
export async function ownedProject(sql,userId,projectId){
  const rows=await sql`SELECT p.* FROM projects p JOIN workspaces w ON p.workspace_id=w.id WHERE p.id=${projectId} AND w.owner_id=${userId} LIMIT 1`;
  return rows[0]||null;
}
export async function publicProject(sql,slug){
  const rows=await sql`SELECT p.id,p.slug,p.title,p.spec,p.suspended,p.active_release FROM projects p WHERE p.slug=${slug} LIMIT 1`;
  return rows[0]||null;
}
export async function provisionProject(sql,userId,{title,purpose,slug,spec}){
  const w=await sql`SELECT w.id FROM workspaces w JOIN subscriptions s ON s.workspace_id=w.id WHERE w.owner_id=${userId} AND s.status IN ('trial','active') LIMIT 1`;
  if(!w.length)throw new Error('subscription_not_active');
  const c=await sql`SELECT COUNT(*)::int as total FROM projects WHERE workspace_id=${w[0].id}`;
  if(c[0].total>=3)throw new Error('free_project_limit_3');
  const pid=id();
  const agents=CORE_ROLES.map(role=>({id:id(),role,policy:newPolicy(role)}));
  const inserts=[
    ...rootUnitStatements(sql),
    sql`INSERT INTO projects (id,workspace_id,slug,title,purpose,spec) VALUES (${pid},${w[0].id},${slug},${title},${purpose},${JSON.stringify(spec)}::jsonb)`,
    sql`INSERT INTO releases (id,project_id,version,spec,source) VALUES (${id()},${pid},1,${JSON.stringify(spec)}::jsonb,'initial_provision')`
  ];
  for(const agent of agents)inserts.push(sql`INSERT INTO agents (id,project_id,role,name,policy,is_core) VALUES (${agent.id},${pid},${agent.role},${agent.role.replace('_',' ')},${JSON.stringify(agent.policy)}::jsonb,true)`);
  inserts.push(sql`INSERT INTO audit_events (id,actor_id,project_id,action) VALUES (${id()},${userId},${pid},'instance_provisioned')`);
  inserts.push(...customerUnitStatements(sql,{id:pid,workspace_id:w[0].id,purpose}));
  inserts.push(...missionBootstrapStatements(sql,customerDescriptor({id:pid,workspace_id:w[0].id,purpose})));
  try{await sql.transaction(inserts);}catch(e){if(e.code==='P0001')throw Object.assign(new Error('free_project_limit_3'),{status:409});throw e;}
  return {id:pid,slug,title,purpose,coreAgents:agents.map(({id,role})=>({id,role}))};
}
export async function projectAgents(sql,projectId){
  return await sql`SELECT id,role,name,is_core,policy,created_at FROM agents WHERE project_id=${projectId} ORDER BY is_core DESC,role ASC`;
}
export async function reserveQuota(sql,userId,kind,limit){
  if(limit<=0)return false;
  const month=new Date().toISOString().slice(0,7);
  const rows=await sql`INSERT INTO usage_counters (user_id,month,kind,used) VALUES (${userId},${month},${kind},1)
    ON CONFLICT (user_id,month,kind) DO UPDATE SET used=usage_counters.used+1
    WHERE usage_counters.used<${limit} RETURNING used`;
  return rows.length===1;
}
export async function usageSummary(sql,userId){
  const month=new Date().toISOString().slice(0,7);
  return await sql`SELECT kind,used FROM usage_counters WHERE user_id=${userId} AND month=${month}`;
}
export async function createTaskWithProposal(sql,userId,projectId,text,team,revision,baseRelease){
  if(!Number.isInteger(baseRelease)||baseRelease<1)throw new Error('source_release_required');
  const taskId=id(), proposalId=id(); const kind=revision.supported?'structured_site_update':'needs_engineering';
  const statements=[
    sql`INSERT INTO tasks (id,project_id,submitted_by,prompt,category,team,status) VALUES (${taskId},${projectId},${userId},${text},${team.category},${JSON.stringify(team)}::jsonb,${revision.supported?'proposed':'needs_engineering'})`,
    sql`INSERT INTO proposals (id,project_id,task_id,kind,proposed_spec,reason,base_release) VALUES (${proposalId},${projectId},${taskId},${kind},${revision.nextSpec?JSON.stringify(revision.nextSpec):null}::jsonb,${revision.reason},${baseRelease})`
  ];
  for(const role of team.specialists)statements.push(sql`INSERT INTO agents (id,project_id,role,name,policy,is_core) VALUES (${id()},${projectId},${role},${role.replaceAll('_',' ')},${JSON.stringify(newPolicy(role))}::jsonb,false) ON CONFLICT (project_id,role) DO NOTHING`);
  await sql.transaction(statements);
  return {taskId,proposalId,kind,team,reason:revision.reason};
}
export async function listProposals(sql,projectId){
  return await sql`SELECT p.id,p.kind,p.reason,p.status,p.proposed_spec,p.created_at,t.prompt,t.team,t.category FROM proposals p JOIN tasks t ON t.id=p.task_id WHERE p.project_id=${projectId} ORDER BY p.created_at DESC LIMIT 40`;
}
export async function approveProposal(sql,projectId,proposalId,actorId){
  const releaseId=id();
  const results=await sql.transaction([
    sql`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`,
    sql`WITH accepted AS (
     UPDATE proposals SET status='approved' WHERE id=${proposalId} AND project_id=${projectId} AND status='pending' AND kind='structured_site_update' AND base_release=(SELECT active_release FROM projects WHERE id=${projectId}) AND EXISTS(SELECT 1 FROM projects WHERE id=${projectId} AND suspended=false) RETURNING proposed_spec,task_id
    ), deployed AS (
      UPDATE projects SET spec=(SELECT proposed_spec FROM accepted),active_release=active_release+1
      WHERE id=${projectId} AND suspended=false AND EXISTS(SELECT 1 FROM accepted)
      RETURNING id,active_release,spec
    ), history AS (
      INSERT INTO releases (id,project_id,version,spec,source) SELECT ${releaseId},id,active_release,spec,'approved_proposal' FROM deployed RETURNING version
    ), task_update AS (
      UPDATE tasks SET status='released' WHERE id IN (SELECT task_id FROM accepted) AND EXISTS(SELECT 1 FROM deployed) RETURNING id
    ), runtime_event AS (
      INSERT INTO somas_runtime_events(unit_id,event_type,actor_role,recipient_role,status,summary,evidence)
      SELECT 'customer-'||id,'release_recorded','owner','manager','completed','Approved content release recorded',jsonb_build_object('version',active_release,'method','typed_spec_release') FROM deployed
    ), audit AS (
      INSERT INTO audit_events(id,actor_id,project_id,action,metadata)
      SELECT ${id()},${actorId},id,'release_approved',jsonb_build_object('version',active_release) FROM deployed
    ) SELECT version FROM history`
  ]);
  const rows=results[1];
  if(!rows.length)throw new Error('proposal_not_approvable');
  return {version:rows[0].version};
}
export async function listReleases(sql,projectId){return await sql`SELECT id,version,source,created_at FROM releases WHERE project_id=${projectId} ORDER BY version DESC LIMIT 30`;}
export async function rollbackRelease(sql,projectId,oldVersion,actorId){
  const releaseSource=`rollback_from_${oldVersion}`;
  const rows=await sql`WITH source AS (SELECT spec FROM releases WHERE project_id=${projectId} AND version=${oldVersion}),
    activated AS (UPDATE projects SET spec=(SELECT spec FROM source),active_release=active_release+1 WHERE id=${projectId} AND suspended=false AND EXISTS(SELECT 1 FROM source) RETURNING id,active_release,spec),
    logged AS (INSERT INTO releases(id,project_id,version,spec,source) SELECT ${id()},id,active_release,spec,${releaseSource} FROM activated RETURNING version)
    , runtime_event AS (INSERT INTO somas_runtime_events(unit_id,event_type,actor_role,status,summary,evidence)
      SELECT 'customer-'||id,'release_recorded','owner','completed','Approved content rollback recorded',jsonb_build_object('version',active_release,'sourceVersion',${oldVersion}::integer) FROM activated),
    audit AS (INSERT INTO audit_events(id,actor_id,project_id,action) SELECT ${id()},${actorId},id,'rollback_approved' FROM activated)
    SELECT version FROM logged`;
  if(!rows.length)throw new Error('release_not_found');
  return {version:rows[0].version};
}
export async function recordFindings(sql,projectId,items,method='static_heuristic'){
  if(items.length){await sql.transaction(items.map(f=>sql`INSERT INTO findings(id,project_id,severity,kind,title,evidence,method) VALUES (${id()},${projectId},${f.severity},${f.kind},${f.title},${f.evidence},${method})`));}
  return items.length;
}
export async function listFindings(sql,projectId){return await sql`SELECT id,severity,kind,title,evidence,method,created_at FROM findings WHERE project_id=${projectId} ORDER BY created_at DESC LIMIT 40`;}
