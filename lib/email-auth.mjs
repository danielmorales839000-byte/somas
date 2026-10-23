import {AppError} from './domain.mjs';
import {OWNER_EMAIL,challenge,checkChallenge,emailEnvironment,mailReady,recordActivity,deliverMail} from './membership.mjs';
import {safeContinuePath} from './login-flow.mjs';
import {hashPassword,verifyPassword,validatePassword} from './passwords.mjs';

const SESSION='__Host-somas_session', BROWSER='__Host-somas_login';
const DAY=86400000,SESSION_LIFE=7*DAY;
const bytes=value=>new TextEncoder().encode(value);
const hex=value=>[...new Uint8Array(value)].map(v=>v.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',bytes(value)));
const cookie=(name,value,age)=>`${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(v=>v.trim().split('=')).filter(v=>v.length===2))}
const response=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...headers}});
// Email and social sign-in share the same revocable application session.
export async function issueSession(env,userId,provider='email'){
 const token=random(),now=Date.now();
 await env.DB.prepare('INSERT INTO email_sessions(token_hash,user_id,created,expires,auth_provider) VALUES(?,?,?,?,?)').bind(await digest(token),userId,now,now+SESSION_LIFE,provider).run();
 await env.DB.prepare('DELETE FROM email_sessions WHERE expires<=?').bind(now).run();
 return cookie(SESSION,token,SESSION_LIFE/1000);
}
function emailAddress(value){
 const email=String(value||'').trim().toLowerCase();
 if(email.length>250||/[^\x21-\x7e]/.test(email)||! /^[^<>(),;:\\"\s@]+@[^<>(),;:\\"\s@]+\.[^<>(),;:\\"\s@]+$/.test(email))throw new AppError('Enter a valid email address.',400,'email_invalid');
 return email;
}
async function privateHash(env,value){
 if(!env.APP_DATA_KEY)throw new AppError('We couldn’t send your code. Please try again later.',503,'email_not_configured');
 const key=await crypto.subtle.importKey('raw',bytes(env.APP_DATA_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(await crypto.subtle.sign('HMAC',key,bytes(value)));
}
async function limit(env,key,max){
 const window=Math.floor(Date.now()/3600000)*3600000;
 const row=await env.DB.prepare('INSERT INTO login_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_limits.window_start=excluded.window_start THEN login_limits.count+1 ELSE 1 END,window_start=excluded.window_start RETURNING count').bind(key,window).first();
 if(row.count>max)throw new AppError('Too many sign-in requests. Please try again later.',429,'login_rate_limit');
}
async function input(req){
 if(!req.headers.get('content-type')?.startsWith('application/json'))throw new AppError('JSON is required.',415);
 const raw=await req.text();if(raw.length>2000)throw new AppError('Request is too large.',413);
 try{const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid');return data}catch{throw new AppError('Invalid JSON.',400)}
}
async function accountForEmail(env,email){
 let mapping=await env.DB.prepare('SELECT user_id FROM email_logins WHERE email=?').bind(email).first();
 if(!mapping){
  let user;
  // This branch runs only after a correct, browser-bound code. It preserves
  // the configured owner's existing projects; typing the mailbox grants nothing.
  if(email===OWNER_EMAIL&&env.SOMAS_ADMIN_USER_ID){
   user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(env.SOMAS_ADMIN_USER_ID).first();
   if(!user)user={id:env.SOMAS_ADMIN_USER_ID,email,name:'Owner'};
  }else{
   const matches=(await env.DB.prepare('SELECT * FROM users WHERE lower(verified_email)=? AND email_verified_at>0 LIMIT 2').bind(email).all()).results;
   if(matches.length>1)throw new AppError('This email is linked to multiple existing accounts. Contact the owner to resolve access.',409,'email_account_conflict');
   user=matches[0]||{id:'email_'+crypto.randomUUID(),email,name:email.split('@')[0]};
  }
  if(user.status&&user.status!=='active')throw new AppError('This account is suspended. Contact the site owner.',403,'account_suspended');
  const now=Date.now();
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO users(id,name,email,joined,last_seen) VALUES(?,?,?,?,?)').bind(user.id,user.name,user.email,now,now),
   env.DB.prepare('INSERT OR IGNORE INTO email_logins(email,user_id) VALUES(?,?)').bind(email,user.id)
  ]);
  mapping=await env.DB.prepare('SELECT user_id FROM email_logins WHERE email=?').bind(email).first();
 }
 const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(mapping.user_id).first();
 if(!user||user.status!=='active')throw new AppError('This account is suspended. Contact the site owner.',403,'account_suspended');
 // Email proof must still agree with the linked account; never follow an alias
 // to an unrelated or subsequently changed mailbox.
 const expected=user.id===env.SOMAS_ADMIN_USER_ID?OWNER_EMAIL:user.email.toLowerCase();
 if(expected!==email)throw new AppError('The linked account email changed. Contact the site owner.',409,'email_account_conflict');
 await env.DB.prepare('UPDATE users SET verified_email=?,email_verified_at=?,last_seen=? WHERE id=?').bind(user.id===env.SOMAS_ADMIN_USER_ID?OWNER_EMAIL:user.email,Date.now(),Date.now(),user.id).run();
 return user;
}

export async function emailAuthEndpoint(req,env,deps={}){
 try{
  env=await emailEnvironment(env);
  const path=new URL(req.url).pathname,action=path.split('/').at(-1);
  if(action==='config'&&req.method==='GET')return response({configured:mailReady(env),mode:env.AUTH_MODE==='password'?'password':'code',independent:env.INDEPENDENT_HOSTING==='true'});
  if(req.method!=='POST')throw new AppError('Method not allowed.',405);
  if(req.headers.get('origin')!==new URL(req.url).origin)throw new AppError('Request origin was rejected.',403,'origin_rejected');
  if(!env.DB)throw new AppError('Database is not connected.',503,'storage_unavailable');
  if(action==='logout'){
   const token=cookies(req)[SESSION];if(token&&/^[a-f0-9]{64}$/.test(token))await env.DB.prepare('DELETE FROM email_sessions WHERE token_hash=?').bind(await digest(token)).run();
   return response({signedOut:true},200,{'Set-Cookie':cookie(SESSION,'',0)});
  }
  if(!['start','verify','status','login'].includes(action))throw new AppError('Not found.',404);
  const data=await input(req),email=emailAddress(data.email),actor='email:'+await privateHash(env,'login:'+email);
  if(action==='login'){
   if(env.AUTH_MODE!=='password')throw new AppError('Not found.',404);
   await limit(env,'password-global',200);
   await limit(env,'password-peer:'+await privateHash(env,req.headers.get('cf-connecting-ip')||'unknown'),30);
   await limit(env,'password-email:'+await privateHash(env,email),15);
   const user=await env.DB.prepare('SELECT u.*,p.password_hash FROM email_logins l JOIN users u ON u.id=l.user_id JOIN password_credentials p ON p.user_id=u.id WHERE l.email=?').bind(email).first();
   // Unknown accounts do the same expensive derivation as known accounts.
   const dummy='pbkdf2-sha256$100000$00000000000000000000000000000000$'+'0'.repeat(64);
   const valid=await verifyPassword(data.password,user?.password_hash||dummy);
   if(!valid||!user||user.status!=='active'||(user.id===env.SOMAS_ADMIN_USER_ID?OWNER_EMAIL:user.email.toLowerCase())!==email)throw new AppError('Email or password is incorrect.',401,'login_invalid');
   if(!user.email_verified_at&&user.id!==env.SOMAS_ADMIN_USER_ID)throw new AppError('Complete email verification before logging in.',403,'email_verification_required');
   const session=await issueSession(env,user.id,'password');
   await recordActivity(env.DB,user.id,'auth.password.signin');
   return response({verified:!!user.email_verified_at,next:safeContinuePath(data.next)},200,{'Set-Cookie':session});
  }
  if(action==='start'){
   if(!mailReady(env))throw new AppError('We couldn’t send your code. Please try again later.',503,'email_not_configured');
   await limit(env,'global',100);
   await limit(env,'peer:'+await privateHash(env,req.headers.get('cf-connecting-ip')||'unknown'),20);
   let passwordHash;
   if(env.AUTH_MODE==='password'){
    if(data.id){
     const browser=cookies(req)[BROWSER];
     const previous=browser&&await env.DB.prepare('SELECT p.password_hash,p.flow FROM password_signups p JOIN verification_challenges c ON c.id=p.challenge_id WHERE p.challenge_id=? AND c.email=? AND c.target=? AND c.consumed=0 AND p.expires>?').bind(data.id,email,await digest(browser),Date.now()).first();
     if(!previous)throw new AppError('Start sign-up or password reset again.',400,'invalid_code');
     passwordHash=previous.password_hash;data.flow=previous.flow;
    }else{
     try{validatePassword(data.password)}catch{throw new AppError('Use a password with 12–200 characters.',400,'password_invalid')}
     passwordHash=await hashPassword(data.password);
    }
    const existing=await env.DB.prepare('SELECT user_id FROM email_logins WHERE email=?').bind(email).first();
    if(existing&&data.flow!=='reset')throw new AppError('An account already exists. Log in, or use Reset password.',409,'account_exists');
    if(!existing&&data.flow==='reset')throw new AppError('No account is available for password reset.',400,'reset_unavailable');
   }
   const previous=cookies(req)[BROWSER],browser=previous&&/^[a-f0-9]{64}$/.test(previous)?previous:random();
   // Persist the request and browser cookie before contacting a mail provider.
   // The bound status request delivers it after the code screen has opened.
   const result=await challenge({...env,mailFetcher:deps.mailFetcher||fetch},'email_login',actor,await digest(browser),email,env.AUTH_MODE==='password'?(data.flow==='reset'?'Reset your SOMAS password':'Verify your SOMAS email'):'Your SOMAS sign-in code',env.AUTH_MODE==='password'?'Use this code to confirm your SOMAS email request. If you did not request it, ignore this email.':'Use this code to sign in to SOMAS. If you did not request it, ignore this email.',{deferDelivery:true});
   if(passwordHash){await env.DB.prepare('DELETE FROM password_signups WHERE expires<=?').bind(Date.now()).run();await env.DB.prepare('INSERT INTO password_signups(challenge_id,password_hash,expires,flow) VALUES(?,?,?,?)').bind(result.id,passwordHash,result.expires,data.flow==='reset'?'reset':'signup').run()}
   // Resending invalidates earlier codes for this mailbox, including older tabs.
   await env.DB.prepare("UPDATE verification_challenges SET consumed=1 WHERE purpose='email_login' AND actor=? AND id<>? AND consumed=0").bind(actor,result.id).run();
   await env.DB.prepare("UPDATE mail_outbox SET status='expired',payload='',lease_until=0 WHERE status IN ('queued','retry') AND id IN (SELECT id FROM verification_challenges WHERE purpose='email_login' AND actor=? AND consumed=1)").bind(actor).run();
   return response({...result,email},200,{'Set-Cookie':cookie(BROWSER,browser,900)});
  }
  const browser=cookies(req)[BROWSER];
  if(!browser||!/^[a-f0-9]{64}$/.test(browser)||typeof data.id!=='string')throw new AppError('Start email sign-in in this browser before entering a code.',400,'invalid_code');
  const saved=await env.DB.prepare("SELECT target,email FROM verification_challenges WHERE id=? AND purpose='email_login' AND actor=?").bind(data.id,actor).first();
  if(!saved||saved.email!==email||saved.target!==await digest(browser))throw new AppError('The code does not match this sign-in request.',400,'invalid_code');
  if(action==='status'){
   const challenge=await env.DB.prepare('SELECT expires,consumed FROM verification_challenges WHERE id=?').bind(data.id).first();
   if(!challenge||challenge.consumed||challenge.expires<=Date.now())return response({delivery:'expired'});
   let mail=await env.DB.prepare('SELECT status,last_error FROM mail_outbox WHERE id=?').bind(data.id).first();
   if(!mail)return response({delivery:'unavailable'});
   if(['queued','retry','sending'].includes(mail.status)){
    const result=await deliverMail({...env,mailFetcher:deps.mailFetcher||fetch},data.id,deps.mailFetcher||fetch);
    mail=await env.DB.prepare('SELECT status,last_error FROM mail_outbox WHERE id=?').bind(data.id).first();
    return response({delivery:result.status,message:result.message||mail?.last_error||''});
   }
   return response({delivery:mail.status,message:mail.last_error||''});
  }
  let pending;
  if(env.AUTH_MODE==='password'){
   pending=await env.DB.prepare('SELECT * FROM password_signups WHERE challenge_id=? AND expires>?').bind(data.id,Date.now()).first();
   if(!pending)throw new AppError('Start sign-up or password reset again.',400,'invalid_code');
   const linked=await env.DB.prepare('SELECT user_id FROM email_logins WHERE email=?').bind(email).first();
   if(pending.flow==='signup'&&linked)throw new AppError('An account already exists. Log in or reset its password.',409,'account_exists');
   if(pending.flow==='reset'&&!linked)throw new AppError('The account is no longer available.',400,'reset_unavailable');
  }
  await checkChallenge(env,data.id,'email_login',actor,data.code);
  const user=await accountForEmail(env,email);
  if(pending){await env.DB.batch([
   env.DB.prepare('INSERT INTO password_credentials(user_id,password_hash,updated) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,updated=excluded.updated').bind(user.id,pending.password_hash,Date.now()),
   env.DB.prepare('DELETE FROM email_sessions WHERE user_id=?').bind(user.id),
   env.DB.prepare('DELETE FROM password_signups WHERE challenge_id=?').bind(data.id)
  ])}
  const session=await issueSession(env,user.id,pending?'password':'email');
  await recordActivity(env.DB,user.id,'auth.email.signin');
  return response({verified:true,next:safeContinuePath(data.next)},200,{'Set-Cookie':session});
 }catch(err){return response({error:{message:err instanceof AppError?err.message:'Email sign-in failed. Please try again.',code:err.code||'email_signin_failed'}},err.status||500)}
}

export async function emailSessionRequest(req,env,{ownerSetup=false}={}){
 // Owner recovery uses the trusted hosting identity even while the owner is
 // testing an ordinary SOMAS login. Workspace requests keep that login intact.
 if(ownerSetup&&env.SOMAS_ADMIN_USER_ID&&req.headers.get('oai-authenticated-user-id')===env.SOMAS_ADMIN_USER_ID)return {req,method:'chatgpt'};
 const token=cookies(req)[SESSION];
 if(!token||!/^[a-f0-9]{64}$/.test(token)||!env.DB)return {req,method:'chatgpt'};
 const session=await env.DB.prepare('SELECT user_id,auth_provider FROM email_sessions WHERE token_hash=? AND expires>?').bind(await digest(token),Date.now()).first();
 if(!session)return {req,method:'chatgpt'};
 const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(session.user_id).first();
 if(!user)return {req,method:'chatgpt'};
 // Only server-validated sessions create this internal request identity. The
 // browser never sets platform identity headers or receives the session token.
 const headers=new Headers(req.headers);
 headers.set('oai-authenticated-user-id',user.id);headers.set('oai-authenticated-user-email',user.email);
 headers.set('oai-authenticated-user-full-name',encodeURIComponent(user.name));headers.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
 const provider=['google','microsoft','github'].includes(session.auth_provider)?session.auth_provider:null;
 return {req:new Request(req,{headers}),method:provider||'email',oauthUserId:provider?user.id:null};
}
