#!/usr/bin/env bash
# 서버 3개 + 웹을 한 번에 띄운다. Ctrl+C로 이 스크립트가 시작한 프로세스만 종료한다.
# eTicket 8080 · 별티켓 8081 · 달티켓 8082 · 웹 5173
set -euo pipefail
cd "$(dirname "$0")"

echo "== 서버 빌드 =="
(cd eticket-server && ./gradlew bootJar -q)
(cd vendor-server && ./gradlew bootJar -q)
[ -d web/node_modules ] || (cd web && npm ci)

pids=()
cleanup() {
  trap - EXIT INT TERM
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

java -jar eticket-server/build/libs/eticket-server-0.0.1-SNAPSHOT.jar &
pids+=("$!")
java -jar vendor-server/build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=star &
pids+=("$!")
java -jar vendor-server/build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=moon &
pids+=("$!")
# exec를 사용해 셸과 Vite가 같은 PID를 사용하게 한다.
(cd web && exec node node_modules/vite/bin/vite.js) &
pids+=("$!")
wait
