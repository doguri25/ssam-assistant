// 버그 사냥 11.14 — 생활기록부 글 쓰기 틀(교과 평어 학생별). 글은 모두 지어낸 것(번호만)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
const L = [{ id: 'e1', kind: 'unit', label: '「3학년 수학 3단원」 곱셈하기 100%' }, { id: 'e2', kind: 'unit', label: '「3학년 수학 3단원」 곱셈의 뜻 50%' }];
const P1 = '곱셈하기를 정확하게 해냄.', P2 = '방과 후 학원에서 배운 방법으로 곱셈의 뜻을 설명함.', P3 = '수업 시간에 성실하게 참여함.';
const T2 = '곱셈을 꾸준히 연습하며 실수를 줄여 감.';
const G1 = '과학 학원에서 배운 실험으로 자석의 성질을 설명함.', FIXED = '실험으로 자석의 같은 극끼리 밀어내는 성질을 설명함.';
await page.addInitScript(() => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
// AI 답은 gate가 풀릴 때까지 기다림(그사이 화면을 움직여 봄)
let gate = null;
const hold = () => { let open; gate = new Promise(r => { open = r; }); return open; };
await mockClaude(page, async ({ prompt }) => {
  if (gate) await gate;
  if (prompt.startsWith('[생기부 글 고치기]')) return JSON.stringify({ text: FIXED });
  return prompt.startsWith('[생기부 문장 하나]') ? JSON.stringify({ t: '곱셈의 뜻을 그림으로 나타내며 설명함.', src: ['e2'] }) : '[]';
});
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const V = '#pyRecView';

await page.goto(url); await page.waitForTimeout(400);
await page.evaluate(async ([L, P1, P2, P3, T2]) => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '곱셈', round: 1, date: '2026-10-22' }, key: { domains: ['계산'], items: [{ no: 1, content: '곱셈하기', domain: '계산', type: 'short', answer: '6', points: 100 }] }, paper: { text: '' } });
  x.done = true; x.students = [1, 2].map(no => ({ no, skip: false, status: 'done', items: { 1: { pts: 100, ok: true } } }));
  m.saveTest(x);
  m.savePyeongeo('수학', { off: [], cuts: { top: 95, high: 80, mid: 60 }, students: {
    1: { level: 'high', text: `${P1} ${P2} ${P3}`, manual: false, ev: { list: L, sentences: [{ t: P1, src: ['e1'] }, { t: P2, src: ['e2'] }, { t: P3, src: [] }] } },
    2: { level: 'mid', text: T2, manual: true } } });
}, [L, P1, P2, P3, T2]);
await page.reload(); await page.waitForTimeout(400);
await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'pyeongeo');

await run('fix1114-record', [
  ['교과 평어 학생별: [고치기]를 누르고 AI가 쓰는 동안 다른 학생으로 옮겨도 고친 글은 처음 학생 칸에(옮긴 학생 글은 그대로)', async () => {
    await page.waitForSelector(`${V} .rw-art`);
    const open = hold();
    await page.click(`${V} .evd-row:nth-child(2) [data-pyrow="fix"]`);
    await page.waitForSelector(`${V} .rw-fix .spin`);
    await page.click(`${V} [data-pystu="2"]`);
    await page.waitForFunction(() => document.querySelector('#pyRecView .rw-name').textContent.includes('2번'));
    gate = null; open();
    await until(async () => ((await ls('ssam:unit:pyeongeo:수학')).students[1].text || '').includes('그림으로'), 4000).catch(() => {});
    await page.waitForTimeout(300);
    const v = await ls('ssam:unit:pyeongeo:수학');
    assert(v.students[2].text === T2, `2번 글이 바뀜: ${v.students[2].text}`);
    assert(v.students[1].text === `${P1} 곱셈의 뜻을 그림으로 나타내며 설명함. ${P3}`, `1번 글: ${v.students[1].text}`);
    assert(v.students[2].level === 'mid' && v.students[2].manual === true && !v.students[2].ev, JSON.stringify(v.students[2]));
  }],
  ['교과 평어 학생별 [나이스 차례로 복사]: 글이 없는 학생은 빈 줄로 칸을 지키고(뒤 학생이 앞 칸으로 밀리지 않게), 예외 번호(전출)는 넣지 않음', async () => {
    await page.evaluate(async T2 => {
      localStorage.setItem('ssam:class', JSON.stringify({ count: 5, except: [4] }));
      const m = await import('./menus/evaluate/unit/unit-model.js');
      const v = m.getPyeongeo('수학');
      v.students = { ...v.students, 4: { level: 'mid', text: '전출 전에 쓴 평어임.', manual: true }, 5: { level: 'low', text: '구구단을 차근차근 익혀 감.', manual: true } };
      m.savePyeongeo('수학', v);
    }, T2);
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'pyeongeo');
    await page.waitForSelector(`${V} [data-py="neis"]`);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await page.click(`${V} [data-py="neis"]`);
    await until(async () => !!(await page.evaluate(() => navigator.clipboard.readText())));
    const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\n');
    const v = await ls('ssam:unit:pyeongeo:수학');
    assert(JSON.stringify(lines) === JSON.stringify([v.students[1].text, T2, '', '구구단을 차근차근 익혀 감.']), JSON.stringify(lines));
  }],
  ['교과 평어 학생별(평가지 채점 글)을 본 뒤 기재 점검에서 그 글을 고치고 돌아오면 고친 글이 보이고, [직접 고치기]·저장이 고친 글을 옛 글로 되돌리지 않음', async () => {
    await page.evaluate(G1 => {
      localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
      localStorage.setItem('ssam:grs', JSON.stringify(['g1']));
      localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '자석의 성질', unitId: '', criteria: '', critDocs: [], createdAt: 1, settings: { maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students: [
        { id: 's1', no: 1, n: 1, skip: 0, score: 90, level: 'high', manual: 0, summary: '', evidence: [], strengths: '', improve: '', unreadable: 0, text: G1, d: 0 }] }));
    }, G1);
    await page.reload(); await page.waitForTimeout(400);
    await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'pyeongeo');
    await page.waitForSelector('#pySubject option[value=""]', { state: 'attached' });
    await page.selectOption('#pySubject', '');
    await page.waitForFunction(G1 => document.querySelector('#pyRecView .rw-art').textContent.includes(G1), G1);
    await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'check');
    const ref = '[data-chk-ref="gr:g1:s1"]';
    await page.waitForSelector(`${ref} [data-chk-ai]`);
    await page.click(`${ref} [data-chk-ai]`);
    await page.waitForSelector(`${ref} [data-chk-apply]`);
    await page.click(`${ref} [data-chk-apply]`);
    await until(async () => (await ls('ssam:gr:g1')).students[0].text === FIXED);
    await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'pyeongeo');
    await page.waitForFunction(F => { const a = document.querySelector('#pyRecView .rw-art'); return a && a.textContent.includes(F); }, FIXED, { timeout: 3000 }).catch(() => {});
    const shown = await page.textContent('#pyRecView .rw-art');
    await page.click(`${V} [data-py="edit"]`);
    await page.click(`${V} [data-py="save"]`);
    await page.waitForTimeout(300);
    const now = (await ls('ssam:gr:g1')).students[0].text;
    assert(now === FIXED, `고친 글이 옛 글로 돌아감: ${now}`);
    assert(shown.includes(FIXED), `옛 글이 보임: ${shown}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
