// 일하는 중에 다른 메뉴로 가도 AI 일은 뒤에서 이어지고, 돌아오면 결과(그 일을 시작한 기록에)·진행이 보임.
// 단원평가(채점·잘한 점·격려·답안 스캔 나누기)·활동지(한꺼번에 넣기·기준 AI)·평가지 채점·행특·연간계획 초안·행사계획 문서·가정통신문 쓰기·
// 품의 초안·견적서 읽기·쪽지·공문 처리·인수인계서 [AI로 정리]
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';
import { SAMPLE_ITEMS } from '../../web/menus/evaluate/unit/unit-sample.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});

/* AI 가짜 응답: 일마다 늦게(delay) 답함. 지금 답을 기다리는 요청 수(waiting)로 「아직 하는 중」을 맞춤 */
let delay = 0, waiting = 0;
const calls = [];
const kindOf = p => (p.startsWith('[단원평가 채점]') ? 'unit' : p.includes('수준 학생에게 쓸 평어 문장을 정확히') ? 'py' : p.includes('수행평가를 채점하는') ? 'gr' : p.includes("'행동특성 및 종합의견'을 쓰는") ? 'hk'
  : p.startsWith('[행사 문서]') ? 'eventDocs' : p.startsWith('[가정통신문]') ? 'letter' : p.startsWith('[품의 초안]') ? 'pcDraft' : p.startsWith('[품의 넣기]') ? 'pcIntake'
  : p.startsWith('[쪽지 안내]') ? 'message' : p.startsWith('[업무 인수인계]') ? 'handover' : p.startsWith('[단원평가 피드백]') ? 'unitFb' : p.startsWith('[활동지 기준]') ? 'actCrit'
  : p.startsWith('[공문 처리]') ? 'gongmun' : p.startsWith('[연간계획 초안]') ? 'yearDraft' : 'other');
let pySeq = 0;
const syl = k => String.fromCharCode(0xAC00 + (k % 399) * 28);
const HK_LINE = m => `${m} 학급의 1인 1역을 한 학기 동안 성실하게 해내며 친구를 먼저 돕는 따뜻한 마음을 지녔고, 수학 문제를 끝까지 풀려는 끈기를 보여 줌.`;
await mockClaude(page, async ({ prompt }) => {
  const k = kindOf(prompt);
  calls.push({ k, prompt });
  waiting++;
  try { if (delay) await new Promise(r => setTimeout(r, delay)); } finally { waiting--; }
  if (k === 'py') { pySeq++; return Array.from({ length: 60 }, (_, j) => `${syl(pySeq * 61 + j)}${syl(j * 7 + pySeq)} 장면을 생활과 연결하여 감상을 근거와 함께 씀.`).join('\n'); }
  if (k === 'unit') return JSON.stringify({ items: SAMPLE_ITEMS.map(it => ({ no: it.no, read: it.answer, points: it.points, sure: true, why: '' })) });
  if (k === 'gr') return JSON.stringify({ score: 80, summary: '바르게 풀었음', evidence: ['풀이가 맞음'], strengths: '꼼꼼함', improve: '검산', unreadable: false });
  if (k === 'hk') { const m = (/표시([A-Z])/.exec(prompt) || [])[1] || '?'; return [`1. ${HK_LINE('후보1-' + m)}`, `2. ${HK_LINE('후보2-' + m)}`].join('\n'); }
  if (k === 'eventDocs') return JSON.stringify({ plan: '1. 운영 방침\n학년별로 나누어 운영한다.', safety: '- 응급 처치 인원 배치', letter: '가을 운동회 안내\n준비물: 물병', rain: '', roles: [] });
  if (k === 'letter') return JSON.stringify({ title: '가을 현장체험학습 안내', greeting: ['안녕하십니까?'], intro: '현장체험학습을 다음과 같이 실시합니다.', items: ['1. 일시: 2026. 11. 12.(목)'], closing: '감사합니다.', reply: { need: false, title: '', fields: [], due: '' }, short: '현장체험학습이 있어요.', related: [], target: '3학년 보호자' });
  if (k === 'pcDraft') return JSON.stringify({ title: '과학 실험 재료 구입', intro: '과학 실험 재료를 다음과 같이 구입하고자 합니다.', fields: { purpose: '과학 실험 수업' }, type: 'goods' });
  if (k === 'pcIntake') return JSON.stringify({ items: [{ name: '색종이', spec: '', unit: '묶음', qty: 10, price: 3000 }], fields: {} });
  if (k === 'message') return JSON.stringify({ kind: 'training', title: 'AI 활용 수업 연수', when: [{ date: '2026-11-12', time: '15:00~16:30' }], place: '시청각실', target: '전 교직원', apply: { due: '', how: '' }, bring: '', notes: '', points: [] });
  if (k === 'handover') return JSON.stringify({ lines: ['3월 첫 주에 과학 교육 계획부터 확정해요.', '운동회는 점심시간을 늘려요.'] });
  if (k === 'unitFb') return JSON.stringify({ students: [...prompt.matchAll(/^- (\d+)번 \|/gm)].map(m => ({ no: +m[1], good: `잘한점-${m[1]} 문제를 끝까지 풀었어요.`, cheer: '조금만 더 살펴봐요.' })) });
  if (k === 'actCrit') return JSON.stringify({ items: [{ no: 1, type: 'draw', ask: '물의 여행 그리기', answer: '바다·구름·비', ok: '셋이 모두 있음', part: '일부만', src: 'ai' }] });
  if (k === 'gongmun') return JSON.stringify({ title: '2026 과학의 날 운영 안내', from: '○○교육지원청', due: '2026-11-20', summary: '과학의 날 행사', tasks: ['참가 학생 조사'], kinds: [] });
  if (k === 'yearDraft') return JSON.stringify({ purpose: '탐구하는 즐거움을 느끼게 한다.', policy: '가. 학년별로 운영한다.', details: '1) 과학의 날 행사', schedule: [], budget: [], evaluation: '설문으로 평가한다.' });
  // 평가지 채점 평어(「"no": 1」 학생마다) 등
  const nos = [...prompt.matchAll(/"no": (\d+)/g)].map(m => +m[1]);
  return JSON.stringify((nos.length ? nos : [1, 2, 3]).map(no => ({ no, score: 80, text: '수를 바르게 계산하고 풀이 과정을 차례대로 설명함.' })));
});
const until = async (fn, ms = 10000, what = '') => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과 ' + what); await new Promise(r => setTimeout(r, 50)); } };
const n = k => calls.filter(c => c.k === k).length;
const goTo = async (menu, tab) => { await page.click(`nav.app-side [data-menu-go="${menu}"]`); if (tab) await page.click(`#menuTabs [data-tab="${tab}"]`); };
const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
/* 세로 메뉴의 「AI가 일하는 중」 점: 일하는 메뉴 버튼만(지금 보는 메뉴는 빼고) */
const dots = () => page.$$eval('nav.app-side .side-btn.working', bs => bs.map(b => b.dataset.menuGo).join(','));
/* 스캔 읽기(PDF·사진 → 쪽)를 ms만큼 늦춤(큰 PDF를 읽는 동안처럼). 0이면 되돌림 */
const slowPages = ms => page.evaluate(ms => {
  const f = window.SSAM.files, orig = f.__readPages || (f.__readPages = f.readPages);
  f.readPages = ms ? async (list, say) => { if (say) say('스캔을 읽는 중… 1/1'); await new Promise(r => setTimeout(r, ms)); return orig(list, say); } : orig;
}, ms);

await page.goto(url);
await page.waitForTimeout(400);
/* 미리 넣어 둠: 학급 3명, 단원평가 2개(채점할 A, 다른 평가 B), 행특 메모, 행사 2개(문서를 만들 A, 다른 행사 B), 인수인계서에 모을 계획 */
const seed = await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  const mk = (round, date) => { const x = m.newTest({ meta: { ...s.SAMPLE_META, round, date }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } }); m.saveTest(x); return x.id; };
  localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
  localStorage.setItem('ssam:unit:set', JSON.stringify({ pagesPer: 1, maskOn: false, mask: [] }));
  localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
  localStorage.setItem('ssam:hk', JSON.stringify({ settings: { min: 60, max: 300, variants: 2 }, students: [1, 2, 3].map(no => ({ id: 'h' + no, no, label: '', memo: `우유 당번 표시${'ABC'[no - 1]}`, done: 0, results: [] })) }));
  const ev = await import('./menus/plan/event-model.js');
  const opt = { label: '새로운 안', summary: '한 줄', timetable: [{ time: '09:00', activity: '개회식', place: '운동장' }], pros: ['안전함'], staffNeed: '교사 4명', budget: [] };
  const base = { grades: '전교생', date: '2027-05-06', place: '운동장', options: ev.normOptions([opt]), picked: 0, step: 3, maxStep: 3 };
  const eB = ev.saveEvent({ ...ev.newEvent(), ...base, name: '학예회' });
  const eA = ev.saveEvent({ ...ev.newEvent(), ...base, name: '가을 운동회' });
  ev.setCurrentEvent(eA.id);
  const y = await import('./menus/plan/year-model.js');
  const yp = y.savePlan({ ...y.newPlan(), year: Number(JSON.parse(localStorage.getItem('ssam:years') || '{}').current) || 2026, name: '과학 교육', goal: '탐구하는 즐거움', step: 4, maxStep: 4 });
  y.setCurrent(yp.id);
  return { A: mk(1, '2026-10-29'), B: mk(2, '2026-10-28'), evA: eA.id, evB: eB.id, yp: yp.id };
});
await page.reload(); await page.waitForTimeout(500);
const shot = async (w, h) => ({ name: `답안${w}.png`, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } }) });
const ansFiles = [await shot(300, 420), await shot(310, 430), await shot(320, 440)];
const U = 'section[data-menu="evaluate"] .unit-box', P = 'section[data-menu="plan"]', E = 'section[data-menu="etc"]', PC = 'section[data-menu="purchase"]';

await run('background-jobs', [
  ['단원평가 채점: 다른 메뉴(기타)로 가도 이어서 채점, 돌아오면 「채점하는 중」·끝나면 결과가 그 평가에', async () => {
    await goTo('evaluate', 'unit');
    await page.click(`${U} [data-un-open="${seed.A}"]`);
    await page.setInputFiles(`${U} #unAnsFile`, ansFiles);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3);
    await page.click(`${U} [data-un="toGrade"]`);
    delay = 900;
    await page.click(`${U} [data-un="grade"]`);
    await until(() => n('unit') >= 1, 4000, '채점 시작');
    await goTo('etc', 'message');
    assert(await dots() === 'evaluate', '세로 메뉴 「평가」에 일하는 중 점이 없음: ' + await dots());
    assert((await page.getAttribute('nav.app-side [data-menu-go="evaluate"]', 'title')).includes('AI가 일하는 중'), '점 설명');
    await page.waitForTimeout(200);
    await goTo('evaluate', 'unit');
    assert(await dots() === '', '보는 메뉴에도 점: ' + await dots());
    assert(await page.isVisible(`${U} [data-un="stop"]`), '돌아왔는데 「채점하는 중·멈추기」가 없음: ' + (await page.textContent(U)).slice(0, 200));
    await goTo('plan', 'year');
    await until(async () => { const x = await ls('ssam:unit:t:' + seed.A); return x.students.every(s => s.status === 'done'); }, 15000, '채점이 끝나지 않음(다른 메뉴에서 멈춤?)');
    assert(n('unit') === 3, '채점 요청 ' + n('unit'));
    await until(async () => await dots() === '', 3000, '다 끝났는데 점이 남음');
    const b = await ls('ssam:unit:t:' + seed.B);
    assert(!b.students.length, '다른 평가에 결과가 들어감');
    delay = 0;
    await goTo('evaluate', 'unit');
    await page.waitForSelector(`${U} [data-cell="1-1"]`);
    assert((await page.textContent(`${U} [data-strow="3"]`)).includes('100/100'), '돌아와도 결과 표가 없음');
    assert(!(await page.isVisible(`${U} [data-un="stop"]`)), '끝났는데 「채점하는 중」');
    await page.click(`${U} [data-un="back"]`);
  }],
  ['단원평가 잘한 점·격려: 쓰는 동안 다른 평가를 열고 다른 메뉴로 가도, 글은 시작한 평가에', async () => {
    await page.click(`${U} [data-un-open="${seed.A}"]`);
    await page.click(`${U} .steps [data-step="4"]`);
    await page.waitForSelector(`${U} [data-un="fbAI"]`);
    delay = 1000;
    await page.click(`${U} [data-un="fbAI"]`);
    await until(() => n('unitFb') >= 1, 4000, '피드백 시작');
    await page.click(`${U} [data-un="back"]`);
    await page.click(`${U} [data-un-open="${seed.B}"]`);
    await goTo('class', 'today');
    await until(() => waiting === 0, 8000, '피드백');
    await page.waitForTimeout(200);
    const a = await ls('ssam:unit:t:' + seed.A);
    assert(a.students.every(s => s.good.startsWith('잘한점-' + s.no)), '시작한 평가에 글이 없음: ' + JSON.stringify(a.students.map(s => s.good)));
    await goTo('evaluate', 'unit');
    assert((await page.textContent(`${U} .un-title`)) !== '' && !(await page.isVisible(`${U} [data-un="fbAI"]`)), '다른 평가 화면이 아님');
    await page.click(`${U} [data-un="back"]`);
    await page.click(`${U} [data-un-open="${seed.A}"]`);
    await page.click(`${U} .steps [data-step="4"]`);
    await page.waitForSelector(`${U} [data-un="fbAI"]`);
    assert((await page.textContent(`${U} .un-fbs`)).includes('잘한점-1') && !(await page.textContent(`${U} [data-un="fbAI"]`)).includes('쓰는 중'), '돌아와도 글이 안 보임');
    delay = 0;
    await page.click(`${U} [data-un="back"]`);
  }],
  ['단원평가 답안 스캔 나누기: 읽는 동안 다른 메뉴에 갔다 와도 「읽는 중」, 끝나면 학생별로', async () => {
    await page.click(`${U} [data-un-open="${seed.B}"]`);
    await page.waitForSelector(`${U} #unAnsFile`, { state: 'attached' });
    await slowPages(1500);
    await page.setInputFiles(`${U} #unAnsFile`, ansFiles);
    await page.waitForFunction(s => (document.querySelector(`${s} #unAnsMsg`) || {}).textContent, U);
    await goTo('purchase');
    await goTo('evaluate', 'unit');
    assert((await page.textContent(`${U} #unAnsMsg`)).includes('읽는 중'), '돌아왔는데 「읽는 중」이 없음: ' + await page.textContent(`${U} #unAnsMsg`));
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3, null, { timeout: 8000 });
    assert((await ls('ssam:unit:t:' + seed.B)).students.length === 3, '다른 평가에 나뉨');
    await slowPages(0);
    await page.click(`${U} [data-un="back"]`);
  }],
  ['활동지: 한꺼번에 넣기 읽는 동안·기준 AI가 만드는 동안 다른 메뉴에 갔다 와도 「읽는 중」·「만들고 있어요」, 끝나면 기준', async () => {
    const A = 'section[data-menu="evaluate"] .act-box';
    await goTo('evaluate', 'activity');
    await page.click(`${A} [data-ac="new"]`);
    await page.waitForSelector(`${A} [data-bundle-pick="act"]`);
    await slowPages(1500);
    await page.setInputFiles('#bundleFile-act', { name: '물의 여행.png', mimeType: 'image/png', buffer: ansFiles[0].buffer });
    await page.waitForFunction(s => (document.querySelector(`${s} [data-bundle-msg="act"]`) || {}).textContent, A);
    await goTo('plan', 'class');
    await goTo('evaluate', 'activity');
    assert((await page.textContent(`${A} [data-bundle-msg="act"]`)).includes('읽는 중'), '돌아왔는데 「읽는 중」이 없음');
    await page.waitForFunction(() => /넣었어요/.test((document.querySelector('#toast') || {}).textContent || ''), null, { timeout: 8000 });
    await slowPages(0);
    assert(!(await page.textContent(`${A} [data-bundle-msg="act"]`)), '다 읽었는데 「읽는 중」');
    delay = 1200;
    await page.click(`${A} [data-ac="next"]`);
    await until(() => n('actCrit') >= 1, 4000, '기준 시작');
    await goTo('etc', 'gongmun');
    await goTo('evaluate', 'activity');
    assert((await page.textContent(A)).includes('AI가 기준을 만들고 있어요'), '돌아왔는데 「만들고 있어요」가 없음');
    await until(() => waiting === 0, 8000, '기준');
    await page.waitForFunction(s => document.querySelectorAll(`${s} #actItems tbody tr`).length === 1, A, { timeout: 4000 });
    delay = 0;
    await page.click(`${A} [data-ac="back"]`);
  }],
  ['평가지 채점: 계획 메뉴에 있는 동안 채점·평어를 마치고, 돌아오면 결과', async () => {
    await goTo('evaluate', 'gr');
    await page.waitForSelector('#grDrop');
    const [c1] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-gr="critImg"]')]);
    await c1.setFiles([join(FIXTURES, 'sheet-2.png')]);
    await page.waitForFunction(() => document.querySelectorAll('#grCritBox .chip').length === 1);
    const [c2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
    await c2.setFiles([join(FIXTURES, 'sheet-1.png'), join(FIXTURES, 'sheet-2.png'), join(FIXTURES, 'sheet-3.png')]);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 3명'));
    await page.fill('#grTitle', '세 자리 수 덧셈'); await page.dispatchEvent('#grTitle', 'input');
    delay = 700;
    await page.click('[data-gr="start"]');
    await until(() => n('gr') >= 1, 4000, '채점 시작');
    await goTo('plan', 'event');
    await until(() => n('gr') >= 3 && waiting === 0, 15000, '채점이 다른 메뉴에서 멈춤');
    await page.waitForTimeout(1500); // 평어까지
    await goTo('evaluate', 'gr');
    await page.waitForFunction(() => /채점과 평어를 마쳤어요|3\/3명 채점함/.test(document.querySelector('#grResults').textContent), null, { timeout: 15000 });
    assert((await page.textContent('#grResults')).includes('수를 바르게 계산하고'), '평어가 없음');
    delay = 0;
  }],
  ['교과 평어: 만드는 동안 다른 메뉴에서도 머리 줄 「평어 n / m」이 보이고, 돌아오면 문장', async () => {
    await goTo('evaluate', 'pyeongeo');
    await page.click('#srcPaste');
    await page.fill('#pasteBox', await page.getAttribute('#pasteBox', 'placeholder'));
    await page.click('#pasteGo');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#units .unit');
    await page.click('#units .unit');
    delay = 500;
    await page.click('#pane [data-act="genUnit"]');
    await until(() => n('py') >= 1, 4000, '평어 시작');
    await goTo('etc', 'message');
    assert(await page.isVisible('#genPill') && await page.isVisible('#genSpin') && /평어 [\d,]+ \/ [\d,]+/.test(await page.textContent('#genText')), '다른 메뉴에서 「평어 만드는 중」이 안 보임');
    await until(() => waiting === 0 && n('py') >= 4, 15000, '평어가 다른 메뉴에서 멈춤');
    await page.waitForTimeout(600);
    await goTo('evaluate', 'pyeongeo');
    await page.waitForFunction(() => document.querySelectorAll('#listBox li.sent').length >= 10, null, { timeout: 5000 });
    delay = 0;
  }],
  ['행동특성: [메모 있는 학생 모두 만들기] 뒤 학급 메뉴로 가도 이어서, 돌아오면 학생마다 제 글', async () => {
    await goTo('evaluate', 'hk');
    await page.waitForSelector('#hkList [data-hk="all"]');
    delay = 700;
    await page.click('#hkList [data-hk="all"]');
    await until(() => n('hk') >= 1, 4000, '만들기 시작');
    await goTo('class', 'today');
    await page.waitForTimeout(200);
    await goTo('evaluate', 'hk');
    assert((await page.locator('#hkList .hk-stu .spin').count()) > 0, '돌아왔는데 쓰는 중 표시가 없음');
    await goTo('class', 'weekly');
    await until(() => n('hk') >= 3 && waiting === 0, 15000, '다른 메뉴에서 멈춤');
    await page.waitForTimeout(800); // 저장(0.5초 뒤)
    const hk = await ls('ssam:hk');
    for (const s of hk.students) assert(s.results.length === 2 && s.results.every(r => r.t.includes('-' + 'ABC'[s.no - 1])), `${s.no}번 글: ${JSON.stringify(s.results.map(r => r.t.slice(0, 12)))}`);
    await goTo('evaluate', 'hk');
    assert((await page.textContent('#hkList')).includes('완료 0 / 3') && (await page.locator('#hkList .hk-stu .spin').count()) === 0, '돌아와도 쓰는 중');
    assert((await page.textContent('#hkEditor')).includes('후보1-'), '글이 안 보임');
    delay = 0;
  }],
  ['행사계획 문서: 쓰는 동안 다른 행사를 열고 다른 메뉴로 가도, 문서는 시작한 행사에', async () => {
    await goTo('plan', 'event');
    await page.waitForSelector(`${P} [data-e="docs"]`);
    delay = 900;
    await page.click(`${P} [data-e="docs"]`);
    await until(() => n('eventDocs') >= 1, 4000, '문서 시작');
    await page.click(`${P} [data-ev="${seed.evB}"]`);
    await goTo('purchase');
    await until(() => waiting === 0, 8000, '문서');
    await page.waitForTimeout(200);
    const docsOf = id => page.evaluate(async id => { const m = await import('./menus/plan/event-model.js'); return m.getEvent(id).docs; }, id);
    assert((await docsOf(seed.evA)).plan.includes('운영 방침'), '시작한 행사에 문서가 없음');
    assert(!(await docsOf(seed.evB)).plan, '다른 행사에 문서가 들어감');
    await goTo('plan', 'event');
    assert(await page.isVisible(`${P} [data-e="docs"]`), '다른 행사 화면이 아님');
    await page.click(`${P} [data-ev="${seed.evA}"]`);
    await page.waitForSelector(`${P} textarea[data-docf]`);
    assert((await page.inputValue(`${P} textarea[data-docf]`)).includes('운영 방침'), '돌아와도 문서가 안 보임');
    delay = 0;
  }],
  ['가정통신문 쓰기: 쪽지 탭·품의 메뉴로 갔다 와도 「쓰는 중」, 끝나면 쓴 글', async () => {
    await goTo('etc', 'letter');
    await page.waitForSelector(`${E} #lfMemo`);
    await page.fill(`${E} #lfMemo`, '11월 12일 3학년 현장체험학습. 도시락 준비.');
    delay = 1200;
    await page.click(`${E} [data-lf="write"]`);
    await until(() => n('letter') >= 1, 4000, '쓰기 시작');
    await goTo('etc', 'message');
    await goTo('purchase');
    assert(await dots() === 'etc', '세로 메뉴 「기타」에 점이 없음: ' + await dots());
    await goTo('etc', 'letter');
    assert((await page.textContent(`${E} [data-lf="write"]`)).includes('쓰는 중'), '돌아왔는데 「쓰는 중」이 없음');
    await goTo('class', 'today');
    await until(() => waiting === 0, 8000, '가정통신문');
    await page.waitForTimeout(200);
    await goTo('etc', 'letter');
    await page.waitForSelector(`${E} [data-lo="title"]`);
    assert(await page.inputValue(`${E} [data-lo="title"]`) === '가을 현장체험학습 안내', '쓴 글이 안 보임');
    assert(!(await page.textContent(`${E} [data-lf="write"]`)).includes('쓰는 중'), '끝났는데 「쓰는 중」');
    delay = 0;
  }],
  ['품의 초안: 다른 메뉴로 가도 이어서, 돌아오면 초안', async () => {
    await goTo('purchase');
    await page.waitForSelector(`${PC} #pcIntake`);
    await page.click(`${PC} [data-pc="fresh"]`).catch(() => {});
    await page.waitForSelector(`${PC} #pcIntake`);
    await page.fill(`${PC} #pcIntake`, '알코올램프 10개 5000원');
    delay = 1000;
    await page.click(`${PC} [data-pc="go"]`);
    await until(() => n('pcDraft') >= 1, 4000, '초안 시작');
    await goTo('settings', 'ai');
    assert(await dots() === 'purchase', '세로 메뉴 「품의」에 점이 없음: ' + await dots());
    await goTo('purchase');
    assert((await page.textContent(`${PC} [data-pc="go"]`)).includes('쓰는 중'), '돌아왔는데 「쓰는 중」이 없음');
    await goTo('evaluate', 'unit');
    await until(() => waiting === 0, 8000, '초안');
    await page.waitForTimeout(200);
    await goTo('purchase');
    await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value === '과학 실험 재료 구입', PC);
    delay = 0;
  }],
  ['품의 견적서 읽기(AI): 읽는 동안 다른 메뉴에 갔다 와도 「읽는 중」, 끝나면 품목', async () => {
    await goTo('purchase');
    await page.click(`${PC} [data-pc="fresh"]`).catch(() => {});
    await page.waitForSelector(`${PC} #pcIntake`);
    delay = 1200;
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${PC} [data-pc="intakeFile"]`)]);
    await fc.setFiles(join(FIXTURES, 'photo-1.jpg'));
    await until(() => n('pcIntake') >= 1, 6000, '견적서 읽기 시작');
    await goTo('class', 'progress');
    await goTo('purchase');
    assert((await page.textContent(`${PC} #pcIntakeMsg`)).includes('읽는 중'), '돌아왔는데 「읽는 중」이 없음: ' + await page.textContent(`${PC} #pcIntakeMsg`));
    await until(() => waiting === 0, 8000, '견적서');
    await page.waitForFunction(s => [...document.querySelectorAll(`${s} [data-f="name"]`)].some(i => i.value === '색종이'), PC);
    assert(!(await page.textContent(`${PC} #pcIntakeMsg`)).includes('읽는 중'), '끝났는데 「읽는 중」');
    delay = 0;
  }],
  ['쪽지: 가정통신문 탭·계획 메뉴로 가도 이어서 쓰고, 돌아오면 칸·본문', async () => {
    await goTo('etc', 'message');
    await page.waitForSelector(`${E} #msgPaste`);
    await page.fill(`${E} #msgPaste`, '2026 AI 활용 수업 연수 안내\n일시: 2026. 11. 12. 15:00\n장소: 시청각실');
    delay = 1200;
    await page.click(`${E} [data-msg="read"]`);
    await until(() => n('message') >= 1, 4000, '쪽지 시작');
    await goTo('etc', 'letter');
    await goTo('plan', 'report');
    await goTo('etc', 'message');
    assert((await page.textContent(`${E} [data-msg="read"]`)).includes('읽는 중'), '돌아왔는데 「읽는 중」이 없음');
    await goTo('plan', 'year');
    await until(() => waiting === 0, 8000, '쪽지');
    await page.waitForTimeout(200);
    await goTo('etc', 'message');
    await page.waitForFunction(s => (document.querySelector(`${s} [data-mf="title"]`) || {}).value === 'AI 활용 수업 연수', E);
    assert((await page.inputValue(`${E} #msgBody`)).includes('시청각실'), '본문');
    delay = 0;
  }],
  ['연간계획 초안: 쓰는 동안 다른 메뉴에 갔다 와도 「쓰고 있어요」, 끝나면 초안', async () => {
    await goTo('plan', 'year');
    await page.waitForSelector(`${P} [data-y="draft"]`);
    delay = 1200;
    await page.click(`${P} [data-y="draft"]`);
    await until(() => n('yearDraft') >= 1, 4000, '초안 시작');
    await goTo('class', 'weekly');
    await goTo('plan', 'year');
    assert((await page.textContent(`${P} .yp-box`)).includes('초안을 쓰고 있어요'), '돌아왔는데 「쓰고 있어요」가 없음');
    await goTo('etc', 'letter');
    assert(await dots() === 'plan', '세로 메뉴 「계획」에 점이 없음: ' + await dots());
    await until(() => waiting === 0, 8000, '초안');
    await page.waitForTimeout(200);
    await goTo('plan', 'year');
    await page.waitForSelector(`${P} textarea[data-sec="purpose"]`);
    assert((await page.inputValue(`${P} textarea[data-sec="purpose"]`)).includes('탐구하는 즐거움'), '초안이 안 보임');
    delay = 0;
  }],
  ['공문 처리: AI가 읽는 동안 다른 메뉴에 갔다 와도 이어서, 끝나면 기한·할 일', async () => {
    await goTo('etc', 'gongmun');
    await page.waitForSelector(`${E} #gmPaste`);
    await page.fill(`${E} #gmPaste`, '○○교육지원청\n제목 2026 과학의 날 운영 안내\n1. 11. 20.(금)까지 참가 학생을 조사하여 회신');
    delay = 1200;
    await page.click(`${E} [data-gm="paste"]`);
    await until(() => n('gongmun') >= 1, 4000, '공문 시작');
    await goTo('purchase');
    await goTo('etc', 'gongmun');
    assert((await page.textContent(`${E} #gmLists`)).includes('AI가 읽는 중'), '돌아왔는데 「읽는 중」이 없음');
    await goTo('settings', 'screen');
    await until(() => waiting === 0, 8000, '공문');
    await page.waitForTimeout(200);
    await goTo('etc', 'gongmun');
    assert((await page.textContent(`${E} #gmLists`)).includes('참가 학생 조사'), '할 일이 안 보임');
    delay = 0;
  }],
  ['인수인계서 [AI로 정리]: 창을 닫고 다른 메뉴에 갔다 와서 다시 열어도 「정리하는 중」, 끝나면 정리한 글(고쳐도 남음)', async () => {
    await goTo('settings', 'years');
    await page.click('section[data-menu="settings"] [data-set="handover"]');
    await page.waitForSelector('#sheetRoot .ho-sheet #hoAi');
    delay = 1500;
    await page.click('#sheetRoot #hoAi');
    await until(() => n('handover') >= 1, 4000, '정리 시작');
    await page.click('#sheetRoot .ho-sheet [data-close]');
    await goTo('etc', 'gongmun');
    assert(await dots() === 'settings', '세로 메뉴 「설정」에 점이 없음: ' + await dots());
    await goTo('settings', 'years');
    await page.click('section[data-menu="settings"] [data-set="handover"]');
    await page.waitForSelector('#sheetRoot .ho-sheet #hoAi');
    assert(await page.isDisabled('#sheetRoot #hoAi') && (await page.textContent('#sheetRoot #hoAi')).includes('정리하는 중'), '다시 연 창에 「정리하는 중」이 없음');
    await until(() => waiting === 0, 8000, '정리');
    await page.waitForFunction(() => (document.querySelector('#sheetRoot #hoNote') || {}).value?.includes('과학 교육 계획부터'), null, { timeout: 3000 });
    assert(!(await page.isDisabled('#sheetRoot #hoAi')), '끝났는데 단추가 막힘');
    // 다시 연 창에서 고르기를 바꿔도 정리한 글이 옛 글로 덮이지 않음
    await page.locator('#sheetRoot [data-ho-pick]').first().click();
    const saved = await page.evaluate(async () => (await import('./menus/settings/handover-model.js')).getSaved().note);
    assert(saved.includes('과학 교육 계획부터'), '정리한 글이 덮임: ' + saved);
    await page.click('#sheetRoot .ho-sheet [data-close]');
    delay = 0;
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
