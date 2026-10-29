// 평가 메뉴: window.SSAM 다리, 저장 키(ssam:), 창체 학습지 흐름
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
let seq = 0;
await mockClaude(page, ({ prompt, images }) => {
  if (images) { seq++; return JSON.stringify({ note: `학습지 ${seq}: 교실 정리를 다짐함`, text: `교실을 깨끗하게 하려고 ${seq}가지 방법을 스스로 정해 꾸준히 실천함.`, blank: false }); }
  const n = +(prompt.match(/학생 (\d+)명에게/) || [])[1] || 1;
  return Array.from({ length: n }, (_, j) => `공통 활동에 즐겁게 참여하며 ${j + 1}번째로 서로 돕는 태도를 보여 줌.`).join('\n');
});
await page.goto(url);
await page.waitForTimeout(600);

await run('evaluate', [
  ['window.SSAM.setMode로 행특 화면이 열림', async () => {
    await page.evaluate(() => window.SSAM.setMode('hk'));
    assert(await page.isVisible('#hkView'), '#hkView가 보이지 않음');
  }],
  ['getMode가 지금 화면을 알려 줌', async () => {
    assert(await page.evaluate(() => window.SSAM.getMode()) === 'hk', 'getMode가 hk가 아님');
  }],
  ['저장 키는 ssam:으로만 시작', async () => {
    await page.reload(); await page.waitForTimeout(500);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    assert(keys.includes('ssam:mode'), 'ssam:mode 없음: ' + keys.join(','));
    assert(!keys.some(k => k.startsWith('pe:')), 'pe: 키가 남음: ' + keys.join(','));
  }],
  ['창체 학습지 흐름이 끝까지 돎', async () => {
    await page.evaluate(() => window.SSAM.setMode('cc'));
    await page.fill('#ccSetup [data-cls="count"]', '3'); await page.press('#ccSetup [data-cls="count"]', 'Tab');
    await page.fill('[data-ccf="name"][data-cck="auto"]', '교실 환경 지킴이');
    await page.fill('[data-ccf="desc"][data-cck="auto"]', '교실을 깨끗하게 하는 방법을 정해 실천함');
    await page.click('#ccGrade');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-ccsheet][data-cck="auto"]')]);
    await fc.setFiles([1, 2, 3].map(i => join(FIXTURES, `sheet-${i}.png`)));
    await page.waitForSelector('[data-ccsheetinfo]');
    await page.click('[data-cc="genAll"]');
    await page.waitForFunction(() => document.querySelectorAll('#ccResults .gr-sum').length === 3, null, { timeout: 15000 });
    const notes = await page.locator('#ccResults .gr-sum').allInnerTexts();
    assert(notes.every(n => n.startsWith('학습지:')), '학습지 줄이 아님: ' + notes.join(' / '));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
