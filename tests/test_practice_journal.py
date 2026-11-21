from datetime import date
from pathlib import Path
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

import practice_journal as journal


def test_journal_form_and_trends(tmp_path):
    database = tmp_path / "journal.db"
    journal.save(date(2025, 1, 1), 10, "Entrances", "", "Scale", 80, ["Pitch", "Pitch"], database)
    with patch.object(journal, "DATABASE", database):
        app = AppTest.from_file(str(Path(__file__).resolve().parents[1] / "app.py"), default_timeout=30)
        app.switch_page("ui/journal.py").run()
        assert not app.exception
        app.text_input[0].set_value("Scale")
        app.text_input[1].set_value("A4 entrance")
        app.text_area[0].set_value("Repeat slowly tomorrow")
        app.multiselect[0].set_value(["Pitch"])
        app.button[0].click().run()
        assert not app.exception
    rows = journal.sessions(database)
    assert len(rows) == 2
    assert rows[0]["notes"] == "Repeat slowly tomorrow"
    assert rows[0]["grade"] is None
    assert journal.recurring(rows) == [("Pitch", 2)]
