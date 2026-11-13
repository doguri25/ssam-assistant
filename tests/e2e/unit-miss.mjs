// 단원평가 4단계 「틀린 까닭」(스펙 2026-11-13-miss-tour-check §1): 고른 답·빈 답은 AI 없이 묶음, [틀린 까닭 묶기] AI 요청엔 문항·정답·틀린 답 글만(임시 번호 — 번호·이름 없음),
// 5분 활동 고치기(저장·다시 열어도), 복사·한글 파일, 다시 채점하면 「채점이 바뀌었어요 · 다시 묶기」(다시 묶어도 고친 활동은 남음), AI 키 없이, 390px
import { readFileSync } from 'node:fs';
import { open, enter, run, assert, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
/* 가짜 AI: 문항마다 앱 묶음(g)엔 짐작·활동, 임시 번호(a)는 모두 한 묶음 「까닭 n」 */
const answer = prompt => {
  const items = [];
  for (const sec of prompt.split(/\n(?=\[문항 \d+\])/).slice(1)) {
    const no = Number(/^\[문항 (\d+)\]/.exec(sec)[1]);
    const gs = [...sec.matchAll(/^- (g\d+):/gm)].map(m => m[1]), as = [...sec.matchAll(/^- (a\d+)/gm)].map(m => m[1]);
    items.push({ no, groups: [...gs.map(g => ({ g, why: `짐작 ${no}`, act: `활동 ${g}` })), ...(as.length ? [{ ids: as, why: `까닭 ${no}`, act: `까닭 활동 ${no}` }] : [])] });
  }
  return JSON.stringify({ items });
};
await mockClaude(page, ({ prompt }) => { prompts.push(prompt); return prompt.startsWith('[단원평가 틀린 까닭]') ? answer(prompt) : '{}'; });

const V = 'section[data-menu="evaluate"] .unit-box', M = `${V} .un-miss`;
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const TITLE = '3학년 국어 2단원 중요한 내용을 적어요 (1회) (예시)';
const itemText = no => page.textContent(`${M} [data-miss-it="${no}"]`);
async function open1(p, id) {
  await enter(p, 'evaluate', 'unit');
  if (await p.locator(`${V} [data-un="back"]`).count()) await p.click(`${V} [data-un="back"]`);
  await p.click(`${V} [data-un-open="${id}"]`);
  await p.waitForSelector(`${V} .un-miss`);
}
await page.goto(url);
await page.waitForTimeout(400);
await enter(page, 'evaluate', 'unit');
await page.click(`${V} [data-un="sample"]`);
// 3번 학생의 4번(사회를 보는 친구 이름) 답을 지어낸 이름으로 — AI로 가지 않아야 함
await page.evaluate(() => { const k = 'ssam:unit:t:sample-1', x = JSON.parse(localStorage.getItem(k)); x.students[2].items[4].read = '김하늘'; localStorage.setItem(k, JSON.stringify(x)); });
await page.reload(); await page.waitForTimeout(500);
await open1(page, 'sample-1');

await run('unit-miss', [
  ['4단계 「틀린 까닭」 카드: 고른 답·빈 답은 AI 없이 묶음, 단답·서술형은 아직 묶지 않음, 결과지 카드 앞', async () => {
    assert((await page.textContent(`${V} .steps [aria-current="step"]`)).includes('피드백'), '4단계가 아님');
    const i2 = await itemText(2);
    assert(i2.includes('2번 · 중요한 내용 찾기 · 틀린 학생 2명') && i2.includes('①을 고름 · 1명 · 3번') && i2.includes('②를 고름 · 1명 · 5번'), i2);
    assert((await itemText(6)).includes('(1)-①, (2)-②로 이음 · 1명 · 3번'), await itemText(6));
    const i4 = await itemText(4);
    assert(i4.includes('답을 쓰지 않음 · 1명 · 5번') && i4.includes('아직 묶지 않음 · 1명 · 3번'), i4);
    assert((await page.textContent(M)).includes('AI에는 문항·정답·틀린 답 글만 보내요. 번호와 이름은 보내지 않아요.'), '안내 글');
    assert((await page.textContent(`${V} .yp-card .ai-note`)).includes('학생이 쓴 답과 이름은 보내지 않아요'), '피드백 안내는 그대로');
    assert(await page.locator(`${M} .ai-note`).count() === 1 && !(await page.getAttribute(`${M} .ai-note`, 'open')), '「AI로 가는 것」은 접혀 있음');
    assert(await page.evaluate(() => { const m = document.querySelector('.un-miss'), f = document.querySelector('.un-fbs'); return !!(m.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING); }), '결과지 카드 앞이 아님');
    assert(prompts.length === 0, '저절로 AI를 부름');
  }],
  ['[틀린 까닭 묶기]: AI 요청엔 문항·정답·틀린 답 글만(임시 번호), 번호·이름 없음 → 학생 번호로 다시 맞춤', async () => {
    await page.click(`${M} [data-un="missAI"]`);
    await page.waitForFunction(() => /까닭 9/.test(document.querySelector('.un-miss [data-miss-it="9"]').textContent));
    const p = prompts.at(-1);
    assert(p.startsWith('[단원평가 틀린 까닭]') && p.includes('[문항 9]') && p.includes('중요한 내용 찾기') && p.includes('정답 ③'), p.slice(0, 300));
    assert(p.includes('- a1') && p.includes('- g1: ') && p.includes('도서관에서 잔치를 한다.'), '임시 번호·틀린 답 글');
    assert(!p.includes('김하늘') && p.includes('○○○'), '이름이 들어감');
    assert(!/\d\s*번/.test(p), '학생 번호(「n번」)가 들어감: ' + (/.{20}\d\s*번.{10}/.exec(p) || [''])[0]);
    assert(!p.includes('(예시)') && !p.includes('잘한 점'), '다른 글');
    const i9 = await itemText(9);
    assert(i9.includes('까닭 9 · 4명 · 2·3·4·5번'), i9);
    assert(await page.inputValue(`${M} textarea[data-miss="9-0"]`) === '까닭 활동 9', '활동 칸');
    assert((await itemText(2)).includes('짐작: 짐작 2'), '고른 답 묶음의 짐작');
    const m = (await T('sample-1')).miss;
    assert(m && m.at > 0, '저장 안 됨');
    const g = m.items[9].groups[0];
    assert(g.why === '까닭 9' && g.nos.join() === '2,3,4,5' && g.src === 'ai' && g.act === '까닭 활동 9', JSON.stringify(g));
    assert(m.items[4].groups.some(x => x.why === '답을 쓰지 않음' && x.nos.join() === '5'), JSON.stringify(m.items[4]));
    await page.waitForFunction(() => /10문항의 틀린 까닭을 묶고/.test(document.querySelector('#toast').textContent));
    await page.click(`${M} [data-un="missAI"]`);
    await page.waitForFunction(() => /모두 묶었어요/.test(document.querySelector('#toast').textContent));
    assert(prompts.filter(x => x.startsWith('[단원평가 틀린 까닭]')).length === 1, '다 묶었는데 다시 보냄');
  }],
  ['5분 활동 고치기: 저장(src manual), 「고친 활동」 표시, 다시 열어도 그대로', async () => {
    const sel = `${M} textarea[data-miss="2-1"]`;
    await page.fill(sel, '보기 ②와 ③을 함께 읽어요');
    await page.dispatchEvent(sel, 'change');
    const g = (await T('sample-1')).miss.items[2].groups[1];
    assert(g.why === '②를 고름' && g.act === '보기 ②와 ③을 함께 읽어요' && g.src === 'manual', JSON.stringify(g));
    assert((await page.textContent(`${M} [data-miss-g="2-1"]`)).includes('고친 활동'), '표시');
    await page.reload(); await page.waitForTimeout(400);
    await open1(page, 'sample-1');
    assert(await page.inputValue(sel) === '보기 ②와 ③을 함께 읽어요', '다시 연 뒤');
  }],
  ['복사: 문항마다 「n번 · 내용 · 틀린 학생 n명」, 줄마다 까닭 · n명 · 번호 · 활동', async () => {
    await page.click(`${M} [data-un="missCopy"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    const one = s => s.replace(/\n/g, ' ⏎ ');
    assert(txt.startsWith(`[${TITLE}] 틀린 까닭`), one(txt.slice(0, 80)));
    assert(txt.includes('2번 · 중요한 내용 찾기 · 틀린 학생 2명') && txt.includes('- ②를 고름 (짐작: 짐작 2) · 1명 · 5번 · 활동: 보기 ②와 ③을 함께 읽어요'), one(txt));
    assert(txt.includes('- 까닭 9 · 4명 · 2·3·4·5번 · 활동: 까닭 활동 9') && txt.includes('- 답을 쓰지 않음 (짐작: 짐작 4) · 1명 · 5번 · 활동: 활동 g'), one(txt));
  }],
  ['한글로 내려받기: 문항마다 머리 줄과 표(까닭 · 인원 · 번호 · 5분 보충 활동)', async () => {
    assert((await page.textContent(`${M} [data-un="missDoc"]`)).includes('틀린 까닭 · 한글로 내려받기'), '단추 이름');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${M} [data-un="missDoc"]`)]);
    assert(dl.suggestedFilename() === `${TITLE} 틀린 까닭.hwpx`, dl.suggestedFilename());
    const sec = new TextDecoder().decode((await unzip(new Uint8Array(readFileSync(await dl.path())))).get('Contents/section0.xml'));
    assert(sec.includes('5분 보충 활동') && sec.includes('보기 ②와 ③을 함께 읽어요') && sec.includes('2·3·4·5번') && sec.includes('9번 · 중요한 내용을 간추려 쓰기'), '내용');
  }],
  ['다시 채점하면 그 문항만 「채점이 바뀌었어요 · 다시 묶기」, 다시 묶으면 그 문항만 AI로, 고친 활동은 남음', async () => {
    await page.click(`${V} [data-step="3"]`);
    await page.click(`${V} .un-ih[data-item="2"]`);
    await page.waitForSelector('#sheetRoot [data-ipts="3"]');
    await page.fill('#sheetRoot [data-ipts="3"]', '10');
    await page.dispatchEvent('#sheetRoot [data-ipts="3"]', 'change');
    await page.click('#sheetRoot [data-close]');
    await page.click(`${V} [data-step="4"]`);
    await page.waitForSelector(`${M} [data-miss-it="2"] .un-miss-stale`);
    assert((await page.textContent(`${M} [data-miss-it="2"] .un-miss-stale`)).includes('채점이 바뀌었어요 · 다시 묶기'), '표시 글');
    assert(await page.locator(`${M} .un-miss-stale`).count() === 1, '다른 문항도 낡음');
    const n = prompts.length;
    await page.click(`${M} [data-miss-it="2"] [data-un="missRe"]`);
    await page.waitForFunction(() => !document.querySelector('.un-miss [data-miss-it="2"] .un-miss-stale'));
    const p = prompts.at(-1);
    assert(prompts.length === n + 1 && p.includes('[문항 2]') && !p.includes('[문항 9]'), '그 문항만 보냄');
    const i2 = await itemText(2);
    assert(i2.includes('틀린 학생 1명') && !i2.includes('①을 고름') && i2.includes('②를 고름 · 1명 · 5번'), i2);
    assert(await page.inputValue(`${M} textarea[data-miss="2-0"]`) === '보기 ②와 ③을 함께 읽어요', '고친 활동이 사라짐');
    const g = (await T('sample-1')).miss.items[2].groups;
    assert(g.length === 1 && g[0].src === 'manual', JSON.stringify(g));
  }],
  ['좁은 화면(390px): 가로 스크롤 없음, 단추·활동 칸 44px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      over: document.documentElement.scrollWidth - window.innerWidth,
      small: [...document.querySelectorAll('.un-miss .btn, .un-miss textarea, .un-miss-ed > summary')].filter(e => e.getBoundingClientRect().height < 44 && e.offsetParent).map(e => e.textContent.trim() || e.dataset.miss)
    }));
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(r.over <= 0, '가로 스크롤 ' + r.over);
    assert(!r.small.length, '44px보다 작음: ' + r.small.join(', '));
  }],
  ['AI 키가 없으면: 앱 묶음만 보이고 짧은 안내, [틀린 까닭 묶기]는 키 안내, 활동은 직접 씀', async () => {
    const t2 = await open({ width: 390, height: 844 });
    try {
      const p2 = t2.page;
      let called = 0;
      await mockClaude(p2, () => { called++; return '{}'; });
      await p2.goto(t2.url); await p2.waitForTimeout(400);
      await enter(p2, 'evaluate', 'unit');
      await p2.click(`${V} [data-un="sample"]`);
      await open1(p2, 'sample-1');
      assert((await p2.textContent(`${M} .un-miss-key`)).includes('AI 키가 없어'), '안내');
      assert((await p2.textContent(`${M} [data-miss-it="9"]`)).includes('AI 키를 넣으면 AI가 까닭으로 묶어요'), '아직 묶지 않음 안내');
      await p2.click(`${M} [data-un="missAI"]`);
      await p2.waitForFunction(() => /설정 › AI에서 키를 넣어 주세요/.test(document.querySelector('#toast').textContent));
      await p2.fill(`${M} textarea[data-miss="2-0"]`, '① 보기를 다시 읽어요');
      await p2.dispatchEvent(`${M} textarea[data-miss="2-0"]`, 'change');
      const m = await p2.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:t:sample-1')).miss);
      assert(m.items[2].groups[0].act === '① 보기를 다시 읽어요' && m.items[2].groups[0].src === 'manual', JSON.stringify(m.items[2]));
      // AI 없이 [다시 묶기]: 앱 묶음만 지금 채점으로(3번이 맞게 됨)
      await p2.evaluate(() => { const k = 'ssam:unit:t:sample-1', x = JSON.parse(localStorage.getItem(k)); x.students[2].items[2].pts = 10; localStorage.setItem(k, JSON.stringify(x)); });
      await open1(p2, 'sample-1');
      await p2.click(`${M} [data-miss-it="2"] [data-un="missRe"]`);
      await p2.waitForFunction(() => /고른 답·빈 답으로 다시 묶었어요/.test(document.querySelector('#toast').textContent));
      await p2.waitForFunction(() => !document.querySelector('.un-miss [data-miss-it="2"] .un-miss-stale')); // 다시 그리기는 단추를 뗀 뒤
      const i2 = await p2.textContent(`${M} [data-miss-it="2"]`);
      assert(!i2.includes('채점이 바뀌었어요') && !i2.includes('①을 고름') && i2.includes('②를 고름 · 1명 · 5번'), i2.replace(/\s+/g, ' ').trim());
      assert(called === 0, 'AI를 부름');
      assert(await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '가로 스크롤');
      assert(t2.errors.length === 0, t2.errors.join(' | '));
    } finally { await t2.close(); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
