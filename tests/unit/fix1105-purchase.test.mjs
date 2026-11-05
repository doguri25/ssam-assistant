// 2026-11-05 2차 버그 찾기에서 고친 것(품의 규칙): 「1. 관련:」 줄을 지우거나 바꾸거나 여러 줄로 써도 사유가 겹치지 않음,
// 사업명의 숫자 4자리를 학년도로 잘못 읽지 않음, 이름 끝 「을」을 조사로 지우지 않음, 「우리가 원하는 …」 같은 이름을 자르지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyForm, composeReason, introOf, withIntro, relatedOf, withRelated, ownHead, relatedLine, plainItemName, plainOfficial } from '../../web/menus/purchase/rules.js';
import { parseLines, normIntake } from '../../web/menus/purchase/intake.js';
import { normOneshot } from '../../web/menus/purchase/oneshot.js';

const INTRO = '독서 교육을 위하여 도서를 다음과 같이 구입하고자 합니다.';
const book = qty => ({ ...emptyForm('goods'), purpose: '독서 교육', items: [{ name: '동화책', spec: '', unit: '권', qty: String(qty), price: '12000', vendor: '' }] });
const r0 = composeReason({ intro: INTRO, form: book(10), year: 2026 });
const withHead = head => r0.replace(/^1\. 관련: [^\n]*/, head);
const count = (s, part) => s.split(part).length - 1;

test('[purchase2-1] 「1. 관련:」 줄을 지우거나 「1. 근거:」·쌍점 없는 「1. 관련」으로 바꿔도 첫 문장은 「2.」 줄만', () => {
  const del = r0.split('\n').slice(1).join('\n');
  for (const r of [del, withHead('1. 근거: ○○교육청 과학과-1234(2026. 11. 2.)'), withHead('1. 관련\n  가. ○○교육청 과학과-1234(2026. 11. 2.)')]) {
    assert.equal(introOf(r), INTRO, r);
    // 다시 맞추기(머리는 그대로): 가~다 줄이 한 번만, 새 금액만
    const out = composeReason({ intro: introOf(r), form: book(12), year: 2026, head: ownHead(r) });
    assert.equal(count(out, '가. 목적'), 1, out);
    assert.equal((out.match(/^2\. /gm) || []).length, 1, out);
    assert.ok(out.includes('금144,000원') && !out.includes('120,000'), out);
    assert.ok(out.startsWith(r.slice(0, r.indexOf('2. '))), '머리: ' + out.split('\n')[0]);
    // 첫 문장만 바꾸기([검토 안 쓰기])도 「2.」 줄만 바뀜
    const w = withIntro(r, '도서를 다음과 같이 구입하고자 합니다.');
    assert.equal(w, r.replace(`2. ${INTRO}`, '2. 도서를 다음과 같이 구입하고자 합니다.'));
  }
  assert.equal(ownHead(del), '');
  assert.ok(composeReason({ intro: INTRO, form: book(12), year: 2026, head: '' }).startsWith(`2. ${INTRO}\n  가. 목적`));
  // 「2.」 번호를 지운 사유: 붙임의 「2. 견적서 1부」를 첫 문장으로 읽지 않고, 맨 앞 관련 줄도 첫 문장에 넣지 않음
  const no2 = r0.replace(`\n2. ${INTRO}`, `\n${INTRO}`);
  assert.equal(introOf(no2), INTRO);
  assert.equal(count(composeReason({ intro: introOf(no2), form: book(12), year: 2026 }), '1. 관련'), 1);
  // 늘 쓰던 꼴은 그대로
  assert.equal(introOf(r0), INTRO);
  assert.equal(ownHead(r0), null);
  assert.equal(composeReason({ intro: INTRO, form: book(10), year: 2026, head: null }), r0);
});

test('[purchase2-2] 관련 글을 비우거나 여러 줄(가. 나.)로 쓰면 다음 줄을 관련으로 읽지 않고, 다시 맞추면 나. 줄까지 그대로', () => {
  assert.equal(relatedOf(withHead('1. 관련: ')), '');
  assert.equal(relatedOf(withHead('1. 관련:')), '');
  assert.equal(relatedOf(r0), '2026학년도 학교 교육과정 운영 계획');
  for (const head of ['1. 관련: 가. ○○교육청 과학과-1234(2026. 11. 2.)\n          나. 2026학년도 과학과 교육과정 운영 계획',
    '1. 관련:\n  가. ○○교육청 과학과-1234(2026. 11. 2.)\n  나. 2026학년도 과학과 교육과정 운영 계획']) {
    const r = withHead(head);
    assert.equal(relatedOf(r), null, head);
    assert.equal(ownHead(r), head);
    // 관련 칸이 바뀌어도 여러 줄 관련은 첫 줄만 바꾸지 않음(withRelated 뒤 relatedOf가 맞지 않음)
    assert.notEqual(relatedOf(withRelated(r, 'x')), 'x');
    const out = composeReason({ intro: introOf(r), form: book(12), year: 2026, head: ownHead(r) });
    assert.ok(out.startsWith(`${head}\n2. ${INTRO}\n`), out);
    assert.equal(count(out, '가. 목적'), 1);
  }
  // 「1. 관련: …」 한 줄(가.를 같은 줄에 한 개만)은 관련으로 읽음
  assert.equal(relatedOf(withHead('1. 관련: 가. ○○교육청 과학과-1234(2026. 11. 2.)')), '가. ○○교육청 과학과-1234(2026. 11. 2.)');
  // 예전 꼴(관련 줄 없음)
  assert.equal(relatedOf('실험 재료를 구입하고자 합니다.\n\n가. 목적: 실험'), null);
});

test('[purchase2-3] 사업명 앞 숫자는 「학년도·년」이 붙을 때만 연도로 보고, 그 연도를 지금 학년도보다 먼저 씀', () => {
  const rel = (type, project) => relatedLine({ ...emptyForm(type), project }, 2026);
  assert.equal(rel('event', '2050 탄소중립 실천 캠페인'), '2026학년도 2050 탄소중립 실천 캠페인 운영 계획');
  assert.equal(rel('meeting', '2030 미래교육 협의회'), '2026학년도 2030 미래교육 협의회 운영 계획');
  assert.equal(rel('event', '2027학년도 입학식'), '2027학년도 입학식 운영 계획');
  assert.equal(rel('event', '2027년 신입생 예비소집'), '2027학년도 신입생 예비소집 운영 계획');
  assert.equal(rel('event', '2027년도 신입생 예비소집'), '2027학년도 신입생 예비소집 운영 계획');
  assert.equal(rel('event', '2026학년도 가을 학교 축제 운영'), '2026학년도 가을 학교 축제 운영 계획');
  assert.equal(rel('goods', '2027학년도 입학 준비물 구입'), '2027학년도 학교 교육과정 운영 계획');
});

test('[purchase2-5] 품명 끝 「마을·노을·가을」의 「을」은 조사로 보지 않음(「책을」「사과를」은 뺌)', () => {
  for (const [s, want] of [['보드게임 사과마을 구입', '보드게임 사과마을'], ['그림책 노을 주문', '그림책 노을'], ['동물 마을 좀', '동물 마을'], ['보드게임 가을 사주세요', '보드게임 가을'],
    ['책을 사주세요', '책'], ['사과를 구입', '사과'], ['마을을 주문', '마을'], ['A4 용지를 좀 사주세요', 'A4 용지'], ['LED를 구입', 'LED'], ['색연필 좀', '색연필']])
    assert.equal(plainItemName(s), want, s);
  assert.deepEqual(parseLines('보드게임 사과마을 구입 2개 30000원\n그림책 노을 3권 12000원 주문').items.map(it => it.name), ['보드게임 사과마을', '그림책 노을']);
  assert.equal(normIntake({ items: [{ name: '그림책 노을 주문', qty: 3, price: 12000 }] }).items[0].name, '그림책 노을');
});

test('[purchase2-7] 「우리가 원하는 학교 만들기」「내가 쓰는 시 공모전」 같은 이름은 그대로, 사는 말과 함께인 1인칭만 뺌', () => {
  for (const s of ['우리가 원하는 학교 만들기', '내가 쓰는 시 공모전', '우리가 쓰는 우리말 바로 알기', '우리가 원하는 학교 만들기 행사 물품 구입', '우리는 살 수 있다'])
    assert.equal(plainOfficial(s), s);
  assert.equal(plainOfficial('내가 필요한 도서 구입'), '도서 구입');
  assert.equal(plainOfficial('우리가 구입할 실험 재료'), '실험 재료');
  assert.equal(plainOfficial('제가 쓸 비커 구입'), '비커 구입');
  const n = normOneshot({ title: '우리가 원하는 학교 만들기 행사 물품 구입', intro: '우리가 원하는 학교 만들기 프로젝트를 위하여 물품을 다음과 같이 구입하고자 합니다.', fields: { project: '우리가 원하는 학교 만들기' } }, emptyForm('event'));
  assert.equal(n.title, '우리가 원하는 학교 만들기 행사 물품 구입');
  assert.ok(n.intro.startsWith('우리가 원하는 학교 만들기 프로젝트'), n.intro);
  assert.equal(n.fields.project, '우리가 원하는 학교 만들기');
  assert.equal(normIntake({ items: [], fields: { project: '내가 쓰는 시 공모전' } }).fields.project, '내가 쓰는 시 공모전');
});
