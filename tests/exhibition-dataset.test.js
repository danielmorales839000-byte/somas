import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { activityAt, STEP_MS } from "../public/exhibition/activity.js";
const base = new URL("../public/exhibition/dataset/", import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, base), "utf8"));
test("the complete supplied synthetic corpus is packaged without auth-table imports", async () => {
  const manifest = await json("manifest.json");
  assert.equal(manifest.record_mode, "SIMULATED");
  assert.deepEqual(manifest.counts, {
    users: 100000,
    agents: 80010,
    tasks: 120000,
    events: 240000,
    claims: 15000,
    somas: 10001,
    blocks: 1500,
  });
  const org = (await json("organizations-index.json")).rows,
    users = (await json("users-index.json")).rows;
  assert.equal(org.length, 10001);
  assert.equal(users.length, 100000);
  assert.equal(new Set(org.map((r) => r[0])).size, 10001);
  const sums = { agents: 0, tasks: 0, events: 0, claims: 0 };
  for (const file of await readdir(new URL("organizations/", base))) {
    const d = await json("organizations/" + file);
    assert.equal(d.record_mode, "SIMULATED");
    assert.equal(d.organization.record_mode, "SIMULATED");
    for (const k of Object.keys(sums)) {
      sums[k] += d[k].length;
      for (const r of d[k]) {
        assert.equal(r.record_mode, "SIMULATED");
        assert.equal(r.somas_id, d.organization.id);
      }
    }
  }
  for (const k of Object.keys(sums)) assert.equal(sums[k], manifest.counts[k]);
  const pages = await readdir(new URL("users/", base));
  assert.equal(pages.length, 100);
  let count = 0;
  for (const file of pages) {
    const d = await json("users/" + file);
    count += d.rows.length;
    for (const u of d.rows) {
      assert.equal(u.record_mode, "SIMULATED");
      assert.match(u.email, /@example\.invalid$/);
    }
  }
  assert.equal(count, 100000);
  const tail = await json("blocks/14.json");
  assert.equal(tail.rows.at(-1).height, 1500);
  assert.equal(
    tail.rows[0].chain_kind,
    "ILLUSTRATIVE_HASH_CHAIN_NOT_CONSENSUS",
  );
  assert.equal(
    manifest.relationship_checks.events_task_organization_mismatch,
    240000,
  );
  assert.equal(
    manifest.relationship_checks.claims_task_organization_mismatch,
    15000,
  );
});
test("headquarters activity is concurrent, deterministic and reverses cleanly on replay", () => {
  assert.equal(STEP_MS, 1400);
  const start = activityAt(0),
    active = activityAt(7000);
  assert.equal(Object.keys(active).length, 10);
  assert.ok(
    Object.values(active).filter((a) => a.state !== "idle").length >= 6,
  );
  assert.deepEqual(active, activityAt(7000));
  assert.deepEqual(start, activityAt(0));
  assert.notDeepEqual(active, start);
  for (const a of Object.values(active)) {
    assert.equal(a.source, "SIMULATED");
    assert.ok(a.progress >= 0 && a.progress <= 1);
  }
});
