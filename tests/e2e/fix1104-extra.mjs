// 버그 탐색(11. 4.) 뒤 남은 것: 공문 처리는 학년도를 「오늘이 든 학년도」로(설정이 없으면 10~12월에 다음 해로 읽던 것)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-10T10:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[공문 처리]')) return JSON.stringify({ title: '독서 행사 안내', due: '11. 20.', tasks: [{ text: '참가 신청', due: '1. 8.' }], kinds: [] });
  return '{}';
});
const G = 'section[data-menu="etc"] .gm-box';
await page.goto(url);
await page.waitForTimeout(400);

await run('fix1104-extra', [
  ['[gongmun-year] 11월에 받은 공문의 「11. 20.」은 올해 11. 20., 「1. 8.」은 다음 해 1. 8.(학교 설정이 없어도), 프롬프트 학년도 2026', async () => {
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.click('#menuTabs [data-tab="gongmun"]');
    await page.waitForSelector(`${G} #gmPaste`);
    await page.fill(`${G} #gmPaste`, '○○교육청\n제목  독서 행사 안내\n1. 11. 20.까지 참가 신청서를 내 주시기 바랍니다.');
    await page.click(`${G} [data-gm="paste"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} .gm-doc`) || {}).textContent?.includes('독서 행사'), G, { timeout: 8000 });
    const docs = await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/gongmun/.test(k)) { const v = JSON.parse(localStorage.getItem(k)); const a = Array.isArray(v) ? v : (v && (v.docs || v.list)); if (Array.isArray(a)) return a; } } return null; });
    assert(docs && docs[0], '저장된 공문 없음');
    assert(docs[0].due === '2026-11-20', JSON.stringify(docs[0].due));
    assert(docs[0].tasks[0].due === '2027-01-08', JSON.stringify(docs[0].tasks));
    const p = prompts.find(x => x.startsWith('[공문 처리]'));
    assert(p.includes('학년도: 2026'), p.slice(0, 200));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
