import streamlit as st

from ui.design import intro
from ui.review import show_analysis


def guide():
    intro("How it works", "Learn what the grade measures and how to get a recording the app can assess.")
    with st.container(key="guide_cards"):
        audio, matching = st.columns(2, gap="medium")
        with audio:
            with st.container(border=True, key="guide_listen"):
                st.subheader("Listen for the pitch", anchor=False)
                st.write("Accelerando runs the pretrained CREPE model on short slices of audio. "
                         "It groups nearby estimates into notes and keeps their original time for replay.")
        with matching:
            with st.container(border=True, key="guide_evaluate"):
                st.subheader("Match the written notes", anchor=False)
                st.write("Detected notes are aligned with the MusicXML score. The grader estimates tempo "
                         "from nearby notes so an expressive slowdown can still score well.")
    with st.container(border=True, key="guide_weights"):
        st.subheader("What the grade measures", anchor=False)
        st.markdown(
            "The overall grade is 10 times the square root of the weighted score. For example, 64 becomes 80.\n\n- **Pitch accuracy, 50%.** How close the played pitches were to the written ones.\n"
            "- **Note coverage, 30%.** How much of the score was played, accounting for extra and missed notes.\n"
            "- **Local rhythm, 20%.** How closely note attacks follow nearby beats in your take."
        )
        st.caption("The grade uses the available evidence. Sparse or silent takes may receive no grade.")
    st.subheader("Get a usable recording", anchor=False)
    st.markdown(
        "- Record one melody without accompaniment.\n"
        "- Export a PCM WAV up to 45 seconds and 25 MiB.\n"
        "- Upload the matching MusicXML score. Accelerando compares written parts, voices and chord tones "
        "against your recorded pitches to identify the line you practiced."
    )
    st.caption("Analysis runs on the machine hosting this app. Results stay in the active browser session.")
    with st.container(border=True):
        st.subheader("Practice live on Android", anchor=False)
        st.write("The standalone tablet app follows your playing through the microphone. "
                 "Pick a piece from the music library, tap a measure to rehearse it, "
                 "and choose expressive practice or a target tempo. Finish the take "
                 "to replay feedback and compare attempts in your on-device practice log.")
        st.link_button("Android setup and installation",
                       "https://github.com/Abhlnaw/Accelerando/blob/main/android/README.md")
    if st.checkbox("Show development preview"):
        from development_preview import preview

        st.warning("Development fixture. This preview contains synthetic audio and invented results.")
        analysis, original = preview()
        show_analysis(analysis, original, "preview")


guide()
