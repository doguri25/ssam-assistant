// 버그 사냥 11.14 — 생활기록부 글 쓰기 틀(교과 평어 학생별). 글은 모두 지어낸 것(번호만)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const L = [{ id: 'e1', kind: 'unit', label: '「3학년 수학 3단원」 곱셈하기 100%' }, { id: 'e2', kind: 'unit', label: '「3학년 수학 3단원」 곱셈의 뜻 50%' }];
const P1 = '곱셈하기를 정확하게 해냄.', P2 = '방과 후 학원에서 배운 방법으로 곱셈의 뜻을 설명함.', P3 = '수업 시간에 성실하게 참여함.';
const T2 = '곱셈을 꾸준히 연습하며 실수를 줄여 감.';
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
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
