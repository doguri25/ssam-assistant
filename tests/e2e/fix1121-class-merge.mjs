// 학급 메뉴에 다른 선생님 변경분 옮겨 넣기(2026-11-21) — 화면.
// 오늘 수업 [완료]: 같은 날 앞 교시의 같은 교과도 함께 완료할지 묻기·「앞 교시도 함께 묻기」 스위치·함께 해제, 진도표·시수와 준비 화면의 다음 차시,
// 주간학습안내 칸의 단원. 이름·학교는 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-18T09:00:00')); // 수요일
const V = 'section[data-menu="class"]';
const MON = '2026-11-16';
const tab = id => enter(page, 'class', id);
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const line = p => page.locator(`${V} .cls-today li[data-p="${p}"]`);
const done = p => line(p).locator('[data-mark="done"]');
const pressed = async p => (await done(p).getAttribute('aria-pressed')) === 'true';
const day = async d => { await page.fill(`${V} #clsDate`, d); await page.waitForFunction(d => document.querySelector('section[data-menu="class"] #clsDate').value === d, d); await page.waitForTimeout(80); };
const sheetOpen = () => page.isVisible('#sheetRoot #clsDoneWith');
const monLog = async () => ((await stored('class:log')) || {})[MON] || {};

await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(async () => {
  const m = await import('./menus/class/class-model.js');
  const c = Array.from({ length: 5 }, () => Array(6).fill(''));
  c[0][0] = '국어'; c[0][1] = '국어'; c[0][2] = '국어'; c[0][3] = '수학'; // 월: 국어 세 시간
  c[1][0] = '국어'; c[1][1] = '수학'; // 화: 같은 교과 한 시간씩
  c[2][0] = '수학'; c[2][1] = '국어';
  m.setInfo({ grade: 3, room: 1 });
  m.setTimetable({ periods: 6, cells: c });
  const L = (unit, n) => Array.from({ length: n }, (_, i) => ({ week: null, period: '', from: '', unit, title: `주제 ${i + 1}`, pages: '118~119', memo: '' }));
  m.saveSubject({ id: 'ko', name: '국어', start: '2026-11-02', offset: 0, lessons: L('3. 정확하게 글을 써요', 40) });
  m.saveSubject({ id: 'ma', name: '수학', start: '2026-11-02', offset: 0, lessons: L('4. 나눗셈', 30) });
});
await tab('today');
await day(MON);

await run('fix1121-class-merge', [
  ['같은 교과가 두 시간 넘는 날: 「앞 교시도 함께 완료할지 묻기」 스위치(처음은 켜짐)', async () => {
    const sw = page.locator(`${V} .cls-today [data-ask-prev]`);
    assert(await sw.isVisible() && await sw.isChecked(), '스위치');
    assert((await sw.getAttribute('role')) === 'switch', 'role');
  }],
  ['3교시 [완료] → 묻는 창 → 「1·2교시도 함께 완료」: 세 칸 완료, 1·2교시는 by 3', async () => {
    await done(3).click();
    await page.waitForSelector('#sheetRoot #clsDoneWith');
    const txt = await page.textContent('#sheetRoot .sheet');
    assert(txt.includes('1·2교시') && txt.includes('함께 완료'), txt);
    await page.click('#sheetRoot #clsDoneWith');
    await page.waitForFunction(() => !document.querySelector('#sheetRoot #clsDoneWith'));
    const d = await monLog();
    assert(d[1].status === 'done' && d[2].status === 'done' && d[3].status === 'done' && d[1].by === 3 && d[2].by === 3 && !d[3].by, JSON.stringify(d));
    assert(await pressed(1) && await pressed(2) && await pressed(3), '화면 체크');
  }],
  ['3교시 [완료]를 다시 누르면 함께 완료한 1·2교시도 해제', async () => {
    await done(3).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ssam:class:log') || '{}')['2026-11-16']);
    assert(!(await pressed(1)) && !(await pressed(2)) && !(await pressed(3)), '화면 체크가 남음');
    assert(!(await sheetOpen()), '해제할 때 묻는 창');
  }],
  ['「3교시만 완료」는 그 칸만 — 다시 누르면 묻지 않고 그 칸만 해제', async () => {
    await done(3).click();
    await page.waitForSelector('#sheetRoot #clsDoneOnly');
    await page.click('#sheetRoot #clsDoneOnly');
    await page.waitForFunction(() => !document.querySelector('#sheetRoot #clsDoneOnly'));
    let d = await monLog();
    assert(d[3] && d[3].status === 'done' && !d[1] && !d[2], JSON.stringify(d));
    await done(3).click();
    await page.waitForTimeout(120);
    assert(!(await sheetOpen()), '해제인데 물음');
    d = await monLog();
    assert(!d[3], JSON.stringify(d));
  }],
  ['스위치를 끄면 묻지 않고 누른 칸만 완료 — 이 기기에 기억(class:askPrev)', async () => {
    await page.locator(`${V} .cls-today [data-ask-prev]`).uncheck();
    await page.waitForFunction(() => localStorage.getItem('ssam:class:askPrev') === 'false');
    await done(2).click();
    await page.waitForTimeout(150);
    assert(!(await sheetOpen()), '꺼도 물음');
    const d = await monLog();
    assert(d[2] && d[2].status === 'done' && !d[1], JSON.stringify(d));
    await done(2).click();
    await page.waitForTimeout(100);
    assert(!(await monLog())[2], '해제');
  }],
  ['묻는 창의 「다음부터 묻지 않기」는 스위치를 끔', async () => {
    await page.locator(`${V} .cls-today [data-ask-prev]`).check();
    await page.waitForFunction(() => localStorage.getItem('ssam:class:askPrev') === 'true');
    await done(3).click();
    await page.waitForSelector('#sheetRoot #clsAskOff');
    await page.check('#sheetRoot #clsAskOff');
    await page.click('#sheetRoot #clsDoneWith');
    await page.waitForFunction(() => localStorage.getItem('ssam:class:askPrev') === 'false');
    assert(!(await page.locator(`${V} .cls-today [data-ask-prev]`).isChecked()), '스위치가 켜져 있음');
    const d = await monLog();
    assert(d[1].by === 3 && d[2].by === 3 && d[3].status === 'done', JSON.stringify(d));
    // 꺼져 있어도 함께 완료한 칸은 같이 해제
    await done(3).click();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ssam:class:log') || '{}')['2026-11-16']);
    await page.locator(`${V} .cls-today [data-ask-prev]`).check();
  }],
  ['같은 교과가 한 시간씩인 날(화)에는 스위치 없음', async () => {
    await day('2026-11-17');
    assert(!(await page.isVisible(`${V} .cls-today [data-ask-prev]`)), '스위치');
    await day(MON);
  }],
  ['진도표·시수 「다음 차시」: 학습 주제, 아래 작은 글씨로 단원 · 단원 안 차시', async () => {
    await tab('progress');
    const c = page.locator(`${V} .cls-sum tbody tr`, { hasText: '국어' }).first().locator('.next-cell');
    const main = await c.evaluate(el => el.firstChild.textContent.trim()), small = (await c.locator('small').textContent()).trim();
    assert(/^주제 \d+$/.test(main), main);
    assert(/^3\. 정확하게 글을 써요 · \d+\/40차시$/.test(small), small);
  }],
  ['준비 화면: 고른 다음 차시 상자 — 목록에서 바꾸면 상자도 바뀜', async () => {
    if (await page.isVisible(`${V} [data-pg="setup"]`)) await page.click(`${V} [data-pg="setup"]`);
    await page.waitForSelector(`${V} .cls-setup [data-next-box="ko"]`);
    await page.selectOption(`${V} .cls-setup select[data-next="ko"]`, '7');
    await page.waitForFunction(() => (document.querySelector('section[data-menu="class"] [data-next-box="ko"]') || {}).textContent?.includes('주제 7'));
    const box = page.locator(`${V} [data-next-box="ko"]`);
    assert((await box.getAttribute('title')).includes('3. 정확하게 글을 써요 주제 7 · 7/40차시'), await box.getAttribute('title'));
    assert((await box.getAttribute('tabindex')) === '0', '초점');
    // 끝(모두 마침)을 고르면 상자 없음
    await page.selectOption(`${V} .cls-setup select[data-next="ko"]`, '41');
    await page.waitForFunction(() => !document.querySelector('section[data-menu="class"] [data-next-box="ko"]'));
    await page.selectOption(`${V} .cls-setup select[data-next="ko"]`, '3');
    await page.waitForSelector(`${V} [data-next-box="ko"]`);
  }],
  ['주간학습안내 칸: 교과 · 단원 · 학습 주제 (쪽수)', async () => {
    await tab('weekly');
    await page.waitForSelector(`${V} textarea[data-wc="0-1"]`);
    const v = await page.inputValue(`${V} textarea[data-wc="0-1"]`);
    assert(/^국어 · 3\. 정확하게 글을 써요 · 주제 \d+ \(118~119쪽\)$/.test(v), v);
  }],
  ['좁은 화면(360px) 가로 스크롤 없음 — 오늘 수업(스위치)·진도표·시수', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await tab('today'); await day(MON);
    await page.waitForTimeout(150);
    const a = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await tab('progress');
    await page.waitForTimeout(150);
    const b = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(a && b, `가로 스크롤 오늘 ${a} 진도표 ${b}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
