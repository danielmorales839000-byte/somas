import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {validateOverview,windows} from '../public/exhibition/v5/network-overview.js';
const root=new URL('../public/exhibition/dataset/',import.meta.url),data=JSON.parse(readFileSync(new URL('network-overview.json',root)));
test('network windows reconcile with every timestamped claim in the supplied corpus, including partial boundary hours',()=>{
 const claims=[];for(const f of readdirSync(new URL('organizations/',root))){if(f.endsWith('.json'))claims.push(...JSON.parse(readFileSync(new URL('organizations/'+f,root))).claims);}
 assert.equal(new Set(claims.map(c=>c.id)).size,15000);assert.equal(claims.length,15000);assert.equal(validateOverview(data),data);
 for(const [key] of windows){const r=data.ranges[key];const end=Date.parse(r.end),start=r.start?Date.parse(r.start):-Infinity;const exact=claims.filter(c=>Date.parse(c.recorded_at)>=start&&Date.parse(c.recorded_at)<end);assert.equal(r.total,exact.length);for(const decision of ['approved','rejected','pending']){assert.equal(r[decision],exact.filter(c=>c.decision===decision).length);assert.equal(r.bins.reduce((n,b)=>n+b[decision],0),r[decision]);}}
 assert.equal(Object.values(data.states).reduce((a,b)=>a+b,0),data.counts.somas);assert.equal(data.ranges.all.approved,9000);assert.equal(data.blocks[0].height,1500);
});
test('malformed or inconsistent network totals fail instead of becoming visible metrics',()=>{const wrong=structuredClone(data);wrong.ranges['1h'].approved++;assert.throws(()=>validateOverview(wrong));assert.throws(()=>validateOverview({...data,source:'real'}));});
