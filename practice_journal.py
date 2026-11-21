"""Persistent journal for the local Streamlit studio."""
from collections import Counter
from contextlib import closing
from pathlib import Path
import json
import sqlite3


DATABASE = Path.home() / ".accelerando" / "journal.sqlite3"


def connect(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY, day TEXT NOT NULL, minutes INTEGER NOT NULL,
        focus TEXT NOT NULL, notes TEXT NOT NULL, piece TEXT NOT NULL,
        grade REAL, mistakes TEXT NOT NULL)""")
    return db


def save(day, minutes, focus, notes, piece, grade, mistakes, path=None):
    if not focus.strip() or not 1 <= minutes <= 1440:
        raise ValueError("Enter what you practiced and a duration between 1 and 1440 minutes.")
    with closing(connect(path or DATABASE)) as db, db:
        db.execute("INSERT INTO sessions VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)",
                   (day.isoformat(), minutes, focus.strip(), notes.strip(), piece, grade,
                    json.dumps(sorted(set(mistakes)))))


def sessions(path=None):
    with closing(connect(path or DATABASE)) as db:
        rows = db.execute("SELECT * FROM sessions ORDER BY day DESC, id DESC")
        return [dict(row) | {"mistakes": json.loads(row["mistakes"])} for row in rows]


def recurring(rows):
    counts = Counter(label for row in rows for label in set(row["mistakes"]))
    return [(label, count) for label, count in counts.most_common() if count >= 2]
