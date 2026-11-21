"""Embed the same recording game used by the standalone Android studio."""
from base64 import b64encode
import json
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components
from ui.design import asset_url, intro

intro("Score run", "Play a written line, follow the live critique, and beat your best take.")
folder = Path(__file__).resolve().parents[1] / "android/app/src/main/assets/web/game"
html = (folder / "index.html").read_text(encoding="utf-8-sig")
for name in ("../tools/tools.css", "game.css"):
    css = (folder / name).read_text(encoding="utf-8-sig")
    for font in ("instrument-serif.woff2", "dm-sans.woff2"):
        css = css.replace("/studio-assets/" + font, asset_url(font, "font/woff2"))
    html = html.replace(f'<link rel="stylesheet" href="{name}">', f"<style>{css}</style>")
uploads = list(st.session_state.get("game_scores", {}).values())
current = st.session_state.get("practice_score")
if current and current not in uploads:
    uploads.append(current)
payload = json.dumps([(n, b64encode(b).decode("ascii")) for n, b in uploads]).replace("<", "\\u003c")
html = html.replace("<body>", f"<body><script>window.practiceUploads={payload}</script>")
for name in ("../core.js", "../score-lines.js", "../tools/pitch.js", "library.js", "game.js"):
    script = (folder / name).read_text(encoding="utf-8-sig")
    html = html.replace(f'<script src="{name}"></script>', f"<script>{script}</script>")
components.html(html, height=840, scrolling=True)
