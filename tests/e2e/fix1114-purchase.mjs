// 2026-11-14 품의 버그 찾기(화면): 쉼표로 이은 품목 여럿을 넣으면 품목마다 줄이 생기고 합계가 맞음,
// 「관련」 칸의 주민번호는 초안 전에 막음(빨간 칸·확인 목록), 넣은 글의 학생 이름은 초안 AI로 가지 않음
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '시상품 구입', intro: '학생 시상을 위하여 물품을 다음과 같이 구입하고자 합니다.', fields: { purpose: '학생 시상' } });
  return JSON.stringify({ items: [] });
});
const P = 'section[data-menu="purchase"]';
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'));
async function reset() {
  await page.evaluate(() => {
    for (const x of Object.keys(localStorage)) if (x.startsWith('ssam:purchase')) localStorage.removeItem(x);
    localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  });
  await page.reload({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.click('nav.app-side [data-menu-go="purchase"]');
  await page.click('#menuTabs [data-tab="new"]');
  await page.waitForSelector(`${P} #pcIntake`);
  prompts.length = 0;
}

await page.goto(url);
await page.waitForTimeout(300);

await run('fix1114-purchase', [
  ['한 줄에 쉼표로 이은 품목 둘 → [칸에만 넣기]로 품목 두 줄, 합계 40,000원', async () => {
    await reset();
    await page.fill(`${P} #pcIntake`, '색종이 10묶음 3,000원, 풀 20개 500원');
    await page.click(`${P} [data-pc="intake"]`);
    await page.waitForFunction(() => ((JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null') || { form: { items: [] } }).form.items.filter(i => i.name).length === 2));
    const s = await state();
    assert(JSON.stringify(s.form.items.map(i => [i.name, i.qty, i.price])) === JSON.stringify([['색종이', '10', '3000'], ['풀', '20', '500']]), JSON.stringify(s.form.items));
    assert((await page.textContent(`${P} #pcSum`)).includes('40,000'), await page.textContent(`${P} #pcSum`));
  }],
  ['「관련」 칸에 주민번호 → [초안 만들기]를 눌러도 AI를 부르지 않고 관련 칸이 빨갛게', async () => {
    await reset();
    await page.evaluate(() => { document.querySelector('#pcMore').open = true; });
    await page.fill(`${P} #pcRelated`, '900101-1234567');
    await page.fill(`${P} #pcPurpose`, '수업');
    await page.fill(`${P} [data-item="0"][data-f="name"]`, '공책');
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '20');
    await page.fill(`${P} [data-item="0"][data-f="price"]`, '1000');
    await page.click(`${P} [data-pc="draft"]`);
    await page.waitForTimeout(300);
    assert(prompts.length === 0, 'AI를 불렀음');
    assert(await page.evaluate(() => document.querySelector('#pcRelated').classList.contains('bad')), '관련 칸이 빨갛지 않음');
    assert((await page.textContent(`${P} #pcChecks`)).includes('관련'), await page.textContent(`${P} #pcChecks`));
  }],
  ['넣은 글의 「김하늘 학생」은 초안 AI에 ○○○로 감', async () => {
    await reset();
    await page.fill(`${P} #pcIntake`, '김하늘 학생 상장 액자 1개 5,000원');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P);
    const p = prompts.find(x => x.startsWith('[품의 초안]')) || '';
    assert(p && !p.includes('김하늘') && p.includes('○○○ 학생'), p.slice(0, 400));
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
