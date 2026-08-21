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


class HumanizeRegressions(unittest.TestCase):
    def test_abstract_linking_warns_without_flagging_concrete_actions(self):
        cases = json.loads((FIXTURES / "detect_ko_cases.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                proc = run_script("detect_ko.py", "-", "--genre", "랜딩", "--json", stdin=case["text"])
                self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
                report = json.loads(proc.stdout)
                findings = report["files"][0]["findings"]
                koh23 = [item for item in findings if item["rule"] == "KOH23"]
                if case["expect_rule"]:
                    self.assertEqual(len(koh23), 1)
                    self.assertEqual(koh23[0]["severity"], "yellow")
                else:
                    self.assertEqual(koh23, [])
                self.assertTrue(report["requiresSemanticReview"])
                self.assertIn("자연스러움과 문맥 적합성", report["scope"])

    def test_english_number_word_matches_korean_digit(self):
        proc = run_script("locale_parity.py", FIXTURES / "locale_number_word.ts", "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
        self.assertEqual(json.loads(proc.stdout)["total"], 0)

    def test_english_number_word_still_detects_real_mismatch(self):
        proc = run_script("locale_parity.py", FIXTURES / "locale_number_word_mismatch.ts", "--json")
        self.assertEqual(proc.returncode, 1, proc.stderr or proc.stdout)
        issues = json.loads(proc.stdout)["files"][0]["issues"]
        self.assertTrue(any(issue["종류"] == "숫자" for issue in issues))

    def test_titlecase_pin_is_not_treated_as_technical_acronym(self):
        proc = run_script("locale_parity.py", FIXTURES / "locale_titlecase_pin.ts", "--json")
        self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
        self.assertEqual(json.loads(proc.stdout)["total"], 0)

    def test_uppercase_pin_is_still_checked_as_technical_acronym(self):
        proc = run_script("locale_parity.py", FIXTURES / "locale_uppercase_pin_mismatch.ts", "--json")
        self.assertEqual(proc.returncode, 1, proc.stderr or proc.stdout)
        issues = json.loads(proc.stdout)["files"][0]["issues"]
        self.assertTrue(any(issue["종류"] == "약어" for issue in issues))

    def test_short_text_over_fifty_percent_is_rejected(self):
        proc = run_script(
            "change_rate.py",
            FIXTURES / "short_before.txt",
            FIXTURES / "short_after.txt",
            "--json",
        )
        self.assertEqual(proc.returncode, 2, proc.stderr or proc.stdout)
        report = json.loads(proc.stdout)
        self.assertGreater(report["change_rate"], 50.0)
        self.assertIn("과윤문", report["verdict"])


if __name__ == "__main__":
    unittest.main()
