// 연수 메뉴(스펙 2026-11-18-training-design): 내 필수연수(기본 목록·고치기·이수증 넣기·못 맞춘 이수증·상태), 연수 현황판(명단·연수·칸 누르기·이수증 한꺼번에·
// 연수 시트 반려·엑셀·독려 쪽지), 공문 처리 [내 필수연수에 넣기], 오늘 화면 「이어서 하기」, AI를 부르지 않음. 예시 이름은 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-11-18T09:00:00'));
let aiCalls = 0;
await page.route(/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.upstage\.ai/, r => { aiCalls++; r.abort(); });
page.on('dialog', d => d.accept());
const V = 'section[data-menu="training"]';
const mine = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:training:mine') || '[]'));
const board = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:training:board') || 'null'));
const file = (name, text = '') => ({ name, mimeType: /\.txt$/.test(name) ? 'text/plain' : 'image/jpeg', buffer: Buffer.from(text || 'x') });
await page.goto(url);
await page.waitForTimeout(400);

await run('fix1118-training', [
  ['내 필수연수: 빈 화면 → 기본 목록 넣기', async () => {
    await enter(page, 'training', 'mine');
    await page.waitForSelector(`${V} .tr-page`);
    assert((await page.textContent(V)).includes('아직 연수가 없어요'), '빈 화면');
    assert(!(await page.textContent(V)).includes('곧 만들어요'), '자리만 있던 화면');
    await page.click(`${V} .empty [data-tr="defaults"]`);
    await page.waitForSelector(`${V} .tr-item`);
    assert((await page.$$(`${V} .tr-item`)).length === 11, '11개');
    assert((await page.textContent(`${V} .tr-sum`)).includes('11개 중 0개 이수'), await page.textContent(`${V} .tr-sum`));
  }],
  ['고치기: 기한·시간 → D-day, 학사일정에 연수 일정', async () => {
    const id = (await mine()).find(x => x.title === '청렴교육(부패방지)').id;
    await page.click(`${V} [data-tr="edit"][data-id="${id}"]`);
    await page.fill('#trDue', '2026-11-20');
    await page.click('#trItemOk');
    await page.waitForSelector('#trItemSheet', { state: 'detached' });
    const li = `${V} [data-tr-item="${id}"]`;
    assert((await page.textContent(li)).includes('D-2'), await page.textContent(li));
    const cal = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:calendar') || '[]'));
    assert(cal.some(e => e.source === 'training' && e.title === '[연수] 청렴교육(부패방지) 이수 기한' && e.date === '2026-11-20'), JSON.stringify(cal));
  }],
  ['이수증 넣기: 글을 읽어 연수·이수일·시간(AI 없이), 사진은 고르기', async () => {
    await page.setInputFiles(`${V} #trMineFiles`, [file('scan01.txt', '이 수 증\n성 명: 김하늘\n과정명: 청렴교육 — 공직자 부패방지\n이수일: 2026. 11. 2.\n이수시간: 2시간'), file('IMG_0042.jpg')]);
    await page.waitForSelector(`${V} .tr-pend`);
    const x = (await mine()).find(y => y.title === '청렴교육(부패방지)');
    assert(x.status === 'done' && x.doneDate === '2026-11-02' && x.hours === 2 && x.cert === 'scan01.txt', JSON.stringify(x));
    assert(!(await page.textContent(`${V} [data-tr-item="${x.id}"]`)).includes('D-2'), '이수한 연수에 D-day');
    const cal = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:calendar') || '[]'));
    assert(!cal.some(e => e.source === 'training'), '이수하면 학사일정에서 뺌');
    // 못 맞춘 사진 이수증 → 연수 고르기
    const y = (await mine()).find(z => z.title === '학교폭력 예방교육');
    await page.selectOption(`${V} [data-tr-pick="0"]`, y.id);
    await page.click(`${V} [data-tr="pendPut"][data-i="0"]`);
    await page.waitForSelector(`${V} .tr-pend`, { state: 'detached' });
    assert((await mine()).find(z => z.id === y.id).cert === 'IMG_0042.jpg', '고른 연수에');
    assert((await page.textContent(`${V} .tr-sum`)).includes('11개 중 2개 이수 · 이수 시간 2시간'), await page.textContent(`${V} .tr-sum`));
  }],
  ['상태: 제출함 → 확인 완료, 반려(사유)', async () => {
    const x = (await mine()).find(y => y.title === '청렴교육(부패방지)');
    await page.click(`${V} [data-tr="st"][data-st="sent"][data-id="${x.id}"]`);
    await page.click(`${V} [data-tr="st"][data-st="ok"][data-id="${x.id}"]`);
    assert((await mine()).find(y => y.id === x.id).status === 'ok', '확인 완료');
    const z = (await mine()).find(y => y.title === '학교폭력 예방교육');
    await page.click(`${V} [data-tr="st"][data-st="sent"][data-id="${z.id}"]`);
    await page.click(`${V} [data-tr="back"][data-id="${z.id}"]`);
    await page.fill('#trBackNote', '이수증이 흐려요');
    await page.click('#trBackOk');
    await page.waitForSelector('#trBackSheet', { state: 'detached' });
    assert((await page.textContent(`${V} [data-tr-item="${z.id}"]`)).includes('반려: 이수증이 흐려요'), '반려 사유');
  }],
  ['공문 처리: 연수 공문 → [내 필수연수에 넣기]', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gmT1', name: 'a.hwpx', title: '2026학년도 교직원 아동학대 예방 및 신고의무자 교육 실시 안내',
      summary: '11월 27일까지 온라인으로 이수하고 이수증을 내기', due: '2026-11-27', tasks: [{ text: '이수증 제출', due: '2026-11-27' }], kinds: [], text: '공문 글', at: 1 }])));
    await enter(page, 'etc', 'gongmun');
    const S = 'section[data-menu="etc"] [data-gm-id="gmT1"]';
    await page.waitForSelector(`${S} [data-gm-train="mine"]`);
    await page.click(`${S} [data-gm-train="mine"]`);
    await page.waitForSelector(`${V} .tr-page`);
    const x = (await mine()).filter(y => y.from === 'gongmun:gmT1');
    assert(x.length === 1 && x[0].due === '2026-11-27', JSON.stringify(x));
    assert((await mine()).filter(y => /아동학대/.test(y.title)).length === 1, '기본 목록의 같은 연수와 겹침');
  }],
  ['공문 처리: 이미 넣은 공문은 「보기」, 연수 공문 아니면 단추 없음', async () => {
    // 기본 목록의 「아동학대 예방 및 신고의무자 교육」이 있어 그 줄로 봄
    await enter(page, 'etc', 'gongmun');
    const S = 'section[data-menu="etc"] [data-gm-id="gmT1"]';
    await page.waitForSelector(`${S} [data-gm-train="mine"]`);
    await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('ssam:gongmun:list')); l.push({ id: 'gmX', name: 'b.hwpx', title: '과학의 날 행사 참가 신청', summary: '참가 학생 조사', tasks: [], kinds: [], text: '글', at: 2 }); localStorage.setItem('ssam:gongmun:list', JSON.stringify(l)); });
    await enter(page, 'training', 'mine'); await enter(page, 'etc', 'gongmun');
    await page.waitForSelector('section[data-menu="etc"] [data-gm-id="gmX"]');
    assert(!(await page.$('section[data-menu="etc"] [data-gm-id="gmX"] [data-gm-train]')), '연수 공문이 아닌데 단추');
  }],
  ['연수 현황판: 명단 붙여 넣기·연수 더하기', async () => {
    await enter(page, 'training', 'board');
    await page.waitForSelector(`${V} .tr-page`);
    assert((await page.textContent(V)).includes('먼저 교직원 명단을 넣어 주세요'), '빈 화면');
    await page.click(`${V} .empty [data-tr="staff"]`);
    await page.fill('#trStaffText', '이름\t부서\n김하늘\t교무부\n이바다\t3학년\n한가람 선생님\t행정실\n박솔빛');
    await page.click('#trStaffAdd');
    await page.waitForSelector('#trStaffSheet', { state: 'detached' });
    assert((await board()).staff.map(s => s.name).join(',') === '김하늘,이바다,한가람,박솔빛', JSON.stringify((await board()).staff));
    await page.click(`${V} [data-tr="addCourse"]`);
    await page.fill('#trCTitle', '성희롱·성폭력 예방교육');
    await page.fill('#trCDue', '2026-11-20');
    await page.click('#trCOk');
    await page.click(`${V} [data-tr="addCourse"]`);
    await page.fill('#trCTitle', '청렴교육');
    await page.click('#trCOk');
    await page.waitForSelector(`${V} .tr-table`);
    assert((await board()).courses.length === 2, '연수 둘');
  }],
  ['칸 누르기: 미제출 → 제출 → 확인 → 미제출', async () => {
    const b = await board(), c = b.courses[0].id, s = b.staff[0].id, cell = `${V} [data-tr-cell="${c}|${s}"]`;
    await page.click(cell); assert((await page.textContent(cell)).trim() === '제출', '제출');
    await page.click(cell); assert((await page.textContent(cell)).trim() === '확인', '확인');
    await page.click(cell); assert((await page.textContent(cell)).trim() === '미제출', '미제출');
    await page.click(cell);
  }],
  ['이수증 한꺼번에: 파일 이름에서 사람·연수, 못 맞춘 것은 고르기', async () => {
    await page.setInputFiles(`${V} #trBoardFiles`, [file('이바다_성희롱예방 이수증.jpg'), file('한가람 청렴 이수증.jpg'), file('scan_003.jpg'),
      file('cert.txt', '이수증\n성명: 박솔빛\n과정: 2026 성폭력 예방교육\n이수일 2026.11.10')]);
    await page.waitForSelector(`${V} .tr-pend`);
    const b = await board(), id = n => b.staff.find(s => s.name === n).id, [c1, c2] = b.courses.map(c => c.id);
    assert(b.marks[c1][id('이바다')].s === 'sent' && b.marks[c1][id('이바다')].file === '이바다_성희롱예방 이수증.jpg', JSON.stringify(b.marks));
    assert(b.marks[c2][id('한가람')].s === 'sent', '청렴');
    assert(b.marks[c1][id('박솔빛')].s === 'sent', '이수증 글에서 이름·연수');
    await page.selectOption(`${V} [data-tr-psid="0"]`, id('김하늘'));
    await page.selectOption(`${V} [data-tr-pcid="0"]`, c2);
    await page.click(`${V} [data-tr="bpPut"][data-i="0"]`);
    await page.waitForSelector(`${V} .tr-pend`, { state: 'detached' });
    assert((await board()).marks[c2][id('김하늘')].file === 'scan_003.jpg', '고른 칸에');
    assert((await page.textContent(`${V} [data-tr-course="${c1}"]`)).includes('제출·확인 3/4명 (75%) · 미제출 1명'), await page.textContent(`${V} [data-tr-course="${c1}"]`));
  }],
  ['연수 시트: 반려(사유)·모두 확인·미제출 명단 복사', async () => {
    const b = await board(), c1 = b.courses[0].id, id = n => b.staff.find(s => s.name === n).id;
    await page.click(`${V} [data-tr-course="${c1}"] [data-tr="course"]`);
    await page.waitForSelector('#trCourseSheet');
    await page.selectOption(`#trCourseSheet [data-tr-cs="${id('박솔빛')}"]`, 'back');
    await page.fill(`#trCourseSheet [data-tr-csn="${id('박솔빛')}"]`, '다른 연수 이수증');
    await page.click('#trCsAllOk');
    await page.click('#trCsMiss');
    await page.waitForTimeout(150);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip === '한가람', clip);
    await page.click('#trCsOk');
    await page.waitForSelector('#trCourseSheet', { state: 'detached' });
    const m = (await board()).marks[c1];
    assert(m[id('박솔빛')].s === 'back' && m[id('박솔빛')].note === '다른 연수 이수증' && m[id('이바다')].s === 'ok' && m[id('한가람')] === undefined, JSON.stringify(m));
    assert((await page.textContent(`${V} [data-tr-course="${c1}"]`)).includes('반려 1명'), '반려 수');
  }],
  ['엑셀 내려받기·독려 쪽지(이름 없음)', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-tr="csv"]`)]);
    const body = readFileSync(await dl.path()).toString('utf8');
    assert(body.includes('이름,구분,부서,성희롱·성폭력 예방교육(기한 2026-11-20),청렴교육') && body.includes('박솔빛,,,반려(다른 연수 이수증)') && body.includes('이수율,,,50%,50%') && body.includes('한가람,직원,행정실'), JSON.stringify(body));
    const c1 = (await board()).courses[0].id;
    await page.click(`${V} [data-tr-course="${c1}"] [data-tr="nudge"]`);
    const txt = await page.inputValue('#trNudgeText');
    assert(txt.startsWith('[제출 안내] 성희롱·성폭력 예방교육 이수증 제출 안내') && txt.includes('□ 기한: 2026. 11. 20.(금)까지') && !/김하늘|박솔빛/.test(txt), txt);
    await page.click('#trNudgeCopy');
    await page.click('#trNudge [data-close], .sheet [data-close]').catch(() => {});
  }],
  ['오늘 화면 「이어서 하기」에 연수 줄, 누르면 연수 메뉴', async () => {
    await page.keyboard.press('Escape').catch(() => {});
    await page.click('nav.app-side [data-menu-go="home"]');
    await page.waitForFunction(() => /연수 현황 「성희롱·성폭력 예방교육」 미제출 2명|필수연수 「/.test(document.querySelector('section[data-menu="home"]').textContent));
    const txt = await page.textContent('section[data-menu="home"]');
    assert(txt.includes('필수연수 「아동학대 예방 및 신고의무자 교육」') || txt.includes('필수연수 「'), txt.slice(0, 300));
  }],
  ['좁은 화면(360px) 가로 스크롤 없음', async () => {
    await enter(page, 'training', 'board');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['AI를 부르지 않음·페이지 오류 없음', async () => {
    assert(aiCalls === 0, `AI ${aiCalls}번`);
    assert(errors.length === 0, errors.join(' | '));
  }]
]);
await t.close();
