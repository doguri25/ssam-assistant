// 기초학력 캠프 › 계획서 「지도 계획」 표 그대로 수업 일정(AI 안 부름, 요일마다 지도시간) + [차시 수로 날짜 만들기](2026-11-13 선생님 요청)
// 계획서 글은 지어낸 것(새싹초등학교·한가람)
import { open, run, assert, mockClaude, enter } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-13T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const reqs = [];
await mockClaude(page, ({ prompt }) => { reqs.push(prompt); return '{}'; });

const PLAN = Buffer.from(makeHwpx({ title: '2026 기초학력 중점학급 운영 계획', blocks: [
  { type: 'p', text: '2026 기초학력 중점학급 운영 계획' }, { type: 'p', text: '3학년 2반' },
  { type: 'p', text: '1. 운영시기: 2026. 9. 1.(화) ~ 2026. 12. 31.(목)' }, { type: 'p', text: '2. 대상: 3-2 학생 중 학습지원을 희망하는 학생' },
  { type: 'table', rows: [['수강대상', '3-2 학습지원학생 1명', '지도교사', '3-2 담임: 한가람'], ['지도기간', '2026년 9월 1일 ~ 12월 31일', '과목', '국어, 수학'],
    ['지도시간', '매주 수요일 13:40~14:20, 목요일 14:30~15:10 (학생이 가능한 시간을 활용하여 지도함)', '', '']] },
  { type: 'p', text: '지 도 계 획' },
  { type: 'table', head: true, rows: [['차시', '과목', '날짜', '학습 내용', '비고'], ['1', '국어', '9/2(수)', '받침이 있는 낱말 읽고 쓰기', ''], ['2', '수학', '9/3(목)', '세 자리 수의 덧셈과 뺄셈', ''],
    ['3', '국어', '9/9(수)', '문장 부호를 살펴 띄어 읽기', ''], ['4', '수학', '9/10(목)', '곱셈구구로 나눗셈 몫 구하기', ''], ['누계', '4차시', '', '', '']] },
  { type: 'p', text: '<양식1-수업확인서>' },
  { type: 'table', head: true, rows: [['순', '날 짜', '시 간(40분)', '교 과', '지 도 내 용', '확인(서명)'], ['1', '/', '~', '국어', '받침이 있는 낱말 읽고 쓰기', ''], ['2', '/', '~', '수학', '세 자리 수의 덧셈과 뺄셈', '']] }] }));

const C = 'section[data-menu="class"]', P = `${C} .cls-camp`;
const toast = () => page.textContent('#toast');
const waitToast = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent.includes(s), s, { timeout: 8000 });
const camp = () => page.evaluate(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); return v && (v.camps.find(c => c.id === v.current) || v.camps[0]); });
const rows = async () => (await camp()).sessions.map(s => [s.date, s.start, s.end, s.subject, s.content]);
const S = '#sheetRoot';

await page.goto(url);
await page.waitForTimeout(400);
await enter(page, 'class', 'camp');
await page.waitForSelector(`${P} .cp-page`);

await run('camp-table', [
  ['계획 파일의 지도 계획 표 → 그 표 그대로 4차시(날짜·교과·지도 내용), 시간은 요일마다 지도시간, AI를 부르지 않음', async () => {
    await page.click(`${P} [data-cp="new"]`);
    await page.setInputFiles(`${P} #cpPlanFile-info`, { name: '중점학급 운영 계획.hwpx', mimeType: 'application/octet-stream', buffer: PLAN });
    await waitToast('지도 계획 표에서 4차시를 만들었어요');
    const tx = await toast();
    assert(tx.includes('날짜·교과·지도 내용을 표 그대로') && tx.includes('수 13:40~14:20 · 목 14:30~15:10'), tx);
    assert(JSON.stringify(await rows()) === JSON.stringify([
      ['2026-09-02', '13:40', '14:20', '국어', '받침이 있는 낱말 읽고 쓰기'], ['2026-09-03', '14:30', '15:10', '수학', '세 자리 수의 덧셈과 뺄셈'],
      ['2026-09-09', '13:40', '14:20', '국어', '문장 부호를 살펴 띄어 읽기'], ['2026-09-10', '14:30', '15:10', '수학', '곱셈구구로 나눗셈 몫 구하기']]), JSON.stringify(await rows()));
    const c = await camp();
    assert(c.subjects.join() === '국어,수학' && c.target === '3학년' && c.teacher === '한가람', JSON.stringify([c.subjects, c.target, c.teacher]));
    assert(!reqs.length, 'AI를 부르지 않음: ' + reqs.length);
  }],
  ['[차시 수로 날짜 만들기]: 계획서의 요일·시간이 미리 들어 있고, 6차시면 9/17(목)까지 미리 보기', async () => {
    await page.click(`${P} [data-sec="sched"]`);
    await page.click(`${P} [data-cp="byCount"]`);
    await page.waitForSelector(`${S} #cpCOk`);
    const on = await page.$$eval(`${S} [data-cd]`, a => a.filter(x => x.checked).map(x => x.dataset.cd));
    assert(on.join() === '3,4', '수·목: ' + on);
    assert(await page.inputValue(`${S} [data-cds="4"]`) === '14:30' && await page.inputValue(`${S} [data-cde="4"]`) === '15:10', '목요일 시간');
    assert(await page.inputValue(`${S} #cpCFrom`) === '2026-09-01' && await page.inputValue(`${S} #cpCN`) === '4', '시작 날·지금 줄 수');
    await page.fill(`${S} #cpCN`, '6');
    assert((await page.textContent(`${S} #cpCPrev`)) === '9. 2.(수)부터 9. 17.(목)까지 6차시', await page.textContent(`${S} #cpCPrev`));
    await page.fill(`${S} #cpCTo`, '2026-09-10');
    assert((await page.textContent(`${S} #cpCPrev`)).includes('4차시만 들어가요(2차시 모자라요)'), await page.textContent(`${S} #cpCPrev`));
    await page.fill(`${S} #cpCTo`, '');
  }],
  ['지금 줄에 날짜 넣기: 9/9부터로 바꾸면 지도 내용은 그대로 두고 날짜·시간만, 모자란 2차시는 새 줄로', async () => {
    await page.fill(`${S} #cpCFrom`, '2026-09-09');
    await page.click(`${S} #cpCOk`);
    await page.waitForSelector(`${S} [data-ask="dates"]`);
    await page.click(`${S} [data-ask="dates"]`);
    await waitToast('지금 줄에 넣었어요');
    const r = await rows();
    assert(r.length === 6, r.length);
    assert(JSON.stringify(r.slice(0, 4)) === JSON.stringify([
      ['2026-09-09', '13:40', '14:20', '국어', '받침이 있는 낱말 읽고 쓰기'], ['2026-09-10', '14:30', '15:10', '수학', '세 자리 수의 덧셈과 뺄셈'],
      ['2026-09-16', '13:40', '14:20', '국어', '문장 부호를 살펴 띄어 읽기'], ['2026-09-17', '14:30', '15:10', '수학', '곱셈구구로 나눗셈 몫 구하기']]), JSON.stringify(r.slice(0, 4)));
    assert(JSON.stringify(r.slice(4).map(x => [x[0], x[3], x[4]])) === JSON.stringify([['2026-09-23', '국어', ''], ['2026-09-30', '수학', '']]), '9/24(목)·9/25 추석은 빼고 다음 수요일: ' + JSON.stringify(r.slice(4)));
  }],
  ['새 캠프: 요일·차시 수를 안 넣으면 안내, 월요일 끝이 시작보다 앞이면 안내, 고치면 바로 만듦(묻지 않음)', async () => {
    await page.click(`${P} [data-cp="new"]`);
    await page.click(`${P} [data-sec="sched"]`);
    await page.click(`${P} [data-cp="byCount"]`);
    await page.waitForSelector(`${S} #cpCOk`);
    await page.click(`${S} #cpCOk`);
    assert((await page.textContent(`${S} #cpCPrev`)).includes('요일을 하나 이상'), await page.textContent(`${S} #cpCPrev`));
    await page.fill(`${S} #cpCFrom`, '2026-11-16');
    await page.check(`${S} [data-cd="1"]`);
    await page.fill(`${S} [data-cds="1"]`, '15:00'); await page.fill(`${S} [data-cde="1"]`, '14:20');
    assert((await page.textContent(`${S} #cpCPrev`)).includes('월요일 끝 시각이 시작보다 뒤여야'), await page.textContent(`${S} #cpCPrev`));
    await page.fill(`${S} [data-cde="1"]`, '15:40');
    assert((await page.textContent(`${S} #cpCPrev`)).includes('차시 수를'), await page.textContent(`${S} #cpCPrev`));
    await page.fill(`${S} #cpCN`, '3'); await page.fill(`${S} #cpCSubs`, '수학');
    await page.click(`${S} #cpCOk`);
    await waitToast('3차시 날짜를 만들었어요');
    assert(JSON.stringify(await rows()) === JSON.stringify([['2026-11-16', '15:00', '15:40', '수학', ''], ['2026-11-23', '15:00', '15:40', '수학', ''], ['2026-11-30', '15:00', '15:40', '수학', '']]), JSON.stringify(await rows()));
  }],
  ['390px: [차시 수로 날짜 만들기] 시트가 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click(`${P} [data-cp="byCount"]`);
    await page.waitForSelector(`${S} #cpCOk`);
    const o = await page.$eval(`${S} .sheet`, e => [e.scrollWidth, e.clientWidth]);
    assert(o[0] <= o[1] + 1, '넘침: ' + o);
    const h = await page.$eval(`${S} [data-cd="3"]`, e => e.closest('label').getBoundingClientRect().height);
    assert(h >= 44, '요일 칸 높이 44px: ' + h);
    await page.click(`${S} [data-close]`);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['이름 칸에 커서가 있는 채로 계획 파일을 끌어다 놓아도, 다 넣으면 「계획서 읽는 중」이 멈추고 단추가 돌아옴', async () => {
    await page.click(`${P} [data-cp="new"]`);
    await page.click(`${P} [data-sec="info"]`);
    await page.focus(`${P} [data-cf="name"]`);
    await page.evaluate(b64 => {
      const btn = document.querySelector('.cls-camp [data-cp="planFile"][data-where="info"]');
      const card = btn.closest('section');
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], '운영 계획.hwpx'));
      const o = { bubbles: true, cancelable: true, dataTransfer: dt };
      card.dispatchEvent(new DragEvent('dragover', o)); card.dispatchEvent(new DragEvent('drop', o));
    }, PLAN.toString('base64'));
    await waitToast('지도 계획 표에서 4차시를');
    await page.waitForTimeout(300);
    const b = await page.$eval(`${P} [data-cp="planFile"][data-where="info"]`, e => ({ text: e.textContent.trim(), disabled: e.disabled }));
    assert(b.text === '계획 파일 넣기' && !b.disabled, '단추가 돌아옴: ' + JSON.stringify(b));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-cf="name"]')), '이름 칸 커서는 그대로');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
