// 2026-11-04 고침(계획·학급·학년도) 화면 시험: 작년 결과 파일의 개인정보, 결과 보고 학년도, 2월 새 학년도 진도표, 2학기 진도표 안내, 주간학습안내 입력 끊김
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
  return JSON.stringify({ options: [{ label: '보완안', summary: 'x', timetable: [{ time: '09:00', activity: 'a', place: 'b' }], pros: [], staffNeed: '', budget: [] }] });
});
const P = 'section[data-menu="plan"]', C = 'section[data-menu="class"]';
const CSV = '타임스탬프,학생 이름,보호자 연락처,만족도,아쉬운 점\n2026/10/01,박서윤,010-9876-5432,5,줄이 길었어요\n2026/10/01,최도윤,010-2222-3333,4,더웠어요\n2026/10/02,김민준,010-1234-5678,3,그늘이 없었어요\n';
const csvFile = { name: '작년 만족도.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) };
const leaks = s => /박서윤|최도윤|김민준|010-\d/.test(s);
const lsLeaks = () => page.evaluate(() => Object.entries(localStorage).filter(([, v]) => /박서윤|010-9876/.test(v)).map(([k]) => k));
const fresh = async (time, init = {}) => {
  await page.clock.setFixedTime(new Date(time));
  await page.goto(url);
  await page.evaluate(init => { localStorage.clear(); localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })); for (const [k, v] of Object.entries(init)) localStorage.setItem(k, v); }, init);
  await page.reload(); await page.waitForTimeout(400);
  prompts.length = 0; hold = null; answer = null;
};
const toast = () => page.textContent('#toast');
// 가짜 AI가 그 프롬프트를 받을 때까지 기다림
const promptOf = async tag => { for (let i = 0; i < 80; i++) { const p = prompts.find(x => x.includes(tag)); if (p) return p; await page.waitForTimeout(100); } return ''; };

await run('fix1104-planclass', [
  ['[plan-privacy-1] 행사계획 「작년 설문 결과」 파일: 이름·연락처 열을 빼고 넣고 알림, 저장·구성안 프롬프트에 없음', async () => {
    await fresh('2026-11-04T09:00:00');
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
    await page.fill(`${P} #evName`, '운동회'); await page.fill(`${P} #evGrades`, '전교생'); await page.fill(`${P} #evPlace`, '운동장'); await page.fill(`${P} #evDate`, '2027-05-06');
    await page.setInputFiles(`${P} #evFile`, csvFile);
    await page.waitForFunction(s => (document.querySelector(`${s} #evLast`) || {}).value, P);
    const v = await page.inputValue(`${P} #evLast`);
    assert(!leaks(v) && v.includes('줄이 길었어요') && v.includes('만족도'), '칸: ' + v);
    assert((await toast()).includes('개인정보로 보이는 열 2개'), '알림: ' + await toast());
    await page.click(`${P} [data-e="next"]`);
    const p = await promptOf('[행사 구성안]');
    assert(p.includes('작년 설문 결과') && p.includes('그늘이 없었어요') && !leaks(p), '프롬프트: ' + p.slice(0, 300));
    assert(!(await lsLeaks()).length, '저장: ' + await lsLeaks());
  }],
  ['[plan-privacy-1] 행사계획 「작년 설문 결과」에 붙여 넣은 글: 칸을 벗어나면 전화번호 줄을 빼고 뺀 줄 수를 알림', async () => {
    await fresh('2026-11-04T09:00:00');
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="event"]');
    await page.fill(`${P} #evName`, '운동회');
    await page.fill(`${P} #evLast`, '작년 만족도 4.1점\n학부모 대표 김철수 010-5555-6666\n대기 시간이 길었음');
    await page.press(`${P} #evLast`, 'Tab');
    await page.waitForTimeout(200);
    const v = await page.inputValue(`${P} #evLast`);
    assert(!v.includes('010-5555-6666') && v.includes('대기 시간이 길었음'), '칸: ' + v);
    assert((await toast()).includes('줄 1개'), '알림: ' + await toast());
    await page.waitForTimeout(400);
    assert(!(await page.evaluate(() => localStorage.getItem('ssam:events') || '')).includes('010-5555-6666'), '저장됨');
  }],
  ['[plan-privacy-1] 연간계획 「작년 결과」 파일·붙여넣기: 이름·연락처를 빼고, 작년 평가 프롬프트에 없음', async () => {
    await fresh('2026-11-04T09:00:00');
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="year"]');
    await page.fill(`${P} [data-pk="name"]`, '체육'); await page.fill(`${P} [data-pk="goal"]`, '건강');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${P} [data-file="lastResult"]`)]);
    await fc.setFiles(csvFile);
    await page.waitForFunction(s => (document.querySelector(`${s} textarea[data-src="lastResult"]`) || {}).value, P);
    const v = await page.inputValue(`${P} textarea[data-src="lastResult"]`);
    assert(!leaks(v) && v.includes('더웠어요'), '칸: ' + v);
    assert((await toast()).includes('개인정보로 보이는 열 2개'), '알림: ' + await toast());
    // 붙여 넣어 더한 전화번호 줄도 칸을 벗어나면 빠짐
    await page.fill(`${P} textarea[data-src="lastResult"]`, v + '\n담당 최영희 010-7777-8888');
    await page.press(`${P} textarea[data-src="lastResult"]`, 'Tab');
    await page.waitForTimeout(200);
    assert(!(await page.inputValue(`${P} textarea[data-src="lastResult"]`)).includes('010-7777-8888'), '붙여넣기 전화번호');
    await page.click(`${P} [data-y="next"]`);
    const p = await promptOf('[작년 평가]');
    assert(p.includes('더웠어요') && !leaks(p) && !p.includes('010-7777'), '프롬프트: ' + p.slice(0, 300));
    assert(!(await lsLeaks()).length, '저장: ' + await lsLeaks());
  }],
  ['[report-year-1] 11월 결과 보고: 학년도는 지금 자료의 학년도(2026), 연도 없는 10월 날은 2026년', async () => {
    await fresh('2026-11-04T10:00:00');
    answer = JSON.stringify({ name: '가을 운동회', related: [], period: { start: '10.15', end: '', time: '' }, place: '운동장', target: '전교생', count: '', summary: '학년별 경기', sections: [{ h: '목적', lines: ['체력 기르기'] }], photos: [] });
    const R = `${P} .rp-box`;
    await page.click('nav.app-side [data-menu-go="plan"]'); await page.click('#menuTabs [data-tab="report"]');
    await page.waitForSelector(`${R} #rpMemo`);
    await page.fill(`${R} #rpMemo`, '10월 15일 운동장에서 가을 운동회. 전교생 참여.');
    await page.click(`${R} [data-rp="write"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} #rpBody`) || {}).value, R);
    const line = (prompts[0] || '').split('\n').find(l => l.includes('학년도')) || '';
    assert(line.includes('학년도: 2026.'), '프롬프트: ' + line);
    const cur = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:report:cur')));
    assert(cur.r.period.start === '2026-10-15', '시작: ' + cur.r.period.start);
    assert((await page.inputValue(`${R} #rpBody`)).includes('2026. 10. 15.'), '공문 일시');
  }],
  ['[class-jindo-year-1] 2월에 2027학년도를 시작한 뒤 학년도 없는 진도표·직접 쓴 교과는 2027년 날짜', async () => {
    await fresh('2027-02-16T09:00:00', { 'ssam:years': JSON.stringify({ current: 2027 }), 'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [['도덕'], ['도덕'], [], [], []] }) });
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    // 진도표 파일(학년도 글자 없음)
    const J = '도덕 교육과정 연간지도계획\n1 | 3.2~3.6 | 1. 나 | 나를 알아요 | 1/2 | 5 |\n1 | 3.2~3.6 | 1. 나 | 나를 아껴요 | 2/2 | 6 |';
    await page.setInputFiles(`${C} #clsJindoFile`, { name: '도덕 진도표.txt', mimeType: 'text/plain', buffer: Buffer.from(J) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert((await page.textContent('#sheetRoot .sheet')).includes('2027학년도'), '고르기 시트: ' + await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-close]');
    // 교과 추가 › 직접 쓰기
    await page.click(`${C} [data-c="addSub"]`);
    await page.fill('#sheetRoot #clsNewName', '도덕');
    await page.click('#sheetRoot [data-c="manual"]');
    await page.waitForSelector('#sheetRoot #clsEdBody', { state: 'attached' });
    const rows = [['1', '3.2~3.6', '도덕 1'], ['1', '3.2~3.6', '도덕 2'], ['2', '3.9~3.13', '도덕 3'], ['2', '3.9~3.13', '도덕 4']];
    for (let i = 0; i < rows.length; i++) {
      if (!(await page.locator(`#sheetRoot input[data-l="${i}-title"]`).count())) await page.click('#sheetRoot [data-c="addRow"]');
      await page.fill(`#sheetRoot input[data-l="${i}-week"]`, rows[i][0]);
      await page.fill(`#sheetRoot input[data-l="${i}-period"]`, rows[i][1]);
      await page.fill(`#sheetRoot input[data-l="${i}-title"]`, rows[i][2]);
    }
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForTimeout(300);
    const s = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects')))).find(x => x.name === '도덕');
    assert(s.lessons.map(l => l.from).join(',') === '2027-03-02,2027-03-02,2027-03-09,2027-03-09', 'froms: ' + s.lessons.map(l => l.from));
    assert(s.offset === 0, 'offset ' + s.offset);
    assert(await page.inputValue(`${C} [data-next]`) === '1', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    // 다시 고쳐 저장해도(2월 첫 주가 없어도) 같은 학년도
    await page.click(`${C} [data-c="editSub"]`);
    await page.waitForSelector('#sheetRoot #clsEdBody', { state: 'attached' });
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForTimeout(300);
    const s2 = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects')))).find(x => x.name === '도덕');
    assert(s2.lessons[0].from === '2027-03-02', '다시 저장: ' + s2.lessons[0].from);
  }],
  ['[class-period-feb-1] 일~토로 적은 첫 주 「2.28~3.6」은 그 학년도 2월: 3월 첫 주에 시작됨, 고치기 시트로 다시 저장해도 그대로', async () => {
    await fresh('2027-03-03T09:00:00', { 'ssam:years': JSON.stringify({ current: 2027 }), 'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [['과학'], ['과학'], [], [], []] }) });
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    const J = '2027학년도 1학기\n과학 교육과정 연간지도계획\n1 | 2.28~3.6 | 1. 물질 | 과학 1 | 1/4 | 5 |\n1 | 2.28~3.6 | 1. 물질 | 과학 2 | 2/4 | 6 |\n2 | 3.7~3.13 | 1. 물질 | 과학 3 | 3/4 | 7 |\n2 | 3.7~3.13 | 1. 물질 | 과학 4 | 4/4 | 8 |';
    await page.setInputFiles(`${C} #clsJindoFile`, { name: '과학 진도표.txt', mimeType: 'text/plain', buffer: Buffer.from(J) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForTimeout(300);
    const s = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects')))).find(x => x.name === '과학');
    assert(s.lessons.map(l => l.from).join(',') === '2027-02-28,2027-02-28,2027-03-07,2027-03-07', 'froms: ' + s.lessons.map(l => l.from));
    // 3/3(수): 첫 주 차시를 3/2(화)에 하나 했어야 함(3/1은 삼일절) → 넣으면 다음 차시 2 (다음 해 2월로 읽으면 시작 전이라 1)
    assert(await page.inputValue(`${C} [data-next]`) === '2', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    await page.click(`${C} [data-c="editSub"]`);
    await page.waitForSelector('#sheetRoot #clsEdBody', { state: 'attached' });
    await page.click('#sheetRoot [data-c="saveSub"]');
    await page.waitForTimeout(300);
    const s2 = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects')))).find(x => x.name === '과학');
    assert(s2.lessons.map(l => l.from).join(',') === '2027-02-28,2027-02-28,2027-03-07,2027-03-07', '다시 저장: ' + s2.lessons.map(l => l.from));
  }],
  ['[class-sem2-1] 1학기 기록이 있는 교과에 2학기 진도표를 넣으면 「그 앞 체크 기록은 세지 않아요」 안내 후 다음 차시 1', async () => {
    const lessons = Array.from({ length: 3 }, (_, i) => ({ week: i + 1, period: '', from: `2026-03-${String(2 + 7 * i).padStart(2, '0')}`, unit: '', title: `1학기 ${i + 1}`, no: '', pages: '', memo: '' }));
    await fresh('2026-08-20T09:00:00', {
      'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [[], ['국어'], [], [], []] }),
      'ssam:class:subjects': JSON.stringify([{ id: 'ko', name: '국어', start: '2026-03-02', offset: 0, total: 3, lessons }]),
      'ssam:class:log': JSON.stringify({ '2026-03-03': { 1: { subject: '국어', status: 'done' } }, '2026-03-10': { 1: { subject: '국어', status: 'done' } }, '2026-03-17': { 1: { subject: '국어', status: 'done' } } })
    });
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    const J = '2026학년도 2학기\n국어 교육과정 연간지도계획\n1 | 8.24~8.28 | 1. 시 | 2학기 첫 시간 | 1/2 | 5 |\n2 | 8.31~9.4 | 1. 시 | 2학기 둘째 시간 | 2/2 | 6 |';
    await page.setInputFiles(`${C} #clsJindoFile`, { name: '국어 2학기.txt', mimeType: 'text/plain', buffer: Buffer.from(J) });
    await page.waitForSelector('#sheetRoot [data-jpick]');
    assert((await page.textContent('#sheetRoot .sheet')).includes('8/24 앞 체크 기록은 이 진도표에 세지 않아요'), '안내: ' + await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-c="pickOk"]');
    await page.waitForTimeout(300);
    assert(await page.inputValue(`${C} [data-next]`) === '1', '다음 차시 ' + await page.inputValue(`${C} [data-next]`));
    const s = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:class:subjects'))))[0];
    assert(s.id === 'ko' && s.since === '2026-08-24' && s.lessons.length === 2, JSON.stringify(s));
    assert((await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('ssam:class:log'))).length)) === 3, '기록이 지워짐');
  }],
  ['[class-weekly-focus-1] 주간학습안내에 글을 치는 중 준비 화면의 AI가 끝나도 칸·포커스·한글 조합이 그대로', async () => {
    await fresh('2026-11-04T09:00:00', {
      'ssam:class:info': JSON.stringify({ grade: 3, room: 1 }),
      'ssam:class:timetable': JSON.stringify({ periods: 6, cells: [['국어', '수학'], ['국어'], ['국어'], ['국어'], ['국어']] })
    });
    let release; hold = new Promise(r => { release = r; });
    answer = JSON.stringify({ periods: 6, cells: [['국어', '수학', '사회', '과학', '체육', ''], ['수학', '국어', '과학', '체육', '창체', ''], ['국어', '수학', '영어', '음악', '미술', ''], ['수학', '국어', '사회', '영어', '음악', ''], ['국어', '수학', '사회', '과학', '도덕', '']] });
    await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="progress"]');
    await page.setInputFiles(`${C} #clsTtFile`, { name: '시간표.txt', mimeType: 'text/plain', buffer: Buffer.from('학년별 기초시간표\n4-1 | 월 | 화\n1 | 국어 | 수학') });
    await page.waitForSelector(`${C} [data-c="ttAi"]`);
    await page.click(`${C} [data-c="ttAi"]`);
    await page.click('#menuTabs [data-tab="weekly"]');
    const ta = `${C} textarea[data-wn="0-prep"]`;
    await page.click(ta);
    await page.keyboard.type('색연필');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '가', selectionStart: 1, selectionEnd: 1 });
    const el = await page.$(ta);
    release();
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:class:timetable')) || { cells: [[]] }).cells[0][2] === '사회');
    await page.waitForTimeout(300);
    const same = await page.evaluate(([e, s]) => e === document.querySelector(s) && document.activeElement === e, [el, ta]);
    assert(same, '칸이 다시 만들어지거나 포커스를 잃음: ' + await page.evaluate(() => document.activeElement && (document.activeElement.dataset.wn || document.activeElement.tagName)));
    await cdp.send('Input.insertText', { text: '가' });
    await page.keyboard.type(' 가위');
    assert(await page.inputValue(ta) === '색연필가 가위', '글: ' + await page.inputValue(ta));
    // 다른 학습 칸은 새 시간표대로 바뀜
    assert((await page.inputValue(`${C} textarea[data-wc="0-3"]`)).startsWith('사회'), '학습 칸: ' + await page.inputValue(`${C} textarea[data-wc="0-3"]`));
    await page.waitForTimeout(400);
    const w = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('ssam:class:weekly:')).map(([, v]) => JSON.parse(v).notes[0].prep));
    assert(w.includes('색연필가 가위'), '저장: ' + JSON.stringify(w));
  }],
  ['오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
