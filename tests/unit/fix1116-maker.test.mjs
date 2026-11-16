// 2026-11-16 고침 — 문항·활동지 만들기: 직접 쓴 범위 첫 줄의 교직원 이름이 평가 정보(단원 이름)·문제지 제목에 〔이름n〕로 남던 것,
// 그렇게 되돌린 이름이 나중에 채점·검토·피드백 AI 요청 글로 그대로 가던 것(AI로 가는 글은 가린 채로, 선생님이 보는 것만 원래 이름),
// 1단계에서 마지막 문항을 빼고 [문항 더하기]를 하면 다시 내려받는 문제지에 뺀 문항의 물음이 되살아나던 것. 이름·번호는 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { newPick, pickEvent, pickValue } from '../../web/menus/evaluate/make-pick.js';
import { makePrompt, paperTitle, testFrom, madeItems, paperDoc } from '../../web/menus/evaluate/unit/unit-make.js';
import { actPrompt, activityFrom, normTasks } from '../../web/menus/evaluate/activity/activity-make.js';
import { dropItem } from '../../web/menus/evaluate/unit/unit-model.js';
import { gradePrompt, feedbackPrompt, redoPrompt, missPrompt } from '../../web/menus/evaluate/unit/unit-ai.js';
import { gradeReviewPrompt } from '../../web/core/ai-review.js';
import * as makeScope from '../../web/menus/evaluate/make-scope.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());
const KINDS = [['choice', '객관식'], ['short', '단답'], ['essay', '서술형']];
const el = (mp, value) => ({ dataset: { mp }, value: String(value), checked: false, closest: () => null });
const freePick = (subject, free) => { const S = newPick({ kinds: KINDS }); pickEvent(S, el('subject', subject), 'input'); pickEvent(S, el('free', free), 'input'); return pickValue(S); };

test('[C22] 직접 쓴 범위 첫 줄의 교직원 이름: AI로 보내는 범위 줄은 가리고, 평가 정보·문제지 제목·활동지 단원에는 원래 이름', () => {
  const v = freePick('과학', '5. 날씨와 우리 생활(한가람 선생님 자료)\n습도와 이슬');
  assert.equal(v.error, '');
  const s = v.scope;
  assert.equal(s.unitNo, 5);
  assert.equal(s.unitName, '날씨와 우리 생활(한가람 선생님 자료)');
  assert.equal(s.unit, '5. 날씨와 우리 생활(한가람 선생님 자료)');
  // AI로 가는 범위 줄·요청 글은 여전히 가림
  assert.ok(!s.lines.join('\n').includes('한가람') && s.lines[0].includes('〔이름1〕'), s.lines.join('|'));
  for (const p of [makePrompt({ scope: s, grade: 4 }), actPrompt({ scope: s, grade: 4 })]) assert.ok(!p.includes('한가람') && p.includes('〔이름1〕'), p.slice(0, 300));
  // 평가 정보·문제지 제목(unit-maker metaNow와 같은 값)·활동지 단원
  const meta = { subject: s.subject, grade: 4, unitNo: s.unitNo, unitName: s.unitName, lesson: s.lesson };
  assert.equal(paperTitle(meta), '4학년 과학 5단원 날씨와 우리 생활(한가람 선생님 자료) 단원평가');
  assert.equal(testFrom({ meta, items: [] }).meta.unitName, '날씨와 우리 생활(한가람 선생님 자료)');
  const a = activityFrom({ meta: { subject: s.subject, unit: s.unit, title: '이슬 관찰' }, tasks: normTasks({ items: [{ kind: 'write', ask: '이슬이 맺히는 까닭을 쓰세요.', ok: 'a', part: 'b' }] }) });
  assert.equal(a.meta.unit, '5. 날씨와 우리 생활(한가람 선생님 자료)');
  // 돌아온 활동 이름의 자리 표시도 같은 가리개로 되돌림(activity-maker makeAll)
  assert.equal(s.back('〔이름1〕 선생님과 이슬 관찰'), '한가람 선생님과 이슬 관찰');
});

test('[C22] 지나치게 고치지 않음: 이름 없는 범위·이름이 둘째 줄에만 있는 범위·번호 없는 첫 줄은 그대로', () => {
  const plain = freePick('사회', '1. 우리 고장의 모습\n고장의 자랑거리 알기').scope;
  assert.deepEqual([plain.unit, plain.unitNo, plain.unitName], ['1. 우리 고장의 모습', 1, '우리 고장의 모습']);
  assert.deepEqual(plain.lines, ['1. 우리 고장의 모습', '고장의 자랑거리 알기']);
  const second = freePick('사회', '1. 우리 고장의 모습\n이바다 선생님 반과 같은 범위').scope;
  assert.deepEqual([second.unit, second.unitName], ['1. 우리 고장의 모습', '우리 고장의 모습']);
  assert.ok(!second.lines[1].includes('이바다'), second.lines[1]);
  // 첫 줄이 단원 번호 꼴이 아니면 단원 칸은 비어 있음(이름이 있어도)
  const loose = freePick('과학', '한가람 선생님 반과 같은 범위\n습도와 이슬').scope;
  assert.deepEqual([loose.unit, loose.unitNo, loose.unitName], ['', null, '']);
  assert.ok(!loose.lines.join('\n').includes('한가람'), loose.lines.join('|'));
  // 낱말 속 성씨 글자(「한글」「이슬」)는 이름이 아님
  const words = freePick('국어', '3. 한글의 짜임과 이슬 같은 말').scope;
  assert.equal(words.unitName, '한글의 짜임과 이슬 같은 말');
  assert.equal(words.lines[0], '3. 한글의 짜임과 이슬 같은 말');
});

// 첫 줄에 교직원 이름과 전화번호가 든 직접 쓴 범위
const STAFF = '5. 날씨와 우리 생활(한가람 선생님 010-1234-5678)';
const leaks = p => p.includes('한가람') || p.includes('010-1234-5678');
const hideOf = x => (typeof makeScope.madeHide === 'function' ? makeScope.madeHide(x) : { hide: v => v, back: v => v });

test('[C22 채점] 직접 쓴 범위로 만든 단원평가: 채점·검토·피드백·복습 문제·틀린 까닭 요청 글은 가린 채로, 선생님이 보는 제목·문제지는 원래 이름', () => {
  const s = freePick('과학', `${STAFF}\n습도와 이슬`).scope;
  assert.equal(s.unitName, '날씨와 우리 생활(한가람 선생님 010-1234-5678)');
  // AI가 만든 문항: 돌아온 글이라 unmaskItem으로 원래 이름을 되돌린 것
  const items = [
    { no: 1, type: 'choice', question: '한가람 선생님이 아침에 본 이슬은 어디에 맺혔나요?', choices: ['풀잎', '하늘', '땅속', '구름'], answer: '①', content: '이슬이 맺히는 곳', points: 50 },
    { no: 2, type: 'essay', question: '이슬이 맺히는 까닭을 쓰세요.', answer: '밤에 기온이 내려가서', criteria: '한가람 선생님 자료의 낱말을 쓰면 만점', content: '이슬이 맺히는 까닭', points: 50 }];
  const t = testFrom({ meta: { subject: s.subject, grade: 4, unitNo: s.unitNo, unitName: s.unitName, lesson: s.lesson }, items, hide: typeof s.hidden === 'function' ? s.hidden() : undefined });
  // 선생님이 보는 것: 평가 이름·문제지·저장한 글은 원래 이름
  assert.equal(paperTitle(t.meta), '4학년 과학 5단원 날씨와 우리 생활(한가람 선생님 010-1234-5678) 단원평가');
  assert.ok(madeItems(t)[0].question.startsWith('한가람 선생님이'), madeItems(t)[0].question);
  assert.ok(JSON.stringify(paperDoc(t.meta, madeItems(t)).blocks).includes('한가람 선생님이 아침에'));
  assert.ok(t.paper.text.includes('한가람') && !t.paper.text.includes('〔'), t.paper.text);
  // AI로 가는 것: 같은 번호의 자리 표시로 가림
  t.students = [{ no: 1, status: 'done', items: { 1: { pts: 50, read: '①' }, 2: { pts: 0, read: '모르겠어요' } } }];
  const req = { items: [{ no: 2, content: '이슬이 맺히는 까닭', type: 'essay', answer: '밤에 기온이 내려가서', points: 50, criteria: t.key.items[1].criteria, groups: [], answers: [{ id: 'a1', text: '모르겠어요' }] }] };
  const sent = { grade: gradePrompt(t, 1), review: gradeReviewPrompt(t, 1, [2]), feedback: feedbackPrompt(t, t.students), redo: redoPrompt(t, t.key.items), miss: missPrompt(t, req) };
  for (const [k, p] of Object.entries(sent)) assert.ok(!leaks(p), `${k}: ${p.slice(0, 500)}`);
  assert.ok(sent.grade.includes('[평가] 4학년 과학 5단원 날씨와 우리 생활(〔이름1〕 선생님 {{1}})'), sent.grade.slice(0, 300));
  assert.ok(sent.grade.includes('1. 〔이름1〕 선생님이 아침에 본 이슬은') && sent.grade.includes('〔이름1〕 선생님 자료의 낱말을 쓰면 만점'), sent.grade);
  assert.ok(sent.feedback.includes('날씨와 우리 생활(〔이름1〕 선생님 {{1}})'), sent.feedback.slice(0, 300));
  // AI 답에 자리 표시가 오면 원래 값으로 되돌려 선생님에게 보임(글·글 목록·객체 안 글)
  assert.deepEqual(hideOf(t).back({ items: [{ no: 2, read: '', why: '〔이름1〕 선생님 자료의 낱말이 없음({{1}})', sure: false }] }),
    { items: [{ no: 2, read: '', why: '한가람 선생님 자료의 낱말이 없음(010-1234-5678)', sure: false }] });
});

test('[C22 채점] 지나치게 가리지 않음: 가린 값이 없는 평가·활동지(이름 없는 범위, 직접 넣은 정답표, 고치기 전에 만든 것)는 요청 글·AI 답이 그대로', () => {
  const plain = freePick('사회', '1. 우리 고장의 모습\n고장의 자랑거리 알기').scope;
  // 범위에서 이름을 찾지 못했으면 남길 값이 없음 — 문항에 쓴 「한가람 마을」은 가리지 않음(가리개가 이름으로 본 적이 없음)
  const t = testFrom({ meta: { subject: '사회', grade: 3, unitNo: 1, unitName: plain.unitName }, items: [{ no: 1, type: 'short', question: '한가람 마을의 자랑거리를 쓰세요.', answer: '시장', points: 100 }], hide: typeof plain.hidden === 'function' ? plain.hidden() : undefined });
  assert.equal(t.made.hide, undefined);
  const g = gradePrompt(t, 1);
  assert.ok(g.includes('[평가] 3학년 사회 1단원 우리 고장의 모습') && g.includes('1. 한가람 마을의 자랑거리를 쓰세요.') && !g.includes('〔'), g.slice(0, 400));
  // 직접 넣은 정답표(만든 물음 없음)
  const hand = { meta: { subject: '수학', grade: 3, unitNo: 2, unitName: '평면도형' }, key: { items: [{ no: 1, type: 'short', answer: '3', points: 100, criteria: '' }] }, paper: { text: '' }, students: [] };
  assert.ok(gradePrompt(hand, 1).includes('[평가] 3학년 수학 2단원 평면도형'));
  // 이번 고침 전에 만든 평가(자리 표시가 글자로 남아 있고 남긴 값은 없음): AI 답의 자리 표시를 지우지 않음
  const old = { made: { items: [] } };
  assert.equal(hideOf(old).back('〔이름1〕 선생님 자료'), '〔이름1〕 선생님 자료');
  assert.equal(hideOf(old).hide('한가람 선생님 자료'), '한가람 선생님 자료');
  // 가린 이름이 있어도 낱말 속 같은 글자(「바다이바다」)는 그대로, 조사가 붙은 이름은 가림
  const h = hideOf({ made: { hide: { names: ['이바다'], secrets: [] } } });
  assert.equal(h.hide('이바다 선생님과 바다이바다 놀이, 이바다가 준 자료'), '〔이름1〕 선생님과 바다이바다 놀이, 〔이름1〕가 준 자료');
});

const made5 = () => testFrom({ meta: { subject: '수학', grade: 3 }, items: [1, 2, 3, 4, 5].map(no => ({ type: 'choice', question: `${no}번 물음`, choices: ['가', '나', '다', '라'], answer: '①②③④①'[no - 1], points: 20 })) });

test('[C23] 1단계에서 문항을 빼면 만든 물음(t.made)·학생 채점 칸도 그 번호를 지움 → 같은 번호로 다시 더해도 뺀 물음이 되살아나지 않음', () => {
  const t = made5();
  t.students = [{ no: 1, items: { 4: { points: 20 }, 5: { points: 20 } } }];
  dropItem(t, 5);
  assert.deepEqual(t.key.items.map(k => k.no), [1, 2, 3, 4]);
  assert.deepEqual(t.made.items.map(m => m.no), [1, 2, 3, 4]);
  assert.deepEqual(Object.keys(t.students[0].items), ['4']);
  // [문항 더하기](unit.js addItem: 남은 번호 + 1)로 5번을 새로 더함 — 물음이 없는 문항이라 문제지에는 넣지 않음
  t.key.items.push({ no: 5, content: '새로 넣은 문항', domain: '', type: 'short', answer: '12', points: 20, criteria: '', pages: '' });
  const m = madeItems(t);
  assert.deepEqual(m.map(x => x.no), [1, 2, 3, 4]);
  const doc = JSON.stringify(paperDoc(t.meta, m).blocks);
  assert.ok(!doc.includes('5번 물음'), doc.slice(-200));
});

test('[C23] 가운데 문항을 빼도 다른 문항의 물음·정답은 그대로, 만든 물음이 없는 평가(직접 넣은 정답표)도 그대로 빠짐', () => {
  const t = made5();
  dropItem(t, 3);
  const m = madeItems(t);
  assert.deepEqual(m.map(x => [x.no, x.question, x.answer]), [[1, '1번 물음', '①'], [2, '2번 물음', '②'], [4, '4번 물음', '④'], [5, '5번 물음', '①']]);
  const plain = { key: { items: [{ no: 1, answer: '①' }, { no: 2, answer: '②' }] }, students: [{ no: 1, items: { 1: {}, 2: {} } }, { no: 2 }] };
  dropItem(plain, 2);
  assert.deepEqual(plain.key.items.map(k => k.no), [1]);
  assert.equal(plain.made, undefined);
  assert.deepEqual(Object.keys(plain.students[0].items), ['1']);
});
