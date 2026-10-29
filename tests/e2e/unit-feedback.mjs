// 단원평가 4단계 피드백: 잘한 점·격려(AI, 비운 학생만, 학생 답 글은 안 보냄), 고치기, 미리 보기, 결과지 한글 파일(한 쪽 2명),
// 번호별 복사·모두 복사, 인쇄, AI 도중 다른 평가로 가도 결과는 시작한 평가에, 좁은 화면
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
let slow = 0;
const prompts = [];
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow) await new Promise(r => setTimeout(r, slow));
  const nos = [...prompt.matchAll(/^- (\d+)번 \|/gm)].map(m => Number(m[1]));
  return JSON.stringify({ students: [...nos, 1].map(no => ({ no, good: `G${no}`, cheer: `C${no}` })) });
});
const V = 'section[data-menu="evaluate"] .unit-box';
const T = id => page.evaluate(id => JSON.parse(localStorage.getItem('ssam:unit:t:' + id)), id);
const clear = (id, nos) => page.evaluate(([id, nos]) => {
  const k = 'ssam:unit:t:' + id, x = JSON.parse(localStorage.getItem(k));
  x.students.forEach(s => { if (nos.includes(s.no)) { s.good = ''; s.cheer = ''; } });
  localStorage.setItem(k, JSON.stringify(x));
}, [id, nos]);
const open1 = async id => { await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]'); if (await page.locator(`${V} [data-un="back"]`).count()) await page.click(`${V} [data-un="back"]`); await page.click(`${V} [data-un-open="${id}"]`); };
const TITLE = '3학년 국어 2단원 중요한 내용을 적어요 (1회)';
await page.goto(url);
await page.waitForTimeout(400);
await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="unit"]');
await page.click(`${V} [data-un="sample"]`);
await clear('sample-1', [2, 5]);
await page.reload(); await page.waitForTimeout(500);
await open1('sample-1');

await run('unit-feedback', [
  ['마친 평가는 4단계(피드백)로 열림', async () => {
    assert((await page.textContent(`${V} .steps [aria-current="step"]`)).includes('피드백'), '4단계가 아님');
    assert(await page.locator(`${V} .un-fb`).count() === 6, '학생 6명');
  }],
  ['잘한 점·격려 쓰기: 비운 학생만 채움, 학생 답 글·이름은 안 보냄', async () => {
    const before = (await T('sample-1')).students[0].good;
    await page.click(`${V} [data-un="fbAI"]`);
    await page.waitForFunction(() => document.querySelector('textarea[data-fb="2-good"]') && document.querySelector('textarea[data-fb="2-good"]').value === 'G2');
    const p = prompts.at(-1);
    assert(p.startsWith('[단원평가 피드백]') && p.includes('- 2번 |') && p.includes('- 5번 |') && !p.includes('- 1번 |'), p.slice(0, 200));
    assert(!p.includes('도서관에서 잔치를 한다.'), '학생 답 글이 들어감');
    const s = (await T('sample-1')).students;
    assert(s[1].good === 'G2' && s[4].cheer === 'C5', '저장');
    assert(s[0].good === before, '이미 쓴 학생을 덮음');
  }],
  ['칸을 고치면 저장', async () => {
    await page.fill(`${V} textarea[data-fb="2-good"]`, 'G2 고침');
    await page.dispatchEvent(`${V} textarea[data-fb="2-good"]`, 'change');
    assert((await T('sample-1')).students[1].good === 'G2 고침', '저장 안 됨');
  }],
  ['미리 보기: 틀린 문항·내 답·정답·교과서 쪽', async () => {
    const card = await page.textContent(`${V} .un-fb[data-fbno="2"]`);
    assert(card.includes('3번') && card.includes('㉮') && card.includes('㉯') && card.includes('<국어> 70~75쪽'), card.slice(0, 200));
    assert(card.includes('부분 점수'), '부분 점수');
  }],
  ['다시 쓰기: 그 학생만', async () => {
    await page.click(`${V} [data-un="fbRedo"][data-no="3"]`);
    await page.waitForFunction(() => document.querySelector('textarea[data-fb="3-good"]').value === 'G3');
    const p = prompts.at(-1);
    assert(p.includes('- 3번 |') && !p.includes('- 2번 |'), '다른 학생도 보냄');
    assert((await T('sample-1')).students[1].good === 'G2 고침', '고친 칸이 덮임');
  }],
  ['결과지 한글 파일: 한 쪽에 2명, 이름 칸 없음', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-un="fbHwpx"]`)]);
    assert(dl.suggestedFilename() === `${TITLE} 결과지.hwpx`, dl.suggestedFilename());
    const sec = new TextDecoder().decode((await unzip(new Uint8Array(readFileSync(await dl.path())))).get('Contents/section0.xml'));
    assert(sec.includes('G2 고침') && sec.includes('2번'), '내용');
    assert((sec.match(/pageBreak="1"/g) || []).length === 2, '쪽 나누기 ' + (sec.match(/pageBreak="1"/g) || []).length);
    assert(!sec.includes('이름'), '이름 칸');
  }],
  ['복사: 그 번호 글, 모두 복사는 번호마다 나눔', async () => {
    await page.click(`${V} [data-un="fbCopy"][data-no="2"]`);
    await page.waitForTimeout(150);
    let txt = await page.evaluate(() => navigator.clipboard.readText());
    assert(txt.startsWith(`[${TITLE}] 2번 · 점수`) && txt.includes('잘한 점: G2 고침'), txt.slice(0, 120));
    await page.click(`${V} [data-un="fbCopyAll"]`);
    await page.waitForTimeout(150);
    txt = await page.evaluate(() => navigator.clipboard.readText());
    assert(txt.split('\n\n').length === 6 && txt.includes('] 6번'), txt.slice(0, 80));
  }],
  ['인쇄: window.print, 인쇄 틀에 6명', async () => {
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.click(`${V} [data-un="fbPrint"]`);
    assert(await page.evaluate(() => window.__printed) === 1, '인쇄 안 부름');
    assert(await page.locator(`${V} .un-print .un-ps`).count() === 6, '인쇄 틀');
  }],
  ['AI 도중 다른 평가로 가도 결과는 시작한 평가에', async () => {
    await clear('sample-1', [4]); await clear('sample-2', [4]);
    await open1('sample-1');
    slow = 900;
    await page.click(`${V} [data-un="fbAI"]`);
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un-open="sample-2"]`);
    await page.waitForTimeout(1300); slow = 0;
    assert((await T('sample-1')).students[3].good === 'G4', 'sample-1에 없음');
    assert((await T('sample-2')).students[3].good === '', 'sample-2에 들어감');
    assert(await page.inputValue(`${V} textarea[data-fb="4-good"]`) === '', '보는 평가 칸이 채워짐');
  }],
  ['좁은 화면(360px) 가로 스크롤 없음', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
