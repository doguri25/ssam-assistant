// 학급 고침(2026-11-10): 주간학습안내를 켜 둔 채 날이 바뀌면 그날의 기본 주로, [복사]에 수업 없는 날 고친 칸도 들어감,
// 점심시간 줄이 있는 시간표 CSV, 저장 공간이 꽉 차면 AI 알림·[다시 채우기]가 「채웠어요」 대신 알림
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.install({ time: new Date('2026-10-30T09:00:00') }); // 금요일
const V = 'section[data-menu="class"]';
const tmp = mkdtempSync(join(tmpdir(), 'fix1110-class-'));
const tab = async id => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
const week = () => page.textContent(`${V} .cls-week-nav b`);
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async () => JSON.stringify({ days: [0, 1, 2, 3, 4].map(() => ({ prep: '색연필', safety: '복도에서 걷기', homework: '', notice: '' })) }));
// 고른 키만 저장 실패 (QuotaExceededError)
const full = re => page.evaluate(re => {
  const o = window.__set || Storage.prototype.setItem; window.__set = o;
  Storage.prototype.setItem = function (k, v) { if (new RegExp(re).test(k)) throw new DOMException('꽉 참', 'QuotaExceededError'); return o.call(this, k, v); };
}, re);
const notFull = () => page.evaluate(() => { if (window.__set) Storage.prototype.setItem = window.__set; });
await page.goto(url);
await page.waitForTimeout(400);
await tab('progress');
await page.click(`${V} [data-c="sample"]`);

await run('fix1110-class', [
  ['[class-weekly-day-1] 주간학습안내를 보다 다른 메뉴에 갔다가 며칠 뒤(목요일) 돌아오면 그날의 기본 주(다음 주)', async () => {
    await tab('weekly');
    assert((await week()).includes('11월 2일 (월)'), await week());
    await page.click('nav.app-side [data-menu-go="settings"]');
    await page.clock.setSystemTime(new Date('2026-11-05T09:00:00'));
    await page.click('nav.app-side [data-menu-go="class"]');
    assert((await week()).includes('11월 9일 (월)'), '지난 주에 머묾: ' + await week());
  }],
  ['[class-weekly-day-1] 켜 둔 채 날이 바뀌어 창으로 돌아와도 기본 주로, 선생님이 옮긴 주는 그대로', async () => {
    await page.clock.setSystemTime(new Date('2026-11-12T09:00:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert((await week()).includes('11월 16일 (월)'), '창으로 돌아와도 그대로: ' + await week());
    await page.click(`${V} [data-w="prev"]`); await page.click(`${V} [data-w="prev"]`); // 11/2 주를 고름
    await page.clock.setSystemTime(new Date('2026-11-13T09:00:00'));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert((await week()).includes('11월 2일 (월)'), '고른 주가 바뀜: ' + await week());
  }],
  ['[class-weekly-copy-2] [복사]: 수업 없는 날(대체공휴일)에 고쳐 쓴 칸도 글에 들어가고, 고치지 않은 쉬는 날은 까닭', async () => {
    for (let i = 0; i < 4; i++) await page.click(`${V} [data-w="prev"]`); // 10/5 주(월 대체공휴일, 금 한글날)
    assert((await week()).includes('10월 5일 (월)'), await week());
    assert((await page.inputValue(`${V} textarea[data-wc="0-1"]`)).includes('공휴일'), '월요일 1교시 칸');
    await page.fill(`${V} textarea[data-wc="0-1"]`, '학교 문을 여는 날 행사');
    await page.fill(`${V} textarea[data-wc="0-2"]`, '체험 활동');
    await page.click(`${V} [data-w="copy"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    const mon = txt.split('[화 10/6]')[0], fri = txt.split('[금 10/9]')[1] || '';
    assert(mon.includes('1교시 학교 문을 여는 날 행사') && mon.includes('2교시 체험 활동') && !mon.includes('대체공휴일'), mon);
    assert(fri.includes('공휴일(한글날)'), fri.slice(0, 80));
  }],
  ['[class-tt-lunch-3] 점심시간 줄이 있는 시간표 CSV도 6교시까지 넣음', async () => {
    await tab('progress');
    const p = join(tmp, '기초시간표.csv');
    writeFileSync(p, '3-1,월,화,수,목,금\n1,국어,수학,국어,수학,국어\n2,수학,국어,수학,국어,수학\n3,사회,과학,사회,과학,사회\n4,과학,체육,음악,미술,체육\n점심시간,,,,,\n5,체육,창체,영어,미술,도덕\n6,음악,창체,,창체,\n');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-c="ttFile"]`)]);
    await fc.setFiles(p);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:timetable')).cells[0][5] === '음악');
    const tt = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:timetable')));
    assert(tt.periods === 6 && tt.cells[2][4] === '영어', JSON.stringify(tt));
  }],
  ['[class-weekly-full-4] 저장 공간이 꽉 차면 AI 알림은 「빈 칸을 채웠어요」 대신 저장하지 못했다고, 칸에도 넣지 않음', async () => {
    await tab('weekly');
    const mon = (await week()).split(' ~')[0];
    await full('^ssam:class:weekly:');
    await page.click(`${V} [data-w="ai"]`);
    await page.waitForFunction(() => !document.querySelector('section[data-menu="class"] [data-w="ai"]').disabled);
    await page.waitForTimeout(100);
    const msg = await page.textContent('#toast');
    assert(msg.includes('저장 공간이 모자라') && !msg.includes('채웠어요'), msg);
    assert(await page.inputValue(`${V} textarea[data-wn="0-prep"]`) === '', '저장하지 못한 글이 칸에 보임');
    // [다시 채우기]도 「다시 채웠어요」 대신 알림
    await page.click(`${V} [data-w="refill"]`);
    await page.waitForTimeout(100);
    const msg2 = await page.textContent('#toast');
    await notFull();
    assert(msg2.includes('저장 공간이 모자라') && !msg2.includes('다시 채웠어요'), msg2);
    assert((await week()).startsWith(mon), '주가 바뀜');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
