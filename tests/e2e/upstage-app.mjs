// Windows 앱(가짜 __TAURI__)에서 업스테이지: 웹뷰가 막으면 Rust(ai_proxy)로 대신 보냄.
// 시계를 가짜로 돌려 2분 멈춤 감시·멈추기·대신 보내기가 서로 꼬이지 않는지 봄. 앱 이름도 확인
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url } = t;
let mode = 'abort'; // 'abort' = 브라우저에서 막힘(TypeError), 'hang' = 답이 오지 않음
await page.route('https://api.upstage.ai/**', route => mode === 'abort' ? route.abort('failed') : new Promise(() => {}));
await page.addInitScript(() => {
  localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'upstage', keys: { upstage: 'up-test-key' }, remember: true }));
  window.__proxyCalls = [];
  window.__proxyDelay = 0;
  const SSE = 'data: {"choices":[{"delta":{"content":"확인"}}]}\n\ndata: [DONE]\n\n';
  window.__TAURI__ = { core: { invoke: (cmd, a) => {
    if (cmd === 'app_version') return Promise.resolve('0.1.0');
    if (cmd === 'uninstall_info') return Promise.resolve({ installed: true });
    if (cmd !== 'ai_proxy') return Promise.reject('없는 명령');
    window.__proxyCalls.push(a.url);
    return new Promise(r => setTimeout(() => r({ status: 200, contentType: 'text/event-stream', body: SSE }), window.__proxyDelay));
  } } };
});
await page.clock.install();
await page.goto(url);
await page.waitForTimeout(500);

const real = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, what, tries = 60) {
  for (let i = 0; i < tries; i++) { if (await page.evaluate(fn)) return; await real(100); }
  throw new Error(what + ' 기다리다 시간 초과');
}
const start = () => page.evaluate(() => {
  window.__r = null; window.__ctl = new AbortController();
  window.SSAM.ai.generate('연결 확인', { signal: window.__ctl.signal })
    .then(r => { window.__r = { ok: r.text }; }, e => { window.__r = { err: e && e.code, msg: e && e.message }; });
});
const result = () => page.evaluate(() => window.__r);

await run('upstage-app', [
  ['앱 메뉴의 버전과 삭제 안내가 쌤비서', async () => {
    await page.click('#menuBtn');
    assert((await page.textContent('#menuVer')).trim() === '쌤비서 0.1.0', '버전: ' + await page.textContent('#menuVer'));
    await page.click('#menuUninstall');
    assert((await page.textContent('#sheetRoot')).includes('쌤비서를 이 컴퓨터에서 지워요'), '삭제 안내: ' + (await page.textContent('#sheetRoot')).slice(0, 80));
    await page.click('#sheetRoot [data-close]');
  }],
  ['막히면 대신 보내고, 3분 걸린 답도 2분 멈춤 감시에 끊기지 않음', async () => {
    mode = 'abort';
    await page.evaluate(() => { window.__proxyDelay = 180000; });
    await start();
    await until(() => window.__proxyCalls.length === 1, '대신 보내기');
    await page.clock.runFor(190000);
    await until(() => window.__r, '결과');
    const r = await result();
    assert(r.ok === '확인', '결과: ' + JSON.stringify(r));
  }],
  ['대신 보내는 동안 멈추기를 누르면 바로 멈춤', async () => {
    await page.reload(); await page.waitForTimeout(300);
    mode = 'abort';
    await page.evaluate(() => { window.__proxyDelay = 600000; });
    await start();
    await until(() => window.__proxyCalls.length === 1, '대신 보내기');
    await page.evaluate(() => window.__ctl.abort());
    await page.clock.runFor(1000);
    await until(() => window.__r, '멈춤', 30);
    const r = await result();
    assert(r.err === 'cancelled', '결과: ' + JSON.stringify(r));
  }],
  ['바로 부르다가 2분 멈춤으로 끊기면 대신 보내지 않음', async () => {
    await page.reload(); await page.waitForTimeout(300);
    mode = 'hang';
    await start();
    await real(300);
    await page.clock.runFor(130000);
    await until(() => window.__r, '결과');
    const r = await result();
    assert(await page.evaluate(() => window.__proxyCalls.length) === 0, '대신 보내기를 함');
    assert(r.err === 'upstream_error' && /2분/.test(r.msg || ''), '결과: ' + JSON.stringify(r));
  }]
]);
await t.close();
