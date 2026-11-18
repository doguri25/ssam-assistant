// 사업별 예산 집행 현황(스펙 2026-11-18-budget-design): 계획서를 넣으면 예산 사업 등록 카드 → 등록 → 사업 칸·남은 예산 → 초안 → [에듀파인에 올렸어요](집행)
// → 품목을 바꾸면 「올린 뒤 금액이 바뀌었어요」 → 품의 › 예산 탭(예산·집행·예정·남음·D-n) → [+ 직접 더하기] → 「오늘」 이어서 하기 줄 →
// 다른 품의는 「사업 · 골라 주세요」 칩·예정, 최근 작성에서 지우면 예정은 빠지고 집행은 남음, 휴대폰 폭. 예시는 지어낸 것
import { open, run, assert, enter, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-18T09:00:00'));
await page.addInitScript(() => {
  if (localStorage.getItem('ssam:__seeded')) return;
  localStorage.setItem('ssam:__seeded', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:school', JSON.stringify({ name: '새싹초등학교' }));
  localStorage.setItem('ssam:purchase:view', JSON.stringify('full'));
});
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '친구사랑 주간 사진전 물품 구입', intro: '친구사랑 주간 운영 물품을 구매하고자 합니다.', fields: {} });
  if (prompt.startsWith('[품의 검토]')) return JSON.stringify({ items: [] });
  return '{}';
});
const P = 'section[data-menu="purchase"]';
const PLAN = ['2026학년도 친구사랑 주간 운영 계획', '1. 목적', '가. 친구를 아끼는 마음을 기른다.', '3. 예산 계획', '항목\t산출 근거\t금액', '사진전\t사진 인화지 37,000원*8개=296,000원\t296,000원'].join('\n');
const ledger = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:budget:ledger') || '[]'));
await page.goto(url);
await page.waitForTimeout(400);

await run('fix1118-budget', [
  ['계획서를 넣으면 예산 사업 등록 카드 → 등록하면 사업 칸에 골라지고 남은 예산', async () => {
    await enter(page, 'purchase', 'new');
    await page.fill(`${P} #pcIntake`, PLAN);
    await page.click(`${P} [data-pc="intake"]`);
    await page.waitForSelector(`${P} #pcReg`);
    const reg = await page.textContent(`${P} #pcReg`);
    assert(reg.includes('「2026학년도 친구사랑 주간 운영 계획」') && reg.includes('296,000원'), reg);
    await page.click(`${P} [data-pc="regYes"]`);
    await page.waitForSelector('#sheetRoot #bdSheet');
    await page.fill('#sheetRoot #bdAmount', '500,000');
    await page.fill('#sheetRoot #bdDue', '2026-12-15');
    await page.click('#sheetRoot #bdOk');
    await page.waitForFunction(s => !document.querySelector(`${s} #pcReg`), P);
    const sel = await page.$eval(`${P} #pcProjectSel`, s => s.options[s.selectedIndex].textContent);
    assert(sel === '2026학년도 친구사랑 주간 운영 계획', sel);
    assert((await page.textContent(`${P} #pcLeftBox`)).includes('남은 예산 500,000원 → 이 품의 뒤 204,000원'), await page.textContent(`${P} #pcLeftBox`));
  }],
  ['초안 → [에듀파인에 올렸어요] → 집행, 품목을 바꾸면 「올린 뒤 금액이 바뀌었어요」, 넘치면 확인 목록 경고', async () => {
    await page.click(`${P} [data-pc="draft"]`);
    await page.waitForSelector(`${P} [data-pc="post"]`);
    let l = (await ledger())[0];
    assert(l && !l.posted && l.amount === 296000, JSON.stringify(l));
    await page.click(`${P} [data-pc="post"]`);
    await page.waitForSelector(`${P} #pcPosted`);
    assert((await page.textContent(`${P} #pcPosted`)).includes('에듀파인에 올림') && (await page.textContent(`${P} #pcPosted`)).includes('296,000원'), await page.textContent(`${P} #pcPosted`));
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '20');
    await page.waitForSelector(`${P} #pcPostedNow`);
    assert((await page.textContent(`${P} #pcPostedNow`)).includes('296,000 → 740,000'), await page.textContent(`${P} #pcPostedNow`));
    l = (await ledger())[0];
    assert(l.posted && l.amount === 296000 && l.now === 740000, JSON.stringify(l));
    // 집행액은 올릴 때 금액 그대로라 넘침 경고는 없음 → 다시 올림 표시하면 넘침
    await page.click(`${P} [data-pc="repost"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} #pcChecks`) || {}).textContent?.includes('남은 예산보다 240,000원 많아요'), P);
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '8');
    await page.click(`${P} [data-pc="repost"]`);
    await page.waitForFunction(s => !document.querySelector(`${s} #pcPostedNow`), P);
  }],
  ['품의 › 예산 탭: 예산·집행·예정·남음·D-27, [+ 직접 더하기]는 집행', async () => {
    await enter(page, 'purchase', 'budget');
    await page.waitForSelector(`${P} .bd-card`);
    let c = await page.textContent(`${P} .bd-card`);
    assert(c.includes('예산 500,000 · 집행 296,000 · 예정 0 · 남음 204,000') && c.includes('D-27') && c.includes('✓ 집행'), c);
    await page.click(`${P} [data-bd="manual"]`);
    await page.fill('#sheetRoot #bdmTitle', '11월 전에 쓴 돈');
    await page.fill('#sheetRoot #bdmAmount', '100000');
    await page.click('#sheetRoot #bdmOk');
    await page.waitForFunction(s => document.querySelector(`${s} .bd-card`).textContent.includes('남음 104,000'), P);
    c = await page.textContent(`${P} .bd-card`);
    assert(c.includes('11월 전에 쓴 돈') && c.includes('(직접)') && c.includes('집행 396,000'), c);
  }],
  ['「오늘」 이어서 하기에 마감 알림 줄, 누르면 품의 › 예산', async () => {
    await enter(page, 'home');
    await page.waitForFunction(() => [...document.querySelectorAll('.hm-row')].some(r => r.textContent.includes('예산 「2026학년도 친구사랑 주간 운영 계획」 104,000원 남음')));
    const row = page.locator('.hm-row', { hasText: '104,000원 남음' });
    assert((await row.textContent()).includes('D-27'), await row.textContent());
    await row.click();
    await page.waitForSelector(`${P} .bd-page`);
  }],
  ['다른 품의: 사업이 있으면 「사업 · 골라 주세요」 칩, 고르지 않은 초안은 사업 없음 예정, 최근 작성에서 지우면 예정은 빠지고 집행은 남음', async () => {
    await enter(page, 'purchase', 'new');
    await page.click(`${P} [data-pc="fresh"]`);
    await page.waitForTimeout(200);
    await page.fill(`${P} #pcIntake`, '공책 10권 5000원');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForSelector(`${P} [data-chip="budgetProject"]`);
    let L = await ledger();
    assert(L.length === 3 && L.some(l => l.project === '' && !l.posted && l.amount === 50000), JSON.stringify(L));
    await enter(page, 'purchase', 'recent');
    // 지우면 목록을 다시 그려서 하나씩
    while (await page.$(`${P} [data-recent-del]`)) { await page.click(`${P} [data-recent-del] >> nth=0`); await page.waitForTimeout(100); }
    await page.waitForTimeout(200);
    L = await ledger();
    assert(L.length === 2 && L.every(l => l.posted), JSON.stringify(L));
    await enter(page, 'purchase', 'budget');
    await page.waitForSelector(`${P} .bd-card`);
    assert((await page.textContent(`${P} .bd-card`)).includes('(최근 작성에 없음)'), '밀려난·지운 품의 표시');
  }],
  ['390px 폭에서 예산 탭이 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(200);
    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 1, '넘침 ' + over);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
