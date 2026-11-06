// 설정 › 학년도 › 업무 인수인계서: [업무 인수인계서 만들기] → 지금 학년도 자료 고르기(처음엔 모두, 작년 것은 빼고) → 미리 보기 1~6(월별 3월~2월),
// 이름·전화번호 없음, 고르기를 빼면 문서에서도 빠짐, [AI로 정리](1~5만 보냄) → 고쳐 쓰기, 한글·워드 내려받기, 다시 열면 남음, openHandover()로 열기
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const reqs = [];
await mockClaude(page, ({ prompt }) => {
  reqs.push(prompt);
  return JSON.stringify({ lines: ['3월 첫 주에 과학 교육 계획부터 확정해요.', '운동회는 점심시간을 늘려요.', '과학의 날 공문 회신이 남았어요.', '김가람 선생님께 물어봐요 010-1111-2222'] });
});
const S = 'section[data-menu="settings"]', H = '#sheetRoot .ho-sheet';
const NAMES = ['김가람', '이나래', '박하늘', '최하은'];
const noPersonal = (s, what) => {
  for (const n of NAMES) assert(!s.includes(n), `${what}에 이름 「${n}」`);
  assert(!/0\d{1,2}-\d{3,4}-\d{4}/.test(s), `${what}에 전화번호`);
};
const dec = u => new TextDecoder().decode(u);
const yearsTab = async () => { await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]'); await page.waitForSelector(`${S} [data-yr]`); };
const prev = () => page.textContent(`${H} #hoPrev`);

await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(async () => {
  const y = await import('./menus/plan/year-model.js'), ev = await import('./menus/plan/event-model.js'), lib = await import('./menus/purchase/library.js');
  const gm = await import('./menus/etc/gongmun-model.js'), rp = await import('./menus/plan/report-model.js');
  y.savePlan({ ...y.newPlan(), year: 2025, name: '작년 과학 교육' });
  y.savePlan({ ...y.newPlan(), year: 2026, name: '과학 교육', owner: '박하늘', goal: '탐구하는 즐거움을 느끼게 해요',
    draft: y.normDraft({ schedule: [{ title: '과학의 날 행사', date: '2026-04-21' }, { title: '탐구 보고서 제출(최하은 선생님께)', date: '2027-02-05' }] }) });
  y.savePlan({ ...y.newPlan(), year: 2026, name: '독서 교육', goal: '책 읽는 학교', draft: y.normDraft({ schedule: [{ title: '독서 골든벨', date: '2026-10-08' }] }) });
  ev.saveEvent({ ...ev.newEvent(), name: '가을 운동회', date: '2026-10-15', status: 'final', staff: [{ name: '김가람', duty: '진행' }],
    docs: { plan: '', safety: '', letter: '', rain: '', roles: [{ name: '이나래', roles: ['방송'] }], done: false },
    survey: { target: 'student', items: [], formUrl: '', result: null, textSummary: '', report: '', nextMemo: '김가람 선생님과 상의해 점심시간을 늘려요. 문의 010-1234-5678' } });
  lib.pushRecent({ id: 'pc1', at: Date.now(), form: { type: 'goods', project: '과학 실험 재료 구입', items: [{ name: '비커', qty: 8, price: 4500 }] }, draft: { title: '5학년 과학 실험 재료 구입' } });
  gm.putDoc({ id: 'gm1', title: '2026 과학의 날 운영 안내', due: '2026-11-20', tasks: [{ text: '참가 학생 조사', due: '2026-11-13' }], text: '담당 김가람 010-9999-8888', done: false });
  rp.pushReport({ id: 'rp1', title: '2026 과학의 날 행사 운영 결과 보고서', r: { name: '2026 과학의 날 행사', period: { start: '2026-04-21' }, summary: '학년별 탐구 실험', sections: [] } });
});

await run('handover', [
  ['설정 › 학년도에 「업무 인수인계서」 카드 → [업무 인수인계서 만들기]로 창이 열림', async () => {
    await yearsTab();
    assert((await page.textContent(S)).includes('업무 인수인계서'), '카드 없음');
    await page.click(`${S} [data-set="handover"]`);
    await page.waitForSelector(`${H} #hoPrev table`);
    assert((await page.textContent(`${H} h3`)).includes('업무 인수인계서'), '제목');
  }],
  ['고르기: 업무·행사·품의·공문·결과 보고, 처음엔 지금 학년도 것을 모두(작년 계획은 빼고)', async () => {
    const txt = await page.textContent(`${H} .ho-groups`);
    for (const w of ['업무(연간계획)', '행사계획', '품의', '공문', '결과 보고', '과학 교육', '독서 교육', '가을 운동회', '5학년 과학 실험 재료 구입', '2026 과학의 날 운영 안내']) assert(txt.includes(w), `「${w}」 없음`);
    const checked = await page.$$eval(`${H} [data-ho-pick]`, els => els.map(e => [e.closest('label').textContent.trim(), e.checked]));
    assert(checked.filter(c => !c[1]).length === 1 && checked.find(c => !c[1])[0].includes('작년 과학 교육'), JSON.stringify(checked));
    assert((await page.textContent(`${H} [data-ho-count="duties"]`)) === '2/3', '개수');
  }],
  ['미리 보기: 1~6 차례, 월별 할 일 3월~2월(2월 끝에 다음 해 일), 품의 합계, 이름·전화번호 없음', async () => {
    const heads = await page.$$eval(`${H} #hoPrev h2`, els => els.map(e => e.textContent));
    assert(JSON.stringify(heads) === JSON.stringify(['1. 맡은 업무 한눈에', '2. 월별 할 일', '3. 행사와 개선 메모', '4. 예산 집행', '5. 주요 공문·제출', '6. 다음 담당자에게']), JSON.stringify(heads));
    const months = await page.$$eval(`${H} #hoPrev table:nth-of-type(2) tr td:first-child`, els => els.map(e => e.textContent));
    assert(months.join(',') === '3월,4월,5월,6월,7월,8월,9월,10월,11월,12월,1월,2월', months.join(','));
    const p = await prev();
    assert(p.includes('2026학년도 업무 인수인계서') && p.includes('5일 과학 교육: 탐구 보고서 제출(○○○ 선생님께)') && p.includes('15일 행사: 가을 운동회'), p.slice(0, 300));
    assert(p.includes('○○○ 선생님과 상의해 점심시간을 늘려요.') && p.includes('36,000') && p.includes('20일 제출: 2026 과학의 날 운영 안내'), '내용');
    assert(!p.includes('작년 과학 교육'), '고르지 않은 업무');
    noPersonal(p, '미리 보기');
  }],
  ['고르기를 빼면 문서에서도 빠지고, 「모두」를 누르면 그 묶음을 다 고름', async () => {
    await page.click(`${H} label:has([data-ho-pick]):has-text("독서 교육")`);
    assert(!(await prev()).includes('독서 교육'), '뺀 업무가 남음');
    assert(await page.evaluate(() => document.querySelector('[data-ho-all="duties"]').indeterminate), '「모두」 중간 표시');
    await page.check(`${H} [data-ho-all="duties"]`);
    assert((await prev()).includes('작년 과학 교육') && (await prev()).includes('독서 교육'), '모두 고름');
    await page.uncheck(`${H} [data-ho-all="duties"]`);
    assert((await page.textContent(`${H} [data-ho-count="duties"]`)) === '0/3', '모두 뺌');
    await page.check(`${H} label:has([data-ho-pick]):has-text("과학 교육") >> nth=0`);
    const on = await page.$$eval(`${H} [data-ho-pick][data-g="duties"]`, els => els.filter(e => e.checked).map(e => e.closest('label').textContent.trim()));
    assert(on.length === 1 && on[0].startsWith('과학 교육'), JSON.stringify(on));
  }],
  ['[AI로 정리]: 고른 1~5만 보냄(이름·전화번호·뺀 업무 없음) → 「다음 담당자에게」에 줄로, 고쳐 쓰면 문서에도', async () => {
    await page.fill(`${H} #hoNote`, '쓰던 메모');
    await page.click(`${H} [data-ho="ai"]`);
    await page.waitForFunction(() => document.querySelector('#hoNote').value.startsWith('- 3월'));
    assert(reqs.length === 1, `AI 요청 ${reqs.length}번`);
    const q = reqs[0];
    assert(q.includes('[업무 인수인계]') && q.includes('과학 교육') && q.includes('가을 운동회') && q.includes('2026 과학의 날 운영 안내'), q.slice(0, 200));
    assert(!q.includes('독서 교육') && !q.includes('쓰던 메모') && !q.includes('다음 담당자에게」 칸을 씁니다.\n6.'), '고르지 않은 것·메모를 보냄');
    noPersonal(q, 'AI 요청');
    const note = await page.inputValue(`${H} #hoNote`);
    assert(note.split('\n').length === 4 && note.includes('- ○○○ 선생님께 물어봐요') && !/010/.test(note), note);
    await page.fill(`${H} #hoNote`, note + '\n- 공문철은 교무실 책장에 있어요.');
    assert((await prev()).includes('공문철은 교무실 책장에 있어요.'), '고친 글');
  }],
  ['한글로 내려받기 → .hwpx(제목·표·고른 것·메모), ▾ 워드 → .docx, 이름·전화번호 없음', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${H} [data-ho="export"]`)]);
    assert(dl.suggestedFilename() === '2026학년도 업무 인수인계서.hwpx', dl.suggestedFilename());
    const m = await unzip(new Uint8Array(readFileSync(await dl.path())));
    const x = [...m.entries()].filter(([k]) => /section\d*\.xml$/.test(k)).map(([, v]) => dec(v)).join('');
    assert(x.includes('업무 인수인계서') && x.includes('맡은 업무 한눈에') && x.includes('과학 교육') && x.includes('공문철은 교무실 책장에 있어요.'), '한글 본문');
    assert(!x.includes('독서 교육'), '뺀 업무');
    noPersonal(x, '한글 파일');
    await page.click(`${H} .exp-split:has([data-ho="export"]) [data-exp-menu]`);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="docx"]')]);
    assert(dl2.suggestedFilename().endsWith('.docx'), dl2.suggestedFilename());
    const d = dec((await unzip(new Uint8Array(readFileSync(await dl2.path())))).get('word/document.xml'));
    assert(d.includes('월별 할 일') && d.includes('<w:tbl>'), '워드 본문');
    noPersonal(d, '워드 파일');
  }],
  ['닫았다 다시 열면 고른 것·메모가 남음', async () => {
    await page.click(`${H} [data-close]`);
    await page.waitForFunction(() => !document.querySelector('.ho-sheet'));
    await page.click(`${S} [data-set="handover"]`);
    await page.waitForSelector(`${H} #hoPrev table`);
    assert((await page.inputValue(`${H} #hoNote`)).includes('공문철은 교무실 책장에 있어요.'), '메모');
    assert(!(await prev()).includes('독서 교육'), '고른 것');
    await page.click(`${H} [data-close]`);
  }],
  ['다른 메뉴에서 openHandover() → 설정 › 학년도로 가서 창이 열림', async () => {
    await page.click('nav.app-side [data-menu-go="plan"]');
    await page.evaluate(() => import('./menus/settings/handover.js').then(m => m.openHandover()));
    await page.waitForSelector(`${H} #hoPrev table`);
    assert(await page.isVisible(S), '설정 메뉴가 아님');
    assert(await page.getAttribute('#menuTabs [data-tab="years"]', 'aria-current') === 'page', '학년도 탭이 아님');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.ho-sheet'));
  }],
  ['AI 키가 없으면 [AI로 정리]는 설정 › AI 안내만', async () => {
    await page.evaluate(() => localStorage.removeItem('ssam:engine'));
    await page.addInitScript(() => localStorage.removeItem('ssam:engine'));
    await page.reload(); await page.waitForTimeout(400);
    await yearsTab();
    await page.click(`${S} [data-set="handover"]`);
    await page.waitForSelector(`${H} #hoPrev table`);
    await page.click(`${H} [data-ho="ai"]`);
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('설정 › AI'));
    assert(reqs.length === 1, 'AI를 부름');
    await page.click(`${H} [data-close]`);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
