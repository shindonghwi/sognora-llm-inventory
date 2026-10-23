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

    def test_claude_tics_fire_on_complaints_and_stay_quiet_on_literal_use(self):
        sys.path.insert(0, str(SCRIPTS))
        import detect_en
        cases = json.loads((FIXTURES / "detect_en_claude_tics.json").read_text(encoding="utf-8"))
        for case in cases:
            with self.subTest(case=case["name"]):
                proc = run_script("detect_en.py", "-", "--genre", case["genre"], "--json", stdin=case["text"])
                findings = json.loads(proc.stdout)["files"][0]["findings"]
                got = {f["rule"]: f["severity"] for f in findings if f["rule"] in detect_en.CLAUDE_TICS}
                self.assertEqual(got, case["expect"])

    def test_contrast_frame_within_human_density_is_not_flagged(self):
        # 사람 대화문 최대치(1천 단어당 1.15회) 이하의 "It's not X, it's Y" 한 번은 세지 않는다
        filler = "We moved the build to a faster machine and kept the old one as a spare. " * 70
        text = filler + "It's not about the brace format, it's about agreeing on one."
        proc = run_script("detect_en.py", "-", "--genre", "prose", "--json", stdin=text)
        self.assertNotIn("ENH17", {f["rule"] for f in json.loads(proc.stdout)["files"][0]["findings"]})

    def test_gate_rolls_back_rewrite_that_injects_claude_tics(self):
        with tempfile.TemporaryDirectory() as d:
            before, after = Path(d, "before.txt"), Path(d, "after.txt")
            before.write_text("Relay sorts shared email into one queue. Two people can't answer the same "
                              "thread, so customers get one reply.", encoding="utf-8")
            after.write_text("Relay sorts shared email into one queue. It's not chaos — it's clarity. Two people "
                             "can't answer the same thread, so customers get one reply.", encoding="utf-8")
            proc = run_script("change_rate_en.py", before, after, "--json")
            self.assertEqual(proc.returncode, 2, proc.stdout)
            report = json.loads(proc.stdout)
            self.assertIn("AI 티 유입", report["verdict"])
            self.assertTrue({"ENH17", "ENH18"} <= {x["rule"] for x in report["injected"]})

    def test_gate_accepts_removing_claude_tics(self):
        # "It's not X, it's Y"를 걷어낸 것은 수사적 부정을 푼 것이지 사실의 부정 소실이 아니다
        with tempfile.TemporaryDirectory() as d:
            before, after = Path(d, "before.txt"), Path(d, "after.txt")
            before.write_text("Relay is not another inbox, it's a shared queue for your support team. Two people "
                              "can't answer the same thread, so customers get one reply.", encoding="utf-8")
            after.write_text("Relay is a shared queue for your support team. Two people can't answer the same "
                             "thread, so customers get one reply.", encoding="utf-8")
            proc = run_script("change_rate_en.py", before, after, "--json")
            report = json.loads(proc.stdout)
            self.assertNotEqual(proc.returncode, 2, proc.stdout)
            self.assertEqual(report["injected"], [])
            self.assertEqual(report["invariant_breaks"], [])
            # 사실을 부정한 문장의 부정 소실은 계속 막는다
            before.write_text("Refunds are not available after 30 days.", encoding="utf-8")
            after.write_text("Refunds are available after 30 days.", encoding="utf-8")
            self.assertEqual(run_script("change_rate_en.py", before, after).returncode, 2)

    def test_gate_warns_when_em_dashes_turn_into_colons(self):
        # 엠대시를 콜론·세미콜론으로 기계적으로 바꾸는 것은 같은 버릇의 이동이다
        with tempfile.TemporaryDirectory() as d:
            before, after = Path(d, "before.txt"), Path(d, "after.txt")
            before.write_text("Relay sorts shared email into one queue — so two people never answer the same "
                              "thread, and every customer gets exactly one reply from the team.", encoding="utf-8")
            after.write_text("Relay sorts shared email into one queue; so two people never answer the same "
                             "thread, and every customer gets exactly one reply from the team.", encoding="utf-8")
            proc = run_script("change_rate_en.py", before, after, "--json")
            self.assertEqual(proc.returncode, 1, proc.stdout)
            self.assertIn("SWAP", {x["rule"] for x in json.loads(proc.stdout)["injected"]})
            # 금지 뒤에 나온다고 보고된 엔대시 치환도 같은 버릇이다
            after.write_text("Relay sorts shared email into one queue – so two people never answer the same "
                             "thread, and every customer gets exactly one reply from the team.", encoding="utf-8")
            proc = run_script("change_rate_en.py", before, after, "--json")
            self.assertIn("SWAP", {x["rule"] for x in json.loads(proc.stdout)["injected"]})

    def test_gate_warns_on_humanizer_injections(self):
        # 휴머나이저 리뷰가 묘사한 출력: 이모지, 단편문, 소문자 시작, 브랜드명을 다른 말로 치환
        with tempfile.TemporaryDirectory() as d:
            before, after = Path(d, "before.txt"), Path(d, "after.txt")
            before.write_text("Relay sorts shared email for Acme into one queue. Two people can't answer the "
                              "same thread, so customers get one reply.", encoding="utf-8")
            after.write_text("Relay sorts shared email for the company into one queue. Simple. two people can't "
                             "answer the same thread, so customers get one reply 🚀", encoding="utf-8")
            proc = run_script("change_rate_en.py", before, after, "--json")
            self.assertEqual(proc.returncode, 1, proc.stdout)
            self.assertTrue({"EMOJI", "FRAGMENT", "LOWER", "NAME"} <= {x["rule"] for x in json.loads(proc.stdout)["injected"]})

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
