from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from audio import extract
from audio._tracking import CrepeUnavailable
from contracts import InputError


def _write_wav(tmp_path, name, samples, rate=22_050, subtype="PCM_16"):
    path = tmp_path / name
    sf.write(path, samples, rate, subtype=subtype)
    return path


def _tone(frequency, duration, rate=22_050, amplitude=0.3):
    time = np.arange(round(duration * rate)) / rate
    envelope = np.minimum(1, np.minimum(time, duration - time) / 0.01)
    return amplitude * envelope * np.sin(2 * np.pi * frequency * time)


def test_crepe_extracts_recorded_flute_scale():
    recording = Path(__file__).with_name("data") / "recorded_flute_scale.wav"
    take = extract(recording)

    assert take.method.startswith("CREPE tiny")
    assert [event.midi_float for event in take.events] == pytest.approx([59, 60, 61, 62], abs=0.25)
    # The reference crossings use a fixed -48 dB threshold. CREPE and the
    # lower adaptive envelope gate can locate earlier breath attacks.
    assert [event.onset_s for event in take.events] == pytest.approx([0.43, 2.89, 5.52, 8.27], abs=0.13)
    assert all(event.confidence >= 0.65 for event in take.events)


def test_crepe_preserves_clock_repeated_attacks_and_pitches_with_mild_noise(tmp_path):
    rate = 22_050
    repeated = _tone(440, 1.2, rate)
    time = np.arange(len(repeated)) / rate
    repeated *= 1 - 0.90 * np.exp(-0.5 * ((time - 0.6) / 0.018) ** 2)
    samples = np.concatenate((np.zeros(rate), repeated, np.zeros(rate // 10),
                              _tone(493.883, 0.6), np.zeros(rate // 4)))
    clean_path = _write_wav(tmp_path, "clean.wav", samples)
    clean_bytes = clean_path.read_bytes()
    clean = extract(clean_path)
    noisy_path = _write_wav(tmp_path, "noisy.wav", samples + np.random.default_rng(8).normal(0, 0.008, len(samples)))
    noisy = extract(noisy_path)
    raw = extract(noisy_path, denoise=False)

    assert clean_path.read_bytes() == clean_bytes
    for take in (clean, noisy, raw):
        assert take.method.startswith("CREPE tiny")
        assert take.duration_s == pytest.approx(len(samples) / rate)
        assert [event.onset_s for event in take.events] == pytest.approx([1, 1.6, 2.3], abs=0.05)
        assert [event.midi_float for event in take.events] == pytest.approx([69, 69, 71], abs=0.25)
        assert all(0.55 <= event.confidence <= 1 for event in take.events)


def test_crepe_keeps_quiet_vibrato_and_decay_in_one_note(tmp_path):
    rate = 16_000
    time = np.arange(rate) / rate
    frequency = 440 * 2 ** (0.52 * np.sin(2 * np.pi * 5 * time) / 12)
    note = 0.025 * (1 - 0.9 * time) * np.sin(2 * np.pi * np.cumsum(frequency) / rate)
    samples = np.concatenate((np.zeros(rate // 3), note, np.zeros(rate // 3)))
    samples += np.random.default_rng(10).normal(0, 0.00025, len(samples))
    take = extract(_write_wav(tmp_path, "vibrato.wav", samples, rate))

    assert len(take.events) == 1
    assert take.events[0].midi_float == pytest.approx(69, abs=0.25)
    assert take.events[0].end_s == pytest.approx(4 / 3, abs=0.09)


def test_crepe_splits_a_sustained_semitone_change_without_an_energy_dip(tmp_path):
    rate = 16_000
    frequency = np.repeat([440, 466.164], rate // 2)
    samples = 0.2 * np.sin(2 * np.pi * np.cumsum(frequency) / rate)
    take = extract(_write_wav(tmp_path, "legato.wav", samples, rate))

    assert [event.onset_s for event in take.events] == pytest.approx([0, 0.5], abs=0.05)
    assert [event.midi_float for event in take.events] == pytest.approx([69, 70], abs=0.25)


def test_silence_does_not_load_the_model(tmp_path, monkeypatch):
    def unexpected_call(*_args):
        pytest.fail("Silent input should bypass pitch tracking")

    monkeypatch.setattr("audio.extractor.crepe_frames", unexpected_call)
    take = extract(_write_wav(tmp_path, "silent.wav", np.zeros(22_050)))

    assert take.events == []
    assert take.warnings == ["SILENT"]
    assert take.duration_s == 1


def test_clipped_passage_carries_uncertainty(tmp_path):
    clipped = np.clip(4 * _tone(440, 0.5, amplitude=0.8), -1, 1)
    take = extract(_write_wav(tmp_path, "clipped.wav", clipped))

    assert take.events == []
    assert "CLIPPED" in take.warnings
    assert any(region.reason == "CLIPPED" for region in take.uncertain_regions)


def test_missing_crepe_uses_labeled_pyin_fallback(tmp_path, monkeypatch):
    def missing_weights(*_args):
        raise CrepeUnavailable("Model weights unavailable")

    monkeypatch.setattr("audio.extractor.crepe_frames", missing_weights)
    take = extract(_write_wav(tmp_path, "fallback.wav", _tone(440, 0.6)))

    assert take.method.startswith("pYIN")
    assert "CREPE_UNAVAILABLE" in take.warnings
    assert [event.midi_float for event in take.events] == pytest.approx([69], abs=0.25)


def test_rejects_invalid_wavs(tmp_path):
    bad = tmp_path / "corrupt.wav"
    bad.write_bytes(b"not a recording")
    empty = _write_wav(tmp_path, "empty.wav", np.array([]))
    invalid = _write_wav(tmp_path, "invalid.wav", np.array([np.nan]), subtype="FLOAT")
    long = _write_wav(tmp_path, "long.wav", np.zeros(45 * 8_000 + 1), rate=8_000)

    for path, message in ((bad, "Could not read"), (empty, "no readable audio frames"),
                          (invalid, "invalid samples"), (long, "45 seconds")):
        with pytest.raises(InputError, match=message):
            extract(path)
