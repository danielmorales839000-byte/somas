import test from 'node:test';
import assert from 'node:assert/strict';
import {DASHBOARD_PATH,safeContinuePath,welcomePath,signInPath,legacySignInPath} from '../lib/login-flow.mjs';

test('email sign-in goes directly to its requested workspace without a post-verification detour',()=>{
 const auth=new URL(signInPath(),'https://somas.test');assert.equal(auth.pathname,'/');assert.equal(auth.searchParams.get('screen'),'login');assert.equal(auth.searchParams.get('next'),DASHBOARD_PATH);assert.equal(auth.searchParams.has('return_to'),false);
});
test('existing owner hosting sign-in remains available for setup and recovery',()=>{
 const auth=new URL(legacySignInPath('/?screen=email-setup'),'https://somas.test');assert.equal(auth.pathname,'/signin-with-chatgpt');const welcome=new URL(auth.searchParams.get('return_to'),'https://somas.test');assert.equal(welcome.searchParams.get('welcome'),'1');assert.equal(welcome.searchParams.get('next'),'/?screen=email-setup');
});

test('the overview preserves the original project or settings destination',()=>{
  for(const destination of ['/?business=private-project&view=business','/?screen=new','/?screen=connect','/?screen=users&user=one#projects']){
    const welcome=new URL(welcomePath(destination),'https://somas.test');
    assert.equal(welcome.searchParams.get('next'),destination);
    assert.equal(safeContinuePath(welcome.searchParams.get('next')),destination);
  }
});

test('welcome continuation rejects external redirects and authentication loops',()=>{
  for(const destination of [null,'','https://elsewhere.test','//elsewhere.test','/\\elsewhere.test','/signin-with-chatgpt','/signout-with-chatgpt/','/callback?code=unused','/?screen=login&next=%2F','/?screen=signup','/?welcome=1&next=%2F','/']){
    assert.equal(safeContinuePath(destination),DASHBOARD_PATH);
  }
});
