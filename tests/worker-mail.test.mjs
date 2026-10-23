import test from 'node:test';
import {workerBundle} from './helpers/worker-bundle.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');

async function runtime(t,bindings,outboundService){
 const mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('./fixtures/mail-runtime-worker.mjs',import.meta.url)),script:await workerBundle(fileURLToPath(new URL('./fixtures/mail-runtime-worker.mjs',import.meta.url))),compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{APP_DATA_KEY:'worker-fixture-encryption',...bindings},outboundService});
 t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');
 for(const filename of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())for(const statement of readFileSync('drizzle/'+filename,'utf8').split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();
 const jar={};return {mf,db,async call(action,data){
  const response=await mf.dispatchFetch('https://somas.test/api/auth/email/'+action,{method:'POST',headers:{Origin:'https://somas.test','Content-Type':'application/json',Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';')},body:JSON.stringify(data)});
  for(const cookie of response.headers.getSetCookie()){const [key,value]=cookie.split(';')[0].split('=');jar[key]=value}
  return {status:response.status,data:await response.json()};
 }};
}
test('real Workers runtime rejects the former redirect mode, then sends and verifies the Resend code with the fixed transport',async t=>{
 const messages=[];const r=await runtime(t,{RESEND_API_KEY:'fixture-only',MAIL_FROM:'SOMAS <notify@example.test>'},async request=>{assert.equal(request.url,'https://api.resend.com/emails');messages.push(await request.json());return Response.json({id:'worker-fixture-message'})});
 assert.deepEqual(await (await r.mf.dispatchFetch('https://somas.test/runtime-redirect-repro')).json(),{rejected:true,name:'TypeError'});
 const start=await r.call('start',{email:'visitor@example.test'});assert.equal(start.data.delivery,'queued');assert.equal(messages.length,0);
 const delivery=await r.call('status',{id:start.data.id,email:start.data.email});assert.equal(delivery.data.delivery,'accepted');assert.equal(messages.length,1);assert.deepEqual(messages[0].to,['visitor@example.test']);
 const code=messages[0].text.match(/Verification code: (\d{8})/)[1];assert.ok(!JSON.stringify(start.data).includes(code));assert.equal((await r.call('verify',{id:start.data.id,email:start.data.email,code})).data.verified,true);
});
test('real Workers runtime sends the Gmail code using manual redirect handling',async t=>{
 const messages=[];const r=await runtime(t,{GMAIL_SENDER:{email:'williamkevin999999@gmail.com',clientId:'fixture-id',clientSecret:'fixture-secret',refreshToken:'fixture-refresh'}},async request=>{
  if(request.url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture-token'});
  assert.equal(request.url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');const mime=Buffer.from((await request.json()).raw,'base64url').toString();messages.push(mime);return Response.json({id:'worker-gmail-fixture'});
 });
 const start=await r.call('start',{email:'visitor@example.test'});assert.equal((await r.call('status',{id:start.data.id,email:start.data.email})).data.delivery,'accepted');assert.equal(messages.length,1);assert.match(messages[0],/From: SOMAS <williamkevin999999@gmail.com>/);
});
test('real Workers runtime rejects an email provider redirect without forwarding the API key',async t=>{
 const calls=[];const r=await runtime(t,{RESEND_API_KEY:'fixture-only',MAIL_FROM:'SOMAS <notify@example.test>'},async request=>{calls.push(request.url);return new Response(null,{status:307,headers:{Location:'https://elsewhere.test/steal'}})});
 const start=await r.call('start',{email:'visitor@example.test'});const delivery=await r.call('status',{id:start.data.id,email:start.data.email});assert.equal(delivery.data.delivery,'failed');assert.deepEqual(calls,['https://api.resend.com/emails']);
});
