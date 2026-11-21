"""Fractional-second replay; Streamlit's audio start_time rounds to seconds."""
import base64
import json
import math


def replay_html(original: bytes, event_s: float, duration_s: float | None) -> str:
    if not math.isfinite(event_s):
        raise ValueError("Replay time must be finite")
    start = max(0.0, event_s - .3)
    if duration_s is not None:
        start = min(start, max(0.0, duration_s - .1))
    data = base64.b64encode(original).decode("ascii")
    return f'''<audio id="take" controls preload="metadata" style="width:100%"
      src="data:audio/wav;base64,{data}"></audio>
    <button id="replay" style="padding:8px 16px;margin-top:8px;cursor:pointer">Replay passage</button>
    <script>
    const audio = document.getElementById('take');
    const start = {json.dumps(start)};
    audio.addEventListener('loadedmetadata', () => {{audio.currentTime = start;}});
    document.getElementById('replay').onclick = () => {{
      audio.currentTime = start;
      audio.play().catch(() => {{}});
    }};
    </script>'''
