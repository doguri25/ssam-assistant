// 파일 고르기 창이 열린 채(그 파일 칸을 잡은 채) 화면을 통째로 다시 그려도 고른 파일이 들어감(core/keep-files.js):
// 쪽지·공문 처리·새 품의·연간계획·행사계획·학급운영계획·학급 준비·설정 학급 명단·활동지·평가지 채점(한꺼번에 넣기)
// (가정통신문·결과 보고는 letter-fixes·fix1110-letter·report-fixes에서 봄)
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async () => '{}');
const txt = (name, text) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(text) });
const textOf = s => page.evaluate(s => (document.querySelector(s) || {}).textContent || '', s);
const until = async (fn, what, ms = 8000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과: ' + what); await page.waitForTimeout(50); } };
const goTab = async (menu, tab) => { await page.click(`nav.app-side [data-menu-go="${menu}"]`); await page.click(`#menuTabs [data-tab="${tab}"]`); };
// 지금 탭을 다시 누름 → 그 메뉴가 화면을 통째로 다시 그림
const sameTab = () => page.click('#menuTabs [aria-current="page"]');

/* 단추를 눌러 파일 고르기 창을 연 채 redraw()로 다시 그린 뒤 파일을 고름.
   누른 단추가 새로 그려졌는지(정말 다시 그렸는지)와, 고르기 창이 잡고 있는 칸이 화면에 남았는지를 봄 */
async function pickAfterRedraw(btn, files, redraw = sameTab) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(btn)]);
  await page.evaluate(s => { document.querySelector(s).dataset.kfOld = '1'; }, btn);
  await redraw();
  await page.waitForFunction(s => document.querySelector(s) && !document.querySelector(s).dataset.kfOld, btn, { timeout: 3000 }).catch(() => { throw new Error('다시 그리지 않음: ' + btn); });
  assert(await fc.element().evaluate(e => e.isConnected), '고르던 파일 칸이 화면에서 떨어져 나감: ' + btn);
  await fc.setFiles(files);
}

await page.goto(url);
await page.waitForTimeout(400);

await run('keep-files', [
  ['기타 › 쪽지 작성: 파일을 고르는 동안 다시 그려도 붙임에 들어감', async () => {
    const B = 'section[data-menu="etc"] .msg-box';
    await goTab('etc', 'message');
    await pickAfterRedraw(`${B} [data-msg="pick"]`, txt('가을 연수 안내문.txt', '11월 20일 연수 안내'));
    await until(async () => (await textOf(B)).includes('가을 연수 안내문'), '붙임');
  }],
  ['기타 › 공문 처리: 다시 그려도 공문 목록에 들어감', async () => {
    const B = 'section[data-menu="etc"] .gm-box';
    await goTab('etc', 'gongmun');
    await pickAfterRedraw(`${B} [data-gm="pick"]`, txt('체험학습 공문.txt', '현장체험학습 계획 제출 11월 30일까지'));
    await until(async () => (await textOf(`${B} #gmLists`)).includes('체험학습 공문'), '공문 목록');
  }],
  ['품의 › 새 품의: 다시 그려도 견적서 품목이 들어감', async () => {
    const B = 'section[data-menu="purchase"]';
    await goTab('purchase', 'new');
    await pickAfterRedraw(`${B} [data-pc="intakeFile"]`, join(FIXTURES, 'quote.csv'));
    await page.waitForFunction(s => [...document.querySelectorAll(`${s} [data-f="name"]`)].some(i => i.value === '비커'), B);
  }],
  ['계획 › 연간계획: 다시 그려도 작년 계획서 칸에 들어감(어느 칸에 넣을지도 그대로)', async () => {
    const B = 'section[data-menu="plan"] .yp-box';
    await goTab('plan', 'year');
    await pickAfterRedraw(`${B} [data-file="lastPlan"]`, txt('작년 독서 계획.txt', '작년 독서교육 계획 본문'));
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastPlan"]`) || {}).value?.includes('작년 독서교육 계획 본문'), B);
  }],
  ['계획 › 행사계획: 다시 그려도 참고 자료에 들어감', async () => {
    const B = 'section[data-menu="plan"] .ev-box';
    await goTab('plan', 'event');
    await pickAfterRedraw(`${B} [data-e="refFile"]`, txt('운동회 지침.txt', '운동회 안전 지침'));
    await until(async () => (await textOf(B)).includes('운동회 지침'), '참고 자료');
  }],
  ['계획 › 학급운영계획: 다시 그려도 작년 계획서 칸에 들어감', async () => {
    const B = 'section[data-menu="plan"] .cp-box';
    await goTab('plan', 'class');
    await pickAfterRedraw(`${B} [data-file="lastPlan"]`, join(FIXTURES, 'classplan-last.txt'));
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastPlan"]`) || {}).value?.trim(), B);
  }],
  ['학급 › 진도표·시수(준비): 다시 그려도 시간표 파일을 읽음', async () => {
    const B = 'section[data-menu="class"] .cls-setup';
    await goTab('class', 'progress');
    await page.selectOption(`${B} #clsGrade`, '3');
    await page.fill(`${B} #clsRoom`, '2'); await page.press(`${B} #clsRoom`, 'Tab');
    await pickAfterRedraw(`${B} [data-c="ttFile"]`, join(ROOT, 'samples', '시간표-예시.hwpx'));
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:class:timetable') || 'null') || { cells: [[]] }).cells[0][0] === '수학');
  }],
  ['설정 › 학급 명단: 다시 그려도 명렬표를 읽어 확인 창', async () => {
    await goTab('settings', 'roster');
    await pickAfterRedraw('section[data-menu="settings"] [data-set="rosterFile"]', join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector('#sheetRoot #rosterOk');
    await page.keyboard.press('Escape');
  }],
  ['평가 › 활동지: 다시 그려도 한꺼번에 넣기에 들어감', async () => {
    const B = 'section[data-menu="evaluate"]';
    await goTab('evaluate', 'activity');
    await page.click(`${B} [data-ac="new"]`);
    await pickAfterRedraw(`${B} [data-bundle-pick="act"]`, txt('물의 여행.txt', ['[과학] 3-2-1-02 물은 어디로 갈까? (12~13쪽)', '물의 여행 그리기', '◉ 물이 여행하는 길을 그려 봅시다.', '번호 | 그림', '1 | '].join('\n')));
    await until(async () => (await textOf(`${B} #actHave`)).includes('학생용 글') || await page.isVisible('#sheetRoot #bundleCard'), '활동지 글');
    if (await page.isVisible('#sheetRoot #bundleCard')) await page.click('#sheetRoot #bundleOk');
  }],
  ['평가 › 평가지 채점: 설정 칸을 다시 그려도 한꺼번에 넣기에 들어감', async () => {
    await goTab('evaluate', 'gr');
    await pickAfterRedraw('#grSetup [data-bundle-pick="gr"]', [{ name: '정답.txt', mimeType: 'text/plain', buffer: Buffer.from('[정답]\n1. 456\n2. 까닭 두 가지') }],
      () => page.evaluate(() => window.SSAM.setMode('gr')));
    await until(async () => (await textOf('#grCritBox')).includes('한꺼번에 넣은') || await page.isVisible('#sheetRoot #bundleCard'), '정답 문서');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
