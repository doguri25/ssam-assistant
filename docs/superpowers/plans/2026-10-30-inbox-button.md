# 떠 있는 버튼(아무 파일이나 넣으면 알아서) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, chosen by the user: 「이대로, 끝까지」). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 늘 떠 있는 버튼에 아무 파일이나 넣으면 AI 없이 종류를 판단하고, 확인 카드(또는 바로 실행) 뒤 그 메뉴의 기능(채점·새 단원평가·계획 초안·진도표·명단·품의·설문)을 실행한다.

**Architecture:** 판단은 순수 함수 `core/inbox-classify.js`, 받기·카드·설정·웹 버튼은 `core/inbox.js`. 각 메뉴 모듈이 `registerInbox(kind, handler)`로 자기 파일 읽기 함수를 등록하고, 옛 평가 화면은 `SSAM.inbox`를 내놓는다. Windows 앱은 `bubble` 창이 끌어 놓은 경로만 Rust에 넘기고, main 창이 `inbox:files`를 받아 같은 길로 처리.

**Tech Stack:** 정적 ES 모듈, Tauri 2(Rust), node --test, Playwright e2e.

**Spec:** docs/superpowers/specs/2026-10-30-inbox-button-design.md

## Global Constraints

- 종류 판단은 AI 없이(파일 글은 판단을 위해 AI로 보내지 않음). 사진·스캔 PDF는 이름으로만(정답→정답지, 견적→견적서, 그 밖은 답안 스캔).
- 설정 키 `ssam:inbox`(기본 `{ on: true, mode: 'confirm', plan: 'draft', keepOnClose: true, autostart: false }`), 버튼 위치 `ssam:bubble` — 둘 다 years.js `GLOBAL`.
- Windows: 끌어 놓은 경로만 읽음, 한 파일 60MB까지.
- 화면 글은 한국어(선생님 말투). 학생 이름 저장·AI 전송 금지는 그대로.
- 커밋 끝 두 줄(Co-Authored-By, Claude-Session).

## Review Focus

1. 카드가 떠 있는 동안 또 놓거나 같은 파일을 두 번 놓으면: 줄 세워 차례로, 겹쳐 실행하지 않음 → Task 2 시험.
2. 다른 메뉴의 끌어 놓기 칸(평가지 채점 `#grDrop`, 창체 시트 칸)에 놓은 파일은 그 칸이 받고, 창체 모드가 문서 전체에서 끌어 놓기를 막아도 버튼 판은 받음 → Task 2 시험.
3. 읽을 수 없는 파일(.docx, 암호 걸린 한글): 카드에 까닭을 보이고 아무 메뉴도 바꾸지 않음 → Task 2 시험.
4. AI 키 없이 계획 「초안까지」: 자료로만 넣고 「AI를 정하면 초안을 써요」 안내 → Task 4 시험.
5. 답안 스캔인데 정답지 넣은 단원평가가 없음 → 평가지 채점으로, 평가지 채점이 채점 중이면 안내만 → Task 3 시험.

---

### Task 1: 종류 판단 (core/inbox-classify.js)

**Files:** Create `web/core/inbox-classify.js`; Test `tests/unit/inbox-classify.test.mjs` (기존 시험 자료 재사용 + 짧은 지어낸 글).

**Produces:**
- `KINDS: [kind, label, verb][]` 차례 = 실행 차례: `unit-key 단원평가 정답지`, `unit-paper 단원평가 문제지`, `unit-scan 학생 답안 스캔`, `eval-plan 교과 평가계획`, `class-plan 작년 학급운영계획`, `event-plan 작년 행사 계획`, `year-plan 작년 업무 계획`, `guide 올해 지침·공문`, `jindo 진도표`, `timetable 기초시간표`, `roster 학급 명단`, `quote 견적서`, `survey 설문 응답`, `unknown 모르는 파일`.
- `classify({ name, text, scan }) → { kind, why, alts }` — `scan`: 사진이거나 글 없는 PDF. 점수가 4 미만이면 `unknown`. `alts`는 점수 있는 다른 종류(높은 차례).
- `groupFiles(list: {file, kind}[]) → { kind, files }[]` — 같은 종류는 묶고 `KINDS` 차례로.

- [ ] 시험: 15가지 — `unit-key.txt`·`unit-key-inline.txt`·`unit-combined.txt` → unit-key; `unit-paper.txt`·`unit-paper-inline.txt` → unit-paper; `{name:'3반 답안.pdf', scan:true}` → unit-scan, `{name:'정답지.jpg', scan:true}` → unit-key, `{name:'견적서.png', scan:true}` → quote; 성취기준·평가 요소·상중하 표 글 → eval-plan; `classplan-last.txt` → class-plan; 「2026 가을 운동회 운영 계획」 글 → event-plan; 「독서교육 운영 계획 … 목적·방침·세부 추진 계획·예산」 → year-plan; 「수신 … 발신 … 교육지원청 … 지침」 → guide; `jindo-sample.txt` → jindo; `timetable-sample.txt` → timetable; `roster-sample.csv` 글 → roster; 「견 적 서 … 품명 | 규격 | 수량 | 단가」 → quote; `survey-12.csv` → survey; 「안녕하세요」 → unknown. `why`가 빈 글이 아님. `groupFiles` 차례·묶기.
- [ ] 구현 → 통과 → 커밋.

### Task 2: 받는 곳·확인 카드·설정·웹 버튼 (core/inbox.js)

**Files:** Create `web/core/inbox.js`, `web/core/inbox.css`; Modify `web/index.html`, `web/core/years.js`(GLOBAL에 `inbox`·`bubble`), `web/menus/settings/settings.js`(화면 탭에 「떠 있는 버튼」 카드); Test `tests/e2e/inbox.mjs`, `tests/unit/years.test.mjs`(GLOBAL).

**Consumes:** Task 1. `go(menu, tab)` (core/shell.js), `SSAM.openSheet/closeSheet/toast`, `readText`·`fileMessage` (core/files.js).

**Produces:**
- `registerInbox(kind, handler)`, handler = `{ act(files): string, fields?(files): Field[], run(files, values, opts): Promise<string|void> }`; `Field = { key, label, type: 'text'|'date'|'number'|'select', options?: [value,label][], value?, required? }`; `opts = { plan: 'draft'|'open' }`; `run`이 돌려준 글은 알림(toast).
- `receive(files: File[])` — 읽기(글 → `text`, 이미지·`PDF_NO_TEXT` → `scan`, 그 밖의 읽기 실패 → 카드에 까닭) → 판단 → 묶기 → 묶음마다 카드(설정 `mode`가 `direct`이고 모자란 필수 값이 없고 `unknown`이 아니면 카드 없이) → 실행. 받는 중이면 뒤에 줄 세움.
- `getInboxSettings()`, `setInboxSettings(patch)` (`ssam:inbox`), 바뀌면 `document` 이벤트 `inbox:settings`.
- 웹 버튼 `#inboxFab`(오른쪽 아래, 누르면 파일 고르기 `multiple`), 파일을 끌고 오면 `#inboxPad`(「여기에 놓으면 쌤비서가 알아서 해요」); 버튼·판은 끌어 놓기 이벤트를 자기가 받고 더 퍼뜨리지 않음.

- [ ] 시험(e2e, 시험용 handler를 page에서 등록): 버튼 보임 · 파일 고르기로 `roster-sample.csv` → 카드에 「학급 명단」·까닭·할 일 → [실행]이 handler 부름 · [다른 것으로]에서 종류를 바꾸면 그 handler · `unknown`은 고르기 전 [실행] 못 누름 · 필수 칸 비우면 실행 안 됨 · `mode: direct`면 카드 없이 · 카드가 떠 있는 동안 또 넣으면 앞 것 끝난 뒤 다음 카드(Review 1) · `.docx`는 까닭만(Review 3) · 평가지 채점 탭 `#grDrop`에 놓은 파일은 그 칸이 받고 판이 안 받음, 창체 모드에서도 판은 받음(Review 2) · 설정 카드 값이 저장되고 다시 열어도 남음.
- [ ] 구현 → 통과 → 커밋.

### Task 3: 평가 — 정답지·문제지·답안 스캔·교과 평가계획

**Files:** Modify `web/menus/evaluate/unit/unit.js`, `web/menus/evaluate/unit/unit-grading.js`, `web/menus/evaluate/evaluate.js`(`SSAM.inbox = { evalPlan(file), grPages(files), grBusy() }`), `web/core/inbox.js`(eval-plan·스캔 대체 등록); Test `tests/e2e/inbox-eval.mjs`.

**Consumes:** Task 2 `registerInbox`; unit.js `loadKey`·`loadPaper`·`U`·`render`·`openTest`·`newTest`; unit-grading.js `loadAnswers`·`startGrading`; evaluate.js `importFile`·`grAddPages`.

- [ ] 시험: 정답지 파일 → 새 단원평가(문항 수), 합본이면 평가지도 · 문제지만 → 평가지 없는 최근 단원평가에 · 답안 사진 2장 → 카드에 정답지 넣은 단원평가 고르기(최근 것이 먼저) → 답안 넣고 채점 시작(가짜 AI, 학생 1명) · 단원평가가 없으면 평가지 채점 탭에 사진이 들어감, 채점 중이면 안내만(Review 5) · 교과 평가계획 → 교과 평어에 계획이 바뀜.
- [ ] 구현 → 통과 → 커밋.

### Task 4: 계획 — 연간·행사·학급운영·지침·설문

**Files:** Modify `web/menus/plan/year.js`, `web/menus/plan/event.js`, `web/menus/plan/classplan.js`; Test `tests/e2e/inbox-plan.mjs`.

**Consumes:** Task 2. 각 모듈의 `newPlan`/`newEvent`, `addFiles`/`addRef`, `goStep`, `runDraft`/`runOptions`, `addCsv`, `persist`.

- [ ] 시험: 작년 학급운영계획 → 새 계획(학년·반은 학급 정보) → 초안 프롬프트 1번 · 연간계획 → 입력 칸 업무명·목표 → 초안 · 행사 → 입력 칸 행사명·대상·날짜·장소 → 구성안 · `plan: open`이면 AI 없이 1단계 · AI 키가 없으면 자료로만 + 안내(Review 4) · 지침 → 「어느 계획에」 고르기(연간·행사·학급운영 지금 계획/새로) → 그 계획 지침에 · 설문 CSV → 행사 고르기 → 결과(가짜 AI).
- [ ] 구현 → 통과 → 커밋.

### Task 5: 학급·명단·견적서

**Files:** Modify `web/menus/class/setup.js`, `web/menus/settings/settings.js`, `web/menus/purchase/purchase.js`(견적서 읽기 + 화면 [견적서 넣기]); Create `web/menus/purchase/quote.js`(`readQuote(file) → {items, by:'table'|'ai'}`, `quotePrompt()`); Test `tests/unit/quote.test.mjs`, `tests/e2e/inbox-class.mjs`, `tests/fixtures/quote.csv`.

- [ ] 시험: 진도표 → 교과 고르기 창 · 시간표 → 학년·반 없으면 입력 칸 → 시간표 들어감 · 명단 CSV → 명단 확인 창 → 학생 수 · 견적서 CSV → 새 품의 품목 3줄(AI 없음), 사진 견적서 → AI 1번 → 품목 · 품의 화면 [견적서 넣기]도 같은 결과 · `readQuote` 표 읽기(합계·부가세 줄 뺌).
- [ ] 구현 → 통과 → 커밋.

### Task 6: Windows 버튼 창

**Files:** Create `web/bubble.html`, `web/bubble.js`, `web/bubble.css`, `src-tauri/src/bubble.rs`, `src-tauri/capabilities/bubble.json`; Modify `src-tauri/src/main.rs`, `src-tauri/tauri.conf.json`(`bubble` 창), `src-tauri/Cargo.toml`(`tauri-plugin-single-instance`, `tauri-plugin-autostart`), `web/core/inbox.js`(Tauri: `inbox:files` 듣기 → `inbox_read`로 바이트 → `receive`; 설정이 바뀌면 `bubble_config`; 버튼 창이 켜져 있으면 웹 버튼 숨김), `scripts/copy-web.mjs`(bubble 파일 포함 확인); Test `tests/e2e/inbox-bridge.mjs`(가짜 `__TAURI__`로 다리 시험), Actions 빌드(릴리즈 없이).

- [ ] 시험: 가짜 `__TAURI__` — `inbox:files` 이벤트 → `inbox_read` 부름 → 카드 · 설정 바꾸면 `bubble_config` 부름 · 버튼 창 켜짐이면 `#inboxFab` 숨김. 버튼 창 화면(bubble.html)은 브라우저에서 열려 오류 없음.
- [ ] 구현(Rust: `bubble_config`·`inbox_take`·`inbox_read`·`bubble_action`, main 닫기 → 숨김, `--bubble` 인수, single-instance → main 앞으로) → 시험 통과 → 커밋 → Actions 「Windows 앱 빌드·릴리즈」 `release: false`로 빌드 확인.

### Task 7: 문서·전체 시험

**Files:** Modify `README.md`, `docs/PRD.md`, `.github/RELEASE_NOTES.md`; Test 390px(`inbox.mjs`), 전체 `npm test`, `npm run e2e`.

- [ ] README 시연 순서·PRD(새 절 「떠 있는 버튼」)·릴리즈 노트 whats-new, Windows 사람 확인 목록 → 전체 시험 → 커밋.
