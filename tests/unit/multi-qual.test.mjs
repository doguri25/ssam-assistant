// 기타 › 다면평가 정성(스펙 2026-11-11): 정성 기준 표(평가사항·평가요소·평가지표) + 교사 자기실적평가서(기초 자료 칸 이름 — 값은 읽지 않음,
// 영역 가.~라.와 칸 ◦ 추진 목표…), 못 읽은 부분은 예시 서식, 내 정보·정량 값으로 기초 자료 채우기, 줄글을 낱말로 나누기(AI 없을 때), 입력 필요
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseQualText, DEFAULT_QUAL, defaultQual, normQualCriteria, quantFacts, prefillBasics, splitDraft, buildReport, refreshMissing, normReport, getAt, setAt, SELF_LEVELS, missingCount
} from '../../web/menus/etc/multi-qual.js';
import { parseQuantText, allItems } from '../../web/menus/etc/multi-quant.js';
import { QUAL_TEXT, QUANT_TEXT, SCHOOL, TEACHER } from './multi-fixtures.mjs';

const BASICS = ['담당 학년 및 학급', '담당 과목', '담임 여부', '담당 업무', '보직교사 여부', '주당 수업시간 수', '연간 수업공개 실적', '연간 학생 상담 실적', '연간 학부모 상담 실적', '그 밖의 실적사항'];

test('정성 기준 표: 평가사항(1. …)·평가요소(n점)·평가지표(1) 2) …), 줄로 나뉜 지표도', () => {
  const q = parseQualText(QUAL_TEXT);
  assert.deepEqual(q.criteria.map(c => [c.area, c.element, c.max, c.indicators.length]), [
    ['1. 근무수행태도', '교육공무원으로서의 태도', 10, 2], ['2. 근무실적 및 근무수행능력', '가. 학습지도', 40, 2], ['2. 근무실적 및 근무수행능력', '나. 생활지도', 30, 1],
    ['2. 근무실적 및 근무수행능력', '다. 전문성개발', 5, 1], ['2. 근무실적 및 근무수행능력', '라. 담당업무', 15, 1]]);
  assert.equal(q.criteria[0].indicators[1], '공직자로서 사명감과 직무에 관한 책임감을 갖고 솔선수범하는가?');
  assert.deepEqual(q.read, { criteria: true, basics: true, sections: true });
  // 한 칸에 「1) … 2) …」가 이어 붙은 꼴
  const one = parseQualText('구분 | 평가사항 | 평가요소 | 평가지표\n1. 근무수행태도 | 태도 (10점) | 1) 성실한가? 2) 책임감이 있는가?');
  assert.deepEqual(one.criteria[0].indicators, ['성실한가?', '책임감이 있는가?']);
});

test('자기실적평가서: 기초 자료는 칸 이름만(적힌 값은 남의 예시라 읽지 않음), 영역 4개·칸(◦ 추진 목표…), 평가 지침, 자기 평가 종합 4줄', () => {
  const q = parseQualText(QUAL_TEXT);
  assert.deepEqual(q.basics, BASICS);
  assert.deepEqual(q.sections, [
    { key: 'learn', name: '학습지도', parts: ['추진 목표', '추진 실적'] }, { key: 'life', name: '생활지도', parts: ['추진 목표', '추진 실적'] },
    { key: 'pro', name: '전문성개발', parts: ['추진 목표', '추진 실적'] }, { key: 'duty', name: '담당 업무', parts: ['추진 목표', '추진 실적', '창의적 업무개선 사항'] }]);
  assert.equal(q.guide, '근무성적평정의 신뢰성과 타당성이 보장되도록 객관적 근거에 따라 종합적으로 평가하여야 한다.');
  assert.deepEqual(q.self.map(s => s.name), ['목표달성도', '창의성', '적시성', '노력도']);
  assert.equal(q.self[0].desc, '설정한 목표에 대한 달성 정도');
  assert.equal(q.self[3].desc, '목표 달성을 위한 노력, 공헌도');
  const json = JSON.stringify(q);
  for (const s of [SCHOOL, TEACHER, '3-1', '생활안전부장', '22.8', '학생대회 지도 실적1', '초등교사']) assert.ok(!json.includes(s), `「${s}」가 남음`);
});

test('못 읽은 부분은 예시 서식(별지 꼴: 기초 자료 10칸·영역 4개·창의적 업무개선 사항·자기 평가 4줄)으로', () => {
  const d = defaultQual();
  assert.deepEqual(d.basics, BASICS);
  assert.equal(d.sections.length, 4); assert.ok(d.sections[3].parts.includes('창의적 업무개선 사항'));
  assert.equal(d.self.length, 4); assert.equal(d.criteria.reduce((s, c) => s + c.max, 0), 100);
  assert.ok(Object.isFrozen(DEFAULT_QUAL));
  const none = parseQualText('아무 글이에요');
  assert.deepEqual(none.read, { criteria: false, basics: false, sections: false });
  assert.deepEqual(none.basics, BASICS); assert.deepEqual(none.sections, d.sections);
  const half = parseQualText(QUAL_TEXT.split('▪교육공무원')[0]);
  assert.deepEqual(half.read, { criteria: true, basics: false, sections: false });
  assert.equal(half.criteria.length, 5); assert.deepEqual(half.basics, BASICS);
  assert.equal(normQualCriteria(null), null);
  assert.deepEqual(normQualCriteria(JSON.parse(JSON.stringify(parseQualText(QUAL_TEXT)))).sections, parseQualText(QUAL_TEXT).sections);
});

test('정량에서 아는 수: 주당 수업시수·수업 공개(횟수)·상담·연수 시간·업무 곤란도', () => {
  const c = parseQuantText(QUANT_TEXT), it = n => allItems(c).find(i => i.name === n).id;
  const values = { [it('주당 수업시수')]: { v: '22.8' }, [it('수업 컨설팅 횟수')]: { count: '2' }, [it('학생·학부모 상담 실적')]: { v: '12' }, [it('직무연수 이수')]: { v: '92' }, [it('업무 곤란도')]: { v: '1' } };
  const f = quantFacts(c, values);
  assert.deepEqual(f, { hours: '22.8', open: '2회', counsel: '12건', counselStudent: '', counselParent: '', training: '92시간', duty: '연구부장' });
  assert.deepEqual(quantFacts(c, {}), { hours: '', open: '', counsel: '', counselStudent: '', counselParent: '', training: '', duty: '' });
});

test('기초 자료는 내 정보·정량 값에서 먼저 채움, 빈 칸은 모두 입력 필요', () => {
  const q = parseQualText(QUAL_TEXT);
  const info = { gradeClass: '4-2', subject: '담임(전 과목)', homeroom: '담임', duty: '정보부장', head: '보직교사', name: TEACHER, school: SCHOOL };
  const b = prefillBasics(q, info, { hours: '23', open: '2회', counsel: '12건', counselStudent: '', counselParent: '' });
  assert.deepEqual(b, { '담당 학년 및 학급': '4-2', '담당 과목': '담임(전 과목)', '담임 여부': '담임', '담당 업무': '정보부장', '보직교사 여부': '보직교사', '주당 수업시간 수': '23',
    '연간 수업공개 실적': '2회', '연간 학생 상담 실적': '', '연간 학부모 상담 실적': '', '그 밖의 실적사항': '' });
  const r = buildReport({ parsed: q, info, facts: { hours: '23', open: '2회', counsel: '12건' }, draft: '' });
  const paths = r.missing.map(m => m.path);
  assert.ok(paths.includes('basics.연간 학생 상담 실적') && paths.includes('basics.그 밖의 실적사항') && !paths.includes('basics.담당 업무'), paths.join());
  assert.ok(paths.includes('sections.learn.추진 목표') && paths.includes('sections.duty.창의적 업무개선 사항'));
  assert.ok(paths.includes('self.목표달성도'));
  const counsel = r.missing.find(m => m.path === 'basics.연간 학생 상담 실적');
  assert.ok(counsel.hint.includes('12건'), '정량에 적은 상담 건수를 알려 줌: ' + counsel.hint);
  assert.ok(r.missing.every(m => m.label && m.hint), '칸 이름과 무엇을 적을지');
  assert.equal(missingCount(r), r.missing.length);
});

test('줄글 나누기(AI 없을 때): 문장마다 낱말로 영역, 목표·계획 말이면 추진 목표, 나머지 추진 실적, 개선은 창의적 업무개선', () => {
  const q = parseQualText(QUAL_TEXT);
  const draft = `올해는 학생 참여 중심 수업을 목표로 했어요. 코스웨어로 수학 기초 학습을 매주 했어요.
학생 상담을 25건 했고 학교폭력 예방 교육을 3회 운영했어요.
- 직무연수 90시간을 이수했어요
전문적 학습공동체에 참여함.
생활안전부 업무를 맡아 안전 점검 계획을 세웠어요. 출장 신청 절차를 새로 간소화했어요.
그리고 꾸준히 했어요.`;
  const s = splitDraft(draft, q);
  const get = (k, p) => s.find(x => x.key === k).parts.find(x => x.name === p).items;
  assert.deepEqual(get('learn', '추진 목표'), ['올해는 학생 참여 중심 수업을 목표로 했어요']);
  assert.deepEqual(get('learn', '추진 실적'), ['코스웨어로 수학 기초 학습을 매주 했어요']);
  assert.deepEqual(get('life', '추진 실적'), ['학생 상담을 25건 했고 학교폭력 예방 교육을 3회 운영했어요']);
  assert.deepEqual(get('pro', '추진 실적'), ['직무연수 90시간을 이수했어요', '전문적 학습공동체에 참여함']);
  assert.ok(get('duty', '창의적 업무개선 사항').includes('출장 신청 절차를 새로 간소화했어요'), JSON.stringify(s));
  assert.ok(get('duty', '추진 목표').concat(get('life', '추진 목표')).some(x => x.includes('안전 점검 계획')), '계획 → 추진 목표');
  assert.ok(get('duty', '창의적 업무개선 사항').includes('그리고 꾸준히 했어요') || get('duty', '추진 실적').includes('그리고 꾸준히 했어요'), '낱말이 없으면 앞 문장의 영역');
  assert.deepEqual(splitDraft('', q).map(x => x.parts.every(p => !p.items.length)), [true, true, true, true]);
  // 긴 낱말이 더 무거움: 학습공동체(전문성개발) > 수업(학습지도)
  const pro = splitDraft('전문적 학습공동체에서 수업 나눔을 3회 했어요.', q);
  assert.deepEqual(pro.find(x => x.key === 'pro').parts.find(p => p.name === '추진 실적').items, ['전문적 학습공동체에서 수업 나눔을 3회 했어요']);
});

test('입력 필요: 적으면 사라짐(refreshMissing), 칸 길(getAt·setAt), 자기 평가는 만족·보통·미흡만, AI 답 모양 맞추기(normReport)', () => {
  const q = parseQualText(QUAL_TEXT);
  let r = buildReport({ parsed: q, info: {}, facts: {}, draft: '수업 공개를 2회 했어요.' });
  const n0 = missingCount(r);
  setAt(r, 'basics.담당 과목', '영어'); setAt(r, 'self.창의성', '보통'); setAt(r, 'sections.life.추진 목표', ['상담 주간 운영']);
  r = refreshMissing(r, q);
  assert.equal(missingCount(r), n0 - 3);
  assert.equal(getAt(r, 'basics.담당 과목'), '영어');
  assert.deepEqual(getAt(r, 'sections.life.추진 목표'), ['상담 주간 운영']);
  assert.deepEqual(SELF_LEVELS, ['만족', '보통', '미흡']);
  const n = normReport({ basics: { '담당 과목': ' 과학 ', '없는 칸': 'x' }, sections: [{ key: 'learn', parts: [{ name: '추진 실적', items: ['- 실험 수업 12회', '', 3] }] }, { name: '담당 업무', parts: [{ name: '창의적 업무개선 사항', items: ['양식 줄임'] }] }],
    self: { 목표달성도: '아주 만족', 노력도: '만족' }, missing: [{ path: 'basics.담임 여부', hint: '담임인지 적어 주세요' }] }, q);
  assert.equal(n.basics['담당 과목'], '과학'); assert.ok(!('없는 칸' in n.basics));
  assert.deepEqual(getAt(n, 'sections.learn.추진 실적'), ['실험 수업 12회']);
  assert.deepEqual(getAt(n, 'sections.duty.창의적 업무개선 사항'), ['양식 줄임']);
  assert.equal(n.self.목표달성도, ''); assert.equal(n.self.노력도, '만족');
  assert.equal(n.missing.find(m => m.path === 'basics.담임 여부').hint, '담임인지 적어 주세요', 'AI가 준 안내는 남김');
  assert.equal(normReport(null, q).sections.length, 4);
});
