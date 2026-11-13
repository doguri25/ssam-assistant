// 오답 유형 묶기 → 5분 보충 활동 (스펙 2026-11-13-miss-tour-check §1): 고르기·기호·선 잇기는 앱이 고른 답으로, 빈 답·「안 함」은 「답을 쓰지 않음」,
// 단답·서술형은 AI가 까닭으로(임시 번호 a1·a2만 보냄), 묶음마다 5분 활동, 선생님이 고친 활동은 다시 묶어도 남음, 다시 채점하면 그 문항 묶음은 낡음
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrongOf, appGroups, missTargets, missSig, missRequest, normMiss, missGot, mergeItem, missView, setAct, missText, groupId, BLANK, OTHER, PENDING } from '../../web/menus/evaluate/unit/unit-miss.js';
import { missPrompt } from '../../web/menus/evaluate/unit/unit-ai.js';
import { missDoc } from '../../web/menus/evaluate/unit/unit-docs.js';

const C = (read, pts) => ({ read, pts, ai: pts, flag: '', why: '', ok: true, manual: false });
const ITEMS = [
  { no: 1, content: '중요한 내용 찾기', domain: '이해', type: 'choice', answer: '③', points: 4, criteria: '', pages: '' },
  { no: 2, content: '세 자리 수 덧셈', domain: '계산', type: 'short', answer: '512', points: 4, criteria: '', pages: '' },
  { no: 3, content: '까닭 쓰기', domain: '이해', type: 'essay', answer: '(예) 받아올림을 해야 해요.', points: 10, criteria: '받아올림을 말하면 정답', pages: '' },
  { no: 4, content: '중심 문장 두 개', domain: '이해', type: 'choice', answer: '②, ④', points: 4, criteria: '', pages: '' },
  { no: 5, content: '낱말 뜻', domain: '지식', type: 'symbol', answer: '㉯', points: 4, criteria: '', pages: '' },
  { no: 6, content: '선 잇기', domain: '이해', type: 'match', answer: '(1) - ②  (2) - ①', points: 4, criteria: '', pages: '' },
  { no: 7, content: '○표 하기', domain: '이해', type: 'choice', answer: '(2) ○', points: 4, criteria: '', pages: '' }
];
/* 학생 번호는 문항 번호와 겹치지 않게(17·23·31·…) — 프롬프트에 학생 번호가 없는지 보려고 */
const ROWS = {
  17: ['①', '500', '받아올림을 안 했어요', '②', '㉮', '(1)-①, (2)-②', '(1)'],
  23: ['① ', '', '김하늘이 도와줘서 풀었어요', '④,②', '㉯', '(1) - ① (2) - ②', '(2)'],
  31: ['②', '안 함', '', '②, ④', '㉯', '(1)-②, (2)-①', '(1)'],
  44: ['③', '412', '모르겠어요', '①, ④', '㉮', '(1)-②, (2)-②', '(2)'],
  58: ['안 함', '512', '받아올림을 해야 해요', '②', '㉯', '(1)-②, (2)-①', '(2)']
};
const FULL = { 17: [0, 0, 0, 0, 0, 0, 0], 23: [0, 0, 10, 4, 4, 0, 4], 31: [0, 0, 0, 4, 4, 4, 0], 44: [4, 0, 0, 0, 0, 0, 4], 58: [0, 4, 10, 0, 4, 4, 4] };
function T() {
  return {
    id: 't1', meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '덧셈과 뺄셈', round: 1, date: '2026-10-20' },
    key: { domains: [], items: ITEMS.map(i => ({ ...i })) }, paper: { text: '' }, done: true,
    students: [
      ...Object.entries(ROWS).map(([no, reads]) => ({ no: +no, skip: false, status: 'done', items: Object.fromEntries(reads.map((r, i) => [i + 1, C(r, FULL[no][i])])) })),
      // 결석(채점 안 함)·아직 채점하지 않은 학생은 뺌
      { no: 60, skip: true, status: 'done', items: { 1: C('①', 0) } },
      { no: 61, skip: false, status: 'idle', items: { 1: C('①', 0) } }
    ]
  };
}
const it = (t, no) => t.key.items.find(i => i.no === no);

test('틀린 학생: 채점을 마친 학생 가운데 만점이 아닌 학생(부분 점수 포함), 결석·채점 전은 뺌', () => {
  const t = T();
  assert.deepEqual(wrongOf(t, it(t, 1)).map(w => w.no), [17, 23, 31, 58]);
  assert.deepEqual(wrongOf(t, it(t, 3)).map(w => [w.no, w.pts]), [[17, 0], [31, 0], [44, 0]]);
  t.students[0].items[3].pts = 6; // 부분 점수도 만점이 아니면 틀린 학생
  assert.ok(wrongOf(t, it(t, 3)).some(w => w.no === 17 && w.pts === 6));
  assert.deepEqual(missTargets(t).map(i => i.no), [1, 2, 3, 4, 5, 6, 7]);
});

test('고르기: 학생이 쓴 답(정리한 꼴)으로 묶음 — 띄어쓰기·차례가 달라도 같은 답, 빈 답·「안 함」은 「답을 쓰지 않음」', () => {
  const t = T();
  const g = appGroups(t, it(t, 1));
  assert.deepEqual(g.groups.map(x => [x.why, x.nos, x.src, x.act]), [['①을 고름', [17, 23], 'app', ''], ['②를 고름', [31], 'app', ''], [BLANK, [58], 'app', '']]);
  assert.equal(BLANK, '답을 쓰지 않음');
  assert.deepEqual(g.rest, [], '고르기는 AI로 보낼 답이 없음');
  // 두 개 고르기: 「②」·「①, ④」(「④,②」는 정답 → 빠짐)
  assert.deepEqual(appGroups(t, it(t, 4)).groups.map(x => [x.why, x.nos]), [['②를 고름', [17, 58]], ['①, ④를 고름', [44]]]);
  // ○표 꼴 정답이면 (1)처럼
  assert.deepEqual(appGroups(t, it(t, 7)).groups.map(x => [x.why, x.nos]), [['(1)을 고름', [17, 31]]]);
});

test('기호·선 잇기: 기호로, 이은 짝으로 묶음(띄어쓰기는 무시)', () => {
  const t = T();
  assert.deepEqual(appGroups(t, it(t, 5)).groups.map(x => [x.why, x.nos]), [['㉮를 고름', [17, 44]]]);
  assert.deepEqual(appGroups(t, it(t, 6)).groups.map(x => [x.why, x.nos]), [['(1)-①, (2)-②로 이음', [17, 23]], ['(1)-②, (2)-②로 이음', [44]]]);
});

test('단답·서술형: 빈 답·「안 함」만 앱이 묶고, 나머지 답은 AI로 보낼 것(rest)', () => {
  const t = T();
  const s = appGroups(t, it(t, 2));
  assert.deepEqual(s.groups.map(x => [x.why, x.nos, x.key]), [[BLANK, [23, 31], 'blank']]);
  assert.deepEqual(s.rest.map(r => [r.no, r.read]), [[17, '500'], [44, '412']]);
  const e = appGroups(t, it(t, 3));
  assert.deepEqual(e.groups.map(x => [x.why, x.nos]), [[BLANK, [31]]]);
  assert.deepEqual(e.rest.map(r => r.no), [17, 44]);
});

test('AI 요청: 임시 번호(a1·a2…, 묶음은 g1·g2…)만 — 학생 번호·이름은 없음, 답 글의 이름처럼 보이는 말은 가림', () => {
  const t = T();
  t.students[1].items[2] = C('김하늘이 512라고 했어요', 0); // 23번 2번 문항: 이름이 든 답
  const req = missRequest(t, [it(t, 1), it(t, 2), it(t, 3)]);
  assert.deepEqual(Object.keys(req.ids), ['a1', 'a2', 'a3', 'a4', 'a5'], '답마다 다른 임시 번호, 요청 전체에서 하나씩');
  assert.deepEqual(Object.values(req.ids).map(m => [m.item, m.no]), [[2, 17], [2, 23], [2, 44], [3, 17], [3, 44]]);
  assert.deepEqual(Object.keys(req.gs), ['g1', 'g2', 'g3', 'g4', 'g5']);
  assert.deepEqual(req.gs.g1, { item: 1, key: 'a:1' });
  const p = missPrompt(t, req);
  assert.ok(p.startsWith('[단원평가 틀린 까닭]'), p.slice(0, 40));
  assert.ok(p.includes('중요한 내용 찾기') && p.includes('512') && p.includes('받아올림을 말하면 정답'), '문항·정답·채점 기준');
  assert.ok(p.includes('a1') && p.includes('g1') && p.includes('①을 고름'), '임시 번호·앱 묶음');
  assert.ok(p.includes('500') && p.includes('412') && p.includes('받아올림을 안 했어요'), '틀린 답 글');
  assert.ok(!p.includes('김하늘') && p.includes('○○○'), '이름 가림');
  for (const no of ['17', '23', '31', '44', '58']) assert.ok(!p.includes(no), `학생 번호 ${no}가 들어감`);
  assert.ok(!/\d\s*번/.test(p), '「n번」 꼴이 있음');
  assert.ok(p.includes('"items"') && p.includes('"ids"') && p.includes('"act"'), '출력 모양');
  // 예시 평가 표시는 AI에 보내지 않음
  assert.ok(!missPrompt({ ...t, meta: { ...t.meta, sample: true } }, req).includes('(예시)'));
});

test('AI 답 정리: 임시 번호를 학생 번호로, 모르는·다른 문항·겹친 번호는 버림, 까닭 없는 묶음은 버림', () => {
  const t = T();
  const req = missRequest(t, [it(t, 1), it(t, 2), it(t, 3)]); // a1·a2: 2번 17·44, a3·a4: 3번 17·44
  const v = {
    items: [
      { no: 1, groups: [{ g: 'g1', why: '③과 헷갈림', act: '보기 비교하기' }, { g: 'g99', why: 'x', act: 'y' }, { g: 'g4', why: '다른 문항', act: 'z' }] },
      { no: 2, groups: [{ ids: ['A1', 'a99', 'a3'], why: '받아올림을 빠뜨림', act: '받아올림 두 문제 풀기' }, { ids: 'a1, a2', why: '자리값 헷갈림', act: '' }] },
      { no: 3, groups: [{ ids: ['a3'], why: '', act: '까닭 없음' }, { ids: ['a4'], why: '  '.repeat(3) + '문장을 끝맺지 않음'.repeat(10), act: '활'.repeat(400) }] },
      { no: 99, groups: [{ ids: ['a1'], why: '없는 문항', act: '' }] },
      'garbage', null
    ]
  };
  const r = normMiss(v, req);
  assert.deepEqual(r[1].app, { 'a:1': { guess: '③과 헷갈림', act: '보기 비교하기' } }, '앱 묶음: 그 문항의 g만');
  assert.equal(r[1].got, true);
  assert.deepEqual(r[2].groups, [{ why: '받아올림을 빠뜨림', nos: [17], act: '받아올림 두 문제 풀기' }, { why: '자리값 헷갈림', nos: [44], act: '' }], '대문자 A1도, 모르는 a99·다른 문항 a3는 버림, 이미 쓴 a1은 한 번만');
  assert.deepEqual(r[2].rest, []);
  assert.equal(r[3].groups.length, 1, '까닭이 빈 묶음은 버림');
  assert.ok(r[3].groups[0].why.length <= 40 && r[3].groups[0].act.length <= 200, '길이 자름');
  assert.deepEqual(r[3].rest, [17], '묶지 못한 답');
  assert.ok(!r[99]);
  assert.equal(missGot(r), true);
  // 못 읽은 답
  for (const bad of [null, 'x', { items: 'x' }, { items: [] }, []]) assert.equal(missGot(normMiss(bad, req)), false, JSON.stringify(bad));
  assert.deepEqual(normMiss(null, req)[2].rest, [17, 44]);
});

test('다시 맞추기: AI 묶음 + 묶지 못한 답은 「그 밖의 답」, 고르기 묶음에 짐작·활동(src ai), 학생 번호로', () => {
  const t = T(), req = missRequest(t, [it(t, 1), it(t, 2)]);
  const r = normMiss({ items: [{ no: 1, groups: [{ g: 'g1', why: '③과 헷갈림', act: '보기 비교하기' }] }, { no: 2, groups: [{ ids: ['a1'], why: '받아올림을 빠뜨림', act: '받아올림 연습' }] }] }, req);
  const m1 = mergeItem(t, it(t, 1), null, r[1]);
  assert.deepEqual(m1.groups.map(g => [g.why, g.nos, g.src, g.act, g.guess || '']), [['①을 고름', [17, 23], 'ai', '보기 비교하기', '③과 헷갈림'], ['②를 고름', [31], 'app', '', ''], [BLANK, [58], 'app', '', '']]);
  assert.equal(m1.ai, true); assert.equal(m1.sig, missSig(t, it(t, 1)));
  const m2 = mergeItem(t, it(t, 2), null, r[2]);
  assert.deepEqual(m2.groups.map(g => [g.why, g.nos, g.src]), [['받아올림을 빠뜨림', [17], 'ai'], [BLANK, [23, 31], 'app'], [OTHER, [44], 'app']]);
  assert.equal(OTHER, '그 밖의 답');
  // AI가 이 문항 답을 하나도 묶지 않았으면 「그 밖의 답」으로 몰지 않고 묶지 않은 채로(다시 누르면 다시 보냄)
  const m3 = mergeItem(t, it(t, 3), null, normMiss({ items: [] }, missRequest(t, [it(t, 3)]))[3]);
  assert.deepEqual(m3.groups.map(g => g.why), [BLANK]);
  assert.equal(m3.ai, false);
});

test('다시 묶어도 선생님이 고친 활동(src manual)은 남음 — 고른 답 묶음은 같은 답, 까닭 묶음은 같은 까닭·겹치는 학생으로', () => {
  const t = T();
  let req = missRequest(t, [it(t, 1), it(t, 2)]);
  const first = normMiss({ items: [{ no: 1, groups: [{ g: 'g1', why: '짐작', act: 'AI 활동 1' }, { g: 'g2', why: '짐작2', act: 'AI 활동 2' }] }, { no: 2, groups: [{ ids: ['a1', 'a2'], why: '받아올림을 빠뜨림', act: 'AI 활동' }] }] }, req);
  let m1 = mergeItem(t, it(t, 1), null, first[1]), m2 = mergeItem(t, it(t, 2), null, first[2]);
  t.miss = { at: 1, items: { 1: m1, 2: m2 } };
  t.miss = setAct(t, 1, 1, '②를 고른 학생과 보기 다시 읽기');
  t.miss = setAct(t, 2, 0, '선생님 활동');
  assert.equal(t.miss.items[1].groups[1].src, 'manual');
  // 다시 묶기(AI가 다른 말로 답함)
  req = missRequest(t, [it(t, 1), it(t, 2)]);
  const again = normMiss({ items: [{ no: 1, groups: [{ g: 'g2', why: '새 짐작', act: '새 AI 활동' }] }, { no: 2, groups: [{ ids: ['a1', 'a2'], why: '받아올린 수를 빠뜨림', act: '새 AI 활동' }] }] }, req);
  m1 = mergeItem(t, it(t, 1), t.miss.items[1], again[1]); m2 = mergeItem(t, it(t, 2), t.miss.items[2], again[2]);
  assert.deepEqual([m1.groups[1].why, m1.groups[1].act, m1.groups[1].src], ['②를 고름', '②를 고른 학생과 보기 다시 읽기', 'manual']);
  assert.equal(m1.groups[0].act, 'AI 활동 1', 'AI가 이번에 쓰지 않은 묶음은 지난 AI 활동을 둠');
  assert.deepEqual([m2.groups[0].why, m2.groups[0].act, m2.groups[0].src], ['받아올린 수를 빠뜨림', '선생님 활동', 'manual'], '까닭 글이 바뀌어도 학생이 겹치면');
  // AI 없이 다시 묶기: 까닭 묶음은 지금도 틀린 학생만 남김
  t.students.find(s => s.no === 44).items[2] = C('512', 4);
  const m4 = mergeItem(t, it(t, 2), m2, null);
  assert.deepEqual(m4.groups.map(g => [g.why, g.nos]), [['받아올린 수를 빠뜨림', [17]], [BLANK, [23, 31]]]);
});

test('낡음: 그 문항의 틀린 학생·점수·읽은 답·정답이 바뀌면 stale, 다른 문항·맞힌 학생이 바뀌면 그대로', () => {
  const t = T();
  t.miss = { at: 1, items: { 1: mergeItem(t, it(t, 1), null, null), 2: mergeItem(t, it(t, 2), null, null) } };
  const stale = no => missView(t).find(v => v.no === no).stale;
  assert.equal(stale(1), false); assert.equal(stale(2), false);
  t.students.find(s => s.no === 44).items[1].read = '③ '; // 맞힌 학생의 답 글
  assert.equal(stale(1), false, '맞힌 학생');
  t.students.find(s => s.no === 17).items[5].pts = 4; // 다른 문항
  assert.equal(stale(1), false, '다른 문항');
  t.students.find(s => s.no === 31).items[1] = C('③', 4); // 다시 채점: 31번이 맞음
  assert.equal(stale(1), true);
  assert.equal(stale(2), false);
  t.key.items[1].answer = '500'; // 정답을 고침
  assert.equal(stale(2), true);
  // 낡아도 저장한 묶음은 그대로 보여 줌(다시 묶기 전)
  assert.deepEqual(missView(t).find(v => v.no === 1).groups.map(g => g.nos), [[17, 23], [31], [58]]);
});

test('화면 목록: 저장 전엔 앱 묶음 + 아직 묶지 않은 학생, 묶음이 많은 문항부터, 예전 자료(miss 없음·모양이 틀림)도 읽힘', () => {
  const t = T();
  const v = missView(t);
  assert.deepEqual(v.map(x => x.no), [1, 2, 3, 4, 6, 5, 7], v.map(x => [x.no, x.groups.length, x.pending.length]).join(' '));
  const v2 = v.find(x => x.no === 2);
  assert.deepEqual(v2.pending, [17, 44]); assert.equal(v2.n, 4); assert.equal(v2.saved, false); assert.equal(v2.ai, false);
  assert.equal(PENDING, '아직 묶지 않음');
  for (const miss of [null, 'x', { items: null }, { items: { 1: { groups: 'x' } } }, { items: { 1: null } }]) assert.equal(missView({ ...T(), miss }).length, 7, JSON.stringify(miss));
  assert.deepEqual(missView({ ...T(), students: [] }), []);
});

test('활동 고치기: 저장 전 문항이면 지금 묶음으로 저장(src manual), 낡은 문항은 낡은 표시 그대로', () => {
  const t = T();
  t.miss = setAct(t, 2, 0, '  문제를 끝까지 읽고 답 칸 확인하기  ');
  const s = t.miss.items[2];
  assert.deepEqual(s.groups.map(g => [g.why, g.src, g.act]), [[BLANK, 'manual', '문제를 끝까지 읽고 답 칸 확인하기']]);
  assert.equal(s.sig, missSig(t, it(t, 2))); assert.equal(s.ai, false); assert.ok(t.miss.at > 0);
  t.students.find(s => s.no === 17).items[2] = C('512', 4);
  t.miss = setAct(t, 2, 0, '고침');
  assert.equal(missView(t).find(x => x.no === 2).stale, true);
  assert.equal(setAct(t, 2, 9, 'x'), t.miss, '없는 묶음은 그대로');
});

test('복사 글·문서: 문항마다 「3번 · 내용 · 틀린 학생 n명」, 줄마다 까닭 · n명 · 번호 · 활동', () => {
  const t = T();
  t.miss = setAct(t, 1, 0, '보기 ①과 ③을 견줘 읽기');
  const txt = missText(t, missView(t));
  assert.ok(txt.startsWith('[3학년 수학 3단원 덧셈과 뺄셈 (1회)] 틀린 까닭'), txt.slice(0, 60));
  assert.ok(txt.includes('1번 · 중요한 내용 찾기 · 틀린 학생 4명'), txt);
  assert.ok(txt.includes('- ①을 고름 · 2명 · 17·23번 · 활동: 보기 ①과 ③을 견줘 읽기'), txt);
  assert.ok(txt.includes(`- ${BLANK} · 1명 · 58번`), txt);
  assert.ok(txt.includes(`- ${PENDING} · 2명 · 17·44번`), '아직 묶지 않은 학생도');
  const d = missDoc(t, missView(t));
  assert.equal(d.title, '3학년 수학 3단원 덧셈과 뺄셈 (1회) 틀린 까닭');
  const tb = d.blocks.find(b => b.type === 'table');
  assert.deepEqual(tb.rows[0], ['까닭', '인원', '번호', '5분 보충 활동']);
  assert.deepEqual(tb.rows[1], ['①을 고름', '2명', '17·23번', '보기 ①과 ③을 견줘 읽기']);
  assert.ok(d.blocks.some(b => b.type === 'h' && b.text === '1번 · 중요한 내용 찾기 · 틀린 학생 4명'));
  // 낡은 문항은 글로 알림
  t.students.find(s => s.no === 31).items[1] = C('③', 4);
  assert.ok(missText(t, missView(t)).includes('1번 · 중요한 내용 찾기 · 틀린 학생 3명 · 채점이 바뀌었어요'));
});

test('쌤 채팅 안내: 「틀린 까닭」이 어디 있는지 찾음', async () => {
  const { searchGuide, offlineAnswer } = await import('../../web/core/chat-knowledge.js');
  for (const q of ['틀린 까닭은 어디서 봐?', '오답 유형 묶기 어떻게 해?', '5분 보충 활동 만들어 줘']) assert.equal((searchGuide(q)[0] || {}).id, 'unit-miss', `${q}: ${JSON.stringify(searchGuide(q).map(h => [h.id, h.score]))}`);
  const a = offlineAnswer('틀린 까닭 어디 있어?');
  assert.ok(a.text.includes('4단계') && a.text.includes('틀린 까닭 묶기') && a.text.includes('번호·이름은 보내지 않아요') && a.go.includes('unit'), a.text);
});

test('활동 칸은 묶음 열쇠로 맞춤: AI가 묶은 뒤 차례가 바뀌어도 쓰던 묶음에(검토 #1), 없는 열쇠는 쓰지 않음', () => {
  const t = T(), it2 = it(t, 2);
  const blank = missView(t).find(x => x.no === 2).groups[0];
  assert.equal(blank.why, BLANK);
  const id = groupId(blank);
  // AI가 묶어 「받아올림을 빠뜨림」이 앞에 옴(선생님은 그 전에 「답을 쓰지 않음」 칸(0번째)에 쓰던 중)
  t.miss = { at: 1, items: { 2: { groups: [{ why: '받아올림을 빠뜨림', nos: [17, 44], act: 'AI 활동', src: 'ai' }, { ...blank }], sig: missSig(t, it2), ai: true } } };
  t.miss = setAct(t, 2, 0, '답 칸을 끝까지 확인하기', id);
  const g = t.miss.items[2].groups;
  assert.deepEqual(g.map(x => [x.why, x.act, x.src]), [['받아올림을 빠뜨림', 'AI 활동', 'ai'], [BLANK, '답 칸을 끝까지 확인하기', 'manual']]);
  const before = t.miss;
  assert.equal(setAct(t, 2, 0, 'x', 'w:없는 묶음'), before, '열쇠가 맞는 묶음이 없으면 그대로');
  assert.notEqual(groupId({ key: 'a:1', why: '①을 고름' }), groupId({ why: '①을 고름' }));
});

test('AI에 보내는 앱 묶음 이름도 이름을 가림(알아볼 수 없는 고르기 답 「김하늘이 말한 것」, 검토 #4)', () => {
  const t = T();
  t.students.find(s => s.no === 17).items[1] = C('김하늘이 말한 것', 0);
  const req = missRequest(t);
  const txt = JSON.stringify(req.items);
  assert.ok(!txt.includes('김하늘'), txt.slice(0, 400));
  // 화면 묶음 이름은 선생님이 보는 것이라 그대로
  assert.ok(missView(t).find(x => x.no === 1).groups.some(g => g.why.includes('김하늘')));
});
