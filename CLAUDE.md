# 쌤비서 작업 안내 (새 세션이 먼저 읽을 것)

교사용 학교 업무 AI 비서. `web/`은 빌드 없는 ES 모듈 정적 웹앱이고, `src-tauri/`가 Windows 앱으로 감싼다. 웹판은 GitHub Pages(`web/` 폴더만 배포).

## 지금 상태 (2026-11-17)

- 최신 릴리즈는 **v0.34.3**. main과 작업 브랜치 `claude/wonderful-johnson-lqb8em`이 같은 커밋에 있다.
  - 0.34.1: 남은 한계 고침 — 기준표 칸 글은 AI로 갈 때 이름을 ○○○로(`rubric-model.js aiCell`), 「김정대로 바꿔 줘」(privacy `DAERO`·`roGivenName`),
    물건 머리 줄의 이름은 다른 줄에서 사람으로 쓰일 때 배움(privacy `personUse`), 품의 「총 30자루 15,000원」(`tests/unit/fix1117-limits.test.mjs`).
  - 수준별 기준표(루브릭): 설계 `docs/superpowers/specs/2026-11-16-rubric-design.md`, 계획 `docs/superpowers/plans/2026-11-16-rubric.md`.
    `web/menus/evaluate/rubric-model.js`(규칙)·`rubric.js`(시트, `window.SSAM.rubric`). 과목·평가요소가 둘 다 같을 때만 채점·평어에 씀, 「직접 입력」은 안 씀.
    채점 기록에 사본(`GR.rubric`), 평가요소를 바꾸면 사본은 쉼(unitKey가 같을 때만). 요소가 다 있어야 기준 점수 ±4로 자름.
  - 품의(2026-11-17 선생님 요청): [바꾸기]는 예전 칸·초안을 지움, 계획서 제목은 「관련」·목적은 「목적」 항목으로(`planHead`),
    사유 차례 「(목적·일시·대상·장소 있을 때만) / 구입 품목 / 지출액 / (예산 과목) / 기타:」(예전 차례는 `reasonTailV1`로만 견줌),
    합계·총계·계 줄은 품목 아님(`core/sheet.js isTotalName`), 한글 조합 중에는 저장·다시 그리기를 미룸.
  - 0.34.2 품의 짧게(2026-11-17 두 번째 요청): 구입 품목 3개 이상은 「비커(500ml) 외 2개」(`itemsSummary`), 붙임은 「기타:」 바로 아래(빈 줄 없음),
    첫 문장은 한두 줄의 한 문장(`shortIntro` — 첫 문장만, 「다음과 같이」 뺌), 관련 기본값은 「학교 이름-xxxxx(올해. xx. xx.)」(`docNoBase`, 설정 › 학교 정보),
    계획서·AI가 채운 관련은 문서 번호가 없으면(다른 기관 공문 제목은 빼고) 앞에 그 꼴을 붙이고 「제목」(`relatedFill`), 선생님이 친 관련은 그대로. 예전 꼴은 `reasonTailV2`·`relatedLineV1`로만 견줌
    (`tests/unit/fix1117-purchase-short.test.mjs`).
  - 0.34.3 품의 계획서 산출 근거(2026-11-17 세 번째 요청): 3개 이상은 「외 n종」, 예산 표 「항목 | 산출 근거 | 금액」의 산출 근거
    「품명 단가원*수량단위(*수량)=금액원」을 품목마다 나눠 품명 칸에(`intake.js basisItems·splitBasis`, `sheet.js` HEAD.basis), 금액 없는 줄은 「못 읽은 줄」로 안 셈
    (`tests/unit/fix1117-plan-basis.test.mjs`).
  - 「쌤」 채팅 규정 질문 → 마주온 톡톡 안내(2026-11-18, 아직 릴리즈 안 함): `chat-route.js policyAsk·TOKTOK_NOTE`, `chat.js assist` 첫 줄,
    AI 공통 안내에 금액·날짜·조항을 지어내지 않는 규칙(스펙 `docs/superpowers/specs/2026-11-18-toktok-design.md`, `tests/unit/fix1118-toktok.test.mjs`).
  - 수업 아이디어(2026-11-18, 아직 릴리즈 안 함): 평가 › 활동지 [수업 아이디어] — `activity/idea-make.js`(규칙)·`idea.js`(화면, 저장 `activity:ideas` 5묶음),
    [이 아이디어로 활동지 만들기]는 `activity-maker.js startFromIdea`(범위 끝에 「수업 활동: …」 줄), 고르기 칸 `make-pick.js newPick({ kinds: [], countLabel })`
    (스펙 `docs/superpowers/specs/2026-11-18-lesson-idea-design.md`, `tests/unit/fix1118-idea.test.mjs`, e2e `fix1118-idea.mjs`).
  - 예산 집행 현황(2026-11-18, 아직 릴리즈 안 함): 품의 › 예산 탭(`purchase/budget.js`), 규칙·저장 `purchase/budget-model.js`(`budget:projects`·`budget:ledger`,
    학년도와 상관없는 요약 `budget:alerts` — years.js GLOBAL), 새 품의의 사업 칸·[에듀파인에 올렸어요]·등록 카드는 `purchase.js`(save()가 syncProject·syncLedger),
    알림은 `brief-data.js gather → briefing({ budgets })`, 인수인계서는 장부(`handover-model.js budgetRows` 5칸)
    (스펙 `docs/superpowers/specs/2026-11-18-budget-design.md`, `tests/unit/fix1118-budget.test.mjs`, e2e `fix1118-budget.mjs`).
  - 0.33.2 몫(릴리즈하지 않고 0.34.0에 합침): 미뤄 둔 작은 문제 2개, 0.31.1 뒤 버그 찾기 23개 중 22개(`tests/unit/fix1116-*.test.mjs`).
- 이름 가리기 원칙(2026-11-16 선생님과 정함): 이름이 새는 것이 낱말을 지나치게 가리는 것보다 나쁨. 고칠 때마다 원래 코드와 견줘 새로 새는 이름이 없는지 확인.
  남은 한계: 흔한 이름 목록에 없는 이름이 「준비물:」 같은 물건 머리 줄에만 나오고 다른 줄에서 사람으로 쓰이지 않으면 배우지 않음(그 줄은 보내지 않음).
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

- 단위 시험: `node --test tests/unit/*.test.mjs` (지금 1542개 통과)
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
