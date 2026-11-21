"""Exercise the public grading call with known score and take evidence."""

from dataclasses import replace
from unittest import TestCase

from contracts import ObservedNote, ScoreNote, Take, UncertainRegion
from grading import analyze, analyze_with_evidence
from grading.alignment import align


def demo_score() -> list[ScoreNote]:
    pitches = [60, 60, 67, 69, 71, 72, 67, 65, 64, 62, 65, 60]
    beats = [0, 1, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14]
    lengths = [1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2]
    ordinals: dict[int, int] = {}
    score = []
    for pitch, beat, length in zip(pitches, beats, lengths):
        measure = beat // 4 + 1
        ordinals[measure] = ordinals.get(measure, 0) + 1
        score.append(ScoreNote(f"m{measure}n{ordinals[measure]}", str(measure), beat, length, pitch))
    return score


def make_take(
    score: list[ScoreNote], *, tempo: float = 0.65, lead_in: float = 0.0, cents: float = 0
) -> Take:
    events = [
        ObservedNote(
            lead_in + tempo * note.onset_qn,
            lead_in + tempo * (note.onset_qn + 0.8 * note.duration_qn),
            note.midi + cents / 100,
            0.95,
        )
        for note in score
    ]
    return Take("synthetic", events)


class GradingTests(TestCase):
    def setUp(self):
        self.score = demo_score()
        self.clean = make_take(self.score, lead_in=1.0)

    def test_clean_second_piece_and_slower_with_rubato(self):
        clean = analyze(self.score, self.clean)
        slow = make_take(self.score, tempo=0.9, lead_in=1.0)
        for index, event in enumerate(slow.events):
            stretch = 0.035 * max(0, self.score[index].onset_qn - 7) ** 2
            slow.events[index] = replace(event, onset_s=event.onset_s + stretch, end_s=event.end_s + stretch)
        expressive = analyze(self.score, slow)
        second_score = [
            ScoreNote(f"p{i}", "0" if i == 0 else "1", beat, 0.5, pitch)
            for i, (beat, pitch) in enumerate(zip((0, 0.5, 1.5, 2, 2.5), (76, 74, 71, 69, 71)))
        ]
        second = analyze(second_score, make_take(second_score))

        self.assertEqual(clean.grade, 100)
        self.assertEqual(clean.assessed_fraction, 1)
        self.assertEqual(expressive.status, "ok")
        self.assertEqual(expressive.subscores["pitch"], 100)
        self.assertEqual(expressive.subscores["coverage"], 100)
        self.assertLessEqual(abs(expressive.grade - clean.grade), 5)
        self.assertEqual(second.grade, 100)

    def test_wrong_measure_and_original_recording_time(self):
        wrong = make_take(self.score)
        wrong.events[3] = replace(wrong.events[3], midi_float=70.02)
        report = analyze_with_evidence(self.score, wrong)
        finding, = report.result.findings

        self.assertEqual(finding.kind, "pitch")
        self.assertEqual(finding.score_note_id, "m2n1")
        self.assertEqual(finding.measure_label, "2")
        self.assertAlmostEqual(finding.playback_s, 2.6)
        self.assertFalse(finding.approximate_time)
        self.assertIn("102 cents sharp of A4", finding.message)
        self.assertEqual(report.alignment[-1].score_note_id, self.score[-1].id)
        self.assertEqual(report.alignment[-1].observed_index, len(wrong.events) - 1)
        self.assertAlmostEqual(report.result.subscores["pitch"], 100 * 11 / 12)
        self.assertAlmostEqual(report.result.grade, 100 - 50 / 12)

    def test_missing_note_uses_anchor_and_alignment_recovers(self):
        take = make_take(self.score)
        del take.events[3]
        report = analyze_with_evidence(self.score, take)
        finding, = report.result.findings

        self.assertEqual(finding.kind, "missing")
        self.assertEqual(finding.score_note_id, "m2n1")
        self.assertTrue(finding.approximate_time)
        self.assertAlmostEqual(finding.playback_s, 1.95)
        self.assertAlmostEqual(report.result.subscores["coverage"], 100 * 11 / 12)
        self.assertEqual(report.uncertain_score_notes, 0)
        self.assertNotIn("m1n3", report.rhythm_residuals)
        self.assertEqual(report.alignment[3].neighboring_anchor_ids, ("m1n3", "m2n2"))
        self.assertEqual(report.alignment[-1].observed_index, 10)

    def test_extra_note_uses_its_own_onset_and_alignment_recovers(self):
        self.clean.events.insert(4, ObservedNote(4.0, 4.2, 78, 0.99))
        report = analyze_with_evidence(self.score, self.clean)
        finding, = report.result.findings

        self.assertEqual(finding.kind, "extra")
        self.assertEqual(finding.measure_label, "2")
        self.assertEqual(finding.playback_s, 4.0)
        self.assertAlmostEqual(report.result.subscores["coverage"], 100 * 12 / 13)
        self.assertEqual(report.alignment[-1].score_note_id, self.score[-1].id)
        self.assertEqual(report.alignment[-1].observed_index, 12)
        self.assertEqual(report.alignment[4].score_note_id, finding.score_note_id)
        self.assertEqual(report.alignment[4].neighboring_anchor_ids, ("m2n1", "m2n2"))

    def test_repeated_pitch_uses_local_timing_when_supported(self):
        score = [replace(note, midi=69) if i == 4 else note for i, note in enumerate(self.score)]
        take = make_take(score, tempo=1)
        del take.events[3]
        path = align(score, take.events)

        self.assertEqual(path[3].kind, "missing")
        self.assertFalse(path[3].ambiguous)
        self.assertEqual(path[4].observed_index, 3)

    def test_ambiguous_repeated_omission_is_localized_to_measure(self):
        score = [replace(note, midi=69) if i == 4 else note for i, note in enumerate(self.score)]
        take = make_take(score, tempo=1)
        del take.events[3]
        take.events[3] = replace(take.events[3], onset_s=4.5)
        report = analyze_with_evidence(score, take)
        finding, = report.result.findings

        self.assertEqual(finding.kind, "missing")
        self.assertEqual(finding.measure_label, "2")
        self.assertIsNone(finding.score_note_id)
        self.assertTrue(finding.approximate_time)
        self.assertIn("AMBIGUOUS_ALIGNMENT", report.result.warnings)
        self.assertEqual(report.result.assessed_fraction, 1)
        self.assertAlmostEqual(report.result.subscores["coverage"], 100 * 11 / 12)

    def test_dropout_is_not_counted_as_confirmed_omission(self):
        weak = self.clean.events[3]
        self.clean.events[3] = replace(weak, confidence=0.3)
        report = analyze_with_evidence(self.score, self.clean)

        self.assertEqual(report.result.status, "ok")
        self.assertEqual(report.result.findings, [])
        self.assertEqual(report.result.subscores["coverage"], 100)
        self.assertAlmostEqual(report.result.assessed_fraction, 11 / 12)
        self.assertEqual(report.uncertain_score_notes, 1)
        self.assertEqual(report.uncertain_observations, 1)
        self.assertEqual(report.alignment[-1].observed_index, 11)

    def test_reported_dropout_without_an_event_is_unassessed(self):
        missed = self.clean.events.pop(3)
        self.clean.uncertain_regions.append(UncertainRegion(missed.onset_s - 0.1, missed.end_s))
        report = analyze_with_evidence(self.score, self.clean)

        self.assertEqual(report.result.findings, [])
        self.assertAlmostEqual(report.result.assessed_fraction, 11 / 12)
        self.assertEqual(report.uncertain_score_notes, 1)
        self.assertEqual(report.uncertain_observations, 0)

    def test_silent_partial_and_unrelated_takes_withhold_grade(self):
        unrelated = [replace(event, midi_float=event.midi_float + 24) for event in self.clean.events]
        cases = (
            Take("synthetic", warnings=["SILENT"]),
            Take("synthetic", self.clean.events[: len(self.score) // 2]),
            Take("synthetic", unrelated),
            Take("synthetic", [replace(event, confidence=0.3) for event in self.clean.events], ["NOISY"]),
        )
        for take in cases:
            with self.subTest(take=take):
                result = analyze(self.score, take, [("unused", self.clean)])
                self.assertEqual(result.status, "insufficient_evidence")
                self.assertIsNone(result.grade)
                self.assertIn("INSUFFICIENT_EVIDENCE", result.warnings)
                self.assertEqual(result.findings, [])
                self.assertEqual(result.reference_observations, [])

    def test_unlocated_clipping_leaves_rhythm_and_gap_unassessed(self):
        del self.clean.events[3]
        self.clean.warnings.append("CLIPPED")
        result = analyze(self.score, self.clean)

        self.assertEqual(result.status, "ok")
        self.assertIn("CLIPPED", result.warnings)
        self.assertIsNone(result.subscores["rhythm"])
        self.assertEqual(result.findings, [])
        self.assertAlmostEqual(result.assessed_fraction, 11 / 12)

    def test_local_rhythm_interpolates_without_using_test_attack(self):
        score = [ScoreNote(str(i), "1", i, 1, note.midi) for i, note in enumerate(self.score[:7])]
        take = make_take(score, tempo=0.7, lead_in=0.2)
        take.events[3] = replace(take.events[3], onset_s=take.events[3].onset_s + 0.21)
        report = analyze_with_evidence(score, take)

        self.assertAlmostEqual(report.rhythm_residuals["3"], 0.3)
        finding = report.result.findings[0]
        self.assertEqual(finding.kind, "rhythm")
        self.assertEqual(finding.score_note_id, "3")
        self.assertIn("0.30 local beats late", finding.message)

    def test_long_rest_suppresses_timing_and_reweights_pitch(self):
        score = [
            ScoreNote(str(i), str(i + 1), 3.0 * i, 0.5, note.midi)
            for i, note in enumerate(self.score[:5])
        ]
        take = make_take(score, cents=48)
        result = analyze(score, take)

        self.assertAlmostEqual(result.subscores["pitch"], 80)
        self.assertIsNone(result.subscores["rhythm"])
        self.assertAlmostEqual(result.grade, (0.5 * 80 + 0.3 * 100) / 0.8)

    def test_moderate_detuning_remains_recognizable(self):
        result = analyze(self.score, make_take(self.score, cents=55))

        self.assertEqual(result.status, "ok")
        self.assertAlmostEqual(result.subscores["pitch"], 100 * (100 - 55) / (100 - 35))
        self.assertEqual(result.subscores["coverage"], 100)

    def test_phrase_ending_stretch_is_not_reported_as_early_attack(self):
        last = self.clean.events[-1]
        self.clean.events[-1] = replace(last, onset_s=last.onset_s + 1.3, end_s=last.end_s + 1.3)
        report = analyze_with_evidence(self.score, self.clean)

        self.assertEqual(report.result.grade, 100)
        self.assertNotIn(self.score[-2].id, report.rhythm_residuals)
        self.assertEqual(report.result.findings, [])

    def test_reference_uses_common_score_ids_and_never_changes_grade(self):
        take = make_take(self.score, tempo=0.78, lead_in=1.5, cents=15)
        reference = make_take(self.score, tempo=0.65, lead_in=3.0)
        del reference.events[3]
        score_only = analyze(self.score, take)
        compared = analyze(self.score, take, [("clean-ref", reference), ("silent-ref", Take("synthetic"))])
        observation, = compared.reference_observations

        self.assertEqual(score_only.reference_observations, [])
        self.assertEqual(compared.grade, score_only.grade)
        self.assertEqual(observation.reference_id, "clean-ref")
        self.assertEqual(observation.affected_measures, ["1", "2", "3", "4"])
        self.assertIn("onset-to-onset", observation.observation)
        self.assertIn("20% longer", observation.observation)
        self.assertIn("15 cents higher", observation.observation)

    def test_findings_group_adjacent_issues_and_limit_total(self):
        for i, cents in ((0, 0.8), (1, 0.9), (3, 0.7), (5, -0.8), (9, 0.8)):
            event = self.clean.events[i]
            self.clean.events[i] = replace(event, midi_float=event.midi_float + cents)
        result = analyze(self.score, self.clean)

        self.assertEqual(len(result.findings), 3)
        self.assertIn("2 nearby attacks", result.findings[0].message)
