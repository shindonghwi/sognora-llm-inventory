import json
import subprocess
import sys
import unittest
from pathlib import Path


SKILL = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL / "scripts"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def run_script(name, *args, stdin=None):
    return subprocess.run(
        [sys.executable, str(SCRIPTS / name), *map(str, args)],
        input=stdin,
        text=True,
        capture_output=True,
        check=False,
    )


class EnglishHumanizeRegressions(unittest.TestCase):
    def test_known_patterns_and_concrete_controls(self):
        cases = json.loads((FIXTURES / "detect_en_cases.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                proc = run_script("detect_en.py", "-", "--genre", case.get("genre", "landing"),
                                  "--json", stdin=case["text"])
                report = json.loads(proc.stdout)
                findings = report["files"][0]["findings"]
                expected = [item for item in findings if item["rule"] == case["expect_rule"]]
                if case["expect_rule"]:
                    self.assertEqual(len(expected), 1)
                    self.assertEqual(expected[0]["severity"], case["severity"])
                    self.assertEqual(proc.returncode, 1 if case["severity"] == "red" else 0)
                else:
                    self.assertEqual(findings, [])
                    self.assertEqual(proc.returncode, 0)
                self.assertTrue(report["requiresSemanticReview"])

    def test_bilingual_detector_combines_korean_and_english(self):
        proc = run_script("detect_bilingual.py", FIXTURES / "mixed_copy.txt", "--genre", "landing", "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
        findings = json.loads(proc.stdout)["files"][0]["findings"]
        self.assertIn(("ko", "KOH23"), {(item["language"], item["rule"]) for item in findings})
        self.assertIn(("en", "ENH01"), {(item["language"], item["rule"]) for item in findings})

    def test_bilingual_detector_rejects_message_file_without_genre(self):
        proc = run_script("detect_bilingual.py", FIXTURES / "message_without_genre.ts", "--json")
        self.assertEqual(proc.returncode, 2)
        self.assertIn("not evaluated", proc.stderr)

    def test_change_gate_rejects_number_changes(self):
        proc = run_script("change_rate_en.py", FIXTURES / "change_before.txt",
                          FIXTURES / "change_after_number.txt", "--json")
        self.assertEqual(proc.returncode, 2, proc.stderr or proc.stdout)
        report = json.loads(proc.stdout)
        self.assertTrue(any(item["kind"] == "numbers" for item in report["invariant_breaks"]))

    def test_short_copy_over_fifty_percent_is_rejected(self):
        proc = run_script("change_rate_en.py", FIXTURES / "short_before.txt",
                          FIXTURES / "change_after_rewrite.txt", "--json")
        self.assertEqual(proc.returncode, 2, proc.stderr or proc.stdout)
        report = json.loads(proc.stdout)
        self.assertGreater(report["change_rate"], 50.0)
        self.assertIn("변경률", report["verdict"])


if __name__ == "__main__":
    unittest.main()
