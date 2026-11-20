#!/usr/bin/env bash
# 테스트마다 서버를 새로 띄우고, 실행한 프로세스만 종료한다.
set -euo pipefail
cd "$(dirname "$0")"
exec node runner.mjs "$@"
