// 행사계획 최종 검토 고침: 설문이 다른 행사로 섞임, 확정 뒤 날짜·야외 바꾸기, 4단계 입력 끊김, 보고서 프롬프트의 행사, 역할 복사·가정통신문 QR
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
let slow = 0;
const prompts = [];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (prompt.startsWith('[설문 문항]')) return JSON.stringify({ items: [{ type: 'scale', q: '즐거웠나요?' }, { type: 'scale', q: '안전했나요?' }, { type: 'scale', q: '알맞았나요?' }, { type: 'text', q: '좋았던 점은?' }] });
  if (prompt.startsWith('[설문 결과]')) return JSON.stringify({ textSummary: '요약', report: '보고서', nextMemo: '메모' });
  return '{}';
});
const V = 'section[data-menu="plan"]';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]'); };
const DOCS = { plan: '계획', safety: '안전', letter: '날짜 준비물 복장 문의: 교무실', rain: '강당', roles: [{ name: '김교사', roles: ['사회', '음향'] }, { name: '이교사', roles: ['안전'] }], done: true };
const OPT = [{ label: '새로운 안', timetable: [{ time: '09:00', activity: '개회식' }], budget: [] }];
const seed = (evs, cur) => page.evaluate(async ([evs, cur]) => {
  localStorage.removeItem('ssam:events'); localStorage.removeItem('ssam:calendar');
  const m = await import('./menus/plan/event-model.js');
  const ids = evs.map(e => m.saveEvent({ ...m.newEvent(), ...e, options: m.normOptions(e.options || []) }).id);
  m.setCurrentEvent(ids[cur]);
  return ids;
}, [evs, cur]);
const getEv = id => page.evaluate(async id => (await import('./menus/plan/event-model.js')).getEvent(id), id);
const base = (name, extra = {}) => ({ name, grades: '전교생', date: '2027-05-06', place: '운동장', outdoor: true, options: OPT, picked: 0, docs: DOCS, step: 4, maxStep: 4, ...extra });
await page.goto(url);
await page.waitForTimeout(400);

await run('event-plan-fixes', [
  ['설문 문항을 만드는 동안 다른 행사로 가도 설문이 섞이지 않음', async () => {
    const [a, b] = await seed([base('행사 가'), base('행사 나', { survey: { target: 'parent', items: [], formUrl: 'https://forms.gle/BBB', result: null, report: '나 보고서', nextMemo: '나 메모' } })], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    slow = 1200;
    await page.click(`${V} [data-e="items"]`);
    await page.click(`${V} #evList [data-ev="${b}"]`);
    await page.waitForTimeout(1600); slow = 0;
    const A = await getEv(a), B = await getEv(b);
    assert(A.survey && A.survey.items.length === 4, 'A 문항: ' + JSON.stringify(A.survey));
    assert(A.survey.formUrl === '' && A.survey.report === '' && A.survey.target === 'student', 'A에 나의 설문이 섞임: ' + JSON.stringify(A.survey));
    assert(B.survey.formUrl === 'https://forms.gle/BBB' && B.survey.items.length === 0, 'B가 바뀜');
  }],
  ['확정한 행사의 날짜를 바꾸면 「작성 중」이 되고 학사일정의 옛 날짜가 빠짐', async () => {
    const [a] = await seed([base('운동회')], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${V} [data-e="final"]`);
    assert((await getEv(a)).status === 'final', '확정이 안 됨');
    await page.click(`${V} ol.steps [data-step="1"]`);
    await page.fill(`${V} #evDate`, '2027-05-13');
    await page.waitForTimeout(200);
    assert((await getEv(a)).status === 'draft', '여전히 확정');
    const cal = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:calendar') || '[]'));
    assert(!cal.some(e => e.date === '2027-05-06'), '옛 날짜가 남음: ' + JSON.stringify(cal));
    assert((await page.textContent(`${V} #evList [aria-current="true"]`)).includes('작성 중'), '목록 표시');
  }],
  ['확정한 실내 행사를 야외로 바꾸면 「작성 중」', async () => {
    const [a] = await seed([base('학예회', { outdoor: false, place: '강당' })], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${V} [data-e="final"]`);
    await page.click(`${V} ol.steps [data-step="1"]`);
    await page.click(`${V} [data-outdoor="1"]`);
    assert((await getEv(a)).status === 'draft', '여전히 확정');
  }],
  ['문항을 만드는 동안 폼 링크를 쳐도 끊기지 않음', async () => {
    await seed([base('체험학습')], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    slow = 1000;
    await page.click(`${V} [data-e="items"]`);
    await page.click(`${V} #evForm`);
    await page.keyboard.type('https://forms.gle/xyz789', { delay: 70 });
    slow = 0;
    await page.waitForTimeout(300);
    assert(await page.inputValue(`${V} #evForm`) === 'https://forms.gle/xyz789', '값: ' + await page.inputValue(`${V} #evForm`));
    assert(await page.locator(`${V} #evItems li`).count() === 4, '문항이 안 보임');
  }],
  ['CSV를 읽는 동안 다른 행사로 가도 보고서 프롬프트는 그 행사', async () => {
    const [a, b] = await seed([base('가을 운동회'), base('봄 소풍')], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.evaluate(() => { const f = Blob.prototype.arrayBuffer; Blob.prototype.arrayBuffer = async function () { await new Promise(r => setTimeout(r, 800)); return f.call(this); }; });
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${V} [data-e="csv"]`)]);
    await fc.setFiles(join(FIXTURES, 'survey-12.csv'));
    await page.click(`${V} #evList [data-ev="${b}"]`);
    await page.waitForFunction(() => true);
    await page.waitForTimeout(1500);
    const pr = prompts.filter(p => p.startsWith('[설문 결과]')).at(-1) || '';
    assert(pr.includes('가을 운동회') && !pr.includes('봄 소풍'), '프롬프트 행사: ' + pr.slice(0, 80));
    assert((await getEv(a)).survey.report === '보고서', 'A 보고서');
    await page.reload(); await page.waitForTimeout(400);
  }],
  ['역할 분담표 복사, 가정통신문 탭에 QR 미리보기', async () => {
    await seed([base('운동회', { step: 3, survey: { target: 'student', items: [], formUrl: 'https://forms.gle/abc123', result: null, report: '', nextMemo: '' } })], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${V} [data-doc="roles"]`);
    await page.click(`${V} [data-e="copyDoc"]`);
    await page.waitForTimeout(150);
    assert(await page.evaluate(() => navigator.clipboard.readText()) === '이름\t맡은 역할\n김교사\t사회, 음향\n이교사\t안전', '역할 복사');
    await page.click(`${V} [data-doc="letter"]`);
    await page.waitForSelector(`${V} #evLetterQr img`, { timeout: 5000 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
