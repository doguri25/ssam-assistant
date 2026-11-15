// 웹판 AI 키: 브라우저 저장소(localStorage — 같은 주소의 다른 웹페이지도 읽음)에 남기지 않고 이 탭(sessionStorage)에만 둠.
// 새로 고침·학년도 옮기기처럼 앱이 다시 열려도 이 탭에서는 그대로, 탭을 닫거나 새 탭이면 다시 넣음. 예전에 저장한 키는 이 탭으로 옮기고 저장소에서 지움.
// 「키 기억하기」 스위치는 웹판에 없음(Windows 앱만). 키 값은 지어낸 시험용(sk-test…)
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:engine') || 'null'));
const inTab = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ssam:keys') || 'null'));
const ready = () => page.evaluate(() => window.SSAM.ai.engineReady());
const openKey = async () => {
  await page.evaluate(() => import('./core/shell.js').then(s => s.go('settings', 'ai')));
  await page.click('section[data-menu="settings"] [data-set="openAi"]');
  await page.click('#engSeg [data-e="claude"]');
};

await run('web-key', [
  ['예전에 저장소에 남긴 키는 이 탭으로 옮기고 저장소에서 지움(그 키로 그대로 씀)', async () => {
    await page.goto(url);
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test-old', gemini: '', openai: '', upstage: '' }, remember: true })));
    await page.reload(); await page.waitForTimeout(500);
    const s = await stored();
    assert(s && s.engine === 'claude', '엔진 설정은 남아야 함: ' + JSON.stringify(s));
    assert(Object.values(s.keys || {}).every(v => !v), '저장소에 키가 남음: ' + JSON.stringify(s.keys));
    assert((await inTab()).claude === 'sk-test-old', '이 탭으로 옮기지 않음');
    assert(await ready(), '옮긴 키로 쓰지 못함');
  }],
  ['설정 › AI: 「키 기억하기」 스위치가 없고, 저장하지 않는다는 안내 — 넣은 키는 저장소가 아니라 이 탭에만', async () => {
    await openKey();
    await page.waitForSelector('#apiKey');
    assert(await page.locator('#keyRemember').count() === 0, '웹판에 「키 기억하기」 스위치가 있음');
    const txt = await page.textContent('#sheetRoot');
    assert(txt.includes('웹판은 키를 저장하지 않아요') && txt.includes('탭을 닫으면'), '안내 없음: ' + txt.slice(0, 400));
    await page.fill('#apiKey', 'sk-test-new');
    await page.waitForTimeout(100);
    const s = await stored();
    assert(!JSON.stringify(s).includes('sk-test-new'), '저장소에 키가 들어감: ' + JSON.stringify(s));
    assert(Object.values(await inTab()).includes('sk-test-new'), '이 탭에 없음');
    await page.keyboard.press('Escape');
  }],
  ['새로 고침해도 이 탭에서는 키가 그대로(학년도 옮기기·둘러보기처럼 앱이 다시 열려도)', async () => {
    await page.reload(); await page.waitForTimeout(500);
    assert(Object.values(await inTab()).includes('sk-test-new'), '새로 고침 뒤 키가 사라짐');
    assert(!JSON.stringify(await stored()).includes('sk-test'), '저장소에 키가 생김');
  }],
  ['새 탭(탭을 닫았다 다시 연 것)에서는 키가 없어 다시 넣어야 함', async () => {
    const p2 = await t.ctx.newPage();
    await p2.goto(url); await p2.waitForTimeout(500);
    const r = await p2.evaluate(() => ({ s: sessionStorage.getItem('ssam:keys'), ls: localStorage.getItem('ssam:engine') }));
    assert(!String(r.s || '').includes('sk-test') && !String(r.ls || '').includes('sk-test'), '새 탭에 키가 남음: ' + JSON.stringify(r));
    await p2.close();
  }],
  ['설정 › AI 화면 안내도 「키를 저장하지 않아요」(「키 기억하기를 꺼 주세요」 안내 없음)', async () => {
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('settings', 'ai')));
    await page.waitForTimeout(200);
    const txt = await page.textContent('section[data-menu="settings"]');
    assert(!txt.includes('「키 기억하기」를 꺼'), '옛 안내가 남음');
  }],
  ['기본 AI(시험용 업스테이지)는 그대로: 업스테이지를 고른 채 새 탭을 열어도 키를 넣지 않고 바로 씀(키는 중계 서버에만)', async () => {
    await page.evaluate(() => { sessionStorage.removeItem('ssam:keys'); localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'upstage', keys: { claude: '', gemini: '', openai: '', upstage: '' }, remember: true })); });
    const p2 = await t.ctx.newPage();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    await p2.route(/ssam-relay[\w-]*\.vercel\.app/, r => r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"available":true,"until":"2027-03-31","daily":400}' }));
    await p2.goto(url);
    await p2.waitForFunction(() => window.SSAM && window.SSAM.ai && String(window.SSAM.ai.engineName()).includes('시험용'), null, { timeout: 8000 });
    assert(await p2.evaluate(() => window.SSAM.ai.engineReady()), '시험용 업스테이지로 쓰지 못함');
    const r = await p2.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
    assert(!/up-|sk-test/.test(r), '키가 저장됨');
    await p2.close();
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
