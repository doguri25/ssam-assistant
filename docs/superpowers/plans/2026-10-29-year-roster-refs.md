# 쌤비서 계획 6 · 학년도·명단 엑셀·행사 참고 자료 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정의 학급 명단을 엑셀로 넣고, 학년도를 백업 파일·앱 안 보관함으로 넘나들며, 행사계획이 상위 계획·교육청 공문을 참고하게 하고, 학급 메뉴의 남은 거친 곳과 문서를 다듬는다.

**Architecture:** 계산은 DOM 없는 모듈(`core/roster.js`, `core/years.js`, `event-model.js`의 refs)로 쓰고 Node로 시험한다. 학년도는 「지금 학년도는 기존 `ssam:` 키 그대로, 다른 학년도는 IndexedDB 보관함」으로 해서 기존 화면 코드를 바꾸지 않는다. 옮길 때는 모든 저장을 멈추고 → 보관 → 바꿔 쓰기 → 다시 연다.

**Tech Stack:** 계획 1~5와 같음. 새 라이브러리 없음. IndexedDB(브라우저 기본).

**Spec:** `docs/superpowers/specs/2026-10-29-year-roster-refs-design.md`

## Global Constraints
- 계획 1~5의 Global Constraints를 따른다.
- 명단 엑셀은 **번호만** 저장한다. 이름·생년월일 등은 저장하지도 AI에 보내지도 않는다.
- 공통 키(학년도와 상관없음): `engine`, `theme`, `nav`, `mode`, `updSkip`, `years`, `t`, 그리고 `mig:`로 시작하는 키. 나머지 `ssam:` 키는 모두 학년도마다 따로.
- 백업 파일에는 공통 키와 AI 키(`engine`)를 넣지 않는다. 모양: `{ app: 'ssam', kind: 'backup', version: 1, createdAt, current, years: { '<학년도>': { '<키(ssam: 뺀 것)>': '<저장된 글 그대로>' } } }`.
- 학년도 = 3월~다음 해 2월(`schoolYearOf`).
- 행사 참고 자료 종류: `upper` 상위 계획 · `official` 교육청 공문 · `other` 기타. 한 행사의 참고 자료 글은 합쳐 60,000자까지, AI에는 합쳐 24,000자까지.
- 안내 문구는 스펙의 글을 그대로 쓴다.

## Review Focus
1. **학년도를 옮기는 중 다른 저장이 끼어듦**(평가 메뉴의 0.5초 뒤 저장, 학급·계획 화면의 저장): 옮긴 학년도에 지난 학년도 자료가 섞이지 않는다. → Task 2 시험(멈춘 동안 `set`은 false), Task 3 화면 시험(행특 자료를 만든 직후 학년도 옮기기).
2. **보관함 쓰기 실패**(IndexedDB 막힘·공간 부족): 지금 자료가 하나도 바뀌지 않고 「보관하지 못했어요. 지금 자료는 그대로예요」. → Task 2 시험.
3. **다른 앱의 JSON·망가진 백업 파일·다른 버전**: 「쌤비서 백업 파일이 아니에요」, 아무것도 바뀌지 않음. → Task 2 시험.
4. **나이스 명렬표 모양 변화**(위에 학교명·제목 줄, 「번 호」처럼 띄어 쓴 머리, 중간 빈 줄, 「전출」 표시가 비고 칸에): 번호와 예외 번호가 맞게 나온다. → Task 1 시험.
5. **참고 자료가 아주 길거나 많음**(공문 PDF 여러 개): 저장은 6만 자까지, AI에는 2만 4천 자 안에서 자료마다 고르게 줄여 보내고, 화면이 깨지지 않는다. → Task 4 시험.

---

### Task 1: 학급 명단 엑셀·CSV 가져오기 (번호만)

**Files:**
- Create: `web/core/roster.js`, `tests/unit/roster.test.mjs`, `tests/fixtures/roster-sample.csv`(지어낸 명렬표), `tests/e2e/roster-import.mjs`
- Modify: `web/menus/settings/settings.js`(명단 카드에 버튼·미리 보기), `web/menus/evaluate/evaluate.js`(`window.SSAM`에 `setClass(count, except)` 내보내기)

**Interfaces:**
- Consumes: `readTable(name, u8)`(core/sheet.js), 평가 메뉴의 `setClass(count, except, from)`.
- Produces: `parseRoster(rows: string[][]) -> { count: number, except: number[], nos: number[] } | null` — 위 15줄 안에서 띄어쓰기를 뺀 칸이 「번호」인 머리를 찾고 그 열의 1~60 정수를 번호로; 머리에 「학적·변동·비고·상태」가 든 칸이 있으면 그 칸에 「전출·전학·자퇴·제적·면제·유예」가 있는 번호는 예외; 1~최대 번호 중 없는 번호도 예외; 머리가 없거나 번호가 하나도 없으면 null. `SSAM.setClass(count, except)`.
- [ ] **Step 1: 실패하는 시험 쓰기** — `roster.test.mjs`: 위에 「OO초등학교」·「3학년 2반 명렬표」 두 줄, 머리 `['번 호','성명','성별','학적변동']`, 1~25번 중 7번 없음, 20번 비고 「전출」, 중간 빈 줄 → `{ count: 25, except: [7, 20] }`; 머리가 2행·번호 열이 셋째 칸이어도 됨; 번호 머리 없음 → null; 이름 칸 값이 결과 어디에도 없음(`JSON.stringify(r)`에 이름이 없음).
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/unit/roster.test.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현** — `core/roster.js`.
- [ ] **Step 4: 화면 시험 쓰기** — `roster-import.mjs`: 설정 › 학급 명단 [엑셀·CSV에서 가져오기] → `roster-sample.csv` → 미리 보기 「학생 25명 · 예외 번호 7, 20」 → [넣기](`#rosterOk`) → 명단 칸 학생 수 25·예외 「7, 20」, `ssam:class`에 이름 없음; `.xls` 파일 → 「엑셀에서 .xlsx로 다시 저장해 주세요」; 번호 없는 CSV → 「번호 칸을 찾지 못했어요. 첫 줄에 「번호」가 있는 명렬표인지 확인해 주세요」; 페이지 오류 없음.
- [ ] **Step 5: 실패 확인 → 구현(설정 화면) → 통과** — Run: `node tests/e2e/roster-import.mjs && npm test` / Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "설정: 학급 명단을 엑셀·CSV에서 가져오기(번호만)"`

### Task 2: 학년도 모델 — 키 나누기·백업·가져가기·옮기기, 보관함, 저장 멈춤

**Files:**
- Create: `web/core/years.js`, `web/core/archive.js`, `tests/unit/years.test.mjs`
- Modify: `web/core/store.js`(멈춤), `web/core/calendar.js`(`schoolYearOf` 옮김), `web/menus/class/class-import.js`(`schoolYearOf`를 calendar에서 다시 내보냄)

**Interfaces:**
- Consumes: localStorage 같은 것(`getItem/setItem/removeItem/key/length`).
- Produces:
  - `calendar.js`: `schoolYearOf(date) -> number`(class-import는 `export { schoolYearOf } from '../../core/calendar.js'`).
  - `store.js`: `freeze()`, `unfreeze()` — 멈춘 동안 `set`은 쓰지 않고 false.
  - `archive.js`: `Archive = { put(year, snap) -> Promise, get(year) -> Promise<snap|null>, del(year) -> Promise, list() -> Promise<{ year, savedAt, size }[]> }`, `openArchive() -> Archive`(IndexedDB `ssam-archive`/`years`), `memArchive() -> Archive`(시험용).
  - `years.js`: `GLOBAL`(공통 키 목록), `isYearKey(key) -> boolean`(키는 `ssam:` 뺀 것), `getYears(ls, today) -> { current }`(없으면 `schoolYearOf(today)`), `snapshot(ls) -> { [key]: string }`, `carryOver(snap, newYear) -> snap`(`yearplans`·`yearplan:current`·`events`·`event:current` 그대로, `calendar`는 `${newYear}-03-01` 이후 날짜만, `school`은 `{ name, classes, students, breaks: [] }`, 나머지는 버림), `makeBackup({ current, snap, archives: { [year]: snap } }, now) -> object`, `parseBackup(text) -> { current, years }`(틀리면 `{ code: 'NOT_BACKUP' }`를 던짐), `async moveTo(target, { ls, archive, freeze, unfreeze, data, today }) -> { ok: true } | { ok: false, code: 'ARCHIVE_FAILED' }`(스펙 2.3 순서; `data`가 없으면 보관함의 그 학년도, 그것도 없으면 빈 자료).
- [ ] **Step 1: 실패하는 시험 쓰기** — `years.test.mjs`(mem 저장소·memArchive):
  - `isYearKey`: `class:log`·`hk`·`school`·`yearplans` 참, `engine`·`theme`·`nav`·`mode`·`years`·`mig:fable` 거짓.
  - `snapshot`: `ssam:` 아닌 키와 공통 키는 빠지고 값은 저장된 글 그대로.
  - `carryOver(snap, 2027)`: `class:subjects`·`hk` 없음, `yearplans` 그대로, `calendar`는 `2027-02-27` 빠지고 `2027-03-02` 남음, `school`에 `year`·방학 없음.
  - `makeBackup` → `parseBackup(JSON.stringify(b))` 되돌림이 같음; `engine` 키는 백업에 없음; `parseBackup('{"a":1}')`·`'x'`·version 2 → `NOT_BACKUP`.
  - `moveTo(2027, { data: carryOver(...) })`: 끝나면 `ssam:class:log` 없음, `ssam:yearplans` 그대로, `ssam:engine` 그대로, `ssam:years` current 2027, 보관함에 2026 묶음; 다시 `moveTo(2026)` → 2026 자료가 그대로 돌아옴.
  - 보관함 `put`이 실패하면 `{ ok: false, code: 'ARCHIVE_FAILED' }`이고 저장소가 하나도 안 바뀜, `unfreeze`를 부름.
  - `store.freeze()` 동안 `store.set` → false, `unfreeze()` 뒤 true.
  - `schoolYearOf`는 calendar·class-import 둘 다에서 같은 답.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/unit/years.test.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "학년도: 키 나누기·백업 파일·가져가기·옮기기, 보관함"`

### Task 3: 학년도 화면 (설정 › 학년도, 옆 메뉴 학년도 표시)

**Files:**
- Modify: `web/core/shell.js`(설정 탭에 `['years','학년도']`를 「학교 정보」 다음에, 옆 메뉴 학년도 표시 `#sideYear`), `web/index.html`(`#sideYear` 버튼), `web/core/shell.css`, `web/menus/settings/settings.js`·`settings.css`(학년도 화면, 학교 정보의 「계획 학년도」), `web/menus/evaluate/evaluate.js`(`SSAM.freeze(on)` → `S.wiping`)
- Test: `tests/e2e/years.mjs`

**Interfaces:**
- Consumes: Task 2 전부, `saveFile`, `toast`, `SSAM.openSheet/closeSheet`.
- Produces: 설정 › 학년도 화면 요소: `[data-set="backup"]`, `[data-set="restore"]` + `#backupFile`, 학년도 줄 `[data-yr="<학년도>"]` 안 `[data-set="goYear"]`·`[data-set="delYear"]`, `[data-set="newYear"]`; 시트 버튼 `#yrNewOk`·`#yrGoOk`·`#yrDelOk`·`#yrRestoreOk`, 불러오기 학년도 체크 `input[data-ry="<학년도>"]`. 옮기기가 끝나면 `location.reload()`.
- [ ] **Step 1: 실패하는 화면 시험 쓰기** — `years.mjs`(고정 시계 2026-10-29, `ssam:engine`에 가짜 키):
  - 옆 메뉴에 「2026학년도」, 누르면 설정 › 학년도.
  - 학급 예시 채우기 + 연간계획 하나 저장 + 행특 학생 하나(`ssam:hk`).
  - [백업 파일 만들기] → 내려받은 JSON의 `years['2026']`에 `class:subjects`·`yearplans`·`hk`가 있고 `engine` 없음.
  - [2027학년도 시작하기] → 확인 시트 → `#yrNewOk` → 다시 열림 → 옆 메뉴 「2027학년도」, 학급 진도표·시수는 비어 있음, 연간계획 목록에 그 계획이 있음, `ssam:hk` 없음, `ssam:engine` 그대로.
  - 학년도 목록 2026 [이 학년도로 가기] → `#yrGoOk` → 「2026학년도」, 학급 요약 줄이 돌아옴, `ssam:hk` 돌아옴.
  - 2027 [지우기] → `#yrDelOk` → 목록에서 빠짐.
  - [백업 파일 불러오기]에 앞의 백업 파일 → 체크 2026(지금) → `#yrRestoreOk` → 다시 열림 → 자료 그대로.
  - 다른 JSON 파일 → 「쌤비서 백업 파일이 아니에요」.
  - 설정 › 학교 정보에 「계획 학년도」.
  - 페이지 오류 없음.
- [ ] **Step 2: 실패 확인** — Run: `node tests/e2e/years.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — Run: `node tests/e2e/years.mjs && node tests/e2e/settings.mjs && node tests/e2e/shell.mjs && npm test` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "학년도: 설정 › 학년도(백업·불러오기·오가기·새 학년도), 옆 메뉴 표시"`

### Task 4: 행사 참고 자료 모델

**Files:**
- Modify: `web/menus/plan/event-model.js`, `tests/unit/event-model.test.mjs`

**Interfaces:**
- Produces: `REF_KINDS = [['upper','상위 계획'],['official','교육청 공문'],['other','기타']]`, `Ref = { id, kind, name, text }`, `Event.refs: Ref[]`, `Event.refNotes: { options: string[], docs: string[] }`, `normRefs(v) -> Ref[]`(10개까지, 글은 앞에서부터 합쳐 60,000자까지, 빈 글은 버림), `guessKind(fileName) -> kind`, `refsBlock(refs, budget = 24000) -> string`(없으면 `''`; 자료마다 `budget / 개수`까지, 남는 몫은 다음 자료에; 머리 `[상위 계획] 이름`), `normRefNotes(v) -> string[]`(문자열 8개까지, 200자까지).
- [ ] **Step 1: 실패하는 시험 쓰기** — 정규화(종류 틀림 → `other`, 11개 → 10개, 합쳐 7만 자 → 6만 자에서 자름), `guessKind('2027 학교폭력예방 교육청 공문.hwp') === 'official'`, `guessKind('학교 교육계획.hwpx') === 'upper'`, `refsBlock`(짧은 자료 + 긴 자료 → 짧은 것은 다 들어가고 긴 것은 남은 몫까지, 전체 길이 ≤ 24,000 + 머리 글), 저장한 행사에 `refs`가 남음, 망가진 `refs`(`'x'`) → `[]`.
- [ ] **Step 2: 실패 확인** — Run: `node --test tests/unit/event-model.test.mjs` / Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "행사계획: 참고 자료 모델"`

### Task 5: 행사 참고 자료 화면 + AI에 함께 보내기

**Files:**
- Modify: `web/menus/plan/event.js`, `web/menus/plan/event.css`
- Test: `tests/e2e/event-refs.mjs`

**Interfaces:**
- Consumes: Task 4, `listPlans`·`planText`(year-model), `readText`·`fileMessage`.
- Produces: 1단계 카드 요소: `[data-e="refPlan"]`(연간계획 목록 `[data-refplan="<id>"]`), `[data-e="refFile"]` + `#evRefFile`, `[data-e="refPaste"]`(시트 `#evRefKind`·`#evRefName`·`#evRefText`·`#evRefOk`), 줄 `[data-ref="<id>"]` 안 `select[data-refkind]`·`[data-e="refView"]`·`[data-e="refDel"]`. 구성안·문서 프롬프트에 `refsBlock`과 refNotes 규칙. 2·3단계 위 `.ev-refnotes`.
- [ ] **Step 1: 실패하는 화면 시험 쓰기** — `event-refs.mjs`: 붙여넣기(교육청 공문, 「참가 대상: 3~6학년, 안전요원 2명 이상」) → 목록 1줄; 연간계획 하나 저장 후 [연간계획에서 불러오기] → 상위 계획 1줄; 파일 넣기(한글 샘플) → 기타 또는 상위 계획 1줄; [구성안 만들기] → 가짜 AI 프롬프트에 「[교육청 공문]」과 「안전요원 2명 이상」, 답의 `refNotes` → 2단계 「참고 자료에서 반영한 것」에 보임; 문서 만들기도 같음; 확정한 행사에서 참고 자료를 빼면 「작성 중」; AI가 도는 동안 다른 행사로 가도 refNotes가 시작한 행사에; 페이지 오류 없음.
- [ ] **Step 2: 실패 확인 → 구현 → 통과** — Run: `node tests/e2e/event-refs.mjs && node tests/e2e/event-plan.mjs && node tests/e2e/event-plan-fixes.mjs` / Expected: PASS.
- [ ] **Step 3: Commit** — `git commit -m "행사계획: 상위 계획·교육청 공문 참고 자료"`

### Task 6: 학급 다듬기 + 문서

**Files:**
- Modify: `web/menus/class/class-import.js`(차시 칸 `no` 저장), `class-model.js`(`no` 정규화, `unitPos`, 시간표 7교시까지 저장, 학사일정 칸 `null`=자동), `today.js`(단원 차시), `weekly.js`(학사일정 비우기), `class-sample.js`(오늘이 든 학기), `scripts/make-samples.mjs`(고정 날짜), 시험 파일들, `README.md`, `docs/PRD.md`, `.github/RELEASE_NOTES.md`
- Test: `tests/unit/class-import.test.mjs`, `tests/unit/class-model.test.mjs`, `tests/e2e/class-*.mjs`

**Interfaces:**
- Produces: `Lesson.no: string`(파일의 「5/14」, 없으면 `''`), `unitPos(sub, i) -> { n, of }`(`no`가 있으면 그것, 없으면 같은 단원이 이어지는 줄에서 셈), `Timetable.cells`는 늘 5×7(보이는 줄은 `periods`), `Weekly.notes[d].events: string|null`(null = 자동), `sampleData(today)`는 3~7월이면 1학기(`mondayOf(Y-03-02)`), 그 밖에는 2학기(`mondayOf(Y-08-24)`), `sampleJindoDoc(today = '2026-10-29')`.
- [ ] **Step 1: 실패하는 시험 쓰기** — `parseJindo` 줄에 `no`(◈ 줄은 「1/2」); `unitPos` 두 방식; 교시 수 6→4→6이면 5·6교시 칸이 돌아옴; 학사일정 칸을 `''`로 고치면 자동 일정이 안 나옴(`null`이면 나옴); 오늘 수업 줄에 「n/N차시」가 단원 안 번호; 고정 시계 2027-04-15에서 예시의 시작이 2027-03-02 주.
- [ ] **Step 2: 실패 확인 → 구현 → 통과** — Run: `npm test && node tests/e2e/class-today.mjs && node tests/e2e/class-weekly.mjs && node tests/e2e/class-setup.mjs && node tests/e2e/class-import.mjs` / Expected: PASS.
- [ ] **Step 3: 문서** — README(심사용: 한 줄 소개, 메뉴별로 되는 일, 웹·Windows로 써 보기, `samples/`로 시연하는 순서 — 학급 예시·진도표 예시·품의 예시, 개인정보·AI 요청 방식), PRD 5.6을 「동작」으로·설정에 학년도·명단 엑셀·행사 참고 자료 반영, 릴리즈 노트 whats-new에 이번 기능.
- [ ] **Step 4: 전체 확인** — Run: `npm test && npm run e2e` / Expected: 모두 통과.
- [ ] **Step 5: Commit** — `git commit -m "학급 다듬기(단원 차시·교시 칸 남기기·학사일정 칸 비우기·예시 학기), README·PRD"`
