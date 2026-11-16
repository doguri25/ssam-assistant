// 2026-11-16 검토 고침 — 계획서 「새 서식으로 바꾸기」(스펙 2026-11-15 1B): 행사·연간계획 [되돌리기]가 바꾸기와 상관없는 칸까지 되돌리던 것,
// 연간계획 큰 제목 줄에 함께 적힌 글, 로마 숫자 서식에서 고치거나 더한 큰 제목 줄, 제목을 마무리하는 낱말(「근거 법령」), 새 서식 제목의 빈칸 자리. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
store.useStorage(mem());

const R = await import('../../web/menus/plan/reform-model.js');
const Y = await import('../../web/menus/plan/year-model.js');
const E = await import('../../web/menus/plan/event-model.js');
const C = await import('../../web/menus/plan/classplan-model.js');

const count = (s, x) => s.split(x).length - 1;
const reformYear = (d, form) => {
  const H = R.yearHeads(form), olds = R.yearOlds(d);
  const f = R.mergeReform(H.heads, olds, R.ruleMap(olds, H.heads, { accepts: R.yearAccepts }), null, { accepts: R.yearAccepts });
  return R.applyYear(d, f, H, olds);
};

test('[C15] 행사계획 [되돌리기]: 계획서 글·서식 제목 줄·계획서 검토 의견만 — 가정통신문을 손으로 고쳐 지운 의견은 되살아나지 않음', () => {
  const rvPlan = { section: 'plan', problem: '목적이 흐려요', fix: '고친 계획서' };
  const rvSafety = { section: 'safety', problem: '보건실 위치가 없어요', fix: '고친 점검표', done: 'main' };
  const rvLetter = { section: 'letter', problem: '문의처가 없어요', fix: '옛 글로 쓴 가정통신문 수정안' };
  const e = { docs: { plan: '2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.', safety: '- 안전', letter: '옛 가정통신문', rain: '', done: false }, rv: [rvPlan, rvSafety, rvLetter] };
  const snap = R.eventSnap(e);
  // [이대로 바꾸기](계획서 의견만 지움) → 가정통신문 칸을 손으로 고침(그 칸의 열린 의견이 지워짐)
  e.docs = { ...e.docs, plan: '1. 추진 목적\n2. 운영 개요\n가. 일시: 2027. 5. 6.\n3. 평가', form: ['1. 추진 목적', '2. 운영 개요', '3. 평가'] };
  e.rv = e.rv.filter(x => x.section !== 'plan');
  e.docs.letter = '김하늘 선생님이 고친 가정통신문';
  e.rv = e.rv.filter(x => x.section !== 'letter' || x.done);
  const back = R.eventRestore(e, snap);
  assert.equal(back.docs.plan, '2027 가을 운동회 운영 계획\nⅠ. 개요\n가. 일시: 2027. 5. 6.');
  assert.deepEqual(back.docs.form, []);
  assert.equal(back.docs.letter, '김하늘 선생님이 고친 가정통신문', '가정통신문은 지금 글 그대로');
  assert.equal(back.docs.safety, '- 안전');
  assert.deepEqual(back.rv, [rvPlan, rvSafety], '가정통신문 옛 의견이 되살아남: ' + JSON.stringify(back.rv));
  // 바꾸기 뒤 [다시 만들기](의견 모두 지움) → 새 가정통신문 의견만 있음 → 되돌려도 계획서 옛 의견만 돌아옴
  const fresh = { section: 'letter', problem: '복장이 없어요', fix: '새 수정안' };
  const b2 = R.eventRestore({ ...e, rv: [fresh] }, snap);
  assert.deepEqual(b2.rv, [rvPlan, fresh]);
  // 스냅숏은 바꾸기 뒤에 바뀌지 않음
  assert.deepEqual(snap.rv, [rvPlan]);
});

test('[C17] 연간계획 [되돌리기]: 바꾸기 전 목차·글로 — 바꾸기 뒤에 고친 일정·예산 표는 지금 그대로', () => {
  const LAST = 'Ⅰ. 추진 근거\nⅡ. 목적\nⅢ. 운영 방침\nⅣ. 세부 추진 내용\nⅤ. 추진 일정\nⅥ. 소요 예산\nⅦ. 기대 효과';
  const o = Y.yearOutline(LAST);
  const d = Y.normDraft({ x1: '1. 2027 독서교육 기본계획', purpose: '책을 즐겨 읽는 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서', evaluation: '독서량이 는다.',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }], outline: o.items, roman: o.roman });
  const snap = JSON.parse(JSON.stringify(d));
  const now = reformYear(d, 'Ⅰ. 목적\nⅡ. 추진 방침\nⅢ. 세부 추진 계획\nⅣ. 월별 추진 일정\nⅤ. 소요 예산\nⅥ. 평가');
  assert.equal(now.fromForm, true);
  // 5단계 일정 날짜를 고치고, 4단계 예산 줄을 더함
  now.schedule[0] = { ...now.schedule[0], date: '2027-03-17', month: 3 };
  now.budget.push({ name: '간식', amount: 30000, note: '' });
  now.details += '\n2. 독서 행사';
  const back = R.yearRestore(now, snap);
  assert.deepEqual(back.outline, snap.outline, '바꾸기 전 목차');
  assert.equal(back.fromForm, false);
  for (const k of ['x1', 'purpose', 'policy', 'details', 'evaluation']) assert.equal(back[k], snap[k], k);
  assert.deepEqual(back.schedule, [{ title: '계획 수립', date: '2027-03-17', month: 3 }], '바꾸기 뒤에 고친 일정 날짜');
  assert.deepEqual(back.budget.map(b => b.name), ['도서 구입', '간식'], '바꾸기 뒤에 더한 예산');
  // 지금 초안이 없으면 스냅숏 그대로
  assert.deepEqual(R.yearRestore(null, snap), snap);
});

test('[C16] 연간계획: 큰 제목 줄에 함께 적힌 글(「목적: …」「일시: 연중…」「추진 일정: …」)도 새 서식으로 바꾸면 그 칸 글로 남음 — 한 번만', () => {
  const LAST = '2026학년도 독서교육 운영 계획\nⅠ. 목적: 책을 즐겨 읽는 습관 기르기\n가. 독서\nⅡ. 운영 방침\n가. 전교생\nⅢ. 세부 추진 내용\n1. 아침 독서\nⅣ. 일시: 연중(3월~12월)\nⅤ. 추진 일정: 학기별 2회\nⅥ. 소요 예산 (단위: 원)\nⅦ. 기대 효과';
  const o = Y.yearOutline(LAST);
  assert.deepEqual(o.items.map(x => x.key), ['purpose', 'policy', 'details', 'x1', 'schedule', 'budget', 'evaluation']);
  const d = Y.normDraft({ purpose: '독서 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서', evaluation: '독서량이 는다.', x1: '연중 운영한다.',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서', amount: 1000, note: '' }], outline: o.items, roman: o.roman });
  const olds = R.yearOlds(d);
  assert.deepEqual(olds.map(x => x.title), ['목적', '운영 방침', '세부 추진 내용', '일시', '추진 일정', '소요 예산 (단위: 원)', '기대 효과'], '쌍점 앞이 맞출 제목');
  assert.equal(olds[0].role, 'purpose');
  assert.equal(olds[0].text, '책을 즐겨 읽는 습관 기르기\n독서 습관을 기른다.', 'AI에도 제목 줄 글');
  const nd = reformYear(d, 'Ⅰ. 목적\nⅡ. 방침\nⅢ. 세부 추진 계획\nⅣ. 추진 일정\nⅤ. 예산\nⅥ. 평가');
  const all = Y.planText({ year: 2027, name: '독서', draft: nd });
  for (const s of ['책을 즐겨 읽는 습관 기르기', '일시: 연중(3월~12월)', '추진 일정: 학기별 2회', '연중 운영한다.', '1. 아침 독서']) assert.equal(count(all, s), 1, `${s} 한 번:\n${all}`);
  assert.equal(nd.purpose, '책을 즐겨 읽는 습관 기르기\n독서 습관을 기른다.', '비슷한 제목 칸이면 글만 첫 줄로');
  // 옮길 곳 없는 「일시」는 앞 칸(세부)에 붙고 옛 제목을 붙임, 일정 표 칸 제목 줄 글은 가까운 글 칸(앞 칸) 끝으로
  assert.equal(nd.details, '1. 아침 독서\n일시: 연중(3월~12월)\n연중 운영한다.\n추진 일정: 학기별 2회');
  assert.ok(!all.includes('단위: 원'), '표 칸 제목의 괄호 글(표 머리)은 글 칸으로 옮기지 않음:\n' + all);
  assert.deepEqual(nd.schedule, d.schedule, '일정 표 그대로');
  // 같은 제목 줄 서식(작년 계획서)으로 옮기면 제목 줄 글을 다시 쓰지 않음
  const same = reformYear(d, LAST);
  const t2 = Y.planText({ year: 2027, name: '독서', draft: same });
  for (const s of ['책을 즐겨 읽는 습관 기르기', '연중(3월~12월)', '학기별 2회']) assert.equal(count(t2, s), 1, `${s} 한 번:\n${t2}`);
  assert.equal(same.purpose, '독서 습관을 기른다.');
  // 일정 표 칸이 맨 앞이면 뒤 글 칸 첫머리로
  const o3 = Y.yearOutline('Ⅰ. 추진 일정: 연중\nⅡ. 목적\nⅢ. 세부 추진 내용');
  const d3 = Y.normDraft({ purpose: '독서 습관', details: '아침 독서', schedule: [{ title: '계획 수립', date: '2027-03-10' }], outline: o3.items, roman: o3.roman });
  const n3 = reformYear(d3, 'Ⅰ. 월별 추진 일정\nⅡ. 목적\nⅢ. 세부 추진 계획');
  assert.equal(n3.purpose, '추진 일정: 연중\n독서 습관');
  // 제목 줄 글이 없는 목차는 전과 같음
  const plain = Y.normDraft({ ...d, outline: Y.yearOutline('Ⅰ. 목적\nⅡ. 운영 방침\nⅢ. 세부 추진 내용\nⅣ. 일시\nⅤ. 추진 일정\nⅥ. 소요 예산\nⅦ. 기대 효과').items });
  const np = reformYear(plain, 'Ⅰ. 목적\nⅡ. 방침\nⅢ. 세부 추진 계획\nⅣ. 추진 일정\nⅤ. 예산\nⅥ. 평가');
  assert.deepEqual([np.purpose, np.policy, np.details, np.evaluation], ['독서 습관을 기른다.', '가. 전교생이 참여한다.', '1. 아침 독서\n연중 운영한다.', '독서량이 는다.']);
});

test('[C18] 행사계획: 로마 숫자 새 서식으로 바꾼 뒤 고치거나 더한 큰 제목 줄(「Ⅳ. 평가 및 환류」「Ⅴ. 홍보 계획」)도 큰 제목 — 한글 파일 소제목, 다음 바꾸기에서 따로 맞춤', () => {
  const form = ['Ⅰ. 목적', 'Ⅱ. 운영 개요', 'Ⅲ. 세부 운영', 'Ⅳ. 평가'];
  const plan = ['2027 가을 운동회 운영 계획', 'Ⅰ. 목적', '협동심을 기른다.', 'Ⅱ. 운영 개요', '가. 일시: 10월 7일', 'Ⅲ. 세부 운영', '가. 개회식', '1. 경기 종목', 'Ⅳ. 평가 및 환류', '설문으로 평가한다.', 'Ⅴ. 홍보 계획', '가정통신문 발송'].join('\n');
  const e = { ...E.newEvent(), name: '가을 운동회', docs: { plan, safety: '', letter: '', rain: '', done: false, form } };
  assert.deepEqual(E.planHeadLines(e, plan), [1, 3, 5, 8, 10]);
  const blocks = E.docDoc(e, 'plan').blocks;
  assert.deepEqual(blocks.filter(b => b.type === 'h').map(b => b.text), ['Ⅰ. 목적', 'Ⅱ. 운영 개요', 'Ⅲ. 세부 운영', 'Ⅳ. 평가 및 환류', 'Ⅴ. 홍보 계획']);
  assert.ok(blocks.some(b => b.type === 'p' && b.text === '가. 개회식\n1. 경기 종목'), '본문의 「1. 경기 종목」은 문단');
  const { pre, olds } = R.eventOlds(e);
  assert.equal(pre, '2027 가을 운동회 운영 계획');
  assert.deepEqual(olds.map(o => [o.title, o.text]), [['목적', '협동심을 기른다.'], ['운영 개요', '가. 일시: 10월 7일'], ['세부 운영', '가. 개회식\n1. 경기 종목'], ['평가 및 환류', '설문으로 평가한다.'], ['홍보 계획', '가정통신문 발송']]);
  // 숫자 서식(「1. 목적」)은 서식에 없는 「1.」 줄을 큰 제목으로 보지 않음(본문의 「1. 경기 종목」이 큰 제목이 되지 않게)
  const form2 = ['1. 목적', '2. 운영 개요', '3. 세부 운영'];
  const plan2 = '1. 목적\n협동심\n2. 운영 개요\n가. 일시\n3. 세부 운영\n1. 경기 종목\n2. 줄다리기\n4. 홍보 계획';
  assert.deepEqual(E.planHeadLines({ docs: { form: form2 } }, plan2), [0, 2, 4]);
  // 서식이 없으면 목차 읽기 그대로
  assert.deepEqual(E.planHeadLines({ docs: {} }, plan), C.topLines(plan));
});

test('[C19] 제목 낱말 뒤 한 낱말이 제목을 마무리하는 말(「근거 법령」「담당 교사」「예산 집행」「평가 관점」…)이면 제목의 일부 — 뜻 없는 줄(「법령」「담당: 교사」)이 생기지 않음', () => {
  const titles = ['근거 법령', '담당 교사', '예산 집행', '평가 관점', '목표 달성도', '대상 학년', '장소 배치도', '장소 섭외', '복장 규정', '방침 결정', '근거 자료', '대상 학생'];
  for (const t of titles) {
    const head = t.split(' ')[0];
    const { olds } = R.eventOlds({ docs: { plan: `1. ${t}\n본문\n2. 둘\n3. 셋`, form: [] } });
    assert.deepEqual([olds[0].title, olds[0].lead, olds[0].text], [head, '', '본문'], t);
    const co = R.classOlds({ outline: [{ id: 's1', title: t, level: 1 }], draft: { s1: '본문' }, guide: null });
    assert.deepEqual([co[0].title, co[0].lead, co[0].text], [head, '', '본문'], '학급운영: ' + t);
  }
  // 연간계획 목차 제목도
  const yo = R.yearOlds(Y.normDraft({ purpose: '가', policy: '나', details: '다', evaluation: '라', outline: [{ key: 'x1', title: '근거 법령' }, { key: 'purpose', title: '목적' }, { key: 'budget', title: '예산 집행' }] }));
  assert.deepEqual(yo.map(o => [o.title, o.lead]), [['근거', ''], ['목적', ''], ['예산', '']]);
  const plan = '1. 근거 법령\n가. 학교안전법 제8조\n2. 목적\n가. 협동심을 기른다.\n3. 세부 운영\n가. 개회식\n4. 담당 교사\n가. 체육부 운영\n5. 예산 집행\n가. 학교운영비 500,000원';
  const e = { docs: { plan, form: [] } };
  const { pre, olds } = R.eventOlds(e);
  const H = R.formHeads('Ⅰ. 추진 근거\nⅡ. 목적\nⅢ. 세부 운영\nⅣ. 업무 분장\nⅤ. 소요 예산'), hs = R.withPlanRoles(H.heads);
  // 규칙으로 맞추는 것은 전처럼(「근거」↔「추진 근거」, 「예산」↔「소요 예산」), 「담당 교사」만 AI가 옮김
  const rules = R.ruleMap(olds, hs);
  assert.deepEqual(rules, [['o1'], ['o2'], ['o3'], [], ['o5']]);
  const f = R.mergeReform(hs, olds, rules, { map: [{ to: 3, from: ['o4'] }], write: [] });
  assert.equal(R.applyEvent(e, f, { ...H, heads: hs }, pre, olds).plan,
    'Ⅰ. 추진 근거\n가. 학교안전법 제8조\nⅡ. 목적\n가. 협동심을 기른다.\nⅢ. 세부 운영\n가. 개회식\nⅣ. 업무 분장\n가. 체육부 운영\nⅤ. 소요 예산\n가. 학교운영비 500,000원');
  // 제목 낱말 뒤가 글이면 그대로 자름(한 낱말이어도)
  for (const [t, title, lead] of [['대상 전교생', '대상', '전교생'], ['장소 강당', '장소', '강당'], ['장소 본교 운동장', '장소', '본교 운동장'], ['담당 체육부 교사', '담당', '체육부 교사'],
    ['일시 연중', '일시', '연중'], ['예산 없음', '예산', '없음'], ['대상 전교 학생', '대상', '전교 학생']]) {
    const o = R.eventOlds({ docs: { plan: `1. ${t}\n본문\n2. 둘\n3. 셋`, form: [] } }).olds[0];
    assert.deepEqual([o.title, o.lead, o.cut], [title, lead, true], t);
  }
});
