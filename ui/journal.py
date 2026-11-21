from datetime import date
import sqlite3

import altair as alt
import pandas as pd
import streamlit as st

import practice_journal as journal
from ui.design import intro
from ui.intake import completed


intro("Practice journal", "Log your sessions and see how your playing develops.")
take = completed()
attach = take and st.checkbox(f"Include assessment from {take.title}", value=take.source == "practice")
result = take.analysis.result if attach else None
with st.form("journal_entry", clear_on_submit=False):
    day = st.date_input("Practice date", max_value=date.today())
    minutes = st.number_input("Minutes practiced", min_value=1, max_value=1440, value=15)
    piece = st.text_input("Piece or exercise", value=take.request.score_name if attach else "",
                          key=f"journal_piece_{take.identity if attach else 'manual'}")
    focus = st.text_input("What did you work on?")
    notes = st.text_area("Personal notes and goals for next time")
    manual = st.multiselect("Mistakes you noticed", ["Pitch", "Rhythm", "Missing notes", "Extra notes", "Articulation"])
    submitted = st.form_submit_button("Save session", type="primary")

try:
    if submitted:
        labels = {"pitch": "Pitch", "rhythm": "Rhythm", "missing": "Missing notes", "extra": "Extra notes"}
        detected = [labels[f.kind] for f in result.findings if f.kind in labels] if result and result.status == "ok" else []
        journal.save(day, minutes, focus, notes, piece.strip(), result.grade if result else None, manual + detected)
        st.success("Session saved.")
    rows = journal.sessions()
except (OSError, sqlite3.Error, ValueError) as error:
    st.error(str(error))
    st.stop()

if not rows:
    st.info("Save your first practice session to start your history.")
else:
    pieces = sorted({r["piece"] for r in rows if r["piece"]})
    selected = st.selectbox("Filter by piece", [None, *pieces], format_func=lambda p: p or "All pieces")
    shown = [r for r in rows if selected is None or r["piece"] == selected]
    frame = pd.DataFrame(shown)
    frame["day"] = pd.to_datetime(frame["day"])
    st.subheader("Practice over time")
    st.bar_chart(frame.groupby("day")["minutes"].sum(), y_label="Minutes practiced")
    graded = frame.dropna(subset=["grade"])
    if not graded.empty:
        st.subheader("Average assessment by practice date")
        chart = alt.Chart(graded).mark_line(point=True).encode(
            x=alt.X("day:T", title="Practice date"),
            y=alt.Y("mean(grade):Q", title="Grade / 100", scale=alt.Scale(domain=[0, 100])),
            color="piece:N", tooltip=["day:T", "piece:N", "mean(grade):Q"],
        )
        st.altair_chart(chart, width="stretch")
    st.subheader("Frequent mistakes")
    patterns = journal.recurring(shown)
    if patterns:
        for label, count in patterns:
            st.write(f"{label} · {count} sessions")
    else:
        st.caption("Patterns appear when a mistake is recorded in at least two sessions.")
    st.subheader("Session history")
    for row in shown:
        with st.expander(f"{row['day']} · {row['minutes']} min · {row['focus']}"):
            if row["piece"]:
                st.text(row["piece"])
            if row["notes"]:
                st.text(row["notes"])
            if row["mistakes"]:
                st.text(", ".join(row["mistakes"]))
            if row["grade"] is not None:
                st.caption(f"Assessment {row['grade']:.1f} / 100")
