// 학습 결손 찾기 → 기초학력 잇기 · 사전·사후 점수 (스펙 2026-11-13-gap-evidence §2)
// 결과 모아 보기 「도달하지 못한 학생」(기준 60% 아래 영역, 기준 바꾸기·기억), [기초학력에 넣기] 새 프로그램·있던 프로그램(같은 학생은 겹치지 않음),
// [기초학력으로 가기], 결과 보고서 단계 「사전·사후 점수」(사전 점수, 뒤에 본 단원평가로 사후 자동, 직접 고치면 앞섬·비우면 다시 자동),
// 결과 보고서 AI 글에 숫자(학생A·학생B, 이름 없음), 결과 보고서 문서 끝 표, 390px에서 가로로 넘치지 않음. 이름·학교는 모두 지어낸 것
import { open, run, assert, enter, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-10-21T10:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [];
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (prompt.startsWith('[기초학력 결과 보고서]')) return JSON.stringify({ title: '새싹초등학교 기초학력 결과 보고서', sections: [{ head: '운영 목적', text: '- 기초학력 향상' }, { head: '운영 내용', text: '- 수학 보충' }, { head: '운영 성과', text: '- (학생A) 도형 52% → 60%' }] });
  return '{}';
});
const V = 'section[data-menu="evaluate"] .unit-box', P = 'section[data-menu="class"] .cls-camp', SH = '#sheetRoot .sheet';
const camps = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:camp') || 'null'));
const gapNos = () => page.$$eval(`${V} .un-gap-i`, a => a.map(x => Number(x.dataset.gapNo)));
const gapLine = no => page.textContent(`${V} .un-gap-i[data-gap-no="${no}"]`).then(s => s.replace(/\s+/g, ' ').trim());
/* 단원평가: 수와 연산 100점 · 도형 100점(점수가 곧 점수율). 학생 4번은 결석(채점 안 함) */
const seedTest = (id, subject, unitNo, date, pts, doms = ['수와 연산', '도형']) => page.evaluate(async ({ id, subject, unitNo, date, pts, doms }) => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const C = p => ({ read: 'x', pts: p, ai: p, flag: '', why: '', ok: true, manual: false });
  const x = m.newTest({ meta: { subject, grade: 3, term: 2, unitNo, unitName: subject === '국어' ? '중요한 내용' : '나눗셈', round: 1, date }, key: { domains: doms, items: doms.map((d, i) => ({ no: i + 1, content: `${d} 문항`, domain: d, type: 'short', answer: '1', points: 100, criteria: '', pages: '' })) } });
  x.id = id; x.done = true;
  x.students = [...Object.entries(pts).map(([no, a]) => ({ no: +no, skip: false, status: 'done', good: '', cheer: '', items: Object.fromEntries(a.map((p, i) => [i + 1, C(p)])) })), { no: 4, skip: true, status: 'done', items: {} }];
  m.saveTest(x);
}, { id, subject, unitNo, date, pts, doms });

await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(async () => {
  localStorage.setItem('ssam:class:info', JSON.stringify({ grade: 3, room: 2 }));
  const M = await import('./menus/class/camp-model.js');
  const c = M.newCamp({ name: '3-2 수학 기초학력 교실', teacher: '한가람', subjects: ['수학'] });
  c.students = [M.newStudent({ grade: 3, cls: 2, no: 7, name: '이바다' })];
  c.sessions = ['2026-10-26', '2026-10-28'].map(d => M.newSession({ date: d, start: '14:00', end: '14:40', subject: '수학', content: '나눗셈 다시 보기' }));
  M.saveCamp(c); M.setCurrentCamp(c.id);
});
await seedTest('p1', '수학', 3, '2026-10-14', { 1: [90, 90], 3: [45, 90], 7: [80, 52], 9: [40, 50] });
await seedTest('p2', '수학', 4, '2026-10-16', { 1: [95, 95], 3: [45, 90], 7: [85, 52] });
await seedTest('k1', '국어', 1, '2026-10-15', { 5: [30, 90] }, ['읽기', '쓰기']);
const firstCamp = (await camps()).current;
await enter(page, 'evaluate', 'unit');
await page.click(`${V} [data-unv="results"]`);

await run('unit-gap', [
  ['결과 모아 보기 「도달하지 못한 학생」: 기준 60% 아래 영역이 있는 학생만, 낮은 차례·평가 수, 결석은 뺌', async () => {
    await page.click(`${V} [data-rv="gap"]`);
    await page.waitForSelector(`${V} .un-gap`);
    assert(await page.inputValue(`${V} #unGapCut`) === '60', '기본 기준 60');
    assert(JSON.stringify(await gapNos()) === '[3,5,7,9]', '전체 교과: ' + JSON.stringify(await gapNos()));
    assert((await gapLine(5)).includes('국어 읽기 30%'), '교과가 섞이면 교과 이름: ' + await gapLine(5));
    await page.selectOption(`${V} #unFSubject`, '수학');
    await page.waitForSelector(`${V} .un-gap`);
    assert(JSON.stringify(await gapNos()) === '[3,7,9]', '수학: ' + JSON.stringify(await gapNos()));
    const l9 = await gapLine(9), l3 = await gapLine(3);
    assert(l9.startsWith('9번 · 수와 연산 40% · 도형 50%') && l9.includes('(평가 1개)'), l9);
    assert(l3.includes('수와 연산 45%') && l3.includes('(평가 2개)') && !l3.includes('수학 수와'), l3);
    assert((await gapLine(7)).includes('도형 52%'), await gapLine(7));
  }],
  ['기준을 바꾸면 그 아래만, 단원평가 설정에 기억(40~90)', async () => {
    await page.fill(`${V} #unGapCut`, '50');
    await page.press(`${V} #unGapCut`, 'Tab');
    await page.waitForFunction(() => document.querySelectorAll('.unit-box .un-gap-i').length === 2);
    assert(JSON.stringify(await gapNos()) === '[3,9]', '50: ' + JSON.stringify(await gapNos()));
    assert((await gapLine(9)).includes('수와 연산 40%') && !(await gapLine(9)).includes('도형'), await gapLine(9));
    const saved = await page.evaluate(async () => (await import('./menus/evaluate/unit/unit-model.js')).getSet().gapCut);
    assert(saved === 50, '기억: ' + saved);
    await page.click(`${V} [data-rv="table"]`); await page.click(`${V} [data-rv="gap"]`);
    assert(await page.inputValue(`${V} #unGapCut`) === '50', '다시 열어도 50');
    await page.fill(`${V} #unGapCut`, '200'); await page.press(`${V} #unGapCut`, 'Tab');
    assert(await page.inputValue(`${V} #unGapCut`) === '90', '90까지');
    await page.fill(`${V} #unGapCut`, '60'); await page.press(`${V} #unGapCut`, 'Tab');
    await page.waitForFunction(() => document.querySelectorAll('.unit-box .un-gap-i').length === 3);
  }],
  ['고르지 않고 [기초학력에 넣기]를 누르면 알려 줌, 고르면 「n명 골랐어요」', async () => {
    await page.click(`${V} [data-gap="add"]`);
    await page.waitForFunction(() => /넣을 학생을 골라/.test(document.querySelector('#toast').textContent));
    assert(!(await page.$(SH)), '창이 뜨지 않음');
    await page.check(`${V} [data-gapno="3"]`); await page.check(`${V} [data-gapno="9"]`);
    assert((await page.textContent(`${V} #unGapN`)).includes('2명 골랐어요'), await page.textContent(`${V} #unGapN`));
  }],
  ['[기초학력에 넣기] → 새 프로그램: 학급 학년·반·번호로 학생(이름 빈칸), 사전 점수, 「이름을 넣어 주세요」', async () => {
    await page.click(`${V} [data-gap="add"]`);
    await page.waitForSelector(SH);
    assert((await page.textContent(SH)).includes('3번, 9번'), await page.textContent(SH));
    assert(await page.isChecked(`${SH} input[name="unGapTo"][value="${firstCamp}"]`), '지금 프로그램이 먼저 골라져 있음');
    assert(!(await page.isVisible(`${SH} #unGapName`)), '새 프로그램 이름 칸은 숨김');
    await page.check(`${SH} input[name="unGapTo"][value=""]`);
    assert(await page.isVisible(`${SH} #unGapName`) && await page.inputValue(`${SH} #unGapName`) === '3-2 수학 기초학력', await page.inputValue(`${SH} #unGapName`));
    await page.click(`${SH} #unGapOk`);
    await page.waitForSelector(`${SH} #unGapGo`);
    const msg = (await page.textContent(SH)).replace(/\s+/g, ' ');
    assert(msg.includes('2명을 「3-2 수학 기초학력」에 넣었어요 — 이름을 넣어 주세요'), msg);
    const all = await camps(), c = all.camps.find(x => x.id === all.current);
    assert(all.camps.length === 2 && c.name === '3-2 수학 기초학력' && c.id !== firstCamp, '새 프로그램이 지금 프로그램');
    assert(c.teacher === '한가람' && c.target === '3학년' && c.subjects.join() === '수학', '지도교사 이어서·대상·교과');
    assert(JSON.stringify(c.students.map(s => [s.grade, s.cls, s.no, s.name])) === '[[3,2,3,""],[3,2,9,""]]', JSON.stringify(c.students));
    const g3 = c.growth[c.students[0].id], g9 = c.growth[c.students[1].id];
    assert(g3.subject === '수학' && g3.area === '수와 연산' && g3.pre.pct === 45 && g3.pre.tests.map(x => x.id).join() === 'p1,p2' && g3.pre.date === '2026-10-21' && g3.post === null, JSON.stringify(g3));
    assert(g3.pre.tests[0].title === '3학년 수학 3단원 나눗셈 (1회)', g3.pre.tests[0].title);
    assert(g9.area === '수와 연산' && g9.pre.pct === 40, JSON.stringify(g9));
    await page.click(`${SH} [data-close]`);
    assert(!(await page.isChecked(`${V} [data-gapno="3"]`)), '넣은 뒤 고른 것은 비움');
  }],
  ['있던 프로그램에 넣기: 같은 학년·반·번호(7번 이바다)는 그 학생을 쓰고, 다시 넣어도 겹치지 않음', async () => {
    await page.check(`${V} [data-gapno="3"]`); await page.check(`${V} [data-gapno="7"]`);
    await page.click(`${V} [data-gap="add"]`);
    await page.waitForSelector(SH);
    await page.check(`${SH} input[name="unGapTo"][value="${firstCamp}"]`);
    await page.click(`${SH} #unGapOk`);
    await page.waitForSelector(`${SH} #unGapGo`);
    const msg = (await page.textContent(SH)).replace(/\s+/g, ' ');
    assert(msg.includes('2명을 「3-2 수학 기초학력 교실」에 넣었어요 — 이름을 넣어 주세요') && msg.includes('이미 있던 1명은 그 학생을 썼어요'), msg);
    let c = (await camps()).camps.find(x => x.id === firstCamp);
    assert(JSON.stringify(c.students.map(s => [s.no, s.name])) === '[[7,"이바다"],[3,""]]', JSON.stringify(c.students));
    assert(c.growth[c.students[0].id].area === '도형' && c.growth[c.students[0].id].pre.pct === 52, JSON.stringify(c.growth));
    await page.click(`${SH} [data-close]`);
    // 한 번 더
    await page.check(`${V} [data-gapno="3"]`);
    await page.click(`${V} [data-gap="add"]`); await page.waitForSelector(SH);
    await page.check(`${SH} input[name="unGapTo"][value="${firstCamp}"]`);
    await page.click(`${SH} #unGapOk`); await page.waitForSelector(`${SH} #unGapGo`);
    c = (await camps()).camps.find(x => x.id === firstCamp);
    assert(c.students.length === 2, '겹치지 않음: ' + c.students.length);
  }],
  ['[기초학력으로 가기] → 학급 › 기초학력, 그 프로그램의 기본 정보(이름 칸이 빈 학생)', async () => {
    await page.click(`${SH} #unGapGo`);
    await page.waitForSelector(`${P} .cp-page`);
    assert(await page.isVisible('section[data-menu="class"]'), '학급 메뉴');
    assert(await page.inputValue(`${P} #cpPick`) === firstCamp, '그 프로그램');
    assert(await page.getAttribute(`${P} .cp-step[data-sec="info"]`, 'aria-current') === 'step', '기본 정보 단계');
    const names = await page.$$eval(`${P} .cp-students [data-k="name"]`, a => a.map(x => x.value));
    assert(JSON.stringify(names) === '["이바다",""]', JSON.stringify(names));
  }],
  ['결과 보고서 단계 「사전·사후 점수」: 사전 점수(교과·영역·평가 수), 사후는 아직', async () => {
    await page.click(`${P} [data-sec="report"]`);
    await page.waitForSelector(`${P} .cp-growth`);
    const rows = await page.$$eval(`${P} .cp-growth-t tbody tr`, trs => trs.map(tr => ({
      who: tr.querySelector('th').textContent.trim(), sub: tr.querySelector('[data-k="subject"]').value, area: tr.querySelector('[data-k="area"]').value,
      pre: tr.querySelector('[data-k="pre"]').value, post: tr.querySelector('[data-k="post"]').value, notes: [...tr.querySelectorAll('.cp-gr-note')].map(n => n.textContent), chg: tr.querySelector('[data-gr-chg]').textContent
    })));
    assert(rows.length === 2, '두 줄');
    assert(rows[0].who.startsWith('이바다') && rows[0].sub === '수학' && rows[0].area === '도형' && rows[0].pre === '52' && rows[0].post === '' && rows[0].notes.join('|') === '단원평가 2개|아직 없어요' && rows[0].chg === '—', JSON.stringify(rows[0]));
    assert(rows[1].who.includes('이름 없음') && rows[1].who.includes('3-2 3번') && rows[1].area === '수와 연산' && rows[1].pre === '45' && rows[1].notes[0] === '단원평가 2개', JSON.stringify(rows[1]));
    // 결과 보고서 단계 위(보고서 꼴 카드보다 앞)
    assert(await page.evaluate(() => { const s = document.querySelector('.cls-camp #cpSec'); return s.firstElementChild.classList.contains('cp-growth'); }), '맨 위 카드');
  }],
  ['뒤에 본 같은 교과 단원평가로 사후 자동(가장 최근 것) · 「자동 · 평가 이름」 · ▲ +n점', async () => {
    await seedTest('q1', '수학', 5, '2026-11-02', { 3: [70, 90], 7: [80, 65] });
    await seedTest('q2', '수학', 6, '2026-11-09', { 3: [78, 90], 7: [85, 70] });
    await seedTest('k2', '국어', 2, '2026-11-12', { 3: [10, 10] }, ['수와 연산', '도형']); // 다른 교과는 안 씀
    await seedTest('q0', '수학', 2, '2026-10-24', { 7: [99, 99] }); // 첫 수업 날(10/26) 앞은 안 씀
    await page.click(`${P} [data-sec="obs"]`); await page.click(`${P} [data-sec="report"]`);
    await page.waitForSelector(`${P} .cp-growth`);
    const post = no => page.inputValue(`${P} .cp-growth-t tbody tr:nth-child(${no}) [data-k="post"]`);
    assert(await post(1) === '70' && await post(2) === '78', `${await post(1)} ${await post(2)}`);
    const n2 = await page.textContent(`${P} .cp-growth-t tbody tr:nth-child(2) [data-gr-note="post"]`);
    assert(n2 === '자동 · 3학년 수학 6단원 나눗셈 (1회)', n2);
    assert((await page.textContent(`${P} .cp-growth-t tbody tr:nth-child(2) [data-gr-chg]`)) === '▲ +33점', '변화 ▲');
    assert((await page.textContent(`${P} .cp-growth-t tbody tr:nth-child(1) [data-gr-chg]`)) === '▲ +18점', '이바다 ▲ +18');
    const c = (await camps()).camps.find(x => x.id === firstCamp);
    assert(c.growth[c.students[1].id].post.source === 'auto' && c.growth[c.students[1].id].post.tests[0].id === 'q2', '저장: ' + JSON.stringify(c.growth[c.students[1].id].post));
  }],
  ['직접 고치면 직접 쓴 점수가 앞서고(▼ 글자도), 사후 칸을 비우면 다시 자동', async () => {
    const inp = `${P} .cp-growth-t tbody tr:nth-child(1) [data-k="post"]`, chg = `${P} .cp-growth-t tbody tr:nth-child(1) [data-gr-chg]`;
    await page.fill(inp, '40');
    assert((await page.textContent(chg)) === '▼ -12점', '바로 바뀜: ' + await page.textContent(chg));
    assert((await page.getAttribute(chg, 'class')).includes('down'), '내림');
    assert((await page.textContent(`${P} .cp-growth-t tbody tr:nth-child(1) [data-gr-note="post"]`)) === '직접 씀', '직접 씀');
    await page.click(`${P} #cpGrowthH`);
    await page.click(`${P} [data-sec="obs"]`); await page.click(`${P} [data-sec="report"]`);
    assert(await page.inputValue(inp) === '40', '자동이 덮지 않음: ' + await page.inputValue(inp));
    let c = (await camps()).camps.find(x => x.id === firstCamp);
    assert(c.growth[c.students[0].id].post.source === 'manual' && c.growth[c.students[0].id].post.pct === 40, JSON.stringify(c.growth[c.students[0].id].post));
    await page.fill(inp, '');
    await page.click(`${P} #cpGrowthH`); // 칸을 벗어나면 다시 그려 자동 점수
    await page.waitForFunction(s => document.querySelector(s).value === '70', inp);
    await page.fill(inp, '60%');
    await page.click(`${P} #cpGrowthH`);
    assert(await page.inputValue(inp) === '60', '「60%」→ 60');
    // 사전도 고칠 수 있음(직접 씀)
    const pre = `${P} .cp-growth-t tbody tr:nth-child(1) [data-k="pre"]`;
    await page.fill(pre, 'abc'); await page.click(`${P} #cpGrowthH`);
    assert(await page.inputValue(pre) === '52', '숫자가 아니면 그대로');
    c = (await camps()).camps.find(x => x.id === firstCamp);
    assert(c.growth[c.students[0].id].post.pct === 60 && c.growth[c.students[0].id].pre.pct === 52, JSON.stringify(c.growth[c.students[0].id]));
  }],
  ['결과 보고서 [AI로 쓰기]: [사전·사후 점수] 줄에 숫자 그대로(학생A·학생B), 학생 이름은 보내지 않음', async () => {
    await page.click(`${P} [data-sec="info"]`);
    await page.fill(`${P} .cp-students tbody tr:nth-child(2) [data-k="name"]`, '김하늘');
    await page.click(`${P} [data-sec="report"]`);
    const before = prompts.length;
    await page.click(`${P} [data-cp="reportAi"]`);
    await page.waitForFunction(() => /결과 보고서를 썼어요/.test(document.querySelector('#toast').textContent));
    const p = prompts.slice(before).find(x => x.startsWith('[기초학력 결과 보고서]'));
    assert(p, '보고서 프롬프트');
    assert(p.includes('[사전·사후 점수]\n- 학생A · 수학 도형 52% → 60%(+8)\n- 학생B · 수학 수와 연산 45% → 78%(+33)'), p.slice(p.indexOf('[사전'), p.indexOf('[사전') + 160));
    assert(p.includes('「운영 성과」에 숫자 그대로') && p.includes('지어내지'), '숫자 규칙');
    for (const n of ['이바다', '김하늘', '한가람']) assert(!p.includes(n), `프롬프트에 「${n}」`);
  }],
  ['결과 보고서 문서 미리 보기 끝에 「사전·사후 성취」 표(이 기기 문서라 이름 그대로)', async () => {
    await page.click(`${P} [data-sec="docs"]`);
    await page.click(`${P} details[data-prev="report"] summary`);
    const txt = (await page.textContent(`${P} details[data-prev="report"] .cp-prev-doc`)).replace(/\s+/g, ' ');
    const i = txt.indexOf('사전·사후 성취');
    assert(i > txt.indexOf('운영 성과'), '보고서 글 뒤: ' + txt.slice(0, 200));
    const tail = txt.slice(i);
    assert(tail.includes('이바다') && tail.includes('김하늘') && tail.includes('▲ +8점') && tail.includes('▲ +33점') && tail.includes('수학 수와 연산'), tail);
  }],
  ['390px: 결과 모아 보기 카드·사전·사후 점수 카드가 가로로 넘치지 않고, 체크 줄·칸은 44px', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click(`${P} [data-sec="report"]`);
    await page.waitForSelector(`${P} .cp-growth`);
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(await over() <= 0, '기초학력 가로 넘침 ' + await over());
    const card = await page.evaluate(() => { const c = document.querySelector('.cls-camp .cp-growth').getBoundingClientRect(); return c.right <= window.innerWidth + 1; });
    assert(card, '카드가 화면 안');
    const h = await page.$$eval(`${P} .cp-growth-t .field`, a => Math.min(...a.map(x => x.getBoundingClientRect().height)));
    assert(h >= 44, '칸 높이 ' + h);
    await enter(page, 'evaluate', 'unit');
    await page.waitForSelector(`${V} .un-gap`);
    assert(await over() <= 0, '결과 가로 넘침 ' + await over());
    const lh = await page.$$eval(`${V} .un-gap-i label`, a => Math.min(...a.map(x => x.getBoundingClientRect().height)));
    assert(lh >= 44, '줄 높이 ' + lh);
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
