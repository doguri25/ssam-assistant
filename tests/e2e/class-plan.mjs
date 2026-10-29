// 계획 › 학급운영계획: 1 자료 넣기 → 2 목차 → 3 초안 → 4 첨부·내보내기
import { join } from 'node:path';
import { open, run, assert, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const V = 'section[data-menu="plan"] .cp-box';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="class"]'); };
const cur = () => page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return m.getPlan(m.currentId()); });
const upload = async (sel, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(files); };
await page.goto(url);
await page.waitForTimeout(300);
await page.evaluate(() => localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 })));
await page.reload(); await page.waitForTimeout(400);
await go();

await run('class-plan', [
  ['탭과 단계 4개, 학급 메뉴의 학년·반과 계획 학년도를 미리 채움', async () => {
    await page.waitForSelector(`${V} ol.steps`);
    const steps = await page.locator(`${V} ol.steps li`).allInnerTexts();
    assert(steps.length === 4 && steps[1].includes('목차') && steps[3].includes('첨부'), steps.join('|'));
    assert(await page.inputValue(`${V} #cpGrade`) === '3' && await page.inputValue(`${V} #cpRoom`) === '2' && await page.inputValue(`${V} #cpYear`) === '2027', '학급 정보');
  }],
  ['작년 계획서 파일을 넣으면 이름·전화번호 줄을 빼고 넣고 알려 줌', async () => {
    await page.fill(`${V} #cpBoys`, '13'); await page.fill(`${V} #cpGirls`, '12');
    await upload(`${V} [data-file="lastPlan"]`, join(FIXTURES, 'classplan-last.txt'));
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastPlan"]`) || {}).value?.includes('학급 실태'), V);
    const v = await page.inputValue(`${V} textarea[data-src="lastPlan"]`);
    assert(!v.includes('김가람') && !v.includes('010-2345'), '이름·전화가 남음');
    assert((await page.textContent('#toast')).includes('이름·전화번호가 적힌 줄 2개'), await page.textContent('#toast'));
    const p = await cur();
    assert(p.boys === 13 && p.girls === 12 && p.sourceNames.lastPlan[0] === 'classplan-last.txt', JSON.stringify([p.boys, p.girls, p.sourceNames]));
  }],
  ['2단계 목차: 작년 계획서 목차 그대로, 시수표·평가 표 칸 표시', async () => {
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert(await page.locator(`${V} #cpOutline li`).count() === 13, '칸 수 ' + await page.locator(`${V} #cpOutline li`).count());
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('작년 계획서 목차 그대로'), await page.textContent(`${V} #cpOutlineNote`));
    const hours = page.locator(`${V} #cpOutline li:has(input[value="편제 및 시간 배당"])`);
    assert((await hours.textContent()).includes('시수표'), '시수표 표시');
  }],
  ['목차 고치기: 이름 바꾸기·빼기·더하기·위로 옮기기가 저장됨', async () => {
    const first = page.locator(`${V} #cpOutline li`).nth(1).locator('input[data-ot]');
    await first.fill('학급 실태와 특성'); await first.dispatchEvent('change');
    await page.locator(`${V} #cpOutline li`).nth(2).locator('[data-odel]').click();
    await page.click(`${V} [data-c="oAdd"]`);
    const last = page.locator(`${V} #cpOutline li`).last();
    await last.locator('input[data-ot]').fill('학급 안전 지도'); await last.locator('input[data-ot]').dispatchEvent('change');
    await last.locator('[data-oup]').click();
    await page.waitForTimeout(150);
    const o = (await cur()).outline;
    assert(o[1].title === '학급 실태와 특성' && !o.some(x => x.title === '학급 조직') && o.at(-2).title === '학급 안전 지도' && o.length === 13, JSON.stringify(o.map(x => x.title)));
  }],
  ['작년 계획서가 없는 새 계획은 표준 목차로 시작', async () => {
    await page.click(`${V} [data-c="new"]`);
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('표준 목차'), await page.textContent(`${V} #cpOutlineNote`));
    const n = await page.locator(`${V} #cpOutline li`).count();
    const std = await page.evaluate(async () => (await import('./menus/plan/classplan-model.js')).STANDARD.length);
    assert(n === std, `${n} / ${std}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
