import assert from "node:assert/strict";
import test from "node:test";
import {
  assess as assessParts,
  calibrate,
  leftHand,
  posture,
  stringAt,
  strings,
} from "../ui/technique_component/tracking.mjs";

const point = (x, y) => ({ x, y, visibility: 1 });
const assess = (...args) => assessParts(...args).map((part) => part.score);
const repeat = (v, n) => Array.from({ length: n }, () => [...v]);

test("four tips resolve to independently mapped strings, with ambiguity withheld", () => {
  const lines = strings(
    [point(0.1, 0.2), point(0.9, 0.2), point(0.1, 0.5), point(0.9, 0.5)],
    4,
  );
  assert.deepEqual(
    [0.2, 0.3, 0.4, 0.5].map((y) => stringAt(point(0.5, y), lines, 640, 480)),
    [1, 2, 3, 4],
  );
  for (const p of [point(0.5, 0.25), point(0.01, 0.2), point(0.5, 0.07), null])
    assert.equal(stringAt(p, lines, 640, 480), null);
});
test("only a single hand identifiable by the anatomical left wrist is used", () => {
  const p = [];
  p[11] = point(0.7, 0.4);
  p[12] = point(0.3, 0.4);
  p[15] = point(0.8, 0.5);
  p[16] = point(0.2, 0.5);
  const left = [point(0.81, 0.49)],
    right = [point(0.21, 0.49)];
  assert.equal(leftHand([right, left], p, 640, 480), left);
  assert.equal(leftHand([left, left], p, 640, 480), null);
  p[16] = p[15];
  assert.equal(leftHand([left], p, 640, 480), null);
});
test("both elbows are assessed together and an occlusion affects only its own metric", () => {
  const p = [];
  for (const [i, x, y] of [
    [11, 0.6, 0.25],
    [12, 0.4, 0.25],
    [13, 0.6, 0.5],
    [14, 0.4, 0.5],
    [15, 0.7, 0.5],
    [16, 0.3, 0.5],
    [23, 0.6, 0.8],
    [24, 0.4, 0.8],
    [7, 0.55, 0.14],
    [8, 0.45, 0.14],
  ])
    p[i] = point(x, y);
  assert.deepEqual(posture(p, 640, 480), [0, 0, 0, 90, 90]);
  p[15].visibility = 0.2;
  assert.deepEqual(posture(p, 640, 480), [0, 0, 0, null, 90]);
});
test("grades compare each visible angle and each calibrated finger separately", () => {
  const a = [0, 0, 0, 90, 90, 1, 2, null, 4];
  assert.deepEqual(calibrate(repeat(a, 9), 9), a);
  assert.deepEqual(
    assess(repeat([0, 25, 15, 90, null, 2, 2, null, 4], 40), a),
    [100, 0, 0, 100, null, 0, 100, null, 100],
  );
  assert.ok(assess(repeat(a, 12), a).every((v) => v === null));
});
test("moderate drift is graded by joint; intermittent visibility must span the take", () => {
  const ref = [0, 0, 0, 90, 90];
  const rows = repeat([8, 8, 8, 98, 98], 40);
  const scores = assess(rows, ref);
  assert.deepEqual(scores, [46, 63, 36, 71, 71]);
  const partial = rows.map((row, i) => (i % 2 === 0 ? row : []));
  assert.deepEqual(assess(partial, ref), scores);
  assert.ok(assess(rows.slice(0, 16), ref).every((v) => v === null));
  const drifting = repeat(ref, 30).concat(rows.slice(30));
  assert.ok(assess(drifting, ref)[0] < 85);
});
test("a finger changing strings can define a gesture and every cue requires evidence", () => {
  const a = [0, 0, 0, 90, 90, 1],
    b = [0, 0, 0, 90, 90, 2];
  const slots = [a, b, a, b].flatMap((row) => repeat(row, 10));
  assert.deepEqual(assess(slots, a, b), [100, 100, 100, 100, 100, 100]);
  assert.equal(assess(repeat(a, 40), a, b)[5], 50);
  for (let i = 4; i < 7; i++) slots[i][5] = null;
  assert.equal(assess(slots, a, b)[5], null);
});
