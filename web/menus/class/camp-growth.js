/* 기초학력 사전·사후 점수 (스펙 2026-11-13-gap-evidence §2-2, 화면 없음 — Node 시험에서도 씀).
   저장 모양은 camp-model.js normGrowth. 학생은 번호(no)로만 단원평가와 맞춤 — 이름은 이 기기에만, AI 글에는 학생A·학생B.
   - addGapStudents: 단원평가 「도달하지 못한 학생」(unit-gap.js gapStudents)을 프로그램에 넣음(학급 학년·반·번호, 이름 빈칸, 같은 학생은 겹치지 않음) + 사전 점수
   - applyAutoPost: 사후 자동 = 첫 수업 날(없으면 학생을 넣은 날) 뒤에 본 같은 교과 단원평가의 같은 영역 점수율, 여러 개면 가장 최근 것.
     직접 넣은 사후(source 'manual')는 덮지 않음. 다른 반 학생과 번호가 헷갈리지 않게 결손 찾기에서 넣은 학생이나 학급 학년·반이 같은 학생만
   - setGrowth: 칸 직접 고치기(사전·사후 숫자는 'manual', 사후를 비우면 다시 자동)
   - growthLines(보고서 AI 줄, 학생A) · growthRows(결과 보고서 표, 이름 그대로) */
import { newStudent, normCamp, aliasMap, campDates, studentLabel, pctIn } from './camp-model.js';
import { areaPct } from '../evaluate/unit/unit-gap.js';
import { makeTitle } from '../evaluate/unit/unit-model.js';

const r1 = x => Math.round(x * 10) / 10;
const num = n => String(r1(n));
const flat = s => String(s || '').replace(/\s+/g, '').replace(/과$/, '');
const blank = () => ({ subject: '', area: '', pre: { pct: null, tests: [], date: '', source: 'manual' }, post: null });

/* ---------- 넣기 ---------- */
/* 결손 찾기 한 줄 → 사전 점수: 가장 낮은 영역(같은 점수·같은 교과 문항 영역이면 함께 「도형·측정」 — 영역이 없는 평가(평가 이름이 영역)는
   합치면 그 단원 재평가와 맞지 않으므로 첫 것만), 쓴 평가 id·이름, 날짜(넣은 날 — 사후는 이 날 뒤 평가에서) */
export function preFromGap(g, { titles = {}, date = '' } = {}) {
  const a0 = g.areas[0], low = a0.byTitle ? [a0] : g.areas.filter(a => a.pct === a0.pct && a.subject === a0.subject && !a.byTitle);
  const ids = [...new Set(low.flatMap(a => a.tests || []))];
  return { subject: a0.subject || '', area: low.map(a => a.name).join('·'), pre: { pct: a0.pct, tests: ids.map(id => ({ id, title: titles[id] || '' })), date, source: 'auto' }, post: null };
}
const sameNull = (a, b) => (a == null ? null : a) === (b == null ? null : b);
/* gaps: gapStudents 줄(고른 학생). grade·cls: 학급 정보. 같은 학년·반·번호 학생이 있으면 그 학생을 쓰고, 이미 적은 사전 점수는 그대로.
   → { camp(정리한 새 프로그램), added(새로 넣은 학생 수), existed(있던 학생 수), over(60명이 넘어 못 넣은 수) } */
export function addGapStudents(camp, gaps, { grade = null, cls = null, date = '', titles = {} } = {}) {
  const c = { ...camp, students: [...camp.students], growth: { ...(camp.growth || {}) } };
  let added = 0, existed = 0, over = 0;
  for (const g of gaps || []) {
    if (!g || !g.areas || !g.areas.length) continue;
    // 같은 학년·반·번호, 또는 학년·반을 비워 둔 같은 번호 학생(직접 넣은 학생 — 겹쳐 넣지 않게)
    let st = c.students.find(s => s.no === g.no && ((sameNull(s.grade, grade) && sameNull(s.cls, cls)) || (s.grade == null && s.cls == null)));
    if (st) existed++;
    else if (c.students.length >= 60) { over++; continue; }
    else { st = newStudent({ grade, cls, no: g.no, name: '' }); c.students.push(st); added++; }
    const e = c.growth[st.id];
    // 빈 줄일 때만 채움: 선생님이 적은 교과·영역·점수는 그대로
    if (!e || (!String(e.subject || '').trim() && !String(e.area || '').trim() && e.pre.pct == null)) c.growth[st.id] = { ...preFromGap(g, { titles, date }), post: e ? e.post : null };
  }
  return { camp: normCamp(c), added, existed, over };
}

/* ---------- 사후 자동 ---------- */
/* 사후 점수를 찾기 시작하는 날(이 날 뒤): 첫 수업 날과 결손 찾기로 넣은 날 가운데 늦은 날(넣기 전 평가는 사전 기간 — 사전 평가 목록이 잘려도
   사후로 잡히지 않게), 수업 날이 없으면 넣은 날(사전 날짜) */
export function growthSince(camp, e) {
  const first = campDates(camp)[0] || '', pre = (e && e.pre) || {}, added = pre.source === 'auto' ? pre.date || '' : '';
  return [first, added].filter(Boolean).sort().pop() || pre.date || '';
}
/* 학생 st(번호)의 사후 자동 점수 { pct, source: 'auto', tests: [{ id, title }], date } 또는 null. 사전에 쓴 평가는 뺌 */
export function autoPost(e, st, tests, since) {
  if (!e || !st || !st.no || !since || !String(e.area || '').trim() || !flat(e.subject)) return null;
  const used = new Set(((e.pre && e.pre.tests) || []).map(t => t.id));
  let best = null;
  for (const t of tests || []) {
    if (!t || !t.meta || used.has(t.id) || flat(t.meta.subject) !== flat(e.subject)) continue;
    const d = String(t.meta.date || '');
    if (!(d > since)) continue;
    const pct = areaPct(t, st.no, e.area);
    if (pct == null) continue;
    const at = Number(t.createdAt) || 0;
    if (!best || d > best.date || (d === best.date && at > best.at)) best = { pct, date: d, at, id: t.id, title: makeTitle(t.meta) };
  }
  return best ? { pct: best.pct, source: 'auto', tests: [{ id: best.id, title: best.title }], date: best.date } : null;
}
/* 이 학생 번호가 우리 반 단원평가 번호인지: 결손 찾기에서 넣었거나(사전 평가가 있음) 학급 학년·반이 같음 */
const ours = (e, st, info) => (e.pre.tests.length > 0) || !!(info && info.grade && info.room && st.grade === info.grade && st.cls === info.room);
/* tests: 다 채점한 단원평가, info: 학급 정보 { grade, room } → { camp, changed } (바뀌지 않으면 같은 camp) */
export function applyAutoPost(camp, tests, { info = null } = {}) {
  const growth = { ...(camp.growth || {}) };
  let changed = false;
  for (const st of camp.students) {
    const e = growth[st.id];
    if (!e || (e.post && e.post.source === 'manual')) continue;
    const next = ours(e, st, info) ? autoPost(e, st, tests, growthSince(camp, e)) : null;
    if (JSON.stringify(next) !== JSON.stringify(e.post || null)) { growth[st.id] = { ...e, post: next }; changed = true; }
  }
  return changed ? { camp: { ...camp, growth }, changed } : { camp, changed };
}

/* ---------- 직접 고치기 ---------- */
/* k: subject·area(글) · pre·post(숫자, 「78%」도). 빈 사후 → 다시 자동(null). 숫자가 아니거나 0~100 밖이면 그대로. 바뀌지 않으면 같은 camp */
export function setGrowth(camp, sid, k, value, { date = '' } = {}) {
  if (!camp.students.some(s => s.id === sid) || !['subject', 'area', 'pre', 'post'].includes(k)) return camp;
  const old = camp.growth[sid] || blank(), v = String(value == null ? '' : value);
  let e;
  if (k === 'subject' || k === 'area') e = { ...old, [k]: v.slice(0, k === 'subject' ? 20 : 60) };
  else {
    const empty = !v.trim(), pct = pctIn(v);
    if (!empty && pct == null) return camp;
    if (k === 'pre') e = { ...old, pre: { ...old.pre, pct: empty ? null : pct, source: 'manual', date: old.pre.date || date } };
    else e = { ...old, post: empty ? null : { pct, source: 'manual', tests: [], date } };
  }
  return { ...camp, growth: { ...camp.growth, [sid]: e } };
}

/* ---------- 글 ---------- */
export const fmtPct = n => (n == null ? '' : `${num(n)}%`);
/* 변화(점): 사전·사후가 다 있을 때만 */
export const growthChange = e => (e && e.pre && e.pre.pct != null && e.post && e.post.pct != null ? r1(e.post.pct - e.pre.pct) : null);
/* 오르면 ▲ +n점 · 내리면 ▼ -n점 · 같으면 0점(색만으로 뜻을 나르지 않게 기호도) */
export const changeText = d => (d == null ? '' : d > 0 ? `▲ +${num(d)}점` : d < 0 ? `▼ ${num(d)}점` : '0점');
const has = e => !!e && (e.pre.pct != null || !!e.post);
const whatOf = e => [e.subject, e.area].map(s => String(s || '').trim()).filter(Boolean).join(' ');
/* 보고서 AI 줄: 「학생A · 수학 수와 연산 45% → 78%(+33)」(학생 차례, 이름 없음) */
export function growthLines(camp) {
  const al = aliasMap(camp);
  return camp.students.map(st => {
    const e = camp.growth[st.id];
    if (!has(e)) return '';
    // 교과·영역 글은 이름 짐작(「도형」→ 학생A)을 하지 않고, 성까지 쓴 학생 이름만 학생A로
    const what = camp.students.reduce((w, s) => { const n = String(s.name || '').trim(); return n.length >= 2 ? w.split(n).join(al[s.id]) : w; }, whatOf(e)), d = growthChange(e);
    return `${al[st.id]} · ${what ? `${what} ` : ''}${e.pre.pct != null ? fmtPct(e.pre.pct) : '사전 점수 없음'} → ${e.post ? fmtPct(e.post.pct) : '사후 점수 없음'}${d == null ? '' : `(${d > 0 ? '+' : ''}${num(d)})`}`;
  }).filter(Boolean);
}
/* 결과 보고서 「사전·사후 성취」 표(이 기기에서 만드는 문서라 이름 그대로, 이름이 없으면 「3-2 5번」) → { head, rows } 또는 null */
export function growthRows(camp) {
  const rows = camp.students.filter(st => has(camp.growth[st.id])).map(st => {
    const e = camp.growth[st.id];
    return [st.name || studentLabel(st) || '학생', whatOf(e), fmtPct(e.pre.pct) || '—', e.post ? fmtPct(e.post.pct) : '—', changeText(growthChange(e)) || '—'];
  });
  return rows.length ? { head: ['학생', '교과·영역', '사전', '사후', '변화'], rows } : null;
}
