// 평가지 채점 확인 — 판단을 미룬 것만 하나씩(스펙 2026-11-14-eval-redesign §4).
// 볼 학생은 한눈에 「선생님 차례」 규칙(알아보기 어려움·점수 두 의견·평어 검토), 정하기는 결과 화면과 같은 저장(수준·검토 점수·고친 평어),
// ← → 는 화면 안에 초점이 있을 때만, 다 보면 「다 확인했어요」, SSAM.gr.review(id)로 한눈에서 엶. 글은 모두 지어낸 것(번호만)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const ST = [
  { id: 's1', no: 1, n: 1, skip: 0, score: 92, level: 'top', manual: 0, summary: '극의 이름과 함께 씀.', evidence: [], strengths: '-', improve: '-', unreadable: 0, text: '자석의 성질을 극의 이름과 함께 정확하게 설명함.', d: 0 },
  { id: 's2', no: 2, n: 1, skip: 0, score: 64, level: 'mid', manual: 0, summary: '같은 쪽끼리 붙이면 밀어낸다고 씀.', evidence: ['같은 쪽끼리 붙이면 밀어낸다'], strengths: '밀어내는 성질을 앎', improve: '극의 이름 쓰기', unreadable: 0, rv: { score: 82, summary: '같은 극은 밀어내고 다른 극은 끌어당긴다고 씀.' }, text: '자석이 서로 밀어내는 까닭을 설명함.', d: 0 },
  { id: 's3', no: 3, n: 1, skip: 0, score: 40, level: 'low', manual: 0, summary: '글씨가 흐려 일부만 읽힘.', evidence: [], strengths: '-', improve: '까닭 쓰기', unreadable: 1, text: '자석이 밀어내는 모습을 보고 까닭을 찾으려 노력함.', d: 0 },
  { id: 's4', no: 4, n: 1, skip: 0, score: 78, level: 'high', manual: 0, summary: '다른 극끼리 끌어당긴다고 씀.', evidence: [], strengths: '-', improve: '-', unreadable: 0, text: '다른 극끼리 끌어당기는 성질을 설명함.', d: 0 },
  { id: 's5', no: 5, n: 1, skip: 0, score: 70, level: 'mid', manual: 0, summary: '밀어낸다고 씀.', evidence: [], strengths: '-', improve: '-', unreadable: 0, text: '자석의 성질을 이해하는 모습을 보임.', trv: { problem: '평가 내용이 드러나지 않아요', fix: '같은 극끼리 밀어내는 자석의 성질을 실험으로 확인함.' }, d: 0 },
  { id: 's6', no: 6, n: 1, skip: 1, score: 50, level: 'low', manual: 0, summary: '', evidence: [], strengths: '-', improve: '-', unreadable: 1, text: '', d: 0 }
];
await page.addInitScript(st => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
  localStorage.setItem('ssam:grs', JSON.stringify(['g1', 'g2']));
  localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '자석의 성질', unitId: '', criteria: '', critDocs: [], createdAt: 2, settings: { maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students: st }));
  localStorage.setItem('ssam:gr:g2', JSON.stringify({ kind: 'gr', title: '확인할 것 없음', unitId: '', criteria: '', critDocs: [], createdAt: 1, settings: { maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students: [st[0]] }));
}, ST);
await page.route('https://api.anthropic.com/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '[]' } }) + '\n\n' }));
const rec = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:gr:' + id)), id);
const stu = async no => (await rec('g1')).students.find(s => s.no === no);
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 80)); } };
const V = '#grResults .gr-rvw';
const items = () => page.$$eval(`${V} .ev-rv-item`, els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const cur = () => page.$eval(`${V} .ev-rv-item[aria-current="true"]`, e => e.textContent.replace(/\s+/g, ' ').trim());

await page.goto(url); await page.waitForTimeout(400);
await page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), 'gr');
await page.waitForSelector('[data-grhist="g1"]');

await run('record-gr-review', [
  ['결과 위 「선생님 차례 n개」 띠 → [확인할 것만 보기]: 판단을 미룬 것만(채점에서 뺀 학생·확인할 것 없는 학생은 빼고)', async () => {
    await page.click('[data-grhist="g1"]');
    await page.waitForSelector('#grResults .gr-turn');
    assert((await page.textContent('#grResults .gr-turn')).includes('선생님 차례 3개'), await page.textContent('#grResults .gr-turn'));
    await page.click('#grResults [data-grrv="open"]');
    await page.waitForSelector(V);
    assert(JSON.stringify(await items()) === JSON.stringify(['2번 · 점수 다시 보기', '3번 · 알아보기 어려움', '5번 · 평어 검토']), JSON.stringify(await items()));
    assert(await page.$eval('#grView', e => e.classList.contains('rvw')) && !(await page.isVisible('#grSetup')), '설정 칸을 접고 결과 칸 전체');
    assert((await page.textContent(`${V} .gr-rvw-head`)).includes('「자석의 성질」 채점 확인') && (await page.textContent(`${V} .gr-rvw-head`)).includes('판단을 미룬 것 3개'), await page.textContent(`${V} .gr-rvw-head`));
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('.ev-rv-item[aria-current="true"]'), null, { timeout: 2000 }); // 지금 칸에 초점
  }],
  ['점수 두 의견: 채점 AI(쌤비서 생각) · 검토 AI, [64점으로 정하기] → 검토 의견을 그대로 둠으로 저장, 다음 것으로', async () => {
    assert((await cur()).startsWith('2번'), await cur());
    const opts = await page.$$eval(`${V} .ev-rv-opt`, els => els.map(e => [e.classList.contains('ai'), e.textContent.replace(/\s+/g, ' ').trim()]));
    assert(opts.length === 2 && opts[0][0] && opts[0][1].includes('64') && opts[0][1].includes('쌤비서 생각') && opts[1][1].includes('82'), JSON.stringify(opts));
    assert((await page.textContent(`${V} .ev-rv-answer`)).includes('같은 쪽끼리 붙이면 밀어낸다고 씀.'), '읽은 내용');
    assert((await page.textContent(`${V} .gr-rvw-think`)).includes('10점 넘게'), '왜 미뤘나요');
    await page.click(`${V} .gr-rvw-btns .ev-turn-btn`);
    await until(async () => (await stu(2)).rv && (await stu(2)).rv.done === 'main', 3000);
    assert((await stu(2)).score === 64, '점수 그대로');
    assert((await cur()).startsWith('3번'), await cur());
    assert((await items())[0].includes('정함'), '정한 칸 표시');
  }],
  ['← → 는 화면 안에 초점이 있을 때만(밖에서는 움직이지 않음)', async () => {
    await page.focus(`${V} .ev-rv-item[aria-current="true"]`);
    await page.keyboard.press('ArrowRight');
    assert((await cur()).startsWith('5번'), await cur());
    await page.keyboard.press('ArrowLeft');
    assert((await cur()).startsWith('3번'), await cur());
    await page.evaluate(() => { document.activeElement.blur(); document.body.focus(); });
    await page.keyboard.press('ArrowRight');
    assert((await cur()).startsWith('3번'), '밖에서 움직임');
  }],
  ['알아보기 어려움: 수준 기준(지금 수준이 쌤비서 생각) → [하(으)로 정하기]는 직접 정함으로 저장(평어는 그대로)', async () => {
    const opts = await page.$$eval(`${V} .ev-rv-opt`, els => els.map(e => [e.dataset.grrvPick, e.classList.contains('ai')]));
    assert(JSON.stringify(opts) === JSON.stringify([['top', false], ['high', false], ['mid', false], ['low', true]]), JSON.stringify(opts));
    assert((await page.textContent(`${V} .gr-rvw-sub`)).includes('스캔은 저장하지 않아서'), '지난 기록은 스캔 없음');
    await page.click(`${V} .gr-rvw-btns .ev-turn-btn`);
    await until(async () => (await stu(3)).manual === 1, 3000);
    const s = await stu(3);
    assert(s.level === 'low' && s.text === ST[2].text && !s.stale, JSON.stringify(s));
    assert((await cur()).startsWith('5번'), await cur());
  }],
  ['평어 검토: [고친 평어 쓰기] → 평어가 고친 글로(의견은 고름), 모두 보면 「다 확인했어요」 → [결과 보기]에서 띠가 사라짐', async () => {
    assert((await page.textContent(`${V} .gr-rvw-think`)).includes('평가 내용이 드러나지 않아요'), '검토 의견');
    await page.click(`${V} .gr-rvw-btns .gr-rvw-alt`);
    await until(async () => (await stu(5)).text === ST[4].trv.fix, 3000);
    assert((await stu(5)).trv.done === 'review', JSON.stringify((await stu(5)).trv));
    await page.waitForSelector(`${V} .gr-rvw-end`);
    assert((await page.textContent(`${V} .gr-rvw-end`)).includes('다 확인했어요'), '끝');
    await page.click(`${V} .gr-rvw-end [data-grrv="close"]`);
    await page.waitForSelector('#grResults .gr-list');
    assert(!(await page.$('#grResults .gr-turn')) && !(await page.$eval('#grView', e => e.classList.contains('rvw'))), '띠·접힘이 남음');
  }],
  ['SSAM.gr.review(id): 다른 기록을 열어 확인 화면으로, 확인할 것이 없으면 false', async () => {
    await page.evaluate(async () => {
      const g = JSON.parse(localStorage.getItem('ssam:gr:g1'));
      g.students.find(s => s.no === 4).unreadable = 1;
      localStorage.setItem('ssam:gr:g1', JSON.stringify(g));
    });
    assert(await page.evaluate(() => window.SSAM.gr.review('g2')) === false, '확인할 것 없는 기록');
    assert(await page.evaluate(() => window.SSAM.gr.review('g1')) === true, '열림');
    await page.waitForSelector(V);
    assert(JSON.stringify(await items()) === JSON.stringify(['4번 · 알아보기 어려움']), JSON.stringify(await items()));
  }],
  ['390px: 확인 화면이 가로로 넘치지 않음, 누르는 칸 44px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    try {
      await page.waitForTimeout(250);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const bad = [...document.querySelectorAll('#grResults .gr-rvw *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > W + 1).length;
        const small = [...document.querySelectorAll('#grResults .gr-rvw button')].filter(b => b.getClientRects().length && b.getBoundingClientRect().height < 44).length;
        return { over: document.documentElement.scrollWidth - W, bad, small };
      });
      assert(r.over <= 0 && !r.bad && !r.small, JSON.stringify(r));
    } finally { await page.setViewportSize({ width: 1280, height: 860 }); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
