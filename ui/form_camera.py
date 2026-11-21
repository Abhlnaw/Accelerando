"""Register the webcam iframe from an importable Streamlit component module."""
from pathlib import Path

import streamlit.components.v1 as components

camera = components.declare_component(
    "form_camera", path=str(Path(__file__).with_name("technique_component"))
)
