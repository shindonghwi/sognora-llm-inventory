#!/usr/bin/env python3
"""Known-pattern detector for AI-sounding English copy (stdlib only).

This script detects only the regular-expression subset of references/rules.md. Exit 0 means no
registered red pattern was found; it does not certify naturalness or contextual fit.

Usage:
  python3 detect_en.py <file...|-> [--genre landing|UI|prose|report|formal|conversational] [--json] [--min red]
Exit: 0 = no red findings / 1 = red findings / 2 = not evaluated / 3 = execution error
"""
import json
import pathlib
import re
import sys


# (id, name, regex, yellow_at, red_at, exempt genres, note)
RULES = [
    ("ENH01", "추상 연결·빈 흐름",
     r"\b(?:everything|it all|all (?:your|the) [a-z][\w -]{0,24})\s+"
     r"(?:connects?|flows?|comes together|works together)"
     r"(?:\s+(?:seamlessly|naturally|effortlessly))?"
     r"(?:\s+in (?:one|a single) (?:place|platform|workspace))?",
     1, None, set(), "rules.md §1 — verify actor, action, and observable result"),
    ("ENH02", "마찰 없음 수식 반복",
     r"\b(?:seamless(?:ly)?|effortless(?:ly)?|frictionless(?:ly)?)\b",
     2, None, {"report", "formal"}, "rules.md §2 — single use may be legitimate; repetition is the signal"),
    ("ENH03", "추상 변환 동사",
     r"\b(?:unlock|empower|elevate|transform|reimagine|revolutionize|supercharge)(?:s|ed|ing)?\b",
     2, None, {"report", "formal"}, "rules.md §3 — replace only when context supplies a concrete outcome"),
    ("ENH04", "결과 없는 광고 공식",
     r"\b(?:take [^.!?\n]{1,40} to the next level|experience the difference|discover what(?:'s| is) possible|"
     r"the future of [^.!?\n]{1,36}|possibilities are endless|built for the way you work)\b",
     1, None, set(), "rules.md §4 — state the supported action or result"),
    ("ENH05", "기계적 도입·마무리",
     r"(?m)^\s*(?:in today(?:'s|’s) fast-paced world|in an ever-evolving landscape|in the digital age|"
     r"it is important to note|it's important to note|in conclusion)\b",
     None, 1, set(), "rules.md §5 — formulaic opening or conclusion"),
    ("ENH06", "Whether you 골격 반복",
     r"\bwhether you(?:'re| are)\b[^.!?\n]{1,80}\bor\b",
     2, None, set(), "rules.md §6 — repetition, not a single valid contrast"),
    ("ENH07", "not just 대구 반복",
     r"\b(?:not just [^.!?\n]{1,60}(?:[—–-]|,)?\s*(?:it(?:'s| is)|but)|more than just)\b",
     2, None, set(), "rules.md §6 — repeated contrast skeleton"),
    ("ENH08", "목적을 숨기는 도움말 공식",
     r"\b(?:designed to help you|helps you achieve|provides everything you need)\b",
     1, None, set(), "rules.md §7 — check whether a concrete action or result follows"),
]

UI_FAMILY = {"landing", "UI"}
CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".vue", ".svelte", ".py")


def mask(text: str, genre: str = "") -> str:
    """Mask protected spans while preserving offsets and line numbers."""
    def blank(match):
        return re.sub(r"\S", " ", match.group(0))

    text = re.sub(r"\A---\n.*?\n---\n", blank, text, flags=re.S)
    text = re.sub(r"```.*?```", blank, text, flags=re.S)
    text = re.sub(r"`[^`\n]+`", blank, text)
    text = re.sub(r"https?://[^\s)\]>]+", blank, text)
    if genre not in UI_FAMILY:
        text = re.sub(r"“[^“”]{2,}”|\"[^\"\n]{2,}\"", blank, text)
    return text


def scan(text: str, genre: str) -> dict:
    masked = mask(text, genre)
    findings = []
    for rule, name, pattern, yellow_at, red_at, exempt, note in RULES:
        if genre in exempt:
            continue
        matches = list(re.finditer(pattern, masked, flags=re.I))
        if rule == "ENH05" and genre == "report":
            # 보고서 결론 절의 실제 표지인 In conclusion만 면제한다. 같은 ENH05에 묶인
            # fast-paced world까지 통째로 면제하면 장르 예외가 다른 패턴을 숨긴다.
            matches = [match for match in matches
                       if not re.match(r"\s*in conclusion\b", match.group(0), flags=re.I)]
        count = len(matches)
        if not count:
            continue
        severity = "red" if red_at and count >= red_at else ("yellow" if yellow_at and count >= yellow_at else None)
        if not severity:
            continue
        locations = []
        for match in matches[:5]:
            locations.append({
                "line": masked.count("\n", 0, match.start()) + 1,
                "match": text[match.start():match.end()].strip(),
            })
        findings.append({"rule": rule, "name": name, "severity": severity, "count": count,
                         "locations": locations, "note": note})
    return {"findings": findings,
            "counts": {"red": sum(1 for item in findings if item["severity"] == "red"),
                       "yellow": sum(1 for item in findings if item["severity"] == "yellow")}}


def main() -> int:
    files, genre, as_json, min_severity = [], "", False, "yellow"
    it = iter(sys.argv[1:])
    for arg in it:
        if arg == "--json":
            as_json = True
        elif arg == "--genre":
            genre = next(it, "")
        elif arg == "--min":
            min_severity = next(it, "yellow")
        else:
            files.append(arg)
    if not files:
        print("usage: detect_en.py <file...|-> [--genre genre] [--json] [--min red]", file=sys.stderr)
        return 3
    if not genre:
        code_files = [item for item in files if item.lower().endswith(CODE_EXT)]
        if code_files:
            print("error: genre required for code/message files — not evaluated (exit 2)", file=sys.stderr)
            return 2

    reports, total_red, total_yellow = [], 0, 0
    for file_name in files:
        try:
            text = sys.stdin.read() if file_name == "-" else pathlib.Path(file_name).read_text(encoding="utf-8")
        except OSError as error:
            print(f"error: {error}", file=sys.stderr)
            return 3
        result = scan(text, genre)
        if min_severity == "red":
            result["findings"] = [item for item in result["findings"] if item["severity"] == "red"]
        reports.append({"file": file_name, **result})
        total_red += result["counts"]["red"]
        total_yellow += result["counts"]["yellow"]

    scope = "알려진 영어 패턴만 검사했다. 자연스러움과 문맥 적합성은 별도 의미 검토가 필요하다."
    payload = {"genre": genre or "(default)", "scope": scope, "requiresSemanticReview": True,
               "files": reports, "total": {"red": total_red, "yellow": total_yellow},
               "exit": 1 if total_red else 0}
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
    else:
        for report in reports:
            print(f"── {report['file']}  red {report['counts']['red']} / yellow {report['counts']['yellow']}  (genre: {genre or 'default'})")
            for item in report["findings"]:
                print(f"  {'RED' if item['severity'] == 'red' else 'YELLOW'} {item['rule']} {item['name']} ×{item['count']}")
        print(scope)
    return 1 if total_red else 0


if __name__ == "__main__":
    sys.exit(main())
