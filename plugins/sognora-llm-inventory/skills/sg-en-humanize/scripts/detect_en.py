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


AP = "['’]"  # straight and curly apostrophe

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
    # --- rules.md §8 Claude 말버릇. 임계 근거는 2022년 이전 사람 영어 코퍼스 실측이다: 위키백과 15개 문서(2021-06 판),
    # Paul Graham 에세이 20편, 2020–2021년 랜딩 페이지 48개, 2019년 HN 댓글, 소설 2편, 미국 헌법(약 68만 단어).
    # red_at=1인 규칙은 이 코퍼스에서 0회였다.
    ("ENH09", "챗봇 응대 문구",
     rf"\byou{AP}re (?:absolutely|totally|completely|exactly) (?:right|correct)\b|"
     r"\b(?:great|excellent|fantastic|brilliant|perfect) question\b|\bwhat a (?:great|fantastic|thoughtful) (?:question|idea)\b|"
     r"\bI hope this helps\b|\b(?:now )?I (?:now )?have (?:a|the) (?:full|complete|clear) picture\b|"
     r"\b(?:now )?I see the (?:issue|problem)!|\bfound the (?:culprit|smoking gun)\b|"
     rf"\byou{AP}re right to push back\b|\b(?:I{AP}d|I would|let me) (?:like to )?gently push back\b",
     None, 1, set(), "rules.md §8 — chat leftovers; 0 in the human corpus"),
    ("ENH10", "챗봇 응대 여닫기",
     rf"(?m)(?:^|(?<=[.!?]\s))(?:Certainly|Absolutely|Of course|Perfect|Excellent)!|\bI{AP}d be (?:happy|glad|delighted) to\b|"
     rf"\b(?:would you like me to|do you want me to)\b|\blet me know if you{AP}d like\b|\bthat{AP}s on me\b|"
     rf"\byou{AP}re not imagining (?:it|this|things)\b|\b(?:great|sharp) catch\b",
     1, 2, {"conversational"}, "rules.md §8 — assistant openers and closing offers; people write them in chat, so conversational is exempt"),
    ("ENH11", "솔직함 자기 선언",
     rf"\bthe honest (?:answer|take|truth|version|assessment)\b|\bhonest (?:take|caveats?|assessment|read)\b|"
     rf"\bI{AP}ll be (?:direct|honest|blunt)\b|\blet me be (?:honest|direct|blunt|candid)\b|"
     rf"\bI (?:want|need|aim) to be (?:fully |completely )?(?:direct|honest|upfront|candid)\b",
     None, 1, set(), "rules.md §8 — Anthropic's own system prompts ban these; 0 in the human corpus"),
    ("ENH12", "genuinely·honestly 강조어",
     r"\bgenuinely\b|\bhonestly\b|\benormously\b|\bplainly\b",
     1, None, {"conversational"}, "rules.md §8 — density decides red; see ENH12_RED_PER_1K"),
    ("ENH13", "Claude 은어·은유",
     r"\bload[- ]bearing\b(?!\s+(?:walls?|structures?|beams?|columns?|capacity|elements?|members?|masonry|frames?|bones?|joints?|partitions?))|"
     r"\bbelt[- ]and[- ](?:suspenders?|braces)\b|\bfoot-?guns?\b|\bearns? (?:its|their) keep\b|\bblast radius\b|\bsmoking gun\b|"
     r"\bin a trench ?coat\b|"
     r"\b(?:is|are) doing a lot of work\b|\bthe seams? between\b|"
     r"\ba dial worth\b",
     None, 1, set(), "rules.md §8 — figurative jargon; 0 in the human corpus"),
    ("ENH14", "quietly + 변화 동사",
     r"\bquietly\s+(?:\w+ly\s+)?(?:reshap|transform|redefin|revolutioni|outperform|power|becom|rewrit|reinvent|replac|erod|"
     r"disappear|vanish|kill|eat|shift|evolv|dominat|surfac|compound|accumulat|rot|chang|shap)\w*",
     None, 1, set(), "rules.md §8 — 'quietly reshaping'; literal 'closed the door quietly' is not matched"),
    ("ENH15", "예고·중요도 신호어",
     rf"(?m)\bhere{AP}s the (?:thing|kicker|catch|twist|deal|part|truth|trick|secret|bit|rub)\b|\bhere{AP}s why\s*[:.]|"
     r"(?:^|(?<=[.!?]\s))(?:And|But) honestly\?|\blet that sink in\b|(?:^|(?<=[.!?]\s))The key insight\b|"
     r"(?:^|(?<=[.!?]\s))(?:One|Another|The) (?:small |little |big |important )?(?:caveat|wrinkle)s?\s*[:—–]|"
     r"\b(?:a|one|another) (?:small |little |slight )?wrinkle\b|"
     r"(?:^|(?<=[.!?]\s))(?:The|And the) (?:kicker|catch|result|twist|best part|punchline|takeaway|upshot|bottom line|fix|secret|trick)\?|"
     r"(?:^|(?<=[.!?]\s))(?:This|That) matters\b|^\s*#*\s*Why (?:this|it) matters\b|\bmatters (?:because|enormously|more than)\b|"
     rf"\b(?:because|and) (?:it|that) matters\b|\bhere{AP}s what [^.!?\n:]{{1,40}}:|\bthis is where [^.!?\n]{{1,30}} comes in\b|"
     rf"\bcan(?:not|{AP}t) be overstated\b",
     1, 2, set(), "rules.md §8 — signposts announce instead of saying; human corpus 2 hits in 68만 words"),
    ("ENH16", "단편 대구 연타",
     r"(?m)(?:^|(?<=[.!?]\s))No [^.!?\n]{1,30}\.\s+No [^.!?\n]{1,30}\.\s+(?:Just|Only)\b|\bno [^.!?,\n]{1,25}, no [^.!?,\n]{1,25}, (?:just|only)\b|"
     r"(?:^|(?<=[.!?]\s))Not (?:a|an|the|just) [^.!?\n]{1,40}\.\s+(?:A|An|The|Just) [^.!?\n]{1,40}\.",
     None, 1, set(), "rules.md §8 — 'No X. No Y. Just Z.' / 'Not a detail. A decision.'; 0 in the human corpus"),
    ("ENH17", "It's not X, it's Y 대구",
     rf"(?:\b(?:it|this|that|they|we|you){AP}(?:s|re) not|\b(?:is|are|was|were)(?:n{AP}t| not)) (?:just |only |merely |simply |really )?"
     rf"(?:about )?[^.!?\n]{{1,50}}?[.;,—–]\s*(?:it|this|that|they|we|you)(?:{AP}(?:s|re)| is| are| was| were)\b|"
     r"\bnot because\b[^.!?\n]{1,60}\bbut because\b|\brather than merely\b|\bless like (?:a|an) [^.!?,\n]{1,30} and more like\b|"
     rf"\bis more than (?:just )?(?:a|an) [^.!?,\n]{{1,30}}[,;—–]\s*(?:it|this){AP}s\b",
     1, 2, set(), "rules.md §8 — density decides; see ENH17_YELLOW_PER_1K"),
    ("ENH18", "엠대시",
     r"—|(?<=\w) -- (?=\w)|(?<=\w)--(?=\w)",
     1, 2, {"conversational"}, "rules.md §8 — density decides red; see ENH18_RED_PER_1K"),
    ("ENH19", "요약·도입 표지",
     rf"(?m)\blet{AP}s (?:dive|dig|jump) in(?:to)?\b|\blet{AP}s (?:break (?:it|this|that) down|unpack)\b|"
     r"(?:^|(?<=[.!?]\s))(?:In short|In summary|To sum up|To summarize|Bottom line|TL;DR|Key takeaways?|The takeaway|The short version|"
     r"Taken together|Looking ahead|At its core)\s*[,:]",
     1, 2, set(), "rules.md §8 — summary markers replaced em dashes in Opus 5.5"),
    ("ENH20", "worth noting 표지",
     rf"(?m)\b(?:it{AP}s |it is )?(?:also )?worth (?:noting|flagging|mentioning|calling out|pointing out|highlighting|emphasizing|stressing|"
     r"knowing|naming|stating|being (?:precise|clear|explicit))\b|"
     r"(?:^|(?<=[.!?]\s))Notably,",
     1, 2, set(), "rules.md §8 — say the thing instead of announcing it"),
    ("ENH21", "the real X",
     r"\bthe real (?:win|question|issue|problem|story|value|magic|unlock|reason|bottleneck|answer|lesson|insight|challenge|cost|risk|power|difference|point)\b",
     1, 2, set(), "rules.md §8 — people use it too; two in one text is the tic"),
    ("ENH22", "-ing 꼬리 해설",
     r",\s+(?:highlighting|underscoring|showcasing|emphasizing|symbolizing|cementing|solidifying|fostering|paving the way)\b",
     1, 2, set(), "rules.md §8 — Wikipedia 'Signs of AI writing' superficial analysis"),
    ("ENH23", "GPT 시기 상투어",
     r"\b(?:a|the) testament to\b|\btapestry\b|\bdelv(?:e|es|ed|ing)\b|\b(?:plays?|played|playing) a (?:crucial|vital|pivotal) role\b|"
     r"\bnestled\b|\bbustling\b|\bin the heart of\b|\bever[- ]evolving\b|\bnavigat\w* the (?:complexities|intricacies)\b|"
     r"\bindelible mark\b|\brich (?:tapestry|heritage)\b|\bunderscor(?:e|es|ed|ing) the importance\b",
     1, 2, set(), "rules.md §8 — Wikipedia 'Signs of AI writing' AI vocabulary"),
    ("ENH24", "가짜 성찰·발견 프레임",
     rf"(?m)\bwhat separates\b|\bstops? being [^.!?\n]{{1,40}}\b(?:and|it) (?:becomes|starts)\b|\bworth (?:sitting with|talking about|dwelling on)\b|"
     rf"\b(?:(?:that|this|it){AP}s|is|was|are|were)(?:n{AP}t| not) nothing\b|(?:^|(?<=[.!?]\s))(?:That|This)(?:{AP}s| is) real\.|"
     rf"\bsit with (?:that|this|it)\b|\b(?:I|we) keep (?:coming|going) back to\b|\bthe question (?:I keep|that keeps|that kept)\b|"
     rf"\bhere{AP}s where (?:it gets|things get|I (?:landed|come down))\b|\bwhere I landed\b|\bwhat struck me (?:most|hardest)\b|"
     rf"\bthe one that surprised me most\b|\bI can{AP}t stop thinking about\b|\bthe tell (?:is|here)\b|\bthat{AP}s the tell\b|"
     rf"\b(?:that{AP}s )?the whole (?:game|ballgame)\b|\bseen this movie\b|\b(?:nobody|no one) handed\b|\bthrough-?line\b|"
     rf"\bdouble-click(?:ing)? on\b|\bwhat (?:actually )?moved (?:is|was)\b",
     None, 1, set(), "rules.md §8 — claudisms.ai banlist and Graphite Claude-only phrases; 0 in the human corpus"),
]
CLAUDE_TICS = {f"ENH{n:02d}" for n in range(9, 25)}
# 밀도 규칙의 실측 근거: 사람 비소설 문서(소설 제외)의 1천 단어당 최대치를 재고, 그 2배를 넘어야 🔴로 올린다.
# ENH18 엠대시 — 최대 2.65회(Paul Graham 'ds'). 2021년 랜딩 48개 중 Superhuman·Trello·Dropbox 3개는 이 선을 넘는다.
#   Opus 5 실측(Arize 12.9회, Arena 15.2회)과 구분되지 않는 밀도라 사람 글이어도 지금 독자에게는 AI 티로 읽힌다.
# ENH12 genuinely·honestly — 최대 1.59회(2021년 Supabase 랜딩의 트윗 후기 3회).
# ENH17 It's not X, it's Y — 최대 1.15회(2019년 HN 댓글 2,620단어에 3회). 이 최대치 이하는 세지 않는다.
#   사람 대화문 75묶음 중 42묶음에 한 번 이상 나와서, 1회 🟡로 두면 사람 글마다 경고가 뜬다.
ENH18_RED_PER_1K = 5.3
ENH12_RED_PER_1K = 3.2
ENH17_YELLOW_PER_1K = 1.15
ENH17_RED_PER_1K = 2.3

# Genre whitelist — single source for docs and detect_bilingual. Unknown genre = exit 3 (a typo like `ui` would
# silently re-enable quote masking and pass i18n files with red 0 — the incident this guard prevents).
GENRES = ("landing", "UI", "prose", "report", "formal", "conversational")
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
    words = max(1, len(re.findall(r"[A-Za-z][A-Za-z'’-]*", masked)))
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
        if rule == "ENH18" and count / words * 1000 <= ENH18_RED_PER_1K:
            red_at = None  # 코퍼스 실측 범위 안 — 긴 글에 섞인 엠대시는 🟡까지만
        if rule == "ENH12" and count >= 2 and count / words * 1000 > ENH12_RED_PER_1K:
            red_at = 1  # 코퍼스 실측 최대치의 2배를 넘는 밀도 — 버릇이다
        if rule == "ENH17":
            if count / words * 1000 <= ENH17_YELLOW_PER_1K:
                continue  # 코퍼스 실측 최대치 이하 — 사람도 이만큼은 쓴다
            if count / words * 1000 <= ENH17_RED_PER_1K:
                red_at = None  # 코퍼스 실측 최대치의 2배 이하는 🟡까지만
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
    usage = f"usage: detect_en.py <file...|-> [--genre {'|'.join(GENRES)}] [--json] [--min red]"
    it = iter(sys.argv[1:])
    for arg in it:
        if arg in ("-h", "--help"):
            print(usage)
            return 0
        if arg == "--json":
            as_json = True
        elif arg == "--genre":
            genre = next(it, "")
        elif arg.startswith("--genre="):
            genre = arg.split("=", 1)[1]
        elif arg == "--min":
            min_severity = next(it, "yellow")
        else:
            files.append(arg)
    if not files:
        print(usage, file=sys.stderr)
        return 3
    if genre and genre not in GENRES:
        print(f"error: unknown genre '{genre}' — not evaluated (exit 3). Allowed: {'|'.join(GENRES)}", file=sys.stderr)
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
