"""Export the installed, pretrained CREPE tiny weights for Android. No training.

Install tools with: python -m pip install -r android/tools/requirements.txt
Run from repo root: python android/tools/export_crepe.py
"""
from pathlib import Path
import hashlib
import json
import numpy as np
import torch
import torchcrepe
import onnx
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'android/app/src/main/assets'


class MobileCrepe(torch.nn.Module):
    def __init__(self):
        super().__init__()
        torchcrepe.load.model('cpu', 'tiny')
        self.model = torchcrepe.infer.model

    def forward(self, audio):
        centered = audio - audio.mean(dim=1, keepdim=True)
        # torchcrepe uses sample standard deviation (N-1).
        variance = (centered * centered).sum(dim=1, keepdim=True) / 1023
        normalized = centered / torch.sqrt(variance).clamp(min=1e-10)
        return self.model(normalized)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    path = DEST / 'crepe-tiny.onnx'
    model = MobileCrepe().eval()
    frame = torch.sin(2 * torch.pi * 440 * torch.arange(1024) / 16000)[None, :] * .25
    with torch.no_grad():
        torch.onnx.export(model, frame, path, input_names=['audio'], output_names=['activation'],
                          opset_version=17, dynamo=False)
    onnx.checker.check_model(str(path))
    session = ort.InferenceSession(str(path), providers=['CPUExecutionProvider'])
    errors = []
    # Test multiple pitches, not just the frame traced during export.
    for midi in (40, 48, 60, 67, 69, 76, 84):
        hz = 440 * 2 ** ((midi - 69) / 12)
        audio = (.25 * np.sin(2 * np.pi * hz * np.arange(1024) / 16000)).astype('float32')[None]
        with torch.no_grad():
            expected = model(torch.from_numpy(audio)).numpy()
        actual = session.run(None, {'audio': audio})[0]
        error = float(np.max(np.abs(actual - expected)))
        assert error < 1e-4, (midi, error)
        errors.append(error)
    report = {'model': 'Pretrained CREPE tiny, exported from torchcrepe 0.0.24',
              'input': 'float32 [1,1024], raw mono 16 kHz; normalization inside model',
              'output': 'float32 [1,360] pitch-bin activations', 'opset': 17,
              'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
              'max_activation_error_vs_pytorch': max(errors),
              'tested_midi_pitches': [40,48,60,67,69,76,84]}
    (DEST / 'model-info.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
