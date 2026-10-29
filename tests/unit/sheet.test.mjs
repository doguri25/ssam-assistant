// 견적서 표 읽기: CSV(따옴표·EUC-KR), xlsx(공유 문자열·숫자·인라인·빈 칸), 품목 찾기
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeText, readCsv, readXlsx, readTable, findItems } from '../../web/core/sheet.js';
import { zipStore } from '../../web/core/zip.js';

test('CSV: 따옴표 안 쉼표와 "" 그리고 CRLF', () => {
  const rows = readCsv('품명,규격,수량,단가\r\n"비커, 유리",500ml,2,"3,000"\r\n"말 ""큰"" 자",,1,500\n');
  assert.deepEqual(rows[1], ['비커, 유리', '500ml', '2', '3,000']);
  assert.deepEqual(rows[2], ['말 "큰" 자', '', '1', '500']);
  assert.equal(rows.length, 3);
});

test('글자 판별: UTF-8(BOM 포함)과 EUC-KR', () => {
  assert.equal(decodeText(new Uint8Array([0xc7, 0xb0, 0xb8, 0xed, 0x2c, 0xbc, 0xf6, 0xb7, 0xae])), '품명,수량');
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('품명')])), '품명');
});

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
function miniXlsx() {
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="견적" sheetId="1" r:id="rId7"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/견적.xml"/></Relationships>' },
    { name: 'xl/sharedStrings.xml', data: `<?xml version="1.0"?><sst ${NS}><si><t>품명</t></si><si><r><t>비</t></r><r><rPr><b/></rPr><t>커</t></r></si><si><t xml:space="preserve"> A&amp;B </t></si></sst>` },
    { name: 'xl/worksheets/견적.xml', data: `<?xml version="1.0"?><worksheet ${NS}><sheetData>`
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>인라인</t></is></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>3000</v></c><c r="C2" t="s"><v>2</v></c></row>'
      + '<row r="4"><c r="C4" t="str"><v>식</v></c></row>'
      + '</sheetData></worksheet>' }
  ]);
}

test('xlsx: 첫 시트(관계 파일로 찾음), 공유 문자열·숫자·인라인·빈 칸·빈 줄', async () => {
  const rows = await readXlsx(miniXlsx());
  assert.deepEqual(rows[0], ['품명', '', '인라인']);
  assert.deepEqual(rows[1], ['비커', '3000', ' A&B ']);
  assert.deepEqual(rows[2], []);
  assert.deepEqual(rows[3], ['', '', '식']);
});

test('readTable: 확장자로 고름, 모르는 형식은 오류', async () => {
  assert.equal((await readTable('견적.XLSX', miniXlsx()))[1][0], '비커');
  assert.equal((await readTable('a.csv', new TextEncoder().encode('a,b\n1,2')))[1][1], '2');
  await assert.rejects(readTable('a.hwp', new Uint8Array(1)), /UNSUPPORTED/);
});

test('품목 찾기: 머리줄이 아래에 있고 합계·빈 줄이 섞이고 금액만 있음', () => {
  const rows = [['견 적 서'], ['업체명: 가나상사', '', '', ''], [], ['품 명', '규격', '수량', '금액'],
    ['비커', '500ml', '4', '18,000'], ['', '', '', ''], ['유리 막대', '30cm', '', '1,200'],
    ['소계', '', '', '19,200'], ['합계', '', '', '19,200'], ['부가세(VAT)', '', '', '1,920']];
  assert.deepEqual(findItems(rows), [{ name: '비커', spec: '500ml', qty: 4, price: 4500 }, { name: '유리 막대', spec: '30cm', qty: 1, price: 1200 }]);
});

test('품목 찾기: 단가(원) 열, 규격 없음', () => {
  assert.deepEqual(findItems([['품목', '수량', '단가(원)', '금액'], ['A4 용지', '10', '25,000원', '250,000']]), [{ name: 'A4 용지', spec: '', qty: 10, price: 25000 }]);
});

test('머리줄을 못 찾으면 빈 목록', () => {
  assert.deepEqual(findItems([['아무', '글'], ['1', '2']]), []);
  assert.deepEqual(findItems([]), []);
});
