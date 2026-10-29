// 한글 파일(.hwpx) 쓰기: 담는 파일, mimetype 규칙, 글자 이스케이프, 표
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHwpx } from '../../web/core/hwpx.js';
import { unzip } from '../../web/core/zip.js';

const DOC = { title: '시험 <품의>', blocks: [{ type: 'h', text: '1. 산출 내역' }, { type: 'p', text: 'A & B\n둘째 줄' }, { type: 'table', head: true, rows: [['품명', '금액'], ['비커', '6000']] }] };
const dec = u => new TextDecoder().decode(u);

test('담는 파일과 순서, mimetype은 맨 앞·무압축', async () => {
  const u8 = makeHwpx(DOC);
  const m = await unzip(u8);
  const names = [...m.keys()];
  assert.equal(names[0], 'mimetype');
  assert.equal(dec(m.get('mimetype')), 'application/hwp+zip');
  for (const n of ['version.xml', 'META-INF/container.xml', 'META-INF/container.rdf', 'META-INF/manifest.xml', 'Contents/content.hpf', 'Contents/header.xml', 'Contents/section0.xml', 'settings.xml', 'Preview/PrvText.txt'])
    assert.ok(names.includes(n), n + ' 없음');
  const dv = new DataView(u8.buffer, u8.byteOffset);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint16(8, true), 0, 'mimetype 무압축');
  assert.equal(dv.getUint16(28, true), 0, 'mimetype extra 길이 0');
});

test('본문: 이스케이프, 문단, 표 하나 2×2', async () => {
  const m = await unzip(makeHwpx(DOC));
  const sec = dec(m.get('Contents/section0.xml'));
  assert.ok(sec.includes('시험 &lt;품의&gt;'));
  assert.ok(sec.includes('A &amp; B'));
  assert.ok(sec.includes('둘째 줄'));
  assert.equal((sec.match(/<hp:tbl /g) || []).length, 1);
  assert.match(sec, /rowCnt="2"/); assert.match(sec, /colCnt="2"/);
  assert.ok(sec.includes('<hp:secPr'));
  assert.ok(dec(m.get('Preview/PrvText.txt')).includes('비커'));
  assert.ok(dec(m.get('Contents/content.hpf')).includes('시험 &lt;품의&gt;'));
  // 한글이 만든 파일과 같은 모양: 문단 여백은 hp:switch 안, 끝은 trackchageConfig(한컴 철자)
  const head = dec(m.get('Contents/header.xml'));
  assert.ok(head.includes('<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">'));
  assert.ok(head.includes('<hh:trackchageConfig flags="56"/></hh:head>'));
});

test('쪽 나누기: break 다음 문단이 새 쪽에서 시작', async () => {
  const m = await unzip(makeHwpx({ title: 't', blocks: [{ type: 'p', text: 'a' }, { type: 'break' }, { type: 'p', text: 'b' }, { type: 'break' }, { type: 'table', rows: [['c']] }] }));
  const sec = dec(m.get('Contents/section0.xml'));
  assert.equal((sec.match(/pageBreak="1"/g) || []).length, 2);
  assert.match(sec, /<hp:p [^>]*pageBreak="1"[^>]*><hp:run charPrIDRef="0"><hp:t>b<\/hp:t>/);
  assert.match(sec, /<hp:p [^>]*pageBreak="1"[^>]*><hp:run charPrIDRef="0"><hp:tbl /);
});

test('표의 칸 수가 줄마다 달라도 가장 긴 줄에 맞춤', async () => {
  const m = await unzip(makeHwpx({ title: 't', blocks: [{ type: 'table', rows: [['a', 'b', 'c'], ['d']] }] }));
  const sec = dec(m.get('Contents/section0.xml'));
  assert.match(sec, /colCnt="3"/);
  assert.equal((sec.match(/<hp:tc /g) || []).length, 6);
});
