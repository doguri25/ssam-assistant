// 2026-11-04 버그 찾기에서 고친 것(품의 화면): AI가 읽는 동안 다른 품의를 열어도 섞이지 않음, 관련 칸·사유 첫 줄·[사유 다시 맞추기]·칩이 함께 움직임,
// 초안이 와도 쓰던 칸의 초점·한글 조합이 끊기지 않음, 예전 꼴로 손으로 고친 초안을 열어도 [사유 다시 맞추기]가 뜨지 않음
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const JPG = { name: '견적.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(FIXTURES, 'photo-1.jpg')) };
const prompts = [];
let readDelay = 0, draftDelay = 0, draftReply = null;
const DEF_DRAFT = { title: '비커 구입', intro: '실험을 위하여 비커를 다음과 같이 구입하고자 합니다.', fields: { purpose: '실험' } };
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt.split('\n')[0]);
  if (prompt.startsWith('[품의 넣기]')) { await new Promise(r => setTimeout(r, readDelay)); return JSON.stringify({ items: [{ name: '색연필', qty: 3, price: 5000 }] }); }
  if (prompt.startsWith('[품의 초안]')) { await new Promise(r => setTimeout(r, draftDelay)); return JSON.stringify(draftReply || DEF_DRAFT); }
  return '[]';
});
const P = 'section[data-menu="purchase"]';
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'));
const recent = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:recent') || '[]'));
const reason = () => page.inputValue(`${P} #pcReason`);
const chips = () => page.textContent(`${P} #pcChips`);
/* 저장 공간을 정하고 다시 열어 품의 › 새 품의로 */
async function reset(keys = {}) {
  await page.evaluate(k => {
    for (const x of Object.keys(localStorage)) if (x.startsWith('ssam:purchase')) localStorage.removeItem(x);
    localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
    for (const [x, v] of Object.entries(k)) localStorage.setItem('ssam:' + x, JSON.stringify(v));
  }, keys);
  await page.reload({ timeout: 20000 }); // 다른 일로 바쁜 컴퓨터에서도
  await page.waitForTimeout(300);
  await page.click('nav.app-side [data-menu-go="purchase"]');
  await page.waitForSelector(`${P} #pcIntake`);
  prompts.length = 0; readDelay = 0; draftDelay = 0; draftReply = null;
}
/* 넣기 칸에 한 줄 넣고 [초안 만들기] → 초안이 올 때까지 */
async function makeDraft(text = '비커 8개 4500원') {
  await page.fill(`${P} #pcIntake`, text);
  await page.click(`${P} [data-pc="go"]`);
  await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P);
}
const formY = { type: 'goods', related: '', project: '학급 문고', purpose: '독서 교육', date: '', target: '', place: '', budget: '', budgetUnknown: false, total: '', memo: '',
  items: [{ name: '동화책', spec: '', unit: '권', qty: '10', price: '12000', vendor: '' }], vat: true, income: 'other', attach: ['quote'], attachMore: [], typeSet: true, guessed: [] };
const HAND = '손으로 쓴 중요한 줄';
const Y = { id: 'pcY', at: 1, form: formY, draft: { title: '학급 문고 도서 구입', intro: '독서 교육을 위하여 도서를 다음과 같이 구입하고자 합니다.',
  reason: `1. 관련: 2026학년도 독서 교육 계획\n2. 독서 교육을 위하여 도서를 다음과 같이 구입하고자 합니다.\n  가. 목적: 독서 교육\n${HAND}\n\n붙임  1. 지출품의서 1부.  끝.`, edited: true, tail: 'x' } };
/* 최근 작성 › Y [열기] */
async function openY() {
  await page.click('#menuTabs [data-tab="recent"]');
  await page.click(`${P} [data-recent-open="pcY"]`);
  await page.waitForSelector(`${P} #pcReason`);
}
/* 다른 품의를 연 뒤 Y가 그대로이고, 읽은 품목은 쓰던 품의(최근 작성)에 */
async function yKept() {
  const s = await state(), rec = await recent();
  assert(s.id === 'pcY' && s.form.items.map(i => i.name).join(',') === '동화책', 'Y 품목: ' + s.form.items.map(i => i.name).join(','));
  assert(s.draft.title === '학급 문고 도서 구입' && s.draft.reason.includes(HAND), 'Y 초안이 바뀜: ' + s.draft.title);
  const ry = rec.find(r => r.id === 'pcY');
  assert(ry && ry.draft.title === '학급 문고 도서 구입' && ry.draft.reason.includes(HAND), '최근 작성의 Y가 바뀜');
  const other = rec.find(r => r.id !== 'pcY' && r.form.items.some(i => i.name === '색연필'));
  assert(other, '읽은 품목이 최근 작성에 없음: ' + JSON.stringify(rec.map(r => [r.id, r.form.items.map(i => i.name)])));
  assert(!prompts.includes('[품의 초안]'), '다른 품의에서 초안 AI를 부름: ' + prompts.join(','));
  assert(!(await page.isVisible('#sheetRoot .sheet')), '창이 떠 있음');
}

await page.goto(url);
await page.waitForTimeout(300);

await run('fix1104-purchase', [
  ['[purchase-1] 떠 있는 버튼 견적서를 AI가 읽는 동안 최근 작성의 다른 품의를 열면, 그 품의에 품목이 섞이거나 초안이 덮이지 않음', async () => {
    await reset({ 'purchase:recent': [Y] });
    readDelay = 1500;
    await page.setInputFiles('#inboxFile', JPG);
    await page.waitForSelector('#sheetRoot .sheet #ibRun:not([disabled])');
    await page.click('#sheetRoot .sheet #ibRun');
    await page.waitForTimeout(400);
    await openY();
    assert((await reason()).includes(HAND), 'Y를 엶');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:purchase:recent') || '[]').some(r => r.id !== 'pcY'), null, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    await yKept();
  }],
  ['[purchase-1] 넣기 칸 글을 AI가 읽는 동안([초안 만들기]) 다른 품의를 열어도 그 품의에 품목이 섞이거나 초안을 쓰지 않음', async () => {
    await reset({ 'purchase:recent': [Y] });
    readDelay = 1500;
    await page.fill(`${P} #pcIntake`, '색연필 세 상자요');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForTimeout(400);
    await openY();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:purchase:recent') || '[]').some(r => r.id !== 'pcY'), null, { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    await yKept();
  }],
  ['[purchase-2] 사유를 손으로 고친 뒤 관련 칸을 채우면 사유 첫 줄이 따라 바뀌고(손으로 고친 줄은 그대로) 칩도 사라짐', async () => {
    await reset();
    await makeDraft();
    const r0 = await reason();
    await page.fill(`${P} #pcReason`, r0.replace('  가. 목적: 실험', '  가. 목적: 실험(용해와 용액 단원)'));
    await page.waitForTimeout(150);
    assert((await state()).draft.edited === true, '손으로 고친 사유');
    await page.click(`${P} #pcMore summary`);
    await page.fill(`${P} #pcRelated`, '○○교육청 과학과-1234(2026. 11. 2.)');
    await page.waitForTimeout(200);
    const lines = (await reason()).split('\n');
    assert(lines[0] === '1. 관련: ○○교육청 과학과-1234(2026. 11. 2.)' && lines[2] === '  가. 목적: 실험(용해와 용액 단원)', JSON.stringify(lines.slice(0, 3)));
    const s = await state();
    assert(s.draft.reason.startsWith('1. 관련: ○○교육청 과학과-1234(2026. 11. 2.)\n') && s.draft.edited === true, '저장된 사유: ' + s.draft.reason.split('\n')[0]);
    assert(!(await chips()).includes('관련 · 기본값'), '기본값 칩이 남음');
    assert((await page.textContent(`${P} #pcResyncBox`)).trim() === '', '다시 맞추기가 뜸');
    // 관련 칸을 비우면 기본값으로 돌아감
    await page.fill(`${P} #pcRelated`, '');
    await page.waitForTimeout(200);
    assert((await reason()).split('\n')[0].endsWith('학교 교육과정 운영 계획') && (await reason()).includes('실험(용해와 용액 단원)'), (await reason()).split('\n')[0]);
  }],
  ['[purchase-2] 사유의 관련 줄과 가. 줄을 한 번에 고치면 관련이 칸으로 옮겨지고, [사유 다시 맞추기] 뒤에도 손으로 쓴 관련이 남음', async () => {
    await reset();
    await makeDraft();
    const r0 = await reason();
    await page.fill(`${P} #pcReason`, r0.replace(/^1\. 관련: [^\n]*/, '1. 관련: ○○교육청 과학과-1234(2026. 11. 2.)').replace('  가. 목적: 실험', '  가. 목적: 실험(용해와 용액)'));
    await page.waitForTimeout(200);
    const s = await state();
    assert(s.form.related === '○○교육청 과학과-1234(2026. 11. 2.)' && s.draft.edited === true, JSON.stringify([s.form.related, s.draft.edited]));
    assert(!(await chips()).includes('관련 · 기본값'), '기본값 칩이 남음');
    await page.click(`${P} #pcMore summary`);
    assert((await page.inputValue(`${P} #pcRelated`)) === '○○교육청 과학과-1234(2026. 11. 2.)', '관련 칸');
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '10');
    await page.waitForTimeout(200);
    assert((await page.textContent(`${P} #pcResyncBox`)).includes('사유 다시 맞추기'), '다시 맞추기 버튼');
    await page.click(`${P} [data-pc="resync"]`);
    await page.waitForTimeout(200);
    const lines = (await reason()).split('\n');
    assert(lines[0] === '1. 관련: ○○교육청 과학과-1234(2026. 11. 2.)' && lines[1].startsWith('2. 실험을 위하여') && (await reason()).includes('금45,000원'), JSON.stringify(lines.slice(0, 2)));
  }],
  ['[purchase-2] 사유의 관련 줄만 고쳐 칸으로 옮겨지면 「관련 · 기본값으로 넣음」 칩이 사라짐', async () => {
    await reset();
    await makeDraft();
    assert((await chips()).includes('관련 · 기본값으로 넣음'), '처음 칩');
    const r0 = await reason();
    await page.fill(`${P} #pcReason`, r0.replace(/^1\. 관련: [^\n]*/, '1. 관련: ○○교육청 과학과-1234(2026. 11. 2.)'));
    await page.waitForTimeout(200);
    const s = await state();
    assert(s.form.related === '○○교육청 과학과-1234(2026. 11. 2.)' && s.draft.edited === false, JSON.stringify([s.form.related, s.draft.edited]));
    assert(!(await chips()).includes('관련 · 기본값'), '기본값 칩이 남음: ' + await chips());
  }],
  ['[purchase-7] AI 초안이 오는 동안 장소 칸에 치던 글자의 초점·한글 조합이 끊기지 않음', async () => {
    await reset({ 'purchase:view': 'full' });
    draftDelay = 1500;
    await page.fill(`${P} #pcPurpose`, '실험');
    await page.fill(`${P} #pcIntake`, '비커 8개 4500원');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForTimeout(300);
    await page.click(`${P} #pcPlace`);
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.type('과학');
    await cdp.send('Input.imeSetComposition', { selectionStart: 1, selectionEnd: 1, text: '시' });
    await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P, { timeout: 6000 });
    await page.waitForTimeout(100);
    const active = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert(active === 'pcPlace', '초점: ' + active);
    await cdp.send('Input.imeSetComposition', { selectionStart: 1, selectionEnd: 1, text: '실' });
    await cdp.send('Input.insertText', { text: '실' });
    await page.waitForTimeout(150);
    assert((await page.inputValue(`${P} #pcPlace`)) === '과학실', '장소 칸: ' + await page.inputValue(`${P} #pcPlace`));
    await page.waitForTimeout(150);
    assert((await state()).form.place === '과학실' && (await reason()).includes('장소: 과학실'), '저장·사유');
    await cdp.detach();
  }],
  ['[purchase-7] 목적이 빈 초안이 와도 치던 칸에서 목적 칸으로 초점이 뛰지 않음(알림은 보임)', async () => {
    await reset({ 'purchase:view': 'full' });
    draftDelay = 1500; draftReply = { title: '비커 구입', intro: '비커를 다음과 같이 구입하고자 합니다.', fields: {} };
    await page.fill(`${P} #pcIntake`, '비커 8개 4500원');
    await page.click(`${P} [data-pc="go"]`);
    await page.waitForTimeout(300);
    await page.click(`${P} #pcPlace`);
    await page.keyboard.type('과학');
    await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P, { timeout: 6000 });
    await page.waitForTimeout(100);
    await page.keyboard.type('실');
    const active = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert(active === 'pcPlace' && (await page.inputValue(`${P} #pcPlace`)) === '과학실' && (await page.inputValue(`${P} #pcPurpose`)) === '', JSON.stringify([active, await page.inputValue(`${P} #pcPurpose`)]));
    assert((await page.textContent(`${P} #pcMsg`)).includes('목적'), '목적 알림');
  }],
  ['[purchase-7] 캡처를 AI가 읽는 동안 다른 칸에 치던 초점이 다시 그린 뒤에도 그 칸에 남음', async () => {
    await reset({ 'purchase:view': 'full' });
    readDelay = 1200;
    await page.setInputFiles(`${P} #pcIntakeFile`, JPG);
    await page.waitForTimeout(200);
    await page.click(`${P} #pcPlace`);
    await page.keyboard.type('과학');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null') || { form: { items: [] } }).form.items.some(i => i.name === '색연필'), null, { timeout: 6000 });
    await page.waitForTimeout(150);
    await page.keyboard.type('실');
    const active = await page.evaluate(() => document.activeElement && document.activeElement.id);
    assert(active === 'pcPlace' && (await page.inputValue(`${P} #pcPlace`)) === '과학실', JSON.stringify([active, await page.inputValue(`${P} #pcPlace`)]));
  }],
  ['[purchase-8] 예전 꼴(들여쓰기 없는 가.)로 손으로 고친 초안을 열면, 바뀐 것이 없으면 [사유 다시 맞추기]가 뜨지 않음', async () => {
    const form = { ...formY, project: '', purpose: '과학 실험', items: [{ name: '비커', spec: '', unit: '', qty: '8', price: '4500', vendor: '' }] };
    const oldTail = '가. 목적: 과학 실험\n나. 소요 예산: 금36,000원(금삼만육천원)\n다. 산출 근거: 비커 4,500원 × 8개 = 36,000원\n\n붙임  1. 지출품의서 1부.\n      2. 견적서 1부.  끝.';
    const intro = '과학 실험을 위하여 실험 재료를 다음과 같이 구입하고자 합니다.';
    const old = `${intro} (담당: 과학부)\n\n${oldTail}`;
    await reset({ 'purchase:current': { id: 'pcold', form, draft: { title: '과학 실험 재료 구입', intro, reason: old, edited: true, tail: oldTail } } });
    assert((await reason()) === old, '예전 사유가 그대로 보임');
    assert((await page.textContent(`${P} #pcResyncBox`)).trim() === '', '다시 맞추기가 뜸: ' + await page.textContent(`${P} #pcResyncBox`));
    // 품목이 바뀌면 그때는 뜸
    await page.click(`${P} #pcMore summary`);
    await page.fill(`${P} [data-item="0"][data-f="qty"]`, '10');
    await page.waitForTimeout(200);
    assert((await page.textContent(`${P} #pcResyncBox`)).includes('사유 다시 맞추기'), '품목이 바뀌어도 안 뜸');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
