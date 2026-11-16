// 바로 마치기·한눈에 [마치기] (2026-11-16): 단원평가 3단계·채점 확인 화면, 활동지 4단계·채점 확인 화면의 [바로 마치기]는
// 확인하지 않은 칸을 쌤비서가 매긴 대로 두고 채점을 마침(점수·표시 그대로, 선생님 차례 0), 한눈에 결과 확인 칸 카드의 [마치기]는
// 그 평가를 끝난 평가로(가로 메뉴 「선생님 차례」에서도 빠짐) · [다시 열기]로 되돌림, 390px 가로 넘침 없음. 자료는 지어낸 예시(번호만)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const B = '.board-box';
await page.goto(url);
await page.waitForSelector('nav.app-side [data-menu-go="evaluate"]');

// 단원평가 둘(3단계용 qf1, 채점 확인 화면용 qf2): 예시 평가를 진짜로 바꾸고 채점 마치기 전, 두 학생의 칸에 판단을 미룬 표시
const seedUnit = id => page.evaluate(async id => {
  const S = await import('./menus/evaluate/unit/unit-sample.js'), M = await import('./menus/evaluate/unit/unit-model.js');
  const x = S.sampleTests()[0];
  x.id = id; x.meta.sample = false; x.done = false;
  const g = x.students.filter(s => !s.skip && s.status === 'done');
  const nos = x.key.items.map(it => it.no);
  Object.assign(g[0].items[nos[0]], { flag: true, ok: false });
  Object.assign(g[0].items[nos[1]], { flag: true, ok: false });
  Object.assign(g[1].items[nos[0]], { flag: true, ok: false, rv: { agree: false, pts: 0, read: '?' } });
  M.saveTest(x);
  return g[0].items[nos[0]].pts;
}, id);
const unitOf = id => page.evaluate(async id => {
  const M = await import('./menus/evaluate/unit/unit-model.js'), E = await import('./menus/evaluate/eval-stage.js');
  const x = M.getTest(id);
  return { done: !!x.done, pending: E.unitPending(x), pts: x.students.filter(s => !s.skip && s.status === 'done')[0].items[x.key.items[0].no].pts };
}, id);
const seedAct = id => page.evaluate(async id => {
  const { sampleActivity } = await import('./menus/evaluate/activity/activity-sample.js');
  const m = await import('./menus/evaluate/activity/activity-model.js');
  const a = sampleActivity();
  a.id = id; a.meta.title = '물의 여행 ' + id; a.meta.sample = false; a.done = false;
  Object.assign(a.students[1].marks[3], { chk: true, sure: false });
  Object.assign(a.students[3].marks[1], { chk: true, sure: false, rv: { mark: 'o', why: '①로도 볼 수 있어요' } });
  m.saveActivity(a);
  return a.students[1].marks[3].mark;
}, id);
const actOf = id => page.evaluate(async id => {
  const m = await import('./menus/evaluate/activity/activity-model.js'), E = await import('./menus/evaluate/eval-stage.js');
  const a = m.getActivity(id);
  return { done: !!a.done, pending: E.activityPending(a), mark: a.students[1].marks[3].mark, rv: !!a.students[3].marks[1].rv };
}, id);
const toBoard = async () => {
  await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'board')));
  await page.waitForSelector(`${B}:not([hidden]) .eb-cols`);
};
const colIds = label => page.$$eval(`${B} .eb-col[aria-label="${label}"] .eb-card`, l => l.map(x => x.dataset.ebId));
const pill = () => page.evaluate(() => { const p = document.querySelector('#menuTabs .ev-turn-pill'); return p ? Number(p.textContent.replace(/\D/g, '')) : 0; });

await run('eval-finish', [
  ['단원평가 3단계: 판단을 미룬 칸이 있으면 [바로 마치기] → 칸은 쌤비서 점수 그대로, 채점을 마치고 4단계, 선생님 차례 0', async () => {
    const pts0 = await seedUnit('qf1');
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'unit')));
    await page.evaluate(() => import('./menus/evaluate/unit/unit.js').then(m => m.openTest('qf1', 3)));
    await page.waitForSelector('[data-un="quickFinish"]');
    assert((await page.textContent('[data-un="quickFinish"]')).trim() === '바로 마치기', '단추 이름');
    await page.click('[data-un="quickFinish"]');
    await page.waitForTimeout(300);
    const u = await unitOf('qf1');
    assert(u.done && u.pending === 0, JSON.stringify(u));
    assert(u.pts === pts0, '점수가 바뀜 ' + JSON.stringify(u));
    assert((await page.textContent('#toast')).includes('확인할 칸 3개는 쌤비서가 매긴 대로'), await page.textContent('#toast'));
    assert(await page.evaluate(() => import('./menus/evaluate/unit/unit.js').then(m => m.U.step)) === 4, '4단계로');
    assert(!(await page.$('[data-un="quickFinish"]')), '마친 뒤에는 단추 없음');
  }],
  ['단원평가 채점 확인 화면(확인할 것만 보기)에서도 [바로 마치기] → 남은 칸을 정하고 채점을 마침', async () => {
    await seedUnit('qf2');
    await page.evaluate(() => import('./menus/evaluate/unit/unit.js').then(m => m.openReview('qf2')));
    await page.waitForSelector('[data-rvw="quick"]');
    await page.click('[data-rvw="quick"]');
    await page.waitForTimeout(300);
    const u = await unitOf('qf2');
    assert(u.done && u.pending === 0, JSON.stringify(u));
    assert(await page.evaluate(() => import('./menus/evaluate/unit/unit.js').then(m => [m.U.view, m.U.step].join(','))) === 'test,4', '평가 4단계로');
  }],
  ['활동지 4단계: 노란 칸이 있으면 [바로 마치기] → 표시 그대로 확정하고 5단계, 다시 보기 의견도 정함', async () => {
    const mark0 = await seedAct('qa1');
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'activity')));
    await page.evaluate(() => import('./menus/evaluate/activity/activity.js').then(m => m.openActivity('qa1', 4)));
    await page.waitForSelector('.act-box [data-ac="quickFinish"]');
    await page.click('.act-box [data-ac="quickFinish"]');
    await page.waitForTimeout(300);
    const a = await actOf('qa1');
    assert(a.done && a.pending === 0 && !a.rv && a.mark === mark0, JSON.stringify(a));
    assert(await page.evaluate(() => import('./menus/evaluate/activity/activity.js').then(m => m.A.step)) === 5, '5단계로');
  }],
  ['활동지 채점 확인 화면에서도 [바로 마치기]', async () => {
    await seedAct('qa2');
    await page.evaluate(() => import('./menus/evaluate/activity/activity.js').then(m => m.openReview('qa2')));
    await page.waitForSelector('.act-box [data-ac="rvQuick"]');
    await page.click('.act-box [data-ac="rvQuick"]');
    await page.waitForTimeout(300);
    const a = await actOf('qa2');
    assert(a.done && a.pending === 0, JSON.stringify(a));
  }],
  ['한눈에: 결과 확인 칸 카드마다 [마치기](다른 칸은 없음) → 끝난 평가로 접히고 「마침」·[다시 열기], 다시 열면 결과 확인 칸으로', async () => {
    await page.evaluate(() => {
      localStorage.setItem('ssam:grs', JSON.stringify(['gq']));
      localStorage.setItem('ssam:gr:gq', JSON.stringify({ kind: 'gr', title: '자석의 성질', createdAt: 9, students: [{ id: 'a', no: 1, score: 80 }, { id: 'b', no: 2, score: 60, unreadable: 1 }] }));
    });
    await toBoard();
    const res = await colIds('결과 확인');
    for (const id of ['qf1', 'qa1', 'gq']) assert(res.includes(id), `${id}가 결과 확인 칸에 없음 ${JSON.stringify(res)}`);
    const n = await page.locator(`${B} .eb-col[aria-label="결과 확인"] [data-eb-close]`).count();
    assert(n === res.length, `마치기 단추 ${n}개 / 카드 ${res.length}개`);
    assert(await page.locator(`${B} .eb-col:not([aria-label="결과 확인"]) [data-eb-close]`).count() === 0, '다른 칸에도 마치기');
    // 확인할 학생이 있는 수행평가(gq)를 마치면 선생님 차례에서도 빠짐
    const before = await pill();
    await page.click(`${B} .eb-card[data-eb-id="gq"] [data-eb-close]`);
    await page.waitForTimeout(200);
    assert(!(await colIds('결과 확인')).includes('gq'), '마친 평가가 결과 확인 칸에 남음');
    assert(await pill() === before - 1, `선생님 차례 ${before} → ${await pill()}`);
    assert(await page.evaluate(() => !!document.querySelector('.board-box .eb-done[open]')), '끝난 평가 목록이 펼쳐짐');
    const li = `${B} .eb-done li[data-eb-id="gq"]`;
    assert((await page.textContent(li)).includes('마침'), await page.textContent(li));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('.eb-done summary')), '초점이 끝난 평가 목록');
    assert((await page.textContent('#toast')).includes('마쳤어요'), await page.textContent('#toast'));
    const g = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gr:gq')));
    assert(g.students[0].score === 80 && g.students[1].unreadable === 1, '점수·표시는 그대로');
    // 다시 열기
    await page.click(`${li} [data-eb-reopen]`);
    await page.waitForTimeout(200);
    assert((await colIds('결과 확인')).includes('gq'), '다시 연 평가가 결과 확인 칸에 없음');
    assert(await pill() === before, '선생님 차례가 돌아옴');
    // 단원평가·활동지도 마치기 → 끝난 평가, 새로 고쳐도 그대로
    await page.click(`${B} .eb-card[data-eb-id="qf1"] [data-eb-close]`);
    await page.click(`${B} .eb-card[data-eb-id="qa1"] [data-eb-close]`);
    await page.reload(); await page.waitForSelector('nav.app-side [data-menu-go="evaluate"]');
    await toBoard();
    const after = await colIds('결과 확인');
    assert(!after.includes('qf1') && !after.includes('qa1') && after.includes('gq'), JSON.stringify(after));
    assert(await page.locator(`${B} .eb-done li[data-eb-id="qf1"] [data-eb-reopen]`).count() === 1, '단원평가 다시 열기');
  }],
  ['390px: 한눈에 카드의 [마치기]·끝난 평가 목록이 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toBoard();
    await page.evaluate(() => { const d = document.querySelector('.board-box .eb-done'); if (d) d.open = true; });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 0, '가로 넘침 ' + over);
    const b = await page.locator(`${B} [data-eb-close]`).first().boundingBox();
    assert(b && b.height >= 40, '누름 칸 높이 ' + JSON.stringify(b));
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
