import streamlit as st

from ui.design import asset_url


def studio():
    artwork = asset_url("grand-piano.webp", "image/webp")
    with st.container(key="studio_hero"):
        st.html(f"""
            <style>.st-key-studio_hero {{ --piano-photo: url("{artwork}"); }}</style>
            <div class="hero-copy">
                <p class="overline">Solo music practice</p>
                <h1>Make your next<br><em>take count.</em></h1>
                <p class="hero-description">Play a phrase, see how it lines up with the score,
                    and hear exactly where to focus your next take.</p>
            </div>
        """)
        with st.container(horizontal=True, gap="small", key="studio_actions"):
            if st.button("Start a practice take", type="primary", icon=":material/arrow_forward:"):
                st.switch_page("ui/practice.py")
            if st.button("Explore examples"):
                st.switch_page("ui/examples.py")

    st.header("Your practice room", anchor=False)
    with st.container(key="studio_paths"):
        columns = st.columns(3, gap="medium")
        destinations = (
            ("Practice with your score", "Pair a solo WAV with its MusicXML score.", "ui/practice.py", ":material/mic:", "Upload a take"),
            ("Try an example", "Compare a steady take, an expressive slowdown, and a pitch variation.", "ui/examples.py", ":material/library_music:", "Browse examples"),
            ("Review your feedback", "Replay a flagged passage and see the evidence behind your grade.", "ui/results.py", ":material/analytics:", "Open results"),
        )
        for column, (title, copy, page, icon, label) in zip(columns, destinations):
            with column:
                with st.container(border=True, key=f"studio_{page[3:-3]}_card"):
                    st.subheader(title, anchor=False)
                    st.write(copy)
                    st.page_link(page, label=label, icon=icon)


studio()
