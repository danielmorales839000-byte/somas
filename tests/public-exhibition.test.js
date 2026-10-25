import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { neonConfig } from "@neondatabase/serverless";
import worker from "../src/index.js";
import { validateSubmission } from "../src/public-submissions.js";
import {
  rootEvents,
  scenarios,
  networkSteps,
  nodes,
} from "../public/exhibition/data.js";
const valid = () => ({
  id: crypto.randomUUID(),
  name: "Example Visitor",
  email: "visitor@example.test",
  country: "Ukraine",
  city: "Vinnytsia",
  roles: ["Engineer"],
  about: "Backend engineering",
  subject: "A use case",
  message: "I would like to contribute a practical use case.",
  consent: true,
  website: "",
});
const uri =
  "postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require";
const req = (path, p, origin = "https://somas.test", token) =>
  new Request("https://somas.test" + path, {
    method: p ? "POST" : "GET",
    headers: {
      origin,
      "content-type": "application/json",
      "x-somas-request": "1",
      ...(token ? { cookie: "somas_session=" + token } : {}),
    },
    ...(p ? { body: JSON.stringify(p) } : {}),
  });
test("concept timelines remain distinct and deterministic", () => {
  assert.equal(rootEvents.length, 26);
  assert.equal(networkSteps.length, 24);
  assert.equal(new Set(rootEvents.map((e) => e.title)).size, 26);
  assert.equal(scenarios.length, 8);
  assert.equal(new Set(scenarios.map((s) => s.team.join(","))).size, 8);
  assert.equal(nodes.filter((n) => n.type === "Validator").length, 2);
  assert.equal(nodes.filter((n) => n.status === "Available").length, 19);
});
test("applications validate all required information and consent", () => {
  assert.equal(validateSubmission(valid(), "application"), null);
  for (const key of ["name", "country", "city", "email", "about", "message"])
    assert.ok(validateSubmission({ ...valid(), [key]: "" }, "application"));
  assert.ok(
    validateSubmission({ ...valid(), roles: ["Administrator"] }, "application"),
  );
  assert.ok(validateSubmission({ ...valid(), consent: false }, "contact"));
  assert.ok(validateSubmission({ ...valid(), id: "invalid" }, "contact"));
});
test("all exhibition pages have persistent disclaimer and separate community accounts", async () => {
  for (const route of [
    "index.html",
    "idea/index.html",
    "looking-for/index.html",
    "root-somas/index.html",
    "network/index.html",
    "videos/index.html",
    "contact/index.html",
    "join/index.html",
  ]) {
    const s = await readFile("public/" + route, "utf8");
    assert.match(s, /DEMO VERSION/);
    assert.match(s, /account\//);
    assert.match(s, /exhibition\/main.js/);
  }
  assert.match(await readFile("public/account/index.html", "utf8"), /community.css/);
});
test("public submission API blocks cross-origin, malformed input, bots, and oversized bodies without DB", async () => {
  assert.equal(
    (
      await worker.fetch(
        req("/api/public/join", valid(), "https://evil.test"),
        {},
      )
    ).status,
    403,
  );
  assert.equal(
    (await worker.fetch(req("/api/public/join", { ...valid(), roles: [] }), {}))
      .status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/api/public/contact", { ...valid(), website: "spam" }),
        {},
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        req("/api/public/contact", { ...valid(), message: "x".repeat(13000) }),
        {},
      )
    ).status,
    400,
  );
  const r = await worker.fetch(req("/api/public/join", valid()), {});
  assert.equal(r.status, 503);
  assert.notEqual((await r.json()).saved, true);
});
test("submission API saves privately, rejects duplicate IDs, enforces quota, and authorizes admin listing using Neon HTTP fixture", async (t) => {
  const previous = neonConfig.fetchFunction,
    stored = [],
    queries = [];
  let attempts = 0,
    user = "visitor";
  t.after(() => (neonConfig.fetchFunction = previous));
  const result = (rows) => {
    const names = Object.keys(rows[0] || {});
    return {
      fields: names.map((name) => ({
        name,
        dataTypeID:
          name === "saved" || name === "attempts"
            ? 23
            : name === "payload"
              ? 3802
              : 25,
      })),
      rows: rows.map((r) =>
        names.map((n) =>
          n === "payload" ? JSON.stringify(r[n]) : String(r[n]),
        ),
      ),
      rowCount: rows.length,
    };
  };
  neonConfig.fetchFunction = async (_url, options) => {
    const { query, params } = JSON.parse(options.body);
    queries.push({ query, params });
    if (query.includes("WITH quota")) {
      attempts++;
      const duplicate = stored.some((r) => r.id === params[2]);
      if (attempts <= 5 && !duplicate) {
        stored.push({
          id: params[2],
          kind: params[3],
          payload: JSON.parse(params[4]),
          created_at: new Date().toISOString(),
        });
        return Response.json(result([{ saved: 1, attempts }]));
      }
      return Response.json(result([{ saved: 0, attempts }]));
    }
    if (query.includes("FROM sessions s JOIN users"))
      return Response.json(result([{ id: user, email: "admin@example.test" }]));
    if (query.includes("FROM public_submissions WHERE"))
      return Response.json(result(stored));
    throw Error("Unexpected fixture query");
  };
  const env = { DATABASE_URL: uri, ADMIN_USER_ID: "admin" },
    p = valid();
  const saved = await worker.fetch(req("/api/public/join", p), env);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).saved, true);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].payload.city, p.city);
  assert.ok(!JSON.stringify(stored).includes("identity_hash"));
  assert.equal(
    (await worker.fetch(req("/api/public/join", p), env)).status,
    409,
  );
  for (let i = 0; i < 3; i++)
    await worker.fetch(req("/api/public/contact", valid()), env);
  assert.equal(
    (await worker.fetch(req("/api/public/contact", valid()), env)).status,
    429,
  );
  assert.equal(
    (await worker.fetch(req("/api/admin/submissions"), env)).status,
    401,
  );
  const token = "a".repeat(64);
  assert.equal(
    (
      await worker.fetch(
        req("/api/admin/submissions", null, undefined, token),
        env,
      )
    ).status,
    403,
  );
  user = "admin";
  const listing = await worker.fetch(
    req("/api/admin/submissions", null, undefined, token),
    env,
  );
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).submissions.length, 4);
  assert.equal(listing.headers.get("cache-control"), "no-store");
  assert.ok(
    queries.some((q) => q.query.includes("ON CONFLICT(id) DO NOTHING")),
  );
});
test("additive migration never rewrites customer tables and revokes public access", async () => {
  const sql = await readFile("db/004_public_submissions.sql", "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public_submissions/);
  assert.match(
    sql,
    /REVOKE ALL ON public_submissions,public_submission_limits FROM PUBLIC/,
  );
  assert.doesNotMatch(sql, /DROP TABLE|ALTER TABLE (users|projects|agents)/i);
});
