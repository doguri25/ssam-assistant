// 단원평가 1단계 단추가 이름대로(2026-11-10 선생님 요청 「정답지 넣기와 평가지 넣기가 바뀐 것 같다」):
// [학생 문제지 넣기(스캔한 것)] → [답안 넣기] 차례·이름, 빈 문제지는 접힌 칸, 옛 이름 없음,
// [답안 넣기]에 학생 문제지 스캔을 넣으면 학생 문제지로(답안 AI 안 부름), [학생 문제지 넣기]에 답안·빈 문제지 한글 파일을 넣으면 그쪽으로,
// 답안 전에 넣은 학생 문제지는 받아 두었다가 답안을 넣으면 학생별로 나눔
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-10T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  if (!localStorage.getItem('ssam:unit:set')) localStorage.setItem('ssam:unit:set', JSON.stringify({ pagesPer: 1, maskOn: false, mask: [], maskAll: false }));
});
const prompts = [], keyImages = [], full = [];
let roleOf = () => 'student', keyGate = null;
await mockClaude(page, async ({ prompt, images }) => {
  const head = prompt.split('\n')[0];
  prompts.push(head); full.push(prompt);
  if (head === '[단원평가 정답지]') keyImages.push(images);
  if (head === '[단원평가 정답지]' && keyGate) await keyGate; // 답안을 읽는 동안 다른 평가로 감
  // 한꺼번에 넣기의 쪽 나누기: 본 쪽은 모두 학생(roleOf로 바꿈)
  if (head === '[쪽 나누기]') return JSON.stringify({ pages: Array.from({ length: images }, (_, i) => ({ i, role: roleOf(i) })) });
  if (head === '[단원평가 정답지]') return JSON.stringify({ meta: {}, domains: [], items: [{ no: 1, content: '학생 글을 답안으로 읽음', answer: '틀림', points: 100 }] });
  return '{}';
});
const V = 'section[data-menu="evaluate"] .unit-box';
const KEY = join(ROOT, 'samples', '단원평가-정답지-예시.hwpx'), PAPER = join(ROOT, 'samples', '단원평가지-예시.hwpx');
// 글자 인식된 학생 문제지 스캔 4장(시연 자료, 쪽마다 「이름: 가람」…). 파일 이름의 「예시」는 정답 파일 이름으로 보므로 반 이름으로
const SCAN = { name: '3반 학생 문제지.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(ROOT, 'samples', '단원평가-답안-예시.pdf')) };
const asked = h => prompts.filter(p => p === h).length;
const text = sel => page.textContent(`${V} ${sel}`);
const waitText = (sel, s, ms = 15000) => page.waitForFunction(([q, w]) => ((document.querySelector(q) || {}).textContent || '').includes(w), [`${V} ${sel}`, s], { timeout: ms });
const cur = () => page.evaluate(async () => { const l = JSON.parse(localStorage.getItem('ssam:unit:list') || '[]'); return l.length ? JSON.parse(localStorage.getItem('ssam:unit:t:' + l[l.length - 1].id)) : null; });
// 글자층 없는 스캔 쪽(그림만): 사진·스캔 PDF
const pngs = n => page.evaluate(n => Array.from({ length: n }, (_, i) => { const c = document.createElement('canvas'); c.width = 300; c.height = 420; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 300, 420); g.fillStyle = '#000'; g.fillRect(20 + i * 9, 80, 120, 25); return c.toDataURL('image/png').split(',')[1]; }), n);
const photos = async n => (await pngs(n)).map((b, i) => ({ name: `학생${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b, 'base64') }));
const scanPdf = async n => {
  const pg = await t.ctx.newPage();
  await pg.setContent(`<!doctype html><style>@page{margin:0}body{margin:0}section{page-break-after:always;height:1100px}img{width:600px}</style>${(await pngs(n)).map(b => `<section><img src="data:image/png;base64,${b}"></section>`).join('')}`);
  const pdf = await pg.pdf({ format: 'A4' }); await pg.close();
  return { name: '3반 스캔.pdf', mimeType: 'application/pdf', buffer: pdf };
};
await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');

await run('unit-route', [
  ['1단계: [학생 문제지 넣기(스캔한 것)] 옆에 「학생 한 명 n쪽」, 그다음 [답안 넣기], 빈 문제지는 접힌 칸, 옛 이름은 없음', async () => {
    await page.click(`${V} #unNew`);
    const steps = await page.$$eval(`${V} .steps .steps-t`, l => l.map(x => x.textContent));
    assert(JSON.stringify(steps) === JSON.stringify(['학생 문제지·답안', '나누기·이름 가리기', '채점·확인', '피드백']), JSON.stringify(steps));
    const btns = await page.$$eval(`${V} .yp-card:first-of-type > .row > [data-un]`, l => l.map(b => [b.dataset.un, b.textContent.trim()]));
    assert(JSON.stringify(btns) === JSON.stringify([['ansFile', '학생 문제지 넣기(스캔한 것)'], ['keyFile', '답안 넣기']]), JSON.stringify(btns));
    assert((await page.textContent(`${V} .row:has([data-un="ansFile"])`)).includes('학생 한 명') && await page.locator(`${V} .row:has([data-un="ansFile"]) #unPagesPer`).count() === 1, '쪽 수 칸');
    assert(await page.locator(`${V} details.un-more:not([open]) [data-un="paperFile"]`).count() === 1, '빈 문제지가 접힌 칸에 없음');
    assert((await text('details.un-more summary')).includes('빈 문제지도 있으면 (선택)'), await text('details.un-more summary'));
    const all = await text('.un-page');
    for (const old of ['정답지 넣기', '답안 스캔', '평가지 넣기', '답안 올리기', '정답지·평가지']) assert(!all.includes(old), `옛 이름 「${old}」`);
    assert(await page.isDisabled(`${V} [data-un="next"]`), '[다음]이 켜짐');
  }],
  ['[답안 넣기]에 글자 인식된 학생 문제지 스캔 PDF → 학생 문제지로 옮겨 넣고 알림(답안 AI 안 부름), 답안 전이라 받아 둠', async () => {
    await page.setInputFiles(`${V} #unKeyFile`, SCAN);
    await waitText('#unKeyMsg', '학생 문제지로 보여서 학생 문제지로 넣었어요');
    await waitText('#unAnsMsg', '받았어요');
    assert((await text('#unAnsMsg')).includes('답안을 넣으면 학생별로 나눠요'), await text('#unAnsMsg'));
    assert(asked('[단원평가 정답지]') === 0, '학생 문제지를 답안으로 읽음');
    assert((await text('.un-sum')).startsWith('0문항') && await page.isDisabled(`${V} [data-un="next"]`), '답안이 들어감');
  }],
  ['그다음 [답안 넣기]에 답안 한글 파일 → 10문항, 받아 둔 학생 문제지를 학생 4명으로 나눔 → [다음]에 4명', async () => {
    await page.setInputFiles(`${V} #unKeyFile`, KEY);
    await waitText('.un-sum', '10문항 · 100점');
    await waitText('#unAnsMsg', '학생 4명');
    assert(asked('[단원평가 정답지]') === 0, 'AI');
    assert((await cur()).students.length === 4, JSON.stringify((await cur()).students.length));
    await page.click(`${V} [data-un="next"]`);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 4);
    assert((await text('.steps [aria-current="step"]')).includes('나누기·이름 가리기'), '2단계');
    assert((await text('[data-un="ansFile"]')).includes('학생 문제지 다시 넣기'), await text('[data-un="ansFile"]'));
  }],
  ['[답안 넣기]에 글자 없는 스캔 PDF 3쪽 → 쪽 나누기 AI가 학생으로 봄 → 학생 문제지로(답안은 그대로, 답안 AI 안 부름)', async () => {
    await page.click(`${V} .steps [data-step="1"]`);
    await page.setInputFiles(`${V} #unKeyFile`, await scanPdf(3));
    await waitText('#unKeyMsg', '학생 문제지로 보여서 학생 문제지로 넣었어요');
    await waitText('#unAnsMsg', '학생 3명');
    assert(asked('[쪽 나누기]') === 1 && asked('[단원평가 정답지]') === 0, JSON.stringify(prompts));
    const x = await cur();
    assert(x.key.items.length === 10 && x.students.length === 3, JSON.stringify([x.key.items.length, x.students.length]));
    await page.click(`${V} [data-un="back"]`);
  }],
  ['[학생 문제지 넣기]에 답안 한글 파일 → 답안으로, 빈 문제지 한글 파일 → 빈 문제지로 옮겨 넣고 학생 문제지 줄에 알림', async () => {
    await page.click(`${V} #unNew`);
    await page.setInputFiles(`${V} #unAnsFile`, KEY);
    await waitText('.un-sum', '10문항 · 100점');
    assert((await text('#unAnsMsg')).includes('답안으로 보여서 답안으로 넣었어요'), await text('#unAnsMsg'));
    await page.setInputFiles(`${V} #unAnsFile`, PAPER);
    await page.waitForFunction(() => document.querySelector('.unit-box #unUnitName').value === '중요한 내용을 적어요');
    assert((await text('#unAnsMsg')).includes('빈 문제지로 보여서 빈 문제지로 넣었어요'), await text('#unAnsMsg'));
    assert(await page.locator(`${V} details.un-more[open]`).count() === 1 && (await text('#unPaperMsg')).includes('10문항'), '빈 문제지 칸');
    assert((await cur()).students.length === 0, '학생이 생김');
    // 답안이 있으니 사진은 바로 학생별로
    await page.setInputFiles(`${V} #unAnsFile`, await photos(2));
    await waitText('#unAnsMsg', '학생 2명');
    assert(asked('[단원평가 정답지]') === 0, 'AI');
    await page.click(`${V} [data-un="back"]`);
  }],
  ['[학생 문제지 넣기]에 학생 이름이 적힌 글 파일 → 넣지 않고 알림(빈 문제지·답안으로 저장 안 함)', async () => {
    const n0 = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:list') || '[]').length);
    await page.click(`${V} #unNew`);
    const NAMED = { name: '3반 학생 문제지.txt', mimeType: 'text/plain', buffer: Buffer.from('수학 3단원 평가\n이름: 김가람\n1. 다음 중 알맞은 것은? ( 3 )\n2. 계산하세요. 12+5 = 17') };
    await page.setInputFiles(`${V} #unAnsFile`, NAMED);
    await waitText('#unAnsMsg', '학생 이름이 적힌 글이라 넣지 않았어요');
    assert(!(await text('#unPaperMsg')).trim() && !(await text('#unKeyMsg')).trim(), '빈 문제지·답안 칸에 들어감');
    assert((await text('.un-sum')).includes('0문항'), '문항이 생김: ' + await text('.un-sum'));
    await page.click(`${V} [data-un="back"]`);
    const all = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ssam:')).map(k => localStorage.getItem(k)).join(''));
    assert(!all.includes('김가람'), '이름이 저장됨');
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:list') || '[]').length) === n0, '새 평가가 저장됨');
  }],
  ['[학생 문제지 넣기]를 답안보다 먼저 해도 받아 두었다가, 답안을 넣으면 그때 학생별로 나눔', async () => {
    await page.click(`${V} #unNew`);
    await page.fill(`${V} #unPagesPer`, '1'); await page.dispatchEvent(`${V} #unPagesPer`, 'change');
    await page.setInputFiles(`${V} #unAnsFile`, await photos(3));
    await waitText('#unAnsMsg', '학생 문제지 스캔 3장을 받았어요');
    assert(await page.isDisabled(`${V} [data-un="next"]`), '[다음]');
    await page.setInputFiles(`${V} #unKeyFile`, KEY);
    await waitText('#unAnsMsg', '학생 3명');
    assert((await cur()).students.length === 3, '학생 수');
    assert(!(await page.isDisabled(`${V} [data-un="next"]`)), '[다음]이 꺼짐');
  }],
  ['[답안 넣기]에 맨 앞이 정답 쪽인 반 스캔 PDF 4쪽 → 확인 카드(정답·교사용 1쪽 · 학생 3쪽) → 답안 AI에는 정답 쪽 1장만, 학생 3명', async () => {
    roleOf = i => (i === 0 ? 'teacher' : 'student');
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} #unNew`);
    const n0 = keyImages.length;
    await page.setInputFiles(`${V} #unKeyFile`, await scanPdf(4));
    await page.waitForSelector('#sheetRoot #bundleCard', { timeout: 15000 });
    assert((await page.textContent('#sheetRoot #bundleSum')).includes('정답·교사용 1쪽 · 학생 3쪽'), await page.textContent('#sheetRoot #bundleSum'));
    await page.click('#sheetRoot #bundleOk');
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3, null, { timeout: 15000 });
    assert(JSON.stringify(keyImages.slice(n0)) === '[1]', JSON.stringify(keyImages));
    const x = await cur();
    assert(x.key.items.length === 1 && x.students.length === 3, JSON.stringify([x.key.items.length, x.students.length]));
  }],
  // [버그] 사진 1~2장·글자 없는 PDF 1~2쪽은 쪽 나누기 AI(3쪽부터)가 보지 않아, 학생 문제지여도 답안으로 읽혀 가리지 않은 그림(이름)이 답안 AI로 감
  ['[답안 넣기]에 이름 없는 사진 1장 → 「답안인가요, 학생 문제지인가요?」 → [학생 문제지예요] → 학생 문제지로 받아 둠(답안 AI 안 부름)', async () => {
    roleOf = () => 'student';
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} #unNew`);
    const n0 = asked('[단원평가 정답지]');
    await page.setInputFiles(`${V} #unKeyFile`, (await photos(1))[0]);
    await page.waitForSelector('#sheetRoot #unKindAsk');
    assert((await page.textContent('#sheetRoot #unKindAsk')).includes('이 사진은 답안(정답)인가요, 학생 문제지인가요?'), await page.textContent('#sheetRoot #unKindAsk'));
    await page.click('#sheetRoot #unKindPapers');
    await waitText('#unAnsMsg', '학생 문제지 스캔 1장을 받았어요');
    assert((await text('#unKeyMsg')).includes('학생 문제지로 넣었어요'), await text('#unKeyMsg'));
    assert(asked('[단원평가 정답지]') === n0, '답안 AI를 부름');
    assert((await text('.un-sum')).startsWith('0문항'), await text('.un-sum'));
  }],
  ['[답안 넣기]에 이름 없는 사진 → [답안이에요] → 답안 AI가 그 사진을 읽음, 받아 둔 학생 문제지를 나눔', async () => {
    const n0 = keyImages.length;
    await page.setInputFiles(`${V} #unKeyFile`, { ...(await photos(1))[0], name: 'IMG_0002.png' });
    await page.waitForSelector('#sheetRoot #unKindAsk');
    await page.click('#sheetRoot #unKindKey');
    await waitText('.un-sum', '1문항');
    assert(JSON.stringify(keyImages.slice(n0)) === '[1]', JSON.stringify(keyImages));
    await waitText('#unAnsMsg', '학생 1명');
  }],
  ['[답안 넣기]에 글자 없는 PDF 2쪽 → 묻고 [학생 문제지예요] → 학생 2명(쪽 나누기·답안 AI 안 부름), 창을 닫으면 아무것도 넣지 않음', async () => {
    const n0 = prompts.length;
    await page.setInputFiles(`${V} #unKeyFile`, await scanPdf(2));
    await page.waitForSelector('#sheetRoot #unKindAsk');
    assert((await page.textContent('#sheetRoot #unKindAsk')).includes('이 파일은'), await page.textContent('#sheetRoot #unKindAsk'));
    await page.click('#sheetRoot #unKindPapers');
    await waitText('#unAnsMsg', '학생 2명');
    assert(prompts.length === n0, JSON.stringify(prompts.slice(n0)));
    assert((await cur()).students.length === 2, '학생 수');
    // 닫기: 답안도 학생 문제지도 그대로
    await page.setInputFiles(`${V} #unKeyFile`, await scanPdf(1));
    await page.waitForSelector('#sheetRoot #unKindAsk');
    await page.click('#sheetRoot #sheetBg', { position: { x: 5, y: 5 } });
    await page.waitForFunction(() => !document.querySelector('#sheetRoot #unKindAsk'));
    await page.waitForTimeout(300);
    assert(prompts.length === n0 && (await cur()).students.length === 2 && (await cur()).key.items.length === 1, '닫았는데 넣음');
    assert(!(await text('#unKeyMsg')).includes('읽는 중'), await text('#unKeyMsg'));
  }],
  // [버그] 답안 전에 받아 둔 학생 문제지는 한 평가 몫뿐이라, 평가 A의 답안을 읽는 동안 새 평가 B에 학생 문제지를 넣으면 A의 것이 말없이 버려짐
  ['평가 A에 받아 둔 학생 문제지는 A의 답안을 읽는 동안 새 평가 B에 학생 문제지를 넣어도 남음 → A를 열면 A 학생 3명, B는 B대로 2명', async () => {
    const ids = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:unit:list') || '[]').map(s => s.id));
    const before = await ids();
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} #unNew`);
    await page.setInputFiles(`${V} #unAnsFile`, await photos(3));
    await waitText('#unAnsMsg', '학생 문제지 스캔 3장을 받았어요');
    let release;
    keyGate = new Promise(r => { release = r; });
    const n0 = asked('[단원평가 정답지]');
    await page.setInputFiles(`${V} #unKeyFile`, { ...(await photos(1))[0], name: '정답지.png' });
    for (let i = 0; i < 100 && asked('[단원평가 정답지]') === n0; i++) await page.waitForTimeout(100);
    assert(asked('[단원평가 정답지]') === n0 + 1, '답안 AI를 부르지 않음');
    // A의 답안을 읽는 동안 목록으로 나가 새 평가 B에 학생 문제지 2장
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} #unNew`);
    await page.setInputFiles(`${V} #unAnsFile`, await photos(2));
    await waitText('#unAnsMsg', '학생 문제지 스캔 2장을 받았어요');
    keyGate = null; release();
    await page.waitForFunction(n => JSON.parse(localStorage.getItem('ssam:unit:list') || '[]').length === n, before.length + 1);
    const aId = (await ids()).find(x => !before.includes(x));
    // B를 보고 있는 동안 A의 답안이 들어와도 B의 받아 둔 것·알림은 그대로
    assert((await text('#unAnsMsg')).includes('2장을 받았어요'), await text('#unAnsMsg'));
    await page.setInputFiles(`${V} #unKeyFile`, KEY);
    await waitText('#unAnsMsg', '학생 2명');
    // A를 열면 받아 둔 3장을 학생별로 나눔
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un-open="${aId}"]`);
    await page.waitForFunction(() => document.querySelectorAll('.unit-box [data-st]').length === 3, null, { timeout: 15000 });
    const a = await page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), aId);
    assert(a.students.length === 3 && a.key.items.length === 1, JSON.stringify([a.students.length, a.key.items.length]));
  }],
  // [버그] 「빈 문제지도 있으면 (선택)」을 접어도 빈 문제지 알림이 있는 동안은 다시 그릴 때마다 펼쳐짐
  ['「빈 문제지도 있으면」은 빈 문제지를 넣은 바로 뒤에만 펼치고, 선생님이 접으면 다시 그려도 접힌 채', async () => {
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} #unNew`);
    await page.setInputFiles(`${V} #unKeyFile`, KEY);
    await waitText('.un-sum', '10문항');
    await page.setInputFiles(`${V} #unAnsFile`, PAPER);
    await waitText('#unPaperMsg', '10문항');
    assert(await page.locator(`${V} details.un-more[open]`).count() === 1, '넣은 뒤 펼치지 않음');
    await page.click(`${V} details.un-more > summary`);
    await page.waitForFunction(() => !document.querySelector('.unit-box details.un-more').open);
    await page.click(`${V} [data-un="addItem"]`); // 화면을 다시 그림
    await page.waitForFunction(() => document.querySelector('.unit-box .un-sum').textContent.startsWith('11문항'));
    assert(await page.locator(`${V} details.un-more[open]`).count() === 0, '접었는데 다시 펼쳐짐');
    await page.click(`${V} [data-un="delItem"][data-no="11"]`);
    await page.waitForFunction(() => document.querySelector('.unit-box .un-sum').textContent.startsWith('10문항'));
    assert(await page.locator(`${V} details.un-more[open]`).count() === 0, '접었는데 다시 펼쳐짐(빼기)');
    // 빈 문제지를 다시 넣으면 그 바로 뒤엔 펼침
    await page.setInputFiles(`${V} #unPaperFile`, PAPER);
    await page.waitForFunction(() => document.querySelector('.unit-box details.un-more').open);
  }],
  // [버그] 학생 이름이 적힌 글: [빈 문제지 넣기]는 빈 문제지로 저장해 학생마다 채점 AI로 보내고, [답안 넣기]는 그 글을 답안 AI로 보냄
  ['학생 이름이 적힌 글: [빈 문제지 넣기]·[답안 넣기]의 글 파일은 넣지 않고, 글자 인식된 학생 문제지 PDF 1쪽은 학생 문제지로(이름이 저장되거나 AI로 가지 않음)', async () => {
    const NAMED = '수학 3단원 평가\n이름: 김가람\n1. 다음 중 알맞은 것은? ( 3 )\n2. 계산하세요. 12+5 = 17';
    const stored = () => page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('ssam:')).map(k => localStorage.getItem(k)).join(''));
    const f0 = full.length;
    // 답안이 있는 평가(저장됨)의 [빈 문제지 넣기]
    await page.setInputFiles(`${V} #unPaperFile`, { name: '3반 학생 문제지.txt', mimeType: 'text/plain', buffer: Buffer.from(NAMED) });
    await waitText('#unPaperMsg', '학생 이름이 적힌 글이라');
    assert(!(await stored()).includes('김가람'), '빈 문제지로 이름이 저장됨');
    // [답안 넣기]의 글 파일
    await page.setInputFiles(`${V} #unKeyFile`, { name: '수학 평가.txt', mimeType: 'text/plain', buffer: Buffer.from(NAMED) });
    await waitText('#unKeyMsg', '학생 이름이 적힌 글이라 넣지 않았어요');
    // [답안 넣기]의 글자 인식된 학생 문제지 PDF 1쪽(복사기 「검색 가능 PDF」)
    const pg = await t.ctx.newPage();
    await pg.setContent(`<!doctype html><meta charset="utf-8"><style>body{font:18px sans-serif}</style>${NAMED.split('\n').map(l => `<p>${l}</p>`).join('')}`);
    const pdf = await pg.pdf({ format: 'A4' }); await pg.close();
    await page.setInputFiles(`${V} #unKeyFile`, { name: '스캔0001.pdf', mimeType: 'application/pdf', buffer: pdf });
    await waitText('#unKeyMsg', '학생 문제지로 보여서 학생 문제지로 넣었어요');
    await waitText('#unAnsMsg', '학생 1명');
    assert(!full.slice(f0).some(p => p.includes('김가람')), '이름이 AI로 감: ' + full.slice(f0).map(p => p.split('\n')[0]).join(','));
    assert(!(await stored()).includes('김가람'), '이름이 저장됨');
    assert((await cur()).key.items.length === 10, '답안이 바뀜');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
