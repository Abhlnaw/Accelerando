from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from streamlit.testing.v1 import AppTest

from contracts import Result, Take
from pipeline import Analysis, IntegrationError


ROOT = Path(__file__).resolve().parents[1]


def open_app(page: str | None = None, timeout: int = 30):
    app = AppTest.from_file(str(ROOT / "app.py"), default_timeout=timeout)
    if page:
        app.switch_page(f"ui/{page}.py")
    return app.run()


class AppTests(unittest.TestCase):
    def test_finishing_microphone_take_runs_assessment_with_selected_score(self):
        score = SimpleNamespace(name="score.xml", getvalue=lambda: b"score")
        recording = SimpleNamespace(name="recording.wav", getvalue=lambda: b"mic samples")
        analysis = Analysis(Result("ok", 91), Take("test"), [], {})
        with patch("streamlit.file_uploader", side_effect=lambda label, **kwargs:
                   score if label == "Matching MusicXML" else None), \
             patch("streamlit.audio_input", return_value=recording), \
             patch("pipeline.run_analysis", return_value=analysis) as run:
            app = open_app("practice")
            app.radio[0].set_value("Microphone").run()
            self.assertFalse(app.exception)
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0].audio_bytes, b"mic samples")
            self.assertEqual(app.session_state["completed_analysis"].analysis.result.grade, 91)

    def test_studio_and_empty_results(self):
        app = open_app()
        self.assertFalse(app.exception)
        self.assertIn("Start a practice take", [item.label for item in app.button])
        app.switch_page("ui/results.py").run()
        self.assertFalse(app.exception)
        self.assertIn("Analyze a take to get feedback", [item.value for item in app.subheader])

    def test_real_example_displays_measure_two_and_reference(self):
        app = open_app("examples", timeout=60)
        app.radio[0].set_value(2).run()
        app.button(key="analyze_examples").click().run()
        self.assertFalse(app.exception)
        self.assertFalse(app.error)
        self.assertTrue(any("Measure 2" in h.value for h in app.subheader))
        self.assertEqual([tab.label for tab in app.tabs], ["Feedback", "Written score", "References", "Diagnostics"])
        take = app.session_state["completed_analysis"]
        self.assertAlmostEqual(take.analysis.result.grade, 10 * 96.5 ** 0.5, places=1)
        self.assertTrue(take.analysis.result.reference_observations)
        app.switch_page("ui/guide.py").run()
        app.switch_page("ui/results.py").run()
        self.assertIn("Measure 2", [item.value for item in app.subheader])

    def test_changed_upload_clears_grade_and_reruns_do_not_analyze(self):
        audio = SimpleNamespace(name="same.wav", getvalue=lambda: b"first recording")
        score = SimpleNamespace(name="score.musicxml", getvalue=lambda: b"score")
        analysis = Analysis(Result("ok", 91), Take("test"), [], {})

        def upload(label, **kwargs):
            return audio if label == "Your performance" else score

        with patch("streamlit.file_uploader", side_effect=upload), \
             patch("pipeline.run_analysis", return_value=analysis) as run:
            app = open_app("practice")
            run.assert_not_called()
            app.button(key="analyze_practice").click().run()
            self.assertFalse(app.exception)
            self.assertEqual(run.call_count, 1)
            self.assertEqual(app.session_state["completed_analysis"].analysis.result.grade, 91)
            app.switch_page("ui/results.py").run()
            self.assertEqual(run.call_count, 1)
            audio.getvalue = lambda: b"second recording with identical filename"
            app.switch_page("ui/practice.py").run()
            self.assertNotIn("completed_analysis", app.session_state)
            self.assertEqual(run.call_count, 1)

    def test_missing_owner_reports_error_without_grade(self):
        audio = SimpleNamespace(name="take.wav", getvalue=lambda: b"audio")
        score = SimpleNamespace(name="score.xml", getvalue=lambda: b"score")
        with patch("streamlit.file_uploader", side_effect=lambda label, **kwargs:
                   audio if label == "Your performance" else score), \
             patch("pipeline.run_analysis", side_effect=IntegrationError("audio.extract is unavailable")):
            app = open_app("practice")
            app.button(key="analyze_practice").click().run()
            self.assertFalse(app.exception)
            self.assertIn("audio.extract", app.error[0].value)
            self.assertNotIn("completed_analysis", app.session_state)

    def test_development_preview_is_separate_from_results(self):
        app = open_app("guide")
        self.assertFalse(app.exception)
        app.checkbox[0].check().run()
        self.assertFalse(app.exception)
        self.assertTrue(any("Development fixture" in w.value for w in app.warning))
        self.assertNotIn("completed_analysis", app.session_state)
        self.assertIn("Feedback", [tab.label for tab in app.tabs])

    def test_example_catalog_absent_is_actionable(self):
        with patch("pipeline.load_catalog", return_value=[]):
            app = open_app("examples")
            self.assertFalse(app.exception)
            self.assertTrue(app.info)
            self.assertFalse(app.button)
