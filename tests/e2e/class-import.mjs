// 학급 › 준비: 시간표·진도표 한글 파일 가져오기(AI 없음), 못 찾으면 AI로 읽기, 교과 추가의 AI 차시 뽑기
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const V = 'section[data-menu="class"]';
const SAMPLES = join(ROOT, 'samples');
let calls = 0, slow = 0, answer = '{}', last = '';
await mockClaude(page, async ({ prompt }) => {
  calls++; last = prompt;
  if (slow) await new Promise(r => setTimeout(r, slow));
  return typeof answer === 'function' ? answer(prompt) : answer;
});
const go = async () => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]'); };
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const upload = async (btn, file) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-c="${btn}"]`)]);
  await fc.setFiles(join(SAMPLES, file));
};
const setInfo = async (g, r) => {
  await page.selectOption(`${V} #clsGrade`, String(g));
  await page.fill(`${V} #clsRoom`, String(r)); await page.press(`${V} #clsRoom`, 'Tab');
};
await page.goto(url);
await page.waitForTimeout(400);
await go();

await run('class-import', [
  ['AI 키가 없을 때 AI로 차시 뽑기 → 키 안내', async () => {
    await page.click(`${V} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '국어');
    await page.fill('#sheetRoot #clsNewText', '국어 진도표 1주 시 읽기');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.waitForSelector('#sheetRoot #clsNewMsg:has-text("설정 › AI에서 키를 넣어 주세요")');
    await page.click('#sheetRoot [data-close]');
    // 이제 AI 키를 넣고 다시 엶
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
    await page.reload(); await page.waitForTimeout(400); await go();
  }],
  ['학년·반이 없으면 시간표 파일 전에 안내', async () => {
    await page.click(`${V} [data-c="ttFile"]`);
    assert((await page.textContent('#toast')).includes('먼저 학년·반을 넣어 주세요'), '안내');
  }],
  ['시간표 파일(3-2) → 우리 반 칸, AI 부르지 않음', async () => {
    await setInfo(3, 2);
    await upload('ttFile', '시간표-예시.hwpx');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:class:timetable') || 'null') || { cells: [[]] }).cells[0][0] === '수학');
    const tt = await stored('class:timetable');
    assert(tt.cells[3][1] === '국어(자)' && tt.cells[4][4] === '도덕' && tt.periods === 6, JSON.stringify(tt.cells));
    assert(await page.inputValue(`${V} input[data-cell="0-1"]`) === '수학', '칸');
    assert(calls === 0, 'AI 호출 ' + calls);
  }],
  ['우리 반이 없으면 찾지 못함 + AI로 읽기', async () => {
    await setInfo(3, 9);
    await upload('ttFile', '시간표-예시.hwpx');
    await page.waitForSelector(`${V} #clsTtMsg:has-text("시간표 파일에서 3-9반을 찾지 못했어요")`);
    answer = JSON.stringify({ periods: 5, cells: [['국어', '수학', '사회', '과학', '체육'], ['수학', '국어', '과학', '체육', '창체'], ['국어', '수학', '영어', '음악', '미술'], ['수학', '국어', '사회', '영어', '음악'], ['국어', '수학', '사회', '과학', '도덕']] });
    await page.click(`${V} [data-c="ttAi"]`);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:timetable')).periods === 5);
    assert(calls === 1, 'AI 호출 ' + calls);
    assert(last.startsWith('[시간표 읽기]') && last.includes('3학년 9반'), '프롬프트: ' + last.slice(0, 60));
  }],
  ['진도표 파일 → 교과 고르기(동아리 활동만 꺼짐) → 넣기, AI 없음', async () => {
    calls = 0;
    await upload('jindoFile', '진도표-예시.hwpx');
    await page.waitForSelector('#sheetRoot [data-jpick]');
    const picks = await page.$$eval('#sheetRoot [data-jpick]', els => els.map(e => [e.closest('li').querySelector('b').textContent, e.checked]));
    assert(JSON.stringify(picks) === JSON.stringify([['국어', true], ['수학', true], ['사회', true], ['과학', true], ['창체', true], ['동아리활동', false]]), JSON.stringify(picks));
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForSelector(`${V} .cls-sum tbody tr`);
    assert(await page.locator(`${V} .cls-sum tbody tr`).count() === 5, '요약 줄 수');
    const subs = await stored('class:subjects');
    assert(subs.find(s => s.name === '국어').lessons.length === 85 && subs.find(s => s.name === '창체').lessons.length === 5, '차시 수');
    assert(calls === 0, 'AI 호출 ' + calls);
  }],
  ['같은 이름 다시 넣기 → 바꿀까요 표시, 체크 기록 유지', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:class:log', JSON.stringify({ '2026-10-28': { 1: { subject: '국어', status: 'done' } } })));
    const id = (await stored('class:subjects')).find(s => s.name === '국어').id;
    await upload('jindoFile', '진도표-예시.hwpx');
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert((await page.textContent('#sheetRoot .sheet')).includes('바꿀까요'), '바꿀까요 표시');
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForTimeout(150);
    const subs = await stored('class:subjects');
    assert(subs.filter(s => s.name === '국어').length === 1 && subs.find(s => s.name === '국어').id === id, '국어가 둘이거나 id가 바뀜');
    assert((await stored('class:log'))['2026-10-28'], '기록이 지워짐');
  }],
  ['다른 모양 글 → AI로 차시 뽑기 → 진도표 고치기 시트에 1줄', async () => {
    answer = JSON.stringify({ lessons: [{ week: 1, period: '8.24~8.29', unit: '1. 시', title: '시 읽기', pages: '10~11', memo: '' }] });
    await page.click(`${V} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '도덕');
    await page.fill('#sheetRoot #clsNewText', '도덕 진도: 첫 주에 시 읽기 (10~11쪽)');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.waitForSelector('#sheetRoot input[data-l="0-title"]');
    assert(await page.inputValue('#sheetRoot input[data-l="0-title"]') === '시 읽기', '제목');
    assert(last.startsWith('[진도표 읽기]') && last.includes('「도덕」'), '프롬프트: ' + last.slice(0, 60));
    assert(await page.locator('#sheetRoot input[data-l$="-title"]').count() === 1, '줄 수');
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForTimeout(100);
    const d = (await stored('class:subjects')).find(s => s.name === '도덕');
    assert(d && d.lessons[0].from === '2026-08-24', '저장: ' + JSON.stringify(d));
  }],
  ['AI가 차시를 0개 돌려주면 안내', async () => {
    answer = JSON.stringify({ lessons: [] });
    await page.click(`${V} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '실과');
    await page.fill('#sheetRoot #clsNewText', '무언가');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.waitForSelector('#sheetRoot #clsNewMsg:has-text("이 교과의 차시를 찾지 못했어요")');
    await page.click('#sheetRoot [data-close]');
  }],
  ['AI가 도는 동안 다른 교과를 고쳐도 결과는 시작한 교과로', async () => {
    slow = 1000;
    answer = JSON.stringify({ lessons: [{ title: '음악 1' }, { title: '음악 2' }] });
    await page.click(`${V} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '음악');
    await page.fill('#sheetRoot #clsNewText', '음악 진도');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.click('#sheetRoot [data-close]');
    const ko = (await stored('class:subjects')).find(s => s.name === '국어').id;
    await page.click(`${V} [data-c="editSub"][data-id="${ko}"]`);
    await page.waitForTimeout(1500); slow = 0;
    assert((await page.textContent('#sheetRoot .sheet h3')).includes('국어'), '국어 시트가 바뀜');
    const m = (await stored('class:subjects')).find(s => s.name === '음악');
    assert(m && m.lessons.length === 2, '음악: ' + JSON.stringify(m));
    await page.click('#sheetRoot [data-close]');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
