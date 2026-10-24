import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
for(const f of ['worker.mjs','public/experience.js','public/experience-data.js','public/inbox.js'])execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
const {teamSteps,networkSteps}=await import('../public/experience-data.js');
for(const [name,steps] of [['team',teamSteps],['network',networkSteps]]){if(steps.length!==26||new Set(steps.map(s=>s[2])).size!==26)throw Error(name+' must have 26 distinct actions');if(steps.at(-1)[4]!==100)throw Error('Incomplete sequence')}
for(const page of ['index.html','team.html','network.html','privacy.html','inbox.html']){const s=readFileSync('public/'+page,'utf8');if(!s.includes('global-actions'))throw Error('Missing global controls: '+page)}
console.log('Passed: JS syntax, 52 distinct simulation actions, global controls on all five pages.');
