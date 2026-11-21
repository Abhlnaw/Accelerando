import streamlit as st

from pipeline import Request
from ui.design import intro
from ui.intake import analysis_action


def remember_upload(widget_key: str, storage_key: str):
    value = st.session_state.get(widget_key)
    st.session_state[storage_key] = None if value is None else (value.name, value.getvalue())


def upload_field(label: str, formats: list[str], storage_key: str, hint: str):
    widget_key = f"{storage_key}_{st.session_state.get('upload_generation', 0)}"
    value = st.file_uploader(
        label, type=formats, key=widget_key, on_change=remember_upload, args=(widget_key, storage_key),
        label_visibility="collapsed",
    )
    st.caption(hint)
    if value is not None:
        st.session_state[storage_key] = (value.name, value.getvalue())
    selected = st.session_state.get(storage_key)
    if selected and value is None:
        st.text(f"Selected · {selected[0]}")
    return selected


def clear_files():
    for key in ("practice_wav", "practice_score"):
        st.session_state.pop(key, None)
    st.session_state.upload_generation = st.session_state.get("upload_generation", 0) + 1


def practice():
    intro("Practice", "Pair one unaccompanied recording with the score you played.")
    with st.container(key="practice_files"):
        audio_column, score_column = st.columns(2, gap="medium")
        with audio_column:
            with st.container(border=True, key="audio_upload"):
                st.subheader("Your performance", anchor=False)
                audio = upload_field("Your performance", ["wav"], "practice_wav", "PCM WAV · Up to 45 seconds and 25 MiB")
        with score_column:
            with st.container(border=True, key="score_upload"):
                st.subheader("Matching MusicXML", anchor=False)
                score = upload_field("Matching MusicXML", ["musicxml", "xml"], "practice_score",
                                     "MusicXML or XML · Single melodic part in concert pitch · Up to 5 MiB")
    if audio or score:
        st.button("Clear files", on_click=clear_files)
    if audio:
        with st.container(border=True, key="practice_preview"):
            st.subheader("Listen before you analyze", anchor=False)
            st.text(audio[0])
            st.audio(audio[1], format="audio/wav")
    request = Request(audio[1], score[1], audio[0], score[0]) if audio and score else None
    if request is None:
        st.caption("Add both files to enable analysis.")
    analysis_action("practice", audio[0] if audio else "Your performance", request)


practice()
