import {profiles, measure, reference, grade, gradeGesture, poseDistance} from "./rubric.mjs";

const byId = id => document.getElementById(id);
const profile = byId("profile"), side = byId("side"), video = byId("video");
const overlay = byId("overlay"), ctx = overlay.getContext("2d");
const status = byId("status"), result = byId("result");
let generation = 0, model, stream, timer, phase = "off", phaseStart, lastSlot, lastFrame;
let samples = [], base, second, slots = [];
const exercise = byId("exercise");

function message(type, payload = {}) {
  window.parent.postMessage({isStreamlitMessage: true, type: "streamlit:" + type, ...payload}, "*");
}
message("componentReady", {apiVersion: 1});
new ResizeObserver(() => message("setFrameHeight", {height: document.querySelector("main").offsetHeight + 4}))
  .observe(document.querySelector("main"));
for (const [value, entry] of Object.entries(profiles)) profile.add(new Option(entry.label, value));
function updateProfile() {
  byId("cue").textContent = exercise.value === "steady" ? profiles[profile.value].cue :
    "Choose two comfortable positions relevant to your phrase. Use the camera guides to see which angles will be tracked.";
  byId("sideLabel").hidden = !!profiles[profile.value].head;
  result.textContent = "";
}
profile.onchange = updateProfile;
side.onchange = updateProfile;
exercise.onchange = updateProfile;
updateProfile();

function closeCamera(text = "") {
  generation++;
  clearInterval(timer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  model?.close();
  model = null;
  samples = [];
  base = null;
  second = null;
  slots = [];
  phase = "off";
  byId("preview").hidden = byId("record").hidden = byId("stop").hidden = true;
  byId("start").hidden = profile.disabled = side.disabled = exercise.disabled = false;
  status.textContent = text;
}
function begin(next, now) {
  phase = next;
  phaseStart = now;
  lastSlot = -1;
  samples = [];
}
function draw(points) {
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  if (!points) return;
  ctx.strokeStyle = "#79ffd5";
  ctx.lineWidth = 4;
  const links = profiles[profile.value].head ? [[7,8],[11,12]] :
    (side.value === "left" ? [[11,12],[11,13],[13,15]] : [[11,12],[12,14],[14,16]]);
  for (const [a,b] of links) {
    if (Math.min(points[a].visibility, points[b].visibility) < 0.7) continue;
    ctx.beginPath();
    ctx.moveTo(points[a].x * overlay.width, points[a].y * overlay.height);
    ctx.lineTo(points[b].x * overlay.width, points[b].y * overlay.height);
    ctx.stroke();
  }
}
function tick() {
  const now = performance.now();
  const calibration = phase === "reference" || phase === "second";
  const elapsed = now - phaseStart;
  const duration = calibration ? 3000 : 10000;
  if (phase === "setupB") {
    if (elapsed >= 2500) begin("second", now);
    else status.textContent = "Move into position B and hold it.";
    return;
  }
  if (phase !== "preview" && elapsed >= duration) {
    if (calibration) {
      const position = reference(samples);
      if (!position) return closeCamera("Reference unclear. Face the camera, keep the marked joints visible and hold your position for three seconds. Then try again.");
      if (phase === "reference") {
        base = position;
        if (exercise.value === "gesture") { begin("setupB", now); return; }
      } else {
        second = position;
        if (poseDistance(base, second) < 12) return closeCamera("The two poses look too similar from this angle. Adjust the framing or choose a more visible gesture.");
      }
      begin("playing", now);
      status.textContent = "Play or sing now (10 seconds).";
      return;
    }
    const gesture = exercise.value === "gesture";
    const assessed = gesture ? gradeGesture(slots, base, second) : grade(samples, base);
    const count = samples.length;
    closeCamera("Camera stopped.");
    if (!assessed) {
      result.textContent = "Too little visible movement data to grade. Improve the light and framing, then try again.";
      return;
    }
    if (gesture) {
      result.textContent = ["Gesture accuracy: " + assessed.score + "/100",
        ...assessed.cues.map((cue,i) => "Cue " + (i+1) + " (" + (i%2 ? "B" : "A") + "): on target in " + cue.reached + "/" + cue.visible + " visible samples."),
        assessed.score === 100 ? "You reached both positions on all four cues." :
          "Repeat the gesture and watch the guide during the cue you missed most often."].join("\n");
      return;
    }
    const labels = ["Shoulder tilt", profiles[profile.value].head ? "Head tilt" : "Elbow bend"];
    const largest = assessed.metrics[0].error >= assessed.metrics[1].error ? 0 : 1;
    result.textContent = ["Form consistency: " + assessed.score + "/100",
      ...assessed.metrics.map((m,i) => labels[i] + ": " + Math.round(m.score) + "/100, average change " + m.error.toFixed(1) + "°"),
      "Assessed " + count + "/40 samples.",
      assessed.metrics[largest].error > 5
        ? "On your next take, watch your " + labels[largest].toLowerCase() + " during the held phrase. If the movement was intentional, choose a different exercise."
        : "Your angles stayed close to your reference on average. Try the same setup on another held phrase."
    ].join("\n");
    return;
  }
  const remaining = Math.ceil((duration - elapsed) / 1000);
  if (calibration) status.textContent = "Hold position " + (phase === "second" ? "B" : "A") + ": " + remaining + " s";
  else if (phase === "playing") status.textContent = exercise.value === "gesture"
    ? "Cue " + (Math.floor(elapsed / 2500) + 1) + " of 4: move to " + (Math.floor(elapsed / 2500) % 2 ? "B" : "A") + " and hold."
    : "Play or sing: " + remaining + " s";
  if (video.readyState < 2 || video.currentTime === lastFrame) return;
  lastFrame = video.currentTime;
  const slot = Math.floor(elapsed / 250);
  if (phase !== "preview" && slot === lastSlot) return;
  lastSlot = slot;
  try {
    const poses = model.detectForVideo(video, now).landmarks;
    const points = poses.length === 1 ? poses[0] : null;
    draw(points);
    const value = measure(points, video.videoWidth, video.videoHeight, profiles[profile.value], side.value);
    if (phase === "preview") {
      byId("record").disabled = !value;
      status.textContent = value ? "Ready. Start the check and hold your reference position for three seconds." : "Frame one musician with all marked joints visible.";
    } else if (value) {
      samples.push(value);
      if (phase === "playing") slots[slot] = value;
    }
  } catch {
    closeCamera("Pose tracking stopped. Re-enable the camera to retry.");
  }
}
byId("start").onclick = async () => {
  const token = ++generation;
  phase = "opening";
  result.textContent = "";
  byId("start").hidden = profile.disabled = side.disabled = exercise.disabled = true;
  byId("stop").hidden = false;
  status.textContent = "Opening camera…";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Open the studio on localhost or HTTPS to use a webcam.");
    const acquired = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 640}, height: {ideal: 480}}, audio: false});
    if (generation !== token) { acquired.getTracks().forEach(track => track.stop()); return; }
    stream = acquired;
    stream.getVideoTracks()[0].onended = () => { if (token === generation) closeCamera("Camera disconnected."); };
    video.srcObject = stream;
    await video.play();
    if (token !== generation) return;
    byId("preview").hidden = false;
    status.textContent = "Loading the local pose model…";
    const {PoseLandmarker} = await import("./vendor/vision_bundle.mjs");
    if (token !== generation) return;
    const asset = name => new URL("./vendor/" + name, import.meta.url).href;
    const loaded = await PoseLandmarker.createFromOptions({
      wasmLoaderPath: asset("vision_wasm_nosimd_internal.js"),
      wasmBinaryPath: asset("vision_wasm_nosimd_internal.wasm"),
    }, {baseOptions: {modelAssetPath: asset("pose_landmarker_lite.task")}, runningMode: "VIDEO", numPoses: 2});
    if (generation !== token) { loaded.close(); return; }
    model = loaded;
    phase = "preview";
    lastFrame = -1;
    byId("record").hidden = false;
    byId("record").disabled = true;
    timer = setInterval(tick, 125);
  } catch (error) {
    if (token === generation) closeCamera(error.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in the browser and try again."
      : "Could not start the camera or pose model. " + error.message);
  }
};
byId("record").onclick = () => { byId("record").hidden = true; begin("reference", performance.now()); };
byId("stop").onclick = () => closeCamera("Camera stopped.");
window.addEventListener("pagehide", () => closeCamera());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && phase !== "off") closeCamera("Camera stopped when you left the page.");
});
