#!/usr/bin/env python3
"""과윤문 게이트 — 윤문 전후 변경률을 결정적으로 판정한다 (stdlib only).

LLM이 자가 보고한 변경률은 부정확하므로 이 수치를 SSOT로 삼는다.

사용: python3 change_rate.py <원문파일> <윤문본파일>
Exit: 0 OK(<30%) / 1 WARN(30~50%) / 2 ABORT(>=50%) / 3 실행 오류
"""
import difflib
import re
import sys

WARN = 0.30
ABORT = 0.50


def normalize(text: str) -> str:
    # 공백·마크다운 장식 차이가 변경률을 부풀리지 않게 최소 정규화만 한다.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text)
    return text.strip()


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: change_rate.py <before> <after>", file=sys.stderr)
        return 3
    try:
        with open(sys.argv[1], encoding="utf-8") as f:
            before = normalize(f.read())
        with open(sys.argv[2], encoding="utf-8") as f:
            after = normalize(f.read())
    except OSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 3
    if not before:
        print("error: 원문이 비어 있음", file=sys.stderr)
        return 3

    rate = 1.0 - difflib.SequenceMatcher(None, before, after).ratio()
    pct = rate * 100
    if rate >= ABORT:
        verdict, code = "ABORT — 채택 금지·롤백", 2
    elif rate >= WARN:
        verdict, code = "WARN — 과윤문 경고", 1
    else:
        verdict, code = "OK — 수렴", 0
    print(f"change_rate: {pct:.1f}%  gate: {verdict} (경고 30% / 중단 50%)")
    return code


if __name__ == "__main__":
    sys.exit(main())
