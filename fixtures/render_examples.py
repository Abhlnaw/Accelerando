"""Rebuild the deterministic, synthetic WAVs from the hand-checked note list."""

import json
import math
import sys
import wave
from array import array
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 16_000
LEAD_IN_S = 0.25
TAIL_S = 0.25


def render(
    path: Path,
    rows: list,
    beat_lengths: list[float],
    *,
    brightness: float = 0.19,
    substitution: tuple[str, int] | None = None,
) -> None:
    beats = [LEAD_IN_S]
    for length in beat_lengths:
        beats.append(beats[-1] + length)

    def sample_at(beat: float) -> int:
        whole = int(beat)
        fractional = beat - whole
        seconds = beats[whole]
        if fractional:
            seconds += fractional * beat_lengths[whole]
        return round(seconds * SAMPLE_RATE)

    samples = array("h", [0]) * round((beats[-1] + TAIL_S) * SAMPLE_RATE)
    for note_id, _, onset, duration, midi in rows:
        if substitution and note_id == substitution[0]:
            midi = substitution[1]
        start = sample_at(onset)
        # Leave a short articulation gap even between two attacks on the same pitch.
        end = sample_at(onset + duration) - round(0.045 * SAMPLE_RATE)
        angular_frequency = math.tau * 440 * 2 ** ((midi - 69) / 12) / SAMPLE_RATE
        for i in range(end - start):
            phase = angular_frequency * i
            envelope = min(1.0, i / 400, (end - start - 1 - i) / 720)
            tone = math.sin(phase) + brightness * math.sin(2 * phase) + 0.08 * math.sin(3 * phase)
            samples[start + i] = round(14_000 * envelope * tone)
    if sys.byteorder != "little":
        samples.byteswap()
    with wave.open(str(path), "wb") as wav:
        wav.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
        wav.writeframes(samples.tobytes())


def main() -> None:
    expected = json.loads((ROOT / "tests/data/expected_scores.json").read_text(encoding="utf-8"))
    piece_a = ROOT / "fixtures/piece_a"
    steady = [60 / 72] * 16
    render(piece_a / "clean.wav", expected["piece_a"], steady)
    render(piece_a / "reference.wav", expected["piece_a"], [60 / 76] * 16, brightness=0.27)
    slowdown = [0.92] * 12 + [0.96, 1.04, 1.14, 1.27]
    render(piece_a / "rubato.wav", expected["piece_a"], slowdown)
    variation = expected["variation"]
    render(
        piece_a / "variation.wav",
        expected["piece_a"],
        steady,
        substitution=(variation["note_id"], variation["midi"]),
    )
    render(ROOT / "fixtures/piece_b/clean.wav", expected["piece_b"], [60 / 48] * 9)


if __name__ == "__main__":
    main()
