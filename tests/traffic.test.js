import test from "node:test";
import assert from "node:assert/strict";
import {
  trafficAt,
  FLOW_COUNT,
  reportTravel,
} from "../public/exhibition/traffic.js";
import { activityAt } from "../public/exhibition/activity.js";
test("48 deterministic network flows use supplied identities and distinct routes, never live transaction records", () => {
  const ids = Array.from(
    { length: 24 },
    (_, i) => "SUB-" + String(i + 1).padStart(5, "0"),
  );
  const a = trafficAt(9000, ids);
  assert.equal(a.length, FLOW_COUNT);
  assert.equal(a.length, 48);
  assert.deepEqual(a, trafficAt(9000, ids));
  assert.equal(new Set(a.map((f) => f.id)).size, 48);
  assert.equal(new Set(a.map((f) => f.kind)).size, 4);
  for (const f of a) {
    assert.equal(f.source, "SIMULATED");
    assert.ok(f.from === "root" || ids.includes(f.from));
    assert.ok(f.to === "root" || ids.includes(f.to));
    assert.notEqual(f.from, f.to);
    assert.ok(f.progress >= 0 && f.progress < 1);
  }
  assert.deepEqual(trafficAt(50, []), []);
  assert.notDeepEqual(trafficAt(12000, ids), a);
  assert.deepEqual(trafficAt(0, ids), trafficAt(0, ids));
});
test("several specialists arrive at Root together, confer, and return on replay", () => {
  const active = Object.values(activityAt(3000)).filter(
    (a) => a.state === "report",
  );
  assert.ok(active.length >= 4);
  for (const a of active) assert.ok(reportTravel(a.progress) > 0.8);
  assert.equal(reportTravel(0), 0);
  assert.equal(reportTravel(0.4), 1);
  assert.ok(reportTravel(0.99) < 0.1);
  assert.equal(reportTravel(1), 0);
  assert.deepEqual(activityAt(3000), activityAt(3000));
});
