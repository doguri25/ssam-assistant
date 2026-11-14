// 버그 사냥 11.14 — 기재 점검 [그 글로 가기]·[학생 번호 칩]이 그 학생 글을 보여 주는지(창체 한 명씩·평가지 채점 확인 화면). 글은 모두 지어낸 것(번호만)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const SIG = '자석 팽이 만들기|극의 성질로 팽이를 만듦';
const GRS = [
  { id: 's1', no: 1, n: 1, skip: 0, score: 92, level: 'top', manual: 0, summary: '극의 이름과 함께 씀.', evidence: [], strengths: '-', improve: '-', unreadable: 0, text: '자석의 성질을 극의 이름과 함께 정확하게 설명함.', d: 0 },
  { id: 's2', no: 2, n: 1, skip: 0, score: 40, level: 'low', manual: 0, summary: '글씨가 흐려 일부만 읽힘.', evidence: [], strengths: '-', improve: '-', unreadable: 1, text: '자석이 밀어내는 모습을 보고 까닭을 찾으려 노력함.', d: 0 },
  { id: 's3', no: 3, n: 1, skip: 0, score: 70, level: 'mid', manual: 0, summary: '밀어낸다고 씀.', evidence: [], strengths: '-', improve: '-', unreadable: 0, text: '과학 학원에서 배운 실험으로 자석의 성질을 설명함.', d: 0 }
];
const PLAN = { kind: 'plan', title: '2학기 평가계획', grade: 3, source: '', createdAt: 1, subjects: [{ name: '국어', units: [
  { id: 'u1', subject: '국어', period: '', std: '[4국05-02] 작품을 감상한다.', unit: '1. 이야기', area: '문학', elem: '인물의 마음 짐작하기', focus: '', crit: { top: '', high: '잘 짐작함', mid: '짐작함', low: '도움을 받아 짐작함' } }] }] };
await page.addInitScript(([SIG, GRS, PLAN]) => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('ssam:mig:pron', '1');
  localStorage.setItem('ssam:plan:P1', JSON.stringify(PLAN)); localStorage.setItem('ssam:plans', JSON.stringify(['P1'])); localStorage.setItem('ssam:prefs', JSON.stringify({ current: 'P1' }));
  localStorage.setItem('ssam:sets:P1', JSON.stringify({ u1_high: { items: [{ t: '이야기 속 인물의 마음을 헤아려 자신의 경험과 견주어 말함.', d: 0 }, { t: '토익 공부를 꾸준히 하여 영어 어휘를 넓힘.', d: 0 }], want: 50 } }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 4, except: [] }));
  localStorage.setItem('ssam:cc', JSON.stringify({ areas: {
    auto: { acts: [{ id: 'a1', name: '', desc: '' }], items: {} },
    club: { club: '과학탐구반', acts: [{ id: 'c1', name: '자석 팽이 만들기', desc: '극의 성질로 팽이를 만듦' }], items: {
      1: { parts: { c1: { t: '자석 팽이를 설계하며 극의 성질을 탐구함.', sig: SIG } }, d: 0 },
      4: { parts: { c1: { t: '방과 후 과학 학원에서 배운 방법으로 팽이를 만듦.', sig: SIG } }, d: 0 } } },
    career: { acts: [{ id: 'r1', name: '', desc: '' }], items: {} } }, len: 'mid', grade: 3 }));
  localStorage.setItem('ssam:grset', JSON.stringify({ maskOn: false, mask: [] }));
  localStorage.setItem('ssam:grs', JSON.stringify(['g1']));
  localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '자석의 성질', unitId: '', criteria: '', critDocs: [], createdAt: 2, settings: { maskOn: false, mask: [], ratio: { top: 10, high: 30, mid: 40, low: 20 } }, students: GRS }));
}, [SIG, GRS, PLAN]);
await page.route('https://api.anthropic.com/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'data: ' + JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '[]' } }) + '\n\n' }));
const go = tab => page.evaluate(t => import('./core/shell.js').then(s => s.go('evaluate', t)), tab);

await page.goto(url); await page.waitForTimeout(400);

await run('fix1114-check', [
  ['창체를 「한 명씩 근거와」로 보다가 기재 점검 [그 글로 가기] → 그 학생(4번) 글을 보여 줌', async () => {
    await go('cc');
    await page.waitForSelector('#ccResults [data-ccview="club"]');
    await page.click('#ccResults [data-ccview="club"]');
    await page.click('#ccResults [data-cclayout="one"]');
    await page.waitForSelector('#ccResults .cc-frame [data-ccsel="1"]');
    await page.click('#ccResults .cc-frame [data-ccsel="1"]');
    await go('check');
    const ref = '[data-chk-ref="cc:club:4:c1"]';
    await page.waitForSelector(`${ref} [data-chk-go]`);
    await page.click(`${ref} [data-chk-go]`);
    await page.waitForSelector('#ccResults .cc-frame .rw-name');
    await page.waitForTimeout(200);
    const who = await page.textContent('#ccResults .cc-frame .rw-name');
    assert(who.includes('4번'), `보이는 학생: ${who}`);
    assert((await page.textContent('#ccResults .cc-frame .rw-art')).includes('학원'), '그 글');
  }],
  ['평가지 채점 확인 화면을 연 채 기재 점검 [그 글로 가기] → 확인 화면을 닫고 결과에서 그 학생 평어', async () => {
    await go('gr');
    await page.waitForSelector('[data-grhist="g1"]');
    await page.click('[data-grhist="g1"]');
    await page.waitForSelector('#grResults [data-grrv="open"]');
    await page.click('#grResults [data-grrv="open"]');
    await page.waitForSelector('#grResults .gr-rvw');
    await go('check');
    const ref = '[data-chk-ref="gr:g1:s3"]';
    await page.waitForSelector(`${ref} [data-chk-go]`);
    await page.click(`${ref} [data-chk-go]`);
    await page.waitForSelector('#grResults [data-grcopy="s3"]', { timeout: 3000 });
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('#grResults [data-grcopy="s3"]'), null, { timeout: 2000 });
  }],
  ['교과 평어를 「학생별」로 보다가 기재 점검 [그 글로 가기](문장 모음의 문장) → 문장 모음 화면에서 그 문장', async () => {
    await go('pyeongeo');
    await page.waitForSelector('#pyPoolBar [data-pyv="stu"]', { state: 'visible' });
    await page.click('#pyPoolBar [data-pyv="stu"]');
    await page.waitForSelector('#pyRecView', { state: 'visible' });
    await go('check');
    const ref = '[data-chk-ref="py:P1:u1:high:1"]';
    await page.waitForSelector(`${ref} [data-chk-go]`);
    await page.click(`${ref} [data-chk-go]`);
    await page.waitForFunction(() => document.activeElement && document.activeElement.matches('#listBox [data-i="1"]'), null, { timeout: 3000 });
    assert(await page.isHidden('#pyRecView'), '학생별 화면이 그대로 보임');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
