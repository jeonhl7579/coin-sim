# Coin Sim

업비트 실제 시세에서 뽑은 통계로 가상 코인 10개와 600캔들 시세를 브라우저에서 시드 기반으로 생성하고,
혼자 매매하는 데스크톱 웹 게임이다. 서버·로그인·DB는 없다. 재미가 우선이고, 현실감은 개발용 검증 리포트로 증명한다.

세부 규칙: [docs/development/conventions.md](docs/development/conventions.md)
기획 문서는 `docs/`에, 개발 관련 문서는 `docs/development/`에 둔다.

## 작업 방식

- 구현은 OVERVIEW 7장의 단계(0~8) 순서로 하고, 단계의 완료 기준을 만족하면 멈추고 확인받는다.
- 문서에 없는 규칙·수치는 추측하지 않고 질문한다.
- 기획 값을 바꿀 때는 아래 기준 문서를 먼저 고치고, 요약이 있는 다른 문서를 따라 고친다.
- 기능·요구사항 ID는 접두어까지 쓴다. FR-31(검증 리포트)과 F-31(결과 화면)은 다른 항목이다.
- `[추측]`은 구현 전에 확인한다. `[임시값]`, `[테스트 후 결정]` 값은 `src/config/`에 두고 PLAYTEST.md 항목을 주석으로 단다.

| 무엇 | 기준 문서 |
|---|---|
| 게임 규칙 확정값 (템포, 자금, 수수료, 코인 구성) | docs/PROJECT_OVERVIEW.md 2장 |
| 이벤트 전파, 체결 가격, 주문, 등급 | docs/FEATURES.md 2장 |
| 이벤트 모달 동작 | docs/SCREENS.md S-04a |
| 흐름과 예외 처리 | docs/PROCESS.md |
| 요구사항, 비기능 기준 | docs/REQUIREMENTS.md |
| 플레이테스트로 정할 값 | docs/PLAYTEST.md |
| 개발 결정과 근거 (바꾸면 새 행 추가) | docs/development/decisions.md |
| 진행 상황, 열린 질문, 후속 작업 (세션을 시작할 때 먼저 읽음) | docs/development/progress.md |

## 기술 스택

React 19 + Vite 8 + TypeScript 6.0(strict), Zustand 5, React Router 8(데이터 라우터 `createBrowserRouter`), lightweight-charts, Vitest 5 + Testing Library + fast-check,
Node 24.22.3(`.nvmrc`) + npm + tsx(수집), Python 3.12(`.python-version`) + uv + pandas·numpy + ruff + pytest(분석), GitHub Actions, Vercel.
- TypeScript 7은 typescript-eslint가 지원할 때까지 쓰지 않는다 (D-36). lock은 `.nvmrc`의 Node에 포함된 npm으로만 만든다 (D-51).
- 결과·기록 화면 그래프 라이브러리는 7단계에서 정한다. 그 전에 추가하지 않는다.

## 명령어

처음 한 번 (`.env`가 없으면 `--env-file`을 쓰는 명령이 실패한다, D-46):

```bash
nvm use && npm ci && uv sync && cp .env.example .env
```

```bash
npm run dev            # 개발 서버
npm run build          # 프로덕션 빌드 (타입 검사는 typecheck로 따로)
npm run preview        # 빌드 결과 미리보기
npm run lint           # ESLint (계층 import·재현성·반올림·localStorage 규칙 포함)
npm run typecheck      # tsc -p로 tsconfig 3개 검사 (src 전체, DOM 없는 engine·game·config, Node 파일)
npm run test           # Vitest (core: node, ui: jsdom, scripts: node)
npm run test:coverage  # 커버리지 (engine·game 라인 90%)
npm run bench          # 시세 생성·틱 처리 벤치마크
npm run format         # Prettier로 고치기
npm run format:check   # Prettier 검사 (CI)
npm run collect        # tsx --env-file=.env scripts/collect.ts
npm run stats          # 원본 → 통계 JSON과 fixture (uv run --env-file .env python -m analysis.build, data-spec 7장)

uv run ruff check analysis && uv run ruff format analysis
uv run pytest analysis
uv run --env-file .env python -m analysis.<모듈>
```

작업을 마치기 전에 `lint`, `format:check`, `typecheck`, `test`를 실행해 통과시킨다. `analysis/`를 고쳤으면 ruff와 pytest도 실행한다. CI는 이것과 `test:coverage`, `build`, `npm audit`을 PR마다 검사한다.

## 구조와 모듈 경계

```
scripts/collect.ts   업비트 캔들 수집 → data/raw/ (gitignore). 로직은 scripts/collect/
analysis/            Python 정제·통계 → data/stats/stats.json (커밋, npm run stats), 검증 리포트. 중간 산출물은 data/interim/ (gitignore)
src/main.tsx, src/router.tsx   진입점, createBrowserRouter와 루트 errorElement
src/config/          템포·수수료·등급·이벤트 설정값 (engine·game이 함께 import)
src/engine/          통계 + 시드 → GameWorld 생성, feed, loadStats(). 순수 TS
src/game/            시계, 주문, 포트폴리오, 이벤트 판정, 결과, 기록 형식(records.ts). 순수 TS
src/store/           Zustand gameStore 하나(game을 React에 연결, 타이머), recordsStorage.ts(localStorage)
src/components/      화면별 폴더(game/, result/, records/) + common/. 그리기와 입력
src/pages/           라우트당 1개(MainPage, PlayPage, ResultPage, RecordsPage). loader, useBlocker
tests/               fixtures/(stats.small.json, npm run stats가 만듦), setup.ts. 테스트 파일은 대상 파일 옆에 둔다
```

- 패턴은 MVVM을 참고한다: Model = `engine`·`game`, Repository = `loadStats()`·`recordsStorage.ts`, ViewModel = `store`, View = `components`·`pages`. 근거: decisions.md D-22.
- 값 import는 **바로 아래 계층만** 허용한다: `pages → components → store → game → engine → config`. `pages`는 `store`도 import할 수 있다. `config`는 `engine`과 `game`이 함께 import하고, `src`의 다른 것을 import하지 않는다.
- `import type`은 아래 방향이면 계층을 건너뛸 수 있다. 위 방향 import는 타입이어도 금지한다.
- 그래서 store는 engine을 직접 부르지 않는다. `loadStats()`와 세계 생성은 game이 감싸서 store에 제공하고, 화면에 필요한 설정값·표시용 금액은 store 훅이 넘긴다.
- `engine`과 `game`은 react, zustand, DOM·`window`·`document`를 쓰지 않는다.
- localStorage는 `store/recordsStorage.ts`에서만 쓴다. 기록 만들기와 형식 검증은 `game/records.ts`의 순수 함수로 한다.
- 다시 export만 하는 barrel 파일(`index.ts`)을 만들지 않는다.
- 가격 경로는 `engine`이 시드로 전부 미리 만든다. 플레이어의 선택은 가격을 바꾸지 않고 포트폴리오에만 영향을 준다.
- 이벤트 결정 시점과 그때의 가격(처음 발생한 코인은 충격 절반, 전파받는 코인은 반영 전)은 `engine`이 계산한다. `game`은 선택지를 띄울지만 판정한다.
- 가격은 `feed`로만 읽는다. 서버 WebSocket으로 바꿀 지점이므로 인터페이스를 넓히지 않는다.
- 규칙 로직은 `game`에 둔다. store와 컴포넌트에서 체결·수익을 계산하지 않는다.
- 통계 JSON은 `loadStats()` 한 곳에서만 동적 `import()`로 불러오고 `schemaVersion`을 검증한다.
- 게임 중 브라우저 뒤로 가기는 `useBlocker`로 막고 그만두기 확인 창(S-04b)을 띄운다.
- 미래를 대비한 추상화를 만들지 않는다. 섹터 흐름은 공식에 0으로 자리만 둔다.

## 반드시 지킬 규칙

- `src/engine`과 `src/game`에서 `Math.random`, `Date.now`를 쓰지 않는다. 난수는 `rng.ts`를 주입받고, 시간은 경과 시간을 인자로 받는다.
- 같은 시드와 통계면 같은 `GameWorld`가 나와야 한다. 이 결과를 바꾸는 변경은 스냅샷 갱신 이유를 PR에 적는다.
- 금액(현금, 묶인 현금, 수수료)은 원 단위 정수로 다루고, 수량은 소수 `number`로 둔다.
- 반올림은 `src/game/money.ts`에서만 한다. 수수료는 올리고, 매도해서 받는 금액은 내린다. `Math.round·floor·ceil·trunc`는 engine과 money.ts 밖에서 ESLint로 막는다.
- game은 `(이전 상태, 입력) → 새 상태`를 돌려주는 순수 함수로 만든다. store는 틱마다 `set`을 한 번만 한다.
- 차트는 `setData`를 처음 그릴 때와 코인을 바꿀 때만 쓴다. 틱마다 `series.update`만 호출하고, 값은 store의 구독 함수로 받는다(React 렌더링 없이).
- store는 store 훅 자체를 export하지 않고, 값 하나씩 반환하는 커스텀 훅(`useCoinPrice(id)`)과 `useGameActions()`만 export한다. 틱마다 게임 화면 전체가 다시 렌더링되게 하지 않는다.
- 상승은 빨강과 ▲, 하락은 파랑과 ▼로 함께 표시한다. 파랑을 강조색으로 쓰지 않는다.
- 뉴스와 저장된 기록은 텍스트로만 렌더링한다. `dangerouslySetInnerHTML`을 쓰지 않는다.
- localStorage 키에 버전을 붙인다(`coin-sim:records:v1`). 읽을 때 형식을 검증하고 깨진 항목은 건너뛴다.
- 기록에는 시드와 통계 `schemaVersion`을 함께 저장한다.
- 가상 코인 이름과 티커는 실제 코인(수집한 마켓 목록)과 겹치지 않게 한다. `stats.json`의 `realNames` 해시로 거른다 (data-spec 5장).

## 비밀 정보

- 비밀키는 `.env`에만 두고 `.env.example`에는 키 이름만 적는다. `.env`는 커밋하지 않는다.
- 비밀키는 `scripts/`와 `analysis/`에서만 쓴다. `src/`는 비밀키 없이 동작해야 한다.
- `VITE_` 접두어는 공개해도 되는 값에만 쓴다. 번들에 그대로 들어간다.
- `.env`를 읽거나 출력하지 않는다. 키를 코드, 로그, 테스트에 하드코딩하지 않는다.
- 키가 유출되면 커밋 삭제보다 키 폐기·재발급을 먼저 하라고 알린다.

## 테스트

- `engine`과 `game`의 로직을 바꾸면 테스트를 함께 작성하거나 고친다. 라인 커버리지 90% 이상을 유지한다 **[임시값]**.
- 테스트는 `data/stats`가 아니라 `tests/fixtures/`의 고정 통계를 쓴다.
- 현금 ≥ 0, 묶인 현금 = 대기 중인 지정가 매수 금액 합, 보유량 ≥ 0, 금액은 정수를 fast-check 불변식으로 검사한다.
- UI는 Testing Library로 핵심 상호작용만 테스트한다. E2E는 8단계에서 검토한다.
- 반드시 테스트할 경우의 목록과 성능 기준: [docs/development/conventions.md](docs/development/conventions.md) 7장 "테스트", 8장 "성능".

## Git

- 브랜치: `main`(프로덕션) ← `qa`(통합·플레이테스트) ← `dev/feat/*`, `dev/fix/*`, `dev/hotfix/*`.
- `dev`라는 이름의 브랜치를 만들지 않는다. `dev/...` 브랜치와 충돌한다.
- `main`과 `qa`에 직접 push하지 않는다. PR과 CI 통과 후에만 병합한다.
- 작업 브랜치 → `qa`는 squash 병합, `qa` → `main`은 merge commit으로 병합하고 `v0.x` 태그를 붙인다.
- 커밋은 Conventional Commits 형식으로 쓴다. 타입·범위는 영어, 내용은 한국어. 예: `feat(engine): 상태 전환 확률 적용`.
- 사용자가 요청하기 전에는 커밋·push·PR을 하지 않는다.

## 하지 않는 것

- MVP 이후 기능(F-21, F-22, F-24, F-25, F-33)을 구현하지 않는다.
- 현실감 검증 화면을 게임 안에 넣지 않는다. 검증은 Python 리포트와 README로만 한다.
- 실제 뉴스 기사, 실제 코인 이름·티커를 게임에 쓰지 않는다.
- 공매도, 레버리지, 섹터 이벤트를 넣지 않는다.
- 수집·분석을 CI에서 실행하지 않는다.
