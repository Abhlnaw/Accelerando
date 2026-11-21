"""Shared contracts. Beats, sounding MIDI pitches and original-file seconds differ.

Optional evidence fields are frozen here before domain owners integrate. Confidence
is tracker evidence, never a musical grade. No UI or model dependencies belong here.
"""
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class ScoreNote:
    id: str
    measure_label: str
    onset_qn: float
    duration_qn: float
    midi: int


@dataclass
class ObservedNote:
    onset_s: float
    end_s: float
    midi_float: float
    confidence: float


@dataclass
class UncertainRegion:
    onset_s: float
    end_s: float
    reason: str = "LOW_CONFIDENCE"


@dataclass
class Take:
    method: str
    events: list[ObservedNote] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    duration_s: float | None = None
    uncertain_regions: list[UncertainRegion] = field(default_factory=list)


@dataclass
class Finding:
    kind: Literal["pitch", "rhythm", "missing", "extra"]
    score_note_id: str | None
    measure_label: str
    playback_s: float | None
    approximate_time: bool
    message: str


@dataclass
class ReferenceObservation:
    reference_id: str
    affected_measures: list[str]
    observation: str


@dataclass
class Result:
    status: Literal["ok", "insufficient_evidence"]
    grade: float | None
    subscores: dict[str, float | None] = field(
        default_factory=lambda: dict(pitch=None, coverage=None, rhythm=None))
    warnings: list[str] = field(default_factory=list)
    reference_observations: list[ReferenceObservation] = field(default_factory=list)
    findings: list[Finding] = field(default_factory=list)
    # Fraction of expected score notes evaluable with reliable evidence, 0..1.
    # The grader supplies this; the app must not infer it from event counts.
    assessed_fraction: float | None = None


class InputError(ValueError):
    """Invalid or unsupported musician input; display the corrective message."""
