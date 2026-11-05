// 3차 검토: 공문 처리에서 체크를 누른 뒤(초점이 체크에 남음) 아래 공문을 보는 동안 AI 읽기가 끝나도 화면이 그 체크로 튀지 않음
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open({ width: 1280, height: 860 });
const { page, url, errors } = t;
let gate = null, release = null;
await mockClaude(page, async ({ prompt }) => {
  if (!prompt.startsWith('[공문 처리]')) return '{}';
  if (gate) await gate;
  return JSON.stringify({ title: 'AI가 읽은 H', due: '2026-12-30', summary: 'H 요약', tasks: [{ text: 'H 신청서 제출', due: '' }], kinds: [] });
});
await page.addInitScript(() => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })); });
await page.goto(url); await page.waitForTimeout(300);
await page.evaluate(() => {
  const L = [];
  for (let i = 0; i < 7; i++) L.push({ id: 'gm' + 'ABCDEFG'[i], name: 'X', title: `${'ABCDEFG'[i]} 공문`, text: 'x', tasks: [{ text: '할 일 1', due: '', done: false }, { text: '할 일 2', due: '', done: false }], kinds: [], at: 10 - i, read: true, due: `2026-11-${String(10 + i).padStart(2, '0')}` });
  L.push({ id: 'gmH', name: 'H', title: 'H 공문', text: 'H 본문', tasks: [], kinds: [], at: 1, read: false, due: '' });
  localStorage.setItem('ssam:gongmun:list', JSON.stringify(L));
});
await page.reload(); await page.waitForTimeout(300);
const G = 'section[data-menu="etc"] .gm-box', card = id => `${G} [data-gm-id="${id}"]`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const human = async sel => { await page.locator(sel).evaluate(el => el.scrollIntoView({ block: 'center' })); await sleep(50); const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(250); };
const hVisible = () => page.locator(card('gmH')).evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });

await run('fix3-etc-scroll', [
  ['[gm-click-1 검토] A 체크 뒤 아래 H를 보는 동안 H 읽기가 끝나도 화면이 A로 튀지 않음(초점은 A 체크에 남음)', async () => {
    await page.click('nav.app-side [data-menu-go="etc"]'); await page.click('#menuTabs [data-tab="gongmun"]');
    await page.waitForSelector(`${card('gmH')} [data-gm-read]`);
    gate = new Promise(r => (release = r));
    await human(`${card('gmH')} [data-gm-read]`);
    await human(`${card('gmA')} [data-gm-task="0"]`);
    await page.mouse.move(640, 400); await page.mouse.wheel(0, 5000); await sleep(400);
    assert(await hVisible(), '내린 뒤 H가 보여야 함');
    release(); gate = null;
    await page.waitForFunction(s => !document.querySelector(`${s} .spin`), G); await sleep(300);
    assert(await hVisible(), '읽기가 끝난 뒤 화면이 A로 튐(H가 안 보임)');
    assert((await page.textContent(card('gmH'))).includes('AI가 읽은 H'), 'H 카드가 바뀌지 않음');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.gmTask === '0'), 'A 체크 초점이 사라짐');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
