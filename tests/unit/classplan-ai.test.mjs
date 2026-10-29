// 학급운영계획 AI 프롬프트: 지침 항목·초안·평가계획 읽기. 이름·전화번호 줄은 넣지 않음
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOutline, sectionBodies, leaves, newPlan } from '../../web/menus/plan/classplan-model.js';
import { guidePrompt, draftPrompt, evalPrompt } from '../../web/menus/plan/classplan-ai.js';

const LAST = readFileSync(new URL('../fixtures/classplan-last.txt', import.meta.url), 'utf8');
const plan = () => {
  const outline = parseOutline(LAST);
  return { ...newPlan(), year: 2027, grade: 3, room: 2, boys: 13, girls: 12, motto: '서로 돕는 우리 반', outline,
    sources: { lastPlan: LAST, guide: '기초학력 진단을 3월에 실시한다.\n담당 장학사 연락처 010-9999-8888' },
    guide: [{ item: '기초학력 진단', keywords: ['기초학력'], sentence: '3월에 기초학력을 진단한다.', section: leaves(outline)[0].id }] };
};

test('지침 항목 프롬프트: 표지, 칸 id와 이름, 지침 글(전화번호 줄 뺌), 출력 모양', () => {
  const p = plan(), s = guidePrompt(p);
  assert.ok(s.startsWith('[학급운영계획 지침]'));
  for (const x of leaves(p.outline)) assert.ok(s.includes(`${x.id}: ${x.title}`), x.title);
  assert.ok(s.includes('기초학력 진단을 3월에') && !s.includes('010-9999'));
  assert.ok(s.includes('"section"') && s.includes('"keywords"'));
});

test('초안 프롬프트: 학급 정보(학생 수 숫자), 칸마다 작년 글, 지침 항목, 시수 요약, 월별, 이름·전화 없음', () => {
  const p = plan(), bodies = sectionBodies(LAST, p.outline);
  const s = draftPrompt(p, { bodies, hours: [['국어', '185'], ['합계', '185']], evalCount: 4 });
  assert.ok(s.startsWith('[학급운영계획 초안]'));
  assert.ok(s.includes('2027학년도 3학년 2반') && s.includes('남 13명, 여 12명, 모두 25명') && s.includes('서로 돕는 우리 반'));
  const leaf = leaves(p.outline).find(x => x.title === '학급 실태');
  assert.ok(s.includes(`[${leaf.id}] 학급 실태`) && s.includes('남 12명 여 13명, 총 25명'), '작년 글');
  assert.ok(s.includes('3월에 기초학력을 진단한다.') && s.includes('국어 185') && s.includes('평가계획 4줄'));
  assert.ok(s.includes('"sections"') && s.includes('"monthly"'));
  assert.ok(!s.includes('김가람') && !s.includes('이나래') && !s.includes('010-2345'), '이름·전화');
});

test('작년 계획서가 없으면 표준 목차 칸 이름만으로 씀', () => {
  const p = { ...plan(), sources: { lastPlan: '', guide: '' }, guide: null };
  const s = draftPrompt(p, { bodies: {}, hours: [] });
  assert.ok(s.includes('작년 글 없음') || !s.includes('작년 글:'), s.slice(0, 200));
});

test('평가계획 읽기 프롬프트: 표지, 글(이름 줄 뺌), 출력 모양', () => {
  const s = evalPrompt('국어 | 읽기 | [4국02-01] | 서술형 | 4월\n담임 | 김가람 | 이나래 | 박다솜');
  assert.ok(s.startsWith('[평가계획 읽기]') && s.includes('[4국02-01]') && !s.includes('김가람'));
  assert.ok(s.includes('"rows"') && s.includes('"standard"'));
});
