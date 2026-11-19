// 2026-11-19 여섯 번째 버그 찾기(학급 메뉴) 화면: 준비 › 시간표 [AI로 읽기]는 가려 보낸 전담 교사 이름 자리 표시(〔이름1〕)를 되돌려 넣음
// (AI가 칸 글을 옮겨 적어도 시간표·주간학습안내에 「영어(〔이름1〕)」가 남지 않게). 예시 이름은 지어낸 것
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));
const V = 'section[data-menu="class"]';
let calls = 0, last = '';
// AI가 시간표 글의 칸을 그대로 옮겨 적는 답(가짜): 자리 표시가 든 칸도 그대로
await mockClaude(page, async ({ prompt }) => {
  calls++; last = prompt;
  const ph = s => ((new RegExp(`${s}\\(([^)]*)\\)`).exec(prompt) || [, ''])[1]);
  const en = ph('영어'), pe = ph('체육');
  return JSON.stringify({ periods: 4, cells: [['국어', '수학', '사회', '과학'], ['수학', `체육(${pe})`, '국어', '과학'], [`영어(${en})`, '국어', '수학', '음악'], ['국어', '과학', '사회', '미술'], ['수학', '국어', '도덕', '창체']] });
});
const go = async () => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]'); };
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const TT = ['3학년 기초시간표', '3-1 | 월 | 화 | 수 | 목 | 금', '1 | 국어 | 수학 | 영어(이바다) | 국어 | 수학', '2 | 수학 | 체육(한가람) | 국어 | 과학 | 국어',
  '3 | 사회 | 국어 | 수학 | 사회 | 도덕', '4 | 과학 | 과학 | 음악 | 미술 | 창체'].join('\n');
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
await page.reload(); await page.waitForTimeout(400);
await go();

await run('fix1119-bugs6-class', [
  ['[4] 시간표 [AI로 읽기]: 전담 교사 이름은 가려 보내고, 답의 자리 표시는 되돌려 시간표에 넣음', async () => {
    await page.selectOption(`${V} #clsGrade`, '3');
    await page.fill(`${V} #clsRoom`, '9'); await page.press(`${V} #clsRoom`, 'Tab');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-c="ttFile"]`)]);
    await fc.setFiles({ name: '시간표.txt', mimeType: 'text/plain', buffer: Buffer.from(TT, 'utf-8') });
    await page.waitForSelector(`${V} #clsTtMsg:has-text("3-9반을 찾지 못했어요")`);
    await page.click(`${V} [data-c="ttAi"]`);
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:class:timetable') || 'null') || {}).periods === 4);
    assert(calls === 1, 'AI 호출 ' + calls);
    assert(last.startsWith('[시간표 읽기]') && !/이바다|한가람/.test(last) && /영어\(〔이름\d+〕\)/.test(last), '보낸 글: ' + last.slice(-200));
    const tt = await stored('class:timetable');
    const flat = JSON.stringify(tt);
    assert(!/〔|〕|\{\{|○○○/.test(flat), '자리 표시가 남음: ' + flat);
    assert(tt.cells[2][0] === '영어(이바다)' && tt.cells[1][1] === '체육(한가람)', JSON.stringify(tt.cells));
    // 화면 칸에도 자리 표시 없음
    assert(await page.inputValue(`${V} input[data-cell="2-1"]`) === '영어(이바다)', '칸 ' + await page.inputValue(`${V} input[data-cell="2-1"]`));
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
