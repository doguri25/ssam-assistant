// 11-04 버그 고치기(공통·설정): 새 학년도 창의 [백업 파일 만들기], 시험용 AI가 늦게 와도 설정 › AI가 바로 바뀜, 떠 있는 버튼의 옛 엑셀(.xls) 안내
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
const S = 'section[data-menu="settings"]';
const tab = async id => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click(`#menuTabs [data-tab="${id}"]`); };
await page.goto(url);
await page.waitForTimeout(400);

await run('fix1104-core', [
  ['[core-3] 새 학년도 시작 창의 [백업 파일 만들기]를 누르면 백업 파일을 내려받고 창은 그대로', async () => {
    await tab('years');
    await page.waitForSelector(`${S} [data-set="newYear"]`);
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrNewOk');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#sheetRoot [data-sheet="backup"]')]);
    assert(/^쌤비서 백업 \d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await page.waitForFunction(() => Number(JSON.parse(localStorage.getItem('ssam:backupAt') || '0')) > 0);
    assert(await page.locator('#sheetRoot #yrNewOk').count() === 1, '새 학년도 창이 닫힘');
    await page.click('#sheetRoot [data-close]');
    assert((await page.textContent(S)).includes('마지막 백업: 오늘'), await page.textContent(S));
  }],
  ['[core-5] Windows 앱: 백업이 다운로드 폴더면 파일 이름, 임시 폴더로 갔으면 「임시 폴더」와 전체 경로를 알림', async () => {
    const backup = async dir => {
      await page.evaluate(d => { window.__TAURI__ = { core: { invoke: async (cmd, a) => (cmd === 'save_download' ? d + a.name : null) } }; }, dir);
      await page.evaluate(() => { document.querySelector('#toast').textContent = ''; });
      await page.click(`${S} [data-set="backup"]`);
      await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('저장했어요'));
      return page.textContent('#toast');
    };
    try {
      const a = await backup('D:\\다운로드\\');
      assert(/다운로드 폴더에 저장했어요: 쌤비서 백업 [\d-]+\.json/.test(a) && !a.includes('D:'), a);
      const b = await backup('C:\\Users\\t\\AppData\\Local\\Temp\\');
      assert(b.includes('임시 폴더에 저장했어요') && b.includes('C:\\Users\\t\\AppData\\Local\\Temp\\쌤비서 백업'), b);
    } finally { await page.evaluate(() => { delete window.__TAURI__; }); }
  }],
  ['[core-8] 떠 있는 버튼에 옛 엑셀(.xls) 명렬표를 넣으면 「.xlsx로 다시 저장」 안내', async () => {
    if (await page.locator('#sheetRoot [data-close]').count()) await page.click('#sheetRoot [data-close]');
    await page.setInputFiles('#inboxFile', { name: '명렬표.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('xls') });
    await page.waitForFunction(() => (document.querySelector('#sheetRoot') || {}).textContent?.includes('명렬표.xls'));
    const txt = await page.textContent('#sheetRoot');
    assert(txt.includes('옛 엑셀(.xls) 파일이에요') && txt.includes('.xlsx로 다시 저장'), txt.slice(0, 300));
    assert(!txt.includes('이 형식은 읽지 못해요'), txt.slice(0, 300));
    await page.click('#sheetRoot [data-close]');
  }],
  ['[core-7] 시험용 업스테이지 정보가 늦게 와도 열어 둔 설정 › AI가 바로 「시험용」으로 바뀜', async () => {
    await page.unroute(/ssam-relay[\w-]*\.vercel\.app/);
    await page.route(/ssam-relay[\w-]*\.vercel\.app/, async r => { await new Promise(x => setTimeout(x, 700)); await r.fulfill({ status: 200, contentType: 'application/json', body: '{"available":true,"until":"2027-03-31","daily":400}' }); });
    await page.evaluate(() => { localStorage.removeItem('ssam:engine'); });
    await page.reload();
    await enter(page, 'settings', 'ai'); // 켜면 「오늘」 — 정보가 오기 전에 설정 › AI를 열어 둠
    await page.waitForSelector(`${S} .set-big`);
    await page.waitForFunction(() => (document.querySelector('#sideAiName') || {}).textContent?.includes('시험용'), null, { timeout: 6000 });
    await page.waitForTimeout(100);
    const big = (await page.textContent(`${S} .set-big`)).trim();
    assert(big.includes('시험용'), '설정 › AI: ' + big);
    assert(await page.isEnabled(`${S} [data-set="testAi"]`), '[연결 확인]이 꺼져 있음');
    assert(await page.locator(`${S} .banner.info`).count() === 1, '시험용 안내 없음');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
