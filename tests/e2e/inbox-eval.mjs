// 떠 있는 버튼 › 평가: 정답지·합본 → 새 단원평가, 문제지 → 평가지 없는 단원평가, 답안 사진 → 단원평가 골라 채점, 단원평가가 없으면 평가지 채점, 교과 평가계획
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';
import { SAMPLE_ITEMS } from '../../web/menus/evaluate/unit/unit-sample.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[단원평가 채점]')) return JSON.stringify({ items: SAMPLE_ITEMS.map(it => ({ no: it.no, read: it.answer, points: it.points, sure: true, why: '' })) });
  return '{}';
});
const sheet = '#sheetRoot .sheet';
const pick = files => page.setInputFiles('#inboxFile', files);
const runCard = async () => { await page.waitForSelector(`${sheet} #ibRun:not([disabled])`); await page.click(`${sheet} #ibRun`); };
const tests = () => page.evaluate(async () => { const m = await import('./menus/evaluate/unit/unit-model.js'); return m.listTests().map(s => ({ ...s, t: m.getTest(s.id) })); });
await page.goto(url);
await page.waitForTimeout(300);
const S = await page.evaluate(async () => {
  const m = await import('./menus/evaluate/unit/unit-model.js'), s = await import('./menus/evaluate/unit/unit-sample.js');
  m.saveSet({ ...m.getSet(), pagesPer: 1, maskOn: false });
  const x = m.newTest({ meta: { ...s.SAMPLE_META, date: '2026-10-30' }, key: { domains: ['지식', '이해'], items: s.SAMPLE_ITEMS }, paper: { text: '' } });
  m.saveTest(x); return x.id;
});
await page.reload(); await page.waitForTimeout(400);
const shot = async (w, h) => ({ name: `답안${w}.png`, mimeType: 'image/png', buffer: await page.screenshot({ clip: { x: 0, y: 0, width: w, height: h } }) });

await run('inbox-eval', [
  ['정답·해설지 → 새 단원평가(단원평가 탭이 열리고 문항·배점 안내)', async () => {
    await pick(join(FIXTURES, 'unit-key-inline.txt'));
    await page.waitForSelector(sheet);
    assert((await page.textContent(sheet)).includes('단원평가 정답지'), await page.textContent(sheet));
    await runCard();
    await page.waitForFunction(() => (document.querySelector('.unit-box .un-sum') || {}).textContent?.includes('8문항 · 100점'));
    assert(await page.isVisible('#menuTabs [data-tab="unit"][aria-current="page"]'), '단원평가 탭');
    assert((await page.textContent('.unit-box #unKeyMsg')).includes('배점'), '배점 안내');
    assert((await tests()).some(x => x.subject === '도덕' && x.t.key.items.length === 8), '저장');
  }],
  ['합본 → 새 단원평가에 평가지도', async () => {
    await pick(join(FIXTURES, 'unit-combined.txt'));
    await runCard();
    await page.waitForFunction(() => (document.querySelector('.unit-box .un-sum') || {}).textContent?.includes('6문항 · 100점'));
    const sci = (await tests()).find(x => x.subject === '과학');
    assert(sci && sci.t.paper.text.includes('곤충') && !sci.t.paper.text.includes('정답 및 해설'), '평가지');
  }],
  ['문제지만 → 평가지가 없는 최근 단원평가(도덕)에', async () => {
    await pick(join(FIXTURES, 'unit-paper-inline.txt'));
    await page.waitForSelector(sheet);
    assert((await page.textContent(sheet)).includes('도덕'), '어느 평가에 넣는지 카드에 없음: ' + await page.textContent(sheet));
    await runCard();
    await page.waitForFunction(async () => {
      const m = await import('./menus/evaluate/unit/unit-model.js');
      const s = m.listTests().find(x => x.subject === '도덕');
      return s && m.getTest(s.id).paper.text.includes('약속');
    });
    assert((await tests()).filter(x => x.subject === '도덕').length === 1, '새 평가를 또 만듦');
  }],
  ['답안 사진 2장 → 정답지 넣은 단원평가 고르기(최근 것이 먼저) → 답안 넣고 채점 시작', async () => {
    const n0 = prompts.filter(p => p.startsWith('[단원평가 채점]')).length;
    await pick([await shot(300, 420), await shot(310, 430)]);
    await page.waitForSelector(`${sheet} [data-ib-field="test"]`);
    assert((await page.textContent(sheet)).includes('학생 답안 스캔'), '종류');
    assert(await page.inputValue(`${sheet} [data-ib-field="test"]`) === S, '최근 평가가 먼저가 아님');
    await runCard();
    await page.waitForFunction(id => { const t = JSON.parse(localStorage.getItem('ssam:unit:t:' + id) || 'null'); return t && t.students.length === 2 && t.students.every(s => s.status === 'done'); }, S, { timeout: 10000 });
    assert(prompts.filter(p => p.startsWith('[단원평가 채점]')).length - n0 === 2, '채점 요청 수');
  }],
  ['교과 평가계획 → 교과 평어에 계획이 바뀜(카드에 바뀐다고 적음)', async () => {
    await pick(join(FIXTURES, 'eval-plan.txt'));
    await page.waitForSelector(sheet);
    assert((await page.textContent(sheet)).includes('교과 평가계획') && (await page.textContent(sheet)).includes('바꿔요'), await page.textContent(sheet));
    await runCard();
    await page.waitForFunction(() => (document.querySelector('#toast') || {}).textContent?.includes('평가요소 2개'));
    assert(await page.isVisible('#menuTabs [data-tab="pyeongeo"][aria-current="page"]'), '교과 평어 탭');
  }],
  ['정답지 넣은 단원평가가 없으면 답안 사진은 평가지 채점으로, 평가지 채점이 채점 중이면 안내만', async () => {
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('ssam:unit:')) localStorage.removeItem(k); });
    await page.reload(); await page.waitForTimeout(400);
    await pick([await shot(300, 420)]);
    await page.waitForSelector(sheet);
    assert((await page.textContent(sheet)).includes('평가지 채점') && await page.locator(`${sheet} [data-ib-field="test"]`).count() === 0, await page.textContent(sheet));
    await runCard();
    await page.waitForFunction(() => (document.querySelector('#toast') || {}).textContent?.includes('쪽을 올렸어요'));
    assert(await page.isVisible('#menuTabs [data-tab="gr"][aria-current="page"]'), '평가지 채점 탭');
    await page.evaluate(() => { window.SSAM.inbox.grBusy = () => true; });
    await pick([await shot(320, 440)]);
    await runCard();
    await page.waitForFunction(() => (document.querySelector('#toast') || {}).textContent?.includes('채점하는 중'));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
