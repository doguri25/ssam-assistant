// 문서·소통 › 회의록(스펙 2026-11-15 2장): 메모 붙여 넣기·파일(글은 넣기 칸으로, 사진은 AI가 있을 때 그림 그대로) → [정리하기](업무 doc, 이름·연락처는 가려 보내고 되돌림,
// 명단·주민번호 줄과 참석 칸은 보내지 않음) → 칸·안건 카드(줄 더하기·빼기)·할 일 표(체크·담당·기한)·다음 회의, 고친 칸은 다시 정리해도 그대로,
// [복사](개조식)·한글 내려받기·학교 양식 자리, 최근 회의록([열기]·[삭제] 묻고), 「오늘」 기한 카드·채팅 「오늘 할 일」의 「회의 할 일」(누르면 그 회의록), 휴대폰 390·360px
import { open, run, assert, mockClaude, enter } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await t.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await page.clock.setFixedTime(new Date('2026-11-15T10:00:00')); // 일요일
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const prompts = [], imgs = [];
let reply = null, gate = null; // reply: 답(또는 프롬프트 → 답), gate: 이 약속이 풀릴 때까지 답하지 않음(정리하는 중 시험)
await mockClaude(page, async ({ prompt, images }) => {
  prompts.push(prompt); imgs.push(images);
  if (prompt.startsWith('[회의록 정리]')) { if (gate) await gate; return JSON.stringify(typeof reply === 'function' ? reply(prompt) : reply); }
  return '{}';
});
const P = 'section[data-menu="etc"]';
const B = `${P} .mn-box`;
const mins = () => prompts.filter(p => p.startsWith('[회의록 정리]'));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:minutes:list') || '[]'));
const until = async (fn, what, ms = 6000) => { const end = Date.now() + ms; while (!(await fn())) { if (Date.now() > end) throw new Error(what); await page.waitForTimeout(50); } };
const waitBot = s => page.waitForFunction(s => [...document.querySelectorAll('#chatLog .chat-msg.bot .chat-bub')].some(b => b.textContent.includes(s)), s);
const chatSend = async text => { if (await page.isHidden('#chatPanel')) await page.click('#inboxFab'); await page.waitForSelector('#chatPanel:not([hidden])'); await page.fill('#chatText', text); await page.click('#chatSend'); };
const chatClose = async () => { if (await page.isVisible('#chatPanel')) await page.click('#chatPanel [data-chat="close"]'); };
const toastHas = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent && document.querySelector('#toast').textContent.includes(s), s);
const MEMO = ['3학년 학년 협의회 11월 12일 15시 3학년 연구실', '참석: 김하늘 이바다 한가람 박솔 최하은',
  '1. 현장체험학습 장소 — 과학관과 박물관 이야기함. 과학관으로 정함', '- 버스 예약은 이바다 선생님이 11월 20일까지 (문의 010-1234-5678)',
  '2. 학부모 상담 주간 — 신청은 가정통신문으로 받기로', '김하늘 080101-3123456', '다음 회의 11월 26일 사전 교육'].join('\n');
const REPLY1 = {
  title: '3학년 학년 협의회', date: '11-12', time: '15:00', place: '3학년 연구실', attendees: '3학년 담임 5명',
  agenda: [{ title: '현장체험학습 장소', discussion: ['과학관과 박물관을 두고 협의함'], decisions: ['과학관으로 정함'] },
    { title: '학부모 상담 주간', discussion: ['상담 신청 방법을 협의함'], decisions: ['가정통신문으로 신청을 받기로 함'] }],
  todos: [{ task: '버스 예약', who: '〔이름1〕 선생님', due: '11-20' }, { task: '상담 안내 가정통신문 보내기', who: '', due: '' }],
  next: { date: '11-26', topic: '체험학습 사전 교육' }
};
await page.goto(url);
await page.waitForTimeout(400);

await run('minutes', [
  ['문서·소통 › 「회의록」 탭: 넣기 칸·[정리하기]·파일 고르기·칸·AI로 가는 것 안내', async () => {
    await enter(page, 'etc', 'minutes');
    await page.waitForSelector(`${B} #mnPaste`);
    assert((await page.textContent('#menuTabs')).includes('회의록'), '탭');
    assert((await page.textContent(`${B} h2`)) === '회의록', await page.textContent(`${B} h2`));
    assert(await page.isVisible(`${B} [data-mn="read"]`) && await page.locator(`${B} #mnFile`).count() === 1, '정리하기·파일');
    assert(await page.locator(`${B} [data-ai-row="doc"]`).count() === 1, 'AI 줄(doc)');
    const kinds = await page.locator(`${B} [data-mnf="kind"] option`).allInnerTexts();
    assert(kinds.join('|') === '학년 협의회|교과 협의회|부서 협의회|학교운영위원회|기타', kinds.join('|'));
    const note = await page.textContent(`${B} .ai-note`);
    assert(note.includes('가려') && note.includes('참석 칸은 보내지 않아요') && note.includes('그림 그대로'), note);
    // 다른 탭은 숨김
    await page.click('#menuTabs [data-tab="message"]');
    assert(await page.isHidden(B), '쪽지 탭에서 숨김');
    await page.click('#menuTabs [data-tab="minutes"]');
    assert(await page.isVisible(B), '다시 보임');
  }],
  ['메모 붙여 넣고 종류·참석을 먼저 적은 뒤 [정리하기] → 가려 보냄(이름·전화·명단·주민번호 줄·참석 칸 없음) → 칸·안건·할 일(이름 되돌림)', async () => {
    reply = REPLY1;
    await page.fill(`${B} #mnPaste`, MEMO);
    await page.selectOption(`${B} [data-mnf="kind"]`, 'grade');
    await page.fill(`${B} [data-mnf="attendees"]`, '교장 한가람 외 5명');
    await page.click(`${B} [data-mn="read"]`);
    await page.waitForFunction(b => (document.querySelector(`${b} [data-mnf="title"]`) || {}).value === '3학년 학년 협의회', B);
    assert(mins().length === 1, 'AI 요청 ' + mins().length);
    const p = mins()[0];
    assert(!/김하늘|이바다|한가람|010-1234-5678|080101/.test(p), p.slice(-900));
    assert(p.includes('〔이름1〕 선생님이 11월 20일까지') && p.includes('회의 종류: 학년 협의회') && !p.includes('교장'), p.slice(-900));
    assert(await page.inputValue(`${B} [data-mnf="date"]`) === '2026-11-12', await page.inputValue(`${B} [data-mnf="date"]`));
    assert(await page.inputValue(`${B} [data-mnf="attendees"]`) === '교장 한가람 외 5명', '참석 칸은 선생님 글 그대로');
    assert(await page.inputValue(`${B} [data-mnf="kind"]`) === 'grade', '종류');
    assert(await page.locator(`${B} .mn-ag`).count() === 2, '안건 카드 수');
    assert(await page.inputValue(`${B} [data-mna="0"]`) === '현장체험학습 장소', '안건 제목');
    assert(await page.inputValue(`${B} [data-mnl="0"][data-mnk="decisions"][data-mnj="0"]`) === '과학관으로 정함', '결정');
    assert(await page.inputValue(`${B} [data-mnt="0"][data-mnk="who"]`) === '이바다 선생님', '이름 되돌림: ' + await page.inputValue(`${B} [data-mnt="0"][data-mnk="who"]`));
    assert(await page.inputValue(`${B} [data-mnt="0"][data-mnk="due"]`) === '2026-11-20', '기한');
    assert(await page.inputValue(`${B} [data-mnn="date"]`) === '2026-11-26', '다음 회의');
    await toastHas('보내지 않았어요');
    const s = await stored();
    assert(s.length === 1 && s[0].title === '3학년 학년 협의회' && s[0].todos.length === 2, JSON.stringify(s).slice(0, 300));
    assert(!JSON.stringify(s).includes('080101') && !JSON.stringify(s).includes('과학관과 박물관 이야기함'), '메모 글은 저장하지 않음');
  }],
  ['고치기: 협의 내용 줄 더하기·결정 줄 빼기·안건 더하기, 할 일 체크·담당·더하기 → 저장', async () => {
    await page.click(`${B} [data-mn-addl="0"][data-mnk="discussion"]`);
    const nl = `${B} [data-mnl="0"][data-mnk="discussion"][data-mnj="1"]`;
    await page.waitForSelector(nl);
    assert(await page.evaluate(s => document.activeElement === document.querySelector(s), nl), '새 줄에 초점');
    await page.fill(nl, '거리와 비용을 비교함');
    await page.click(`${B} [data-mn-dell="1"][data-mnk="decisions"][data-mnj="0"]`);
    await page.waitForFunction(b => !document.querySelector(`${b} [data-mnl="1"][data-mnk="decisions"][data-mnj="0"]`), B);
    await page.click(`${B} [data-mn="addAgenda"]`);
    await page.fill(`${B} [data-mna="2"]`, '기타 안건');
    await page.check(`${B} [data-mnt-done="1"]`);
    await page.fill(`${B} [data-mnt="1"][data-mnk="who"]`, '3학년 부장');
    await page.click(`${B} [data-mn="addTodo"]`);
    await page.fill(`${B} [data-mnt="2"][data-mnk="task"]`, '안전 교육 자료 만들기');
    await page.fill(`${B} [data-mnt="2"][data-mnk="due"]`, '2026-11-18');
    await page.waitForTimeout(150);
    const s = (await stored())[0];
    assert(s.agenda[0].discussion[1] === '거리와 비용을 비교함' && s.agenda[1].decisions.length === 0 && s.agenda[2].title === '기타 안건', JSON.stringify(s.agenda));
    assert(s.todos[1].done === true && s.todos[1].who === '3학년 부장' && s.todos[2].task === '안전 교육 자료 만들기' && s.todos[2].due === '2026-11-18', JSON.stringify(s.todos));
  }],
  ['다시 [정리하기]: 고친 칸(이름·안건·할 일)은 그대로, 안 고친 칸은 새 답', async () => {
    await page.fill(`${B} [data-mnf="title"]`, '3학년 협의회(11월)');
    reply = { ...REPLY1, title: 'AI가 바꾼 이름', place: '도서실', agenda: [{ title: 'AI 새 안건' }], todos: [{ task: 'AI 새 할 일' }] };
    await page.click(`${B} [data-mn="read"]`);
    await page.waitForFunction(b => (document.querySelector(`${b} [data-mnf="place"]`) || {}).value === '도서실', B);
    assert(mins().length === 2, 'AI 요청 ' + mins().length);
    assert(await page.inputValue(`${B} [data-mnf="title"]`) === '3학년 협의회(11월)', '이름 그대로');
    assert(await page.inputValue(`${B} [data-mna="0"]`) === '현장체험학습 장소' && await page.locator(`${B} .mn-ag`).count() === 3, '안건 그대로');
    assert(await page.inputValue(`${B} [data-mnt="2"][data-mnk="task"]`) === '안전 교육 자료 만들기', '할 일 그대로');
    await toastHas('그대로');
  }],
  ['[복사]: 개조식 글(머리·일시·안건·할 일·다음 회의)', async () => {
    await page.click(`${B} [data-mn="copy"]`);
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert(clip.startsWith('[학년 협의회] 3학년 협의회(11월)\n□ 일시: 2026. 11. 12.(목) 15:00\n□ 장소: 도서실\n□ 참석: 교장 한가람 외 5명'), clip.slice(0, 200));
    assert(clip.includes('1. 현장체험학습 장소\n  ○ 협의 내용\n    - 과학관과 박물관을 두고 협의함\n    - 거리와 비용을 비교함\n  ○ 결정 사항\n    - 과학관으로 정함'), clip);
    assert(clip.includes('  - 버스 예약 (담당: 이바다 선생님, 기한: 11. 20.(금))') && clip.includes('  - [완료] 상담 안내 가정통신문 보내기 (담당: 3학년 부장)'), clip);
    assert(clip.includes('□ 다음 회의: 11. 26.(목) / 체험학습 사전 교육'), clip);
  }],
  ['내보내기: 쌤비서 기본 회의록 한글 파일, 학교 양식 자리([학교 양식 넣기])', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${B} [data-mn="export"]`)]);
    assert(dl.suggestedFilename() === '3학년 협의회(11월) 회의록.hwpx', dl.suggestedFilename());
    await page.waitForSelector(`${B} .sf-slot[data-sf="minutes"] [data-sf-add="minutes"]`);
  }],
  ['파일: 글 파일은 넣기 칸으로(정리는 [정리하기]), 사진은 AI가 있을 때 그림 그대로 보냄', async () => {
    await page.click(`${B} [data-mn="new"]`);
    await page.waitForFunction(b => document.querySelector(`${b} [data-mnf="title"]`).value === '' && document.querySelector(`${b} #mnPaste`).value === '', B);
    await page.setInputFiles(`${B} #mnFile`, [{ name: '교과 협의 메모.txt', mimeType: 'text/plain', buffer: Buffer.from('6학년 과학 교과 협의회\n실험 안전 수칙 정함') }]);
    await page.waitForFunction(b => document.querySelector(`${b} #mnPaste`).value.includes('실험 안전 수칙 정함'), B);
    assert(mins().length === 2, '파일을 넣기만 해서는 AI를 부르지 않음');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.setInputFiles(`${B} #mnFile`, [{ name: '판서.png', mimeType: 'image/png', buffer: png }]);
    await page.waitForSelector(`${B} #mnImgs [data-mn-img-del="0"]`);
    assert((await page.textContent(`${B} #mnImgs`)).includes('그림 그대로'), await page.textContent(`${B} #mnImgs`));
    reply = { title: '6학년 과학 교과 협의회', agenda: [{ title: '실험 안전', decisions: ['실험 안전 수칙을 정함'] }], todos: [] };
    await page.click(`${B} [data-mn="read"]`);
    await page.waitForFunction(b => document.querySelector(`${b} [data-mnf="title"]`).value === '6학년 과학 교과 협의회', B);
    assert(imgs[imgs.length - 1] === 1, '그림 수 ' + imgs[imgs.length - 1]);
    assert(mins()[mins().length - 1].includes('그림 1장'), '그림 안내');
    assert(await page.inputValue(`${B} [data-mnf="kind"]`) === 'subject', '이름으로 종류 짐작: ' + await page.inputValue(`${B} [data-mnf="kind"]`));
    await toastHas('그림 그대로');
  }],
  ['최근 회의록: 늦게 고친 것 먼저, [열기]로 그 회의록, [삭제]는 묻고 지움', async () => {
    const rows = await page.locator(`${B} #mnRecent li`).allInnerTexts();
    assert(rows.length === 2 && rows[0].includes('6학년 과학 교과 협의회') && rows[1].includes('3학년 협의회(11월)'), JSON.stringify(rows));
    assert(rows[1].includes('할 일 2개 남음'), rows[1]);
    await page.click(`${B} #mnRecent li:nth-child(2) [data-mn-open]`);
    await page.waitForFunction(b => document.querySelector(`${b} [data-mnf="title"]`).value === '3학년 협의회(11월)', B);
    assert(await page.locator(`${B} .mn-ag`).count() === 3, '안건도');
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.dismiss(); });
    await page.click(`${B} #mnRecent li:nth-child(1) [data-mn-del]`);
    await page.waitForTimeout(150);
    assert(asked.includes('6학년 과학 교과 협의회') && (await stored()).length === 2, '취소하면 그대로: ' + asked);
    page.once('dialog', d => d.accept());
    await page.click(`${B} #mnRecent li:nth-child(1) [data-mn-del]`);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:minutes:list')).length === 1);
    assert(await page.locator(`${B} #mnRecent li`).count() === 1, '목록에서 빠짐');
  }],
  ['「오늘」 기한 카드: 끝내지 않은 할 일(7일 안·지남)을 「회의 할 일」로 — 공문 기한과 같은 배지, 누르면 그 회의록', async () => {
    await page.click('nav.app-side [data-menu-go="home"]');
    const H = 'section[data-menu="home"]';
    await page.waitForSelector(`${H} .hm-gm [data-hm-mn]`);
    const rows = await page.locator(`${H} .hm-gm .hm-line`).allInnerTexts();
    // 버스 예약(D-5)·안전 교육 자료(D-3) — 끝낸 할 일은 빠짐
    assert(rows.length === 2 && rows[0].includes('회의 할 일') && rows[0].includes('안전 교육 자료 만들기') && rows[0].includes('D-3') && rows[1].includes('버스 예약'), JSON.stringify(rows));
    assert((await page.textContent(`${H} #hmGmH`)) === '공문·회의 기한', await page.textContent(`${H} #hmGmH`));
    assert((await page.textContent(`${H} .hm-head h2`)) === '오늘 챙길 일 2가지', await page.textContent(`${H} .hm-head h2`));
    await page.click(`${H} .hm-gm [data-hm-mn]`);
    await page.waitForFunction(b => { const x = document.querySelector(b); return x && x.checkVisibility() && x.querySelector('[data-mnf="title"]').value === '3학년 협의회(11월)'; }, B);
    assert((await page.textContent('#menuTitle')) === '문서·소통', await page.textContent('#menuTitle'));
  }],
  ['「오늘」 기한 카드 차례: 오늘·D-n 먼저(공문·회의 할 일 섞어 가까운 차례), 지난 것은 그 뒤 — 56일 지난 할 일이 오늘·D-2를 가리지 않음', async () => {
    const H = 'section[data-menu="home"]';
    const keep = await page.evaluate(() => ['ssam:minutes:list', 'ssam:gongmun:list'].map(k => localStorage.getItem(k)));
    await page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem('ssam:minutes:list'));
      l.push({ id: 'mnSep', at: 1, kind: 'grade', title: '9월 학년 협의회', todos: [{ task: '체험학습 결과 보고서 내기', due: '2026-09-20', done: false }, { task: '학년 소식지 원고 내기', due: '2026-11-15', done: false }] });
      localStorage.setItem('ssam:minutes:list', JSON.stringify(l));
      localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gmA', title: '과학의 날 참가 신청', due: '2026-11-17', done: false, tasks: [], at: 1 }, { id: 'gmB', title: '안전 점검 결과 보고', due: '2026-11-13', done: false, tasks: [], at: 2 }]));
    });
    try {
      await page.click('nav.app-side [data-menu-go="home"]');
      await page.waitForSelector(`${H} .hm-gm [data-hm-mn="mnSep"]`);
      const rows = await page.locator(`${H} .hm-gm .hm-line`).allInnerTexts();
      // 소식지(오늘)·공문(D-2)·안전 교육 자료(D-3)·버스 예약(D-5), 지난 공문(2일)은 그 뒤 — 56일 지난 체험학습 보고서는 회의 할 일 3개 밖
      const want = [['학년 소식지 원고 내기', '오늘'], ['과학의 날 참가 신청', 'D-2'], ['안전 교육 자료 만들기', 'D-3'], ['버스 예약', 'D-5'], ['안전 점검 결과 보고', '지남']];
      assert(rows.length === want.length && want.every(([s, b], i) => rows[i].includes(s) && rows[i].includes(b)) && !rows.join('').includes('체험학습 결과 보고서'), JSON.stringify(rows));
      assert((await page.textContent(`${H} .hm-head h2`)) === '오늘 챙길 일 5가지', await page.textContent(`${H} .hm-head h2`));
    } finally { // 다음 시험을 위해 되돌림
      await page.evaluate(keep => ['ssam:minutes:list', 'ssam:gongmun:list'].forEach((k, i) => (keep[i] == null ? localStorage.removeItem(k) : localStorage.setItem(k, keep[i]))), keep);
      await enter(page, 'etc', 'minutes');
      await page.waitForFunction(b => { const x = document.querySelector(b); return x && x.checkVisibility(); }, B);
    }
  }],
  ['채팅 「오늘 할 일」: 「회의 할 일 「…」」(D-n), 누르면 그 회의록', async () => {
    await page.click(`${B} [data-mn="new"]`); // 다른 회의록을 보다가
    await page.click('#inboxFab');
    await page.waitForSelector('#chatPanel:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#chatPanel .chat-brief').textContent.includes('회의 할 일'));
    const b = await page.textContent('#chatPanel .chat-brief');
    assert(b.includes('회의 할 일 「안전 교육 자료 만들기」') && b.includes('D-3') && b.includes('회의 할 일 「버스 예약」') && !b.includes('상담 안내'), b);
    await page.click('#chatPanel .cb-line:has-text("버스 예약")');
    await page.waitForFunction(b => { const x = document.querySelector(b); return x && x.checkVisibility() && x.querySelector('[data-mnf="title"]').value === '3학년 협의회(11월)'; }, B);
    if (await page.isVisible('#chatPanel')) await page.click('#chatPanel [data-chat="close"]');
  }],
  ['휴대폰 390·360px: 가로로 넘치지 않고 누르는 칸이 겹치지 않음', async () => {
    for (const w of [390, 360]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      const r = await page.evaluate(b => {
        const box = document.querySelector(b), out = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push('문서 너비 ' + document.documentElement.scrollWidth);
        const els = [...box.querySelectorAll('button, input:not([type=checkbox]):not([type=file]), select, textarea')].filter(e => e.checkVisibility());
        for (const e of els) { const q = e.getBoundingClientRect(); if (q.right > innerWidth + 1 || q.left < -1) out.push('넘침: ' + (e.dataset.mn || e.dataset.mnf || e.id || e.textContent).slice(0, 20) + ' ' + Math.round(q.left) + '~' + Math.round(q.right)); }
        const rs = els.map(e => [e, e.getBoundingClientRect()]).filter(([, q]) => q.width > 2 && q.height > 2);
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
          const [a, x] = rs[i], [c, y] = rs[j];
          if (a.contains(c) || c.contains(a)) continue;
          if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 3 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 3) out.push(`겹침: ${(a.dataset.mn || a.dataset.mnf || a.textContent || a.id).slice(0, 15)} × ${(c.dataset.mn || c.dataset.mnf || c.textContent || c.id).slice(0, 15)}`);
        }
        return out;
      }, B);
      assert(!r.length, `${w}px: ${r.slice(0, 5).join(' / ')}`);
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['채팅 「회의록 정리해 줘」+메모: 가리기 전 글을 넘겨(가린 ○○○가 아님) 이름을 되돌려 넣음, AI에는 가려 보냄, 채팅 기록은 가린 글 그대로·메모는 저장하지 않음', async () => {
    const n0 = mins().length;
    const CM = ['5학년 학년 협의회', '- 5-2 김하늘 결석 3일, 한가람 선생님이 보호자 상담', '- 체험학습 버스 예약 11월 20일까지'];
    // AI가 메모 줄을 그대로 옮겨 쓴 답(자리 표시 그대로)
    reply = p => ({ title: '5학년 학년 협의회', date: '11-12', agenda: [{ title: '학생 상담', discussion: p.split('\n[메모]\n')[1].split('\n\n[출력]')[0].split('\n').slice(1), decisions: [] }], todos: [] });
    await chatSend(['회의록 정리해 줘', ...CM].join('\n'));
    await waitBot('회의록에 넣고');
    await page.waitForFunction(b => (document.querySelector(`${b} [data-mnf="title"]`) || {}).value === '5학년 학년 협의회', B);
    assert(mins().length === n0 + 1, 'AI 요청 ' + (mins().length - n0));
    const p = mins()[mins().length - 1];
    assert(!/김하늘|한가람|○○○/.test(p) && p.includes('결석 3일'), p.slice(p.indexOf('[메모]')));
    const l0 = await page.inputValue(`${B} [data-mnl="0"][data-mnk="discussion"][data-mnj="0"]`);
    assert(l0 === '5-2 김하늘 결석 3일, 한가람 선생님이 보호자 상담', '이름 되돌림: ' + l0);
    assert(JSON.stringify((await stored()).find(x => x.title === '5학년 학년 협의회')).includes('김하늘'), '회의록에 이름');
    const me = (await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:chat') || '[]'))).filter(m => m.who === 'me').pop();
    assert(me && me.text.includes('○○○ 결석 3일') && !/김하늘|한가람/.test(me.text), '채팅 기록은 가린 글: ' + (me && me.text));
    const leak = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'ssam:minutes:list' && /김하늘|한가람/.test(localStorage.getItem(k))));
    assert(!leak.length, '메모가 남은 곳: ' + leak.join(','));
    await chatClose();
  }],
  ['채팅의 짧은 회의록 말(「3학년 협의회 회의록 보여 줘」「회의 내용 정리해 줘」)은 회의록 탭만 엶 — AI를 부르지 않고 새 회의록을 만들지 않음', async () => {
    const n0 = mins().length, s0 = (await stored()).length;
    for (const s of ['3학년 협의회 회의록 보여 줘', '회의 내용 정리해 줘']) {
      const before = await page.locator('#chatLog .chat-msg.bot').count().catch(() => 0);
      await chatSend(s);
      await page.waitForFunction(n => document.querySelectorAll('#chatLog .chat-msg.bot').length > n, before);
      await waitBot('문서·소통 › 회의록으로 왔어요');
    }
    await page.waitForTimeout(200);
    assert(mins().length === n0 && (await stored()).length === s0, `AI ${mins().length - n0}번, 회의록 ${(await stored()).length - s0}개 더`);
    assert(await page.isVisible(B), '회의록 탭');
    await chatClose();
  }],
  ['정리하는 동안: 채팅·새 회의록에서는 새로 정리하지 않음(「다른 회의록을 정리하는 중」), 정리 중인 회의록을 다시 열면 「정리하는 중」 → 결과, 그 뒤 고쳐도 결과가 남음', async () => {
    let release;
    gate = new Promise(r => { release = r; });
    reply = { title: '5학년 학년 협의회', date: '11-12', place: '5학년 연구실', agenda: [{ title: '다시 정리한 안건', discussion: ['과학관으로 정함'], decisions: [] }], todos: [] };
    const n0 = mins().length, s0 = (await stored()).length;
    const RD = `${B} [data-mn="read"]`;
    await page.fill(`${B} #mnPaste`, '5학년 학년 협의회\n- 체험학습 장소 과학관으로 정함');
    await page.click(RD);
    await until(async () => mins().length === n0 + 1, 'AI를 부르지 않음');
    assert(await page.isDisabled(RD) && (await page.textContent(RD)).includes('정리하는 중'), '정리하는 중');
    // 채팅으로 또 부탁해도 새 회의록을 만들지 않음 — 채팅의 「다른 회의록을 정리하는 중」
    await chatSend('회의록 정리해 줘\n교과 협의회\n- 수업 나눔 3회 운영');
    await waitBot('다른 회의록을 정리하는 중');
    await chatClose();
    assert(mins().length === n0 + 1, '또 정리함 ' + (mins().length - n0));
    assert(await page.inputValue(`${B} [data-mnf="title"]`) === '5학년 학년 협의회' && await page.isDisabled(RD), '보던 회의록 그대로(정리하는 중)');
    // 새 회의록의 [정리하기]도 기다림
    await page.click(`${B} [data-mn="new"]`);
    await page.waitForFunction(b => document.querySelector(`${b} [data-mnf="title"]`).value === '', B);
    await page.fill(`${B} #mnPaste`, '교무부 부서 협의회\n- 연수 일정 정함');
    await page.click(RD);
    await toastHas('다른 회의록을 정리하는 중');
    assert(mins().length === n0 + 1, '새 회의록도 정리함 ' + (mins().length - n0));
    // 정리 중인 회의록을 다시 열면 저장된 옛 사본이 아니라 「정리하는 중」, 다 되면 결과
    await page.click(`${B} #mnRecent li:has-text("5학년 학년 협의회") [data-mn-open]`);
    await page.waitForFunction(b => document.querySelector(`${b} [data-mnf="title"]`).value === '5학년 학년 협의회', B);
    assert(await page.isDisabled(RD) && (await page.textContent(RD)).includes('정리하는 중'), '다시 열어도 정리하는 중');
    release(); gate = null;
    await page.waitForFunction(b => document.querySelector(`${b} [data-mnf="place"]`).value === '5학년 연구실', B);
    assert(await page.inputValue(`${B} [data-mna="0"]`) === '다시 정리한 안건' && !(await page.isDisabled(RD)), '결과');
    await page.fill(`${B} [data-mnf="time"]`, '15:00');
    await page.waitForTimeout(150);
    const a = (await stored()).find(x => x.title === '5학년 학년 협의회');
    assert(a && a.place === '5학년 연구실' && a.time === '15:00' && a.agenda[0].title === '다시 정리한 안건', JSON.stringify(a).slice(0, 300));
    assert((await stored()).length === s0, '회의록 수 ' + (await stored()).length);
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join('\n')); }]
]);
await t.close();
