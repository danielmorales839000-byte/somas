import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');

test('built independent Worker uses the real Neon HTTP driver and verifies signup before password login', {skip:!existsSync('independent-dist/server/index.js')},async t=>{
 const pg=new PGlite();await pg.exec(readFileSync('db/postgres/0001_somas.sql','utf8'));await pg.exec(readFileSync('db/postgres/0002_project_team_runtime.sql','utf8'));t.after(()=>pg.close());const mail=[],traffic=[];
 const execute=async(tx,q)=>{
  traffic.push(q.query);const r=await tx.query(q.query,q.params||[]);
  return {...r,rows:r.rows.map(row=>r.fields.map(f=>row[f.name]===null?null:String(row[f.name])))};
 };
 const moduleRoot=resolve('independent-dist/server'),modules=['index.js',...readdirSync(moduleRoot,{recursive:true}).filter(n=>n.endsWith('.js')&&n!=='index.js')].map(n=>({type:'ESModule',path:resolve(moduleRoot,n)}));
 const mf=new Miniflare({modules,modulesRoot:moduleRoot,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],assets:{directory:resolve('independent-dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},bindings:{DATABASE_URL:'postgresql://test:test@ep-fixture.us-east-2.aws.neon.tech/test?sslmode=require',APP_DATA_KEY:'worker-fixture-encryption',SOMAS_ADMIN_USER_ID:'owner',RESEND_API_KEY:'fixture',MAIL_FROM:'SOMAS <sender@example.test>'},outboundService:async request=>{
  if(request.url==='https://api.resend.com/emails'){mail.push(await request.json());return Response.json({id:'fixture-'+mail.length})}
  traffic.push(new URL(request.url).hostname);assert.match(request.url,/^https:\/\/(?:ep-fixture|api)\.[^/]+\/sql$/);const data=await request.json();
  try{return Response.json(data.queries?{results:await pg.transaction(async tx=>{const results=[];for(const q of data.queries)results.push(await execute(tx,q));return results})}:await execute(pg,data));}
  catch(error){traffic.push(error.message);return Response.json({message:error.message,code:error.code},{status:400})}
 }});t.after(()=>mf.dispose());
 assert.equal((await mf.dispatchFetch('https://somas.test/healthz')).status,200);
 const page=await mf.dispatchFetch('https://somas.test/?screen=login');assert.equal(page.status,200);assert.match(await page.text(),/data-email-auth-mode="password"/);
 const jar={};const call=async(action,data)=>{
  const r=await mf.dispatchFetch('https://somas.test/api/auth/email/'+action,{method:'POST',headers:{Origin:'https://somas.test','Content-Type':'application/json',Cookie:Object.entries(jar).map(([k,v])=>k+'='+v).join(';')},body:JSON.stringify(data)});
  for(const cookie of r.headers.getSetCookie()){const [k,v]=cookie.split(';')[0].split('=');jar[k]=v}return {status:r.status,data:await r.json()};
 };
 const email='visitor@example.test',password='a sufficiently long password';
 const start=await call('start',{email,password});assert.equal(start.status,200,JSON.stringify({start,traffic}));
 assert.equal((await call('status',{email,id:start.data.id})).data.delivery,'accepted');
 const code=mail.at(-1).text.match(/\b\d{8}\b/)[0];assert.equal((await call('verify',{email,id:start.data.id,code})).status,200);
 const count=mail.length;assert.equal((await call('login',{email,password})).status,200);assert.equal(mail.length,count);
 const forged=await mf.dispatchFetch('https://somas.test/api/me',{headers:{'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'williamkevin999999@gmail.com'}});assert.equal(forged.status,401);
});
