import {database} from './database.js';
import {accessUser,administrator} from './access.js';
import {json,requireThat,rateLimit,payload} from './community.js';
import {randomToken,sha256,verifyPassword} from './auth.js';
import {seal,unseal,googleFetch} from './google.js';
const scope='openid email https://www.googleapis.com/auth/gmail.send';
const cookie='somas_admin_gmail';
const clear=`${cookie}=; Path=/api/admin/gmail/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export async function resolveBroadcastSender(sql,env,user,choice='owner'){
 requireThat(['owner','personal'].includes(choice),'invalid_sender');
 if(choice==='owner'){const [r]=await sql`SELECT status FROM owner_integrations WHERE id='google'`;requireThat(r?.status==='connected','google_not_connected',503);return {userId:null,email:env.SOMAS_OWNER_EMAIL};}
 const [r]=await sql`SELECT email,status FROM admin_gmail_integrations WHERE user_id=${user.id}`;requireThat(r?.status==='connected','personal_gmail_not_connected',409);return {userId:user.id,email:r.email};
}
export async function adminGmail(req,env){
 const url=new URL(req.url),sql=database(env);let user=await accessUser(req,sql,env);
 if(url.pathname==='/api/admin/gmail/callback'){
  requireThat(req.method==='GET','method_not_allowed',405);
  const browser=/(?:^|;\s*)somas_admin_gmail=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('cookie')||'')?.[1],state=url.searchParams.get('state');requireThat(browser&&state&&state.length<200,'oauth_state_invalid',403);
  const stateId=await sha256(state),browserHash=await sha256(browser);
  // Strict session cookies are absent on Google's cross-site return. Recover the
  // initiator only from server state and the dedicated Lax browser cookie.
  const [context]=await sql`SELECT user_id FROM admin_gmail_oauth WHERE id=${stateId} AND browser_hash=${browserHash} AND expires_at>now()`;
  requireThat(context,'oauth_state_invalid',403);
  requireThat(!user||user.id===context.user_id,'oauth_account_changed',403);
  const [initiator]=await sql`SELECT id,email,role,verified_at,account_status FROM users WHERE id=${context.user_id} AND account_status='active'`;
  requireThat(administrator(initiator,env),'administrator_required',403);
  user=initiator;
  const [s]=await sql`DELETE FROM admin_gmail_oauth WHERE id=${stateId} AND user_id=${user.id} AND browser_hash=${browserHash} AND expires_at>now() RETURNING verifier,redirect_uri`;
  requireThat(s,'oauth_state_invalid',403);
  const code=url.searchParams.get('code');requireThat(code&&code.length<4096,'oauth_cancelled');
  const res=await googleFetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_OAUTH_CLIENT_ID,client_secret:env.GOOGLE_OAUTH_CLIENT_SECRET,redirect_uri:s.redirect_uri,code,code_verifier:s.verifier,grant_type:'authorization_code'})}),t=await res.json();requireThat(res.ok&&t.access_token&&t.refresh_token,'google_authorization_failed',503);
  requireThat((t.scope||'').split(' ').includes('https://www.googleapis.com/auth/gmail.send'),'google_scopes_missing',403);
  const ir=await googleFetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{authorization:'Bearer '+t.access_token}}),info=await ir.json();requireThat(ir.ok&&info.email_verified===true&&typeof info.email==='string'&&/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(info.email),'google_identity_invalid',403);
  await sql`INSERT INTO admin_gmail_integrations(user_id,email,ciphertext,scopes) VALUES(${user.id},${info.email.toLowerCase()},${await seal(env,t.refresh_token)},${t.scope}) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,ciphertext=excluded.ciphertext,scopes=excluded.scopes,status='connected',last_error=NULL,connected_at=now()`;
  return new Response(null,{status:302,headers:{location:'/admin/?gmail=connected','set-cookie':clear,'referrer-policy':'no-referrer','cache-control':'no-store'}});
 }
 requireThat(user,'unauthenticated',401);requireThat(administrator(user,env),'administrator_required',403);
 if(url.pathname==='/api/admin/gmail'&&req.method==='GET'){
  const [personal]=await sql`SELECT email,status,last_error,connected_at FROM admin_gmail_integrations WHERE user_id=${user.id}`;
  const [shared]=await sql`SELECT status FROM owner_integrations WHERE id='google'`;
  return json({personal:personal||{status:'not_connected'},owner:{email:env.SOMAS_OWNER_EMAIL||null,status:shared?.status||'not_connected'},redirectUri:new URL('/api/admin/gmail/callback',url).href});
 }
 requireThat(req.method==='POST','method_not_allowed',405);
 if(url.pathname==='/api/admin/gmail/connect'){
  requireThat(env.GOOGLE_OAUTH_CLIENT_ID&&env.GOOGLE_OAUTH_CLIENT_SECRET&&env.GOOGLE_CREDENTIAL_ENCRYPTION_KEY,'google_config_missing',503);requireThat(url.protocol==='https:','oauth_https_required',503);await rateLimit(sql,'personal-gmail-connect:'+user.id,10);
  const redirect=new URL('/api/admin/gmail/callback',url).href,state=randomToken(),browser=randomToken(),verifier=randomToken();
  await sql`INSERT INTO admin_gmail_oauth(id,user_id,browser_hash,verifier,redirect_uri,expires_at) VALUES(${await sha256(state)},${user.id},${await sha256(browser)},${verifier},${redirect},now()+interval '10 minutes')`;
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),challenge=btoa(String.fromCharCode(...hash)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:env.GOOGLE_OAUTH_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope,state,code_challenge:challenge,code_challenge_method:'S256',access_type:'offline',prompt:'consent'}).toString();
  return json({url:target.href},200,{'set-cookie':`${cookie}=${browser}; Path=/api/admin/gmail/callback; HttpOnly; Secure; SameSite=Lax; Max-Age=600`});
 }
 if(url.pathname==='/api/admin/gmail/disconnect'){
  const p=await payload(req),[u]=await sql`SELECT password_hash FROM users WHERE id=${user.id}`;requireThat(await verifyPassword(p.password,u.password_hash),'invalid_credentials',401);
  // Local revocation removes only this administrator's capability; never revokes the owner's Google grant.
  await sql`WITH removed AS (DELETE FROM admin_gmail_integrations WHERE user_id=${user.id} RETURNING user_id),stopped AS (UPDATE document_campaigns SET status='paused' WHERE sender_user_id IN (SELECT user_id FROM removed) AND status='queued' RETURNING id) DELETE FROM admin_gmail_oauth WHERE user_id=${user.id}`;
  return json({disconnected:true});
 }
 return json({error:'not_found'},404);
}
