// 기초학력 캠프 › 학교 한글 양식(.hwpx) 표 채우기(fillCampForm): 수업 확인서·출석부(교시형·날짜형)·관찰 기록부.
// 양식은 지어낸 것(makeHwpx). 결재란 표는 그대로, 확인(서명) 칸은 비움, 칸이 모자라면 알림
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCamp } from '../../web/menus/class/camp-model.js';
import { fillCampForm } from '../../web/menus/class/camp-form.js';
import { readTables } from '../../web/core/hwpx-table.js';
import { makeHwpx } from '../../web/core/hwpx.js';

const S = (id, date, start, end, subject, content) => ({ id, date, start, end, subject, content });
const camp = (f = {}) => newCamp({
  name: '겨울 교과캠프', teacher: '한가람', subjects: ['국어', '수학'],
  students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '김하늘' }, { id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }, { id: 'c', grade: 3, cls: 1, no: 2, name: '박구름' }],
  sessions: [S('s1', '2027-01-08', '09:00', '09:40', '국어', '낱말 읽기'), S('s2', '2027-01-08', '09:45', '10:25', '수학', '두 자리 덧셈'), S('s3', '2027-01-11', '09:00', '09:40', '국어', '받아쓰기')],
  att: { s1: { a: 'O', b: 'X', c: 'O' }, s2: { a: 'O', b: 'O' }, s3: { a: 'O', c: 'X' } },
  obs: { a: '받아쓰기에 자신감이 붙음.', b: '두 자리 덧셈을 정확히 함.', c: '끝까지 집중함.' },
  ...f
});
const form = blocks => makeHwpx({ title: '양식', blocks });
const APPROVAL = { type: 'table', head: true, rows: [['계(담당자)', '교감', '교장'], ['', '', '']] };
const bytesOf = out => (out instanceof Uint8Array ? out : out.bytes);

test('수업 확인서: 학교 양식 표에 수업 줄을 채우고 「계」 줄에 총 시간, 결재란은 그대로, 확인(서명)은 비움', async () => {
  const f = form([APPROVAL, { type: 'p', text: '지도교사 :      (인)' },
    { type: 'table', head: true, rows: [['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)'], ['', '', '', '', '', ''], ['', '', '', '', '', ''], ['계', '지도 시간: 총 (    )시간', '', '', '', '']] }]);
  const out = await fillCampForm('confirm', camp(), f);
  const { tables, texts } = await readTables(bytesOf(out));
  assert.deepEqual(tables[0].rows, [['계(담당자)', '교감', '교장'], ['', '', '']], '결재란');
  const t = tables[1].rows;
  assert.deepEqual(t[0], ['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)']);
  assert.deepEqual(t.slice(1, 4).map(r => [r[0], r[2], r[3], r[4], r[5]]), [['1', '09:00~09:40', '국어', '낱말 읽기', ''], ['2', '09:45~10:25', '수학', '두 자리 덧셈', ''], ['3', '09:00~09:40', '국어', '받아쓰기', '']]);
  assert.ok(t[1][1].includes('1. 8.') && t[2][1] === '' && t[3][1].includes('1. 11.'), '날짜는 그날 첫 줄에만');
  assert.equal(t.length, 5);
  assert.ok(t[4][0] === '계' && t[4][1].includes('총 ( 3 )시간'), JSON.stringify(t[4]));
  assert.ok(texts.some(x => x.includes('지도교사 : 한가람')), JSON.stringify(texts));
});

test('출석부(교시형): 학생 칸에 이름, 수업 줄마다 ○·/, 「계」 줄에 학생별 출석 수 — 학생 칸이 모자라면 알림', async () => {
  const f = form([{ type: 'table', head: true, rows: [['순', '일시', '시간', '', ''], ['', '', '', '', ''], ['계', '', '', '', '']] }]);
  const out = await fillCampForm('attend', camp(), f);
  const t = (await readTables(bytesOf(out))).tables[0].rows;
  assert.deepEqual(t[0], ['순', '일시', '시간', '김하늘', '이바다']);
  assert.deepEqual(t.slice(1, 4).map(r => [r[0], r[2], r[3], r[4]]), [['1', '09:00~09:40', '○', '/'], ['2', '09:45~10:25', '○', '○'], ['3', '09:00~09:40', '○', '']]);
  assert.deepEqual(t[4], ['계', '', '', '3', '1']);
  assert.ok(out.warn && out.warn.join(' ').includes('2명만'), JSON.stringify(out.warn));
});

test('출석부(날짜형): 학생 줄마다 학년-반·이름·날짜별 ○·/·계, 머리 줄 날짜 칸에 날짜', async () => {
  const f = form([{ type: 'table', head: true, rows: [['순', '학년-반', '이름', '', '', '', '계'], ['', '', '', '', '', '', '']] }]);
  const out = await fillCampForm('attend', camp({ unit: 'day' }), f);
  const t = (await readTables(bytesOf(out))).tables[0].rows;
  assert.deepEqual(t[0], ['순', '학년-반', '이름', '1/8', '1/11', '', '계']);
  assert.deepEqual(t.slice(1), [['1', '3-2', '김하늘', '○', '○', '', '2'], ['2', '3-2', '이바다', '○', '', '', '1'], ['3', '3-1', '박구름', '○', '/', '', '1']]);
  assert.ok(!out.warn || !out.warn.length, JSON.stringify(out.warn));
});

test('관찰 기록부: 「이름」 줄에 학생 이름, 「관찰 및 지도 결과」 줄에 글 — 칸이 모자라면 알림', async () => {
  const f = form([{ type: 'table', head: true, rows: [['이름', '', ''], ['관찰 및 지도 결과', '', '']] }]);
  const out = await fillCampForm('observe', camp(), f);
  const t = (await readTables(bytesOf(out))).tables[0].rows;
  assert.deepEqual(t, [['이름', '김하늘', '이바다'], ['관찰 및 지도 결과', '받아쓰기에 자신감이 붙음.', '두 자리 덧셈을 정확히 함.']]);
  assert.ok(out.warn.join(' ').includes('2명만'), JSON.stringify(out.warn));
});

test('맞는 표가 없거나 결과 보고서면 code로 알림(화면은 기본 양식으로)', async () => {
  await assert.rejects(fillCampForm('confirm', camp(), form([{ type: 'p', text: '표 없음' }])), e => e.code === 'NO_MATCH');
  await assert.rejects(fillCampForm('report', camp(), form([{ type: 'p', text: '1. 운영 목적' }])), e => e.code === 'REPORT_DEFAULT');
  await assert.rejects(fillCampForm('confirm', camp(), new Uint8Array([1, 2, 3])), e => e.code === 'NOT_HWPX');
});

/* ---------- 손으로 쓴 양식(합친 칸) ---------- */
import { RUN, PARA, TBL, TPARA, handForm, D } from './hwpx-hand.mjs';
const H = (t, c, extra = {}) => ({ t, c, h: 1000, head: 1, ...extra });
/* 교시형 출석부: 머리 두 줄(순·일시·시간 rowSpan=2, 학생 colSpan=3 / 학생1~3), 일시 칸이 세 교시를 묶음, 계 줄(순~시간 colSpan=3) */
const ATTEND = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '학생 출석 및 관찰 기록부')}`, 1)
  + PARA(RUN(0, '지도교사 : '))
  + TPARA(TBL([
    [H('순', 0, { rs: 2, h: 2000 }), H('일시', 1, { rs: 2, h: 2000 }), H('시간', 2, { rs: 2, h: 2000 }), H('학생', 3, { cs: 3 })],
    [H('학생1', 3), H('학생2', 4), H('학생3', 5)],
    [D('1', 0), D('', 1, { rs: 3, h: 3600 }), D('', 2), D('', 3), D('', 4), D('', 5)],
    [D('2', 0), D('', 2), D('', 3), D('', 4), D('', 5)],
    [D('3', 0), D('', 2), D('', 3), D('', 4), D('', 5)],
    [{ t: '계', c: 0, cs: 3, h: 1200 }, D('', 3), D('', 4), D('', 5)]], 6, 8800));

test('손 양식 출석부(교시형): 두 줄 머리의 학생1~3 칸에 이름(남는 칸은 지움), 묶인 일시 칸은 줄마다, 계 줄은 학생 칸에 출석 수, 지도교사', async () => {
  const c = camp({ students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '김하늘' }, { id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }] });
  const out = await fillCampForm('attend', c, await handForm(ATTEND));
  const { tables, texts } = await readTables(bytesOf(out));
  const t = tables[0].rows;
  assert.deepEqual(t.slice(0, 2), [['순', '일시', '시간', '학생', '', ''], ['', '', '', '김하늘', '이바다', '']]);
  assert.deepEqual(t.slice(2, 5).map(r => [r[0], r[2], r[3], r[4], r[5]]), [['1', '09:00~09:40', '○', '/', ''], ['2', '09:45~10:25', '○', '○', ''], ['3', '09:00~09:40', '○', '', '']]);
  assert.ok(t[2][1].includes('1. 8.') && t[3][1] === '' && t[4][1].includes('1. 11.'), JSON.stringify(t.map(r => r[1])));
  assert.deepEqual(t[5], ['계', '', '', '3', '1', '']);
  assert.ok(texts.includes('지도교사 : 한가람'), JSON.stringify(texts));
  assert.ok(!out.warn || !out.warn.length);
});

test('관찰 기록부: 쪽마다 표가 있으면 차례로 나눠 채움(남는 칸은 빈칸), 학생 칸이 넉넉하면 알림 없음', async () => {
  const T = { type: 'table', head: true, rows: [['이름', '학생1', '학생2'], ['관찰 및 지도 결과', '', '']] };
  const out = await fillCampForm('observe', camp(), form([T, { type: 'break' }, T]));
  const ts = (await readTables(bytesOf(out))).tables.map(x => x.rows);
  assert.deepEqual(ts, [
    [['이름', '김하늘', '이바다'], ['관찰 및 지도 결과', '받아쓰기에 자신감이 붙음.', '두 자리 덧셈을 정확히 함.']],
    [['이름', '박구름', ''], ['관찰 및 지도 결과', '끝까지 집중함.', '']]]);
  assert.ok(!out.warn || !out.warn.length, JSON.stringify(out.warn));
});

test('관찰 기록부(줄 꼴): 머리 「번호·이름·관찰 및 지도 결과」 아래 학생마다 한 줄', async () => {
  const out = await fillCampForm('observe', camp(), form([{ type: 'table', head: true, rows: [['번호', '이름', '관찰 및 지도 결과'], ['', '', '']] }]));
  assert.deepEqual((await readTables(bytesOf(out))).tables[0].rows, [['번호', '이름', '관찰 및 지도 결과'],
    ['1', '김하늘', '받아쓰기에 자신감이 붙음.'], ['2', '이바다', '두 자리 덧셈을 정확히 함.'], ['3', '박구름', '끝까지 집중함.']]);
});

test('출석부(날짜형): 학년·반·번호 칸이 따로면 따로, 날짜 칸이 모자라면 알림(계는 모든 날로 셈)', async () => {
  const f = form([{ type: 'table', head: true, rows: [['순', '학년', '반', '번호', '이름', '날짜', '계'], ['', '', '', '', '', '', '']] }]);
  const out = await fillCampForm('attend', camp({ unit: 'day' }), f);
  const t = (await readTables(bytesOf(out))).tables[0].rows;
  assert.deepEqual(t[0], ['순', '학년', '반', '번호', '이름', '1/8', '계']);
  assert.deepEqual(t[1], ['1', '3', '2', '5', '김하늘', '○', '2']);
  assert.ok(out.warn.join(' ').includes('1날만'), JSON.stringify(out.warn));
});

test('수업 확인서: 「총 (   )시간」 글이 없으면 계 줄의 다음 칸에 지도 시간, 일시 칸 이름 「일 시」도 알아봄', async () => {
  const f = form([{ type: 'table', head: true, rows: [['순', '일 시', '교과', '지도 내용', '확인'], ['1', '', '', '', ''], ['계', '', '', '', '']] }]);
  const t = (await readTables(bytesOf(await fillCampForm('confirm', camp(), f)))).tables[0].rows;
  assert.equal(t.length, 5);
  assert.deepEqual(t[1].slice(2), ['국어', '낱말 읽기', '']);
  assert.ok(t[1][1].startsWith('1. 8.') && t[1][1].includes('09:00~09:40'), '시간 칸이 없으면 일시 칸에 시간도: ' + t[1][1]);
  assert.deepEqual(t[4].slice(0, 2), ['계', '지도 시간: 총 ( 3 )시간']);
});

/* 견본 모양: 교시형 머리 「순 | 이름·일시(일시·시간 두 칸을 합친 대각선 칸) | 학생 칸…」 */
const ATTEND_DIAG = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '교과캠프 학생 출석 및 관찰 기록부')}`, 1)
  + TPARA(TBL([
    [H('순', 0), H('이름\n일 시', 1, { cs: 2 }), H('가나다', 3), H('라마바', 4)],
    [D('1', 0), D('', 1, { rs: 2, h: 2400 }), D('', 2), D('', 3), D('', 4)],
    [D('2', 0), D('', 2), D('', 3), D('', 4)],
    [{ t: '계', c: 0, cs: 3, h: 1200 }, D('', 3), D('', 4)]], 5, 4600));

test('견본 교시형: 「이름·일시」 합친 머리 칸 아래 두 칸은 날짜·시간, 그 뒤 학생 칸', async () => {
  const c = camp({ students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '김하늘' }, { id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }] });
  const t = (await readTables(bytesOf(await fillCampForm('attend', c, await handForm(ATTEND_DIAG))))).tables[0].rows;
  assert.deepEqual(t[0], ['순', '이름\n일 시', '', '김하늘', '이바다']);
  assert.ok(t[1][1].startsWith('1. 8.') && t[1][2] === '09:00~09:40' && t[2][1] === '' && t[2][2] === '09:45~10:25', JSON.stringify(t.slice(1, 3)));
  assert.deepEqual(t[1].slice(3), ['○', '/']);
  assert.deepEqual(t.at(-1), ['계', '', '', '3', '1']);
});

/* 견본 날짜형: 머리 두 줄(학년-반·이름·계는 rowSpan 2, 날짜 칸은 위 줄 월·아래 줄 일) */
const DAY2 = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '교과캠프 학생 출석부')}`, 1)
  + TPARA(TBL([
    [H('순', 0, { rs: 2, h: 2000 }), H('학년-반', 1, { rs: 2, h: 2000 }), H('이름', 2, { rs: 2, h: 2000 }), H('9', 3), H('9', 4), H('10', 5), H('계', 6, { rs: 2, h: 2000 })],
    [H('3', 3), H('10', 4), H('1', 5)],
    [D('1', 0), D('', 1), D('', 2), D('', 3), D('', 4), D('', 5), D('', 6)]], 7, 3200));

test('견본 날짜형: 날짜 머리가 두 줄(월·일)이면 위 줄에 월, 아래 줄에 일, 쓰지 않는 날짜 칸은 비움', async () => {
  const t = (await readTables(bytesOf(await fillCampForm('attend', camp({ unit: 'day' }), await handForm(DAY2))))).tables[0].rows;
  assert.deepEqual(t.slice(0, 2), [['순', '학년-반', '이름', '1', '1', '', '계'], ['', '', '', '8', '11', '', '']]);
  assert.deepEqual(t[2], ['1', '3-2', '김하늘', '○', '○', '', '2']);
  assert.equal(t.length, 5);
});

/* ---------- 검토에서 나온 양식 모양 ---------- */
const rowsOf = async out => (await readTables(bytesOf(out))).tables.map(t => t.rows);
test('교시형: 학생 칸이 아닌 칸(교과·비고·교사 사인)은 그대로, 칸에 적힌 학생 이름(지어낸)·빈칸·「학생1」만 학생 칸', async () => {
  const f = form([{ type: 'table', head: true, rows: [['순', '일시', '시간', '교과', '가나다', '학생2', '', '비고', '교사 사인'], ['', '', '', '', '', '', '', '', ''], ['계', '', '', '', '', '', '', '', '']] }]);
  const out = await fillCampForm('attend', camp(), f);
  const [t] = await rowsOf(out);
  assert.deepEqual(t[0], ['순', '일시', '시간', '교과', '김하늘', '이바다', '박구름', '비고', '교사 사인']);
  assert.deepEqual(t[1].slice(3), ['', '○', '/', '○', '', '']);
  assert.ok(!out.warn.length, JSON.stringify(out.warn));
});

test('날짜형: 성별·출석률 칸은 날짜 칸이 아님, 날짜 아래 요일 줄이면 위 줄에 날짜·아래 줄에 요일', async () => {
  const WD = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '출석부')}`, 1) + TPARA(TBL([
    [H('순', 0, { rs: 2, h: 2000 }), H('이름', 1, { rs: 2, h: 2000 }), H('성별', 2, { rs: 2, h: 2000 }), H('', 3), H('', 4), H('출석률', 5, { rs: 2, h: 2000 }), H('계', 6, { rs: 2, h: 2000 })],
    [H('월', 3), H('화', 4)],
    [D('1', 0), D('', 1), D('', 2), D('', 3), D('', 4), D('', 5), D('', 6)]], 7, 3200));
  const [t] = await rowsOf(await fillCampForm('attend', camp({ unit: 'day' }), await handForm(WD)));
  assert.deepEqual(t.slice(0, 2), [['순', '이름', '성별', '1/8', '1/11', '출석률', '계'], ['', '', '', '금', '월', '', '']]);
  assert.deepEqual(t[2], ['1', '김하늘', '', '○', '○', '', '2']);
});

test('날짜형: 위 줄 월 칸이 날짜 칸 여럿을 합쳤으면 그 칸에 「n월」, 아래 줄에 일', async () => {
  const MONTH = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '출석부')}`, 1) + TPARA(TBL([
    [H('순', 0, { rs: 2, h: 2000 }), H('이름', 1, { rs: 2, h: 2000 }), H('9월', 2, { cs: 3 }), H('계', 5, { rs: 2, h: 2000 })],
    [H('3', 2), H('10', 3), H('17', 4)],
    [D('1', 0), D('', 1), D('', 2), D('', 3), D('', 4), D('', 5)]], 6, 3200));
  const [t] = await rowsOf(await fillCampForm('attend', camp({ unit: 'day' }), await handForm(MONTH)));
  assert.deepEqual(t.slice(0, 2), [['순', '이름', '1월', '', '', '계'], ['', '', '8', '11', '', '']]);
});

test('합친 머리 칸만 있어 이름·날짜를 쓸 칸이 없으면 알림', async () => {
  const MERGED = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '출석부')}`, 1) + TPARA(TBL([
    [H('순', 0), H('일시', 1), H('시간', 2), H('학생', 3, { cs: 3 })],
    [D('1', 0), D('', 1), D('', 2), D('', 3), D('', 4), D('', 5)]], 6, 2200));
  const out = await fillCampForm('attend', camp(), await handForm(MERGED));
  assert.ok(out.warn.join(' ').includes('이름'), JSON.stringify(out.warn));
});

test('관찰: 「지도 교과」 줄은 건너뛰고 「관찰 및 지도 결과」 줄에, 한 표에 이름·결과 묶음이 둘이면 둘 다', async () => {
  const f = form([{ type: 'table', head: true, rows: [['이름', '', ''], ['지도 교과', '국어', '수학'], ['관찰 및 지도 결과', '', ''], ['이름', '', ''], ['관찰 및 지도 결과', '', '']] }]);
  const out = await fillCampForm('observe', camp(), f);
  const [t] = await rowsOf(out);
  assert.deepEqual(t, [['이름', '김하늘', '이바다'], ['지도 교과', '국어', '수학'], ['관찰 및 지도 결과', '받아쓰기에 자신감이 붙음.', '두 자리 덧셈을 정확히 함.'],
    ['이름', '박구름', ''], ['관찰 및 지도 결과', '끝까지 집중함.', '']]);
  assert.ok(!out.warn.length, JSON.stringify(out.warn));
});

test('출석 및 관찰 기록부 양식(교시형): 출석표와 함께 뒤쪽 관찰 표도 채움', async () => {
  const f = form([{ type: 'table', head: true, rows: [['순', '일시', '시간', '', '', ''], ['', '', '', '', '', ''], ['계', '', '', '', '', '']] }, { type: 'break' },
    { type: 'table', head: true, rows: [['이름', '', '', ''], ['관찰 및 지도 결과', '', '', '']] }]);
  const [, o] = await rowsOf(await fillCampForm('attend', camp(), f));
  assert.deepEqual(o, [['이름', '김하늘', '이바다', '박구름'], ['관찰 및 지도 결과', '받아쓰기에 자신감이 붙음.', '두 자리 덧셈을 정확히 함.', '끝까지 집중함.']]);
});

test('표 안 제목 줄은 칸 이름에서 빼고, 「순서」도 순 칸, 첫 머리 칸이 비어도 머리로 봄', async () => {
  const f = form([{ type: 'table', head: true, rows: [['교과캠프 수업 확인서', '', '', '', ''], ['순서', '날짜', '시간', '지도 내용', '확인(서명)'], ['1', '', '', '', ''], ['계', '', '', '', '']] }]);
  const T = secPr => PARA(`<hp:run charPrIDRef="2">${secPr}</hp:run>${RUN(2, '확인서')}`, 1) + TPARA(TBL([
    [H('교과캠프 수업 확인서', 0, { cs: 5 })], ['순서', '날짜', '시간', '지도 내용', '확인(서명)'].map((x, c) => H(x, c)),
    [D('1', 0), D('', 1), D('', 2), D('', 3), D('', 4)], [D('계', 0), D('', 1), D('', 2), D('', 3), D('', 4)]], 5, 4400));
  const [t] = await rowsOf(await fillCampForm('confirm', camp(), await handForm(T)));
  assert.deepEqual(t.slice(2, 5).map(r => r[0]), ['1', '2', '3']);
  assert.equal(t[2][3], '낱말 읽기');
  void f;
  const g = form([{ type: 'table', head: true, rows: [['', '일시', '시간', '', '', ''], ['', '', '', '', '', '']] }]);
  const [u] = await rowsOf(await fillCampForm('attend', camp(), g));
  assert.deepEqual(u[0].slice(3), ['김하늘', '이바다', '박구름']);
});

test('머리와 「계」 줄만 있는 표는 다른 표를 찾아보고 없으면 NO_MATCH, 계 줄·「총 ( )시간」이 없으면 지도 시간 알림, 「보조 지도교사」 줄은 그대로', async () => {
  await assert.rejects(fillCampForm('confirm', camp(), form([{ type: 'table', head: true, rows: [['순', '날짜', '시간', '지도 내용'], ['계', '', '', '']] }])), e => e.code === 'NO_MATCH');
  const out = await fillCampForm('confirm', camp(), form([{ type: 'p', text: '지도교사 :    (인)' }, { type: 'p', text: '보조 지도교사 :    (인)' },
    { type: 'table', head: true, rows: [['순', '날짜', '시간', '지도 내용'], ['', '', '', '']] }]));
  assert.ok(out.warn.join(' ').includes('총 3시간'), JSON.stringify(out.warn));
  const { texts } = await readTables(bytesOf(out));
  assert.ok(texts.includes('지도교사 : 한가람 (인)') && texts.includes('보조 지도교사 :    (인)'), JSON.stringify(texts));
});
