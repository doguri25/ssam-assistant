// 화면 시험 도우미: web/ 폴더를 작은 서버로 띄우고 Playwright로 연다
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const WEB = join(ROOT, 'web');
export const FIXTURES = join(ROOT, 'tests', 'fixtures');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

export function startServer(root = WEB) {
  const server = http.createServer(async (req, res) => {
    try {
      let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      if (p.startsWith('..')) throw new Error('bad path');
      let f = join(root, p);
      if ((await stat(f).catch(() => null))?.isDirectory()) f = join(f, 'index.html');
      const body = await readFile(f);
      res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404); res.end('not found'); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => server.close(r)) })));
}

/* 브라우저 + 서버를 열고, 페이지 오류를 모아 둠. 끝나면 close() */
export async function open({ width = 1280, height = 860 } = {}) {
  const srv = await startServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR/.test(m.text())) errors.push(m.text()); });
  // 시험 중에는 바깥 글꼴을 부르지 않음
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  const close = async () => { await browser.close(); await srv.close(); };
  return { page, ctx, browser, url: srv.url, errors, close };
}

/* Claude API 가짜 응답. handler({ prompt, images }) → 돌려줄 글 */
export async function mockClaude(page, handler) {
  await page.route('https://api.anthropic.com/**', async route => {
    const body = JSON.parse(route.request().postData());
    const c = body.messages[0].content;
    const prompt = typeof c === 'string' ? c : c.find(x => x.type === 'text').text;
    const images = typeof c === 'string' ? 0 : c.filter(x => x.type === 'image').length;
    const out = await handler({ prompt, images });
    const ev = [{ type: 'content_block_delta', delta: { type: 'text_delta', text: out } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }];
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: ev.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') });
  });
}

/* 시험을 차례로 돌리고 결과를 찍음. 하나라도 실패하면 종료 코드 1 */
export async function run(name, cases) {
  let fail = 0;
  for (const [title, fn] of cases) {
    try { await fn(); console.log(`ok   ${name} · ${title}`); }
    catch (e) { fail++; console.log(`FAIL ${name} · ${title}\n     ${String(e && e.message || e).split('\n')[0]}`); }
  }
  console.log(`${name}: ${cases.length - fail}/${cases.length} 통과`);
  if (fail) process.exitCode = 1;
}

export function assert(cond, msg) { if (!cond) throw new Error(msg); }
