"""Run pretrained CREPE on CPU, with pYIN available for integration debugging."""

from functools import lru_cache
from threading import Lock

import numpy as np


_MODEL = "tiny"
_MIN_HZ = 32.7
_MAX_HZ = 2_000
_MODEL_LOCK = Lock()


class CrepeUnavailable(RuntimeError):
    """CREPE or its local model weights could not be loaded."""


@lru_cache(maxsize=1)
def _load_crepe():
    try:
        import torch
        import torchcrepe

        # torchcrepe ships the converted pretrained weights inside the wheel.
        torchcrepe.load.model("cpu", _MODEL)
    except (ImportError, OSError, RuntimeError) as exc:
        raise CrepeUnavailable("Could not load local CREPE weights.") from exc
    return torch, torchcrepe


def crepe_frames(samples: np.ndarray, rate: int, hop: int) -> tuple[np.ndarray, np.ndarray]:
    # torchcrepe keeps its model in module-level state. Serialize access so
    # concurrent Streamlit submissions cannot race during the first load.
    with _MODEL_LOCK:
        torch, torchcrepe = _load_crepe()
        pitch, periodicity = torchcrepe.predict(
            torch.from_numpy(samples).unsqueeze(0), rate, hop, _MIN_HZ, _MAX_HZ,
            _MODEL, decoder=_weighted_pitch, return_periodicity=True,
            batch_size=256, device="cpu",
        )
    return pitch[0].numpy(), periodicity[0].numpy()


def _weighted_pitch(activations):
    import torch
    from torchcrepe import CENTS_PER_BIN, convert

    # Use CREPE's local average of model activations and fixed bin centers so
    # the same recording yields the same pitch evidence across app restarts.
    peak = activations.argmax(dim=1, keepdim=True)
    bins = torch.arange(activations.shape[1], device=activations.device)[None, :, None]
    nearby = (bins - peak).abs() <= 4
    weights = activations.masked_fill(~nearby | ~activations.isfinite(), 0)
    average_bin = (weights * bins).sum(dim=1) / weights.sum(dim=1)
    cents = 1997.3794084376191 + CENTS_PER_BIN * average_bin
    return peak.squeeze(1), convert.cents_to_frequency(cents)


def pyin_frames(samples: np.ndarray, rate: int, hop: int) -> tuple[np.ndarray, np.ndarray]:
    import librosa

    pitch, voiced, confidence = librosa.pyin(
        samples, fmin=_MIN_HZ, fmax=_MAX_HZ, sr=rate, frame_length=2048,
        hop_length=hop, fill_na=np.nan,
    )
    return pitch, np.where(voiced, confidence, 0)
