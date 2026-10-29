/* 학급 자료와 계산 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-10-29-class-menu-design.md
   저장: class:info · class:timetable · class:subjects · class:log · class:weekly:<월요일>. 요일 0=월…4=금, 교시는 1부터 */
import { get, set, remove } from '../../core/store.js';
import { isDate, addDays, weekday, dayIssues } from '../../core/calendar.js';
import { getSchool } from '../../core/settings.js';
import { normName } from './class-import.js';

const str = v => (typeof v === 'string' ? v : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const STATUS = ['done', 'part', 'skip'];
export const NOTE_KEYS = ['events', 'prep', 'homework', 'notice', 'safety'];

/* ---------- 저장 ---------- */
export function getInfo() {
  const v = get('class:info', null);
  return { grade: intIn(v && v.grade, 1, 6), room: intIn(v && v.room, 1, 30) };
}
export const setInfo = v => set('class:info', { grade: intIn(+v.grade, 1, 6), room: intIn(+v.room, 1, 30) });

export function normTimetable(v) {
  const periods = intIn(v && v.periods, 4, 7) || 6;
  const rows = isObj(v) && Array.isArray(v.cells) ? v.cells : [];
  return { periods, cells: Array.from({ length: 5 }, (_, d) => Array.from({ length: periods }, (_, p) => (Array.isArray(rows[d]) ? normName(str(rows[d][p])) : ''))) };
}
export const getTimetable = () => normTimetable(get('class:timetable', null));
export const setTimetable = t => set('class:timetable', normTimetable(t));

function normLesson(l) {
  if (!isObj(l) || !str(l.title).trim()) return null;
  return {
    week: Number.isInteger(l.week) ? l.week : null, period: str(l.period).trim(), from: isDate(l.from) ? l.from : '',
    unit: str(l.unit).trim(), title: str(l.title).trim(), pages: str(l.pages).trim(), memo: str(l.memo).trim()
  };
}
function normSubject(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || !normName(v.name)) return null;
  return {
    id: v.id, name: normName(v.name), start: isDate(v.start) ? v.start : '',
    offset: Number.isInteger(v.offset) ? v.offset : 0,
    total: Number.isInteger(v.total) && v.total >= 0 ? v.total : null,
    lessons: (Array.isArray(v.lessons) ? v.lessons : []).map(normLesson).filter(Boolean)
  };
}
export function listSubjects() {
  const v = get('class:subjects', []);
  return (Array.isArray(v) ? v : []).map(normSubject).filter(Boolean);
}
/* id가 같으면 바꾸고, 없으면 새 id. 저장에 실패하면 null */
export function saveSubject(s) {
  const e = normSubject({ ...s, id: s.id || 'sj' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
  if (!e) return null;
  const list = listSubjects();
  const i = list.findIndex(x => x.id === e.id);
  if (i >= 0) list[i] = e; else list.push(e);
  return set('class:subjects', list) ? e : null;
}
export const removeSubject = id => set('class:subjects', listSubjects().filter(s => s.id !== id));

export function getLog() {
  const v = get('class:log', {});
  const out = {};
  if (!isObj(v)) return out;
  for (const [d, day] of Object.entries(v)) {
    if (!isDate(d) || !isObj(day)) continue;
    const ok = {};
    for (const [p, r] of Object.entries(day)) {
      if (/^[1-7]$/.test(p) && isObj(r) && str(r.subject) && STATUS.includes(r.status)) ok[p] = { subject: r.subject, status: r.status };
    }
    if (Object.keys(ok).length) out[d] = ok;
  }
  return out;
}
/* status가 null이면 그 시간 체크를 지움 */
export function setMark(date, period, subject, status) {
  const log = getLog();
  const day = { ...(log[date] || {}) };
  if (status) day[period] = { subject, status }; else delete day[period];
  if (Object.keys(day).length) log[date] = day; else delete log[date];
  return set('class:log', log);
}

const blankNote = () => ({ events: '', prep: '', homework: '', notice: '', safety: '' });
export function normWeekly(v) {
  const w = isObj(v) ? v : {};
  const cells = {};
  if (isObj(w.cells)) for (const [k, t] of Object.entries(w.cells)) if (/^[0-4]-[1-7]$/.test(k) && typeof t === 'string') cells[k] = t;
  const notes = {};
  for (let d = 0; d < 5; d++) {
    const n = isObj(w.notes) && isObj(w.notes[d]) ? w.notes[d] : {};
    notes[d] = Object.fromEntries(NOTE_KEYS.map(k => [k, str(n[k])]));
  }
  return { title: str(w.title), cells, notes };
}
export const getWeekly = monday => normWeekly(get('class:weekly:' + monday, null));
export const saveWeekly = (monday, w) => set('class:weekly:' + monday, normWeekly(w));
export const clearWeekly = monday => remove('class:weekly:' + monday);

/* ---------- 날짜 ---------- */
const pad = n => String(n).padStart(2, '0');
export function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export const mondayOf = date => addDays(date, -((weekday(date) + 6) % 7));
const DAY = '일월화수목금토';
export const fmtDay = d => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일 (${DAY[weekday(d)]})`;
export const fmtShort = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${DAY[weekday(d)]})`;

/* 수업이 없는 까닭(주말·공휴일·방학·재량휴업일). 수업이 있으면 '' — 학사일정은 넘기지 않음 */
export const noClass = (date, breaks) => dayIssues(date, { breaks })[0] || '';

/* ---------- 교과 이름 맞추기 ---------- */
const alias = s => (s === '창의적체험활동' ? '창체' : s);
const base = s => alias(normName(s).replace(/\(.*$/, ''));
export function sameSubject(a, b) {
  const x = alias(normName(a)), y = alias(normName(b));
  if (!x || !y) return false;
  return x === y || (!!base(a) && base(a) === base(b));
}
export function findSubject(subjects, name) {
  const n = alias(normName(name));
  if (!n) return null;
  return subjects.find(s => alias(s.name) === n) || subjects.find(s => sameSubject(s.name, name)) || null;
}

/* ---------- 차시 배정 ---------- */
export const makeCtx = (t = today()) => ({ tt: getTimetable(), subjects: listSubjects(), log: getLog(), breaks: getSchool().breaks, today: t });

export function slotsOn(ctx, date) {
  if (noClass(date, ctx.breaks)) return [];
  const row = ctx.tt.cells[weekday(date) - 1] || [];
  return row.map((subject, i) => ({ period: i + 1, subject })).filter(s => s.subject);
}

/* 시간표·기록의 교과 이름이 이 교과인지 (목록에 없는 교과면 이름으로만) */
function isOf(ctx, name, sub) {
  if (!ctx.subjects.some(s => s.id === sub.id)) return sameSubject(name, sub.name);
  const f = findSubject(ctx.subjects, name);
  return !!f && f.id === sub.id;
}
const before = (d1, p1, d2, p2) => d1 < d2 || (d1 === d2 && p1 < p2);
function records(ctx, sub) {
  const out = [];
  for (const [date, day] of Object.entries(ctx.log)) {
    for (const [p, r] of Object.entries(day)) if (isOf(ctx, r.subject, sub)) out.push({ date, period: +p, status: r.status });
  }
  return out;
}
const logged = (ctx, date, period) => !!(ctx.log[date] && ctx.log[date][period]);
const MAX_AHEAD = 200;

/* 그 시간의 차시 순번(0부터): 보정값 + 앞선 「완료」 수 + 오늘부터 그 시간 전까지 기록 없는 이 교과 시간 수(매시간 한 차시로 예상) */
export function lessonAt(ctx, sub, date, period) {
  let n = sub.offset + records(ctx, sub).filter(r => r.status === 'done' && before(r.date, r.period, date, period)).length;
  if (date >= ctx.today) {
    let d = ctx.today;
    for (let i = 0; i <= MAX_AHEAD && d <= date; i++, d = addDays(d, 1)) {
      for (const s of slotsOn(ctx, d)) {
        if (d === date && s.period >= period) break;
        if (!logged(ctx, d, s.period) && isOf(ctx, s.subject, sub)) n++;
      }
    }
  }
  return n;
}

export function dayView(ctx, date) {
  const off = noClass(date, ctx.breaks);
  const slots = off ? [] : slotsOn(ctx, date).map(s => {
    const rec = ctx.log[date] && ctx.log[date][s.period];
    const status = rec && sameSubject(rec.subject, s.subject) ? rec.status : null;
    const sub = findSubject(ctx.subjects, s.subject);
    if (!sub) return { ...s, sub: null, index: null, lesson: null, finished: false, status };
    const index = Math.max(0, lessonAt(ctx, sub, date, s.period));
    return { ...s, sub, index, lesson: sub.lessons[index] || null, finished: index >= sub.lessons.length, status };
  });
  return { date, off, slots };
}

/* 시수(스펙 3.5) */
export function hours(ctx, sub) {
  const plan = sub.lessons.length;
  const done = Math.max(0, sub.offset) + records(ctx, sub).filter(r => r.status !== 'skip').length;
  return { plan, done, left: Math.max(0, plan - done) };
}

/* 다음에 할 차시를 n(1부터)으로: 기록은 두고 보정값만 */
export const setNext = (ctx, sub, n) => ({ ...sub, offset: n - 1 - records(ctx, sub).filter(r => r.status === 'done').length });
