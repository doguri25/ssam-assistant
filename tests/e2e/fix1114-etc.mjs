// 문서·소통 버그 고침(2026-11-14, 화면): 다시 쓰는 중인 가정통신문을 최근에서 다시 열면 다 쓴 글이 화면에 오고, 고쳐도 다 쓴 글이 옛 글로 덮이지 않음
import { open, run, assert, mockClaude } from './helpers.mjs';

const t = await open();
const { page, url, errors } = t;
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
let delay = 0, n = 0;
await mockClaude(page, async ({ prompt }) => {
  if (delay) await new Promise(r => setTimeout(r, delay));
  if (prompt.startsWith('[가정통신문]')) { n++; return JSON.stringify({ title: `안내 ${n}`, greeting: ['안녕하십니까?'], intro: `취지 ${n}`, items: ['1. 일시: 11. 20.'], closing: '부탁드립니다.', reply: { need: false }, short: '짧은 글', related: [], target: '3학년 보호자' }); }
  if (prompt.startsWith('[쪽지 안내]')) { m++; return JSON.stringify({ kind: 'training', title: `AI 연수 ${m}차`, when: [{ date: '2026-11-20', time: '15:00~16:30' }], place: `시청각실 ${m}`, target: '전 교원', apply: { due: '', how: '' }, bring: '', notes: '', points: [] }); }
  return '{}';
});
let m = 0;
const MS = 'section[data-menu="etc"] .msg-box';
const recentMsgs = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:msg:list') || '[]')).map(x => x.title));
const E = 'section[data-menu="etc"]', LF = `${E} .lf-box`;
const waitToast = s => page.waitForFunction(s => ((document.querySelector('#toast') || {}).textContent || '').includes(s), s, { timeout: 8000 });
const recentLetters = () => page.evaluate(() => (JSON.parse(localStorage.getItem('ssam:letter:list') || '[]')).map(x => x.out.title));

await page.goto(url);
await page.waitForTimeout(300);
await page.click('nav.app-side [data-menu-go="etc"]');

await run('fix1114-etc', [
  ['가정통신문: [다시 쓰기] 중에 [새 가정통신문] → 최근에서 그 글을 [열기] → 다 쓴 글이 화면에, 이어 고쳐도 최근 글이 옛 글로 돌아가지 않음', async () => {
    await page.click('#menuTabs [data-tab="letter"]');
    await page.fill(`${LF} #lfMemo`, '11월 20일 3학년 현장체험학습');
    await page.click(`${LF} [data-lf="write"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} [data-lo="title"]`) || {}).value === '안내 1', LF);
    delay = 1200;
    await page.click(`${LF} [data-lf="write"]`); // 다시 쓰기
    await page.waitForTimeout(150);
    await page.click(`${LF} [data-lf="new"]`);
    await page.click(`${LF} #lfRecent [data-lf-open]`);
    await page.waitForFunction(s => !document.querySelector(`${s} [data-lf="write"]`).disabled, LF, { timeout: 8000 });
    delay = 0;
    await page.waitForTimeout(200);
    assert((await page.inputValue(`${LF} [data-lo="title"]`)) === '안내 2', '화면 제목: ' + await page.inputValue(`${LF} [data-lo="title"]`));
    assert((await page.inputValue(`${LF} [data-lo="body"]`)).includes('취지 2'), '화면 본문이 옛 글');
    await page.fill(`${LF} #lfMemo`, '11월 20일 3학년 현장체험학습. 도시락');
    await page.waitForTimeout(100);
    const l = await recentLetters();
    assert(l.length === 1 && l[0] === '안내 2', '최근 가정통신문: ' + JSON.stringify(l));
    assert(await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:letter:cur')).out.title) === '안내 2', '지금 글이 옛 글');
  }],
  ['쪽지: 다시 읽는 중에 [새 쪽지] → 최근에서 그 쪽지를 [열기] → 다 읽은 쪽지가 화면에, 이어 고쳐도 최근 쪽지가 옛 글로 돌아가지 않음', async () => {
    await page.click('#menuTabs [data-tab="message"]');
    await page.fill(`${MS} #msgPaste`, '2026 AI 활용 수업 연수 안내 11. 20. 15:00 시청각실');
    await page.click(`${MS} [data-msg="read"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} [data-mf="title"]`) || {}).value === 'AI 연수 1차', MS);
    delay = 1200;
    await page.fill(`${MS} #msgPaste`, '2026 AI 활용 수업 연수 2차 안내');
    await page.click(`${MS} [data-msg="read"]`); // 같은 쪽지를 다시 읽기
    await page.waitForTimeout(150);
    await page.click(`${MS} [data-msg="new"]`);
    await page.click(`${MS} #msgRecent [data-msg-open]`);
    await page.waitForTimeout(1600);
    delay = 0;
    assert((await page.inputValue(`${MS} [data-mf="title"]`)) === 'AI 연수 2차', '화면 제목: ' + await page.inputValue(`${MS} [data-mf="title"]`));
    assert((await page.inputValue(`${MS} #msgBody`)).includes('시청각실 2'), '화면 본문이 옛 글');
    await page.fill(`${MS} [data-mf="target"]`, '3학년 담임');
    await page.waitForTimeout(100);
    const l = await recentMsgs();
    assert(l.length === 1 && l[0].includes('AI 연수 2차'), '최근 쪽지: ' + JSON.stringify(l));
    const body = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:msg:list'))[0].body);
    assert(body.includes('시청각실 2') && body.includes('3학년 담임'), '최근 쪽지 본문: ' + body);
  }],
  ['쪽지: 읽는 중인 쪽지를 최근에서 다시 열면 「읽는 중…」 그대로(두 번 읽지 않음), 다 읽으면 「쪽지를 썼어요」(최근에 넣었다고 하지 않음)', async () => {
    await page.click(`${MS} [data-msg="new"]`);
    await page.fill(`${MS} #msgPaste`, '2026 AI 활용 수업 연수 3차 안내');
    await page.click(`${MS} [data-msg="read"]`);
    await page.waitForFunction(s => (document.querySelector(`${s} [data-mf="title"]`) || {}).value.startsWith('AI 연수'), MS);
    delay = 1500;
    const before = m;
    await page.click(`${MS} [data-msg="read"]`);
    await page.waitForTimeout(150);
    await page.click(`${MS} [data-msg="new"]`);
    await page.click(`${MS} #msgRecent [data-msg-open]`);
    await page.waitForTimeout(100);
    assert(await page.isDisabled(`${MS} [data-msg="read"]`), '다시 연 쪽지의 [쪽지 쓰기]가 눌림(두 번 읽을 수 있음)');
    await page.click(`${MS} [data-msg="read"]`, { force: true }).catch(() => {});
    await page.waitForFunction(s => !document.querySelector(`${s} [data-msg="read"]`).disabled, MS, { timeout: 8000 }); // 다 읽음
    delay = 0;
    await page.waitForTimeout(300);
    assert((await page.textContent('#toast')).includes('쪽지를 썼어요'), '알림: ' + await page.textContent('#toast'));
    assert(m === before + 1, 'AI를 두 번 부름: ' + (m - before));
    assert(!(await page.textContent('#toast')).includes('최근 쪽지에 넣었어요'), '알림: ' + await page.textContent('#toast'));
    assert(!(await page.isDisabled(`${MS} [data-msg="read"]`)), '다 읽은 뒤에도 [쪽지 쓰기]가 막힘');
  }],
  ['공문 처리: 할 일이 12개인 공문에 할 일을 더 치고 Enter → 사라지지 않고 「12개까지」 알림, 친 글은 칸에 그대로', async () => {
    await page.evaluate(() => {
      const tasks = Array.from({ length: 12 }, (_, i) => ({ text: `할 일 ${i + 1}`, due: '', done: false }));
      localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gmT', name: '연수 안내', title: '연수 안내', text: '연수 안내 글', tasks, kinds: [], at: 1, read: true }]));
    });
    await page.click('#menuTabs [data-tab="message"]');
    await page.click('#menuTabs [data-tab="gongmun"]');
    const G = `${E} .gm-box [data-gm-id="gmT"]`;
    await page.waitForSelector(`${G} [data-gm-tadd]`);
    await page.fill(`${G} [data-gm-tadd]`, '참가 학생 명단 제출');
    await page.press(`${G} [data-gm-tadd]`, 'Enter');
    await waitToast('12개까지');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gongmun:list'))[0].tasks.map(t => t.text));
    assert(saved.length === 12 && !saved.includes('참가 학생 명단 제출'), JSON.stringify(saved));
    assert((await page.inputValue(`${G} [data-gm-tadd]`)) === '참가 학생 명단 제출', '친 글이 없어짐');
    await page.click(`${G} [data-gm-tdel="0"]`);
    await page.fill(`${G} [data-gm-tadd]`, '참가 학생 명단 제출');
    await page.press(`${G} [data-gm-tadd]`, 'Enter');
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:gongmun:list'))[0].tasks.map(t => t.text));
    assert(after.length === 12 && after[11] === '참가 학생 명단 제출', JSON.stringify(after));
  }],
  ['다면평가: 기준 고치기에서 글을 고친 뒤 [+ 지표]·고르기 칩을 사람처럼 한 번 누르면 바로 먹힘(다시 그리기에 첫 누름이 버려지지 않음)', async () => {
    await page.click('#menuTabs [data-tab="multi"]');
    const MV = `${E} .mv-box`;
    await page.waitForSelector(`${MV} .mv-page`);
    const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:multi') || 'null'));
    const humanClick = async sel => {
      await page.locator(sel).first().scrollIntoViewIfNeeded();
      const b = await page.locator(sel).first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    };
    await page.evaluate(s => { document.querySelector(`${s} .mv-edit`).open = true; }, MV);
    await page.fill(`${MV} [data-ce="tlabel"][data-g="0"][data-i="0"][data-t="0"]`, '23시간 이상');
    const n0 = (await data()).quant.criteria.groups[0].items[0].tiers.length;
    await humanClick(`${MV} [data-mv="ceAddTier"][data-g="0"][data-i="0"]`);
    await page.waitForTimeout(200);
    assert((await data()).quant.criteria.groups[0].items[0].tiers.length === n0 + 1, '[+ 지표]를 한 번 눌러도 지표가 더해지지 않음');
    assert((await data()).quant.criteria.groups[0].items[0].tiers[0].label === '23시간 이상', '고친 지표 글');
    await page.fill(`${MV} [data-ce="iname"][data-g="3"][data-i="0"]`, '업무 곤란도(부장)');
    const id = (await data()).quant.criteria.groups[3].items[0].id;
    await humanClick(`${MV} [data-mv-pick="${id}"][data-i="1"]`);
    await page.waitForTimeout(200);
    assert(((await data()).quant.values[id] || {}).v === '1', '칩을 한 번 눌러도 골라지지 않음: ' + JSON.stringify((await data()).quant.values[id]));
    assert((await page.getAttribute(`${MV} [data-mv-pick="${id}"][data-i="1"]`, 'aria-pressed')) === 'true', '칩 표시');
    assert((await page.textContent(`${MV} .mv-item[data-item="${id}"] .mv-item-h b`)) === '업무 곤란도(부장)', '고친 항목 이름이 카드에');
  }],
  ['회신서 모으기: 번호를 고친 뒤 다른 줄 번호 칸을 누르면 그 칸에 초점(바로 칠 수 있음), [✕]·Tab도 첫 누름에', async () => {
    await page.evaluate(() => {
      const l = JSON.parse(localStorage.getItem('ssam:letter:list') || '[]');
      l.push({ id: 'ltRC', at: Date.now() + 1e6, sources: [], memo: 'm', out: { title: '현장체험학습 참가 안내', date: '2026-11-14', body: ['본문'], replyOn: true, reply: { title: '참가 동의서', fields: ['참가 여부: □ 참가합니다  □ 참가하지 않습니다'], due: '' }, short: '' },
        send: { title: '', body: '' }, collect: { mask: [], rows: [{ no: 3, answers: { '참가 여부': '참가합니다' }, unsure: [] }, { no: null, answers: { '참가 여부': '' }, unsure: ['참가 여부'] }, { no: 5, answers: { '참가 여부': '참가하지 않습니다' }, unsure: [] }, { no: 8, answers: { '참가 여부': '참가합니다' }, unsure: [] }] } });
      localStorage.setItem('ssam:letter:list', JSON.stringify(l));
    });
    await page.click('#menuTabs [data-tab="letter"]');
    await page.click(`${LF} #lfRecent [data-lf-open="ltRC"]`);
    await page.waitForSelector(`${LF} #lfCollect [data-rc-no]`);
    const rows = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:letter:cur')).collect.rows.map(r => r.no));
    const act = () => page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? (a.dataset.rcNo != null ? `no${a.dataset.rcNo}` : a.dataset.rcA != null ? `a${a.dataset.rcA}` : a.tagName) : ''; });
    const humanClick = async sel => {
      await page.locator(sel).first().scrollIntoViewIfNeeded();
      const b = await page.locator(sel).first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up();
    };
    await page.fill(`${LF} [data-rc-no="1"]`, '4'); // 못 읽은 번호
    await humanClick(`${LF} [data-rc-no="2"]`);
    await page.waitForTimeout(150);
    assert((await act()) === 'no2', '누른 번호 칸에 초점이 없음: ' + await act());
    await page.keyboard.press('Control+A'); await page.keyboard.type('6');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    assert(JSON.stringify(await rows()) === '[3,4,6,8]', '번호: ' + JSON.stringify(await rows()));
    assert((await act()) === 'a2', 'Tab 뒤 초점(같은 줄 선택 칸): ' + await act());
    await page.fill(`${LF} [data-rc-no="0"]`, '2');
    await humanClick(`${LF} [data-rc-del="3"]`);
    await page.waitForTimeout(150);
    assert(JSON.stringify(await rows()) === '[2,4,6]', '[✕] 첫 누름: ' + JSON.stringify(await rows()));
    assert((await page.textContent(`${LF} #lfCollect`)).includes('낸 회신서 3장'), '집계가 바뀌지 않음');
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
