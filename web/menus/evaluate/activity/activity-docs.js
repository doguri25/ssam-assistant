/* 활동지 문서: 반 표, 학생 피드백 쪽지(한 쪽에 4명, 또는 번호별로 한 장씩). 번호만 적고 이름은 없음 */
import { MARK, LEVEL } from './activity-ai.js';

export const graded = a => a.students.filter(s => !s.skip && s.status === 'done');
export const markOf = (s, it) => MARK[(s.marks && s.marks[it.no] && s.marks[it.no].mark) || ''] || '-';
export const titleOf = a => a.meta.title || '활동지';

export const tableRows = a => [['번호', ...a.items.map(it => `${it.no}번`), '수준', '잘한 점', '더 해 볼 점'],
  ...graded(a).map(s => [`${s.no}번`, ...a.items.map(it => markOf(s, it)), LEVEL[s.level] || '', s.good || '', s.next || ''])];
export const tableDoc = a => ({ title: `${titleOf(a)} 결과`, blocks: [
  { type: 'h', text: `${titleOf(a)} 결과` },
  { type: 'p', text: [a.meta.subject, a.meta.date, a.meta.pages].filter(Boolean).join(' · ') + ' · ○ 잘함 · △ 조금 더 · × 틀림 · 안 함 빈칸' },
  { type: 'table', head: true, rows: tableRows(a) }] });

/* 학생 피드백 쪽지: 한 쪽에 4명. one이면 번호마다 새 쪽(자르지 않고 나눠 줌) */
export function slipsDoc(a, { one = false } = {}) {
  const blocks = [], per = one ? 1 : 4;
  graded(a).forEach((s, i) => {
    if (i && i % per === 0) blocks.push({ type: 'break' });
    blocks.push({ type: 'h', text: `${s.no}번 · ${titleOf(a)}` });
    blocks.push({ type: 'p', text: a.items.map(it => `${it.no}번 ${markOf(s, it)}`).join('  ') + (s.level ? `  · ${LEVEL[s.level]}` : '') });
    blocks.push({ type: 'p', text: `잘한 점: ${s.good || '-'}` });
    blocks.push({ type: 'p', text: `더 해 볼 점: ${s.next || '-'}` });
  });
  return { title: `${titleOf(a)} 피드백`, blocks };
}
