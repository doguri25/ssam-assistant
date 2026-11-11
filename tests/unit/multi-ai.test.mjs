// 기타 › 다면평가 AI(스펙 2026-11-11): 기준 양식 읽기·근거자료 제목 읽기 = plan, 줄글 나누기 = writing.
// AI로 가는 글에는 선생님 이름·학교 이름이 없고 사람 이름 모양은 가림(maskPersons), 정량 기준은 작성 예시를 빼고 보냄, AI 답 정리
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskFor, cutExample, quantPrompt, normQuant, evidencePrompt, normEvidence, qualPrompt, normQualAI, qualFormPrompt, normQualForm, QUANT_TAG, EVIDENCE_TAG, QUAL_TAG, QUAL_FORM_TAG } from '../../web/menus/etc/multi-ai.js';
import { parseQuantText, defaultQuant, allItems } from '../../web/menus/etc/multi-quant.js';
import { parseQualText, defaultQual, mergeReport, buildReport, getAt } from '../../web/menus/etc/multi-qual.js';
import { QUANT_TEXT, QUAL_TEXT, SCHOOL, TEACHER } from './multi-fixtures.mjs';

const INFO = { school: SCHOOL, name: TEACHER, gradeClass: '3-1', duty: '생활안전부장', position: '교사' };
const NAMES = [SCHOOL, TEACHER, '박지훈', '이서연', '010-1234-5678'];
const clean = (s, what) => { for (const n of NAMES) assert.ok(!s.includes(n), `${what}에 「${n}」: ${s.slice(0, 300)}`); };

test('가리기: 학교 이름(내 정보·○○초등학교 꼴·【 】)·선생님 이름·사람 이름 모양·전화번호', () => {
  const s = maskFor(`【새싹초등학교】 평가 기간\n새싹초등학교 교사 한가람이 박지훈 학생, 이서연 학생과 상담함. 문의 010-1234-5678\n방과후학교 운영`, INFO);
  clean(s, '가린 글');
  assert.ok(s.includes('방과후학교 운영') && s.includes('상담함'), '학교 이름이 아닌 낱말은 그대로: ' + s);
  assert.ok(!maskFor('다른초등학교 교사', {}).includes('다른초등학교'), '내 정보가 없어도 ○○초등학교 꼴은 가림');
});

test('정량 기준 읽기 프롬프트: 첫 표만(작성 예시 뺌), 이름·학교 없음, 같은 모양 JSON', () => {
  assert.ok(!cutExample(QUANT_TEXT).includes('9959'));
  assert.ok(cutExample(QUANT_TEXT).includes('확인 | 1차 | 2차 | 최종'));
  const p = quantPrompt(QUANT_TEXT, INFO);
  assert.ok(p.startsWith(QUANT_TAG));
  clean(p, '정량 프롬프트');
  assert.ok(p.includes('주당 수업시수') && p.includes('"groups"') && p.includes('"tiers"') && !p.includes('9959'), p.slice(0, 200));
});

test('정량 AI 답 정리: 기준 모양(항목 2개 이상), 못 쓰면 null, 지표 글로 kind 다시 읽음', () => {
  const v = { title: '교사 다면평가 기준(정량평가)', groups: [{ name: '가. 학습지도', max: 30, items: [
    { name: '주당 수업시수', max: 25, tiers: [{ label: '22시간 이상', points: 25 }, { label: '22시간 미만', points: 23 }], guide: '※ 휴직은 월 0.2씩 감점' },
    { name: '수업 공개', max: 5, tiers: [{ label: '유', points: '5점' }, { label: '무', points: 3 }] }] }] };
  const c = normQuant(v);
  assert.equal(allItems(c).length, 2);
  assert.equal(allItems(c)[0].kind, 'range'); assert.equal(allItems(c)[0].deduct.per, 0.2); assert.equal(allItems(c)[1].kind, 'choice');
  assert.equal(c.total, 30);
  assert.equal(normQuant({ groups: [{ name: '가', items: [v.groups[0].items[0]] }] }), null, '항목 1개');
  assert.equal(normQuant('x'), null);
  assert.equal(normQuant({ ...v, title: '' }).title, '교사 다면평가 기준(정량평가)', '제목이 없으면 기본 제목');
});

test('근거자료 제목 읽기 프롬프트(가린 글·사진 수)와 답 정리(번호·날짜 꼴)', () => {
  const p = evidencePrompt({ text: '새싹초등학교\n제목 연수 이수 확인\n교장 한가람\n시행 새싹초등학교-12 (2025. 8. 1.) 박지훈 010-1234-5678', nImages: 0, item: '직무연수 이수' }, INFO);
  assert.ok(p.startsWith(EVIDENCE_TAG)); clean(p, '근거자료 프롬프트');
  assert.ok(p.includes('직무연수 이수') && p.includes('"title"') && p.includes('"no"') && p.includes('"date"'));
  assert.ok(evidencePrompt({ text: '', nImages: 2, item: '수업 공개' }, INFO).includes('그림 2장'));
  assert.deepEqual(normEvidence({ title: ' 연수 이수 확인 ', no: '제12호', date: '2025-8-1' }), { title: '연수 이수 확인', no: '12', date: '2025.08.01.' });
  assert.deepEqual(normEvidence({ title: 3, no: '새싹초등학교-9959', date: '모름' }), { title: '', no: '9959', date: '' });
  assert.deepEqual(normEvidence(null), { title: '', no: '', date: '' });
});

test('정성 프롬프트: 지표·영역·칸·기초 자료(앱이 아는 값)·정량 수·가린 줄글, 선생님·학교·학생 이름 없음', () => {
  const parsed = parseQualText(QUAL_TEXT);
  const draft = '새싹초등학교 3학년 담임 한가람이에요. 박지훈 학생과 이서연 학생을 상담했어요. 코스웨어로 수학 수업을 했어요. 학부모 문의 010-1234-5678';
  const p = qualPrompt({ parsed, draft, facts: { hours: '22.8', open: '2회', counsel: '12건', training: '92시간', duty: '연구부장' }, basics: { '담당 학년 및 학급': '3-1', '담당 업무': '생활안전부장' } }, INFO);
  assert.ok(p.startsWith(QUAL_TAG)); clean(p, '정성 프롬프트');
  for (const s of ['교육자로서 품성을 갖추고', '추진 목표', '창의적 업무개선 사항', '담당 학년 및 학급: 3-1', '22.8', '12건', '92시간', '코스웨어로 수학 수업', '"missing"', '지어내지'])
    assert.ok(p.includes(s), `${s} 없음`);
});

test('정성 AI 답 → 보고서: 앱이 아는 기초 자료가 앞섬, 모르는 칸은 입력 필요(AI 안내 남김), 고친 칸은 두거나 덮기(mergeReport)', () => {
  const parsed = parseQualText(QUAL_TEXT);
  const v = { basics: { '담당 학년 및 학급': '6-3', '연간 학생 상담 실적': '25건' }, sections: [{ key: 'learn', parts: [{ name: '추진 실적', items: ['- 코스웨어 활용 수학 수업 주 2회'] }] }],
    missing: [{ path: 'sections.learn.추진 목표', hint: '올해 학습지도 목표를 적어 주세요' }] };
  const r = normQualAI(v, parsed, { prefill: { '담당 학년 및 학급': '3-1' } });
  assert.equal(r.basics['담당 학년 및 학급'], '3-1', '내 정보가 앞섬');
  assert.equal(r.basics['연간 학생 상담 실적'], '25건');
  assert.deepEqual(getAt(r, 'sections.learn.추진 실적'), ['코스웨어 활용 수학 수업 주 2회']);
  assert.equal(r.missing.find(m => m.path === 'sections.learn.추진 목표').hint, '올해 학습지도 목표를 적어 주세요');
  const prev = buildReport({ parsed, info: {}, facts: {}, draft: '' });
  prev.basics['담당 과목'] = '선생님이 쓴 과목'; prev.self.노력도 = '만족';
  const filled = { 'basics.담당 과목': true, 'self.노력도': true };
  const kept = mergeReport(prev, r, filled, true, parsed);
  assert.equal(kept.basics['담당 과목'], '선생님이 쓴 과목'); assert.equal(kept.self.노력도, '만족');
  const over = mergeReport(prev, r, filled, false, parsed);
  assert.equal(over.basics['담당 과목'], ''); assert.equal(over.self.노력도, '', '덮으면 새 답(AI는 자기 평가를 고르지 않음)');
});

test('정성 기준 사진·스캔 읽기(AI): 같은 모양으로 정리', () => {
  const p = qualFormPrompt({ text: maskFor(QUAL_TEXT, INFO), nImages: 0 });
  assert.ok(p.startsWith(QUAL_FORM_TAG)); clean(p, '정성 양식 프롬프트');
  const f = normQualForm({ criteria: [{ area: '1. 태도', element: '태도', max: 10, indicators: ['성실한가?'] }], basics: ['담당 과목'], sections: [{ name: '학습지도', parts: ['추진 목표'] }] });
  assert.equal(f.criteria[0].element, '태도'); assert.deepEqual(f.basics, ['담당 과목']); assert.equal(f.sections[0].key, 'learn');
  assert.equal(normQualForm({}), null);
  assert.deepEqual(defaultQual().basics.length, 10);
  assert.ok(defaultQuant());
});
