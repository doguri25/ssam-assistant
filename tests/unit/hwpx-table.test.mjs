// 학교 한글 양식(.hwpx) 표 읽기·채우기(스펙 2026-11-11 기초학력 캠프 「학교 한글 양식 표 채우기」)
// makeHwpx로 만든 표, 손으로 쓴 양식(결재란 표 + 날짜 칸이 세 교시를 묶은 표 + 「계」 줄의 합친 칸), 줄이 모자라거나 남을 때, 깨진 파일 — 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHwpx } from '../../web/core/hwpx.js';
import { unzip, zipStore } from '../../web/core/zip.js';
import { scanXml, checkXml } from '../../web/core/hwpx-form.js';
import { readTables, pickTable, fillTable } from '../../web/core/hwpx-table.js';

const dec = u8 => new TextDecoder().decode(u8);
const secOf = async (bytes, n = 0) => dec((await unzip(bytes)).get(`Contents/section${n}.xml`));
const local = n => n.name.replace(/^.*:/, '');
function* walk(n) { for (const k of n.kids) { yield k; yield* walk(k); } }
/* 구역 XML의 표 요소들(문서 차례) */
const tblNodes = xml => [...walk(scanXml(xml))].filter(n => local(n) === 'tbl');
const tblXml = (xml, i) => { const n = tblNodes(xml)[i]; return xml.slice(n.s, n.e); };
/* 표 XML → 줄마다 [{ col, row, colSpan, rowSpan, height }] */
const cellsOf = tbl => [...tbl.matchAll(/<hp:tr>([\s\S]*?)<\/hp:tr>/g)].map(m => [...m[1].matchAll(/<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"\/><hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"\/><hp:cellSz width="\d+" height="(\d+)"\/>/g)]
  .map(c => ({ col: +c[1], row: +c[2], colSpan: +c[3], rowSpan: +c[4], height: +c[5] })));
const attrOf = (tag, a) => +new RegExp(`\\b${a}="(\\d+)"`).exec(tag)[1];
const code = c => e => e && e.code === c;

/* ---------- makeHwpx로 만든 양식 ---------- */
const HEAD = ['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)'];
const blank = n => ['' + n, '', '', '', '', ''];
const MAIN = { type: 'table', head: true, rows: [HEAD, blank(1), blank(2), blank(3), ['계', '', '', '', '', '']] };
const DOC1 = { title: '교과캠프 수업 확인서', blocks: [{ type: 'p', text: '지도교사 : ' }, MAIN, { type: 'p', text: '지도 시간: 총 (   )시간' }] };
const DOC2 = { title: '교과캠프 수업 확인서', blocks: [{ type: 'table', rows: [['계(담당자)', '교감', '교장'], ['', '', '']] }, { type: 'p', text: '지도교사 : ' }, MAIN] };
const ROWS = [
  ['1', '1/8(목)', '09:00~09:40', '국어', '낱말 읽기', ''],
  ['2', '', '09:45~10:25', '수학', '두 자리 수 덧셈', ''],
  ['3', '', '10:30~11:10', '국어', '문장 따라 쓰기', ''],
  ['4', '1/9(금)', '09:00~09:40', '수학', '받아올림 있는 덧셈', ''],
  ['5', '', '09:45~10:25', '국어', '그림 보고 이야기하기', '']
];

test('표 읽기: 표마다 칸 글 격자·줄 수·칸 수(문서 차례), 표 밖 문단 글', async () => {
  const { tables, texts } = await readTables(makeHwpx(DOC2));
  assert.equal(tables.length, 2);
  assert.deepEqual(tables.map(t => [t.index, t.rowCnt, t.colCnt]), [[0, 2, 3], [1, 5, 6]]);
  assert.deepEqual(tables[0].rows, [['계(담당자)', '교감', '교장'], ['', '', '']]);
  assert.deepEqual(tables[1].rows, [HEAD, blank(1), blank(2), blank(3), ['계', '', '', '', '', '']]);
  assert.ok(texts.includes('교과캠프 수업 확인서'));
  assert.ok(texts.some(t => t.startsWith('지도교사 :')));
  assert.ok(!texts.includes('교감') && !texts.includes('순'), '표 칸 글은 texts에 없음');
});

test('표 고르기: 머리 1~2줄에 낱말이 가장 많이 든 표(빈칸 무시), 같으면 앞 표, 하나도 없으면 -1', async () => {
  const { tables } = await readTables(makeHwpx(DOC2));
  assert.equal(pickTable(tables, ['날짜', '시간', '교과', '지도']), 1);
  assert.equal(pickTable(tables, ['지도내용', '확인 (서명)']), 1, '빈칸 무시');
  assert.equal(pickTable(tables, ['교감', '교장']), 0);
  assert.equal(pickTable(tables, ['교감', '날짜']), 0, '같으면 앞 표');
  assert.equal(pickTable(tables, ['출석부']), -1);
  assert.equal(pickTable([], ['날짜']), -1);
  // 셋째 줄부터는 보지 않음
  assert.equal(pickTable([{ index: 0, rows: [['가'], ['나'], ['날짜']] }], ['날짜']), -1);
});

test('채우기(줄이 남음): 본 줄을 복제해 2줄만, 남는 빈 줄은 지우고 「계」 줄은 그대로, rowAddr·rowCnt 다시 매김', async () => {
  const out = await fillTable(makeHwpx(DOC1), { table: 0, rows: ROWS.slice(0, 2) });
  assert.ok(out instanceof Uint8Array);
  const sec = await secOf(out);
  assert.doesNotThrow(() => checkXml(sec));
  const { tables } = await readTables(out);
  assert.deepEqual(tables[0].rows, [HEAD, ROWS[0], ROWS[1], ['계', '', '', '', '', '']]);
  assert.equal(tables[0].rowCnt, 4);
  const t = tblXml(sec, 0);
  assert.equal(attrOf(t, 'rowCnt'), 4);
  assert.equal(attrOf(t, 'colCnt'), 6);
  assert.deepEqual(cellsOf(t).map(r => [...new Set(r.map(c => c.row))]), [[0], [1], [2], [3]]);
  assert.equal(attrOf(/<hp:sz [^>]*>/.exec(t)[0], 'height'), 4000, '표 높이 = 줄 높이 합');
});

test('채우기(줄이 모자람): 더 복제, 칸 모양은 본 줄(머리 줄이 아님), 빠진 값은 빈칸·남는 값은 버림', async () => {
  const rows = [...ROWS, ['6', '1/12(월)', '09:00~09:40'], ['7', '', '', '', '', '', '넘치는 값']];
  const out = await fillTable(makeHwpx(DOC1), { table: 0, rows });
  const { tables } = await readTables(out);
  assert.equal(tables[0].rowCnt, 9);
  assert.deepEqual(tables[0].rows.slice(1, 8), [...ROWS, ['6', '1/12(월)', '09:00~09:40', '', '', ''], ['7', '', '', '', '', '']]);
  assert.deepEqual(tables[0].rows[8], ['계', '', '', '', '', '']);
  const t = tblXml(await secOf(out), 0);
  const trs = [...t.matchAll(/<hp:tr>[\s\S]*?<\/hp:tr>/g)].map(m => m[0]);
  assert.match(trs[0], /borderFillIDRef="4"/, '머리 줄 그대로');
  assert.ok(trs.slice(1, 8).every(r => !/borderFillIDRef="4"/.test(r) && /<hp:run charPrIDRef="0"><hp:t>/.test(r)), '데이터 줄은 본 줄 모양');
  assert.match(trs[2], /<hp:t>두 자리 수 덧셈<\/hp:t>/);
  assert.deepEqual(cellsOf(t).map(r => r[0].row), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const ids = [...(await secOf(out)).matchAll(/<hp:p id="(\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, '문단 id가 겹치지 않음');
});

test('채우기: 「계」 끝 줄 찾아 칸 쓰기(null은 그대로), 제목·지도교사·「총 (   )시간」 바꾸기, 쓴 데이터 칸은 바꾸지 않음', async () => {
  const rows = [...ROWS.slice(0, 4), ['5', '', '', '', '교과캠프 수업 확인서 참고', '']];
  const out = await fillTable(makeHwpx(DOC1), {
    table: 0, rows,
    footer: { match: /^계/, cells: [null, null, null, null, '총 5시간'] },
    replace: [['교과캠프 수업 확인서', '3-(1) 교과캠프 수업 확인서'], [/지도교사\s*:\s*$/, '지도교사 : 한가람'], [/총\s*\(\s*\)\s*시간/, '총 ( 5 )시간']]
  });
  const { tables, texts } = await readTables(out);
  assert.deepEqual(tables[0].rows[6], ['계', '', '', '', '총 5시간', '']);
  assert.equal(tables[0].rows[5][4], '교과캠프 수업 확인서 참고', '데이터 칸은 바꾸기 밖');
  assert.ok(texts.includes('3-(1) 교과캠프 수업 확인서'), texts.join(' | '));
  assert.ok(texts.includes('지도교사 : 한가람'));
  assert.ok(texts.includes('지도 시간: 총 ( 5 )시간'));
  const z = await unzip(out);
  assert.match(dec(z.get('Contents/content.hpf')), /<opf:title>3-\(1\) 교과캠프 수업 확인서<\/opf:title>/);
  const prv = dec(z.get('Preview/PrvText.txt'));
  assert.ok(prv.includes('3-(1) 교과캠프 수업 확인서') && prv.includes('두 자리 수 덧셈'), '미리 보기 글도 새 글');
  assert.deepEqual([...z.keys()], [...(await unzip(makeHwpx(DOC1))).keys()], '파일·차례 그대로');
});

test('채우기: 표 둘 중 고른 표만, 다른 표(결재란)는 그대로', async () => {
  const src = makeHwpx(DOC2), before = await secOf(src);
  const out = await fillTable(src, { table: pickTable((await readTables(src)).tables, ['날짜', '시간', '교과']), rows: ROWS.slice(0, 1) });
  const after = await secOf(out);
  assert.equal(tblXml(after, 0), tblXml(before, 0));
  const { tables } = await readTables(out);
  assert.deepEqual(tables[1].rows, [HEAD, ROWS[0], ['계', '', '', '', '', '']]);
});

test('머리 줄 수: 자동(빈 줄이 반 넘게 비거나 「1」로 시작하는 줄 앞까지), 직접 주기', async () => {
  const doc = { title: 't', blocks: [{ type: 'table', rows: [['구분', '내용', ''], ['순', '날짜', '비고'], ['', '', ''], ['', '', '']] }] };
  const a = await fillTable(makeHwpx(doc), { table: 0, rows: [['1', '1/8', '-']] });
  assert.deepEqual((await readTables(a)).tables[0].rows, [['구분', '내용', ''], ['순', '날짜', '비고'], ['1', '1/8', '-']]);
  const b = await fillTable(makeHwpx(doc), { table: 0, headRows: 1, rows: [['1', '1/8', '-'], ['2', '1/9', '']] });
  assert.deepEqual((await readTables(b)).tables[0].rows, [['구분', '내용', ''], ['1', '1/8', '-'], ['2', '1/9', '']]);
  // 날짜형 출석부: 머리 줄의 날짜 칸이 비어 있어도 첫 칸이 「순」이면 머리
  const byDay = { title: 't', blocks: [{ type: 'table', rows: [['순', '이름', '', '', '', '', '계'], ['1', '', '', '', '', '', ''], ['2', '', '', '', '', '', '']] }] };
  const d = await fillTable(makeHwpx(byDay), { table: 0, rows: [['1', '학생A', '○', '○', '/', '○', '3']], cells: [[0, 2, '1/8'], [0, 3, '1/9'], [0, 4, '1/12'], [0, 5, '1/13']] });
  assert.deepEqual((await readTables(d)).tables[0].rows, [['순', '이름', '1/8', '1/9', '1/12', '1/13', '계'], ['1', '학생A', '○', '○', '/', '○', '3']]);
  // 쓸 줄이 없으면 빈 줄 하나를 남김(다시 채울 수 있게)
  const c = await fillTable(makeHwpx(DOC1), { table: 0, rows: [] });
  assert.deepEqual((await readTables(c)).tables[0].rows, [HEAD, ['', '', '', '', '', ''], ['계', '', '', '', '', '']]);
});

/* ---------- 손으로 쓴 양식: 결재란 + 날짜 칸 rowSpan=3 + 「계」 줄 colSpan ---------- */
const LSA = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="7000" flags="393216"/></hp:linesegarray>';
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pid = 100;
const RUN = (cp, text) => (text === '' ? `<hp:run charPrIDRef="${cp}"/>` : `<hp:run charPrIDRef="${cp}"><hp:t>${xesc(text)}</hp:t></hp:run>`);
const PARA = (runs, pr = 0) => `<hp:p id="${pid++}" paraPrIDRef="${pr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runs}${LSA}</hp:p>`;
/* 칸: { t 글, c colAddr, cs colSpan, rs rowSpan, h 높이, cp 글자 모양, head } (rowAddr는 줄 차례) */
const TC = (x, r) => `<hp:tc name="" header="${x.head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${x.head ? 4 : 3}">`
  + '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
  + PARA(RUN(x.cp == null ? (x.head ? 1 : 4) : x.cp, x.t || ''), x.head ? 1 : 0) + '</hp:subList>'
  + `<hp:cellAddr colAddr="${x.c}" rowAddr="${r}"/><hp:cellSpan colSpan="${x.cs || 1}" rowSpan="${x.rs || 1}"/><hp:cellSz width="${7000 * (x.cs || 1)}" height="${x.h}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
const TBL = (rows, colCnt, height) => `<hp:tbl id="${pid++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">`
  + `<hp:sz width="${7000 * colCnt}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>`
  + '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
  + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
  + rows.map((r, ri) => `<hp:tr>${r.map(x => TC(x, ri)).join('')}</hp:tr>`).join('') + '</hp:tbl>';
const TPARA = tbl => PARA(`<hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>`);

async function handForm(body) {
  pid = 100;
  const base = await unzip(makeHwpx({ title: 'x', blocks: [] }));
  const sec0 = dec(base.get('Contents/section0.xml'));
  const NS = sec0.slice(0, sec0.indexOf('>', sec0.indexOf('<hs:sec')) + 1);
  const secPr = /<hp:secPr[\s\S]*?<\/hp:secPr><hp:ctrl>[\s\S]*?<\/hp:ctrl>/.exec(sec0)[0];
  const section = `${NS}${body(secPr)}</hs:sec>`;
  checkXml(section);
  return zipStore([...base].map(([name, data]) => ({ name, data: name === 'Contents/section0.xml' ? section : data })));
}
const D = (t, c, extra = {}) => ({ t, c, h: 1200, ...extra });
const TAIL = ' :' + ' '.repeat(10);
/* 수업 확인서: 제목(두 조각) · 결재란 표 · 지도교사 줄(두 조각) · 본 표(머리 + 날짜 칸이 세 교시를 묶은 1~3 + 빈 4 + 계) · 안내 줄 */
const CONFIRM = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '3-(1) ')}${RUN(3, '교과캠프 수업 확인서')}`, 1)
  + TPARA(TBL([
    [{ t: '결재', c: 0, rs: 2, h: 2400, head: 1 }, { t: '계(담당자)', c: 1, h: 900, head: 1 }, { t: '교감', c: 2, h: 900, head: 1 }, { t: '교장', c: 3, h: 900, head: 1 }],
    [D('', 1, { h: 1500 }), D('', 2, { h: 1500 }), D('', 3, { h: 1500 })]], 4, 2400))
  + PARA(RUN(1, '지도교사') + RUN(0, TAIL))
  + TPARA(TBL([
    ['순', '일 시', '시간', '교과', '지도 내용', '확인(서명)'].map((t, c) => ({ t, c, h: 1800, head: 1 })),
    [D('1', 0, { cp: 0 }), D('', 1, { rs: 3, h: 3600 }), D('', 2), D('', 3), D('', 4), D('', 5)],
    [D('2', 0, { cp: 0 }), D('', 2), D('', 3), D('', 4), D('', 5)],
    [D('3', 0, { cp: 0 }), D('', 2), D('', 3), D('', 4), D('', 5)],
    [D('4', 0, { cp: 0 }), D('', 1), D('', 2), D('', 3), D('', 4), D('', 5)],
    [{ t: '계', c: 0, h: 1500, cp: 1 }, { t: '지도 시간: 총 (   )시간', c: 1, cs: 5, h: 1500, cp: 1 }]], 6, 8100))
  + PARA(RUN(0, '※확인(서명)란은 지도 교사가 반드시 날인(사인)'));

test('손 양식 읽기: 합친 칸 글은 왼쪽 위 칸에만, 덮인 칸은 빈칸, 머리 「일 시」도 고름', async () => {
  const { tables, texts } = await readTables(await handForm(CONFIRM));
  assert.equal(tables.length, 2);
  assert.deepEqual(tables[0].rows, [['결재', '계(담당자)', '교감', '교장'], ['', '', '', '']]);
  assert.deepEqual(tables[1].rows[5], ['계', '지도 시간: 총 (   )시간', '', '', '', '']);
  assert.deepEqual([tables[1].rowCnt, tables[1].colCnt], [6, 6]);
  assert.equal(pickTable(tables, ['일시', '시간', '교과', '지도']), 1);
  assert.deepEqual(texts, ['3-(1) 교과캠프 수업 확인서', '지도교사' + TAIL, '※확인(서명)란은 지도 교사가 반드시 날인(사인)']);
});

test('손 양식 채우기: 날짜 칸(rowSpan=3)은 줄마다 풀어 쓰고, 결재란은 그대로, rowAddr 0~6·rowCnt 7·표 높이, 계 줄(colSpan) 채움', async () => {
  const src = await handForm(CONFIRM), before = await secOf(src);
  const out = await fillTable(src, {
    table: 1, rows: ROWS,
    footer: { match: /^계/, cells: [null, '지도 시간: 총 ( 5 )시간'] },
    replace: [['3-(1)', '4-(2)'], ['지도교사 :', '지도교사 : 한가람']]
  });
  const sec = await secOf(out);
  assert.doesNotThrow(() => checkXml(sec));
  // 결재란 표: 글자 하나 바뀌지 않음
  assert.equal(tblXml(sec, 0), tblXml(before, 0));
  const { tables, texts } = await readTables(out);
  assert.deepEqual(tables[0].rows, [['결재', '계(담당자)', '교감', '교장'], ['', '', '', '']]);
  assert.deepEqual(tables[1].rows, [['순', '일 시', '시간', '교과', '지도 내용', '확인(서명)'], ...ROWS, ['계', '지도 시간: 총 ( 5 )시간', '', '', '', '']]);
  assert.deepEqual([tables[1].rowCnt, tables[1].colCnt], [7, 6]);
  const t = tblXml(sec, 1), cells = cellsOf(t);
  assert.equal(attrOf(t, 'rowCnt'), 7);
  assert.deepEqual(cells.map(r => [...new Set(r.map(c => c.row))]), [[0], [1], [2], [3], [4], [5], [6]], 'rowAddr 차례');
  // 줄마다 칸이 0~5를 빈틈없이 덮음(격자가 네모), 데이터 줄은 rowSpan 1·높이 1200
  for (const r of cells) assert.deepEqual(r.flatMap(c => Array.from({ length: c.colSpan }, (_, k) => c.col + k)), [0, 1, 2, 3, 4, 5]);
  for (const r of cells.slice(1, 6)) assert.ok(r.length === 6 && r.every(c => c.rowSpan === 1 && c.height === 1200), JSON.stringify(r));
  assert.deepEqual(cells[6].map(c => c.colSpan), [1, 5], '계 줄 합친 칸 그대로');
  assert.equal(attrOf(/<hp:sz [^>]*>/.exec(t)[0], 'height'), 1800 + 5 * 1200 + 1500);
  // 빈 칸에 쓴 글은 그 칸의 글자 모양(4번), 순 칸은 0번
  assert.match(t, /<hp:run charPrIDRef="4"><hp:t>1\/8\(목\)<\/hp:t><\/hp:run>/);
  assert.match(t, /<hp:run charPrIDRef="0"><hp:t>5<\/hp:t><\/hp:run>/);
  // 표를 품은 문단은 줄 배치 기억을 지움(한글이 다시 잼), 결재란 문단은 그대로
  const paras = [...walk(scanXml(sec))].filter(n => local(n) === 'p' && n.kids.some(k => local(k) === 'run' && k.kids.some(x => local(x) === 'tbl')));
  assert.equal(paras.length, 2);
  assert.ok(paras[0].kids.some(k => local(k) === 'linesegarray'), '결재란 문단');
  assert.ok(!paras[1].kids.some(k => local(k) === 'linesegarray'), '본 표 문단');
  // 바꾸기: 조각(글자 모양)은 그대로 두고 바뀐 글자만
  assert.ok(texts.includes('4-(2) 교과캠프 수업 확인서') && texts.includes('지도교사 : 한가람' + ' '.repeat(10)), texts.join(' | '));
  assert.match(sec, /<hp:run charPrIDRef="2"><hp:t>4-\(2\) <\/hp:t><\/hp:run><hp:run charPrIDRef="3"><hp:t>교과캠프 수업 확인서<\/hp:t><\/hp:run>/);
  assert.match(sec, /<hp:run charPrIDRef="1"><hp:t>지도교사<\/hp:t><\/hp:run>/);
  assert.ok(texts.includes('※확인(서명)란은 지도 교사가 반드시 날인(사인)'));
  const ids = [...sec.matchAll(/<hp:p id="(\d+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, '문단 id가 겹치지 않음');
  // 채운 파일을 다시 채울 수 있음(본 줄이 남음)
  const again = await fillTable(out, { table: 1, rows: ROWS.slice(3), footer: { match: /^계/, cells: [null, '지도 시간: 총 ( 2 )시간'] } });
  assert.deepEqual((await readTables(again)).tables[1].rows.slice(1), [ROWS[3], ROWS[4], ['계', '지도 시간: 총 ( 2 )시간', '', '', '', '']]);
});

test('손 양식 채우기(줄이 남음): 묶인 세 교시 + 빈 줄 → 2줄, 표 높이 줄어듦, 바꾸기는 계 줄 글에도', async () => {
  const out = await fillTable(await handForm(CONFIRM), { table: 1, rows: ROWS.slice(0, 2), replace: [[/총\s*\(\s*\)\s*시간/, '총 ( 2 )시간']] });
  const sec = await secOf(out), t = tblXml(sec, 1);
  assert.doesNotThrow(() => checkXml(sec));
  const { tables } = await readTables(out);
  assert.deepEqual(tables[1].rows.slice(1), [ROWS[0], ROWS[1], ['계', '지도 시간: 총 ( 2 )시간', '', '', '', '']]);
  assert.equal(attrOf(t, 'rowCnt'), 4);
  assert.deepEqual(cellsOf(t).map(r => r[0].row), [0, 1, 2, 3]);
  assert.equal(attrOf(/<hp:sz [^>]*>/.exec(t)[0], 'height'), 1800 + 2 * 1200 + 1500);
});

/* 출석부(교시형): 머리 두 줄(순·일시 rowSpan=2, 학생 colSpan=2 / 학생1·학생2), 데이터, 계 */
const ATTEND = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '학생 출석 및 관찰 기록부')}`, 1)
  + TPARA(TBL([
    [{ t: '순', c: 0, rs: 2, h: 2000, head: 1 }, { t: '일시', c: 1, rs: 2, h: 2000, head: 1 }, { t: '학생', c: 2, cs: 2, h: 1000, head: 1 }],
    [{ t: '학생1', c: 2, h: 1000, head: 1 }, { t: '학생2', c: 3, h: 1000, head: 1 }],
    [D('1', 0), D('', 1), D('', 2), D('', 3)],
    [D('2', 0), D('', 1), D('', 2), D('', 3)],
    [{ t: '계', c: 0, h: 1200 }, D('', 1), D('', 2), D('', 3)]], 4, 5600));

test('머리 줄 자동: 두 줄 머리(rowSpan·colSpan)는 머리로 두고 그 아래부터 채움, 계 줄은 칸 번호대로', async () => {
  const out = await fillTable(await handForm(ATTEND), {
    table: 0, rows: [['1', '1/8 1교시', '○', '○'], ['2', '1/8 2교시', '○', '/'], ['3', '1/9 1교시', '/', '○']],
    footer: { match: /^계/, cells: [null, null, '2', '2'] }
  });
  const sec = await secOf(out);
  assert.doesNotThrow(() => checkXml(sec));
  const { tables } = await readTables(out);
  assert.deepEqual(tables[0].rows, [['순', '일시', '학생', ''], ['', '', '학생1', '학생2'],
    ['1', '1/8 1교시', '○', '○'], ['2', '1/8 2교시', '○', '/'], ['3', '1/9 1교시', '/', '○'], ['계', '', '2', '2']]);
  const cells = cellsOf(tblXml(sec, 0));
  assert.deepEqual(cells.map(r => r[0].row), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(cells[0].map(c => [c.rowSpan, c.colSpan]), [[2, 1], [2, 1], [1, 2]], '머리 합친 칸 그대로');
});

test('줄 그대로 칸만 쓰기(rows 없음, 관찰 기록부 꼴): cells [[줄, 칸, 글]], 값 null은 본 줄 글 그대로, 줄바꿈은 같은 모양 문단', async () => {
  const obs = makeHwpx({ title: '관찰 기록부', blocks: [{ type: 'table', rows: [['이름', '', ''], ['관찰 및 지도 결과', '', '']] }] });
  const a = await fillTable(obs, { table: 0, cells: [[0, 1, '학생A'], [0, 2, '학생B'], [1, 1, '받침 글자를 바르게 읽음.\n스스로 고쳐 씀.'], [1, 2, '덧셈을 끝까지 함.'], [9, 9, '없는 칸']] });
  const { tables } = await readTables(a);
  assert.deepEqual(tables[0].rows, [['이름', '학생A', '학생B'], ['관찰 및 지도 결과', '받침 글자를 바르게 읽음.\n스스로 고쳐 씀.', '덧셈을 끝까지 함.']]);
  const t = tblXml(await secOf(a), 0);
  assert.equal(attrOf(t, 'rowCnt'), 2);
  assert.match(t, /<hp:t>받침 글자를 바르게 읽음\.<\/hp:t><\/hp:run><\/hp:p><hp:p id="\d+" paraPrIDRef="0"[^>]*><hp:run charPrIDRef="0"><hp:t>스스로 고쳐 씀\.<\/hp:t>/);
  // null: 본 줄 글(순 「1」) 그대로
  const b = await fillTable(makeHwpx(DOC1), { table: 0, rows: [[null, 'x'], [null, 'y']] });
  assert.deepEqual((await readTables(b)).tables[0].rows.slice(1, 3).map(r => r.slice(0, 2)), [['1', 'x'], ['1', 'y']]);
});

test('겹친 표: 큰 상자 표 안의 본 표도 차례에 들고(바깥 다음) 채울 수 있음, 바깥 문단 줄 배치도 지움', async () => {
  const inner = () => TPARA(TBL([
    ['순', '날짜', '학생A'].map((t, c) => ({ t, c, h: 1000, head: 1 })), [D('1', 0), D('', 1), D('', 2)], [{ t: '계', c: 0, h: 1000 }, D('', 1), D('', 2)]], 3, 3200));
  const src = await handForm(secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>`)
    + TPARA(TBL([[{ t: '', c: 0, h: 9000 }]], 1, 9000).replace(/(<hp:subList[^>]*>)[\s\S]*?(<\/hp:subList>)/, (m, a, b) => a + PARA(RUN(2, '교과캠프 출석부')) + inner() + b)));
  const before = await readTables(src);
  assert.deepEqual(before.tables.map(t => [t.index, t.rowCnt, t.colCnt]), [[0, 1, 1], [1, 3, 3]]);
  assert.deepEqual(before.tables[0].rows, [['교과캠프 출석부']], '바깥 칸 글에 안쪽 표 글은 없음');
  assert.equal(pickTable(before.tables, ['날짜', '학생']), 1);
  const out = await fillTable(src, { table: 1, rows: [['1', '1/8', '○'], ['2', '1/9', '/']], footer: { cells: [null, null, '1'] } });
  const sec = await secOf(out);
  assert.doesNotThrow(() => checkXml(sec));
  assert.deepEqual((await readTables(out)).tables[1].rows, [['순', '날짜', '학생A'], ['1', '1/8', '○'], ['2', '1/9', '/'], ['계', '', '1']]);
  const anchors = [...walk(scanXml(sec))].filter(n => local(n) === 'p' && n.kids.some(k => local(k) === 'run' && k.kids.some(x => local(x) === 'tbl')));
  assert.equal(anchors.length, 2);
  assert.ok(anchors.every(p => !p.kids.some(k => local(k) === 'linesegarray')), '바깥·안쪽 표 문단 모두');
});

test('칸 영역(cellzoneList) 줄 주소도 옮기고, 나눔 없음(pageBreak NONE) 표가 커지면 쪽 경계에서 나눔', async () => {
  const zones = '<hp:cellzoneList><hp:cellzone startRowAddr="0" startColAddr="0" endRowAddr="0" endColAddr="1" borderFillIDRef="4"/>'
    + '<hp:cellzone startRowAddr="1" startColAddr="1" endRowAddr="2" endColAddr="1" borderFillIDRef="3"/><hp:cellzone startRowAddr="3" startColAddr="0" endRowAddr="3" endColAddr="1" borderFillIDRef="4"/></hp:cellzoneList>';
  const src = await handForm(secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>`) + TPARA(TBL([
    ['순', '내용'].map((t, c) => ({ t, c, h: 1000, head: 1 })), [D('1', 0), D('', 1)], [D('2', 0), D('', 1)], [{ t: '계', c: 0, h: 1000 }, D('', 1, { h: 1000 })]], 2, 1000 + 2 * 1200 + 1000)
    .replace('pageBreak="CELL"', 'pageBreak="NONE"').replace('<hp:tr>', zones + '<hp:tr>')));
  const out = await fillTable(src, { table: 0, rows: [['1', 'a'], ['2', 'b'], ['3', 'c'], ['4', 'd']] });
  const t = tblXml(await secOf(out), 0);
  assert.doesNotThrow(() => checkXml(t));
  assert.deepEqual([...t.matchAll(/startRowAddr="(\d+)"[^>]*endRowAddr="(\d+)"/g)].map(m => [+m[1], +m[2]]), [[0, 0], [1, 4], [5, 5]]);
  assert.match(t, /^<hp:tbl [^>]*pageBreak="CELL"/);
  assert.equal(attrOf(t, 'rowCnt'), 6);
  assert.equal(attrOf(/<hp:sz [^>]*>/.exec(t)[0], 'height'), 1000 + 4 * 1200 + 1000);
});

test('깨진 파일·없는 표: code NOT_HWPX · NO_TABLE · NO_ROW', async () => {
  await assert.rejects(readTables(new Uint8Array([1, 2, 3, 4])), code('NOT_HWPX'));
  await assert.rejects(readTables(null), code('NOT_HWPX'));
  await assert.rejects(readTables(zipStore([{ name: 'a.txt', data: 'x' }])), code('NOT_HWPX'), '구역 XML 없음');
  await assert.rejects(readTables(zipStore([{ name: 'Contents/section0.xml', data: '<hs:sec><hp:p></hs:sec>' }])), code('NOT_HWPX'), '잘 짜이지 않은 XML');
  await assert.rejects(fillTable(new Uint8Array(10), { table: 0, rows: [] }), code('NOT_HWPX'));
  const src = makeHwpx(DOC1);
  await assert.rejects(fillTable(src, { table: 1, rows: [] }), code('NO_TABLE'));
  await assert.rejects(fillTable(src, { table: -1, rows: [] }), code('NO_TABLE'));
  await assert.rejects(fillTable(src, { rows: [] }), code('NO_TABLE'));
  await assert.rejects(fillTable(makeHwpx({ title: 't', blocks: [{ type: 'p', text: '표 없음' }] }), { table: 0, rows: [] }), code('NO_TABLE'));
  const e = await fillTable(src, { table: 1, rows: [] }).catch(x => x);
  assert.ok(e instanceof Error);
  // 머리 줄과 계 줄뿐(본 줄 없음)
  const noRow = makeHwpx({ title: 't', blocks: [{ type: 'table', rows: [HEAD, ['계', '', '', '', '', '']] }] });
  await assert.rejects(fillTable(noRow, { table: 0, headRows: 1, rows: [ROWS[0]], footer: { match: /^계/ } }), code('NO_ROW'));
  assert.deepEqual((await readTables(makeHwpx({ title: 't', blocks: [] }))).tables, []);
});
