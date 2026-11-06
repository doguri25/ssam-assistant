// AI 채점 정확도 (스펙 2026-11-06 C): AI가 처음 매긴 값(ai0)을 칸마다 기억, 선생님이 고치면 지금 값만 바뀜.
// 채점·확인 요약 줄·결과 화면·평가 목록에 「AI가 맞힌 칸 ○% (유형별) · 선생님이 고친 칸 n개」, 마치기 전 「확인 중」, 옛 평가 「기록 없음」,
// 목록 위 「올해 n개 평가 · AI가 맞힌 칸 평균 ○%」 — 단원평가·활동지
import { open, run, assert } from './helpers.mjs';
import { SAMPLE_ITEMS } from '../../web/menus/evaluate/unit/unit-sample.js';
import { autoJudge } from '../../web/menus/evaluate/unit/unit-grade.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:activity:set')) localStorage.setItem('ssam:activity:set', JSON.stringify({ pagesPer: 1, maskOn: false, mask: [], maskAll: false }));
});
const READS = ['(2)', '②', '㉯', '민수', '②, ④', '(1)-②, (2)-①', '마을 도서관', '⑤', '도서관에서 잔치가 열린다.', '가고 싶다.'];
let k = 0, graded = 0;
await page.route('https://api.anthropic.com/**', async route => {
  const body = JSON.parse(route.request().postData());
  const c = body.messages[0].content;
  const prompt = typeof c === 'string' ? c : c.filter(x => x.type === 'text').map(x => x.text).join('\n');
  const head = prompt.split('\n')[0];
  let out = '{}';
  if (head === '[단원평가 채점]') {
    graded++;
    out = JSON.stringify({ items: READS.map((read, i) => {
      const it = SAMPLE_ITEMS[i];
      const p = autoJudge(it, read) ?? (it.type === 'essay' ? 12 : 0);
      return { no: i + 1, read, points: p, sure: true, why: '' };
    }) });
  } else if (head === '[쪽 나누기]') out = JSON.stringify({ pages: [{ i: 0, role: 'teacher' }] });
  else if (head === '[활동지 채점]') {
    const n = k++;
    out = JSON.stringify({ items: [{ no: 1, read: '3', mark: 'o', why: '', sure: true }, { no: 2, read: '증발', mark: 'o', why: '', sure: true }, { no: 3, read: '바다에서 구름으로', mark: 't', why: '', sure: true }, { no: 4, read: '그림', mark: n === 1 ? 'x' : 'o', why: '', sure: n !== 1 }], good: '잘했어요', next: '더 해 봐요', level: 'ok', levelWhy: '' });
  }
  await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: [{ type: 'content_block_delta', delta: { type: 'text_delta', text: out } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') }).catch(() => {});
});
const E = 'section[data-menu="evaluate"]', V = `${E} .unit-box`;
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const act = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:activity:a:acT1')));
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const tab = async name => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click(`#menuTabs [data-tab="${name}"]`); };
const pngs = n => page.evaluate(async n => {
  const out = [];
  for (let i = 0; i < n; i++) { const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 420); g.fillStyle = '#123'; g.fillRect(30 + i * 7, 90, 140, 30); out.push(c.toDataURL('image/png').split(',')[1]); }
  return out;
}, n);
const files = async (n, name) => (await pngs(n)).map((b, i) => ({ name: `${name}${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b, 'base64') }));
const ACT = { id: 'acT1', meta: { subject: '과학', unit: '1', lesson: '2', pages: '12~13쪽', title: '물의 여행', date: '2026-09-10', term: 2 }, sheet: { student: '1. 고르기\n2. 빈칸\n3. 설명\n4. 그리기', teacher: '' },
  items: [{ no: 1, type: 'choice', ask: '고르기', answer: '③', ok: '', part: '', src: 'answer' }, { no: 2, type: 'short', ask: '빈칸', answer: '증발', ok: '', part: '', src: 'answer' }, { no: 3, type: 'write', ask: '설명', answer: '증발·구름·비', ok: '셋 다', part: '일부', src: 'ai' }, { no: 4, type: 'draw', ask: '그리기', answer: '', ok: '바다·구름·비', part: '일부', src: 'ai' }],
  confirmed: true, students: [], done: false, link: null, createdAt: 1 };
await page.goto(url);
await page.waitForTimeout(300);
const A = await page.evaluate(async a => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  const x = m.newTest({ meta: { ...s.SAMPLE_META, round: 3, date: '2026-10-29' }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } });
  x.mask = []; x.maskAll = false; m.saveTest(x);
  // 이 기능 전에 채점한 평가: 칸에 처음 값이 없고 목록 요약에도 정확도가 없음
  const old = s.sampleTests()[0];
  old.id = 'old'; old.meta = { ...old.meta, sample: false, round: 9 };
  for (const st of old.students) for (const c of Object.values(st.items)) delete c.ai0;
  m.saveTest(old);
  const l = JSON.parse(localStorage.getItem('ssam:unit:list')).map(e => { if (e.id === 'old') delete e.acc; return e; });
  localStorage.setItem('ssam:unit:list', JSON.stringify(l));
  localStorage.setItem('ssam:unit:set', JSON.stringify({ pagesPer: 1, mask: [], maskAll: false, maskOn: false }));
  localStorage.setItem('ssam:activity:a:acT1', JSON.stringify(a));
  localStorage.setItem('ssam:activity:list', JSON.stringify([{ id: 'acT1', title: '물의 여행', subject: '과학', date: '2026-09-10', term: 2, n: 0, done: false, at: 1 },
    { id: 'acOld', title: '옛 활동지', subject: '과학', date: '2026-04-01', term: 1, n: 3, done: true, at: 0 }]));
  localStorage.setItem('ssam:activity:a:acOld', JSON.stringify({ ...a, id: 'acOld', meta: { ...a.meta, title: '옛 활동지' }, done: true, students: [1, 2, 3].map(no => ({ no, skip: false, status: 'done', marks: { 1: { mark: 'o' } } })) }));
  return x.id;
}, ACT);
await page.reload(); await page.waitForTimeout(400);
const accU = sel => page.textContent(`${V} ${sel}`);

await run('grade-accuracy', [
  ['단원평가: 채점하면 칸마다 AI 처음 값(ai0) 기억, 마치기 전 요약 줄은 「확인 중」', async () => {
    await tab('unit');
    await page.click(`${V} [data-un-open="${A}"]`);
    await page.setInputFiles(`${V} #unAnsFile`, await files(2, '답안'));
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 2);
    await page.click(`${V} [data-un="toGrade"]`);
    await page.click(`${V} [data-un="grade"]`);
    await until(async () => (await T(A)).students.every(s => s.status === 'done'));
    const x = await T(A);
    assert(x.students.every(s => Object.values(s.items).every(c => c.ai0 === c.pts)), JSON.stringify(x.students[0].items[9]));
    await page.waitForSelector(`${V} #unAcc`);
    assert((await accU('#unAcc')).trim() === 'AI가 맞힌 칸: 확인 중', await accU('#unAcc'));
  }],
  ['선생님이 칸을 고치면 지금 값만 바뀜(처음 값 그대로), 노란 칸을 고치지 않고 확인만 하면 맞힌 칸', async () => {
    await page.click(`${V} [data-cell="1-3"]`);
    await page.click('#sheetRoot [data-pts="0"]');
    await page.click('#sheetRoot #unCellOk');
    await page.click(`${V} [data-cell="2-9"]`);
    await page.click('#sheetRoot #unCellOk');
    const x = await T(A);
    const c = x.students[0].items[3], e = x.students[1].items[9];
    assert(c.pts === 0 && c.ai0 === 10 && c.manual, JSON.stringify(c));
    assert(e.ok && !e.manual && e.pts === e.ai0, JSON.stringify(e));
  }],
  ['채점 마치기 → 요약 줄·4단계(결과)에 「AI가 맞힌 칸 95% (유형별) · 선생님이 고친 칸 1개」', async () => {
    await page.click(`${V} [data-un="finish"]`);
    await page.click('#sheetRoot #unFinishOk');
    await page.waitForSelector(`${V} #unAcc4`);
    const want = 'AI가 맞힌 칸 95% (객관식 92% · 단답 100% · 서술형 100%) · 선생님이 고친 칸 1개';
    assert((await accU('#unAcc4')).trim() === want, await accU('#unAcc4'));
    await page.click(`${V} .steps [data-step="3"]`);
    assert((await accU('#unAcc')).trim() === want, await accU('#unAcc'));
  }],
  ['다시 채점: 선생님이 고친 칸은 처음 값까지 그대로, 정확도 그대로', async () => {
    const n = graded;
    await page.click(`${V} [data-un="retry"][data-no="1"]`);
    await until(async () => graded === n + 1 && !(await page.locator(`${V} [data-strow="1"] .spin`).count()));
    await page.waitForTimeout(200);
    const c = (await T(A)).students[0].items[3];
    assert(c.pts === 0 && c.ai0 === 10 && c.manual, JSON.stringify(c));
    assert((await accU('#unAcc')).includes('95%'), await accU('#unAcc'));
  }],
  ['평가 목록: 평가마다 정확도, 옛 평가는 「기록 없음」, 목록 위 「올해 n개 평가 · AI가 맞힌 칸 평균 ○%」', async () => {
    await page.click(`${V} [data-un="back"]`);
    const card = await page.textContent(`${V} [data-un-open="${A}"] .un-c-acc`);
    assert(card.trim() === 'AI가 맞힌 칸 95% (객관식 92% · 단답 100% · 서술형 100%) · 선생님이 고친 칸 1개', card);
    assert((await page.textContent(`${V} [data-un-open="old"] .un-c-acc`)).trim() === 'AI가 맞힌 칸: 기록 없음', '옛 평가');
    assert((await page.textContent(`${V} #unYear`)).trim() === '올해 1개 평가 · AI가 맞힌 칸 평균 95%', await page.textContent(`${V} #unYear`));
    // 예시 평가는 진짜 평가가 있으면 평균에 넣지 않음
    await page.click(`${V} [data-un="sample"]`);
    assert((await page.textContent(`${V} #unYear`)).trim() === '올해 1개 평가 · AI가 맞힌 칸 평균 95%', await page.textContent(`${V} #unYear`));
    assert((await page.textContent(`${V} [data-un-open="sample-1"] .un-c-acc`)).includes('선생님이 고친 칸 2개'), '예시');
  }],
  ['결과 모아 보기(반 약한 부분)에도 그 평가의 정확도, 옛 평가는 「기록 없음」', async () => {
    await page.click(`${V} [data-unv="results"]`);
    await page.click(`${V} [data-rv="weak"]`);
    await page.selectOption(`${V} #unWeakTest`, A);
    assert((await page.textContent(`${V} #unWeakAcc`)).includes('AI가 맞힌 칸 95%'), await page.textContent(`${V} #unWeakAcc`));
    await page.selectOption(`${V} #unWeakTest`, 'old');
    assert((await page.textContent(`${V} #unWeakAcc`)).trim() === 'AI가 맞힌 칸: 기록 없음', await page.textContent(`${V} #unWeakAcc`));
    await page.click(`${V} [data-unv="list"]`);
  }],
  ['활동지: 채점하면 처음 표시 기억, 4단계 요약 줄 「확인 중」, 칸을 고치면 지금 표시만', async () => {
    await tab('activity');
    await page.click(`${E} [data-ac-open="acT1"]`);
    await page.waitForSelector(`${E} [data-bundle-pick="act3"]`);
    await page.setInputFiles('#bundleFile-act3', await files(5, '스캔'));
    await page.waitForSelector('#sheetRoot #bundleCard');
    await page.click('#sheetRoot #bundleOk');
    await until(async () => (await act()).students.length === 4);
    await page.click(`${E} [data-ac="toGrade"]`);
    await page.click(`${E} [data-ac="grade"]`);
    await until(async () => (await act()).students.filter(s => s.status === 'done').length === 4);
    const a = await act();
    assert(a.students.every(s => Object.values(s.marks).every(c => c.ai0 === c.mark)), JSON.stringify(a.students[0].marks));
    await page.waitForSelector(`${E} #acAcc`);
    assert((await page.textContent(`${E} #acAcc`)).trim() === 'AI가 맞힌 칸: 확인 중', await page.textContent(`${E} #acAcc`));
    const no = a.students[0].no;
    await page.click(`${E} [data-cell="${no}|3"]`);
    await page.click('#sheetRoot [data-set-mark="o"]');
    await page.click('#sheetRoot #acCellOk');
    // 노란 칸(4번 그림)은 표시를 바꾸지 않고 저장 → 맞힌 칸
    await page.click(`${E} #acGrid .ac-cell.chk`);
    await page.click('#sheetRoot #acCellOk');
    const b = await act(), c = b.students[0].marks[3];
    assert(c.mark === 'o' && c.ai0 === 't' && c.manual, JSON.stringify(c));
  }],
  ['활동지 5단계: [확정] 전 「확인 중」, 확정하면 「AI가 맞힌 칸 94% (유형별) · 선생님이 고친 칸 1개」, 목록·올해 평균', async () => {
    await page.click(`${E} [data-ac="toResults"]`);
    assert((await page.textContent(`${E} #acAcc5`)).trim() === 'AI가 맞힌 칸: 확인 중', await page.textContent(`${E} #acAcc5`));
    await page.click(`${E} [data-ac="done"]`);
    const want = 'AI가 맞힌 칸 94% (객관식 100% · 단답 100% · 서술형 75% · 그림 100%) · 선생님이 고친 칸 1개';
    await page.waitForFunction(w => (document.querySelector('#acAcc5') || {}).textContent === w, want);
    await page.click(`${E} [data-ac="back"]`);
    assert((await page.textContent(`${E} [data-ac-open="acT1"] .act-c-acc`)).trim() === want, await page.textContent(`${E} [data-ac-open="acT1"] .act-c-acc`));
    assert((await page.textContent(`${E} [data-ac-open="acOld"] .act-c-acc`)).trim() === 'AI가 맞힌 칸: 기록 없음', '옛 활동지');
    assert((await page.textContent(`${E} #acYear`)).trim() === '올해 1개 평가 · AI가 맞힌 칸 평균 94%', await page.textContent(`${E} #acYear`));
  }],
  ['좁은 화면(360px) 가로 스크롤 없음(목록)', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const ok1 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await tab('unit');
    await page.waitForTimeout(150);
    const ok2 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok1 && ok2, '가로 스크롤');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
