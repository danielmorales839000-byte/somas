import test from "node:test";
import assert from "node:assert/strict";
import {
  actors,
  cycle,
  worlds,
  organizations,
  phaseAt,
} from "../public/exhibition/world-data.js";
import { validateSubmission } from "../src/public-submissions.js";
import { postgresEngine } from "./helpers/postgres-engine.js";
import { neonConfig } from "@neondatabase/serverless";
import { sha256 } from "../src/auth.js";
import worker from "../src/index.js";
test("spatial replay has ten unique actors, a deterministic complete cycle and seven destinations", () => {
  assert.equal(actors.length, 10);
  assert.equal(new Set(actors.map((a) => a.id)).size, 10);
  assert.equal(new Set(actors.map((a) => a.color)).size, 10);
  assert.equal(cycle.length, 28);
  for (const e of cycle) {
    assert.ok(actors.some((a) => a.id === e.actor));
    assert.equal(e.source, "simulated");
    assert.equal(e.at, (e.step - 1) * 1400);
  }
  assert.deepEqual(
    [...new Set(cycle.map((e) => e.actor))].sort(),
    actors.map((a) => a.id).sort(),
  );
  assert.ok(cycle.some((e) => e.state === "learn"));
  assert.ok(cycle.some((e) => e.state === "relax"));
  assert.equal(worlds.length, 7);
  assert.equal(new Set(worlds.map((w) => w.url)).size, 7);
  assert.equal(organizations[0].role, "Root coordinator");
  assert.deepEqual([0, 4, 8, 12, 16, 20].map(phaseAt), [
    "Work",
    "Submit",
    "Evaluate",
    "Decide",
    "Record",
    "Learn",
  ]);
});
test("meeting requests validate future times, timezone and request-only state", () => {
  const p = {
    id: crypto.randomUUID(),
    name: "QA Visitor",
    email: "qa@example.test",
    message: "Discuss a real practical use case.",
    subject: "Meeting request",
    consent: true,
    meeting: {
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      timezone: "Asia/Rangoon",
      status: "requested",
    },
  };
  assert.equal(validateSubmission(p, "contact"), null);
  for (const meeting of [
    { ...p.meeting, status: "confirmed" },
    { ...p.meeting, startsAt: "invalid" },
    { ...p.meeting, startsAt: "2020-01-01" },
    { ...p.meeting, timezone: "Not/AZone" },
  ])
    assert.ok(validateSubmission({ ...p, meeting }, "contact"));
});
test("private admin workspace and meeting records use actual SQL with server authorization", async () => {
  const pg = await postgresEngine();
  const old = neonConfig.fetchFunction;
  neonConfig.fetchFunction = pg.fetch;
  const env = {
    DATABASE_URL:
      "postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require",
    ADMIN_USER_ID: "admin",
  };
  const req = (path, method = "GET", body, token) =>
    new Request("https://somas.test" + path, {
      method,
      headers: {
        origin: "https://somas.test",
        "x-somas-request": "1",
        "content-type": "application/json",
        ...(token ? { cookie: "somas_session=" + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    for (const id of ["member", "admin"]) {
      await pg.db.query(
        "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
        [id, id + "@example.test", "unused"],
      );
      await pg.db.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')",
        [await sha256(id === "admin" ? "a".repeat(64) : "b".repeat(64)), id],
      );
    }
    assert.equal(
      (await worker.fetch(req("/api/admin/workspace"), env)).status,
      401,
    );
    assert.equal(
      (
        await worker.fetch(
          req("/api/admin/workspace", "GET", null, "b".repeat(64)),
          env,
        )
      ).status,
      403,
    );
    const id = crypto.randomUUID(),
      meeting = {
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        timezone: "Asia/Rangoon",
        status: "requested",
      };
    const p = {
      id,
      name: "Disposable QA",
      email: "qa@example.test",
      message: "Review a practical SOMAS use case.",
      subject: "Meeting request",
      consent: true,
      meeting,
    };
    assert.equal(
      (await worker.fetch(req("/api/public/contact", "POST", p), env)).status,
      201,
    );
    let d = await (
      await worker.fetch(
        req("/api/admin/workspace", "GET", null, "a".repeat(64)),
        env,
      )
    ).json();
    assert.equal(d.stats.meetings, 1);
    assert.equal(d.stats.messages, 0);
    assert.equal(d.submissions[0].payload.meeting.timezone, "Asia/Rangoon");
    assert.equal(d.analytics.uniqueVisitors, null);
    assert.ok(!JSON.stringify(d).includes("password_hash"));
    assert.equal(
      (
        await worker.fetch(
          req(
            "/api/admin/workspace/" + id,
            "PATCH",
            { status: "confirmed" },
            "b".repeat(64),
          ),
          env,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await worker.fetch(
          req(
            "/api/admin/workspace/" + id,
            "PATCH",
            { status: "confirmed" },
            "a".repeat(64),
          ),
          env,
        )
      ).status,
      200,
    );
    d = await (
      await worker.fetch(
        req("/api/admin/workspace", "GET", null, "a".repeat(64)),
        env,
      )
    ).json();
    assert.equal(d.submissions[0].payload.reviewStatus, "confirmed");
    assert.equal(d.submissions[0].payload.adminHistory[0].actor, "admin");
    assert.equal(d.submissions[0].payload.meeting.status, "requested");
    assert.equal(pg.errors.length, 0, JSON.stringify(pg.errors));
  } finally {
    neonConfig.fetchFunction = old;
    await pg.close();
  }
});
