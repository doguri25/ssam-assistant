/* 단원평가 결과지 맞춤 복습 문제 (스펙 2026-11-06 A). 평가 하나에 AI가 문항마다 만든 복습 문제(test.redo.items)를
   학생마다 틀린·부분 점수 문항에서 배점 큰 순(같으면 번호순)으로 최대 3개, 그 학생 칸에 남는 자리만큼 고름.
   남는 자리는 줄 수로 셈: 한 쪽에 2명이면 반 쪽, 번호별로 한 장씩이면 한 쪽에서 이미 쓴 줄(머리·점수·표·잘한 점·한마디)을 뺌.
   화면 미리 보기·인쇄·한글·워드·PDF·복사가 모두 이 파일이 고른 것을 씀 */
import { graded, feedbackOf, feedbackRows } from './unit-model.js';

export const REDO_MAX = 3;
// 한 쪽 줄 수(10pt 보통 글 한 줄, 가장 성긴 워드 기준으로 넉넉히)·한 줄 글자 수(한글)·작은 글(8pt) 한 줄 글자 수와 줄 높이
export const PAGE_LINES = 36, LINE_CHARS = 44;
const SMALL_CHARS = 54, SMALL_RATIO = 0.8, HEAD_LINES = 1.5, ROW_PAD = 0.25, TABLE_GAP = 0.5, COLS = 5;
/* 한 학생 칸의 줄: 번호별로 한 장씩이면 한 쪽, 아니면 반 쪽(가운데 자르는 줄 1을 뺌) */
export const budgetOf = one => (one ? PAGE_LINES : (PAGE_LINES - 1) / 2);
/* 복습 문제 꼴: 고르기·기호·선 잇기는 ①~④ 고르기, 단답, 서술형 */
export const redoKind = type => (type === 'essay' ? 'essay' : type === 'short' ? 'short' : 'choice');
const CIRC = '①②③④';
const SPACE = { choice: '(        )', short: `(${' '.repeat(30)})`, essay: '_'.repeat(40) };

/* 글 너비(한글·기호 1, 영문·숫자·빈칸·문장 부호 0.55) → 줄 수(줄바꿈마다 한 줄 이상) */
const width = s => [...String(s)].reduce((w, ch) => w + (ch.codePointAt(0) < 0x2000 ? 0.55 : 1), 0);
export const textLines = (text, per = LINE_CHARS) => String(text == null ? '' : text).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(width(l) / per)), 0);

/* 결과지에서 그 학생 칸이 이미 쓴 줄 (unit-docs의 feedbackDoc과 같은 차례) */
export function usedLines(test, st) {
  const rows = feedbackRows(test, st), per = Math.floor(LINE_CHARS / COLS); // 칸 한 줄 글자 수(5칸 표)
  let n = HEAD_LINES + 1; // 머리(평가·번호) + 점수
  if (rows.length) n += [['문항', '평가 내용', '내 답', '정답', '다시 볼 곳'], ...rows].reduce((a, r) => a + Math.max(...r.map(c => textLines(c, per))) + ROW_PAD, 0) + TABLE_GAP;
  else n += 1; // 「틀린 문항이 없어요」
  if (st.good) n += textLines(`잘한 점: ${st.good}`);
  if (st.cheer) n += textLines(`한마디: ${st.cheer}`);
  return n;
}

export const choicesLine = q => (q && Array.isArray(q.choices) && q.choices.length ? q.choices.map((c, i) => `${CIRC[i] || `(${i + 1})`} ${c}`).join('   ') : '');
/* 복습 문제 하나의 줄: 물음 줄 + 보기 줄(있으면) + 답 칸 1줄 */
export const questionCost = (q, i) => textLines(`${i + 1}) ${q.q}`) + (choicesLine(q) ? textLines(choicesLine(q)) : 0) + 1;
export const answerLine = list => `정답: ${list.map((q, i) => `${i + 1}) ${q.answer}${q.explain ? ` (${q.explain})` : ''}`).join('   ')}`;
/* 남는 줄(budget - used)에 들어가는 앞에서부터의 문제 수. 넣으려면 「다시 풀어 보기」 머리 1줄과 맨 아래 작은 정답 줄도 들어가야 함 */
export function fitCount(budget, used, qs) {
  let k = 0, cost = 1;
  for (let n = 1; n <= qs.length; n++) {
    cost += questionCost(qs[n - 1], n - 1);
    if (used + cost + textLines(answerLine(qs.slice(0, n)), SMALL_CHARS) * SMALL_RATIO <= budget + 1e-9) k = n; else break;
  }
  return k;
}

/* AI에 보낼 문항: 채점한 학생 중 틀리거나 부분 점수인 학생이 있는 문항 */
export function redoTargets(test) {
  const g = graded(test);
  return test.key.items.filter(it => g.some(s => (Number(s.items && s.items[it.no] && s.items[it.no].pts) || 0) < (Number(it.points) || 0)));
}
const hasQ = (R, no) => !!(R.items[no] && String(R.items[no].q || '').trim());
/* 한 학생에게 넣을 후보(자리를 보기 전): 틀린·부분 점수 문항을 배점 큰 순(같으면 번호순), 복습 문제가 있는 것만 최대 3개 */
function candidates(test, st) {
  const R = test && test.redo;
  if (!R || !R.on || !R.items) return [];
  const f = feedbackOf(test, st), pts = no => Number((test.key.items.find(i => i.no === no) || {}).points) || 0;
  return [...f.wrong.map(w => w.no), ...f.partial.map(p => p.no)].filter(no => hasQ(R, no))
    .sort((a, b) => pts(b) - pts(a) || a - b).slice(0, REDO_MAX).map(no => ({ no, ...R.items[no] }));
}
/* 한 학생에게 넣고 싶은 복습 문제 수(자리를 보기 전) */
export const redoWant = (test, st) => candidates(test, st).length;
/* 한 학생에게 넣을 복습 문제(남는 자리만큼). one: 번호별로 한 장씩 */
export function redoFor(test, st, { one = false } = {}) {
  const c = candidates(test, st);
  return c.length ? c.slice(0, fitCount(budgetOf(one), usedLines(test, st), c)) : [];
}
/* 넣은 학생 수 · 자리가 모자라 덜 넣은 학생 수 */
export function redoFit(test, students, { one = false } = {}) {
  let put = 0, short = 0;
  for (const s of students) {
    const c = candidates(test, s).length;
    if (!c) continue;
    const got = redoFor(test, s, { one }).length;
    if (got) put++;
    if (got < c) short++;
  }
  return { put, short };
}

/* 결과지 문서 블록: 「다시 풀어 보기」 1) 2) 3)(보기·답 칸), 맨 아래 작은 글씨 정답 */
export function redoBlocks(list) {
  if (!list.length) return [];
  const out = [{ type: 'p', text: '다시 풀어 보기', bold: true }];
  list.forEach((q, i) => {
    const c = choicesLine(q);
    out.push({ type: 'p', text: `${i + 1}) ${q.q}` });
    if (c) out.push({ type: 'p', text: `    ${c}` });
    out.push({ type: 'p', text: `    답: ${SPACE[c ? 'choice' : q.kind === 'essay' ? 'essay' : 'short']}` });
  });
  out.push({ type: 'small', text: answerLine(list) });
  return out;
}
/* 복사 글 줄 */
export function redoText(list) {
  if (!list.length) return [];
  return ['다시 풀어 보기', ...list.flatMap((q, i) => [`${i + 1}) ${q.q}`, ...(choicesLine(q) ? [`    ${choicesLine(q)}`] : [])]), answerLine(list)];
}
