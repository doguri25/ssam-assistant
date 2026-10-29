// 단원평가 결과 모아 보기: 성적 일람표(교과·학기 거르기, CSV·한글 파일), 학생별 누적, 반 약한 부분, 교과 평어로 넘기기(수준·AI 초안·저장·복사)
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const prompts = [];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  const nos = [...prompt.matchAll(/^- (\d+)번 \|/gm)].map(m => Number(m[1]));
  return JSON.stringify({ students: nos.map(no => ({ no, text: `${no}번 평어 초안임.` })) });
});
const V = 'section[data-menu="evaluate"] .unit-box';
const go = async () => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]'); };
const rows = () => page.locator(`${V} .un-sumt tbody tr[data-no]`).count();
const cols = () => page.locator(`${V} .un-sumt thead th[data-col]`).count();
const pick = async (sel, v) => { await page.selectOption(`${V} ${sel}`, v); };
await page.goto(url);
await page.waitForTimeout(400);
await go();
await page.click(`${V} [data-un="sample"]`);
// 수학 평가 하나(마침) + 채점 중인 평가 하나(결과에 안 들어감)
await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const items = [{ no: 1, content: '곱셈하기', domain: '계산', type: 'short', answer: '345', points: 50, criteria: '', pages: '<수학> 50쪽' }, { no: 2, content: '곱셈의 뜻', domain: '이해', type: 'choice', answer: '②', points: 50, criteria: '', pages: '<수학> 52쪽' }];
  const mk = (done, date) => {
    const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '곱셈', round: 1, date }, key: { domains: ['계산', '이해'], items }, paper: { text: '' } });
    x.done = done;
    x.students = [1, 2, 3, 4, 5, 6].map(no => ({ no, skip: false, status: 'done', good: '', cheer: '', items: { 1: { read: '345', pts: no % 2 ? 50 : 0, ai: 0, flag: '', why: '', ok: true, manual: false }, 2: { read: no < 4 ? '②' : '③', pts: no < 4 ? 50 : 0, ai: 0, flag: '', why: '', ok: true, manual: false } } }));
    m.saveTest(x);
  };
  mk(true, '2026-10-22'); mk(false, '2026-10-23');
});
await page.reload(); await page.waitForTimeout(500);
await page.click(`${V} [data-unv="results"]`);

await run('unit-results', [
  ['성적 일람표: 마친 평가만, 학생 6명 × 평가 3개, 평균·반 평균', async () => {
    await page.waitForSelector(`${V} .un-sumt`);
    assert(await rows() === 6 && await cols() === 3, `${await rows()}줄 ${await cols()}칸`);
    assert((await page.textContent(`${V} .un-sumt tbody tr[data-no="1"]`)).includes('100'), '1번 100점');
    assert((await page.textContent(`${V} .un-sumt`)).includes('반 평균'), '반 평균');
  }],
  ['교과·학기 거르기', async () => {
    await pick('#unFSubject', '국어');
    assert(await cols() === 2, '국어 칸 ' + await cols());
    await pick('#unFTerm', '1');
    assert((await page.textContent(`${V} .un-results`)).includes('마친 단원평가가 없어요'), '1학기 빈 안내');
    await pick('#unFTerm', '2'); await pick('#unFSubject', '');
    assert(await cols() === 3, '전체');
  }],
  ['CSV·한글 파일 내려받기', async () => {
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-un="csv"]`)]);
    assert(dl.suggestedFilename() === '전체 단원평가 성적 일람표.csv', dl.suggestedFilename());
    const csv = readFileSync(await dl.path(), 'utf8');
    assert(csv.charCodeAt(0) === 0xFEFF && csv.slice(1).startsWith('번호,') && csv.includes('반 평균'), csv.slice(0, 60));
    [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-un="tableHwpx"]`)]);
    assert(dl.suggestedFilename() === '전체 단원평가 성적 일람표.hwpx', dl.suggestedFilename());
  }],
  ['학생별 누적: 평가 3줄, 영역 정답률, 자주 틀린 평가 내용, 복사', async () => {
    await page.click(`${V} [data-rv="student"]`);
    await pick('#unStuNo', '3');
    assert(await page.locator(`${V} .un-hist tbody tr`).count() === 3, '평가 줄');
    const txt = await page.textContent(`${V} .un-results`);
    assert(txt.includes('지식') && txt.includes('계산') && txt.includes('자주 틀린'), txt.slice(0, 200));
    await page.click(`${V} [data-un="stuCopy"]`);
    await page.waitForTimeout(150);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip.startsWith('[단원평가 누적] 3번') && clip.includes('영역별 정답률'), clip.slice(0, 100));
  }],
  ['반 약한 부분: 정답률 낮은 차례, 다시 가르칠 내용', async () => {
    await page.click(`${V} [data-rv="weak"]`);
    await pick('#unWeakTest', 'sample-1');
    const rates = await page.$$eval(`${V} .un-weak tbody tr`, trs => trs.map(tr => Number(tr.dataset.rate)));
    assert(rates.length === 10 && rates.every((r, i) => !i || rates[i - 1] <= r), JSON.stringify(rates));
    assert((await page.textContent(`${V} .un-results`)).includes('다시 가르칠 내용'), '다시 가르칠 내용');
  }],
  ['교과 평어: 수준 자동, 기준을 바꾸면 바뀜, 학생마다 고침', async () => {
    await page.click(`${V} [data-rv="pyeongeo"]`);
    assert(await page.inputValue(`${V} #unPySubject`) === '국어', '교과');
    const want = await page.evaluate(async () => {
      const m = await import('./menus/evaluate/unit/unit-model.js'), g = await import('./menus/evaluate/unit/unit-grade.js');
      const ts = ['sample-1', 'sample-2'].map(m.getTest);
      const avg = no => ts.map(t => g.studentTotal(t, t.students.find(s => s.no === no)).pct).reduce((a, b) => a + b, 0) / 2;
      return [1, 2, 3].map(no => m.levelOf(avg(no)));
    });
    for (const [i, lv] of want.entries()) assert(await page.inputValue(`${V} select[data-pylv="${i + 1}"]`) === lv, `${i + 1}번 ${lv}`);
    await page.fill(`${V} #unCutTop`, '10'); await page.dispatchEvent(`${V} #unCutTop`, 'change');
    assert(await page.inputValue(`${V} select[data-pylv="3"]`) === 'top', '기준 바꿔도 그대로');
    await page.fill(`${V} #unCutTop`, '95'); await page.dispatchEvent(`${V} #unCutTop`, 'change');
    await pick('select[data-pylv="2"]', 'low');
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:pyeongeo:국어')).students[2].level) === 'low', '저장');
  }],
  ['평어 쓰기: AI 프롬프트에 수준·평가 내용, 이름·점수 없음, 저장·복사', async () => {
    await page.click(`${V} [data-un="pyAI"]`);
    await page.waitForFunction(() => document.querySelector('textarea[data-py="1"]') && document.querySelector('textarea[data-py="1"]').value === '1번 평어 초안임.');
    const p = prompts.at(-1);
    assert(p.startsWith('[단원평가 평어]') && p.includes('- 2번 | 수준 하') && p.includes('국어'), p.slice(0, 200));
    assert(!/\d+\s*점/.test(p), '점수가 들어감');
    await page.fill(`${V} textarea[data-py="1"]`, '1번 고친 평어임.'); await page.dispatchEvent(`${V} textarea[data-py="1"]`, 'change');
    await page.reload(); await page.waitForTimeout(500);
    await page.click(`${V} [data-unv="results"]`); await page.click(`${V} [data-rv="pyeongeo"]`);
    assert(await page.inputValue(`${V} textarea[data-py="1"]`) === '1번 고친 평어임.', '다시 열면 없음');
    assert(await page.inputValue(`${V} select[data-pylv="2"]`) === 'low', '고친 수준');
    await page.click(`${V} [data-un="pyCopy"][data-no="1"]`);
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => navigator.clipboard.readText()) === '1번 고친 평어임.', '복사');
    await page.click(`${V} [data-un="pyCopyAll"]`);
    await page.waitForTimeout(150);
    const all = await page.evaluate(() => navigator.clipboard.readText());
    assert(all.split('\n').length === 6 && all.startsWith('1번\t1번 고친 평어임.'), all.slice(0, 80));
  }],
  ['좁은 화면(360px) 가로 스크롤 없음', async () => {
    await page.click(`${V} [data-rv="table"]`);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
