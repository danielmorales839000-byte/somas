/** Neon persistence adapter for shared root/customer SOMAS planning and evolution. */
import {CORE_ROLES, newPolicy, normalizeInput} from './agents.js';
import {prepareCandidate, validateTrainingLabel} from './learning.js';
import {rootDescriptor, customerDescriptor, planEvolution, ROOT_ID} from './somas-core.js';
import {candidateEvaluation,releasePolicy} from './policy-releases.js';

const newid = () => crypto.randomUUID();
const asJson = obj => JSON.stringify(obj);

/** Safe to call repeatedly; existing neural weights are never overwritten. */
export function rootUnitStatements(sql) {
  const root = rootDescriptor();
  const statements = [sql`INSERT INTO somas_units(id,kind,parent_id,workspace_id,project_id,mission)
    VALUES (${root.id},'root',NULL,NULL,NULL,${root.mission}) ON CONFLICT(id) DO NOTHING`];
  for (const role of CORE_ROLES) {
    const policy = newPolicy(role);
    statements.push(sql`INSERT INTO somas_root_agents(id,unit_id,role,policy,is_core)
      VALUES (${newid()},${ROOT_ID},${role},${asJson(policy)}::jsonb,true)
      ON CONFLICT(unit_id,role) DO NOTHING`);
  }
  return statements;
}

export async function ensureRootUnit(sql) {
  await sql.transaction(rootUnitStatements(sql));
  return rootDescriptor();
}

export function customerUnitStatements(sql, project) {
  const unit=customerDescriptor(project);
  return [sql`INSERT INTO somas_units(id,kind,parent_id,workspace_id,project_id,mission)
    VALUES (${unit.id},'customer',${ROOT_ID},${unit.workspace_id},${unit.project_id},${unit.mission})
    ON CONFLICT(project_id) DO NOTHING`];
}

/** Caller MUST have already established ownership of the project. */
export async function ensureCustomerUnit(sql, ownedProject, actorId) {
  const unit = customerDescriptor(ownedProject);
  const allowed=await sql`SELECT p.id FROM projects p JOIN workspaces w ON w.id=p.workspace_id
    WHERE p.id=${unit.project_id} AND w.id=${unit.workspace_id} AND w.owner_id=${actorId} LIMIT 1`;
  if(!allowed.length)throw new Error('customer_unit_not_found');
  await sql.transaction([...rootUnitStatements(sql),...customerUnitStatements(sql,ownedProject)]);
  const rows=await sql`SELECT id,kind,parent_id,workspace_id,project_id,mission FROM somas_units
    WHERE project_id=${unit.project_id} AND workspace_id=${unit.workspace_id} LIMIT 1`;
  if (!rows.length) throw new Error('customer_unit_not_found');
  return rows[0];
}

export async function rootAgents(sql) {
  return sql`SELECT id,role,policy,is_core,created_at FROM somas_root_agents WHERE unit_id=${ROOT_ID} ORDER BY is_core DESC,role`;
}

export async function unitPlans(sql, unit, actorId) {
  if(unit.kind==='customer')return sql`SELECT e.id,e.unit_id,e.kind,e.target,e.plan,e.status,e.created_at
    FROM somas_evolution_proposals e JOIN somas_units u ON u.id=e.unit_id
    JOIN workspaces w ON w.id=u.workspace_id WHERE u.id=${unit.id}
    AND u.project_id=${unit.project_id} AND w.id=${unit.workspace_id} AND w.owner_id=${actorId}
    ORDER BY e.created_at DESC LIMIT 40`;
  return sql`SELECT id,unit_id,kind,target,plan,status,created_at FROM somas_evolution_proposals
    WHERE unit_id=${ROOT_ID} ORDER BY created_at DESC LIMIT 40`;
}

/** planEvolution is shared unchanged for Root and Customer. Only storage differs. */
export async function proposeScopedEvolution(sql, {unit, instruction, changeKind, actorId, managerPolicy, target}) {
  const plan = planEvolution(unit,instruction,{changeKind,managerPolicy,target});
  const id=newid();
  const statements=[sql`INSERT INTO somas_evolution_proposals (id,unit_id,requested_by,kind,target,plan)
    VALUES (${id},${unit.id},${actorId},${plan.changeKind},${plan.target},${asJson(plan)}::jsonb)`];
  if (unit.kind==='root') {
    for (const role of plan.team.specialists) {
      statements.push(sql`INSERT INTO somas_root_agents(id,unit_id,role,policy,is_core)
        VALUES (${newid()},${ROOT_ID},${role},${asJson(newPolicy(role))}::jsonb,false)
        ON CONFLICT(unit_id,role) DO NOTHING`);
    }
  } else {
    // Existing customer agents are the canonical store. No duplicate neural weights.
    for (const role of plan.team.specialists) {
      statements.push(sql`INSERT INTO agents(id,project_id,role,name,policy,is_core)
        VALUES (${newid()},${unit.project_id},${role},${role.replaceAll('_',' ')},${asJson(newPolicy(role))}::jsonb,false)
        ON CONFLICT(project_id,role) DO NOTHING`);
    }
  }
  await sql.transaction(statements);
  return {id, ...plan};
}

export async function recordRootFeedback(sql, agentId, actorId, input, label) {
  const agent=(await sql`SELECT id,role FROM somas_root_agents WHERE id=${agentId} AND unit_id=${ROOT_ID} LIMIT 1`)[0];
  if(!agent) throw new Error('root_agent_not_found');
  if(!validateTrainingLabel(agent.role,label)) throw new Error('invalid_training_label');
  const example=normalizeInput(input);
  await sql`INSERT INTO somas_root_learning_examples(id,agent_id,submitted_by,input,label)
    VALUES (${newid()},${agentId},${actorId},${example},${label})`;
  return {recorded:true,trained:false};
}

export async function prepareRootCandidate(sql, agentId) {
  const agent=(await sql`SELECT id,policy FROM somas_root_agents WHERE id=${agentId} AND unit_id=${ROOT_ID} LIMIT 1`)[0];
  if(!agent) throw new Error('root_agent_not_found');
  const examples=await sql`SELECT input,label FROM somas_root_learning_examples WHERE agent_id=${agentId} ORDER BY created_at ASC LIMIT 500`;
  const candidate=prepareCandidate(agent.policy,examples);
  const candidateId=newid();
  await sql`INSERT INTO somas_root_policy_candidates(id,agent_id,base_version,proposed_policy,evaluation)
    VALUES (${candidateId},${agentId},${agent.policy.version},${asJson(candidate.policy)}::jsonb,${asJson(candidateEvaluation(candidate,agent.policy))}::jsonb)`;
  return {candidateId,evaluation:candidate.evaluation,activePolicyUnchanged:true};
}

/** Single SQL statement gate: authorized caller checked by route, evaluation checked in DB. */
export async function promoteRootCandidate(sql, candidateId, actorId) {
  return releasePolicy(sql,{scope:'root',candidateId,actorId});
}
