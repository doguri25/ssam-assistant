// 「오늘」 화면·셸(스펙 2026-11-11 §1·§2): 켜면(새로 고침도) 오늘, 머리(날짜·할 일 수·AI 칩), 카드 3개(공문 기한·오늘 수업·교과캠프 출석),
// 파일 놓는 칸 → 받는 곳(inbox), 카드·줄 링크, 캠프 학생 버튼·[모두 출석], 이어서 하기, 처음 쓰는 선생님 안내, 채팅 [오늘 화면 열기],
// 390px: 아래 탭 5칸·더보기 시트·가로 넘침 없음·쌤 버튼이 아래 탭과 겹치지 않음
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const NOW = new Date('2026-11-11T10:05:00'); // 수요일 2교시(9:50~10:30)
await page.clock.setFixedTime(NOW);
const H = 'section[data-menu="home"]';
const title = () => page.textContent('#menuTitle');
const tabNow = () => page.locator('#menuTabs [aria-current="page"]').innerText();
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const waitTitle = x => page.waitForFunction(x => document.querySelector('#menuTitle').textContent === x, x);
const day = n => `2026-11-${String(11 + n).padStart(2, '0')}`;

// 시험 자료(지어낸 이름만): 공문 3개, 수요일 시간표·진도표·1교시 완료, 오늘 수업이 있는 캠프, 품의 초안, 다면평가 정량 값
const SEED = {
  engine: { engine: 'claude', keys: { claude: 'sk-test' }, remember: true },
  'gongmun:list': [
    { id: 'gm1', title: '안전 점검 결과 보고', due: day(-2), done: false, at: 1 },
    { id: 'gm2', title: '과학의 날 참가 신청', due: day(2), done: false, at: 2 },
    { id: 'gm3', title: '연수 이수 현황 제출', due: day(5), done: false, at: 3 },
    { id: 'gm4', title: '다 한 공문', due: day(1), done: true, at: 4 }],
  'class:timetable': { periods: 6, cells: [[], [], ['국어', '수학', '국어', '체육', '수학', ''], [], []] },
  'class:subjects': [
    { id: 'kor', name: '국어', offset: 0, lessons: [{ unit: '1. 마음을 나누어요', title: '시 낭송하기', no: '3/14' }, { unit: '1. 마음을 나누어요', title: '느낌 나누기', no: '4/14' }, { unit: '1. 마음을 나누어요', title: '시 바꿔 쓰기', no: '5/14' }] },
    { id: 'math', name: '수학', offset: 0, lessons: [{ unit: '2. 나눗셈', title: '몫 구하기', no: '1/10' }, { unit: '2. 나눗셈', title: '나머지 알기', no: '2/10' }] }],
  'class:log': { [day(0)]: { 1: { subject: '국어', status: 'done' } } },
  camp: { current: 'cpA', camps: [{ id: 'cpA', name: '수학 교과캠프', students: [{ id: 'a', grade: 3, cls: 1, no: 1, name: '김하늘' }, { id: 'b', grade: 3, cls: 1, no: 2, name: '이바다' }],
    sessions: [{ id: 'x1', date: day(0), start: '14:00', end: '14:40', subject: '수학' }, { id: 'x2', date: day(0), start: '14:50', end: '15:30', subject: '수학' }, { id: 'x3', date: day(1), start: '14:00', end: '14:40', subject: '수학' }], att: {} }] },
  'purchase:recent': [{ id: 'pc1', at: NOW.getTime() - 86400000, form: { type: 'normal', project: '과학 실험', items: [] }, draft: { title: '과학 실험 물품 구입' } }],
  multi: { quant: { values: { q1: { v: '23' }, q2: { v: '0' } } } }
};
await page.addInitScript(seed => {
  if (localStorage.getItem('ssam:__seeded')) return;
  for (const [k, v] of Object.entries(seed)) localStorage.setItem('ssam:' + k, JSON.stringify(v));
  localStorage.setItem('ssam:__seeded', '1');
}, SEED);
await page.goto(url);
await page.waitForSelector(`${H} .hm-cont .hm-row`);

await run('home', [
  ['켜면 오늘: 세로 메뉴 맨 위 「오늘」, 머리 제목 「오늘」, 가로 메뉴 없음', async () => {
    assert(await title() === '오늘', '제목: ' + await title());
    assert(await page.locator('nav.app-side .side-btn').first().innerText() === '오늘', '세로 메뉴 맨 위');
    assert(await page.locator('nav.app-side [aria-current="page"]').innerText() === '오늘', '지금 메뉴');
    assert(await page.isHidden('#menuTabs'), '가로 메뉴가 보임');
    assert(await page.isVisible(H) && await page.isHidden('section[data-menu="evaluate"]'), '오늘 화면만 보여야 함');
  }],
  ['다른 메뉴로 가서 새로 고쳐도 오늘(마지막 메뉴는 저장만), 메뉴마다 마지막 탭은 그대로', async () => {
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
    await page.click('nav.app-side [data-menu-go="purchase"]');
    assert((await stored('nav')).menu === 'purchase', '마지막 메뉴 저장: ' + JSON.stringify(await stored('nav')));
    await page.reload(); await page.waitForSelector(`${H} .hm-row`);
    assert(await title() === '오늘' && await page.isVisible(H), '새로 고친 뒤: ' + await title());
    await page.click('nav.app-side [data-menu-go="plan"]');
    assert(await tabNow() === '행사계획', '계획의 마지막 탭: ' + await tabNow());
    await page.click('nav.app-side [data-menu-go="home"]');
    assert(await page.isVisible(H) && await page.isHidden('#menuTabs'), '오늘로 돌아옴');
  }],
  ['머리: 날짜·학년도, 「오늘 챙길 일 n가지」(공문 3 + 남은 수업 + 캠프 출석 1), AI 칩 → 설정 › AI', async () => {
    assert(await page.textContent(`${H} .hm-date`) === '11월 11일 수요일 · 2026학년도', await page.textContent(`${H} .hm-date`));
    // 수업 5교시 가운데 1교시 완료, 체육은 진도표 없음 → 체크할 남은 수업 3
    assert(await page.textContent(`${H} .hm-head h2`) === '오늘 챙길 일 7가지', await page.textContent(`${H} .hm-head h2`));
    const chip = await page.textContent(`${H} .hm-ai`);
    assert(chip.includes('준비됨'), 'AI 칩: ' + chip);
    await page.click(`${H} .hm-ai`);
    assert(await title() === '설정' && await tabNow() === 'AI', '설정 › AI로 안 감');
    await page.click('nav.app-side [data-menu-go="home"]');
  }],
  ['화면의 주 버튼은 [파일 고르기] 하나', async () => {
    const p = await page.locator(`${H} .btn.primary`).allInnerTexts();
    assert(p.length === 1 && p[0] === '파일 고르기', JSON.stringify(p));
    assert((await page.textContent(`${H} .hm-drop`)).includes('무엇이든 여기에 놓으세요'), '놓는 칸 글');
  }],
  ['공문 기한: 지남·D-2·D-5(다 한 것 빼고), 배지에 글, [공문 처리] → 기타 › 공문 처리', async () => {
    const rows = await page.locator(`${H} .hm-gm .hm-line`).allInnerTexts();
    assert(rows.length === 3, JSON.stringify(rows));
    const badges = await page.locator(`${H} .hm-gm .hm-badge`).evaluateAll(bs => bs.map(b => b.childNodes.length && [...b.childNodes].filter(n => !(n.classList && n.classList.contains('sr-only'))).map(n => n.textContent).join('')));
    assert(JSON.stringify(badges) === JSON.stringify(['!지남', 'D-2', 'D-5']), JSON.stringify(badges));
    assert(rows[0].includes('안전 점검 결과 보고') && !rows.join('').includes('다 한 공문'), JSON.stringify(rows));
    await page.click(`${H} .hm-gm .hm-card-f [data-hm-go="gongmun"]`);
    assert(await title() === '기타' && await tabNow() === '공문 처리', `${await title()} › ${await tabNow()}`);
    await page.click('nav.app-side [data-menu-go="home"]');
  }],
  ['오늘 수업: 교시마다 교과·차시·상태, 2교시가 「지금」, [오늘 수업 열기] → 학급 › 오늘 수업', async () => {
    const ls = page.locator(`${H} .hm-today .hm-ls`);
    assert(await ls.count() === 5, '교시 수 ' + await ls.count());
    const one = await ls.nth(0).innerText(), two = await ls.nth(1).innerText();
    assert(one.includes('국어') && one.includes('3/14차시 · 시 낭송하기') && one.includes('완료'), one);
    assert(two.includes('수학') && two.includes('1/10차시') && two.includes('지금') && two.includes('남음'), two);
    assert(await ls.nth(1).getAttribute('aria-current') === 'time', '지금 교시 표시');
    assert((await ls.nth(3).innerText()).includes('진도표 없음'), await ls.nth(3).innerText());
    await page.click(`${H} .hm-today [data-hm-go="today"]`);
    assert(await title() === '학급' && await tabNow() === '오늘 수업', `${await title()} › ${await tabNow()}`);
    await page.click('nav.app-side [data-menu-go="home"]');
  }],
  ['교과캠프 출석: 학생마다 큰 버튼 — 누르면 그날 수업 모두 ○ → / → 빈칸, [모두 출석], [캠프 열기]', async () => {
    const card = `${H} .hm-camp`;
    assert((await page.textContent(card)).includes('수학 교과캠프') && (await page.textContent(card)).includes('오늘 2번'), await page.textContent(card));
    const btn = `${card} [data-hm-mark="a"]`;
    const box = await page.locator(btn).boundingBox();
    assert(box.width >= 64 && box.height >= 48, '버튼 크기 ' + JSON.stringify(box));
    const att = async () => (await stored('camp')).camps[0].att;
    await page.click(btn);
    let a = await att();
    assert(a.x1 && a.x1.a === 'O' && a.x2 && a.x2.a === 'O' && !a.x3, '○: ' + JSON.stringify(a));
    assert((await page.textContent(btn)).includes('출석'), await page.textContent(btn));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.hmMark) === 'a', '다시 그린 뒤 초점');
    await page.click(btn);
    a = await att();
    assert(a.x1.a === 'X' && a.x2.a === 'X', '/: ' + JSON.stringify(a));
    assert((await page.textContent(btn)).includes('결석'), await page.textContent(btn));
    await page.click(btn);
    a = await att();
    assert(!(a.x1 && a.x1.a) && !(a.x2 && a.x2.a), '빈칸: ' + JSON.stringify(a));
    await page.click(btn); await page.click(btn); // 김하늘 / 결석
    await page.click(`${card} [data-hm="attAll"]`);
    a = await att();
    assert(a.x1.a === 'X' && a.x2.a === 'X' && a.x1.b === 'O' && a.x2.b === 'O', '남은 칸만 출석(결석은 그대로): ' + JSON.stringify(a));
    assert((await page.textContent('#toast')).includes('남은 칸'), await page.textContent('#toast'));
    await page.click(btn); await page.click(btn); // / → 빈칸 → ○
    a = await att();
    assert(a.x1.a === 'O' && a.x2.a === 'O', '다시 ○: ' + JSON.stringify(a));
    assert((await page.textContent(`${H} .hm-head h2`)) === '오늘 챙길 일 6가지', '출석을 다 하면 할 일이 줄어듦: ' + await page.textContent(`${H} .hm-head h2`));
    await page.click(`${card} [data-hm-go="camp"]`);
    await waitTitle('학급');
    assert(await title() === '학급' && await tabNow() === '기초학력 캠프', `${await title()} › ${await tabNow()}`);
    await page.click('nav.app-side [data-menu-go="home"]');
  }],
  ['이어서 하기: 품의 초안·다면평가(정량 총점) 줄, 누르면 그 화면', async () => {
    const rows = await page.locator(`${H} .hm-cont .hm-row`).allInnerTexts();
    assert(rows.some(r => r.includes('품의 「과학 실험 물품 구입」 초안 이어서 쓰기')), JSON.stringify(rows));
    assert(rows.some(r => r.includes('다면평가 정량 28/100점')), JSON.stringify(rows));
    assert(!rows.some(r => r.includes('공문')), '공문은 카드에만: ' + JSON.stringify(rows));
    assert(rows.length <= 5, '5줄까지');
    await page.locator(`${H} .hm-row`, { hasText: '품의' }).click();
    assert(await title() === '품의' && await tabNow() === '최근 작성', `${await title()} › ${await tabNow()}`);
    await page.click('nav.app-side [data-menu-go="home"]');
    await page.locator(`${H} .hm-row`, { hasText: '다면평가' }).click();
    await waitTitle('기타');
    assert(await title() === '기타' && await tabNow() === '다면평가', `${await title()} › ${await tabNow()}`);
    await page.click('nav.app-side [data-menu-go="home"]');
  }],
  ['파일 놓는 칸: 끌어 놓기·[파일 고르기] 모두 받는 곳(쌤 버튼과 같은 확인 카드)으로', async () => {
    const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['안녕하세요. 회의는 3시입니다.'], '회의 메모.txt', { type: 'text/plain' })); return d; });
    await page.dispatchEvent(`${H} .hm-drop`, 'dragenter', { dataTransfer: dt });
    await page.dispatchEvent(`${H} .hm-drop`, 'dragover', { dataTransfer: dt });
    assert(await page.evaluate(() => document.querySelector('.hm-drop').classList.contains('over')), '끌어 오면 칸이 바뀌어야 함');
    await page.dispatchEvent(`${H} .hm-drop`, 'drop', { dataTransfer: dt });
    await page.waitForSelector('#sheetRoot .sheet h3');
    let txt = await page.textContent('#sheetRoot .sheet');
    assert(txt.includes('파일을 받았어요') && txt.includes('회의 메모.txt'), txt);
    await page.click('#sheetRoot [data-close]');
    await page.waitForFunction(() => !document.querySelector('#sheetRoot').childElementCount);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${H} [data-hm="pick"]`)]);
    await chooser.setFiles({ name: '안내.txt', mimeType: 'text/plain', buffer: Buffer.from('가정에 안내합니다.') });
    await page.waitForSelector('#sheetRoot .sheet h3');
    txt = await page.textContent('#sheetRoot .sheet');
    assert(txt.includes('파일을 받았어요') && txt.includes('안내.txt'), txt);
    await page.click('#sheetRoot [data-close]');
    await page.waitForFunction(() => !document.querySelector('#sheetRoot').childElementCount);
  }],
  ['오늘 캠프 수업이 없으면 캠프 카드를 숨기고 두 카드가 넓어짐', async () => {
    const gmW = () => page.evaluate(() => document.querySelector('section[data-menu="home"] .hm-gm').getBoundingClientRect().width); // 한 번에 재기(다시 그리는 중에도)
    const w1 = await gmW();
    await page.evaluate(() => { const c = JSON.parse(localStorage.getItem('ssam:camp')); c.camps[0].sessions.forEach(s => { s.date = '2026-11-20'; }); localStorage.setItem('ssam:camp', JSON.stringify(c)); });
    await page.click('nav.app-side [data-menu-go="purchase"]'); await page.click('nav.app-side [data-menu-go="home"]');
    assert(await page.locator(`${H} .hm-camp`).count() === 0, '캠프 카드가 남음');
    const w2 = await gmW();
    assert(w2 > w1 + 40, `넓어지지 않음 ${w1} → ${w2}`);
  }],
  ['채팅 「오늘 할 일」 맨 위 [오늘 화면 열기]', async () => {
    await page.click('nav.app-side [data-menu-go="etc"]');
    await page.click('#inboxFab');
    await page.waitForSelector('#chatPanel .chat-brief .cb-home');
    await page.click('#chatPanel .cb-home');
    assert(await title() === '오늘' && await page.isVisible(H), '오늘로 안 감: ' + await title());
    await page.click('#chatPanel [data-chat="close"]');
  }],
  ['390px: 아래 탭 5칸(오늘·평가·학급·품의·더보기), 칸 높이 52 이상, 세로 메뉴는 숨김, 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => ({
      labels: [...document.querySelectorAll('#bottomTabs .bt-btn')].map(b => b.textContent.trim()),
      hs: [...document.querySelectorAll('#bottomTabs .bt-btn')].map(b => b.getBoundingClientRect().height),
      bar: document.querySelector('#bottomTabs').getBoundingClientRect().toJSON(),
      side: [...document.querySelectorAll('nav.app-side .side-btn')].some(b => b.getBoundingClientRect().width > 0),
      sw: document.documentElement.scrollWidth, app: [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]
    }));
    assert(r.labels.join('|') === '오늘|평가|학급|품의|더보기', r.labels.join('|'));
    assert(r.hs.every(h => h >= 52), '칸 높이 ' + r.hs);
    assert(Math.round(r.bar.bottom) === 844 && r.bar.width === 390, '아래 탭 자리 ' + JSON.stringify(r.bar));
    assert(!r.side, '세로 메뉴 버튼이 보임');
    assert(r.sw <= 390 && r.app[0] <= r.app[1], '넘침 ' + JSON.stringify(r));
    assert(await page.isVisible('.app-logo .logo-mark'), '로고 마크');
    assert(await page.getAttribute('#bottomTabs [data-menu-go="home"]', 'aria-current') === 'page', '오늘 칸이 켜져야 함');
  }],
  ['390px: 쌤 버튼은 아래 탭 위, 마지막 글을 가리지 않게 내용 아래 여백', async () => {
    const f = await page.locator('#inboxFab').boundingBox(), bar = await page.locator('#bottomTabs').boundingBox();
    assert(f.y + f.height <= bar.y, `버튼 ${JSON.stringify(f)} / 아래 탭 ${JSON.stringify(bar)}`);
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#app')).paddingBottom));
    assert(pad >= f.height, '내용 아래 여백 ' + pad);
    await page.evaluate(() => window.SSAM.toast('시험 알림'));
    await page.waitForTimeout(400);
    const tb = await page.locator('#toast').boundingBox();
    assert(tb.y + tb.height <= f.y + 1, `알림이 버튼·아래 탭 위에: ${JSON.stringify(tb)}`);
  }],
  ['390px: 가로 메뉴는 한 줄 가로 스크롤 칩, 아래 탭으로 메뉴 옮김', async () => {
    await page.click('#bottomTabs [data-menu-go="evaluate"]');
    assert(await title() === '평가', await title());
    const r = await page.evaluate(() => { const el = document.querySelector('#menuTabs'), bs = [...el.querySelectorAll('button')];
      return { tops: [...new Set(bs.map(b => Math.round(b.getBoundingClientRect().top)))], scroll: getComputedStyle(el).overflowX, h: bs.map(b => b.getBoundingClientRect().height), sw: document.documentElement.scrollWidth }; });
    assert(r.tops.length === 1, '한 줄이 아님: ' + r.tops);
    assert(r.scroll === 'auto', 'overflow-x ' + r.scroll);
    assert(r.h.every(h => h >= 44), '칩 높이 ' + r.h);
    assert(r.sw <= 390, 'scrollWidth ' + r.sw);
    await page.click('#menuTabs [data-tab="activity"]');
    assert(await tabNow() === '활동지', '끝 칩 누르기');
    await page.click('#bottomTabs [data-menu-go="class"]');
    assert(await title() === '학급', await title());
  }],
  ['390px: 더보기 → 시트(계획·연수·기타·설정, 학년도·사용 중인 AI), 고르면 그 메뉴 + 더보기 칸이 켜짐', async () => {
    await page.click('#moreBtn');
    await page.waitForSelector('#sheetRoot .more-sheet');
    assert(await page.getAttribute('#moreBtn', 'aria-expanded') === 'true', '펼침 표시');
    const labels = await page.locator('#sheetRoot .more-go').allInnerTexts();
    assert(labels.join('|') === '계획|연수|기타|설정', labels.join('|'));
    const info = await page.textContent('#sheetRoot .more-foot');
    assert(info.includes('2026학년도') && info.includes('사용 중인 AI'), info);
    const sb = await page.locator('#sheetRoot .more-sheet').boundingBox();
    assert(sb.x >= 0 && sb.x + sb.width <= 390, '시트가 화면 밖 ' + JSON.stringify(sb));
    await page.click('#sheetRoot .more-go[data-more-go="plan"]');
    await page.waitForFunction(() => !document.querySelector('#sheetRoot').childElementCount);
    assert(await title() === '계획', await title());
    assert(await page.getAttribute('#moreBtn', 'aria-current') === 'page', '더보기 칸이 켜져야 함');
    assert(await page.getAttribute('#moreBtn', 'aria-expanded') === 'false', '닫힘 표시');
    await page.click('#moreBtn'); await page.waitForSelector('#sheetRoot .more-sheet');
    assert(await page.getAttribute('#sheetRoot .more-go[data-more-go="plan"]', 'aria-current') === 'page', '시트 안 지금 메뉴');
    await page.click('#sheetRoot .more-info[data-more-tab="years"]');
    assert(await title() === '설정' && await tabNow() === '학년도', `${await title()} › ${await tabNow()}`);
    await page.click('#bottomTabs [data-menu-go="home"]');
    assert(await page.getAttribute('#moreBtn', 'aria-current') === null, '오늘로 오면 더보기 칸은 꺼짐');
    for (const m of ['purchase', 'class', 'home']) {
      await page.click(`#bottomTabs [data-menu-go="${m}"]`); await page.waitForTimeout(100);
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]);
      assert(w[0] <= 390 && w[1] <= w[2], `${m} 넘침 ${w}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['처음 쓰는 선생님(다 비었으면): 시작 안내 3단계', async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('ssam:__seeded', '1'); });
    await page.reload(); await page.waitForSelector(`${H} .hm-start`);
    const steps = await page.locator(`${H} .hm-steps li b`).allInnerTexts();
    assert(steps.join('|') === 'AI 정하기|학급 명단 넣기|파일 놓기', steps.join('|'));
    assert(await page.textContent(`${H} .hm-head h2`) === '오늘은 급한 일이 없어요', await page.textContent(`${H} .hm-head h2`));
    assert((await page.textContent(`${H} .hm-ai`)).includes('AI를 정해 주세요'), 'AI 칩');
    await page.click(`${H} .hm-steps [data-hm-go="roster"]`);
    assert(await title() === '설정' && await tabNow() === '학급 명단', `${await title()} › ${await tabNow()}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
