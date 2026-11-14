// 평가 틀·한눈에(스펙 2026-11-14-eval-redesign §1·§2): 탭 6칸(생활기록부는 한 칸으로 접힘 + 칸 안 전환), 처음 열면 한눈에,
// 단계 칸에 카드(단원평가·수행평가), 선생님 차례 띠·가로 메뉴 끝 「선생님 차례 n」, 카드·단추로 그 평가 열기, 390px 가로 넘침 없음,
// 평어를 다 썼어도 확인할 것이 남은 평가는 접지 않음(띠와 가로 메뉴 수가 같음), 행동특성·평가지 채점 확인 화면을 「쌤」 버튼이 가리지 않음(1280)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (localStorage.getItem('ssam:__seeded')) return;
  localStorage.setItem('ssam:__seeded', '1');
  localStorage.setItem('ssam:grs', JSON.stringify(['g1']));
  localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '자석의 성질', createdAt: 5,
    students: [{ id: 'a', no: 1, score: 80 }, { id: 'b', no: 2, score: null, unreadable: 1 }, { id: 'c', no: 3, skip: 1 }] }));
  const memo = ['넘어진 친구를 보건실에 데려감', '울고 있는 친구 곁을 지킴', '청소 구역을 끝까지 정리함', '익힘 문제를 끝까지 풀어 냄', '발표 순서를 양보함', '배려심 깊음', '책임감 강함', '모둠 활동 적극적'];
  const list = memo.map((m, i) => ({ id: 'm' + i, kind: 'memo', label: m }));
  localStorage.setItem('ssam:hk', JSON.stringify({ settings: { unit: 'char', min: 100, max: 300, variants: 2, ending: 'eum', grade: 3 }, students: [
    { id: 'h1', no: 1, label: '', memo: memo.join('\n'), done: 0, results: [{ t: '어려움을 겪는 친구를 먼저 살핌. 맡은 일을 끝까지 해냄.', d: 0,
      ev: { list, sentences: [{ t: '어려움을 겪는 친구를 먼저 살핌.', src: ['m0', 'm1'] }, { t: '맡은 일을 끝까지 해냄.', src: ['m2'] }] } }] }] }));
});
/* 화면에 보이는 것 가운데 「쌤」 버튼(#inboxFab)과 겹치는 것 */
const underFab = sel => page.evaluate(sel => {
  const f = document.querySelector('#inboxFab');
  if (!f || f.hidden) return ['쌤 버튼 없음'];
  const r = f.getBoundingClientRect();
  return [...document.querySelectorAll(sel)].filter(b => b.checkVisibility()).filter(b => {
    const x = b.getBoundingClientRect();
    return x.width && x.height && x.right > r.left && x.left < r.right && x.bottom > r.top && x.top < r.bottom && x.top < innerHeight && x.bottom > 0;
  }).map(b => b.textContent.trim().slice(0, 30) || b.outerHTML.slice(0, 60));
}, sel);
const tabs = () => page.$$eval('#menuTabs button', b => b.map(x => x.textContent + (x.getAttribute('aria-current') ? '*' : '')).join(' | '));
const B = '.board-box';
await page.goto(url);
await page.waitForSelector('nav.app-side [data-menu-go="evaluate"]');

await run('eval-board', [
  ['평가를 처음 열면 한눈에: 탭 6칸(생활기록부 한 칸), 평가가 없으면 시작 안내', async () => {
    await page.evaluate(() => localStorage.removeItem('ssam:grs'));
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.waitForSelector(`${B}:not([hidden])`);
    assert(await tabs() === '한눈에* | 단원평가 | 활동지 | 평가지 채점 | 생활기록부 | 기재 점검', await tabs());
    assert((await page.textContent(B)).includes('아직 평가가 없어요'), await page.textContent(B));
    await page.click(`${B} [data-eb-go="unit"]`);
    assert(await page.getAttribute('#menuTabs [data-tab="unit"]', 'aria-current') === 'page', await tabs());
  }],
  ['단원평가·수행평가가 단계 칸에, 판단을 미룬 것은 주황 카드·위 띠·가로 메뉴 「선생님 차례 n」', async () => {
    await page.evaluate(async () => {
      localStorage.setItem('ssam:grs', JSON.stringify(['g1']));
      const S = await import('./menus/evaluate/unit/unit-sample.js'), M = await import('./menus/evaluate/unit/unit-model.js');
      for (const x of S.sampleTests()) { x.meta.sample = false; x.id = 'real-' + x.id; M.saveTest(x); }
    });
    await page.click('#menuTabs [data-tab="board"]');
    await page.waitForSelector(`${B} .eb-cols`);
    const col = id => page.$eval(`${B} .eb-col[aria-label="${id}"]`, c => [...c.querySelectorAll('.eb-card h4')].map(h => h.textContent).join(','));
    assert((await col('채점')).includes('자석의 성질'), '채점 칸: ' + await col('채점'));
    const unitCards = await page.$$eval(`${B} .eb-card[data-eb-kind="unit"]`, c => c.length);
    assert(unitCards >= 2, '단원평가 카드 ' + unitCards);
    assert(await page.$eval(`${B} .eb-card[data-eb-kind="gr"]`, c => c.classList.contains('turn')), '주황 카드');
    assert((await page.textContent(`${B} .ev-band`)).includes('선생님 차례 1개'), await page.textContent(`${B} .ev-band`));
    assert((await page.textContent('#menuTabs .ev-turn-pill')).trim() === '선생님 차례 1', await tabs());
  }],
  ['단원평가 카드 제목을 누르면 그 평가가 열림, 가로 메뉴 「선생님 차례」는 한눈에로', async () => {
    await page.click(`${B} .eb-card[data-eb-kind="unit"] [data-eb-open]`);
    await page.waitForSelector('.unit-box:not([hidden])');
    assert(await page.getAttribute('#menuTabs [data-tab="unit"]', 'aria-current') === 'page', await tabs());
    await page.waitForFunction(() => !!document.querySelector('.unit-box .steps, .unit-box #unFlow'));
    await page.click('#menuTabs .ev-turn-pill');
    await page.waitForSelector(`${B}:not([hidden]) .eb-cols`);
  }],
  ['생활기록부: 누르면 교과 평어, 칸 안 전환으로 창체·행특(가로 메뉴는 생활기록부 그대로), 다른 탭에서는 전환이 숨음', async () => {
    await page.click('#menuTabs [data-fold="rec"]');
    await page.waitForSelector('.rec-switch:not([hidden])');
    assert(await page.textContent('.rec-switch [aria-pressed="true"]') === '교과 평어', await page.textContent('.rec-switch'));
    await page.click('.rec-switch [data-rec-go="hk"]');
    await page.waitForFunction(() => document.querySelector('.rec-switch [aria-pressed="true"]').textContent === '행동특성');
    assert(await page.isVisible('#hkView'), '행특 화면');
    assert(await page.textContent('#menuTabs [aria-current="page"]') === '생활기록부', await tabs());
    assert(await page.getAttribute('#menuTabs [data-fold="rec"]', 'data-tab') === 'hk', '접힌 칸이 마지막 칸으로 감');
    await page.click('#menuTabs [data-tab="unit"]');
    assert(await page.$eval('.rec-switch', e => e.hidden), '단원평가에서 전환이 보임');
    await page.click('#menuTabs [data-fold="rec"]');
    await page.waitForFunction(() => document.querySelector('.rec-switch [aria-pressed="true"]').textContent === '행동특성');
    await page.click('#menuTabs [data-tab="gr"]');
    assert(await page.$eval('.rec-switch', e => e.hidden), '평가지 채점에서 전환이 보임');
  }],
  ['수행평가 카드의 [선생님 차례]를 누르면 평가지 채점에서 그 기록이 열림', async () => {
    await page.click('#menuTabs [data-tab="board"]');
    await page.waitForSelector(`${B} .eb-card[data-eb-kind="gr"] [data-eb-turn]`);
    await page.click(`${B} .eb-card[data-eb-kind="gr"] [data-eb-turn]`);
    assert(await page.getAttribute('#menuTabs [data-tab="gr"]', 'aria-current') === 'page', await tabs());
    await page.waitForFunction(() => /자석의 성질/.test((document.querySelector('#grView') || {}).textContent || ''));
  }],
  ['평어를 다 썼어도 확인할 학생이 남은 평가지 채점은 접지 않고 생활기록부 칸에(띠·가로 메뉴 「선생님 차례」 수가 같음)', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:gr:g1', JSON.stringify({ kind: 'gr', title: '자석의 성질', createdAt: 5,
      students: [{ id: 'a', no: 1, score: 80, text: '가' }, { id: 'b', no: 2, score: 40, text: '나', unreadable: 1 }, { id: 'c', no: 3, skip: 1 }] })));
    await page.click('#menuTabs [data-tab="unit"]');
    await page.click('#menuTabs .ev-turn-pill');
    await page.waitForSelector(`${B}:not([hidden]) .eb-cols`);
    const rec = await page.$eval(`${B} .eb-col[aria-label="생활기록부"]`, c => c.textContent);
    assert(rec.includes('자석의 성질'), '생활기록부 칸: ' + rec);
    const band = (await page.textContent(`${B} .ev-band b`)).match(/\d+/)[0], pill = (await page.textContent('#menuTabs .ev-turn-pill')).match(/\d+/)[0];
    assert(band === pill, `띠 ${band} · 가로 메뉴 ${pill}`);
  }],
  ['1280: 행동특성 글 쓰기·평가지 채점 확인 화면을 「쌤」 버튼이 가리지 않음(처음 화면·내려도)', async () => {
    const S = 'section[data-menu="evaluate"] :is(button, input, select, textarea, li, p)';
    const check = async (scroller, where) => {
      const max = await page.evaluate(s => { const e = document.querySelector(s); return e ? e.scrollHeight - e.clientHeight : 0; }, scroller);
      for (let y = 0; y <= max + 40; y += 80) {
        await page.evaluate(([s, y]) => { const e = document.querySelector(s); if (e) e.scrollTop = y; }, [scroller, y]);
        const o = await underFab(S);
        assert(!o.length, `${where} 스크롤 ${y}에서 가림: ${o.join(', ')}`);
      }
    };
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'hk')));
    await page.waitForSelector('#hkView .rw-frame, #hkView .rw-grid');
    await check('#hkEditor', '행동특성');
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'gr')));
    assert(await page.evaluate(() => window.SSAM.gr.review('g1')), '평가지 채점 확인이 열리지 않음');
    await page.waitForSelector('#grView .ev-rv');
    await check('#grResults', '평가지 채점 확인');
  }],
  ['390px: 한눈에 가로 넘침 없음(단계 칸은 상자 안에서 가로로)', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#menuTabs [data-tab="board"]').catch(() => page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'board'))));
    await page.waitForSelector(`${B}:not([hidden]) .eb-cols`);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(w <= 390, '가로 ' + w);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
