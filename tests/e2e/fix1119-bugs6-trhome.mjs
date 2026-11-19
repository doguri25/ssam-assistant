// 여섯 번째 버그 찾기(연수·오늘 화면·학년말 마감) 화면: 공문 [내 필수연수에 넣기]·[연수 현황판에 넣기]가 기본 목록의 같은 연수에 이음,
// 연수 이수 기한 날에 행사 날짜를 골라도 「일정과 겹쳐요」 없음, 2월에 새 학년도를 시작한 뒤에는 오늘 화면 학년말 카드 없음. 예시 이름은 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
let aiCalls = 0;
await page.route(/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.upstage\.ai/, r => { aiCalls++; r.abort(); });
page.on('dialog', d => d.accept());
await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));
await page.goto(url);
await page.waitForTimeout(300);
const DEF = ['성희롱·성폭력 예방교육', '아동학대 예방 및 신고의무자 교육', '장애인식개선 교육', '청렴교육(부패방지)', '개인정보보호 교육', '학교폭력 예방교육',
  '생명존중(자살예방) 교육', '심폐소생술 등 응급처치 교육', '직장 내 괴롭힘 예방교육', '가정폭력 예방교육', '성매매 예방교육'];
const S = 'section[data-menu="etc"] [data-gm-id="gmA"]';
const get = k => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);

await run('fix1119-bugs6-trhome', [
  ['공문 [내 필수연수에 넣기]: 「청렴교육 실시 안내」는 기본 목록 「청렴교육(부패방지)」 줄에 이음', async () => {
    await page.evaluate(DEF => {
      localStorage.setItem('ssam:training:mine', JSON.stringify(DEF.map((title, i) => ({ id: 'd' + i, title }))));
      localStorage.setItem('ssam:training:board', JSON.stringify({ staff: [{ id: 's1', name: '김하늘', dept: '교무부' }], courses: [{ id: 'c1', title: '청렴교육(부패방지)', due: '' }], marks: {} }));
      localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gmA', name: 'a.hwpx', title: '2026년 청렴교육 실시 안내', summary: '12월 4일까지 청렴교육을 이수하고 이수증 제출', due: '2026-12-04', tasks: [], kinds: [], text: '공문 글', at: 1 }]));
    }, DEF);
    await enter(page, 'etc', 'gongmun');
    await page.waitForSelector(`${S} [data-gm-train="mine"]`);
    await page.click(`${S} [data-gm-train="mine"]`);
    await page.waitForSelector('section[data-menu="training"] .tr-page');
    const mine = await get('ssam:training:mine');
    assert(mine.length === 11, `줄 ${mine.length}개`);
    const x = mine.filter(y => /청렴/.test(y.title));
    assert(x.length === 1 && x[0].title === '청렴교육(부패방지)' && x[0].due === '2026-12-04' && x[0].from === 'gongmun:gmA', JSON.stringify(x));
    assert((await page.textContent('section[data-menu="training"] .tr-sum')).includes('11개 중 0개 이수'), '요약');
  }],
  ['공문 [연수 현황판에 넣기]: 현황판 「청렴교육(부패방지)」 연수에 이음', async () => {
    await enter(page, 'etc', 'gongmun');
    await page.waitForSelector(`${S} [data-gm-train="board"]`);
    await page.click(`${S} [data-gm-train="board"]`);
    await page.waitForFunction(() => /gongmun:gmA/.test(localStorage.getItem('ssam:training:board') || ''));
    const b = await get('ssam:training:board');
    assert(b.courses.length === 1 && b.courses[0].id === 'c1' && b.courses[0].due === '2026-12-04', JSON.stringify(b.courses));
  }],
  ['연수 이수 기한 날(12/4)에 행사 날짜를 골라도 「일정과 겹쳐요」 없음', async () => {
    assert((await get('ssam:calendar') || []).some(e => e.source === 'training' && e.date === '2026-12-04'), '연수 기한 일정');
    await enter(page, 'plan', 'event');
    await page.waitForSelector('section[data-menu="plan"] [data-e="new"]');
    await page.click('section[data-menu="plan"] [data-e="new"]');
    await page.fill('#evDate', '2026-12-04');
    await page.dispatchEvent('#evDate', 'change');
    await page.waitForTimeout(200);
    assert(!(await page.$('#evDateWarn')), await page.textContent('#evDateBox'));
    await page.fill('#evDate', '2026-12-05');
    await page.dispatchEvent('#evDate', 'change');
    await page.waitForSelector('#evDateWarn');
    assert((await page.textContent('#evDateWarn')).includes('토요일'), '주말 알림은 그대로');
  }],
  ['오늘 화면 학년말 카드: 2월에 새 학년도를 시작하기 전에는 뜨고, 시작한 뒤에는 안 뜸', async () => {
    await page.clock.setFixedTime(new Date('2027-02-10T09:00:00'));
    await page.evaluate(() => {
      localStorage.setItem('ssam:years', JSON.stringify({ current: 2026 }));
      localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gmB', name: 'b.hwpx', title: '2027학년도 학교 교육계획 제출', summary: '계획 제출', due: '2027-02-20', tasks: [], kinds: [], text: '글', at: 2 }]));
      localStorage.removeItem('ssam:calendar');
    });
    await page.reload();
    await page.waitForSelector('section[data-menu="home"] .hm-ye');
    await page.click('[data-ye-open]');
    await page.waitForSelector('#yeSheet');
    assert((await page.textContent('#yeSheet [data-ye-row="newyear"]')).includes('2027학년도를 시작하세요'), '시작 전');
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => localStorage.setItem('ssam:years', JSON.stringify({ current: 2027 })));
    await page.reload();
    await page.waitForSelector('section[data-menu="home"] .hm-cards');
    await page.waitForTimeout(500);
    assert(!(await page.$('section[data-menu="home"] .hm-ye')), '새 학년도를 시작했는데 학년말 카드');
    // 설정 › 학년도에서 직접 열면 새 학년도 줄은 「시작했어요」
    await enter(page, 'settings', 'years');
    await page.waitForSelector('section[data-menu="settings"] [data-ye-open]');
    await page.click('section[data-menu="settings"] [data-ye-open]');
    await page.waitForSelector('#yeSheet');
    assert((await page.textContent('#yeSheet [data-ye-row="newyear"]')).includes('2027학년도를 시작했어요'), await page.textContent('#yeSheet [data-ye-row="newyear"]'));
  }],
  ['AI를 부르지 않음·페이지 오류 없음', async () => {
    assert(aiCalls === 0, `AI ${aiCalls}번`);
    assert(errors.length === 0, errors.join(' | '));
  }]
]);
await t.close();
