// 2026-11-15 검토 고침 — 계획서 「새 서식으로 바꾸기」(스펙 1B): 제목 줄에 함께 적힌 글, 표·명단 이름 가리기, 옮길 곳 없는 칸 기본 붙이기,
// 작년 계획서·새 서식 양식 저장이 다른 기능 양식을 덮지 않음, 연간계획 「추진 배경·추진 목표」 역할. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { makeHwpx } from '../../web/core/hwpx.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());

const R = await import('../../web/menus/plan/reform-model.js');
const Y = await import('../../web/menus/plan/year-model.js');
const E = await import('../../web/menus/plan/event-model.js');
const C = await import('../../web/menus/plan/classplan-model.js');
const SF = await import('../../web/core/school-form.js');
const { forms } = await import('../../web/core/form-store.js');

const NEW_EVENT = 'Ⅰ. 추진 목적\nⅡ. 운영 개요\nⅢ. 세부 운영 계획\nⅣ. 안전 관리\nⅤ. 평가 및 환류';
const ev = plan => E.saveEvent({ ...E.newEvent(), name: '가을 운동회', docs: { plan, safety: '', letter: '', rain: '', done: false } });
const reformEvent = (e, answer = null) => {
  const { pre, olds } = R.eventOlds(e);
  const H = R.formHeads(NEW_EVENT), hs = R.withPlanRoles(H.heads);
  const f = R.mergeReform(hs, olds, R.ruleMap(olds, hs), answer);
  return { olds, f, out: R.applyEvent(e, f, H, pre, olds) };
};

test('[rf-head] 행사계획: 큰 제목 줄에 함께 적힌 글(「1. 목적: 협동심과 체력 증진」)은 그 칸 글 첫 줄로 — 새 서식으로 바꿔도 남음', () => {
  const plan = ['2027 가을 운동회 운영 계획', '1. 목적: 협동심과 체력 증진', '2. 일시: 2027. 10. 7.(목) 09:00~12:00', '3. 장소: 본교 운동장', '4. 세부 운영', '가. 개회식', '나. 경기',
    '5. 안전 대책', '가. 보건실 운영', '6. 평가', '가. 만족도 조사'].join('\n');
  const e = ev(plan);
  const { olds } = R.eventOlds(e);
  assert.deepEqual(olds.map(o => o.title), ['목적', '일시', '장소', '세부 운영', '안전 대책', '평가']);
  assert.equal(olds[0].role, 'purpose', '쌍점 앞 제목으로 역할');
  assert.equal(olds[0].text, '협동심과 체력 증진');
  assert.equal(olds[1].text, '2027. 10. 7.(목) 09:00~12:00', '시각의 쌍점에서 자르지 않음');
  assert.equal(olds[3].text, '가. 개회식\n나. 경기');
  // AI 없이(규칙만) · AI가 일시·장소를 운영 개요로 옮김 — 어느 쪽이든 글이 남음
  for (const answer of [null, { map: [{ to: 1, from: ['o2', 'o3'] }], write: [] }]) {
    const { out } = reformEvent(e, answer);
    for (const s of ['협동심과 체력 증진', '일시: 2027. 10. 7.(목) 09:00~12:00', '장소: 본교 운동장', '가. 개회식', '가. 보건실 운영', '가. 만족도 조사']) assert.ok(out.plan.includes(s), `${s} 빠짐:\n${out.plan}`);
    assert.ok(out.plan.includes('Ⅰ. 추진 목적\n협동심과 체력 증진'), '비슷한 제목 칸이면 글만: ' + out.plan);
  }
  // 쌍점이 없어도 짧은 제목보다 긴 줄(숫자·긴 글)은 그 줄 글을 칸 글 첫 줄로도 남김
  const e2 = ev('1. 목적\n가. 협동심\n2. 일시 2027. 10. 7.(목) 본교 운동장\n3. 세부 운영\n가. 개회식\n4. 개요 (장소: 강당)');
  const o2 = R.eventOlds(e2).olds;
  assert.equal(o2[1].text, '일시 2027. 10. 7.(목) 본교 운동장');
  assert.equal(o2[0].text, '가. 협동심', '짧은 제목은 글에 더하지 않음');
  assert.ok(reformEvent(e2).out.plan.includes('일시 2027. 10. 7.(목) 본교 운동장'));
  assert.deepEqual([o2[3].title, o2[3].text], ['개요 (장소: 강당)', '개요 (장소: 강당)'], '괄호 안 쌍점에서 자르지 않음(긴 줄은 글로도 남김)');
  // 새 서식 제목 줄(docs.form)은 숫자가 있어도 제목만 — 다시 바꿀 때 제목이 글로 늘어나지 않음
  const e3 = ev('1. 2027 추진 목적\n가. 협동심\n2. 운영 개요\n가. 일시\n3. 세부 운영 계획\n가. 경기');
  const e3f = E.saveEvent({ ...e3, docs: { ...e3.docs, form: ['1. 2027 추진 목적', '2. 운영 개요', '3. 세부 운영 계획'] } });
  assert.equal(R.eventOlds(e3f).olds[0].text, '가. 협동심');
  // 같은 제목으로 옮기면 제목 줄을 글로 다시 쓰지 않음
  const e4 = ev('Ⅰ. 2027 추진 목적\n가. 협동심\nⅡ. 운영 개요\n가. 일시\nⅢ. 세부 운영 계획\n가. 경기');
  const { pre, olds: o4 } = R.eventOlds(e4);
  const H4 = R.formHeads('Ⅰ. 2027 추진 목적\nⅡ. 운영 개요\nⅢ. 세부 운영 계획'), h4 = R.withPlanRoles(H4.heads);
  const p4 = R.applyEvent(e4, R.mergeReform(h4, o4, R.ruleMap(o4, h4), null), H4, pre, o4).plan;
  assert.equal(p4, 'Ⅰ. 2027 추진 목적\n가. 협동심\nⅡ. 운영 개요\n가. 일시\nⅢ. 세부 운영 계획\n가. 경기');
});

test('[rf-head] 학급운영계획: 큰 제목에 쌍점으로 적힌 글(「급훈: 서로 돕는 반」)도 새 제목으로 바꿀 때 칸 글로 남음', () => {
  const outline = C.withRoles([{ id: 's1', title: '급훈: 서로 돕는 반', level: 1 }, { id: 's2', title: '학급 현황', level: 1 }, { id: 's3', title: '학급 실태', level: 2 }]);
  const p = { outline, draft: { s1: '바른 말을 쓴다.', s3: '남 12명 여 13명' }, guide: null };
  const olds = R.classOlds(p);
  assert.equal(olds[0].title, '급훈');
  assert.ok(olds[0].text.startsWith('서로 돕는 반'), olds[0].text);
  const H = R.formHeads('Ⅰ. 학급 교육 목표\nⅡ. 학급 현황 및 조직\nⅢ. 학부모 소통'), hs = R.withPlanRoles(H.heads);
  const f = R.attachOrphan(R.mergeReform(hs, olds, R.ruleMap(olds, hs), null), 'o1', 0);
  const out = R.applyClass(p, f, H, olds);
  assert.equal(out.draft[out.outline[0].id], '급훈: 서로 돕는 반\n바른 말을 쓴다.', '다른 제목 칸으로 가면 「옛 제목: 글」');
  const same = R.applyClass(p, R.mergeReform(R.withPlanRoles([{ title: '급훈' }, { title: '학급 현황' }, { title: '평가' }]), olds, [['o1'], ['o2'], []], null), { heads: [{ title: '급훈' }, { title: '학급 현황' }, { title: '평가' }] }, olds);
  assert.equal(same.draft.s1, '서로 돕는 반\n바른 말을 쓴다.', '같은 제목이면 글만');
});

test('[rf-redact] AI로 보낼 글: 「이름」 머리 칸 표·한 줄에 한 명 명단의 이름도 가림(한 가리개로 모든 칸), 돌아온 글의 이름은 되돌림', () => {
  const olds = [
    { id: 'o1', title: '학급 조직', text: '이름 | 1인 1역\n김민수 | 우유 당번\n이서연 | 칠판 정리\n최하은 | 화분 물 주기' },
    { id: 'o2', title: '학급 교육 목표', text: '서로 돕는 반\n회장 선거에서 김민수 학생이 뽑혔다.' },
    { id: 'o3', title: '모둠', text: '1 김하늘 남\n2 이바다 여\n3 한가람 남' }
  ];
  const heads = [{ title: '학급 현황 및 조직' }, { title: '학부모 소통' }];
  const { prompt, back } = R.reformPrompt({ kind: '학급운영계획', title: '새싹초등학교 3학년 2반 학급운영계획', olds, heads, rules: [['o1'], []] });
  assert.ok(!/김민수|이서연|최하은|김하늘|이바다|한가람/.test(prompt), prompt);
  assert.ok(prompt.includes('우유 당번') && prompt.includes('서로 돕는 반'), prompt);
  const tok = /(〔이름\d+〕) \| 우유 당번/.exec(prompt);
  assert.ok(tok, prompt);
  assert.ok(prompt.includes(`회장 선거에서 ${tok[1]} 학생이`), '한 번 알아낸 이름은 다른 칸에서도 같은 자리 표시');
  assert.equal(back(`${tok[1]} 학생이 우유 당번을 맡는다.`), '김민수 학생이 우유 당번을 맡는다.');
});

test('[rf-orphan] 옮길 곳 없는 옛 칸은 기본으로 가까운 칸에 붙음(앞에서 맞춘 칸 → 뒤에서 맞춘 칸 → 마지막 칸) — AI가 없거나 실패해도 글이 빠지지 않음', () => {
  // 행사계획: 운영 방침(o2)·안전 대책(o4)은 제목·역할이 맞는 칸이 없음 → 바로 앞에서 맞춘 칸에
  const e = ev('2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.\nⅡ. 운영 방침\n가. 모두가 즐기는 운동회\nⅢ. 세부 운영\n1. 경기 종목\nⅣ. 안전 대책\n가. 보건실 운영\nⅤ. 평가\n가. 만족도 조사');
  const { olds, f, out } = reformEvent(e);
  assert.deepEqual(f.orphans, ['o2', 'o4']);
  assert.deepEqual(f.attached, { o2: 1, o4: 2 });
  for (const o of olds) assert.ok(out.plan.includes(o.text), `${o.title} 글 빠짐:\n${out.plan}`);
  assert.ok(out.plan.includes('Ⅱ. 운영 개요\n가. 일시: 2027. 5. 6.\n가. 모두가 즐기는 운동회\nⅢ.'), out.plan);
  // 선생님이 「붙이지 않음」을 고르면 빠짐(옛 차례는 그대로)
  const g = R.attachOrphan(f, 'o2', -1);
  assert.ok(!R.applyEvent(e, g, R.formHeads(NEW_EVENT), R.eventOlds(e).pre, olds).plan.includes('모두가 즐기는'));
  assert.deepEqual(R.attachOrphan(g, 'o2', 1).to[1].from, ['o1', 'o2'], '다시 붙여도 옛 차례');
  // 앞에서 맞춘 칸이 없으면 뒤에서 맞춘 칸, 아무것도 맞지 않으면 마지막 칸
  const olds2 = [{ id: 'o1', title: '추진 근거', role: '' }, { id: 'o2', title: '목적', role: 'purpose' }];
  assert.deepEqual(R.mergeReform([{ title: '목적', role: 'purpose' }, { title: '평가', role: 'evaluation' }], olds2, [['o2'], []], null).to.map(x => x.from), [['o1', 'o2'], []]);
  assert.deepEqual(R.mergeReform([{ title: '가' }, { title: '나' }], olds2, [[], []], null).to.map(x => x.from), [[], ['o1', 'o2']]);
  // 학급운영계획(규칙만): 칸 글이 모두 남음
  const outline = C.withRoles([{ id: 's1', title: '학급 현황', level: 1 }, { id: 's2', title: '학급 실태', level: 2 }, { id: 's4', title: '학급 교육 목표', level: 1 }, { id: 's8', title: '기타', level: 1 }]);
  const p = { outline, draft: { s2: '남 12명 여 13명', s4: '서로 돕는 반', s8: '기타 글' }, guide: null };
  const co = R.classOlds(p), H = R.formHeads('Ⅰ. 학급 교육 목표\nⅡ. 학급 현황 및 조직\nⅢ. 학부모 소통'), hs = R.withPlanRoles(H.heads);
  const cf = R.mergeReform(hs, co, R.ruleMap(co, hs), null);
  const all = Object.values(R.applyClass(p, cf, H, co).draft).join('\n');
  for (const v of Object.values(p.draft)) assert.ok(all.includes(v), v);
  // 연간계획: 표 칸(일정·예산)에는 글 칸을 붙이지 않음 — 그 앞 글 칸으로
  const d = Y.normDraft({ purpose: '독서 습관', x1: '누리집에 올린다.', schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [],
    outline: [{ key: 'purpose', title: '목적' }, { key: 'schedule', title: '추진 일정' }, { key: 'x1', title: '홍보' }] });
  const yo = R.yearOlds(d), YH = R.yearHeads('Ⅰ. 목적\nⅡ. 월별 추진 일정\nⅢ. 평가');
  const yf = R.mergeReform(YH.heads, yo, R.ruleMap(yo, YH.heads, { accepts: R.yearAccepts }), null, { accepts: R.yearAccepts });
  assert.equal(yf.attached.o3, 0, JSON.stringify(yf));
  assert.ok(R.applyYear(d, yf, YH, yo).purpose.includes('누리집에 올린다.'));
  // 옮길 곳 없는 일정 표 칸은 일정 표 칸이 있으면 거기(표는 그대로 — 글 칸에 일정 글을 더하지 않음)
  const d2 = Y.normDraft({ purpose: '독서 습관', details: '1. 아침 독서', schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [],
    outline: [{ key: 'purpose', title: '목적' }, { key: 'schedule', title: '행사 시기' }, { key: 'details', title: '세부 추진 내용' }] });
  const yo2 = R.yearOlds(d2), YH2 = R.yearHeads('Ⅰ. 목적\nⅡ. 추진 일정\nⅢ. 월별 세부 일정\nⅣ. 평가');
  const yf2 = R.mergeReform(YH2.heads, yo2, R.ruleMap(yo2, YH2.heads, { accepts: R.yearAccepts }), null, { accepts: R.yearAccepts });
  assert.equal(yf2.attached.o2, 1, JSON.stringify(yf2));
  const nd2 = R.applyYear(d2, yf2, YH2, yo2);
  assert.ok(!Y.textKeys(nd2).some(k => nd2[k].includes('계획 수립')) && nd2.schedule.length === 1, JSON.stringify(nd2));
});

test('[rf-year-role] 연간계획 새 서식 「추진 배경·추진 목표」: 목적 같은 제목이 둘이면 역할로 맞추지 않음(AI·옮길 곳 없는 칸에서 정함)', () => {
  const d = Y.normDraft({ purpose: '독서 습관을 기른다.', policy: '가. 전교생 참여', details: '1. 아침 독서', evaluation: '설문', schedule: [], budget: [] });
  const olds = R.yearOlds(d);
  const H = R.yearHeads('Ⅰ.추진 배경\nⅡ.추진 목표\nⅢ.추진 방침\nⅣ.세부 추진 계획\nⅤ.추진 일정\nⅥ.소요 예산\nⅦ.평가');
  assert.deepEqual(H.heads.map(h => h.title), ['추진 배경', '추진 목표', '추진 방침', '세부 추진 계획', '추진 일정', '소요 예산', '평가']);
  const rules = R.ruleMap(olds, H.heads, { accepts: R.yearAccepts });
  assert.deepEqual(rules[0], [], '추진 배경에 목적 글을 넣지 않음');
  assert.deepEqual(rules[1], [], '어느 쪽인지 모름');
  assert.ok(rules[2].includes('o2') && rules[3].includes('o3'), JSON.stringify(rules));
  // 옛 칸 쪽도 같음: 작년 목차 「추진 배경·추진 목표」 → 새 서식 「목적」에 역할로 맞추지 않음
  const o = Y.yearOutline('Ⅰ. 추진 배경\nⅡ. 추진 목표\nⅢ. 세부 추진 내용');
  const d2 = Y.normDraft({ purpose: '배경 글', x1: '목표 글', details: '세부 글', outline: o.items, roman: true, schedule: [], budget: [] });
  const o2 = R.yearOlds(d2), H2 = R.yearHeads('Ⅰ. 목적\nⅡ. 세부 추진 계획\nⅢ. 평가');
  assert.deepEqual(R.ruleMap(o2, H2.heads, { accepts: R.yearAccepts })[0], []);
});

test('[rf-origin] 작년 계획서·새 서식 양식 저장: 같은 이름이라도 다른 기능(가정통신문)·다른 계획서 양식은 덮지 않음, 같은 파일이면 손으로 정한 자리 그대로', async () => {
  const st = await forms();
  const letter = makeHwpx({ title: '가정통신문', blocks: [{ type: 'p', text: '학부모님께' }, { type: 'p', text: '2026. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] });
  const LR = { title: 0, bodyStart: 1, bodyEnd: 1, date: 2, sign: 3, reply: -1, manual: true };
  await st.put({ id: 'fmLetter', name: '서식', kind: 'hwpx', bytes: letter, roles: LR, savedAt: 1 });
  const planForm = makeHwpx({ title: '계획서', blocks: [{ type: 'p', text: 'Ⅰ. 목적' }, { type: 'p', text: 'Ⅱ. 방침' }, { type: 'p', text: 'Ⅲ. 세부' }] });
  const r = await SF.saveForm('year', planForm, '서식', { pick: true, replace: true, from: 'reform:year' });
  assert.notEqual(r.rec.id, 'fmLetter', '가정통신문 양식 자리를 쓰지 않음');
  const kept = await st.get('fmLetter');
  assert.deepEqual(kept.roles, LR);
  assert.deepEqual([...kept.bytes], [...letter]);
  assert.equal((await st.list()).filter(f => f.name === '서식').length, 2, '둘 다 있음');
  assert.equal((await st.get(r.rec.id)).from, 'reform:year');
  // 같은 기능·같은 계획서·같은 이름은 그 자리에
  const r2 = await SF.saveForm('year', planForm, '서식', { pick: true, replace: true, from: 'reform:year' });
  assert.equal(r2.rec.id, r.rec.id);
  // 다른 계획서 종류(행사계획)의 같은 이름 양식은 따로
  const r3 = await SF.saveForm('event', planForm, '서식', { pick: true, replace: true, from: 'reform:event' });
  assert.notEqual(r3.rec.id, r.rec.id);
  // 작년 계획서 서식: 손으로 정한 자리는 같은 파일을 다시 넣어도 그대로, 다른 파일이면 다시 찾음
  const a = await SF.saveForm('classplan', planForm, '작년 계획서 서식 · 독서', { pick: 'empty', replace: true, from: 'lastPlan:classplan' });
  const fixed = { title: 0, bodyStart: 2, bodyEnd: 2, date: -1, sign: -1, reply: -1, manual: true };
  await st.put({ ...(await st.get(a.rec.id)), roles: fixed });
  const b = await SF.saveForm('classplan', planForm, '작년 계획서 서식 · 독서', { pick: 'empty', replace: true, from: 'lastPlan:classplan' });
  assert.equal(b.rec.id, a.rec.id);
  assert.deepEqual((await st.get(a.rec.id)).roles, fixed, '같은 파일이면 자리 그대로');
  const other = makeHwpx({ title: '계획서 2', blocks: [{ type: 'p', text: 'Ⅰ. 목적' }, { type: 'p', text: 'Ⅱ. 방침' }] });
  await SF.saveForm('classplan', other, '작년 계획서 서식 · 독서', { pick: 'empty', replace: true, from: 'lastPlan:classplan' });
  assert.notDeepEqual((await st.get(a.rec.id)).roles, fixed, '다른 파일이면 자리를 다시 찾음');
  // 예전에 저장한(출처 없는) 양식은 바꾸지 않음
  await st.put({ id: 'fmOld', name: '작년 계획서 서식 · 예전', kind: 'hwpx', bytes: letter, roles: LR, savedAt: 2 });
  const c = await SF.saveForm('year', planForm, '작년 계획서 서식 · 예전', { pick: 'empty', replace: true, from: 'lastPlan:year' });
  assert.notEqual(c.rec.id, 'fmOld');
  assert.deepEqual([...(await st.get('fmOld')).bytes], [...letter]);
});

const count = (s, x) => s.split(x).length - 1;

test('[rf-head-short] 행사계획: 쌍점 없는 짧은 제목 줄(「1. 목적 협동심과 체력 증진」「2. 장소 본교 운동장」)도 제목 낱말 뒤 글은 그 칸 글 첫 줄로 — 새 서식으로 바꿔도 한 번만 남음', () => {
  const plan = '1. 목적 협동심과 체력 증진\n2. 장소 본교 운동장\n3. 대상 전교생\n4. 세부 운영\n가. 개회식';
  const e = ev(plan);
  const { olds } = R.eventOlds(e);
  assert.deepEqual(olds.map(o => [o.title, o.text]), [['목적', '협동심과 체력 증진'], ['장소', '본교 운동장'], ['대상', '전교생'], ['세부 운영', '가. 개회식']]);
  assert.equal(olds[0].role, 'purpose', '제목 낱말로 역할');
  // AI 없이(규칙만 — 옮길 곳 없는 장소·대상은 앞 칸에 붙음) · AI가 장소·대상을 운영 개요로 옮김
  for (const answer of [null, { map: [{ to: 1, from: ['o2', 'o3'] }], write: [] }]) {
    const { out } = reformEvent(e, answer);
    for (const s of ['협동심과 체력 증진', '장소: 본교 운동장', '대상: 전교생', '가. 개회식']) assert.equal(count(out.plan, s), 1, `${s} 한 번:\n${out.plan}`);
    assert.ok(out.plan.includes('Ⅰ. 추진 목적\n협동심과 체력 증진'), '비슷한 제목 칸이면 글만: ' + out.plan);
    if (answer) assert.ok(out.plan.includes('Ⅱ. 운영 개요\n장소: 본교 운동장\n대상: 전교생\nⅢ.'), out.plan);
  }
  // 같은 제목 줄 서식으로 옮기면 제목 줄 글을 다시 쓰지 않음
  const { pre, olds: o2 } = R.eventOlds(e);
  const H = R.formHeads('1. 목적 협동심과 체력 증진\n2. 장소 본교 운동장\n3. 대상 전교생\n4. 세부 운영'), hs = R.withPlanRoles(H.heads);
  assert.equal(R.applyEvent(e, R.mergeReform(hs, o2, R.ruleMap(o2, hs), null), H, pre, o2).plan, plan);
  // 「2. 장소: 본교 운동장」(쌍점)은 그대로
  const c = R.eventOlds(ev('1. 목적\n가. 협동심\n2. 장소: 본교 운동장\n3. 세부 운영\n가. 개회식')).olds;
  assert.deepEqual([c[1].title, c[1].text, c[1].cut], ['장소', '본교 운동장', true]);
  assert.equal(count(reformEvent(ev('1. 목적\n가. 협동심\n2. 장소: 본교 운동장\n3. 세부 운영\n가. 개회식')).out.plan, '장소: 본교 운동장'), 1);
  // 따옴표로 시작하는 글도 제목 낱말 뒤에서 자름
  assert.deepEqual(['방침', '「모두가 즐기는 운동회」'], (o => [o.title, o.text])(R.eventOlds(ev('1. 목적\n가. 협동심\n2. 방침 「모두가 즐기는 운동회」\n3. 세부 운영')).olds[1]));
});

test('[rf-head-short] 제목 그대로인 큰 제목(「세부 운영」「추진 목적」「평가 및 환류」「평가 계획」「예산 내역」…)은 나누지 않음 — 행사·학급운영계획', () => {
  const titles = ['세부 운영', '추진 목적', '안전 대책', '평가 및 환류', '평가 계획', '예산 내역', '목적 및 필요성', '기대 효과 및 환류', '일시 및 장소', '유의 사항', '내용 요약', '일정 계획(안)', '평가 결과 분석', '평가 결과 공유', '기대 효과', '평가 (교사용)', '대상 학년 및 인원'];
  const e = ev(titles.map((t, i) => `${i + 1}. ${t}\n가. 본문${i + 1}`).join('\n'));
  const { olds } = R.eventOlds(e);
  assert.deepEqual(olds.map(o => o.title), titles);
  olds.forEach((o, i) => assert.equal(o.text, `가. 본문${i + 1}`, o.title));
  assert.equal(olds[4].role, 'eval', '「평가 계획」 전체로 역할');
  const outline = C.withRoles(titles.map((t, i) => ({ id: 's' + (i + 1), title: t, level: 1 })));
  const co = R.classOlds({ outline, draft: {}, guide: null });
  assert.deepEqual(co.map(o => [o.title, o.text]), titles.map(t => [t, '']));
  // 학급운영계획: 제목 낱말 뒤 글(「목표 서로 돕는 반」)은 나눔, 「평가 계획」은 그대로
  const p = { outline: C.withRoles([{ id: 's1', title: '목표 서로 돕는 반', level: 1 }, { id: 's2', title: '학급 현황', level: 1 }, { id: 's3', title: '평가 계획', level: 1 }]),
    draft: { s1: '바른 말을 쓴다.', s2: '남 12명 여 13명', s3: '수행평가 중심' }, guide: null };
  const po = R.classOlds(p);
  assert.deepEqual(po.map(o => o.title), ['목표', '학급 현황', '평가 계획']);
  const H = R.formHeads('Ⅰ. 학급 교육 목표\nⅡ. 학급 현황 및 조직\nⅢ. 평가 계획'), hs = R.withPlanRoles(H.heads);
  const out = R.applyClass(p, R.mergeReform(hs, po, R.ruleMap(po, hs), null), H, po);
  assert.equal(out.draft[out.outline[0].id], '서로 돕는 반\n바른 말을 쓴다.');
  assert.equal(count(Object.values(out.draft).join('\n'), '서로 돕는 반'), 1);
});
