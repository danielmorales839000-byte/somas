import test from 'node:test';
import assert from 'node:assert/strict';
import {sharePlatforms,postIdea,shareDestination} from '../public/exhibition/sharing.js';
test('sharing supports 12 distinct destinations with concept-specific honest drafts',()=>{
 assert.equal(sharePlatforms.length,12);assert.equal(new Set(sharePlatforms).size,12);
 for(const theme of ['overview','platform','network','contributors']){
  const x=postIdea(theme,'X','https://somas.example');assert(x.text.length<280);assert.match(x.text,/concept/i);
  const reddit=postIdea(theme,'Reddit','https://somas.example');assert.match(reddit.text,/simulated/);assert.match(reddit.text,/criticism/);
 }
 assert.notEqual(postIdea('network','Reddit','https://somas.example').text,postIdea('platform','Reddit','https://somas.example').text);
});
test('share URLs preserve edited text through URL encoding',()=>{
 const text='A & B? #SOMAS\nUnicode: 学习';
 const x=new URL(shareDestination('X',text,'Title','https://somas.example'));assert.equal(x.searchParams.get('text'),text);
 const reddit=new URL(shareDestination('Reddit',text,'Edited title','https://somas.example'));assert.equal(reddit.searchParams.get('title'),'Edited title');assert.equal(reddit.searchParams.get('text'),text);
 for(const p of sharePlatforms){const dest=shareDestination(p,text,'Title','https://somas.example');assert(dest.startsWith('https://')||dest.startsWith('mailto:'));}
 assert(!shareDestination('Facebook',text,'Title','https://somas.example').includes('Unicode'));
});
