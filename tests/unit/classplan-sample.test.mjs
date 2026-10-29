// 학급운영계획 예시(지어낸 자료): 작년 계획서·올해 지침·평가계획, 진도표 예시와 함께 읽기
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripNames } from '../../web/core/privacy.js';
import { parseJindo } from '../../web/menus/class/class-import.js';
import { sampleJindoDoc } from '../../web/menus/class/class-sample.js';
import { parseOutline, attachKind, sectionBodies } from '../../web/menus/plan/classplan-model.js';
import { docText, sampleLastPlanDoc, sampleEvalDoc, sampleSources, SAMPLE_GUIDE } from '../../web/menus/plan/classplan-sample.js';

test('작년 계획서 예시: 로마 숫자 목차로 읽히고, 시수표·평가 표·월별 표 칸이 하나씩, 칸마다 작년 글', () => {
  const text = docText(sampleLastPlanDoc());
  const o = parseOutline(text);
  assert.ok(o.length >= 15, String(o.length));
  assert.equal(o[0].title, '학급 현황');
  for (const r of ['hours', 'eval', 'monthly']) assert.equal(o.filter(x => x.role === r).length, 1, r);
  const bodies = sectionBodies(text, o);
  assert.ok(o.filter(x => x.level === 2).every(x => (bodies[x.id] || '').length > 0), '빈 칸');
});

test('작년 계획서 예시의 담임 명단·비상 연락 줄은 빠짐 (이름 빼기 시연)', () => {
  const r = stripNames(docText(sampleLastPlanDoc()));
  assert.equal(r.dropped, 2);
  assert.ok(!r.text.includes('김가람') && !r.text.includes('010-'));
});

test('예시 첨부: 진도표는 진도표로, 평가계획은 평가계획으로 짐작하고, 진도표는 교과를 읽음', () => {
  const s = sampleSources('2026-10-29');
  assert.deepEqual(s.attach.map(a => attachKind(a.name, a.text)), ['jindo', 'eval']);
  assert.ok(parseJindo(s.attach[0].text, { today: '2026-10-29' }).subjects.length >= 3);
  assert.equal(s.attach[0].text, docText(sampleJindoDoc('2026-10-29')));
  assert.ok(docText(sampleEvalDoc()).includes('성취기준'));
  assert.equal(s.guide.text, SAMPLE_GUIDE);
  assert.ok(/기초학력/.test(SAMPLE_GUIDE));
});
