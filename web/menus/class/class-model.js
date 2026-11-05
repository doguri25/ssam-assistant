/* 학급 자료와 계산 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-10-29-class-menu-design.md
   저장: class:info · class:timetable · class:subjects · class:log · class:weekly:<월요일>. 요일 0=월…4=금, 교시는 1부터 */
import { get, set, remove, list } from '../../core/store.js';
import { isDate, addDays, weekday, dayIssues } from '../../core/calendar.js';
import { getSchool } from '../../core/settings.js';
import { normName, periodStart } from './class-import.js';

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

/* 칸은 늘 7교시까지 저장(교시 수를 줄였다가 늘려도 남게), 보이는 줄은 periods */
export function normTimetable(v) {
  const periods = intIn(v && v.periods, 4, 7) || 6;
  const rows = isObj(v) && Array.isArray(v.cells) ? v.cells : [];
  return { periods, cells: Array.from({ length: 5 }, (_, d) => Array.from({ length: 7 }, (_, p) => (Array.isArray(rows[d]) ? normName(str(rows[d][p])) : ''))) };
}
export const getTimetable = () => normTimetable(get('class:timetable', null));
export const setTimetable = t => set('class:timetable', normTimetable(t));

/* 진도표의 단원 안 차시 「5/14」 (없으면 '') */
const noOf = v => { const t = str(v).replace(/\s+/g, ''); return /^\d+\/\d+$/.test(t) ? t : ''; };
function normLesson(l) {
  if (!isObj(l) || !str(l.title).trim()) return null;
  return {
    week: Number.isInteger(l.week) ? l.week : null, period: str(l.period).trim(), from: isDate(l.from) ? l.from : '',
    unit: str(l.unit).trim(), title: str(l.title).trim(), no: noOf(l.no), pages: str(l.pages).trim(), memo: str(l.memo).trim()
  };
}
function normSubject(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || !normName(v.name)) return null;
  return {
    id: v.id, name: normName(v.name), start: isDate(v.start) ? v.start : '',
    // since: 이 날 앞의 체크 기록은 이 진도표에 세지 않음(다음 학기 진도표로 바꾼 교과)
    ...(isDate(v.since) ? { since: v.since } : {}),
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
export const setSubjects = subs => set('class:subjects', (subs || []).map(normSubject).filter(Boolean));
/* 체크 기록과 주간학습안내를 모두 지움(예시로 바꿀 때) */
export function resetRecords() {
  remove('class:log');
  for (const k of list('class:weekly:')) remove(k);
}

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
    // 학사일정 칸: null = 그 주 학사일정을 자동으로, 글('' 포함) = 고쳐 쓴 것
    notes[d] = Object.fromEntries(NOTE_KEYS.map(k => [k, k === 'events' ? (typeof n.events === 'string' ? n.events : null) : str(n[k])]));
  }
  // 검토 AI 의견: [{ key: 요일 '0'~'4', field, problem, fix, done? }]
  const rv = (Array.isArray(w.rv) ? w.rv : []).filter(x => isObj(x) && /^[0-4]$/.test(String(x.key)) && ['prep', 'safety', 'homework', 'notice'].includes(x.field) && str(x.problem) && typeof x.fix === 'string')
    .map(x => ({ key: String(x.key), field: x.field, problem: str(x.problem).slice(0, 120), fix: x.fix.slice(0, 600), ...(x.done === 'review' || x.done === 'main' ? { done: x.done } : {}) }));
  return { title: str(w.title), cells, notes, rv };
}
export const getWeekly = monday => normWeekly(get('class:weekly:' + monday, null));
/* 한 번만: 지난 버전은 손대지 않은 학사일정 칸을 ''로 저장했음 → 「자동」(null)으로 */
export function migrateWeeklyEvents() {
  if (get('mig:weeklyEvents', null)) return;
  for (const k of list('class:weekly:')) {
    const v = get(k, null);
    if (!isObj(v) || !isObj(v.notes)) continue;
    const notes = {};
    for (const [d, n] of Object.entries(v.notes)) notes[d] = isObj(n) && n.events === '' ? { ...n, events: null } : n;
    set(k, { ...v, notes });
  }
  set('mig:weeklyEvents', 1);
}
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
  const row = (ctx.tt.cells[weekday(date) - 1] || []).slice(0, ctx.tt.periods);
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
    if (sub.since && date < sub.since) continue;
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

/* 단원 안 몇 번째 차시인지: 진도표의 차시 칸, 없으면 같은 단원이 이어지는 줄에서 셈 */
export function unitPos(sub, i) {
  const l = sub.lessons[i];
  const m = /^(\d+)\/(\d+)$/.exec((l && l.no) || '');
  if (m) return { n: +m[1], of: +m[2] };
  let a = i, b = i;
  while (a > 0 && sub.lessons[a - 1].unit === l.unit) a--;
  while (b < sub.lessons.length - 1 && sub.lessons[b + 1].unit === l.unit) b++;
  return { n: i - a + 1, of: b - a + 1 };
}

/* 보이는 교시(periods) 안에 수업이 하나라도 있으면 시간표가 있는 것 (숨긴 교시의 글은 세지 않음) */
export const hasTimetable = tt => !!(tt && tt.cells.some(d => d.slice(0, tt.periods || d.length).some(Boolean)));

/* 시수(스펙 3.5) */
export function hours(ctx, sub) {
  const plan = sub.lessons.length;
  const done = Math.max(0, sub.offset) + records(ctx, sub).filter(r => r.status !== 'skip').length;
  return { plan, done, left: Math.max(0, plan - done) };
}

/* 다음에 할 차시를 n(1부터)으로: 기록은 두고 보정값만 */
export const setNext = (ctx, sub, n) => ({ ...sub, offset: n - 1 - records(ctx, sub).filter(r => r.status === 'done').length });

/* ---------- 진도 차이 (스펙 3.6) ---------- */
/* i번째 차시가 든 주의 월요일: 기간 날짜 → 주 번호(시작일이 든 주 = 가장 작은 주) → '' */
/* 기간이 주말에 시작하면(일~토 표기) 다음 월요일의 주 */
const weekOf = d => (weekday(d) === 0 ? addDays(d, 1) : weekday(d) === 6 ? addDays(d, 2) : mondayOf(d));
export function lessonMonday(ctx, sub, i) {
  const l = sub.lessons[i];
  if (!l) return '';
  if (l.from) return weekOf(l.from);
  if (l.week == null) return '';
  // 기간이 있는 다른 줄이 있으면 그 줄로 주 번호를 맞추고, 없으면 시작일이 든 주 = 가장 작은 주
  const ref = sub.lessons.find(x => x.from && x.week != null);
  if (ref) return addDays(weekOf(ref.from), 7 * (l.week - ref.week));
  const min = Math.min(...sub.lessons.map(x => x.week).filter(w => w != null));
  return addDays(mondayOf(isDate(sub.start) ? sub.start : ctx.today), 7 * (l.week - min));
}
/* from부터 「지금까지」의 이 교과 수업 시간 수: 어제까지 전부 + 오늘은 체크한 시간만 */
function slotsSoFar(ctx, sub, from) {
  let n = 0;
  for (let d = from, i = 0; d <= ctx.today && i < 400; d = addDays(d, 1), i++) {
    for (const s of slotsOn(ctx, d)) if ((d < ctx.today || logged(ctx, d, s.period)) && isOf(ctx, s.subject, sub)) n++;
  }
  return n;
}
export function progressOf(ctx, sub) {
  const h = hours(ctx, sub);
  const plan = h.plan;
  const actual = Math.min(plan, Math.max(0, sub.offset + records(ctx, sub).filter(r => r.status === 'done').length));
  const mode = sub.lessons.some(l => l.from || l.week != null) ? 'week' : 'slot';
  let expected = 0, started;
  if (mode === 'week') {
    const mons = sub.lessons.map((_, i) => lessonMonday(ctx, sub, i));
    const first = mons.filter(Boolean).sort()[0];
    const cur = mondayOf(ctx.today);
    started = !!first && first <= ctx.today;
    if (started) expected = mons.filter(m => m && m < cur).length + Math.min(mons.filter(m => m === cur).length, slotsSoFar(ctx, sub, cur));
  } else {
    const st = isDate(sub.start) ? sub.start : ctx.today;
    started = st <= ctx.today;
    if (started) expected = slotsSoFar(ctx, sub, st);
  }
  expected = Math.min(plan, expected);
  const inTimetable = ctx.tt.cells.some(row => row.slice(0, ctx.tt.periods || row.length).some(c => c && isOf(ctx, c, sub)));
  return { sub, ...h, actual, expected, diff: actual - expected, next: Math.min(actual + 1, plan + 1), mode, started, inTimetable };
}
export const summary = ctx => ctx.subjects.map(s => progressOf(ctx, s));
/* 진도표대로라면 지금 할 차시를 다음 차시로 */
export const alignToPlan = (ctx, sub) => setNext(ctx, sub, progressOf(ctx, sub).expected + 1);
/* 있는 교과를 새 진도표로 바꿀 때 기준일(since): 새 진도표의 첫날 앞에 이 교과 체크 기록이 있으면(다음 학기 진도표) 그 첫날.
   첫날이 지금 기준일보다 앞이면(앞 학기 진도표로 되돌림) 기준일을 없앰(''), 그 밖에는 그대로(null).
   날짜가 없는 진도표(주만 있음·직접 씀)는 앞 진도표를 모두 마쳤고 차시가 거의 다르면(다음 학기 진도표) 오늘.
   다만 앞 진도표 차시가 절반 넘게 남아 있으면(뒤에 다음 학기 줄을 덧붙임·글자 고침) 그대로.
   같은 진도표를 고친 것(차시 날짜가 대부분 앞 진도표에 있음 — 첫 주 줄을 지움 등)은 그대로. 다만 첫날이 기준일 앞이면
   (1·2학기를 합친 진도표·앞 학기 진도표) 위처럼 기준일을 없앰 */
export function termStart(ctx, old, lessons) {
  const list = (lessons || []).filter(isObj), dates = list.map(l => l.from).filter(isDate);
  if (!dates.length) {
    const h = hours(ctx, old), titles = new Set(old.lessons.map(l => l.title));
    const now = new Set(list.map(l => String(l.title || '').trim()));
    const same = list.filter(l => titles.has(String(l.title || '').trim())).length, kept = old.lessons.filter(l => now.has(l.title)).length;
    return h.plan > 0 && h.done >= h.plan && same * 2 < list.length && kept * 2 < old.lessons.length ? ctx.today : null;
  }
  const first = dates.sort()[0], back = !!old.since && first < old.since, base = back ? { ...old, since: '' } : old;
  const had = new Set(old.lessons.map(l => l.from).filter(Boolean));
  if (!back && dates.filter(d => had.has(d)).length * 2 >= dates.length) return null;
  return records(ctx, base).some(r => r.date < first) ? first : back ? '' : null;
}
/* 있는 교과의 차시 목록 바꾸기(진도표 파일·AI로 뽑기·고치기 시트): 체크 기록은 그대로. 다음 학기 진도표면 그 첫날(날짜 없으면 오늘)
   앞의 기록은 세지 않고 새 교과처럼 계획 진도에 맞춤. fields: 함께 바꿀 값(이름·총 시수). 저장하지 못하면 null */
export function replaceLessons(old, lessons, fields = {}) {
  const since = termStart(makeCtx(), old, lessons);
  if (since) { const neu = saveSubject({ ...old, ...fields, since, start: since, offset: 0, lessons }); return neu && saveSubject(alignToPlan(makeCtx(), neu)); }
  return saveSubject({ ...old, ...(since === '' ? { since: '' } : {}), ...fields, lessons });
}
/* 새 교과 넣기(진도표 파일·AI로 뽑기·직접 쓰기): 계획 진도에 맞춤. fields: 이름·차시 목록·총 시수. 저장하지 못하면 null.
   지운 교과를 같은 이름으로 다시 넣어 체크 기록이 남아 있으면 기록대로 이어감(빈 교과의 차시 목록을 바꾸는 것처럼 —
   다음 학기 진도표면 그 첫날 앞 기록은 세지 않고 계획 진도에 맞춤). 시작일은 남은 첫 기록 날 */
export function addSubject(fields) {
  const neu = saveSubject({ start: today(), offset: 0, total: null, ...fields });
  if (!neu) return null;
  const ctx = makeCtx(), left = records(ctx, neu).map(r => r.date).sort();
  if (!left.length) return saveSubject(alignToPlan(ctx, neu));
  return replaceLessons({ ...neu, start: left[0] < neu.start ? left[0] : neu.start, lessons: [] }, neu.lessons);
}
/* 진도표에서 고른 교과 넣기: 있는 교과는 차시 목록만 바꾸고(replaceLessons), 새 교과는 addSubject. 하나라도 저장하지 못하면 false */
export function importSubjects(picked) {
  let ok = true;
  for (const s of picked) {
    const old = listSubjects().find(h => h.name === s.name);
    if (old) { ok = !!replaceLessons(old, s.lessons, { total: s.total }) && ok; continue; }
    ok = !!addSubject({ name: s.name, total: s.total, lessons: s.lessons }) && ok;
  }
  return ok;
}

/* 체크하지 않은 날: 처음 체크한 날부터, 오늘 앞 수업일 n일 안에서 진도표 있는 교과 수업이 있는데 기록이 없는 날(오래된 순) */
export function missingDays(ctx, n = 10) {
  const first = Object.keys(ctx.log).sort()[0];
  if (!first) return [];
  const out = [];
  let seen = 0;
  for (let d = addDays(ctx.today, -1), i = 0; seen < n && d >= first && i < 120; d = addDays(d, -1), i++) {
    const slots = slotsOn(ctx, d);
    if (!slots.length) continue;
    seen++;
    if (ctx.log[d]) continue;
    if (slots.some(s => { const f = findSubject(ctx.subjects, s.subject); return f && f.lessons.length; })) out.push(d);
  }
  return out.reverse();
}

/* ---------- 주간학습안내 ---------- */
/* 목요일부터 주말까지는 다음 주, 그 밖에는 이번 주 */
export function defaultWeek(t) {
  const w = weekday(t);
  return w === 0 || w >= 4 ? addDays(mondayOf(t), 7) : mondayOf(t);
}
export const weekView = (ctx, monday) => [0, 1, 2, 3, 4].map(d => dayView(ctx, addDays(monday, d)));

const text = v => (typeof v === 'number' ? String(v) : str(v)).trim();
export function normLessons(list, year) {
  return (Array.isArray(list) ? list : []).map(l => {
    if (!isObj(l) || !text(l.title)) return null;
    const period = text(l.period);
    return { week: Number.isInteger(l.week) ? l.week : null, period, from: periodStart(period, year), unit: text(l.unit), title: text(l.title), no: '', pages: text(l.pages), memo: text(l.memo) };
  }).filter(Boolean);
}
export function normTimetableAI(v) {
  if (!isObj(v) || !Array.isArray(v.cells)) return null;
  const longest = Math.max(0, ...v.cells.map(r => (Array.isArray(r) ? r.length : 0)));
  const t = normTimetable({ periods: Math.min(7, Math.max(4, Number.isInteger(v.periods) ? v.periods : longest)), cells: v.cells });
  return t.cells.some(r => r.some(Boolean)) ? t : null;
}
export const normNotes = v => [0, 1, 2, 3, 4].map(d => normWeekly({ notes: { 0: Array.isArray(v) && isObj(v[d]) ? v[d] : {} } }).notes[0]);

export const weeklyTitle = info => (info && info.grade && info.room ? `${info.grade}학년 ${info.room}반 주간학습안내` : '주간학습안내');
export const cellText = slot => (slot.lesson ? `${slot.subject} · ${slot.lesson.title}` : slot.subject);
const WD = '월화수목금';
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const NOTE_ROWS = [['events', '학사일정'], ['prep', '준비물'], ['homework', '과제'], ['notice', '안내장'], ['safety', '안전']];
export { NOTE_ROWS };

/* 그 주의 칸 글: 고친 글이 있으면 그것, 수업 없는 날은 1교시 칸에 그 까닭 */
export function weekCell(days, weekly, d, p) {
  const k = `${d}-${p}`;
  if (weekly.cells && Object.prototype.hasOwnProperty.call(weekly.cells, k)) return weekly.cells[k];
  const day = days[d];
  if (day.off) return p === 1 ? day.off : '';
  const slot = day.slots.find(s => s.period === p);
  return slot ? cellText(slot) : '';
}
/* 문서·복사에 넣을 교시 수: 수업이 있는 마지막 교시와, 글을 쓴 마지막 교시 중 큰 것 */
export const weekPeriods = (days, weekly) => Math.max(1, ...days.flatMap(d => d.slots.map(s => s.period)),
  ...Object.entries((weekly && weekly.cells) || {}).filter(([, t]) => String(t).trim()).map(([k]) => +k.split('-')[1]));
export function weeklyDoc(days, weekly) {
  const P = weekPeriods(days, weekly);
  const head = ['교시', ...days.map((d, i) => `${WD[i]} ${md(d.date)}`)];
  const rows = Array.from({ length: P }, (_, i) => [`${i + 1}교시`, ...days.map((d, j) => weekCell(days, weekly, j, i + 1))]);
  const notes = NOTE_ROWS.map(([k, label]) => [label, ...days.map((d, j) => ((weekly.notes || {})[j] || {})[k] || '')]);
  return {
    title: weekly.title || '주간학습안내',
    blocks: [
      { type: 'p', text: `${fmtDay(days[0].date)} ~ ${fmtDay(days[4].date)}` },
      { type: 'table', head: true, rows: [head, ...rows] },
      { type: 'h', text: '요일별 알림' },
      { type: 'table', head: true, rows: [['구분', ...head.slice(1)], ...notes] }
    ]
  };
}
