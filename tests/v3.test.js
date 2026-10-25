import test from 'node:test';
import assert from 'node:assert/strict';
import {managerSteps,validateMission} from '../public/exhibition/v3.js';
import {nav} from '../public/exhibition/data.js';
import {worlds} from '../public/exhibition/world-data.js';
test('v3 navigation removes About and exposes Platform gateway',()=>{assert.equal(nav.length,7);assert(nav.some(n=>n[0]==='/platform/'));assert(!nav.some(n=>n[0]==='/idea/'));assert(!worlds.some(n=>n.url==='/idea/'));});
test('manager demo has five steps and requires a measurable mission',()=>{assert.equal(managerSteps.length,5);assert(!validateMission({name:'A',goal:'B'}));assert(validateMission({name:'A',goal:'B',measure:'C'}));});
import {readFileSync} from 'node:fs';
test('historical chart aggregates reconcile with source corpus totals',()=>{const a=JSON.parse(readFileSync(new URL('../public/exhibition/dataset/analytics.json',import.meta.url)));const total=k=>a.days.reduce((n,d)=>n+d[k],0);assert.equal(a.source,'simulated');assert.equal(total('tasks'),120000);assert.equal(total('events'),240000);assert.equal(total('claims'),15000);assert.equal(total('approved')+total('rejected')+total('pending'),15000);assert.equal(Object.values(a.learning_bins).reduce((x,y)=>x+y,0),10001);});
