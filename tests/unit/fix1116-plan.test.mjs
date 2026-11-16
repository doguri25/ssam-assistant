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
  // 연간계획 목차 제목(작년 계획서 큰 제목 줄)도 뜻 없는 줄이 생기지 않음 — 제목 전체로 맞춤([R2-1 검토])
  const yo = R.yearOlds(Y.normDraft({ purpose: '가', policy: '나', details: '다', evaluation: '라', outline: [{ key: 'x1', title: '근거 법령' }, { key: 'purpose', title: '목적' }, { key: 'budget', title: '예산 집행' }] }));
  assert.deepEqual(yo.map(o => [o.title, o.lead]), [['근거 법령', ''], ['목적', ''], ['예산 집행', '']]);
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

test('[C20] 새 서식 큰 제목의 빈칸 자리(「목적 :」「일시 : 2027.   .   .(   )」)는 빼고 쌍점 앞만 새 제목으로 — 채워 쓴 제목은 그대로', () => {
  const FORM = '2027 행사 운영 계획\n1. 목적 :\n2. 일시 : 2027.   .   .(   )\n3. 장소 :\n4. 시간 :   :   ~   :\n5. 세부 운영 계획\n6. 평가';
  assert.deepEqual(R.formHeads(FORM).heads.map(h => h.title), ['목적', '일시', '장소', '시간', '세부 운영 계획', '평가']);
  const plan = '1. 목적: 협동심을 기른다.\n2. 일시: 2027. 10. 7.(목)\n3. 장소: 본교 운동장\n4. 세부 운영\n가. 개회식';
  const e = { docs: { plan, form: [] } };
  const { pre, olds } = R.eventOlds(e);
  const H0 = R.formHeads(FORM), hs = R.withPlanRoles(H0.heads);
  const out = R.applyEvent(e, R.mergeReform(hs, olds, R.ruleMap(olds, hs), null), { ...H0, heads: hs }, pre, olds);
  assert.ok(out.plan.startsWith('1. 목적\n협동심을 기른다.\n2. 일시\n2027. 10. 7.(목)\n3. 장소\n본교 운동장\n4. 시간\n5. 세부 운영 계획\n가. 개회식'), out.plan);
  assert.deepEqual(out.form, ['1. 목적', '2. 일시', '3. 장소', '4. 시간', '5. 세부 운영 계획', '6. 평가']);
  // 연간계획 새 서식도
  assert.deepEqual(R.yearHeads('Ⅰ. 목적 :\nⅡ. 추진 기간 : 2027년   월   일 ~   월   일\nⅢ. 세부 추진 계획\nⅣ. 추진 일정').heads.map(h => h.title), ['목적', '추진 기간', '세부 추진 계획', '추진 일정']);
  // 채워 쓴 제목·괄호 안 쌍점은 그대로
  const keep = ['목적: 협동심 기르기', '일시: 2027. 10. 7.(목)', '일시: 2027. 10. 7.', '일시: 2027년 10월 7일', '시간: 09:00~12:00', '평가 (교사용: 3회)', '예산: 500,000원'];
  assert.deepEqual(R.formHeads(keep.map((t, i) => `${i + 1}. ${t}`).join('\n')).heads.map(h => h.title), keep);
});

// ---------- 검토 뒤 고침 ----------
test('[C16 검토] 연간계획: 쌍점 없는 두 낱말 큰 제목(「내용 체계」「예산 확보」「평가 회의」「일정 표」)은 제목 그대로 — 바꾼 초안에 뜻 없는 줄(「내용: 체계」「예산: 확보」「회의」)이 생기지 않음', () => {
  const NEW = 'Ⅰ. 목적\nⅡ. 추진 방침\nⅢ. 세부 추진 계획\nⅣ. 월별 추진 일정\nⅤ. 소요 예산\nⅥ. 평가';
  const make = last => {
    const o = Y.yearOutline(last);
    return Y.normDraft({ purpose: '독서 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서', evaluation: '독서량이 는다.',
      schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }], outline: o.items, roman: o.roman });
  };
  const d = make('Ⅰ. 목적\nⅡ. 운영 방침\nⅢ. 내용 체계\nⅣ. 추진 일정\nⅤ. 예산 확보\nⅥ. 평가');
  const nd = reformYear(d, NEW);
  assert.deepEqual([nd.purpose, nd.policy, nd.details, nd.evaluation], ['독서 습관을 기른다.', '가. 전교생이 참여한다.', '1. 아침 독서', '독서량이 는다.']);
  const all = Y.planText({ year: 2027, name: '독서', draft: nd });
  for (const s of ['체계', '확보']) assert.ok(!all.includes(s), `${s}:\n${all}`);
  assert.deepEqual(nd.schedule, d.schedule);
  assert.deepEqual(nd.budget, d.budget);
  // 마지막 큰 제목이 「평가 회의」여도 평가 칸 첫 줄에 「회의」가 생기지 않음, 표 칸 「일정 표」의 「표」도 글 칸으로 옮기지 않음
  const d2 = make('Ⅰ. 목적\nⅡ. 운영 방침\nⅢ. 세부 추진 내용\nⅣ. 일정 표\nⅤ. 예산 운용\nⅥ. 평가 회의');
  const n2 = reformYear(d2, NEW);
  assert.equal(n2.evaluation, '독서량이 는다.');
  assert.equal(n2.details, '1. 아침 독서');
  const t2 = Y.planText({ year: 2027, name: '독서', draft: n2 });
  for (const s of ['회의', '일정: 표', '운용']) assert.ok(!t2.includes(s), `${s}:\n${t2}`);
  // 연간계획 목차 제목(작년 계획서 큰 제목 줄)은 쌍점 뒤만 글로 — 제목 낱말 뒤 한 낱말은 자르지 않음
  for (const t of ['예산 운용', '예산 확보', '예산 지원', '경비 지원', '내용 체계', '평가 회의', '평가 실시', '방법 개선', '방침 공유', '목표 수준', '일정 표', '방향 제시', '목적 달성']) {
    const o = R.yearOlds(Y.normDraft({ purpose: '가', details: '나', outline: [{ key: 'purpose', title: '목적' }, { key: 'x1', title: t }, { key: 'details', title: '세부 추진 계획' }] }))[1];
    assert.deepEqual([o.title, o.lead, o.cut], [t, '', false], t);
  }
  // 행사·학급운영계획은 전과 같이 제목 낱말 뒤 글을 자름(「목적 협동심과 체력 증진」)
  const ev = R.eventOlds({ docs: { plan: '1. 목적 협동심과 체력 증진\n본문\n2. 둘\n3. 셋', form: [] } }).olds[0];
  assert.deepEqual([ev.title, ev.lead, ev.cut], ['목적', '협동심과 체력 증진', true]);
});

test('[C20 검토] 새 서식 큰 제목의 밑줄 빈칸·단위 낱말이 붙은 빈칸(「소요 예산 :      원」「인원 : (   )명」「목적: ____」「일시: 20__. __. __.」)도 쌍점 앞만 새 제목으로', () => {
  const FORM = ['1. 목적: ________', '2. 일시: 20__. __. __.', '3. 인원 : (   )명', '4. 대상 :   학년   반', '5. 소요 예산 :            원', '6. 운영 시간 :    시간', '7. 예산 : 금          원정', '8. 달성률 : (   )%', '9. 장소 : ＿＿＿＿'];
  assert.deepEqual(R.formHeads(FORM.join('\n')).heads.map(h => h.title), ['목적', '일시', '인원', '대상', '소요 예산', '운영 시간', '예산', '달성률', '장소']);
  // 바꾼 계획서 글·한글 파일 제목 줄(docs.form)에도 빈칸 자리가 남지 않음
  const plan = '1. 목적: 협동심을 기른다.\n2. 세부 운영\n가. 개회식\n3. 소요 예산\n가. 학교운영비 500,000원';
  const e = { docs: { plan, form: [] } };
  const { pre, olds } = R.eventOlds(e);
  const H0 = R.formHeads('1. 목적: ________\n2. 세부 운영 계획\n3. 소요 예산 :            원\n4. 인원 : (   )명'), hs = R.withPlanRoles(H0.heads);
  const out = R.applyEvent(e, R.mergeReform(hs, olds, R.ruleMap(olds, hs), null), { ...H0, heads: hs }, pre, olds);
  assert.deepEqual(out.form, ['1. 목적', '2. 세부 운영 계획', '3. 소요 예산', '4. 인원']);
  assert.ok(out.plan.startsWith('1. 목적\n협동심을 기른다.\n2. 세부 운영 계획\n가. 개회식\n3. 소요 예산\n가. 학교운영비 500,000원\n4. 인원'), out.plan);
  // 연간계획 새 서식도
  assert.deepEqual(R.yearHeads('Ⅰ. 목적 : ________\nⅡ. 세부 추진 계획\nⅢ. 추진 일정\nⅣ. 소요 예산 :            원').heads.map(h => [h.title, h.key]),
    [['목적', 'purpose'], ['세부 추진 계획', 'details'], ['추진 일정', 'schedule'], ['소요 예산', 'budget']]);
  // 채워 쓴 제목은 그대로(숫자가 있는 값, 단위 낱말로 시작하지만 다른 말이 붙은 값)
  const keep = ['예산: 500,000원', '인원: 25명', '대상: 6학년 2반', '대상: 전 학년', '시간: 매일', '운영: 주 1회', '예산: 금 500,000원', '목적: 금연 교육', '시간: 2시간'];
  assert.deepEqual(R.formHeads(keep.map((t, i) => `${i + 1}. ${t}`).join('\n')).heads.map(h => h.title), keep);
});

test('[C21 검토] [되돌리기]와 고른 학교 양식: 같은 서식 파일(같은 양식 id)로 바꾼 같은 종류 다른 계획이 있으면 그 양식은 그대로', () => {
  // 행사 A: 기본 문서('') → 서식 X, 행사 B: 같은 파일이라 같은 양식 X(바꾸기 전 X) → A 되돌림: B가 쓰는 X 그대로
  const A = { form: '', picked: 'X', seq: 1 }, B = { form: 'X', picked: 'X', seq: 2 };
  assert.equal(R.undoPick(A, [B], 'X'), null, 'B를 위해 고른 양식이 기본 문서로 바뀜');
  // 그 뒤 B까지 되돌리면 둘 다 하기 전 양식으로
  assert.equal(R.undoPick(B, [], 'X'), '');
  // 차례를 바꿔 B 먼저 되돌려도 A가 쓰는 X 그대로, 그다음 A를 되돌리면 그 전으로
  const A2 = { form: '', picked: 'X', seq: 1 }, B2 = { form: 'X', picked: 'X', seq: 2 };
  assert.equal(R.undoPick(B2, [A2], 'X'), null);
  assert.equal(R.undoPick(A2, [], 'X'), '');
  // 다른 파일: A '' → X, B X → Y — A를 되돌려도 Y 그대로, 그다음 B를 되돌리면 둘 다 하기 전('')으로(되돌린 A의 X가 아님)
  const A3 = { form: '', picked: 'X', seq: 1 }, B3 = { form: 'X', picked: 'Y', seq: 2 };
  assert.equal(R.undoPick(A3, [B3], 'Y'), null);
  assert.equal(R.undoPick(B3, [], 'Y'), '');
  // 혼자: 이 바꾸기가 고른 양식이 골라져 있으면 그 전 양식으로, 선생님이 그 뒤 다른 양식을 골랐거나 서식을 저장하지 못했으면 그대로
  assert.equal(R.undoPick({ form: 'L', picked: 'X', seq: 1 }, [], 'X'), 'L');
  assert.equal(R.undoPick({ form: 'L', picked: 'X', seq: 1 }, [], 'T'), null);
  assert.equal(R.undoPick({ form: 'L', picked: '', seq: 1 }, [], 'L'), null);
  // 선생님이 사이에 고른 양식(T) 위에서 바꾼 B는 A의 전 양식을 이어받지 않음
  const A4 = { form: '', picked: 'X', seq: 1 }, B4 = { form: 'T', picked: 'X', seq: 2 };
  assert.equal(R.undoPick(A4, [B4], 'X'), null);
  assert.equal(R.undoPick(B4, [], 'X'), 'T');
});

// ---------- 두 번째 검토 뒤 고침 ----------
test('[R2-1 검토] 연간계획: 목차 제목은 제목 낱말 뒤 한 낱말(「목표 달성도」「근거 법령」)도 자르지 않고 제목 전체로 맞춤 — 「목표 달성도」 글이 「추진 목표」로 가 목적 글을 밀어내지 않음', () => {
  const LAST = 'Ⅰ. 추진 목적\nⅡ. 운영 방침\nⅢ. 세부 추진 계획\nⅣ. 추진 일정\nⅤ. 소요 예산\nⅥ. 목표 달성도';
  const NEW = 'Ⅰ. 추진 배경\nⅡ. 추진 목표\nⅢ. 세부 추진 계획\nⅣ. 월별 추진 일정\nⅤ. 소요 예산\nⅥ. 평가';
  const o = Y.yearOutline(LAST);
  assert.deepEqual(o.items.map(x => x.key), ['purpose', 'policy', 'details', 'schedule', 'budget', 'x1']);
  const d = Y.normDraft({ purpose: '독서 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서', x1: '독서량 설문으로 달성도를 본다.',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }], outline: o.items, roman: o.roman });
  const olds = R.yearOlds(d);
  // 미리 보기 창의 옛 칸 이름도 제목 전체(「목표」로 줄여 보이지 않음)
  assert.deepEqual([olds[5].title, olds[5].lead, olds[5].cut], ['목표 달성도', '', false]);
  const H = R.yearHeads(NEW);
  const rules = R.ruleMap(olds, H.heads, { accepts: R.yearAccepts });
  assert.deepEqual(rules[1], ['o1'], '「추진 목표」에는 「추진 목적」: ' + JSON.stringify(rules));
  // AI 없이 바꿔도 「추진 목표」 칸은 목적 글로 시작(갈 곳 없는 「운영 방침」은 가까운 칸에 붙음), 「목표 달성도」 글은 그 칸으로 가지 않고 한 번만
  const nd = reformYear(d, NEW);
  const all = Y.planText({ year: 2027, name: '독서', draft: nd });
  const sec = /Ⅱ\. 추진 목표\n([\s\S]*?)\nⅢ\./.exec(all);
  assert.ok(sec && sec[1].split('\n')[0] === '독서 습관을 기른다.' && !sec[1].includes('달성도'), all);
  assert.equal(count(all, '독서 습관을 기른다.'), 1, all);
  assert.equal(count(all, '독서량 설문으로 달성도를 본다.'), 1, all);
  // 제목 낱말 뒤 한 낱말로 끝나는 목차 제목은 모두 제목 그대로(행사·학급운영계획은 [C19]처럼 제목 낱말로)
  for (const t of ['근거 법령', '담당 교사', '예산 집행', '평가 관점', '목표 달성도', '대상 학년', '장소 배치도', '복장 규정', '방침 결정', '근거 자료', '대상 학생']) {
    const y = R.yearOlds(Y.normDraft({ purpose: '가', details: '나', outline: [{ key: 'purpose', title: '목적' }, { key: 'x1', title: t }, { key: 'details', title: '세부 추진 계획' }] }))[1];
    assert.deepEqual([y.title, y.lead, y.cut], [t, '', false], t);
  }
  // 쌍점 뒤 글은 전처럼 자름([C16])
  const c = R.yearOlds(Y.normDraft({ purpose: '가', outline: [{ key: 'purpose', title: '목표 달성도: 80% 이상' }, { key: 'x1', title: '둘' }, { key: 'x2', title: '셋' }] }))[0];
  assert.deepEqual([c.title, c.lead, c.cut], ['목표 달성도', '80% 이상', true]);
});

test('[R2-2 검토] 계획을 지우면 그 계획의 [되돌리기]도 지움(dropPick): 같은 서식 파일로 바꾼 지운 계획이 다른 계획을 되돌릴 때 고른 양식을 붙잡지 않음', () => {
  // 행사 A: P0 → X, 행사 B: 같은 파일이라 X → X. B를 지움 → A를 되돌리면 바꾸기 전 양식 P0
  const A = { form: 'P0', picked: 'X', seq: 1 }, B = { form: 'X', picked: 'X', seq: 2 };
  R.dropPick(B, [A]);
  assert.deepEqual(A, { form: 'P0', picked: 'X', seq: 1 }, '앞 바꾸기는 그대로');
  assert.equal(R.undoPick(A, [], 'X'), 'P0');
  // A를 지우면 A 양식 위에서 바꾼 B가 A 전 양식을 이어받음 → B를 되돌리면 P0
  const A2 = { form: 'P0', picked: 'X', seq: 1 }, B2 = { form: 'X', picked: 'X', seq: 2 };
  R.dropPick(A2, [B2]);
  assert.equal(B2.form, 'P0');
  assert.equal(R.undoPick(B2, [], 'X'), 'P0');
  // 다른 파일: A P0 → X, B X → Y. A를 지우고 B를 되돌리면 P0(지운 A가 고른 X가 아님)
  const A3 = { form: 'P0', picked: 'X', seq: 1 }, B3 = { form: 'X', picked: 'Y', seq: 2 };
  R.dropPick(A3, [B3]);
  assert.equal(R.undoPick(B3, [], 'Y'), 'P0');
  // 남은 다른 계획이 같은 양식을 쓰면 전처럼 그대로([C21 검토]): A·B·C 같은 파일, C를 지우고 A를 되돌림 → B가 쓰는 X 그대로
  const A4 = { form: 'P0', picked: 'X', seq: 1 }, B4 = { form: 'X', picked: 'X', seq: 2 }, C4 = { form: 'X', picked: 'X', seq: 3 };
  R.dropPick(C4, [A4, B4]);
  assert.equal(R.undoPick(A4, [B4], 'X'), null);
  assert.equal(R.undoPick(B4, [], 'X'), 'P0');
  // 서식을 저장하지 못한 바꾸기(picked '')를 지워도 다른 되돌리기는 그대로
  const A5 = { form: '', picked: '', seq: 1 }, B5 = { form: '', picked: 'X', seq: 2 };
  R.dropPick(A5, [B5]);
  assert.deepEqual(B5, { form: '', picked: 'X', seq: 2 });
  R.dropPick(null, [B5]);
});
