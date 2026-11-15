// 버그 사냥 합친 뒤 새 검토(2026-11-15)에서 나온 것 — 고치기 전에 실패하는지 먼저 봄
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());
const E = await import('../../web/menus/plan/event-model.js');
const last = { id: 'r1', kind: 'last', name: '2026 운동회 계획서', text: 'Ⅰ. 목적\nⅡ. 방침\nⅢ. 세부 운영 계획\n1. 일시\nⅣ. 평가' };
const ev = (plan, extra = {}) => ({ ...E.newEvent(), name: '가을 운동회', purpose: '체력 기르기', date: '2027-05-06', grades: '전교생', place: '운동장', refs: [last],
  options: [{ label: '안', summary: '', timetable: [{ time: '09:00', activity: '개회식', place: '운동장' }, { time: '10:00', activity: '이어달리기', place: '운동장' }], pros: [], staffNeed: '', budget: [{ name: '상품', amount: 100000 }] }], picked: 0,
  docs: { plan, safety: '', letter: '', rain: '', done: false }, ...extra });

test('[ev-outline-sub] 큰 제목(Ⅳ. 평가)으로 시작하는 「1.」 작은 줄을 큰 제목으로 올리지 않음', () => {
  const plan = 'Ⅰ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n1. 일시 및 장소: 운동장, 개회식·이어달리기\n2. 평가 방법: 설문\nⅣ. 평가\n가. 만족도 설문(상품 수령 확인)';
  const heads = E.docDoc(ev(plan), 'plan').blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 목적', 'Ⅱ. 방침', 'Ⅲ. 세부 운영 계획', 'Ⅳ. 평가']);
});

test('[ev-outline-toc] 계획서 글 앞에 차례가 있어도 큰 제목은 본문 자리에서 나눔', () => {
  const plan = 'Ⅰ. 목적\nⅡ. 방침\nⅢ. 세부 운영 계획\nⅣ. 평가\nⅠ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n1. 개회식 · 이어달리기\nⅣ. 평가\n가. 만족도 설문(상품)';
  const blocks = E.docDoc(ev(plan), 'plan').blocks;
  const i = blocks.findIndex(b => b.type === 'h' && b.text === 'Ⅱ. 방침');
  assert.ok(i > 0, JSON.stringify(blocks));
  assert.equal(blocks[i - 1].type, 'p', '목적 칸 글이 큰 제목 사이에 있어야 함: ' + JSON.stringify(blocks));
  assert.match(blocks[i - 1].text, /체력을 기른다/);
});

test('[ev-outline-tables] 작년 목차로 쓴 계획서 글에 시간표·예산이 없으면 붙임으로 더함(있으면 더하지 않음)', () => {
  const bare = 'Ⅰ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n가. 학년별 경기\nⅣ. 평가\n가. 만족도 설문';
  const doc = E.docDoc(ev(bare), 'plan');
  const heads = doc.blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 목적', 'Ⅱ. 방침', 'Ⅲ. 세부 운영 계획', 'Ⅳ. 평가', '붙임 1. 시간표', '붙임 2. 예산 내역']);
  const tables = doc.blocks.filter(b => b.type === 'table');
  assert.deepEqual(tables[0].rows[1], ['09:00', '개회식', '운동장']);
  assert.deepEqual(tables[1].rows.at(-1), ['합계', '100,000']);
  const full = 'Ⅰ. 목적\n가. 체력을 기른다.\nⅡ. 방침\n가. 모두 참여\nⅢ. 세부 운영 계획\n가. 09:00 개회식\n나. 10:00 이어달리기\nⅣ. 평가\n가. 예산: 상품 100,000원';
  assert.deepEqual(E.docDoc(ev(full), 'plan').blocks.filter(b => b.type === 'h').map(b => b.text), ['Ⅰ. 목적', 'Ⅱ. 방침', 'Ⅲ. 세부 운영 계획', 'Ⅳ. 평가']);
});

test('[year-outline-fallthrough] 앞 칸을 이미 쓴 제목은 다음으로 맞는 칸으로(「월별 세부 추진 계획」은 세부, 「추진 목표 및 방침」은 방침) — 「운영 목표」는 세부 칸을 차지하지 않음', async () => {
  const { yearOutline } = await import('../../web/menus/plan/year-model.js');
  const keys = src => yearOutline(src).items.map(x => x.key);
  assert.deepEqual(keys('1. 목적\n2. 추진 일정\n3. 월별 세부 추진 계획\n4. 평가'), ['purpose', 'schedule', 'details', 'evaluation']);
  assert.deepEqual(keys('Ⅰ. 목적\nⅡ. 추진 목표 및 방침\nⅢ. 세부 추진 계획\nⅣ. 평가'), ['purpose', 'policy', 'details', 'evaluation']);
  assert.deepEqual(keys('Ⅰ. 목적\nⅡ. 운영 목표\nⅢ. 세부 추진 계획\nⅣ. 평가'), ['purpose', 'x1', 'details', 'evaluation']);
});

test('[pur-kin-words] 품의 이름 가리기: 「유치원 학부모」「학생 한마당」「학생 인원수」 같은 보통 낱말은 그대로, 두 글자 이름(「김솔 학생」)은 가림', async () => {
  const { maskNames } = await import('../../web/menus/purchase/intake.js');
  for (const s of ['유치원 학부모 간담회 다과', '학생 한마당 상품', '학생 인원수 30명', '학생 문화원 견학', '이번주 학생 간식', '정원외 학생 교재', '장학금 학생 선물', '지난주 학생 체험', '전체 학생 간식', '장애 학생 보조 기구', '학생 명찰 30개', '학생 공책 20권'])
    assert.equal(maskNames(s), s, s);
  assert.equal(maskNames('김솔 학생 체험학습비'), '○○○ 학생 체험학습비');
  assert.equal(maskNames('박솔 학부모 상담 다과'), '○○○ 학부모 상담 다과');
  assert.equal(maskNames('김하늘 학생 체험학습비'), '○○○ 학생 체험학습비');
  assert.equal(maskNames('학생 이바다 준비물'), '학생 ○○○ 준비물');
});

test('[report-staff] 결과 보고 AI 요청: 넣은 문서·한 일 메모의 교직원 이름은 ○○○로(계획 3종과 같게)', async () => {
  const { reportPrompt } = await import('../../web/menus/plan/report-ai.js');
  const p = reportPrompt({ sources: [{ kind: 'plan', name: '계획서', text: '담당: 이바다 선생님\n운영: 한가람 주무관' }], memo: '김하늘 선생님이 사회를 봄', year: 2026 });
  for (const n of ['이바다', '한가람', '김하늘']) assert.ok(!p.includes(n), n + ' 가 AI 요청에 그대로');
  assert.ok(p.includes('○○○ 선생님'), p);
});
