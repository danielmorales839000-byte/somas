import {fixedEndpointFetch} from './http.mjs';
import {AppError} from './domain.mjs';
import {seal,unseal} from './provider.mjs';
import {sendGmail} from './gmail-mail.mjs';
export const OWNER_EMAIL='williamkevin999999@gmail.com';
// A user-controlled mail client sends this draft. Opening it is not delivery.
export function opinionEmailDraft(user,message){
 const subject='SOMAS opinion';
 const body='Opinion from '+user.name+' ('+user.email+')\r\n\r\n'+message;
 return {url:'mailto:'+OWNER_EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body),senderEmail:user.email,recipient:OWNER_EMAIL,requiresSend:true};
}
const changed=r=>(r.meta?.changes??r.changes??0)>0;
const normalize=email=>String(email||'').trim().toLowerCase();
export const verificationRequired=env=>env.EMAIL_VERIFICATION_REQUIRED!=='false';
export const mailReady=env=>!!(env.APP_DATA_KEY&&((env.RESEND_API_KEY&&env.MAIL_FROM)||(env.GMAIL_SENDER?.refreshToken&&env.GMAIL_SENDER?.clientId&&env.GMAIL_SENDER?.clientSecret)));
export async function profile(req,env){
 const id=req.headers.get('oai-authenticated-user-id'),email=String(req.headers.get('oai-authenticated-user-email')||'').trim();
 let name=req.headers.get('oai-authenticated-user-full-name')||email.split('@')[0]||'User '+id.slice(0,6);
 if(req.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name)}catch{}}
 const now=Date.now();
 await env.DB.prepare('INSERT INTO users(id,name,email,joined,last_seen) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,last_seen=excluded.last_seen,verified_email=CASE WHEN users.email=excluded.email THEN users.verified_email ELSE NULL END,email_verified_at=CASE WHEN users.email=excluded.email THEN users.email_verified_at ELSE 0 END').bind(id,name.slice(0,100),email.slice(0,250),now,now).run();
 return env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
}
export const ownerIdentity=(user,env)=>!!(env.SOMAS_ADMIN_USER_ID&&user?.id===env.SOMAS_ADMIN_USER_ID&&user.status==='active');
export const verificationAddress=(user,env)=>ownerIdentity(user,env)?OWNER_EMAIL:user.email;
export function mailboxVerified(user,env){return !!(user?.email_verified_at&&user.verified_email===verificationAddress(user,env))}
export function isVerified(user,env){return !verificationRequired(env)||mailboxVerified(user,env)||!!(user?.id&&env.oauthUserId===user.id&&!ownerIdentity(user,env))}
export function ownerAccount(user,env){return !!(ownerIdentity(user,env)&&normalize(user.verified_email)===OWNER_EMAIL&&isVerified(user,env))}
export function managerAccount(user,env){return ownerAccount(user,env)||!!(user?.role==='manager'&&user.status==='active'&&isVerified(user,env))}
export async function recordActivity(db,actor,action,resource='',status=200){await db.prepare('INSERT INTO activity(id,actor,action,resource,status,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action.slice(0,80),String(resource).slice(0,160),status,Date.now()).run()}
const bytes=s=>new TextEncoder().encode(s);
async function signingKey(env){if(!env.APP_DATA_KEY)throw new AppError('Email security is not configured.',503,'email_not_configured');return crypto.subtle.importKey('raw',bytes(env.APP_DATA_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function codeHash(env,id,code){return [...new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env),bytes(id+'|'+code)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
function code(){const n=new Uint32Array(1);do{crypto.getRandomValues(n)}while(n[0]>=4200000000);return String(n[0]%100000000).padStart(8,'0')}
export async function enqueueMail(env,{id=crypto.randomUUID(),to,subject,text,kind,expires=0,replyTo}){
 if(!env.APP_DATA_KEY)return {id:null,status:'not_configured'};
 const payload=await seal(env.APP_DATA_KEY,JSON.stringify({to,subject,text,...(replyTo?{replyTo}: {})}),'mail:'+id);
 await env.DB.prepare('INSERT INTO mail_outbox(id,kind,payload,status,attempts,next_at,lease_until,created,expires) VALUES(?,?,?,\'queued\',0,0,0,?,?)').bind(id,kind,payload,Date.now(),expires).run();
 return {id,status:mailReady(env)?'queued':'pending_setup'};
}
export async function deliverMail(env,id,fetcher=fetch){
 if(!mailReady(env))return {status:'pending_setup'};
 const now=Date.now();
 // A canceled Gmail request may have sent mail without saving its response.
 // Never automatically replay a send whose outcome is unknown.
 await env.DB.prepare("UPDATE mail_outbox SET status='uncertain',lease_until=0,last_error=? WHERE id=? AND status='sending' AND lease_until<?").bind('The previous send was interrupted. Check your inbox before requesting a new code.',id,now).run();
 const lock=await env.DB.prepare("UPDATE mail_outbox SET lease_until=? WHERE id=? AND status IN ('queued','retry') AND next_at<=? AND lease_until<?").bind(now+30000,id,now,now).run();
 if(!changed(lock)){const row=await env.DB.prepare('SELECT status FROM mail_outbox WHERE id=?').bind(id).first();return {status:row?.status||'unavailable'}}
 const row=await env.DB.prepare('SELECT * FROM mail_outbox WHERE id=?').bind(id).first();
 let providerAccepted=false;
 try{
  const proof=['email_login','verify_email','manager_approval'].includes(row.kind)?await env.DB.prepare('SELECT consumed,expires FROM verification_challenges WHERE id=?').bind(id).first():null;
  if(row.expires&&row.expires<=now||proof&&(proof.consumed||proof.expires<=now)){await env.DB.prepare("UPDATE mail_outbox SET status='expired',payload='',lease_until=0 WHERE id=?").bind(id).run();return {status:'expired'}}
  const payload=JSON.parse(await unseal(env.APP_DATA_KEY,row.payload,'mail:'+id));
  let result;
  if(env.GMAIL_SENDER){
   const reserved=await env.DB.prepare("UPDATE mail_outbox SET status='sending' WHERE id=? AND status IN ('queued','retry') AND NOT EXISTS (SELECT 1 FROM verification_challenges WHERE id=? AND consumed=1)").bind(id,id).run();
   if(!changed(reserved))return {status:'expired'};
   result=await sendGmail(env.GMAIL_SENDER,payload,id,fetcher);
   providerAccepted=true;
  }
  else {
  const response=await fixedEndpointFetch(fetcher,'https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'somas/'+id},body:JSON.stringify({from:env.MAIL_FROM,to:[payload.to],subject:payload.subject,text:payload.text,...(payload.replyTo?{reply_to:payload.replyTo}:{})})});
  if(!response.ok){
   let detail='';try{detail=String((await response.json()).message||'').slice(0,2000)}catch{}
   const err=new Error('email_provider_rejected');
   err.permanent=response.status>=400&&response.status<500&&response.status!==429;
   err.publicMessage=response.status===401?'Resend rejected the API key. The owner needs to update the sender connection.':response.status===403?/domain.+not verified/i.test(detail)?'Resend rejected the saved From address: its domain is not verified. The owner must use a sender on a verified domain or connect Gmail.':/testing emails|own email|test email/i.test(detail)?'The saved Resend sender is restricted to test recipients. The owner must verify a sending domain before visitors can receive codes.':'Resend did not authorize the saved sender or recipient. The owner must verify the sending domain or connect Gmail.':response.status===429?'The email provider is rate limited. Delivery will retry.':'The email provider rejected this request. The owner needs to check the authorized sender address.';
   throw err;
  }
  result=await response.json();if(!result.id)throw new Error('email_provider_invalid_response');
  }
  await env.DB.prepare("UPDATE mail_outbox SET status='accepted',payload='',provider_id=?,attempts=attempts+1,lease_until=0,last_error=''  WHERE id=?").bind(String(result.id).slice(0,200),id).run();return {status:'accepted'};
 }catch(err){
  const attempts=row.attempts+1;
  const uncertain=err.uncertain||env.GMAIL_SENDER&&providerAccepted;
  const status=uncertain?'uncertain':err.permanent||err.code==='upstream_redirect'||attempts>=8?'failed':'retry',message=err.publicMessage||(err.code==='upstream_redirect'?'The email provider returned an unexpected redirect. The owner needs to check the sender connection.':uncertain?'The email provider accepted this message, but SOMAS could not save delivery confirmation. Check your inbox before requesting a new code.':'The email service could not be reached. Delivery is not confirmed; the saved request will retry.');
  await env.DB.prepare("UPDATE mail_outbox SET status=?,attempts=?,next_at=?,lease_until=0,last_error=? WHERE id=?").bind(status,attempts,now+Math.min(3600000,30000*2**attempts),message,id).run();return {status,message};
 }
}
export async function drainMail(env,fetcher=fetch){const rows=(await env.DB.prepare("SELECT id FROM mail_outbox WHERE status IN ('queued','retry','sending') AND next_at<=? AND lease_until<? ORDER BY created LIMIT 3").bind(Date.now(),Date.now()).all()).results;const results=[];for(const row of rows)results.push(await deliverMail(env,row.id,fetcher));return results}
export async function challenge(env,purpose,actor,target,email,subject,description,{deferDelivery=false}={}){
 if(!mailReady(env))throw new AppError('Email delivery needs a configured sender. Contact the site owner.',503,'email_not_configured');
 const now=Date.now();if(purpose==='manager_approval'){const global=await env.DB.prepare("SELECT COUNT(*) AS total FROM verification_challenges WHERE purpose='manager_approval' AND created>?").bind(now-3600000).first();if(global.total>=20)throw new AppError('Manager requests are busy. Please try later.',429,'verification_rate_limit')}const recent=await env.DB.prepare('SELECT COUNT(*) AS total,MAX(created) AS last FROM verification_challenges WHERE actor=? AND purpose=? AND created>?').bind(actor,purpose,now-3600000).first();
 if(recent.total>=5||recent.last>now-60000)throw new AppError('Please wait before requesting another code.',429,'verification_rate_limit');
 const id=crypto.randomUUID(),value=code(),expires=now+15*60000,hash=await codeHash(env,id,value);
 // Reserve the cooldown in one database statement so concurrent requests cannot spam email.
 const inserted=await env.DB.prepare('INSERT INTO verification_challenges(id,purpose,actor,target,email,code_hash,expires,attempts,consumed,created) SELECT ?,?,?,?,?,?,?,0,0,? WHERE NOT EXISTS (SELECT 1 FROM verification_challenges WHERE actor=? AND purpose=? AND created>?)').bind(id,purpose,actor,target,email,hash,expires,now,actor,purpose,now-60000).run();
 if(!changed(inserted))throw new AppError('Please wait before requesting another code.',429,'verification_rate_limit');
 const mail=await enqueueMail(env,{id,to:email,subject,text:description+'\n\nVerification code: '+value+'\n\nExpires in 15 minutes. This code is for this request only. '+(purpose==='manager_approval'?'Never give an approval code to the applicant.':'Do not share this code.'),kind:purpose,expires});
 const delivery=deferDelivery?{status:'queued'}:await deliverMail(env,mail.id,env.mailFetcher||fetch);
 return {id,expires,delivery:delivery.status,...(delivery.message?{message:delivery.message}:{})};
}
export async function checkChallenge(env,id,purpose,actor,codeValue,consume=true){
 if(typeof id!=='string'||typeof codeValue!=='string'||!/^\d{8}$/.test(codeValue))throw new AppError('Enter the 8-digit verification code.',400,'invalid_code');
 const row=await env.DB.prepare('SELECT * FROM verification_challenges WHERE id=? AND purpose=? AND actor=?').bind(id,purpose,actor).first();
 if(!row||row.consumed||row.expires<=Date.now()||row.attempts>=5)throw new AppError('Code expired, used, or attempts exceeded. Request a new one.',400,'invalid_code');
 const reserved=await env.DB.prepare('UPDATE verification_challenges SET attempts=attempts+1 WHERE id=? AND attempts<5 AND consumed=0 AND expires>?').bind(id,Date.now()).run();
 if(!changed(reserved))throw new AppError('Code expired or attempts exceeded.',400,'invalid_code');
 const signature=new Uint8Array(row.code_hash.match(/../g).map(x=>parseInt(x,16)));
 if(!await crypto.subtle.verify('HMAC',await signingKey(env),signature,bytes(id+'|'+codeValue)))throw new AppError('Incorrect verification code.',400,'invalid_code');
 if(consume){const used=await env.DB.prepare('UPDATE verification_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires>?').bind(id,Date.now()).run();if(!changed(used))throw new AppError('Code is no longer available.',409,'invalid_code')}
 return row;
}
export async function sendVerification(user,env){
 const email=verificationAddress(user,env);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new AppError('Your sign-in did not supply an email address.',400,'email_missing');
 if(!verificationRequired(env)||mailboxVerified(user,env))return {verified:true};
 return challenge(env,'verify_email',user.id,user.id,email,'Verify your SOMAS account','Confirm the email address for your SOMAS account.');
}
export async function verifyEmail(user,env,input){const c=await checkChallenge(env,input.id,'verify_email',user.id,input.code);if(c.email!==verificationAddress(user,env))throw new AppError('Your email changed. Request another code.',400,'email_changed');const changedUser=await env.DB.prepare('UPDATE users SET verified_email=?,email_verified_at=? WHERE id=? AND email=?').bind(c.email,Date.now(),user.id,user.email).run();if(!changed(changedUser))throw new AppError('Your email changed. Request another code.',409);return {verified:true}}
export async function requestManager(user,env,input){
 if(verificationRequired(env)&&!mailboxVerified(user,env))throw new AppError('Verify your own email before applying for Manager access.',403,'email_verification_required');
 if(managerAccount(user,env))return {status:'already_manager'};
 const reason=String(input.reason||'').trim();if(reason.length<10||reason.length>1000)throw new AppError('Explain why you need manager access (10–1000 characters).',400);
 const c=await challenge(env,'manager_approval',user.id,user.id,OWNER_EMAIL,'SOMAS manager approval request',`Applicant: ${user.name}\nEmail: ${user.email}\nUser ID: ${user.id}\nReason: ${reason}\n\nOnly the SOMAS owner may enter this code on the named request. Approval grants access to user management and service operations. If you did not expect this request, reject it in SOMAS.`);
 await env.DB.prepare("INSERT INTO manager_requests(id,applicant,reason,challenge_id,status,created) VALUES(?,?,?,?,'pending',?)").bind(c.id,user.id,reason,c.id,Date.now()).run();return {id:c.id,status:'pending',delivery:c.delivery,expires:c.expires};
}
export async function decideManager(user,env,id,input){
 if(!ownerAccount(user,env))throw new AppError('Only the verified site owner can approve managers.',403,'owner_required');
 const row=await env.DB.prepare('SELECT * FROM manager_requests WHERE id=?').bind(id).first();if(!row||row.status!=='pending')throw new AppError('Pending request not found.',404);
 if(input.action==='reject'){await env.DB.prepare("UPDATE manager_requests SET status='rejected',reviewer=?,reviewed=? WHERE id=? AND status='pending'").bind(user.id,Date.now(),id).run();return {status:'rejected'}}
 if(input.action!=='approve')throw new AppError('Unknown decision.',400);
 const target=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(row.applicant).first();if(!target||target.status!=='active'||!isVerified(target,env))throw new AppError('Applicant must have an active, verified account.',409);
 const c=await checkChallenge(env,row.challenge_id,'manager_approval',row.applicant,input.code,false);
 if(c.target!==row.applicant||c.email!==OWNER_EMAIL)throw new AppError('Approval does not match the applicant.',403);
 if(env.DB.dialect==='postgres'){
  const result=await env.DB.prepare(`WITH eligible AS (
   SELECT r.id,r.applicant,c.id AS challenge FROM manager_requests r
   JOIN verification_challenges c ON c.id=r.challenge_id JOIN users u ON u.id=r.applicant
   WHERE r.id=? AND r.status='pending' AND c.id=? AND c.consumed=0 AND c.expires>?
   AND u.status='active' AND u.email_verified_at>0 AND u.verified_email=u.email
   FOR UPDATE OF r,c,u
  ), approved AS (
   UPDATE manager_requests r SET status='approved',reviewer=?,reviewed=? FROM eligible e WHERE r.id=e.id RETURNING r.applicant,r.challenge_id
  ), promoted AS (
   UPDATE users u SET role='manager' FROM approved a WHERE u.id=a.applicant RETURNING u.id
  ) UPDATE verification_challenges c SET consumed=1 FROM approved a,promoted p WHERE c.id=a.challenge_id AND p.id=a.applicant RETURNING c.id`).bind(id,c.id,Date.now(),user.id,Date.now()).run();
  if(!changed(result))throw new AppError('Approval no longer available.',409);
  return {status:'approved'};
 }
 // D1 batch executes these statements atomically. Only one pending request
 // can transition to approved; neither the applicant nor another manager can grant it.
 const results=await env.DB.batch([
  env.DB.prepare("UPDATE manager_requests SET status='approved',reviewer=?,reviewed=? WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM verification_challenges WHERE id=? AND consumed=0 AND expires>?) AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='active' AND email_verified_at>0 AND verified_email=email)").bind(user.id,Date.now(),id,c.id,Date.now(),row.applicant),
  env.DB.prepare("UPDATE users SET role='manager' WHERE id=? AND changes()=1 AND status='active' AND email_verified_at>0 AND verified_email=email AND EXISTS (SELECT 1 FROM manager_requests WHERE id=? AND status='approved' AND reviewer=?)").bind(row.applicant,id,user.id),
  env.DB.prepare("UPDATE verification_challenges SET consumed=1 WHERE id=? AND changes()=1 AND EXISTS (SELECT 1 FROM manager_requests WHERE id=? AND status='approved' AND reviewer=?)").bind(c.id,id,user.id)
 ]);
 if(!changed(results[0]))throw new AppError('Approval no longer available.',409);
 return {status:'approved'};
}

// Application-owned provider connection, encrypted like per-user model credentials.
// Deployment-provided sender secrets take precedence; no key is returned to clients.
export async function emailEnvironment(env){
 if(mailReady(env)||!env.DB||!env.APP_DATA_KEY)return env;
 const row=await env.DB.prepare('SELECT secret FROM email_sender WHERE id=?').bind('root').first();
 if(!row)return env;
 try{const settings=JSON.parse(await unseal(env.APP_DATA_KEY,row.secret,'email-sender'));
 if(settings.provider==='gmail')return {...env,GMAIL_SENDER:settings,MAIL_FROM:'SOMAS <'+settings.email+'>',emailSenderSource:'connection'};
 return {...env,RESEND_API_KEY:settings.key,MAIL_FROM:settings.from,emailSenderSource:'connection'};
 }catch{return {...env,emailSenderError:true}}
}
export async function saveEmailSender(user,env,input){
 if(!ownerIdentity(user,env))throw new AppError('Only the configured site owner can connect email.',403,'owner_required');
 if(!env.APP_DATA_KEY)throw new AppError('Email encryption needs to be configured by the host.',503,'email_not_configured');
 if(mailReady(env)&&env.emailSenderSource!=='connection')throw new AppError('This sender is managed in the Site runtime settings.',409);
 const key=String(input.key||'').trim(),from=String(input.from||'').trim();
 if(!/^re_[A-Za-z0-9_-]{16,200}$/.test(key))throw new AppError('Enter a Resend API key beginning with re_.',400);
 if(from.length>250||/[\r\n]/.test(from)||!/^(?:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+|[^<>]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>)$/.test(from))throw new AppError('Enter an authorized sender, such as SOMAS <notifications@your-domain.com>.',400);
 if(/@gmail\.com[> ]*$/i.test(from))throw new AppError('To send from your Gmail address, use Connect Gmail above. Resend requires a sender on your verified domain.',400);
 const payload=await seal(env.APP_DATA_KEY,JSON.stringify({provider:'resend',key,from}),'email-sender');
 await env.DB.prepare('INSERT INTO email_sender(id,secret,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,updated=excluded.updated').bind('root',payload,Date.now()).run();
 return {configured:true,from,verificationEmail:verificationAddress(user,env)};
}
