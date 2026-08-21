#!/usr/bin/env python3
"""윤문 게이트 — 전후를 결정적으로 판정한다 (stdlib only).

두 축을 본다. 둘 다 통과해야 채택할 수 있다.

  1) **불변식**(내용이 그대로인가) — 문장을 짝지어 **쌍 단위로** 숫자·부정·극성·조건·고유명사를 대조한다.
  2) **변경률**(과윤문인가) — 원문 대비 얼마나 갈아엎었는가.

## 왜 문장 쌍인가 (설계의 핵심)

파일 전체 총량만 세면 **재배치·상쇄가 통과한다.** 실측된 공격들:
  · "주중 가능/주말 불가능" → "주중 불가능/주말 가능"  (부정 1개 유지)
  · "환불 3일, 교환 7일"    → "환불 7일, 교환 3일"      (숫자 다중집합 동일)
  · 한쪽에서 부정을 지우고 다른 쪽에 "아니라"를 넣어 총량을 맞추기
전부 의미가 뒤집혔는데 총량은 그대로다. 게이트가 통과 도장을 찍으면 **가짜 확신**이 되어
아예 없느니만 못하다. 그래서 문장을 정렬해 짝짓고, 짝 안에서만 대조한다.

## 코드 모드 (--mode=code, 확장자 .ts/.js/.mjs/.cjs/.json 자동)

i18n 메시지 파일용 "값 문자열만, 키·보간·코드 불변" 게이트. 1급 불변식은 **skeleton
동등성** — 문자열 리터럴 본문만 \x00 치환한 소스가 byte-동일해야 한다. 키·콤마·괄호·
${} 보간·삼항·주석이 골격에 남아 자동 동결되고, 골격이 같으면 문자열이 위치로 1:1
대응되어 값 쌍마다 위의 문장 쌍 불변식(재짝짓기·프레임 극성 포함)을 그대로 돌린다.
미지원 구문(정규식 리터럴·JSX·중첩 백틱·미종결 문자열)은 판별하지 않고 **"게이트 관할
밖 — 수정 금지" exit 2**로 떨어뜨린다 — 지원 못 하는 파일을 조용히 통과시키는 것이
최악의 실패 모드다. 한계: 삼항의 결과 문자열("a" : "b"의 앞쪽)은 키로 오분류되어
동결된다(안전한 방향의 오류).

사용: python3 change_rate.py <원문파일> <윤문본파일> [--protect 이름,이름] [--mode text|code] [--json]
Exit: 0 OK / 1 WARN(과윤문 경고) / 2 ABORT(채택 금지·롤백 / 코드 모드 관할 밖) / 3 실행 오류
      불변식 위반은 변경률과 무관하게 항상 2다.
"""
import difflib
import json
import re
import sys
from collections import Counter

WARN = 0.30
ABORT = 0.50
SHORT_TEXT = 200      # 이보다 짧으면 변경률 게이트 뒤에 공유 2-gram 보조 경고도 적용한다
MIN_BIGRAM_KEEP = 0.30  # 짧은 텍스트가 원문과 공유해야 할 최소 2-gram 비율(미달 = WARN)

# ── 부정 표지 ────────────────────────────────────────────────────────────────
# 개별 표기가 아니라 **의미 단위 개수**를 센다. "하지 않습니다"→"안 합니다"는 1개 유지(정당),
# "불가능합니다"→"가능합니다"는 1→0(반전)이 되도록.
#   · `(?<!잘)못` — "잘못하면→실수하면"이 부정 소실로 잡히던 오탐 제거
#   · `안(?=\s?되)` — 붙여쓴 "안됩니다"와 띄어쓴 "안 됩니다"를 같게 센다(맞춤법 교정 오탐 제거)
#   · `아니(?!라)` — "A가 아니라 B다"의 대구는 수사 구문이지 부정 서술이 아니다(룰북이 평서문화를 지시)
#   · 관계없이·틀림없이 류는 굳어진 부사라 부정으로 세지 않는다
NEG_RE = re.compile(
    r"(?<!관계)(?<!상관)(?<!다름)(?<!틀림)(?<!어김)(?<!끊임)(?<!하염)(?<!변함)없"
    r"|않|마십시오|말 것|금지|제외"
    r"|(?<!잘)못(?=\s|했|한|하|합|해)"
    r"|불가|불능|아니(?!라)"
    r"|(?<![가-힣])안(?=\s?(?:되|됩|돼|된))"
)
# 숫자는 뒤따르는 단위 1어절까지 묶는다 — "7일→7주", "3만 원→3억 원"이 숫자만 보면 통과하던 구멍
NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?\s*(?:일|주|주일|개월|달|년|시간|분|초|원|달러|만|억|천|%|퍼센트|개|명|회|건|배)?")
CLAUSE_RE = re.compile(r"제\s?\d+\s?[조항호]")
URL_RE = re.compile(r"https?://[^\s)\]\"'<>]+")
# 고유명사·식별자로 보이는 라틴 토큰만 보호한다. 소문자 일반 단어(seamless 등)는
# 룰북이 우리말로 바꾸라고 지시하는 대상이라 불변식에 넣으면 정당한 편집이 막힌다.
PROPER_RE = re.compile(r"\b(?:[A-Z][A-Za-z0-9.+-]{1,}|[A-Za-z]+[0-9][A-Za-z0-9.+-]*)\b")
# 조건·한정 표지 — 사라지면 권리·의무의 적용 범위가 무한 확장된다
COND_RE = re.compile(r"경우에 한(?:해|하여)|에 한함|다만,|단,|조건으로|제외하고|를 제외|이내에만|에 한정")
# 극성 쌍 — **소실이 아니라 "짝으로 교체"될 때만** 위반이다.
# 단순 소실까지 잡으면 정당한 재작성이 막힌다(실측 오탐: "면 선택"의 '선택'을 필수↔선택 극성으로 오인).
# 반대로 이상→미만, 승인→반려는 한 글자로 법적 의미가 뒤집히므로 반드시 잡아야 한다.
# 가능↔불가·허용↔금지는 NEG가 이미 관할하므로 중복 제외(그리고 '가능'은 도처에 나와 오탐원이다).
POLARITY = [("이상", "미만"), ("이하", "초과"), ("승인", "반려"), ("무료", "유료"),
            ("최대", "최소"), ("이전", "이후"),
            # "-지 않" 프레임 반의어 — "적지 않다"(=많다) → "많지 않다"(=적다)처럼
            # 부정 개수는 그대로인데 의미가 뒤집히는 형태. 3글자 프레임이라 오탐 여지가 작다.
            ("많지 않", "적지 않"), ("크지 않", "작지 않"), ("높지 않", "낮지 않"),
            ("길지 않", "짧지 않"), ("빠르지 않", "느리지 않"), ("쉽지 않", "어렵지 않")]
# UI 동작 반의어 — **초단문 카피의 유일한 방어선**이다.
# 룰북이 "맨몸 반의어 반전은 못 잡는다"고 적어둔 한계의 부분 해소: 일반 산문의 반의어는
# 사전 없이 불가하지만, **버튼·메뉴 라벨의 동작 어휘는 닫힌 집합**이라 열거할 수 있다.
# 이게 없으면 "저장"→"삭제"가 숫자·부정·극성 토큰이 하나도 없어 무조건 통과한다(실측).
# 파괴력이 크고("삭제" 버튼을 누르게 만든다) 정당한 윤문에서는 절대 일어나지 않는 교체만 넣는다.
# "확인/취소"는 뺐다 — 둘 다 산문에 흔해("확인해 주세요"/"취소할 수 있습니다") 오탐원이다.
POLARITY += [("저장", "삭제"), ("추가", "제거"), ("시작", "중지"), ("열기", "닫기"),
             ("동의", "거부"), ("구독", "해지"), ("공개", "비공개"), ("켜기", "끄기"),
             ("표시", "숨김"), ("등록", "탈퇴"), ("활성화", "비활성화")]
# 목록 서수(1) 2) 3.)는 룰북이 산문화를 지시하므로 숫자 불변식에서 뺀다
LIST_ORD_RE = re.compile(r"(?m)^\s*\d{1,2}[.)]\s|(?<![\d])\d{1,2}\)\s")
PAIR_MIN_RATIO = 0.6    # 이 이상 닮았으면 "같은 문장이 고쳐진 것"으로 본다
PAIR_MAX_ORPHANS = 300  # 그리디 매칭 O(n·m) 폭주 방지

SENT_SPLIT_RE = re.compile(r"(?<=[.!?。])\s+|\n+")
# 문장 안 자리 교환("환불 3일, 교환 7일" → "환불 7일, 교환 3일")은 문장 단위로는 못 잡는다.
# 쉼표·나열 어미로 절까지 쪼개야 짝이 어긋난 것이 드러난다.
CLAUSE_SPLIT_RE = re.compile(r",\s*|(?<=[가-힣])(?:이며|하며|하고)\s+")


def sentences(text: str) -> list:
    out = []
    for chunk in SENT_SPLIT_RE.split(text):
        for part in CLAUSE_SPLIT_RE.split(chunk):
            c = part.strip()
            if c:
                out.append(c)
    return out


def invariants(text: str, protect: list) -> dict:
    stripped = LIST_ORD_RE.sub(" ", text)
    return {
        "숫자": Counter(re.sub(r"\s", "", m) for m in NUM_RE.findall(stripped)),
        "조항": Counter(re.sub(r"\s", "", m) for m in CLAUSE_RE.findall(text)),
        "부정": Counter({"NEG": len(NEG_RE.findall(text))}),
        "조건": Counter({"COND": len(COND_RE.findall(text))}),
        "URL": Counter(URL_RE.findall(text)),
        "고유명사": Counter(PROPER_RE.findall(text)),
        "보호어": Counter({p: text.count(p) for p in protect if p}),
    }


def _count_excl(text: str, term: str, other: str) -> int:
    """term의 출현 수 — 단, 상대말의 부분문자열로 들어간 것은 빼고 센다.

    "공개"는 "비공개" 안에 들어 있다. 그냥 세면 공개→비공개 교체에서 '공개'가
    사라지지 않은 것으로 보여 접두 부정(비-/미-/불-) 반전이 통째로 빠져나간다(실측).
    """
    n = text.count(term)
    if term != other and term in other:
        n -= text.count(other)
    return max(0, n)


def polarity_swaps(before: str, after: str) -> list:
    """짝으로 뒤집힌 것만 잡는다 — X가 줄고 그 반대말 Y가 늘었을 때."""
    out = []
    for x, y in POLARITY:
        for a_, b_ in ((x, y), (y, x)):
            if (_count_excl(before, a_, b_) > _count_excl(after, a_, b_)
                    and _count_excl(after, b_, a_) > _count_excl(before, b_, a_)):
                out.append({"종류": "극성", "사라짐": [a_], "생김": [b_]})
    return out


def compare(before: str, after: str, protect: list) -> list:
    out = []
    b, a = invariants(before, protect), invariants(after, protect)
    for kind in b:
        lost, gained = b[kind] - a[kind], a[kind] - b[kind]
        if lost or gained:
            out.append({"종류": kind, "사라짐": sorted(lost.elements()), "생김": sorted(gained.elements())})
    out.extend(polarity_swaps(before, after))
    return out



def pair_sentences(before: str, after: str) -> list:
    """전후 문장을 **유사도로** 짝지어 (원문, 윤문) 쌍 목록으로.

    왜 정확 일치 정렬로는 안 되나 — 실측된 결함 4건이 전부 여기서 나왔다:
      · 문장을 하나 추가해 개수를 어긋내면 블록이 통짜 비교로 떨어져 **NEG 상쇄가 부활**한다
      · 쉼표 하나 주입해 절 수를 어긋내면 같은 원리로 **숫자 자리 교환**이 부활한다
      · 반대로 순수 재배열(내용 무변경)은 '삭제+삽입'으로 갈라져 **오탐**이 난다
        (헌법 실측: 제자리 편집 191건은 오탐 0인데, 줄 교환 2곳만 추가하면 위반 4건)
    같은 종류의 편집이 diff opcode 운에 따라 다른 판정을 받는 게이트는 신뢰할 수 없다.
    그래서 짝을 **내용 유사도**로 다시 맺는다: 이동한 문장은 자기 자신과 짝지어져 깨끗하고,
    개수를 어긋낸 공격은 "불가능합니다"가 "가능합니다"와 짝지어져 걸린다.
    """
    bs, as_ = sentences(before), sentences(after)
    orphan_b, orphan_a = [], []
    sm = difflib.SequenceMatcher(None, bs, as_, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        orphan_b.extend(bs[i1:i2])
        orphan_a.extend(as_[j1:j2])

    if len(orphan_b) * len(orphan_a) > PAIR_MAX_ORPHANS ** 2:  # 초대형 재작성은 위치 기준으로 폴백
        n = max(len(orphan_b), len(orphan_a))
        return [((orphan_b[i] if i < len(orphan_b) else ""),
                 (orphan_a[i] if i < len(orphan_a) else "")) for i in range(n)]

    def sim(b, a):
        sm = difflib.SequenceMatcher(None, b, a)
        lm = sm.find_longest_match(0, len(b), 0, len(a)).size
        cont = lm / min(len(b), len(a)) if min(len(b), len(a)) else 0.0
        return sm.ratio(), cont

    # 1단계: 배타 1:1 그리디(점수 내림차순, 동률은 위치 근접 우선) — 배타성이
    # "숫자 교환 vs 주어 교환" 동률 공격(A14)을 잡는 힘이다: 한쪽이 선점되면
    # 남은 쪽은 숫자가 다른 상대와 짝지어져 불일치가 드러난다.
    cand = []
    for i, b in enumerate(orphan_b):
        for j, a in enumerate(orphan_a):
            r, c = sim(b, a)
            score = max(r, c)
            if score >= PAIR_MIN_RATIO:
                cand.append((-score, abs(i - j), i, j))
    # 동률 위치 보정 — 문장 삽입·삭제는 인덱스를 통째로 민다. 보정 없이 원시 인덱스로
    # 동률을 깨면 "환불 3일/교환 7일" 숫자 교환(A14)이 주어 교환 읽기로 흡수돼 통과한다.
    # 고득점 후보들의 (j-i) 중앙값을 전역 오프셋으로 추정해 그만큼 되돌린 거리로 겨룬다.
    if cand:
        offs = sorted(j - i for _, _, i, j in cand)
        off = offs[len(offs) // 2]
        cand = [(sc, abs((j - off) - i), i, j) for sc, _, i, j in cand]
    cand.sort()
    pair_of_b, pair_of_a = {}, {}
    for _, _, i, j in cand:
        if i not in pair_of_b and j not in pair_of_a:
            pair_of_b[i] = j
            pair_of_a[j] = i
    pairs = [[ [orphan_b[i]], [orphan_a[j]] ] for i, j in sorted(pair_of_b.items())]
    idx_of_a = {j: k for k, (i, j) in enumerate(sorted(pair_of_b.items()))}
    idx_of_b = {i: k for k, (i, j) in enumerate(sorted(pair_of_b.items()))}
    # 2단계: 남은 고아를 **포함률**로 기존 쌍에 편입 — 병합(여러 문장→한 문장)과
    # 분할(한 문장→여러 문장)은 정당한 윤문이라 고아로 남기면 오탐이 난다
    # (실측 B1·B4·B5 — ratio 0.52~0.60인데 포함률 0.80~1.00).
    CONTAIN = 0.7
    orphans = []
    for i, b in enumerate(orphan_b):
        if i in pair_of_b:
            continue
        best, bj = 0.0, -1
        for j, a in enumerate(orphan_a):
            _, c = sim(b, a)
            if c > best:
                best, bj = c, j
        if bj in pair_of_a and best >= CONTAIN:
            pairs[idx_of_a[bj]][0].append(b)
        else:
            orphans.append((b, ""))
    for j, a in enumerate(orphan_a):
        if j in pair_of_a:
            continue
        best, bi = 0.0, -1
        for i, b in enumerate(orphan_b):
            _, c = sim(b, a)
            if c > best:
                best, bi = c, i
        if bi in pair_of_b and best >= CONTAIN:
            pairs[idx_of_b[bi]][1].append(a)
        else:
            orphans.append(("", a))
    return [(" ".join(pb), " ".join(pa)) for pb, pa in pairs] + orphans


def text_broken(before: str, after: str, protect: list) -> list:
    """본문 텍스트의 불변식 위반 목록. 텍스트 모드 전체와 코드 모드의 값 문자열 쌍이 공유한다."""
    broken = []
    # 1) 문장 쌍 단위 — 재배치·상쇄가 여기서 걸린다
    for bsent, asent in pair_sentences(before, after):
        for br in compare(bsent, asent, protect):
            br["원문"] = bsent[:60]
            br["윤문"] = asent[:60]
            broken.append(br)
    # 2) 문서 전체 — 문장이 통째로 사라진 경우를 잡는다
    for br in compare(before, after, protect):
        if not any(x["종류"] == br["종류"] for x in broken):
            br["원문"] = "(문서 전체)"
            br["윤문"] = ""
            broken.append(br)
    return broken


# ── 코드 모드 — i18n 메시지 파일 (값 문자열만, 키·보간·코드 불변) ─────────────

CODE_EXTS = (".ts", ".js", ".mjs", ".cjs", ".json")


class UnsupportedSyntax(ValueError):
    pass


# 코드 위치에서 이 문자들 뒤에 오는 '/'는 정규식 리터럴일 수 있다 — 판별하지 않고 관할 밖 선언
REGEX_PRECEDER = set("(,=:[!&|?{};+-*%<>~^")


def strings_and_skeleton(src: str):
    """(role, body) 목록과 skeleton. role: key(뒤에 ':') | val | part(템플릿 조각)."""
    out, skel, i, n = [], [], 0, len(src)
    mode, buf, tmpl_depth, quote = "code", [], [], ""
    last_code = ""  # 정규식 리터럴 감지용 — 직전 유의미 코드 문자
    while i < n:
        c = src[i]
        if mode == "code":
            if c in "'\"`":
                mode, quote, buf = "str", c, []
                skel.append(c)
            elif c == "/" and i + 1 < n and src[i + 1] in "/*":
                mode = "lc" if src[i + 1] == "/" else "bc"
                skel.append(src[i : i + 2]); i += 1
            elif c == "/" and (not last_code or last_code in REGEX_PRECEDER):
                raise UnsupportedSyntax(f"정규식 리터럴 가능성 (offset {i})")
            elif c == "}" and tmpl_depth and tmpl_depth[-1] == 0:
                tmpl_depth.pop(); mode, quote, buf = "str", "`", []
                skel.append(c)
            else:
                if c == "{" and tmpl_depth:
                    tmpl_depth[-1] += 1
                elif c == "}" and tmpl_depth:
                    tmpl_depth[-1] -= 1
                skel.append(c)
                if not c.isspace():
                    last_code = c
        elif mode == "str":
            if c == "\\" and i + 1 < n:
                buf.append(src[i : i + 2]); i += 1
            elif quote == "`" and c == "$" and i + 1 < n and src[i + 1] == "{":
                out.append(("part", "".join(buf))); buf = []
                tmpl_depth.append(0); mode = "code"; last_code = "{"
                skel.append("\x00${"); i += 1
            elif quote == "`" and c == "`" and tmpl_depth:
                raise UnsupportedSyntax(f"중첩 백틱 (offset {i})")
            elif c == quote:
                j = i + 1
                while j < n and src[j] in " \t\r\n":
                    j += 1
                role = "key" if j < n and src[j] == ":" else "val"
                out.append((role, "".join(buf)))
                skel.append("\x00" + c); mode = "code"; last_code = c
            else:
                buf.append(c)
        elif mode == "lc":
            skel.append(c)
            if c == "\n":
                mode = "code"
        else:  # bc
            skel.append(c)
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                skel.append("/"); i += 1; mode = "code"
        i += 1
    if mode != "code":
        raise UnsupportedSyntax("미종결 문자열/주석 — 따옴표 균형 붕괴")
    return out, "".join(skel)


def code_broken(before_src: str, after_src: str, protect: list):
    """(위반 목록, 키 수, 값 수, 변경된 값 쌍 목록). UnsupportedSyntax는 호출자가 처리."""
    b_strs, b_skel = strings_and_skeleton(before_src)
    a_strs, a_skel = strings_and_skeleton(after_src)
    if b_skel != a_skel:
        k = next((x for x in range(min(len(b_skel), len(a_skel))) if b_skel[x] != a_skel[x]),
                 min(len(b_skel), len(a_skel)))
        return ([{"종류": "코드골격", "사라짐": [repr(b_skel[max(0, k - 25):k + 25])],
                  "생김": [repr(a_skel[max(0, k - 25):k + 25])],
                  "원문": "키·보간·코드·구두점 어딘가가 바뀜 — 값 문자열 밖은 수정 금지", "윤문": ""}],
                0, 0, [])
    broken, changed = [], []
    keys = sum(1 for r, _ in b_strs if r == "key")
    vals = len(b_strs) - keys
    for (br, bs), (_, as_) in zip(b_strs, a_strs):
        if br == "key":
            if bs != as_:
                broken.append({"종류": "키", "사라짐": [bs], "생김": [as_],
                               "원문": bs[:60], "윤문": as_[:60]})
        elif bs != as_:
            changed.append((bs, as_))
            broken.extend(text_broken(bs, as_, protect))  # 문장 쌍 불변식을 값 쌍에 그대로
    return broken, keys, vals, changed


def bigrams(s: str) -> set:
    t = re.sub(r"\s+", "", s)
    return {t[i:i + 2] for i in range(len(t) - 1)}


def normalize(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def main() -> int:
    argv, protect, as_json, mode = [], [], False, ""
    it = iter(sys.argv[1:])
    for a in it:
        if a == "--json":
            as_json = True
        elif a == "--protect":
            protect = [p.strip() for p in next(it, "").split(",") if p.strip()]
        elif a == "--mode":
            mode = next(it, "")
        else:
            argv.append(a)
    if len(argv) != 2:
        print("usage: change_rate.py <before> <after> [--protect 이름,이름] [--mode text|code] [--json]", file=sys.stderr)
        return 3
    if not mode:
        mode = "code" if argv[0].endswith(CODE_EXTS) or argv[1].endswith(CODE_EXTS) else "text"
    try:
        with open(argv[0], encoding="utf-8") as f:
            raw_before = f.read()
        with open(argv[1], encoding="utf-8") as f:
            raw_after = f.read()
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    if not raw_before.strip():
        print("error: 원문이 비어 있음", file=sys.stderr)
        return 3

    code_note = ""
    if mode == "code":
        # 코드는 공백도 문법이다 — normalize 없이 원문 그대로 골격을 비교한다
        try:
            broken, keys, vals, changed = code_broken(raw_before, raw_after, protect)
        except UnsupportedSyntax as e:
            print(f"ABORT — 미지원 구문({e}). 이 파일은 게이트 관할 밖 — **수정 금지**")
            return 2
        code_note = f"code mode: 키 {keys}개 동결 · 값 문자열 {vals}개 중 {len(changed)}개 편집"
        # 변경률 축은 편집된 값 문자열들만 이어 붙여 잰다 — 코드 골격은 이미 동결됐다
        before = "\n".join(b for b, _ in changed)
        after = "\n".join(a for _, a in changed)
        if not before:
            before = after = "\x00"  # 값 편집이 없으면 변경률 0으로 수렴
    else:
        before, after = normalize(raw_before), normalize(raw_after)
        broken = text_broken(before, after, protect)

    rate = 1.0 - difflib.SequenceMatcher(None, before, after).ratio()
    pct = rate * 100
    short = len(before) < SHORT_TEXT
    keep = 1.0
    if short:
        bb = bigrams(before)
        keep = len(bb & bigrams(after)) / len(bb) if bb else 1.0

    if broken:
        verdict, code = "ABORT — 내용 변조·롤백", 2
    elif rate > ABORT:
        # 짧은 문구도 예외가 아니다. 2-gram은 보조 신호이고 SKILL.md의 50% 하드 라인을
        # 우회시키지 않는다. 이전 구현은 short 분기가 먼저라 90% 재작성도 WARN으로 끝났다.
        verdict, code = "ABORT — 과윤문·롤백", 2
    elif rate > WARN:
        verdict, code = "WARN — 과윤문 경고", 1
    elif short and keep < MIN_BIGRAM_KEEP:
        # 30% 이하여도 원문 흔적이 거의 없으면 보조 경고한다. 변경률 하드 라인은 위에서 이미 적용했다.
        verdict, code = f"WARN — 짧은 텍스트 전면 재작성(원문 2-gram {keep * 100:.0f}% 유지) · 사람 확인", 1
    elif short:
        verdict, code = f"OK — 짧은 텍스트({len(before)}자, 2-gram {keep * 100:.0f}% 유지)", 0
    else:
        verdict, code = "OK — 수렴", 0

    if as_json:
        print(json.dumps({"mode": mode, "change_rate": round(pct, 1), "invariant_breaks": broken,
                          "verdict": verdict, "exit": code}, ensure_ascii=False, indent=1))
        return code

    if code_note:
        print(code_note)
    print(f"change_rate: {pct:.1f}%  gate: {verdict} (경고 30% 초과 / 중단 50% 초과 · 불변식 위반은 즉시 중단)")
    for b in broken[:12]:
        print(f"  🔴 {b['종류']} 불일치 — 사라짐 {b['사라짐'] or '없음'} / 생김 {b['생김'] or '없음'}")
        if b["원문"] != "(문서 전체)":
            print(f"     원문: {b['원문']}\n     윤문: {b['윤문']}")
    if len(broken) > 12:
        print(f"  … 외 {len(broken) - 12}건")
    if broken:
        print("  → 문체만 바꾸는 작업에서 숫자·부정·극성·조건·고유명사가 달라졌다면 그건 윤문이 아니라 변조다.")
    print("  ※ 한글 고유명사는 --protect 로 명단을 줄 때만 검사한다(사전 없이 일반 추출하면 오탐이 터진다).")
    return code


if __name__ == "__main__":
    sys.exit(main())
