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
  if (prompt.startsWith('[지침 점검]')) return JSON.stringify([{ item: '아침 독서 시간 확보', keywords: ['매일 아침', '20분'], sentence: '매일 아침 독서 20분을 운영한다.', section: 'details' }]);
  if (prompt.startsWith('[연간계획 초안]')) return '```json\n' + JSON.stringify({
    purpose: '아침 독서 시간을 운영한다.', policy: '학생이 스스로 책을 고르게 한다.', details: '학급별 독서 동아리를 운영한다.', evaluation: '만족도 설문으로 평가한다.',
    schedule: [{ title: '독서 동아리 모집', date: '2027-03-15' }, { title: '독서의 달 행사', date: '2027-10-03' }, { title: '독서 골든벨', date: '2027-08-10' }],
    budget: [{ name: '도서 구입', amount: 800000, note: '' }, { name: '행사 상품', amount: 400000, note: '골든벨' }]
  }) + '\n```';
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
  ['3단계 지침 점검: 항목을 뽑고, 초안 전에는 반영 여부를 아직 보여 주지 않음', async () => {
    await page.fill(`${Y} textarea[data-src="guide"]`, '2027 독서교육 지침: 매일 아침 독서 시간을 확보할 것');
    await page.click(`${Y} ol.steps [data-step="2"]`);
    await page.click(`${Y} [data-y="next"]`);
    await page.waitForSelector(`${Y} #ypGuide li[data-g]`, { timeout: 8000 });
    assert((await page.textContent(`${Y} #ypGuide`)).includes('아침 독서 시간 확보'), '항목 없음');
    assert((await page.textContent(`${Y} #ypMain`)).includes('초안을 만든 뒤 반영 여부를 보여 줘요'), '안내 없음');
  }],
  ['4단계 초안: 6섹션 순서, 고른 제안·지침 항목이 프롬프트에', async () => {
    await page.click(`${Y} [data-y="next"]`);
    await page.click(`${Y} [data-y="draft"]`);
    await page.waitForSelector(`${Y} #ypDraft textarea[data-sec="purpose"]`, { timeout: 8000 });
    const heads = await page.locator(`${Y} #ypDraft .yp-sec h3`).allInnerTexts();
    assert(heads.join('|') === '1. 목적|2. 방침|3. 세부 추진 계획|4. 월별 추진 일정|5. 예산|6. 평가 계획', '섹션: ' + heads.join('|'));
    const pr = prompts.at(-1);
    assert(pr.startsWith('[연간계획 초안]') && pr.includes('저학년 짝 독서') && pr.includes('아침 독서 시간 확보'), '프롬프트');
    assert((await page.textContent(`${Y} #ypSched`)).includes('독서의 달 행사'), '일정 표');
    assert((await page.textContent(`${Y} #ypBudget`)).includes('1,200,000'), '예산 합계');
  }],
  ['3단계로 돌아가면 「빠짐」, [넣기] → 「반영됨」, 세부 추진 계획 끝에 문장', async () => {
    await page.click(`${Y} ol.steps [data-step="3"]`);
    assert((await page.textContent(`${Y} #ypGuide li[data-g="0"]`)).includes('빠짐'), '빠짐 아님');
    await page.click(`${Y} #ypGuide [data-insert="0"]`);
    assert((await page.textContent(`${Y} #ypGuide li[data-g="0"]`)).includes('반영됨'), '반영됨 아님');
    await page.click(`${Y} ol.steps [data-step="4"]`);
    assert((await page.inputValue(`${Y} textarea[data-sec="details"]`)).endsWith('매일 아침 독서 20분을 운영한다.'), '문장이 안 들어감');
  }],
  ['작년 계획과 비교: 퍼센트, 60% 넘으면 겹친 문장 표시', async () => {
    assert(/작년 계획과 \d+% 같아요/.test(await page.textContent(`${Y} #ypOverlap`)), '비교 줄 없음');
    assert(await page.locator(`${Y} .yp-same`).count() === 0, '처음부터 겹친 문장 표시');
    for (const k of ['policy', 'details', 'evaluation']) await page.fill(`${Y} textarea[data-sec="${k}"]`, '아침 독서 시간을 운영한다.');
    await page.waitForFunction(s => document.querySelectorAll(`${s} .yp-same`).length > 0, Y, { timeout: 3000 });
    assert((await page.textContent(`${Y} #ypOverlap`)).includes('100%'), await page.textContent(`${Y} #ypOverlap`));
  }],
  ['지침 자료가 없으면 3단계는 AI 없이 넘어감', async () => {
    await page.click(`${Y} #ypList [data-yp]:has-text("생활교육")`);
    const n = prompts.length;
    await page.click(`${Y} [data-y="next"]`);
    assert((await page.textContent(`${Y} #ypMain`)).includes('올해 지침 자료가 없어요'), '안내 없음');
    assert(prompts.length === n, 'AI를 부름');
    await page.click(`${Y} #ypList [data-yp]:has-text("독서교육")`);
  }],
  ['5단계 일정: 겹친 날은 빨갛고 이유·추천 2개, 추천을 누르면 바뀜', async () => {
    assert((await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('초안'), '4단계가 아님');
    await page.click(`${Y} [data-y="next"]`);
    assert(await page.locator(`${Y} #ypDays tr[data-i]`).count() === 3, '일정 줄 수');
    const row = `${Y} #ypDays tr[data-i="1"]`;
    assert(await page.locator(`${row}.yp-bad`).count() === 1, '빨간 줄 아님');
    assert((await page.textContent(`${row} .yp-why`)).includes('일요일 · 공휴일(개천절)'), '이유: ' + await page.textContent(`${row} .yp-why`));
    const sug = await page.locator(`${row} button[data-suggest]`).evaluateAll(bs => bs.map(b => b.dataset.suggest));
    assert(sug.join(',') === '2027-10-05,2027-10-01', '추천: ' + sug.join(','));
    await page.click(`${row} button[data-suggest="2027-10-05"]`);
    assert(await page.inputValue(`${row} input[data-date]`) === '2027-10-05', '날짜가 안 바뀜');
    assert(await page.locator(`${row}.yp-bad`).count() === 0, '여전히 빨감');
  }],
  ['설정의 여름방학 안 날짜는 「여름방학」으로 빨감', async () => {
    await page.evaluate(async () => (await import('./core/settings.js')).setSchool({ breaks: [{ from: '2027-07-23', to: '2027-08-22', label: '여름방학' }] }));
    await page.click('nav.app-side [data-menu-go="settings"]');
    await go();
    const row = `${Y} #ypDays tr[data-i="2"]`;
    assert(await page.locator(`${row}.yp-bad`).count() === 1 && (await page.textContent(`${row} .yp-why`)).includes('여름방학'), '방학 겹침이 안 보임');
  }],
  ['한글 파일로 내려받기, 섹션 복사', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${Y} [data-y="hwpx"]`)]);
    assert(dl.suggestedFilename() === '2027학년도 독서교육 운영 계획.hwpx', '이름: ' + dl.suggestedFilename());
    await page.click(`${Y} ol.steps [data-step="4"]`);
    await page.click(`${Y} [data-copy="purpose"]`);
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => navigator.clipboard.readText()) === await page.inputValue(`${Y} textarea[data-sec="purpose"]`), '클립보드');
    await page.click(`${Y} [data-y="next"]`);
  }],
  ['확정하면 지난 계획에 「확정」, 학사일정에 3개(다시 확정해도 3개)', async () => {
    await page.click(`${Y} [data-y="final"]`);
    assert((await page.textContent(`${Y} #ypList [aria-current="true"]`)).includes('확정'), '확정 표시 없음');
    const cal = async () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:calendar') || '[]'));
    let c = await cal();
    assert(c.length === 3 && c.every(e => e.source.startsWith('year:')), JSON.stringify(c));
    await page.click(`${Y} [data-y="final"]`);
    c = await cal();
    assert(c.length === 3, '쌓임: ' + c.length);
  }],
  ['새 계획에서 지난 계획을 작년 계획서로 불러옴', async () => {
    await page.click(`${Y} [data-y="new"]`);
    await page.click(`${Y} [data-y="importPrev"]`);
    await page.click(`${Y} #ypPrev [data-prev]`);
    const v = await page.inputValue(`${Y} textarea[data-src="lastPlan"]`);
    assert(v.includes('2027학년도 독서교육 운영 계획') && v.includes('독서의 달 행사'), v.slice(0, 120));
  }],
  ['AI가 초안을 쓰는 동안 다른 메뉴에 갔다 와도 그 계획에 들어가 있음', async () => {
    await page.click(`${Y} #ypList [data-yp]:has-text("생활교육")`);
    assert((await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('지침 점검'), '3단계가 아님');
    await page.click(`${Y} [data-y="next"]`);
    slow = 1500;
    await page.click(`${Y} [data-y="draft"]`);
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.waitForTimeout(2200);
    slow = 0;
    await go();
    assert((await page.textContent(`${Y} #ypList [aria-current="true"]`)).includes('생활교육'), '다른 계획이 열림');
    await page.waitForSelector(`${Y} #ypDraft textarea[data-sec="purpose"]`, { timeout: 5000 });
  }],
  ['390px 폭에서 본문이 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const w = await page.evaluate(() => [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]);
    assert(w[0] <= w[1], '넘침: ' + w);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
