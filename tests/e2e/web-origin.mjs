// 웹판 주소(github.io)를 같은 계정의 다른 페이지와 함께 쓰는 것을 알림: AI 키 기억하기 옆 안내, 저장 공간의 다른 페이지 몫
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { open, run, assert, WEB } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
// https://doguri25.github.io/ssam-assistant/ 를 web/ 폴더로 대신 답함
await page.route('https://doguri25.github.io/**', async r => {
  const p = new URL(r.request().url()).pathname.replace(/^\/ssam-assistant\/?/, '') || 'index.html';
  try { await r.fulfill({ status: 200, contentType: TYPES[extname(p)] || 'application/octet-stream', body: await readFile(join(WEB, decodeURIComponent(p))) }); }
  catch (e) { await r.fulfill({ status: 404, body: '' }); }
});
const S = 'section[data-menu="settings"]';
const aiText = async () => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="ai"]'); await page.waitForTimeout(200); return page.textContent(S); };

await run('web-origin', [
  ['github.io 웹판: AI 키 기억하기 옆에 같은 주소의 다른 페이지도 읽을 수 있다는 안내', async () => {
    await page.goto('https://doguri25.github.io/ssam-assistant/');
    await page.waitForTimeout(600);
    const txt = await aiText();
    assert(txt.includes('doguri25.github.io 주소를 같은 계정의 다른 웹페이지와 함께 써요'), txt.slice(0, 300));
    await page.click(`${S} [data-set="openAi"]`);
    await page.waitForSelector('#keyRemember');
    assert((await page.textContent('#sheetRoot')).includes('같은 계정의 다른 웹페이지와 함께 써요'), '키 창에 안내 없음');
    await page.keyboard.press('Escape');
  }],
  ['학년도 화면: 같은 주소의 다른 페이지가 쓰는 저장 공간을 따로 보여 줌', async () => {
    await page.evaluate(() => localStorage.setItem('nice:plan', 'x'.repeat(200000)));
    await page.click('#menuTabs [data-tab="years"]');
    await page.waitForSelector(`${S} [data-set="backup"]`);
    const txt = await page.textContent(S);
    await page.evaluate(() => localStorage.removeItem('nice:plan'));
    assert(/같은 주소의 다른 페이지 \d+KB/.test(txt), txt.slice(0, 300));
  }],
  ['내 컴퓨터 주소(시험 서버)에서는 안내가 없음', async () => {
    await page.goto(url); await page.waitForTimeout(500);
    assert(!(await aiText()).includes('같은 계정의 다른 웹페이지'), '안내가 보임');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
