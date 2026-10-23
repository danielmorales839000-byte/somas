import {readFileSync,readdirSync} from 'node:fs';
import {neon} from '@neondatabase/serverless';
import {createHash} from 'node:crypto';
if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL securely before running this command.');
const sql=neon(process.env.DATABASE_URL,{fullResults:true});
await sql.query('CREATE TABLE IF NOT EXISTS somas_schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at bigint NOT NULL)');
for(const name of readdirSync('db/postgres').filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
 const content=readFileSync('db/postgres/'+name,'utf8'),checksum=createHash('sha256').update(content).digest('hex');
 const existing=await sql.query('SELECT sha256 FROM somas_schema_migrations WHERE name=$1',[name]);
 if(existing.rows.length){if(existing.rows[0].sha256!==checksum)throw Error('An applied migration changed: '+name);console.log('Already applied: '+name);continue;}
 // Each migration and its checksum are committed together. Schema files contain
 // no semicolons in strings or functions; reject unexpected input rather than
 // silently executing only part of a migration.
 const statements=content.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean);
 await sql.transaction([
  sql.query("SELECT pg_advisory_xact_lock(hashtext('somas-schema-migrations'))"),
  ...statements.map(statement=>sql.query(statement)),
  sql.query('INSERT INTO somas_schema_migrations(name,sha256,applied_at) VALUES($1,$2,$3)',[name,checksum,Date.now()])
 ]);
 console.log('Applied: '+name);
}
