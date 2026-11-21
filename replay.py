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
    return f'''<style>
      html {{ color-scheme: light; }}
      body {{ margin: 0; color: #30231b; font-family: system-ui, sans-serif; }}
      audio {{ display: block; width: 100%; height: 44px; }}
      button {{
        background: #944a2d; color: #fff7e7; font: inherit; font-size: 14px;
        font-weight: 650; min-height: 38px; padding: 8px 14px; margin: 10px 3px 3px;
        border: 1px solid #944a2d; border-radius: 8px; cursor: pointer;
      }}
      button:hover {{ background: #713822; }}
      button:focus-visible {{ outline: 2px solid #713822; outline-offset: 2px; }}
    </style>
    <audio id="take" controls preload="metadata" aria-label="Original recording at the flagged passage"
      src="data:audio/wav;base64,{data}"></audio>
    <button id="replay" type="button">Replay passage</button>
    <script>
    const audio = document.getElementById('take');
    const start = {json.dumps(start)};
    audio.addEventListener('loadedmetadata', () => {{audio.currentTime = start;}});
    document.getElementById('replay').onclick = () => {{
      audio.currentTime = start;
      audio.play().catch(() => {{}});
    }};
    </script>'''
