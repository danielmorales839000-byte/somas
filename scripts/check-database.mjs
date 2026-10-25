/** Administrative read-only check. Set DATABASE_URL privately; never log its value. */
import {neon} from '@neondatabase/serverless';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyFailure} from '../src/errors.js';

const authColumns={users:['id','email','password_hash'],sessions:['token_hash','user_id','expires_at']};
const identityColumns={users:['id','email','password_hash','verified_at','role','account_status','last_login_at'],sessions:['token_hash','user_id','expires_at'],email_challenges:['id','token_hmac','pending_password_hash','expires_at','attempts','consumed_at','delivered'],role_requests:['id','user_id','requested_role','status'],role_invitations:['token_hash','user_id','consumed_at'],owner_integrations:['ciphertext','scopes','status'],oauth_states:['id','browser_hash','verifier'],booking_rules:['id','timezone','duration_min'],calendar_meetings:['id','user_id','state','token_hash','google_event_id'],booking_cells:['cell_at','meeting_id'],simulation_managers:['id','user_id','settings'],access_audit:['id','actor_id','action'],outbound_email:['id','state']};
export async function checkDatabase(sql,version4=false){
  const expected=version4?identityColumns:authColumns;
  const [ping,columns]=await sql.transaction([
    sql`SELECT 1 AS connected`,
    sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=ANY(${Object.keys(expected)}::text[])`,
  ],{readOnly:true,fetchOptions:{signal:AbortSignal.timeout(10000)}});
  const available=new Set(columns.map(row=>`${row.table_name}.${row.column_name}`));
  const missing=Object.entries(expected).flatMap(([table,names])=>names.filter(name=>!available.has(`${table}.${name}`)).map(name=>`${table}.${name}`));
  return {connected:ping[0]?.connected===1,registrationSchemaReady:missing.length===0,missing};
}
async function main(){
  if(!process.env.DATABASE_URL){console.error('DATABASE_URL is missing. Set it privately in this shell.');process.exitCode=1;return;}
  try{
    const result=await checkDatabase(neon(process.env.DATABASE_URL),process.env.AUTH_V4_ENABLED==='true');
    console.log(result.connected?'Database connection: OK (read-only)':'Database connection: failed');
    console.log(result.registrationSchemaReady?'Registration schema: required columns present':'Registration schema: missing expected columns: '+result.missing.join(', '));
    if(!result.connected||!result.registrationSchemaReady)process.exitCode=1;
  }catch(error){console.error('Read-only database check failed: '+classifyFailure(error).code+'. No connection details were printed.');process.exitCode=1;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))await main();
