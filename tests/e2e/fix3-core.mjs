// 3차 고치기(공통·설정): 학교 정보를 저장해도 「계획 학년도」가 그해로 굳지 않음.
// 손대지 않은 계획 학년도는 저장하지 않고(1월부터 다음 학년도), 선생님이 바꾼 해는 지킴. 예전에 굳은 값은 1월부터 다음 학년도로 봄
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const S = 'section[data-menu="settings"]', P = 'section[data-menu="plan"]';
const tab = async (m, id) => { await page.click(`nav.app-side [data-menu-go="${m}"]`); await page.click(`#menuTabs [data-tab="${id}"]`); };
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:school') || 'null'));
const save = async () => { await page.click(`${S} [data-set="saveSchool"]`); await page.waitForTimeout(150); };
// 그날로 시계를 두고 저장소를 비운 뒤 다시 엶 (앞 단계의 늦은 저장이 덮지 않게 먼저 저장을 멈춤)
const fresh = async (time, init = {}) => {
  await page.clock.setFixedTime(new Date(time));
  await page.goto(url); await page.waitForTimeout(200);
  await page.evaluate(async init => { (await import('./core/store.js')).freeze(); localStorage.clear(); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); }, init);
  await page.reload(); await page.waitForTimeout(400);
};
// 같은 저장소로 날짜만 바꿔 다시 엶
const later = async time => {
  await page.clock.setFixedTime(new Date(time));
  await page.reload(); await page.waitForTimeout(400);
};
const newYearPlan = async () => { await tab('plan', 'year'); await page.click(`${P} [data-y="new"]`); return page.inputValue(`${P} #ypYear`); };
const newClassPlan = async () => { await tab('plan', 'class'); await page.click(`${P} [data-c="new"]`); return page.inputValue(`${P} #cpYear`); };

await run('fix3-core', [
  ['[core3-1] 5월에 학교명·방학만 넣고 저장(계획 학년도는 손대지 않음) → 학년도는 저장하지 않고, 1월에는 칸·새 연간계획·새 학급운영계획이 모두 2027', async () => {
    await fresh('2026-05-10T09:00:00');
    await tab('settings', 'school');
    assert(await page.inputValue(`${S} #schYear`) === '2026', '5월 칸: ' + await page.inputValue(`${S} #schYear`));
    await page.fill(`${S} #schName`, '가나초등학교');
    await page.click(`${S} [data-set="addBreak"]`);
    await page.fill(`${S} [data-break="0"][data-f="label"]`, '여름방학');
    await page.fill(`${S} [data-break="0"][data-f="from"]`, '2026-07-24');
    await page.fill(`${S} [data-break="0"][data-f="to"]`, '2026-08-20');
    await save();
    const s = await stored();
    assert(s && s.name === '가나초등학교' && s.breaks.length === 1, '학교 정보가 저장되지 않음: ' + JSON.stringify(s));
    assert(s.year === undefined, '계획 학년도가 저장됨: ' + JSON.stringify(s));
    assert(await page.inputValue(`${S} #schYear`) === '2026', '저장 뒤 칸: ' + await page.inputValue(`${S} #schYear`));
    await later('2026-11-05T09:00:00');
    await tab('settings', 'school');
    assert(await page.inputValue(`${S} #schYear`) === '2026', '11월 칸(12월까지는 올해): ' + await page.inputValue(`${S} #schYear`));
    await later('2027-01-10T09:00:00');
    await tab('settings', 'school');
    assert(await page.inputValue(`${S} #schYear`) === '2027', '1월 칸: ' + await page.inputValue(`${S} #schYear`));
    assert(await page.inputValue(`${S} #schName`) === '가나초등학교', '학교명이 사라짐');
    assert(await newYearPlan() === '2027', '새 연간계획 학년도');
    assert(await newClassPlan() === '2027', '새 학급운영계획 학년도');
  }],
  ['[settings-planyear-4] 고치기 전에 굳은 값(year 2026, 자료 2026학년도)이 있어도 1월에는 칸·새 연간계획이 2027이고, 손대지 않고 다시 저장해도 2027', async () => {
    await fresh('2027-01-10T09:00:00', { 'ssam:years': JSON.stringify({ current: 2026 }), 'ssam:school': JSON.stringify({ name: '가나초', year: 2026, classes: 0, students: 0, breaks: [] }) });
    await tab('settings', 'school');
    assert(await page.inputValue(`${S} #schYear`) === '2027', '1월 칸: ' + await page.inputValue(`${S} #schYear`));
    assert(await newYearPlan() === '2027', '새 연간계획 학년도');
    await tab('settings', 'school');
    await page.fill(`${S} #schClasses`, '12');
    await save();
    assert(await page.inputValue(`${S} #schYear`) === '2027', '저장 뒤 칸');
    const s = await stored();
    assert(s.classes === 12 && s.year !== 2027, '자동값이 저장됨: ' + JSON.stringify(s));
    await later('2027-01-11T09:00:00');
    assert(await newClassPlan() === '2027', '새 학급운영계획 학년도');
  }],
  ['[core3-1] 1월에 선생님이 계획 학년도를 2026으로 바꿔 저장하면 그대로, 방학을 더해 다시 저장해도 그대로, 자동값(2027)으로 되돌리면 저장값을 지움', async () => {
    await fresh('2027-01-10T09:00:00');
    await tab('settings', 'school');
    await page.fill(`${S} #schYear`, '2026');
    await save();
    assert((await stored()).year === 2026, '고른 학년도가 저장되지 않음: ' + JSON.stringify(await stored()));
    await later('2027-01-20T09:00:00');
    await tab('settings', 'school');
    assert(await page.inputValue(`${S} #schYear`) === '2026', '다시 연 칸: ' + await page.inputValue(`${S} #schYear`));
    await page.click(`${S} [data-set="addBreak"]`);
    await page.fill(`${S} [data-break="0"][data-f="label"]`, '겨울방학');
    await page.fill(`${S} [data-break="0"][data-f="from"]`, '2026-12-24');
    await page.fill(`${S} [data-break="0"][data-f="to"]`, '2027-02-28');
    await save();
    assert((await stored()).year === 2026 && (await stored()).breaks.length === 1, '방학 저장 뒤: ' + JSON.stringify(await stored()));
    assert(await newYearPlan() === '2026', '새 연간계획 학년도');
    await tab('settings', 'school');
    await page.fill(`${S} #schYear`, '2027');
    await save();
    assert((await stored()).year === undefined, '자동값으로 되돌렸는데 저장됨: ' + JSON.stringify(await stored()));
    assert(await page.inputValue(`${S} #schYear`) === '2027', '되돌린 뒤 칸');
  }],
  ['[core3-1] 계획 학년도를 바꾼 뒤 [+ 더하기]로 방학 줄을 늘려도(다시 그림) 바꾼 값이 남고 저장됨', async () => {
    await fresh('2026-05-10T09:00:00');
    await tab('settings', 'school');
    await page.fill(`${S} #schYear`, '2027');
    await page.click(`${S} [data-set="addBreak"]`);
    assert(await page.inputValue(`${S} #schYear`) === '2027', '더하기 뒤 칸: ' + await page.inputValue(`${S} #schYear`));
    await page.click(`${S} [data-set="delBreak"]`);
    await save();
    assert((await stored()).year === 2027, '바꾼 학년도가 저장되지 않음: ' + JSON.stringify(await stored()));
    await later('2027-01-10T09:00:00');
    await tab('settings', 'school');
    assert(await page.inputValue(`${S} #schYear`) === '2027', '1월 칸');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
