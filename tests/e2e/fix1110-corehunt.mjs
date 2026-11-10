// 2026-11-10 공통 영역 버그 찾기(core) — 「쌤」 채팅: 「3번 …」 꼴 글의 전자 우편·주민등록번호가 채팅 기록(ssam:chat)에 그대로 남던 것,
// 저장 공간이 꽉 차거나 막히면 보낸 글과 쌤비서의 답이 채팅 창에 보이지 않던 것
import { open, run, assert } from './helpers.mjs';

const C = '#chatPanel';
const setup = () => {
  if (!localStorage.getItem('ssam:hk')) localStorage.setItem('ssam:hk', JSON.stringify({ settings: {}, students: [{ id: 'h3', no: 3, label: '', memo: '성실함', results: [], done: 0 }] }));
  if (!localStorage.getItem('ssam:class')) localStorage.setItem('ssam:class', JSON.stringify({ count: 0, except: [] }));
};
const helpers = page => {
  const openChat = async () => { if (await page.isHidden(C)) await page.click('#inboxFab'); await page.waitForSelector(`${C}:not([hidden])`); };
  const send = async text => { await openChat(); await page.fill('#chatText', text); await page.click('#chatSend'); };
  const waitBot = s => page.waitForFunction(s => [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')].some(b => b.textContent.includes(s)), s);
  const mine = () => page.$$eval('#chatLog .chat-msg.me .chat-bub', l => l.map(x => x.textContent));
  return { openChat, send, waitBot, mine };
};

/* ---------- 1. 기록에 남는 글 ---------- */
const t = await open();
const { page, url, errors } = t;
await page.addInitScript(setup);
await page.goto(url);
await page.waitForTimeout(400);
const h = helpers(page);
const chatLog = () => page.evaluate(() => localStorage.getItem('ssam:chat') || '');
const hk = () => page.evaluate(() => localStorage.getItem('ssam:hk') || '');

/* ---------- 2. 저장 공간이 꽉 참(채팅 기록만 저장하지 못함) ---------- */
const t2 = await open();
await t2.page.addInitScript(() => {
  const orig = Storage.prototype.setItem;
  const FULL = ['ssam:chat', 'ssam:inbox', 'ssam:ai-roles'];
  Storage.prototype.setItem = function (k, v) { if (FULL.includes(k)) throw new DOMException('꽉 참', 'QuotaExceededError'); return orig.call(this, k, v); };
});
await t2.page.goto(t2.url);
await t2.page.waitForTimeout(400);
const h2 = helpers(t2.page);

/* ---------- 3. 저장소가 막힘(localStorage에 닿으면 오류) ---------- */
const t3 = await open();
await t3.page.addInitScript(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('막힘', 'SecurityError'); } });
});
await t3.page.goto(t3.url);
await t3.page.waitForTimeout(600);
const h3 = helpers(t3.page);

await run('fix1110-corehunt', [
  ['[core-chat-log] 「3번 …」 꼴 글의 전자 우편은 채팅 기록에 남지 않음(메모에도 ○○○)', async () => {
    await h.send('3번 엄마 메일 mom@naver.com 으로 상담 신청함');
    await h.waitBot('행동특성 메모에 넣었어요');
    assert(!(await chatLog()).includes('mom@naver.com'), '기록에 전자 우편: ' + await chatLog());
    assert(!(await hk()).includes('mom@naver.com'), '메모에 전자 우편');
    assert((await h.mine()).some(s => s.includes('3번 엄마 메일 ○○○ 으로 상담 신청함')), JSON.stringify(await h.mine()));
  }],
  ['[core-chat-log] 주민등록번호도 기록·메모에 남지 않음', async () => {
    await h.send('3번 주민번호 120304-3123456 서류 확인함');
    await h.waitBot('「[');
    await page.waitForFunction(() => (localStorage.getItem('ssam:chat') || '').includes('서류 확인함'));
    assert(!(await chatLog()).includes('3123456'), '기록에 주민번호: ' + await chatLog());
    assert(!(await hk()).includes('3123456'), '메모에 주민번호');
  }],
  ['[core-chat-full] 저장 공간이 꽉 차도 보낸 글과 답은 채팅 창에 보임', async () => {
    await h2.send('주간학습안내');
    await h2.waitBot('주간학습안내로 왔어요');
    assert((await h2.mine()).includes('주간학습안내'), '보낸 글이 안 보임: ' + JSON.stringify(await h2.mine()));
    await h2.send('3번 발표를 잘함');
    await h2.waitBot('행동특성 메모에 넣었어요');
    assert((await h2.mine()).length === 2, JSON.stringify(await h2.mine()));
  }],
  ['[core-save-result] 저장 공간이 꽉 차면 떠 있는 버튼 설정은 false를 돌려주고, 업무별 AI 창은 「저장했어요」 대신 알림(창은 그대로)', async () => {
    const p = t2.page;
    const r = await p.evaluate(async () => { const m = await import('./core/inbox.js'); return [m.setInboxSettings({ mode: 'direct' }), m.getInboxSettings().mode]; });
    assert(r[0] === false && r[1] === 'confirm', JSON.stringify(r));
    await p.evaluate(async () => (await import('./core/ai-roles.js')).openRoleSheet('grade'));
    await p.waitForSelector('#aiRoleSheet');
    await p.click('#arSave');
    await p.waitForFunction(() => (document.getElementById('arNote') || {}).textContent.includes('저장 공간이 모자라'));
    assert(await p.locator('#aiRoleSheet').count() === 1, '창이 닫힘');
    assert(!(await p.textContent('#toast')).includes('AI를 저장했어요'), await p.textContent('#toast'));
    await p.click('#sheetRoot [data-close]');
  }],
  ['[core-chat-blocked] 저장소가 막혀도 채팅이 답함', async () => {
    await h3.send('오늘 할 일');
    await h3.waitBot('오늘');
    assert((await h3.mine()).includes('오늘 할 일'), JSON.stringify(await h3.mine()));
    await h3.send('진도표');
    await h3.waitBot('진도표·시수로 왔어요');
  }],
  ['페이지 오류 없음', async () => {
    assert(errors.length === 0, errors.join(' | '));
    assert(t2.errors.length === 0, t2.errors.join(' | '));
    assert(t3.errors.length === 0, t3.errors.join(' | '));
  }]
]);
await t.close(); await t2.close(); await t3.close();
