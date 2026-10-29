# 계획 › 학급운영계획 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, chosen by the user). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 계획 메뉴에 「학급운영계획」 탭: 작년 계획서 목차 그대로 올해 초안, 올해 지침 점검, 진도표·평가계획 첨부를 읽어 표로 반영, 진도표는 학급 메뉴에도, 한글 파일로 내보내기.

**Architecture:** 연간계획(year.js/year-model.js)과 같은 짜임의 새 모듈 `web/menus/plan/classplan*.js`. 읽기·판정은 AI 없는 순수 함수(classplan-model.js), 프롬프트는 classplan-ai.js, 화면은 classplan.js. 개인정보 규칙은 core/privacy.js로 모아 설문과 함께 씀.

**Tech Stack:** 정적 ES 모듈, node --test, Playwright e2e.

**Spec:** docs/superpowers/specs/2026-10-29-class-plan-design.md

## Global Constraints

- 학생 이름은 저장·AI 전송 금지. 실제 학교 파일은 저장소에 넣지 않음(예시는 지어낸 자료).
- 키 `ssam:classplans`, `ssam:classplan:current`; 자료 글 60,000자까지; 칸별 작년 글 1,500자까지.
- 프롬프트 표지: `[학급운영계획 지침]`, `[학급운영계획 초안]`, `[평가계획 읽기]`.
- 커밋 끝 두 줄(Co-Authored-By, Claude-Session). 답은 한국어.

## Review Focus

1. 작년 파일에 표 안 단원명(「2. 또박또박 말해요 | …」)·차례 한 줄이 섞여도 목차가 깨지지 않음 → Task 2 시험.
2. 작년 계획서의 담임 명단·학생 명단·전화번호가 AI로 가지 않음 → Task 1·5 시험.
3. AI가 모르는 칸 id나 빈 글을 돌려주면 그 칸은 비워 두고 다른 칸은 들어감 → Task 2 시험.
4. 초안을 쓰는 동안 다른 계획으로 가도 결과는 시작한 계획에 → Task 5 시험.
5. 진도표 첨부에 연간지도계획 표가 없으면 시수표 대신 안내, 학급 메뉴로 넣기 버튼 없음 → Task 6 시험.

---

### Task 1: 개인정보 줄 빼기 (core/privacy.js)

**Files:** Create `web/core/privacy.js`; Modify `web/core/survey.js`; Test `tests/unit/privacy.test.mjs`.

**Produces:** `looksLikeName(s): boolean`, `stripNames(text): { text, dropped }` — 이름 모양 칸이 3개 이상인 줄, 전화번호가 든 줄을 뺌. survey.js의 성씨 규칙은 privacy.js를 씀.

- [ ] 시험: 「담임명 | 김가람 | 이나래 | 박다솜」, 「010-1234-5678」 줄은 빠지고 dropped 2; 「국어 | 수학 | 사회」, 「1. 학급 실태」는 남음; survey 시험 그대로 통과.
- [ ] 구현 → 시험 통과 → 커밋.

### Task 2: 학급운영계획 모델 (classplan-model.js)

**Files:** Create `web/menus/plan/classplan-model.js`; Modify `web/core/years.js`(carryOver), `web/menus/plan/year-model.js`(overlap이 글도 받음); Test `tests/unit/classplan-model.test.mjs`, fixture `tests/fixtures/classplan-last.txt`(지어낸 작년 계획서).

**Produces:**
- `STANDARD`(표준 목차), `parseOutline(text) → [{id,title,level,role}]`, `sectionBodies(text, outline) → {id: 글}`, `roleOf(title) → 'hours'|'eval'|'monthly'|''`, `attachKind(name, text) → 'jindo'|'eval'|'other'`.
- `newPlan()`, `listPlans()`, `getPlan(id)`, `savePlan(p)`(실패 null), `deletePlan(id)`, `currentId()`, `setCurrent(id)`.
- `normSections(v, outline)`, `normMonthly(v)`, `normEvalRows(v)`, `normGuide(v, outline)`, `guideStatus(items, draft)`, `insertSentence(draft, id, s)`, `hoursRows(attach)`, `planDoc(plan)`, `planText(plan)`, `planTitle(plan)`.
- carryOver가 `classplans`·`classplan:current`를 가져감.

- [ ] 시험: fixture에서 목차(로마 숫자·숫자, 표 줄·차례 줄 제외), 로마 숫자 없는 글(1./가.), 표준 목차가 평가양식 항목 8개를 덮음, 칸별 작년 글·1,500자, 역할 3종, 첨부 종류, 저장·목록·실패, 초안 다듬기(모르는 id 무시), 평가 줄 다듬기, 지침 판정(칸별), 시수표, 한글 문서(제목·표·붙임), carryOver.
- [ ] 구현 → 통과 → 커밋.

### Task 3: AI 프롬프트 (classplan-ai.js)

**Files:** Create `web/menus/plan/classplan-ai.js`; Test `tests/unit/classplan-ai.test.mjs`.

**Produces:** `guidePrompt(plan)`, `draftPrompt(plan, { bodies, hours })`, `evalPrompt(text)`.

- [ ] 시험: 표지, 칸 id·이름·작년 글, 학생 수 숫자, 지침 항목, 시수 요약, 출력 모양; 이름·전화가 든 줄은 프롬프트에 없음.
- [ ] 구현 → 통과 → 커밋.

### Task 4: 탭·1단계·2단계 화면 (classplan.js)

**Files:** Create `web/menus/plan/classplan.js`, `web/menus/plan/classplan.css`; Modify `web/core/shell.js`(탭 `['class','학급운영계획']`), `web/index.html`; Test `tests/e2e/class-plan.mjs`, `tests/e2e/shell.mjs`(탭 목록).

- [ ] 시험(e2e): 탭, 학급 정보 미리 채움, 작년 파일 넣기 → 2단계 목차가 작년 것, 없으면 표준, 목차 고치기(이름·빼기·더하기·옮기기), 이름 줄 뺀 안내.
- [ ] 구현 → 통과 → 커밋.

### Task 5: 3단계 초안·지침 점검

**Files:** Modify `classplan.js`; Test `tests/e2e/class-plan.mjs`.

- [ ] 시험: 지침 있으면 지침 → 초안 두 번 부름, 칸마다 글, 반영됨·빠짐 [넣기], 겹침 %, 칸 고치기 저장, 프롬프트에 명단 없음, 다른 계획으로 가도 결과는 시작한 계획, AI 없으면 안내.
- [ ] 구현 → 통과 → 커밋.

### Task 6: 4단계 첨부·시수표·평가 표·학급 연결·한글 파일

**Files:** Modify `classplan.js`; Test `tests/e2e/class-plan.mjs`.

- [ ] 시험: 진도표 첨부 → 시수표, [학급 › 진도표·시수에도 넣기] → class:subjects; 표 없는 진도표는 안내; 평가계획 첨부 → AI로 평가 표, 고치기; 한글 파일(제목·표·붙임); 확정; 지난 학급운영계획에서 불러오기.
- [ ] 구현 → 통과 → 커밋.

### Task 7: 예시·문서·전체 시험

**Files:** Create `web/menus/plan/classplan-sample.js`; Modify `scripts/make-samples.mjs`, `samples/`(학급운영계획-작년-예시.hwpx, 평가계획-예시.hwpx), `README.md`, `docs/PRD.md`, `.github/RELEASE_NOTES.md`; Test e2e 예시 흐름, 390px.

- [ ] 시험 → 구현 → 전체 시험(`npm test`, `npm run e2e`) → 커밋.
