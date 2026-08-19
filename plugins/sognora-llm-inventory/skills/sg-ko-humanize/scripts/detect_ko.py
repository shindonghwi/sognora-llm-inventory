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
- rules.md에 없는 패턴을 여기서 창설하지 않는다(SSOT는 rules.md).

## 오탐 캘리브레이션 (1987년 대한민국헌법 51KB = AI 이전 사람 격식문 실측)
- 연결어미 뒤 쉼표("-고,/-며,"): 헌법 64회 → 🔴 자격 없음. 밀도 기준 🟡로만, 법률 장르 면제.
- "에 있어" 9회 · "에 대하여/대한" 19회 · "할 수 있" 53회 → 법률·공적 장르 면제 필수.
- 결론적으로·되어지·과장 어휘·"것이다.": 헌법 0회 → 🔴 정규식화 안전.

사용:
  python3 detect_ko.py <file...|-> [--genre 칼럼|리포트|블로그|공적|구어|법률|스펙] [--json] [--min red]
  '-' 는 stdin(개행 구분 카피 문자열 — forge가 DOM 텍스트를 파이프하는 인터페이스).
전처리: 코드펜스·인라인 코드·URL·front-matter·큰따옴표 인용은 검사에서 제외(자리는 보존).
Exit: 0 = 🔴 없음 / 1 = 🔴 있음 / 3 = 실행 오류
"""
import json
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
]

STRUCT_NEXT_RE = re.compile(r"^\s*(?:[-*|]|\d{1,2}[.)]|```|#)")  # KOH03 구조적 면제용


def mask(text: str) -> str:
    """검사 제외 구간을 같은 길이의 공백으로 치환 — 오프셋·줄번호 보존."""
    def blank(m):
        return re.sub(r"\S", " ", m.group(0))
    text = re.sub(r"\A---\n.*?\n---\n", blank, text, flags=re.S)        # front-matter
    text = re.sub(r"```.*?```", blank, text, flags=re.S)                 # 코드펜스
    text = re.sub(r"`[^`\n]+`", blank, text)                             # 인라인 코드
    text = re.sub(r"https?://[^\s)\]>]+", blank, text)                   # URL
    text = re.sub(r"“[^“”]{2,}”|\"[^\"\n]{2,}\"", blank, text)  # 인용 보호
    return text


def scan(text: str, genre: str) -> dict:
    masked = mask(text)
    lines = masked.splitlines()
    sent_n = max(1, len(re.findall(r"[.!?]\s|[.!?]$|\n", masked)))
    findings = []
    for rid, name, pat, y_at, r_at, exempt, note in RULES:
        if genre in exempt:
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
        sev = "red" if (r_at and n >= r_at) else ("yellow" if (y_at and n >= y_at) else None)
        if not sev:
            continue
        locs = []
        for m in matches[:5]:
            ln = masked.count("\n", 0, m.start()) + 1
            locs.append({"line": ln, "match": text[m.start():m.end()].strip()})
        findings.append({"rule": rid, "name": name, "severity": sev, "count": n,
                         "locations": locs, "note": note})
    return {"findings": findings,
            "counts": {"red": sum(1 for f in findings if f["severity"] == "red"),
                       "yellow": sum(1 for f in findings if f["severity"] == "yellow")}}


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

    if as_json:
        print(json.dumps({"genre": genre or "(기본)", "files": out,
                          "total": {"red": total_red, "yellow": total_yellow},
                          "exit": 1 if total_red else 0}, ensure_ascii=False, indent=1))
        return 1 if total_red else 0

    for o in out:
        print(f"── {o['file']}  🔴{o['counts']['red']} 🟡{o['counts']['yellow']}  (장르: {genre or '기본'})")
        for x in o["findings"]:
            icon = "🔴" if x["severity"] == "red" else "🟡"
            print(f"  {icon} {x['rule']} {x['name']} ×{x['count']} — 예: " +
                  "; ".join(f"L{l['line']} \"{l['match'][:24]}\"" for l in x["locations"][:3]))
    print(f"합계: 🔴{total_red} 🟡{total_yellow} — exit {1 if total_red else 0}")
    return 1 if total_red else 0


if __name__ == "__main__":
    sys.exit(main())
