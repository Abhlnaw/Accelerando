"""Extract monophonic note events on the original WAV playback clock."""

from importlib.metadata import version
from math import gcd
from pathlib import Path

import numpy as np
from scipy import signal
import soundfile as sf

from contracts import InputError, Take

from ._notes import segment_notes
from ._acoustics import describe_notes, reinforce_periodic_frames
from ._tracking import CrepeUnavailable, crepe_frames, pyin_frames


_RATE = 16_000
_FRAMES_PER_SECOND = 100
_HOP = _RATE // _FRAMES_PER_SECOND
_MAX_BYTES = 25 * 1024 * 1024
_MAX_SECONDS = 45
_SILENCE_RMS = 1e-5
_WAV_FORMATS = {"WAV", "WAVEX", "RF64"}
_PCM_BITS = {"PCM_U8": 8, "PCM_S8": 8, "PCM_16": 16, "PCM_24": 24, "PCM_32": 32}


def extract(path: str | Path, *, denoise: bool = True) -> Take:
    """Analyze a solo WAV, leaving its original bytes untouched for playback.

    The optional raw path keeps signal inspection and pitch tracking identical
    while skipping noise attenuation. Invalid inputs raise contracts.InputError.
    """
    samples, sample_rate, subtype = _read_wav(Path(path))
    duration = len(samples) / sample_rate
    pcm_step = 2.0 ** (1 - _PCM_BITS[subtype]) if subtype in _PCM_BITS else 0
    clipping = np.any((samples <= -1) | (samples >= 1 - pcm_step), axis=1)
    warnings = ["CLIPPED"] if clipping.any() else []
    np.clip(samples, -1, 1, out=samples)

    if np.max(_frame_rms(np.max(np.abs(samples), axis=1), sample_rate)) <= _SILENCE_RMS:
        return Take(method="none (silence)", warnings=[*warnings, "SILENT"], duration_s=duration)

    # An out-of-phase stereo recording can cancel when averaged. In that case,
    # use the loudest recorded channel and keep its original clock.
    mono = np.mean(samples, axis=1)
    channel_rms = np.sqrt(np.mean(np.square(samples, dtype=np.float64), axis=0))
    loudest = int(np.argmax(channel_rms))
    if np.sqrt(np.mean(np.square(mono, dtype=np.float64))) < channel_rms[loudest] * 0.25:
        mono = samples[:, loudest]

    if sample_rate != _RATE:
        divisor = gcd(sample_rate, _RATE)
        mono = signal.resample_poly(mono, _RATE // divisor, sample_rate // divisor)

    # Remove DC and subsonic handling noise before estimating room level.
    if denoise:
        mono = signal.sosfilt(signal.butter(2, 22, "highpass", fs=_RATE, output="sos"),
                              mono).astype(np.float32)
    energy = _frame_rms(mono, _RATE)
    noise_rms = _noise_floor(energy)
    analysis = _attenuate_noise(mono, energy, noise_rms) if denoise and noise_rms else mono
    audibility = max(_SILENCE_RMS, noise_rms * 1.65)

    try:
        frequency, confidence = crepe_frames(analysis, _RATE, _HOP)
        confidence = reinforce_periodic_frames(analysis, _RATE, _HOP, frequency, confidence,
                                               energy >= audibility)
        method = f"CREPE tiny (torchcrepe {version('torchcrepe')})"
    except CrepeUnavailable:
        frequency, confidence = pyin_frames(analysis, _RATE, _HOP)
        method = f"pYIN (librosa {version('librosa')})"
        warnings.append("CREPE_UNAVAILABLE")

    clip_rms = _frame_rms(clipping, sample_rate) if clipping.any() else None
    events, uncertain = segment_notes(
        frequency, confidence, energy, clip_rms,
        audibility=audibility,
        hop_s=_HOP / _RATE, duration=duration,
    )
    if not events or any(region.reason == "LOW_CONFIDENCE" for region in uncertain):
        warnings.append("LOW_SIGNAL")
    return Take(method, events, warnings, duration, uncertain, describe_notes(mono, _RATE, events))


def _read_wav(path: Path) -> tuple[np.ndarray, int, str]:
    try:
        if path.stat().st_size > _MAX_BYTES:
            raise InputError("Choose a WAV file no larger than 25 MB.")
        with sf.SoundFile(path) as recording:
            subtype = recording.subtype
            if recording.format not in _WAV_FORMATS or subtype not in {*_PCM_BITS, "FLOAT", "DOUBLE"}:
                raise InputError("Choose an uncompressed PCM or floating-point WAV file.")
            if not recording.frames:
                raise InputError("This WAV contains no readable audio frames. Record a new take.")
            if not 8_000 <= recording.samplerate <= 192_000:
                raise InputError("Export the WAV at a sample rate between 8 and 192 kHz.")
            if recording.frames > recording.samplerate * _MAX_SECONDS:
                raise InputError("Choose a WAV recording that is 45 seconds or shorter.")
            samples = recording.read(dtype="float32", always_2d=True)
            sample_rate = recording.samplerate
            if len(samples) != recording.frames:
                raise InputError("This WAV is incomplete. Export the recording again as PCM WAV.")
    except (OSError, sf.SoundFileError) as exc:
        raise InputError("Could not read this WAV. Export the recording again as PCM WAV.") from exc

    if not np.isfinite(samples).all():
        raise InputError("This WAV contains invalid samples. Export it again as PCM WAV.")
    return samples, sample_rate, subtype


def _frame_rms(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    """20 ms RMS on a 10 ms grid, with each frame centered on its timestamp."""
    frames = len(samples) * _FRAMES_PER_SECOND // sample_rate + 1
    centers = np.round(np.arange(frames) * sample_rate / _FRAMES_PER_SECOND)
    centers = centers.astype(int)
    half_window = round(sample_rate / _FRAMES_PER_SECOND)
    starts = np.maximum(centers - half_window, 0)
    stops = np.minimum(centers + half_window, len(samples))
    power = np.concatenate(([0.0], np.cumsum(np.square(samples, dtype=np.float64))))
    return np.sqrt(np.maximum(0, power[stops] - power[starts]) / (stops - starts))


def _noise_floor(energy: np.ndarray) -> float:
    low, high = np.percentile(energy, [20, 90])
    quiet = energy <= low * 1.6
    if low > _SILENCE_RMS and high >= 4 * low and np.count_nonzero(quiet) >= 8:
        return float(np.median(energy[quiet]))
    return 0.0


def _attenuate_noise(samples: np.ndarray, energy: np.ndarray, noise_rms: float) -> np.ndarray:
    # Estimate the background spectrum from low-energy windows, with at least
    # six examples. A half-amplitude gain floor protects soft harmonics/tails.
    if len(samples) < 512:
        return samples
    _, _, spectrum = signal.stft(samples, fs=_RATE, nperseg=512, noverlap=352)
    frame_count = min(spectrum.shape[1], len(energy))
    quiet = np.flatnonzero(energy[:frame_count] < noise_rms * 1.5)
    quiet = quiet[(quiet > 1) & (quiet < frame_count - 2)]
    if len(quiet) < 6:
        return samples
    power = np.abs(spectrum) ** 2
    background = np.median(power[:, quiet], axis=1, keepdims=True)
    gain = np.maximum(0.5, 1 - background / np.maximum(power, 1e-20))
    _, cleaned = signal.istft(spectrum * gain, fs=_RATE, nperseg=512, noverlap=352)
    return cleaned[:len(samples)].astype(np.float32, copy=False)
