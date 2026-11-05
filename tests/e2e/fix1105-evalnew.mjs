// 2026-11-05 고침(단원평가·활동지): 채점 중 쪽 모양·결석 번호 바꾸기 막기(이름 칸·결과 지킴), 번호로 맞춘 평가의 「채점 안 함」 자리,
// 칸을 고친 뒤 첫 누름, 2단계·평어 기준 칸 옮기기, 다른 평가의 잘한 점·격려를 쓰는 중 알림
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
// 시험마다 바꾸는 가짜 AI: ai(head, prompt) → 돌려줄 글(JSON 문자열)
const sent = [];
let ai = async () => '{}';
await mockClaude(page, async ({ prompt, images }) => { const head = prompt.split('\n')[0]; sent.push({ head, prompt, images }); return ai(head, prompt); });
await page.goto(url);
await page.waitForTimeout(300);
const P = 'section[data-menu="evaluate"]', V = `${P} .unit-box`;
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const toastText = () => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
const count = head => sent.filter(s => s.head === head).length;
// 사람처럼 누르기: 누르고 120ms 뒤 뗌
const humanClick = async sel => { await page.locator(sel).scrollIntoViewIfNeeded(); const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(120); await page.mouse.up(); await sleep(300); };
const active = () => page.evaluate(() => { const e = document.activeElement; return e ? (e.dataset.k || (e.dataset.stno != null ? 'stno' + e.dataset.stno : '') || e.id || e.tagName) : ''; });
const pngs = n => page.evaluate(async n => {
  const out = [];
  for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 420); g.fillStyle = '#123'; g.fillRect(200, 5, 90, 30); g.fillRect(30 + i * 9, 90, 140, 30); out.push(c.toDataURL('image/png').split(',')[1]); }
  return out;
}, n);
const scans = async n => (await pngs(n)).map((b, i) => ({ name: `스캔${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b, 'base64') }));
// 번호 읽기: 프롬프트의 「딱지 1)부터 n)까지」로 보낸 학생 수를 알고, 걷은 순서 3·1·2번(둘만 보내면 1·2번)
const noRead = prompt => { const n = Number((/1\)부터 (\d+)\)까지/.exec(prompt) || [])[1]); return JSON.stringify({ nos: (n === 3 ? [3, 1, 2] : [1, 2]).map((no, i) => ({ i: i + 1, no, sure: true })) }); };

/* 단원평가 */
const unitTest = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const toUnit = async (setup = null) => {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k); });
  const id = setup ? await page.evaluate(setup) : null;
  sent.length = 0;
  await page.reload(); await page.waitForTimeout(400);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
  return id;
};
// 문항 하나짜리 평가: 이름 칸(mask)을 정했거나 가리지 않음, 학생 한 명 1쪽
const oneItem = ({ mask, byNo }) => `(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const x = m.newTest({ meta: { subject: '수학', grade: 3, unitNo: 1, date: '2026-10-29' }, key: { domains: [], items: [{ no: 1, content: '고르기', domain: '', type: 'choice', answer: '③', points: 100, criteria: '', pages: '' }] } });
  const mask = ${JSON.stringify(mask || [])};
  if (mask.length) { x.mask = mask; x.maskAll = false; }
  ${byNo ? "x.noBox = { x: 0.6, y: 0, w: 0.35, h: 0.12 }; localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));" : ''}
  m.saveTest(x);
  m.saveSet({ ...m.getSet(), pagesPer: 1, mask, maskAll: false, maskOn: mask.length > 0, byNo: ${!!byNo} });
  return x.id;
})()`;
const unitGraded = () => JSON.stringify({ items: [{ no: 1, read: '③', points: 100, sure: true, why: '' }] });
const step = async () => (await page.textContent(`${V} .steps [aria-current="step"]`)).trim();
// 다시 그렸는지: 표시해 둔 틀이 새 틀로 바뀌면 다시 그린 것
const mark = () => page.evaluate(() => { document.querySelector('.unit-box .m-page').__old = 1; });
const redrawn = () => page.waitForFunction(() => { const m = document.querySelector('.unit-box .m-page'); return m && !m.__old; });

/* 활동지 */
const getAct = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:activity:a:' + id)), id);

// ONLY=unit-key 처럼 주면 그 시험만
const only = cases => (process.env.ONLY ? cases.filter(([n]) => n.includes(process.env.ONLY)) : cases);
await run('fix1105-evalnew', only([
  ['[unit-twoup-mask-1] 채점하는 중에는 모아찍기·뒷면 스위치를 바꿀 수 없고, 이름 칸은 그대로라 남은 학생도 모두 가려서 보냄', async () => {
    ai = async head => { if (head === '[단원평가 채점]') { await sleep(1500); return unitGraded(); } return '{}'; };
    const id = await toUnit(oneItem({ mask: [{ x: 0.6, y: 0, w: 0.4, h: 0.1 }] }));
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, await scans(6));
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 6);
    await page.evaluate(() => { const f = window.SSAM.files, orig = f.pageImage; window.__masks = []; f.pageImage = (p, mask) => { window.__masks.push(mask ? mask.length : 0); return orig.call(f, p, mask); }; });
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await sleep(2000); // 첫 학생들 끝, 다음 학생 보내는 중
    await page.click(`${V} .steps [data-step="2"]`);
    await page.click(`${V} label:has(#unFlipBack)`);
    await sleep(300);
    assert((await toastText()).includes('채점하는 중에는 바꿀 수 없어요'), await toastText());
    assert(!(await page.isChecked(`${V} #unFlipBack`)), '스위치가 켜짐');
    await until(async () => (await unitTest(id)).students.every(s => s.status === 'done'), 30000);
    const x = await unitTest(id), set = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:set')));
    assert(x.mask && x.mask.length === 1 && !set.flipBack, JSON.stringify({ mask: x.mask, flipBack: set.flipBack }));
    const masks = await page.evaluate(() => window.__masks);
    assert(masks.length === 6 && masks.every(n => n === 1), '가리지 않고 보냄: ' + JSON.stringify(masks));
  }],
  ['[unit-twoup-mask-1] 다 채점한 뒤 쪽 모양을 바꿔 이름 칸이 지워지면 [모두 다시 채점]도 이름 칸부터 물음(AI 안 부름)', async () => {
    const id = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:list'))))[0].id;
    assert((await step()).startsWith('2'), await step());
    await page.click(`${V} label:has(#unFlipBack)`);
    await sleep(300);
    assert(!(await unitTest(id)).mask, '이름 칸이 남음');
    const n = count('[단원평가 채점]');
    await page.click(`${V} .steps [data-step="3"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.click('#sheetRoot #unRegradeOk');
    await page.waitForSelector('#sheetRoot #unMaskGo');
    await sleep(500);
    assert(count('[단원평가 채점]') === n, `AI를 부름 ${count('[단원평가 채점]') - n}번`);
    await page.click('#sheetRoot [data-close]');
  }],
  ['[unit-absent-race-5] 채점하는 중에는 결석 번호·학생 번호를 바꿀 수 없고, 보내던 학생 결과도 모두 들어감', async () => {
    ai = async head => { if (head === '[단원평가 채점]') { await sleep(1500); return unitGraded(); } return '{}'; };
    const id = await toUnit(oneItem({}));
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, await scans(6));
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 6);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await sleep(2200);
    await page.click(`${V} .steps [data-step="2"]`);
    await page.fill(`${V} #unAbsent`, '2'); await page.dispatchEvent(`${V} #unAbsent`, 'change');
    await sleep(200);
    assert((await toastText()).includes('채점하는 중에는 바꿀 수 없어요'), await toastText());
    await page.fill(`${V} input[data-stno="3"]`, '20'); await page.dispatchEvent(`${V} input[data-stno="3"]`, 'change');
    await sleep(200);
    assert((await toastText()).includes('채점하는 중에는 바꿀 수 없어요'), await toastText());
    await until(async () => (await unitTest(id)).students.every(s => s.status !== 'idle') && count('[단원평가 채점]') >= 6, 30000);
    await sleep(300);
    const x = await unitTest(id);
    assert(!(x.absent || []).length && x.students.map(s => `${s.no}:${s.status}`).join(' ') === '1:done 2:done 3:done 4:done 5:done 6:done', JSON.stringify({ absent: x.absent, st: x.students.map(s => `${s.no}:${s.status}`) }));
    assert(count('[단원평가 채점]') === 6, 'AI 부름 ' + count('[단원평가 채점]'));
  }],
  ['[unit-key-click-3] 정답표 유형을 고르거나 칸·날짜를 고친 뒤 [다음]·[문항 더하기]·단계 단추를 한 번 눌러도 먹힘', async () => {
    await toUnit();
    await page.click(`${V} [data-un="sample"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    // (1) 유형을 고르고 곧바로 [다음]
    await page.click(`${V} .steps [data-step="1"]`);
    await page.focus(`${V} select[data-k="4-type"]`);
    await page.selectOption(`${V} select[data-k="4-type"]`, 'essay');
    await sleep(100);
    await humanClick(`${V} [data-un="next"]`);
    assert((await step()).startsWith('2'), '(1) ' + await step());
    assert((await unitTest('sample-1')).key.items[3].type === 'essay', '유형 저장');
    // (2) 배점 칸을 고치고 곧바로 [문항 더하기]
    await page.click(`${V} .steps [data-step="1"]`);
    const n0 = await page.locator(`${V} [data-k$="-content"]`).count();
    await page.click(`${V} [data-k="1-points"]`); await page.keyboard.press('End'); await page.keyboard.type('5');
    await humanClick(`${V} [data-un="addItem"]`);
    assert(await page.locator(`${V} [data-k$="-content"]`).count() === n0 + 1, '(2) 문항이 늘지 않음');
    assert((await unitTest('sample-1')).key.items[0].points === 55, '배점 저장 ' + (await unitTest('sample-1')).key.items[0].points);
    // (3) 정답 칸을 고치고 곧바로 [다음]
    await page.click(`${V} [data-k="2-answer"]`); await page.keyboard.press('End'); await page.keyboard.type('X');
    await humanClick(`${V} [data-un="next"]`);
    assert((await step()).startsWith('2'), '(3) ' + await step());
    assert((await unitTest('sample-1')).key.items[1].answer.endsWith('X'), '정답 저장');
    // (4) 날짜 칸을 고치고 곧바로 단계 [2]
    await page.click(`${V} .steps [data-step="1"]`);
    await page.fill(`${V} #unDate`, '2026-10-30');
    await sleep(100);
    await humanClick(`${V} .steps [data-step="2"]`);
    assert((await step()).startsWith('2'), '(4) ' + await step());
    assert((await unitTest('sample-1')).meta.date === '2026-10-30', '날짜 저장');
    // 칸을 고치고 빈 곳을 누르면 그대로 다시 그림(합계 줄 등)
    await page.click(`${V} .steps [data-step="1"]`);
    await page.click(`${V} [data-k="3-points"]`); await page.keyboard.press('Control+A'); await page.keyboard.type('20');
    await mark();
    await page.click(`${V} .m-page`, { position: { x: 5, y: 5 } });
    await redrawn();
    assert(await page.inputValue(`${V} [data-k="3-points"]`) === '20' && (await unitTest('sample-1')).key.items[2].points === 20, '배점 20');
  }],
  ['[unit-focus-tab-4] 2단계 결석 번호·학생 번호 칸을 고치고 다른 칸을 눌러 바로 친 글이 들어감', async () => {
    await page.click(`${V} .steps [data-step="2"]`);
    const nos0 = await page.$$eval(`${V} input[data-stno]`, els => els.map(e => e.value));
    assert(nos0.join(',') === '1,2,3,4,5,6', nos0.join(','));
    // 결석 「2」 → 3번째 학생 번호 칸을 눌러 9
    await page.click(`${V} #unAbsent`); await page.keyboard.type('2');
    await page.click(`${V} input[data-stno="2"]`);
    assert(await active() === 'stno2', '초점: ' + await active());
    assert((await page.$$eval(`${V} input[data-stno]`, els => els.map(e => e.value))).join(',') === '1,3,4,5,6,7', '번호가 바로 밀리지 않음');
    await page.keyboard.press('Control+A'); await page.keyboard.type('9');
    // 1번째 칸 11 → 2번째 칸을 눌러 12
    await page.click(`${V} input[data-stno="0"]`);
    assert(await active() === 'stno0', '초점: ' + await active());
    await page.keyboard.press('Control+A'); await page.keyboard.type('11');
    await page.click(`${V} input[data-stno="1"]`);
    assert(await active() === 'stno1', '초점: ' + await active());
    await page.keyboard.press('Control+A'); await page.keyboard.type('12');
    assert((await page.$$eval(`${V} input[data-stno]`, els => els.map(e => e.value))).join(',') === '11,12,9,5,6,7', (await page.$$eval(`${V} input[data-stno]`, els => els.map(e => e.value))).join(','));
    // 칸을 떠나면 저장한 대로 다시 그림
    await mark();
    await page.click(`${V} .m-page`, { position: { x: 5, y: 5 } });
    await redrawn();
    const x = await unitTest('sample-1');
    assert(x.students.map(s => s.no).join(',') === '11,12,9,5,6,7' && JSON.stringify(x.absent) === '[2]', JSON.stringify([x.students.map(s => s.no), x.absent]));
    assert((await page.$$eval(`${V} input[data-stno]`, els => els.map(e => e.value))).join(',') === '11,12,9,5,6,7', '다시 그린 번호');
  }],
  ['[unit-focus-tab-4] 교과 평어 수준 기준: 최상 칸을 고치고 Tab으로 옮겨 친 상 칸 글이 들어가고, 수준은 바로 바뀜', async () => {
    await toUnit();
    await page.click(`${V} [data-un="sample"]`);
    await page.click(`${V} [data-unv="results"]`);
    await page.click(`${V} [data-rv="pyeongeo"]`);
    const lv0 = await page.$$eval(`${V} select[data-pylv]`, els => els.map(e => e.value));
    await page.click(`${V} #unCutTop`); await page.keyboard.press('Control+A'); await page.keyboard.type('10');
    await page.keyboard.press('Tab');
    assert(await active() === 'unCutHigh', '초점: ' + await active());
    await page.keyboard.type('5');
    assert(await page.inputValue(`${V} #unCutHigh`) === '5', '상: ' + await page.inputValue(`${V} #unCutHigh`));
    // 최상 기준 10이면 모든 학생이 최상(바로 바뀜)
    const lv1 = await page.$$eval(`${V} select[data-pylv]`, els => els.map(e => e.value));
    assert(lv1.every(v => v === 'top') && lv0.some(v => v !== 'top'), JSON.stringify([lv0, lv1]));
    await page.keyboard.press('Tab');
    await mark();
    await page.click(`${V} .m-page`, { position: { x: 5, y: 5 } });
    await redrawn();
    const py = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:pyeongeo:국어')));
    assert(py.cuts.top === 10 && py.cuts.high === 5, JSON.stringify(py.cuts));
    assert(await page.inputValue(`${V} #unCutHigh`) === '5' && await page.inputValue(`${V} #unCutTop`) === '10', '다시 그린 기준');
  }],
  ['[act-byno-skip-2] 번호로 맞춘 활동지에 같은 스캔을 다시 올리면 「채점 안 함」 학생 자리의 쪽도 번호로 읽어, 다른 학생이 「스캔이 없어요」가 되지 않음', async () => {
    ai = async (head, prompt) => head === '[쪽 나누기]' ? JSON.stringify({ pages: [] }) : head === '[번호 읽기]' ? noRead(prompt)
      : head === '[활동지 채점]' ? JSON.stringify({ items: [{ no: 1, read: '③', mark: 'o', why: '', sure: true }], good: 'AI 잘함', next: '', level: 'ok', levelWhy: '' }) : '{}';
    const act = { id: 'acK', meta: { subject: '과학', unit: '1', lesson: '2', pages: '', title: '건너뛰기', date: '2026-09-10', term: 2 }, sheet: { student: '1. 고르기', teacher: '' },
      items: [{ no: 1, type: 'choice', ask: '고르기', answer: '③', ok: '', part: '', src: 'answer' }], confirmed: true, students: [], done: false, link: null, createdAt: 1, byNo: true, noBox: { x: 0.6, y: 0, w: 0.35, h: 0.12 } };
    await page.evaluate(a => {
      for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k);
      localStorage.setItem('ssam:activity:set', JSON.stringify({ pagesPer: 1, maskOn: false, mask: [], maskAll: false }));
      localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
      localStorage.setItem('ssam:activity:a:' + a.id, JSON.stringify(a));
      localStorage.setItem('ssam:activity:list', JSON.stringify([{ id: a.id, title: a.meta.title, subject: a.meta.subject, date: a.meta.date, term: 2, n: 0, done: false, at: 1 }]));
    }, act);
    sent.length = 0;
    const nav = async () => { await page.reload(); await page.waitForTimeout(400); await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="activity"]'); };
    const files = await scans(3);
    const upload = async () => { await page.waitForSelector(`${P} [data-bundle-pick="act3"]`); await page.setInputFiles('#bundleFile-act3', files); await page.waitForTimeout(800); if (await page.$('#sheetRoot #bundleOk')) await page.click('#sheetRoot #bundleOk'); };
    await nav();
    // 1일째: 올리기 → 번호 확인(3·1·2) → 채점
    await page.click(`${P} [data-ac-open="acK"]`);
    await upload();
    await until(async () => (await getAct('acK')).students.length === 3);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk'); await page.click('#sheetRoot #noOk');
    await until(async () => (await getAct('acK')).students.every(s => s.status === 'done'));
    // 1번은 「채점 안 함」, 기준을 고쳐 다시 채점해야 하게
    await page.click(`${P} .steps [data-step="3"]`);
    await page.click(`${P} input[data-skip="0"]`);
    await sleep(200);
    await page.click(`${P} .steps [data-step="2"]`);
    await page.fill(`${P} textarea[data-it="1"][data-f="ask"]`, '알맞은 것 고르기');
    await page.click(`${P} [data-ac="confirm"]`);
    // 2일째: 같은 스캔(걷은 순서)을 다시 올려 채점
    await nav();
    await page.click(`${P} [data-ac-open="acK"]`);
    await page.click(`${P} .steps [data-step="3"]`);
    await upload();
    await page.waitForFunction(() => /쪽 3장/.test((document.querySelector('.act-box #acStus') || {}).textContent || ''));
    await page.click(`${P} [data-ac="toGrade"]`);
    const reads = count('[번호 읽기]');
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    const vals = await page.$$eval('#sheetRoot [data-noi]', els => els.map(e => e.value));
    assert(count('[번호 읽기]') === reads + 1 && vals.join(',') === '3,1,2', '확인 표 ' + vals.join(','));
    assert(!(await page.textContent('#sheetRoot')).includes('읽은 번호에 없는 번호'), (await page.textContent('#sheetRoot')).replace(/\s+/g, ' ').slice(0, 300));
    await page.click('#sheetRoot #noOk');
    await until(async () => (await getAct('acK')).students.filter(s => !s.skip).every(s => s.status !== 'idle' && (!s.stale || s.status === 'error')));
    const a = await getAct('acK');
    assert(a.students.map(s => `${s.no}:${s.skip ? 'skip' : s.status}`).join(' ') === '1:skip 2:done 3:done', a.students.map(s => `${s.no}:${s.skip ? 'skip' : s.status}${s.err ? '(' + s.err + ')' : ''}`).join(' '));
  }],
  ['[act-byno-skip-2] 처음 번호로 맞출 때는 그대로 「채점 안 함」 학생 자리를 번호 확인 표에서 뺌(빈 답안지 등)', async () => {
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await toUnit(oneItem({ byNo: true }));
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, await scans(3));
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3);
    await page.click(`${V} [data-un="skip"][data-i="0"]`);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    assert(await page.locator('#sheetRoot [data-noi]').count() === 2, String(await page.locator('#sheetRoot [data-noi]').count()));
    await page.click('#sheetRoot [data-close]');
  }],
  ['[act-byno-skip-2] 단원평가도: 번호로 맞춘 평가에 같은 스캔을 다시 올리면 「채점 안 함」 학생 자리의 쪽도 번호로 읽어 다른 학생 쪽이 빠지지 않음', async () => {
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await toUnit(oneItem({ byNo: true }));
    const files = await scans(3);
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, files);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk'); await page.click('#sheetRoot #noOk');
    await until(async () => (await unitTest(id)).students.every(s => s.status === 'done'));
    // 1번은 「채점 안 함」 → 같은 스캔(걷은 순서)을 다시 올림
    await page.click(`${V} .steps [data-step="2"]`);
    await page.click(`${V} [data-st="1"] [data-un="skip"]`);
    await page.setInputFiles(`${V} #unAnsFile`, files);
    await page.waitForFunction(() => /번호를 다시 읽기 전/.test(document.querySelector('.unit-box').textContent));
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    const vals = await page.$$eval('#sheetRoot [data-noi]', els => els.map(e => e.value));
    assert(vals.join(',') === '3,1,2', '확인 표 ' + vals.join(','));
    await page.click('#sheetRoot #noOk');
    // 다 채점한 평가라 모두 다시 채점할지 물음: 1번(채점 안 함)을 뺀 2명
    await page.waitForSelector('#sheetRoot #unRegradeOk');
    assert((await page.textContent('#sheetRoot')).includes('학생 2명'), (await page.textContent('#sheetRoot')).replace(/\s+/g, ' '));
    await page.click('#sheetRoot [data-close]');
    await page.click(`${V} .steps [data-step="2"]`);
    const rows = await page.$$eval(`${V} [data-st]`, els => els.map(e => `${e.dataset.st}:${e.textContent.includes('스캔 없음') ? '없음' : '있음'}`));
    assert(rows.join(' ') === '1:있음 2:있음 3:있음', rows.join(' '));
    const x = await unitTest(id);
    assert(x.students.map(s => `${s.no}:${s.skip ? 'skip' : s.status}`).join(' ') === '1:skip 2:done 3:done', x.students.map(s => `${s.no}:${s.skip ? 'skip' : s.status}`).join(' '));
  }],
  ['[unit-fb-busy-7] 다른 평가의 잘한 점·격려를 AI가 쓰는 동안 이 평가의 [잘한 점·격려 쓰기]·[다시 쓰기]를 누르면 알림', async () => {
    ai = async (head, prompt) => { await sleep(2500); const nos = [...prompt.matchAll(/^- (\d+)번 \|/gm)].map(m => Number(m[1])); return JSON.stringify({ students: nos.map(no => ({ no, good: `G${no}`, cheer: `C${no}` })) }); };
    await toUnit();
    await page.click(`${V} [data-un="sample"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    await page.click(`${V} [data-un="fbRedo"][data-no="1"]`);
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un-open="sample-2"]`);
    const n = count('[단원평가 피드백]');
    await page.click(`${V} [data-un="fbRedo"][data-no="2"]`);
    await sleep(200);
    assert((await toastText()).includes('다른 평가의 잘한 점·격려를 쓰는 중'), await toastText());
    await page.click(`${V} [data-un="fbAI"]`);
    await sleep(200);
    assert((await toastText()).includes('다른 평가의 잘한 점·격려를 쓰는 중'), await toastText());
    assert(count('[단원평가 피드백]') === n, 'AI를 부름');
    await until(async () => (await unitTest('sample-1')).students[0].good === 'G1', 10000);
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]));
await t.close();
