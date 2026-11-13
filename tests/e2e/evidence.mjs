// 근거가 보이는 평어(스펙 2026-11-13 §5): 단원평가 교과 평어·평가지 채점 평어·행동특성에서
// AI 요청에 학생마다 근거 목록(이름 없음) → 문장마다 「근거 n」 단추(펼치면 근거 줄) · 근거 없는 문장은 「근거 없음」 ·
// 고친 글은 「고친 글 · 근거는 처음 쓴 글 기준이에요」 · 복사·모두 복사·표로 복사·전체복사는 평어 글만 · 예전 모양 답(text·한 줄 글)은 근거 없이 그대로
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
const NAMES = ['김하늘', '이바다', '한가람'];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:hk')) localStorage.setItem('ssam:hk', JSON.stringify({ settings: { unit: 'char', min: 100, max: 200, variants: 2, ending: 'eum', grade: 3 }, students: [
    { id: 'a', no: 1, label: '', memo: '김하늘\t1인 1역(우유 당번) 성실함, 친구를 잘 도와줌\n[11. 6.] 토론에서 근거를 들어 반론함', results: [], done: 0 },
    { id: 'b', no: 2, label: '', memo: '이름: 이바다, 정리정돈을 잘함, 책을 즐겨 읽음', results: [], done: 0 }] }));
  if (!localStorage.getItem('ssam:grset')) localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [], ratio: { top: 0, high: 100, mid: 0, low: 0 } }));
});

// 행특 후보 문장(100~200자 안)
const HK_A = [['1인 1역인 우유 당번을 한 학기 동안 성실하게 맡아 학급에 보탬이 됨.', ['m1']], ['친구가 어려워하면 먼저 다가가 도와주는 따뜻한 마음을 지님.', ['m2']], ['토론 시간에는 근거를 들어 생각을 또렷하게 밝히며 반론함.', ['m3']], ['앞으로 더 큰 성장이 기대됨.', []]];
const HK_B = [['토론에서 근거를 들어 반론하는 모습이 돋보이며 생각을 차분하게 정리함.', ['m3']], ['맡은 우유 당번 일을 빠짐없이 해내어 친구들의 믿음을 얻음.', ['m1', 'm9']], ['어려운 친구를 먼저 챙기는 배려가 꾸준히 드러남.', ['m2']]];
// 「조금 짧게」 답이 200자를 넘으면 앱이 끝 문장을 잘라 맞춤(잘린 문장은 근거에서도 빠짐)
const HK_SHORT = [['우유 당번을 한 학기 동안 성실하게 맡아 학급 일에 책임감 있게 참여하며 친구들이 믿고 따르는 모습이 돋보임.', ['m1']], ['친구가 어려워하면 먼저 다가가 도와주며 토론에서는 근거를 들어 자기 생각을 또렷하게 밝히고 다른 의견도 존중함.', ['m2', 'm3']], ['꾸준히 노력하는 태도로 학급 친구들에게 좋은 본보기가 되며 앞으로의 성장이 더욱 기대되는 학생으로 자라고 있어 다음 학년에서도 큰 발전이 기대됨.', []]];
// 2번 학생(정리정돈 메모)은 예전 모양(한 줄에 글 하나, 100~200자)으로 답함
const HK_OLD = ['정리정돈을 잘하여 교실을 늘 깨끗하게 가꾸며 친구들과 함께 쓰는 물건을 소중히 다루는 모습이 돋보이고, 책을 즐겨 읽어 쉬는 시간에도 독서하는 습관이 바르게 자리 잡아 친구들에게 좋은 본보기가 됨.', '책 읽기를 즐겨 여러 갈래의 책을 꾸준히 찾아 읽으며 생각을 넓히고, 자기 자리를 스스로 정리하는 습관이 몸에 배어 학급 친구들에게 좋은 본보기가 되며 맡은 일도 끝까지 책임감 있게 해냄.'];
const ss = list => list.map(([tx, src]) => ({ t: tx, src }));
const calls = [];
await mockClaude(page, async ({ prompt, images }) => {
  calls.push(prompt);
  if (prompt.startsWith('[단원평가 평어]')) {
    const nos = [...prompt.matchAll(/^- (\d+)번 \|/gm)].map(m => +m[1]);
    return JSON.stringify({ students: nos.map(no => no === 2 ? { no, text: '곱셈의 뜻을 바르게 알고 설명함.' }
      : no === 1 ? { no, sentences: [{ t: '곱셈하기를 정확하게 해냄.', src: ['e1'] }, { t: '수업 시간에 늘 성실하게 참여함.', src: [] }] }
        : { no, sentences: [{ t: '곱셈을 꾸준히 연습하면 더 나아질 것임.', src: ['e1', 'e7'] }] }) });
  }
  if (prompt.includes('수행평가를 채점하는') && images) return JSON.stringify({ score: 80, summary: '받아올림을 이해하고 풀이 과정을 차례대로 씀.', evidence: ['받아올림 표시를 바르게 함'], strengths: '꼼꼼하게 계산함', improve: '검산하기', unreadable: false });
  if (prompt.startsWith('같은 수행평가를 본 학생')) return JSON.stringify([...prompt.matchAll(/^- (\d+)번 \| (\d+)점/gm)].map(m => ({ no: +m[1], score: +m[2] })));
  if (prompt.includes("'교과학습발달상황' 평어")) {
    const nos = [...prompt.matchAll(/^- (\d+)번 \(/gm)].map(m => +m[1]);
    return JSON.stringify(nos.map(no => no === 1 ? { no, sentences: [{ t: '수의 크기를 비교하며', src: ['e1'] }, { t: '받아올림이 있는 덧셈을 바르게 계산할 수 있음.', src: ['e2', 'e3'] }] }
      : no === 2 ? { no, sentences: [{ t: '덧셈 원리를 친구에게 차근차근 설명함.', src: [] }] }
        : { no, text: `${no}번은 풀이 과정을 차례대로 정리하여 씀.` }));
  }
  if (prompt.includes('정리정돈을 잘함')) return prompt.startsWith('아래 행동특성 및 종합의견을') ? HK_OLD[0] : HK_OLD.join('\n');
  if (prompt.startsWith('아래 행동특성 및 종합의견을')) return JSON.stringify({ results: [{ sentences: ss(HK_SHORT) }] });
  if (prompt.includes("'행동특성 및 종합의견'을 쓰는")) return JSON.stringify({ results: [{ sentences: ss(HK_A) }, { sentences: ss(HK_B) }] });
  return '[]';
});
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const clip = () => page.evaluate(() => navigator.clipboard.readText());
const ls = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const noOverflow = async sel => page.evaluate(sel => {
  const W = document.documentElement.clientWidth, bad = [...document.querySelectorAll(sel)].filter(el => el.getBoundingClientRect().right > W + 1);
  return document.documentElement.scrollWidth <= W + 1 && !bad.length;
}, sel);
const V = 'section[data-menu="evaluate"] .unit-box';
const goUnit = async () => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]'); };

await page.goto(url);
await page.waitForTimeout(400);
await goUnit();
// 마친 수학 단원평가 하나: 1번 다 맞음, 2번 곱셈하기 틀림, 3번 다 틀림
await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const items = [{ no: 1, content: '곱셈하기', domain: '계산', type: 'short', answer: '345', points: 50, criteria: '', pages: '' }, { no: 2, content: '곱셈의 뜻', domain: '이해', type: 'choice', answer: '②', points: 50, criteria: '', pages: '' }];
  const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '곱셈', round: 1, date: '2026-10-22' }, key: { domains: ['계산', '이해'], items }, paper: { text: '' } });
  x.done = true;
  const pts = { 1: [50, 50], 2: [0, 50], 3: [0, 0] };
  x.students = [1, 2, 3].map(no => ({ no, skip: false, status: 'done', good: '', cheer: '', items: { 1: { read: '', pts: pts[no][0], ai: 0, flag: '', why: '', ok: true, manual: false }, 2: { read: '', pts: pts[no][1], ai: 0, flag: '', why: '', ok: true, manual: false } } }));
  m.saveTest(x);
});
await page.reload(); await page.waitForTimeout(500);
await goUnit();
await page.click(`${V} [data-unv="results"]`);
await page.click(`${V} [data-rv="pyeongeo"]`);

await run('evidence', [
  ['단원평가 교과 평어: AI 요청에 학생마다 근거 목록(평가 이름·평가 내용·정답률, 이름 없음)과 근거 규칙', async () => {
    await page.click(`${V} [data-un="pyAI"]`);
    await page.waitForFunction(() => { const el = document.querySelector('textarea[data-py="1"]'); return el && el.value === '곱셈하기를 정확하게 해냄. 수업 시간에 늘 성실하게 참여함.'; });
    const p = calls.filter(c => c.startsWith('[단원평가 평어]')).at(-1);
    assert(p.includes('- 1번 | 수준') && p.includes('  [근거 목록]\n  e1) 「3학년 수학 3단원」 곱셈하기 100%'), p.slice(0, 600));
    assert(p.includes('근거 목록에 있는 사실만 쓰고') && p.includes('"sentences"'), '규칙·답 모양');
    assert(!/\d+\s*점/.test(p), '점수(○점)');
  }],
  ['단원평가: 문장마다 「근거 n」 단추 → 펼치면 근거 줄(aria-expanded), 근거 없는 문장은 「근거 없음」, 예전 모양 답은 근거 표시 없음', async () => {
    const box = `${V} [data-pyev="1"]`;
    await page.waitForSelector(`${box} .evd-btn`);
    const btn = page.locator(`${box} .evd-btn`).first();
    assert((await btn.textContent()).includes('근거 1') && await btn.getAttribute('aria-expanded') === 'false', await btn.textContent());
    assert(!(await page.locator(`${box} .evd-src`).first().isVisible()), '처음에는 접힘');
    await btn.click();
    assert(await btn.getAttribute('aria-expanded') === 'true', '펼침');
    const src = page.locator(`${box} .evd-src`).first();
    assert(await src.isVisible() && (await src.textContent()).includes('「3학년 수학 3단원」 곱셈하기 100%'), await src.textContent());
    const none = page.locator(`${box} .evd-none`);
    assert(await none.count() === 1 && (await none.textContent()).includes('수업 시간에 늘 성실하게 참여함.') && (await none.textContent()).includes('근거 없음'), '근거 없음');
    assert(await page.locator(`${V} [data-pyev="2"] .evd`).count() === 0, '예전 모양 답(text)은 근거 없이');
    assert(await page.locator(`${V} [data-pyev="3"] .evd-btn`).textContent().then(x => x.includes('근거 1')), '목록에 없는 근거 번호(e7)는 뺌');
    const h = await btn.evaluate(b => b.getBoundingClientRect().height);
    assert(h >= 44, '누르는 칸 ' + h);
    const sv = await ls('ssam:unit:pyeongeo:수학');
    assert(sv.students[1].ev && sv.students[1].ev.sentences.length === 2 && sv.students[1].ev.list[0].label === '「3학년 수학 3단원」 곱셈하기 100%' && !sv.students[2].ev, JSON.stringify(sv.students));
  }],
  ['단원평가: 복사·모두 복사는 평어 글만, 칸을 고치면 「고친 글」, 다시 열어도 근거', async () => {
    await page.click(`${V} [data-un="pyCopy"][data-no="1"]`);
    await page.waitForTimeout(150);
    assert(await clip() === '곱셈하기를 정확하게 해냄. 수업 시간에 늘 성실하게 참여함.', await clip());
    await page.click(`${V} [data-un="pyCopyAll"]`);
    await page.waitForTimeout(150);
    const all = await clip();
    assert(all.split('\n').length === 3 && !all.includes('근거'), all);
    assert(!(await page.textContent(`${V} [data-pyev="1"]`)).includes('고친 글'), '처음 쓴 글');
    await page.fill(`${V} textarea[data-py="1"]`, '곱셈하기를 정확하게 해내며 즐겁게 배움.');
    await page.dispatchEvent(`${V} textarea[data-py="1"]`, 'change');
    await page.waitForFunction(() => document.querySelector('[data-pyev="1"]').textContent.includes('고친 글 · 근거는 처음 쓴 글 기준이에요'));
    await page.reload(); await page.waitForTimeout(500); await goUnit();
    await page.click(`${V} [data-unv="results"]`); await page.click(`${V} [data-rv="pyeongeo"]`);
    await page.waitForSelector(`${V} [data-pyev="1"] .evd-btn`);
    assert((await page.textContent(`${V} [data-pyev="1"]`)).includes('고친 글'), '다시 열어도');
    assert(await page.locator(`${V} [data-pyev="2"] .evd`).count() === 0, '근거 없는 옛 평어는 그대로');
  }],
  ['단원평가: 390px 폭에서 근거를 펼쳐도 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    try {
      await page.waitForTimeout(200);
      for (const b of await page.$$(`${V} .evd-btn[aria-expanded="false"]`)) await b.click();
      assert(await page.locator(`${V} .evd-btn[aria-expanded="false"]`).count() === 0, '모두 펼침');
      assert(await noOverflow(`${V} .evd, ${V} .evd-src`), '넘침');
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],

  ['평가지 채점 평어: 요청에 학생마다 근거 목록(수준·요약·잘한 점·보완할 점)·근거 규칙, 답은 문장마다 src', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="gr"]');
    await page.waitForSelector('#grDrop');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#grDrop')]);
    await fc.setFiles([1, 2, 3].map(i => ({ name: `sheet-${i}.png`, mimeType: 'image/png', buffer: readFileSync(join(FIXTURES, `sheet-${i}.png`)) })));
    await page.waitForFunction(() => document.querySelector('#grSetup').textContent.includes('학생 3명'));
    await page.fill('#grTitle', '덧셈 서술형'); await page.dispatchEvent('#grTitle', 'input');
    await page.click('[data-gr="start"]');
    await page.waitForSelector('[data-gr="copyAll"]:not([disabled])', { timeout: 20000 });
    await page.waitForTimeout(900); // 저장(조금 미룸)
    const w = calls.filter(c => c.includes("'교과학습발달상황' 평어")).at(-1);
    assert(/^- 1번 \(80점\)\n  \[근거 목록\]\n  e1\) 수준 「상」으로 판정\n  e2\) 요약: 받아올림을 이해하고 풀이 과정을 차례대로 씀\.\n  e3\) 잘한 점: 꼼꼼하게 계산함\n  e4\) 보완할 점: 검산하기$/m.test(w), w.slice(-900));
    assert(w.includes('근거 목록에 있는 사실만 쓰고') && w.includes('"sentences"'), '규칙·답 모양');
  }],
  ['평가지 채점: 한 문장을 근거별로 나눠 와도 한 문장, 끝맺음을 고쳐도 근거는 맞음 · 「근거 2」 펼치기 · 「근거 없음」 · 예전 모양 답은 근거 없이', async () => {
    const g = await page.evaluate(() => { const ids = JSON.parse(localStorage.getItem('ssam:grs')); return JSON.parse(localStorage.getItem('ssam:gr:' + ids[0])); });
    const s1 = g.students.find(s => s.no === 1), s2 = g.students.find(s => s.no === 2), s3 = g.students.find(s => s.no === 3);
    assert(s1.text === '수의 크기를 비교하며 받아올림이 있는 덧셈을 바르게 계산함.' && s1.ev.sentences.map(x => x.t).join(' ') === s1.text, JSON.stringify(s1));
    assert(s1.ev.list.length === 4 && s2.ev.sentences[0].src.length === 0 && !s3.ev && s3.text, JSON.stringify([s2.ev, s3]));
    const row = id => `#grResults [data-grrow="${id}"]`;
    assert(await page.locator(`${row(s1.id)} .evd-btn`).count() === 2, '문장(부분)마다 단추');
    const b = page.locator(`${row(s1.id)} .evd-btn`).nth(1);
    assert((await b.textContent()).includes('근거 2'), await b.textContent());
    await b.click();
    const src = page.locator(`${row(s1.id)} .evd-src`).nth(1);
    assert(await b.getAttribute('aria-expanded') === 'true' && (await src.textContent()).includes('요약: 받아올림을 이해하고') && (await src.textContent()).includes('잘한 점: 꼼꼼하게 계산함'), await src.textContent());
    assert(!(await page.textContent(row(s1.id))).includes('고친 글'), '처음 쓴 글');
    assert((await page.textContent(`${row(s2.id)} .evd-none`)).includes('근거 없음'), '근거 없음');
    assert(await page.locator(`${row(s3.id)} .evd`).count() === 0, '예전 모양 답');
  }],
  ['평가지 채점: 평어를 눌러 복사·표로 복사·전체복사는 평어 글만', async () => {
    const g = await page.evaluate(() => { const ids = JSON.parse(localStorage.getItem('ssam:grs')); return JSON.parse(localStorage.getItem('ssam:gr:' + ids[0])); });
    const s1 = g.students.find(s => s.no === 1);
    await page.click(`#grResults [data-grcopy="${s1.id}"]`);
    await page.waitForTimeout(150);
    assert(await clip() === s1.text, await clip());
    await page.click('[data-gr="copyTable"]');
    await page.waitForTimeout(150);
    const tb = await clip();
    assert(tb.split('\n').length === 3 && !tb.includes('근거') && tb.startsWith(`1\t상\t${s1.text}`), tb);
    await page.click('[data-gr="copyAll"]');
    await page.waitForTimeout(200);
    const all = await clip();
    assert(all === g.students.slice().sort((a, b) => a.no - b.no).map(s => s.text).join('\n'), all);
  }],
  ['평가지 채점: 평어가 바뀐 기록을 다시 열면 「고친 글」(검토·대명사 고치기처럼)', async () => {
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:grs'))[0]);
    await page.evaluate(id => { const g = JSON.parse(localStorage.getItem('ssam:gr:' + id)); g.students.find(s => s.no === 1).text = '수의 크기를 비교하며 덧셈을 바르게 계산하는 모습을 보임.'; localStorage.setItem('ssam:gr:' + id, JSON.stringify(g)); }, id);
    await page.click(`[data-grhist="${id}"]`);
    await page.waitForFunction(() => [...document.querySelectorAll('#grResults .gr-row')].some(r => r.textContent.includes('고친 글 · 근거는 처음 쓴 글 기준이에요')));
    assert(await page.locator('#grResults .evd-btn').count() === 2 && await page.locator('#grResults .evd-none').count() === 1, '다시 열어도 근거');
  }],

  ['행동특성: 요청에 메모 조각 근거 목록(m1…, 날짜 앞머리 그대로, 이름 칸 없음)·근거 규칙, 답은 JSON', async () => {
    await page.click('#menuTabs [data-tab="hk"]');
    await page.click('[data-hkstu="a"]');
    await page.click('[data-hk="gen"]');
    await page.waitForSelector('#hkEditor .hk-res[data-ri="1"]');
    const p = calls.filter(c => c.includes("'행동특성 및 종합의견'을 쓰는")).at(-1);
    assert(p.includes('[근거 목록]\nm1) 1인 1역(우유 당번) 성실함\nm2) 친구를 잘 도와줌\nm3) [11. 6.] 토론에서 근거를 들어 반론함'), p);
    assert(p.includes('근거 목록에 있는 사실만 쓰고') && p.includes('{"results":[{"sentences"'), '규칙·답 모양');
  }],
  ['행동특성: 후보마다 문장별 「근거 n」·「근거 없음」, 펼치면 메모 조각, 눌러 복사·모두 복사는 글만', async () => {
    const r0 = '#hkEditor .hk-res[data-ri="0"]';
    assert(await page.locator(`${r0} .evd-btn`).count() === 3 && await page.locator(`${r0} .evd-none`).count() === 1, '단추 셋·근거 없음 하나');
    const b = page.locator(`${r0} .evd-btn`).nth(2);
    await b.click();
    assert(await b.getAttribute('aria-expanded') === 'true' && (await page.locator(`${r0} .evd-src`).nth(2).textContent()).includes('[11. 6.] 토론에서 근거를 들어 반론함'), '펼침');
    assert((await page.locator(`${r0} .evd-none`).textContent()).includes('앞으로 더 큰 성장이 기대됨.'), '근거 없는 문장');
    assert((await page.locator('#hkEditor .hk-res[data-ri="1"] .evd-btn').nth(1).textContent()).includes('근거 1'), '목록에 없는 m9는 뺌');
    await until(async () => (((await ls('ssam:hk')).students[0].results) || []).length === 2, 5000); // 저장(조금 미룸)
    const hk = await ls('ssam:hk'), r = hk.students[0].results[0];
    assert(r.ev && r.ev.sentences.length === 4 && r.t === HK_A.map(x => x[0]).join(' '), JSON.stringify(r).slice(0, 300));
    await page.click(`${r0} [data-pick="0"]`);
    await page.waitForTimeout(200);
    assert(await clip() === r.t, await clip());
    await page.click('[data-hk="copyAll"]');
    await page.waitForTimeout(200);
    assert(await clip() === `1\t${r.t}`, await clip());
  }],
  ['행동특성: [조금 짧게]도 근거를 다시 받고, 넘친 끝 문장은 잘려 근거에서도 빠짐', async () => {
    const n0 = calls.length;
    await page.click('#hkEditor [data-hkr="shorter"][data-i="0"]');
    await until(async () => calls.length > n0 && String((((await ls('ssam:hk')).students[0].results || [])[0] || {}).t).startsWith('우유 당번을'), 8000);
    const fp = calls.slice(n0).find(c => c.startsWith('아래 행동특성 및 종합의견을'));
    assert(fp.includes('[근거 목록]\nm1) ') && fp.includes('근거 목록에 있는 사실만 쓰고') && fp.includes('"sentences"'), fp);
    await page.waitForTimeout(700);
    const r = (await ls('ssam:hk')).students[0].results[0];
    assert(r.t === HK_SHORT.slice(0, 2).map(x => x[0]).join(' ') && r.ev.sentences.length === 2 && r.ev.sentences[1].src.join() === 'm2,m3', JSON.stringify(r));
    const r0 = '#hkEditor .hk-res[data-ri="0"]';
    assert(await page.locator(`${r0} .evd-btn`).count() === 2 && await page.locator(`${r0} .evd-none`).count() === 0, '잘린 문장은 빠짐');
  }],
  ['행동특성: [고치기]로 고치면 「고친 글」, 예전 모양 답(한 줄에 글 하나)은 근거 없이, AI 요청·저장한 근거에 이름 없음', async () => {
    await page.click('#hkEditor [data-hkr="edit"][data-i="1"]');
    await page.fill('#hkEditor [data-edit="1"]', '토론에서 근거를 들어 반론하는 모습이 돋보이며 생각을 차분하게 정리함. 맡은 우유 당번 일을 빠짐없이 해내어 친구들의 믿음을 얻고 어려운 친구를 먼저 챙김.');
    await page.dispatchEvent('#hkEditor [data-edit="1"]', 'input');
    await page.click('#hkEditor [data-hkr="edit"][data-i="1"]');
    await page.waitForFunction(() => document.querySelector('#hkEditor .hk-res[data-ri="1"]').textContent.includes('고친 글 · 근거는 처음 쓴 글 기준이에요'));
    assert(!(await page.textContent('#hkEditor .hk-res[data-ri="0"]')).includes('고친 글'), '고치지 않은 후보');
    await page.click('[data-hkstu="b"]');
    await page.click('[data-hk="gen"]');
    await page.waitForSelector('#hkEditor .hk-res[data-ri="1"]');
    assert(await page.locator('#hkEditor .evd').count() === 0, '예전 모양 답은 근거 없이');
    await until(async () => (((await ls('ssam:hk')).students[1].results) || []).length === 2, 5000);
    const hk = await ls('ssam:hk');
    assert(hk.students[1].results.map(r => r.t).join('\n') === HK_OLD.join('\n') && hk.students[1].results.every(r => !r.ev), JSON.stringify(hk.students[1].results));
    const sent = calls.join('\n'), saved = JSON.stringify(hk) + JSON.stringify(await page.evaluate(() => Object.keys(localStorage).filter(k => /^ssam:(gr:|unit:pyeongeo)/.test(k)).map(k => localStorage.getItem(k)).join('')));
    assert(NAMES.every(n => !sent.includes(n)), '요청에 이름');
    assert(!JSON.stringify(hk.students.map(s => s.results.map(r => r.ev))).match(/김하늘|이바다/), '근거에 이름');
    assert(saved.includes('[11. 6.] 토론에서 근거를 들어 반론함'), '저장');
  }],
  ['행동특성: 390px 폭에서도 가로로 넘치지 않음', async () => {
    await page.click('[data-hkstu="a"]');
    await page.setViewportSize({ width: 390, height: 800 });
    try {
      await page.waitForTimeout(250);
      for (const b of await page.$$('#hkEditor .evd-btn[aria-expanded="false"]')) await b.click();
      assert(await page.locator('#hkEditor .evd-btn[aria-expanded="false"]').count() === 0, '모두 펼침');
      assert(await noOverflow('#hkEditor .evd, #hkEditor .evd-src'), '넘침');
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
