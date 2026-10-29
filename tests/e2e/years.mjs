// 설정 › 학년도: 옆 메뉴 표시, 백업 파일(AI 키 없음), 새 학년도 시작, 지난 학년도로 돌아가기, 보관 지우기, 백업 불러오기, 저장 멈춤
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { open, run, assert } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
const S = 'section[data-menu="settings"]';
const tmp = mkdtempSync(join(tmpdir(), 'years-'));
const ENGINE = JSON.stringify({ engine: 'claude', keys: { claude: 'sk-secret-123' }, remember: true });
await page.addInitScript(e => { if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', e); }, ENGINE);
const ls = k => page.evaluate(k => localStorage.getItem('ssam:' + k), k);
const yearsTab = async () => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]'); await page.waitForSelector(`${S} [data-yr]`); };
const reloadAfter = async sel => { await Promise.all([page.waitForEvent('load'), page.click(sel)]); await page.waitForTimeout(500); };
let backupPath = '', subjects = '';
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(async () => {
  const s = await import('./menus/class/class-sample.js'), c = await import('./menus/class/class-model.js'), y = await import('./menus/plan/year-model.js');
  const d = s.sampleData('2026-10-29'); c.setInfo(d.info); c.setTimetable(d.timetable); c.setSubjects(d.subjects);
  y.savePlan({ ...y.newPlan(), name: '독서 교육' });
  localStorage.setItem('ssam:hk', JSON.stringify({ settings: {}, students: [{ id: 'a', no: 1, label: '', memo: '메모', done: 0, results: [] }] }));
});
await page.reload(); await page.waitForTimeout(500);
subjects = await ls('class:subjects');

await run('years', [
  ['옆 메뉴에 「2026학년도」, 처음 연 날의 학년도를 저장, 누르면 설정 › 학년도', async () => {
    assert((await page.textContent('#sideYear')).includes('2026학년도'), await page.textContent('#sideYear'));
    assert(JSON.parse(await ls('years')).current === 2026, '학년도를 저장하지 않음');
    await page.click('#sideYear');
    await page.waitForSelector(`${S} [data-yr="2026"]`);
    assert(await page.getAttribute('#menuTabs [data-tab="years"]', 'aria-current') === 'page', '탭');
  }],
  ['백업 파일: 학년도 자료는 있고 AI 키는 없음', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${S} [data-set="backup"]`)]);
    assert(/^쌤비서 백업 2026-10-29\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const text = readFileSync(await dl.path(), 'utf8');
    const b = JSON.parse(text);
    assert(b.app === 'ssam' && b.current === 2026 && b.years['2026']['class:subjects'] && b.years['2026'].yearplans && b.years['2026'].hk, Object.keys(b.years['2026']).join(','));
    assert(!text.includes('sk-secret-123') && !('engine' in b.years['2026']), 'AI 키가 들어감');
    backupPath = join(tmp, 'backup.json'); writeFileSync(backupPath, text);
  }],
  ['평가 메뉴도 저장 멈춤을 따름', async () => {
    const before = await ls('hk');
    await page.evaluate(() => window.SSAM.freeze(true));
    await page.click('nav.app-side [data-menu-go="evaluate"]'); await page.click('#menuTabs [data-tab="hk"]');
    await page.waitForTimeout(300);
    await page.waitForSelector('#hkMemo');
    await page.fill('#hkMemo', '멈춘 동안 쓴 메모');
    await page.waitForTimeout(900);
    assert(await ls('hk') === before, '멈춘 동안 저장됨');
    await page.evaluate(() => window.SSAM.freeze(false));
  }],
  ['새 학년도 시작: 학급·평가는 비고, 연간계획·AI 키는 그대로', async () => {
    await yearsTab();
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrNewOk');
    const txt = await page.textContent('#sheetRoot .sheet');
    assert(txt.includes('2027학년도') && txt.includes('연간계획') && txt.includes('보관함'), txt.slice(0, 120));
    await reloadAfter('#sheetRoot #yrNewOk');
    assert((await page.textContent('#sideYear')).includes('2027학년도'), '옆 메뉴');
    const hk = JSON.parse(await ls('hk') || '{"students":[]}');
    assert(await ls('class:subjects') === null && hk.students.length === 0, '안 비워짐');
    assert((await ls('yearplans')).includes('독서 교육'), '연간계획이 없음');
    assert(await ls('engine') === ENGINE, 'AI 키가 바뀜');
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="year"]');
    assert((await page.textContent('section[data-menu="plan"] #ypList')).includes('독서 교육'), '연간계획 목록');
  }],
  ['2026학년도로 돌아가기: 학급·평가 자료가 돌아옴', async () => {
    await yearsTab();
    assert(await page.locator(`${S} [data-yr="2026"] [data-set="goYear"]`).count() === 1, '목록에 2026');
    await page.click(`${S} [data-yr="2026"] [data-set="goYear"]`);
    await page.waitForSelector('#sheetRoot #yrGoOk');
    await reloadAfter('#sheetRoot #yrGoOk');
    assert((await page.textContent('#sideYear')).includes('2026학년도'), '옆 메뉴');
    assert(await ls('class:subjects') === subjects, '학급 자료');
    assert((await ls('hk')).includes('메모'), '행특');
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    assert(await page.locator('section[data-menu="class"] .cls-sum tbody tr').count() === 4, '학급 요약');
  }],
  ['보관한 2027학년도 지우기', async () => {
    await yearsTab();
    await page.click(`${S} [data-yr="2027"] [data-set="delYear"]`);
    await page.waitForSelector('#sheetRoot #yrDelOk');
    assert((await page.textContent('#sheetRoot .sheet')).includes('백업 파일'), '백업 안내');
    await page.click('#sheetRoot #yrDelOk');
    await page.waitForFunction(() => !document.querySelector('[data-yr="2027"]'));
  }],
  ['백업 파일 불러오기: 지금 학년도를 파일 내용으로', async () => {
    await page.evaluate(() => localStorage.removeItem('ssam:class:subjects'));
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${S} [data-set="restore"]`)]);
    await fc.setFiles(backupPath);
    await page.waitForSelector('#sheetRoot input[data-ry="2026"]');
    assert(!(await page.isChecked('#sheetRoot input[data-ry="2026"]')), '지금 학년도가 미리 체크됨');
    await page.check('#sheetRoot input[data-ry="2026"]');
    await reloadAfter('#sheetRoot #yrRestoreOk');
    assert(await ls('class:subjects') === subjects, '돌아오지 않음');
    assert(await ls('engine') === ENGINE, 'AI 키가 바뀜');
  }],
  ['다른 탭이 학년도를 옮기면 이 탭도 다시 열려 지난 자료를 새 학년도에 쓰지 않음', async () => {
    const other = await t.ctx.newPage();
    await other.goto(url); await other.waitForTimeout(500);
    await other.click('nav.app-side [data-menu-go="evaluate"]'); await other.click('#menuTabs [data-tab="hk"]');
    await other.waitForSelector('#hkMemo');
    await yearsTab();
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrNewOk');
    await Promise.all([other.waitForEvent('load'), page.waitForEvent('load'), page.click('#sheetRoot #yrNewOk')]);
    await other.waitForTimeout(500);
    assert((await other.textContent('#sideYear')).includes('2027학년도'), '다른 탭이 2026에 머묾');
    if (await other.locator('#hkMemo').count()) { await other.fill('#hkMemo', '지난 학년도 메모'); await other.waitForTimeout(900); }
    assert(await ls('hk') === null || !(await ls('hk')).includes('지난 학년도 메모'), '지난 자료가 섞임: ' + await ls('hk'));
    await other.close();
    await yearsTab();
    await page.click(`${S} [data-yr="2026"] [data-set="goYear"]`);
    await page.waitForSelector('#sheetRoot #yrGoOk');
    await reloadAfter('#sheetRoot #yrGoOk');
  }],
  ['보관함에 있는 학년도는 새로 시작하지 않고 그 학년도로 감', async () => {
    await yearsTab();
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrGoOk');
    assert((await page.textContent('#sheetRoot .sheet')).includes('2027학년도 자료가 이미 있어요'), await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-close]');
  }],
  ['다른 JSON은 쌤비서 백업이 아님', async () => {
    await yearsTab();
    const f = join(tmp, 'other.json'); writeFileSync(f, '{"hello":1}');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${S} [data-set="restore"]`)]);
    await fc.setFiles(f);
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('쌤비서 백업 파일이 아니에요'));
  }],
  ['학교 정보는 「계획 학년도」', async () => {
    await page.click('#menuTabs [data-tab="school"]');
    assert((await page.textContent(S)).includes('계획 학년도'), '이름');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
