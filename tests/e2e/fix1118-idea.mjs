// 평가 › 활동지 › [수업 아이디어] (스펙 2026-11-18-lesson-idea-design): 진도표 다음 차시(학급 자료는 읽기만) → [아이디어 만들기](AI 업무 계획, 학생 자료 없이)
// → 카드(흐름·준비물·살펴볼 것) → [이 아이디어로 활동지 만들기](같은 차시 + 「수업 활동: …」 줄로 바로 문항) · [복사] · 내려받기 · 최근 아이디어 다시 열기,
// 직접 쓴 범위의 교직원 이름은 가려 보내고 돌아온 아이디어에는 원래 이름, AI 키가 없으면 안내, 휴대폰 폭에서 넘치지 않음
import { open, run, assert, enter, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors, ctx } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-11-18T09:00:00'));
await page.addInitScript(() => {
  if (localStorage.getItem('ssam:__seeded')) return;
  localStorage.setItem('ssam:__seeded', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 1 }));
  const L = (unit, title, no, pages) => ({ week: null, period: '', from: '', unit, title, no, pages, memo: '' });
  localStorage.setItem('ssam:class:subjects', JSON.stringify([{ id: 'sci', name: '과학', start: '', offset: 1, total: null, lessons: [
    L('2. 동물의 생활', '주변의 동물 찾기', '1/3', '30~31'), L('2. 동물의 생활', '동물을 생김새로 분류하기', '2/3', '32~35'), L('2. 동물의 생활', '동물 카드 만들기', '3/3', '36~37')] }]));
});
const prompts = [];
const idea = (n, extra = '') => ({ title: `동물 분류 놀이 ${n}${extra}`, summary: '사진 카드를 기준을 정해 나눠요', form: n === 1 ? '모둠' : '짝', materials: '동물 사진 카드', look: '분류 기준을 말로 설명하는지',
  flow: [{ stage: '도입', min: 5, text: '사진 보며 다른 점 찾기' }, { stage: '전개', min: 25, text: '기준 정해 나누기' }, { stage: '정리', min: 10, text: '기준 발표' }] });
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[수업 아이디어]')) return JSON.stringify({ ideas: prompt.includes('〔이름1〕') ? [idea(1, ' — 〔이름1〕 선생님 추천')] : [idea(1), idea(2), idea(3)] });
  if (prompt.startsWith('[활동지 만들기]')) return JSON.stringify({ title: '동물 분류 활동지', items: [
    { kind: 'think', ask: '동물을 두 무리로 나누고 기준을 쓰세요.', answer: '다리 수', ok: '기준과 나눈 결과가 맞음', part: '기준만 씀' }] });
  return '{}';
});
const V = 'section[data-menu="evaluate"] .act-box', P = `${V} .act-page`;
const ideaCards = () => page.locator(`${P} .idea-card`).count();
await page.goto(url);
await page.waitForTimeout(400);

await run('fix1118-idea', [
  ['목록의 [수업 아이디어] → 진도표 다음 차시가 골라져 있고 유형 칸이 없음, 수 칸은 「아이디어 수」', async () => {
    await enter(page, 'evaluate', 'activity');
    await page.click(`${V} [data-ac="idea"]`);
    await page.waitForSelector(`${P} [data-ix="make"]`);
    const txt = await page.textContent(P);
    assert(txt.includes('아이디어 수 (2~5)') && !txt.includes('유형 (섞어'), txt.slice(0, 300));
    // 진도표 다음 차시(앞 1차시를 함 → 2/3차시)가 골라져 있음
    assert(await page.isChecked(`${P} [data-mp="lesson"][value="1"]`) && (await page.textContent(`${P} .mk-next`)).includes('다음 차시'), '다음 차시 기본');
  }],
  ['[아이디어 만들기] → 카드 3개(흐름·준비물·살펴볼 것), AI에는 차시만(학생 자료 없음), 최근 아이디어에 남음', async () => {
    await page.click(`${P} [data-ix="make"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .idea-card`).length === 3, P);
    const p = prompts.find(x => x.startsWith('[수업 아이디어]'));
    assert(p.includes('2. 동물의 생활 · 2/3차시 동물을 생김새로 분류하기') && p.includes('3학년') && p.includes('아이디어 3개'), p.slice(0, 400));
    const c1 = await page.textContent(`${P} .idea-card >> nth=0`);
    assert(c1.includes('도입') && c1.includes('5분') && c1.includes('준비물: 동물 사진 카드') && c1.includes('살펴볼 것') && c1.includes('모둠'), c1);
    assert((await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:activity:ideas') || '[]').length)) === 1, '저장');
  }],
  ['[복사]는 아이디어 글, 내려받기 단추가 있음', async () => {
    await page.click(`${P} .idea-card >> nth=1 >> [data-ix="copy"]`);
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip.startsWith('동물 분류 놀이 2 (짝)') && clip.includes('- 전개(25분): 기준 정해 나누기'), clip);
    assert(await page.$(`${P} [data-ix="doc"]`), '내려받기');
  }],
  ['[이 아이디어로 활동지 만들기] → 활동지 만들기 화면에 문항, 보낸 범위 끝에 「수업 활동: …」, 같은 차시', async () => {
    await page.click(`${P} .idea-card >> nth=0 >> [data-ix="toAct"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .mk-item`).length === 1, P);
    const p = prompts.filter(x => x.startsWith('[활동지 만들기]')).pop();
    assert(p.includes('- 2. 동물의 생활 · 2/3차시 동물을 생김새로 분류하기') && p.includes('- 수업 활동: 동물 분류 놀이 1 — 사진 카드를 기준을 정해 나눠요'), p.slice(0, 500));
    assert((await page.textContent(`${P} #mkExtra`)).includes('수업 활동: 동물 분류 놀이 1'), '넘어온 아이디어 줄');
    // 「활동지 만들기」를 목록에서 새로 열면 아이디어 줄은 빠짐
    await page.click(`${P} [data-ac="back"]`);
    await page.click(`${V} [data-ac="make"]`);
    await page.waitForSelector(`${P} [data-mk="make"]`);
    assert(!(await page.$(`${P} #mkExtra`)), '아이디어 줄이 남음');
  }],
  ['최근 수업 아이디어로 다시 열기', async () => {
    await page.click(`${P} [data-ac="back"]`);
    await page.click(`${V} [data-ac="idea"]`);
    await page.waitForSelector(`${P} [data-ix="open"]`);
    await page.click(`${P} [data-ix="open"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .idea-card`).length === 3, P);
  }],
  ['직접 쓴 범위의 교직원 이름은 가려 보내고 아이디어에는 원래 이름', async () => {
    await page.selectOption(`${P} #mkSub`, '__free');
    await page.fill(`${P} #mkSubject`, '과학');
    await page.fill(`${P} #mkFree`, '동물 분류하기 — 김하늘 선생님과 함께');
    await page.click(`${P} [data-ix="make"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .idea-card`).length === 1, P);
    const p = prompts.filter(x => x.startsWith('[수업 아이디어]')).pop();
    assert(!p.includes('김하늘') && p.includes('〔이름1〕'), p.slice(0, 300));
    assert((await page.textContent(`${P} .idea-card`)).includes('김하늘 선생님 추천'), '되돌린 이름');
  }],
  ['AI 키가 없으면 만들지 않고 안내', async () => {
    await page.evaluate(() => { localStorage.removeItem('ssam:engine'); sessionStorage.clear(); });
    await page.reload(); await page.waitForTimeout(300);
    await enter(page, 'evaluate', 'activity');
    await page.click(`${V} [data-ac="idea"]`);
    await page.waitForSelector(`${P} [data-ix="make"]`);
    await page.click(`${P} [data-ix="make"]`);
    await page.waitForSelector(`${P} #ixMsg`).catch(async () => { const h = await page.innerHTML(P); throw new Error('안내 없음: ' + JSON.stringify({ busy: h.includes('ixBusy'), ready: await page.evaluate(async () => (await import('./core/ai.js')).ready()), view: await page.evaluate(() => localStorage.getItem('ssam:engine')) })); });
    assert((await page.textContent(`${P} #ixMsg`)).includes('AI 키가 없어'), await page.textContent(`${P} #ixMsg`));
  }],
  ['390px 폭에서 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click(`${P} [data-ix="open"]`);
    await page.waitForFunction(s => document.querySelectorAll(`${s} .idea-card`).length > 0, P);
    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 1, '넘침 ' + over);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
