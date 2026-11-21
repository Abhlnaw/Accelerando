"""A fixed polyphonic chart must follow the performed voice, including mistakes."""
from io import BytesIO

import numpy as np
import pytest
import soundfile as sf

from pipeline import Request, run_analysis
from audio._acoustics import reinforce_periodic_frames
from contracts import ObservedNote
from score import read_lines, select_line


def note(step, octave, *, chord=False, voice=1):
    return (f"<note>{'<chord/>' if chord else ''}<pitch><step>{step}</step>"
            f"<octave>{octave}</octave></pitch><duration>1</duration><voice>{voice}</voice></note>")


def chart():
    chords = "".join(note(a, 4) + note(b, 4, chord=True)
                     for a, b in zip("CDEF", "GABA"))
    bass = "".join(note(a, 3, voice=2) for a in "GFED")
    return (f'<score-partwise><part id="Keyboard"><measure number="7"><attributes><divisions>1'
            f'</divisions></attributes>{chords}<backup><duration>4</duration></backup>{bass}'
            '</measure></part></score-partwise>').encode()


def test_waveform_confirmation_rejects_noise_and_half_frequency():
    rate = 16000
    t = np.arange(rate) / rate
    sine = np.sin(2 * np.pi * 250 * t)
    noise = np.random.default_rng(6).normal(size=len(t))
    for audio, pitch, expected in [(sine, 250, .70), (sine, 125, .4), (noise, 250, .4)]:
        values = reinforce_periodic_frames(audio, rate, 160, np.full(100, pitch),
                                           np.full(100, .4), np.ones(100, dtype=bool))
        assert values[50] == pytest.approx(expected)


def test_multistaff_and_transposing_parts_keep_distinct_targets(tmp_path):
    keyboard = chart().decode().replace("<voice>2</voice>", "<staff>2</staff>")
    clarinet = ("<part id='Clarinet'><measure number='7'><attributes><divisions>1</divisions>"
                "<transpose><chromatic>-2</chromatic></transpose></attributes>"
                + "".join(note(p, 5) for p in "DEFG") + "</measure></part>")
    path = tmp_path / "ensemble.xml"
    path.write_text(keyboard.replace("</score-partwise>", clarinet + "</score-partwise>"))
    lines = read_lines(path)
    assert len(lines) == 4
    heard = [ObservedNote(i, i+.8, midi, .9) for i, midi in enumerate([72, 74, 76, 77])]
    matched, ambiguous = select_line(lines, heard)
    assert "Clarinet" in matched.label and not ambiguous
    # The third recorded note is one semitone above the written sounding pitch.
    assert [n.midi for n in matched.notes] == [72, 74, 75, 77]
    assert select_line(lines, [])[1]


@pytest.mark.parametrize("pitches,pluck,line", [
    ([60, 62, 64, 65], True, "chord tone 2"),
    ([67, 69, 71, 69], False, "chord tone 1"),
    ([55, 53, 52, 50], True, "voice 2"),
])
def test_recorded_line_is_chosen_from_chords_and_backup(pitches, pluck, line):
    rate = 16000
    t = np.arange(rate//2)/rate
    frames = [np.zeros(rate//4)]
    for midi in pitches:
        hz = 440 * 2**((midi-69)/12)
        # Decaying pluck or vibrato with energy around two vowel formants.
        vibrato = 0 if pluck else .3*np.sin(2*np.pi*5*t)
        phase = 2*np.pi*np.cumsum(hz*2**(vibrato/12)*np.ones_like(t))/rate
        harmonics = np.arange(1, 13)
        weights = (1/harmonics if pluck else
                   .18/harmonics + np.exp(-((harmonics*hz-750)/200)**2)
                   + .5*np.exp(-((harmonics*hz-1350)/200)**2))
        tone = sum(w*np.sin(k*phase) for k,w in zip(harmonics,weights))
        frames.extend([.02*tone*(np.exp(-5*t) if pluck else 1), np.zeros(rate//10)])
    audio = np.concatenate(frames)
    audio += np.random.default_rng(81).normal(0,.0003,len(audio))
    buffer = BytesIO()
    sf.write(buffer,np.stack([audio,-audio],axis=1),rate,format="WAV",subtype="PCM_16")
    analysis = run_analysis(Request(buffer.getvalue(),chart(),"microphone"))
    assert line in analysis.score_line
    assert [n.midi_float for n in analysis.take.events] == pytest.approx(pitches,abs=.35)
    assert all(n.measure_label=="7" for n in analysis.score)
    assert len(analysis.take.acoustic_measurements)==4
    assert analysis.result.grade >= 90
