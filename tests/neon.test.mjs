import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {postgresDatabase,postgresSQL} from '../lib/neon-database.mjs';
import {independentRequest} from '../lib/independent-runtime.mjs';
import {handleAPI} from '../lib/server.mjs';
import {hashPassword} from '../lib/passwords.mjs';
import {unseal} from '../lib/provider.mjs';
import {OWNER_EMAIL,challenge,decideManager} from '../lib/membership.mjs';
import {deliverReviewedGuidance} from '../lib/subnets.mjs';

async function fixture(t){
 const pg=new PGlite();await pg.exec(readFileSync('db/postgres/0001_somas.sql','utf8'));await pg.exec(readFileSync('db/postgres/0002_project_team_runtime.sql','utf8'));t.after(()=>pg.close());
 // Like neon(), query returns a lazy promise. Batch queries execute in one
 // real PostgreSQL transaction, including rollback on a failing statement.
 const lazy=(query,values=[])=>({query,values,then(resolve,reject){return pg.query(query,values).then(resolve,reject)}});
 const client={query:lazy,transaction:statements=>pg.transaction(async tx=>{const out=[];for(const s of statements)out.push(await tx.query(s.query,s.values));return out})};
 const db=postgresDatabase(client),mail=[];
 const env={DB:db,AUTH_MODE:'password',INDEPENDENT_HOSTING:'true',APP_DATA_KEY:'fixture-encryption-secret',SOMAS_ADMIN_USER_ID:'owner',RESEND_API_KEY:'fixture',MAIL_FROM:'SOMAS <sender@example.test>'};
 const fetcher=async(_url,init)=>{mail.push(JSON.parse(init.body));return Response.json({id:'fixture-'+mail.length})};
 function browser(){
  const jar={};return {jar,async call(path,method='GET',data,extra={}){
   const req=independentRequest(new Request('https://somas.test/api/'+path,{method,headers:{Origin:'https://somas.test','Content-Type':'application/json',Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join('; '),...extra},...(data?{body:JSON.stringify(data)}:{})}));
   const result=await handleAPI(req,env,{mailFetcher:fetcher});for(const c of result.headers.getSetCookie()){const [pair]=c.split(';');const at=pair.indexOf('=');jar[pair.slice(0,at)]=pair.slice(at+1)}
   return {status:result.status,data:await result.json()};
  }};
 }
 async function signup(email='visitor@example.test'){
  const b=browser(),password='a sufficiently long password';
  const started=await b.call('auth/email/start','POST',{email,password});assert.equal(started.status,200,JSON.stringify(started));
  assert.equal((await b.call('auth/email/status','POST',{email,id:started.data.id})).status,200);
  const code=mail.at(-1).text.match(/\b\d{8}\b/)[0];
  const verified=await b.call('auth/email/verify','POST',{email,id:started.data.id,code});assert.equal(verified.status,200,JSON.stringify(verified));return {b,email,password};
 }
 return {pg,db,env,mail,browser,signup};
}

test('PostgreSQL parameters preserve strings and conflict handling; atomic batches roll back',async t=>{
 const f=await fixture(t);assert.equal(postgresSQL("SELECT '?' AS literal, ? AS value, 'it''s ?' AS escaped"),"SELECT '?' AS literal, $1 AS value, 'it''s ?' AS escaped");
 const id="x'); DROP TABLE users;--";await f.db.prepare('INSERT OR IGNORE INTO users(id,name,email,joined,last_seen) VALUES(?,?,?,?,?)').bind(id,'User','u@example.test',Date.now(),Date.now()).run();
 assert.equal((await f.db.prepare('SELECT * FROM users WHERE id=?').bind(id).first()).joined>1e12,true);
 await assert.rejects(f.db.batch([f.db.prepare('UPDATE users SET name=? WHERE id=?').bind('Changed',id),f.db.prepare('INSERT INTO missing_table VALUES(?)').bind(id)]));
 assert.equal((await f.db.prepare('SELECT name FROM users WHERE id=?').bind(id).first()).name,'User');
});

test('Neon-compatible signup verifies once; ordinary password login sends no email and enforces tenant isolation',async t=>{
 const f=await fixture(t),a=await f.signup();
 const project=await a.b.call('projects','POST',{name:'My project',requirement:'Create a website for my bakery.'});assert.equal(project.status,201,JSON.stringify(project));
 const sent=f.mail.length;const login=f.browser();assert.equal((await login.call('auth/email/login','POST',{email:a.email,password:'incorrect password'})).status,401);
 assert.equal((await login.call('auth/email/login','POST',{email:a.email,password:a.password})).status,200);assert.equal(f.mail.length,sent);
 assert.equal((await login.call('me')).data.emailVerified,true);
 const b=await f.signup('another@example.test');assert.equal((await b.b.call('projects/'+project.data.project.id)).status,404);
 assert.equal((await f.browser().call('projects','GET',null,{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':OWNER_EMAIL})).status,401);
 assert.equal((await login.call('auth/email/start','POST',{email:a.email,password:'an attacker new password'})).status,409);
});

test('owner can configure email before verification using a provisioned password; ordinary users cannot',async t=>{
 const f=await fixture(t),now=Date.now();
 await f.db.prepare('INSERT INTO users(id,name,email,joined,last_seen) VALUES(?,?,?,?,?)').bind('owner','Owner',OWNER_EMAIL,now,now).run();
 await f.db.prepare('INSERT INTO email_logins VALUES(?,?)').bind(OWNER_EMAIL,'owner').run();
 await f.db.prepare('INSERT INTO password_credentials VALUES(?,?,?)').bind('owner',await hashPassword('owner-password-long-enough'),now).run();
 const owner=f.browser();assert.equal((await owner.call('auth/email/login','POST',{email:OWNER_EMAIL,password:'owner-password-long-enough'})).status,200);
 assert.equal((await owner.call('email-setup')).status,200);
 const ordinary=await f.signup();assert.equal((await ordinary.b.call('email-setup')).status,403);
});

test('password reset needs a browser-bound email proof and revokes previous sessions',async t=>{
 const f=await fixture(t),a=await f.signup(),b=f.browser();
 await f.db.prepare('UPDATE verification_challenges SET created=created-61000').run();
 const start=await b.call('auth/email/start','POST',{email:a.email,password:'replacement long password',flow:'reset'});assert.equal(start.status,200);
 await b.call('auth/email/status','POST',{email:a.email,id:start.data.id});const code=f.mail.at(-1).text.match(/\b\d{8}\b/)[0];
 assert.equal((await f.browser().call('auth/email/verify','POST',{email:a.email,id:start.data.id,code})).status,400);
 assert.equal((await b.call('auth/email/verify','POST',{email:a.email,id:start.data.id,code})).status,200);
 assert.equal((await a.b.call('me')).status,401);assert.equal((await a.b.call('auth/email/login','POST',{email:a.email,password:a.password})).status,401);
 assert.equal((await a.b.call('auth/email/login','POST',{email:a.email,password:'replacement long password'})).status,200);
});

test('PostgreSQL manager approval consumes one code atomically and Root guidance updates JSON receipts',async t=>{
 const f=await fixture(t),now=Date.now();
 for(const [id,email] of [['owner',OWNER_EMAIL],['applicant','applicant@example.test']])await f.db.prepare('INSERT INTO users(id,name,email,joined,last_seen,verified_email,email_verified_at) VALUES(?,?,?,?,?,?,?)').bind(id,id,email,now,now,email,now).run();
 const owner=await f.db.prepare('SELECT * FROM users WHERE id=?').bind('owner').first();
 const c=await challenge(f.env,'manager_approval','applicant','applicant',OWNER_EMAIL,'Approval','Approve applicant',{deferDelivery:true});
 await f.db.prepare('INSERT INTO manager_requests(id,applicant,reason,challenge_id,created) VALUES(?,?,?,?,?)').bind(c.id,'applicant','Community support',c.id,now).run();
 const row=await f.db.prepare('SELECT payload FROM mail_outbox WHERE id=?').bind(c.id).first(),payload=JSON.parse(await unseal(f.env.APP_DATA_KEY,row.payload,'mail:'+c.id)),code=payload.text.match(/\b\d{8}\b/)[0];
 assert.equal((await decideManager(owner,f.env,c.id,{action:'approve',code})).status,'approved');
 assert.equal((await f.db.prepare('SELECT role FROM users WHERE id=?').bind('applicant').first()).role,'manager');
 await assert.rejects(decideManager(owner,f.env,c.id,{action:'approve',code}));
 const p={id:'somas-service-root',reports:[{id:'r1',evaluation:{accepted:true},guidance:[{projectId:'subnet',message:'Please review the current status.'}]}]};
 await f.db.prepare('INSERT INTO projects(id,owner,data,updated) VALUES(?,?,?,?)').bind(p.id,'owner',JSON.stringify(p),now).run();
 await f.db.prepare('INSERT INTO subnet_links(project_id,owner,updated) VALUES(?,?,?)').bind('subnet','applicant',now).run();
 await deliverReviewedGuidance(f.db,p);await deliverReviewedGuidance(f.db,p);
 const root=JSON.parse((await f.db.prepare('SELECT data FROM projects WHERE id=?').bind(p.id).first()).data);assert.equal(root.reports[0].guidanceDelivered,1);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM subnet_messages').first()).n,1);
});
