/* 학급 › 기초학력 캠프 자료와 계산 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-11-11-basic-skills-camp-design.md
   저장: 학년도 키 camp = { current, camps: [캠프…] } (core/years.js 규칙 — 공통 키가 아니어서 학년도·백업을 따라감).
   학생 이름은 여기에만 저장. AI로 보내는 글에는 toAlias로 학생A·학생B…(캠프 안 차례), 지도교사 이름은 「지도교사」, 그 밖의 이름 모양은 가림 */
import { get, set } from '../../core/store.js';
import { isDate, addDays, weekday, HOLIDAYS } from '../../core/calendar.js';
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
export function newSession(f = {}) {
  return { id: rid('ss'), date: isDate(f.date) ? f.date : '', start: normTime(f.start), end: normTime(f.end), subject: str(f.subject).trim().slice(0, 30), content: str(f.content).slice(0, 300) };
}
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

export function normCamp(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const ap = Array.isArray(v.approval) ? v.approval.map(x => str(x).trim().slice(0, 20)).filter(Boolean).slice(0, 6) : [];
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
    approval: ap.length ? ap : [...APPROVAL],
    students,
    sessions: (Array.isArray(v.sessions) ? v.sessions : []).map(normSession).filter(Boolean).slice(0, 400),
    att,
    memo: strMap(v.memo), obs: strMap(v.obs),
    obsEdited: isObj(v.obsEdited) ? Object.fromEntries(Object.entries(v.obsEdited).filter(([, x]) => !!x).map(([k]) => [k, true])) : {},
    report: {
      kind: REPORT_KINDS.some(k => k[0] === rp.kind) ? rp.kind : 'select', prompt: str(rp.prompt).slice(0, 4000), title: str(rp.title).slice(0, 150),
      sections: (Array.isArray(rp.sections) ? rp.sections : []).filter(isObj).map(s => ({ head: str(s.head).trim().slice(0, 60), text: str(s.text).slice(0, 6000) })).filter(s => s.head || s.text.trim()).slice(0, 12)
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
export function attStats(camp, sid) {
  let present = 0, absent = 0;
  for (const s of camp.sessions) { const m = camp.att[s.id] && camp.att[s.id][sid]; if (m === 'O') present++; else if (m === 'X') absent++; }
  const marked = present + absent;
  return { present, absent, marked, total: camp.sessions.length, rate: marked ? Math.round(present / marked * 100) : null };
}
export const attCount = (camp, sid) => attStats(camp, sid).present;
/* 지도 시간: 수업 줄 수(스펙) */
export const hoursTotal = camp => camp.sessions.length;
const key = s => `${s.date || '9999'} ${s.start || '99:99'}`;
export const sortSessions = list => list.map((s, i) => [s, i]).sort((a, b) => (key(a[0]) < key(b[0]) ? -1 : key(a[0]) > key(b[0]) ? 1 : a[1] - b[1])).map(x => x[0]);
export const sessionsOn = (camp, date) => sortSessions(camp.sessions.filter(s => s.date === date));
export const campDates = camp => [...new Set(camp.sessions.map(s => s.date).filter(Boolean))].sort();

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
/* 그날 표시 안 한 칸 수 */
export const remainingOn = (camp, date) => camp.sessions.filter(s => s.date === date).reduce((n, s) => n + camp.students.filter(st => !MARKS.includes(camp.att[s.id] && camp.att[s.id][st.id])).length, 0);
/* 그날 수업을 모두 표시한 날(수업 없는 날은 아님) */
export const dayDone = (camp, date) => { const l = camp.sessions.filter(s => s.date === date); return l.length > 0 && l.every(s => sessionChecked(camp, s)); };
/* [남은 칸 모두 출석]: 그날 빈칸만 ○(표시한 ○·/는 그대로) */
export function markRest(camp, date) {
  const att = { ...camp.att };
  for (const s of camp.sessions) {
    if (s.date !== date) continue;
    const row = { ...(att[s.id] || {}) };
    for (const st of camp.students) if (!MARKS.includes(row[st.id])) row[st.id] = 'O';
    if (Object.keys(row).length) att[s.id] = row;
  }
  return { ...camp, att };
}

/* ---------- 학생A·학생B ---------- */
export const aliasOf = i => (i < 26 ? `학생${String.fromCharCode(65 + i)}` : `학생${i + 1}`);
export const aliasMap = camp => Object.fromEntries(camp.students.map((s, i) => [s.id, aliasOf(i)]));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 성 뺀 이름 뒤에 붙는 말(「하늘이가」「바다는」「하늘이와」)
const TAIL = '(?:이)?(?:가|는|를|랑|도|의|한테|에게|하고|와|과|은|을|이|야|아|네|처럼|보다|만)?(?![가-힣])';
/* AI로 보내는 글: 캠프 학생 이름(성 뺀 이름도) → 학생A…, 지도교사 이름 → 「지도교사」, 그 밖의 이름 모양은 ○○○ */
export function toAlias(text, camp) {
  let s = String(text == null ? '' : text);
  if (!s) return '';
  const map = aliasMap(camp);
  const pairs = camp.students.map(st => [st.name.trim(), map[st.id]]).filter(([n]) => n.length >= 2).sort((a, b) => b[0].length - a[0].length);
  for (const [n, a] of pairs) s = s.split(n).join(a);
  for (const [n, a] of pairs) {
    if (!/^[가-힣]{3}$/.test(n)) continue;
    s = s.replace(new RegExp(`(^|[^가-힣])${reEsc(n.slice(1))}(?=${TAIL})`, 'g'), `$1${a}`);
  }
  const t = (camp.teacher || '').trim();
  if (t.length >= 2) s = s.split(t).join('지도교사');
  // 이름 뒤 「이」「은·을·과」를 학생A(에이)에 맞게: 「학생A이가」→「학생A가」, 「학생A이 」→「학생A가 」, 「학생A은」→「학생A는」
  s = s.replace(/(학생[A-Z])이(?=(?:가|는|를|랑|도|의|한테|에게|하고|와|야|네|처럼|보다|만)(?![가-힣]))/g, '$1')
    .replace(/(학생[A-Z])이(?![가-힣])/g, '$1가').replace(/(학생[A-Z])(은|을|과)(?![가-힣])/g, (m, a, j) => a + { 은: '는', 을: '를', 과: '와' }[j]);
  return s.split('\n').map(l => maskPersons(l).text).join('\n');
}

/* ---------- 날짜·교시 ---------- */
/* from~to(포함)에서 weekdays(0=일 … 6=토, 기본 월~금)인 날, skipHolidays면 공휴일은 뺌. 400일까지 */
export function expandDates(from, to, { weekdays = [1, 2, 3, 4, 5], skipHolidays = true } = {}) {
  if (!isDate(from) || !isDate(to) || from > to) return [];
  const out = [];
  for (let d = from, n = 0; d <= to && n < 400; d = addDays(d, 1), n++) {
    if (!weekdays.includes(weekday(d))) continue;
    if (skipHolidays && HOLIDAYS[d]) continue;
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
