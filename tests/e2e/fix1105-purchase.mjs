// 2026-11-05 2차 버그 찾기에서 고친 것(품의 화면): 「1. 관련:」 줄을 지우거나 바꾸거나 여러 줄로 써도 [사유 다시 맞추기]가 줄을 겹치지 않음,
// 관련 글을 비워도 다음 줄이 관련 칸으로 가지 않음, 캡처를 읽거나 앞 품의 초안이 와도 치던 한글 조합이 끊기지 않음,
// AI가 읽는 동안 넣기 칸에 더 친 줄이 남음, 관련 칸 안내가 사업명을 따라 바뀜.
// 기능: 새 품의 AI 줄을 쪽지 작성처럼 머리(「새 품의」 제목 줄 오른쪽)에 둠(초안 카드 안에는 없음), 좁은 창에서도 넘치지 않음
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const JPG = { name: '장바구니.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(FIXTURES, 'photo-1.jpg')) };
const INTRO = '독서 교육을 위하여 도서를 다음과 같이 구입하고자 합니다.';
let readDelay = 0, draftDelay = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[품의 넣기]')) { await sleep(readDelay); return JSON.stringify({ items: [{ name: '색연필', qty: 3, price: 5000 }] }); }
  if (prompt.startsWith('[품의 초안]')) { await sleep(draftDelay); return JSON.stringify({ title: '학급 문고 도서 구입', intro: INTRO, fields: { purpose: '독서 교육' } }); }
  return '[]';
});
const P = 'section[data-menu="purchase"]';
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'));
const reason = () => page.inputValue(`${P} #pcReason`);
const count = (s, part) => s.split(part).length - 1;
const QTY = `${P} [data-item="0"][data-f="qty"]`;
/* 저장 공간을 정하고 다시 열어 품의 › 새 품의로 */
async function reset(keys = {}) {
  await page.evaluate(k => {
    for (const x of Object.keys(localStorage)) if (x.startsWith('ssam:purchase')) localStorage.removeItem(x);
    localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
    for (const [x, v] of Object.entries(k)) localStorage.setItem('ssam:' + x, JSON.stringify(v));
  }, keys);
  await page.reload({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.click('nav.app-side [data-menu-go="purchase"]');
  await page.click('#menuTabs [data-tab="new"]');
  await page.waitForSelector(`${P} #pcIntake`);
  readDelay = 0; draftDelay = 0;
}
/* 넣기 칸에 한 줄 넣고 [초안 만들기] → 초안이 올 때까지 */
async function makeDraft(text = '동화책 10권 12000원') {
  await page.fill(`${P} #pcIntake`, text);
  await page.click(`${P} [data-pc="go"]`);
  await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P);
}
/* 수량을 바꾸고 [사유 다시 맞추기] */
async function resyncWith(qty) {
  await page.fill(QTY, String(qty));
  await page.waitForTimeout(150);
  assert((await page.textContent(`${P} #pcResyncBox`)).includes('사유 다시 맞추기'), '다시 맞추기 버튼이 없음');
  await page.click(`${P} [data-pc="resync"]`);
  await page.waitForTimeout(150);
  return reason();
}
const has = name => () => page.waitForFunction(n => (JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null') || { form: { items: [] } }).form.items.some(i => i.name === n), name, { timeout: 6000 });
/* 칸에 「미술 수」를 치고 「어」를 조합하는 중에 wait()를 기다린 뒤 「업」으로 확정 → [같은 칸 요소인가, 칸 값] */
async function composeWhile(sel, wait) {
  const cdp = await page.context().newCDPSession(page);
  await page.click(sel);
  await page.keyboard.insertText('미술 수');
  await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '어', selectionStart: 1, selectionEnd: 1 });
  await page.evaluate(s => { window.__pcEl = document.querySelector(s); }, sel);
  await wait();
  await page.waitForTimeout(150);
  const same = await page.evaluate(s => window.__pcEl === document.querySelector(s), sel);
  await cdp.send('Input.imeSetComposition', { text: '업', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '업' });
  await page.waitForTimeout(150);
  await cdp.detach();
  return [same, await page.inputValue(sel)];
}
const box = async sel => {
  for (let i = 0; i < 20; i++) { const b = await page.locator(sel).first().boundingBox().catch(() => null); if (b) return b; await page.waitForTimeout(100); }
  return null;
};

await page.goto(url);
await page.waitForTimeout(300);

await run('fix1105-purchase', [
  ['[purchase2-1] 「1. 관련:」 줄을 지우고 수량을 바꾼 뒤 [사유 다시 맞추기]를 눌러도 2.·가~다 줄이 한 번만, 새 금액만(또 고쳐도)', async () => {
    await reset({ 'purchase:view': 'full' });
    await makeDraft();
    const r0 = await reason();
    await page.fill(`${P} #pcReason`, r0.split('\n').slice(1).join('\n'));
    let r = await resyncWith(12);
    assert(count(r, '가. 목적') === 1 && count(r, `2. ${INTRO}`) === 1 && r.includes('금144,000원') && !r.includes('120,000'), r);
    assert(r.startsWith(`2. ${INTRO}\n`), '지운 관련 줄이 살아남: ' + r.split('\n')[0]);
    r = await resyncWith(15);
    assert(count(r, '가. 목적') === 1 && r.includes('금180,000원') && !r.includes('144,000') && !r.includes('120,000'), r);
  }],
  ['[purchase2-1] 「1. 근거: …」·쌍점 없는 「1. 관련」 + 가. 줄로 바꾸고 다시 맞추면 그 머리는 그대로, 2. 줄은 한 번만', async () => {
    for (const head of ['1. 근거: ○○교육청 과학과-1234(2026. 11. 2.)', '1. 관련\n  가. ○○교육청 과학과-1234(2026. 11. 2.)']) {
      await reset({ 'purchase:view': 'full' });
      await makeDraft();
      await page.fill(`${P} #pcReason`, (await reason()).replace(/^1\. 관련: [^\n]*/, head));
      const r = await resyncWith(12);
      assert(r.startsWith(`${head}\n2. ${INTRO}\n  가. 목적`) && count(r, '가. 목적') === 1 && !r.includes('120,000'), r);
      assert((await state()).form.related === '', '관련 칸: ' + (await state()).form.related);
    }
  }],
  ['[purchase2-2] 사유의 관련 글을 Backspace로 다 지우면 관련 칸이 비고(다음 줄·글 조각이 들어가지 않음), 다시 맞추면 기본값', async () => {
    await reset({ 'purchase:view': 'full' });
    await makeDraft();
    const first = (await reason()).split('\n')[0];
    await page.evaluate(([s, n]) => { const ta = document.querySelector(`${s} #pcReason`); ta.focus(); ta.setSelectionRange(n, n); }, [P, first.length]);
    for (let i = 0; i < first.length - '1. 관련: '.length; i++) await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);
    const s = await state();
    assert(s.form.related === '' && (await page.inputValue(`${P} #pcRelated`)) === '', '관련 칸: ' + JSON.stringify(s.form.related));
    assert((await page.textContent(`${P} #pcResyncBox`)).includes('사유 다시 맞추기'), '다시 맞추기 버튼');
    await page.click(`${P} [data-pc="resync"]`);
    await page.waitForTimeout(150);
    const lines = (await reason()).split('\n');
    assert(lines[0] === '1. 관련: 2026학년도 학교 교육과정 운영 계획' && lines[1] === `2. ${INTRO}`, JSON.stringify(lines.slice(0, 2)));
  }],
  ['[purchase2-2] 관련을 여러 줄(가. 나.)로 쓰면 관련 칸으로 옮기지 않고, 다시 맞춰도 나. 줄까지 그대로', async () => {
    for (const head of ['1. 관련:\n  가. ○○교육청 과학과-1234(2026. 11. 2.)\n  나. 2026학년도 독서 교육 운영 계획', '1. 관련: 가. ○○교육청 과학과-1234(2026. 11. 2.)\n          나. 2026학년도 독서 교육 운영 계획']) {
      await reset({ 'purchase:view': 'full' });
      await makeDraft();
      await page.fill(`${P} #pcReason`, (await reason()).replace(/^1\. 관련: [^\n]*/, head));
      await page.waitForTimeout(150);
      assert((await state()).form.related === '' && (await page.inputValue(`${P} #pcRelated`)) === '', '관련 칸: ' + (await state()).form.related);
      const r = await resyncWith(12);
      assert(r.startsWith(`${head}\n2. ${INTRO}\n`) && count(r, '가. 목적') === 1 && r.includes('금144,000원'), r);
    }
  }],
  ['[purchase2-4] 캡처를 AI가 읽는 동안 목적 칸에서 조합하던 한글이 끊기지 않음(품목은 들어감)', async () => {
    await reset({ 'purchase:view': 'full' });
    readDelay = 1500;
    await page.setInputFiles(`${P} #pcIntakeFile`, JPG);
    await page.waitForTimeout(200);
    const [same, val] = await composeWhile(`${P} #pcPurpose`, has('색연필'));
    assert(same && val === '미술 수업', JSON.stringify({ same, val }));
    assert((await state()).form.purpose === '미술 수업', '저장: ' + (await state()).form.purpose);
    assert((await page.inputValue(`${P} [data-item="0"][data-f="name"]`)) === '색연필' && (await page.textContent(`${P} #pcSum`)).includes('15,000'), '품목 표');
  }],
  ['[purchase2-4] [새로 쓰기] 뒤 앞 품의 초안이 와도 새 품의 목적 칸에서 조합하던 한글이 끊기지 않음', async () => {
    await reset({ 'purchase:view': 'full' });
    draftDelay = 1500;
    await page.fill(`${P} #pcIntake`, '비커 8개 4500원');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForTimeout(300);
    await page.click(`${P} [data-pc="fresh"]`);
    await page.waitForTimeout(150);
    if (await page.isVisible('#sheetRoot #pcSwapOk')) await page.click('#sheetRoot #pcSwapOk');
    await page.waitForTimeout(150);
    const [same, val] = await composeWhile(`${P} #pcPurpose`, () => page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:purchase:recent') || '[]').some(r => r.draft && r.draft.title), null, { timeout: 6000 }));
    assert(same && val === '미술 수업', JSON.stringify({ same, val }));
    const go = await page.textContent(`${P} [data-pc="go"]`);
    assert(go.trim() === '초안 만들기' && !(await page.isDisabled(`${P} [data-pc="go"]`)), '버튼: ' + go);
    assert(!(await page.textContent(`${P} #pcDraftCard`)).includes('쓰고 있어요'), '초안 카드가 아직 쓰는 중');
  }],
  ['[purchase2-6] [칸에만 넣기] 글을 AI가 읽는 동안 넣기 칸에 더 친 줄은 읽은 뒤에도 남음', async () => {
    await reset();
    readDelay = 1500;
    await page.fill(`${P} #pcIntake`, '색연필 세 상자요');
    await page.click(`${P} [data-pc="intake"]`);
    await page.waitForTimeout(300);
    await page.click(`${P} #pcIntake`);
    await page.keyboard.press('End');
    await page.keyboard.insertText('\n도화지 20장 4000원');
    await has('색연필')();
    await page.waitForTimeout(150);
    assert((await page.inputValue(`${P} #pcIntake`)) === '도화지 20장 4000원', '넣기 칸: ' + JSON.stringify(await page.inputValue(`${P} #pcIntake`)));
  }],
  ['[purchase2-8] 행사 운영에서 사업명을 치면 관련 칸 안내(비우면 「…」)가 실제 기본값을 따라 바뀜', async () => {
    await reset({ 'purchase:view': 'full' });
    await page.click(`${P} [data-pctype="event"]`);
    await page.fill(`${P} #pcProject`, '가을 학교 축제');
    await page.waitForTimeout(100);
    const ph = await page.getAttribute(`${P} #pcRelated`, 'placeholder');
    assert(ph === '비우면 「2026학년도 가을 학교 축제 운영 계획」', ph);
  }],
  ['[기능] 새 품의 AI 줄은 쪽지 작성처럼 머리(「새 품의」 제목 줄 오른쪽)에 있고, 초안 카드 안에는 없음', async () => {
    await reset();
    const headAI = `${P} .m-head.m-head-row > .m-head-act > [data-ai-row="purchase"]`;
    await page.waitForSelector(`${headAI} .ai-row-t`);
    assert((await page.$$(`${P} [data-ai-row="purchase"]`)).length === 1, 'AI 줄이 둘 이상');
    assert((await page.$$(`${P} #pcDraftCard [data-ai-row]`)).length === 0, '초안 카드 안에 AI 줄');
    const h = await box(`${P} .m-head h2`), ai = await box(headAI);
    assert(h && ai && ai.y < h.y + h.height + 30 && ai.x > h.x + h.width, JSON.stringify({ h, ai }));
    await makeDraft();
    assert((await page.$$(`${P} #pcDraftCard [data-ai-row]`)).length === 0 && (await page.$$(headAI)).length === 1, '초안 뒤 AI 줄 자리');
    assert((await page.textContent(`${headAI} .ai-row-t`)).startsWith('AI:'), 'AI 줄 글');
  }],
  ['[기능] 390px 폭에서 새 품의(초안 있음)가 가로로 넘치지 않고 AI 줄도 창 안에 있음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const w = await page.evaluate(() => [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth, document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert(w[0] <= w[1] && w[2] <= w[3], '넘침: ' + w);
    const ai = await box(`${P} .m-head [data-ai-row="purchase"]`);
    assert(ai && ai.x >= 0 && ai.x + ai.width <= 390, JSON.stringify(ai));
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
