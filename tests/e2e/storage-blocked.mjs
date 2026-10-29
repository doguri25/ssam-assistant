// 브라우저가 사이트 저장소를 막아도(localStorage 접근이 오류) 메뉴는 움직임
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('막힘', 'SecurityError'); } });
});
await page.goto(url);
await page.waitForTimeout(600);

await run('storage-blocked', [
  ['메뉴를 누르면 바뀜', async () => {
    await page.click('nav.app-side [data-menu-go="plan"]');
    assert(await page.textContent('#menuTitle') === '계획', await page.textContent('#menuTitle'));
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]');
    await page.waitForTimeout(300);
    assert((await page.textContent('section[data-menu="settings"]')).includes('학년도'), '학년도 화면');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
