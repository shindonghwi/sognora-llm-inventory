"""readaloud.py SCRIPT.md|TEXT : 낭독 검토. Does every narration sentence read like spoken Korean of the reference channel?

A pattern is flagged only when the 너진똑 subtitle corpus (ref/njt/corpus, 30k sentences) itself almost never ends a sentence that way,
so spoken fragments the channel does use ("그러던 어느 날.", "원효대사는요.") pass, and headline fragments do not.
  R1 🔴 서술어 빠짐   주어·주제(이/가/은/는)가 있는데 서술어 없이 명사·숫자로 끝남      "모인 금이 227톤."  "실업자가 181만 명."
  R2 🟡 숫자 조각     숫자+단위로 끝나고 서술어 없음                                 "210억 달러."  "1달러에 1,962원."
  R3 🟡 낯선 종결어미 코퍼스가 거의 안 쓰는 종결어미                                 "~리라" "~도다" "~노라"
  R4 🟡 한 호흡       쉼표 없이 너무 긴 문장(코퍼스 상위 1% 길이 넘김)
  R5 🟡 문어체 표지   하였/되었다/것이다/에 있어서/로 인해/에 의해/…
  ⚪  정보            어미가 코퍼스에 드묾, 연어 일치 낮음
Script files: only narration lines ("- …", emotion in parentheses stripped) are read; 그림:/카드:/뉴스: directive lines are skipped.
Usage: python readaloud.py script.md            -> table + 합계, exit 1 when any 🔴
       python readaloud.py --calibrate           -> rule rates on the corpus itself (what the thresholds are based on)
Needs kiwipiepy; without it prints '낭독 검토 건너뜀' and exits 2.
"""
import collections, glob, json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__)); SIM = os.path.dirname(HERE); CORP = f'{SIM}/ref/njt/corpus'
TABLE = os.path.join(HERE, '..', 'references', 'readaloud_table.json')           # corpus-derived thresholds and ending counts (rebuilt by --calibrate)
PUNCT = {'SF', 'SP', 'SS', 'SSO', 'SSC', 'SE', 'SO', 'SW', 'SB'}
NOUN = {'NNG', 'NNP', 'NNB', 'NR', 'SN', 'XSN', 'SL', 'SH'}
WRITTEN = [r'하였', r'되었다', r'것이다', r'에 있어서', r'로 인해', r'에 의해', r'에 의하면', r'을 통하여', r'함으로써', r'바 있다', r'하는 바', r'그리하여', r'그러므로', r'따라서,', r'및 ']
_kiwi = []
def tagger():
    if not _kiwi:
        try:
            from kiwipiepy import Kiwi; _kiwi.append(Kiwi())
        except ModuleNotFoundError as exc:
            if exc.name != "kiwipiepy": raise
            _kiwi.append(None)
    return _kiwi[0]
def table():
    if os.path.exists(TABLE): return json.load(open(TABLE, encoding='utf-8'))
    raise FileNotFoundError(f'낭독 보정표 없음: {TABLE}')

def sentences_of_text(text):
    out = []
    for s in re.split(r'(?<=[.?!…])\s+', text.strip()):
        s = s.strip()
        if len(re.sub(r'[^가-힣0-9A-Za-z]', '', s)) >= 2: out.append(s)
    return out
def read_script(path):
    """-> [(line_no, sentence)] : narration lines of a script.md, or every sentence of a plain text"""
    lines = open(path, encoding='utf-8').read().split('\n'); out = []
    script = any(l.startswith('- ') for l in lines)
    for i, l in enumerate(lines, 1):
        if script:
            if not l.startswith('- '): continue
            t = re.sub(r'^\([^)]*\)\s*', '', l[2:].strip())
        else: t = l.strip()
        for s in sentences_of_text(t): out.append((i, s))
    return out

def analyse(sent, toks, T):
    """-> list of (severity, rule, note) for one sentence given its Kiwi tokens"""
    core = [t for t in toks if t.tag not in PUNCT]
    if not core: return []
    out = []; last = core[-1]; last2 = core[-2] if len(core) > 1 else None
    has_ef = any(t.tag == 'EF' for t in core)
    subj_at = [i for i, t in enumerate(core[:-1]) if t.tag == 'JKS' or (t.tag == 'JX' and t.form in ('은', '는'))]
    has_subj = any(not any(t.tag == 'ETM' for t in core[i + 1:]) for i in subj_at)     # a subject inside a relative clause ("…가 최애했던 책!") does not count
    ends_noun = last.tag in NOUN
    if has_subj and ends_noun and not has_ef: out.append(('🔴', 'R1', f'서술어 빠짐 (…{last.form})'))
    elif ends_noun and last2 is not None and last2.tag in ('SN', 'NR') and not has_ef: out.append(('🟡', 'R2', f'숫자 조각 (…{last2.form} {last.form})'))
    if last.tag == 'EF' and T['total'] and T['ef'].get(last.form, 0) * 12000 / T['total'] < 3: out.append(('🟡', 'R3', f"낯선 종결어미 '~{last.form}'"))
    if ',' not in sent and len(sent) > 45: out.append(('🟡', 'R4', f'쉼표 없이 {len(sent)}자'))               # the corpus p99 (36) is cue-split, so a fixed breath limit
    for w in WRITTEN:
        if re.search(w, sent): out.append(('🟡', 'R5', f"문어체 '{w.strip()}'")); break
    end = re.sub(r'[.?!…"”\')\]]+$', '', sent)[-2:]
    if T['total'] and T['ends'].get(end, 0) < 2 and not out: out.append(('⚪', 'R6', f"어미 '{end}' 코퍼스 {T['ends'].get(end, 0)}회"))
    return out

def check(path, show=True):
    kw = tagger()
    if kw is None:
        if show: print('낭독 검토 건너뜀: kiwipiepy 없음 (pip install kiwipiepy)')
        return None
    T = table(); items = read_script(path); rows = []
    toks = kw.tokenize([s for _, s in items]) if items else []
    for (ln, s), tk in zip(items, toks):
        for sev, rule, note in analyse(s, tk, T): rows.append((sev, rule, ln, s, note))
    if show:
        for sev, rule, ln, s, note in rows: print(f'{ln:>6}  {sev}  {rule:<3} {note:<24} {s}')
        c = collections.Counter(r[0] for r in rows)
        print(f"낭독 검토 {os.path.basename(path)}: 문장 {len(items)}개 · 🔴{c['🔴']} 🟡{c['🟡']} ⚪{c['⚪']}")
    return rows

def calibrate(show=True):
    """rates of every rule on the corpus itself; rebuilds readaloud_table.json (ending counts, breath length)"""
    kw = tagger(); sents = []
    for p in glob.glob(f'{CORP}/*.txt'):
        for line in open(p, encoding='utf-8'):
            for s in sentences_of_text(line):
                if 4 <= len(s) <= 150 and re.search(r'[.?!…]$', s): sents.append(s)
    toks = list(kw.tokenize(sents))
    ef = collections.Counter(); ends = collections.Counter(); nocomma = []
    for s, tk in zip(sents, toks):
        core = [t for t in tk if t.tag not in PUNCT]
        if not core: continue
        if core[-1].tag == 'EF': ef[core[-1].form] += 1
        ends[re.sub(r'[.?!…"”\')\]]+$', '', s)[-2:]] += 1
        if ',' not in s: nocomma.append(len(s))
    nocomma.sort(); max_breath = nocomma[int(len(nocomma) * 0.99)] if nocomma else 60
    T = dict(total=len(sents), ef=dict(ef.most_common()), ends=dict(ends.most_common()), max_breath=max_breath)
    json.dump(T, open(TABLE, 'w', encoding='utf-8'), ensure_ascii=False)
    hits = collections.Counter(); ex = collections.defaultdict(list)
    for s, tk in zip(sents, toks):
        for sev, rule, note in analyse(s, tk, T):
            hits[rule] += 1
            if len(ex[rule]) < 6: ex[rule].append(s[-70:])
    if show:
        print(f'corpus sentences {len(sents)}, breath p99 {max_breath} chars')
        for r in sorted(hits): print(f'  {r}: {hits[r]} ({hits[r] / len(sents) * 100:.2f}%)  e.g. ' + ' | '.join(ex[r]))
    return T, hits

if __name__ == '__main__':
    if '--calibrate' in sys.argv: calibrate(); sys.exit(0)
    rows = check(sys.argv[1])
    sys.exit(2 if rows is None else 1 if any(r[0] == '🔴' for r in rows) else 0)
