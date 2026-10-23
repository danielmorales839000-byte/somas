import {AppError,text} from './domain.mjs';
export const ROOT_ID='somas-service-root';
export async function syncSubnet(db,p,owner){
 if(p.scope==='service')return;
 if((await db.prepare('SELECT team_runtime FROM project_publications WHERE project_id=?').bind(p.id).first())?.team_runtime)return;
 const report={name:p.name,status:p.status,phase:p.phase,version:p.version,round:p.cycle+1,updated:p.updatedAt};
 await db.prepare('INSERT INTO subnet_links(project_id,owner,last_report,updated) VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET last_report=excluded.last_report,updated=excluded.updated').bind(p.id,owner,JSON.stringify(report),Date.now()).run();
 if(p.site)await db.prepare("UPDATE project_publications SET desired_version=?,status='queued',publish_stage='preflight',next_at=0,attempts=0,last_error='' WHERE project_id=? AND auto_publish=1 AND desired_version<? AND lease_until<?").bind(p.version,p.id,p.version,Date.now()).run();
}
export async function subnetMessages(db,id){return (await db.prepare('SELECT id,direction,message,created FROM subnet_messages WHERE project_id=? ORDER BY created DESC,id DESC LIMIT 30').bind(id).all()).results.reverse()}
export async function sendSubnetMessage(db,id,direction,message,key=crypto.randomUUID()){
 message=text(message,1200,3);
 const link=await db.prepare('SELECT connected FROM subnet_links WHERE project_id=?').bind(id).first();
 if(!link)throw new AppError('Subnet not found.',404);
 if(!link.connected)throw new AppError('Reconnect this Subnet Manager before sending messages.',409);
 const saved=await db.prepare('INSERT OR IGNORE INTO subnet_messages(id,project_id,direction,message,created) VALUES(?,?,?,?,?)').bind(key,id,direction,message,Date.now()).run();if((saved.meta?.changes??saved.changes??0)>0)await db.prepare('UPDATE subnet_links SET updated=? WHERE project_id=?').bind(Date.now(),id).run();
 await db.prepare('DELETE FROM subnet_messages WHERE project_id=? AND id NOT IN (SELECT id FROM subnet_messages WHERE project_id=? ORDER BY created DESC,id DESC LIMIT 100)').bind(id,id).run();
}
export async function rootGuidance(db,id){const link=await db.prepare('SELECT connected FROM subnet_links WHERE project_id=?').bind(id).first();if(!link?.connected)return [];return (await db.prepare("SELECT message,created FROM subnet_messages WHERE project_id=? AND direction='root_to_subnet' ORDER BY created DESC LIMIT 4").bind(id).all()).results}
export async function networkOverview(db){
 return (await db.prepare("SELECT l.project_id,l.owner AS user_id,u.name AS user_name,CASE WHEN h.owner IS NULL THEN 0 ELSE 1 END AS hosting_connected,i.mode AS address_mode,i.status AS setup_status,l.connected,l.last_report,l.updated,t.paused,(SELECT m.message FROM subnet_messages m WHERE m.project_id=l.project_id AND m.direction='subnet_to_root' ORDER BY m.created DESC LIMIT 1) AS manager_report,p.hostname,p.status AS publication_status,p.published_version,p.observed_version,p.last_seen FROM subnet_links l JOIN projects t ON t.id=l.project_id LEFT JOIN users u ON u.id=l.owner LEFT JOIN hosting_connections h ON h.owner=l.owner LEFT JOIN publication_intents i ON i.project_id=l.project_id LEFT JOIN project_publications p ON l.project_id=p.project_id ORDER BY l.updated DESC LIMIT 200").all()).results.map(r=>({...r,rootId:ROOT_ID,report:{...JSON.parse(r.last_report),...(r.paused?{status:'paused'}:{})},last_report:undefined}));
}
export async function deliverReviewedGuidance(db,p){
 for(const [index,report] of p.reports.entries()){
  if(!report.evaluation?.accepted||report.runtimeRejected||report.guidanceDelivered||!report.guidance?.length)continue;
  for(const [i,g] of report.guidance.entries()){
   const link=await db.prepare('SELECT connected FROM subnet_links WHERE project_id=?').bind(g.projectId).first();
   if(link?.connected)await sendSubnetMessage(db,g.projectId,'root_to_subnet',g.message,'root:'+report.id+':'+i);
  }
  // Persist the receipt separately from message retention, while the caller holds the root lease.
  if(db.dialect==='postgres')await db.prepare("UPDATE projects SET data=jsonb_set(data::jsonb,?::text[],'1'::jsonb,true)::text WHERE id=? AND data::jsonb #>> ?::text[]=?").bind(['reports',String(index),'guidanceDelivered'],p.id||ROOT_ID,['reports',String(index),'id'],report.id).run();
  else await db.prepare('UPDATE projects SET data=json_set(data,?,1) WHERE id=? AND json_extract(data,?)=?').bind('$.reports['+index+'].guidanceDelivered',p.id||ROOT_ID,'$.reports['+index+'].id',report.id).run();
  report.guidanceDelivered=true;
 }
}
