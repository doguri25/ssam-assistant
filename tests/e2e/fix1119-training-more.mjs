// 연수 수합 더하기(2026-11-19 「더 구현할 방법이 있다면 추가해 줘」): 쪽지 작성의 연수 안내 → [연수 현황판에 넣기], 사람별 미제출 복사, 구글 폼 만들기 안내,
// 「쌤」 버튼에 ZIP(이수증 묶음) → 연수 현황판에서 풀어 맞춤. 예시 이름은 지어낸 것
import { open, run, assert, mockClaude, enter } from './helpers.mjs';
import { zipStore } from '../../web/core/zip.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));
await page.addInitScript(() => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })); });
await mockClaude(page, async ({ prompt }) => {
  if (prompt.includes('[쪽지 안내]')) return JSON.stringify({ kind: 'training', title: '청렴교육 이수 안내', when: [], place: '', target: '전 교직원', apply: { due: '2026-11-28', how: '이수증 메신저 제출' }, bring: '', notes: '', points: [] });
  return '{}';
});
page.on('dialog', d => d.accept());
const V = 'section[data-menu="training"]', sheet = '#sheetRoot .sheet';
const board = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:training:board') || 'null'));
const clip = () => page.evaluate(() => navigator.clipboard.readText());
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => localStorage.setItem('ssam:training:board', JSON.stringify({
  staff: [{ id: 'a', name: '김하늘', dept: '3학년' }, { id: 'b', name: '이바다', dept: '보건교사' }, { id: 'c', name: '한가람', dept: '행정실' }],
  courses: [{ id: 'c1', title: '성희롱·성폭력 예방교육', due: '2026-11-27' }], marks: { c1: { a: { s: 'ok' }, b: { s: 'back', note: '흐림' } } } })));

await run('fix1119-training-more', [
  ['쪽지 작성: 연수 안내 쪽지 → [연수 현황판에 넣기](기한도)', async () => {
    await enter(page, 'etc', 'message');
    await page.fill('#msgPaste', '청렴교육 이수 안내\n전 교직원은 11월 28일까지 이수 후 이수증을 메신저로 제출해 주세요.');
    await page.click('section[data-menu="etc"] [data-msg="read"]');
    await page.waitForSelector('#msgTrain [data-msg="train"]');
    await page.click('#msgTrain [data-msg="train"]');
    await page.waitForSelector(`${V} .tr-page`);
    const c = (await board()).courses.find(x => x.title === '청렴교육');
    assert(c && c.due === '2026-11-28' && /^message:/.test(c.from), JSON.stringify((await board()).courses));
  }],
  ['사람별 미제출 복사(반려 사유·기한)', async () => {
    await page.click(`${V} [data-tr="personal"]`);
    await page.waitForTimeout(150);
    const lines = (await clip()).split('\n');
    assert(lines[0] === '김하늘 선생님(3학년): 청렴교육(11. 28.까지)' && lines[1] === '이바다 선생님(보건교사): 성희롱·성폭력 예방교육(반려 — 흐림), 청렴교육(11. 28.까지)', lines.join('\n'));
  }],
  ['구글 폼 만들기 안내(연수 이름 그대로)', async () => {
    await page.click(`${V} [data-tr="formGuide"]`);
    const g = await page.inputValue('#trFormGuideText');
    assert(g.includes('연수 (객관식, 필수): 성희롱·성폭력 예방교육 / 청렴교육') && g.includes('구글 폼 응답 넣기'), g);
    await page.click('#trFormGuideCopy');
    await page.click('#trFormGuide [data-close]');
  }],
  ['「쌤」 버튼에 ZIP: 이수증 묶음이면 연수 현황판에서 풀어 맞춤', async () => {
    const zip = zipStore([{ name: '이수증(파일 응답)/청렴 이수증 - 한가람.jpg', data: new Uint8Array([255, 216]) }, { name: '이수증(파일 응답)/청렴 - 이바다.jpg', data: new Uint8Array([255, 217]) }]);
    await page.setInputFiles('#inboxFile', [{ name: 'drive-download.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) }]);
    await page.waitForSelector(`${sheet} #ibRun:not([disabled])`);
    assert((await page.textContent(sheet)).includes('연수 이수증'), await page.textContent(sheet));
    await page.click(`${sheet} #ibRun`);
    await page.waitForFunction(() => { const b = JSON.parse(localStorage.getItem('ssam:training:board')); const c = b.courses.find(x => x.title === '청렴교육'); return c && b.marks[c.id] && b.marks[c.id].c && b.marks[c.id].b; });
    const b = await board(), c = b.courses.find(x => x.title === '청렴교육');
    assert(b.marks[c.id].c.s === 'sent' && !b.marks[c.id].c.kept && b.marks[c.id].b.file === '청렴 - 이바다.jpg', JSON.stringify(b.marks[c.id]));
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav')));
    assert(n.menu === 'training' && n.tab === 'board', JSON.stringify(n));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
