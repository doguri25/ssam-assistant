// 학급 › 오늘 수업 · 진도표·시수 손보기(2026-11-18, 스펙 docs/superpowers/specs/2026-11-18-class-fix-design.md A) — 화면.
// 공문 띠 차례, 학급 탭끼리 고른 날, 시간표 「오늘부터 / 처음부터」, 접힌 준비, 다음 차시·진도표대로 맞추기와 실시, 앞날, 반만 체크한 날,
// 시수만·전담, 하루 한꺼번에, 교과 바꾸기, 수업 메모, 재량휴업일, 좁은 화면. 이름·학교는 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-18T09:00:00')); // 수요일
const V = 'section[data-menu="class"]';
const tab = id => enter(page, 'class', id);
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const line = p => page.locator(`${V} .cls-today li[data-p="${p}"]`);
const day = async d => { await page.fill(`${V} #clsDate`, d); await page.waitForFunction(d => document.querySelector('section[data-menu="class"] #clsDate').value === d, d); await page.waitForTimeout(80); };
const row = name => page.locator(`${V} .cls-sum tbody tr`, { hasText: name }).first();
const cell = async (name, i) => (await row(name).locator('td').nth(i).textContent()).trim();
const openSetup = async () => { if (await page.isVisible(`${V} [data-pg="setup"]`)) await page.click(`${V} [data-pg="setup"]`); await page.waitForSelector(`${V} .cls-setup #clsPeriods`); };
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => localStorage.setItem('ssam:gongmun:list', JSON.stringify([
  { id: 'a', title: '9월 안전교육 결과 제출', due: '2026-09-30', done: false, at: 1 },
  { id: 'b', title: '10월 급식 만족도', due: '2026-10-20', done: false, at: 2 },
  { id: 'c', title: '독서 실적 보고', due: '2026-11-02', done: false, at: 3 },
  { id: 'd', title: '학부모 상담 결과', due: '2026-11-18', done: false, at: 4 },
  { id: 'e', title: '방과후 수요조사', due: '2026-11-19', done: false, at: 5 }])));
await tab('today');

await run('fix1118-class-today', [
  ['[A3] 공문 띠: 오늘·내일 먼저, 오래 지난 공문은 뒤, 3개 + 외 2건', async () => {
    await page.click(`${V} .cls-today [data-t="sample"]`);
    await page.waitForSelector(`${V} .cls-today li[data-p="1"]`);
    const b = await page.$$eval('#gmBand [data-gm-band]', bs => bs.map(x => x.textContent.trim()));
    assert(b.length === 4 && b[0].includes('오늘') && b[0].includes('학부모 상담') && b[1].includes('D-1') && b[2].includes('16일 지남') && b[3] === '외 2건', JSON.stringify(b));
  }],
  ['[A10] 학급 탭끼리 오가도 고른 날 그대로', async () => {
    await day('2026-11-16');
    await tab('progress'); await tab('today');
    assert((await page.textContent(`${V} .cls-today .cls-day`)).includes('11월 16일'), await page.textContent(`${V} .cls-today .cls-day`));
  }],
  ['[A1] 시간표를 「오늘부터」 바꾸면 지난 월요일은 체크한 국어 그대로, 다음 월요일은 수학', async () => {
    await line(1).locator('[data-mark="done"]').click();
    assert((await stored('class:log'))['2026-11-16'][1].subject === '국어', '기록');
    await tab('progress');
    const before = await cell('국어', 1);
    // 시간표·진도표가 있으면 준비는 접혀 있고 맨 위에 [시간표·진도표 고치기]
    assert(!(await page.isVisible(`${V} .cls-setup #clsPeriods`)) && await page.isVisible(`${V} [data-pg="setup"]`), '준비가 펼쳐져 있음');
    await openSetup();
    await page.fill(`${V} input[data-cell="0-1"]`, '수학'); await page.press(`${V} input[data-cell="0-1"]`, 'Tab');
    await page.waitForSelector('#sheetRoot #clsWhenToday');
    assert((await page.textContent('#sheetRoot .sheet')).includes('월요일 1교시를 「수학」(으)로 바꿔요'), await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot #clsWhenToday');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:timetable')).cells[0][0] === '수학');
    const tt = await stored('class:timetable');
    assert(tt.versions.length === 2 && tt.versions[1].from === '2026-11-18' && tt.versions[0].cells[0][0] === '국어', JSON.stringify(tt.versions.map(v => [v.from, v.cells[0][0]])));
    assert(await page.inputValue(`${V} input[data-cell="0-1"]`) === '수학', '칸');
    assert(await cell('국어', 1) === before, `국어 실시 ${before} → ${await cell('국어', 1)}`);
    await tab('today');
    assert((await line(1).locator('.cls-l-s').textContent()) === '국어' && await line(1).locator('[data-mark="done"]').getAttribute('aria-pressed') === 'true', '11/16 1교시');
    await day('2026-11-23');
    assert((await line(1).locator('.cls-l-s').textContent()) === '수학', '11/23 1교시');
  }],
  ['[A1] 「처음부터 고치기」: 지난 금요일도 바뀜, 탭에 다시 오면 다시 물음', async () => {
    await tab('progress'); await openSetup();
    await page.fill(`${V} input[data-cell="4-5"]`, '체육'); await page.press(`${V} input[data-cell="4-5"]`, 'Tab');
    await page.click('#sheetRoot #clsWhenAll');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:timetable')).cells[4][4] === '체육');
    const tt = await stored('class:timetable');
    assert(tt.versions.every(v => v.cells[4][4] === '체육'), '지난 판');
    // 같은 때 두 번째 칸은 묻지 않음
    await page.fill(`${V} input[data-cell="4-4"]`, '과학'); await page.press(`${V} input[data-cell="4-4"]`, 'Tab');
    await page.waitForTimeout(150);
    assert(!(await page.isVisible('#sheetRoot #clsWhenAll')), '다시 물음');
    assert((await stored('class:timetable')).versions.every(v => v.cells[4][3] === '과학'), '처음부터로 기억 안 함');
  }],
  ['[A2·A10] 다음 차시는 「단원 n/N차시」로 고르고, 바꿔도 실시 그대로 · [진도표대로 맞추기]', async () => {
    const done = await cell('수학', 1);
    const sel = `${V} select[data-next="smp-ma"]`;
    const opts = await page.$$eval(`${sel} option`, os => os.map(o => o.textContent));
    assert(/^\d+\. .+ \d+\/\d+차시 · /.test(opts[0]) && opts.at(-1) === '끝(모두 마침)', opts[0] + ' … ' + opts.at(-1));
    await page.selectOption(sel, '3');
    await page.waitForTimeout(120);
    assert(await cell('수학', 1) === done, `수학 실시 ${done} → ${await cell('수학', 1)}`);
    assert(await cell('수학', 4) === '3차시', '다음 차시 ' + await cell('수학', 4));
    await row('수학').locator('[data-align]').click();
    await page.waitForTimeout(120);
    assert((await row('수학').textContent()).includes('맞음'), '맞추기: ' + await row('수학').textContent());
    assert(await cell('수학', 1) === done, '맞춰도 실시 그대로');
    // 체크 전 실시는 따로 고침(실시 = 체크 전 실시 + 체크한 시간)
    const h0 = (await stored('class:subjects')).find(s => s.id === 'smp-ma').hours0;
    await page.fill(`${V} input[data-h0="smp-ma"]`, '50'); await page.press(`${V} input[data-h0="smp-ma"]`, 'Tab');
    await page.waitForTimeout(100);
    assert((await stored('class:subjects')).find(s => s.id === 'smp-ma').hours0 === 50, '저장');
    assert(+(await cell('수학', 1)) === +done - h0 + 50, `실시 ${done} (체크 전 ${h0}) → ${await cell('수학', 1)}`);
  }],
  ['[A10] [준비 접기]', async () => {
    await page.click(`${V} [data-c="fold"]`);
    assert(!(await page.isVisible(`${V} .cls-setup #clsPeriods`)) && await page.isVisible(`${V} [data-pg="setup"]`), '접히지 않음');
  }],
  ['[A4] 앞날은 체크 단추가 꺼지고 「앞날은 체크할 수 없어요」', async () => {
    await tab('today');
    await day('2026-11-20');
    assert(await line(1).locator('[data-mark="done"]').isDisabled(), '단추가 켜져 있음');
    assert((await page.textContent(`${V} .cls-today`)).includes('앞날은 체크할 수 없어요'), '안내');
    assert(!(await page.isVisible(`${V} [data-day]`)), '하루 한꺼번에 단추');
  }],
  ['[A5] 반만 체크한 날도 「체크하지 않은 날」 — 「11/16(월) 2·3·4교시 남음」', async () => {
    // 진도 자리를 11/1에 정한 것으로(그 뒤 날만 「체크하지 않은 날」 — 예시로 채운 오늘 앞 날은 세지 않으므로)
    await page.evaluate(() => { const k = 'ssam:class:subjects'; localStorage.setItem(k, JSON.stringify(JSON.parse(localStorage.getItem(k)).map(x => ({ ...x, posAt: '2026-11-01' })))); });
    await tab('progress'); await tab('today');
    await day('2026-11-18');
    const b = await page.$$eval(`${V} [data-go-day]`, bs => bs.map(x => x.textContent.trim()));
    assert(b.includes('11/16(월) 2·3·4교시 남음') && b.includes('11/17(화)'), JSON.stringify(b));
  }],
  ['[A8] 진도표 없는 영어도 체크해 「시수만」 줄, 준비에서 계획 시수·전담', async () => {
    await line(3).locator('[data-mark="done"]').click();
    assert((await stored('class:log'))['2026-11-18'][3].subject === '영어', '영어 기록');
    await tab('progress');
    assert((await row('영어').textContent()).includes('시수만') && await cell('영어', 1) === '1', '영어 줄: ' + await row('영어').textContent());
    await openSetup();
    await page.fill(`${V} input[data-xplan="영어"]`, '68'); await page.press(`${V} input[data-xplan="영어"]`, 'Tab');
    await page.check(`${V} input[data-xstaff="음악"]`);
    await page.waitForTimeout(100);
    assert(await cell('영어', 0) === '68' && await cell('영어', 2) === '67', '계획·남은: ' + await row('영어').textContent());
    assert((await row('음악').textContent()).includes('전담'), '음악 줄');
    assert(JSON.stringify(await stored('class:extra')) === JSON.stringify({ 영어: { plan: 68, staff: false }, 음악: { plan: null, staff: true } }), JSON.stringify(await stored('class:extra')));
    await tab('today');
    assert((await line(4).textContent()).includes('전담') && await line(4).locator('[data-mark]').count() === 0, '음악 전담');
  }],
  ['[A9] [남은 칸 모두 완료](전담 빼고), 학사일정이 있는 날은 칩 옆 [이 날 모두 못 함]', async () => {
    await page.click(`${V} [data-day="done"]`);
    await page.waitForTimeout(100);
    const d = (await stored('class:log'))['2026-11-18'];
    assert(JSON.stringify(Object.keys(d)) === JSON.stringify(['1', '2', '3', '5', '6']) && Object.values(d).every(r => r.status === 'done'), JSON.stringify(d));
    await page.evaluate(() => localStorage.setItem('ssam:calendar', JSON.stringify([{ date: '2026-11-17', title: '학예회', source: 'event:x' }, { date: '2026-11-19', title: '재량휴업일', source: 'year:x' }])));
    await day('2026-11-17');
    await page.click(`${V} .cls-events [data-day="skip"]`);
    await page.waitForTimeout(100);
    const t17 = (await stored('class:log'))['2026-11-17'];
    assert(Object.keys(t17).length === 5 && Object.values(t17).every(r => r.status === 'skip'), JSON.stringify(t17));
    // 완료한 칸이 있으면 물음
    await day('2026-11-18');
    await page.click(`${V} .cls-day-acts [data-day="skip"]`);
    await page.waitForSelector('#sheetRoot #clsSkipAll');
    assert((await page.textContent('#sheetRoot .sheet')).includes('체크한 5칸도'), await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-close]');
    assert((await stored('class:log'))['2026-11-18'][1].status === 'done', '취소했는데 바뀜');
  }],
  ['[A7] 학사일정 「재량휴업일」은 수업 없는 날', async () => {
    await day('2026-11-19');
    await page.waitForSelector(`${V} .cls-off`);
    assert((await page.textContent(`${V} .cls-off`)).includes('재량휴업일'), await page.textContent(`${V} .cls-off`));
  }],
  ['[A9] [교과 바꾸기]: 그날 그 교시만(시간표는 그대로), [시간표대로]로 되돌림', async () => {
    await day('2026-11-18');
    await line(1).locator('[data-swap]').click();
    await page.fill('#sheetRoot #clsSwapName', '과학');
    await page.click('#sheetRoot #clsSwapOk');
    await page.waitForTimeout(100);
    assert((await line(1).locator('.cls-l-s').textContent()) === '과학' && (await line(1).textContent()).includes('교체 · 시간표는 국어'), await line(1).textContent());
    assert(await line(1).locator('[data-mark="done"]').getAttribute('aria-pressed') === 'false', '체크가 남음');
    assert((await stored('class:timetable')).cells[2][0] === '국어', '시간표가 바뀜');
    await line(1).locator('[data-swap]').click();
    await page.click('#sheetRoot #clsSwapBack');
    await page.waitForTimeout(100);
    assert((await line(1).locator('.cls-l-s').textContent()) === '국어', '되돌림');
  }],
  ['[A11] 수업 메모 → 그 교과 다음 시간에 「지난 시간: …」', async () => {
    await day('2026-11-16');
    await line(1).locator('[data-memo-open]').click();
    await page.fill(`${V} [data-memo="1"]`, '활동 3 못 함, 다음 시간에');
    await page.press(`${V} [data-memo="1"]`, 'Enter');
    await page.waitForTimeout(100);
    assert((await line(1).textContent()).includes('메모: 활동 3 못 함, 다음 시간에'), await line(1).textContent());
    assert((await stored('class:log'))['2026-11-16'][1].memo === '활동 3 못 함, 다음 시간에', '저장');
    await day('2026-11-17');
    assert((await line(2).textContent()).includes('지난 시간: 활동 3 못 함, 다음 시간에'), await line(2).textContent());
  }],
  ['좁은 화면(360px) 가로 스크롤 없음 — 오늘 수업·진도표·시수', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const a = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await tab('progress'); await openSetup();
    await page.waitForTimeout(150);
    const b = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(a && b, `가로 스크롤 오늘 ${a} 진도표 ${b}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
