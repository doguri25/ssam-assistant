// 떠 있는 버튼 › 계획: 작년 학급운영계획·업무 계획·행사 계획 → 새 계획(입력 칸) → 초안까지, 자료로만, AI 없음, 지침 → 어느 계획에, 설문 → 행사 결과
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[학급운영계획 지침]')) return '[]';
  if (prompt.startsWith('[학급운영계획 초안]')) {
    const secs = [...prompt.matchAll(/^ {2}- \[(\S+)\] ([^(\n]+)/gm)].map(m => [m[1], m[2].trim()]);
    return JSON.stringify({ sections: Object.fromEntries(secs.map(([id, s]) => [id, `${s}을(를) 운영한다.`])), monthly: [{ month: 3, text: '학급 세우기' }] });
  }
  if (prompt.startsWith('[연간계획 초안]')) return JSON.stringify({ purpose: '책 읽는 습관을 기른다.', policy: '방침', details: '세부', schedule: [{ title: '독서의 달', date: '2027-09-06' }], budget: [], evaluation: '설문' });
  if (prompt.startsWith('[지침 점검]')) return '[]';
  if (prompt.startsWith('[행사 구성안]')) return JSON.stringify({ options: [{ label: '안 1', summary: '오전 운동회', timetable: [{ time: '09:00', activity: '개회식' }], pros: ['짧다'], staffNeed: '', budget: [] }] });
  if (prompt.startsWith('[설문 결과]')) return JSON.stringify({ textSummary: '즐거웠다', report: '결과 보고서', nextMemo: '그늘막' });
  return '{}';
});
const sheet = '#sheetRoot .sheet';
const pick = files => page.setInputFiles('#inboxFile', files);
const runCard = async () => { await page.waitForSelector(`${sheet} #ibRun:not([disabled])`); await page.click(`${sheet} #ibRun`); };
const txt = (name, s) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(s) });
const model = (path, fn) => page.evaluate(async ([p, f]) => { const m = await import(p); return (new Function('m', `return (${f})(m)`))(m); }, [path, fn.toString()]);
const has = p => prompts.filter(x => x.startsWith(p)).length;
const YEAR = txt('독서.txt', '2026학년도 독서교육 운영 계획\nⅠ. 목적\n책을 즐겨 읽는 학생을 기른다.\nⅡ. 방침\nⅢ. 세부 추진 계획\nⅣ. 예산');
const EVENT = txt('운동회.txt', '2026 가을 운동회 운영 계획\n1. 목적\n함께 뛰며 협동한다.\n2. 일시 및 장소\n3. 경기 종목\n4. 안전 대책');
const GUIDE = txt('지침.txt', 'OO교육지원청\n수신 OO초등학교장\n(경유)\n제목 2027학년도 학교 교육과정 운영 지침 안내\n1. 기초학력 진단을 3월에 실시한다.\n발신 OO교육지원청교육장');
await page.goto(url);
await page.waitForTimeout(300);
await page.evaluate(() => localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 })));
await page.reload(); await page.waitForTimeout(400);

await run('inbox-plan', [
  ['작년 학급운영계획 → 새 학급운영계획(학년·반은 학급 정보) → 초안까지', async () => {
    await pick(join(FIXTURES, 'classplan-last.txt'));
    await page.waitForSelector(sheet);
    assert((await page.textContent(sheet)).includes('작년 학급운영계획') && await page.locator(`${sheet} [data-ib-field]`).count() === 0, await page.textContent(sheet));
    const n0 = has('[학급운영계획 초안]');
    await runCard();
    await page.waitForFunction(async () => { const m = await import('./menus/plan/classplan-model.js'); const p = m.getPlan(m.currentId()); return p && p.draft && Object.keys(p.draft).length > 0; }, null, { timeout: 10000 });
    const p = await model('./menus/plan/classplan-model.js', m => m.getPlan(m.currentId()));
    assert(p.grade === 3 && p.room === 2 && p.sources.lastPlan.includes('학급 실태') && has('[학급운영계획 초안]') === n0 + 1, JSON.stringify([p.grade, p.room]));
    assert(await page.isVisible('#menuTabs [data-tab="class"][aria-current="page"]'), '학급운영계획 탭');
  }],
  ['작년 업무 계획 → 입력 칸(업무명은 제목에서, 목표) → 연간계획 초안', async () => {
    await pick(YEAR);
    await page.waitForSelector(`${sheet} [data-ib-field="goal"]`);
    assert(await page.inputValue(`${sheet} [data-ib-field="name"]`) === '독서교육', '업무명: ' + await page.inputValue(`${sheet} [data-ib-field="name"]`));
    await page.fill(`${sheet} [data-ib-field="goal"]`, '책 읽는 학교');
    await runCard();
    await page.waitForFunction(async () => { const m = await import('./menus/plan/year-model.js'); const p = m.getPlan(m.currentId()); return p && p.name === '독서교육' && p.draft; }, null, { timeout: 10000 });
    const p = await model('./menus/plan/year-model.js', m => m.getPlan(m.currentId()));
    assert(p.goal === '책 읽는 학교' && p.sources.lastPlan.includes('세부 추진') && p.step === 4, JSON.stringify([p.goal, p.step]));
  }],
  ['작년 행사 계획 → 입력 칸(행사명·대상·날짜·장소) → 구성안', async () => {
    await pick(EVENT);
    await page.waitForSelector(`${sheet} [data-ib-field="place"]`);
    assert(await page.inputValue(`${sheet} [data-ib-field="name"]`) === '가을 운동회', '행사명');
    await page.fill(`${sheet} [data-ib-field="grades"]`, '전교생');
    await page.fill(`${sheet} [data-ib-field="date"]`, '2027-10-08');
    await page.fill(`${sheet} [data-ib-field="place"]`, '운동장');
    await runCard();
    await page.waitForFunction(async () => { const m = await import('./menus/plan/event-model.js'); const e = m.getEvent(m.currentEventId()); return e && e.options && e.options.length === 1; }, null, { timeout: 10000 });
    const e = await model('./menus/plan/event-model.js', m => m.getEvent(m.currentEventId()));
    assert(e.name === '가을 운동회' && e.kind === 'sports' && e.refs.length === 1 && e.refs[0].text.includes('안전 대책'), JSON.stringify([e.name, e.kind, e.refs.length]));
  }],
  ['설정 «자료로만»이면 AI 없이 새 계획 1단계', async () => {
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ plan: 'open' }));
    const n0 = prompts.length;
    await pick(join(FIXTURES, 'classplan-last.txt'));
    await runCard();
    await page.waitForTimeout(500);
    const p = await model('./menus/plan/classplan-model.js', m => m.getPlan(m.currentId()));
    assert(p.sources.lastPlan.includes('학급 실태') && !p.draft && p.step === 1 && prompts.length === n0, JSON.stringify([p.step, !!p.draft, prompts.length - n0]));
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ plan: 'draft' }));
  }],
  ['AI를 정하지 않았으면 자료로만 넣고 안내', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: {}, remember: true })));
    await page.reload(); await page.waitForTimeout(400);
    const n0 = prompts.length;
    await pick(join(FIXTURES, 'classplan-last.txt'));
    await runCard();
    await page.waitForFunction(() => (document.querySelector('#toast') || {}).textContent?.includes('AI를 정하면'));
    const p = await model('./menus/plan/classplan-model.js', m => m.getPlan(m.currentId()));
    assert(p.sources.lastPlan.includes('학급 실태') && !p.draft && prompts.length === n0, '자료로만');
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
    await page.reload(); await page.waitForTimeout(400);
  }],
  ['올해 지침·공문 → 어느 계획에 넣을지 골라 그 계획 지침으로', async () => {
    await pick(GUIDE);
    await page.waitForSelector(`${sheet} [data-ib-field="target"]`);
    const opts = await page.locator(`${sheet} [data-ib-field="target"] option`).allInnerTexts();
    assert(opts.some(o => o.includes('독서교육')) && opts.some(o => o.includes('가을 운동회')) && opts.some(o => o.includes('학급운영계획')), opts.join('|'));
    const yearOpt = await page.locator(`${sheet} [data-ib-field="target"] option`, { hasText: '독서교육' }).getAttribute('value');
    await page.selectOption(`${sheet} [data-ib-field="target"]`, yearOpt);
    await runCard();
    await page.waitForFunction(async () => { const m = await import('./menus/plan/year-model.js'); return m.listPlans().some(p => p.name === '독서교육' && p.sources.guide.includes('기초학력')); });
    assert(await page.isVisible('#menuTabs [data-tab="year"][aria-current="page"]'), '연간계획 탭');
  }],
  ['설문 응답 CSV → 행사 고르기 → 결과 보고서', async () => {
    await pick(join(FIXTURES, 'survey-12.csv'));
    await page.waitForSelector(`${sheet} [data-ib-field="event"]`);
    assert((await page.locator(`${sheet} [data-ib-field="event"] option:checked`).innerText()).includes('가을 운동회'), '행사');
    await runCard();
    await page.waitForFunction(async () => { const m = await import('./menus/plan/event-model.js'); const e = m.listEventPlans().find(x => x.name === '가을 운동회'); return e && e.survey && e.survey.report === '결과 보고서'; }, null, { timeout: 10000 });
    assert(await page.isVisible('#menuTabs [data-tab="event"][aria-current="page"]'), '행사계획 탭');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
