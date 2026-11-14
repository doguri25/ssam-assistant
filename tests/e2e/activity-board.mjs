// 평가 › 활동지 한눈에(스펙 2026-11-14-eval-redesign §5)·채점 확인(§4):
// 5단계 학생 카드(수준 칩·더 도와줄 주황·선생님 차례 점선)·숫자 타일 거르기·반 전체로 보면·[표로 보기], 카드 → 4단계 그 학생 줄,
// [확인할 것만 보기] → 판단을 미룬 칸만 하나씩(정하면 4단계와 같은 저장·다음 칸, ← → 는 화면 안에서만), 다 보면 「다 확인했어요」,
// 한눈에가 부를 openReview(id), 옛 활동지, 390px 가로 넘침·누름 칸 크기
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const B = '.act-box';
const ID = 'acBoard';
const getAct = () => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:activity:a:' + id)), ID);
const goAct = () => page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'activity')));
// 지어낸 예시 활동지(학생 6명, 번호만)에 노란 칸 셋: 2번 3문항(△, 까닭), 4번 1문항(×, 검토 AI는 ○), 6번 4문항(표시 없음)
const seed = () => page.evaluate(async id => {
  const { sampleActivity } = await import('./menus/evaluate/activity/activity-sample.js');
  const m = await import('./menus/evaluate/activity/activity-model.js');
  const a = sampleActivity();
  a.id = id; a.meta.title = '물의 여행 그리기'; a.meta.sample = false;
  Object.assign(a.students[1].marks[3], { chk: true, sure: false, read: '바다의 물이 구름이 돼요', why: '글씨가 흐려요' });
  Object.assign(a.students[3].marks[1], { chk: true, sure: false, read: '①', rv: { mark: 'o', why: '①로도 볼 수 있어요' } });
  Object.assign(a.students[5].marks[4], { chk: true, sure: false, mark: '', read: '', why: '' });
  m.saveActivity(a);
}, ID);
const openAt = step => page.evaluate(([id, step]) => import('./menus/evaluate/activity/activity.js').then(m => m.openActivity(id, step)), [ID, step]);
const cards = () => page.$$eval(`${B} #acGallery [data-ac-stu]`, l => l.map(x => +x.dataset.acStu));
const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

await page.goto(url);
await page.waitForTimeout(400);
await goAct();
await seed();

await run('activity-board', [
  ['5단계 첫 화면은 학생 카드: 수준 칩(잘함 파랑·보통·노력은 「더 도와줄」 주황 카드), 확인할 칸이 남은 학생은 주황 점선 + 「선생님 차례」', async () => {
    await openAt(5);
    await page.waitForSelector(`${B} #acGallery`);
    assert(JSON.stringify(await cards()) === '[1,2,3,4,5,6]', JSON.stringify(await cards()));
    const card = no => `${B} [data-ac-stu="${no}"]`;
    assert(await page.textContent(`${card(1)} .ev-chip.done`) === '잘함', '잘함 칩');
    assert((await page.textContent(`${card(5)} .ev-chip:not(.done):not(.turn):not(.turn-soft)`)) === '보통', '보통 칩');
    // 4번(노력)은 확인할 칸도 있어 점선이 앞섬, 노력 칩은 「더 도와줄」
    assert(await page.textContent(`${card(4)} .ev-chip.turn`) === '더 도와줄', '더 도와줄 칩');
    assert(await page.getAttribute(card(4), 'class').then(c => c.includes('turn-dash')), '4번 점선');
    assert(await page.getAttribute(card(2), 'class').then(c => c.includes('turn-dash')), '2번 점선');
    assert((await page.textContent(`${card(2)} .ac-gc-turn`)).replace(/\s+/g, ' ').includes('선생님 차례 3번 문항'), await page.textContent(`${card(2)} .ac-gc-turn`));
    assert(!(await page.getAttribute(card(1), 'class')).includes('turn'), '1번은 보통 카드');
    // 한 줄: 잘한 점(노력 학생은 더 해 볼 점), 그림은 없음
    assert((await page.textContent(`${card(1)} .ac-gc-line`)).includes('물의 여행을 차례대로 설명했어요'), '1번 한 줄');
    assert((await page.textContent(`${card(4)} .ac-gc-line`)).includes('2번 빈칸을 다시 채워 보세요'), '4번 한 줄');
    assert(await page.locator(`${B} #acGallery img`).count() === 0, '그림 없음');
    assert(await page.evaluate(() => document.querySelector('.act-box [data-ac-stu="1"]').tagName) === 'BUTTON', '카드는 단추');
  }],
  ['숫자 타일(전체 6 · 잘함 3 · 보통 2 · 더 도와줄 1 · 선생님 차례 3)을 누르면 그 카드만, 누른 타일은 aria-pressed', async () => {
    const tile = f => `${B} [data-ac-f="${f}"]`;
    const n = async f => (await page.textContent(`${tile(f)} .ev-num`)).trim();
    assert([await n('all'), await n('good'), await n('ok'), await n('try'), await n('turn')].join(',') === '6,3,2,1,3', [await n('all'), await n('good'), await n('ok'), await n('try'), await n('turn')].join(','));
    assert((await page.textContent(tile('try'))).includes('더 도와줄') && (await page.textContent(tile('turn'))).includes('선생님 차례'), '타일 이름');
    assert(await page.getAttribute(tile('all'), 'aria-pressed') === 'true', '처음은 전체');
    await page.click(tile('turn'));
    assert(JSON.stringify(await cards()) === '[2,4,6]', JSON.stringify(await cards()));
    assert(await page.getAttribute(tile('turn'), 'aria-pressed') === 'true' && await page.getAttribute(tile('all'), 'aria-pressed') === 'false', 'pressed');
    await page.click(tile('good'));
    assert(JSON.stringify(await cards()) === '[1,3,6]', JSON.stringify(await cards()));
    await page.click(tile('try'));
    assert(JSON.stringify(await cards()) === '[4]', JSON.stringify(await cards()));
    await page.click(tile('all'));
    assert((await cards()).length === 6, '전체로');
  }],
  ['반 전체로 보면: ×·안 함이 많은 문항 먼저 3개와 수준 나눔, 판단을 미룬 칸 3개', async () => {
    const items = await page.$$eval(`${B} .ac-whole #acStats li`, l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert(items.length === 3 && items[0].includes('2번') && items[0].includes('2명이 놓쳤어요') && items[0].includes('× 1') && items[0].includes('안 함 1'), items.join(' | '));
    assert(items[1].startsWith('4번') && items[2].startsWith('1번'), items.join(' | '));
    const lv = (await page.textContent(`${B} .ac-w-lv`)).replace(/\s+/g, ' ');
    assert(/잘함\s*3/.test(lv) && /보통\s*2/.test(lv) && /더 도와줄\s*1/.test(lv), lv);
    assert((await page.textContent(`${B} .ac-w-turn`)).includes('판단을 미룬 칸 3개'), '미룬 칸');
  }],
  ['[표로 보기]: 문항별 전부·반 표(지금까지의 표)로, 다시 누르면 카드, 내려받기·확정은 그대로', async () => {
    await page.click(`${B} [data-ac="tableView"]`);
    await page.waitForSelector(`${B} #acTable`);
    assert(await page.locator(`${B} #acStats li`).count() === 4, '문항 4개');
    assert(await page.locator(`${B} #acTable tbody tr`).count() === 6, '반 표 6명');
    assert(await page.locator(`${B} #acGallery`).count() === 0, '카드 숨김');
    assert(await page.getAttribute(`${B} [data-ac="tableView"]`, 'aria-pressed') === 'true', 'pressed');
    for (const sel of ['[data-ac="copyTable"]', '[data-ac="exportTable"]', '[data-ac="exportSlips"]', '[data-ac="done"]', '[data-ac="link"]']) assert(await page.locator(`${B} ${sel}`).count() > 0, sel);
    await page.click(`${B} [data-ac="tableView"]`);
    await page.waitForSelector(`${B} #acGallery`);
    for (const sel of ['[data-ac="exportTable"]', '[data-ac="exportSlips"]', '[data-fold="act-slip"]', '[data-ac="done"]', '#acAcc5']) assert(await page.locator(`${B} ${sel}`).count() > 0, '카드 화면 ' + sel);
  }],
  ['카드를 누르면 4단계 표에서 그 학생 줄(보이고 첫 칸에 초점) — 칸 고치기는 그대로', async () => {
    await page.click(`${B} [data-ac-stu="5"]`);
    await page.waitForSelector(`${B} #acGrid tr.ac-row-on[data-row="5"]`);
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.cell === '5|1'), '초점');
    assert(await page.evaluate(() => document.querySelector('.act-box .steps li.cur') && document.querySelector('.act-box .steps li.cur').textContent.includes('채점')), '4단계');
    // 4단계에도 [확인할 것만 보기]
    assert(await page.locator(`${B} [data-ac="review"]`).count() === 1, '4단계 확인 단추');
  }],
  ['[확인할 것만 보기] → 확인할 칸 목록(번호·문항)과 첫 칸: 문항·읽은 답·까닭, 기준과 쌤비서 생각(AI 값 주황)', async () => {
    await openAt(5);
    await page.click(`${B} .ac-r-bar [data-ac="review"]`);
    await page.waitForSelector(`${B} .ev-rv.ac-rv`);
    const list = await page.$$eval(`${B} .ev-rv-item`, l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert(list.length === 3 && list[0].startsWith('2번 · 3번 문항') && list[1].startsWith('4번 · 1번 문항') && list[2].startsWith('6번 · 4번 문항'), list.join(' | '));
    assert(await page.getAttribute(`${B} .ev-rv-item >> nth=0`, 'aria-current') === 'true', '첫 칸이 지금');
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('1 / 3'), await page.textContent(`${B} .ev-rv-lh`));
    assert((await page.textContent(`${B} .ac-rv-ask`)).includes('물의 여행을 설명해 봅시다'), '문항');
    assert((await page.textContent(`${B} .ev-rv-answer`)).includes('바다의 물이 구름이 돼요'), '읽은 답');
    assert((await page.textContent(`${B} .ac-rv-why`)).includes('글씨가 흐려요'), '까닭');
    assert(await page.getAttribute(`${B} .ev-rv-opt.ai`, 'data-rv-mark') === 't', 'AI 값 △');
    assert((await page.textContent(`${B} .ev-rv-opt.ai`)).includes('쌤비서 생각'), '쌤비서 생각 표시');
    assert(await page.evaluate(() => document.activeElement && !!document.activeElement.closest('.ac-rv')), '열면 초점이 화면 안');
  }],
  ['← → 는 화면 안에 초점이 있을 때만 앞뒤, 글 칸에서는 움직이지 않음', async () => {
    await page.keyboard.press('ArrowRight');
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('2 / 3'), '→');
    assert((await page.textContent(`${B} .ac-rv-why`)).includes('검토 AI는'), '4번 칸: 검토 AI 의견');
    await page.keyboard.press('ArrowLeft');
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('1 / 3'), '←');
    await page.focus(`${B} #acRvRead`);
    await page.keyboard.press('ArrowRight');
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('1 / 3'), '글 칸에서 움직임');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('1 / 3'), '화면 밖 초점에서 움직임');
  }],
  ['정하면 4단계와 같은 저장(선생님이 정함·노란 칸·검토 의견 지움, 읽은 답 고침)·다음 칸으로, 피드백 고치기도 저장', async () => {
    await page.fill(`${B} .ac-rv-fb [data-rv-note="good"]`, '설명을 끝까지 썼어요.');
    await page.fill(`${B} #acRvRead`, '바다의 물이 증발해 구름이 돼요');
    await page.click(`${B} .ac-rv-opts [data-rv-mark="o"]`);
    let a = await getAct();
    const c = a.students[1].marks[3];
    assert(c.mark === 'o' && c.manual === true && c.chk === false && c.read === '바다의 물이 증발해 구름이 돼요' && c.ai0 === 't', JSON.stringify(c));
    assert(a.students[1].good === '설명을 끝까지 썼어요.' && a.students[1].goodManual === true, '피드백');
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('2 / 3'), '다음 칸');
    assert(await page.getAttribute(`${B} .ev-rv-item >> nth=0`, 'class').then(x => x.includes('done')), '정한 칸 표시');
    // 검토 AI 생각으로 정하기
    await page.click(`${B} .ac-rv-why .btn[data-rv-mark="o"]`);
    a = await getAct();
    assert(a.students[3].marks[1].mark === 'o' && !a.students[3].marks[1].rv && !a.students[3].marks[1].chk, JSON.stringify(a.students[3].marks[1]));
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('3 / 3'), '마지막 칸');
    assert((await page.textContent(`${B} .ac-rv-keys`)).includes('정하면 확인이 끝나요'), '끝 안내');
  }],
  ['마지막 칸을 정하면 「다 확인했어요」 → [결과로 가기]는 5단계 카드(선생님 차례 0, 점선 없음)', async () => {
    await page.click(`${B} .ac-rv-opts [data-rv-mark="t"]`);
    await page.waitForSelector(`${B} .ac-rv-done`);
    assert((await page.textContent(`${B} .ac-rv-done`)).includes('다 확인했어요'), '다 확인');
    assert((await getAct()).students[5].marks[4].mark === 't', '6번 저장');
    await page.click(`${B} .ac-rv-done [data-ac="rvBack"]`);
    await page.waitForSelector(`${B} #acGallery`);
    assert((await page.textContent(`${B} [data-ac-f="turn"] .ev-num`)).trim() === '0', '선생님 차례 0');
    assert(await page.locator(`${B} .ac-gc.turn-dash`).count() === 0, '점선 없음');
    assert(await page.locator(`${B} .ac-r-bar [data-ac="review"]`).count() === 0, '확인 단추 숨김');
  }],
  ['한눈에의 [선생님 차례]가 부를 openReview(id): 다른 탭에서도 그 활동지 확인 화면, 확인할 칸이 없으면 「확인할 칸이 없어요」', async () => {
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'board')));
    await page.evaluate(id => import('./menus/evaluate/activity/activity.js').then(m => { window.__go = import('./core/shell.js').then(s => { s.go('evaluate', 'activity'); m.openReview(id); }); return window.__go; }), ID);
    await page.waitForSelector(`${B} .ac-rv-done`);
    assert((await page.textContent(`${B} .ac-rv-done`)).includes('확인할 칸이 없어요'), await page.textContent(`${B} .ac-rv-done`));
    await page.evaluate(id => import('./menus/evaluate/activity/activity-model.js').then(m => { const a = m.getActivity(id); Object.assign(a.students[0].marks[2], { chk: true, manual: false }); m.saveActivity(a); }), ID);
    await page.evaluate(id => import('./menus/evaluate/activity/activity.js').then(m => m.openReview(id)), ID);
    await page.waitForSelector(`${B} .ac-rv-card`);
    assert((await page.textContent(`${B} .ev-rv-lh`)).includes('1 / 1') && (await page.textContent(`${B} .ev-rv-item`)).includes('1번 · 2번 문항'), await page.textContent(`${B} .ev-rv-list`));
    await page.click(`${B} [data-ac="rvGrid"]`);
    await page.waitForSelector(`${B} #acGrid`);
  }],
  ['옛 활동지(수준·잘한 점·까닭 없는 칸)도 5단계 카드·확인 화면이 열림', async () => {
    await page.evaluate(() => {
      const a = { id: 'acOld2', meta: { title: '옛 활동지', subject: '국어', date: '2025-09-01', term: 2 }, sheet: { student: '', teacher: '' }, confirmed: true, done: true, link: null, createdAt: 1,
        items: [{ no: 1, type: 'write', ask: '느낌 쓰기', answer: '', ok: '', part: '', src: 'ai' }],
        students: [1, 2].map(no => ({ no, skip: false, status: 'done', marks: { 1: { mark: no === 1 ? 'o' : 'x', chk: no === 2 } } })) };
      localStorage.setItem('ssam:activity:a:acOld2', JSON.stringify(a));
      const l = JSON.parse(localStorage.getItem('ssam:activity:list') || '[]'); l.push({ id: 'acOld2', title: '옛 활동지', subject: '국어', date: '2025-09-01', term: 2, n: 2, done: true, at: 1 });
      localStorage.setItem('ssam:activity:list', JSON.stringify(l));
    });
    await page.evaluate(() => import('./menus/evaluate/activity/activity.js').then(m => m.openActivity('acOld2')));
    await page.waitForSelector(`${B} #acGallery`);
    assert((await cards()).length === 2, '카드 2장');
    assert((await page.textContent(`${B} [data-ac-f="turn"] .ev-num`)).trim() === '1', '선생님 차례 1');
    await page.click(`${B} .ac-r-bar [data-ac="review"]`);
    await page.waitForSelector(`${B} .ac-rv-card`);
    assert((await page.textContent(`${B} .ev-rv-answer`)).includes('읽은 답이 없어요'), '읽은 답 없음');
    assert((await page.textContent(`${B} .ac-rv-why`)).includes('확신하지 못했어요'), '까닭 없음 안내');
  }],
  ['390px: 카드·확인 화면 가로 넘침 없음, 타일·카드·정하기 단추는 44px 이상', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    assert(await over() <= 0, '확인 화면 ' + await over());
    const small = sel => page.$$eval(sel, l => l.filter(x => { const r = x.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).length);
    assert(await small(`${B} .ev-rv-opt, ${B} .ac-rv .btn, ${B} .ev-rv-item`) === 0, '확인 화면 작은 단추');
    await openAt(5);
    await page.waitForSelector(`${B} #acGallery`);
    assert(await over() <= 0, '카드 ' + await over());
    assert(await small(`${B} .ev-tile, ${B} .ac-gc, ${B} .ac-r-bar .btn, ${B} .ac-r-bar .ev-turn-btn`) === 0, '카드 화면 작은 단추');
    await page.click(`${B} [data-ac="tableView"]`);
    assert(await over() <= 0, '표 ' + await over());
    await page.click(`${B} [data-ac="tableView"]`);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
