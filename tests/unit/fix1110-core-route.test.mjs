// 2026-11-10 공통 영역 버그 찾기(core) — 「쌤」 채팅 글 → 할 일(core/chat-route.js): 글 앞에 숫자가 띄어쓰기 여럿·「 - 」로 길게 이어지면
// 「3번 …」 찾기(parseMemo)가 숫자마다 두 배씩 오래 걸려 창이 멈추던 것(표 머리 「1  2  3 … 25」를 붙여 넣으면 몇 분)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMemo, routeText } from '../../web/core/chat-route.js';
import { mentionedNos } from '../../web/core/chat-assist.js';

const fast = (fn, ms = 200) => { const t0 = performance.now(); const r = fn(); const took = performance.now() - t0; assert.ok(took < ms, `${Math.round(took)}ms`); return r; };

test('[core-memo-hang] 숫자가 길게 이어진 글(띄어쓰기 여럿·「 - 」·「 · 」·빈 줄)도 바로 끝남', () => {
  const nos = (sep, n) => Array.from({ length: n }, (_, i) => i + 1).join(sep);
  for (const s of [nos('  ', 25) + ' 교시', nos('\t\t', 25) + ' 끝', nos(' - ', 30) + ' 차시 계획 써 줘', nos(' · ', 30) + ' 모둠', nos('\n\n', 25) + '\n끝', nos('   ', 40)]) {
    assert.equal(fast(() => parseMemo(s)), null, s);
    fast(() => mentionedNos(s));
    fast(() => routeText(s));
  }
  // 끝에 「번」이 붙으면 그대로 번호들(40명까지)
  assert.deepEqual(fast(() => parseMemo(nos('  ', 25) + '번 발표 잘함')).nos, Array.from({ length: 25 }, (_, i) => i + 1));
});

test('[core-memo-hang] 원래 번호 꼴은 그대로 읽음', () => {
  const cases = [['3번 토론에서 반론 잘함', [3], '토론에서 반론 잘함'], ['3·5번 발표', [3, 5], '발표'], ['3, 5번 청소', [3, 5], '청소'], ['3번, 5번 다툼', [3, 5], '다툼'],
    ['3~5번 모둠 활동', [3, 4, 5], '모둠 활동'], ['3 - 5번 지각', [3, 4, 5], '지각'], ['3번과 5번 협력함', [3, 5], '협력함'], ['3하고 5번 발표', [3, 5], '발표'], ['3 번 5 번 발표함', [3, 5], '발표함'],
    ['3번 학생은 차분함', [3], '차분함'], ['12번이 도와줌', [12], '도와줌'], ['1  2  3번 지각함', [1, 2, 3], '지각함'], ['3 , 5 , 7번 청소함', [3, 5, 7], '청소함'], ['3번: 발표함', [3], '발표함']];
  for (const [s, nos, body] of cases) {
    const m = parseMemo(s);
    assert.ok(m, s);
    assert.deepEqual(m.nos, nos, s);
    assert.equal(m.body, body, s);
  }
  for (const s of ['3학년 2반 공문', '5월 3일 운동회', '2026-11-10 공문', '30분 동안']) assert.equal(parseMemo(s), null, s);
});
