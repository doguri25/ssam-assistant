// 「쌤」 버튼 채팅(스펙 2026-11-06 D·E·F): 손그림 버튼 → 채팅 창(닫기·Esc), 열면 「오늘 할 일」(AI 없이, 줄을 누르면 그 화면),
// 분명하면 바로 시작(품의 초안·쪽지·가정통신문·공문·메뉴 탭), 애매하면 AI(notes, 전화번호 줄 빼고)·후보 버튼, 아직 없는 기능은 알림,
// 「3·5번 …」 행동특성 메모 덧붙이기(이름 가림·되돌리기·메모 보기), 채팅 창에 파일 놓기·📎, 기록 30개·지우기, 바탕화면 버튼이 채팅을 엶.
// 검토 고침(2026-11-06): 기록에는 이름·파일 이름을 가린 글, 여러 줄 글은 줄을 살려 넘기고 전화번호만 가림, 넘길 것이 없거나 AI가 없거나 쓰는 중이면
// 시작했다고 하지 않음, 쓰던 가정통신문은 바꾸지 않고 덧붙임, 학급 명단에 없는 번호는 메모를 만들지 않음
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';

const t = await open();
const { page, url, errors, ctx } = t;
// 없는 파일(404)은 오류
const missing = [];
page.on('response', r => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
const THU = new Date('2026-11-05T09:00:00'), FRI = new Date('2026-11-06T09:00:00');
await page.clock.setFixedTime(THU);
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
  // 행동특성: 3번은 메모가 있음(그 끝에 덧붙임), 5번은 줄이 없음(만듦)
  if (!localStorage.getItem('ssam:hk')) localStorage.setItem('ssam:hk', JSON.stringify({ settings: {}, students: [{ id: 'h3', no: 3, label: '', memo: '성실함, 책임감 강함', results: [], done: 0 }] }));
  // 학급 명단은 아직 안 정함(학생 수 0: 모든 번호를 보여 줌, 메모 줄이 없으면 만듦) — 검토 고침 M2에서 25명으로 정함
  if (!localStorage.getItem('ssam:class')) localStorage.setItem('ssam:class', JSON.stringify({ count: 0, except: [] }));
});
const prompts = [];
let slow = 0; // 가정통신문·번역 답을 늦춤(쓰는 중에 또 부를 때)
await mockClaude(page, async ({ prompt }) => {
  prompts.push(prompt);
  if (slow && /^\[가정통신문( 번역)?\]/.test(prompt)) await new Promise(r => setTimeout(r, slow));
  if (prompt.startsWith('[채팅 할 일 고르기]')) {
    const said = prompt.split('[글]')[1] || '';
    if (said.includes('채점')) return JSON.stringify({ intent: '', candidates: ['unit', 'gr'] });
    if (said.includes('상담')) return JSON.stringify({ intent: 'letter' });
    return JSON.stringify({ intent: 'none' });
  }
  if (prompt.startsWith('[품의 초안]')) return JSON.stringify({ title: '과학 실험 재료 구입', intro: '과학 실험 재료를 다음과 같이 구입하고자 합니다.', fields: { purpose: '과학 실험 수업' }, type: 'goods' });
  if (prompt.startsWith('[쪽지 안내]')) return JSON.stringify({ kind: 'training', title: 'AI 활용 수업 연수', when: [{ date: '2026-11-12', time: '15:00~16:00' }], place: '과학실', target: '전 교직원' });
  if (prompt.startsWith('[가정통신문]')) return JSON.stringify({ title: '현장체험학습 안내', greeting: ['안녕하십니까?'], intro: '현장체험학습을 다음과 같이 실시합니다.', items: ['1. 일시: 2026. 11. 20.', '2. 준비물: 도시락'], closing: '협조를 부탁드립니다.', reply: { need: false }, short: '11월 20일 현장체험학습이 있어요.', target: '보호자' });
  if (prompt.startsWith('[공문 처리]')) return JSON.stringify({ title: '과학의 날 행사 참가 신청', due: '2026-11-20', dueNote: '참가 신청서', summary: '참가 신청서를 내요.', tasks: [{ text: '참가 신청서 제출', due: '' }], kinds: ['message'] });
  if (prompt.startsWith('[가정통신문 번역]')) { const out = {}; for (const m of prompt.matchAll(/^\[(\d+)\] (.*)$/gm)) out[m[1]] = `TR: ${m[2]}`; return JSON.stringify(out); }
  return '{}';
});
const of = p => prompts.filter(x => x.startsWith(p));
const C = '#chatPanel';
const sheet = '#sheetRoot .sheet';
const openChat = async () => { if (await page.isHidden(C)) await page.click('#inboxFab'); await page.waitForSelector(`${C}:not([hidden])`); };
const send = async text => { await openChat(); await page.fill('#chatText', text); await page.click('#chatSend'); };
const lastBot = () => page.evaluate(() => { const l = [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')]; return l.length ? l[l.length - 1].textContent : ''; });
const waitBot = s => page.waitForFunction(s => [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')].some(b => b.textContent.includes(s)), s);
const cur = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:nav')));
const hk = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:hk')));
const chatLog = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:chat') || '[]'));
// 글을 보내고 새 봇 답이 맨 끝에 올 때까지(기다리는 중 말풍선은 빼고, 기록은 30개라 수는 그대로일 수 있어 id로) → 그 답
const lastId = () => page.evaluate(() => { const l = [...document.querySelectorAll('#chatLog .chat-msg')]; return l.length ? l[l.length - 1].dataset.id || '' : ''; });
const sendWait = async text => {
  await openChat();
  const prev = await lastId();
  await send(text);
  await page.waitForFunction(prev => { const l = [...document.querySelectorAll('#chatLog .chat-msg')], m = l[l.length - 1];
    return !!m && m.classList.contains('bot') && !m.classList.contains('wait') && m.dataset.id !== prev; }, prev);
  return lastBot();
};
const until = async (fn, what, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error(what); await page.waitForTimeout(50); } };
const letterCur = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:letter:cur') || 'null'));
const gmList = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gongmun:list') || '[]'));
const LB = 'section[data-menu="etc"] .lf-box';
const letterF = () => page.evaluate(async () => { const F = (await import('/menus/etc/letter.js')).F; return { busy: F.busy, trBusy: F.trBusy }; });
const letterIdle = () => until(async () => { const f = await letterF(); return !f.busy && !f.trBusy; }, '가정통신문을 다 쓰지 않음', 8000);
await page.goto(url);
await page.waitForTimeout(400);

await run('chat', [
  ['버튼: 손그림 「쌤」(글꼴 없이 SVG 경로·테마 색), 누르면 채팅 창 — 닫기·Esc·다시 누르면 닫힘', async () => {
    assert(await page.locator('#inboxFab svg.ssam-mark path.sm-t').count() === 1 && (await page.textContent('#inboxFab')).trim() === '', '그림');
    const fill = await page.evaluate(() => getComputedStyle(document.querySelector('#inboxFab .sm-fill')).fill);
    const acc = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    assert(fill === 'rgb(79, 70, 229)' && acc === '#4f46e5', fill + ' ' + acc);
    await page.click('#inboxFab');
    await page.waitForSelector(`${C}:not([hidden])`);
    assert(await page.getAttribute('#inboxFab', 'aria-expanded') === 'true', 'aria-expanded');
    assert(await page.evaluate(() => document.activeElement.id) === 'chatText', '글 칸에 초점');
    await page.keyboard.press('Escape');
    assert(await page.isHidden(C), 'Esc');
    await page.click('#inboxFab');
    await page.click(`${C} [data-chat="close"]`);
    assert(await page.isHidden(C), '닫기');
    await page.click('#inboxFab'); await page.click('#inboxFab');
    assert(await page.isHidden(C) && await page.getAttribute('#inboxFab', 'aria-expanded') === 'false', '다시 누르면 닫힘');
  }],
  ['할 일이 없으면 「오늘은 급한 일이 없어요」', async () => {
    await openChat();
    await page.waitForFunction(() => !document.querySelector('#chatPanel .chat-brief').textContent.includes('세는 중'));
    const b = await page.textContent(`${C} .chat-brief`);
    assert(b.includes('오늘 할 일') && b.includes('11월 5일(목)') && b.includes('오늘은 급한 일이 없어요'), b);
  }],
  ['「오늘 할 일」: 공문 기한·학사일정·확정 전 행사계획·금요일 주간학습안내, 줄을 누르면 그 화면', async () => {
    await page.click(`${C} [data-chat="close"]`);
    await page.clock.setFixedTime(FRI);
    await page.evaluate(() => {
      localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gm1', name: '과학의 날', title: '과학의 날 참가 신청', due: '2026-11-09', tasks: [], kinds: [], text: '과학의 날 공문', at: 1, done: false },
        { id: 'gm2', name: '먼 공문', title: '먼 공문', due: '2026-12-20', tasks: [], kinds: [], text: '먼 공문', at: 2, done: false }]));
      localStorage.setItem('ssam:calendar', JSON.stringify([{ date: '2026-11-10', title: '교직원 회의', source: 'manual' }, { date: '2026-11-30', title: '먼 일정', source: 'manual' }]));
      localStorage.setItem('ssam:events', JSON.stringify([{ id: 'ev1', name: '가을 운동회', kind: 'sports', date: '2026-11-12', status: 'draft', updatedAt: 1 }]));
    });
    await openChat();
    await page.waitForFunction(() => document.querySelector('#chatPanel .chat-brief').textContent.includes('운동회'));
    const b = await page.textContent(`${C} .chat-brief`);
    for (const s of ['11월 6일(금)', '공문 「과학의 날 참가 신청」 제출', 'D-3', '교직원 회의', '11/10(화)', '행사계획 「가을 운동회」 확정 전', '다음 주 주간학습안내 만들기', '11/9~']) assert(b.includes(s), s + ' 없음: ' + b);
    assert(!b.includes('먼 공문') && !b.includes('먼 일정'), b);
    await page.click(`${C} .cb-line:has-text("과학의 날 참가 신청")`);
    await page.waitForSelector('section[data-menu="etc"] .gm-box:not([hidden])');
    assert(JSON.stringify(await cur()) === JSON.stringify({ menu: 'etc', tab: 'gongmun' }), JSON.stringify(await cur()));
    await page.click(`${C} .cb-line:has-text("가을 운동회")`);
    await page.waitForSelector('section[data-menu="plan"] [data-ev="ev1"][aria-current="true"]');
  }],
  ['품의: 「알코올램프 10개 5,000원 품의」 → 새 품의 넣기 칸에서 품목을 읽고 초안까지(AI 한 번), 올리기는 직접', async () => {
    await send('알코올램프 10개 5,000원 품의');
    await page.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('ssam:purchase:current') || 'null'); return s && s.draft && s.draft.title === '과학 실험 재료 구입'; });
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:purchase:current')));
    assert(s.form.items[0].name === '알코올램프' && s.form.items[0].qty === '10' && s.form.items[0].price === '5000', JSON.stringify(s.form.items));
    assert(of('[품의 초안]').length === 1 && of('[품의 초안]')[0].includes('알코올램프'), '초안 한 번');
    assert((await cur()).menu === 'purchase', JSON.stringify(await cur()));
    assert((await lastBot()).includes('초안을 만들어요') && (await lastBot()).includes('직접'), await lastBot());
  }],
  ['쪽지: 내용이 있으면 쪽지 작성에서 바로 읽고 칸·본문을 씀', async () => {
    await send('11월 12일 3시 과학실 AI 연수 안내 쪽지 써 줘');
    await page.waitForFunction(() => (document.querySelector('section[data-menu="etc"] [data-mf="title"]') || {}).value === 'AI 활용 수업 연수');
    assert(of('[쪽지 안내]').length === 1 && of('[쪽지 안내]')[0].includes('11월 12일 3시 과학실 AI 연수'), of('[쪽지 안내]')[0]);
    assert(JSON.stringify(await cur()) === JSON.stringify({ menu: 'etc', tab: 'message' }), '쪽지 탭');
  }],
  ['가정통신문: 넣을 내용에 넣고 바로 씀', async () => {
    await send('가정통신문 써 줘 11월 20일 현장체험학습 안내 준비물 도시락');
    await page.waitForFunction(() => { const v = JSON.parse(localStorage.getItem('ssam:letter:cur') || 'null'); return v && v.out && v.out.title === '현장체험학습 안내'; });
    const p = of('[가정통신문]');
    assert(p.length === 1 && p[0].includes('11월 20일 현장체험학습 안내 준비물 도시락') && !p[0].includes('써 줘'), p[0]);
    assert(JSON.stringify(await cur()) === JSON.stringify({ menu: 'etc', tab: 'letter' }), '가정통신문 탭');
  }],
  ['공문 글 → 공문 처리에 넣고 기한·할 일 뽑기, 「공문 처리」만 쓰면 그 화면', async () => {
    await send('공문: 과학의 날 행사 참가 신청서를 11월 20일까지 제출');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:gongmun:list') || '[]').some(d => d.title === '과학의 날 행사 참가 신청' && d.due === '2026-11-20'));
    assert(of('[공문 처리]').length === 1, '공문 AI');
    await send('공문 처리');
    await waitBot('공문 처리로 왔어요');
    assert(of('[공문 처리]').length === 1, '또 읽음');
  }],
  ['메뉴로 가는 할 일: 주간학습안내·단원평가 채점·연간계획·AI 키', async () => {
    for (const [text, nav] of [['주간학습안내', { menu: 'class', tab: 'weekly' }], ['단원평가 채점', { menu: 'evaluate', tab: 'unit' }], ['연간계획 보여 줘', { menu: 'plan', tab: 'year' }], ['AI 키 넣을래', { menu: 'settings', tab: 'ai' }]]) {
      await send(text);
      await page.waitForFunction(n => localStorage.getItem('ssam:nav') === JSON.stringify(n), nav);
      assert(await page.getAttribute(`#menuTabs [data-tab="${nav.tab}"]`, 'aria-current') === 'page', text);
    }
  }],
  ['관찰 메모: 「3·5번 …」 → 행동특성 메모 끝에 「[11. 6.] …」(이름은 가림, 5번 줄은 만듦), [되돌리기]', async () => {
    await send('3·5번 김민수가 토론에서 근거 들어 반론 잘함');
    await waitBot('행동특성 메모에 넣었어요');
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('ssam:hk')) || { students: [] }).students.some(s => s.no === 5));
    const h = await hk();
    const m = no => (h.students.find(s => s.no === no) || {}).memo;
    assert(m(3) === '성실함, 책임감 강함\n[11. 6.] ○○○가 토론에서 근거 들어 반론 잘함', JSON.stringify(m(3)));
    assert(m(5) === '[11. 6.] ○○○가 토론에서 근거 들어 반론 잘함', JSON.stringify(m(5)));
    assert((await lastBot()).includes('이름처럼 보이는 말은 ○○○로 가렸어요'), await lastBot());
    assert(!JSON.stringify(await chatLog()).includes('김민수') && !JSON.stringify(await hk()).includes('김민수'), '이름이 저장됨');
    await page.click(`${C} [data-undo]`);
    await waitBot('메모를 되돌렸어요');
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ssam:hk')).students.some(s => s.no === 5));
    assert((await hk()).students.find(s => s.no === 3).memo === '성실함, 책임감 강함', '되돌리기');
    assert(await page.locator(`${C} [data-undo]`).count() === 0, '되돌리기 단추가 남음');
  }],
  ['「3번 메모 보기」는 그 메모를 채팅에(기록에는 남기지 않음), [행동특성 보기]는 그 학생', async () => {
    await send('3번 발표 목소리가 커짐');
    await waitBot('행동특성 메모에 넣었어요');
    await send('3번 메모 보기');
    await waitBot('3번 메모');
    const b = await lastBot();
    assert(b.includes('성실함, 책임감 강함') && b.includes('[11. 6.] 발표 목소리가 커짐'), b);
    assert(!JSON.stringify(await chatLog()).includes('책임감 강함'), '메모 내용이 기록에 남음');
    await page.locator(`${C} .chat-msg.bot`).last().locator('button:has-text("행동특성 보기")').click();
    await page.waitForFunction(() => (document.getElementById('hkMemo') || {}).value === '성실함, 책임감 강함\n[11. 6.] 발표 목소리가 커짐');
  }],
  ['애매하면 AI(notes)에 묻고, 그래도 애매하면 후보 버튼 → 누르면 그 일', async () => {
    await send('채점');
    await page.waitForSelector(`${C} .chat-msg.bot:last-child .chat-chip`);
    const chips = await page.$$eval(`${C} .chat-msg.bot:last-child .chat-chip`, l => l.map(x => x.textContent));
    assert(chips.length >= 2 && chips.length <= 3 && chips[0] === '단원평가' && chips.includes('평가지 채점'), JSON.stringify(chips));
    assert(of('[채팅 할 일 고르기]').length === 1, 'AI에 물음');
    await page.click(`${C} .chat-msg.bot:last-child .chat-chip:has-text("평가지 채점")`);
    await page.waitForFunction(() => localStorage.getItem('ssam:nav') === JSON.stringify({ menu: 'evaluate', tab: 'gr' }));
  }],
  ['AI가 고르면 바로 시작, AI로 보내는 글은 전화번호 줄을 빼고 이름을 가림', async () => {
    await send('학부모 상담 주간 준비할 거 정리\n담임 김철수 010-1234-5678');
    await page.waitForFunction(() => { const v = JSON.parse(localStorage.getItem('ssam:letter:cur') || 'null'); return v && /상담/.test(v.memo); });
    const p = of('[채팅 할 일 고르기]').at(-1);
    assert(p.includes('상담') && !p.includes('010-1234') && !p.includes('김철수'), p);
    assert(!JSON.stringify(await chatLog()).includes('김철수') && !JSON.stringify(await chatLog()).includes('010-1234'), '기록에 남음');
    await page.waitForFunction(() => document.querySelector('#chatLog').textContent.includes('가정통신문 넣을 내용에 넣고'));
  }],
  ['번역·인수인계서: 앞에서 쓴 가정통신문을 번역 시작, 언어가 없으면 언어 고르기, 인수인계서는 열기', async () => {
    await send('가정통신문 베트남어로');
    await waitBot('베트남어로 번역하고 있어요');
    assert(JSON.stringify(await cur()) === JSON.stringify({ menu: 'etc', tab: 'letter' }), '가정통신문 탭');
    await send('번역해 줘');
    await page.waitForSelector(`${C} .chat-msg.bot:last-child .chat-chip`);
    assert(JSON.stringify(await page.$$eval(`${C} .chat-msg.bot:last-child .chat-chip`, l => l.map(x => x.textContent))) === JSON.stringify(['베트남어', '중국어(간체)', '러시아어', '영어']), '언어');
    await send('인수인계서 만들어 줘');
    await waitBot('업무 인수인계서를 열었어요');
    assert(JSON.stringify(await cur()) === JSON.stringify({ menu: 'settings', tab: 'years' }), '학년도');
    await page.waitForSelector(sheet);
    assert((await page.textContent(sheet)).includes('인수인계서'), '인수인계서 창');
    await page.keyboard.press('Escape');
  }],
  ['검토 고침 I1: 이름이 든 글도 기록에는 가린 글로(「박지훈 결석계 가정통신문」「김민수 단원평가 다시 채점」「김민수 엄마한테 쪽지」)', async () => {
    for (const text of ['박지훈 결석계 가정통신문', '김민수 단원평가 다시 채점', '김민수 엄마한테 쪽지']) await sendWait(text);
    const l = JSON.stringify(await chatLog());
    assert(!l.includes('박지훈') && !l.includes('김민수'), l.slice(-600));
    assert(l.includes('○○○ 결석계 가정통신문') && l.includes('○○○ 단원평가 다시 채점') && l.includes('○○○ 엄마한테 쪽지'), l.slice(-600));
    // 메뉴에 넘기는 글·그 메뉴의 AI에도 이름이 가지 않음(「○○○ 엄마한테 쪽지」로 쪽지를 씀)
    await until(() => of('[쪽지 안내]').some(p => p.includes('○○○ 엄마한테')), '쪽지 AI에 가린 글');
    assert(!prompts.some(p => p.includes('박지훈') || p.includes('김민수')), '어떤 AI에 이름이 감');
    await letterIdle();
  }],
  ['검토 고침 I2: 여러 줄 공문(전화번호 줄 있음) → 줄을 살려 공문 처리에 넣고 번호만 가림', async () => {
    const n = of('[공문 처리]').length;
    await sendWait('공문 처리\n제목: 2026 과학의 날 운영 안내\n담당: 교무부장 (031-123-4567)');
    await until(async () => (await gmList()).some(d => /운영 안내/.test(d.text)), '공문 처리에 없음');
    const d = (await gmList()).find(x => /운영 안내/.test(x.text));
    assert(d.text.includes('제목: 2026 과학의 날 운영 안내') && d.text.includes('교무부장') && !d.text.includes('031-123-4567') && !d.text.includes('공문 처리'), JSON.stringify(d.text));
    await until(() => of('[공문 처리]').length > n, '공문 AI 안 부름');
    const p = of('[공문 처리]').at(-1);
    assert(p.includes('과학의 날 운영 안내') && p.includes('교무부장') && !p.includes('031-123-4567'), p.slice(-300));
    assert(!JSON.stringify(await chatLog()).includes('031-123-4567'), '기록에 전화번호');
  }],
  ['검토 고침 I2·I3: 한 줄 가정통신문에 전화번호 → 번호만 가리고 그대로 씀, 언어 낱말이 내용에만 있으면 번역이 아님', async () => {
    const n = of('[가정통신문]').length, t = of('[가정통신문 번역]').length;
    const b = await sendWait('영어 캠프 안내 가정통신문 써 줘: 11월 27일 영어 캠프, 준비물 필기도구, 문의 031-123-4567');
    assert(b.includes('쓰고 있어요'), b);
    await until(() => of('[가정통신문]').length > n, '가정통신문 AI 안 부름');
    const p = of('[가정통신문]').at(-1);
    assert(p.includes('11월 27일 영어 캠프') && p.includes('필기도구') && !p.includes('031-123-4567'), p.slice(-400));
    assert(of('[가정통신문 번역]').length === t, '번역으로 감');
    await letterIdle();
  }],
  ['검토 고침 I2: 넘길 내용이 전화번호뿐이면 그 화면으로만(시작했다고 하지 않음)', async () => {
    const n = of('[공문 처리]').length, docs = (await gmList()).length;
    const b = await sendWait('공문 처리\n031-123-4567');
    assert(b.includes('공문 처리로 왔어요') && !b.includes('뽑고 있어요'), b);
    await page.waitForTimeout(300);
    assert(of('[공문 처리]').length === n && (await gmList()).length === docs, '빈 공문을 넣음');
  }],
  ['검토 고침 I5: 쓰던 가정통신문(넣을 내용)이 있으면 바꾸지 않고 끝에 덧붙이고, 섞어 쓰지 않음', async () => {
    await page.click('nav.app-side [data-menu-go="etc"]'); await page.click('#menuTabs [data-tab="letter"]');
    await page.click(`${LB} [data-lf="new"]`);
    await page.fill(`${LB} #lfMemo`, '가을 운동회 준비물 안내(체육복·물)');
    const n = of('[가정통신문]').length;
    const b = await sendWait('가정통신문 써 줘: 12월 4일 학예회 안내');
    const x = await letterCur();
    assert(x.memo.includes('가을 운동회 준비물 안내(체육복·물)') && x.memo.includes('12월 4일 학예회 안내') && x.memo.indexOf('운동회') < x.memo.indexOf('학예회') && !x.out, JSON.stringify(x.memo));
    assert(b.includes('덧붙였어요') && !b.includes('쓰고 있어요'), b);
    await page.waitForTimeout(300);
    assert(of('[가정통신문]').length === n, '두 내용을 섞어 씀');
    assert((await page.inputValue(`${LB} #lfMemo`)).includes('12월 4일 학예회 안내'), '화면');
  }],
  ['검토 고침 M10: 이미 쓰는 중·번역하는 중이면 「쓰는 중이에요」(시작했다고 하지 않음)', async () => {
    await page.click(`${LB} [data-lf="new"]`);
    slow = 1500;
    const n = of('[가정통신문]').length;
    const a = await sendWait('가정통신문 써 줘: 12월 11일 겨울방학 안내');
    assert(a.includes('쓰고 있어요'), a);
    const b = await sendWait('가정통신문 써 줘: 12월 18일 졸업식 안내');
    assert(b.includes('쓰는 중이에요') && !b.includes('쓰고 있어요'), b);
    const c = await sendWait('가정통신문 러시아어로');
    assert(c.includes('쓰는 중이에요') && !c.includes('번역하고 있어요'), c);
    await letterIdle();
    assert(of('[가정통신문]').length === n + 1, '한 번만 씀');
    // 쓰는 중에 받은 글은 새 가정통신문의 넣을 내용에 남아 있음
    assert((await letterCur()).memo.includes('12월 18일 졸업식 안내'), JSON.stringify((await letterCur()).memo));
    // 다 쓴 겨울방학 안내를 열고 번역 → 번역하는 중에 또 부르면
    await page.click(`${LB} #lfRecent [data-lf-open]`);
    const d = await sendWait('가정통신문 러시아어로');
    assert(d.includes('러시아어로 번역하고 있어요'), d);
    const e = await sendWait('가정통신문 중국어로');
    assert(e.includes('번역하는 중이에요') && !e.includes('번역하고 있어요'), e);
    await letterIdle();
    await page.waitForSelector(`${LB} #lfTrCard .lf-tr-note`);
    slow = 0;
  }],
  ['검토 고침 M1: AI가 준비되지 않으면 「쓰고 있어요·뽑고 있어요·번역하고 있어요」 대신 설정 안내', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: '' }, remember: true })));
    await page.reload(); await page.waitForTimeout(400);
    const n = prompts.length;
    for (const [text, no] of [['가정통신문 영어로', '번역하고 있어요'], ['11월 12일 3시 과학실 AI 연수 안내 쪽지 써 줘', '쓰고 있어요'], ['가정통신문 써 줘: 12월 24일 겨울방학식 안내', '쓰고 있어요'],
      ['공문: 독서 주간 운영 결과를 12월 1일까지 제출', '뽑고 있어요'], ['결과 보고 써 줘: 과학의 날 행사를 4월 21일에 했어요', '쓰고 있어요']]) {
      const b = await sendWait(text);
      assert(b.includes('설정 › AI') && b.includes('시험용 AI') && !b.includes(no), `${text} → ${b}`);
    }
    assert(prompts.length === n, 'AI를 부름');
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
    await page.reload(); await page.waitForTimeout(400);
  }],
  ['검토 고침 M2: 학급 명단에 없는 번호(35번)는 메모 줄을 만들지 않고 알림', async () => {
    await page.evaluate(() => window.SSAM.setClass(25, []));
    const b = await sendWait('35번 발표 목소리가 커짐');
    assert(b.includes('35번') && b.includes('학급 명단에 없는 번호') && !b.includes('메모에 넣었어요'), b);
    const c = await sendWait('3·35번 줄 서기 잘함');
    assert(c.includes('3번 행동특성 메모에 넣었어요') && c.includes('35번') && c.includes('학급 명단에 없는 번호'), c);
    // 행특은 0.5초 뒤에 저장함
    await page.waitForFunction(() => ((JSON.parse(localStorage.getItem('ssam:hk')) || { students: [] }).students.find(s => s.no === 3) || {}).memo?.endsWith('[11. 6.] 줄 서기 잘함'));
    const h = await hk();
    assert(!h.students.some(s => s.no === 35) && h.students.some(s => s.no === 25), JSON.stringify(h.students.map(s => [s.no, s.memo])));
  }],
  ['파일: 채팅 창에 놓으면 받는 곳 흐름(확인 카드)·창이 열려 있으면 놓기 판은 안 뜸, 📎는 파일 고르기', async () => {
    await openChat();
    const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File(['번호,성명\n1,가\n2,나'], '김민수네_명단.csv', { type: 'text/csv' })); return d; });
    await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
    await page.dispatchEvent('body', 'dragover', { dataTransfer: dt, clientX: 1250, clientY: 830 });
    assert(await page.isHidden('#inboxPad'), '판이 채팅 창을 가림');
    await page.dispatchEvent(C, 'dragover', { dataTransfer: dt });
    assert(await page.evaluate(() => document.getElementById('chatPanel').classList.contains('drop')), '놓기 표시');
    await page.dispatchEvent(C, 'drop', { dataTransfer: dt });
    await page.waitForSelector(`${sheet} #ibRun`);
    assert((await page.textContent(sheet)).includes('명단.csv'), '확인 카드');
    // 검토 고침 I1: 파일 이름(학생 이름이 들 수 있음)은 기록에 남기지 않음 — 이 창에서만 보임
    const l = JSON.stringify(await chatLog());
    assert(l.includes('파일 1개를 받았어요') && !l.includes('김민수') && !l.includes('명단.csv'), l.slice(-300));
    assert((await page.textContent('#chatLog')).includes('김민수네_명단.csv'), '이 창에서는 보임');
    await page.keyboard.press('Escape');
    assert(await page.locator(sheet).count() === 0 && await page.isVisible(C), 'Esc는 카드만 닫음');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(`${C} [data-chat="attach"]`)]);
    assert(fc.isMultiple(), '여러 파일');
    await fc.setFiles(join(FIXTURES, 'roster-sample.csv'));
    await page.waitForSelector(`${sheet} #ibRun`);
    await page.click(`${sheet} [data-close]`);
  }],
  ['기록: 최근 30개만 저장, 새로 고침 뒤에도 남고 [지우기]로 비움', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:chat', JSON.stringify(Array.from({ length: 40 }, (_, i) => ({ id: 'old' + i, who: 'me', text: '옛 글 ' + i, at: i + 1 })))));
    await send('창체');
    await waitBot('창의적 체험활동으로 왔어요');
    const l = await chatLog();
    assert(l.length === 30 && l.at(-1).text.includes('창의적 체험활동') && !l.some(m => m.text === '옛 글 11'), l.length + ' ' + l[0].text);
    await page.reload(); await page.waitForTimeout(400);
    await openChat();
    assert((await page.textContent('#chatLog')).includes('창의적 체험활동으로 왔어요'), '새로 고침 뒤');
    await page.click(`${C} [data-chat="clear"]`);
    assert((await chatLog()).length === 0 && (await page.locator(`${C} .chat-msg.me`).count()) === 0, '지우기');
    await page.click(`${C} [data-chat="close"]`);
  }],
  ['Windows 바탕화면 버튼: 누르면 같은 저장소에 적고 쌤비서 창을 엶 → 쌤비서 창이 채팅을 엶', async () => {
    assert(await page.isHidden(C), '닫혀 있어야 함');
    const b = await ctx.newPage();
    await b.clock.setFixedTime(FRI);
    await b.addInitScript(() => {
      window.__calls = [];
      window.__TAURI__ = {
        core: { invoke: (cmd, args) => { window.__calls.push([cmd, args]); return Promise.resolve(1); } },
        event: { listen: () => Promise.resolve(() => {}) },
        window: { getCurrentWindow: () => ({ onMoved: () => Promise.resolve(() => {}), setPosition: () => Promise.resolve(), startDragging: () => Promise.resolve() }), currentMonitor: () => Promise.resolve(null), availableMonitors: () => Promise.resolve([]) },
        webview: { getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }) },
        dpi: { PhysicalPosition: function (x, y) { this.x = x; this.y = y; } }
      };
    });
    await b.goto(url + 'bubble.html');
    await b.waitForSelector('#bubble svg.ssam-mark path.sm-t');
    await b.click('#bubble');
    assert((await b.evaluate(() => window.__calls)).some(c => c[0] === 'bubble_action' && c[1].action === 'open'), '창 열기');
    await page.waitForSelector(`${C}:not([hidden])`);
    assert(await page.evaluate(() => localStorage.getItem('ssam:chat:open')) === null, '알림을 지우지 않음');
    await b.close();
  }],
  ['머리 줄 채팅 단추: 떠 있는 버튼을 꺼도(Windows 앱은 늘 숨김) 채팅을 열고 닫음', async () => {
    if (!(await page.isHidden(C))) await page.click(`${C} [data-chat="close"]`);
    await page.evaluate(() => { const b = document.getElementById('inboxFab'); if (b) b.hidden = true; });
    await page.click('#chatTop');
    await page.waitForSelector(`${C}:not([hidden])`);
    assert(await page.getAttribute('#chatTop', 'aria-expanded') === 'true', '열림 표시');
    await page.click('#chatTop');
    await page.waitForSelector(C, { state: 'hidden' });
    await page.evaluate(() => { const b = document.getElementById('inboxFab'); if (b) b.hidden = false; });
  }],
  ['390px 폭: 채팅 창이 화면 안, 가로로 넘치지 않음', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openChat();
    const p = await page.locator(C).boundingBox();
    assert(p && p.x >= 0 && p.x + p.width <= 390 && p.y >= 0, JSON.stringify(p));
    const f = await page.locator('#inboxFab').boundingBox();
    assert(f.y >= p.y + p.height, '버튼을 가림');
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['페이지 오류 없음(없는 파일 없음)', async () => {
    assert(missing.length === 0, missing.join(', '));
    assert(errors.length === 0, errors.join(' | '));
  }]
]);
await t.close();
