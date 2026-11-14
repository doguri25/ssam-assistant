/* 활동지 한눈에(스펙 2026-11-14-eval-redesign §5)와 채점 확인(§4)의 셈 — 화면 없음(Node 시험에서도 씀). 학생은 번호만.
   - 학생 카드: 채점한 학생마다 번호·수준·한 줄(잘한 점 또는 더 해 볼 점)·문항 칸 표시·확인할 칸(선생님 차례)
   - 숫자 타일·거르기: 전체 · 잘함 · 보통 · 더 도와줄(노력) · 선생님 차례
   - 반 전체로 보면: ×·안 함이 많은 문항(markCounts) 2~3개와 수준 나눔
   - 확인할 칸 차례: 쌤비서가 판단을 미룬 칸(chk)과 검토 AI 의견(rv)이 남은 칸 */
import { markCounts } from './activity-model.js';

export const FILTERS = [['all', '전체'], ['good', '잘함'], ['ok', '보통'], ['try', '더 도와줄'], ['turn', '선생님 차례']];
const LEVELS = ['good', 'ok', 'try'];
const live = a => (a && Array.isArray(a.students) ? a.students : []).filter(s => s && !s.skip);
const graded = a => live(a).filter(s => s.status === 'done');
const items = a => (a && Array.isArray(a.items) ? a.items : []);
const cellOf = (s, no) => (s && s.marks && s.marks[no]) || null;

/* 선생님이 볼 칸: 판단을 미룬 칸(노란 칸) 또는 검토 AI가 다르게 본 칸(정하면 둘 다 지워짐) */
export const needsLook = c => !!(c && (c.chk || c.rv));
/* 카드 한 줄: 더 도와줄 학생은 더 해 볼 점, 다른 학생은 잘한 점(비었으면 다른 쪽) */
export const cardLine = s => String((s.level === 'try' ? (s.next || s.good) : (s.good || s.next)) || '');

export function galleryCards(a) {
  return graded(a).map(s => ({
    no: s.no,
    level: LEVELS.includes(s.level) ? s.level : '',
    line: cardLine(s),
    turn: items(a).filter(it => needsLook(cellOf(s, it.no))).map(it => it.no),
    marks: items(a).map(it => { const c = cellOf(s, it.no) || {}; return { no: it.no, mark: c.mark || '', look: needsLook(c) }; })
  }));
}
export function tileCounts(cards) {
  const n = f => cards.filter(f).length;
  return { all: cards.length, good: n(c => c.level === 'good'), ok: n(c => c.level === 'ok'), try: n(c => c.level === 'try'), turn: n(c => c.turn.length > 0) };
}
export function filterCards(cards, f) {
  if (f === 'turn') return cards.filter(c => c.turn.length > 0);
  if (LEVELS.includes(f)) return cards.filter(c => c.level === f);
  return cards;
}

/* 문항별 ○·△·×·안 함(채점한 학생만): × 많은 것, 안 함 많은 것, △ 많은 것, 번호 차례 */
export function statsOrder(a) {
  const c = markCounts(a);
  return items(a).map(it => ({ it, o: 0, t: 0, x: 0, n: 0, ...c[it.no] })).sort((p, q) => (q.x - p.x) || (q.n - p.n) || (q.t - p.t) || (p.it.no - q.it.no));
}
/* 많이 놓친 문항(×·안 함·△가 하나라도 있는 것만) */
export const topMissed = (a, k = 3) => statsOrder(a).filter(r => r.x + r.n + r.t > 0).slice(0, k);
export function levelSplit(a) {
  const out = { good: 0, ok: 0, try: 0, none: 0 };
  for (const s of graded(a)) out[LEVELS.includes(s.level) ? s.level : 'none']++;
  return out;
}

/* 확인할 칸 차례: 「채점 안 함」이 아닌 학생(학생 차례) × 문항(번호 차례). 한눈에의 확인 수(activityPending)와 같은 학생을 셈 */
export function reviewQueue(a) {
  const out = [];
  for (const s of live(a)) for (const it of items(a)) if (needsLook(cellOf(s, it.no))) out.push({ no: s.no, item: it.no });
  return out;
}
/* open[i]: i번째 칸을 아직 안 정함. from 다음부터 찾고 끝이면 앞으로 돌아감(from 자신은 맨 나중). 모두 정했으면 -1 */
export function nextOpen(open, from) {
  const n = open.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (open[i]) return i; }
  return -1;
}
