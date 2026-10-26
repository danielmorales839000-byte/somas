import test from 'node:test';
import assert from 'node:assert/strict';
import {exampleDiscussions} from '../public/exhibition/example-discussions.js';
test('55 unique virtual discussion starters remain static and clearly fictional',()=>{
 assert.equal(exampleDiscussions.length,55);assert.equal(new Set(exampleDiscussions.map(x=>x.id)).size,55);assert.equal(new Set(exampleDiscussions.map(x=>x.title)).size,55);
 for(const d of exampleDiscussions){assert.match(d.author,/^Virtual contributor/);assert(d.body.length>200);assert(!d.email);assert(!d.votes);assert.equal(d.replies.length,3);assert(d.replies.every(r=>r.author.startsWith('Virtual')));}
});
