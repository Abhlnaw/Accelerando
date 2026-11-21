import assert from "node:assert/strict";
import test from "node:test";
import {grade, gradeGesture, measure, profiles, reference} from "../ui/technique_component/rubric.mjs";

const repeat = (pair, count) => Array.from({length: count}, () => [...pair]);

test("gesture scores four timed targets and requires evidence in every hold", () => {
  const a = [0, 90], b = [0, 120];
  const sequence = [a,b,a,b].flatMap(target => [...Array(4), ...repeat(target, 6)]);
  assert.equal(gradeGesture(sequence, a, b).score, 100);
  assert.equal(gradeGesture(repeat(a, 40), a, b).score, 50);
  assert.equal(gradeGesture(sequence, a, a), null);
  sequence.fill(null, 4, 7);
  assert.equal(gradeGesture(sequence, a, b), null);
});

test("calibration rejects sparse and unstable poses, and handles angle wraparound", () => {
  assert.equal(reference(repeat([0, 0], 7)), null);
  assert.equal(reference([...repeat([10, 20], 6), ...repeat([40, 60], 6)]), null);
  const base = reference([...repeat([179, 90], 6), ...repeat([-179, 90], 6)]);
  assert.equal(grade(repeat([-179, 90], 40), base).score, 100);
});

test("grade uses both angle errors equally and withholds sparse evidence", () => {
  const base = [0, 90];
  assert.equal(grade(repeat(base, 27), base), null);
  assert.equal(grade(repeat([5, 85], 28), base).score, 100);
  assert.equal(grade(repeat([25, 90], 40), base).score, 50);
  assert.equal(grade(repeat([15, 75], 40), base).score, 50);
});

test("instrument mode measures the selected elbow in pixels and rejects occlusion", () => {
  const points = [];
  for (const [i,x,y] of [[12,.2,.25],[11,.6,.25],[13,.6,.6],[15,.8,.6]]) {
    points[i] = {x,y,visibility:1};
  }
  assert.deepEqual(measure(points, 640, 480, profiles.keys, "left"), [0,90]);
  assert.equal(measure(points, 640, 480, profiles.keys, "right"), null);
  points[15].visibility = .3;
  assert.equal(measure(points, 640, 480, profiles.keys, "left"), null);
  points[7] = {x:.6,y:.15,visibility:1};
  points[8] = {x:.4,y:.15,visibility:1};
  assert.deepEqual(measure(points, 640, 480, profiles.voice, "left"), [0,0]);
});
