# Coin Sim — 개발 규칙 세부

CLAUDE.md의 핵심 규칙을 보충하는 세부 기준이다. 충돌하면 CLAUDE.md를 먼저 고친다.

- 작성일: 2026-11-18
- 수정: 2026-11-23 (0단계 결정 D-22~D-43 반영: 1장, 2장, 3장, 4장, 7장, 11장), 2026-11-28 (2번 작업 D-55~D-80 반영: 1장, 2장, 7장, 9장)

---

## 1. 개발 환경

| 항목 | 규칙 |
|---|---|
| Node | 24 LTS. `.nvmrc`에 정확한 버전(`24.22.3`)을 적고 로컬·CI가 같이 쓴다 (`nvm use`). 패키지 매니저는 그 Node에 포함된 npm, `package-lock.json` 커밋. 다른 npm 버전으로 lock을 만들지 않는다 (D-51). Node를 올릴 때는 `.nvmrc`를 바꾸고 lock을 다시 만든다 |
| Python | 3.12 이상, uv로 관리. `.python-version`(3.12)으로 고정하고 uv가 받는다. `pyproject.toml`과 `uv.lock` 커밋. 개발 도구(ruff, pytest)는 정확한 버전으로 고정 |
| 경로 별칭 | `@/` → `src/`, `@tests/` → `tests/` (테스트 파일에서만) |
| 데이터 | `data/raw/`(원본)와 `data/interim/`(분석 중간 산출물)은 gitignore. `data/stats/stats.json`과 `tests/fixtures/stats.small.json`은 `npm run stats`가 만들고 커밋한다 (손으로 고치지 않음). 원본은 저장소 밖에 백업한다 (D-56, data-spec 1·7장) |
| 환경 변수 | `.env`는 gitignore, `.env.example` 커밋. 처음 한 번 `cp .env.example .env` (`.env`가 없으면 `--env-file`이 실패한다, D-46). Node는 `tsx --env-file`, Python은 `uv run --env-file`로 불러오고 dotenv 라이브러리는 쓰지 않음 |

## 2. 코드 컨벤션

| 구분 | 규칙 |
|---|---|
| 파일 이름 | 로직은 camelCase(`coinFactory.ts`), 컴포넌트는 PascalCase(`EventSheet.tsx`), 페이지는 `Page` 접미어(`MainPage.tsx`) |
| export | `src/`와 `tests/`에서는 이름 붙인 export만 쓴다. default export 금지 (D-39). 라우트 코드 분할은 React Router `lazy`로 `{ Component }`를 돌려준다 |
| 폴더 | `components/`는 화면별(`game/`, `result/`, `records/`) + 두 화면 이상에서 쓰는 `common/`. `pages/`는 라우트당 1개 (D-30) |
| 타입 | `any` 금지. 타입은 그 타입을 만드는 모듈 안에 둔다: `engine/types.ts`, `game/types.ts`, props 타입은 컴포넌트 파일 안. 전역 `src/types/`를 만들지 않는다. 통계 JSON 타입과 `SCHEMA_VERSION`은 `src/engine/` 안의 한 파일에 둔다 (D-31) |
| 타입 패턴 | 상태 구분은 판별 유니온(예: 시계 `ready·playing·paused·eventPending·ended`)으로 쓰고 `switch`에서 모든 경우를 처리한다. 주문 거부처럼 실패할 수 있는 game 함수는 `{ ok: true, … } \| { ok: false, reason }`을 반환하고, 거부 이유 문구는 UI가 정한다. 설정값은 `as const satisfies` |
| 설정값 | 템포(캔들 수, 캔들당 시간, 세부 단계 수, 과거 캔들 수 100, 선택지를 띄우지 않는 마지막 캔들 수 10), 수수료, 최소 주문 금액, 등급 기준, 이벤트 횟수·최소 간격, 전파 값 중 통계에 없는 것(영향 없음 확률 등, D-75), 이벤트 종류별 전파 가중치, 폭락형 등장 확률·대체 자리 비율, 폭락 시작 시점·막판 반등 확률(D-72), 게임의 시장 상태 목표 비율(D-68), 시작 가격·거래량 기준값·비례 계수(D-63), 같은 캔들 여러 이벤트 처리 방식(A·B)은 `src/config/`에 둔다 |
| 계층 import (D-23) | 값 import는 바로 아래 계층만: `pages → components → store → game → engine → config` (`pages → store` 허용, `game → config` 허용). `import type`은 아래 방향이면 건너뛸 수 있다. 위 방향은 타입도 금지 |
| ESLint 강제 (`eslint.config.js`, D-40) | 위 계층 import 규칙(`@typescript-eslint/no-restricted-imports`, 폴더별 설정, 건너뛰기는 `allowTypeImports`) / 폴더 밖은 `@/`로만 import (`../` 금지) / `@tests/`는 테스트 파일에서만 / `src/engine`·`src/game`·`src/config`에서 react·react-dom·zustand·react-router, `Math.random`, `Date.now`, 인자 없는 `new Date()`·`Date()`, `window`, `document` 금지 / `localStorage`는 `store/recordsStorage.ts`에서만, `sessionStorage`는 `main.tsx`에서만 (`window.`·`globalThis.` 형태 포함) / `Math.round·floor·ceil·trunc`는 `src/engine`과 `game/money.ts` 밖에서 금지 (D-33) / `dangerouslySetInnerHTML`, default export 금지 / `src/**/index.ts(x)`는 파일 자체가 오류 (D-35) / `switch-exhaustiveness-check`, `no-floating-promises`, `consistent-type-imports` / react-hooks recommended. 기본 세트는 `recommendedTypeChecked` (D-41) |
| ESLint가 못 막는 것 | 동적 `import()`는 계층 규칙 검사 대상이 아니다. `loadStats()` 밖의 동적 import는 리뷰로 막는다 (후속: 2번 작업에서 `loadStats` 파일이 생기면 그 밖의 `import()`를 금지하는 규칙 추가) |
| 하지 않는 것 | barrel 파일(다시 export만 하는 `index.ts`)을 만들지 않는다 (D-35) |
| 포맷 | Prettier (작은따옴표, 줄 길이 100). `docs/`, `prompts/`, `design/`, `CLAUDE.md`는 제외 (D-42) |
| Python | `analysis/`는 패키지(`__init__.py`)다. 모듈끼리 `from analysis.<모듈> import …`로 가져오고, 실행은 `uv run python -m analysis.<모듈>` (D-44). ruff로 lint와 포맷(줄 길이 100, 규칙 `E F I UP B`). 출력 경로는 인자나 상수 한 곳에서 정한다 |

## 3. 라우팅

| 경로 | 화면 |
|---|---|
| `/` | S-02 메인 (모바일이면 S-01 안내) |
| `/play` | S-03 로딩 → S-04 게임 |
| `/result/:recordId` | S-05 결과 (방금 끝난 판, 지난 기록) |
| `/records` | S-06 기록 목록 |

- 게임 중(준비 상태 포함) 뒤로 가기는 `useBlocker`로 막고 S-04b를 띄운다 (PROCESS 3장).
- 게임에서 결과로는 `replace`로 이동해, 뒤로 가기로 끝난 게임에 돌아가지 않게 한다.
- 방금 끝난 판은 store의 결과를 우선 보여 준다. 기록 저장에 실패해도 결과 화면은 표시한다.
- `vercel.json`에 SPA rewrite를 둔다. `/assets/`는 제외해, 배포 뒤 사라진 청크는 `index.html`이 아니라 404를 받게 한다 (D-47).
- 루트 라우트에 `errorElement`를 둔다. 예상하지 못한 오류에서 흰 화면 대신 안내를 띄운다. 통계 불러오기 실패는 S-03 안에서 처리한다(5장) (D-34).
- 기록 목록(S-06)과 지난 결과(S-05)는 라우트 loader가 `recordsStorage`로 읽는다.

## 4. 상태 관리와 고빈도 갱신 (NFR-05)

### 상태를 두는 곳

| 종류 | 예 | 두는 곳 |
|---|---|---|
| 정적 세계 | 코인 10개, 전체 가격 경로, 이벤트 일정 | `gameStore`에 참조로만 보관. 판을 시작할 때 한 번 정해짐 |
| 진행 상태 | 세부 단계 번호, 시계 상태, 배속, 포트폴리오, 대기 주문, 체결 내역, 활성 이벤트, 뉴스 피드, 결과 | `gameStore` (타입은 `game/types.ts`) |
| 공유 UI 상태 | 선택한 코인, 모달 접힘, 직접 주문 모드 | `gameStore` |
| 지역 UI 상태 | 주문 입력란 값, 토스트 | 컴포넌트의 `useState` |
| 저장 데이터 | 지난 기록 | localStorage (`recordsStorage.ts`), 라우트 loader가 읽음 |
| 주소 | `recordId` | URL |

- 현금 같은 원래 값만 저장하고, 현재가·평가금액처럼 계산할 수 있는 값은 저장하지 않는다. 셀렉터가 숫자를 반환하므로 값이 같으면 다시 렌더링되지 않는다.
- 시드는 store가 만들고(`crypto.getRandomValues`), 기록 시각도 store가 `Date.now()`로 정해 game에 인자로 넘긴다.

### store 규칙

- store는 도메인별로 `gameStore` 하나만 둔다. 틱 하나에 가격·체결·이벤트가 함께 바뀌기 때문이다. 파일이 커지면 같은 store 안에서 파일만 나눈다 (D-25).
- store 훅 자체는 export하지 않는다. 값 하나씩 반환하는 커스텀 훅(`useCoinPrice(id)`, `useTotalAsset()`)과 액션 묶음 `useGameActions()`만 export한다. 객체를 반환해야 하면 `useShallow`를 쓴다 (D-26).
- 액션은 setter가 아니라 이벤트 이름으로 짓는다(`placeOrder`, `chooseOption`, `pause`). 계산은 game 함수가 한다.
- game은 `(world, 이전 상태, 입력) → 새 상태`를 돌려주는 순수 함수다. 상태를 직접 바꾸지 않는다. store는 결과를 `set` 한 번으로 반영한다 (D-27).
- store 인스턴스는 앱 전체에 하나다. `tests/setup.ts`에서 테스트마다 초기 상태로 되돌린다 (D-29).

### 틱 흐름

```
store 타이머(requestAnimationFrame) → 경과 시간
  → game 함수(world, 상태, 경과 시간) → { 새 상태, 발생한 일(체결·뉴스·모달) }
  → set 한 번 → 값이 바뀐 훅을 쓰는 컴포넌트만 렌더링
  → 차트는 store의 구독 함수로 받아 series.update (React 렌더링 없음)
```

- 차트 컴포넌트는 생성할 때와 선택 코인이 바뀔 때만 `setData`를 호출한다. 틱마다 `series.update(마지막 캔들)`만 호출한다. 값은 store가 export하는 구독 함수로 받고, effect cleanup에서 구독을 해제한다 (D-28).
- 틱마다 바뀌는 값(현재가, 등락률, 평가금액)은 그 값을 쓰는 컴포넌트에서만 훅으로 구독한다.
- 게임 시계의 실제 타이머(`setInterval`·`requestAnimationFrame`)는 store 쪽에 두고, `game/clock`에는 경과 시간만 넘긴다.

### 판의 수명

| 시점 | 처리 |
|---|---|
| `/play` 진입 | 시드 생성 → game이 감싼 통계 불러오기·세계 생성 → 준비 상태. 이전 판 상태는 초기화 |
| 탭 이동 | PlayPage가 `visibilitychange`를 듣고 `pause()` 호출 |
| 이벤트 모달 | 시계가 `eventPending`이 되어 진행하지 않고, 바깥 주문은 game이 거부 |
| 종료 | 결과 계산 → 기록 저장(실패해도 결과는 store에 남음) → `navigate(replace)` |
| `/play` 이탈 | 타이머 정리. 시작·정리 함수는 두 번 불러도 안전하게 만든다(React StrictMode는 개발 중 effect를 두 번 실행) |

## 5. 통계 JSON 불러오기

- 불러오기는 `loadStats()` 한 곳에서만 한다. 다른 방식으로 바꿀 때도 이 함수만 고친다.
- `schemaVersion`이 엔진이 기대하는 값과 다르면 오류로 처리한다.
- 불러오기에 실패하면 S-03에 오류 안내를 띄운다. [다시 시도]는 `location.reload()`로 처리한다. 실패한 동적 import는 브라우저가 기억해 같은 import를 다시 해도 실패하기 때문이다.
- `vite:preloadError`를 전역에서 처리해 자동 새로고침을 한 번만 한다. 무한 새로고침은 sessionStorage 플래그로 막는다.
- 통계 JSON이 gzip 기준 2MB를 넘으면 내보내기 스크립트가 실패한다(8장). 그때 통계를 줄일지 `public/` + `fetch` 방식으로 바꿀지 판단한다. 배포 직후 청크를 못 찾는 문제가 반복될 때도 이 전환을 검토한다.

## 6. 금액 계산

- 현금, 묶인 현금, 수수료, 체결 금액은 원 단위 정수다. 수량은 소수 `number`다.
- 반올림 함수는 `src/game/money.ts`에만 둔다.
  - 수수료(0.05%): 올림
  - 매도해서 받는 금액: 내림
  - 평가금액: 계산할 때는 반올림하지 않고, 화면에 표시할 때만 내림
- 지정가 매수를 걸면 주문 금액과 수수료를 함께 묶는다. 지정가보다 낮은 가격에 체결되면 실제 체결 금액과 수수료를 뺀 나머지를 돌려준다. 취소하거나 판이 끝나면 전액 돌려준다.
- 정상 종료할 때 보유 코인은 마지막 가격으로 평가하고 매도 수수료는 빼지 않는다(P-5).

## 7. 테스트

### 반드시 테스트할 경우

| 대상 | 경우 |
|---|---|
| `engine` | 같은 시드 + 고정 통계 → `GameWorld` 해시 동일 / 가격 > 0, 고가 ≥ max(시가, 종가), 저가 ≤ min(시가, 종가), NaN 없음 / 고가·저가 = 세부 단계 가격의 최대·최소 / 코인 구성 대장 1·대형 2·중형 3·소형·밈 4, 폭락형은 0~1개이고 소형·밈 또는 중형 한 자리를 대체 / 표시용 성격에 폭락형이 없음 / 실제 티커와 이름이 겹치지 않음 / 비정상 결과면 다른 시드로 재생성 |
| `engine/events` | 결정 시점 가격 (처음 발생한 코인 절반 반영, 전파받는 코인 반영 전, 시장 전체 이벤트는 전부 절반) / 지연 전파는 1~3캔들 뒤에 반영 / 받는 충격 = 원래 충격 × 세기 × β / 영향 없음이면 가격 변화 없음, 반대 방향이면 부호 반대 / 전파 대상 코인마다 후속 기사 생성 / 이벤트 횟수와 최소 간격이 설정값 범위 안 (F-12) |
| `game/orders` | 최소 주문 금액 5,000원, 현금 부족, 보유량 부족 거부 / 지정가 매수 금액 묶기와 취소 시 반환 / 체결 판정은 세부 단계 가격 기준 (매수: 가격 ≤ 지정가, 매도: 가격 ≥ 지정가), 주문 이전 세부 단계로는 체결하지 않음 / 체결 가격 = 판정한 세부 단계 가격, 지정가를 건너뛰면 건너뛴 가격에 체결하고 남은 묶인 현금 반환 / 모달 전 일시정지 가격에서 지정가 판정 / 수수료와 반올림 방향 |
| `game/portfolio` | 평균 매수가, 평가손익 / fast-check 불변식: 현금 ≥ 0, 묶인 현금 = 대기 중인 지정가 매수 금액 합, 보유량 ≥ 0, 금액(현금·묶인 현금·수수료)은 정수 |
| `game` 이벤트 판정 | 보유 코인이 충격·전파를 받을 때와 시장 전체 이벤트일 때만 모달 / 마지막 10캔들과 지연 전파는 뉴스 피드로 / 같은 캔들 여러 이벤트 A·B 모드 둘 다 |
| `game/scoring` | 등급 경계 +30%, +15%, +5%, −5% / 최대 낙폭 / 끝까지 보유했을 때와 비교 / 종료할 때 지정가 자동 취소와 현금 반환 |
| `game/records` | 기록에 시드와 통계 `schemaVersion` 포함 / 형식이 깨진 항목은 건너뛰고 나머지는 읽음 |
| UI (Testing Library) | 주문 버튼 비활성화와 이유 표시 / 모달에서 선택하면 재개 / 접은 상태에서 [재생] 누르면 다시 펼침 / 게임 중 뒤로 가기 → S-04b / 차트가 언마운트되면 store 구독 해제 |
| `analysis` (pytest) | 값을 알고 있는 합성 데이터로 통계 함수 정확도 (β, 상태, 조각 경계) / 전파·폭락을 심은 합성 데이터에서 심은 값을 되찾음 / 가공 기준 검사마다 실패하는 경우 / 같은 입력이면 같은 바이트 / 실제 이름 해시 고정 예시 |
| `scripts/collect` | 페이지 나누기와 종료 조건, 무한 반복 방지, 시각 기준 중복 제거, 이어 받기, 깨진 CSV 보호, 속도 제한·재시도(가짜 시계), Origin 헤더 없음(로컬 서버), 빈 구간 보고서 |
| `engine/statsSchema` | fixture가 `StatsFile` 타입을 통과(typecheck), `schemaVersion`, 분위수 격자, 조각 길이 |

### 기준
- 커버리지: `src/engine`, `src/game` 라인 90% 이상 **[임시값]**. UI에는 기준을 두지 않는다.
- 통계를 쓰는 테스트는 `tests/fixtures/`의 작은 고정 통계 JSON만 쓴다.
- 테스트 파일은 대상 파일 옆에 둔다(`orders.ts` ↔ `orders.test.ts`, `OrderPanel.tsx` ↔ `OrderPanel.test.tsx`). `tests/`에는 fixtures와 공용 `setup.ts`만 둔다 (D-32).
- Vitest 프로젝트 세 개 (`vite.config.ts`, D-43): `core`는 `src/{engine,game,config}`의 테스트를 node 환경에서, `scripts`는 `scripts/**`의 테스트를 node 환경에서(커버리지 기준 밖), `ui`는 나머지를 jsdom 환경에서 `tests/setup.ts`(jest-dom, 렌더링 정리, store 초기화)와 함께 돌린다. 전역 함수(`describe` 등)는 쓰지 않고 `vitest`에서 import한다.
- 벤치마크는 `*.bench.ts`를 대상 파일 옆에 두고 `core` 프로젝트에서만 돈다.
- Python 테스트도 대상 파일 옆에 둔다(`analysis/returns.py` ↔ `analysis/test_returns.py`) (D-45).

## 8. 성능

| 항목 | 기준 | 측정 |
|---|---|---|
| 시세 생성 (NFR-06) | 1초 이내 (CI 테스트는 2초 넘으면 실패) | `npm run bench`, 테스트 |
| 틱 처리 (NFR-05) | `game` 로직이 틱당 2ms 이하 **[임시값]**, 3배속에서 프레임 드롭 없음 | 벤치마크, Chrome Performance |
| 입력 반응 (NFR-04) | 100ms 이내 **[임시값]** | 수동 확인 |
| 통계 JSON (NFR-07) | gzip 기준 2MB 이하 **[임시값]** | 내보내기 스크립트가 크기를 출력하고 초과하면 실패 |

## 9. 데이터 무결성

- 통계 JSON에는 `schemaVersion`과 메타데이터(출처, 사용한 원본의 기간 `dataFrom`·`dataUntil`, 분석 조건)를 넣는다. 실행 시각은 넣지 않는다. `uv.lock`으로 고정한 환경에서 `npm run stats` 한 명령으로 다시 만들고, 같은 원본이면 바이트 단위로 같아야 한다 (D-62, D-80).
- 게임용 통계는 가공 기준(data-spec 4.3)을 통과한 값만 내보낸다. 어기면 `npm run stats`가 파일을 쓰지 않고 실패한다 (D-56, D-80).
- 수집은 시각 기준으로 중복을 제거한다. 이어 받기를 몇 번 다시 해도 결과가 같아야 한다. 빈 구간은 보고서로 출력한다.
- `data/raw/` 컬럼: 시각(UTC), 시가, 고가, 저가, 종가, 거래량, 거래대금 (`time,open,high,low,close,volume,quote_volume`, D-58). 출처가 바뀌어도 이 형식을 유지한다.
- 업비트 API 요청 제한을 지키고, 요청 헤더와 키를 로그에 남기지 않는다.

## 10. 보안

- 서버와 개인정보가 없다. localStorage 조작은 허용한다(NFR-10).
- CI에서 `npm audit --audit-level=high`를 실행한다.
- GitHub 시크릿 스캔과 push protection을 켠다.
- `.claude/settings.json` (D-48): 커밋·push·PR·GitHub·Vercel 명령은 실행할 때마다 확인(ask), force push와 `.env` 읽기(Read와 흔한 셸 명령)는 금지(deny), 검사 명령(`npm run lint` 등, `uv run ruff`·`pytest`)은 허용(allow). 셸로 `.env`를 읽는 경로를 모두 막지는 못하므로 CLAUDE.md 규칙이 기준이다.

## 11. Git과 CI/CD

| 항목 | 규칙 |
|---|---|
| 브랜치 이름 | `dev/feat/<짧은 설명>`, `dev/fix/...`, `dev/hotfix/...`, 데이터 작업은 `dev/feat/data-...` |
| 작업 흐름 | `qa`에서 분기 → PR → squash 병합으로 `qa` |
| 릴리스 | 단계가 끝나고 `qa`에서 플레이테스트를 마치면 `qa → main` PR을 merge commit으로 병합하고 `v0.x` 태그 |
| hotfix | `main`에서 `dev/hotfix/*` 분기 → `main`에 병합 → 곧바로 `qa`에도 반영 |
| CI (GitHub Actions) | `.github/workflows/ci.yml`. `qa`·`main` 대상 PR과 push. `web` 잡: `npm ci` → `lint` → `format:check` → `typecheck` → `test:coverage` → `build` → `npm audit --audit-level=high`. `analysis` 잡(항상 실행): `uv sync --locked` → `ruff check` → `ruff format --check` → `pytest` (D-49) |
| 브랜치 보호 | `main`·`qa`: PR 필수(승인 0명), 필수 체크 `web`·`analysis`, 관리자도 예외 없음, force push·삭제 금지. 병합 방식은 squash와 merge commit만(rebase 금지), squash 커밋 제목·본문은 PR 제목·본문, 병합 후 브랜치 자동 삭제. 그래서 PR 제목을 Conventional Commits 형식으로 쓴다 (D-50) |
| Vercel | `main` → 프로덕션(`coin-sim-jade.vercel.app`), `qa` → 고정 미리보기(자동 브랜치 URL, 플레이테스트), PR → 일회성 미리보기(Vercel 봇이 PR에 댓글). 미리보기 보호는 끔. 빌드 Node는 프로젝트 설정에서 24.x (D-52, D-53) |
| 커밋 | `type(scope): 한국어 내용`. type: feat, fix, refactor, test, docs, chore, data, perf. scope: engine, game, store, ui, collect, analysis, config, ci |
