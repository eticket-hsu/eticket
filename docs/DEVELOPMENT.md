# 개발 및 협업

## 협업 규칙

### 브랜치

- `develop` 이 기본 브랜치. `main` 은 개발이 끝나면 `develop` 을 통합해 제출용으로 둔다
- `develop` · `main` 에 바로 push 하지 않는다. 작업 브랜치에서 개발하고 `develop` 으로 PR 을 올려 머지한다
- 작업 브랜치 이름: `<타입>/<영역>-<내용>` (소문자, 하이픈)

| 예시                             | 용도                     |
| -------------------------------- | ------------------------ |
| `feat/server-quota`              | 새 기능                  |
| `fix/web-resale-modal`           | 버그 수정                |
| `docs/readme-api`                | 문서                     |
| `refactor/vendor-ticket-service` | 동작 변화 없는 구조 개선 |
| `test/e2e-auth`                  | 테스트                   |
| `chore/gradle-upgrade`           | 빌드·설정·잡무           |

영역: `server`(eTicket 서버), `vendor`(별티켓·달티켓 서버), `web`, `sim`(시뮬레이터), `e2e`

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

## 서식 확인

웹·테스트·시뮬레이터·문서는 Prettier로 들여쓰기와 띄어쓰기를 통일한다. Java는 탭 들여쓰기와 기존 중괄호 스타일을 유지한다.

```bash
cd web
npm run format
npm run format:check
```

업무 규칙·점수·임계값·상태 전이·서버 호출 순서를 수정할 때는 단순 구조 정리와 별도 변경으로 다룬다.
