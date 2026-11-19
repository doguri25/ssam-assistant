// 학년말 마감 도우미(오늘 화면 카드 12~2월·설정 › 학년도·채팅)·교내 자율연수(안내 쪽지·출석 서명부·모두 참석·결과 보고)·현황판 내보내기/가져오기·
// 쪽지 회신 기한 → 오늘 화면 「이어서 하기」 (스펙 2026-11-19-yearend-design). 예시 이름은 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, enter, mockClaude } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-12-10T09:00:00'));
await mockClaude(page, async () => '{}');
page.on('dialog', d => d.accept());
const V = 'section[data-menu="training"]', H = 'section[data-menu="home"]';
const board = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:training:board') || 'null'));
const dec = new TextDecoder();
const docText = async dl => { const f = await unzip(new Uint8Array(readFileSync(await dl.path()))); return [...f.entries()].filter(([n]) => /section\d*\.xml$/.test(n)).map(([, v]) => dec.decode(v)).join(''); };
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => {
  localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'g1', name: 'a', title: '겨울방학 계획 제출', due: '2026-12-20', tasks: [], kinds: [], text: '글', at: 1 }]));
  localStorage.setItem('ssam:training:board', JSON.stringify({ staff: [{ id: 'a', name: '김하늘', dept: '3학년' }, { id: 'b', name: '이바다', dept: '보건교사' }, { id: 'c', name: '한가람', dept: '행정실' }], courses: [], marks: {} }));
  localStorage.setItem('ssam:msg:list', JSON.stringify([{ id: 'm1', at: Date.now(), title: '[제출 안내] 방과후 수요 조사', kind: 'submit', m: { kind: 'submit', title: '방과후 수요 조사', apply: { due: '2026-12-12' } }, len: 'base', attach: [], body: '본문' }]));
});

await run('fix1119-yearend', [
  ['오늘 화면(12월): 학년말 마감 카드 → 점검표(공문·인수인계서 등), [했어요]로 표시', async () => {
    await enter(page, 'home');
    await page.waitForSelector(`${H} .hm-ye`);
    await page.waitForFunction(() => /\d+ \/ \d+ 다 됐어요/.test(document.querySelector('.hm-ye').textContent));
    await page.click(`${H} .hm-ye [data-ye-open]`);
    await page.waitForSelector('#yeSheet .ye-row');
    const rows = await page.$$eval('#yeSheet .ye-row', l => l.map(x => x.dataset.yeRow));
    assert(rows.join(',') === 'writers,check,evals,progress,camp,training,budget,gongmun,handover,backup,newyear', rows.join(','));
    assert((await page.textContent('#yeSheet [data-ye-row="gongmun"]')).includes('다 하지 않은 공문 1개'), '공문 줄');
    const before = await page.textContent('#yeSheet h3');
    await page.click('#yeSheet [data-ye-mark="handover"]');
    await page.waitForFunction(b => document.querySelector('#yeSheet h3').textContent !== b, before);
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:yearend:done')).includes('handover')), '저장');
    assert((await page.getAttribute('#yeSheet [data-ye-row="handover"]', 'class')).includes('ye-done'), '다 됨 표시');
  }],
  ['[가기]: 그 화면으로(공문 처리)', async () => {
    await page.click('#yeSheet [data-ye-go="gongmun"]');
    await page.waitForSelector('#yeSheet', { state: 'detached' });
    const n = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav')));
    assert(n.menu === 'etc' && n.tab === 'gongmun', JSON.stringify(n));
  }],
  ['설정 › 학년도에도 [학년말 마감 도우미]', async () => {
    await enter(page, 'settings', 'years');
    await page.click('section[data-menu="settings"] [data-ye-open]');
    await page.waitForSelector('#yeSheet .ye-row');
    await page.click('#yeSheet [data-close]');
  }],
  ['쪽지 회신 기한이 오늘 화면 「이어서 하기」에', async () => {
    await enter(page, 'home');
    await page.waitForFunction(() => document.querySelector('section[data-menu="home"]').textContent.includes('쪽지 「방과후 수요 조사」 신청·회신 마감'));
  }],
  ['교내 자율연수: 연수 더하기(일시·장소·강사·시간) → 안내 쪽지·출석 서명부', async () => {
    await enter(page, 'training', 'board');
    await page.click(`${V} [data-tr="addCourse"]`);
    await page.fill('#trCTitle', '학교폭력 사안 처리 연수');
    await page.check('#trCourseAdd [data-tr-tg][value="교원"]');
    await page.check('#trCourseAdd [data-tr-in]');
    await page.fill('#trCourseAdd [data-tr-inf="date"]', '2026-12-16');
    await page.fill('#trCourseAdd [data-tr-inf="time"]', '15:00~16:30');
    await page.fill('#trCourseAdd [data-tr-inf="place"]', '시청각실');
    await page.fill('#trCourseAdd [data-tr-inf="lecturer"]', '새싹교육지원청 장학사');
    await page.fill('#trCourseAdd [data-tr-inf="hours"]', '2');
    await page.click('#trCOk');
    await page.waitForSelector(`${V} [data-tr="inNotice"]`);
    const c = (await board()).courses[0];
    assert(c.inhouse && c.inhouse.place === '시청각실' && c.inhouse.hours === 2 && c.target.join() === '교원', JSON.stringify(c));
    await page.click(`${V} [data-tr="inNotice"]`);
    const n = await page.inputValue('#trInNoticeText');
    assert(n.startsWith('[연수 안내] 학교폭력 사안 처리 연수') && n.includes('□ 장소: 시청각실') && n.includes('□ 대상: 교원'), n);
    await page.click('#trInNotice [data-close], #sheetRoot [data-close]').catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForSelector('#trInNotice', { state: 'detached' }).catch(() => {});
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-tr="inSign"]`)]);
    const x = await docText(dl);
    assert(x.includes('출석 서명부') && x.includes('김하늘') && x.includes('이바다') && !x.includes('한가람'), '서명부(대상 교원만)');
  }],
  ['모두 참석으로 → 빠진 사람만 고치기 → 결과 보고', async () => {
    const cid = (await board()).courses[0].id;
    await page.click(`${V} [data-tr-course="${cid}"] [data-tr="course"]`);
    await page.click('#trCsAllIn');
    await page.waitForFunction(id => { const b = JSON.parse(localStorage.getItem('ssam:training:board')); return b.marks[id] && b.marks[id].a && b.marks[id].a.s === 'ok'; }, cid);
    await page.waitForSelector('#trCourseSheet');
    await page.selectOption('#trCourseSheet [data-tr-cs="b"]', '');
    await page.click('#trCsOk');
    await page.waitForSelector('#trCourseSheet', { state: 'detached' });
    const m = (await board()).marks[cid];
    assert(m.a.s === 'ok' && m.a.date === '2026-12-16' && !m.b, JSON.stringify(m));
    await page.click(`${V} [data-tr-course="${cid}"] [data-tr="inReport"]`);
    await page.fill('#trInSum', '사안 처리 절차 안내\n사례 나누기');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#trInRepGo')]);
    const x = await docText(dl);
    for (const w of ['교내 자율연수(학교폭력 사안 처리 연수) 운영 결과 보고', '교원 2명 중 1명 참석(50%)', '사례 나누기', '불참: 1명', '참석(12. 16.)']) assert(x.includes(w), `${w} 없음`);
    await page.click('#trInReport [data-close]');
  }],
  ['현황판 내보내기 → 가져오기(합치기)', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-tr="share"]`)]);
    const json = readFileSync(await dl.path()).toString('utf8');
    assert(dl.suggestedFilename().endsWith('.ssam-training.json') && JSON.parse(json).kind === 'training-board', dl.suggestedFilename());
    const other = JSON.parse(json);
    other.board.staff.push({ id: 'z', name: '박솔빛', dept: '교무실무사' });
    other.board.courses.push({ id: 'zc', title: '청렴교육', due: '2026-12-20' });
    other.board.marks.zc = { z: { s: 'sent' } };
    await page.setInputFiles(`${V} #trImportFile`, [{ name: '공유.ssam-training.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) }]);
    await page.waitForSelector('#trImport');
    await page.click('#trImpMerge');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:training:board')).staff.length === 4);
    const b = await board();
    assert(b.courses.length === 2 && b.marks.zc.z.s === 'sent', JSON.stringify(b.courses.map(c => c.title)));
  }],
  ['「쌤」 채팅 「학년말 마감」 → 점검표', async () => {
    if (await page.isHidden('#chatPanel')) await page.click('#inboxFab');
    await page.fill('#chatText', '학년말 마감 도와줘'); await page.click('#chatSend');
    await page.waitForSelector('#yeSheet .ye-row');
    await page.click('#yeSheet [data-close]');
  }],
  ['좁은 화면(360px) 가로 스크롤 없음', async () => {
    await enter(page, 'training', 'board');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
