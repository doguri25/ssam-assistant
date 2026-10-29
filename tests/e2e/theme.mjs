// 테마 5개: 기본 다크 내비, 바꾸면 기억, 망가진 값이면 기본, 헤더 배경 투명, 레일 폭, 틀 규칙(76px·가로 스크롤)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const sideBg = () => page.evaluate(() => getComputedStyle(document.querySelector('nav.app-side')).backgroundColor);
const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
const setTheme = id => page.evaluate(id => import('./core/theme.js').then(m => m.setTheme(id)), id);
await page.goto(url);
await page.waitForTimeout(500);

await run('theme', [
  ['처음 열면 다크 내비', async () => {
    assert(await theme() === 'dark-nav', 'data-theme: ' + await theme());
    assert(await sideBg() === 'rgb(21, 23, 28)', '세로 메뉴 배경: ' + await sideBg());
  }],
  ['종이 문서로 바꾸면 새로고침해도 그대로', async () => {
    await setTheme('paper');
    await page.reload(); await page.waitForTimeout(300);
    assert(await theme() === 'paper', 'data-theme: ' + await theme());
    assert(await sideBg() === 'rgb(239, 235, 226)', '세로 메뉴 배경: ' + await sideBg());
  }],
  ['없는 테마 이름이면 다크 내비', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:theme', '"없는것"'));
    await page.reload(); await page.waitForTimeout(300);
    assert(await theme() === 'dark-nav', 'data-theme: ' + await theme());
  }],
  ['다섯 테마 모두 헤더 배경 투명, 로고 칸·헤더 76px, 390px에서 가로 스크롤 없음', async () => {
    for (const id of ['dark-nav', 'mono', 'soft', 'paper', 'rail']) {
      await setTheme(id); await page.waitForTimeout(100);
      const r = await page.evaluate(() => ({
        top: getComputedStyle(document.querySelector('header.app-top')).backgroundColor,
        logo: document.querySelector('nav.app-side .app-logo').getBoundingClientRect().height,
        head: document.querySelector('header.app-top').getBoundingClientRect().height
      }));
      assert(r.top === 'rgba(0, 0, 0, 0)', `${id} 헤더 배경 ${r.top}`);
      assert(r.logo === 76 && r.head === 76, `${id} 높이 ${r.logo}/${r.head}`);
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      await page.setViewportSize({ width: 1280, height: 860 });
      assert(w <= 390, `${id} scrollWidth ${w}`);
    }
  }],
  ['아이콘 레일은 세로 메뉴 폭 96px', async () => {
    await setTheme('rail'); await page.waitForTimeout(100);
    const w = await page.evaluate(() => document.querySelector('nav.app-side').getBoundingClientRect().width);
    assert(w === 96, '폭 ' + w);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
