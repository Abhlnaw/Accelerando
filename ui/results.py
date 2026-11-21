import streamlit as st

from ui.design import intro
from ui.intake import completed
from ui.review import show_analysis


def results():
    take = completed()
    intro("Results", take.title if take else "Review the score and replay the places you want to practice.")
    if take is None:
        with st.container(border=True, key="empty_results"):
            st.subheader("Analyze a take to get feedback", anchor=False)
            st.write("Start with your own recording or choose one of the bundled examples.")
            st.page_link("ui/practice.py", label="Start a practice take", icon=":material/mic:")
            st.page_link("ui/examples.py", label="Explore examples", icon=":material/library_music:")
        return
    show_analysis(take.analysis, take.request.audio_bytes, take.identity, take.request)
    st.page_link("ui/journal.py", label="Log this practice session", icon=":material/book:")
    st.page_link("ui/practice.py", label="Practice another take", icon=":material/mic:")


results()
