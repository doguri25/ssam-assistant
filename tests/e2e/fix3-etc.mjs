// 2026-11-05 3차 고침(기타 › 공문 처리): 기한을 고친 뒤·할 일 칸에서 칸을 떠날 때도 같은 카드의 단추·체크 첫 누름이 먹힘(사람처럼 누름).
// [AI로 읽기] 읽는 중 표시·다 읽은 카드 갱신(gm-readbtn-1)과 한글 조합 보호(gm-render-1)도 그대로.
// 가정통신문: 1·2월에 쓰면 연도 없이 온 1·2월 관련 공문 날짜가 그해(발송 기안 「관련」)
import { open, run, assert, mockClaude } from './helpers.mjs';

const AI = { gate: null, gm: 0 };
// AI 답을 붙잡아 둠(돌려받은 함수를 부르면 놓음). 시험이 실패해도 끝에 놓아 줌(safe)
const hold = () => { let r; AI.gate = new Promise(x => (r = x)); AI.release = () => { AI.gate = null; r(); }; return AI.release; };
const safe = cases => cases.map(([n, fn]) => [n, async () => { try { await fn(); } finally { if (AI.gate) AI.release(); } }]);
const G = 'section[data-menu="etc"] .gm-box';
const KEY = JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true });
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(k => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', k); }, KEY);
await mockClaude(page, async ({ prompt }) => {
  if (!prompt.startsWith('[공문 처리]')) return '{}';
  AI.gm++;
  const g = AI.gate; if (g) await g;
  const which = prompt.includes('A 공문 본문') ? 'A' : 'B';
  return JSON.stringify({ title: `AI가 읽은 ${which}`, due: iso(20), summary: `${which} 요약`, tasks: [{ text: `${which} 신청서 제출`, due: '' }], kinds: [] });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 사람처럼 누름: 누르고 80ms 뒤에 뗌(그사이 다시 그리면 click이 생기지 않음)
const humanClick = async sel => {
  await page.locator(sel).evaluate(el => el.scrollIntoView({ block: 'center' }));
  await sleep(50);
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(250);
};
const card = id => `${G} [data-gm-id="${id}"]`;
const docs = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gongmun:list')));
const doc = async id => (await docs()).find(d => d.id === id);
// 앞 시험의 늦은 저장이 덮지 않게 저장을 멈추고 씀(다시 열면 풀림). A·B는 읽은 공문, read: false면 [AI로 읽기]
const fresh = (list = {}) => page.evaluate(async ([a, b, x]) => {
  (await import('./core/store.js')).freeze();
  localStorage.setItem('ssam:gongmun:list', JSON.stringify([
    { id: 'gmA', name: 'A 공문', title: 'A 공문', text: 'A 공문 본문\n신청서 제출', tasks: [{ text: '할 일 A', due: '', done: false }], kinds: [], at: 2, read: true, due: a, ...x.A },
    { id: 'gmB', name: 'B 공문', title: 'B 공문', text: 'B 공문 본문\n신청서 제출', tasks: [{ text: '할 일 B', due: '', done: false }], kinds: [], at: 1, read: true, due: b, ...x.B }]));
}, [iso(5), iso(9), list]);
const go = async () => {
  await page.reload(); await page.waitForTimeout(300);
  await page.click('nav.app-side [data-menu-go="etc"]'); await page.click('#menuTabs [data-tab="gongmun"]');
  await page.waitForSelector(`${card('gmA')} [data-gm-due]`);
};
// 기한을 키보드로 고침(초점은 날짜 칸에 남음)
const editDue = async id => {
  const before = (await doc(id)).due;
  await page.focus(`${card(id)} [data-gm-due]`);
  await page.keyboard.press('ArrowUp');
  await sleep(100);
  const d = await doc(id);
  assert(d.due && d.due !== before, '기한이 안 바뀜 ' + d.due);
  assert(await page.evaluate(s => document.activeElement === document.querySelector(s), `${card(id)} [data-gm-due]`), '날짜 칸에서 초점이 빠짐');
  return d.due;
};
const dd = s => { const a = Date.parse(`${s}T00:00:00Z`), b = Date.parse(`${iso(0)}T00:00:00Z`); return Math.round((a - b) / 864e5); };

await page.goto(url);
await page.waitForTimeout(300);

await run('fix3-etc', safe([
  ['[gm-click-1] 기한을 키보드로 고친 뒤 같은 카드의 할 일 체크를 사람처럼 한 번 누르면 체크되고, 칸을 떠나면 D-n도 새 기한', async () => {
    await fresh(); await go();
    const due = await editDue('gmA');
    await humanClick(`${card('gmA')} [data-gm-task="0"]`);
    assert((await doc('gmA')).tasks[0].done === true, '첫 누름에 체크 안 됨');
    assert(await page.isChecked(`${card('gmA')} [data-gm-task="0"]`), '화면 체크');
    await humanClick(`${G} h3`);
    const tx = (await page.textContent(card('gmA'))).replace(/\s+/g, ' ');
    assert(tx.includes(`D-${dd(due)}`), tx);
    assert(await page.isChecked(`${card('gmA')} [data-gm-task="0"]`), '다시 그린 뒤 체크');
  }],
  ['[gm-click-1] 기한을 고친 뒤 같은 카드의 [다 했어요]를 한 번 누르면 다 한 공문으로', async () => {
    await fresh(); await go();
    await editDue('gmA');
    await humanClick(`${card('gmA')} [data-gm-done]`);
    assert((await doc('gmA')).done === true, '첫 누름에 다 했어요가 안 됨');
    assert((await page.textContent(`${G} .gm-done-box summary`)).includes('1개'), '다 한 공문 목록');
  }],
  ['[gm-click-1] 기한을 고친 뒤 같은 카드의 할 일 [✕]·[지우기]·[쪽지]도 첫 누름에', async () => {
    await fresh(); await go();
    await editDue('gmA');
    await humanClick(`${card('gmA')} [data-gm-tdel="0"]`);
    assert((await doc('gmA')).tasks.length === 0, '[✕] 첫 누름');
    await editDue('gmB');
    page.once('dialog', d => d.accept());
    await humanClick(`${card('gmB')} [data-gm-del]`);
    assert(!(await doc('gmB')), '[지우기] 첫 누름');
    await editDue('gmA');
    await humanClick(`${card('gmA')} [data-gm-go="message"]`);
    await page.waitForFunction(() => { const b = document.querySelector('section[data-menu="etc"] .msg-box'); return b && !b.hidden; }, null, { timeout: 3000 });
    await page.click('#menuTabs [data-tab="gongmun"]');
  }],
  ['[gm-click-1] B를 AI가 읽는 동안 A 할 일 칸에서 한글을 치면(조합 중) 다 읽어도 칸·초점이 그대로, 그 뒤 A의 체크·[다 했어요] 첫 누름이 먹힘', async () => {
    await fresh({ B: { read: false, tasks: [] } }); await go();
    const release = hold();
    const n0 = AI.gm;
    await humanClick(`${card('gmB')} [data-gm-read]`);
    assert(await page.locator(`${card('gmB')} .spin`).count() === 1, '읽는 중 표시');
    await humanClick(`${card('gmA')} [data-gm-tadd]`);
    await page.keyboard.insertText('참가 학생 ');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '조', selectionStart: 1, selectionEnd: 1 });
    release();
    await page.waitForFunction(s => !document.querySelector(`${s} .spin`), G, { timeout: 5000 });
    await sleep(200);
    const st = await page.evaluate(() => ({ v: document.activeElement.value, t: document.activeElement.dataset.gmTadd != null }));
    assert(st.t && st.v.startsWith('참가 학생 '), JSON.stringify(st));
    await cdp.send('Input.insertText', { text: '조' });
    await cdp.detach();
    assert((await page.inputValue(`${card('gmA')} [data-gm-tadd]`)) === '참가 학생 조', await page.inputValue(`${card('gmA')} [data-gm-tadd]`));
    assert(AI.gm - n0 === 1, 'AI 읽기 ' + (AI.gm - n0));
    // 칸을 떠나며 바로 A의 체크 → 첫 누름에
    await humanClick(`${card('gmA')} [data-gm-task="0"]`);
    assert((await doc('gmA')).tasks[0].done === true, '첫 누름에 체크 안 됨');
    await humanClick(`${card('gmA')} [data-gm-done]`);
    assert((await doc('gmA')).done === true, '첫 누름에 다 했어요가 안 됨');
    // 쓰던 할 일 글은 남고, B는 AI가 읽은 카드로
    assert((await page.textContent(G)).includes('AI가 읽은 B') && (await page.textContent(G)).includes('B 신청서 제출'), 'B 카드');
  }],
  ['[gm-click-1] 기한을 고친 뒤 같은 카드의 [AI로 읽기]를 사람처럼 누르면 바로 읽는 중 표시, 다 읽으면 다른 곳을 누르지 않아도 카드가 바뀜(고친 기한은 그대로)', async () => {
    await fresh({ A: { read: false, tasks: [] } }); await go();
    const due = await editDue('gmA');
    const release = hold();
    const n0 = AI.gm;
    await humanClick(`${card('gmA')} [data-gm-read]`);
    assert(await page.locator(`${card('gmA')} .spin`).count() === 1, '읽는 중 표시가 없음');
    assert(await page.locator(`${card('gmA')} [data-gm-read]`).count() === 0, '[AI로 읽기]가 남음');
    release();
    await page.waitForFunction(s => document.querySelector(s).textContent.includes('AI가 읽은 A'), G, { timeout: 5000 });
    const tx = (await page.textContent(card('gmA'))).replace(/\s+/g, ' ');
    assert(tx.includes('A 요약') && !tx.includes('읽는 중') && !tx.includes('AI로 읽기'), tx);
    assert((await doc('gmA')).due === due, '고친 기한 ' + (await doc('gmA')).due);
    assert(AI.gm - n0 === 1, 'AI 읽기 ' + (AI.gm - n0));
  }],
  ['[gm-click-1] 다른 공문 칸에 초점이 있을 때(기한 고침 없음) B 체크도 첫 누름에', async () => {
    await fresh(); await go();
    await humanClick(`${card('gmA')} [data-gm-tadd]`);
    await page.keyboard.insertText('메모');
    await humanClick(`${card('gmB')} [data-gm-task="0"]`);
    assert((await doc('gmB')).tasks[0].done === true, 'B 체크');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]));
await t.close();

// 가정통신문: 시계를 2027-01-12(학년도 2026)로
const t2 = await open();
const pg = t2.page, L = 'section[data-menu="etc"] .lf-box', letters = [];
await pg.clock.setFixedTime(new Date('2027-01-12T10:00:00'));
await pg.addInitScript(k => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', k); }, KEY);
await mockClaude(pg, async ({ prompt }) => {
  if (!prompt.startsWith('[가정통신문]')) return '{}';
  letters.push(prompt);
  return JSON.stringify({ title: '겨울방학 방과후 안내', greeting: ['안녕하십니까?'], intro: '방과후를 안내드립니다.', items: ['1. 기간: 1. 18.(월)~'], closing: '감사합니다.',
    reply: { need: false }, short: '방과후 안내', target: '전 학년 보호자',
    related: [{ no: '교무부-321', date: '01-08', title: '겨울방학 운영 계획' }, { no: '교무부-300', date: '12-20', title: '방학 계획' }] });
});
await pg.goto(t2.url);
await pg.waitForTimeout(300);
await pg.click('nav.app-side [data-menu-go="etc"]');
await pg.click('#menuTabs [data-tab="letter"]');
await pg.waitForSelector(`${L} #lfMemo`);

await run('fix3-etc-letter', [
  ['[letter-year-2] 1월에 쓰면 연도 없는 1월 관련 공문은 그해(2027), 12월 공문은 지난해(2026)로 발송 기안 「관련」에', async () => {
    await pg.fill(`${L} #lfMemo`, '겨울방학 방과후 안내.');
    await pg.click(`${L} [data-lf="write"]`);
    await pg.waitForFunction(x => (document.querySelector('#toast') || {}).textContent?.includes(x), '가정통신문을 썼어요');
    assert(letters[letters.length - 1].includes('오늘: 2027-01-12, 학년도: 2026.'), letters[letters.length - 1].split('\n')[1]);
    const sb = await pg.inputValue(`${L} #lfSendBody`);
    assert(sb.includes('교무부-321(2027. 1. 8.)') && sb.includes('교무부-300(2026. 12. 20.)') && !sb.includes('2026. 1. 8.'), sb);
  }],
  ['페이지 오류 없음', async () => { assert(t2.errors.length === 0, t2.errors.join(' | ')); }]
]);
await t2.close();
