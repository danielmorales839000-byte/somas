// Import a complete SQLite database backup into a FRESH Neon database.
// Run once, before cutover, with writes stopped on the source.
import {DatabaseSync} from 'node:sqlite';
import {neon} from '@neondatabase/serverless';
import {unseal} from '../lib/provider.mjs';
const sourcePath=process.argv[2];
if(!sourcePath||!process.env.DATABASE_URL)throw Error('Usage: DATABASE_URL=... node scripts/import-d1.mjs /path/to/complete.sqlite');
const source=new DatabaseSync(sourcePath,{readOnly:true}),sql=neon(process.env.DATABASE_URL,{fullResults:true});
const destination=await sql.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
const sourceTables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
const excluded=new Set(['email_sessions','oauth_states','verification_challenges','login_limits','mail_outbox','somas_schema_migrations','__drizzle_migrations','d1_migrations']);
const tables=destination.rows.map(r=>r.tablename).filter(n=>!excluded.has(n)&&sourceTables.includes(n));
const unknown=sourceTables.filter(n=>!excluded.has(n)&&!tables.includes(n));
if(unknown.length)throw Error('Backup contains tables missing from the destination schema. Review the schema before importing.');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const queries=[];
for(const table of tables){
 const count=await sql.query('SELECT COUNT(*) AS n FROM '+quote(table));
 if(Number(count.rows[0].n)!==0)throw Error('Destination is not empty: '+table+'. Import is for a fresh database only.');
 const target=(await sql.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',['public',table])).rows.map(r=>r.column_name);
 const columns=source.prepare('PRAGMA table_info('+quote(table)+')').all().map(c=>c.name);
 if(columns.some(c=>!target.includes(c)))throw Error('Destination schema is missing columns for '+table);
 for(const row of source.prepare('SELECT * FROM '+quote(table)).all()){
  const contexts={accounts:row.owner,email_sender:'email-sender',oauth_providers:'oauth-provider:'+row.provider,hosting_connections:'hosting:'+row.owner,project_publications:'subnet:'+row.project_id};
  if(row.secret&&Object.hasOwn(contexts,table)){
   if(!process.env.APP_DATA_KEY)throw Error('The original APP_DATA_KEY is required to preserve encrypted connections.');
   try{await unseal(process.env.APP_DATA_KEY,row.secret,contexts[table])}catch{throw Error('The encryption key cannot decrypt '+table+'. Stop and recover the original key before migration.');}
  }
  queries.push(sql.query('INSERT INTO '+quote(table)+'('+columns.map(quote).join(',')+') VALUES('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(c=>row[c])));
 }
}
// No partial import: any constraint error rolls back all imported tables.
if(queries.length>10000)throw Error('Backup exceeds this bounded importer. Use a dedicated PostgreSQL migration tool.');
if(queries.length)await sql.transaction(queries);
source.close();console.log('Imported '+queries.length+' records. Verify counts and reconfigure sender/OAuth origins before cutover.');
