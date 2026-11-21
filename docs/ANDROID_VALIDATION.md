# Android app validation

The home page and local practice workflow have automated coverage. This document
distinguishes packaged runtime checks from logic checks and physical-device work.

### Tidal Hack demo review

The source review passed 59 Python tests, 51 JavaScript tests and nine JVM tests.
In Edge, the desktop route **Studio → Try a bundled example → Porch Light →
Pitch variation → Analyze take** ran CREPE tiny on the bundled synthetic WAV.
It returned 96.5/100, assessed all written attacks and identified measure 2.
Score Run recorded a browser-simulated microphone, produced a replay and saved
the run in history. The tuner, metronome and drone each started and stopped.

The tablet web interface rendered real VexFlow notation, highlighted a three-bar
selection, played the selection and opened all six destinations in Edge. Home,
Practice, Progress and Library fit a 390-pixel viewport without horizontal page
scrolling. Android permission handling, native capture and acoustic latency on
physical hardware still need a device check for this revision.

### Earlier packaged build

Verified on 2026-11-21: 57 Python regression tests, 38 JavaScript logic/controller
tests, seven native decoder unit tests and three Android emulator tests. The Android
runtime suite passed on the phone viewport before integrating practice tools and
score-line identification, and on a 1280-by-800 tablet viewport with those features
integrated. Compilation and on-device model inference were verified; physical
Tab S7 FE microphone measurements remain pending.

| Area | Verification |
|---|---|
| Home, navigation, recent reports, library and history | JavaScript controller tests; Android WebView navigation test |
| Actual sheet music drawing | Real bundled VexFlow in the Android WebView; SVG notes checked |
| Instrument settings, part selection, octave/transposition | JavaScript parser/controller tests; native import and restart |
| Saved MusicXML library and settings | Repository tests; real Android restart test |
| Neural pitch inference on Android | Packaged CREPE ONNX model through Android JNI; A4 pitch checked |
| Score + WAV → observations → grade → report | Real Android file-result path, model, JS grouping/grading, native storage |
| Independent replay audio per report | Opaque recording IDs, file identity/length checks; actual Android media playback and stop checked |
| Quiet, unsupported, malformed or incomplete input | Logic gates and native WAV decoder checks |
| Cancel/retry, stale callbacks, capture locking and scoped errors | Controller tests; native cancellation check |
| Reference and external source actions, JSON export | Controller-to-bridge checks; Android media/file-picker paths compile |
| Practice tools page and exit cleanup | Real Android iframe load/teardown; controller test; tuner DSP unit test |
| Desktop app and original analysis pipeline | Python regression suite |

Controller tests use a DOM sandbox and fake native bridge/renderer. Android
instrumentation uses the actual installed APK, WebView, model, decoder and app
storage. The imported WAV test supplies the Android file picker's result at the
activity boundary; it does not automate the system file picker. The emulator was
started with host audio disabled; no physical microphone or acoustic latency was
measured. Synthetic tone inputs check runtime behavior, not performance across
all instruments or playing styles.

Manual Tab S7 FE checks before a public demo:

1. Install the updated APK over the earlier build; confirm saved reports remain.
2. Confirm Home opens, all navigation works, and the most recent score resumes.
3. Import MusicXML through My Files, restart, and reopen it from the library.
4. Allow microphone access, play a full single-note melody, finish and replay.
5. Make a deliberate pitch error; confirm localization and audible replay.
6. Repeat more slowly in expressive mode. Compare pitch and coverage.
7. Cancel model loading, deny microphone access, background the app, and retry.
8. Upload a PCM16 WAV, listen to a reference, stop playback and record again.
9. View an older report and confirm its own audio plays; export the JSON log.
10. Repeat the bundled piece in airplane mode. Source searches require connectivity.

The audio boundary remains one pitched melodic line. Polyphonic notation can be
projected to candidate melodic lines; that does not provide simultaneous chord
audio grading. Ensembles, percussion, automatic scanned-PDF recognition, compressed
MXL and game mechanics remain outside this build. Unsupported inputs get corrective
messages; ambiguous line identification withholds the grade.
