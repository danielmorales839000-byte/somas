import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {neonFixture} from './helpers/neon-fixture.js';

test('actual Worker bundle registers and authenticates against isolated Neon HTTP fixture',async()=>{
  const db=neonFixture();
  const bundle=await build({entryPoints:['src/index.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  const mf=new Miniflare(convertV4MiniflareOptions({
    compatibilityDate:'2026-10-21',modules:true,script:bundle.outputFiles[0].text,
    bindings:{DATABASE_URL:'postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require'},
    outboundService:async request=>db.fetch(request.url,{body:await request.text()}),
  }));
  const origin='https://worker.test';
  const send=(path,data,cookie)=>mf.dispatchFetch(origin+path,{
    method:data?'POST':'GET',headers:{Origin:origin,'content-type':'application/json','x-somas-request':'1',...(cookie?{Cookie:cookie}:{})},
    ...(data?{body:JSON.stringify(data)}:{}),
  });
  try{
    const credentials={email:'runtime@example.test',password:'disposable-runtime-password'};
    const registered=await send('/api/auth/register',credentials);
    assert.equal(registered.status,201,await registered.clone().text());
    assert.match(registered.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
    const cookie=registered.headers.get('set-cookie').split(';')[0];
    assert.equal((await send('/api/me',undefined,cookie)).status,200);
    assert.equal((await send('/api/auth/logout',{},cookie)).status,200);
    assert.equal((await send('/api/me',undefined,cookie)).status,401);
    assert.equal((await send('/api/auth/login',credentials)).status,200);
    assert.equal(db.state.workspaces.length,1);
  }finally{await mf.dispose();}
});
