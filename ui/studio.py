import streamlit as st

from ui.design import asset_url
from ui.intake import completed


def studio():
    artwork = asset_url("grand-piano.webp", "image/webp")
    with st.container(key="studio_hero"):
        st.html(f"""
            <style>.st-key-studio_hero {{ --piano-photo: url("{artwork}"); }}</style>
            <div class="hero-copy">
                <p class="overline">Your practice studio</p>
                <h1>Hear the note.<br><em>Find the measure.</em></h1>
                <p class="hero-description">Play a solo melody. Accelerando follows the written score
                    and points you to the moment worth practicing again.</p>
            </div>
        """)
        with st.container(horizontal=True, gap="small", key="studio_actions"):
            if st.button("Try a bundled example", type="primary", icon=":material/play_arrow:"):
                st.switch_page("ui/examples.py")
            if st.button("Start a practice take"):
                st.switch_page("ui/practice.py")

    st.header("Practice between takes", anchor=False)
    with st.container(key="studio_paths"):
        columns = st.columns(3, gap="medium")
        destinations = (
            ("Tune and warm up", "Check your pitch against a drone or set a pulse.", "ui/tools.py", ":material/tune:", "Open practice tools"),
            ("Play a score run", "Follow a written line and track your score as you play.", "ui/game.py", ":material/sports_esports:", "Open score run"),
            ("Review your take", "Listen to the marked passages from your latest take.", "ui/results.py", ":material/analytics:", "Open results")
            if completed() else
            ("Keep a practice journal", "Log your minutes, recurring mistakes and next steps.", "ui/journal.py", ":material/book:", "Open journal"),
        )
        for column, (title, copy, page, icon, label) in zip(columns, destinations):
            with column:
                with st.container(border=True, key=f"studio_{page[3:-3]}_card"):
                    st.subheader(title, anchor=False)
                    st.write(copy)
                    st.page_link(page, label=label, icon=icon)


studio()
