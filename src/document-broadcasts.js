import {resolveBroadcastSender} from './admin-gmail.js';
import {database} from './database.js';
import {accessUser,administrator} from './access.js';
import {json,requireThat,rateLimit} from './community.js';
import {readBoundedText} from './http.js';
import {seal,unseal,sendMail} from './google.js';
import {emailIdentity,campaignInput} from './communications.js';
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(s);
export function documentLimits(env){
 const limit=(value,fallback,max)=>Number.isInteger(Number(value))&&Number(value)>0?Math.min(Number(value),max):fallback;
 return {minute:limit(env.DOCUMENT_EMAILS_PER_MINUTE,30,60),day:limit(env.DOCUMENT_EMAILS_PER_DAY,400,2000)};
}
async function body(req){requireThat(req.headers.get('content-type')?.includes('application/json'),'json_required',415);try{return JSON.parse(await readBoundedText(req,400000));}catch{throw Object.assign(Error('invalid_json'),{status:400});}}
async function ready(sql,env,user,c){requireThat(env.BROADCAST_ENABLED==='true'&&env.BROADCAST_EMAIL_ENABLED==='true','external_email_disabled',409);if(c.sender_user_id)requireThat(c.sender_user_id===user.id,'sender_owner_required',403);const sender=await resolveBroadcastSender(sql,env,user,c.sender_user_id?'personal':'owner');if(c.sender_email)requireThat(sender.email===c.sender_email,'campaign_sender_changed',409);return sender;}
async function limit(sql,key,start,max){const r=await sql`INSERT INTO community_limits(key,window_start,attempts) VALUES(${key},${start},1) ON CONFLICT(key,window_start) DO UPDATE SET attempts=community_limits.attempts+1 WHERE community_limits.attempts<${max} RETURNING attempts`;requireThat(r.length,'document_delivery_limit_reached',429);}
export async function documentBroadcasts(req,env){
 const url=new URL(req.url),path=url.pathname,sql=database(env);
 if(path==='/api/document-email/unsubscribe'){
  requireThat(req.method==='POST','method_not_allowed',405);let p;try{const token=url.searchParams.get('token');requireThat(token&&token.length<4096,'invalid_unsubscribe_link');p=JSON.parse(await unseal(env,token));}catch{throw Object.assign(Error('invalid_unsubscribe_link'),{status:400});}
  requireThat(p.type==='document-unsubscribe'&&/^[a-f0-9]{64}$/.test(p.identity),'invalid_unsubscribe_link');
  await sql`WITH blocked AS (INSERT INTO email_suppressions(identity,reason) VALUES(${p.identity},'unsubscribed') ON CONFLICT(identity) DO NOTHING RETURNING identity),pending AS (UPDATE document_recipients SET status='suppressed',updated_at=now() WHERE identity=${p.identity} AND status='queued' RETURNING identity) UPDATE broadcast_recipients SET status='suppressed',updated_at=now() WHERE identity=${p.identity} AND status IN ('snapshot','queued')`;
  return json({unsubscribed:true});
 }
 const user=await accessUser(req,sql,env);requireThat(user,'unauthenticated',401);requireThat(administrator(user,env),'administrator_required',403);
 requireThat(env.CONTACT_IMPORT_ENABLED==='true'&&env.BROADCAST_ENABLED==='true','document_broadcast_disabled',409);
 if(path==='/api/admin/document-broadcasts'){
  if(req.method==='GET')return json({campaigns:await sql`SELECT id,filename,subject,status,created_at FROM document_campaigns ORDER BY created_at DESC LIMIT 100`,limits:documentLimits(env)});
  requireThat(req.method==='POST','method_not_allowed',405);await rateLimit(sql,'document-draft:'+user.id,20);
  const p=await body(req),input=campaignInput({title:'Document message',channel:'email',subject:p.subject,body:p.body});let r;
  try{r=JSON.parse(await unseal(env,p.token));}catch{throw Object.assign(Error('invalid_preview'),{status:400});}
  requireThat(r.type==='import'&&r.actor===user.id&&r.expires>Date.now()&&Array.isArray(r.emails)&&r.emails.length>0&&r.emails.length<=1000,'preview_expired',409);
  requireThat(!p.sender||['owner','personal'].includes(p.sender),'invalid_sender');const sender=p.sender?await resolveBroadcastSender(sql,env,user,p.sender):{userId:null,email:env.SOMAS_OWNER_EMAIL};const id=crypto.randomUUID(),items=[];for(const email of [...new Set(r.emails)]){const identity=await emailIdentity(env,email);items.push({identity,ciphertext:await seal(env,email),token:await seal(env,JSON.stringify({type:'document-unsubscribe',identity}))});}
  await sql`WITH draft AS (INSERT INTO document_campaigns(id,author_id,filename,subject,body,sender_user_id,sender_email) VALUES(${id}::uuid,${user.id},${r.name},${input.subject},${input.body},${sender.userId},${sender.email||null}) RETURNING id) INSERT INTO document_recipients(campaign_id,identity,ciphertext,unsubscribe_token,status) SELECT d.id,e.identity,e.ciphertext,e.token,CASE WHEN s.identity IS NULL THEN 'queued' ELSE 'suppressed' END FROM draft d CROSS JOIN jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS e(identity text,ciphertext text,token text) LEFT JOIN email_suppressions s ON s.identity=e.identity`;
  return json({id,status:'draft',total:items.length,accountsCreated:0},201);
 }
 const m=path.match(/^\/api\/admin\/document-broadcasts\/([a-f0-9-]+)(?:\/(send|process|cancel))?$/i);requireThat(m&&uuid(m[1]),'not_found',404);const [,id,action]=m;
 const [c]=await sql`SELECT * FROM document_campaigns WHERE id=${id}::uuid`;requireThat(c,'campaign_not_found',404);
 if(!action){requireThat(req.method==='GET','method_not_allowed',405);const rows=await sql`SELECT ciphertext,status,last_error FROM document_recipients WHERE campaign_id=${id}::uuid ORDER BY identity`;const recipients=[];for(const r of rows)recipients.push({email:await unseal(env,r.ciphertext),status:r.status,error:r.last_error});const counts={total:rows.length};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;return json({campaign:c,recipients,counts,limits:documentLimits(env),note:'Accepted means Gmail accepted the message; inbox delivery is not confirmed. Uncertain attempts are never automatically retried.'});}
 requireThat(req.method==='POST','method_not_allowed',405);
 if(action==='cancel'){await sql`WITH stopped AS (UPDATE document_campaigns SET status='cancelled' WHERE id=${id}::uuid AND status IN ('draft','queued','paused') RETURNING id) UPDATE document_recipients SET status='cancelled',updated_at=now() WHERE campaign_id IN (SELECT id FROM stopped) AND status='queued'`;return json({cancelled:true});}
 const sender=await ready(sql,env,user,c);
 if(action==='send'){const p=await body(req);requireThat(p.confirm===true,'confirmation_required');requireThat(['draft','queued','complete','paused'].includes(c.status),'cannot_send',409);
  // Existing uncertain/sending recipients are not reset when resuming a paused queue.
  await sql`UPDATE document_campaigns SET status='queued',started_at=coalesce(started_at,now()) WHERE id=${id}::uuid AND status IN ('draft','paused')`;
  return json({queued:true});
 }
 requireThat(c.status==='queued','campaign_not_queued',409);
 // A worker interrupted after claiming a recipient leaves an honest uncertain state.
 await sql`UPDATE document_recipients SET status='uncertain',last_error='interrupted_send_not_retried',updated_at=now() WHERE campaign_id=${id}::uuid AND status='sending' AND updated_at<now()-interval '2 minutes'`;
 await sql`UPDATE document_recipients SET status='suppressed',updated_at=now() WHERE campaign_id=${id}::uuid AND status='queued' AND identity IN (SELECT identity FROM email_suppressions)`;
 const [pending]=await sql`SELECT identity FROM document_recipients WHERE campaign_id=${id}::uuid AND status='queued' LIMIT 1`;
 if(!pending){await sql`UPDATE document_campaigns SET status='complete' WHERE id=${id}::uuid AND status='queued' AND NOT EXISTS(SELECT 1 FROM document_recipients WHERE campaign_id=${id}::uuid AND status='sending')`;return json({processed:0});}
 const now=new Date(),caps=documentLimits(env);await limit(sql,'document-mail-minute:'+(sender.userId||'owner'),new Date(Math.floor(+now/60000)*60000).toISOString(),caps.minute);await limit(sql,'document-mail-day:'+(sender.userId||'owner'),now.toISOString().slice(0,10)+'T00:00:00Z',caps.day);
 const [job]=await sql`UPDATE document_recipients SET status='sending',updated_at=now() WHERE (campaign_id,identity) IN (SELECT r.campaign_id,r.identity FROM document_recipients r JOIN document_campaigns c ON c.id=r.campaign_id WHERE r.campaign_id=${id}::uuid AND r.status='queued' AND c.status='queued' ORDER BY r.identity FOR UPDATE OF r SKIP LOCKED LIMIT 1) AND status='queued' RETURNING identity,ciphertext,unsubscribe_token`;
 if(!job)return json({processed:0});
 // Recheck withdrawals after claiming; never restore previously suppressed addresses.
 const [blocked]=await sql`SELECT identity FROM email_suppressions WHERE identity=${job.identity}`;
 if(blocked){await sql`UPDATE document_recipients SET status='suppressed',updated_at=now() WHERE campaign_id=${id}::uuid AND identity=${job.identity}`;return json({processed:0,suppressed:1});}
 const link=new URL('/unsubscribe/',url);link.searchParams.set('document','1');link.searchParams.set('token',job.unsubscribe_token);const oneClick=new URL('/api/document-email/unsubscribe',url);oneClick.searchParams.set('token',job.unsubscribe_token);
 try{const provider=await sendMail(sql,env,await unseal(env,job.ciphertext),c.subject,c.body+'\n\nSent by SOMAS.\nStop future messages: '+link.href,oneClick.href,sender);await sql`UPDATE document_recipients SET status='accepted',provider_id=${provider},updated_at=now() WHERE campaign_id=${id}::uuid AND identity=${job.identity}`;return json({processed:1,status:'accepted'});}
 catch(error){const reason=['google_reconnect_required','google_api_not_enabled','google_permission_denied','google_rate_limited'].includes(error.message)?error.message:'provider_acceptance_unconfirmed';await sql`WITH failed AS (UPDATE document_recipients SET status='uncertain',last_error=${reason},updated_at=now() WHERE campaign_id=${id}::uuid AND identity=${job.identity} RETURNING identity) UPDATE document_campaigns SET status='paused' WHERE id=${id}::uuid AND status='queued'`;return json({error:reason==='provider_acceptance_unconfirmed'?'document_delivery_uncertain':reason,processed:1,status:'uncertain',paused:true},502);}
}
