// 계획 › 연간계획: 1 자료 넣기 → 2 작년 평가 → 3 지침 점검 → 4 초안 → 5 일정 (PRD 5.3)
import { open, run, assert, mockClaude } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
let slow = 0;
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (prompt.startsWith('[작년 평가]')) return JSON.stringify({ good: ['참여율 높음'], bad: [{ text: '저학년 참여 적음', ideas: ['저학년 짝 독서', '그림책 코너'] }], numbers: ['대출 권수 12% 늘어남'] });
  return '{}';
});
const Y = 'section[data-menu="plan"]';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="year"]'); };
await page.goto(url);
await page.waitForTimeout(500);
await go();

const RESULT = '2026 독서교육 결과\n만족도 4.2점, 대출 권수 12% 증가\n반성: 저학년 참여가 적었음';

await run('year-plan', [
  ['처음: 단계 5개·1단계·지난 계획 비어 있음·학년도는 설정 값', async () => {
    assert(await page.locator(`${Y} ol.steps li`).count() === 5, '단계 수');
    assert((await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('자료 넣기'), '지금 단계');
    assert(await page.locator(`${Y} #ypList [data-yp]`).count() === 0, '지난 계획이 있음');
    const y = await page.evaluate(async () => (await import('./core/settings.js')).getSchool().year);
    assert(await page.inputValue(`${Y} #ypYear`) === String(y), '학년도');
  }],
  ['업무명·목표가 비면 다음으로 가지 않고 빨간 칸', async () => {
    await page.click(`${Y} [data-y="next"]`);
    assert(await page.locator(`${Y} #ypName.bad`).count() === 1 && await page.locator(`${Y} #ypGoal.bad`).count() === 1, '빨간 칸 아님');
    assert((await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('자료 넣기'), '단계가 넘어감');
  }],
  ['작년 결과가 있으면 2단계에서 AI가 평가하고 제안을 고를 수 있음', async () => {
    await page.fill(`${Y} #ypName`, '독서교육');
    await page.fill(`${Y} #ypGoal`, '스스로 책을 고르고 즐기는 독서 습관을 기른다.');
    await page.fill(`${Y} textarea[data-src="lastResult"]`, RESULT);
    await page.click(`${Y} [data-y="next"]`);
    await page.waitForSelector(`${Y} #ypReview input[data-idea]`, { timeout: 8000 });
    const txt = await page.textContent(`${Y} #ypReview`);
    for (const w of ['잘된 점', '참여율 높음', '아쉬운 점', '저학년 참여 적음', '수치 변화', '대출 권수 12% 늘어남']) assert(txt.includes(w), `「${w}」 없음`);
    assert(prompts.at(-1).includes('대출 권수 12% 증가'), '프롬프트에 결과 글 없음');
    assert(await page.locator(`${Y} #ypReview input[data-idea]`).count() === 2, '제안 수');
    await page.check(`${Y} #ypReview input[data-idea="저학년 짝 독서"]`);
    assert((await page.textContent(`${Y} #ypList`)).includes('독서교육'), '지난 계획에 없음');
    await page.reload(); await page.waitForTimeout(500);
    assert(await page.isChecked(`${Y} #ypReview input[data-idea="저학년 짝 독서"]`), '새로고침 뒤 체크가 사라짐');
  }],
  ['작년 결과 없이 만들면 AI를 부르지 않고 알림', async () => {
    await page.click(`${Y} [data-y="new"]`);
    await page.fill(`${Y} #ypName`, '생활교육');
    await page.fill(`${Y} #ypGoal`, '서로 존중하는 학급 문화를 만든다.');
    const n = prompts.length;
    await page.click(`${Y} [data-y="next"]`);
    await page.waitForSelector(`${Y} #ypNote`);
    assert((await page.textContent(`${Y} #ypNote`)).includes('작년 결과 없이 목표와 지침으로 만들어요'), '알림 없음');
    assert(prompts.length === n, 'AI를 부름');
  }],
  ['지난 계획에서 첫 계획을 누르면 그 계획의 2단계', async () => {
    await page.click(`${Y} #ypList [data-yp]:has-text("독서교육")`);
    assert((await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('작년 평가'), '단계');
    assert((await page.textContent(`${Y} #ypReview`)).includes('저학년 참여 적음'), '그 계획의 평가가 아님');
  }],
  ['파일 버튼으로 한글 파일을 넣으면 그 칸이 채워지고 이름이 보임', async () => {
    await page.click(`${Y} ol.steps [data-step="1"]`);
    const buf = Buffer.from(makeHwpx({ title: '2026 독서교육 운영 계획', blocks: [{ type: 'p', text: '아침 독서 시간을 운영한다.' }] }));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${Y} [data-file="lastPlan"]`)]);
    await fc.setFiles({ name: '작년 계획.hwpx', mimeType: 'application/octet-stream', buffer: buf });
    await page.waitForFunction(s => document.querySelector(`${s} textarea[data-src="lastPlan"]`).value.includes('아침 독서 시간을 운영한다'), Y, { timeout: 8000 });
    assert((await page.textContent(`${Y} .yp-files[data-for="lastPlan"]`)).includes('작년 계획.hwpx'), '파일 이름 없음');
  }],
  // (Task 5·6 시험이 여기 이어짐)
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
