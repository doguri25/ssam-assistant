// 개인정보 줄 빼기: 이름이 셋 이상 늘어선 줄(명단·담임 표), 전화번호 줄
import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeName, stripNames } from '../../web/core/privacy.js';

test('이름 모양: 2~4글자 한글, 흔한 성으로 시작', () => {
  assert.equal(looksLikeName('김가람'), true);
  assert.equal(looksLikeName('남궁'), true);
  assert.equal(looksLikeName('국어'), true); // 「국」도 성 — 줄 단위로 셋 이상일 때만 뺌
  assert.equal(looksLikeName('행복'), false);
  assert.equal(looksLikeName('학급 실태'), false);
  assert.equal(looksLikeName('A반'), false);
});

test('명단·담임 표·전화번호 줄은 빼고 몇 줄 뺐는지 알려 줌', () => {
  const src = ['1. 학급 실태', '담임명 | 김가람 | 이나래 | 박다솜', '우리 반은 남 13명 여 12명이다.', '보호자 연락: 010-1234-5678', '교과 | 국어 | 수학 | 사회', '정다온, 최하늘, 윤바다, 장새봄'].join('\n');
  const r = stripNames(src);
  assert.equal(r.dropped, 3);
  assert.deepEqual(r.text.split('\n'), ['1. 학급 실태', '우리 반은 남 13명 여 12명이다.', '교과 | 국어 | 수학 | 사회']);
});

test('두 글자 낱말 줄(교과·학습 낱말)과 흔한 세 글자 낱말 줄은 남김', () => {
  const src = ['안전 | 정리 | 문장 | 우리', '이야기 | 도서관 | 우리반 | 공동체'].join('\n');
  assert.deepEqual(stripNames(src), { text: src, dropped: 0 });
});

test('빈 글', () => { assert.deepEqual(stripNames(''), { text: '', dropped: 0 }); });
