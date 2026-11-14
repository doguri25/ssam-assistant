// 생활기록부 글 쓰기 틀 — 교과 평어 학생별(스펙 2026-11-14-eval-redesign §6): 단원평가 교과 평어(교과마다)와 평가지 채점 글을 학생마다 모아 보여 주고,
// 고친 글은 그 자리(unit:pyeongeo:<교과> · 그 채점 기록)에 씀(모양 그대로). 문장 모음(평가요소 × 수준)은 [문장 모음 만들기]로 그대로. 글은 모두 지어낸 것(번호만)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const L = [{ id: 'e1', kind: 'unit', label: '「3학년 수학 3단원」 곱셈하기 100%' }, { id: 'e2', kind: 'unit', label: '「3학년 수학 3단원」 곱셈의 뜻 50%' }];
const P1 = '곱셈하기를 정확하게 해냄.', P2 = '방과 후 학원에서 배운 방법으로 곱셈의 뜻을 설명함.', P3 = '수업 시간에 성실하게 참여함.';
await page.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
  localStorage.setItem('ssam:grs', JSON.stringify(['g1']));
  localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '자석의 성질', unitId: '', criteria: '', critDocs: [], createdAt: 1, settings: { maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students: [
    { id: 's1', no: 1, n: 1, skip: 0, score: 90, level: 'high', manual: 0, summary: '', evidence: [], strengths: '', improve: '', unreadable: 0, text: '자석의 같은 극끼리 밀어내는 성질을 설명함.', d: 1 },
    { id: 's2', no: 2, n: 1, skip: 1, score: null, level: null, manual: 0, summary: '', evidence: [], strengths: '', improve: '', unreadable: 0, text: '', d: 0 }] }));
});
const calls = [];
await mockClaude(page, ({ prompt }) => { calls.push(prompt); return prompt.startsWith('[생기부 문장 하나]') ? JSON.stringify({ t: '곱셈의 뜻을 그림으로 나타내며 설명함.', src: ['e2'] }) : '[]'; });
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const V = '#pyRecView';

await page.goto(url); await page.waitForTimeout(400);
await page.evaluate(async ([L, P1, P2, P3]) => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '곱셈', round: 1, date: '2026-10-22' }, key: { domains: ['계산'], items: [{ no: 1, content: '곱셈하기', domain: '계산', type: 'short', answer: '6', points: 100 }] }, paper: { text: '' } });
  x.done = true; x.students = [1, 2].map(no => ({ no, skip: false, status: 'done', items: { 1: { pts: 100, ok: true } } }));
  m.saveTest(x);
  m.savePyeongeo('수학', { off: [], cuts: { top: 95, high: 80, mid: 60 }, students: {
    1: { level: 'high', text: `${P1} ${P2} ${P3}`, manual: false, ev: { list: L, sentences: [{ t: P1, src: ['e1'] }, { t: P2, src: ['e2'] }, { t: P3, src: [] }] } },
    2: { level: 'mid', text: '곱셈을 꾸준히 연습함.', manual: true } } });
}, [L, P1, P2, P3]);
await page.reload(); await page.waitForTimeout(400);
await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'pyeongeo');

await run('record-py', [
  ['학생별 글이 있으면 교과 평어는 학생별 화면: 교과 고르기(단원평가 교과 · 교과를 정하지 않은 수행평가), 학생 목록, 문장마다 근거', async () => {
    await page.waitForSelector(`${V} .rw-art`);
    assert(await page.isHidden('#importView') && await page.isHidden('#planView'), '문장 모음이 보임');
    const subs = await page.$$eval('#pySubject option', o => o.map(x => x.textContent));
    assert(JSON.stringify(subs) === JSON.stringify(['수학', '교과를 정하지 않은 수행평가']), JSON.stringify(subs));
    const stus = await page.$$eval(`${V} .rw-stu`, els => els.map(e => `${e.querySelector('.rw-no').textContent} ${e.querySelector('.st').textContent}`));
    assert(JSON.stringify(stus) === JSON.stringify(['1번 고칠 곳 2', '2번 다 씀']), JSON.stringify(stus));
    const rows = await page.$$eval(`${V} .rw-art .evd-row`, els => els.map(e => [e.classList.contains('evd-bad'), (e.querySelector('.evd-btn, .evd-no') || {}).textContent || '']));
    assert(rows.length === 3 && !rows[0][0] && rows[0][1].includes('근거 1') && rows[1][0] && rows[2][1].includes('근거 없음'), JSON.stringify(rows));
    assert((await page.textContent(`${V} .rw-head`)).includes('수준 · 상'), '수준');
    assert((await page.textContent(`${V} .rw-side`)).includes('곱셈하기 100%'), '근거 목록');
  }],
  ['[고치기]·[문장 빼기]는 단원평가 평어 그 자리에(근거 문장도 함께), AI에는 이름·번호 없이', async () => {
    const n = calls.length;
    await page.click(`${V} .evd-row:nth-child(2) [data-pyrow="fix"]`);
    await until(async () => ((await ls('ssam:unit:pyeongeo:수학')).students[1].text || '').includes('그림으로'));
    const p = calls.slice(n).find(c => c.startsWith('[생기부 문장 하나]'));
    assert(p.includes('교과학습발달상황') && p.includes('[고칠 문장]') && !/\d+번/.test(p), p);
    await page.waitForSelector(`${V} .evd-row:nth-child(3) [data-pyrow="del"]`);
    await page.click(`${V} .evd-row:nth-child(3) [data-pyrow="del"]`);
    await until(async () => (await ls('ssam:unit:pyeongeo:수학')).students[1].ev.sentences.length === 2);
    const v = await ls('ssam:unit:pyeongeo:수학');
    assert(v.students[1].text === `${P1} 곱셈의 뜻을 그림으로 나타내며 설명함.` && v.students[1].level === 'high' && v.students[2].manual === true && v.cuts.top === 95, JSON.stringify(v));
  }],
  ['평가지 채점 글: 교과를 고르면 그 기록 글, [직접 고치기] → 그 채점 기록에 저장', async () => {
    await page.selectOption('#pySubject', '');
    await page.waitForFunction(() => document.querySelector('#pyRecView .rw-art').textContent.includes('자석의 같은 극끼리'));
    assert((await page.textContent(`${V} .rw-art`)).includes('평가지 채점 「자석의 성질」'), '출처');
    await page.click(`${V} [data-py="edit"]`);
    await page.fill('#pyEdit', '자석의 같은 극끼리 밀어내고 다른 극끼리 끌어당기는 성질을 설명함.');
    await page.click(`${V} [data-py="save"]`);
    await until(async () => (await ls('ssam:gr:g1')).students[0].text.includes('끌어당기는'));
    assert((await ls('ssam:gr:g1')).students[0].d === 1, '손으로 고치면 사용함은 그대로');
  }],
  ['[문장 모음 만들기] → 예전 문장 모음 화면, 위 띠 [학생별 교과 평어 보기]로 돌아옴', async () => {
    await page.click(`${V} [data-pyv="pool"]`);
    await page.waitForSelector('#importView', { state: 'visible' });
    assert(await page.isVisible('#srcPaste') && await page.isHidden(V), '문장 모음');
    await page.click('#pyPoolBar [data-pyv="stu"]');
    await page.waitForSelector(`${V} .rw-art`);
  }],
  ['390px: 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => { const W = document.documentElement.clientWidth; return { over: document.documentElement.scrollWidth - W, bad: [...document.querySelectorAll('#pyRecView *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > W + 1).map(e => e.className).slice(0, 3) }; });
      assert(r.over <= 0 && !r.bad.length, JSON.stringify(r));
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
