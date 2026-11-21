# Audio and ML handoff

Use `from audio import extract` and pass the path to a solo WAV. The same
function processes a musician’s performance and a reference. It returns the
shared `contracts.Take` with the active analysis method, ordered observations,
warnings, recording duration, and any uncertain time ranges. Onsets and ends
are seconds from the original file’s time zero, including the lead-in. The
extractor leaves the original bytes available for replay. Use
`extract(path, denoise=False)` to compare the same tracker on the raw signal.

Use 8–192 kHz, an uncompressed WAV, at most 25 MiB and at most 45 seconds. The
extractor raises `contracts.InputError` for unsupported or unreadable files.
Digital silence returns an empty `Take` with `SILENT` before loading the model.
Clipped or weakly tracked passages can yield uncertainty ranges. The model
operates on a single melody in an approximate 33–2,000 Hz pitch range. Soft
attacks can move slightly with the noise floor, and dense accompaniment or
very short notes can make the evidence unreliable.

## Model setup and verification

Agent 4 maintains the root dependency list. The audio versions verified on
Windows with CPython 3.12 are NumPy 2.5.5, SciPy 1.16.3, SoundFile 0.13.1,
librosa 0.11.0, torchcrepe 0.0.24, and the matching PyTorch and Torchaudio
2.8.0 CPU wheels. To test this branch before those dependencies are integrated,
install these packages in a virtual environment and run from the repository root.

```sh
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch==2.8.0+cpu torchaudio==2.8.0+cpu
python -m pip install numpy==2.5.5 scipy==1.16.3 soundfile==0.13.1 librosa==0.11.0 torchcrepe==0.0.24 pytest==8.4.2
python -m pytest -q tests/test_audio.py
```

The `torchcrepe` wheel includes the converted pretrained CREPE weights. The
extractor reads the tiny CPU model from the installed wheel on the first voiced
take and reuses it across subsequent calls. Inference runs offline after
installation. If CREPE cannot load, the extractor labels the run as pYIN and
adds `CREPE_UNAVAILABLE`. Use a CREPE run for the neural release check.
[CREPE model and local-average decoder](https://github.com/marl/crepe)
and [TorchCREPE CPU port and weights](https://github.com/maxrmorrison/torchcrepe).

## Recorded observations for grading

The audio fixture at `tests/data/recorded_flute_scale.wav` contains the first
10.7 seconds of the non-vibrato, mezzo-forte B3–B4 chromatic flute recording
performed by Sonja Feig in April 2000. It was trimmed after the fourth note
and converted to mono 16 kHz PCM WAV. The University of Iowa Electronic Music
Studios permits reuse of the recording.
[Recording and performer](https://theremin.music.uiowa.edu/MISflute.html),
[reuse terms](https://theremin.music.uiowa.edu/MIS.html).

Fixed −48 dB waveform crossings provide the approximate reference onsets in
the table. The lightly noisy comparison adds Gaussian noise with RMS 0.0015
on the decoded full-scale amplitude and NumPy seed 8.

| Note | Reference onset (s) | Clean onset (s) | Clean MIDI | Clean confidence | Noisy onset (s) | Noisy MIDI |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| B3 | 0.43 | 0.34 | 59.01 | 0.86 | 0.45 | 59.03 |
| C4 | 2.89 | 2.77 | 59.87 | 0.85 | 2.91 | 59.88 |
| C♯4 | 5.52 | 5.45 | 60.89 | 0.88 | 5.53 | 60.89 |
| D4 | 8.27 | 8.25 | 61.88 | 0.91 | 8.28 | 61.88 |

On the test machine, the clean recording took 4.68 seconds on the first
extraction, including model imports and initialization, and 0.60 seconds with
the model warm. The mildly noisy version still yielded four notes with
attenuation enabled or disabled. The smoke tests also cover repeated
articulation, legato semitone transitions, vibrato, clipping, silence, and
invalid WAVs.

```sh
python -c "from audio import extract; print(extract('tests/data/recorded_flute_scale.wav'))"
```
