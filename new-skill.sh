#!/usr/bin/env bash
# 새 스킬 스캐폴딩: ./new-skill.sh <kebab-case-name>
# _template/ 를 복사해 plugins/sognora-llm-inventory/skills/<name>/ 를 생성한다.
# 스킬 파일 하나가 Claude Code·Codex 양쪽에서 그대로 동작하므로 사본은 없다.
# 플러그인 manifest가 skills/ 디렉토리 전체를 가리키므로 manifest 수정도 필요 없다.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$REPO/plugins/sognora-llm-inventory/skills"
NAME="${1:-}"

if ! [[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]]; then
  echo "usage: ./new-skill.sh <kebab-case-name>   (예: ./new-skill.sh humanize-korean)" >&2
  exit 2
fi
if [ -e "$SKILLS_DIR/$NAME" ]; then
  echo "이미 존재: skills/$NAME" >&2
  exit 1
fi

TODAY="$(date +%Y-%m-%d)"
render() { sed -e "s/__NAME__/$NAME/g" -e "s/__DATE__/$TODAY/g" "$1" > "$2"; }

mkdir -p "$SKILLS_DIR/$NAME/references"

render "$REPO/_template/SKILL.md"            "$SKILLS_DIR/$NAME/SKILL.md"
render "$REPO/_template/references/rules.md" "$SKILLS_DIR/$NAME/references/rules.md"
render "$REPO/_template/CHANGELOG.md"        "$SKILLS_DIR/$NAME/CHANGELOG.md"

echo "생성 완료: plugins/sognora-llm-inventory/skills/$NAME"
echo ""
echo "다음 단계:"
echo "  1. SKILL.md — description(트리거·비대상)부터 채우기 ★가장 중요"
echo "  2. references/rules.md — 본체 룰 작성"
echo "  3. README.md 스킬 목록 표에 한 줄 추가 (push 전 필수)"
echo "  4. 배포: git push 후"
echo "     Claude: /plugin marketplace update sognora-llm-inventory"
echo "     Codex : codex plugin marketplace upgrade → codex plugin add sognora-llm-inventory@sognora-llm-inventory"
echo "     (또는 심링크 fallback: ./install.sh)"
