# Accelerando — current project and agent guide

Updated 2026-11-21. This file supersedes the original six-hour Streamlit kickoff
brief. Later user instructions in this chat take precedence over historical
scope cuts, branch ceremony and teammate-review requirements.

## Product and user requirements

Accelerando is an educational music practice coach: think typing practice for
sheet music. A musician chooses a score, plays it, sees their position and likely
mistakes, then reviews one useful action and tries again. The interface should
feel like a complete, friendly practice app; MusPal/MusePal was the user's UI/UX
reference. Research informs the workflow; do not copy proprietary assets.

The primary deliverable is a standalone Android APK for a **Samsung Galaxy Tab
S7 FE**. Capture audio with the tablet's microphone and run inference locally.
Do not require laptop connectivity, a Streamlit server, accounts or paid APIs
for tablet practice. Keep the desktop app working as a separate local workflow.
The user's first demo is likely **Twinkle, Twinkle, Little Star on guitar**.
Twinkle is a useful bundled starter, never a reason to hardcode the analysis or
build an instrument-exclusive app.

The user requires:

- A real Home page, usable navigation, score/library selection and an end-to-end
  working UI and backend, including loading, failure, cancel and retry states.
- Score upload and discovery through IMSLP. Distinguish discovery links from
  importing playable notation; scanned pages need a separate recognition step.
- Interactive sheet music that follows a performance and flags likely mistakes.
  Live markings are provisional; completed-take assessment is the saved result.
- Support for multiple instruments and correct written-to-sounding transposition.
  Identify the performed melodic line within a larger score when possible.
- Microphone input and audio upload; reference listening and open-source/YouTube
  discovery. Identify what each source action actually does.
- Transparent scoring using pitch/frequency, rhythm and tempo. Frequency is the
  measurement behind pitch; do not count it as a second independent score.
- Practice reports, logs and charts that show progress on each piece.
- A future game-like practice experience. The user explicitly deferred game
  mechanics; do not treat them as a requirement of the current release.
- Installable test APKs published in **GitHub Releases**, with clear testing steps.

Do not claim that every instrument or full polyphonic performance is supported.
The product aims to serve many instruments; the current pitch model measures one
pitched melodic line at a time. State measured capabilities honestly.

## What is implemented, and what remains

| Area | Current implementation | Boundary or outstanding work |
|---|---|---|
| Android app | Native Java Activity, local WebView interface, bundled assets, ARM64/x86_64 APK, Android 8+ | Physical Tab S7 FE microphone accuracy and latency require testing |
| Home | Resume current music, practice totals, recent saved reports and library/import shortcuts | No login or cloud sync |
| Practice | Bundled Twinkle, score rendering, measure selection, microphone capture, uploaded WAV, provisional following and a final report | One pitched audio line, no simultaneous chord/ensemble grading |
| Music library | Persistent imported MusicXML, saved instrument/line settings, explicit score removal | Plain partwise XML/MusicXML only; no compressed MXL or scanned-PDF recognition |
| Score lines | Candidate parts/staves/voices/chord-tone lines; automatic recording-based selection or manual choice | Ambiguous identification withholds a grade; projecting notation is not polyphonic audio recognition |
| Analysis | Bundled CREPE tiny neural inference, signal checks, note grouping, sequence alignment and evidence-aware scoring | No new model training, generative feedback or tone-quality grade |
| Reports | Pitch/coverage/rhythm, tempo mode, warnings, localized findings and replay of the original recording | Quiet, unrelated or insufficient evidence may remain ungraded |
| Progress | Saved reports, per-piece/settings comparisons, chart and JSON export | Local storage, not a learning-outcomes study |
| Replay | Independent opaque recording IDs, latest 20 recordings, older reports retain metrics | A report must clearly indicate when its recording is no longer retained |
| Practice tools | Chromatic tuner, metronome with tap tempo, reference drone | Stop audio/microphone when leaving tools or starting graded practice |
| Sources | External IMSLP and YouTube searches, local reference audio playback | No automatic remote audio download, edition matching or scanned-score transcription on Android |
| Desktop | Streamlit UI and real Python score/audio/grading pipeline, optional compatible reference comparisons | Separate runtime; it is not the tablet's backend |

Do not display placeholder grades or silently substitute fixtures in a real
analysis path. Synthetic bundled tests and previews must be labeled as such.
Do not promise unfinished PDF, video, percussion, cloud or game functionality.

## Working agreement and authorization

The original four work packages are integrated. The current assistant owns app
integration (Agent 4). Work on `feat/app-integration`; check the current branch
before editing. Use separate worktrees if simultaneous sessions share a repository.
Do not overwrite another session's work or force-push shared branches.

Historical owner branches remain useful for responsibility boundaries:

| Owner | Branch | Responsibility |
|---|---|---|
| 1 | `feat/audio-ml` | Python audio extraction and model evidence |
| 2 | `feat/score-references` | Score parsing and attributable fixtures |
| 3 | `feat/alignment-grading` | Alignment, scoring and feedback |
| 4 | `feat/app-integration` | Shared contracts, UI, Android, integration and releases |

The user subsequently authorized **merging checked integration work directly to
main**, explicitly waived the extra teammate/self-review gate, and requested
publishing new test releases. That replaces the old mandatory teammate-review
step. A prior suggested reviewer was Abhlnaw; do not request that review again
as a release prerequisite. Complete appropriate checks before merging/publishing.
The historical request to merge full-practice-ui without a release was followed
by a request for a new release; it is not a standing ban on releases.

Fetch main before final integration. Preserve newer changes from other sessions,
resolve conflicts on the integration branch and validate the combined build.
Keep commits concrete and reviewable. Use ordinary non-force pushes. Do not tag
or upload a build from a different commit than the one documented in its release.
User authorization covers ordinary project implementation, fixes, merges and
releases; ask only for material missing requirements or genuinely new scope.
No messages to teammates are authorized merely by this workflow.

## Architecture and important files

### Android — primary tablet runtime

- `android/app/src/main/java/org/accelerando/practice/MainActivity.java`: trusted
  asset WebView, bridge, permissions, file import, capture coordination and playback.
- `PitchEngine.java`: microphone/WAV samples, signal preprocessing and ONNX CREPE
  inference with original recording timestamps.
- `WavInput.java`: bounded PCM16 decoding, stereo handling and resampling.
- `TakeRepository.java`: app-owned recording IDs, retention and safe file lookup.
- `android/app/src/main/assets/web/index.html`, `style.css`, `app.js`: Home,
  Practice, Library, Progress, session state, rendered notation and findings.
- `core.js`: score parsing, observations, alignment and assessment.
- `score-lines.js`: melodic candidate projection and performed-line selection.
- `storage.js`: validated settings, imported scores and practice reports.
- `web/tools/`: tuner/metronome/drone, shared with the desktop practice tools.
- Bundled model, VexFlow, fonts/artwork and license notices must remain available
  offline. Preserve upstream credits and source/permission metadata.

Use the native bridge only in trusted bundled content. Imported XML is data,
never executable content. External source links open in the external browser.
Own temporary paths; do not trust display filenames as filesystem destinations.

### Desktop — maintained Python runtime

`app.py` and `ui/` render the Streamlit workflow. `pipeline.py` orchestrates
`score.parse_score`, `audio.extract` and `grading.analyze`. `score/lines.py`
provides written-line candidates and recording-based identification.
`contracts.py` holds dependency-free dataclasses. Domain packages import shared
contracts; audio must not depend on song selection or UI state.

Public contracts:

- `ScoreNote`: unique ID, printed measure label, onset/duration in quarter notes,
  sounding integer MIDI. Preserve rests as offsets; merge tied continuations.
- `ObservedNote`: original-clock onset/end seconds, fractional MIDI, confidence
  0–1. MIDI 69 is concert A4; Hz converts via `69 + 12*log2(hz/440)`.
- `Take`: active method/version, ordered events, warnings, optional duration and
  uncertain regions. Tracker confidence is measurement evidence, not a grade.
- `Finding`: kind, score/anchor ID, measure label, original playback timestamp or
  null, approximate-time flag and one practical action.
- `Result`: status, nullable grade/subscores, warnings, reference observations,
  at most three actionable findings and assessed fraction when available.
- Invalid input raises an input-specific error. Silence/insufficient evidence
  produces a null grade. Unexpected errors must not become a zero grade.

Consult actual source for the frozen contract and update producers, consumers
and tests together. Shared-type changes require integration work, not silent
field renaming in one package.

## Analysis and interaction rules

1. Snapshot the selected score, line, instrument, passage, mode and tempo at the
   start of a take. Lock conflicting controls. Ignore stale native callbacks;
   cancellation must not restart inference or save a spurious report.
2. Validate input before expensive inference. Android currently accepts plain
   XML/MusicXML up to 5 MB, with a 4-million-character saved-library budget;
   PCM16 WAV mono/stereo at 8–96 kHz, up to 25 MB and 180 seconds. Desktop audio
   remains limited to 45 seconds/25 MB. Keep UI, decoder and docs consistent.
3. Preserve lead-in silence and original recording clocks through downmixing,
   resampling and cleaning. Inspect silence/clipping before normalization.
   Conservative attenuation must not erase sustained/decaying notes. Handle
   stereo cancellation; avoid turning uncertain audio into confident omissions.
4. Run real pretrained CREPE inference. Python TorchCREPE and Android's bundled
   ONNX export are separate runtimes. A clearly labeled pYIN debugging fallback
   cannot satisfy the neural release check. Measure runtime on actual hardware.
5. Group pitch frames using stability and attack evidence. Repeated notes must
   remain distinguishable; vibrato alone must not create extra notes.
6. Align score notes and events monotonically with substitution, insertion and
   deletion operations. Use timing secondarily for repeated pitches. A local
   gap/error must not shift every later note. Select a written line from actual
   observations; preserve wrong notes as findings rather than changing the score.
7. Expressive mode starts at 50% pitch, 30% coverage, 20% local rhythm. Full pitch
   credit through 35 cents tapers to zero at 100 cents. Rhythm is full through
   0.15 local beats and zero at 0.5. Exclude the tested onset from its timing
   anchors; suppress timing across long gaps/rests or inadequate anchors.
   Reweight unavailable components. Android target-tempo mode uses 45/25/20 plus
   10% tempo; report the active mode and keep comparisons within compatible settings.
8. Require recognizable reliable evidence before grading or issuing personalized
   errors. Count uncertain regions separately. A slow accurate interpretation
   should retain comparable pitch/coverage; global slowdown alone is not an error
   in expressive mode. Frequency supplies pitch and is not a duplicate component.
9. Replay original audio for the correct report. Missing-note replay uses a nearby
   reliable anchor and clearly says approximate. Keep playback errors independent
   of an active capture session. Stop tools/reference audio before microphone grading.
10. Persist only complete reports and invalidate displayed results when inputs
    change. Preserve metrics if a score/recording is removed; never substitute a
    different score or the most recent recording when opening an older report.
11. On desktop, align references independently to the same score IDs. Cache only
    bundled reference features by content/model/preprocessing version. Titles and
    filenames never establish edition compatibility. Missing references must not
    block score-only results. Android reference upload is listening, not grading.
12. Keep the musician's reading order clear: next action, measure/replay, then
    score components and expandable evidence. Show loading, permission guidance,
    malformed-file recovery, insufficient evidence and retry in plain language.

## Build, run and verify

Use standard Windows CPython 3.12 for the desktop environment. Do not depend on a
bare `streamlit` command being on PATH. Activation is optional; the explicit
interpreter works even if `.ps1` opens in Notepad because of file association.
Run these in a PowerShell terminal, not by double-clicking the activation script:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
.\.venv\Scripts\python.exe -m pytest -q
node --test tests/mobile/*.test.cjs
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\android\gradlew.bat -p android testDebugUnitTest connectedDebugAndroidTest assembleDebug
```

`connectedDebugAndroidTest` requires an emulator or connected test device. The
APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Tool dependencies for
JavaScript tests live in `android/tools`; install its lockfile dependencies with
`npm.cmd ci --prefix android/tools` when needed. Keep one Python dependency list.
Do not commit SDK paths, caches, generated builds, credentials or signing keys.

Validate appropriate layers, then document the evidence:

- Python tests for real score/audio/grading, reference isolation and desktop UI.
- JavaScript tests for score lines, alignment, confidence gates, controller state,
  saved library/history, navigation and tools DSP. Identify fake-bridge tests.
- Native JVM tests for WAV decoding and malformed/unsupported input.
- Android instrumentation for actual WebView notation, packaged ONNX/JNI inference,
  imported score/WAV through report storage, correct native replay, tools and restart.
- Tablet-size layout checks; physical-device microphone/latency checks before a
  live demonstration. Emulator tones do not establish real acoustic accuracy.

Check clean and second-piece takes; deliberate wrong note; omission/extra note;
slow/rubato rendition; silence/noise/clipping; missing reference; unsupported
input; denial of microphone permission; cancel/retry/backgrounding; changed
inputs; independent old-report replay; restart and offline bundled operation.
Keep human and synthetic examples labeled. Do not invent usability participants,
accuracy claims, learning gains, grades or hardware timing measurements.

## Release and demonstration

After checks and integration, bump Android versionCode/versionName consistently.
Publish a new versioned GitHub Release in `Abhlnaw/Accelerando` with the APK and
SHA-256 checksum. Check the uploaded asset and release URLs. Use a prerelease
label for debug-signed test builds; describe remaining limitations. Preserve the
existing signing identity where possible so installing updates retains data.

Give the user the release link and minimal steps: download the APK on the tablet,
open it in My Files, allow installation from that source, install over the prior
build, open Home, choose/continue music, grant microphone permission, play one
melodic line, finish, inspect and replay the report. Airplane-mode practice must
work with bundled music; external searches require connectivity.

`android/README.md` documents tablet installation, formats and build steps.
`docs/ANDROID_VALIDATION.md` records current automated evidence and manual checks.
`docs/RELEASE_CHECKLIST.md` contains original desktop musical-validation evidence;
read its dates and scope rather than treating it as proof of tablet accuracy.

The Tidal Hack pitch still values technicality, ingenuity, interdisciplinary
impact, applicability and presentation. Demonstrate real neural inference,
localized replay and a deliberate slowdown versus wrong note using observed
results. Credit CREPE/TorchCREPE/ONNX Runtime/VexFlow and distinguish the team's
alignment/scoring/interface work from pretrained model work.
