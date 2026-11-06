/* AI 채점 정확도 (스펙 2026-11-06 C): 칸마다 AI가 처음 매긴 값(ai0)과 지금 값을 견줌. 단원평가는 점수(pts), 활동지는 ○△× 표시(mark).
   맞힌 칸 = 지금 값이 처음 값과 같은 칸(노란 칸을 고치지 않고 확인만 한 것도). 처음 값이 있는 칸만 셈(이 기능 전에 채점한 칸은 없음) */
const UNIT_GROUP = { choice: 'obj', symbol: 'obj', match: 'obj', short: 'short', essay: 'essay' };
const ACT_GROUP = { choice: 'obj', match: 'obj', short: 'short', write: 'essay', draw: 'draw' };
export const GROUP_NAME = { obj: '객관식', short: '단답', essay: '서술형', draw: '그림' };
const ORDER = ['obj', 'short', 'essay', 'draw'];
// 하나라도 고쳤으면 100%로 올려 적지 않음
const pctOf = (ok, n) => (ok === n ? 100 : Math.min(99, Math.round(ok / n * 100)));

/* cells: [{ g: 유형 묶음, same }] → { n, ok, changed, pct, groups: [{ g, n, ok, pct }] }, 칸이 없으면 null */
export function tally(cells) {
  if (!cells.length) return null;
  const by = new Map();
  let ok = 0;
  for (const c of cells) { const v = by.get(c.g) || [0, 0]; v[0]++; if (c.same) { v[1]++; ok++; } by.set(c.g, v); }
  return {
    n: cells.length, ok, changed: cells.length - ok, pct: pctOf(ok, cells.length),
    groups: ORDER.filter(g => by.has(g)).map(g => { const [n, k] = by.get(g); return { g, n, ok: k, pct: pctOf(k, n) }; })
  };
}
const gradedOf = x => ((x && x.students) || []).filter(s => s && !s.skip && s.status === 'done');

export function unitAccuracy(test) {
  const cells = [];
  for (const s of gradedOf(test)) for (const it of test.key.items) {
    const c = s.items && s.items[it.no];
    if (c && c.ai0 != null) cells.push({ g: UNIT_GROUP[it.type] || 'short', same: (Number(c.pts) || 0) === Number(c.ai0) });
  }
  return tally(cells);
}
export function activityAccuracy(a) {
  const cells = [];
  for (const s of gradedOf(a)) for (const it of a.items || []) {
    const c = s.marks && s.marks[it.no];
    if (c && c.ai0 != null) cells.push({ g: ACT_GROUP[it.type] || 'essay', same: String(c.mark || '') === String(c.ai0) });
  }
  return tally(cells);
}

/* 화면 글. finished: 채점을 마침(단원평가 [채점 마치기]·활동지 [확정]) 전이면 「확인 중」, graded: 채점한 학생이 있음(처음 값이 없으면 「기록 없음」) */
export function accuracyText(acc, { finished = false, graded = true } = {}) {
  if (!acc) return graded ? 'AI가 맞힌 칸: 기록 없음' : '';
  if (!finished) return 'AI가 맞힌 칸: 확인 중';
  const groups = acc.groups.length > 1 ? ` (${acc.groups.map(x => `${GROUP_NAME[x.g]} ${x.pct}%`).join(' · ')})` : '';
  return `AI가 맞힌 칸 ${acc.pct}%${groups} · 선생님이 고친 칸 ${acc.changed}개`;
}

/* 올해(학년도 자료) 모아: 목록 요약 [{ done, sample, acc }] 중 마치고 기록이 있는 것의 맞힌 칸 비율 평균. 예시는 진짜 평가가 없을 때만 */
export function yearAccuracy(list) {
  const all = (list || []).filter(s => s && s.done && s.acc && s.acc.n), real = all.filter(s => !s.sample), xs = real.length ? real : all;
  if (!xs.length) return null;
  const sum = xs.reduce((a, s) => a + s.acc.pct, 0);
  return { n: xs.length, avg: xs.every(s => s.acc.pct === 100) ? 100 : Math.min(99, Math.round(sum / xs.length)) };
}
export const yearText = y => (y ? `올해 ${y.n}개 평가 · AI가 맞힌 칸 평균 ${y.avg}%` : '');
