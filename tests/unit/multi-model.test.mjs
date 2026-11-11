// 기타 › 다면평가 저장(스펙 2026-11-11): 학년도 키 multi(공통 키가 아님 — 학년도·백업을 따라감), 기본값·망가진 값, 저장·읽기,
// 기준을 바꿔도 같은 이름 항목의 값·근거자료·비고는 이어짐(맞는 항목이 없는 근거자료는 알려 줌), 평가 기간 글, 비고 칸 자동(고친 비고는 그대로)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { isYearKey } from '../../web/core/years.js';
import { KEY, normMulti, getMulti, saveMulti, remapQuant, periodText, periodLong, syncNotes, qualParsed, VIEWS } from '../../web/menus/etc/multi-model.js';
import { parseQuantText, defaultQuant, allItems } from '../../web/menus/etc/multi-quant.js';
import { parseQualText } from '../../web/menus/etc/multi-qual.js';
import { QUANT_TEXT, QUAL_TEXT } from './multi-fixtures.mjs';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const idOf = (c, n) => allItems(c).find(i => i.name === n).id;

test('multi는 학년도 키(공통 키가 아님)', () => {
  assert.equal(KEY, 'multi');
  assert.equal(isYearKey(KEY), true);
  assert.deepEqual(VIEWS, ['quant', 'qual']);
});

test('기본값: 정량 쪽, 직위 교사, 예시 기준, 빈 값들 · 망가진 값은 버림', () => {
  const m = normMulti(null);
  assert.equal(m.view, 'quant');
  assert.deepEqual(m.info, { school: '', position: '교사', name: '', gradeClass: '', subject: '', homeroom: '', duty: '', head: '', from: '', to: '', short: false });
  assert.deepEqual(m.quant.criteria, defaultQuant());
  assert.deepEqual([m.quant.formId, m.quant.formName, m.quant.values, m.quant.evidence, m.quant.notes, m.quant.notesEdited], ['', '', {}, {}, {}, {}]);
  assert.deepEqual(m.qual, { criteria: null, formId: '', formName: '', draft: '', report: null, filled: {} });
  const b = normMulti({ view: 'x', info: { name: 3, short: 'yes', from: '2025-13-01' }, quant: { criteria: { groups: 'bad' }, values: [], evidence: { a: [{ fileId: 'f', name: 'x.pdf', label: 'L' }, 'bad'] }, notes: { a: 5 } }, qual: { report: 'x', filled: [] } });
  assert.equal(b.view, 'quant'); assert.equal(b.info.name, '3'); assert.equal(b.info.short, true); assert.equal(b.info.from, '');
  assert.deepEqual(b.quant.criteria, defaultQuant()); assert.deepEqual(b.quant.values, {});
  assert.equal(b.quant.evidence.a.length, 1); assert.ok(b.quant.evidence.a[0].id, '근거자료 id');
  assert.deepEqual(b.quant.notes, {}); assert.equal(b.qual.report, null); assert.deepEqual(b.qual.filled, {});
});

test('저장·읽기(이 기기의 학년도 자료), 정성 보고서는 기준 모양으로', () => {
  store.useStorage(mem());
  const m = getMulti();
  m.view = 'qual'; m.info.name = '한가람'; m.quant.values = { q1: { v: '22.8', deduct: '1' } };
  m.qual.criteria = parseQualText(QUAL_TEXT); m.qual.report = { basics: { '담당 과목': '영어' }, sections: [], self: { 노력도: '만족' } };
  m.qual.filled = { 'basics.담당 과목': true, 'sections.learn.추진 목표': true, 'self.노력도': true, 아무거나: true, 'basics.x': 'yes' };
  assert.ok(saveMulti(m));
  const r = getMulti();
  assert.deepEqual(r.qual.filled, { 'basics.담당 과목': true, 'sections.learn.추진 목표': true, 'self.노력도': true }, '고친 칸 길');
  assert.equal(r.view, 'qual'); assert.equal(r.info.name, '한가람'); assert.deepEqual(r.quant.values.q1, { v: '22.8', count: '', deduct: '1' });
  assert.equal(r.qual.report.basics['담당 과목'], '영어'); assert.equal(r.qual.report.sections.length, 4); assert.equal(r.qual.report.self.노력도, '만족');
  assert.ok(r.qual.report.missing.length > 0);
  assert.equal(qualParsed(r).sections[3].parts.length, 3);
  assert.equal(qualParsed(normMulti(null)).basics.length, 10, '기준이 없으면 예시 서식');
});

test('기준을 바꾸면 같은 이름 항목의 값·근거자료·비고가 이어지고, 맞는 항목이 없는 근거자료는 dropped', () => {
  const old = defaultQuant(), neu = parseQuantText(QUANT_TEXT);
  const q = normMulti(null).quant;
  const h = idOf(old, '주당 수업시수'), award = idOf(old, '학생 지도 실적');
  q.values[h] = { v: '22', count: '', deduct: '' };
  q.evidence[h] = [{ id: 'e1', fileId: 'f1', name: 'a.pdf', label: '교육과정' }];
  q.notes[h] = '• 교육과정'; q.notesEdited[h] = true;
  q.evidence[award] = [{ id: 'e2', fileId: 'f2', name: 'b.jpg', label: '상장' }];
  const { quant, dropped } = remapQuant(q, neu);
  const nh = idOf(neu, '주당 수업시수');
  assert.deepEqual(quant.criteria, neu);
  assert.deepEqual(quant.values[nh], { v: '22', count: '', deduct: '' });
  assert.equal(quant.evidence[nh][0].fileId, 'f1'); assert.equal(quant.notes[nh], '• 교육과정'); assert.equal(quant.notesEdited[nh], true);
  assert.deepEqual(dropped.map(e => e.fileId), ['f2'], '「학생 지도 실적」은 새 기준에 같은 이름이 없음');
  assert.equal(Object.keys(quant.evidence).length, 1);
});

test('비고 칸 자동: 근거자료 라벨마다 • 줄, 선생님이 고친 비고는 다시 쓰지 않음', () => {
  const q = normMulti(null).quant;
  q.evidence.a = [{ id: '1', fileId: 'f', name: 'x.pdf', label: '연수 이수증 [2025.08.01.]' }];
  syncNotes(q, 'a');
  assert.equal(q.notes.a, '• 연수 이수증 [2025.08.01.]');
  q.notes.a = '직접 쓴 비고'; q.notesEdited.a = true; q.evidence.a.push({ id: '2', fileId: 'g', name: 'y.pdf', label: '다른 것' });
  syncNotes(q, 'a');
  assert.equal(q.notes.a, '직접 쓴 비고');
});

test('평가 기간 글: 내 정보 날짜 → 기준 글 → 학년도(3. 1. ~ 이듬해 2월 끝날)', () => {
  const c = parseQuantText(QUANT_TEXT);
  assert.equal(periodText({ from: '2026-03-01', to: '2027-02-28' }, c, 2026), '2026. 3. 1. ~ 2027. 2. 28.');
  assert.equal(periodText({}, c, 2026), '2025. 3. 1. ~ 2026. 2. 28.');
  assert.equal(periodText({}, defaultQuant(), 2027), '2027. 3. 1. ~ 2028. 2. 29.', '윤년');
  assert.equal(periodLong({ from: '2025-03-01', to: '2026-02-28' }, 2025), '2025년 3월 1일부터 2026년 2월 28일까지');
  assert.equal(periodLong({}, 2026), '2026년 3월 1일부터 2027년 2월 28일까지');
});
