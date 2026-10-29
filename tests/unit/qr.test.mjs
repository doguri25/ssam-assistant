// QR: 오류 정정 부호(표준 예), 형식 정보, 자리 표시 무늬, 우리 해석기로 다시 읽기
import test from 'node:test';
import assert from 'node:assert/strict';
import { rsEncode, formatBits, qrMatrix, decodeMatrix } from '../../web/core/qr.js';

test('리드-솔로몬: 1-Q HELLO WORLD 표준 예', () => {
  assert.deepEqual(rsEncode([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236], 13), [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
});

test('형식 정보 15비트', () => {
  assert.equal(formatBits('M', 0), '101010000010010');
  assert.equal(formatBits('L', 0), '111011111000100');
  assert.equal(formatBits('H', 7), '000100000111011');
});

const finder = (m, r, c) => {
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
    const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
    if (m[r + i][c + j] !== (ring !== 2)) return false;
  }
  return true;
};

test('자리 표시 무늬: 버전 2(25칸)', () => {
  const m = qrMatrix('https://forms.gle/abc123');
  assert.equal(m.length, 25);
  assert.ok(finder(m, 0, 0) && finder(m, 0, 18) && finder(m, 18, 0), '찾기 무늬');
  for (let i = 8; i < 17; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[4 * 2 + 9][8], true, '어두운 점');
});

test('여러 길이·한글을 다시 읽으면 같은 글', () => {
  const texts = ['a', 'https://forms.gle/AbC', 'x'.repeat(50), 'https://docs.google.com/forms/d/e/1FAIpQLSf' + 'k'.repeat(80) + '/viewform', '가을 운동회 설문 '.repeat(14).slice(0, 80)];
  for (const t of texts) {
    const m = qrMatrix(t);
    assert.equal(decodeMatrix(m), t, `${t.length}자`);
  }
  // 버전 7 이상(버전 정보 포함)도
  const long = 'q'.repeat(200);
  const m7 = qrMatrix(long);
  assert.ok(m7.length >= 45, '크기 ' + m7.length);
  assert.equal(decodeMatrix(m7), long);
});

test('너무 길면 오류', () => {
  assert.throws(() => qrMatrix('x'.repeat(272)), /QR_TOO_LONG/);
});
