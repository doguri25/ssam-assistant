// 떠 있는 버튼 › Windows 앱 다리(가짜 __TAURI__): 시작할 때 설정을 Rust에, 버튼 창이 넘긴 경로 → inbox_read → 카드,
// Windows만의 설정, 버튼 숨기기·파일 고르기 알림, 버튼 창 화면(bubble.html)이 끌어 놓은 경로를 inbox_take로
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { open, run, assert, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors, ctx } = t;
const csv = readFileSync(join(FIXTURES, 'roster-sample.csv'), 'utf8');
await page.addInitScript(csv => {
  window.__calls = []; window.__ls = {};
  window.__TAURI__ = {
    core: { invoke: (cmd, args) => { window.__calls.push([cmd, args]); if (cmd === 'inbox_read') { if (/실패/.test(args.path) && !window.__failed) { window.__failed = 1; return Promise.reject('READ_FAILED'); } return Promise.resolve(new TextEncoder().encode(csv).buffer); } if (cmd === 'bubble_config') return Promise.resolve(null); return Promise.reject('stub'); } },
    event: { listen: (name, cb) => { window.__ls[name] = cb; return Promise.resolve(() => {}); } }
  };
}, csv);
await page.goto(url);
await page.waitForTimeout(500);
const calls = cmd => page.evaluate(c => window.__calls.filter(x => x[0] === c), cmd);
const sheet = '#sheetRoot .sheet';

await run('inbox-bridge', [
  ['시작할 때 설정을 Rust(bubble_config)에 알리고, 버튼 창을 쓰면 창 안 버튼은 숨김', async () => {
    const c = await calls('bubble_config');
    assert(c.length >= 1 && JSON.stringify(c.at(-1)[1]) === JSON.stringify({ enabled: true, keepOnClose: true, autostart: false }), JSON.stringify(c));
    assert(await page.isHidden('#inboxFab'), '창 안 버튼이 보임');
  }],
  ['버튼 창이 넘긴 경로(inbox:files) → inbox_read로 읽어 확인 카드', async () => {
    await page.evaluate(() => window.__ls['inbox:files']({ payload: [{ path: 'C:\\자료\\명단.csv', name: '명단.csv', size: 120 }] }));
    await page.waitForSelector(`${sheet} #ibRun`);
    assert((await page.textContent(sheet)).includes('명단.csv') && (await page.textContent(sheet)).includes('학급 명단'), await page.textContent(sheet));
    assert(JSON.stringify((await calls('inbox_read'))[0][1]) === JSON.stringify({ path: 'C:\\자료\\명단.csv' }), JSON.stringify(await calls('inbox_read')));
    await page.click(`${sheet} [data-close]`);
  }],
  ['읽기에 실패한 파일은 곧바로 다시 놓아도 다시 읽음(10초 거름에 막히지 않음)', async () => {
    const f = { path: 'C:\\자료\\실패.csv', name: '실패.csv', size: 120 };
    await page.evaluate(f => window.__ls['inbox:files']({ payload: [f] }), f);
    await page.waitForFunction(() => /실패\.csv.*읽지 못했어요/.test(document.body.textContent));
    await page.evaluate(f => window.__ls['inbox:files']({ payload: [f] }), f);
    await page.waitForSelector(`${sheet} #ibRun`);
    assert((await calls('inbox_read')).filter(c => c[1].path === f.path).length === 2, JSON.stringify(await calls('inbox_read')));
    await page.click(`${sheet} [data-close]`);
  }],
  ['버튼 창이 같은 파일을 잇달아 알려도(다시 놓기) 10초 안이면 한 번만 읽고 카드도 하나', async () => {
    const f = { path: 'C:\\자료\\명단2.csv', name: '명단2.csv', size: 120 };
    await page.evaluate(f => { window.__ls['inbox:files']({ payload: [f] }); window.__ls['inbox:files']({ payload: [f] }); }, f);
    await page.waitForSelector(`${sheet} #ibRun`);
    await page.waitForTimeout(300);
    assert((await calls('inbox_read')).filter(c => c[1].path === f.path).length === 1, JSON.stringify(await calls('inbox_read')));
    await page.click(`${sheet} [data-close]`);
    await page.waitForTimeout(300);
    assert(await page.locator(sheet).count() === 0, '카드가 또 뜸');
  }],
  ['설정 › 화면: Windows만의 칸(창을 닫으면·컴퓨터를 켜면), 바꾸면 bubble_config', async () => {
    await page.click('nav.app-side [data-menu-go="settings"]');
    await page.click('#menuTabs [data-tab="screen"]');
    await page.waitForSelector('#ibSetAuto');
    assert(await page.isChecked('#ibSetKeep') && !(await page.isChecked('#ibSetAuto')), '기본값');
    await page.click('#ibSetAuto');
    await page.waitForTimeout(100);
    assert((await calls('bubble_config')).at(-1)[1].autostart === true, JSON.stringify((await calls('bubble_config')).at(-1)));
  }],
  ['버튼을 끄면 «컴퓨터를 켜면 버튼 띄우기»가 켜져 있어도 자동 시작은 끔(창 없이 켜지지 않게)', async () => {
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ on: false, autostart: true }));
    const c = (await calls('bubble_config')).at(-1)[1];
    assert(c.enabled === false && c.autostart === false, JSON.stringify(c));
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ on: true, autostart: true }));
    assert((await calls('bubble_config')).at(-1)[1].autostart === true, '다시 켜면');
  }],
  ['버튼 메뉴 「버튼 숨기기」(bubble:off) → 설정이 꺼짐, 「파일 고르기」(inbox:pick) → 고르기 카드', async () => {
    await page.evaluate(() => window.__ls['bubble:off']({}));
    assert((await page.evaluate(async () => (await import('./core/inbox.js')).getInboxSettings())).on === false, '꺼지지 않음');
    await page.evaluate(async () => (await import('./core/inbox.js')).setInboxSettings({ on: true }));
    await page.evaluate(() => window.__ls['inbox:pick']({}));
    await page.waitForSelector(`${sheet} #ibPick`);
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${sheet} #ibPick`)]);
    assert(fc.isMultiple(), '여러 파일');
    await fc.setFiles(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector(`${sheet} #ibRun`);
    await page.click(`${sheet} [data-close]`);
  }],
  ['버튼 창 화면: 오류 없이 열리고, 끌어 놓은 경로를 inbox_take로, 누르면 쌤비서 열기', async () => {
    const b = await ctx.newPage();
    const errs = [];
    b.on('pageerror', e => errs.push(String(e)));
    await b.addInitScript(() => {
      window.__calls = []; window.__pos = [];
      if (!localStorage.getItem('ssam:bubble')) localStorage.setItem('ssam:bubble', JSON.stringify({ x: 50, y: 60 }));
      localStorage.setItem('ssam:theme', JSON.stringify('soft'));
      const inv = (cmd, args) => { window.__calls.push([cmd, args]); return Promise.resolve(1); };
      window.__TAURI__ = {
        core: { invoke: inv },
        event: { listen: () => Promise.resolve(() => {}) },
        window: { getCurrentWindow: () => ({ onMoved: cb => { window.__moved = cb; return Promise.resolve(() => {}); }, setPosition: p => { window.__pos.push([p.x, p.y]); return Promise.resolve(); }, startDragging: () => Promise.resolve(), outerSize: () => Promise.resolve({ width: 72, height: 72 }) }), currentMonitor: () => Promise.resolve(null), availableMonitors: () => Promise.resolve([{ position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } }]) },
        webview: { getCurrentWebview: () => ({ onDragDropEvent: cb => { window.__dd = cb; return Promise.resolve(() => {}); } }) },
        dpi: { PhysicalPosition: function (x, y) { this.x = x; this.y = y; } },
        menu: { Menu: { new: () => Promise.resolve({ popup: () => Promise.resolve() }) } }
      };
    });
    await b.goto(url + 'bubble.html');
    await b.waitForSelector('#bubble');
    await b.waitForFunction(() => typeof window.__dd === 'function');
    await b.evaluate(() => window.__dd({ payload: { type: 'drop', paths: ['C:\\자료\\정답지.hwp'], position: { x: 1, y: 1 } } }));
    await b.click('#bubble');
    const c = await b.evaluate(() => window.__calls);
    assert(c.some(x => x[0] === 'inbox_take' && x[1].paths[0] === 'C:\\자료\\정답지.hwp'), JSON.stringify(c));
    assert(c.some(x => x[0] === 'bubble_action' && x[1].action === 'open'), JSON.stringify(c));
    // 지난 자리로 옮기고, 옮기면 쌤비서와 같은 저장소(ssam:bubble)에 적음
    await b.waitForFunction(() => typeof window.__moved === 'function');
    assert(JSON.stringify(await b.evaluate(() => window.__pos)) === '[[50,60]]', JSON.stringify(await b.evaluate(() => window.__pos)));
    await b.evaluate(() => window.__moved({ payload: { x: 300, y: 400 } }));
    assert(await b.evaluate(() => localStorage.getItem('ssam:bubble')) === '{"x":300,"y":400}', '자리 저장');
    // 버튼 색은 쌤비서 화면 테마를 따름(바꾸면 바로)
    assert(await b.evaluate(() => document.documentElement.dataset.theme) === 'soft', '테마');
    const acc = () => b.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert(await acc() === '#2563eb', await acc());
    assert(errs.length === 0, errs.join(' | '));
    await b.close();
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
