# Coin Sim — 진행 상황

세션을 시작할 때 먼저 읽는 인계 문서다. **상태만** 적는다. 결정과 근거는 [decisions.md](decisions.md), 플레이테스트 결과는 [PLAYTEST.md](../PLAYTEST.md), 데이터 형식은 [data-spec.md](data-spec.md)에 두고 여기서는 링크만 한다.

- 형식: 로컬 `prompts/stage_dev_prompt.md`의 "인계 문서" (`prompts/`는 git에서 제외, 로컬과 저장소 밖 백업에만 있음)
- 마지막 갱신: 2026-11-28 (2번 작업 6.2c, 전체 수집 완료, 기준값 조정)

---

## 단계별 상태

| 단계 | 상태 | 작업 프롬프트 | 비고 |
|---|---|---|---|
| 0. 프로젝트 셋업 | 완료 (2026-11-24, `v0.0`) | `prompts/setup_prompt.md` | 결정 D-22~D-54. 릴리스 PR #3 |
| 1. 데이터 수집 | 완료 (원본 로컬) | `prompts/data_pipeline_prompt.md` | 전체 302개 수집 완료(2026-11-27, 요청 37,102건, 1시간 18분, 560MB) |
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
| 6. 통계 추출 | 진행 중 | 6.1 정제 완료(`analysis/clean.py`, D-64~D-67). 시범 10개 중 8개 사용(HAEDAL 기간 부족, USDT 스테이블코인). 6.2a 시장 지수·상태·β·변동성·조각·성격 완료(`analysis/stats.py` 등, D-68~D-72). 6.2b 급등락·전파 완료(`analysis/shocks.py`, D-73~D-75). 정제에 호가 단위 잡음 규칙 추가(D-76). 6.2c 폭락형·캔들 꼬리 완료(`analysis/crash.py`, D-77·D-78). 전체 데이터로 기준값 조정(D-79): 사용 239개 |
| 7. 스키마 v1 확정과 내보내기 | 대기 | |
| 8. 전체 수집 (백그라운드) | 완료 (앞당겨 실행) | 302개 모두 성공, 캔들 7,878,151개. 성격 그룹 최소 3개를 채우려고 6.2a 뒤에 실행 |
| 9. 마무리 | 대기 | |

## 열린 질문과 결정 대기

| 항목 | 언제까지 | 기준 |
|---|---|---|
| 남은 [임시값]은 현실감 검증 리포트(4단계)와 플레이테스트에서 다시 확인: 상태 ±11%, 조각 12~36시간, 급등락 ±8%/±4%, 폭락 −50%, 성격 구간 비율 | 4단계 | [data-spec.md](data-spec.md) 3.1·4.2, D-79 |
| 상태 구분 방법, 수익률 조각 길이, 시장 전체 흐름을 만드는 방법, 성격 분류 기준, 폭락형 수치의 출처 | 2번 작업 6.3 | data-spec 4.2 [분석 후 결정] |
| 가공 기준의 그룹당 최소 코인 수 N, 분위수 격자, 숫자 자릿수 | 2번 작업 6~7 | data-spec 4.1, 4.3 |
| OVERVIEW 8장 #11~14 (지연 전파 처리) | 3단계 전 | [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md) 8장 |
| OVERVIEW 8장 #15 (현재가보다 불리한 지정가) | 5단계 전 | 같음 |
| 단계마다 시작 전에 정할 것 | 각 단계 시작 | stage_dev_prompt.md "단계 카드" |

### 기획 문서 수정 목록 (2번 작업 마무리에서 승인받고 고침)

| 문서 | 고칠 내용 | 근거 |
|---|---|---|
| OVERVIEW 4장 "예상 규모" | 코인 수 302(계속 바뀜), 요청당 200 확인, 코인당 최대 약 8만(2017-09-25부터). 수집 시간·용량 상한 약 4.2시간·1.8GB(초당 7.9건, 행당 약 74바이트). 정확한 값은 전체 수집 뒤 | data-spec 부록 A |
| OVERVIEW 4장 "데이터 주의점" | 상장 폐지 코인 받을 수 없음, 캔들 누락, 시가총액·섹터 없음에서 [추측] 삭제. 스테이블코인 제외 추가. 보관 층(원본·중간은 로컬, 가공한 통계만 배포) | 부록 A, D-56 |
| OVERVIEW 6장 폴더 구조 | `data/interim/` 추가 | D-56 |
| OVERVIEW 9장, REQUIREMENTS NFR-11 | 확인 결과와 약관 판단 반영 | 부록 A |
| conventions 1장 데이터 | `data/interim/` 제외 규칙 | D-56 |
| conventions 2장 설정값 | 시작 가격 범위, 거래량 기준값·비례 계수, 이벤트 종류별 전파 가중치 추가 | D-63, data-spec 4.2 |
| conventions 9장 | "생성 시각" → 원본 기간(`dataFrom`, `dataUntil`). 원본 CSV 컬럼 이름 | D-58, D-62 |
| PLAYTEST | 시작 가격·거래량 임시값 항목 추가 검토 | D-63 |
| CLAUDE.md | 구조의 `data/` 설명, 실제 이름 해시 계약(NFR-12) 한 줄 | D-56, D-61 |

## 후속 작업 (지금 단계 범위 밖이라 하지 않은 일)

| 언제 | 할 일 | 관련 |
|---|---|---|
| 2번 작업 7단계 | fixtures·통계 파일을 넣으면 `tests/fixtures/.gitkeep`, `data/stats/.gitkeep` 삭제 | |
| 2번 작업 7단계, 7단계 | 런타임 검증 라이브러리(zod 등)를 쓸지 판단 (통계 JSON, 기록) | |
| 지금 | 전체 원본(`data/raw/`, 560MB)을 저장소 밖에 백업 (상장 폐지 코인은 다시 받을 수 없음) | data-spec 1장 |
| 3단계 | `loadStats()`와, 그 파일 밖의 동적 `import()`를 금지하는 ESLint 규칙 (2번 작업에서 넘김, 2026-11-26) | conventions 2장 |
| 3단계 | 실제 이름 해시로 가상 코인 이름 거르기 (data-spec 5장 계약) | D-61 |
| 3·5단계 | fast-check, @testing-library/user-event 설치 (쓰는 단계에서) | |
| 5단계 | `vite:preloadError` 처리 (S-03) | conventions 5장, D-06 |
| 8단계 | ErrorPage 문구 다듬기 (지금은 임시 문구) | D-34 |
| 프로젝트를 마친 뒤 업데이트 | 서버에서 시세 생성으로 구조 변경 검토 (통계를 브라우저에 보내지 않음). CLAUDE.md·OVERVIEW 원칙 변경 필요 | D-56 |
| 게임 확장·수집 확대 때 | 시가총액·섹터용 외부 API 검토 | D-57 |
| 언제든 | typescript-eslint가 TypeScript 7을 지원하면 올리기 | D-36 |
| 언제든 | GitHub Action을 SHA로 고정하고 Dependabot 도입 | D-49 |
| 언제든 | npm이 막은 esbuild 설치 스크립트를 허용할지 거부할지 정하기 (지금은 없어도 tsx가 동작함) | D-51 |

## 플레이테스트 대기 항목

없음. 게임 화면이 생기는 5단계부터 [PLAYTEST.md](../PLAYTEST.md) 항목을 `qa` 미리보기에서 시험한다.

## 다음 세션이 먼저 할 일

1. `dev/feat/data-collect` PR이 `qa`에 병합됐는지 확인한다.
2. `prompts/data_pipeline_prompt.md`의 6단계(통계 추출)를 `qa`에서 분기한 `dev/feat/data-stats`에서 시작한다. 시범 수집 원본은 로컬 `data/raw/`에 있다(다른 컴퓨터면 `npm run collect -- --markets …`로 다시 받는다).
