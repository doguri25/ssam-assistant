// 평가지 채점 기록: 30개를 넘어도 오래된 기록을 말없이 지우지 않음
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, ({ prompt }) => {
  if (prompt.includes('수행평가를 채점하는')) return JSON.stringify({ score: 80, summary: '바르게 풀었음', evidence: ['풀이가 맞음'], strengths: '꼼꼼함', improve: '검산', unreadable: false });
  const nos = [...prompt.matchAll(/"no": (\d+)/g)].map(m => +m[1]);
  return JSON.stringify((nos.length ? nos : [1]).map(no => ({ no, score: 80, text: '수를 바르게 계산함.' })));
});
await page.goto(url);
await page.waitForTimeout(300);
// 지난 채점 기록 30개 (모두 지어낸 자료)
await page.evaluate(() => {
  const ids = Array.from({ length: 30 }, (_, i) => 'old' + i);
  ids.forEach((id, i) => localStorage.setItem('ssam:gr:' + id, JSON.stringify({ kind: 'gr', title: '지난 채점 ' + i, createdAt: 1000 + i, students: [] })));
  localStorage.setItem('ssam:grs', JSON.stringify(ids));
  localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
});
await page.reload(); await page.waitForTimeout(500);

await run('gr-history', [
  ['새로 채점해 31번째 기록이 생겨도 지난 기록 30개가 모두 남음', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
    await page.waitForSelector('#grDrop');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
    await fc.setFiles([join(FIXTURES, 'sheet-1.png')]);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 1명'));
    await page.fill('#grTitle', '세 자리 수 덧셈'); await page.dispatchEvent('#grTitle', 'input');
    await page.click('[data-gr="start"]');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:grs') || '[]')).length > 30 || (JSON.parse(localStorage.getItem('ssam:grs') || '[]'))[0] !== 'old0', null, { timeout: 15000 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ ids: JSON.parse(localStorage.getItem('ssam:grs')), left: Array.from({ length: 30 }, (_, i) => !!localStorage.getItem('ssam:gr:old' + i)) }));
    assert(r.ids.length === 31 && r.left.every(Boolean), `목록 ${r.ids.length}개, 남은 기록 ${r.left.filter(Boolean).length}개`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
