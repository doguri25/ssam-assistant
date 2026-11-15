// 2026-11-15 남겨 둔 것 고침: 채팅 기록·AI로 보내는 글의 교직원 이름(「이바다 선생님이」), 두 줄짜리 번호 명단(남·여), 0점 문항 알림.
// 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeText } from '../../web/core/chat-route.js';
import { stripNames } from '../../web/core/privacy.js';
import { makeRedactor } from '../../web/core/redact.js';
import { warnOf, problems } from '../../web/menus/evaluate/unit/unit-make.js';

test('[chat-staff] 채팅 기록·AI로 보내는 글(safeText)은 직함 앞뒤 교직원 이름도 가림', () => {
  for (const s of ['버스 예약은 이바다 선생님이 11월 20일까지', '이바다 선생님께 연락', '한가람 부장님께 드릴 자료', '담당 한가람 선생님', '이바다 교감 선생님 결재'])
    assert.ok(!/이바다|한가람/.test(safeText(s)), `${s} → ${safeText(s)}`);
  assert.match(safeText('버스 예약은 이바다 선생님이 11월 20일까지'), /선생님이 11월 20일까지/);
  assert.equal(safeText('선생님께 연수 안내 쪽지 써 줘'), '선생님께 연수 안내 쪽지 써 줘');
});

test('[roster-two] 성별이 붙은 두 줄짜리 번호 명단도 이름을 가림(번호·성별은 남김)', () => {
  const r = stripNames('1 김하늘 남\n2 박솔빛 여');
  assert.ok(!/김하늘|박솔빛/.test(r.text), r.text);
  assert.match(r.text, /^1 ○○○ 남\n2 ○○○ 여$/);
  const x = makeRedactor().lines(['1 김하늘 남', '2 박솔빛 여']);
  assert.ok(x.every(Boolean) && !/김하늘|박솔빛/.test(x.map(v => v.text).join('\n')), JSON.stringify(x));
  // 성별이 없는 두 줄은 그대로(차례 글일 수 있음)
  assert.equal(stripNames('1 협동심 기르기\n2 체력 기르기').text, '1 협동심 기르기\n2 체력 기르기');
});

test('[mk-zero] 0점 문항은 평가 만들기 전에 알림(배점을 정하게)', () => {
  const it = { no: 3, type: 'short', question: '물의 세 가지 상태는?', answer: '고체, 액체, 기체', points: 0 };
  assert.match(warnOf(it), /배점/);
  assert.deepEqual(problems([{ ...it, points: 10 }, it]).map(p => p.no), [3]);
  assert.equal(warnOf({ ...it, points: 5 }), '');
});
