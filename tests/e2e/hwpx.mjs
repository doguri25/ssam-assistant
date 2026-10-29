// 한글 파일(.hwpx): 브라우저에서 만들어 XML이 바른지, 기존 한글 파서로 다시 읽히는지 (PRD 11)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.goto(url);
await page.waitForTimeout(500);

const DOC = { title: '시험 <품의>', blocks: [{ type: 'h', text: '1. 산출 내역' }, { type: 'p', text: 'A & B\n둘째 줄' }, { type: 'table', head: true, rows: [['품명', '금액'], ['비커', '6000']] }] };

await run('hwpx', [
  ['모든 XML이 바르게 읽힘', async () => {
    const bad = await page.evaluate(async doc => {
      const { makeHwpx } = await import('./core/hwpx.js');
      const { unzip } = await import('./core/zip.js');
      const m = await unzip(makeHwpx(doc));
      const out = [];
      for (const [name, u8] of m) {
        if (!/\.(xml|hpf)$/.test(name)) continue;
        const x = new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');
        if (x.getElementsByTagName('parsererror').length) out.push(name);
      }
      return out;
    }, DOC);
    assert(bad.length === 0, 'XML 오류: ' + bad.join(', '));
  }],
  ['기존 한글 파서로 다시 읽으면 글과 표가 나옴', async () => {
    const text = await page.evaluate(async doc => {
      const { makeHwpx } = await import('./core/hwpx.js');
      return window.SSAM.files.readHwpxText(makeHwpx(doc));
    }, DOC);
    for (const w of ['시험 <품의>', 'A & B', '둘째 줄', '비커', '6000']) assert(text.includes(w), `「${w}」 없음: ` + text.slice(0, 200));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
