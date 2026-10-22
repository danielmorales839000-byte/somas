import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardModel} from '../design/command-center/model.js';
const base=()=>({id:'customer-a',mission:'Improve the owners application',agents:[{id:'m',role:'manager',policy_version:1},{id:'x',role:'accessibility_specialist',policy_version:3}],operations:{missions:[],jobs:[],reports:[],queue:[],candidates:[]}});
test('command center renders actual dynamic agents with no invented work or progress',()=>{
 const m=dashboardModel(base());assert.equal(m.cards.length,2);assert.equal(m.cards[1].label,'Accessibility Specialist');assert.equal(m.cards[1].state,'Not scheduled');assert.equal(m.cards[1].progress,null);assert.deepEqual(m.edges,[]);assert.equal(m.feed.length,0);assert.equal(m.metrics.running,0);
});
test('command center uses recorded assignments, leases and failures rather than online assumptions',()=>{
 const i=base();i.operations.missions=[{id:'mission',agent_role:'accessibility_specialist',manager_id:'m',state:'active',objective:'Verify only owner authorized pages'}];
 i.operations.jobs=[{id:'job',mission_id:'mission',state:'leased',lease_until:'2026-10-22T01:00:00Z'}];
 assert.equal(dashboardModel(i,Date.parse('2026-10-22T00:00:00Z')).cards[1].state,'Running');
 assert.equal(dashboardModel(i,Date.parse('2026-10-22T02:00:00Z')).cards[1].state,'Recovering');
 assert.deepEqual(dashboardModel(i).edges,[{from:'m',to:'x',type:'assignment'}]);
 delete i.operations.jobs[0].lease_until;assert.equal(dashboardModel(i).cards[1].state,'Lease recorded');
 i.operations.jobs[0].state='failed';assert.equal(dashboardModel(i).cards[1].state,'Blocked');
});
test('command center does not infer departments or cross-instance graph links',()=>{
 const i=base();i.operations.missions=[{id:'a',unit_id:'customer-other',agent_id:'x',manager_id:'m'},{id:'b',agent_id:'foreign-agent',manager_id:'m'}];
 assert.deepEqual(dashboardModel(i).edges,[]);assert.equal(dashboardModel(i).cards[1].state,'Not scheduled');
});
test('command center derives review counts and activity from records only',()=>{
 const i=base();i.operations.candidates=[{id:'a',state:'testing'},{id:'b',state:'ready'}];
 i.operations.reports=[{id:'report',agent_id:'x',created_at:'2026-10-22T00:00:00Z',evidence:{method:'playwright_chromium'}}];
 i.operations.queue=[{id:'decision',created_at:'2026-10-22T01:00:00Z',decision:{action:'Require independent browser retest'}}];
 const m=dashboardModel(i);assert.equal(m.metrics.approvals,1);assert.equal(m.metrics.evidence,1);assert.equal(m.feed[0].type,'Manager decision');assert.equal(m.feed[1].text,'playwright_chromium');
});
