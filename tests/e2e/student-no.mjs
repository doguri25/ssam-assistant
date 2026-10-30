// 적힌 번호로 학생 맞추기: 걷은 순서가 뒤섞인 답안 → 번호 칸 정하기 → AI가 번호 칸만 모은 그림 한 장을 읽음 → 확인 표(노란 줄을 고쳐야 채점)
// → 번호 차례로 늘어놓고 학생마다 맞는 쪽으로 채점 (단원평가·평가지 채점)
import { open, run, assert } from './helpers.mjs';
import { SAMPLE_ITEMS } from '../../web/menus/evaluate/unit/unit-sample.js';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const sent = [];
let reads = [3, 1, 2];
await page.route('https://api.anthropic.com/**', async route => {
  const c = JSON.parse(route.request().postData()).messages[0].content;
  const prompt = typeof c === 'string' ? c : c.find(x => x.type === 'text').text;
  sent.push({ prompt, images: typeof c === 'string' ? [] : c.filter(x => x.type === 'image').map(x => x.source.data) });
  let out = '{}';
  if (prompt.startsWith('[번호 읽기]')) out = JSON.stringify({ nos: reads.map((no, i) => ({ i: i + 1, no, sure: true })) });
  else if (prompt.startsWith('[단원평가 채점]')) out = JSON.stringify({ items: SAMPLE_ITEMS.map((it, i) => ({ no: i + 1, read: '', points: 0, sure: true, why: '' })) });
  else if (prompt.includes('수행평가를 채점하는')) out = JSON.stringify({ score: 80, summary: '바르게 풀었음', evidence: ['풀이가 맞음'], strengths: '꼼꼼함', improve: '검산', unreadable: false });
  else { const nos = [...prompt.matchAll(/"no": (\d+)/g)].map(m => +m[1]); out = JSON.stringify((nos.length ? nos : [1]).map(no => ({ no, score: 80, text: '수를 바르게 계산함.' }))); }
  const ev = [{ type: 'content_block_delta', delta: { type: 'text_delta', text: out } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }];
  await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') });
});
const V = 'section[data-menu="evaluate"] .unit-box';
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const widths = b64s => page.evaluate(async b64s => { const out = []; for (const b of b64s) { const im = new Image(); im.src = 'data:image/jpeg;base64,' + b; await im.decode(); out.push(im.width); } return out; }, b64s);
const grades = () => sent.filter(s => s.prompt.startsWith('[단원평가 채점]'));
await page.goto(url);
await page.waitForTimeout(400);
const [A, B] = await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
  m.saveSet({ ...m.getSet(), pagesPer: 1, maskOn: false });
  const mk = round => { const x = m.newTest({ meta: { ...s.SAMPLE_META, round, date: '2026-10-2' + round }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } }); m.saveTest(x); return x.id; };
  return [mk(1), mk(2)];
});
await page.reload(); await page.waitForTimeout(500);
await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
// 스캔 차례: 폭 300(3번 학생) · 310(1번) · 320(2번)
const shot = async w => ({ name: `답안${w}.png`, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: w, height: 420 } }) });
const files = [await shot(300), await shot(310), await shot(320)];
const drawBox = async () => {
  await page.waitForSelector('#sheetRoot #mkStage');
  assert((await page.textContent('#sheetRoot')).includes('번호 칸'), '번호 칸 편집기가 아님');
  const b = await page.locator('#sheetRoot #mkStage').boundingBox();
  await page.mouse.move(b.x + b.width * 0.7, b.y + 8); await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.9, b.y + 40, { steps: 4 }); await page.mouse.up();
  await page.click('#sheetRoot #mkOk');
};

await run('student-no', [
  ['단원평가: 「적힌 번호로 학생 맞추기」를 켜고 번호 칸을 정함(평가에 저장)', async () => {
    await page.click(`${V} [data-un-open="${A}"]`);
    await page.check(`${V} #unByNo`);
    await page.setInputFiles(`${V} #unAnsFile`, files);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3);
    await page.click(`${V} [data-un="noBox"]`);
    await drawBox();
    const box = (await T(A)).noBox;
    assert(box && box.w > 0.1 && box.x > 0.5, JSON.stringify(box));
    assert((await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:set')))).byNo === true, '설정 저장');
  }],
  ['채점을 누르면 번호 칸만 모은 그림 한 장으로 번호를 읽고 확인 표(3·1·2), 이대로 채점 → 번호 차례로 학생마다 맞는 쪽', async () => {
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    const r = sent.filter(s => s.prompt.startsWith('[번호 읽기]'));
    assert(r.length === 1 && r[0].images.length === 1, JSON.stringify(r.map(x => x.images.length)));
    // 쪽 전체가 아니라 번호 칸만 3줄로 모은 그림(줄마다 80px + 여백 → 296px)
    const dim = await page.evaluate(async b => { const im = new Image(); im.src = 'data:image/jpeg;base64,' + b; await im.decode(); return [im.width, im.height]; }, r[0].images[0]);
    assert(dim[1] === 296 && dim[0] <= 90 + 520 + 20, JSON.stringify(dim));
    const vals = await page.$$eval('#sheetRoot [data-noi]', els => els.map(e => e.value));
    assert(vals.join(',') === '3,1,2', vals.join(','));
    assert(!(await page.isDisabled('#sheetRoot #noOk')), '확인 버튼이 막힘');
    assert(grades().length === 0, '확인 전에 채점함');
    await page.click('#sheetRoot #noOk');
    await until(() => grades().length === 3);
    const by = {};
    for (const g of grades()) by[(/\[학생\] (\d+)번/.exec(g.prompt) || [])[1]] = (await widths(g.images))[0];
    assert(JSON.stringify(by) === JSON.stringify({ 1: 310, 2: 320, 3: 300 }), JSON.stringify(by));
    await until(async () => (await T(A)).students.every(s => s.status === 'done'));
    assert((await T(A)).students.map(s => s.no).join(',') === '1,2,3', (await T(A)).students.map(s => s.no).join(','));
  }],
  ['번호 칸을 정하지 않고 채점하면 번호 칸 정하기부터, 겹치거나 못 읽은 번호는 노란 줄이고 고쳐야 채점', async () => {
    reads = [1, 1, null];
    const n0 = grades().length;
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
    await page.click(`${V} [data-un="back"]`).catch(() => {});
    await page.click(`${V} [data-un-open="${B}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, files);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await drawBox();
    await page.waitForSelector('#sheetRoot #noOk');
    assert(await page.locator('#sheetRoot li.warn').count() === 3, String(await page.locator('#sheetRoot li.warn').count()));
    assert(await page.isDisabled('#sheetRoot #noOk'), '노란 줄이 있는데 채점 가능');
    const ins = page.locator('#sheetRoot [data-noi]');
    await ins.nth(1).fill('2'); await ins.nth(2).fill('3');
    assert(!(await page.isDisabled('#sheetRoot #noOk')), '고쳤는데 막힘');
    assert(grades().length === n0, '확인 전에 채점함');
    await page.click('#sheetRoot #noOk');
    await until(() => grades().length === n0 + 3);
  }],
  ['평가지 채점도 같은 방법: 번호 칸을 정하고 채점하면 확인 표(2·3·1) → 번호 차례로, 학생마다 맞는 평가지', async () => {
    reads = [2, 3, 1];
    await page.evaluate(() => localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] })));
    await page.reload(); await page.waitForTimeout(500);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
    await page.waitForSelector('#grDrop');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
    await fc.setFiles(files);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 3명'));
    await page.check('#grByNo');
    await page.click('[data-gr="noBox"]');
    await drawBox();
    assert((await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:grset')))).noBox, '번호 칸 저장');
    await page.fill('#grTitle', '세 자리 수 덧셈'); await page.dispatchEvent('#grTitle', 'input');
    const n0 = sent.filter(s => s.prompt.startsWith('[번호 읽기]')).length;
    await page.click('[data-gr="start"]');
    await page.waitForSelector('#sheetRoot #noOk');
    assert(sent.filter(s => s.prompt.startsWith('[번호 읽기]')).length === n0 + 1, '번호 읽기 요청');
    const vals = await page.$$eval('#sheetRoot [data-noi]', els => els.map(e => e.value));
    assert(vals.join(',') === '2,3,1', vals.join(','));
    assert(!sent.some(s => s.prompt.includes('수행평가를 채점하는')), '확인 전에 채점함');
    await page.click('#sheetRoot #noOk');
    await until(() => sent.filter(s => s.prompt.includes('수행평가를 채점하는')).length >= 3, 15000);
    // 결과 줄: 번호 → 썸네일 높이(가로 200으로 줄임: 폭 300 → 280, 310 → 271, 320 → 263)
    await page.waitForFunction(() => document.querySelectorAll('[data-grview1] img').length === 3);
    const rows = await page.$$eval('[data-grview1]', els => els.map(e => [e.getAttribute('aria-label').match(/^(\d+)번/)[1], e.querySelector('img').naturalHeight]));
    assert(JSON.stringify(rows) === JSON.stringify([['1', 263], ['2', 280], ['3', 271]]), JSON.stringify(rows));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
