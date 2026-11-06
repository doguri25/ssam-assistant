// 단원평가 4단계 결과지 맞춤 복습 문제 (스펙 2026-11-06 A): [복습 문제 만들기](AI 한 번, 문항 정보만) → 「결과지에 복습 문제 넣기」 켜짐,
// 학생마다 틀린 문항을 배점 큰 순으로 칸에 남는 자리만큼 최대 3개(한 쪽 2명·번호별 한 장), 한마디 아래 「다시 풀어 보기」·칸 맨 아래 작은 정답,
// 인쇄·한글·워드·PDF·복사가 같게, 고치기 칸, 끄기, AI 도중 다른 평가로 가도 결과는 시작한 평가에, 좁은 화면
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
let slow = 0;
const prompts = [];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
// 문항 줄(「- 번호 | … | 만들 꼴」)마다 복습 문제: 고르기는 보기 4개·정답 「2」(②로 읽음), 단답·서술형은 「n번 답」
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow) await new Promise(r => setTimeout(r, slow));
  const items = [...prompt.matchAll(/^- (\d+) \|.*\| ([^|\n]+)$/gm)].map(m => {
    const no = Number(m[1]);
    return m[2].startsWith('고르기') ? { no, q: `${no}번 복습 물음`, choices: ['가', '나', '다', '라'], answer: '2', explain: `${no}번 풀이` } : { no, q: `${no}번 복습 물음`, answer: `${no}번 답`, explain: '' };
  });
  return JSON.stringify({ items });
});
const V = 'section[data-menu="evaluate"] .unit-box';
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const redos = () => prompts.filter(p => p.startsWith('[단원평가 복습 문제]'));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const open1 = async id => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]'); if (await page.locator(`${V} [data-un="back"]`).count()) await page.click(`${V} [data-un="back"]`); await page.click(`${V} [data-un-open="${id}"]`); };
const ps = n => `${V} .un-print .un-ps:nth-child(${n})`;
const psText = async n => (await page.$eval(ps(n), el => [...el.querySelectorAll('h2, p, th, td')].map(x => x.textContent).join(' '))).replace(/\s+/g, ' ');
const download = async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-un="fbHwpx"]`)]);
  return unzip(new Uint8Array(readFileSync(await dl.path())));
};
const dec = u => new TextDecoder().decode(u);
await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
await page.click(`${V} [data-un="sample"]`);
await open1('sample-1');

await run('unit-review', [
  ['처음엔 [복습 문제 만들기]만, 「결과지에 복습 문제 넣기」는 꺼져 있고 결과지에 없음', async () => {
    assert((await page.textContent(`${V} [data-un="redoAI"]`)).includes('복습 문제 만들기'), '단추');
    assert(await page.isDisabled(`${V} [data-redo-on]`) && !(await page.isChecked(`${V} [data-redo-on]`)), '스위치');
    assert(await page.locator(`${V} .un-print .un-rq`).count() === 0, '결과지에 들어감');
  }],
  ['[복습 문제 만들기]: AI 한 번(업무 「피드백·알림」), 문항 번호·내용·영역·유형·정답·쪽만 — 학생 답·잘한 점·채점 기준 없음, 만들면 켜짐', async () => {
    await page.click(`${V} [data-un="redoAI"]`);
    await until(async () => { const x = await T('sample-1'); return !!(x.redo && x.redo.on); });
    assert(redos().length === 1, '부른 수 ' + redos().length);
    const p = redos()[0];
    assert(p.includes('- 9 | 중요한 내용을 간추려 쓰기 | 이해 | 서술형 | (예) 마을 도서관에서 책 읽기 잔치가 열린다. 등 | <국어> 88~95쪽 | 서술형'), p.slice(0, 600));
    for (const bad of ['도서관에서 잔치를 한다.', '사회를 보는 친구를 잘 찾았어요.', '예시 답안과 비슷한 내용으로 썼으면 정답 처리', '(예시)']) assert(!p.includes(bad), bad);
    const x = await T('sample-1');
    assert(Object.keys(x.redo.items).length === 10 && x.redo.items[3].answer === '②' && x.redo.items[3].choices.length === 4, JSON.stringify(x.redo.items[3]));
    await page.waitForFunction(() => document.querySelector('.unit-box [data-redo-on]') && document.querySelector('.unit-box [data-redo-on]').checked);
    assert((await page.textContent(`${V} #unRedoFit`)).includes('결과지에 넣은 학생'), await page.textContent(`${V} #unRedoFit`));
  }],
  ['한 쪽에 2명: 남는 자리만큼만(4번은 배점 큰 9번 하나), 한마디 아래 「다시 풀어 보기」, 정답은 칸 맨 아래 작은 글씨, 다 맞힌 1번은 없음', async () => {
    assert(!(await page.isChecked(`${V} [data-one-page]`)), '한 장씩이 켜져 있음');
    const s4 = await psText(4);
    assert(/한마디: .*다시 풀어 보기 1\) 9번 복습 물음 답: _+ 정답: 1\) 9번 답$/.test(s4.trim()), s4);
    assert(await page.locator(`${ps(1)} .un-rq`).count() === 0, '다 맞힌 학생');
    assert((await page.textContent(`${V} [data-redo-who="4"]`)).includes('9번') && (await page.textContent(`${V} [data-redo-who="2"]`)).includes('자리가 모자라'), '학생 카드 줄');
    assert((await page.textContent(`${V} #unRedoFit`)).includes('번호별로 한 장씩'), '한 장씩 안내');
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(sel => {
      const sec = document.querySelector(sel), a = sec.querySelector('.un-ans'), p = sec.querySelector('p');
      return { a: parseFloat(getComputedStyle(a).fontSize), p: parseFloat(getComputedStyle(p).fontSize), last: sec.lastElementChild === a, gap: sec.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom };
    }, ps(4));
    await page.emulateMedia({ media: 'screen' });
    assert(m.a < m.p && m.last && m.gap < 30, JSON.stringify(m));
  }],
  ['번호별로 한 장씩: 자리가 넓어 학생마다 최대 3개(배점 큰 순, 같으면 번호순), 끄면 다시 반 쪽', async () => {
    await page.check(`${V} [data-one-page]`);
    const s2 = await psText(2);
    assert(s2.includes('1) 9번 복습 물음') && s2.includes('2) 10번 복습 물음') && s2.includes('3) 3번 복습 물음 ① 가 ② 나 ③ 다 ④ 라') && !s2.includes('4)'), s2);
    assert(s2.includes('정답: 1) 9번 답 2) 10번 답 3) ② (3번 풀이)'), s2);
    assert((await page.textContent(`${V} [data-redo-who="2"]`)).includes('9번 · 10번 · 3번'), await page.textContent(`${V} [data-redo-who="2"]`));
    assert((await page.textContent(`${V} #unRedoFit`)).trim() === '결과지에 넣은 학생 5명', await page.textContent(`${V} #unRedoFit`));
    await page.uncheck(`${V} [data-one-page]`);
    assert(!(await psText(2)).includes('다시 풀어 보기'), '반 쪽으로 돌아오지 않음');
    await page.check(`${V} [data-one-page]`);
  }],
  ['한글 파일: 인쇄 틀과 같은 복습 문제, 정답은 작은 글씨(8pt 글자 모양)', async () => {
    const m = await download();
    const sec = dec(m.get('Contents/section0.xml')), head = dec(m.get('Contents/header.xml'));
    assert(sec.includes('<hp:run charPrIDRef="1"><hp:t>다시 풀어 보기</hp:t>') && sec.includes('3) 3번 복습 물음'), '복습 문제');
    assert(sec.includes('<hp:run charPrIDRef="4"><hp:t>정답: 1) 9번 답   2) 10번 답   3) ② (3번 풀이)</hp:t>'), '작은 정답');
    assert(head.includes('<hh:charPr id="4" height="800"'), '8pt');
    assert((sec.match(/pageBreak="1"/g) || []).length === 5, '쪽 나누기');
  }],
  ['워드·PDF도 같게(작은 글씨 정답)', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:export', JSON.stringify({ format: 'docx' })));
    const w = dec((await download()).get('word/document.xml'));
    assert(w.includes('다시 풀어 보기') && /<w:sz w:val="16"\/><w:szCs w:val="16"\/><\/w:rPr><w:t xml:space="preserve">정답: 1\) 9번 답/.test(w), '워드');
    await page.evaluate(() => { localStorage.setItem('ssam:export', JSON.stringify({ format: 'pdf' })); window.__printed = null; window.print = () => { window.__printed = document.getElementById('printDoc').innerHTML; }; });
    await page.click(`${V} [data-un="fbHwpx"]`);
    await page.waitForFunction(() => window.__printed);
    const h = await page.evaluate(() => window.__printed);
    assert(h.includes('<p><b>다시 풀어 보기</b></p>') && h.includes('<p class="sm">정답: 1) 9번 답'), h.slice(0, 300));
    await page.evaluate(() => localStorage.setItem('ssam:export', JSON.stringify({ format: 'hwpx' })));
  }],
  ['복사·모두 복사: 결과지와 같은 복습 문제·정답', async () => {
    await page.click(`${V} [data-un="fbCopy"][data-no="2"]`);
    await page.waitForTimeout(150);
    const txt = await page.evaluate(() => navigator.clipboard.readText());
    assert(txt.includes('\n다시 풀어 보기\n1) 9번 복습 물음\n2) 10번 복습 물음\n3) 3번 복습 물음\n    ① 가   ② 나   ③ 다   ④ 라\n정답: 1) 9번 답   2) 10번 답   3) ② (3번 풀이)'), txt);
    await page.click(`${V} [data-un="fbCopyAll"]`);
    await page.waitForTimeout(150);
    const all = await page.evaluate(() => navigator.clipboard.readText());
    assert((all.match(/다시 풀어 보기/g) || []).length === 5 && all.split('\n\n').length === 6, all.slice(0, 200));
  }],
  ['고치기 칸: 물음을 고치면 저장·결과지에 바로, 비우면 그 문항은 빼고 다음 문항, [복습 문제 만들기]는 빈 문항만 다시', async () => {
    await page.click(`${V} .un-redo-ed > summary`);
    await page.fill(`${V} textarea[data-redo="9-q"]`, '고친 물음');
    await page.dispatchEvent(`${V} textarea[data-redo="9-q"]`, 'change');
    assert((await T('sample-1')).redo.items[9].q === '고친 물음', '저장');
    assert((await psText(2)).includes('1) 고친 물음'), '결과지');
    await page.fill(`${V} textarea[data-redo="9-q"]`, '');
    await page.dispatchEvent(`${V} textarea[data-redo="9-q"]`, 'change');
    const s2 = await psText(2);
    assert(s2.includes('1) 10번 복습 물음') && s2.includes('2) 3번 복습 물음') && s2.includes('3) 5번 복습 물음') && !s2.includes('9번 복습'), s2);
    await page.fill(`${V} input[data-redo="3-c1"]`, '나나');
    await page.dispatchEvent(`${V} input[data-redo="3-c1"]`, 'change');
    assert((await T('sample-1')).redo.items[3].choices.join(',') === '가,나나,다,라', '보기');
    const n = redos().length;
    await page.click(`${V} [data-un="redoAI"]`);
    await until(async () => (await T('sample-1')).redo.items[9].q === '9번 복습 물음');
    const p = redos().at(-1);
    assert(redos().length === n + 1 && p.includes('- 9 |') && !p.includes('- 10 |'), p.slice(-400));
    assert(await page.locator(`${V} .un-redo-ed[open]`).count() === 1, '고치기 칸이 접힘');
  }],
  ['모두 만들었으면 AI를 다시 부르지 않음', async () => {
    const n = redos().length;
    await page.click(`${V} [data-un="redoAI"]`);
    await page.waitForTimeout(300);
    assert(redos().length === n && (await page.textContent('#toast')).includes('모두 만들었어요'), await page.textContent('#toast'));
  }],
  ['「결과지에 복습 문제 넣기」를 끄면 인쇄·한글 파일·복사에서 빠짐, 켜면 다시', async () => {
    await page.uncheck(`${V} [data-redo-on]`);
    assert((await T('sample-1')).redo.on === false, '저장');
    assert(await page.locator(`${V} .un-print .un-rq`).count() === 0, '인쇄 틀');
    assert(!dec((await download()).get('Contents/section0.xml')).includes('다시 풀어 보기'), '한글 파일');
    assert((await page.textContent(`${V} #unRedoFit`)).includes('넣지 않아요') && (await page.textContent(`${V} [data-redo-who="2"]`)).trim() === '', '안내');
    await page.check(`${V} [data-redo-on]`);
    assert(await page.locator(`${V} .un-print .un-rq`).count() === 5, '다시 켬');
  }],
  ['AI 도중 다른 평가로 가도 결과는 시작한 평가에', async () => {
    await open1('sample-2');
    slow = 900;
    await page.click(`${V} [data-un="redoAI"]`);
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    const before = JSON.stringify((await T('sample-1')).redo);
    await until(async () => { const x = await T('sample-2'); return !!(x.redo && x.redo.on); }, 5000);
    slow = 0;
    assert(JSON.stringify((await T('sample-1')).redo) === before, 'sample-1이 바뀜');
  }],
  ['좁은 화면(360px) 가로 스크롤 없음(고치기 칸 펼침)', async () => {
    if (!(await page.locator(`${V} .un-redo-ed[open]`).count())) await page.click(`${V} .un-redo-ed > summary`);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
