// 손으로 쓴 한글 양식(.hwpx) 만들기 — 합친 칸(rowSpan·colSpan)·글자 모양·줄 배치가 있는 표 (시험용, 글은 지어낸 것)
// hwpx-table.test.mjs · camp-form.test.mjs가 같이 씀
import { makeHwpx } from '../../web/core/hwpx.js';
import { unzip, zipStore } from '../../web/core/zip.js';
import { checkXml } from '../../web/core/hwpx-form.js';

const dec = u8 => new TextDecoder().decode(u8);
export const LSA = '<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="7000" flags="393216"/></hp:linesegarray>';
export const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let pid = 100;
export const RUN = (cp, text) => (text === '' ? `<hp:run charPrIDRef="${cp}"/>` : `<hp:run charPrIDRef="${cp}"><hp:t>${xesc(text)}</hp:t></hp:run>`);
export const PARA = (runs, pr = 0) => `<hp:p id="${pid++}" paraPrIDRef="${pr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runs}${LSA}</hp:p>`;
/* 칸: { t 글, c colAddr, cs colSpan, rs rowSpan, h 높이, cp 글자 모양, head } (rowAddr는 줄 차례) */
export const TC = (x, r) => `<hp:tc name="" header="${x.head ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${x.head ? 4 : 3}">`
  + '<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">'
  + PARA(RUN(x.cp == null ? (x.head ? 1 : 4) : x.cp, x.t || ''), x.head ? 1 : 0) + '</hp:subList>'
  + `<hp:cellAddr colAddr="${x.c}" rowAddr="${r}"/><hp:cellSpan colSpan="${x.cs || 1}" rowSpan="${x.rs || 1}"/><hp:cellSz width="${7000 * (x.cs || 1)}" height="${x.h}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
export const TBL = (rows, colCnt, height) => `<hp:tbl id="${pid++}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="${rows.length}" colCnt="${colCnt}" cellSpacing="0" borderFillIDRef="3" noAdjust="0">`
  + `<hp:sz width="${7000 * colCnt}" widthRelTo="ABSOLUTE" height="${height}" heightRelTo="ABSOLUTE" protect="0"/>`
  + '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
  + '<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>'
  + rows.map((r, ri) => `<hp:tr>${r.map(x => TC(x, ri)).join('')}</hp:tr>`).join('') + '</hp:tbl>';
export const TPARA = tbl => PARA(`<hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>`);

export async function handForm(body) {
  pid = 100;
  const base = await unzip(makeHwpx({ title: 'x', blocks: [] }));
  const sec0 = dec(base.get('Contents/section0.xml'));
  const NS = sec0.slice(0, sec0.indexOf('>', sec0.indexOf('<hs:sec')) + 1);
  const secPr = /<hp:secPr[\s\S]*?<\/hp:secPr><hp:ctrl>[\s\S]*?<\/hp:ctrl>/.exec(sec0)[0];
  const section = `${NS}${body(secPr)}</hs:sec>`;
  checkXml(section);
  return zipStore([...base].map(([name, data]) => ({ name, data: name === 'Contents/section0.xml' ? section : data })));
}
export const D = (t, c, extra = {}) => ({ t, c, h: 1200, ...extra });
