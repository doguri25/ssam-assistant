// 수준별 기준표(루브릭) 만들기·고치기 시트(스펙 2026-11-16-rubric-design 「화면 › 2」): window.SSAM.rubric.open(u)로 바로 엶(진입 단추는 교과 평어·평가지 채점에서).
// 머리·성취기준과 평가기준(접힘)·과제 설명([한글 파일에서 가져오기])·요소 수·[3단계|4단계]·AI 줄(plan)·「AI로 가는 것」 → [기준표 만들기](교직원 이름은 가려 보내고 되돌림)
// → 요소 카드(수준마다 글·점수) 고치기 → [저장](ssam:rubrics 열쇠 하나) → 다시 열면 그대로, 고친 칸이 있을 때 [다시 만들기]는 묻기, 닫을 때 저장 안 한 것이 있으면 묻기(Esc·바깥 누르기도),
// [요소 더하기] 5개·[빼기] 2개에서 막힘, 배점 합 100 아님 알림, 3↔4단계, AI가 요소 1개만·빈 답, AI [바꾸기] 뒤 시트로 돌아옴, readOnly·snapshot은 보기만,
// 한글 내려받기, [이 기준표 지우기](묻고), 390·360px 넘침·겹침 없음. 이름·학교는 모두 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, enter, mockClaude } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-16T09:00:00'));
await page.addInitScript(() => {
  if (localStorage.getItem('ssam:__seeded')) return;
  localStorage.setItem('ssam:__seeded', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 }));
  localStorage.setItem('ssam:mig:pron', '1');
  const mk = (id, subject) => ({ id, subject, period: '1학기', std: '[4수01-05] 곱셈의 원리를 이해한다.', unit: '곱셈', area: '수와 연산', elem: '곱셈 원리 설명하기', focus: '', crit: { high: '두 방법으로 설명함', mid: '한 방법으로 설명함', low: '식만 씀' } });
  localStorage.setItem('ssam:plan:P1', JSON.stringify({ kind: 'plan', title: '1학기 평가계획', grade: 3, source: '', createdAt: 1, subjects: [{ name: '수학', units: [mk('m1', '수학'), mk('m2', '수학')] }, { name: '과학', units: [mk('s1', '과학')] }] }));
  localStorage.setItem('ssam:plans', JSON.stringify(['P1'])); localStorage.setItem('ssam:prefs', JSON.stringify({ current: 'P1' }));
});
const U = { id: 'u1', subject: '수학', unit: '곱셈', area: '수와 연산', elem: '곱셈 원리 설명하기', std: '[4수01-05] 곱셈의 원리를 이해한다.', focus: '풀이를 말과 글로 설명', period: '1학기', crit: { high: '두 방법으로 설명함', mid: '한 방법으로 설명함', low: '식만 씀' } };
const U2 = { ...U, id: 'u9', subject: '과학' }; // 평가요소 이름만 같은 다른 과목
const NOTE = '학년·과목·단원·성취기준·평가요소·평가기준과 과제 설명을 보내요. 학생 자료는 보내지 않아요. 교직원 이름·연락처는 가려 보내요.';
const MADE = rows => ({ rows: [
  { name: '곱셈 원리 이해', points: 34, cells: { high: { text: '두 방법 모두 원리를 바르게 설명함', pts: 34 }, mid: { text: '한 방법으로 원리를 설명함', pts: 24 }, low: { text: '식을 세워 곱셈을 함', pts: 14 } } },
  { name: '풀이 과정', points: 33, cells: { high: { text: '풀이 과정을 차례대로 씀', pts: 33 }, mid: { text: '풀이 과정 일부를 씀', pts: 23 }, low: { text: '답을 구함', pts: 13 } } },
  { name: '까닭 설명', points: 33, cells: { high: { text: `${rows ? '〔이름1〕 선생님 자료처럼 ' : ''}두 방법을 견주어 까닭을 씀`, pts: 33 }, mid: { text: '까닭을 한 가지 씀', pts: 23 }, low: { text: '까닭을 말로 함', pts: 13 } } }
] });
const prompts = [], pyPrompts = [];
let gate = null;
await mockClaude(page, async ({ prompt }) => {
  if (prompt.includes('평어 문장을 정확히')) { pyPrompts.push(prompt); return Array.from({ length: 30 }, (_, i) => `곱셈의 원리를 풀이와 함께 설명하며 까닭을 말함 ${i + 1}.`).join('\n'); }
  if (!prompt.includes('수준별 채점 기준표를 만드')) return '{}';
  prompts.push(prompt);
  if (gate) await gate;
  if (prompt.includes('요소 하나만')) return JSON.stringify({ rows: MADE(false).rows.slice(0, 1) });
  if (prompt.includes('빈 답')) return JSON.stringify({ rows: [] });
  return JSON.stringify(MADE(prompt.includes('〔이름1〕')));
});

const SH = '#sheetRoot #rbSheet';
const until = async (fn, what = '시간 초과', ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error(what); await page.waitForTimeout(50); } };
const openRb = (u = U, o = {}) => page.evaluate(([u, o]) => window.SSAM.rubric.open(u, { ...o, onSave: rb => { (window.__rbSaved = window.__rbSaved || []).push(rb ? rb.rows.length : null); } }), [u, o]);
const saved = () => page.evaluate(() => window.__rbSaved || []);
const RB = (fn, ...args) => page.evaluate(([fn, args]) => window.SSAM.rubric[fn](...args), [fn, args]);
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:rubrics') || 'null'));
const cards = () => page.locator(`${SH} .rb-row`).count();
const f = (k, r, lv) => `${SH} [data-rbf="${k}"][data-r="${r}"]${lv ? `[data-lv="${lv}"]` : ''}`;
const act = (a, extra = '') => `${SH} [data-rb-act="${a}"]${extra}`;
const gone = () => page.waitForSelector(SH, { state: 'detached' });
const askText = async () => ((await page.locator(`${SH} #rbAsk`).count()) ? (await page.textContent(`${SH} #rbAsk`)) : '');
const toastHas = s => page.waitForFunction(s => ((document.querySelector('#toast') || {}).textContent || '').includes(s), s);
const dec = b => new TextDecoder().decode(b);
/* 보이는 누르는 칸끼리 겹침(unit-make.mjs와 같은 셈, 시트 안) */
const overlaps = () => page.evaluate(() => {
  const sheet = document.querySelector('#sheetRoot .sheet');
  const clip = e => {
    let r = e.getBoundingClientRect(), x = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); x = { l: Math.max(x.l, q.left), t: Math.max(x.t, q.top), r: Math.min(x.r, q.right), b: Math.min(x.b, q.bottom) }; }
    }
    return x;
  };
  const name = e => (e.getAttribute('aria-label') || e.textContent || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const els = [...sheet.querySelectorAll('button, input:not([type=file]), select, textarea, summary')]
    .filter(e => e.checkVisibility()).map(e => [e, clip(e)]).filter(([, x]) => x.r - x.l > 2 && x.b - x.t > 2);
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const [a, ra] = els[i], [b, rb] = els[j]; if (!a.contains(b) && !b.contains(a) && hit(ra, rb)) out.push(`${name(a)} × ${name(b)}`); }
  return out;
});
/* 시트 가로 넘침: 시트 scrollWidth, 안의 보이는 것이 시트 오른쪽 밖으로 나가는지, 페이지 가로 넘침 */
const wide = () => page.evaluate(() => {
  const sheet = document.querySelector('#sheetRoot .sheet'), sr = sheet.getBoundingClientRect(), out = [];
  for (const e of sheet.querySelectorAll('*')) {
    if (!e.checkVisibility()) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.right > sr.right + 1) out.push((e.className || e.tagName) + ':' + Math.round(r.right));
  }
  return { out: out.slice(0, 5), sheet: sheet.scrollWidth - sheet.clientWidth, page: document.scrollingElement.scrollWidth - document.documentElement.clientWidth };
});

await page.goto(url);
await page.waitForTimeout(400);
await enter(page, 'evaluate');

await run('rubric', [
  ['window.SSAM.rubric: 줄 글(열쇠 없으면 빈 글) → 시트 열기: 머리·성취기준과 평가기준(접힘)·과제 설명·요소 수 3·[3단계]·AI 줄(plan)·「AI로 가는 것」, 빈 요소 카드 3개, 지우기 없음', async () => {
    await page.waitForFunction(() => !!(window.SSAM && window.SSAM.rubric && window.SSAM.rubric.open));
    const line = await RB('paneLineHTML', U);
    assert(line.includes('data-rb="open"') && line.includes('수준별 기준표 만들기'), line);
    assert(await RB('paneLineHTML', { ...U, subject: '' }) === '', '열쇠 없음');
    assert(await RB('grLineHTML', null) === '', '직접 입력');
    assert((await RB('grLineHTML', U)).includes('수준별 기준표 만들기'), await RB('grLineHTML', U));
    assert(await RB('unitKey', U) === '수학|곱셈원리설명하기' && await page.evaluate(() => window.SSAM.rubric.LV_NAME.none) === '안 함', 'unitKey·LV_NAME');
    assert(await page.evaluate(() => ['getFor', 'levelLines', 'gradeBlock', 'normRb', 'baseScore', 'clampScore', 'evidenceLines', 'sumPoints'].every(k => typeof window.SSAM.rubric[k] === 'function')), '규칙 함수');
    assert(await openRb() === true, 'open() → true');
    await page.waitForSelector(SH);
    assert((await page.textContent(`${SH} h3`)).trim() === '수준별 기준표 · 3학년 수학 · 곱셈 원리 설명하기', await page.textContent(`${SH} h3`));
    assert(!(await page.$eval(`${SH} details.rb-info`, d => d.open)), '성취기준·평가기준 접힘');
    const info = await page.textContent(`${SH} details.rb-info`);
    assert(info.includes('[4수01-05]') && info.includes('두 방법으로 설명함') && info.includes('식만 씀'), info);
    assert(await page.inputValue(`${SH} #rbTask`) === '' && await page.inputValue(`${SH} #rbN`) === '3', '과제 설명·요소 수');
    assert(await page.getAttribute(act('lv', '[data-lv="3"]'), 'aria-pressed') === 'true' && await page.getAttribute(act('lv', '[data-lv="4"]'), 'aria-pressed') === 'false', '3단계');
    await page.waitForSelector(`${SH} [data-ai-row="plan"] .ai-row-t`);
    assert((await page.textContent(`${SH} .ai-note`)).includes(NOTE), await page.textContent(`${SH} .ai-note`));
    assert(await cards() === 3 && await page.inputValue(f('name', 0)) === '', '빈 카드 3개');
    assert(await page.locator(`${f('text', 0)}`).count() === 3, '수준 줄 3개');
    assert(await page.locator(act('delete')).count() === 0, '저장 전에는 지우기 없음');
    assert((await page.textContent(act('make'))).includes('기준표 만들기'), await page.textContent(act('make')));
    // 아무것도 안 쓴 채 닫으면 묻지 않음
    await page.click(act('close'));
    await gone();
  }],
  ['[기준표 만들기] → 요청(학년·과목·평가요소·과제 설명, 교직원 이름 가림, 학생 자료 없음), 만드는 동안 표시 → 카드 3개(AI 글, 가린 이름은 되돌림), 배점 합 100', async () => {
    await openRb();
    await page.waitForSelector(SH);
    await page.fill(`${SH} #rbTask`, '두 자리 수 곱셈을 두 가지 방법으로 풀고 까닭을 씀(한가람 선생님 자료)');
    let free; gate = new Promise(r => { free = r; });
    await page.click(act('make'));
    await page.waitForSelector(`${SH} #rbBusy`);
    assert(await page.isDisabled(act('make')), '만드는 동안 단추 막힘');
    free(); gate = null;
    await until(async () => await page.inputValue(f('name', 0)) === '곱셈 원리 이해', '만든 글');
    const p = prompts[prompts.length - 1];
    assert(p.includes('[학년·과목] 3학년 수학') && p.includes('[평가요소] 곱셈 원리 설명하기') && p.includes('[과제 설명]') && p.includes('채점 요소 3개'), p.slice(0, 600));
    assert(p.includes('〔이름1〕') && !p.includes('한가람'), '교직원 이름 가림');
    assert(!/김하늘|이바다|박솔빛|학생 이름/.test(p), '학생 자료');
    assert(await cards() === 3, '카드 3개');
    assert(await page.inputValue(f('text', 0, 'high')) === '두 방법 모두 원리를 바르게 설명함' && await page.inputValue(f('pts', 1, 'mid')) === '23', '칸 글·점수');
    assert(await page.inputValue(f('text', 2, 'high')) === '한가람 선생님 자료처럼 두 방법을 견주어 까닭을 씀', await page.inputValue(f('text', 2, 'high')));
    assert((await page.textContent(`${SH} #rbSum`)).includes('배점 합 100점') && !(await page.textContent(`${SH} #rbSum`)).includes('100점으로 바꿔'), await page.textContent(`${SH} #rbSum`));
    assert(await page.isHidden(`${SH} #rbBusy`), '표시 사라짐');
    assert((await page.textContent(act('make'))).includes('다시 만들기'), '단추 이름');
  }],
  ['칸 글·점수 하나 고침 → [저장] → 닫힘, ssam:rubrics에 열쇠 하나(과제 설명은 원래 이름), onSave, 줄 글이 바뀜 → 다시 열면 고친 값 그대로', async () => {
    await page.fill(f('text', 1, 'mid'), '풀이 과정 일부를 차례대로 씀');
    await page.fill(f('pts', 0, 'high'), '30');
    await page.click(act('save'));
    await gone();
    await toastHas('저장');
    const s = await stored();
    assert(s && s.v === 1 && Object.keys(s.items).join() === '수학|곱셈원리설명하기', JSON.stringify(s && Object.keys(s.items)));
    const it = s.items['수학|곱셈원리설명하기'];
    assert(it.rows[1].cells.mid.text === '풀이 과정 일부를 차례대로 씀' && it.rows[0].cells.high.pts === 30 && it.at > 0, JSON.stringify(it.rows[0]));
    assert(it.task.includes('한가람 선생님 자료') && it.subject === '수학' && it.elem === '곱셈 원리 설명하기', it.task);
    assert(JSON.stringify(await saved()) === '[3]', JSON.stringify(await saved()));
    const line = await RB('paneLineHTML', U);
    assert(line.includes('수준별 기준표 · 요소 3개 · 3단계') && line.includes('보기·고치기') && line.includes('data-rb="open"') && !line.includes('곳에 쓰여요'), line);
    assert((await RB('paneLineHTML', U, { same: 2 })).includes('같은 평가요소 2곳에 쓰여요'), '같은 평가요소 n곳');
    const gl = await RB('grLineHTML', U, {});
    assert(gl.includes('수준별 기준표로 채점해요 · 요소 3개') && gl.includes('보기·고치기'), gl);
    const snap = await RB('grLineHTML', U, { snapshot: it, locked: true });
    assert(snap.includes('수준별 기준표로 채점했어요 · 요소 3개') && snap.includes('data-rb="view"') && !snap.includes('고치기'), snap);
    assert(!(await RB('grLineHTML', U2, {})).includes('채점해요'), '다른 과목은 기준표 없음');
    await openRb();
    await page.waitForSelector(SH);
    assert(await page.inputValue(f('text', 1, 'mid')) === '풀이 과정 일부를 차례대로 씀' && await page.inputValue(f('pts', 0, 'high')) === '30', '다시 열면 그대로');
    assert(await page.inputValue(`${SH} #rbTask`) === '두 자리 수 곱셈을 두 가지 방법으로 풀고 까닭을 씀(한가람 선생님 자료)', '과제 설명');
    assert(await page.locator(act('delete')).count() === 1, '저장한 뒤엔 지우기');
  }],
  ['다시 만들기: 고친 칸이 없으면 바로, 고친 칸이 있으면 「고친 칸이 있어요」 → [취소]면 그대로·[새로 만들기]면 바뀜; 저장 안 한 채 닫기(Esc·바깥 누르기)는 묻고 [저장하지 않고 닫기]', async () => {
    let n = prompts.length;
    await page.click(act('make'));
    await until(async () => prompts.length === n + 1 && await page.inputValue(f('text', 1, 'mid')) === '풀이 과정 일부를 씀', '바로 다시 만듦');
    assert(!(await askText()), '묻지 않음');
    await page.fill(f('name', 0), '곱셈 원리 이해하기');
    n = prompts.length;
    await page.click(act('make'));
    await page.waitForSelector(`${SH} #rbAsk`);
    assert((await askText()).includes('고친 칸이 있어요. 새로 만들까요?'), await askText());
    await page.click(act('askNo'));
    assert(!(await askText()) && await page.inputValue(f('name', 0)) === '곱셈 원리 이해하기' && prompts.length === n, '[취소]면 그대로');
    await page.click(act('make'));
    await page.click(act('remakeOk'));
    await until(async () => prompts.length === n + 1 && await page.inputValue(f('name', 0)) === '곱셈 원리 이해', '새로 만듦');
    // 저장한 것과 다름 → Esc는 묻기
    await page.keyboard.press('Escape');
    await page.waitForSelector(`${SH} #rbAsk`);
    assert((await askText()).includes('저장하지 않은'), await askText());
    await page.click(act('askNo'));
    assert(!(await askText()) && await page.isVisible(SH), '계속 고치기');
    await page.mouse.click(4, 4); // 시트 바깥
    await page.waitForSelector(`${SH} #rbAsk`);
    assert((await askText()).includes('저장하지 않은'), '바깥 누르기도 묻기');
    await page.click(act('closeDrop'));
    await gone();
    await openRb();
    await page.waitForSelector(SH);
    assert(await page.inputValue(f('text', 1, 'mid')) === '풀이 과정 일부를 차례대로 씀', '저장한 것 그대로');
  }],
  ['[요소 더하기]는 5개에서·[빼기]는 2개에서 막힘, 배점 합 100이 아니면 「배점 합 n점」 알림, 배점을 고치면 고치지 않은 수준 점수가 따라감', async () => {
    await page.click(act('add'));
    await until(async () => await cards() === 4);
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.rbf === 'name' && document.activeElement.dataset.r === '3'), '새 요소 이름에 초점');
    let sum = await page.textContent(`${SH} #rbSum`);
    assert(sum.includes('배점 합 125점') && sum.includes('채점은 100점으로 바꿔 셈해요'), sum);
    await page.click(act('add'));
    await until(async () => await cards() === 5);
    assert(await page.isDisabled(act('add')), '5개에서 더하기 막힘');
    for (const r of [4, 3, 2]) { await page.click(act('del', `[data-r="${r}"]`)); await until(async () => await cards() === r); }
    assert(await page.locator(`${SH} [data-rb-act="del"]:not([disabled])`).count() === 0, '2개에서 빼기 막힘');
    assert(!(await page.isDisabled(act('add'))), '더하기 됨');
    sum = await page.textContent(`${SH} #rbSum`);
    assert(sum.includes('배점 합 67점') && sum.includes('100점으로 바꿔'), sum);
    await page.fill(f('points', 1), '66');
    sum = await page.textContent(`${SH} #rbSum`);
    assert(sum.includes('배점 합 100점') && !sum.includes('바꿔'), sum);
    assert(await page.inputValue(f('pts', 1, 'high')) === '66' && await page.inputValue(f('pts', 1, 'mid')) === '46' && await page.inputValue(f('pts', 1, 'low')) === '26', '고치지 않은 수준 점수가 따라감');
    await page.fill(f('points', 0), '40');
    assert(await page.inputValue(f('pts', 0, 'high')) === '30', '고친 점수는 그대로');
    await page.click(act('close'));
    await page.click(act('closeDrop'));
    await gone();
  }],
  ['[3단계|4단계]: 4단계면 최상 칸(빈 글)이 생기고 글·고친 점수 그대로, 3단계로 돌리면 빠지고 저장 안 한 것 없음', async () => {
    await openRb();
    await page.waitForSelector(SH);
    await page.click(act('lv', '[data-lv="4"]'));
    await until(async () => await page.locator(f('text', 0)).count() === 4);
    assert(await page.getAttribute(act('lv', '[data-lv="4"]'), 'aria-pressed') === 'true', '4단계 눌림');
    assert(await page.inputValue(f('text', 0, 'top')) === '' && await page.inputValue(f('text', 0, 'high')) === '두 방법 모두 원리를 바르게 설명함' && await page.inputValue(f('pts', 0, 'high')) === '30', '최상 칸·글·점수');
    assert((await page.textContent(`${SH} .rb-row`)).includes('최상'), '수준 이름 글자');
    await page.click(act('lv', '[data-lv="3"]'));
    await until(async () => await page.locator(f('text', 0)).count() === 3);
    await page.click(act('close'));
    await gone();
  }],
  ['AI [바꾸기]를 눌렀다 닫으면 기준표 시트로 돌아오고 고친 글 그대로', async () => {
    await openRb();
    await page.waitForSelector(`${SH} [data-ai-edit="plan"]`);
    await page.fill(f('name', 2), '까닭 설명하기');
    await page.click(`${SH} [data-ai-edit="plan"]`);
    await page.waitForSelector('#sheetRoot #aiRoleSheet');
    await page.click('#sheetRoot #aiRoleSheet [data-close]');
    await page.waitForSelector(SH);
    assert(await page.inputValue(f('name', 2)) === '까닭 설명하기', '고친 글');
    await page.click(act('close'));
    await page.click(act('closeDrop'));
    await gone();
  }],
  ['[한글 파일에서 가져오기](.hwpx) → 과제 설명 칸에 글', async () => {
    await openRb(U2);
    await page.waitForSelector(SH);
    const buf = Buffer.from(makeHwpx({ title: '과제', blocks: [{ type: 'p', text: '새싹초등학교 3학년 과제 안내' }, { type: 'p', text: '곱셈을 두 가지 방법으로 풀어 보세요.' }] }));
    await page.setInputFiles(`${SH} #rbFile`, { name: '과제 안내.hwpx', mimeType: 'application/octet-stream', buffer: buf });
    await until(async () => (await page.inputValue(`${SH} #rbTask`)).includes('곱셈을 두 가지 방법으로 풀어 보세요.'), '가져온 글');
    assert((await page.inputValue(`${SH} #rbTask`)).includes('새싹초등학교 3학년 과제 안내'), await page.inputValue(`${SH} #rbTask`));
  }],
  ['AI가 요소 1개만 주면 카드 1개(빼기 막힘·더하기 됨·알림), 빈 답이면 「기준표를 만들지 못했어요」, 저장 안 한 채 닫으면 묻기', async () => {
    await page.fill(`${SH} #rbTask`, '요소 하나만');
    await page.click(act('make'));
    assert(!(await askText()), '과제 설명만 고쳤으면 묻지 않음');
    await until(async () => await cards() === 1 && await page.inputValue(f('name', 0)) === '곱셈 원리 이해', '카드 1개');
    assert(await page.isDisabled(act('del', '[data-r="0"]')) && !(await page.isDisabled(act('add'))), '빼기 막힘·더하기 됨');
    assert((await page.textContent(`${SH} #rbNote`)).includes('요소 1개만'), await page.textContent(`${SH} #rbNote`));
    await page.fill(`${SH} #rbTask`, '빈 답');
    await page.click(act('make'));
    await page.waitForSelector(`${SH} #rbMsg`);
    assert((await page.textContent(`${SH} #rbMsg`)).includes('기준표를 만들지 못했어요. 다시 해 볼까요?'), await page.textContent(`${SH} #rbMsg`));
    assert(await cards() === 1, '있던 카드 그대로');
    await page.click(act('close'));
    await page.waitForSelector(`${SH} #rbAsk`);
    await page.click(act('closeDrop'));
    await gone();
    assert(await RB('getFor', U2) === null, '과학은 저장 안 함');
  }],
  ['readOnly로 열면 만들기·저장·지우기·더하기·빼기 단추 없고 칸은 읽기 전용, snapshot은 그 기준표를 보여 줌(보기만)', async () => {
    await openRb(U, { readOnly: true });
    await page.waitForSelector(SH);
    for (const a of ['make', 'save', 'delete', 'add', 'del', 'import', 'lv']) assert(await page.locator(act(a)).count() === 0, `${a} 단추`);
    const ro = await page.$$eval(`${SH} textarea, ${SH} input:not([type=file])`, a => a.map(e => e.readOnly));
    assert(ro.length > 0 && ro.every(Boolean), JSON.stringify(ro));
    assert(await page.locator(`${SH} select:not([disabled])`).count() === 0, '고르기 칸');
    assert(await page.inputValue(f('text', 1, 'mid')) === '풀이 과정 일부를 차례대로 씀', '저장한 글');
    assert(await page.locator(act('export')).count() === 1, '내려받기는 됨');
    await page.click(act('close'));
    await gone();
    const snap = (await stored()).items['수학|곱셈원리설명하기'];
    snap.rows[0].cells.high.text = '채점할 때의 글';
    await openRb(U, { snapshot: snap });
    await page.waitForSelector(SH);
    assert(await page.inputValue(f('text', 0, 'high')) === '채점할 때의 글', '사본 글');
    assert(await page.locator(act('save')).count() === 0 && await page.locator(act('make')).count() === 0, 'snapshot은 보기만');
    await page.keyboard.press('Escape');
    await gone();
  }],
  ['내려받기(한글): 파일 이름 「수준별 기준표-수학-곱셈 원리 설명하기」, 제목·표 머리·칸 글(점수)', async () => {
    await openRb();
    await page.waitForSelector(SH);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(act('export'))]);
    assert(dl.suggestedFilename() === '수준별 기준표-수학-곱셈 원리 설명하기.hwpx', dl.suggestedFilename());
    const s = dec((await unzip(new Uint8Array(readFileSync(await dl.path())))).get('Contents/section0.xml'));
    assert(s.includes('곱셈 원리 설명하기 수준별 채점 기준표') && s.includes('<hp:t>채점 요소</hp:t>') && s.includes('풀이 과정 일부를 차례대로 씀 (23점)') && s.includes('3학년 수학'), '문서 글');
  }],
  ['휴대폰 390·360px: 시트가 가로로 넘치지 않고 누르는 칸이 겹치지 않음(4단계·묻기 띠 포함)', async () => {
    await page.click(act('lv', '[data-lv="4"]'));
    await until(async () => await page.locator(f('text', 0)).count() === 4);
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      for (const k of ['edit', 'ask']) {
        if (k === 'ask') { await page.click(act('close')); await page.waitForSelector(`${SH} #rbAsk`); }
        const r = await wide();
        assert(!r.out.length && r.sheet <= 0 && r.page <= 1, `${w}px ${k} 넘침: ${JSON.stringify(r)}`);
        const o = await overlaps();
        assert(!o.length, `${w}px ${k} 겹침: ${o.slice(0, 4).join(' / ')}`);
        if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/rubric-${w}-${k}.png` });
        if (k === 'ask') await page.click(act('askNo'));
      }
    }
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.click(act('close'));
    await page.click(act('closeDrop'));
    await gone();
  }],
  ['[이 기준표 지우기] → 묻기 → [취소]면 그대로, [지우기]면 getFor null·ssam:rubrics 비움·onSave(null)', async () => {
    await openRb();
    await page.waitForSelector(SH);
    await page.click(act('delete'));
    await page.waitForSelector(`${SH} #rbAsk`);
    assert((await askText()).includes('이 기준표를 지울까요?'), await askText());
    await page.click(act('askNo'));
    assert(!(await askText()) && await RB('getFor', U) !== null, '[취소]면 그대로');
    await page.click(act('delete'));
    await page.click(act('delOk'));
    await gone();
    await toastHas('지웠어요');
    assert(await RB('getFor', U) === null && await stored() === null, '지움');
    assert((await saved()).at(-1) === null, JSON.stringify(await saved()));
    assert((await RB('paneLineHTML', U)).includes('수준별 기준표 만들기'), '줄 글');
  }],
  ['교과 평어: 기준표 만들기 → 줄 바뀜 → 상 수준 평어 요청에 기준표, 같은 이름 다른 과목은 안 붙음', async () => {
    await enter(page, 'evaluate', 'pyeongeo');
    await page.waitForSelector('[data-unit="m1"]');
    await page.click('[data-unit="m1"]');
    await page.waitForSelector('#infoBox');
    assert((await page.textContent('#pane .rb-line')).includes('수준별 기준표 만들기'), '처음 줄');
    assert(await page.evaluate(() => { const b = document.querySelector('#infoBox'), l = document.querySelector('#pane .rb-line'); return !!(b.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); }), '정보 상자 아래');
    await page.click('#pane [data-rb="open"]');
    await page.waitForSelector(SH);
    await page.click(act('make'));
    await until(async () => await cards() === 3, '기준표 만들기');
    await page.click(act('save'));
    await gone();
    await until(async () => (await page.textContent('#pane .rb-line')).includes('수준별 기준표 · 요소 3개 · 3단계'), '줄이 바뀜');
    assert((await page.textContent('#pane .rb-line')).includes('같은 평가요소 2곳'), '같은 평가요소 2곳 안내');
    pyPrompts.length = 0;
    await page.click('#pane [data-act="genUnit"]');
    await until(async () => pyPrompts.some(p => p.includes('[상] 수준')), '상 요청');
    const hi = pyPrompts.find(p => p.includes('[상] 수준'));
    assert(hi.includes('[수준별 기준표 — 상]') && hi.includes('곱셈 원리 이해: 두 방법 모두 원리를 바르게 설명함'), '상 요청에 기준표');
    assert(hi.includes('이 설명에 나온 행동을 골고루 담되 문장마다 다르게 씁니다.'), '골고루 줄');
    assert(hi.indexOf('[평가기준]') < hi.indexOf('[수준별 기준표 — 상]'), '평가 정보 줄 뒤');
    await until(async () => pyPrompts.length >= 4, '수준별 요청 모두', 15000);
    await page.waitForTimeout(500);
    const lo = pyPrompts.find(p => p.includes('[하] 수준'));
    assert(lo && lo.includes('[수준별 기준표 — 하]'), '하 요청');
    await page.click('[data-subj="과학"]');
    await page.click('[data-unit="s1"]');
    await page.waitForFunction(() => /과학/.test((document.querySelector('#pane .pane-head') || {}).textContent || ''));
    assert((await page.textContent('#pane .rb-line')).includes('수준별 기준표 만들기'), '과학은 만들기');
    pyPrompts.length = 0;
    await page.click('#pane [data-act="genUnit"]');
    await until(async () => pyPrompts.length >= 1, '과학 요청');
    await page.waitForTimeout(800);
    assert(pyPrompts.every(p => !p.includes('수준별 기준표') && !p.includes('이 설명에 나온 행동')), '과학 요청에 기준표 없음');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
