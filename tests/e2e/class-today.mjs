// 학급 › 오늘 수업: 빈 상태, 교시별 차시, 완료·일부 진행·못 함, 같은 교과 두 시간, 진도표 없는 교과, 수업 없는 날, 학사일정, 체크 안 한 날
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const V = 'section[data-menu="class"]';
const tab = async id => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const line = p => page.locator(`${V} .cls-today li[data-p="${p}"]`);
await page.goto(url);
await page.waitForTimeout(400);
await tab('today');

await run('class-today', [
  ['시간표가 없으면 안내와 두 버튼', async () => {
    const txt = await page.textContent(`${V} .cls-today`);
    assert(txt.includes('먼저 진도표·시수 › 준비에서 시간표를 넣어 주세요'), '안내: ' + txt);
    assert(await page.isVisible(`${V} .cls-today [data-t="setup"]`) && await page.isVisible(`${V} .cls-today [data-t="sample"]`), '버튼');
  }],
  ['예시로 채우기 → 목요일 교시들, 차시·학습 주제·쪽수', async () => {
    await page.click(`${V} .cls-today [data-t="sample"]`);
    await page.waitForSelector(`${V} .cls-today li[data-p="1"]`);
    assert((await page.textContent(`${V} .cls-today .cls-day`)).includes('10월 29일 (목)'), '날짜');
    assert(await page.locator(`${V} .cls-today li[data-p]`).count() === 6, '교시 수');
    const ko = await line(2).textContent();
    assert(ko.includes('국어(자)') && /\d+\/\d+차시/.test(ko) && ko.includes('쪽'), '국어 줄: ' + ko);
    const sub = (await stored('class:subjects')).find(x => x.name === '국어');
    const i = +(await line(2).getAttribute('data-index'));
    assert(ko.includes(sub.lessons[i].no + '차시'), `단원 안 차시 ${sub.lessons[i].no}: ` + ko);
  }],
  ['완료 → 눌린 모양, 시수 +1, 다시 누르면 지워짐', async () => {
    const before = (await stored('class:subjects')).find(s => s.name === '수학');
    await line(1).locator('[data-mark="done"]').click();
    assert(await line(1).locator('[data-mark="done"]').getAttribute('aria-pressed') === 'true', '눌린 모양');
    assert((await stored('class:log'))['2026-10-29'][1].status === 'done', '기록');
    await tab('progress');
    const done = (await page.locator(`${V} .cls-sum tbody tr`, { hasText: '수학' }).first().locator('td').nth(1).textContent()).trim();
    assert(done === String(before.offset + 1), `실시: ${done} (보정값 ${before.offset})`);
    await tab('today');
    await line(1).locator('[data-mark="done"]').click();
    assert(await line(1).locator('[data-mark="done"]').getAttribute('aria-pressed') === 'false', '안 지워짐');
    assert(!(await stored('class:log'))['2026-10-29'], '기록이 남음');
  }],
  ['같은 날 같은 교과 두 시간: 앞 시간 완료 → 뒤 시간 다음 차시, 일부 진행이면 그대로', async () => {
    await page.evaluate(() => { const k = 'ssam:class:timetable'; const t = JSON.parse(localStorage.getItem(k)); t.cells[3][2] = '국어'; localStorage.setItem(k, JSON.stringify(t)); });
    await tab('progress'); await tab('today');
    const n = async p => +(await line(p).getAttribute('data-index'));
    const a = await n(2), b = await n(3);
    assert(b === a + 1, `기록 없음 ${a} ${b}`);
    await line(2).locator('[data-mark="part"]').click();
    assert(await n(3) === a, '일부 진행인데 다음 차시로 감');
    await line(2).locator('[data-mark="done"]').click();
    assert(await n(3) === a + 1, '완료인데 같은 차시');
    assert(await line(2).locator('[data-mark="part"]').getAttribute('aria-pressed') === 'false', '버튼 하나만 눌림');
  }],
  ['진도표 없는 교과는 「진도표 없음」, 버튼 없음', async () => {
    const en = line(4);
    assert((await en.textContent()).includes('영어') && (await en.textContent()).includes('진도표 없음'), '영어 줄');
    assert(await en.locator('[data-mark]').count() === 0, '버튼이 있음');
  }],
  ['학사일정 칩', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:calendar', JSON.stringify([{ date: '2026-10-29', title: '학예회 예행연습', source: 'event:x' }])));
    await tab('progress'); await tab('today');
    assert((await page.textContent(`${V} .cls-today .cls-events`)).includes('학예회 예행연습'), '칩');
  }],
  ['수업 없는 날: 토요일, 공휴일', async () => {
    await page.fill(`${V} #clsDate`, '2026-10-31');
    await page.waitForSelector(`${V} .cls-off`);
    assert((await page.textContent(`${V} .cls-off`)).includes('토요일'), '토요일');
    await page.fill(`${V} #clsDate`, '2026-10-09');
    await page.waitForFunction(() => document.querySelector('.cls-off') && document.querySelector('.cls-off').textContent.includes('공휴일(한글날)'));
    await page.click(`${V} [data-t="today"]`);
    assert((await page.textContent(`${V} .cls-today .cls-day`)).includes('10월 29일'), '오늘로');
    await page.click(`${V} [data-t="prev"]`);
    assert((await page.textContent(`${V} .cls-today .cls-day`)).includes('10월 28일'), '전날');
    await page.click(`${V} [data-t="next"]`);
  }],
  ['체크하지 않은 날 → 누르면 그날로', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:class:log', JSON.stringify({ '2026-10-26': { 1: { subject: '국어', status: 'done' } }, '2026-10-29': { 2: { subject: '국어(자)', status: 'done' } } })));
    await tab('progress'); await tab('today');
    const days = await page.$$eval(`${V} [data-go-day]`, bs => bs.map(b => b.dataset.goDay));
    assert(days.join(',') === '2026-10-27,2026-10-28', '날: ' + days);
    await page.click(`${V} [data-go-day="2026-10-27"]`);
    assert((await page.textContent(`${V} .cls-today .cls-day`)).includes('10월 27일'), '그날로');
  }],
  ['다른 날을 보다가 다른 메뉴에 갔다 오면 오늘로', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.click('nav.app-side [data-menu-go="class"]');
    assert((await page.textContent(`${V} .cls-today .cls-day`)).includes('10월 29일'), await page.textContent(`${V} .cls-today .cls-day`));
  }],
  ['켜 둔 채 날이 바뀌면 다시 볼 때 오늘로', async () => {
    await page.clock.setFixedTime(new Date('2026-10-30T08:10:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(100);
    const day = await page.textContent(`${V} .cls-today .cls-day`);
    await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
    assert(day.includes('10월 30일'), day);
  }],
  ['좁은 화면(360px) 가로 스크롤 없음', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
