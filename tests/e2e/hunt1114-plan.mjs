// 계획 버그 잡기(2026-11-14) 화면: 작년(기존) 계획서 목차에 「방침」이 없을 때 지침 문장이 안 보이는 방침 칸으로 들어가
// 「반영됨」이라 하고 한글 파일에는 없던 것 (모델 쪽은 tests/unit/hunt1114-plan.test.mjs)
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[작년 평가]')) return JSON.stringify({ good: ['참여가 많았다'], bad: [], numbers: [] });
  if (prompt.startsWith('[행사 문서]')) return JSON.stringify({ plan: 'Ⅰ. 개요', safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '' });
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
  ['[ev-outline-doc] 행사계획: 작년·기존 계획서 목차로 쓴 계획서를 한글로 내려받으면 그 목차 그대로(앱의 「1. 개요」·「3. 세부 계획」이 겹치지 않음)', async () => {
    const PLAN = 'Ⅰ. 개요\n1. 일시: 2027. 5. 6.(목)\nⅡ. 운영 방침\n가. 모두가 참여한다.\nⅢ. 세부 운영\n가. 이어달리기\nⅣ. 안전 대책\n가. 응급 처치 자리\nⅤ. 평가\n가. 만족도 설문';
    await page.evaluate(async plan => {
      (await import('./core/store.js')).flushAll();
      const m = await import('./menus/plan/event-model.js');
      const e = m.saveEvent({ ...m.newEvent(), name: '가을 운동회', grades: '3~6학년', date: '2027-05-06', place: '운동장', step: 3, maxStep: 3,
        refs: [{ id: 'r1', kind: 'last', name: '2026 작년 운동회 계획서', text: 'Ⅰ. 개요\n1. 일시\nⅡ. 운영 방침\nⅢ. 세부 운영\nⅣ. 안전 대책\nⅤ. 평가' }],
        docs: { plan, safety: '- 점검', letter: '날짜 준비물 복장 문의', rain: '', done: false } });
      m.setCurrentEvent(e.id);
    }, PLAN);
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'event')));
    await page.waitForSelector(`${Y} textarea[data-docf="plan"]`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${Y} [data-e="hwpx"]`)]);
    const xml = [...(await unzip(new Uint8Array(readFileSync(await dl.path())))).entries()].filter(([k]) => /section\d*\.xml$/.test(k)).map(([, v]) => new TextDecoder().decode(v)).join('');
    const text = [...xml.matchAll(/<hp:t>([^<]*)<\/hp:t>/g)].map(m => m[1]).join('\n');
    assert(text.includes('Ⅰ. 개요') && text.includes('Ⅴ. 평가') && text.includes('가. 이어달리기'), text.slice(0, 300));
    assert(!text.includes('1. 개요') && !text.includes('세부 계획'), '앱의 차례가 겹침: ' + text.slice(0, 300));
  }],
  ['[plan-staff-ai] 행사계획: 참고 자료(작년·기존 계획서)의 「박하늘 선생님」 같은 교직원 이름은 AI로 ○○○', async () => {
    await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      const m = await import('./menus/plan/event-model.js');
      const e = m.getEvent(m.currentEventId());
      e.refs = [...e.refs, { id: 'r2', kind: 'official', name: '운동회 협조', text: '진행: 박하늘 선생님\n안전 지도는 이바다 교사가 맡는다.' }];
      m.saveEvent(e);
    });
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'event')));
    await page.waitForSelector(`${Y} [data-e="docs"]`);
    const n = prompts.length;
    await page.click(`${Y} [data-e="docs"]`);
    for (let i = 0; i < 40 && !prompts.slice(n).some(p => p.startsWith('[행사 문서]')); i++) await page.waitForTimeout(100);
    const pr = prompts.slice(n).find(p => p.startsWith('[행사 문서]'));
    assert(pr, '문서 프롬프트 없음');
    assert(!pr.includes('박하늘') && !pr.includes('이바다') && pr.includes('○○○ 선생님'), pr.slice(pr.indexOf('참고 자료'), pr.indexOf('참고 자료') + 400));
  }],
  ['[plan-staff-ai] 연간계획: 작년 계획서·작년 결과·지침의 교직원 이름(「강사 박하늘」「이바다 선생님」「한가람 주무관」)은 AI로 ○○○', async () => {
    await page.evaluate(async () => {
      (await import('./core/store.js')).flushAll();
      const m = await import('./menus/plan/year-model.js');
      const p = m.savePlan({ ...m.newPlan(), name: '과학교육', goal: '탐구하는 즐거움을 기른다.', step: 1, maxStep: 1,
        sources: { lastPlan: '2026 과학교육 계획\n과학의 날 강사 박하늘 초청', lastResult: '이바다 선생님 반 참여가 많았다.\n만족도 4.5점', guide: '결과는 한가람 주무관에게 제출' } });
      m.setCurrent(p.id);
    });
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'year')));
    await page.waitForSelector(`${Y} #ypName`);
    const n = prompts.length;
    await page.click(`${Y} [data-y="next"]`);
    await page.waitForSelector(`${Y} #ypReview .yp-review`);
    await page.click(`${Y} [data-y="next"]`);
    await page.waitForSelector(`${Y} #ypGuide li[data-g]`);
    await page.click(`${Y} [data-y="next"]`);
    await page.click(`${Y} [data-y="draft"]`);
    await page.waitForSelector(`${Y} #ypDraft`);
    const sent = prompts.slice(n);
    assert(['[작년 평가]', '[지침 점검]', '[연간계획 초안]'].every(k => sent.some(p => p.startsWith(k))), sent.map(p => p.slice(0, 10)).join(','));
    const all = sent.join('\n');
    for (const w of ['박하늘', '이바다', '한가람']) assert(!all.includes(w), w + ' 이(가) AI로 감');
    assert(all.includes('강사 ○○○ 초청') && all.includes('○○○ 선생님 반') && all.includes('○○○ 주무관에게'), '가린 자리');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
