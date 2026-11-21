"""Grade recognizable solo takes against written notes and local beat anchors."""

from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from statistics import mean, median
from typing import TYPE_CHECKING, Literal, Sequence

from contracts import Finding, ReferenceObservation, Result

from .alignment import ANCHOR_CENTS, AlignmentStep, align

if TYPE_CHECKING:
    from contracts import ObservedNote, ScoreNote, Take

_MIN_CONFIDENCE = 0.65
_MIN_ASSESSED_FRACTION = 0.75
_LIMITED_AUDIO = {"CLIPPED", "LOW_SIGNAL", "NOISY"}
_NOTE_NAMES = ("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")


@dataclass(frozen=True)
class GradingAnalysis:
    result: Result
    alignment: list[AlignmentStep]
    uncertain_score_notes: int
    uncertain_observations: int
    rhythm_residuals: dict[str, float]


@dataclass(frozen=True)
class _Evidence:
    path: list[AlignmentStep]
    matches: dict[int, ObservedNote]
    anchors: dict[int, ObservedNote]
    uncertain_regions: list[tuple[float, float]]
    unlocated_quality_warning: bool
    uncertain_observations: int


@dataclass(frozen=True)
class _Window:
    left_index: int
    right_index: int
    left_s: float
    right_s: float
    expected_s: float
    seconds_per_beat: float


@dataclass(frozen=True)
class _Issue:
    finding: Finding
    score_index: int
    priority: float
    direction: int = 0


def _assess_take(score: Sequence[ScoreNote], take: Take) -> _Evidence:
    reported_regions = [(region.onset_s, region.end_s) for region in take.uncertain_regions]
    regions = reported_regions.copy()
    has_quality_warning = bool(_LIMITED_AUDIO.intersection(take.warnings))
    unlocated_warning = has_quality_warning and not regions
    threshold = 0.80 if unlocated_warning else _MIN_CONFIDENCE
    usable = []
    for index, event in enumerate(take.events):
        if event.confidence < threshold or any(start <= event.onset_s < end for start, end in reported_regions):
            regions.append((event.onset_s, event.end_s))
        else:
            usable.append(index)

    # An event may overlap a nearby low-confidence one. Keep a reliable
    # event at the same position if the extractor supplied distinct events.
    path = align(score, take.events, observed_indices=usable)
    matches = {
        step.score_index: take.events[step.observed_index]
        for step in path
        if step.kind == "match" and not step.ambiguous
    }
    anchors = {
        index: event
        for index, event in matches.items()
        if abs(event.midi_float - score[index].midi) * 100 <= ANCHOR_CENTS
    }
    uncertain_observations = len(take.events) - len(usable)
    uncertain_observations += sum(
        step.ambiguous and not step.equivalent_pitch and step.observed_index is not None for step in path
    )
    return _Evidence(path, matches, anchors, regions, unlocated_warning, uncertain_observations)


def _local_window(
    score: Sequence[ScoreNote],
    anchors: dict[int, ObservedNote],
    anchor_indices: list[int],
    index: int,
) -> _Window | None:
    position = bisect_left(anchor_indices, index)
    right_position = position + (index in anchors)
    if position == 0 or right_position == len(anchor_indices):
        return None
    left_index, right_index = anchor_indices[position - 1], anchor_indices[right_position]
    left, right = score[left_index], score[right_index]
    beat_span = right.onset_qn - left.onset_qn
    if not 0 < beat_span <= 6 or not left.onset_qn < score[index].onset_qn < right.onset_qn:
        return None
    if any(
        score[i + 1].onset_qn - (score[i].onset_qn + score[i].duration_qn) >= 1.5
        for i in range(left_index, right_index)
    ):
        return None
    left_s, right_s = anchors[left_index].onset_s, anchors[right_index].onset_s
    if right_s <= left_s:
        return None
    seconds_per_beat = (right_s - left_s) / beat_span
    expected = left_s + (score[index].onset_qn - left.onset_qn) * seconds_per_beat
    return _Window(left_index, right_index, left_s, right_s, expected, seconds_per_beat)


def _overlaps(regions: Sequence[tuple[float, float]], start: float, end: float) -> bool:
    return any(region_start < end and region_end > start for region_start, region_end in regions)


def _credit(error: float, full: float, zero: float) -> float:
    return max(0.0, min(100.0, 100 * (zero - abs(error)) / (zero - full)))


def _pitch_name(midi: int) -> str:
    return f"{_NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _finding(
    kind: Literal["pitch", "rhythm", "missing", "extra"],
    note: ScoreNote,
    playback_s: float,
    message: str,
    *,
    approximate: bool = False,
    measure_only: bool = False,
) -> Finding:
    return Finding(
        kind=kind,
        score_note_id=None if measure_only else note.id,
        measure_label=note.measure_label,
        playback_s=playback_s,
        approximate_time=approximate,
        message=message,
    )


def _pitch_issue(index: int, note: ScoreNote, event: ObservedNote, cents: float) -> _Issue:
    direction = "sharp" if cents > 0 else "flat"
    target = _pitch_name(note.midi)
    message = (
        f"You played about {round(abs(cents))} cents {direction} of {target}. "
        f"Replay the entrance, then tune to {target} and try it again."
    )
    priority = event.confidence * (1 - _credit(cents, 35, 100) / 100)
    return _Issue(_finding("pitch", note, event.onset_s, message), index, priority, 1 if cents > 0 else -1)


def _rhythm_issue(index: int, note: ScoreNote, event: ObservedNote, residual: float) -> _Issue:
    direction = "late" if residual > 0 else "early"
    message = (
        f"This attack came {abs(residual):.2f} local beats {direction}. "
        "Tap the surrounding beats, then replay and practice the entrance."
    )
    priority = 0.65 * event.confidence * (1 - _credit(residual, 0.15, 0.5) / 100)
    return _Issue(_finding("rhythm", note, event.onset_s, message), index, priority, 1 if residual > 0 else -1)


def _missing_issue(
    index: int, note: ScoreNote, evidence: _Evidence, window: _Window, *, measure_only: bool
) -> _Issue:
    anchor_index = min(
        (window.left_index, window.right_index),
        key=lambda i: abs(evidence.anchors[i].onset_s - window.expected_s),
    )
    anchor = evidence.anchors[anchor_index]
    target = _pitch_name(note.midi)
    if measure_only:
        message = (
            f"A written {target} attack appears to be missing in this measure. "
            f"Replay the passage, then practice articulating each {target}."
        )
    else:
        message = (
            f"The written {target} attack appears to be missing. "
            f"Replay from the neighboring attack, then practice playing through {target}."
        )
    confidence = min(evidence.anchors[window.left_index].confidence, evidence.anchors[window.right_index].confidence)
    finding = _finding("missing", note, anchor.onset_s, message, approximate=True, measure_only=measure_only)
    return _Issue(finding, index, 0.9 * confidence)


def _extra_issue(index: int, note: ScoreNote, event: ObservedNote) -> _Issue:
    message = (
        "An extra attack was detected near this written note. "
        "Replay the passage and practice playing only the written attacks."
    )
    return _Issue(_finding("extra", note, event.onset_s, message), index, 0.8 * event.confidence)


def _rank(issues: list[_Issue], score: Sequence[ScoreNote]) -> list[Finding]:
    groups: list[list[_Issue]] = []
    for kind in ("pitch", "missing", "extra", "rhythm"):
        group: list[_Issue] = []
        for issue in sorted((item for item in issues if item.finding.kind == kind), key=lambda item: item.score_index):
            previous = group[-1] if group else None
            if previous is not None and (
                issue.score_index > previous.score_index + 1
                or issue.direction != previous.direction
                or issue.finding.measure_label != previous.finding.measure_label
            ):
                groups.append(group)
                group = []
            group.append(issue)
        if group:
            groups.append(group)

    def priority(group: list[_Issue]) -> float:
        return max(item.priority for item in group)

    findings = []
    for group in sorted(groups, key=priority, reverse=True)[:3]:
        strongest = max(group, key=lambda item: item.priority)
        finding = strongest.finding
        if len(group) > 1:
            message = f"{len(group)} nearby attacks showed a similar issue. {finding.message}"
            finding = _finding(
                finding.kind, score[strongest.score_index], finding.playback_s, message,
                approximate=finding.approximate_time,
                measure_only=finding.score_note_id is None,
            )
        findings.append(finding)
    return findings


def _is_recognizable(score: Sequence[ScoreNote], evidence: _Evidence) -> bool:
    reliable_count = len(evidence.anchors)
    return bool(score) and reliable_count >= min(4, len(score)) and reliable_count * 2 >= len(score)


def _compare_references(
    score: Sequence[ScoreNote],
    evidence: _Evidence,
    references: Sequence[tuple[str, Take]],
) -> list[ReferenceObservation]:
    observations = []
    for reference_id, take in references:
        if "SILENT" in take.warnings or not take.events:
            continue
        reference = _assess_take(score, take)
        if not _is_recognizable(score, reference):
            continue
        common = sorted(evidence.anchors.keys() & reference.anchors.keys())
        if len(common) < 2:
            continue
        first, last = common[0], common[-1]
        user_span = evidence.anchors[last].onset_s - evidence.anchors[first].onset_s
        reference_span = reference.anchors[last].onset_s - reference.anchors[first].onset_s
        if min(user_span, reference_span) <= 0:
            continue
        delta = round(100 * (user_span / reference_span - 1))
        length = f"{abs(delta)}% {'longer' if delta > 0 else 'shorter'}" if delta else "about the same length"
        message = (
            f"Your onset-to-onset span was {user_span:.2f} s. "
            f"The reference span was {reference_span:.2f} s. Yours was {length}."
        )
        if len(common) >= 3:
            cents = round(100 * median(
                evidence.anchors[index].midi_float - reference.anchors[index].midi_float for index in common
            ))
            pitch = f"{abs(cents)} cents {'higher' if cents > 0 else 'lower'}" if cents else "within 1 cent"
            message += f" Across {len(common)} shared notes, your median pitch was {pitch}."
        labels = list(dict.fromkeys(note.measure_label for note in score[first:last + 1]))
        observations.append(ReferenceObservation(reference_id=reference_id, affected_measures=labels, observation=message))
    return observations


def analyze_with_evidence(
    score: Sequence[ScoreNote], take: Take, references: Sequence[tuple[str, Take]] = ()
) -> GradingAnalysis:
    """Return the shared result plus the evidence used to make the assessment."""
    warnings = list(dict.fromkeys(take.warnings))
    empty_subscores = {"pitch": None, "coverage": None, "rhythm": None}
    if "SILENT" in warnings or not score:
        warnings.append("INSUFFICIENT_EVIDENCE")
        return GradingAnalysis(
            result=Result(
                status="insufficient_evidence", grade=None,
                warnings=list(dict.fromkeys(warnings)), assessed_fraction=0.0,
            ),
            alignment=[],
            uncertain_score_notes=len(score),
            uncertain_observations=len(take.events),
            rhythm_residuals={},
        )

    evidence = _assess_take(score, take)
    anchors = list(evidence.anchors)
    score_indices = {note.id: i for i, note in enumerate(score)}
    issues = []
    missing_count = 0
    extra_count = 0
    residuals = {}
    gaps = {step.score_index for step in evidence.path if step.kind == "missing"}
    extra_times = [take.events[step.observed_index].onset_s for step in evidence.path if step.kind == "extra"]
    for step in evidence.path:
        if step.ambiguous and step.kind != "missing":
            continue
        index = step.score_index
        if step.kind == "extra":
            event = take.events[step.observed_index]
            if step.score_note_id is None or _overlaps(evidence.uncertain_regions, event.onset_s, event.end_s):
                continue
            nearest = score_indices[step.score_note_id]
            extra_count += 1
            issues.append(_extra_issue(nearest, score[nearest], event))
            continue

        note = score[index]
        window = _local_window(score, evidence.anchors, anchors, index)
        if step.kind == "missing":
            if window is None or evidence.unlocated_quality_warning:
                continue
            candidates = step.possible_omissions or (index,)
            candidate_windows = [_local_window(score, evidence.anchors, anchors, i) for i in candidates]
            if any(score[i].measure_label != note.measure_label or score[i].midi != note.midi for i in candidates):
                continue
            if any(
                candidate is None or _overlaps(
                    evidence.uncertain_regions,
                    candidate.expected_s - 0.25 * candidate.seconds_per_beat,
                    candidate.expected_s + 0.25 * candidate.seconds_per_beat,
                )
                for candidate in candidate_windows
            ):
                continue
            missing_count += 1
            issues.append(_missing_issue(index, note, evidence, window, measure_only=step.ambiguous))
            continue

        event = evidence.matches[index]
        if _credit(step.pitch_error_cents, 35, 100) < 100 - 1e-9:
            issues.append(_pitch_issue(index, note, event, step.pitch_error_cents))
        if (
            window is None or evidence.unlocated_quality_warning
            or any(i in gaps for i in range(window.left_index + 1, window.right_index))
            or any(window.left_s < time < window.right_s for time in extra_times)
            or _overlaps(evidence.uncertain_regions, window.left_s, window.right_s)
        ):
            continue
        phrase_end = window.right_index == len(score) - 1 or (
            score[window.right_index + 1].onset_qn
            - (score[window.right_index].onset_qn + score[window.right_index].duration_qn) >= 1.5
        )
        if phrase_end:
            left_rate = (event.onset_s - window.left_s) / (note.onset_qn - score[window.left_index].onset_qn)
            right_rate = (window.right_s - event.onset_s) / (score[window.right_index].onset_qn - note.onset_qn)
            if 0 < left_rate and right_rate >= 1.5 * left_rate:
                continue
        residual = (event.onset_s - window.expected_s) / window.seconds_per_beat
        residuals[note.id] = residual
        if _credit(residual, 0.15, 0.5) < 100 - 1e-9:
            issues.append(_rhythm_issue(index, note, event, residual))

    pitch_errors = [
        step.pitch_error_cents for step in evidence.path
        if step.kind == "match" and (not step.ambiguous or step.equivalent_pitch)
    ]
    matched = len(pitch_errors)
    assessed = matched + missing_count
    uncertain_score_notes = len(score) - assessed
    assessed_fraction = assessed / len(score)
    unassessed_extras = len(extra_times) - extra_count - sum(
        step.kind == "extra" and step.ambiguous for step in evidence.path
    )
    uncertain_observations = evidence.uncertain_observations + unassessed_extras
    if uncertain_score_notes or uncertain_observations:
        warnings.append("UNCERTAIN_AUDIO_OR_ALIGNMENT")
    if any(step.ambiguous for step in evidence.path):
        warnings.append("AMBIGUOUS_ALIGNMENT")

    # Withhold a grade on a clean fragment if too much of the excerpt was unassessed.
    if not _is_recognizable(score, evidence) or assessed_fraction < _MIN_ASSESSED_FRACTION:
        warnings.append("INSUFFICIENT_EVIDENCE")
        result = Result(
            status="insufficient_evidence", grade=None, subscores=empty_subscores,
            warnings=list(dict.fromkeys(warnings)), assessed_fraction=assessed_fraction,
        )
    else:
        subscores = {
            "pitch": mean(_credit(cents, 35, 100) for cents in pitch_errors),
            "coverage": 100 * matched / (assessed + extra_count),
            "rhythm": mean(_credit(residual, 0.15, 0.5) for residual in residuals.values()) if residuals else None,
        }
        weights = {"pitch": 0.5, "coverage": 0.3, "rhythm": 0.2}
        available = [(score_value, weights[name]) for name, score_value in subscores.items() if score_value is not None]
        grade = sum(value * weight for value, weight in available) / sum(weight for _, weight in available)
        result = Result(
            status="ok", grade=grade, subscores=subscores, warnings=list(dict.fromkeys(warnings)),
            reference_observations=_compare_references(score, evidence, references),
            findings=_rank(issues, score), assessed_fraction=assessed_fraction,
        )
    return GradingAnalysis(result, evidence.path, uncertain_score_notes, uncertain_observations, residuals)


def analyze(
    score: Sequence[ScoreNote], take: Take, references: Sequence[tuple[str, Take]] = ()
) -> Result:
    """Return the shared app result for one take and optional references."""
    return analyze_with_evidence(score, take, references).result
