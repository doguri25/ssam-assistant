// 2026-11-19 다섯 번째 버그 찾기: 품의 › 예산 탭에서 품의 줄의 사업을 바꾸면, 그 품의를 새 품의에서 고치거나 최근 작성에서 [열기]해도
// 예전 사업으로 되돌아가지 않음(사업 칸도 바꾼 사업). 예시는 지어낸 것
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
  localStorage.setItem('ssam:budget:projects', JSON.stringify([{ id: 'bpA', name: '과학 교육', amount: 500000, due: '', planKey: '과학교육', at: 1 }, { id: 'bpB', name: '친구사랑 주간', amount: 300000, due: '', planKey: '친구사랑주간', at: 2 }]));
});
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '과학 실험 재료 구입', intro: '과학 실험 재료를 구매하고자 합니다.', fields: {} });
  if (prompt.startsWith('[품의 검토]')) return JSON.stringify({ items: [] });
  return '{}';
});
const P = 'section[data-menu="purchase"]';
const ledger = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:budget:ledger') || '[]').map(l => l.project));
const picked = () => page.$eval(`${P} #pcProjectSel`, s => s.options[s.selectedIndex].textContent);
await page.goto(url);
await page.waitForTimeout(400);

await run('fix1119-bugs5-budget-move', [
  ['지금 쓰는 품의 줄을 예산 탭에서 옮기면 새 품의 사업 칸도 그 사업, 칸을 고쳐도 장부는 그대로', async () => {
    await enter(page, 'purchase', 'new');
    await page.fill(`${P} #pcIntake`, '비커 8개 4,500원');
    await page.click(`${P} [data-pc="intake"]`);
    await page.waitForTimeout(300);
    await page.fill(`${P} #pcPurpose`, '용해와 용액 실험');
    await page.selectOption(`${P} #pcProjectSel`, 'bpA');
    await page.click(`${P} [data-pc="draft"]`);
    await page.waitForSelector(`${P} [data-pc="post"]`);
    assert(JSON.stringify(await ledger()) === '["bpA"]', JSON.stringify(await ledger()));
    await enter(page, 'purchase', 'budget');
    await page.waitForSelector(`${P} [data-bd-move]`);
    await page.selectOption(`${P} [data-bd-move]`, 'bpB');
    await page.waitForTimeout(200);
    await enter(page, 'purchase', 'new');
    await page.waitForSelector(`${P} #pcProjectSel`);
    assert((await picked()) === '친구사랑 주간', '사업 칸 ' + (await picked()));
    await page.fill(`${P} #pcMemo`, '과학실');
    await page.waitForTimeout(300);
    assert(JSON.stringify(await ledger()) === '["bpB"]', '칸을 고친 뒤 장부 ' + JSON.stringify(await ledger()));
  }],
  ['최근 작성 품의 줄을 옮긴 뒤 [열기]해도 장부·사업 칸이 바꾼 사업(사업 없음)', async () => {
    await page.click(`${P} [data-pc="fresh"]`);
    await page.waitForTimeout(300);
    await enter(page, 'purchase', 'budget');
    await page.waitForSelector(`${P} [data-bd-move]`);
    await page.selectOption(`${P} [data-bd-move]`, '');
    await page.waitForTimeout(200);
    assert(JSON.stringify(await ledger()) === '[""]', JSON.stringify(await ledger()));
    await page.click(`${P} [data-recent-open]`);
    await page.waitForSelector(`${P} #pcProjectSel`);
    await page.waitForTimeout(300);
    assert(JSON.stringify(await ledger()) === '[""]', '[열기] 뒤 장부 ' + JSON.stringify(await ledger()));
    assert((await picked()) === '사업 없음', '사업 칸 ' + (await picked()));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
