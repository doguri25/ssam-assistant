// 계획 › 학급운영계획 예시: [예시로 채우기] → 4단계까지(가짜 AI), 390px 폭, samples/ 한글 파일 읽기
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open({ width: 390, height: 844 });
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[학급운영계획 지침]')) {
    const id = /^(\S+): /m.exec(prompt.split('계획서 칸')[1])[1];
    return JSON.stringify([{ item: '기초학력 진단', keywords: ['기초학력', '진단'], sentence: '3월 첫 주에 기초학력 진단 평가를 한다.', section: id }]);
  }
  if (prompt.startsWith('[학급운영계획 초안]')) {
    const secs = [...prompt.matchAll(/^ {2}- \[(\S+)\] ([^(\n]+)/gm)].map(m => [m[1], m[2].trim()]);
    return JSON.stringify({ sections: Object.fromEntries(secs.map(([id, s]) => [id, `${s}을(를) 올해 학급에 맞게 운영한다.`])), monthly: [{ month: 3, text: '학급 세우기' }] });
  }
  if (prompt.startsWith('[평가계획 읽기]')) return JSON.stringify({ rows: [{ subject: '국어', unit: '읽기', standard: '[4국02-01]', method: '서술형', when: '4월' }] });
  return '{}';
});
const V = 'section[data-menu="plan"] .cp-box';
const cur = () => page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return m.getPlan(m.currentId()); });
const fits = async label => {
  const w = await page.evaluate(() => [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]);
  assert(w[0] <= w[1], `${label} 넘침: ${w}`);
};
await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="plan"]');
await page.click('#menuTabs [data-tab="class"]');

await run('class-plan-sample', [
  ['[예시로 채우기]: 작년 계획서·올해 지침·첨부 2개, 담임 명단·연락 줄은 빼고 알림', async () => {
    await page.click(`${V} [data-c="sample"]`);
    await page.waitForSelector(`${V} #cpAttach li[data-att]`);
    const v = await page.inputValue(`${V} textarea[data-src="lastPlan"]`);
    assert(v.includes('학급 실태') && !v.includes('김가람') && !v.includes('010-'), v.slice(0, 120));
    assert((await page.textContent('#toast')).includes('줄 2개'), await page.textContent('#toast'));
    const p = await cur();
    assert(p.attach.map(a => a.kind).join() === 'jindo,eval' && p.sources.guide.includes('기초학력') && p.boys === 12, JSON.stringify([p.attach.map(a => a.kind), p.boys]));
    await fits('1단계');
  }],
  ['예시로 4단계까지: 작년 목차 그대로 → 초안 → 평가 표 → 한글 파일 (390px에서 넘치지 않음)', async () => {
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('작년 계획서 목차 그대로'), '목차');
    await fits('2단계');
    await page.click(`${V} [data-c="next"]`);
    await page.click(`${V} [data-c="draft"]`);
    await page.waitForSelector(`${V} textarea[data-sec]`, { timeout: 8000 });
    assert(await page.locator(`${V} #cpMonthly`).count() === 1 && (await page.textContent(`${V} #cpGuide`)).includes('기초학력'), '월별 표·지침');
    await fits('3단계');
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpHours`);
    await page.click(`${V} [data-c="evalRead"]`);
    await page.waitForSelector(`${V} #cpEval input`);
    await fits('4단계');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-c="hwpx"]`)]);
    assert(dl.suggestedFilename().endsWith('학급 교육과정 운영 계획.hwpx'), dl.suggestedFilename());
    await page.click(`${V} [data-c="final"]`);
    assert((await cur()).status === 'final', '확정');
  }],
  ['samples/ 작년 계획서 한글 파일을 넣어도 예시와 같은 목차', async () => {
    await page.click(`${V} [data-c="new"]`);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-file="lastPlan"]`)]);
    await fc.setFiles(join(ROOT, 'samples', '학급운영계획-작년-예시.hwpx'));
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastPlan"]`) || {}).value?.includes('학급 실태'), V);
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    const want = await page.evaluate(async () => {
      const m = await import('./menus/plan/classplan-model.js'), s = await import('./menus/plan/classplan-sample.js');
      return m.parseOutline(s.docText(s.sampleLastPlanDoc())).map(x => x.title);
    });
    const got = await page.locator(`${V} #cpOutline input[data-ot]`).evaluateAll(els => els.map(e => e.value));
    assert(JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  }],
  ['samples/ 평가계획 한글 파일은 평가계획으로 짐작', async () => {
    await page.click(`${V} ol.steps [data-step="1"]`);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-file="attach"]`)]);
    await fc.setFiles(join(ROOT, 'samples', '평가계획-예시.hwpx'));
    await page.waitForSelector(`${V} #cpAttach li[data-att]`);
    const a = (await cur()).attach[0];
    assert(a.kind === 'eval' && a.text.includes('[4국02-01]'), JSON.stringify(a).slice(0, 200));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
