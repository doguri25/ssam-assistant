// 학년도 다듬기: 미뤄 둔 저장(행특 메모)을 넣고 옮김, AI가 쓰는 중이면 옮기지 않음, 키를 기억하지 않으면 안내,
// 보관 목록은 자료를 다 읽지 않음, 보관함이 없어도 백업은 지금 학년도로, 백업의 지금 학년도로 갈지 물어봄, 다음 학년도가 있으면 단추 이름
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const S = 'section[data-menu="settings"]';
const tmp = mkdtempSync(join(tmpdir(), 'years-more-'));
const yearsTab = async () => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]'); await page.waitForSelector(`${S} [data-yr]`); };
const archiveGet = y => page.evaluate(async y => (await import('./core/archive.js')).openArchive().get(y), y);
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => localStorage.setItem('ssam:hk', JSON.stringify({ settings: {}, students: [{ id: 'a', no: 1, label: '', memo: '', done: 0, results: [] }] })));
await page.reload(); await page.waitForTimeout(500);

await run('years-more', [
  ['행특 메모를 쓰자마자 학년도를 옮겨도 메모가 지난 학년도에 남음', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForSelector('#hkMemo');
    await Promise.all([
      page.waitForEvent('load'),
      page.evaluate(async () => {
        const m = document.querySelector('#hkMemo');
        m.value = '방금 쓴 메모'; m.dispatchEvent(new Event('input', { bubbles: true }));
        const y = await import('./core/years.js'), s = await import('./core/year-switch.js');
        s.switchYear(2027, y.carryOver(y.snapshot(localStorage), 2027));
      })
    ]);
    await page.waitForTimeout(500);
    const a = await archiveGet(2026);
    assert(a && String(a.hk).includes('방금 쓴 메모'), String(a && a.hk).slice(0, 120));
  }],
  ['AI가 글을 쓰는 중이면 학년도를 옮기지 않음', async () => {
    await page.route('https://api.anthropic.com/**', () => {}); // 답하지 않음
    const r = await page.evaluate(async () => {
      const ai = await import('./core/ai.js'), s = await import('./core/year-switch.js');
      ai.generate('[시험] 오래 걸리는 글').catch(() => {});
      await new Promise(r => setTimeout(r, 50));
      const x = await s.switchYear(2028, {});
      return { ...x, msg: s.switchError(x.code) };
    });
    assert(r.ok === false && r.code === 'BUSY' && r.msg.includes('AI가 글을 쓰는 중'), JSON.stringify(r));
    await page.unroute('https://api.anthropic.com/**');
    await page.reload(); await page.waitForTimeout(500);
  }],
  ['AI 키를 기억하지 않게 했으면 새 학년도 창에서 알려 줌', async () => {
    await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('ssam:engine')); e.remember = false; localStorage.setItem('ssam:engine', JSON.stringify(e)); });
    await yearsTab();
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot .sheet');
    assert((await page.textContent('#sheetRoot .sheet')).includes('AI 키를 기억하지 않게'), '안내 없음');
    await page.click('#sheetRoot [data-close]');
    await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('ssam:engine')); e.remember = true; localStorage.setItem('ssam:engine', JSON.stringify(e)); });
  }],
  ['보관 목록은 학년도 자료를 통째로 읽지 않음', async () => {
    const r = await page.evaluate(async () => {
      const seen = [], orig = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.getAll = function (...a) { seen.push(this.name); return orig.apply(this, a); };
      const list = await (await import('./core/archive.js')).openArchive().list();
      IDBObjectStore.prototype.getAll = orig;
      return { seen, years: list.map(x => x.year), size: list[0] && list[0].size };
    });
    assert(r.years.includes(2026) && r.size > 0, JSON.stringify(r));
    assert(!r.seen.includes('years'), '자료 묶음을 다 읽음: ' + r.seen.join(','));
  }],
  ['보관함(IndexedDB)이 없어도 백업 파일은 지금 학년도로', async () => {
    const p2 = await ctx.newPage();
    await p2.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); });
    await p2.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
    await p2.goto(url); await p2.waitForTimeout(500);
    await p2.click('nav.app-side [data-menu-go="settings"]'); await p2.click('#menuTabs [data-tab="years"]');
    await p2.waitForSelector(`${S} [data-set="backup"]`);
    const [dl] = await Promise.all([p2.waitForEvent('download'), p2.click(`${S} [data-set="backup"]`)]);
    const b = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    assert(b.current === 2027 && b.years['2027'], JSON.stringify(Object.keys(b.years)));
    await p2.waitForTimeout(100);
    assert((await p2.textContent('#toast')).includes('지금 학년도만'), await p2.textContent('#toast'));
    await p2.close();
  }],
  ['백업 파일의 지금 학년도가 다르면 그 학년도로 갈지 물어봄', async () => {
    const f = join(tmp, 'b.json');
    writeFileSync(f, JSON.stringify({ app: 'ssam', kind: 'backup', version: 1, createdAt: '2026-10-29T00:00:00Z', current: 2028, years: { 2028: { hk: '{"students":[]}' } } }));
    await yearsTab();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${S} [data-set="restore"]`)]);
    await fc.setFiles(f);
    await page.click('#sheetRoot #yrRestoreOk');
    await page.waitForSelector('#sheetRoot #yrGoOk');
    assert((await page.textContent('#sheetRoot .sheet')).includes('백업 파일의 지금 학년도는 2028학년도'), await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-close]');
  }],
  ['다음 학년도가 보관함에 있으면 단추 이름이 그 학년도로 가기', async () => {
    await page.reload(); await page.waitForTimeout(400);
    await yearsTab();
    await page.waitForFunction(() => !document.querySelector('section[data-menu="settings"]').textContent.includes('불러오는 중'));
    const label = await page.textContent(`${S} [data-set="newYear"]`);
    assert(label.includes('2028학년도 자료가 이미 있어요') && label.includes('그 학년도로 가기'), label);
  }],
  ['지난 판(1판) 보관함에서 올라와도 목록이 그대로', async () => {
    const c2 = await t.browser.newContext(), p3 = await c2.newPage();
    await p3.goto(url); await p3.waitForTimeout(300);
    const r = await p3.evaluate(async () => {
      await new Promise((ok, no) => { const q = indexedDB.deleteDatabase('ssam-archive'); q.onsuccess = q.onerror = q.onblocked = ok; });
      await new Promise((ok, no) => {
        const q = indexedDB.open('ssam-archive', 1);
        q.onupgradeneeded = () => q.result.createObjectStore('years', { keyPath: 'year' }).put({ year: 2024, savedAt: 1, size: 7, data: { hk: '"x"' } });
        q.onsuccess = () => { q.result.close(); ok(); }; q.onerror = no;
      });
      const a = (await import('./core/archive.js')).openArchive();
      return { list: await a.list(), got: await a.get(2024) };
    });
    await c2.close();
    assert(r.list.length === 1 && r.list[0].year === 2024 && r.list[0].size === 7 && r.got.hk === '"x"', JSON.stringify(r));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
