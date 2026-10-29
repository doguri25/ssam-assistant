// 설정 › 학급 명단: 엑셀·CSV에서 번호만 가져오기 → 미리 보기 → 넣기, .xls·번호 없는 파일 안내
import { join } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { open, run, assert, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const V = 'section[data-menu="settings"]';
const tmp = mkdtempSync(join(tmpdir(), 'roster-'));
const pick = async file => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-set="rosterFile"]`)]);
  await fc.setFiles(file);
};
await page.goto(url);
await page.waitForTimeout(500);
await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="roster"]');

await run('roster-import', [
  ['명렬표 CSV → 미리 보기 → 넣기: 학생 수·예외 번호, 이름은 저장 안 함', async () => {
    await pick(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector('#sheetRoot #rosterOk');
    assert((await page.textContent('#sheetRoot .sheet')).includes('학생 25명 · 예외 번호 7, 20'), await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot #rosterOk');
    await page.waitForTimeout(200);
    assert(await page.inputValue(`${V} [data-cls="count"]`) === '25', '학생 수');
    assert(await page.inputValue(`${V} [data-cls="except"]`) === '7, 20', '예외 번호');
    const saved = await page.evaluate(() => localStorage.getItem('ssam:class'));
    assert(saved.includes('"count":25') && !/김하나|양아름/.test(saved), saved);
  }],
  ['.xls는 xlsx로 다시 저장 안내', async () => {
    const f = join(tmp, '명렬표.xls'); writeFileSync(f, 'x');
    await pick(f);
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('엑셀에서 .xlsx로 다시 저장해 주세요'));
  }],
  ['번호 칸이 없으면 안내', async () => {
    const f = join(tmp, '이름만.csv'); writeFileSync(f, '이름,성별\n가,남\n');
    await pick(f);
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('번호 칸을 찾지 못했어요'));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
