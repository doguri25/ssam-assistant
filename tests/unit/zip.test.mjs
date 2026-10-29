// zip: 확인값(CRC-32), 무압축 쓰기, 무압축·deflate 풀기
import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, zipStore, unzip } from '../../web/core/zip.js';

const enc = s => new TextEncoder().encode(s);
const dec = u => new TextDecoder().decode(u);

test('crc32 표준값', () => {
  assert.equal(crc32(enc('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('zipStore로 쓴 것을 unzip하면 그대로', async () => {
  const z = zipStore([{ name: 'a.txt', data: '가나다' }, { name: 'dir/b.bin', data: new Uint8Array([0, 1, 2, 255]) }]);
  const m = await unzip(z);
  assert.deepEqual([...m.keys()], ['a.txt', 'dir/b.bin']);
  assert.equal(dec(m.get('a.txt')), '가나다');
  assert.deepEqual([...m.get('dir/b.bin')], [0, 1, 2, 255]);
});

test('deflate로 압축한 항목도 풂', async () => {
  const raw = enc('압축 '.repeat(200));
  const comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  // 무압축으로 만든 뒤 그 항목만 deflate로 바꿔 끼움
  const name = enc('c.txt');
  const local = new Uint8Array(30 + name.length + comp.length), dv = new DataView(local.buffer);
  dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 8, true);
  dv.setUint32(14, crc32(raw), true); dv.setUint32(18, comp.length, true); dv.setUint32(22, raw.length, true); dv.setUint16(26, name.length, true);
  local.set(name, 30); local.set(comp, 30 + name.length);
  const cen = new Uint8Array(46 + name.length), cv = new DataView(cen.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(10, 8, true);
  cv.setUint32(16, crc32(raw), true); cv.setUint32(20, comp.length, true); cv.setUint32(24, raw.length, true); cv.setUint16(28, name.length, true);
  cv.setUint32(42, 0, true); cen.set(name, 46);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, cen.length, true); ev.setUint32(16, local.length, true);
  const all = new Uint8Array(local.length + cen.length + end.length);
  all.set(local, 0); all.set(cen, local.length); all.set(end, local.length + cen.length);
  const m = await unzip(all);
  assert.equal(dec(m.get('c.txt')), '압축 '.repeat(200));
});

test('zip이 아니면 오류', async () => {
  await assert.rejects(unzip(enc('그냥 글')), /NOT_ZIP/);
});
