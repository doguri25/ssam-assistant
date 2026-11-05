// 2026-11-05 3차 고침(계획·학급) 화면 시험: 엑셀·CSV 시간표·진도표, 날짜 없는 진도표에 줄 덧붙이기, 지운 교과 다시 넣기,
// 학급운영계획 지침 점검·결과 보고 AI가 끝날 때 치던 칸의 초점·한글 조합
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';
import { zipStore } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
/* AI 답 붙잡기: gate.guide·draft·report가 있으면 풀릴 때까지 기다림 */
const gate = {}, prompts = [];
const hold = k => { let open; gate[k] = new Promise(r => { open = r; }); return () => { delete gate[k]; open(); }; };
let reportN = 0;
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[학급운영계획 지침]')) { if (gate.guide) await gate.guide; return '[]'; }
  if (prompt.startsWith('[학급운영계획 초안]')) {
    if (gate.draft) await gate.draft;
    const secs = [...prompt.matchAll(/^ {2}- \[(\S+)\] ([^(\n]+)/gm)].map(m => [m[1], m[2].trim()]);
    return JSON.stringify({ sections: Object.fromEntries(secs.map(([id, x]) => [id, `${x}을(를) 올해 학급에 맞게 운영한다.`])), monthly: [] });
  }
  if (gate.report) await gate.report;
  reportN++;
  return JSON.stringify({ name: `과학의 날 ${reportN}`, period: { start: '2026-04-21' }, place: '강당', target: '전교생', count: '320명', summary: '실험',
    sections: [{ h: '목적', lines: ['흥미'] }], photos: ['모둠별 실험 장면', '발명품 발표 AI'] });
});
const C = 'section[data-menu="class"]', CP = 'section[data-menu="plan"] .cp-box', RP = 'section[data-menu="plan"] .rp-box';
const fresh = async (time, init = {}) => {
  await page.clock.setFixedTime(new Date(time));
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.evaluate(async init => {
    (await import('./core/store.js')).freeze();
    localStorage.clear();
    localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
    for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v);
  }, init);
  await page.reload(); await page.waitForTimeout(400);
  prompts.length = 0;
};
const stored = k => page.evaluate(k => JSON.parse(localStorage.getItem('ssam:' + k) || 'null'), k);
const goProgress = async () => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]'); await page.waitForSelector(`${C} #clsSubs`); };
const upload = async (sel, file) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(file); };
const todayText = async () => { await page.click('#menuTabs [data-tab="today"]'); await page.waitForTimeout(200); const v = (await page.textContent(`${C} #clsLessons`)).replace(/\s+/g, ' '); await page.click('#menuTabs [data-tab="progress"]'); return v; };
const progress = () => page.evaluate(async () => { const m = await import('./menus/class/class-model.js'); const ctx = m.makeCtx(); return m.progressOf(ctx, ctx.subjects[0]); });
const active = () => page.evaluate(() => { const a = document.activeElement; return a ? { id: a.id, cap: a.dataset.rpCap, rf: a.dataset.rf, tag: a.tagName, v: a.value } : null; });
const photo = n => ({ name: `사진${n}.jpg`, mimeType: 'image/jpeg', buffer: readFileSync(join(FIXTURES, `photo-${n}.jpg`)) });
/* 사람처럼 누르기: 누르고 80ms 뒤 뗌 */
const press = async sel => {
  await page.locator(sel).scrollIntoViewIfNeeded();
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
};

/* 엑셀 파일(첫 시트, 인라인 글) */
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const xlsx = rows => Buffer.from(zipStore([
  { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
  { name: 'xl/workbook.xml', data: `<?xml version="1.0"?><workbook ${NS}><sheets><sheet name="1" sheetId="1" r:id="rId1"/></sheets></workbook>` },
  { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
  { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0"?><worksheet ${NS}><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((c, k) => (c === '' ? '' : `<c r="${String.fromCharCode(65 + k)}${i + 1}" t="inlineStr"><is><t>${xesc(c)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData></worksheet>` }
]));
const csv = rows => Buffer.from(rows.map(r => r.map(c => (/[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n'));
const TT = [['3) 3학년'], ['3-1', '월', '화', '수', '목', '금'],
  ['1', '국어', '수학', '국어', '수학', '국어'], ['2', '수학', '', '과학', '국어', '수학'], ['3', '사회', '과학', '수학', '사회', '영어'],
  ['4', '과학', '체육', '음악', '미술', '체육'], ['5', '체육', '창체', '영어', '미술', '도덕'], ['6', '', '', '', '창체', '']];
const JINDO = [['국어 교육과정 연간지도계획'], ['2026학년도 2학기', '3학년 1반'], ['주', '기간', '단원명', '학습 주제', '차시', '쪽수', '비고'],
  ['1', '8.24~8.29', '1. 마음을 나누는 글', '단원 열기', '1/2', '10~13', ''], ['', '', '', '글쓴이의 마음 짐작하기', '2/2', '14~17', ''],
  ['수학 교육과정 연간지도계획'], ['주', '기간', '단원명', '학습 주제', '차시', '쪽수', '비고'], ['1', '8.24~8.29', '1. 곱셈', '단원 도입', '1/1', '8~9', '']];

const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const md = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
const J = JSON.stringify;
const ttTue = name => J({ periods: 6, cells: [[], [name], [], [], []] });
const doneLog = (name, n, skip = 0) => J(Object.fromEntries(Array.from({ length: n + skip }, (_, i) => [add('2026-03-03', 7 * i), { 1: { subject: name, status: i < n ? 'done' : 'skip' } }])));
const KO30 = '국어 교육과정 연간지도계획\n2026학년도 | 3학년 1반\n주 | 기간 | 단원명 | 학습 주제 | 차시 | 쪽수 | 비고\n'
  + Array.from({ length: 30 }, (_, i) => { const m = add('2026-03-02', 7 * i); return `${i + 1} | ${md(m)}~${md(add(m, 4))} | 단원 | 차시 ${i + 1} | ${i + 1}/30 | |`; }).join('\n');

await run('fix3-planclass', [
  ['[class-xlsx-1] 준비 › 시간표 파일에 엑셀(.xlsx), 진도표 파일에 CSV를 넣으면 우리 반 칸과 교과 고르기 창(빈 시간 자리도 그대로)', async () => {
    await fresh('2026-08-20T09:00:00', { 'ssam:years': J({ current: 2026 }), 'ssam:class:info': J({ grade: 3, room: 1 }) });
    await goProgress();
    await upload(`${C} [data-c="ttFile"]`, { name: '기초시간표.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx(TT) });
    await page.waitForFunction(() => ((JSON.parse(localStorage.getItem('ssam:class:timetable') || 'null') || { cells: [[]] }).cells[0][0]) === '국어');
    const tt = await stored('class:timetable');
    assert(tt.periods === 6 && tt.cells[1][1] === '' && tt.cells[1][4] === '창체' && tt.cells[3][5] === '창체' && tt.cells[4][4] === '도덕', J(tt.cells));
    assert(await page.inputValue(`${C} input[data-cell="3-6"]`) === '창체', '칸 ' + await page.inputValue(`${C} input[data-cell="3-6"]`));
    assert(!(await page.textContent(`${C} #clsTtMsg`)).includes('찾지 못했어요'), await page.textContent(`${C} #clsTtMsg`));
    await upload(`${C} [data-c="jindoFile"]`, { name: '진도표.csv', mimeType: 'text/csv', buffer: csv(JINDO) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert(await page.locator('#sheetRoot [data-jpick]').count() === 2, '교과 수 ' + await page.locator('#sheetRoot [data-jpick]').count());
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]').length === 2);
    const subs = await stored('class:subjects');
    assert(subs[0].name === '국어' && subs[0].lessons.length === 2 && subs[0].lessons[1].title === '글쓴이의 마음 짐작하기' && subs[0].lessons[1].from === '2026-08-24', J(subs[0].lessons));
  }],
  ['[class-append-3] 다 마친 날짜 없는 창체에 [진도표 고치기 › 줄 추가]로 2학기 12줄을 더해 저장하면 오늘 수업이 2학기 1, 실시 10', async () => {
    const lessons = Array.from({ length: 10 }, (_, i) => ({ week: null, period: '', from: '', unit: '', title: `1학기 ${i + 1}`, pages: '', memo: '' }));
    await fresh('2026-09-01T08:30:00', { 'ssam:years': J({ current: 2026 }), 'ssam:class:info': J({ grade: 3, room: 1 }), 'ssam:class:timetable': ttTue('창체'),
      'ssam:class:subjects': J([{ id: 'cc', name: '창체', start: '2026-03-02', offset: 0, total: null, lessons }]), 'ssam:class:log': doneLog('창체', 10) });
    await goProgress();
    await page.click(`${C} [data-c="editSub"][data-id="cc"]`);
    await page.waitForSelector('#sheetRoot #clsEdBody');
    for (let i = 0; i < 12; i++) {
      await page.click('#sheetRoot [data-c="addRow"]');
      await page.keyboard.insertText(`2학기 ${i + 1}`);
    }
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:subjects'))[0].lessons.length === 22);
    const s = (await stored('class:subjects'))[0];
    assert(!('since' in s) && s.lessons[10].title === '2학기 1', J({ since: s.since, l: s.lessons[10] }));
    const p = await progress();
    assert(p.actual === 10 && p.next === 11 && p.done === 10, J(p));
    const v = await todayText();
    assert(v.includes('2학기 1') && !v.includes('1학기 1'), v);
  }],
  ['[class-sem-fullyear-2] [진도표 고치기]에서 2학기 첫 줄 기간을 8.20~8.21로 당겨 저장해도 기준일·다음 차시·실시 시수 그대로', async () => {
    const lessons = Array.from({ length: 20 }, (_, i) => { const m = add('2026-08-24', 7 * i); return { week: i + 1, period: `${md(m)}~${md(add(m, 4))}`, from: m, unit: '단원', title: `2학기 ${i + 1}`, no: `${i + 1}/20`, pages: '', memo: '' }; });
    const log = JSON.parse(doneLog('국어', 18));
    for (let i = 0; i < 10; i++) log[add('2026-08-25', 7 * i)] = { 1: { subject: '국어', status: i < 6 ? 'done' : 'skip' } };
    await fresh('2026-11-02T08:30:00', { 'ssam:years': J({ current: 2026 }), 'ssam:class:info': J({ grade: 3, room: 1 }), 'ssam:class:timetable': ttTue('국어'),
      'ssam:class:subjects': J([{ id: 'ko', name: '국어', start: '2026-08-24', since: '2026-08-24', offset: 0, total: null, lessons }]), 'ssam:class:log': J(log) });
    await goProgress();
    let p = await progress();
    assert(p.next === 7 && p.done === 6, J(p));
    await page.click(`${C} [data-c="editSub"][data-id="ko"]`);
    await page.waitForSelector('#sheetRoot #clsEdBody');
    await page.fill('#sheetRoot input[data-l="0-period"]', '8.20~8.21');
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:subjects'))[0].lessons[0].from === '2026-08-20');
    p = await progress();
    assert(p.sub.since === '2026-08-24' && p.sub.offset === 0 && p.next === 7 && p.actual === 6 && p.done === 6, J({ ...p, sub: [p.sub.since, p.sub.offset] }));
    assert(await page.inputValue(`${C} input[data-next="ko"]`) === '7', '다음 차시 칸 ' + await page.inputValue(`${C} input[data-next="ko"]`));
  }],
  ['[class-readd-5] 국어를 지웠다가 같은 진도표 파일을 다시 넣으면 체크 기록대로 다음 차시 11, 실시 10', async () => {
    await fresh('2026-03-02T08:30:00', { 'ssam:years': J({ current: 2026 }), 'ssam:class:info': J({ grade: 3, room: 1 }), 'ssam:class:timetable': ttTue('국어') });
    await goProgress();
    const file = { name: '국어 진도표.txt', mimeType: 'text/plain', buffer: Buffer.from(KO30) };
    await upload(`${C} [data-c="jindoFile"]`, file);
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]').length === 1);
    const subs = await stored('class:subjects');
    // 15주 동안 완료 10·못함 5, 6월 15일
    await fresh('2026-06-15T08:30:00', { 'ssam:years': J({ current: 2026 }), 'ssam:class:info': J({ grade: 3, room: 1 }), 'ssam:class:timetable': ttTue('국어'),
      'ssam:class:subjects': J(subs), 'ssam:class:log': doneLog('국어', 10, 5) });
    await goProgress();
    let p = await progress();
    assert(p.next === 11 && p.done === 10 && p.expected === 15, J(p));
    await page.click(`${C} [data-c="delSub"]`);
    assert((await page.textContent('#sheetRoot')).includes('같은 이름으로 다시 넣으면 이어져요'), await page.textContent('#sheetRoot'));
    await page.click('#sheetRoot #clsDelOk');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]').length === 0);
    await upload(`${C} [data-c="jindoFile"]`, file);
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]').length === 1);
    p = await progress();
    assert(p.sub.offset === 0 && p.actual === 10 && p.done === 10 && p.next === 11 && p.diff === -5, J({ ...p, sub: p.sub.offset }));
  }],

  /* ---------- cp-focus-6 ---------- */
  ['[cp-focus-6] 지침 점검을 기다리며 1단계 급훈 칸에 치는 중 점검이 끝나도 초점·한글 조합·친 글이 그대로, 옆 단추 첫 누름이 먹힘', async () => {
    await fresh('2026-10-29T09:00:00', { 'ssam:class:info': J({ grade: 3, room: 2 }) });
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="class"]');
    await page.waitForSelector(`${CP} ol.steps`);
    await page.fill(`${CP} textarea[data-src="guide"]`, '기초학력 진단을 3월에 실시한다.');
    await page.click(`${CP} [data-c="next"]`); await page.waitForSelector(`${CP} #cpOutline`);
    await page.click(`${CP} [data-c="next"]`); await page.waitForSelector(`${CP} [data-c="draft"]`);
    const openGuide = hold('guide'), openDraft = hold('draft');
    await page.click(`${CP} [data-c="draft"]`);
    await page.waitForSelector(`${CP} .yp-card:has-text("올해 지침에서 꼭 넣을 항목을 찾고 있어요")`);
    await page.click(`${CP} ol.steps [data-step="1"]`);
    await page.click(`${CP} #cpMotto`);
    await page.keyboard.insertText('서로 돕는');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '우', selectionStart: 1, selectionEnd: 1 });
    openGuide();
    for (let i = 0; i < 50 && !prompts.some(p => p.startsWith('[학급운영계획 초안]')); i++) await page.waitForTimeout(100);
    assert(prompts.some(p => p.startsWith('[학급운영계획 초안]')), '초안 요청이 없음');
    await page.waitForTimeout(200);
    let a = await active();
    assert(a.id === 'cpMotto' && a.v === '서로 돕는우', J(a));
    await cdp.send('Input.insertText', { text: '우' });
    await cdp.detach();
    await page.keyboard.insertText('리 반');
    assert(await page.inputValue(`${CP} #cpMotto`) === '서로 돕는우리 반', await page.inputValue(`${CP} #cpMotto`));
    // 옆 단추([다음])를 사람처럼 눌러도 한 번에 2단계로
    await press(`${CP} [data-c="next"]`);
    await page.waitForSelector(`${CP} #cpOutline`, { timeout: 2000 });
    const p = await page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return m.getPlan(m.currentId()); });
    assert(p.motto === '서로 돕는우리 반', p.motto);
    // 초안이 끝난 뒤 3단계로 가면 쓴 초안이 보임
    openDraft();
    for (let i = 0; i < 50; i++) { const q = await page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return !!m.getPlan(m.currentId()).draft; }); if (q) break; await page.waitForTimeout(100); }
    await page.click(`${CP} ol.steps [data-step="3"]`);
    await page.waitForSelector(`${CP} #cpDraft textarea[data-sec]`);
    assert((await page.locator(`${CP} #cpDraft textarea[data-sec]`).first().inputValue()).includes('올해 학급에 맞게 운영한다'), '초안 칸');
  }],
  ['[cp-focus-6] 3단계에서 기다리면 지침 점검이 끝날 때 「초안을 쓰고 있어요」로 바뀌고, 초안이 끝나면 칸이 보임', async () => {
    await fresh('2026-10-29T09:00:00', { 'ssam:class:info': J({ grade: 3, room: 2 }) });
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="class"]');
    await page.waitForSelector(`${CP} ol.steps`);
    await page.fill(`${CP} textarea[data-src="guide"]`, '기초학력 진단을 3월에 실시한다.');
    await page.click(`${CP} [data-c="next"]`); await page.waitForSelector(`${CP} #cpOutline`);
    await page.click(`${CP} [data-c="next"]`); await page.waitForSelector(`${CP} [data-c="draft"]`);
    const openGuide = hold('guide'), openDraft = hold('draft');
    await page.click(`${CP} [data-c="draft"]`);
    await page.waitForSelector(`${CP} .yp-card:has-text("올해 지침에서 꼭 넣을 항목을 찾고 있어요")`);
    openGuide();
    await page.waitForSelector(`${CP} .yp-card:has-text("칸마다 올해 초안을 쓰고 있어요")`, { timeout: 4000 });
    openDraft();
    await page.waitForSelector(`${CP} #cpDraft textarea[data-sec]`, { timeout: 4000 });
  }],

  /* ---------- rp-focus-7 ---------- */
  ['[rp-focus-7] AI가 쓰는 동안 2번째 사진 설명을 치는 중 다 써도 초점·한글 조합·친 글(끝 띄어쓰기도)이 그대로, 빈 설명·공문은 새로 채움', async () => {
    await fresh('2026-04-22T09:00:00');
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="report"]');
    await page.waitForSelector(`${RP} #rpFile`, { state: 'attached' });
    await page.setInputFiles(`${RP} #rpFile`, [photo(1), photo(2)]);
    await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 2, RP);
    await page.fill(`${RP} #rpMemo`, '4월 21일 강당에서 전교생 참여.');
    const openR = hold('report');
    await page.click(`${RP} [data-rp="write"]`);
    await page.waitForSelector(`${RP} [data-rp="write"][disabled]`);
    await page.click(`${RP} [data-rp-cap="1"]`);
    await page.keyboard.insertText('발명품 발표 ');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '장', selectionStart: 1, selectionEnd: 1 });
    openR();
    await page.waitForSelector(`${RP} [data-rp="write"]:not([disabled])`);
    await page.waitForTimeout(200);
    const a = await active();
    assert(a.cap === '1' && a.v === '발명품 발표 장', J(a));
    await cdp.send('Input.insertText', { text: '장' });
    await cdp.detach();
    await page.keyboard.insertText('면');
    assert(await page.inputValue(`${RP} [data-rp-cap="1"]`) === '발명품 발표 장면', await page.inputValue(`${RP} [data-rp-cap="1"]`));
    // 다른 칸은 새로 그림: 빈 설명은 AI 것, 공문·보고서 칸, 단추 글
    assert(await page.inputValue(`${RP} [data-rp-cap="0"]`) === '모둠별 실험 장면', await page.inputValue(`${RP} [data-rp-cap="0"]`));
    assert((await page.inputValue(`${RP} #rpTitle`)).length > 0 && (await page.inputValue(`${RP} [data-rf="name"]`)) === `과학의 날 ${reportN}`, '공문·보고서 칸');
    assert((await page.textContent(`${RP} [data-rp="write"]`)).includes('다시 쓰기'), await page.textContent(`${RP} [data-rp="write"]`));
    const cur = await stored('report:cur');
    assert(cur.captions[1] === '발명품 발표 장면' && cur.captions[0] === '모둠별 실험 장면', J(cur.captions));
  }],
  ['[rp-focus-7] [다시 쓰기] 중 「한 일」에 이어 치면 다 써도 초점·친 글이 그대로, 옆 [다시 쓰기] 단추를 사람처럼 눌러도 첫 누름이 먹힘', async () => {
    const openR = hold('report');
    await page.click(`${RP} [data-rp="write"]`);
    await page.waitForSelector(`${RP} [data-rp="write"][disabled]`);
    await page.click(`${RP} #rpMemo`); await page.keyboard.press('End');
    await page.keyboard.insertText(' 발표 시간이 모자랐음.');
    const n0 = reportN;
    openR();
    await page.waitForSelector(`${RP} [data-rp="write"]:not([disabled])`);
    await page.waitForTimeout(150);
    let a = await active();
    assert(a.id === 'rpMemo' && a.v === '4월 21일 강당에서 전교생 참여. 발표 시간이 모자랐음.', J(a));
    await page.keyboard.insertText(' 다음엔 더 길게.');
    assert(await page.inputValue(`${RP} #rpMemo`) === '4월 21일 강당에서 전교생 참여. 발표 시간이 모자랐음. 다음엔 더 길게.', await page.inputValue(`${RP} #rpMemo`));
    assert(await page.inputValue(`${RP} [data-rf="name"]`) === `과학의 날 ${n0 + 1}`, '보고서 칸이 새로 쓴 것');
    const sent = prompts.length;
    await press(`${RP} [data-rp="write"]`);
    for (let i = 0; i < 30 && prompts.length === sent; i++) await page.waitForTimeout(100);
    assert(prompts.length === sent + 1, '첫 누름이 먹히지 않음');
    assert(prompts.at(-1).includes('다음엔 더 길게'), '메모가 프롬프트에 없음');
    await page.waitForSelector(`${RP} [data-rp="write"]:not([disabled])`);
  }],
  ['[rp-focus-7] [다시 쓰기] 중 AI가 새로 쓰는 칸(행사명)을 고치고 있었으면 새 글로 바뀌고 초점은 그 칸 끝에 남음', async () => {
    const openR = hold('report');
    await page.click(`${RP} [data-rp="write"]`);
    await page.waitForSelector(`${RP} [data-rp="write"][disabled]`);
    await page.click(`${RP} [data-rf="name"]`); await page.keyboard.press('End');
    await page.keyboard.insertText(' 고침');
    openR();
    await page.waitForSelector(`${RP} [data-rp="write"]:not([disabled])`);
    await page.waitForTimeout(150);
    const a = await active();
    assert(a.rf === 'name' && a.v === `과학의 날 ${reportN}`, J(a));
    await page.keyboard.insertText('!');
    assert(await page.inputValue(`${RP} [data-rf="name"]`) === `과학의 날 ${reportN}!`, await page.inputValue(`${RP} [data-rf="name"]`));
  }],
  ['[rp-focus-7] 사진을 읽는 동안 「한 일」에 치고 있었으면 다 읽어도 초점·한글 조합·친 글이 그대로, 사진 칸은 새로 보임', async () => {
    await page.click(`${RP} [data-rp="new"]`);
    await page.waitForSelector(`${RP} #rpPhotos:not(ul)`);
    // 사진 읽기를 1.5초 늦춤
    await page.evaluate(() => { const o = window.createImageBitmap; window.__cib = o; window.createImageBitmap = async (...a) => { await new Promise(r => setTimeout(r, 1500)); return o.apply(window, a); }; });
    try {
      await page.setInputFiles(`${RP} #rpFile`, [photo(1)]);
      await page.waitForSelector(`${RP} .rp-drop .spin`);
      await page.click(`${RP} #rpMemo`);
      await page.keyboard.insertText('사진 정리');
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: '중', selectionStart: 1, selectionEnd: 1 });
      await page.waitForFunction(s => document.querySelectorAll(`${s} [data-rp-cap]`).length === 1, RP, { timeout: 6000 });
      await page.waitForTimeout(150);
      const a = await active();
      assert(a.id === 'rpMemo' && a.v === '사진 정리중', J(a));
      await cdp.send('Input.insertText', { text: '중' });
      await cdp.detach();
      await page.keyboard.insertText('!');
      assert(await page.inputValue(`${RP} #rpMemo`) === '사진 정리중!', await page.inputValue(`${RP} #rpMemo`));
      assert(!(await page.$(`${RP} .rp-drop .spin`)), '읽는 중 표시가 남음');
      assert((await stored('report:cur')).memo === '사진 정리중!', (await stored('report:cur')).memo);
    } finally { await page.evaluate(() => { window.createImageBitmap = window.__cib; }); }
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
