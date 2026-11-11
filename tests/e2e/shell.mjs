// 창 틀: 세로 메뉴 + 헤더(┌), 메뉴 전환, 켜면 늘 「오늘」(마지막 메뉴는 저장만, 메뉴마다 마지막 탭 기억), 좁은 화면(아래 탭·더보기)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const title = () => page.textContent('header.app-top h1');
const tabs = () => page.locator('header.app-top nav.app-tabs button').allInnerTexts();
const current = sel => page.locator(`${sel} [aria-current="page"]`).innerText();

let slow = true;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  if (slow) await new Promise(r => setTimeout(r, 2500));
  return Array.from({ length: 60 }, (_, j) => `경험과 관련지어 작품을 감상하며 ${j + 1}번째 생각을 근거를 들어 자신 있게 발표함.`).join('\n');
});
await page.goto(url);
await page.waitForTimeout(600);

await run('shell', [
  ['처음 열면 오늘(가로 메뉴 없음), 평가로 가면 교과 평어', async () => {
    assert(await current('nav.app-side') === '오늘', '세로 메뉴 현재: ' + await current('nav.app-side'));
    assert(await title() === '오늘', '제목: ' + await title());
    assert(await page.isHidden('#menuTabs'), '오늘에 가로 메뉴가 보임');
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    assert(await current('nav.app-side') === '평가', '세로 메뉴 현재: ' + await current('nav.app-side'));
    assert(await title() === '평가', '제목: ' + await title());
    const ts = await tabs();
    assert(ts.join('|') === '교과 평어|창의적 체험활동|행동특성|평가지 채점|단원평가|활동지', '가로 메뉴: ' + ts.join('|'));
    assert(await current('header.app-top nav.app-tabs') === '교과 평어', '가로 메뉴 현재');
  }],
  ['로고 칸과 헤더 높이가 76px', async () => {
    const h = await page.evaluate(() => [document.querySelector('nav.app-side .app-logo').getBoundingClientRect().height, document.querySelector('header.app-top').getBoundingClientRect().height]);
    assert(h[0] === 76 && h[1] === 76, '높이: ' + h.join(', '));
  }],
  ['품의로 가면 제목·가로 메뉴·섹션이 바뀌고, 새로고침하면 오늘(품의는 저장만)', async () => {
    await page.click('nav.app-side [data-menu-go="purchase"]');
    assert(await title() === '품의', '제목: ' + await title());
    assert((await tabs()).join('|') === '새 품의|저장한 템플릿|최근 작성', '가로 메뉴');
    assert(await page.isVisible('section[data-menu="purchase"]') && !(await page.isVisible('section[data-menu="evaluate"]')), '섹션 표시');
    assert((await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav')))).menu === 'purchase', '마지막 메뉴 저장');
    await page.reload(); await page.waitForTimeout(400);
    assert(await title() === '오늘' && await page.isVisible('section[data-menu="home"]'), '새로고침 뒤 제목: ' + await title());
  }],
  ['평가 › 평가지 채점을 누르면 채점 화면', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.click('header.app-top nav.app-tabs [data-tab="gr"]');
    assert(await page.evaluate(() => window.SSAM.getMode()) === 'gr', 'mode가 gr이 아님');
    assert(await page.isVisible('#grView'), '#grView 안 보임');
    assert(await current('header.app-top nav.app-tabs') === '평가지 채점', '가로 메뉴 현재');
  }],
  ['메뉴마다 마지막 탭: 계획 › 행사계획 → 학급 → 계획이면 행사계획, 새로고침해도 그대로', async () => {
    const side = m => page.click(`nav.app-side [data-menu-go="${m}"]`);
    await side('plan'); await page.click('#menuTabs [data-tab="event"]');
    await side('class');
    assert(await current('header.app-top nav.app-tabs') === '오늘 수업', '학급은 처음이라 첫 탭: ' + await current('header.app-top nav.app-tabs'));
    await side('plan');
    assert(await title() === '계획' && await current('header.app-top nav.app-tabs') === '행사계획', '계획으로 돌아오면: ' + await current('header.app-top nav.app-tabs'));
    assert(await page.isVisible('section[data-menu="plan"]'), '계획 화면이 안 보임');
    await page.reload(); await page.waitForTimeout(400);
    await side('plan'); // 새로 고치면 오늘부터
    assert(await current('header.app-top nav.app-tabs') === '행사계획', '새로고침 뒤: ' + await current('header.app-top nav.app-tabs'));
    await side('class'); await side('plan');
    assert(await current('header.app-top nav.app-tabs') === '행사계획', '새로고침 뒤 학급 갔다 오면: ' + await current('header.app-top nav.app-tabs'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav:tabs')));
    assert(saved.plan === 'event' && saved.class === 'today', '저장: ' + JSON.stringify(saved));
  }],
  ['평가 › 단원평가·행동특성도 다른 메뉴에 갔다 오면 그 탭', async () => {
    for (const [tab, label] of [['unit', '단원평가'], ['hk', '행동특성']]) {
      await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click(`#menuTabs [data-tab="${tab}"]`);
      await page.click('nav.app-side [data-menu-go="purchase"]'); await page.click('nav.app-side [data-menu-go="evaluate"]');
      assert(await current('header.app-top nav.app-tabs') === label, `${label} → ${await current('header.app-top nav.app-tabs')}`);
      assert(await page.evaluate(() => document.querySelector('section[data-menu="evaluate"]').classList.contains('ev-new')) === (tab === 'unit'), tab + ': 기존 화면 숨김이 맞지 않음');
    }
    assert(await page.evaluate(() => window.SSAM.getMode()) === 'hk', 'mode가 hk가 아님');
  }],
  ['이제 없는 탭이 마지막이면 첫 탭, 탭을 정해 부르면(AI 칸) 그 탭', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:nav:tabs', JSON.stringify({ plan: '없는탭', settings: 'school' })));
    await page.click('nav.app-side [data-menu-go="plan"]');
    assert(await current('header.app-top nav.app-tabs') === '연간계획', '없는 탭 → ' + await current('header.app-top nav.app-tabs'));
    await page.click('#sideAi');
    assert(await title() === '설정' && await current('header.app-top nav.app-tabs') === 'AI', '정한 탭 → ' + await current('header.app-top nav.app-tabs'));
    await page.click('nav.app-side [data-menu-go="evaluate"]');
  }],
  ['저장된 위치 값이 무엇이든(망가졌어도) 오늘로 열림', async () => {
    for (const v of ['{"menu":"없음","tab":"x"}', '망가진 값', '{"menu":"evaluate","tab":"gr"}', '{"menu":"plan","tab":"event"}']) {
      await page.evaluate(v => localStorage.setItem('ssam:nav', v), v);
      await page.reload(); await page.waitForTimeout(400);
      assert(await title() === '오늘', `${v} → ${await title()}`);
    }
  }],
  ['평어를 만드는 동안 메뉴를 옮겨도 계속 만들고 진행 표시가 보임', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); // 새로 고친 뒤라 오늘부터
    await page.click('header.app-top nav.app-tabs [data-tab="pyeongeo"]');
    await page.click('#srcPaste');
    await page.fill('#pasteBox', await page.getAttribute('#pasteBox', 'placeholder'));
    await page.click('#pasteGo');
    await page.click('#genBtn');            // 「평어 만들기」 → 과목 고르기
    await page.click('#pickGo');
    await page.waitForSelector('#genSpin:not([hidden])', { timeout: 5000 });
    await page.click('nav.app-side [data-menu-go="purchase"]');
    assert(await page.isVisible('#genPill'), '품의에서 진행 표시가 안 보임');
    slow = false;
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.waitForFunction(() => document.querySelector('#genPill').hidden, null, { timeout: 30000 });
    const n = await page.locator('#pane .sent').count();
    assert(n > 0, '만든 평어가 없음');
  }],
  ['평어 문장 옆 글자 수 칸이 세로 메뉴 색을 물려받지 않음', async () => {
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#pane .sent .side')).backgroundColor);
    assert(bg !== 'rgb(21, 23, 28)', '글자 수 칸 배경이 세로 메뉴 색: ' + bg);
  }],
  ['390px 폭에서 가로 스크롤 없고 아래 탭 메뉴 글자가 한 줄', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(w <= 390, 'scrollWidth ' + w);
    const hs = await page.evaluate(() => [...document.querySelectorAll('#bottomTabs .bt-btn span')].map(s => s.getBoundingClientRect().height));
    assert(hs.length === 5, '아래 탭 칸 수 ' + hs.length);
    assert(hs.every(h => h > 0 && h < 26), '메뉴 글자 높이(줄바꿈?): ' + hs.join(','));
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['380px 폭: 아래 탭 버튼이 모두 화면 안, 가로 메뉴는 한 줄 가로 스크롤(끝 탭까지 닿음), 본문도 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 380, height: 800 });
    await page.click('#moreBtn'); await page.click('#sheetRoot .more-go[data-more-go="settings"]'); await page.click('#menuTabs [data-tab="school"]');
    await page.click('section[data-menu="settings"] [data-set="addBreak"]');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      side: [...document.querySelectorAll('#bottomTabs .bt-btn')].map(b => { const x = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(x.left), Math.round(x.right)]; }),
      row: (() => { const el = document.querySelector('#menuTabs'), x = el.getBoundingClientRect(); return [Math.round(x.left), Math.round(x.right), getComputedStyle(el).overflowX]; })(),
      tops: [...new Set([...document.querySelectorAll('#menuTabs button')].map(b => Math.round(b.getBoundingClientRect().top)))],
      app: [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth],
      sideBox: [document.querySelector('#bottomTabs').scrollWidth, document.querySelector('#bottomTabs').clientWidth]
    }));
    assert(r.side.length === 5 && r.side.every(([, l, rt]) => l >= 0 && rt <= 380), '아래 탭 버튼이 화면 밖: ' + JSON.stringify(r.side));
    assert(r.row[0] >= 0 && r.row[1] <= 380 && r.row[2] === 'auto' && r.tops.length === 1, '가로 메뉴: ' + JSON.stringify(r));
    const last = await page.evaluate(() => { const b = [...document.querySelectorAll('#menuTabs button')].at(-1); b.scrollIntoView({ inline: 'end', block: 'nearest' }); const x = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(x.left), Math.round(x.right)]; });
    assert(last[1] >= 0 && last[2] <= 380, '끝 탭에 닿지 못함: ' + JSON.stringify(last));
    assert(r.sideBox[0] <= r.sideBox[1], '아래 탭이 넘침: ' + r.sideBox);
    assert(r.app[0] <= r.app[1], '본문이 넘침: ' + r.app);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['설정에서 끄고 다시 켜면 설정만 보이고 「곧 만들어요」 자리가 없음', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="ai"]');
    await page.reload(); await page.waitForTimeout(500);
    assert(await title() === '오늘', '켜면 오늘: ' + await title());
    await page.click('nav.app-side [data-menu-go="settings"]');
    assert(await title() === '설정' && await current('header.app-top nav.app-tabs') === 'AI', '제목: ' + await title());
    assert(await page.locator('section[data-menu="settings"] .ph').count() === 0, '설정에 「곧 만들어요」가 남음');
    assert((await page.textContent('section[data-menu="settings"]')).includes('지금 쓰는 AI'), '설정 › AI 내용 없음');
  }],
  ['품의에서 ⋮ → 새 평가계획 넣기를 누르면 평가로 감', async () => {
    await page.click('nav.app-side [data-menu-go="purchase"]');
    await page.click('#menuBtn'); await page.click('#menu [data-act="new"]');
    assert(await title() === '평가', '제목: ' + await title());
    assert(await page.isVisible('section[data-menu="evaluate"]'), '평가 화면이 안 보임');
    await page.keyboard.press('Escape');
  }],
  ['단원평가·창체·평가지 채점 탭에서 ⋮ → 새 평가계획 넣기를 누르면 교과 평어의 넣기 화면이 보임', async () => {
    for (const tab of ['unit', 'cc', 'gr']) {
      await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click(`#menuTabs [data-tab="${tab}"]`);
      await page.click('#menuBtn'); await page.click('#menu [data-act="new"]');
      await page.waitForTimeout(150);
      assert(await page.getAttribute('#menuTabs [data-tab="pyeongeo"]', 'aria-current') === 'page', tab + ': 탭이 그대로');
      assert(await page.isVisible('#importView'), tab + ': 넣기 화면이 안 보임');
    }
  }],
  ['단원평가를 쓰다 다른 메뉴에서 ⋮ → 새 평가계획 넣기: 마지막 탭(단원평가)이 아니라 교과 평어의 넣기 화면', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
    await page.click('nav.app-side [data-menu-go="plan"]');
    await page.click('#menuBtn'); await page.click('#menu [data-act="new"]');
    await page.waitForTimeout(150);
    assert(await title() === '평가', '제목: ' + await title());
    assert(await page.getAttribute('#menuTabs [data-tab="pyeongeo"]', 'aria-current') === 'page', '탭: ' + await page.textContent('#menuTabs [aria-current="page"]'));
    assert(await page.isVisible('#importView'), '넣기 화면이 안 보임');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
