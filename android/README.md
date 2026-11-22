# Accelerando for Android

Standalone debug APK for Android 8+ (API 26), including ARM64 for the Samsung
Galaxy Tab S7 FE. Neural inference, notation and practice history run locally.
No laptop server, Python installation, login or API key is needed on the tablet.

## Install and test on your tablet

1. Build using the instructions below, or use the APK already built at
   `android/app/build/outputs/apk/debug/app-debug.apk` (about 44 MB).
2. Connect the tablet to the PC by USB and select **File transfer** on the tablet.
3. Copy the APK to the tablet's Downloads folder. Open **My Files → Downloads**,
   tap the APK, and allow My Files to install this app if prompted. Tap Install.
4. Open **Accelerando**. Home shows your saved music, practice totals and recent
   reports. Select **Continue practice**, then choose your instrument. Twinkle is bundled; no score
   download is necessary. Keep **Score / instrument default** selected for this
   bundled arrangement, including guitar's written-to-sounding octave shift.
5. Tap **Start practice** and allow microphone access. Wait for **I'm listening**.
   Play single notes with clear separate attacks, at a comfortable pace. Tap
   **Finish take**. The report and practice attempt are stored on this tablet.
6. Play another take with a deliberate wrong note. Confirm its measure is flagged
   and **Replay passage** plays the relevant part. Repeat the correct melody
   more slowly: expressive mode should avoid a penalty solely for overall tempo.
7. Open **Your progress** to compare attempts on the same piece, instrument,
   passage and mode. Use **Export practice log** to save JSON through Android's
   file picker. Restart the app and confirm practice history remains.
8. Enable airplane mode and repeat the bundled piece to verify offline operation.
   IMSLP/YouTube source links require a browser and connectivity; inference does not.

Place the tablet roughly 0.5–1 metre from the instrument to start. Avoid a backing
track or speaker playing while the microphone listens. If the app reports
clipping, move it farther away. Quiet or ambiguous audio can remain ungraded.
This build has not yet been tested with the physical Tab S7 FE microphone.

**Follow written tempo** starts the cursor with the first stable heard note and
uses MusicXML tempos (80 BPM when unspecified). **Target tempo** uses your BPM.
**Follow my phrasing** moves with matched attacks. Only recorded notes count
toward a grade in all three modes. Choose **Voice** to sing a melody in a
consistent higher or lower octave. Select a measure before starting to score
just that measure. A recognizable opening with at least four reliable matching
notes can receive a separate excerpt score when the full piece is unfinished.

## Other inputs

- **Music library → Import MusicXML** accepts an uncompressed partwise `.musicxml`
  or `.xml` file, up to 5 MB. Choose a written line from parts, staves, voices or
  chord tones, or leave **Match my recording** enabled to identify it after a take.
  Ambiguous line matches remain ungraded.
  Imported scores and selected line/instrument settings persist across restarts.
  The library has a 4-million-character storage budget and rejects additions if full.
- **Upload audio or video** accepts PCM16 WAV, MP3, M4A and MP4 with an audio track, up to 25 MB and three minutes. Android decodes compressed recordings locally and uses the first audio track for grading and replay.
- **Play reference audio** opens a local audio file using Android's media player.
  A reference is for listening; it does not change the assessment. Starting a
  microphone take stops reference playback.
- **Search IMSLP** and **Find on YouTube** open source searches in the external
  browser. This build does not automatically convert scanned IMSLP pages into
  notes, download YouTube audio, or match remote recordings to an edition.

The model tracks one pitched melodic line across the selectable instrument
profiles. Profiles handle notation transposition; they are not separate trained
instrument models. Simultaneous performed chord grading, ensembles, percussion, automatic
PDF recognition, compressed MXL and game mechanics are not implemented. The app
rejects unsupported scores instead of assigning fabricated note assessments.
It retains the latest 20 recordings with independent IDs for report replay;
older reports retain metrics and clearly report unavailable audio. Up to 500
practice reports are kept. Export the practice log to keep a separate copy.

## Build on Windows

Install Android Studio with SDK Platform 36 and a compatible build-tools version.
From the repository root, point Java and the SDK to your installation:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
.\android\gradlew.bat -p android assembleDebug
```

Gradle downloads dependencies on the first build. The shipped ONNX model and
VexFlow bundle are checked into source, so an ordinary build does not require
Python or npm. Do not commit `local.properties`, build outputs or signing keys.
The APK is debug-signed for a local demo; it is not a Play Store release.

To regenerate assets:

```powershell
.\.venv\Scripts\python.exe -m pip install -r android/tools/requirements.txt
.\.venv\Scripts\python.exe android/tools/export_crepe.py
npm.cmd ci --prefix android/tools
Copy-Item android/tools/node_modules/vexflow/build/cjs/vexflow.js android/app/src/main/assets/web/vexflow.js
```

## Verification

```powershell
node --test tests/mobile/*.test.cjs
.\.venv\Scripts\python.exe -m pytest -q
.\android\gradlew.bat -p android testDebugUnitTest
.\android\gradlew.bat -p android connectedDebugAndroidTest
.\android\gradlew.bat -p android assembleDebug
```

The JavaScript checks cover controller flows, persistence, transposition, score
parts, ties/rests, alignment recovery, uncertainty, tempo modes and note grouping.
JVM checks validate the native PCM decoder. Android instrumentation checks require
an emulator or test device and exercise actual WebView notation, JNI neural
inference, native score/WAV imports, report saving, replay file identity and restart.
Microphone quality and live latency still require a physical tablet test. The
ONNX export checks seven pitches against the original PyTorch network; measured
maximum activation difference is saved in `app/src/main/assets/model-info.json`.
Compilation and emulator tests do not establish microphone accuracy or latency
on the tablet. Live markings are provisional and can change as later notes
clarify alignment. The app reports measured inference time during recording.

Model credits: pretrained [CREPE](https://github.com/marl/crepe),
[TorchCREPE](https://github.com/maxrmorrison/torchcrepe),
[ONNX Runtime](https://github.com/microsoft/onnxruntime), and
[VexFlow](https://github.com/0xfe/vexflow). License notices are bundled in assets.
