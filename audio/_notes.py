"""Convert pitch, confidence and envelope frames to replayable note events."""

import numpy as np
from scipy.signal import find_peaks

from contracts import ObservedNote, UncertainRegion


_MIN_CONFIDENCE = 0.55
_MIN_NOTE_FRAMES = 7
_PITCH_CHANGE = 0.75
_CHANGE_FRAMES = 8


def segment_notes(frequency, confidence, energy, clipping, *, audibility, hop_s, duration):
    frame_count = min(len(frequency), len(confidence), len(energy))
    frequency = frequency[:frame_count]
    confidence = np.clip(np.nan_to_num(confidence[:frame_count], nan=0), 0, 1)
    energy = energy[:frame_count]
    valid = np.isfinite(frequency) & (frequency > 0)
    pitch = np.full(frame_count, np.nan)
    pitch[valid] = 69 + 12 * np.log2(frequency[valid] / 440)
    audible = energy >= audibility
    voiced = valid & audible & (confidence >= _MIN_CONFIDENCE)
    clipped = np.zeros(frame_count, dtype=bool)
    if clipping is not None:
        count = min(frame_count, len(clipping))
        clipped[:count] = clipping[:count] >= 0.25

    # Bridge tracker dropouts only when the raw envelope shows continuing sound
    # and the pitch on either side agrees. A real dip can mark a repeated note.
    continuous = voiced.copy()
    for start, stop in _runs(~voiced):
        if (start > 0 and stop < frame_count and stop - start <= 2
                and np.all(energy[start:stop] >= max(audibility, 0.5 * min(energy[start - 1], energy[stop])))
                and abs(pitch[stop] - pitch[start - 1]) < _PITCH_CHANGE):
            continuous[start:stop] = True

    notes = []
    covered = np.zeros(frame_count, dtype=bool)
    for start, stop in _runs(continuous):
        attacks = _attacks(energy[start:stop], audibility) + start
        boundaries = _boundaries(pitch, voiced, start, stop, attacks)
        for first, last in zip(boundaries, boundaries[1:]):
            if last - first < _MIN_NOTE_FRAMES:
                continue
            body = slice(first + 2, last - 2)
            reliable_body = voiced[body] & ~clipped[body]
            if np.count_nonzero(reliable_body) < max(2, (last - first - 4) / 2):
                continue
            body_pitch = pitch[body][reliable_body]
            median = np.median(body_pitch)
            stable = abs(body_pitch - median) <= 0.6
            if np.mean(stable) < 0.6:
                continue
            onset = _onset_frame(first, energy, audible) if first == start else first
            if notes:
                onset = max(onset, round(notes[-1].end_s / hop_s))
            end = min(last * hop_s, duration)
            if onset * hop_s >= end:
                continue
            evidence = np.median(confidence[body][reliable_body][stable])
            supporting_fraction = np.mean(voiced[first:last] & ~clipped[first:last])
            notes.append(ObservedNote(
                float(onset * hop_s), float(end), float(np.median(body_pitch[stable])),
                float(evidence * supporting_fraction),
            ))
            covered[onset:last] = True

    uncertain = _regions(audible & ~covered & ~clipped, 7, "LOW_CONFIDENCE", hop_s, duration)
    uncertain.extend(_regions(clipped, 3, "CLIPPED", hop_s, duration))
    return notes, sorted(uncertain, key=lambda region: region.onset_s)


def _runs(mask):
    changes = np.flatnonzero(np.diff(mask, prepend=False, append=False))
    return zip(changes[::2], changes[1::2])


def _attacks(energy, audibility):
    # Rearticulation has a pronounced trough followed by a quick recovery. A
    # broad decay or mild amplitude modulation alone should not split a note.
    level = 20 * np.log10(np.maximum(energy, audibility))
    troughs, _ = find_peaks(-level, prominence=8, distance=_MIN_NOTE_FRAMES, wlen=21)
    return np.asarray([
        trough for trough in troughs
        if np.max(level[trough + 1:trough + 7]) - level[trough] >= 8
    ], dtype=int)


def _boundaries(pitch, voiced, start, stop, attacks):
    boundaries = [start]
    attack_set = set(attacks)
    i = start + _MIN_NOTE_FRAMES
    while i <= stop - _MIN_NOTE_FRAMES:
        if i in attack_set or _pitch_changed(pitch, voiced, boundaries[-1], i):
            boundaries.append(i)
            i += _MIN_NOTE_FRAMES
        else:
            i += 1
    return [*boundaries, stop]


def _pitch_changed(pitch, voiced, start, frame):
    past = slice(max(start, frame - 10), frame)
    future = slice(frame, frame + _CHANGE_FRAMES)
    if frame + _CHANGE_FRAMES > len(pitch) or not np.all(voiced[future]):
        return False
    if np.count_nonzero(voiced[past]) < 4:
        return False
    recent = pitch[past][voiced[past]]
    upcoming = pitch[future]
    difference = upcoming - np.median(recent)
    large_change = np.all(difference >= _PITCH_CHANGE) or np.all(difference <= -_PITCH_CHANGE)
    if large_change and np.ptp(upcoming) <= 0.5:
        return True
    # Sung and bowed transitions often slide into the next note. Allow the
    # first two frames to settle when the remaining body forms a distinct pitch.
    body = upcoming[2:]
    center = np.median(body)
    return bool(abs(center - np.median(recent)) >= 1.25
                and np.max(np.abs(body - center)) <= .45
                and abs(upcoming[0] - center) < abs(upcoming[0] - np.median(recent)))


def _onset_frame(first, energy, audible):
    # A tracker needs several cycles to become confident. Recover a nearby
    # attack from the raw envelope without moving an event into earlier noise.
    threshold = 0.12 * np.max(energy[first:first + 5])
    onset = first
    while onset > max(0, first - 4) and audible[onset - 1] and energy[onset - 1] >= threshold:
        onset -= 1
    return onset


def _regions(mask, min_frames, reason, hop_s, duration):
    return [
        UncertainRegion(float(start * hop_s), float(min(stop * hop_s, duration)), reason)
        for start, stop in _runs(mask)
        if stop - start >= min_frames and start * hop_s < duration
    ]
