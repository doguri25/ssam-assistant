// 메뉴 사이 정보 흐름(2026-11-18 점검): 「쌤」 채팅 예산·수업 아이디어·보강 → 그 화면, 「예산 얼마 남았어?」 AI 없이, 떠 있는 버튼 이수증 → 연수,
// 기초학력 [+ 줄]이 재량휴업일을 건너뜀. 예시 이름은 지어낸 것
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-18T09:00:00'));
let aiCalls = 0;
await mockClaude(page, async () => { aiCalls++; return JSON.stringify({ reply: '안내예요.', actions: [] }); });
await page.addInitScript(() => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })); });
page.on('dialog', d => d.accept());
const C = '#chatPanel', sheet = '#sheetRoot .sheet';
await page.goto(url);
await page.waitForTimeout(400);
async function openChat() { if (await page.isHidden(C)) await page.click('#inboxFab'); await page.waitForSelector(`${C}:not([hidden])`); }
async function say(text) {
  await openChat();
  await page.fill('#chatText', text); await page.click('#chatSend');
  await page.waitForFunction(s => { const l = [...document.querySelectorAll('#chatPanel #chatLog .chat-msg')]; const i = l.map(m => m.classList.contains('me')).lastIndexOf(true); return i >= 0 && l[i].textContent.includes(s) && l.slice(i + 1).some(m => m.classList.contains('bot')); }, text.slice(0, 6), { timeout: 8000 });
  await page.waitForTimeout(200);
  return page.$$eval(`${C} #chatLog .chat-msg`, l => { const i = l.map(m => m.classList.contains('me')).lastIndexOf(true); return l.slice(i + 1).map(m => m.textContent.trim()).join('\n'); });
}
const cur = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav') || '{}'));

await run('fix1118-flow', [
  ['「예산 집행 현황 보여줘」 → AI 없이 답하고 [예산 집행 현황 열기] → 품의 › 예산 탭', async () => {
    const a = await say('예산 집행 현황 보여줘');
    assert(a.includes('아직 사업이 없어요'), a);
    await page.click(`${C} #chatLog .chat-msg:last-child .chat-chip:has-text("예산 집행 현황 열기")`);
    await page.waitForTimeout(150);
    const n = await cur();
    assert(n.menu === 'purchase' && n.tab === 'budget', JSON.stringify(n));
  }],
  ['「예산 얼마 남았어?」 → AI 없이 사업마다 남은 돈', async () => {
    await page.evaluate(async () => { const B = await import('./menus/purchase/budget-model.js'); B.saveProject({ name: '친구사랑 우정 사진전', amount: 500000, due: '2026-11-30' }); });
    const before = aiCalls;
    const a = await say('예산 얼마 남았어?');
    assert(a.includes('「친구사랑 우정 사진전」 남음 500,000원') && a.includes('D-12'), a);
    assert(aiCalls === before, 'AI를 부름');
  }],
  ['「수업 아이디어 줘」 → 평가 › 활동지 › 수업 아이디어', async () => {
    await say('수업 아이디어 줘');
    const n = await cur();
    assert(n.menu === 'evaluate' && n.tab === 'activity', JSON.stringify(n));
    assert(await page.isVisible('section[data-menu="evaluate"] .un-title:has-text("수업 아이디어")'), '수업 아이디어 화면');
  }],
  ['「보강 넣어줘」 → 학급 › 오늘 수업', async () => {
    await say('보강 넣어줘');
    const n = await cur();
    assert(n.menu === 'class' && n.tab === 'today', JSON.stringify(n));
  }],
  ['떠 있는 버튼: 이수증 → 연수 › 내 필수연수에 이수 기록', async () => {
    await page.evaluate(async () => { const T = await import('./menus/training/training-model.js'); T.saveMine([{ title: '청렴교육', due: '2026-11-30' }]); });
    if (!(await page.isHidden(C))) await page.click('#inboxFab').catch(() => {});
    await page.setInputFiles('#inboxFile', [{ name: 'scan01.txt', mimeType: 'text/plain', buffer: Buffer.from('이 수 증\n성 명: 김하늘\n과정명: 2026년 청렴교육\n이수일: 2026. 11. 2.\n이수시간: 1시간\n위 사람은 위 연수를 이수하였음을 증명합니다.') }]);
    await page.waitForSelector(`${sheet} #ibRun:not([disabled])`);
    assert((await page.textContent(sheet)).includes('연수 이수증'), await page.textContent(sheet));
    await page.click(`${sheet} #ibRun`);
    await page.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('ssam:training:mine') || '[]'); return l[0] && l[0].status === 'done'; });
    const x = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:training:mine'))))[0];
    assert(x.doneDate === '2026-11-02' && x.hours === 1 && x.cert === 'scan01.txt', JSON.stringify(x));
    const n = await cur();
    assert(n.menu === 'training' && n.tab === 'mine', JSON.stringify(n));
  }],
  ['기초학력 수업 날: 재량휴업일 건너뜀(설정 › 학교 정보)', async () => {
    const r = await page.evaluate(async () => {
      const S = await import('./core/settings.js'); S.setSchool({ breaks: [{ from: '2026-11-19', to: '2026-11-19', label: '재량휴업일' }] });
      const M = await import('./menus/class/camp-model.js');
      return M.expandDates('2026-11-18', '2026-11-20');
    });
    assert(JSON.stringify(r) === '["2026-11-18","2026-11-20"]', JSON.stringify(r));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
