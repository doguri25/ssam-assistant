// 2026-11-04 고침(단원평가·활동지): 활동지 번호로 다시 맞추기·이름 칸·선생님이 고친 글·다른 활동지 채점 중 올리기·검토 중 멈추기,
// 단원평가 정답표 칸 옮기기·평어 쓰는 중 칸·새 평가 정답지 읽는 중 나가기
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
const grades = () => sent.filter(s => s.head === '[활동지 채점]').length;
const graded = (marks = { no: 1, read: '③', mark: 'o', why: '', sure: true }, good = '잘함', next = '') => JSON.stringify({ items: [marks], good, next, level: 'ok', levelWhy: '' });

/* 활동지 */
const mkAct = (id, title, extra = {}) => ({ id, meta: { subject: '과학', unit: '1', lesson: '2', pages: '', title, date: '2026-09-10', term: 2 }, sheet: { student: '1. 고르기', teacher: '' },
  items: [{ no: 1, type: 'choice', ask: '고르기', answer: '③', ok: '', part: '', src: 'answer' }], confirmed: true, students: [], done: false, link: null, createdAt: 1, ...extra });
const getAct = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:activity:a:' + id)), id);
const NOMASK = { pagesPer: 1, maskOn: false, mask: [], maskAll: false };
async function seed(acts, { set = NOMASK, roles = null, cls = null } = {}) {
  await page.evaluate(({ acts, set, roles, cls }) => {
    for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k);
    localStorage.setItem('ssam:activity:set', JSON.stringify(set));
    if (roles) localStorage.setItem('ssam:ai-roles', JSON.stringify(roles));
    if (cls) localStorage.setItem('ssam:class', JSON.stringify(cls));
    for (const a of acts) localStorage.setItem('ssam:activity:a:' + a.id, JSON.stringify(a));
    localStorage.setItem('ssam:activity:list', JSON.stringify(acts.map((a, i) => ({ id: a.id, title: a.meta.title, subject: a.meta.subject, date: a.meta.date, term: 2, n: 0, done: false, at: i + 1 }))));
  }, { acts, set, roles, cls });
  sent.length = 0;
  await page.reload(); await page.waitForTimeout(400);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="activity"]');
}
const pngs = n => page.evaluate(async n => {
  const out = [];
  for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 420); g.fillStyle = '#123'; g.fillRect(30 + i * 9, 90, 140, 30); out.push(c.toDataURL('image/png').split(',')[1]); }
  return out;
}, n);
const scans = async n => (await pngs(n)).map((b, i) => ({ name: `스캔${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b, 'base64') }));
async function upload(files) {
  await page.waitForSelector(`${P} [data-bundle-pick="act3"]`);
  await page.setInputFiles('#bundleFile-act3', files);
  await page.waitForTimeout(800);
  if (await page.$('#sheetRoot #bundleOk')) await page.click('#sheetRoot #bundleOk');
}
const openAct = async (id, step) => { await page.click(`${P} [data-ac-open="${id}"]`); if (step) await page.click(`${P} .steps [data-step="${step}"]`); };

/* 단원평가 */
const toUnit = async () => {
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== 'ssam:engine') localStorage.removeItem(k); });
  sent.length = 0;
  await page.reload(); await page.waitForTimeout(400);
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
};
const unitTest = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const active = () => page.evaluate(() => { const e = document.activeElement; return e ? (e.dataset.k || e.dataset.py || e.id || e.tagName) : ''; });

// ONLY=act-switch 처럼 주면 그 시험만
const only = cases => (process.env.ONLY ? cases.filter(([n]) => n.includes(process.env.ONLY)) : cases);
await run('fix1104-evalnew', only([
  ['[act-byno-1] 번호로 맞춘 활동지에 같은 스캔(걷은 순서)을 다시 올려 번호를 다시 읽어도 결과·고친 칸은 그 번호 학생에 그대로', async () => {
    let k = 0;
    ai = async head => head === '[쪽 나누기]' ? JSON.stringify({ pages: [] })
      : head === '[번호 읽기]' ? JSON.stringify({ nos: [3, 1, 2].map((no, i) => ({ i: i + 1, no, sure: true })) })
      : head === '[활동지 채점]' ? graded(undefined, 'AI' + (k++)) : '{}';
    await seed([mkAct('acB', '번호 시험', { byNo: true, noBox: { x: 0.6, y: 0, w: 0.35, h: 0.12 } })], { cls: { count: 3, except: [] } });
    const files = await scans(3);
    await openAct('acB');
    await upload(files);
    await until(async () => (await getAct('acB')).students.length === 3);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    await page.click('#sheetRoot #noOk');
    await until(async () => (await getAct('acB')).students.every(s => s.status === 'done'));
    // 선생님이 학생마다 잘한 점·칸을 고쳐 둠(누구 것인지 번호를 붙여)
    await page.evaluate(() => { const k = 'ssam:activity:a:acB', x = JSON.parse(localStorage.getItem(k)); x.students.forEach(s => { s.good = '학생' + s.no + '의 글'; s.marks[1].manual = true; s.marks[1].read = '학생' + s.no + '이 쓴 답'; }); localStorage.setItem(k, JSON.stringify(x)); });
    // 다음 날: 같은 스캔을 걷은 순서 그대로 다시 올리고 [채점] → 번호 확인
    await page.reload(); await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="activity"]');
    await openAct('acB', 3);
    await upload(files);
    await page.waitForFunction(() => /쪽 3장/.test((document.querySelector('.act-box #acStus') || {}).textContent || ''));
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #noOk');
    await page.click('#sheetRoot #noOk');
    await page.waitForTimeout(600);
    const a = await getAct('acB');
    assert(JSON.stringify(a.students.map(s => s.no)) === '[1,2,3]', JSON.stringify(a.students.map(s => s.no)));
    assert(a.students.every(s => s.good === `학생${s.no}의 글` && s.marks[1].read === `학생${s.no}이 쓴 답`), a.students.map(s => `${s.no}:${s.good}/${s.marks[1].read}`).join(', '));
  }],
  ['[act-mask-2] 이 활동지에 이름 칸이 없으면 지난 칸이 있어도 AI 채점 전에 이름 칸을 정하게 함(지난 칸을 먼저 보여 줌)', async () => {
    ai = async head => head === '[쪽 나누기]' ? JSON.stringify({ pages: [] }) : head === '[활동지 채점]' ? graded() : '{}';
    await seed([mkAct('acM', '새 양식 활동지')], { set: { pagesPer: 1, maskOn: true, mask: [{ x: 0.7, y: 0, w: 0.3, h: 0.08 }], maskAll: false } });
    await openAct('acM');
    await upload(await scans(1));
    await page.waitForFunction(() => /학생 1명/.test((document.querySelector('.act-box #acStus') || {}).textContent || ''));
    const note = (await page.textContent(`${P} .act-set:has(#acMaskOn)`)).replace(/\s+/g, ' '); // 스캔 설정은 접힌 줄(스펙 2026-11-14-ui-tidy §2), 이름 칸 줄은 그대로
    assert(note.includes('아직 정하지 않음') && !note.includes('정해 둠'), note);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector('#sheetRoot #mkStage');
    await page.waitForTimeout(300);
    assert(grades() === 0, 'AI 채점을 부름: ' + grades());
    assert(await page.locator('#sheetRoot #mkBoxes .mk').count() === 1, '지난 칸을 먼저 보여 주지 않음');
    // 지난 칸 그대로 [다 했어요] → 이 활동지 칸으로 저장 → 채점
    await page.click('#sheetRoot #mkOk');
    await until(async () => ((await getAct('acM')).mask || []).length === 1);
    await page.click(`${P} [data-ac="grade"]`);
    await until(async () => (await getAct('acM')).students[0].status === 'done');
    assert(grades() === 1, String(grades()));
  }],
  ['[act-regrade-3] 선생님이 고친 잘한 점은 기준을 고쳐 다시 채점해도 그대로, 고치지 않은 더 해 볼 점은 새 AI 글', async () => {
    let n = 0;
    ai = async head => head === '[쪽 나누기]' ? JSON.stringify({ pages: [] }) : head === '[활동지 채점]' ? graded(undefined, `AI 잘한 점 ${n}`, `AI 더 해 볼 점 ${n++}`) : '{}';
    await seed([mkAct('acR', '다시 채점')]);
    await openAct('acR');
    await upload(await scans(1));
    await until(async () => (await getAct('acR')).students.length === 1);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await until(async () => (await getAct('acR')).students[0].status === 'done');
    await page.waitForTimeout(300);
    await page.fill(`${P} input[data-good="1"]`, '선생님이 다듬은 잘한 점');
    await page.click(`${P} .steps [data-step="2"]`);
    await page.fill(`${P} textarea[data-it="1"][data-f="ask"]`, '알맞은 것 고르기');
    await page.click(`${P} [data-ac="confirm"]`);
    await page.click(`${P} .steps [data-step="4"]`);
    assert((await getAct('acR')).students[0].stale, '다시 채점 표시 없음');
    await page.click(`${P} [data-ac="grade"]`);
    await until(async () => !(await getAct('acR')).students[0].stale);
    const s = (await getAct('acR')).students[0];
    assert(s.good === '선생님이 다듬은 잘한 점' && s.next === 'AI 더 해 볼 점 1', JSON.stringify({ good: s.good, next: s.next }));
  }],
  ['[act-switch-4] 활동지 X를 채점하는 중에는 다른 활동지 Y에 학생 스캔을 올리지 않고 알림, X는 끝까지 채점', async () => {
    ai = async head => { if (head === '[활동지 채점]') { await sleep(1500); return graded(); } return head === '[쪽 나누기]' ? JSON.stringify({ pages: [] }) : '{}'; };
    await seed([mkAct('acX', '활동지 X'), mkAct('acY', '활동지 Y')]);
    const files = await scans(6);
    await openAct('acX');
    await upload(files);
    await until(async () => (await getAct('acX')).students.length === 6);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await page.waitForSelector(`${P} [data-ac="stop"]`);
    await page.click(`${P} [data-ac="back"]`);
    await openAct('acY');
    await page.waitForSelector(`${P} [data-bundle-pick="act3"]`);
    await page.setInputFiles('#bundleFile-act3', files);
    await page.waitForFunction(() => ((document.querySelector('#toast') || {}).textContent || '').includes('다른 활동지를 채점하는 중'), null, { timeout: 8000 });
    // 떠 있는 버튼으로 넣어도 막음
    const msg = await page.evaluate(() => window.SSAM.activityInbox.put('acY', []));
    assert(String(msg).includes('다른 활동지를 채점하는 중'), String(msg));
    await until(async () => (await getAct('acX')).students.every(s => s.status !== 'idle'), 30000);
    const x = await getAct('acX'), y = await getAct('acY');
    assert(x.students.every(s => s.status === 'done'), x.students.map(s => `${s.no}:${s.status}${s.err ? '(' + s.err + ')' : ''}`).join(', '));
    assert(!y.students.length, 'Y에 학생이 생김: ' + y.students.length);
  }],
  ['[act-stop-rv-8] 검토 AI가 보는 중에 [멈추기]를 누르면 「검토하지 못했어요」를 붙이지 않음', async () => {
    ai = async head => {
      if (head === '[활동지 검토]') { await sleep(4000); return JSON.stringify({ items: [{ no: 1, mark: 'x', why: '' }] }); }
      return head === '[쪽 나누기]' ? JSON.stringify({ pages: [] }) : head === '[활동지 채점]' ? graded({ no: 1, read: '②', mark: 'o', why: '', sure: true }) : '{}';
    };
    await seed([mkAct('acS', '검토 멈추기')], { roles: { review: null, tasks: { grade: { main: null, reviewOn: true, review: { engine: 'claude', model: 'claude-opus-5-5' } } } } });
    await openAct('acS');
    await upload(await scans(1));
    await until(async () => (await getAct('acS')).students.length === 1);
    await page.click(`${P} [data-ac="toGrade"]`);
    await page.click(`${P} [data-ac="grade"]`);
    await until(async () => (await getAct('acS')).students[0].status === 'done');
    await until(async () => sent.some(s => s.head === '[활동지 검토]'));
    await page.click(`${P} [data-ac="stop"]`);
    await page.waitForTimeout(800);
    const s = (await getAct('acS')).students[0];
    assert(s.status === 'done' && !s.rvErr, JSON.stringify({ status: s.status, rvErr: s.rvErr }));
    assert(!(await page.textContent(`${P} #acGrid`)).includes('검토하지 못했어요'), await page.textContent(`${P} #acGrid`));
  }],
  ['[unit-key-focus-5] 정답표·평가 정보 칸을 고치고 Tab이나 다른 칸 클릭으로 옮겨 바로 쓴 글이 들어감, 합계 줄은 바로 바뀜', async () => {
    await toUnit();
    await page.click(`${V} [data-un="sample"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    await page.click(`${V} .steps [data-step="1"]`);
    await page.click(`${V} [data-k="1-answer"]`);
    await page.keyboard.press('End'); await page.keyboard.type('X');
    await page.keyboard.press('Tab');
    await page.keyboard.type('7');
    assert(await active() === '1-points', await active());
    assert(await page.inputValue(`${V} [data-k="1-points"]`) === '7', await page.inputValue(`${V} [data-k="1-points"]`));
    assert((await unitTest('sample-1')).key.items[0].answer.endsWith('X'), '정답 저장');
    // 배점을 고치고 다음 칸으로 → 합계·경고 줄은 바로
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => /102점/.test(document.querySelector('.unit-box .un-sum').textContent));
    assert((await page.textContent(`${V} .un-sum`)).includes('100점이 아니에요'), await page.textContent(`${V} .un-sum`));
    assert(await active() === '1-criteria', await active());
    // 2번 평가 내용을 고치고 마우스로 3번 평가 내용 칸을 눌러 바로 쓰기
    await page.click(`${V} [data-k="2-content"]`);
    await page.keyboard.press('End'); await page.keyboard.type('!');
    await page.click(`${V} [data-k="3-content"]`);
    await page.keyboard.type('가나다');
    assert(await active() === '3-content' && (await page.inputValue(`${V} [data-k="3-content"]`)).includes('가나다'), await active() + ' ' + await page.inputValue(`${V} [data-k="3-content"]`));
    // 평가 정보: 단원 이름 → Tab → 회차
    await page.click(`${V} #unUnitName`); await page.keyboard.press('End'); await page.keyboard.type('요');
    await page.keyboard.press('Tab'); await page.keyboard.type('3');
    assert(await active() === 'unRound' && await page.inputValue(`${V} #unRound`) === '3', await active() + ' ' + await page.inputValue(`${V} #unRound`));
    // 칸을 떠나면 저장한 대로 다시 그림
    await page.click(`${V} .un-sum`);
    await page.waitForFunction(() => /\(3회\)/.test(document.querySelector('.unit-box .un-title').textContent));
    const x = await unitTest('sample-1');
    assert(x.key.items[0].points === 7 && x.key.items[1].content.endsWith('!') && x.key.items[2].content.includes('가나다') && x.meta.unitName.endsWith('요') && x.meta.round === 3, JSON.stringify([x.key.items.slice(0, 3), x.meta]));
    assert(await page.inputValue(`${V} [data-k="1-points"]`) === '7', '다시 그린 배점');
  }],
  ['[unit-py-ime-6] [평어 쓰기] 중 직접 쓰던 칸은 AI가 끝나도 칸·글이 그대로, 다른 칸은 AI 글, 떠나면 화면과 저장이 같음', async () => {
    ai = async (head, prompt) => { const nos = [...prompt.matchAll(/^- (\d+)번 \|/gm)].map(m => Number(m[1])); await sleep(2000); return JSON.stringify({ students: nos.map(no => ({ no, text: `${no}번 AI 초안임.` })) }); };
    await toUnit();
    await page.click(`${V} [data-un="sample"]`);
    await page.click(`${V} [data-unv="results"]`);
    await page.click(`${V} [data-rv="pyeongeo"]`);
    await page.click(`${V} [data-un="pyAI"]`);
    await page.click(`${V} textarea[data-py="3"]`);
    await page.keyboard.type('3번은 내가 직접 쓰는 중', { delay: 30 });
    await page.waitForFunction(() => !document.querySelector('.unit-box [data-un="pyAI"][disabled]'), null, { timeout: 15000 });
    await page.keyboard.type(' 계속');
    await page.waitForTimeout(200);
    assert(await active() === '3', '쓰던 칸을 빼앗김: ' + await active());
    assert(await page.inputValue(`${V} textarea[data-py="3"]`) === '3번은 내가 직접 쓰는 중 계속', await page.inputValue(`${V} textarea[data-py="3"]`));
    assert(await page.inputValue(`${V} textarea[data-py="1"]`) === '1번 AI 초안임.', '다른 칸: ' + await page.inputValue(`${V} textarea[data-py="1"]`));
    await page.click(`${V} .m-head h2`);
    await page.waitForTimeout(300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:pyeongeo:국어')).students);
    assert(saved[3].text === '3번은 내가 직접 쓰는 중 계속' && saved[1].text === '1번 AI 초안임.', JSON.stringify(saved));
    assert(await page.inputValue(`${V} textarea[data-py="3"]`) === saved[3].text, '화면과 저장이 다름');
  }],
  ['[unit-draft-7] 새 단원평가: AI가 답안을 읽는 동안 [‹ 목록]으로 나가도 읽은 답안으로 단원평가를 만들고 알림', async () => {
    ai = async () => { await sleep(1500); return JSON.stringify({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 2, round: 1 }, domains: ['계산'], items: [{ no: 1, content: '덧셈', domain: '계산', type: 'short', answer: '12', points: 50 }, { no: 2, content: '뺄셈', domain: '계산', type: 'short', answer: '3', points: 50 }] }); };
    await toUnit();
    await page.click(`${V} #unNew`);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } });
    await page.setInputFiles(`${V} #unKeyFile`, { name: '정답지.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => /AI가 답안을 읽는 중/.test((document.querySelector('.unit-box #unKeyMsg') || {}).textContent || ''));
    await page.click(`${V} [data-un="back"]`);
    await until(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:list') || '[]'))).length === 1, 8000);
    const list = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:list')));
    assert((await unitTest(list[0].id)).key.items.length === 2, '문항');
    await page.waitForSelector(`${V} [data-un-open="${list[0].id}"]`);
    assert((await toastText()).includes('새 단원평가를 만들었어요'), await toastText());
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]));
await t.close();
