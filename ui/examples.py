import streamlit as st

from contracts import InputError
import pipeline
from pipeline import Request
from ui.design import intro
from ui.intake import analysis_action


def excerpt_label(piece: dict) -> str:
    excerpt = piece.get("excerpt")
    if isinstance(excerpt, dict) and excerpt.get("first_measure") and excerpt.get("last_measure"):
        return f"Measures {excerpt['first_measure']}–{excerpt['last_measure']}"
    return excerpt if isinstance(excerpt, str) else "Solo melody"


def examples():
    intro("Examples", "Listen to a bundled performance, then run it through the same analysis as your own take.")
    try:
        pieces = pipeline.load_catalog()
        if not pieces:
            st.info("The example library is empty. Upload a performance and matching score to start.")
            st.page_link("ui/practice.py", label="Go to Practice", icon=":material/mic:")
            return
        piece_ids = [item["piece_id"] for item in pieces]
        saved_piece = st.session_state.get("saved_example_piece", piece_ids[0])
        selected_piece = saved_piece if saved_piece in piece_ids else piece_ids[0]
        with st.container(key="examples_library"):
            columns = st.columns(min(len(pieces), 2), gap="medium")
            for index, item in enumerate(pieces):
                piece_id = item["piece_id"]
                title = item.get("title", piece_id)
                with columns[index % len(columns)]:
                    with st.container(border=True, key=f"example_card_{index}"):
                        st.caption(excerpt_label(item))
                        st.subheader(title, anchor=False)
                        st.write("Reference available" if item.get("references") or item.get("reference_path")
                                 else "Score-only analysis")
                        if st.button(f"Select {title}", key=f"choose_example_{index}",
                                     disabled=selected_piece == piece_id):
                            st.session_state.saved_example_piece = piece_id
                            st.rerun()
        piece = pieces[piece_ids.index(selected_piece)]
        title = piece.get("title", selected_piece)
        recordings = piece.get("takes", [])
        if not recordings:
            st.info("This piece has no bundled performances yet.")
            analysis_action("examples", title, None)
            return
        with st.container(border=True, key="example_player"):
            st.subheader(f"Listen to {title}", anchor=False)
            saved_take = st.session_state.get(f"saved_recording_{selected_piece}", 0)
            index = st.radio("Performance", list(range(len(recordings))),
                             format_func=lambda i: recordings[i]["label"],
                             index=saved_take if 0 <= saved_take < len(recordings) else 0,
                             key=f"recording_{selected_piece}")
            st.session_state[f"saved_recording_{selected_piece}"] = index
            recording = recordings[index]
            audio_path = pipeline.fixture_path(recording["audio_path"])
            score_path = pipeline.fixture_path(piece["score_path"])
            request = Request(audio_path.read_bytes(), score_path.read_bytes(),
                              audio_path.name, score_path.name)
            st.audio(request.audio_bytes, format="audio/wav")
            st.caption(recording.get("source", piece.get("source", "Source unavailable")))
            st.download_button("Download MusicXML", request.score_bytes, request.score_name,
                               mime="application/vnd.recordare.musicxml+xml")
        analysis_action("examples", f"{title} · {recording['label']}", request)
    except (InputError, OSError, KeyError) as exc:
        st.error(f"Cannot open this example. {exc}")
        analysis_action("examples", "Example", None)


examples()
