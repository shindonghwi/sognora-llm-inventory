"""CLI regressions from the 2026-09-03 audit."""
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
    def test_detect_en_rejects_unknown_genre(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d, "m.ts"); f.write_text('export const m = { hero: "Everything connects seamlessly in one place." }', encoding="utf-8")
            self.assertEqual(run("detect_en.py", f, "--genre", "Landing").returncode, 3)
            self.assertEqual(run("detect_en.py", f).returncode, 2)
            self.assertEqual(run("detect_en.py", f, "--genre=landing").returncode, 0)   # ENH01 is yellow, not red

    def test_bilingual_maps_korean_only_genres(self):
        proc = run("detect_bilingual.py", "-", "--genre", "법률", "--json", stdin="이 약관은 서비스 이용에 있어 적용된다.")
        self.assertEqual(proc.returncode, 0, proc.stderr or proc.stdout)   # 법률: '에 있어' 면제 → red 0
        self.assertEqual(run("detect_bilingual.py", "-", "--genre", "nope", stdin="x").returncode, 3)

    def test_help_flag_on_every_script(self):
        for name in ("detect_en.py", "detect_bilingual.py", "change_rate_en.py"):
            proc = run(name, "--help")
            self.assertEqual(proc.returncode, 0, name)
            self.assertIn("usage:", proc.stdout, name)


if __name__ == "__main__":
    unittest.main()
