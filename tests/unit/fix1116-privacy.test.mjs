/* 2026-11-16 버그 찾기 고침 — 이름 가리기(문서 다듬기·회의록이 쓰는 core/redact.js·privacy.js·chat-names.js)와 글만 읽은 문서의 표.
   이름은 모두 지어낸 것(김하늘·이바다·한가람·박솔빛) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskJosaNames, maskStaff } from '../../web/core/privacy.js';
import { maskPersons } from '../../web/core/chat-names.js';
import { makeRedactor } from '../../web/core/redact.js';
import { startItems, payloadOf } from '../../web/menus/etc/docedit-model.js';

const L = (text, inBox = false) => ({ text, inBox });
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '김민준'];
const leaks = s => NAMES.filter(n => String(s).includes(n));

test('[fix1116-privacy-C1] 이름 뒤에 「로·으로(부터)」가 붙어도 가림 — 요청·문서 줄 모두, 되돌리면 원래 글', () => {
  const doc = ['가. 담당: 교무부장 김하늘 선생님', '나. 학생회장 선출 결과 안내'].map(t => L(t));
  for (const ask of ['김하늘을 이바다로 바꿔 줘', '담당자를 한가람으로 바꿔 줘', '담당자 이름을 이바다로 고쳐 줘']) {
    const p = payloadOf(startItems(doc), ask);
    assert.deepEqual(leaks(p.ask), [], `${ask} → ${p.ask}`);
    assert.equal(p.back(p.ask), ask, '되돌림');
  }
  const p = payloadOf(startItems(doc), '김하늘을 이바다로 바꿔 줘');
  assert.equal(p.ask, '〔이름1〕을 〔이름2〕로 바꿔 줘', '문서의 김하늘과 같은 번호');
  for (const l of ['학생회장은 김하늘로 정함.', '대표 학생을 이바다로 뽑았다.', '반장은 김민준으로 정했다.', '김민준으로부터 연락이 옴', '김하늘님으로 바뀜']) {
    const r = makeRedactor(), out = r.line(l);
    assert.deepEqual(leaks(out.text), [], `${l} → ${out.text}`);
    assert.equal(r.back(out.text), l);
  }
  // 채팅·행특 메모 쪽(maskPersons)도 「~으로」
  assert.equal(maskPersons('반장은 김민준으로 정했어').text, '반장은 ○○○으로 정했어');
  assert.equal(maskPersons('회장을 이서연으로 바꿈').text, '회장을 ○○○으로 바꿈');
});

test('[fix1116-privacy-C1-neg] 「로·으로」가 붙은 흔한 낱말(곳·방법·차례)은 그대로', () => {
  const plain = ['강당으로 모입니다', '현장으로 이동함', '정문으로 들어와요', '학교로 갑니다', '김치로 담근 반찬', '기본적으로 지킵니다',
    '구체적으로 적어 주세요', '마지막으로 정리함', '도서관으로 가요', '주차장으로 안내', '방송실로 와 주세요', '고속도로로 이동', '이메일로 보내 주세요',
    '기념품으로 줌', '문의 전화로 받음', '담당 강당으로 옮김', '강사 경력으로 봄', '한마음으로 응원', '이야기로 풀어 감', '구성원으로 참여', '유치원으로 감',
    '전체적으로 좋음', '정기적으로 점검', '모둠별로 발표', '연구부로 제출', '운동장으로 나감'];
  for (const l of plain) {
    assert.equal(maskJosaNames(l).text, l, `josa: ${l}`);
    assert.equal(maskStaff(l).text, l, `staff: ${l}`);
    assert.equal(maskPersons(l).text, l, `persons: ${l}`);
    const r = makeRedactor();
    assert.equal(r.line(l).text, l, `redact: ${l}`);
    assert.deepEqual(r.names, [], l);
  }
  // 받침과 맞지 않는 꼴(「강당으」+「로」)로 자르지 않음
  assert.equal(maskJosaNames('학생 강당으로 이동').text, '학생 강당으로 이동');
});
