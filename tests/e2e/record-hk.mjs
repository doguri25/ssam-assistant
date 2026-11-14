// 생활기록부 글 쓰기 틀 — 행동특성(스펙 2026-11-14-eval-redesign §6): 왼쪽 학생 목록(다 씀·초안·고칠 곳) ·
// 가운데 그 학생 글(문장마다 근거 칩, 근거 없음·기재 점검에 걸린 문장은 주황 + [고치기]·[문장 빼기]) · 글자 수·[AI로 다시 쓰기]·[나이스 차례로 복사]·[다음 학생] ·
// 오른쪽 근거(쓴 문장 번호) + 아직 안 쓴 근거 + [이 근거로 문장 더하기](AI 한 문장, 이름 없이). 메모·특성 단추·설정은 그대로. 글은 모두 지어낸 것(번호만)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
const L1 = [['m1', '[11. 14.] 넘어진 친구를 보건실에 데려감'], ['m2', '[11. 6.] 청소 구역을 끝까지 정리함'], ['m3', '[10. 22.] 발표 순서를 친구에게 양보함']].map(([id, label]) => ({ id, kind: 'memo', label }));
const A1 = '넘어진 친구를 보건실에 데려가는 등 어려움을 겪는 친구를 먼저 살핌.', A2 = '맡은 청소 구역을 끝까지 정리하며 책임감 있게 행동함.';
const B1 = '맡은 일을 성실하게 해내며 책임감이 강함.', B2 = '김하늘은 방과 후 수학 학원에서 익힌 풀이 방법을 수업에 활용함.', B3 = '앞으로 더 큰 성장이 기대됨.';
await page.addInitScript(([L1, A1, A2, B1, B2, B3]) => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
  localStorage.setItem('ssam:hk', JSON.stringify({ settings: { unit: 'char', min: 40, max: 300, variants: 2, ending: 'eum', grade: 3 }, students: [
    { id: 'h1', no: 1, label: '', memo: '[11. 14.] 넘어진 친구를 보건실에 데려감\n[11. 6.] 청소 구역을 끝까지 정리함\n[10. 22.] 발표 순서를 친구에게 양보함', done: 0,
      results: [{ t: `${A1} ${A2}`, d: 0, ev: { list: L1, sentences: [{ t: A1, src: ['m1'] }, { t: A2, src: ['m2'] }] } }, { t: '친구를 먼저 살피고 맡은 일을 끝까지 해내는 책임감이 돋보이는 모습을 보임.', d: 0 }] },
    { id: 'h2', no: 2, label: '', memo: '성실함, 책임감 강함, 수학 학원', done: 1,
      results: [{ t: `${B1} ${B2} ${B3}`, d: 1, ev: { list: [{ id: 'm1', kind: 'memo', label: '성실함' }, { id: 'm2', kind: 'memo', label: '책임감 강함' }, { id: 'm3', kind: 'memo', label: '수학 학원' }],
        sentences: [{ t: B1, src: ['m1', 'm2'] }, { t: B2, src: ['m3'] }, { t: B3, src: [] }] } }] },
    { id: 'h3', no: 3, label: '', memo: '', done: 0, results: [] }] }));
}, [L1, A1, A2, B1, B2, B3]);
const calls = [];
await mockClaude(page, ({ prompt }) => {
  calls.push(prompt);
  if (!prompt.startsWith('[생기부 문장 하나]')) return '[]';
  if (prompt.includes('[쓸 근거]')) return JSON.stringify({ t: '발표 순서를 친구에게 기꺼이 양보하는 배려를 보임.', src: ['m3'] });
  return JSON.stringify({ t: '수학 시간에 익힌 풀이 방법을 꾸준히 활용함.', src: ['m3'] });
});
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const hk = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:hk')));
const stuText = () => page.$$eval('#hkList .rw-stu', els => els.map(e => `${e.querySelector('.rw-no').textContent} ${e.querySelector('.st').textContent.trim()}`));
const E = '#hkEditor';

await page.goto(url); await page.waitForTimeout(400);
await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'hk');
await page.waitForSelector('#hkList .rw-stu');

await run('record-hk', [
  ['왼쪽 학생 목록: 번호 · 초안 / 고칠 곳 n / 메모 없음, 위에 「다 씀 n / 전체 · 고칠 곳 n」', async () => {
    assert(JSON.stringify(await stuText()) === JSON.stringify(['1번 초안', '2번 고칠 곳 2', '3번 메모 없음']), JSON.stringify(await stuText()));
    const head = (await page.textContent('#hkList .rw-lh')).replace(/\s+/g, ' ');
    assert(head.includes('다 씀 1 / 3') && head.includes('고칠 곳 1'), head);
    const h = await page.$$eval('#hkList .rw-stu', els => Math.min(...els.map(e => e.getBoundingClientRect().height)));
    assert(h >= 44, '누르는 칸 ' + h);
  }],
  ['가운데: 문장마다 근거 칩(목록 번호), 근거 없음·사교육·이름은 주황 + 까닭 + [고치기]·[문장 빼기], 아래 글자 수·단추', async () => {
    await page.click('[data-hkstu="h2"]');
    await page.waitForSelector(`${E} .rw-art .evd-row`);
    const rows = await page.$$eval(`${E} .rw-art .evd-row`, els => els.map(e => ({ bad: e.classList.contains('evd-bad'), chip: (e.querySelector('.evd-btn, .evd-no') || {}).textContent || '', why: (e.querySelector('.evd-why') || {}).textContent || '' })));
    assert(rows.length === 3 && !rows[0].bad && rows[0].chip.includes('근거 1·2'), JSON.stringify(rows[0]));
    assert(rows[1].bad && rows[1].why.includes('사교육') && rows[1].why.includes('이름'), JSON.stringify(rows[1]));
    assert(rows[2].bad && rows[2].chip.includes('근거 없음') && rows[2].why.includes('근거가 없어요'), JSON.stringify(rows[2]));
    assert(await page.locator(`${E} [data-hkrow="fix"]`).count() === 2 && await page.locator(`${E} [data-hkrow="del"]`).count() === 2, '고칠 문장에만 단추');
    const foot = (await page.textContent(`${E} .rw-foot`)).replace(/\s+/g, ' ');
    assert(/\d+ \/ 300자/.test(foot) && foot.includes('AI로 다시 쓰기') && foot.includes('나이스 차례로 복사') && foot.includes('다음 학생 3번'), foot);
    const side = (await page.textContent(`${E} .rw-side`)).replace(/\s+/g, ' ');
    assert(side.includes('2번의 근거') && side.includes('문장 1에 씀') && side.includes('문장 2에 씀'), side);
    assert((await page.textContent(`${E} .hk-top .badge`)).trim() === '2', '번호');
  }],
  ['[고치기]: AI에 그 문장·까닭·메모 근거만(이름은 가림·번호 없음) → 문장이 바뀌고 근거도, 고른 글 표시는 지움', async () => {
    const n = calls.length;
    await page.click(`${E} .evd-row:nth-child(2) [data-hkrow="fix"]`);
    await until(async () => ((await hk()).students[1].results[0].t || '').includes('수학 시간에 익힌'));
    const p = calls.slice(n).find(c => c.startsWith('[생기부 문장 하나]'));
    assert(p.includes('[고칠 문장]') && p.includes('[근거 목록]\nm1) 성실함') && p.includes('사교육'), p);
    assert(!p.includes('김하늘') && !/\d+번/.test(p), '이름·번호가 감');
    const r = (await hk()).students[1].results[0];
    assert(r.t === `${B1} 수학 시간에 익힌 풀이 방법을 꾸준히 활용함. ${B3}` && r.ev.sentences[1].src.join() === 'm3' && r.d === 0, JSON.stringify(r));
    assert((await hk()).students[1].done === 0, '학생 다 씀 표시가 남음');
  }],
  ['[문장 빼기]: 그 문장을 빼고 근거 문장도 함께(AI 없이)', async () => {
    const n = calls.length;
    await page.click(`${E} .evd-row:nth-child(3) [data-hkrow="del"]`);
    await until(async () => (await hk()).students[1].results[0].ev.sentences.length === 2);
    const r = (await hk()).students[1].results[0];
    assert(r.t === `${B1} 수학 시간에 익힌 풀이 방법을 꾸준히 활용함.` && calls.length === n, JSON.stringify(r));
    assert(await page.locator(`${E} .rw-art .evd-bad`).count() === 0, '고칠 곳이 남음');
  }],
  ['오른쪽 「아직 안 쓴 근거」 → [이 근거로 문장 더하기]: 끝에 한 문장(근거 번호), 요청에 그 근거·지금 글', async () => {
    await page.click('[data-hkstu="h1"]');
    await page.waitForSelector(`${E} .rw-spare [data-hkadd="m3"]`);
    const n = calls.length;
    await page.click(`${E} .rw-spare [data-hkadd="m3"]`);
    await until(async () => (await hk()).students[0].results[0].ev.sentences.length === 3);
    const p = calls.slice(n).find(c => c.startsWith('[생기부 문장 하나]'));
    assert(p.includes('[쓸 근거] m3) [10. 22.] 발표 순서를 친구에게 양보함') && p.includes(`[글] ${A1}`), p);
    const r = (await hk()).students[0].results[0];
    assert(r.t.endsWith('발표 순서를 친구에게 기꺼이 양보하는 배려를 보임.') && r.ev.sentences[2].src.join() === 'm3', JSON.stringify(r));
    await page.waitForFunction(() => !document.querySelector('#hkEditor .rw-spare'));
  }],
  ['다른 후보는 아래 작게 → 누르면 가운데로, [다음 학생]으로 다음 번호', async () => {
    assert(await page.locator(`${E} .rw-alt [data-hkcand="1"]`).count() === 1, '다른 후보');
    await page.click(`${E} .rw-alt [data-hkcand="1"]`);
    await page.waitForSelector(`${E} .rw-art[data-ri="1"]`);
    assert(await page.locator(`${E} .rw-art .evd-btn`).count() === 0, '근거를 맞추지 않은 옛 글은 칩 없음');
    assert((await page.textContent(`${E} .rw-side`)).includes('근거를 맞추지 않았어요'), '안내');
    await page.click(`${E} [data-hk="next"]`);
    await page.waitForFunction(() => document.querySelector('#hkList [aria-current="true"]').dataset.hkstu === 'h2');
  }],
  ['메모·특성 단추·[특성 더하기]는 그대로: 특성을 누르면 메모에 들어가고 머리 칩에 보임', async () => {
    await page.click('[data-hkstu="h3"]');
    await page.waitForSelector('#hkMemo');
    assert(await page.locator(`${E} [data-hk="gen"]`).count() === 1 && (await page.textContent(`${E} .rw-art`)).includes('행특 만들기'), '글이 없으면 만들기');
    await page.click(`${E} [data-kw="성실함"]`);
    await page.waitForFunction(() => document.querySelector('#hkMemo').value === '성실함');
    assert((await page.textContent(`${E} .rw-chips`)).includes('성실함'), '머리 칩');
    await page.click(`${E} [data-hk="traits"]`);
    await page.waitForFunction(() => document.activeElement && !!document.activeElement.closest('.kw-groups'));
  }],
  ['[나이스 차례로 복사](웹): 번호순으로 학생마다 지금 글 한 줄씩, 넣은 글은 다 씀', async () => {
    await page.click(`[data-hkstu="h1"]`);
    await page.click(`${E} [data-hk="neis"]`);
    await page.waitForTimeout(900); // 저장(조금 미룸)
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    const h = await hk();
    assert(clip.split('\n').length === 3 && clip.split('\n')[0] === h.students[0].results[1].t && clip.split('\n')[2] === '', JSON.stringify(clip));
    assert(h.students[0].done === 1 && h.students[0].results[1].d === 1 && h.students[1].done === 1, '다 씀');
  }],
  ['390px: 학생 목록·글·근거가 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await page.evaluate(() => window.SSAM.hk.select(2));
      await page.waitForTimeout(250);
      assert(await page.isVisible('#hkEditor .rw-art'), '글이 보임');
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('#hkEditor *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > W + 1).map(e => e.className).slice(0, 3);
        return { over: document.documentElement.scrollWidth - W, bad };
      });
      assert(r.over <= 0 && !r.bad.length, JSON.stringify(r));
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
