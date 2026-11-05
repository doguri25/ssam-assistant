// 2026-11-05 3차 버그 찾기에서 고친 것(품의 화면): 사유 칸에 커서를 둔 채 견적서가 들어와도 화면의 사유가 새 금액(저장과 같음)·커서 그대로,
// 행사계획 [품의로 이어 가기]도 초안 없이 쓰던 품의가 있으면 바꿀지 물어봄, 「산출 내역 칸마다」 조각이 앱 한도를 넘으면 「표 한 번에」로 넣고 알림
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
const JPG = { name: '견적.jpg', mimeType: 'image/jpeg', buffer: readFileSync(join(FIXTURES, 'photo-1.jpg')) };
const INTRO = '교실 물품을 다음과 같이 구입하고자 합니다.';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let readDelay = 0, readReply = null;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:purchase:view')) localStorage.setItem('ssam:purchase:view', JSON.stringify('full'));
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[품의 넣기]')) { await sleep(readDelay); return JSON.stringify(readReply || { items: [{ name: '칭찬 스티커', unit: '장', qty: 10, price: 500 }], shipping: [], fields: {} }); }
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '교실 물품 구입', intro: INTRO });
  return '[]';
});
const P = 'section[data-menu="purchase"]';
const V = 'section[data-menu="plan"]';
const cur = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'));
const recent = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:recent') || '[]'));
const reason = () => page.inputValue(`${P} #pcReason`);
const budget = s => (String(s).match(/소요 예산: [^\n]*/) || [''])[0];
// 앞 시험의 늦은 저장이 덮지 않게 지금 페이지의 저장을 멈추고 씀(다시 열면 풀림)
const fresh = (form = {}, extra = {}) => page.evaluate(async ([form, extra]) => {
  (await import('./core/store.js')).freeze();
  for (const x of Object.keys(localStorage)) if (/^ssam:purchase:(current|recent|templates)$/.test(x) || x === 'ssam:inbox' || x === 'ssam:queueCalc') localStorage.removeItem(x);
  localStorage.setItem('ssam:purchase:current', JSON.stringify({ id: 'pcA', form: { type: 'goods', project: '교실 물품', purpose: '수업 준비', items: [{ name: '실험 재료', spec: '', unit: '개', qty: '10', price: '3000' }], ...form }, draft: null }));
  for (const [k, v] of Object.entries(extra)) localStorage.setItem('ssam:' + k, JSON.stringify(v));
}, [form, extra]);
const go = async () => {
  await page.reload({ timeout: 20000 }); await page.waitForTimeout(400);
  await page.click('nav.app-side [data-menu-go="purchase"]'); await page.click('#menuTabs [data-tab="new"]');
  await page.waitForSelector(`${P} #pcIntake`);
  readDelay = 0; readReply = null;
};
const draft = async () => { await page.click(`${P} [data-pc="draft"]`); await page.waitForFunction(s => (document.querySelector(`${s} #pcTitle`) || {}).value, P); await page.waitForTimeout(200); };
const has = name => () => page.waitForFunction(n => (JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null') || { form: { items: [] } }).form.items.some(i => i.name === n), name, { timeout: 8000 });
/* 사유 칸을 누르고 커서를 둠: 'intro' = 「2.」 줄 끝, 'end' = 맨 끝 → 커서 자리 */
async function caret(where) {
  await page.click(`${P} #pcReason`);
  return page.evaluate(([s, w]) => {
    const ta = document.querySelector(`${s} #pcReason`), v = ta.value;
    const n = w === 'end' ? v.length : v.indexOf('\n', v.indexOf('\n') + 1);
    ta.setSelectionRange(n, n);
    return n;
  }, [P, where]);
}
const sel = () => page.evaluate(s => { const ta = document.querySelector(`${s} #pcReason`); return { focus: document.activeElement === ta, a: ta.selectionStart, b: ta.selectionEnd, len: ta.value.length }; }, P);
/* 사람처럼 누름(누르고 80ms 뒤 뗌) */
async function human(selector) {
  const b = await page.locator(selector).first().boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
}
/* 떠 있는 버튼 확인 카드: 견적서 · 지금 쓰는 품의에 더하기 → [실행] */
async function inboxAdd() {
  await page.setInputFiles('#inboxFile', JPG);
  await page.waitForSelector('#sheetRoot #ibKind');
  await page.selectOption('#sheetRoot #ibKind', 'quote');
  await page.waitForSelector('#sheetRoot [data-ib-field="where"]');
  await page.click('#sheetRoot #ibRun');
  await page.waitForTimeout(300);
}
/* Windows 앱인 척: queue_arm 등 부른 것을 모아 둠 */
const fakeApp = () => page.evaluate(() => {
  window.__calls = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, args) => { window.__calls.push([cmd, JSON.parse(JSON.stringify(args || {}))]); if (cmd === 'queue_arm' && args.items.length > 250) throw '한 번에 250개까지 차례로 붙여넣을 수 있어요'; return cmd === 'queue_arm' ? { gen: 7, secs: 900 } : null; } },
    event: { listen: async () => () => {} }
  };
});
const calls = () => page.evaluate(() => window.__calls);
const many = n => Array.from({ length: n }, (_, i) => ({ name: `도서 ${i + 1}`, spec: '', unit: '권', qty: '1', price: '10000' }));
/* 행사계획 3단계(문서까지 만든 행사) — fresh()로 저장을 멈추기 전에, 그 뒤 다시 열어야 화면에 보임 */
const seedEvent = () => page.evaluate(async () => {
  (await import('./core/store.js')).flushAll();
  localStorage.removeItem('ssam:events');
  const m = await import('./menus/plan/event-model.js');
  const opt = [{ label: '새로운 안', timetable: [{ time: '09:00', activity: '개회식' }], budget: [{ name: '상품', amount: 300000 }] }];
  const id = m.saveEvent({ ...m.newEvent(), name: '가을 운동회', purpose: '협동심', grades: '전교생', date: '2027-05-06', place: '운동장', outdoor: true, options: m.normOptions(opt), picked: 0,
    docs: { plan: '계획', safety: '안전', letter: '날짜 준비물 복장 문의: 교무실', rain: '강당', roles: [], done: true }, step: 3, maxStep: 3 }).id;
  m.setCurrentEvent(id);
});
const toEvent = async () => {
  await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
  await page.waitForSelector(`${V} [data-e="purchase"]`);
};

await page.goto(url);
await page.waitForTimeout(300);

await run('fix3-purchase', [
  ['[purchase3-1] 확인 카드로 견적서를 더하는 동안 사유 칸(「2.」 줄 끝)을 누르면, 들어온 뒤 화면의 사유도 새 금액(저장과 같음)·커서 그대로, 이어 쳐도 새 금액', async () => {
    await fresh(); await go(); await draft();
    assert(budget(await reason()).includes('금30,000원'), budget(await reason()));
    readDelay = 1500;
    await inboxAdd();
    const n = await caret('intro');
    await has('칭찬 스티커')();
    await page.waitForTimeout(250);
    const s = await cur(), v = await reason(), c = await sel();
    assert(budget(s.draft.reason).includes('금35,000원'), '저장: ' + budget(s.draft.reason));
    assert(v === s.draft.reason, '화면: ' + budget(v));
    assert(c.focus && c.a === n && c.b === n, '커서: ' + JSON.stringify({ n, ...c }));
    await page.keyboard.type('요');
    await page.waitForTimeout(200);
    const s2 = await cur();
    assert(budget(s2.draft.reason).includes('금35,000원') && s2.draft.reason === (await reason()), '친 뒤 저장: ' + budget(s2.draft.reason) + ' 화면: ' + budget(await reason()));
    assert(s2.draft.reason.includes(INTRO + '요') && !s2.draft.edited, '첫 문장: ' + s2.draft.intro + ' edited ' + s2.draft.edited);
    assert((await page.textContent(`${P} #pcCalc tfoot`)).includes('35,000'), '산출 표');
  }],
  ['[purchase3-1] 바로 실행: 사유 칸 맨 끝에 커서를 둔 채 견적서를 넣어도 화면 사유가 새 금액, 커서는 맨 끝, 옆 [복사]를 사람처럼 한 번 누르면 새 사유가 복사됨', async () => {
    await fresh({}, { inbox: { on: true, mode: 'direct' } }); await go(); await draft();
    readDelay = 1200;
    await caret('end');
    await page.setInputFiles('#inboxFile', JPG);
    await has('칭찬 스티커')();
    await page.waitForTimeout(250);
    assert(!(await page.isVisible('#sheetRoot #ibRun')), '확인 카드가 뜸');
    const s = await cur(), v = await reason(), c = await sel();
    assert(v === s.draft.reason && budget(v).includes('금35,000원'), '화면: ' + budget(v) + ' 저장: ' + budget(s.draft.reason));
    assert(c.focus && c.a === c.len && c.b === c.len, '커서: ' + JSON.stringify(c));
    await human(`${P} [data-copy="reason"]`);
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip === s.draft.reason, '복사: ' + budget(clip));
  }],
  ['[purchase3-1] 손으로 고친 사유: 사유 칸에 커서를 둔 채 견적서가 사업명을 채워 관련이 바뀌면 화면 첫 줄도 바뀌고(손으로 고친 줄은 그대로), 이어 쳐도 관련 칸에 옛 관련이 들어가지 않음', async () => {
    await fresh({ type: 'event', typeSet: true, project: '', purpose: '협동심' }); await go(); await draft();
    const r0 = await reason();
    await page.fill(`${P} #pcReason`, r0.replace('  가. 목적: 협동심', '  가. 목적: 협동심 기르기(손으로)'));
    await page.waitForTimeout(150);
    assert((await cur()).draft.edited, '손으로 고친 사유가 아님');
    readDelay = 1500;
    readReply = { items: [{ name: '칭찬 스티커', unit: '장', qty: 10, price: 500 }], shipping: [], fields: { project: '가을 운동회' } };
    await inboxAdd();
    const n = await caret('intro'), v0 = await reason();
    await has('칭찬 스티커')();
    await page.waitForTimeout(250);
    const s = await cur(), v = await reason(), c = await sel();
    assert(s.form.project === '가을 운동회', '사업명: ' + s.form.project);
    assert(v === s.draft.reason && v.split('\n')[0].includes('가을 운동회 운영 계획') && v.includes('협동심 기르기(손으로)'), '화면: ' + v.split('\n')[0] + ' / 저장: ' + s.draft.reason.split('\n')[0]);
    // 바뀐 첫 줄 뒤(「2.」 줄 끝)에 있던 커서는 같은 글자 뒤에
    assert(c.focus && c.a === n + v.length - v0.length && c.b === c.a, '커서: ' + JSON.stringify({ n, ...c }));
    await page.keyboard.type('요');
    await page.waitForTimeout(200);
    const s2 = await cur();
    assert(s2.form.related === '', '관련 칸에 옛 관련: ' + s2.form.related);
    assert(s2.draft.reason === (await reason()) && s2.draft.reason.split('\n')[0].includes('가을 운동회 운영 계획'), '친 뒤: ' + s2.draft.reason.split('\n')[0]);
  }],
  ['[purchase3-1] 관련 줄과 가~ 줄이 함께 바뀌어도(사업명·품목이 들어옴) 「2.」 줄 끝의 커서는 그 줄 끝에', async () => {
    await fresh({ type: 'event', typeSet: true, project: '', purpose: '협동심' }); await go(); await draft();
    readDelay = 1500;
    readReply = { items: [{ name: '칭찬 스티커', unit: '장', qty: 10, price: 500 }], shipping: [], fields: { project: '가을 운동회' } };
    await inboxAdd();
    await caret('intro');
    await has('칭찬 스티커')();
    await page.waitForTimeout(250);
    const s = await cur(), v = await reason(), c = await sel(), n = v.indexOf('\n', v.indexOf('\n') + 1);
    assert(v === s.draft.reason && v.split('\n')[0].includes('가을 운동회 운영 계획') && budget(v).includes('금35,000원') && !s.draft.edited, '화면: ' + v.split('\n')[0] + ' / ' + budget(v));
    assert(c.focus && c.a === n && c.b === n, '커서: ' + JSON.stringify({ n, ...c }));
  }],
  ['[purchase3-1] 견적서를 읽는 동안 목적 칸에서 조합하던 한글은 그대로 끊기지 않고 사유는 새 금액(화면·저장 같음)', async () => {
    await fresh(); await go(); await draft();
    readDelay = 1500;
    await inboxAdd();
    const cdp = await page.context().newCDPSession(page);
    await page.fill(`${P} #pcPurpose`, '');
    await page.click(`${P} #pcPurpose`);
    await page.keyboard.insertText('미술 수');
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '어', selectionStart: 1, selectionEnd: 1 });
    await page.evaluate(s => { window.__pcEl = document.querySelector(s); }, `${P} #pcPurpose`);
    await has('칭찬 스티커')();
    await page.waitForTimeout(200);
    const same = await page.evaluate(s => window.__pcEl === document.querySelector(s), `${P} #pcPurpose`);
    await cdp.send('Input.imeSetComposition', { text: '업', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '업' });
    await page.waitForTimeout(200);
    await cdp.detach();
    const val = await page.inputValue(`${P} #pcPurpose`), s = await cur();
    assert(same && val === '미술 수업' && s.form.purpose === '미술 수업', JSON.stringify({ same, val, saved: s.form.purpose }));
    assert(s.draft.reason === (await reason()) && budget(s.draft.reason).includes('금35,000원'), '사유: ' + budget(s.draft.reason) + ' / ' + budget(await reason()));
  }],
  ['[purchase3-1] 견적서를 읽는 동안 사유 칸(「2.」 줄 끝)에서 조합하던 한글도 끊기지 않고, 들어온 뒤 화면·저장 모두 새 금액', async () => {
    await fresh(); await go(); await draft();
    readDelay = 1500;
    await inboxAdd();
    await caret('intro');
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.insertText(' 미술 수');
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '어', selectionStart: 1, selectionEnd: 1 });
    await has('칭찬 스티커')();
    await page.waitForTimeout(250);
    await cdp.send('Input.imeSetComposition', { text: '업', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '업' });
    await page.waitForTimeout(250);
    await cdp.detach();
    const v = await reason(), s = await cur();
    assert(v.includes(`${INTRO} 미술 수업\n`), '조합: ' + JSON.stringify(v.split('\n')[1]));
    assert(v === s.draft.reason && budget(v).includes('금35,000원') && !s.draft.edited, '사유: ' + budget(v) + ' / ' + budget(s.draft.reason) + ' edited ' + s.draft.edited);
  }],
  ['[purchase3-1] 손으로 고친 사유에서 한글을 조합하는 동안 견적서가 관련을 바꿔도 조합은 끊기지 않고 마친 뒤 화면·저장 모두 새 관련, 옆 [사유 다시 맞추기]를 사람처럼 한 번 누르면 새 금액', async () => {
    await fresh({ type: 'event', typeSet: true, project: '', purpose: '협동심' }); await go(); await draft();
    await page.fill(`${P} #pcReason`, (await reason()).replace('  가. 목적: 협동심', '  가. 목적: 협동심 기르기(손으로)'));
    await page.waitForTimeout(150);
    readDelay = 1500;
    readReply = { items: [{ name: '칭찬 스티커', unit: '장', qty: 10, price: 500 }], shipping: [], fields: { project: '가을 운동회' } };
    await inboxAdd();
    await caret('intro');
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.insertText(' 미술 수');
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '어', selectionStart: 1, selectionEnd: 1 });
    await has('칭찬 스티커')();
    await page.waitForTimeout(250);
    await cdp.send('Input.imeSetComposition', { text: '업', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.insertText', { text: '업' });
    await page.waitForTimeout(250);
    await cdp.detach();
    const v = await reason(), s = await cur();
    assert(v.includes(`${INTRO} 미술 수업\n`) && v.includes('협동심 기르기(손으로)'), '조합: ' + JSON.stringify(v.split('\n').slice(1, 3)));
    assert(v === s.draft.reason && v.split('\n')[0].includes('가을 운동회 운영 계획') && s.form.related === '' && s.draft.edited, '화면: ' + v.split('\n')[0] + ' / 저장: ' + s.draft.reason.split('\n')[0] + ' / 관련 칸: ' + s.form.related);
    await human(`${P} [data-pc="resync"]`);
    await page.waitForTimeout(200);
    const s2 = await cur();
    assert(budget(s2.draft.reason).includes('금35,000원') && s2.draft.reason === (await reason()) && s2.draft.reason.includes(`${INTRO} 미술 수업\n`), '다시 맞춘 뒤: ' + budget(s2.draft.reason));
    assert(!(await page.$(`${P} [data-pc="resync"]`)), '[사유 다시 맞추기]가 남음');
  }],
  ['[purchase3-1] 손으로 고친 사유에서 조합하는 중 견적서가 관련을 바꾼 뒤, 조합을 마치지 않고 [사유 다시 맞추기]를 사람처럼 누르면 첫 누름에 먹힘', async () => {
    await fresh({ type: 'event', typeSet: true, project: '', purpose: '협동심' }, { inbox: { on: true, mode: 'direct' } }); await go(); await draft();
    await page.fill(`${P} #pcReason`, (await reason()).replace('  가. 목적: 협동심', '  가. 목적: 협동심 기르기(손으로)'));
    await page.waitForTimeout(150);
    readDelay = 1200;
    readReply = { items: [{ name: '칭찬 스티커', unit: '장', qty: 10, price: 500 }], shipping: [], fields: { project: '가을 운동회' } };
    await caret('intro');
    await page.setInputFiles('#inboxFile', JPG);
    await page.waitForTimeout(100);
    const cdp = await page.context().newCDPSession(page);
    await page.keyboard.insertText(' 미술 수');
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '업', selectionStart: 1, selectionEnd: 1 });
    await has('칭찬 스티커')();
    await page.waitForTimeout(300);
    assert(await page.$(`${P} [data-pc="resync"]`), '[사유 다시 맞추기]가 없음');
    await page.evaluate(() => { window.__clicks = 0; document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-pc="resync"]')) window.__clicks++; }, true); });
    await human(`${P} [data-pc="resync"]`);
    await page.waitForTimeout(250);
    await cdp.detach();
    const s = await cur(), v = await reason();
    assert((await page.evaluate(() => window.__clicks)) === 1, '누름이 먹히지 않음');
    assert(budget(s.draft.reason).includes('금35,000원') && v === s.draft.reason && v.includes(`${INTRO} 미술 수업\n`) && v.split('\n')[0].includes('가을 운동회 운영 계획'), '다시 맞춘 뒤: ' + budget(v) + ' / ' + JSON.stringify(v.split('\n').slice(0, 2)));
    assert(!(await page.$(`${P} [data-pc="resync"]`)), '[사유 다시 맞추기]가 남음');
  }],
  ['[purchase3-1] 조합 중 견적서가 들어온 뒤 compositionend 없이 일반 입력이 와도 끝없이 되부르지 않고(페이지 오류 없음) 저장=화면, 친 글자도 저장', async () => {
    await fresh({}, { inbox: { on: true, mode: 'direct' } }); await go(); await draft();
    const e0 = errors.length;
    readDelay = 1200;
    await caret('intro');
    await page.setInputFiles('#inboxFile', JPG);
    await page.waitForTimeout(100);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: 'ㅇ', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.imeSetComposition', { text: '어', selectionStart: 1, selectionEnd: 1 });
    await has('칭찬 스티커')();
    await page.waitForTimeout(300);
    await page.keyboard.type('1');
    await page.waitForTimeout(300);
    await cdp.detach();
    const s = await cur(), v = await reason();
    assert(errors.length === e0, '페이지 오류: ' + errors.slice(e0, e0 + 2).join(' | '));
    assert(v === s.draft.reason && budget(v).includes('금35,000원') && !s.draft.edited, '화면: ' + budget(v) + ' / 저장: ' + budget(s.draft.reason) + ' edited ' + s.draft.edited);
    assert(s.draft.reason.includes(`${INTRO}어1\n`), '친 글자: ' + JSON.stringify(s.draft.reason.split('\n')[1]));
    // 그 뒤 보통으로 쳐도 저장=화면
    await page.keyboard.type('2');
    await page.waitForTimeout(200);
    const s2 = await cur();
    assert(s2.draft.reason === (await reason()) && s2.draft.reason.includes(`${INTRO}어12\n`), '이어 친 뒤: ' + JSON.stringify(s2.draft.reason.split('\n')[1]));
    errors.splice(e0);
  }],
  ['[purchase3-2] 초안 없이 쓰던 품의가 있으면 행사계획 [품의로 이어 가기]가 바꿀지 묻고, [취소]면 그대로, [바꾸기]면 행사 품의', async () => {
    await seedEvent();
    await fresh({ project: '과학 실험 재료', purpose: '용해와 용액 실험', items: [{ name: '비커', qty: '8', price: '4500' }, { name: '전자저울', qty: '4', price: '23000' }] });
    await go();
    await toEvent();
    await page.click(`${V} [data-e="purchase"]`);
    await page.waitForSelector('#sheetRoot #pcSwapOk', { timeout: 3000 });
    assert((await page.textContent('#sheetRoot')).includes('초안이 없어서 남지 않아요'), await page.textContent('#sheetRoot'));
    let s = await cur();
    assert(s.form.project === '과학 실험 재료' && s.form.items.map(i => i.name).join(',') === '비커,전자저울', '물어보기 전에 바뀜: ' + s.form.project);
    await page.click('#sheetRoot [data-close]');
    await page.waitForTimeout(200);
    s = await cur();
    assert(s.form.project === '과학 실험 재료' && s.form.items.length === 2, '[취소]인데 바뀜: ' + s.form.project);
    assert(await page.isVisible(`${V} [data-e="purchase"]`), '[취소]인데 행사계획을 떠남');
    await page.click(`${V} [data-e="purchase"]`);
    await page.waitForSelector('#sheetRoot #pcSwapOk');
    await page.click('#sheetRoot #pcSwapOk');
    await page.waitForSelector(`${P} #pcProject`);
    s = await cur();
    assert(s.form.type === 'event' && s.form.project === '가을 운동회' && s.form.items.map(i => i.name).join(',') === '상품', '행사 품의: ' + JSON.stringify([s.form.type, s.form.project]));
    assert((await page.inputValue(`${P} #pcProject`)) === '가을 운동회' && (await page.getAttribute(`${P} [data-pctype="event"]`, 'aria-pressed')) === 'true', '화면');
  }],
  ['[purchase3-2] 초안이 있는 품의는 묻지 않고 최근 작성에 남긴 채 행사 품의로, 빈 품의도 묻지 않음', async () => {
    await seedEvent();
    await fresh(); await go(); await draft();
    await toEvent();
    await page.click(`${V} [data-e="purchase"]`);
    await page.waitForSelector(`${P} #pcProject`);
    assert(!(await page.isVisible('#sheetRoot #pcSwapOk')), '초안이 있는데 물어봄');
    let s = await cur();
    assert(s.form.project === '가을 운동회' && (await recent()).some(r => r.id === 'pcA' && r.draft && r.draft.title === '교실 물품 구입'), '최근 작성: ' + JSON.stringify((await recent()).map(r => r.id)));
    // 빈 품의
    await page.click(`${P} [data-pc="fresh"]`);
    await page.waitForTimeout(150);
    if (await page.isVisible('#sheetRoot #pcSwapOk')) await page.click('#sheetRoot #pcSwapOk');
    await page.waitForTimeout(150);
    await toEvent();
    await page.click(`${V} [data-e="purchase"]`);
    await page.waitForSelector(`${P} #pcProject`);
    assert(!(await page.isVisible('#sheetRoot #pcSwapOk')), '빈 품의인데 물어봄');
    s = await cur();
    assert(s.form.project === '가을 운동회', '행사 품의: ' + s.form.project);
  }],
  ['[purchase3-4] 품목 50개(「산출 내역 칸마다」면 조각 252개)는 「표 한 번에」로 준비하고 까닭을 알림(고른 방식은 그대로)', async () => {
    await fresh({ project: '학급 문고', purpose: '독서 교육', items: many(50) }); await go();
    await fakeApp();
    await draft();
    await page.click('#menuTabs [data-tab="recent"]'); await page.click('#menuTabs [data-tab="new"]');
    await page.waitForSelector(`${P} [data-pc="queue"]`);
    assert((await page.getAttribute(`${P} [data-qcalc="cells"]`, 'aria-pressed')) === 'true', '기본은 칸마다');
    await page.click(`${P} [data-pc="queue"]`);
    await page.waitForFunction(() => window.__calls.some(c => c[0] === 'queue_arm'));
    const a = (await calls()).filter(c => c[0] === 'queue_arm');
    assert(a.length === 1 && a[0][1].items.length === 3 && a[0][1].items[2].includes('도서 50\t') && a[0][1].items[2].split('\n').length === 52, JSON.stringify(a.map(x => x[1].items.length)));
    const tt = await page.textContent('#toast');
    assert(tt.includes('표 한 번에') && tt.includes('50'), '안내: ' + tt);
    await page.waitForFunction(() => (document.querySelector('#qpPanel') || {}).textContent?.includes('칸을 누르고'));
    assert(!(await page.textContent('#qpPanel')).includes('250개까지'), '앱 오류가 보임');
    assert((await page.evaluate(() => localStorage.getItem('ssam:queueCalc'))) == null, '고른 방식이 바뀜');
    await page.click('#qpPanel [data-qp="close"]');
  }],
  ['[purchase3-4] 품목 49개(조각 247개)는 그대로 「산출 내역 칸마다」', async () => {
    await fresh({ project: '학급 문고', purpose: '독서 교육', items: many(49) }); await go();
    await fakeApp();
    await draft();
    await page.click('#menuTabs [data-tab="recent"]'); await page.click('#menuTabs [data-tab="new"]');
    await page.waitForSelector(`${P} [data-pc="queue"]`);
    await page.click(`${P} [data-pc="queue"]`);
    await page.waitForFunction(() => window.__calls.some(c => c[0] === 'queue_arm'));
    const a = (await calls()).filter(c => c[0] === 'queue_arm');
    assert(a.length === 1 && a[0][1].items.length === 247, JSON.stringify(a.map(x => x[1].items.length)));
    await page.click('#qpPanel [data-qp="close"]');
  }],
  ['[purchase3-4] 차례로 붙여넣기에 조각이 250개를 넘게 오면 앱을 부르지 않고 알기 쉬운 안내, [다시 준비]는 없음', async () => {
    await fakeApp();
    const ok = await page.evaluate(async () => (await import('./core/queue-paste.js')).openQueue({ title: '많은 조각', items: Array.from({ length: 251 }, (_, i) => ({ label: `조각 ${i + 1}`, text: 'x' })) }));
    await page.waitForSelector('#qpPanel');
    const txt = await page.textContent('#qpPanel');
    assert(ok === false && !(await calls()).some(c => c[0] === 'queue_arm'), '앱을 부름');
    assert(txt.includes('251') && txt.includes('250'), '안내: ' + txt);
    assert(!(await page.$('#qpPanel [data-qp="resume"]')), '[다시 준비]가 있음');
    await page.click('#qpPanel [data-qp="close"]');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
