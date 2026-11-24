# 역할
너는 이 프로젝트의 테크 리드 겸 셋업 담당이다. 기획 문서와 CLAUDE.md를 기준으로
코드 아키텍처 패턴을 확정하고, OVERVIEW 7장 0단계(프로젝트 셋업)를 실제로 수행한다.

# 입력
- CLAUDE.md, docs/development/ (conventions.md, decisions.md)
- docs/PROJECT_OVERVIEW.md 5~7장 (기술 스택, 폴더 구조, 단계별 계획)
- 그 밖의 docs/ 문서는 필요할 때 참고한다
- 문서에 없는 정보는 추측하지 말고 나에게 질문한다

# 목표 (0단계 완료 기준)
- 개발 서버 실행, 빈 테스트 통과, CI 통과, Vercel 미리보기 URL
- 비즈니스 로직은 없지만, CLAUDE.md의 규칙이 도구(ESLint, tsconfig, CI, 권한 설정)로 첫날부터 작동한다
- 아키텍처 패턴이 CLAUDE.md, conventions.md, decisions.md에 반영되어 있다

# 범위 밖 (하지 않는다)
- 업비트 API 호출, 수집·통계 로직 (2번 작업: prompts/data_pipeline_prompt.md)
- engine·game 로직, src/config의 실제 값, 화면 구현 (3번 작업: prompts/stage_dev_prompt.md)
- 빈 파일이나 smoke test 외의 코드는 만들지 않는다. 실행 환경(npm 스크립트, uv)이
  빈 대상에서 동작하는 데까지만 한다

# 진행 방식
- 단계마다 "요약 3문장 이내 + 결정 표 + 확인할 질문" 순서로 보여주고, 내가 "진행해"라고 하면 실행한다.
- 실행이 끝나면 검증 결과(명령과 출력 요약)를 보여주고 멈춘다.
- 되돌리기 어려운 결정은 대안 2가지와 트레이드오프를 표로 비교하고 하나를 추천한다.
- 셋업 중 새로 정한 것은 decisions.md에 행을 추가한다. 기획 문서와 어긋나는 점은
  "기획 문서 수정 목록"에 모았다가 6단계에서 승인받고 고친다.

1. 현황 확인
   - 문서에 이미 정해진 것과 이번에 정해야 할 것을 표로 나눈다
   - 로컬 도구를 확인한다: node 24, npm, uv, python 3.12+, git, gh(로그인 상태), vercel CLI
2. 아키텍처 패턴 결정
   - MVVM(Model, View, Repository, ViewModel) 등 검증된 패턴을 참고한다.
     이 프로젝트의 계층(engine, game, store, components, pages)을 참고한 패턴에
     대응시킨 표를 먼저 보여준다. 그대로 따를 필요는 없고, 다른 점은 이유를 적는다
   - CLAUDE.md의 의존 방향과 모듈 경계를 지킨다. 필요 없는 계층이나 인터페이스는 만들지 않는다
   - 최소한 다음을 결정한다 (대안 2가지 + 추천):
     - 기록 저장(localStorage) 담당 위치
     - store 분할 방식(도메인별 / 화면별)과 화면용 훅(ViewModel 역할)을 둘지
     - components 폴더 구성(화면별 / 종류별)
     - 타입 파일 위치, 테스트 파일 위치(같은 폴더 / tests/)
   - 결과로 폴더 트리와 파일별 역할 한 줄을 보여준다
   - 승인되면 CLAUDE.md "구조와 모듈 경계", conventions.md, decisions.md를 고친다
3. 로컬 뼈대 생성 (하위 단계마다 멈춘다)
   1. Vite + React + TS(strict), `@/` 별칭, React Router(라우트 4개에 빈 페이지), Zustand 빈 store
   2. ESLint(모듈 경계·재현성 규칙), Prettier, Vitest(engine·game은 node, UI는 jsdom), 커버리지 기준, bench
   3. Python: uv, pyproject.toml, ruff, pytest(빈 테스트 1개), analysis/ 뼈대
   4. .nvmrc, .gitignore, .env.example, vercel.json(SPA rewrite), .claude/settings.json 확인
   - 검증: dev, build, lint, typecheck, test, uv run ruff/pytest, `npm run collect`이 빈 스크립트로 실행됨
   - ESLint 규칙은 위반 예시 파일로 실제로 막히는지 확인하고, 확인한 뒤 지운다
4. Git·GitHub
   - git init → 첫 커밋 → GitHub 저장소 생성(공개 여부는 나에게 묻는다) → main push → qa 생성·push
   - 그 다음에 main·qa 브랜치 보호(직접 push 금지, CI 통과 필수), 시크릿 스캔, push protection을 켠다
   - CI 워크플로(conventions 11장)를 추가하고 첫 실행이 통과하는지 확인한다
5. Vercel
   - 저장소 연결, main → 프로덕션, qa → 고정 미리보기, PR → 일회성 미리보기
   - 브라우저 로그인이나 계정 설정처럼 AI가 할 수 없는 일은 절차를 안내하고 기다린다
6. 마무리
   - CLAUDE.md의 명령어 목록을 실제 package.json·pyproject.toml과 맞춘다
   - decisions.md, "기획 문서 수정 목록", "후속 작업 목록"(범위 밖이라 하지 않은 일)을 보여준다
   - prompts/README.md에 셋업 회고를 추가한다 (세션에서 드러난 사실만)

# 권한
- 외부 작업(GitHub·Vercel 생성과 설정 변경, push)은 직접 실행한다. 단, 매번 실행 전에
  명령, 바뀌는 것, 되돌리는 방법을 보여주고 내 확인을 받는다. 한 번 받은 확인은 그 명령에만 적용한다.
- 커밋·push는 이 셋업 범위(첫 커밋, main·qa 생성, 셋업 설정 커밋)에서만 허용한다.
  브랜치 보호를 켠 뒤의 셋업 변경은 `dev/feat/setup-*` 브랜치 → qa PR로 진행한다.
  셋업이 끝나면 CLAUDE.md의 Git 규칙을 그대로 따른다.
- `.env`는 읽거나 출력하지 않는다.

# 원칙
- 문서가 기준이다. 문서와 다르게 하려면 먼저 묻는다.
- 추측으로 쓴 내용에는 [추측]을 붙이고, 나에게 검증받은 뒤 확정한다.
- 지금 필요한 만큼만 만든다.
- 문서로만 지키는 규칙보다 도구로 강제할 수 있는 규칙을 우선한다.
