// 수준별 기준표 규칙(web/menus/evaluate/rubric-model.js, 스펙 2026-11-16): 열쇠·배점·AI 답 고치기·채점 글·기준 점수·문서. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { useStorage } from '../../web/core/store.js';
import * as R from '../../web/menus/evaluate/rubric-model.js';

function fake() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }, key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m
  };
}

const U = { id: 'u1', subject: '수학', unit: '곱셈', area: '수와 연산', elem: '곱셈 원리 설명하기', std: '[4수01-05] 곱셈의 원리를 이해한다.', focus: '풀이를 말과 글로 설명', period: '1학기', crit: { high: '두 방법으로 설명함', mid: '한 방법으로 설명함', low: '식만 씀' } };
const U4 = { ...U, crit: { ...U.crit, top: '새로운 상황에 적용함' } };
const L3 = ['high', 'mid', 'low'], L4 = ['top', 'high', 'mid', 'low'];

function sample() {
  const rb = R.blankRubric(U, { rows: 3, levels: L3 });
  const t = [['곱셈 원리 이해', '두 방법 모두 원리를 바르게 설명함', '한 방법으로 원리를 설명함', '식만 쓰고 설명이 없음'],
    ['풀이 과정', '과정을 차례대로 씀', '과정 일부를 씀', '답만 씀'], ['설명하기', '까닭을 들어 말함', '결과만 말함', '말하지 못함']];
  rb.rows.forEach((r, i) => { r.name = t[i][0]; L3.forEach((lv, j) => { r.cells[lv].text = t[i][j + 1]; }); });
  rb.task = '두 자리 수 곱셈을 두 가지 방법으로 풀고 까닭을 씀';
  return rb;
}

test('[rb-key] 열쇠: 띄어쓰기·문장부호만 다르면 같고, 과목이 다르거나 하나라도 비면 열쇠 없음', () => {
  assert.equal(R.rubricKey(' 수학 ', '곱셈 원리 설명하기'), R.rubricKey('수학', '곱셈원리 설명하기.'));
  assert.notEqual(R.rubricKey('과학', '곱셈 원리 설명하기'), R.rubricKey('수학', '곱셈 원리 설명하기'));
  assert.equal(R.rubricKey('', 'x'), '');
  assert.equal(R.rubricKey('수학', ''), '');
  assert.equal(R.unitKey({ subject: '수학', elem: '', unit: '곱셈' }), R.rubricKey('수학', '곱셈'));
  assert.equal(R.unitKey({ subject: '수학', elem: '', unit: '' }), '');
  assert.equal(R.unitKey(null), '');
});

test('[rb-levels] 최상 기준이 있으면 4단계, 없으면 3단계', () => {
  assert.deepEqual(R.levelsFor({ crit: { top: '…' } }), L4);
  assert.deepEqual(R.levelsFor({ crit: {} }), L3);
  assert.deepEqual(R.levelsFor({}), L3);
  assert.equal(R.LV_NAME.none, '안 함');
});

test('[rb-points] 기본 배점(나머지는 앞 요소부터)과 수준 점수', () => {
  const d = R.defaultPoints(3, L3);
  assert.deepEqual(d.map(x => x.points), [34, 33, 33]);
  assert.deepEqual(d[0].pts, { high: 34, mid: 24, low: 14 });
  assert.deepEqual(R.defaultPoints(4, L4)[0].pts, { top: 25, high: 20, mid: 15, low: 10 });
  assert.deepEqual(R.defaultPoints(5, L3).map(x => x.points), [20, 20, 20, 20, 20]);
  assert.deepEqual(R.defaultPoints(2, L3).map(x => x.points), [50, 50]);
});

test('[rb-blank] 빈 기준표: 요소 수 2~5, 칸 글 빔, 단원 정보를 적음', () => {
  const rb = R.blankRubric(U4, { levels: L4 });
  assert.equal(rb.v, 1); assert.equal(rb.rows.length, 3);
  assert.equal(rb.subject, '수학'); assert.equal(rb.elem, '곱셈 원리 설명하기'); assert.equal(rb.unit, '곱셈');
  assert.deepEqual(rb.levels, L4);
  assert.equal(rb.rows[0].cells.top.text, ''); assert.equal(rb.rows[0].cells.top.pts, 34);
  assert.equal(R.blankRubric(U, { rows: 9 }).rows.length, 5);
  assert.equal(R.blankRubric(U, { rows: 1 }).rows.length, 2);
  assert.deepEqual(R.blankRubric(U).levels, L3);
  assert.equal(new Set(rb.rows.map(r => r.id)).size, 3);
});

test('[rb-norm] AI 답 고치기: 요소 수·이름 40자·칸 글 다듬기·빠진 수준·점수 범위, 빈 답은 null', () => {
  const long = '가'.repeat(250);
  const rows = [
    { name: '나'.repeat(41), points: 34, cells: { high: { text: `줄\n바꿈 "따옴표" '작은' ${long}`, pts: 34 }, mid: { text: '중', pts: 40 }, low: { text: '하', pts: 50 } } },
    { name: '요소2', points: 33, cells: { high: { text: '상', pts: 10 }, mid: { text: '중', pts: 20 } } },
    { name: '요소3', points: 33, cells: { high: { text: '상', pts: 99 }, mid: { text: '중', pts: 20 }, low: { text: '하', pts: -5 } } },
    { name: '요소4', points: 10, cells: {} }, { name: '요소5', points: 10, cells: {} }
  ];
  const rb = R.normMade({ rows }, U, { rows: 3, levels: L3 });
  assert.equal(rb.rows.length, 3);
  assert.equal(rb.rows[0].name.length, 40);
  const t = rb.rows[0].cells.high.text;
  assert.ok(t.length <= 200 && !/[\n"']/.test(t), t);
  assert.equal(rb.rows[1].cells.low.text, '');
  assert.deepEqual(rb.rows[1].cells.low, { text: '', pts: R.defaultPoints(3, L3)[1].pts.low });
  for (const r of rb.rows) {
    assert.ok(r.points >= 0 && r.points <= 100);
    let prev = Infinity;
    for (const lv of L3) { const p = r.cells[lv].pts; assert.ok(p >= 0 && p <= r.points && p <= prev, `${r.name} ${lv} ${p}`); prev = p; }
  }
  assert.equal(rb.rows[0].cells.mid.pts, 34); // 배점 34로 잘림
  assert.equal(rb.rows[2].cells.high.pts, 33); assert.equal(rb.rows[2].cells.low.pts, 0);
  assert.equal(R.normMade({ rows: [] }, U, { rows: 3, levels: L3 }), null);
  assert.equal(R.normMade(null, U, { rows: 3, levels: L3 }), null);
  assert.equal(R.normMade({ rows: [{ name: '', cells: {} }] }, U, { rows: 3, levels: L3 }), null);
  // 모자라면 있는 만큼, 새 요소 번호 붙이기
  const two = R.normMade({ rows: rows.slice(0, 2) }, U, { rows: 4, levels: L3 });
  assert.equal(two.rows.length, 2);
  assert.deepEqual(two.rows.map(r => r.id), ['r1', 'r2']);
  assert.deepEqual(two.levels, L3);
});

test('[rb-norm-redact] AI 답에 남은 가린 이름은 되돌리고, 깨진 자리 표시가 남은 칸은 빈 글', async () => {
  const { makeRedactor } = await import('../../web/core/redact.js');
  const r = makeRedactor();
  const p = R.makePrompt(U, { task: '한가람 선생님 자료로 두 방법 설명', rows: 2, levels: L3, redactor: r });
  assert.ok(/〔이름1〕/.test(p) && !/한가람/.test(p));
  const rb = R.normMade({ rows: [{ name: '요소', cells: { high: { text: '〔이름1〕 자료를 씀', pts: 34 }, mid: { text: '〔이름7〕 자료', pts: 20 } } }, { name: '둘', cells: {} }] }, U, { rows: 2, levels: L3, redactor: r });
  assert.equal(rb.rows[0].cells.high.text, '한가람 자료를 씀');
  assert.equal(rb.rows[0].cells.mid.text, '');
});

test('[rb-setlevels] 3↔4단계 바꾸기: 글·고친 점수 유지, 없어진 수준 칸 빠짐, 새 수준 칸 빈 글', () => {
  const rb = sample();
  rb.rows[0].cells.high.pts = 30;
  const b4 = R.setLevels(rb, L4);
  assert.notEqual(b4, rb);
  assert.deepEqual(b4.levels, L4);
  assert.equal(b4.rows[0].cells.top.text, '');
  assert.equal(b4.rows[0].cells.high.pts, 30);
  assert.equal(b4.rows[0].cells.high.text, '두 방법 모두 원리를 바르게 설명함');
  assert.equal(rb.rows[0].cells.top, undefined); // 원래 것은 그대로
  const b3 = R.setLevels(b4, L3);
  assert.equal(b3.rows[0].cells.top, undefined);
  assert.equal(b3.rows[0].cells.high.pts, 30);
  assert.deepEqual(b3.levels, L3);
});

test('[rb-store] 저장·찾기·지우기: 평가계획을 새로 넣어도(단원 id 다름) 과목·평가요소가 같으면 같은 기준표', () => {
  useStorage(fake());
  const rb = sample();
  assert.equal(R.getFor(U), null);
  assert.equal(R.saveFor(U, rb), true);
  const same = { ...U, id: 'zzz', subject: '수학 ' };
  const got = R.getFor(same);
  assert.ok(got); assert.equal(got.rows[0].name, '곱셈 원리 이해');
  assert.equal(got.subject, '수학'); assert.equal(got.elem, '곱셈 원리 설명하기'); assert.ok(got.at > 0);
  assert.equal(R.getFor({ ...U, subject: '과학' }), null);
  assert.equal(R.saveFor({ subject: '수학', elem: '', unit: '' }, rb), false);
  assert.deepEqual(Object.keys(R.loadAll()), [R.unitKey(U)]);
  R.removeFor(same);
  assert.equal(R.getFor(U), null);
  assert.deepEqual(R.loadAll(), {});
});

test('[rb-prompt] 요청 글: 평가 정보·수준 이름이 들어가고 학생 자료 칸이 없으며 교직원 이름은 가림', () => {
  const p = R.makePrompt(U4, { task: '한가람 선생님 자료로 두 방법 설명', rows: 3, levels: L4, grade: 3 });
  assert.match(p, /\[학년·과목\] 3학년 수학/);
  assert.match(p, /\[단원\] 곱셈/); assert.match(p, /\[평가요소\] 곱셈 원리 설명하기/); assert.match(p, /\[성취기준\]/);
  assert.match(p, /\[평가기준\] 최상: 새로운 상황에 적용함 \/ 상: 두 방법으로 설명함 \/ 중: 한 방법으로 설명함 \/ 하: 식만 씀/);
  assert.match(p, /최상.*상.*중.*하/s);
  assert.match(p, /3개/);
  assert.ok(!/한가람/.test(p), p);
  assert.ok(!/\[학생|학생 자료|학생 이름/.test(p));
  assert.match(p, /"rows"/);
  const p3 = R.makePrompt({ ...U, std: 'ㄱ'.repeat(900) }, { rows: 2, levels: L3, grade: '' });
  assert.match(p3, /\[평가기준\] 상: 두 방법으로 설명함 \/ 중: 한 방법으로 설명함 \/ 하: 식만 씀/);
  assert.match(p3, /\[학년·과목\] 수학/);
  assert.ok(!/ㄱ{701}/.test(p3));
  assert.ok(!/\[과제 설명\]/.test(p3));
});

test('[rb-grade] 채점 글: 첫 줄 머리, 요소마다 한 줄, 빈 칸 글은 뺌', () => {
  const rb = sample();
  rb.rows[2].cells.low.text = '';
  const lines = R.gradeBlock(rb).split('\n');
  assert.equal(lines[0], '[수준별 채점 기준표] (배점 합 100점)');
  assert.equal(lines[1], '1. 곱셈 원리 이해 (34점) — 상(34점): 두 방법 모두 원리를 바르게 설명함 / 중(24점): 한 방법으로 원리를 설명함 / 하(14점): 식만 쓰고 설명이 없음');
  assert.equal(lines[3], '3. 설명하기 (33점) — 상(33점): 까닭을 들어 말함 / 중(23점): 결과만 말함');
  assert.equal(R.sumPoints(rb), 100);
});

test('[rb-normrb] 학생 요소별 수준 정리: 키·이름 모두 받고, 모르는 요소·수준·겹침은 버림', () => {
  const rb = sample();
  const out = R.normRb([{ name: '곱셈 원리 이해', level: '상' }, { name: ' 풀이 과정', level: 'mid' }, { name: '없는 요소', level: 'high' },
    { name: '설명하기', level: '안 함' }, { name: '곱셈 원리 이해', level: 'low' }], rb);
  assert.deepEqual(out, [{ name: '곱셈 원리 이해', level: 'high' }, { name: '풀이 과정', level: 'mid' }, { name: '설명하기', level: 'none' }]);
  assert.deepEqual(R.normRb([{ name: '풀이 과정', level: '잘함' }, { name: '설명하기', level: '최상' }, { name: '곱셈원리이해', level: 'none' }], rb), [{ name: '곱셈 원리 이해', level: 'none' }]);
  assert.deepEqual(R.normRb(null, rb), []);
  assert.deepEqual(R.normRb([{ name: '풀이 과정', level: 'high' }], null), []);
});

test('[rb-base] 기준 점수 셈과 ±4 자르기', () => {
  const rb = sample();
  const lst = [{ name: '곱셈 원리 이해', level: 'high' }, { name: '풀이 과정', level: 'mid' }, { name: '설명하기', level: 'none' }];
  assert.equal(R.baseScore(lst, rb), Math.round((34 + 23 + 0) / 100 * 100));
  // 빠진 요소는 버림(분자·분모 모두): 3번째 요소가 없으면 57/67, 안 함이면 57/100
  assert.equal(R.baseScore([lst[0], lst[1]], rb), Math.round(57 / 67 * 100));
  assert.equal(R.baseScore(lst, rb), 57);
  assert.equal(R.baseScore([{ name: '없는 요소', level: 'high' }], rb), null);
  // 배점 합 90 → 100점으로 환산
  const r90 = sample(); r90.rows.forEach(r => { r.points = 30; L3.forEach((lv, i) => { r.cells[lv].pts = [30, 21, 12][i]; }); });
  assert.equal(R.baseScore(R.normRb(r90.rows.map(r => ({ name: r.name, level: 'high' })), r90), r90), 100);
  assert.equal(R.baseScore(R.normRb(r90.rows.map(r => ({ name: r.name, level: 'mid' })), r90), r90), 70);
  // 모두 0 · 빈 목록
  const r0 = sample(); r0.rows.forEach(r => { r.points = 0; L3.forEach(lv => { r.cells[lv].pts = 0; }); });
  assert.equal(R.baseScore(lst, r0), null);
  assert.equal(R.baseScore([], rb), null);
  assert.equal(R.baseScore(null, rb), null);
  assert.equal(R.baseScore(lst, null), null);
  assert.equal(R.clampScore(99, 70), 74); assert.equal(R.clampScore(60, 70), 66);
  assert.equal(R.clampScore(50, null), 50); assert.equal(R.clampScore(103, 100), 100);
  assert.equal(R.clampScore(-3, 2), 0);
});

test('[rb-evidence] 평어 근거 줄: 수준 이름 없음, 안 함·빈 칸 글은 뺌', () => {
  const rb = sample(); rb.rows[1].cells.mid.text = '';
  const lst = [{ name: '곱셈 원리 이해', level: 'high' }, { name: '풀이 과정', level: 'mid' }, { name: '설명하기', level: 'none' }];
  assert.deepEqual(R.evidenceLines(lst, rb), ['기준표 「곱셈 원리 이해」: 두 방법 모두 원리를 바르게 설명함']);
  assert.deepEqual(R.evidenceLines(null, rb), []);
});

test('[rb-levellines] 교과 평어용 수준별 줄', () => {
  const rb = sample();
  assert.equal(R.levelLines(rb, 'high'), '[수준별 기준표 — 상] 곱셈 원리 이해: 두 방법 모두 원리를 바르게 설명함 / 풀이 과정: 과정을 차례대로 씀 / 설명하기: 까닭을 들어 말함');
  const top = R.levelLines(rb, 'top');
  assert.match(top, /^\[수준별 기준표 — 상\] 곱셈 원리 이해: 두 방법/);
  assert.match(top, /이보다 한 걸음 더 나아간 모습/);
  assert.equal(R.levelLines(null, 'high'), '');
  assert.equal(R.levelLines(rb, 'mid').startsWith('[수준별 기준표 — 중]'), true);
  assert.equal(R.levelLines(R.blankRubric(U), 'high'), '');
});

test('[rb-doc] 내려받기 문서: 제목·표 머리·칸 글·과제 줄·파일 이름', () => {
  const rb = sample(); rb.subject = '수학'; rb.elem = '곱셈 원리 설명하기'; rb.unit = '곱셈'; rb.std = '곱셈의 원리를 이해한다.';
  const d = R.rubricDoc(rb, { grade: 3 });
  assert.equal(d.title, '곱셈 원리 설명하기 수준별 채점 기준표');
  const tb = d.blocks.find(b => b.type === 'table');
  assert.deepEqual(tb.rows[0], ['채점 요소', '배점', '상', '중', '하']);
  assert.equal(tb.head, true);
  assert.equal(tb.rows[1][2], '두 방법 모두 원리를 바르게 설명함 (34점)');
  assert.ok(tb.rows[1][0] === '곱셈 원리 이해' && /34/.test(tb.rows[1][1]));
  const texts = d.blocks.filter(b => b.type !== 'table').map(b => b.text);
  assert.ok(texts.some(t => t.startsWith('3학년 수학 · 곱셈 · 성취기준 곱셈의 원리를 이해한다.')), texts.join('|'));
  const iT = d.blocks.findIndex(b => b.text === '과제: 두 자리 수 곱셈을 두 가지 방법으로 풀고 까닭을 씀');
  assert.ok(iT >= 0 && iT < d.blocks.indexOf(tb));
  rb.task = '';
  assert.ok(!R.rubricDoc(rb, {}).blocks.some(b => /^과제:/.test(b.text || '')));
  assert.equal(R.docName(rb), '수준별 기준표-수학-곱셈 원리 설명하기');
});

test('[rb-levelpts] 배점 하나의 수준 점수(배점을 고치면 고치지 않은 수준 점수가 따라감)', () => {
  assert.deepEqual(R.levelPts(66, L3), { high: 66, mid: 46, low: 26 });
  assert.deepEqual(R.levelPts(25, L4), { top: 25, high: 20, mid: 15, low: 10 });
  assert.deepEqual(R.levelPts(34, L3), R.defaultPoints(3, L3)[0].pts);
  assert.deepEqual(R.levelPts('x', L3), { high: 0, mid: 0, low: 0 });
});

test('[rb-addrow] 요소 더하기: 새 기준표, 빈 칸·n+1개 기본 배점·겹치지 않는 id, 5개면 그대로', () => {
  const rb = sample();
  rb.rows.splice(1, 1); // r1, r3만 남음
  const out = R.addRow(rb);
  assert.notEqual(out, rb);
  assert.equal(rb.rows.length, 2);
  assert.equal(out.rows.length, 3);
  const n = out.rows[2];
  assert.equal(n.name, ''); assert.equal(n.points, R.defaultPoints(3, L3)[2].points);
  assert.deepEqual(n.cells, { high: { text: '', pts: 33 }, mid: { text: '', pts: 23 }, low: { text: '', pts: 13 } });
  assert.equal(new Set(out.rows.map(r => r.id)).size, 3);
  assert.equal(out.rows[0].name, '곱셈 원리 이해');
  let five = sample(); while (five.rows.length < 5) five = R.addRow(five);
  assert.equal(five.rows.length, 5);
  assert.equal(R.addRow(five).rows.length, 5);
  assert.deepEqual(Object.keys(R.addRow(R.setLevels(sample(), L4)).rows[3].cells), L4);
});
