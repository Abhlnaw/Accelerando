# Agent 2 handoff

Call `from score import ScoreInputError, parse_score` and
`parse_score("fixtures/piece_a/score.musicxml")`. The importer uses Python's
standard library and returns a list of the integration branch's
`contracts.ScoreNote` records. Invalid or unsupported XML raises
`ScoreInputError`, a subclass of the shared `contracts.InputError`.

The two original scores and five synthetic WAVs run offline. Load
`fixtures/manifest.json` from the repository root to resolve the score, exact
edition, excerpt bounds, and bundled audio. Piece A has a rendered reference.
Piece B has no reference, so it can exercise score-only grading.

| Piece | First attack | Last attack | Checks |
| --- | --- | --- | --- |
| Porch Light, C major, 4/4 | `m1n1`, beat 0, MIDI 60 | `m4n3`, beat 15, MIDI 60 | `m1n1` and `m1n2` are separate C4 attacks. The first rest leaves beat 2 empty. The G4 tie starts at `m3n4`, beat 11, and lasts two beats. |
| Turning Leaves, G major, 3/4 | `m1n1`, beat 0, MIDI 67 | `m3n3`, beat 8, MIDI 67 | Includes fractional beats, a rest, and F-sharp4 at `m3n2`. |

The hand-checked event list and the exact planted-error timestamp are in
`tests/data/expected_scores.json`. The pitch variation replaces the first
note of measure 2 (`m2n1`) with B-flat4 at approximately 3.583 seconds,
including the recording's lead-in. The slowdown begins at the final bar.
Expected errors are test metadata and are excluded from the runtime manifest.

Run the score and fixture checks from the repository root after the shared
contract is available:

```sh
python -m unittest discover -s tests -p test_score.py
```

Rebuild the five synthetic WAVs with `python fixtures/render_examples.py`.
The manifest identifies the rendered audio as synthetic. To complete the
human validation set, record `piece_a/score.musicxml` three times in concert
pitch with no accompaniment: a clean take, a take with a phrase-ending
slowdown, and a take substituting B-flat4 for the first A4 in measure 2.
Capture each as a 10–45 second WAV. Add the matchable reference and takes to
the manifest with the actual performer, source and permission. Mark the
observed wrong-note timestamp separately in test metadata.

The importer accepts uncompressed, partwise MusicXML with one concert-pitch
melody. It rejects chords, simultaneous voices, repeats and jumps, grace
notes, ornaments, cue notes and nonzero transpositions for the prototype.
