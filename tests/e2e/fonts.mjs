// 글꼴: 바깥 글꼴 서버가 멈춰도 앱이 바로 뜨고, 고른 테마·글꼴에 필요한 것만 부름 (기본 프리텐다드는 앱 안 파일, 종이 문서로 바꾸면 명조 제목 글꼴을 더 부름)
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
  ['기본(다크 내비·프리텐다드)은 구글에서 숫자 글꼴만 부름(테마 글꼴 Gothic A1·IBM Plex·명조 없음)', async () => {
    assert(asked.length >= 1 && asked.every(u => u.includes('Roboto+Mono') && !u.includes('Gothic+A1') && !u.includes('IBM+Plex') && !u.includes('Noto+Serif')), asked.join(' | '));
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
