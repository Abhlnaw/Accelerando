"""Orchestration checks use real temporary WAVs and explicit domain test doubles.

These prove stage boundaries, not neural inference or musical accuracy.
"""
from io import BytesIO
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch
import wave

from contracts import InputError, ObservedNote, Result, ScoreNote, Take
import pipeline as p
from replay import replay_html
from score.lines import ScoreLine


def wav_bytes(seconds=1, value=100):
    buffer = BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        wav.writeframes(value.to_bytes(2, "little", signed=True) * int(8000 * seconds))
    return buffer.getvalue()


class PipelineTests(unittest.TestCase):
    def setUp(self):
        p._score_cache.clear()
        p._reference_cache.clear()
        self.request = p.Request(wav_bytes(), b"<score-partwise/>")
        self.score = [ScoreNote("m1n1", "1", 0, 1, 69)]
        self.take = Take("test-extractor", [ObservedNote(.3, .8, 69., .95)])
        self.paths = []
        def parse(path):
            self.paths.append(path)
            self.assertEqual(path.read_bytes(), self.request.score_bytes)
            return [ScoreLine("Test part", self.score)]
        def extract(path):
            self.paths.append(path)
            self.assertTrue(path.exists())
            return self.take
        self.parser = parse
        self.extractor = extract
        self.grader = lambda score, take, references: Result("ok", 100)

    def run_request(self, references=()):
        modules = {"score": types.SimpleNamespace(read_lines=self.parser),
                   "audio": types.SimpleNamespace(extract=self.extractor),
                   "grading": types.SimpleNamespace(analyze=self.grader)}
        with patch.object(p, "import_module", side_effect=modules.__getitem__), \
             patch.object(p, "compatible_references", return_value=list(references)):
            return p.run_analysis(self.request)

    def test_real_file_stage_order_and_cleanup(self):
        result = self.run_request()
        self.assertEqual(result.result.grade, 100)
        self.assertEqual(result.take.duration_s, 1)
        self.assertIn("SCORE_ONLY", result.result.warnings)
        self.assertTrue(all(not path.exists() for path in self.paths))

    def test_silence_skips_references_and_grading(self):
        self.take = Take("test", warnings=["SILENT"])
        self.grader = lambda *_: self.fail("silent input reached grading")
        with patch.object(p, "_domain", side_effect=lambda package, name:
                          {"score": self.parser, "audio": self.extractor}[package]), \
             patch.object(p, "compatible_references", side_effect=AssertionError("reference inference")):
            result = p.run_analysis(self.request)
        self.assertIsNone(result.result.grade)
        self.assertEqual(result.result.status, "insufficient_evidence")

    def test_empty_wav_and_corrupt_audio(self):
        for data in (wav_bytes(0), b"not a wav", wav_bytes()[:-4]):
            with self.subTest(size=len(data)), self.assertRaises(InputError):
                p.validate_request(p.Request(data, b"<score/>"))

    def test_duration_and_size_limits(self):
        with self.assertRaises(InputError):
            p.validate_request(p.Request(wav_bytes(45.01), b"<score/>"))
        with self.assertRaises(InputError):
            p.validate_request(p.Request(wav_bytes(), b"x" * (p.MAX_SCORE_BYTES + 1)))

    def test_score_rejected_before_extraction(self):
        self.parser = lambda _: (_ for _ in ()).throw(ValueError("single melodic part required"))
        self.extractor = lambda _: self.fail("should not run expensive inference")
        with self.assertRaisesRegex(InputError, "single melodic part"):
            self.run_request()
        self.assertTrue(all(not path.exists() for path in self.paths))

    def test_cleanup_on_unexpected_grading_failure(self):
        self.grader = lambda *_: (_ for _ in ()).throw(RuntimeError("failure"))
        with self.assertRaises(RuntimeError):
            self.run_request()
        self.assertTrue(all(not path.exists() for path in self.paths))

    def test_bad_reference_does_not_discard_take(self):
        result = self.run_request([p.ReferenceSpec("missing", Path("nonexistent.wav"), "team", "yes")])
        self.assertEqual(result.result.grade, 100)
        self.assertIn("REFERENCE_UNAVAILABLE", result.result.warnings)

    def test_bundled_reference_cache(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "reference.wav"
            path.write_bytes(wav_bytes())
            refs = [p.ReferenceSpec("ref", path, "team", "team approved")]
            first = self.run_request(refs)
            count = len(self.paths)
            second = self.run_request(refs)
            self.assertEqual(len(self.paths), count + 1)  # user extracted again; reference and score reused
            self.assertEqual(len(first.references), 1)
            self.assertEqual(len(second.references), 1)

    def test_filename_never_selects_reference(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "fixtures").mkdir()
            (root / "fixtures" / "score.musicxml").write_bytes(b"same score")
            manifest = {"pieces": [{"score_path": "fixtures/score.musicxml", "references": [
                {"reference_id": "ref", "audio_path": "fixtures/ref.wav", "source": "team", "permission": "yes"}]}]}
            (root / "fixtures" / "manifest.json").write_text(json.dumps(manifest))
            self.assertEqual(len(p.compatible_references(b"same score", root)), 1)
            self.assertEqual(p.compatible_references(b"different score", root), [])
            with self.assertRaises(InputError):
                p.fixture_path("../outside.wav", root)

    def test_shipped_manifest_single_reference_is_resolved(self):
        score = (p.ROOT / "fixtures/piece_a/score.musicxml").read_bytes()
        refs = p.compatible_references(score)
        self.assertEqual(len(refs), 1)
        self.assertEqual(refs[0].reference_id, "piece_a_rendered_reference_v1")
        self.assertTrue(refs[0].path.exists())
        second_score = (p.ROOT / "fixtures/piece_b/score.musicxml").read_bytes()
        self.assertEqual(p.compatible_references(second_score), [])

    def test_content_keys_ignore_renaming_but_detect_altered_take(self):
        renamed = p.Request(self.request.audio_bytes, self.request.score_bytes, "renamed.wav")
        changed = p.Request(wav_bytes(value=200), self.request.score_bytes)
        self.assertEqual(renamed.key, self.request.key)
        self.assertNotEqual(changed.key, self.request.key)

    def test_fractional_replay_and_clamp(self):
        self.assertIn("const start = 2.3000000000000003", replay_html(b"a", 2.6, 5))
        self.assertIn("const start = 0.0", replay_html(b"a", .1, 5))


if __name__ == "__main__":
    unittest.main()
