# 수업 아이디어 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 평가 › 활동지에 [수업 아이디어]: 진도표 차시 → AI 수업 아이디어 2~5개 → [이 아이디어로 활동지 만들기]·복사·내려받기·다시 만들기, 최근 5묶음.

**Architecture:** 규칙은 화면 없는 `idea-make.js`(프롬프트·답 다듬기·글·문서), 화면은 `idea.js`(`registerView('idea')`, 고르기 칸 `make-pick.js` 같이 씀). 활동지로 넘길 때 `activity-maker.js`의 `startFromIdea`.

**Tech Stack:** 빌드 없는 ES 모듈, `node --test`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-18-lesson-idea-design.md`

## Global Constraints

- 학급 화면(`web/menus/class/**`)은 고치지 않음 — 진도표는 `class-model.js`로 읽기만(`make-pick.js`가 이미 함).
- AI 업무는 `plan`(활동지 만들기와 같음). 학생 자료는 보내지 않음. 직접 쓴 범위는 `pickValue`의 가리개 그대로(돌아온 글은 `scope.back`).
- 선생님께 보이는 글은 한국어 해요체. 시험 예시는 지어낸 것.

## Review Focus

- AI가 흐름 없이(이름만) 주거나 4개 넘게 주면: 흐름 없는 아이디어는 버리고 고른 수까지만.
- 직접 쓴 범위에 교직원 이름이 있으면 아이디어 글에 자리 표시가 남지 않고 원래 이름으로 되돌림.
- 진도표가 없을 때(직접 쓰기)도 만들고, 활동지로 넘기면 같은 범위 + 수업 활동 줄.
- 최근 5묶음을 넘으면 오래된 것부터 빠짐, 망가진 저장 값은 무시.
- AI 키가 없으면 만들지 않고 안내.

---

### Task 1: 규칙 `idea-make.js` + 고르기 칸 선택지

**Files:** Create `web/menus/evaluate/activity/idea-make.js`; Modify `web/menus/evaluate/make-pick.js`; Test `tests/unit/fix1118-idea.test.mjs`

**Interfaces (Produces):**
- `ideaPrompt({ scope, grade, count, level }) => string` — 첫 줄 `[수업 아이디어]`, 답 JSON `{"ideas":[{"title","summary","form","flow":[{"stage":"도입|전개|정리","min":5,"text"}],"materials","look"}]}`.
- `normIdeas(v, { count }) => Idea[]` — `{ no, title, summary, form, flow:[{stage,min,text}], materials, look }`, 흐름 없는 것 버림, count까지, form은 개별·짝·모둠·전체 중 하나(모르면 '').
- `ideaText(idea) => string`(복사용), `ideasDoc(meta, ideas) => { title, blocks }`(내려받기), `ideaLine(idea) => '수업 활동: 이름 — 소개'`.
- `newPick({ ..., countLabel })`: `kinds`가 빈 배열이면 유형 묶음을 그리지 않고 `pickValue`가 유형 오류를 내지 않음.

- [ ] 실패하는 시험: 프롬프트에 교과·학년·범위 줄·`아이디어 3개`·수준, 「학생 이름은 쓰지 않습니다」; `normIdeas`가 흐름 없는 것 버림·count 자름·form 맞춤·자리 표시 되돌림은 화면에서; `ideaLine`·`ideaText`·`ideasDoc` 모양; `newPick({ kinds: [], countLabel: '아이디어 수' })` → `pickHTML`에 「아이디어 수 (2~5)」, 「유형」 없음, `pickValue` 오류 없음.
- [ ] `node --test tests/unit/fix1118-idea.test.mjs` 실패 확인 → 구현 → 통과, 단위 전체 통과.

### Task 2: 화면 `idea.js`, 활동지로 이어 가기, 안내

**Files:** Create `web/menus/evaluate/activity/idea.js`; Modify `activity.js`(목록 단추 `data-ac="idea"`, 보기 전환), `activity-maker.js`(`startFromIdea({ pick, line })`), `web/index.html`(script), `maker.css`(필요한 만큼), `web/core/chat-knowledge.js`, `README.md`; Test `tests/e2e/fix1118-idea.mjs`

**Interfaces:** Consumes Task 1. `startFromIdea({ pick, line })`: 고르기 상태를 넘겨받아 활동지 만들기 보기로 가서 범위 줄 끝에 `line`을 더해 바로 만들기.

- [ ] e2e(모의 AI): 목록 [수업 아이디어] → 고르기(직접 쓰기 범위) → [아이디어 만들기] → 카드 3개(흐름 3단계·준비물·살펴볼 것) → [이 아이디어로 활동지 만들기] → 활동지 만들기 화면에 문항, 보낸 활동지 프롬프트에 「수업 활동: …」 → 목록으로 돌아와 「최근 수업 아이디어」로 다시 열기; AI 키 없으면 안내; 페이지 오류 없음.
- [ ] 구현 → `node tests/e2e/fix1118-idea.mjs` 통과, 활동지 관련 e2e(`activity-make*`, `activity*.mjs`) 통과.
- [ ] 안내 항목·README, CLAUDE.md 상태 줄, 커밋·푸시.
