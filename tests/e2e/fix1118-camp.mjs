// 학급 › 기초학력 손보기 화면(스펙 docs/superpowers/specs/2026-11-18-class-fix-design.md §C). 이름은 지어낸 것(김하늘·이바다·한가람·박솔빛).
// 빈 화면 단추 하나 · AI 키 없이 [+ 칸]으로 보고서(칸 id — 앞 칸을 비워도 제자리) · 결재란 비우기 · 이름 없는 학생 「3-2 5번」 · 날마다 지도 시간·교시 칸
// · 날마다로 바꿀 때 같은 날 줄 합치기·하루 한 칸 · 지금 줄에 날짜 넣기는 체크를 물음 · 체크가 있는 줄 지우기는 물음 · 날짜 없는 줄 안내
// · 문서 내보내기의 준비 줄·빈 문서 알림 · 사진·스캔 계획서는 보내기 전에 물음 · AI로 간 글에 성 뺀 이름 없음 · 390px
import { join } from 'node:path';
import { open, run, assert, mockClaude, enter, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-18T10:00:00'));
const C = 'section[data-menu="class"]', P = `${C} .cls-camp`, S = '#sheetRoot';
const reqs = [];
await mockClaude(page, ({ prompt, images }) => {
  reqs.push({ prompt, images });
  if (prompt.includes('[기초학력 수업 일정]')) return JSON.stringify({ from: '2027-01-11', to: '2027-01-15', weekdays: [1, 2, 3, 4, 5], start: '09:00', periods: 2, minutes: 40, rest: 10, order: ['국어', '수학'], lessons: [] });
  if (prompt.includes('[기초학력 관찰 기록]')) {
    const ids = [...prompt.matchAll(/\{"id":"(학생[A-Z])"/g)].map(m => m[1]);
    return JSON.stringify({ students: ids.map(id => ({ id, text: '받아쓰기에 자신감이 붙음.' })) });
  }
  if (prompt.includes('[기초학력 결과 보고서]')) {
    const heads = [...prompt.matchAll(/\{"head":"([^"]+)"/g)].map(m => m[1]);
    return JSON.stringify({ title: '결과 보고서', sections: heads.map(h => ({ head: h, text: `- ${h}` })) });
  }
  return '{}';
});
const camp = () => page.evaluate(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); return v && (v.camps.find(c => c.id === v.current) || v.camps[0]); });
const waitToast = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent.includes(s), s, { timeout: 8000 });
const sheet = () => page.evaluate(() => { const s = document.querySelector('#sheetRoot .sheet'); return s ? s.innerText.replace(/\s+/g, ' ') : ''; });
const secGo = k => page.click(`${P} [data-sec="${k}"]`);
const stepLine = k => page.textContent(`${P} .cp-step[data-sec="${k}"] .cp-step-line`);
const openFold = k => page.evaluate(([sel, k]) => { const d = document.querySelector(`${sel} [data-fold="${k}"]`); if (d && !d.open) d.querySelector('summary').click(); }, [P, k]);
/* 캠프 하나 넣고 기초학력 탭을 다시 엶. f(M) → 캠프 */
async function seed(src, sec = 'info') {
  await page.evaluate(async src => {
    const M = await import('./menus/class/camp-model.js');
    localStorage.removeItem('ssam:camp');
    const c = new Function('M', src)(M);
    M.saveCamp(c); M.setCurrentCamp(c.id);
  }, src);
  await enter(page, 'class', 'today');
  await enter(page, 'class', 'camp');
  await page.waitForSelector(`${P} .cp-steps`);
  await secGo(sec);
}
const DAYS = "['2026-11-16', '2026-11-17', '2026-11-18']";

await page.goto(url);
await page.waitForTimeout(400);

await run('fix1118-camp', [
  ['빈 화면: 「새 프로그램」 단추 하나만', async () => {
    await enter(page, 'class', 'camp');
    await page.waitForSelector(`${P} .cp-page`);
    const b = await page.$$eval(`${P} [data-cp="new"]`, a => a.map(x => x.textContent.trim()));
    assert(JSON.stringify(b) === '["새 프로그램"]', JSON.stringify(b));
  }],
  ['AI 키 없이 결과 보고서: [+ 칸]이 고른 꼴의 글 머리를 채우고, 앞 칸을 비워도 다음 칸 글은 제자리, 다 쓰면 ✓', async () => {
    await seed(`const c = M.newCamp({ name: '기초학력 교실' }); c.students = [M.newStudent({ name: '김하늘' })];
      c.sessions = ${DAYS}.map(d => M.newSession({ date: d, start: '13:40', end: '14:20', subject: '국어', content: '낱말' })); return c;`, 'report');
    assert((await page.textContent(`${P} .cp-sec`)).includes('[+ 칸]을 누르면 「운영 목적」 「운영 내용」 「운영 성과」 칸이 생겨'), '빈 칸 안내');
    await page.click(`${P} [data-rkind="lead"]`); await page.click(`${P} [data-rkind="select"]`);
    await page.click(`${P} [data-cp="addRSec"]`);
    assert(await page.$$eval(`${P} [data-rh]`, a => a.map(x => x.value).join('|')) === '운영 목적|운영 내용|운영 성과', '사업선택제 글 머리');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.rt === '0'), '첫 칸 글에 초점');
    assert((await camp()).report.sections.length === 3, '저장');
    // 글을 안 쓴 채 꼴을 바꾸면 그 꼴의 글 머리로
    await page.click(`${P} [data-rkind="lead"]`);
    assert(await page.$$eval(`${P} [data-rh]`, a => a.length) === 4, '이끎교사 글 머리 4개');
    await page.click(`${P} [data-rkind="select"]`);
    await page.fill(`${P} [data-rt="0"]`, '- 목적 글'); await page.fill(`${P} [data-rt="1"]`, '- 내용 글'); await page.fill(`${P} [data-rt="2"]`, '- 성과 글');
    assert(await stepLine('report') === '3칸', await stepLine('report'));
    // 둘째 칸을 비운 뒤 셋째 칸·둘째 칸에 침(예전에는 둘째 칸 글이 「운영 성과」에 들어감)
    await page.fill(`${P} [data-rt="1"]`, ''); await page.fill(`${P} [data-rh="1"]`, '');
    await page.fill(`${P} [data-rt="2"]`, '- 성과 글 고침');
    await page.fill(`${P} [data-rt="1"]`, '- 둘째 칸에 새로 씀');
    const s = (await camp()).report.sections.map(x => [x.head, x.text]);
    assert(JSON.stringify(s) === JSON.stringify([['운영 목적', '- 목적 글'], ['', '- 둘째 칸에 새로 씀'], ['운영 성과', '- 성과 글 고침']]), JSON.stringify(s));
    assert((await page.$eval(`${P} .cp-step[data-sec="report"]`, b => b.classList.contains('done'))), '결과 보고서 ✓');
    // 빈 칸 더하기: 저장되고 단계는 그대로(빈 칸은 세지 않음), 빈 칸은 묻지 않고 지움
    await page.click(`${P} [data-cp="addRSec"]`);
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.rh === '3'), '새 칸 글 머리에 초점');
    assert((await camp()).report.sections.length === 4 && await stepLine('report') === '3칸', '빈 칸도 저장');
    await page.click(`${P} [data-cp="delRSec"][data-id="${(await camp()).report.sections[3].id}"]`);
    assert((await camp()).report.sections.length === 3 && !(await sheet()), '빈 칸은 바로 지움');
    await page.click(`${P} [data-cp="delRSec"][data-id="${(await camp()).report.sections[0].id}"]`);
    assert((await sheet()).includes('이 칸에 쓴 글도 지워져요'), '글이 있는 칸은 물음');
    await page.click(`${S} [data-close]`);
    assert((await camp()).report.sections.length === 3);
  }],
  ['결재란을 비우면 비운 대로(다시 열어도, 수업 확인서에 결재란 표 없음)', async () => {
    await secGo('info'); await openFold('camp-info');
    await page.fill(`${P} [data-cf="approval"]`, '');
    assert(JSON.stringify((await camp()).approval) === '[]', JSON.stringify((await camp()).approval));
    await secGo('sched'); await secGo('info'); await openFold('camp-info');
    assert(await page.inputValue(`${P} [data-cf="approval"]`) === '', '다시 그려도 빈칸');
    assert((await page.textContent(`${P} [data-fold="camp-info"] summary`)).includes('결재란 없음'));
    const rows = await page.evaluate(async () => { const v = JSON.parse(localStorage.getItem('ssam:camp')); const D = await import('./menus/class/camp-docs.js'); return D.confirmDoc(v.camps[0]).blocks.filter(b => b.type === 'table').length; });
    assert(rows === 1, '수업 표만: ' + rows);
  }],
  ['도달하지 못한 학생에서 온 학생(이름 없음)은 「3-2 5번」(출석 머리·학생별 출석·관찰·출석부 미리 보기)', async () => {
    await seed(`const c = M.newCamp({ name: '기초학력 교실' }); c.students = [M.newStudent({ grade: 3, cls: 2, no: 5 }), M.newStudent({ grade: 3, cls: 2, no: 9 })];
      c.sessions = ['2026-11-18'].map(d => M.newSession({ date: d, start: '13:40', end: '14:20', subject: '국어', content: '낱말' })); return c;`, 'att');
    const head = await page.$$eval(`${P} .cp-att thead th`, a => a.map(x => x.textContent));
    assert(JSON.stringify(head.slice(2)) === '["3-2 5번","3-2 9번"]', JSON.stringify(head));
    assert((await page.$$eval(`${P} .cp-stats tbody th`, a => a.map(x => x.textContent))).join() === '3-2 5번,3-2 9번');
    await secGo('obs');
    assert((await page.$$eval(`${P} .cp-ob-h b`, a => a.map(x => x.textContent))).join() === '3-2 5번,3-2 9번');
    await secGo('docs');
    await page.click(`${P} .cp-doc[data-doc="attend"] summary`);
    const dh = await page.$eval(`${P} [data-doc="attend"] .cp-prev-doc table tr`, tr => [...tr.children].map(x => x.textContent));
    assert(dh.includes('3-2 5번') && dh.includes('3-2 9번'), JSON.stringify(dh));
  }],
  ['날마다 지도 시간: 09:00~12:40 한 줄은 5교시(앱 예시 10일 = 총 50시간), 「교시」 칸을 고치면 총 시간이 바로 바뀜', async () => {
    await seed(`const c = M.newCamp({ name: '겨울 교과캠프', unit: 'day' }); c.students = [M.newStudent({ name: '김하늘' })];
      c.sessions = M.expandDates('2027-01-11', '2027-01-22').map(d => M.newSession({ date: d, start: '09:00', end: '12:40', subject: '국어·수학', content: '읽기' })); return c;`, 'sched');
    assert((await page.textContent(`${P} .cp-count`)) === '10줄 · 총 50시간', await page.textContent(`${P} .cp-count`));
    assert(await stepLine('sched') === '10줄 · 총 50시간');
    assert(await page.getAttribute(`${P} [data-k="periods"]`, 'placeholder') === '5', '비우면 시각으로 셈');
    await page.fill(`${P} [data-k="periods"]`, '4');
    assert((await page.textContent(`${P} .cp-count`)) === '10줄 · 총 49시간', await page.textContent(`${P} .cp-count`));
    assert(await stepLine('sched') === '10줄 · 총 49시간');
    assert((await camp()).sessions[0].periods === 4);
    await secGo('docs');
    assert((await page.textContent(`${P} .cp-doc[data-doc="confirm"] .cls-card-h`)).includes('총 49시간'));
    // [+ 줄](날마다): 다음 수업 날(1/25 월), 같은 시간 — 같은 날 줄이 생기지 않음
    await secGo('sched');
    await page.click(`${P} [data-cp="addRow"]`);
    const last = (await camp()).sessions.at(-1);
    assert(last.date === '2027-01-25' && last.start === '09:00' && last.end === '12:40', JSON.stringify(last));
  }],
  ['교시마다 → 날마다: 같은 날 줄이 있으면 물음, 합치지 않아도 출석은 하루 한 칸(그날 줄 모두에), 단계와 남은 칸이 맞음, [같은 날 줄 합치기]', async () => {
    await seed(`const c = M.newCamp({ name: '겨울 교과캠프' }); c.students = [M.newStudent({ name: '김하늘' }), M.newStudent({ name: '이바다' })];
      for (const d of ['2026-11-18', '2026-11-19']) M.periodSlots('09:00', 5, 40, 10).forEach((sl, i) => c.sessions.push(M.newSession({ date: d, ...sl, subject: i % 2 ? '수학' : '국어', content: d.slice(-2) + '일 ' + (i + 1) + '교시' })));
      const s = M.sessionsOn(c, '2026-11-18')[0]; c.att[s.id] = Object.fromEntries(c.students.map(st => [st.id, 'O'])); return c;`, 'info');
    await openFold('camp-info');
    await page.click(`${P} [data-unit="day"]`);
    assert((await sheet()).includes('같은 날 수업 줄이 여러 개인 날이 2일'), await sheet());
    await page.click(`${S} [data-ask="keep"]`);
    const v = await camp();
    assert(v.unit === 'day' && v.sessions.length === 10, '합치지 않음');
    assert(await stepLine('att') === '1 / 2일 체크', await stepLine('att'));
    await secGo('att');
    await page.click(`${P} [data-att-view="day"]`);
    await page.click(`${P} .cp-day[data-att-date="2026-11-18"]`);
    assert(await page.$$eval(`${P} .cp-att tbody tr`, a => a.length) === 1, '하루 한 줄');
    assert((await page.textContent(`${P} .cp-att tbody th`)) === '09:00~13:00', await page.textContent(`${P} .cp-att tbody th`));
    assert((await page.textContent(`${P} .cp-att-rest`)).includes('다 체크했어요'), '단계(1/2일)와 같은 셈: ' + await page.textContent(`${P} .cp-att-rest`));
    await page.click(`${P} .cp-day[data-att-date="2026-11-19"]`);
    assert((await page.textContent(`${P} .cp-att-rest`)).includes('남은 칸 2개'), await page.textContent(`${P} .cp-att-rest`));
    const a = v.students[0].id;
    await page.click(`${P} [data-att="@2026-11-19|${a}"]`);
    const v2 = await camp();
    assert(v2.sessions.filter(s => s.date === '2026-11-19').every(s => v2.att[s.id] && v2.att[s.id][a] === 'O'), '그날 줄 모두에 ○');
    assert((await page.textContent(`${P} [data-att="@2026-11-19|${a}"]`)) === '○');
    assert((await page.textContent(`${P} .cp-stats`)).includes('2/2'), '학생별 출석은 날로: ' + await page.textContent(`${P} .cp-stats`));
    // 한눈에도 날짜마다 한 칸
    await page.click(`${P} [data-att-view="all"]`);
    assert(await page.$$eval(`${P} .cp-all tbody tr:first-child [data-att]`, x => x.length) === 2, '한눈에: 날짜마다 한 칸');
    await page.click(`${P} [data-att-view="day"]`);
    // 수업 일정: 같은 날 줄 안내 → 합치기
    await secGo('sched');
    assert((await page.textContent(`${P} .cp-same`)).includes('2일'), '같은 날 줄 안내');
    await page.click(`${P} [data-cp="mergeDays"]`);
    await page.click(`${S} [data-ask="go"]`);
    const m = await camp();
    assert(m.sessions.length === 2 && m.sessions.every(s => s.periods === 5) && !(await page.$(`${P} .cp-same`)), JSON.stringify(m.sessions.map(s => [s.date, s.periods])));
    assert((await page.textContent(`${P} .cp-count`)) === '2줄 · 총 10시간', '합쳐도 지도 시간 그대로');
    const s19 = m.sessions.find(s => s.date === '2026-11-19');
    assert(m.att[s19.id][a] === 'O' && s19.content.includes('수학: 19일 2교시'), JSON.stringify(s19));
    // 날마다 → 교시마다 → 날마다(같은 날 줄 없음): 묻지 않음
    await secGo('info'); await openFold('camp-info');
    await page.click(`${P} [data-unit="period"]`); await page.click(`${P} [data-unit="day"]`);
    assert(!(await sheet()) && (await camp()).unit === 'day', '같은 날 줄이 없으면 묻지 않음');
  }],
  ['[차시 수로 날짜 만들기] → 지금 줄에 날짜 넣기: 체크가 있는 줄의 날짜가 바뀌면 묻고, 「체크 지우기」는 그 줄만 · 「그대로 두기」는 옮김', async () => {
    const SRC = `const c = M.newCamp({ name: '기초학력 교실' }); c.students = [M.newStudent({ name: '김하늘' }), M.newStudent({ name: '이바다' })];
      c.sessions = ${DAYS}.map(d => M.newSession({ date: d, start: '13:40', end: '14:20', subject: '국어', content: '낱말 ' + d.slice(-2) }));
      c.att[c.sessions[0].id] = { [c.students[0].id]: 'O', [c.students[1].id]: 'X' }; return c;`;
    for (const how of ['clear', 'keep']) {
      await seed(SRC, 'sched');
      await page.click(`${P} [data-cp="byCount"]`);
      await page.fill('#cpCFrom', '2026-11-23'); await page.fill('#cpCN', '3');
      await page.click('#cpCOk');
      assert((await sheet()).includes('한 번 더 물어요'), await sheet());
      await page.click(`${S} [data-ask="dates"]`);
      assert((await sheet()).includes('11/16 수업에 출석 체크가 있어요(1줄)'), await sheet());
      await page.click(`${S} [data-ask="${how}"]`);
      const c = await camp(), s0 = c.sessions[0];
      assert(c.sessions.map(s => s.date).join() === '2026-11-23,2026-11-24,2026-11-25' && s0.content === '낱말 16', JSON.stringify(c.sessions.map(s => [s.date, s.content])));
      if (how === 'clear') { assert(!c.att[s0.id], '체크 지움'); await waitToast('출석 체크는 지웠어요'); }
      else { assert(Object.keys(c.att[s0.id] || {}).length === 2, '체크 그대로'); await waitToast('바뀐 날짜로 옮겼어요'); }
    }
  }],
  ['체크가 있는 일정 줄 ×: 물어보고(그만두면 그대로), 체크가 없는 줄은 바로 지움', async () => {
    const c0 = await camp(), [r0, r1] = c0.sessions;
    await page.click(`${P} [data-cp="delRow"][data-id="${r0.id}"]`);
    assert((await sheet()).includes('출석 체크 2칸도 지워져요'), await sheet());
    await page.click(`${S} [data-close]`);
    assert((await camp()).sessions.length === 3, '그만두면 그대로');
    await page.click(`${P} [data-cp="delRow"][data-id="${r0.id}"]`);
    await page.click(`${S} [data-ask="go"]`);
    const c1 = await camp();
    assert(c1.sessions.length === 2 && !c1.att[r0.id], '줄과 체크를 지움');
    await page.click(`${P} [data-cp="delRow"][data-id="${r1.id}"]`);
    assert(!(await sheet()) && (await camp()).sessions.length === 1, '체크 없는 줄은 바로');
  }],
  ['날짜 없는 줄: 하루씩·한눈에 모두 안내 + [수업 일정으로], 문서 준비의 출석부는 수업 일정으로, 날짜가 하나도 없으면 출석 화면 대신 안내', async () => {
    await seed(`const c = M.newCamp({ name: '기초학력 교실' }); c.students = [M.newStudent({ name: '김하늘' })];
      c.sessions = [M.newSession({ date: '2026-11-18', start: '13:40', end: '14:20', subject: '국어', content: '읽기' }), M.newSession({ subject: '국어', content: '쓰기' })];
      c.att[c.sessions[0].id] = { [c.students[0].id]: 'O' }; return c;`, 'att');
    await page.click(`${P} [data-att-view="day"]`);
    assert((await page.textContent(`${P} .cp-undated`)).includes('날짜가 없는 수업 1줄'), '하루씩 안내');
    const rd = await page.$eval(`${P} .cp-rd[data-ready="attend"]`, li => [li.className, li.querySelector('.cp-rd-s').textContent, li.querySelector('[data-sec]') && li.querySelector('[data-sec]').dataset.sec]);
    assert(rd[0].includes('todo') && rd[1].includes('날짜 없는 줄 1개') && rd[2] === 'sched', JSON.stringify(rd));
    await page.click(`${P} [data-att-view="all"]`);
    assert(await page.$(`${P} .cp-undated`), '한눈에 안내');
    await page.click(`${P} [data-att-view="day"]`);
    await page.click(`${P} .cp-undated [data-sec="sched"]`);
    assert(await page.getAttribute(`${P} .cp-step[data-sec="sched"]`, 'aria-current') === 'step', '수업 일정으로');
    await seed(`const c = M.newCamp({ name: '기초학력 교실' }); c.students = [M.newStudent({ name: '김하늘' })]; c.sessions = [M.newSession({ subject: '국어' })]; return c;`, 'att');
    assert((await page.textContent(`${P} .cp-sec`)).includes('날짜가 없어요') && await page.$(`${P} .cp-sec [data-sec="sched"]`), '날짜가 하나도 없음');
  }],
  ['문서 내보내기: 문서마다 준비 줄(준비됨 ✓·할 일·그 단계로), 빈 문서는 내려받기 전에 알림(그 단계로 · 그래도 내려받기)', async () => {
    await seed(`const c = M.newCamp({ name: '기초학력 교실' }); c.students = [M.newStudent({ name: '김하늘' })];
      c.sessions = ${DAYS}.map(d => M.newSession({ date: d, start: '13:40', end: '14:20', subject: '국어', content: '읽기' })); return c;`, 'docs');
    const st = await page.$$eval(`${P} .cp-doc-state`, a => a.map(x => [x.dataset.docState, x.classList.contains('ready') ? 'ready' : x.classList.contains('todo') ? 'todo' : 'none', x.textContent.replace(/\s+/g, ' ').trim()]));
    assert(st.length === 4 && st[0][1] === 'ready' && st[0][2].includes('준비됨'), JSON.stringify(st));
    assert(st[3][1] === 'none' && st[3][2].includes('아직 안 씀') && st[3][2].includes('결과 보고서 ›'), JSON.stringify(st[3]));
    // 준비된 문서는 바로 내려받음
    const [d1] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-cp="export"][data-doc="confirm"]`)]);
    assert(/수업 확인서/.test(d1.suggestedFilename()), d1.suggestedFilename());
    // 빈 결과 보고서: 묻고 → 결과 보고서로
    await page.click(`${P} [data-cp="export"][data-doc="report"]`);
    assert((await sheet()).includes('「결과 보고서」가 아직 비어 있어요'), await sheet());
    assert((await page.textContent(`${S} [data-ask="go"]`)) === '결과 보고서로 가기');
    await page.click(`${S} [data-ask="go"]`);
    assert(await page.getAttribute(`${P} .cp-step[data-sec="report"]`, 'aria-current') === 'step', '결과 보고서 단계로');
    await secGo('docs');
    await page.click(`${P} [data-cp="export"][data-doc="report"]`);
    const [d2] = await Promise.all([page.waitForEvent('download'), page.click(`${S} [data-ask="dl"]`)]);
    assert(/결과 보고서/.test(d2.suggestedFilename()), '그래도 내려받기: ' + d2.suggestedFilename());
    await page.click(`${P} .cp-doc-state[data-doc-state="observe"] [data-sec="obs"]`);
    assert(await page.getAttribute(`${P} .cp-step[data-sec="obs"]`, 'aria-current') === 'step', '할 일 단추 → 그 단계');
  }],
  ['AI 키를 넣고: 사진 계획서는 보내기 전에 묻고(그만두면 안 보냄), 「그대로 보내기」면 그림으로 감 · 스캔 PDF도 물음', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
    await page.reload(); await page.waitForTimeout(400);
    await seed(`const c = M.newCamp({ name: '' }); return c;`, 'info');
    assert((await page.textContent(`${P} .cp-plan`)).includes('사진·스캔 계획서는 이름을 가리지 못하고'), '안내');
    const n0 = reqs.length;
    await page.setInputFiles(`${P} #cpPlanFile-info`, join(FIXTURES, 'sheet-1.png'));
    await page.waitForFunction(() => (document.querySelector('#sheetRoot .sheet') || {}).innerText?.includes('AI에 보낼까요'));
    assert((await sheet()).includes('이름을 가리지 못하고 그대로 AI로 가요'), await sheet());
    await page.click(`${S} [data-close]`);
    await page.waitForTimeout(300);
    assert(reqs.length === n0, '그만두면 보내지 않음');
    await page.setInputFiles(`${P} #cpPlanFile-info`, join(FIXTURES, 'sheet-1.png'));
    await page.waitForSelector(`${S} [data-ask="go"]`);
    await page.click(`${S} [data-ask="go"]`);
    await waitToast('수업 10줄을 만들었어요');
    const r = reqs.slice(n0);
    assert(r.length === 1 && r[0].images === 1, JSON.stringify(r.map(x => x.images)));
    const n1 = reqs.length;
    await page.setInputFiles(`${P} #cpPlanFile-info`, join(FIXTURES, 'scan-only.pdf'));
    await page.waitForFunction(() => (document.querySelector('#sheetRoot .sheet') || {}).innerText?.includes('AI에 보낼까요'));
    await page.click(`${S} [data-close]`);
    await page.waitForFunction(() => { const b = document.querySelector('.cls-camp [data-cp="planFile"][data-where="info"]'); return b && !b.disabled; });
    assert(reqs.length === n1, '스캔 PDF도 묻기 전에는 보내지 않음');
  }],
  ['AI로 간 글(관찰·보고서·일정)에 성 뺀 이름·띄어 쓴 이름이 없음', async () => {
    await seed(`const c = M.newCamp({ name: '기초학력 교실', subjects: ['국어'] });
      c.students = [M.newStudent({ name: '박솔빛' }), M.newStudent({ name: '한 가람' }), M.newStudent({ name: '이바다' })];
      c.sessions = ${DAYS}.map(d => M.newSession({ date: d, start: '13:40', end: '14:20', subject: '국어', content: '솔빛이로부터 배운 낱말 읽기' }));
      c.memo = { [c.students[0].id]: '솔빛이에게서 배운 친구가 많음', [c.students[1].id]: '가람 덧셈 잘함, 가람이조차 어려워함', [c.students[2].id]: '바다마저 결석, 바다였음' };
      c.report.prompt = '솔빛이께 칭찬, 가람이랑은 달리 바다부터 발표'; return c;`, 'obs');
    const n0 = reqs.length;
    await page.click(`${P} [data-cp="obsAi"]`);
    await waitToast('관찰 및 지도 결과');
    await secGo('report');
    await page.click(`${P} [data-cp="reportAi"]`);
    await waitToast('결과 보고서를 썼어요');
    await secGo('sched');
    await page.fill(`${P} #cpSchedPrompt`, '솔빛이랑 가람이, 바다부터 1/11~1/15 평일 하루 2교시');
    await page.click(`${P} [data-cp="schedAi"]`);
    await page.click(`${S} [data-ask="add"]`);
    await waitToast('수업');
    const sent = reqs.slice(n0);
    assert(sent.length === 3, '요청 수 ' + sent.length);
    for (const r of sent) for (const n of ['솔빛', '가람', '바다', '박솔빛', '한 가람', '이바다']) assert(!r.prompt.includes(n), `「${n}」: ${r.prompt.slice(0, 160)}`);
  }],
  ['390px: 수업 일정(교시 칸)·문서 내보내기(준비 줄)가 가로로 넘치지 않음', async () => {
    await seed(`const c = M.newCamp({ name: '겨울 교과캠프', unit: 'day' }); c.students = [M.newStudent({ name: '김하늘' })];
      c.sessions = [M.newSession({ date: '2027-01-11', start: '09:00', end: '12:40' }), M.newSession({ date: '2027-01-11', start: '13:00', end: '13:40' }), M.newSession({ subject: '국어' })]; return c;`, 'sched');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const k of ['sched', 'att', 'docs']) {
      await secGo(k); await page.waitForTimeout(100);
      const r = await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth]);
      assert(r[0] <= 390 && r[1] <= r[2], `${k}: ${r}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
