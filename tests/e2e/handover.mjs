// 문서·소통 › 인수인계서(2026-11-10, 설정 › 학년도의 창에서 옮김): 탭(공문 처리 다음) → 지금 학년도 자료 고르기(처음엔 모두, 작년 것은 빼고) → 미리 보기 1~6(월별 3월~2월),
// 이름·전화번호 없음, 고르기를 빼면 문서에서도 빠짐, [AI로 정리](1~5만 보냄) → 고쳐 쓰기, 「몇 쪽으로」(알림·줄인 미리 보기·AI 줄 수·학년도 자료에 저장),
// 인수인계서 양식(.hwpx) 넣기(가정통신문 양식과 따로 저장, .hwp는 안내) → [한글로 내려받기]는 그 양식에(결재란·서명 줄 그대로), 워드는 기본 양식,
// 다시 들어오면·새로 고치면 남음, 양식 지우기, openHandover()·설정 › 학년도 단추·AI 키 없음
import { readFileSync } from 'node:fs';
import { open, run, assert, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-06T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const reqs = [];
await mockClaude(page, ({ prompt }) => {
  reqs.push(prompt);
  return JSON.stringify({ lines: ['3월 첫 주에 과학 교육 계획부터 확정해요.', '김가람 선생님께 물어봐요 010-1111-2222', '운동회는 점심시간을 늘려요.', '과학의 날 공문 회신이 남았어요.'] });
});
const E = 'section[data-menu="etc"]', P = `${E} .ho-box`, S = 'section[data-menu="settings"]';
const NAMES = ['김가람', '이나래', '박하늘', '최하은'];
const noPersonal = (s, what) => {
  for (const n of NAMES) assert(!s.includes(n), `${what}에 이름 「${n}」`);
  assert(!/0\d{1,2}-\d{3,4}-\d{4}/.test(s), `${what}에 전화번호`);
};
const dec = u => new TextDecoder().decode(u);
const sections = async dl => [...(await unzip(new Uint8Array(readFileSync(await dl.path())))).entries()].filter(([k]) => /section\d*\.xml$/.test(k)).map(([, v]) => dec(v)).join('');
const toast = () => page.textContent('#toast');
const tab = async () => { await page.click('nav.app-side [data-menu-go="etc"]'); await page.click('#menuTabs [data-tab="handover"]'); await page.waitForSelector(`${P} #hoPrev h1`); };
const prev = () => page.textContent(`${P} #hoPrev`);
const fit = () => page.textContent(`${P} #hoFit`);
const saved = () => page.evaluate(async () => (await import('./menus/etc/handover-model.js')).getSaved());
// 지어낸 학교 인수인계서 양식: 제목, 결재란 표, 인계자·인수자 줄, 옛 본문 두 줄, 날짜, 학교장
const FORM = Buffer.from(makeHwpx({ title: '새싹초 업무 인수인계서', blocks: [
  { type: 'table', rows: [['결재', '담당', '부장', '교감']] }, { type: 'p', text: '인계자: 교사 (서명)' }, { type: 'p', text: '인수자: 교사 (서명)' },
  { type: 'p', text: '옛 본문: 맡은 업무를 적어요' }, { type: 'p', text: '옛 본문: 넘길 것을 적어요' }, { type: 'p', text: '2026. 2. 27.' }, { type: 'p', text: '새싹초등학교장' }] }));

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
  // 「몇 쪽으로」에서 줄일 지난 품의 18건(3월~, 1만 원씩)
  for (let i = 0; i < 18; i++) lib.pushRecent({ id: `old${i}`, at: new Date(2026, 2 + (i % 7), 2 + i).getTime(), form: { type: 'goods', project: `교실 환경 물품 ${i + 1}차`, items: [{ name: '물품', qty: 1, price: 10000 }] }, draft: { title: `교실 환경 물품 구입 ${i + 1}차` } });
  gm.putDoc({ id: 'gm1', title: '2026 과학의 날 운영 안내', due: '2026-11-20', tasks: [{ text: '참가 학생 조사', due: '2026-11-13' }], text: '담당 김가람 010-9999-8888', done: false });
  rp.pushReport({ id: 'rp1', title: '2026 과학의 날 행사 운영 결과 보고서', r: { name: '2026 과학의 날 행사', period: { start: '2026-04-21' }, summary: '학년별 탐구 실험', sections: [] } });
});
const TOTAL = (36000 + 18 * 10000).toLocaleString('ko-KR');

await run('handover', [
  ['기타에 「인수인계서」 탭(공문 처리 다음) → 업무 인수인계서 화면, 다른 기타 화면은 숨음', async () => {
    await page.click('nav.app-side [data-menu-go="etc"]');
    const tabs = await page.$$eval('#menuTabs [data-tab]', l => l.map(x => x.textContent));
    assert(JSON.stringify(tabs) === JSON.stringify(['쪽지 작성', '가정통신문', '공문 처리', '인수인계서', '다면평가']), JSON.stringify(tabs));
    await page.click('#menuTabs [data-tab="handover"]');
    await page.waitForSelector(`${P} #hoPrev table`);
    assert((await page.textContent(`${P} h2`)).includes('업무 인수인계서'), '제목');
    assert(await page.isHidden(`${E} .lf-box`) || !(await page.$(`${E} .lf-box`)), '가정통신문 화면이 보임');
    assert((await page.inputValue(`${P} #hoPages`)) === '0' && (await fit()).includes('쪽 수 제한 없이 만들어요(지금 약'), await fit());
    assert((await page.inputValue(`${P} #hoForm`)) === '', '기본 양식');
  }],
  ['고르기: 업무·행사·품의·공문·결과 보고, 처음엔 지금 학년도 것을 모두(작년 계획은 빼고)', async () => {
    const txt = await page.textContent(`${P} .ho-groups`);
    for (const w of ['업무(연간계획)', '행사계획', '품의', '공문', '결과 보고', '과학 교육', '독서 교육', '가을 운동회', '5학년 과학 실험 재료 구입', '2026 과학의 날 운영 안내']) assert(txt.includes(w), `「${w}」 없음`);
    const checked = await page.$$eval(`${P} [data-ho-pick]`, els => els.map(e => [e.closest('label').textContent.trim(), e.checked]));
    assert(checked.filter(c => !c[1]).length === 1 && checked.find(c => !c[1])[0].includes('작년 과학 교육'), JSON.stringify(checked.filter(c => !c[1])));
    assert((await page.textContent(`${P} [data-ho-count="duties"]`)) === '2/3', '개수');
    assert((await page.textContent(`${P} [data-ho-count="purchases"]`)) === '19/19', '품의 개수');
  }],
  ['미리 보기: 1~6 차례, 월별 할 일 3월~2월(2월 끝에 다음 해 일), 품의 합계, 이름·전화번호 없음', async () => {
    const heads = await page.$$eval(`${P} #hoPrev h2`, els => els.map(e => e.textContent));
    assert(JSON.stringify(heads) === JSON.stringify(['1. 맡은 업무 한눈에', '2. 월별 할 일', '3. 행사와 개선 메모', '4. 예산 집행', '5. 주요 공문·제출', '6. 다음 담당자에게']), JSON.stringify(heads));
    const months = await page.$$eval(`${P} #hoPrev table:nth-of-type(2) tr td:first-child`, els => els.map(e => e.textContent));
    assert(months.join(',') === '3월,4월,5월,6월,7월,8월,9월,10월,11월,12월,1월,2월', months.join(','));
    const p = await prev();
    assert(p.includes('2026학년도 업무 인수인계서') && p.includes('5일 과학 교육: 탐구 보고서 제출(○○○ 선생님께)') && p.includes('15일 행사: 가을 운동회'), p.slice(0, 300));
    assert(p.includes('○○○ 선생님과 상의해 점심시간을 늘려요.') && p.includes(TOTAL) && p.includes('20일 제출: 2026 과학의 날 운영 안내'), '내용');
    assert(!p.includes('작년 과학 교육') && !p.includes('외 '), '고르지 않은 업무·줄인 줄');
    noPersonal(p, '미리 보기');
  }],
  ['고르기를 빼면 문서에서도 빠지고, 「모두」를 누르면 그 묶음을 다 고름', async () => {
    await page.click(`${P} label:has([data-ho-pick]):has-text("독서 교육")`);
    assert(!(await prev()).includes('독서 교육'), '뺀 업무가 남음');
    assert(await page.evaluate(() => document.querySelector('.ho-box [data-ho-all="duties"]').indeterminate), '「모두」 중간 표시');
    await page.check(`${P} [data-ho-all="duties"]`);
    assert((await prev()).includes('작년 과학 교육') && (await prev()).includes('독서 교육'), '모두 고름');
    await page.uncheck(`${P} [data-ho-all="duties"]`);
    assert((await page.textContent(`${P} [data-ho-count="duties"]`)) === '0/3', '모두 뺌');
    await page.check(`${P} label:has([data-ho-pick]):has-text("과학 교육") >> nth=0`);
    const on = await page.$$eval(`${P} [data-ho-pick][data-g="duties"]`, els => els.filter(e => e.checked).map(e => e.closest('label').textContent.trim()));
    assert(on.length === 1 && on[0].startsWith('과학 교육'), JSON.stringify(on));
  }],
  ['[AI로 정리](제한 없음): 고른 1~5만 보냄(이름·전화번호·뺀 업무 없음, 3~6줄) → 「다음 담당자에게」에 줄로', async () => {
    await page.fill(`${P} #hoNote`, '쓰던 메모');
    await page.click(`${P} [data-ho="ai"]`);
    await page.waitForFunction(() => document.querySelector('.ho-box #hoNote').value.startsWith('- 3월'));
    assert(reqs.length === 1, `AI 요청 ${reqs.length}번`);
    const q = reqs[0];
    assert(q.includes('[업무 인수인계]') && q.includes('3~6줄') && !q.includes('쪽에 맞추므로') && q.includes('과학 교육') && q.includes('가을 운동회') && q.includes('2026 과학의 날 운영 안내'), q.slice(0, 300));
    assert(!q.includes('독서 교육') && !q.includes('쓰던 메모') && !q.includes('6. 다음 담당자에게'), '고르지 않은 것·메모를 보냄');
    noPersonal(q, 'AI 요청');
    const note = await page.inputValue(`${P} #hoNote`);
    assert(note.split('\n').length === 4 && note.includes('- ○○○ 선생님께 물어봐요') && !/010/.test(note), note);
  }],
  ['몇 쪽으로: 1쪽 → 오래된 품의를 「외 n건 합계」로 줄였다는 알림·줄인 미리 보기(합계 그대로), 2쪽 → 알림이 바뀜, 학년도 자료에 저장', async () => {
    const opts = await page.$$eval(`${P} #hoPages option`, l => l.map(o => o.textContent));
    assert(JSON.stringify(opts) === JSON.stringify(['1쪽', '2쪽', '3쪽', '4쪽', '5쪽', '쪽 수 제한 없음']), JSON.stringify(opts));
    await page.selectOption(`${P} #hoPages`, '1');
    await page.waitForFunction(() => document.querySelector('.ho-box #hoFit').textContent.startsWith('1쪽'));
    const f1 = await fit();
    assert(/^1쪽에 맞추느라 품의 \d+건.*줄였어요\.$/.test(f1.trim()) || f1.includes('1쪽에 다 넣지 못했어요'), f1);
    const p = await prev();
    assert(/외 \d+건 합계|품의 \d+건 · 합계/.test(p) && p.includes(TOTAL), '줄인 품의·합계: ' + p.slice(-500));
    assert(p.includes('맡은 업무 한눈에') && p.includes('과학 교육'), '맡은 업무가 빠짐');
    assert((await saved()).pages === 1, '저장');
    assert((await page.textContent(`${P} #hoAiHint`)).includes('2~3줄'), 'AI 줄 수 안내');
    await page.selectOption(`${P} #hoPages`, '2');
    await page.waitForFunction(() => document.querySelector('.ho-box #hoFit').textContent.startsWith('2쪽'));
    assert((await fit()) !== f1, '알림이 그대로');
    assert((await saved()).pages === 2 && (await page.textContent(`${P} #hoAiHint`)).includes('3~4줄'), '2쪽 저장');
  }],
  ['몇 쪽으로 1쪽에서 [AI로 정리]: 2~3줄로 부탁하고 3줄까지만 받음, 고쳐 쓰면 문서에도', async () => {
    await page.selectOption(`${P} #hoPages`, '1');
    await page.click(`${P} [data-ho="ai"]`);
    await page.waitForFunction(n => document.querySelector('.ho-box #hoNote').value.split('\n').length === n, 3);
    assert(reqs.length === 2, `AI 요청 ${reqs.length}번`);
    assert(reqs[1].includes('2~3줄') && reqs[1].includes('1쪽에 맞추므로 3줄을 넘기지 않습니다'), reqs[1].slice(0, 300));
    noPersonal(reqs[1], 'AI 요청(1쪽)');
    const note = await page.inputValue(`${P} #hoNote`);
    assert(note.split('\n').length === 3 && note.includes('- ○○○ 선생님께 물어봐요'), note);
    await page.fill(`${P} #hoNote`, note + '\n- 공문철은 교무실 책장에 있어요.');
    assert((await prev()).includes('공문철은 교무실 책장에 있어요.'), '고친 글');
  }],
  ['양식 넣기: .hwp는 .hwpx로 저장하라는 안내, .hwpx는 인수인계서 양식 저장소에만(가정통신문 양식과 따로) 저장·골라짐, [양식 맞추기]에 자리', async () => {
    await page.setInputFiles(`${P} #hoFormFile`, { name: '인수인계서 양식.hwp', mimeType: 'application/octet-stream', buffer: Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 1, 2, 3]) });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('.hwpx로 저장해 넣어 주세요'));
    assert((await page.$$eval(`${P} #hoForm option`, l => l.length)) === 1, '.hwp가 들어감');
    await page.setInputFiles(`${P} #hoFormFile`, { name: '새싹초 인수인계서 양식.hwpx', mimeType: 'application/octet-stream', buffer: FORM });
    await page.waitForFunction(s => (document.querySelector(`${s} #hoForm`) || {}).value, P, { timeout: 8000 });
    assert((await page.textContent(`${P} #hoForm`)).includes('새싹초 인수인계서 양식'), '양식 이름');
    assert((await toast()).includes('양식을 저장했어요'), await toast());
    assert((await page.textContent(`${P} #hoFormBox`)).includes('「새싹초 인수인계서 양식」 양식의 제목·본문 자리에 채워요'), '안내');
    assert((await page.textContent(`${P} #hoPrevHint`)).includes('한글로 내려받으면'), '미리 보기 안내');
    const n = await page.evaluate(async () => { const m = await import('./core/form-store.js'); return [(await (await m.forms('handover')).list()).length, (await (await m.forms()).list()).length]; });
    assert(JSON.stringify(n) === '[1,0]', '저장소: ' + JSON.stringify(n));
    assert((await saved()).formId === (await page.inputValue(`${P} #hoForm`)), '고른 양식 저장');
    await page.click(`${P} [data-ho="map"]`);
    await page.waitForSelector(`${P} #hoMap`);
    const badge = text => page.evaluate(([s, t]) => { const li = [...document.querySelectorAll(`${s} .lf-lines li`)].find(l => l.querySelector('.lf-text').textContent === t); return li ? li.querySelector('.lf-badge').textContent : '?'; }, [P, text]);
    assert((await badge('새싹초 업무 인수인계서')) === '제목' && (await badge('옛 본문: 맡은 업무를 적어요')) === '본문' && (await badge('옛 본문: 넘길 것을 적어요')) === '본문', '제목·본문');
    assert((await badge('2026. 2. 27.')) === '날짜' && (await badge('결재')) === '·' && (await badge('인계자: 교사 (서명)')) === '·' && (await badge('새싹초등학교장')) === '·', '그대로 둘 줄');
    await page.click(`${P} [data-ho="mapClose"]`);
    // 키보드로 양식을 고르거나 [양식 맞추기]의 줄·자리를 눌러도 초점이 그 칸에 남음(다시 그려도 <body>로 가지 않게)
    const act = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.id || (a.dataset && (a.dataset.hoLine != null ? 'line' + a.dataset.hoLine : a.dataset.ho)) || a.tagName) : ''; });
    const fid = await page.inputValue(`${P} #hoForm`);
    await page.focus(`${P} #hoForm`);
    await page.selectOption(`${P} #hoForm`, '');
    await page.waitForFunction(s => !document.querySelector(`${s} [data-ho="delForm"]`), P);
    assert((await act()) === 'hoForm', '기본 양식을 고른 뒤 초점: ' + await act());
    await page.selectOption(`${P} #hoForm`, fid);
    await page.waitForSelector(`${P} [data-ho="delForm"]`);
    assert((await act()) === 'hoForm', '양식을 고른 뒤 초점: ' + await act());
    await page.focus(`${P} [data-ho="map"]`); await page.keyboard.press('Enter');
    await page.waitForSelector(`${P} #hoMap`);
    assert((await act()) === 'map', '[양식 맞추기] 초점: ' + await act());
    const ti = await page.evaluate(s => [...document.querySelectorAll(`${s} .lf-lines li`)].findIndex(l => l.querySelector('.lf-badge').textContent === '제목'), P);
    await page.focus(`${P} [data-ho-line="${ti}"]`); await page.keyboard.press('Enter');
    await page.waitForSelector(`${P} [data-ho-role="title"]`);
    assert((await act()) === `line${ti}`, '줄 초점: ' + await act());
    await page.focus(`${P} [data-ho-role="title"]`); await page.keyboard.press('Enter'); // 같은 자리(제목) 그대로
    await page.waitForFunction(s => !document.querySelector(`${s} [data-ho-role]`), P);
    assert((await act()) === `line${ti}`, '자리를 고른 뒤 초점: ' + await act());
    await page.focus(`${P} [data-ho="mapClose"]`); await page.keyboard.press('Enter');
    await page.waitForFunction(s => !document.querySelector(`${s} #hoMap`), P);
    assert((await act()) === 'map', '닫은 뒤 초점: ' + await act());
    // 가정통신문 양식 목록에는 없음
    await page.click('#menuTabs [data-tab="letter"]');
    await page.waitForSelector(`${E} .lf-box #lfForm`);
    assert(!(await page.textContent(`${E} .lf-box #lfForm`)).includes('인수인계서'), '가정통신문 양식에 섞임');
    await tab();
  }],
  ['한글로 내려받기 → 그 양식에(결재란·인계자 줄·학교장 그대로, 옛 본문 대신 1쪽에 맞춘 인수인계서), ▾ 워드 → 기본 양식, 이름·전화번호 없음', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-ho="export"]`)]);
    assert(dl.suggestedFilename() === '2026학년도 업무 인수인계서.hwpx', dl.suggestedFilename());
    const x = await sections(dl);
    for (const w of ['2026학년도 업무 인수인계서', '결재', '인계자: 교사 (서명)', '새싹초등학교장', '2026. 11. 6.', '맡은 업무 한눈에', '과학 교육', '공문철은 교무실 책장에 있어요.', TOTAL]) assert(x.includes(w), `한글 파일에 「${w}」 없음`);
    assert(/외 \d+건 합계|품의 \d+건 · 합계/.test(x), '1쪽에 맞춘 품의');
    assert(!x.includes('옛 본문') && !x.includes('2026. 2. 27.') && !x.includes('독서 교육'), '옛 본문·날짜·뺀 업무');
    noPersonal(x, '한글 파일');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('양식으로 한글 파일을 내려받았어요'));
    await page.click(`${P} .exp-split:has([data-ho="export"]) [data-exp-menu]`);
    const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="docx"]')]);
    assert(dl2.suggestedFilename() === '2026학년도 업무 인수인계서.docx', dl2.suggestedFilename());
    const d = dec((await unzip(new Uint8Array(readFileSync(await dl2.path())))).get('word/document.xml'));
    assert(d.includes('월별 할 일') && d.includes('<w:tbl>') && !d.includes('결재') && !d.includes('인계자'), '워드는 기본 양식');
    noPersonal(d, '워드 파일');
    await page.evaluate(async () => (await import('./core/doc-export.js')).setFormat('hwpx'));
  }],
  ['다른 탭에 갔다 와도·새로 고쳐도 고른 것·메모·쪽 수·양식이 남음', async () => {
    const id = await page.inputValue(`${P} #hoForm`);
    await page.click('#menuTabs [data-tab="gongmun"]');
    await tab();
    assert((await page.inputValue(`${P} #hoNote`)).includes('공문철은 교무실 책장에 있어요.'), '메모');
    assert(!(await prev()).includes('독서 교육'), '고른 것');
    assert((await page.inputValue(`${P} #hoPages`)) === '1', '쪽 수');
    await page.reload(); await page.waitForTimeout(400);
    await tab(); // 켜면 「오늘」 — 문서·소통 › 인수인계서로 다시 들어가도 남음
    await page.waitForFunction(([s, v]) => document.querySelector(`${s} #hoForm`).value === v, [P, id]);
    assert((await page.inputValue(`${P} #hoPages`)) === '1' && (await fit()).startsWith('1쪽'), '쪽 수·알림');
  }],
  ['양식 저장소(IndexedDB)를 잠깐 열지 못해도 고른 양식은 지우지 않음 → 다시 열리면 그 양식', async () => {
    const id = (await saved()).formId;
    assert(id, '고른 양식 없음');
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('t:formsDown')) return;
      const o = indexedDB.open.bind(indexedDB);
      indexedDB.open = (n, v) => { if (String(n).startsWith('ssam-forms')) throw new Error('forms down'); return o(n, v); };
    });
    await page.evaluate(() => sessionStorage.setItem('t:formsDown', '1'));
    await page.reload(); await page.waitForTimeout(400);
    await tab(); // 켜면 「오늘」이라 다시 들어감
    await page.waitForTimeout(400);
    assert((await saved()).formId === id, '고른 양식이 지워짐: ' + JSON.stringify((await saved()).formId));
    await page.evaluate(() => sessionStorage.removeItem('t:formsDown'));
    await page.reload(); await page.waitForTimeout(400);
    await tab(); // 켜면 「오늘」이라 다시 들어감
    await page.waitForFunction(([s, v]) => document.querySelector(`${s} #hoForm`).value === v && document.querySelector(`${s} [data-ho="delForm"]`), [P, id]);
    // 양식을 고르는 그때 읽기가 실패해도: 「찾지 못했어요」로 지우지 않고 고른 것을 남김
    await page.evaluate(async () => { const s = await (await import('./core/form-store.js')).forms('handover'); window.__get = s.get; s.get = async () => { throw new Error('busy'); }; });
    await page.selectOption(`${P} #hoForm`, '');
    await page.selectOption(`${P} #hoForm`, id);
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('양식을 읽지 못했어요'));
    assert((await saved()).formId === id, '읽기 실패로 고른 양식이 지워짐');
    await page.evaluate(async () => { (await (await import('./core/form-store.js')).forms('handover')).get = window.__get; });
    await page.selectOption(`${P} #hoForm`, id);
    await page.waitForSelector(`${P} [data-ho="delForm"]`);
  }],
  ['양식 지우기 → 기본 양식으로(저장소에서도 빠짐), 한글은 기본 양식', async () => {
    await page.click(`${P} [data-ho="delForm"]`);
    await page.waitForFunction(s => document.querySelector(`${s} #hoForm`).value === '' && !document.querySelector(`${s} [data-ho="delForm"]`), P);
    const n = await page.evaluate(async () => (await (await (await import('./core/form-store.js')).forms('handover')).list()).length);
    assert(n === 0 && (await saved()).formId === '', '지워지지 않음');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-ho="export"]`)]);
    const x = await sections(dl);
    assert(x.includes('맡은 업무 한눈에') && !x.includes('결재') && !x.includes('새싹초등학교장'), '기본 양식이 아님');
    await page.selectOption(`${P} #hoPages`, '0');
    await page.waitForFunction(() => document.querySelector('.ho-box #hoFit').textContent.includes('제한 없이'));
    assert(!(await prev()).includes('외 '), '제한 없음인데 줄임');
  }],
  ['다른 메뉴에서 openHandover()·설정 › 학년도 [업무 인수인계서 만들기] → 문서·소통 › 인수인계서', async () => {
    await page.click('nav.app-side [data-menu-go="plan"]');
    await page.evaluate(() => import('./menus/etc/handover.js').then(m => m.openHandover()));
    await page.waitForSelector(`${P} #hoPrev h1`);
    assert(await page.isVisible(E) && await page.getAttribute('#menuTabs [data-tab="handover"]', 'aria-current') === 'page', '문서·소통 › 인수인계서가 아님');
    await page.click('nav.app-side [data-menu-go="settings"]'); await page.click('#menuTabs [data-tab="years"]');
    await page.waitForSelector(`${S} [data-set="handover"]`);
    assert((await page.textContent(S)).includes('문서·소통 › 인수인계서'), '학년도 카드 안내');
    await page.click(`${S} [data-set="handover"]`);
    await page.waitForSelector(`${P} #hoPrev h1`);
    assert(await page.getAttribute('#menuTabs [data-tab="handover"]', 'aria-current') === 'page', '단추로 가지 않음');
    assert(!(await page.$('#sheetRoot .ho-sheet')), '옛 창이 열림');
  }],
  ['AI 키가 없으면 [AI로 정리]는 설정 › AI 안내만', async () => {
    await page.evaluate(() => localStorage.removeItem('ssam:engine'));
    await page.addInitScript(() => localStorage.removeItem('ssam:engine'));
    await page.reload(); await page.waitForTimeout(400);
    await tab(); // 켜면 「오늘」이라 다시 들어감
    await page.click(`${P} [data-ho="ai"]`);
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('설정 › AI'));
    assert(reqs.length === 2, 'AI를 부름');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
