// 휴대폰 화면(390·360px): 본문 단추가 서로·떠 있는 것에 겹치지 않음 — 떠 있는 「쌤」 버튼은 휴대폰에서 숨기고 머리 줄 말풍선으로 채팅,
// 평가지 채점 [채점하고 평어 쓰기] 줄은 휴대폰에서 아래에 붙이지 않음(아래 탭 위로 떠서 밑의 칸·단추와 겹쳤음). 데스크톱은 그대로.
// 자료는 3분 둘러보기의 체험용 자료(지어낸 학급)
import { open, run, assert } from './helpers.mjs';

const t = await open({ width: 390, height: 844 });
const { page, url, errors } = t;
page.on('dialog', d => d.dismiss().catch(() => {}));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await page.goto(url);
await page.waitForTimeout(500);
await page.evaluate(() => import('./core/tour.js').then(m => m.startTour()));
await page.click('#tourGo');
await page.waitForLoadState('load');
await page.waitForFunction(() => document.querySelector('.demo-band, [data-demo-band]') || localStorage.getItem('ssam:demo'), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(800);
await page.evaluate(() => import('./core/tour.js').then(m => m.closeSteps()));

const go = (menu, tab) => page.evaluate(([m, tb]) => import('./core/shell.js').then(s => s.go(m, tb)), [menu, tab]);
const fabShown = () => page.evaluate(() => { const f = document.querySelector('#inboxFab'); return !!f && !f.hidden && f.checkVisibility({ opacityProperty: true, visibilityProperty: true }); });
/* 보이는 본문 누르는 칸끼리 겹침(스크롤 칸 밖으로 잘린 부분은 빼고) + 떠 있는 「쌤」 버튼 밑에 깔린 칸.
   위·아래에 붙는 막대(sticky, 불투명 — 다면평가 점수 막대 등) 안의 칸은 스크롤할 때 내용이 밑으로 지나가는 것이라 뺌(평가지 채점 줄은 따로 봄) */
const overlaps = () => page.evaluate(() => {
  const sec = [...document.querySelectorAll('main section[data-menu]')].find(s => !s.hidden && s.offsetParent !== null) || document.querySelector('main');
  const clip = e => {
    let r = e.getBoundingClientRect(), x = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') { const q = p.getBoundingClientRect(); x = { l: Math.max(x.l, q.left), t: Math.max(x.t, q.top), r: Math.min(x.r, q.right), b: Math.min(x.b, q.bottom) }; }
    }
    return x;
  };
  const name = e => (e.getAttribute('aria-label') || e.textContent || e.placeholder || e.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  const stuck = e => { for (let p = e; p && p !== sec; p = p.parentElement) if (getComputedStyle(p).position === 'sticky') return true; return false; };
  const els = [...sec.querySelectorAll('button, a[href], input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], .chip')]
    .filter(e => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !stuck(e)).map(e => [e, clip(e)]).filter(([, x]) => x.r - x.l > 2 && x.b - x.t > 2);
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 3 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 3;
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const [a, ra] = els[i], [b, rb] = els[j];
    if (!a.contains(b) && !b.contains(a) && hit(ra, rb)) out.push(`${name(a)} × ${name(b)}`);
  }
  const f = document.querySelector('#inboxFab');
  if (f && !f.hidden && f.checkVisibility({ opacityProperty: true, visibilityProperty: true })) {
    const q = f.getBoundingClientRect(), fr = { l: q.left, t: q.top, r: q.right, b: q.bottom };
    for (const [e, x] of els) if (hit(x, fr)) out.push(`쌤 버튼 밑: ${name(e)}`);
  }
  return out;
});
/* 화면을 내려 가며 겹침을 모음 */
const scan = async () => {
  const seen = new Set();
  const max = await page.evaluate(() => { const a = document.querySelector('#app'); return a.scrollHeight - a.clientHeight; });
  for (let y = 0; y <= max + 1; y += 200) {
    await page.evaluate(y => { document.querySelector('#app').scrollTop = y; }, y);
    await page.waitForTimeout(120);
    (await overlaps()).forEach(x => seen.add(x));
  }
  await page.evaluate(() => { document.querySelector('#app').scrollTop = 0; });
  return [...seen];
};

await run('mobile-layout', [
  ['390px: 떠 있는 「쌤」 버튼은 숨기고, 머리 줄 말풍선 단추로 채팅이 열려 아래 탭 바로 위까지 씀', async () => {
    await go('home');
    assert(!(await fabShown()), '휴대폰에서 떠 있는 쌤 버튼이 보임');
    assert(await page.isVisible('#chatTop'), '머리 줄 말풍선 단추');
    await page.click('#chatTop');
    await page.waitForSelector('#chatPanel:not([hidden])');
    const p = await page.locator('#chatPanel').boundingBox(), bar = await page.locator('#bottomTabs').boundingBox();
    assert(p.y + p.height <= bar.y + 1, `채팅 창이 아래 탭을 가림 ${JSON.stringify(p)} / ${JSON.stringify(bar)}`);
    assert(bar.y - (p.y + p.height) <= 20, `채팅 창 아래가 떠 있음(버튼 자리만큼 비움) ${bar.y - (p.y + p.height)}`);
    assert(await page.getAttribute('#chatTop', 'aria-expanded') === 'true', 'aria-expanded');
    await page.click('#chatPanel [data-chat="close"]');
    await page.waitForSelector('#chatPanel', { state: 'hidden' });
  }],
  ['390px: 알림은 아래 탭 바로 위(버튼 자리를 비우지 않음)', async () => {
    await page.evaluate(() => window.SSAM.toast('시험 알림'));
    await page.waitForTimeout(400);
    const tb = await page.locator('#toast').boundingBox(), bar = await page.locator('#bottomTabs').boundingBox();
    assert(tb.y + tb.height <= bar.y && bar.y - (tb.y + tb.height) <= 30, `알림 자리 ${JSON.stringify(tb)} / 아래 탭 ${bar.y}`);
  }],
  ['390px: 평가지 채점 [채점하고 평어 쓰기] 줄은 아래에 붙지 않고 채점 기준 칸·[정답표 파일]과 겹치지 않음', async () => {
    await go('evaluate', 'gr');
    await page.waitForSelector('#grSetup .gr-go');
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('#grSetup .gr-go')).position) === 'static', '휴대폰에서 아래에 붙음');
    const o = await scan();
    assert(!o.length, '겹침: ' + o.join(' | '));
  }],
  ['390px: 메뉴마다 본문 누르는 칸이 서로·쌤 버튼과 겹치지 않음(내려 가며)', async () => {
    const bad = [];
    for (const [m, tb] of [['home'], ['evaluate', 'board'], ['evaluate', 'unit'], ['evaluate', 'activity'], ['evaluate', 'pyeongeo'], ['evaluate', 'hk'], ['evaluate', 'check'],
      ['plan', 'year'], ['plan', 'event'], ['plan', 'class'], ['plan', 'report'], ['class', 'today'], ['class', 'weekly'], ['class', 'camp'],
      ['purchase', 'new'], ['etc', 'message'], ['etc', 'letter'], ['etc', 'gongmun'], ['etc', 'multi'], ['settings', 'ai'], ['settings', 'screen']]) {
      await go(m, tb); await page.waitForTimeout(350);
      for (const x of await scan()) bad.push(`${m}/${tb || '-'}: ${x}`);
    }
    assert(!bad.length, bad.join('\n'));
  }],
  ['360px: 같은 메뉴들에서도 겹치지 않고 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 360, height: 780 });
    const bad = [];
    for (const [m, tb] of [['evaluate', 'gr'], ['evaluate', 'hk'], ['class', 'camp'], ['class', 'weekly'], ['etc', 'multi'], ['purchase', 'new']]) {
      await go(m, tb); await page.waitForTimeout(350);
      for (const x of await scan()) bad.push(`${m}/${tb}: ${x}`);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > 360) bad.push(`${m}/${tb}: 가로 넘침 ${sw}`);
    }
    assert(!bad.length, bad.join('\n'));
  }],
  ['데스크톱(1280)은 그대로: 떠 있는 쌤 버튼이 보이고 [채점하고 평어 쓰기] 줄은 아래에 붙음', async () => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.waitForTimeout(200);
    assert(await fabShown(), '데스크톱에서 쌤 버튼이 안 보임');
    await go('evaluate', 'gr');
    assert(await page.evaluate(() => getComputedStyle(document.querySelector('#grSetup .gr-go')).position) === 'sticky', '데스크톱에서 아래에 붙지 않음');
    await page.setViewportSize({ width: 390, height: 844 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
