/* 수업 아이디어(스펙 2026-11-18-lesson-idea-design): 진도표 차시 → AI 아이디어 → 활동지로 이어 가기. 예시는 지어낸 것 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ideaPrompt, normIdeas, ideaText, ideasDoc, ideaLine, FORMS } from '../../web/menus/evaluate/activity/idea-make.js';
import { freeScope } from '../../web/menus/evaluate/make-scope.js';

const scope = { ...freeScope('과학', '2. 동물의 생활\n동물을 생김새에 따라 분류하기 (교과서 30~37쪽)') };
const good = n => ({ title: `동물 분류 놀이 ${n}`, summary: '사진 카드를 모둠별로 나눠 기준을 정해요', form: '모둠', materials: '동물 사진 카드',
  look: '분류 기준을 말로 설명하는지', flow: [{ stage: '도입', min: 5, text: '동물 사진 보며 다른 점 찾기' }, { stage: '전개', min: 25, text: '모둠별 분류 기준 정하고 나누기' }, { stage: '정리', min: 10, text: '기준 발표·비교' }] });

test('프롬프트: 교과·학년·범위·아이디어 수·수준, 학생 이름 안 씀, JSON 모양', () => {
  const p = ideaPrompt({ scope, grade: 3, count: 3, level: 'normal' });
  assert.ok(p.startsWith('[수업 아이디어]'));
  for (const s of ['[교과] 과학 · 3학년', '- 2. 동물의 생활', '- 동물을 생김새에 따라 분류하기 (교과서 30~37쪽)', '아이디어 3개', '보통', '학생 이름은 쓰지 않습니다', '"ideas"', '"flow"'])
    assert.ok(p.includes(s), s);
});

test('답 다듬기: 흐름 없는 것 버림, 고른 수까지, 활동 형태 맞춤, 단계 차례', () => {
  const v = { ideas: [good(1), { title: '흐름 없음', summary: 'x' }, { ...good(2), form: '모둠 활동', flow: [{ stage: '정리', text: '나누기' }, { stage: '도입', min: '5분', text: '열기' }] }, good(3), good(4)] };
  const out = normIdeas(v, { count: 3 });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map(x => x.no), [1, 2, 3]);
  assert.equal(out[1].form, '모둠');
  assert.deepEqual(out[1].flow.map(f => [f.stage, f.min]), [['도입', 5], ['정리', null]]);
  assert.deepEqual(FORMS, ['개별', '짝', '모둠', '전체']);
  assert.equal(normIdeas({ ideas: [{ ...good(1), form: '?' }] })[0].form, '');
  assert.deepEqual(normIdeas(null), []);
  assert.deepEqual(normIdeas([good(1)]).map(x => x.title), ['동물 분류 놀이 1']);
});

test('활동지로 넘길 줄·복사 글·내려받기 문서', () => {
  const i = normIdeas({ ideas: [good(1)] })[0];
  assert.equal(ideaLine(i), '수업 활동: 동물 분류 놀이 1 — 사진 카드를 모둠별로 나눠 기준을 정해요');
  const t = ideaText(i);
  assert.match(t, /^동물 분류 놀이 1 \(모둠\)\n사진 카드를 모둠별로 나눠 기준을 정해요\n- 도입\(5분\): 동물 사진 보며 다른 점 찾기\n- 전개\(25분\): /);
  assert.match(t, /\n준비물: 동물 사진 카드\n살펴볼 것: 분류 기준을 말로 설명하는지$/);
  const d = ideasDoc({ subject: '과학', unit: '2. 동물의 생활', lesson: '3/8' }, [i]);
  assert.equal(d.title, '수업 아이디어 — 과학 2. 동물의 생활 3/8차시');
  assert.ok(d.blocks.some(b => b.type === 'table' && b.rows.some(r => r[0] === '전개')));
});

test('고르기 칸: 유형이 없으면 「유형」 묶음을 그리지 않고 오류도 없음, 수 칸 이름은 아이디어 수', async () => {
  const { newPick, pickHTML, pickValue, pickEvent } = await import('../../web/menus/evaluate/make-pick.js');
  const S = newPick({ kinds: [], count: { min: 2, max: 5, d: 3 }, countLabel: '아이디어 수' });
  const h = pickHTML(S);
  assert.ok(h.includes('아이디어 수 (2~5)') && !h.includes('유형'), h);
  pickEvent(S, { dataset: { mp: 'subject' }, value: '과학' }, 'input');
  pickEvent(S, { dataset: { mp: 'free' }, value: '2. 동물의 생활' }, 'input');
  const v = pickValue(S);
  assert.equal(v.error, '');
  assert.equal(v.count, 3);
  // 활동지·문항 만들기는 그대로: 유형을 다 빼면 오류
  const T = newPick({ kinds: [['write', '쓰기']] });
  assert.ok(pickHTML(T).includes('문항 수') && pickHTML(T).includes('유형'));
  pickEvent(T, { dataset: { mp: 'subject' }, value: '과학' }, 'input');
  pickEvent(T, { dataset: { mp: 'free' }, value: '범위' }, 'input');
  pickEvent(T, { dataset: { mp: 'kind' }, value: 'write', checked: false }, 'change');
  assert.equal(pickValue(T).error, '유형을 하나 넘게 골라 주세요.');
});
