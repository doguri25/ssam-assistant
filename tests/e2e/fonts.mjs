// 글꼴: 바깥 글꼴 서버가 멈춰도 앱이 바로 뜨고, 고른 테마의 글꼴만 부름 (테마를 바꾸면 그 글꼴을 더 부름)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const asked = [];
await page.unroute(/fonts\.(googleapis|gstatic)\.com/);
await page.route(/fonts\.googleapis\.com/, r => { asked.push(r.request().url()); }); // 답하지 않음 (멈춘 서버)
await page.route(/fonts\.gstatic\.com/, r => r.fulfill({ status: 200, body: '' }));

await run('fonts', [
  ['글꼴 서버가 답하지 않아도 3초 안에 메뉴가 그려짐', async () => {
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => document.querySelectorAll('#sideMenus [data-menu-go]').length > 0, null, { timeout: 3000 });
    // 그려져야(화면이 막히지 않아야) 누를 수 있음
    await page.click('nav.app-side [data-menu-go="plan"]', { timeout: 3000 });
    assert(await page.textContent('#menuTitle') === '계획', await page.textContent('#menuTitle'));
  }],
  ['기본 테마(다크 내비)는 Gothic A1만 부름', async () => {
    assert(asked.length >= 1 && asked.every(u => u.includes('Gothic+A1') && !u.includes('IBM+Plex') && !u.includes('Noto+Serif')), asked.join(' | '));
  }],
  ['종이 문서 테마로 바꾸면 그 글꼴(Noto Serif KR)을 부름', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="screen"]');
    await page.click('[data-theme-pick="paper"]');
    await page.waitForTimeout(200);
    assert(asked.some(u => u.includes('Noto+Serif+KR')), asked.join(' | '));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
