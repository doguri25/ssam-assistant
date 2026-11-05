// 2026-11-05 고침(기타 › 공문 처리·쪽지·가정통신문): [AI로 읽기] 누른 뒤 읽는 중 표시·다 읽은 카드, 글 없는 스캔 공문,
// 쪽지 본문·칸을 눌러 둔 채 AI가 끝나도 본문·칸이 채워짐, 최근 쪽지 5개·[삭제], 가정통신문 학년도(오늘이 든 학년도)·쓰는 칸 초점, 회신서 「/」 선택지
import { open, run, assert, mockClaude } from './helpers.mjs';

const AI = { gate: null, gm: 0, msg: 0, letter: [] };
// AI 답을 붙잡아 둠(돌려받은 함수를 부르면 놓음). 시험이 실패해도 끝에 놓아 줌(safe)
const hold = () => { let r; AI.gate = new Promise(x => (r = x)); AI.release = () => { AI.gate = null; r(); }; return AI.release; };
const safe = cases => cases.map(([n, fn]) => [n, async () => { try { await fn(); } finally { if (AI.gate) AI.release(); } }]);
const P = 'section[data-menu="etc"]', G = `${P} .gm-box`, M = `${P} .msg-box`, L = `${P} .lf-box`;
const KEY = JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true });

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(k => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', k); }, KEY);
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[공문 처리]')) {
    AI.gm++;
    const g = AI.gate; if (g) await g;
    const which = prompt.includes('첫째 연수 안내') ? '첫째' : '둘째';
    return JSON.stringify({ title: `AI가 읽은 ${which}`, due: '2026-11-20', summary: '신청서를 내요', tasks: [{ text: '신청서 제출', due: '' }], kinds: ['message'] });
  }
  if (prompt.startsWith('[쪽지 안내]')) {
    AI.msg++;
    const g = AI.gate; if (g) await g;
    const n = (/쪽지(\d+)/.exec(prompt) || [])[1];
    return JSON.stringify({ kind: 'training', title: n ? `연수 ${n}` : 'AI 활용 연수', when: [{ date: '2026-11-12', time: '15:00~16:30' }], place: '시청각실', target: '전 교원' });
  }
  return '{}';
});
const toastHas = s => page.waitForFunction(x => (document.querySelector('#toast') || {}).textContent?.includes(x), s);
const card = s => `${G} .gm-doc:has(.gm-title:text("${s}"))`;
const body = () => page.inputValue(`${M} #msgBody`);
const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:msg:draft')));
const recentIds = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:msg:list')) || []).map(x => x.id));
const recentTitles = () => page.$$eval(`${M} #msgRecent li b`, l => l.map(b => b.textContent));

await page.goto(url);
await page.waitForTimeout(400);
// 읽지 않은 공문 둘(첫째·둘째)과 글을 읽지 못한 스캔 공문
await page.evaluate(() => localStorage.setItem('ssam:gongmun:list', JSON.stringify([
  { id: 'gm1', name: '첫째 연수 공문', title: '첫째 연수 공문', text: '첫째 연수 안내\n제출 기한 11월 20일까지 신청서 제출', tasks: [], kinds: [], at: 3, read: false },
  { id: 'gm2', name: '둘째 연수 공문', title: '둘째 연수 공문', text: '둘째 연수 안내\n신청서 제출', tasks: [], kinds: [], at: 2, read: false },
  { id: 'gm3', name: '스캔 공문.pdf', title: '스캔 공문', text: '', tasks: [], kinds: [], at: 1, read: false }])));
await page.reload();
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="etc"]');
await page.click('#menuTabs [data-tab="gongmun"]');
await page.waitForSelector(`${card('첫째 연수 공문')} [data-gm-read]`);

await run('fix1105-etc', safe([
  ['[gm-readbtn-1] [AI로 읽기]를 누르면 바로 「AI가 읽는 중」·단추가 사라지고, 다 읽으면 다른 곳을 누르지 않아도 카드가 바뀜', async () => {
    const release = hold();
    const n0 = AI.gm;
    await page.click(`${card('첫째 연수 공문')} [data-gm-read]`);
    await page.waitForTimeout(300);
    assert(await page.locator(`${card('첫째 연수 공문')} .spin`).count() === 1, '읽는 중 표시가 없음');
    assert(await page.locator(`${card('첫째 연수 공문')} [data-gm-read]`).count() === 0, '[AI로 읽기]가 남음');
    release();
    await page.waitForFunction(s => document.querySelector(s).textContent.includes('AI가 읽은 첫째'), G, { timeout: 5000 });
    const tx = (await page.textContent(card('AI가 읽은 첫째'))).replace(/\s+/g, ' ');
    assert(/D-\d+/.test(tx) && tx.includes('신청서를 내요') && !tx.includes('AI로 읽기') && !tx.includes('읽는 중'), tx);
    assert(AI.gm - n0 === 1, 'AI 읽기 ' + (AI.gm - n0));
  }],
  ['[gm-readbtn-1] 읽는 중인 공문은 [AI로 읽기]가 다시 눌려도 AI를 또 부르지 않음', async () => {
    const release = hold();
    const n0 = AI.gm;
    // 그 공문의 할 일 칸에 초점이 있으면 카드를 다시 그리지 않아 단추가 남음 → 두 번 눌러 봄
    await page.evaluate(s => {
      const li = [...document.querySelectorAll(s)].find(x => x.querySelector('.gm-title').textContent === '둘째 연수 공문'), b = li.querySelector('[data-gm-read]');
      li.querySelector('[data-gm-tadd]').focus(); b.click(); b.click();
    }, `${G} .gm-doc`);
    await page.waitForTimeout(400);
    release();
    await page.waitForTimeout(300);
    await page.click(`${G} h3`);
    await page.waitForFunction(s => document.querySelector(s).textContent.includes('AI가 읽은 둘째'), G, { timeout: 5000 });
    assert(AI.gm - n0 === 1, 'AI 읽기 ' + (AI.gm - n0));
  }],
  ['[gm-scan-read-1] 글을 읽지 못한 스캔 공문 카드에는 [AI로 읽기]가 없음(기한·할 일은 직접)', async () => {
    assert(await page.locator(`${card('스캔 공문')}`).count() === 1, '스캔 공문 카드');
    assert(await page.locator(`${card('스캔 공문')} [data-gm-read]`).count() === 0, '[AI로 읽기]가 보임');
    assert(await page.locator(`${card('스캔 공문')} [data-gm-go="message"]`).count() === 1, '[쪽지]');
  }],
  ['[msg-body-stale-1] 쪽지: AI가 읽는 동안 본문 칸을 눌러 두어도 다 읽으면 본문이 채워지고, 이어 치면 AI 본문 뒤에 붙음', async () => {
    await page.click('#menuTabs [data-tab="message"]');
    await page.waitForSelector(`${M} #msgPaste`);
    await page.click(`${M} [data-msg="new"]`);
    await page.fill(`${M} #msgPaste`, '2026 AI 활용 연수 안내\n일시 11월 12일 15:00 시청각실');
    const release = hold();
    await page.click(`${M} [data-msg="read"]`);
    await page.waitForTimeout(200);
    await page.click(`${M} #msgBody`);
    release();
    await page.waitForFunction(s => !document.querySelector(`${s} [data-msg="read"][disabled]`), M, { timeout: 5000 });
    await page.waitForTimeout(200);
    const b = await body(), dr = await draft();
    assert(b.startsWith('[연수 안내] AI 활용 연수') && b === dr.body && !dr.edited, JSON.stringify([b.slice(0, 40), dr.body.slice(0, 40)]));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id === 'msgBody'), '초점');
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' 추가');
    const d2 = await draft();
    assert(d2.body.startsWith('[연수 안내] AI 활용 연수') && d2.body.endsWith(' 추가') && d2.edited, JSON.stringify(d2.body));
  }],
  ['[msg-body-stale-1] 쪽지: AI가 읽는 동안 장소 칸을 눌러 두어도(치지 않음) 다 읽으면 그 칸에 AI 값', async () => {
    await page.click(`${M} [data-msg="new"]`);
    await page.fill(`${M} #msgPaste`, '2026 AI 활용 연수 안내\n일시 11월 12일 15:00 시청각실');
    const release = hold();
    await page.click(`${M} [data-msg="read"]`);
    await page.waitForTimeout(200);
    await page.click(`${M} [data-mf="place"]`);
    release();
    await page.waitForFunction(s => !document.querySelector(`${s} [data-msg="read"][disabled]`), M, { timeout: 5000 });
    await page.waitForTimeout(200);
    assert((await page.inputValue(`${M} [data-mf="place"]`)) === '시청각실', await page.inputValue(`${M} [data-mf="place"]`));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.mf === 'place'), '초점');
    // 고친 칸은 그대로(쓰는 중인 칸을 덮지 않음)
    await page.keyboard.press('End');
    await page.keyboard.type(' 2층');
    assert((await page.inputValue(`${M} [data-mf="place"]`)) === '시청각실 2층', await page.inputValue(`${M} [data-mf="place"]`));
    assert((await body()).includes('시청각실 2층'), await body());
  }],
  ['[쪽지 5개] 예전에 20개 저장된 최근 쪽지도 5개만 보이고 저장도 5개로 줄어듦', async () => {
    await page.evaluate(() => {
      localStorage.removeItem('ssam:msg:draft');
      localStorage.setItem('ssam:msg:list', JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ id: 'old' + i, at: Date.now() - 100000 + i, title: `[연수 안내] 옛 쪽지 ${i}`, kind: 'training', m: { kind: 'training', title: `옛 쪽지 ${i}` }, len: 'base', attach: [], body: '' })).reverse()));
    });
    await page.reload();
    await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.click('#menuTabs [data-tab="message"]');
    await page.waitForSelector(`${M} #msgRecent`);
    const ts = await recentTitles();
    assert(ts.length === 5 && ts[0] === '[연수 안내] 옛 쪽지 19' && ts[4] === '[연수 안내] 옛 쪽지 15', JSON.stringify(ts));
    assert((await recentIds()).length === 5, '저장 ' + (await recentIds()).length);
    assert(await page.locator(`${M} #msgRecent li`).first().locator('[data-msg-del]').count() === 1, '[삭제] 단추');
  }],
  ['[쪽지 5개] 쪽지를 하나 더 쓰면 맨 위에 들어가고 가장 오래된 것이 빠져 5개', async () => {
    await page.click(`${M} [data-msg="new"]`);
    await page.fill(`${M} #msgPaste`, '쪽지6 연수 안내');
    await page.click(`${M} [data-msg="read"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} #msgBody`) || {}).value?.startsWith('[연수 안내] 연수 6'), M);
    await page.waitForFunction(s => document.querySelector(`${s} #msgRecent li b`)?.textContent === '[연수 안내] 연수 6', M);
    const ts = await recentTitles();
    assert(ts.length === 5 && !ts.includes('[연수 안내] 옛 쪽지 15'), JSON.stringify(ts));
  }],
  ['[쪽지 삭제] [삭제] → 「「제목」 쪽지를 지울까요?」 [취소]면 그대로, [확인]이면 빠지고 새로 고침 뒤에도 없음(지금 쪽지는 그대로)', async () => {
    const row = `${M} #msgRecent li:has(b:text-is("[연수 안내] 옛 쪽지 17"))`;
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click(`${row} [data-msg-del]`);
    await page.waitForTimeout(200);
    assert(asked === '「[연수 안내] 옛 쪽지 17」 쪽지를 지울까요?', asked);
    assert((await recentIds()).includes('old17') && (await recentTitles()).includes('[연수 안내] 옛 쪽지 17'), '취소했는데 빠짐');
    page.once('dialog', d => d.accept());
    await page.click(`${row} [data-msg-del]`);
    await page.waitForFunction(s => ![...document.querySelectorAll(`${s} #msgRecent li b`)].some(b => b.textContent === '[연수 안내] 옛 쪽지 17'), M);
    assert(!(await recentIds()).includes('old17'), '저장에 남음');
    assert((await body()).startsWith('[연수 안내] 연수 6'), '지금 쪽지가 바뀜');
    await page.reload();
    await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.click('#menuTabs [data-tab="message"]');
    await page.waitForSelector(`${M} #msgRecent`);
    const ts = await recentTitles();
    assert(!ts.includes('[연수 안내] 옛 쪽지 17') && ts.length === 4, JSON.stringify(ts));
    assert((await body()).startsWith('[연수 안내] 연수 6'), '새로 고친 뒤 지금 쪽지');
  }],
  ['[쪽지 삭제] 지금 열린 쪽지를 지우면 새 쪽지로 바뀌고 새로 고침 뒤에도 목록에 없음', async () => {
    page.once('dialog', d => d.accept());
    await page.click(`${M} #msgRecent li:has(b:text-is("[연수 안내] 연수 6")) [data-msg-del]`);
    await page.waitForFunction(s => !(document.querySelector(`${s} #msgRecent`).textContent.includes('연수 6')), M);
    assert((await body()) === '', '본문이 남음: ' + (await body()));
    assert((await page.inputValue(`${M} [data-mf="title"]`)) === '', '칸이 남음');
    // 새 쪽지에서 칸을 고치기 전에는 목록에 다시 들어가지 않음
    await page.fill(`${M} #msgSender`, '교무부');
    await page.waitForTimeout(200);
    assert(!(await recentTitles()).some(x => x.includes('연수 6')), '다시 들어감');
    await page.reload();
    await page.waitForTimeout(400);
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.click('#menuTabs [data-tab="message"]');
    await page.waitForSelector(`${M} #msgRecent`);
    assert(!(await recentTitles()).some(x => x.includes('연수 6')), JSON.stringify(await recentTitles()));
    assert(!(await body()).includes('연수 6'), '새로 고친 뒤 본문: ' + (await body()));
    await page.fill(`${M} #msgSender`, '');
  }],
  ['[쪽지 삭제] 지금 쪽지를 AI가 다시 읽는 중에 지우면, 다 읽어도 목록에 다시 들어가지 않음', async () => {
    await page.fill(`${M} #msgPaste`, '쪽지7 연수 안내');
    await page.click(`${M} [data-msg="read"]`);
    await page.waitForFunction(s => document.querySelector(`${s} #msgRecent li b`)?.textContent === '[연수 안내] 연수 7', M);
    const release = hold();
    await page.click(`${M} [data-msg="read"]`);
    await page.waitForTimeout(200);
    page.once('dialog', d => d.accept());
    await page.click(`${M} #msgRecent li:has(b:text-is("[연수 안내] 연수 7")) [data-msg-del]`);
    await page.waitForTimeout(200);
    release();
    await page.waitForTimeout(600);
    assert(!(await recentTitles()).some(x => x.includes('연수 7')), JSON.stringify(await recentTitles()));
    assert(!(await page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:msg:list')) || []).some(x => x.title.includes('연수 7')))), '저장에 다시 들어감');
    assert(!(await page.textContent('#toast')).includes('최근 쪽지에 넣었어요'), await page.textContent('#toast'));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]));
await t.close();

// 가정통신문: 시계를 2026-11-05로(설정의 계획 학년도와 상관없이 오늘이 든 학년도 2026)
const t2 = await open();
const pg = t2.page;
await pg.clock.setFixedTime(new Date('2026-11-05T10:00:00'));
await pg.addInitScript(k => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', k); }, KEY);
await mockClaude(pg, async ({ prompt }) => {
  if (!prompt.startsWith('[가정통신문]')) return '{}';
  AI.letter.push(prompt);
  const g = AI.gate; if (g) await g;
  const n = AI.letter.length;
  return JSON.stringify({ title: `겨울방학 안내 ${n}`, greeting: ['안녕하십니까?'], intro: '겨울방학을 안내드립니다.', items: ['1. 방학: 12. 24.(목)'], closing: '감사합니다.',
    reply: { need: true, title: '방과후 신청서', fields: ['참가 여부: □ 참가 / □ 불참'], due: '12. 1.(화)까지' }, short: `방학 안내 ${n}`,
    related: [{ no: '교무-123', date: '10-28', title: '방학 계획' }], target: '전 학년 보호자' });
});
const lt = s => pg.waitForFunction(x => (document.querySelector('#toast') || {}).textContent?.includes(x), s);
const notBusy = () => pg.waitForFunction(s => { const b = document.querySelector(`${s} [data-lf="write"]`); return b && !b.disabled; }, L, { timeout: 5000 });
await pg.goto(t2.url);
await pg.waitForTimeout(400);
await pg.click('nav.app-side [data-menu-go="etc"]');
await pg.click('#menuTabs [data-tab="letter"]');
await pg.waitForSelector(`${L} #lfMemo`);

await run('fix1105-etc-letter', safe([
  ['[letter-year-1] 11월에 쓰면 AI에게 오늘이 든 학년도(2026)를 알리고, 연도 없는 관련 공문 날짜도 2026년', async () => {
    await pg.fill(`${L} #lfMemo`, '겨울방학 안내. 방학식 12월 24일.');
    await pg.click(`${L} [data-lf="write"]`);
    await lt('가정통신문을 썼어요');
    const p = AI.letter[AI.letter.length - 1];
    assert(p.includes('오늘: 2026-11-05, 학년도: 2026.'), p.split('\n')[1]);
    const sb = await pg.inputValue(`${L} #lfSendBody`);
    assert(sb.includes('교무-123(2026. 10. 28.)') && !sb.includes('2027'), sb);
  }],
  ['[letter-focus-1] AI가 쓰는 동안 「넣을 내용」에 이어 쓰면, 다 쓴 뒤에도 초점·친 글이 그대로(한글 조합 중이어도)', async () => {
    await pg.fill(`${L} #lfMemo`, '현장체험학습.');
    const release = hold();
    await pg.click(`${L} [data-lf="write"]`);
    await pg.waitForTimeout(200);
    await pg.click(`${L} #lfMemo`);
    await pg.keyboard.press('End');
    await pg.keyboard.insertText(' 도시락');
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('Input.imeSetComposition', { text: '물', selectionStart: 1, selectionEnd: 1 });
    release();
    await notBusy();
    await pg.waitForTimeout(200);
    const st = await pg.evaluate(() => ({ id: document.activeElement && document.activeElement.id, v: document.activeElement && document.activeElement.value }));
    assert(st.id === 'lfMemo' && st.v === '현장체험학습. 도시락물', JSON.stringify(st));
    await cdp.send('Input.insertText', { text: '물' });
    await cdp.detach();
    await pg.keyboard.insertText(' 편한 옷');
    assert((await pg.inputValue(`${L} #lfMemo`)) === '현장체험학습. 도시락물 편한 옷', await pg.inputValue(`${L} #lfMemo`));
    const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('ssam:letter:cur')).memo);
    assert(saved === '현장체험학습. 도시락물 편한 옷', saved);
    // 결과·알림 글·기안은 새로 쓴 것으로
    const n = AI.letter.length;
    assert((await pg.inputValue(`${L} [data-lo="title"]`)) === `겨울방학 안내 ${n}`, await pg.inputValue(`${L} [data-lo="title"]`));
    assert((await pg.inputValue(`${L} #lfShort`)) === `방학 안내 ${n}`, await pg.inputValue(`${L} #lfShort`));
    assert((await pg.inputValue(`${L} #lfSendTitle`)).includes(`겨울방학 안내 ${n}`), await pg.inputValue(`${L} #lfSendTitle`));
    assert((await pg.textContent(`${L} [data-lf="write"]`)).includes('다시 쓰기'), '쓰기 단추');
  }],
  ['[letter-focus-1] [다시 쓰기] 중에 발송 기안을 고치고 있었으면, 다 쓴 뒤에도 그 칸에 초점이 남아 이어 친 글이 들어감', async () => {
    const release = hold();
    await pg.click(`${L} [data-lf="write"]`);
    await pg.waitForTimeout(200);
    await pg.click(`${L} #lfSendBody`);
    await pg.keyboard.insertText('고침');
    release();
    await notBusy();
    await pg.waitForTimeout(200);
    assert(await pg.evaluate(() => document.activeElement && document.activeElement.id === 'lfSendBody'), '초점: ' + (await pg.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName))));
    await pg.keyboard.insertText(' 이어서');
    const v = await pg.inputValue(`${L} #lfSendBody`);
    assert(v.endsWith(' 이어서') && v.includes(`겨울방학 안내 ${AI.letter.length}`), v);
  }],
  ['[reply-opt-sep-1] 회신서 칸 「□ 참가 / □ 불참」 → 읽을 칸·선택지는 「참가 / 불참」, 예전에 「참가 /」로 저장한 줄도 「참가」로 맞춤', async () => {
    await pg.evaluate(() => {
      const x = JSON.parse(localStorage.getItem('ssam:letter:cur'));
      x.collect = { mask: [], rows: [{ no: 1, answers: { '참가 여부': '참가 /' }, unsure: [] }, { no: 2, answers: { '참가 여부': '불참' }, unsure: [] }] };
      localStorage.setItem('ssam:letter:cur', JSON.stringify(x));
    });
    await pg.reload();
    await pg.waitForTimeout(400);
    await pg.click('nav.app-side [data-menu-go="etc"]');
    await pg.click('#menuTabs [data-tab="letter"]');
    await pg.waitForSelector(`${L} #lfCollect`);
    const tx = (await pg.textContent(`${L} #lfCollect`)).replace(/\s+/g, ' ');
    assert(tx.includes('참가 여부(참가 / 불참)') && !tx.includes('참가 / /'), tx);
    assert(tx.includes('참가 1명 · 불참 1명'), tx);
    assert((await pg.inputValue(`${L} [data-rc-a="0"]`)) === '참가', await pg.inputValue(`${L} [data-rc-a="0"]`));
  }],
  ['페이지 오류 없음', async () => { assert(t2.errors.length === 0, t2.errors.join(' | ')); }]
]));
await t2.close();
