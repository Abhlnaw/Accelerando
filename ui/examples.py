import streamlit as st

from contracts import InputError
import pipeline
from pipeline import Request
from ui.design import intro
from ui.intake import analysis_action, invalidate_changed_take
from ui.score_demo import show_demo


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
            invalidate_changed_take("examples", None)
            st.info("The example library is empty. Upload a performance and matching score to start.")
            st.page_link("ui/practice.py", label="Go to Practice", icon=":material/mic:")
            return
        piece_ids = [item["piece_id"] for item in pieces]
        saved_piece = st.session_state.get("saved_example_piece", piece_ids[0])
        selected_piece = saved_piece if saved_piece in piece_ids else piece_ids[0]
        titles = {item["piece_id"]: item.get("title", item["piece_id"]) for item in pieces}
        selected_piece = st.selectbox("Piece", piece_ids, index=piece_ids.index(selected_piece),
                                      format_func=titles.get)
        st.session_state.saved_example_piece = selected_piece
        piece = pieces[piece_ids.index(selected_piece)]
        title = piece.get("title", selected_piece)
        recordings = piece.get("takes", [])
        if not recordings:
            st.info("This piece has no bundled performances yet.")
            analysis_action("examples", title, None)
            return
        with st.container(border=True, key="example_player"):
            comparison = "With reference recording" if piece.get("references") or piece.get("reference_path") else "Score-only analysis"
            st.caption(f"{excerpt_label(piece)} · {comparison}")
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
            analysis_action("examples", f"{title} · {recording['label']}", request, piece_title=title)
        show_demo(request.score_bytes)
        st.download_button("Download MusicXML", request.score_bytes, request.score_name,
                           mime="application/vnd.recordare.musicxml+xml")
    except (InputError, OSError, KeyError) as exc:
        st.error(f"Cannot open this example. {exc}")
        analysis_action("examples", "Example", None)


examples()
