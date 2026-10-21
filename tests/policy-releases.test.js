import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateEvaluation,releasePolicy} from '../src/policy-releases.js';
import {newPolicy} from '../src/agents.js';

test('candidate gate stores an independent rollback snapshot without mutating the base policy',()=>{
  const base=newPolicy('manager'),candidate={evaluation:{eligible:true}};
  const recorded=candidateEvaluation(candidate,base);
  recorded.rollbackPolicy.weights[0][0]=123;
  assert.equal(base.weights[0][0],0);assert.deepEqual(candidate.evaluation,{eligible:true});
});

test('release gate accepts only constant store scopes before constructing SQL',async()=>{
  for(const scope of ['__proto__','toString','customer;DROP TABLE users']){
    await assert.rejects(()=>releasePolicy({}, {scope,candidateId:'ignored'}),/invalid_policy_scope/);
  }
});
