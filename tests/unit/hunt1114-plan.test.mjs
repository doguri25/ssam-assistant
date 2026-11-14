// 계획 버그 잡기(2026-11-14): 작년(기존) 계획서 목차로 쓴 연간계획 초안 — 목차에 없는 칸(화면·한글 파일에 안 나옴)으로
// 지침 문장이 들어가거나 「반영됨」으로 셈하던 것 (화면 쪽은 tests/e2e/hunt1114-plan.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
const { yearOutline, normDraft, planDoc, draftText, overlap, guideStatus, insertSentence, insertKey, textKeys } = await import('../../web/menus/plan/year-model.js');

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());

// 방침 칸이 없는 작년 계획서(목적 · 운영 개요 · 세부 운영 계획 · 추진 일정 · 평가)
const LAST = ['2026학년도 독서교육 운영 계획', '1. 목적', '책을 즐겨 읽는 습관을 기른다.', '2. 운영 개요', '가. 대상: 전교생', '3. 세부 운영 계획', '가. 아침 독서',
  '4. 추진 일정', '3월 계획 수립', '5. 평가', '독서량을 살핀다.'].join('\n');

test('[year-outline-hidden] 목차에 없는 글 칸은 글 칸·셈에서 빠짐(화면·한글 파일에 없는 글로 「반영됨」을 세지 않음)', () => {
  const o = yearOutline(LAST);
  assert.deepEqual(o.items.map(x => x.key), ['purpose', 'x1', 'details', 'schedule', 'evaluation']);
  const d = normDraft({ purpose: '목적 글', policy: '안전한 독서 환경을 만든다.', details: '세부 글', evaluation: '평가 글', x1: '개요 글', outline: o.items, roman: o.roman });
  assert.deepEqual(textKeys(d), ['purpose', 'details', 'evaluation', 'x1']);
  assert.ok(!draftText(d).includes('안전한 독서 환경'), '목차에 없는 방침 글이 셈에 들어감');
  const st = guideStatus([{ item: '독서 환경', keywords: ['안전한', '독서 환경'], sentence: '안전한 독서 환경을 만든다.', section: 'policy' }], d);
  assert.equal(st[0].included, false, '한글 파일에 없는 글로 「반영됨」');
  // 목차가 없는(기본 차례) 초안은 그대로 넷
  assert.deepEqual(textKeys(normDraft({ purpose: 'a' })), ['purpose', 'policy', 'details', 'evaluation']);
});

test('[year-outline-hidden] 지침 문장 [넣기]: 목차에 없는 칸이면 보이는 칸(세부 → 첫 글 칸)으로 들어가 한글 파일에도 나옴', () => {
  const o = yearOutline(LAST);
  const d = normDraft({ purpose: '목적 글', details: '세부 글', evaluation: '평가 글', x1: '개요 글', outline: o.items, roman: o.roman });
  assert.equal(insertKey(d, 'policy'), 'details');
  assert.equal(insertKey(d, 'evaluation'), 'evaluation');
  const n = insertSentence(d, 'policy', '학부모와 함께 읽는 날을 운영한다.');
  assert.ok(n.details.endsWith('학부모와 함께 읽는 날을 운영한다.'), n.details);
  assert.ok(!String(n.policy || '').includes('학부모'), '안 보이는 방침 칸에 들어감');
  const doc = planDoc({ year: 2027, name: '독서교육', draft: n });
  assert.ok(doc.blocks.some(b => String(b.text || '').includes('학부모와 함께 읽는 날')), '한글 파일에 넣은 문장이 없음');
  assert.ok(guideStatus([{ item: '함께 읽는 날', keywords: ['학부모', '함께 읽는 날'], section: 'policy' }], n)[0].included);
  // 세부 칸도 없으면 목차의 첫 글 칸
  const o2 = yearOutline('1. 추진 근거\n2. 목적\n3. 추진 일정\n4. 소요 예산');
  const d2 = normDraft({ purpose: '목적', x1: '근거', outline: o2.items });
  assert.equal(insertKey(d2, 'details'), 'purpose');
  // 기본 차례는 지금처럼(모르는 칸은 세부)
  assert.equal(insertKey(normDraft({ purpose: 'a' }), 'policy'), 'policy');
  assert.equal(insertKey(normDraft({ purpose: 'a' }), 'zz'), 'details');
  assert.ok(overlap('세부 글', n) !== null);
});

test('[plan-staff-ai] 학급운영계획 AI 글: 작년 계획서·지침·평가계획의 「이바다 선생님」「강사 박하늘」 같은 교직원 이름은 ○○○로', async () => {
  const M = await import('../../web/menus/plan/classplan-model.js');
  const A = await import('../../web/menus/plan/classplan-ai.js');
  const last = 'Ⅰ. 학급 현황\n1. 학급 실태\n협력 수업은 이바다 선생님과 함께한다.\nⅡ. 학급 특색 교육\n1. 세부 운영 내용\n독서 강사 박하늘 초청 수업';
  const outline = M.parseOutline(last);
  const p = { ...M.newPlan(), year: 2027, grade: 3, room: 2, outline, sources: { lastPlan: last, guide: '담당 장학사 한가람 주무관에게 제출' }, guide: null };
  const all = [A.draftPrompt(p, { bodies: M.sectionBodies(last, outline) }), A.guidePrompt(p), A.evalPrompt('국어 평가는 이바다 선생님이 맡는다')].join('\n');
  for (const n of ['이바다', '박하늘', '한가람']) assert.ok(!all.includes(n), n);
  assert.ok(all.includes('○○○ 선생님과 함께한다') && all.includes('독서 강사 ○○○ 초청'));
});

test('[form-roman-level] 학교 계획서 양식에 「Ⅰ.」 큰 제목이 있으면: 계획서의 「Ⅰ.」 줄은 그 큰 제목 모양, 보통 글은 보통 글 모양(모든 줄이 큰 제목 모양이 되지 않음)', async () => {
  const { makeHwpx } = await import('../../web/core/hwpx.js');
  const { unzip } = await import('../../web/core/zip.js');
  const F = await import('../../web/core/hwpx-form.js');
  const { docToLetter } = await import('../../web/core/body-table.js');
  // 지어낸 양식: 제목, 「Ⅰ.」 큰 제목(제목 모양 charPr 3·paraPr 2), 보통 글(charPr 0·paraPr 0), 학교장
  const form = await F.readForm(makeHwpx({ title: '새싹초 업무 계획서', blocks: [{ type: 'h', text: 'Ⅰ. 옛 큰 제목' }, { type: 'p', text: '옛 본문을 적어요.' }, { type: 'p', text: '새싹초등학교장' }] }));
  const roles = F.findRoles(form.lines);
  assert.ok(F.rolesValid(roles, { date: false }), JSON.stringify(roles));
  const doc = { title: '2027학년도 독서교육 운영 계획', blocks: [{ type: 'h', text: 'Ⅰ. 목적' }, { type: 'p', text: '책을 즐겨 읽는 습관을 기른다.' }, { type: 'h', text: 'Ⅱ. 방침' }, { type: 'p', text: '전교생이 참여한다.' }] };
  const { bytes } = await F.fillForm(form, roles, { ...docToLetter(doc), date: '2027-01-12', reply: null });
  const xml = new TextDecoder().decode((await unzip(bytes)).get('Contents/section0.xml'));
  const paraOf = t => { const i = xml.indexOf(`>${t}<`); const s = xml.lastIndexOf('<hp:p ', i); return xml.slice(s, xml.indexOf('>', s) + 1) + xml.slice(xml.indexOf('<hp:run', s), xml.indexOf('>', xml.indexOf('<hp:run', s)) + 1); };
  assert.match(paraOf('Ⅰ. 목적'), /paraPrIDRef="2"[\s\S]*charPrIDRef="3"/, paraOf('Ⅰ. 목적'));
  assert.match(paraOf('Ⅱ. 방침'), /paraPrIDRef="2"[\s\S]*charPrIDRef="3"/);
  assert.match(paraOf('책을 즐겨 읽는 습관을 기른다.'), /paraPrIDRef="0"[\s\S]*charPrIDRef="0"/, '보통 글이 큰 제목 모양: ' + paraOf('책을 즐겨 읽는 습관을 기른다.'));
  assert.equal(F.levelOf('Ⅲ. 세부 추진 계획'), 6);
  assert.equal(F.levelOf('보통 글'), 0);
});

test('[ev-outline-doc] 행사 계획서를 작년·기존 계획서 목차로 썼으면 한글 문서도 그 목차 그대로(앱의 「1. 개요·2. 시간표·3. 세부 계획」을 덧씌우지 않음)', async () => {
  const E = await import('../../web/menus/plan/event-model.js');
  const last = { id: 'r1', kind: 'last', name: '2026 운동회 계획서', text: 'Ⅰ. 개요\n1. 일시\nⅡ. 운영 방침\nⅢ. 세부 운영\n가. 경기\nⅣ. 안전 대책\nⅤ. 평가' };
  const plan = 'Ⅰ. 개요\n1. 일시: 2027. 5. 6.(목)\n2. 장소: 운동장\nⅡ. 운영 방침\n가. 모두가 참여한다.\nⅢ. 세부 운영\n가. 경기 종목: 이어달리기\nⅣ. 안전 대책\n가. 응급 처치 자리를 둔다.\nⅤ. 평가\n가. 만족도 설문';
  const e = { ...E.newEvent(), name: '가을 운동회', purpose: '체력 기르기', date: '2027-05-06', grades: '전교생', place: '운동장', refs: [last],
    options: [{ label: '안', summary: '', timetable: [{ time: '09:00', activity: '개회식', place: '운동장' }], pros: [], staffNeed: '', budget: [{ name: '상품', amount: 100000 }] }], picked: 0,
    docs: { plan, safety: '', letter: '', rain: '', done: false } };
  const doc = E.docDoc(e, 'plan');
  assert.equal(doc.title, '가을 운동회 운영 계획');
  const heads = doc.blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 개요', 'Ⅱ. 운영 방침', 'Ⅲ. 세부 운영', 'Ⅳ. 안전 대책', 'Ⅴ. 평가']);
  const all = doc.blocks.map(b => b.text || '').join('\n');
  for (const s of ['1. 일시: 2027. 5. 6.(목)', '가. 경기 종목: 이어달리기', '가. 만족도 설문']) assert.ok(all.includes(s), s);
  // 작년·기존 계획서가 없으면(또는 계획서 글에 큰 제목이 없으면) 지금처럼 개요 표·시간표·세부 계획
  const plain = E.docDoc({ ...e, refs: [] }, 'plan');
  assert.deepEqual(plain.blocks.filter(b => b.type === 'h').map(b => b.text), ['1. 개요', '2. 시간표', '3. 세부 계획', '4. 예산 내역']);
  const flat = E.docDoc({ ...e, docs: { ...e.docs, plan: '가. 개요\n나. 운영 방침' } }, 'plan');
  assert.equal(flat.blocks[0].text, '1. 개요');
});
