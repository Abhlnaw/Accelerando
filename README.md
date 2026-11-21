# Accelerando

In the Streamlit studio, open **Webcam technique** to practice a visible
position while singing or playing. Choose a mode and camera-facing setup,
enable the webcam on localhost or HTTPS, and start the check. **Hold a
position** compares ten seconds of practice against a three-second reference.
The fixed, mirrored preview shows head, shoulders, torso,
and both elbows together. For guitar, bass or bowed strings, select the
string count and tap four points on the two outer strings. Keep the instrument
aligned to this grid. The camera compares each visible left fingertip's
estimated string with its calibrated position and reports placement separately
from posture. It cannot determine pressure or physical contact. **Repeat a gesture** calibrates two
positions, then grades how consistently you reach each of four timed targets.
A low-visibility take prompts a retry.
Frames and landmarks stay in the browser. The form score measures consistency
with the chosen pose and is independent of sheet-music grading.

A local practice coach for a short solo melody: MusicXML → audio observations →
alignment → a practice action with replay from the original take.

The standalone **Android tablet app** is in [android/](android/README.md), with
local microphone capture, neural pitch inference, live notation following and
practice history. See its README for APK installation and Tab S7 FE testing.
The Streamlit workflow below supports browser microphone recording and WAV uploads.

To hear the notation before recording, upload MusicXML on **Practice** and open
**Hear the written score**. Select a written line and either the whole piece or
a measure. The same player is available on Examples and in the results score
view. On the tablet, tap a measure or **Whole piece**, then **Hear selection**.
Playback uses sounding pitches in equal temperament (A4 = 440 Hz), written
durations and numeric tempo markings, with 80 quarter notes per minute as the
starting tempo when the score supplies none.

Open **Practice journal** in Streamlit or **Progress → Practice journal** on the
tablet to log time, material practiced, personal notes, and recurring mistakes.
Streamlit can attach the current assessment and charts daily minutes and average
grades by piece. Its journal is stored in the local user's
`.accelerando/journal.sqlite3`. The tablet keeps its journal in device history
alongside recorded takes. Enter the full session duration when annotating a take.

Open **Practice tools** in either app for a live chromatic tuner, tap-tempo
metronome, and sustained reference drone. The tuner and drone share the concert
A calibration. The metronome and drone can play together. Use **Stop all** or
leave the page to end the session. Browser microphone access requires HTTPS or
localhost and microphone permission.

All four work packages are integrated: MusicXML parsing, local pretrained CREPE
pitch inference, interpretation-aware grading, and the Streamlit app. The bundled
melodies and comparison takes are labeled synthetic. A permitted recorded flute
clip is included for real-performance inference checks. The separate development
preview contains invented results and never feeds the upload pipeline.

## Score run

Choose a saved piece and written line, listen to its preview, then record a run.
The playfield follows the performed notes with live pitch and timing judgments.
The musical grade uses the expressive pitch, coverage and local rhythm weights.
Arcade points scale that grade to 10,000 and advance with matched notes during
the run. A combo counts consecutive clean matches. Finish to replay a finding
and compare grades in the local history for that piece and line.

Android consumes on-device CREPE frames and replays the saved native take.
The browser uses microphone pitch detection and keeps the latest replay while
the run is open. Both use the same note segmentation and assessment code.
## Start

Use standard Windows CPython 3.12 (not the MSYS Python on PATH on this laptop):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

Open the localhost URL printed by Streamlit. The app runs locally with no API
key or account. Start from **Studio**, upload a solo WAV and matching MusicXML
in **Practice**, or select a bundled synthetic performance in **Examples**.
**Results** provides measure-level feedback, original audio replay, a written
note table, reference comparisons, and diagnostics. **How it works** explains
the grade and includes a labeled development preview.

Select **Analyze take** to run inference and open Results. Page navigation and
replay reuse the current session result. Changing the inputs for that take
clears its result. The studio artwork and fonts are bundled for offline use.
The editable screen designs are in the
[Accelerando Figma file](https://www.figma.com/design/MCpnMokEoGfPuaGpdE9vzH).

Record in Practice or upload a PCM WAV up to 45 seconds and 25 MB. Add the matching
partwise MusicXML under 5 MB. Sing or play one line from the score. The app compares
the take to written parts, staves, voices and chord tones and identifies the line
in the report. An ambiguous match withholds the grade. Full-chord audio grading,
compressed MXL, PDF transcription and video are outside this build.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe demo_check.py --output demo-results.json
```

The first command includes real CREPE audio tests, score and grading unit tests,
orchestration boundary checks, Streamlit's AppTest, and real end-to-end runs with
network connections blocked. Boundary checks explicitly use test doubles; the
integration checks use all three real modules. The second command runs actual bundled
files through the UI's pipeline and records the model, timings, events, grades
and findings; it requires the owner modules and manifest. It fails clearly when
no bundled takes exist. Do not present preview values as measured results.

Verified environment: Windows, CPython 3.12.0, Streamlit 1.51.0, pytest 8.4.2.
The single requirements.txt includes Agent 1's CPU Torch/Torchaudio 2.8.0,
torchcrepe 0.0.24, NumPy, SciPy, SoundFile and librosa versions. TorchCREPE ships
the pretrained tiny CREPE weights in its wheel; no download occurs at inference.
The score parser and grading modules use Python's standard library.
A pYIN result displays its actual method and cannot satisfy
the neural release check. CREPE credit belongs to its pretrained pitch model;
the team implements segmentation, alignment, scoring and the interface.

## Owner handoff

Shared contracts were first published in commit `38321df` on
`origin/feat/app-integration`. Public imports to integrate:

```python
from score import parse_score     # path -> list[ScoreNote]
from audio import extract        # path -> Take
from grading import analyze      # score, take, [(reference_id, Take)] -> Result
from pipeline import Request, run_analysis

# Same real path used by the app; filenames are only display/format labels.
from pathlib import Path
analysis = run_analysis(Request(
    Path("my_take.wav").read_bytes(),
    Path("my_score.musicxml").read_bytes(),
))
print(analysis.take.method, analysis.result.grade, analysis.timings_s)
```

Paths supplied to owners are owned temporary files, removed even on exceptions.
Raise `contracts.InputError` (or `ValueError`) for unsupported inputs. Unexpected
failures are logged on the server and show the processing stage with a retry
instruction. A bad optional reference is dropped independently.

Optional frozen evidence fields: `Take.duration_s`, `Take.uncertain_regions`
(`UncertainRegion` records), and `Result.assessed_fraction` in 0–1. The grader
must calculate the assessed fraction; the UI displays unavailable if omitted.
Subscores use a dictionary with `pitch`, `coverage`, `rhythm`, all 0–100 or None.
Reference observations are `ReferenceObservation` dataclasses. See contracts.py.

Parsed scores are cached by bytes and importer source version. Bundled reference
features are cached by audio bytes, extractor source version, active method and optional
`extract.cache_version`. Agent 1 should set that hashable token to include the
active method, model/weight version and preprocessing configuration; update it
whenever any change. Do not use a static token when switching fallback methods.
Only bundled references are cached; user audio is extracted on every submission.
Both caches are bounded, synchronized across sessions, and reset on restart.

## Bundled catalog agreement

Agent 2 owns `fixtures/manifest.json` and its media. The app expects a `pieces`
list (a top-level list is also accepted). The shipped manifest uses one optional
`reference_path` and `reference_id` per piece, with piece-level source and
permission. The list form below is also supported for multiple references.
Keep expected mistakes in separate test
metadata. Proposed paths: `fixtures/piece_a/score.musicxml`,
`fixtures/piece_a/reference.wav`, `fixtures/piece_a/clean.wav`,
`fixtures/piece_a/rubato.wav`, `fixtures/piece_a/wrong_note.wav`, and
`fixtures/piece_b/score.musicxml` with its own take. Nothing substitutes for
missing recordings.

```json
{
  "pieces": [{
    "piece_id": "piece_a",
    "title": "Original melody A",
    "edition": "team_v1",
    "excerpt": "measures 1–4",
    "score_path": "fixtures/piece_a/score.musicxml",
    "takes": [{
      "label": "Clean · synthetic or human, label accurately",
      "audio_path": "fixtures/piece_a/clean.wav",
      "source": "Identify the actual performer or renderer"
    }],
    "references": [{
      "reference_id": "piece_a_team_v1",
      "audio_path": "fixtures/piece_a/reference.wav",
      "source": "Team recording · performer name",
      "permission": "Team-approved demo use"
    }]
  }]
}
```

Uploads acquire a reference only when their score bytes exactly match the bundled
score. Titles and filenames never select references. All bundled paths must stay
inside fixtures/. Unknown editions still use score-only analysis.

## Release status

See [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) for measured integration
evidence and outstanding human validation. The public recorded flute clip checks
neural inference on a human performance; it does not replace recording the team's
clean/rubato/wrong-note performances. A synthetic comparison does not establish
grading accuracy across instruments or demonstrate learning gains.
