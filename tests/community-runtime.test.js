import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { postgresEngine } from "./helpers/postgres-engine.js";
test("compiled Worker publishes a community discussion against isolated PostgreSQL over Neon HTTP", async () => {
  const pg = await postgresEngine();
  const bundle = await build({
    entryPoints: ["src/index.js"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-10-21",
      modules: true,
      script: bundle.outputFiles[0].text,
      bindings: {
        DATABASE_URL:
          "postgresql://fixture:disposable@ep-test.us-east-2.aws.neon.tech/test?sslmode=require",
      },
      outboundService: async (req) =>
        pg.fetch(req.url, { body: await req.text() }),
    }),
  );
  const send = (path, data, cookie) =>
    mf.dispatchFetch("https://runtime.test" + path, {
      method: data ? "POST" : "GET",
      headers: {
        Origin: "https://runtime.test",
        "content-type": "application/json",
        "x-somas-request": "1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  try {
    const r = await send("/api/auth/register", {
      email: "runtime@example.test",
      password: "disposable-runtime-password",
    });
    assert.equal(r.status, 201, await r.clone().text());
    assert.match(r.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    const cookie = r.headers.get("set-cookie").split(";")[0];
    const post = await send(
      "/api/community/discussions",
      {
        title: "A tested community conversation",
        category: "platform",
        body: "A genuine thread published through the compiled Cloudflare Worker.",
        tags: [],
      },
      cookie,
    );
    assert.equal(post.status, 201, await post.clone().text());
    const list = await send("/api/community/discussions");
    assert.equal((await list.json()).discussions.length, 1);
    assert.equal((await send("/api/projects")).status, 410);
    await send("/api/auth/logout", {}, cookie);
    assert.equal((await send("/api/me", null, cookie)).status, 401);
  } finally {
    await mf.dispose();
    await pg.close();
  }
});
