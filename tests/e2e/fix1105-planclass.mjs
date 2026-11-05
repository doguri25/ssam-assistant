// 2026-11-05 고침(계획·학급·학년도) 화면 시험: 실적 표 숫자, 작년 계획서·지침·참고 자료 개인정보, 3월·2월 진도표 학년도, AI·직접 쓴·날짜 없는 2학기 진도표, 준비 화면 다시 그리기
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
let hold = null, answer = null;
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (hold) await hold;
  if (answer) return typeof answer === 'function' ? answer(prompt) : answer;
  if (prompt.includes('[작년 평가]')) return JSON.stringify({ good: ['a'], bad: [], numbers: [] });
  if (prompt.includes('[지침 점검]')) return JSON.stringify([{ item: '안전', keywords: ['안전'], sentence: '안전 교육을 한다.', section: 'details' }]);
  if (prompt.includes('[연간계획 초안]')) return JSON.stringify({ purpose: '가. 목적', policy: '가. 방침', details: '가. 세부', schedule: [{ title: '임원 선거', date: '2027-03-10' }], budget: [], evaluation: '가. 평가' });
  return JSON.stringify({ options: [{ label: '새로운 안', summary: 'x', timetable: [{ time: '09:00', activity: 'a', place: 'b' }], pros: [], staffNeed: '', budget: [] }] });
});
const P = 'section[data-menu="plan"]', C = 'section[data-menu="class"]', S = 'section[data-menu="settings"]';
const fresh = async (time, init = {}) => {
  await page.clock.setFixedTime(new Date(time));
  await page.goto(url);
  await page.evaluate(init => { localStorage.clear(); localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); }, init);
  await page.reload(); await page.waitForTimeout(400);
  prompts.length = 0; hold = null; answer = null;
};
const toast = () => page.textContent('#toast');
const promptOf = async tag => { for (let i = 0; i < 80; i++) { const p = prompts.find(x => x.includes(tag)); if (p) return p; await page.waitForTimeout(100); } return ''; };
const subjects = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]'));
const goYear = async () => { await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="year"]'); };
const goProgress = async () => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]'); };
const SRC = k => `${P} textarea[data-src="${k}"]`;

// 실적 표 (7자리 금액은 전화번호 규칙 몫이라 넣지 않음)
const RESULT = '2025 독서교육 실적\n항목\t예산(원)\t집행(원)\n도서 구입비\t820000\t786500\n독서 골든벨\t150000\t148000\n반성: 강사 섭외가 늦었음';
const NAMES = /최하은|정우진|홍길동|010-1234/;
const LAST_PLAN = '2026학년도 학생자치회 운영 계획\n1. 학급 임원\n6학년 1반 회장 최하은 부회장 정우진\n2. 문의: 담당교사 홍길동 010-1234-5678\n3. 예산\n항목\t금액\n간식비\t250000\n현수막\t85000';
// 화요일 1교시 국어, 1학기 국어 20차시를 모두 체크
const iso = (d0, i) => new Date(Date.parse(d0 + 'T00:00:00Z') + i * 7 * 86400000).toISOString().slice(0, 10);
const md = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
const SEM1 = {
  'ssam:years': JSON.stringify({ current: 2026 }),
  'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [[], ['국어'], [], [], []] }),
  'ssam:class:subjects': JSON.stringify([{ id: 'ko', name: '국어', start: '2026-03-02', offset: 0, total: 20,
    lessons: Array.from({ length: 20 }, (_, i) => ({ week: i + 1, period: `${md(iso('2026-03-02', i))}~${md(iso('2026-03-06', i))}`, from: iso('2026-03-02', i), unit: '단원', title: `1학기 ${i + 1}`, pages: '', memo: '' })) }]),
  'ssam:class:log': JSON.stringify(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [iso('2026-03-03', i), { 1: { subject: '국어', status: 'done' } }])))
};
const SEM2_AI = JSON.stringify({ lessons: Array.from({ length: 20 }, (_, i) => ({ week: i + 1, period: `${md(iso('2026-08-24', i))}~${md(iso('2026-08-28', i))}`, unit: '1. 단원', title: `2학기 ${i + 1}`, pages: '', memo: '' })) });
const todayText = async () => { await page.click('#menuTabs [data-tab="today"]'); await page.waitForTimeout(200); const v = (await page.textContent(`${C} #clsLessons`)).replace(/\s+/g, ' '); await page.click('#menuTabs [data-tab="progress"]'); return v; };

await run('fix1105-planclass', [
  ['[plan-strip-numbers-1] 연간계획 「작년 결과」에 붙여 넣은 실적 표: 칸을 벗어나도 예산·집행액이 그대로, 작년 평가 프롬프트에 금액', async () => {
    await fresh('2026-11-05T09:00:00');
    await goYear();
    await page.fill(`${P} [data-pk="name"]`, '독서교육'); await page.fill(`${P} [data-pk="goal"]`, '독서 습관');
    await page.fill(SRC('lastResult'), RESULT);
    await page.press(SRC('lastResult'), 'Tab');
    await page.waitForTimeout(200);
    assert(await page.inputValue(SRC('lastResult')) === RESULT, '칸: ' + await page.inputValue(SRC('lastResult')));
    assert(!(await toast()).includes('개인정보'), '알림: ' + await toast());
    await page.click(`${P} [data-y="next"]`);
    const p = await promptOf('[작년 평가]');
    assert(p.includes('도서 구입비\t820000\t786500') && p.includes('150000\t148000'), '프롬프트: ' + p.slice(p.indexOf('작년 결과'), p.indexOf('규칙:')));
  }],
  ['[plan-strip-numbers-1] 실적 CSV(연도·학년별)와 행사계획 「작년 설문 결과」의 실적 표도 그대로', async () => {
    await fresh('2026-11-05T09:00:00');
    await goYear();
    await page.fill(`${P} [data-pk="name"]`, '독서교육'); await page.fill(`${P} [data-pk="goal"]`, '독서 습관');
    const csv = '연도,학년,참가 학생 수,예산\n2023,1,52,120000\n2024,2,48,110000\n2025,3,50,115000\n';
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${P} [data-file="lastResult"]`)]);
    await fc.setFiles({ name: '실적.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.waitForFunction(s => (document.querySelector(s) || {}).value, SRC('lastResult'));
    const v = await page.inputValue(SRC('lastResult'));
    assert(v.includes('연도\t학년\t참가 학생 수\t예산') && v.includes('2024\t2\t48\t110000'), '칸: ' + v);
    await page.click('#menuTabs [data-tab="event"]');
    await page.fill(`${P} #evName`, '독서 골든벨');
    await page.fill(`${P} #evLast`, RESULT);
    await page.press(`${P} #evLast`, 'Tab');
    await page.waitForTimeout(200);
    assert(await page.inputValue(`${P} #evLast`) === RESULT, '행사 칸: ' + await page.inputValue(`${P} #evLast`));
  }],
  ['[plan-privacy-lastplan-2] 연간계획 「작년 계획서」: 칸을 벗어나면 이름·전화번호를 빼고 알림, 저장·초안 프롬프트에 없음, 금액은 그대로', async () => {
    await fresh('2026-11-05T09:00:00');
    await goYear();
    await page.fill(`${P} [data-pk="name"]`, '학생자치회'); await page.fill(`${P} [data-pk="goal"]`, '민주 시민');
    await page.fill(SRC('lastPlan'), LAST_PLAN);
    await page.press(SRC('lastPlan'), 'Tab');
    await page.waitForTimeout(200);
    const v = await page.inputValue(SRC('lastPlan'));
    assert(!NAMES.test(v) && v.includes('회장 ○○○') && v.includes('간식비\t250000') && v.includes('현수막\t85000'), '칸: ' + v);
    assert(/줄 1개.*이름 2개|이름 2개/.test(await toast()), '알림: ' + await toast());
    await page.waitForTimeout(500);
    assert(!NAMES.test(await page.evaluate(() => localStorage.getItem('ssam:yearplans') || '')), '저장됨');
    for (let s = 0; s < 3; s++) { await page.click(`${P} [data-y="next"]`); await page.waitForTimeout(200); }
    await page.click(`${P} [data-y="draft"]`);
    const p = await promptOf('[연간계획 초안]');
    assert(p.includes('작년 계획서') && p.includes('간식비') && !NAMES.test(p), '프롬프트: ' + p.slice(p.indexOf('작년 계획서'), p.indexOf('규칙:')));
  }],
  ['[plan-privacy-lastplan-2] 연간계획 「올해 지침」 파일·저장 전 붙여넣기도 이름·전화번호 없이 지침 점검 프롬프트로', async () => {
    await fresh('2026-11-05T09:00:00');
    await goYear();
    await page.fill(`${P} [data-pk="name"]`, '학생자치회'); await page.fill(`${P} [data-pk="goal"]`, '민주 시민');
    const guide = '2027 학생자치 활성화 지침\n- 학생자치회 임원 선거는 3월에 한다\n- 담당: 장학사 홍길동 031-123-4567\n- 우수 사례: 학생회장 최하은 발표';
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${P} [data-file="guide"]`)]);
    await fc.setFiles({ name: '지침.txt', mimeType: 'text/plain', buffer: Buffer.from(guide) });
    await page.waitForFunction(s => (document.querySelector(s) || {}).value, SRC('guide'));
    const v = await page.inputValue(SRC('guide'));
    assert(!NAMES.test(v) && !v.includes('031-123') && v.includes('임원 선거는 3월'), '칸: ' + v);
    assert((await toast()).includes('빼고'), '알림: ' + await toast());
    // 예전에 거르지 않고 저장된 글(가져온 계획)도 프롬프트에서는 거름
    await page.evaluate(() => { const ta = document.querySelector('section[data-menu="plan"] textarea[data-src="guide"]'); ta.value += '\n학생 대표 정우진 010-1234-9999'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click(`${P} [data-y="next"]`); await page.waitForTimeout(200);
    await page.click(`${P} [data-y="next"]`);
    const p = await promptOf('[지침 점검]');
    assert(p.includes('임원 선거는 3월') && !NAMES.test(p) && !p.includes('031-123') && !p.includes('010-1234'), '프롬프트: ' + p.slice(p.indexOf('지침:'), p.indexOf('규칙:')));
  }],
  ['[plan-privacy-lastplan-2] 행사계획 「참고 자료」 붙여넣기·파일: 이름·전화번호를 빼고 저장, 구성안 프롬프트에 없음', async () => {
    await fresh('2026-11-05T09:00:00');
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
    await page.fill(`${P} #evName`, '운동회'); await page.fill(`${P} #evGrades`, '전교생'); await page.fill(`${P} #evPlace`, '운동장'); await page.fill(`${P} #evDate`, '2027-05-06');
    await page.click(`${P} [data-e="refPaste"]`);
    await page.fill('#sheetRoot #evRefName', '작년 운동회 계획');
    await page.fill('#sheetRoot #evRefText', '청군 대표 6학년 1반 회장 최하은\n문의: 담당교사 홍길동 010-1234-5678\n안전요원 2명 이상 배치');
    await page.click('#sheetRoot #evRefOk');
    await page.waitForSelector(`${P} [data-ref]`);
    assert((await toast()).includes('빼고') || (await toast()).includes('가려'), '알림: ' + await toast());
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${P} [data-e="refFile"]`)]);
    await fc.setFiles({ name: '운동회 공문.txt', mimeType: 'text/plain', buffer: Buffer.from('백군 대표 회장 정우진\n참가 대상: 3~6학년') });
    await page.waitForFunction(() => document.querySelectorAll('[data-ref]').length === 2);
    await page.waitForTimeout(500);
    const saved = await page.evaluate(() => localStorage.getItem('ssam:events') || '');
    assert(!NAMES.test(saved) && saved.includes('안전요원') && saved.includes('참가 대상'), '저장: ' + saved.slice(0, 300));
    await page.click(`${P} [data-e="next"]`);
    const p = await promptOf('[행사 구성안]');
    assert(p.includes('안전요원 2명') && p.includes('참가 대상') && !NAMES.test(p), '프롬프트: ' + p.slice(p.indexOf('참고 자료'), p.indexOf('규칙:')));
  }],
  ['[class-jindo-year-2] 3월에 학년도를 안 바꾼 채 넣은 학년도 없는 진도표는 오늘이 든 학년도: 「끝」이 아니고 계획 진도에 맞음', async () => {
    await fresh('2027-03-10T09:00:00', { 'ssam:years': JSON.stringify({ current: 2026 }), 'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [['국어'], [], ['국어'], [], []] }) });
    await goProgress();
    const J = '국어 교육과정 연간지도계획\n' + ['3.2~3.5', '3.8~3.12', '3.15~3.19'].flatMap((p, w) => [1, 2, 3].map(k => `${w + 1} | ${p} | 1. 시 | 주제 ${w * 3 + k} | ${k}/3 | 5 |`)).join('\n');
    await page.setInputFiles(`${C} #clsJindoFile`, { name: '국어 진도표.txt', mimeType: 'text/plain', buffer: Buffer.from(J) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert((await page.textContent('#sheetRoot .sheet')).includes('2027학년도'), '고르기 시트: ' + await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForTimeout(300);
    const s = (await subjects())[0];
    assert(s.lessons[0].from === '2027-03-02' && s.lessons[3].from === '2027-03-08', 'froms: ' + s.lessons.map(l => l.from));
    assert(await page.inputValue(`${C} [data-next]`) === '5', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    assert(!(await todayText()).includes('모두 마쳤어요'), '오늘 수업');
  }],
  ['[class-jindo-year-2] 2월에 지난 학년도에서 미리 넣고 「학급 준비도 가져가기」로 옮기면 차시 날짜가 새 학년도', async () => {
    // 예전 판에서 2026년 날짜로 넣어 둔 과학 진도표도 함께
    const old = [['3.2~3.5', '과학 1'], ['3.8~3.12', '과학 2']].map(([period, title], i) => ({ week: i + 1, period, from: `2026-03-0${i ? 8 : 2}`, unit: '', title, pages: '', memo: '' }));
    await fresh('2027-02-16T09:00:00', { 'ssam:years': JSON.stringify({ current: 2026 }), 'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [['국어'], ['국어'], ['국어'], ['국어'], []] }),
      'ssam:class:subjects': JSON.stringify([{ id: 'sc', name: '과학', start: '2026-03-02', offset: 0, lessons: old }]) });
    await goProgress();
    const J = '국어 교육과정 연간지도계획\n' + ['3.2~3.5', '3.8~3.12', '3.15~3.19'].flatMap((p, w) => [1, 2, 3, 4].map(k => `${w + 1} | ${p} | 1. 시 | 주제 ${w * 4 + k} | ${k}/4 | 5 |`)).join('\n');
    await page.setInputFiles(`${C} #clsJindoFile`, { name: '국어 진도표.txt', mimeType: 'text/plain', buffer: Buffer.from(J) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert((await page.textContent('#sheetRoot .sheet')).includes('2027학년도'), '고르기 시트: ' + await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForTimeout(300);
    assert((await subjects()).find(x => x.name === '국어').lessons[0].from === '2027-03-02', '넣은 날짜');
    await page.click(`${C} [data-c="toYears"]`);
    await page.waitForSelector(`${S} [data-set="newYear"]`);
    await page.click(`${S} [data-set="newYear"]`);
    await page.waitForSelector('#sheetRoot #yrClassToo');
    await page.check('#sheetRoot #yrClassToo');
    await Promise.all([page.waitForEvent('load'), page.click('#sheetRoot #yrNewOk')]);
    await page.waitForTimeout(500);
    const subs = await subjects();
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:years')).current) === 2027, '학년도');
    assert(subs.find(x => x.name === '국어').lessons.map(l => l.from).filter((d, i, a) => a.indexOf(d) === i).join() === '2027-03-02,2027-03-08,2027-03-15', '국어: ' + JSON.stringify(subs));
    assert(subs.find(x => x.name === '과학').lessons.map(l => l.from).join() === '2027-03-02,2027-03-08', '과학: ' + JSON.stringify(subs));
    // 새 학년도 첫 주 3/3(수): 3/2(화)에 1차시를 했어야 함 → 진도 차이 -1 (예전에는 -20처럼 모두 밀림)
    await page.clock.setFixedTime(new Date('2027-03-03T09:00:00'));
    await page.reload(); await page.waitForTimeout(400);
    await goProgress();
    const row = (await page.textContent(`${C} table.cls-sum tbody`)).replace(/\s+/g, ' ');
    assert(/국어 12 0 12 −1/.test(row), '진도표·시수: ' + row);
  }],
  ['[class-sem2-2] 「교과 추가 › AI로 차시 뽑기」로 뽑은 2학기 진도표를 고치기 시트에서 저장: 1학기 체크를 세지 않아 다음 차시 1', async () => {
    await fresh('2026-08-25T09:00:00', SEM1);
    answer = SEM2_AI;
    await goProgress();
    await page.click(`${C} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '국어');
    await page.fill('#sheetRoot #clsNewText', '2학기 국어 진도표 (PDF에서 붙여 넣음)');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.waitForSelector('#sheetRoot [data-c="saveSub"]');
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForTimeout(300);
    assert(await page.inputValue(`${C} [data-next]`) === '1', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    const s = (await subjects())[0];
    assert(s.since === '2026-08-24' && s.lessons[0].from === '2026-08-24', JSON.stringify(s).slice(0, 200));
    const today = await todayText();
    assert(today.includes('2학기 1') && !today.includes('모두 마쳤어요'), '오늘 수업: ' + today);
  }],
  ['[class-sem2-2] AI 시트를 닫고 기다린 2학기 진도표, 기간 칸 없이 주만 있는 진도표 파일도 같음', async () => {
    await fresh('2026-08-25T09:00:00', SEM1);
    answer = SEM2_AI;
    let release; hold = new Promise(r => { release = r; });
    await goProgress();
    await page.click(`${C} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '국어');
    await page.fill('#sheetRoot #clsNewText', '2학기 국어 진도표');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.waitForTimeout(200);
    await page.click('#sheetRoot [data-close]');
    release(); hold = null;
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:class:subjects'))[0].lessons[0] || {}).title === '2학기 1');
    await page.waitForTimeout(200);
    assert((await subjects())[0].since === '2026-08-24', '닫은 시트: ' + JSON.stringify((await subjects())[0]).slice(0, 120));
    assert(await page.inputValue(`${C} [data-next]`) === '1', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    // 주만 있는 진도표 파일
    await fresh('2026-08-25T09:00:00', SEM1);
    await goProgress();
    const J = '국어 교육과정 연간지도계획\n' + Array.from({ length: 20 }, (_, i) => `${i + 1} | 1. 단원 | 2학기 ${i + 1} | 1/1 | 5 |`).join('\n');
    await page.setInputFiles(`${C} #clsJindoFile`, { name: '국어 2학기.txt', mimeType: 'text/plain', buffer: Buffer.from(J) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert((await page.textContent('#sheetRoot .sheet')).includes('8/25 앞 체크 기록은 이 진도표에 세지 않아요'), '안내: ' + await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForTimeout(300);
    assert(await page.inputValue(`${C} [data-next]`) === '1', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    assert((await todayText()).includes('2학기 1'), '오늘 수업');
  }],
  ['[class-setup-rerender-3] 「교과 추가」 AI를 기다리며 시간표 칸에 치는 중 AI가 끝나도 칸·포커스·한글 조합이 그대로, 교과 목록은 바뀜', async () => {
    await fresh('2026-11-05T09:00:00');
    answer = JSON.stringify({ lessons: [{ week: 1, period: '9.7~9.11', unit: '1. 단원', title: '주제 1', pages: '', memo: '' }, { week: 1, period: '9.7~9.11', unit: '1. 단원', title: '주제 2', pages: '', memo: '' }] });
    let release; hold = new Promise(r => { release = r; });
    await goProgress();
    await page.click(`${C} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '도덕');
    await page.fill('#sheetRoot #clsNewText', '도덕 진도표 글');
    await page.click('#sheetRoot [data-c="lessonAi"]');
    await page.waitForTimeout(200);
    await page.click('#sheetRoot [data-close]');
    await page.click(`${C} [data-cell="0-1"]`);
    await page.keyboard.type('국어');
    const cell = `${C} [data-cell="0-2"]`;
    await page.click(cell);
    await page.keyboard.type('수학');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '과', selectionStart: 1, selectionEnd: 1 });
    const el = await page.$(cell);
    release(); hold = null;
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:class:subjects') || '[]')).length === 1);
    await page.waitForTimeout(300);
    const same = await page.evaluate(([e, s]) => e === document.querySelector(s) && document.activeElement === e, [el, cell]);
    assert(same, '칸이 다시 만들어지거나 포커스를 잃음: ' + await page.evaluate(() => document.activeElement && (document.activeElement.dataset.cell || document.activeElement.tagName)));
    assert(await page.inputValue(`${C} [data-cell="0-1"]`) === '국어', '0-1: ' + await page.inputValue(`${C} [data-cell="0-1"]`));
    assert((await page.textContent(`${C} .cls-subs`)).includes('도덕'), '교과 목록');
    await cdp.send('Input.insertText', { text: '과' });
    assert(await page.inputValue(cell) === '수학과', '글: ' + await page.inputValue(cell));
    await page.press(cell, 'Tab');
    await page.waitForTimeout(200);
    const row0 = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:timetable')).cells[0].slice(0, 2));
    assert(row0.join() === '국어,수학과', '저장: ' + row0);
  }],
  ['오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
