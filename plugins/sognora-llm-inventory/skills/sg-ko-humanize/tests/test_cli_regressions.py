"""감사(2026-09-03)에서 나온 CLI 결함의 회귀 테스트."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL / "scripts"


def run(name, *args, stdin=None):
    return subprocess.run([sys.executable, str(SCRIPTS / name), *map(str, args)], input=stdin, text=True, capture_output=True, check=False)


class CliRegressions(unittest.TestCase):
    def test_change_rate_accepts_mode_equals_and_mode_space(self):
        # SKILL.md가 `--mode=code`로 적었는데 파서가 `--mode code`만 받아 exit 3이 나던 사고
        with tempfile.TemporaryDirectory() as d:
            a, b = Path(d, "a.txt"), Path(d, "b.txt")
            a.write_text("서비스는 사진을 저장합니다.", encoding="utf-8")
            b.write_text("서비스가 사진을 저장합니다.", encoding="utf-8")
            for flag in (["--mode=text"], ["--mode", "text"]):
                proc = run("change_rate.py", a, b, *flag)
                self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)
            self.assertEqual(run("change_rate.py", a, b, "--mode=weird").returncode, 3)

    def test_detect_ko_rejects_unknown_genre_instead_of_silently_passing(self):
        # 영문 `landing`/소문자 `ui` 오타가 UI 계열 밖으로 떨어져 큰따옴표 마스킹으로 🔴0 거짓 통과하던 경로
        copy = 'export const m = { hero: "혁신적인 솔루션을 제공합니다" }'
        with tempfile.TemporaryDirectory() as d:
            f = Path(d, "m.ts"); f.write_text(copy, encoding="utf-8")
            self.assertEqual(run("detect_ko.py", f, "--genre", "landing").returncode, 3)
            self.assertEqual(run("detect_ko.py", f, "--genre", "ui").returncode, 3)
            self.assertEqual(run("detect_ko.py", f).returncode, 2)          # 장르 없음 = 판정 안 함
            self.assertEqual(run("detect_ko.py", f, "--genre", "랜딩").returncode, 1)   # 과장 어휘 🔴
            self.assertEqual(run("detect_ko.py", f, "--genre=랜딩").returncode, 1)

    def test_help_flag_on_every_script(self):
        for name in ("change_rate.py", "detect_ko.py", "locale_parity.py"):
            proc = run(name, "--help")
            self.assertEqual(proc.returncode, 0, name)
            self.assertIn("usage:", proc.stdout, name)


if __name__ == "__main__":
    unittest.main()
