// AI로 보낸 글(스펙 2026-11-13 §2): 실제 AI 일(행특 쓰기·품의 캡처 넣기·연결 확인)을 하면 설정 › AI 「AI로 보낸 글」에 줄(때·업무·AI·글자 수·그림 수),
// 펼치면 가짜 AI가 받은 글 그대로(이름은 가린 채), 그림 요청은 작은 그림, 화면을 연 채 새 요청이 가면 바로 더해짐(펼친 줄은 그대로),
// 키는 어디에도 없음, 저장소에도 없음, [비우기], 다시 켜면 비움, 채팅 「보낸 글」 → 그 카드, 390px에서 넘치지 않음
import { open, enter, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-13T11:02:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-ant-e2e-secret' }, remember: true }));
  // 행특 메모 앞의 이름(김하늘)은 AI로 보낼 때 앱이 뺌(core/bundle.js memoForAI)
  if (!localStorage.getItem('ssam:hk')) localStorage.setItem('ssam:hk', JSON.stringify({ settings: {}, students: [{ id: 'a', no: 1, label: '', memo: '김하늘 우유 당번을 성실히 함', done: 0, results: [] }] }));
  if (!localStorage.getItem('ssam:purchase:view')) localStorage.setItem('ssam:purchase:view', JSON.stringify('full'));
});
const calls = [];
const long = j => `학급 일에 책임감을 가지고 참여하며 ${j}번째로 친구를 돕는 모습이 돋보임. `.repeat(7).trim();
await page.route('https://api.anthropic.com/**', async route => {
  const req = route.request();
  const body = JSON.parse(req.postData());
  const c = body.messages[0].content;
  const prompt = typeof c === 'string' ? c : c.filter(x => x.type === 'text').map(x => x.text).join('\n');
  const images = typeof c === 'string' ? 0 : c.filter(x => x.type === 'image').length;
  calls.push({ prompt, images, texts: typeof c === 'string' ? [c] : c.filter(x => x.type === 'text').map(x => x.text), key: req.headers()['x-api-key'] });
  let out = '{}';
  if (prompt.includes('[쌤비서 채팅]')) out = JSON.stringify({ reply: '상담 전에 관찰 기록을 정리해 두세요.', actions: [] });
  else if (prompt.startsWith('아래 행동특성 및 종합의견을')) out = long(9);
  else if (prompt.includes('행동특성 및 종합의견을')) out = [long(1), long(2)].join('\n');
  else if (prompt.startsWith('[품의 넣기]') && images) out = JSON.stringify({ items: [{ name: '색지', spec: 'A4 10색', unit: '팩', qty: 3, price: 2000 }], shipping: [], fields: {} });
  else if (prompt.includes('연결 확인')) out = '확인';
  await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: [{ type: 'content_block_delta', delta: { type: 'text_delta', text: out } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }].map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('') }).catch(() => {});
});
const S = 'section[data-menu="settings"]';
const CARD = `${S} #setAiLog`;
const ROW = `${CARD} .ai-log-row`;
const until = async (fn, what, ms = 10000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과: ' + what + ' · 부른 수 ' + calls.length); await page.waitForTimeout(60); } };
// 휴대폰 폭에서도 되게 세로 메뉴 버튼을 바로 누름(helpers enter)
const toAi = async () => { await enter(page, 'settings', 'ai'); await page.waitForSelector(CARD); };
const rows = () => page.$$eval(ROW, l => l.map(li => li.querySelector('.ai-log-line').textContent));
const comma = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const preOf = i => page.$eval(`${ROW}:nth-child(${i + 1}) pre.ai-log-text`, e => e.textContent);
await page.goto(url);
await page.waitForTimeout(500);

await run('ai-log', [
  ['AI에 보내기 전: 설정 › AI에 「AI로 보낸 글」 카드, 「아직 보낸 글이 없어요」, 안내 글, [비우기] 없음', async () => {
    await toAi();
    const txt = await page.textContent(CARD);
    assert(txt.includes('AI로 보낸 글') && txt.includes('아직 보낸 글이 없어요'), txt);
    assert(txt.includes('이 창을 켠 뒤 보낸 것만 이 기기에 잠깐 둬요. 이름은 가린 채로 보내요.'), '안내 글: ' + txt);
    assert(!(await page.locator(`${CARD} [data-set="aiLogClear"]`).count()), '빈데 [비우기]');
  }],
  ['행특 쓰기(실제 AI 일) → 줄: 「11:02 · 평어·행특·창체 · Claude Sonnet 5.5 · 글 n자」(그림 없음)', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.click('#hkList [data-hkstu]');
    await page.waitForSelector('#hkEditor [data-hk="gen"]');
    await page.click('#hkEditor [data-hk="gen"]');
    await until(() => calls.length >= 1, '행특 요청');
    await page.waitForTimeout(300);
    await toAi();
    const r = await rows();
    assert(r.length === calls.length, `줄 수 ${r.length} · 부른 수 ${calls.length}`);
    const first = calls[0];
    assert(r[r.length - 1] === `11:02 · 평어·행특·창체 · Claude Sonnet 5.5 · 글 ${comma(first.prompt.length)}자`, r[r.length - 1] + ' / ' + first.prompt.length);
    assert(!r[r.length - 1].includes('그림'), '그림 칸');
  }],
  ['펼치면 보낸 글 전체가 가짜 AI가 받은 글과 똑같음(글쓰기 원칙까지), 이름(김하늘)은 없음', async () => {
    const last = (await rows()).length - 1;
    const sum = page.locator(`${ROW}:nth-child(${last + 1}) summary`);
    assert(await page.locator(`${ROW}:nth-child(${last + 1}) pre.ai-log-text`).isHidden(), '펼치기 전에 보임');
    await sum.click();
    assert(await page.locator(`${ROW}:nth-child(${last + 1}) pre.ai-log-text`).isVisible(), '펼쳐지지 않음');
    const pre = await preOf(last);
    assert(pre === calls[0].prompt, '보낸 글이 다름: ' + pre.slice(0, 80) + ' / ' + calls[0].prompt.slice(0, 80));
    assert(pre.includes('우유 당번을 성실히 함') && pre.includes('[글쓰기 원칙]'), '메모·원칙');
    assert(!pre.includes('김하늘') && !calls[0].prompt.includes('김하늘'), '이름이 감');
    const st = await page.$eval(`${ROW}:nth-child(${last + 1}) pre.ai-log-text`, e => { const s = getComputedStyle(e); return [s.whiteSpace, s.overflowY, parseFloat(s.maxHeight)]; });
    assert(st[0] === 'pre-wrap' && st[1] === 'auto' && st[2] > 0, '줄바꿈·스크롤 칸: ' + st);
    assert((await page.textContent(`${ROW}:nth-child(${last + 1})`)).includes('보낸 곳: Claude · Claude Sonnet 5.5'), '보낸 곳');
  }],
  ['화면을 연 채 [연결 확인] → 새 줄이 맨 위에 바로(펼친 줄은 그대로 펼쳐짐)', async () => {
    const before = (await rows()).length, n = calls.length;
    await page.click(`${S} [data-set="testAi"]`);
    await until(() => calls.length === n + 1, '연결 확인 요청');
    await until(async () => (await rows()).length === before + 1, '새 줄');
    const r = await rows();
    assert(r[0].startsWith('11:02 · 연결 확인 · Claude Sonnet 5.5 · 글 '), r[0]);
    assert(await page.locator(`${ROW}:nth-child(${before + 1}) details[open]`).count() === 1, '펼친 줄이 닫힘');
    assert(await page.locator(`${ROW}:nth-child(1) details[open]`).count() === 0, '새 줄이 펼쳐짐');
  }],
  ['그림 요청(품의 장바구니 캡처) → 「품의 · … · 그림 1장」, 펼치면 작은 그림(보낸 그림 1)·받은 글과 같음', async () => {
    const n = calls.length;
    await page.click('nav.app-side [data-menu-go="purchase"]');
    await page.waitForSelector('section[data-menu="purchase"] #pcIntake');
    await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const g = c.getContext('2d'); g.fillStyle = '#ccc'; g.fillRect(0, 0, 640, 480); g.fillStyle = '#c00'; g.fillRect(40, 40, 200, 120);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'cart.png', { type: 'image/png' }));
      document.querySelector('#pcIntake').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await until(() => calls.length > n && calls.at(-1).images === 1, '그림 요청');
    const sent = calls.at(-1);
    await page.waitForTimeout(400);
    if (await page.locator('#sheetRoot [data-close]').count()) await page.keyboard.press('Escape');
    await toAi();
    const r = await rows();
    assert(/^11:02 · 품의 · Claude Sonnet 5\.5 · 글 [\d,]+자 · 그림 1장$/.test(r[0]), r[0]);
    await page.locator(`${ROW}:nth-child(1) summary`).click();
    await page.waitForSelector(`${ROW}:nth-child(1) img[alt="보낸 그림 1"]`);
    const img = await page.$eval(`${ROW}:nth-child(1) img[alt="보낸 그림 1"]`, e => [e.getAttribute('src').slice(0, 23), e.naturalWidth]);
    assert(img[0] === 'data:image/jpeg;base64,' && img[1] > 0 && img[1] <= 320, '작은 그림: ' + img);
    assert(await preOf(0) === sent.prompt, '보낸 글이 다름');
  }],
  ['공통 부분이 있는 요청(채팅 도우미) → 「공통 + 요청 글」 그대로, 채팅이 가린 이름은 없음', async () => {
    const n = calls.length;
    if (await page.isHidden('#chatPanel')) await page.click('#inboxFab');
    await page.waitForSelector('#chatPanel:not([hidden])');
    await page.fill('#chatText', '김하늘 학생 상담은 어떻게 하면 좋을까요?'); await page.click('#chatSend');
    await until(() => calls.length > n && calls.at(-1).prompt.includes('[쌤비서 채팅]'), '도우미 요청');
    const sent = calls.at(-1);
    assert(sent.texts.length === 2, '공통·요청 두 조각: ' + sent.texts.length);
    await page.waitForFunction(() => [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')].some(b => b.textContent.includes('관찰 기록을 정리')));
    await page.keyboard.press('Escape');
    await toAi();
    assert((await rows())[0].startsWith('11:02 · 피드백·알림 · Claude Sonnet 5.5 · 글 '), (await rows())[0]);
    await page.locator(`${ROW}:nth-child(1) summary`).click();
    const pre = await preOf(0);
    assert(pre === sent.texts.join('\n\n'), '공통 + 요청 글이 아님');
    assert(!pre.includes('김하늘') && pre.includes('상담'), '이름이 감');
  }],
  ['키·인증 머리말은 어디에도 없고, 보낸 글은 저장소에 두지 않음(백업에도 없음)', async () => {
    assert(calls.every(c => c.key === 'sk-ant-e2e-secret'), '가짜 AI가 키를 받지 못함');
    const all = await page.evaluate(() => JSON.stringify(window.SSAM.aiLog.list()) + document.querySelector('section[data-menu="settings"]').innerHTML);
    assert(!all.includes('sk-ant-e2e-secret') && !/x-api-key|authorization|anthropic-version/i.test(all), '키·머리말이 적힘');
    const stored = await page.evaluate(() => { const out = []; for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) out.push(s.key(i) + '=' + s.getItem(s.key(i))); return out.join('\n'); });
    assert(!stored.includes('[글쓰기 원칙]') && !stored.includes('[품의 넣기]') && !/ai-?log/i.test(stored), '보낸 글이 저장소에 있음');
  }],
  ['[비우기] → 「아직 보낸 글이 없어요」', async () => {
    await page.click(`${CARD} [data-set="aiLogClear"]`);
    await page.waitForSelector(`${CARD} .ai-log-empty`);
    assert(!(await page.locator(ROW).count()), '줄이 남음');
    assert((await page.evaluate(() => window.SSAM.aiLog.list().length)) === 0, '목록이 남음');
  }],
  ['다시 켜면 비움(메모리에만)', async () => {
    const n = calls.length;
    await page.click(`${S} [data-set="testAi"]`);
    await until(() => calls.length === n + 1, '연결 확인 요청');
    await until(async () => (await rows()).length === 1, '줄');
    await page.reload(); await page.waitForTimeout(400);
    await toAi();
    assert((await page.textContent(CARD)).includes('아직 보낸 글이 없어요'), '다시 켜도 남음');
  }],
  ['채팅 「보낸 글」 → 설정 › AI 「AI로 보낸 글」 카드로', async () => {
    await page.click('nav.app-side [data-menu-go="home"]');
    if (await page.isHidden('#chatPanel')) await page.click('#inboxFab');
    await page.waitForSelector('#chatPanel:not([hidden])');
    const n = calls.length;
    await page.fill('#chatText', '보낸 글'); await page.click('#chatSend');
    await page.waitForFunction(() => [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')].some(b => b.textContent.includes('「AI로 보낸 글」로 왔어요')));
    assert(await page.isVisible(CARD), '카드가 안 보임');
    assert(await page.evaluate(() => !!document.querySelector('#menuTabs [data-tab="ai"][aria-current="page"]')), 'AI 탭이 아님');
    const top = await page.$eval(CARD, e => e.getBoundingClientRect().top);
    assert(top >= 0 && top < 860, '카드가 화면에 없음: ' + top);
    assert(calls.length === n, '채팅이 AI를 부름');
    await page.keyboard.press('Escape');
  }],
  ['390px: 줄·펼친 글·작은 그림이 가로로 넘치지 않음, 줄·[비우기]는 44px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await toAi();
    const n = calls.length;
    await page.click(`${S} [data-set="testAi"]`);
    await until(() => calls.length === n + 1, '연결 확인 요청');
    await until(async () => (await rows()).length >= 1, '줄');
    // 긴 낱말·긴 영문 줄과 큰 그림 5장(작은 그림은 3장까지)
    await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1100; c.getContext('2d').fillRect(0, 0, 800, 500);
      const b64 = c.toDataURL('image/png').split(',')[1];
      window.SSAM.aiLog.add({ task: 'grade', role: 'review', provider: 'Gemini', model: 'Gemini 3.8 Flash', text: '아주긴낱말'.repeat(200) + '\n' + 'x'.repeat(900), images: Array.from({ length: 5 }, () => ({ mime: 'image/png', b64 })) });
    });
    await until(async () => (await rows()).length >= 2, '긴 줄');
    assert((await rows())[0] === '11:02 · 채점 검토 · Gemini 3.8 Flash · 글 1,901자 · 그림 5장', (await rows())[0]);
    await page.locator(`${ROW}:nth-child(1) summary`).click();
    await until(async () => (await page.locator(`${ROW}:nth-child(1) .ai-log-thumbs img`).count()) === 3, '작은 그림 3장');
    assert((await page.textContent(`${ROW}:nth-child(1) .ai-log-thumbs`)).includes('그림 5장 중 3장만 작게 보여요'), '3장만 안내');
    const o = await page.evaluate(sel => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.querySelector(sel).scrollWidth, document.querySelector(sel).clientWidth], CARD);
    assert(o[0] <= o[1] + 1 && o[2] <= o[3] + 1, '넘침: ' + o);
    const h = await page.$eval(`${ROW}:nth-child(1) summary`, e => e.getBoundingClientRect().height);
    const hb = await page.$eval(`${CARD} [data-set="aiLogClear"]`, e => e.getBoundingClientRect().height);
    assert(h >= 44 && hb >= 44, `높이 ${h} · ${hb}`);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
