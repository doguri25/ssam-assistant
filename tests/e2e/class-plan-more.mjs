// 계획 › 학급운영계획 다듬기: 학생 수 안내, 표준 목차를 본 뒤 작년 파일, 확정 되돌림, 창체 영역별 진도표, 월별 칸 없음, 저장 실패 때 도는 표시
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-29T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
await mockClaude(page, async ({ prompt }) => {
  if (prompt.startsWith('[학급운영계획 지침]')) {
    const id = /^(\S+): /m.exec(prompt.split('계획서 칸')[1])[1];
    return JSON.stringify([{ item: '기초학력 진단', keywords: ['기초학력'], sentence: '3월에 기초학력 진단을 한다.', section: id }]);
  }
  if (prompt.startsWith('[학급운영계획 초안]')) {
    const secs = [...prompt.matchAll(/^ {2}- \[(\S+)\] ([^(\n]+)/gm)].map(m => [m[1], m[2].trim()]);
    return JSON.stringify({ sections: Object.fromEntries(secs.map(([id, s]) => [id, `${s}을(를) 운영한다.`])), monthly: [{ month: 3, text: '학급 세우기' }] });
  }
  return '{}';
});
const V = 'section[data-menu="plan"] .cp-box';
const go = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="class"]'); };
const cur = () => page.evaluate(async () => { const m = await import('./menus/plan/classplan-model.js'); return m.getPlan(m.currentId()); });
const upload = async (sel, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]); await fc.setFiles(files); };
const step = async n => { const b = page.locator(`${V} ol.steps [data-step="${n}"]`); if (await b.count()) await b.click(); };
await page.goto(url);
await page.waitForTimeout(300);
await page.evaluate(() => {
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 }));
  localStorage.setItem('ssam:class', JSON.stringify({ count: 25, except: [7, 19], nos: [] }));
});
await page.reload(); await page.waitForTimeout(400);
await go();

await run('class-plan-more', [
  ['1단계 학생 수 안내는 학급 명단에서 예외 번호를 뺀 수', async () => {
    assert((await page.textContent(V)).includes('학급 명단: 23명'), '학생 수 안내');
  }],
  ['표준 목차를 보기만 한 뒤 작년 계획서를 넣으면 작년 목차로 바뀜', async () => {
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('표준 목차'), '표준');
    await step(1);
    await upload(`${V} [data-file="lastPlan"]`, join(FIXTURES, 'classplan-last.txt'));
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastPlan"]`) || {}).value?.includes('학급 실태'), V);
    await page.click(`${V} [data-c="next"]`);
    await page.waitForSelector(`${V} #cpOutline`);
    assert((await page.textContent(`${V} #cpOutlineNote`)).includes('작년 계획서 목차 그대로') && await page.locator(`${V} #cpOutline li`).count() === 13, '작년 목차로 안 바뀜');
  }],
  ['확정한 뒤 목차·첨부·학급 정보를 고치면 다시 「작성 중」', async () => {
    await page.click(`${V} [data-c="next"]`);
    await page.click(`${V} [data-c="draft"]`);
    await page.waitForSelector(`${V} textarea[data-sec]`, { timeout: 8000 });
    const fin = async () => { await step(4); await page.click(`${V} [data-c="final"]`); assert((await cur()).status === 'final', '확정 안 됨'); };
    await page.click(`${V} [data-c="next"]`);
    await fin();
    await step(2);
    const inp = page.locator(`${V} #cpOutline li`).nth(1).locator('input[data-ot]');
    await inp.fill('학급 실태와 특성'); await inp.dispatchEvent('change');
    assert((await cur()).status === 'draft', '목차 이름을 고쳐도 확정');
    await fin();
    await upload(`${V} [data-file="attach"]`, join(FIXTURES, 'jindo-sample.txt'));
    await page.waitForSelector(`${V} #cpAttach li[data-att]`);
    assert((await cur()).status === 'draft', '첨부를 넣어도 확정');
    await fin();
    await step(1);
    await page.fill(`${V} #cpRoom`, '3');
    await page.waitForTimeout(600);
    assert((await cur()).status === 'draft', '반을 고쳐도 확정');
    await page.fill(`${V} #cpRoom`, '2');
  }],
  ['창체 영역별 표만 있는 진도표는 「표를 찾지 못했어요」 대신 그렇게 알려 줌', async () => {
    const txt = '자율⋅자치활동 교육과정 연간지도계획\n주 | 기간 | 단원명 | 학습 주제 | 차시\n1 | 3.2~3.6 | 친교 활동 | 친구 사귀기 | 1/2\n친교 활동 | 우리 반 약속 | 2/2\n';
    await upload(`${V} [data-file="attach"]`, { name: '창체-진도표.txt', mimeType: 'text/plain', buffer: Buffer.from(txt) });
    await page.waitForFunction(s => document.querySelectorAll(`${s} #cpAttach li[data-att]`).length === 2, V);
    const li = await page.locator(`${V} #cpAttach li[data-att]`).nth(1).textContent();
    assert(li.includes('영역별') && !li.includes('찾지 못했어요'), li);
  }],
  ['목차에 월별 칸이 없으면 4단계에서 월별 활동이 한글 파일에 안 들어간다고 알려 줌', async () => {
    await step(4);
    assert((await cur()).monthly.length > 0, '월별 활동이 없음');
    assert((await page.textContent(`${V} .yp-card:has([data-c="hwpx"])`)).includes('「월별」 칸이 없어'), '월별 칸 안내 없음');
  }],
  ['저장하지 못한 새 계획에서 지침·초안을 불러도 도는 표시가 남지 않음', async () => {
    await page.click(`${V} [data-c="new"]`);
    await page.fill(`${V} textarea[data-src="guide"]`, '기초학력 진단을 한다.');
    await page.evaluate(() => {
      const o = Storage.prototype.setItem;
      window.__setItem = o;
      Storage.prototype.setItem = function (k, v) { if (k === 'ssam:classplans') throw new DOMException('full', 'QuotaExceededError'); return o.call(this, k, v); };
    });
    await page.click(`${V} [data-c="next"]`); await page.click(`${V} [data-c="next"]`);
    await page.click(`${V} [data-c="draft"]`);
    await page.waitForFunction(s => !document.querySelector(`${s} .spin`), V, { timeout: 6000 }).catch(() => {});
    const spinning = await page.locator(`${V} .spin`).count();
    await page.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
    assert(spinning === 0, '도는 표시가 남음');
    assert((await page.textContent(`${V} .banner.err`)).includes('저장'), '저장 실패 안내 없음');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
