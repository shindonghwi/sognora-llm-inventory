#!/usr/bin/env python3
"""Run Korean and English known-pattern detectors over the same copy corpus (stdlib only).

Usage: detect_bilingual.py <file...|-> [--genre landing|UI|prose|report|formal|conversational] [--json] [--min red]
Exit: 0 = no red findings / 1 = red findings / 2 = not evaluated / 3 = execution error
"""
import importlib.util
import json
import pathlib
import sys


HERE = pathlib.Path(__file__).resolve().parent
SKILLS = HERE.parents[1]
KO_PATH = SKILLS / "sg-ko-humanize" / "scripts" / "detect_ko.py"
EN_PATH = HERE / "detect_en.py"
CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".vue", ".svelte", ".py")
GENRES = {
    "landing": ("랜딩", "landing"), "랜딩": ("랜딩", "landing"),
    "UI": ("UI", "UI"), "ui": ("UI", "UI"),
    "prose": ("블로그", "prose"), "블로그": ("블로그", "prose"), "칼럼": ("칼럼", "prose"),
    "report": ("리포트", "report"), "리포트": ("리포트", "report"),
    "formal": ("공적", "formal"), "공적": ("공적", "formal"),
    "conversational": ("구어", "conversational"), "구어": ("구어", "conversational"),
}


def load_module(name: str, path: pathlib.Path):
    if not path.is_file():
        raise FileNotFoundError(f"detector missing: {path}")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


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
        print("usage: detect_bilingual.py <file...|-> [--genre genre] [--json] [--min red]", file=sys.stderr)
        return 3
    if genre and genre not in GENRES:
        print(f"error: unsupported genre: {genre}", file=sys.stderr)
        return 3
    if not genre and any(item.lower().endswith(CODE_EXT) for item in files):
        print("error: genre required for code/message files — not evaluated (exit 2)", file=sys.stderr)
        return 2

    try:
        ko_detector = load_module("sg_detect_ko", KO_PATH)
        en_detector = load_module("sg_detect_en", EN_PATH)
    except (OSError, AttributeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 3

    ko_genre, en_genre = GENRES.get(genre, ("", ""))
    reports, ko_reports = [], []
    total_red = total_yellow = 0
    stdin_text = sys.stdin.read() if "-" in files else None
    for file_name in files:
        try:
            text = stdin_text if file_name == "-" else pathlib.Path(file_name).read_text(encoding="utf-8")
        except OSError as error:
            print(f"error: {error}", file=sys.stderr)
            return 3
        ko_result = ko_detector.scan(text, ko_genre)
        en_result = en_detector.scan(text, en_genre)
        ko_reports.append({"file": file_name, **ko_result})
        combined = ([{"language": "ko", **item} for item in ko_result["findings"]] +
                    [{"language": "en", **item} for item in en_result["findings"]])
        counts = {"red": sum(1 for item in combined if item["severity"] == "red"),
                  "yellow": sum(1 for item in combined if item["severity"] == "yellow")}
        visible = [item for item in combined if min_severity != "red" or item["severity"] == "red"]
        reports.append({"file": file_name, "findings": visible, "counts": counts,
                        "byLanguage": {"ko": ko_result["counts"], "en": en_result["counts"]}})
        total_red += counts["red"]
        total_yellow += counts["yellow"]

    cross = []
    if ko_genre in ko_detector.UI_FAMILY and len(ko_reports) > 1:
        cross = [{"language": "ko", **item} for item in ko_detector.cross_file_drift(ko_reports)]
        if min_severity == "red":
            cross = [item for item in cross if item["severity"] == "red"]
        total_red += sum(1 for item in cross if item["severity"] == "red")
        total_yellow += sum(1 for item in cross if item["severity"] == "yellow")

    scope = "한·영 알려진 패턴만 검사했다. 자연스러움과 문맥 적합성은 언어별 의미 검토가 필요하다."
    payload = {"genre": genre or "(default)", "scope": scope, "requiresSemanticReview": True,
               "files": reports, "crossFile": cross,
               "total": {"red": total_red, "yellow": total_yellow},
               "exit": 1 if total_red else 0}
    if as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
    else:
        for report in reports:
            print(f"── {report['file']}  red {report['counts']['red']} / yellow {report['counts']['yellow']}")
            for item in report["findings"]:
                print(f"  {item['severity'].upper()} [{item['language']}] {item['rule']} {item['name']} ×{item['count']}")
        print(scope)
    return 1 if total_red else 0


if __name__ == "__main__":
    sys.exit(main())
