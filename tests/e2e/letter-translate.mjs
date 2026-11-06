// 가정통신문 번역본(스펙 2026-11-06 K): openLetterTranslate(글이 없으면 알림), [번역본 만들기] → AI 한 번(전화번호·날짜·숫자만 있는 줄·칸은 보내지 않음),
// 「AI 번역이에요」 알림, 줄마다 번역 고치기, 언어마다 저장(새로 고침·다시 열어도 AI 안 부름), 원문을 고친 줄만 다시 번역,
// 원문과 나란히 내려받기(기본 양식 한글·워드, 학교 양식 .hwpx는 머리·학교장 그대로), 다른 언어(중국어)도
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, ROOT } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const reqs = [];
const TAG = p => (/베트남어/.test(p) ? 'VI' : /중국어/.test(p) ? 'ZH' : /러시아어/.test(p) ? 'RU' : 'EN');
await mockClaude(page, ({ prompt }) => {
  reqs.push(prompt);
  if (prompt.startsWith('[가정통신문 번역]')) {
    const out = {};
    for (const m of prompt.matchAll(/^\[(\d+)\] (.*)$/gm)) out[m[1]] = `${TAG(prompt)}: ${m[2]}`;
    return JSON.stringify(out);
  }
  return JSON.stringify({ title: '2026학년도 가을 현장체험학습 안내', greeting: ['안녕하십니까?'],
    intro: '3학년 현장체험학습을 다음과 같이 실시합니다.', items: ['1. 일시: 2026. 11. 12.(목)', '  가. 준비물: 도시락, 물', '| 시간 | 내용 |', '| 09:00 | 학교 출발 |'],
    closing: '협조를 부탁드립니다.', reply: { need: true, title: '참가 동의서', fields: ['참가 여부: □ 참가합니다  □ 참가하지 않습니다'], due: '11. 7.(금)까지 제출해 주세요.' },
    short: '11월 12일(목) 현장체험학습이 있어요.', related: [], target: '3학년 보호자' });
});
const P = 'section[data-menu="etc"] .lf-box', C = `${P} #lfTrCard`;
const FORM = readFileSync(join(ROOT, 'samples', '가정통신문-양식-예시.hwpx'));
const unzipDl = async dl => { const { unzip } = await import('../../web/core/zip.js'); return unzip(new Uint8Array(readFileSync(await dl.path()))); };
const dec = u8 => new TextDecoder().decode(u8);
const toast = () => page.textContent('#toast');
const trOf = ko => page.inputValue(`${C} textarea[data-lt-ko="${ko.replace(/"/g, '\\"')}"]`);
const trCalls = () => reqs.filter(p => p.startsWith('[가정통신문 번역]'));
const jobLines = p => [...p.matchAll(/^\[(\d+)\] (.*)$/gm)].map(m => m[2]);
const openTr = lang => page.evaluate(async l => { const m = await import('/menus/etc/letter.js'); return m.openLetterTranslate(l); }, lang);
const goLetter = async () => { await page.click('nav.app-side [data-menu-go="etc"]'); await page.click('#menuTabs [data-tab="letter"]'); await page.waitForSelector(`${P} #lfMemo`); };
const order = (s, list) => list.map(x => s.indexOf(x)).every((v, i, a) => v >= 0 && (!i || v > a[i - 1]));

await page.goto(url);
await page.waitForTimeout(400);

await run('letter-translate', [
  ['openLetterTranslate: 쓴 글이 없으면 가정통신문 탭으로 가서 먼저 쓰라고 알림(AI 안 부름)', async () => {
    const r = await openTr('vi');
    assert(r === 'empty', String(r));
    await page.waitForSelector(`${P} #lfMemo`);
    assert(await page.isVisible(P), '가정통신문 화면');
    assert((await toast()).includes('먼저 가정통신문을 써 주세요'), await toast());
    assert(!(await page.$(C)) && reqs.length === 0, '번역 칸·AI');
  }],
  ['글을 쓰면 번역본 칸(언어 4개), 전화번호·날짜 줄을 넣고 [번역본 만들기] → AI 한 번, 전화번호·날짜·숫자 칸은 보내지 않음', async () => {
    await page.fill(`${P} #lfMemo`, '11월 12일 현장체험학습');
    await page.click(`${P} [data-lf="write"]`);
    await page.waitForSelector(`${P} [data-lo="title"]`, { timeout: 8000 });
    await page.waitForSelector(C);
    assert((await page.textContent(`${C} .seg`)).replace(/\s+/g, '') === '베트남어중국어(간체)러시아어영어', await page.textContent(`${C} .seg`));
    assert(!(await page.$(`${C} .lf-tr-note`)), '번역 전 알림');
    const body = await page.inputValue(`${P} [data-lo="body"]`);
    await page.fill(`${P} [data-lo="body"]`, `${body}\n문의: 교무실 031-123-4567\n2026. 11. 12.(목)`);
    await page.click(`${C} [data-lf="trMake"]`);
    await page.waitForSelector(`${C} .lf-tr-note`, { timeout: 8000 });
    assert(trCalls().length === 1, 'AI ' + trCalls().length);
    const p = trCalls()[0], jobs = jobLines(p);
    assert(p.includes('베트남어') && jobs.includes('학교 출발') && jobs.includes('문의: 교무실 {{1}}') && jobs.includes('준비물: 도시락, 물'), jobs.join(' | '));
    assert(!p.includes('031-123-4567') && !jobs.includes('2026. 11. 12.(목)') && !jobs.includes('09:00'), jobs.join(' | '));
    assert(jobs.includes('참가 동의서') && jobs.includes('11월 12일(목) 현장체험학습이 있어요.'), '회신서·알림 글');
    assert(!p.includes('사람이 쓴 자연스러운 한국어로'), '한국어 글쓰기 원칙이 붙음');
  }],
  ['「AI 번역이에요」 알림, 줄마다 한국어 아래 번역(머리·표 짜임·전화번호 그대로), 날짜 줄은 그대로', async () => {
    assert((await page.textContent(`${C} .lf-tr-note`)).includes('AI 번역이에요. 보내기 전에 확인해 주세요'), '알림');
    assert((await toast()).includes('AI 번역이에요'), await toast());
    assert((await trOf('2026학년도 가을 현장체험학습 안내')) === 'VI: 2026학년도 가을 현장체험학습 안내');
    assert((await trOf('  가. 준비물: 도시락, 물')) === '  가. VI: 준비물: 도시락, 물', await trOf('  가. 준비물: 도시락, 물'));
    assert((await trOf('| 09:00 | 학교 출발 |')) === '| 09:00 | VI: 학교 출발 |');
    assert((await trOf('문의: 교무실 031-123-4567')) === 'VI: 문의: 교무실 031-123-4567');
    assert((await trOf('11월 12일(목) 현장체험학습이 있어요.')) === 'VI: 11월 12일(목) 현장체험학습이 있어요.');
    const fixed = await page.$$eval(`${C} .lf-tr-pair.fixed`, els => els.map(e => e.textContent));
    assert(fixed.some(s => s.includes('2026. 11. 12.(목)') && s.includes('그대로')), fixed.join(' | '));
    assert(await page.isVisible(`${C} [data-lf-lang="vi"][aria-pressed="true"]`) && (await page.textContent(`${C} [data-lf-lang="vi"]`)).includes('✓'));
  }],
  ['번역을 고치면 남고, 새로 고침 뒤에도 AI 안 부름, openLetterTranslate로 다시 열면 저장해 둔 번역', async () => {
    await page.fill(`${C} textarea[data-lt-ko="2026학년도 가을 현장체험학습 안내"]`, 'Thông báo trải nghiệm thực tế mùa thu');
    const n = reqs.length;
    await page.reload(); await page.waitForTimeout(500);
    await goLetter();
    await page.waitForSelector(`${C} .lf-tr-note`);
    assert((await trOf('2026학년도 가을 현장체험학습 안내')) === 'Thông báo trải nghiệm thực tế mùa thu', '고친 번역');
    assert(await openTr('베트남어') === 'saved', '다시 열기');
    assert((await toast()).includes('저장해 둔 번역본'), await toast());
    assert(reqs.length === n, 'AI를 다시 부름');
  }],
  ['원문 줄을 고치면 그 줄만 번역이 없다고 알리고, [번역본 만들기]는 그 줄만 보냄', async () => {
    const body = await page.inputValue(`${P} [data-lo="body"]`);
    await page.fill(`${P} [data-lo="body"]`, body.replace('협조를 부탁드립니다.', '많은 협조를 부탁드립니다.'));
    await page.waitForFunction(s => (document.querySelector(s) || {}).textContent?.includes('번역이 없는 줄이 1개'), C);
    await page.click(`${C} [data-lf="trMake"]`);
    await page.waitForFunction(s => !(document.querySelector(s) || {}).textContent?.includes('번역이 없는 줄'), C, { timeout: 8000 });
    assert(trCalls().length === 2 && jobLines(trCalls()[1]).join('|') === '많은 협조를 부탁드립니다.', jobLines(trCalls()[1]).join('|'));
    assert((await trOf('2026학년도 가을 현장체험학습 안내')) === 'Thông báo trải nghiệm thực tế mùa thu', '고친 번역이 덮임');
  }],
  ['기본 양식 한글로 내려받기: 「가 정 통 신 문」, 제목 한국어+번역, 줄마다 한국어 뒤 번역, 표 뒤 번역 표, 회신서 두 말', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${C} [data-exp-main][data-lf="trDownload"]`)]);
    assert(dl.suggestedFilename() === '2026학년도 가을 현장체험학습 안내 (베트남어).hwpx', dl.suggestedFilename());
    const sec = dec((await unzipDl(dl)).get('Contents/section0.xml'));
    assert(sec.includes('가 정 통 신 문'), '머리');
    assert(order(sec, ['>2026학년도 가을 현장체험학습 안내<', '>Thông báo trải nghiệm thực tế mùa thu<', '>안녕하십니까?<', '>VI: 안녕하십니까?<', '>1. 일시: 2026. 11. 12.(목)<', '>1. VI: 일시: 2026. 11. 12.(목)<', '>학교 출발<', '>VI: 학교 출발<', '>문의: 교무실 031-123-4567<', '>VI: 문의: 교무실 031-123-4567<']), '나란히');
    assert((sec.match(/>2026\. 11\. 12\.\(목\)</g) || []).length === 1, '날짜 줄은 한 번');
    assert(sec.includes('>Họ tên học sinh<') && sec.includes('>VI: 참가 동의서<') && sec.includes('Phụ huynh'), '회신서');
  }],
  ['워드로 바꿔 내려받기(.docx)에도 원문과 번역', async () => {
    await page.click(`${C} [data-exp-menu]`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="docx"]')]);
    assert(dl.suggestedFilename().endsWith('(베트남어).docx'), dl.suggestedFilename());
    const doc = dec((await unzipDl(dl)).get('word/document.xml'));
    assert(order(doc, ['>안녕하십니까?<', '>VI: 안녕하십니까?<']), '워드 나란히');
    await page.click(`${C} [data-exp-menu]`);
    await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="hwpx"]')]);
  }],
  ['학교 양식(.hwpx)이면 그 양식 그대로: 머리·로고·학교장 줄은 그대로, 제목 아래 번역 제목, 한국어 문단 뒤 번역', async () => {
    await page.setInputFiles(`${P} #lfFormFile`, { name: '가정통신문-양식-예시.hwpx', mimeType: 'application/octet-stream', buffer: FORM });
    await page.waitForFunction(s => (document.querySelector(`${s} #lfForm`) || {}).value, P, { timeout: 8000 });
    await page.waitForSelector(`${C} button[data-lf="trDownload"]:not([data-exp-main])`);
    assert((await page.textContent(`${C} [data-lf="trDownload"]`)).includes('베트남어 번역본 한글로 내려받기'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${C} [data-lf="trDownload"]`)]);
    const z = await unzipDl(dl), sec = dec(z.get('Contents/section0.xml'));
    assert(z.has('BinData/image1.png') && sec.includes('가 정 통 신 문') && sec.includes('교장 : 김새싹') && sec.includes('새 싹 초 등 학 교 장'), '양식 머리·학교장');
    assert(!sec.includes('학부모 상담 주간 안내'), '옛 제목');
    assert(order(sec, ['>2026학년도 가을 현장체험학습 안내<', '>Thông báo trải nghiệm thực tế mùa thu<', '>안녕하십니까?<', '>VI: 안녕하십니까?<']), '나란히');
    assert(sec.includes('>Họ tên học sinh<') && sec.includes('자 르 는 선'), '회신서');
  }],
  ['openLetterTranslate("zh") → 중국어(간체) 번역을 바로 시작(베트남어 번역은 그대로 남음)', async () => {
    const n = trCalls().length;
    assert(await openTr('zh') === 'started', 'zh');
    await page.waitForFunction(s => document.querySelector(`${s} [data-lf-lang="zh"][aria-pressed="true"]`) && document.querySelector(`${s} .lf-tr-note`), C, { timeout: 8000 });
    assert(trCalls().length === n + 1 && trCalls()[n].includes('简体中文'), '중국어 AI');
    assert((await trOf('2026학년도 가을 현장체험학습 안내')) === 'ZH: 2026학년도 가을 현장체험학습 안내');
    await page.click(`${C} [data-lf-lang="vi"]`);
    assert((await trOf('2026학년도 가을 현장체험학습 안내')) === 'Thông báo trải nghiệm thực tế mùa thu', '베트남어');
  }],
  ['알림 글 번역 복사, 새 가정통신문이면 번역 칸 없음, 최근에서 다시 열면 번역이 남아 있음', async () => {
    await page.click(`${C} [data-lf="trCopyShort"]`); await page.waitForTimeout(150);
    assert((await page.evaluate(() => navigator.clipboard.readText())) === 'VI: 11월 12일(목) 현장체험학습이 있어요.', '복사');
    await page.click(`${P} [data-lf="new"]`);
    assert(!(await page.$(C)), '새 글에 번역 칸');
    await page.click(`${P} #lfRecent [data-lf-open]`);
    await page.waitForSelector(`${C} .lf-tr-note`);
    assert((await page.textContent(`${C} [data-lf-lang="zh"]`)).includes('✓') && (await page.textContent(`${C} [data-lf-lang="vi"]`)).includes('✓'), '언어 저장');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
