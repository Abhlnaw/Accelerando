"""Shared presentation for the practice studio."""

from base64 import b64encode
from functools import cache
from html import escape
from pathlib import Path

import streamlit as st


ROOT = Path(__file__).resolve().parent


@cache
def asset_url(filename: str, media_type: str) -> str:
    data = b64encode((ROOT / "assets" / filename).read_bytes()).decode("ascii")
    return f"data:{media_type};base64,{data}"


@cache
def _style() -> str:
    css = (ROOT / "studio.css").read_text(encoding="utf-8")
    body = asset_url("dm-sans.woff2", "font/woff2")
    serif = asset_url("instrument-serif.woff2", "font/woff2")
    italic = asset_url("instrument-serif-italic.woff2", "font/woff2")
    return f"""<style>
        @font-face {{
            font-family: "DM Sans"; font-weight: 400 700; font-display: swap;
            src: url("{body}") format("woff2");
        }}
        @font-face {{
            font-family: "Instrument Serif"; font-weight: 400; font-display: swap;
            src: url("{serif}") format("woff2");
        }}
        @font-face {{
            font-family: "Instrument Serif"; font-weight: 400; font-style: italic; font-display: swap;
            src: url("{italic}") format("woff2");
        }}
        {css}
    </style>"""


def apply_theme():
    st.html(_style())


def intro(title: str, description: str):
    st.html(f"""
        <header class="page-intro">
            <h1>{escape(title)}</h1>
            <p>{escape(description)}</p>
        </header>
    """)
