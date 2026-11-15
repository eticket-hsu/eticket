#!/usr/bin/env bash
# 서버 3개 + 웹을 한 번에 띄운다. Ctrl+C 로 모두 종료.
#   FairTicket 8080 · 별티켓 8081 · 달티켓 8082 · 웹 5173
set -e
cd "$(dirname "$0")"

echo "== 서버 빌드 =="
(cd fairticket-server && ./gradlew bootJar -q)
(cd vendor-server && ./gradlew bootJar -q)
[ -d web/node_modules ] || (cd web && npm install)

trap 'kill 0' EXIT
java -jar fairticket-server/build/libs/fairticket-server-0.0.1-SNAPSHOT.jar &
java -jar vendor-server/build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=star &
java -jar vendor-server/build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=moon &
(cd web && npm run dev) &
wait
