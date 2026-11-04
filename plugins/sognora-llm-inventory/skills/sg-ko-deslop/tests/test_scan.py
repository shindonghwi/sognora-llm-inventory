"""sg-ko-deslop 검사기 회귀 테스트 — python3 -m unittest discover -s <이 폴더> -p 'test_*.py'"""
import collections
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCAN = os.path.join(HERE, '..', 'scripts', 'scan.py')
CASES = os.path.join(HERE, 'fixtures', 'cases.json')
RANK = {'🔴': 1, '🟡': 2, '⚪': 3}


def run(*args):
    return subprocess.run([sys.executable, SCAN, *args], capture_output=True, text=True)


def write(tmp, name, text):
    path = os.path.join(tmp, name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    return path


class Cases(unittest.TestCase):
    def test_cases(self):
        with open(CASES, encoding='utf-8') as f:
            cases = json.load(f)
        for c in cases:
            with self.subTest(c['name']), tempfile.TemporaryDirectory() as tmp:
                path = write(tmp, 'case' + c.get('ext', '.md'), c['text'])
                r = run(path, '--genre', c['genre'], '--level', '적극', '--json')
                self.assertIn(r.returncode, (0, 1), r.stderr)
                hits = json.loads(r.stdout)['files'][0]['hits']
                worst, count = {}, collections.Counter()
                for h in hits:
                    count[h['rule']] += 1
                    if h['rule'] not in worst or RANK[h['sev']] < RANK[worst[h['rule']]]:
                        worst[h['rule']] = h['sev']
                for rule, sev in c.get('expect', {}).items():
                    self.assertEqual(worst.get(rule), sev, f'{rule}: {hits}')
                for rule, n in c.get('count', {}).items():
                    self.assertEqual(count[rule], n, f'{rule}: {hits}')
                for rule in c.get('absent', []):
                    self.assertNotIn(rule, worst, f'{rule}: {hits}')


class ReadAloudIntegration(unittest.TestCase):
    def test_optional_analysis_and_structured_script(self):
        with tempfile.TemporaryDirectory() as tmp:
            module = os.path.join(tmp, 'kiwipiepy.py')
            with open(module, 'w', encoding='utf-8') as f:
                f.write("class Token:\n def __init__(self, form, tag): self.form, self.tag = form, tag\n"
                        "class Kiwi:\n def tokenize(self, sentences):\n  return [[Token('금', 'NNG'), Token('이', 'JKS'), Token('227', 'SN'), Token('톤', 'NNG')] for s in sentences]\n")
            path = write(tmp, 'script.md', '# 제목\n그림: 아빠가 혼자 식탁에.\n- 모인 금이 227톤.\n')
            env = dict(os.environ, PYTHONPATH=tmp)
            r = subprocess.run([sys.executable, SCAN, path, '--genre', '대본', '--json'],
                               capture_output=True, text=True, env=env)
            self.assertEqual(r.returncode, 1, r.stderr)
            hits = json.loads(r.stdout)['files'][0]['hits']
            self.assertEqual(sum(h['rule'] == 'R1' for h in hits), 1)
            self.assertFalse(any(h['rule'] == 'P6' for h in hits))

    def test_missing_dependency_keeps_json_valid(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write(tmp, 'script.md', '그렇게 모인 금이 227톤입니다.\n')
            r = subprocess.run([sys.executable, '-S', SCAN, path, '--genre', '대본', '--json'],
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            json.loads(r.stdout)
            self.assertIn('낭독 검토 건너뜀', r.stderr)


class ExitCodes(unittest.TestCase):
    def test_red_is_1_clean_is_0(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(run(write(tmp, 'a.md', '결론적으로 좋습니다.\n'), '--genre', '글').returncode, 1)
            self.assertEqual(run(write(tmp, 'b.md', '지표 7개를 기간별로 산출합니다.\n'), '--genre', '글').returncode, 0)

    def test_unscanned_is_2_not_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(run(os.path.join(tmp, 'none.md')).returncode, 2)
            self.assertEqual(run(write(tmp, 'a.docx', '결론적으로')).returncode, 2)
            os.mkdir(os.path.join(tmp, 'empty'))
            self.assertEqual(run(os.path.join(tmp, 'empty')).returncode, 2)

    def test_unknown_genre_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(run(write(tmp, 'a.md', '글'), '--genre', 'ui').returncode, 2)


class GenreGuess(unittest.TestCase):
    def guess(self, rel, text='본문입니다.\n'):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            write(os.path.dirname(path), os.path.basename(path), text)
            return json.loads(run(path, '--json').stdout)['files'][0]['genre']

    def test_paths(self):
        self.assertEqual(self.guess('발표/대본.md'), '대본')
        self.assertEqual(self.guess('youtube/ep1.md'), '영상')
        self.assertEqual(self.guess('ep1.srt', '1\n00:00:01,000 --> 00:00:02,000\n안녕\n'), '영상')
        self.assertEqual(self.guess('src/messages/ko/a.json', '{"a": "저장"}'), '화면')
        self.assertEqual(self.guess('제안서/content/1장.md'), '제안서')
        self.assertEqual(self.guess('발표/deck.html', '<h1>사업 이해</h1>'), '발표')
        self.assertEqual(self.guess('notes/memo.md'), '글')
        self.assertEqual(self.guess('유튜브/댓글.md'), '댓글')
        self.assertEqual(self.guess('쇼츠/채널 설명.txt'), '댓글')
        self.assertEqual(self.guess('src/댓글.tsx', 'const a = "저장";\n'), '화면')


class JsonShape(unittest.TestCase):
    """다른 프로젝트의 호출이 이 모양을 읽는다."""

    def test_hit_fields_and_line_numbers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write(tmp, 'c.md', '짧은 줄\n배경은 이렇습니다\n')
            r = run(path, '--genre', '댓글', '--json')
        self.assertEqual(r.returncode, 1, r.stderr)
        hit = json.loads(r.stdout)['files'][0]['hits'][0]
        self.assertEqual(hit['loc'], '2')
        self.assertEqual(hit['sev'], '🔴')
        self.assertEqual(hit['rule'], 'C2')
        self.assertEqual(hit['name'], '머리말')
        self.assertEqual(hit['match'], '배경은')
        self.assertEqual(hit['text'], '배경은 이렇습니다')


class Gate(unittest.TestCase):
    BEFORE = '1년 치 762건에서 0.065초. SFR-002 v1 기준이다.\n'

    def gate(self, after, genre='제안서'):
        with tempfile.TemporaryDirectory() as tmp:
            return run('gate', write(tmp, 'b.md', self.BEFORE), write(tmp, 'a.md', after), '--genre', genre)

    def test_same_facts_pass(self):
        r = self.gate('SFR-002 v1 기준, 1년 치 762건에서 0.065초다.\n')
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_changed_number_fails(self):
        r = self.gate('1년 치에서 0.07초. SFR-002 v1 기준이다.\n')
        self.assertEqual(r.returncode, 1)
        self.assertIn('762건', r.stdout)
        self.assertIn('0.065초', r.stdout)

    def test_new_tell_fails(self):
        r = self.gate('1년 치 762건에서 0.065초를 혁신적으로 달성했다. SFR-002 v1 기준이다.\n')
        self.assertEqual(r.returncode, 1)
        self.assertIn('G-D4', r.stdout)


class ReportGate(unittest.TestCase):
    BEFORE = '## 외울 숫자\n- 표준 18항목, 검사 12규칙\n- 365만 건에서 0.065초\n표준 항목 18개로 맞추고 365만 건에서 0.065초였습니다.\n'

    def gate(self, after):
        with tempfile.TemporaryDirectory() as tmp:
            return run('gate', write(tmp, 'b.md', self.BEFORE), write(tmp, 'a.md', after), '--genre', '보고')

    def test_dropping_a_repeat_passes(self):
        r = self.gate('운행 기록을 표준 항목 18개로 맞추고 규칙 12개로 거릅니다. 365만 건을 넣어도 0.065초였어요.\n')
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_losing_a_value_fails(self):
        r = self.gate('운행 기록을 표준 항목 18개로 맞추고 규칙 12개로 거릅니다. 1년 치를 넣어도 빨랐어요.\n')
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn('0.065', r.stdout)


class CommentGate(unittest.TestCase):
    BEFORE = '10월 27일 외교부 국감에서\n13상자를 보냈거든요\n'

    def gate(self, after, genre='댓글'):
        with tempfile.TemporaryDirectory() as tmp:
            return run('gate', write(tmp, 'b.md', self.BEFORE), write(tmp, 'a.md', after), '--genre', genre)

    def test_dropping_a_date_warns_and_passes(self):
        r = self.gate('13상자를 보냈거든요\n')
        self.assertEqual(r.returncode, 0, r.stdout)
        self.assertIn('10월', r.stdout)
        self.assertIn('27일', r.stdout)

    def test_changed_number_still_fails(self):
        r = self.gate('14상자를 보냈거든요\n')
        self.assertEqual(r.returncode, 1, r.stdout)
        self.assertIn('14', r.stdout)

    def test_new_number_still_fails(self):
        r = self.gate('10월 27일 외교부 국감에서\n13상자를 3번 보냈거든요\n')
        self.assertEqual(r.returncode, 1, r.stdout)

    def test_other_genres_keep_the_strict_gate(self):
        self.assertEqual(self.gate('13상자를 보냈거든요\n', genre='영상').returncode, 1)


if __name__ == '__main__':
    unittest.main()
