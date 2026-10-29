// 계획 › 학급운영계획: 1 자료 넣기 → 2 목차 → 3 초안 → 4 첨부·내보내기
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
let slow = 0;
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (prompt.startsWith('[학급운영계획 지침]')) {
    const id = (/^(\S+): 교과 평가 계획$/m.exec(prompt) || /^(\S+): /m.exec(prompt.split('계획서 칸')[1]))[1];
    return JSON.stringify([{ item: '기초학력 진단', keywords: ['기초학력', '진단'], sentence: '3월에 기초학력 진단을 실시한다.', section: id }]);
  }
  if (prompt.startsWith('[학급운영계획 초안]')) {
    const secs = [...prompt.matchAll(/^ {2}- \[(\S+)\] ([^(\n]+)/gm)].map(m => [m[1], m[2].trim()]);
    return JSON.stringify({ sections: Object.fromEntries(secs.map(([id, t]) => [id, `${t}을(를) 올해 학급에 맞게 운영한다.`])), monthly: [{ month: 3, text: '학급 세우기' }, { month: 4, text: '학부모 상담' }] });
  }
  if (prompt.startsWith('[평가계획 읽기]')) return JSON.stringify({ rows: [{ subject: '국어', unit: '읽기', standard: '[4국02-01] 중심 생각 찾기', method: '서술형', when: '4월' }, { subject: '수학', unit: '곱셈', standard: '[4수01-03]', method: '지필', when: '5월' }] });
  return '{}';
});
const V = 'section[data-menu="plan"] .cp-box';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="class"]'); };
const cur = () => page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return m.getPlan(m.currentId()); });
const upload = async (sel, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(files); };
await page.goto(url);
await page.waitForTimeout(300);
await page.evaluate(() => localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 })));
await page.reload(); await page.waitForTimeout(400);
await go();

await run('class-plan', [
  ['탭과 단계 4개, 학급 메뉴의 학년·반과 계획 학년도를 미리 채움', async () => {
    await page.waitForSelector(`${V} ol.steps`);
    const steps = await page.locator(`${V} ol.steps li`).allInnerTexts();
    assert(steps.length === 4 && steps[1].includes('목차') && steps[3].includes('첨부'), steps.join('|'));
    assert(await page.inputValue(`${V} #cpGrade`) === '3' && await page.inputValue(`${V} #cpRoom`) === '2' && await page.inputValue(`${V} #cpYear`) === '2027', '학급 정보');
  }],
  ['작년 계획서 파일을 넣으면 이름·전화번호 줄을 빼고 넣고 알려 줌', async () => {
    await page.fill(`${V} #cpBoys`, '13'); await page.fill(`${V} #cpGirls`, '12');
    await upload(`${V} [data-file="lastPlan"]`, join(FIXTURES, 'classplan-last.txt'));
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastPlan"]`) || {}).value?.includes('학급 실태'), V);
    const v = await page.inputValue(`${V} textarea[data-src="lastPlan"]`);
    assert(!v.includes('김가람') && !v.includes('010-2345'), '이름·전화가 남음');
    assert((await page.textContent('#toast')).includes('이름·전화번호가 적힌 줄 2개'), await page.textContent('#toast'));
    const p = await cur();
    assert(p.boys === 13 && p.girls === 12 && p.sourceNames.lastPlan[0] === 'classplan-last.txt', JSON.stringify([p.boys, p.girls, p.sourceNames]));
  }],
  ['2단계 목차: 작년 계획서 목차 그대로, 시수표·평가 표 칸 표시', async () => {
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert(await page.locator(`${V} #cpOutline li`).count() === 13, '칸 수 ' + await page.locator(`${V} #cpOutline li`).count());
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('작년 계획서 목차 그대로'), await page.textContent(`${V} #cpOutlineNote`));
    const hours = page.locator(`${V} #cpOutline li:has(input[value="편제 및 시간 배당"])`);
    assert((await hours.textContent()).includes('시수표'), '시수표 표시');
  }],
  ['목차 고치기: 이름 바꾸기·빼기·더하기·위로 옮기기가 저장됨', async () => {
    const first = page.locator(`${V} #cpOutline li`).nth(1).locator('input[data-ot]');
    await first.fill('학급 실태와 특성'); await first.dispatchEvent('change');
    await page.locator(`${V} #cpOutline li`).nth(2).locator('[data-odel]').click();
    await page.click(`${V} [data-c="oAdd"]`);
    const last = page.locator(`${V} #cpOutline li`).last();
    await last.locator('input[data-ot]').fill('학급 안전 지도'); await last.locator('input[data-ot]').dispatchEvent('change');
    await last.locator('[data-oup]').click();
    await page.waitForTimeout(150);
    const o = (await cur()).outline;
    assert(o[1].title === '학급 실태와 특성' && !o.some(x => x.title === '학급 조직') && o.at(-2).title === '학급 안전 지도' && o.length === 13, JSON.stringify(o.map(x => x.title)));
  }],
  ['작년 계획서가 없는 새 계획은 표준 목차로 시작', async () => {
    await page.click(`${V} [data-c="new"]`);
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('표준 목차'), await page.textContent(`${V} #cpOutlineNote`));
    const n = await page.locator(`${V} #cpOutline li`).count();
    const std = await page.evaluate(async () => (await import('./menus/plan/classplan-model.js')).STANDARD.length);
    assert(n === std, `${n} / ${std}`);
  }],
  ['3단계 초안: 지침이 있으면 지침 항목 → 초안 차례로 부르고, 칸마다 글', async () => {
    const A = await page.evaluate(async () => (await import('./menus/plan/classplan-model.js')).listPlans().find(p => p.sourceNames.lastPlan.length).id);
    await page.click(`${V} [data-cp="${A}"]`);
    await page.click(`${V} ol.steps [data-step="1"]`);
    await page.fill(`${V} textarea[data-src="guide"]`, '기초학력 진단을 3월에 실시한다.');
    await page.click(`${V} [data-c="next"]`); await page.click(`${V} [data-c="next"]`);
    const n0 = prompts.length;
    await page.click(`${V} [data-c="draft"]`);
    await page.waitForSelector(`${V} textarea[data-sec]`, { timeout: 8000 });
    const ps = prompts.slice(n0);
    assert(ps.length === 2 && ps[0].startsWith('[학급운영계획 지침]') && ps[1].startsWith('[학급운영계획 초안]'), ps.map(x => x.slice(0, 12)).join(','));
    assert(ps[1].includes('남 13명, 여 12명') && ps[1].includes('3월에 기초학력 진단을 실시한다.') && !ps[1].includes('김가람'), ps[1].slice(0, 300));
    const leaves = await page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return m.leaves(m.getPlan(m.currentId()).outline).length; });
    assert(await page.locator(`${V} textarea[data-sec]`).count() === leaves, '칸 수');
    assert((await page.textContent(`${V} #cpOverlap`)).includes('%'), '겹침');
  }],
  ['지침 점검: 빠짐 → [넣기]로 그 칸에 넣으면 반영됨', async () => {
    assert((await page.textContent(`${V} #cpGuide`)).includes('빠짐'), await page.textContent(`${V} #cpGuide`));
    await page.click(`${V} [data-insert="0"]`);
    assert((await page.textContent(`${V} #cpGuide`)).includes('반영됨'), '반영됨');
    const p = await cur();
    assert(Object.values(p.draft).some(t => t.includes('3월에 기초학력 진단을 실시한다.')), '초안에 없음');
  }],
  ['칸을 고치면 저장, 월별 칸을 더하면 월별 표가 나오고 고침', async () => {
    await page.click(`${V} ol.steps [data-step="2"]`);
    await page.click(`${V} [data-c="oAdd"]`);
    const add = page.locator(`${V} #cpOutline li`).last().locator('input[data-ot]');
    await add.fill('월별 운영 계획'); await add.dispatchEvent('change');
    assert((await page.locator(`${V} #cpOutline li`).last().textContent()).includes('월별 표'), '월별 표 표시');
    await page.click(`${V} ol.steps [data-step="3"]`);
    const ta = page.locator(`${V} textarea[data-sec]`).first();
    await ta.fill('고친 학급 실태 글이다.');
    const m = page.locator(`${V} input[data-mon="0"]`);
    await m.fill('학급 세우기와 규칙 정하기');
    await page.waitForTimeout(600);
    const p = await cur();
    assert(Object.values(p.draft).includes('고친 학급 실태 글이다.') && p.monthly[0].text === '학급 세우기와 규칙 정하기', JSON.stringify(p.monthly));
  }],
  ['초안을 쓰는 동안 다른 계획으로 가도 결과는 시작한 계획에', async () => {
    const A = (await cur()).id;
    const B = await page.evaluate(async a => (await import('./menus/plan/classplan-model.js')).listPlans().find(p => p.id !== a).id, A);
    slow = 1200;
    await page.click(`${V} [data-c="draft"]`);
    await page.click(`${V} [data-cp="${B}"]`);
    await page.waitForTimeout(1800); slow = 0;
    const r = await page.evaluate(async ([a, b]) => { const m = await import('./menus/plan/classplan-model.js'); return [m.getPlan(a).draft, m.getPlan(b).draft]; }, [A, B]);
    assert(r[0] && Object.keys(r[0]).length > 0 && !r[1], JSON.stringify(r).slice(0, 200));
    await page.click(`${V} [data-cp="${A}"]`);
  }],
  ['AI를 정하지 않았으면 초안을 부르지 않고 안내', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: {}, remember: true })));
    await page.reload(); await page.waitForTimeout(400); await go();
    const s3 = page.locator(`${V} ol.steps [data-step="3"]`);
    if (await s3.count()) await s3.click();
    const n = prompts.length;
    await page.click(`${V} [data-c="draft"]`);
    await page.waitForSelector(`${V} .banner.err`);
    assert((await page.textContent(`${V} .banner.err`)).includes('AI를 먼저 정해'), await page.textContent(`${V} .banner.err`));
    assert(prompts.length === n, 'AI를 부름');
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
    await page.reload(); await page.waitForTimeout(400); await go();
  }],
  ['첨부파일 넣기: 진도표는 종류를 짐작하고 교과별 시수를 읽음(창체 영역별 표는 빼고)', async () => {
    await page.click(`${V} ol.steps [data-step="1"]`);
    await upload(`${V} [data-file="attach"]`, join(FIXTURES, 'jindo-sample.txt'));
    await page.waitForSelector(`${V} #cpAttach li[data-att]`);
    const li = page.locator(`${V} #cpAttach li[data-att]`).first();
    assert(await li.locator('select[data-akind]').inputValue() === 'jindo', '종류');
    assert((await li.textContent()).includes('교과 3개 · 23시간'), await li.textContent());
    const a = (await cur()).attach[0];
    assert(a.kind === 'jindo' && JSON.stringify(a.summary.subjects) === JSON.stringify([{ name: '국어', hours: 12 }, { name: '수학', hours: 8 }, { name: '창체', hours: 3 }]), JSON.stringify(a));
  }],
  ['4단계 시수표, [학급 › 진도표·시수에도 넣기]로 학급 메뉴 교과에 넣음', async () => {
    await page.click(`${V} ol.steps [data-step="3"]`); await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpHours`);
    const rows = await page.locator(`${V} #cpHours tbody tr`).allInnerTexts();
    assert(rows.length === 4 && rows[0].includes('국어') && rows[0].includes('12') && rows[3].includes('합계') && rows[3].includes('23'), rows.join('|'));
    await page.click(`${V} [data-toclass]`);
    await page.waitForSelector('#sheetRoot [data-cpj]');
    assert(await page.locator('#sheetRoot [data-cpj]').count() === 4 && !(await page.locator('#sheetRoot [data-cpj]').nth(3).isChecked()), '고르기');
    await page.click('#sheetRoot [data-cpok]');
    const subs = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]'));
    assert(subs.map(x => x.name).join() === '국어,수학,창체' && subs[0].lessons.length === 12 && subs[0].total === 12, JSON.stringify(subs.map(x => [x.name, x.lessons.length])));
  }],
  ['연간지도계획 표가 없는 진도표는 시수 대신 안내, 학급 메뉴로 넣기 없음 · 종류 바꾸기 · 빼기', async () => {
    await upload(`${V} [data-file="attach"]`, { name: '진도표-음악.txt', mimeType: 'text/plain', buffer: Buffer.from('음악 진도 메모\n3월 노래 부르기\n') });
    await page.waitForFunction(s => document.querySelectorAll(`${s} #cpAttach li[data-att]`).length === 2, V);
    const li = () => page.locator(`${V} #cpAttach li[data-att]`).nth(1);
    assert((await li().textContent()).includes('연간지도계획 표를 찾지 못했어요'), await li().textContent());
    assert(await page.locator(`${V} [data-toclass]`).count() === 1, '버튼 수');
    await li().locator('select[data-akind]').selectOption('other');
    await page.waitForTimeout(100);
    assert((await cur()).attach[1].kind === 'other' && !(await li().textContent()).includes('찾지 못했어요'), '종류 바꾸기');
    await li().locator('[data-adel]').click();
    assert((await cur()).attach.length === 1 && await page.locator(`${V} #cpAttach li[data-att]`).count() === 1, '빼기');
  }],
  ['평가계획 첨부 → AI로 평가 표(이름 줄은 저장·전송 안 함), 칸 고치기·줄 빼기', async () => {
    const txt = '2027학년도 3학년 평가계획\n평가 담당 | 김가람 | 이나래 | 박다솜\n교과 | 영역 | 성취기준 | 평가 방법 | 시기\n국어 | 읽기 | [4국02-01] 중심 생각 찾기 | 서술형 | 4월\n';
    await upload(`${V} [data-file="attach"]`, { name: '3학년 평가계획.txt', mimeType: 'text/plain', buffer: Buffer.from(txt) });
    await page.waitForFunction(s => document.querySelectorAll(`${s} #cpAttach li[data-att]`).length === 2, V);
    assert(await page.locator(`${V} #cpAttach li[data-att]`).nth(1).locator('select[data-akind]').inputValue() === 'eval', '종류');
    const at = (await cur()).attach[1];
    assert(at.text.includes('[4국02-01]') && !at.text.includes('김가람'), at.text);
    const n0 = prompts.length;
    await page.click(`${V} [data-c="evalRead"]`);
    await page.waitForSelector(`${V} #cpEval tbody tr input`);
    const ps = prompts.slice(n0);
    assert(ps.length === 1 && ps[0].startsWith('[평가계획 읽기]') && ps[0].includes('[4국02-01]') && !ps[0].includes('김가람'), ps.map(x => x.slice(0, 40)).join(','));
    assert(await page.locator(`${V} #cpEval tbody tr`).count() === 2, '줄 수');
    await page.fill(`${V} #cpEval input[data-ev="1"][data-ek="method"]`, '관찰');
    await page.waitForTimeout(600);
    assert((await cur()).evalRows[1].method === '관찰', JSON.stringify((await cur()).evalRows));
    await page.click(`${V} #cpEval [data-evdel="0"]`);
    const r = (await cur()).evalRows;
    assert(r.length === 1 && r[0].subject === '수학' && r[0].method === '관찰', JSON.stringify(r));
  }],
  ['한글 파일: 제목, 시수표·평가 표, 끝에 붙임 목록', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-c="hwpx"]`)]);
    assert(dl.suggestedFilename() === '2027학년도 3학년 2반 학급 교육과정 운영 계획.hwpx', dl.suggestedFilename());
    const b64 = readFileSync(await dl.path()).toString('base64');
    const txt = await page.evaluate(async b => {
      const { readText } = await import('./core/files.js');
      return readText(new File([Uint8Array.from(atob(b), c => c.charCodeAt(0))], 'x.hwpx'));
    }, b64);
    assert(txt.includes('2027학년도 3학년 2반 학급 교육과정 운영 계획') && /국어\s*\|\s*12/.test(txt) && txt.includes('관찰'), txt.slice(0, 300));
    assert(txt.includes('1. 진도표(jindo-sample.txt) 1부.') && txt.includes('2. 평가계획(3학년 평가계획.txt) 1부.'), txt.slice(-300));
  }],
  ['확정하면 「확정」, 새 계획에서 지난 학급운영계획을 작년 계획서로 불러오면 목차가 그대로', async () => {
    await page.click(`${V} [data-c="final"]`);
    assert((await page.textContent(`${V} #cpList [aria-current="true"]`)).includes('확정'), '확정 표시');
    const A = await cur();
    assert(A.status === 'final', A.status);
    await page.click(`${V} [data-c="new"]`);
    await page.click(`${V} [data-c="importPrev"]`);
    await page.click(`${V} [data-prev="${A.id}"]`);
    const v = await page.inputValue(`${V} textarea[data-src="lastPlan"]`);
    assert(v.includes('2027학년도 3학년 2반 학급 교육과정 운영 계획') && !v.includes('1부.'), v.slice(0, 200));
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert(await page.locator(`${V} #cpOutline li`).count() === A.outline.length, `${await page.locator(`${V} #cpOutline li`).count()} / ${A.outline.length}`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
