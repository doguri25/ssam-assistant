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
  assert.deepEqual(stripNames(src), { text: src, dropped: 0, masked: 0 });
});

test('조사가 붙은 낱말이 많은 문장·표 줄은 남김 (진도표의 학습 주제 등)', () => {
  const src = ['우리가 방법을 정하고 장소를 고르며 문장을 다듬기', '지킴이 | 공동체 | 모두가 함께 지구를 지켜요 | 3/12 | 40~41'].join('\n');
  assert.deepEqual(stripNames(src), { text: src, dropped: 0, masked: 0 });
});

test('한 줄에 이름이 하나인 표(임원·학생 명단)는 이름 칸을 ○○○로 가림', () => {
  const src = ['직책 | 이름', '회장 | 김가람', '부회장 | 이나래', '서기 | 박다솜', '번호 | 이름 | 성별', '1 | 정다온 | 남', '2 | 최하늘 | 여', '3 | 윤바다 | 남'].join('\n');
  const r = stripNames(src);
  for (const n of ['김가람', '이나래', '박다솜', '정다온', '최하늘', '윤바다']) assert.ok(!r.text.includes(n), n);
  assert.ok(r.text.includes('회장 | ○○○') && r.text.includes('1 | ○○○ | 남'), r.text);
  assert.equal(r.dropped, 0);
  assert.equal(r.masked, 6);
});

test('조사 끝 같은 이름(김준형·이태한), 이름이 60%가 안 되는 담임 표, 직책 옆 이름, PDF 번호 명단도 가리거나 뺌', () => {
  const src = ['담임 | 김준형 | 이태한 | 박서연 | 최지우', '담임 | 김가람 | 이나래 | 박다솜 | 영어 전담 | 최하늘 | 체육 전담 | 정다온',
    '임원: 회장 김가람, 부회장 이나래', '1 김가람 남', '2 이나래 여', '3 박다솜 여'].join('\n');
  const r = stripNames(src);
  for (const n of ['김준형', '이태한', '박서연', '최지우', '김가람', '이나래', '박다솜', '최하늘', '정다온']) assert.ok(!r.text.includes(n), n + ' / ' + r.text);
});

test('진도표 표 줄의 세 글자 낱말(지킴이·주인공)은 가리지 않음', () => {
  const src = ['단원 | 주제 | 차시', '지킴이 | 우리 고장 지키기 | 1/3', '주인공 | 인물의 마음 | 2/3', '기념일 | 기념일 알기 | 3/3', '유형 | □학생주도형 □지역 연계형'].join('\n');
  assert.deepEqual(stripNames(src), { text: src, dropped: 0, masked: 0 });
});

test('빈 글', () => { assert.deepEqual(stripNames(''), { text: '', dropped: 0, masked: 0 }); });
