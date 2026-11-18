// 학급 › 주간학습안내 손보기(스펙 2026-11-18-class-fix-design §B): 이름·전화번호는 가려 AI로, 수업 없는 날은 AI가 안 채움,
// 고친 칸 표시·진도표와 같아지면 고침에서 뺌, [다시 채우기]는 고친 칸 수를 묻고 학사일정 칸도 되돌림, 「알려 드립니다」·학교 이름·교시 수까지만 내보내기
// 예시 이름은 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const V = 'section[data-menu="class"]';
let last = '';
const DAYS = () => JSON.stringify({ days: [0, 1, 2, 3, 4].map(() => ({ prep: '색연필', safety: '복도에서 걷기', homework: '', notice: '' })) });
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => { last = prompt; return DAYS(); });
const tab = async id => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
const W = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:class:weekly:' + k) || 'null'), k);
await page.goto(url);
await page.waitForTimeout(400);
await tab('progress');
await page.click(`${V} [data-c="sample"]`);
await page.evaluate(async () => {
  localStorage.setItem('ssam:calendar', JSON.stringify([
    { date: '2026-11-03', title: '한가람 생일 잔치', source: 'event:a' },
    { date: '2026-11-03', title: '정보통신윤리교육 계획: 교직원 연수', source: 'year:y1' },
    { date: '2026-11-04', title: '현장체험학습', source: 'event:b' }
  ]));
  const s = await import('./core/settings.js');
  s.setSchool({ name: '새싹초등학교', breaks: [{ from: '2026-11-05', to: '2026-11-05', label: '재량휴업일' }] });
});
await tab('weekly');

await run('fix1118-class-weekly', [
  ['학부모께 가는 학사일정 줄에 연간계획 업무 일정은 없음', async () => {
    const ev = await page.inputValue(`${V} textarea[data-wn="1-events"]`);
    assert(ev.includes('한가람 생일 잔치') && !ev.includes('교직원 연수'), ev);
  }],
  ['AI 알림: 이름·전화번호는 가려 보내고, 고친 칸은 그대로, 수업 없는 날은 채우지 않음', async () => {
    await page.fill(`${V} textarea[data-wn="0-notice"]`, '김하늘 어머니 상담 010-1234-5678');
    await page.fill(`${V} textarea[data-wc="0-2"]`, '현장체험학습 사전 교육(이바다 인솔)');
    await page.click(`${V} [data-w="ai"]`);
    await page.waitForFunction(() => document.querySelector('textarea[data-wn="1-prep"]').value === '색연필');
    for (const n of ['한가람', '김하늘', '이바다', '010-1234-5678']) assert(!last.includes(n), `${n}이 AI로 감:\n${last}`);
    assert(last.includes('현장체험학습 사전 교육') && last.includes('수업 없음(') && !last.includes('교직원 연수'), last);
    assert(await page.inputValue(`${V} textarea[data-wn="3-prep"]`) === '', '수업 없는 날(목)을 채움');
    assert((await W('2026-11-02')).notes[3].safety === '', '수업 없는 날 저장');
    assert(await page.inputValue(`${V} textarea[data-wn="0-notice"]`) === '김하늘 어머니 상담 010-1234-5678', '미리 쓴 칸');
    assert((await page.textContent(`${V} .cls-week`)) !== null && (await page.textContent(V)).includes('가려 보내요'), 'AI 안내 글');
  }],
  ['고친 칸 표시, 진도표와 같아지면 고침에서 뺌', async () => {
    assert(await page.$eval(`${V} textarea[data-wc="0-2"]`, el => el.classList.contains('edited')), '고친 칸 표시 없음');
    const auto = await page.evaluate(async () => {
      const m = await import('./menus/class/class-model.js');
      const days = m.weekView(m.makeCtx('2026-10-29'), '2026-11-02');
      return m.weekCell(days, { cells: {} }, 0, 1);
    });
    await page.fill(`${V} textarea[data-wc="0-1"]`, auto + ' 고침');
    assert(await page.$eval(`${V} textarea[data-wc="0-1"]`, el => el.classList.contains('edited')), '고친 칸');
    await page.fill(`${V} textarea[data-wc="0-1"]`, auto);
    assert(!await page.$eval(`${V} textarea[data-wc="0-1"]`, el => el.classList.contains('edited')), '같아졌는데 고친 칸');
    assert(!('0-1' in (await W('2026-11-02')).cells), '저장값에 남음');
  }],
  ['[다시 채우기]: 고친 칸 수(교과 칸 + 학사일정)를 묻고, 그대로 두기면 그대로', async () => {
    await page.fill(`${V} textarea[data-wn="2-events"]`, '현장체험학습(놀이공원)');
    await page.click(`${V} [data-w="refill"]`);
    await page.waitForSelector('#clsRefill');
    assert((await page.textContent('#clsRefill h3')).includes('2개'), await page.textContent('#clsRefill h3'));
    await page.click('#clsRefill [data-close]');
    await page.waitForSelector('#clsRefill', { state: 'detached' });
    assert((await page.inputValue(`${V} textarea[data-wc="0-2"]`)).includes('사전 교육'), '그대로 두기인데 지움');
    await page.click(`${V} [data-w="refill"]`);
    await page.click('#clsRefillOk');
    await page.waitForSelector('#clsRefill', { state: 'detached' });
    assert(!(await page.inputValue(`${V} textarea[data-wc="0-2"]`)).includes('사전 교육'), '교과 칸 안 돌아옴');
    assert(await page.inputValue(`${V} textarea[data-wn="2-events"]`) === '현장체험학습', '학사일정 칸 안 돌아옴');
    assert(await page.inputValue(`${V} textarea[data-wn="1-prep"]`) === '색연필', '요일별 알림은 그대로');
  }],
  ['「알려 드립니다」: 저장, 복사·한글 파일에, 학교 이름', async () => {
    await page.fill(`${V} #clsWAnnounce`, '다음 주 수요일은 현장체험학습이에요. 도시락을 챙겨 주세요.');
    await tab('today'); await tab('weekly');
    assert((await page.inputValue(`${V} #clsWAnnounce`)).includes('도시락'), '다시 열면 없음');
    assert((await W('2026-11-02')).announce.includes('도시락'), '저장값');
    await page.click(`${V} [data-w="copy"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    assert(txt.includes('[알려 드립니다]') && txt.includes('도시락'), txt.slice(-120));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-w="hwpx"]`)]);
    const body = readFileSync(await dl.path()).toString('utf8');
    assert(body.includes('새싹초등학교') && body.includes('알려 드립니다') && body.includes('도시락'), '한글 파일');
  }],
  ['교시 수를 줄이면 숨은 칸은 내보내지 않음', async () => {
    await page.evaluate(() => {
      const k = 'ssam:class:weekly:2026-11-02', w = JSON.parse(localStorage.getItem(k));
      w.cells['0-6'] = '숨은 칸 글'; localStorage.setItem(k, JSON.stringify(w));
      const tk = Object.keys(localStorage).find(x => /^ssam:class:timetable/.test(x));
      const tt = JSON.parse(localStorage.getItem(tk)); tt.periods = 5; localStorage.setItem(tk, JSON.stringify(tt));
    });
    await tab('today'); await tab('weekly');
    await page.click(`${V} [data-w="copy"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    assert(!txt.includes('숨은 칸 글') && !txt.includes('6교시'), txt.slice(0, 200));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
