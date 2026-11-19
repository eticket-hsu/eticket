#!/bin/bash
# 시나리오 테스트. 서버 3개(8080~8082)를 새로 띄운 상태에서 실행한다.
# 각 테스트는 데이터를 바꾸므로, 정확한 결과를 보려면 테스트마다 서버를 다시 띄우는 게 좋다.
cd "$(dirname "$0")"
fail=0
for t in ${@:-quota-resale resale-selection risk idempotency auth ip-check fraud-cancel}; do
  echo "== $t"
  node "$t.mjs" || fail=1
done
exit $fail
