// 가렸다 되돌리기(core/redact.js, 스펙 2026-11-15 공통 도우미): 이름은 〔이름n〕, 전화번호·이메일은 {{n}}으로 보내고 돌아온 글에서 되돌림.
// 명단·전화번호만 있는 줄·주민번호 줄은 보내지 않음(null). 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
const { makeRedactor, redactText } = await import('../../web/core/redact.js');

test('[redact-line] 교직원 이름·전화번호를 번호 붙은 자리 표시로 바꾸고 되돌림(같은 이름은 같은 자리)', () => {
  const r = makeRedactor();
  const a = r.line('담당: 교무부장 이바다 선생님(041-123-4567), 협조 한가람 주무관');
  assert.ok(a && !/이바다|한가람|041-123-4567/.test(a.text), JSON.stringify(a));
  assert.match(a.text, /〔이름1〕/); assert.match(a.text, /\{\{1\}\}/);
  const b = r.line('이바다 선생님이 사회를 봄');
  assert.match(b.text, /〔이름1〕 선생님이 사회를 봄/);
  // AI가 글을 바꿔도 자리 표시는 원래 이름으로
  assert.equal(r.back('〔이름1〕 선생님(교무부장)이 진행함. 문의 {{1}}'), '이바다 선생님(교무부장)이 진행함. 문의 041-123-4567');
});

test('[redact-drop] 주민번호 줄·이름이 늘어선 명단 줄은 보내지 않음(null), 전화번호만 있는 줄은 {{n}}으로', () => {
  const r = makeRedactor();
  assert.equal(r.line('김하늘 080101-3123456'), null);
  assert.equal(r.line('김하늘 이바다 한가람 박솔 최하은'), null);
  const p = r.line('비상 연락망 010-1234-5678');
  assert.ok(p && p.text === '비상 연락망 {{1}}', JSON.stringify(p));
});

test('[redact-plain] 가릴 것이 없으면 글 그대로, 사라진 자리 표시는 끝에 붙이지 않음', () => {
  const r = makeRedactor();
  const a = r.line('2026학년도 독서교육 운영 계획을 다음과 같이 수립한다.');
  assert.equal(a.text, '2026학년도 독서교육 운영 계획을 다음과 같이 수립한다.');
  r.line('담당 이바다 선생님');
  assert.equal(r.back('담당 선생님'), '담당 선생님');
});

test('[redact-text] 여러 줄 글: 뺀 줄 수와 함께, 되돌리기는 모든 줄에서', () => {
  const t = redactText('1. 안건: 현장체험학습\n- 담임 이바다 선생님이 버스 예약\n김하늘 이바다 한가람 박솔 최하은\n- 학생 김하늘 학생 안전 지도 (문의 010-9999-8888)');
  assert.equal(t.dropped, 1);
  assert.ok(!/이바다|김하늘|010-9999/.test(t.text), t.text);
  assert.match(t.back(t.text), /이바다 선생님이 버스 예약/);
  assert.match(t.back(t.text), /김하늘 학생 안전 지도/);
});

test('[redact-staff-ro] 직함 뒤 「으로·로·부터·처럼」이 붙어도 교직원 이름을 가림(「한가람 선생님으로 정함」)', async () => {
  const { maskStaff } = await import('../../web/core/privacy.js');
  for (const s of ['한가람 선생님으로 정함', '이바다 주무관으로 바꿈', '한가람 부장님부터 발표', '이바다 선생님처럼 진행'])
    assert.ok(!/한가람|이바다/.test(maskStaff(s).text), s + ' → ' + maskStaff(s).text);
  // 직함이 아닌 낱말 뒤는 그대로
  assert.equal(maskStaff('선생님으로서 할 일').text, '선생님으로서 할 일');
});
