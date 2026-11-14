// 기재 점검 화면 자료(스펙 2026-11-14-eval-redesign §7): 위 숫자 타일(전체·쓰면 안 되는 말·같은 문장·이름·주어·글자 수·부정 표현),
// 종류별로 묶은 카드(어디 · n번째 문장 · 걸린 곳), 같은 문장은 문장마다 한 카드(쓴 학생 번호), 「그대로 두기」한 곳은 세지 않음,
// 나이스에 넣기 전 「모든 학생 글이 있는지」. 화면 없이 돌아감
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkItems } from '../../web/menus/evaluate/check/check-rules.js';
import { TILE_KINDS, TILE_NAME, issueKey, keyRef, excerpt, sentLabel, markHTML, buildView, missingWriters, labelBase, shortWhy } from '../../web/menus/evaluate/check/check-view.js';

const S = '앞으로의 성장이 더욱 기대됨.';
const ITEMS = [
  { ref: 'hk:a:0', src: 'hk', label: '행동특성 · 1번', who: 1, group: 'hk', text: '김하늘은 영어 학원에 다니며 꾸준히 공부함.', limit: { max: 60, unit: 'char' } },
  { ref: 'hk:b:0', src: 'hk', label: '행동특성 · 2번', who: 2, group: 'hk', text: `친구를 먼저 돕는 따뜻한 마음을 지님. ${S}` },
  { ref: 'hk:c:0', src: 'hk', label: '행동특성 · 3번', who: 3, group: 'hk', text: `맡은 일을 끝까지 해냄. ${S}` },
  { ref: 'cc:auto:1:a1', src: 'cc', label: '창의적 체험활동 · 자율·자치활동 · 1번', who: 1, group: 'cc:auto', text: '수업 시간에 산만함.' },
  { ref: 'py:P1:u1:high:0', src: 'py', label: '교과 평어 · 국어 · 인물의 마음 짐작하기 · 상', text: '토익 공부를 꾸준히 하여 영어 어휘를 넓힘.' }
];
const RES = checkItems(ITEMS.map(x => ({ id: x.ref, text: x.text, who: x.who, group: x.group, limit: x.limit })));
const issuesOf = ref => RES.list.find(x => x.id === ref).issues;
const keyOf = (ref, kind) => { const x = ITEMS.find(i => i.ref === ref); return issueKey(ref, x.text, issuesOf(ref).find(i => i.kind === kind)); };

test('타일 차례와 이름', () => {
  assert.deepEqual(TILE_KINDS, ['ban', 'dup', 'name', 'len', 'neg']);
  assert.deepEqual(TILE_NAME, { ban: '쓰면 안 되는 말', dup: '같은 문장', name: '이름·주어', len: '글자 수', neg: '부정 표현' });
});

test('종류마다 수 · 종류별로 묶은 카드(타일 차례), 같은 문장은 문장마다 한 카드', () => {
  const v = buildView({ items: ITEMS, res: RES, keep: new Set() });
  assert.deepEqual(v.counts, { '': 6, ban: 2, dup: 2, name: 1, len: 0, neg: 1 });
  assert.equal(v.kept, 0);
  assert.equal(v.texts, 5);
  assert.deepEqual(v.groups.map(g => [g.kind, g.n, g.cards.length]), [['ban', 2, 2], ['dup', 2, 1], ['name', 1, 1], ['neg', 1, 1]]);
  const ban = v.groups[0].cards;
  assert.deepEqual(ban.map(c => c.ref), ['hk:a:0', 'py:P1:u1:high:0']);
  assert.deepEqual(ban[0].issues.map(i => i.word), ['학원'], '그 종류의 걸린 곳만');
  assert.equal(ban[0].id, 'ban:hk:a:0');
  const dup = v.groups[1].cards[0];
  assert.equal(dup.kind, 'dup');
  assert.equal(dup.text, S);
  assert.equal(dup.base, '행동특성');
  assert.deepEqual(dup.refs.map(r => [r.ref, r.who]), [['hk:b:0', 2], ['hk:c:0', 3]]);
  assert.deepEqual(dup.whos, [2, 3]);
  assert.ok(dup.id && typeof dup.id === 'string');
});

test('종류·화면으로 거르기', () => {
  const k = buildView({ items: ITEMS, res: RES, keep: new Set(), kind: 'dup' });
  assert.deepEqual(k.groups.map(g => g.kind), ['dup']);
  assert.equal(k.counts[''], 6, '수는 거르기 전 그대로');
  const s = buildView({ items: ITEMS, res: RES, keep: new Set(), src: 'cc' });
  assert.deepEqual(s.counts, { '': 1, ban: 0, dup: 0, name: 0, len: 0, neg: 1 });
  assert.equal(s.texts, 1);
  assert.deepEqual(s.groups.map(g => g.kind), ['neg']);
  const none = buildView({ items: ITEMS, res: RES, keep: new Set(), kind: 'len' });
  assert.deepEqual(none.groups, []);
});

test('그대로 두기: 그 곳은 세지 않고 카드도 없음(같은 문장은 남은 학생만)', () => {
  const v = buildView({ items: ITEMS, res: RES, keep: new Set([keyOf('hk:a:0', 'ban')]) });
  assert.deepEqual(v.counts, { '': 5, ban: 1, dup: 2, name: 1, len: 0, neg: 1 });
  assert.equal(v.kept, 1);
  assert.deepEqual(v.groups[0].cards.map(c => c.ref), ['py:P1:u1:high:0']);
  const one = buildView({ items: ITEMS, res: RES, keep: new Set([keyOf('hk:b:0', 'dup')]) });
  const dup = one.groups.find(g => g.kind === 'dup').cards[0];
  assert.deepEqual(dup.refs.map(r => r.ref), ['hk:c:0']);
  assert.deepEqual(dup.whos, [2, 3], '쓴 학생은 그대로 보임');
  const both = buildView({ items: ITEMS, res: RES, keep: new Set([keyOf('hk:b:0', 'dup'), keyOf('hk:c:0', 'dup')]) });
  assert.equal(both.counts.dup, 0);
  assert.ok(!both.groups.some(g => g.kind === 'dup'));
});

test('그대로 두기 열쇠: 그 문장·그 낱말이 같으면 같음, 그 문장이 바뀌면 다름', () => {
  const t1 = '수업 시간에 산만함. 친구를 잘 도움.', t2 = '수업 시간에 산만함. 친구를 늘 도움.', t3 = '수업 중에 산만함. 친구를 잘 도움.';
  const k = t => { const r = checkItems([{ id: 'x', text: t }]).list[0].issues[0]; return issueKey('cc:auto:1:a1', t, r); };
  assert.equal(k(t1), k(t2));
  assert.notEqual(k(t1), k(t3));
  assert.equal(keyRef(k(t1)), 'cc:auto:1:a1');
  assert.ok(!k(t1).includes('\n'));
});

test('걸린 곳이 든 문장만 보여 줄 자리 · n번째 문장', () => {
  const t = '발표를 즐겨 함. 영어 학원에서 배운 낱말을 씀. 친구를 잘 도움.';
  const iss = checkItems([{ id: 'x', text: t }]).list[0].issues;
  const e = excerpt(t, iss);
  assert.equal(t.slice(e.from, e.to), '영어 학원에서 배운 낱말을 씀.');
  assert.deepEqual([e.nos, e.total, e.pre, e.post], [[2], 3, true, true]);
  const whole = excerpt('수업 시간에 산만함.', checkItems([{ id: 'x', text: '수업 시간에 산만함.' }]).list[0].issues);
  assert.deepEqual([whole.from, whole.to, whole.total, whole.pre, whole.post], [0, 11, 1, false, false]);
  assert.equal(sentLabel([2], 3), '2번째 문장');
  assert.equal(sentLabel([1], 1), '');
  assert.equal(sentLabel([1, 3], 4), '1·3번째 문장');
  assert.equal(sentLabel([2, 3, 4, 5], 6), '2~5번째 문장');
});

test('글자 수: 넘친 곳이 든 문장부터 끝까지', () => {
  const t = '모둠 활동에서 친구들의 의견을 귀 기울여 들음. 서로 다른 생각을 하나로 모음. 맡은 역할을 끝까지 책임감 있게 해냄.';
  const iss = checkItems([{ id: 'x', text: t, limit: { max: 30, unit: 'char' } }]).list[0].issues.filter(i => i.kind === 'len');
  const e = excerpt(t, iss);
  assert.equal(e.to, t.length);
  assert.ok(e.from > 0 && e.from <= iss[0].start, JSON.stringify(e));
  assert.equal(e.post, false);
});

test('표시한 글: 이스케이프 · 걸린 곳 <mark> + 번호 기호(화면 읽기에는 「고칠 곳 n」)', () => {
  const t = '<b>영어 학원</b>에서 토익을 공부함.';
  const iss = checkItems([{ id: 'x', text: t }]).list[0].issues;
  const h = markHTML(t, iss);
  assert.ok(h.startsWith('&lt;b&gt;영어 <mark class="chk-hit">학원</mark>'), h);
  assert.ok(h.includes('<sup class="chk-n"><span aria-hidden="true">①</span><span class="sr-only">(고칠 곳 1)</span></sup>'), h);
  assert.ok(h.includes('<mark class="chk-hit">토익</mark><sup class="chk-n"><span aria-hidden="true">②</span>'), h);
  const part = markHTML('가나다. 영어 학원에 감.', checkItems([{ id: 'x', text: '가나다. 영어 학원에 감.' }]).list[0].issues, { from: 5, to: 15 });
  assert.equal(part.replace(/<sup.*?<\/sup>/g, ''), '영어 <mark class="chk-hit">학원</mark>에 감.');
});

test('짧은 까닭(카드 오른쪽 위)', () => {
  const t = '김하늘은 영어 학원에 다니며 토익을 공부함. 수업 시간에 산만함.';
  const iss = checkItems([{ id: 'x', text: t }]).list[0].issues;
  assert.deepEqual(iss.map(shortWhy), ['학생 이름', '사교육', '자격증·인증시험', '부정 표현']);
  assert.equal(shortWhy({ kind: 'dup', why: '다른 학생(3번) 글과 같은 문장이에요' }), '같은 문장');
  assert.equal(shortWhy({ kind: 'len', why: '최대 60자보다 3자 길어요' }), '글자 수');
  assert.equal(shortWhy({ kind: 'ban', why: '모르는 까닭' }), '쓰면 안 되는 말');
});

test('어디(묶음 이름): 번호 앞까지', () => {
  assert.equal(labelBase('창의적 체험활동 · 자율·자치활동 · 1번 · 1인 1역'), '창의적 체험활동 · 자율·자치활동');
  assert.equal(labelBase('행동특성 · 12번 · 고른 글'), '행동특성');
  assert.equal(labelBase('평가지 채점 · 수학 3단원 수행평가 · 번호 없음'), '평가지 채점 · 수학 3단원 수행평가');
  assert.equal(labelBase('교과 평어 · 국어 · 인물 · 상'), '교과 평어 · 국어 · 인물 · 상');
});

test('모든 학생 글이 있는지: 학생 글 묶음마다 빠진 번호(학급 명단, 없으면 글이 있는 학생 모두)', () => {
  const r = missingWriters(ITEMS, new Set([1, 2, 3, 4]));
  assert.equal(r.total, 4);
  assert.deepEqual(r.gaps, [{ base: '행동특성', missing: [4] }, { base: '창의적 체험활동 · 자율·자치활동', missing: [2, 3, 4] }]);
  const n = missingWriters(ITEMS, null);
  assert.equal(n.total, 3);
  assert.deepEqual(n.gaps, [{ base: '창의적 체험활동 · 자율·자치활동', missing: [2, 3] }]);
  assert.deepEqual(missingWriters([], null), { total: 0, gaps: [] });
});
