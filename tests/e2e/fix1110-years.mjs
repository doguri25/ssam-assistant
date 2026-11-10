// 학년도 고침(2026-11-10): 지금 학년도를 백업 파일 내용으로 바꾸면 다른 탭도 다시 열림(지난 자료를 다시 쓰지 않게),
// 2월에 넣어 둔 새 학년도 재량휴업일을 새 학년도로 가져감
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-02-20T09:00:00'));
const S = 'section[data-menu="settings"]';
const SCHOOL = JSON.stringify({ name: '가나초', classes: 12, students: 280, breaks: [{ from: '2026-12-24', to: '2027-02-26', label: '겨울방학' }] });
const tmp = mkdtempSync(join(tmpdir(), 'fix1110-years-'));
const yearsTab = async () => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]'); await page.waitForSelector(`${S} [data-set="restore"]`); };
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(sc => { localStorage.setItem('ssam:years', JSON.stringify({ current: 2026 })); localStorage.setItem('ssam:school', sc); }, SCHOOL);
await page.reload(); await page.waitForTimeout(500);

await run('fix1110-years', [
  ['[years-restore-tab-1] 백업 파일로 지금 학년도 자료를 바꾸면 다른 탭도 다시 열림', async () => {
    const other = await ctx.newPage();
    await other.clock.setFixedTime(new Date('2027-02-20T09:00:00'));
    await other.goto(url); await other.waitForTimeout(500);
    const backup = join(tmp, 'backup.json');
    writeFileSync(backup, JSON.stringify({ app: 'ssam', kind: 'backup', version: 1, createdAt: '2027-02-01T00:00:00Z', current: 2026,
      years: { 2026: { 'class:info': JSON.stringify({ grade: 5, room: 3 }), school: SCHOOL } } }));
    await yearsTab();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${S} [data-set="restore"]`)]);
    await fc.setFiles(backup);
    await page.waitForSelector('#sheetRoot input[data-ry="2026"]');
    await page.check('#sheetRoot input[data-ry="2026"]');
    let reloaded = false;
    other.on('load', () => { reloaded = true; });
    await Promise.all([page.waitForEvent('load'), page.click('#sheetRoot #yrRestoreOk')]);
    await other.waitForTimeout(1200);
    assert(reloaded, '다른 탭이 다시 열리지 않음');
    assert(await page.evaluate(() => localStorage.getItem('ssam:class:info')) === JSON.stringify({ grade: 5, room: 3 }), '불러오지 않음');
    assert(JSON.parse(await page.evaluate(() => localStorage.getItem('ssam:years'))).current === 2026, '학년도');
    await other.close();
  }],
  ['[years-breaks-2] 2월에 학교 정보에 넣은 새 학년도 재량휴업일은 새 학년도를 시작해도 남고, 지난 겨울방학은 비움', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="school"]');
    await page.click(`${S} [data-set="addBreak"]`);
    await page.fill(`${S} [data-break="1"][data-f="label"]`, '재량휴업일');
    await page.fill(`${S} [data-break="1"][data-f="from"]`, '2027-03-03');
    await page.fill(`${S} [data-break="1"][data-f="to"]`, '2027-03-03');
    await page.click(`${S} [data-set="saveSchool"]`);
    await yearsTab();
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrNewOk');
    assert((await page.textContent('#sheetRoot .sheet')).includes('방학·재량휴업일 중 2027학년도'), '가져가는 것 안내');
    await Promise.all([page.waitForEvent('load'), page.click('#sheetRoot #yrNewOk')]);
    await page.waitForTimeout(500);
    const sc = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:school')));
    assert(JSON.parse(await page.evaluate(() => localStorage.getItem('ssam:years'))).current === 2027, '새 학년도');
    assert(JSON.stringify(sc.breaks) === JSON.stringify([{ from: '2027-03-03', to: '2027-03-03', label: '재량휴업일' }]), JSON.stringify(sc));
    const off = await page.evaluate(async () => (await import('./menus/class/class-model.js')).noClass('2027-03-03', (await import('./core/settings.js')).getSchool().breaks));
    assert(off === '재량휴업일', off);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
