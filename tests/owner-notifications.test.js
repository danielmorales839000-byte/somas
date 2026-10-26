import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyOwner} from '../src/owner-notifications.js';
test('owner notifications send only to configured owner and retain message text',async()=>{
 let sent;const result=await notifyOwner({}, {SOMAS_OWNER_EMAIL:'owner@example.com'},'New reply','Visitor content',async(...args)=>{sent=args;});
 assert.equal(result,'accepted');assert.equal(sent[2],'owner@example.com');assert.equal(sent[4],'Visitor content');
});
test('notification delivery failure does not reject saved visitor activity',async()=>{
 assert.equal(await notifyOwner({}, {SOMAS_OWNER_EMAIL:'owner@example.com'},'New reply','Content',async()=>{throw Error('private provider detail');}),'failed');
 assert.equal(await notifyOwner({}, {},'New reply','Content',async()=>{throw Error('must not send');}),'not_configured');
});
