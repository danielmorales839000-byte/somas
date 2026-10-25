import { staff,v4 } from "./access.js";
import { database } from "./database.js";
import {
  sessionUser,
  requireThat,
  json,
  payload,
  rateLimit,
} from "./community.js";
export async function administration(req, env) {
  const url = new URL(req.url),
    path = url.pathname;
  if (!path.startsWith("/api/admin/workspace")) return null;
  const sql = database(env),
    user = await sessionUser(req, sql, env);
  requireThat(user, "unauthenticated", 401);
  requireThat(
    staff(user,env),
    "admin_required",
    403,
  );
  if (path === "/api/admin/workspace" && req.method === "GET") {
    const [stats] =
      await sql`SELECT (SELECT count(*)::int FROM users) AS users,(SELECT count(*)::int FROM public_submissions WHERE payload->'meeting' IS NULL) AS messages,(SELECT count(*)::int FROM public_submissions WHERE payload->'meeting' IS NOT NULL) AS meetings`;
    const users = v4(env) ? await sql`SELECT p.id AS profile_id,p.display_name,u.email,u.created_at,p.suspended,u.role,u.account_status,u.verified_at,u.last_login_at FROM users u LEFT JOIN community_profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 100` :
      await sql`SELECT p.id AS profile_id,p.display_name,u.email,u.created_at,p.suspended FROM users u LEFT JOIN community_profiles p ON p.user_id=u.id ORDER BY u.created_at DESC LIMIT 100`;
    const submissions =
      await sql`SELECT id,kind,payload,created_at FROM public_submissions ORDER BY created_at DESC LIMIT 100`;
    return json({
      stats,
      users,
      submissions,
      analytics: {
        pageViews: null,
        uniqueVisitors: null,
        note: "Visitor analytics are not collected by this application.",
      },
      limit: 100,
    });
  }
  const id = path.match(/^\/api\/admin\/workspace\/([0-9a-f-]{36})$/i)?.[1];
  if (id && req.method === "PATCH") {
    const p = await payload(req);
    requireThat(
      [
        "new",
        "reviewing",
        "responded",
        "closed",
        "requested",
        "confirmed",
        "cancelled",
      ].includes(p.status),
      "invalid_status",
    );
    await rateLimit(sql, "inquiry-admin:" + user.id, 120);
    const rows =
      await sql`UPDATE public_submissions SET payload=jsonb_set(payload,'{reviewStatus}',to_jsonb(${p.status}::text),true)||jsonb_build_object('adminHistory',coalesce(payload->'adminHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object('actor',${user.id}::text,'status',${p.status}::text,'at',now()))) WHERE id=${id}::uuid RETURNING id`;
    requireThat(rows.length, "submission_not_found", 404);
    return json({ saved: true, status: p.status });
  }
  return json({ error: "method_not_allowed" }, 405);
}
