// 품의 사유 꼴(1. 관련: … / 2. 첫 문장 / 가. 나. 다.)과 1인칭·구어 빼기: 「내가 필요한 책 50권」을 넣어도 품명·제목·목적에 「내가 필요한」이 없음,
// 관련 칸(비우면 학교 교육과정 운영 계획)을 고치면 사유 첫 줄이 따라 바뀌고, 사유 첫 줄을 고치면 관련 칸으로
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '내가 필요한 책 구입', intro: '내가 필요한 책을 다음과 같이 구입하고자 합니다.', fields: { purpose: '내가 필요한 책 구입' } });
  return '{}';
});
const P = 'section[data-menu="purchase"]';
const reason = () => page.inputValue(`${P} #pcReason`);
const year = () => page.evaluate(async () => (await import('./core/years.js')).getYears(localStorage).current);
await page.goto(url);
await page.waitForTimeout(400);

await run('purchase-format', [
  ['「내가 필요한 책 50권 12,000원」 → 품명 「책」, 제목 「책 구입」, 사유는 1. 관련 / 2. 첫 문장 / 가. 목적(두 칸 들여 씀)', async () => {
    await page.click('nav.app-side [data-menu-go="purchase"]');
    await page.fill(`${P} #pcIntake`, '내가 필요한 책 50권 12,000원');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P);
    const y = await year();
    assert((await page.inputValue(`${P} #pcTitle`)) === '책 구입', await page.inputValue(`${P} #pcTitle`));
    const lines = (await reason()).split('\n');
    assert(lines[0] === `1. 관련: ${y}학년도 학교 교육과정 운영 계획` && lines[1] === '2. 책을 다음과 같이 구입하고자 합니다.' && lines[2] === '  가. 목적: 책 구입', JSON.stringify(lines.slice(0, 4)));
    assert(!(await reason()).includes('내가'), await reason());
    const form = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current')).form);
    assert(form.items[0].name === '책' && form.items[0].qty === '50' && form.purpose === '책 구입', JSON.stringify(form.items[0]));
    assert((await page.textContent(`${P} #pcChips`)).includes('관련 · 기본값으로 넣음'), await page.textContent(`${P} #pcChips`));
    const p = prompts.find(x => x.startsWith('[품의 초안]'));
    assert(p.includes('「내가 필요한」') && p.includes('1. 관련'), '초안 AI 지시');
  }],
  ['관련 칸을 고치면 사유 첫 줄이 따라 바뀜(첫 문장·가~ 그대로)', async () => {
    await page.click(`${P} #pcMore summary`);
    await page.fill(`${P} #pcRelated`, '2026학년도 독서 교육 계획');
    await page.waitForTimeout(200);
    const lines = (await reason()).split('\n');
    assert(lines[0] === '1. 관련: 2026학년도 독서 교육 계획' && lines[1] === '2. 책을 다음과 같이 구입하고자 합니다.', JSON.stringify(lines.slice(0, 3)));
    assert(!(await page.textContent(`${P} #pcChips`)).includes('관련 · 기본값'), '기본값 칩이 남음');
  }],
  ['사유의 「1. 관련:」 줄만 고치면 관련 칸으로 옮겨지고 손으로 고친 사유로 보지 않음', async () => {
    const r = await reason();
    await page.fill(`${P} #pcReason`, r.replace(/^1\. 관련: [^\n]*/, '1. 관련: ○○교육청 독서교육과-123(2026. 10. 5.)'));
    await page.waitForTimeout(200);
    const cur = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current')));
    assert(cur.form.related === '○○교육청 독서교육과-123(2026. 10. 5.)' && cur.draft.edited === false, JSON.stringify([cur.form.related, cur.draft.edited]));
    assert((await page.inputValue(`${P} #pcRelated`)) === '○○교육청 독서교육과-123(2026. 10. 5.)', '관련 칸');
    // 그 뒤 품목이 바뀌어도 관련·첫 문장은 그대로, 가~는 다시 맞춤
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '40');
    await page.waitForTimeout(200);
    const r2 = await reason();
    assert(r2.startsWith('1. 관련: ○○교육청 독서교육과-123(2026. 10. 5.)\n2. 책을 다음과 같이') && r2.includes('금480,000원'), r2);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
