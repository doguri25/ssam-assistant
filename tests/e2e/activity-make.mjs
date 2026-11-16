// 평가 › 활동지 › [활동지 만들기] (스펙 2026-11-15-docedit-minutes-quiz §3): 목록의 [활동지 만들기] → 진도표 교과·차시(다음 차시 기본) → [만들기](AI 업무 계획, 학생 자료 없음)
// → 열린 문항(쓰기·그리기·생각 정리) 카드와 ○·△ 기준, 빈 기준은 확인할 것, 활동 이름, [이 문항 다시 만들기]·[문항 더하기]·[빼기],
// [학생 활동지 내려받기](맨 위 「학년 반 번호 이름」 칸, 기준은 빼고), [이대로 활동지 만들기] → 기준이 확정된 새 활동지(3단계 학생 활동지)로 열림·채점 요청에 그 기준,
// 진도표 밖 「직접 쓰기」(교직원 이름은 가려 보내고 활동 이름·단원에는 원래 이름, 만든 활동지의 채점·기준 요청의 단원·활동 이름은 만들 때 가린 글), 학급 화면에는 단추가 없음, 390·360px 가로 넘침·겹침 없음. 학교·이름은 모두 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, enter, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-16T09:00:00'));
await page.addInitScript(() => {
  if (localStorage.getItem('ssam:__seeded')) return;
  localStorage.setItem('ssam:__seeded', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 1 }));
  const L = (unit, title, no, pages) => ({ week: null, period: '', from: '', unit, title, no, pages, memo: '' });
  localStorage.setItem('ssam:class:subjects', JSON.stringify([{ id: 'soc', name: '사회', start: '', offset: 2, total: null, lessons: [
    L('1. 우리 고장의 모습', '고장의 위치', '1/4', '10~11'), L('1. 우리 고장의 모습', '고장의 모습 그리기', '2/4', '12~13'),
    L('1. 우리 고장의 모습', '고장의 자랑거리', '3/4', '14~15'), L('1. 우리 고장의 모습', '고장 안내도 만들기', '4/4', '16~17')] }]));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  // 직접 쓴 범위에서 가린 이름(〔이름1〕)이 오면 활동 이름에 그 자리 표시를 그대로 씀
  if (prompt.startsWith('[활동지 만들기]')) return JSON.stringify({ title: prompt.includes('〔이름1〕') ? '〔이름1〕 선생님과 자랑거리 찾기' : '새싹마을 자랑거리', items: [
    { kind: 'write', ask: '우리 고장의 자랑거리 두 가지와 그 까닭을 쓰세요.', answer: '새싹시장 — 물건이 싱싱해서', ok: '자랑거리 두 가지와 까닭을 씀', part: '자랑거리만 쓰거나 하나만 씀' },
    { kind: 'draw', ask: '자랑거리 한 곳을 그려 보세요.', answer: '건물과 사람들', ok: '장소의 특징이 드러나게 자세히 그림', part: '' },
    { kind: 'think', ask: '자랑거리를 알리는 방법을 생각그물로 정리해 보세요.', answer: '포스터, 누리집', ok: '방법 세 가지 넘게 정리', part: '방법 하나만 정리' }] });
  if (prompt.startsWith('[활동지 문항 다시 만들기]')) return JSON.stringify({ item: { kind: 'draw', ask: '고장의 자랑거리를 알리는 포스터를 그려 보세요.', answer: '자랑거리 이름과 그림', ok: '이름·그림·알리는 말이 모두 있음', part: '그림만 있음' } });
  return '{}';
});
const V = 'section[data-menu="evaluate"] .act-box', MK = `${V} .act-page`;
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const cards = () => page.locator(`${MK} .mk-item`).count();
const dec = b => new TextDecoder().decode(b);
const acts = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:activity:list') || '[]')).map(s => JSON.parse(localStorage.getItem('ssam:activity:a:' + s.id))));
const overlaps = () => page.evaluate(() => {
  const sec = document.querySelector('section[data-menu="evaluate"] .act-page');
  const clip = e => {
    let r = e.getBoundingClientRect(), x = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); x = { l: Math.max(x.l, q.left), t: Math.max(x.t, q.top), r: Math.min(x.r, q.right), b: Math.min(x.b, q.bottom) }; }
    }
    return x;
  };
  const name = e => (e.getAttribute('aria-label') || e.textContent || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const els = [...sec.querySelectorAll('button, input:not([type=checkbox]), select, textarea, .chip')].filter(e => e.checkVisibility()).map(e => [e, clip(e)]).filter(([, x]) => x.r - x.l > 2 && x.b - x.t > 2);
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const [a, ra] = els[i], [b, rb] = els[j]; if (!a.contains(b) && !b.contains(a) && hit(ra, rb)) out.push(`${name(a)} × ${name(b)}`); }
  return out;
});
const wide = () => page.evaluate(() => {
  const vw = document.documentElement.clientWidth, out = [];
  for (const e of document.querySelectorAll('section[data-menu="evaluate"] .act-page *')) {
    if (!e.checkVisibility()) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.right > vw + 1) {
      let p = e.parentElement, scroll = false;
      for (; p; p = p.parentElement) if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= vw + 1) { scroll = true; break; }
      if (!scroll) out.push((e.className || e.tagName) + ':' + Math.round(r.right));
    }
  }
  return { out: out.slice(0, 5), page: document.scrollingElement.scrollWidth - vw };
});
await page.goto(url);
await page.waitForTimeout(400);

await run('activity-make', [
  ['학급 화면에는 만들기 단추가 없음', async () => {
    await enter(page, 'class', 'today');
    await page.waitForTimeout(200);
    assert(!(await page.$('section[data-menu="class"] [data-ac="make"], section[data-menu="class"] [data-un="make"]')), '학급 화면에 단추');
  }],
  ['평가 › 활동지 목록에 [활동지 만들기] → 고르기: 사회, 다음 차시(3/4 고장의 자랑거리), 문항 수 3, 종류 셋', async () => {
    await enter(page, 'evaluate', 'activity');
    await page.waitForSelector(`${V} [data-ac="make"]`);
    assert((await page.textContent(`${V} [data-ac="make"]`)).trim() === '활동지 만들기', '단추 이름');
    await page.click(`${V} [data-ac="make"]`);
    await page.waitForSelector(`${MK} #mkSub`);
    const checked = await page.$$eval(`${MK} [data-mp="lesson"]:checked`, a => a.map(x => x.value));
    assert(JSON.stringify(checked) === '["2"]', JSON.stringify(checked));
    assert(await page.inputValue(`${MK} #mkCount`) === '3', '문항 수');
    assert((await page.textContent(`${MK} .mk-kinds`)).replace(/\s+/g, '').includes('쓰기그리기생각정리'), '종류');
  }],
  ['[만들기] → 요청(범위·학년·종류, 학생 자료 없음) → 카드 3개·활동 이름, 빈 △ 기준은 확인할 것 → 채우면 사라짐', async () => {
    await page.click(`${MK} [data-mk="make"]`);
    await until(async () => await cards() === 3);
    const p = prompts.find(x => x.startsWith('[활동지 만들기]'));
    assert(p.includes('사회 · 3학년') && p.includes('고장의 자랑거리') && p.includes('14~15쪽') && p.includes('쓰기 1문항') && p.includes('그리기 1문항') && p.includes('생각 정리 1문항'), p.slice(0, 400));
    assert(!/김하늘|이바다|한가람/.test(p), '학생 자료');
    assert(await page.inputValue(`${MK} #mkTitle`) === '새싹마을 자랑거리', '활동 이름');
    assert(await page.inputValue(`${MK} [data-mk-item="2"] [data-mf="kind"]`) === 'draw' && await page.inputValue(`${MK} [data-mk-item="3"] [data-mf="kind"]`) === 'think', '종류');
    assert((await page.textContent(`${MK} [data-mk-warn="2"]`)).includes('△'), '2번 확인할 것');
    await page.fill(`${MK} [data-mk-item="2"] [data-mf="part"]`, '장소만 간단히 그림');
    assert((await page.textContent(`${MK} [data-mk-warn="2"]`)).trim() === '' && await page.isHidden(`${MK} #mkProbs`), '확인할 것 사라짐');
  }],
  ['[이 문항 다시 만들기](2번) → 요청에 2번·그리기·다른 문항 → 바뀐 문항 / [문항 더하기]·[빼기]', async () => {
    await page.click(`${MK} [data-mk="redo"][data-no="2"]`);
    await until(async () => (await page.inputValue(`${MK} [data-mk-item="2"] [data-mf="ask"]`)).includes('포스터'));
    const p = prompts.find(x => x.startsWith('[활동지 문항 다시 만들기]'));
    assert(p.includes('2번') && p.includes('그리기') && p.includes('우리 고장의 자랑거리 두 가지와 그 까닭을 쓰세요.'), p.slice(0, 300));
    await page.click(`${MK} [data-mk="add"]`);
    await until(async () => await cards() === 4);
    await page.click(`${MK} [data-mk="del"][data-no="4"]`);
    await until(async () => await cards() === 3);
  }],
  ['[학생 활동지 내려받기]: 한글 — 맨 위 「학년 반 번호 이름」 칸·활동 이름·묻는 말, 기준·예시 답안은 없음', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${MK} [data-mk="sheet"]`)]);
    assert(dl.suggestedFilename() === '새싹마을 자랑거리 학생 활동지.hwpx', dl.suggestedFilename());
    const s = dec((await unzip(new Uint8Array(readFileSync(await dl.path())))).get('Contents/section0.xml'));
    const at = w => s.indexOf(`<hp:t>${w}</hp:t>`);
    assert(at('번호') > 0 && at('이름') > at('번호') && at('새싹마을 자랑거리') > at('이름'), '이름 칸이 맨 위');
    assert(s.includes('1. 우리 고장의 자랑거리 두 가지와 그 까닭을 쓰세요.') && s.includes('2. 고장의 자랑거리를 알리는 포스터를 그려 보세요.'), '묻는 말');
    assert(!s.includes('자랑거리 두 가지와 까닭을 씀') && !s.includes('새싹시장'), '기준·예시 답안이 활동지에');
  }],
  ['[이대로 활동지 만들기] → 새 활동지가 3단계(학생 활동지)로 열림, 기준 확정·출처 AI·활동지 글, 채점 요청에 ○·△ 기준', async () => {
    await page.click(`${MK} [data-mk="create"]`);
    await page.waitForFunction(s => { const c = document.querySelector(`${s} .steps li.cur`); return c && c.textContent.includes('학생 활동지'); }, V);
    assert((await page.textContent(`${V} .un-title`)).trim() === '새싹마을 자랑거리', await page.textContent(`${V} .un-title`));
    const [a] = await acts();
    assert(a && a.confirmed === true && a.items.length === 3, JSON.stringify(a && a.items).slice(0, 200));
    assert(a.items[1].type === 'draw' && a.items[1].src === 'ai' && a.items[1].ok === '이름·그림·알리는 말이 모두 있음' && a.items[2].type === 'write', JSON.stringify(a.items[1]));
    assert(a.meta.subject === '사회' && a.meta.unit === '1. 우리 고장의 모습' && a.meta.lesson === '3' && a.meta.pages === '14~15쪽' && a.meta.term === 2, JSON.stringify(a.meta));
    assert(a.sheet.student.includes('1. 우리 고장의 자랑거리 두 가지와 그 까닭을 쓰세요.'), a.sheet.student);
    const g = await page.evaluate(async id => { const m = await import('./menus/evaluate/activity/activity-ai.js'), am = await import('./menus/evaluate/activity/activity-model.js'); return m.gradePrompt(am.getActivity(id), 1); }, a.id);
    assert(g.includes('○ 기준: 자랑거리 두 가지와 까닭을 씀') && g.includes('△ 기준: 그림만 있음'), g.slice(0, 600));
    await page.click(`${V} .steps [data-step="2"]`);
    await page.waitForSelector(`${V} #actItems`);
    assert((await page.textContent(`${V} #actItems`)).includes('AI가 만듦') && (await page.textContent(`${V} .un-body`)).includes('확정함'), '2단계 기준 확정');
  }],
  ['진도표 밖 「직접 쓰기」: 첫 줄의 교직원 이름은 가려 보내고, 활동 이름·저장한 단원에는 원래 이름(〔이름n〕이 남지 않음), 채점·기준 요청의 단원·활동 이름은 만들 때 가린 글', async () => {
    await page.click(`${V} [data-ac="back"]`);
    await page.click(`${V} [data-ac="make"]`);
    await page.waitForSelector(`${MK} #mkSub`);
    await page.selectOption(`${MK} #mkSub`, '__free');
    await page.waitForSelector(`${MK} #mkFree`);
    await page.fill(`${MK} #mkSubject`, '사회');
    await page.fill(`${MK} #mkFree`, '1. 우리 고장의 모습(한가람 선생님 자료)\n고장의 자랑거리 알기');
    const n = prompts.length;
    await page.click(`${MK} [data-mk="make"]`);
    await until(async () => await cards() === 3);
    const p = prompts.slice(n).find(x => x.startsWith('[활동지 만들기]'));
    assert(p && !p.includes('한가람') && p.includes('〔이름1〕 선생님 자료'), (p || '').slice(0, 300));
    assert(await page.inputValue(`${MK} #mkTitle`) === '한가람 선생님과 자랑거리 찾기', await page.inputValue(`${MK} #mkTitle`));
    await page.fill(`${MK} [data-mk-item="2"] [data-mf="part"]`, '장소만 간단히 그림');
    await page.click(`${MK} [data-mk="create"]`);
    await page.waitForFunction(s => { const c = document.querySelector(`${s} .steps li.cur`); return c && c.textContent.includes('학생 활동지'); }, V);
    assert((await page.textContent(`${V} .un-title`)).trim() === '한가람 선생님과 자랑거리 찾기', await page.textContent(`${V} .un-title`));
    const a = (await acts()).find(x => x && x.meta.title === '한가람 선생님과 자랑거리 찾기');
    assert(a && a.meta.unit === '1. 우리 고장의 모습(한가람 선생님 자료)', JSON.stringify(a && a.meta));
    // 선생님이 보는 것(정보·활동지 글·문항)에는 자리 표시가 남지 않음 — 만들 때 AI로 보낸 가린 글은 made.ai에만
    assert(!JSON.stringify({ meta: a.meta, sheet: a.sheet, items: a.items }).includes('〔'), '자리 표시가 남음');
    assert(a.made.ai && a.made.ai.title[1] === '〔이름1〕 선생님과 자랑거리 찾기' && a.made.ai.unit[1] === '1. 우리 고장의 모습(〔이름1〕 선생님 자료)', JSON.stringify(a.made));
    // 채점·기준 AI로 가는 활동지 정보(단원·활동 이름)는 만들 때 보낸 가린 글
    const [g, c] = await page.evaluate(async id => { const m = await import('./menus/evaluate/activity/activity-ai.js'), am = await import('./menus/evaluate/activity/activity-model.js'), x = am.getActivity(id); return [m.gradePrompt(x, 1), m.criteriaFor(x, 0)]; }, a.id);
    for (const p of [g, c]) assert(!p.includes('한가람') && p.includes('1. 우리 고장의 모습(〔이름1〕 선생님 자료)') && p.includes('「〔이름1〕 선생님과 자랑거리 찾기」'), p.slice(0, 400));
    assert(c.includes('[학생용 활동지 글]\n〔이름1〕 선생님과 자랑거리 찾기\n'), c.slice(0, 600));
  }],
  ['휴대폰 390·360px: 고르기·문항 카드·내려받기 줄이 가로로 넘치거나 겹치지 않음', async () => {
    await page.click(`${V} [data-ac="back"]`);
    await page.click(`${V} [data-ac="make"]`);
    await page.waitForSelector(`${MK} #mkSub`);
    await page.click(`${MK} [data-mk="make"]`);
    await until(async () => await cards() === 3);
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      const r = await wide();
      assert(!r.out.length && r.page <= 1, `${w}px 넘침: ${JSON.stringify(r)}`);
      const o = await overlaps();
      assert(!o.length, `${w}px 겹침: ${o.slice(0, 4).join(' / ')}`);
      if (process.env.SHOT) for (const [k, sel] of [['item', '[data-mk-item="1"]'], ['out', '.mk-done']]) {
        await page.locator(`${MK} ${sel}`).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${process.env.SHOT}/activity-make-${w}-${k}.png` });
      }
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
