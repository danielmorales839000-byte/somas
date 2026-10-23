import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAPI} from '../lib/server.mjs';
import {seal} from '../lib/provider.mjs';
import {emailEnvironment,mailReady,deliverMail} from '../lib/membership.mjs';
import {testDatabase} from './helpers/database.mjs';

async function setup(){
 const {db,sqlite}=testDatabase(),sent=[],env={DB:db,APP_DATA_KEY:'fixture-gmail-encryption',SOMAS_ADMIN_USER_ID:'owner'};
 const sender={provider:'gmail',email:'williamkevin999999@gmail.com',clientId:'fixture-google-client',clientSecret:'fixture-google-secret',refreshToken:'fixture-gmail-refresh'};
 const secret=await seal(env.APP_DATA_KEY,JSON.stringify(sender),'email-sender');sqlite.prepare('INSERT INTO email_sender(id,secret,updated) VALUES(?,?,?)').run('root',secret,Date.now());
 const jar={},options={failSend:false,failRefresh:false,refreshDenied:false};let calls=0;
 const mailFetcher=async(url,input)=>{
  calls++;
  if(url==='https://oauth2.googleapis.com/token'){
   if(options.failRefresh)throw Error('private-network-error');
   if(options.refreshDenied)return Response.json({error:'private-refresh-error'},{status:401});
   const form=new URLSearchParams(input.body);assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('refresh_token'),sender.refreshToken);return Response.json({access_token:'fixture-gmail-access'});
  }
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal(input.headers.Authorization,'Bearer fixture-gmail-access');
  const mime=Buffer.from(JSON.parse(input.body).raw,'base64url').toString('utf8'),[head,body]=mime.split('\r\n\r\n');sent.push({head,text:Buffer.from(body.replace(/\r\n/g,''),'base64').toString('utf8')});
  if(options.failSend)throw Error('response-lost-private-value');return Response.json({id:'fixture-gmail-message'});
 };
 async function call(action,data){
  const request=new Request('https://somas.test/api/auth/email/'+action,{method:'POST',headers:{Origin:'https://somas.test','Content-Type':'application/json',Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';')},body:JSON.stringify(data)});
  const result=await handleAPI(request,env,{mailFetcher});for(const c of result.headers.getSetCookie()){const [name,value]=c.split(';')[0].split('=');jar[name]=value}return {status:result.status,data:await result.json()};
 }
 async function begin(data){const start=await call('start',data);if(start.status!==200)return start;const result=await call('status',{id:start.data.id,email:start.data.email});return {...start,data:{...start.data,...result.data}}}
 return {db,sqlite,env,sender,sent,jar,options,call,begin,get calls(){return calls}};
}

test('signup sends the real code from the owner Gmail to the visitor and verifies it without Resend',async()=>{
 const t=await setup(),environment=await emailEnvironment(t.env);assert.equal(mailReady(environment),true);assert.equal(environment.RESEND_API_KEY,undefined);
 const start=await t.begin({email:'visitor@example.test'});assert.equal(start.data.delivery,'accepted');assert.equal(t.sent.length,1);assert.match(t.sent[0].head,/From: SOMAS <williamkevin999999@gmail.com>/);assert.match(t.sent[0].head,/To: visitor@example.test/);
 const code=t.sent[0].text.match(/Verification code: (\d{8})/)[1];assert.ok(!JSON.stringify(start.data).includes(code));assert.ok(!JSON.stringify(start.data).includes(t.sender.refreshToken));
 assert.equal(t.sqlite.prepare('SELECT COUNT(*) n FROM users').get().n,0);
 const result=await t.call('verify',{id:start.data.id,email:start.data.email,code});assert.equal(result.status,200);assert.equal(result.data.verified,true);assert.equal(t.sqlite.prepare('SELECT role FROM users').get().role,'user');
 assert.equal(t.sqlite.prepare('SELECT payload FROM mail_outbox').get().payload,'');
});

test('a bound delivery status retries safe failures and never exposes the code to another browser or mailbox',async()=>{
 const t=await setup();t.options.failRefresh=true;const start=await t.begin({email:'visitor@example.test'});assert.equal(start.data.delivery,'retry');assert.equal(t.sent.length,0);
 t.sqlite.prepare('UPDATE mail_outbox SET next_at=0').run();const realCookie=t.jar['__Host-somas_login'];delete t.jar['__Host-somas_login'];assert.equal((await t.call('status',{id:start.data.id,email:start.data.email})).status,400);t.jar['__Host-somas_login']=realCookie;
 assert.equal((await t.call('status',{id:start.data.id,email:'other@example.test'})).status,400);
 t.options.failRefresh=false;const status=await t.call('status',{id:start.data.id,email:start.data.email});assert.equal(status.data.delivery,'accepted');assert.equal(t.sent.length,1);assert.ok(!JSON.stringify(status.data).includes(t.sent[0].text.match(/\d{8}/)[0]));
 const before=t.calls;await t.call('status',{id:start.data.id,email:start.data.email});assert.equal(t.calls,before);
});

test('uncertain Gmail sends are not replayed automatically and expired codes never send',async()=>{
 const t=await setup();t.options.failSend=true;const start=await t.begin({email:'visitor@example.test'});assert.equal(start.data.delivery,'uncertain');assert.ok(!start.data.message.includes('private-value'));
 const before=t.calls;t.options.failSend=false;t.sqlite.prepare('UPDATE mail_outbox SET next_at=0').run();assert.equal((await t.call('status',{id:start.data.id,email:start.data.email})).data.delivery,'uncertain');assert.equal(t.calls,before);
 const u=await setup();u.options.failRefresh=true;const failed=await u.begin({email:'visitor@example.test'});u.options.failRefresh=false;u.sqlite.prepare('UPDATE verification_challenges SET expires=0').run();assert.equal((await u.call('status',{id:failed.data.id,email:failed.data.email})).data.delivery,'expired');assert.equal(u.sent.length,0);
});

test('revoked Gmail permission produces a safe owner diagnostic without returning tokens',async()=>{
 const t=await setup();t.options.refreshDenied=true;const start=await t.begin({email:'visitor@example.test'});assert.equal(start.data.delivery,'retry');assert.match(start.data.message,/reconnect Gmail/);assert.ok(!start.data.message.includes('private-refresh-error'));const row=t.sqlite.prepare('SELECT last_error FROM mail_outbox').get();assert.match(row.last_error,/reconnect Gmail/);
});


test('an interrupted Gmail worker is marked uncertain after its lease and never automatically sends again',async()=>{
 const t=await setup();const start=await t.call('start',{email:'visitor@example.test'});
 t.sqlite.prepare("UPDATE mail_outbox SET status='sending',lease_until=0 WHERE id=?").run(start.data.id);
 const result=await t.call('status',{id:start.data.id,email:start.data.email});assert.equal(result.data.delivery,'uncertain');assert.match(result.data.message,/interrupted/);assert.equal(t.calls,0);
 await t.call('status',{id:start.data.id,email:start.data.email});assert.equal(t.calls,0);
});
