#!/usr/bin/env python3
"""English humanization safety gate (stdlib only).

Three checks, all of which must pass:
  1) invariants — numbers, negation, URLs, email addresses, and explicit protected terms are unchanged;
  2) edit distance — how much of the source was rewritten;
  3) injected tells — whether the rewrite added detect_en.py matches the source did not have.
It cannot certify semantic equivalence.

Usage: change_rate_en.py <before> <after> [--protect name,name] [--json]
Exit: 0 accept / 1 warn (over 30%, or a yellow pattern added) / 2 reject / 3 execution error
      A broken invariant or an added red-class pattern is always 2, whatever the edit distance.
"""
import difflib
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import detect_en  # noqa: E402  same-folder detector; the gate re-scans the rewrite with it


# Thresholds — definition: convention set by the user rule "warn over 30%, reject over 50%" (SKILL.md rule 4);
# mirrors sg-ko-humanize/change_rate.py so both gates read the same. No corpus calibration behind these numbers.
WARN = 0.30
ABORT = 0.50
SHORT_TEXT = 200        # definition: below this, SequenceMatcher ratio is unstable — add the 2-gram warning (convention)
MIN_BIGRAM_KEEP = 0.30  # definition: minimum shared 2-gram share for short copy (convention, no calibration)

NUMBER_RE = re.compile(
    r"\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent|seconds?|minutes?|hours?|days?|weeks?|months?|years?|"
    r"bytes?|KB|MB|GB|TB|users?|seats?|files?|items?|times?)?\b", re.I
)
URL_RE = re.compile(r"https?://[^\s)\]\"'<>]+")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
NEGATION_RE = re.compile(r"\b(?:no|not|never|neither|nor|cannot|can't|won't|without|unless)\b", re.I)
# The "not" in "It's not X, it's Y", "No X. No Y. Just Z." and "not just X but Y" is rhetorical, not a fact.
# Removing the frame is the fix rules.md §8 asks for, so it must not read as a lost negation.
RHETORICAL = [rule[2] for rule in detect_en.RULES if rule[0] in {"ENH07", "ENH16", "ENH17"}]
# Displacement (rules.md §8): a banned tic returns as its neighbour. Opus 5.5 cut em dashes and grew
# bullets, bold-lead bullets, and colons instead (Graphite, Arize, Pangram), so these only warn.
BULLET_RE = re.compile(r"(?m)^\s*(?:[-*•]|\d+[.)])\s+")
BOLD_LEAD_RE = re.compile(r"(?m)^\s*(?:(?:[-*•]|\d+[.)])\s+)?\*\*[^*\n]{1,60}\*\*")
# After an em dash ban, users report colons, semicolons, and spaced en dashes taking its place (rules.md §8)
SWAP_RE = re.compile(r"[;:](?=\s)|(?<=\w) – (?=\w)")
# What humanizers plant, from 154 Trustpilot reviews that describe output (rules.md §8): emoji, choppy
# fragments, broken capitalisation, and names swapped for synonyms. These also only warn.
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
LOWER_START_RE = re.compile(r"(?m)(?:^|(?<=[.!?]\s))[a-z]")
# 정의: 세 단어 이하로 끝나는 문장을 단편문으로 센다. §8 ENH16의 "No noise." 한 토막과 같은 단위다.
FRAGMENT_WORDS = 3
NOT_A_NAME = {"I", "I'm", "I'd", "I'll", "I've", "I’m", "I’d", "I’ll", "I’ve"}
CAPITAL_RE = re.compile(r"\b[A-Z][A-Za-z0-9]*(?:['’][A-Za-z]+)?")


def normalize(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def drop_rhetoric(text: str) -> str:
    for pattern in RHETORICAL:
        text = re.sub(pattern, " ", text, flags=re.I)
    return text


def fragments(text: str) -> int:
    count = 0
    for line in text.splitlines():
        if re.match(r"\s*(?:#|[-*•]\s|\d+[.)]\s)", line):
            continue  # headings and list items are not sentences
        for piece in re.split(r"(?<=[.!?])\s+", line.strip()):
            if re.search(r"[.!?]$", piece) and len(re.findall(r"[A-Za-z0-9’']+", piece)) <= FRAGMENT_WORDS:
                count += 1
    return count


def names(text: str) -> set:
    """Capitalised words that do not open a sentence, a heading, or a list item: mostly proper nouns."""
    out = set()
    for line in text.splitlines():
        if re.match(r"\s*#", line):
            continue
        for match in CAPITAL_RE.finditer(line):
            head = line[:match.start()].rstrip(" \t\"“‘'(*_")
            if not head or head[-1] in ".!?:;-•>|" or re.fullmatch(r"\s*\d+[.)]", head):
                continue
            if match.group(0) not in NOT_A_NAME:
                out.add(re.sub(r"['’]s$", "", match.group(0)))
    return out


def capitals(text: str) -> set:
    return {re.sub(r"['’]s$", "", token) for token in CAPITAL_RE.findall(text)}


def injected(before: str, after: str, genre: str = "") -> list:
    """Tells the rewrite added. The rewriting model is Claude, and it plants its own habits back in.

    Compares match counts per rule only, so a swap inside one rule (In short → In summary) passes.
    """
    masked_before, masked_after = detect_en.mask(before, genre), detect_en.mask(after, genre)
    out = []
    for rule, name, pattern, _yellow_at, red_at, _exempt, _note in detect_en.RULES:
        count_before = len(re.findall(pattern, masked_before, flags=re.I))
        count_after = len(re.findall(pattern, masked_after, flags=re.I))
        if count_after <= count_before:
            continue
        # rules.md §8 Claude tics and red-class rules roll back on a single addition; yellow-only rules warn
        hard = rule in detect_en.CLAUDE_TICS or red_at is not None
        out.append({"rule": rule, "name": name, "before": count_before, "after": count_after, "rollback": hard,
                    "examples": [m.group(0).strip() for m in re.finditer(pattern, masked_after, flags=re.I)][:3]})
    swaps = [("BULLET", "불릿 유입", BULLET_RE), ("BOLDLEAD", "굵은 머리말 유입", BOLD_LEAD_RE),
             ("EMOJI", "이모지 유입", EMOJI_RE), ("LOWER", "소문자 문장 시작 유입", LOWER_START_RE)]
    if masked_before.count("—") > masked_after.count("—"):
        swaps.append(("SWAP", "엠대시 → 콜론·세미콜론·엔대시 치환", SWAP_RE))
    for rule, name, regex in swaps:
        count_before, count_after = len(regex.findall(masked_before)), len(regex.findall(masked_after))
        if count_after > count_before:
            out.append({"rule": rule, "name": name, "before": count_before, "after": count_after, "rollback": False,
                        "examples": [m.group(0).strip() for m in regex.finditer(masked_after)][:3]})
    count_before, count_after = fragments(masked_before), fragments(masked_after)
    if count_after > count_before:
        out.append({"rule": "FRAGMENT", "name": "단편문 유입", "before": count_before, "after": count_after,
                    "rollback": False, "examples": []})
    kept = names(masked_before)
    lost = sorted(kept - capitals(masked_after))
    if lost:
        out.append({"rule": "NAME", "name": "고유명사 소실·치환", "before": len(kept), "after": len(kept) - len(lost),
                    "rollback": False, "examples": lost[:3]})
    return out


def facts(text: str, protect: list) -> dict:
    return {
        "numbers": Counter(re.sub(r"\s+", "", item.lower()) for item in NUMBER_RE.findall(text)),
        "negation": Counter({"NEG": len(NEGATION_RE.findall(drop_rhetoric(text)))}),
        "URLs": Counter(URL_RE.findall(text)),
        "emails": Counter(EMAIL_RE.findall(text)),
        "protected": Counter({item: text.count(item) for item in protect if item}),
    }


def compare(before: str, after: str, protect: list) -> list:
    before_facts, after_facts, broken = facts(before, protect), facts(after, protect), []
    for kind in before_facts:
        lost = before_facts[kind] - after_facts[kind]
        gained = after_facts[kind] - before_facts[kind]
        if lost or gained:
            broken.append({"kind": kind, "lost": sorted(lost.elements()), "gained": sorted(gained.elements())})
    return broken


def bigrams(text: str) -> set:
    compact = re.sub(r"\s+", "", text.lower())
    return {compact[index:index + 2] for index in range(len(compact) - 1)}


def main() -> int:
    files, protect, as_json = [], [], False
    usage = "usage: change_rate_en.py <before> <after> [--protect name,name] [--json]"
    it = iter(sys.argv[1:])
    for arg in it:
        if arg in ("-h", "--help"):
            print(usage)
            return 0
        if arg == "--json":
            as_json = True
        elif arg == "--protect":
            protect = [item.strip() for item in next(it, "").split(",") if item.strip()]
        elif arg.startswith("--protect="):
            protect = [item.strip() for item in arg.split("=", 1)[1].split(",") if item.strip()]
        else:
            files.append(arg)
    if len(files) != 2:
        print(usage, file=sys.stderr)
        return 3
    try:
        before = normalize(Path(files[0]).read_text(encoding="utf-8"))
        after = normalize(Path(files[1]).read_text(encoding="utf-8"))
    except OSError as error:
        print(f"error: {error}", file=sys.stderr)
        return 3
    if not before:
        print("error: source text is empty", file=sys.stderr)
        return 3

    broken = compare(before, after, protect)
    rate = 1.0 - difflib.SequenceMatcher(None, before, after).ratio()
    short = len(before) < SHORT_TEXT
    source_bigrams = bigrams(before)
    keep = len(source_bigrams & bigrams(after)) / len(source_bigrams) if source_bigrams else 1.0

    added = injected(before, after)
    if broken:
        verdict, code = "ABORT — 결정 가능한 사실이 바뀜", 2
    elif any(item["rollback"] for item in added):
        verdict, code = "ABORT — AI 티 유입·롤백", 2
    elif rate > ABORT:
        verdict, code = "ABORT — 변경률 50% 초과", 2
    elif rate > WARN:
        verdict, code = "WARN — 변경률 30% 초과", 1
    elif short and keep < MIN_BIGRAM_KEEP:
        verdict, code = f"WARN — 짧은 카피의 원문 2-gram 유지율 {keep * 100:.0f}%", 1
    elif added:
        verdict, code = "WARN — 🟡 패턴 유입 · 사람 확인", 1
    else:
        verdict, code = "ACCEPT — 결정적 게이트 통과", 0

    payload = {"change_rate": round(rate * 100, 1), "short": short,
               "bigram_keep": round(keep * 100, 1), "invariant_breaks": broken, "injected": added,
               "scope": "결정 가능한 불변식, 변경률, AI 티 유입만 검사했다. 의미 동등성은 별도 검토가 필요하다.",
               "verdict": verdict, "exit": code}
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
    else:
        print(f"change_rate: {payload['change_rate']:.1f}%  gate: {verdict}")
        for item in broken:
            print(f"  ABORT {item['kind']}: lost={item['lost'] or 'none'} gained={item['gained'] or 'none'}")
        for item in added:
            print(f"  {'ABORT' if item['rollback'] else 'WARN'} {item['rule']} {item['name']} "
                  f"{item['before']}→{item['after']}: " + "; ".join(f'"{e[:40]}"' for e in item["examples"]))
        if added:
            print("  → The rewrite added tells the source did not have. Do not swap them for a neighbouring tic; "
                  "restore the source wording or delete the sentence.")
        print(payload["scope"])
    return code


if __name__ == "__main__":
    sys.exit(main())
