import {scorePolicy, trainVerified, labelsForRole} from './agents.js';
/** Train on owner-labelled examples only. Holdout scores are a basic gate, not proof of safety. */
export function prepareCandidate(policy,examples){
  if(!Array.isArray(examples)||examples.length<5)throw new Error('at_least_5_verified_examples_required');
  if(examples.length>500)throw new Error('too_many_training_examples');
  const ordered=[...examples];const split=Math.max(3,Math.floor(ordered.length*0.8));
  const train=ordered.slice(0,split),holdout=ordered.slice(split);
  if(!holdout.length)throw new Error('no_holdout_examples');
  let next=structuredClone(policy);
  for(let e of train)next=trainVerified(next,e.input,e.label);
  const accuracy=p=>holdout.filter(e=>scorePolicy(p,e.input)[0].label===e.label).length/holdout.length;
  const baseAccuracy=accuracy(policy), candidateAccuracy=accuracy(next);
  return {policy:next,evaluation:{verifiedSamples:examples.length,trainingSamples:train.length,holdoutSamples:holdout.length,baseAccuracy,candidateAccuracy,eligible:candidateAccuracy>=baseAccuracy&&candidateAccuracy>=0.5}};
}
export function validateTrainingLabel(role,label){return !!labelsForRole(role)?.includes(label);}
