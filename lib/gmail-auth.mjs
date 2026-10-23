import {fixedEndpointFetch} from './http.mjs';
import {AppError} from './domain.mjs';
import {seal,unseal} from './provider.mjs';
import {recordActivity,ownerIdentity,profile,OWNER_EMAIL} from './membership.mjs';
import {emailSessionRequest} from './email-auth.mjs';
import {safeContinuePath} from './login-flow.mjs';

// Fixed endpoints only: neither visitors nor provider responses select a host.
export const GMAIL_GOOGLE={
 google:{name:'Google',authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',keys:'https://www.googleapis.com/oauth2/v3/certs',scope:'openid email profile',console:'https://console.cloud.google.com/auth/clients'}
};
const bytes=value=>new TextEncoder().encode(value);
const base64url=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
const hash=async value=>base64url(await crypto.subtle.digest('SHA-256',bytes(value)));
const changed=result=>(result.meta?.changes??result.changes??0)>0;
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const stateCookie=(provider,value,age=600)=>`__Host-somas_oauth_${provider}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Lax`;
const readCookie=(req,name)=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const callback=(origin,provider)=>origin+'/api/auth/oauth/'+provider+'/callback';
const validEmail=value=>typeof value==='string'&&value.length<=250&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)?value.toLowerCase():'';
function providerInfo(provider){if(!Object.hasOwn(GMAIL_GOOGLE,provider))throw new AppError('Unknown sending connection.',404,'provider_unavailable');return GMAIL_GOOGLE[provider]}
function checkStorage(env){if(!env.DB||!env.APP_DATA_KEY)throw new AppError('Sign-in is temporarily unavailable.',503,'provider_unavailable')}
async function settings(env,provider,origin){
 providerInfo(provider);
 const prefix=provider.toUpperCase()+'_OAUTH_',clientId=env[prefix+'CLIENT_ID'],clientSecret=env[prefix+'CLIENT_SECRET'];
 if(clientId&&clientSecret)return {clientId,clientSecret,origin:env.OAUTH_PUBLIC_ORIGIN||origin,managed:true};
 if(!env.DB||!env.APP_DATA_KEY)return null;
 const row=await env.DB.prepare('SELECT secret FROM oauth_providers WHERE provider=?').bind(provider).first();
 if(!row)return null;
 try{return JSON.parse(await unseal(env.APP_DATA_KEY,row.secret,'oauth-provider:'+provider))}catch{return null}
}
export async function gmailSettings(env,origin){
 const providers=[];
 for(const [id,p] of Object.entries(GMAIL_GOOGLE)){
  const config=await settings(env,id,origin);
  providers.push({id,name:p.name,configured:!!(config&&config.origin===origin),clientId:config?.clientId||'',managed:!!config?.managed,callbackUrl:callback(origin,id),console:p.console});
 }
 return {providers};
}
async function sendingOwner(req,env){
 const session=await emailSessionRequest(req,env,{ownerSetup:true});
 if(!session.req.headers.get('oai-authenticated-user-id'))throw new AppError('Sign in with the existing owner account.',403,'owner_required');
 const user=await profile(session.req,env);
 if(!ownerIdentity(user,env))throw new AppError('Only the site owner may connect Gmail.',403,'owner_required');
 return user;
}
export async function saveGmailSettings(env,origin,input){
 checkStorage(env);providerInfo(input.provider);
 const old=await settings(env,input.provider,origin);
 if(old?.managed)throw new AppError('This provider is configured by the host.',409);
 const clientId=String(input.clientId||'').trim(),providedSecret=String(input.clientSecret||'').trim();
 if(old&&old.clientId!==clientId&&!providedSecret)throw new AppError('Enter the new client secret when changing the Client ID.',400);
 const clientSecret=providedSecret||old?.clientSecret;
 if(!clientId||clientId.length>300||/[\s<>]/.test(clientId)||!clientSecret||clientSecret.length<8||clientSecret.length>2000||/[\r\n]/.test(clientSecret))throw new AppError('Enter the client ID and client secret from your provider app.',400);
 const secret=await seal(env.APP_DATA_KEY,JSON.stringify({clientId,clientSecret,origin}),'oauth-provider:'+input.provider);
 await env.DB.prepare('INSERT INTO oauth_providers(provider,secret,updated) VALUES(?,?,?) ON CONFLICT(provider) DO UPDATE SET secret=excluded.secret,updated=excluded.updated').bind(input.provider,secret,Date.now()).run();
 return {saved:true};
}
async function requestJSON(fetcher,url,options={}){
 const response=await fixedEndpointFetch(fetcher,url,{...options,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new AppError('The provider could not complete sign-in.',502,'provider_failed');
 const raw=await response.text();if(raw.length>200000)throw new AppError('Invalid provider response.',502,'provider_failed');
 let data;try{data=JSON.parse(raw)}catch{throw new AppError('Invalid provider response.',502,'provider_failed')}
 if(data.error)throw new AppError('The provider rejected sign-in.',400,'provider_failed');return data;
}
function decodePart(value){
 if(!/^[A-Za-z0-9_-]+$/.test(value)||value.length>24000)throw new AppError('Invalid identity token.',400,'invalid_identity');
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
async function verifyIdentityToken(token,provider,config,nonce,fetcher){
 if(typeof token!=='string'||token.length>32000)throw new AppError('Missing identity token.',400,'invalid_identity');
 const parts=token.split('.');if(parts.length!==3)throw new AppError('Invalid identity token.',400,'invalid_identity');
 const header=JSON.parse(new TextDecoder().decode(decodePart(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decodePart(parts[1])));
 const now=Math.floor(Date.now()/1000),aud=claims.aud;
 const issuerOK=provider==='google'?['https://accounts.google.com','accounts.google.com'].includes(claims.iss):typeof claims.tid==='string'&&/^[0-9a-f-]{36}$/i.test(claims.tid)&&claims.iss===`https://login.microsoftonline.com/${claims.tid}/v2.0`;
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200||header.crit||!issuerOK||!(aud===config.clientId||Array.isArray(aud)&&aud.includes(config.clientId)&&claims.azp===config.clientId)||(claims.azp&&claims.azp!==config.clientId)||claims.nonce!==nonce||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||(claims.nbf&&claims.nbf>now+60))throw new AppError('The provider identity could not be verified.',400,'invalid_identity');
 const jwks=await requestJSON(fetcher,GMAIL_GOOGLE[provider].keys);
 const jwk=jwks.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
 if(!jwk||(provider==='microsoft'&&jwk.issuer&&jwk.issuer.replace('{tenantid}',claims.tid)!==claims.iss))throw new AppError('Unknown identity signing key.',400,'invalid_identity');
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodePart(parts[2]),bytes(parts[0]+'.'+parts[1])))throw new AppError('Invalid identity signature.',400,'invalid_identity');
 const email=validEmail(claims.email);
 if(provider==='google'&&(!email||claims.email_verified!==true))throw new AppError('Use an account with a verified email.',400,'email_unverified');
 // Microsoft email/preferred_username is contact data, not proof of mailbox
 // ownership. Its signed issuer + subject identifies the account instead.
 return {issuer:provider==='google'?'https://accounts.google.com':claims.iss,subject:claims.sub,email,name:String(claims.name||email||GMAIL_GOOGLE[provider].name+' user').slice(0,100),emailVerified:provider==='google'};
}
function redirect(url,cookies=[]){const h=new Headers({...headers,Location:url});for(const c of cookies)h.append('Set-Cookie',c);return new Response(null,{status:303,headers:h})}
export async function gmailAuthEndpoint(req,env,deps={}){
 const url=new URL(req.url),parts=url.pathname.split('/'),provider=parts[4],action=parts[5];
 let gmailFlow=true;
 if(provider!=='google'||action==='start'&&url.searchParams.get('purpose')!=='gmail')return Response.json({error:{message:'Social sign-in has been removed. Sign in with an email verification code.',code:'social_signin_removed'}},{status:410,headers});
 try{
  providerInfo(provider);checkStorage(env);
  if(req.method!=='GET'||!['start','callback'].includes(action)||parts.length!==6)throw new AppError('Not found.',404,'provider_unavailable');
  const config=await settings(env,provider,url.origin);
  if(!config||config.origin!==url.origin)throw new AppError('This provider is not connected yet.',503,'provider_unavailable');
  const info=GMAIL_GOOGLE[provider];
  if(action==='start'){
   if(gmailFlow&&provider!=='google')throw new AppError('Choose Google for Gmail.',400,'provider_unavailable');
   if(gmailFlow&&env.RESEND_API_KEY&&env.MAIL_FROM)throw new AppError('The sender is managed by the host.',409,'provider_unavailable');
   const owner=gmailFlow?await sendingOwner(req,env):null;
   const window=Math.floor(Date.now()/3600000)*3600000,peer=await hash(req.headers.get('cf-connecting-ip')||'unknown');
   const counter=await env.DB.prepare('INSERT INTO login_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_limits.window_start=excluded.window_start THEN login_limits.count+1 ELSE 1 END,window_start=excluded.window_start RETURNING count').bind('oauth:'+peer,window).first();
   if(counter.count>40)throw new AppError('Too many sign-in attempts.',429,'sign_in_busy');
   const state=random(),browser=random(),verifier=random(),nonce=random(),stateHash=await hash(state),expires=Date.now()+600000;
   const payload=await seal(env.APP_DATA_KEY,JSON.stringify({verifier,nonce,next:safeContinuePath(url.searchParams.get('next')),origin:url.origin,clientId:config.clientId,...(owner?{purpose:'gmail',ownerId:owner.id}:{})}),'oauth-state:'+stateHash);
   await env.DB.prepare('DELETE FROM oauth_states WHERE expires<=?').bind(Date.now()).run();
   await env.DB.prepare('INSERT INTO oauth_states(state_hash,provider,browser_hash,payload,expires) VALUES(?,?,?,?,?)').bind(stateHash,provider,await hash(browser),payload,expires).run();
   const destination=new URL(info.authorize);
   for(const [key,value] of Object.entries({client_id:config.clientId,redirect_uri:callback(url.origin,provider),response_type:'code',scope:gmailFlow?'openid email profile https://www.googleapis.com/auth/gmail.send':info.scope,state,nonce,code_challenge:await hash(verifier),code_challenge_method:'S256',prompt:gmailFlow?'consent select_account':'select_account',...(gmailFlow?{access_type:'offline',login_hint:OWNER_EMAIL}:{}),...(provider==='microsoft'?{response_mode:'query'}:{})}))destination.searchParams.set(key,value);
   return redirect(destination.href,[stateCookie(provider,browser)]);
  }
  const state=url.searchParams.get('state'),browser=readCookie(req,'__Host-somas_oauth_'+provider);
  if(!state||!/^[\w-]{43}$/.test(state)||!browser||!/^[\w-]{43}$/.test(browser))throw new AppError('Start sign-in again.',400,'invalid_state');
  const stateHash=await hash(state),row=await env.DB.prepare('SELECT * FROM oauth_states WHERE state_hash=? AND provider=?').bind(stateHash,provider).first();
  if(!row||row.expires<=Date.now()||row.browser_hash!==await hash(browser))throw new AppError('Sign-in expired or changed browser.',400,'invalid_state');
  const saved=JSON.parse(await unseal(env.APP_DATA_KEY,row.payload,'oauth-state:'+stateHash));
  if(saved.purpose!=='gmail')throw new AppError('This connection is no longer supported.',410,'provider_unavailable');
  if(gmailFlow){const owner=await sendingOwner(req,env);if(owner.id!==saved.ownerId)throw new AppError('Reconnect from the same owner account.',403,'owner_required')}
  if(saved.origin!==url.origin||saved.clientId!==config.clientId)throw new AppError('Sign-in configuration changed.',400,'invalid_state');
  const consumed=await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash=? AND expires>?').bind(stateHash,Date.now()).run();
  if(!changed(consumed))throw new AppError('Sign-in already completed.',400,'invalid_state');
  if(url.searchParams.has('error'))throw new AppError('Sign-in was cancelled.',400,'access_denied');
  const code=url.searchParams.get('code');if(!code||code.length>4000)throw new AppError('Missing sign-in response.',400,'invalid_state');
  const tokens=await requestJSON(deps.oauthFetcher||fetch,info.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:'authorization_code',code,redirect_uri:callback(url.origin,provider),code_verifier:saved.verifier}).toString()});
  if(typeof tokens.access_token!=='string'||!tokens.access_token||tokens.access_token.length>16000)throw new AppError('Missing access token.',400,'provider_failed');
  const identity=await verifyIdentityToken(tokens.id_token,'google',config,saved.nonce,deps.oauthFetcher||fetch);
  if(gmailFlow){
   if(provider!=='google'||identity.email!==OWNER_EMAIL)throw new AppError('Select the configured owner Gmail address.',403,'wrong_mailbox');
   if(typeof tokens.refresh_token!=='string'||tokens.refresh_token.length<8||tokens.refresh_token.length>8000||!String(tokens.scope||'').split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw new AppError('Approve the Gmail send-mail permission.',400,'gmail_permission');
   const secret=await seal(env.APP_DATA_KEY,JSON.stringify({provider:'gmail',email:identity.email,subject:identity.subject,clientId:config.clientId,clientSecret:config.clientSecret,refreshToken:tokens.refresh_token}),'email-sender');
   await env.DB.prepare('INSERT INTO email_sender(id,secret,updated) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,updated=excluded.updated').bind('root',secret,Date.now()).run();
   await recordActivity(env.DB,saved.ownerId,'email.gmail.connected');
   return redirect('/?screen=email-setup&gmail=connected',[stateCookie(provider,'',0)]);
  }

 }catch(err){
  const codes=['provider_unavailable','invalid_state','access_denied','account_suspended','email_unverified','sign_in_busy','wrong_mailbox','gmail_permission','owner_required'];
  const error=codes.includes(err.code)?err.code:'provider_failed',destination=new URL(gmailFlow?'/?screen=email-setup':'/?screen=login',url.origin);
  destination.searchParams.set(gmailFlow?'gmail_error':'auth_error',error);if(Object.hasOwn(GMAIL_GOOGLE,provider))destination.searchParams.set('provider',provider);
  return redirect(destination.pathname+destination.search,Object.hasOwn(GMAIL_GOOGLE,provider)?[stateCookie(provider,'',0)]:[]);
 }
}
