#!/usr/bin/env bash
# git pull + 재설치. 심링크 설치라 내용 변경은 pull만으로 반영되지만,
# 새로 추가된 스킬 폴더는 install.sh 재실행으로 연결해야 한다.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

git pull --ff-only
./install.sh "$@"
