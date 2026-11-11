// 기초학력 캠프 문서 모양(스펙 2026-11-11): 수업 확인서(지도교사·결재란·순|날짜|시간|교과|지도 내용|확인(서명)·계 줄·안내),
// 출석부 교시형(수업 줄 × 학생, 날짜는 그날 첫 줄에만, 계 줄)·날짜형(학생 × 날짜, 계 칸), 관찰 기록부(5명씩 쪽), 결과 보고서,
// 넣은 양식(PDF·사진)의 모양(제목·칸 이름·안내)을 따르기, 한글·워드로 만들어짐
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCamp } from '../../web/menus/class/camp-model.js';
import {
  DOC_LABEL, docLabel, docTitle, confirmTable, attendTable, observePages, confirmDoc, attendDoc, observeDoc, reportDoc, campDoc, ATTEND_NOTE, CONFIRM_NOTE, mapColumns
} from '../../web/menus/class/camp-docs.js';
import { makeHwpx } from '../../web/core/hwpx.js';
import { makeDocx } from '../../web/core/doc-export.js';

const S = (id, date, start, end, subject, content) => ({ id, date, start, end, subject, content });
function camp(f = {}) {
  return newCamp({
    name: '3-(1) 교과캠프', teacher: '한가람', target: '3학년', subjects: ['국어', '수학'],
    students: [{ id: 'a', grade: 3, cls: 2, no: 5, name: '김하늘' }, { id: 'b', grade: 3, cls: 2, no: 11, name: '이바다' }],
    sessions: [S('s3', '2027-01-11', '09:00', '09:40', '국어', '받아쓰기'), S('s2', '2027-01-08', '09:45', '10:25', '수학', '두 자리 덧셈'), S('s1', '2027-01-08', '09:00', '09:40', '국어', '낱말 읽기')],
    att: { s1: { a: 'O', b: 'X' }, s2: { a: 'O', b: 'O' }, s3: { a: 'O' } },
    ...f
  });
}
const tables = d => d.blocks.filter(b => b.type === 'table');
const texts = d => d.blocks.filter(b => b.type !== 'table' && b.type !== 'break').map(b => b.text).join('\n');

test('문서 이름: 수업 확인서·출석부(교시형/날짜형)·관찰 기록부·결과 보고서, 제목에 캠프 이름', () => {
  assert.deepEqual(Object.keys(DOC_LABEL), ['confirm', 'attend', 'observe', 'report']);
  assert.equal(docLabel('attend', camp()), '학생 출석 및 관찰 기록부');
  assert.equal(docLabel('attend', camp({ unit: 'day' })), '학생 출석부');
  assert.equal(docTitle('confirm', camp()), '3-(1) 교과캠프 수업 확인서');
  assert.equal(docTitle('confirm', camp({ name: '' })), '수업 확인서');
});

test('수업 확인서: 지도교사, 결재란(고친 칸 이름), 표 머리·날짜는 그날 첫 줄에만, 확인(서명) 칸은 비움, 계 줄, 날인 안내', () => {
  const c = camp({ approval: ['담당', '교감', '교장'] });
  const t = confirmTable(c);
  assert.deepEqual(t.head, ['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)']);
  assert.deepEqual(t.rows, [
    ['1', '1. 8.(금)', '09:00~09:40', '국어', '낱말 읽기', ''],
    ['2', '', '09:45~10:25', '수학', '두 자리 덧셈', ''],
    ['3', '1. 11.(월)', '09:00~09:40', '국어', '받아쓰기', '']]);
  assert.deepEqual(t.footer, ['계', '지도 시간: 총 ( 3 )시간', '', '', '', '']);
  const d = confirmDoc(c);
  assert.equal(d.title, '3-(1) 교과캠프 수업 확인서');
  const [ap, main] = tables(d);
  assert.deepEqual(ap.rows, [['담당', '교감', '교장'], ['\n\n', '\n\n', '\n\n']], '결재란(도장 찍을 빈 줄)');
  assert.equal(main.head, true);
  assert.deepEqual(main.rows[0], t.head);
  assert.deepEqual(main.rows.at(-1), t.footer);
  assert.ok(main.rows.slice(1, -1).every(r => r[5] === ''), '확인(서명) 칸은 비움');
  assert.ok(texts(d).includes('지도교사: 한가람'), texts(d));
  assert.ok(texts(d).includes(CONFIRM_NOTE) && CONFIRM_NOTE === '※확인(서명)란은 지도 교사가 반드시 날인(사인)');
});

test('출석부 교시형: 수업 줄 × 학생(○·/·빈칸), 날짜는 그날 첫 줄에만, 계 줄은 학생별 출석 수, 안내 「※ 출석 : ○ , 결석 : /」', () => {
  const c = camp();
  const t = attendTable(c);
  assert.deepEqual(t.head, ['순', '일시', '시간', '김하늘', '이바다']);
  assert.deepEqual(t.rows, [['1', '1. 8.(금)', '09:00~09:40', '○', '/'], ['2', '', '09:45~10:25', '○', '○'], ['3', '1. 11.(월)', '09:00~09:40', '○', '']]);
  assert.deepEqual(t.footer, ['계', '', '', '3', '1']);
  const d = attendDoc(c);
  assert.equal(d.title, '3-(1) 교과캠프 학생 출석 및 관찰 기록부');
  assert.ok(texts(d).includes(ATTEND_NOTE) && ATTEND_NOTE === '※ 출석 : ○ , 결석 : /');
  assert.ok(texts(d).includes('지도교사: 한가람'));
  const main = tables(d)[0];
  assert.deepEqual(main.rows.at(-1), t.footer);
});

test('출석 및 관찰 기록부(교시형): 출석표 다음 쪽에 관찰 표(한 쪽 5명, 이름 줄 + 관찰 및 지도 결과 줄) — 견본처럼, 날짜형 출석부에는 없음', () => {
  const c = camp({ obs: { a: '받아쓰기에 자신감이 붙음.' } });
  const d = attendDoc(c);
  const i = d.blocks.findIndex(b => b.type === 'table');
  assert.equal(d.blocks[i + 1].type, 'break', '관찰은 새 쪽');
  const ob = tables(d)[1];
  assert.deepEqual(ob.rows, [['이름', '김하늘', '이바다', '', '', ''], ['관찰 및 지도 결과', '받아쓰기에 자신감이 붙음.', '', '', '', '']]);
  assert.equal(tables(attendDoc(camp({ unit: 'day' }))).length, 1);
});

test('칸 너비: 수업 확인서는 「지도 내용」이 가장 넓고 「순」이 가장 좁게, 출석부·관찰 표도 칸 수만큼 너비', () => {
  const m = tables(confirmDoc(camp())).at(-1);
  assert.equal(m.widths.length, 6);
  assert.equal(Math.max(...m.widths), m.widths[4], '지도 내용');
  assert.equal(Math.min(...m.widths), m.widths[0], '순');
  const a = tables(attendDoc(camp()));
  assert.ok(a.every(t => Array.isArray(t.widths) && t.widths.length === t.rows[0].length), JSON.stringify(a.map(t => t.widths)));
  const dd = tables(attendDoc(camp({ unit: 'day' })))[0];
  assert.equal(dd.widths.length, dd.rows[0].length);
  const o = tables(observeDoc(camp()))[0];
  assert.equal(o.widths.length, 6);
});

test('출석부 날짜형: 학생 × 날짜, 계 칸', () => {
  const c = camp({ unit: 'day', sessions: [S('d1', '2027-01-08', '09:00', '12:40', '국어·수학', ''), S('d2', '2027-01-11', '09:00', '12:40', '국어', '')],
    att: { d1: { a: 'O', b: 'X' }, d2: { a: 'O', b: 'O' } } });
  const t = attendTable(c);
  assert.deepEqual(t.head, ['순', '학년-반', '이름', '1/8', '1/11', '계']);
  assert.deepEqual(t.rows, [['1', '3-2', '김하늘', '○', '○', '2'], ['2', '3-2', '이바다', '/', '○', '1']]);
  assert.equal(t.footer, null);
  assert.equal(attendDoc(c).title, '3-(1) 교과캠프 학생 출석부');
});

test('관찰 기록부: 한 쪽에 5명까지(이름 줄 + 관찰 및 지도 결과 줄), 쪽 사이 나눔, 모자란 칸은 비움', () => {
  const students = Array.from({ length: 7 }, (_, i) => ({ id: 'k' + i, name: `학생${i + 1}` }));
  const obs = Object.fromEntries(students.map((s, i) => [s.id, `관찰 ${i + 1}`]));
  const c = camp({ students, obs });
  const pages = observePages(c);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 5); assert.equal(pages[1].length, 2);
  const d = observeDoc(c);
  const ts = tables(d);
  assert.equal(ts.length, 2);
  assert.deepEqual(ts[0].rows[0], ['이름', '학생1', '학생2', '학생3', '학생4', '학생5']);
  assert.deepEqual(ts[0].rows[1], ['관찰 및 지도 결과', '관찰 1', '관찰 2', '관찰 3', '관찰 4', '관찰 5']);
  assert.deepEqual(ts[1].rows[0], ['이름', '학생6', '학생7', '', '', '']);
  assert.equal(d.blocks.filter(b => b.type === 'break').length, 1);
  assert.equal(d.title, '3-(1) 교과캠프 관찰 기록부');
  assert.equal(observeDoc(camp({ students: [] })).blocks.filter(b => b.type === 'table').length, 0);
});

test('결과 보고서: 제목(없으면 캠프 이름 + 결과 보고서)과 섹션', () => {
  const c = camp({ report: { kind: 'select', title: '', sections: [{ head: '운영 목적', text: '기초학력 향상' }, { head: '운영 성과', text: '(학생A) 받아쓰기 80점' }] } });
  const d = reportDoc(c);
  assert.equal(d.title, '3-(1) 교과캠프 결과 보고서');
  assert.deepEqual(d.blocks.filter(b => b.type === 'h').map(b => b.text), ['1. 운영 목적', '2. 운영 성과']);
  assert.ok(texts(d).includes('(학생A) 받아쓰기 80점'));
  assert.equal(reportDoc(camp({ report: { title: '겨울 교과캠프 운영 보고', sections: [] } })).title, '겨울 교과캠프 운영 보고');
});

test('넣은 양식 모양 따르기: 제목·칸 이름·차례·안내 글(모르는 칸은 비움, 못 맞추면 기본 칸)', () => {
  const c = camp();
  const lay = { title: '3-(1) 느린학습자 지원 중점학급 교과캠프 수업 확인서', columns: ['연번', '일자', '교과', '시간', '지도 내용', '비고', '확인'], notes: ['※ 지도 교사 날인'] };
  const d = confirmDoc(c, lay);
  assert.equal(d.title, lay.title);
  const main = tables(d).at(-1);
  assert.deepEqual(main.rows[0], lay.columns);
  assert.deepEqual(main.rows[1], ['1', '1. 8.(금)', '국어', '09:00~09:40', '낱말 읽기', '', '']);
  assert.equal(main.rows.at(-1)[0], '계');
  assert.ok(main.rows.at(-1).includes('지도 시간: 총 ( 3 )시간'));
  assert.ok(texts(d).includes('※ 지도 교사 날인'));
  // 날짜·내용 칸을 못 찾으면 기본 칸(제목은 따름)
  const d2 = confirmDoc(c, { title: '확인서', columns: ['가', '나'] });
  assert.equal(d2.title, '확인서');
  assert.deepEqual(tables(d2).at(-1).rows[0], ['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)']);
  assert.deepEqual(mapColumns(['순', '일시(날짜)', '시간', '교과', '지도내용', '확인(서명)'], 'confirm'), ['seq', 'date', 'time', 'subject', 'content', 'sign']);
  // 출석부 교시형: 학생 칸(학생1·학생2 …)은 학생 수만큼
  const a = attendDoc(c, { title: '학생 출석 및 관찰 기록부', columns: ['순', '일시(날짜)', '시간', '학생1', '학생2', '학생3', '비고'] });
  assert.deepEqual(tables(a)[0].rows[0], ['순', '일시(날짜)', '시간', '김하늘', '이바다', '비고']);
  assert.ok(texts(a).includes('※ 출석 : ○ , 결석 : /'), '안내가 없으면 기본 안내');
  // 관찰 기록부: 줄 이름
  const o = observeDoc(c, { title: '관찰 기록부', columns: ['성명', '관찰 내용'] });
  assert.deepEqual(tables(o)[0].rows.map(r => r[0]), ['성명', '관찰 내용']);
  // 결과 보고서: 제목만 따르고 섹션은 그대로
  assert.equal(reportDoc(camp({ report: { sections: [{ head: '가', text: '나' }] } }), { title: '교과캠프 운영 결과 보고서' }).title, '교과캠프 운영 결과 보고서');
});

test('campDoc으로 넷 다 만들고, 한글·워드 파일이 만들어짐', () => {
  const c = camp({ report: { sections: [{ head: '운영 목적', text: '글' }] } });
  for (const id of ['confirm', 'attend', 'observe', 'report']) {
    const d = campDoc(id, c);
    assert.ok(d.title && Array.isArray(d.blocks), id);
    assert.ok(makeHwpx(d).length > 1000, id + ' hwpx');
    assert.ok(makeDocx(d).length > 1000, id + ' docx');
  }
  assert.throws(() => campDoc('nope', c));
});
