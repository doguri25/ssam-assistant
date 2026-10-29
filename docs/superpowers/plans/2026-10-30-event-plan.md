# 쌤비서 계획 4 · 행사계획 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 › 행사계획(PRD 5.4 V-1~V-6)을 동작하게 만든다: 행사 정보 → 구성안 2~3개 → 문서 세트(계획서·역할 분담·안전 점검·가정통신문) → 확정·설문(문항·QR·CSV 결과 보고서).

**Architecture:** 계산(행사 모델·역할 부담·문서 점검·설문 CSV 집계·QR 부호)은 DOM 없는 모듈로 쓰고 Node로 시험한다. 화면 `menus/plan/event.js`는 계획 3의 `steps.js`·`calendar.js`·`files.js`·`plan.css` 틀을 그대로 쓴다. QR은 라이브러리 없이 직접 만든다(PRD 9: 인터넷 없이 동작).

**Tech Stack:** 계획 1~3과 같음. 새 라이브러리 없음.

**Spec:** `docs/PRD.md` (5.4, 6.2, 7, 8, 11). 계획 3 ledger의 `Ruling:` 줄.

## Global Constraints
- 계획 1·3의 Global Constraints를 따른다. 저장 키: `ssam:events`(행사 목록), `ssam:event:current`. 학사일정 출처는 `event:<id>`.
- 행사 종류 id·이름: `sports` 운동회 · `arts` 학예회 · `field` 현장체험학습 · `other` 기타.
- 필수 칸(V-1): 행사명·날짜·대상·장소. 장소는 실내/야외(`outdoor: boolean`)를 함께 고른다.
- 문서 4개 id·이름: `plan` 계획서 · `roles` 역할 분담표 · `safety` 안전 점검표 · `letter` 가정통신문. 야외 행사는 `safety`와 우천 시 대체 일정(`rain`)이 있어야 확정할 수 있다.
- 가정통신문 필수 항목: 날짜·준비물·복장·문의처 — 빠지면 [완성]이 안 되고 빠진 항목을 보인다.
- 역할 분담: 한 사람의 역할 수가 평균보다 2개 이상 많으면 표시한다.
- 설문 문항: 5점 척도 4~6개 + 서술형 1~2개. 응답이 10명 미만이면 보고서에 「응답이 적어요(○명). 결과를 일반화하기 어려워요」.
- 개인정보: 참여 교직원은 이름·맡은 업무만 받는다. 시연 자료는 지어낸 예시만.
- 밀리면 줄이는 것(PRD 12): ② 설문 결과 그래프(보고서는 유지).
- 가정통신문 한글 파일에는 QR 그림 대신 「설문 참여: 폼 주소」 글을 넣고, QR 그림은 PNG로 따로 내려받는다(한글 파일 그림 넣기는 한글 프로그램에서 확인할 수 없어 대회 뒤로). 화면의 가정통신문 미리보기에는 QR 그림을 보인다.

## Review Focus
1. **구글 폼 CSV의 여러 모양**(첫 열 타임스탬프, 척도가 「1」~「5」 또는 「매우 그렇다」~「전혀 그렇지 않다」, 빈 응답, 따옴표 안 줄바꿈, EUC-KR): 문항별 평균·분포가 맞고 서술형은 따로 모인다. → Task 2 시험.
2. **QR이 실제로 읽히는지**: 표준 오류 정정 부호·형식 정보·자리 표시가 맞고, 우리 해석기로 다시 읽으면 같은 주소가 나온다(사람 확인: 휴대폰으로 찍기). → Task 3 시험.
3. **AI가 구성안·문서 모양을 어김**(안이 1개뿐, 시간표가 배열이 아님, 역할에 없는 사람): 읽을 수 있는 것만 받고, 안이 하나도 없으면 「AI 답을 읽지 못했어요」. → Task 1 시험.
4. **참여 교직원이 없거나 한 명**: 역할 분담 경고가 나지 않고(평균 비교 불가), 화면이 깨지지 않는다. → Task 1 시험.
5. **같은 날 다른 행사·연간계획 일정**: 행사 날짜를 고르면 겹침 이유와 추천 2개가 보인다(계획 3 `dayIssues`). → Task 4 시험.

---

### Task 1: 행사 모델 · 역할 부담 · 문서 점검

**Files:**
- Create: `web/menus/plan/event-model.js`
- Test: `tests/unit/event-model.test.mjs`

**Interfaces:**
- Consumes: `core/store.js`, `isDate`(계획 3), `makeHwpx`용 `Doc` 모양(계획 2)
- Produces:
  - `KINDS = [['sports','운동회'],['arts','학예회'],['field','현장체험학습'],['other','기타']]`, `DOCS = [['plan','계획서'],['roles','역할 분담표'],['safety','안전 점검표'],['letter','가정통신문']]`
  - `Option = { label: '보완안'|'새로운 안'|string, summary, timetable: { time, activity, place }[], pros: string[], staffNeed, budget: { name, amount }[] }`
  - `Event = { id, kind, name, purpose, grades, date, place, outdoor, budget, staff: { name, duty }[], lastSurvey, options: Option[]|null, picked: number|null, docs: { plan, safety, letter, rain: string, roles: { name, roles: string[] }[] }, survey: Survey|null, status, step, maxStep, updatedAt }`
  - `Survey = { target: 'student'|'parent'|'staff', items: { type: 'scale'|'text', q }[], formUrl, result: SurveyResult|null, report: string, nextMemo: string }`
  - `newEvent()`, `listEvents()`, `getEvent(id)`, `saveEvent(e)`, `deleteEvent(id)`, `currentEventId()`, `setCurrentEvent(id)` (계획 3 `year-model.js`와 같은 방식, `step`·`maxStep` 1~4)
  - `normOptions(v) -> Option[]`(안 3개까지, 시간표 줄은 `activity`가 있는 것만), `normRoles(v, staff) -> roles`(명단에 없는 이름은 뺌; 명단이 비면 이름 그대로), `normItems(v) -> Survey['items']`
  - `roleLoad(roles) -> string[]`(평균보다 2개 이상 많은 사람 이름; 사람이 2명 미만이면 `[]`)
  - `letterMissing(text) -> string[]`(「날짜」「준비물」「복장」「문의처」 중 글에 없는 것 — 「일시」·「날짜」, 「준비물」·「챙길 것」, 「복장」·「옷차림」, 「문의」·「연락처」를 같은 것으로 봄)
  - `confirmBlockers(e) -> string[]`(야외인데 안전 점검표 없음 → 「야외 행사는 안전 점검표가 있어야 해요」, 우천 일정 없음 → 「야외 행사는 우천 시 대체 일정이 있어야 해요」, 가정통신문 빠진 항목 → 「가정통신문에 빠진 항목: …」)
  - `docDoc(e, docId) -> Doc`(계획서: 제목 「{행사명} 운영 계획」, 개요 표 [항목, 내용](목적·일시·대상·장소·예산), 시간표 표, 본문; 역할: 표 [이름, 맡은 역할]; 안전: 본문(+ 우천 시 대체 일정); 가정통신문: 제목 「{행사명} 안내」 본문)

- [ ] **Step 1: 실패하는 시험 쓰기** — `event-model.test.mjs`:
  - 저장·목록·망가진 `events` 값(계획 3과 같은 시험).
  - `normOptions([{ label: '보완안', timetable: [{ time: '09:00', activity: '개회식' }, { time: '9:30' }], pros: ['a', 1], budget: [{ name: '상품', amount: '300,000' }] }, '쓰레기', {}, {}, {}])` → 안 1개(빈 `{}`는 시간표가 없어 빠짐), 시간표 1줄, `budget[0].amount === 300000`.
  - `normRoles([{ name: '김교사', roles: ['진행', ''] }, { name: '없는 사람', roles: ['x'] }], [{ name: '김교사' }])` → 김교사만; 명단이 비면 둘 다.
  - `roleLoad([{ name: 'A', roles: ['1','2','3','4','5'] }, { name: 'B', roles: ['1'] }, { name: 'C', roles: ['1'] }])` → `['A']`(평균 2.33, A는 5); 한 명이면 `[]`; 빈 배열 `[]`.
  - `letterMissing('일시: 5월 3일\n옷차림: 체육복\n문의: 교무실 000-0000')` → `['준비물']`.
  - `confirmBlockers({ ...e, outdoor: true, docs: { ...docs, safety: '', rain: '' } })` → 두 문장; 실내면 안전·우천은 안 막음.
  - `docDoc(e, 'plan')` 제목 「가을 운동회 운영 계획」, 첫 표 첫 줄 `['항목', '내용']`; `docDoc(e, 'roles')` 표 머리 `['이름', '맡은 역할']`.
- [ ] **Step 2:** 시험 → 실패.
- [ ] **Step 3:** 구현.
- [ ] **Step 4:** 시험 → 통과.
- [ ] **Step 5: 커밋** — 「행사 모델·역할 부담·문서 점검」

---

### Task 2: 설문 CSV 집계

**Files:**
- Create: `web/core/survey.js`
- Test: `tests/unit/survey.test.mjs`

**Interfaces:**
- Consumes: `readCsv`·`decodeText`(계획 2 `core/sheet.js`)
- Produces: `SCALE = ['전혀 그렇지 않다','그렇지 않다','보통이다','그렇다','매우 그렇다']`, `scaleValue(v) -> 1..5|null`(숫자 1~5, 위 말, 「매우 만족」「만족」「보통」「불만족」「매우 불만족」도), `SurveyResult = { n, questions: ({ q, type: 'scale', counts: number[5], mean } | { q, type: 'text', answers: string[] })[], few: boolean }`, `summarize(rows: string[][]) -> SurveyResult`(첫 줄 머리, 「타임스탬프」·「Timestamp」·「이메일」 열은 뺌; 답의 80% 이상이 척도로 읽히면 척도 문항), `formText(items) -> string`(구글 폼에 붙일 글: 문항마다 번호·「(5점 척도: 전혀 그렇지 않다 ~ 매우 그렇다)」 또는 「(서술형)」)

- [ ] **Step 1: 실패하는 시험 쓰기** — `survey.test.mjs`: 타임스탬프 열이 있는 응답 4명(척도 2문항 — 하나는 숫자, 하나는 말 — 와 서술형 1문항, 빈 답 하나) → `n === 4`, 첫 문항 `counts` `[0,0,1,2,1]`·`mean === 3.75`(빈 답 빼고 평균), 서술형 `answers` 빈 답 뺌, `few === true`; 응답 12명이면 `few === false`; 따옴표 안 줄바꿈이 있는 서술형도 한 답; `formText`가 「1. … (5점 척도: 전혀 그렇지 않다 ~ 매우 그렇다)」로 시작.
- [ ] **Step 2:** 시험 → 실패.
- [ ] **Step 3:** 구현. 평균은 소수 둘째 자리 반올림.
- [ ] **Step 4:** 시험 → 통과.
- [ ] **Step 5: 커밋** — 「설문 CSV 집계」

---

### Task 3: QR 만들기

**Files:**
- Create: `web/core/qr.js`
- Test: `tests/unit/qr.test.mjs`

**Interfaces:**
- Produces: `rsEncode(data: number[], ecLen) -> number[]`, `formatBits(ecl: 'L'|'M'|'Q'|'H', mask) -> string`(15자리), `qrMatrix(text, ecl = 'M') -> boolean[][]`(바이트 모드 UTF-8, 버전 1~10 중 가장 작은 것, 마스크 8개 중 벌점이 가장 낮은 것), `decodeMatrix(m) -> string`(시험용 해석기: 형식 정보 → 마스크 풀기 → 지그재그로 읽기 → 블록 풀기 → 바이트 모드), `qrPng(text, scale = 8) -> Promise<Blob>`(브라우저 캔버스, 흰 여백 4칸)

- [ ] **Step 1: 실패하는 시험 쓰기** — `qr.test.mjs`:
  - `rsEncode([32,91,11,120,209,114,220,77,67,64,236,17,236], 13)` → `[168,72,22,82,217,54,156,0,46,15,180,122,16]`(1-Q 「HELLO WORLD」 표준 예).
  - `formatBits('M', 0) === '101010000010010'`, `formatBits('L', 0) === '111011111000100'`.
  - `qrMatrix('https://forms.gle/abc123')`: 크기 25(버전 2), 세 모서리 찾기 무늬, 타이밍 무늬(6행·6열이 번갈아), 어두운 점(8, 4·버전+9) 켜짐.
  - 여러 길이(1·17·50·120·250바이트, 한글 포함)의 글을 `qrMatrix` → `decodeMatrix` 하면 원래 글.
  - 271바이트를 넘으면 `Error('QR_TOO_LONG')`(버전 10-M 한도).
- [ ] **Step 2:** 시험 → 실패.
- [ ] **Step 3:** 구현. GF(256) 원시 다항식 0x11D. 버전별 블록 구성(1~10, L/M/Q/H)은 표준 표를 코드에 넣는다. 버전 7 이상은 버전 정보(18비트)를 넣는다.
- [ ] **Step 4:** 시험 → 통과.
- [ ] **Step 5: 커밋** — 「QR 만들기」. 사람 확인: 앱에서 만든 QR을 휴대폰으로 찍어 폼이 열리는지.

---

### Task 4: 행사계획 화면 1 행사 정보 · 2 구성안

**Files:**
- Create: `web/menus/plan/event.js`
- Modify: `web/menus/plan/year.js`(행사계획 탭을 `event.js`에 넘김), `web/menus/plan/plan.css`, `web/index.html`
- Test: `tests/e2e/event-plan.mjs`(Task 4~6이 이어서 채움)

**Interfaces:**
- Consumes: Task 1, `stepsHTML`(계획 3), `dayIssues`·`suggestDates`·`listEvents as listCalendar`(계획 3), `getSchool().breaks`, `readText`(계획 3, 작년 설문 파일), `generateJSON`·`errorMessage`·`ready`
- Produces: `event.js`의 `renderEventTab(box)`(year.js가 `tab === 'event'`일 때 부름); 화면 id: 단계 `ol.steps`, 지난 행사 `#evList [data-ev]`, [새 행사] `[data-e="new"]`, 1단계 `[data-kind]`, `#evName #evPurpose #evGrades #evDate #evPlace`, 실내·야외 `[data-outdoor="0|1"]`, `#evBudget`, 교직원 줄 `[data-staff][data-f=name|duty]`, `[data-e="staffAdd"]`, 작년 설문 `textarea#evLast`, 날짜 겹침 `#evDateWarn`·`button[data-suggest]`; 2단계 안 카드 `.ev-opt[data-opt]`, [이 안으로] `[data-pick]`, 고른 안의 시간표 칸 `[data-tt][data-f=time|activity|place]`

- [ ] **Step 1: 실패하는 시험 쓰기** — `event-plan.mjs`(가짜 Claude: 「[행사 구성안]」 → 안 3개(보완안·새로운 안·세 번째), 「[행사 문서]」·「[설문 문항]」·「[설문 결과]」는 Task 5·6):
  1. 계획 › 행사계획: 단계 4개(「행사 정보」「구성안」「문서」「설문·결과」), 종류 4개.
  2. 필수 칸이 비면 [다음] 안 됨(`#evName.bad` 등).
  3. 날짜를 2027-05-05(어린이날)로 하면 `#evDateWarn`에 「공휴일(어린이날)」과 추천 2개; 추천을 누르면 날짜가 바뀜.
  4. 작년 설문 결과를 붙여넣고 [다음] → 2단계에 안 3개, 프롬프트에 작년 설문 글; 「보완안」 카드가 첫째.
  5. [이 안으로] → 고른 안 표시, 시간표 칸을 고치면 새로고침해도 남음.
  6. 작년 설문 없이 만든 행사는 프롬프트에 「보완안은 만들지 마세요」.
- [ ] **Step 2:** 시험 → 실패.
- [ ] **Step 3:** 구현. 구성안 프롬프트는 「[행사 구성안]」으로 시작, `{ options: Option[] }`(작년 설문이 있으면 첫 안은 「보완안」, 다음은 「새로운 안」, 2~3개)만 받는다. 날짜 겹침은 `dayIssues(date, { breaks, events: listCalendar(), source: 'event:'+id })`.
- [ ] **Step 4:** 시험 → 통과. `npm run e2e` 전부 통과.
- [ ] **Step 5: 커밋** — 「행사계획: 행사 정보·구성안」

---

### Task 5: 3 문서 세트 · 품의로 이어 가기

**Files:**
- Modify: `web/menus/plan/event.js`, `web/menus/plan/plan.css`, `web/menus/purchase/purchase.js`(`openPurchase(prefill)` 내보내기), `tests/e2e/event-plan.mjs`

**Interfaces:**
- Consumes: Task 1(`normRoles`·`roleLoad`·`letterMissing`·`docDoc`·`DOCS`), `makeHwpx`·`saveFile`·`copyText`, purchase `setForm`
- Produces: `purchase.js`의 `openPurchase(prefill: Partial<Form>)`(종류 `event`, 품목은 예산 줄로, 품의 › 새 품의로 감); 화면 id: 문서 탭 `[data-doc=plan|roles|safety|letter]`, 문서 글 `textarea[data-docf]`, 역할 표 `#evRoles [data-role]`, 과부하 `.ev-over`, 우천 `textarea#evRain`, 빠진 항목 `#evLetterMissing`, [완성] `[data-e="letterDone"]`, [한글 파일로 내려받기] `[data-e="hwpx"]`, [품의로 이어 가기] `[data-e="purchase"]`

- [ ] **Step 1: 실패하는 시험 쓰기**(이어서; 가짜 「[행사 문서]」 → `{ plan, roles: [{ name: '김교사', roles: ['사회','음향','안전','기록','시상'] }, { name: '이교사', roles: ['안전'] }, { name: '박교사', roles: ['기록'] }], safety, letter: '일시: …\n준비물: 물병\n복장: 체육복', rain: '' }`):
  1. 교직원 3명을 넣은 행사에서 [문서 만들기] → 문서 4개 탭; 역할 표에서 김교사 줄이 `.ev-over`.
  2. 가정통신문에 「문의처」가 없어 `#evLetterMissing`에 「문의처」, [완성]이 꺼짐; 「문의: 교무실 000-0000」을 더하면 켜짐.
  3. 야외 행사에서 우천 일정이 비면 4단계 [확정]이 막히고 이유가 보임(Task 6에서 확인).
  4. 문서마다 [한글 파일로 내려받기]는 `.hwpx`, [복사]는 그 문서 글.
  5. [품의로 이어 가기] → 품의 › 새 품의, 종류 「행사 운영」, 사업명·목적·일시·대상·장소가 채워지고 품목에 고른 안의 예산 줄.
- [ ] **Step 2:** 시험 → 실패.
- [ ] **Step 3:** 구현. 문서 프롬프트는 「[행사 문서]」로 시작, 고른 안·행사 정보·교직원 명단(이름·맡은 업무)을 주고 네 문서와 우천 일정을 받는다. 가정통신문은 학부모가 읽기 쉬운 말로, 날짜·준비물·복장·문의처를 꼭 넣게 한다.
- [ ] **Step 4:** 시험 → 통과. `npm run e2e` 전부 통과.
- [ ] **Step 5: 커밋** — 「행사계획: 문서 세트·품의로 이어 가기」

---

### Task 6: 4 확정 · 설문(문항·QR·결과 보고서) · 지난 행사

**Files:**
- Modify: `web/menus/plan/event.js`, `web/menus/plan/plan.css`, `tests/e2e/event-plan.mjs`
- Create: `tests/fixtures/survey-12.csv`, `tests/fixtures/survey-4.csv`

**Interfaces:**
- Consumes: Task 1(`confirmBlockers`), Task 2(`summarize`·`formText`), Task 3(`qrPng`), `setEvents`(계획 3), `readText`·`readCsv`·`decodeText`
- Produces: 화면 id: [확정] `[data-e="final"]`, 막는 이유 `#evBlockers li`, 설문 대상 `[data-target]`, [문항 만들기] `[data-e="items"]`, 문항 `#evItems li`, [구글 폼용 복사] `[data-e="formCopy"]`, 폼 링크 `#evForm`, QR 그림 `#evQr img`, [QR 내려받기] `[data-e="qrDown"]`, CSV 올리기 `[data-e="csv"]`, 결과 `#evResult`(문항별 막대 `.ev-bar`), 보고서 `textarea#evReport`, 내년 메모 `textarea#evNext`

- [ ] **Step 1: 실패하는 시험 쓰기**(이어서; 가짜 「[설문 문항]」 → 척도 5개 + 서술형 2개, 「[설문 결과]」 → `{ textSummary, report, nextMemo }`):
  1. 야외 행사, 우천 일정 없음 → [확정] 막힘, `#evBlockers`에 「우천 시 대체 일정」; 우천 일정을 넣고 [확정] → 지난 행사에 「확정」, `ssam:calendar`에 `event:<id>` 일정 1개.
  2. [문항 만들기] → 7문항; [구글 폼용 복사] → 클립보드가 `formText`와 같음.
  3. 폼 링크 `https://forms.gle/abc123` → `#evQr img`(PNG data URL) 보임, [QR 내려받기] → `.png`, 가정통신문 글 끝에 「설문 참여: https://forms.gle/abc123 (QR)」 자리가 들어감.
  4. `survey-12.csv` 올리기 → 문항별 막대와 평균, 서술형 요약·보고서·내년 메모 칸이 채워짐; 「응답이 적어요」 없음. `survey-4.csv` → 보고서 맨 앞에 「응답이 적어요(4명). 결과를 일반화하기 어려워요」.
  5. 같은 종류의 새 행사를 만들면 1단계 [지난 행사 개선 메모 불러오기]로 작년 설문 칸이 내년 메모로 채워짐.
  6. 390px 폭에서 본문이 가로로 넘치지 않음. 페이지 오류 없음.
- [ ] **Step 2:** 시험 → 실패.
- [ ] **Step 3:** 구현. 결과 프롬프트는 「[설문 결과]」로 시작, `summarize` 결과(문항·평균·분포·서술형 답 앞 200개)를 주고 `{ textSummary, report, nextMemo }`를 받는다. 응답 10명 미만이면 보고서 맨 앞에 PRD 문장을 앱이 붙인다. 막대는 CSS(너비 %)로 그린다.
- [ ] **Step 4:** `npm test && npm run e2e` → 통과.
- [ ] **Step 5: 커밋** — 「행사계획: 확정·설문·결과 보고서」. `main`을 앞으로 당긴다.
