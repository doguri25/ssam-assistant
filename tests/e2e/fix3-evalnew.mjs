// 3차 고침(단원평가·활동지): 번호로 맞춘 평가에 다시 올린 스캔(3단계 답안 그림·빈 답안지 줄·「채점 안 함」 번호),
// 다른 활동지의 기준을 AI가 만드는 중일 때 [AI로 기준 만들기]
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await sleep(50); } };
const toastText = () => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
const clearToast = () => page.evaluate(() => { const e = document.querySelector('#toast'); if (e) e.textContent = ''; });
const count = head => sent.filter(s => s.head === head).length;
// 사람처럼 누르기: 누르고 80ms 뒤 뗌
const humanClick = async sel => { await page.locator(sel).scrollIntoViewIfNeeded(); const b = await page.locator(sel).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(300); };
const pngs = n => page.evaluate(async n => {
  const out = [];
  for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 420); g.fillStyle = '#123'; g.fillRect(200, 5, 90, 30); g.fillRect(30 + i * 9, 90, 140, 30); out.push(c.toDataURL('image/png').split(',')[1]); }
  return out;
}, n);
const scans = async n => (await pngs(n)).map((b, i) => ({ name: `스캔${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b, 'base64') }));
// 번호 읽기: 보낸 학생 수(n)마다 걷은 차례로 읽을 번호
let READ = {};
const noRead = prompt => { const n = Number((/1\)부터 (\d+)\)까지/.exec(prompt) || [])[1]); return JSON.stringify({ nos: READ[n].map((no, i) => ({ i: i + 1, no, sure: true })) }); };
const rowsOf = l => l.map(s => `${s.no}:${s.skip ? 'skip' : s.status}`).join(' ');

/* 단원평가 */
const unitTest = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const unitGraded = () => JSON.stringify({ items: [{ no: 1, read: '③', points: 100, sure: true, why: '' }] });
// 앞 시험의 늦은 저장이 덮지 않게 지금 페이지의 저장을 멈추고 씀(다시 열면 풀림)
const unitSetup = count => page.evaluate(async count => {
  const st = await import('./core/store.js'), m = await import('./menus/evaluate/unit/unit-model.js');
  st.freeze();
  for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k);
  const x = m.newTest({ meta: { subject: '수학', grade: 3, unitNo: 1, date: '2026-10-29' }, key: { domains: [], items: [{ no: 1, content: '고르기', domain: '', type: 'choice', answer: '③', points: 100, criteria: '', pages: '' }] } });
  x.noBox = { x: 0.6, y: 0, w: 0.35, h: 0.12 };
  localStorage.setItem('ssam:class', JSON.stringify({ count, except: [] }));
  st.unfreeze(); m.saveTest(x); m.saveSet({ ...m.getSet(), pagesPer: 1, mask: [], maskAll: false, maskOn: false, byNo: true }); st.freeze();
  return x.id;
}, count);
// 올린 쪽 그림 주소를 걷은 차례로 남김(칸에 어느 학생 답안이 보이는지 맞춰 보려고)
const toUnit = async () => {
  sent.length = 0;
  await page.reload(); await page.waitForTimeout(400);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
  await page.evaluate(() => { const f = window.SSAM.files, orig = f.readPages; f.readPages = async (...a) => { const r = await orig.apply(f, a); window.__urls = r.pages.map(p => p.url); return r; }; });
};
// 1일째: 올리기 → (「채점 안 함」) → 번호 확인 → 채점
const unitDay1 = async (id, files, skips = []) => {
  await page.click(`${V} [data-un-open="${id}"]`);
  await page.setInputFiles(`${V} #unAnsFile`, files);
  await page.waitForFunction(n => document.querySelectorAll('.unit-box [data-st]').length === n, files.length);
  for (const i of skips) await page.click(`${V} [data-un="skip"][data-i="${i}"]`);
  await page.click(`${V} [data-un="toGrade"]`);
  await page.click(`${V} [data-un="grade"]`);
  await page.waitForSelector('#sheetRoot #noOk'); await page.click('#sheetRoot #noOk');
  await until(async () => (await unitTest(id)).students.filter(s => !s.skip).every(s => s.status === 'done'));
};
// 다음 날: 다시 열어 2단계에서 같은 스캔(걷은 차례)을 다시 올림
const unitDay2 = async (id, files) => {
  await toUnit();
  await page.click(`${V} [data-un-open="${id}"]`);
  await page.click(`${V} .steps [data-step="2"]`);
  await page.setInputFiles(`${V} #unAnsFile`, files);
  await page.waitForFunction(n => document.querySelectorAll('.unit-box [data-st] img').length === n, files.length);
};
const step2Rows = () => page.$$eval(`${V} [data-st]`, els => els.map(e => `${e.dataset.st}${e.querySelector('.chip') && e.querySelector('.chip').textContent === '채점 안 함' ? '(skip)' : ''}:${e.textContent.includes('스캔 없음') ? '없음' : '있음'}`).join(' '));

/* 활동지 */
const getAct = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:activity:a:' + id)), id);
const actSetup = (acts, count = 0) => page.evaluate(async ([acts, count]) => {
  (await import('./core/store.js')).freeze();
  for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k);
  localStorage.setItem('ssam:activity:set', JSON.stringify({ pagesPer: 1, maskOn: false, mask: [], maskAll: false }));
  if (count) localStorage.setItem('ssam:class', JSON.stringify({ count, except: [] }));
  for (const a of acts) localStorage.setItem('ssam:activity:a:' + a.id, JSON.stringify(a));
  localStorage.setItem('ssam:activity:list', JSON.stringify(acts.map(a => ({ id: a.id, title: a.meta.title, subject: a.meta.subject, date: a.meta.date, term: 2, n: 0, done: false, at: 1 }))));
}, [acts, count]);
const toAct = async () => { sent.length = 0; await page.reload(); await page.waitForTimeout(400); await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="activity"]'); };
const byNoAct = () => ({ id: 'acK', meta: { subject: '과학', unit: '1', lesson: '2', pages: '', title: '번호로', date: '2026-09-10', term: 2 }, sheet: { student: '1. 고르기', teacher: '' },
  items: [{ no: 1, type: 'choice', ask: '고르기', answer: '③', ok: '', part: '', src: 'answer' }], confirmed: true, students: [], done: false, link: null, createdAt: 1, byNo: true, noBox: { x: 0.6, y: 0, w: 0.35, h: 0.12 } });
const actGraded = () => JSON.stringify({ items: [{ no: 1, read: '③', mark: 'o', why: '', sure: true }], good: 'AI 잘함', next: '', level: 'ok', levelWhy: '' });
const actUpload = async files => { await page.waitForSelector(`${P} [data-bundle-pick="act3"]`); await page.setInputFiles('#bundleFile-act3', files); await page.waitForTimeout(800); if (await page.$('#sheetRoot #bundleOk')) await page.click('#sheetRoot #bundleOk'); };

// ONLY=byno 처럼 주면 그 시험만
const only = cases => (process.env.ONLY ? cases.filter(([n]) => n.includes(process.env.ONLY)) : cases);
await run('fix3-evalnew', only([
  ['[unit-byno-img-2] 번호로 맞춘 평가에 같은 스캔을 다시 올린 뒤 3단계에서 칸을 누르면 다른 학생 답안 대신 안내, [번호 읽기]로 맞추면 그 학생 답안(채점은 안 함)', async () => {
    READ = { 3: [3, 1, 2] };
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await unitSetup(3);
    await toUnit();
    const files = await scans(3);
    await unitDay1(id, files);
    // 같은 날은 번호를 읽은 쪽: 1번 칸은 1번이 쓴 둘째 장
    let urls = await page.evaluate(() => window.__urls);
    await page.click(`${V} [data-cell="1-1"]`);
    await page.waitForSelector('#sheetRoot .un-pages img');
    assert(urls.indexOf(await page.getAttribute('#sheetRoot .un-pages img', 'src')) === 1, '같은 날 1번 칸');
    await page.click('#sheetRoot [data-close]');
    await unitDay2(id, files);
    await page.click(`${V} [data-un="toGrade"]`);
    assert(/번호를 다시 읽기 전/.test(await page.textContent(V)), '3단계 알림: ' + (await page.textContent(V)).replace(/\s+/g, ' ').slice(0, 300));
    urls = await page.evaluate(() => window.__urls);
    await page.click(`${V} [data-cell="1-1"]`);
    await page.waitForSelector('#sheetRoot #unCellRead');
    assert(!(await page.$('#sheetRoot .un-pages img')), '번호를 읽기 전에 답안 그림이 보임');
    assert((await page.textContent('#sheetRoot')).includes('번호를 다시 읽은 뒤'), (await page.textContent('#sheetRoot')).replace(/\s+/g, ' '));
    const reads = count('[번호 읽기]'), grades = count('[단원평가 채점]');
    await page.click('#sheetRoot #unCellNos');
    await page.waitForSelector('#sheetRoot #noOk');
    await page.click('#sheetRoot #noOk');
    await page.waitForSelector('#sheetRoot .un-pages img');
    assert((await page.textContent('#sheetRoot h3')).includes('1번 · 1번 문항'), await page.textContent('#sheetRoot h3'));
    assert(urls.indexOf(await page.getAttribute('#sheetRoot .un-pages img', 'src')) === 1, '1번 칸에 다른 학생 답안');
    assert(count('[번호 읽기]') === reads + 1 && count('[단원평가 채점]') === grades, `번호 읽기 ${count('[번호 읽기]') - reads} · 채점 ${count('[단원평가 채점]') - grades}`);
    await page.click('#sheetRoot [data-close]');
    assert(!/번호를 다시 읽기 전/.test(await page.textContent(V)), '번호를 읽은 뒤에도 알림');
    await page.click(`${V} [data-cell="3-1"]`);
    await page.waitForSelector('#sheetRoot .un-pages img');
    assert(urls.indexOf(await page.getAttribute('#sheetRoot .un-pages img', 'src')) === 0, '3번 칸');
    await page.click('#sheetRoot [data-close]');
    const x = await unitTest(id);
    assert(rowsOf(x.students) === '1:done 2:done 3:done', rowsOf(x.students));
  }],
  ['[unit-byno-img-2] 번호로 맞춘 적이 없는 평가는 다시 올려도 3단계에서 답안 그림을 그대로 보여 줌', async () => {
    ai = async (head) => head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await page.evaluate(async () => {
      const st = await import('./core/store.js'), m = await import('./menus/evaluate/unit/unit-model.js');
      st.freeze();
      for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k);
      const x = m.newTest({ meta: { subject: '수학', grade: 3, unitNo: 1, date: '2026-10-29' }, key: { domains: [], items: [{ no: 1, content: '고르기', domain: '', type: 'choice', answer: '③', points: 100, criteria: '', pages: '' }] } });
      st.unfreeze(); m.saveTest(x); m.saveSet({ ...m.getSet(), pagesPer: 1, mask: [], maskAll: false, maskOn: false, byNo: false }); st.freeze();
      return x.id;
    });
    await toUnit();
    const files = await scans(2);
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, files);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 2);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await until(async () => (await unitTest(id)).students.every(s => s.status === 'done'));
    await unitDay2(id, files);
    await page.click(`${V} [data-un="toGrade"]`);
    assert(!/번호를 다시 읽기 전/.test(await page.textContent(V)), '번호로 맞추지 않은 평가에 알림');
    const urls = await page.evaluate(() => window.__urls);
    await page.click(`${V} [data-cell="2-1"]`);
    await page.waitForSelector('#sheetRoot .un-pages img');
    assert(urls.indexOf(await page.getAttribute('#sheetRoot .un-pages img', 'src')) === 1, '2번 칸');
    await page.click('#sheetRoot [data-close]');
  }],
  ['[byno-reread-blank-3] 번호로 맞춘 평가에 다시 올린 스캔의 빈 답안지 줄은 비워 둬도 [이대로 채점]이 눌리고, 그 쪽은 「채점 안 함」 자리에 붙음(결석생으로 채점하지 않음)', async () => {
    READ = { 3: [3, 1, 2], 4: [3, null, 1, 2] };
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await unitSetup(4);
    await toUnit();
    const files = await scans(4);
    await unitDay1(id, files, [1]); // 둘째 장은 번호를 안 쓴 빈 답안지 → 채점 안 함
    await unitDay2(id, files);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    const vals = await page.$$eval('#sheetRoot [data-noi]', els => els.map(e => e.value));
    assert(vals.join(',') === '3,,1,2', '확인 표 ' + vals.join(','));
    assert(!(await page.isDisabled('#sheetRoot #noOk')), '빈 줄 때문에 [이대로 채점]이 막힘: ' + await page.textContent('#sheetRoot #noMissing'));
    assert((await page.textContent('#sheetRoot [data-nowhy="1"]')).includes('채점 안 함'), await page.textContent('#sheetRoot [data-nowhy="1"]'));
    const grades = count('[단원평가 채점]');
    await page.click('#sheetRoot #noOk');
    // 모두 채점한 평가: 다시 채점할지 묻고, 빈 답안지는 세지 않음
    await page.waitForSelector('#sheetRoot #unRegradeOk');
    assert((await page.textContent('#sheetRoot')).includes('학생 3명'), (await page.textContent('#sheetRoot')).replace(/\s+/g, ' '));
    await page.click('#sheetRoot [data-close]');
    const x = await unitTest(id);
    assert(rowsOf(x.students.filter(s => !s.skip)) === '1:done 2:done 3:done', rowsOf(x.students));
    assert(x.students.filter(s => s.skip).length === 1 && !x.students.some(s => s.no === 4), rowsOf(x.students));
    assert(new Set(x.students.map(s => s.no)).size === x.students.length, '번호 겹침 ' + rowsOf(x.students));
    assert(count('[단원평가 채점]') === grades, '묻지 않고 채점함');
    await page.click(`${V} .steps [data-step="2"]`);
    const rows = await step2Rows();
    assert(/\(skip\):있음/.test(rows) && !rows.includes('없음'), rows);
  }],
  ['[byno-reread-blank-3] 처음 번호로 맞출 때는 그대로 못 읽은 줄을 고쳐야 채점(빈 줄로 둘 수 없음)', async () => {
    READ = { 3: [3, null, 2] };
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : '{}';
    const id = await unitSetup(3);
    await toUnit();
    await page.click(`${V} [data-un-open="${id}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, await scans(3));
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    assert(await page.isDisabled('#sheetRoot #noOk'), '못 읽은 줄이 있는데 [이대로 채점]이 켜짐');
    assert((await page.textContent('#sheetRoot [data-nowhy="1"]')).includes('번호를 못 읽었어요'), await page.textContent('#sheetRoot [data-nowhy="1"]'));
    await page.click('#sheetRoot [data-close]');
  }],
  ['[byno-skip-dup-4] 처음 번호로 맞출 때 「채점 안 함」 학생 번호가 읽은 번호와 겹치지 않고, 다시 읽어도 진짜 2번 쪽이 2번에 붙어 칸·[다시]가 먹힘', async () => {
    READ = { 3: [3, 1, 2], 4: [3, 5, 1, 2] };
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await unitSetup(5);
    await toUnit();
    const files = await scans(4);
    await unitDay1(id, files, [1]); // 둘째 장(5번이 씀)은 채점 안 함
    let x = await unitTest(id);
    assert(new Set(x.students.map(s => s.no)).size === 4, '번호 겹침 ' + rowsOf(x.students));
    assert(rowsOf(x.students.filter(s => !s.skip)) === '1:done 2:done 3:done', rowsOf(x.students));
    await page.click(`${V} .steps [data-step="2"]`);
    const nos = await page.$$eval(`${V} [data-st]`, els => els.map(e => e.dataset.st));
    assert(new Set(nos).size === 4, '2단계 번호 ' + nos.join(','));
    // 다음 날 같은 스캔을 다시 올려 번호를 다시 읽음(3·5·1·2)
    await unitDay2(id, files);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    const grades = count('[단원평가 채점]');
    await page.click('#sheetRoot #noOk');
    await page.waitForSelector('#sheetRoot #unRegradeOk');
    await page.click('#sheetRoot [data-close]');
    x = await unitTest(id);
    assert(rowsOf(x.students) === '1:done 2:done 3:done 5:skip', rowsOf(x.students));
    assert(count('[단원평가 채점]') === grades, '「채점 안 함」 답안지를 새 학생으로 채점함');
    await page.click(`${V} .steps [data-step="2"]`);
    assert(await step2Rows() === '1:있음 2:있음 3:있음 5(skip):있음', await step2Rows());
    await page.click(`${V} .steps [data-step="3"]`);
    const urls = await page.evaluate(() => window.__urls);
    await page.click(`${V} [data-cell="2-1"]`);
    await page.waitForSelector('#sheetRoot .un-pages img');
    assert(urls.indexOf(await page.getAttribute('#sheetRoot .un-pages img', 'src')) === 3, '2번 칸에 2번 답안');
    await page.click('#sheetRoot [data-close]');
    await page.click(`${V} [data-strow="2"] [data-un="retry"]`);
    await until(async () => count('[단원평가 채점]') === grades + 1);
  }],
  ['[byno-skip-dup-4] 이번 스캔에 쪽이 없는 학생의 [다시]를 누르면 말없이 끝내지 않고 알림', async () => {
    READ = { 3: [3, 1, 2] };
    ai = async (head, prompt) => head === '[번호 읽기]' ? noRead(prompt) : head === '[단원평가 채점]' ? unitGraded() : '{}';
    const id = await unitSetup(4);
    await toUnit();
    const files = await scans(3);
    await unitDay1(id, files);
    await unitDay2(id, files);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    // 선생님이 셋째 줄(2번)을 결석했던 4번으로 고침 → 2번은 이번 스캔에 쪽이 없음
    await page.fill('#sheetRoot [data-noi="2"]', '4');
    await page.click('#sheetRoot #noOk');
    await until(async () => (await unitTest(id)).students.some(s => s.no === 4 && s.status === 'done'));
    await sleep(300);
    const grades = count('[단원평가 채점]');
    await clearToast();
    await page.click(`${V} [data-strow="2"] [data-un="retry"]`);
    await sleep(300);
    assert((await toastText()).includes('스캔이 없어요'), JSON.stringify(await toastText()));
    assert(count('[단원평가 채점]') === grades, 'AI를 부름');
  }],
  ['[byno-skip-dup-4][byno-reread-blank-3] 활동지도: 처음 번호로 맞출 때 「채점 안 함」 학생 번호가 겹치지 않고, 다시 올린 스캔의 빈 답안지 줄은 비워 둬도 됨', async () => {
    READ = { 3: [3, 1, 2], 4: [3, null, 1, 2] };
    ai = async (head, prompt) => head === '[쪽 나누기]' ? JSON.stringify({ pages: [] }) : head === '[번호 읽기]' ? noRead(prompt) : head === '[활동지 채점]' ? actGraded() : '{}';
    await actSetup([byNoAct()], 4);
    await toAct();
    const files = await scans(4);
    await page.click(`${P} [data-ac-open="acK"]`);
    await actUpload(files);
    await until(async () => (await getAct('acK')).students.length === 4);
    await page.click(`${P} input[data-skip="1"]`); // 둘째 장은 빈 활동지 → 채점 안 함
    await sleep(200);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk'); await page.click('#sheetRoot #noOk');
    await until(async () => (await getAct('acK')).students.filter(s => !s.skip).every(s => s.status === 'done'));
    let a = await getAct('acK');
    assert(new Set(a.students.map(s => s.no)).size === 4, '번호 겹침 ' + rowsOf(a.students));
    await page.click(`${P} .steps [data-step="3"]`);
    const labels = await page.$$eval(`${P} .ac-stus li`, els => els.map(e => e.textContent.trim()));
    assert(new Set(labels).size === 4, '3단계 목록 ' + labels.join(' | '));
    // 다음 날 같은 스캔을 다시 올림: 빈 답안지 줄은 비워 두고 채점
    await toAct();
    await page.click(`${P} [data-ac-open="acK"]`);
    await page.click(`${P} .steps [data-step="3"]`);
    await actUpload(files);
    await page.waitForFunction(() => /쪽 4장/.test((document.querySelector('.act-box #acStus') || {}).textContent || ''));
    // 기준을 고쳐 다시 채점해야 하게(남은 학생이 있어야 [채점 시작]이 번호를 읽음)
    await page.evaluate(async () => { const m = await import('./menus/evaluate/activity/activity-model.js'); const a = m.getActivity('acK'); a.students.forEach(s => { if (s.status === 'done') s.stale = true; }); m.saveActivity(a); });
    await page.click(`${P} .steps [data-step="2"]`); await page.click(`${P} .steps [data-step="3"]`);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    const vals = await page.$$eval('#sheetRoot [data-noi]', els => els.map(e => e.value));
    assert(vals.join(',') === '3,,1,2', '확인 표 ' + vals.join(','));
    assert(!(await page.isDisabled('#sheetRoot #noOk')), '빈 줄 때문에 막힘');
    const grades = count('[활동지 채점]');
    await page.click('#sheetRoot #noOk');
    await until(async () => (await getAct('acK')).students.filter(s => !s.skip).every(s => s.status === 'done' && !s.stale));
    a = await getAct('acK');
    assert(rowsOf(a.students.filter(s => !s.skip)) === '1:done 2:done 3:done', rowsOf(a.students));
    assert(a.students.filter(s => s.skip).length === 1 && !a.students.some(s => s.no === 4), rowsOf(a.students));
    assert(count('[활동지 채점]') === grades + 3, '채점 ' + (count('[활동지 채점]') - grades));
  }],
  ['[act-crit-busy-5] 다른 활동지의 기준을 AI가 만드는 동안 이 활동지의 [AI로 기준 만들기]를 누르면 알림, 그 기준이 끝나면 이 활동지 기준도 저절로 만듦', async () => {
    let wait = 2500;
    ai = async (head, prompt) => { if (head !== '[활동지 기준]') return '{}'; await sleep(wait); return JSON.stringify({ items: [{ no: 1, type: 'write', ask: prompt.includes('활동 Y') ? 'Y 쓰기' : 'X 쓰기', answer: '예시', ok: 'o', part: 't', src: 'ai' }] }); };
    const mk = (id, title) => ({ id, meta: { subject: '국어', unit: '1', lesson: '1', pages: '', title, date: '2026-10-10', term: 2 }, sheet: { student: '1. 느낀 점을 써 봅시다.', teacher: '' }, items: [], confirmed: false, students: [], done: false, link: null, createdAt: 1 });
    await actSetup([mk('acX', '활동 X'), mk('acY', '활동 Y')]);
    await toAct();
    await page.click(`${P} [data-ac-open="acX"]`); // 2단계로 열림 → 기준 AI가 저절로 시작
    await until(async () => count('[활동지 기준]') === 1);
    await page.click(`${P} [data-ac="back"]`);
    await page.click(`${P} [data-ac-open="acY"]`);
    await page.waitForSelector(`${P} [data-ac="criteria"]`);
    assert((await page.textContent(`${P} .act-box`)).includes('다른 활동지의 기준을'), '다른 활동지 표시 없음');
    await clearToast();
    await humanClick(`${P} [data-ac="criteria"]`);
    assert((await toastText()).includes('다른 활동지의 기준을 만드는 중'), JSON.stringify(await toastText()));
    assert(count('[활동지 기준]') === 1, 'AI를 또 부름');
    // X가 끝나면 Y도 저절로
    await until(async () => count('[활동지 기준]') === 2, 8000);
    await until(async () => (await getAct('acY')).items.length === 1, 8000);
    await page.waitForFunction(() => /Y 쓰기/.test(document.querySelector('.act-box').innerHTML));
    assert((await getAct('acX')).items[0].ask === 'X 쓰기' && (await getAct('acY')).items[0].ask === 'Y 쓰기', '기준이 섞임');
    assert(!(await page.textContent(`${P} .act-box`)).includes('다른 활동지의 기준을'), '끝난 뒤에도 표시');
  }],
  ['[act-crit-busy-5] 기준이 있는 활동지에서 칸을 고치는 중에 다른 활동지 기준이 끝나도 칸·한글 조합이 그대로이고, 바로 옆 단추 첫 누름이 먹힘', async () => {
    ai = async (head) => { if (head !== '[활동지 기준]') return '{}'; await sleep(2000); return JSON.stringify({ items: [{ no: 1, type: 'write', ask: 'X 쓰기', answer: '예시', ok: 'o', part: 't', src: 'ai' }] }); };
    const mk = (id, title, items = []) => ({ id, meta: { subject: '국어', unit: '1', lesson: '1', pages: '', title, date: '2026-10-10', term: 2 }, sheet: { student: '1. 느낀 점을 써 봅시다.', teacher: '' }, items, confirmed: false, students: [], done: false, link: null, createdAt: 1 });
    await actSetup([mk('acX', '활동 X'), mk('acY', '활동 Y', [{ no: 1, type: 'write', ask: '느낀 점', answer: '', ok: '', part: '', src: 'teacher' }])]);
    await toAct();
    await page.click(`${P} [data-ac-open="acX"]`);
    await until(async () => count('[활동지 기준]') === 1);
    await page.click(`${P} [data-ac="back"]`);
    await page.click(`${P} [data-ac-open="acY"]`);
    const cell = `${P} textarea[data-it="1"][data-f="ok"]`;
    await page.click(cell);
    await page.keyboard.type('잘 씀');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '한', selectionStart: 1, selectionEnd: 1 });
    const el = await page.$(cell);
    await until(async () => (await getAct('acX')).items.length === 1, 8000);
    await sleep(300);
    assert(await page.evaluate(([e, s]) => e === document.querySelector(s) && document.activeElement === e, [el, cell]), '칸이 다시 만들어지거나 초점을 잃음');
    await cdp.send('Input.insertText', { text: '한' });
    assert(await page.inputValue(cell) === '잘 씀한', await page.inputValue(cell));
    // 바로 옆 [+ 문항]을 사람처럼 한 번 누르면 먹힘
    await humanClick(`${P} [data-ac="addItem"]`);
    await until(async () => (await getAct('acY')).items.length === 2, 3000);
    assert((await getAct('acY')).items[0].ok === '잘 씀한', JSON.stringify((await getAct('acY')).items[0]));
    assert(count('[활동지 기준]') === 1, '기준이 있는 활동지에서 AI를 부름');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]));
await t.close();
