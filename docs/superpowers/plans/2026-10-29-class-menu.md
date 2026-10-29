# 쌤비서 계획 5 · 학급 메뉴 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학급 메뉴(오늘 수업 · 진도표·시수 · 주간학습안내)를 실제로 동작하게 만든다. 학교 진도표·시간표 한글 파일을 AI 없이 읽고, 매일 체크로 시수·진도 차이를 계산하고, 주간학습안내를 한글 파일로 뽑는다.

**Architecture:** 파일 글 읽기(`class-import.js`)와 계산(`class-model.js`)은 DOM 없는 모듈로 쓰고 Node로 시험한다. 화면은 탭마다 모듈 하나(`today.js`·`progress.js`·`setup.js`·`weekly.js`)가 자기 상자를 갖고 `onEnter('class', …)`로 보이고 숨긴다(계획 3·4의 `year.js`·`event.js`와 같은 틀). AI는 정해진 모양이 아닌 파일과 알림 초안에만 쓴다.

**Tech Stack:** 계획 1~4와 같음. 새 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-10-29-class-menu-design.md` (그 0장은 선생님 드라이브 실제 자료에서 확인한 모양). PRD 5.6·6.2·7·8.

## Global Constraints
- 계획 1~4의 Global Constraints를 따른다(저장은 `core/store.js`, 키 앞에 `ssam:`, AI는 `core/ai.js`의 `generateJSON`, 한글 파일은 `makeHwpx`, 파일 읽기는 `core/files.js`의 `readText`, 알림은 `core/ui.js`의 `toast`).
- 저장 키: `class:info`, `class:timetable`, `class:subjects`, `class:log`, `class:weekly:<월요일 YYYY-MM-DD>` (스펙 6장 모양 그대로).
- 체크 값: `'done'`(완료) · `'part'`(일부 진행) · `'skip'`(못 함). 버튼 글: 「완료」「일부 진행」「못 함」.
- 요일 순서: 0=월 … 4=금. 교시는 1부터. 교시 수 4~7, 기본 6.
- 실제 학생·교직원·학교 자료(선생님 드라이브 파일 포함)는 레포·시험 자료에 넣지 않는다. 시험 자료와 예시는 실제 파일과 **같은 칸 모양**에 **지어낸 내용**만 쓴다.
- 프롬프트 머리: `[진도표 읽기]`, `[시간표 읽기]`, `[주간학습안내]`.
- 안내 문구는 스펙 7장의 글을 그대로 쓴다.
- 학년도(기간 날짜의 연도): 파일에 「N학년도」가 있으면 N, 없으면 오늘이 든 학년도(3월~다음 해 2월). 설정 › 학교 정보의 학년도는 10월부터 다음 해를 가리키므로(계획용) 여기서는 쓰지 않는다. (스펙 3.6을 이 규칙으로 좁힘)

## Review Focus
1. **실제 진도표의 줄 모양 변화**(합친 칸 때문에 7·6·5·4칸 줄이 섞임, 빈 칸으로 나온 합친 칸, 창체의 「영역」 칸, ◈ 행사 줄, 주 번호 없이 기간만 있는 줄): 줄마다 주·기간·단원이 위 줄에서 이어지고 차시 수가 「총 시수」와 같다. → Task 1 시험.
2. **해를 넘는 기간과 공휴일 주**(「12.28~1.2」, 「1.4~1.9」, 추석 주처럼 수업일이 적은 주): 1~2월은 다음 해 날짜가 되고, 진도 차이가 그 주의 진도표 차시 수를 넘지 않는다. → Task 1·Task 3 시험.
3. **체크를 며칠 빼먹고 나중에 순서 없이 체크**(수요일을 먼저, 화요일을 나중에): 차시가 날짜·교시 순으로 다시 배정된다. → Task 2 시험.
4. **시간표 칸 표기가 진도표 교과명과 다름**(「수 학」, 「국어(자)」, 「창체(동)」, 「창의적 체험활동」): 같은 교과로 잡혀 진도가 이어진다. → Task 1·Task 2 시험.
5. **저장값이 망가짐·저장 공간 부족**: 화면이 깨지지 않고 기본값으로 열리며, 저장 실패는 「저장 공간이 모자라 저장하지 못했어요」. → Task 2 시험(망가진 값), Task 4 화면(알림).

---

### Task 1: 진도표·시간표 글 읽기 (AI 없음)

**Files:**
- Create: `web/menus/class/class-import.js`
- Create: `tests/fixtures/jindo-sample.txt`, `tests/fixtures/timetable-sample.txt` (지어낸 내용, 실제 파일 칸 모양)
- Test: `tests/unit/class-import.test.mjs`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces:
  - `Lesson = { week: number|null, period: string, from: 'YYYY-MM-DD'|'', unit: string, title: string, pages: string, memo: string }`
  - `normName(s) -> string`: 공백을 모두 뺀 이름.
  - `periodStart(period, year) -> 'YYYY-MM-DD'|''`: 「8.24~8.29」→ `${year}-08-24`, 1~2월이면 `year+1`; 모양이 아니면 `''`.
  - `schoolYearOf(date) -> number`: 3월~12월은 그해, 1~2월은 전해.
  - `parseJindo(text, { today }) -> { year, subjects: { name, source, total: number|null, pick: boolean, lessons: Lesson[] }[] }`
    - 교과는 줄 `/^(.+?)\s*교육과정\s*연간지도계획/`로 나눈다. `source` = 파일의 교과명 그대로, `name` = `normName`하고 「창의적체험활동」→「창체」.
    - `pick`: 「자율⋅자치활동」「자율·자치활동」「동아리활동」「진로활동」은 false, 나머지 true.
    - 줄은 `/\s*\|\s*/`로 가르고 앞뒤 빈 칸을 버리지 않는다(위치가 뜻을 가짐). 차시 칸 = `/^\d+\s*\/\s*\d+$/`. 차시 칸이 없는 줄은 건너뜀.
    - 차시 칸 바로 앞 = 학습 주제, 그 앞의 칸들: `/^\d+$/` → 주, `/^\d{1,2}\.\d{1,2}\.?\s*~\s*\d{1,2}\.\d{1,2}\.?$/` → 기간, 빈 칸은 무시, 그 밖 → 단원명. 줄에 없는 주·기간·단원은 위 줄 값을 이어 씀(교과가 바뀌면 처음부터). 차시 칸 뒤: 쪽수(창체는 영역), 비고.
    - `total` = 그 교과 구간의 `/총\s*시수\s*[:：]\s*(\d+)/` 첫 값.
    - `year` = `/(\d{4})\s*학년도/` 첫 값, 없으면 `schoolYearOf(today)`.
  - `parseTimetable(text, { grade, room }) -> { periods, cells } | null`: 머리 칸 `${grade}-${room}` 뒤 5칸이 월·화·수·목·금인 줄을 찾고, 아래 줄들에서 같은 위치 칸이 숫자인 동안 그 뒤 5칸을 교시 순으로 읽음. 칸은 `normName`. 끝의 모두 빈 교시는 버리고 `periods`는 4~7로 맞춤. 우리 반이 없거나 과목이 하나도 없으면 `null`. `cells[요일][교시-1]`.

- [ ] **Step 1: 시험 자료 쓰기** — `jindo-sample.txt`: 「2026학년도 2학기 | 3학년 1반」 머리, 교과 4개(국어·수학·창의적 체험활동·자율⋅자치활동). 국어에 7칸 줄(주·기간·단원·주제·차시·쪽·비고), 6칸 줄(주·기간·주제…), 5칸 줄(단원·주제…), 4칸 줄(주제…), ◈ 행사 줄(단원 칸 「◈학예회 관람」, 비고 「◈학예회 관람」), 「12.28~1.2」 주와 「1.4~1.9」 주, 끝줄 「▶ 2학기 총 시수: 12시간  ◆ 연간 총 시수: 24시간」(국어 차시 12줄). 수학은 hwpx 모양처럼 합친 칸이 빈 칸(` |  |  | 주제 | 2/8 | 10~11 |`)으로 나오는 줄 포함, 총 시수 8. 창체는 「영역」 칸(자율⋅자치·동아리). `timetable-sample.txt`: 실제 파일처럼 한 줄에 두 반(`3-1 | 월 | 화 | 수 | 목 | 금 | 3-2 | 월 | …`), 6교시, 칸에 「수 학」「국어(자)」「창체(동)」, 6교시 일부 빈 칸.
- [ ] **Step 2: 실패하는 시험 쓰기** — `class-import.test.mjs`:
  - `periodStart('8.24~8.29', 2026) === '2026-08-24'`, `periodStart('12.28~1.2', 2026) === '2026-12-28'`, `periodStart('1.4~1.9', 2026) === '2027-01-04'`, `periodStart('기간', 2026) === ''`.
  - `schoolYearOf('2027-02-10') === 2026`, `schoolYearOf('2026-03-02') === 2026`.
  - `parseJindo(fixture, { today: '2026-10-29' })`: `year === 2026`, 교과 이름 `['국어','수학','창체','자율⋅자치활동']`, `pick` `[true,true,true,false]`, 국어 `lessons.length === total === 12`, 6칸 줄의 단원은 위 줄 단원을 이어받음, 4칸 줄의 주·기간은 위 줄 것, ◈ 줄 `memo === '◈학예회 관람'`, 「1.4~1.9」 줄 `from === '2027-01-04'`, 수학 빈 칸 줄도 주·기간·단원을 이어받음, 창체 `pages === '자율⋅자치'`.
  - 차시 칸이 없는 글(`'안녕\n주 | 기간'`) → `subjects` 빈 배열.
  - `parseTimetable(tt, { grade: 3, room: 2 })`: `periods === 6`, `cells[0][0]` 등 3-2 블록 값, 「수 학」→「수학」, 「국어(자)」 그대로. `{ grade: 3, room: 1 }`은 왼쪽 블록. `{ grade: 4, room: 9 }` → `null`.
- [ ] **Step 3: 실패 확인** — Run: `node --test tests/unit/class-import.test.mjs` / Expected: FAIL (모듈 없음).
- [ ] **Step 4: `class-import.js` 구현** (위 Produces 그대로).
- [ ] **Step 5: 통과 확인** — Run: `node --test tests/unit/class-import.test.mjs` / Expected: PASS. 그리고 `npm test` 전체 PASS.
- [ ] **Step 6: Commit** — `git add web/menus/class/class-import.js tests/unit/class-import.test.mjs tests/fixtures/jindo-sample.txt tests/fixtures/timetable-sample.txt && git commit -m "학급: 진도표·시간표 글 읽기"`

### Task 2: 학급 모델 — 저장·교과 맞추기·차시 배정·시수

**Files:**
- Create: `web/menus/class/class-model.js`
- Test: `tests/unit/class-model.test.mjs`

**Interfaces:**
- Consumes: `core/store.js`(`get`,`set`,`remove`,`list`), `core/calendar.js`(`isDate`,`addDays`,`weekday`,`dayIssues`), Task 1의 `Lesson`·`normName`·`periodStart`.
- Produces:
  - `Timetable = { periods: 4..7, cells: string[5][periods] }`, `Subject = { id, name, start: 'YYYY-MM-DD'|'', offset: number, total: number|null, lessons: Lesson[] }`, `Log = { [date]: { [period]: { subject, status } } }`, `Weekly = { title, cells: { 'd-p': string }, notes: { [d]: { events, prep, homework, notice, safety } } }`
  - 저장: `getInfo() -> { grade: number|null, room: number|null }`, `setInfo(v) -> boolean`, `getTimetable() -> Timetable`(기본 6교시 빈 칸), `setTimetable(t) -> boolean`(칸 `normName`), `listSubjects() -> Subject[]`, `saveSubject(s) -> Subject|null`(id가 같으면 바꿈, 없으면 `'sj'+시간+난수`), `removeSubject(id)`, `getLog() -> Log`, `setMark(date, period, subject, status|null) -> boolean`(null이면 지움, 날짜가 비면 그 날짜 키도 지움), `getWeekly(monday) -> Weekly`, `saveWeekly(monday, w) -> boolean`. 읽을 때 모양이 틀린 값은 버림. `set` 실패면 false/null.
  - 날짜: `today() -> 'YYYY-MM-DD'`(로컬 날짜), `mondayOf(date)`, `fmtDay(date) -> '10월 29일 (목)'`, `fmtShort(date) -> '10/27(화)'`.
  - `noClass(date, breaks) -> string`: `dayIssues(date, { breaks })[0] || ''`(학사일정은 넘기지 않음).
  - `sameSubject(a, b) -> boolean`: `normName` 같으면 참; 아니면 괄호 앞 부분(`/\(.*$/` 뺀 것)이 같으면 참; 「창의적체험활동」=「창체」.
  - `findSubject(subjects, name) -> Subject|null`: 완전히 같은 이름(`normName`) 먼저, 없으면 `sameSubject`.
  - `Ctx = { tt: Timetable, subjects: Subject[], log: Log, breaks, today }`, `makeCtx(today = today()) -> Ctx`(저장값 + `getSchool().breaks`).
  - `slotsOn(ctx, date) -> { period, subject }[]`(수업 없는 날은 `[]`, 빈 칸 제외).
  - `lessonAt(ctx, sub, date, period) -> number`(0부터) = `sub.offset` + 그 시간보다 앞선(날짜·교시 순) `sub`의 「완료」 기록 수 + (오늘부터 그 시간 전까지, 기록이 없는 `sub` 수업 시간 수). 마지막 항은 오늘 이후 시간을 「매시간 한 차시」로 보는 예상(스펙 3.4·3.7). 앞으로 세는 날은 200일까지.
  - `dayView(ctx, date) -> { date, off: string, slots: { period, subject, sub: Subject|null, index: number|null, lesson: Lesson|null, finished: boolean, status: 'done'|'part'|'skip'|null }[] }`
  - `hours(ctx, sub) -> { plan, done, left }`(스펙 3.5).
  - `setNext(ctx, sub, n) -> Subject`(다음 차시 n(1부터)이 되게 `offset = n − 1 − 완료 기록 수`).

- [ ] **Step 1: 실패하는 시험 쓰기** — `class-model.test.mjs`(Task 1 시험 파일처럼 `mem()` 저장소):
  - 저장: 시간표 저장 시 「수 학」→「수학」, 망가진 `class:timetable`(`'x'`, `{ periods: 99 }`) → 기본 6교시; 망가진 `class:subjects` 항목은 빠짐; `setMark` 후 `getLog()`, null로 지우면 그 날짜 키 없음.
  - `sameSubject('국어(자)','국어')`, `sameSubject('창의적 체험활동','창체')`, `sameSubject('수 학','수학')` 참, `sameSubject('국어','수학')` 거짓.
  - `noClass('2026-10-31', [])==='토요일'`, `noClass('2026-10-09', [])==='공휴일(한글날)'`, 방학 `[{ from:'2026-12-24', to:'2027-02-28', label:'겨울방학' }]` 안의 날 → `'겨울방학'`.
  - 차시 배정(시간표: 화 1교시 국어, 수 2교시 국어, 목 1교시 국어, 목 3교시 국어(자), 금 2교시 국어; 국어 10차시, offset 2, today '2026-10-29'(목); 항목마다 기록을 비우고 시작):
    - 기록 없음 → 목 1교시 index 2, 목 3교시 3, 금 2교시 4.
    - 목 1교시 `part` → 목 3교시 index 2(같은 차시), 금 2교시 3.
    - 목 1교시 `done`, 3교시 `skip` → 금 2교시 3(못 함은 진도 없음, 다음 시간 예상은 +0 — 목 3교시는 기록 있음).
    - 순서 없이 체크(Review Focus 3): 수(10/28) 2교시 `done`을 먼저 기록하고 화(10/27) `done`을 나중에 기록 → 화 index 2, 수 index 3.
    - 지난 시간(10/26 월) 기록 없음 → 오늘 이후 예상에 더하지 않음.
  - `hours`: offset 2, `done`2·`part`1·`skip`1 → `{ plan:10, done:5, left:5 }`; offset −1이면 실시에 0으로 셈.
  - `setNext(ctx, sub, 5)` 뒤 `lessonAt` 첫 기록 없는 시간이 4.
  - `findSubject`: 교과 「국어」가 있을 때 시간표 칸 「국어(자)」→ 국어.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/unit/class-model.test.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현** — 위 Produces. 기록 순서 비교는 `date + ':' + period`(교시 한 자리) 문자열 대신 `[date, period]` 비교.
- [ ] **Step 4: 통과 확인** — Run: `node --test tests/unit/class-model.test.mjs` / Expected: PASS; `npm test` 전체 PASS.
- [ ] **Step 5: Commit** — `git commit -m "학급: 저장·교과 맞추기·차시 배정·시수"`

### Task 3: 학급 모델 — 진도 차이·체크 안 한 날·주간 예상·AI 답 다듬기·한글 문서

**Files:**
- Modify: `web/menus/class/class-model.js`
- Test: `tests/unit/class-model.test.mjs`(이어 씀)

**Interfaces:**
- Consumes: Task 2 전부, Task 1 `periodStart`·`schoolYearOf`.
- Produces:
  - `lessonMonday(ctx, sub, i) -> 'YYYY-MM-DD'|''`: `from` 있으면 `mondayOf(from)`; 없고 `week`가 있으면 `mondayOf(시작일) + 7×(week − 가장 작은 week)`(시작일 = `sub.start`가 날짜면 그것, 아니면 `ctx.today`); 둘 다 없으면 `''`.
  - `progressOf(ctx, sub) -> { plan, done, left, actual, expected, diff, next, mode: 'week'|'slot', started: boolean, inTimetable: boolean }` (스펙 3.6: 「지금까지」 = 어제까지 + 오늘 기록 있는 시간; `actual` = `offset + 완료 수`를 0~plan으로; `next = actual + 1`(plan 넘으면 plan+1); 시작 전이면 `expected 0`, `started false`).
  - `summary(ctx) -> progressOf[]`(교과 목록 순서, 각 항목에 `sub`).
  - `alignToPlan(ctx, sub) -> Subject`: `setNext(ctx, sub, expected + 1)`.
  - `missingDays(ctx, n = 10) -> string[]`: 오늘 앞 수업일 n일 중, 진도표 있는 교과의 수업이 있는데 그날 기록이 하나도 없는 날(오래된 순).
  - `defaultWeek(today) -> monday`: 목·금·토·일이면 다음 주 월요일, 아니면 이번 주 월요일.
  - `weekView(ctx, monday) -> dayView[5]`.
  - `normLessons(list, year) -> Lesson[]`(제목 없는 줄 버림, `week`는 정수만, `from = periodStart(period, year)`), `normTimetableAI(v) -> Timetable|null`(`cells` 5요일, 교시 4~7로 맞춤, 과목이 하나도 없으면 null), `normNotes(v) -> notes[5]`(문자열만, 없는 요일은 빈 칸).
  - `weeklyTitle(info) -> string`: `${grade}학년 ${room}반 주간학습안내`, 모르면 `주간학습안내`.
  - `cellText(slot) -> string`: `교과 · 학습 주제`(차시 없으면 교과만).
  - `weeklyDoc(days, weekly) -> Doc`: 제목 `weekly.title`, 문단 「{월 날짜} ~ {금 날짜}」, 표1 머리 `['교시','월 11/2','화 11/3',…]` 줄마다 교시와 칸(`weekly.cells` 고친 글 > `cellText`, 수업 없는 날은 그 이유), 표2 머리 `['구분', 요일들]` 줄 `학사일정·준비물·과제·안내장·안전`.

- [ ] **Step 1: 실패하는 시험 쓰기**:
  - 기간 날짜 진도(Review Focus 2): 국어 차시 주1 `8.24~8.29` 2줄, 주2 `8.31~9.4` 3줄, 주3 `9.7~9.11` 2줄; 시간표 월·수·금 1교시 국어; today `'2026-09-02'`(수), offset 0, 기록 없음 → `expected === 3`(주1 2줄 + min(이번 주 3줄, 「지금까지」 1시간 = 월 8/31)); 수 1교시를 `done`으로 기록하면 `expected === 4`, `actual === 1`, `diff === -3`.
  - 주 번호만(기간 없음): 같은 차시에 `period: ''`, week 22·23·24, `sub.start = '2026-08-24'` → 위와 같은 `expected`(가장 작은 주 22가 시작 주).
  - 주 없음(`mode 'slot'`): `start '2026-08-31'`, 같은 시간표, today `'2026-09-02'`, 기록 없음 → `expected === 1`(월 1시간; 오늘 수업은 기록 전이라 안 셈), 기록 후 2. 차시 수보다 크지 않음.
  - 시작 전: today가 첫 주 앞 → `started false`, `expected 0`.
  - 추석 주처럼 공휴일이 있는 주에도 `expected`가 그 주 차시 수를 넘지 않음.
  - `alignToPlan` 뒤 `progressOf().diff === 0`.
  - `missingDays`: 화·수 수업일에 기록 없음, 목은 기록 있음, today 금 → `['…화','…수']`만(주말·공휴일·진도표 없는 교과만 있는 날 제외).
  - `defaultWeek('2026-10-29') === '2026-11-02'`, `defaultWeek('2026-10-27') === '2026-10-26'`.
  - `weekView` 다음 주: 이번 주 남은 기록 없는 시간만큼 앞으로 밀린 차시가 나옴.
  - `normLessons([{ title: '분수', week: '3', period: '9.7~9.11' }, { week: 1 }], 2026)` → 1줄, `week === null`(문자열 '3'은 정수가 아님 — `Number.isInteger`만 받음), `from === '2026-09-07'`.
  - `normTimetableAI({ cells: [['국어'],[],[],[],[]] })` → `periods 4`, 칸 채움; `{}` → null.
  - `weeklyDoc`: 표1 머리 첫 칸 `'교시'`, 고친 칸 글이 들어감, 공휴일 열 칸은 이유.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/unit/class-model.test.mjs` / Expected: 새 시험 FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "학급: 진도 차이·주간 예상·체크 안 한 날·주간학습안내 문서"`

### Task 4: 진도표·시수 화면(요약) + 준비(학급·시간표·교과 목록·예시)

**Files:**
- Create: `web/menus/class/class-sample.js`, `web/menus/class/progress.js`, `web/menus/class/setup.js`, `web/menus/class/class.css`
- Modify: `web/index.html`(css·script 추가: `menus/class/class.css`, `menus/class/progress.js`, `menus/class/setup.js`), `scripts/make-samples.mjs`
- Test: `tests/e2e/class-setup.mjs`

**Interfaces:**
- Consumes: Task 2·3 전부, `onEnter`·`go`(shell), `toast`, `SSAM.openSheet/closeSheet`.
- Produces:
  - `class-sample.js`: `sampleData(today) -> { info, timetable, subjects }`(3학년 1반, 6교시 시간표(영어·음악 등 진도표 없는 교과 포함), 국어·수학·사회는 기간 있는 주별 진도표, 과학은 주 없음; 2026-08-24(월) 시작, 학년도 2026; 오늘 기준 진도 차이가 국어 −2, 수학 +1, 사회 0, 과학 −1이 되게 `alignToPlan` 뒤 offset을 더함), `sampleJindoDoc() -> Doc`(위 네 교과 + 창의적 체험활동 + 동아리 활동, 실제 파일 칸 모양의 연간지도계획 표들), `sampleTimetableDoc() -> Doc`(3-1·3-2 두 반이 나란한 시간표, 3-1은 `sampleData`와 같음).
  - `setup.js`가 붙이는 상자: `section[data-menu="class"] .cls-setup`(진도표·시수 탭에서 요약 아래). 학급 자료를 저장한 화면은 `document.dispatchEvent(new CustomEvent('class:changed'))`를 보내고, 각 화면은 이 이벤트를 듣고 보이고 있으면 다시 그림.
  - `progress.js` 상자 `.cls-progress`: 요약 표(교과·계획·실시·남은·진도 차이·다음 차시·기준) + 막대. 진도 차이 글: `+2`, `0`(맞음), `−1`, 시작 전이면 「시작 전」. 시간표에 없는 교과는 「시간표에 없어요」.
  - 준비 화면 요소 id: `#clsGrade`, `#clsRoom`, `#clsPeriods`, 시간표 칸 `input[data-cell="d-p"]`, 교과 목록 `[data-sub="<id>"]`, 다음 차시 `input[data-next="<id>"]`, 시작일 `input[type=date][data-start="<id>"]`(기간 날짜가 없는 진도표에만 보임), 버튼 `data-c="sample|editSub|delSub|addSub|ttFile|jindoFile"`.
  - 진도표 고치기 시트: 표 칸 `input[data-l="<i>-<key>"]`(key: week·period·unit·title·pages·memo), [줄 추가] `data-c="addRow"`, [줄 지우기] `data-c="delRow"`, [저장] `data-c="saveSub"`.
- [ ] **Step 1: 실패하는 화면 시험 쓰기** — `class-setup.mjs`(`page.clock.setFixedTime(new Date('2026-10-29T09:00:00'))`):
  - 학급 메뉴 › 진도표·시수에 [예시로 채우기] → 요약 표에 국어 진도 차이 「−2」, 수학 「+1」, 과학 기준 「시간표」.
  - 자료가 있을 때 [예시로 채우기]는 확인 시트를 거침(취소하면 그대로).
  - 시간표 칸 「수 학」 입력 → 저장값 「수학」; 교시 수 7로 바꾸면 7줄.
  - 다음 차시를 5로 고치면 요약의 「다음 차시」 5.
  - [진도표 고치기]에서 줄 추가·학습 주제 고침 → 저장 후 차시 수 +1.
  - 교과 삭제는 확인 시트를 거치고, 지운 뒤에도 `class:log`는 그대로.
  - 360px 폭에서 가로 스크롤 없음(`document.documentElement.scrollWidth <= innerWidth`).
  - 저장이 실패하면(`Storage.prototype.setItem`이 `ssam:class:` 키에서 던지게 함) 「저장 공간이 모자라 저장하지 못했어요」 알림.
  - 페이지 오류 없음.
- [ ] **Step 2: 실패 확인** — Run: `node tests/e2e/class-setup.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현** — 계획 3·4의 `yp-card`·`field`·`btn` 틀과 `plan.css` 값을 따름. 시간표 표는 `.cls-tt-wrap{overflow-x:auto}` 안에. 저장 실패면 「저장 공간이 모자라 저장하지 못했어요」. `make-samples.mjs`에 `samples/진도표-예시.hwpx`, `samples/시간표-예시.hwpx` 추가.
- [ ] **Step 4: 통과 확인** — Run: `node tests/e2e/class-setup.mjs && npm run samples && npm test` / Expected: 모두 통과, `samples/`에 두 파일.
- [ ] **Step 5: Commit** — `git commit -m "학급: 진도표·시수 요약과 준비 화면, 예시 자료"`

### Task 5: 파일에서 가져오기(시간표·진도표) + AI로 읽기

**Files:**
- Modify: `web/menus/class/setup.js`, `web/menus/class/class.css`
- Test: `tests/e2e/class-import.mjs`

**Interfaces:**
- Consumes: Task 1 `parseJindo`·`parseTimetable`, Task 3 `normLessons`·`normTimetableAI`·`alignToPlan`, `readText`·`fileMessage`, `ai.generateJSON`·`ai.ready`·`ai.errorMessage`.
- Produces:
  - [시간표 파일에서 가져오기](`data-c="ttFile"`, `<input type=file id="clsTtFile">`): `parseTimetable`; 학년·반이 비면 「먼저 학년·반을 넣어 주세요」; 못 찾으면 「시간표 파일에서 3-2반을 찾지 못했어요」 + AI 키가 있으면 [AI로 읽기](`data-c="ttAi"`, 프롬프트 `[시간표 읽기]`, 우리 반 학년·반과 파일 글 60,000자).
  - [진도표 파일 올리기](`#clsJindoFile`): `parseJindo` → 고르기 시트(교과마다 `input[type=checkbox][data-pick="<i>"]`, 차시 수, 「파일에는 98시간인데 97줄을 읽었어요」, 같은 이름이 있으면 「바꿀까요?」 표시), [넣기](`data-c="pickOk"`) → 고른 교과를 `saveSubject` 후 `alignToPlan`(같은 이름이면 id·기록 유지, 차시 목록만 바꿈). 모양이 아니면 스펙 7장 문구.
  - [교과 추가](`data-c="addSub"`) 시트: 교과 이름 `#clsNewName`, 파일·붙여넣기 `#clsNewText`, [AI로 차시 뽑기](`data-c="lessonAi"`, `[진도표 읽기]`), [직접 쓰기](`data-c="manual"` → 빈 진도표 고치기 시트). 방금 읽은 파일 글은 이 화면 안에서만 기억(저장 안 함).
  - AI 결과는 시작할 때의 교과 이름·시트에 넣음(다른 일을 하는 동안 섞이지 않게). 0개면 스펙 7장 문구.
- [ ] **Step 1: 실패하는 화면 시험 쓰기** — `class-import.mjs`:
  - `samples/시간표-예시.hwpx` 올리기(학년 3, 반 2) → 시간표 칸이 예시 3-2 값, AI 부르지 않음(가짜 AI 호출 수 0).
  - 반 9 → 찾지 못함 문구; AI 키가 있으면 [AI로 읽기] → 가짜 답 `{"periods":5,"cells":[…]}` → 시간표 5교시.
  - `samples/진도표-예시.hwpx`(국어·수학·사회·과학·창의적 체험활동·동아리 활동) 올리기 → 고르기 시트에서 동아리 활동만 꺼진 채, [넣기] → 요약 5줄(창의적 체험활동은 「창체」), AI 호출 0.
  - AI 키가 없을 때 [AI로 차시 뽑기] → 「설정 › AI에서 키를 넣어 주세요」.
  - 같은 이름 다시 넣기 → 「바꿀까요?」 표시, 넣은 뒤 체크 기록 유지.
  - 다른 모양 글 붙여넣기 + [AI로 차시 뽑기](가짜 `{"lessons":[{"week":1,"period":"8.24~8.29","unit":"1. 시","title":"시 읽기","pages":"10~11","memo":""}]}`) → 진도표 고치기 시트에 1줄.
  - AI가 `{"lessons":[]}` → 「이 교과의 차시를 찾지 못했어요. …」.
  - AI가 도는 동안(가짜 응답 1초 지연) 시트를 닫고 다른 교과를 고쳐도, 결과는 시작한 교과 이름으로 들어감.
  - 페이지 오류 없음.
- [ ] **Step 2: 실패 확인** — Run: `node tests/e2e/class-import.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — Run: `node tests/e2e/class-import.mjs && node tests/e2e/class-setup.mjs` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "학급: 시간표·진도표 파일 가져오기, AI로 읽기"`

### Task 6: 오늘 수업 화면

**Files:**
- Create: `web/menus/class/today.js`
- Modify: `web/menus/class/class.css`, `web/index.html`
- Test: `tests/e2e/class-today.mjs`

**Interfaces:**
- Consumes: Task 2·3(`makeCtx`, `dayView`, `setMark`, `missingDays`, `fmtDay`, `fmtShort`, `noClass`), `listEvents`(학사일정), `class:changed` 이벤트.
- Produces: 상자 `.cls-today`; 날짜 `#clsDate`(input date), 버튼 `data-t="prev|today|next"`, 체크 버튼 `button[data-mark="done|part|skip"][data-p="<교시>"]`(`aria-pressed`), 체크 안 한 날 `button[data-go-day="YYYY-MM-DD"]`, 빈 상태 [준비로 가기](`data-t="setup"` → `go('class','progress')`) [예시로 채우기](`data-t="sample"`).
- [ ] **Step 1: 실패하는 화면 시험 쓰기** — `class-today.mjs`(고정 시계 2026-10-29 목):
  - 시간표 없음 → 빈 상태 문구와 두 버튼.
  - 예시 → 목요일 교시들, 국어 줄에 단원·「n/N차시」·학습 주제·쪽수.
  - 1교시 [완료] → 눌린 모양, 진도표·시수 탭 국어 실시 +1; 같은 버튼 다시 → 지워짐.
  - 같은 날 같은 교과 두 시간: 앞 시간 [완료] → 뒤 시간 차시 번호 +1; [일부 진행]이면 그대로.
  - 진도표 없는 교과(예: 영어) 줄은 「진도표 없음」, 버튼 없음.
  - 2026-10-31로 가면 「토요일」, 2026-10-09는 「공휴일(한글날)」.
  - 학사일정(`ssam:calendar`에 그날 일정) 칩이 보임.
  - 체크 안 한 날 버튼이 보이고 누르면 그날로 감.
  - 페이지 오류 없음.
- [ ] **Step 2: 실패 확인** — Run: `node tests/e2e/class-today.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현.** 체크는 그 줄만 다시 그림(다른 줄 입력이 끊기지 않게), 저장 실패 알림.
- [ ] **Step 4: 통과 확인** — Run: `node tests/e2e/class-today.mjs` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "학급: 오늘 수업 체크"`

### Task 7: 주간학습안내 화면 + 알림 AI + 한글 파일·인쇄·복사, 릴리즈 노트

**Files:**
- Create: `web/menus/class/weekly.js`
- Modify: `web/menus/class/class.css`(인쇄용 `@media print`), `web/index.html`, `.github/RELEASE_NOTES.md`(whats-new에 학급 메뉴 한 줄)
- Test: `tests/e2e/class-weekly.mjs`

**Interfaces:**
- Consumes: Task 3(`weekView`, `defaultWeek`, `getWeekly`, `saveWeekly`, `weeklyTitle`, `cellText`, `weeklyDoc`, `normNotes`), `listEvents`, `makeHwpx`, `saveFile`, `copyText`, `ai`.
- Produces: 상자 `.cls-weekly`; 주 이동 `data-w="prev|next"`, 제목 `#clsWTitle`, 학습 칸 `textarea[data-wc="d-p"]`, 알림 칸 `textarea[data-wn="d-key"]`(key: events·prep·homework·notice·safety), 버튼 `data-w="refill|ai|hwpx|print|copy"`. 인쇄되는 상자 `.cls-sheet`.
  - [AI로 쓰기]: `[주간학습안내]` 프롬프트(주 날짜, 요일별 교시·교과·단원·학습 주제, 학사일정, 이미 쓴 칸), 결과는 그 주(월요일)에, **빈 칸만** 채움.
- [ ] **Step 1: 실패하는 화면 시험 쓰기** — `class-weekly.mjs`(고정 시계 2026-10-29 목, 예시 자료):
  - 기본 주가 11/2~11/6, 제목 「3학년 1반 주간학습안내」.
  - 학습 칸에 「국어 · …」가 채워지고, 이번 주에 기록 없는 남은 국어 시간만큼 이어진 차시.
  - 학사일정 줄에 그 주 일정(`ssam:calendar`)이 들어감.
  - 칸을 고치면 저장되고(다시 열어도 남음), [다시 채우기]로 지워짐.
  - [AI로 쓰기](가짜 `{"days":[{"prep":"색연필","safety":"…","homework":"","notice":""},…]}`) → 빈 준비물 칸만 채우고 미리 쓴 칸은 그대로.
  - AI가 도는 동안 다음 주로 옮겨도 결과는 시작한 주에 들어감.
  - [한글 파일] → 「3학년 1반 주간학습안내(11.2~11.6).hwpx」 내려받기, zip 안 `Contents/section0.xml`에 학습 칸 글.
  - [복사] → 클립보드에 요일별 글.
  - [인쇄]는 `window.print`를 부름(시험에서는 가짜 함수로 확인).
  - 360px 폭 가로 스크롤 없음, 페이지 오류 없음.
- [ ] **Step 2: 실패 확인** — Run: `node tests/e2e/class-weekly.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run e2e` / Expected: 모두 통과(기존 화면 시험 포함).
- [ ] **Step 5: Commit** — `git commit -m "학급: 주간학습안내(학습 표·요일별 알림·한글 파일·인쇄)"`
