/** Administrative read-only check. Set DATABASE_URL privately; never log its value. */
import {neon} from '@neondatabase/serverless';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyFailure} from '../src/errors.js';

const authColumns={users:['id','email','password_hash'],workspaces:['id','owner_id','name'],subscriptions:['workspace_id','status','plan'],sessions:['token_hash','user_id','expires_at']};
export async function checkDatabase(sql){
  const [ping,columns]=await sql.transaction([
    sql`SELECT 1 AS connected`,
    sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('users','workspaces','subscriptions','sessions')`,
  ],{readOnly:true,fetchOptions:{signal:AbortSignal.timeout(10000)}});
  const available=new Set(columns.map(row=>`${row.table_name}.${row.column_name}`));
  const missing=Object.entries(authColumns).flatMap(([table,names])=>names.filter(name=>!available.has(`${table}.${name}`)).map(name=>`${table}.${name}`));
  return {connected:ping[0]?.connected===1,registrationSchemaReady:missing.length===0,missing};
}
async function main(){
  if(!process.env.DATABASE_URL){console.error('DATABASE_URL is missing. Set it privately in this shell.');process.exitCode=1;return;}
  try{
    const result=await checkDatabase(neon(process.env.DATABASE_URL));
    console.log(result.connected?'Database connection: OK (read-only)':'Database connection: failed');
    console.log(result.registrationSchemaReady?'Registration schema: required columns present':'Registration schema: missing expected columns: '+result.missing.join(', '));
    if(!result.connected||!result.registrationSchemaReady)process.exitCode=1;
  }catch(error){console.error('Read-only database check failed: '+classifyFailure(error).code+'. No connection details were printed.');process.exitCode=1;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
