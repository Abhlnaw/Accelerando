"""Serve the offline audio workspace inside the Streamlit studio."""
from functools import cache
from pathlib import Path

import streamlit.components.v1 as components
from ui.design import asset_url, intro


@cache
def tools_document():
    folder = Path(__file__).resolve().parents[1] / "android/app/src/main/assets/web/tools"
    html = (folder / "index.html").read_text(encoding="utf-8-sig")
    css = (folder / "tools.css").read_text(encoding="utf-8-sig")
    for font in ("instrument-serif.woff2", "dm-sans.woff2"):
        css = css.replace("/studio-assets/" + font, asset_url(font, "font/woff2"))
    html = html.replace('<link rel="stylesheet" href="tools.css">', f"<style>{css}</style>")
    for filename in ("pitch.js", "tools.js"):
        script = (folder / filename).read_text(encoding="utf-8-sig")
        html = html.replace(f'<script src="{filename}"></script>', f"<script>{script}</script>")
    return html


intro("Practice tools", "Tune your instrument, set the pulse, or sustain a reference pitch.")
components.html(tools_document(), height=700, scrolling=True)
