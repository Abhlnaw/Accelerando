"""Run with: python -m streamlit run app.py."""
from dataclasses import asdict
from hashlib import sha256
import logging
import math

import streamlit as st
import streamlit.components.v1 as components

from contracts import InputError
from pipeline import (Analysis, IntegrationError, Request, fixture_path, load_catalog,
                      run_analysis)
from replay import replay_html

log = logging.getLogger(__name__)
st.set_page_config(page_title="Accelerando · Practice coach", page_icon="🎵", layout="centered")


def show_results(analysis: Analysis, original: bytes):
    result = analysis.result
    st.subheader("Your next practice action")
    if result.status == "insufficient_evidence":
        st.info("Too little reliable evidence to grade this take. Record the full melody closer to the microphone in a quiet room.")
    elif not result.findings:
        st.success("No specific correction was identified. Play the phrase again and listen for a steady, intentional line.")
    for index, finding in enumerate(result.findings[:3]):
        with st.container(border=True):
            st.markdown(f"**Measure {finding.measure_label} · {finding.kind.capitalize()}**")
            st.write(finding.message)
            if finding.playback_s is not None and math.isfinite(finding.playback_s):
                label = "Approximate anchor" if finding.approximate_time or finding.kind == "missing" else "Detected event"
                st.caption(f"{label}: {finding.playback_s:.2f}s. Replay includes up to 0.3s of lead-in.")
                components.html(replay_html(original, finding.playback_s, analysis.take.duration_s), height=110)
            else:
                st.caption("Replay time unavailable; listen to the full take below.")
            with st.expander("Written note and evidence"):
                st.json(asdict(finding))
    st.subheader("Take overview")
    st.metric("Prototype grade", "Withheld" if result.grade is None else f"{result.grade:.1f} / 100")
    columns = st.columns(3)
    for column, key in zip(columns, ("pitch", "coverage", "rhythm")):
        value = result.subscores.get(key)
        column.metric(key.capitalize(), "Too little evidence" if value is None else f"{value:.1f}")
    fraction = result.assessed_fraction
    st.caption("Assessed fraction: unavailable" if fraction is None else f"Assessed fraction: {fraction:.0%} of written notes")
    st.caption(f"Active analysis method: {analysis.take.method}")
    for warning in result.warnings:
        messages = {
            "SCORE_ONLY": "Score-only analysis: no compatible reference contributed.",
            "CLIPPED": "The recording clipped. Lower the input level and try another take.",
            "SILENT": "No performance was detected. Check the microphone and recording.",
            "LOW_SIGNAL": "Some audio is unreliable. Treat uncertain passages cautiously.",
            "REFERENCE_UNAVAILABLE": "A reference could not be processed; score-based feedback is still available.",
        }
        st.warning(messages.get(warning, warning.replace("_", " ").capitalize()))
    st.subheader("Listen to your original take")
    st.audio(original, format="audio/wav")
    with st.expander("Interpretation and references"):
        if not result.reference_observations:
            st.write("No comparable reference observations are available. Timing and tone comparisons do not change the grade.")
        for observation in result.reference_observations:
            st.write(f"{observation.reference_id} · Measures {', '.join(observation.affected_measures)}")
            st.write(observation.observation)
        for reference in analysis.references:
            st.caption(f"{reference.reference_id}: {reference.source} · {reference.permission}")
    with st.expander("Technical evidence"):
        st.write("CREPE is the pretrained pitch tracker. The team supplies segmentation, score alignment, scoring and this interface.")
        st.json({"method": analysis.take.method, "runtime_seconds": analysis.timings_s,
                 "observed_notes": [asdict(e) for e in analysis.take.events],
                 "written_notes": [asdict(n) for n in analysis.score]})


def main():
    st.title("Accelerando")
    st.write("Hear what to practice next.")
    st.caption("One unaccompanied melody in concert pitch · WAV up to 45 seconds / 25 MB · matching single-part MusicXML up to 5 MB")
    mode = st.radio("Choose your inputs", ["Upload my performance", "Try an example", "Development preview"], horizontal=True)
    request = None
    if mode == "Development preview":
        st.session_state.pop("completed", None)
        st.warning("DEVELOPMENT FIXTURE: synthetic playback and invented results. No recording is analyzed here.")
        from development_preview import preview
        analysis, original = preview()
        show_results(analysis, original)
        return
    if mode == "Upload my performance":
        audio = st.file_uploader("Your performance", type=["wav"])
        score = st.file_uploader("Matching MusicXML", type=["musicxml", "xml"])
        if audio is not None and score is not None:
            request = Request(audio.getvalue(), score.getvalue(), audio.name, score.name)
    else:
        try:
            pieces = load_catalog()
            if not pieces:
                st.info("Bundled recordings are awaiting the score owner's fixture handoff. Upload matching files or open the development preview.")
            else:
                piece = st.selectbox("Piece", pieces, format_func=lambda p: p.get("title", p["piece_id"]))
                recordings = piece.get("takes", [])
                if not recordings:
                    st.info("This piece has no bundled takes yet.")
                else:
                    recording = st.selectbox("Performance", recordings, format_func=lambda r: r["label"])
                    st.caption(recording.get("source", piece.get("source", "Source not specified")))
                    request = Request(fixture_path(recording["audio_path"]).read_bytes(),
                                      fixture_path(piece["score_path"]).read_bytes())
        except (InputError, OSError, KeyError) as exc:
            st.error(f"Cannot open this example: {exc}")
    # Content, mode and display formats determine active identity; names never select a reference.
    key = None if request is None else sha256((mode + request.key + request.audio_name + request.score_name).encode()).hexdigest()
    completed = st.session_state.get("completed")
    if completed and completed[0] != key:
        st.session_state.pop("completed", None)
        completed = None
    if request:
        st.caption(f"Ready: {request.audio_name} · {request.score_name}")
        st.audio(request.audio_bytes, format="audio/wav")
    if st.button("Analyze", type="primary", disabled=request is None):
        st.session_state.pop("completed", None)
        completed = None
        with st.status("Starting analysis", expanded=True) as status:
            stage = "Validating inputs"
            def progress(message):
                nonlocal stage
                stage = message
                status.update(label=message)
            try:
                analysis = run_analysis(request, progress)
            except (InputError, IntegrationError) as exc:
                status.update(label=f"Stopped: {stage}", state="error")
                st.error(str(exc))
            except Exception:
                log.exception("Analysis failed at %s", stage)
                status.update(label=f"Stopped: {stage}", state="error")
                st.error("Analysis could not finish. Retry once; if it repeats, share the processing stage with the team.")
            else:
                completed = (key, analysis, request.audio_bytes)
                st.session_state.completed = completed
                status.update(label="Analysis complete", state="complete", expanded=False)
    if completed:
        show_results(completed[1], completed[2])


if __name__ == "__main__":
    main()
