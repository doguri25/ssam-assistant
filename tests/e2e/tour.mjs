// 3분 둘러보기(스펙 2026-11-13-miss-tour-check §3): 오늘 [3분 둘러보기] → 묻는 창 → 체험용 자료로 옮김(띠 「체험 중 · [체험 끝내기]」) →
// 안내 7단계(그 화면으로 가서 테두리, [다음]·[건너뛰기], Esc, 말풍선으로 초점), 다시 열어도 띠·하던 단계, 체험 중 백업·불러오기·새 학년도·학년도 옮기기 막음,
// 채팅 「둘러보기」「체험」, [체험 끝내기] → 원래 자료로(학년도 키가 글자 하나까지 같음, 체험용 보관 자료 지움), 390px(넘침 없음·말풍선은 아래 탭 위)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-13T10:05:00')); // 금요일 2교시
const H = 'section[data-menu="home"]', S = 'section[data-menu="settings"]', POP = '#tourPop', BAND = '#tourBand';

// 선생님 자료(모두 지어낸 것): 학급·행특 메모·공문·기초학력·평어 설정·연간계획. 다시 열 때 또 넣지 않게 ssam: 밖의 표시로
const SEED = {
  engine: { engine: 'claude', keys: { claude: 'sk-test' }, remember: true },
  class: { count: 24, except: [7], at: 1 },
  'class:info': { grade: 5, room: 2 },
  'class:timetable': { periods: 6, cells: [['국어', '수학'], ['수학'], ['국어'], ['체육'], ['국어', '수학', '과학']] },
  hk: { settings: {}, students: [{ id: 'h1', no: 3, label: '', memo: '[11. 6.] 토론에서 근거를 들어 반론함', done: 0, results: [] }] },
  'gongmun:list': [{ id: 'g1', title: '과학의 날 참가 신청', due: '2026-11-18', done: false, at: 2 }],
  camp: { current: 'c1', camps: [{ id: 'c1', name: '5학년 수학 교실', students: [{ id: 's1', grade: 5, cls: 2, no: 4, name: '한가람' }], sessions: [], att: {} }] },
  school: { name: '새싹초등학교', classes: 2, students: 48, breaks: [] },
  yearplans: [{ id: 'p1', name: '독서 교육' }],
  'nav:tabs': { evaluate: 'hk', class: 'today' }
};
await page.addInitScript(seed => {
  if (localStorage.getItem('test:seeded')) return;
  for (const [k, v] of Object.entries(seed)) localStorage.setItem('ssam:' + k, JSON.stringify(v));
  localStorage.setItem('test:seeded', '1');
}, SEED);

const ls = k => page.evaluate(k => localStorage.getItem('ssam:' + k), k);
// 학년도 자료(ssam: 키 가운데 공통 키가 아닌 것) 그대로
const yearSnap = () => page.evaluate(async () => { const y = await import('./core/years.js'); const s = y.snapshot(localStorage); return JSON.stringify(Object.keys(s).sort().map(k => [k, s[k]])); });
const archived = () => page.evaluate(async () => (await (await import('./core/archive.js')).openArchive().list()).map(x => x.year));
const popText = () => page.textContent(POP);
const step = () => page.evaluate(() => { const n = document.querySelector('#tourPop .tour-pop-n'); return n ? n.textContent.replace(/\s+/g, ' ').trim() : ''; });
// 단계가 바뀐 뒤 테두리가 옮겨 가는 동안(0.18초)을 기다림
const waitStep = async n => { await page.waitForFunction(n => { const e = document.querySelector('#tourPop .tour-pop-n'); return !!e && e.textContent.includes(`${n} /`); }, n); await page.waitForTimeout(300); };
const ringOn = sel => page.evaluate(sel => {
  const r = document.querySelector('#tourRing'), el = [...document.querySelectorAll(sel)].find(e => e.getClientRects().length);
  if (!r || r.hidden || !el) return false;
  const a = r.getBoundingClientRect(), b = el.getBoundingClientRect(), app = document.querySelector('#app');
  // 테두리가 가리킨 곳의 보이는 부분을 둘러쌈(본문 안의 곳은 본문 칸 4px 안쪽까지, 그 밖은 화면)
  const v = app.contains(el) ? app.getBoundingClientRect() : { top: 0, left: 0, right: innerWidth, bottom: innerHeight };
  return a.left <= Math.max(b.left, v.left + 4) + 1 && a.top <= Math.max(b.top, v.top + 4) + 1 && a.right >= Math.min(b.right, v.right - 4) - 1 && a.bottom >= Math.min(b.bottom, v.bottom - 4) - 1;
}, sel);
const focusInPop = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#tourPop'));
const toastHas = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent?.includes(s), s, { timeout: 4000 });
const next = async n => { await page.click(`${POP} [data-tour="next"]`); await waitStep(n); };
const reloadAfter = async sel => { await Promise.all([page.waitForEvent('load'), page.click(sel)]); await page.waitForSelector(`${H} .hm-head`); await page.waitForTimeout(300); };
const noOverflow = () => page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]);

await page.goto(url);
await page.waitForSelector(`${H} .hm-head`);
await page.waitForTimeout(400);
const BEFORE = await yearSnap(), BEFORE_YEARS = await ls('years'), BEFORE_TABS = await ls('nav:tabs');

await run('tour', [
  ['오늘 머리에 [3분 둘러보기](44px), 누르면 묻는 창 — [그만두기]면 그대로', async () => {
    const b = page.locator(`${H} .hm-head [data-tour="start"]`);
    assert(await b.isVisible() && (await b.innerText()).includes('3분 둘러보기'), '단추가 없음');
    assert((await b.boundingBox()).height >= 44, '44px');
    await b.click();
    await page.waitForSelector('#sheetRoot #tourGo');
    const txt = await page.textContent('#sheetRoot .sheet');
    assert(txt.includes('지금 자료는 그대로 두고 체험용 자료로 바꿔요. 끝내면 돌아와요.'), txt.slice(0, 120));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.id === 'tourGo'), '초점이 [둘러보기 시작]에');
    await page.click('#sheetRoot [data-close]');
    assert(await page.locator('#sheetRoot .sheet').count() === 0 && !(await page.isVisible(BAND)), '창이 남음');
    assert(await yearSnap() === BEFORE && await ls('demo') === null, '자료가 바뀜');
  }],
  ['[둘러보기 시작] → 체험용 자료로 다시 열림: 띠 「체험 중 · [체험 끝내기]」, 1단계 「오늘」(테두리·초점), 학년도 표시는 「체험용 자료」', async () => {
    await page.click(`${H} [data-tour="start"]`);
    await page.waitForSelector('#sheetRoot #tourGo');
    await reloadAfter('#sheetRoot #tourGo');
    await page.waitForSelector(POP);
    const band = await page.textContent(BAND);
    assert(band.includes('체험 중') && (await page.locator(`${BAND} [data-tour="exit"]`).innerText()) === '체험 끝내기', band);
    const d = JSON.parse(await ls('demo'));
    assert(d.from === 2026 && JSON.parse(await ls('years')).current === 9999, JSON.stringify(d));
    assert((await ls('camp')).includes('김하늘') && !(await ls('camp')).includes('5학년 수학 교실'), '체험 자료가 아님');
    assert(JSON.parse(await ls('class')).count === 12 && !String(await ls('hk')).includes('토론에서'), '체험 명단');
    assert(await archived().then(l => l.includes(2026)), '선생님 자료가 보관함에 없음');
    assert(await step() === '안내 1 / 7' && (await popText()).includes('오늘'), await step());
    assert(await ringOn(`${H} .hm-cards`), '오늘 카드에 테두리');
    assert(await focusInPop(), '초점이 말풍선에');
    assert((await page.textContent(`${H} .hm-date`)).includes('체험용 자료') && (await page.textContent('#sideYear')).includes('체험용 자료'), '학년도 표시');
    // 체험 자료로 오늘 화면이 채워짐(공문 기한·오늘 수업·기초학력 출석)
    assert(await page.locator(`${H} .hm-gm .hm-line`).count() >= 1 && await page.locator(`${H} .hm-today .hm-ls`).count() >= 3 && await page.locator(`${H} .hm-camp .hm-att-btn`).count() === 3, '오늘 카드');
    assert(await page.locator(`${H} [data-tour="steps"]`).count() === 1, '체험 중에는 [안내 다시 보기]');
  }],
  ['[다음] → 단원평가 결과(성적 일람표) → 도달하지 못한 학생 → 기초학력 사전·사후 → 근거 평어 → 끝', async () => {
    await next(2);
    assert(await page.textContent('#menuTitle') === '평가' && (await popText()).includes('단원평가 결과'), '2단계');
    assert(await page.locator('.un-results .un-sumt').isVisible() && await ringOn('.un-results .yp-card') && await focusInPop(), '성적 일람표 테두리');
    await next(3);
    assert(await page.locator('.un-gap .un-gap-i').count() >= 2, '결손 학생이 없음');
    assert(await ringOn('.un-results .un-gap'), '결손 카드 테두리');
    await next(4);
    assert(await page.textContent('#menuTitle') === '학급', '학급');
    const g = await page.textContent('.cp-growth');
    assert(g.includes('김하늘') && g.includes('▲') && g.includes('자동'), g.slice(0, 200));
    assert(await ringOn('.cp-growth'), '사전·사후 테두리');
    await next(5);
    assert(await page.locator('.un-results .un-py .evd-btn').count() >= 1 && (await page.textContent('.un-results .un-pys')).includes('근거 없음'), '근거 평어');
    assert(await ringOn('.un-results .un-py'), '평어 테두리');
  }],
  ['다시 열어도 띠와 하던 단계(5단계)가 보임', async () => {
    await page.reload(); await page.waitForSelector(POP);
    await waitStep(5);
    assert(await page.isVisible(BAND) && await ringOn('.un-results .un-py'), '다시 연 뒤');
  }],
  ['Esc로 닫음(초점은 띠의 [안내 보기]로), [안내 보기]는 처음부터, [건너뛰기]도 닫음', async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector(POP, { state: 'detached' });
    assert(await page.locator('#tourRing').count() === 0, '테두리가 남음');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('#tourBand [data-tour="steps"]')), '초점');
    assert(JSON.parse(await ls('demo')).step === null, '닫은 것을 기억하지 않음');
    await page.reload(); await page.waitForSelector(BAND);
    await page.waitForTimeout(300);
    assert(await page.locator(POP).count() === 0, '닫았는데 다시 뜸');
    await page.click(`${BAND} [data-tour="steps"]`);
    await waitStep(1);
    await page.click(`${POP} [data-tour="skip"]`);
    await page.waitForSelector(POP, { state: 'detached' });
  }],
  ['끝 단계: [더 둘러보기]·[체험 끝내기], [체험 끝내기]를 가리킴', async () => {
    await page.click(`${BAND} [data-tour="steps"]`);
    for (let n = 2; n <= 7; n++) await next(n);
    assert(await page.locator(`${POP} [data-tour="next"]`).count() === 0 && await page.locator(`${POP} [data-tour="exit"]`).count() === 1 && (await popText()).includes('더 둘러보기'), await popText());
    assert(await ringOn(`${BAND} [data-tour="exit"]`), '끝내기 단추 테두리');
    await page.click(`${POP} [data-tour="skip"]`);
    await page.waitForSelector(POP, { state: 'detached' });
  }],
  ['체험 중 설정 › 학년도: 체험용 학년도는 목록에 없음, 백업·불러오기·새 학년도·옮기기·지우기는 「체험을 끝낸 뒤에 해 주세요」', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]');
    await page.waitForSelector(`${S} [data-yr="2026"] [data-set="goYear"]`);
    const txt = await page.textContent(S);
    assert(txt.includes('3분 둘러보기 중') && txt.includes('체험용 자료') && !txt.includes('9999'), txt.slice(0, 300));
    let downloads = 0; page.on('download', () => downloads++);
    for (const sel of [`${S} [data-set="backup"]`, `${S} [data-set="restore"]`, `${S} [data-set="newYear"]`, `${S} [data-yr="2026"] [data-set="goYear"]`, `${S} [data-yr="2026"] [data-set="delYear"]`]) {
      await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
      await page.click(sel);
      await toastHas('체험을 끝낸 뒤에 해 주세요');
      assert(await page.locator('#sheetRoot .sheet').count() === 0, `창이 열림: ${sel}`);
    }
    // 백업 파일을 끌어 놓아도(파일 칸) 불러오지 않음
    await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
    await page.setInputFiles(`${S} #backupFile`, { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'ssam', kind: 'backup', version: 1, current: 2026, years: { 2026: { hk: '{}' } } })) });
    await toastHas('체험을 끝낸 뒤에 해 주세요');
    await page.waitForTimeout(300);
    assert(downloads === 0 && await page.locator('#sheetRoot .sheet').count() === 0, '막지 못함');
    assert(JSON.parse(await ls('years')).current === 9999 && (await archived()).includes(2026), '학년도가 바뀜');
  }],
  ['채팅 「둘러보기」: 체험 중이면 안내를 처음부터', async () => {
    await page.evaluate(async () => (await import('./core/chat.js')).send('둘러보기'));
    await waitStep(1);
    assert(await page.textContent('#menuTitle') === '오늘', '오늘로');
    await page.keyboard.press('Escape');
    await page.waitForSelector(POP, { state: 'detached' });
  }],
  ['[체험 끝내기] → 원래 자료로: 「원래 자료로 돌아왔어요」, 학년도 키가 글자 하나까지 같음, 체험용 보관 자료·demo 지움', async () => {
    await reloadAfter(`${BAND} [data-tour="exit"]`);
    await toastHas('원래 자료로 돌아왔어요');
    assert(await page.locator(BAND).count() === 0, '띠가 남음');
    assert(await ls('demo') === null && await ls('years') === BEFORE_YEARS, '학년도 표시');
    assert(await yearSnap() === BEFORE, '선생님 자료가 바뀜');
    assert(!(await archived()).includes(9999), '체험용 보관 자료가 남음');
    assert(await ls('nav:tabs') === BEFORE_TABS, '메뉴마다 마지막 탭');
    assert((await page.textContent('#sideYear')).includes('2026학년도') && (await page.textContent(`${H} .hm-date`)).includes('2026학년도'), '학년도 표시');
    assert(await page.locator(`${H} [data-tour="start"]`).count() === 1, '[3분 둘러보기]');
    // 돌아온 뒤에는 막지 않음: 설정 › 학년도 목록에 체험용 학년도 없음
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]');
    await page.waitForSelector(`${S} [data-yr="2026"]`); await page.waitForTimeout(300);
    assert(!(await page.textContent(S)).includes('9999') && !(await page.textContent(S)).includes('3분 둘러보기 중'), '목록');
    await page.click('nav.app-side [data-menu-go="home"]');
  }],
  ['채팅 「체험」: 체험 중이 아니면 묻는 창', async () => {
    await page.evaluate(async () => (await import('./core/chat.js')).send('체험'));
    await page.waitForSelector('#sheetRoot #tourGo');
    await page.click('#sheetRoot [data-close]');
    assert(await ls('demo') === null && await yearSnap() === BEFORE, '자료가 바뀜');
  }],
  ['390px: 띠·말풍선이 화면 안(아래 탭 위), 단계마다 가로로 넘치지 않음, 끝내면 그대로', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click(`${H} [data-tour="start"]`);
    await page.waitForSelector('#sheetRoot #tourGo');
    await reloadAfter('#sheetRoot #tourGo');
    await page.waitForSelector(POP);
    for (let n = 1; n <= 7; n++) {
      if (n > 1) await next(n);
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const p = document.querySelector('#tourPop').getBoundingClientRect(), bar = document.querySelector('#bottomTabs').getBoundingClientRect(), band = document.querySelector('#tourBand').getBoundingClientRect();
        const btns = [...document.querySelectorAll('#tourPop .btn, #tourBand .btn')].map(b => b.getBoundingClientRect().height);
        const g = document.querySelector('#tourRing'), q = g && !g.hidden ? g.getBoundingClientRect() : null;
        return { p: [p.left, p.right, p.top, p.bottom], bar: bar.top, band: [band.left, band.right], btns, ring: q && [q.left, q.right, q.top, q.bottom] };
      });
      assert(r.p[0] >= 0 && r.p[1] <= 390 && r.p[2] >= 0 && r.p[3] <= r.bar + 0.5, `${n}단계 말풍선 ${JSON.stringify(r)}`);
      assert(r.ring === null || (r.ring[0] >= 0 && r.ring[1] <= 390 && r.ring[3] <= r.p[2]), `${n}단계 테두리가 말풍선·아래 탭에 걸침 ${JSON.stringify(r)}`);
      assert(r.band[0] >= 0 && r.band[1] <= 390 && r.btns.every(h => h >= 44), `${n}단계 띠·단추 ${JSON.stringify(r)}`);
      const w = await noOverflow();
      assert(w[0] <= 390 && w[1] <= w[2], `${n}단계 넘침 ${w}`);
    }
    await reloadAfter(`${POP} [data-tour="exit"]`);
    await toastHas('원래 자료로 돌아왔어요');
    assert(await yearSnap() === BEFORE && await ls('demo') === null && !(await archived()).includes(9999), '두 번째 체험 뒤 자료');
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
