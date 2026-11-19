// 여섯 번째 버그 찾기(2026-11-19) — 「쌤」 채팅 화면 흐름: 「3번 메모 지워 줘」는 메모에 넣지 않음, 「3번 메모 확인해 줘」는 메모 보기,
// 「3번 … 메모해 줘」는 꼬리를 뺀 글을 메모에(chat.js가 가리기 전 글로 다시 읽어도), 「다음 주 공문 기한」은 공문을 만들지 않음,
// 「쓰던 품의 이어서」는 쓰던 품의를 치우지 않고 AI도 부르지 않음, 「저장한 품의 템플릿」은 그 탭
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:hk')) localStorage.setItem('ssam:hk', JSON.stringify({ settings: {}, students: [{ id: 'h3', no: 3, label: '', memo: '[11. 3.] 토론에서 근거 들어 반론 잘함', results: [], done: 0 }] }));
  if (!localStorage.getItem('ssam:class')) localStorage.setItem('ssam:class', JSON.stringify({ count: 25, except: [] }));
  if (!localStorage.getItem('ssam:gongmun:list')) localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gm1', name: '과학의 날', title: '과학의 날 참가 신청', due: '2026-11-24', tasks: [], kinds: [], text: '과학의 날 공문', at: 1, done: false }]));
  if (!localStorage.getItem('ssam:purchase:current')) localStorage.setItem('ssam:purchase:current', JSON.stringify({ id: 'pc1', form: { type: 'goods', project: '과학 실험', items: [{ name: '비커', spec: '500ml', qty: 10, unit: '개', price: 3000 }] }, draft: { title: '과학 실험 재료 구입', intro: '과학 실험 재료를 구입하고자 합니다.' } }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.includes('[쌤비서 채팅]\n')) return JSON.stringify({ reply: '행동특성 화면에서 메모를 고칠 수 있어요.', actions: [], choices: ['hk'] });
  if (prompt.startsWith('[품의')) return JSON.stringify({ title: '물품 구입', intro: '물품을 구입하고자 합니다.', fields: { purpose: '' }, type: 'goods' });
  if (prompt.startsWith('[공문 처리]')) return JSON.stringify({ title: '가짜 공문', due: '', summary: '', tasks: [], kinds: [] });
  return '{}';
});
await page.goto(url);
await page.waitForSelector('#inboxFab');

const C = '#chatPanel';
const openChat = async () => { if (await page.isHidden(C)) await page.click('#inboxFab'); await page.waitForSelector(`${C}:not([hidden])`); };
const lastBot = () => page.evaluate(() => { const l = [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')]; return l.length ? l[l.length - 1].textContent : ''; });
const lastId = () => page.evaluate(() => { const l = [...document.querySelectorAll('#chatLog .chat-msg')]; return l.length ? l[l.length - 1].dataset.id || '' : ''; });
const sendWait = async text => {
  await openChat();
  const prev = await lastId();
  await page.fill('#chatText', text); await page.click('#chatSend');
  await page.waitForFunction(prev => { const l = [...document.querySelectorAll('#chatLog .chat-msg')], m = l[l.length - 1];
    return !!m && m.classList.contains('bot') && !m.classList.contains('wait') && m.dataset.id !== prev; }, prev);
  return lastBot();
};
const memo3 = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:hk')).students.find(s => s.no === 3) || {}).memo);
const gmTitles = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gongmun:list') || '[]').map(d => d.title));
const pcState = () => page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'); return { id: c && c.id, draft: c && c.draft && c.draft.title }; });
const nav = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav') || 'null'));
const ORIG = '[11. 3.] 토론에서 근거 들어 반론 잘함';

await run('fix1119-bugs6-chat', [
  ['「3번 메모 지워줘」「3번 평어 다시 써줘」「3번 점수 고쳐줘」는 행특 메모에 넣지 않음', async () => {
    for (const s of ['3번 메모 지워줘', '3번 평어 다시 써줘', '3번 점수 고쳐줘']) {
      const a = await sendWait(s);
      assert(!a.includes('메모에 넣었어요'), `${s} → ${a}`);
    }
    assert((await memo3()) === ORIG, `메모가 바뀜: ${await memo3()}`);
  }],
  ['「3번 메모 확인해줘」「3번 메모 좀 봐줘」는 메모 보기', async () => {
    for (const s of ['3번 메모 확인해줘', '3번 메모 좀 봐줘']) {
      const a = await sendWait(s);
      assert(a.includes('3번 메모') && a.includes('토론에서 근거'), `${s} → ${a}`);
    }
    assert((await memo3()) === ORIG, '메모가 바뀜');
  }],
  ['「3번 발표 잘함 메모해 줘」는 「발표 잘함」만 메모에(꼬리 없이)', async () => {
    const a = await sendWait('3번 발표 잘함 메모해 줘');
    assert(a.includes('메모에 넣었어요') && a.includes('[11. 19.] 발표 잘함」'), a);
    await page.waitForFunction(() => /발표 잘함/.test((JSON.parse(localStorage.getItem('ssam:hk')).students.find(s => s.no === 3) || {}).memo || ''), null, { timeout: 5000 }).catch(() => {});
    assert((await memo3()) === `${ORIG}\n[11. 19.] 발표 잘함`, `메모: ${await memo3()}`);
  }],
  ['「다음 주 공문 기한」「11월 공문 기한」은 공문을 만들지 않고 공문 처리 탭만', async () => {
    const n0 = prompts.filter(p => p.startsWith('[공문 처리]')).length;
    for (const s of ['다음 주 공문 기한', '11월 공문 기한']) {
      const a = await sendWait(s);
      assert(a.includes('공문 처리로 왔어요'), `${s} → ${a}`);
    }
    assert(JSON.stringify(await gmTitles()) === JSON.stringify(['과학의 날 참가 신청']), `공문 목록: ${await gmTitles()}`);
    assert(prompts.filter(p => p.startsWith('[공문 처리]')).length === n0, '공문 AI를 부름');
  }],
  ['「쓰던 품의 이어서」는 쓰던 품의를 그대로 두고 AI를 부르지 않음, 「저장한 품의 템플릿」은 그 탭', async () => {
    const n0 = prompts.filter(p => p.startsWith('[품의')).length;
    const a = await sendWait('쓰던 품의 이어서');
    assert(a.includes('새 품의로 왔어요'), a);
    const s = await pcState();
    assert(s.id === 'pc1' && s.draft === '과학 실험 재료 구입', `쓰던 품의가 바뀜: ${JSON.stringify(s)}`);
    assert(prompts.filter(p => p.startsWith('[품의')).length === n0, '품의 AI를 부름');
    const b = await sendWait('저장한 품의 템플릿');
    assert(b.includes('저장한 템플릿으로 왔어요'), b);
    const n = await nav();
    assert(n && n.menu === 'purchase' && n.tab === 'templates', `탭: ${JSON.stringify(n)}`);
    assert((await pcState()).id === 'pc1', '쓰던 품의가 바뀜');
  }],
  ['화면 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
