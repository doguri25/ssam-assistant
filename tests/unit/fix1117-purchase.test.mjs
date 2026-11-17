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
