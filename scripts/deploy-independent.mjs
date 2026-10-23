import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {neonDatabase} from '../lib/neon-database.mjs';
const required=['DATABASE_URL','APP_DATA_KEY','SOMAS_ADMIN_USER_ID','SOMAS_RUNNER_TOKEN'];
if(required.some(key=>!process.env[key]))throw Error('Missing required deployment secrets. See docs/cloudflare-neon.md.');
const configPath='independent-dist/server/wrangler.json',config=JSON.parse(readFileSync(configPath,'utf8'));
if(config.name!=='somas-cloudflare-neon'||config.d1_databases?.length||config.vars?.AUTH_MODE!=='password')throw Error('Build the independent Cloudflare target first.');
if(process.env.APP_DATA_KEY.length<32||process.env.SOMAS_RUNNER_TOKEN.length<32)throw Error('Encryption and runner secrets must be at least 32 characters.');
try{
 const db=await neonDatabase(process.env.DATABASE_URL);
 const owner=await db.prepare('SELECT u.id FROM users u JOIN password_credentials p ON p.user_id=u.id WHERE u.id=? AND u.status=?').bind(process.env.SOMAS_ADMIN_USER_ID,'active').first();
 if(!owner)throw Error('owner');
 await db.prepare('SELECT challenge_id FROM password_signups LIMIT 1').all();
 await db.prepare('SELECT team_runtime FROM project_publications LIMIT 1').all();
}catch{throw Error('Database preflight failed. Apply migrations and provision the owner before deployment.');}
const values=Object.fromEntries(required.map(key=>[key,process.env[key]]));
for(const key of ['GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','OAUTH_PUBLIC_ORIGIN'])if(process.env[key])values[key]=process.env[key];
const wrangler='node_modules/wrangler/bin/wrangler.js';
// Secrets travel over stdin, not command arguments, output or temporary files.
let result=spawnSync(process.execPath,[wrangler,'secret','bulk','--config',configPath],{input:JSON.stringify(values),stdio:['pipe','inherit','inherit']});
if(result.status!==0)process.exit(result.status||1);
result=spawnSync(process.execPath,[wrangler,'deploy','--config',configPath],{stdio:'inherit'});
process.exit(result.status||0);
