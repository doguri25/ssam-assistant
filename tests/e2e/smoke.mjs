// 앱이 열리고 평가 화면들이 바뀌는지 (가장 기본)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.goto(url);
await page.waitForTimeout(600);

await run('smoke', [
  ['페이지 오류 없이 열림', async () => { assert(errors.length === 0, '페이지 오류: ' + errors.join(' | ')); }],
  ['창의적 체험활동 화면으로 바뀜', async () => {
    await page.click('#menuTabs [data-tab="cc"]');
    assert(await page.isVisible('#ccView'), '#ccView가 보이지 않음');
  }],
  ['평가지 채점 화면으로 바뀜', async () => {
    await page.click('#menuTabs [data-tab="gr"]');
    assert(await page.isVisible('#grView'), '#grView가 보이지 않음');
  }],
  ['바꾸는 동안에도 오류 없음', async () => { assert(errors.length === 0, '페이지 오류: ' + errors.join(' | ')); }]
]);
await t.close();
