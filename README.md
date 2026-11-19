# FairTicket MVP

여러 예매처를 연결해 **공식 재판매 · 티켓 유효성 검증 · 통합 부정구매 위험 분석**을 지원하는 시스템의 MVP.
CodeTree x 한성대 IT공과대학 오픈 이노베이션 공모전 출품작 (신청 마감 2026-11-24).

설계 문서: [FairTicket MVP 설계 문서](https://claude.ai/artifact/2b8bCJctiBtBGLv38VAQya)

## 구성

| 폴더 | 무엇 | 포트 |
| --- | --- | --- |
| `fairticket-server/` | FairTicket 서버 (Spring Boot). 재판매 상태 전이·추첨, 위험 분석, 입장 검증 중계 | 8080 |
| `vendor-server/` | 가상 예매처이자 발행처 (Spring Boot). 같은 코드를 `star`(별티켓)·`moon`(달티켓) 프로필로 두 번 띄움 | 8081, 8082 |
| `web/` | React 웹: 별티켓·달티켓 사이트, 관리자 웹, QR 확인 화면 | 5173 |
| `simulator/` | 정상·매크로 구매 패턴을 만드는 트래픽 시뮬레이터 (Node) | - |

FairTicket 은 티켓과 돈을 갖지 않는다. 잠금·재발급·결제·환불·정산·입장 판단은 모두 발행처(`vendor-server`)의 `/ft/*` API 가 한다.

## 실행

필요: Java 21 이상, Node 20 이상. (Gradle 은 wrapper 가 알아서 받음)

**맥·리눅스**

```bash
./run-all.sh
```

한 번에 서버 3개와 웹을 띄운다. 종료는 Ctrl+C.

**윈도우** (명령 프롬프트·PowerShell, 또는 탐색기에서 더블클릭)

```bat
run-all.cmd
```

서버 3개와 웹이 각각 새 창으로 뜬다. 종료는 `stop-all.cmd` 또는 열린 창 4개를 닫는다. Git Bash·WSL 에서는 `./run-all.sh` 도 된다.

브라우저에서 http://localhost:5173 을 연다 (서버가 뜨는 데 30초~1분).

따로 띄우려면 (윈도우는 `./gradlew` 대신 `gradlew.bat`, 경로는 `\`):

```bash
cd fairticket-server && ./gradlew bootRun
cd vendor-server && ./gradlew bootJar && java -jar build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=star
cd vendor-server && java -jar build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=moon
cd web && npm install && npm run dev
```

> 같은 프로젝트에서 `bootRun` 을 두 번 동시에 돌리면 Gradle 잠금 때문에 멈춘다. 예매처 두 개는 jar 로 띄운다.

DB 는 H2 인메모리라 재시작하면 시드 데이터로 초기화된다. 회원: 민지·지수·서연·하늘·도윤·매크로봇. 공연: 별티켓 4개(PERF-001·002·004·005), 달티켓 3개(PERF-001·002·003). 시연용 본인인증 번호는 `123456`.
H2 콘솔: `http://localhost:8080/h2-console` (JDBC URL `jdbc:h2:mem:fairticket`).

## 화면

`http://localhost:5173` 시연 안내 페이지에서 네 앱을 열 수 있다 (서버 연결 상태도 표시). 새 창으로 나란히 띄우면 흐름이 잘 보인다.

| 주소 | 화면 |
| --- | --- |
| `/star`, `/moon` | 예매처 사이트: 공연 목록 → 공연 상세·좌석 선택 → 예매(위험 확인 단계 표시) → 내 티켓(모바일 티켓·QR) → 공식 재판매(응모·당첨 결제). 오른쪽 위에서 데모 계정으로 로그인 |
| `/admin` | FairTicket 운영 콘솔: 대시보드, 재판매 진행(단계·이력·응모자, 추첨 버튼), 위험 신호(점수·근거), 입장 기록, 시연 도구(매크로 트래픽, 재발급 실패 스위치) |
| `/gate` | 입장 검증 앱: 카메라로 QR 스캔 또는 붙여넣기, 승인/거절 전체 화면 표시 |

> 카메라 스캔은 `localhost` 에서만 바로 동작한다. 휴대폰으로 스캔하려면 HTTPS 가 필요하므로, 시연은 노트북 카메라에 휴대폰 화면의 QR 을 비추는 방식을 권장한다.

## 데모 시나리오 (시연 영상 대본)

1. 운영 콘솔 → 시연 도구: "PC방 (공용 IP)" → 정상(오탐 없음), "매크로 공격" → 위험 신호 탭에 고위험과 근거. 별티켓에서 **매크로봇**으로 예매하면 보류 → 보안문자 + 본인인증(시연용 123456) 후에만 진행
1-1. "분산 매크로 (계정 묶음)" → 운영 콘솔 "사후 검토" 탭에 여러 예매처에 걸친 계정 5개 묶음 → "발행처에 전달"
2. 별티켓에서 **민지**로 로그인 → NEON WAVE(1인 2매) 좌석 선택 → 예매 → 내 티켓에서 QR 확인
3. **공통 구매 한도:** 달티켓에서 민지로 1매 더 사면 성공(합산 2/2), 어느 예매처에서든 3번째는 "공통 구매 한도를 넘었습니다" → 운영 콘솔 "공통 구매 한도" 탭에 기록
4. 민지 티켓에서 "공식 재판매 신청" → 가격을 정가보다 낮게(예: 80,000원) 입력 → QR 이 즉시 사용 정지 (입장 검증에서도 "재판매 진행 중" 거절)
5. **지수**로 바꿔 공식 재판매 탭에서 응모 (한도가 꽉 찬 사람은 응모 불가) → 운영 콘솔에서 "추첨 실행"
6. 당첨자로 "당첨! 결제하기" (수수료 없음) → 콘솔 타임라인: 결제 → 재발급(취득가 기록) → 정산, 민지 한도 1매 반환
7. 지수가 그 티켓을 다시 팔려 하면 상한이 80,000원(산 가격)이라 더 비싸게 못 올림 → 차익 거래 차단
8. 입장 검증: 지수의 새 QR 승인 → 같은 QR 다시 스캔하면 "이미 사용된 티켓" → 민지의 옛 QR 은 "재발급으로 무효"
9. 콘솔에서 "재발급 실패 시키기"를 켜고 재판매 반복 → 새 구매자 환불·한도 반환 + 원 구매자 권한 복원
10. **멱등키:** 콘솔 시연 도구에서 "재발급 응답 유실"을 켜고 재판매 결제 → 발행처는 재발급했지만 응답이 사라짐 → FairTicket 이 같은 멱등키로 재시도 → 발행처가 저장된 결과를 돌려줌 → 중복 발급 없이 정산 (재판매 진행 기록에 남음)

같은 시나리오를 터미널에서 돌리려면 `node simulator/simulate.mjs` (위험 분석 부분).

## 시나리오 테스트

서버 3개를 새로 띄운 뒤 실행한다. 테스트가 데이터를 바꾸므로 파일마다 서버를 다시 띄우면 가장 정확하다.

| 파일 | 확인하는 것 |
| --- | --- |
| `tests/e2e/quota-resale.mjs` | 공통 구매 한도, 공식 재판매, 가격 상한, 기한 |
| `tests/e2e/risk.mjs` | 위험 규칙 7개, 등급별 조치, 사후 검토 |
| `tests/e2e/idempotency.mjs` | 멱등키, 재발급 응답 유실 |
| `tests/e2e/auth.mjs` | 서버 간 서명, 위조·변조·재전송 차단 |
| `tests/e2e/resale-selection.mjs` | 재판매 구매자 선정(추첨 후 선착순), 신청 마감 |
| `tests/e2e/dynamic-qr.mjs` | 계속 바뀌는 QR, 캡처 QR 거절, 기기 묶기·옮기기, 의심 표 신분증 확인 |
| `tests/e2e/device-binding.mjs` | 기기 정보 없는 구매 거절, 계정 넘기기 거래 탐지, 같은 기기 여러 계정, 공연 직전 기기 옮기기 금지, QR 수명 40초 |
| `tests/e2e/ip-check.mjs` | 해외·VPN·데이터센터 IP, 시간대 불일치, 예매처 시연용 접속 위치 |
| `tests/e2e/fraud-cancel.mjs` | 암표상 구매 → 사후 검토 → 표 취소 → 입장 거절 |

```bash
tests/e2e/run.sh            # 전부
tests/e2e/run.sh auth       # 하나만
```

윈도우는 `tests\e2e\run.cmd` (하나만: `tests\e2e\run.cmd auth`).

## 주요 API

| 서버 | 경로 | 용도 |
| --- | --- | --- |
| FairTicket | `POST /v1/quota/reserve`, `/v1/quota/{id}/confirm`, `/v1/quota/{id}/release`, `GET /v1/quota` | 공통 구매 한도: 결제 전 예약 → 발급 시 확정 / 실패 시 즉시 반환 |
| FairTicket | `POST /v1/resales` | 재판매 등록 (가격 상한을 발행처에 조회해 검증, 발행처 잠금까지) |
| FairTicket | `GET /v1/resales`, `GET /v1/resales/{id}` | 목록, 상세(응모자·이력) |
| FairTicket | `POST /v1/resales/{id}/entries` | 응모 (판매자 본인·중복·HIGH 위험 제외) |
| FairTicket | `POST /v1/resales/{id}/draw` · `/forfeit` · `/pay` | 추첨, 차순위 이전, 결제→재발급→정산 |
| FairTicket | `DELETE /v1/resales/{id}` | 판매 전 취소 |
| FairTicket | `POST /v1/purchase-events`, `GET /v1/risk`, `GET /v1/risk/overview` | 위험 분석 (실시간) |
| FairTicket | `POST /v1/demo/purchase-events`, `GET /v1/demo/risk` | 시연 도구·시뮬레이터용 (시연 모드에서만 열림) |
| FairTicket | `GET /v1/risk/review?performanceCode=`, `POST /v1/risk/review/reports` | 사후 검토·계정 묶음, 발행처 전달 |
| FairTicket | `POST /v1/risk/review/cancel`, `GET /v1/risk/review/cancellations` | 의심 계정 표 취소 요청(발행처가 취소) · 취소 기록 |
| FairTicket | `GET /v1/captcha`, `POST /v1/captcha/verify` | 예매처에 제공하는 공통 보안문자 (1회용) |
| FairTicket | `POST /v1/verify`, `GET /v1/verify/logs` | 입장 검증 중계 |
| 예매처 | `GET/POST /api/*` | 예매처 사이트용 (회원, 공연, 구매, 내 티켓, 재판매 신청) |
| 예매처 | `POST /api/tickets/{id}/device` | 본인인증 후 표를 이 기기로 옮기기 (요청 헤더 `X-Device-Id`) |
| 예매처 | `/ft/tickets/{id}` · `lock` · `unlock` · `reissue`, `/ft/admit`, `/ft/payments` · `refunds` · `payouts` | 발행처 표준 API |
| 예매처 | `/ft/tickets/{id}` · `lock` · `unlock` · `reissue` · `fraud-cancel`, `/ft/admit`, `/ft/payments` · `refunds` · `payouts` | 발행처 표준 API |

**서버 간 인증이 필요한 API** (아래 '연동 규약' 참고): 예매처 `/ft/*` 전체, FairTicket 의 `POST /v1/purchase-events`, `GET /v1/risk`, `POST /v1/captcha/verify`, `POST /v1/quota/reserve` · `{id}/confirm` · `{id}/release`, `POST /v1/resales`.

## 적용된 규칙 (설계 문서 '정해야 할 규칙' 확정분)

- **공통 구매 한도:** 한도 값은 발행처가 정하고(예매처마다 다르면 작은 값), FairTicket 은 연동 예매처 구매를 사람·공연 단위로 합산. 예약 유효시간은 예매처의 결제 제한 시간(별티켓 10분, 달티켓 8분). 결제 실패·재발급 실패는 즉시 반환, 재판매로 산 티켓도 포함, 판매자는 재발급 완료 시 반환
- **재판매 가격:** 상한 = min(정가, 현재 소유자 취득가), 낮게 부르는 것은 허용. 재발급 때 거래 가격이 새 소유자의 취득가가 됨
- **수수료:** 이용자 수수료 없음
- **기한:** 신청 마감·판매 종료·결제 기한은 발행처가 공연별로 정하고, 없으면 기본값(신청 마감 공연 6시간 전 / 판매 종료 3시간 전 / 결제 30분). 기한이 지나면 스케줄러가 차순위 이전·추첨·만료 처리
- **구매자 선정 (제안, 팀 확인 중):** 공연 24시간 전까지 추첨, 그 뒤 선착순(바로 구매). 추첨 응모자가 없거나 당첨자가 모두 결제하지 않으면 판매 종료 전까지 선착순으로 전환. `fairticket.resale-defaults.selection: LOTTERY`로 바꾸면 추첨만 사용
- **위험 분석 규칙 7개:** 요청 빈도(+20), 기계적 간격(+25), 반응 시간(좌석 화면 진입 후 0.5초 미만 또는 화면 없이 요청, +25), 교차 예매처(+20), 한도 초과 시도 반복(+20), 반복 실패(보안문자 오답 포함, +20), IP 공유(보조, +10), 기기 공유(10분 안에 한 기기에서 3개 계정 이상, +20). 기기 정보 없이 API 로 바로 부른 구매는 실패로 센다. 0~39 정상 / 40~69 주의 / 70+ 고위험
- **등급별 조치:** 정상 허용 / 주의 보안문자 / 고위험 보류(보안문자 + 본인인증으로 해제). 보안문자는 FairTicket 이 예매처에 제공하는 공통 서비스(`/v1/captcha`), 본인인증은 시연용 모의(인증번호 123456). 통과 후에도 분석은 계속
- **재판매 응모:** 주의는 보안문자 후 응모, 고위험은 응모 불가
- **사후 검토:** 공연 전체 기록에서 신호 2개 이상 겹친 사용자 + 여러 예매처에 걸친 계정 묶음(IP만 같은 PC방 손님은 제외)을 발행처에 전달
- **멱등키 (`Idempotency-Key`):** FairTicket 은 상태를 바꾸는 `/ft/*` 호출마다 `resale-{id}-{동작}` 키를 붙이고 재시도해도 같은 키를 쓴다. 발행처(`IdempotencyFilter`)는 키 없는 요청을 400 으로 거절하고, 처음 보는 키는 처리 후 응답을 저장, 같은 키는 다시 처리하지 않고 저장된 응답을 돌려준다(`Idempotent-Replayed: true`). 같은 키에 내용이 다르면 422, 동시에 오면 1건만 처리, 5xx 는 저장하지 않아 재시도 가능, 24시간 보관. 입장 처리(`/ft/admit`)는 원래 한 번만 성공하므로 제외
- **서버 간 인증 (요청 서명):** 비밀키는 보내지 않고 HMAC-SHA256 서명만 보낸다. 헤더 `X-FT-Client`·`X-FT-Timestamp`·`X-FT-Nonce`·`X-FT-Signature`, 서명 대상은 메서드·경로+쿼리·시각·난수·멱등키·본문 해시. 받는 쪽은 등록된 호출자인지, 시각이 ±5분 안인지, 서명이 맞는지(시간 일정 비교), 난수가 처음인지(재전송 차단) 확인하고 아니면 401. 키는 방향별·예매처별로 따로(FT→별, 별→FT, FT→달, 달→FT), 환경변수로 넣고(설정 파일엔 로컬용 기본값만), 받는 쪽은 키 목록을 받아 교체 중 옛 키·새 키를 함께 허용. FairTicket 은 본문의 `vendorId` 대신 서명으로 확인된 예매처를 기록하고, 다르면 403(다른 예매처 이름 사칭, 남의 한도 예약 확정·반환 차단)
- **계속 바뀌는 QR (캡처 QR 무효):** QR 은 `FT:{발행처}:{티켓}:{버전}:{시간칸}.{서명}`, 시간칸은 30초 단위. 입장은 지금 칸만 받고 바로 앞 칸은 칸이 바뀐 뒤 10초까지만 받아서, 캡처·인쇄한 QR 은 길어야 40초 뒤 "만료된 QR"로 거절된다. 시간칸을 고쳐 쓰면 서명이 맞지 않아 위조로 거절 (티켓마스터 SafeTix 와 같은 방식)
- **기기 묶기:** 표는 예매한 기기에 바로 묶여 그 기기에서만 QR 이 보이고, 다른 기기에서는 QR 대신 "다른 기기"가 뜬다. 기기 정보 없이 API 로 바로 사는 요청은 거절한다 (묶이지 않은 표를 계정째 넘겨 받는 사람 폰에 묶이게 하는 수법 차단). 폰을 바꾼 주인은 본인인증 후 옮길 수 있지만 공연 24시간 전부터는 못 옮긴다 (`vendor.device-move-cutoff-hours`, 현장 신분증 확인으로 처리). 기기 ID 는 해시로만 저장. 2번 이상 옮기면 사후 검토에 "표를 다른 기기로 옮김" 신호
- **같은 기기 여러 계정:** 예매처가 기기 해시를 FairTicket 에 함께 보낸다. 한 기기에서 여러 계정이 사거나, 여러 계정의 표가 한 기기로 옮겨지면(암표상이 본인인증 번호를 전달해 주는 계정 넘기기 거래) 사후 검토에 "같은 기기를 쓴 계정" 신호가 붙고 계정 묶음으로 이어진다
- **의심 표만 신분증 확인:** 사후 검토 의심 목록에 있는 사람의 표는 입장 화면에 "신분증 확인"과 예매자 이름(가운데 가림)을 띄운다. 모든 관객을 확인하면 줄이 길어지므로 의심 표만
- **IP 검사:** 접속 IP를 내부망·일반·해외·VPN·데이터센터·Tor 로 판별해 위험 점수에 더한다 (VPN +25, 데이터센터 +25, Tor +40, 해외 +10). 브라우저 시간대는 한국인데 IP가 해외·VPN이면 시간대 불일치 +15. 원래 IP는 저장하지 않고 종류만 남긴다. 해외 거주 팬 오탐을 줄이려고 해외 IP 단독으로는 막지 않는다. `fairticket.ip-policy.block-anonymous: true`로 바꾸면 VPN·데이터센터·Tor 예매를 바로 보류한다(인터파크식 차단). IP 목록은 `fairticket-server/src/main/resources/ip-ranges.csv` (시연용 문서 전용 대역, 실서비스는 상용 IP DB·공식 목록으로 교체)
- **탐지 → 조치 (부정 구매 취소):** 사후 검토의 의심 계정(신호 2개 이상) 중 발행처 담당자가 고른 계정의 표만 취소 요청한다. 발행처가 표를 취소·환불하고, 그 표는 입장 검증에서 "부정 구매로 취소된 티켓"으로 거절된다. 취소한 만큼 공통 구매 한도를 돌려주고, 취소 근거(겹친 신호)를 기록으로 남긴다. 의심 목록에 없는 계정은 요청해도 취소하지 않는다
- **시연 전용:** 한 노트북에서 여러 사람을 흉내 내므로 로컬 접속은 회원별 가상 IP 를 쓴다. `fairticket.demo-mode` 는 실서비스에서 끈다

## 협업 규칙

### 브랜치

- `develop` 이 기본 브랜치. `main` 은 개발이 끝나면 `develop` 을 통합해 제출용으로 둔다
- `develop` · `main` 에 바로 push 하지 않는다. 작업 브랜치에서 개발하고 `develop` 으로 PR 을 올려 머지한다
- 작업 브랜치 이름: `<타입>/<영역>-<내용>` (소문자, 하이픈)

| 예시 | 용도 |
| --- | --- |
| `feat/server-quota` | 새 기능 |
| `fix/web-resale-modal` | 버그 수정 |
| `docs/readme-api` | 문서 |
| `refactor/vendor-ticket-service` | 동작 변화 없는 구조 개선 |
| `test/e2e-auth` | 테스트 |
| `chore/gradle-upgrade` | 빌드·설정·잡무 |

영역: `server`(FairTicket 서버), `vendor`(별티켓·달티켓 서버), `web`, `sim`(시뮬레이터), `e2e`

### 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/ko/) 형식을 따른다.

```
<타입>(<영역>): <요약>

<본문: 무엇을, 왜 바꿨는지 (선택)>
```

- 타입: `feat` 기능, `fix` 버그 수정, `docs` 문서, `refactor` 구조 개선, `test` 테스트, `style` 서식, `chore` 빌드·설정, `perf` 성능
- 영역은 브랜치와 같다. 여러 영역이면 생략할 수 있다
- 요약은 한국어로, 50자 안팎, 끝에 마침표 없이
- 예: `feat(server): 공통 구매 한도 예약·확정·반환 API 추가`, `fix(web): 구매 버튼 클릭 시 서버 연결 오류 메시지 수정`

### 맥·윈도우 공통 개발

팀에 맥과 윈도우 사용자가 모두 있으므로, 새로 만드는 코드·스크립트·테스트는 둘 다에서 돌아가야 한다.

- 셸 스크립트(`.sh`)를 만들면 윈도우용(`.cmd`)도 같이 만든다. 줄바꿈은 `.gitattributes`가 맞춰 준다 (`.cmd` CRLF, `.sh` LF)
- 경로를 `/`나 `\`로 직접 이어 붙이지 말고 Node `path`, Java `Path` 같은 표준 API를 쓴다
- 맥 전용 명령(`lsof`, `open`, `sed -i ''` 등)을 코드나 스크립트에 넣지 않는다
- 시간대를 가정하지 않는다 (예: `+9시간` 하드코딩 금지. 테스트는 `tests/e2e/time.mjs`의 `localDateTime` 사용)
- 자바 소스는 UTF-8 로 컴파일한다 (`build.gradle`에 지정됨)
- 윈도우에서 직접 확인하지 못한 변경은 PR에 그렇다고 적고 윈도우 팀원에게 확인을 부탁한다

### 용어

"별티켓·달티켓"으로 통일한다 (예매처 A·B 대신).

## 역할 분담 제안

| 담당 | 폴더 |
| --- | --- |
| A | `vendor-server/` (+ 결제·정산 기록, 멱등키) |
| B | `fairticket-server/` 재판매 (`resale/`) |
| C | `fairticket-server/` 위험 분석 (`risk/`) + `simulator/` |
| D | `web/` + 시연 영상·보고서 |

## 남은 작업 (코드 안의 `TODO` 참고)

- 이용자 인증: 재판매 응모·결제는 아직 화면이 `buyerUid` 를 직접 보낸다 (실서비스는 예매처 로그인을 거쳐야 함). 관리자 콘솔·입장 검증 화면 로그인도 없음
- 멱등키 응답 저장을 업무 처리와 같은 트랜잭션으로 (지금은 처리 직후 서버가 죽으면 그 키가 '처리 중'으로 남음)
- 실서비스 인증 강화: 상호 TLS 인증서 + 서명, 비밀키 관리 서비스(KMS)
- 결제·환불·정산 기록 테이블 (지금은 로그만 남김)
- 위험 MEDIUM 일 때 추가 인증 단계
- 결제 기한 자동 처리 스케줄러 (지금은 관리자 버튼)
- QR 카메라 스캔
