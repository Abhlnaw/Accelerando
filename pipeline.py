"""Synchronous orchestration used by the UI and integration checks.

No fixture substitution is permitted here. Domain modules are loaded lazily so
the UI and development preview can run while teammates finish their packages.
"""
from __future__ import annotations

from collections import OrderedDict
from dataclasses import dataclass, field
from hashlib import sha256
from importlib import import_module
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from threading import RLock
from typing import Callable
import copy
import wave

from contracts import InputError, Result, ScoreNote, Take

ROOT = Path(__file__).resolve().parent
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_SCORE_BYTES = 5 * 1024 * 1024
MAX_DURATION_S = 45
ANALYSIS_VERSION = "integration-v1"


class IntegrationError(RuntimeError):
    """An owner module or its environment is not ready."""


@dataclass(frozen=True)
class Request:
    audio_bytes: bytes
    score_bytes: bytes
    audio_name: str = "performance.wav"
    score_name: str = "score.musicxml"
    # Display-only filenames never participate in reference lookup.

    @property
    def key(self) -> str:
        return sha256(self.audio_bytes + b"\0" + self.score_bytes +
                      ANALYSIS_VERSION.encode()).hexdigest()


@dataclass(frozen=True)
class ReferenceSpec:
    reference_id: str
    path: Path
    source: str
    permission: str


@dataclass
class Analysis:
    result: Result
    take: Take
    score: list[ScoreNote]
    timings_s: dict[str, float]
    references: list[ReferenceSpec] = field(default_factory=list)


def validate_request(request: Request) -> float:
    if Path(request.audio_name).suffix.lower() != ".wav":
        raise InputError("Upload a WAV recording of one unaccompanied melody.")
    if Path(request.score_name).suffix.lower() not in {".xml", ".musicxml"}:
        raise InputError("Upload an uncompressed MusicXML (.musicxml or .xml) score.")
    if not request.score_bytes or len(request.score_bytes) > MAX_SCORE_BYTES:
        raise InputError("Choose a nonempty MusicXML score under 5 MB.")
    if not request.audio_bytes or len(request.audio_bytes) > MAX_AUDIO_BYTES:
        raise InputError("Choose a nonempty WAV recording under 25 MB.")
    try:
        with wave.open(BytesIO(request.audio_bytes), "rb") as wav:
            frames, rate = wav.getnframes(), wav.getframerate()
            if not frames or not rate:
                raise InputError("This WAV has no readable audio frames. Export the recording again.")
            duration = frames / rate
            if duration > MAX_DURATION_S:
                raise InputError("Trim the recording to 45 seconds or less.")
            # Detect truncated PCM files, including valid headers with absent data.
            if len(wav.readframes(frames)) != frames * wav.getsampwidth() * wav.getnchannels():
                raise InputError("The WAV audio data is incomplete. Export the recording again.")
            return duration
    except (wave.Error, EOFError) as exc:
        raise InputError("Cannot decode this WAV. Export it as an uncompressed PCM WAV.") from exc


def load_catalog(root: Path = ROOT) -> list[dict]:
    manifest = root / "fixtures" / "manifest.json"
    if not manifest.exists():
        return []
    try:
        content = json.loads(manifest.read_text(encoding="utf-8"))
        pieces = content["pieces"] if isinstance(content, dict) else content
        if not isinstance(pieces, list) or any(not isinstance(p, dict) for p in pieces):
            raise ValueError("pieces must be a list of records")
        return pieces
    except (ValueError, KeyError) as exc:
        raise InputError("The bundled example catalog is invalid; ask the team to check fixtures/manifest.json.") from exc


def fixture_path(value: str, root: Path = ROOT) -> Path:
    path = (root / value).resolve()
    if not path.is_relative_to((root / "fixtures").resolve()):
        raise InputError("Bundled media must be inside fixtures/.")
    return path


def compatible_references(score_bytes: bytes, root: Path = ROOT) -> list[ReferenceSpec]:
    """Only exact score content matches may acquire bundled references."""
    found = []
    for piece in load_catalog(root):
        score_path = fixture_path(piece["score_path"], root)
        if not score_path.is_file() or sha256(score_path.read_bytes()).digest() != sha256(score_bytes).digest():
            continue
        for ref in piece.get("references", []):
            if ref.get("permission") and ref.get("source"):
                found.append(ReferenceSpec(ref["reference_id"], fixture_path(ref["audio_path"], root),
                                           ref["source"], ref["permission"]))
    return found


def _domain(package: str, name: str):
    try:
        return getattr(import_module(package), name)
    except (ImportError, AttributeError) as exc:
        raise IntegrationError(
            f"{package}.{name} is unavailable. Install requirements and integrate the {package} owner's module.") from exc


# Only bundled references and parsed scores are cached. User recordings are not.
_reference_cache: OrderedDict = OrderedDict()
_score_cache: OrderedDict = OrderedDict()
_cache_lock = RLock()


def _cached(cache, key, factory):
    # Streamlit sessions share this module. Fill once; never expose mutable cache objects.
    with _cache_lock:
        if key in cache:
            return copy.deepcopy(cache[key])
        value = factory()
        cache[key] = copy.deepcopy(value)
        while len(cache) > 32:
            cache.popitem(last=False)
        return value


def _version(package: str) -> str:
    digest = sha256(ANALYSIS_VERSION.encode())
    for path in sorted((ROOT / package).rglob("*.py")):
        digest.update(path.read_bytes())
    return digest.hexdigest()


def run_analysis(request: Request, progress: Callable[[str], None] = lambda _: None) -> Analysis:
    timings = {}
    start = perf_counter()
    progress("Validating inputs")
    duration = validate_request(request)
    with TemporaryDirectory(prefix="accelerando-") as folder:
        score_path, audio_path = Path(folder) / "score.musicxml", Path(folder) / "take.wav"
        score_path.write_bytes(request.score_bytes)
        audio_path.write_bytes(request.audio_bytes)
        progress("Reading score")
        parser = _domain("score", "parse_score")
        try:
            score = _cached(_score_cache, (sha256(request.score_bytes).hexdigest(), _version("score")),
                            lambda: parser(score_path))
        except ValueError as exc:
            raise InputError(f"Score: {exc}") from exc
        if not score:
            raise InputError("The score contains no sounding notes. Choose a single melodic part.")
        timings["score"] = perf_counter() - start
        progress("Extracting notes (first run may load the pitch model)")
        extractor = _domain("audio", "extract")
        tick = perf_counter()
        try:
            take = extractor(audio_path)
        except ValueError as exc:
            raise InputError(f"Recording: {exc}") from exc
        timings["take_extraction"] = perf_counter() - tick
        if take.duration_s is None:
            take.duration_s = duration
        if not take.events:
            result = Result("insufficient_evidence", None,
                            warnings=list(dict.fromkeys(take.warnings + ["NO_RELIABLE_NOTES"])),
                            assessed_fraction=0.0)
            timings["total"] = perf_counter() - start
            return Analysis(result, take, score, timings)
        progress("Preparing optional references")
        references, used, warnings = [], [], []
        tick = perf_counter()
        try:
            specs = compatible_references(request.score_bytes)
        except (InputError, KeyError, OSError):
            specs = []
            warnings.append("REFERENCE_CATALOG_UNAVAILABLE")
        for spec in specs:
            try:
                data = spec.path.read_bytes()
                validate_request(Request(data, request.score_bytes))
                key = (sha256(data).hexdigest(), _version("audio"),
                       getattr(extractor, "cache_version", "default-settings"))
                # Extract immutable bytes under an owned temporary name; avoids cache/read races.
                ref_path = Path(folder) / "reference.wav"
                ref_path.write_bytes(data)
                ref_take = _cached(_reference_cache, key, lambda: extractor(ref_path))
                if ref_take.events:
                    references.append((spec.reference_id, ref_take))
                    used.append(spec)
                else:
                    warnings.append("REFERENCE_UNRELIABLE")
            except Exception:
                # A reference failure never discards a valid performance.
                warnings.append("REFERENCE_UNAVAILABLE")
        timings["references"] = perf_counter() - tick
        progress("Aligning notes and preparing feedback")
        tick = perf_counter()
        result = _domain("grading", "analyze")(score, take, references)
        result.warnings = list(dict.fromkeys(result.warnings + take.warnings + warnings))
        if not references:
            result.warnings.append("SCORE_ONLY")
        timings["grading"] = perf_counter() - tick
        timings["total"] = perf_counter() - start
        return Analysis(result, take, score, timings, used)
