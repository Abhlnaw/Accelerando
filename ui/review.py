"""Result views shared by real and development takes."""

from dataclasses import asdict
from html import escape
import math

import streamlit as st
import streamlit.components.v1 as components

from pipeline import Analysis, Request
from replay import replay_html
from ui.score_demo import show_demo


_WARNINGS = {
    "CLIPPED": "The recording clipped. Lower your input level and record again.",
    "SILENT": "No performance was detected. Check your microphone and try again.",
    "LOW_SIGNAL": "Parts of the recording were too weak or noisy to assess reliably.",
    "NO_RELIABLE_NOTES": "The pitch tracker did not find enough reliable notes.",
    "CREPE_UNAVAILABLE": "The CREPE weights could not load. This take was analyzed with pYIN.",
    "REFERENCE_UNAVAILABLE": "A bundled reference could not be processed.",
    "REFERENCE_UNRELIABLE": "The bundled reference did not contain enough reliable notes.",
    "REFERENCE_CATALOG_UNAVAILABLE": "The example catalog could not be loaded.",
    "UNCERTAIN_AUDIO_OR_ALIGNMENT": "Some notes were excluded because the recording or alignment was uncertain.",
    "AMBIGUOUS_ALIGNMENT": "More than one score position could explain part of the performance.",
}
_NOTE_NAMES = ("C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B")


def _note_name(midi: int) -> str:
    return f"{_NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def _findings(analysis: Analysis, original: bytes, view_key: str):
    result = analysis.result
    findings = result.findings[:3]
    st.subheader("What to practice next", anchor=False)
    if analysis.score_line:
        st.caption(f"Assessed line · {analysis.score_line}")
    if "AMBIGUOUS_SCORE_LINE" in result.warnings:
        st.info("Several written lines fit this take similarly. Include a phrase where their pitches differ.")
    elif result.status == "insufficient_evidence":
        st.info("Too little reliable evidence to grade this take. Record the full melody closer to the microphone in a quiet room.")
    elif not findings:
        st.success("No specific correction came up. Listen back for a steady, intentional line.")

    if findings:
        selected = 0
        if len(findings) > 1:
            selected = st.radio(
                "Choose a passage", range(len(findings)), horizontal=True,
                format_func=lambda i: f"Measure {findings[i].measure_label} · {findings[i].kind.capitalize()}",
                key=f"finding_{view_key}",
            )
        finding = findings[selected]
        with st.container(border=True, key="practice_finding"):
            st.caption(finding.kind.capitalize())
            st.subheader(f"Measure {finding.measure_label}", anchor=False)
            st.write(finding.message)
            if finding.playback_s is not None and math.isfinite(finding.playback_s):
                approximate = finding.approximate_time or finding.kind == "missing"
                label = "Approximate anchor" if approximate else "Detected event"
                st.caption(f"{label} · {finding.playback_s:.2f}s into the take")
                components.html(replay_html(original, finding.playback_s, analysis.take.duration_s), height=114)
            else:
                st.caption("Listen to the original take to review this passage.")
            with st.expander("Written note and evidence"):
                st.json(asdict(finding))

    with st.expander("Listen to the full recording"):
        st.audio(original, format="audio/wav")


def _score(analysis: Analysis, request: Request | None):
    st.subheader("Written score", anchor=False)
    if request:
        show_demo(request.score_bytes)
        st.download_button("Download MusicXML", request.score_bytes, request.score_name,
                           mime="application/vnd.recordare.musicxml+xml", key="result_score")
    if not analysis.score:
        st.info("This take has no written notes to display.")
        return
    measures = list(dict.fromkeys(note.measure_label for note in analysis.score))
    measure = st.selectbox("Measure", measures, format_func=lambda label: f"Measure {label}")
    notes = [note for note in analysis.score if note.measure_label == measure]
    st.dataframe({
        "Note": [_note_name(note.midi) for note in notes],
        "Score ID": [note.id for note in notes],
        "Offset (beats)": [note.onset_qn for note in notes],
        "Length (beats)": [note.duration_qn for note in notes],
    }, width="stretch", hide_index=True)
    st.caption("Offsets count quarter-note beats from the start of the score, including rests.")


def _references(analysis: Analysis):
    st.subheader("Reference comparison", anchor=False)
    observations = analysis.result.reference_observations
    if not observations:
        st.info("No comparable reference contributed to this take. Your grade uses the written score.")
    for item in observations:
        with st.container(border=True):
            st.caption(f"Measures {', '.join(item.affected_measures)}")
            st.write(item.observation)
            st.caption(f"Reference · {item.reference_id}")
    for reference in analysis.references:
        st.write(reference.source)
        st.caption(reference.permission)


def _diagnostics(analysis: Analysis):
    st.subheader("Analysis details", anchor=False)
    st.write(f"Pitch tracker for this take · {analysis.take.method}")
    st.write("Accelerando groups the pitch estimates into notes, aligns them with the score, and calculates the grade.")
    for warning in analysis.result.warnings:
        if warning in _WARNINGS:
            st.warning(_WARNINGS[warning])
        elif warning != "SCORE_ONLY":
            st.caption(warning.replace("_", " ").capitalize())
    if analysis.take.events:
        st.dataframe({
            "Start (s)": [round(note.onset_s, 3) for note in analysis.take.events],
            "End (s)": [round(note.end_s, 3) for note in analysis.take.events],
            "Pitch (MIDI)": [round(note.midi_float, 2) for note in analysis.take.events],
            "Confidence": [round(note.confidence, 2) for note in analysis.take.events],
        }, width="stretch", hide_index=True)
    with st.expander("Raw observations and runtime"):
        st.json({
            "method": analysis.take.method,
            "runtime_seconds": analysis.timings_s,
            "observed_notes": [asdict(note) for note in analysis.take.events],
            "acoustic_measurements": analysis.take.acoustic_measurements,
            "uncertain_regions": [asdict(region) for region in analysis.take.uncertain_regions],
            "written_notes": [asdict(note) for note in analysis.score],
        })


def _grade_summary(analysis: Analysis):
    result = analysis.result
    value = "Withheld" if result.grade is None else f"{result.grade:.1f}"
    unit = "" if result.grade is None else "<small>/ 100</small>"
    assessed = result.assessed_fraction
    context = "Assessed fraction unavailable" if assessed is None else f"{assessed:.0%} of written notes assessed"
    st.html(f"""
        <section class="grade-card" aria-label="Practice grade">
            <p class="overline">Practice grade</p>
            <p class="grade-value">{escape(value)} {unit}</p>
            <p class="grade-context">{escape(context)}</p>
            <p class="grade-method">Active analysis method · {escape(analysis.take.method)}</p>
        </section>
    """)
    with st.container(border=True, key="results_breakdown"):
        st.subheader("Grade breakdown", anchor=False)
        for label, key in (("Pitch accuracy", "pitch"), ("Note coverage", "coverage"), ("Local rhythm", "rhythm")):
            score = result.subscores.get(key)
            if score is None:
                st.caption(f"{label} · Too little evidence")
            else:
                st.progress(min(max(score, 0), 100) / 100, text=f"{label} · {score:.1f}")


def show_analysis(analysis: Analysis, original: bytes, view_key: str, request: Request | None = None):
    result = analysis.result
    if result.status != "insufficient_evidence":
        for warning in ("CLIPPED", "LOW_SIGNAL", "CREPE_UNAVAILABLE"):
            if warning in result.warnings:
                st.warning(_WARNINGS[warning])
    with st.container(key="results_layout"):
        detail, summary = st.columns([1.8, 1], gap="medium")
        with detail:
            feedback, score, references, evidence = st.tabs(["Feedback", "Written score", "References", "Diagnostics"])
            with feedback:
                _findings(analysis, original, view_key)
            with score:
                _score(analysis, request)
            with references:
                _references(analysis)
            with evidence:
                _diagnostics(analysis)
        with summary:
            _grade_summary(analysis)
