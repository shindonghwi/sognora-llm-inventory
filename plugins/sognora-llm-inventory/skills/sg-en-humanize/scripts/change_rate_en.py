#!/usr/bin/env python3
"""English humanization safety gate (stdlib only).

Checks deterministic invariants (numbers, negation, URLs, email addresses, and explicit protected
terms) plus edit distance. It cannot certify semantic equivalence.

Usage: change_rate_en.py <before> <after> [--protect name,name] [--json]
Exit: 0 accept / 1 warn / 2 reject / 3 execution error
"""
import difflib
import json
import re
import sys
from collections import Counter
from pathlib import Path


WARN = 0.30
ABORT = 0.50
SHORT_TEXT = 200
MIN_BIGRAM_KEEP = 0.30

NUMBER_RE = re.compile(
    r"\b\d[\d,]*(?:\.\d+)?\s*(?:%|percent|seconds?|minutes?|hours?|days?|weeks?|months?|years?|"
    r"bytes?|KB|MB|GB|TB|users?|seats?|files?|items?|times?)?\b", re.I
)
URL_RE = re.compile(r"https?://[^\s)\]\"'<>]+")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
NEGATION_RE = re.compile(r"\b(?:no|not|never|neither|nor|cannot|can't|won't|without|unless)\b", re.I)


def normalize(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def facts(text: str, protect: list) -> dict:
    return {
        "numbers": Counter(re.sub(r"\s+", "", item.lower()) for item in NUMBER_RE.findall(text)),
        "negation": Counter({"NEG": len(NEGATION_RE.findall(text))}),
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
    it = iter(sys.argv[1:])
    for arg in it:
        if arg == "--json":
            as_json = True
        elif arg == "--protect":
            protect = [item.strip() for item in next(it, "").split(",") if item.strip()]
        else:
            files.append(arg)
    if len(files) != 2:
        print("usage: change_rate_en.py <before> <after> [--protect name,name] [--json]", file=sys.stderr)
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

    if broken:
        verdict, code = "ABORT — 결정 가능한 사실이 바뀜", 2
    elif rate > ABORT:
        verdict, code = "ABORT — 변경률 50% 초과", 2
    elif rate > WARN:
        verdict, code = "WARN — 변경률 30% 초과", 1
    elif short and keep < MIN_BIGRAM_KEEP:
        verdict, code = f"WARN — 짧은 카피의 원문 2-gram 유지율 {keep * 100:.0f}%", 1
    else:
        verdict, code = "ACCEPT — 결정적 게이트 통과", 0

    payload = {"change_rate": round(rate * 100, 1), "short": short,
               "bigram_keep": round(keep * 100, 1), "invariant_breaks": broken,
               "scope": "결정 가능한 불변식과 변경률만 검사했다. 의미 동등성은 별도 검토가 필요하다.",
               "verdict": verdict, "exit": code}
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
    else:
        print(f"change_rate: {payload['change_rate']:.1f}%  gate: {verdict}")
        for item in broken:
            print(f"  ABORT {item['kind']}: lost={item['lost'] or 'none'} gained={item['gained'] or 'none'}")
        print(payload["scope"])
    return code


if __name__ == "__main__":
    sys.exit(main())
