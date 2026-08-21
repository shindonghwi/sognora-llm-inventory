#!/usr/bin/env python3
"""AI 티 패턴 검출기 — rules.md 중 정규식으로 결정 가능한 것만 기계 판정한다 (stdlib only).

## 왜 이 파일이 있나
sg-landing-forge의 콘텐츠 검수(forge-rules §5)는 "카피에 sg-ko-humanize 🔴 패턴 0"을
요구하는데, 이를 판정하는 기계가 양쪽 어디에도 없었다("판정자 없는 규칙은 없다" 위반).
이 스크립트가 그 판정자다. humanize 자신의 1차 선별 스캔(SKILL.md 일괄 모드)에도 쓴다.

## 무엇을 하지 않나 (정직한 경계)
- 문맥 판단이 필요한 룰은 여기 없다 — 무생물 의인화(수사와 구분 불가), 따옴표 강조
  도배(실인용과 구분 불가), "~할 것이다"(단순 미래와 구분 불가)는 LLM/사람 몫이다.
- "에 대해"가 목적어 노릇인지는 기계가 판정 못 한다 — 밀도 초과 시 🟡 후보로만 올린다.
- KOH23도 모호한 수식어+빈 동사의 좁은 결합만 🟡 후보로 올린다. 독자의 행동과 결과가
  실제로 구체적인지는 rules.md의 의미 검토 3문항으로 따로 판단한다.
- rules.md에 없는 패턴을 여기서 창설하지 않는다(SSOT는 rules.md).

## 오탐 캘리브레이션 (1987년 대한민국헌법 51KB = AI 이전 사람 격식문 실측)
- 연결어미 뒤 쉼표("-고,/-며,"): 헌법 64회 → 🔴 자격 없음. 밀도 기준 🟡로만, 법률 장르 면제.
- "에 있어" 9회 · "에 대하여/대한" 19회 · "할 수 있" 53회 → 법률·공적 장르 면제 필수.
- 결론적으로·되어지·과장 어휘·"것이다.": 헌법 0회 → 🔴 정규식화 안전.

사용:
  python3 detect_ko.py <file...|-> [--genre UI|칼럼|리포트|블로그|공적|구어|법률|스펙] [--json] [--min red]
  '-' 는 stdin(개행 구분 카피 문자열 — forge가 DOM 텍스트를 파이프하는 인터페이스).
전처리: 코드펜스·인라인 코드·URL·front-matter·큰따옴표 인용은 검사에서 제외(자리는 보존).
  단 `--genre UI`는 큰따옴표 안을 **검사한다** — i18n·TS·JSON 카피가 전부 거기 들어 있다.

## UI 장르 (제품 카피·랜딩·i18n)
산문 전용 규칙(PROSE_ONLY)을 끄고 §8 어휘 규칙을 켠다. 밀도의 분모도 개행이 아니라
'서술어로 끝나는 줄'이다. 이 세 가지가 없던 동안 랜딩 i18n 파일은 구조적으로 항상
🔴0을 받았다 — 따옴표 마스킹이 카피를 통째로 지웠고, 남았어도 §8 규칙 자체가 없었으며,
개행 분모가 밀도 규칙을 영영 잠재웠다. 검출기가 침묵한 것이지 카피가 깨끗한 게 아니었다.

Exit: 0 = 🔴 없음 / 1 = 🔴 있음 / 3 = 실행 오류
"""
import json
import pathlib
import re
import sys

EMOJI = "\U0001F300-\U0001FAFF☀-➿⬀-⯿←-⇿✀-➿"

# (id, 이름, 정규식, yellow_at, red_at, 면제 장르, 비고)
# *_at: 문서 내 매치 수가 이 값 이상이면 해당 등급. None = 그 등급 없음.
RULES = [
    ("KOH01", "마무리 공식", r"결론적으로|요약하자면|이를 통해 알 수 있듯",
     1, 2, set(), "rules.md §3 — 살려도 한 번"),
    ("KOH02", "의의 상투구", r"시사하는 바가 크|주목할 만하|중요한 의미를 (?:갖는|가진|지닌)",
     None, 1, set(), "rules.md §3"),
    ("KOH03", "예고 공식", r"크게 .{0,6}가지로 나눌 수 있|다음과 같(?:다|습니다)",
     None, 1, {"스펙", "법률"}, "직후 2줄 내 목록·표·코드펜스가 오면 개별 면제(구조적 예고는 정당)"),
    ("KOH04", "과장 어휘", r"혁신적|획기적|전례 없는|압도적|파격적|혁명적",
     None, 1, set(), "rules.md §3 — 인용부 안은 전처리에서 제외됨"),
    ("KOH05", "겹피동", r"되어지",
     None, 1, set(), "표준어에 없는 형태 — 헌법 0회, 오탐 사실상 없음"),
    ("KOH06", "촉구형 마무리", r"할 때다|해야 할 시점",
     1, 2, set(), "rules.md §3 — 문서에 많아야 한 번"),
    ("KOH07", "전환 공식", r"에서 [가-힣 ]{1,16}의 시대로|를 넘어 [가-힣 ]{1,16}(?:으로|로)[\s,.]",
     1, 2, set(), "물리적 '넘어'(국경을 넘어 이동) 오탐 여지 — 2회부터 🔴"),
    ("KOH08", "이모지 장식", r"(?m)^[\s#>*-]*[" + EMOJI + "]",
     None, 1, {"구어"}, "행머리 장식만 — 본문 중간 이모지는 세지 않는다"),
    ("KOH09", "콜론 제목 반복", r"(?m)^#{1,6}\s+[^:\n]{2,}:\s+\S",
     None, 2, {"리포트", "공적"}, "논문·보고서 정식 절 제목은 장르 면제"),
    ("KOH10", "연결어미 뒤 쉼표", r"[가-힣](?:고|며|지만),\s",
     3, None, {"법률"}, "헌법 64회 실측으로 🔴 강등 — 밀도(문장 수 대비)로만 🟡, 판정식 아래 참조"),
    ("KOH11", "문두 접속사", r"(?m)(?:^|(?<=[.!?] ))(?:또한|따라서|즉|나아가)[,\s]",
     3, 6, set(), "도배일 때만 — 한두 번은 정상"),
    ("KOH12", "것이다 연발", r"것이다\.",
     3, 5, set(), "헌법 0회"),
    ("KOH13", "~에 있어", r"에 있어서?[\s,.]",
     None, 1, {"법률", "공적"}, "헌법 9회 → 법률·공적 면제, 그 외는 rules.md대로 🔴"),
    ("KOH14", "~에 대해 밀도", r"에 대(?:해서?|한|하여)[\s,]",
     3, None, {"법률", "공적"}, "목적어 노릇인지는 기계가 판정 불가 — 밀도 초과 시 🟡 후보만"),
    ("KOH15", "가지고 있다", r"[을를] 가지고 있",
     1, 3, set(), "실소유 의미 오탐 여지 — 1회는 🟡"),
    ("KOH16", "겹조사", r"에서의|으로의|에의(?=[\s,.])",
     2, None, set(), "rules.md §1 🟡 — 단순 '~의'는 매치하지 않는다"),
    # --- rules.md §1 🟡 인데 검출기가 없던 구멍. 헌법 53회 실측 → 법률·공적·스펙 면제 필수.
    # 종성 ㄹ은 낱자 클래스([ㄹ])로 못 잡는다 — 한글은 음절 합성이라 '할'은 U+D560 한 글자다.
    ("KOH17", "능력 서술 도배", r"[가-힣] 수 있",
     4, None, {"법률", "공적", "스펙"}, "밀도 게이트 통과 시에만 🟡 — 기능 명세를 옮긴 카피의 지문"),
    # --- rules.md §8. 고객이 읽는 화면에서만 본다. 스펙·법률·공적은 여기서 정확한 용어다.
    # 개발·기획 어휘가 화면에 그대로 샌 경우 — 기능 UI에서도 변호가 안 된다.
    ("KOH18", "내부 명세어(명백)", r"결정할 화면|제공량|인입|상태값|유효성 검사|예외 처리"
     r"|어드민|프로비저닝|디폴트|파라미터|엔드포인트",
     None, 1, {"스펙", "법률", "공적", "리포트"}, "rules.md §8 🔴 — 만든 사람의 말이 고객 화면에 그대로 나옴"),
    ("KOH19", "운영 지표어·명세 동사", r"진입한|이탈한|유입된|전환율|정상적으로|해당 [가-힣]"
     r"|를 수행합니다|를 처리합니다|처리했습니다|처리되었습니다|에 반영합니다|를 제공합니다",
     2, None, {"스펙", "법률", "공적", "리포트"}, "rules.md §8 🟡 — 구체 동사·고객 행동으로"),
    # 문맥 의존 — 기능 화면에서는 정확한 용어("읽기 전용" 파일 권한)이나 마케팅 카피에서는
    # 명세서 어투다. 그래서 `랜딩`에서만 🔴로 승격하고 `UI`에서는 🟡로 둔다. gpt-5.6-sol 교차검증에서
    # 이 목록이 "오탐 위험 높음"으로 지목됐고, 실제 위험은 어휘가 아니라 **쓰인 자리**였다.
    ("KOH20", "명세어(문맥 의존)", r"읽기 전용|쓰기 전용|편집 화면|작업 화면|관리 화면"
     r"|지원 범위|적용 대상|적용 위치|워크스페이스|온보딩|플로우|트리거|케이스",
     1, None, {"스펙", "법률", "공적", "리포트"}, "rules.md §8 — `랜딩`에서 🔴 승격, `UI`에서는 🟡"),
    # 단어 자체가 아니라 **모호한 수식어+빈 동사** 결합만 후보로 올린다.
    # "인증이 끝나면 결제 화면으로 이어집니다"처럼 조건·결과가 구체적인 문장은 잡지 않는다.
    ("KOH23", "추상 연결·빈 동사",
     r"(?:한\s+곳에서|하나로|자연스럽게|처음부터\s+끝까지)[^.!?\n]{0,16}"
     r"(?:이어(?:집니다|진다|져요)|연결(?:됩니다|된다|돼요)|함께(?:합니다|한다|해요))",
     1, None, set(), "rules.md §9 🟡 — 행동·결과가 있는지 의미 검토 필요"),
]

# UI 계열(제품 카피) — 산문 규칙을 끄고 §8 어휘 규칙을 켜는 장르들.
# `랜딩`은 마케팅 카피(고객 설득), `UI`는 앱 기능 화면(조작). 어휘 허용치가 다르다.
UI_FAMILY = {"UI", "랜딩"}
# UI 계열에서 끄는 산문 전용 규칙 — 버튼 라벨에 산문 리듬을 들이대면 UI가 깨진다.
PROSE_ONLY = {"KOH03", "KOH09", "KOH10", "KOH11", "KOH12"}
# 특정 장르에서만 🔴로 승격하는 규칙 — {규칙: {장르...}}
PROMOTE_RED = {"KOH20": {"랜딩"}}

# KOH21 용어 표류 — 한 파일에서 같은 것을 두 이름으로 부르는 경우.
# **역할이 갈리지 않는 진짜 동의어만 넣는다.** "고객/사용자"는 뺐다 — 실측(nolpop)에서
# 고객=시공사의 의뢰인, 사용자=좌석 수로 서로 다른 것을 가리켰다. 넣었으면 오탐이었다.
# "사진/이미지"도 뺐다(현장 사진 vs 이미지 자산). 룰북이 "기계가 못 센다"고 적어둔 축인데,
# 셀 수 있는 부분만 정직하게 떼어내 기계에 넘기고 나머지는 사람 몫으로 남긴다.
TERM_CLUSTERS = [
    ("요금제", ("요금제", "플랜")),
    ("미리보기", ("미리보기", "프리뷰")),
    ("계정", ("계정", "어카운트")),
    ("로그인", ("로그인", "사인인")),
]

# 카피가 문자열 리터럴 안에 사는 파일 유형 — 장르 없이 검사하면 거짓 통과가 나온다.
CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".vue", ".svelte", ".py")

STRUCT_NEXT_RE = re.compile(r"^\s*(?:[-*|]|\d{1,2}[.)]|```|#)")  # KOH03 구조적 면제용


def mask(text: str, genre: str = "") -> str:
    """검사 제외 구간을 같은 길이의 공백으로 치환 — 오프셋·줄번호 보존."""
    def blank(m):
        return re.sub(r"\S", " ", m.group(0))
    text = re.sub(r"\A---\n.*?\n---\n", blank, text, flags=re.S)        # front-matter
    text = re.sub(r"```.*?```", blank, text, flags=re.S)                 # 코드펜스
    text = re.sub(r"`[^`\n]+`", blank, text)                             # 인라인 코드
    text = re.sub(r"https?://[^\s)\]>]+", blank, text)                   # URL
    if genre in UI_FAMILY:
        # i18n·TS·JSON 카피는 전부 큰따옴표 안에 있다. 산문용 '인용 보호'를 그대로 적용하면
        # 검사 대상이 통째로 지워져 무조건 🔴0이 나온다 — 랜딩 카피가 만점을 받고 사람에게
        # 반려당한 진짜 원인이 이 한 줄이었다. UI 장르에서는 따옴표 안이 곧 본문이다.
        text = re.sub(r"“[^“”]{2,}”", blank, text)                       # 한글 인용부만 보호
    else:
        text = re.sub(r"“[^“”]{2,}”|\"[^\"\n]{2,}\"", blank, text)       # 인용 보호
    return text


def scan(text: str, genre: str) -> dict:
    masked = mask(text, genre)
    lines = masked.splitlines()
    if genre in UI_FAMILY:
        # 제품 카피는 문자열 하나가 곧 한 발화다. i18n 파일은 줄 대부분이 코드·영문이라
        # 개행을 문장으로 세면 분모가 부풀어 밀도 규칙이 영영 발화하지 않는다(이 검출기가
        # 랜딩 카피에 🔴0을 준 원인). 서술어로 끝나는 줄만 발화 단위로 센다 —
        # "단독주택", "요금제 보기" 같은 라벨을 분모에 넣으면 다시 분모가 부푼다.
        sent_n = max(1, sum(1 for ln in lines if re.search(r"(?:다|요|까)[.!?]?[\"'”]", ln)))
    else:
        sent_n = max(1, len(re.findall(r"[.!?]\s|[.!?]$|\n", masked)))
    findings = []
    for rid, name, pat, y_at, r_at, exempt, note in RULES:
        if genre in exempt:
            continue
        if genre in UI_FAMILY and rid in PROSE_ONLY:
            continue
        matches = list(re.finditer(pat, masked))
        if rid == "KOH03":  # 직후 2줄에 목록·표·펜스가 오면 그 매치는 구조적 예고 — 면제
            kept = []
            for m in matches:
                ln = masked.count("\n", 0, m.start())
                nxt = lines[ln + 1 : ln + 3]
                if not any(STRUCT_NEXT_RE.match(x or "") for x in nxt):
                    kept.append(m)
            matches = kept
        n = len(matches)
        if not n:
            continue
        if rid == "KOH10" and not (n >= (y_at or 3) and n > 0.5 * sent_n):
            continue  # 밀도 미달 — 사람 글에서 흔한 수준
        if rid == "KOH17" and not (n >= (y_at or 4) and n > 0.2 * sent_n):
            continue  # 능력 서술은 정상 어법 — 문장 대비 비율이 넘을 때만 도배로 본다
        if genre in PROMOTE_RED.get(rid, ()):
            r_at = y_at or 1   # 같은 어휘라도 마케팅 카피에서는 즉시 제거 대상이다
        sev = "red" if (r_at and n >= r_at) else ("yellow" if (y_at and n >= y_at) else None)
        if not sev:
            continue
        locs = []
        for m in matches[:5]:
            ln = masked.count("\n", 0, m.start()) + 1
            locs.append({"line": ln, "match": text[m.start():m.end()].strip()})
        findings.append({"rule": rid, "name": name, "severity": sev, "count": n,
                         "locations": locs, "note": note})
    clusters = {}
    if genre in UI_FAMILY:
        findings.extend(term_drift(masked, text))
        clusters = cluster_counts(masked)
    return {"findings": findings, "_clusters": clusters,
            "counts": {"red": sum(1 for f in findings if f["severity"] == "red"),
                       "yellow": sum(1 for f in findings if f["severity"] == "yellow")}}


def cluster_counts(masked: str) -> dict:
    """클러스터별 멤버 출현 수 — term_drift(파일 안)와 cross_file_drift(파일 간)가 공유한다."""
    return {label: {m: len(re.findall(m, masked)) for m in members if re.search(m, masked)}
            for label, members in TERM_CLUSTERS}


def cross_file_drift(per_file: list) -> list:
    """파일마다 다른 이름을 쓰는가 — KOH21이 구조적으로 못 보는 축.

    실제로 이렇게 샜다: 랜딩은 "요금제"로 통일돼 있고 요금제 페이지는 "플랜" 6회였다.
    두 파일 각각은 내부적으로 일관돼서 KOH21이 침묵했고, 사람이 눈으로 찾아냈다.
    파일을 여러 개 받았을 때만 돈다(한 개면 비교할 상대가 없다).
    """
    out = []
    for label, members in TERM_CLUSTERS:
        # 파일별 '지배 용어' — 그 파일이 사실상 하나로 통일해 쓰는 이름
        dom = {}
        for f in per_file:
            c = f.get("_clusters", {}).get(label, {})
            if not c:
                continue
            top, n = max(c.items(), key=lambda kv: kv[1])
            if n >= 2 * sum(v for k, v in c.items() if k != top) + 1:  # 압도적일 때만 '지배'로 본다
                dom[f["file"]] = (top, n)
        if len({t for t, _ in dom.values()}) < 2:
            continue
        locs = [{"line": 0, "match": f"{pathlib.PurePath(fn).name}={t}×{n}"} for fn, (t, n) in dom.items()]
        out.append({"rule": "KOH22", "name": f"용어 표류(파일 간·{label})", "severity": "yellow",
                    "count": len(dom), "locations": locs,
                    "note": "rules.md §8 🟡 — 파일마다 다른 이름을 쓴다: "
                            + " / ".join(f"{pathlib.PurePath(fn).name}은 \"{t}\"" for fn, (t, n) in dom.items())
                            + " → 제품 전체에서 하나로"})
    return out


def term_drift(masked: str, text: str) -> list:
    """같은 것을 두 이름으로 부르는가 — 파일 안에서만 본다(프로젝트 전역은 관할 밖)."""
    out = []
    for label, members in TERM_CLUSTERS:
        seen = {m: len(re.findall(m, masked)) for m in members}
        used = {m: c for m, c in seen.items() if c}
        if len(used) < 2:
            continue
        locs = []
        for m in used:
            hit = re.search(m, masked)
            if hit:
                locs.append({"line": masked.count("\n", 0, hit.start()) + 1, "match": m})
        out.append({"rule": "KOH21", "name": f"용어 표류({label})", "severity": "yellow",
                    "count": sum(used.values()), "locations": locs,
                    "note": "rules.md §8 🟡 — " + " / ".join(f"{m}×{c}" for m, c in used.items()) + " → 하나로 통일"})
    return out


def main() -> int:
    files, genre, as_json, min_sev = [], "", False, "yellow"
    it = iter(sys.argv[1:])
    for a in it:
        if a == "--json":
            as_json = True
        elif a == "--genre":
            genre = next(it, "")
        elif a == "--min":
            min_sev = next(it, "yellow")
        else:
            files.append(a)
    if not files:
        print("usage: detect_ko.py <file...|-> [--genre 장르] [--json] [--min red]", file=sys.stderr)
        return 3

    # 장르 미지정 + 코드/메시지 파일 = 판정 불가. **0을 반환하면 안 된다.**
    # 기본 장르는 큰따옴표 안을 '인용'으로 마스킹하는데 i18n·TS·JSON 카피는 100%가 거기 있다.
    # 그래서 장르를 빠뜨린 호출은 언제나 🔴0 exit 0 — "깨끗함"과 구분되지 않는 거짓 통과였고,
    # 이 스킬을 만든 사고의 원인이 정확히 이것이다. 침묵 대신 거절한다(change_rate.py의 exit 2와 같은 규약).
    if not genre:
        code = [f for f in files if f.lower().endswith(CODE_EXT)]
        if code:
            print("error: 장르 미지정 — 판정하지 않는다(exit 2).\n"
                  f"  대상: {', '.join(code)}\n"
                  "  이 파일들의 카피는 큰따옴표 안에 있고, 기본 장르는 그걸 인용으로 보고 지운다.\n"
                  "  결과가 '🔴 0'으로 나와도 깨끗한 게 아니라 아무것도 안 본 것이다.\n"
                  "  마케팅 카피면 --genre 랜딩, 앱 기능 화면이면 --genre UI 를 넘겨라.",
                  file=sys.stderr)
            return 2

    out, total_red, total_yellow = [], 0, 0
    for f in files:
        try:
            text = sys.stdin.read() if f == "-" else open(f, encoding="utf-8").read()
        except OSError as e:
            print(f"error: {e}", file=sys.stderr)
            return 3
        r = scan(text, genre)
        if min_sev == "red":
            r["findings"] = [x for x in r["findings"] if x["severity"] == "red"]
        out.append({"file": f, **r})
        total_red += r["counts"]["red"]
        total_yellow += r["counts"]["yellow"]

    cross = cross_file_drift(out) if (genre in UI_FAMILY and len(out) > 1) else []
    if min_sev == "red":
        cross = [x for x in cross if x["severity"] == "red"]
    total_yellow += sum(1 for x in cross if x["severity"] == "yellow")
    total_red += sum(1 for x in cross if x["severity"] == "red")
    for o in out:
        o.pop("_clusters", None)

    if as_json:
        print(json.dumps({"genre": genre or "(기본)",
                          "scope": "알려진 패턴 검사만 수행함. 자연스러움과 문맥 적합성은 별도 의미 검토가 필요함.",
                          "requiresSemanticReview": True,
                          "files": out, "crossFile": cross,
                          "total": {"red": total_red, "yellow": total_yellow},
                          "exit": 1 if total_red else 0}, ensure_ascii=False, indent=1))
        return 1 if total_red else 0

    for o in out:
        print(f"── {o['file']}  🔴{o['counts']['red']} 🟡{o['counts']['yellow']}  (장르: {genre or '기본'})")
        for x in o["findings"]:
            icon = "🔴" if x["severity"] == "red" else "🟡"
            print(f"  {icon} {x['rule']} {x['name']} ×{x['count']} — 예: " +
                  "; ".join(f"L{l['line']} \"{l['match'][:24]}\"" for l in x["locations"][:3]))
    for x in cross:
        icon = "🔴" if x["severity"] == "red" else "🟡"
        print(f"── (파일 간)\n  {icon} {x['rule']} {x['name']} — " +
              "; ".join(l["match"] for l in x["locations"]))
    print(f"합계: 🔴{total_red} 🟡{total_yellow} — exit {1 if total_red else 0}")
    print("※ 알려진 패턴 검사 결과만 표시했다. 자연스러움과 문맥 적합성은 별도 의미 검토가 필요하다.")
    return 1 if total_red else 0


if __name__ == "__main__":
    sys.exit(main())
