"""Score-independent measurements on the recording's original timeline."""

import numpy as np


def reinforce_periodic_frames(samples, rate, hop, frequency, confidence, audible):
    """Confirm borderline CREPE frames using the waveform at its proposed period."""
    evidence = confidence.copy()
    for i in np.flatnonzero((confidence >= .30) & (confidence < .70) & np.isfinite(frequency)):
        if i >= len(audible) or not audible[i] or frequency[i] <= 0:
            continue
        period = round(rate / frequency[i])
        frame = samples[max(0, i * hop - 512):i * hop + 512]
        if period < 2 or len(frame) < 3 * period:
            continue
        frame = frame - frame.mean()
        def similarity(lag):
            a, b = frame[:-lag], frame[lag:]
            return np.dot(a, b) / max(1e-15, np.linalg.norm(a) * np.linalg.norm(b))

        agreement = similarity(period)
        # A shorter repeating cycle makes a subharmonic interpretation ambiguous.
        if agreement >= .88 and similarity(max(1, round(period / 2))) < agreement - .08:
            evidence[i] = max(evidence[i], .70)
    return evidence


def describe_notes(samples, rate, notes):
    """Measure level, spectral centre and attack-to-tail level on observed events."""
    measurements = []
    for note in notes:
        start, end = round(note.onset_s * rate), round(note.end_s * rate)
        audio = samples[start:end]
        if len(audio) < 4:
            continue
        def level(x):
            return 10 * np.log10(max(1e-12, np.mean(np.square(x, dtype=np.float64))))

        # Sample across the note so an initial pick transient cannot dominate.
        size = min(len(audio), 1024)
        starts = np.linspace(0, len(audio) - size, 5, dtype=int)
        frames = np.stack([audio[i:i + size] for i in starts])
        magnitude = np.abs(np.fft.rfft(frames * np.hanning(size)))
        frequencies = np.fft.rfftfreq(size, 1 / rate)
        centroids = magnitude @ frequencies / np.maximum(magnitude.sum(axis=1), 1e-12)
        quarter = len(audio) // 4
        measurements.append(dict(onset_s=note.onset_s,
                                 rms_dbfs=round(float(level(audio)), 2),
                                 spectral_centroid_hz=round(float(np.median(centroids)), 1),
                                 tail_minus_attack_db=round(float(level(audio[-quarter:]) -
                                                                  level(audio[:quarter])), 2)))
    return measurements
