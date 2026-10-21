/** Shared version/holdout/rollback gates. Only constant table names enter SQL. */
const stores=Object.freeze({
  root:{agents:'somas_root_agents',candidates:'somas_root_policy_candidates'},
  customer:{agents:'agents',candidates:'policy_candidates'},
});

export function candidateEvaluation(candidate,basePolicy){
  return {...candidate.evaluation,rollbackPolicy:structuredClone(basePolicy)};
}

export async function releasePolicy(sql,{scope,candidateId,projectId,actorId,rollback=false}){
  if(!Object.hasOwn(stores,scope))throw new Error('invalid_policy_scope');
  const store=stores[scope];
  const boundary=scope==='root'?"a.unit_id='somas-root'":
    'a.project_id=$2 AND EXISTS(SELECT 1 FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=a.project_id AND w.owner_id=$3)';
  const gate=rollback?
    "c.status='promoted' AND COALESCE((c.evaluation->>'rollbackApplied')::boolean,false)=false AND (c.proposed_policy->>'version')::integer=(a.policy->>'version')::integer":
    "c.status='candidate' AND c.base_version=(a.policy->>'version')::integer AND (c.evaluation->>'eligible')::boolean=true";
  const candidateUpdate=rollback?
    "evaluation=jsonb_set(jsonb_set(c.evaluation,'{rollbackApplied}','true'::jsonb),'{rollbackVersion}',to_jsonb((a.policy->>'version')::integer+1))":
    "status='promoted'";
  const nextPolicy=rollback?
    "jsonb_set(c.evaluation->'rollbackPolicy','{version}',to_jsonb((a.policy->>'version')::integer+1))":
    'c.proposed_policy';
  const auditId=crypto.randomUUID();
  const query=`WITH locked AS MATERIALIZED (
    SELECT a.id,a.policy FROM ${store.agents} a JOIN ${store.candidates} c ON c.agent_id=a.id
    WHERE c.id=$1 AND ${boundary} FOR UPDATE OF a
  ), selected AS (
    UPDATE ${store.candidates} c SET ${candidateUpdate} FROM locked a
    WHERE c.id=$1 AND c.agent_id=a.id AND ${gate}
      AND jsonb_typeof(c.evaluation->'rollbackPolicy')='object'
      AND (c.evaluation->'rollbackPolicy'->>'version')::integer=c.base_version
      AND c.evaluation->'rollbackPolicy'->>'role'=a.policy->>'role'
    RETURNING c.agent_id,${nextPolicy} AS next_policy
  ), active AS (
    UPDATE ${store.agents} a SET policy=s.next_policy FROM selected s
    WHERE a.id=s.agent_id RETURNING a.id,a.policy
  ), logged AS (
    INSERT INTO audit_events(id,actor_id,project_id,action,metadata)
    SELECT ${scope==='root'?'$3':'$4'},${scope==='root'?'$2':'$3'},${scope==='root'?'NULL':'$2'},
      '${rollback?'neural_policy_rollback':'neural_policy_promoted'}',
      jsonb_build_object('scope','${scope}','agentId',id,'candidateId',$1::text,'version',(policy->>'version')::integer)
    FROM active RETURNING id
  ) SELECT id,policy FROM active WHERE EXISTS(SELECT 1 FROM logged)`;
  const rows=await sql.query(query,scope==='root'?[candidateId,actorId,auditId]:[candidateId,projectId,actorId,auditId]);
  if(!rows.length)throw new Error(scope==='root'?'root_policy_not_promotable':'policy_not_promotable');
  return {promoted:!rollback,rolledBack:rollback,agentId:rows[0].id,activeVersion:rows[0].policy.version};
}
