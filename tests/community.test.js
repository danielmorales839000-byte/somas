import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { neonConfig } from "@neondatabase/serverless";
import worker from "../src/index.js";
import { postgresEngine } from "./helpers/postgres-engine.js";
import { validateDiscussion } from "../src/community.js";
const env = {
  DATABASE_URL:
    "postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require",
};
const origin = "https://community.test";
const content = {
  title: "How should independent Managers collaborate?",
  category: "ideas",
  body: "A genuine human question about permissions, signed receipts and independent teams. https://example.test <script>alert(1)</script>",
  tags: ["governance"],
};
test("community validation rejects malformed content and unsafe categories", () => {
  assert.throws(() => validateDiscussion({ ...content, title: "x" }));
  assert.throws(() => validateDiscussion({ ...content, body: " " }));
  assert.throws(() => validateDiscussion({ ...content, category: "admin" }));
  assert.throws(() => validateDiscussion({ ...content, tags: ["<script>"] }));
  assert.deepEqual(validateDiscussion(content).tags, ["governance"]);
});
test("complete community workflows execute actual PostgreSQL SQL with server authorization", async (t) => {
  const pg = await postgresEngine(),
    previous = neonConfig.fetchFunction;
  neonConfig.fetchFunction = pg.fetch;
  t.after(async () => {
    neonConfig.fetchFunction = previous;
    await pg.close();
  });
  const send = (path, method = "GET", body, cookie, ip = "test-ip") =>
    worker.fetch(
      new Request(origin + path, {
        method: method || "GET",
        headers: {
          Origin: origin,
          "x-somas-request": "1",
          "content-type": "application/json",
          "cf-connecting-ip": ip,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  async function call(path, method, body, cookie, status = 200) {
    const r = await send(path, method, body, cookie);
    const data = await r.json();
    assert.equal(
      r.status,
      status,
      JSON.stringify({ data, sql: pg.errors.at(-1) }),
    );
    return data;
  }
  const register = async (name) => {
    const r = await send(
      "/api/auth/register",
      "POST",
      { email: name + "@example.test", password: "disposable-test-password" },
      null,
      name,
    );
    assert.equal(r.status, 201, await r.clone().text());
    return {
      cookie: r.headers.get("set-cookie").split(";")[0],
      ...(await r.json()),
    };
  };
  let alice, bob, admin, id, rid;
  await t.test(
    "guest reads an honest empty community but cannot publish or vote",
    async () => {
      assert.deepEqual(
        (await call("/api/community/discussions")).discussions,
        [],
      );
      await call("/api/community/discussions", "POST", content, null, 401);
      await call(
        "/api/community/discussions/" + crypto.randomUUID() + "/vote",
        "PUT",
        { active: true },
        null,
        401,
      );
      const bad = await worker.fetch(
        new Request(origin + "/api/community/discussions", {
          method: "POST",
          headers: { Origin: "https://evil.test", "x-somas-request": "1" },
          body: "{}",
        }),
        env,
      );
      assert.equal(bad.status, 403);
    },
  );
  await t.test(
    "accounts retain sessions without creating AI workspaces",
    async () => {
      alice = await register("alice");
      bob = await register("bob");
      admin = await register("admin");
      env.ADMIN_USER_ID = (
        await pg.db.query(
          "SELECT id FROM users WHERE email='admin@example.test'",
        )
      ).rows[0].id;
      assert.equal(
        (await call("/api/me", "GET", null, alice.cookie)).profile.id,
        alice.profile.id,
      );
      await call(
        "/api/auth/login",
        "POST",
        { email: "alice@example.test", password: "incorrect-password" },
        null,
        401,
      );
      assert.equal(
        (
          await pg.db.query(
            "SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('agents','projects','workspaces')",
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "registered author publishes real content and public projections exclude private fields",
    async () => {
      id = (
        await call(
          "/api/community/discussions",
          "POST",
          content,
          alice.cookie,
          201,
        )
      ).id;
      const d = (await call("/api/community/discussions/" + id)).discussion;
      assert.equal(d.title, content.title);
      assert.equal(d.author.id, alice.profile.id);
      assert.equal(d.votes, 0);
      const str = JSON.stringify(d);
      assert.ok(!str.includes("alice@example.test"));
      assert.ok(!str.includes("user_id"));
      assert.ok(!str.includes("password"));
      assert.ok(d.body.includes("<script>"));
      await call(
        "/api/community/discussions",
        "POST",
        { ...content, official: true },
        bob.cookie,
        403,
      );
    },
  );
  await t.test(
    "replies persist chronologically and cannot be edited by another author",
    async () => {
      rid = (
        await call(
          "/api/community/discussions/" + id + "/replies",
          "POST",
          { body: "A scoped agreement should be approved first." },
          bob.cookie,
          201,
        )
      ).id;
      const list = await call("/api/community/discussions/" + id + "/replies");
      assert.equal(list.replies.length, 1);
      await call(
        "/api/community/replies/" + rid,
        "PUT",
        { body: "Unauthorized change" },
        alice.cookie,
        403,
      );
      await call(
        "/api/community/replies/" + rid,
        "PUT",
        { body: "A scoped agreement requires explicit owner approval." },
        bob.cookie,
      );
      assert.equal(
        (await call("/api/community/discussions/" + id + "/replies")).replies[0]
          .body,
        "A scoped agreement requires explicit owner approval.",
      );
      await call(
        "/api/community/discussions/" + id,
        "PUT",
        content,
        bob.cookie,
        403,
      );
      await call(
        "/api/community/discussions/" + id,
        "DELETE",
        null,
        bob.cookie,
        403,
      );
    },
  );
  await t.test(
    "repeated upvotes are idempotent and removal is consistent on posts and replies",
    async () => {
      for (let i = 0; i < 3; i++)
        await call(
          "/api/community/discussions/" + id + "/vote",
          "PUT",
          { active: true },
          bob.cookie,
        );
      assert.equal(
        (await call("/api/community/discussions/" + id)).discussion.votes,
        1,
      );
      await call(
        "/api/community/discussions/" + id + "/vote",
        "PUT",
        { active: false },
        bob.cookie,
      );
      assert.equal(
        (await call("/api/community/discussions/" + id)).discussion.votes,
        0,
      );
      for (let i = 0; i < 2; i++)
        await call(
          "/api/community/replies/" + rid + "/vote",
          "PUT",
          { active: true },
          alice.cookie,
        );
      assert.equal(
        (await call("/api/community/discussions/" + id + "/replies")).replies[0]
          .votes,
        1,
      );
      await call(
        "/api/community/replies/" + rid + "/vote",
        "PUT",
        { active: false },
        alice.cookie,
      );
      assert.equal(
        (await call("/api/community/discussions/" + id + "/replies")).replies[0]
          .votes,
        0,
      );
    },
  );
  await t.test(
    "search, categories, ordering, unanswered and pagination reject invalid input",
    async () => {
      await call(
        "/api/community/discussions",
        "POST",
        {
          ...content,
          title: "A question about policy evaluation",
          category: "questions",
        },
        alice.cookie,
        201,
      );
      assert.equal(
        (
          await call(
            "/api/community/discussions?q=independent&category=ideas&sort=top",
          )
        ).discussions.length,
        1,
      );
      assert.equal(
        (await call("/api/community/discussions?sort=unanswered")).discussions
          .length,
        1,
      );
      assert.equal(
        (await call("/api/community/discussions?sort=active")).discussions[0]
          .replies,
        0,
      );
      await call(
        "/api/community/discussions?sort=sql_injection",
        null,
        null,
        null,
        400,
      );
      await call("/api/community/discussions?offset=-1", null, null, null, 400);
      await call(
        "/api/community/discussions?category=invalid",
        null,
        null,
        null,
        400,
      );
      await call(
        "/api/community/discussions?q=" +
          encodeURIComponent("'; DROP TABLE users; --"),
      );
      assert.equal(
        (await pg.db.query("SELECT count(*)::int n FROM users")).rows[0].n,
        3,
      );
    },
  );
  await t.test(
    "profiles expose only opt-in display fields, not account identity",
    async () => {
      await call(
        "/api/community/me",
        "PUT",
        {
          display_name: "Thoughtful Builder",
          bio: "Interested in independent teams.",
        },
        alice.cookie,
      );
      const p = await call("/api/community/profiles/" + alice.profile.id);
      assert.equal(p.profile.display_name, "Thoughtful Builder");
      const internal = (
        await pg.db.query(
          "SELECT id FROM users WHERE email='alice@example.test'",
        )
      ).rows[0].id;
      assert.ok(!JSON.stringify(p).includes(internal));
      assert.ok(!JSON.stringify(p).includes("alice@example.test"));
      assert.equal(p.discussions.length, 2);
    },
  );
  await t.test(
    "follow notifications stay private and official replies are genuine",
    async () => {
      const a = await call(
        "/api/community/notifications",
        "GET",
        null,
        alice.cookie,
      );
      assert.equal(a.notifications.length, 1);
      assert.equal(
        (await call("/api/community/notifications", "GET", null, bob.cookie))
          .notifications.length,
        0,
      );
      await call(
        "/api/community/discussions/" + id + "/follow",
        "PUT",
        { active: true },
        bob.cookie,
      );
      await call(
        "/api/community/discussions/" + id + "/replies",
        "POST",
        { body: "This is an authorized SOMAS team response.", official: true },
        admin.cookie,
        201,
      );
      const b = await call(
        "/api/community/notifications",
        "GET",
        null,
        bob.cookie,
      );
      assert.equal(b.notifications[0].kind, "official");
      await call("/api/community/notifications/read", "POST", {}, bob.cookie);
      assert.ok(
        (
          await call("/api/community/notifications", "GET", null, bob.cookie)
        ).notifications.every((n) => n.read_at),
        JSON.stringify({
          response: await call(
            "/api/community/notifications",
            "GET",
            null,
            bob.cookie,
          ),
          raw: (
            await pg.db.query(
              "SELECT recipient_id,read_at FROM community_notifications",
            )
          ).rows,
        }),
      );
      await call(
        "/api/community/discussions/" + id + "/follow",
        "PUT",
        { active: false },
        bob.cookie,
      );
      await call(
        "/api/community/discussions/" + id + "/replies",
        "POST",
        { body: "Another independently written response." },
        alice.cookie,
        201,
      );
      assert.equal(
        (await call("/api/community/notifications", "GET", null, bob.cookie))
          .notifications.length,
        1,
      );
    },
  );
  await t.test(
    "reports deduplicate and moderation remains administrator-only",
    async () => {
      for (let i = 0; i < 2; i++)
        await call(
          "/api/community/discussions/" + id + "/report",
          "POST",
          { reason: "Please review this genuine concern." },
          bob.cookie,
          201,
        );
      await call("/api/community/admin/review", "GET", null, bob.cookie, 403);
      await call("/api/community/admin/review", "GET", null, null, 401);
      const review = await call(
        "/api/community/admin/review",
        "GET",
        null,
        admin.cookie,
      );
      assert.equal(review.reports.length, 1);
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "discussion",
          id,
          action: "lock",
          reason: "Testing lock behavior",
        },
        bob.cookie,
        403,
      );
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "discussion",
          id,
          action: "lock",
          reason: "Testing lock behavior",
        },
        admin.cookie,
      );
      await call(
        "/api/community/discussions/" + id + "/replies",
        "POST",
        { body: "This should be rejected while locked." },
        bob.cookie,
        409,
      );
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "discussion",
          id,
          action: "unlock",
          reason: "Open conversation again",
        },
        admin.cookie,
      );
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "report",
          id: review.reports[0].id,
          action: "resolve_report",
          reason: "Reviewed the content",
        },
        admin.cookie,
      );
      assert.equal(
        (await call("/api/community/admin/review", "GET", null, admin.cookie))
          .reports.length,
        0,
      );
    },
  );
  await t.test(
    "hide, restore, official suggestions and restrictions are audited",
    async () => {
      const mod = (kind, id, action, extra = {}) =>
        call(
          "/api/community/admin/moderate",
          "POST",
          {
            kind,
            id,
            action,
            reason: "Reviewed by the configured administrator",
            ...extra,
          },
          admin.cookie,
        );
      await mod("discussion", id, "pin");
      await mod("discussion", id, "suggestion", { state: "planned" });
      await mod("discussion", id, "hide");
      await call("/api/community/discussions/" + id, null, null, null, 404);
      assert.ok(
        !(await call("/api/community/discussions")).discussions.some(
          (d) => d.id === id,
        ),
      );
      await mod("discussion", id, "restore");
      assert.equal(
        (await call("/api/community/discussions/" + id)).discussion
          .suggestion_state,
        "planned",
      );
      await mod("profile", bob.profile.id, "suspend");
      await call(
        "/api/community/discussions",
        "POST",
        content,
        bob.cookie,
        403,
      );
      await call("/api/community/notifications", "GET", null, bob.cookie);
      await mod("profile", bob.profile.id, "unsuspend");
      const review = await call(
        "/api/community/admin/review",
        "GET",
        null,
        admin.cookie,
      );
      assert.ok(review.audit.length >= 8);
      assert.ok(!JSON.stringify(review).includes("@example.test"));
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "discussion",
          id,
          action: "suggestion",
          state: "fake",
          reason: "Testing invalid state",
        },
        admin.cookie,
        400,
      );
    },
  );
  await t.test(
    "authors edit and soft-delete their own content; admins can restore it",
    async () => {
      await call(
        "/api/community/discussions/" + id,
        "PUT",
        { ...content, title: "Updated collaboration proposal" },
        alice.cookie,
      );
      assert.equal(
        (await call("/api/community/discussions/" + id)).discussion.title,
        "Updated collaboration proposal",
      );
      assert.equal(
        (await call("/api/community/discussions/" + id)).discussion
          .suggestion_state,
        "planned",
      );
      await call("/api/community/replies/" + rid, "DELETE", null, bob.cookie);
      assert.ok(
        !(
          await call("/api/community/discussions/" + id + "/replies")
        ).replies.some((r) => r.id === rid),
      );
      assert.equal(
        (
          await pg.db.query(
            "SELECT status FROM community_replies WHERE id=$1",
            [rid],
          )
        ).rows[0].status,
        "deleted",
      );
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "reply",
          id: rid,
          action: "restore",
          reason: "Restore author deletion for review",
        },
        admin.cookie,
      );
      assert.ok(
        (
          await call("/api/community/discussions/" + id + "/replies")
        ).replies.some((r) => r.id === rid),
      );
    },
  );
  await t.test(
    "owner discussion deletion is recoverable and oversized replies fail safely",
    async () => {
      await call(
        "/api/community/discussions/" + id + "/replies",
        "POST",
        { body: "x".repeat(20000) },
        alice.cookie,
        400,
      );
      await call(
        "/api/community/discussions/" + id,
        "DELETE",
        null,
        alice.cookie,
      );
      await call("/api/community/discussions/" + id, "GET", null, null, 404);
      assert.equal(
        (
          await pg.db.query(
            "SELECT status FROM community_discussions WHERE id=$1",
            [id],
          )
        ).rows[0].status,
        "deleted",
      );
      await call(
        "/api/community/admin/moderate",
        "POST",
        {
          kind: "discussion",
          id,
          action: "restore",
          reason: "Restore disposable owner deletion",
        },
        admin.cookie,
      );
      assert.equal(
        (await call("/api/community/discussions/" + id)).discussion.id,
        id,
      );
    },
  );
  await t.test(
    "rate limits and migration reapplication preserve genuine records",
    async () => {
      await pg.db.query(
        "INSERT INTO community_limits(key,window_start,attempts) VALUES($1,date_trunc('hour',now()),5) ON CONFLICT(key,window_start) DO UPDATE SET attempts=5",
        ["post:" + bob.profile.id],
      );
      await call(
        "/api/community/discussions",
        "POST",
        content,
        bob.cookie,
        429,
      );
      const count = (
        await pg.db.query("SELECT count(*)::int n FROM community_discussions")
      ).rows[0].n;
      await pg.db.exec(await readFile("db/005_community.sql", "utf8"));
      assert.equal(
        (await pg.db.query("SELECT count(*)::int n FROM community_discussions"))
          .rows[0].n,
        count,
      );
      assert.equal(
        (
          await pg.db.query(
            "SELECT count(*)::int n FROM information_schema.table_privileges WHERE table_name LIKE 'community_%' AND grantee='PUBLIC'",
          )
        ).rows[0].n,
        0,
      );
    },
  );
  await t.test(
    "pagination covers long threads without duplicate rows and team names are protected",
    async () => {
      await call(
        "/api/community/me",
        "PUT",
        { display_name: "SOMAS Team", bio: "" },
        bob.cookie,
        400,
      );
      await pg.db.query(
        "INSERT INTO community_replies(id,discussion_id,profile_id,body,created_at) SELECT gen_random_uuid(),$1::uuid,$2::uuid,'Pagination fixture reply '||n,now()+n*interval '1 second' FROM generate_series(1,31) n",
        [id, bob.profile.id],
      );
      const first = await call("/api/community/discussions/" + id + "/replies");
      assert.equal(first.replies.length, 30);
      assert.equal(first.next, 30);
      const second = await call(
        "/api/community/discussions/" + id + "/replies?offset=30",
      );
      assert.ok(second.replies.length > 0);
      assert.equal(second.next, null);
      assert.equal(
        new Set([...first.replies, ...second.replies].map((r) => r.id)).size,
        first.replies.length + second.replies.length,
      );
      await pg.db.query(
        "INSERT INTO community_discussions(id,profile_id,title,category,body) SELECT gen_random_uuid(),$1::uuid,'Pagination discussion '||n,'general','A sufficiently detailed pagination fixture discussion.' FROM generate_series(1,21) n",
        [bob.profile.id],
      );
      const page = await call("/api/community/discussions");
      assert.equal(page.discussions.length, 20);
      assert.equal(page.next, 20);
      const more = await call("/api/community/discussions?offset=20");
      assert.ok(more.discussions.length > 0);
    },
  );
  await t.test(
    "removed AI, billing and runner endpoints are gone and logout revokes session",
    async () => {
      for (const p of [
        "/api/projects",
        "/api/admin/root/view",
        "/api/agents/anything",
        "/api/billing/checkout",
        "/api/runner/jobs",
        "/s/example/manage",
      ])
        await call(p, "GET", null, alice.cookie, 410);
      await call("/api/auth/logout", "POST", {}, alice.cookie);
      await call("/api/me", "GET", null, alice.cookie, 401);
      assert.equal((await call("/health")).aiRuntime, false);
    },
  );
});
