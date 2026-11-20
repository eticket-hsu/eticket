# eTicket

여러 예매처의 구매 기록을 연결해 **공통 구매 한도 · 공식 재판매 · 티켓 검증 · 부정 구매 위험 분석**을 제공하는 공모전 시연용 MVP.

CodeTree × 한성대 IT공과대학 오픈 이노베이션 공모전 출품 프로젝트.

## 핵심 기능

- **공통 구매 한도:** 별티켓·달티켓의 동일인·동일 공연 구매를 합산하고, 결제 전 예약과 실패 시 반환을 처리한다.
- **공식 재판매:** 취득가·정가 이하 가격, 추첨·선착순 선정, 재발급 후 정산, 실패 시 권한 복원을 지원한다.
- **통합 위험 분석:** 여러 예매처의 요청 간격·빈도·계정·기기·IP 신호를 합쳐 분석하고 등급별 추가 인증과 사후 검토를 제공한다.
- **입장 검증:** 동적 QR, 사용·재발급·재판매 상태 확인, 기기 묶기와 의심 표 신분증 확인을 지원한다.
- **연동 신뢰성:** HMAC 요청 서명, 재전송 차단, 멱등키와 재발급 응답 유실 재시도를 제공한다.

eTicket은 티켓이나 대금을 직접 보유하지 않는다. 발행·잠금·재발급·입장 판단은 가상 발행처 서버가 담당한다. 결제와 본인인증은 시연용 모의 구현이다. [구현 범위와 확장 과제](docs/LIMITATIONS.md)를 참고한다.

## 구성

| 폴더              | 역할                                                 | 포트      |
| ----------------- | ---------------------------------------------------- | --------- |
| `eticket-server/` | 공통 한도, 재판매, 위험 분석, 검증 중계              | 8080      |
| `vendor-server/`  | 가상 예매처·발행처. `star`·`moon` 프로필로 각각 실행 | 8081·8082 |
| `web/`            | React 예매처 사이트, 운영 콘솔, 입장 앱              | 5173      |
| `simulator/`      | 구매 트래픽 생성과 비교 실험                         | —         |
| `tests/e2e/`      | 서버를 초기화하며 실행하는 시나리오 테스트           | —         |

## 실행

필요 환경: **JDK 21, Node.js 20 이상**. Gradle Wrapper를 포함하며, 첫 실행에는 의존성을 내려받을 인터넷 연결이 필요하다.

```bash
git clone https://github.com/eticket-hsu/eticket.git
cd eticket
```

맥·리눅스:

```bash
./run-all.sh
```

윈도우:

```bat
run-all.cmd
```

서버 3개와 웹이 시작되면 [로컬 시연 화면](http://localhost:5173)을 연다. 맥·리눅스는 Ctrl+C, 윈도우는 `stop-all.cmd` 또는 열린 창을 닫아 종료한다.

| 주소             | 화면                                            |
| ---------------- | ----------------------------------------------- |
| `/`              | 시연 안내와 서버 상태                           |
| `/star`, `/moon` | 별티켓·달티켓: 공연, 예매, 내 티켓, 공식 재판매 |
| `/admin`         | 재판매·위험 분석·한도·입장 기록과 시연 도구     |
| `/gate`          | 카메라 또는 QR 직접 입력으로 입장 검증          |

예매처 오른쪽 위에서 데모 계정을 선택한다. 본인인증 번호는 `123456`이다. H2 인메모리 DB를 사용하므로 서버를 재시작하면 시드 데이터로 초기화된다. 카메라는 `localhost` 또는 HTTPS 환경에서 사용한다.

### 개별 실행

아래 명령은 각각 별도 터미널에서 실행한다. 윈도우는 `./gradlew` 대신 `gradlew.bat`을 사용한다. 예매처 JAR은 먼저 한 번 빌드한다.

```bash
cd eticket-server && ./gradlew bootRun
cd vendor-server && ./gradlew bootJar && java -jar build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=star
cd vendor-server && java -jar build/libs/vendor-server-0.0.1-SNAPSHOT.jar --spring.profiles.active=moon
cd web && npm ci && npm run dev
```

## 검증

데모 서버를 종료한 뒤 실행한다. 테스트 실행기는 서버를 빌드하고 **각 테스트마다 서버 3개를 새로 시작해 초기 데이터에서 검증**한다. 기존 서버가 포트를 사용하면 종료하지 않고 오류를 안내한다. 서버 로그 경로와 최종 PASS/FAIL을 출력한다.

```bash
node tests/e2e/runner.mjs          # 전체
node tests/e2e/runner.mjs auth     # 서버 간 서명만
```

맥·리눅스의 `tests/e2e/run.sh`, 윈도우의 `tests\e2e\run.cmd`도 같은 실행기를 사용한다.

| 시나리오           | 확인 항목                              |
| ------------------ | -------------------------------------- |
| `quota-resale`     | 구매 한도, 동시 구매, 재판매 가격·복원 |
| `resale-selection` | 추첨·선착순, 마감                      |
| `risk`             | 위험 신호, 등급별 조치, 사후 검토      |
| `idempotency`      | 멱등키, 재발급 응답 유실               |
| `auth`             | 요청 서명, 위조·변조·재전송 차단       |
| `ip-check`         | IP 종류·시간대 신호                    |
| `fraud-cancel`     | 사후 검토·취소·입장 거절               |
| `dynamic-qr`       | 동적 QR·만료·기기·신분증 확인          |
| `device-binding`   | 기기 정보 누락·공유·이전 제한          |

프런트 빌드:

```bash
cd web
npm ci
npm run build
```

GitHub Actions는 Ubuntu·Windows에서 프런트 빌드와 전체 시나리오를 실행하도록 구성되어 있다. 실제 실행 결과는 저장소의 Actions에서 확인한다.

## 시연과 설계 문서

- [시연 순서·휴대폰 촬영·비교 실험](docs/DEMO.md)
- [구조·API·업무 규칙·이름 변경 규약](docs/ARCHITECTURE.md)
- [구현 범위·모의 처리·확장 과제](docs/LIMITATIONS.md)
- [개발·협업 규칙](docs/DEVELOPMENT.md)
