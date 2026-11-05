// 11-05 버그 고치기(공통·설정): 떠 있는 버튼이 흔한 견적서를 학생 답안으로 보지 않음(바로 실행이어도 올려 둔 답안 스캔이 그대로),
// 이름 칸 하나로만 답안이라고 본 글 파일은 물어봄, 바탕화면 버튼 「버튼 숨기기」 뒤 열린 설정 › 화면의 「버튼 보이기」가 맞춰짐
import { open, run, assert } from './helpers.mjs';

const QUOTE = ['견 적 서', '2026년 11월 5일', '쌤초등학교 귀하', '공급자', '등록번호: 123-45-67890', '상 호: 쌤문구', '성 명: 홍길동 (인)', '주 소: 서울시 중구',
  '품명\t규격\t수량\t단가\t금액', '색연필\t24색\t30\t5000\t150000', '합계\t\t\t\t150000'].join('\n');
const sheet = '#sheetRoot .sheet';

/* ---------- 떠 있는 버튼(웹) ---------- */
const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => localStorage.setItem('ssam:inbox', JSON.stringify({ on: true, mode: 'direct', plan: 'draft', keepOnClose: true, autostart: false })));
await page.goto(url);
await page.waitForTimeout(300);
const S = await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  m.saveSet({ ...m.getSet(), pagesPer: 1, maskOn: false });
  const x = m.newTest({ meta: { ...s.SAMPLE_META, date: '2026-10-30' }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } });
  m.saveTest(x); return x.id;
});
await page.reload(); await page.waitForTimeout(400);
const students = () => page.evaluate(id => import('./menus/evaluate/unit/unit-model.js').then(m => m.getTest(id).students.map(s => s.no)), S);
const shot = async i => ({ name: `학생${i}.png`, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: 300 + i, height: 400 } }) });

await run('fix1105-core', [
  ['[inbox-quote-1] 바로 실행: 「공급자」 아래 「성 명: 홍길동 (인)」을 따로 적은 견적서를 넣어도 단원평가에 올려 둔 답안 스캔(학생 3명)이 그대로', async () => {
    await page.click('nav.app-side [data-menu-go="evaluate"]');
    await page.click('#menuTabs [data-tab="unit"]');
    await page.click(`.unit-box [data-un-open="${S}"]`);
    if (!(await page.$('#unAnsFile'))) await page.click('.unit-box [data-step="2"]');
    await page.setInputFiles('#unAnsFile', [await shot(1), await shot(2), await shot(3)]);
    await page.waitForFunction(id => import('./menus/evaluate/unit/unit-model.js').then(m => m.getTest(id).students.length === 3), S);
    await page.setInputFiles('#inboxFile', { name: '쌤문구_20261105.txt', mimeType: 'text/plain', buffer: Buffer.from(QUOTE) });
    // 견적서는 품의 › 새 품의로 감
    await page.waitForSelector('#menuTabs [data-tab="new"][aria-current="page"]');
    await page.waitForTimeout(300);
    assert(JSON.stringify(await students()) === '[1,2,3]', '답안 스캔이 바뀜: ' + JSON.stringify(await students()));
    assert(await page.locator(sheet).count() === 0, '카드가 뜸');
  }],
  ['[inbox-quote-1] 바로 실행이어도 이름 칸 하나로만 학생 답안이라고 본 글 파일은 카드로 물어보고, 올려 둔 스캔은 그대로', async () => {
    await page.setInputFiles('#inboxFile', { name: '3반.txt', mimeType: 'text/plain', buffer: Buffer.from('수학 단원평가\n3학년 2반 이름: 김하늘\n1. 3 × 4 = (  12  )') });
    await page.waitForSelector(`${sheet} #ibKind`);
    assert(await page.inputValue(`${sheet} #ibKind`) === 'unit-scan', await page.inputValue(`${sheet} #ibKind`));
    await page.click(`${sheet} [data-close]`);
    await page.waitForTimeout(200);
    assert(JSON.stringify(await students()) === '[1,2,3]', '답안 스캔이 바뀜: ' + JSON.stringify(await students()));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();

/* ---------- Windows 앱: 바탕화면 버튼 창 ---------- */
const w = await open();
await w.page.addInitScript(() => {
  const H = {}; window.__H = H; window.__calls = [];
  window.__TAURI__ = {
    core: { invoke: async (cmd, a) => { window.__calls.push([cmd, a]); if (cmd === 'app_version') return '0.18.3'; if (cmd === 'check_update') return { available: false }; return null; } },
    event: { listen: async (name, fn) => { H[name] = fn; return () => {}; } },
    window: { getCurrentWindow: () => ({}) }
  };
});
await w.page.goto(w.url);
await w.page.waitForTimeout(400);
const lastConfig = () => w.page.evaluate(() => { const c = window.__calls.filter(x => x[0] === 'bubble_config').pop(); return c && c[1]; });
await run('fix1105-core', [
  ['[settings-bubble-1] 설정 › 화면을 연 채 바탕화면 버튼 메뉴에서 「버튼 숨기기」 → 「버튼 보이기」 체크가 꺼지고, 한 번 누르면 다시 켜짐', async () => {
    await w.page.click('nav.app-side [data-menu-go="settings"]');
    await w.page.click('#menuTabs [data-tab="screen"]');
    await w.page.waitForSelector('#ibSetOn');
    assert(await w.page.isChecked('#ibSetOn'), '처음부터 꺼져 있음');
    await w.page.evaluate(() => window.__H['bubble:off']({ payload: null }));
    await w.page.waitForFunction(() => !document.querySelector('#ibSetOn').checked);
    assert((await lastConfig()).enabled === false, JSON.stringify(await lastConfig()));
    await w.page.click('#ibSetOn');
    await w.page.waitForTimeout(150);
    assert(await w.page.isChecked('#ibSetOn'), '체크가 켜지지 않음');
    assert(JSON.parse(await w.page.evaluate(() => localStorage.getItem('ssam:inbox'))).on === true, '저장 값이 켜지지 않음');
    assert((await lastConfig()).enabled === true, '버튼 창이 다시 뜨지 않음: ' + JSON.stringify(await lastConfig()));
  }],
  ['페이지 오류 없음', async () => { assert(w.errors.length === 0, w.errors.join(' | ')); }]
]);
await w.close();
