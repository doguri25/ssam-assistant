// 계획서를 학교 계획서 양식(.hwpx)으로 내려받기: 내려받기 단추 옆 [학교 양식 넣기] → 「양식」 고르기 → [학교 양식으로 한글 내려받기]가
// 그 양식(머리·결재란 그대로)의 제목·본문 자리에 계획서를 채움. 연간계획·행사계획·학급운영계획
import { open, run, assert } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2027-01-12T09:00:00'));
const Y = 'section[data-menu="plan"]';
// 지어낸 학교 계획서 양식: 제목, 결재란 표, 옛 본문 두 줄, 날짜, 학교장
const FORM = Buffer.from(makeHwpx({ title: '새싹초 업무 계획서', blocks: [
  { type: 'table', rows: [['결재', '담당', '부장', '교감']] }, { type: 'p', text: '옛 본문: 목적을 적어요' }, { type: 'p', text: '옛 본문: 추진 내용을 적어요' },
  { type: 'p', text: '2026. 3. 2.' }, { type: 'p', text: '새싹초등학교장' }] }));
await page.goto(url);
await page.waitForTimeout(400);
const YP = await page.evaluate(async () => {
  const y = await import('./menus/plan/year-model.js');
  const LAST = 'Ⅰ. 추진 근거\nⅡ. 목적\nⅢ. 세부 추진 내용\nⅣ. 추진 일정';
  const o = y.yearOutline(LAST);
  const p = y.savePlan({ ...y.newPlan(), year: 2027, name: '독서교육', goal: '독서 습관', step: 5, maxStep: 5, sources: { lastPlan: LAST, lastResult: '', guide: '' },
    draft: y.normDraft({ purpose: '책을 즐겨 읽는 습관을 기른다.', details: '1. 아침 독서', x1: '독서교육 기본계획', schedule: [{ title: '계획 수립', date: '2027-03-10' }], outline: o.items, roman: o.roman }) });
  y.setCurrent(p.id);
  return p.id;
});
const toStep5 = async () => {
  await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'year')));
  await page.waitForSelector(`${Y} ol.steps`);
  // 화면이 먼저 만든 새 계획이 아니라 넣어 둔 계획을 엶(지난 계획 목록)
  await page.click(`${Y} [data-yp="${YP}"]`);
  if (!(await page.textContent(`${Y} ol.steps [aria-current="step"]`)).includes('일정')) await page.click(`${Y} ol.steps [data-step="5"]`);
  await page.waitForSelector(`${Y} .sf-slot[data-sf="year"]`, { state: 'attached' });
};
await toStep5();

await run('plan-form', [
  ['연간계획 5단계: 내려받기 옆 [학교 양식 넣기](양식이 없으면 고르기 칸은 없음)', async () => {
    await page.waitForSelector(`${Y} [data-sf-add="year"]`);
    assert(await page.locator(`${Y} select[data-sf-pick]`).count() === 0, '양식이 없는데 고르기 칸');
    assert(await page.locator(`${Y} .sf-slot [data-y="hwpx"]`).count() === 1, '기본 내려받기 단추');
  }],
  ['양식(.hwpx)을 넣으면 그 양식이 골라지고 [학교 양식으로 한글 내려받기] → 양식의 제목·본문 자리에 계획서(작년 차례 그대로)', async () => {
    const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${Y} [data-sf-add="year"]`)]);
    await ch.setFiles({ name: '새싹초 계획서 양식.hwpx', mimeType: 'application/octet-stream', buffer: FORM });
    await page.waitForSelector(`${Y} [data-sf-export="year"]`);
    const sel = await page.$eval(`${Y} select[data-sf-pick="year"]`, s => s.options[s.selectedIndex].textContent);
    assert(sel === '새싹초 계획서 양식', sel);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${Y} [data-sf-export="year"]`)]);
    assert(dl.suggestedFilename() === '2027학년도 독서교육 운영 계획.hwpx', dl.suggestedFilename());
    const buf = await (async () => { const s = await dl.createReadStream(); const parts = []; for await (const c of s) parts.push(c); return Buffer.concat(parts); })();
    const lines = await page.evaluate(async b64 => {
      const u8 = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const f = await (await import('./core/hwpx-form.js')).readForm(u8);
      return f.lines.map(l => l.text);
    }, buf.toString('base64'));
    const all = lines.join('\n');
    assert(all.includes('2027학년도 독서교육 운영 계획') && all.includes('Ⅰ. 추진 근거') && all.includes('Ⅱ. 목적') && all.includes('책을 즐겨 읽는 습관을 기른다.'), all.slice(0, 400));
    assert(all.includes('새싹초등학교장'), '양식의 학교장 줄이 남아야 함: ' + JSON.stringify(lines));
    assert(!all.includes('옛 본문'), '옛 본문이 남음');
  }],
  ['「쌤비서 기본 문서」로 바꾸면 기본 내려받기 단추, 고른 것은 다시 열어도 기억', async () => {
    await page.selectOption(`${Y} select[data-sf-pick="year"]`, '');
    await page.waitForSelector(`${Y} .sf-slot [data-y="hwpx"]`);
    await page.selectOption(`${Y} select[data-sf-pick="year"]`, { label: '새싹초 계획서 양식' });
    await page.reload(); await page.waitForTimeout(400);
    await toStep5();
    await page.waitForSelector(`${Y} [data-sf-export="year"]`);
  }],
  ['학급운영계획·행사계획 내려받기 줄에도 같은 칸(같은 양식 목록)', async () => {
    const [CP, EV] = await page.evaluate(async () => {
      const c = await import('./menus/plan/classplan-model.js');
      const p = c.newPlan(); p.outline = [{ id: 's1', title: '학급 현황', level: 1 }]; p.draft = { s1: '3학년 1반 20명' }; p.step = 4; p.maxStep = 4;
      const sp = c.savePlan(p); c.setCurrent(sp.id);
      const m = await import('./menus/plan/event-model.js');
      const e = m.saveEvent({ ...m.newEvent(), name: '가을 운동회', grades: '3~6학년', date: '2027-05-06', place: '운동장', step: 3, maxStep: 3, docs: { plan: 'Ⅰ. 개요', safety: '- 안전', letter: '날짜 준비물 복장 문의', rain: '', done: false } });
      m.setCurrentEvent(e.id);
      return [sp.id, e.id];
    });
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'class')));
    await page.waitForSelector(`${Y} [data-cp="${CP}"]`, { state: 'attached' });
    await page.$eval(`${Y} [data-cp="${CP}"]`, b => b.click());
    await page.evaluate(n => { const b = [...document.querySelectorAll('section[data-menu="plan"] ol.steps [data-step="' + n + '"]')].find(x => x.checkVisibility()); if (b) b.click(); }, '4');
    await page.waitForSelector(`${Y} .sf-slot[data-sf="classplan"] select[data-sf-pick]`, { timeout: 8000 });
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'event')));
    await page.waitForSelector(`${Y} [data-ev="${EV}"]`, { state: 'attached' });
    await page.$eval(`${Y} [data-ev="${EV}"]`, b => b.click());
    await page.evaluate(n => { const b = [...document.querySelectorAll('section[data-menu="plan"] ol.steps [data-step="' + n + '"]')].find(x => x.checkVisibility()); if (b) b.click(); }, '3');
    await page.waitForSelector(`${Y} .sf-slot[data-sf="event"] select[data-sf-pick]`, { timeout: 8000 });
    const opts = await page.$$eval(`${Y} .sf-slot[data-sf="event"] select[data-sf-pick] option`, os => os.map(o => o.textContent));
    assert(opts.join('|') === '쌤비서 기본 문서|새싹초 계획서 양식', opts.join('|'));
  }],
  ['390px: 내려받기 줄이 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]);
    assert(w[0] <= 390 && w[1] <= w[2] + 1, w.join(','));
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
