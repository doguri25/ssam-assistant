/* 단원평가 문서: 학생 결과지(한 쪽에 2명, 또는 번호별로 한 장씩), 성적 일람표(한글 파일·CSV) */
import { makeTitle, feedbackOf, feedbackRows } from './unit-model.js';
import { redoFor, redoBlocks } from './unit-redo.js';
import { missHead, missLines } from './unit-miss.js';

/* one이면 번호마다 새 쪽(가운데 자르는 줄 없음). 복습 문제를 넣으면 한마디 아래 「다시 풀어 보기」, 학생 칸 맨 아래 작은 글씨 정답 */
export function feedbackDoc(test, students, { one = false } = {}) {
  const title = makeTitle(test.meta), blocks = [];
  students.forEach((st, i) => {
    if (i && (one || i % 2 === 0)) blocks.push({ type: 'break' });
    else if (i) blocks.push({ type: 'p', text: '✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -' });
    const f = feedbackOf(test, st), rows = feedbackRows(test, st);
    blocks.push({ type: 'h', text: `${title} · ${st.no}번` });
    blocks.push({ type: 'p', text: `점수 ${f.score} / ${f.total}점` });
    if (rows.length) blocks.push({ type: 'table', head: true, rows: [['문항', '평가 내용', '내 답', '정답', '다시 볼 곳'], ...rows] });
    else blocks.push({ type: 'p', text: '틀린 문항이 없어요. 모두 맞혔어요!' });
    if (st.good) blocks.push({ type: 'p', text: `잘한 점: ${st.good}` });
    if (st.cheer) blocks.push({ type: 'p', text: `한마디: ${st.cheer}` });
    blocks.push(...redoBlocks(redoFor(test, st, { one })));
  });
  return { title: '', blocks };
}

const fmt = v => (v == null ? '' : String(v));
const tableRows = table => [
  ['번호', ...table.cols.map(c => c.title), '평균'],
  ...table.rows.map(r => [String(r.no), ...table.cols.map(c => fmt(r.cells[c.id])), fmt(r.avg)]),
  ['반 평균', ...table.cols.map(c => fmt(table.colAvg[c.id])), '']
];

export const tableDoc = (title, table) => ({ title, blocks: [{ type: 'table', head: true, rows: tableRows(table) }] });

/* 틀린 까닭(스펙 2026-11-13-miss-tour-check §1): 문항마다 머리 줄(「3번 · 평가 내용 · 틀린 학생 n명」)과 표(까닭 · 인원 · 번호 · 5분 보충 활동). view는 missView */
export function missDoc(test, view) {
  const blocks = [];
  for (const v of view) {
    blocks.push({ type: 'h', text: missHead(v) });
    if (v.stale) blocks.push({ type: 'p', text: '채점이 바뀌었어요. 앱에서 [다시 묶기]를 누르면 지금 채점으로 다시 묶어요.' });
    blocks.push({ type: 'table', head: true, rows: [['까닭', '인원', '번호', '5분 보충 활동'], ...missLines(v)] });
  }
  if (!view.length) blocks.push({ type: 'p', text: '틀린 학생이 없어요.' });
  return { title: `${makeTitle(test.meta)} 틀린 까닭`, blocks };
}

const csvCell = s => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const tableCsv = table => '\uFEFF' + tableRows(table).map(r => r.map(csvCell).join(',')).join('\n');
