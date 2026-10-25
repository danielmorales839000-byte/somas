// Deployment-time CLI only; no public owner registration route.
import {hashPassword} from '../src/auth.js';
import {neon} from '@neondatabase/serverless';
const {DATABASE_URL,SOMAS_OWNER_EMAIL,ADMIN_USER_ID}=process.env;
if(!DATABASE_URL||!SOMAS_OWNER_EMAIL||!ADMIN_USER_ID)throw Error('Set DATABASE_URL, SOMAS_OWNER_EMAIL and ADMIN_USER_ID in your private environment file.');
const sql=neon(DATABASE_URL);
const [existing]=await sql`SELECT id FROM users WHERE id=${ADMIN_USER_ID} OR lower(email)=${SOMAS_OWNER_EMAIL.toLowerCase()}`;
if(!existing){if(!process.env.SOMAS_OWNER_PASSWORD)throw Error('For a fresh install set SOMAS_OWNER_PASSWORD privately (12–128 characters).');const hash=await hashPassword(process.env.SOMAS_OWNER_PASSWORD);await sql`INSERT INTO users(id,email,password_hash) VALUES(${ADMIN_USER_ID},${SOMAS_OWNER_EMAIL.toLowerCase()},${hash})`;}
const rows=await sql`UPDATE users SET role='owner',verified_at=coalesce(verified_at,now()) WHERE id=${ADMIN_USER_ID} AND lower(email)=${SOMAS_OWNER_EMAIL.toLowerCase()} AND NOT EXISTS(SELECT 1 FROM users WHERE role='owner' AND id<>${ADMIN_USER_ID}) RETURNING id`;
if(rows.length!==1)throw Error('Owner identity not found or conflicts with existing owner. No public owner route exists.');
await sql`DELETE FROM sessions WHERE user_id=${ADMIN_USER_ID}`;
console.log('Owner bootstrap complete. Sign in again. Do not leave a public bootstrap flag enabled.');
