// 단원평가 확인 창: 그 문항 전체 보기 (스펙 2026-11-13-crop-log-flow §1) — 문항 자리 찾기 프롬프트, AI 답 정리, 여유를 더한 자르기 상자
import test from 'node:test';
import assert from 'node:assert/strict';
import { locatePrompt, validLocate, normBoxes, cropRect, boxesOf, nextRef } from '../../web/menus/evaluate/unit/unit-locate.js';

const ITEMS = [
  { no: 1, content: '글의 내용 파악하기', domain: '이해', type: 'choice', answer: '③', points: 4, criteria: '', pages: '<국어> 36쪽' },
  { no: 2, content: '생각\n쓰기', domain: '이해', type: 'essay', answer: '(예) 친구와 이야기함. 등', points: 8, criteria: '비슷하면 정답 처리', pages: '<국어> 44쪽' },
  { no: 3, content: '', domain: '지식', type: 'match', answer: '(1)-②', points: 4, criteria: '', pages: '' }
];

test('프롬프트: 표지·문항 목록(번호·평가 내용·유형)·쪽 수·0~1000 상자·출력 모양', () => {
  const p = locatePrompt(ITEMS, 2);
  assert.ok(p.startsWith('[단원평가 문항 자리]'), p.slice(0, 40));
  assert.ok(p.includes('- 1 | 글의 내용 파악하기 | 고르기'), p);
  assert.ok(p.includes('- 2 | 생각 쓰기 | 서술형'), '줄바꿈은 한 칸으로');
  assert.ok(p.includes('- 3 | 3번 문항 | 선 잇기'), '평가 내용이 없으면 「3번 문항」');
  assert.ok(p.includes('그림 2장') && p.includes('0부터'), '쪽 수·차례');
  assert.ok(p.includes('0') && p.includes('1000') && p.includes('"page"') && p.includes('"box"') && p.includes('"items"'), '상자 모양');
});

test('프롬프트: 학생 번호·이름·정답·채점 기준·교과서 쪽은 없음', () => {
  const p = locatePrompt(ITEMS, 1);
  for (const bad of ['[학생]', '번 학생', '김하늘', '(예) 친구와 이야기함', '비슷하면 정답 처리', '<국어>', '③', '(1)-②']) assert.ok(!p.includes(bad), bad);
  assert.ok(/이름/.test(p) && /적지 않/.test(p), '이름을 적지 말라는 말');
  // 쪽 수를 모르면 「그림」만
  assert.ok(locatePrompt(ITEMS).startsWith('[단원평가 문항 자리]'));
});

test('validLocate: items 배열이나 배열이면 읽은 것', () => {
  assert.ok(validLocate({ items: [] }) && validLocate([]));
  assert.ok(!validLocate({}) && !validLocate(null) && !validLocate({ items: 'x' }));
});

test('normBoxes: 맞는 답은 그대로, 배열 답도 읽음, 번호·쪽은 수로', () => {
  assert.deepEqual(normBoxes({ items: [{ no: 1, page: 0, box: [100, 200, 900, 400] }] }, ITEMS, 2), { 1: { page: 0, box: [100, 200, 900, 400] } });
  assert.deepEqual(normBoxes([{ no: '2', page: '1', box: ['50', 100, 950, 700.4] }], ITEMS, 2), { 2: { page: 1, box: [50, 100, 950, 700] } });
  assert.deepEqual(normBoxes(null, ITEMS, 2), {});
  assert.deepEqual(normBoxes({ items: 'x' }, ITEMS, 2), {});
});

test('normBoxes: 범위 밖은 0~1000으로, 뒤집힌 모서리는 바로잡음, 0~1 비율 답은 1000배', () => {
  const r = normBoxes({ items: [
    { no: 1, page: 0, box: [-50, 100, 1200, 300] },
    { no: 2, page: 0, box: [900, 400, 100, 200] },
    { no: 3, page: 1, box: [0.1, 0.2, 0.9, 0.45] }
  ] }, ITEMS, 2);
  assert.deepEqual(r[1].box, [0, 100, 1000, 300]);
  assert.deepEqual(r[2].box, [100, 200, 900, 400]);
  assert.deepEqual(r[3], { page: 1, box: [100, 200, 900, 450] });
});

test('normBoxes: 없는 문항·없는 쪽·쪽 수가 아닌 것·모양이 틀린 상자·너무 작거나 쪽 전체인 상자는 뺌, 같은 문항은 처음 것', () => {
  const r = normBoxes({ items: [
    { no: 99, page: 0, box: [100, 100, 900, 300] }, // 없는 문항
    { no: 1, page: 2, box: [100, 100, 900, 300] }, // 쪽은 0·1뿐
    { no: 1, page: -1, box: [100, 100, 900, 300] },
    { no: 1, page: 0.5, box: [100, 100, 900, 300] },
    { no: 1, page: 0, box: [100, 100, 900] }, // 수 3개
    { no: 1, page: 0, box: 'a,b,c,d' },
    { no: 1, page: 0, box: [100, 100, 108, 300] }, // 가로 8
    { no: 1, page: 0, box: [100, 100, 900, 105] }, // 세로 5
    { no: 1, page: 0, box: [0, 0, 1000, 1000] }, // 쪽 전체
    { no: 2, page: 1, box: [100, 500, 900, 800] },
    { no: 2, page: 0, box: [100, 100, 900, 300] }, // 같은 문항 두 번째
    null, 'x'
  ] }, ITEMS, 2);
  assert.deepEqual(r, { 2: { page: 1, box: [100, 500, 900, 800] } });
  // 쪽 수를 모르면(0) 아무것도 쓰지 않음
  assert.deepEqual(normBoxes({ items: [{ no: 1, page: 0, box: [100, 100, 900, 300] }] }, ITEMS, 0), {});
});

test('cropRect: 사방 여유 3%(쪽 가로·세로 기준)를 더한 픽셀 상자', () => {
  assert.deepEqual(cropRect([100, 200, 900, 400], 1000, 1500), { x: 70, y: 255, w: 860, h: 390 });
  assert.deepEqual(cropRect([100, 200, 900, 400], 1000, 1500, 0), { x: 100, y: 300, w: 800, h: 300 });
});

test('cropRect: 여유가 그림 밖으로 나가면 그림 안으로 자름, 정수', () => {
  assert.deepEqual(cropRect([0, 0, 500, 100], 1000, 1000), { x: 0, y: 0, w: 530, h: 130 });
  assert.deepEqual(cropRect([950, 960, 1000, 1000], 1000, 1000), { x: 920, y: 930, w: 80, h: 70 });
  const r = cropRect([333, 111, 777, 555], 1273, 1800);
  assert.ok([r.x, r.y, r.w, r.h].every(Number.isInteger), JSON.stringify(r));
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1273 && r.y + r.h <= 1800, JSON.stringify(r));
});

test('cropRect: 상자·그림 크기가 틀리면 null', () => {
  assert.equal(cropRect(null, 1000, 1000), null);
  assert.equal(cropRect([1, 2, 3], 1000, 1000), null);
  assert.equal(cropRect([100, 100, 900, 300], 0, 1000), null);
  assert.equal(cropRect([100, 100, 900, 300], 1000, NaN), null);
});

test('boxesOf: 저장한 자리(같은 쪽 모양일 때만), 예전 평가(자리 없음)·망가진 값은 null', () => {
  const key = { items: ITEMS, boxes: { at: 1, lay: '2:10', items: { 1: { page: 0, box: [100, 200, 900, 400] } } } };
  assert.deepEqual(boxesOf(key, '2:10'), key.boxes.items);
  assert.equal(boxesOf(key, '1:00'), null, '쪽 모양이 바뀜');
  assert.deepEqual(boxesOf({ items: ITEMS, boxes: { at: 1, items: {} } }, '2:10'), {}, '쪽 모양을 적지 않은 자리');
  assert.equal(boxesOf({ items: ITEMS }, '2:10'), null);
  assert.equal(boxesOf({ items: ITEMS, boxes: { at: 1, items: 'x' } }, '2:10'), null);
  assert.equal(boxesOf(null, '2:10'), null);
});

test('상자는 이름 붙은 칸 {x0,y0,x1,y1}로 받음(Gemini가 [y,x,…] 차례로 답해 세로 띠가 되던 것, 검토 #4)', () => {
  const p = locatePrompt([{ no: 1, content: '덧셈', type: 'short' }], 1);
  assert.ok(p.includes('"x0"') && p.includes('"y1"'), p.slice(-200));
  const items = [{ no: 1 }, { no: 2 }];
  assert.deepEqual(normBoxes({ items: [{ no: 1, page: 0, box: { x0: 40, y0: 120, x1: 960, y1: 330 } }, { no: 2, page: 0, x0: 40, y0: 340, x1: 960, y1: 600 }] }, items, 1),
    { 1: { page: 0, box: [40, 120, 960, 330] }, 2: { page: 0, box: [40, 340, 960, 600] } });
  assert.deepEqual(normBoxes({ items: [{ no: 1, page: 0, box: [40, 120, 960, 330] }] }, items, 1)[1].box, [40, 120, 960, 330], '예전 배열 답도');
});

test('기준 학생: 처음엔 쪽이 가장 많은 첫 학생, [다시 찾기]면 다음 학생으로 돌아감(검토 #5)', () => {
  const c = [{ i: 0, n: 2 }, { i: 1, n: 3 }, { i: 2, n: 3 }, { i: 3, n: 3 }];
  assert.equal(nextRef(c), 1);
  assert.equal(nextRef(c, 1), 2);
  assert.equal(nextRef(c, 3), 1, '끝이면 처음으로');
  assert.equal(nextRef(c, 9), 1, '모르는 학생이면 처음 학생');
  assert.equal(nextRef([]), -1);
});
