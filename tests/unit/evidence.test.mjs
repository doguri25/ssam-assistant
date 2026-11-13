// 근거가 보이는 평어(스펙 2026-11-13 §5): 근거 목록·프롬프트·문장 정리·글 합치기·고친 글 판별·화면 조각
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceList, evidencePrompt, EVIDENCE_RULE, MEMO_RULE, normSentences, joinSentences, alignSentences, memoEvidence, evidenceHTML, EVIDENCE_MAX, MEMO_MAX, LABEL_MAX
} from '../../web/core/evidence.js';

test('근거 목록: 번호(e1…, 메모는 m1…), 같은 글은 하나, 300자까지, 12개까지, 빈 글은 뺌', () => {
  const l = evidenceList([
    { kind: 'unit', label: '「3학년 수학 3단원」 세 자리 수 덧셈 90%' },
    { kind: 'unit', label: '  「3학년 수학 3단원」  세 자리 수 덧셈 90% ' },
    { kind: 'gr', label: '' },
    { kind: 'gr', label: '잘한 점: ' + '가'.repeat(120) },
    { kind: 'gr', label: '요약: ' + '나'.repeat(400) }
  ]);
  assert.deepEqual(l.map(x => x.id), ['e1', 'e2', 'e3']);
  assert.equal(l[0].kind, 'unit');
  assert.equal(l[0].label, '「3학년 수학 3단원」 세 자리 수 덧셈 90%');
  assert.equal(l[1].label, '잘한 점: ' + '가'.repeat(120), '평가지 채점 사실은 80자에서 자르지 않음(AI에 다 감)');
  assert.equal(LABEL_MAX, 300);
  assert.equal(l[2].label.length, 300);
  const m = evidenceList([{ kind: 'memo', label: '[11. 6.] 토론에서 근거를 들어 반론함' }, { kind: 'memo', label: '발표 잘함' }]);
  assert.deepEqual(m.map(x => x.id), ['m1', 'm2']);
  const many = evidenceList(Array.from({ length: 20 }, (_, i) => ({ kind: 'gr', label: `근거 ${i}` })));
  assert.equal(many.length, EVIDENCE_MAX);
  assert.equal(EVIDENCE_MAX, 12);
  assert.equal(evidenceList([{ kind: 'zzz', label: '참고 글' }])[0].kind, 'ref', '모르는 종류는 참고');
  assert.deepEqual(evidenceList(null), []);
});

test('근거 프롬프트: 한 학생 몫 「[근거 목록]\\ne1) …」, 들여쓰기, 없으면 「없음」', () => {
  const l = evidenceList([{ kind: 'unit', label: '「3학년 수학 3단원」 덧셈 문항 90%' }, { kind: 'unit', label: '뺄셈 40%' }]);
  assert.equal(evidencePrompt(l), '[근거 목록]\ne1) 「3학년 수학 3단원」 덧셈 문항 90%\ne2) 뺄셈 40%');
  assert.equal(evidencePrompt(l, '  '), '  [근거 목록]\n  e1) 「3학년 수학 3단원」 덧셈 문항 90%\n  e2) 뺄셈 40%');
  assert.equal(evidencePrompt([]), '[근거 목록] 없음');
  assert.equal(EVIDENCE_RULE, '근거 목록에 있는 사실만 쓰고, 문장마다 기대는 근거 번호를 src에 적어요. 근거가 없는 문장은 src를 비워요(지어내지 않음).');
});

test('문장 정리: 빈 문장 빼고, 목록에 없는 id 빼고, 겹친 id는 하나, 「e1, e2」 글도 읽음', () => {
  const l = evidenceList([{ kind: 'gr', label: 'a' }, { kind: 'gr', label: 'b' }]);
  const ss = normSentences([
    { t: '  덧셈을   바르게 함. ', src: ['e1', 'e9', 'e1'] },
    { t: '', src: ['e1'] },
    { t: '꾸준히 노력함.', src: 'e2, e1' },
    { t: '지어낸 문장임.' },
    null, '그냥 글임.'
  ], l);
  assert.deepEqual(ss, [
    { t: '덧셈을 바르게 함.', src: ['e1'] },
    { t: '꾸준히 노력함.', src: ['e2', 'e1'] },
    { t: '지어낸 문장임.', src: [] },
    { t: '그냥 글임.', src: [] }
  ]);
  assert.deepEqual(normSentences({ sentences: [{ t: 'x함.', src: ['E2'] }] }, l), [{ t: 'x함.', src: ['e2'] }], '대문자·{sentences}');
  assert.deepEqual(normSentences('글', l), []);
  assert.deepEqual(normSentences([{ t: '목록 없이.', src: ['e1'] }]), [{ t: '목록 없이.', src: [] }], '목록이 없으면 근거 없음');
});

test('글 합치기: 문장을 띄어 이음', () => {
  assert.equal(joinSentences([{ t: '하나임.' }, { t: ' 둘임. ' }, { t: '' }]), '하나임. 둘임.');
  assert.equal(joinSentences(null), '');
});

test('문장 맞추기: 앞·뒤를 고친 글·잘린 글(행특 길이 맞추기)에 맞춰 문장과 근거를 함께 둠', () => {
  const ss = [{ t: '하나를 함.', src: ['m1'] }, { t: '둘을 함.', src: [] }, { t: '셋을 할 수 있음.', src: ['m2'] }];
  assert.equal(alignSentences(ss, '하나를 함. 둘을 함. 셋을 할 수 있음.'), ss, '같으면 그대로');
  assert.deepEqual(alignSentences(ss, '하나를 함. 둘을 함. 셋을 함.'), [ss[0], ss[1], { t: '셋을 함.', src: ['m2'] }], '끝을 고침');
  assert.deepEqual(alignSentences(ss, '하나를 함. 둘을 함.'), [ss[0], ss[1]], '잘린 문장은 빠짐');
  assert.deepEqual(alignSentences(ss, '하나를 함.'), [ss[0]]);
  assert.deepEqual(alignSentences([{ t: '1. 하나를 함.', src: ['m1'] }, ss[1]], '하나를 함. 둘을 함.'), [{ t: '하나를 함.', src: ['m1'] }, ss[1]], '앞을 고침');
  assert.deepEqual(alignSentences([{ t: '덧셈을 함', src: ['e1'] }], '덧셈을 함.'), [{ t: '덧셈을 함.', src: ['e1'] }], '한 문장은 늘 맞춤');
  assert.equal(alignSentences(ss, '전혀 다른 글임. 또 다른 글임.'), null, '맞출 수 없으면 null');
  assert.deepEqual(alignSentences([], '글'), []);
});

test('AI 글 따로(ai): 프롬프트는 ai, 화면은 label — 정답률 숫자는 화면에만', () => {
  const l = evidenceList([{ kind: 'unit', label: '「3학년 수학 3단원」 덧셈 90%', ai: '「3학년 수학 3단원」 덧셈 — 잘함' }, { kind: 'gr', label: '잘한 점: 꼼꼼함' }]);
  assert.deepEqual(l[0], { id: 'e1', kind: 'unit', label: '「3학년 수학 3단원」 덧셈 90%', ai: '「3학년 수학 3단원」 덧셈 — 잘함' });
  assert.ok(!('ai' in l[1]), 'ai가 없으면 넣지 않음');
  assert.equal(evidencePrompt(l), '[근거 목록]\ne1) 「3학년 수학 3단원」 덧셈 — 잘함\ne2) 잘한 점: 꼼꼼함');
  const h = evidenceHTML({ sentences: [{ t: '덧셈을 잘함.', src: ['e1'] }], list: l });
  assert.ok(h.includes('덧셈 90%') && !h.includes('— 잘함'), h);
});

test('메모 조각은 40개까지, 넘으면 최근(아래) 조각을 남김(12개에서 잘려 뒤 메모가 근거에 없던 것)', () => {
  const memo = Array.from({ length: 45 }, (_, i) => `메모 ${i + 1}`).join('\n');
  const l = memoEvidence(memo);
  assert.equal(MEMO_MAX, 40);
  assert.equal(l.length, 40);
  assert.equal(l[0].label, '메모 6');
  assert.equal(l[39].label, '메모 45');
  assert.deepEqual([l[0].id, l[39].id], ['m1', 'm40']);
  assert.equal(memoEvidence('발표 잘함\n발표 잘함, 정리정돈').length, 2, '같은 조각은 하나');
  assert.equal(memoEvidence(Array.from({ length: 17 }, (_, i) => `조각 ${i}`).join(', ')).length, 17, '17조각은 모두');
});

test('행특 규칙(MEMO_RULE): 메모를 바탕으로 풀어 쓰되 메모에 없는 사실은 쓰지 않음, 조각 번호를 src에', () => {
  assert.ok(!MEMO_RULE.includes('근거 목록에 있는 사실만'), '글을 메모 조각만으로 좁히지 않음');
  assert.ok(MEMO_RULE.includes('메모에 없는 사실은 쓰지 않') && MEMO_RULE.includes('src'), MEMO_RULE);
});

test('메모 조각: 줄·쉼표로 나누고 날짜 「[11. 6.]」 앞머리는 그대로, 괄호 안 쉼표는 나누지 않음', () => {
  const l = memoEvidence('1인 1역(우유, 급식) 성실함, 친구를 잘 도와줌\n[11. 6.] 토론에서 근거를 들어 반론함, 발표 잘함\n\n  ');
  assert.deepEqual(l.map(x => [x.id, x.kind, x.label]), [
    ['m1', 'memo', '1인 1역(우유, 급식) 성실함'],
    ['m2', 'memo', '친구를 잘 도와줌'],
    ['m3', 'memo', '[11. 6.] 토론에서 근거를 들어 반론함'],
    ['m4', 'memo', '[11. 6.] 발표 잘함']
  ]);
  assert.deepEqual(memoEvidence(''), []);
  assert.deepEqual(memoEvidence('이름: ○○○, 정리정돈을 잘함').map(x => x.label), ['정리정돈을 잘함'], '가린 이름 칸만 남은 조각은 뺌');
});

test('화면: 문장마다 「근거 n」 단추(aria-expanded·aria-controls), 근거 없는 문장은 「근거 없음」 글자, 고친 글 표시', () => {
  const list = evidenceList([{ kind: 'memo', label: '[11. 6.] 토론에서 <근거>를 들어 반론함' }, { kind: 'memo', label: '발표 잘함' }]);
  const sentences = [{ t: '토론에서 근거를 들어 반론함.', src: ['m1', 'm2'] }, { t: '꾸준히 노력함.', src: [] }];
  const h = evidenceHTML({ sentences, list, text: joinSentences(sentences) });
  assert.match(h, /<button[^>]*class="evd-btn"[^>]*aria-expanded="false"/);
  assert.ok(h.includes('근거 2'), h);
  assert.ok(h.includes('근거 없음') && h.includes('evd-none'), '근거 없음');
  assert.ok(h.includes('&lt;근거&gt;') && !h.includes('<근거>'), '이스케이프');
  const ctl = /aria-controls="([^"]+)"/.exec(h)[1];
  assert.ok(new RegExp(`id="${ctl}"[^>]*hidden`).test(h), '펼칠 근거 줄은 처음에 숨김');
  assert.ok(!h.includes('고친 글'), '처음 쓴 글이면 고친 글 표시 없음');
  assert.ok(!evidenceHTML({ sentences, list, text: '  토론에서 근거를 들어 반론함.   꾸준히 노력함. ' }).includes('고친 글'), '띄어쓰기만 다르면 같은 글');
  assert.ok(evidenceHTML({ sentences, list, text: '선생님이 고친 글임.' }).replace(/<[^>]+>/g, '').includes('고친 글 · 근거는 처음 쓴 글 기준이에요'));
  assert.ok(!h.includes('>m1<') && !h.includes('>e1<'), '번호(id)는 화면에 내지 않음');
  assert.equal(evidenceHTML({ sentences: [], list, text: 'x' }), '');
  assert.equal(evidenceHTML({}), '');
  assert.equal(evidenceHTML({ sentences, list, text: '' }), '', '글을 비우면 근거도 없음');
  const one = evidenceHTML({ sentences: [sentences[0]], list, text: sentences[0].t });
  assert.ok(!one.includes('class="evd-t"'), '한 문장이면 문장을 다시 쓰지 않음');
});
