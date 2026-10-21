import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_ROLES,newPolicy,scorePolicy,trainVerified,chooseTeam,initialSpec,validateSpec,proposeRevision,renderSite,virtualCustomerHeuristics,features,normalizeInput} from '../src/agents.js';
import {prepareCandidate,validateTrainingLabel} from '../src/learning.js';
import {cookieForSession,sessionCookie,checkMutationOrigin,hashPassword,verifyPassword} from '../src/auth.js';

test('three independent core policies have separate weights',()=>{
  const [m,a,v]=CORE_ROLES.map(newPolicy);
  assert.notDeepEqual(m.labels,a.labels);assert.notDeepEqual(a.labels,v.labels);
  assert.equal(m.weights[0].length,48);
  const updated=trainVerified(m,'fix failed checkout bug','bug');
  assert.equal(updated.version,2);assert.equal(m.version,1);
  assert.equal(a.version,1);assert.notDeepEqual(updated.weights,m.weights);
});
test('hashed feature vectors are bounded and deterministic',()=>{
  const a=features('Checkout keeps failing');assert.deepEqual(a,features('Checkout keeps failing'));
  assert.equal(a.length,48);assert.ok(a.every(Number.isFinite));
});
test('manager creates contextual specialist teams',()=>{
  assert.ok(chooseTeam('Our payment checkout has a bug').specialists.includes('diagnostic_specialist'));
  assert.ok(chooseTeam('Please research latest guidance').specialists.includes('research_specialist'));
  assert.ok(chooseTeam('Change colors and design').specialists.includes('design_specialist'));
});
test('template validation and safe title edit',()=>{
  const s=initialSpec('Coffee House','A neighborhood cafe with a welcoming atmosphere.','business');
  validateSpec(s);
  const result=proposeRevision(s,'Change title to Morning Cafe');
  assert.equal(result.supported,true);assert.equal(result.nextSpec.title,'Morning Cafe');assert.equal(s.title,'Coffee House');
});
test('unsupported functionality is not falsely implemented',()=>{
  const s=initialSpec('Coffee House','A neighborhood cafe with a welcoming atmosphere.');
  const result=proposeRevision(s,'Add a functional payment processor with a complete backend');
  assert.equal(result.supported,false);assert.equal(result.nextSpec,null);
});
test('HTML user content is escaped and protected',()=>{
  const spec=initialSpec('Original Site','A safe ordinary sample project description.');
  spec.tagline='<img src=x onerror=alert(1)>';spec.sections[0].body='<script>steal()</script>';
  const html=renderSite(spec,'test-slug');
  assert.ok(!html.includes('<script>steal()'));
  assert.ok(html.includes('&lt;script&gt;steal()&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img'));
});
test('Virtual Customer reports heuristics rather than pretending to navigate',()=>{
  const spec=initialSpec('Test Store','A carefully described digital storefront.','store');
  const f=virtualCustomerHeuristics(spec);
  assert.ok(f.some(x=>x.title==='Store checkout not implemented'));
  assert.ok(f.every(x=>['usability_hypothesis','coverage_gap'].includes(x.kind)));
});
test('training example requires validated label and minimum examples',()=>{
  assert.equal(validateTrainingLabel('manager','bug'),true);
  assert.equal(validateTrainingLabel('manager','bogus'),false);
  assert.throws(()=>prepareCandidate(newPolicy('manager'),[]),/at_least_5/);
  const examples=Array.from({length:10},(_,i)=>({input:`fix checkout bug case ${i} with error`,label:'bug'}));
  const result=prepareCandidate(newPolicy('manager'),examples);
  assert.equal(result.policy.version,9);assert.equal(result.evaluation.holdoutSamples,2);
  assert.equal(typeof result.evaluation.eligible,'boolean');
});
test('password hashing and verification works',async()=>{
  const hash=await hashPassword('very secure phrase 1234');
  assert.ok(await verifyPassword('very secure phrase 1234',hash));
  assert.equal(await verifyPassword('wrong password 1234',hash),false);
  await assert.rejects(()=>hashPassword('short'),/password_must_be_12/);
});
test('session cookies and CSRF protections',()=>{
  const token='a'.repeat(64);
  const cookie=cookieForSession(token,'https://example.com');
  assert.ok(cookie.includes('HttpOnly; SameSite=Strict'));
  assert.ok(cookie.includes('; Secure'));
  const req=new Request('https://example.com/api/test',{headers:{cookie}});
  assert.equal(sessionCookie(req),token);
  assert.equal(checkMutationOrigin(new Request('https://example.com/api/test',{method:'POST',headers:{origin:'https://attacker.com','x-somas-request':'1'}})),false);
  assert.equal(checkMutationOrigin(new Request('https://example.com/api/test',{method:'POST',headers:{origin:'https://example.com','x-somas-request':'1'}})),true);
});
test('reject invalid spec and empty tasks',()=>{
  const s=initialSpec('Hello Site','A usable project description');s.theme='<evil>';
  assert.throws(()=>validateSpec(s),/invalid_theme/);
  assert.throws(()=>normalizeInput('short'),/description_must_be/);
});

import {verifyPaddleSignature,paddleStatusToSomas} from '../src/billing.js';
test('dynamic specialist agents have independently trainable policies',()=>{
  const a=newPolicy('content_editor');const b=newPolicy('software_architect');
  assert.deepEqual(a.labels,['execute','research','verify','escalate']);
  assert.deepEqual(b.labels,a.labels);
  const updated=trainVerified(a,'Check correctness of website','verify');
  assert.equal(updated.version,2);assert.equal(b.version,1);
  assert.equal(validateTrainingLabel('content_editor','verify'),true);
});
test('Paddle signature rejects altered and outdated webhook content',async()=>{
  const body=JSON.stringify({event_type:'subscription.created',event_id:'test'}),secret='sample-secret';
  const ts=1700000000;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${ts}:${body}`)));
  const h1=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  assert.equal(await verifyPaddleSignature(body,`ts=${ts};h1=${h1}`,secret,ts),true);
  assert.equal(await verifyPaddleSignature(body+'altered',`ts=${ts};h1=${h1}`,secret,ts),false);
  assert.equal(await verifyPaddleSignature(body,`ts=${ts};h1=${h1}`,secret,ts+301),false);
  assert.equal(paddleStatusToSomas('paused'),'suspended');
});
import {readBoundedText} from '../src/http.js';
test('externally fetched data is capped even without content length',async()=>{
  const response=new Response('hello world');
  assert.equal(await readBoundedText(response,20),'hello world');
  await assert.rejects(()=>readBoundedText(new Response('a'.repeat(60)),50),/external_source_too_large/);
});
