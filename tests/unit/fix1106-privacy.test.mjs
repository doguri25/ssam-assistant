// 2026-11-06 혁신 기능 묶음 검토 고침 — 개인정보(순수 함수): 줄 안의 전화번호·전자 우편만 가리기(core/privacy.js maskContacts),
// 번역으로 보내는 교직원·학생 이름(I4: maskStaff·maskJosaNames, letter-translate guard), 인수인계서의 강사 이름·두 글자 이름(M4)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { maskContacts, maskStaff, maskJosaNames, stripNames } from '../../web/core/privacy.js';
import { guard, planTr } from '../../web/menus/etc/letter-translate.js';
import { cleanText, collectHandover, lecturerNames } from '../../web/menus/etc/handover-model.js';
import { pushRecent } from '../../web/menus/purchase/library.js';

function mem() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('전화번호·전자 우편은 그 자리만 ○○○(줄을 통째로 빼지 않음), 금액·괄호 짝은 그대로', () => {
  const one = maskContacts('11월 20일 현장체험학습 안내, 준비물 도시락, 문의 031-123-4567, ssam@school.kr');
  assert.equal(one, '11월 20일 현장체험학습 안내, 준비물 도시락, 문의 ○○○, ○○○');
  assert.equal(stripNames(one).text, one, '가린 뒤에는 줄이 남음');
  assert.equal(maskContacts('알코올램프 10개 5,000원 1,200,000원'), '알코올램프 10개 5,000원 1,200,000원', '금액은 그대로');
  assert.equal(maskContacts('(02) 123-4567 · 010 1234 5678'), '○○○ · ○○○');
  assert.equal(maskContacts('담당: 교무부장 (031-123-4567)'), '담당: 교무부장 (○○○)', '괄호 짝은 그대로');
});

test('I4 번역으로 보내는 글: 직함 앞뒤 교직원 이름·조사가 붙은 이름은 ○○○로 보내고 번역에는 되돌림', () => {
  for (const [s, name] of [['문의: 교무부장 박영희 선생님', '박영희'], ['강사: 최하은 (숲해설가)', '최하은'], ['3학년 부장 김솔', '김솔'], ['김민수의 보호자님께', '김민수'],
    ['담당 이나래에게 내 주세요', '이나래'], ['김솔 선생님께 제출', '김솔']]) {
    const g = guard(s);
    assert.ok(g && !g.text.includes(name) && g.text.includes('○○○'), `${s} → ${g && g.text}`);
    assert.equal(g.back(g.text), s, '되돌림');
  }
  const g = guard('문의: 교무부장 박영희 선생님 031-123-4567');
  assert.equal(g.back('Contact: head teacher ○○○ {{1}}'), 'Contact: head teacher 박영희 031-123-4567');
  // 흔한 낱말은 그대로 보냄
  for (const s of ['준비물: 도시락을 챙겨 주세요', '담임 선생님께 제출해 주세요', '전담 선생님과 상담해요', '신청서를 내 주세요', '설문지를 작성해 주세요', '안내문을 읽어 주세요', '박물관을 견학해요', '우리 선생님들이 지도해요'])
    assert.equal(guard(s).text, s, s);
  // 계획·되돌린 번역: 원문 이름이 번역에 돌아옴
  const out = { title: '숲 체험 안내', body: ['강사: 최하은 (숲해설가)', '김민수의 보호자님께'] };
  const plan = planTr(out);
  const sent = plan.jobs.map(j => j.text).join('\n');
  assert.ok(!/최하은|김민수/.test(sent), sent);
  const r = plan.finish(Object.fromEntries(plan.jobs.map(j => [j.id, `EN: ${j.text}`])));
  assert.equal(r.units['강사: 최하은 (숲해설가)'], 'EN: 강사: 최하은 (숲해설가)');
  assert.equal(r.units['김민수의 보호자님께'], 'EN: 김민수의 보호자님께');
});

test('I4 공통 도움(privacy.js): 직함 앞뒤 이름, 조사가 붙은 이름 — 바꾸기만(되돌릴 수 있게)', () => {
  assert.deepEqual(maskStaff('김가람 선생님과 이나래 부장님께, 강사 김솔'), { text: '○○○ 선생님과 ○○○ 부장님께, 강사 ○○○', masked: 3 });
  assert.equal(maskStaff('원어민 교사·전담 교사·연구 부장·우리 선생님·강사 선정·문의 전화').masked, 0);
  assert.equal(maskStaff('선배님과 원장님').masked, 0, '두 글자 + 「님」은 이름으로 보지 않음');
  assert.deepEqual(maskJosaNames('김민수의 보호자님께, 이서연이 상을 받았어요'), { text: '○○○의 보호자님께, ○○○이 상을 받았어요', masked: 2 });
  assert.equal(maskJosaNames('도시락을 챙기고 신청서를 내요. 서술형은 이메일로').masked, 0);
});

test('M4 인수인계서: 강사 수당 품의 품목의 강사 이름도 가리고, 직함 앞뒤 두 글자 이름도', () => {
  assert.equal(cleanText('김솔 선생님께 전달'), '○○○ 선생님께 전달');
  assert.equal(cleanText('3학년 부장 김솔'), '3학년 부장 ○○○');
  assert.equal(cleanText('전담 교사 협의'), '전담 교사 협의');
  assert.deepEqual(lecturerNames('강사수당(김가람)'), ['김가람']);
  assert.deepEqual(lecturerNames('김솔'), ['김솔']);
  assert.deepEqual(lecturerNames('강사 수당(외부 강사)'), []);
  assert.deepEqual(lecturerNames('강사료 · 원고료'), []);
  store.useStorage(mem());
  store.set('years', { current: 2026 });
  pushRecent({ id: 'pl1', at: new Date(2026, 4, 3).getTime(), form: { type: 'lecturer', project: '진로 특강', items: [{ name: '강사수당(김가람)', qty: 2, price: 100000 }, { name: '김솔', qty: 1, price: 50000 }] }, draft: { title: '김가람 강사수당 지급' } });
  pushRecent({ id: 'pl2', at: new Date(2026, 4, 4).getTime(), form: { type: 'goods', project: '김솔 선생님께 받은 목록 구입', items: [{ name: '비커', qty: 1, price: 1000 }] }, draft: null });
  const d = collectHandover({ year: 2026 });
  assert.ok(d.names.includes('김가람') && d.names.includes('김솔'), JSON.stringify(d.names));
  assert.deepEqual(d.purchases.map(p => p.title), ['○○○ 강사수당 지급', '○○○ 선생님께 받은 목록 구입']);
});
