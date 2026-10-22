/** Offline artifact review helper. Never deploys or authenticates to a hosting provider. */
import {canonicalJson} from '../src/integrity.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const [input,output,expectedDigest]=process.argv.slice(2);
if(!input||!output||!expectedDigest)throw new Error('Usage: node scripts/unpack-application.mjs package.json EMPTY_OUTPUT_DIRECTORY EXPECTED_DIGEST');
const bundle=JSON.parse(await readFile(input,'utf8'));
if(bundle.format!=='somas.application.v1'||!bundle.files||bundle.status!=='prepared')throw new Error('Unsupported artifact');
const digest=createHash('sha256').update(canonicalJson(bundle.files)).digest('hex');
const artifactDigest=createHash('sha256').update(canonicalJson(bundle)).digest('hex');
if(digest!==bundle.digest||artifactDigest!==expectedDigest)throw new Error('Artifact digest mismatch');
const allowed=new Set(['src/index.js','wrangler.json','README.md']);
if(Object.keys(bundle.files).length!==allowed.size||Object.keys(bundle.files).some(name=>!allowed.has(name)))throw new Error('Unexpected file path');
const destination=resolve(output);await mkdir(destination); // existing output fails closed
for(const [name,content] of Object.entries(bundle.files)) {
  if(typeof content!=='string'||content.length>100000)throw new Error('Invalid artifact content');
  const path=join(destination,name);await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,content,{flag:'wx'});
}
console.log('Pinned application package unpacked for review. No deployment was performed.');
