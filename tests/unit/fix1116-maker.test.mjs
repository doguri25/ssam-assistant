// 2026-11-16 고침 — 문항·활동지 만들기: 직접 쓴 범위 첫 줄의 교직원 이름이 평가 정보(단원 이름)·문제지 제목에 〔이름n〕로 남던 것. 이름은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { newPick, pickEvent, pickValue } from '../../web/menus/evaluate/make-pick.js';
import { makePrompt, paperTitle, testFrom } from '../../web/menus/evaluate/unit/unit-make.js';
import { actPrompt, activityFrom, normTasks } from '../../web/menus/evaluate/activity/activity-make.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; }
store.useStorage(mem());
const KINDS = [['choice', '객관식'], ['short', '단답'], ['essay', '서술형']];
const el = (mp, value) => ({ dataset: { mp }, value: String(value), checked: false, closest: () => null });
const freePick = (subject, free) => { const S = newPick({ kinds: KINDS }); pickEvent(S, el('subject', subject), 'input'); pickEvent(S, el('free', free), 'input'); return pickValue(S); };

test('[C22] 직접 쓴 범위 첫 줄의 교직원 이름: AI로 보내는 범위 줄은 가리고, 평가 정보·문제지 제목·활동지 단원에는 원래 이름', () => {
  const v = freePick('과학', '5. 날씨와 우리 생활(한가람 선생님 자료)\n습도와 이슬');
  assert.equal(v.error, '');
  const s = v.scope;
  assert.equal(s.unitNo, 5);
  assert.equal(s.unitName, '날씨와 우리 생활(한가람 선생님 자료)');
  assert.equal(s.unit, '5. 날씨와 우리 생활(한가람 선생님 자료)');
  // AI로 가는 범위 줄·요청 글은 여전히 가림
  assert.ok(!s.lines.join('\n').includes('한가람') && s.lines[0].includes('〔이름1〕'), s.lines.join('|'));
  for (const p of [makePrompt({ scope: s, grade: 4 }), actPrompt({ scope: s, grade: 4 })]) assert.ok(!p.includes('한가람') && p.includes('〔이름1〕'), p.slice(0, 300));
  // 평가 정보·문제지 제목(unit-maker metaNow와 같은 값)·활동지 단원
  const meta = { subject: s.subject, grade: 4, unitNo: s.unitNo, unitName: s.unitName, lesson: s.lesson };
  assert.equal(paperTitle(meta), '4학년 과학 5단원 날씨와 우리 생활(한가람 선생님 자료) 단원평가');
  assert.equal(testFrom({ meta, items: [] }).meta.unitName, '날씨와 우리 생활(한가람 선생님 자료)');
  const a = activityFrom({ meta: { subject: s.subject, unit: s.unit, title: '이슬 관찰' }, tasks: normTasks({ items: [{ kind: 'write', ask: '이슬이 맺히는 까닭을 쓰세요.', ok: 'a', part: 'b' }] }) });
  assert.equal(a.meta.unit, '5. 날씨와 우리 생활(한가람 선생님 자료)');
  // 돌아온 활동 이름의 자리 표시도 같은 가리개로 되돌림(activity-maker makeAll)
  assert.equal(s.back('〔이름1〕 선생님과 이슬 관찰'), '한가람 선생님과 이슬 관찰');
});

test('[C22] 지나치게 고치지 않음: 이름 없는 범위·이름이 둘째 줄에만 있는 범위·번호 없는 첫 줄은 그대로', () => {
  const plain = freePick('사회', '1. 우리 고장의 모습\n고장의 자랑거리 알기').scope;
  assert.deepEqual([plain.unit, plain.unitNo, plain.unitName], ['1. 우리 고장의 모습', 1, '우리 고장의 모습']);
  assert.deepEqual(plain.lines, ['1. 우리 고장의 모습', '고장의 자랑거리 알기']);
  const second = freePick('사회', '1. 우리 고장의 모습\n이바다 선생님 반과 같은 범위').scope;
  assert.deepEqual([second.unit, second.unitName], ['1. 우리 고장의 모습', '우리 고장의 모습']);
  assert.ok(!second.lines[1].includes('이바다'), second.lines[1]);
  // 첫 줄이 단원 번호 꼴이 아니면 단원 칸은 비어 있음(이름이 있어도)
  const loose = freePick('과학', '한가람 선생님 반과 같은 범위\n습도와 이슬').scope;
  assert.deepEqual([loose.unit, loose.unitNo, loose.unitName], ['', null, '']);
  assert.ok(!loose.lines.join('\n').includes('한가람'), loose.lines.join('|'));
  // 낱말 속 성씨 글자(「한글」「이슬」)는 이름이 아님
  const words = freePick('국어', '3. 한글의 짜임과 이슬 같은 말').scope;
  assert.equal(words.unitName, '한글의 짜임과 이슬 같은 말');
  assert.equal(words.lines[0], '3. 한글의 짜임과 이슬 같은 말');
});
