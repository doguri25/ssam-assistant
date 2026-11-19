// 한 달 달력(스펙 2026-11-19-month-calendar-design): 오늘 화면 [한 달 달력] → 학사일정·공문 기한·연수·예산 마감·기초학력 수업·쪽지 회신·쉬는 날,
// 날짜를 누르면 그날 목록, 줄을 누르면 그 메뉴로, 달 옮기기, 「쌤」에 「12월 일정」. AI는 부르지 않음. 예시 이름은 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));
let aiCalls = 0;
await page.route(/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.upstage\.ai/, r => { aiCalls++; r.abort(); });
const H = 'section[data-menu="home"]', S = '#monthCal', C = '#chatPanel';
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(async () => {
  const cal = await import('./core/calendar.js');
  cal.setEvents('year:y1', [{ date: '2026-11-25', title: '학예회' }]);
  cal.setEvents('gongmun', [{ date: '2026-11-20', title: '[제출] 청렴 실적 보고' }]);
  (await import('./core/settings.js')).setSchool({ name: '새싹초등학교', breaks: [{ from: '2026-11-26', to: '2026-11-27', label: '재량휴업일' }] });
  localStorage.setItem('ssam:training:board', JSON.stringify({ staff: [{ id: 'a', name: '김하늘', dept: '3학년' }, { id: 'b', name: '이바다', dept: '보건교사' }],
    courses: [{ id: 'c1', title: '청렴교육', due: '2026-11-21' }], marks: { c1: { a: { s: 'sent', at: 1 } } } }));
  (await import('./menus/purchase/budget-model.js')).saveProject({ name: '과학실 물품', amount: 300000, due: '2026-11-30' });
  const cm = await import('./menus/class/camp-model.js');
  cm.saveCamp({ ...cm.newCamp({ name: '수학 교실' }), sessions: [cm.newSession({ date: '2026-11-19', start: '14:00', end: '14:40' }), cm.newSession({ date: '2026-11-19', start: '14:50', end: '15:30' })] });
  localStorage.setItem('ssam:msg:list', JSON.stringify([{ id: 'm1', at: Date.now(), title: '[제출 안내] 방과후 수요 조사', kind: 'submit', m: { kind: 'submit', title: '방과후 수요 조사', apply: { due: '2026-11-21' } } }]));
});

await run('fix1119-month', [
  ['오늘 화면 [한 달 달력] → 이번 달, 오늘(기초학력 수업)이 골라져 있음', async () => {
    await enter(page, 'home');
    await page.click(`${H} .hm-head [data-month-open]`);
    await page.waitForSelector(`${S} .mc-grid`);
    assert((await page.textContent('#mcTitle')).trim() === '2026년 11월', await page.textContent('#mcTitle'));
    assert(await page.getAttribute(`${S} [data-mc-day="2026-11-19"]`, 'aria-pressed') === 'true', '오늘을 고름');
    const day = await page.textContent(`${S} #mcDay`);
    assert(day.includes('11월 19일') && day.includes('기초학력 「수학 교실」 수업 2번'), day);
    assert((await page.$$(`${S} .mc-grid tbody tr`)).length === 5, '11월은 5줄');
  }],
  ['칸: 공문 기한·학사일정·쉬는 날(재량휴업일)·예산 마감', async () => {
    assert((await page.textContent(`${S} [data-mc-day="2026-11-20"]`)).includes('청렴 실적 보고'), '공문 기한');
    assert((await page.textContent(`${S} [data-mc-day="2026-11-25"]`)).includes('학예회'), '학사일정');
    assert((await page.getAttribute(`${S} [data-mc-day="2026-11-26"]`, 'class')).includes('off'), '재량휴업일');
    assert((await page.textContent(`${S} [data-mc-day="2026-11-30"]`)).includes('과학실 물품'), '예산 마감');
    assert((await page.getAttribute(`${S} [data-mc-day="2026-11-20"]`, 'class')).includes('hot'), '사흘 안 기한은 눈에 띄게');
  }],
  ['날짜를 누르면 그날 목록(연수 현황판 미제출·쪽지 회신), 줄을 누르면 그 메뉴로', async () => {
    await page.click(`${S} [data-mc-day="2026-11-21"]`);
    const day = await page.textContent(`${S} #mcDay`);
    assert(day.includes('연수 현황 「청렴교육」 제출 기한 · 미제출 1명') && day.includes('쪽지 「방과후 수요 조사」 신청·회신 마감'), day);
    await page.click(`${S} #mcDay .mc-it.k-training`);
    await page.waitForSelector(S, { state: 'detached' });
    await page.waitForFunction(() => document.querySelector('#menuTabs [data-tab="board"][aria-current="page"]'));
    assert(await page.isVisible('section[data-menu="training"] .tr-table'), '연수 현황판');
  }],
  ['달 옮기기: 다음 달(성탄절은 쉬는 날)·이번 달로·화살표 키', async () => {
    await enter(page, 'home');
    await page.click(`${H} .hm-gm [data-month-open]`);
    await page.waitForSelector(`${S} .mc-grid`);
    await page.click(`${S} [data-mc="next"]`);
    assert((await page.textContent('#mcTitle')).trim() === '2026년 12월', await page.textContent('#mcTitle'));
    assert((await page.getAttribute(`${S} [data-mc-day="2026-12-25"]`, 'class')).includes('off'), '성탄절');
    await page.click(`${S} [data-mc="now"]`);
    assert((await page.textContent('#mcTitle')).trim() === '2026년 11월', '이번 달로');
    await page.focus(`${S} [data-mc-day="2026-11-19"]`);
    await page.keyboard.press('ArrowRight');
    assert(await page.getAttribute(`${S} [data-mc-day="2026-11-20"]`, 'aria-pressed') === 'true', '→ 다음 날');
    assert((await page.textContent(`${S} #mcDay`)).includes('청렴 실적 보고'), '그날 목록');
    await page.click(`${S} [data-close]`);
    await page.waitForSelector(S, { state: 'detached' });
  }],
  ['좁은 화면(360px): 달력이 화면 안에(가로 스크롤 없음)', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await enter(page, 'home');
    await page.click(`${H} .hm-head [data-month-open]`);
    await page.waitForSelector(`${S} .mc-grid`);
    const ok = await page.evaluate(() => { const s = document.querySelector('#sheetRoot .sheet'); return document.documentElement.scrollWidth <= window.innerWidth && s.scrollWidth <= s.clientWidth + 1; });
    await page.click(`${S} [data-close]`);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['「쌤」에 「12월 일정」 → 12월 달력', async () => {
    if (await page.isHidden(C)) await page.click('#inboxFab');
    await page.waitForSelector(`${C}:not([hidden])`);
    await page.fill('#chatText', '12월 일정 보여 줘'); await page.click('#chatSend');
    await page.waitForSelector(`${S} .mc-grid`);
    assert((await page.textContent('#mcTitle')).trim() === '2026년 12월', await page.textContent('#mcTitle'));
    await page.click(`${S} [data-close]`);
  }],
  ['AI를 부르지 않음·페이지 오류 없음', async () => {
    assert(aiCalls === 0, `AI ${aiCalls}번`);
    assert(errors.length === 0, errors.join(' | '));
  }]
]);
await t.close();
