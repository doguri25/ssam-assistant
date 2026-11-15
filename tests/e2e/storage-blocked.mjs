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
  ['설정 › 화면: 저장소가 막혀도 고른 테마·글꼴이 이 창에서는 골라진 채(다른 탭에 갔다 와도 기본으로 표시되지 않음)', async () => {
    const S = 'section[data-menu="settings"]';
    await page.click('#menuTabs [data-tab="screen"]');
    await page.waitForSelector(`${S} .font-grid`);
    await page.click(`${S} [data-font-pick="nanum"]`);
    await page.click(`${S} [data-theme-pick="paper"]`);
    assert(await page.getAttribute('html', 'data-font') === 'nanum' && await page.getAttribute('html', 'data-theme') === 'paper', '바뀌지 않음');
    await page.click('#menuTabs [data-tab="school"]');
    await page.click('#menuTabs [data-tab="screen"]');
    await page.waitForSelector(`${S} .font-grid`);
    assert(await page.isChecked(`${S} [data-font-pick="nanum"] input`), '글꼴 칸이 기본으로 돌아감');
    assert(await page.isChecked(`${S} [data-theme-pick="paper"] input`), '테마 칸이 기본으로 돌아감');
    await page.click(`${S} [data-theme-pick="mono"]`);
    assert(await page.getAttribute('html', 'data-font') === 'nanum', '테마를 바꾸니 글꼴이 바뀜');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
