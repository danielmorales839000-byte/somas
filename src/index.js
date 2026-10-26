import {contactConversations} from './contact-conversations.js';
import { managers } from "./managers.js";
import { v4,staff } from "./access.js";
import { identityV4 } from "./identity-v4.js";
import { booking } from "./booking.js";
import { administration } from "./administration.js";
import { database, createUser, createSession } from "./database.js";
import {
  hashPassword,
  verifyPassword,
  randomToken,
  sha256,
  cookieForSession,
  clearCookie,
  sessionCookie,
} from "./auth.js";
import { publicSubmissions } from "./public-submissions.js";
import {
  community,
  json,
  payload,
  requireThat,
  sessionUser,
  ensureProfile,
  rateLimit,
} from "./community.js";
import { reportFailure } from "./errors.js";

async function handle(request, env) {
  const url = new URL(request.url),
    path = url.pathname,
    method = request.method;
  if (path === "/health")
    return json({
      ok: true,
      service: "SOMAS concept & community",
      databaseConfigured: !!env.DATABASE_URL,
      aiRuntime: false,
    });
  // Removed execution routes never touch legacy project/agent data or external providers.
  if (
    path.startsWith("/s/") ||
    /^\/api\/(projects|agents|admin\/root|billing|webhooks|runner|research|learning)(\/|$)/.test(
      path,
    )
  )
    return json(
      {
        error: "operational_ai_removed",
        message: "SOMAS now hosts concept simulations and a human community.",
      },
      410,
    );
  if (!path.startsWith("/api/")) {
    if (path === "/idea" || path.startsWith("/idea/")) return Response.redirect(new URL("/", url), 302);
    if (path.startsWith("/platform/managers/")) return env.ASSETS.fetch(new Request(new URL("/platform/managers/", url), request));
    // Serve the community shell for dynamic discussion/profile pages through the existing asset fallback.
    if (path.startsWith("/discussions/"))
      return env.ASSETS.fetch(
        new Request(new URL("/discussions/", url), request),
      );
    return env.ASSETS.fetch(request);
  }
  if (!["GET", "HEAD"].includes(method))
    requireThat(
      request.headers.get("origin") === url.origin &&
        request.headers.get("x-somas-request") === "1",
      "request_origin_not_allowed",
      403,
    );
  if(path.startsWith('/api/contact/conversations'))return contactConversations(request,env);
  if(path==='/api/auth/config' && method==='GET') return json({v4:v4(env),source:'real'});
  if(v4(env) && (path==='/api/managers'||path.startsWith('/api/managers/')))return managers(request,env);
  if(v4(env) && (path.startsWith('/api/auth/')||path.startsWith('/api/account')||path.startsWith('/api/owner/')||path.startsWith('/api/admin/role-requests'))){const r=await identityV4(request,env);if(r)return r;}
  if(v4(env) && (path.startsWith('/api/booking/')||path==='/api/owner/booking-rules'||path==='/api/admin/calendar-meetings')) return booking(request,env);
  if (path.startsWith("/api/admin/workspace"))
    return administration(request, env);
  if (path.startsWith("/api/public/") || path === "/api/admin/submissions") {
    const r = await publicSubmissions(request, env);
    if (r) return r;
  }
  if (path.startsWith("/api/community/")) return community(request, env);
  const sql = database(env);
  if (
    ["/api/auth/register", "/api/auth/login"].includes(path) &&
    method === "POST"
  ) {
    const p = await payload(request),
      email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
    requireThat(
      email.length <= 180 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      "invalid_email",
    );
    requireThat(
      typeof p.password === "string" &&
        p.password.length >= 12 &&
        p.password.length <= 128,
      "password_must_be_12_to_128_chars",
    );
    requireThat(!p.website, "spam_rejected");
    const ip = await sha256(
      (request.headers.get("cf-connecting-ip") || "local") +
        ":" +
        env.DATABASE_URL,
    );
    await rateLimit(
      sql,
      (path.endsWith("register") ? "register:" : "login:") + ip,
      path.endsWith("register") ? 5 : 30,
    );
    let user;
    if (path.endsWith("register")) {
      try {
        user = await createUser(sql, email, await hashPassword(p.password));
      } catch (e) {
        if (e.code === "23505")
          return json({ error: "email_already_registered" }, 409);
        throw e;
      }
    } else {
      user = (
        await sql`SELECT id,email,password_hash FROM users WHERE email=${email} LIMIT 1`
      )[0];
      const dummy =
        "pbkdf2-sha256$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
      const verified = await verifyPassword(
        p.password,
        user?.password_hash || dummy,
      );
      requireThat(user && verified, "invalid_credentials", 401);
    }
    const profile = await ensureProfile(sql, user);
    const token = randomToken();
    await createSession(sql, user.id, await sha256(token));
    return json(
      {
        profile,
        isAdmin: staff(user,env),
      },
      path.endsWith("register") ? 201 : 200,
      { "set-cookie": cookieForSession(token, request.url) },
    );
  }
  if (path === "/api/auth/logout" && method === "POST") {
    const token = sessionCookie(request);
    if (token)
      await sql`DELETE FROM sessions WHERE token_hash=${await sha256(token)}`;
    return json({ ok: true }, 200, { "set-cookie": clearCookie(request.url) });
  }
  if (path === "/api/me" && method === "GET") {
    const user = await sessionUser(request, sql, env);
    requireThat(user, "unauthenticated", 401);
    const profile = await ensureProfile(sql, user);
    return json({
      profile,
      isAdmin: staff(user,env),
    });
  }
  return json({ error: "not_found" }, 404);
}
export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      if (e.status) return json({ error: e.message }, e.status);
      if (e.message === "password_must_be_12_to_128_chars")
        return json({ error: e.message }, 400);
      if (e.code === "23505") return json({ error: "duplicate_record" }, 409);
      const failure = reportFailure(e, "community_request");
      return json(
        { error: failure.code, requestId: failure.requestId },
        failure.status,
      );
    }
  },
};
