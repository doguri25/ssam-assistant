// 파일 칸 끌어 놓기 (core/file-drop.js): 칸이 받는 파일인지(accept) · 안내 글에 쓸 파일 종류 이름
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accepts, kinds } from '../../web/core/file-drop.js';

const f = (name, type = '') => ({ name, type });

test('accept가 비면 모든 파일을 받음', () => {
  assert.equal(accepts(f('a.zip'), ''), true);
  assert.equal(accepts(f('a.zip'), undefined), true);
});

test('확장자는 대소문자를 가리지 않고 끝이 맞아야 받음', () => {
  const acc = '.hwpx,.hwp,.pdf';
  assert.equal(accepts(f('양식.HWPX'), acc), true);
  assert.equal(accepts(f('계획서.hwp'), acc), true);
  assert.equal(accepts(f('사진.jpg', 'image/jpeg'), acc), false);
  assert.equal(accepts(f('hwp'), acc), false); // 이름에 점 없이 hwp만 있으면 아님
});

test('MIME(image/*·application/json)도 받음', () => {
  assert.equal(accepts(f('scan', 'image/png'), 'image/*'), true);
  assert.equal(accepts(f('backup.txt', 'application/json'), '.json,application/json'), true);
  assert.equal(accepts(f('x.txt', 'text/plain'), '.json,application/json'), false);
});

test('kinds: 확장자를 선생님이 아는 이름으로 묶음(겹치면 한 번)', () => {
  assert.equal(kinds('.hwpx,.hwp'), '한글');
  assert.equal(kinds('.hwp,.hwpx,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.heic'), '한글·PDF·워드·글(.txt)·사진');
  assert.equal(kinds('.xlsx,.csv,.xls'), '엑셀·CSV');
  assert.equal(kinds('.json,application/json'), '백업(.json)');
  assert.equal(kinds(''), '');
});
