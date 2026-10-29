// 연간계획 최종 검토 고침: 날짜 키보드 입력, 파일 읽는 중 계획 바꾸기, 아주 긴 붙여넣기, AI가 끝날 때 입력 끊김, 계획 지우기
import { open, run, assert, mockClaude } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, url, errors } = t;
let slow = 0;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async () => {
  if (slow) await new Promise(r => setTimeout(r, slow));
  return JSON.stringify({ purpose: '목적', policy: '방침', details: '세부', evaluation: '평가', schedule: [{ title: '행사', date: '2027-10-06' }], budget: [] });
});
const Y = 'section[data-menu="plan"]';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="year"]'); };
// 계획을 바로 저장해 두고 그 계획을 엶 (화면이 미뤄 둔 저장을 먼저 써서 나중에 덮지 않게)
const seed = (plans, cur) => page.evaluate(async ([plans, cur]) => {
  (await import('./core/store.js')).flushAll();
  const m = await import('./menus/plan/year-model.js');
  const ids = plans.map(p => m.savePlan({ ...m.newPlan(), ...p }).id);
  m.setCurrent(ids[cur]);
  return ids;
}, [plans, cur]);
const D = { purpose: '목적', policy: '방침', details: '세부', evaluation: '평가', schedule: [{ title: '행사', date: '2027-10-06' }], budget: [] };
await page.goto(url);
await page.waitForTimeout(400);

await run('year-plan-fixes', [
  ['날짜를 키보드로 치면 끝까지 쳐지고 맞는 날짜가 저장됨', async () => {
    await seed([{ name: '날짜 시험', goal: 'g', draft: D, step: 5, maxStep: 5 }], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    const sel = `${Y} #ypDays tr[data-i="0"] input[data-date]`;
    await page.click(sel);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('11062027', { delay: 60 });
    await page.waitForTimeout(200);
    assert(await page.inputValue(sel) === '2027-11-06', '값: ' + await page.inputValue(sel));
    assert(await page.evaluate(s => document.activeElement === document.querySelector(s), sel), '포커스를 잃음');
    const saved = await page.evaluate(async () => (await import('./menus/plan/year-model.js')).listPlans()[0].draft.schedule[0].date);
    assert(saved === '2027-11-06', '저장: ' + saved);
  }],
  ['파일을 읽는 동안 다른 계획으로 가도 글은 처음 계획에 들어감', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
    const [a, b] = await seed([{ name: '계획 가' }, { name: '계획 나' }], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.evaluate(() => { const f = window.SSAM.files.readHwpText; window.SSAM.files.readHwpText = async u8 => { await new Promise(r => setTimeout(r, 1200)); return f(u8); }; });
    const buf = Buffer.from(makeHwpx({ title: '가 계획서', blocks: [{ type: 'p', text: '가 계획의 글' }] }));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${Y} [data-file="lastPlan"]`)]);
    await fc.setFiles({ name: '가.hwpx', mimeType: 'application/octet-stream', buffer: buf });
    await page.click(`${Y} #ypList [data-yp="${b}"]`);
    await page.waitForTimeout(1800);
    const src = await page.evaluate(async ids => { const m = await import('./menus/plan/year-model.js'); return ids.map(id => m.getPlan(id).sources.lastPlan); }, [a, b]);
    assert(src[0].includes('가 계획의 글'), '가에 없음');
    assert(src[1] === '', '나에 들어감: ' + src[1].slice(0, 40));
    assert(await page.inputValue(`${Y} textarea[data-src="lastPlan"]`) === '', '보고 있는 나 화면에 보임');
  }],
  ['아주 긴 글을 붙여넣으면 6만 자까지만 받고 알려 줌', async () => {
    // 7만 자 붙여넣기는 3초쯤 걸려서, 컴퓨터가 바쁠 때 기본 8초를 넘기지 않게 넉넉히
    await page.fill(`${Y} textarea[data-src="lastResult"]`, '가나다라마 '.repeat(14000), { timeout: 30000 });
    await page.waitForTimeout(200);
    const len = (await page.inputValue(`${Y} textarea[data-src="lastResult"]`)).length;
    assert(len === 60000, '길이 ' + len);
    assert((await page.textContent(`${Y} #ypMain`)).includes('앞 6만 자만'), '알림 없음');
  }],
  ['AI가 끝날 때 다른 단계에서 치던 글이 끊기지 않음', async () => {
    const [id] = await seed([{ name: '입력 시험', goal: 'g', step: 4, maxStep: 4 }], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    slow = 1200;
    await page.click(`${Y} [data-y="draft"]`);
    await page.click(`${Y} ol.steps [data-step="1"]`);
    await page.click(`${Y} #ypOwner`);
    await page.keyboard.type('ABCDEFGHIJ', { delay: 220 });
    slow = 0;
    await page.waitForTimeout(500); // 치기를 멈추면 저장
    assert(await page.inputValue(`${Y} #ypOwner`) === 'ABCDEFGHIJ', '값: ' + await page.inputValue(`${Y} #ypOwner`));
    const p = await page.evaluate(async id => (await import('./menus/plan/year-model.js')).getPlan(id), id);
    assert(p.owner === 'ABCDEFGHIJ' && p.draft && p.draft.purpose === '목적', JSON.stringify({ owner: p.owner, draft: !!p.draft }));
  }],
  ['계획 지우기: 목록과 학사일정에서 빠짐', async () => {
    const [id] = await seed([{ name: '지울 계획', goal: 'g', draft: D, step: 5, maxStep: 5 }], 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.click(`${Y} [data-y="final"]`);
    assert(await page.evaluate(id => JSON.parse(localStorage.getItem('ssam:calendar')).some(e => e.source === 'year:' + id), id), '확정 일정 없음');
    await page.click(`${Y} [data-y="delete"]`);
    await page.click('#sheetRoot [data-y="deleteYes"]');
    assert(!(await page.textContent(`${Y} #ypList`)).includes('지울 계획'), '목록에 남음');
    assert(!(await page.evaluate(id => JSON.parse(localStorage.getItem('ssam:calendar') || '[]').some(e => e.source === 'year:' + id), id)), '학사일정에 남음');
  }],
  ['글자를 칠 때마다 계획 목록 전체를 다시 쓰지 않고, 멈추면 한 번 저장', async () => {
    const big = 'ㄱ'.repeat(40000);
    await seed(Array.from({ length: 6 }, (_, i) => ({ name: '긴 계획 ' + i, goal: 'g', sources: { last: big, guide: big }, step: 1, maxStep: 1 })), 0);
    await page.reload(); await page.waitForTimeout(400); await go();
    await page.evaluate(() => { window.__n = 0; const o = Storage.prototype.setItem; window.__o = o; Storage.prototype.setItem = function (k, v) { if (k === 'ssam:yearplans') window.__n++; return o.call(this, k, v); }; });
    await page.click(`${Y} #ypGoal`); await page.keyboard.press('End');
    await page.keyboard.type('를 이룬다', { delay: 30 });
    const during = await page.evaluate(() => window.__n);
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => window.__n);
    const goal = await page.evaluate(async () => { const m = await import('./menus/plan/year-model.js'); return m.getPlan(m.currentId()).goal; });
    assert(during <= 1 && after >= 1 && goal === 'g를 이룬다', `치는 동안 ${during}번, 뒤 ${after}번, 저장 「${goal}」`);
  }],
  ['치자마자 다른 메뉴로 가거나 창을 다시 열어도 친 글이 남음', async () => {
    await page.click(`${Y} #ypGoal`); await page.keyboard.press('End'); await page.keyboard.type(' 꼭');
    await page.click('nav.app-side [data-menu-go="class"]');
    let goal = await page.evaluate(async () => { const m = await import('./menus/plan/year-model.js'); return m.getPlan(m.currentId()).goal; });
    assert(goal.endsWith(' 꼭'), '메뉴: ' + goal);
    await go();
    await page.click(`${Y} #ypGoal`); await page.keyboard.press('End'); await page.keyboard.type('!');
    await page.reload(); await page.waitForTimeout(400);
    goal = await page.evaluate(async () => { const m = await import('./menus/plan/year-model.js'); return m.getPlan(m.currentId()).goal; });
    assert(goal.endsWith(' 꼭!'), '다시 열기: ' + goal);
  }],
  ['행사계획도 글자마다 목록 전체를 다시 쓰지 않음', async () => {
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
    await page.fill('section[data-menu="plan"] #evName', '운동회');
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__n = 0; const o = window.__o || Storage.prototype.setItem; window.__o = o; Storage.prototype.setItem = function (k, v) { if (k === 'ssam:events') window.__n++; return o.call(this, k, v); }; });
    await page.click('section[data-menu="plan"] #evPurpose');
    await page.keyboard.type('협동심 기르기', { delay: 30 });
    const during = await page.evaluate(() => window.__n);
    await page.waitForTimeout(700);
    const p = await page.evaluate(async () => { const m = await import('./menus/plan/event-model.js'); return m.getEvent(m.currentEventId()).purpose; });
    assert(during <= 1 && p === '협동심 기르기', `치는 동안 ${during}번, 저장 「${p}」`);
    await page.evaluate(() => { Storage.prototype.setItem = window.__o; });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
