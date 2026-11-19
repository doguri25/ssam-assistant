// 연수 수합(스펙 2026-11-18-training-design §4, 2026-11-19 선생님 요청): 구분 짐작·고치기, 연수 대상(—), 구글 드라이브 ZIP 이수증 넣기(파일은 보관하지 않고 이수번호만 — 2026-11-19 두 번째 요청),
// 사진 이수증은 연수 이름을 눌러 이수번호 넣기, 구글 폼 응답(연수 열이 없으면 묻기·이수번호 칸), 교육청 실적 표 복사, 내부결재 결과 보고(관련은 공문·명단에 이수번호),
// 예전에 보관한 이수증(kept)은 [예전 이수증 묶음]·미제출로 돌리면 지움. AI는 부르지 않음. 예시 이름은 지어낸 것
import { readFileSync } from 'node:fs';
import { open, run, assert, enter } from './helpers.mjs';
import { zipStore, unzip } from '../../web/core/zip.js';

const t = await open();
const { page, ctx, url, errors } = t;
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
await page.clock.setFixedTime(new Date('2026-11-19T09:00:00'));
let aiCalls = 0;
await page.route(/api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com|api\.upstage\.ai/, r => { aiCalls++; r.abort(); });
page.on('dialog', d => d.accept());
const V = 'section[data-menu="training"]';
const board = () => page.evaluate(() => JSON.parse(localStorage.getItem('ssam:training:board') || 'null'));
const sid = async n => (await board()).staff.find(s => s.name === n).id;
const dec = new TextDecoder();
await page.goto(url);
await page.waitForTimeout(400);
await page.evaluate(() => {
  localStorage.setItem('ssam:gongmun:list', JSON.stringify([{ id: 'gmL', name: 'a.hwpx', title: '2026년 법정의무교육 이수 및 실적 제출 안내', from: '새싹교육지원청', no: '교육지원과-1234', date: '2026-11-02',
    summary: '이수 후 실적 제출', due: '2026-11-27', tasks: [], kinds: [], text: '글', at: 1 }]));
  localStorage.setItem('ssam:training:board', JSON.stringify({
    staff: [{ id: 'a', name: '김하늘', dept: '3학년 담임' }, { id: 'b', name: '이바다', dept: '보건교사' }, { id: 'c', name: '한가람', dept: '행정실' }, { id: 'd', name: '박솔빛', dept: '교무실무사' }],
    courses: [{ id: 'c1', title: '성희롱·성폭력 예방교육', due: '2026-11-27', from: 'gongmun:gmL' }, { id: 'c2', title: '학교폭력 예방교육', target: ['교원'] }], marks: {} }));
});

await run('fix1119-training-collect', [
  ['구분은 부서로 짐작, 명단 시트에서 고치기', async () => {
    await enter(page, 'training', 'board');
    await page.waitForSelector(`${V} .tr-table`);
    assert((await board()).staff.map(s => s.kind).join(',') === ',,,', '저장값은 아직 없음(읽을 때 짐작)');
    const kinds = await page.$$eval(`${V} .tr-table tbody tr td:nth-of-type(1)`, l => l.map(x => x.textContent.trim()));
    assert(kinds.join(',') === '교원,교원,직원,공무직', kinds.join(','));
    await page.click(`${V} [data-tr="staff"]`);
    await page.selectOption(`#trStaffSheet [data-tr-kind="c"]`, '공무직');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:training:board')).staff.find(s => s.id === 'c').kind === '공무직');
    await page.selectOption(`#trStaffSheet [data-tr-kind="c"]`, '직원');
    await page.click('#trStaffSheet [data-close]');
  }],
  ['연수 대상: 교원만인 연수는 다른 사람 칸이 「—」, 이수율은 대상만', async () => {
    assert(!(await page.$(`${V} [data-tr-cell="c2|c"]`)) && (await page.textContent(`${V} .tr-table tbody tr:nth-child(3) td.tr-na`)).trim() === '—', '대상 아닌 칸');
    assert((await page.textContent(`${V} [data-tr-course="c2"]`)).includes('0/2명') && (await page.textContent(`${V} [data-tr-course="c2"]`)).includes('대상 교원'), await page.textContent(`${V} [data-tr-course="c2"]`));
  }],
  ['구글 드라이브 ZIP: 풀어서 사람·연수 맞추고 이수번호·이수일만(파일은 보관하지 않음)', async () => {
    const zip = zipStore([
      { name: '이수증(파일 응답)/성희롱 이수증 - 이바다.pdf', data: new Uint8Array([37, 80, 68, 70]) },
      { name: '이수증(파일 응답)/cert - 한가람.txt', data: '이수증\n제 중앙교육연수원-유초중-직무-2026-000123 호\n성명: 한가람\n과정: 2026 성희롱·성폭력 예방교육\n이수일: 2026. 11. 5.\n이수시간: 1시간' },
      { name: '이수증(파일 응답)/학교폭력 - 김하늘.jpg', data: new Uint8Array([255, 216, 255]) }]);
    await page.setInputFiles(`${V} #trBoardFiles`, [{ name: 'drive-download.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) }]);
    await page.waitForFunction(() => { const m = (JSON.parse(localStorage.getItem('ssam:training:board')).marks || {}); return m.c1 && m.c1.b && m.c1.c && m.c2 && m.c2.a; });
    const b = await board();
    assert(!b.marks.c1.b.kept && !b.marks.c1.c.kept && !b.marks.c2.a.kept, JSON.stringify(b.marks));
    assert(b.marks.c1.c.date === '2026-11-05' && b.marks.c1.c.hours === 1 && b.marks.c1.c.code === '중앙교육연수원-유초중-직무-2026-000123', JSON.stringify(b.marks.c1.c));
    assert((await page.textContent(`${V} [data-tr-cell="c1|c"]`)).includes('#') && !(await page.textContent(`${V} [data-tr-cell="c1|b"]`)).includes('#'), '이수번호 표시');
    assert((await page.textContent('#toast')).includes('이수번호를 읽지 못한 2개'), await page.textContent('#toast'));
    const stored = await page.evaluate(async () => (await (await (await import('./core/form-store.js')).forms('training')).list()).length);
    assert(stored === 0, `보관한 파일 ${stored}개`);
    assert(!(await page.$(`${V} [data-tr="zip"]`)), '보관한 이수증이 없으면 묶음 단추 없음');
  }],
  ['사진 이수증: 연수 이름을 눌러 이수번호 넣기', async () => {
    await page.click(`${V} [data-tr="course"][data-id="c2"]`);
    await page.waitForSelector('#trCourseSheet');
    assert(await page.isVisible('#trCourseSheet [data-tr-csc="a"]'), '제출 칸의 이수번호 칸');
    await page.fill('#trCourseSheet [data-tr-csc="a"]', '충남 - 특직 - 2026 - 0042 호');
    await page.click('#trCsOk');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ssam:training:board')).marks.c2.a.code === '충남-특직-2026-0042');
    assert((await board()).marks.c2.a.s === 'sent', '상태는 그대로');
  }],
  ['구글 폼 응답: 연수 칸이 없으면 어느 연수인지 묻고, 링크·날짜를 남김', async () => {
    const csv = '﻿타임스탬프,성명,이수증 업로드,이수번호\n2026/11/06 10:00:00,박솔빛,https://drive.google.com/open?id=p1,충남-특직-2026-0007\n2026/11/06 11:00:00,최누리,,\n';
    await page.setInputFiles(`${V} #trFormFile`, [{ name: '응답.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }]);
    await page.waitForSelector('#trFormSheet');
    await page.selectOption('#trFormCourse', 'c1');
    await page.click('#trFormOk');
    await page.waitForSelector(`${V} .tr-pend`);
    const m = (await board()).marks.c1.d;
    assert(m.s === 'sent' && m.link === 'https://drive.google.com/open?id=p1' && m.date === '2026-11-06' && m.code === '충남-특직-2026-0007' && !m.kept, JSON.stringify(m));
    assert((await page.textContent(`${V} .tr-pend`)).includes('최누리') && (await page.textContent(`${V} .tr-pend`)).includes('구글 폼 응답'), '명단에 없는 사람은 고르기');
    await page.click(`${V} [data-tr="bpDrop"][data-i="0"]`);
  }],
  ['교육청 실적 표 복사(구분별)', async () => {
    await page.click(`${V} [data-tr="stats"]`);
    await page.waitForTimeout(150);
    const tsv = await page.evaluate(() => navigator.clipboard.readText());
    const lines = tsv.split('\n');
    assert(lines[0] === '연수\t구분\t대상\t이수\t미이수\t이수율', lines[0]);
    assert(lines.includes('성희롱·성폭력 예방교육\t교원\t2\t1\t1\t50%') && lines.includes('성희롱·성폭력 예방교육\t계\t4\t3\t1\t75%') && lines.includes('학교폭력 예방교육\t계\t2\t1\t1\t50%'), tsv);
  }],
  ['엑셀 명단표에 이수번호', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-tr="csv"]`)]);
    const csv = dec.decode(readFileSync(await dl.path()));
    assert(csv.includes('한가람,직원,행정실,제출(11. 5.) 중앙교육연수원-유초중-직무-2026-000123') && csv.includes('충남-특직-2026-0042'), csv);
  }],
  ['결과 보고: 관련은 연수를 넣은 공문, 한글 파일에 이수 현황·붙임·명단', async () => {
    await page.click(`${V} [data-tr="report"]`);
    await page.waitForSelector('#trReport');
    assert(await page.inputValue('#trRepRel') === '새싹교육지원청 교육지원과-1234(2026. 11. 2.) 「2026년 법정의무교육 이수 및 실적 제출 안내」', await page.inputValue('#trRepRel'));
    assert(await page.inputValue('#trRepTitle') === '2026학년도 성희롱·성폭력 예방교육 등 법정의무교육 이수 결과 보고', await page.inputValue('#trRepTitle'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#trRepGo')]);
    const files = await unzip(new Uint8Array(readFileSync(await dl.path())));
    const xml = [...files.entries()].filter(([n]) => /section\d*\.xml$/.test(n)).map(([, v]) => dec.decode(v)).join('');
    for (const w of ['1. 관련: 새싹교육지원청', '이수 결과를 다음과 같이 보고합니다', '구분별 이수 현황', '붙임 1. 연수별 이수 현황 명단', '한가람', '이수(11. 5.) 중앙교육연수원-유초중-직무-2026-000123', '대상 아님'])
      assert(xml.includes(w), `${w} 없음`);
    assert(!xml.includes('이수증 4부'), '보관한 이수증이 없으면 붙임 2 없음');
    await page.click('#trReport [data-close]');
  }],
  ['예전에 보관한 이수증: [예전 이수증 묶음], 미제출로 돌리면 지움', async () => {
    const kept = () => page.evaluate(async () => (await (await (await import('./core/form-store.js')).forms('training')).list()).map(f => f.id));
    // 0.37까지 보관하던 파일(이 기기 IndexedDB)과 kept 표시
    await page.evaluate(async () => {
      const st = await (await import('./core/form-store.js')).forms('training');
      for (const [c, s, n] of [['c1', 'b', '이바다.pdf'], ['c1', 'c', '한가람.txt'], ['c2', 'a', '김하늘.jpg']]) await st.put({ id: `2026|${c}|${s}`, name: n, bytes: new Uint8Array([1, 2]), savedAt: 1 });
      const k = 'ssam:training:board', b = JSON.parse(localStorage.getItem(k));
      b.marks.c1.b.kept = true; b.marks.c1.c.kept = true; b.marks.c2.a.kept = true; localStorage.setItem(k, JSON.stringify(b));
    });
    await enter(page, 'training', 'mine'); await enter(page, 'training', 'board');
    const [dl0] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-tr="zip"]`)]);
    const names0 = [...(await unzip(new Uint8Array(readFileSync(await dl0.path())))).keys()];
    assert(names0.includes('성희롱·성폭력 예방교육/성희롱·성폭력 예방교육_이바다(보건교사).pdf') && names0.includes('이수 현황.csv'), names0.join(' | '));
    const before = await kept();
    assert(before.length === 3 && before.every(id => id.startsWith('2026|')), before.join(','));
    const cell = `${V} [data-tr-cell="c1|b"]`;
    await page.click(cell); // 제출 → 확인
    await page.click(cell); // 확인 → 미제출
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem('ssam:training:board')).marks.c1.b);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`${V} [data-tr="zip"]`)]);
    const names = [...(await unzip(new Uint8Array(readFileSync(await dl.path())))).keys()];
    assert(!names.some(n => n.includes('이바다')), names.join(' | '));
    const after = await kept();
    assert(after.length === 2 && !after.includes('2026|c1|b'), after.join(','));
  }],
  ['좁은 화면(360px) 가로 스크롤 없음', async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.setViewportSize({ width: 1280, height: 860 });
    assert(ok, '가로 스크롤');
  }],
  ['AI를 부르지 않음·페이지 오류 없음', async () => {
    assert(aiCalls === 0, `AI ${aiCalls}번`);
    assert(errors.length === 0, errors.join(' | '));
  }]
]);
await t.close();
