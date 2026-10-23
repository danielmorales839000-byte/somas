import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAPI} from '../lib/server.mjs';
import {testDatabase} from './helpers/database.mjs';
import {GMAIL_GOOGLE} from '../lib/gmail-auth.mjs';

const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'fixture-signing-key',use:'sig',alg:'RS256'};
const b64=value=>Buffer.from(value).toString('base64url');
async function jwt(claims,header={alg:'RS256',kid:jwk.kid}){
 const message=b64(JSON.stringify(header))+'.'+b64(JSON.stringify(claims));
 return message+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(message)));
}
function setup(){
 const {db,sqlite}=testDatabase(),requests=[],flows={};
 const env={DB:db,APP_DATA_KEY:'fixture-social-encryption',SOMAS_ADMIN_USER_ID:'existing-owner'};
 for(const id of Object.keys(GMAIL_GOOGLE)){env[id.toUpperCase()+'_OAUTH_CLIENT_ID']='fixture-'+id;env[id.toUpperCase()+'_OAUTH_CLIENT_SECRET']='fixture-secret-'+id}
 const options={subject:'stable-provider-subject',email:'williamkevin999999@gmail.com',claims:{},header:null,denied:false,githubId:101,githubVerified:true};
 const oauthFetcher=async(url,input={})=>{
  requests.push({url,input});
  const provider=Object.keys(GMAIL_GOOGLE).find(p=>GMAIL_GOOGLE[p].token===url);
  if(provider){
   if(options.denied)return Response.json({error:'private-token-endpoint-error'},{status:401});
   const form=new URLSearchParams(input.body),flow=flows[provider];
   assert.equal(form.get('client_secret'),'fixture-secret-'+provider);
   const challenge=b64(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(form.get('code_verifier'))));
   assert.equal(challenge,flow.searchParams.get('code_challenge'));
   assert.equal(form.get('redirect_uri'),'https://somas.test/api/auth/oauth/'+provider+'/callback');
   if(provider==='github')return Response.json({access_token:'fixture-access-token-not-persisted'});
   const now=Math.floor(Date.now()/1000),tid='12345678-abcd-abcd-abcd-123456789012';
   const claims={iss:provider==='google'?'https://accounts.google.com':`https://login.microsoftonline.com/${tid}/v2.0`,...(provider==='microsoft'?{tid}:{}),sub:options.subject,aud:'fixture-'+provider,nonce:flow.searchParams.get('nonce'),iat:now,exp:now+3600,email:options.email,email_verified:true,name:'Fixture user',...options.claims};
   return Response.json({access_token:'fixture-access-token-not-persisted',id_token:await jwt(claims,options.header||undefined),refresh_token:'fixture-refresh-token',scope:flow.searchParams.get('scope')});
  }
  if(url.endsWith('/certs')||url.endsWith('/keys'))return Response.json({keys:[jwk]});
  if(url==='https://api.github.com/user')return Response.json({id:options.githubId,name:'GitHub fixture',login:'fixture'});
  if(url==='https://api.github.com/user/emails')return Response.json([{email:options.email,verified:options.githubVerified,primary:true}]);
  throw Error('Unexpected OAuth endpoint '+url);
 };
 function client(identity=null){const jar={};return {jar,async call(path,method='GET',data,origin='https://somas.test'){
  const headers={Origin:origin,Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';')};
  if(identity){headers['oai-authenticated-user-id']=identity.id;headers['oai-authenticated-user-email']=identity.email;headers['oai-authenticated-user-full-name']='Owner'}
  if(data)headers['Content-Type']='application/json';
  const r=await handleAPI(new Request(origin+'/api/'+path,{method,headers,body:data?JSON.stringify(data):undefined}),env,{oauthFetcher});
  for(const cookie of r.headers.getSetCookie()){const [name,value]=cookie.split(';')[0].split('=');if(value)jar[name]=value;else delete jar[name]}
  const location=r.headers.get('location');return {status:r.status,location,headers:r.headers,data:location?null:await r.json()};
 },async begin(provider='google',next='/?screen=dashboard'){
  const r=await this.call('auth/oauth/'+provider+'/start?purpose=gmail');
  const auth=new URL(r.location);flows[provider]=auth;return auth;
 },async finish(provider='google',auth=flows[provider],suffix=''){
  return this.call('auth/oauth/'+provider+'/callback?code=fixture-code&state='+auth.searchParams.get('state')+suffix);
 }}}
 return {db,sqlite,env,requests,flows,options,client};
}


test('Google, Microsoft and GitHub visitor sign-in endpoints are removed and issue no account or session',async()=>{
 const t=setup(),c=t.client();for(const id of ['google','microsoft','github']){const r=await c.call('auth/oauth/'+id+'/start');assert.equal(r.status,410);assert.equal(r.data.error.code,'social_signin_removed')}
 assert.equal(t.requests.length,0);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sessions').get().n,0);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);
 const options=(await c.call('auth/options')).data;assert.equal(options.providers,undefined);
});
test('only the hosting owner can authorize sending from the fixed Gmail mailbox',async()=>{
 const t=setup();assert.match((await t.client().call('auth/oauth/google/start?purpose=gmail')).location,/owner_required/);
 const other=t.client({id:'other-user',email:'williamkevin999999@gmail.com'});assert.match((await other.call('auth/oauth/google/start?purpose=gmail')).location,/owner_required/);
 const owner=t.client({id:'existing-owner',email:'former@example.test'}),auth=await owner.begin();assert.equal(auth.searchParams.get('access_type'),'offline');assert.match(auth.searchParams.get('scope'),/gmail.send/);assert.equal(auth.searchParams.get('code_challenge_method'),'S256');
 assert.equal((await owner.finish()).location,'/?screen=email-setup&gmail=connected');assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sender').get().n,1);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM email_sessions').get().n,0);assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM oauth_identities').get().n,0);
 const encrypted=t.sqlite.prepare('SELECT secret FROM email_sender').get().secret;assert.ok(!encrypted.includes('fixture-refresh-token'));
 const wrong=setup(),c=wrong.client({id:'existing-owner',email:'former@example.test'});wrong.options.email='wrong@example.test';await c.begin();assert.match((await c.finish()).location,/wrong_mailbox/);assert.equal(wrong.sqlite.prepare('SELECT COUNT(*) n FROM email_sender').get().n,0);
});
test('Gmail callback validates the browser, single-use state, signed identity, nonce and mailbox proof',async()=>{
 const t=setup(),owner=t.client({id:'existing-owner',email:'former@example.test'}),auth=await owner.begin();assert.match((await t.client({id:'existing-owner',email:'former@example.test'}).finish('google',auth)).location,/invalid_state/);assert.equal(t.requests.length,0);
 assert.equal((await owner.finish()).location,'/?screen=email-setup&gmail=connected');assert.match((await owner.finish()).location,/invalid_state/);
 for(const claims of [{nonce:'wrong'},{aud:'other-client'},{iss:'https://wrong.test'},{exp:0},{email_verified:false}]){const u=setup(),c=u.client({id:'existing-owner',email:'former@example.test'});u.options.claims=claims;await c.begin();assert.match((await c.finish()).location,/gmail_error=/);assert.equal(u.sqlite.prepare('SELECT COUNT(*) n FROM email_sender').get().n,0)}
});
test('owner Gmail app setup encrypts its credentials, rejects a mismatched new client, and never exposes the secret',async()=>{
 const t=setup();delete t.env.GOOGLE_OAUTH_CLIENT_ID;delete t.env.GOOGLE_OAUTH_CLIENT_SECRET;const owner=t.client({id:'existing-owner',email:'former@example.test'}),data={clientId:'fixture-google',clientSecret:'fixture-secret-google'};
 assert.equal((await t.client().call('email-setup/google')).status,401);assert.equal((await t.client({id:'other-user',email:'other@example.test'}).call('email-setup/google')).status,403);
 assert.equal((await owner.call('email-setup/google','POST',data)).status,200);const settings=(await owner.call('email-setup/google')).data;assert.equal(settings.providers[0].configured,true);assert.ok(!JSON.stringify(settings).includes(data.clientSecret));
 assert.equal((await owner.call('email-setup/google','POST',{clientId:'new-client',clientSecret:''})).status,400);assert.equal((await owner.call('email-setup/google')).data.providers[0].clientId,data.clientId);
});
