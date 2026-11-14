// 문서·소통 버그 고침(2026-11-14, 화면): 다시 쓰는 중인 가정통신문을 최근에서 다시 열면 다 쓴 글이 화면에 오고, 고쳐도 다 쓴 글이 옛 글로 덮이지 않음
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
let delay = 0, n = 0;
await mockClaude(page, async ({ prompt }) => {
  if (delay) await new Promise(r => setTimeout(r, delay));
  if (prompt.startsWith('[가정통신문]')) { n++; return JSON.stringify({ title: `안내 ${n}`, greeting: ['안녕하십니까?'], intro: `취지 ${n}`, items: ['1. 일시: 11. 20.'], closing: '부탁드립니다.', reply: { need: false }, short: '짧은 글', related: [], target: '3학년 보호자' }); }
  return '{}';
});
const E = 'section[data-menu="etc"]', LF = `${E} .lf-box`;
const waitToast = s => page.waitForFunction(s => ((document.querySelector('#toast') || {}).textContent || '').includes(s), s, { timeout: 8000 });
const recentLetters = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:letter:list') || '[]')).map(x => x.out.title));

await page.goto(url);
await page.waitForTimeout(300);
await page.click('nav.app-side [data-menu-go="etc"]');

await run('fix1114-etc', [
  ['가정통신문: [다시 쓰기] 중에 [새 가정통신문] → 최근에서 그 글을 [열기] → 다 쓴 글이 화면에, 이어 고쳐도 최근 글이 옛 글로 돌아가지 않음', async () => {
    await page.click('#menuTabs [data-tab="letter"]');
    await page.fill(`${LF} #lfMemo`, '11월 20일 3학년 현장체험학습');
    await page.click(`${LF} [data-lf="write"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} [data-lo="title"]`) || {}).value === '안내 1', LF);
    delay = 1200;
    await page.click(`${LF} [data-lf="write"]`); // 다시 쓰기
    await page.waitForTimeout(150);
    await page.click(`${LF} [data-lf="new"]`);
    await page.click(`${LF} #lfRecent [data-lf-open]`);
    await page.waitForFunction(s => !document.querySelector(`${s} [data-lf="write"]`).disabled, LF, { timeout: 8000 });
    delay = 0;
    await page.waitForTimeout(200);
    assert((await page.inputValue(`${LF} [data-lo="title"]`)) === '안내 2', '화면 제목: ' + await page.inputValue(`${LF} [data-lo="title"]`));
    assert((await page.inputValue(`${LF} [data-lo="body"]`)).includes('취지 2'), '화면 본문이 옛 글');
    await page.fill(`${LF} #lfMemo`, '11월 20일 3학년 현장체험학습. 도시락');
    await page.waitForTimeout(100);
    const l = await recentLetters();
    assert(l.length === 1 && l[0] === '안내 2', '최근 가정통신문: ' + JSON.stringify(l));
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:letter:cur')).out.title) === '안내 2', '지금 글이 옛 글');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
