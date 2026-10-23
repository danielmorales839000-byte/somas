import {AppError,projectKind} from './domain.mjs';
import {rootDomain,configurePublication,cloud,connection} from './publishing.mjs';
import {isVerified,verificationRequired} from './membership.mjs';
export const ADDRESS_MODES=['new_domain','existing_domain'];
export async function publicationIntent(env,id){return env.DB.prepare('SELECT mode,hostname,auto_publish,status,next_at,last_error,updated FROM publication_intents WHERE project_id=?').bind(id).first()}
export async function requestPublication(env,p,owner,origin,input){
 if(p.scope==='service'||projectKind(p)==='chatroom')throw new AppError('Public hosting supports business websites. Private chatrooms remain in SOMAS.',409);
 const mode=input.mode||'new_domain';if(!ADDRESS_MODES.includes(mode))throw new AppError('Choose a separate root domain for this service.',400,'root_domain_required');
 const hostname=input.hostname?rootDomain(input.hostname,origin):'',db=env.DB;
 const current=await db.prepare('SELECT hostname,address_type,lease_until FROM project_publications WHERE project_id=?').bind(p.id).first();
 if(current&&(current.address_type!==(mode==='workers_dev'?'workers_dev':'custom_domain')||mode!=='workers_dev'&&current.hostname!==hostname))throw new AppError('This project already has a deployment address. Create another project to use a different address.',409);
 if(current?.lease_until>Date.now())throw new AppError('Publishing is in progress. Refresh shortly.',409);
 const pending=await db.prepare('SELECT lease_until FROM publication_intents WHERE project_id=?').bind(p.id).first();if(pending?.lease_until>Date.now())throw new AppError('Address setup is in progress. Refresh shortly.',409);
 const connected=await db.prepare('SELECT owner FROM hosting_connections WHERE owner=?').bind(owner).first();
 const saved=await db.prepare("INSERT INTO publication_intents(project_id,owner,mode,root_origin,hostname,auto_publish,status,next_at,updated) VALUES(?,?,?,?,?,?,?,0,?) ON CONFLICT(project_id) DO UPDATE SET mode=excluded.mode,root_origin=excluded.root_origin,hostname=excluded.hostname,auto_publish=excluded.auto_publish,status=excluded.status,next_at=0,last_error='',updated=excluded.updated WHERE publication_intents.lease_until<?").bind(p.id,owner,mode,origin,hostname,input.autoPublish===false?0:1,!hostname?'needs_domain':connected?'queued':'awaiting_hosting',Date.now(),Date.now()).run();if(!(saved.meta?.changes??saved.changes))throw new AppError('Address setup is in progress. Refresh shortly.',409);
 return publicationIntent(env,p.id);
}
export async function preparePublicationIntent(env,fetcher=fetch,{owner}={}){
 const db=env.DB,now=Date.now(),intent=await db.prepare("SELECT i.* FROM publication_intents i JOIN hosting_connections c ON c.owner=i.owner WHERE i.status IN ('queued','awaiting_hosting','awaiting_domain') AND i.next_at<=? AND i.lease_until<?"+(owner?' AND i.owner=?':'')+' ORDER BY i.next_at,i.updated LIMIT 1').bind(now,now,...(owner?[owner]:[])).first();if(!intent)return null;
 const member=await db.prepare('SELECT * FROM users WHERE id=?').bind(intent.owner).first();if(member?.status==='suspended'||verificationRequired(env)&&(!member||!isVerified(member,env))){await db.prepare("UPDATE publication_intents SET status='blocked',last_error='The owner must be active and verified.' WHERE project_id=?").bind(intent.project_id).run();return null}
 const lock=await db.prepare('UPDATE publication_intents SET lease_until=? WHERE project_id=? AND lease_until<?').bind(now+60000,intent.project_id,now).run();if(!(lock.meta?.changes??lock.changes))return null;
 try{const row=await db.prepare('SELECT data FROM projects WHERE id=? AND owner=?').bind(intent.project_id,intent.owner).first();if(!row)throw new AppError('Project unavailable.',404);
  await configurePublication(env,JSON.parse(row.data),intent.owner,new URL(intent.root_origin).origin,{hostname:intent.hostname,mode:intent.mode,autoPublish:!!intent.auto_publish},fetcher);
  await db.prepare("UPDATE publication_intents SET status='configured',last_error='',next_at=0,updated=? WHERE project_id=?").bind(now,intent.project_id).run();
 }catch(err){const waiting=err.code==='domain_not_ready';await db.prepare('UPDATE publication_intents SET status=?,last_error=?,next_at=?,updated=? WHERE project_id=?').bind(waiting?'awaiting_domain':['hosting_network','hosting_retry'].includes(err.code)?'queued':'needs_attention',err instanceof AppError?err.message:'Setup could not finish. Review Hosting and retry.',now+60000,now,intent.project_id).run()}
 finally{await db.prepare('UPDATE publication_intents SET lease_until=0 WHERE project_id=?').bind(intent.project_id).run()}
 return intent.project_id;
}
export async function checkNewDomain(env,owner,origin,input,fetcher){
 const hostname=rootDomain(input.hostname,origin),c=await connection(env,owner),x=await cloud(c,'/accounts/'+c.account_id+'/registrar/domain-check',{method:'POST',body:{domains:[hostname]}},fetcher),d=x.domains?.find(d=>d.name===hostname);
 if(!d)throw new AppError('Cloudflare returned no availability result. Check again.',502);
 const price=d.pricing,validPrice=v=>typeof v==='string'&&/^\d{1,7}(?:\.\d{1,4})?$/.test(v);
 return {hostname,registrable:d.registrable===true,reason:typeof d.reason==='string'?d.reason.slice(0,120):'',pricing:price&&validPrice(price.registration_cost)&&validPrice(price.renewal_cost)&&/^[A-Z]{3}$/.test(price.currency)?{currency:price.currency,registration:price.registration_cost,renewal:price.renewal_cost}:null,checkedAt:Date.now(),checkoutUrl:'https://dash.cloudflare.com/'+c.account_id+'/domains/registrations'};
}
