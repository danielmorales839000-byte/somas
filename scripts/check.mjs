import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';
for(const file of ['worker.mjs','public/app.js','public/inbox.js'])execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
const html=readFileSync('public/index.html','utf8');for(const id of ['idea','network','films','join','contact-form'])if(!html.includes(`id="${id}"`))throw Error('Missing section '+id);for(const video of ['Dg7Pd0UEOP8','HkwzQq3NyHc'])if(!html.includes(video))throw Error('Missing video');console.log('Source checks passed. Static page: '+Buffer.byteLength(html)+' bytes.');
