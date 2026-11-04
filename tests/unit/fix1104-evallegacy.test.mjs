// 평가 옛 화면(평가지 채점)·한꺼번에 넣기 고침 (11월 4일): 글자층 학생 스캔 알아보기, 정답·교사용 이름의 파일 쪽 표시
// 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanLike, pickRoles } from '../../web/core/bundle.js';

const KIDS = ['김민수', '이서연', '박지훈', '최하은'];

test('[gr-bundle-ocr-privacy] 쌍점 없이 「이름 김민수」가 적힌 글자층 스캔은 4쪽이어도 학생 스캔(번호·이름 줄 먼저, 제목 먼저 모두)', () => {
  const noFirst = KIDS.map((n, i) => ({ text: `3학년 2반 ${i + 5}번 이름 ${n} 3학년 수학 수행평가 곱셈 1. 23 x 4 를 계산하고 까닭을 쓰시오. 답 92` }));
  assert.equal(scanLike(noFirst), true);
  const titleFirst = KIDS.map((n, i) => ({ text: `3학년 수학 수행평가 곱셈 3학년 2반 ${i + 5}번 이름 ${n} 1. 23 x 4 를 계산하고 까닭을 쓰시오.` }));
  assert.equal(scanLike(titleFirst), true);
  assert.equal(scanLike(titleFirst.slice(0, 2)), true);
});

test('[gr-bundle-ocr-privacy] 인쇄본 머리(「이름 날짜」·「이름 정답」·빈 이름 칸)는 이름이 적힌 것으로 보지 않음', () => {
  const printed = [1, 2].map(() => ({ text: '물의 여행 그리기 (12~13쪽) 반 번 이름 날짜 1. 물이 여행하는 길을 그려 봅시다.' }));
  assert.equal(scanLike(printed), false);
  assert.equal(scanLike([{ text: '곱셈 평가 이름 정답 1. 92' }, { text: '곱셈 평가 이름 정답 2. 128' }]), false);
  assert.equal(scanLike([{ text: '곱셈 평가 반 번 이름 1. 23 x 4' }, { text: '곱셈 평가 반 번 이름 2. 32 x 4' }]), false);
  assert.equal(scanLike([{ text: '곱셈 평가 이름 교사용 1. 92' }, { text: '곱셈 평가 이름 학생용 1. 23 x 4' }]), false);
});

test('[gr-bundle-ocr-privacy] 정답·교사용 이름의 파일에서 온 글자층 쪽(keyFile)은 표시 글이 없어도 정답·교사용', () => {
  assert.deepEqual(pickRoles([{ ocr: true, keyFile: true, text: '1. 456 2. 곱셈을 두 번 했어요 3. 128 4. 나눗셈' }, { ocr: true, text: '3학년 2반 5번 이름 김민수 1. 92' }]), ['teacher', 'student']);
});
