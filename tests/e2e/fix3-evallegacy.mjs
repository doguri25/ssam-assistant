// 평가 옛 화면(평가지 채점·행특) 3차 고침 (11월 5일)
// 한꺼번에 넣은 정답 글의 「~ 이름: 답」은 그대로, 행특 메모 한꺼번에 넣기의 빈 메모 칸, [검토 점수 쓰기]로 수준이 바뀌면 평어를 다시 씀,
// 「채점에서 빼기」는 [쪽 순서 거꾸로] 뒤에도 그 평가지를 따라감, 학년을 정하지 않았으면 「[학년] 3학년」을 보내지 않음
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:class')) localStorage.setItem('ssam:class', JSON.stringify({ count: 5, except: [] }));
  window.__inv = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { window.__inv.push({ cmd, args }); if (cmd === 'neis_arm') return { gen: 1, secs: 300 }; if (cmd === 'app_version') return '0.0.0'; if (cmd === 'check_update') return { available: false }; return null; } },
    event: { listen: async () => () => {} }
  };
});
const calls = [], grades = [];
let scoreOf = null; // (prompt, model) → 점수(없으면 80)
await mockClaude(page, ({ prompt, images, body }) => {
  calls.push({ model: body.model, prompt, images });
  if (prompt.startsWith('[쪽 나누기]')) return JSON.stringify({ pages: [] });
  if (prompt.startsWith('[문장 검토]')) return JSON.stringify({ items: [] });
  if (prompt.includes('수행평가를 채점하는')) {
    grades.push({ prompt, model: body.model });
    const sc = scoreOf ? scoreOf(prompt, body.model) : 80;
    return JSON.stringify({ score: sc, summary: '요약' + sc, evidence: ['근거'], strengths: '꼼꼼함', improve: '검산', unreadable: false });
  }
  if (prompt.includes('채점 결과입니다')) return '[]';
  // 평어: 「N번 [수준] 평어」로 써서 어느 수준으로 썼는지 알 수 있게
  const lv = (prompt.match(/이번 수행평가에서 \[([^\]]+)\] 수준/) || [])[1] || '';
  return JSON.stringify([...prompt.matchAll(/^- (\d+)번 \(/gm)].map(m => ({ no: +m[1], text: `${m[1]}번 ${lv} 평어로 수를 바르게 계산함.` })));
});
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const shot = async (w, name = `답안${w}.png`) => ({ name, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: w, height: 420 } }) });
const txt = (name, body) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(body) });
const rows = () => page.$$eval('#grResults [data-grrow]', els => els.map(e => e.querySelector('.badge').textContent.trim() + (e.classList.contains('skip') ? 's' : '')));
const toastText = () => page.evaluate(() => (document.querySelector('#toast') || {}).textContent || '');
const resText = () => page.evaluate(() => document.querySelector('#grResults').textContent.replace(/\s+/g, ' '));
// 앞 단계의 늦은 저장이 덮지 않게 한 번 다시 열고 기다린 뒤, 저장을 멈추고 씀(다시 열면 풀림)
const setLS = async (set = {}, del = []) => {
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(700);
  await page.evaluate(async ([set, del]) => {
    (await import('./core/store.js')).freeze();
    for (const k of del) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(set)) localStorage.setItem(k, JSON.stringify(v));
  }, [set, del]);
};
const fresh = async (set = {}, del = []) => {
  await setLS({ 'ssam:grset': { maskOn: false, mask: [] }, ...set }, del);
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^ssam:(gr:|grs$)/.test(k)) localStorage.removeItem(k); });
  await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
  await page.waitForSelector('#grDrop');
};
const upload = async files => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
  await fc.setFiles(files);
  await page.waitForFunction(n => document.querySelector('#grSetup').textContent.includes(`학생 ${n}명`), files.length);
};
const title = async v => { await page.fill('#grTitle', v); await page.dispatchEvent('#grTitle', 'input'); };
const gradeAll = async () => {
  await page.click('[data-gr="start"]');
  await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
  await page.waitForTimeout(300);
};
const putBundle = async (files, card = true) => {
  await page.setInputFiles('#bundleFile-gr', files);
  if (card) { await page.waitForSelector('#sheetRoot #bundleOk', { timeout: 15000 }); await page.click('#sheetRoot #bundleOk'); }
};
// 사람처럼 누르기(누름 → 80ms → 뗌)
const press = async (sel, i = 0) => {
  const el = page.locator(sel).nth(i);
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
};
const infoOf = p => p.slice(p.indexOf('[평가 정보]'), p.indexOf('\n', p.indexOf('[수행평가]')));
const hkOpen = async () => {
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
  await page.waitForSelector('[data-hk="bulk"]');
};
const hkBulk = async text => {
  await page.click('[data-hk="bulk"]');
  await page.waitForSelector('#sheetRoot #hkBulkBox');
  await page.fill('#sheetRoot #hkBulkBox', text);
  await page.click('#sheetRoot #hkBulkOk');
  await page.waitForTimeout(800);
};
const hkMemos = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:hk')).students.map(s => [s.no, s.memo]));
const hkSeed = memo4 => ({ settings: { unit: 'char', min: 300, max: 500, variants: 1, ending: 'eum', grade: 3 }, students: [1, 2, 3, 4, 5].map(no => ({ id: 's' + no, no, label: '', memo: no === 4 ? memo4 : '', results: [], done: 0 })) });

await page.goto(url); await page.waitForTimeout(400);

await run('fix3-evallegacy', [
  // ---------- gr-grade3-5 (행특 자료를 쓰기 전에 먼저) ----------
  ['[gr-grade3-5] 평가계획·학급 학년·행특 학년을 정한 적이 없으면 채점·평어 요청에 「[학년] 3학년」을 보내지 않음', async () => {
    await fresh({}, ['ssam:hk', 'ssam:class:info']);
    await upload([await shot(300), await shot(310)]);
    await title('6학년 사회 2단원 서술형');
    const g0 = grades.length, c0 = calls.length;
    await gradeAll();
    const p = grades[g0].prompt;
    assert(infoOf(p) === '[평가 정보]\n[수행평가] 6학년 사회 2단원 서술형', JSON.stringify(infoOf(p)));
    const w = calls.slice(c0).filter(c => c.prompt.includes("'교과학습발달상황' 평어")).pop();
    assert(w && !w.prompt.includes('[학년]') && w.prompt.includes('[수행평가] 6학년 사회 2단원 서술형'), w && infoOf(w.prompt));
  }],
  ['[gr-grade3-5] 학급 메뉴에서 정한 학년(6학년)이 있으면 그 학년으로', async () => {
    await fresh({ 'ssam:class:info': { grade: 6, room: 2 } }, ['ssam:hk']);
    await upload([await shot(300)]);
    await title('사회 2단원 서술형');
    const g0 = grades.length;
    await gradeAll();
    assert(infoOf(grades[g0].prompt) === '[평가 정보]\n[학년] 6학년\n[수행평가] 사회 2단원 서술형', JSON.stringify(infoOf(grades[g0].prompt)));
  }],
  ['[gr-grade3-5] 행특 탭에서 고른 학년(3학년을 일부러 고름)은 그대로 씀', async () => {
    await setLS({}, ['ssam:hk', 'ssam:class:info']);
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await hkOpen();
    await page.waitForSelector('#hkGrade');
    await page.selectOption('#hkGrade', '5'); await page.selectOption('#hkGrade', '3');
    await page.waitForTimeout(700);
    await page.click('#menuTabs [data-tab="gr"]'); await page.waitForSelector('#grDrop');
    await upload([await shot(300)]);
    await title('곱셈');
    const g0 = grades.length;
    await gradeAll();
    assert(infoOf(grades[g0].prompt) === '[평가 정보]\n[학년] 3학년\n[수행평가] 곱셈', JSON.stringify(infoOf(grades[g0].prompt)));
    assert(errors.length === 0, errors.join(' | '));
  }],
  // ---------- gr-maskkey-1 ----------
  ['[gr-maskkey-1] 「문화유산 이름: 석굴암」「산 이름: 한라산」 정답을 한꺼번에 넣어도 채점 요청 [채점 기준]에 그대로, 이름 칸만 가림', async () => {
    await fresh();
    const key = '4학년 사회 문화유산 평가 정답\n1. 문화유산 이름: 석굴암\n2. 산 이름: 한라산\n3. 마을 이름: 하회마을\n| 문화재 이름 | 석가탑 |\n예시 답안 학생 이름: 김민수\n채점 기준: 세 가지 모두 맞으면 상';
    await putBundle([txt('사회 정답.txt', key), await shot(300, 's-1.png'), await shot(310, 's-2.png')]);
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 2명'));
    await title('사회');
    const g0 = grades.length;
    await gradeAll();
    const p = grades[g0].prompt, crit = p.slice(p.indexOf('[채점 기준]'), p.indexOf('[할 일]'));
    assert(['1. 문화유산 이름: 석굴암', '2. 산 이름: 한라산', '3. 마을 이름: 하회마을', '| 문화재 이름 | 석가탑 |'].every(x => crit.includes(x)), crit);
    assert(crit.includes('학생 이름: ○○○') && !p.includes('김민수'), crit);
  }],
  // ---------- gr-reverse-skip-4 ----------
  ['[gr-reverse-skip-4] 2번째 쪽(a2)을 채점에서 뺀 뒤 [쪽 순서 거꾸로] → 「채점 안 함」은 a2를 따라 4번 자리로, a4는 채점함', async () => {
    await fresh();
    await upload([await shot(300, 'a1.png'), await shot(310, 'a2.png'), await shot(320, 'a3.png'), await shot(330, 'a4.png'), await shot(340, 'a5.png')]);
    await page.evaluate(() => document.querySelector('#grView').classList.add('show-pane'));
    await press('#grResults [data-grskip]', 1);
    await until(async () => (await rows()).join(',') === '1,2s,3,4,5', 3000);
    const which = async () => {
      const id = await page.evaluate(() => document.querySelector('#grResults [data-grrow].skip [data-grview1]').dataset.grview1);
      await page.click(`#grResults [data-grview1="${id}"]`); await page.waitForSelector('#sheetRoot figcaption');
      const c = await page.textContent('#sheetRoot figcaption');
      await page.click('#sheetRoot [data-close]'); await page.waitForTimeout(150);
      return c;
    };
    assert((await which()).includes('a2.png'), '뺀 쪽이 a2가 아님');
    await press('[data-gr="reverse"]');
    await until(async () => (await rows()).join(',') === '1,2,3,4s,5', 3000);
    assert((await which()).includes('a2.png'), '거꾸로 뒤 뺀 쪽이 a2가 아님');
    // 다시 거꾸로 하면 처음 자리로
    await press('[data-gr="reverse"]');
    await until(async () => (await rows()).join(',') === '1,2s,3,4,5', 3000);
    assert(errors.length === 0, errors.join(' | '));
  }],
  // ---------- gr-rvscore-stale-3 ----------
  ['[gr-rvscore-stale-3] 채점·평어를 마친 뒤 [검토 점수 쓰기]로 수준이 바뀌면 바뀐 학생 평어를 새 수준으로 다시 씀(「수준이 바뀌었어요」가 남지 않음)', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:ai-roles', JSON.stringify({ review: null, tasks: { grade: { main: null, reviewOn: true, review: { engine: 'claude', model: 'claude-haiku-5-5' } } } })));
    let gi = 0;
    scoreOf = (prompt, model) => (model === 'claude-haiku-5-5' ? 20 : [90, 80, 70, 60, 50][gi++ % 5]);
    await fresh();
    await upload([await shot(300), await shot(310), await shot(320), await shot(330), await shot(340)]);
    await title('곱셈');
    await gradeAll();
    await page.evaluate(() => document.querySelector('#grView').classList.add('show-pane'));
    await page.waitForSelector('[data-rv-use^="grs:"]');
    assert((await resText()).includes('채점과 평어를 마쳤어요'), (await resText()).slice(0, 200));
    const c0 = calls.length;
    await press('[data-rv-use^="grs:"]');
    // 바뀐 학생 평어를 다시 씀 → 다 쓰면 「마쳤어요」, 「수준이 바뀌었어요」 없음
    await until(async () => calls.slice(c0).some(c => c.prompt.includes("'교과학습발달상황' 평어")), 8000);
    await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 15000 });
    await until(async () => { const r = await resText(); return r.includes('채점과 평어를 마쳤어요') && !r.includes('수준이 바뀌었어요'); }, 8000);
    // 저장은 조금 미뤄서 하므로 다 쓴 기록이 저장될 때까지 기다림
    const savedStudents = () => page.evaluate(() => { const ids = JSON.parse(localStorage.getItem('ssam:grs') || '[]'); const g = ids.length && JSON.parse(localStorage.getItem('ssam:gr:' + ids[0]) || 'null'); return g ? g.students : null; });
    let st = null;
    await until(async () => { st = await savedStudents(); return !!st && st.length === 5 && st.every(s => !s.stale && s.text); }, 8000).catch(() => {});
    assert(st && st.every(s => !s.stale && s.text), JSON.stringify(st && st.map(s => [s.no, s.level, s.stale, s.text])));
    const LV = { top: '최상', high: '상', mid: '중', low: '하' };
    assert(st.every(s => s.text.startsWith(`${s.no}번 ${LV[s.level]} 평어`)), JSON.stringify(st.map(s => [s.no, s.level, s.text])));
    assert(!(await resText()).includes('남은 평어 쓰기'), '남은 평어 쓰기 단추가 남음');
    assert(errors.length === 0, errors.join(' | '));
    scoreOf = null;
    await page.evaluate(() => localStorage.removeItem('ssam:ai-roles'));
  }],
  // ---------- hk-bulk-blank-2 ----------
  ['[hk-bulk-blank-2] 엑셀 번호·메모 칸에서 4번 메모 칸이 비면 4번에 써 둔 메모는 그대로(「4」로 덮지 않음), 알림은 넣은 4명', async () => {
    await setLS({ 'ssam:hk': hkSeed('정리정돈을 잘하고 우유 당번을 한 학기 동안 성실히 함') });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await hkOpen();
    await hkBulk('1\t성실함\r\n2\t친구를 잘 도와줌\r\n3\t독서를 즐김\r\n4\t\r\n5\t발표에 자신감\r\n');
    const m = await toastText();
    assert(m.includes('4명의 메모를 넣었어요'), m);
    assert(JSON.stringify(await hkMemos()) === JSON.stringify([[1, '성실함'], [2, '친구를 잘 도와줌'], [3, '독서를 즐김'], [4, '정리정돈을 잘하고 우유 당번을 한 학기 동안 성실히 함'], [5, '발표에 자신감']]), JSON.stringify(await hkMemos()));
  }],
  ['[hk-bulk-blank-2] 번호 없이 메모 한 칸만 붙일 때 3번 칸이 비어도 4번 메모는 4번에(한 명씩 당겨지지 않음)', async () => {
    await setLS({ 'ssam:hk': hkSeed('') });
    await page.goto(url, { timeout: 30000 }); await page.waitForTimeout(500);
    await hkOpen();
    await hkBulk('성실함\n친구를 잘 도와줌\n\n독서를 즐김\n');
    assert((await toastText()).includes('3명의 메모를 넣었어요'), await toastText());
    assert(JSON.stringify(await hkMemos()) === JSON.stringify([[1, '성실함'], [2, '친구를 잘 도와줌'], [3, ''], [4, '독서를 즐김'], [5, '']]), JSON.stringify(await hkMemos()));
    assert(errors.length === 0, errors.join(' | '));
  }]
]);
await t.close();
