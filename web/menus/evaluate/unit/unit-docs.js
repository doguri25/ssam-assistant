/* 단원평가 문서: 학생 결과지(한 쪽에 2명), 성적 일람표(한글 파일·CSV) */
import { makeTitle, feedbackOf } from './unit-model.js';

export function feedbackDoc(test, students) {
  const title = makeTitle(test.meta), blocks = [];
  students.forEach((st, i) => {
    if (i && i % 2 === 0) blocks.push({ type: 'break' });
    else if (i) blocks.push({ type: 'p', text: '✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -' });
    const f = feedbackOf(test, st);
    blocks.push({ type: 'h', text: `${title} · ${st.no}번` });
    blocks.push({ type: 'p', text: `점수 ${f.score} / ${f.total}점` });
    const rows = [
      ...f.wrong.map(w => ({ no: w.no, r: [`${w.no}번`, w.content, w.read || '(빈칸)', w.answer, w.pages] })),
      ...f.partial.map(p => { const it = test.key.items.find(x => x.no === p.no) || {}; return { no: p.no, r: [`${p.no}번`, p.content, `부분 점수 ${p.pts}/${p.points}`, it.answer || '', it.pages || ''] }; })
    ].sort((a, b) => a.no - b.no).map(x => x.r);
    if (rows.length) blocks.push({ type: 'table', head: true, rows: [['문항', '평가 내용', '내 답', '정답', '다시 볼 곳'], ...rows] });
    else blocks.push({ type: 'p', text: '틀린 문항이 없어요. 모두 맞혔어요!' });
    if (st.good) blocks.push({ type: 'p', text: `잘한 점: ${st.good}` });
    if (st.cheer) blocks.push({ type: 'p', text: `한마디: ${st.cheer}` });
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

const csvCell = s => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const tableCsv = table => '\uFEFF' + tableRows(table).map(r => r.map(csvCell).join(',')).join('\n');
