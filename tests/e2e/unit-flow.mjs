// 평가 한 바퀴 띠 (스펙 2026-11-13-crop-log-flow §3): 평가를 연 화면 4단계 탭 위 한 줄 —
// 채점 → 틀린 까닭 → 복습 문제 → 도달하지 못한 학생 → 기초학력 → 사전·사후, 상태 글·✓·「지금」, 누르면 그곳으로,
// [채점 마치기]·[틀린 까닭 묶기]·복습 문제 칸·[기초학력에 넣기]·뒤 단원평가 뒤 상태가 바뀜, 예시 평가, 390px·44px. 이름·학교는 모두 지어낸 것
// 띠는 기본이 접힌 한 줄 「평가 한 바퀴 n/6 · 다음: …」(스펙 2026-11-14-ui-tidy §3) — 처음에 한 번 펼치면 이 실행 동안 펼친 채로
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
  if (prompt.startsWith('[단원평가 틀린 까닭]')) {
    const a = (/- (a\d+)(?: \(부분 점수\))?: 사각형/.exec(prompt) || [])[1];
    return JSON.stringify({ items: [{ no: 2, groups: [{ ids: [a], why: '도형 이름을 헷갈림', act: '도형 카드를 보고 이름 말하기' }] }] });
  }
  return '{}';
});
const V = 'section[data-menu="evaluate"] .unit-box', B = `${V} .un-flow`, P = 'section[data-menu="class"] .cls-camp', SH = '#sheetRoot .sheet';
const node = id => `${B} [data-flow="${id}"]`;
const status = id => page.textContent(`${node(id)} .un-flow-s`).then(s => s.replace(/\s+/g, ' ').trim());
const statuses = () => page.$$eval(`${B} [data-flow]`, a => Object.fromEntries(a.map(b => [b.dataset.flow, b.querySelector('.un-flow-s').textContent.replace(/\s+/g, ' ').trim()])));
const nowId = () => page.$$eval(`${B} [data-flow][aria-current="step"]`, a => a.map(b => b.dataset.flow).join());
const inView = sel => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= -1 && r.top < window.innerHeight - 20; }, sel);
const curStep = () => page.textContent(`${V} .steps li.cur`).then(s => s.trim());
const SUM = `${B} .un-flow-sum`, sumText = () => page.textContent(`${SUM} .un-flow-sum-t`).then(s => s.replace(/\s+/g, ' ').trim());
const camps = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:camp') || 'null'));
/* 단원평가 하나 저장: items [[번호, 영역, 유형, 정답, 배점]], rows { 번호: [[점수, 읽은 답]…] }, extra: 그대로 넣을 학생 */
const seed = spec => page.evaluate(async ({ id, meta, items, rows, done, extra }) => {
  const m = await import('./menus/evaluate/unit/unit-model.js');
  const x = m.newTest({ meta: { subject: '수학', grade: 3, term: 2, unitNo: 3, unitName: '나눗셈', round: 1, ...meta }, key: { domains: [...new Set(items.map(i => i[1]))], items: items.map(([no, domain, type, answer, points]) => ({ no, content: `${domain} 문항`, domain, type, answer, points, criteria: '', pages: '' })) } });
  x.id = id; x.done = done; x.createdAt = Date.parse(meta.date);
  x.students = [...Object.entries(rows).map(([no, cells]) => ({ no: +no, skip: false, status: 'done', good: '', cheer: '', items: Object.fromEntries(cells.map(([p, r], i) => [i + 1, { read: r == null ? 'x' : r, pts: p, ai: p, ai0: p, flag: '', why: '', ok: true, manual: false }])) })), ...(extra || [])];
  m.saveTest(x);
}, { done: true, extra: [], ...spec });
const MATH = [[1, '수와 연산', 'choice', '③', 50], [2, '도형', 'short', '삼각형', 50]];

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
// 이 평가: 1번 만점, 2번 수와 연산 0점(①), 3번 둘 다 0점(①·「사각형」), 4번 빈 답, 5번 아직 채점 안 함, 6번 결석
await seed({ id: 'f1', meta: { date: '2026-10-14' }, items: MATH, done: false,
  rows: { 1: [[50, '③'], [50, '삼각형']], 2: [[0, '①'], [50, '삼각형']], 3: [[0, '①'], [0, '사각형']], 4: [[0, ''], [0, '']] },
  extra: [{ no: 5, skip: false, status: 'idle', items: {} }, { no: 6, skip: true, status: 'done', items: {} }] });
// 같은 교과·학기 다른 평가: 8번은 측정만 낮음(이 평가의 띠에서는 셈하지 않고, 목록에는 보임)
await seed({ id: 'f0', meta: { date: '2026-10-07', unitNo: 2, unitName: '길이', term: null }, items: [[1, '측정', 'short', '1', 100]], rows: { 1: [[100]], 8: [[20]] } });
const campId = (await camps()).current;
await enter(page, 'evaluate', 'unit');
await page.click(`${V} [data-un-open="f1"]`);
await page.waitForSelector(B);

await run('unit-flow', [
  ['평가를 열면 띠는 접힌 한 줄 단추 「평가 한 바퀴 0/6 · 다음: 채점」, 누르면 여섯 마디가 펼쳐짐', async () => {
    assert(await page.getAttribute(SUM, 'aria-expanded') === 'false', '처음엔 접힘');
    assert(!(await page.isVisible(`${B} .un-flow-l`)), '마디는 숨김');
    assert(await sumText() === '평가 한 바퀴 0/6 · 다음: 채점', await sumText());
    await page.click(SUM);
    assert(await page.getAttribute(SUM, 'aria-expanded') === 'true' && await page.isVisible(node('grade')), '펼침');
  }],
  ['평가를 열면 4단계 탭 위 한 줄: 여섯 마디·상태 글, 지금 할 차례(「지금」 글자), 화살표는 읽지 않음', async () => {
    const order = await page.evaluate(() => {
      const b = document.querySelector('.unit-box .un-flow'), s = document.querySelector('.unit-box .steps'), top = document.querySelector('.unit-box .un-top');
      return !!(b.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(top.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert(order, '평가 이름 아래, 단계 탭 위');
    const ids = await page.$$eval(`${B} [data-flow]`, a => a.map(b => [b.dataset.flow, b.tagName, b.querySelector('.un-flow-n').textContent.replace('지금', '').trim()]));
    assert(JSON.stringify(ids) === JSON.stringify([['grade', 'BUTTON', '채점'], ['miss', 'BUTTON', '틀린 까닭'], ['redo', 'BUTTON', '복습 문제'], ['gap', 'BUTTON', '도달하지 못한 학생'], ['camp', 'BUTTON', '기초학력'], ['post', 'BUTTON', '사전·사후']]), JSON.stringify(ids));
    const s = await statuses();
    assert(JSON.stringify(s) === JSON.stringify({ grade: '채점 4/5명', miss: '묶음 3개 · 1명 남음', redo: '아직', gap: '아직', camp: '아직', post: '아직' }), JSON.stringify(s));
    assert(await nowId() === 'grade', '지금: ' + await nowId());
    assert((await page.textContent(`${node('grade')} .un-flow-now`)).trim() === '지금', '「지금」 글자');
    assert(await page.$$eval(`${B} .un-flow-now`, a => a.length) === 1, '「지금」은 하나');
    assert(await page.getAttribute(node('grade'), 'aria-label') === '채점, 채점 4/5명, 지금 할 차례', await page.getAttribute(node('grade'), 'aria-label'));
    assert(!(await page.textContent(B)).includes('✓'), '다 된 마디가 없으면 ✓ 없음');
    const arrows = await page.$$eval(`${B} .un-flow-a`, a => a.map(x => [x.getAttribute('aria-hidden'), x.textContent.trim()]));
    assert(arrows.length === 5 && arrows.every(([h, x]) => h === 'true' && x === '→'), JSON.stringify(arrows));
    assert(await page.getAttribute(B, 'aria-label') === '평가 한 바퀴', '띠 이름');
  }],
  ['채점 마디 → 3단계', async () => {
    await page.click(`${V} .steps [data-step="1"]`);
    assert((await curStep()).includes('학생 문제지·답안'), await curStep());
    await page.click(node('grade'));
    assert((await curStep()).includes('채점·확인'), await curStep());
    assert(await page.isVisible(`${V} [data-un="finish"]`), '3단계 [채점 마치기]');
  }],
  ['[채점 마치기] 뒤: 채점 ✓(글자도), 도달하지 못한 학생 3명 ✓, 지금 할 차례는 틀린 까닭', async () => {
    await page.click(`${V} [data-un="finish"]`);
    await page.click(`${SH} #unFinishOk`);
    await page.waitForFunction(() => /채점 4\/5명$/.test(document.querySelector('.unit-box [data-flow="grade"] .un-flow-s').textContent.trim()));
    const g = await status('grade');
    assert(g === '✓ 채점 4/5명', g);
    assert((await page.getAttribute(node('grade'), 'class')).includes('done'), 'done');
    assert(await page.getAttribute(node('grade'), 'aria-label') === '채점, 채점 4/5명, 다 됨', await page.getAttribute(node('grade'), 'aria-label'));
    assert(await status('gap') === '✓ 3명', await status('gap'));
    assert(await status('camp') === '아직' && await status('post') === '아직', `${await status('camp')} ${await status('post')}`);
    assert(await nowId() === 'miss', '지금: ' + await nowId());
    assert(await sumText() === '평가 한 바퀴 2/6 · 다음: 틀린 까닭', '접힌 줄 글도 바뀜: ' + await sumText());
  }],
  ['틀린 까닭 마디 → 4단계 「틀린 까닭」 카드가 보이게', async () => {
    await page.evaluate(() => { document.querySelector('#app') && (document.querySelector('#app').scrollTop = 0); window.scrollTo(0, 0); });
    await page.click(node('miss'));
    assert((await curStep()).includes('피드백'), await curStep());
    await page.waitForFunction(() => { const el = document.querySelector('.unit-box .un-miss'); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight - 20; });
    assert(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('un-miss')), '초점이 카드로');
  }],
  ['[틀린 까닭 묶기] 뒤: 틀린 까닭 ✓ 묶음 4개', async () => {
    await page.click(`${V} [data-un="missAI"]`);
    await page.waitForFunction(() => /묶음 4개/.test(document.querySelector('.unit-box [data-flow="miss"] .un-flow-s').textContent));
    assert(await status('miss') === '✓ 묶음 4개', await status('miss'));
    const p = prompts.find(x => x.startsWith('[단원평가 틀린 까닭]'));
    assert(p && !p.includes('이바다'), '이름 없음');
    assert(await nowId() === 'redo', '지금: ' + await nowId());
  }],
  ['복습 문제 마디 → 복습 문제 카드, 물음을 쓰면 띠가 바로 바뀜(복습 1/2개)', async () => {
    await page.evaluate(() => { const a = document.querySelector('#app'); if (a) a.scrollTop = 0; window.scrollTo(0, 0); });
    await page.click(node('redo'));
    await page.waitForFunction(() => { const el = document.querySelector('.unit-box .un-redo'); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight - 20; });
    await page.click(`${V} .un-redo-ed > summary`);
    await page.fill(`${V} [data-redo="1-q"]`, '12÷3은 얼마인가요?');
    await page.press(`${V} [data-redo="1-q"]`, 'Tab');
    await page.waitForFunction(() => /복습 1\/2개/.test(document.querySelector('.unit-box [data-flow="redo"] .un-flow-s').textContent));
    assert(await status('redo') === '복습 1/2개', await status('redo'));
    assert(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-redo="1-c0"]')), '띠만 다시 그리고 옮겨 간 칸은 그대로');
  }],
  ['도달하지 못한 학생 마디 → 결과 모아 보기 「도달하지 못한 학생」(이 평가의 교과·학기), 이 평가의 학생을 골라 둠', async () => {
    await page.click(node('gap'));
    await page.waitForSelector(`${V} .un-gap`);
    assert(await page.getAttribute(`${V} [data-rv="gap"]`, 'aria-pressed') === 'true', '도달하지 못한 학생 보기');
    assert(await page.inputValue(`${V} #unFSubject`) === '수학' && await page.inputValue(`${V} #unFTerm`) === '2', `${await page.inputValue(`${V} #unFSubject`)} ${await page.inputValue(`${V} #unFTerm`)}`);
    const nos = await page.$$eval(`${V} .un-gap-i`, a => a.map(x => Number(x.dataset.gapNo)));
    assert(JSON.stringify(nos) === '[2,3,4,8]', '목록: ' + JSON.stringify(nos));
    const on = await page.$$eval(`${V} [data-gapno]`, a => a.filter(x => x.checked).map(x => Number(x.dataset.gapno)));
    assert(JSON.stringify(on) === '[2,3,4]', '골라 둔 학생: ' + JSON.stringify(on));
    assert((await page.textContent(`${V} #unGapN`)).includes('3명 골랐어요'), await page.textContent(`${V} #unGapN`));
  }],
  ['[기초학력에 넣기] 뒤 평가로 돌아오면: 기초학력 ✓ 3명 넣음, 사전·사후 0/3명', async () => {
    await page.click(`${V} [data-gap="add"]`);
    await page.waitForSelector(SH);
    assert(await page.isChecked(`${SH} input[name="unGapTo"][value="${campId}"]`), '지금 프로그램');
    await page.click(`${SH} #unGapOk`);
    await page.waitForSelector(`${SH} #unGapGo`);
    await page.click(`${SH} [data-close]`);
    await page.click(`${V} [data-unv="list"]`);
    await page.click(`${V} [data-un-open="f1"]`);
    await page.waitForSelector(B);
    assert(await status('camp') === '✓ 3명 넣음', await status('camp'));
    assert(await status('post') === '사후 0/3명', await status('post'));
  }],
  ['기초학력 마디 → 학급 › 기초학력, 그 학생이 든 프로그램의 기본 정보', async () => {
    const all = await camps();
    await page.evaluate(async () => { const M = await import('./menus/class/camp-model.js'); M.setCurrentCamp(''); }); // 지금 프로그램이 아니어도 그 프로그램으로
    await page.click(node('camp'));
    await page.waitForSelector(`${P} .cp-page`);
    assert(await page.isVisible('section[data-menu="class"]'), '학급 메뉴');
    assert(await page.inputValue(`${P} #cpPick`) === campId, '그 프로그램 ' + JSON.stringify(all.camps.map(c => c.name)));
    assert(await page.getAttribute(`${P} .cp-step[data-sec="info"]`, 'aria-current') === 'step', '기본 정보 단계');
    const nos = await page.$$eval(`${P} .cp-students [data-k="no"]`, a => a.map(x => x.value));
    assert(['7', '2', '3', '4'].every(n => nos.includes(n)), JSON.stringify(nos));
  }],
  ['뒤 단원평가로 사후가 생기면 「사후 2/3명」, 사전·사후 마디 → 결과 보고서 단계 「사전·사후 점수」 카드', async () => {
    await seed({ id: 'q1', meta: { date: '2026-11-02', unitNo: 4, unitName: '곱셈' }, items: [[1, '수와 연산', 'short', '1', 100], [2, '도형', 'short', '1', 100]], rows: { 2: [[40], [100]], 3: [[30], [30]] } });
    await enter(page, 'evaluate', 'unit');
    await page.waitForSelector(B);
    assert(await status('post') === '사후 2/3명', await status('post'));
    assert(await status('gap') === '✓ 3명', '모아 셈해도 그대로: ' + await status('gap'));
    await page.click(node('post'));
    await page.waitForSelector(`${P} .cp-growth`);
    assert(await page.getAttribute(`${P} .cp-step[data-sec="report"]`, 'aria-current') === 'step', '결과 보고서 단계');
    await page.waitForFunction(() => { const el = document.querySelector('.cls-camp .cp-growth'); const r = el.getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight - 20; });
    const posts = await page.$$eval(`${P} .cp-growth-t [data-k="post"]`, a => a.map(x => x.value).filter(Boolean));
    assert(posts.length === 2, '사후 두 명: ' + JSON.stringify(posts));
  }],
  ['예시 평가: 채점은 그대로, 도달하지 못한 학생·기초학력·사전·사후는 「예시는 빼요」', async () => {
    await enter(page, 'evaluate', 'unit');
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un="sample"]`);
    await page.click(`${V} [data-un-open="sample-1"]`);
    await page.waitForSelector(B);
    const s = await statuses();
    assert(s.grade === '✓ 채점 6/6명', s.grade);
    assert(s.gap === '예시는 빼요' && s.camp === '예시는 빼요' && s.post === '예시는 빼요', JSON.stringify(s));
    await page.click(`${V} [data-un="back"]`);
    await page.click(`${V} [data-un="sampleDel"]`);
  }],
  ['390px: 띠는 제 칸 안에서 줄을 바꿔 감싸고 화면은 가로로 넘치지 않음, 마디마다 44px', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.click(`${V} [data-un-open="f1"]`);
    await page.waitForSelector(B);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(over <= 0, '가로 넘침 ' + over);
    const r = await page.evaluate(() => {
      const b = document.querySelector('.unit-box .un-flow').getBoundingClientRect();
      const bs = [...document.querySelectorAll('.unit-box .un-flow [data-flow]')].map(x => x.getBoundingClientRect());
      return { right: b.right, left: b.left, vw: innerWidth, minH: Math.min(...bs.map(x => x.height)), minW: Math.min(...bs.map(x => x.width)), out: bs.filter(x => x.right > b.right + 1 || x.left < b.left - 1).length, rows: new Set(bs.map(x => Math.round(x.top))).size };
    });
    assert(r.left >= 0 && r.right <= r.vw + 1, '띠가 화면 안 ' + JSON.stringify(r));
    assert(r.out === 0, '마디가 띠 밖으로 ' + JSON.stringify(r));
    assert(r.minH >= 44 && r.minW >= 44, '44px ' + JSON.stringify(r));
    assert(r.rows >= 2, '줄을 바꿔 감쌈 ' + JSON.stringify(r));
    await page.setViewportSize({ width: 1280, height: 860 });
    const rows = await page.$$eval(`${B} [data-flow]`, a => new Set(a.map(x => Math.round(x.getBoundingClientRect().top))).size);
    assert(rows === 1, '넓은 화면은 한 줄: ' + rows);
  }],
  ['오류 없음', async () => { assert(!errors.length, errors.join(' | ')); }]
]);
await t.close();
