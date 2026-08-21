#!/usr/bin/env python3
"""locale_parity.py — i18n 메시지 파일의 로케일 쌍 정합 판정 (stdlib only).

## 왜 있나
`change_rate.py`는 **같은 파일의 before/after**를 본다. 그래서 한 로케일만 고쳐도
그 안에서는 아무 불변식도 깨지지 않는다 — en은 "No. …"인데 ko에서 "아니요"가 사라지는
사고가 이 사각에서 난다. 룰북이 "en/ko 병렬 쌍 정합은 어떤 문자열 단위 게이트도 못 잡는다"고
적어둔 축이 이것이고, 이 스크립트가 그 판정자다. 축이 다르므로 별도 계기로 둔다.

## 무엇을 보나 (전부 언어 중립적으로 결정 가능한 것만)
- **키 누락**: base에 있는 키가 target에 없다(또는 그 반대)
- **숫자**: "최대 10MB"가 한쪽에서 5MB가 되거나 사라지면 잡는다. 영어의 `eight`
  같은 0~99 숫자 단어는 상대 로케일의 아라비아 숫자와 대조할 때 같은 값으로 정규화한다.
- **보간 토큰**: {count} · {{name}} · %s · $1 — 깨지면 런타임에서 티가 안 나고 문장만 망가진다
- **URL**
- **약어·확장자**: 연속 대문자 2자 이상(JPG·PNG·API)
- **응답 극성**: base가 "No."/"Yes."로 시작하면 target에 대응 부정/긍정 표지가 있어야 한다

## 무엇을 안 보나 (정직한 경계)
문장 수·어순·길이 비율은 언어마다 정상적으로 다르므로 보지 않는다. **번역이 맞는지**는
판정하지 않는다 — 그건 사람이 본다. 이 계기는 "한쪽만 고쳐서 사실이 어긋난 것"만 잡는다.

사용:
  python3 locale_parity.py <file...> [--base en] [--target ko] [--json]
Exit: 0 = 불일치 없음 / 1 = 불일치 있음 / 2 = 파싱 불가(판정 안 함) / 3 = 실행 오류
"""
import json
import re
import sys

NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")
EN_UNITS = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4,
            "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
            "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
            "fourteen": 14, "fifteen": 15, "sixteen": 16,
            "seventeen": 17, "eighteen": 18, "nineteen": 19}
EN_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
           "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
_EN_ONES = "one|two|three|four|five|six|seven|eight|nine"
_EN_SMALL = "|".join(EN_UNITS)
_EN_TENS = "|".join(EN_TENS)
EN_NUM_WORD_RE = re.compile(
    rf"\b(?:(?:{_EN_TENS})(?:[- ](?:{_EN_ONES}))?|(?:{_EN_SMALL}))\b", re.I
)
# 통화 표지 — 가격은 로케일마다 **정당하게 다르다**($19 ↔ 19,000원). 실코퍼스에서
# 이걸 안 빼면 요금제 파일이 통째로 오탐이 된다.
CUR_RE = re.compile(r"[$₩€¥£]|원\b|USD|KRW|EUR|JPY")
PH_RE = re.compile(r"\{\{?\s*[\w.]+\s*\}?\}|%[sd]|\$\d+|:[a-z][\w]*(?=\W|$)")
URL_RE = re.compile(r"https?://[^\s)\]\"']+")
# 약어는 **기술 용어 화이트리스트로만** 본다.
# 첫 구현은 연속 대문자를 전부 약어로 셌다가 실코퍼스에서 터졌다 — 영문 eyebrow는
# "SHARE WITH CLIENTS"처럼 대문자가 **장식**이고, 한글에는 대응물이 없는 게 정상이다.
# 우리가 실제로 지키려던 건 "JPG, PNG 최대 10MB"가 양쪽에서 같은가였다.
TECH = {"JPG", "JPEG", "PNG", "WEBP", "GIF", "SVG", "PDF", "HEIC", "MP4", "MOV",
        "KB", "MB", "GB", "TB", "API", "URL", "CSV", "XLS", "XLSX", "ZIP",
        "HTML", "CSS", "SDK", "OTP", "SMS", "PIN", "ID", "QR", "AI", "RGB", "CMYK"}
ACRO_RE = re.compile(r"\b[A-Z][A-Z0-9]{1,5}\b")

NEG_KO = re.compile(r"아니|않|없|못|불가|마세요|말아|금지")
POS_KO = re.compile(r"\b네\b|^네|예\.|맞|가능|있습니다|됩니다")


def parse_strings(src: str):
    """경로 → 문자열 값. 중괄호/대괄호를 추적하는 소형 스캐너.

    JS/TS 객체 리터럴만 다룬다. 템플릿 리터럴·전개·계산된 키가 나오면 **판정을 포기한다**
    (None 반환) — 반쯤 파싱한 결과로 "정합함"을 선언하는 것이 최악의 실패다.
    """
    out, path, i, n = {}, [], 0, len(src)
    pending_key, arr_idx = None, []
    while i < n:
        c = src[i]
        if c in "`":                                   # 템플릿 리터럴 — 관할 밖
            return None
        if c == "/" and i + 1 < n and src[i + 1] in "/*":   # 주석 건너뛰기
            if src[i + 1] == "/":
                i = src.find("\n", i)
                if i < 0:
                    break
            else:
                j = src.find("*/", i + 2)
                if j < 0:
                    break
                i = j + 2
            continue
        if c in "\"'":                                  # 문자열
            j, buf = i + 1, []
            while j < n:
                if src[j] == "\\":
                    buf.append(src[j:j + 2]); j += 2; continue
                if src[j] == c:
                    break
                buf.append(src[j]); j += 1
            val = "".join(buf)
            k = j + 1
            while k < n and src[k] in " \t\r\n":
                k += 1
            if k < n and src[k] == ":":                 # 따옴표로 감싼 키
                pending_key = val
                i = k + 1
                continue
            key = pending_key if pending_key is not None else (str(arr_idx[-1]) if arr_idx else None)
            if key is not None:
                out[".".join(path + [key])] = val
                if pending_key is None and arr_idx:
                    arr_idx[-1] += 1
            pending_key = None
            i = j + 1
            continue
        if c == "{":
            path.append(pending_key if pending_key is not None else
                        (str(arr_idx[-1]) if arr_idx else "_"))
            if pending_key is None and arr_idx:
                arr_idx[-1] += 1
            pending_key = None
            i += 1
            continue
        if c == "[":
            path.append(pending_key if pending_key is not None else "_")
            pending_key = None
            arr_idx.append(0)
            i += 1
            continue
        if c in "}]":
            if path:
                path.pop()
            if c == "]" and arr_idx:
                arr_idx.pop()
            pending_key = None
            i += 1
            continue
        m = re.match(r"[A-Za-z_$][\w$]*\s*:", src[i:])
        if m:
            pending_key = m.group(0)[:-1].strip()
            i += m.end()
            continue
        if src.startswith("...", i):                    # 전개 — 관할 밖
            return None
        i += 1
    return out


def english_number_values(v: str) -> list:
    """영어 0~99 숫자 단어를 아라비아 숫자 문자열로 바꾼다."""
    out = []
    for m in EN_NUM_WORD_RE.finditer(v):
        parts = re.split(r"[- ]", m.group(0).lower())
        if parts[0] in EN_TENS:
            n = EN_TENS[parts[0]] + (EN_UNITS[parts[1]] if len(parts) > 1 else 0)
        else:
            n = EN_UNITS[parts[0]]
        out.append(str(n))
    return out


def facts(v: str) -> dict:
    return {"숫자": sorted(NUM_RE.findall(v.replace(" ", ""))),
            "보간": sorted(PH_RE.findall(v)),
            "URL": sorted(URL_RE.findall(v)),
            "약어": sorted({a for a in ACRO_RE.findall(v.upper()) if a in TECH})}


def compare_locale(strings: dict, base: str, target: str) -> list:
    def under(loc: str) -> dict:
        # 로케일은 경로 **세그먼트**로 찾는다 — defineMessages({...}) 처럼 익명 래퍼가
        # 앞에 붙는 형태가 흔해서 startswith로는 못 찾는다(첫 구현이 여기서 전부 0개를 냈다).
        res = {}
        for k, v in strings.items():
            seg = k.split(".")
            if loc in seg:
                res[".".join(seg[seg.index(loc) + 1:])] = v
        return res

    b, t = under(base), under(target)
    if not b and not t:
        return None            # 로케일 블록이 아예 없는 파일(배럴·타입 정의) — 해당 없음
    if not b or not t:
        return [{"키": "-", "종류": "로케일 한쪽 없음",
                 "상세": f"{base}={len(b)}개 · {target}={len(t)}개 — 한쪽 로케일이 통째로 비었다"}]
    out = []
    for k in sorted(set(b) - set(t)):
        out.append({"키": k, "종류": "키 누락", "상세": f"{target}에 없다 ({base}: \"{b[k][:40]}\")"})
    for k in sorted(set(t) - set(b)):
        out.append({"키": k, "종류": "키 잉여", "상세": f"{base}에 없다 ({target}: \"{t[k][:40]}\")"})
    for k in sorted(set(b) & set(t)):
        fb, ft = facts(b[k]), facts(t[k])
        # 숫자가 이미 같으면 영어의 일반 단어 "one" 등을 굳이 숫자로 해석하지 않는다.
        # 서로 다를 때만 영어 숫자 단어를 보충해 `eight characters` ↔ `8자`를 맞춘다.
        if fb["숫자"] != ft["숫자"]:
            if base.lower().startswith("en"):
                fb["숫자"] = sorted(fb["숫자"] + english_number_values(b[k]))
            if target.lower().startswith("en"):
                ft["숫자"] = sorted(ft["숫자"] + english_number_values(t[k]))
        # 통화가 걸린 값은 숫자·보간을 비교하지 않는다 — 로케일별 가격은 정당한 차이다.
        money = bool(CUR_RE.search(b[k])) or bool(CUR_RE.search(t[k]))
        for kind in fb:
            if money and kind in ("숫자", "보간"):
                continue
            if fb[kind] != ft[kind]:
                out.append({"키": k, "종류": kind,
                            "상세": f"{base}={fb[kind] or '없음'} / {target}={ft[kind] or '없음'}"})
        m = re.match(r"\s*(No|Yes)\b", b[k])
        if m and target.startswith("ko"):
            want, rx = m.group(1), (NEG_KO if m.group(1) == "No" else POS_KO)
            if not rx.search(t[k]):
                out.append({"키": k, "종류": "응답 극성",
                            "상세": f"{base}는 \"{want}\"로 답하는데 {target}에 대응 표지가 없다: \"{t[k][:46]}\""})
    return out


def main() -> int:
    files, base, target, as_json = [], "en", "ko", False
    it = iter(sys.argv[1:])
    for a in it:
        if a == "--json":
            as_json = True
        elif a == "--base":
            base = next(it, "en")
        elif a == "--target":
            target = next(it, "ko")
        else:
            files.append(a)
    if not files:
        print("usage: locale_parity.py <file...> [--base en] [--target ko] [--json]", file=sys.stderr)
        return 3

    report, bad, unparsed = [], 0, 0
    for f in files:
        try:
            src = open(f, encoding="utf-8").read()
        except OSError as e:
            print(f"error: {e}", file=sys.stderr)
            return 3
        strings = parse_strings(src)
        if strings is None:
            report.append({"file": f, "status": "관할 밖", "issues": []})
            unparsed += 1
            continue
        issues = compare_locale(strings, base, target)
        if issues is None:
            report.append({"file": f, "status": "해당 없음", "issues": []})
            continue
        report.append({"file": f, "status": "판정", "issues": issues})
        bad += len(issues)

    if as_json:
        print(json.dumps({"base": base, "target": target, "files": report,
                          "total": bad, "unparsed": unparsed}, ensure_ascii=False, indent=1))
    else:
        for r in report:
            if r["status"] == "해당 없음":
                print(f"── {r['file']}  – 로케일 블록 없음(해당 없음)")
                continue
            if r["status"] == "관할 밖":
                print(f"── {r['file']}  ⚠ 관할 밖 — 템플릿 리터럴·전개 구문. **판정하지 않았다**(통과 아님)")
                continue
            print(f"── {r['file']}  불일치 {len(r['issues'])}건  ({base}↔{target})")
            for x in r["issues"][:12]:
                print(f"  🔴 [{x['종류']}] {x['키']} — {x['상세']}")
            if len(r["issues"]) > 12:
                print(f"  … 외 {len(r['issues']) - 12}건")
        print(f"합계: 불일치 {bad}건 · 관할 밖 {unparsed}개 — exit {1 if bad else (2 if unparsed else 0)}")
    return 1 if bad else (2 if unparsed else 0)


if __name__ == "__main__":
    sys.exit(main())
