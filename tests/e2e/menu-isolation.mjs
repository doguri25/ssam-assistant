// 다른 메뉴의 버튼이 평가 메뉴(행특)의 기록을 바꾸지 않음: 평가 화면이 숨겨져 있으면 행특·채점 손잡이는 쉼
// (행특 저장은 0.5초 뒤에 되므로 확인 전에 0.8초 기다림)
import { join } from 'node:path';
import { open, run, assert, ROOT } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const HK = { settings: {}, students: [{ id: 'a', no: 1, label: '', memo: 'm', done: 0, results: [{ t: '행특 글 하나', d: 0 }, { t: '행특 글 둘', d: 0 }] }] };
await page.addInitScript(hk => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mode', 'hk');
  localStorage.setItem('ssam:hk', JSON.stringify(hk));
}, HK);
const hk = () => page.evaluate(() => localStorage.getItem('ssam:hk'));
// 복사는 늘 성공하는 것으로 (행특 손잡이가 끝까지 가는지 보려고)
const okClip = () => page.evaluate(() => { navigator.clipboard.writeText = async () => {}; });
await page.goto(url);
await page.waitForTimeout(500);
const before = await hk();

await run('menu-isolation', [
  ['평가가 행특 모드여도 학급 진도표 고르기 체크박스는 행특을 건드리지 않음', async () => {
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('section[data-menu="class"] [data-c="jindoFile"]')]);
    await fc.setFiles(join(ROOT, 'samples', '진도표-예시.hwpx'));
    await page.waitForSelector('#sheetRoot input[type=checkbox]');
    await okClip();
    await page.locator('#sheetRoot input[type=checkbox]').nth(1).click();
    await page.locator('#sheetRoot input[type=checkbox]').nth(1).press(' ');
    await page.waitForTimeout(800);
    assert(await hk() === before, '행특 기록이 바뀜: ' + await hk());
    assert(!/행특|복사/.test(await page.textContent('#toast')), '행특 알림이 뜸: ' + await page.textContent('#toast'));
    await page.click('#sheetRoot [data-close]');
  }],
  ['행사계획 구성안 「이 안으로」도 행특을 건드리지 않음', async () => {
    await page.evaluate(async () => {
      const m = await import('./menus/plan/event-model.js');
      const e = m.saveEvent({ ...m.newEvent(), name: '운동회', grades: '전교생', date: '2027-05-06', place: '운동장', options: m.normOptions([{ label: '안 1', timetable: [{ time: '09:00', activity: '개회식' }] }]), step: 2, maxStep: 2 });
      m.setCurrentEvent(e.id);
    });
    await page.reload(); await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
    await okClip();
    await page.click('section[data-menu="plan"] [data-pick="0"]');
    await page.waitForTimeout(800);
    assert(await hk() === before, '행특 기록이 바뀜');
    assert(!/행특|복사/.test(await page.textContent('#toast')), '행특 알림이 뜸: ' + await page.textContent('#toast'));
  }],
  ['평가 › 행특에서는 그대로 눌러서 복사·완료', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForTimeout(300);
    await okClip();
    const n = await page.locator('section[data-menu="evaluate"] [data-pick]').count();
    if (n) { await page.locator('section[data-menu="evaluate"] [data-pick]').first().click(); await page.waitForTimeout(800); assert(await hk() !== before, '행특에서 안 됨'); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
