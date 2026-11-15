// 글꼴 고르기(설정 › 화면 › 글꼴): 처음 켜면 프리텐다드(앱 안 파일이 실제로 불림), 8가지 칸(넓은 창에서 한 줄 4칸 × 2, 빈칸 없음)·이름은 그 글꼴로,
// 고르면 바로 바뀌고 다시 켜도 기억, 「테마 글꼴」은 테마마다(다크 내비 Gothic A1), 종이 문서의 명조 제목은 그대로
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const asked = [];
page.on('request', r => { if (/fonts\.googleapis\.com/.test(r.url())) asked.push(r.url()); });
const fam = sel => page.$eval(sel, e => getComputedStyle(e).fontFamily);
const S = 'section[data-menu="settings"]';
await page.goto(url);
await page.waitForSelector('nav.app-side [data-menu-go="settings"]');

await run('font-pick', [
  ['처음 켜면 프리텐다드: data-font·본문·제목 글꼴, 앱 안 글꼴 파일이 불림, 구글에는 Gothic A1을 부르지 않음', async () => {
    assert(await page.getAttribute('html', 'data-font') === 'pretendard', await page.getAttribute('html', 'data-font'));
    assert((await fam('body')).startsWith('"Pretendard Variable"'), await fam('body'));
    assert((await fam('.app-top h1')).startsWith('"Pretendard Variable"'), await fam('.app-top h1'));
    const ok = await page.evaluate(async () => { await document.fonts.load('700 16px "Pretendard Variable"', '평가'); return document.fonts.check('700 16px "Pretendard Variable"', '평가'); });
    assert(ok, '프리텐다드 파일이 불리지 않음');
    assert(!asked.some(u => u.includes('Gothic+A1')), asked.join(' | '));
  }],
  ['설정 › 화면 › 글꼴: 8칸(1280에서 4칸 × 2줄)·기본 표시, 이름은 그 글꼴로 보임', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]');
    await page.click('#menuTabs [data-tab="screen"]');
    await page.waitForSelector(`${S} .font-grid`);
    const names = await page.$$eval(`${S} [data-font-pick] .fn`, e => e.map(x => x.textContent));
    assert(names.join(',') === '프리텐다드,SUIT,본고딕,나눔고딕,고운돋움,고운바탕,맑은 고딕,테마 글꼴', names.join(','));
    const rows = await page.$$eval(`${S} [data-font-pick]`, e => [...new Set(e.map(x => Math.round(x.getBoundingClientRect().top)))].length);
    assert(rows === 2, '줄 수 ' + rows);
    assert(await page.isChecked(`${S} [data-font-pick="pretendard"] input`), '기본이 골라져 있지 않음');
    assert((await fam(`${S} [data-font-pick="nanum"] .fn`)).includes('Nanum Gothic'), await fam(`${S} [data-font-pick="nanum"] .fn`));
  }],
  ['나눔고딕을 고르면 바로 바뀌고 구글에서 받음, 다시 켜도 기억', async () => {
    await page.click(`${S} [data-font-pick="nanum"]`);
    assert(await page.getAttribute('html', 'data-font') === 'nanum', await page.getAttribute('html', 'data-font'));
    assert((await fam('body')).startsWith('"Nanum Gothic"'), await fam('body'));
    await page.waitForTimeout(150);
    assert(asked.some(u => u.includes('Nanum+Gothic')), asked.join(' | '));
    await page.reload();
    await page.waitForSelector('nav.app-side [data-menu-go="settings"]');
    assert(await page.getAttribute('html', 'data-font') === 'nanum', '다시 켜니 ' + await page.getAttribute('html', 'data-font'));
    assert((await fam('.app-top h1')).startsWith('"Nanum Gothic"'), await fam('.app-top h1'));
  }],
  ['「테마 글꼴」은 테마마다(다크 내비 Gothic A1), 종이 문서는 프리텐다드여도 명조 제목', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]');
    await page.click('#menuTabs [data-tab="screen"]');
    await page.click(`${S} [data-font-pick="theme"]`);
    assert((await fam('body')).startsWith('"Gothic A1"'), await fam('body'));
    await page.click(`${S} [data-font-pick="pretendard"]`);
    await page.click(`${S} [data-theme-pick="paper"]`);
    assert((await fam('.app-top h1')).startsWith('"Noto Serif KR"'), '제목 ' + await fam('.app-top h1'));
    assert((await fam('body')).startsWith('"Pretendard Variable"'), '본문 ' + await fam('body'));
    await page.click(`${S} [data-theme-pick="dark-nav"]`);
    assert((await fam('.app-top h1')).startsWith('"Pretendard Variable"'), '다크 내비 제목 ' + await fam('.app-top h1'));
  }],
  ['「테마 글꼴」 칸의 이름·보기 글은 지금 테마의 글꼴로(고른 글꼴이 아님), 테마를 바꾸면 그 테마 글꼴로', async () => {
    assert(await page.getAttribute('html', 'data-font') === 'pretendard' && await page.getAttribute('html', 'data-theme') === 'dark-nav', '시작 상태');
    const T = `${S} [data-font-pick="theme"]`;
    assert((await fam(`${T} .fn`)).startsWith('"Gothic A1"'), '다크 내비: ' + await fam(`${T} .fn`));
    assert((await fam(`${T} .fs`)).startsWith('"Gothic A1"'), '보기 글: ' + await fam(`${T} .fs`));
    await page.click(`${S} [data-theme-pick="mono"]`);
    assert((await fam(`${T} .fn`)).startsWith('"IBM Plex Sans KR"'), '모노 라인: ' + await fam(`${T} .fn`));
    await page.click(`${S} [data-theme-pick="paper"]`);
    assert((await fam(`${T} .fn`)).startsWith('"Noto Sans KR"'), '종이 문서: ' + await fam(`${T} .fn`));
    assert((await fam('body')).startsWith('"Pretendard Variable"'), '본문은 고른 글꼴 그대로');
    await page.waitForTimeout(150);
    assert(asked.some(u => u.includes('IBM+Plex+Sans+KR')), '모노 라인 글꼴을 부르지 않음');
    await page.click(`${S} [data-theme-pick="dark-nav"]`);
  }],
  ['390px: 글꼴 칸이 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert(w <= 390, '가로 ' + w);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
