import {neonDatabase} from '../lib/neon-database.mjs';
import {hashPassword} from '../lib/passwords.mjs';
import {OWNER_EMAIL} from '../lib/membership.mjs';
const {DATABASE_URL,SOMAS_ADMIN_USER_ID,SOMAS_OWNER_PASSWORD}=process.env;
if(!DATABASE_URL||!SOMAS_ADMIN_USER_ID||!SOMAS_OWNER_PASSWORD)throw Error('Set DATABASE_URL, SOMAS_ADMIN_USER_ID and SOMAS_OWNER_PASSWORD securely.');
const db=await neonDatabase(DATABASE_URL),now=Date.now();
const existing=await db.prepare('SELECT user_id FROM email_logins WHERE email=?').bind(OWNER_EMAIL).first();
if(existing&&existing.user_id!==SOMAS_ADMIN_USER_ID)throw Error('Owner mailbox belongs to a different user. Resolve this before provisioning.');
// Never reset an existing owner password or mark an inbox verified here.
if(await db.prepare('SELECT user_id FROM password_credentials WHERE user_id=?').bind(SOMAS_ADMIN_USER_ID).first())throw Error('Owner already has a password. Use the password reset page instead.');
await db.batch([
 db.prepare('INSERT OR IGNORE INTO users(id,name,email,joined,last_seen) VALUES(?,?,?,?,?)').bind(SOMAS_ADMIN_USER_ID,'Owner',OWNER_EMAIL,now,now),
 db.prepare('INSERT OR IGNORE INTO email_logins(email,user_id) VALUES(?,?)').bind(OWNER_EMAIL,SOMAS_ADMIN_USER_ID),
 db.prepare('INSERT INTO password_credentials(user_id,password_hash,updated) VALUES(?,?,?)').bind(SOMAS_ADMIN_USER_ID,await hashPassword(SOMAS_OWNER_PASSWORD),now)
]);
console.log('Owner provisioned. Log in and open /?screen=email-setup to connect Gmail.');
