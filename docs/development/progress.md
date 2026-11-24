# Coin Sim — 진행 상황

세션을 시작할 때 먼저 읽는 인계 문서다. **상태만** 적는다. 결정과 근거는 [decisions.md](decisions.md), 플레이테스트 결과는 [PLAYTEST.md](../PLAYTEST.md), 데이터 형식은 data-spec.md(2번 작업에서 만듦)에 두고 여기서는 링크만 한다.

- 형식: 로컬 `prompts/stage_dev_prompt.md`의 "인계 문서" (`prompts/`는 git에서 제외, 로컬에만 있음)
- 마지막 갱신: 2026-11-24 (0단계 셋업)

---

## 단계별 상태

| 단계 | 상태 | 작업 프롬프트 | 비고 |
|---|---|---|---|
| 0. 프로젝트 셋업 | 완료 (릴리스 `v0.0` 대기) | `prompts/setup_prompt.md` | 결정 D-22~D-54 |
| 1. 데이터 수집 | 대기 | `prompts/data_pipeline_prompt.md` | 시범 수집 10개 → 전체 수집(백그라운드) |
| 2. 통계 추출 | 대기 | 같음 | 통계 JSON 스키마 v1 |
| 3. 생성 엔진 | 대기 | `prompts/stage_dev_prompt.md` | 2단계 스키마 v1 이후 |
| 4~8 | 대기 | 같음 | |

## 0단계에서 완료한 것

| 하위 단계 | 결과 | 커밋 |
|---|---|---|
| 아키텍처 패턴 | MVVM 참고 계층, 바로 아래 계층만 import, store 하나와 원자 훅 (D-22~D-35) | `d7ca95f` |
| 로컬 뼈대 | Vite 8 + React 19 + TS 6.0, React Router 8 라우트 4개, ESLint 규칙(위반 예시로 확인), Vitest core/ui, uv·ruff·pytest (D-36~D-48) | `d7ca95f` |
| Git·GitHub | 공개 저장소 [jeonhl7579/coin-sim](https://github.com/jeonhl7579/coin-sim), `main`·`qa` 브랜치 보호(필수 체크 `web`·`analysis`), 시크릿 스캔·push protection (D-50) | — |
| CI | `.github/workflows/ci.yml`, PR #1 (D-49, D-51) | `a70471f` |
| Vercel | 프로덕션 https://coin-sim-jade.vercel.app , `qa` 자동 브랜치 URL, PR 미리보기 (D-52, D-53) | — |
| 문서 마무리 | CLAUDE.md 명령어·기술 스택, OVERVIEW 6장, 이 문서 | 이 PR |

## 열린 질문과 결정 대기

| 항목 | 언제까지 | 기준 |
|---|---|---|
| OVERVIEW 8장 #11~14 (지연 전파 처리) | 3단계 전 | [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) 8장 |
| OVERVIEW 8장 #15 (현재가보다 불리한 지정가) | 5단계 전 | 같음 |
| 단계마다 시작 전에 정할 것 | 각 단계 시작 | stage_dev_prompt.md "단계 카드" |

## 후속 작업 (0단계 범위 밖이라 하지 않은 일)

| 언제 | 할 일 | 관련 |
|---|---|---|
| 1·2단계 (2번 작업) | 업비트 API에 키가 필요한지 확인하고 `.env.example` 갱신 | D-46 |
| 1·2단계 | pandas·numpy 추가, ruff `PD`·`NPY` 규칙 추가 | D-45 |
| 1·2단계 | 분석 중간 파일(정제 CSV, 캐시)은 `data/raw/`나 무시되는 폴더에만 둔다는 규칙 | `.gitignore` |
| 1·2단계 | `loadStats` 파일 밖의 동적 `import()`를 금지하는 ESLint 규칙 (지금 계층 규칙은 동적 import를 검사하지 않음) | conventions 2장 |
| 1·2단계 | fixtures·통계 파일을 넣으면 `tests/fixtures/.gitkeep`, `data/stats/.gitkeep` 삭제 | |
| 1·2단계, 7단계 | 런타임 검증 라이브러리(zod 등)를 쓸지 판단 (통계 JSON, 기록) | |
| 3·5단계 | fast-check, @testing-library/user-event 설치 (쓰는 단계에서) | |
| 5단계 | `vite:preloadError` 처리 (S-03) | conventions 5장, D-06 |
| 8단계 | ErrorPage 문구 다듬기 (지금은 임시 문구) | D-34 |
| 언제든 | typescript-eslint가 TypeScript 7을 지원하면 올리기 | D-36 |
| 언제든 | GitHub Action을 SHA로 고정하고 Dependabot 도입 | D-49 |
| 언제든 | npm이 막은 esbuild 설치 스크립트를 허용할지 거부할지 정하기 (지금은 없어도 tsx가 동작함) | D-51 |
| 언제든 | `prompts/`를 따로 백업 (2026-11-24부터 git에서 제외, 로컬에만 있음) | D-54 |

## 플레이테스트 대기 항목

없음. 게임 화면이 생기는 5단계부터 [PLAYTEST.md](../PLAYTEST.md) 항목을 `qa` 미리보기에서 시험한다.

## 다음 세션이 먼저 할 일

1. `qa` → `main` 릴리스와 `v0.0` 태그가 끝났는지 확인한다 (0단계 마지막 작업).
2. `prompts/data_pipeline_prompt.md`로 1·2단계를 시작한다. 위 "후속 작업"의 1·2단계 항목을 함께 처리한다.
