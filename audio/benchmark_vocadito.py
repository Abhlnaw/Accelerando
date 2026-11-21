"""Evaluate note extraction against the first vocadito annotator, using a local ZIP."""
from argparse import ArgumentParser
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

import numpy as np
from scipy.optimize import linear_sum_assignment

from audio import extract


def benchmark(archive):
    matched = detected = annotated = 0
    with TemporaryDirectory() as folder, ZipFile(archive) as dataset:
        recording = Path(folder) / "voice.wav"
        for index in range(1, 41):
            recording.write_bytes(dataset.read(f"Audio/vocadito_{index}.wav"))
            events = extract(recording).events
            rows = dataset.read(f"Annotations/Notes/vocadito_{index}_notesA1.csv")
            truth = np.loadtxt(BytesIO(rows), delimiter=",", ndmin=2)
            times, pitches = truth[:, 0], 69 + 12 * np.log2(truth[:, 1] / 440)
            if events:
                hits = np.array([(abs(e.onset_s - times) <= .1) & (abs(e.midi_float - pitches) <= .5)
                                 for e in events], dtype=int)
                i, j = linear_sum_assignment(hits, maximize=True)
                matched += int(hits[i, j].sum())
            detected += len(events)
            annotated += len(truth)
    print(f"{matched} matches, {detected} detections, {annotated} annotations")
    print(f"Precision {matched / max(1, detected):.1%}, recall {matched / annotated:.1%}")


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    benchmark(parser.parse_args().archive)
