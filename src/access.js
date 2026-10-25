import { sha256 } from './auth.js';
export const v4 = env => env.AUTH_V4_ENABLED === 'true';
export const owner = (u,env) => !!u && (v4(env) ? u.role==='owner' && u.id===env.ADMIN_USER_ID : u.id===env.ADMIN_USER_ID && !!env.ADMIN_USER_ID);
export const staff = (u,env) => owner(u,env) || (v4(env) && !!u?.verified_at && ['assistor','administrator'].includes(u.role) && u.account_status==='active');
export const administrator = (u,env) => owner(u,env) || (v4(env) && !!u?.verified_at && u.role==='administrator' && u.account_status==='active');
export async function accessUser(req,sql,env){const token=/(?:^|;\s*)somas_session=([0-9a-f]{64})(?:;|$)/.exec(req.headers.get('cookie')||'')?.[1];if(!token)return null;const [u]=await sql`SELECT u.id,u.email,u.role,u.verified_at,u.account_status,u.last_login_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${await sha256(token)} AND s.expires_at>now() AND u.account_status='active' LIMIT 1`;return u||null;}
