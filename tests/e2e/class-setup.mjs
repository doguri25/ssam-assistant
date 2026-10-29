// 학급 › 진도표·시수: 예시로 채우기, 요약 숫자, 시간표 칸, 다음 차시, 진도표 고치기, 교과 지우기, 저장 실패, 좁은 화면
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const V = 'section[data-menu="class"]';
const go = async () => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]'); };
const row = name => page.locator(`${V} .cls-sum tbody tr`, { hasText: name }).first();
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
await page.goto(url);
await page.waitForTimeout(400);
await go();

await run('class-setup', [
  ['처음: 요약 대신 안내, 준비 칸이 보임', async () => {
    assert((await page.textContent(`${V} .cls-progress`)).includes('진도표를 넣으면'), '안내');
    assert(await page.isVisible(`${V} .cls-setup #clsPeriods`), '준비 칸');
    assert(!(await page.isVisible(`${V} .ph`)), '자리표시가 남음');
  }],
  ['예시로 채우기 → 진도 차이 국어 −2, 수학 +1, 과학은 시간표 기준', async () => {
    await page.click(`${V} [data-c="sample"]`);
    await page.waitForSelector(`${V} .cls-sum tbody tr`);
    assert((await row('국어').textContent()).includes('−2'), '국어: ' + await row('국어').textContent());
    assert((await row('수학').textContent()).includes('+1'), '수학');
    assert((await row('과학').textContent()).includes('시간표'), '과학 기준');
    assert((await row('사회').textContent()).includes('진도표'), '사회 기준');
    assert(await page.inputValue(`${V} #clsGrade`) === '3' && await page.inputValue(`${V} #clsRoom`) === '1', '학급');
  }],
  ['자료가 있으면 예시는 확인을 거침(취소하면 그대로)', async () => {
    await page.fill(`${V} input[data-cell="0-1"]`, '영어'); await page.press(`${V} input[data-cell="0-1"]`, 'Tab');
    await page.click(`${V} [data-c="sample"]`);
    await page.waitForSelector('#sheetRoot .sheet');
    assert((await page.textContent('#sheetRoot .sheet')).includes('지금 자료를 지우고 예시로 바꿀까요?'), '확인 문구');
    await page.click('#sheetRoot [data-close]');
    assert((await stored('class:timetable')).cells[0][0] === '영어', '취소했는데 바뀜');
    await page.click(`${V} [data-c="sample"]`);
    await page.click('#sheetRoot #clsSampleOk');
    await page.waitForTimeout(100);
    assert((await stored('class:timetable')).cells[0][0] === '국어', '예시로 안 바뀜');
    assert(await page.inputValue(`${V} input[data-cell="0-1"]`) === '국어', '칸');
  }],
  ['시간표 칸 「수 학」 → 「수학」, 교시 수 7', async () => {
    await page.fill(`${V} input[data-cell="4-6"]`, '수 학'); await page.press(`${V} input[data-cell="4-6"]`, 'Tab');
    assert((await stored('class:timetable')).cells[4][5] === '수학', '저장값');
    assert(await page.inputValue(`${V} input[data-cell="4-6"]`) === '수학', '칸 값');
    await page.selectOption(`${V} #clsPeriods`, '7');
    assert(await page.locator(`${V} input[data-cell^="0-"]`).count() === 7, '7교시');
    assert((await stored('class:timetable')).periods === 7, '저장된 교시 수');
  }],
  ['다음 차시를 고치면 요약에 반영', async () => {
    await page.fill(`${V} input[data-next="smp-ko"]`, '5'); await page.press(`${V} input[data-next="smp-ko"]`, 'Tab');
    await page.waitForTimeout(100);
    assert((await row('국어').textContent()).includes('5차시'), '요약: ' + await row('국어').textContent());
  }],
  ['진도표 고치기: 줄 추가·학습 주제 고침 → 차시 수 +1', async () => {
    const before = (await stored('class:subjects')).find(s => s.id === 'smp-sc').lessons.length;
    await page.click(`${V} [data-c="editSub"][data-id="smp-sc"]`);
    await page.waitForSelector('#sheetRoot .sheet input[data-l="0-title"]');
    await page.click('#sheetRoot [data-c="addRow"]');
    await page.fill(`#sheetRoot input[data-l="${before}-title"]`, '추가한 실험');
    await page.fill('#sheetRoot input[data-l="0-title"]', '고친 첫 차시');
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForTimeout(100);
    const sc = (await stored('class:subjects')).find(s => s.id === 'smp-sc');
    assert(sc.lessons.length === before + 1 && sc.lessons.at(-1).title === '추가한 실험' && sc.lessons[0].title === '고친 첫 차시', '저장: ' + sc.lessons.length);
    assert((await row('과학').textContent()).includes(String(before + 1)), '요약 계획');
  }],
  ['교과 지우기는 확인을 거치고, 체크 기록은 남김', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:class:log', JSON.stringify({ '2026-10-28': { 4: { subject: '과학', status: 'done' } } })));
    await page.click(`${V} [data-c="delSub"][data-id="smp-sc"]`);
    await page.waitForSelector('#sheetRoot .sheet');
    await page.click('#sheetRoot #clsDelOk');
    await page.waitForTimeout(100);
    assert(!(await stored('class:subjects')).some(s => s.id === 'smp-sc'), '안 지워짐');
    assert((await stored('class:log'))['2026-10-28'], '기록이 지워짐');
    assert(await page.locator(`${V} .cls-sum tbody tr`, { hasText: '과학' }).count() === 0, '요약에 남음');
  }],
  ['저장 공간이 모자라면 알림', async () => {
    await page.evaluate(() => { const f = Storage.prototype.setItem; window.__set = f; Storage.prototype.setItem = function (k, v) { if (String(k).startsWith('ssam:class:')) throw new Error('quota'); return f.call(this, k, v); }; });
    await page.fill(`${V} input[data-cell="1-1"]`, '체육'); await page.press(`${V} input[data-cell="1-1"]`, 'Tab');
    await page.waitForTimeout(100);
    assert((await page.textContent('#toast')).includes('저장 공간이 모자라 저장하지 못했어요'), '알림: ' + await page.textContent('#toast'));
    await page.evaluate(() => { Storage.prototype.setItem = window.__set; });
  }],
  ['좁은 화면(360px)에서 가로 스크롤 없음', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['주 번호만 있는 진도표(기간 없음)에도 「1주 시작일」 칸', async () => {
    await page.evaluate(() => {
      const L = Array.from({ length: 10 }, (_, i) => ({ week: 1 + Math.floor(i / 5), period: '', from: '', unit: '1. 생명', title: '차시 ' + (i + 1), pages: '', memo: '' }));
      const subs = JSON.parse(localStorage.getItem('ssam:class:subjects'));
      subs.push({ id: 'wk1', name: '도덕', start: '2026-10-29', offset: 0, total: null, lessons: L });
      localStorage.setItem('ssam:class:subjects', JSON.stringify(subs));
    });
    await page.click('#menuTabs [data-tab="today"]'); await page.click('#menuTabs [data-tab="progress"]');
    const f = page.locator(`${V} input[data-start="wk1"]`);
    assert(await f.count() === 1, '시작일 칸이 없음');
    assert((await f.locator('xpath=..').textContent()).includes('1주 시작일'), '이름');
    await f.fill('2026-08-24'); await f.press('Tab');
    assert((await stored('class:subjects')).find(s => s.id === 'wk1').start === '2026-08-24', '저장');
    assert(await page.locator(`${V} input[data-start="smp-ko"]`).count() === 0, '기간 있는 진도표에도 보임');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
