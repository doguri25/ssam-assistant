# 쌤비서 작업 안내 (새 세션이 먼저 읽을 것)

교사용 학교 업무 AI 비서. `web/`은 빌드 없는 ES 모듈 정적 웹앱이고, `src-tauri/`가 Windows 앱으로 감싼다. 웹판은 GitHub Pages(`web/` 폴더만 배포).

## 지금 상태 (2026-11-19)

- 최신 릴리즈는 **v0.37.1**(두 번째 버그 찾기 25건). 그 앞 v0.37.0(학년말 마감 도우미, 교내 자율연수, 쪽지 회신 기한·현황판 공유, 버그 25건), v0.36.0(연수 메뉴·이수증 수합, 학급 탭 손보기, 메뉴 사이 연결). main은 그 릴리즈 커밋, 작업 브랜치 `claude/wonderful-johnson-lqb8em`은 그 뒤 선생님 요청(아래 2026-11-19 「1,2 … 6 한달 달력」)과 세 번째 버그 찾기 34건이 더 있다(릴리즈 안 함).
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
  - 0.35.0 「쌤」 채팅 규정 질문 → 마주온 톡톡 안내(2026-11-18): `chat-route.js policyAsk·TOKTOK_NOTE`, `chat.js assist` 첫 줄,
    AI 공통 안내에 금액·날짜·조항을 지어내지 않는 규칙(스펙 `docs/superpowers/specs/2026-11-18-toktok-design.md`, `tests/unit/fix1118-toktok.test.mjs`).
  - 0.35.0 수업 아이디어(2026-11-18): 평가 › 활동지 [수업 아이디어] — `activity/idea-make.js`(규칙)·`idea.js`(화면, 저장 `activity:ideas` 5묶음),
    [이 아이디어로 활동지 만들기]는 `activity-maker.js startFromIdea`(범위 끝에 「수업 활동: …」 줄), 고르기 칸 `make-pick.js newPick({ kinds: [], countLabel })`
    (스펙 `docs/superpowers/specs/2026-11-18-lesson-idea-design.md`, `tests/unit/fix1118-idea.test.mjs`, e2e `fix1118-idea.mjs`).
  - 0.35.0 예산 집행 현황(2026-11-18): 품의 › 예산 탭(`purchase/budget.js`), 규칙·저장 `purchase/budget-model.js`(`budget:projects`·`budget:ledger`,
    학년도와 상관없는 요약 `budget:alerts` — years.js GLOBAL), 새 품의의 사업 칸·[에듀파인에 올렸어요]·등록 카드는 `purchase.js`(save()가 syncProject·syncLedger),
    알림은 `brief-data.js gather → briefing({ budgets })`, 인수인계서는 장부(`handover-model.js budgetRows` 5칸)
    (스펙 `docs/superpowers/specs/2026-11-18-budget-design.md`, `tests/unit/fix1118-budget.test.mjs`, e2e `fix1118-budget.mjs`).
  - 0.33.2 몫(릴리즈하지 않고 0.34.0에 합침): 미뤄 둔 작은 문제 2개, 0.31.1 뒤 버그 찾기 23개 중 22개(`tests/unit/fix1116-*.test.mjs`).
- 이름 가리기 원칙(2026-11-16 선생님과 정함): 이름이 새는 것이 낱말을 지나치게 가리는 것보다 나쁨. 고칠 때마다 원래 코드와 견줘 새로 새는 이름이 없는지 확인.
  남은 한계: 흔한 이름 목록에 없는 이름이 「준비물:」 같은 물건 머리 줄에만 나오고 다른 줄에서 사람으로 쓰이지 않으면 배우지 않음(그 줄은 보내지 않음).
- 학급 손보기(2026-11-18, 0.36.0): 스펙 `docs/superpowers/specs/2026-11-18-class-fix-design.md` A·B·C 34건 모두.
  - 오늘 수업·진도표(A): 시간표 판(`versions`), `hours0`(체크 전 실시)·`offset`(진도 자리)·`posAt`(진도 자리 정한 날), 재량휴업일 등은 `dayOff`, 시수만 교과·전담(`class:extra`), 교체·메모, 공문 띠는 `home-model dueBand`
    (`tests/unit/fix1118-class-today.test.mjs`, e2e `fix1118-class-today.mjs`).
  - 주간학습안내(B): AI 지시·채우기 `weekly-ai.js`(이름 가림·수업 없는 날 건너뜀·학부모께 공문/연간계획 일정 뺌), 고친 칸 표시·[다시 채우기] 물음, `announce`(알려 드립니다),
    체크하지 않은 지난 칸도 진도표대로(`lessonAt` ctx.assume — 주간학습안내만), 이름 가리기에 맡은 일 말 앞 이름(`privacy roleNames`)·「인솔:」 뒤
    (`tests/unit/fix1118-class-weekly.test.mjs`, e2e `fix1118-class-weekly.mjs`).
  - 기초학력(C): `tests/unit/fix1118-camp.test.mjs`, e2e `fix1118-camp.mjs`.
- 연수 메뉴(2026-11-18, 0.36.0): 스펙 `docs/superpowers/specs/2026-11-18-training-design.md`. 규칙·저장 `web/menus/training/training-model.js`(`training:mine`·`training:board`, AI 안 부름),
  화면 `training.js`(공문 처리 [내 필수연수에 넣기]는 `addFromGongmun`), 학사일정 출처 `training`(브리핑 학사일정 줄·인수인계서·학부모 안내에서는 뺌 — 주간학습안내 `forParents`는 `event:`·직접 넣은 일정만),
  오늘 할 일 `briefLines → briefing({ trainings })`, 채팅 intent `training`·`dataQuestion` kind `training`, 인수인계서 `handover-model` trainings, 새 학년도 `years.js carryTraining`
  (`tests/unit/fix1118-training.test.mjs`, e2e `fix1118-training.mjs`).
  - 연수 수합(2026-11-19 「연수 수합도 해야 하는데 가능할까?」 — 결과물 넷 다·받기는 메신저·구글 폼·종이): 스펙 §4. 구분 `guessKind`(교원·직원·공무직)·연수 대상 `target`(`inTarget`),
    칸에 이수일·시간·링크·`kept`, 이수증 파일은 IndexedDB `forms('training')`(열쇠 `fileKey` 학년도|연수|사람 — 백업 안 됨, 미제출로 돌리거나 사람·연수를 지우면 지움),
    ZIP 풀어 넣기 `training.js expand`, 구글 폼 `formResponses`, 수합 마무리 `reportDoc`(결과 보고)·`statsTsv`(실적 표)·`bundleEntries`(묶음 ZIP)·`boardCsv`
    (단위 `fix1118-training.test.mjs` 끝 3개, e2e `fix1119-training-collect.mjs`).
  - 수합 더하기(2026-11-19 「더 구현할 방법이 있다면 추가해 줘」): 쪽지 작성 연수 안내 → `training.js addCourseFrom`(공문 처리 [연수 현황판에 넣기]도), `personalText`(사람별 미제출),
    `formGuide`(구글 폼 만들기 안내), 「쌤」 버튼 .zip → kind `cert`(ask) → 현황판 `expand` (e2e `fix1119-training-more.mjs`).
- 학년말 마감·교내 자율연수·작게 손볼 것(2026-11-19 「1,6 그리고 작게 손볼것을 추가하고 멀티에이전트로 버그를 찾아 수정하고 빌드 배포해줘」, 0.37.0): 스펙 `docs/superpowers/specs/2026-11-19-yearend-design.md`.
  학년말 마감 `web/menus/home/yearend-model.js`(줄 규칙)·`yearend.js`(모으기 `gatherYearend`, 시트 `openYearend`, `[data-ye-open]`, 저장 `yearend:done`), 기재 점검 요약 `check.js checkSummary`,
  오늘 화면 카드(12~2월)·설정 › 학년도·채팅 intent `yearend`. 교내 연수 `course.inhouse`·`inhouseNotice`·`signSheetDoc`·`allPresent`·`inhouseReportDoc`, 현황판 공유 `exportBoard`·`parseBoardFile`·`mergeBoards`,
  쪽지 회신 기한 `message-model deadlineLines → briefing({ messages })` (`tests/unit/fix1119-yearend.test.mjs`, e2e `fix1119-yearend.mjs`).
- 0.36.0 뒤 멀티에이전트 버그 찾기(2026-11-19, 0.37.0): 5 영역 찾기 + 영역마다 검증, 확인된 26건(겹친 1건) 모두 고침(`tests/unit/fix1119-bugs.test.mjs`).
  이름 가리기 `roleNames`(맡은 일 머리 뒤·쉼표로 이은 이름, -문·-별 낱말은 아님)·`ITEM`(괄호 안 목록)·「인솔」은 쌍점 뒤·띄어 쓴 이름만, 주간학습안내 자리 표시 옮긴 답은 버림,
  진도 `assumeFrom`은 posAt 없으면 세지 않음·`leftPeriods`는 posAt·start 앞 빼기·메모만 칸은 교체 아님·판마다 교시 수 `periodsOn`·`termStart` 진도 자리 끝·`prevHours0`,
  기초학력 AI 일정 closedDays·날짜 넣기 periods·합치기 1000자, 연수 `maskForAI`·`certDate(text, today)`·`certHours` 분·띄어 쓴 명단·직위/구분 칸·칸 지울 때 물음·CP949 ZIP 이름(`core/zip.js`),
  떠 있는 버튼 이수증은 본문 말이 있을 때만·늘 물음, 채팅 화면 가기 intent는 쓰기 명령·붙여 넣은 글에 물러남, 학년말 예산 예정·현황판 명단 없음·카드 다시 셈.
- 0.37.0 뒤 두 번째 멀티에이전트 버그 찾기(2026-11-19 「멀티에이전트로 다시 버그를 찾아 수정해줘」, 0.37.1): 확인된 25건 모두 고침(`tests/unit/fix1119-bugs2.test.mjs`).
  이름 가리기 `roleWord`·`colonWord`(맡은 일 쌍점 뒤 -리·-형·-별 이름)·`ROLE_COLON` 진행자·후보·`roleNames(text, known)`·redact `tie`(아는 이름에 쉼표로 이은 이름)·`INSOL_GROUP`/`insolName`(「인솔: 전학년 담임」은 아님),
  진도 `posDone`(진도 자리를 정할 때 그날 앞 완료 수 — 뒤에 그 앞 날을 체크하면 시수만)·`h0At`(체크 전 실시가 담은 날, `leftPeriods`가 그날까지 뺌)·`doneCount`·새 학년도·다시 넣은 교과 posAt = 시작 전날·
  `assumedList`(주간학습안내 「이어 셌어요」는 이어 센 날만)·`termStart` 오늘 기록이 앞 학기를 마치면 내일, 학년말 진도 줄은 `p.left`(실시),
  기초학력 `closedDays`는 방학·한 주 넘는 휴업 기간 빼고·날짜 넣기 같은 시각이면 교시 수 그대로·날마다 한 덩어리는 periods null·`longMergeDates`(1000자 넘는 날은 합치지 않음)·오늘 화면 카드 `shownName`·빈 칸으로 셈,
  연수 `STAFF_H`·`parseStaffLines`(서로 부르지 않음)·`nameTok`(looksLikeName·`ROLE_TOK`)·`certDate` 끝나지 않은 기간은 마지막에 첫날·폼 다시 넣기는 같은 주소면 그대로·`mergeBoards` 반려는 `at`·`lecturerNames`,
  채팅 `WRITE_IDS`(쓰기 명령이면 dataQuestion 안 함)·붙여 넣은 글은 오늘 수업·진도표 예전 규칙만·다른 메뉴 일이 분명하면 화면 가기 물러남, 이수증 본문 말 넓힘·사진 이수증도 물음, 쪽지 마감 줄 한 번.
- 선생님 요청(2026-11-19 「1,2 이수증 파일은 스캔해서 코드만 받게 해줘 … 6 한달 달력 넣어주고 멀티에이전트를 돌려서 버그를 찾아내어 수정해줘」, 릴리즈 안 함):
  1) 교직원 이름 가리기: 연수 현황판 명단 이름은 어느 길에서든(`privacy knownStaff`·`maskKnown` — stripNames·maskStaff·`chat-names maskPersons`가 부름, 저장값 비교는 `store.getRaw`),
     「미제출:」「아직 안 낸 분:」「참석자:」 뒤 목록(`LIST_HEAD`·`maskPeopleList`), 쪽지·가정통신문·공문 처리·결과 보고의 `cleanSheet`도 maskStaff.
  2) 오늘 화면 기초학력 출석: 결석이 섞인 학생을 누르면 먼저 물음(`home-model absentOn`).
  이수증은 이수번호만: `training-model certCode`(「제 … 호」「이수번호:」, 글 속 「기관-구분-20xx-번호」)·`codeNorm`, 칸 `code`·내 필수연수 `certNo`, 파일은 보관하지 않음(예전 `kept` 파일만 [예전 이수증 묶음]),
     연수 이름 시트·못 맞춘 줄에서 이수번호 넣기, 구글 폼 「이수번호」 칸·만들기 안내, 결과 보고 명단·엑셀 명단표에 이수번호, 붙임 2는 kept가 있을 때만 (`tests/unit/fix1119-asks.test.mjs`).
  6) 한 달 달력: 스펙 `docs/superpowers/specs/2026-11-19-month-calendar-design.md`. `web/menus/home/month-model.js`(칸·그날 할 것)·`month.js`(`gatherMonth`, 시트 `openMonth`, `[data-month-open]`),
     오늘 화면 머리·공문 기한 카드 단추, 채팅 intent `month`(「12월 일정」은 그 학년도 달) (`tests/unit/fix1119-month.test.mjs`, e2e `fix1119-month.mjs`).
  세 번째 멀티에이전트 버그 찾기(같은 요청의 「멀티에이전트를 돌려서 버그를 찾아내어 수정해줘」, 릴리즈 안 함): 5 영역(새 기능·평가·계획/품의·기타·core) 찾기+검증, 확인된 34건 모두 고침(`tests/unit/fix1119-bugs3.test.mjs`).
     이름 가리기 `knownRe`(세 글자 넘는 명단 이름은 뒤 글자를 보지 않음)·`LIST_WHO`/`LIST_HEAD`(「미제출(2명):」「미제출 선생님:」「- 」)·`LIST_BARE`(「미제출자 남다율, 탁보결」)·`maskListBody` 항목마다,
     `cleanSheet(text, { staff })` — 쪽지·공문·가정통신문·결과 보고(기본)는 maskStaff 다음 makeRedactor(조사·맡은 일·괄호·배운 이름), 활동지(`staff: false`)는 직함 뒤 이름을 쌍점 뒤만(`maskStaff colonOnly`),
     파일 이름 `gongmun-ai maskName`, 인수인계서 `cleanText`(roleNames·maskJosaNames·maskPersons)·`nameTokens`(부서 끝말은 아님), 다면평가 줄글 `multi-ai maskDraft`, 품의 `intake maskForAI`(redactText — maskNames 규칙은 줄을 넘지 않음),
     행사계획 `event.js evAI`, 행특 메모 `memoNames.hide`·창체 `SSAM.maskAI`(gr-bundle), 채팅 `chat-names listCuts`(쉼표·가운뎃점·「랑·과」로 늘어놓은 이름).
     이수번호 `codeNorm`(「제주-…」는 그대로)·`certCode` 이름표 줄 먼저·「제…호」는 괄호·지정번호·과정 아님·폼 이수번호 칸 고르기(전화·개인번호 칸 아님)·`mergeBoards fill`. 채점 `score0` 저장·복원,
     단원평가 결과·평어는 같은 교과에 진짜 평가가 있으면 예시 뺌, 품의 수량 칸 단위(`sheet QTY_CELL`·`intake packCell`)·「전체 N명」·「45,000원 × 2」·포장 단위 BOX/SET/pcs/포대·견적서 아래 줄, 연간계획 합계 줄,
     채팅 `MEMO_END` 메모 먼저·`VIEW_W` 보기 말은 그 탭만·달력 해(`year`·`rel`)·후보 버튼/AI 할 일의 달·`dayOf` 다음 주/지난주·날짜·내일모레, 체험 중 `refreshAlerts` 안 함,
     연수 폼 응답 CSV는 `cert`(현황판 formFile), 백업 불러오기는 지금 학년도와 다르면 물음·백업보다 새 보관 자료는 미리 체크 안 함(`parseBackup createdAt`).
- 메뉴 사이 흐름 점검(2026-11-18 「각 정보와 메뉴가 유기적으로 돌아가는지 확인해줘」, 0.36.0): 채팅 intent `budget`·`idea`·교체/보강/메모 → 오늘 수업·전담 → 진도표,
  「예산 얼마 남았어?」(`budget-model chatAnswer`), 떠 있는 버튼 kind `cert`(이수증 → `training.js putCerts`), 기초학력 수업 날은 `calendar closedDays`(재량휴업일 등 — 방학은 아님) 건너뜀,
  인수인계서에 기초학력(`camp-model handoverRows`)·연수 (`tests/unit/fix1118-flow.test.mjs`, e2e `fix1118-flow.mjs`).

## 꼭 지킬 것

- 선생님께는 늘 **한국어**로 답한다.
- AI 키·비밀값은 코드·저장소·로그·백업에 넣지 않는다. 키 값을 붙여 넣지 않는다.
- PR은 선생님이 말할 때만 만든다. 커밋·PR·코드에 AI 모델 이름을 넣지 않는다.
- 작업은 작업 브랜치에서 한다. main은 **릴리즈할 때만** fast-forward 하고, 릴리즈도 선생님이 말할 때만 한다(main에 올리면 웹판이 바로 배포된다).
- 실제 학생·학교 파일은 저장소에 넣지 않는다. 학생 이름은 AI로 보내지 않는다. 시험·예시에는 지어낸 이름만 쓴다(김하늘, 이바다, 한가람, 박솔빛, 새싹초등학교).
- 선생님이 올린 실제 계획서(.hwp)에 실제 교사 이름이 있다. 그 이름을 옮겨 적거나 커밋하지 않는다.
- **연수**·**학급**은 2026-11-18 선생님이 맡겼다(학급: 「네가 맡아서 알아서 고쳐줘. 지금 탭을 제대로 구현해줘」, 연수: 「연수쪽도 진행해주고 학급도 진행해줘」) — `web/menus/class/**`·`web/menus/training/**`도 고친다.
- 앱에서 저장·결재·상신 단추는 누르지 않는다.
- GitHub에 댓글을 쓸 때는 선생님 허락을 먼저 받고, 끝에 Claude Code 표시를 붙인다.
- 발표 자료(덱)는 선생님이 말할 때까지 손대지 않는다.

## 시험

- 단위 시험: `node --test tests/unit/*.test.mjs` (지금 1630개 통과)
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
