import {notifyOwner} from './owner-notifications.js';
import { v4, accessUser, staff } from "./access.js";
import { database, getUserFromSession } from "./database.js";
import { sha256, sessionCookie } from "./auth.js";
import { readBoundedText } from "./http.js";
export const categories = {
  platform: "SOMAS Platform",
  network: "SOMAS Network",
  ideas: "Ideas & Suggestions",
  questions: "Questions & Answers",
  general: "General Discussion",
  bugs: "Bug Reports & Feedback",
};
export const suggestionStates = [
  "proposed",
  "under_review",
  "planned",
  "in_progress",
  "implemented",
  "declined",
];
export const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      ...headers,
    },
  });
export function requireThat(ok, code, status = 400) {
  if (!ok) throw Object.assign(new Error(code), { status });
}
export function validId(id) {
  requireThat(
    typeof id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ),
    "invalid_id",
  );
  return id;
}
export async function payload(req) {
  requireThat(
    req.headers.get("content-type")?.includes("application/json"),
    "json_required",
    415,
  );
  try {
    const p = JSON.parse(await readBoundedText(req, 18000));
    requireThat(
      p && typeof p === "object" && !Array.isArray(p),
      "invalid_payload",
    );
    return p;
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("invalid_or_oversized_payload"), {
      status: 400,
    });
  }
}
export function text(value, min, max, code) {
  requireThat(
    typeof value === "string" &&
      value.trim().length >= min &&
      value.length <= max,
    code,
  );
  return value.trim();
}
export function validateDiscussion(p) {
  const title = text(p.title, 4, 140, "invalid_title"),
    body = text(p.body, 20, 10000, "invalid_body");
  requireThat(Object.hasOwn(categories, p.category), "invalid_category");
  const tags = p.tags || [];
  requireThat(
    Array.isArray(tags) &&
      tags.length <= 5 &&
      tags.every(
        (t) => typeof t === "string" && /^[\p{L}\p{N} _-]{1,24}$/u.test(t),
      ),
    "invalid_tags",
  );
  return {
    title,
    body,
    category: p.category,
    tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))],
  };
}
export async function rateLimit(sql, key, limit) {
  const window = new Date();
  window.setUTCMinutes(0, 0, 0);
  const r =
    await sql`INSERT INTO community_limits(key,window_start,attempts) VALUES(${key},${window.toISOString()},1) ON CONFLICT(key,window_start) DO UPDATE SET attempts=community_limits.attempts+1 WHERE community_limits.attempts<${limit} RETURNING attempts`;
  requireThat(r.length, "rate_limit_reached", 429);
}
export async function sessionUser(req, sql, env = {}) {
  if(v4(env)){const u=await accessUser(req,sql,env);return u?.verified_at?u:null;}
  const token = sessionCookie(req);
  if (!token) return null;
  return getUserFromSession(sql, await sha256(token));
}
export async function profileFor(sql, user) {
  return (
    (
      await sql`SELECT id,display_name,bio,suspended,created_at FROM community_profiles WHERE user_id=${user.id}`
    )[0] || null
  );
}
export async function ensureProfile(sql, user) {
  const id = crypto.randomUUID(),
    name = "Member " + crypto.randomUUID().slice(0, 6);
  await sql`INSERT INTO community_profiles(id,user_id,display_name) VALUES(${id},${user.id},${name}) ON CONFLICT(user_id) DO NOTHING`;
  return profileFor(sql, user);
}
const offsetOf = (url) => {
  const v = Number(url.searchParams.get("offset") || 0);
  requireThat(Number.isInteger(v) && v >= 0 && v <= 10000, "invalid_offset");
  return v;
};
// Every public projection explicitly excludes account ID, email, credentials and private records.
const author = (p) => ({
  id: p.author_id,
  name: p.author_name,
  joined: p.author_joined,
});
function publicRow(r) {
  const {
    author_id,
    author_name,
    author_joined,
    profile_id,
    user_id,
    email,
    ...fields
  } = r;
  return { ...fields, author: author(r) };
}
async function getDiscussion(sql, id, viewer) {
  const r =
    await sql`SELECT d.id,d.title,d.category,d.body,d.tags,d.pinned,d.locked,d.official,d.suggestion_state,d.created_at,d.updated_at,p.id AS author_id,p.display_name AS author_name,p.created_at AS author_joined,(SELECT count(*)::int FROM community_votes v WHERE v.discussion_id=d.id) AS votes,(SELECT count(*)::int FROM community_replies r WHERE r.discussion_id=d.id AND r.status='visible') AS replies,EXISTS(SELECT 1 FROM community_votes v WHERE v.discussion_id=d.id AND v.profile_id=${viewer}::uuid) AS voted,EXISTS(SELECT 1 FROM community_follows f WHERE f.discussion_id=d.id AND f.profile_id=${viewer}::uuid) AS following FROM community_discussions d JOIN community_profiles p ON p.id=d.profile_id WHERE d.id=${id}::uuid AND d.status='visible'`;
  requireThat(r.length, "discussion_not_found", 404);
  return publicRow(r[0]);
}
async function itemFor(sql, id, kind) {
  const rows =
    kind === "reply"
      ? await sql`SELECT r.id,r.profile_id,r.status,d.locked,d.status AS parent_status,d.id AS discussion_id FROM community_replies r JOIN community_discussions d ON d.id=r.discussion_id WHERE r.id=${id}::uuid`
      : await sql`SELECT id,profile_id,status,locked,status AS parent_status,id AS discussion_id FROM community_discussions WHERE id=${id}::uuid`;
  requireThat(rows.length, "content_not_found", 404);
  return rows[0];
}
export async function community(req, env) {
  const url = new URL(req.url),
    path = url.pathname,
    method = req.method;
  if (!path.startsWith("/api/community/")) return null;
  const sql = database(env),
    user = await sessionUser(req, sql, env),
    mine = user ? await profileFor(sql, user) : null,
    viewer = mine?.id || null,
    isAdmin = staff(user,env);
  const sub = path.slice("/api/community/".length);
  if (sub === "categories" && method === "GET") return json({ categories });
  if (sub === "discussions" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();
    requireThat(q.length <= 100, "search_too_long");
    const category = url.searchParams.get("category") || "",
      sort = url.searchParams.get("sort") || "latest",
      offset = offsetOf(url);
    requireThat(
      !category || Object.hasOwn(categories, category),
      "invalid_category",
    );
    requireThat(
      ["latest", "active", "top", "unanswered"].includes(sort),
      "invalid_sort",
    );
    const official = url.searchParams.get("official") === "true";
    const rows =
      await sql`WITH items AS (SELECT d.id,d.title,d.category,left(d.body,240) AS excerpt,d.tags,d.pinned,d.locked,d.official,d.suggestion_state,d.created_at,d.last_activity,p.id AS author_id,p.display_name AS author_name,p.created_at AS author_joined,(SELECT count(*)::int FROM community_votes v WHERE v.discussion_id=d.id) AS votes,(SELECT count(*)::int FROM community_replies r WHERE r.discussion_id=d.id AND r.status='visible') AS replies FROM community_discussions d JOIN community_profiles p ON p.id=d.profile_id WHERE d.status='visible' AND (${category}='' OR d.category=${category}) AND (${q}='' OR position(lower(${q}) in lower(d.title||' '||d.body))>0) AND (NOT ${official}::boolean OR d.official)) SELECT * FROM items WHERE (${sort}<>'unanswered' OR replies=0) ORDER BY pinned DESC,CASE WHEN ${sort}='top' THEN votes END DESC,CASE WHEN ${sort}='active' THEN last_activity END DESC,created_at DESC,id DESC LIMIT 20 OFFSET ${offset}`;
    return json({
      discussions: rows.map(publicRow),
      next: rows.length === 20 ? offset + 20 : null,
    });
  }
  const detail = sub.match(/^discussions\/([0-9a-f-]+)$/i),
    threadReplies = sub.match(/^discussions\/([0-9a-f-]+)\/replies$/i),
    profileRoute = sub.match(/^profiles\/([0-9a-f-]+)$/i);
  if (detail && method === "GET") {
    validId(detail[1]);
    return json({ discussion: await getDiscussion(sql, detail[1], viewer) });
  }
  if (threadReplies && method === "GET") {
    validId(threadReplies[1]);
    await getDiscussion(sql, threadReplies[1], viewer);
    const offset = offsetOf(url);
    const rows =
      await sql`SELECT r.id,r.discussion_id,r.body,r.official,r.created_at,r.updated_at,p.id AS author_id,p.display_name AS author_name,p.created_at AS author_joined,(SELECT count(*)::int FROM community_votes v WHERE v.reply_id=r.id) AS votes,EXISTS(SELECT 1 FROM community_votes v WHERE v.reply_id=r.id AND v.profile_id=${viewer}::uuid) AS voted FROM community_replies r JOIN community_profiles p ON p.id=r.profile_id WHERE r.discussion_id=${threadReplies[1]}::uuid AND r.status='visible' ORDER BY r.created_at,r.id LIMIT 30 OFFSET ${offset}`;
    return json({
      replies: rows.map(publicRow),
      next: rows.length === 30 ? offset + 30 : null,
    });
  }
  if (profileRoute && method === "GET") {
    validId(profileRoute[1]);
    const id = profileRoute[1],
      p = (
        await sql`SELECT id,display_name,bio,created_at FROM community_profiles WHERE id=${id}::uuid`
      )[0];
    requireThat(p, "profile_not_found", 404);
    const posts =
      await sql`SELECT id,title,category,created_at FROM community_discussions WHERE profile_id=${id}::uuid AND status='visible' ORDER BY created_at DESC LIMIT 20`;
    const replies =
      await sql`SELECT r.id,r.discussion_id,left(r.body,240) AS excerpt,r.created_at,d.title FROM community_replies r JOIN community_discussions d ON d.id=r.discussion_id WHERE r.profile_id=${id}::uuid AND r.status='visible' AND d.status='visible' ORDER BY r.created_at DESC LIMIT 20`;
    return json({ profile: p, discussions: posts, replies });
  }
  requireThat(user, "sign_in_required", 401);
  const me = mine || (await ensureProfile(sql, user));
  if (sub === "me" && method === "GET") return json({ profile: me, isAdmin });
  if (sub === "notifications" && method === "GET") {
    const rows =
      await sql`SELECT n.id,n.discussion_id,n.kind,n.read_at,n.created_at,d.title FROM community_notifications n JOIN community_discussions d ON d.id=n.discussion_id JOIN community_replies r ON r.id=n.reply_id WHERE n.recipient_id=${me.id}::uuid AND d.status='visible' AND r.status='visible' ORDER BY n.created_at DESC LIMIT 50`;
    return json({ notifications: rows });
  }
  if (sub === "notifications/read" && method === "POST") {
    await sql`UPDATE community_notifications SET read_at=now() WHERE recipient_id=${me.id}::uuid AND read_at IS NULL`;
    return json({ ok: true });
  }
  // Moderator authority comes only from the server's configured user identity.
  if (sub.startsWith("admin/")) {
    requireThat(isAdmin, "admin_required", 403);
    if (sub === "admin/review" && method === "GET") {
      const reports =
        await sql`SELECT r.id,r.reason,r.status,r.created_at,r.discussion_id,r.reply_id,coalesce(d.title,parent.title) AS title,coalesce(d.profile_id,reply.profile_id) AS target_profile_id,coalesce(d.body,reply.body) AS content FROM community_reports r LEFT JOIN community_discussions d ON d.id=r.discussion_id LEFT JOIN community_replies reply ON reply.id=r.reply_id LEFT JOIN community_discussions parent ON parent.id=reply.discussion_id WHERE r.status='open' ORDER BY r.created_at LIMIT 100`;
      const hidden =
        await sql`SELECT id,title,status,profile_id FROM community_discussions WHERE status<>'visible' ORDER BY updated_at DESC LIMIT 50`;
      const hiddenReplies =
        await sql`SELECT id,discussion_id,left(body,160) AS excerpt,status FROM community_replies WHERE status<>'visible' ORDER BY updated_at DESC LIMIT 50`;
      const suggestions =
        await sql`SELECT d.id,d.title,d.suggestion_state,(SELECT count(*)::int FROM community_votes v WHERE v.discussion_id=d.id) AS votes FROM community_discussions d WHERE d.category='ideas' AND d.status='visible' ORDER BY votes DESC,d.created_at DESC LIMIT 50`;
      const audit =
        await sql`SELECT id,target_id,action,reason,created_at FROM community_moderation ORDER BY created_at DESC LIMIT 50`;
      const restricted =
        await sql`SELECT id,display_name FROM community_profiles WHERE suspended ORDER BY created_at LIMIT 50`;
      return json({
        reports,
        hidden,
        hiddenReplies,
        suggestions,
        audit,
        restricted,
      });
    }
    if (sub === "admin/moderate" && method === "POST") {
      const p = await payload(req),
        id = validId(p.id),
        reason = text(p.reason, 3, 500, "reason_required"),
        action = p.action;
      await rateLimit(sql, "moderate:" + me.id, 120);
      let rows;
      if (["suspend", "unsuspend"].includes(action)) {
        rows =
          await sql`WITH changed AS(UPDATE community_profiles SET suspended=${action === "suspend"} WHERE id=${id}::uuid AND user_id<>${user.id} RETURNING id),audit AS(INSERT INTO community_moderation(id,actor_user_id,target_id,action,reason) SELECT ${crypto.randomUUID()}::uuid,${user.id},id,${action},${reason} FROM changed RETURNING id) SELECT * FROM audit`;
      } else if (action === "resolve_report") {
        rows =
          await sql`WITH changed AS(UPDATE community_reports SET status='resolved' WHERE id=${id}::uuid RETURNING id),audit AS(INSERT INTO community_moderation(id,actor_user_id,target_id,action,reason) SELECT ${crypto.randomUUID()}::uuid,${user.id},id,${action},${reason} FROM changed RETURNING id) SELECT * FROM audit`;
      } else {
        requireThat(["discussion", "reply"].includes(p.kind), "invalid_kind");
        const reply = p.kind === "reply";
        requireThat(
          (reply
            ? ["hide", "restore", "delete", "official"]
            : [
                "hide",
                "restore",
                "delete",
                "pin",
                "unpin",
                "lock",
                "unlock",
                "official",
                "suggestion",
              ]
          ).includes(action),
          "invalid_action",
        );
        if (action === "suggestion")
          requireThat(
            suggestionStates.includes(p.state),
            "invalid_suggestion_state",
          );
        rows = reply
          ? await sql`WITH changed AS(UPDATE community_replies SET status=CASE WHEN ${action}='hide' THEN 'hidden' WHEN ${action}='delete' THEN 'deleted' WHEN ${action}='restore' THEN 'visible' ELSE status END,official=CASE WHEN ${action}='official' THEN true ELSE official END,updated_at=now() WHERE id=${id}::uuid RETURNING id),audit AS(INSERT INTO community_moderation(id,actor_user_id,target_id,action,reason) SELECT ${crypto.randomUUID()}::uuid,${user.id},id,${"reply:" + action},${reason} FROM changed RETURNING id) SELECT * FROM audit`
          : await sql`WITH changed AS(UPDATE community_discussions SET status=CASE WHEN ${action}='hide' THEN 'hidden' WHEN ${action}='delete' THEN 'deleted' WHEN ${action}='restore' THEN 'visible' ELSE status END,pinned=CASE WHEN ${action}='pin' THEN true WHEN ${action}='unpin' THEN false ELSE pinned END,locked=CASE WHEN ${action}='lock' THEN true WHEN ${action}='unlock' THEN false ELSE locked END,official=CASE WHEN ${action}='official' THEN true ELSE official END,suggestion_state=CASE WHEN ${action}='suggestion' THEN ${p.state || "proposed"} ELSE suggestion_state END,updated_at=now() WHERE id=${id}::uuid AND (${action}<>'suggestion' OR category='ideas') RETURNING id),audit AS(INSERT INTO community_moderation(id,actor_user_id,target_id,action,reason) SELECT ${crypto.randomUUID()}::uuid,${user.id},id,${"discussion:" + action + (action === "suggestion" ? ":" + p.state : "")},${reason} FROM changed RETURNING id) SELECT * FROM audit`;
      }
      requireThat(rows.length, "moderation_target_not_found", 404);
      return json({ ok: true });
    }
    return json({ error: "not_found" }, 404);
  }
  requireThat(!me.suspended, "posting_restricted", 403);
  if (sub === "me" && method === "PUT") {
    const p = await payload(req),
      name = text(p.display_name, 2, 50, "invalid_display_name"),
      bio = text(p.bio || "", 0, 500, "invalid_bio");
    requireThat(
      isAdmin ||
        !/^(somas\s*(team|admin|official)|administrator|official response)$/i.test(
          name,
        ),
      "reserved_display_name",
    );
    await rateLimit(sql, "profile:" + me.id, 20);
    await sql`UPDATE community_profiles SET display_name=${name},bio=${bio} WHERE id=${me.id}::uuid`;
    return json({ profile: await profileFor(sql, user) });
  }
  if (sub === "discussions" && method === "POST") {
    const p = await payload(req),
      v = validateDiscussion(p);
    requireThat(!p.website, "spam_rejected");
    requireThat(!p.official || isAdmin, "admin_required", 403);
    await rateLimit(sql, "post:" + me.id, 5);
    const id = crypto.randomUUID();
    await sql.transaction([
      sql`INSERT INTO community_discussions(id,profile_id,title,category,body,tags,official) SELECT ${id}::uuid,id,${v.title},${v.category},${v.body},${JSON.stringify(v.tags)}::jsonb,${!!p.official} FROM community_profiles WHERE id=${me.id}::uuid AND NOT suspended`,
      sql`INSERT INTO community_follows(profile_id,discussion_id) VALUES(${me.id}::uuid,${id}::uuid)`,
    ]);
    const notification=await notifyOwner(sql,env,'New discussion',`Author: ${me.display_name}\nTitle: ${v.title}\nCategory: ${v.category}\n\n${v.body}\n\n${url.origin}/discussions/${id}/`);
    return json({ id, notification }, 201);
  }
  if (threadReplies && method === "POST") {
    const id = validId(threadReplies[1]),
      p = await payload(req),
      body = text(p.body, 2, 5000, "invalid_reply");
    requireThat(!p.website, "spam_rejected");
    requireThat(!p.official || isAdmin, "admin_required", 403);
    await rateLimit(sql, "reply:" + me.id, 30);
    const rid = crypto.randomUUID();
    const r =
      await sql`WITH posted AS(INSERT INTO community_replies(id,discussion_id,profile_id,body,official) SELECT ${rid}::uuid,d.id,${me.id}::uuid,${body},${!!p.official} FROM community_discussions d WHERE d.id=${id}::uuid AND d.status='visible' AND NOT d.locked AND EXISTS(SELECT 1 FROM community_profiles WHERE id=${me.id}::uuid AND NOT suspended) RETURNING id,discussion_id),activity AS(UPDATE community_discussions SET last_activity=now() WHERE id IN(SELECT discussion_id FROM posted) RETURNING id),notices AS(INSERT INTO community_notifications(recipient_id,discussion_id,reply_id,kind) SELECT f.profile_id,p.discussion_id,p.id,${p.official ? "official" : "reply"} FROM posted p JOIN community_follows f ON f.discussion_id=p.discussion_id WHERE f.profile_id<>${me.id}::uuid LIMIT 1000 ON CONFLICT DO NOTHING RETURNING id) SELECT id FROM posted`;
    requireThat(r.length, "discussion_unavailable_or_locked", 409);
    const notification=await notifyOwner(sql,env,'New discussion reply',`Author: ${me.display_name}\n\n${body}\n\n${url.origin}/discussions/${id}/`);
    return json({ id: rid, notification }, 201);
  }
  const item = sub.match(
    /^(discussions|replies)\/([0-9a-f-]+)(?:\/(vote|report|follow))?$/i,
  );
  if (item) {
    const id = validId(item[2]),
      kind = item[1] === "replies" ? "reply" : "discussion",
      action = item[3],
      target = await itemFor(sql, id, kind);
    if (action) {
      requireThat(
        target.status === "visible" && target.parent_status === "visible",
        "content_not_found",
        404,
      );
      const p = await payload(req);
      if (action === "vote" && method === "PUT") {
        requireThat(typeof p.active === "boolean", "invalid_vote");
        await rateLimit(sql, "vote:" + me.id, 120);
        if (p.active) {
          if (kind === "reply")
            await sql`INSERT INTO community_votes(profile_id,reply_id) VALUES(${me.id}::uuid,${id}::uuid) ON CONFLICT DO NOTHING`;
          else
            await sql`INSERT INTO community_votes(profile_id,discussion_id) VALUES(${me.id}::uuid,${id}::uuid) ON CONFLICT DO NOTHING`;
        } else {
          if (kind === "reply")
            await sql`DELETE FROM community_votes WHERE profile_id=${me.id}::uuid AND reply_id=${id}::uuid`;
          else
            await sql`DELETE FROM community_votes WHERE profile_id=${me.id}::uuid AND discussion_id=${id}::uuid`;
        }
        return json({ ok: true });
      }
      if (action === "follow" && method === "PUT" && kind === "discussion") {
        requireThat(typeof p.active === "boolean", "invalid_follow");
        await rateLimit(sql, "follow:" + me.id, 60);
        if (p.active)
          await sql`INSERT INTO community_follows(profile_id,discussion_id) VALUES(${me.id}::uuid,${id}::uuid) ON CONFLICT DO NOTHING`;
        else
          await sql`DELETE FROM community_follows WHERE profile_id=${me.id}::uuid AND discussion_id=${id}::uuid`;
        return json({ ok: true });
      }
      if (action === "report" && method === "POST") {
        const reason = text(p.reason, 10, 1000, "invalid_report");
        await rateLimit(sql, "report:" + me.id, 10);
        if (kind === "reply")
          await sql`INSERT INTO community_reports(id,reporter_id,reply_id,reason) VALUES(${crypto.randomUUID()}::uuid,${me.id}::uuid,${id}::uuid,${reason}) ON CONFLICT DO NOTHING`;
        else
          await sql`INSERT INTO community_reports(id,reporter_id,discussion_id,reason) VALUES(${crypto.randomUUID()}::uuid,${me.id}::uuid,${id}::uuid,${reason}) ON CONFLICT DO NOTHING`;
        return json({ ok: true }, 201);
      }
    } else if (method === "PUT" || method === "DELETE") {
      requireThat(target.profile_id === me.id, "not_your_content", 403);
      requireThat(
        !target.locked || method === "DELETE",
        "discussion_locked",
        409,
      );
      requireThat(
        target.status === "visible" &&
          (method === "DELETE" || target.parent_status === "visible"),
        "content_not_editable",
        409,
      );
      await rateLimit(sql, "edit:" + me.id, 30);
      if (method === "DELETE") {
        if (kind === "reply")
          await sql`UPDATE community_replies SET status='deleted',updated_at=now() WHERE id=${id}::uuid AND profile_id=${me.id}::uuid`;
        else
          await sql`UPDATE community_discussions SET status='deleted',updated_at=now() WHERE id=${id}::uuid AND profile_id=${me.id}::uuid`;
        return json({ ok: true });
      }
      const p = await payload(req);
      if (kind === "reply") {
        const body = text(p.body, 2, 5000, "invalid_reply");
        await sql`UPDATE community_replies SET body=${body},official=false,updated_at=now() WHERE id=${id}::uuid AND profile_id=${me.id}::uuid`;
      } else {
        const v = validateDiscussion(p);
        await sql`UPDATE community_discussions SET title=${v.title},body=${v.body},category=${v.category},tags=${JSON.stringify(v.tags)}::jsonb,official=false,updated_at=now() WHERE id=${id}::uuid AND profile_id=${me.id}::uuid`;
      }
      return json({ ok: true });
    }
  }
  return json({ error: "not_found" }, 404);
}
