/* 단원평가 새 화면의 셈 (스펙 2026-11-14-eval-redesign §3·§4, 화면 없음 — Node 시험에서도 씀).
   - 결과 한 화면(unit-results.js): 점수 색(90점 이상 hi · 60점 아래 lo), 평가 카드 이름·날짜, 표 머리 이름, 흐름 선(평가 날짜 차례), 반이 약한 영역 한 줄.
   - 평가 하나(unit-flow-card.js): 다섯 단계 줄 — 계획·문항 → 채점 → 결과 확인 → 보충 → 생활기록부. 평가 한 바퀴 마디(flowSteps)에서:
     grade → 채점, miss → 결과 확인, redo·gap·camp·post → 보충(예시 평가는 redo만 — 결손·기초학력 칸은 예시에서 늘 「예시는 빼요」),
     생활기록부 = 그 교과 평어를 채점한 학생 모두에게 씀(pyDone). 지금 칸 = 안 끝난 첫 칸, 다음 칸 = 그 뒤의 안 끝난 첫 칸.
   - 학생 × 문항 지도(unit-grading.js): 칸 모양(맞음·틀림·부분 점수·아직), 쌤비서가 찾은 것(같은 실수 묶음, missView에서).
   - 채점 확인(unit-confirm.js): 확인할 칸 = 판단을 미룬 칸(flag·확인 전)과 검토 의견이 남은 칸 — 한눈에(eval-stage.js unitNeeds)와 같은 규칙, 점수 단추 */
import { graded, itemName } from './unit-model.js';
import { gradeCell } from './unit-grade.js';

const r1 = x => Math.round(x * 10) / 10;
export const rateText = r => `${Math.round((Number(r) || 0) * 100)}%`;

/* ---------- 결과 한 화면 ---------- */
export const scoreTone = v => (v == null || !Number.isFinite(Number(v)) ? '' : v >= 90 ? 'hi' : v < 60 ? 'lo' : '');
export function dateLabel(d) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(d || ''));
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : '';
}
/* 평가 카드 이름: 「2. 나눗셈」(회차가 2 이상이면 「… 2회」), 단원 이름이 없으면 「3단원」 */
export function cardTitle(m = {}) {
  const no = m.unitNo ? Number(m.unitNo) : null, name = String(m.unitName || '').trim();
  const core = no && name ? `${no}. ${name}` : name || (no ? `${no}단원` : '단원평가');
  return `「${core}」${Number(m.round) > 1 ? ` ${m.round}회` : ''}${m.sample ? ' (예시)' : ''}`;
}
/* 표 머리(짧게): 「국어 1단원」, 2회부터 「국어 2단원 2회」 */
export function colLabel(m = {}) {
  const parts = [m.subject || '', m.unitNo ? `${m.unitNo}단원` : ''].filter(Boolean);
  return (parts.join(' ') || '단원평가') + (Number(m.round) > 1 ? ` ${m.round}회` : '');
}
/* 흐름 선: 값(0~100, 빈칸 null은 뺌)을 차례로 이은 길. 마지막 점 x·y도 → { d, x, y } 또는 null */
export function sparkPath(values, { w = 64, h = 24, pad = 3 } = {}) {
  const vs = (values || []).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
  if (!vs.length) return null;
  const y = v => r1(h - pad - Math.max(0, Math.min(100, v)) / 100 * (h - 2 * pad));
  const x = i => (vs.length === 1 ? r1(w / 2) : r1(pad + i * (w - 2 * pad) / (vs.length - 1)));
  const pts = vs.map((v, i) => [x(i), y(v)]);
  return { d: pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a} ${b}`).join(''), x: pts.at(-1)[0], y: pts.at(-1)[1] };
}
/* 학생 줄(summaryTable rows[]) 칸을 평가 날짜 차례로(같으면 만든 차례) */
export function trendValues(row, tests) {
  const ts = (tests || []).slice().sort((a, b) => String((a.meta && a.meta.date) || '').localeCompare(String((b.meta && b.meta.date) || '')) || (a.createdAt || 0) - (b.createdAt || 0));
  return ts.map(t => (row && row.cells && row.cells[t.id] != null ? row.cells[t.id] : null));
}
/* 반이 약한 영역(domainStats): 가장 낮은 영역과 한 줄 → { low, rate, line } 또는 null */
export function weakAdvice(stats) {
  const list = (stats || []).filter(s => s && Number.isFinite(Number(s.rate)));
  if (!list.length) return null;
  const low = list.reduce((a, b) => (b.rate < a.rate ? b : a));
  const line = low.rate < 0.7
    ? `「${low.name}」 영역은 반 전체가 어려워했어요. 다음 시간 시작에 비슷한 문제 2개를 함께 풀면 좋아요.`
    : `「${low.name}」 영역이 가장 낮아요(${rateText(low.rate)}). 반 전체가 고르게 잘했어요.`;
  return { low: low.name, rate: low.rate, line };
}

/* ---------- 평가 하나: 다섯 단계 줄 ---------- */
const HELP = ['redo', 'gap', 'camp', 'post'];
/* t: 평가, nodes: flowSteps(t, …), pyDone: 그 교과 평어를 채점한 학생 모두에게 씀, pyCount: 그 교과 평어를 쓴 채점한 학생 수
   → [{ id, label, status, done, now, next, go }] — go는 평가 한 바퀴 마디의 갈 곳 그대로(계획·문항은 1단계, 생활기록부는 { to: 'record', subject }) */
export function testSteps(t, nodes = [], { pyDone = false, pyCount = 0 } = {}) {
  const by = Object.fromEntries((nodes || []).map(n => [n.id, n]));
  const items = (t && t.key && Array.isArray(t.key.items)) ? t.key.items.length : 0;
  const m = ((t && t.students) || []).filter(s => s && !s.skip).length, g = graded(t).length;
  const sample = !!(t && t.meta && t.meta.sample);
  const help = HELP.filter(id => by[id] && !(sample && id !== 'redo')).map(id => by[id]);
  const helpLeft = help.find(n => !n.done);
  const grade = by.grade || { done: false, go: { to: 'step', step: 3 } }, miss = by.miss || { done: false, status: '아직', go: { to: 'step', step: 4, card: 'miss' } };
  const list = [
    { id: 'plan', label: '계획·문항', status: items ? `${items}문항` : '아직', done: items > 0, go: { to: 'step', step: 1 } },
    { id: 'grade', label: '채점', status: m ? `${g} / ${m}` : '아직', done: !!grade.done, go: grade.go },
    { id: 'result', label: '결과 확인', status: g ? miss.status || '' : '', done: !!miss.done, go: miss.go },
    { id: 'help', label: '보충', status: !g ? '' : helpLeft ? `${helpLeft.label} · ${helpLeft.status}` : '다 했어요', done: !!help.length && !helpLeft, go: (helpLeft || by.redo || {}).go || { to: 'step', step: 4, card: 'redo' } },
    { id: 'record', label: '생활기록부', status: g && (pyDone || pyCount) ? `평어 ${pyDone ? g : Math.min(pyCount, g)}/${g}명` : '', done: !!pyDone && g > 0, go: { to: 'record', subject: (t && t.meta && t.meta.subject) || '' } }
  ].map(s => ({ ...s, now: false, next: false }));
  const i = list.findIndex(s => !s.done);
  if (i >= 0) { list[i].now = true; const k = list.findIndex((s, j) => j > i && !s.done); if (k >= 0) list[k].next = true; }
  return list;
}

/* ---------- 학생 × 문항 지도 ---------- */
/* 칸 모양: c가 없으면(아직 채점 전) wait, 만점 ok, 0점 no, 그 사이 part */
export function heatTone(it, c) {
  if (!c) return 'wait';
  const full = Number(it && it.points) || 0, pts = Number(c.pts) || 0;
  return pts >= full ? 'ok' : pts <= 0 ? 'no' : 'part';
}
/* 확인할 칸: 판단을 미룬 칸(flag, 확인 전) 또는 검토 의견이 남은 칸(다른 판단, 고르기 전) */
export const needsConfirm = c => !!(c && ((c.flag && !c.ok) || (c.rv && !c.rv.agree && !c.rv.done)));
/* 채점한 학생(「채점 안 함」 뺌)의 확인할 칸: 학생 차례 → 문항 차례 [{ no, item }] */
export function confirmList(t) {
  const items = (t && t.key && Array.isArray(t.key.items)) ? t.key.items : [];
  const out = [];
  for (const s of graded(t)) for (const it of items) if (needsConfirm(s.items && s.items[it.no])) out.push({ no: s.no, item: it.no });
  return out;
}
/* 쌤비서가 찾은 것: 오답 묶음(missView)에서 학생이 많은 묶음부터 n개 — { no(문항), i(그 문항의 몇 번째 묶음), why, nos, line(활동 또는 짐작), name(문항 이름) } */
export function foundGroups(view, n = 3) {
  const all = [];
  for (const v of view || []) {
    (v.groups || []).forEach((g, i) => { if (g && Array.isArray(g.nos) && g.nos.length) all.push({ v, g, i }); });
    // 아직 까닭으로 묶지 않은 학생(AI로 묶기 전 단답·서술형)도 그 문항의 한 묶음으로
    if (Array.isArray(v.pending) && v.pending.length) all.push({ v, g: { why: '까닭을 아직 묶지 않음', nos: v.pending, act: '' }, i: -1, pending: true });
  }
  return all.sort((a, b) => b.g.nos.length - a.g.nos.length || a.v.no - b.v.no || a.i - b.i).slice(0, n)
    .map(({ v, g, i, pending }) => ({ no: v.no, i, why: g.why, nos: g.nos.slice(), line: g.act || (g.guess ? `짐작: ${g.guess}` : ''), name: itemName(v.it), ...(pending ? { pending: true } : {}) }));
}

/* ---------- 채점 확인: 점수 단추 ---------- */
/* 고르기·기호·선 잇기·단답은 맞음·틀림(쌤비서 값이 그 사이면 그것도), 서술형은 만점·쌤비서·검토 AI·반·0점. 겹치지 않게 큰 점수부터.
   ai: 쌤비서가 정한 지금 값, rv: 검토 AI가 낸 값(검토 의견이 남은 칸) */
export function pointChoices(it, c) {
  const full = Number(it && it.points) || 0, pts = Math.max(0, Math.min(full, Number(c && c.pts) || 0));
  const rvPts = c && c.rv && !c.rv.agree && !c.rv.done ? gradeCell(it, c.rv).pts : null;
  const base = it && it.type === 'essay' ? [full, pts, rvPts, Math.round(full / 2), 0] : [full, pts, rvPts, 0];
  const vals = [...new Set(base.filter(v => v != null && Number.isFinite(v)))].sort((a, b) => b - a);
  const label = v => (v >= full ? '맞음' : v <= 0 ? '틀림' : '부분 점수');
  return vals.map(v => ({ pts: v, label: label(v), ai: v === pts, rv: rvPts != null && v === rvPts }));
}
