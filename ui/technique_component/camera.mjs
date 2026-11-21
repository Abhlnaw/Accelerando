import {
  bodyNames,
  fingerNames,
  visible,
  posture,
  strings,
  stringAt,
  leftHand,
  calibrate,
  assess,
  delta,
} from "./tracking.mjs";

const el = (id) => document.getElementById(id);
const video = el("video"),
  canvas = el("overlay"),
  ctx = canvas.getContext("2d");
const profile = el("profile"),
  exercise = el("exercise"),
  count = el("count");
for (const [key, name] of Object.entries({
  voice: "Voice",
  keys: "Keyboard",
  plucked: "Guitar or bass",
  bowed: "Bowed strings",
  wind: "Wind or brass",
  other: "Other instrument",
}))
  profile.add(new Option(name, key));
const stringMode = () => ["plucked", "bowed"].includes(profile.value);
const names = () => (stringMode() ? [...bodyNames, ...fingerNames] : bodyNames);
let phase = "off",
  token = 0,
  poseModel,
  handModel,
  stream,
  timer,
  startTime,
  lastFrame,
  lastSlot,
  rows = [],
  a,
  b,
  board = [];
const marks = [
  "Tap string 1 near the nut",
  "Tap string 1 toward the bridge",
  "Tap the last string near the nut",
  "Tap the last string toward the bridge",
];
function message(type, data = {}) {
  window.parent.postMessage(
    { isStreamlitMessage: true, type: "streamlit:" + type, ...data },
    "*",
  );
}
message("componentReady", { apiVersion: 1 });
new ResizeObserver(() =>
  message("setFrameHeight", {
    height: document.querySelector("main").offsetHeight + 4,
  }),
).observe(document.querySelector("main"));
function cue(title, hint = "", seconds = null) {
  if (el("status").textContent !== title) el("status").textContent = title;
  el("hint").textContent = hint;
  el("clock").textContent = seconds === null ? "" : Math.ceil(seconds) + " s";
}
function layout() {
  el("fingerBox").hidden = el("stringsLabel").hidden = !stringMode();
  el("result").textContent = "";
  for (const [id, labels] of [
    ["body", bodyNames],
    ["fingers", fingerNames],
  ]) {
    el(id).replaceChildren(
      ...labels.map((name) => {
        const box = document.createElement("span"),
          label = document.createElement("strong"),
          value = document.createElement("small");
        label.textContent = name;
        value.textContent = "—";
        box.append(label, value);
        return box;
      }),
    );
  }
}
profile.onchange = () => {
  count.value = profile.value === "plucked" ? "6" : "4";
  layout();
};
exercise.onchange = layout;
layout();
function cards(values) {
  document
    .querySelectorAll(".cards small")
    .forEach((node, i) => (node.textContent = values[i] ?? "Out of view"));
}
function close(title, hint = "") {
  token++;
  clearInterval(timer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  poseModel?.close();
  handModel?.close();
  poseModel = handModel = null;
  phase = "off";
  board = [];
  rows = [];
  a = b = null;
  layout();
  for (const id of ["preview", "record", "stop", "remap"]) el(id).hidden = true;
  el("start").hidden =
    profile.disabled =
    exercise.disabled =
    count.disabled =
      false;
  cue(title, hint);
}
function begin(next, now) {
  phase = next;
  startTime = now;
  rows = [];
  lastSlot = -1;
  el("remap").hidden = true;
}
function draw(points, hand, lines) {
  const w = video.videoWidth,
    h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.drawImage(video, 0, 0, w, h);
  const line = (p, q, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x * w, p.y * h);
    ctx.lineTo(q.x * w, q.y * h);
    ctx.stroke();
  };
  for (const [i, j] of [
    [7, 8],
    [11, 12],
    [11, 13],
    [13, 15],
    [12, 14],
    [14, 16],
    [11, 23],
    [12, 24],
    [23, 24],
  ])
    if (visible(points?.[i], 0.65) && visible(points?.[j], 0.65))
      line(points[i], points[j], "#f6d4a6");
  for (const [p, q] of lines) line(p, q, "#ffd682");
  for (const p of [
    ...board,
    ...(hand ? [8, 12, 16, 20].map((i) => hand[i]) : []),
  ]) {
    ctx.fillStyle = "#ffac54";
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
}
canvas.onclick = (e) => {
  if (phase !== "preview" || !stringMode() || board.length >= 4) return;
  const r = canvas.getBoundingClientRect();
  board.push({
    x: 1 - (e.clientX - r.left) / r.width,
    y: (e.clientY - r.top) / r.height,
  });
  if (board.length === 4) {
    const [p, q, r, s] = board;
    const cross = (a, b, c) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const corners = [p, q, s, r];
    const turns = corners.map((v, i) =>
      cross(v, corners[(i + 1) % 4], corners[(i + 2) % 4]),
    );
    const areaOK =
      turns.every((t) => t > 0.001) || turns.every((t) => t < -0.001);
    const lines = strings(board, +count.value);
    const spacingOK = [0, 1].every(
      (k) =>
        Math.hypot(
          (lines[1][k].x - lines[0][k].x) * canvas.width,
          (lines[1][k].y - lines[0][k].y) * canvas.height,
        ) >= 4,
    );
    if (!areaOK || !spacingOK) {
      board = [];
      el("result").textContent =
        "Grid too narrow or crossed. Bring the fingerboard closer and mark both outer strings again.";
    } else el("result").textContent = "";
  }
};
el("remap").onclick = () => {
  board = [];
  el("result").textContent = "";
};
function finish() {
  const details = assess(rows, a, b);
  const scores = details.map((part) => part.score);
  const practiceCues = [
    "Watch the line between your shoulders as you repeat the phrase.",
    "Use the ear markers to return to your chosen head angle.",
    "Watch how your shoulders line up over your hips during the phrase.",
    "Repeat slowly and match your left elbow to its calibrated bend.",
    "Repeat slowly and match your right elbow to its calibrated bend.",
  ];
  const bestTargets = a.map((v, i) =>
    i < 5 || v === null
      ? ""
      : b && b[i] !== null
        ? " · S" + v + " / S" + b[i]
        : " · S" + v,
  );
  const overall = scores.slice(0, 5).filter(Number.isFinite);
  close("Check complete");
  cards(
    scores.map((s, i) =>
      s === null
        ? details[i].note
        : s + "/100" + bestTargets[i] + " · " + details[i].note,
    ),
  );
  const weakest = scores
    .slice(0, 5)
    .reduce((k, v, i) => (v !== null && (k < 0 || v < scores[k]) ? i : k), -1);
  el("result").textContent =
    overall.length < 2
      ? "Too little posture evidence. Reframe and retry."
      : "Posture: " +
        Math.round(overall.reduce((x, y) => x + y, 0) / overall.length) +
        "/100 · " +
        overall.length +
        "/5 areas assessed" +
        (weakest >= 0 && scores[weakest] < 95
          ? "\n" + practiceCues[weakest]
          : "");
  if (stringMode()) {
    const vals = scores.slice(5).filter(Number.isFinite);
    el("result").textContent +=
      "\nLeft-hand placement: " +
      (vals.length
        ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) +
          "/100 · " +
          vals.length +
          "/4 fingers assessed"
        : "too little evidence");
  }
}
function tick() {
  const now = performance.now(),
    elapsed = now - startTime;
  const calibrating = ["reference", "second"].includes(phase),
    playing = phase === "playing";
  if (phase === "setupB") {
    cue(
      "Move to position B",
      "Prepare your second reference.",
      (2500 - elapsed) / 1000,
    );
    if (elapsed >= 2500) begin("second", now);
  } else if (calibrating && elapsed >= 3000) {
    const ref = calibrate(rows, names().length);
    if (ref.slice(0, 5).filter(Number.isFinite).length < 2)
      return close(
        "Reference unclear",
        "Hold still with at least two posture areas visible.",
      );
    if (phase === "reference") {
      a = ref;
      if (exercise.value === "gesture") {
        begin("setupB", now);
        return;
      }
    } else {
      b = ref;
      if (
        !b.some(
          (v, i) =>
            Number.isFinite(v) &&
            Number.isFinite(a[i]) &&
            (i < 5 ? delta(a[i], v) >= 12 : a[i] !== v),
        )
      )
        return close("Positions too similar", "Choose a more visible gesture.");
    }
    begin("playing", now);
    return;
  } else if (playing && elapsed >= 10000) {
    finish();
    return;
  } else if (calibrating)
    cue(
      "HOLD STILL · " + (phase === "second" ? "B" : "A"),
      "Calibrating. Wait for the play cue.",
      (3000 - elapsed) / 1000,
    );
  else if (playing) {
    const gesture = exercise.value === "gesture";
    cue(
      (profile.value === "voice" ? "SING" : "PLAY") +
        (gesture
          ? " · Position " + (Math.floor(elapsed / 2500) % 2 ? "B" : "A")
          : " NOW"),
      gesture
        ? "Cue " + (1 + Math.floor(elapsed / 2500)) + " of 4"
        : "Match your calibrated position.",
      gesture ? (2500 - (elapsed % 2500)) / 1000 : (10000 - elapsed) / 1000,
    );
  }
  if (video.readyState < 2 || video.currentTime === lastFrame) return;
  lastFrame = video.currentTime;
  const slot = Math.floor(elapsed / 250);
  if ((playing || calibrating) && slot === lastSlot) return;
  lastSlot = slot;
  try {
    const detected = poseModel.detectForVideo(video, now).landmarks;
    const pose = detected.length === 1 ? detected[0] : null;
    const hand =
      handModel && pose
        ? leftHand(
            handModel.detectForVideo(video, now).landmarks,
            pose,
            video.videoWidth,
            video.videoHeight,
          )
        : null;
    const lines = strings(board, +count.value);
    draw(pose, hand, lines);
    const values = posture(pose, canvas.width, canvas.height);
    if (stringMode())
      values.push(
        ...[8, 12, 16, 20].map((i) =>
          stringAt(hand?.[i], lines, canvas.width, canvas.height),
        ),
      );
    const target = playing && (b && Math.floor(elapsed / 2500) % 2 ? b : a);
    cards(
      values.map((v, i) => {
        if (v === null) return i < 5 ? "Out of view" : "Unclear";
        const label = i >= 5 ? "String " + v : Math.round(v) + "°";
        if (!target || !Number.isFinite(target[i])) return label;
        return (
          label +
          (i >= 5
            ? v === target[i]
              ? " · matched"
              : " · aim for S" + target[i]
            : " · " + Math.round(delta(v, target[i])) + "° from target")
        );
      }),
    );
    if (phase === "preview") {
      const mapNeeded = stringMode() && board.length < 4;
      el("record").disabled =
        mapNeeded || values.slice(0, 5).filter(Number.isFinite).length < 2;
      cue(
        mapNeeded
          ? marks[board.length]
          : el("record").disabled
            ? "Step into view"
            : "Ready to calibrate",
        mapNeeded
          ? "Mark the same section at both ends. Keep the instrument still."
          : stringMode()
            ? values.slice(5).some(Number.isFinite)
              ? "Keep the strings aligned with the grid."
              : "No clear fingertip on a string. Bring the left hand closer or remap the grid."
            : "Keep your upper body in frame.",
      );
    } else if (calibrating || playing) rows[slot] = values;
  } catch {
    close("Tracking stopped", "Enable the camera to retry.");
  }
}
el("start").onclick = async () => {
  const current = ++token;
  phase = "opening";
  layout();

  el("start").hidden =
    profile.disabled =
    exercise.disabled =
    count.disabled =
      true;
  el("stop").hidden = false;
  cue("Opening camera");
  try {
    const acquired = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 720 } },
      audio: false,
    });
    if (token !== current) {
      acquired.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = acquired;
    stream.getVideoTracks()[0].onended = () => {
      if (current === token) close("Camera disconnected");
    };
    video.srcObject = stream;
    await video.play();
    if (current !== token) return;
    cue("Loading tracking");
    const { PoseLandmarker, HandLandmarker } = await import(
      "./vendor/vision_bundle.mjs"
    );
    const asset = (n) => new URL("./vendor/" + n, import.meta.url).href;
    const files = {
      wasmLoaderPath: asset("vision_wasm_nosimd_internal.js"),
      wasmBinaryPath: asset("vision_wasm_nosimd_internal.wasm"),
    };
    const options = (name) => ({
      baseOptions: { modelAssetPath: asset(name) },
      runningMode: "VIDEO",
    });
    for (const [type, opts] of [
      [
        PoseLandmarker,
        { ...options("pose_landmarker_lite.task"), numPoses: 2 },
      ],
      ...(stringMode()
        ? [
            [
              HandLandmarker,
              { ...options("hand_landmarker.task"), numHands: 2 },
            ],
          ]
        : []),
    ]) {
      if (current !== token) return;
      const model = await type.createFromOptions(files, opts);
      if (current !== token) {
        model.close();
        return;
      }
      if (type === PoseLandmarker) poseModel = model;
      else handModel = model;
    }
    phase = "preview";
    lastFrame = -1;
    el("preview").hidden = el("record").hidden = false;
    el("record").disabled = true;
    el("remap").hidden = !stringMode();
    timer = setInterval(tick, 125);
  } catch (e) {
    if (token === current)
      close(
        "Camera unavailable",
        e.name === "NotAllowedError"
          ? "Allow camera access and retry."
          : e.message,
      );
  }
};
el("record").onclick = () => {
  el("record").hidden = true;
  begin("reference", performance.now());
  cue("HOLD STILL · A", "Calibrating. Wait for the play cue.", 3);
};
el("stop").onclick = () => close("Camera stopped");
window.addEventListener("pagehide", () => close(""));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase !== "off") close("Camera stopped");
});
