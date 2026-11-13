// 문서·소통 › 다면평가(스펙 2026-11-11): 탭(인수인계서 다음) → 내 정보 → 정량 예시 기준에 숫자 넣기(점수·소계·총점·감점·근무 6개월 이하)
// → 학교 기준 양식(.hwpx 지어낸 것, AI 없이 읽음) → 항목 바뀜(같은 이름 값은 이어짐) → 근거자료(한글 공문 → 규칙, 사진 → AI) → 비고 → 한글·워드 내려받기 내용
// → 기준 고치기 → 정성 줄글 → AI로 넣기(가짜, 다른 메뉴에 가도 이어짐) → 입력 필요 채우기 → 다시 넣기(고친 칸은 둠) → 내려받기
// → 정성 기준 양식 → 사진 정량 기준(AI) → 새로 고침 뒤 그대로 → AI 없을 때 규칙 → 390px → AI로 간 글에 학교·이름 없음 → 페이지 오류 없음
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { open, run, assert, mockClaude, FIXTURES } from './helpers.mjs';
import { unzip } from '../../web/core/zip.js';
import { makeHwpx } from '../../web/core/hwpx.js';
import { QUAL_TEXT } from '../unit/multi-fixtures.mjs';

const t = await open();
const { page, url, errors } = t;
await page.clock.setFixedTime(new Date('2026-11-11T09:00:00'));
await page.addInitScript(() => {
  if (!localStorage.getItem('ssam:engine')) localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true }));
});
const SCHOOL = '새싹초등학교', TEACHER = '한가람', KIDS = ['최이솔', '박하랑'];
const reqs = [];
let slow = 0;
await mockClaude(page, async ({ prompt, images }) => {
  reqs.push({ prompt, images });
  if (slow) await new Promise(r => setTimeout(r, slow));
  if (prompt.startsWith('[다면평가 근거자료 제목 읽기]')) return JSON.stringify({ title: '교내 상장', no: '', date: '2026.11.03.' });
  if (prompt.startsWith('[다면평가 자기실적평가서]')) {
    return JSON.stringify({
      basics: { '담당 학년 및 학급': '9-9', '연간 학생 상담 실적': '25건' },
      sections: [{ key: 'learn', parts: [{ name: '추진 목표', items: ['학생 참여 중심 수업'] }, { name: '추진 실적', items: ['- 코스웨어 활용 수학 기초 학습 주 1회'] }] },
        { key: 'life', parts: [{ name: '추진 실적', items: ['학생 상담 25건'] }] }],
      missing: [{ path: 'sections.pro.추진 목표', hint: '올해 연수 목표를 적어 주세요' }]
    });
  }
  if (prompt.startsWith('[다면평가 정량 기준 읽기]')) {
    return JSON.stringify({ title: '사진 기준(정량평가)', total: 40, groups: [{ name: '가. 학습지도', max: 40, items: [
      { name: '주당 수업시수', max: 30, tiers: [{ label: '20시간 이상', points: 30 }, { label: '20시간 미만', points: 25 }] },
      { name: '직무연수', max: 10, tiers: [{ label: '60시간 이상', points: 10 }, { label: '60시간 미만', points: 8 }] }] }] });
  }
  return '{}';
});
const E = 'section[data-menu="etc"]', P = `${E} .mv-box`;
const toast = () => page.textContent('#toast');
const waitToast = s => page.waitForFunction(s => (document.querySelector('#toast') || {}).textContent.includes(s), s, { timeout: 8000 });
const tab = async () => { await page.click('nav.app-side [data-menu-go="etc"]'); await page.click('#menuTabs [data-tab="multi"]'); await page.waitForSelector(`${P} .mv-page`); };
const data = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:multi') || 'null'));
const itemId = async name => { const v = await data(); return v.quant.criteria.groups.flatMap(g => g.items).find(i => i.name === name).id; };
const score = async name => (await page.textContent(`${P} [data-mv-score="${await itemId(name)}"]`)).trim();
const total = () => page.textContent(`${P} [data-mv-total]`);
const dec = u => new TextDecoder().decode(u);
const hwpxText = async dl => [...(await unzip(new Uint8Array(readFileSync(await dl.path())))).entries()].filter(([k]) => /section\d*\.xml$/.test(k)).map(([, v]) => dec(v)).join('');
const clean = (s, what) => { for (const n of [SCHOOL, TEACHER, ...KIDS]) assert(!s.includes(n), `${what}에 「${n}」: ${s.slice(0, 200)}`); };

// 지어낸 학교 정량 기준 양식(합친 칸 없는 표 — 빈 칸이 이어짐)
const QUANT_FORM = Buffer.from(makeHwpx({ title: '2026학년도 교사 다면평가 기준(정량평가)', blocks: [
  { type: 'p', text: '평가 기간 : 2026. 3. 1. ~ 2027. 2. 28.        【새싹초등학교】' },
  { type: 'table', head: true, rows: [
    ['구분', '평가요소', '평가지표', '지표', '배점', '비고(실적 증빙자료)'],
    ['교사', '가. 학습지도 (40점)', '주당 수업시수 (30점)', '•21시간 이상', '30점', '학교 교육과정 ※ 휴직 기간은 월 0.5씩 감점'],
    ['', '', '', '•21시간 미만', '27점', ''],
    ['', '', '수업 나눔 (10점)', '•수업 나눔 (회당 5점)', '10점', '수업 나눔 계획 공문'],
    ['', '나. 담당업무 (60점)', '업무 곤란도 (50점)', '•부장', '50점', '업무분장 공문'],
    ['', '', '', '•일반', '45점', ''],
    ['', '', '학교 행사 지원 (10점)', '•있음', '10점', ''],
    ['', '', '', '•없음', '5점', ''],
    ['총 계', '100점', '', '', '', '']] },
  { type: 'p', text: '※ 동점자는 담당업무 점수가 높은 순으로 한다.' },
  { type: 'p', text: '상기 내용이 틀림없음을 확인하여 제출합니다.' },
  { type: 'p', text: '새싹초등학교 다면평가관리위원장 귀하' }] }));
const GONGMUN = Buffer.from(makeHwpx({ title: '새싹초등학교', blocks: [
  { type: 'p', text: '수신 내부결재' }, { type: 'p', text: '제목 2026학년도 학교 교육과정 운영 계획' }, { type: 'p', text: '교장 한가람' },
  { type: 'p', text: '시행 새싹초등학교-12 (2026. 8. 1.)' }] }));
const QUAL_FORM = Buffer.from(makeHwpx({ title: '정성평가 기준', blocks: QUAL_TEXT.split('\n').map(text => ({ type: 'p', text })) }));

await page.goto(url);
await page.waitForTimeout(400);

await run('multi', [
  ['기타에 「다면평가」 탭(인수인계서 다음), 처음엔 정량 쪽·예시 기준', async () => {
    await tab();
    const tabs = await page.locator('#menuTabs button').allInnerTexts();
    assert(tabs.join('|') === '쪽지 작성|가정통신문|공문 처리|인수인계서|다면평가', tabs.join('|'));
    assert(await page.getAttribute(`${P} [data-mv-view="quant"]`, 'aria-pressed') === 'true', '정량 쪽');
    assert((await page.textContent(P)).includes('예시 기준이에요. 학교 기준 양식을 넣어 주세요'), '예시 안내');
    assert((await page.$$(`${P} .mv-item`)).length === 11, '항목 11개');
    assert((await total()).trim() === '—', '총점 빈칸');
    assert(await page.isHidden(`${E} .ho-box`) || !(await page.$(`${E} .ho-box`)), '다른 기타 화면이 보임');
  }],
  ['내 정보 → 학년도 키 multi에 저장', async () => {
    for (const [k, v] of [['school', SCHOOL], ['name', TEACHER], ['gradeClass', '3-1'], ['subject', '담임(전 과목)'], ['duty', '정보부장']]) await page.fill(`${P} [data-mi="${k}"]`, v);
    await page.selectOption(`${P} select[data-mi="homeroom"]`, '담임');
    await page.selectOption(`${P} select[data-mi="head"]`, '보직교사');
    const v = await data();
    assert(v.info.school === SCHOOL && v.info.name === TEACHER && v.info.gradeClass === '3-1' && v.info.homeroom === '담임' && v.info.head === '보직교사' && v.info.position === '교사', JSON.stringify(v.info));
  }],
  ['숫자 넣기 → 고른 지표·점수·소계·총점, 감점, 고르기, 횟수 최대, 근무 6개월 이하', async () => {
    const h = await itemId('주당 수업시수');
    await page.fill(`${P} [data-mv-v="${h}"]`, '22.8');
    assert(await score('주당 수업시수') === '25점', await score('주당 수업시수'));
    assert(await page.getAttribute(`${P} [data-mv-tier="${h}"][data-i="0"]`, 'class') === 'chip on', '22시간 이상 지표');
    await page.fill(`${P} [data-mv-deduct="${h}"]`, '2');
    assert(await score('주당 수업시수') === '24.6점', '감점 0.4');
    await page.click(`${P} [data-mv-pick="${await itemId('수업 공개 횟수')}"][data-i="0"]`);
    await page.fill(`${P} [data-mv-count="${await itemId('수업 컨설팅 횟수')}"]`, '3');
    assert(await score('수업 컨설팅 횟수') === '2점', '횟수 × 1점, 최대 2점');
    assert((await page.textContent(`${P} [data-mv-gsum="g1"]`)).includes('소계 29.6 / 30점'), await page.textContent(`${P} [data-mv-gsum="g1"]`));
    await page.fill(`${P} [data-mv-v="${await itemId('학생·학부모 상담 실적')}"]`, '12');
    const life = await itemId('생활지도 곤란도');
    await page.click(`${P} [data-mv-pick="${life}"][data-i="0"]`);
    assert(await score('생활지도 곤란도') === '5점');
    await page.check(`${P} [data-mi="short"]`);
    assert(await score('생활지도 곤란도') === '4.5점', '근무 6개월 이하');
    await page.uncheck(`${P} [data-mi="short"]`);
    const tt = await page.$$eval(`${P} [data-mv-total]`, a => a.map(x => x.textContent));
    assert(tt.join() === '49.6,49.6', '맨 위·아래 총점: ' + tt.join());
    const v = await data();
    assert(v.quant.values[h].v === '22.8' && v.quant.values[h].deduct === '2', JSON.stringify(v.quant.values));
  }],
  ['점수 요약 줄(위에 고정): 총점 「n / 100점」, 묶음 막대(절반 미만이면 주황), 입력 필요 n곳 → 첫 빈 항목으로 초점, 빈 항목은 주황 테두리', async () => {
    const h = await itemId('주당 수업시수');
    assert(await page.$eval(`${P} .mv-bar-wrap`, e => getComputedStyle(e).position) === 'sticky', 'sticky');
    assert((await page.textContent(`${P} .mv-bar .mv-bar-total`)).replace(/\s+/g, '') === '총점49.6/100점', await page.textContent(`${P} .mv-bar .mv-bar-total`));
    const bar = g => page.$eval(`${P} [data-mv-gbar="${g}"]`, e => ({ num: e.querySelector('.mv-gbar-num').textContent, low: e.classList.contains('low'), w: e.querySelector('.mv-meter i').style.width, fill: getComputedStyle(e.querySelector('.mv-meter i')).backgroundColor }));
    const g1 = await bar('g1'), g3 = await bar('g3');
    assert(g1.num === '29.6 / 30' && !g1.low && g1.w === '99%', JSON.stringify(g1));
    assert(g3.num === '— / 10' && !g3.low && g3.w === '0%', '안 넣은 묶음: ' + JSON.stringify(g3));
    await page.fill(`${P} [data-mv-v="${await itemId('직무연수 이수')}"]`, '12'); // 4점 → 4 / 10
    const g3b = await bar('g3');
    assert(g3b.num.startsWith('4 / 10') && g3b.low && g3b.num.includes('절반 미만') && g3b.fill !== g1.fill, '절반 미만은 주황: ' + JSON.stringify(g3b));
    // 입력 필요: 11개 중 6개 넣음 → 5곳, 빈 항목 카드는 주황 테두리 + 「입력 필요」
    assert((await page.textContent(`${P} [data-mv="quantNeed"]`)).trim() === '입력 필요 5곳', await page.textContent(`${P} [data-mv="quantNeed"]`));
    assert((await page.$$(`${P} .mv-item.need`)).length === 5, '빈 항목 5개');
    const grade = await itemId('학년 곤란도');
    const nd = await page.$eval(`${P} .mv-item[data-item="${grade}"]`, e => ({ tag: !e.querySelector('.mv-q-need').hidden && e.querySelector('.mv-q-need').textContent, bw: getComputedStyle(e).borderTopWidth }));
    assert(nd.tag === '입력 필요' && nd.bw === '2px', JSON.stringify(nd));
    assert(await page.$eval(`${P} .mv-item[data-item="${h}"]`, e => !e.classList.contains('need') && e.querySelector('.mv-q-need').hidden), '넣은 항목은 표시 없음');
    await page.click(`${P} [data-mv="quantNeed"]`);
    await page.waitForFunction(id => document.activeElement && document.activeElement.dataset.mvPick === id && document.activeElement.dataset.i === '0', grade);
    await page.waitForFunction(() => { const a = document.activeElement.getBoundingClientRect(), b = document.querySelector('.mv-bar').getBoundingClientRect(); return a.top >= b.bottom && a.bottom <= innerHeight; });
    const top = await page.evaluate(() => [document.querySelector('.mv-bar').getBoundingClientRect().top, document.querySelector('#app').getBoundingClientRect().top]);
    assert(top[0] >= top[1] && top[0] <= top[1] + 12, '스크롤해도 요약 줄은 위에: ' + top.join());
    await page.click(`${P} [data-mv-pick="${grade}"][data-i="1"]`);
    assert((await page.textContent(`${P} [data-mv="quantNeed"]`)).trim() === '입력 필요 4곳' && !(await page.$eval(`${P} .mv-item[data-item="${grade}"]`, e => e.classList.contains('need'))), '고르면 바로 빠짐');
    assert(await page.$eval(`${P} [data-mv-pick="${grade}"][data-i="1"]`, e => getComputedStyle(e, '::before').content.includes('✓')), '고른 지표 ✓');
    assert(await page.$eval(`${P} [data-mv-tier="${h}"].on`, e => getComputedStyle(e, '::before').content.includes('✓')), '범위 항목: 맞는 구간 ✓');
    assert(await page.$eval(`${P} .mv-bar [data-mv="exportQuant"][data-exp-main]`, e => e.textContent) === '한글로 내려받기', '요약 줄에 [한글로 내려받기]');
    await page.evaluate(() => { document.querySelector('#app').scrollTop = 0; });
  }],
  ['횟수 항목: [−] n회 [+]와 「3회 × 1점 = 3점 → 최대 2점」', async () => {
    const k = await itemId('수업 컨설팅 횟수'), calc = () => page.textContent(`${P} [data-mv-calc="${k}"]`);
    assert(await calc() === '3회 × 1점 = 3점 → 최대 2점', await calc());
    await page.click(`${P} [data-mv-step="${k}"][data-d="-1"]`);
    assert(await page.inputValue(`${P} [data-mv-count="${k}"]`) === '2' && await calc() === '2회 × 1점 = 2점' && await score('수업 컨설팅 횟수') === '2점');
    await page.click(`${P} [data-mv-step="${k}"][data-d="1"]`); await page.click(`${P} [data-mv-step="${k}"][data-d="1"]`);
    assert(await page.inputValue(`${P} [data-mv-count="${k}"]`) === '4' && await calc() === '4회 × 1점 = 4점 → 최대 2점');
    assert((await data()).quant.values[k].count === '4', '저장');
    const sz = await page.$eval(`${P} [data-mv-step="${k}"][data-d="1"]`, e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
    assert(sz[0] >= 44 && sz[1] >= 44, '누르는 칸 44px: ' + sz);
    await page.click(`${P} [data-mv-step="${k}"][data-d="-1"]`);
    assert(await calc() === '3회 × 1점 = 3점 → 최대 2점');
  }],
  ['학교 기준 양식(.hwpx) → AI 없이 읽어 항목이 바뀌고, 같은 이름 항목 값은 이어짐', async () => {
    await page.setInputFiles(`${P} #mvQuantFile`, { name: '2026 다면평가 정량 기준.hwpx', mimeType: 'application/octet-stream', buffer: QUANT_FORM });
    await page.waitForFunction(() => [...document.querySelectorAll('.mv-box .mv-item-h b')].some(b => b.textContent === '학교 행사 지원'));
    const names = await page.$$eval(`${P} .mv-item-h b`, a => a.map(x => x.textContent));
    assert(names.join('|') === '주당 수업시수|수업 나눔|업무 곤란도|학교 행사 지원', names.join('|'));
    const v = await data();
    assert(v.quant.formName === '2026 다면평가 정량 기준' && v.quant.formId, v.quant.formName);
    assert(!(await page.textContent(P)).includes('예시 기준이에요'), '예시 안내는 사라짐');
    assert(await score('주당 수업시수') === '29점', '22.8 → 30점, 휴직 2개월 × 0.5 감점: ' + await score('주당 수업시수'));
    assert((await toast()).includes('묶음 2개 · 항목 4개'), await toast());
    assert(!reqs.some(r => r.prompt.startsWith('[다면평가 정량 기준 읽기]')), '한글 양식은 AI로 읽지 않음');
    assert((await page.textContent(`${P} .mv-items`)).includes('증빙: 학교 교육과정'), '증빙 안내');
  }],
  ['근거자료: 한글 공문 → 규칙으로 「제목 [번호, 날짜.]」(AI 안 부름), 사진 → AI, 비고 칸 자동·고치기, 파일 다시 받기', async () => {
    const h = await itemId('주당 수업시수'), d = await itemId('업무 곤란도');
    await page.setInputFiles(`${P} #mvEv-${h}`, { name: '교육과정 운영 계획.hwpx', mimeType: 'application/octet-stream', buffer: GONGMUN });
    await page.waitForFunction(h => (document.querySelector(`[data-mv-note="${h}"]`) || {}).value?.includes('[12, 2026.08.01.]'), h);
    assert(await page.inputValue(`${P} [data-mv-note="${h}"]`) === '• 2026학년도 학교 교육과정 운영 계획 [12, 2026.08.01.]', await page.inputValue(`${P} [data-mv-note="${h}"]`));
    assert(!reqs.some(r => r.prompt.startsWith('[다면평가 근거자료 제목 읽기]')), '규칙으로 다 찾으면 AI를 부르지 않음');
    await page.setInputFiles(`${P} #mvEv-${d}`, join(FIXTURES, 'sheet-1.png'));
    await page.waitForFunction(d => (document.querySelector(`[data-mv-note="${d}"]`) || {}).value?.includes('교내 상장'), d);
    assert(await page.inputValue(`${P} [data-mv-note="${d}"]`) === '• 교내 상장 [2026.11.03.]');
    const r = reqs.find(x => x.prompt.startsWith('[다면평가 근거자료 제목 읽기]'));
    assert(r.images === 1 && r.prompt.includes('업무 곤란도'), JSON.stringify({ images: r.images }));
    // 라벨을 고치면 비고도, 비고를 직접 고치면 「고친 글」(다시 쓰지 않음)
    const lab = `${P} [data-mv-evlabel^="${d}|"]`;
    await page.fill(lab, '교내 상장(지도교사 표창) [2026.11.03.]');
    assert(await page.inputValue(`${P} [data-mv-note="${d}"]`) === '• 교내 상장(지도교사 표창) [2026.11.03.]');
    await page.fill(`${P} [data-mv-note="${h}"]`, '• 학교 교육과정 [12, 2026.08.01.]\n• 담임 배정 공문');
    const v = await data();
    assert(v.quant.notesEdited[h] === true && v.quant.evidence[h].length === 1 && v.quant.evidence[d][0].label.includes('지도교사 표창'), JSON.stringify(v.quant.evidence));
    const n = await page.evaluate(async () => (await (await import('./core/form-store.js')).forms('multi')).list().then(l => l.map(f => f.kind)));
    assert(n.filter(k => k === 'evidence').length === 2 && n.includes('quant-form'), '이 기기(IndexedDB)에 보관: ' + n.join());
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-mv-evfile^="${h}|"]`)]);
    assert(dl.suggestedFilename() === '교육과정 운영 계획.hwpx', dl.suggestedFilename());
    assert((await page.textContent(P)).includes('근거자료 파일은 이 기기에만 있어요'), '안내');
  }],
  ['근거자료 칩: 라벨 + ×, 맨 끝에 [+ 근거자료], ×로 빼면 비고·파일도 빠짐', async () => {
    const h = await itemId('주당 수업시수'), w = await itemId('학교 행사 지원');
    const chips = await page.$$eval(`${P} .mv-item[data-item="${h}"] .mv-ev-list > li`, a => a.map(li => li.classList.contains('mv-evchip') ? 'chip:' + li.querySelector('[data-mv-evlabel]').value : li.textContent.trim()));
    assert(JSON.stringify(chips) === JSON.stringify(['chip:2026학년도 학교 교육과정 운영 계획 [12, 2026.08.01.]', '+ 근거자료']), JSON.stringify(chips));
    await page.setInputFiles(`${P} #mvEv-${w}`, { name: '행사 계획.hwpx', mimeType: 'application/octet-stream', buffer: GONGMUN });
    await page.waitForSelector(`${P} .mv-item[data-item="${w}"] .mv-evchip`);
    assert(await page.inputValue(`${P} [data-mv-note="${w}"]`) === '• 2026학년도 학교 교육과정 운영 계획 [12, 2026.08.01.]');
    const del = `${P} .mv-item[data-item="${w}"] [data-mv-evdel]`;
    assert(await page.getAttribute(del, 'aria-label') === '행사 계획.hwpx 빼기' && (await page.textContent(del)).trim() === '×');
    const sz = await page.$eval(del, e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
    assert(sz[0] >= 40 && sz[1] >= 44, '× 누르는 칸: ' + sz);
    await page.click(del);
    await page.waitForFunction(w => !document.querySelector(`.mv-item[data-item="${w}"] .mv-evchip`), w);
    const v = await data();
    assert(!v.quant.evidence[w] && !v.quant.notes[w], JSON.stringify([v.quant.evidence[w], v.quant.notes[w]]));
    const n = await page.evaluate(async () => (await (await import('./core/form-store.js')).forms('multi')).list().then(l => l.filter(f => f.kind === 'evidence').length));
    assert(n === 2, '뺀 파일은 이 기기에서도 지움: ' + n);
  }],
  ['한글 내려받기: 양식 모양(평가 기간·지표마다 한 줄·○·점수·소계·비고·감점·총 계·작성자·귀하·확인), 워드도', async () => {
    await page.click(`${P} [data-mv-pick="${await itemId('업무 곤란도')}"][data-i="0"]`);
    await page.fill(`${P} [data-mv-count="${await itemId('수업 나눔')}"]`, '1');
    assert((await total()).trim() === '84', '29 + 5 + 50: ' + await total());
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${P} [data-mv="exportQuant"][data-exp-main]`)]);
    assert(dl.suggestedFilename() === '2026학년도 교사 다면평가 기준(정량평가).hwpx', dl.suggestedFilename());
    const x = await hwpxText(dl);
    for (const s of ['평가 기간 : 2026. 3. 1. ~ 2027. 2. 28.', '평가지표', '비고(실적 증빙자료)', '주당 수업시수 (30점)', '•21시간 이상', '○', '1회', '( 84 )점', '• 담임 배정 공문', '※ 휴직 기간 2개월 감점(−1점)',
      '• 교내 상장(지도교사 표창) [2026.11.03.]', '※ 동점자는 담당업무', '상기 내용이 틀림없음을 확인하여 제출합니다.', '2026년 11월 11일', '작성자 : 교사 한가람 (서명)', '새싹초등학교 다면평가관리위원장 귀하', '최종'])
      assert(x.includes(s), '정량 문서에 ' + s);
    await page.click(`${P} [data-mv="exportQuant"] + [data-exp-menu]`);
    const [dw] = await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="docx"]')]);
    assert(dw.suggestedFilename().endsWith('.docx'));
    const dx = dec((await unzip(new Uint8Array(readFileSync(await dw.path())))).get('word/document.xml'));
    assert(dx.includes('주당 수업시수') && dx.includes('( 84 )점'), '워드 내용');
    await page.click(`${P} [data-mv="exportQuant"] + [data-exp-menu]`);
    await Promise.all([page.waitForEvent('download'), page.click('#expMenu [data-exp-fmt="hwpx"]')]);
  }],
  ['기준 고치기: 지표 글을 「3회 이상」으로 고치면 수 넣기 칸이 되고 그대로 저장', async () => {
    await page.click(`${P} .mv-edit summary`);
    const ii = await page.evaluate(() => { const v = JSON.parse(localStorage.getItem('ssam:multi')); return v.quant.criteria.groups[1].items.findIndex(i => i.name === '학교 행사 지원'); });
    await page.fill(`${P} [data-ce="tlabel"][data-g="1"][data-i="${ii}"][data-t="0"]`, '행사 3회 이상');
    await page.fill(`${P} [data-ce="tlabel"][data-g="1"][data-i="${ii}"][data-t="1"]`, '행사 3회 미만');
    await page.fill(`${P} [data-ce="iname"][data-g="1"][data-i="${ii}"]`, '학교 행사 지원 횟수');
    await page.click(`${P} h2`); // 칸을 벗어나면 다시 그림
    await page.waitForSelector(`${P} [data-mv-v="${await itemId('학교 행사 지원 횟수')}"]`);
    await page.fill(`${P} [data-mv-v="${await itemId('학교 행사 지원 횟수')}"]`, '4');
    assert(await score('학교 행사 지원 횟수') === '10점', await score('학교 행사 지원 횟수'));
    assert(await page.isVisible(`${P} .mv-edit[open]`), '기준 고치기는 펼친 채');
    await page.click(`${P} .mv-edit summary`);
  }],
  ['정성: 줄글 → AI로 넣기(가짜) — 다른 메뉴에 가도 이어지고 기타에 「AI가 일하는 중」 점, 학교·이름 없이 보냄', async () => {
    await page.click(`${P} [data-mv-view="qual"]`);
    assert((await page.textContent(P)).includes('예시 서식이에요'), '예시 서식 안내');
    await page.fill(`${P} #mvDraft`, '새싹초등학교 3학년 담임 한가람이에요. 최이솔 학생과 박하랑 학생을 상담했어요. 코스웨어로 수학 기초 학습을 매주 했어요.');
    slow = 900;
    await page.click(`${P} [data-mv="fill"]`);
    await page.click('nav.app-side [data-menu-go="plan"]');
    assert(await page.evaluate(() => document.querySelector('.side-btn[data-menu-go="etc"]').classList.contains('working')), '기타 메뉴에 점');
    await page.waitForTimeout(1300); slow = 0;
    await tab();
    await page.waitForSelector(`${P} [data-mv-need]`);
    const p = reqs.find(r => r.prompt.startsWith('[다면평가 자기실적평가서]')).prompt;
    clean(p, '정성 프롬프트');
    assert(p.includes('코스웨어로 수학 기초 학습') && p.includes('담당 학년 및 학급: 3-1') && p.includes('주당 수업시수: 22.8') && p.includes('업무: 부장'), p.slice(0, 400));
    assert(await page.inputValue(`${P} [data-mv-path="basics.담당 학년 및 학급"]`) === '3-1', '내 정보가 AI 답보다 앞섬');
    assert(await page.inputValue(`${P} [data-mv-path="basics.연간 학생 상담 실적"]`) === '25건');
    assert(await page.inputValue(`${P} [data-mv-line="sections.learn.추진 실적"][data-k="0"]`) === '코스웨어 활용 수학 기초 학습 주 1회');
    assert(await page.getAttribute(`${P} [data-mv-line="sections.pro.추진 목표"]`, 'placeholder') === '올해 연수 목표를 적어 주세요', 'AI 안내');
  }],
  ['입력 필요: 띠 n곳, 칸마다 빨간 표시 → 적으면 바로 사라짐, 자기 평가 고르기, 줄 더하기', async () => {
    const n = async () => +(await page.textContent(`${P} [data-mv-needn]`));
    const n0 = await n();
    assert(n0 > 5, '입력 필요 ' + n0);
    const tag = `${P} [data-need="basics.그 밖의 실적사항"]`;
    assert(await page.isVisible(tag), '빨간 표시');
    await page.fill(`${P} [data-mv-path="basics.그 밖의 실적사항"]`, '학생대회 지도 1회');
    assert(await page.isHidden(tag) && await n() === n0 - 1, '표시가 사라짐');
    await page.click(`${P} [data-mv-self="목표달성도"][data-level="만족"]`);
    assert(await n() === n0 - 2 && await page.getAttribute(`${P} [data-mv-self="목표달성도"][data-level="만족"]`, 'aria-pressed') === 'true');
    await page.fill(`${P} [data-mv-line="sections.pro.추진 목표"][data-k="0"]`, '연수 60시간 이상 이수');
    await page.click(`${P} [data-mv="lineAdd"][data-path="sections.pro.추진 목표"]`);
    await page.keyboard.type('수업 나눔 동아리 참여');
    assert(await n() === n0 - 3);
    const v = await data();
    assert(JSON.stringify(v.qual.report.sections.find(s => s.key === 'pro').parts[0].items) === JSON.stringify(['연수 60시간 이상 이수', '수업 나눔 동아리 참여']), JSON.stringify(v.qual.report.sections));
    assert(v.qual.filled['basics.그 밖의 실적사항'] && v.qual.filled['self.목표달성도'], JSON.stringify(v.qual.filled));
  }],
  ['다시 AI로 넣기 → 고친 칸을 덮을지 물음 → 두기', async () => {
    await page.click(`${P} [data-mv="fill"]`);
    await page.click('#sheetRoot [data-ask="keep"]');
    await waitToast('AI가 칸에 나눠 넣었어요');
    assert(await page.inputValue(`${P} [data-mv-path="basics.그 밖의 실적사항"]`) === '학생대회 지도 1회', '고친 칸은 그대로');
    assert(await page.getAttribute(`${P} [data-mv-self="목표달성도"][data-level="만족"]`, 'aria-pressed') === 'true');
  }],
  ['정성 내려받기: 입력 필요가 남으면 물음 → 그대로 → 교사 자기실적평가서', async () => {
    await page.click(`${P} [data-mv="exportQual"][data-exp-main]`);
    assert((await page.textContent('#sheetRoot')).includes('곳이 남았어요. 그대로 내려받을까요?'), '물음');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sheetRoot [data-ask="go"]')]);
    assert(dl.suggestedFilename() === '교사 자기실적평가서.hwpx', dl.suggestedFilename());
    const x = await hwpxText(dl);
    for (const s of ['교사 자기실적평가서', '1. 평가 지침', '2026년 3월 1일부터 2027년 2월 28일까지', SCHOOL, TEACHER, '3-1', '학생대회 지도 1회', '- 코스웨어 활용 수학 기초 학습 주 1회', '◦ 학습지도 추진 목표',
      '◦ 창의적 업무개선 사항', '※ 자기 평가 종합 상황', '○', '작성자(본인) 성명 한가람 서명(인)', '◇ 확인자(직근상급자)'])
      assert(x.includes(s), '자기실적평가서에 ' + s);
  }],
  ['정성 기준 양식(.hwpx) → 규칙으로 읽고 쓴 칸은 남음', async () => {
    await page.setInputFiles(`${P} #mvQualFile`, { name: '정성평가 기준.hwpx', mimeType: 'application/octet-stream', buffer: QUAL_FORM });
    await waitToast('양식을 읽었어요');
    assert((await toast()).includes('평가 지표 5개 · 기초 자료 10칸 · 영역 4개'), await toast());
    await page.click(`${P} .mv-crit summary`);
    assert((await page.textContent(`${P} .mv-crit`)).includes('학생 개개인의 특성을 파악하기 위하여 노력하는가?'), '평가 지표 보기');
    assert(await page.inputValue(`${P} [data-mv-path="basics.그 밖의 실적사항"]`) === '학생대회 지도 1회', '쓴 칸은 남음');
    assert(!(await page.textContent(P)).includes('예시 서식이에요'));
    assert(!reqs.some(r => r.prompt.startsWith('[다면평가 정성 기준 읽기]')), '규칙으로 읽음');
  }],
  ['사진 정량 기준 → AI가 읽음(그림), 맞는 항목이 없는 근거자료는 먼저 물은 뒤 지움', async () => {
    await page.click(`${P} [data-mv-view="quant"]`);
    await page.setInputFiles(`${P} #mvQuantFile`, join(FIXTURES, 'sheet-1.png'));
    await page.waitForSelector('[data-ask="go"]');
    const q = await page.evaluate(() => document.querySelector('[data-ask="go"]').closest('div').parentElement.textContent);
    assert(q.includes('근거자료') && q.includes('1개'), q);
    await page.click('[data-ask="go"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.mv-box .mv-item-h b')].map(b => b.textContent).join('|') === '주당 수업시수|직무연수');
    const r = reqs.filter(x => x.prompt.startsWith('[다면평가 정량 기준 읽기]')).at(-1);
    assert(r.images === 1, '그림으로 보냄');
    assert((await toast()).includes('AI가 읽었어요') && (await toast()).includes('근거자료 1개는 지웠어요'), await toast());
    assert(await score('주당 수업시수') === '30점', '값은 이어짐(감점 칸이 없는 기준)');
    const v = await data();
    assert(Object.keys(v.quant.evidence).length === 1, '주당 수업시수 근거자료만 남음');
  }],
  ['새로 고침 뒤 그대로: 쪽·내 정보·값·근거자료·정성 보고서', async () => {
    await page.reload(); await page.waitForTimeout(500);
    await tab();
    assert(await page.getAttribute(`${P} [data-mv-view="quant"]`, 'aria-pressed') === 'true', '누른 쪽 기억');
    assert(await page.inputValue(`${P} [data-mi="name"]`) === TEACHER);
    assert(await page.inputValue(`${P} [data-mv-v="${await itemId('주당 수업시수')}"]`) === '22.8');
    assert((await page.$$(`${P} [data-mv-evlabel]`)).length === 1, '근거자료');
    await page.click(`${P} [data-mv-view="qual"]`);
    assert(await page.inputValue(`${P} [data-mv-path="basics.그 밖의 실적사항"]`) === '학생대회 지도 1회', '정성 보고서');
  }],
  ['AI가 없으면: [넣기]가 낱말로 나눔, 사진 기준 양식은 안내, 사진 근거자료는 파일 이름', async () => {
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: {}, remember: true })));
    await page.reload(); await page.waitForTimeout(500);
    await tab();
    const n0 = reqs.length;
    assert((await page.textContent(`${P} [data-mv="fill"]`)).trim() === '넣기', '[넣기]');
    await page.fill(`${P} #mvDraft`, '전문적 학습공동체에서 수업 나눔을 3회 했어요.\n학교폭력 예방 교육을 운영했어요.\n출장 신청 절차를 간소화했어요.');
    await page.click(`${P} [data-mv="fill"]`);
    await page.click('#sheetRoot [data-ask="keep"]');
    await waitToast('낱말로 칸에 나눠 넣었어요');
    assert(await page.inputValue(`${P} [data-mv-line="sections.duty.창의적 업무개선 사항"][data-k="0"]`) === '출장 신청 절차를 간소화했어요');
    assert(await page.inputValue(`${P} [data-mv-line="sections.life.추진 실적"][data-k="0"]`) === '학교폭력 예방 교육을 운영했어요');
    assert(await page.inputValue(`${P} [data-mv-path="basics.그 밖의 실적사항"]`) === '학생대회 지도 1회', '고친 칸은 그대로');
    await page.click(`${P} [data-mv-view="quant"]`);
    await page.setInputFiles(`${P} #mvQuantFile`, join(FIXTURES, 'sheet-1.png'));
    await waitToast('사진·스캔 기준 양식은 AI가 읽어요');
    const j = await itemId('직무연수');
    await page.setInputFiles(`${P} #mvEv-${j}`, { name: '연수 이수증.png', mimeType: 'image/png', buffer: readFileSync(join(FIXTURES, 'sheet-1.png')) });
    await page.waitForFunction(j => (document.querySelector(`[data-mv-note="${j}"]`) || {}).value === '• 연수 이수증', j);
    assert(reqs.length === n0, 'AI를 부르지 않음');
    await page.evaluate(() => localStorage.setItem('ssam:engine', JSON.stringify({ engine: 'claude', keys: { claude: 'sk-test' }, remember: true })));
  }],
  ['채팅 등 다른 곳에서 openMulti(정성) → 문서·소통 › 다면평가 정성 쪽', async () => {
    await page.click('nav.app-side [data-menu-go="plan"]');
    await page.evaluate(() => import('./menus/etc/multi.js').then(m => m.openMulti('qual')));
    await page.waitForSelector(`${P} .mv-page`);
    assert(await page.getAttribute(`${P} [data-mv-view="qual"]`, 'aria-pressed') === 'true');
    assert(await page.getAttribute('#menuTabs [data-tab="multi"]', 'aria-current') === 'page');
  }],
  ['390px 폭: 정량·정성(펼친 칸 포함) 가로로 넘치지 않음 · 정량 요약 줄은 스크롤해도 위에', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const v of ['quant', 'qual']) {
      await page.click(`${P} [data-mv-view="${v}"]`); await page.waitForTimeout(100);
      if (v === 'quant') await page.click(`${P} .mv-edit summary`);
      if (!(await page.$(`${P} .mv-info[open]`))) await page.click(`${P} .mv-info summary`);
      const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, app: [document.querySelector('#app').scrollWidth, document.querySelector('#app').clientWidth] }));
      assert(r.doc <= 390 && r.app[0] <= r.app[1], `${v}: ${JSON.stringify(r)}`);
      if (v === 'quant') {
        // 휴대폰에서도 요약 줄은 위에(틀이 #app을 스크롤하든 문서를 스크롤하든)
        await page.evaluate(() => [...document.querySelectorAll('.mv-item')].at(-1).scrollIntoView({ block: 'center' }));
        // 스크롤하는 칸의 맨 위: #app이 스크롤하면 그 위(머리 줄 바로 아래 — 휴대폰 아래 탭 틀), 문서가 스크롤하면 화면 맨 위
        await page.waitForFunction(() => { const b = document.querySelector('.mv-bar').getBoundingClientRect(), a = document.querySelector('#app');
          const top = a.scrollHeight > a.clientHeight + 1 ? Math.max(0, a.getBoundingClientRect().top) : 0;
          return b.top >= top - 1 && b.top <= top + 24 && b.right <= innerWidth + 1; });
        const r2 = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, bar: document.querySelector('.mv-bar').getBoundingClientRect().height }));
        assert(r2.doc <= 390 && r2.bar < 220, '붙은 요약 줄: ' + JSON.stringify(r2));
        await page.evaluate(() => { document.querySelector('#app').scrollTop = 0; scrollTo(0, 0); });
      }
    }
    await page.setViewportSize({ width: 1280, height: 860 });
  }],
  ['AI로 간 글 모두에 학교·선생님·학생 이름이 없음', async () => {
    const kinds = new Set(reqs.map(r => r.prompt.split(']')[0] + ']'));
    for (const k of ['[다면평가 근거자료 제목 읽기]', '[다면평가 자기실적평가서]', '[다면평가 정량 기준 읽기]']) assert(kinds.has(k), `${k} 요청: ${[...kinds].join()}`);
    for (const r of reqs) clean(r.prompt, r.prompt.slice(0, 20));
  }],
  ['페이지 오류 없음', async () => { assert(errors.length === 0, errors.join(' | ')); }]
]);
await t.close();
