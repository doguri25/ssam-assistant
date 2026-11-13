// 단원평가 3단계 칸 확인 창: 그 문항 전체 보기 (스펙 2026-11-13-crop-log-flow §1)
// 채점 → 칸을 처음 열면 문항 자리 찾기 한 번(문항 목록 + 채점 때와 같은 이름 가린 그림, 학생 번호·이름 없음), 그동안 쪽 전체 + 「찾는 중」,
// 찾으면 열린 창이 그 문항만 자른 그림으로 바뀜, [쪽 전체 보기]↔[이 문항만](이 화면에서 기억), 다른 칸은 적어 둔 자리로(새 요청 없음),
// 그 쪽이 없는 학생·못 찾은 문항은 쪽 전체, 새로 고쳐도 key.boxes가 남음, [문항 자리 다시 찾기], AI 키 없으면 쪽 전체, 390px
import { open, run, assert, mockClaude } from './helpers.mjs';
import { SAMPLE_ITEMS, SAMPLE_META } from '../../web/menus/evaluate/unit/unit-sample.js';
import { cropRect } from '../../web/menus/evaluate/unit/unit-locate.js';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const W = 800, H = 1100;
// 문항 자리: 1~5번은 첫 쪽, 6~9번은 둘째 쪽(10번은 못 찾음, 없는 99번은 뺌). 다시 찾으면 10번도
const BOX = k => [60, 80 + ((k - 1) % 5) * 180, 940, 80 + ((k - 1) % 5) * 180 + 160];
let round = 1, slowLoc = 0;
const grades = [], locates = [];
const imgs = content => (Array.isArray(content) ? content.filter(x => x.type === 'image').map(x => x.source.data) : []);
await mockClaude(page, async ({ prompt, content }) => {
  if (prompt.startsWith('[단원평가 문항 자리]')) {
    locates.push({ prompt, images: imgs(content) });
    if (slowLoc) await new Promise(r => setTimeout(r, slowLoc));
    const nos = round === 1 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    return JSON.stringify({ items: [...nos.map(k => ({ no: k, page: k <= 5 ? 0 : 1, box: BOX(k) })), { no: 99, page: 0, box: [10, 10, 500, 500] }] });
  }
  const no = Number((/\[학생\] (\d+)번/.exec(prompt) || [])[1]);
  grades.push({ no, prompt, images: imgs(content) });
  return JSON.stringify({ items: SAMPLE_ITEMS.map(it => ({ no: it.no, read: it.answer, points: it.points, sure: true, why: '' })) });
});
const V = 'section[data-menu="evaluate"] .unit-box', S = '#sheetRoot';
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error('시간 초과'); await new Promise(r => setTimeout(r, 50)); } };
const toUnit = async () => {
  await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
  if (await page.locator(`${V} [data-un="back"]`).count()) await page.click(`${V} [data-un="back"]`);
  // 올린 쪽 그림 주소를 걷은 차례로 남김(칸에 어느 쪽이 보이는지 맞춰 보려고)
  await page.evaluate(() => { const f = window.SSAM.files; if (f.__wrapped) return; const orig = f.readPages; f.readPages = async (...a) => { const r = await orig.apply(f, a); window.__urls = r.pages.map(p => p.url); return r; }; f.__wrapped = true; });
};
const cell = async sel => { await page.click(`${V} [data-cell="${sel}"]`); await page.waitForSelector(`${S} #unCellOk`); };
const close = async () => { await page.click(`${S} [data-close]`); await page.waitForTimeout(50); };
const msg = () => page.evaluate(() => (document.querySelector('#sheetRoot #unCvMsg') || {}).textContent || '');
const cropAlt = () => page.evaluate(() => { const i = document.querySelector('#sheetRoot .un-crop img'); return i ? i.alt : ''; });
const pressed = v => page.getAttribute(`${S} [data-cv="${v}"]`, 'aria-pressed');

await page.goto(url);
await page.waitForTimeout(400);
const id = await page.evaluate(async ([meta]) => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  localStorage.setItem('ssam:class', JSON.stringify({ count: 3, except: [] }));
  const x = m.newTest({ meta: { ...meta, date: '2026-11-13' }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } });
  x.mask = [{ x: 0.6, y: 0, w: 0.35, h: 0.08 }]; x.maskAll = false;
  m.saveTest(x);
  m.saveSet({ ...m.getSet(), pagesPer: 2, maskOn: true, mask: x.mask, maskAll: false });
  return x.id;
}, [SAMPLE_META]);
await page.reload(); await page.waitForTimeout(500);
await toUnit();

/* 학생 문제지 쪽(세로 800×1100): 흰 바탕, 첫 쪽 오른쪽 위에 이름 띠(검정), 문항 자리마다 옅은 칸. 학생 셋: 2쪽·2쪽·1쪽 */
const pngs = n => page.evaluate(async ([n, W, H]) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    if (i % 2 === 0) { g.fillStyle = '#000'; g.fillRect(W * 0.65, H * 0.02, W * 0.25, H * 0.04); }
    for (let k = 0; k < 5; k++) { g.fillStyle = ['#fdd', '#dfd', '#ddf', '#ffd', '#dff'][k]; g.fillRect(W * 0.06, H * (0.08 + k * 0.18), W * 0.88, H * 0.16); }
    out.push(c.toDataURL('image/png').split(',')[1]);
  }
  return out;
}, [n, W, H]);
const files = (await pngs(5)).map((b, i) => ({ name: `스캔${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b, 'base64') }));
// 그 단계로(이미 그 단계면 단추가 없음)
const step = async n => { if (await page.locator(`${V} .steps [data-step="${n}"]`).count()) await page.click(`${V} .steps [data-step="${n}"]`); };
const upload = async () => {
  await step(2);
  await page.setInputFiles(`${V} #unAnsFile`, files);
  await page.waitForFunction(() => /5쪽/.test((document.querySelector('.unit-box #unAnsMsg') || {}).textContent || ''));
  await page.click(`${V} [data-un="toGrade"]`);
};
/* AI로 보낸 그림의 한 점이 흰지(이름 띠를 가렸는지) */
const whiteAt = (b64, x, y) => page.evaluate(async ([b64, x, y]) => {
  const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return [...g.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data].slice(0, 3).every(v => v > 230);
}, [b64, x, y]);

await run('unit-locate', [
  ['채점: 학생 셋(2·2·1쪽) 모두 채점, 채점만으로는 문항 자리를 찾지 않음', async () => {
    await page.click(`${V} [data-un-open="${id}"]`);
    await upload();
    await page.click(`${V} [data-un="grade"]`);
    await until(async () => (await T(id)).students.every(s => s.status === 'done'), 8000);
    assert(grades.length === 3, '채점 요청 ' + grades.length);
    assert(locates.length === 0 && !(await T(id)).key.boxes, '채점 중에 자리 찾기');
  }],
  ['칸을 처음 열면 쪽 전체 + 「문항 자리를 찾는 중이에요」, 다른 칸을 열어도 찾기는 한 번, 찾으면 열린 창이 그 문항만으로 바뀜', async () => {
    slowLoc = 900;
    await cell('1-1');
    await until(async () => (await msg()).includes('문항 자리를 찾는 중이에요'));
    assert(await page.locator(`${S} .un-pages img`).count() === 2 && !(await page.locator(`${S} .un-crop`).count()), '찾는 동안 쪽 전체가 아님');
    await close();
    await cell('1-2');
    assert((await msg()).includes('찾는 중'), '둘째 칸: ' + await msg());
    await until(async () => (await cropAlt()) === '1번 학생 · 2번 문항');
    assert(!(await msg()).includes('찾는 중'), '찾은 뒤에도 찾는 중');
    assert(locates.length === 1, '자리 찾기 요청 ' + locates.length);
    slowLoc = 0;
  }],
  ['AI에는 문항 목록과 채점 때와 같은 이름 가린 그림(그 학생 쪽 2장)만 — 학생 번호·이름·정답 없음', async () => {
    const p = locates[0].prompt;
    assert(p.includes('- 1 | 글의 내용 파악하기 | 고르기') && p.includes('- 9 | 중요한 내용을 간추려 쓰기 | 서술형'), p.slice(0, 500));
    assert(p.includes('그림 2장'), '쪽 수');
    for (const bad of ['[학생]', '번 학생', '김하늘', '이바다', '한가람', '마을 도서관에서 책 읽기 잔치', '예시 답안과 비슷한']) assert(!p.includes(bad), bad);
    const g1 = grades.find(g => g.no === 1);
    assert(locates[0].images.length === 2 && g1 && locates[0].images.every((b, i) => b === g1.images[i]), '채점 때와 다른 그림');
    assert(await whiteAt(locates[0].images[0], 0.75, 0.04), '이름 띠가 가려지지 않음');
  }],
  ['저장: key.boxes = { at, lay, items } — 찾은 1~9번만(못 찾은 10번·없는 99번 없음)', async () => {
    const b = (await T(id)).key.boxes;
    assert(b && b.at > 0 && typeof b.lay === 'string', JSON.stringify(b));
    assert(Object.keys(b.items).join(',') === '1,2,3,4,5,6,7,8,9', Object.keys(b.items).join(','));
    assert(JSON.stringify(b.items[7]) === JSON.stringify({ page: 1, box: BOX(7) }), JSON.stringify(b.items[7]));
  }],
  ['자른 그림: 그 문항 자리(사방 여유 3%)만, 쪽 그림 그대로(작은 그림 아님) 크게', async () => {
    const r = cropRect(BOX(2), W, H);
    const g = await page.evaluate(() => {
      const w = document.querySelector('#sheetRoot .un-crop'), i = w.querySelector('img'), a = w.getBoundingClientRect(), b = i.getBoundingClientRect(), s = document.querySelector('#sheetRoot .sheet').getBoundingClientRect();
      return { l: (a.left - b.left) / b.width, t: (a.top - b.top) / b.height, r: (a.right - b.left) / b.width, b: (a.bottom - b.top) / b.height, nw: i.naturalWidth, src: i.getAttribute('src'), width: a.width, sheet: s.width };
    });
    const near = (a, b) => Math.abs(a - b) < 0.01;
    assert(near(g.l, r.x / W) && near(g.t, r.y / H) && near(g.r, (r.x + r.w) / W) && near(g.b, (r.y + r.h) / H), JSON.stringify({ g, r }));
    const urls = await page.evaluate(() => window.__urls);
    assert(g.src === urls[0] && g.nw === W, '그 학생 첫 쪽 그림이 아님: ' + g.nw);
    assert(g.width > g.sheet * 0.6, `작게 보임 ${g.width}/${g.sheet}`);
  }],
  ['[쪽 전체 보기] ↔ [이 문항만]: 누르는 칸 44px, aria-pressed', async () => {
    assert(await pressed('item') === 'true' && await pressed('page') === 'false', '처음엔 이 문항만');
    const hs = await page.$$eval(`${S} [data-cv]`, els => els.map(e => e.getBoundingClientRect().height));
    assert(hs.length === 2 && hs.every(h => h >= 44), JSON.stringify(hs));
    await page.click(`${S} [data-cv="page"]`);
    assert(await page.locator(`${S} .un-pages img`).count() === 2 && !(await page.locator(`${S} .un-crop`).count()), '쪽 전체가 아님');
    assert(await pressed('page') === 'true' && await pressed('item') === 'false', '눌림 표시');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.cv) === 'page', '바꾼 뒤 초점');
    await page.click(`${S} [data-cv="item"]`);
    assert((await cropAlt()) === '1번 학생 · 2번 문항', '다시 이 문항만');
    await page.click(`${S} [data-cv="page"]`);
    await close();
  }],
  ['고른 보기는 이 화면에서 기억, 다른 학생·다른 쪽 칸도 적어 둔 자리로(새 요청 없음)', async () => {
    await cell('2-7');
    assert(await pressed('page') === 'true', '쪽 전체를 기억하지 않음');
    assert(!(await msg()).includes('찾는 중'), '또 찾음');
    await page.click(`${S} [data-cv="item"]`);
    assert((await cropAlt()) === '2번 학생 · 7번 문항', await cropAlt());
    const urls = await page.evaluate(() => window.__urls);
    assert((await page.getAttribute(`${S} .un-crop img`, 'src')) === urls[3], '2번 학생 둘째 쪽이 아님');
    assert(locates.length === 1, '자리 찾기 요청 ' + locates.length);
    await close();
  }],
  ['그 쪽이 없는 학생(3번은 1쪽)·못 찾은 문항(10번)은 쪽 전체와 까닭, 바꾸기 단추 없음', async () => {
    await cell('3-7');
    assert(await page.locator(`${S} .un-pages img`).count() === 1 && !(await page.locator(`${S} [data-cv]`).count()), '3번 7번');
    assert((await msg()).includes('그 쪽이 없어'), await msg());
    await close();
    await cell('3-1');
    assert((await cropAlt()) === '3번 학생 · 1번 문항', '3번 첫 쪽 문항');
    await close();
    await cell('1-10');
    assert(await page.locator(`${S} .un-pages img`).count() === 2 && !(await page.locator(`${S} [data-cv]`).count()), '10번');
    assert((await msg()).includes('찾지 못해'), await msg());
    await close();
    assert(locates.length === 1, '자리 찾기 요청 ' + locates.length);
  }],
  ['새로 고쳐도 key.boxes가 남고, 스캔을 다시 넣으면 새 요청 없이 그 문항만', async () => {
    const before = (await T(id)).key.boxes;
    await page.reload(); await page.waitForTimeout(500);
    await toUnit();
    await page.click(`${V} [data-un-open="${id}"]`);
    await step(3);
    assert(JSON.stringify((await T(id)).key.boxes) === JSON.stringify(before), '자리가 바뀜');
    await cell('1-1');
    assert((await page.textContent(S)).includes('스캔 이미지는 저장하지 않아서'), '스캔 없을 때 안내');
    await close();
    await upload();
    await cell('1-3');
    assert((await cropAlt()) === '1번 학생 · 3번 문항', '다시 넣은 뒤 ' + await cropAlt());
    await close();
    assert(locates.length === 1, '자리 찾기 요청 ' + locates.length);
  }],
  ['3단계 [문항 자리 다시 찾기]: 한 번 더 찾아 바꿈(이번엔 10번도)', async () => {
    round = 2; slowLoc = 500;
    const at = (await T(id)).key.boxes.at;
    assert((await page.textContent(`${V} [data-un="relocate"]`)).includes('문항 자리 다시 찾기'), '단추 이름');
    const h = await page.$eval(`${V} [data-un="relocate"]`, e => e.getBoundingClientRect().height);
    assert(h >= 44, '단추 높이 ' + h);
    await page.click(`${V} [data-un="relocate"]`);
    await until(async () => (await page.textContent(`${V} #unLocMsg`)).includes('찾는 중'));
    await until(async () => locates.length === 2 && !(await page.textContent(`${V} #unLocMsg`)).includes('찾는 중'));
    const b = (await T(id)).key.boxes;
    assert(b.at > at && b.items[10], JSON.stringify(b));
    await cell('2-10');
    assert((await cropAlt()) === '2번 학생 · 10번 문항', await cropAlt());
    await close();
    slowLoc = 0;
  }],
  ['AI 키가 없어도 적어 둔 자리로는 그 문항만(요청 없음)', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: {}, remember: true })));
    await page.reload(); await page.waitForTimeout(500);
    await toUnit();
    await page.click(`${V} [data-un-open="${id}"]`);
    await upload();
    await cell('1-4');
    assert((await cropAlt()) === '1번 학생 · 4번 문항', await cropAlt());
    await close();
    assert(locates.length === 2, '자리 찾기 요청 ' + locates.length);
  }],
  ['390px: 확인 창이 가로로 넘치지 않음, 자른 그림이 창 안에, 바꾸기 단추 44px', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await cell('2-5');
    const m = await page.evaluate(() => {
      const sh = document.querySelector('#sheetRoot .sheet'), w = document.querySelector('#sheetRoot .un-crop');
      return { doc: document.documentElement.scrollWidth, sw: sh.scrollWidth, cw: sh.clientWidth, crop: w ? w.getBoundingClientRect().right : 0, right: sh.getBoundingClientRect().right,
        hs: [...document.querySelectorAll('#sheetRoot [data-cv]')].map(e => e.getBoundingClientRect().height) };
    });
    assert(m.doc <= 390 && m.sw <= m.cw && m.crop > 0 && m.crop <= m.right, JSON.stringify(m));
    assert(m.hs.length === 2 && m.hs.every(h => h >= 44), JSON.stringify(m.hs));
    await close();
    assert(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, '3단계 화면이 넘침');
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['AI 키가 없고 적어 둔 자리도 없으면 찾지 않고 지금처럼 쪽 전체', async () => {
    await page.evaluate(id => { const x = JSON.parse(localStorage.getItem('ssam:unit:t:' + id)); delete x.key.boxes; localStorage.setItem('ssam:unit:t:' + id, JSON.stringify(x)); }, id);
    await page.reload(); await page.waitForTimeout(500);
    await toUnit();
    await page.click(`${V} [data-un-open="${id}"]`);
    await upload();
    await cell('1-1');
    await page.waitForTimeout(300);
    assert(await page.locator(`${S} .un-pages img`).count() === 2 && !(await page.locator(`${S} [data-cv]`).count()), '쪽 전체가 아님');
    assert(!(await msg()).includes('찾는 중'), '키 없이 찾는 중');
    await close();
    assert(locates.length === 2 && !(await T(id)).key.boxes, '자리 찾기 요청 ' + locates.length);
  }],
  ['채점 AI가 업스테이지(그림을 글자로 바꿔 보냄)면 찾지 않고 쪽 전체, [문항 자리 다시 찾기] 줄 없음', async () => {
    let up = 0;
    await page.route('https://api.upstage.ai/**', r => { up++; return r.fulfill({ status: 500, body: '{}' }); });
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'upstage', keys: { upstage: 'up-test' }, remember: true })));
    await page.reload(); await page.waitForTimeout(500);
    await toUnit();
    await page.click(`${V} [data-un-open="${id}"]`);
    await upload();
    assert(!(await page.locator(`${V} [data-un="relocate"]`).count()), '다시 찾기 줄이 보임');
    await cell('1-1');
    await page.waitForTimeout(300);
    assert(await page.locator(`${S} .un-pages img`).count() === 2 && !(await page.locator(`${S} [data-cv]`).count()) && !(await msg()), '쪽 전체가 아님');
    await close();
    assert(up === 0 && locates.length === 2, `업스테이지 ${up} · 자리 찾기 ${locates.length}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
