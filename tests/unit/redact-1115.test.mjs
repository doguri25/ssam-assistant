// 2026-11-15 새 눈 검토 고침 — 가렸다 되돌리기(core/redact.js): 맨 이름·여러 줄 명단·표·이미 아는 이름·외국인등록번호·계좌·+82 전화·이상한 자리 표시.
// 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRedactor, redactText } from '../../web/core/redact.js';

const NAMES = /김하늘|이바다|한가람|박솔빛|김민수|이서연|최하은/;
const sent = outs => outs.filter(Boolean).map(x => x.text).join('\n');

test('[rd-persons] 직함·조사 없이 적힌 학생 이름(반 번호 옆·쉼표로 이은 이름·「·」로 이은 교직원·「T」)도 가리고 되돌림', () => {
  const src = ['5-2 김하늘 결석 3일', '김하늘(5-2) 학부모 민원', '김하늘, 이바다 학생 상담 필요', '한가람·이바다 선생님 인솔', '이바다T 연락처 확인'];
  const r = makeRedactor(), out = r.lines(src);
  const text = sent(out);
  assert.ok(!NAMES.test(text), text);
  assert.ok(out.every(Boolean), '보낼 줄을 빼지 않음');
  assert.match(r.back(text), /김하늘 결석 3일/);
  assert.match(r.back(text), /한가람·이바다 선생님 인솔/);
});

test('[rd-roster] 한 줄에 한 명씩 적힌 번호 명단·「이름」 머리 칸 아래 표의 이름도 가림(줄마다 보내도)', () => {
  const r = makeRedactor();
  const a = sent(r.lines(['3학년 2반 명렬표', '1 김하늘 남', '2 이바다 여', '3 한가람 남', '4 박솔빛 여']));
  assert.ok(!NAMES.test(a), a);
  const b = sent(r.lines(['이름 | 1인 1역', '김민수 | 우유 당번', '이서연 | 칠판 정리', '최하은 | 화분 물 주기']));
  assert.ok(!NAMES.test(b), b);
  assert.match(b, /우유 당번/);
  const t = redactText('1 김하늘 남\n2 이바다 여\n3 한가람 남');
  assert.ok(!NAMES.test(t.text), t.text);
});

test('[rd-known] 한 번 알아낸 이름은 다른 줄(앞 줄 포함)·다음 요청에서도 같은 자리 표시로 가림', () => {
  const r = makeRedactor();
  const out = r.lines(['시상: 김하늘(3-2), 12월 2일', '김하늘 학생이 최우수상을 받았습니다.']);
  const text = sent(out);
  assert.ok(!/김하늘/.test(text), text);
  const toks = text.match(/〔이름\d+〕/g);
  assert.equal(new Set(toks).size, 1, text);
  // 다음 요청: 원래 글(learn)에서 이름을 먼저 배움 — AI가 고친 글에 「학생」이 없어도
  const r2 = makeRedactor();
  const n = r2.lines(['독서 골든벨 최우수상: 3학년 김하늘'], { learn: ['3학년 김하늘 학생이 독서 골든벨에서 최우수상을 받았습니다.'] });
  assert.ok(!/김하늘/.test(sent(n)), sent(n));
  // 낱말 안의 같은 글자는 건드리지 않음
  const r3 = makeRedactor();
  r3.lines(['이바다 선생님이 사회']);
  assert.equal(r3.line('바다이바다는 없는 낱말').text.includes('바다이바다'), true);
});

test('[rd-numbers] 외국인등록번호 줄·계좌 줄은 보내지 않고, 금액 범위·날짜·전화번호 줄은 보냄(+82 전화도 가림)', () => {
  const r = makeRedactor();
  assert.equal(r.line('보호자 외국인등록번호 850305-5123456'), null);
  assert.equal(r.line('학생 외국인등록번호 120305-7123456'), null);
  assert.equal(r.line('주민번호 080101-3123456'), null);
  assert.equal(r.line('환불 계좌: 국민은행 123456-01-234567 (예금주 김하늘)'), null);
  assert.equal(r.line('입금 123456-01-234567 로 보내 주세요'), null);
  assert.ok(r.line('강사비 300000-1500000원 범위'), '금액 범위');
  assert.equal(r.line('2026-11-15까지 제출').text, '2026-11-15까지 제출');
  const p = r.line('문의 010-1234-5678, +82 10-9876-5432');
  assert.ok(p && !/1234-5678|9876-5432/.test(p.text), JSON.stringify(p));
  assert.equal(r.back(p.text), '문의 010-1234-5678, +82 10-9876-5432');
});

test('[rd-bad] 없는 번호·깨진 자리 표시가 남은 글을 알아봄(되돌린 글에 섞이지 않게)', () => {
  const r = makeRedactor();
  r.line('담당 이바다 선생님(010-1111-2222)');
  assert.equal(r.bad('〔이름1〕 선생님 {{1}}'), false);
  assert.equal(r.bad('그대로인 글'), false);
  for (const t of ['〔이름9〕 선생님', '{{7}}', '{{1', '{{1}', '[이름1] 선생님', '〔이름１〕', '〔이름 〕']) assert.equal(r.bad(t), true, t);
});
