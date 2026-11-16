// 2026-11-16 고침 — 문항·활동지 만들기: 직접 쓴 범위 첫 줄의 교직원 이름이 평가 정보(단원 이름)·문제지 제목에 〔이름n〕로 남던 것,
// 그렇게 되돌린 평가·활동 이름이 나중에 채점·검토·피드백·평어 AI 요청 글로 그대로 가던 것(AI로 가는 이름은 만들 때 가린 글, 선생님이 보는 것만 원래 이름 —
// 정답표·문항·학생 답은 다시 가리지 않음: 김구 같은 배움 내용 이름),
// 1단계에서 마지막 문항을 빼고 [문항 더하기]를 하면 다시 내려받는 문제지에 뺀 문항의 물음이 되살아나던 것. 이름·번호는 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { newPick, pickEvent, pickValue } from '../../web/menus/evaluate/make-pick.js';
import { makePrompt, paperTitle, testFrom, madeItems, paperDoc } from '../../web/menus/evaluate/unit/unit-make.js';
import { actPrompt, activityFrom, normTasks } from '../../web/menus/evaluate/activity/activity-make.js';
import { dropItem, saveTest } from '../../web/menus/evaluate/unit/unit-model.js';
import { saveActivity } from '../../web/menus/evaluate/activity/activity-model.js';
import { lines as refLines, items as refItems } from '../../web/core/eval-refs.js';
import { evidenceList, evidencePrompt } from '../../web/core/evidence.js';
import { gradePrompt, feedbackPrompt, redoPrompt, missPrompt } from '../../web/menus/evaluate/unit/unit-ai.js';
import { gradeReviewPrompt } from '../../web/core/ai-review.js';
import { gradePrompt as actGradePrompt, reviewPrompt as actReviewPrompt, criteriaPrompt } from '../../web/menus/evaluate/activity/activity-ai.js';
import * as actAI from '../../web/menus/evaluate/activity/activity-ai.js';
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

// 첫 줄에 교직원 이름과 전화번호가 든 직접 쓴 범위: 선생님이 보는 단원 이름(SHOWN)과 만들 때 AI로 보낸 가린 글(SENT)
const STAFF = '5. 날씨와 우리 생활(한가람 선생님 자료, 010-1234-5678)';
const SHOWN = '날씨와 우리 생활(한가람 선생님 자료, 010-1234-5678)', SENT = '날씨와 우리 생활(〔이름1〕 선생님 자료, {{1}})';
const leaks = p => p.includes('한가람') || p.includes('010-1234-5678');
// unit-maker create와 같이: 평가 정보는 범위의 원래 이름, AI로 보낼 값은 만들 때 가린 글(scope.ai)
const madeTest = (s, items, grade = 4) => testFrom({ meta: { subject: s.subject, grade, unitNo: s.unitNo, unitName: s.unitName, lesson: s.lesson }, items, ai: s.ai });
// activity-maker create와 같이: 활동 이름은 AI가 지은 이름을 되돌린 것, AI로 보낼 값은 AI가 지은 그대로(가린 글)
const madeActivity = (s, aiTitle, tasks) => activityFrom({ meta: { subject: s.subject, unit: s.unit, title: s.back(aiTitle) }, tasks, ai: { ...(s.ai || {}), title: aiTitle } });
const DEW = [
  { no: 1, type: 'choice', question: '아침에 풀잎에 맺힌 이슬은 무엇이 변한 것인가요?', choices: ['수증기', '모래', '구름', '얼음'], answer: '①', content: '이슬이 생기는 까닭', points: 50 },
  { no: 2, type: 'essay', question: '이슬이 맺히는 까닭을 쓰세요.', answer: '밤에 기온이 내려가서', criteria: '기온과 수증기를 이어 쓰면 만점', content: '이슬이 맺히는 까닭', points: 50 }];

test('[C22 채점] 직접 쓴 범위로 만든 단원평가: 채점·검토·피드백·복습 문제·틀린 까닭 요청 글의 평가 이름·문제지 제목은 만들 때 가린 글, 선생님이 보는 제목·문제지는 원래 이름', () => {
  const s = freePick('과학', `${STAFF}\n습도와 이슬`).scope;
  assert.equal(s.unitName, SHOWN);
  const t = madeTest(s, DEW);
  // 선생님이 보는 것: 평가 이름·문제지·저장한 평가 정보는 원래 이름
  assert.equal(t.meta.unitName, SHOWN);
  assert.equal(paperTitle(t.meta), `4학년 과학 5단원 ${SHOWN} 단원평가`);
  assert.ok(t.paper.text.startsWith(`4학년 과학 5단원 ${SHOWN} 단원평가\n`) && !t.paper.text.includes('〔'), t.paper.text);
  assert.ok(JSON.stringify(paperDoc(t.meta, madeItems(t)).blocks).includes(SHOWN));
  // AI로 가는 것: 만들 때 보낸 가린 글
  t.students = [{ no: 1, status: 'done', items: { 1: { pts: 50, read: '①' }, 2: { pts: 0, read: '모르겠어요' } } }];
  const req = { items: [{ no: 2, content: '이슬이 맺히는 까닭', type: 'essay', answer: '밤에 기온이 내려가서', points: 50, criteria: t.key.items[1].criteria, groups: [], answers: [{ id: 'a1', text: '모르겠어요' }] }] };
  const sent = { grade: gradePrompt(t, 1), review: gradeReviewPrompt(t, 1, [2]), feedback: feedbackPrompt(t, t.students), redo: redoPrompt(t, t.key.items), miss: missPrompt(t, req) };
  for (const [k, p] of Object.entries(sent)) assert.ok(!leaks(p) && p.includes(SENT), `${k}: ${p.slice(0, 500)}`);
  for (const p of [sent.grade, sent.review]) assert.ok(p.includes(`[평가] 4학년 과학 5단원 ${SENT}\n`) && p.includes(`[평가지 글]\n4학년 과학 5단원 ${SENT} 단원평가\n`), p.slice(0, 600));
  assert.ok(sent.grade.includes('1. 아침에 풀잎에 맺힌 이슬은') && sent.grade.includes('2 | 서술형 | (예) 밤에 기온이 내려가서 | 50 | 기온과 수증기를 이어 쓰면 만점'), sent.grade);
  // 선생님이 단원 이름을 고쳐 쓰면 고친 글 그대로(만들 때 넣은 문제지 제목 줄은 여전히 가린 글)
  t.meta.unitName = '날씨와 이슬';
  const g2 = gradePrompt(t, 1);
  assert.ok(g2.includes('[평가] 4학년 과학 5단원 날씨와 이슬\n') && !leaks(g2) && g2.includes(`${SENT} 단원평가`), g2.slice(0, 600));
});

test('[C22 채점] 정답표·문항·학생 답은 다시 가리지 않음: [이 문항 다시 만들기]로 「김구 선생님」을 가려 보낸 뒤에도 채점·검토·틀린 까닭 요청의 「김구」는 그대로', () => {
  const s = freePick('사회', '2. 광복을 위한 노력(한가람 선생님 자료)\n대한민국 임시 정부의 활동').scope;
  const items = [
    { no: 1, type: 'short', question: '다음 중 김구 선생님이 대한민국 임시 정부에서 맡은 일은 무엇인가요?', answer: '주석', content: '임시 정부에서 맡은 일', points: 50 },
    { no: 2, type: 'short', question: '대한민국 임시 정부의 주석으로 광복을 위해 힘쓴 사람은 누구인가요?', answer: '김구', content: '임시 정부를 이끈 사람', points: 50 }];
  // 2번 [이 문항 다시 만들기](unit-maker redoOne): 다른 문항 글을 범위의 가리개로 가려 보냄 — 만들 때 한 번만
  makeScope.maskList(s, items, ['question']);
  const t = madeTest(s, items, 6);
  t.students = [{ no: 1, status: 'done', items: { 1: { pts: 50, read: '주석' }, 2: { pts: 0, read: '안창호' } } }];
  const req = { items: [{ no: 2, content: '임시 정부를 이끈 사람', type: 'short', answer: '김구', points: 50, criteria: '', groups: [], answers: [{ id: 'a1', text: '안창호' }] }] };
  const g = gradePrompt(t, 1), r = gradeReviewPrompt(t, 1, [2]), m = missPrompt(t, req);
  for (const p of [g, r]) assert.ok(p.includes('2 | 단답 | 김구 | 50') && p.includes('1. 다음 중 김구 선생님이 대한민국') && !p.includes('〔이름2〕'), p);
  assert.ok(m.includes('정답 김구') && m.includes('a1: 안창호') && !m.includes('〔이름2〕'), m);
  // 범위 첫 줄의 교직원 이름만 만들 때 보낸 가린 글로
  assert.ok(g.includes('[평가] 6학년 사회 2단원 광복을 위한 노력(〔이름1〕 선생님 자료)\n') && !g.includes('한가람'), g.slice(0, 400));
});

test('[C22 채점] 직접 쓴 범위로 만든 활동지: 채점·검토·기준 요청 글의 단원·활동 이름은 만들 때 가린 글, 활동 이름·단원·학생 활동지 글은 원래 이름', () => {
  const s = freePick('과학', `${STAFF}\n습도와 이슬`).scope;
  const tasks = normTasks({ items: [{ kind: 'draw', ask: '이슬이 맺힌 풀잎을 그려 보세요.', answer: '풀잎 위 물방울', ok: '물방울을 자세히 그림', part: '풀잎만 그림' }] });
  const a = madeActivity(s, '〔이름1〕 선생님과 이슬 관찰', tasks);
  assert.equal(a.meta.title, '한가람 선생님과 이슬 관찰');
  assert.equal(a.meta.unit, STAFF);
  assert.ok(a.sheet.student.startsWith(`한가람 선생님과 이슬 관찰\n과학 · ${STAFF}\n`), a.sheet.student);
  const crit = typeof actAI.criteriaFor === 'function' ? actAI.criteriaFor(a, 0) : criteriaPrompt({ meta: a.meta, student: a.sheet.student, teacher: a.sheet.teacher });
  const sent = { grade: actGradePrompt(a, 1), review: actReviewPrompt(a, [{ no: 1, read: '물방울', mark: 't', why: '' }]), criteria: crit };
  for (const [k, p] of Object.entries(sent)) assert.ok(!leaks(p), `${k}: ${p.slice(0, 500)}`);
  const unit = `5. ${SENT}`;
  assert.ok(sent.grade.includes(`과학 · ${unit}단원 · 「〔이름1〕 선생님과 이슬 관찰」`) && sent.grade.includes('묻는 말: 이슬이 맺힌 풀잎을'), sent.grade.slice(0, 400));
  assert.ok(crit.includes(`과학 · ${unit}단원 · 「〔이름1〕 선생님과 이슬 관찰」`) && crit.includes(`[학생용 활동지 글]\n〔이름1〕 선생님과 이슬 관찰\n과학 · ${unit}\n\n1. 이슬이 맺힌 풀잎을 그려 보세요.`), crit);
  // 선생님이 활동 이름을 고쳐 쓰면 고친 글 그대로
  a.meta.title = '이슬 관찰';
  const g2 = actGradePrompt(a, 1);
  assert.ok(g2.includes('「이슬 관찰」') && !leaks(g2), g2.slice(0, 400));
});

test('[C22 채점] 평가지 채점 평어의 참고 줄(core/eval-refs): 직접 쓴 범위로 만든 단원평가·활동지 이름은 만들 때 가린 글로 AI에 감, 화면 근거 글은 원래 이름', () => {
  const s = freePick('과학', `${STAFF}\n습도와 이슬`).scope;
  const t = madeTest(s, [{ no: 1, type: 'short', question: '풀잎에 맺힌 물방울을 무엇이라 하나요?', answer: '이슬', content: '이슬', points: 100 }]);
  t.students = [{ no: 1, status: 'done', items: { 1: { pts: 100 } }, good: '이슬을 잘 앎' }];
  saveTest(t);
  const a = madeActivity(s, '〔이름1〕 선생님과 이슬 관찰', normTasks({ items: [{ kind: 'write', ask: '이슬이 맺히는 까닭을 쓰세요.', ok: 'a', part: 'b' }] }));
  a.students = [{ no: 1, status: 'done', level: 'good', good: '잘 씀', next: '-' }];
  saveActivity(a);
  const refs = [{ kind: 'unit', id: t.id }, { kind: 'activity', id: a.id }];
  const l = refLines(refs, 1);
  assert.ok(!leaks(l) && l.includes('단원평가 「4학년 과학 5단원 날씨와 우리 생활(〔이름1〕') && l.includes('활동지 「〔이름1〕 선생님과 이슬 관찰」'), l);
  // 근거(스펙 §5-2): 화면 글은 원래 이름, AI로 보내는 글은 가린 글
  const ev = evidenceList(refItems(refs, 1));
  assert.ok(ev[0].label.includes('날씨와 우리 생활(한가람') && ev[1].label.includes('한가람 선생님과 이슬 관찰'), JSON.stringify(ev));
  assert.ok(!leaks(evidencePrompt(ev)), evidencePrompt(ev));
});

test('[C22 채점] 지나치게 바꾸지 않음: 가린 이름이 없는 범위·직접 넣은 정답표·잘못 남은 값은 요청 글이 그대로', () => {
  const plain = freePick('사회', '1. 우리 고장의 모습\n고장의 자랑거리 알기').scope;
  const t = madeTest(plain, [{ no: 1, type: 'short', question: '한가람 마을의 자랑거리를 쓰세요.', answer: '시장', points: 100 }], 3);
  assert.equal(t.made.ai, undefined);
  const g = gradePrompt(t, 1);
  assert.ok(g.includes('[평가] 3학년 사회 1단원 우리 고장의 모습\n') && g.includes('1. 한가람 마을의 자랑거리를 쓰세요.') && !g.includes('〔'), g.slice(0, 400));
  // 직접 넣은 정답표(만든 물음 없음), 모양이 잘못된 값
  const hand = { meta: { subject: '수학', grade: 3, unitNo: 2, unitName: '평면도형' }, key: { items: [{ no: 1, type: 'short', answer: '3', points: 100, criteria: '' }] }, paper: { text: '' }, students: [] };
  assert.ok(gradePrompt(hand, 1).includes('[평가] 3학년 수학 2단원 평면도형\n'));
  const odd = { ...hand, made: { ai: { unitName: '평면도형', subject: ['', 'x'], grade: [3, 4] } } };
  assert.ok(gradePrompt(odd, 1).includes('[평가] 3학년 수학 2단원 평면도형\n'));
  // 활동지도: 가린 이름이 없으면 남기지 않음
  const a = madeActivity(plain, '자랑거리 찾기', normTasks({ items: [{ kind: 'write', ask: '한가람 마을의 자랑거리를 쓰세요.', ok: 'a', part: 'b' }] }));
  assert.equal(a.made.ai, undefined);
  assert.ok(actGradePrompt(a, 1).includes('사회 · 1. 우리 고장의 모습단원 · 「자랑거리 찾기」') && !actGradePrompt(a, 1).includes('〔'));
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

test('[C22 기초학력] 영역 없는 만든 평가: 학습 결손 영역 이름(기초학력 사전·사후 점수 → 결과 보고서 AI)은 만들 때 가린 글, 사후 점수 맞추기도 같은 이름으로', async () => {
  const { gapStudents, areaPct } = await import('../../web/menus/evaluate/unit/unit-gap.js');
  const s = freePick('과학', `${STAFF}\n습도와 이슬`).scope;
  const t = madeTest(s, DEW.map(it => ({ ...it, domain: '' })));
  t.students = [{ no: 1, status: 'done', items: { 1: { pts: 0, read: '②' }, 2: { pts: 0, read: '모르겠어요' } } }];
  const gap = gapStudents([t], { cut: 60 });
  assert.equal(gap.length, 1);
  const names = gap[0].areas.map(a => a.name);
  assert.ok(names.length && names.every(n => !leaks(n) && n.includes(SENT)), JSON.stringify(names));
  assert.equal(areaPct(t, 1, names[0]), 0, '같은 이름으로 사후 점수를 찾음');
});
