import json
import subprocess
import sys
import tempfile
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

    def test_claude_tics_fire_on_complaints_and_stay_quiet_on_literal_use(self):
        # 병원 책자 사고: "다섯 축은 따로 놀지 않습니다. … 그래서 다섯 축을 '함께' 봅니다."가 🔴0으로 통과했다
        sys.path.insert(0, str(SCRIPTS))
        import detect_ko
        cases = json.loads((FIXTURES / "detect_ko_claude_tics.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                proc = run_script("detect_ko.py", "-", "--genre", case["genre"], "--json", stdin=case["text"])
                findings = json.loads(proc.stdout)["files"][0]["findings"]
                got = {f["rule"]: f["severity"] for f in findings if f["rule"] in detect_ko.CLAUDE_TICS}
                self.assertEqual(got, case["expect"])

    def test_gate_rolls_back_rewrite_that_injects_claude_tics(self):
        with tempfile.TemporaryDirectory() as d:
            before, after = Path(d, "before.txt"), Path(d, "after.txt")
            before.write_text("다섯 가지 생활 습관은 서로 영향을 줍니다. 늦게 자면 식욕이 흐트러지고, "
                              "운동이 줄면 잠의 질이 떨어집니다.", encoding="utf-8")
            after.write_text("다섯 가지 생활 습관은 서로 영향을 줍니다. 늦게 자면 식욕이 흐트러지고, "
                             "운동이 줄면 잠의 질이 떨어집니다. 그래서 다섯 축을 함께 봅니다.", encoding="utf-8")
            proc = run_script("change_rate.py", before, after, "--json")
            self.assertEqual(proc.returncode, 2, proc.stdout)
            report = json.loads(proc.stdout)
            self.assertIn("AI 티 유입", report["verdict"])
            self.assertTrue({"KOH24", "KOH27", "KOH30"} <= {x["규칙"] for x in report["injected"]})

    def test_gate_accepts_removing_claude_tics(self):
        # "따로 놀지 않습니다" → "서로 맞물려 있어서"는 수사적 부정을 푼 것이지 사실의 부정 소실이 아니다
        with tempfile.TemporaryDirectory() as d:
            before, after = Path(d, "before.txt"), Path(d, "after.txt")
            before.write_text("다섯 축은 따로 놀지 않습니다. 늦게 자면 식욕이 흐트러지고, 운동이 줄면 "
                              "잠의 질이 떨어집니다. 그래서 다섯 축을 '함께' 봅니다.", encoding="utf-8")
            after.write_text("다섯 가지는 서로 맞물려 있어서 한꺼번에 살펴야 합니다. 늦게 자면 식욕이 "
                             "흐트러지고, 운동이 줄면 잠의 질이 떨어집니다.", encoding="utf-8")
            proc = run_script("change_rate.py", before, after, "--json")
            report = json.loads(proc.stdout)
            self.assertNotEqual(proc.returncode, 2, proc.stdout)
            self.assertEqual(report["injected"], [])
            self.assertEqual(report["invariant_breaks"], [])
            # 사실을 부정한 문장의 부정 소실은 계속 막는다
            before.write_text("환불은 되지 않습니다.", encoding="utf-8")
            after.write_text("환불은 됩니다.", encoding="utf-8")
            self.assertEqual(run_script("change_rate.py", before, after).returncode, 2)

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
