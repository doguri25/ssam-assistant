// 생활기록부 글 쓰기 틀의 AI 한 문장(스펙 2026-11-14-eval-redesign §6): [고치기]·[이 근거로 문장 더하기]에 보내는 글과 답 정리
import test from 'node:test';
import assert from 'node:assert/strict';
import { sentencePrompt, normOne, ONE_TAG } from '../../web/menus/evaluate/record/record-ai.js';

const list = [{ id: 'm1', kind: 'memo', label: '넘어진 친구를 보건실에 데려감' }, { id: 'm2', kind: 'memo', label: '발표 순서를 양보함' }];

test('고치기: 고칠 문장·까닭·근거 목록·끝맺음 규칙, 이름은 가림(글·문장·까닭 모두)', () => {
  const p = sentencePrompt({ mode: 'fix', field: 'hk', text: '김하늘은 친구를 도움. 앞으로 기대됨.', sentence: '김하늘은 친구를 도움.', why: ['김하늘: 학생 이름은 쓰지 않아요'], list });
  assert.ok(p.startsWith(ONE_TAG));
  assert.ok(p.includes('행동특성 및 종합의견') && p.includes('[고칠 문장]') && p.includes('[고칠 까닭]'));
  assert.ok(p.includes('[근거 목록]\nm1) 넘어진 친구를 보건실에 데려감\nm2) 발표 순서를 양보함'), p);
  assert.ok(!p.includes('김하늘'), '이름이 감');
  assert.ok(p.includes("'~함.'") && !p.includes("'~한다.'"), '끝맺음');
  assert.ok(sentencePrompt({ mode: 'fix', list, da: true, sentence: 'x' }).includes("'~한다.'"));
});

test('더하기: 쓸 근거 하나와 지금 글, 번호·출처 없이', () => {
  const p = sentencePrompt({ mode: 'add', field: 'cc', text: '자석 팽이를 설계함.', target: list[1], list });
  assert.ok(p.includes('창의적 체험활동') && p.includes('[쓸 근거] m2) 발표 순서를 양보함') && p.includes('[글] 자석 팽이를 설계함.'));
  assert.ok(!p.includes('[고칠 문장]') && !/\d+번/.test(p), p);
  assert.ok(sentencePrompt({ mode: 'add', target: list[0], list }).includes('(아직 없음)'));
});

test('답 정리: JSON 하나 → { t, src(목록에 있는 것만) }, 여러 문장은 이어 붙임, 깨진 답은 한 줄(근거 없음), 빈 답은 null', () => {
  assert.deepEqual(normOne('{"t":"친구를 먼저 살핌.","src":["m1","m9"]}', list), { t: '친구를 먼저 살핌.', src: ['m1'] });
  assert.deepEqual(normOne('```json\n{"sentences":[{"t":"앞 문장.","src":["m1"]},{"t":"뒤 문장.","src":["m2"]}]}\n```', list), { t: '앞 문장. 뒤 문장.', src: ['m1', 'm2'] });
  assert.deepEqual(normOne('"○○○는 친구를 도움."', list), { t: '친구를 도움.', src: [] });
  assert.equal(normOne('', list), null);
  assert.equal(normOne('{"t":""}', list), null);
});
