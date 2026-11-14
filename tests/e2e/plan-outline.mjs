// 계획서가 작년(기존) 계획서 양식을 그대로 따름: 연간계획 초안 칸 차례·제목·번호 꼴(Ⅰ.)이 작년 계획서의 큰 제목 그대로(맞지 않는 제목은 덧붙임 칸),
// 한글 파일도 그 차례로, 고친 덧붙임 칸 글은 남음. 행사계획: 참고 자료 「작년·기존 계획서」의 목차를 계획서가 따름
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
  if (prompt.startsWith('[행사 문서]')) return JSON.stringify({ plan: 'Ⅰ. 개요', safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '' });
  if (prompt.startsWith('[연간계획 초안]')) return JSON.stringify({
    purpose: '책을 즐겨 읽는 습관을 기른다.', policy: '가. 전교생이 참여한다.', details: '1. 아침 독서\n2. 독서 행사', evaluation: '독서량이 는다.', x1: '1. 2027 독서교육 기본계획',
    schedule: [{ title: '계획 수립', date: '2027-03-10' }], budget: [{ name: '도서 구입', amount: 500000, note: '' }]
  });
  return '{}';
});
const Y = 'section[data-menu="plan"]';
const LAST = ['2026학년도 독서교육 운영 계획', 'Ⅰ. 추진 근거', '1. 2026 독서교육 기본계획', 'Ⅱ. 목적', '책을 즐겨 읽는 습관을 기른다.', 'Ⅲ. 운영 방침', '가. 전교생이 참여한다.',
  'Ⅳ. 세부 추진 내용', '1. 아침 독서', '2. 독서 행사', 'Ⅴ. 추진 일정', '3월 계획 수립', 'Ⅵ. 소요 예산', '도서 구입 500,000원', 'Ⅶ. 기대 효과', '독서량이 는다.'].join('\n');
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'year')));
await page.waitForSelector(`${Y} #ypName`);

await run('plan-outline', [
  ['연간계획: 작년(기존) 계획서를 넣으면 4단계에서 「작년(기존) 계획서 목차 그대로 써요(7칸)」', async () => {
    await page.fill(`${Y} #ypName`, '독서교육');
    await page.fill(`${Y} #ypGoal`, '스스로 책을 고르고 즐기는 독서 습관을 기른다.');
    await page.fill(`${Y} textarea[data-src="lastPlan"]`, LAST);
    for (let i = 0; i < 4 && !(await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('초안'); i++) await page.click(`${Y} [data-y="next"]`);
    assert((await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('초안'), '4단계가 아님');
    const note = await page.textContent(`${Y} #ypOutlineNote`);
    assert(note.includes('7칸') && note.includes('추진 근거 · 목적 · 운영 방침'), note);
  }],
  ['초안: 칸 차례·제목·번호 꼴이 작년 그대로(Ⅰ. 추진 근거 … Ⅶ. 기대 효과), 맞지 않는 제목은 덧붙임 칸, AI에 목차를 보냄', async () => {
    await page.click(`${Y} [data-y="draft"]`);
    await page.waitForSelector(`${Y} #ypDraft`);
    const heads = await page.$$eval(`${Y} #ypDraft .yp-sec-h h3`, hs => hs.map(h => h.textContent.trim()));
    assert(heads.join('|') === 'Ⅰ. 추진 근거|Ⅱ. 목적|Ⅲ. 운영 방침|Ⅳ. 세부 추진 내용|Ⅴ. 추진 일정|Ⅵ. 소요 예산|Ⅶ. 기대 효과', heads.join('|'));
    assert(await page.inputValue(`${Y} textarea[data-sec="x1"]`) === '1. 2027 독서교육 기본계획', '덧붙임 칸 글');
    assert(await page.locator(`${Y} #ypSched`).count() === 1 && await page.locator(`${Y} #ypBudget`).count() === 1, '일정·예산 표');
    const p = prompts.find(x => x.startsWith('[연간계획 초안]'));
    assert(p.includes('1. 추진 근거 → x1') && p.includes('5. 추진 일정 → schedule') && p.includes('목차·짜임·문체를 그대로 따름') && p.includes('"x1":"…"'), p.slice(p.indexOf('작년(기존)'), p.indexOf('작년(기존)') + 400));
    assert(await page.isVisible(`${Y} #ypOutlineUsed`), '목차 그대로 안내');
  }],
  ['덧붙임 칸을 고치면 저장되고, 한글 파일 문서도 그 차례·제목', async () => {
    await page.fill(`${Y} textarea[data-sec="x1"]`, '1. 2027 독서교육 기본계획(교육청)');
    await page.waitForTimeout(700);
    const heads = await page.evaluate(async () => {
      const M = await import('./menus/plan/year-model.js');
      const p = M.getPlan(M.currentId());
      return { x1: p.draft.x1, heads: M.planDoc(p).blocks.filter(b => b.type === 'h').map(b => b.text) };
    });
    assert(heads.x1 === '1. 2027 독서교육 기본계획(교육청)', heads.x1);
    assert(heads.heads.join('|') === 'Ⅰ. 추진 근거|Ⅱ. 목적|Ⅲ. 운영 방침|Ⅳ. 세부 추진 내용|Ⅴ. 추진 일정|Ⅵ. 소요 예산|Ⅶ. 기대 효과', heads.heads.join('|'));
  }],
  ['행사계획: 참고 자료 종류에 「작년·기존 계획서」, 문서를 만들면 계획서가 그 목차를 따르게 AI에 보냄', async () => {
    const LAST_EV = 'Ⅰ. 개요\n1. 일시: 2026. 5. 6.\nⅡ. 운영 방침\nⅢ. 세부 운영\n가. 경기 종목\nⅣ. 안전 대책\nⅤ. 평가';
    await page.evaluate(async t => {
      (await import('./core/store.js')).flushAll();
      const m = await import('./menus/plan/event-model.js');
      const e = m.saveEvent({ ...m.newEvent(), name: '가을 운동회', grades: '3~6학년', date: '2027-05-06', place: '운동장', outdoor: false, step: 1, maxStep: 3,
        refs: [{ id: 'r1', kind: m.guessKind('2026 작년 운동회 계획서.hwpx'), name: '2026 작년 운동회 계획서', text: t }] });
      m.setCurrentEvent(e.id);
    }, LAST_EV);
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'event')));
    await page.waitForSelector(`${Y} select[data-refkind="r1"]`);
    const kinds = await page.$$eval(`${Y} select[data-refkind] option`, os => os.map(o => o.textContent));
    assert(kinds.includes('작년·기존 계획서'), kinds.join(','));
    assert(await page.$eval(`${Y} select[data-refkind="r1"]`, s => s.value) === 'last', '파일 이름으로 알아봄');
    await page.click(`${Y} ol.steps [data-step="3"]`);
    await page.waitForSelector(`${Y} [data-e="docs"]`);
    await page.click(`${Y} [data-e="docs"]`);
    for (let i = 0; i < 30 && !prompts.some(p => p.startsWith('[행사 문서]')); i++) await page.waitForTimeout(100);
    const pr = prompts.filter(p => p.startsWith('[행사 문서]')).at(-1);
    if (!pr) console.log('DEBUG', prompts.map(p => p.slice(0, 20)), (await page.textContent(`${Y} .yp-card:last-of-type`)).slice(0, 300));
    assert(pr && pr.includes('「작년·기존 계획서」의 목차를 그대로 따름') && pr.includes('Ⅰ. 개요 / Ⅱ. 운영 방침 / Ⅲ. 세부 운영 / Ⅳ. 안전 대책 / Ⅴ. 평가'), pr && pr.slice(pr.indexOf('규칙:'), pr.indexOf('규칙:') + 300));
    assert(!pr.includes('개요·운영 방침·세부 운영·안전 대책·평가 순'), '기본 차례 규칙이 남음');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
