// 기초학력 캠프 › 출석 체크 「한눈에」(2026-11-13 선생님 요청: 날마다 넘기지 않고 한 번에 보며 체크)
// 학생 × 수업 날 표 한 장(하루 여러 교시면 날짜 아래 교시), 칸을 누르면 ○ → / → 빈칸, 오늘 열 표시·오늘로 스크롤, 학생별 출석 계,
// 누른 뒤에도 보던 자리 그대로, 「하루씩·한눈에」는 기억(다시 켜도), 390px에서 화면이 가로로 넘치지 않음. 이름은 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-07T10:00:00'));
const C = 'section[data-menu="class"]', P = `${C} .cls-camp`;
const camp = () => page.evaluate(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); return v && (v.camps.find(c => c.id === v.current) || v.camps[0]); });
const DATES = ['2026-09-02', '2026-09-03', '2026-09-09', '2026-09-10', '2026-09-16', '2026-09-17', '2026-09-23', '2026-09-30', '2026-10-01', '2026-10-07', '2026-10-08', '2026-10-14', '2026-10-15', '2026-10-21', '2026-10-22', '2026-10-28', '2026-10-29', '2026-11-04', '2026-11-05', '2026-11-11'];
const seed = (dates, perDay = 1) => page.evaluate(async ({ dates, perDay }) => {
  const M = await import('./menus/class/camp-model.js');
  localStorage.removeItem('ssam:camp');
  const c = M.newCamp({ name: '중점학급 교과캠프' });
  c.students = [M.newStudent({ name: '김하늘' }), M.newStudent({ name: '이바다' })];
  c.sessions = dates.flatMap(d => Array.from({ length: perDay }, (_, i) => M.newSession({ date: d, start: `${String(9 + i).padStart(2, '0')}:00`, end: `${String(9 + i).padStart(2, '0')}:40`, subject: i % 2 ? '수학' : '국어' })));
  // 앞의 두 날은 다 체크해 둠
  for (const s of c.sessions.filter(s => s.date <= dates[1])) c.att[s.id] = Object.fromEntries(c.students.map(st => [st.id, 'O']));
  M.saveCamp(c); M.setCurrentCamp(c.id);
}, { dates, perDay });
const view = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:camp:attView') || 'null'));

await page.goto(url);
await page.waitForTimeout(400);
await seed(DATES);
await enter(page, 'class', 'camp');
await page.waitForSelector(`${P} .cp-page`);
await page.click(`${P} [data-sec="att"]`);

await run('camp-att-all', [
  ['출석 체크 위에 「하루씩 · 한눈에」, 처음엔 하루씩(날짜 칩)', async () => {
    assert(await page.getAttribute(`${P} [data-att-view="day"]`, 'aria-pressed') === 'true', '하루씩이 켜짐');
    assert(await page.$(`${P} .cp-days`) && !(await page.$(`${P} .cp-all`)), '날짜 칩 보기');
  }],
  ['「한눈에」: 학생 2줄 × 수업 20칸 한 표, 날짜 머리(9/2(수)…)·교과, 다 체크한 날 ✓, 오늘(10/7) 열 표시, 학생별 출석 계', async () => {
    await page.click(`${P} [data-att-view="all"]`);
    await page.waitForSelector(`${P} .cp-all`);
    assert(await view() === 'all', '기억: ' + await view());
    const heads = await page.$$eval(`${P} .cp-all thead th[data-col-date]`, a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert(heads.length === 20 && heads[0].startsWith('9/2(수)') && heads[0].includes('✓') && heads[0].includes('국어'), heads.slice(0, 3).join(' | '));
    assert(!heads[2].includes('✓'), '9/9는 아직');
    assert(await page.$$eval(`${P} .cp-all tbody tr`, a => a.length) === 2, '학생 2줄');
    assert(await page.$$eval(`${P} .cp-all tbody tr:first-child [data-att]`, a => a.length) === 20, '수업 20칸');
    assert(await page.textContent(`${P} .cp-all tbody tr:first-child th`) === '김하늘', '이름 칸');
    assert(await page.getAttribute(`${P} .cp-all th[data-col-date="2026-10-07"]`, 'class').then(c => c.includes('today')), '오늘 열');
    assert((await page.textContent(`${P} .cp-all tbody tr:first-child .cp-all-sum`)).trim() === '2/20', '출석 계');
    assert((await page.textContent(`${P} .cp-all-left`)).includes('남은 칸 36개'), await page.textContent(`${P} .cp-all-left`));
  }],
  ['오늘 열이 보이게 스크롤돼 있고, 이름 칸은 가로로 넘겨도 왼쪽에 붙어 있음', async () => {
    const r = await page.evaluate(() => {
      const w = document.querySelector('.cls-camp .cp-all-wrap'), th = w.querySelector('th[data-col-date="2026-10-07"]').getBoundingClientRect(), b = w.getBoundingClientRect();
      const name = w.querySelector('tbody th').getBoundingClientRect();
      return { scrolled: w.scrollLeft > 0 || w.scrollWidth <= w.clientWidth, todayIn: th.left >= b.left && th.right <= b.right + 1, nameLeft: name.left - b.left };
    });
    assert(r.scrolled && r.todayIn, JSON.stringify(r));
    assert(Math.abs(r.nameLeft) < 2, '이름 칸 왼쪽 고정: ' + r.nameLeft);
  }],
  ['칸을 누르면 ○ → / → 빈칸, 누른 뒤에도 한눈에·스크롤 자리·초점 그대로, 계가 바뀜', async () => {
    const sel = `${P} .cp-all tbody tr:nth-child(2) th[scope="row"] ~ td [data-att]`;
    const before = await page.evaluate(() => document.querySelector('.cls-camp .cp-all-wrap').scrollLeft);
    const key = await page.evaluate(() => { const b = document.querySelectorAll('.cls-camp .cp-all tbody tr')[1].querySelectorAll('[data-att]')[9]; return b.dataset.att; });
    const btn = `${P} [data-att="${key}"]`;
    await page.click(btn);
    assert((await page.getAttribute(btn, 'class')).includes('m-O'), '○');
    assert(await page.evaluate(() => document.querySelector('.cls-camp .cp-all-wrap').scrollLeft) === before, '스크롤 자리 그대로');
    assert(await page.evaluate(k => document.activeElement && document.activeElement.dataset.att === k, key), '초점 그대로');
    assert((await page.textContent(`${P} .cp-all tbody tr:nth-child(2) .cp-all-sum`)).trim() === '3/20');
    await page.keyboard.press('Enter');
    assert((await page.getAttribute(btn, 'class')).includes('m-X'), '/ (키보드로)');
    await page.click(btn);
    assert((await page.getAttribute(btn, 'class')).includes('m-none'), '빈칸');
    const [sid, st] = key.split('|');
    assert(!((await camp()).att[sid] || {})[st], '저장도 빈칸');
    void sel;
  }],
  ['다시 켜도 한눈에, 「하루씩」을 누르면 날짜 칩으로', async () => {
    await page.reload(); await page.waitForTimeout(300);
    await enter(page, 'class', 'camp'); await page.waitForSelector(`${P} .cp-page`);
    await page.click(`${P} [data-sec="att"]`);
    await page.waitForSelector(`${P} .cp-all`);
    await page.click(`${P} [data-att-view="day"]`);
    await page.waitForSelector(`${P} .cp-days`);
    assert(await view() === 'day');
    await page.click(`${P} [data-att-view="all"]`);
    await page.waitForSelector(`${P} .cp-all`);
  }],
  ['하루 여러 교시: 날짜 머리 아래 교시(시각·교과) 줄, 날짜 머리는 교시 수만큼 넓음', async () => {
    await seed(DATES.slice(0, 3), 3);
    await page.click(`${P} [data-sec="info"]`); await page.click(`${P} [data-sec="att"]`);
    await page.waitForSelector(`${P} .cp-all`);
    assert(await page.$$eval(`${P} .cp-all thead tr`, a => a.length) === 2, '머리 2줄');
    assert(await page.getAttribute(`${P} .cp-all th[data-col-date="2026-09-09"]`, 'colspan') === '3', 'colspan 3');
    const sub = await page.$$eval(`${P} .cp-all thead tr:nth-child(2) th`, a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert(sub.length === 9 && sub[0].startsWith('09:00') && sub[1].includes('수학'), sub.join(' | '));
    assert(await page.$$eval(`${P} .cp-all tbody tr:first-child [data-att]`, a => a.length) === 9);
  }],
  ['390px: 표만 가로로 넘기고 화면은 넘치지 않음, 칸은 44px 이상', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const o = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    assert(o[0] <= o[1], '화면 넘침: ' + o);
    const sz = await page.$eval(`${P} .cp-all [data-att]`, e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
    assert(sz[0] >= 44 && sz[1] >= 44, '칸 크기: ' + sz);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
