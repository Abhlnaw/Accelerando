from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace

from streamlit.testing.v1 import AppTest
from contracts import Result, Take
from pipeline import Analysis, IntegrationError, load_catalog

ROOT = Path(__file__).resolve().parents[1]


class AppTests(unittest.TestCase):
    def test_real_example_displays_measure_two_and_reference(self):
        app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=60).run()
        app.radio[0].set_value("Try an example").run()
        app.selectbox[1].set_value(load_catalog()[0]["takes"][2]).run()
        app.button[0].click().run()
        self.assertFalse(app.exception)
        self.assertFalse(app.error)
        self.assertEqual(app.metric[0].value, "96.5 / 100")
        self.assertTrue(any("Measure 2" in m.value for m in app.markdown))
        completed = app.session_state["completed"]
        self.assertTrue(completed[1].result.reference_observations)

    def test_changed_upload_clears_grade_and_reruns_do_not_analyze(self):
        audio = SimpleNamespace(name="same.wav", getvalue=lambda: b"first recording")
        score = SimpleNamespace(name="score.musicxml", getvalue=lambda: b"score")
        analysis = Analysis(Result("ok", 91), Take("test"), [], {})
        def upload(label, **kwargs):
            return audio if label == "Your performance" else score
        with patch("streamlit.file_uploader", side_effect=upload), \
             patch("pipeline.run_analysis", return_value=analysis) as run:
            app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=20).run()
            run.assert_not_called()
            app.button[0].click().run()
            self.assertFalse(app.exception)
            self.assertEqual(run.call_count, 1)
            self.assertEqual(app.metric[0].value, "91.0 / 100")
            app.run()
            self.assertEqual(run.call_count, 1)
            audio.getvalue = lambda: b"second recording with identical filename"
            app.run()
            self.assertEqual(len(app.metric), 0)
            self.assertEqual(run.call_count, 1)

    def test_missing_owner_reports_error_without_grade(self):
        audio = SimpleNamespace(name="take.wav", getvalue=lambda: b"audio")
        score = SimpleNamespace(name="score.xml", getvalue=lambda: b"score")
        with patch("streamlit.file_uploader", side_effect=lambda label, **kwargs:
                   audio if label == "Your performance" else score), \
             patch("pipeline.run_analysis", side_effect=IntegrationError("audio.extract is unavailable")):
            app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=20).run()
            app.button[0].click().run()
            self.assertFalse(app.exception)
            self.assertIn("audio.extract", app.error[0].value)
            self.assertEqual(len(app.metric), 0)

    def test_start_preview_and_switch_back_clear_result(self):
        app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=20).run()
        self.assertFalse(app.exception)
        self.assertTrue(app.button[0].disabled)
        app.radio[0].set_value("Development preview").run()
        self.assertFalse(app.exception)
        self.assertTrue(any("DEVELOPMENT FIXTURE" in w.value for w in app.warning))
        self.assertEqual(app.metric[0].value, "88.0 / 100")
        app.radio[0].set_value("Upload my performance").run()
        self.assertFalse(app.exception)
        self.assertEqual(len(app.metric), 0)
        self.assertTrue(app.button[0].disabled)

    def test_example_catalog_absent_is_actionable(self):
        with patch("pipeline.load_catalog", return_value=[]):
            app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=20).run()
            app.radio[0].set_value("Try an example").run()
        self.assertFalse(app.exception)
        self.assertTrue(app.info)
        self.assertTrue(app.button[0].disabled)
