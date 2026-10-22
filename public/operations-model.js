/** Rendering model: persisted identities, leases and events only. */
export const displayRole=role=>String(role).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
export function organizationModel(agents,ops,now=Date.now()) {
  const jobs=ops.jobs||[];
  const cards=agents.map(agent=>{
    const own=jobs.filter(q=>q.agent_role===agent.role);
    const current=own.find(q=>q.status==='working')||own.find(q=>q.status==='queued')||own.find(q=>q.status==='waiting')||own[0];
    let state=current?.status||'idle';
    if(state==='working'&&Date.parse(current.lease_until)<=now)state='waiting';
    return {...agent,label:displayRole(agent.role),state,job:current||null};
  });
  const manager=cards.find(a=>a.role==='manager');
  const links=manager?cards.filter(a=>a.id!==manager.id).map(a=>({from:manager.id,to:a.id,role:a.role})):[];
  return {cards,manager,links,events:ops.events||[],running:cards.filter(a=>a.state==='working').length,
    blocked:jobs.filter(q=>q.status==='blocked'||q.status==='failed').length};
}
export function freshCommunicationEvents(events,cursor,now=Date.now()) {
  if(cursor===null)return [];
  return events.filter(e=>Number(e.id)>cursor&&now-Date.parse(e.created_at)<20000&&
    ['task_assigned','execution_completed','message_received','manager_responded'].includes(e.event_type));
}
