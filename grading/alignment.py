"""Monotonic score-to-take alignment and original observation indices."""

from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Literal, Sequence

if TYPE_CHECKING:
    from contracts import ObservedNote, ScoreNote

_MATCH, _DELETE, _INSERT = 1, 2, 4
_GAP_COST = 100
ANCHOR_CENTS = 65


@dataclass(frozen=True)
class AlignmentStep:
    kind: Literal["match", "missing", "extra"]
    score_index: int | None
    observed_index: int | None
    score_note_id: str | None
    pitch_error_cents: float | None = None
    ambiguous: bool = False
    equivalent_pitch: bool = False
    possible_omissions: tuple[int, ...] = ()
    neighboring_anchor_ids: tuple[str | None, str | None] = (None, None)


def _possible_omissions(
    start: int,
    score_partners: list[set[int | None]],
    event_partners: list[set[int | None]],
) -> tuple[int, ...]:
    related = {start}
    pending = [start]
    while pending:
        index = pending.pop()
        for event in score_partners[index] - {None}:
            for other in event_partners[event] - {None} - related:
                related.add(other)
                pending.append(other)
    return tuple(sorted(index for index in related if None in score_partners[index]))


def _solve(
    score: Sequence[ScoreNote],
    events: Sequence[ObservedNote],
    indices: Sequence[int],
    targets: dict[int, tuple[float, float]],
) -> list[AlignmentStep]:
    """Minimize pitch and gaps first, then local timing among tied paths."""
    rows, columns = len(score), len(indices)
    moves = [bytearray(columns + 1) for _ in range(rows + 1)]
    moves[0][1:] = bytes([_INSERT]) * columns
    previous = [(column * _GAP_COST, 0) for column in range(columns + 1)]
    for row, note in enumerate(score, 1):
        moves[row][0] = _DELETE
        current = [(row * _GAP_COST, 0)]
        target = targets.get(row - 1)
        for column, event_index in enumerate(indices, 1):
            event = events[event_index]
            cents = abs(event.midi_float - note.midi) * 100
            pitch_cost = min(150, max(0, round(cents) - 35))
            timing_cost = 0
            if target is not None:
                target_s, seconds_per_beat = target
                timing_cost = min(2000, round(1000 * abs(event.onset_s - target_s) / seconds_per_beat))
            diagonal = previous[column - 1]
            above = previous[column]
            left = current[column - 1]
            match = (diagonal[0] + pitch_cost, diagonal[1] + timing_cost)
            delete = (above[0] + _GAP_COST, above[1])
            insert = (left[0] + _GAP_COST, left[1])
            best = min(match, delete, insert)
            current.append(best)
            moves[row][column] = (
                (_MATCH if match == best else 0)
                | (_DELETE if delete == best else 0)
                | (_INSERT if insert == best else 0)
            )
        previous = current

    # Explore tied paths to distinguish an arbitrary traceback choice from
    # a score location shared by every optimal path.
    score_partners: list[set[int | None]] = [set() for _ in score]
    event_partners: list[set[int | None]] = [set() for _ in indices]
    pending = [(rows, columns)]
    visited = set()
    while pending:
        row, column = pending.pop()
        if (row, column) in visited:
            continue
        visited.add((row, column))
        choices = moves[row][column]
        if choices & _MATCH:
            score_partners[row - 1].add(column - 1)
            event_partners[column - 1].add(row - 1)
            pending.append((row - 1, column - 1))
        if choices & _DELETE:
            score_partners[row - 1].add(None)
            pending.append((row - 1, column))
        if choices & _INSERT:
            event_partners[column - 1].add(None)
            pending.append((row, column - 1))

    path = []
    row, column = rows, columns
    while row or column:
        choices = moves[row][column]
        if choices & _MATCH:
            row -= 1
            column -= 1
            event_index = indices[column]
            cents = 100 * (events[event_index].midi_float - score[row].midi)
            ambiguous = len(score_partners[row]) > 1 or len(event_partners[column]) > 1
            equivalent_pitch = ambiguous and all(
                partner is not None and score[partner].midi == score[row].midi
                for partner in event_partners[column]
            )
            path.append(AlignmentStep("match", row, event_index, score[row].id, cents, ambiguous, equivalent_pitch))
        elif choices & _DELETE:
            row -= 1
            ambiguous = len(score_partners[row]) > 1
            omissions = _possible_omissions(row, score_partners, event_partners) if ambiguous else ()
            path.append(AlignmentStep(
                "missing", row, None, score[row].id, ambiguous=ambiguous, possible_omissions=omissions,
            ))
        else:
            column -= 1
            path.append(AlignmentStep("extra", None, indices[column], None, ambiguous=len(event_partners[column]) > 1))
    path.reverse()
    return path


def _with_gap_anchors(path: list[AlignmentStep], events: Sequence[ObservedNote]) -> list[AlignmentStep]:
    anchors = [
        index for index, step in enumerate(path)
        if step.kind == "match" and not step.ambiguous and abs(step.pitch_error_cents) <= ANCHOR_CENTS
    ]
    for index, step in enumerate(path):
        if step.kind == "match":
            continue
        position = bisect_left(anchors, index)
        before = path[anchors[position - 1]] if position else None
        after = path[anchors[position]] if position < len(anchors) else None
        neighbors = (before.score_note_id if before else None, after.score_note_id if after else None)
        if step.kind == "extra" and (before or after):
            onset = events[step.observed_index].onset_s
            nearest = min(
                (anchor for anchor in (before, after) if anchor is not None),
                key=lambda anchor: abs(events[anchor.observed_index].onset_s - onset),
            )
            step = replace(step, score_note_id=nearest.score_note_id)
        path[index] = replace(step, neighboring_anchor_ids=neighbors)
    return path


def align(
    score: Sequence[ScoreNote],
    events: Sequence[ObservedNote],
    *,
    observed_indices: Sequence[int] | None = None,
) -> list[AlignmentStep]:
    """Align the selected events, preserving indices into the original take."""
    indices = range(len(events)) if observed_indices is None else observed_indices
    path = _solve(score, events, indices, {})
    if not any(step.ambiguous for step in path):
        return _with_gap_anchors(path, events)

    anchors = [
        (step.score_index, events[step.observed_index].onset_s)
        for step in path
        if step.kind == "match" and not step.ambiguous and abs(step.pitch_error_cents) <= 50
    ]
    anchor_indices = [index for index, _ in anchors]
    targets = {}
    ambiguous_score_indices = {step.score_index for step in path if step.ambiguous}
    for index, note in enumerate(score):
        if index not in ambiguous_score_indices:
            continue
        position = bisect_left(anchor_indices, index)
        if position in (0, len(anchors)):
            continue
        left, left_s = anchors[position - 1]
        right, right_s = anchors[position]
        beats = score[right].onset_qn - score[left].onset_qn
        if 0 < beats <= 6 and right_s > left_s:
            seconds_per_beat = (right_s - left_s) / beats
            targets[index] = (left_s + (note.onset_qn - score[left].onset_qn) * seconds_per_beat, seconds_per_beat)
    if targets:
        path = _solve(score, events, indices, targets)
    return _with_gap_anchors(path, events)
