// 행사 모델: 저장·목록, AI 답 다듬기, 역할 부담, 가정통신문 빠진 항목, 확정 막기, 한글 문서
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { KINDS, DOCS, newEvent, listEventPlans, getEvent, saveEvent, deleteEvent, currentEventId, setCurrentEvent, normOptions, normRoles, normItems, roleLoad, letterMissing, confirmBlockers, docDoc, REF_KINDS, normRefs, guessKind, refsBlock, normRefNotes } from '../../web/menus/plan/event-model.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('종류·문서 이름', () => {
  assert.deepEqual(KINDS.map(k => k[0]), ['sports', 'arts', 'field', 'other']);
  assert.deepEqual(DOCS.map(d => d[1]), ['계획서', '역할 분담표', '안전 점검표', '가정통신문']);
});

test('저장·목록·지우기·현재·망가진 값', () => {
  store.useStorage(mem());
  const a = saveEvent({ ...newEvent(), name: '운동회' });
  const b = saveEvent({ ...newEvent(), name: '학예회', step: 3, maxStep: 2 });
  assert.deepEqual(listEventPlans().map(e => e.name), ['학예회', '운동회']);
  assert.equal(getEvent(b.id).maxStep, 3);
  setCurrentEvent(a.id); assert.equal(currentEventId(), a.id);
  deleteEvent(a.id); assert.equal(getEvent(a.id), null);
  store.set('events', 'x'); assert.deepEqual(listEventPlans(), []);
  store.set('events', [null, { id: 3 }, { id: 'e1', name: '현장', kind: '없는', staff: [{ name: '김', duty: '안전' }, 'x'] }]);
  const l = listEventPlans();
  assert.equal(l.length, 1); assert.equal(l[0].kind, 'other'); assert.deepEqual(l[0].staff, [{ name: '김', duty: '안전' }]);
  assert.equal(l[0].outdoor, false); assert.equal(l[0].options, null); assert.equal(l[0].step, 1);
});

test('구성안 다듬기', () => {
  const o = normOptions([{ label: '보완안', timetable: [{ time: '09:00', activity: '개회식' }, { time: '9:30' }], pros: ['a', 1], budget: [{ name: '상품', amount: '300,000' }] }, '쓰레기', {}, {}, {}]);
  assert.equal(o.length, 1);
  assert.equal(o[0].timetable.length, 1); assert.deepEqual(o[0].pros, ['a']);
  assert.equal(o[0].budget[0].amount, 300000);
  assert.deepEqual(normOptions('x'), []);
  assert.equal(normOptions([1, 2, 3, 4].map(i => ({ label: '안' + i, timetable: [{ activity: 'a' }] }))).length, 3);
});

test('역할 다듬기와 부담', () => {
  assert.deepEqual(normRoles([{ name: '김교사', roles: ['진행', ''] }, { name: '없는 사람', roles: ['x'] }], [{ name: '김교사' }]), [{ name: '김교사', roles: ['진행'] }]);
  assert.equal(normRoles([{ name: '김교사', roles: ['진행'] }, { name: '박', roles: ['x'] }], []).length, 2);
  assert.deepEqual(roleLoad([{ name: 'A', roles: ['1', '2', '3', '4', '5'] }, { name: 'B', roles: ['1'] }, { name: 'C', roles: ['1'] }]), ['A']);
  assert.deepEqual(roleLoad([{ name: 'A', roles: ['1', '2', '3'] }]), []);
  assert.deepEqual(roleLoad([]), []);
});

test('설문 문항 다듬기', () => {
  assert.deepEqual(normItems([{ type: 'scale', q: '즐거웠나요?' }, { type: '모름', q: '좋았던 점은?' }, { q: '' }, 'x']), [{ type: 'scale', q: '즐거웠나요?' }, { type: 'text', q: '좋았던 점은?' }]);
});

test('가정통신문 빠진 항목', () => {
  assert.deepEqual(letterMissing('일시: 5월 3일\n옷차림: 체육복\n문의: 교무실 000-0000'), ['준비물']);
  assert.deepEqual(letterMissing('날짜 준비물 복장 연락처'), []);
  assert.deepEqual(letterMissing(''), ['날짜', '준비물', '복장', '문의처']);
});

const E = () => ({ ...newEvent(), name: '가을 운동회', purpose: '협동심', grades: '전교생', date: '2027-05-07', place: '운동장', budget: '50만 원',
  options: normOptions([{ label: '새로운 안', timetable: [{ time: '09:00', activity: '개회식', place: '운동장' }], budget: [{ name: '상품', amount: 300000 }] }]), picked: 0,
  docs: { plan: '본문', safety: '안전 점검', letter: '날짜 준비물 복장 문의', rain: '우천 시 강당', roles: [{ name: '김교사', roles: ['진행'] }] } });

test('확정 막기: 야외는 안전 점검표·우천 일정, 가정통신문 빠진 항목', () => {
  const e = E();
  assert.deepEqual(confirmBlockers({ ...e, outdoor: true }), []);
  assert.deepEqual(confirmBlockers({ ...e, outdoor: true, docs: { ...e.docs, safety: '', rain: ' ' } }), ['야외 행사는 안전 점검표가 있어야 해요', '야외 행사는 우천 시 대체 일정이 있어야 해요']);
  assert.deepEqual(confirmBlockers({ ...e, outdoor: false, docs: { ...e.docs, safety: '', rain: '' } }), []);
  assert.deepEqual(confirmBlockers({ ...e, docs: { ...e.docs, letter: '날짜 준비물' } }), ['가정통신문에 빠진 항목: 복장·문의처']);
});

test('한글 문서', () => {
  const e = E();
  const p = docDoc(e, 'plan');
  assert.equal(p.title, '가을 운동회 운영 계획');
  assert.deepEqual(p.blocks.find(b => b.type === 'table').rows[0], ['항목', '내용']);
  assert.deepEqual(docDoc(e, 'roles').blocks.find(b => b.type === 'table').rows[0], ['이름', '맡은 역할']);
  assert.equal(docDoc(e, 'letter').title, '가을 운동회 안내');
  assert.ok(docDoc({ ...e, outdoor: true }, 'safety').blocks.some(b => b.type === 'p' && b.text.includes('우천 시 강당')));
});

test('저장 공간이 모자라면 saveEvent는 null', () => {
  store.useStorage({ ...mem(), setItem: () => { throw new Error('QuotaExceededError'); } });
  assert.equal(saveEvent({ ...newEvent(), name: '큰 행사' }), null);
});

test('저장된 설문 결과가 망가져도 읽을 수 있는 것만, 서술형은 300개까지(개수는 그대로)', () => {
  store.useStorage(mem());
  const many = Array.from({ length: 450 }, (_, i) => '답 ' + i);
  store.set('events', [{ id: 'e1', name: '운동회', survey: { result: { n: 450, few: false, questions: [
    { q: '좋았나요?', type: 'scale', counts: [1, 2, 3, 4, 5], mean: 3.67 },
    { q: '망가진 척도', type: 'scale', counts: 'x', mean: 3 },
    { q: '좋았던 점', type: 'text', answers: many },
    null, 'x'] } } }]);
  const r = getEvent('e1').survey.result;
  assert.deepEqual(r.questions.map(q => q.q), ['좋았나요?', '좋았던 점']);
  assert.equal(r.questions[1].answers.length, 300);
  assert.equal(r.questions[1].count, 450);
  store.set('events', [{ id: 'e2', name: 'x', survey: { result: { n: 'x', questions: 1 } } }]);
  assert.equal(getEvent('e2').survey.result, null);
});

test('참고 자료: 종류·이름·10개·합쳐 6만 자', () => {
  assert.deepEqual(REF_KINDS.map(k => k[0]), ['upper', 'official', 'other']);
  const r = normRefs([{ id: 'a', kind: 'bad', name: '', text: '가' }, { kind: 'official', name: '공문', text: '' }, 'x', { id: 'b', kind: 'upper', name: '계획', text: 'x'.repeat(35000) }, { id: 'c', kind: 'official', name: '공문 2', text: 'y'.repeat(35000) }]);
  assert.deepEqual(r.map(x => [x.id, x.kind, x.name]), [['a', 'other', '참고 자료'], ['b', 'upper', '계획'], ['c', 'official', '공문 2']]);
  assert.equal(r.reduce((n, x) => n + x.text.length, 0), 60000);
  assert.equal(r[2].text.length, 60000 - 1 - 35000);
  assert.equal(normRefs(Array.from({ length: 12 }, (_, i) => ({ id: 'r' + i, text: 't' }))).length, 10);
  assert.ok(normRefs([{ text: '본문' }])[0].id);
  assert.deepEqual(normRefs('x'), []);
});

test('파일 이름으로 종류 짐작', () => {
  assert.equal(guessKind('2027 학교폭력예방 교육청 공문.hwp'), 'official');
  assert.equal(guessKind('홍성교육지원청 안내.pdf'), 'official');
  assert.equal(guessKind('학교 교육계획.hwpx'), 'upper');
  assert.equal(guessKind('사진.png'), 'other');
});

test('AI에 보낼 참고 자료: 짧은 것은 다, 긴 것은 남은 몫까지', () => {
  assert.equal(refsBlock([]), '');
  const refs = normRefs([{ id: 'l', kind: 'upper', name: '긴 계획', text: 'L'.repeat(50000) }, { id: 's', kind: 'official', name: '짧은 공문', text: 'S'.repeat(1000) }]);
  const b = refsBlock(refs, 24000);
  assert.ok(b.indexOf('[상위 계획] 긴 계획') < b.indexOf('[교육청 공문] 짧은 공문'), '순서');
  assert.equal((b.match(/S/g) || []).length, 1000);
  assert.equal((b.match(/L/g) || []).length, 23000);
  assert.ok(b.includes('뒷부분 줄임'));
});

test('참고 반영 메모 다듬기와 저장', () => {
  assert.deepEqual(normRefNotes([' 안전요원 2명 ', '', 3, 'x'.repeat(300), 'a', 'b', 'c', 'd', 'e', 'f', 'g']).map(x => x.length), [7, 200, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(normRefNotes(null), []);
  store.useStorage(mem());
  const e = saveEvent({ ...newEvent(), name: '운동회', refs: [{ id: 'a', kind: 'official', name: '공문', text: '안전요원 2명' }], refNotes: { options: ['안전요원 2명'], docs: 'x' } });
  const g = getEvent(e.id);
  assert.equal(g.refs[0].text, '안전요원 2명'); assert.deepEqual(g.refNotes, { options: ['안전요원 2명'], docs: [], stale: false });
  store.set('events', [{ ...newEvent(), id: 'z', name: 'z', refs: 'x', refNotes: 3 }]);
  assert.deepEqual(getEvent('z').refs, []); assert.deepEqual(getEvent('z').refNotes, { options: [], docs: [], stale: false });
});

test('예전에 저장한 설문 결과에 개인정보 열이 있으면 읽을 때 뺌', async () => {
  const { saveEvent, getEvent, newEvent } = await import('../../web/menus/plan/event-model.js');
  const e = newEvent();
  e.name = '운동회';
  e.survey = { target: 'student', items: [], formUrl: '', textSummary: '', report: '', nextMemo: '', result: { n: 2, few: true, questions: [{ q: '이름을 적어 주세요', type: 'text', answers: ['김하나', '이두리'] }, { q: '좋았던 점', type: 'text', answers: ['재미'] }] } };
  const saved = saveEvent(e);
  assert.deepEqual(getEvent(saved.id).survey.result.questions.map(q => q.q), ['좋았던 점']);
});
