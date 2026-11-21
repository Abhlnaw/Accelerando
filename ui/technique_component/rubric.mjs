// All angles are in image-plane degrees. Mirroring is display-only.
export const profiles = {
  voice: {label: "Voice", cue: "Sustain a vowel while keeping your chosen head and shoulder position.", head: true},
  keys: {label: "Keyboard", cue: "Play a held chord while keeping your chosen shoulder and playing-arm position."},
  plucked: {label: "Guitar or bass", cue: "Repeat a quiet picking pattern with your chosen arm setup."},
  bowed: {label: "Bowed strings", cue: "Sustain a note and monitor your fingering arm. Select the fingering side."},
  wind: {label: "Wind or brass", cue: "Sustain a note while keeping your chosen instrument-holding arm position."},
  other: {label: "Other instrument", cue: "Play a phrase that calls for a steady head and shoulder position.", head: true},
};

const degrees = radians => radians * 180 / Math.PI;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function slope(a, b) {
  return degrees(Math.atan2(b.y - a.y, b.x - a.x));
}
function angleDifference(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}
export function measure(points, width, height, profile, side) {
  if (!points || !width || !height) return null;
  const arm = side === "left" ? [11, 13, 15] : [12, 14, 16];
  const ids = profile.head ? [11, 12, 7, 8] : [11, 12, ...arm];
  if (!ids.every(i => {
    const p = points[i];
    return p && p.visibility >= 0.7 && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1;
  })) return null;
  const p = i => ({x: points[i].x * width, y: points[i].y * height});
  if (distance(p(11), p(12)) < width * 0.10) return null;
  const shoulder = slope(p(12), p(11));
  if (profile.head) {
    if (distance(p(7), p(8)) < width * 0.035) return null;
    return [shoulder, slope(p(8), p(7))];
  }
  const [upper, elbow, wrist] = arm.map(p);
  if (Math.min(distance(upper, elbow), distance(elbow, wrist)) < width * 0.04) return null;
  return [shoulder, angleDifference(slope(elbow, upper), slope(elbow, wrist))];
}
export function reference(samples) {
  if (samples.length < 8) return null;
  // Use a measured pair near the center, including angles crossing +/-180.
  const cost = pair => samples.reduce((sum, other) =>
    sum + angleDifference(pair[0], other[0]) + angleDifference(pair[1], other[1]), 0);
  const center = samples.reduce((best, pair) => cost(pair) < cost(best) ? pair : best);
  const stable = samples.filter(pair => pair.every((a, i) => angleDifference(a, center[i]) <= 6));
  return stable.length >= samples.length * 0.75 ? center : null;
}
export function grade(samples, base) {
  if (!base || samples.length < 28) return null;
  const metrics = base.map((target, i) => {
    const errors = samples.map(pair => angleDifference(pair[i], target));
    const credit = errors.map(error => Math.max(0, Math.min(1, (25 - error) / 20)));
    return {error: errors.reduce((a, b) => a + b) / errors.length,
            score: 100 * credit.reduce((a, b) => a + b) / credit.length};
  });
  return {metrics, score: Math.round((metrics[0].score + metrics[1].score) / 2)};
}

export function poseDistance(a, b) {
  return Math.max(...a.map((value, i) => angleDifference(value, b[i])));
}

// Four 2.5-second cues. Allow one second to move, then evaluate the hold.
export function gradeGesture(slots, first, second) {
  const separation = poseDistance(first, second);
  if (separation < 12) return null;
  const tolerance = Math.min(10, separation / 3);
  const cues = [];
  for (let i = 0; i < 4; i++) {
    const target = i % 2 === 0 ? first : second;
    const visible = slots.slice(i * 10 + 4, i * 10 + 10).filter(Boolean);
    if (visible.length < 4) return null;
    const reached = visible.filter(pair => poseDistance(pair, target) <= tolerance).length;
    cues.push({reached, visible: visible.length});
  }
  return {cues, score: Math.round(25 * cues.reduce((sum, cue) => sum + cue.reached / cue.visible, 0))};
}
