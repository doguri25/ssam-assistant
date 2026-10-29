// 2월 새 학년도 준비: 지난 학년도에서 학급 준비를 하면 새 학년도를 먼저 시작하라고 알림, 새 학년도를 시작할 때 학급 준비(명단·시간표·진도표)를 가져갈 수 있음
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-02-20T09:00:00'));
const C = 'section[data-menu="class"]', S = 'section[data-menu="settings"]';
await page.goto(url);
await page.waitForTimeout(300);
await page.evaluate(() => {
  localStorage.setItem('ssam:years', JSON.stringify({ current: 2026 }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 25, except: [7] }));
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 4, room: 2 }));
  localStorage.setItem('ssam:class:subjects', JSON.stringify([{ id: 'a', name: '국어', start: '2027-02-19', offset: 2, lessons: [{ no: '1/8', title: '첫 차시' }, { no: '2/8', title: '둘째 차시' }] }]));
  localStorage.setItem('ssam:class:log', JSON.stringify({ '2027-02-19': { 1: { subject: '국어', status: 'done' } } }));
});
await page.reload(); await page.waitForTimeout(500);

await run('years-class', [
  ['2월에 지난 학년도에서 학급 준비를 열면 새 학년도를 먼저 시작하라는 안내, 누르면 설정 › 학년도', async () => {
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    await page.waitForSelector(`${C} [data-c="toYears"]`);
    assert((await page.textContent(C)).includes('2027학년도 준비라면'), (await page.textContent(C)).slice(0, 200));
    await page.click(`${C} [data-c="toYears"]`);
    await page.waitForSelector(`${S} [data-set="newYear"]`);
    await page.click('#menuTabs [data-tab="roster"]');
    assert((await page.textContent(S)).includes('2027학년도 명단이라면'), '명단 화면 안내 없음');
    await page.click('#menuTabs [data-tab="years"]');
    await page.waitForSelector(`${S} [data-set="newYear"]`);
  }],
  ['새 학년도를 시작할 때 학급 준비도 가져가기를 고르면 명단·학급·진도표가 따라오고 체크는 비움', async () => {
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrClassToo');
    await page.check('#sheetRoot #yrClassToo');
    await Promise.all([page.waitForEvent('load'), page.click('#sheetRoot #yrNewOk')]);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ y: JSON.parse(localStorage.getItem('ssam:years')).current, cls: localStorage.getItem('ssam:class'), info: localStorage.getItem('ssam:class:info'), subs: JSON.parse(localStorage.getItem('ssam:class:subjects') || 'null'), log: localStorage.getItem('ssam:class:log') }));
    assert(r.y === 2027 && r.cls && r.info && r.subs && r.subs[0].offset === 0 && r.subs[0].lessons.length === 2 && !r.log, JSON.stringify(r));
  }],
  ['새 학년도로 옮긴 뒤에는 안내가 없음', async () => {
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    await page.waitForTimeout(300);
    assert(await page.locator(`${C} [data-c="toYears"]`).count() === 0, '안내가 남음');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
