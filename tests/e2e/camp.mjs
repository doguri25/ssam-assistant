// 학급 › 기초학력 캠프(스펙 2026-11-11): 탭(주간학습안내 다음) → 캠프 만들기 → 학생 2명 → 일정 AI(가짜, 날짜는 앱이 셈·다른 메뉴에 가도 이어짐)
// → 출석 체크(○·/·빈칸, 모두 출석, 학생별 계) → 관찰 AI(고친 칸은 묻고 둠) → 보고서 AI → 문서 내보내기 4종 → hwpx 양식 표에 채우기(결재란 그대로)
// → 사진 양식(AI가 모양을 읽음) → 새로 고침 뒤 그대로 → 390px 폭. AI로 간 글에는 학생·지도교사 이름이 없음
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';
import { makeHwpx } from '../../web/core/hwpx.js';
import { readTables } from '../../web/core/hwpx-table.js';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-11T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const NAMES = ['김하늘', '이바다', '한가람', '하늘이', '바다가'];
const reqs = [];
let slow = 0, rate = 0;
const range = n => Array.from({ length: n }, (_, i) => i + 1);
const SCHED = {
  from: '2027-01-08', to: '2027-01-30', weekdays: [1, 2, 3, 4, 5, 6], start: '09:00', periods: 5, minutes: 40, rest: 5,
  order: ['국어', '수학', '국어', '수학', '국어'],
  lessons: [{ subject: '국어', items: range(33).map(i => `국어 ${i}차시 낱말 읽기`) }, { subject: '수학', items: range(22).map(i => `수학 ${i}차시 덧셈`) }]
};
await mockClaude(page, async ({ prompt, images }) => {
  reqs.push({ prompt, images });
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (rate) { rate--; return { status: 429 }; }
  if (prompt.includes('[기초학력 캠프 수업 일정]')) return JSON.stringify(SCHED);
  if (prompt.includes('[기초학력 캠프 관찰 기록]')) {
    const ids = [...prompt.matchAll(/\{"id":"(학생[A-Z])"/g)].map(m => m[1]);
    return JSON.stringify({ students: ids.map(id => ({ id, text: `${id === '학생A' ? '받아쓰기에 자신감이 붙음' : '덧셈 원리를 익힘'}. 꾸준히 참여함.` })) });
  }
  if (prompt.includes('[기초학력 캠프 결과 보고서]')) {
    const heads = [...prompt.matchAll(/\{"head":"([^"]+)"/g)].map(m => m[1]);
    return JSON.stringify({ title: '겨울 교과캠프 운영 보고서', sections: heads.map(h => ({ head: h, text: `- ${h} 내용 (학생A) 받아쓰기 60점 → 85점` })) });
  }
  if (prompt.includes('[기초학력 캠프 양식 읽기]')) {
    return JSON.stringify({ title: '3-(1) 느린학습자 지원 중점학급 교과캠프 학생 출석 및 관찰 기록부', columns: ['순', '일시(날짜)', '시간', '학생1', '학생2', '비고'], notes: ['※ 출석 : ○ , 결석 : /'], heads: [] });
  }
  return '{}';
});
// 계획 파일(지어낸 운영 계획서): 기간·시간·교시·대상·교과·지도교사·지도 계획 표
const PLAN = Buffer.from(makeHwpx({ title: '2027학년도 겨울방학 기초학력 교과캠프 운영 계획', blocks: [
  { type: 'p', text: '2027학년도 겨울방학 기초학력 교과캠프 운영 계획' }, { type: 'p', text: '1. 추진 일정' }, { type: 'p', text: ' 가. 계획 수립: 2026. 12. 1. ~ 12. 5.' },
  { type: 'p', text: '2. 운영 개요' }, { type: 'p', text: ' 가. 기간: 2027. 1. 8.(금) ~ 1. 22.(금) (평일)' }, { type: 'p', text: ' 나. 시간: 09:00 ~ 12:40 (하루 5교시, 1교시 40분, 쉬는 시간 5분)' },
  { type: 'p', text: ' 다. 대상: 3학년 학습지원 대상 학생' }, { type: 'p', text: ' 라. 교과: 국어, 수학' }, { type: 'p', text: ' 마. 지도 교사: 한가람 (010-1234-5678)' },
  { type: 'table', head: true, rows: [['차시', '국어', '수학'], ['1', '받침 없는 낱말 읽기', '두 자리 수 덧셈'], ['2', '받침 있는 낱말 읽기', '두 자리 수 뺄셈']] }] }));
const C = 'section[data-menu="class"]', P = `${C} .cls-camp`;
const toast = () => page.textContent('#toast');
const waitToast = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent.includes(s), s, { timeout: 8000 });
const tab = async () => { await page.click('nav.app-side [data-menu-go="class"]'); await page.click('#menuTabs [data-tab="camp"]'); await page.waitForSelector(`${P} .cp-page`); };
const secGo = async k => { await page.click(`${P} [data-sec="${k}"]`); };
const attDay = () => page.getAttribute(`${P} .cp-day[aria-pressed="true"]`, 'data-att-date'); // 고른 수업 날(날짜 칩)
const stepLine = k => page.textContent(`${P} .cp-step[data-sec="${k}"] .cp-step-line`);
const box = sel => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
const camp = () => page.evaluate(() => { const v = JSON.parse(localStorage.getItem('ssam:camp') || 'null'); return v && v.camps.find(c => c.id === v.current) || (v && v.camps[0]); });
const noNames = (s, what) => { for (const n of NAMES) assert(!s.includes(n), `${what}에 「${n}」: ${s.slice(0, 200)}`); };
const dec = u => new TextDecoder().decode(u);
const hwpxText = async dl => [...(await unzip(new Uint8Array(readFileSync(await dl.path())))).entries()].filter(([k]) => /section\d*\.xml$/.test(k)).map(([, v]) => dec(v)).join('');
const download = async doc => { const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-cp="export"][data-doc="${doc}"]`)]); return dl; };
const FORM = Buffer.from(makeHwpx({ title: '교과캠프 수업 확인서', blocks: [
  { type: 'table', head: true, rows: [['계(담당자)', '교감', '교장'], ['', '', '']] }, { type: 'p', text: '지도교사 :        (인)' },
  { type: 'table', head: true, rows: [['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)'], ['', '', '', '', '', ''], ['계', '지도 시간: 총 (    )시간', '', '', '', '']] }] }));

await page.goto(url);
await page.waitForTimeout(400);

await run('camp', [
  ['학급에 「기초학력 캠프」 탭(주간학습안내 다음), 처음엔 캠프 만들기 안내', async () => {
    await tab();
    const tabs = await page.locator('#menuTabs button').allInnerTexts();
    assert(tabs.join('|') === '오늘 수업|진도표·시수|주간학습안내|기초학력 캠프', tabs.join('|'));
    assert((await page.textContent(P)).includes('만든 캠프가 없어요'), '빈 화면');
    assert(await page.isHidden(`${C} .cls-weekly`) || !(await page.$(`${C} .cls-weekly`)), '다른 학급 화면이 보임');
  }],
  ['새 캠프 → 캠프 정보·학생 2명 → 학년도 키 camp에 저장', async () => {
    await page.click(`${P} [data-cp="new"]`);
    await page.fill(`${P} [data-cf="name"]`, '겨울 교과캠프');
    await page.fill(`${P} [data-cf="teacher"]`, '한가람');
    await page.fill(`${P} [data-cf="target"]`, '3학년');
    await page.fill(`${P} [data-cf="subjects"]`, '국어, 수학');
    for (const [n, no] of [['김하늘', 5], ['이바다', 11]]) {
      await page.click(`${P} [data-cp="addStudent"]`);
      const k = await page.$$(`${P} [data-k="name"]`);
      await k[k.length - 1].fill(n);
      const g = await page.$$(`${P} [data-k="grade"]`), c = await page.$$(`${P} [data-k="cls"]`), o = await page.$$(`${P} [data-k="no"]`);
      await g[g.length - 1].fill('3'); await c[c.length - 1].fill('2'); await o[o.length - 1].fill(String(no));
    }
    const v = await camp();
    assert(v.name === '겨울 교과캠프' && v.teacher === '한가람' && v.unit === 'period', JSON.stringify(v).slice(0, 200));
    assert(v.subjects.join() === '국어,수학', v.subjects.join());
    assert(v.students.map(s => `${s.grade}-${s.cls}-${s.no}-${s.name}`).join() === '3-2-5-김하늘,3-2-11-이바다', JSON.stringify(v.students));
    assert(await page.textContent(`${P} #cpPick`) === '겨울 교과캠프', '캠프 고르기 이름');
  }],
  ['수업 일정: [+ 줄], 한 날 여러 교시 더하기', async () => {
    await secGo('sched');
    await page.click(`${P} [data-cp="addRow"]`);
    assert((await camp()).sessions.length === 1, '+ 줄');
    await page.click(`${P} [data-cp="bulk"]`);
    await page.fill('#cpBDate', '2026-12-28');
    await page.fill('#cpBN', '2');
    await page.click('#cpBOk');
    const v = await camp();
    assert(v.sessions.length === 3, '줄 수 ' + v.sessions.length);
    assert(v.sessions.filter(s => s.date === '2026-12-28').map(s => `${s.start}-${s.end}-${s.subject}`).join() === '09:00-09:40-국어,09:50-10:30-수학', JSON.stringify(v.sessions));
  }],
  ['일정 AI: 바꿀지 묻고, 날짜는 앱이(기간·평일·공휴일), 교과마다 지도 내용, 다른 메뉴에 갔다 와도 이어짐, 이름 없음', async () => {
    await page.fill(`${P} #cpSchedPrompt`, '1/8~1/23 평일, 9:00~12:40 하루 5교시(40분·쉬는 5분), 국어·수학, 김하늘·이바다 2명, 아이스크림 홈런');
    slow = 900;
    await page.click(`${P} [data-cp="schedAi"]`);
    await page.click('#sheetRoot [data-ask="replace"]');
    await page.click('nav.app-side [data-menu-go="plan"]');
    assert(await page.evaluate(() => document.querySelector('.side-btn[data-menu-go="class"]').classList.contains('working')), '학급 메뉴에 「AI가 일하는 중」 점');
    await page.waitForTimeout(1300); slow = 0;
    await tab();
    await page.waitForFunction(() => document.querySelectorAll('.cls-camp [data-ss][data-k="date"]').length === 55);
    const v = await camp();
    assert(v.sessions[0].date === '2027-01-08' && v.sessions[0].start === '09:00' && v.sessions[0].end === '09:40' && v.sessions[0].subject === '국어', JSON.stringify(v.sessions[0]));
    assert(v.sessions.at(-1).date === '2027-01-22', '끝 날(토요일 1/23은 뺌): ' + v.sessions.at(-1).date);
    assert(v.sessions[1].content === '수학 1차시 덧셈' && v.sessions[2].content === '국어 2차시 낱말 읽기', v.sessions.slice(0, 3).map(s => s.content).join());
    const p = reqs.find(r => r.prompt.includes('[기초학력 캠프 수업 일정]')).prompt;
    noNames(p, '일정 프롬프트');
    assert(p.includes('수업 날 11일') && p.includes('아이스크림 홈런'), p.slice(0, 400));
    assert((await page.textContent(`${P} .cp-count`)).includes('55줄 · 총 55시간'));
  }],
  ['단계 진행 표시 6칸: 번호·이름·상태 한 줄, 다 된 단계 ✓, 지금 단계 aria-current, 칸에 치면 상태 줄이 바로 바뀜', async () => {
    const steps = await page.$$eval(`${P} .cp-steps .cp-step`, a => a.map(b => [b.dataset.sec, b.querySelector('.cp-step-name').textContent]));
    assert(JSON.stringify(steps) === JSON.stringify([['info', '캠프 정보'], ['sched', '수업 일정'], ['att', '출석 체크'], ['obs', '관찰 기록'], ['report', '결과 보고서'], ['docs', '문서 내보내기']]), JSON.stringify(steps));
    assert(!(await page.$(`${P} .cp-secs`)), '둥근 섹션 탭은 없어짐');
    assert(await page.$$eval(`${P} .cp-step[aria-current="step"]`, a => a.map(b => b.dataset.sec).join()) === 'sched', '지금 단계 하나');
    assert(await stepLine('info') === '대상 3학년 · 국어·수학', await stepLine('info'));
    assert(await stepLine('sched') === '55줄 · 총 55시간');
    assert(await stepLine('att') === '0 / 55 수업 체크');
    assert(await stepLine('obs') === '입력 필요 2명');
    assert(await stepLine('report') === '아직 안 씀');
    assert(await stepLine('docs') === '1 / 4 준비됨', '지도 내용이 다 있으면 수업 확인서는 준비됨: ' + await stepLine('docs'));
    const done = await page.$$eval(`${P} .cp-step.done`, a => a.map(b => b.dataset.sec + b.querySelector('.cp-step-n').textContent));
    assert(done.join() === 'info✓,sched✓', '다 된 단계 ✓: ' + done.join());
    assert((await page.textContent(`${P} .cp-step[data-sec="att"] .cp-step-n`)) === '3', '안 된 단계는 번호');
    const bg = await page.$eval(`${P} .cp-step[aria-current="step"]`, b => [getComputedStyle(b).backgroundColor, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()]);
    assert(bg[0] !== 'rgba(0, 0, 0, 0)' && bg[0] !== 'rgb(255, 255, 255)', '지금 단계는 진한 칸: ' + bg.join());
    await secGo('info');
    assert(await page.getAttribute(`${P} .cp-step[data-sec="info"]`, 'aria-current') === 'step');
    await page.fill(`${P} [data-cf="target"]`, '3학년 2반');
    assert(await stepLine('info') === '대상 3학년 2반 · 국어·수학', '치는 동안 상태 줄: ' + await stepLine('info'));
    assert(await page.evaluate(() => document.activeElement.dataset.cf) === 'target', '초점은 칸에 그대로');
    await page.fill(`${P} [data-cf="target"]`, '3학년');
    await secGo('sched');
  }],
  ['출석 체크: 가까운 수업 날, 칸은 ○ → / → 빈칸, 모두 출석, 학생별 출석·결석·출석률', async () => {
    await secGo('att');
    assert(await attDay() === '2027-01-08', '오늘(11/11)에 수업이 없으면 가까운 수업 날');
    const v0 = await camp(), s1 = v0.sessions[0].id, a = v0.students[0].id, b = v0.students[1].id;
    const cell = `${P} [data-att="${s1}|${a}"]`;
    await page.click(cell); assert(await page.textContent(cell) === '○', '○');
    await page.click(cell); assert(await page.textContent(cell) === '/', '/');
    await page.click(cell); assert(await page.textContent(cell) === '', '빈칸');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.att) === `${s1}|${a}`, '누른 칸에 초점이 남음');
    await page.click(`${P} [data-cp="attAll"]`);
    const v = await camp();
    assert(v.sessions.filter(s => s.date === '2027-01-08').every(s => v.att[s.id] && v.att[s.id][a] === 'O' && v.att[s.id][b] === 'O'), '모두 출석');
    await page.click(`${P} [data-att="${s1}|${b}"]`); // 이바다 1교시 결석
    const stats = await page.textContent(`${P} .cp-stats`);
    assert(stats.includes('5/55') && stats.includes('4/55') && stats.includes('80%') && stats.includes('100%'), stats);
    assert((await page.textContent(`${P} .cp-day[data-att-date="2027-01-08"]`)).includes('✓'), '다 체크한 날 칩에 ✓');
    assert(!(await page.textContent(`${P} .cp-day[data-att-date="2027-01-11"]`)).includes('✓'));
    await page.click(`${P} [data-cp="attNext"]`);
    assert(await attDay() === '2027-01-11', '다음 수업 날');
  }],
  ['출석 칸 64×48 이상: ○ 진한 채움 · / 주황 테두리 · — 점선(글은 빈칸), 날짜 칩을 누르면 그날로', async () => {
    const v = await camp(), [a, b] = v.students.map(s => s.id), s0 = v.sessions.find(s => s.date === '2027-01-11').id;
    const empty = `${P} [data-att="${s0}|${a}"]`;
    const sz = await box(empty);
    assert(sz.w >= 64 && sz.h >= 48, '칸 크기 ' + JSON.stringify(sz));
    const e = await page.$eval(empty, el => ({ t: el.textContent, before: getComputedStyle(el, '::before').content, border: getComputedStyle(el).borderTopStyle, label: el.getAttribute('aria-label') }));
    assert(e.t === '' && e.before.includes('—') && e.border === 'dashed' && e.label.endsWith('체크 안 함'), JSON.stringify(e));
    await page.click(`${P} .cp-day[data-att-date="2027-01-08"]`);
    assert(await attDay() === '2027-01-08', '칩으로 날 고르기');
    assert(await page.evaluate(() => document.activeElement && document.activeElement.dataset.attDate) === '2027-01-08', '누른 칩에 초점');
    const s1 = v.sessions[0].id;
    const o = await page.$eval(`${P} [data-att="${s1}|${a}"]`, el => ({ t: el.textContent, bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color }));
    const x = await page.$eval(`${P} [data-att="${s1}|${b}"]`, el => ({ t: el.textContent, border: getComputedStyle(el).borderTopWidth, w: getComputedStyle(el).fontWeight }));
    assert(o.t === '○' && o.bg !== 'rgb(255, 255, 255)' && o.ink === 'rgb(255, 255, 255)', '○ 진한 채움 ' + JSON.stringify(o));
    assert(x.t === '/' && x.border === '2px' && +x.w >= 700, '/ 주황 테두리·굵게 ' + JSON.stringify(x));
    assert((await page.textContent(`${P} .cp-att-rest`)).includes('다 체크했어요'), '남은 칸 없음');
    assert(await page.isDisabled(`${P} [data-cp="attAll"]`), '남은 칸이 없으면 [남은 칸 모두 출석]은 꺼짐');
    await page.click(`${P} [data-cp="attNext"]`);
  }],
  ['관찰 기록: 메모 → AI(이름 대신 학생A·학생B), 선생님이 고친 칸은 물은 뒤 그대로', async () => {
    await secGo('obs');
    const v0 = await camp(), [a, b] = v0.students.map(s => s.id);
    await page.fill(`${P} [data-memo="${a}"]`, '김하늘이 받아쓰기에 자신감이 붙음. 하늘이가 발표도 함');
    await page.fill(`${P} [data-memo="${b}"]`, '바다가 덧셈을 손가락으로 셈. 한가람 선생님이 칭찬');
    await page.fill(`${P} [data-obs="${b}"]`, '선생님이 쓴 글');
    await page.click(`${P} [data-cp="obsAi"]`);
    await page.click('#sheetRoot [data-ask="keep"]');
    await page.waitForFunction(a => document.querySelector(`[data-obs="${a}"]`).value.includes('받아쓰기에 자신감'), a);
    const p = reqs.filter(r => r.prompt.includes('[기초학력 캠프 관찰 기록]')).at(-1).prompt;
    noNames(p, '관찰 프롬프트');
    assert(p.includes('학생A') && !p.includes('- 학생B'), '고친 칸(학생B)은 보내지 않음');
    assert(p.includes('출석 5/55회') && p.includes('받아쓰기에 자신감이 붙음'), p);
    const v = await camp();
    assert(v.obs[b] === '선생님이 쓴 글' && v.obsEdited[b] === true && !v.obsEdited[a], JSON.stringify(v.obs));
  }],
  ['결과 보고서: 이끎교사 꼴 → AI(글 머리 4개, 이름 없음), 고칠 수 있음', async () => {
    await secGo('report');
    await page.click(`${P} [data-rkind="lead"]`);
    await page.fill(`${P} #cpRPrompt`, '김하늘 받아쓰기 60점→85점, 이바다 덧셈 속도가 빨라짐');
    await page.click(`${P} [data-cp="reportAi"]`);
    await page.waitForFunction(() => document.querySelectorAll('.cls-camp [data-rt]').length === 4);
    const p = reqs.filter(r => r.prompt.includes('[기초학력 캠프 결과 보고서]')).at(-1).prompt;
    noNames(p, '보고서 프롬프트');
    assert(p.includes('5쪽 이상') && p.includes('「일반화 방안」') && p.includes('60점→85점'), p.slice(0, 300));
    assert(await page.inputValue(`${P} #cpRTitle`) === '겨울 교과캠프 운영 보고서', '제목');
    await page.fill(`${P} [data-rt="0"]`, '- 고친 필요성');
    assert((await camp()).report.sections[0].text === '- 고친 필요성', '고친 글 저장');
  }],
  ['한도(429)에 걸리면 알리고 단추가 다시 살아남', async () => {
    rate = 2;
    await page.click(`${P} [data-cp="reportAi"]`);
    await page.click('#sheetRoot [data-ask="go"]');
    await page.waitForFunction(() => { const b = document.querySelector('.cls-camp [data-cp="reportAi"]'); return b && !b.disabled && b.textContent.includes('AI로 쓰기'); });
    assert((await toast()).includes('한도'), await toast());
    assert((await camp()).report.sections[0].text === '- 고친 필요성', '실패해도 쓴 글은 그대로');
    rate = 0;
  }],
  ['문서 내보내기 4종(한글): 수업 확인서·출석 및 관찰 기록부·관찰 기록부·결과 보고서', async () => {
    await secGo('docs');
    const c1 = await download('confirm');
    assert(c1.suggestedFilename() === '겨울 교과캠프 수업 확인서.hwpx', c1.suggestedFilename());
    const x1 = await hwpxText(c1);
    for (const s of ['겨울 교과캠프 수업 확인서', '지도교사: 한가람', '계(담당자)', '교감', '확인(서명)', '지도 시간: 총 ( 55 )시간', '※확인(서명)란은 지도 교사가 반드시 날인(사인)', '국어 1차시 낱말 읽기', '1. 8.(금)'])
      assert(x1.includes(s), '수업 확인서에 ' + s);
    const x2 = await hwpxText(await download('attend'));
    for (const s of ['학생 출석 및 관찰 기록부', '※ 출석 : ○ , 결석 : /', '김하늘', '이바다', '○']) assert(x2.includes(s), '출석부에 ' + s);
    const foot = await page.evaluate(async () => { const v = JSON.parse(localStorage.getItem('ssam:camp')); const c = v.camps.find(x => x.id === v.current); return (await import('./menus/class/camp-docs.js')).attendTable(c).footer; });
    assert(foot.join('|') === '계|||5|4', '계 줄(학생별 출석 수): ' + foot.join('|'));
    const x3 = await hwpxText(await download('observe'));
    for (const s of ['관찰 기록부', '관찰 및 지도 결과', '받아쓰기에 자신감', '선생님이 쓴 글']) assert(x3.includes(s), '관찰 기록부에 ' + s);
    const x4 = await hwpxText(await download('report'));
    for (const s of ['겨울 교과캠프 운영 보고서', '1. 필요성 및 목적', '- 고친 필요성', '4. 일반화 방안', '(학생A)']) assert(x4.includes(s), '보고서에 ' + s);
    // ▾에서 워드를 고르면 그 문서를 바로 워드로
    await page.click(`${P} .cp-doc[data-doc="observe"] [data-exp-menu]`);
    const [dw] = await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="docx"]')]);
    assert(dw.suggestedFilename() === '겨울 교과캠프 관찰 기록부.docx', dw.suggestedFilename());
    const dx = dec((await unzip(new Uint8Array(readFileSync(await dw.path())))).get('word/document.xml'));
    assert(dx.includes('관찰 및 지도 결과') && dx.includes('받아쓰기에 자신감'), '워드 내용');
    await page.click(`${P} .cp-doc[data-doc="observe"] [data-exp-menu]`);
    await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="hwpx"]')]);
  }],
  ['수업 확인서에 학교 한글 양식(.hwpx) → 그 양식의 표에 수업 줄·총 시간·지도교사를 채워 내려받음(결재란 그대로)', async () => {
    await page.setInputFiles(`${P} #cpFile-confirm`, { name: '교과캠프 수업 확인서 양식.hwpx', mimeType: 'application/octet-stream', buffer: FORM });
    await page.waitForFunction(() => [...document.querySelectorAll('.cls-camp [data-form-pick="confirm"] option')].some(o => o.selected && o.textContent.includes('교과캠프 수업 확인서 양식')));
    assert((await camp()).forms.confirm, '캠프에 고른 양식');
    assert((await page.textContent(`${P} .cp-doc[data-doc="confirm"] .cp-form-note`)).includes('표에 채워요'), '양식 안내');
    const dl = await download('confirm');
    await waitToast('양식에 채워 내려받았어요');
    const { tables, texts } = await readTables(new Uint8Array(readFileSync(await dl.path())));
    assert(tables.length === 2 && JSON.stringify(tables[0].rows) === JSON.stringify([['계(담당자)', '교감', '교장'], ['', '', '']]), '결재란 그대로');
    const t = tables[1].rows;
    assert(t.length === 57 && t[0][4] === '지도 내용' && t[1][0] === '1' && t[1][3] && t[1][4] && t[1][5] === '', '수업 55줄: ' + JSON.stringify(t.slice(0, 2)));
    assert(t[56][0] === '계' && t[56][1] === '지도 시간: 총 ( 55 )시간', '계 줄: ' + JSON.stringify(t[56]));
    assert(texts.includes('지도교사 : 한가람 (인)'), JSON.stringify(texts));
    assert(!reqs.some(r => r.prompt.includes('[기초학력 캠프 양식 읽기]')), '한글 양식(수업 확인서)은 AI로 읽지 않음');
  }],
  ['출석부에 양식 사진 → AI가 모양을 읽고(그림), 내보낸 문서가 그 제목·칸을 따름, 빈 양식 안내', async () => {
    assert((await page.textContent(`${P} .cp-form-tip`)).includes('빈 양식으로 넣어 주세요'), '안내');
    await page.setInputFiles(`${P} #cpFile-attend`, join(FIXTURES, 'sheet-1.png'));
    await page.waitForFunction(() => (document.querySelector('.cls-camp .cp-doc[data-doc="attend"] .cp-form-note') || {}).textContent?.includes('느린학습자'));
    const r = reqs.filter(x => x.prompt.includes('[기초학력 캠프 양식 읽기]')).at(-1);
    assert(r.images === 1 && r.prompt.includes('학생 출석 및 관찰 기록부'), JSON.stringify({ images: r.images }));
    const x = await hwpxText(await download('attend'));
    assert(x.includes('3-(1) 느린학습자 지원 중점학급 교과캠프 학생 출석 및 관찰 기록부') && x.includes('비고') && x.includes('일시(날짜)'), '양식 모양');
    await page.click(`${P} .cp-doc[data-doc="attend"] summary`);
    assert((await page.textContent(`${P} .cp-doc[data-doc="attend"] .cp-prev-doc`)).includes('느린학습자'), '미리 보기');
  }],
  ['새로 고침 뒤 그대로: 캠프·학생·일정·출석·관찰·보고서·고른 양식', async () => {
    await page.reload(); await page.waitForTimeout(500);
    await tab();
    await secGo('att');
    const v = await camp();
    assert(v.sessions.length === 55 && v.students.length === 2 && v.report.sections.length === 4, '자료');
    assert((await page.textContent(`${P} .cp-stats`)).includes('5/55'), '출석');
    await secGo('obs');
    assert((await page.inputValue(`${P} [data-obs="${v.students[1].id}"]`)) === '선생님이 쓴 글', '관찰');
    await secGo('docs');
    await page.waitForFunction(() => [...document.querySelectorAll('.cls-camp [data-form-pick="attend"] option')].some(o => o.selected && o.value));
  }],
  ['날마다 캠프: 출석부는 학생 × 날짜(계 칸)', async () => {
    await secGo('info');
    await page.click(`${P} [data-unit="day"]`);
    await secGo('docs');
    await page.selectOption(`${P} [data-form-pick="attend"]`, '');
    const x = await hwpxText(await download('attend'));
    assert(x.includes('학생 출석부') && x.includes('1/8') && x.includes('학년-반') && x.includes('3-2'), '날짜형');
    await secGo('info');
    await page.click(`${P} [data-unit="period"]`);
  }],
  ['[남은 칸 모두 출석]: 빈칸만 ○, 표시한 /는 그대로 · 문서 준비 상자(출석 옆): 준비됨 ✓·할 일 남음(까닭)·그 단계로', async () => {
    await secGo('att');
    await page.click(`${P} .cp-day[data-att-date="2027-01-12"]`);
    const v0 = await camp(), [a, b] = v0.students.map(s => s.id), day = v0.sessions.filter(s => s.date === '2027-01-12');
    const cell = `${P} [data-att="${day[0].id}|${b}"]`;
    await page.click(cell); await page.click(cell); // 빈칸 → ○ → /
    assert((await page.textContent(`${P} .cp-att-rest`)).includes('남은 칸 9개'), await page.textContent(`${P} .cp-att-rest`));
    await page.click(`${P} [data-cp="attAll"]`);
    await waitToast('남은 9칸을 출석으로 표시했어요');
    const v = await camp();
    assert(v.att[day[0].id][b] === 'X' && day.every(s => v.att[s.id][a] === 'O') && day.slice(1).every(s => v.att[s.id][b] === 'O'), '빈칸만 ○: ' + JSON.stringify(day.map(s => v.att[s.id])));
    assert((await page.textContent(`${P} .cp-day[data-att-date="2027-01-12"]`)).includes('✓'));
    // 문서 준비: 수업 확인서·관찰 기록부·결과 보고서는 준비됨, 출석부는 할 일 남음(출석 45줄 남음)
    const rd = await page.$$eval(`${P} .cp-ready .cp-rd`, a => a.map(li => [li.dataset.ready, li.classList[1], li.querySelector('.cp-rd-s').textContent.trim(), li.querySelector('.cp-dot').textContent]));
    assert(JSON.stringify(rd) === JSON.stringify([['confirm', 'ready', '준비됨', '✓'], ['attend', 'todo', '할 일 남음: 출석 45줄 남음', ''], ['observe', 'ready', '준비됨', '✓'], ['report', 'ready', '준비됨', '✓']]), JSON.stringify(rd));
    assert((await page.textContent(`${P} .cp-ready .cls-card-h`)).includes('3 / 4 준비됨'));
    assert(await stepLine('docs') === '3 / 4 준비됨' && await stepLine('obs') === '2명 다 씀' && await stepLine('report') === '4칸', '단계 상태 줄');
    assert(!(await page.$(`${P} .cp-rd[data-ready="attend"] [data-sec]`)), '지금 단계(출석 체크)로 가는 단추는 없음');
    const m = await box(`${P} .cp-att-main`), r = await box(`${P} .cp-ready`);
    assert(r.x >= m.r, '넓으면 출석 옆: ' + JSON.stringify({ m, r }));
    await page.click(`${P} .cp-rd[data-ready="observe"] [data-sec]`);
    assert(await page.getAttribute(`${P} .cp-step[data-sec="docs"]`, 'aria-current') === 'step', '준비된 문서는 문서 내보내기로');
    await secGo('att');
  }],
  ['390px 폭: 화면마다 가로로 넘치지 않음 · 단계 표시는 가로 스크롤(지금 단계가 보임) · 문서 준비는 출석 아래', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const k of ['info', 'sched', 'att', 'obs', 'report', 'docs']) {
      await secGo(k); await page.waitForTimeout(100);
      const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, app: [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth] }));
      assert(r.doc <= 390 && r.app[0] <= r.app[1], `${k}: ${JSON.stringify(r)}`);
      const s = await page.$eval(`${P} .cp-steps ol`, ol => { const c = ol.querySelector('[aria-current="step"]').getBoundingClientRect(), o = ol.getBoundingClientRect(); return { scroll: ol.scrollWidth > ol.clientWidth, seen: c.left >= o.left - 1 && c.right <= o.right + 1 }; });
      assert(s.scroll && s.seen, `${k} 단계 표시: ${JSON.stringify(s)}`);
      if (k === 'att') {
        const m = await box(`${P} .cp-att-main`), rd = await box(`${P} .cp-ready`), c = await box(`${P} .cp-mark`);
        assert(rd.y >= m.b, '좁으면 문서 준비는 아래');
        assert(c.w >= 64 && c.h >= 48, '휴대폰에서도 칸 64×48: ' + JSON.stringify(c));
      }
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['계획 파일 넣기: 운영 계획서 → 빈 칸(캠프 이름·대상)만 채우고, 수업 일정은 계획서 기간·평일·교시로(지도 내용은 AI), 이름·전화번호는 AI로 안 감', async () => {
    await page.click(`${P} [data-cp="new"]`);
    assert(await page.$(`${P} [data-cp="planFile"][data-where="info"]`), '캠프 정보에 [계획 파일 넣기]');
    const before = reqs.length;
    await page.setInputFiles(`${P} #cpPlanFile-info`, { name: '겨울 캠프 운영 계획.hwpx', mimeType: 'application/octet-stream', buffer: PLAN });
    await waitToast('수업 55줄을 만들었어요');
    assert((await toast()).includes('계획서에서 캠프 이름·대상을 채웠어요'), await toast());
    const c = await camp();
    assert(c.name === '겨울방학 기초학력 교과캠프' && c.target === '3학년' && c.teacher === '한가람', JSON.stringify([c.name, c.target, c.teacher]));
    assert(c.sessions.length === 55 && c.sessions[0].date === '2027-01-08' && c.sessions[0].start === '09:00' && c.sessions[0].content === '국어 1차시 낱말 읽기', JSON.stringify(c.sessions[0]));
    assert(c.sessions.every(s => s.date >= '2027-01-08' && s.date <= '2027-01-22' && !['2027-01-09', '2027-01-16'].includes(s.date)), '계획서 기간·평일(토요일 빼고)');
    const r = reqs.slice(before).find(x => x.prompt.includes('[운영 계획서]'));
    assert(r && r.prompt.includes('받침 있는 낱말 읽기') && !r.prompt.includes('010-1234-5678'), '계획서 글(지도 계획 포함, 전화번호 가림)');
    noNames(r.prompt, '계획서 글');
    await secGo('sched');
    assert(await page.$(`${P} [data-cp="planFile"][data-where="sched"]`), '수업 일정에도 [계획 파일 넣기]');
    assert((await page.inputValue(`${P} #cpSchedPrompt`)).startsWith('1/8~1/22 평일, 09:00~12:40 하루 5교시'), '일정 칸 요약');
    await page.click(`${P} [data-cp="del"]`);
    await page.click('#cpDelOk');
  }],
  ['캠프 지우기', async () => {
    await page.click(`${P} [data-cp="new"]`);
    await page.fill(`${P} [data-cf="name"]`, '수학 캠프');
    assert((await page.$$eval(`${P} #cpPick option`, o => o.length)) === 2, '캠프 둘');
    assert((await camp()).teacher === '한가람', '지도교사는 이어서');
    await page.click(`${P} [data-cp="del"]`);
    await page.click('#cpDelOk');
    const v = await page.evaluate(() => JSON.parse(localStorage.getItem('ssam:camp')));
    assert(v.camps.length === 1 && v.camps[0].name === '겨울 교과캠프', JSON.stringify(v.camps.map(c => c.name)));
  }],
  ['AI로 간 글 모두에 학생·지도교사 이름이 없음', async () => {
    assert(reqs.length >= 5, '요청 수 ' + reqs.length);
    for (const r of reqs) noNames(r.prompt, r.prompt.slice(0, 20));
  }],
  ['페이지 오류 없음', async () => { const e = errors.filter(x => !/status of 429/.test(x)); assert(e.length === 0, e.join(' | ')); }]
]);
await t.close();
