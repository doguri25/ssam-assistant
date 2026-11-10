// 기타 버그 찾기(2026-11-10): 인수인계서 글에서 괄호 속 전화번호를 빼면 「)」가 남던 것, 전화번호 바로 옆 이름(연락할 사람)이 남던 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText } from '../../web/menus/etc/handover-model.js';

test('괄호 속 전화번호를 빼도 괄호가 깨지지 않음(「교무실)」이 되지 않게)', () => {
  assert.equal(cleanText('문의 교무실(031-123-4567)'), '문의 교무실');
  assert.equal(cleanText('도시락은 행정실(031-123-4567)로 주문'), '도시락은 행정실로 주문');
  assert.equal(cleanText('버스 예약 (02)123-4567 확인'), '버스 예약 확인');
  assert.equal(cleanText('독서 홍보 (문의 02-123-4567, a@b.kr)'), '독서 홍보');
});

test('전화번호 바로 앞뒤의 이름(연락할 사람)은 ○○○로', () => {
  assert.equal(cleanText('버스 업체 박하늘(010-1234-5678)에게 연락'), '버스 업체 ○○○에게 연락');
  assert.equal(cleanText('회신: 이나래 010-1234-5678'), '회신: ○○○');
  assert.equal(cleanText('체험학습 업체 연락처 010-1234-5678 (김가람)'), '체험학습 업체 (○○○)');
  assert.equal(cleanText('문의: 과학과 최하은 장학사(02-123-4567)'), '문의: 과학과 ○○○ 장학사');
  // 부서·곳 이름은 그대로
  assert.equal(cleanText('행정실 031-123-4567 문의'), '행정실 문의');
  assert.equal(cleanText('과학실 예약 02-123-4567'), '과학실 예약');
});
