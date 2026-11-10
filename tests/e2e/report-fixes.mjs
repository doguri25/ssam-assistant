// 결과 보고 최종 검토 고침: I3 뺀 스캔본 쪽 그림은 AI로 보내지 않고 문서마다 3쪽, I2 AI를 기다리는 동안 사진을 빼거나
// 다른 결과 보고로 옮겨도 설명·결과가 섞이지 않음, M2(→중요) 고친 한 일 메모가 최근 결과 보고에도 남음
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const reqs = [];
let delay = 0;
await mockClaude(page, async ({ images }) => {
  reqs.push({ images });
  if (delay) await new Promise(r => setTimeout(r, delay));
  return JSON.stringify({ name: '2026 과학의 날 행사', period: { start: '2026-04-21' }, place: '강당', summary: '실험', sections: [{ h: '목적', lines: ['흥미'] }], photos: ['모둠별 실험 장면', '발명품 발표'] });
});
const P = 'section[data-menu="plan"] .rp-box';
const photo = n => ({ name: `사진${n}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(join(FIXTURES, `photo-${n}.jpg`)) });
await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="plan"]');
await page.click('#menuTabs [data-tab="report"]');
await page.waitForSelector(`${P} #rpFile`, { state: 'attached' });

await run('report-fixes', [
  ['I3 스캔본(글 없는 PDF)을 넣었다가 ✕로 빼면 그 쪽 그림은 AI로 가지 않음, 다시 넣으면 그 문서 쪽만', async () => {
    await page.setInputFiles(`${P} #rpFile`, [{ name: '잘못 넣은 공문.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(FIXTURES, 'scan-only.pdf')) }]);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-kind]`).length === 1, P, { timeout: 15000 });
    await page.click(`${P} [data-rp-del="0"]`);
    await page.fill(`${P} #rpMemo`, '4월 21일 강당에서 실험');
    await page.click(`${P} [data-rp="write"]`);
    await page.waitForSelector(`${P} #rpBody`);
    assert(reqs.at(-1).images === 0, '뺀 스캔본 그림을 보냄: ' + reqs.at(-1).images);
    await page.setInputFiles(`${P} #rpFile`, [{ name: '공문.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(FIXTURES, 'scan-only.pdf')) }]);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-kind]`).length === 1, P, { timeout: 15000 });
    await page.click(`${P} [data-rp="write"]`);
    await page.waitForFunction(n => window.__n !== n, reqs.length).catch(() => {});
    for (let k = 0; k < 50 && reqs.length < 2; k++) await page.waitForTimeout(100);
    await page.waitForFunction(s => !document.querySelector(`${s} [data-rp="write"][disabled]`), P);
    assert(reqs.at(-1).images === 1, '다시 넣은 스캔본 쪽 ' + reqs.at(-1).images);
  }],
  ['M2 한 일 메모를 고친 뒤 [새 결과 보고] → 최근에서 [열기]하면 고친 메모', async () => {
    await page.fill(`${P} #rpMemo`, '고친 메모: 발표 시간이 모자랐음');
    await page.click(`${P} [data-rp="new"]`);
    await page.click(`${P} #rpRecent [data-rp-open]`);
    await page.waitForSelector(`${P} #rpBody`);
    assert((await page.inputValue(`${P} #rpMemo`)) === '고친 메모: 발표 시간이 모자랐음', await page.inputValue(`${P} #rpMemo`));
  }],
  ['I2 AI를 기다리는 동안 첫 사진을 빼면 남은 사진에는 그 사진의 설명', async () => {
    await page.click(`${P} [data-rp="new"]`);
    await page.setInputFiles(`${P} #rpFile`, [photo(1), photo(2)]);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 2, P);
    delay = 1200;
    await page.click(`${P} [data-rp="write"]`);
    await page.waitForTimeout(300);
    await page.click(`${P} [data-rp-pdel="0"]`);
    await page.waitForSelector(`${P} #rpBody`, { timeout: 8000 });
    const caps = await page.$$eval(`${P} [data-rp-cap]`, els => els.map(e => e.value));
    assert(JSON.stringify(caps) === JSON.stringify(['발명품 발표']), JSON.stringify(caps));
  }],
  ['I2 AI를 기다리는 동안 [새 결과 보고]를 누르면 새 화면은 비어 있고, 쓴 결과는 최근 결과 보고에 남음', async () => {
    await page.click(`${P} [data-rp="new"]`);
    await page.fill(`${P} #rpMemo`, '체육대회 한 일');
    const n0 = await page.locator(`${P} #rpRecent [data-rp-open]`).count();
    await page.click(`${P} [data-rp="write"]`);
    await page.waitForTimeout(300);
    await page.click(`${P} [data-rp="new"]`);
    await page.waitForTimeout(1500);
    assert(!(await page.$(`${P} #rpBody`)) && (await page.inputValue(`${P} #rpMemo`)) === '', '새 화면에 결과가 들어감');
    assert(await page.locator(`${P} #rpRecent [data-rp-open]`).count() === n0 + 1, '쓴 결과가 최근에 없음');
    delay = 0;
  }],
  ['M1 새로 고침 뒤 사진을 다시 넣으면 옛 사진 설명이 새 사진에 붙지 않음', async () => {
    await page.click(`${P} [data-rp="new"]`);
    await page.setInputFiles(`${P} #rpFile`, [photo(1), photo(2)]);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 2, P);
    await page.click(`${P} [data-rp="write"]`);
    await page.waitForSelector(`${P} #rpBody`, { timeout: 8000 });
    await page.reload();
    await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="plan"]');
    await page.click('#menuTabs [data-tab="report"]');
    await page.waitForSelector(`${P} #rpBody`);
    await page.setInputFiles(`${P} #rpFile`, [photo(2)]);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 1, P);
    const caps = await page.$$eval(`${P} [data-rp-cap]`, els => els.map(e => e.value));
    assert(JSON.stringify(caps) === JSON.stringify(['']), JSON.stringify(caps));
  }],
  ['M1 가끔 실패의 까닭: 탭을 열자마자 고른 사진이 학교 양식 목록을 읽은 뒤 다시 그린 화면 때문에 떨어져 나간 파일 칸에 들어가 사라지지 않음', async () => {
    // 파일 고르기 창(또는 Playwright setInputFiles)은 누를 때의 파일 칸을 붙잡고 있음: 그 칸을 잡아 두고, 양식 목록을 다 읽은 뒤 그 칸에 사진을 넣음
    await page.reload();
    await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="plan"]');
    const b64 = readFileSync(join(FIXTURES, 'photo-2.jpg')).toString('base64');
    await page.evaluate(s => { document.querySelector('#menuTabs [data-tab="report"]').click(); window.__heldFile = document.querySelector(`${s} #rpFile`); }, P);
    // (waitForFunction은 async 함수의 Promise를 참으로 봐서 page.evaluate로 기다림)
    for (let k = 0; k < 160 && !(await page.evaluate(async () => { const m = await import('/menus/plan/report.js'); return !!m.R.forms && !m.R.formsLoading; })); k++) await page.waitForTimeout(50);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(b => {
      const u8 = Uint8Array.from(atob(b), ch => ch.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([u8], '사진2.jpg', { type: 'image/jpeg' }));
      const el = window.__heldFile; el.files = dt.files;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, b64);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 1, P, { timeout: 5000 });
  }],
  ['AI가 쓰는 동안 파일 고르기 창을 열어 둔 채(그 칸을 잡은 채) 다 써서 화면을 다시 그려도 고른 사진은 들어감', async () => {
    await page.click(`${P} [data-rp="new"]`);
    await page.fill(`${P} #rpMemo`, '파일 칸 시험');
    delay = 600;
    await page.click(`${P} [data-rp="write"]`);
    await page.evaluate(s => { window.__heldFile = document.querySelector(`${s} #rpFile`); }, P);
    await page.waitForSelector(`${P} #rpBody`, { timeout: 8000 });
    delay = 0;
    const b64 = readFileSync(join(FIXTURES, 'photo-1.jpg')).toString('base64');
    await page.evaluate(b => {
      const u8 = Uint8Array.from(atob(b), ch => ch.charCodeAt(0)), dt = new DataTransfer();
      dt.items.add(new File([u8], '사진1.jpg', { type: 'image/jpeg' }));
      const el = window.__heldFile; el.files = dt.files; el.dispatchEvent(new Event('change', { bubbles: true }));
    }, b64);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 1, P, { timeout: 5000 });
  }],
  ['M8 사진을 읽는 동안 [새 결과 보고]를 누르면 그 사진은 새 결과 보고에 들어가지 않음', async () => {
    await page.click(`${P} [data-rp="new"]`);
    // 사진을 읽는 바로 그때 [새 결과 보고]를 누름
    await page.evaluate(s => { const o = window.createImageBitmap; window.createImageBitmap = function (...a) { window.createImageBitmap = o; document.querySelector(`${s} [data-rp="new"]`).click(); return o.apply(window, a); }; }, P);
    await page.setInputFiles(`${P} #rpFile`, [photo(1)]);
    await page.waitForFunction(s => !document.querySelector(`${s} .spin`), P, { timeout: 10000 });
    assert(await page.locator(`${P} [data-rp-cap]`).count() === 0, '새 결과 보고에 사진이 들어감');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
