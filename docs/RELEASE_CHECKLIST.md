# Integrated demo sign-off

Integration checked on 2026-11-21 on Windows CPython 3.12.0: all 50 tests passed
from a fresh committed checkout in 10.54 seconds. The full suite covers
real CREPE audio, score parsing, grading, orchestration boundaries and the UI.
The two original melodies and comparison takes are synthetic. The permitted
recorded flute clip is a human performance; team comparison recordings and
learning outcomes remain unevaluated.

Measured outputs are saved in [demo-results.json](demo-results.json) and
[runtime-evidence.json](runtime-evidence.json). These are observed inference
results, separate from the hand-checked test answer key.

| Required proof | Observed value / status |
|---|---|
| Agent 1 branch, dependencies and offline pretrained weights | PR #4 merged into integration; CPU weights included in installed torchcrepe wheel |
| Agent 2 branch, manifest, two scores and permitted human takes | PR #1 merged into integration; two scores and synthetic takes; human team takes pending |
| Agent 3 branch, alignment and uncertainty-sensitive grading | PR #3 merged into integration; unit and actual audio integration checks passed |
| Genuine uploaded WAV → CREPE predictions → final grade | Recorded B3–D4 flute clip: 4 events, status ok, grade ≥95 in integration test |
| Active method and first/warm analysis seconds | CREPE tiny (torchcrepe 0.0.24); same clean take total 4.623 s cold / 0.547 s warm; extraction 3.098 / 0.535 s |
| Clean and rubato grades, assessed fractions, difference ≤5 target | Synthetic clean 100, rubato 100; both 100% assessed; difference 0 |
| Measure 2 substitution, detected measure and exact original timestamp | Synthetic variation 96.54; m2n1 / measure 2; expected 3.583 s, detected 3.590 s |
| Omitted and extra note: later notes regain written IDs | Grader unit checks pass with known note observations; no human omission/extra recordings supplied |
| Second piece uses the same pipeline without code changes | Turning Leaves: 100, 100% assessed, score-only |
| Silence returns null grade; noisy/clipped audio shows cautious feedback | Real silent upload yields null; extractor noise/clipping tests and grader uncertainty tests pass |
| Missing reference preserves score-based result | Real second-piece result and broken-reference boundary check pass |
| Renamed upload with altered audio changes the result | Same-filename altered bytes invalidate UI results; real files analyzed with renamed labels |
| Reference caching after repeated submissions | Cache boundary check passed; actual warm reference stage 0.008 s vs 0.522 s cold |
| Fresh checkout, offline model initialization and restart | All 50 checks passed in a fresh checkout; cold inference with socket connections blocked passed; integrated server health returned ok |
| Replay accuracy on actual speakers and display | Pending human listen |
| First-time users: count, time to locate finding, practice action, confusion | Not evaluated |
| Backup recording of the live demo | Pending rehearsal |
| Another teammate reviews final PR into main | User explicitly waived this step and authorized main merge after checks |

Run `python demo_check.py --output demo-results.json` on the actual demo laptop
after merging owner branches. Run a second time for warm timing. Preserve real
method names, stage timings, inferred events and grade contributions. Manually
label the wrong-note timestamp independently before inspecting the finding.
Compare common written anchors, not equal timestamps across performances.

For one judge walkthrough: select a real take, Analyze, show next action and
measure, press Replay passage, then open Technical evidence for predicted MIDI,
written ID and runtime. Demonstrate the expressive and wrong-note takes in the
same excerpt. State the tested solo scope and report observed values honestly.
