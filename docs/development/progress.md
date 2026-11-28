# Coin Sim — 진행 상황

세션을 시작할 때 먼저 읽는 인계 문서다. **상태만** 적는다. 결정과 근거는 [decisions.md](decisions.md), 플레이테스트 결과는 [PLAYTEST.md](../PLAYTEST.md), 데이터 형식은 [data-spec.md](data-spec.md)에 두고 여기서는 링크만 한다.

- 형식: 로컬 `prompts/stage_dev_prompt.md`의 "인계 문서" (`prompts/`는 git에서 제외, 로컬과 저장소 밖 백업에만 있음)
- 마지막 갱신: 2026-11-28 (2번 작업 마무리)

---

## 단계별 상태

| 단계 | 상태 | 작업 프롬프트 | 비고 |
|---|---|---|---|
| 0. 프로젝트 셋업 | 완료 (2026-11-24, `v0.0`) | `prompts/setup_prompt.md` | 결정 D-22~D-54. 릴리스 PR #3 |
| 1. 데이터 수집 | 완료 (원본 로컬) | `prompts/data_pipeline_prompt.md` | 전체 302개 수집 완료(2026-11-27, 요청 37,102건, 1시간 18분, 560MB). 백업: `~/projects/coin-sim-data-backup/raw-2026-11-28/` (체크섬 확인) |
| 2. 통계 추출 | 완료 | 같음 | 통계 JSON 스키마 v1 (`data/stats/stats.json`) |
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
| 문서 마무리 | CLAUDE.md 명령어·기술 스택, OVERVIEW 6장, 이 문서 (PR #2) | `404e1c7` |
| 릴리스 | `qa` → `main` (PR #3), 태그 `v0.0` | `d4f5ca3` |

## 1·2단계 진행 (2번 작업)

PR은 3개로 나눈다: `dev/feat/data-spec`(2·3) → `dev/feat/data-collect`(4·5) → `dev/feat/data-stats`(6·7·9). 모두 `qa`에서 분기한다.

| 하위 단계 | 상태 | 결과 |
|---|---|---|
| 1. 현황 확인 | 완료 | 셋업 결과 확인, [추측] 13개와 결정 목록 |
| 2. 출처 조사 | 완료 | [data-spec.md](data-spec.md) 부록 A. 키 불필요, 원화 마켓 301개, 캔들 누락 확인, 상장 폐지 코인 받을 수 없음. 약관 판단: 가공한 통계만 배포 (D-55, D-56) |
| 3. 데이터 명세 초안 | 완료 | [data-spec.md](data-spec.md) 초안, D-57~D-63 |
| 4. 수집기 개발 | 완료 | `scripts/collect.ts`, `scripts/collect/`. 마켓 목록 → 나눠 받기·요청 제한(초당 8회, 429·418·5xx 처리) → CSV 저장·이어 받기·중복 제거 → 빈 구간 보고서. data-spec 2장 |
| 5. 시범 수집 (10개) | 완료 | 캔들 48만 8,990개, 요청 1,652건, 3분 28초. 끊고 다시 실행해서 이어 받기, 다시 실행해도 같은 파일 확인. 결과는 [data-spec.md](data-spec.md) 부록 A |
| 6. 통계 추출 | 완료 | 6.1 정제 완료(`analysis/clean.py`, D-64~D-67). 시범 10개 중 8개 사용(HAEDAL 기간 부족, USDT 스테이블코인). 6.2a 시장 지수·상태·β·변동성·조각·성격 완료(`analysis/stats.py` 등, D-68~D-72). 6.2b 급등락·전파 완료(`analysis/shocks.py`, D-73~D-75). 정제에 호가 단위 잡음 규칙 추가(D-76). 6.2c 폭락형·캔들 꼬리 완료(`analysis/crash.py`, D-77·D-78). 전체 데이터로 기준값 조정(D-79): 사용 239개 |
| 7. 스키마 v1 확정과 내보내기 | 완료 | `npm run stats` → `data/stats/stats.json`(gzip 1.15MB, 사용 239개), fixture, `src/engine/statsSchema.ts`(D-80). data-spec v1 확정 |
| 8. 전체 수집 (백그라운드) | 완료 (앞당겨 실행) | 302개 모두 성공, 캔들 7,878,151개. 성격 그룹 최소 3개를 채우려고 6.2a 뒤에 실행 |
| 9. 마무리 | 완료 | 기획 문서 수정 목록 반영, 후속 작업 정리, `prompts/README.md` 회고 |

## 열린 질문과 결정 대기

| 항목 | 언제까지 | 기준 |
|---|---|---|
| 남은 [임시값]은 현실감 검증 리포트(4단계)와 플레이테스트에서 다시 확인: 상태 ±11%, 조각 12~36시간, 급등락 ±8%/±4%, 폭락 −50%, 성격 구간 비율, 숫자 4자리 | 4단계 | [data-spec.md](data-spec.md) 3.1·4.2, D-79, D-80 |
| 업비트 약관의 2023-10 이후 개정 여부 (upbit.com 약관 페이지를 도구로 읽지 못함, 브라우저로 확인) | 8단계(배포) 전 | data-spec 부록 A, NFR-11 |
| OVERVIEW 8장 #11~14 (지연 전파 처리) | 3단계 전 | [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) 8장 |
| OVERVIEW 8장 #15 (현재가보다 불리한 지정가) | 5단계 전 | 같음 |
| 단계마다 시작 전에 정할 것 | 각 단계 시작 | stage_dev_prompt.md "단계 카드" |

기획 문서 수정 목록(2번 작업)은 2026-11-28에 모두 반영했다: OVERVIEW 3·4·6·7·9장, REQUIREMENTS NFR-11, FEATURES F-02·F-03·2장, PLAYTEST PT-13·15·16·17, conventions 1·2·7·9장, CLAUDE.md. 각 문서 변경 이력에 기록.

## 후속 작업 (지금 단계 범위 밖이라 하지 않은 일)

| 언제 | 할 일 | 관련 |
|---|---|---|
| 3단계 | `loadStats()`(동적 `import()`, `schemaVersion` 검사)와, 그 파일 밖의 동적 `import()`를 금지하는 ESLint 규칙 (2번 작업에서 넘김) | conventions 2장, D-80 |
| 3단계 | 실제 이름 해시 TS 구현으로 가상 코인 이름 거르기. data-spec 5장 고정 예시 4개를 TS 테스트로 맞춘다 | D-61 |
| 3단계 | config [임시값]: 상태 목표 비율(PT-15), 시작 가격·거래량(PT-16), 이벤트 종류별 전파 가중치, 영향 없음 확률(PT-13), 폭락 시작 시점·막판 반등 확률(PT-17) | conventions 2장 |
| 3단계, 7단계 | 런타임 검증: 통계 JSON은 쓰지 않기로 함. `loadStats()`에서 깊은 검증이 필요한지, 기록(localStorage) 검증을 어떻게 할지 | D-80 |
| 4단계 | 현실감 검증 리포트는 성격 그룹 단위로만 싣는다 (가공 기준). 상관관계는 리포트가 로컬 원본에서 계산 | data-spec 4.2·4.3 |
| 3·5단계 | fast-check, @testing-library/user-event 설치 (쓰는 단계에서) | |
| 5단계 | `vite:preloadError` 처리 (S-03) | conventions 5장, D-06 |
| 8단계 | ErrorPage 문구 다듬기 (지금은 임시 문구) | D-34 |
| 자동화하려면 | 로컬 스케줄러(launchd/cron)로 `npm run collect && npm run stats`. 통계 값이 바뀌면 엔진 스냅샷이 바뀌므로 PR로 반영. 원본 백업도 주기적으로 갱신. CI에서 돌리려면 CLAUDE.md "수집·분석을 CI에서 실행하지 않는다"를 고치고 원본(560MB, 비공개)을 둘 곳이 필요 | data-spec 7장 |
| 프로젝트를 마친 뒤 업데이트 | 서버에서 시세 생성으로 구조 변경 검토 (통계를 브라우저에 보내지 않음). CLAUDE.md·OVERVIEW 원칙 변경 필요 | D-56 |
| 게임 확장·수집 확대 때 | 시가총액·섹터용 외부 API 검토 | D-57 |
| 언제든 | typescript-eslint가 TypeScript 7을 지원하면 올리기 | D-36 |
| 언제든 | GitHub Action을 SHA로 고정하고 Dependabot 도입 | D-49 |
| 언제든 | npm이 막은 esbuild 설치 스크립트를 허용할지 거부할지 정하기 (지금은 없어도 tsx가 동작함) | D-51 |

## 플레이테스트 대기 항목

없음. 게임 화면이 생기는 5단계부터 [PLAYTEST.md](../PLAYTEST.md) 항목을 `qa` 미리보기에서 시험한다.

## 다음 세션이 먼저 할 일

1. `dev/feat/data-stats` PR이 `qa`에 병합됐는지 확인한다. 2번 작업(1·2단계)은 이것으로 끝난다.
2. `prompts/stage_dev_prompt.md`로 3단계(생성 엔진)를 시작한다(`이번 단계: 3`). 계약은 [data-spec.md](data-spec.md) 4·5장과 `src/engine/statsSchema.ts`, 테스트용 통계는 `tests/fixtures/stats.small.json`이다. 시작 전에 OVERVIEW 8장 #11~14를 정한다.
3. 원본이 필요하면 로컬 `data/raw/` 또는 백업 `~/projects/coin-sim-data-backup/raw-2026-11-28/`을 쓴다 (다른 컴퓨터면 백업을 복사한 뒤 `npm run collect`).
