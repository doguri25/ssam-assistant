// 생기부 기재 점검 [AI로 고치기](스펙 2026-11-13 §4): 그 글 하나와 까닭만 보냄 — 학생 이름은 ○○○로 가리고, 학생 번호(같은 문장의 「2번」 등)·출처는 보내지 않음.
// 답 {"text"} 정리(따옴표·빈칸·남은 ○○○ 빼기)
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixPrompt, normFix, FIX_TAG } from '../../web/menus/evaluate/check/check-ai.js';
import { checkText, checkItems } from '../../web/menus/evaluate/check/check-rules.js';

test('보내는 글: 이름은 가리고 까닭만, 번호·출처 없음', () => {
  const text = '김하늘은 영어 학원에 다니며 토익을 공부함. 수업 시간에 산만함.';
  const p = fixPrompt({ text, issues: checkText(text), src: 'hk' });
  assert.ok(p.startsWith(FIX_TAG), p.slice(0, 40));
  assert.ok(!p.includes('김하늘'), '이름');
  assert.ok(p.includes('○○○은 영어 학원에 다니며 토익을 공부함. 수업 시간에 산만함.'), p);
  assert.ok(p.includes('행동특성 및 종합의견'), '어떤 글인지');
  for (const s of ['「학원」: 학원·과외 같은 사교육은 쓰지 않아요', '「토익」: 자격증·인증시험은 쓰지 않아요', '「산만함」: 성장 중심으로 바꿔 보세요', '가린 이름(○○○)']) assert.ok(p.includes(s), s);
  assert.ok(p.includes('"text"'), '답 모양');
});

test('같은 문장·글자 수: 다른 학생 번호는 보내지 않고 한도는 보냄', () => {
  const S = '앞으로의 성장이 더욱 기대됨.';
  const r = checkItems([{ id: 'a', who: 3, group: 'hk', text: `발표를 즐겨 함. ${S}`, limit: { max: 20, unit: 'char' } }, { id: 'b', who: 12, group: 'hk', text: S }]);
  const a = r.list.find(x => x.id === 'a');
  const p = fixPrompt({ text: `발표를 즐겨 함. ${S}`, issues: a.issues, src: 'gr', limit: { max: 20, unit: 'char' } });
  assert.ok(!/\d+\s*번/.test(p), '학생 번호: ' + p);
  assert.ok(p.includes(`다른 학생 글과 같은 문장「${S}」`), p);
  assert.ok(p.includes('20자 안'), p);
  assert.ok(p.includes('교과학습발달상황'), p);
  const b = fixPrompt({ text: '가나다라', issues: checkText('가나다라', { limit: { max: 9, unit: 'byte' } }), src: 'hk', limit: { max: 9, unit: 'byte' } });
  assert.ok(b.includes('나이스 9바이트 안'), b);
});

test('답 정리', () => {
  assert.equal(normFix({ text: ' "맡은 일을 끝까지 해냄."  ' }), '맡은 일을 끝까지 해냄.');
  assert.equal(normFix({ text: '맡은 일을\n 끝까지   해냄.' }), '맡은 일을 끝까지 해냄.');
  assert.equal(normFix({ text: '○○○는 맡은 일을 끝까지 해냄.' }), '맡은 일을 끝까지 해냄.');
  assert.equal(normFix({}), '');
  assert.equal(normFix(null), '');
  assert.equal(normFix('맡은 일을 해냄.'), '맡은 일을 해냄.');
});
