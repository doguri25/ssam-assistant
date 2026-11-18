// 2026-11-18 「쌤」 채팅 규정 질문 → 마주온 톡톡 안내(스펙 2026-11-18-toktok-design): 답보다 먼저 안내 거품(AI가 있어도·없어도),
// 쌤비서 쓰는 법 질문에는 없음, AI 공통 안내에 「금액·날짜·조항을 지어 말하지 않음」
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.includes('[쌤비서 채팅]')) return JSON.stringify({ reply: '(쌤비서 기능이 아닌 일반 안내예요) 학교 복무 지침을 확인해 주세요.', actions: [] });
  return '{}';
});
const C = '#chatPanel';
async function fresh(withAI) {
  await page.evaluate(on => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('ssam:chat') || k === 'ssam:engine') localStorage.removeItem(k);
    if (on) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
    else localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'none', keys: {}, remember: true }));
  }, withAI);
  await page.reload(); await page.waitForTimeout(400);
  if (await page.isHidden(C)) await page.click('#inboxFab');
  await page.waitForSelector(`${C}:not([hidden])`);
}
// 보낸 글(마지막 「me」 거품) 뒤의 쌤 답들(맨 위 아침 브리핑 거품은 다시 그려질 수 있어 셈하지 않음)
const after = () => page.$$eval(`${C} #chatLog .chat-msg`, l => { const i = l.map(m => m.classList.contains('me')).lastIndexOf(true); return l.slice(i + 1).filter(m => m.classList.contains('bot')).map(m => m.textContent.trim()); });
async function ask(text, until) {
  await page.fill('#chatText', text); await page.click('#chatSend');
  await page.waitForFunction(s => { const l = [...document.querySelectorAll('#chatPanel #chatLog .chat-msg')]; const i = l.map(m => m.classList.contains('me')).lastIndexOf(true); return i >= 0 && l[i].textContent.includes(s[0]) && l.slice(i + 1).some(m => m.textContent.includes(s[1])); }, [text.slice(0, 8), until], { timeout: 8000 });
  await page.waitForTimeout(200);
  return after();
}

await page.goto(url);
await run('fix1118-toktok', [
  ['AI가 있을 때: 규정 질문이면 마주온 톡톡 안내가 AI 답보다 먼저, AI 공통 안내에 지어내지 않는 규칙', async () => {
    await fresh(true);
    const got = await ask('육아시간 하루 몇 시간까지 쓸 수 있어?', '일반 안내예요');
    const i = got.findIndex(b => b.includes('마주온 톡톡')), j = got.findIndex(b => b.includes('일반 안내예요'));
    assert(i >= 0 && j > i && got[i].includes('ai.cne.go.kr'), JSON.stringify(got));
    const p = prompts.find(x => x.includes('[쌤비서 채팅'));
    assert(p && /복무·수당·여비[^\n]*금액·날짜·조항/.test(p), 'AI 공통 안내 규칙');
  }],
  ['쌤비서 쓰는 법 질문에는 톡톡 안내가 없음', async () => {
    const got = await ask('강사 수당 품의 어떻게 해?', '일반 안내예요');
    assert(!got.some(b => b.includes('마주온 톡톡')), JSON.stringify(got));
  }],
  ['AI가 없을 때도 규정 질문이면 안내가 먼저', async () => {
    await fresh(false);
    const got = await ask('출장비 얼마 받아?', '마주온');
    assert(got[0].includes('마주온 톡톡') && got[0].includes('ai.cne.go.kr'), JSON.stringify(got));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
