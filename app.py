"""Run with python -m streamlit run app.py."""

import streamlit as st

from ui.design import apply_theme


def main():
    st.set_page_config(
        page_title="Accelerando",
        page_icon=":material/piano:",
        layout="wide",
        initial_sidebar_state="auto",
    )
    pages = [
        st.Page("ui/studio.py", title="Studio", icon=":material/home:", default=True),
        st.Page("ui/practice.py", title="Practice", icon=":material/mic:", url_path="practice"),
        st.Page("ui/tools.py", title="Practice tools", icon=":material/tune:", url_path="tools"),
        st.Page("ui/technique.py", title="Webcam technique", icon=":material/videocam:", url_path="technique"),
        st.Page("ui/game.py", title="Score run", icon=":material/sports_esports:", url_path="game"),
        st.Page("ui/examples.py", title="Examples", icon=":material/library_music:", url_path="examples"),
        st.Page("ui/results.py", title="Results", icon=":material/analytics:", url_path="results"),
        st.Page("ui/journal.py", title="Practice journal", icon=":material/book:", url_path="journal"),
        st.Page("ui/guide.py", title="How it works", icon=":material/help:", url_path="guide"),
    ]
    current = st.navigation(pages, position="hidden")
    apply_theme()
    with st.sidebar:
        st.html("""
            <div class="studio-brand">
                <div class="piano-mark" aria-hidden="true"><i></i><i></i><i></i></div>
                <span>Accelerando</span>
            </div>
        """)
        for page in pages:
            st.page_link(page)
        st.html("""
            <div class="studio-privacy"><span aria-hidden="true"></span> Local audio analysis</div>
        """)
    current.run()


if __name__ == "__main__":
    main()
