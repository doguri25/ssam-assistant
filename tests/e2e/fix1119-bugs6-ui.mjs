// 2026-11-19 여섯 번째 버그 찾기(화면 흐름): 회의록을 처음 쓰고 다시 켜도 그 회의록(둘로 늘지 않음), 연수 시간 「2시간」·못 읽는 글 알림,
// 교내 연수 [모두 참석으로]는 시트에 고친 칸을 담아 저장, 못 맞춘 이수증 줄의 고른 것이 다른 줄 [넣기] 뒤에도 그대로, 한 달 달력 기초학력 줄은 그날 출석. 예시는 지어낸 것
import { open, run, assert, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
page.on('dialog', d => d.accept().catch(() => {}));
await page.clock.setFixedTime(new Date('2026-11-19T10:00:00'));
await page.goto(url);
await page.waitForTimeout(400);
const S = 'section[data-menu="training"]';
const seedBoard = courses => page.evaluate(async cs => {
  const T = await import('./menus/training/training-model.js');
  T.saveBoard({ staff: [{ id: 's1', name: '김하늘', dept: '교무부' }, { id: 's2', name: '이바다', dept: '3학년' }, { id: 's3', name: '한가람', dept: '5학년' }], courses: cs, marks: {} });
}, courses);

await run('fix1119-bugs6-ui', [
  ['회의록: [새 회의록]을 누르지 않고 처음 쓴 회의록도 다시 켜면 그대로, 그 위에 써도 최근 회의록은 하나', async () => {
    await enter(page, 'etc', 'minutes');
    await page.fill('[data-mnf="title"]', '5학년 협의회');
    await page.click('[data-mn="addTodo"]');
    await page.fill('[data-mnt="0"][data-mnk="task"]', '체험학습 신청서 걷기');
    await page.waitForTimeout(150);
    await page.reload(); await page.waitForTimeout(500);
    await enter(page, 'etc', 'minutes');
    await page.waitForTimeout(200);
    assert((await page.inputValue('[data-mnf="title"]')) === '5학년 협의회', '다시 켠 뒤 제목 ' + await page.inputValue('[data-mnf="title"]'));
    assert((await page.inputValue('[data-mnt="0"][data-mnk="task"]')) === '체험학습 신청서 걷기', '할 일');
    await page.fill('[data-mnf="place"]', '5학년 연구실'); await page.waitForTimeout(150);
    const rec = await page.$$eval('#mnRecent li b', l => l.map(x => x.textContent));
    assert(JSON.stringify(rec) === '["5학년 협의회"]', '최근 회의록 ' + JSON.stringify(rec));
  }],
  ['연수 시간: 「2시간」은 2시간으로, 못 읽는 글은 알리고 시트를 닫지 않음', async () => {
    await enter(page, 'training', 'mine');
    await page.click(`${S} [data-tr="add"]`);
    await page.fill('#trTitle', '청렴교육'); await page.fill('#trHours', '두 시간');
    await page.click('#trItemOk'); await page.waitForTimeout(150);
    assert(!!(await page.$('#trItemSheet')), '못 읽으면 시트가 그대로');
    await page.fill('#trHours', '2시간'); await page.click('#trItemOk'); await page.waitForTimeout(150);
    assert(!(await page.$('#trItemSheet')), '시트 닫힘');
    const meta = await page.$eval(`${S} .tr-item .tr-meta`, el => el.textContent);
    assert(meta.includes('2시간'), '목록 시간 ' + meta);
  }],
  ['교내 연수 [모두 참석으로]: 시트에 고친 날짜·장소·강사도 저장, 이수일은 고친 날', async () => {
    await seedBoard([{ id: 'c1', title: '교내 수업 나눔 연수', due: '2026-12-05', target: [], inhouse: { date: '2026-12-02', time: '15:00~16:30', place: '', lecturer: '', hours: 2 } }]);
    await enter(page, 'training', 'board');
    await page.click(`${S} .tr-course [data-tr="course"]`);
    await page.fill('[data-tr-inf="date"]', '2026-12-03');
    await page.fill('[data-tr-inf="place"]', '도서실');
    await page.fill('[data-tr-inf="lecturer"]', '수석교사');
    await page.click('#trCsAllIn'); await page.waitForTimeout(300);
    assert((await page.inputValue('[data-tr-inf="place"]')) === '도서실', '다시 열린 시트 장소');
    assert((await page.inputValue('[data-tr-inf="lecturer"]')) === '수석교사', '강사');
    const b = await page.evaluate(async () => { const T = await import('./menus/training/training-model.js'); const x = T.getBoard(); return { h: x.courses[0].inhouse, m: Object.values(x.marks.c1 || {}).map(m => `${m.s}@${m.date}`) }; });
    assert(b.h.date === '2026-12-03' && b.h.place === '도서실' && b.h.lecturer === '수석교사', JSON.stringify(b.h));
    assert(JSON.stringify(b.m) === '["ok@2026-12-03","ok@2026-12-03","ok@2026-12-03"]', JSON.stringify(b.m));
    await page.evaluate(() => window.SSAM.closeSheet());
  }],
  ['못 맞춘 이수증 줄: 다 골라 두고 첫 줄 [넣기]를 눌러도 다른 줄 고른 사람·연수·고친 이수번호가 그대로(현황판·내 필수연수)', async () => {
    await seedBoard([{ id: 'c1', title: '성희롱 예방교육', due: '2026-12-01', target: [] }, { id: 'c2', title: '개인정보보호 교육', due: '2026-12-05', target: [] }]);
    await enter(page, 'training', 'board');
    await page.setInputFiles('#trBoardFiles', [1, 2, 3].map(i => ({ name: `scan_${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`이수증\n이수번호: 새싹-직무-2026-00${i}\n위 사람은 과정을 이수하였음을 증명합니다.`) })));
    await page.waitForSelector('.tr-pend-list li'); await page.waitForTimeout(200);
    for (const [i, s, c] of [[0, 's1', 'c1'], [1, 's2', 'c1'], [2, 's3', 'c2']]) { await page.selectOption(`[data-tr-psid="${i}"]`, s); await page.selectOption(`[data-tr-pcid="${i}"]`, c); }
    await page.fill('[data-tr-pcode="2"]', '새싹-직무-2026-033');
    await page.click('[data-tr="bpPut"][data-i="0"]'); await page.waitForTimeout(250);
    const rows = await page.$$eval('.tr-pend-list li', l => l.map(li => `${li.querySelector('[data-tr-psid]').value}|${li.querySelector('[data-tr-pcid]').value}|${li.querySelector('[data-tr-pcode]').value}`));
    assert(JSON.stringify(rows) === '["s2|c1|새싹-직무-2026-002","s3|c2|새싹-직무-2026-033"]', JSON.stringify(rows));
    await page.click('[data-tr="bpPut"][data-i="1"]'); await page.waitForTimeout(250);
    const code = await page.evaluate(async () => (await import('./menus/training/training-model.js')).markOf((await import('./menus/training/training-model.js')).getBoard(), 'c2', 's3').code);
    assert(code === '새싹-직무-2026-033', '고친 이수번호로 들어감 ' + code);
    await page.evaluate(async () => { const T = await import('./menus/training/training-model.js'); T.saveMine([{ title: '성희롱 예방교육', at: 1 }, { title: '개인정보보호 교육', at: 2 }]); });
    await enter(page, 'training', 'mine');
    await page.setInputFiles('#trMineFiles', [1, 2].map(i => ({ name: `photo_${i}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`이수증\n이수번호: 새싹-직무-2026-10${i}`) })));
    await page.waitForSelector('[data-tr-pick]'); await page.waitForTimeout(200);
    const ids = await page.$$eval('[data-tr-pick="0"] option', l => l.map(o => o.value).filter(Boolean));
    await page.selectOption('[data-tr-pick="0"]', ids[0]); await page.selectOption('[data-tr-pick="1"]', ids[1]);
    await page.click('[data-tr="pendPut"][data-i="0"]'); await page.waitForTimeout(250);
    const left = await page.$$eval('[data-tr-pick]', l => l.map(s => s.value));
    assert(JSON.stringify(left) === JSON.stringify([ids[1]]), '남은 줄 고른 연수 ' + JSON.stringify(left));
  }],
  ['한 달 달력: 지난·다가올 날의 기초학력 수업 줄을 누르면 그날 출석 칸(탭에 그냥 들어가면 오늘)', async () => {
    await page.evaluate(async () => {
      const M = await import('./menus/class/camp-model.js');
      const c = M.newCamp({ name: '3학년 국어 기초학력', students: [M.newStudent({ name: '김하늘' }), M.newStudent({ name: '이바다' })],
        sessions: ['2026-11-16', '2026-11-18', '2026-11-19', '2026-11-23'].map(d => M.newSession({ date: d, start: '14:00', end: '14:40', subject: '국어' })) });
      M.saveCamp(c); M.setCurrentCamp(c.id);
    });
    for (const [d, want] of [['2026-11-16', '11. 16.(월)'], ['2026-11-23', '11. 23.(월)']]) {
      await page.evaluate(x => import('./menus/home/month.js').then(m => m.openMonth('2026-11', x)), d);
      await page.waitForSelector('#mcDay [data-mc-go]');
      await page.click('#mcDay [data-mc-go]:has-text("기초학력")');
      await page.waitForFunction(w => (document.querySelector('.cp-att-day') || {}).textContent === w, want, { timeout: 3000 }).catch(() => {});
      const day = await page.$eval('.cp-att-day', el => el.textContent);
      assert(day === want, `${d} 줄 → ${day}`);
    }
    await enter(page, 'home'); await page.waitForTimeout(200);
    await enter(page, 'class', 'camp'); await page.waitForTimeout(300);
    const day = await page.$eval('.cp-att-day', el => el.textContent);
    assert(day === '11. 19.(목)', '탭에 들어가면 오늘 ' + day);
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
