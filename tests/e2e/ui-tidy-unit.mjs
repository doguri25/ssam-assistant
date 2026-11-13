// 화면 정리(스펙 2026-11-14-ui-tidy) — 평가 › 단원평가·활동지·기재 점검:
// §3 「평가 한 바퀴」 띠는 접힌 한 줄(「평가 한 바퀴 n/6 · 다음: …」·다 되면 「6/6 ✓」, aria-expanded, 키보드, 이 실행 동안 펼친 채로),
// 휴대폰(390×844)에서 연 평가의 첫 화면에 4단계 첫 카드가 보이고 단계 탭은 한 줄로 밀어 넘김,
// §4 머리말 설명은 처음 3번만 펼침(ssam:ui:intro)·「AI로 가는 것」은 접혀 있고 펼치면 무엇을 보내는지, §2 자주 안 바꾸는 설정은 요약 한 줄 + [바꾸기],
// 390px에서 가로로 넘치지 않음, 페이지 오류 없음. 학생·교과 글은 모두 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const E = 'section[data-menu="evaluate"]', V = `${E} .unit-box`, A = `${E} .act-box`, C = `${E} .chk-box`;
const B = `${V} #unFlow`, SUM = `${B} .un-flow-sum`;
const sumText = () => page.textContent(`${SUM} .un-flow-sum-t`).then(s => s.replace(/\s+/g, ' ').trim());
const expanded = () => page.getAttribute(SUM, 'aria-expanded');
const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
/* 활동지 단계 탭 누르기(지금 단계면 그대로) */
const goA = async st => { const b = `${A} .steps [data-step="${st}"]`; if (await page.locator(b).count()) await page.click(b); };
const isOpen = sel => page.evaluate(s => { const d = document.querySelector(s); return d ? d.open : null; }, sel);
/* 단계 탭: 한 줄인지(모든 칸의 위가 같음), 옆으로 밀리는지, 지금 단계가 탭 줄 안에 보이는지, 가장 낮은 칸 높이 */
const stepsInfo = root => page.evaluate(r => {
  const ol = document.querySelector(`${r} .steps`), lis = [...ol.querySelectorAll('li')], o = ol.getBoundingClientRect(), c = ol.querySelector('li.cur').getBoundingClientRect();
  return { rows: new Set(lis.map(l => Math.round(l.getBoundingClientRect().top))).size, scrolls: ol.scrollWidth > ol.clientWidth, curIn: c.left >= o.left - 1 && c.right <= o.right + 1,
    minH: Math.min(...lis.map(l => l.querySelector('.steps-in').getBoundingClientRect().height)), h: Math.round(o.height) };
}, root);

await page.goto(url);
await page.waitForTimeout(400);
// 다 맞힌 평가(채점을 마침): 여섯 마디가 모두 다 됨 → 「평가 한 바퀴 6/6 ✓」
await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const items = [[1, '수와 연산', 'choice', '③', 50], [2, '도형', 'short', '삼각형', 50]];
  const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 5, unitName: '들이와 무게', round: 1, date: '2026-10-28' }, key: { domains: ['수와 연산', '도형'], items: items.map(([no, domain, type, answer, points]) => ({ no, content: `${domain} 문항`, domain, type, answer, points, criteria: '', pages: '' })) } });
  x.id = 'u-all'; x.done = true; x.createdAt = Date.parse('2026-10-28');
  x.students = [1, 2, 3].map(no => ({ no, skip: false, status: 'done', good: '', cheer: '', items: { 1: { read: '③', pts: 50, ai: 50, ai0: 50, flag: '', why: '', ok: true, manual: false }, 2: { read: '삼각형', pts: 50, ai: 50, ai0: 50, flag: '', why: '', ok: true, manual: false } } }));
  m.saveTest(x);
  // 기재 점검이 찾을 단원평가 평어(부정 표현) — 「AI로 가는 것」은 고칠 글이 있을 때
  m.savePyeongeo('수학', { off: [], students: { 3: { level: 'mid', text: '나눗셈의 뜻을 알지 못함.', manual: false } } });
});
await enter(page, 'evaluate', 'unit');
await page.click(`${V} [data-un="sample"]`);
await page.click(`${V} [data-un-open="sample-1"]`);
await page.waitForSelector(SUM);

await run('ui-tidy-unit', [
  ['띠는 접힌 한 줄 단추: 「평가 한 바퀴 (다 된 마디 수)/6 · 다음: (지금 마디)」, aria-expanded=false, 여섯 마디는 숨김, 단계 탭 위', async () => {
    assert(await expanded() === 'false', '처음엔 접힘');
    assert(await page.getAttribute(SUM, 'aria-controls') === 'unFlowL' && await page.getAttribute(`${B} .un-flow-l`, 'id') === 'unFlowL', 'aria-controls');
    assert(await page.evaluate(s => document.querySelector(s).tagName, SUM) === 'BUTTON', '단추');
    assert(!(await page.isVisible(`${B} .un-flow-l`)) && !(await page.isVisible(`${B} [data-flow="grade"]`)), '마디 숨김');
    const want = await page.evaluate(b => {
      const d = document.querySelectorAll(`${b} .un-flow-b.done`).length, now = document.querySelector(`${b} [aria-current="step"] .un-flow-n`);
      return now ? `평가 한 바퀴 ${d}/6 · 다음: ${now.textContent.replace('지금', '').trim()}` : `평가 한 바퀴 ${d}/6 ✓`;
    }, B);
    assert(await sumText() === want, `${await sumText()} ≠ ${want}`);
    assert((await sumText()).startsWith('평가 한 바퀴 1/6 · 다음: 틀린 까닭'), '예시 평가: ' + await sumText());
    assert((await page.textContent(`${SUM} .un-flow-chev`)).trim() === '▸' && await page.getAttribute(`${SUM} .un-flow-chev`, 'aria-hidden') === 'true', '화살표는 읽지 않음');
    const h = await page.evaluate(s => document.querySelector(s).getBoundingClientRect().height, SUM);
    assert(h >= 44 && h < 60, '한 줄 44px: ' + h);
    assert(await page.evaluate(v => !!(document.querySelector(`${v} #unFlow`).compareDocumentPosition(document.querySelector(`${v} .steps`)) & Node.DOCUMENT_POSITION_FOLLOWING), V), '단계 탭 위');
  }],
  ['누르면 여섯 마디(aria-expanded=true·▾), 다시 누르면 접힘 — 키보드 Enter·Space로도, 초점은 단추에 그대로', async () => {
    await page.click(SUM);
    assert(await expanded() === 'true' && (await page.textContent(`${SUM} .un-flow-chev`)).trim() === '▾', '펼침');
    assert(await page.locator(`${B} [data-flow]`).count() === 6 && await page.isVisible(`${B} [data-flow="post"]`), '여섯 마디');
    await page.click(SUM);
    assert(await expanded() === 'false' && !(await page.isVisible(`${B} .un-flow-l`)), '접힘');
    await page.focus(SUM);
    await page.keyboard.press('Enter');
    assert(await expanded() === 'true' && await page.isVisible(`${B} [data-flow="grade"]`), 'Enter로 펼침');
    assert(await page.evaluate(s => document.activeElement === document.querySelector(s), SUM), '초점');
    await page.keyboard.press('Space');
    assert(await expanded() === 'false', 'Space로 접힘');
    await page.keyboard.press('Enter');
    assert(await expanded() === 'true', '다시 펼침');
  }],
  ['펼친 것은 이 실행 동안 기억: 단계를 바꿔도·다른 평가를 열어도 펼친 채로, 다 된 평가는 「평가 한 바퀴 6/6 ✓」(글자로도 「다 됐어요」)', async () => {
    await page.click(`${V} .steps [data-step="3"]`);
    assert(await expanded() === 'true' && await page.isVisible(`${B} [data-flow="grade"]`), '3단계에서도 펼친 채로');
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un-open="u-all"]`);
    await page.waitForSelector(SUM);
    assert(await expanded() === 'true', '다른 평가에서도 펼친 채로');
    assert(await sumText() === '평가 한 바퀴 6/6 ✓ 다 됐어요', await sumText());
    assert((await page.textContent(`${SUM} .sr-only`)).includes('다 됐어요'), '읽어 주는 글');
    assert(await page.locator(`${B} [data-flow][aria-current="step"]`).count() === 0 && await page.locator(`${B} .un-flow-b.done`).count() === 6, '여섯 마디 모두 ✓');
    await page.click(SUM); // 휴대폰 시험은 접힌 띠로
    assert(await expanded() === 'false', '접음');
  }],
  ['설정 접기: 결과지 모양은 요약 한 줄 + [바꾸기] — 펼치면 「번호별로 한 장씩」, 다시 그려도 펼친 채로', async () => {
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    const F = `${V} [data-fold="unit-slip"]`;
    assert(await isOpen(F) === false && !(await page.isVisible(`${V} [data-one-page]`)), '처음엔 접힘');
    assert((await page.textContent(`${F} .fold-text`)).trim() === '결과지: 한 쪽에 2명(가운데를 잘라요)', await page.textContent(`${F} .fold-text`));
    assert((await page.textContent(`${F} .fold-act`)).includes('바꾸기'), '[바꾸기]');
    assert((await page.evaluate(f => document.querySelector(`${f} > summary`).getBoundingClientRect().height, F)) >= 44, '44px');
    await page.click(`${F} > summary`);
    assert(await page.isVisible(`${V} [data-one-page]`), '펼치면 칸');
    await page.click(`${V} .steps [data-step="3"]`); await page.click(`${V} .steps [data-step="4"]`);
    assert(await isOpen(F) === true, '다시 그려도 펼친 채로');
    await page.click(`${F} > summary`);
  }],
  ['「AI로 가는 것」: 4단계·복습 문제·틀린 까닭·3단계 모두 접힌 한 줄(자물쇠 + 글), 펼치면 무엇을 보내는지 + [AI로 보낸 글 보기]', async () => {
    const notes = await page.$$eval(`${V} .un-body .ai-note`, a => a.map(d => [d.open, d.querySelector('.ai-note-sum').textContent.trim(), d.querySelector('.ai-note-body p').textContent]));
    assert(notes.length === 3 && notes.every(([o, s]) => !o && s === 'AI로 가는 것'), JSON.stringify(notes));
    assert(notes[0][2] === 'AI에는 번호·점수·평가 내용만 보내요. 학생이 쓴 답과 이름은 보내지 않아요.', notes[0][2]);
    assert(notes[1][2].includes('문항 번호·평가 내용·영역·유형·정답·교과서 쪽만') && notes[2][2].includes('문항·정답·틀린 답 글만'), '복습 문제·틀린 까닭');
    assert(!(await page.locator(`${V} .un-body .cls-note`).allTextContents()).some(x => /AI에는/.test(x)), '회색 글에 AI 안내가 남음');
    const first = `${V} .un-body .ai-note >> nth=0`;
    assert(!(await page.locator(`${first} >> .ai-note-body`).isVisible()), '접힘');
    await page.locator(`${first} >> summary`).click();
    assert(await page.locator(`${first} >> .ai-note-body`).isVisible() && await page.locator(`${first} >> [data-go-ailog]`).isVisible(), '펼치면 글과 단추');
    await page.click(`${V} .steps [data-step="3"]`);
    const n3 = (await page.textContent(`${V} .un-body .ai-note`)).replace(/\s+/g, ' ');
    assert(n3.includes('학생 번호와 문제지 그림(정한 이름 칸은 가려요)') && n3.includes('문항 번호·평가 내용·유형만'), n3);
    await page.click(`${V} .steps [data-step="1"]`);
    assert((await page.textContent(`${V} .un-body .ai-note`)).includes('AI 없이 바로 읽어요'), '1단계');
  }],
  ['[AI로 보낸 글 보기]는 설정 › AI의 「AI로 보낸 글」로', async () => {
    await page.click(`${V} .un-body .ai-note > summary`);
    await page.click(`${V} .un-body .ai-note [data-go-ailog]`);
    await page.waitForSelector('#setAiLog');
    assert(await page.isVisible('section[data-menu="settings"]'), '설정 메뉴');
    await enter(page, 'evaluate', 'unit');
    await page.waitForSelector(SUM);
  }],
  ['결과 모아 보기: 수준 기준·도달 기준은 요약 한 줄, 평어 안내는 「AI로 가는 것」', async () => {
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-unv="results"]`);
    await page.click(`${V} [data-rv="pyeongeo"]`);
    const F = `${V} [data-fold="unit-cuts"]`;
    assert(await isOpen(F) === false && !(await page.isVisible(`${V} #unCutTop`)), '수준 기준 접힘');
    assert(/^수준 기준\(평균 점수\): 최상 \d+ · 상 \d+ · 중 \d+점 이상$/.test((await page.textContent(`${F} .fold-text`)).trim()), await page.textContent(`${F} .fold-text`));
    assert((await page.textContent(`${V} .un-results .ai-note`)).includes('AI에는 번호·수준·평가 내용만 보내요. 점수와 이름은 보내지 않아요.'), '평어 안내');
    await page.click(`${V} [data-rv="gap"]`);
    const G = `${V} [data-fold="unit-gapcut"]`;
    assert(await isOpen(G) === false && (await page.textContent(`${G} .fold-text`)).trim() === '기준: 영역 점수율 60% 아래', await page.textContent(`${G} .fold-text`));
  }],
  ['휴대폰 390×844: 연 평가(4단계)의 첫 화면에 띠 한 줄·한 줄 단계 탭 아래 4단계 첫 카드와 [잘한 점·격려 쓰기]가 보임', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click(`${V} [data-unv="list"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    await page.waitForSelector(SUM);
    assert(await expanded() === 'false', '접힌 띠');
    const r = await page.evaluate(v => {
      const q = s => document.querySelector(s).getBoundingClientRect(), bt = [...document.querySelectorAll('.bt-btn')].map(b => b.getBoundingClientRect()).filter(x => x.height);
      return { top: q(`${v} .un-top`).top, band: q(`${v} #unFlow`).height, card: q(`${v} .un-body .yp-card`).top, btn: q(`${v} [data-un="fbAI"]`).bottom, floor: bt.length ? Math.min(...bt.map(x => x.top)) : innerHeight };
    }, V);
    assert(r.top >= 0, '평가 이름이 보임 ' + JSON.stringify(r));
    assert(r.band < 60, '띠는 한 줄 ' + JSON.stringify(r));
    assert(r.card < r.floor - 120 && r.btn <= r.floor, '첫 카드·[잘한 점·격려 쓰기]가 첫 화면 안 ' + JSON.stringify(r));
    const s = await stepsInfo(V);
    assert(s.rows === 1 && s.scrolls && s.curIn, '단계 탭 한 줄·밀어 넘김·지금 단계 보임 ' + JSON.stringify(s));
    assert(s.minH >= 44, '단계 탭 44px ' + JSON.stringify(s));
    assert(await over() <= 0, '가로 넘침 ' + await over());
  }],
  ['휴대폰: 1단계로 가도 단계 탭은 한 줄, 펼친 띠는 제 칸 안에서 감쌈, 화면은 넘치지 않음', async () => {
    await page.click(`${V} .steps [data-step="1"]`);
    const s = await stepsInfo(V);
    assert(s.rows === 1 && s.curIn, JSON.stringify(s));
    await page.click(SUM);
    const r = await page.evaluate(b => { const n = document.querySelector(b).getBoundingClientRect(), bs = [...document.querySelectorAll(`${b} [data-flow]`)].map(x => x.getBoundingClientRect()); return { out: bs.filter(x => x.right > n.right + 1 || x.left < n.left - 1).length, rows: new Set(bs.map(x => Math.round(x.top))).size }; }, B);
    assert(r.out === 0 && r.rows >= 2, JSON.stringify(r));
    assert(await over() <= 0, '가로 넘침 ' + await over());
    await page.click(SUM);
  }],
  ['390px: 단원평가(목록·결과 다섯 보기·평가 1~4단계)·활동지·기재 점검이 가로로 넘치지 않음', async () => {
    for (const st of [2, 3, 4]) { await page.click(`${V} .steps [data-step="${st}"]`); assert(await over() <= 0, `${st}단계 ${await over()}`); }
    await page.click(`${V} [data-un="back"]`);
    assert(await over() <= 0, '목록 ' + await over());
    await page.click(`${V} [data-unv="results"]`);
    for (const rv of ['table', 'student', 'weak', 'gap', 'pyeongeo']) { await page.click(`${V} [data-rv="${rv}"]`); assert(await over() <= 0, `${rv} ${await over()}`); }
    await enter(page, 'evaluate', 'activity');
    await page.click(`${A} [data-ac="sample"]`);
    assert(await over() <= 0, '활동지 목록 ' + await over());
    await page.click(`${A} [data-ac-open]`);
    await page.waitForSelector(`${A} .steps`);
    const s = await stepsInfo(A);
    assert(s.rows === 1 && s.curIn && s.minH >= 44, '활동지 단계 탭 ' + JSON.stringify(s));
    for (const st of [1, 2, 3, 4, 5]) { await goA(st); assert(await over() <= 0, `활동지 ${st}단계 ${await over()}`); }
    await enter(page, 'evaluate', 'check');
    await page.waitForFunction(c => /점검한 글/.test((document.querySelector(`${c} .chk-sum`) || {}).textContent || ''), C);
    assert(await over() <= 0, '기재 점검 ' + await over());
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['활동지: 스캔 설정·쪽지 모양은 요약 한 줄(이름 칸 줄은 그대로 보임), 기준·채점 안내는 「AI로 가는 것」', async () => {
    await enter(page, 'evaluate', 'activity');
    await goA(3);
    const S = `${A} [data-fold="act-scan"]`;
    assert(await isOpen(S) === false && /^스캔: 학생당 \d+쪽 · 한 면에 1쪽 · 뒷면 그대로$/.test((await page.textContent(`${S} .fold-text`)).trim()), await page.textContent(`${S} .fold-text`));
    assert(await page.isVisible(`${A} #acMaskOn`) && await page.isVisible(`${A} [data-ac="mask"]`), '이름 칸 줄은 접지 않음');
    await goA(2);
    assert((await page.textContent(`${A} .ai-note`)).includes('활동지 글(이름·전화번호가 적힌 줄은 빼요)'), '기준');
    await goA(4);
    assert((await page.textContent(`${A} .ai-note`)).includes('학생 번호·이름은 보내지 않아요'), '채점');
    await goA(5);
    const P = `${A} [data-fold="act-slip"]`;
    assert(await isOpen(P) === false && (await page.textContent(`${P} .fold-text`)).trim() === '피드백 쪽지: 한 쪽에 4명', await page.textContent(`${P} .fold-text`));
  }],
  ['기재 점검: 고칠 글이 있으면 「AI로 가는 것」(그 글 하나와 까닭만·이름은 ○○○)', async () => {
    await enter(page, 'evaluate', 'check');
    await page.waitForSelector(`${C} .chk-row`);
    const n = await page.locator(`${C} .ai-note`);
    assert(await n.count() === 1 && !(await isOpen(`${C} .ai-note`)), '접힌 한 줄');
    const x = (await n.textContent()).replace(/\s+/g, ' ');
    assert(x.includes('누른 글 하나와 고칠 까닭만 보내요') && x.includes('○○○'), x);
  }],
  ['머리말 설명: 처음 3번(켤 때마다 한 번 셈)은 펼침, 4번째부터는 접힌 「화면 설명」 — 단원평가·활동지·기재 점검', async () => {
    const heads = [[V, 'unit'], [A, 'activity'], [C, 'check']];
    const visit = async () => {
      const out = [];
      for (const [sel, tab] of heads) {
        await enter(page, 'evaluate', tab);
        if (tab === 'unit' && await page.locator(`${V} [data-un="back"]`).count()) await page.click(`${V} [data-un="back"]`);
        if (tab === 'activity' && await page.locator(`${A} [data-ac="back"]`).count()) await page.click(`${A} [data-ac="back"]`);
        await page.waitForSelector(`${sel} .m-head .intro`, { state: 'attached' });
        out.push(await isOpen(`${sel} .m-head .intro`));
      }
      return out;
    };
    assert(JSON.stringify(await visit()) === '[true,true,true]', '1번째(이번 실행)');
    for (const k of [2, 3]) { await page.reload(); await page.waitForTimeout(400); assert(JSON.stringify(await visit()) === '[true,true,true]', `${k}번째`); }
    await page.reload(); await page.waitForTimeout(400);
    assert(JSON.stringify(await visit()) === '[false,false,false]', '4번째는 접힘');
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:ui:intro')));
    assert(c.unit === 4 && c.activity === 4 && c.check === 4, JSON.stringify(c));
    await enter(page, 'evaluate', 'unit');
    const I = `${V} .m-head .intro`;
    assert((await page.textContent(`${I} .intro-sum`)).trim() === '화면 설명' && await page.isVisible(`${I} .intro-sum`) && !(await page.isVisible(`${I} .intro-text`)), '「화면 설명」');
    await page.click(`${I} .intro-sum`);
    assert((await page.textContent(`${I} .intro-text`)).trim() === '학생 문제지 스캔과 답안을 넣으면 채점하고 피드백을 만들어요. 결과는 모아 봐요.', '펼친 글');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
