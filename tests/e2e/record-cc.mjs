// 생활기록부 글 쓰기 틀 — 창의적 체험활동 한 명씩(스펙 2026-11-14-eval-redesign §6): 영역마다 학생 글을 활동 문장으로, 근거는 활동(이름 — 내용)·학습지에서 읽은 내용(AI 없이 맞춤).
// 활동이 바뀐 문장은 주황 + [다시 쓰기](지금 다시 쓰기와 같은 길), 기재 점검에 걸린 문장은 [고치기](AI 한 문장)·[문장 빼기], 아직 안 쓴 활동은 [이 근거로 문장 더하기].
// 지금 목록(모두 보기)은 그대로 처음 화면. 글은 모두 지어낸 것(번호만)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const SIG = '자석 팽이 만들기|극의 성질로 팽이를 만듦';
await page.addInitScript(SIG => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 4, except: [] }));
  localStorage.setItem('ssam:cc', JSON.stringify({ areas: {
    auto: { acts: [{ id: 'a1', name: '', desc: '' }], items: {} },
    club: { club: '과학탐구반', acts: [{ id: 'c1', name: '자석 팽이 만들기', desc: '극의 성질로 팽이를 만듦' }, { id: 'c2', name: '실험 기록', desc: '결과를 표로 정리함' }, { id: 'c3', name: '전기 회로 놀이', desc: '' }], items: {
      1: { parts: { c1: { t: '자석 팽이를 설계하며 극의 성질을 탐구함.', sig: SIG }, c2: { t: '수업 시간에 산만함.', sig: '실험 기록|결과를 표로 정리함' } }, obs: { c1: { n: '팽이 축을 짧게 바꿨다고 씀' } }, d: 0 },
      2: { parts: { c1: { t: '자석 팽이를 친구와 함께 만들며 협력함.', sig: '자석 팽이 만들기|예전 내용' } }, d: 1 },
      4: { parts: { c1: { t: '방과 후 과학 학원에서 배운 방법으로 팽이를 만듦.', sig: SIG }, c3: { t: '전기 회로를 만들며 불이 켜지는 까닭을 탐구함.', sig: '전기 회로 놀이|' } }, d: 0 } } },
    career: { acts: [{ id: 'r1', name: '', desc: '' }], items: {} } }, len: 'mid', grade: 3 }));
}, SIG);
const calls = [];
await mockClaude(page, ({ prompt }) => {
  calls.push(prompt);
  if (prompt.startsWith('[생기부 문장 하나]')) return JSON.stringify({ t: '실험 결과를 표로 꼼꼼히 정리하며 집중함.', src: ['e3'] });
  const n = +((/서로 다른 학생 (\d+)명/.exec(prompt) || [])[1] || 1);
  return Array.from({ length: n }, () => `활동에 즐겁게 참여하며 ${['협력', '탐구', '배려', '성찰', '실천', '책임', '도전', '집중'][calls.length % 8]}하는 태도를 보임 ${calls.length}번째.`).join('\n');
});
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const cc = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:cc')));
const F = '#ccResults .cc-frame';

await page.goto(url); await page.waitForTimeout(400);
await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'cc');
await page.waitForSelector('#ccResults [data-ccview="club"]');
await page.click('#ccResults [data-ccview="club"]');

await run('record-cc', [
  ['처음은 지금 목록(모두 보기), [한 명씩 근거와] → 틀: 학생 목록(고칠 곳·다 씀·아직)', async () => {
    assert(await page.locator('#ccResults .cc-list').count() === 1 && await page.locator(F).count() === 0, '처음 화면');
    await page.click('#ccResults [data-cclayout="one"]');
    await page.waitForSelector(F);
    const st = await page.$$eval(`${F} .rw-stu`, els => els.map(e => `${e.querySelector('.rw-no').textContent} ${e.querySelector('.st').textContent}`));
    assert(st[0] === '1번 부정 표현' && st[1] === '2번 활동이 바뀜' && st[2] === '3번 아직' && st[3] === '4번 쓰면 안 되는 말', JSON.stringify(st));
  }],
  ['문장마다 근거: 활동(이름 — 내용)·학습지 읽은 내용 번호, 오른쪽 근거 목록과 아직 안 쓴 활동', async () => {
    const rows = await page.$$eval(`${F} .rw-art .evd-row`, els => els.map(e => [e.classList.contains('evd-bad'), (e.querySelector('.evd-btn, .evd-no') || {}).textContent || '', (e.querySelector('.evd-why') || {}).textContent || '']));
    assert(rows.length === 2 && rows[0][1].includes('근거 1·2') && rows[1][1].includes('근거 3'), JSON.stringify(rows));
    assert(!rows[0][0] && rows[1][0] && rows[1][2].includes('성장 중심'), JSON.stringify(rows));
    const side = (await page.textContent(`${F} .rw-side`)).replace(/\s+/g, ' ');
    assert(side.includes('자석 팽이 만들기 — 극의 성질로 팽이를 만듦') && side.includes('팽이 축을 짧게 바꿨다고 씀') && side.includes('아직 안 쓴 근거') && side.includes('전기 회로 놀이'), side);
    assert((await page.textContent(`${F} .rw-head`)).includes('(과학탐구반) 앞에 붙어요'), '동아리 이름');
  }],
  ['기재 점검에 걸린 문장 [고치기] → AI 한 문장(근거 목록·이름 없이)으로 그 활동 문장만, 사용함 표시는 지움', async () => {
    const n = calls.length;
    await page.click(`${F} .evd-row:nth-child(2) [data-ccrow="fix"]`);
    await until(async () => (await cc()).areas.club.items[1].parts.c2.t === '실험 결과를 표로 꼼꼼히 정리하며 집중함.');
    const p = calls.slice(n).find(c => c.startsWith('[생기부 문장 하나]'));
    assert(p.includes('창의적 체험활동') && p.includes('e1) 자석 팽이 만들기 — 극의 성질로 팽이를 만듦') && !/\d+번/.test(p), p);
    assert((await cc()).areas.club.items[1].parts.c2.sig === '실험 기록|결과를 표로 정리함', '활동 열쇠는 그대로');
  }],
  ['활동이 바뀐 학생: 주황 + [다시 쓰기]는 지금 다시 쓰기와 같은 길(사용함 지우고 그 학생만)', async () => {
    await page.click(`${F} [data-ccsel="2"]`);
    await page.waitForSelector(`${F} .rw-art[data-ccno="2"]`);
    const why = await page.textContent(`${F} .evd-row .evd-why`);
    assert(why.includes('활동 내용이 바뀌었어요'), why);
    await page.click(`${F} .evd-row [data-ccre="2"]`);
    await until(async () => (await cc()).areas.club.items[2].parts.c2 && (await cc()).areas.club.items[2].d === 0, 8000);
  }],
  ['[문장 빼기]: 기재 점검에 걸린 활동 문장을 빼고(남은 학생 쓰기로 다시 씀), [다음 학생]', async () => {
    await page.click(`${F} [data-ccsel="4"]`);
    await page.waitForSelector(`${F} .rw-art[data-ccno="4"]`);
    assert(await page.locator(`${F} .evd-row:nth-child(2) [data-ccrow]`).count() === 0, '고칠 곳이 아닌 문장에 단추');
    await page.click(`${F} .evd-row:nth-child(1) [data-ccrow="del"]`);
    await until(async () => !(await cc()).areas.club.items[4].parts.c1);
    assert((await cc()).areas.club.items[4].parts.c3, '다른 활동 문장은 그대로');
    await page.click(`${F} [data-ccsel="1"]`);
    await page.click(`${F} [data-ccnext]`);
    await page.waitForSelector(`${F} .rw-art[data-ccno="2"]`);
  }],
  ['아직 안 쓴 근거 [이 근거로 문장 더하기] → 그 학생 글을 활동마다 씀(지금 쓰기와 같은 길)', async () => {
    await page.click(`${F} [data-ccsel="3"]`);
    await page.waitForSelector(`${F} .rw-art[data-ccno="3"]`);
    assert((await page.textContent(`${F} .rw-art`)).includes('아직 쓰지 않았어요'), '빈 학생');
    await page.click(`${F} [data-ccre="3"]`);
    await until(async () => { const it = (await cc()).areas.club.items[3]; return it && it.parts && Object.keys(it.parts).length === 3; }, 8000);
  }],
  ['390px: 한 명씩 화면이 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await page.evaluate(() => { const v = document.querySelector('#ccView'); v.classList.add('show-pane'); });
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => { const W = document.documentElement.clientWidth; return { over: document.documentElement.scrollWidth - W, bad: [...document.querySelectorAll('#ccResults .cc-frame *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > W + 1).map(e => e.className).slice(0, 3) }; });
      assert(r.over <= 0 && !r.bad.length, JSON.stringify(r));
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
