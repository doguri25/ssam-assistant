// 2026-11-04 고침(기타 › 쪽지·공문 처리): 읽는 중 다른 쪽지로 옮기기, 스캔·사진 안내, 읽기가 끝나도 쓰던 칸·한글 조합 그대로,
// 손으로 고친 본문과 길이 단추, 뺀 붙임이 [다시 안내]에서도 빠짐, 며칠짜리 일정 끝 날짜, 12월에 넣은 1월 날짜
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const AI = { delay: 0, images: [], msg: 0 };
const wait = ms => new Promise(r => setTimeout(r, ms));
await mockClaude(page, async ({ prompt, images }) => {
  if (prompt.startsWith('[쪽지 안내]')) {
    AI.msg++; AI.images.push(images);
    const which = prompt.includes('첫째 공문') ? '첫째' : prompt.includes('둘째 공문') ? '둘째' : prompt.includes('수련원') ? '수련' : images ? '스캔' : '기타';
    if (AI.delay) await wait(AI.delay);
    if (which === '수련') return JSON.stringify({ kind: 'training', title: '1박 2일 연수', when: [{ date: '2026-11-12', end: '2026-11-13', time: '' }], place: '수련원' });
    return JSON.stringify({ kind: 'training', title: `${which} 연수`, when: [{ date: '2026-11-12', time: '15:00' }], place: '강당' });
  }
  if (prompt.startsWith('[공문 처리]')) {
    if (AI.delay) await wait(AI.delay);
    const which = prompt.includes('첫째 공문') ? '첫째' : prompt.includes('둘째 공문') ? '둘째' : '셋째';
    return JSON.stringify({ title: `${which} 공문`, due: '2026-11-20', tasks: [{ text: '신청서 제출', due: '' }], kinds: ['message'] });
  }
  return '{}';
});
const P = 'section[data-menu="etc"]', G = `${P} .gm-box`;
const body = () => page.inputValue(`${P} #msgBody`);
const toastHas = s => page.waitForFunction(x => (document.querySelector('#toast') || {}).textContent?.includes(x), s);
await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="etc"]');
await page.click('#menuTabs [data-tab="message"]');
await page.waitForSelector(`${P} #msgPaste`);

await run('fix1104-etc', [
  ['[msg-race-1] 읽는 중 [새 쪽지] → 다 읽은 쪽지는 최근 쪽지에 넣고 알림, 지금 쪽지는 빈 채로', async () => {
    AI.delay = 1200;
    await page.fill(`${P} #msgPaste`, '첫째 공문 연수 안내 11월 12일 강당');
    await page.click(`${P} [data-msg="read"]`);
    await page.waitForTimeout(200);
    await page.click(`${P} [data-msg="new"]`);
    await toastHas('최근 쪽지에 넣었어요');
    assert((await page.textContent('#toast')).includes('첫째 연수'), await page.textContent('#toast'));
    assert(!(await body()).includes('첫째'), await body());
    await page.waitForFunction(s => (document.querySelector(`${s} #msgRecent`) || {}).textContent?.includes('첫째 연수'), P);
    assert(!(await page.$(`${P} [data-msg="read"][disabled]`)), '읽는 중으로 남음');
  }],
  ['[msg-race-1] 공문 처리에서 [쪽지]를 연달아 두 번 → 둘 다 AI로 읽고, 앞 것은 최근 쪽지에, 화면은 나중 공문', async () => {
    AI.delay = 0;
    await page.click('#menuTabs [data-tab="gongmun"]');
    for (const s of ['첫째 공문\n제목 첫째 공문 연수', '둘째 공문\n제목 둘째 공문 연수']) {
      await page.fill(`${G} #gmPaste`, s);
      await page.click(`${G} [data-gm="paste"]`);
    }
    await page.waitForFunction(s => document.querySelectorAll(`${s} .gm-doc`).length === 2 && !document.querySelector(`${s} .spin`), G);
    AI.delay = 1200;
    const n0 = AI.msg;
    await page.click(`${G} .gm-doc:has(.gm-title:text("첫째 공문")) [data-gm-go="message"]`);
    await page.waitForTimeout(200);
    await page.click('#menuTabs [data-tab="gongmun"]');
    await page.click(`${G} .gm-doc:has(.gm-title:text("둘째 공문")) [data-gm-go="message"]`);
    await page.waitForFunction(s => ((document.querySelector(`${s} #msgBody`) || {}).value || '').startsWith('[연수 안내] 둘째 연수'), P, { timeout: 8000 });
    await page.waitForTimeout(300);
    assert(AI.msg - n0 === 2, 'AI 읽기 ' + (AI.msg - n0));
    assert((await page.textContent(`${P} #msgRecent`)).includes('첫째 연수'), await page.textContent(`${P} #msgRecent`));
    AI.delay = 0;
  }],
  ['[msg-privacy-1] 넣기 칸은 스캔·사진은 그림 그대로 AI로 간다고 알리고, 사진을 넣으면 알림에도', async () => {
    await page.click(`${P} [data-msg="new"]`);
    const note = await page.textContent(`${P} .msg-drop p.muted`);
    assert(note.includes('스캔·사진') && note.includes('그림 그대로 AI로'), note);
    await page.setInputFiles(`${P} #msgFile`, [{ name: '수상자 명단 공문(스캔).png', mimeType: 'image/png', buffer: readFileSync(join(FIXTURES, 'sheet-1.png')) }]);
    await page.waitForFunction(s => ((document.querySelector(`${s} #msgBody`) || {}).value || '').startsWith('[연수 안내] 스캔 연수'), P, { timeout: 15000 });
    assert(AI.images[AI.images.length - 1] === 1, '그림 ' + AI.images);
    assert((await page.textContent('#toast')).includes('그림 그대로 AI로 보냈어요'), await page.textContent('#toast'));
  }],
  ['[msg-privacy-1] 공문 처리: 스캔·사진 공문을 넣으면 [쪽지]는 그림을 AI로 읽는다고 알림', async () => {
    await page.click('#menuTabs [data-tab="gongmun"]');
    await page.setInputFiles(`${G} #gmFile`, [{ name: '스캔 공문.png', mimeType: 'image/png', buffer: readFileSync(join(FIXTURES, 'sheet-1.png')) }]);
    await toastHas('스캔·사진 공문');
    const tx = await page.textContent('#toast');
    assert(tx.includes('[쪽지]') && tx.includes('그림 그대로 AI'), tx);
    page.once('dialog', d => d.accept());
    await page.click(`${G} .gm-doc:has(.gm-title:text("스캔 공문")) [data-gm-del]`);
    await page.waitForFunction(s => !document.querySelector(s).textContent.includes('스캔 공문'), G);
  }],
  ['[gm-render-1] 공문 처리: AI가 다른 공문을 다 읽어도 붙여 넣던 글·초점이 그대로', async () => {
    AI.delay = 1000;
    await page.fill(`${G} #gmPaste`, '셋째 공문\n제목 과학의 날');
    await page.click(`${G} [data-gm="paste"]`);
    await page.waitForSelector(`${G} .spin`);
    await page.click(`${G} #gmPaste`);
    await page.keyboard.insertText('넷째 공문 붙여 넣는 중');
    await page.waitForFunction(s => !document.querySelector(`${s} .spin`), G, { timeout: 8000 });
    await page.waitForTimeout(200);
    assert((await page.inputValue(`${G} #gmPaste`)) === '넷째 공문 붙여 넣는 중', await page.inputValue(`${G} #gmPaste`));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id === 'gmPaste'), '초점');
    assert((await page.textContent(G)).includes('셋째 공문'), '읽은 공문');
  }],
  ['[gm-render-1] 공문 처리: 다른 공문의 할 일 칸에서 한글을 조합하는 중에 읽기가 끝나도 그 칸·초점이 그대로', async () => {
    await page.fill(`${G} #gmPaste`, '셋째 공문\n제목 안전 교육');
    await page.click(`${G} [data-gm="paste"]`);
    await page.waitForSelector(`${G} .spin`);
    const inp = page.locator(`${G} .gm-doc:has(.gm-title:text("첫째 공문")) [data-gm-tadd]`);
    await inp.click();
    await page.keyboard.insertText('참가 학생 ');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '조', selectionStart: 1, selectionEnd: 1 });
    await page.waitForFunction(s => !document.querySelector(`${s} .spin`), G, { timeout: 8000 });
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ v: document.activeElement.value, t: document.activeElement.dataset.gmTadd != null }));
    assert(st.t && st.v.startsWith('참가 학생 '), JSON.stringify(st));
    await cdp.send('Input.insertText', { text: '조' });
    await cdp.detach();
    await page.keyboard.press('Enter');
    await page.waitForFunction(s => [...document.querySelectorAll(`${s} .gm-tasks span`)].some(e => e.textContent === '참가 학생 조'), G);
    AI.delay = 0;
  }],
  ['[gm-render-1] 쪽지: AI가 다 읽어도 보내는 사람 칸의 초점이 그대로, 칸은 채워짐', async () => {
    await page.click('#menuTabs [data-tab="message"]');
    await page.click(`${P} [data-msg="new"]`);
    AI.delay = 1000;
    await page.fill(`${P} #msgPaste`, '첫째 공문 연수 안내');
    await page.click(`${P} [data-msg="read"]`);
    await page.click(`${P} #msgSender`);
    await page.keyboard.insertText('교무부 기');
    await page.waitForFunction(s => !document.querySelector(`${s} [data-msg="read"][disabled]`), P, { timeout: 8000 });
    await page.waitForTimeout(200);
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id === 'msgSender'), '초점');
    assert((await page.inputValue(`${P} [data-mf="title"]`)) === '첫째 연수', await page.inputValue(`${P} [data-mf="title"]`));
    assert((await body()).includes('문의: 교무부 기'), await body());
    await page.fill(`${P} #msgSender`, '');
    AI.delay = 0;
  }],
  ['[msg-len-1] 본문을 손으로 고친 뒤 [짧게] → 묻고, [취소]면 고친 본문 그대로·[확인]이면 짧게', async () => {
    const b0 = await body();
    await page.fill(`${P} #msgBody`, b0 + '\n주차는 후문 쪽을 이용해 주세요.');
    await page.waitForSelector(`${P} [data-msg="resync"]`);
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click(`${P} [data-len="short"]`);
    await page.waitForTimeout(200);
    assert(asked.includes('고친 본문'), '묻지 않음');
    assert((await body()).includes('주차는 후문 쪽을'), '취소했는데 고친 본문이 사라짐');
    assert((await page.getAttribute(`${P} [data-len="base"]`, 'aria-pressed')) === 'true', '길이가 바뀜');
    page.once('dialog', d => d.accept());
    await page.click(`${P} [data-len="short"]`);
    await page.waitForFunction(s => !document.querySelector(`${s} #msgBody`).value.includes('주차는') && document.querySelector(`${s} [data-len="short"]`).getAttribute('aria-pressed') === 'true', P);
    // 고치지 않은 본문은 묻지 않고 바로
    let again = false;
    page.once('dialog', d => { again = true; d.accept(); });
    await page.click(`${P} [data-len="base"]`);
    await page.waitForTimeout(200);
    assert(!again, '고치지 않았는데 물음');
    page.removeAllListeners('dialog');
  }],
  ['[msg-attach-1] 뺀 붙임은 최근 쪽지 [다시 안내]·[열기]에서도 빠진 채', async () => {
    await page.click(`${P} [data-msg="new"]`);
    await page.setInputFiles(`${P} #msgFile`, [
      { name: '연수 공문.txt', mimeType: 'text/plain', buffer: Buffer.from('첫째 공문 연수 안내') },
      { name: '연수 계획.txt', mimeType: 'text/plain', buffer: Buffer.from('계획') }]);
    await page.waitForFunction(s => ((document.querySelector(`${s} #msgBody`) || {}).value || '').includes('2. 연수 계획 1부.'), P);
    await page.uncheck(`${P} [data-att="1"]`);
    await page.waitForFunction(s => document.querySelector(`${s} #msgBody`).value.includes('붙임  연수 공문 1부.  끝.'), P);
    await page.click(`${P} #msgRecent li:first-child [data-msg-again]`);
    await page.waitForFunction(s => ((document.querySelector(`${s} #msgBody`) || {}).value || '').startsWith('[다시 안내]'), P);
    assert((await body()).includes('붙임  연수 공문 1부.  끝.') && !(await body()).includes('연수 계획 1부'), await body());
    assert(!(await page.isChecked(`${P} [data-att="1"]`)), '뺀 붙임이 체크됨');
  }],
  ['[msg-end-1] 며칠짜리 일정: 끝 날짜 칸이 보이고, 날짜를 옮기면 끝도 같이 옮겨 「11. 19.(목)~11. 20.(금)」', async () => {
    await page.click(`${P} [data-msg="new"]`);
    await page.fill(`${P} #msgPaste`, '1박 2일 연수 수련원');
    await page.click(`${P} [data-msg="read"]`);
    await page.waitForFunction(s => ((document.querySelector(`${s} #msgBody`) || {}).value || '').includes('11. 12.(목)~11. 13.(금), 수련원'), P);
    assert((await page.inputValue(`${P} [data-mf="end"]`)) === '2026-11-13', '끝 날짜 칸');
    await page.fill(`${P} [data-mf="date"]`, '2026-11-19');
    await page.waitForFunction(s => document.querySelector(`${s} #msgBody`).value.includes('□ 일시·장소: 11. 19.(목)~11. 20.(금), 수련원'), P);
    assert((await page.inputValue(`${P} [data-mf="end"]`)) === '2026-11-20', '끝 날짜 칸이 따라 옮겨지지 않음');
    await page.fill(`${P} [data-mf="end"]`, '2026-11-21');
    await page.waitForFunction(s => document.querySelector(`${s} #msgBody`).value.includes('11. 19.(목)~11. 21.(토)'), P);
    await page.fill(`${P} [data-mf="date"]`, '');
    await page.waitForFunction(s => !document.querySelector(`${s} #msgBody`).value.includes('~'), P);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();

// 12월에 넣은 계획의 「1. 8.」은 다음 해(학년도 규칙) — 시계를 2026-12-10으로
const t2 = await open();
await t2.page.clock.setFixedTime(new Date('2026-12-10T10:00:00'));
await t2.page.addInitScript(() => {
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(t2.page, async ({ prompt }) => (prompt.startsWith('[쪽지 안내]') ? JSON.stringify({ kind: 'training', title: '겨울방학 직무 연수', when: [{ date: '01-08', time: '09:00~12:00' }], place: '시청각실', apply: { due: '12-28', how: '이음 쪽지' } }) : '{}'));
await t2.page.goto(t2.url);
await t2.page.waitForTimeout(400);
await run('fix1104-etc-year', [
  ['[msg-year-1] 12월에 넣은 「1. 8.」 연수 → 날짜 칸 2027-01-08, 본문 「2027. 1. 8.(금)」', async () => {
    const pg = t2.page;
    await pg.click('nav.app-side [data-menu-go="etc"]');
    await pg.click('#menuTabs [data-tab="message"]');
    await pg.fill(`${P} #msgPaste`, '겨울방학 직무 연수 1. 8.(금) 09:00~12:00 시청각실, 12. 28.까지 신청');
    await pg.click(`${P} [data-msg="read"]`);
    await pg.waitForFunction(s => ((document.querySelector(`${s} #msgBody`) || {}).value || '').startsWith('[연수 안내] 겨울방학'), P);
    const b = await pg.inputValue(`${P} #msgBody`);
    assert((await pg.inputValue(`${P} [data-mf="date"]`)) === '2027-01-08', await pg.inputValue(`${P} [data-mf="date"]`));
    assert(b.includes('2027. 1. 8.(금) 09:00~12:00, 시청각실') && b.includes('12. 28.(월)까지'), b);
  }],
  ['페이지 오류 없음', async () => { assert(t2.errors.length === 0, t2.errors.join(' | ')); }]
]);
await t2.close();
