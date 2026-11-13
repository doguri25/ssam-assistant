// 화면 정리(스펙 2026-11-14-ui-tidy) — 창 틀·공통 부품: 평가 탭 두 묶음(채점 | 생활기록부, 이름·구분선), 「기타」 → 「문서·소통」(세로 메뉴·더보기),
// 화면 설명은 처음 3번(켤 때마다 한 번 셈)만 펼침, 「AI로 가는 것」 펼침 → [AI로 보낸 글 보기] → 설정 › AI 「AI로 보낸 글」 카드,
// 「쌤」 버튼이 기초학력 화면 끝 단추를 가리지 않음(1366·390), 설정 › AI 「기본 검토 AI」 선택 칸 높이, 390px에서 가로로 넘치지 않음
import { open, run, assert } from './helpers.mjs';

const t = await open({ width: 1366, height: 768 });
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await page.goto(url);
await page.waitForTimeout(500);

const go = (menu, tab) => page.evaluate(([m, tb]) => import('./core/shell.js').then(s => s.go(m, tb)), [menu, tab]);
const title = () => page.textContent('header.app-top h1');
/* 화면에 보이는 단추 가운데 「쌤」 버튼(#inboxFab)과 겹치는 것 */
const underFab = sel => page.evaluate(sel => {
  const f = document.querySelector('#inboxFab');
  if (!f || f.hidden) return ['쌤 버튼 없음'];
  const r = f.getBoundingClientRect();
  return [...document.querySelectorAll(sel)].filter(b => b.checkVisibility()).filter(b => {
    const x = b.getBoundingClientRect();
    return x.width && x.height && x.right > r.left && x.left < r.right && x.bottom > r.top && x.top < r.bottom && x.top < innerHeight && x.bottom > 0;
  }).map(b => b.textContent.trim() || b.outerHTML.slice(0, 60));
}, sel);
const toBottom = () => page.evaluate(() => { const a = document.querySelector('#app'); a.scrollTop = a.scrollHeight; });

await run('ui-tidy-shell', [
  ['평가 탭 두 묶음: 「채점」 단원평가·활동지·평가지 채점 | 「생활기록부」 교과 평어·창체·행특·기재 점검 — 이름은 누르는 칸이 아니고 사이에 구분선', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    const seq = await page.$$eval('#menuTabs > *', els => els.map(e => e.matches('.tab-grp') ? `[${e.textContent}]` : e.matches('.tab-sep') ? '|' : e.dataset.tab));
    assert(seq.join(' ') === '[채점] unit activity gr | [생활기록부] pyeongeo cc hk check', seq.join(' '));
    const g = await page.$$eval('#menuTabs .tab-grp', els => els.map(e => ({ tag: e.tagName, tab: e.tabIndex, h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) })));
    assert(g.every(x => x.tag === 'SPAN' && x.tab < 0 && x.fs < 14), '묶음 이름: ' + JSON.stringify(g));
    assert(await page.getAttribute('#menuTabs .tab-sep', 'aria-hidden') === 'true', '구분선은 읽지 않음');
    // 처음엔 여전히 교과 평어(탭 id·마지막 탭 기억은 그대로)
    assert(await page.textContent('#menuTabs [aria-current="page"]') === '교과 평어', await page.textContent('#menuTabs [aria-current="page"]'));
    await page.click('#menuTabs [data-tab="unit"]');
    await page.click('nav.app-side [data-menu-go="class"]');
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    assert(await page.textContent('#menuTabs [aria-current="page"]') === '단원평가', '마지막 탭 기억');
    // 키보드로 탭을 옮겨 다녀도 묶음 이름에는 멈추지 않음
    await page.focus('#menuTabs [data-tab="gr"]');
    await page.keyboard.press('Tab');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.tab) === 'pyeongeo', '다음 초점: ' + await page.evaluate(() => document.activeElement.outerHTML.slice(0, 80)));
  }],
  ['「기타」 → 「문서·소통」: 세로 메뉴·제목(메뉴 id는 etc 그대로)', async () => {
    const side = await page.textContent('nav.app-side [data-menu-go="etc"]');
    assert(side.trim() === '문서·소통', side);
    await page.click('nav.app-side [data-menu-go="etc"]');
    assert(await title() === '문서·소통', await title());
    assert(!(await page.textContent('nav.app-side')).includes('기타'), '세로 메뉴에 「기타」가 남음');
  }],
  ['「AI로 가는 것」: 접혀 있고, 누르면 무엇을 보내는지 + [AI로 보낸 글 보기] → 설정 › AI 「AI로 보낸 글」 카드', async () => {
    await go('etc', 'message');
    const N = 'section[data-menu="etc"] .msg-box .ai-note';
    await page.waitForSelector(N);
    assert(!(await page.getAttribute(N, 'open')) && await page.isHidden(`${N} [data-go-ailog]`), '처음엔 접힘');
    assert((await page.textContent(`${N} summary`)).includes('AI로 가는 것'), '이름');
    await page.click(`${N} summary`);
    assert(await page.isVisible(`${N} [data-go-ailog]`), '펼침');
    assert((await page.locator(`${N} .ai-note-body p`).innerText()).includes('명단·전화번호'), '보내는 것');
    await page.click(`${N} [data-go-ailog]`);
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'setAiLog');
    assert(await title() === '설정' && await page.textContent('#menuTabs [aria-current="page"]') === 'AI', `${await title()} › ${await page.textContent('#menuTabs [aria-current="page"]')}`);
    const r = await page.$eval('#setAiLog', e => { const x = e.getBoundingClientRect(); return [x.top, x.bottom, innerHeight]; });
    assert(r[0] >= 0 && r[0] < r[2], 'AI로 보낸 글 카드가 화면에 보임: ' + r);
  }],
  ['설정 › AI 「기본 검토 AI」 선택 칸은 보통 높이(예전 약 170px) · 품의 기준 금액 칸도', async () => {
    await go('settings', 'ai');
    await page.waitForSelector('#setReviewAi');
    const h = await page.$eval('#setReviewAi', e => e.getBoundingClientRect().height);
    assert(h >= 30 && h <= 52, '검토 AI 칸 높이 ' + h);
    await go('settings', 'purchase');
    const hs = await page.$$eval('#limitWon, #meetCap', els => els.map(e => e.getBoundingClientRect().height));
    assert(hs.length === 2 && hs.every(x => x >= 30 && x <= 52), '금액 칸 높이 ' + hs);
    // 다른 칸 줄(학교 정보)의 선택·입력 칸은 그대로
    await go('settings', 'school');
    const w = await page.$eval('#schName', e => e.getBoundingClientRect().width);
    assert(w > 150, '학교명 칸 너비 ' + w);
  }],
  ['「쌤」 버튼이 기초학력 화면의 단추를 가리지 않음(1366): 처음 보이는 화면에서도, 맨 아래로 내려도', async () => {
    await go('class', 'camp');
    await page.waitForSelector('section[data-menu="class"] .cp-page');
    if (await page.$('section[data-menu="class"] [data-cp="new"]')) await page.click('section[data-menu="class"] [data-cp="new"]');
    await page.click('section[data-menu="class"] [data-cp="addStudent"]');
    await page.click('section[data-menu="class"] [data-cp="addStudent"]');
    await page.evaluate(() => { document.querySelector('#app').scrollTop = 0; });
    const B = 'section[data-menu="class"] :is(button, input, select, textarea, summary)';
    // 오른쪽 끝 단추(카드 머리의 [+ 학생] 등)가 버튼 밑을 지나가지 않음: 40px씩 내려 보며
    const max = await page.evaluate(() => { const a = document.querySelector('#app'); return a.scrollHeight - a.clientHeight; });
    assert(max > 100, '내려 볼 만큼 길지 않음 ' + max);
    for (let y = 0; y <= max + 40; y += 40) {
      await page.evaluate(y => { document.querySelector('#app').scrollTop = y; }, y);
      const o = await underFab(B);
      assert(!o.length, `스크롤 ${y}에서 가림: ${o.join(', ')}`);
    }
    await toBottom();
    const o = await underFab(B);
    assert(!o.length, '맨 아래에서 가림: ' + o.join(', '));
    // 끝 단추 아래로 버튼만큼 여백이 남음
    const gap = await page.evaluate(() => {
      const f = document.querySelector('#inboxFab').getBoundingClientRect();
      const bs = [...document.querySelectorAll('section[data-menu="class"] button')].filter(b => b.checkVisibility());
      return f.top - Math.max(...bs.map(b => b.getBoundingClientRect().bottom));
    });
    assert(gap > 0, '끝 단추가 쌤 버튼 높이 아래까지 감: ' + gap);
  }],
  ['옛 평가 화면(교과 평어 넣기 화면)도 맨 아래 단추가 쌤 버튼에 가리지 않음(1366)', async () => {
    await go('evaluate', 'pyeongeo');
    await page.waitForTimeout(200);
    await toBottom();
    const o = await underFab('section[data-menu="evaluate"] :is(button, input, select, textarea)');
    assert(!o.length, '가림: ' + o.join(', '));
  }],
  ['390px: 탭 줄은 묶음 이름과 함께 한 줄로 밀어 넘김, 더보기에 「문서·소통」, 기초학력 맨 아래 단추가 쌤 버튼에 가리지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#bottomTabs [data-menu-go="evaluate"]');
    const r = await page.evaluate(() => { const el = document.querySelector('#menuTabs'), xs = [...el.children];
      return { mid: [...new Set(xs.map(b => { const x = b.getBoundingClientRect(); return Math.round((x.top + x.bottom) / 2); }))], ox: getComputedStyle(el).overflowX, h: [...el.querySelectorAll('button')].map(b => b.getBoundingClientRect().height), sw: document.documentElement.scrollWidth }; });
    assert(r.mid.every(m => Math.abs(m - r.mid[0]) <= 3), '한 줄이 아님: ' + r.mid);
    assert(r.ox === 'auto' && r.h.every(h => h >= 44) && r.sw <= 390, JSON.stringify(r));
    await page.click('#moreBtn');
    await page.waitForSelector('#sheetRoot .more-sheet');
    const labels = await page.locator('#sheetRoot .more-go').allInnerTexts();
    assert(labels.join('|') === '계획|연수|문서·소통|설정', labels.join('|'));
    await page.click('#sheetRoot .more-go[data-more-go="etc"]');
    assert(await title() === '문서·소통', await title());
    await go('class', 'camp');
    await page.waitForSelector('section[data-menu="class"] .cp-page');
    await toBottom();
    const o = await underFab('section[data-menu="class"] :is(button, input, select, textarea, summary)');
    assert(!o.length, '맨 아래에서 가림: ' + o.join(', '));
  }],
  ['390px: 메뉴 화면마다 가로로 넘치지 않음(화면 설명·「AI로 가는 것」·접기 펼쳐도)', async () => {
    const tabs = [['home'], ['plan', 'year'], ['plan', 'event'], ['plan', 'class'], ['plan', 'report'], ['class', 'today'], ['class', 'progress'], ['class', 'weekly'], ['class', 'camp'],
      ['purchase', 'new'], ['purchase', 'templates'], ['purchase', 'recent'], ['etc', 'message'], ['etc', 'letter'], ['etc', 'gongmun'], ['etc', 'handover'], ['etc', 'multi'],
      ['settings', 'roster'], ['settings', 'ai'], ['settings', 'screen'], ['settings', 'school'], ['settings', 'years'], ['settings', 'purchase']];
    const bad = [];
    for (const [m, tb] of tabs) {
      await go(m, tb);
      await page.waitForTimeout(150);
      const w = await page.evaluate(() => {
        document.querySelectorAll('section[data-menu]:not([hidden]) :is(details.intro, details.ai-note, details.fold)').forEach(d => { d.open = true; });
        const a = document.querySelector('#app');
        return [document.documentElement.scrollWidth, a.scrollWidth, a.clientWidth];
      });
      if (w[0] > 390 || w[1] > w[2]) bad.push(`${m}/${tb}: ${w}`);
    }
    assert(!bad.length, bad.join(' · '));
    await page.setViewportSize({ width: 1366, height: 768 });
  }],
  ['화면 설명: 처음 3번(앱을 켤 때마다 한 번 셈)은 펼쳐 보이고, 4번째부터는 접힌 「화면 설명」(눌러서 펼침)', async () => {
    await page.evaluate(() => localStorage.removeItem('ssam:ui:intro'));
    const I = 'section[data-menu="plan"] .yp-page .m-head details.intro';
    const look = async () => {
      await page.reload(); await page.waitForTimeout(400);
      await go('plan', 'year');
      await page.waitForSelector(I);
      // 같은 실행에서 다른 메뉴에 갔다 와도 한 번만 셈
      await go('home'); await go('plan', 'year');
      await page.waitForSelector(I);
      return { open: await page.evaluate(s => document.querySelector(s).open, I), n: await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:ui:intro')).year) };
    };
    for (let i = 1; i <= 3; i++) {
      const r = await look();
      assert(r.open && r.n === i, `${i}번째: ${JSON.stringify(r)}`);
      assert(await page.isVisible(`${I} .intro-text`) && await page.isHidden(`${I} .intro-sum`), `${i}번째: 설명 글이 보임`);
    }
    const r = await look();
    assert(!r.open && r.n === 4, '4번째는 접힘: ' + JSON.stringify(r));
    assert(await page.isVisible(`${I} .intro-sum`) && (await page.textContent(`${I} .intro-sum`)).includes('화면 설명'), '「화면 설명」');
    const sh = await page.$eval(`${I} .intro-sum`, e => e.getBoundingClientRect().height);
    assert(sh >= 44, '누르는 칸 높이 ' + sh);
    await page.click(`${I} .intro-sum`);
    assert(await page.isVisible(`${I} .intro-text`), '눌러서 펼침');
    assert((await page.textContent(`${I} .intro-text`)).includes('월별 일정'), await page.textContent(`${I} .intro-text`));
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
