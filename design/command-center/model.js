const labels=role=>String(role).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export function dashboardModel(instance,now=Date.now()){
 const ops=instance.operations||{},agents=instance.agents||[],missions=ops.missions||[],jobs=ops.jobs||[];
 const ids=new Set(agents.map(a=>a.id));
 const scopedMissions=missions.filter(m=>!m.unit_id||m.unit_id===instance.id).map(m=>({...m,agent_id:m.agent_id||agents.find(a=>a.role===m.agent_role)?.id})).filter(m=>ids.has(m.agent_id)&&ids.has(m.manager_id));
 const cards=agents.map(agent=>{
  const mission=scopedMissions.find(m=>m.agent_id===agent.id);
  const ownJobs=mission?jobs.filter(j=>j.mission_id===mission.id):[];
  const leased=ownJobs.find(j=>j.state==='leased'),queued=ownJobs.find(j=>j.state==='queued');
  const last=ownJobs[0];
  const state=leased?(!Number.isFinite(Date.parse(leased.lease_until))?'Lease recorded':Date.parse(leased.lease_until)<=now?'Recovering':'Running'):queued?'Queued':mission?.state==='retired'?'Retired':mission?.state==='paused'?'Paused':last?.state==='blocked'||last?.state==='failed'?'Blocked':mission?'Idle':'Not scheduled';
  const label=agent.name&&agent.name!==agent.role.replaceAll('_',' ')?agent.name:labels(agent.role);
  return {...agent,label,mission,ownJobs,state,assignment:leased?.kind||queued?.kind||mission?.objective||'No standing mission recorded',progress:null};
 }).sort((a,b)=>Number(b.role==='manager')-Number(a.role==='manager'));
 const edges=scopedMissions.filter(m=>m.manager_id!==m.agent_id).map(m=>({from:m.manager_id,to:m.agent_id,type:'assignment'}));
 const reports=ops.reports||[],queue=ops.queue||[];
 const feed=[...reports.map(r=>({id:r.id,at:r.created_at,type:'Evidence',text:r.evidence?.summary||r.evidence?.error||r.evidence?.method||'Evidence recorded',agent_id:r.agent_id})),...queue.map(w=>({id:w.id,at:w.created_at,type:'Manager decision',text:w.decision?.action||w.state}))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 return {instance,cards,edges,feed,manager:cards.find(a=>a.role==='manager'),metrics:{agents:cards.length,running:cards.filter(c=>c.state==='Running').length,evidence:reports.length,approvals:(ops.candidates||[]).filter(c=>c.state==='ready').length},jobs};
}
