/* 2026-11-17 품의: 품목이 있는 품의에 다른 파일을 넣고 [바꾸기]를 누르면 예전 칸(사업명·목적·일시…)이 남던 것 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceForm } from '../../web/menus/purchase/intake.js';
import { emptyForm } from '../../web/menus/purchase/rules.js';

const old = () => ({ ...emptyForm('event'), typeSet: true, related: '2026학년도 운동회 운영 계획', project: '2026 가을 운동회', purpose: '학생 체력 증진', date: '2026-10-07',
  target: '전교생', place: '운동장', budget: '체육 행사비', budgetUnknown: false, total: '500000', memo: '작년보다 줄임', guessed: ['purpose'], typeGuessed: false,
  vat: false, income: 'other', attach: ['plan'], attachMore: ['사진'], items: [{ name: '줄다리기 줄', qty: '2', price: '30000' }] });

test('[fix1117-replace] 바꾸기: 예전 칸은 지우고 새로 읽은 칸만, 종류·부가세·붙임 같은 설정은 그대로', () => {
  const f = replaceForm(old(), { project: '2026 학교폭력 예방 캠페인', purpose: '학교폭력 예방 의식 높이기', place: '강당' });
  assert.equal(f.project, '2026 학교폭력 예방 캠페인');
  assert.equal(f.purpose, '학교폭력 예방 의식 높이기');
  assert.equal(f.place, '강당');
  for (const k of ['related', 'date', 'target', 'budget', 'total', 'memo']) assert.equal(f[k], '', k);
  assert.deepEqual(f.guessed, []);
  assert.equal(f.type, 'event');
  assert.equal(f.typeSet, true);
  assert.equal(f.vat, false);
  assert.deepEqual(f.attach, ['plan']);
  assert.deepEqual(f.attachMore, ['사진']);
});

test('[fix1117-replace-empty] 바꾸기: 새로 읽은 칸이 없으면 칸은 비움, 원래 품의는 바꾸지 않음', () => {
  const o = old(), f = replaceForm(o, {});
  for (const k of ['related', 'project', 'purpose', 'date', 'target', 'place', 'budget', 'total', 'memo']) assert.equal(f[k], '', k);
  assert.equal(o.project, '2026 가을 운동회', '넘긴 품의는 그대로');
});

/* 2026-11-17 품의: 계획서를 넣으면 첫 문장이 계획서 제목을 따라감 — 제목은 「관련」, 계획서 「목적」은 목적 칸으로, 초안 AI는 제목을 첫 문장에 옮기지 않음 */
import { planHead, readIntake, intakePrompt } from '../../web/menus/purchase/intake.js';
import { oneshotPrompt } from '../../web/menus/purchase/oneshot.js';

const PLAN = `2026 학교폭력 예방 캠페인 운영 계획
1. 목적
가. 학생들의 학교폭력 예방 의식을 높인다.
나. 서로 존중하는 학교 문화를 만든다.
2. 일시: 2026. 11. 25.(수) 3~4교시
3. 장소: 본교 강당
4. 소요 예산
현수막 1개 50000원
캠페인 띠 30개 2000원`;

test('[fix1117-plan-head] 계획서 글 → 관련(계획서 제목)·목적(「목적」 아래 첫 줄)', () => {
  assert.deepEqual(planHead(PLAN), { related: '2026 학교폭력 예방 캠페인 운영 계획', purpose: '학생들의 학교폭력 예방 의식을 높인다' });
  // 「목적:」이 한 줄에, 제목 앞에 학교 이름·빈 줄, 「(안)」
  assert.deepEqual(planHead('\n새싹초등학교\n2026학년도 가을 운동회 운영 계획(안)\nⅠ. 목적: 학생 체력 증진과 협동심 기르기\nⅡ. 일시: 10. 7.'),
    { related: '2026학년도 가을 운동회 운영 계획(안)', purpose: '학생 체력 증진과 협동심 기르기' });
  // 「○ 목적」 다음 줄 「- …」
  assert.equal(planHead('2026 독서 캠프 계획\n○ 목적\n - 책 읽는 즐거움을 알게 함\n○ 일시: 12. 5.').purpose, '책 읽는 즐거움을 알게 함');
});

test('[fix1117-plan-head-not] 계획서가 아닌 글(장바구니 메모·견적서)은 아무것도 채우지 않음', () => {
  for (const t of ['A4 용지 5박스 2만원\n보드마커 10개 1200원', '견적서\n품명 | 수량 | 단가\n비커 | 8 | 4500', '수업 계획에 쓸 색종이 10묶음 3000원', '']) assert.deepEqual(planHead(t), {}, t);
  // 제목은 있지만 목적이 없으면 관련만
  assert.deepEqual(planHead('2026 과학 실험 운영 계획\n1. 일시: 11. 3.\n알코올램프 10개 5000원'), { related: '2026 과학 실험 운영 계획' });
});

test('[fix1117-plan-read] 계획서 글 파일·붙여 넣은 계획서 → 품목과 함께 관련·목적 칸', async () => {
  const r = await readIntake({ file: new File([PLAN], '캠페인 계획.txt', { type: 'text/plain' }), noAI: true });
  assert.deepEqual(r.items.map(i => i.name), ['현수막', '캠페인 띠']);
  assert.equal(r.fields.related, '2026 학교폭력 예방 캠페인 운영 계획');
  assert.equal(r.fields.purpose, '학생들의 학교폭력 예방 의식을 높인다');
  const t = await readIntake({ text: PLAN, noAI: true });
  assert.equal(t.fields.related, '2026 학교폭력 예방 캠페인 운영 계획');
});

test('[fix1117-plan-prompts] 넣기 AI는 계획서 제목을 관련에, 목적은 「목적」 내용으로 / 초안 AI는 계획서 제목을 첫 문장에 옮기지 않음', () => {
  const ip = intakePrompt('text', PLAN);
  assert.ok(ip.includes('related(관련)'), ip);
  assert.ok(/계획서·공문이면 그 문서 제목/.test(ip), ip);
  assert.ok(/purpose\(목적\)는 .*「목적」/.test(ip), ip);
  const op = oneshotPrompt({ ...emptyForm('event'), related: '2026 학교폭력 예방 캠페인 운영 계획', purpose: '학생들의 학교폭력 예방 의식을 높인다', items: [{ name: '현수막', qty: '1', price: '50000' }] });
  assert.ok(op.includes('계획서·공문 제목을 그대로 옮기지 않고'), op);
});
