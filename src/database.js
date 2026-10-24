import { neon } from "@neondatabase/serverless";
export function database(env) {
  if (!env.DATABASE_URL) throw new Error("missing_database_url");
  return neon(env.DATABASE_URL);
}
export async function getUserFromSession(sql, hash) {
  return (
    (
      await sql`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hash} AND s.expires_at>now() LIMIT 1`
    )[0] || null
  );
}
export async function createUser(sql, email, passwordHash) {
  const id = crypto.randomUUID();
  await sql`INSERT INTO users(id,email,password_hash) VALUES(${id},${email},${passwordHash})`;
  return { id, email };
}
export async function createSession(sql, userId, tokenHash) {
  await sql`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(${tokenHash},${userId},now()+interval '7 days')`;
}
