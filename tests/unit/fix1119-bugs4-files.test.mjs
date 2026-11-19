/* 2026-11-19 네 번째 버그 찾기 — 파일 읽기·AI 답 처리. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const fileOf = (name, u8) => ({ name, arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });

test('워드(.docx): 글상자 글은 한 번, 변경 추적으로 지운 글·필드 코드는 빼고 읽음', async () => {
  const { zipStore } = await import('../../web/core/zip.js');
  const { readText } = await import('../../web/core/files.js');
  const p = t => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
  const box = t => `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wps:wsp><wps:txbx><w:txbxContent>${p(t)}</w:txbxContent></wps:txbx></wps:wsp></w:drawing></mc:Choice>`
    + `<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent>${p(t)}</w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
  const del = '<w:p><w:r><w:t xml:space="preserve">일시: </w:t></w:r><w:del w:id="1" w:author="a"><w:r><w:delText>2025. 3. 4.</w:delText></w:r></w:del><w:ins w:id="2" w:author="a"><w:r><w:t>2026. 3. 3.</w:t></w:r></w:ins></w:p>';
  const fld = '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGEREF _Toc15 \\h </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1. 목적 3</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
  const doc = `<w:document><w:body>${p('학부모 상담 주간 안내')}${box('가정통신문 제2026-15호')}${del}${fld}${p('끝.')}</w:body></w:document>`;
  const t = await readText(fileOf('안내.docx', zipStore([{ name: 'word/document.xml', data: doc }])));
  assert.equal(t.split('가정통신문 제2026-15호').length - 1, 1, t);
  assert.ok(t.includes('일시: 2026. 3. 3.') && !t.includes('2025'), t);
  assert.ok(!/PAGEREF|_Toc/.test(t) && t.includes('1. 목적 3'), t);
});

test('엑셀(.xlsx): 날짜·시각 서식 칸은 날짜로 — 구글 폼 응답 .xlsx의 제출일이 CSV와 같게', async () => {
  const { zipStore } = await import('../../web/core/zip.js');
  const { readTable } = await import('../../web/core/sheet.js');
  const T = await import('../../web/menus/training/training-model.js');
  const sst = '<sst><si><t>타임스탬프</t></si><si><t>성명</t></si><si><t>김하늘</t></si></sst>';
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" s="1"><v>46345.633333333331</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" s="2"><v>46345</v></c><c r="D2" s="3"><v>15000</v></c><c r="E2" s="4"><v>0.375</v></c><c r="F2" s="5"><v>1.5</v></c><c r="G2"><v>46345</v></c></row></sheetData></worksheet>';
  const styles = '<styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy&quot;. &quot;m&quot;. &quot;d AM/PM h:mm:ss"/><numFmt numFmtId="165" formatCode="#,##0&quot;원&quot;"/></numFmts>'
    + '<cellXfs count="6"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="14"/><xf numFmtId="165"/><xf numFmtId="20"/><xf numFmtId="46"/></cellXfs></styleSheet>';
  const rows = await readTable('응답.xlsx', zipStore([{ name: 'xl/sharedStrings.xml', data: sst }, { name: 'xl/styles.xml', data: styles }, { name: 'xl/worksheets/sheet1.xml', data: sheet }]));
  assert.deepEqual(rows[1], ['2026-11-19 15:12', '김하늘', '2026-11-19', '15000', '09:00', '36:00', '46345']);
  const b = { staff: [{ id: 's1', name: '김하늘', dept: '', kind: '교원' }], courses: [{ id: 'c1', title: '청렴 교육', target: '' }], marks: {} };
  assert.equal(T.formResponses(rows, b).hits[0].date, '2026-11-19');
});

test('.txt·.csv: UTF-16(메모장 「유니코드」·엑셀 「유니코드 텍스트」)도 바르게, UTF-8·EUC-KR은 그대로', async () => {
  const { readText } = await import('../../web/core/files.js');
  const { readTable, decodeText } = await import('../../web/core/sheet.js');
  const u16 = (s, bom = true, be = false) => {
    const o = bom ? 2 : 0, u = new Uint8Array(o + s.length * 2);
    if (bom) { u[0] = be ? 0xFE : 0xFF; u[1] = be ? 0xFF : 0xFE; }
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); u[o + 2 * i + (be ? 1 : 0)] = c & 255; u[o + 2 * i + (be ? 0 : 1)] = c >> 8; }
    return u;
  };
  const s = '번호\t이름\n1\t김하늘\n2\t이바다';
  assert.equal(await readText(fileOf('명렬표.txt', u16(s))), s);
  assert.equal(decodeText(u16(s, true, true)), s);
  assert.equal(decodeText(u16('1,2,3\n4,5,6', false)), '1,2,3\n4,5,6');
  assert.deepEqual(await readTable('명단.csv', u16('번호,이름\r\n1,김하늘\r\n')), [['번호', '이름'], ['1', '김하늘']]);
  assert.equal(decodeText(new TextEncoder().encode(s)), s);
  // EUC-KR 「김하늘」
  assert.equal(decodeText(new Uint8Array([0xB1, 0xE8, 0xC7, 0xCF, 0xB4, 0xC3])), '김하늘');
});

test('AI 답 JSON: 뒤 설명의 「{{1}}」·앞 머리 「[출력]」이 있어도 짝 괄호로 읽음', async () => {
  const { parseJSON } = await import('../../web/core/ai.js');
  assert.deepEqual(parseJSON('{"changes":[{"id":3,"text":"고침 {{1}}"}],"note":"3줄"}\n\n참고: {{1}} 자리 표시는 그대로 두었습니다.'), { changes: [{ id: 3, text: '고침 {{1}}' }], note: '3줄' });
  assert.deepEqual(parseJSON('[출력]\n{"items":[{"i":1}]}'), { items: [{ i: 1 }] });
  assert.deepEqual(parseJSON('{"t":"그는 \\"}\\" 를 썼다"} 끝 }'), { t: '그는 "}" 를 썼다' });
  assert.deepEqual(parseJSON('[[1],[2]] 설명 [x]'), [[1], [2]]);
  assert.equal(parseJSON('{"a":1'), null);
});
