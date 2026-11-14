// 계획 버그 잡기(2026-11-14) 화면: 작년(기존) 계획서 목차에 「방침」이 없을 때 지침 문장이 안 보이는 방침 칸으로 들어가
// 「반영됨」이라 하고 한글 파일에는 없던 것 (모델 쪽은 tests/unit/hunt1114-plan.test.mjs)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[지침 점검]')) return JSON.stringify([{ item: '독서 환경', keywords: ['안전한', '독서 환경'], sentence: '안전한 독서 환경을 만든다.', section: 'policy' }]);
  // AI가 목차에 없는 방침 칸을 써 보내도(예전 프롬프트) 화면·한글 파일에는 없음
  if (prompt.startsWith('[연간계획 초안]')) return JSON.stringify({
    purpose: '책을 즐겨 읽는 습관을 기른다.', policy: '안전한 독서 환경을 만든다.', details: '가. 아침 독서', evaluation: '독서량을 살핀다.', x1: '가. 대상: 전교생',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: []
  });
  return '{}';
});
const Y = 'section[data-menu="plan"]';
const LAST = ['2026학년도 독서교육 운영 계획', '1. 목적', '책을 즐겨 읽는 습관을 기른다.', '2. 운영 개요', '가. 대상: 전교생', '3. 세부 운영 계획', '가. 아침 독서',
  '4. 추진 일정', '3월 계획 수립', '5. 평가', '독서량을 살핀다.'].join('\n');
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'year')));
await page.waitForSelector(`${Y} #ypName`);
const stepIs = async name => (await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes(name);

await run('hunt1114-plan', [
  ['[year-outline-hidden] 방침 칸이 없는 작년 목차: 초안 프롬프트는 목차에 있는 글 칸만 달라고 함', async () => {
    await page.fill(`${Y} #ypName`, '독서교육');
    await page.fill(`${Y} #ypGoal`, '스스로 책을 고르고 즐기는 독서 습관을 기른다.');
    await page.fill(`${Y} textarea[data-src="lastPlan"]`, LAST);
    await page.fill(`${Y} textarea[data-src="guide"]`, '2027 독서교육 지침: 안전한 독서 환경을 만들 것');
    await page.click(`${Y} [data-y="next"]`);
    await page.click(`${Y} [data-y="next"]`);
    await page.waitForSelector(`${Y} #ypGuide li[data-g]`);
    await page.click(`${Y} [data-y="next"]`);
    assert(await stepIs('초안'), '4단계가 아님');
    await page.click(`${Y} [data-y="draft"]`);
    await page.waitForSelector(`${Y} #ypDraft`);
    const heads = await page.$$eval(`${Y} #ypDraft .yp-sec-h h3`, hs => hs.map(h => h.textContent.trim()));
    assert(heads.join('|') === '1. 목적|2. 운영 개요|3. 세부 운영 계획|4. 추진 일정|5. 평가', heads.join('|'));
    const p = prompts.filter(x => x.startsWith('[연간계획 초안]')).at(-1);
    assert(!p.includes('"policy"') && !p.includes('policy(방침)'), p.slice(p.indexOf('규칙:'), p.indexOf('규칙:') + 300));
    assert(p.includes('"purpose":"…"') && p.includes('"details":"…"') && p.includes('"evaluation":"…"') && p.includes('"x1":"…"'), p.slice(p.indexOf('답은 JSON')));
  }],
  ['[year-outline-hidden] 3단계: 안 보이는 방침 글로 「반영됨」이라 하지 않고, [넣기]는 보이는 세부 칸 → 한글 파일에도', async () => {
    await page.click(`${Y} ol.steps [data-step="3"]`);
    const li = await page.textContent(`${Y} #ypGuide li[data-g="0"]`);
    assert(li.includes('빠짐') && li.includes('세부 운영 계획에 넣을 문장'), li);
    await page.click(`${Y} #ypGuide [data-insert="0"]`);
    assert((await page.textContent(`${Y} #ypGuide li[data-g="0"]`)).includes('반영됨'), '반영됨 아님');
    await page.click(`${Y} ol.steps [data-step="4"]`);
    assert((await page.inputValue(`${Y} textarea[data-sec="details"]`)).endsWith('안전한 독서 환경을 만든다.'), '세부 칸에 안 들어감');
    const inDoc = await page.evaluate(async () => {
      const M = await import('./menus/plan/year-model.js');
      return M.planDoc(M.getPlan(M.currentId())).blocks.some(b => String(b.text || '').includes('안전한 독서 환경'));
    });
    assert(inDoc, '한글 파일에 넣은 문장이 없음');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
