// 「쌤」 채팅 정교화(스펙 2026-11-14-chat-smarter): 앱 자료로 바로 답하기(AI 없이·번호만·답은 다음 AI 대화에 넣지 않음),
// 현장 말(주안·세특·인계서·안내문·「~사야 돼」), 지금 화면 맞춤 도움(메뉴 › 탭·단계·화면 설명·평가 한 바퀴 다음 할 일)
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-11T10:05:00')); // 수요일 2교시
const SEED = {
  engine: { engine: 'claude', keys: { claude: 'sk-test' }, remember: true },
  'gongmun:list': [
    { id: 'gm1', title: '안전 점검 결과 보고', due: '2026-11-09', done: false, at: 1 },
    { id: 'gm2', title: '과학의 날 참가 신청', due: '2026-11-13', done: false, at: 2 },
    { id: 'gm4', title: '다 한 공문', due: '2026-11-12', done: true, at: 4 }],
  'class:timetable': { periods: 6, cells: [[], [], ['국어', '수학', '국어', '체육', '수학', ''], [], []] },
  'class:subjects': [
    { id: 'kor', name: '국어', offset: 0, lessons: [{ unit: '1. 마음을 나누어요', title: '시 낭송하기', no: '3/14' }, { unit: '1. 마음을 나누어요', title: '느낌 나누기', no: '4/14' }, { unit: '1. 마음을 나누어요', title: '시 바꿔 쓰기', no: '5/14' }] },
    { id: 'math', name: '수학', offset: 0, lessons: [{ unit: '2. 나눗셈', title: '몫 구하기', no: '1/10' }, { unit: '2. 나눗셈', title: '나머지 알기', no: '2/10' }] }],
  'class:log': { '2026-11-11': { 1: { subject: '국어', status: 'done' } } },
  camp: { current: 'cpA', camps: [{ id: 'cpA', name: '수학 교과캠프', students: [{ id: 'a', grade: 3, cls: 1, no: 1, name: '김하늘' }, { id: 'b', grade: 3, cls: 1, no: 2, name: '이바다' }],
    sessions: [{ id: 'x1', date: '2026-11-10', start: '14:00', end: '14:40', subject: '수학' }, { id: 'x2', date: '2026-11-11', start: '14:00', end: '14:40', subject: '수학' }],
    att: { x1: { a: 'O', b: 'X' } } }] }
};
await page.addInitScript(seed => {
  if (localStorage.getItem('ssam:__seeded')) return;
  for (const [k, v] of Object.entries(seed)) localStorage.setItem('ssam:' + k, JSON.stringify(v));
  localStorage.setItem('ssam:__seeded', '1');
}, SEED);
const prompts = [];
await mockClaude(page, async ({ prompt }) => { prompts.push(prompt); return JSON.stringify({ reply: '쌤비서 안내를 보고 답했어요.', actions: [] }); });
await page.goto(url);
await page.waitForSelector('#inboxFab');
// 채점을 마친 단원평가 2개(예시 자료를 진짜 평가로 저장 — 학생 6명, 번호만)
await page.evaluate(async () => {
  const S = await import('./menus/evaluate/unit/unit-sample.js'), M = await import('./menus/evaluate/unit/unit-model.js');
  for (const x of S.sampleTests()) { x.meta.sample = false; x.id = 'real-' + x.id; M.saveTest(x); }
});

const C = '#chatPanel';
const openChat = async () => { if (await page.isHidden(C)) await page.click('#inboxFab'); await page.waitForSelector(`${C}:not([hidden])`); };
const lastBot = () => page.evaluate(() => { const b = [...document.querySelectorAll('#chatPanel .chat-msg.bot:not(.wait)')].pop(); return b ? b.innerText : ''; });
/* 보낸 글(내 말 칸이 하나 늘어남) 뒤에 새 답(기다리는 중이 아닌 쌤비서 글)이 올 때까지 */
const ask = async text => {
  await openChat();
  // 기록은 30개까지라 오래되면 내 말 칸 수가 늘지 않음: 많으면 비우고 시작
  if (await page.$$eval(`${C} .chat-msg.me`, x => x.length) >= 10) await page.click(`${C} [data-chat="clear"]`);
  const n = await page.$$eval(`${C} .chat-msg.me`, x => x.length);
  await page.fill('#chatText', text); await page.click('#chatSend');
  await page.waitForFunction(n => {
    const all = [...document.querySelectorAll('#chatPanel .chat-msg')], mine = all.filter(m => m.classList.contains('me'));
    if (mine.length <= n) return false;
    const at = all.indexOf(mine[mine.length - 1]);
    return all.slice(at + 1).some(m => m.classList.contains('bot') && !m.classList.contains('wait'));
  }, n);
  await page.waitForTimeout(50);
  return lastBot();
};
const title = () => page.textContent('#menuTitle');

await run('chat-smart', [
  ['단원평가 평균을 물으면 AI 없이 바로: 평가 이름·평균·채점 인원, 정답률 낮은 문항은 번호로, [단원평가 열기]', async () => {
    const before = prompts.length;
    const a = await ask('우리 반 단원평가 평균 몇 점이야?');
    assert(a.includes('단원평가(최근 2개') && a.includes('평균') && a.includes('6명 채점'), a);
    assert(a.includes('국어') && !/김하늘|이바다/.test(a), a);
    assert(prompts.length === before, 'AI를 불렀음');
    assert(await title() !== '평가', '물었는데 화면으로 옮겨 감');
    await page.click(`${C} .chat-msg.bot:last-child .chat-chip`);
    assert(await title() === '평가' && await page.textContent('#menuTabs [aria-current="page"]') === '단원평가', await title());
  }],
  ['n번 학생 점수: 평가마다 점수·반 평균·가장 낮은 영역(이름 없이)', async () => {
    const a = await ask('3번 학생 국어 점수 어때?');
    assert(a.startsWith('3번 학생 단원평가') && /\d+\/\d+점\(\d/.test(a) && a.includes('반 평균') && a.includes('가장 낮은 영역'), a);
  }],
  ['도달하지 못한 학생: 기준과 번호', async () => {
    const a = await ask('도달 못한 학생 누구야?');
    assert(a.includes('도달하지 못한 학생') || a.includes('기준(60%)보다 낮은 학생이 없어요'), a);
    assert(!/김하늘|이바다/.test(a), a);
  }],
  ['진도·시간표: 교과별 차시·다음 차시, 오늘 그 교시', async () => {
    const p = await ask('수학 진도 어디까지 나갔지?');
    assert(p.includes('수학 ') && p.includes('/2차시') && !p.includes('국어'), p);
    const tt = await ask('오늘 3교시 뭐야?');
    assert(tt.includes('오늘 11월 11일(수) 3교시는 국어'), tt);
    const all = await ask('오늘 시간표 알려줘');
    assert(all.includes('1교시 국어') && all.includes('5교시 수학'), all);
    const no = await ask('내일 시간표');
    assert(no.includes('내일 11월 12일(목)') && no.includes('수업이 없어요'), no);
  }],
  ['기초학력 출석률(체크한 수업 기준)과 출석이 낮은 학생은 학년-반 번호로', async () => {
    const a = await ask('기초학력 출석률 알려줘');
    assert(a.includes('「수학 교과캠프」 출석률 50%') && a.includes('3-1 2번 0/1') && !a.includes('이바다'), a);
    const one = await ask('캠프 1번 출석 어때?');
    assert(one.includes('3-1 1번: 출석 1번 · 결석 0번'), one);
  }],
  ['남은 공문: 기한 지난 것부터 D-n, 다 한 것 빼고', async () => {
    const a = await ask('기한 남은 공문 있어?');
    assert(a.indexOf('안전 점검') < a.indexOf('과학의 날') && a.includes('기한 지남(11/9)') && a.includes('D-2(11/13)') && !a.includes('다 한 공문'), a);
  }],
  ['앱 자료 답은 다음 AI 질문의 최근 대화에 넣지 않음(점수가 AI로 가지 않게)', async () => {
    const before = prompts.length;
    await ask('행특 쓸 때 주의할 점이 뭐야?');
    const p = prompts.slice(before).find(x => x.includes('[쌤비서 채팅]'));
    assert(p, 'AI에 묻지 않음');
    assert(!p.includes('반 평균') && !p.includes('출석률 50%') && !p.includes('D-2(11/13)') && !/\d+\/\d+점/.test(p), p.split('[최근 대화]')[1] || p);
    assert(p.includes('[최근 대화]') && p.includes('선생님: 기한 남은 공문 있어?'), '선생님 글은 그대로 남음');
  }],
  ['현장 말: 「다음주 주안 만들어줘」→ 주간학습안내, 「세특 써줘」→ 교과 평어, 「인계서」→ 인수인계서, 「안내문 써줘」→ 가정통신문', async () => {
    for (const [q, want] of [['다음주 주안 만들어줘', '주간학습안내'], ['세특 써줘', '교과 평어'], ['인계서', '인수인계서'], ['안내문 써줘', '가정통신문']]) {
      await ask(q);
      await page.waitForFunction(w => document.querySelector('#menuTabs [aria-current="page"]') && document.querySelector('#menuTabs [aria-current="page"]').textContent === w, want, { timeout: 4000 }).catch(() => {});
      assert(await page.textContent('#menuTabs [aria-current="page"]') === want, `${q} → ${await page.textContent('#menuTabs [aria-current="page"]')}`);
    }
  }],
  ['「이 화면에서 뭐 해야 돼?」: 채팅 뒤 화면(메뉴 › 탭·단계·화면 설명·다음 할 일), AI 없이', async () => {
    // 단원평가 평가 하나를 연 화면(단계 표시·평가 한 바퀴 띠)
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('evaluate', 'unit')));
    await page.evaluate(() => import('./menus/evaluate/unit/unit.js').then(u => u.openTest('real-sample-2', 3)));
    await page.waitForSelector('section[data-menu="evaluate"] #unFlow');
    const before = prompts.length;
    const a = await ask('이 화면에서 뭐 해야 돼?');
    assert(a.includes('지금 화면: 평가 › 단원평가') && /\d단계 「/.test(a), a);
    assert(a.includes('다음 할 일: 「') && a.includes('평가 한 바퀴'), a);
    assert(prompts.length === before, 'AI를 불렀음');
    // 계획 › 연간계획(단계 표시와 화면 설명)
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'year')));
    const b = await ask('여기서 뭐 하는 거야');
    assert(b.includes('지금 화면: 계획 › 연간계획') && b.includes('1단계 「') && b.includes('이 화면은: '), b);
    // 오늘 화면
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('home')));
    const c = await ask('다음에 뭐 해?');
    assert(c.includes('지금 화면: 오늘') && c.includes('오늘 챙길 일'), c);
  }],
  ['AI 도우미에 주는 「보고 있는 화면」에 단계도', async () => {
    await page.evaluate(() => import('./core/shell.js').then(s => s.go('plan', 'year')));
    const before = prompts.length;
    await ask('연간계획 초안은 어떻게 써?');
    const p = prompts.slice(before).find(x => x.includes('[쌤비서 채팅]'));
    assert(p && /보고 있는 화면: 계획 › 연간계획 · 1단계 「/.test(p), p && p.split('[지금 앱 상태]')[1].slice(0, 200));
  }],
  ['390px: 답이 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ask('우리 반 단원평가 평균 몇 점이야?');
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('#chatPanel').scrollWidth, document.querySelector('#chatPanel').clientWidth]);
    assert(w[0] <= 390 && w[1] <= w[2] + 1, w.join(','));
    await page.setViewportSize({ width: 1280, height: 800 });
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
