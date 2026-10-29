// 학급 › 주간학습안내: 기본 주·제목, 학습 칸 예상 차시, 학사일정 줄, 칸 고치기·다시 채우기, AI 알림(빈 칸만), 주를 옮겨도 시작한 주에, 한글 파일·복사·인쇄
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const V = 'section[data-menu="class"]';
let slow = 0, last = '';
const DAYS = d => JSON.stringify({ days: [0, 1, 2, 3, 4].map(i => ({ prep: '색연필', safety: '복도에서 걷기', homework: '', notice: i === 2 ? '현장체험학습 안내장' : '' })) });
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => { last = prompt; if (slow) await new Promise(r => setTimeout(r, slow)); return DAYS(); });
const tab = async id => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
const W = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:class:weekly:' + k) || 'null'), k);
await page.goto(url);
await page.waitForTimeout(400);
await tab('progress');
await page.click(`${V} [data-c="sample"]`);
await page.evaluate(() => localStorage.setItem('ssam:calendar', JSON.stringify([{ date: '2026-11-04', title: '현장체험학습', source: 'event:x' }])));
await tab('weekly');

await run('class-weekly', [
  ['기본 주는 다음 주(목요일), 제목', async () => {
    assert((await page.textContent(`${V} .cls-week-nav`)).includes('11월 2일 (월) ~ 11월 6일 (금)'), '주');
    assert(await page.inputValue(`${V} #clsWTitle`) === '3학년 1반 주간학습안내', '제목');
  }],
  ['학습 칸: 교과 · 학습 주제, 이번 주 남은 시간만큼 이어진 차시', async () => {
    const want = await page.evaluate(async () => {
      const m = await import('./menus/class/class-model.js');
      const c = m.makeCtx('2026-10-29');
      const s = m.weekView(c, '2026-11-02')[0].slots[0];
      const ko = c.subjects.find(x => x.name === '국어');
      return { text: m.cellText(s), index: s.index, offset: ko.offset };
    });
    assert(want.text.startsWith('국어 · '), want.text);
    assert(want.index === want.offset + 2, `차시 ${want.index}, 보정값 ${want.offset}`); // 목 국어(자)·금 국어 2시간
    assert(await page.inputValue(`${V} textarea[data-wc="0-1"]`) === want.text, '칸 글');
  }],
  ['학사일정 줄에 그 주 일정, 비우면 비운 채로', async () => {
    assert((await page.inputValue(`${V} textarea[data-wn="2-events"]`)).includes('현장체험학습'), '수요일 학사일정');
    await page.fill(`${V} textarea[data-wn="2-events"]`, '');
    await tab('today'); await tab('weekly');
    assert(await page.inputValue(`${V} textarea[data-wn="2-events"]`) === '', '비운 칸에 자동 일정이 돌아옴');
    await page.fill(`${V} textarea[data-wn="2-events"]`, '현장체험학습');
  }],
  ['칸을 고치면 저장되고, 다시 채우기로 지워짐', async () => {
    await page.fill(`${V} textarea[data-wc="1-1"]`, '수학 · 고친 칸');
    await page.fill(`${V} #clsWTitle`, '3학년 1반 다음 주 안내');
    await tab('today'); await tab('weekly');
    assert(await page.inputValue(`${V} textarea[data-wc="1-1"]`) === '수학 · 고친 칸', '다시 열어도 남음');
    assert(await page.inputValue(`${V} #clsWTitle`) === '3학년 1반 다음 주 안내', '제목 남음');
    await page.click(`${V} [data-w="refill"]`);
    assert(await page.inputValue(`${V} textarea[data-wc="1-1"]`) !== '수학 · 고친 칸', '안 지워짐');
    assert(Object.keys((await W('2026-11-02')).cells).length === 0, '저장값');
    await page.fill(`${V} #clsWTitle`, '3학년 1반 주간학습안내');
  }],
  ['AI로 쓰기: 빈 칸만 채움', async () => {
    await page.fill(`${V} textarea[data-wn="0-prep"]`, '실내화');
    await page.click(`${V} [data-w="ai"]`);
    await page.waitForFunction(() => document.querySelector('textarea[data-wn="1-prep"]').value === '색연필');
    assert(last.startsWith('[주간학습안내]') && last.includes('현장체험학습'), '프롬프트: ' + last.slice(0, 80));
    assert(await page.inputValue(`${V} textarea[data-wn="0-prep"]`) === '실내화', '미리 쓴 칸을 덮음');
    assert(await page.inputValue(`${V} textarea[data-wn="3-safety"]`) === '복도에서 걷기', '안전');
    assert((await W('2026-11-02')).notes[2].notice === '현장체험학습 안내장', '저장');
  }],
  ['AI가 도는 동안 다음 주로 옮겨도 결과는 시작한 주에', async () => {
    await page.click(`${V} [data-w="prev"]`); // 10/26 주
    slow = 1000;
    await page.click(`${V} [data-w="ai"]`);
    await page.click(`${V} [data-w="next"]`);
    await page.waitForTimeout(1500); slow = 0;
    assert((await W('2026-10-26')).notes[0].prep === '색연필', '시작한 주에 없음');
    assert((await page.textContent(`${V} .cls-week-nav`)).includes('11월 2일'), '보는 주가 바뀜');
    assert(await page.inputValue(`${V} textarea[data-wn="0-prep"]`) === '실내화', '보는 주가 덮임');
  }],
  ['한글 파일 내려받기', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-w="hwpx"]`)]);
    assert(dl.suggestedFilename() === '3학년 1반 주간학습안내(11.2~11.6).hwpx', dl.suggestedFilename());
    const body = readFileSync(await dl.path()).toString('utf8');
    const cell = await page.inputValue(`${V} textarea[data-wc="0-1"]`);
    assert(body.includes(cell.split(' · ')[1]) && body.includes('실내화') && body.includes('현장체험학습'), 'section 글');
  }],
  ['복사: 요일별 글', async () => {
    await page.click(`${V} [data-w="copy"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    assert(txt.includes('[월 11/2]') && txt.includes('준비물: 실내화') && txt.includes('1교시 국어 · '), txt.slice(0, 120));
  }],
  ['인쇄는 window.print', async () => {
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.click(`${V} [data-w="print"]`);
    assert(await page.evaluate(() => window.__printed) === 1, '인쇄 안 부름');
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
