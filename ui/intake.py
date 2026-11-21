"""Shared intake and analysis state for uploads and examples."""

from dataclasses import dataclass
from hashlib import sha256
import logging

import streamlit as st

from contracts import InputError
from pipeline import Analysis, IntegrationError, Request
import pipeline


log = logging.getLogger(__name__)
_COMPLETED = "completed_analysis"


@dataclass(frozen=True)
class Completed:
    source: str
    identity: str
    title: str
    request: Request
    analysis: Analysis


def completed() -> Completed | None:
    return st.session_state.get(_COMPLETED)


def analysis_action(source: str, title: str, request: Request | None):
    identity = None
    if request:
        identity = sha256(
            f"{request.key}\0{request.audio_name}\0{request.score_name}".encode()
        ).hexdigest()
    previous = completed()
    if previous and previous.source == source and previous.identity != identity:
        st.session_state.pop(_COMPLETED)

    if not st.button("Analyze take", type="primary", icon=":material/arrow_forward:",
                     disabled=request is None, key=f"analyze_{source}"):
        return

    st.session_state.pop(_COMPLETED, None)
    with st.status("Starting analysis", expanded=True) as status:
        stage = "Validating inputs"

        def progress(message: str):
            nonlocal stage
            stage = message
            status.update(label=message)

        try:
            analysis = pipeline.run_analysis(request, progress)
        except (InputError, IntegrationError) as exc:
            status.update(label=f"Stopped at {stage.lower()}", state="error")
            st.error(str(exc))
            return
        except Exception:
            log.exception("Analysis failed at %s", stage)
            status.update(label=f"Stopped at {stage.lower()}", state="error")
            st.error("Analysis could not finish. Try again and share the processing stage with the team if it repeats.")
            return
        st.session_state[_COMPLETED] = Completed(source, identity, title, request, analysis)
        status.update(label="Analysis complete", state="complete", expanded=False)
    st.switch_page("ui/results.py")
