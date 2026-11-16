# 쌤비서 작업 안내 (새 세션이 먼저 읽을 것)

교사용 학교 업무 AI 비서. `web/`은 빌드 없는 ES 모듈 정적 웹앱이고, `src-tauri/`가 Windows 앱으로 감싼다. 웹판은 GitHub Pages(`web/` 폴더만 배포).

## 지금 상태 (2026-11-16)

- 최신 릴리즈는 **v0.33.1**(main). 작업 브랜치 `claude/wonderful-johnson-lqb8em`이 그보다 앞서 있다(아직 릴리즈 안 함):
  - 미뤄 둔 작은 문제 2개(회의록 「끝냄」 풀림, 「인터뷰」 이름 오인) 고침.
  - 0.31.1 뒤 바뀐 코드 버그 찾기(멀티에이전트) → 확인된 23개 중 22개 고침(`tests/unit/fix1116-*.test.mjs`). 단위 1466개·e2e 168개 파일 통과.
  - 수준별 기준표(루브릭) 설계 `docs/superpowers/specs/2026-11-16-rubric-design.md` — 선생님 확인을 기다리는 중(확인 전에는 만들지 않음).
- 이름 가리기 원칙(2026-11-16 선생님과 정함): 이름이 새는 것이 낱말을 지나치게 가리는 것보다 나쁨. 고칠 때마다 원래 코드와 견줘 새로 새는 이름이 없는지 확인.
  남은 한계: 「김정대로 바꿔 줘」(「예정대로」와 같은 꼴)·「준비물:」 같은 물건 머리 아래 이름은 못 가림.
- 알고 있지만 요청이 없어 남겨 둔 작은 문제:
  - 학급 › 오늘 수업의 공문 띠 차례(`web/menus/class/today.js`, 아래 규칙 때문에 손대지 않음)

## 꼭 지킬 것

- 선생님께는 늘 **한국어**로 답한다.
- AI 키·비밀값은 코드·저장소·로그·백업에 넣지 않는다. 키 값을 붙여 넣지 않는다.
- PR은 선생님이 말할 때만 만든다. 커밋·PR·코드에 AI 모델 이름을 넣지 않는다.
- 작업은 작업 브랜치에서 한다. main은 **릴리즈할 때만** fast-forward 하고, 릴리즈도 선생님이 말할 때만 한다(main에 올리면 웹판이 바로 배포된다).
- 실제 학생·학교 파일은 저장소에 넣지 않는다. 학생 이름은 AI로 보내지 않는다. 시험·예시에는 지어낸 이름만 쓴다(김하늘, 이바다, 한가람, 박솔빛, 새싹초등학교).
- 선생님이 올린 실제 계획서(.hwp)에 실제 교사 이름이 있다. 그 이름을 옮겨 적거나 커밋하지 않는다.
- **연수** 안쪽 코드는 고치지 않는다. **연수·학급**은 다른 선생님이 맡아 보류 중이다. `web/menus/class/**` 화면은 고치지 않는다(class-model을 읽는 것은 괜찮다).
- 앱에서 저장·결재·상신 단추는 누르지 않는다.
- GitHub에 댓글을 쓸 때는 선생님 허락을 먼저 받고, 끝에 Claude Code 표시를 붙인다.
- 발표 자료(덱)는 선생님이 말할 때까지 손대지 않는다.

## 시험

- 단위 시험: `node --test tests/unit/*.test.mjs` (지금 1466개 통과)
- e2e 한 파일: `node tests/e2e/<이름>.mjs`
- e2e 전체: `node tests/e2e/run-all.mjs` (약 170개 파일, 45~50분). 파일마다 다른 포트를 써서 나눠 돌려도 된다. 전체가 도는 동안에는 작업 폴더를 고치지 말고 `.claude/worktrees/` 아래 worktree에서 일한다(그 안에서는 저장소의 node_modules를 그대로 찾는다).

## 릴리즈 하는 법

1. 버전 올리기: `package.json`(3줄), `package-lock.json`(3·9줄), `src-tauri/Cargo.toml`(3줄), `src-tauri/Cargo.lock`(`name = "ssam"` 다음 줄), `tests/unit/release-config.test.mjs`(3곳, 정규식 안의 `0\.33\.1` 꼴 포함).
2. `.github/RELEASE_NOTES.md`: `<!-- whats-new -->` 표시 사이에 새 내용을 넣고, 앞 버전 내용은 그 아래 `#### X에서 바뀐 점`으로 옮긴다.
3. 작업 브랜치에 커밋·푸시하고 main을 fast-forward 한다.
4. GitHub MCP `actions_run_trigger`로 `release.yml`을 돌린다(owner doguri25, repo ssam-assistant, ref main, inputs `{release: true}`).
5. `get_release_by_tag`로 파일 네 개를 확인한다: `ssam-<버전>-setup.exe`, `ssam-<버전>-portable.exe`, `latest.json`, `SHA256SUMS.txt`.

## 코드 길잡이

- 저장소: `ssam:` 키는 학년도마다 따로 저장된다. 예외는 `web/core/years.js`의 GLOBAL 목록뿐이다.
- 이름 가리기: `web/core/redact.js`(`makeRedactor()`), `web/core/privacy.js`(`stripNames`, `RRN_RE` 등).
- 「쌤」 채팅: `web/core/chat-route.js`(할 일 고르기, `safeText`), `web/core/chat-knowledge.js`(안내). 새 기능을 넣으면 안내 항목과 `README.md` 기능 줄도 함께 더한다.
- 평가 › 한눈에: `web/menus/evaluate/eval-stage.js`, `eval-board.js`, `eval-close.js`(결과 확인 칸 [마치기], 저장 키 `eval:closed`).
