// 계획서 「새 서식으로 바꾸기」(스펙 2026-11-15 1B): 새 서식(.hwpx)의 큰 제목에 지금 초안 칸을 맞춤 — 규칙 먼저(같은 제목·같은 역할·비슷한 제목),
// 남은 것은 AI 답 { map, write }(모르는 id는 버림), 옮길 곳 없는 옛 칸은 [이 칸에 붙이기]. 연간(outline·글)·행사(계획서 글)·학급운영(outline·칸 글)
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

const LAST = ['2026학년도 독서교육 운영 계획', 'Ⅰ. 추진 근거', '1. 2026 독서교육 기본계획', 'Ⅱ. 목적', '책을 즐겨 읽는 습관을 기른다.', 'Ⅲ. 운영 방침', '가. 전교생이 참여한다.',
  'Ⅳ. 세부 추진 내용', '1. 아침 독서', 'Ⅴ. 추진 일정', '3월 계획 수립', 'Ⅵ. 소요 예산', '도서 구입 500,000원', 'Ⅶ. 기대 효과', '독서량이 는다.'].join('\n');
const yearDraft = () => {
  const o = Y.yearOutline(LAST);
  return Y.normDraft({ x1: '1. 2027 독서교육 기본계획', purpose: '책을 즐겨 읽는 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서\n2. 독서 행사', evaluation: '독서량이 는다.',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }], outline: o.items, roman: o.roman });
};
const NEW_YEAR = '새싹초등학교 업무 계획서\nⅠ. 목적\n(목적을 적어요)\nⅡ. 추진 방침\nⅢ. 세부 추진 계획\nⅣ. 월별 추진 일정\nⅤ. 소요 예산\nⅥ. 평가\nⅦ. 홍보 계획';

test('새 서식 글의 큰 제목(1단계) — 셋보다 적으면 없음, 로마 숫자 꼴', () => {
  const h = R.formHeads(NEW_YEAR);
  assert.deepEqual(h.heads.map(x => x.title), ['목적', '추진 방침', '세부 추진 계획', '월별 추진 일정', '소요 예산', '평가', '홍보 계획']);
  assert.equal(h.roman, true);
  const a = R.formHeads('1. 추진 목적\n가. 작은 제목\n2. 운영 개요\n3. 세부 운영 계획');
  assert.deepEqual(a.heads.map(x => x.title), ['추진 목적', '운영 개요', '세부 운영 계획']);
  assert.equal(a.roman, false);
  assert.deepEqual(R.formHeads('가정통신문\n학부모님께\n안녕하십니까').heads, []);
  assert.deepEqual(R.formHeads('Ⅰ. 목적\nⅡ. 방침').heads, [], '둘뿐이면 없음');
});

test('제목 역할: 연간계획 칸 역할(목적·방침·일정·예산·평가·세부) + 학급운영 역할(시수·월별·평가 표), 근거·현황은 역할 없음', () => {
  assert.equal(Y.sectionRole('추진 목적'), 'purpose');
  assert.equal(Y.sectionRole('운영 방침'), 'policy');
  assert.equal(Y.sectionRole('추진 일정'), 'schedule');
  assert.equal(Y.sectionRole('추진 근거'), '');
  assert.equal(Y.sectionRole('운영 개요'), '');
  assert.equal(R.planRole('평가 계획'), 'eval');
  assert.equal(R.planRole('월별 운영 계획'), 'monthly');
  assert.equal(R.planRole('학급 경영 방침'), 'policy');
});

test('규칙 맞추기: 같은 제목 → 같은 역할(겹치지 않는 것만) → 비슷한 제목, 옛 칸은 한 곳에만', () => {
  const olds = [{ id: 'o1', title: '개요', role: '' }, { id: 'o2', title: '운영 방침', role: 'policy' }, { id: 'o3', title: '세부 운영', role: 'details' }, { id: 'o4', title: '안전 대책', role: '' }, { id: 'o5', title: '평가', role: 'evaluation' }];
  const heads = [{ title: '추진 목적', role: 'purpose' }, { title: '운영 개요', role: '' }, { title: '세부 운영 계획', role: 'details' }, { title: '안전 관리', role: '' }, { title: '평가 및 환류', role: 'evaluation' }];
  assert.deepEqual(R.ruleMap(olds, heads), [[], ['o1'], ['o3'], [], ['o5']]);
  // 같은 역할이 옛 칸 둘에 있으면(어느 것인지 모름) 역할로는 맞추지 않음
  const two = [{ id: 'a', title: '가', role: 'details' }, { id: 'b', title: '나', role: 'details' }];
  assert.deepEqual(R.ruleMap(two, [{ title: '다', role: 'details' }, { title: '라', role: 'purpose' }, { title: '마', role: '' }]), [[], [], []]);
  // 같은 제목이 먼저(역할이 달라도)
  assert.deepEqual(R.ruleMap([{ id: 'x', title: '기대 효과', role: 'evaluation' }, { id: 'y', title: '평가', role: 'evaluation' }], [{ title: '평가', role: 'evaluation' }, { title: '기대 효과', role: 'evaluation' }]), [['y'], ['x']]);
  // accepts: 받지 않는 칸에는 넣지 않음(연간계획 일정·예산 표 칸)
  assert.deepEqual(R.ruleMap([{ id: 'p', title: '일정', role: '' }], [{ title: '일정', role: 'schedule' }], { accepts: (h, o) => o.role === h.role }), [[]]);
});

test('AI 답 다듬기: 모르는 새 칸·옛 칸 id는 버리고, 빈 글은 버림 (to는 n2·2·"2" 모두)', () => {
  const v = R.normReform({ map: [{ to: 'n2', from: ['o1', 'zz', 'o1'] }, { to: 9, from: ['o2'] }, { to: '3', from: 'o3' }, 'x'], write: [{ to: 'n1', text: '  새 글 ' }, { to: 'n4', text: '' }, { to: 'n7', text: '없는 칸' }] }, ['o1', 'o2', 'o3'], 4);
  assert.deepEqual(v.map, [{ to: 1, from: ['o1'] }, { to: 2, from: ['o3'] }]);
  assert.deepEqual(v.write, [{ to: 0, text: '새 글' }]);
  assert.deepEqual(R.normReform(null, ['o1'], 2), { map: [], write: [] });
});

test('맞춤 합치기: 규칙 + AI(옛 칸은 한 곳만, 옛 차례대로) + 새로 쓴 글(옮겨 오는 칸이 있으면 버림), 옮길 곳 없는 칸(기본은 가까운 칸에 붙임), [이 칸에 붙이기]', () => {
  const olds = ['o1', 'o2', 'o3', 'o4'].map((id, i) => ({ id, title: 'T' + i }));
  const heads = [{ title: 'A' }, { title: 'B' }, { title: 'C' }, { title: 'D' }];
  const f = R.mergeReform(heads, olds, [['o2'], [], [], []], { map: [{ to: 0, from: ['o1'] }, { to: 1, from: ['o2'] }], write: [{ to: 0, text: '버림' }, { to: 2, text: '새로 쓴 글' }] });
  assert.deepEqual(f.to.map(x => x.from), [['o1', 'o2', 'o3', 'o4'], [], [], []], '옮길 곳 없는 칸은 앞에서 맞춘 칸에 붙여 둠');
  assert.deepEqual(f.to.map(x => x.write), ['', '', '새로 쓴 글', '']);
  assert.deepEqual(f.orphans, ['o3', 'o4']);
  assert.deepEqual(f.attached, { o3: 0, o4: 0 });
  const g = R.attachOrphan(f, 'o4', 3);
  assert.deepEqual(g.to[3].from, ['o4']);
  assert.deepEqual(g.attached, { o3: 0, o4: 3 });
  const h = R.attachOrphan(g, 'o4', 1);
  assert.deepEqual([h.to[1].from, h.to[3].from], [['o4'], []], '다른 칸으로 옮김');
  const k = R.attachOrphan(R.attachOrphan(h, 'o4', -1), 'o3', -1);
  assert.deepEqual(k.to.map(x => x.from), [['o1', 'o2'], [], [], []], '붙이지 않음');
  assert.deepEqual(k.attached, {});
  assert.deepEqual(R.attachOrphan(k, 'o1', 2).to[2].from, [], '옮길 곳 없는 칸만 붙임');
});

test('AI로 보낼 글: 옛 칸·새 칸 id와 글, 이름·전화번호는 자리 표시(돌아온 글은 되돌림), 규칙이 맞춘 칸도 알림', () => {
  const olds = [{ id: 'o1', title: '추진 근거', text: '문의: 교무부 이바다 선생님 041-123-4567' }, { id: 'o2', title: '목적', text: '책을 즐겨 읽는다.' }];
  const heads = [{ title: '목적' }, { title: '홍보 계획' }];
  const { prompt, back } = R.reformPrompt({ kind: '연간계획', title: '2027학년도 독서교육 운영 계획', context: '업무: 독서교육', olds, heads, rules: [['o2'], []] });
  assert.ok(prompt.startsWith('[새 서식 맞추기]'), prompt.slice(0, 40));
  assert.ok(prompt.includes('[n1] 목적') && prompt.includes('[n2] 홍보 계획') && prompt.includes('[o1] 추진 근거'), prompt);
  assert.ok(prompt.includes('「목적」'), '규칙으로 맞춘 칸 알림');
  assert.ok(!prompt.includes('이바다') && !prompt.includes('041-123-4567') && prompt.includes('〔이름1〕') && prompt.includes('{{1}}'), prompt);
  assert.ok(prompt.includes('"map"') && prompt.includes('"write"'));
  assert.equal(back('〔이름1〕 선생님({{1}})'), '이바다 선생님(041-123-4567)');
  assert.equal(R.needsAI(olds, heads, [['o2'], []]), true);
  assert.equal(R.needsAI(olds.slice(1), heads.slice(0, 1), [['o2']]), false, '다 맞으면 AI 없이');
  assert.equal(R.needsAI(olds.slice(1), [{ title: '목적' }, { title: '일정', fixed: '일정 표' }], [['o2'], []]), false, '표 칸은 쓰지 않음');
});

test('연간계획: 옛 칸(목차 차례, 일정·예산 표는 줄 글로) → 새 목차·글, 지침 점검·작년 비교·넣을 칸은 새 차례(textKeys)로', () => {
  const d = yearDraft();
  const olds = R.yearOlds(d);
  assert.deepEqual(olds.map(o => [o.id, o.key, o.title]), [['o1', 'x1', '추진 근거'], ['o2', 'purpose', '목적'], ['o3', 'policy', '운영 방침'], ['o4', 'details', '세부 추진 내용'], ['o5', 'schedule', '추진 일정'], ['o6', 'budget', '소요 예산'], ['o7', 'evaluation', '기대 효과']]);
  assert.ok(olds[4].text.includes('3월 10일 계획 수립') && olds[5].text.includes('도서 구입 500,000원'), olds[4].text + olds[5].text);
  const H = R.yearHeads(NEW_YEAR);
  assert.deepEqual(H.heads.map(h => h.key), ['purpose', 'policy', 'details', 'schedule', 'budget', 'evaluation', 'x1']);
  assert.equal(H.heads[3].fixed, '일정 표');
  const rules = R.ruleMap(olds, H.heads, { accepts: R.yearAccepts });
  assert.deepEqual(rules, [['o2'], ['o3'], ['o4'], ['o5'], ['o6'], ['o7'], []]);
  const f = R.mergeReform(H.heads, olds, rules, { map: [{ to: 0, from: ['o1'] }, { to: 3, from: ['o1'] }], write: [{ to: 6, text: '가. 학교 누리집에 올린다.' }] }, { accepts: R.yearAccepts });
  const nd = R.applyYear(d, f, H, olds);
  assert.deepEqual(nd.outline.map(o => o.title), ['목적', '추진 방침', '세부 추진 계획', '월별 추진 일정', '소요 예산', '평가', '홍보 계획']);
  assert.equal(nd.fromForm, true);
  assert.equal(nd.roman, true);
  assert.equal(nd.purpose, '1. 2027 독서교육 기본계획\n책을 즐겨 읽는 습관을 기른다.');
  assert.equal(nd.x1, '가. 학교 누리집에 올린다.');
  assert.equal(nd.schedule.length, 1);
  assert.deepEqual(Y.textKeys(nd), ['purpose', 'policy', 'details', 'evaluation', 'x1']);
  assert.equal(Y.insertKey(nd, 'policy'), 'policy');
  const g = Y.guideStatus([{ item: '누리집 홍보', keywords: ['누리집'], sentence: '', section: 'details' }], nd);
  assert.equal(g[0].included, true, '새로 쓴 칸 글도 지침 점검에');
  assert.ok(Y.draftText(nd).includes('누리집'));
  const heads = Y.planDoc({ year: 2027, name: '독서교육', draft: nd }).blocks.filter(b => b.type === 'h').map(b => b.text);
  assert.deepEqual(heads, ['Ⅰ. 목적', 'Ⅱ. 추진 방침', 'Ⅲ. 세부 추진 계획', 'Ⅳ. 월별 추진 일정', 'Ⅴ. 소요 예산', 'Ⅵ. 평가', 'Ⅶ. 홍보 계획']);
  // 저장해 다시 읽어도 새 서식 차례(「다시 만들기」도 이 차례로)
  assert.equal(Y.normDraft(JSON.parse(JSON.stringify(nd))).fromForm, true);
  assert.deepEqual(Y.draftOutline({ sources: { lastPlan: LAST }, draft: nd }).items.map(o => o.title), nd.outline.map(o => o.title));
  assert.deepEqual(Y.draftOutline({ sources: { lastPlan: LAST }, draft: d }).items.map(o => o.title), Y.yearOutline(LAST).items.map(o => o.title), '새 서식이 아니면 작년 계획서 목차');
  // 일정 칸을 글 칸에 붙이면 줄 글로
  const f2 = R.attachOrphan(R.mergeReform(H.heads.slice(0, 1).concat([{ title: '홍보', key: 'x1' }]), olds, [['o2'], []], { map: [], write: [] }), 'o5', 1);
  const nd2 = R.applyYear(d, f2, { heads: [{ title: '목적', key: 'purpose' }, { title: '홍보', key: 'x1' }], roman: false }, olds);
  assert.ok(nd2.x1.includes('3월 10일 계획 수립'), nd2.x1);
});

test('행사계획: 계획서 글을 큰 제목 칸으로 나눔 → 새 제목 줄(서식 번호 꼴)로 다시 씀, 작년 계획서 없이도 그 차례로 한글 파일', () => {
  const plan = '2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.\nⅡ. 운영 방침\n가. 모두가 즐기는 운동회\nⅢ. 세부 운영\n1. 경기 종목\nⅣ. 안전 대책\n가. 보건실 운영\nⅤ. 평가\n가. 만족도 조사';
  const e = E.saveEvent({ ...E.newEvent(), name: '가을 운동회', docs: { plan, safety: '', letter: '', rain: '', done: false } });
  const { pre, olds } = R.eventOlds(e);
  assert.equal(pre, '2027 가을 운동회 운영 계획');
  assert.deepEqual(olds.map(o => o.title), ['개요', '운영 방침', '세부 운영', '안전 대책', '평가']);
  assert.equal(olds[2].text, '1. 경기 종목');
  const H = R.formHeads('1. 추진 목적\n2. 운영 개요\n3. 세부 운영 계획\n4. 안전 관리\n5. 평가 및 환류');
  const hs = R.withPlanRoles(H.heads);
  const rules = R.ruleMap(olds, hs);
  assert.deepEqual(rules, [[], ['o1'], ['o3'], [], ['o5']]);
  const f = R.mergeReform(hs, olds, rules, { map: [{ to: 3, from: ['o4'] }], write: [{ to: 0, text: '가. 협동심을 기른다.' }] });
  assert.deepEqual(f.orphans, ['o2']);
  assert.deepEqual(f.attached, { o2: 1 }, '옮길 곳 없는 운영 방침은 바로 앞 개요가 간 칸에 붙여 둠');
  const out = R.applyEvent(e, f, H, pre, olds);
  assert.deepEqual(out.form, ['1. 추진 목적', '2. 운영 개요', '3. 세부 운영 계획', '4. 안전 관리', '5. 평가 및 환류']);
  assert.equal(out.plan, '2027 가을 운동회 운영 계획\n1. 추진 목적\n가. 협동심을 기른다.\n2. 운영 개요\n가. 일시: 2027. 5. 6.\n가. 모두가 즐기는 운동회\n3. 세부 운영 계획\n1. 경기 종목\n4. 안전 관리\n가. 보건실 운영\n5. 평가 및 환류\n가. 만족도 조사');
  assert.ok(!R.applyEvent(e, R.attachOrphan(f, 'o2', -1), H, pre, olds).plan.includes('모두가 즐기는'), '「붙이지 않음」이면 빠짐');
  // 작년 계획서(참고 자료)가 없어도 그 서식 차례 그대로(본문의 「1. 경기 종목」은 큰 제목이 아님)
  const e2 = E.saveEvent({ ...e, docs: { ...e.docs, plan: out.plan, form: out.form } });
  assert.deepEqual(e2.docs.form, out.form, '저장해도 남음');
  const doc = E.docDoc(e2, 'plan');
  assert.deepEqual(doc.blocks.filter(b => b.type === 'h').map(b => b.text), out.form);
  assert.ok(E.planFormRule(e2).includes('1. 추진 목적 / 2. 운영 개요'), E.planFormRule(e2));
  assert.equal(E.planFormRule(e), '');
  // 다시 바꿀 때도 서식 제목 줄로 나눔
  assert.deepEqual(R.eventOlds(e2).olds.map(o => o.title), ['추진 목적', '운영 개요', '세부 운영 계획', '안전 관리', '평가 및 환류']);
  // 큰 제목이 없는 글은 한 칸(세부 계획)
  assert.deepEqual(R.eventOlds(E.saveEvent({ ...E.newEvent(), docs: { plan: '그냥 글', safety: '', letter: '', rain: '' } })).olds.map(o => o.title), ['세부 계획']);
});

test('학급운영계획: 큰 제목 묶음(작은 칸은 따라감) → 새 큰 제목, 칸 id·지침 칸은 이어짐, 역할(월별·평가 표)은 다시 정함', () => {
  const outline = C.withRoles([{ id: 's1', title: '학급 현황', level: 1 }, { id: 's2', title: '학급 실태', level: 2 }, { id: 's3', title: '학급 조직', level: 2 },
    { id: 's4', title: '학급 교육 목표', level: 1 }, { id: 's5', title: '평가 계획', level: 1 }, { id: 's6', title: '교과 평가 계획', level: 2 }, { id: 's7', title: '월별 운영 계획', level: 1 }, { id: 's8', title: '기타', level: 1 }]);
  const p = { outline, draft: { s2: '남 12명 여 13명', s3: '1인 1역', s4: '서로 돕는 반', s6: '수행평가 중심', s7: '3월 학급 세우기', s8: '버릴 글' }, guide: [{ item: '목표', keywords: [], sentence: '', section: 's4' }] };
  const olds = R.classOlds(p);
  assert.deepEqual(olds.map(o => o.title), ['학급 현황', '학급 교육 목표', '평가 계획', '월별 운영 계획', '기타']);
  assert.ok(olds[0].text.includes('학급 실태: 남 12명 여 13명'), olds[0].text);
  const H = R.formHeads('Ⅰ. 학급 교육 목표\nⅡ. 학급 현황 및 조직\nⅢ. 평가 계획\nⅣ. 월별 운영 계획\nⅤ. 학부모 소통');
  const hs = R.withPlanRoles(H.heads);
  const rules = R.ruleMap(olds, hs);
  assert.deepEqual(rules, [['o2'], ['o1'], ['o3'], ['o4'], []]);
  const f = R.mergeReform(hs, olds, rules, { map: [], write: [{ to: 4, text: '학부모 상담 주간을 운영한다.' }] });
  assert.deepEqual(f.orphans, ['o5']);
  const kept = R.applyClass(p, f, H, olds);
  assert.equal(kept.draft[kept.outline[6].id], '3월 학급 세우기\n버릴 글', '기본은 바로 앞 칸에 붙여 둠');
  const out = R.applyClass(p, R.attachOrphan(f, 'o5', -1), H, olds);
  assert.deepEqual(out.outline.map(x => [x.title, x.level]), [['학급 교육 목표', 1], ['학급 현황 및 조직', 1], ['학급 실태', 2], ['학급 조직', 2], ['평가 계획', 1], ['교과 평가 계획', 2], ['월별 운영 계획', 1], ['학부모 소통', 1]]);
  assert.equal(out.outline[0].id, 's4', '한 칸이 그대로 오면 id도 그대로');
  assert.equal(out.draft.s4, '서로 돕는 반');
  assert.equal(out.draft.s2, '남 12명 여 13명');
  assert.equal(out.draft[out.outline[7].id], '학부모 상담 주간을 운영한다.');
  assert.ok(!Object.values(out.draft).some(v => v.includes('버릴 글')), '붙이지 않은 칸 글은 빠짐');
  assert.equal(out.outline.find(x => x.title === '교과 평가 계획').role, 'eval');
  assert.equal(out.outline.find(x => x.title === '월별 운영 계획').role, 'monthly');
  assert.equal(out.guide[0].section, 's4');
  // 여러 칸을 한 칸에 모으면 새 id, 지침 칸은 그 칸으로
  const f2 = R.mergeReform(hs, olds, [['o2', 'o5'], ['o1'], ['o3'], ['o4'], []], { map: [], write: [] });
  const out2 = R.applyClass(p, f2, H, olds);
  assert.notEqual(out2.outline[0].id, 's4');
  assert.equal(out2.draft[out2.outline[0].id], '서로 돕는 반\n버릴 글');
  assert.equal(out2.guide[0].section, out2.outline[0].id);
});

test('학교 양식 저장 도우미: 같은 이름·같은 출처는 바꿔 넣고, 「고른 양식이 없을 때만」 고름, .hwpx가 아니면 code', async () => {
  const A = makeHwpx({ title: '작년 계획서', blocks: [{ type: 'p', text: '본문' }, { type: 'p', text: '2026. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] });
  const r1 = await SF.saveForm('year', A, '작년 계획서 서식 · 독서', { pick: 'empty', replace: true, from: 'lastPlan:year' });
  assert.equal(r1.picked, true);
  assert.equal(SF.pickedForm('year'), r1.rec.id);
  const r2 = await SF.saveForm('year', A, '작년 계획서 서식 · 독서', { pick: 'empty', replace: true, from: 'lastPlan:year' });
  assert.equal(r2.rec.id, r1.rec.id, '같은 이름(같은 출처)은 그 자리에');
  const r3 = await SF.saveForm('year', A, '다른 양식', { pick: 'empty' });
  assert.equal(r3.picked, false, '이미 고른 양식이 있으면 그대로');
  assert.equal(SF.pickedForm('year'), r1.rec.id);
  const r4 = await SF.saveForm('event', A, '작년 계획서 서식 · 독서', { pick: 'empty', replace: true, from: 'lastPlan:event' });
  assert.equal(r4.picked, true);
  const list = await (await (await import('../../web/core/form-store.js')).forms()).list();
  assert.equal(list.filter(f => f.name === '작년 계획서 서식 · 독서').length, 2, '계획서 종류마다 따로(다른 계획서 양식을 덮지 않음)');
  await SF.saveForm('year', A, '새 서식', { pick: true });
  assert.notEqual(SF.pickedForm('year'), r1.rec.id, 'pick: true는 늘 고름');
  SF.pickForm('year', r1.rec.id);
  assert.equal(SF.pickedForm('year'), r1.rec.id);
  await assert.rejects(SF.saveForm('year', new Uint8Array([1, 2, 3]), 'x'), e => e.code === 'NOT_HWPX');
  // 제목·본문 자리를 못 찾은 양식은 저절로 고르지 않음(내려받기가 막히지 않게) — 저장은 함
  const bad = await SF.saveForm('classplan', makeHwpx({ title: '제목만', blocks: [] }), '제목만 서식', { pick: 'empty' });
  assert.equal(bad.ok, false);
  assert.equal(bad.picked, false);
  assert.equal(SF.pickedForm('classplan'), '');
  assert.equal(R.lastFormName('2026 독서교육 계획.hwpx'), '작년 계획서 서식 · 2026 독서교육 계획');
});
