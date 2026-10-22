/** Pure bootstrap statements shared by atomic provisioning and legacy owner initialization. */
export function initialCriteria(objective) {
  return [{key:'objective_workflows',description:`Verify the application's workflows against: ${objective}`.slice(0,2500),status:'unverified'},
    {key:'independent_application',description:'Application has a separate deployed hostname and verified health',status:'unverified'}];
}
export function missionBootstrapStatements(sql,unit) {
  const id='mission-'+unit.id,jobId=crypto.randomUUID();
  return [sql`WITH added AS (
    INSERT INTO somas_runtime_missions(id,unit_id,objective,criteria,constraints)
    VALUES (${id},${unit.id},${unit.mission},${JSON.stringify(initialCriteria(unit.mission))}::jsonb,
      '{"productionApprovalRequired":true,"externalSpendingAllowed":false,"cadenceHours":24}'::jsonb)
    ON CONFLICT(unit_id) DO NOTHING RETURNING unit_id
  ), initial_job AS (
    INSERT INTO somas_runtime_jobs(id,mission_id,unit_id,kind,agent_role,priority,dedupe_key)
    SELECT ${jobId},${id},unit_id,'assess_mission','manager',50,'initial-assessment' FROM added RETURNING unit_id
  ) INSERT INTO somas_runtime_events(unit_id,event_type,actor_role,status,summary)
    SELECT unit_id,'mission_created','manager','active','Persistent mission recorded; initial assessment queued' FROM initial_job`];
}
