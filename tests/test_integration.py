"""Release boundaries through real parser, local CREPE and grader (no adapters)."""
from io import BytesIO
from unittest.mock import patch
import wave

from pipeline import ROOT, Request, run_analysis


def request(piece, name="clean"):
    return Request((ROOT / f"fixtures/{piece}/{name}.wav").read_bytes(),
                   (ROOT / f"fixtures/{piece}/score.musicxml").read_bytes(),
                   "renamed-performance.wav", "renamed-score.musicxml")


def test_real_bundled_pipeline_pitch_rubato_reference_and_second_piece_offline():
    # Model weights must load from the installed wheel, including a cold process.
    with patch("socket.socket.connect", side_effect=AssertionError("network forbidden during inference")):
        clean = run_analysis(request("piece_a"))
        rubato = run_analysis(request("piece_a", "rubato"))
        wrong = run_analysis(request("piece_a", "variation"))
        second = run_analysis(request("piece_b"))
    for analysis in (clean, rubato, wrong, second):
        assert analysis.take.method.startswith("CREPE tiny")
        assert analysis.result.status == "ok"
        assert analysis.result.assessed_fraction >= .75
    assert clean.result.grade >= 95
    assert abs(clean.result.grade - rubato.result.grade) <= 5
    assert clean.result.reference_observations
    assert not second.result.reference_observations
    assert "SCORE_ONLY" in second.result.warnings
    finding = next(f for f in wrong.result.findings if f.kind == "pitch")
    assert finding.measure_label == "2"
    assert finding.score_note_id == "m2n1"
    assert abs(finding.playback_s - 3.583) < .15


def test_real_silent_upload_has_no_grade_or_reference_inference():
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
        wav.writeframes(bytes(16000 * 2))
    req = request("piece_a")
    with patch("pipeline.compatible_references", side_effect=AssertionError("silent reference inference")):
        analysis = run_analysis(Request(buffer.getvalue(), req.score_bytes))
    assert analysis.result.status == "insufficient_evidence"
    assert analysis.result.grade is None
    assert "SILENT" in analysis.result.warnings


def test_recorded_flute_reaches_grade_with_neural_predictions():
    # Written B3 C4 C#4 D4 attacks, independent of extractor predictions.
    pitches = (("B", 3, 0), ("C", 4, 0), ("C", 4, 1), ("D", 4, 0))
    notes = "".join(f"<note><pitch><step>{step}</step><alter>{alter}</alter>"
                    f"<octave>{octave}</octave></pitch><duration>1</duration></note>"
                    for step, octave, alter in pitches)
    xml = ('<score-partwise><part id="P1"><measure number="1">'
           '<attributes><divisions>1</divisions></attributes>' + notes +
           '</measure></part></score-partwise>').encode()
    with patch("socket.socket.connect", side_effect=AssertionError("network forbidden during inference")):
        analysis = run_analysis(Request((ROOT / "tests/data/recorded_flute_scale.wav").read_bytes(), xml))
    assert analysis.take.method.startswith("CREPE tiny")
    assert len(analysis.take.events) == 4
    assert analysis.result.status == "ok"
    assert analysis.result.grade >= 95
    assert analysis.result.assessed_fraction == 1
