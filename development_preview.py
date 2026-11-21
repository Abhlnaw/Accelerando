"""Explicit, synthetic UI fixture; never imported by the real pipeline."""
from io import BytesIO
import math
import struct
import wave

from contracts import Finding, Result, Take
from pipeline import Analysis


def preview() -> tuple[Analysis, bytes]:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setparams((1, 2, 8000, 0, "NONE", "not compressed"))
        audio.writeframes(b"".join(struct.pack("<h", int(5000 * math.sin(2 * math.pi * 440 * i / 8000)))
                                   for i in range(32000)))
    result = Result("ok", 88, dict(pitch=82, coverage=100, rhythm=85),
                    warnings=["DEVELOPMENT_FIXTURE"], assessed_fraction=1.0,
                    findings=[Finding("pitch", "m2n1", "2", 2.6, False,
                                      "First note: about a semitone above A4. Sing or tune A4, then replay the entrance.")])
    return Analysis(result, Take("DEVELOPMENT FIXTURE — no inference"), [], {}), buffer.getvalue()
