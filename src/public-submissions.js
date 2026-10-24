import { database, getUserFromSession } from "./database.js";
import { sha256, sessionCookie } from "./auth.js";
import { readBoundedText } from "./http.js";
const response = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    },
  });
const roles = ["Investor", "Engineer", "Assistor / Contributor", "Other"];
export function validateSubmission(p, kind) {
  if (!p || typeof p !== "object" || Array.isArray(p))
    return "invalid_submission";
  for (const [key, min, max] of [
    ["name", 1, 100],
    ["email", 3, 180],
    ["message", 10, 2500],
  ])
    if (
      typeof p[key] !== "string" ||
      p[key].trim().length < min ||
      p[key].length > max
    )
      return "invalid_" + key;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim()))
    return "invalid_email";
  if (p.consent !== true) return "consent_required";
  if (
    typeof p.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      p.id,
    )
  )
    return "invalid_submission_id";
  if (kind === "application") {
    for (const key of ["country", "city", "about"])
      if (
        typeof p[key] !== "string" ||
        p[key].trim().length < 2 ||
        p[key].length > (key === "about" ? 1500 : 100)
      )
        return "invalid_" + key;
    if (
      !Array.isArray(p.roles) ||
      p.roles.length < 1 ||
      p.roles.length > 4 ||
      p.roles.some((r) => !roles.includes(r))
    )
      return "invalid_roles";
  } else if (
    typeof p.subject !== "string" ||
    p.subject.trim().length < 2 ||
    p.subject.length > 160
  )
    return "invalid_subject";
  return null;
}
export async function publicSubmissions(request, env) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/public/contact" || path === "/api/public/join") {
    if (request.method !== "POST")
      return response({ error: "method_not_allowed" }, 405);
    if (
      request.headers.get("origin") !== url.origin ||
      request.headers.get("x-somas-request") !== "1"
    )
      return response({ error: "origin_not_allowed" }, 403);
    if (!request.headers.get("content-type")?.includes("application/json"))
      return response({ error: "json_required" }, 415);
    let p;
    try {
      p = JSON.parse(await readBoundedText(request, 12000));
    } catch {
      return response({ error: "invalid_or_oversized_payload" }, 400);
    }
    const kind = path.endsWith("join") ? "application" : "contact";
    if (p?.website)
      return response({ saved: false, error: "submission_rejected" }, 400);
    const invalid = validateSubmission(p, kind);
    if (invalid) return response({ error: invalid }, 400);
    if (!env.DATABASE_URL)
      return response({ error: "submissions_not_configured" }, 503);
    const sql = database(env);
    const day = new Date().toISOString().slice(0, 10),
      hash = await sha256(
        day +
          ":" +
          (request.headers.get("cf-connecting-ip") || "unknown") +
          ":" +
          env.DATABASE_URL,
      );
    const data = {
      name: p.name.trim(),
      email: p.email.trim(),
      message: p.message.trim(),
      ...(kind === "application"
        ? {
            country: p.country.trim(),
            city: p.city.trim(),
            about: p.about.trim(),
            roles: [...new Set(p.roles)],
          }
        : { subject: p.subject.trim() }),
      consent: true,
    };
    // Quota and insertion share one statement. Repeated IDs never create duplicate records.
    const rows =
      await sql`WITH quota AS (INSERT INTO public_submission_limits (identity_hash,day,attempts) VALUES (${hash},${day}::date,1) ON CONFLICT(identity_hash,day) DO UPDATE SET attempts=public_submission_limits.attempts+1 RETURNING attempts), saved AS (INSERT INTO public_submissions(id,kind,payload) SELECT ${p.id}::uuid,${kind},${JSON.stringify(data)}::jsonb FROM quota WHERE attempts<=5 ON CONFLICT(id) DO NOTHING RETURNING id) SELECT (SELECT count(*)::int FROM saved) AS saved,(SELECT attempts FROM quota) AS attempts`;
    if (rows[0]?.saved === 1) return response({ saved: true }, 201);
    if (rows[0]?.attempts > 5)
      return response({ error: "daily_limit_reached" }, 429);
    return response({ error: "already_submitted" }, 409);
  }
  if (path === "/api/admin/submissions") {
    if (request.method !== "GET")
      return response({ error: "method_not_allowed" }, 405);
    const token = sessionCookie(request);
    if (!token) return response({ error: "unauthenticated" }, 401);
    const sql = database(env),
      user = await getUserFromSession(sql, await sha256(token));
    if (!user || !env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID)
      return response({ error: "admin_required" }, 403);
    const before = url.searchParams.get("before") || new Date().toISOString();
    if (!Number.isFinite(Date.parse(before)))
      return response({ error: "invalid_cursor" }, 400);
    const rows =
      await sql`SELECT id,kind,payload,created_at FROM public_submissions WHERE created_at<${before}::timestamptz ORDER BY created_at DESC LIMIT 100`;
    return response({
      submissions: rows,
      next: rows.length === 100 ? rows.at(-1).created_at : null,
    });
  }
  return null;
}
