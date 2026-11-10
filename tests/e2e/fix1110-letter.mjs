// 가정통신문 남은 고침(2026-11-10): 번역본 M5 [처음부터 다시 번역]이 중간에 멈춰도 다시 번역하지 못한 줄은 전 번역이 남음,
// M6 번역하는 동안 선생님이 친 번역 칸은 덮지 않음, M7 개인정보라 보내지 않은 줄을 내려받기 알림에 알림,
// 탭을 열자마자 고른 파일·치던 글이 학교 양식 목록을 읽은 뒤 다시 그린 화면에 지워지지 않음
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
page.on('dialog', d => d.accept());
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
// 줄 30개 · 줄마다 150자쯤 → 번역은 AI 두 번(한 번에 4000자까지)
const ITEMS = Array.from({ length: 30 }, (_, i) => `${i + 1}. 안내 ${i + 1}: ${'가나다라마바사아자차'.repeat(14)}`);
const TR = { pre: 'VI', delay: 0, failAt: 0, n: 0 };
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[가정통신문 번역]')) {
    TR.n++;
    if (TR.delay) await new Promise(r => setTimeout(r, TR.delay));
    if (TR.failAt && TR.n === TR.failAt) return { status: 400 };
    const out = {};
    for (const m of prompt.matchAll(/^\[(\d+)\] (.*)$/gm)) out[m[1]] = `${TR.pre}: ${m[2]}`;
    return JSON.stringify(out);
  }
  return JSON.stringify({ title: '가을 현장체험학습 안내', greeting: ['안녕하십니까?'], intro: '현장체험학습을 다음과 같이 실시합니다.', items: [...ITEMS.slice(0, 28), '정우진, 강민준, 이서연'],
    closing: '협조를 부탁드립니다.', reply: { need: false }, short: '', related: [], target: '보호자' });
});
const P = 'section[data-menu="etc"] .lf-box', C = `${P} #lfTrCard`;
const FORM = readFileSync(join(ROOT, 'samples', '가정통신문-양식-예시.hwpx'));
const trOf = ko => page.inputValue(`${C} textarea[data-lt-ko="${ko.replace(/"/g, '\\"')}"]`);
const toast = () => page.textContent('#toast');
/* page.evaluate(fn, arg)가 참이 될 때까지(waitForFunction은 async 함수의 Promise를 참으로 봄) */
const until = async (fn, arg, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await page.evaluate(fn, arg)) return; await page.waitForTimeout(50); } throw new Error('until: 시간 초과'); };
/* 번역을 시작한 뒤(AI를 n번까지 부름) 다 마칠 때까지 */
const idle = async n => {
  for (const t0 = Date.now(); TR.n < n && Date.now() - t0 < 10000;) await page.waitForTimeout(50);
  await until(async () => { const m = await import('/menus/etc/letter.js'); return !m.F.trBusy; }, null, 10000);
};
/* 학교 양식 목록을 다 읽고(고른 양식이 있으면 그것까지) 다시 그릴 때까지 */
const formsLoaded = (withForm = false) => until(async w => {
  const m = await import('/menus/etc/letter.js');
  if (!m.F.store) return false;
  await m.F.store.list();
  if (w && !(m.F.form && m.F.form.parsed)) return false;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
}, withForm);

await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="etc"]');
await page.click('#menuTabs [data-tab="letter"]');
await page.waitForSelector(`${P} #lfMemo`);
await formsLoaded();

await run('fix1110-letter', [
  ['M7 개인정보가 있어 AI로 보내지 않은 줄(한국어 그대로)은 내려받기 알림에 「한국어만 넣었어요」로 알림', async () => {
    await page.fill(`${P} #lfMemo`, '현장체험학습');
    await page.click(`${P} [data-lf="write"]`);
    await page.waitForSelector(`${P} [data-lo="title"]`, { timeout: 8000 });
    await page.click(`${C} [data-lf="trMake"]`);
    await idle(2);
    await page.waitForSelector(`${C} .lf-tr-note`, { timeout: 8000 });
    assert(TR.n === 2, 'AI 두 번이어야 함: ' + TR.n);
    assert((await trOf('정우진, 강민준, 이서연')) === '정우진, 강민준, 이서연', '명단 줄');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${C} [data-exp-main][data-lf="trDownload"]`)]);
    assert(dl.suggestedFilename().includes('(베트남어)'), dl.suggestedFilename());
    await page.waitForFunction(() => /한국어만/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => {});
    const m = await toast();
    assert(/개인정보가 있어 번역하지 않은 1줄은 한국어만 넣었어요/.test(m), m);
  }],
  ['M5 [처음부터 다시 번역]이 두 번째 AI에서 멈추면 다시 번역한 줄은 새 번역, 못 한 줄은 전 번역이 남음(번역이 없는 줄 없음)', async () => {
    TR.pre = 'NEW'; TR.failAt = TR.n + 2;
    await page.click(`${C} [data-lf="trRedo"]`);
    await idle(TR.failAt);
    assert(TR.n === TR.failAt, '두 번째 AI ' + TR.n);
    assert((await trOf('가을 현장체험학습 안내')) === 'NEW: 가을 현장체험학습 안내', '첫 묶음: ' + await trOf('가을 현장체험학습 안내'));
    assert((await trOf('협조를 부탁드립니다.')) === 'VI: 협조를 부탁드립니다.', '둘째 묶음(멈춤): ' + await trOf('협조를 부탁드립니다.'));
    assert(!(await page.textContent(C)).includes('번역이 없는 줄'), '번역이 없는 줄이 생김');
    assert((await toast()).includes('전 번역'), await toast());
    // 새로 고쳐 열어도 남음(저장)
    await page.reload(); await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.click('#menuTabs [data-tab="letter"]');
    await page.waitForSelector(`${C} .lf-tr-note`);
    assert((await trOf('협조를 부탁드립니다.')) === 'VI: 협조를 부탁드립니다.', '저장');
    await formsLoaded();
  }],
  ['M6 번역하는 동안 번역이 없는 줄 칸에 친 번역은 새 번역으로 덮지 않음(저장도)', async () => {
    TR.pre = 'NEW2'; TR.failAt = 0; TR.delay = 1200;
    const body = await page.inputValue(`${P} [data-lo="body"]`);
    await page.fill(`${P} [data-lo="body"]`, body.replace('협조를 부탁드립니다.', '많은 협조를 부탁드립니다.').replace('안녕하십니까?', '안녕하세요?'));
    await page.waitForFunction(s => (document.querySelector(s) || {}).textContent?.includes('번역이 없는 줄이 2개'), C);
    const n0 = TR.n;
    await page.click(`${C} [data-lf="trMake"]`);
    await page.waitForTimeout(200);
    await page.fill(`${C} textarea[data-lt-ko="많은 협조를 부탁드립니다."]`, '선생님이 친 번역');
    await idle(n0 + 1);
    TR.delay = 0;
    assert((await trOf('많은 협조를 부탁드립니다.')) === '선생님이 친 번역', '덮임: ' + await trOf('많은 협조를 부탁드립니다.'));
    assert((await trOf('안녕하세요?')) === 'NEW2: 안녕하세요?', '다른 줄은 새 번역');
    const saved = await page.evaluate(async () => { const m = await import('/menus/etc/letter-model.js'); return m.getCurrent().tr.vi.units['많은 협조를 부탁드립니다.']; });
    assert(saved === '선생님이 친 번역', '저장: ' + saved);
  }],
  ['탭을 열자마자 고른 공문 파일(파일 칸을 잡은 채)은 양식 목록을 읽어 다시 그린 뒤에도 들어감', async () => {
    await page.click(`${P} [data-lf="new"]`);
    await page.reload(); await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.evaluate(s => { document.querySelector('#menuTabs [data-tab="letter"]').click(); window.__heldFile = document.querySelector(`${s} #lfFile`); }, P);
    await formsLoaded();
    await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(['11월 12일 현장체험학습 공문'], '체험학습 공문.txt', { type: 'text/plain' }));
      const el = window.__heldFile; el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(s => (document.querySelector(`${s} #lfSrc`) || {}).textContent?.includes('체험학습 공문.txt'), P, { timeout: 5000 });
  }],
  ['학교 양식을 넣어 둔 뒤: 탭을 열자마자 넣을 내용 칸에 치던 글은 양식을 읽어 다시 그려도 이어서 쳐짐(초점이 남음)', async () => {
    await page.setInputFiles(`${P} #lfFormFile`, { name: '양식.hwpx', mimeType: 'application/octet-stream', buffer: FORM });
    await page.waitForFunction(s => (document.querySelector(`${s} #lfForm`) || {}).value, P, { timeout: 8000 });
    await page.click(`${P} [data-lf="new"]`);
    await page.reload(); await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.evaluate(s => { document.querySelector('#menuTabs [data-tab="letter"]').click(); document.querySelector(`${s} #lfMemo`).focus(); }, P);
    await page.keyboard.type('첫 줄 ');
    await formsLoaded(true);
    await page.keyboard.type('둘째');
    assert((await page.inputValue(`${P} #lfMemo`)) === '첫 줄 둘째', await page.inputValue(`${P} #lfMemo`));
    assert(await page.isVisible(`${P} [data-lf="map"]`), '양식 맞추기 단추(양식을 읽어 그림)');
  }],
  ['탭을 열자마자 고른 학교 양식 파일도 들어감', async () => {
    await page.reload(); await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    const n0 = await page.evaluate(async () => { const m = await import('/core/form-store.js'); return (await (await m.forms()).list()).length; });
    await page.evaluate(s => { document.querySelector('#menuTabs [data-tab="letter"]').click(); window.__heldFile = document.querySelector(`${s} #lfFormFile`); }, P);
    await formsLoaded(true);
    const b64 = FORM.toString('base64');
    await page.evaluate(b => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b), ch => ch.charCodeAt(0))], '둘째 양식.hwpx', { type: 'application/octet-stream' }));
      const el = window.__heldFile; el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, b64);
    await until(async n => { const m = await import('/core/form-store.js'); return (await (await m.forms()).list()).length === n + 1; }, n0, 5000);
  }],
  ['페이지 오류 없음(일부러 낸 AI 400 말고)', async () => { const e = errors.filter(m => !/status of 400/.test(m)); assert(e.length === 0, e.join(' | ')); }]
]);
await t.close();
