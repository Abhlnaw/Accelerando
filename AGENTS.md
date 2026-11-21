# Accelerando | Tidal Hack architecture and four-person build guide

Place this AGENTS.md at the repository root. Each teammate starts a separate ChatGPT session on GPT-6.2 Sol with medium reasoning and a separate branch. Paste the prompt for your role below. Medium is sufficient for all four assignments. The coding assistant and the audio model in the app have different jobs.

## Tidal Hack challenge

> Apply AI and ML to real-world problems in ways that create meaningful cross-disciplinary impact.

**Accelerando is a practice coach for musicians working between lessons.** A student can hear that a phrase sounds different from a reference and still be unsure which note to practice. An experienced player may slow the same phrase deliberately. Accelerando uses neural pitch tracking to hear the performance, written notation to locate it, and music pedagogy to turn the evidence into one action the player can hear, try and check on a second take.

### Build for the five judging criteria

| Criterion supplied by the team | Design decision | Evidence to put in front of the judge |
|---|---|---|
| T — Technicality: how advanced is the code? | Connect pretrained CREPE inference, note segmentation, sequence alignment with gaps, and local timing estimation. | Expand one real finding. Trace recorded seconds → predicted pitch → written note ID → grade contribution. Show active model and measured runtime on the demo laptop. Credit CREPE and identify the team's own alignment, scoring and interface work. |
| I — Ingenuity: do you solve a unique problem? | Separate a player's choice of phrase timing from a likely note error. Use common written anchors even when the performances run at different speeds. | Play a deliberate slowdown and a planted substitution in the same excerpt. Show the measured grade difference and the exact measure flagged. This paired example demonstrates the distinctive idea without claiming market exclusivity. |
| D — Diversity: is the project interdisciplinary? | Audio engineering supplies reliable signal measurements. ML estimates pitch. Music theory supplies note identity and local beat structure. Music education supplies the practice instruction. | On one screen show a pitch estimate, its location in the score, and a musician-readable instruction. Let the judge hear the finding. Explain how low-confidence audio changes the advice. |
| A — Applicability: can it make a real impact? | Support a short repeatable practice loop for a musician with a solo recording and score. | Ask a teammate or volunteer who has not seen the planted error to locate it, replay it, and describe what to practice. Record whether they succeeded, time to locate it, and any confusion. Report participant count and observed outcome. Longer-term learning gains require further evaluation. |
| L — Looks: can you present and pitch it? | Give the result screen a clear reading order: next practice action, measure and replay, then grade breakdown and technical evidence. | A judge should be able to see “Measure 2 · First note”, hear the relevant moment in one click, and open the technical detail on demand. Rehearse with the actual display and speakers. |

### ChatGPT settings and runtime AI, by task

Each teammate can finish with **GPT-6.2 Sol, medium reasoning**. Low is an optional time saver for routine work. High is an optional escalation for a reproducible failure that medium has not resolved. The middle column below is the development setting; the last column names the method the shipped app actually runs.

| Owner and part | ChatGPT development setting | Runtime AI or algorithm |
|---|---|---|
| 1 · WAV validation, denoising and timestamp preservation | Sol medium | Signal processing: decode, noise attenuation and time conversion |
| 1 · Pitch tracking in user and reference recordings | Sol medium | **Required pretrained neural inference: CREPE.** Produces a pitch estimate and confidence per short frame. Ship pretrained weights and verify a real take reaches grading. |
| 1 · Repeated notes, vibrato and silence | Sol medium; high only for a persistent segmentation or clock error | Rules group frame predictions into note events and propagate uncertainty |
| 2 · MusicXML, ties, rests and pickup measures | Sol medium | Symbolic parsing; the written score is already structured |
| 2 · Manifest, fixtures and recording labels | Sol low or medium | Human-performed examples and hand-checked expected notes; reference audio reuses Person 1's extractor |
| 3 · Aligning expected and observed notes | Sol medium; high if an insertion or deletion shifts all later matches | Dynamic programming over the ML-derived events, with explicit gap costs |
| 3 · Rubato, subscores and practice feedback | Sol medium | Local tempo estimation, transparent scoring formulas and evidence-based text templates |
| 4 · Upload, result screen and replay | Sol medium; low for copy or styling | Standard UI and audio playback; the UI shows which model processed the take |
| 4 · Integration, offline demo and validation | Sol medium | Run the actual inference pipeline, collect measurements and check restart behavior |
| All · Pitch rehearsal | Sol low or medium for editing | Human presentation using measured demo results |

The MVP uses one pretrained model at inference time. Model training, generative feedback and paid LLM API calls are unnecessary for this design. If CREPE fails, pYIN lets teammates debug downstream code. A pYIN-only run does not satisfy Accelerando's neural-inference release check.

## Today's finish line

A musician uploads a short solo take and a single-part MusicXML score, or picks a bundled example. Accelerando cleans the audio, estimates the notes, aligns the take to the score, compares it with a reference performance when available, and returns a grade with measure-level feedback. Clicking a flagged measure plays the relevant moment. A slower but accurate interpretation should still score well.

Plan around six working hours, one unaccompanied melody in concert pitch, 10–45 seconds, WAV input and a local Python app. Use Streamlit for upload, playback and results so the four teammates can integrate through Python calls. A second score must work without code changes. An uploaded PDF may accompany its MusicXML for viewing. Automatic transcription of scanned pages, polyphonic grading and live tracking are later milestones.

## Git branches and pull requests

Each teammate uses a separate clone or Git worktree and opens their ChatGPT session in that checkout. Keep all implementation commits on the assigned branch. Reserve `main` for reviewed, integrated work.

| Owner | Assigned branch | Pull request base |
|---|---|---|
| Person 1 · Audio and ML | `feat/audio-ml` | `feat/app-integration` |
| Person 2 · Sheet music and references | `feat/score-references` | `feat/app-integration` |
| Person 3 · Alignment and grading | `feat/alignment-grading` | `feat/app-integration` |
| Person 4 · App and integration | `feat/app-integration` | `main` |

**Kickoff.** Person 4 runs the following commands in their clone, commits the shared contracts as their first change, then pushes the integration branch. These commands assume the team remote is named `origin`.

```sh
git fetch origin
git switch -c feat/app-integration origin/main
# Create contracts.py as specified in the data contract.
git add contracts.py
git commit -m "Define shared analysis contracts"
git push -u origin feat/app-integration
```

**People 1–3.** Once that push lands, each person runs `git fetch origin` and **only their own row** below. Starting from the integration branch brings in the same contracts that Person 4 will use for the demo.

| Owner | Create local branch | Publish and set upstream |
|---|---|---|
| Person 1 | `git switch -c feat/audio-ml origin/feat/app-integration` | `git push -u origin feat/audio-ml` |
| Person 2 | `git switch -c feat/score-references origin/feat/app-integration` | `git push -u origin feat/score-references` |
| Person 3 | `git switch -c feat/alignment-grading origin/feat/app-integration` | `git push -u origin feat/alignment-grading` |

**Every session.** Run `git branch --show-current` before editing and compare the output with your assigned branch. To resume an existing local branch, use `git switch <assigned-branch>`. If it exists only on the remote, fetch and use `git switch --track origin/<assigned-branch>`. Commit and push fixes on your own branch.

**Integration.** People 1–3 explicitly select `feat/app-integration` as the base when opening their pull requests. Person 4 reviews and merges those PRs there, then runs the acceptance checks on the combined app. Person 4 opens the final PR from `feat/app-integration` into `main` and asks another teammate to review the demo build before merge.

## Work packages and prompts

### 1. Audio analysis | branch feat/audio-ml | owns audio/ and audio tests

> Read AGENTS.md. Confirm the current branch is feat/audio-ml before editing. Implement the audio work package under audio/. Use the observation contract below, add a small smoke test, and report how to run it plus any model dependencies.

1. Decode WAV to mono samples, preserve the original for playback, and keep timestamps on its original clock. Detect silence and clipping. Estimate noise from quiet frames and apply conservative attenuation. Keep the raw path for comparison.
2. Use CREPE, a pretrained neural pitch tracker, on the uploaded performance. Verify it first on a clean scale. Cache its weights locally and measure CPU runtime. If setup exceeds 30 minutes, use pYIN to unblock integration while the audio owner fixes model loading. The release check requires one real WAV to pass through CREPE and its predictions to reach grading. Label the active method in results.
3. Group confident voiced frames into note events using onset evidence as well as pitch transitions so repeated notes can remain distinct. Use the median stable pitch to reduce vibrato sensitivity. Return uncertainty for ambiguous passages.
4. Deliver extract(path) for both the user's take and reference recordings. Verify silence gives no grade downstream, a sustained note survives cleaning, and the same phrase with mild noise keeps roughly the same pitches. Deliver one real observation sequence to Person 3 early.

### 2. Score and references | branch feat/score-references | owns score/ and fixtures/

> Read AGENTS.md. Confirm the current branch is feat/score-references before editing. Implement MusicXML ingestion and build the shared demo fixtures. Send the fixture paths and expected note IDs to everyone before polishing the importer.

1. Start with a four-measure original melody. Include a repeated note, rest and tied note. Publish its MusicXML, a hand-checked event list and a simple rendered WAV immediately.
2. Build parse_score(path) with music21 or equivalent. Export stable note IDs, printed measure labels, quarter-note offsets and sounding MIDI pitches. Merge ties across bars and retain the starting measure. Explicitly reject multiple simultaneous parts, chords, unexpanded repeats and unsupported transpositions for this prototype.
3. Record a clean human reference, a relaxed rendition with a clear phrase-ending slowdown, and a take with a known wrong note. Record the expected measure and timestamp. Add a second short score in a different key to catch hardcoding.
4. Create a reference manifest with score ID, edition, excerpt bounds, audio path, source and permission. The team-recorded reference is the offline default. Public music collections, IMSLP discovery and permitted YouTube-sourced recordings can feed this catalog later. Match editions before comparison. References are comparison examples. Training a new grading model would require separate labeled data.

### 3. Alignment and musical feedback | branch feat/alignment-grading | owns grading/ and grading tests

> Read AGENTS.md. Confirm the current branch is feat/alignment-grading before editing. Implement the alignment and grading functions against synthetic observations first. Demonstrate the expected outcome for a slower take, rubato, a wrong note and an unreliable take.

1. Implement monotonic sequence alignment with match, insertion and deletion operations. Start with pitch distance and note order. Use timing as a secondary cue for repeated pitches. Backtrack to produce score-note IDs paired with observed events or gaps.
2. Estimate a local beat-to-seconds map from confident matches over neighboring beats. Evaluate each onset against neighboring anchors, excluding the note being evaluated. Suppress timing feedback across long gaps or when anchors are sparse. Keep rubato and overall tempo as descriptive feedback.
3. Start with a transparent prototype grade: 50% pitch, 30% note coverage and 20% local rhythm. Proposed defaults: full pitch credit within 35 cents, taper to zero at 100 cents. Coverage is matched notes divided by matches plus insertions plus deletions. Rhythm credit tapers from full at 0.15 local beats of residual error to zero at 0.5 beats. Reweight available components when rhythm lacks anchors. Publish subscores. Withhold the overall grade for silence or insufficient reliable evidence. Calibrate these defaults on fixtures.
4. Align each reference separately to the same score IDs. Report comparable phrase duration and stable-note pitch or vibrato observations, identifying the reference used. A single reference cannot establish a normal range. Describe tone cautiously and keep it outside the grade. Use the score-only path when reference evidence is missing.
5. Deliver analyze(score, take, references) with a ranked list of at most three actionable findings. Each finding should say what happened, where to listen and what to practice. Count uncertain audio separately from confirmed errors.

### 4. App, integration and demo | branch feat/app-integration | owns app.py, shared types, dependencies and integration

> Read AGENTS.md. Confirm the current branch is feat/app-integration before editing. Build the Streamlit flow with fixture results first, publish the shared types and startup command, then replace each fixture adapter with its owner's implementation. Own the integrated demo and failure states.

1. Publish contracts.py and the fixture paths in the first 20 minutes. Maintain one dependency list. Build the upload and bundled-example flows with a visibly labeled fixture result.
2. Wire parse_score → extract → analyze. Process reference audio once per reference and analysis version. Display the active analysis method, grade, coverage and confidence warnings. Handle invalid formats, silence, missing references and failed decodes.
3. Show each finding beside its measure label with replay from the original take. For a missed note, use the nearest reliable anchor and label the time approximate. This measure list is the first deliverable. Colored noteheads on rendered notation are next if time permits.
4. Verify from a fresh checkout on the demo laptop. Remove fixture substitution from the real analysis path. If ahead of schedule, add MP4 audio extraction and test a phone video with an audio track and one without.

## Contract to freeze at kickoff

| Producer → consumer | Function or record | Required fields and units |
|---|---|---|
| Score → grading | parse_score(path) → ordered ScoreNote list | id, measure_label, onset_qn, duration_qn, midi. Quarter notes are counted from excerpt start, including rests. |
| Audio → grading | extract(path) → Take | method, warnings, ordered events. Each event has onset_s, end_s, midi_float, confidence in [0,1]. Seconds start at original file time zero. |
| References → grading | references | List of (reference_id, Take) pairs for the same score excerpt. Empty list is valid. |
| Grading → app | analyze(score, take, references) → Result | status, grade or null, subscores on 0–100 scale or null, warnings, reference observations, findings. Each finding has kind, score_note_id or neighboring anchor ID, measure_label, playback_s or null, approximate_time, message. |

Example across all four branches: score note m2n1 is MIDI 69 at quarter-note offset 4. An event at 2.6 seconds with MIDI 70.0 is about 100 cents sharp if matched there. The result should identify measure 2 and replay at 2.6 seconds even when the reference reached that measure earlier.

## Merge schedule and release checks

| Time from kickoff | Team checkpoint |
|---|---|
| 0:00–0:20 | Person 4 publishes shared types and launch command. Person 2 publishes expected events. People 1 and 3 build against the contracts. |
| 0:20–1:30 | Run a vertical slice with one fixture. Score and audio owners hand real outputs to grading. Confirm note IDs and timestamps before tuning. |
| 1:30–3:00 | Merge score and audio branches, then grading, into the app branch. Run a genuine upload end to end. Keep reference loading optional. |
| 3:00–4:30 | Run acceptance cases below. Fix the first broken pipeline stage. Compare clean and expressive takes before adjusting weights. |
| 4:30–6:00 | Freeze scope, run offline on demo hardware, record a backup demo, and rehearse the three-take comparison. |

| Acceptance case | Passing behavior |
|---|---|
| Clean take and second piece | Both produce aligned measure labels and a grade using the same code. |
| Same notes, slower tempo with phrase-ending rubato | Pitch and coverage stay comparable. Demo target: overall grade within five points of the clean take. |
| One wrong note in measure 2 | Measure 2 is flagged and playback lands on the recorded error. Later measures remain aligned. |
| Omitted or extra note | One local gap or insertion appears. Later correct notes recover their score IDs. |
| Silence, noisy or clipped take | Silence yields a null grade. Unreliable passages carry warnings and avoid confident claims. |
| Missing reference | Score-based results remain available. The app identifies whether a reference contributed. |

## Scope cuts in order

Preserve real audio, denoising, score alignment, interpretation-aware scoring, one reference comparison and localized feedback. If time runs short, demo WAV only, keep measure links, and prioritize working neural pitch inference over optional features. Call out the active method during the demo. After the core passes, prioritize video upload, graphical sheet annotations, then multiple licensed reference performances. Live score following, an osu!-style practice mode, tuner, metronome and drone each belong in a later work package.

## Collaboration rules

Each teammate owns one branch and tests their normal entry point. Send shared schema changes to Person 4 before changing callers. Person 4 resolves integration issues with the producing owner. Keep fixtures small and attributable. Each handoff includes the callable, one real example, the command used to verify it, and known limitations.

## Implementation specification

The sections above are the kickoff brief. Use the following design for implementation. Numeric settings below are starting values to validate against the team's recordings. Delivery means that a teammate can reproduce the behavior through an upload and explain a particular finding back to the musician.

### 1. System boundary and runtime

Run one Streamlit server on the demo laptop. The browser collects two inputs and renders the results. Python on the server decodes files, runs inference and computes feedback. Use synchronous analysis on a submitted form for the short clips. Report the current stage in the UI so the musician can distinguish loading the model from analyzing the take. The proposed MVP needs no login, database, cloud inference endpoint, background queue or ChatGPT API key. Each teammate uses ChatGPT for development. The pitch tracker runs when the musician submits audio.

| Component | Owns | Reads → produces | Failure boundary |
|---|---|---|---|
| Browser and app.py | Input choice, status, original playback, results | Uploaded bytes or bundled selection → analysis request | Preserve the selected inputs and give one concrete corrective action |
| pipeline.py | Stage order, optional references, temporary-file lifetime | Request → parsed score, extracted take, then final result | A bad reference can be dropped independently of a good user take |
| score/importer.py | Written musical intent | MusicXML → ordered ScoreNote sequence | Reject ambiguous scores before running expensive inference |
| audio/extractor.py | Acoustic evidence | Original WAV → timestamped observed notes and warnings | A decodable silent file returns an empty Take. A corrupt file raises an input error |
| grading/alignment.py | Correspondence | Expected and observed sequences → matched pairs, gaps, extras | Preserve the path even when the grade must be withheld |
| grading/scoring.py | Evidence, confidence and interpretation | Alignment → subscores, grade, ranked findings | Sparse timing evidence produces a null rhythm subscore |
| fixtures/manifest.json | Bundled examples and reference identity | Score and edition identifiers → allowable reference files | Unknown scores can still be graded against their own notation |
| contracts.py | Types shared by all four branches | Common field names, units and nullable values | Changes require updating producers, consumers and fixtures together |

Keep imports flowing from app to pipeline to domain packages. All packages may import contracts. The audio package never needs to know which song was selected. The score importer never opens a microphone recording. The grading package should be testable using ordinary Python objects on a machine with no model installed.

### 2. Repository map and entry points

| Proposed path | Owner | Specific responsibility |
|---|---|---|
| contracts.py | 4 | Dataclasses and status values. Keep free of Streamlit, inference and score-parser imports |
| app.py, pipeline.py | 4 | Streamlit entry point and callable orchestration respectively |
| requirements.txt, README.md | 4 | One tested environment, launch command, model setup, supported inputs |
| audio/__init__.py, audio/extractor.py | 1 | Public extract(path) export, decoding, cleaning, tracking and event formation |
| score/__init__.py, score/importer.py | 2 | Public parse_score(path) export, validation and note normalization |
| fixtures/piece_a/, fixtures/piece_b/, fixtures/manifest.json | 2 | Scores, takes, expected outputs, reference identity and provenance |
| grading/__init__.py, grading/alignment.py, grading/scoring.py | 3 | Public analyze(score, take, references), sequence alignment and grading |
| tests/test_audio.py, tests/test_score.py, tests/test_grading.py | Respective owner | Small reproducible tests for each producer |
| tests/test_pipeline.py | 4 | Exercise the same orchestration called by the UI with actual files |

Proposed commands from repository root: install with `python -m pip install -r requirements.txt`, launch with `python -m streamlit run app.py`, run checks with `python -m pytest -q`. These are implementation targets. Person 4 records the Python version, working dependency versions and cold/warm analysis times from the actual demo laptop.

### 3. Follow one real analysis request

1. The musician chooses **Try an example** or **Upload my performance**. An example resolves to a manifest entry. An upload supplies a WAV and MusicXML. A new upload must never inherit a previous example's reference just because the filenames match.
2. On **Analyze**, snapshot the inputs. Validate the allowed formats, decoded duration, and bounded file sizes before inference. Suggested demo limits are 45 seconds and 25 MB of audio. Give a distinct error when a WAV contains no readable audio frames. Treat user filenames as display labels and create your own temporary paths.
3. Parse notation once. The parser returns ordered sounding notes with measure labels and musical positions. One quarter note is one unit regardless of playback speed. Preserve rests as gaps in offsets.
4. Decode the take once. Keep original bytes available for playback. Downmix and resample a separate analysis buffer. Every timestamp returned must refer to elapsed seconds in the uploaded recording, including lead-in silence.
5. Extract user observations. If the take is silent, skip reference inference and alignment and return an insufficient-evidence result. For noisy but usable audio, continue with warnings attached.
6. Resolve compatible references. For bundled pieces use the manifest. A safe first matching mechanism for uploaded copies is an exact score-content hash. A different engraving can fall back to score-only analysis even if the title matches. Cache only bundled reference features using audio hash, extractor method, model version and preprocessing settings.
7. Align the user's observations and each reference independently to the score. A written note ID becomes the common key between performances recorded at different speeds. Never compare frame 500 of the user's recording directly with frame 500 of a professional recording.
8. Compute the grade and findings. Include which evidence contributed. The UI shows the original take for playback even if the tracker used a denoised copy.
9. Store the completed result in per-session state keyed to its submitted inputs. A change of input invalidates the displayed grade. Replay actions reuse the result. Remove temporary uploads after processing, including on exceptions. Keep playback bytes only as long as the active session needs them.

### 4. Data contract details

Use Python dataclasses internally. Lists preserve chronological order. MIDI 69 denotes concert A4. A fractional MIDI value preserves intonation. Sounding pitches, score beats, and original recording seconds are three distinct quantities.

| Record | Fields and conventions |
|---|---|
| ScoreNote | id: unique string within imported excerpt. measure_label: string as printed. onset_qn: nonnegative float. duration_qn: positive float. midi: integer sounding pitch. Generate IDs from measure traversal index and sounding-note ordinal so a repeated printed label cannot cause a collision. |
| ObservedNote | onset_s, end_s: finite floats with 0 ≤ onset_s < end_s. midi_float: finite float. confidence: 0–1 tracker evidence summary, interpreted within the active method. |
| Take | method: method/version string. events: ordered ObservedNote list. warnings: stable codes such as SILENT, CLIPPED or LOW_SIGNAL. Optional diagnostics: duration_s and timing of uncertain regions. Freeze those optional fields before integrating uncertainty-sensitive omissions. |
| Finding | kind: pitch, rhythm, missing, or extra. score_note_id: matched or nearest anchor. measure_label: display label from that anchor. playback_s: original audio time or null. approximate_time: boolean. message: observation and one practice action. |
| Result | status: ok or insufficient_evidence. grade: 0–100 or null. subscores: pitch, coverage and rhythm, each 0–100 or null. warnings: codes. reference_observations: list with reference_id, affected measures and observation. findings: up to three. |
| Pipeline error | Invalid or unsupported input stops the request with an input-specific message. An unexpected internal error produces a retry message. Neither is encoded as a zero grade. |

Example handoff: expected note `{id: "m2n1", measure_label: "2", onset_qn: 4, duration_qn: 1, midi: 69}`; observation `{onset_s: 2.60, end_s: 3.05, midi_float: 70.02, confidence: 0.94}`. A confident alignment means the note was approximately 102 cents sharp. Feedback can say **Measure 2, first note: you played about a semitone above A4. Replay the entrance, then sing or tune the A before playing it again.** Playback can begin 0.3 seconds before the event to give the musician context. Keep 2.60 as the actual event timestamp.

### 5. Audio implementation recipe | Person 1

1. **Decode and inspect.** Read PCM samples and sample rate. Convert to floating point, check for empty or nonfinite buffers, and inspect clipping before normalizing amplitude. Detect silence on the original signal so normalization cannot amplify an empty room into a performance.
2. **Prepare the analysis buffer.** Select the tracker's required rate. Preserve original duration through resampling. If cropping leading silence for speed, store the offset and add it back to every emitted timestamp. Verify using a file with exactly one second of leading silence.
3. **Reduce steady background noise.** Estimate background energy from quiet frames if there are enough credible quiet frames. Attenuate stationary noise conservatively, cap attenuation, and retain the raw buffer. Try a quiet sustained note and a decaying final note. Disable or weaken cleaning when it removes either. Denoising cannot reliably isolate a soloist from accompanying music in this prototype.
4. **Run inference.** For each frame retain time, estimated fundamental frequency and voicing confidence. Convert a positive frequency to fractional MIDI with 69 + 12 × log2(frequency / 440). Drop invalid frequencies. If model loading fails, choose the documented baseline and expose its method name. Record installation and warm-up separately from per-take latency.
5. **Turn frames into notes.** Group contiguous voiced frames of similar pitch. Split on a sustained pitch change or a credible new attack after an energy dip. Require a change to persist across several frames before splitting. Brief vibrato excursions should stay in the same note. Check adjacent repeated notes explicitly because their pitches may be identical.
6. **Summarize each event.** Use median stable pitch from the note body. Keep attack timing for onset and the end of voicing for release. Report confidence from supporting frames, and keep ambiguous regions available to grading. A pitch-track confidence number is evidence about the measurement, not a musical grade.
7. **Handoff.** Supply clean and mildly noisy output from the same phrase, annotated with known pitches and times, plus a repeated-note test and a silence result. Compare inferred pitches and event counts; listening to cleaned audio alone does not verify the tracker.

### 6. Notation and reference implementation recipe | Person 2

1. Write an original excerpt both teammates and judges can recognize after one hearing. Suggested first bar: C4 quarter, C4 quarter, quarter rest, G4 quarter. Start bar 2 on A4 so the wrong-note demo can substitute B-flat4. Include a tie across a later barline. For a 10–45 second demo, choose a tempo that keeps four bars within the upload window.
2. Walk notation in score order. Convert durations to quarter-note units using the parser. Advance across rests. For a pickup, count elapsed beats from excerpt start and preserve the printed measure label. A measure number multiplied by four is an incorrect offset for pickups, changing meters and rests.
3. For a tied note, emit one expected attack, extend its duration through continuation segments, and retain the starting measure ID. For two separately articulated notes of the same pitch, emit two attacks. Validate against a hand-written list made independently from the parser.
4. Handle unsupported notation at the import boundary. If another independent voice or chord enters, return a message asking for a single melodic part. Select an explicit policy for grace notes and ornaments before accepting them; the simplest first release rejects unsupported ornaments with a clear message.
5. Put a rendered WAV beside the score for deterministic testing. Add separately labeled human clean, rubato and wrong-note takes for musical validation. An actual teammate records those files. Keep synthetic examples visibly labeled if a human recording is unavailable.
6. Manifest entry example: piece_id=piece_a, edition=team_v1, score_path=fixtures/piece_a/score.musicxml, reference_path=fixtures/piece_a/reference.wav, excerpt=measures 1–4, performer=team member, source=team recording, permission=team-approved demo use. Keep expected mistakes in test metadata separate from the runtime reference manifest so the app cannot read an answer key.
7. Handoff includes paths, expected note IDs, expected first and last beat, and the approximate timestamp of the planted error measured on the recording. Deliver a second key and melody to prove the algorithm generalizes to a new uploaded score.

### 7. Alignment, rubato and scoring recipe | Person 3

**Alignment.** Let S contain N score notes and O contain M reliable observed events. Build a table D with (N+1) × (M+1) cells. D[i,j] stores the cheapest explanation for the first i expected notes and first j observed events. Initialize the first row with cumulative insertion costs and the first column with cumulative deletion costs. For every other cell choose the minimum of three predecessors.

| Predecessor | Interpretation | Backtracking output |
|---|---|---|
| D[i−1,j−1] + substitution cost | One performed event corresponds to one score note, possibly at the wrong pitch | Score ID, observation index and pitch residual |
| D[i−1,j] + deletion cost | Expected note lacks a corresponding observation | Score ID and surrounding anchors |
| D[i,j−1] + insertion cost | Extra performed event between score anchors | Observation index and nearest score anchor |

An initial experiment can use gap cost 1 per event and substitution cost min(1.5, absolute pitch difference in semitones). This lets one semitone substitution cost less than deleting and inserting the same position. Many wildly different notes may still align mechanically. Require independent evidence that the excerpt is recognizable before issuing personalized findings. Record the selected predecessor at every cell, then backtrack and reverse the path. With repeated pitches and equally good paths, use neighboring confident pitches and local timing to choose the more plausible attack. If ambiguity remains, describe the measure instead of naming an exact repeated note.

**Timing.** Use score beats as x and original recording seconds as y. For an internal matched note, pick one reliable matched neighbor on each side with distinct beat positions. Interpolate its expected time between those two anchors. Divide observed-minus-expected seconds by the local seconds per beat. This gives a signed residual in local beats. Example: neighbors at beats 4 and 6 start at 3.0 and 4.4 seconds. Beat 5 is expected near 3.7 seconds. An observed onset at 3.77 is 0.10 local beats late and earns full timing credit under the kickoff thresholds. A globally slower performance stretches both anchors naturally. Sparse anchors, long rests and abrupt phrase-ending stretches require conservative timing feedback. Do not extrapolate through an entire unmatched passage.

**Prototype grade.** For each confident matched note, compute absolute cents error as 100 × absolute MIDI difference. Award full pitch credit through 35 cents, zero at 100 cents, and interpolate linearly between. Average eligible pitch credits. Compute coverage on evaluable matched, extra and missing events. Use the piecewise timing rule above for eligible timing anchors. If the three component scores are 90, 100 and 80, the grade is 0.50×90 + 0.30×100 + 0.20×80 = 91. If timing is unavailable, the same pitch and coverage yield (45+30)/0.80 = 93.75. Keep full precision internally and round once for display.

**Evidence rules.** Separate an absent attack in a clearly recorded passage from a dropout where the tracker had little evidence. Exclude unresolved gaps from confirmed error counts, show the assessed fraction, and withhold the grade if too little remains. A proposed kickoff gate for the demo pieces is at least four confident matched notes and at least half the expected phrase supported by reliable anchors. Calibrate that gate with a partially recorded take and an unrelated melody. Avoid giving an almost empty take a high score simply because two detected notes happened to match.

**Reference path.** Extract and align reference audio with the same pipeline. For a phrase with common first and last score anchors, compare elapsed seconds between their corresponding attacks. Label this an onset-to-onset span. For example, a user's 4.8-second span versus a 4.0-second reference span can be described as 20% longer. Phrase timing belongs in the interpretation panel. If a phrase lacks common anchors, omit the comparison. Median note pitch can support a tuning observation. A note's single median pitch cannot establish vibrato rate, dynamics or tone quality; those require retaining additional within-note measurements.

**Rank feedback.** Prefer reproducible errors with reliable locations. Order by confidence and musical impact, combine adjacent findings with the same cause, and return up to three. A beginner sees the target note, measure and practice action. A more experienced player can expand the same finding for cents error, local-beat offset and reference context. Both views use the same evidence.

### 8. App behavior and integration recipe | Person 4

| Screen or state | Musician can do | Implementation detail |
|---|---|---|
| Start | Pick a bundled piece or submit matching score and WAV | Clearly display accepted formats and solo-instrument scope |
| Ready | Listen to original recording, confirm selection, press Analyze | Keep analysis behind explicit submit so widget reruns do not repeat inference |
| Processing | See reading score, extracting notes, aligning or preparing feedback | On failure show the stage and retain valid inputs |
| Results | Read grade, assessed fraction, pitch, coverage, rhythm and active method | A missing subscore displays “Too little evidence” |
| Practice | Select a finding, see the measure and replay the passage | Clamp playback start at zero. Use original audio. Label inferred timestamps for omissions |
| Reflection | Compare phrase lengths with available references | Identify reference performer or source and which measures were compared |
| Retry | Upload another take of the same excerpt | Reuse score and bundled reference features. Invalidate the previous take's findings |

Start with a fake Result object exclusively in a labeled development fixture. Then integrate in this order: real parser with fixture take, real extractor with printed observations, real alignment with displayed diagnostics, final feedback and replay. This sequence makes it possible to tell whether an incorrect displayed measure originated in parsing, matching or rendering. Before release, exercise the upload path with a renamed file and altered note so the demo proves the pipeline processes the selected bytes.

### 9. Parallel execution and handoffs

| Time | Audio | Score and references | Grading | App and integration |
|---|---|---|---|---|
| 0–20 min | Decode test WAV and verify original time axis | Publish piece A score and hand-checked events | Write clean/wrong/missing event sequences | Publish types, branches, fixture paths and launch command |
| 20–90 min | Produce first real Take and model runtime | Parse score and verify rest, repeat attack and tie | Backtrack alignments and print note-to-event pairs | Upload flow and fixture results with replay |
| 90–180 min | Tune segmentation on a human take | Record the three performances and add manifest | Add pitch, coverage, local timing and reference comparison | Merge real stages and run first full upload |
| 180–270 min | Diagnose clipped/noisy cases | Add second piece and rejection cases | Compare rubato and clean grades, inspect shifted matches | Run acceptance matrix on demo laptop and fix integration |
| 270–360 min | Verify offline CREPE inference on a real uploaded take | Verify fixtures, recording labels and timestamps | Freeze weights and explain one grade by hand | Freeze build, rehearse, capture backup and verify restart |

Each branch handoff should include its commit ID, public import, example input, actual output, verification command and outstanding weakness. Person 4 integrates shared types first. Each other owner pulls that commit before finalizing their module. At hour three, feature work pauses until one genuine upload completes the entire path.

### 10. Debugging by symptom and demo sign-off

| Symptom | Inspect first | Evidence that isolates the issue |
|---|---|---|
| All feedback plays too early | Audio time origin, then UI seek | Compare event onset with a known one-second lead-in on the original file |
| Every note after bar 2 seems wrong | Importer offsets, then alignment path | Inspect ties, rests and first unexpected gap side by side |
| Rubato take receives low rhythm | Local timing anchors | Print neighboring beats, timestamps and seconds per beat for one penalized onset |
| A wrong note disappears | Substitution versus gap costs | Print backtracked operations around the planted error |
| Extra notes appear on sustained tones | Audio segmentation | Inspect within-note pitch and voicing around vibrato |
| Grade looks high on silence or unrelated audio | Evidence gate | Inspect reliable anchor count, fraction assessed and warning codes |
| New upload shows old findings | Session key or cached result | Submit two different recordings with identical filenames |
| App works online only | Model initialization and reference acquisition | Restart the server offline and run a full bundled and uploaded take |

Release evidence should include the three takes, their actual grades and assessed fractions, the planted-error measure and timestamp, second-piece result, silent-input result, and a fresh-start run time. Record observed results after implementation. The expected five-point rubato tolerance is a demonstration target. Fixture checks do not establish accuracy across all instruments or playing styles.

### 11. Architecture after the hackathon

| Extension | Existing seam | Additional work before shipping |
|---|---|---|
| Phone video | Input decoder before extract | Select audio stream, preserve media timestamps, handle video with no audio track, replay at the correct video time |
| Public score and recording lookup | Reference catalog and score importer | Search by work, match movement and edition, track source and permitted use, let users confirm excerpt and part |
| Scanned PDF score | New adapter before parse_score | Recognize symbols, allow correction of uncertain measures, emit the same normalized ScoreNote sequence |
| Annotated score | Finding.score_note_id | Render notation with a persistent ID-to-graphical-element map. Tied continuations and repeated measure labels need explicit mapping |
| Live score following | Alignment engine | Incremental audio windows, bounded-latency inference and recovery after a skipped measure. Keep separate from completed-take scoring |
| Tone and style modeling | Acoustic feature extraction and evaluation | Collect instrument-specific features and multiple labeled performances. Validate against musician judgments before including tone in a grade |
| Accuracy game | Matched note events | Expose game-specific timing windows with a distinct mode so expressive practice can retain flexible timing |
| Drone, tuner, metronome | Practice screen | Provide independent tools. Reuse pitch estimates for tuner display and keep generated practice audio out of graded recordings |

## Tidal Hack release and pitch

Each teammate brings one piece of proof to the final rehearsal. Person 1 brings the active model name and one real pitch trace. Person 2 brings the score, the human reference and labeled comparison takes. Person 3 brings the actual clean/rubato grade difference and the planted-error match. Person 4 owns replay, the timed user walkthrough and the live pitch. Keep observed values blank until the integrated app produces them.

| Measure to fill in at rehearsal | How to obtain it | What the result supports |
|---|---|---|
| Inference method and runtime, numeric seconds | Time a real WAV through the app on the demo laptop; distinguish first and subsequent runs | Technical feasibility on the tested hardware |
| Clean grade, rubato grade and difference | Analyze two human renditions of the same correct notes; kickoff target is within five points | Tolerance of the specific expressive variation tested |
| Expected and detected measure, expected and replay timestamp | Independently label the planted error, then inspect the actual finding | Accuracy and usefulness of error localization on this excerpt |
| Participant count, time to locate the issue, practice action stated | Give a first-time user the results screen and observe them without coaching | Whether the feedback was usable in that small trial |
| Second-piece outcome and silent-input outcome | Submit a different score/take pair and a silent recording | Generality beyond the demo melody and appropriate handling of uncertainty |

**Suggested 90-second pitch**, adjustable to the event's actual limit:

1. **0–15 seconds · Person 2, musician's problem.** “Listen to the end of this phrase. I slowed down on purpose. In the next take I played one wrong note. Which one should a practice coach ask me to change?” Play the short excerpts.
2. **15–35 seconds · Person 1, ML.** Submit the real take. Show its pitch estimates beside the original audio. Explain that CREPE estimates what was played and that the team converts frame measurements into notes with timestamps.
3. **35–55 seconds · Person 3, interpretation.** Show the clean and expressive results with the actual values. Explain one local beat comparison. Switch to the planted-error take and point to the written note and measured pitch discrepancy.
4. **55–80 seconds · Person 4, practice action.** Click the flagged measure. Let the audience hear it, show one instruction, and replay a corrected take if available. Report the observed usability result if the team collected one.
5. **80–90 seconds · Close.** “Accelerando helps a musician decide what to practice next while leaving room for how they want the phrase to sound.” State the tested scope: short solo recordings with matching MusicXML.

For judging, prioritize a genuine neural analysis, correct measure localization, audible replay and the expressive comparison before adding accessories. If a target fails at rehearsal, report the observed result and narrow the demonstration to behavior the team verified.
