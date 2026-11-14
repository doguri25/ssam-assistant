# 평가 화면 새 디자인 Implementation Plan

> **For agentic workers:** 1단계는 인라인, 2~6단계는 영역 에이전트(워크트리)로. 선생님이 스펙 승인과 함께 「계획을 쓰고 이어서 끝까지 구현」에 동의함.

**Goal:** 목업 「평가 1~7」의 구성·모양을 실제 평가 메뉴에 옮김(기능은 하나도 빼지 않음).

**Architecture:** 셸 탭을 6개로 접고(생활기록부 = 교과 평어·창체·행특 묶음 + 안쪽 전환), 평가 공통 모양(eval-ui.css)과 단계·확인 수 순수 모듈(eval-stage.js)을 두고, 한눈에 보드(eval-board.js)를 새로 그림. 2~6단계는 각 영역 모듈이 공통 모양을 써서 화면을 바꿈.

**Tech Stack:** 정적 ES 모듈(web/), node:test 단위 시험, Playwright e2e(tests/e2e).

**Spec:** docs/superpowers/specs/2026-11-14-eval-redesign-design.md

## Global Constraints
- 저장 키·자료 모양 그대로. 지금 기능 빼지 않음. 학생은 번호로. 해요체.
- 색: 테마 `--accent`(쌤비서가 한 일), 새 `--turn` `--turn-ink` `--turn-soft` `--turn-line`(선생님 차례). 글자 대비 4.5:1.
- 390px 가로 넘침 없음, PC 1280×860 첫 화면에 핵심.
- 탭 id는 그대로(pyeongeo·cc·hk 유지): 가로 메뉴에서만 한 칸 「생활기록부」로 접어 보임.

## Review Focus
- 저장된 마지막 탭이 pyeongeo·cc·hk·gr일 때 평가 메뉴 열기(생활기록부 칸이 현재로 보여야 함).
- 기존 앱이 스스로 mode를 바꿀 때(onModeChange) 접힌 칸·안쪽 전환이 맞는지.
- 계정 저장소(db) 모드에서 한눈에가 평가지 채점을 읽지 못해도 깨지지 않는지.
- 예시 평가만 있을 때 / 평가가 하나도 없을 때 한눈에.
- 확인 수가 0일 때 「선생님 차례」 숨김.

### Task 1: 틀·공통 모양·한눈에 (인라인)
**Files:** Create `web/menus/evaluate/eval-ui.css`, `web/menus/evaluate/eval-stage.js`, `web/menus/evaluate/eval-board.js`, `tests/unit/eval-stage.test.mjs`, `tests/e2e/eval-board.mjs`. Modify `web/core/shell.js`, `web/core/shell.css`(:root 변수), `web/index.html`(css·모듈), `web/menus/evaluate/unit/unit.css`(ev-new 허용 상자), `web/menus/evaluate/evaluate.js`(SSAM.gr.open), 탭을 누르던 e2e.
**Interfaces (Produces):**
- `eval-stage.js`: `STAGES` [[id,label]…] (prep 준비 · grade 채점 · result 결과 확인 · help 보충 · record 생활기록부), `unitStage(test, steps, { pyDone })`, `unitPending(test)`, `activityStage(a)`, `activityPending(a)`, `grStage(b)`, `grPending(b)` → stage id 또는 'done', 수.
- `eval-board.js`: `boardItems()` → [{ kind, id, title, subject, stage, pending, line, n, m }], `turnTotal()`, 화면(onEnter 'evaluate', tab 'board'), 「선생님 차례 n」 칸(#menuTabs 끝, data-tab="board").
- `shell.js`: 평가 탭 [board, unit, activity, gr, pyeongeo(rec), cc(rec), hk(rec), check]. 가로 메뉴에서 rec는 「생활기록부」 한 칸(data-tab=지금 또는 마지막 rec 탭). `REC` 내보냄.
- `.rec-switch`(평가 칸 맨 위, rec 탭일 때만): [교과 평어 · 창의적 체험활동 · 행동특성], 누르면 go('evaluate', id).
- eval-ui.css 공통 클래스: `.ev-card(.turn)`, `.ev-tiles/.ev-tile`, `.ev-turn-btn`, `.ev-chip(.done|.turn)`, `.ev-num`, `.ev-bar`, `.ev-steps`, `.ev-heat .hc-ok/.hc-no/.hc-part/.hc-wait/.hc-chk`, `.ev-band`, `.ev-turn-pill`, `.rec-switch`.
- `SSAM.gr.open(id)`: 지난 채점 열기(채점 중이 아니면).
**Steps:** 단위 시험 먼저(eval-stage) → 구현 → 통과 확인 → 화면 → e2e(eval-board) → 탭 바뀐 기존 e2e 고침 → 커밋.

### Task 2: 단원평가 (에이전트 A) — 스펙 3장 + 4장의 단원평가 확인 화면
### Task 3: 활동지 (에이전트 B) — 스펙 5장 + 4장의 활동지 확인 화면
### Task 4: 생활기록부 글 쓰기 + 평가지 채점 확인 (에이전트 C) — 스펙 6장 + 4장의 gr 확인 화면
### Task 5: 기재 점검 (에이전트 D) — 스펙 7장
각 에이전트: Task 1의 공통 클래스·eval-stage를 쓰고, 맡은 파일만 고치고, 단위·관련 e2e 통과, 1280×860·390px 캡처로 목업과 견줌, 커밋.

### Task 6: 합치기·전체 시험·문서 (인라인)
에이전트 브랜치 합침 → `node --test tests/unit/*.test.mjs` 전부 → `node tests/e2e/run-all.mjs` 전부 → README·chat-knowledge 평가 글 → 커밋·푸시.
