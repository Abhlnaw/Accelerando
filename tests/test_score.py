import json
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path

from score import ScoreInputError, parse_score


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = json.loads((ROOT / "tests/data/expected_scores.json").read_text(encoding="utf-8"))
MANIFEST = json.loads((ROOT / "fixtures/manifest.json").read_text(encoding="utf-8"))
NOTE = "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note>"
ATTRIBUTES = "<attributes><divisions>1</divisions></attributes>"


def score_xml(body: str) -> str:
    return f'<score-partwise><part id="P1">{body}</part></score-partwise>'


class ScoreTests(unittest.TestCase):
    def parse_xml(self, xml: str):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.musicxml"
            path.write_text(xml, encoding="utf-8")
            return parse_score(path)

    def test_fixtures_match_hand_checked_attacks(self):
        for piece in MANIFEST["pieces"]:
            with self.subTest(piece=piece["piece_id"]):
                notes = parse_score(ROOT / piece["score_path"])
                rows = [[getattr(note, field) for field in EXPECTED["columns"]] for note in notes]
                self.assertEqual(rows, EXPECTED[piece["piece_id"]])

    def test_pickup_and_duplicate_printed_labels_follow_elapsed_duration(self):
        xml = score_xml(
            f'<measure number="0" text="Hidden" implicit="yes">{ATTRIBUTES}{NOTE}</measure>'
            '<measure number="1" text="1a"><attributes><divisions>2</divisions></attributes>'
            f'<forward><duration>1</duration></forward>{NOTE}</measure>'
            f'<measure number="2" text="1a">{NOTE}</measure>'
        ).replace("<score-partwise>", '<score-partwise xmlns="urn:musicxml">')
        notes = self.parse_xml(xml)
        self.assertEqual(
            [(note.id, note.measure_label, note.onset_qn, note.duration_qn) for note in notes],
            [("m1n1", "0", 0, 1), ("m2n1", "1a", 1.5, 0.5), ("m3n1", "1a", 2, 0.5)],
        )

    def test_three_segment_notation_tie_is_one_attack(self):
        measures = "".join(
            f'<measure number="{index}">{ATTRIBUTES}{NOTE.removesuffix("</note>")}'
            f'<notations><tied type="{tie}"/></notations></note></measure>'
            for index, tie in enumerate(("start", "continue", "stop"), 1)
        )
        notes = self.parse_xml(score_xml(measures))
        self.assertEqual([(note.id, note.measure_label, note.duration_qn) for note in notes],
                         [("m1n1", "1", 3)])

    def test_unsupported_inputs_have_actionable_errors(self):
        cases = [
            ("<score-partwise>", "readable"),
            ("<score-timewise/>", "partwise"),
            ("<score-partwise><part/><part/></score-partwise>", "one melodic part"),
            (score_xml(f"<measure>{ATTRIBUTES}{NOTE}</measure><measure/>"), "notes or rests"),
        ]
        for marking, message in [
            (NOTE.replace("<note>", "<note><chord/>"), "without chords"),
            ("<backup><duration>1</duration></backup>", "overlapping"),
            ('<barline><repeat direction="backward"/></barline>', "repeat signs"),
            ('<barline><ending number="1" type="start"/></barline>', "alternate endings"),
            ('<attributes><measure-style><beat-repeat type="start"/></measure-style></attributes>',
             "repeat signs"),
            ('<direction><sound dacapo="yes"/></direction>', "jumps"),
            ("<attributes><transpose><chromatic>-2</chromatic></transpose></attributes>", "concert pitch"),
            (NOTE.replace("<note>", "<note><grace/>"), "grace notes"),
            (NOTE.replace("</note>", "<notations><ornaments><trill-mark/></ornaments></notations></note>"),
             "ornaments"),
            (NOTE.replace("</note>", '<tie type="start"/></note>'), "final tie"),
        ]:
            cases.append((score_xml(f"<measure>{ATTRIBUTES}{NOTE}{marking}</measure>"), message))
        cases.append((
            score_xml(f'<measure>{ATTRIBUTES}{NOTE.replace("</note>", "<voice>1</voice></note>")}'
                      f'{NOTE.replace("</note>", "<voice>2</voice></note>")}</measure>'),
            "single voice",
        ))
        for xml, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(ScoreInputError, message):
                self.parse_xml(xml)

    def test_manifest_audio_is_supported_and_reference_is_optional(self):
        self.assertTrue(any(piece["reference_path"] is None for piece in MANIFEST["pieces"]))
        for piece in MANIFEST["pieces"]:
            paths = [take["audio_path"] for take in piece["takes"]]
            if piece["reference_path"]:
                paths.append(piece["reference_path"])
            for path in paths:
                with self.subTest(path=path), wave.open(str(ROOT / path), "rb") as wav:
                    self.assertEqual((wav.getnchannels(), wav.getsampwidth()), (1, 2))
                    self.assertTrue(10 <= wav.getnframes() / wav.getframerate() <= 45)

    def test_pitch_variation_audio_changes_measure_two_at_documented_time(self):
        variation = EXPECTED["variation"]
        piece = next(piece for piece in MANIFEST["pieces"] if piece["piece_id"] == variation["piece_id"])
        note = next(row for row in EXPECTED[piece["piece_id"]] if row[0] == variation["note_id"])
        self.assertEqual(note[1], "2")
        for take_id, expected_midi in [("clean", note[4]), ("variation", variation["midi"])]:
            path = next(take["audio_path"] for take in piece["takes"] if take["id"] == take_id)
            with self.subTest(take=take_id), wave.open(str(ROOT / path), "rb") as wav:
                rate = wav.getframerate()
                onset_frame = round(variation["onset_s"] * rate)
                wav.setpos(onset_frame - 32)
                self.assertEqual(wav.readframes(33), bytes(66))
                self.assertNotEqual(wav.readframes(32), bytes(64))
                wav.setpos(onset_frame + rate // 10)
                period = rate // 5
                samples = struct.unpack(f"<{period}h", wav.readframes(period))
            crossings = sum(a < 0 <= b for a, b in zip(samples, samples[1:]))
            expected_hz = 440 * math.pow(2, (expected_midi - 69) / 12)
            self.assertAlmostEqual(crossings * rate / period, expected_hz, delta=5)


if __name__ == "__main__":
    unittest.main()
