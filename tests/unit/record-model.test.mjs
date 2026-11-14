// 생활기록부 글 쓰기 틀(스펙 2026-11-14-eval-redesign §6): 문장 줄·근거 맞추기·고칠 곳·학생 상태·문장 고치기/빼기/더하기,
// 평가지 채점 확인 목록(§4 — 한눈에 grPending과 같은 규칙), 창체 근거(활동·학습지, AI 없이), 교과 평어 모으기
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sentenceRows, evidenceUse, dupKeys, recState, removeSentence, replaceSentence, appendSentence,
  grNeeds, grReviewItems, ccEvidence, pySources, STATE_LABEL
} from '../../web/menus/evaluate/record/record-model.js';
import { grPending } from '../../web/menus/evaluate/eval-stage.js';

const L = [{ id: 'm1', kind: 'memo', label: '넘어진 친구를 보건실에 데려감' }, { id: 'm2', kind: 'memo', label: '청소 구역을 끝까지 정리함' }, { id: 'm3', kind: 'memo', label: '발표 순서를 양보함' }];
const S1 = '넘어진 친구를 보건실에 데려가며 먼저 살핌.', S2 = '맡은 청소 구역을 끝까지 정리함.', S3 = '앞으로 더 큰 성장이 기대됨.';
const EV = { list: L, sentences: [{ t: S1, src: ['m1'] }, { t: S2, src: ['m2'] }, { t: S3, src: [] }] };
const TEXT = [S1, S2, S3].join(' ');

test('문장 줄: 근거가 맞으면 문장마다 src, 근거 없는 문장은 none·bad, 자리(start·end)는 글의 글자 자리', () => {
  const r = sentenceRows(TEXT, EV);
  assert.equal(r.known, true);
  assert.equal(r.edited, false);
  assert.deepEqual(r.rows.map(x => x.t), [S1, S2, S3]);
  assert.deepEqual(r.rows.map(x => x.src), [['m1'], ['m2'], []]);
  assert.deepEqual(r.rows.map(x => x.none), [false, false, true]);
  assert.deepEqual(r.rows.map(x => x.bad), [false, false, true]);
  assert.equal(TEXT.slice(r.rows[1].start, r.rows[1].end), S2);
  assert.equal(r.bad, 1);
});

test('문장 줄: 근거가 없는 옛 글은 문장으로 나누고 근거를 모름(src null — 「근거 없음」으로 치지 않음)', () => {
  const r = sentenceRows(TEXT, null);
  assert.equal(r.known, false);
  assert.deepEqual(r.rows.map(x => x.src), [null, null, null]);
  assert.equal(r.bad, 0);
  assert.deepEqual(sentenceRows('', EV).rows, []);
});

test('문장 줄: 글을 고쳐 근거와 맞지 않으면 문장으로 나누고 edited, 한 문장 글은 늘 맞춤(고친 글 표시)', () => {
  const r = sentenceRows('완전히 새로 쓴 글임. 둘째 문장도 다름.', EV);
  assert.equal(r.known, false);
  assert.equal(r.edited, true);
  assert.equal(r.rows.length, 2);
  const one = sentenceRows('영어 공부를 꾸준히 하며 어휘를 넓혀 감.', { list: L, sentences: [{ t: '처음 쓴 한 문장.', src: ['m1'] }] });
  assert.equal(one.known, true);
  assert.equal(one.edited, true);
  assert.deepEqual(one.rows[0].src, ['m1']);
});

test('문장 줄: 기재 점검 규칙에 걸린 문장은 bad + 까닭(사교육·이름·부정 표현), 글자 수 넘침은 글 전체(over)', () => {
  const t = '김하늘은 방과 후 학원에서 익힌 방법을 활용함. 수업 시간에 산만함. 맡은 일을 끝까지 해냄.';
  const r = sentenceRows(t, null, { limit: { max: 30, unit: 'char' } });
  assert.deepEqual(r.rows.map(x => x.bad), [true, true, false]);
  assert.ok(r.rows[0].issues.some(x => x.kind === 'ban' && /사교육/.test(x.why)), JSON.stringify(r.rows[0].issues));
  assert.ok(r.rows[0].issues.some(x => x.kind === 'name'), '이름');
  assert.ok(r.rows[1].issues.some(x => x.kind === 'neg'), '부정 표현');
  assert.ok(r.rows.every(x => !x.issues.some(i => i.kind === 'len')), '글자 수는 문장에 붙이지 않음');
  assert.equal(r.over.max, 30);
  assert.equal(r.bad, 3, '고칠 문장 2 + 글자 수 1');
  assert.equal(sentenceRows(t, null).over, null, '한도가 없으면 글자 수는 보지 않음');
});

test('문장 줄: 다른 학생과 같은 문장(dups)·덧붙인 까닭(extra)도 고칠 곳', () => {
  const d = dupKeys([{ who: 1, text: TEXT }, { who: 2, text: `${S2} 다른 문장을 씀.` }, { who: 3, text: '혼자 쓴 다른 문장임.' }]);
  assert.ok(d.has('맡은청소구역을끝까지정리함'));
  assert.ok(!d.has('앞으로더큰성장이기대됨'), '한 학생만 쓴 문장');
  const r = sentenceRows(TEXT, EV, { dups: d, extra: [[], [{ kind: 'stale', why: '활동 내용이 바뀌었어요' }]] });
  assert.ok(r.rows[1].issues.some(x => x.kind === 'dup'));
  assert.ok(r.rows[1].issues.some(x => x.kind === 'stale'));
  assert.equal(r.rows[1].bad, true);
  assert.equal(dupKeys([{ who: 1, text: TEXT }, { who: 1, text: TEXT }]).size, 0, '같은 학생 둘은 같은 문장이 아님');
});

test('근거 쓰임: 목록 차례 번호(n)와 그 근거를 쓴 문장 번호(use), 아무 문장도 쓰지 않은 근거', () => {
  const u = evidenceUse(L, sentenceRows(TEXT, EV).rows);
  assert.deepEqual(u.map(e => [e.id, e.n, e.use]), [['m1', 1, [1]], ['m2', 2, [2]], ['m3', 3, []]]);
  assert.deepEqual(evidenceUse(L, [{ t: 'a', src: ['m1', 'm3'] }, { t: 'b', src: ['m1'] }]).map(e => e.use), [[1, 2], [], [1]]);
  assert.deepEqual(evidenceUse(null, []), []);
});

test('학생 상태: 쓰는 중 > 기다림 > 오류 > 고칠 곳(한 가지면 그 까닭) > 다 씀 > 초안 > 아직', () => {
  const rows = sentenceRows(TEXT, EV);
  assert.equal(recState({ text: TEXT, rows, run: true }).k, 'run');
  assert.equal(recState({ text: TEXT, rows, wait: true }).k, 'wait');
  assert.equal(recState({ text: TEXT, rows, err: 'x' }).k, 'err');
  const f = recState({ text: TEXT, rows, done: true });
  assert.deepEqual([f.k, f.label, f.n], ['fix', '근거 없음', 1]);
  const ok = sentenceRows(`${S1} ${S2}`, { list: L, sentences: EV.sentences.slice(0, 2) });
  assert.equal(recState({ text: 'x', rows: ok, done: true }).label, STATE_LABEL.done);
  assert.equal(recState({ text: 'x', rows: ok }).label, '초안');
  assert.equal(recState({ text: '', rows: null }).k, 'none');
  const nm = sentenceRows('김하늘은 성실함. 수업에 산만함.', null);
  assert.equal(recState({ text: 'x', rows: nm }).label, '고칠 곳 2');
  assert.equal(recState({ text: 'x', rows: sentenceRows('김하늘은 성실하게 일함.', null) }).label, '이름 들어감');
  assert.equal(recState({ text: 'x', rows: sentenceRows(TEXT, null, { limit: { max: 10 } }) }).label, '글자 수 넘음');
});

test('문장 빼기·바꾸기·더하기: 글과 근거 문장이 함께 바뀜(근거를 모르는 글은 글만)', () => {
  const a = removeSentence(TEXT, EV, 2);
  assert.equal(a.t, `${S1} ${S2}`);
  assert.deepEqual(a.ev.sentences.map(s => s.t), [S1, S2]);
  assert.equal(a.ev.list, L, '근거 목록은 그대로');
  const b = replaceSentence(TEXT, EV, 2, [{ t: '발표 순서를 친구에게 양보함.', src: ['m3'] }]);
  assert.equal(b.t, `${S1} ${S2} 발표 순서를 친구에게 양보함.`);
  assert.deepEqual(b.ev.sentences[2].src, ['m3']);
  const c = appendSentence(`${S1} ${S2}`, { list: L, sentences: EV.sentences.slice(0, 2) }, { t: '발표 순서를 양보함.', src: ['m3'] });
  assert.equal(c.t, `${S1} ${S2} 발표 순서를 양보함.`);
  assert.deepEqual(c.ev.sentences.map(s => s.src), [['m1'], ['m2'], ['m3']]);
  const d = removeSentence(TEXT, null, 0);
  assert.equal(d.t, `${S2} ${S3}`);
  assert.equal(d.ev, null);
  assert.equal(removeSentence(S1, EV, 0).t, '', '마지막 문장을 빼면 빈 글');
});

test('평가지 채점 확인: 학생 고르기는 한눈에 grPending과 같은 규칙, 학생마다 확인할 것(읽기·점수·평어)', () => {
  const st = [
    { id: 'a', no: 1, unreadable: 1 },
    { id: 'b', no: 2, unreadable: 1, manual: 1 },
    { id: 'c', no: 3, rv: { score: 80 } },
    { id: 'd', no: 4, rv: { score: 80, done: 'main' } },
    { id: 'e', no: 5, trv: { problem: 'p', fix: 'f' } },
    { id: 'f', no: 6, trv: { problem: 'p', fix: 'f' }, trvd: 1 },
    { id: 'g', no: 7, unreadable: 1, rv: { score: 70 }, skip: 1 },
    { id: 'h', no: 8, unreadable: 1, rv: { score: 70 } }
  ];
  assert.deepEqual(st.filter(grNeeds).map(s => s.id), ['a', 'c', 'e', 'f', 'h'], 'trvd(검토를 돌림)는 셈과 상관없음 — 제안을 고를 때까지(trv.done)');
  assert.equal(st.filter(s => !s.skip).filter(grNeeds).length, grPending({ students: st }));
  assert.deepEqual(grReviewItems(st).map(x => `${x.no}:${x.kind}`), ['1:read', '3:score', '5:text', '6:text', '8:read', '8:score']);
  assert.deepEqual(grReviewItems([{ id: 'z', no: 9, trv: { problem: 'p', fix: 'f', done: 'main' } }]).map(x => x.kind), [], '이미 고른 평어 의견은 볼 것 없음');
});

test('창체 근거: 활동(이름 — 내용)과 학습지에서 읽은 내용으로 문장(활동마다 한 문장)을 맞춤, 바뀐 활동·안 읽은 학습지는 까닭', () => {
  const acts = [{ id: 'c1', name: '자석 팽이 만들기', desc: '극의 성질로 팽이를 만듦' }, { id: 'c2', name: '실험 기록', desc: '' }];
  const it = { parts: { c1: { t: '자석 팽이를 설계함.', sig: 'A' }, c2: { t: '결과를 표로 정리함.', sig: 'old' } }, obs: { c1: { n: '축을 짧게 바꿨다고 씀' } } };
  const sig = a => (a.id === 'c1' ? 'A' : 'B');
  const r = ccEvidence(acts, it, { sig, sheetNew: id => id === 'c1' });
  assert.deepEqual(r.list.map(e => [e.id, e.kind, e.label]), [['e1', 'act', '자석 팽이 만들기 — 극의 성질로 팽이를 만듦'], ['e2', 'sheet', '축을 짧게 바꿨다고 씀'], ['e3', 'act', '실험 기록']]);
  assert.deepEqual(r.sentences.map(s => [s.t, s.src]), [['자석 팽이를 설계함.', ['e1', 'e2']], ['결과를 표로 정리함.', ['e3']]]);
  assert.deepEqual(r.extra.map(x => x.map(i => i.kind)), [['sheet'], ['stale']]);
  assert.equal(r.text, '자석 팽이를 설계함. 결과를 표로 정리함.');
  const none = ccEvidence(acts, null, { sig });
  assert.equal(none.text, '');
  assert.equal(none.list.length, 2, '글이 없어도 활동 근거');
});

test('교과 평어 모으기: 단원평가 평어(교과) + 그 교과의 평가지 채점 글을 학생 번호마다', () => {
  const unit = { students: { 1: { level: 'high', text: '단원 평어 1.', ev: { list: [], sentences: [] } }, 2: { level: 'mid', text: '' } } };
  const grs = [{ id: 'g1', title: '자석의 성질', students: [{ id: 's1', no: 1, text: '채점 평어 1.', level: 'top' }, { id: 's2', no: 3, text: '채점 평어 3.' }, { id: 's3', no: 4, text: '', skip: 1 }] }];
  const m = pySources(unit, grs);
  assert.deepEqual([...m.keys()], [1, 2, 3]);
  assert.deepEqual(m.get(1).map(x => [x.src, x.text]), [['unit', '단원 평어 1.'], ['gr', '채점 평어 1.']]);
  assert.equal(m.get(1)[1].key, 'gr:g1:s1');
  assert.equal(m.get(1)[1].title, '자석의 성질');
  assert.deepEqual(m.get(2).map(x => [x.src, x.text]), [['unit', '']]);
  assert.deepEqual(m.get(3).map(x => x.src), ['gr']);
});
