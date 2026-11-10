// 2026-11-10 공통 영역 버그 찾기(core) — 개인정보: 채팅이 AI·기록·메뉴로 보내는 글의 주민등록번호·+82 전화번호(core/privacy.js maskContacts)
// 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskContacts } from '../../web/core/privacy.js';
import { safeText, handoffText } from '../../web/core/chat-route.js';
import { assistPrompt } from '../../web/core/chat-assist.js';

test('[core-rrn] 채팅 글의 주민등록번호는 그 자리만 ○○○로(AI·기록·메뉴로 가지 않음), 날짜·금액·번호는 그대로', () => {
  assert.equal(maskContacts('주민번호 900101-1234567 어떻게 넣어?'), '주민번호 ○○○ 어떻게 넣어?');
  assert.equal(maskContacts('외국인등록번호 050505 - 5123456 확인'), '외국인등록번호 ○○○ 확인');
  assert.equal(safeText('3번 학생 주민번호 120304-3123456 서류 어디에 내?'), '3번 학생 주민번호 ○○○ 서류 어디에 내?');
  assert.equal(handoffText('강사 주민번호 800101-1234567 받아야 하는지 쪽지 써 줘'), '강사 주민번호 ○○○ 받아야 하는지 쪽지 써 줘');
  const p = assistPrompt({ text: '주민번호 900101-1234567 나이스에 어떻게 넣어?', history: [{ who: 'me', text: '아까 쓴 801231-2345678' }] });
  assert.ok(!p.own.includes('1234567') && !p.own.includes('2345678'), p.own);
  // 주민번호가 아닌 숫자는 그대로
  for (const s of ['2026-11-10 공문', '1,200,000원 품의', '공문 번호 2026-12345', '학번 20261105', '123456-12345 영수증'])
    assert.equal(maskContacts(s), s, s);
});

test('[core-phone82] +82로 쓴 전화번호도 그 자리만 ○○○', () => {
  assert.equal(maskContacts('연락처 +82-10-1234-5678 로 주세요'), '연락처 ○○○ 로 주세요');
  assert.equal(maskContacts('+82 10 1234 5678'), '○○○');
  assert.equal(maskContacts('+82-2-123-4567(학교)'), '○○○(학교)');
  assert.equal(safeText('+82-10-1234-5678 로 연락 오면 어떻게 해?'), '○○○ 로 연락 오면 어떻게 해?');
});

test('검토: 예산 범위 「300000-1500000원」은 주민등록번호가 아님(앞 여섯 자리가 날짜 꼴일 때만)', () => {
  assert.equal(maskContacts('예산 300000-1500000원'), '예산 300000-1500000원');
  assert.equal(maskContacts('단가 120000-1300000원 사이'), '단가 120000-1300000원 사이');
  assert.notEqual(maskContacts('주민번호 900101-1234567'), '주민번호 900101-1234567');
  assert.notEqual(maskContacts('외국인 051231-5123456'), '외국인 051231-5123456');
});
