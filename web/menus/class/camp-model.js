/* 학급 › 기초학력 캠프 자료와 계산 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-11-11-basic-skills-camp-design.md
   저장: 학년도 키 camp = { current, camps: [캠프…] } (core/years.js 규칙 — 공통 키가 아니어서 학년도·백업을 따라감).
   학생 이름은 여기에만 저장. AI로 보내는 글에는 toAlias로 학생A·학생B…(캠프 안 차례), 지도교사 이름은 「지도교사」, 그 밖의 이름 모양은 가림.
   2026-11-18 손보기(스펙 2026-11-18-class-fix-design §C): 성 뺀 이름은 앞이 한글이 아니면 뒤에 무엇이 오든 가림(띄어 쓴 이름도), 지도 시간은 줄마다 교시 수,
   날마다 출석은 날짜마다 한 번(같은 날 줄이 여럿이어도), 결과 보고서 빈 칸도 저장(칸마다 id), 결재란은 비운 대로 */
import { get, set } from '../../core/store.js';
import { isDate, addDays, weekday, HOLIDAYS, closedDays } from '../../core/calendar.js';
import { maskPersons } from '../../core/chat-names.js';

export const KEY = 'camp';
export const UNITS = [['period', '교시마다'], ['day', '날마다']];
export const APPROVAL = ['계(담당자)', '교감', '교장'];
export const DOC_IDS = ['confirm', 'attend', 'observe', 'report'];
export const REPORT_KINDS = [['select', '사업선택제 결과 보고서'], ['lead', '이끎교사 운영 보고서'], ['form', '학교 양식 글 머리 따르기']];
export const REPORT_HEADS = { select: ['운영 목적', '운영 내용', '운영 성과'], lead: ['필요성 및 목적', '추진 내용', '결과 및 결론', '일반화 방안'] };
const MARKS = ['O', 'X'];

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, lo, hi) => { const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? +v : v; return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
/* 「9:00」「09:00」 → 「09:00」, 아니면 '' */
export function normTime(v) {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{2})\s*$/.exec(str(v));
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}
const toMin = t => { const n = normTime(t); return n ? +n.slice(0, 2) * 60 + +n.slice(3) : NaN; };
const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/* ---------- 모양 ---------- */
export function newStudent(f = {}) {
  return { id: rid('st'), grade: intIn(f.grade, 1, 6), cls: intIn(f.cls, 1, 30), no: intIn(f.no, 1, 60), name: str(f.name).trim().slice(0, 30) };
}
/* periods: 그 줄의 교시 수(날마다 한 줄에 하루 여러 교시 — 지도 시간에 셈). 없으면 null(rowHours가 셈) */
export function newSession(f = {}) {
  return { id: rid('ss'), date: isDate(f.date) ? f.date : '', start: normTime(f.start), end: normTime(f.end), subject: str(f.subject).trim().slice(0, 30), content: str(f.content).slice(0, 1000), periods: intIn(f.periods, 1, 12) };
}
/* 결과 보고서 칸 { id, head, text } */
export const newSection = (head = '', text = '') => ({ id: rid('rs'), head: str(head).trim().slice(0, 60), text: str(text).slice(0, 6000) });
const normStudent = v => (isObj(v) ? { ...newStudent(v), id: str(v.id) || rid('st') } : null);
const normSession = v => (isObj(v) ? { ...newSession(v), id: str(v.id) || rid('ss') } : null);
const strMap = (v, keep = () => true) => (isObj(v) ? Object.fromEntries(Object.entries(v).filter(([k, t]) => typeof t === 'string' && keep(k))) : {});

/* ---------- 사전·사후 점수 (스펙 2026-11-13-gap-evidence §2-2) ----------
   growth = { 학생 id: { subject, area, pre: { pct, tests: [{ id, title }], date, source }, post: { pct, source: 'auto'|'manual', tests, date } | null } }.
   pre.source: 'auto'(결손 찾기에서 넣음)·'manual'(직접). 점수율은 0~100(소수 한 자리), 아니면 null. 모르는 학생·빈 줄은 버림 */
export function pctIn(v) {
  const n = typeof v === 'string' ? (v.trim() ? Number(v.trim().replace(/\s*%$/, '')) : NaN) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 10) / 10 : null;
}
const normRefs = v => (Array.isArray(v) ? v : []).filter(isObj).map(t => ({ id: str(t.id).trim().slice(0, 40), title: str(t.title).trim().slice(0, 120) })).filter(t => t.id || t.title).slice(0, 60);
function normGrowthEntry(v) {
  if (!isObj(v)) return null;
  const p = isObj(v.pre) ? v.pre : {}, q = isObj(v.post) ? v.post : null, qp = q ? pctIn(q.pct) : null;
  const e = {
    subject: str(v.subject).trim().slice(0, 20), area: str(v.area).trim().slice(0, 60),
    pre: { pct: pctIn(p.pct), tests: normRefs(p.tests), date: isDate(p.date) ? p.date : '', source: p.source === 'auto' ? 'auto' : 'manual' },
    post: qp == null ? null : { pct: qp, source: q.source === 'manual' ? 'manual' : 'auto', tests: normRefs(q.tests), date: isDate(q.date) ? q.date : '' }
  };
  return e.subject || e.area || e.pre.pct != null || e.post ? e : null;
}
/* ids: 프로그램 학생 id(Set) — 뺀 학생의 줄은 버림 */
export function normGrowth(v, ids) {
  const out = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (!ids.has(k)) continue; const e = normGrowthEntry(x); if (e) out[k] = e; }
  return out;
}

/* 보고서 칸: 빈 칸도 남김(내보낼 때만 뺌 — reportSections). id가 없는 예전 칸은 차례로 r0·r1…(읽을 때마다 같은 id라 화면 칸과 맞음), 겹친 id도 고침 */
export const MAX_SECTIONS = 12;
function normSections(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(isObj).slice(0, MAX_SECTIONS).map((s, i) => {
    let id = str(s.id).trim().slice(0, 40);
    if (!id || seen.has(id)) { let k = i; do id = `r${k++}`; while (seen.has(id)); }
    seen.add(id);
    return { id, head: str(s.head).trim().slice(0, 60), text: str(s.text).slice(0, 6000) };
  });
}
/* 내보낼 칸: 글 머리나 글이 있는 칸 */
export const reportSections = camp => camp.report.sections.filter(s => String(s.head || '').trim() || String(s.text || '').trim());

export function normCamp(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  // 결재란: 값이 없던 자료(새 프로그램)만 기본값, 선생님이 비운 것([])은 비운 대로
  const ap = Array.isArray(v.approval) ? v.approval.map(x => str(x).trim().slice(0, 20)).filter(Boolean).slice(0, 6) : null;
  const att = {};
  if (isObj(v.att)) for (const [s, row] of Object.entries(v.att)) {
    if (!isObj(row)) continue;
    const r = Object.fromEntries(Object.entries(row).filter(([, m]) => MARKS.includes(m)));
    if (Object.keys(r).length) att[s] = r;
  }
  const rp = isObj(v.report) ? v.report : {};
  const fm = isObj(v.forms) ? v.forms : {};
  const students = (Array.isArray(v.students) ? v.students : []).map(normStudent).filter(Boolean).slice(0, 60);
  return {
    id: v.id, name: str(v.name).trim().slice(0, 120), teacher: str(v.teacher).trim().slice(0, 30), target: str(v.target).trim().slice(0, 60),
    unit: v.unit === 'day' ? 'day' : 'period',
    subjects: (Array.isArray(v.subjects) ? v.subjects : []).filter(x => typeof x === 'string').map(x => x.trim().slice(0, 20)).filter(Boolean).slice(0, 12),
    approval: ap || [...APPROVAL],
    students,
    sessions: (Array.isArray(v.sessions) ? v.sessions : []).map(normSession).filter(Boolean).slice(0, 400),
    att,
    memo: strMap(v.memo), obs: strMap(v.obs),
    obsEdited: isObj(v.obsEdited) ? Object.fromEntries(Object.entries(v.obsEdited).filter(([, x]) => !!x).map(([k]) => [k, true])) : {},
    report: {
      kind: REPORT_KINDS.some(k => k[0] === rp.kind) ? rp.kind : 'select', prompt: str(rp.prompt).slice(0, 4000), title: str(rp.title).slice(0, 150),
      sections: normSections(rp.sections)
    },
    forms: Object.fromEntries(DOC_IDS.map(d => [d, str(fm[d])])),
    growth: normGrowth(v.growth, new Set(students.map(s => s.id))),
    updatedAt: Number.isFinite(v.updatedAt) ? v.updatedAt : 0
  };
}
export const newCamp = (f = {}) => normCamp({ unit: 'period', ...f, id: rid('cp') });

/* ---------- 저장 (학년도 키 camp) ---------- */
function readAll() {
  const v = get(KEY, null);
  const o = isObj(v) ? v : {};
  return { current: str(o.current), camps: (Array.isArray(o.camps) ? o.camps : []).map(normCamp).filter(Boolean) };
}
export const listCamps = () => readAll().camps;
export const getCamp = id => listCamps().find(c => c.id === id) || null;
/* 같은 id는 바꾸고 없으면 맨 앞에. 저장하지 못하면 null */
export function saveCamp(camp) {
  const c = normCamp(camp);
  if (!c) return null;
  c.updatedAt = Date.now();
  const all = readAll(), i = all.camps.findIndex(x => x.id === c.id);
  if (i >= 0) all.camps[i] = c; else all.camps.unshift(c);
  return set(KEY, all) ? c : null;
}
export function deleteCamp(id) {
  const all = readAll();
  const camps = all.camps.filter(c => c.id !== id);
  return set(KEY, { current: all.current === id ? '' : all.current, camps });
}
export const currentCampId = () => readAll().current;
export const setCurrentCamp = id => { const all = readAll(); return set(KEY, { ...all, current: str(id) }); };

/* ---------- 출석·시간 ---------- */
const isDay = camp => camp.unit === 'day';
/* 그날 학생 표시(날마다 출석 — 그날 줄 가운데 ○가 하나라도 있으면 ○, /만 있으면 /, 없으면 '') */
export function dayMarkOf(camp, date, sid) {
  const ms = camp.sessions.filter(s => s.date === date).map(s => camp.att[s.id] && camp.att[s.id][sid]);
  return ms.includes('O') ? 'O' : ms.includes('X') ? 'X' : '';
}
/* 학생 출석 수: 교시마다는 수업 줄마다, 날마다는 수업 날마다(같은 날 줄이 여럿이어도 한 번, 날짜 없는 줄은 한 날로 셈) */
export function attStats(camp, sid) {
  let present = 0, absent = 0, total;
  if (isDay(camp)) {
    const ds = campDates(camp);
    for (const d of ds) { const m = dayMarkOf(camp, d, sid); if (m === 'O') present++; else if (m === 'X') absent++; }
    total = ds.length + camp.sessions.filter(s => !s.date).length;
  } else {
    for (const s of camp.sessions) { const m = camp.att[s.id] && camp.att[s.id][sid]; if (m === 'O') present++; else if (m === 'X') absent++; }
    total = camp.sessions.length;
  }
  const marked = present + absent;
  return { present, absent, marked, total, rate: marked ? Math.round(present / marked * 100) : null };
}
export const attCount = (camp, sid) => attStats(camp, sid).present;
/* 인수인계서 줄(학생 이름 없음): [프로그램, 기간, 학생 수, 지도 시간, 출석률(체크한 수업 기준)] */
export function handoverRows(camps) {
  const dot = d => (isDate(d) ? `${d.slice(0, 4)}. ${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '');
  return (camps || []).map(c => {
    const ds = campDates(c), st = c.students.map(s => attStats(c, s.id)), p = st.reduce((n, x) => n + x.present, 0), m = st.reduce((n, x) => n + x.marked, 0);
    return [c.name || '기초학력', ds.length ? `${dot(ds[0])} ~ ${dot(ds[ds.length - 1])}` : '', `${c.students.length}명`, `${hoursTotal(c)}시간`, m ? `${Math.round((p / m) * 100)}%` : '체크 전'];
  });
}
/* 줄 하나의 지도 시간(교시 수): 적은 교시 수 → 날마다 줄은 시각으로(한 교시 40분 + 쉬는 10분, 09:00~12:40 → 5) → 1.
   교시마다 줄은 한 줄이 한 교시(스펙 2026-11-11 「지도 시간 = 수업 줄 수」 그대로) */
export function rowHours(camp, s) {
  if (s.periods) return s.periods;
  if (!isDay(camp)) return 1;
  const a = toMin(s.start), b = toMin(s.end);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.max(1, Math.round((b - a + 10) / 50)) : 1;
}
/* 지도 시간: 줄마다 교시 수를 더함(출석 단위를 바꿔도 같은 일정이면 같은 시간) */
export const hoursTotal = camp => camp.sessions.reduce((n, s) => n + rowHours(camp, s), 0);
const key = s => `${s.date || '9999'} ${s.start || '99:99'}`;
export const sortSessions = list => list.map((s, i) => [s, i]).sort((a, b) => (key(a[0]) < key(b[0]) ? -1 : key(a[0]) > key(b[0]) ? 1 : a[1] - b[1])).map(x => x[0]);
export const sessionsOn = (camp, date) => sortSessions(camp.sessions.filter(s => s.date === date));
export const campDates = camp => [...new Set(camp.sessions.map(s => s.date).filter(Boolean))].sort();
/* 줄이 둘 넘는 날 수(날마다 출석인데 같은 날 줄이 여럿 — 합치기를 권함) */
export const sameDateCount = camp => { const n = {}; for (const s of camp.sessions) if (s.date) n[s.date] = (n[s.date] || 0) + 1; return Object.values(n).filter(k => k > 1).length; };
/* 같은 날 줄을 한 줄로(날마다로 바꿀 때): 첫 시작~끝 줄 끝, 교과 묶음, 지도 내용은 「교과: 내용 / …」, 교시 수는 더함.
   출석은 그날 학생마다 ○가 하나라도 있으면 ○, /만 있으면 /. 남는 줄은 그날 첫 줄(id 그대로), 줄 차례는 그대로 */
export function mergeSameDate(camp) {
  const by = new Map();
  for (const s of camp.sessions) if (s.date) { if (!by.has(s.date)) by.set(s.date, []); by.get(s.date).push(s); }
  const att = { ...camp.att }, out = [];
  for (const s of camp.sessions) {
    if (!s.date) { out.push(s); continue; }
    const g = by.get(s.date);
    if (!g) continue; // 이미 합친 날
    by.delete(s.date);
    if (g.length === 1) { out.push(s); continue; }
    const list = sortSessions(g), first = list[0];
    const subs = [...new Set(list.map(x => x.subject).filter(Boolean))], many = subs.length > 1;
    const content = list.map(x => (x.content.trim() && many && x.subject ? `${x.subject}: ${x.content.trim()}` : x.content.trim())).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).join(' / ');
    const row = {};
    for (const st of camp.students) { const m = dayMarkOf(camp, s.date, st.id); if (m) row[st.id] = m; }
    for (const x of list) delete att[x.id];
    if (Object.keys(row).length) att[first.id] = row;
    out.push({ ...first, start: list.map(x => x.start).filter(Boolean).sort()[0] || '', end: list.map(x => x.end).filter(Boolean).sort().at(-1) || '',
      // 지도 내용 한도(1000자)는 newSession과 같게 — 같은 날 줄을 합쳐도 뒤 차시 내용이 잘리지 않게
      subject: subs.join('·').slice(0, 30), content: content.slice(0, 1000), periods: Math.min(12, list.reduce((n, x) => n + rowHours(camp, x), 0)) });
  }
  return { ...camp, sessions: out, att };
}
/* 출석 단위 바꾸기: 교시 수를 적지 않은 줄은 바꾸기 전 셈을 적어 둠(같은 일정이면 지도 시간이 그대로 — 09:00~12:40 날마다 줄은 교시마다로 바꿔도 5시간) */
export function withUnit(camp, unit) {
  const next = { ...camp, unit: unit === 'day' ? 'day' : 'period' };
  return { ...next, sessions: camp.sessions.map(s => { if (s.periods) return s; const a = rowHours(camp, s); return a !== rowHours(next, s) ? { ...s, periods: a } : s; }) };
}
/* 줄들의 출석 체크 지우기 */
export function clearMarks(camp, ids) {
  const att = { ...camp.att };
  for (const id of ids || []) delete att[id];
  return { ...camp, att };
}

/* 칸을 누를 때마다 ○ → / → 빈칸 */
export const nextMark = m => (m === 'O' ? 'X' : m === 'X' ? '' : 'O');
export function setMark(camp, sessionId, sid, mark) {
  const att = { ...camp.att, [sessionId]: { ...(camp.att[sessionId] || {}) } };
  if (MARKS.includes(mark)) att[sessionId][sid] = mark; else delete att[sessionId][sid];
  if (!Object.keys(att[sessionId]).length) delete att[sessionId];
  return { ...camp, att };
}
export function markAll(camp, date) {
  const att = { ...camp.att };
  for (const s of camp.sessions) if (s.date === date) att[s.id] = Object.fromEntries(camp.students.map(st => [st.id, 'O']));
  return { ...camp, att };
}
/* 수업 하나를 학생 모두 표시했는지(○·/ 둘 다 셈). 학생이 없으면 아님 */
export const sessionChecked = (camp, s) => camp.students.length > 0 && camp.students.every(st => MARKS.includes(camp.att[s.id] && camp.att[s.id][st.id]));
/* 그날 표시 안 한 칸 수(날마다는 학생마다 그날 한 칸 — 출석 화면도 하루 한 줄) */
export function remainingOn(camp, date) {
  const l = camp.sessions.filter(s => s.date === date);
  if (!l.length) return 0;
  if (isDay(camp)) return camp.students.filter(st => !dayMarkOf(camp, date, st.id)).length;
  return l.reduce((n, s) => n + camp.students.filter(st => !MARKS.includes(camp.att[s.id] && camp.att[s.id][st.id])).length, 0);
}
/* 그날 수업을 모두 표시한 날(수업 없는 날은 아님) */
export const dayDone = (camp, date) => {
  const l = camp.sessions.filter(s => s.date === date);
  if (!l.length) return false;
  return isDay(camp) ? camp.students.length > 0 && camp.students.every(st => !!dayMarkOf(camp, date, st.id)) : l.every(s => sessionChecked(camp, s));
};
/* 날마다 출석 칸 누르기: 그날 줄 모두에 같은 표시(빈칸이면 지움) */
export const setDayMark = (camp, date, sid, mark) => camp.sessions.filter(s => s.date === date).reduce((c, s) => setMark(c, s.id, sid, mark), camp);
/* [남은 칸 모두 출석]: 그날 빈칸만 ○(표시한 ○·/는 그대로). 날마다는 그날 표시가 없는 학생만(그날 줄 모두에) */
export function markRest(camp, date) {
  const att = { ...camp.att };
  const skip = isDay(camp) ? new Set(camp.students.filter(st => dayMarkOf(camp, date, st.id)).map(st => st.id)) : new Set();
  for (const s of camp.sessions) {
    if (s.date !== date) continue;
    const row = { ...(att[s.id] || {}) };
    for (const st of camp.students) if (!skip.has(st.id) && !MARKS.includes(row[st.id])) row[st.id] = 'O';
    if (Object.keys(row).length) att[s.id] = row;
  }
  return { ...camp, att };
}

/* ---------- 학생A·학생B ---------- */
export const aliasOf = i => (i < 26 ? `학생${String.fromCharCode(65 + i)}` : `학생${i + 1}`);
export const aliasMap = camp => Object.fromEntries(camp.students.map((s, i) => [s.id, aliasOf(i)]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* 이름 견주는 꼴: 띄어쓰기를 뺌(「김 하늘」 → 「김하늘」) */
export const nameKey = n => String(n == null ? '' : n).replace(/\s+/g, '');
// 글자 사이 띄어쓰기도(「김 하늘」「박 솔빛」)
const spacedRe = n => new RegExp([...n].map(reEsc).join('\\s*'), 'g');
const DOUBLE_SURNAME = /^(?:남궁|황보|제갈|선우|독고)/;
/* 성 뺀 이름: 세 글자는 뒤 두 글자, 네 글자는 뒤 세 글자·뒤 두 글자(두 글자 성이면 뒤 두 글자만). 두 글자 이름은 이름 그대로만(성 뺀 한 글자는 낱말을 다 가려서 안 함) */
function givenNames(n) {
  if (!/^[가-힣]{3,4}$/.test(n)) return [];
  if (n.length === 3) return [n.slice(1)];
  return DOUBLE_SURNAME.test(n) ? [n.slice(2)] : [n.slice(1), n.slice(2)];
}
const studentPairs = camp => { const map = aliasMap(camp); return camp.students.map(st => [nameKey(st.name), map[st.id]]).filter(([n]) => n.length >= 2).sort((a, b) => b[0].length - a[0].length); };
/* 성까지 쓴 학생 이름만 학생A로(글자 사이 띄어쓰기도) — 교과·영역 글처럼 낱말을 짐작하지 않을 곳 */
export function aliasFull(text, camp) {
  let s = String(text == null ? '' : text);
  for (const [n, a] of studentPairs(camp)) s = s.replace(spacedRe(n), a);
  return s;
}
/* AI로 보내는 글: 캠프 학생 이름(띄어 쓴 이름도) → 학생A…, 성 뺀 이름은 앞이 한글이 아니면 뒤에 무엇이 붙어도 학생A(「솔빛이에게서」「바다부터」「하늘 덧셈」 —
   낱말을 지나치게 가리는 것이 이름이 새는 것보다 나음, 2026-11-16 선생님과 정함), 지도교사 이름 → 「지도교사」, 그 밖의 이름 모양은 ○○○ */
export function toAlias(text, camp) {
  let s = String(text == null ? '' : text);
  if (!s) return '';
  const pairs = studentPairs(camp);
  for (const [n, a] of pairs) s = s.replace(spacedRe(n), a);
  const given = pairs.flatMap(([n, a]) => givenNames(n).map(g => [g, a])).sort((a, b) => b[0].length - a[0].length);
  for (const [g, a] of given) s = s.replace(new RegExp(`(?<![가-힣])${reEsc(g)}`, 'g'), a);
  const t = nameKey(camp.teacher);
  if (t.length >= 2) s = s.replace(spacedRe(t), '지도교사');
  // 이름 뒤 「이」「은·을·과」를 학생A(에이)에 맞게: 「학생A이가」→「학생A가」, 「학생A이 」→「학생A가 」, 「학생A은」→「학생A는」,
  // 「학생A이었음」→「학생A였음」, 그 밖에 이 뒤에 한글이 오면 이를 뺌(「학생A이에게서」→「학생A에게서」)
  s = s.replace(/(학생[A-Z])이(?=(?:가|는|를|랑|도|의|한테|에게|하고|와|야|네|처럼|보다|만)(?![가-힣]))/g, '$1')
    .replace(/(학생[A-Z])이(?![가-힣])/g, '$1가').replace(/(학생[A-Z])(은|을|과)(?![가-힣])/g, (m, a, j) => a + { 은: '는', 을: '를', 과: '와' }[j])
    .replace(/(학생[A-Z])이었/g, '$1였').replace(/(학생[A-Z])이에요/g, '$1예요').replace(/(학생[A-Z])이(?=[가-힣])/g, '$1');
  return s.split('\n').map(l => maskPersons(l).text).join('\n');
}

/* ---------- 날짜·교시 ---------- */
/* from~to(포함)에서 weekdays(0=일 … 6=토, 기본 월~금)인 날, skipHolidays면 공휴일·학교가 쉬는 날(재량휴업일 등 — calendar closedDays)은 뺌. 400일까지 */
export function expandDates(from, to, { weekdays = [1, 2, 3, 4, 5], skipHolidays = true } = {}) {
  if (!isDate(from) || !isDate(to) || from > to) return [];
  const out = [], closed = skipHolidays ? closedDays() : new Set();
  for (let d = from, n = 0; d <= to && n < 400; d = addDays(d, 1), n++) {
    if (!weekdays.includes(weekday(d))) continue;
    if (skipHolidays && (HOLIDAYS[d] || closed.has(d))) continue;
    out.push(d);
  }
  return out;
}
/* 시작 시각부터 n교시(한 교시 minutes분, 쉬는 시간 rest분). 10교시까지, 자정을 넘기면 없음 */
export function periodSlots(start, n, minutes = 40, rest = 10) {
  const s = toMin(start), k = Math.min(10, Math.max(0, Math.floor(n) || 0)), len = Math.floor(minutes) || 0, gap = Math.max(0, Math.floor(rest) || 0);
  if (!Number.isFinite(s) || len <= 0) return [];
  const out = [];
  for (let i = 0; i < k; i++) {
    const a = s + i * (len + gap), b = a + len;
    if (b >= 24 * 60) return [];
    out.push({ start: fromMin(a), end: fromMin(b) });
  }
  return out;
}

/* ---------- 글 ---------- */
const DAY = '일월화수목금토';
export const fmtDate = d => (isDate(d) ? `${+d.slice(5, 7)}. ${+d.slice(8, 10)}.(${DAY[weekday(d)]})` : '');
export const fmtShort = d => (isDate(d) ? `${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
export const fmtTime = s => (s && s.start ? (s.end ? `${s.start}~${s.end}` : s.start) : '');
export const studentLabel = st => [st.grade && st.cls ? `${st.grade}-${st.cls}` : st.grade ? `${st.grade}학년` : '', st.no ? `${st.no}번` : '', st.name].filter(Boolean).join(' ');
/* 화면·문서의 학생 이름: 이름 → 없으면 「3-2 5번」(단원평가 「도달하지 못한 학생」에서 넣은 학생) → 없으면 dflt */
export const shownName = (st, dflt = '이름 없음') => String(st.name || '').trim() || studentLabel({ ...st, name: '' }) || dflt;
