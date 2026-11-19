/* 다섯 번째 버그 찾기(2026-11-19) 평가 메뉴 — 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '탁보해'];
const leak = t => NAMES.filter(n => String(t).includes(n));

test('행특 메모 → AI: 목록 밖 친구 이름 + 을·를·과·와·에게도 가림(행특 메모 규칙), 「양보해 줌」 같은 동사는 그대로', async () => {
  globalThis.window = globalThis.window || {};
  await import('../../web/menus/evaluate/gr-bundle.js');
  const { memoForAI } = await import('../../web/core/bundle.js');
  const hide = window.SSAM.memoNames.hide;
  // evaluate.js hkMemoAI = hkHide(hkMemoOut(s)) = memoNames.hide(memoNames.forAI(memo))
  const ai = m => hide(memoForAI(m));
  for (const m of ['친구 박솔빛에게 칭찬을 들음', '박솔빛이 모둠 발표를 도와줌', '탁보결과 다툰 뒤 먼저 사과함', '친구 남다율을 도와줌', '짝 김하늘과 함께 발표',
    '남다율을 괴롭혀 지도함', '탁보결과 남다율 사이 갈등을 중재함'])
    assert.deepEqual(leak(ai(m)), [], `${m} → ${ai(m)}`);
  assert.equal(ai('친구 탁보결과 자주 다툼'), '친구 ○○○과 자주 다툼');
  // 지나친 가림 없음: 흔한 행특 메모 말
  for (const m of ['친구에게 양보해 줌', '모둠 친구에게 설명해 줌', '교실을 깨끗이 정리해 줌', '모둠 활동을 주도해 나감', '친구의 실수를 이해해 줌', '친구를 위로해 줌',
    '교실 놀이를 제안해 함께 즐김', '한결같이 성실함', '수업 시간에 바른 자세로 집중함', '1인 1역으로 우유 당번을 성실히 함', '쉬는 시간에 친구들과 공기놀이를 즐김',
    '성실함, 책임감 강함, 1인 1역 꾸준함, 맡은 일을 끝까지 함', '친구를 잘 도와줌, 배려심 깊음, 교우 관계 원만, 양보를 잘함'])
    assert.equal(ai(m), m, m);
  // 「…해」로 끝나는 이름은 조사·사람 말·메모 말이 붙으면 그대로 가림(행특 메모·채팅 모두)
  const { maskPersons } = await import('../../web/core/chat-names.js');
  for (const memo of [false, true]) {
    for (const s of ['탁보해가 발표함', '탁보해 학생 결석', '탁보해 발표 잘함', '담임 탁보해', '탁보해에게 양보함'])
      assert.deepEqual(leak(maskPersons(s, { memo }).text), [], `${memo} ${s}`);
  }
  assert.deepEqual(leak(ai('친구 탁보해를 도와줌')), []);
  // 띄어 쓴 이름 칸(「1 탁보해 친구를 잘 도와줌」)·AI로 보낼 때 앞 이름 칸도 그대로 이름으로 봄
  const { memoRows } = await import('../../web/core/bundle.js');
  const r = memoRows('1 탁보해 친구를 잘 도와줌\n2 남다율 발표 잘함\n3 이바다 청소를 열심히 함');
  assert.deepEqual(r.rows.map(x => x.memo), ['친구를 잘 도와줌', '발표 잘함', '청소를 열심히 함']);
  assert.equal(ai('탁보해 친구를 잘 도와줌'), '친구를 잘 도와줌');
  // 「쌤」 채팅의 메모 저장(maskMemo)도 같은 규칙: 동사는 그대로
  const { maskMemo } = await import('../../web/core/chat-route.js');
  assert.equal(maskMemo('친구에게 양보해 줌').text, '친구에게 양보해 줌');
  assert.equal(maskMemo('모둠 친구에게 설명해 줌').text, '모둠 친구에게 설명해 줌');
  assert.equal(maskMemo('탁보결과 다툼').text, '○○○과 다툼');
});

test('단원평가 정답지 머리 「2026학년도 3학년 …」의 학년은 3(학년도의 6이 아님)', async () => {
  const { parseKey } = await import('../../web/menus/evaluate/unit/unit-key.js');
  const table = h => [h, '문항 | 평가 내용 | 정답 | 배점', '1 | 곱셈 | ① | 30', '2 | 곱셈 | 26 | 30', '3 | 곱셈 | 48 | 40'].join('\n');
  assert.equal(parseKey(table('2026학년도 3학년 2학기 수학 3단원 단원평가 정답')).meta.grade, 3);
  assert.equal(parseKey(table('2025학년도 2학기 4학년 과학 단원평가')).meta.grade, 4);
  assert.equal(parseKey(table('2026학년도 2학기 수학 단원평가')).meta.grade, null);
  assert.equal(parseKey(table('2학기 단원평가 ( 3 )학년 ( 국어 )과 1단원 (1회)')).meta.grade, 3);
  const inline = ['2026학년도 4학년 2학기 과학 3단원 단원평가', '정답', '1. ③ 2. ② 3. ④ 4. ①'].join('\n');
  assert.equal(parseKey(inline).meta.grade, 4);
  assert.equal(parseKey(inline).meta.term, 2);
});

test('단원평가 정답지: 채점 기준 칸의 자리 표시(「-」「없음」「정답 시 10점」)로 고르기·단답·기호 문항이 서술형이 되지 않음', async () => {
  const { parseKey, itemType } = await import('../../web/menus/evaluate/unit/unit-key.js');
  const G = await import('../../web/menus/evaluate/unit/unit-grade.js');
  const S = await import('../../web/menus/evaluate/eval-stage.js');
  for (const fill of ['-', '―', 'ㅡ', '없음', '해당 없음', '정답 시 10점', '정답 10점', '']) {
    const k = parseKey(['문항 | 평가 내용 | 정답 | 배점 | 채점 기준', `1 | 덧셈 | ③ | 10 | ${fill}`, `2 | 뺄셈 | 24 | 10 | ${fill}`, `3 | 기호 | ㉡ | 10 | ${fill}`,
      '4 | 서술 | (예) 묶어 세면 편리하다. | 20 | 까닭을 쓰면 20점, 일부만 10점', '5 | 서술 | 묶어 세면 빠르다. | 20 | 까닭을 들어 쓰면 정답'].join('\n'));
    assert.deepEqual(k.items.map(i => i.type), ['choice', 'short', 'symbol', 'essay', 'essay'], fill);
    // 모두 맞힌 학생: 확인할 칸은 서술형 칸만
    const t = { key: { items: k.items }, students: [1, 2].map(no => ({ no, status: 'done', items: Object.fromEntries(k.items.map(it => [it.no, G.gradeCell(it, { read: it.answer, points: it.points, sure: true })])) })) };
    assert.equal(S.unitPending(t), 4, fill);
  }
  // 진짜 채점 기준은 서술형 그대로
  assert.equal(itemType('곤충', '더듬이·날개 중 하나만 쓰면 2점'), 'essay');
  assert.equal(itemType('물이 증발하기 때문이다.', '5점'), 'essay');
  assert.equal(itemType('③', ''), 'choice');
});

test('빈 문제지 머리 「2026학년도 3-2 수학」「초등 3-2 과학」의 교과는 수학·과학(「학년도」「초등」이 아님)', async () => {
  const { parsePaper, parseKey } = await import('../../web/menus/evaluate/unit/unit-key.js');
  const paper = h => parsePaper([h, '3학년 ( )반 ( )번 이름( )', '1. 다음 중 알맞은 것은 어느 것입니까?', '① 가 ② 나', '2. 계산하시오.'].join('\n')).meta;
  const sub = h => paper(h).subject;
  assert.equal(sub('2026학년도 3-2 수학 단원평가'), '수학');
  assert.equal(sub('2학기 3-2 과학 단원평가'), '과학');
  assert.equal(sub('초등 3-2 과학 단원평가'), '과학');
  assert.equal(sub('단원평가 5-2 사회과'), '사회');
  assert.equal(sub('수학 3-2 3. 곱셈 (1회)'), '수학');
  assert.equal(sub('2026학년도 3-2 단원평가'), '', '교과 낱말이 없으면 비워 둠');
  assert.deepEqual([paper('2026학년도 3-2 수학 단원평가').grade, paper('2026학년도 3-2 수학 단원평가').term], [3, 2]);
  // 문제 + 정답 합본: [답안 넣기]가 채우는 평가 정보(unit.js useKey의 fill 차례)
  const text = ['2026학년도 3-2 수학 단원평가', '3학년 ( )반 ( )번 이름( )', '1. 다음 중 계산이 바른 것은 어느 것입니까? ( )', '① 12×3=36 ② 13×2=24', '2. 빈칸에 알맞은 수를 쓰시오.', '3. 곱셈을 하시오.',
    '정답 및 해설', '1. ① 2. 26 3. 48'].join('\n');
  const k = parseKey(text);
  assert.equal(k.meta.grade, 3);
  assert.equal(k.meta.unitNo, null);
});

test('문제지·합본 정답지 머리에 단원 줄이 없으면 첫 문항 「1. 다음 중 …?」을 단원 이름으로 넣지 않음', async () => {
  const { parsePaper, parseKey } = await import('../../web/menus/evaluate/unit/unit-key.js');
  const p = parsePaper(['수학 3단원 평가', '3학년 ( )반 ( )번 이름( )', '1. 다음 중 계산이 바른 것은 어느 것입니까? ( )', '① 12×3=36 ② 13×2=24', '2. 빈칸에 알맞은 수를 쓰시오.', '3. 곱셈을 하시오.'].join('\n')).meta;
  assert.equal(p.unitNo, null);
  assert.equal(p.unitName, '');
  // 보기가 아래 줄에 오는 문항, 「…쓰시오」(마침표 없음)도 단원이 아님
  const q = parsePaper(['3단원 곱셈 평가', '1. 곱셈을 바르게 한 것', '① 12×3=36', '2. 빈칸에 알맞은 수를 써넣으시오'].join('\n')).meta;
  assert.deepEqual([q.unitNo, q.unitName], [null, '']);
  // 따로 떨어진 단원 줄·표 칸 단원은 그대로
  const r = parsePaper(['과학', '3-2', '4. 동물의 생활', '1. 다음 중 곤충은 무엇입니까?', '① 거미'].join('\n')).meta;
  assert.deepEqual([r.subject, r.unitNo, r.unitName], ['과학', 4, '동물의 생활']);
  const s = parsePaper(['중간 평가 | 2회 | 3. 동물의 생활 | 반 번 이름', '다음 중 곤충이 아닌 것은 어느 것입니까? ( )', '① 개미'].join('\n')).meta;
  assert.deepEqual([s.unitNo, s.unitName], [3, '동물의 생활']);
  // 합본 정답지(문제 뒤에 정답 줄)의 단원 번호도 첫 문항 번호가 아님
  const k = parseKey(['수학 평가', '1. 다음 중 계산이 바른 것은 어느 것입니까? ( )', '① 12×3=36 ② 13×2=24', '2. 빈칸에 알맞은 수를 쓰시오.', '3. 곱셈을 하시오.', '정답', '1. ① 2. 26 3. 48'].join('\n'));
  assert.equal(k.meta.unitNo, null);
});
