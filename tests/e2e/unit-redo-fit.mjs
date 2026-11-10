// 단원평가 결과지 복습 문제 자리(unit-redo.js 잰 값): A4에서 넘치지 않음 — PDF로 저장(인쇄 CSS, 여백 20mm)은 실제로 찍어 쪽 수로
// (한 쪽에 2명이면 2명마다 한 쪽, 번호별로 한 장씩이면 한 명마다 한 쪽 — 쪽 수가 늘면 다음 쪽으로 넘친 것),
// [인쇄] 틀은 인쇄 화면으로 그려 칸 높이로(쪽 안 높이 = A4 - 여백 10mm·12.7mm: 두 칸 합, 한 장씩이면 한 칸이 쪽 안).
// 20문항 평가의 보통 학생(3개 틀림)은 한 쪽에 2명이어도 복습 문제 2개
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const V = 'section[data-menu="evaluate"] .unit-box';
const open1 = async id => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]'); if (await page.locator(`${V} [data-un="back"]`).count()) await page.click(`${V} [data-un="back"]`); await page.click(`${V} [data-un-open="${id}"]`); await page.waitForSelector(`${V} .un-print`, { state: 'attached' }); };
const pagesOf = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
/* [인쇄] 틀: 쪽 안 크기(A4 - 여백)로 인쇄 화면을 그려 칸(.un-ps, 2명이면 반 쪽 이상) 높이를 잼 → 넘친 쪽 [번호들] */
async function printOver(one, mm = 10) {
  const px = v => v * 96 / 25.4, W = page.viewportSize();
  await page.setViewportSize({ width: Math.round(px(210 - 2 * mm)), height: Math.round(px(297 - 2 * mm)) });
  await page.emulateMedia({ media: 'print' });
  const hs = await page.$$eval(`${V} .un-print .un-ps`, els => els.map(e => e.getBoundingClientRect().height));
  const H = px(297 - 2 * mm);
  await page.emulateMedia({ media: null }); await page.setViewportSize(W); // null: page.pdf가 다시 인쇄 CSS로
  const over = [];
  if (one) hs.forEach((h, i) => { if (h > H + 0.5) over.push(i + 1); });
  else for (let i = 0; i < hs.length; i += 2) if (hs[i] + (hs[i + 1] || 0) > H + 0.5) over.push(`${i + 1}·${i + 2}`);
  return over;
}
// PDF로 저장: 결과지 문서를 인쇄 칸(#printDoc)에 넣고 인쇄 CSS(@page A4 여백 20mm)로 찍음
async function pdfPages() {
  await page.evaluate(() => { localStorage.setItem('ssam:export', JSON.stringify({ format: 'pdf' })); window.print = () => {}; document.body.classList.remove('printing-doc'); });
  await page.click(`${V} [data-un="fbHwpx"]`);
  await page.waitForFunction(() => document.body.classList.contains('printing-doc'));
  const n = pagesOf(await page.pdf({ preferCSSPageSize: true }));
  await page.evaluate(() => { document.body.classList.remove('printing-doc'); localStorage.setItem('ssam:export', JSON.stringify({ format: 'hwpx' })); });
  return n;
}
const setOne = async one => { if (await page.isChecked(`${V} [data-one-page]`) !== one) await page[one ? 'check' : 'uncheck'](`${V} [data-one-page]`); };
const counts = () => page.$$eval(`${V} .un-print .un-ps`, els => els.map(e => (e.querySelector('.un-rq') ? e.querySelectorAll('.un-rq p').length : 0)));

await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
await page.click(`${V} [data-un="sample"]`);
// 복습 문제(AI가 만드는 길이): 예시 평가 1회와 20문항 평가(학생 8명)
await page.evaluate(async () => {
  const m = await import('/menus/evaluate/unit/unit-model.js');
  const { redoKind } = await import('/menus/evaluate/unit/unit-redo.js');
  const { flushAll } = await import('/core/store.js');
  const Q = {
    choice: n => ({ kind: 'choice', q: `다음 글에서 가장 중요한 내용으로 알맞은 것은 무엇인가요? (${n})`, choices: ['날씨가 맑다.', '책 읽기 잔치가 열린다.', '도서관이 크다.', '친구가 많다.'], answer: '②', explain: '글 전체가 말하려는 것을 찾아요.' }),
    short: n => ({ kind: 'short', q: `잔치가 열리는 곳은 어디인지 글에서 찾아 쓰세요. (${n})`, choices: [], answer: '마을 도서관', explain: '첫 문장을 다시 읽어 봐요.' }),
    essay: n => ({ kind: 'essay', q: `이 글을 읽고 가고 싶은 곳과 그 까닭을 한 문장으로 쓰세요. (${n})`, choices: [], answer: '(예) 도서관, 책을 많이 읽을 수 있어서', explain: '까닭을 함께 써요.' })
  };
  const redoAll = t => ({ on: true, items: Object.fromEntries(t.key.items.map(it => [it.no, Q[redoKind(it.type)](it.no)])) });
  const s1 = m.getTest('sample-1'); s1.redo = redoAll(s1); m.saveTest(s1);
  const CONTENT = ['글의 내용 파악하기', '중요한 내용 찾기', '낱말의 뜻 알기', '문단의 중심 문장 찾기', '글과 그림 연결하기', '중요한 내용을 간추려 쓰기', '자신의 생각 쓰기', '소수의 덧셈', '분수의 크기 비교', '들이의 단위 알기'];
  const ANS = ['③', '㉯', '마을 도서관', '②, ④', '(1) - ②  (2) - ①', '(예) 마을 도서관에서 책 읽기 잔치가 열린다.', '12.6', '⑤', '민수', '3/4'];
  const items = Array.from({ length: 20 }, (_, i) => { const a = ANS[i % 10]; return { no: i + 1, content: CONTENT[i % 10], domain: '이해', type: a.startsWith('(예)') ? 'essay' : /^[①-⑤㉮-㉱]$/.test(a) ? 'choice' : a.startsWith('(1)') ? 'match' : 'short', answer: a, points: 5, criteria: '', pages: `<국어> ${60 + i * 2}~${61 + i * 2}쪽` }; });
  const cell = (pts, read) => ({ read, pts, ai: pts, ai0: pts, flag: '', why: '', ok: true, manual: false });
  const GOOD = '중요한 내용을 정확히 찾고 낱말의 뜻을 잘 알고 있어요.', CHEER = '틀린 문제를 한 번 더 천천히 읽어 보면 더 잘할 수 있을 거예요!';
  const LONG = '글의 중요한 내용을 찾아 간추리는 힘이 좋아요. 자신의 생각을 까닭과 함께 또박또박 썼어요. 다음에도 이렇게 꼼꼼히 읽어 봐요.';
  const stu = (no, wrong, good = GOOD, cheer = CHEER) => ({ no, skip: false, status: 'done', good, cheer, items: Object.fromEntries(items.map(it => [it.no, cell(wrong.includes(it.no) ? 0 : 5, wrong.includes(it.no) ? ['①', '도서관', '모르겠다', '(1)-①'][it.no % 4] : '정답')])) });
  const t20 = { ...m.newTest({ meta: { subject: '국어', grade: 3, term: 2, unitNo: 3, unitName: '자세히 읽어요', round: 1, date: '2026-11-03' }, key: { domains: ['이해'], items } }), id: 't20', done: true };
  t20.students = [stu(1, [3, 7, 12]), stu(2, [2, 6, 11, 16]), stu(3, [1, 5, 9, 14, 18]), stu(4, [4]), stu(5, [2, 6, 11, 16, 17, 19, 20], LONG, LONG), stu(6, []), stu(7, [6, 16], LONG, LONG), stu(8, [8, 13, 15])];
  t20.redo = redoAll(t20);
  m.saveTest(t20);
  flushAll();
});
await page.reload(); await page.waitForTimeout(400);

await run('unit-redo-fit', [
  ['20문항 평가 · 한 쪽에 2명: 보통 학생(3개 틀림)은 복습 문제 2개, 인쇄 틀·PDF 모두 2명마다 한 쪽(4쪽)', async () => {
    await open1('t20');
    await setOne(false);
    const who = await page.textContent(`${V} [data-redo-who="1"]`), c = await counts();
    assert(who.includes('3번 · 7번') && !who.includes('12번'), who);
    // 인쇄 틀 칸마다 복습 문제 줄 수: 1번은 「다시 풀어 보기」 + 단답 두 문제(물음·답 칸씩)
    assert(c[0] === 5 && c.filter(Boolean).length >= 3, '복습 문제 줄: ' + c.join(','));
    for (const mm of [10, 12.7]) assert(!(await printOver(false, mm)).length, `인쇄 틀(여백 ${mm}mm) 넘친 쪽: ` + await printOver(false, mm));
    { const n = await pdfPages(); assert(n === 4, 'PDF 쪽 수: ' + n); }
  }],
  ['20문항 평가 · 번호별로 한 장씩: 한 명마다 한 쪽(8쪽), 보통 학생은 3개', async () => {
    await setOne(true);
    assert((await page.textContent(`${V} [data-redo-who="1"]`)).includes('3번 · 7번 · 12번'), await page.textContent(`${V} [data-redo-who="1"]`));
    for (const mm of [10, 12.7]) assert(!(await printOver(true, mm)).length, `인쇄 틀(여백 ${mm}mm) 넘친 쪽: ` + await printOver(true, mm));
    { const n = await pdfPages(); assert(n === 8, 'PDF 쪽 수: ' + n); }
    await setOne(false);
  }],
  ['예시 평가(10문항, 6명): 한 쪽에 2명 3쪽 · 번호별로 한 장씩 6쪽, 넘치지 않음', async () => {
    await open1('sample-1');
    await setOne(false);
    assert((await counts()).some(Boolean), '복습 문제가 없음');
    for (const mm of [10, 12.7]) assert(!(await printOver(false, mm)).length, `인쇄 틀 2명/쪽(여백 ${mm}mm): ` + await printOver(false, mm));
    { const n = await pdfPages(); assert(n === 3, 'PDF 2명/쪽: ' + n); }
    await setOne(true);
    for (const mm of [10, 12.7]) assert(!(await printOver(true, mm)).length, `인쇄 틀 1명/쪽(여백 ${mm}mm): ` + await printOver(true, mm));
    { const n = await pdfPages(); assert(n === 6, 'PDF 1명/쪽: ' + n); }
    await setOne(false);
  }],
  ['[인쇄] 틀 쪽 수: 한 쪽에 2명 8명 → 4쪽, 번호별로 한 장씩 → 8쪽 (끝에 빈 쪽 없음)', async () => {
    await open1('t20');
    // [인쇄]를 누르면 인쇄하는 동안 body에 un-printing(결과지만 자리를 차지) — 끝나면 뺌
    const during = await page.evaluate(sel => { const real = window.print; let on = null; window.print = () => { on = document.body.classList.contains('un-printing'); }; document.querySelector(sel).click(); window.print = real; return { on, after: document.body.classList.contains('un-printing') }; }, `${V} [data-un="fbPrint"]`);
    assert(during.on === true && during.after === false, '인쇄하는 동안만 un-printing: ' + JSON.stringify(during));
    const printPages = async () => { await page.evaluate(() => document.body.classList.add('un-printing')); const n = pagesOf(await page.pdf({ format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } })); await page.evaluate(() => document.body.classList.remove('un-printing')); return n; };
    await setOne(false);
    { const n = await printPages(); assert(n === 4, '한 쪽에 2명: ' + n + '쪽'); }
    await setOne(true);
    { const n = await printPages(); assert(n === 8, '한 장씩: ' + n + '쪽'); }
    await setOne(false);
    await open1('sample-1');
  }],
  ['넘침을 알아챔(시험 자체 확인): 한 학생 칸에 글을 늘리면 인쇄 틀은 그 쪽이, PDF는 쪽 수가 늘어남', async () => {
    await page.evaluate(sel => { const p = document.createElement('p'); p.textContent = '가'.repeat(2400); document.querySelector(sel).append(p); }, `${V} .un-print .un-ps:nth-child(1)`);
    assert((await printOver(false)).join() === '1·2', '인쇄 틀: ' + await printOver(false));
    await page.evaluate(async () => {
      const { exportDoc } = await import('/core/doc-export.js'); window.print = () => {};
      await exportDoc({ title: '', blocks: [{ type: 'p', text: '가'.repeat(2400) }, { type: 'break' }, { type: 'p', text: '나' }] }, '시험', 'pdf');
    });
    await page.waitForFunction(() => document.body.classList.contains('printing-doc'));
    assert(pagesOf(await page.pdf({ preferCSSPageSize: true })) === 3, 'PDF: 한 쪽을 넘는 글이 2쪽이 되지 않음');
    await page.evaluate(() => document.body.classList.remove('printing-doc'));
    await open1('sample-1');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
