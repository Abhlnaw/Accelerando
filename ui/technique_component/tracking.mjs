export const bodyNames = [
  "Shoulders",
  "Head",
  "Torso",
  "Left elbow",
  "Right elbow",
];
export const fingerNames = ["Index", "Middle", "Ring", "Little"];
const deg = (r) => (r * 180) / Math.PI;
export const delta = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const finite = Number.isFinite;
export function visible(p, threshold = 0.7) {
  return (
    p &&
    p.visibility >= threshold &&
    p.x >= 0 &&
    p.x <= 1 &&
    p.y >= 0 &&
    p.y <= 1
  );
}
export function posture(points, w, h) {
  const p = (i) =>
    visible(points?.[i], 0.65) ? [points[i].x * w, points[i].y * h] : null;
  const line = (a, b) =>
    !a || !b || Math.hypot(b[0] - a[0], b[1] - a[1]) < w * 0.025
      ? null
      : deg(Math.atan2(b[1] - a[1], b[0] - a[0]));
  const mid = (a, b) => a && b && [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const elbow = (s, e, t) => {
    const a = line(p(e), p(s)),
      b = line(p(e), p(t));
    return finite(a) && finite(b) ? delta(a, b) : null;
  };
  const spine = line(mid(p(23), p(24)), mid(p(11), p(12)));
  return [
    line(p(12), p(11)),
    line(p(8), p(7)),
    finite(spine) ? spine + 90 : null,
    elbow(11, 13, 15),
    elbow(12, 14, 16),
  ];
}
// Corners: string 1 near nut, string 1 near bridge, last string near nut, near bridge.
export function strings(board, count) {
  if (board.length !== 4) return [];
  const mix = (a, b, t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  return Array.from({ length: count }, (_, i) => [
    mix(board[0], board[2], i / (count - 1)),
    mix(board[1], board[3], i / (count - 1)),
  ]);
}
export function stringAt(tip, lines, w, h) {
  if (!tip || !lines.length) return null;
  const distances = lines
    .map(([a, b], i) => {
      const dx = (b.x - a.x) * w,
        dy = (b.y - a.y) * h,
        x = (tip.x - a.x) * w,
        y = (tip.y - a.y) * h;
      const length = dx * dx + dy * dy;
      const t = (x * dx + y * dy) / length;
      return {
        i: i + 1,
        d:
          length && t >= 0 && t <= 1
            ? Math.hypot(x - t * dx, y - t * dy)
            : Infinity,
      };
    })
    .sort((a, b) => a.d - b.d);
  const [a, b] = distances;
  if (!finite(b.d) || b.d - a.d < 2 || a.d > 0.55 * b.d) return null;
  // Beyond the outer strings, require proximity to the actual line.
  const spacing = Math.min(
    ...[0, 1].map((k) =>
      Math.hypot(
        (lines[1][k].x - lines[0][k].x) * w,
        (lines[1][k].y - lines[0][k].y) * h,
      ),
    ),
  );
  return a.d <= 0.42 * spacing ? a.i : null;
}
export function leftHand(hands, pose, w, h) {
  if (!visible(pose?.[15]) || !visible(pose?.[11]) || !visible(pose?.[12]))
    return null;
  const dist = (a, b) => Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
  const width = dist(pose[11], pose[12]);
  const candidates = hands
    .filter(
      (hand) =>
        dist(hand[0], pose[15]) < width * 0.55 &&
        (!visible(pose[16]) ||
          dist(hand[0], pose[15]) + width * 0.12 < dist(hand[0], pose[16])),
    )
    .sort((a, b) => dist(a[0], pose[15]) - dist(b[0], pose[15]));
  return candidates.length === 1 ? candidates[0] : null;
}
const error = (a, b, i) =>
  i < bodyNames.length ? delta(a, b) : Number(a !== b);
export function calibrate(rows, n) {
  return Array.from({ length: n }, (_, i) => {
    const vals = rows.map((row) => row?.[i]).filter(finite);
    if (vals.length < (i < bodyNames.length ? 6 : 8)) return null;
    const cost = (v) => vals.reduce((s, x) => s + error(x, v, i), 0);
    const center = vals.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
    return vals.filter((v) => error(v, center, i) <= (i < 5 ? 6 : 0)).length >=
      vals.length * 0.75
      ? center
      : null;
  });
}
// Prototype limits in degrees: full credit, then zero credit. Elbows have
// more freedom during playing than the shoulder line or trunk.
const angleBands = [
  [1, 14],
  [2, 18],
  [1, 12],
  [3, 20],
  [3, 20],
];
export function assess(slots, a, b = null) {
  return a.map((target, i) => {
    if (!finite(target) || (b && !finite(b[i])))
      return { score: null, note: "No stable reference" };
    const groups = b
      ? [0, 1, 2, 3].map((k) => [
          slots.slice(10 * k + 4, 10 * k + 10),
          k % 2 ? b[i] : target,
        ])
      : [[slots, target]];
    const credits = [];
    for (const [group, t] of groups) {
      const vals = group.map((row) => row?.[i]).filter(finite);
      const body = i < bodyNames.length;
      const needed = body ? (b ? 3 : 16) : b ? 4 : 28;
      const note = b
        ? "Cue " + (credits.length + 1) + ": " + vals.length + "/6 visible"
        : vals.length + "/40 visible";
      if (vals.length < needed) return { score: null, note };
      if (body && !b) {
        const periods = [0, 10, 20, 30].filter(
          (start) =>
            group.slice(start, start + 10).filter((row) => finite(row?.[i]))
              .length >= 3,
        );
        if (periods.length < 3)
          return { score: null, note: "Visible too briefly · " + note };
      }
      if (!body) {
        credits.push(vals.filter((x) => x === t).length / vals.length);
        continue;
      }
      const [full, zero] = angleBands[i];
      const values = vals
        .map((x) =>
          Math.min(1, Math.max(0, (zero - delta(x, t)) / (zero - full))),
        )
        .sort((x, y) => x - y);
      const mean = (list) => list.reduce((sum, x) => sum + x, 0) / list.length;
      credits.push(
        0.75 * mean(values) +
          0.25 * mean(values.slice(0, Math.ceil(values.length / 4))),
      );
    }
    const score = Math.round(
      (100 * credits.reduce((s, v) => s + v, 0)) / credits.length,
    );
    const visibleCount = groups.reduce(
      (n, [group]) => n + group.filter((row) => finite(row?.[i])).length,
      0,
    );
    return { score, note: visibleCount + "/" + (b ? 24 : 40) + " visible" };
  });
}
