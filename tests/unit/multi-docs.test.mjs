// 기타 › 다면평가 문서(스펙 2026-11-11) — 양식 모양대로 새 파일: 정량(제목·평가 기간·표 평가요소|평가지표|배점|확인(○)|점수|소계|비고, 지표마다 한 줄,
// 항목 이름·점수·비고는 첫 줄에만·소계는 묶음 첫 줄에만, 고른 지표 ○, count는 n회, 총 계 줄, 안내·다짐·날짜·작성자·귀하·확인 표),
// 정성(교사 자기실적평가서 1~5·자기 평가 종합 ○·작성일·서명·확인자), 한글·워드로 만들어짐
import test from 'node:test';
import assert from 'node:assert/strict';
import { quantDoc, qualDoc, quantTitle, QUANT_HEAD, QUAL_TITLE } from '../../web/menus/etc/multi-docs.js';
import { normMulti } from '../../web/menus/etc/multi-model.js';
import { parseQuantText, allItems } from '../../web/menus/etc/multi-quant.js';
import { parseQualText, buildReport, setAt } from '../../web/menus/etc/multi-qual.js';
import { makeHwpx } from '../../web/core/hwpx.js';
import { makeDocx } from '../../web/core/doc-export.js';
import { unzip } from '../../web/core/zip.js';
import { QUANT_TEXT, QUAL_TEXT, SCHOOL, TEACHER } from './multi-fixtures.mjs';

const OPT = { year: 2025, today: '2026-11-11' };
const tables = d => d.blocks.filter(b => b.type === 'table');
const texts = d => d.blocks.filter(b => b.type !== 'table' && b.type !== 'break').map(b => b.text).join('\n');
function quantState() {
  const m = normMulti({ info: { school: SCHOOL, name: TEACHER, position: '교사' } });
  m.quant.criteria = parseQuantText(QUANT_TEXT);
  const id = n => allItems(m.quant.criteria).find(i => i.name === n).id;
  m.quant.values = { [id('주당 수업시수')]: { v: '22.8', count: '', deduct: '2' }, [id('수업 공개 횟수')]: { v: '0', count: '', deduct: '' }, [id('수업 컨설팅 횟수')]: { v: '', count: '1', deduct: '' },
    [id('학생·학부모 상담 실적')]: { v: '9', count: '', deduct: '' } };
  m.quant.notes = { [id('주당 수업시수')]: '• 학교 교육과정(수정) [9959, 2025.07.22.]' };
  return m;
}

test('정량 문서: 제목(기준 제목)·평가 기간·표 머리 7칸·칸 너비', () => {
  const d = quantDoc(quantState(), OPT);
  assert.equal(d.title, '2025학년도 교사 다면평가 기준(정량평가)');
  assert.ok(texts(d).includes('평가 기간 : 2025. 3. 1. ~ 2026. 2. 28.'));
  const t = tables(d)[0];
  assert.equal(t.head, true);
  assert.deepEqual(t.rows[0], QUANT_HEAD);
  assert.deepEqual(QUANT_HEAD, ['평가요소', '평가지표', '배점', '확인(○)', '점수', '소계', '비고(실적 증빙자료)']);
  assert.equal(t.widths.length, 7);
  assert.equal(Math.max(...t.widths), t.widths[1], '평가지표가 가장 넓음');
  assert.equal(quantTitle(normMulti(null), 2026), '2026학년도 교사 다면평가 기준(정량평가)', '예시 기준: 「— 예시」 빼고 학년도');
});

test('정량 문서 표: 지표마다 한 줄, 항목 이름·점수·비고는 첫 줄, 소계는 묶음 첫 줄, 고른 지표 ○, 횟수는 n회, 감점 줄, 총 계', () => {
  const rows = tables(quantDoc(quantState(), OPT))[0].rows;
  assert.deepEqual(rows[1], ['가. 학습지도 (30점)\n주당 수업시수 (25점)', '•22시간 이상', '25점', '○', '24.6', '28.6', '• 학교 교육과정(수정) [9959, 2025.07.22.]\n※ 수업일 휴직 기간 2개월 감점(−0.4점)']);
  assert.deepEqual(rows[2], ['', '•20시간 이상 ~ 22시간 미만', '24점', '', '', '', '']);
  assert.deepEqual(rows[4], ['수업 공개 횟수 (3점)', '•동료장학 수업 유', '3점', '○', '3', '', '']);
  assert.deepEqual(rows[5].slice(0, 4), ['', '•동료장학 수업 무', '2점', '']);
  assert.deepEqual(rows[6], ['수업 컨설팅 횟수 (2점)', '•자발적 수업 공개 (컨설팅 의뢰, 회당 1점)', '2점', '1회', '1', '', '']);
  assert.deepEqual(rows[7].slice(0, 6), ['나. 생활지도 (30점)\n학생·학부모 상담 실적 (15점)', '•10건 이상', '15점', '', '14', '14'], '점수는 고른 지표가 아니어도 항목 첫 줄');
  assert.deepEqual(rows[8].slice(1, 5), ['•10건 미만', '14점', '○', '']);
  const life = rows.findIndex(r => r[0].startsWith('생활지도 곤란도'));
  assert.deepEqual(rows[life].slice(3, 6), ['', '', ''], '값이 없는 항목은 빈칸');
  assert.equal(rows.length, 1 + 26 + 1, '머리 + 지표 26줄 + 총 계');
  assert.deepEqual(rows.at(-1), ['총 계', '', '100점', '', '( 42.6 )점', '', '']);
  const empty = normMulti(null);
  assert.deepEqual(tables(quantDoc(empty, OPT))[0].rows.at(-1), ['총 계', '', '100점', '', '(     )점', '', ''], '아무것도 안 넣으면 빈 괄호');
});

test('정량 문서 끝: ※ 안내·다짐·날짜·작성자 직위 성명·학교 귀하·확인 표(1차·2차·최종)', () => {
  const d = quantDoc(quantState(), OPT);
  const tx = texts(d);
  for (const s of ['※ 동점자 처리 기준', '상기 내용이 틀림없음을 확인하여 제출합니다.', '2026년 11월 11일', '작성자 : 교사 한가람 (서명)', '새싹초등학교 다면평가관리위원장 귀하']) assert.ok(tx.includes(s), s);
  assert.deepEqual(tables(d)[1].rows[0], ['확인', '1차', '2차', '최종']);
  const blank = texts(quantDoc(normMulti(null), OPT));
  assert.ok(blank.includes('작성자 : 교사') && blank.includes('(서명)') && blank.includes('다면평가관리위원장 귀하'), blank);
});

test('정성 문서: 교사 자기실적평가서 1~5, 기초 자료 값, 영역 ◦ 칸과 - 줄, 자기 평가 종합 ○, 작성일·서명·확인자', () => {
  const m = normMulti({ info: { school: SCHOOL, name: TEACHER, position: '교사', from: '2025-03-01', to: '2026-02-28' } });
  const parsed = parseQualText(QUAL_TEXT);
  m.qual.criteria = parsed;
  const r = buildReport({ parsed, info: { gradeClass: '3-1', duty: '정보부장' }, facts: { hours: '22' }, draft: '코스웨어로 수학 수업을 매주 했어요. 출장 신청 절차를 간소화했어요.' });
  setAt(r, 'self.목표달성도', '만족'); setAt(r, 'self.노력도', '보통');
  m.qual.report = r;
  const d = qualDoc(m, OPT);
  assert.equal(d.title, QUAL_TITLE); assert.equal(QUAL_TITLE, '교사 자기실적평가서');
  const tx = texts(d);
  for (const s of ['1. 평가 지침', '근무성적평정의 신뢰성과 타당성', '2. 평가 기간', '2025년 3월 1일부터 2026년 2월 28일까지', '3. 평가자 인적사항', '4. 평가자 기초 자료', '5. 자기실적 평가',
    '가. 학습지도', '◦ 학습지도 추진 실적', '- 코스웨어로 수학 수업을 매주 했어요', '라. 담당 업무', '◦ 창의적 업무개선 사항', '- 출장 신청 절차를 간소화했어요', '※ 자기 평가 종합 상황(해당란에 ○표)',
    '2026년 11월 11일', '작성자(본인) 성명 한가람 서명(인)', '◇ 확인자(직근상급자) :']) assert.ok(tx.includes(s), `「${s}」 없음`);
  const [who, basics, self] = tables(d);
  assert.deepEqual(who.rows, [['소속', '직위', '성명'], [SCHOOL, '교사', TEACHER]]);
  assert.deepEqual(basics.rows.slice(0, 2), [['담당 학년 및 학급', '3-1'], ['담당 과목', '']]);
  assert.equal(basics.rows.length, 10);
  assert.deepEqual(self.rows[0], ['구분', '평가 내용', '만족', '보통', '미흡']);
  assert.deepEqual(self.rows[1], ['목표달성도', '설정한 목표에 대한 달성 정도', '○', '', '']);
  assert.deepEqual(self.rows[4].slice(2), ['', '○', '']);
  assert.deepEqual(self.rows[2].slice(2), ['', '', ''], '안 고르면 빈칸');
  const none = qualDoc(normMulti(null), OPT);
  assert.ok(texts(none).includes('◦ 학습지도 추진 목표'), '보고서가 없어도 빈 서식');
});

test('한글·워드로 만들어짐(표·글이 들어감)', async () => {
  for (const d of [quantDoc(quantState(), OPT), qualDoc(normMulti({ info: { name: TEACHER } }), OPT)]) {
    const h = await unzip(makeHwpx(d));
    const sec = [...h.entries()].filter(([k]) => /section\d*\.xml$/.test(k)).map(([, v]) => new TextDecoder().decode(v)).join('');
    assert.ok(sec.includes(d.title), 'hwpx 제목');
    const x = new TextDecoder().decode((await unzip(makeDocx(d))).get('word/document.xml'));
    assert.ok(x.includes(d.title) && x.includes('<w:tbl>'), 'docx 표');
  }
});
