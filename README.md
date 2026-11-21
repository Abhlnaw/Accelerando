# Accelerando

A local practice coach for a short solo melody: MusicXML → audio observations →
alignment → a practice action with replay from the original take.

Agent 4's app and orchestration are implemented on `feat/app-integration`.
The initial repository did not contain the audio, score or grading packages, or
recorded fixtures. Genuine analysis becomes available when those owner branches
are integrated. Missing packages produce an actionable error, never a fake grade.
The development preview is explicitly synthetic and lives outside the pipeline.

## Start

Use standard Windows CPython 3.12 (not the MSYS Python on PATH on this laptop):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m streamlit run app.py
```

Open the localhost URL printed by Streamlit. No API key, account or cloud endpoint
is required. Select **Development preview** to review the practice screen before
the owner modules land. Select **Upload my performance** for the real pipeline.
Inference runs only when Analyze is pressed; replay and other reruns reuse the
completed session result. Changing input bytes clears the displayed result.

Supported inputs: uncompressed PCM WAV, at most 45 seconds and 25 MB, plus one
single-part concert-pitch `.musicxml`/`.xml` score under 5 MB. The score importer
owns validation of ties, parts, chords, repeats and notation. Compressed MXL,
PDF transcription, polyphonic grading and video are outside this build.
Use one unaccompanied instrument; accompanying music can confuse pitch tracking.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe demo_check.py --output demo-results.json
```

The first command checks orchestration with actual WAV bytes, explicit test
doubles for domain stages, and Streamlit's AppTest. These checks do not validate
musical accuracy or neural inference. The second command runs actual bundled
files through the UI's pipeline and records the model, timings, events, grades
and findings; it requires the owner modules and manifest. It fails clearly when
no bundled takes exist. Do not present preview values as measured results.

Verified environment for the app checks: Windows, CPython 3.12.0,
Streamlit 1.51.0, pytest 8.4.2. Dependencies are centralized in requirements.txt;
domain dependencies and pretrained-weight installation still need Agent 1's
tested versions. A pYIN result must display its actual method and cannot satisfy
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
features are cached by audio bytes, extractor source version and optional
`extract.cache_version`. Agent 1 should set that hashable token to include the
active method, model/weight version and preprocessing configuration; update it
whenever any change. Do not use a static token when switching fallback methods.
Only bundled references are cached; user audio is extracted on every submission.
Both caches are bounded, synchronized across sessions, and reset on restart.

## Bundled catalog agreement

Agent 2 owns `fixtures/manifest.json` and its media. The app expects a `pieces`
list (a top-level list is also accepted). Keep expected mistakes in separate test
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

Agent 4's boundary checks pass. Final release is pending owner branches, real
CREPE weights and takes, an offline cold start, and the combined acceptance matrix.
Use [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) to record actual values.
Merge owners into `feat/app-integration`, resolve contracts with each producer,
then open the reviewed integration PR into `main`. Do not merge the preview as
evidence that the neural release gate passed.
