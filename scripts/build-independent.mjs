import {spawnSync} from 'node:child_process';
import {readFileSync,cpSync,rmSync} from 'node:fs';
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,SOMAS_DEPLOY_TARGET:'cloudflare-neon'}});
if(result.status!==0)process.exit(result.status||1);
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
if(config.name!=='somas-cloudflare-neon'||config.d1_databases?.length||config.vars?.AUTH_MODE!=='password')throw Error('Unexpected deployment target.');
// Vinext controls dist/server and dist/client; retain an explicitly separate
// deploy directory so a later Sites build cannot overwrite the external build.
rmSync('independent-dist',{recursive:true,force:true});cpSync('dist','independent-dist',{recursive:true});
console.log('Cloudflare + Neon build: independent-dist/server/wrangler.json');
