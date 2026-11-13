// 파일 칸 끌어 놓기(core/file-drop.js, 2026-11-12): 파일 고르기 단추가 있는 카드에 파일을 끌어다 놓으면 그 단추로 고른 것처럼 들어감
// 기초학력 캠프 계획 파일·문서 양식, 다면평가 근거자료(그 항목에만), 설정 학급 명단, 학년·반 먼저 묻기는 그대로, 맞지 않는 파일·읽는 중 안내,
// 단추가 둘 이상인 곳은 그 단추 줄만, 이미 끌어 놓기를 받는 칸(쪽지)은 그 칸이 받음(두 번 들어가지 않음)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, enter, FIXTURES } from './helpers.mjs';
import { makeHwpx } from '../../web/core/hwpx.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-12T09:00:00'));
const toast = () => page.textContent('#toast');
const waitToast = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent.includes(s), s, { timeout: 8000 });

/* sel 칸(그 안의 글 쪽)에 파일을 끌고 와(dragenter·dragover) 놓음(drop). 놓기 전 모습(받는지·안내 글·점선 칸)을 돌려줌 */
const drag = (sel, files, { drop = true } = {}) => page.evaluate(async ({ sel, files, drop }) => {
  const el = typeof sel === 'string' ? document.querySelector(sel) : null;
  if (!el) throw new Error('칸 없음: ' + sel);
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { type: f.type }));
  const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 4, clientY: r.top + 4 };
  el.dispatchEvent(new DragEvent('dragenter', o));
  const over = new DragEvent('dragover', o);
  el.dispatchEvent(over);
  const hint = document.querySelector('.fd-hint');
  const zone = document.querySelector('.fd-over');
  const st = { ok: over.defaultPrevented, hint: hint && !hint.hidden ? hint.textContent : '', zone: zone ? zone.className : '', zoneHasEl: !!(zone && zone.contains(el)), pick: (document.querySelector('.fd-pick') || {}).textContent || '' };
  if (drop) el.dispatchEvent(new DragEvent('drop', o));
  else el.dispatchEvent(new DragEvent('dragleave', o));
  return st;
}, { sel, drop, files: files.map(f => ({ name: f.name, type: f.type || '', b64: Buffer.from(f.buffer).toString('base64') })) });

const PLAN = Buffer.from(makeHwpx({ title: '2027학년도 겨울방학 기초학력 교과캠프 운영 계획', blocks: [
  { type: 'p', text: '2027학년도 겨울방학 기초학력 교과캠프 운영 계획' },
  { type: 'p', text: ' 가. 기간: 2027. 1. 8.(금) ~ 1. 22.(금) (평일)' }, { type: 'p', text: ' 나. 시간: 09:00 ~ 12:40 (하루 5교시, 1교시 40분, 쉬는 시간 5분)' },
  { type: 'p', text: ' 다. 대상: 3학년 학습지원 대상 학생' }, { type: 'p', text: ' 라. 교과: 국어, 수학' }] }));
const FORM = Buffer.from(makeHwpx({ title: '교과캠프 수업 확인서', blocks: [
  { type: 'table', head: true, rows: [['계(담당자)', '교감', '교장'], ['', '', '']] },
  { type: 'table', head: true, rows: [['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)'], ['', '', '', '', '', ''], ['계', '지도 시간: 총 (    )시간', '', '', '', '']] }] }));
const GONGMUN = Buffer.from(makeHwpx({ title: '새싹초등학교', blocks: [
  { type: 'p', text: '수신 내부결재' }, { type: 'p', text: '제목 2026학년도 학교 교육과정 운영 계획' }, { type: 'p', text: '시행 새싹초등학교-12 (2026. 8. 1.)' }] }));
const TXT = Buffer.from('그냥 메모', 'utf8');
const hwpx = (name, buffer) => ({ name, type: '', buffer });

const C = 'section[data-menu="class"]', P = `${C} .cls-camp`;
const camp = () => page.evaluate(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); return v && (v.camps.find(c => c.id === v.current) || v.camps[0]); });
// 단추가 든 카드에 시험용 표를 달아 「단추가 아닌 곳(카드 제목 쪽)」에 놓을 수 있게
const tagCard = (pickSel, tag) => page.evaluate(({ pickSel, tag }) => {
  const b = document.querySelector(pickSel); if (!b) throw new Error('단추 없음: ' + pickSel);
  const card = b.closest('section, .yp-card, .pc-card, .set-card, .mv-item');
  const first = [...card.querySelectorAll('h3, b, .lab, p, span')].find(x => !x.closest('button') && x.getClientRects().length) || card;
  first.setAttribute('data-t', tag);
}, { pickSel, tag });

await page.goto(url);
await page.waitForTimeout(400);

await run('file-drop', [
  ['기초학력 캠프 › 캠프 정보: 카드 아무 곳에 계획 파일을 끌어 오면 점선 칸·「놓으면 「계획 파일 넣기」」, 놓으면 [계획 파일 넣기]로 고른 것처럼 채움', async () => {
    await enter(page, 'class', 'camp');
    await page.waitForSelector(`${P} .cp-page`);
    await page.click(`${P} [data-cp="new"]`);
    await tagCard(`${P} [data-cp="planFile"][data-where="info"]`, 'info');
    const st = await drag(`${P} [data-t="info"]`, [hwpx('겨울 캠프 운영 계획.hwpx', PLAN)]);
    assert(st.ok && st.zoneHasEl, '카드가 받음: ' + JSON.stringify(st));
    assert(st.hint === '놓으면 「계획 파일 넣기」', st.hint);
    assert(st.pick.includes('계획 파일 넣기'), '그 단추 표시: ' + st.pick);
    await page.waitForFunction(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); const c = v && v.camps[0]; return c && c.sessions.length > 0; });
    const c = await camp();
    assert(c.target === '3학년' && c.sessions.length === 55 && c.sessions[0].date === '2027-01-08', JSON.stringify([c.target, c.sessions.length, c.sessions[0]]));
    assert(!(await page.$('.fd-over')) && await page.isHidden('.fd-hint'), '놓은 뒤 표시는 사라짐');
  }],
  ['캠프 문서 양식: 그 문서 카드에 놓으면 그 문서 양식으로, 맞지 않는 파일(.txt)은 「한글·PDF·사진 파일을 넣어 주세요」', async () => {
    await page.click(`${P} [data-sec="docs"]`);
    await page.waitForSelector(`${P} [data-cp="pickForm"][data-doc="confirm"]`);
    await tagCard(`${P} [data-cp="pickForm"][data-doc="confirm"]`, 'confirm');
    await drag(`${P} [data-t="confirm"]`, [{ name: '메모.txt', type: 'text/plain', buffer: TXT }]);
    assert((await toast()).includes('이 칸에는 한글·PDF·사진 파일을 넣어 주세요'), await toast());
    const st = await drag(`${P} [data-t="confirm"]`, [hwpx('교과캠프 수업 확인서 양식.hwpx', FORM)]);
    assert(st.hint === '놓으면 「양식 넣기」', st.hint);
    await page.waitForFunction(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); return v && v.camps[0].forms && v.camps[0].forms.confirm; });
    const c = await camp();
    assert(!c.forms.attend && !c.forms.observe, '다른 문서 양식은 그대로: ' + JSON.stringify(c.forms));
  }],
  ['읽는 중(단추가 막힘)이면 「읽는 중이에요」, 놓아도 넣지 않고 안내', async () => {
    await page.evaluate(() => document.querySelector('.cls-camp [data-cp="pickForm"][data-doc="attend"]').disabled = true);
    await tagCard(`${P} [data-cp="pickForm"][data-doc="attend"]`, 'attend');
    const st = await drag(`${P} [data-t="attend"]`, [hwpx('출석부 양식.hwpx', FORM)]);
    assert(st.hint === '읽는 중이에요', st.hint);
    assert((await toast()).includes('지금은 넣을 수 없어요'), await toast());
    assert(!(await camp()).forms.attend, '넣지 않음');
  }],
  ['다면평가 근거자료: 항목 카드에 놓으면 그 항목에만 들어가고 비고가 채워짐', async () => {
    await enter(page, 'etc', 'multi');
    await page.waitForSelector('.mv-box .mv-page');
    const ids = await page.$$eval('.mv-box .mv-item[data-item]', a => a.map(x => x.dataset.item));
    const [a, b] = ids;
    const st = await drag(`.mv-box .mv-item[data-item="${b}"] .mv-item-h b`, [hwpx('교육과정 운영 계획.hwpx', GONGMUN)]);
    assert(st.ok && st.zone.includes('mv-item') && st.hint === '놓으면 「+ 근거자료」', JSON.stringify(st));
    await page.waitForFunction(b => (document.querySelector(`[data-mv-note="${b}"]`) || {}).value?.includes('[12, 2026.08.01.]'), b);
    assert(!(await page.inputValue(`[data-mv-note="${a}"]`)), '다른 항목은 그대로');
    assert(await page.$$eval(`.mv-box .mv-item[data-item="${b}"] .mv-evchip`, x => x.length) === 1, '근거자료 칩 하나');
  }],
  ['다면평가 기준 양식 카드: 단추가 하나라 카드 어디든 받음 / 단추가 없는 곳(점수 요약)은 받지 않음', async () => {
    await tagCard('.mv-box [data-mv="quantForm"]', 'qf');
    const st = await drag('.mv-box [data-t="qf"]', [{ name: '메모.txt', type: 'text/plain', buffer: TXT }], { drop: false });
    assert(st.ok && st.hint === '놓으면 「기준 양식 넣기」', JSON.stringify(st));
    const bar = await page.$('.mv-box .mv-bar, .mv-box .mv-sum, .mv-box [data-mv-bar]');
    if (bar) {
      const sel = await page.evaluate(e => { e.setAttribute('data-t', 'bar'); return '.mv-box [data-t="bar"]'; }, bar);
      const s2 = await drag(sel, [{ name: '메모.txt', type: 'text/plain', buffer: TXT }], { drop: false });
      assert(!s2.hint && !s2.zone, '점수 요약은 놓는 칸이 아님: ' + JSON.stringify(s2));
    }
  }],
  ['학급 › 진도표·시수: 시간표 카드에 놓아도 [시간표 파일에서 가져오기]처럼 「먼저 학년·반을 넣어 주세요」', async () => {
    await enter(page, 'class', 'progress');
    await page.waitForSelector(`${C} [data-c="ttFile"]`);
    await tagCard(`${C} [data-c="ttFile"]`, 'tt');
    await drag(`${C} [data-t="tt"]`, [{ name: '시간표.csv', type: 'text/csv', buffer: Buffer.from('요일,1,2\n월,국어,수학', 'utf8') }]);
    assert((await toast()).includes('먼저 학년·반을 넣어 주세요'), await toast());
  }],
  ['설정 › 학급 명단: 명단 카드에 엑셀·CSV를 놓으면 미리 보기', async () => {
    await enter(page, 'settings', 'roster');
    await page.waitForSelector('section[data-menu="settings"] [data-set="rosterFile"]');
    await tagCard('section[data-menu="settings"] [data-set="rosterFile"]', 'roster');
    await drag('section[data-menu="settings"] [data-t="roster"]', [{ name: '명렬표.csv', type: 'text/csv', buffer: readFileSync(join(FIXTURES, 'roster-sample.csv')) }]);
    await page.waitForSelector('#sheetRoot #rosterOk');
    assert((await page.textContent('#sheetRoot .sheet')).includes('학생 25명'), await page.textContent('#sheetRoot .sheet'));
    await page.click('#sheetRoot [data-close]').catch(() => page.keyboard.press('Escape'));
  }],
  ['가정통신문: 자료 넣는 칸이 같은 카드에 있으면 [양식 넣기]는 그 줄만(카드 제목에 놓아도 양식으로 가지 않음)', async () => {
    await enter(page, 'etc', 'letter');
    await page.waitForSelector('.lf-box [data-lf="pickForm"]');
    const head = await page.evaluate(() => { const h = document.querySelector('.lf-box [data-lf="pickForm"]').closest('section').querySelector('h3, h2, .cls-card-h'); if (!h) return ''; h.setAttribute('data-t', 'lfh'); return '.lf-box [data-t="lfh"]'; });
    if (head) {
      const s1 = await drag(head, [hwpx('양식.hwpx', FORM)], { drop: false });
      assert(!s1.hint.includes('양식 넣기'), '카드 제목은 양식 칸이 아님: ' + JSON.stringify(s1));
    }
    const s2 = await drag('.lf-box .lf-forms', [hwpx('양식.hwpx', FORM)], { drop: false });
    assert(s2.ok && s2.hint === '놓으면 「양식 넣기」' && s2.zone.includes('lf-forms'), JSON.stringify(s2));
  }],
  ['이미 끌어 놓기를 받는 칸(쪽지)은 그 칸이 받고 한 번만 들어감', async () => {
    await enter(page, 'etc', 'message');
    await page.waitForSelector('.msg-box [data-msg-drop]');
    let changes = 0;
    await page.exposeFunction('__fdChange', () => { changes++; });
    await page.evaluate(() => document.querySelector('#msgFile').addEventListener('change', () => window.__fdChange()));
    const st = await drag('.msg-box [data-msg-drop]', [{ name: '연수 안내.txt', type: 'text/plain', buffer: Buffer.from('연수 안내 공문입니다', 'utf8') }]);
    assert(st.ok && !st.hint, '쪽지 칸이 받음(여기 안내는 안 뜸): ' + JSON.stringify(st));
    await page.waitForTimeout(300);
    assert(changes === 0, '파일 고르기 칸으로 한 번 더 넣지 않음');
  }],
  ['페이지 오류 없음', async () => { assert(!errors.length, errors.join(' / ')); }]
]);
await t.close();
