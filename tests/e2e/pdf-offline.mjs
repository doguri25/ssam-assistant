// PDF 읽기 도구(pdf.js)는 앱 안에 있어서 인터넷(CDN)이 막혀도 스캔 PDF·글자 PDF를 읽음
import { join } from 'node:path';
import { open, run, assert, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
let cdn = 0;
await page.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, r => { cdn++; return r.abort(); });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const V = 'section[data-menu="evaluate"] .unit-box';
const PDF = join(ROOT, 'samples', '단원평가-답안-예시.pdf');
await page.goto(url);
await page.waitForTimeout(400);
const id = await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  const x = m.newTest({ meta: { ...s.SAMPLE_META, date: '2026-10-29' }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } });
  m.saveTest(x); m.saveSet({ pagesPer: 1, mask: [], maskAll: false, maskOn: true });
  return x.id;
});
await page.reload(); await page.waitForTimeout(400);

await run('pdf-offline', [
  ['인터넷이 막혀도 스캔 PDF를 쪽마다 읽음(단원평가 답안 4쪽 → 학생 4명)', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, PDF);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 4, null, { timeout: 30000 });
  }],
  ['글자 PDF도 읽음', async () => {
    const text = await page.evaluate(async b64 => {
      const f = await import('./core/files.js');
      const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      try { return await f.readText(new File([u8], '답안.pdf', { type: 'application/pdf' })); } catch (e) { return 'ERR ' + JSON.stringify(e); }
    }, (await import('node:fs')).readFileSync(PDF).toString('base64'));
    assert(text.includes('마을 도서관'), text.slice(0, 80));
  }],
  ['CDN을 부르지 않음', async () => { assert(cdn === 0, `CDN ${cdn}번`); }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
