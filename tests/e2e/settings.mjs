// 설정 메뉴: 학급 명단(평가와 같이 씀), AI, 화면(테마), 학교 정보, 품의 기준, 만든이 표시
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const tab = async id => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
const S = 'section[data-menu="settings"]';
await page.goto(url);
await page.waitForTimeout(500);

await run('settings', [
  ['학급 명단을 바꾸면 창의적 체험활동도 같은 명단', async () => {
    await tab('roster');
    await page.fill(`${S} [data-cls="count"]`, '24'); await page.press(`${S} [data-cls="count"]`, 'Tab');
    await page.fill(`${S} [data-cls="except"]`, '7'); await page.press(`${S} [data-cls="except"]`, 'Tab');
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="cc"]');
    const txt = await page.textContent('#ccResults');
    assert(txt.includes('학생 23명 (7번 제외)'), '창체 결과 머리: ' + txt.slice(0, 120));
  }],
  ['AI 탭에서 [AI 바꾸기]를 누르면 AI 설정 창', async () => {
    await tab('ai');
    assert((await page.textContent(S)).includes('지금 쓰는 AI'), 'AI 요약 없음');
    await page.click(`${S} [data-set="openAi"]`);
    assert(await page.isVisible('#engSeg'), 'AI 설정 창이 안 열림');
    await page.click('#sheetRoot [data-close]');
  }],
  ['화면 탭에서 종이 문서를 고르면 바로 바뀜', async () => {
    await tab('screen');
    assert(await page.locator(`${S} [data-theme-pick]`).count() === 5, '테마 카드 수');
    await page.click(`${S} [data-theme-pick="paper"]`);
    assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'paper', '테마가 안 바뀜');
    assert(await page.isChecked(`${S} [data-theme-pick="paper"] input`), '고른 카드가 표시 안 됨');
  }],
  ['학교 정보를 저장하면 새로고침해도 남음', async () => {
    await tab('school');
    await page.fill(`${S} #schName`, '쌤초등학교');
    await page.fill(`${S} #schClasses`, '24');
    await page.fill(`${S} #schStudents`, '560');
    await page.click(`${S} [data-set="addBreak"]`);
    await page.fill(`${S} [data-break="0"][data-f="label"]`, '여름방학');
    await page.fill(`${S} [data-break="0"][data-f="from"]`, '2027-07-24');
    await page.fill(`${S} [data-break="0"][data-f="to"]`, '2027-08-20');
    await page.click(`${S} [data-set="saveSchool"]`);
    await page.reload(); await page.waitForTimeout(300);
    assert(await page.inputValue(`${S} #schName`) === '쌤초등학교', '학교명');
    assert(await page.inputValue(`${S} #schClasses`) === '24', '학급 수');
    assert(await page.inputValue(`${S} [data-break="0"][data-f="label"]`) === '여름방학', '방학 이름');
  }],
  ['방학 시작일이 끝일보다 늦으면 저장하지 않고 알려 줌', async () => {
    await page.fill(`${S} [data-break="0"][data-f="from"]`, '2027-09-01');
    await page.click(`${S} [data-set="saveSchool"]`);
    assert((await page.textContent(S)).includes('시작일이 끝일보다 늦어요'), '안내 없음');
    await page.reload(); await page.waitForTimeout(300);
    assert(await page.inputValue(`${S} [data-break="0"][data-f="from"]`) === '2027-07-24', '잘못된 값이 저장됨');
  }],
  ['품의 기준 금액: 기본 20,000,000원, 바꾸면 남고, 잘못된 값은 거절', async () => {
    await tab('purchase');
    assert(await page.inputValue(`${S} #limitWon`) === '20000000', '기본값');
    assert((await page.textContent(S)).includes('행정실에 확인해 주세요'), '안내 문구');
    await page.fill(`${S} #limitWon`, '30000000'); await page.click(`${S} [data-set="saveLimit"]`);
    await page.reload(); await page.waitForTimeout(300);
    assert(await page.inputValue(`${S} #limitWon`) === '30000000', '저장 안 됨');
    await page.fill(`${S} #limitWon`, '-5'); await page.click(`${S} [data-set="saveLimit"]`);
    assert((await page.textContent(S)).includes('1원 이상'), '거절 안내 없음');
  }],
  ['설정 아래에 만든이·연락처', async () => {
    assert(await page.isVisible(`${S} .credit`), '만든이 표시가 안 보임');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
