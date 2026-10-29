// 학급운영계획 모델: 목차 읽기·표준 목차·칸별 작년 글·역할·첨부 종류·저장·다듬기·지침 판정·시수표·한글 문서·새 학년도
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as store from '../../web/core/store.js';
import { carryOver } from '../../web/core/years.js';
import { overlap } from '../../web/menus/plan/year-model.js';
import {
  STANDARD, parseOutline, sectionBodies, roleOf, attachKind, leaves, newPlan, listPlans, getPlan, savePlan, deletePlan, currentId, setCurrent,
  normSections, normMonthly, normEvalRows, normGuide, guideStatus, insertSentence, hoursRows, planTitle, planDoc, planText, draftText
} from '../../web/menus/plan/classplan-model.js';

const LAST = readFileSync(new URL('../fixtures/classplan-last.txt', import.meta.url), 'utf8');
function mem(fail = false) {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (fail) throw new Error('QuotaExceededError'); m.set(k, String(v)); }, removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const titles = o => o.map(x => `${x.level}:${x.title}`);

test('작년 계획서 목차: 로마 숫자(1단계)·숫자(2단계), 표 안 단원명·차례 줄·「가.」는 목차가 아님', () => {
  const o = parseOutline(LAST);
  assert.deepEqual(titles(o), [
    '1:학급 현황', '2:학급 실태', '2:학급 조직', '1:학급 교육 목표', '2:급훈과 교육 목표', '2:학급 경영 방침',
    '1:학급 교육과정 편성', '2:편성의 방향', '2:편제 및 시간 배당', '2:학급 특색 교육 및 운영계획', '1:평가 계획', '2:교과 평가 계획', '2:창의적 체험활동 평가 계획'
  ]);
  assert.ok(o.every(x => x.id && typeof x.id === 'string') && new Set(o.map(x => x.id)).size === o.length, 'id');
  assert.equal(o.find(x => x.title === '편제 및 시간 배당').role, 'hours');
  assert.equal(o.find(x => x.title === '교과 평가 계획').role, 'eval');
  assert.equal(o.find(x => x.title === '평가 계획').role, '', '아래 칸이 있는 1단계는 표를 받지 않음');
});

test('로마 숫자가 없으면 「1.」이 1단계, 「가.」가 2단계, 띄어쓰기 없는 「Ⅲ.학급」도 읽음', () => {
  assert.deepEqual(titles(parseOutline('1. 학급 실태\n가. 학생 수\n나. 특성\n2. 월별 계획\n월 | 활동')), ['1:학급 실태', '2:학생 수', '2:특성', '1:월별 계획']);
  assert.deepEqual(titles(parseOutline('Ⅲ.학급 교육과정 편성\n1. 편성 방향')), ['1:학급 교육과정 편성', '2:편성 방향']);
  assert.equal(parseOutline('1. 월별 계획').at(-1).role, 'monthly');
  assert.deepEqual(parseOutline('목차가 없는 글'), []);
});

test('표준 목차: 학교 「학급 교육과정 운영 평가」 항목을 모두 덮음, 시수표·평가 표·월별 표 칸이 하나씩', () => {
  const all = STANDARD.map(x => x.title).join(' ');
  for (const k of ['교육 목표', '교과 지도', '창의적 체험활동', '특색', '생활', '평가', '월별', '학부모']) assert.ok(all.includes(k), k);
  for (const r of ['hours', 'eval', 'monthly']) assert.equal(STANDARD.filter(x => x.role === r).length, 1, r);
  assert.ok(leaves(STANDARD).length >= 15);
});

test('칸별 작년 글: 머리와 다음 머리 사이, 1,500자까지', () => {
  const o = parseOutline(LAST), b = sectionBodies(LAST, o);
  const id = t => o.find(x => x.title === t).id;
  assert.ok(b[id('학급 실태')].startsWith('남 12명 여 13명') && !b[id('학급 실태')].includes('학급 조직'));
  assert.ok(b[id('학급 특색 교육 및 운영계획')].includes('가. 목적') && b[id('학급 특색 교육 및 운영계획')].includes('라. 기대효과'));
  const long = sectionBodies('1. 학급 실태\n' + '가'.repeat(3000), parseOutline('1. 학급 실태'));
  assert.equal(Object.values(long)[0].length, 1500);
});

test('역할과 첨부 종류', () => {
  assert.equal(roleOf('편제 및 시간 배당'), 'hours'); assert.equal(roleOf('교과별 시수'), 'hours');
  assert.equal(roleOf('교과 평가 계획'), 'eval'); assert.equal(roleOf('평가 계획'), 'eval');
  assert.equal(roleOf('창의적 체험활동 평가 계획'), ''); assert.equal(roleOf('학급 교육과정 운영 평가'), '');
  assert.equal(roleOf('월별 학급 운영 계획'), 'monthly'); assert.equal(roleOf('학급 실태'), '');
  assert.equal(attachKind('3학년 진도표.hwp', ''), 'jindo');
  assert.equal(attachKind('전과목 교수학습 및 평가계획.hwp', '국어 교육과정 연간지도계획'), 'eval');
  assert.equal(attachKind('파일.hwp', '수학 교육과정 연간지도계획\n1 | ...'), 'jindo');
  assert.equal(attachKind('파일.xlsx', '교과 | 성취기준 | 평가 방법'), 'eval');
  assert.equal(attachKind('학급 사진.pdf', '사진'), 'other');
});

test('저장·목록·지우기·현재·저장 실패', () => {
  store.useStorage(mem());
  const a = savePlan({ ...newPlan(), grade: 3, room: 2 });
  assert.ok(a && listPlans().length === 1 && getPlan(a.id).grade === 3);
  setCurrent(a.id); assert.equal(currentId(), a.id);
  deletePlan(a.id); assert.equal(listPlans().length, 0);
  store.useStorage(mem(true));
  assert.equal(savePlan(newPlan()), null);
  store.useStorage(mem());
});

test('AI 답 다듬기: 모르는 칸·빈 글은 빼고, 목록은 글로 합침, 월·평가 줄·지침 칸', () => {
  const o = parseOutline(LAST), leaf = leaves(o);
  const s = normSections({ sections: { [leaf[0].id]: ['가.', '나.'], [leaf[1].id]: '', nope: '모르는 칸', [o[0].id]: '1단계 칸' } }, o);
  assert.deepEqual(s, { [leaf[0].id]: '가.\n나.' });
  assert.deepEqual(normMonthly([{ month: 3, text: '학급 세우기' }, { month: 13, text: 'x' }, { month: '4', text: ['상담 주간', '현장체험'] }, { month: 5 }]), [{ month: 3, text: '학급 세우기' }, { month: 4, text: '상담 주간\n현장체험' }]);
  assert.deepEqual(normEvalRows({ rows: [{ subject: '국어', unit: '읽기', standard: '[4국02-01]', method: '서술형', when: '4월' }, { subject: '' }, 'x'] }), [{ subject: '국어', unit: '읽기', standard: '[4국02-01]', method: '서술형', when: '4월' }]);
  const g = normGuide([{ item: '기초학력 보장', keywords: ['기초학력'], sentence: '기초학력을 챙긴다.', section: leaf[2].id }, { item: '독서', section: 'nope' }, { item: '' }], o);
  assert.equal(g.length, 2); assert.equal(g[0].section, leaf[2].id); assert.equal(g[1].section, leaf[0].id);
});

test('지침 반영 판정·넣기, 작년과 겹침(글로 비교)', () => {
  const o = parseOutline(LAST), leaf = leaves(o);
  const draft = { [leaf[0].id]: '기초 학력 진단을 3월에 한다.' };
  const st = guideStatus([{ item: '기초학력', keywords: ['기초학력', '진단'] }, { item: '독서', keywords: ['아침 독서'] }], draft);
  assert.deepEqual(st.map(x => x.included), [true, false]);
  const d2 = insertSentence(draft, leaf[1].id, '아침 독서를 한다.');
  assert.equal(d2[leaf[1].id], '아침 독서를 한다.');
  assert.equal(guideStatus([{ item: '독서', keywords: ['아침 독서'] }], d2)[0].included, true);
  assert.equal(overlap('2022 개정 교육과정을 적용하고 학교 교육 목표와 연계한다.', '2022 개정 교육과정을 적용하고 학교 교육 목표와 연계한다.\n새 문장이다.').percent, 50);
  assert.ok(draftText(d2).includes('아침 독서'));
});

test('시수표: 진도표 첨부의 교과별 시수를 더함, 합계', () => {
  const attach = [
    { kind: 'jindo', name: '1학기.hwp', summary: { subjects: [{ name: '국어', hours: 87 }, { name: '수학', hours: 66 }] } },
    { kind: 'jindo', name: '2학기.hwp', summary: { subjects: [{ name: '국어', hours: 98 }] } },
    { kind: 'eval', name: '평가.hwp', summary: {} }
  ];
  assert.deepEqual(hoursRows(attach), [['국어', '185'], ['수학', '66'], ['합계', '251']]);
  assert.deepEqual(hoursRows([]), []);
});

test('한글 문서: 제목, 목차 번호, 칸 글, 시수표·평가 표·월별 표, 붙임 목록', () => {
  const outline = [
    { id: 'a', title: '학급 현황', level: 1, role: '' }, { id: 'b', title: '학급 실태', level: 2, role: '' },
    { id: 'c', title: '교육과정 편성', level: 1, role: '' }, { id: 'd', title: '편제 및 시간 배당', level: 2, role: 'hours' },
    { id: 'e', title: '교과 평가 계획', level: 2, role: 'eval' }, { id: 'f', title: '월별 계획', level: 1, role: 'monthly' }
  ];
  const plan = { ...newPlan(), year: 2027, grade: 3, room: 2, outline, draft: { b: '남 12명 여 13명이다.\n밝다.', d: '시수는 아래와 같다.' },
    attach: [{ kind: 'jindo', name: '진도표.hwp', summary: { subjects: [{ name: '국어', hours: 87 }] } }, { kind: 'eval', name: '평가계획.hwp', summary: {} }],
    evalRows: [{ subject: '국어', unit: '읽기', standard: '[4국02-01]', method: '서술형', when: '4월' }], monthly: [{ month: 3, text: '학급 세우기' }] };
  assert.equal(planTitle(plan), '2027학년도 3학년 2반 학급 교육과정 운영 계획');
  const doc = planDoc(plan), b = doc.blocks;
  assert.equal(doc.title, planTitle(plan));
  assert.deepEqual(b.filter(x => x.type === 'h').map(x => x.text), ['Ⅰ. 학급 현황', '1. 학급 실태', 'Ⅱ. 교육과정 편성', '1. 편제 및 시간 배당', '2. 교과 평가 계획', 'Ⅲ. 월별 계획', '붙임']);
  const tables = b.filter(x => x.type === 'table');
  assert.deepEqual(tables[0].rows, [['교과', '시수'], ['국어', '87'], ['합계', '87']]);
  assert.deepEqual(tables[1].rows[1], ['국어', '읽기', '[4국02-01]', '서술형', '4월']);
  assert.deepEqual(tables[2].rows, [['월', '주요 활동'], ['3월', '학급 세우기']]);
  assert.ok(b.some(x => x.type === 'p' && x.text === '1. 진도표(진도표.hwp) 1부.') && b.some(x => x.text === '2. 평가계획(평가계획.hwp) 1부.'));
  assert.equal(planTitle({ year: 2027 }), '2027학년도 학급 교육과정 운영 계획');
});

test('지난 계획을 글로 내면 다시 목차로 읽힘 (다음 해 「작년 계획서」)', () => {
  const plan = { ...newPlan(), year: 2027, grade: 3, room: 2, outline: STANDARD.map(x => ({ ...x })), draft: {} };
  assert.deepEqual(titles(parseOutline(planText(plan))), titles(STANDARD));
  // 붙임 목록(「1. 진도표(…) 1부.」)은 목차로 읽히지 않게 글에서 뺌
  const att = { ...plan, attach: [{ kind: 'jindo', name: '진도표.hwp', summary: { subjects: [] } }, { kind: 'eval', name: '평가.hwp', summary: {} }] };
  assert.deepEqual(titles(parseOutline(planText(att))), titles(STANDARD));
  assert.ok(!planText(att).includes('1부.'));
});

test('첨부 저장: 평가계획은 AI로 다시 읽을 글을 2만 자까지 지니고, 다른 첨부는 글을 지니지 않음', () => {
  const long = '가'.repeat(25000);
  const p = savePlan({ ...newPlan(), attach: [
    { id: 'a1', kind: 'eval', name: '평가계획.hwp', text: long, summary: {} },
    { id: 'a2', kind: 'jindo', name: '진도표.hwp', text: '국어 교육과정 연간지도계획', summary: { subjects: [{ name: '국어', hours: 12 }] } }
  ] });
  const q = getPlan(p.id);
  assert.equal(q.attach[0].text.length, 20000);
  assert.equal(q.attach[1].text, '');
  assert.deepEqual(q.attach[1].summary.subjects, [{ name: '국어', hours: 12 }]);
});

test('새 학년도에 학급운영계획을 가져감 (내년 「작년 계획서」로)', () => {
  const c = carryOver({ classplans: '[{"id":"x"}]', 'classplan:current': '"x"' }, 2028);
  assert.equal(c.classplans, '[{"id":"x"}]'); assert.equal(c['classplan:current'], '"x"');
});
