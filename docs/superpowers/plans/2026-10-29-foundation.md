# 쌤비서 계획 1 · 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평어 만들기 1.8.0을 새 공개 레포로 옮겨, 세로 메뉴·헤더(┌) 틀, 테마 5개, 설정 메뉴, 업스테이지 AI를 갖춘 「쌤비서」 0.1.0을 만든다. 평가는 지금처럼 동작하고, 연수·계획·학급·품의는 빈 자리로 둔다.

**Architecture:** 빌드 도구 없이 `web/` 폴더를 그대로 배포한다. 기존 앱의 스크립트(IIFE)는 `menus/evaluate/evaluate.js`로 거의 그대로 옮겨 classic script로 먼저 실행하고, 끝에서 `window.SSAM`으로 AI·학급 명단·탭 전환을 내보낸다. 새 코드는 ES 모듈(`core/*.js`, `menus/*/`)로 쓰고 `window.SSAM`을 통해 기존 기능을 쓴다. 기존 엔진을 `core/ai.js`로 완전히 옮기는 일은 대회 이후로 미룬다(이번에는 `core/ai.js`가 `window.SSAM.ai`를 감싸는 얇은 모듈).

**Tech Stack:** HTML/CSS/JS(ES2020, 모듈), Tauri 2(Rust), GitHub Actions(Windows 빌드, Pages), Node 22 `node --test`, Playwright 1.56(화면 시험).

**Spec:** `docs/PRD.md`

## Global Constraints
- 앱 이름 「쌤비서」, 레포 `doguri25/ssam-assistant`(공개), 실행 파일 `ssam`, 식별자 `kr.doguri.ssam`, 버전 0.1.0.
- 메뉴 순서: 평가 → 연수 → 계획 → 학급 → 품의, 아래에 설정. 학급 명단은 설정 › 학급 명단.
- 하위 메뉴(헤더 가로 메뉴): 평가 = 교과 평어·창의적 체험활동·행동특성·평가지 채점 / 연수 = 내 필수연수·연수 현황판 / 계획 = 연간계획·행사계획 / 학급 = 오늘 수업·진도표·시수·주간학습안내 / 품의 = 새 품의·저장한 템플릿·최근 작성 / 설정 = 학급 명단·AI·화면·학교 정보·품의 기준.
- 로고 칸과 헤더 높이 76px, 헤더는 배경색 없이 아래 선만. 본문 최대 1120px 가운데.
- 테마 5개: `dark-nav`(기본)·`mono`·`soft`·`paper`·`rail`. 값은 PRD 4.3 표 그대로. 글꼴은 Google Fonts, 없으면 맑은 고딕.
- 저장 키는 모두 `ssam:`으로 시작. AI 키는 레포·로그에 남기지 않는다.
- 평가 기능(문장 규칙, 나이스 자동 입력, 학습지·평가지 읽기)은 바꾸지 않는다.
- 글자 대비 4.5:1 이상, 누르는 곳 44px 이상, 390px 폭에서 가로 스크롤 없음.
- 커밋은 작업 브랜치 `claude/wonderful-johnson-lqb8em`에 하고, 과제가 끝날 때마다 `main`을 앞으로 당긴다(fast-forward).

## Review Focus
1. **처음 켠 컴퓨터(저장된 값 없음)**: 테마 다크 내비, 평가 › 교과 평어가 열리고 오류가 없어야 한다. → Task 3·4 시험에 넣음.
2. **망가진 저장 값**(없는 메뉴 id, 없는 테마 이름, JSON이 아닌 값): 기본값으로 돌아가야 한다. → Task 3(`ssam:nav`), Task 4(`ssam:theme`), Task 5(`store.get` 기본값) 시험.
3. **평어를 만드는 도중 다른 메뉴로 이동**: 만들기가 멈추지 않고, 헤더의 진행 표시가 보이며, 돌아오면 진행 상황이 그대로여야 한다. → Task 3 시험.
4. **좁은 창(380~390px)**: 세로 메뉴가 위로 올라가고 헤더 가로 메뉴가 줄바꿈되며 가로 스크롤이 없어야 한다. → Task 3 시험.
5. **업스테이지로 이미지가 필요한 기능을 쓸 때**: 글자 읽기(OCR)를 거쳐 동작하거나, 웹판에서 호출이 막히면 무엇을 해야 하는지 알려 줘야 한다(조용히 실패하지 않음). → Task 6 시험.

---

### Task 1: 새 레포 만들기와 출발 코드 올리기

**Files:**
- Create: `/home/user/ssam-assistant/` (git 저장소), `web/index.html`(= nice `index.html` 그대로), `src-tauri/`, `scripts/copy-web.mjs`, `package.json`, `package-lock.json`, `.gitignore`, `.github/`, `README.md`
- Test: `tests/e2e/smoke.mjs`

**Interfaces:**
- Produces: `npm run web` → `dist/`에 `web/` 전체 복사. `node tests/e2e/smoke.mjs` → 로컬 서버로 `web/`을 띄워 시험(종료 코드 0 = 통과).

- [ ] **Step 1:** GitHub에 `doguri25/ssam-assistant`(공개, 빈 레포)를 만들고 이 세션에 쓰기 권한으로 붙인다.
- [ ] **Step 2:** nice `main`(1.8.0)의 파일을 복사한다(`.git` 제외). `index.html`은 `web/index.html`로 옮긴다. `README.md`는 쌤비서 소개 몇 줄과 PRD 링크로 새로 쓴다.
- [ ] **Step 3:** `scripts/copy-web.mjs`를 `web/` 폴더 전체를 `dist/`로 재귀 복사하도록 바꾼다(`fs.cpSync(web, dist, { recursive: true })`, 먼저 `dist` 비움).
- [ ] **Step 4: 실패하는 시험 쓰기** — `tests/e2e/smoke.mjs`: `web/`을 Node `http` 서버로 띄우고 Playwright로 연 뒤, (a) 페이지 오류 0개, (b) `[data-mode="cc"]`를 누르면 `#ccView`가 보임, (c) `[data-mode="gr"]` → `#grView` 보임을 확인한다. Playwright는 `devDependencies`에 `playwright@1.56.1`로 넣고 브라우저는 `PLAYWRIGHT_BROWSERS_PATH`의 것을 쓴다.
- [ ] **Step 5:** `npm run web && node tests/e2e/smoke.mjs` → 통과 확인(옮기기만 했으므로 바로 통과해야 함).
- [ ] **Step 6: 커밋·푸시** — `main`에 「쌤비서 시작: 평어 만들기 1.8.0에서 출발」, PRD·이 계획 포함. 작업 브랜치도 같은 커밋에서 만든다.

### Task 2: 기존 앱을 평가 메뉴 파일로 나누기

**Files:**
- Modify: `web/index.html` (스타일·스크립트를 밖으로 빼고 링크만 남김)
- Create: `web/menus/evaluate/evaluate.css`, `web/menus/evaluate/evaluate.js`
- Test: `tests/e2e/smoke.mjs`, `tests/e2e/evaluate.mjs`

**Interfaces:**
- Produces: `window.SSAM = { setMode(mode), getMode(), ai: { generate, engineReady, engineName, errMsg, openSettings }, rosterHTML(), toast(msg, ms), openSheet(html, bind), closeSheet(), esc(s), onModeChange(fn) }` — `mode`는 `'pyeongeo' | 'cc' | 'hk' | 'gr'`. `onModeChange(fn)`은 기존 `setMode`가 불릴 때마다 `fn(mode)`를 부른다.

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/e2e/evaluate.mjs`: (a) `window.SSAM.setMode('hk')` 후 `#hkView` 보임, (b) `window.SSAM.getMode() === 'hk'`, (c) 새로고침 후 `localStorage`에 `ssam:mode`가 있고 `pe:`로 시작하는 키는 없음, (d) 창체 학습지 흐름(가짜 Claude 응답, 학생 3명, PNG 3장)이 끝까지 돌아 결과에 「학습지:」 줄이 3개.
- [ ] **Step 2:** `node tests/e2e/evaluate.mjs` → (a)·(b)·(c) 실패 확인.
- [ ] **Step 3:** `<style>` 내용을 `evaluate.css`로, `<script>` 내용을 `evaluate.js`로 옮긴다. `evaluate.css`에서는 `prefers-color-scheme: dark`와 `[data-theme="dark"]` 토큰 블록 두 개를 지운다(테마는 Task 4가 맡음). `index.html`은 `<link rel="stylesheet" href="menus/evaluate/evaluate.css">`와 `</body>` 바로 앞 `<script src="menus/evaluate/evaluate.js"></script>`를 둔다.
- [ ] **Step 4:** `evaluate.js`의 문자열 `'pe:`를 `'ssam:`으로 모두 바꾼다(저장 키만 해당 — 바꾼 뒤 `grep -c "'pe:"`가 0). 마지막 `})();` 앞에 `window.SSAM` 객체를 만든다(위 Interfaces). `setMode` 안에서 `onModeChange` 등록 함수들을 부른다.
- [ ] **Step 5:** `node tests/e2e/smoke.mjs && node tests/e2e/evaluate.mjs` → 통과.
- [ ] **Step 6: 커밋** — 「기존 앱을 평가 메뉴 파일로 나누기」

### Task 3: 창 틀 — 세로 메뉴·헤더(┌)·메뉴 전환

**Files:**
- Modify: `web/index.html` (기존 `header.appbar`·`nav.modebar`·`footer` 자리를 새 틀로 바꿈, 기존 화면들은 `<section data-menu="evaluate">` 안으로)
- Create: `web/core/shell.js`, `web/core/shell.css`, `web/core/icons.js`, `web/menus/placeholder.js`
- Test: `tests/e2e/shell.mjs`

**Interfaces:**
- Consumes: `window.SSAM.setMode`, `window.SSAM.onModeChange` (Task 2)
- Produces: `MENUS` 배열(`web/core/shell.js` export) — `{ id: 'evaluate'|'training'|'plan'|'class'|'purchase'|'settings', label, icon, tabs: [{ id, label }] }`, 평가 탭 id는 기존 mode 값 그대로. `export function go(menu, tab)`, `export function onEnter(menu, fn)` — 메뉴에 들어올 때 `fn(tab, el)`을 부름(`el` = 그 메뉴의 `<section>`). 저장 키 `ssam:nav` = `{ menu, tab }`.

- [ ] **Step 1: 실패하는 시험 쓰기** — `tests/e2e/shell.mjs`:
  - 처음 열면 `aria-current="page"`인 세로 메뉴가 「평가」, 헤더 제목 「평가」, 가로 메뉴 4개 중 「교과 평어」가 현재.
  - 로고 칸과 헤더의 `getBoundingClientRect().height`가 둘 다 76.
  - 「품의」를 누르면 헤더 제목 「품의」, 가로 메뉴 「새 품의·저장한 템플릿·최근 작성」, `section[data-menu="purchase"]`만 보임. 새로고침하면 품의가 다시 열림.
  - 평가 가로 메뉴 「평가지 채점」 → `window.SSAM.getMode() === 'gr'`.
  - `localStorage['ssam:nav'] = '{"menu":"없음"}'` 후 새로고침 → 평가로 열림. `'망가진 값'`도 같음.
  - 가짜 응답을 3초 늦게 주는 교과 평어 만들기를 시작한 뒤 품의로 갔다가 돌아오면 `#genPill`이 보이고 만들기가 끝까지 됨.
  - 창 폭 390px에서 `document.documentElement.scrollWidth <= 390`.
- [ ] **Step 2:** 시험 실행 → 실패 확인.
- [ ] **Step 3:** 틀 만들기. `index.html`의 body: `<div class="shell">` 안에 `<nav class="side">`(로고 칸 76px: 마크 42px + 「쌤비서」 22px / 메뉴 버튼들 / 아래쪽 「사용 중인 AI」 칸 / 설정), `<div class="work">` 안에 `<header class="top">`(h1 메뉴 제목, `<nav class="tabs">`, 오른쪽에 기존 `#genPill`·`#menuBtn`·`#menu` 그대로 옮김), `<main id="app">`(메뉴마다 `<section data-menu>`). 기존 `#planTitle`은 평가 섹션 맨 위의 쪽 설명 줄로 옮긴다(기존 코드가 글자를 바꿈). 「만든이·연락처」는 설정 맨 아래로 옮긴다.
- [ ] **Step 4:** `shell.js`: `MENUS`로 세로 메뉴·가로 메뉴를 그리고, `go(menu, tab)`이 섹션 표시·`aria-current`·제목을 바꾸고 `ssam:nav`에 저장한다. 평가 탭은 `window.SSAM.setMode(tab)`을 부르고, `onModeChange`로 가로 메뉴 표시를 맞춘다. 저장 값이 `MENUS`에 없으면 `{ menu: 'evaluate', tab: 'pyeongeo' }`. 「사용 중인 AI」 칸은 `window.SSAM.ai.engineName()`(없으면 「AI를 정해 주세요」, 누르면 설정 › AI).
- [ ] **Step 5:** `placeholder.js`: 아직 없는 메뉴(연수·계획·학급·품의)는 쪽 제목과 「곧 만들어요」 한 줄을 그린다.
- [ ] **Step 6:** `shell.css`: PRD 4.1 규칙(76px, 헤더는 `background: transparent` + 아래 선, 본문 `max-width: 1120px; margin: 0 auto`, 현재 가로 메뉴는 헤더 아래 선에 닿는 2px 밑줄, 좁은 화면에서 `.shell`이 `flex-wrap`으로 세로 메뉴를 위로).
- [ ] **Step 7:** `node tests/e2e/shell.mjs && node tests/e2e/evaluate.mjs` → 통과.
- [ ] **Step 8: 커밋** — 「세로 메뉴와 헤더로 창 틀 만들기」

### Task 4: 테마 5개

**Files:**
- Create: `web/core/theme.css`, `web/core/theme.js`
- Modify: `web/index.html` (`<head>`에 테마를 먼저 정하는 짧은 inline script, Google Fonts 링크)
- Test: `tests/e2e/theme.mjs`

**Interfaces:**
- Produces: `THEMES`(export) — `[{ id: 'dark-nav'|'mono'|'soft'|'paper'|'rail', label, desc }]`, `export function setTheme(id)`, `export function getTheme()` (저장 키 `ssam:theme`, 기본 `'dark-nav'`).

- [ ] **Step 1: 실패하는 시험 쓰기** — 처음 열면 `html[data-theme="dark-nav"]`이고 세로 메뉴 배경이 `rgb(21, 23, 28)`; `setTheme('paper')` 후 새로고침해도 `paper`이고 세로 메뉴 배경 `rgb(239, 235, 226)`; `localStorage['ssam:theme']='"없는것"'` → `dark-nav`; 다섯 테마 모두에서 헤더 배경이 투명(`rgba(0, 0, 0, 0)`); `rail` 테마에서 세로 메뉴 폭 96px.
- [ ] **Step 2:** 시험 실행 → 실패 확인.
- [ ] **Step 3:** `theme.css`: 테마마다 틀 값(`--frame`, `--frame-line`, `--frame-ink`, `--frame-ink2`, `--frame-active`, `--frame-active-ink`, `--page`, `--card`, `--card-line`, `--accent`, `--on-accent`, `--f-display`, `--f-body`, `--radius`)과 기존 평가 값(`--bg`, `--surface`, `--accent`, `--accent-soft`, `--accent-ink`, `--line` 등)을 정한다. 색은 PRD 4.3과 UI 시안의 값을 쓴다. `rail`은 세로 메뉴 96px, 메뉴 버튼은 아이콘 위·글자 아래.
- [ ] **Step 4:** `<head>` inline script: `localStorage['ssam:theme']`을 읽어 `THEMES`에 있으면 `data-theme`에, 아니면 `dark-nav`. Google Fonts 한 줄로 Gothic A1·IBM Plex Sans KR·Noto Sans KR·Noto Serif KR.
- [ ] **Step 5:** 시험 → 통과. `tests/e2e/shell.mjs`도 다섯 테마에서 한 번씩 돌려 76px·가로 스크롤 조건 확인.
- [ ] **Step 6: 커밋** — 「테마 5개(기본 다크 내비)」

### Task 5: 저장 모듈과 설정 메뉴

**Files:**
- Create: `web/core/store.js`, `web/core/settings.js`, `web/menus/settings/settings.js`, `web/menus/settings/settings.css`
- Test: `tests/unit/store.test.mjs`, `tests/unit/settings.test.mjs`, `tests/e2e/settings.mjs`

**Interfaces:**
- Produces:
  - `store.js`: `get(key, fallback)`, `set(key, value)`, `remove(key)`, `list(prefix)` — 키 앞에 `ssam:`을 붙여 `localStorage`에 JSON으로. 읽기 실패·JSON 오류면 `fallback`. 테스트용 `useStorage(fakeStorage)`.
  - `settings.js`: `getSchool()` → `{ name: '', year: 2027, classes: 0, students: 0, breaks: [{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', label }] }`, `setSchool(obj)`, `getPurchaseLimit()` → 기본 `20000000`, `setPurchaseLimit(won)`.
  - 설정 화면: 가로 메뉴 5개(학급 명단·AI·화면·학교 정보·품의 기준).

- [ ] **Step 1: 실패하는 시험 쓰기**
  - `store.test.mjs`: `set('a', {x:1})` 후 `get('a')` → `{x:1}`; 저장소 값이 `'{깨짐'`이면 `get('a', 5)` → `5`; `list('plan:')`이 `ssam:plan:` 키들만 돌려줌; 저장소 `setItem`이 예외를 던져도 `set`이 예외를 밖으로 던지지 않음.
  - `settings.test.mjs`: 아무것도 없을 때 `getPurchaseLimit() === 20000000`; `setPurchaseLimit(-1)`은 거절(값 그대로); `setSchool`에 `breaks`의 `from > to`가 있으면 그 항목을 버림.
  - `settings.mjs`(화면): 설정 › 학급 명단에서 학생 수 24, 예외 번호 7을 넣으면 평가 › 창의적 체험활동 결과에 7번 없이 23명; 설정 › 화면에서 「종이 문서」 카드를 누르면 바로 `paper`; 학교 정보 저장 후 새로고침해도 남음; 「만든이·연락처」가 설정 아래에 보임.
- [ ] **Step 2:** `node --test tests/unit` → 실패 확인.
- [ ] **Step 3:** `store.js`, `settings.js` 구현.
- [ ] **Step 4:** 설정 화면: 학급 명단 = `window.SSAM.rosterHTML()`과 학년(기존 문서 단위 change 처리기가 그대로 동작), AI = 지금 AI 요약 + [AI 바꾸기](`window.SSAM.ai.openSettings()`), 화면 = 테마 카드 5개(UI 시안 설정 화면과 같은 미리보기, `setTheme`), 학교 정보 = 학교명·학년도·학급 수·학생 수·방학/재량휴업일 목록(더하기·빼기), 품의 기준 = 계약 기준 금액(원, 기본 20,000,000)과 「학교마다 다를 수 있어요. 행정실에 확인해 주세요」.
- [ ] **Step 5:** `node --test tests/unit && node tests/e2e/settings.mjs` → 통과.
- [ ] **Step 6: 커밋** — 「설정 메뉴와 저장 모듈」

### Task 6: 업스테이지 AI

**Files:**
- Modify: `web/menus/evaluate/evaluate.js` (`PROVIDERS`, `E.keys`, `callApi`, `generate`, 설정 시트의 AI 목록)
- Create: `web/core/ai.js`
- Test: `tests/e2e/upstage.mjs`

**Interfaces:**
- Consumes: `window.SSAM.ai` (Task 2)
- Produces: `core/ai.js` — `export function generate(prompt, { signal, images, careful }) -> Promise<{ text, truncated }>`, `export function ready() -> boolean`, `export function providerName() -> string`, `export function errorMessage(code, e) -> string`. `images`는 `[{ mime, b64, blob }]`.

- [ ] **Step 1:** 업스테이지 공식 문서로 확인해 이 계획의 값을 고친다: 채팅 주소(`https://api.upstage.ai/v1/chat/completions` 예상), 기본 모델 이름(`solar-pro3` 예상), 글자 읽기 API 주소와 요청 형식, 브라우저 호출 허용 여부(`curl -i -X OPTIONS`에 `Origin` 헤더). 확인한 값을 이 단계 아래에 적는다.
  - 2026-10-29 결과: 이 개발 환경은 api.upstage.ai·console.upstage.ai에 나갈 수 없어(프록시 403·DNS) 공식 문서와 CORS를 직접 확인하지 못함. 공개된 제3자 자료 기준으로 씀 — 채팅 `POST https://api.upstage.ai/v1/chat/completions`(OpenAI 방식, `Authorization: Bearer`, `stream: true`면 `data:` SSE), 모델 `solar-pro3`·`solar-pro2`·`solar-mini`, 글자 읽기 `POST https://api.upstage.ai/v1/document-digitization`(multipart `document`=파일, `model=ocr`, 답의 `text` 또는 `pages[].text`). 브라우저 허용 여부는 모름 → Step 5를 미리 넣음(아래). 실제 키로 설정 › AI [연결 확인]을 눌러 확인할 것.
- [ ] **Step 2: 실패하는 시험 쓰기** — `tests/e2e/upstage.mjs`(가짜 응답): 설정에서 업스테이지와 키를 고르면 세로 메뉴 「사용 중인 AI」가 「업스테이지」; 교과 평어 만들기 요청이 `api.upstage.ai`의 채팅 주소로 가고 `Authorization: Bearer <키>`이며 결과 문장이 화면에 나옴; 창체 학습지 흐름에서 이미지 요청이 글자 읽기 주소로 먼저 가고, 읽은 글이 채팅 요청 본문에 들어감; 글자 읽기가 실패(500)하면 「업스테이지가 이미지를 읽지 못했어요. 이미지 기능은 Claude·Gemini·GPT를 권장해요」가 보임; 평가지 채점·창체 학습지 화면에 업스테이지일 때 권장 안내 한 줄이 보임(PRD E-5); 설정 › AI의 [연결 확인]을 누르면 짧은 요청을 보내 성공 시 「연결됐어요 · 업스테이지 Solar」, 401이면 「키가 맞지 않아요」를 보임(PRD S-2, 네 제공자 공통).
- [ ] **Step 3:** 시험 실행 → 실패 확인.
- [ ] **Step 4:** `PROVIDERS.upstage`(이름 「업스테이지 API」, 모델 목록), `E.keys.upstage`, `callApi`의 업스테이지 분기(OpenAI 방식 스트리밍, 주소만 다름), `generate`에서 업스테이지+이미지면 글자 읽기 → 프롬프트 앞에 「[이미지에서 읽은 글]」로 붙여 글만 보냄. 설정 시트 AI 목록에 업스테이지 추가. `window.SSAM.ai`에 그대로 노출되고 `core/ai.js`는 그것을 감싼다. 설정 › AI에 [연결 확인]: `generate('연결 확인입니다. "확인"이라고만 답하세요.')` 결과로 성공·실패 문구(`errorMessage`)를 보인다.
- [ ] **Step 5:** 브라우저 호출이 막혀 있으면(Step 1 결과): Windows 앱은 Rust 명령 `ai_proxy(url, headers, body) -> { status, body }`로 대신 보내고, 웹판은 「업스테이지는 Windows 앱에서 써 주세요」를 보인다. 막혀 있지 않으면 이 단계는 건너뛰고 그렇게 적는다.
- [ ] **Step 6:** 시험 → 통과. 기존 `tests/e2e/evaluate.mjs`도 통과.
- [ ] **Step 7: 커밋** — 「업스테이지 AI 추가」

### Task 7: Windows 앱·자동 업데이트·웹판 배포를 쌤비서로

**Files:**
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/src/updater.rs`, `src-tauri/src/main.rs`, `.github/workflows/release.yml`, `.github/RELEASE_NOTES.md`, `package.json`, `package-lock.json`, `README.md`
- Create: `.github/workflows/pages.yml`
- Delete: `.github/RELEASES_README.md` (공개 릴리즈 레포를 따로 두지 않음)
- Test: `tests/unit/release-config.test.mjs`

**Interfaces:**
- Produces: 릴리즈 파일 `ssam-<버전>-setup.exe`, `ssam-<버전>-portable.exe`, `SHA256SUMS.txt`, `latest.json`(같은 레포 릴리즈). 웹판 `https://doguri25.github.io/ssam-assistant/`.

- [ ] **Step 1: 실패하는 시험 쓰기** — `release-config.test.mjs`: `tauri.conf.json`의 `productName === '쌤비서'`, `mainBinaryName === 'ssam'`, `identifier === 'kr.doguri.ssam'`; `package.json` 버전 = `Cargo.toml` 버전 = `0.1.0`; `updater.rs`에 `RELEASES_REPO: &str = "doguri25/ssam-assistant"`; `release.yml`에 `nice-releases`가 없고 `ssam-$v-setup.exe`가 있음; `pages.yml`이 `web` 폴더를 올림.
- [ ] **Step 2:** `node --test tests/unit/release-config.test.mjs` → 실패 확인.
- [ ] **Step 3:** 값 바꾸기. 창 제목 「쌤비서」, 설명 문구는 PRD 1.1 한 줄. `updater.rs`의 `doguri25/nice-releases`(시험 문자열 포함)를 모두 `doguri25/ssam-assistant`로. `release.yml`은 파일 이름 `ssam-…`, 공개 레포 올리기 단계 삭제. `RELEASE_NOTES.md`는 0.1.0 내용으로 새로 씀.
- [ ] **Step 4:** `pages.yml`: `main`에 올리면 `actions/upload-pages-artifact`(path `web`) → `actions/deploy-pages`. 레포 설정에서 Pages 원천을 「GitHub Actions」로 켜는 일은 사람이 해야 함 — README와 보고에 적는다.
- [ ] **Step 5:** 시험 → 통과. `npm run web` 후 `dist/`에 `index.html`, `core/`, `menus/`가 있는지 확인.
- [ ] **Step 6: 커밋·푸시·확인** — 「쌤비서 0.1.0: Windows 앱·업데이트·웹판 배포 설정」. `main`을 앞으로 당기고, Actions에서 「릴리즈 만들기」를 켠 빌드를 돌려 설치 파일이 만들어지는지 확인한다(실패하면 로그로 고침).

---

## 다음 계획 (이 계획이 끝난 뒤, 단계마다 따로 씀)
| 계획 | 내용 | PRD | 날짜 |
|---|---|---|---|
| 계획 2 | 품의(P-1~P-10) + `.hwpx` 만들기(`core/hwpx.js`) + 시연 견적서 샘플 | 5.2, 9 | 10/31~11/1 |
| 계획 3 | 행사계획(V-1~V-6), QR, 설문 CSV 결과 | 5.4 | 11/2~11/3 |
| 계획 4 | 연간계획(Y-1~Y-8), 공휴일 2026~2027, 일정 겹침 | 5.3 | 11/4~11/5 |
| 계획 5 | 연수·학급 화면 시안, 심사용 README·샘플, 1.0.0 릴리즈 | 5.5, 5.6, 10 | 11/6~11/7 |
