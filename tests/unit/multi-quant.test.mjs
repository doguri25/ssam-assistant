// 기타 › 다면평가 정량(스펙 2026-11-11): 학교 기준 글(readText 모양) → 기준(묶음·항목·지표·range/choice/count/short/deduct, 작성 예시는 버림),
// 점수 계산(경계값 22·20·90·75~89, 근무 6개월 이하, 횟수 최대, 감점, 빈 값), 묶음 소계(최대를 넘지 않음)·총점, 예시 기준
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQuantText, DEFAULT_QUANT, defaultQuant, parseTier, deriveItem, tierOf, itemScore, groupScore, totalScore, allItems, fmtPts, normCriteria
} from '../../web/menus/etc/multi-quant.js';
import { QUANT_TEXT, QUANT_FLAT, SCHOOL, TEACHER } from './multi-fixtures.mjs';

const item = (c, name) => allItems(c).find(i => i.name === name);
const labels = it => it.tiers.map(t => t.label);
const pts = it => it.tiers.map(t => t.points);

test('정량 기준 읽기: 제목·평가 기간(학교 이름은 뺌)·총점·묶음 4개·항목 11개', () => {
  const c = parseQuantText(QUANT_TEXT);
  assert.ok(c, '읽음');
  assert.equal(c.title, '2025학년도 교사 다면평가 기준(정량평가)');
  assert.equal(c.period, '2025. 3. 1. ~ 2026. 2. 28.');
  assert.equal(c.total, 100);
  assert.deepEqual(c.groups.map(g => [g.name, g.max]), [['가. 학습지도', 30], ['나. 생활지도', 30], ['다. 전문성계발', 10], ['라. 담당업무', 30]]);
  assert.deepEqual(c.groups.map(g => g.items.length), [3, 3, 2, 3]);
  assert.deepEqual(allItems(c).map(i => i.name), ['주당 수업시수', '수업 공개 횟수', '수업 컨설팅 횟수', '학생·학부모 상담 실적', '생활지도 곤란도 [통합학급 유무]', '학년 곤란도',
    '직무연수 이수', '학교 안밖 전문적학습공동체 참여 실적', '업무 곤란도', '학교 공헌도', '학생 지도 실적 교육 활동 실적']);
  assert.deepEqual(allItems(c).map(i => i.max), [25, 3, 2, 15, 5, 10, 7, 3, 25, 3, 2]);
  const ids = allItems(c).map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, '항목 id는 겹치지 않음');
  const json = JSON.stringify(c);
  assert.ok(!json.includes(SCHOOL) && !json.includes(TEACHER), '학교·사람 이름은 기준에 남지 않음');
  assert.ok(!json.includes('9959') && !json.includes('7777') && !json.includes('( 90 )'), '작성 예시는 버림');
});

test('지표: range(범위·단위)·choice(고르기)·count(회당 n점, 최대)·short(6개월 이하 n점)·감점·증빙 안내', () => {
  const c = parseQuantText(QUANT_TEXT);
  const h = item(c, '주당 수업시수');
  assert.equal(h.kind, 'range'); assert.equal(h.unit, '시간');
  assert.deepEqual(h.tiers.map(({ label, min, minInc, max, maxInc, points, short }) => ({ label, min, minInc, max, maxInc, points, short })), [
    { label: '22시간 이상', min: 22, minInc: true, max: null, maxInc: false, points: 25, short: null },
    { label: '20시간 이상 ~ 22시간 미만', min: 20, minInc: true, max: 22, maxInc: false, points: 24, short: null },
    { label: '20시간 미만', min: null, minInc: false, max: 20, maxInc: false, points: 23, short: null }]);
  assert.ok(h.guide.startsWith('담임(학교 교육과정 운영계획)') && h.guide.includes('월 0.2씩 감점'), h.guide);
  assert.deepEqual(h.deduct, { per: 0.2, unit: '개월', label: '수업일 휴직 기간' });

  const open = item(c, '수업 공개 횟수');
  assert.equal(open.kind, 'choice');
  assert.deepEqual(labels(open), ['동료장학 수업 유', '동료장학 수업 무']); assert.deepEqual(pts(open), [3, 2]);
  assert.equal(open.guide, '공문 기안(해당 일자 장학 수업) 수업만 인정');
  assert.equal(open.deduct, null);

  const cons = item(c, '수업 컨설팅 횟수');
  assert.equal(cons.kind, 'count'); assert.equal(cons.per, 1); assert.equal(cons.unit, '회');
  assert.deepEqual(labels(cons), ['자발적 수업 공개 (컨설팅 의뢰, 회당 1점)']); assert.equal(cons.tiers[0].points, 2);

  const talk = item(c, '학생·학부모 상담 실적');
  assert.equal(talk.kind, 'range'); assert.equal(talk.unit, '건'); assert.equal(talk.guide, '나이스 출력(상담기록)');

  const life = item(c, '생활지도 곤란도 [통합학급 유무]');
  assert.equal(life.kind, 'choice');
  assert.deepEqual(pts(life), [5, 4]); assert.deepEqual(life.tiers.map(t => t.short), [4.5, 3.5]);
  assert.ok(life.guide.includes('개별화교육지원팀 운영 계획') && life.guide.includes('업무분장 공문'), '이어진 줄의 증빙 안내도: ' + life.guide);
  assert.deepEqual(item(c, '학년 곤란도').tiers.map(t => t.short), [9.5, 8.5, null]);

  const tr = item(c, '직무연수 이수');
  assert.equal(tr.kind, 'range');
  assert.deepEqual(tr.tiers.map(t => [t.min, t.minInc, t.max, t.maxInc, t.points]), [[90, true, null, false, 7], [75, true, 89, true, 6], [60, true, 74, true, 5], [null, false, 60, false, 4]]);

  assert.deepEqual(item(c, '업무 곤란도').tiers.map(t => [t.points, t.short]), [[25, null], [23, null], [18, null], [9, 8]]);
  const con = item(c, '학교 공헌도');
  assert.equal(con.kind, 'count'); assert.equal(con.per, 1); assert.equal(con.tiers[0].points, 3);
  const award = item(c, '학생 지도 실적 교육 활동 실적');
  assert.equal(award.kind, 'choice');
  assert.deepEqual(labels(award), ['학생 교육감 이상 수상 / 학교 표창 교육감 이상', '학생 교육장상 수상 / 학교 표창 교육장상 수상'], '• 두 개가 든 칸은 지표 하나');
});

test('안내·끝 줄: ※ 안내 2줄, 다짐 글, 「… 귀하」(학교 이름은 뺌), 확인 칸 1차·2차·최종', () => {
  const c = parseQuantText(QUANT_TEXT);
  assert.equal(c.notes.length, 2);
  assert.ok(c.notes[0].startsWith('※ 동점자 처리 기준') && c.notes[1].startsWith('※ 각종 증빙자료'));
  assert.deepEqual(c.footer, { pledge: '상기 내용이 틀림없음을 확인하여 제출합니다.', to: '다면평가관리위원장 귀하', checks: ['1차', '2차', '최종'] });
});

test('칸을 모두 가진 꼴·• 없는 지표도 읽음, 못 읽는 글은 null(묶음 1개·항목 2개 미만)', () => {
  const c = parseQuantText(QUANT_FLAT);
  assert.ok(c);
  assert.deepEqual(c.groups.map(g => [g.name, g.max, g.items.map(i => i.name)]), [['가. 학습지도', 30, ['주당 수업시수', '수업 공개']], ['나. 담당업무', 20, ['업무 곤란도']]]);
  assert.deepEqual(labels(item(c, '주당 수업시수')), ['22시간 이상', '20시간 미만']);
  assert.equal(item(c, '수업 공개').kind, 'choice');
  assert.equal(item(c, '주당 수업시수').guide, '학교 교육과정');
  assert.equal(c.total, 50);
  assert.equal(parseQuantText('안녕하세요\n가정통신문입니다'), null);
  assert.equal(parseQuantText(''), null);
  assert.equal(parseQuantText('가. 학습지도 (30점) | 주당 수업시수 (25점) | •22시간 이상 | 25점'), null, '항목 1개');
});

test('지표 글 읽기(parseTier): 이상·미만·이하·초과·n～m·n~m·건·회당·6개월 이하', () => {
  assert.deepEqual(pick(parseTier('10건 이상', 15)), { min: 10, minInc: true, max: null, maxInc: false, points: 15, short: null, unit: '건' });
  assert.deepEqual(pick(parseTier('3회 이하', 2)), { min: null, minInc: false, max: 3, maxInc: true, points: 2, short: null, unit: '회' });
  assert.deepEqual(pick(parseTier('5 초과', 1)), { min: 5, minInc: false, max: null, maxInc: false, points: 1, short: null, unit: '' });
  assert.deepEqual(pick(parseTier('60~74', 5)), { min: 60, minInc: true, max: 74, maxInc: true, points: 5, short: null, unit: '' });
  assert.deepEqual(pick(parseTier('통합학급 무 (6개월 이하 3.5점)', 4)), { min: null, minInc: false, max: null, maxInc: false, points: 4, short: 3.5, unit: '' });
  assert.equal(parseTier('업무 추진 주무자 (회당 1점)', 3).per, 1);
  assert.equal(parseTier('1학년, 6학년', 10).min, null, '숫자만 있으면 범위가 아님');
});
const pick = t => ({ min: t.min, minInc: t.minInc, max: t.max, maxInc: t.maxInc, points: t.points, short: t.short, unit: t.unit });

test('점수: range 경계값(22·20·90·75~89·소수), choice·short, count 최대, 감점(0 아래로 안 내려감), 빈 값은 빈칸(null)', () => {
  const c = parseQuantText(QUANT_TEXT);
  const h = item(c, '주당 수업시수'), tr = item(c, '직무연수 이수'), talk = item(c, '학생·학부모 상담 실적');
  assert.equal(tierOf(h, 22).index, 0); assert.equal(tierOf(h, '21.9').index, 1); assert.equal(tierOf(h, 20).index, 1); assert.equal(tierOf(h, 19.9).index, 2);
  assert.equal(tierOf(h, ''), null); assert.equal(tierOf(h, '많이'), null);
  const s = (it, e, short = false) => itemScore(it, e, short);
  assert.equal(s(h, { v: '22.8' }), 25); assert.equal(s(h, { v: '21' }), 24); assert.equal(s(h, { v: '19' }), 23);
  assert.equal(s(tr, { v: '90' }), 7); assert.equal(s(tr, { v: '89' }), 6); assert.equal(s(tr, { v: '75' }), 6); assert.equal(s(tr, { v: '74' }), 5); assert.equal(s(tr, { v: '89.5' }), 6, '89와 90 사이는 아래 지표');
  assert.equal(s(tr, { v: '12' }), 4);
  assert.equal(s(talk, { v: '10' }), 15); assert.equal(s(talk, { v: '9' }), 14);
  // 고르기: v는 지표 차례, 근무 6개월 이하면 short 점수(없으면 그대로)
  const life = item(c, '생활지도 곤란도 [통합학급 유무]'), grade = item(c, '학년 곤란도');
  assert.equal(tierOf(life, '1').index, 1);
  assert.equal(s(life, { v: '0' }), 5); assert.equal(s(life, { v: '0' }, true), 4.5); assert.equal(s(life, { v: '1' }, true), 3.5);
  assert.equal(s(grade, { v: '2' }, true), 8, 'short 점수가 없는 지표');
  assert.equal(s(life, { v: '' }), null); assert.equal(s(life, { v: '7' }), null);
  // 횟수: min(횟수 × 회당, 최대)
  const cons = item(c, '수업 컨설팅 횟수');
  assert.equal(s(cons, { count: '1' }), 1); assert.equal(s(cons, { count: '5' }), 2); assert.equal(s(cons, { count: '0' }), 0); assert.equal(s(cons, { count: '' }), null);
  // 감점: 월 0.2씩
  assert.equal(s(h, { v: '22.8', deduct: '3' }), 24.4);
  assert.equal(s(h, { v: '19', deduct: '200' }), 0);
  assert.equal(s(h, { v: '', deduct: '2' }), null, '값이 없으면 감점만으로 점수를 만들지 않음');
  assert.equal(s(h, undefined), null);
});

test('묶음 소계(최대를 넘지 않음)·총점, 아무것도 안 넣으면 빈칸', () => {
  const c = parseQuantText(QUANT_TEXT);
  const v = {};
  const put = (name, e) => { v[item(c, name).id] = e; };
  assert.equal(totalScore(c, v), null);
  put('주당 수업시수', { v: '22.8' }); put('수업 공개 횟수', { v: '0' }); put('수업 컨설팅 횟수', { count: '1' });
  assert.equal(groupScore(c.groups[0], v), 29);
  assert.equal(groupScore(c.groups[1], v), null);
  put('학생·학부모 상담 실적', { v: '12' }); put('생활지도 곤란도 [통합학급 유무]', { v: '0' }); put('학년 곤란도', { v: '1' });
  assert.equal(groupScore(c.groups[1], v), 29); assert.equal(groupScore(c.groups[1], v, true), 28, '15 + 4.5 + 8.5');
  assert.equal(totalScore(c, v), 58);
  // 묶음 최대를 넘으면 최대까지
  const g = { name: '가. 시험', max: 3, items: [{ ...item(c, '수업 공개 횟수') }, { ...item(c, '수업 컨설팅 횟수') }] };
  assert.equal(groupScore(g, v), 3, '3 + 1 → 최대 3');
  assert.equal(fmtPts(24.4), '24.4'); assert.equal(fmtPts(25), '25'); assert.equal(fmtPts(0.1 + 0.2), '0.3'); assert.equal(fmtPts(null), '');
});

test('예시 기준: 학교 이름 없음, 묶음 4·항목 11, 제목 「— 예시」, 부를 때마다 새것', () => {
  const d = defaultQuant();
  assert.equal(d.title, '교사 다면평가 기준(정량평가) — 예시');
  assert.equal(d.groups.length, 4); assert.equal(allItems(d).length, 11); assert.equal(d.total, 100);
  assert.ok(!JSON.stringify(d).includes(SCHOOL) && !/학교\s*다면평가관리위원장|초등학교/.test(JSON.stringify(d)));
  assert.deepEqual(DEFAULT_QUANT, defaultQuant());
  d.groups[0].items[0].name = '바꿈';
  assert.notEqual(defaultQuant().groups[0].items[0].name, '바꿈');
  assert.ok(Object.isFrozen(DEFAULT_QUANT));
});

test('항목을 고치면 지표 글에서 다시 읽음(deriveItem), 망가진 기준은 정리(normCriteria)', () => {
  const it = deriveItem({ id: 'x', name: '연수', max: 7, guide: '※ 결근은 월 0.5씩 감점', tiers: [{ label: '30시간 이상', points: 7 }, { label: '30시간 미만', points: 3 }] });
  assert.equal(it.kind, 'range'); assert.equal(it.unit, '시간'); assert.equal(it.tiers[0].min, 30);
  assert.deepEqual(it.deduct, { per: 0.5, unit: '개월', label: '결근' });
  const it2 = deriveItem({ ...it, tiers: [{ label: '있음', points: 7 }, { label: '없음', points: 0 }] });
  assert.equal(it2.kind, 'choice');
  const n = normCriteria({ title: 3, groups: [{ name: '가. 시험', items: [{ name: '항목', tiers: [{ label: '유', points: '2점' }, 'x'] }, 'bad'] }, null] });
  assert.equal(n.groups.length, 1); assert.equal(n.groups[0].items.length, 1);
  assert.deepEqual(n.groups[0].items[0].tiers.map(t => [t.label, t.points]), [['유', 2]]);
  assert.equal(n.groups[0].max, 2, '묶음 최대가 없으면 항목 최대의 합');
  assert.equal(n.groups[0].items[0].max, 2, '항목 최대가 없으면 가장 큰 지표 점수');
  assert.ok(n.groups[0].id && n.groups[0].items[0].id);
  assert.equal(normCriteria(null), null); assert.equal(normCriteria({ groups: [] }), null);
});
