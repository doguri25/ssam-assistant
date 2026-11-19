// .hwpx 글 읽기: <hp:t> 안 탭·줄바꿈·묶음 빈칸을 살리고(이름 가리기가 이름을 놓치지 않게), 머리말·각주 글은 문단 글에 붙이지 않음
import { open, run, assert } from './helpers.mjs';
import { zipStore } from '../../web/core/zip.js';

const NS = 'xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"';
const P = (inner, id) => `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0">${inner}</hp:p>`;
const R = t => `<hp:run charPrIDRef="0">${t}</hp:run>`;
const TAB = '<hp:tab width="4000" leader="0" type="1"/>';
const sub = t => `<hp:subList id="" textDirection="HORIZONTAL"><hp:p id="9" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run></hp:p></hp:subList>`;
const sec = body => zipStore([{ name: 'mimetype', data: 'application/hwp+zip' }, { name: 'Contents/section0.xml', data: `<?xml version="1.0" encoding="UTF-8"?><hs:sec ${NS}>${body}</hs:sec>` }]);
const A = sec(P(R(`<hp:t>담임${TAB}한가람</hp:t>`), 1) + P(R(`<hp:t>성명${TAB}박솔빛</hp:t>`), 2) + P(R('<hp:t>2026. 11. 19.<hp:lineBreak/>새싹초등학교장</hp:t>'), 3) + P(R('<hp:t>제<hp:nbSpace/>2026-15<hp:fwSpace/>호</hp:t>'), 4));
const B = sec(P(R(`<hp:ctrl><hp:header id="1" applyPageType="BOTH">${sub('새싹초등학교 가정통신문')}</hp:header></hp:ctrl>`) + R('<hp:t>학부모 상담 주간 안내</hp:t>'), 1)
  + P(R('<hp:t>상담은 11월 24일부터</hp:t>') + R(`<hp:ctrl><hp:footNote number="1">${sub('학교 누리집 참고')}</hp:footNote></hp:ctrl><hp:t> 28일까지입니다.</hp:t>`), 2));

const t = await open();
const { page, url, errors } = t;
await page.goto(url);
await page.waitForFunction(() => window.SSAM && window.SSAM.files && window.SSAM.files.readHwpText);
const read = bytes => page.evaluate(async arr => {
  const { readText } = await import('./core/files.js');
  const { cleanSheet } = await import('./menus/evaluate/activity/activity-read.js');
  const text = await readText(new File([new Uint8Array(arr)], '안내.hwpx'));
  return { text, sheet: cleanSheet(text).text };
}, [...bytes]);

await run('fix1119-bugs4-files', [
  ['hp:t 안 탭·줄바꿈·빈칸이 살고, 공문 처리(cleanSheet)가 「담임⇥이름」「성명⇥이름」을 가림', async () => {
    const r = await read(A);
    assert(r.text === '담임\t한가람\n성명\t박솔빛\n2026. 11. 19.\n새싹초등학교장\n제 2026-15 호', JSON.stringify(r.text));
    assert(!/한가람|박솔빛/.test(r.sheet), r.sheet);
  }],
  ['머리말·각주 글은 따로 줄로(제목·문장에 붙지 않음)', async () => {
    const r = await read(B);
    const lines = r.text.split('\n');
    assert(lines[0] === '학부모 상담 주간 안내', JSON.stringify(r.text));
    assert(lines.includes('새싹초등학교 가정통신문') && lines.includes('상담은 11월 24일부터 28일까지입니다.') && lines.includes('학교 누리집 참고'), JSON.stringify(r.text));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
