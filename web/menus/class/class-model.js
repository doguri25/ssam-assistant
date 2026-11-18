/* 학급 자료와 계산 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-10-29-class-menu-design.md, 2026-11-18-class-fix-design.md A
   저장: class:info · class:timetable · class:subjects · class:log · class:extra · class:weekly:<월요일>. 요일 0=월…4=금, 교시는 1부터 */
import { get, set, remove, list } from '../../core/store.js';
import { isDate, addDays, weekday, dayIssues, listEvents } from '../../core/calendar.js';
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

/* 칸은 늘 7교시까지 저장(교시 수를 줄였다가 늘려도 남게), 보이는 줄은 periods.
   versions: 시간표 판 [{ from, cells }] — from 날부터 쓰던 칸(첫 판은 from ''), 맨 끝 판의 칸 = cells(지금 시간표).
   시간표를 「오늘부터」 바꾸면 판이 생겨 지난날은 그때 시간표로 셈. 판이 둘 이상일 때만 둠(예전 자료는 판 없이 cells 하나) */
const normCells = rows => Array.from({ length: 5 }, (_, d) => Array.from({ length: 7 }, (_, p) => (Array.isArray(rows) && Array.isArray(rows[d]) ? normName(str(rows[d][p])) : '')));
const sameCells = (a, b) => a.every((r, d) => r.every((c, p) => c === b[d][p]));
export function normTimetable(v) {
  const periods = intIn(v && v.periods, 4, 7) || 6;
  const raw = isObj(v) && Array.isArray(v.versions) ? v.versions.filter(x => isObj(x) && (x.from === '' || isDate(x.from)) && Array.isArray(x.cells)) : [];
  const vs = [];
  for (const x of raw.slice().sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    const e = { from: x.from, cells: normCells(x.cells) };
    if (vs.length && vs[vs.length - 1].from === e.from) vs[vs.length - 1] = e; else vs.push(e);
  }
  const cells = normCells(isObj(v) && Array.isArray(v.cells) ? v.cells : vs.length ? vs[vs.length - 1].cells : []);
  if (vs.length) { vs[0].from = ''; vs[vs.length - 1].cells = cells; }
  const kept = [];
  for (const x of vs) if (!kept.length || !sameCells(x.cells, kept[kept.length - 1].cells)) kept.push(x);
  if (kept.length > 1) kept[kept.length - 1].cells = cells;
  return kept.length > 1 ? { periods, cells, versions: kept } : { periods, cells };
}
export const getTimetable = () => normTimetable(get('class:timetable', null));
export const setTimetable = t => set('class:timetable', normTimetable(t));
/* 그날 쓰는 시간표 칸(판이 없으면 지금 시간표) */
export function cellsOn(tt, date) {
  const vs = tt && Array.isArray(tt.versions) ? tt.versions : [];
  if (!vs.length) return tt.cells;
  let c = vs[0].cells;
  for (const x of vs) if (x.from <= date) c = x.cells;
  return c;
}
const copyVersions = t => (t.versions || [{ from: '', cells: t.cells }]).map(x => ({ from: x.from, cells: x.cells.map(r => r.slice()) }));
/* 시간표 칸 하나 고치기 → 새 시간표. from: '' = 처음부터(지난날도 — 잘못 넣었음), 날짜 = 그 날부터(그 앞 날은 그때 시간표 그대로) */
export function editCell(tt, d, p, name, from = '') {
  const t = normTimetable(tt), vs = copyVersions(t);
  if (from && !vs.some(x => x.from === from)) {
    vs.push({ from, cells: cellsOn({ cells: t.cells, versions: vs }, from).map(r => r.slice()) });
    vs.sort((a, b) => (a.from < b.from ? -1 : 1));
  }
  for (const x of vs) if (!from || x.from >= from) x.cells[d][p] = normName(name);
  return normTimetable({ periods: t.periods, versions: vs, cells: vs[vs.length - 1].cells });
}
/* 시간표 통째로 바꾸기(파일·AI로 읽기). from: '' = 처음부터, 날짜 = 그 날부터 */
export function replaceTimetable(tt, next, from = '') {
  const t = normTimetable(tt), n = normTimetable(next);
  if (!from) return n;
  return normTimetable({ periods: n.periods, versions: [...copyVersions(t).filter(x => x.from < from), { from, cells: n.cells }], cells: n.cells });
}
/* 오늘 앞 체크 기록이 있는지(시간표를 고칠 때 「오늘부터 / 처음부터」를 물을지) */
export const hasPastRecords = (log, t) => Object.entries(log || {}).some(([d, day]) => d < t && Object.values(day).some(r => r && r.status));

/* 진도표의 단원 안 차시 「5/14」 (없으면 '') */
const noOf = v => { const t = str(v).replace(/\s+/g, ''); return /^\d+\/\d+$/.test(t) ? t : ''; };
function normLesson(l) {
  if (!isObj(l) || !str(l.title).trim()) return null;
  return {
    week: Number.isInteger(l.week) ? l.week : null, period: str(l.period).trim(), from: isDate(l.from) ? l.from : '',
    unit: str(l.unit).trim(), title: str(l.title).trim(), no: noOf(l.no), pages: str(l.pages).trim(), memo: str(l.memo).trim()
  };
}
/* offset: 진도 자리(다음 차시 = offset + 완료 수 + 1), hours0: 체크하기 전에 한 실시 시수(가져올 때 한 번 — 「다음 차시」를 고쳐도 그대로).
   예전 자료는 offset 하나로 둘 다 셌음 → hours0가 없으면 offset(0 아래면 0) */
const h0Of = s => Math.max(0, Number.isInteger(s.hours0) ? s.hours0 : Number.isInteger(s.offset) ? s.offset : 0);
export function normSubject(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || !normName(v.name)) return null;
  const offset = Number.isInteger(v.offset) ? v.offset : 0;
  return {
    id: v.id, name: normName(v.name), start: isDate(v.start) ? v.start : '',
    // since: 이 날 앞의 체크 기록은 이 진도표에 세지 않음(다음 학기 진도표로 바꾼 교과)
    ...(isDate(v.since) ? { since: v.since } : {}),
    offset, hours0: h0Of({ hours0: v.hours0, offset }),
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
/* 진도표 없는 교과(시수만 셈)의 설정: class:extra { 교과(괄호 뺀 이름): { plan: 계획 시수|null, staff: 전담(체크하지 않음) } } */
const normExtra = v => ({ plan: Number.isInteger(v.plan) && v.plan >= 0 ? v.plan : null, staff: !!v.staff });
export function getExtra() {
  const v = get('class:extra', {}), out = {};
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (normName(k) && isObj(x)) { const e = normExtra(x); if (e.plan != null || e.staff) out[normName(k)] = e; }
  return out;
}
export function setExtra(name, patch) {
  const k = extraKey(name);
  if (!k) return false;
  const all = getExtra(), e = normExtra({ ...(all[k] || {}), ...patch });
  if (e.plan != null || e.staff) all[k] = e; else delete all[k];
  return set('class:extra', all);
}
export const clearExtra = () => remove('class:extra');
/* 체크 기록과 주간학습안내를 모두 지움(예시로 바꿀 때) */
export function resetRecords() {
  remove('class:log');
  for (const k of list('class:weekly:')) remove(k);
}

/* 체크 기록: { 날짜: { 교시: { subject, status, memo?, swap? } } }. status '' = 체크하지 않음(메모나 교체만 있는 칸),
   memo = 수업 메모, swap = 그날만 다른 교과로 바꿈(교체·보강) */
const cleanRec = r => {
  const status = STATUS.includes(r.status) ? r.status : '', memo = str(r.memo).trim().slice(0, 200), swap = r.swap === true;
  return status || memo || swap ? { subject: r.subject, status, ...(memo ? { memo } : {}), ...(swap ? { swap } : {}) } : null;
};
export function getLog() {
  const v = get('class:log', {});
  const out = {};
  if (!isObj(v)) return out;
  for (const [d, day] of Object.entries(v)) {
    if (!isDate(d) || !isObj(day)) continue;
    const ok = {};
    for (const [p, r] of Object.entries(day)) {
      if (!/^[1-7]$/.test(p) || !isObj(r) || !str(r.subject) || !(STATUS.includes(r.status) || r.status === '' || r.status == null)) continue;
      const c = cleanRec(r);
      if (c) ok[p] = c;
    }
    if (Object.keys(ok).length) out[d] = ok;
  }
  return out;
}
/* 한 칸 기록 바꾸기: fn(지금 기록 또는 null) → 새 기록(빈 칸이면 지움) */
function editRec(date, period, fn) {
  const log = getLog();
  const day = { ...(log[date] || {}) };
  const r = fn(day[period] || null);
  const c = r && cleanRec(r);
  if (c) day[period] = c; else delete day[period];
  if (Object.keys(day).length) log[date] = day; else delete log[date];
  return set('class:log', log);
}
/* status가 null이면 그 시간 체크를 지움(메모·교체는 남김) */
export const setMark = (date, period, subject, status) =>
  editRec(date, period, r => (r && r.subject === subject ? { ...r, status: status || '' } : { subject, status: status || '' }));
/* 그날 그 교시만 다른 교과로(교체·보강, 시간표는 그대로). planned: 시간표의 교과(시간표에 없는 교시는 '') — 같으면 교체를 지움.
   교과가 바뀌면 체크는 지움(다른 교과의 차시라서), 메모는 남김. 이름이 비면 false */
export function setSwap(date, period, subject, planned) {
  const name = normName(subject);
  if (!name) return false;
  return editRec(date, period, r => {
    const status = r && r.subject === name ? r.status : '', memo = r ? r.memo : '';
    return name === normName(planned) ? { subject: name, status, memo } : { subject: name, status, memo, swap: true };
  });
}
/* 수업 메모(짧게): 기록이 있는 칸은 기록된 교과에(다른 교과로 바꾸지 않음), 비우면 메모를 지움 */
export const setMemo = (date, period, subject, memo) =>
  editRec(date, period, r => ({ ...(r || { subject, status: '' }), memo: str(memo) }));

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
  // announce: 한 주 전체 「알려 드립니다」(자유 글 — 화면·한글·복사)
  return { title: str(w.title), cells, notes, rv, announce: typeof w.announce === 'string' ? w.announce.slice(0, 2000) : '' };
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
/* 수업이 없는 날로 보는 학사일정: 「재량휴업일」「개교기념일」「휴업일」(방학식·개학식은 수업 날, 방학은 설정 › 학교 정보의 방학).
   공문 기한(source gongmun)·「… 계획 제출」 같은 일은 빼고 */
const OFF_TITLE = /재량\s*휴업|개교\s*기념일|휴업일|휴교/;
const NOT_OFF = /제출|신청|조사|계획|보고|회신|안내|협의|회의|연수|공문|\[/;
export const offEvent = e => !!e && e.source !== 'gongmun' && OFF_TITLE.test(str(e.title)) && !NOT_OFF.test(str(e.title));
/* 그날 수업이 없는 까닭(noClass + 학사일정의 휴업일), 수업이 있으면 '' */
export function dayOff(ctx, date) {
  const r = noClass(date, ctx.breaks);
  if (r) return r;
  const e = (ctx.events || []).find(x => x.date === date && offEvent(x));
  return e ? e.title.trim() : '';
}

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

/* 진도표 없는 교과의 이름(괄호 뺀 이름 — 「창체(동)」은 창체) */
export const extraKey = name => base(name);

/* ---------- 차시 배정 ---------- */
export const makeCtx = (t = today()) => ({ tt: getTimetable(), subjects: listSubjects(), log: getLog(), breaks: getSchool().breaks, events: listEvents(), extra: getExtra(), today: t });

/* 그날 교시 목록: 그날 쓰던 시간표 판의 칸, 기록이 있는 교시는 기록된 교과(교체·보강 — 시간표 교과는 planned, 시간표에 없는 교시는 planned '') */
export function slotsOn(ctx, date) {
  if (dayOff(ctx, date)) return [];
  const row = (cellsOn(ctx.tt, date)[weekday(date) - 1] || []).slice(0, ctx.tt.periods);
  const out = row.map((subject, i) => ({ period: i + 1, subject })).filter(s => s.subject);
  const day = ctx.log && ctx.log[date];
  if (!day) return out;
  for (const [p, r] of Object.entries(day)) {
    const i = out.findIndex(s => s.period === +p);
    if (i < 0) out.push({ period: +p, subject: r.subject, planned: '' });
    else if (out[i].subject !== r.subject) out[i] = { period: +p, subject: r.subject, planned: out[i].subject };
  }
  return out.sort((a, b) => a.period - b.period);
}

/* 시간표·기록의 교과 이름이 이 교과인지 (목록에 없는 교과면 이름으로만) */
function isOf(ctx, name, sub) {
  if (!ctx.subjects.some(s => s.id === sub.id)) return sameSubject(name, sub.name);
  const f = findSubject(ctx.subjects, name);
  return !!f && f.id === sub.id;
}
const before = (d1, p1, d2, p2) => d1 < d2 || (d1 === d2 && p1 < p2);
/* 체크한 기록(앞날 기록은 세지 않음 — 예전에 앞날을 체크했어도 그날이 올 때까지). all: 다음 학기 기준일(since) 앞 기록도 */
function records(ctx, sub, { all = false } = {}) {
  const out = [];
  for (const [date, day] of Object.entries(ctx.log)) {
    if (date > ctx.today || (!all && sub.since && date < sub.since)) continue;
    for (const [p, r] of Object.entries(day)) if (r.status && isOf(ctx, r.subject, sub)) out.push({ date, period: +p, status: r.status });
  }
  return out;
}
const recAt = (ctx, date, period) => (ctx.log && ctx.log[date] && ctx.log[date][period]) || null;
const statusAt = (ctx, date, period) => { const r = date <= ctx.today && recAt(ctx, date, period); return (r && r.status) || null; };
const logged = (ctx, date, period) => !!statusAt(ctx, date, period);
/* 체크할 수 있는 날: 오늘까지(앞날은 체크할 수 없음) */
export const canMark = (ctx, date) => isDate(date) && date <= ctx.today;
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

/* 같은 교과인지 가리는 열쇠: 진도표 교과는 그 교과, 진도표 없는 교과는 괄호 뺀 이름 */
const keyOf = (ctx, name) => { const f = findSubject(ctx.subjects, name); return f ? 'id:' + f.id : 'n:' + extraKey(name); };
/* 그 시간 앞의 같은 교과 가장 가까운 기록의 메모(「지난 시간: …」), 없으면 '' */
export function lastMemo(ctx, subject, date, period) {
  const k = keyOf(ctx, subject);
  let best = null;
  for (const [d, day] of Object.entries(ctx.log || {})) {
    if (d > date || d > ctx.today) continue;
    for (const [p, r] of Object.entries(day)) {
      if (!before(d, +p, date, period) || keyOf(ctx, r.subject) !== k) continue;
      if (!best || before(best.d, best.p, d, +p)) best = { d, p: +p, memo: r.memo || '' };
    }
  }
  return best ? best.memo : '';
}
const isStaff = (ctx, name) => !!(((ctx.extra || {})[extraKey(name)] || {}).staff);
/* 하루 보기. 칸마다 kind: plan(진도표 교과) · hours(진도표 없음, 시수만 셈) · staff(전담 — 체크하지 않음),
   status(앞날은 null), memo, last(지난 시간 메모), planned·swap(교체·보강) */
export function dayView(ctx, date) {
  const off = dayOff(ctx, date);
  const slots = off ? [] : slotsOn(ctx, date).map(s => {
    const rec = recAt(ctx, date, s.period);
    const extra = { status: statusAt(ctx, date, s.period), memo: (rec && rec.memo) || '', last: lastMemo(ctx, s.subject, date, s.period), swap: s.planned != null };
    const sub = findSubject(ctx.subjects, s.subject);
    if (!sub) return { ...s, sub: null, index: null, lesson: null, finished: false, kind: isStaff(ctx, s.subject) ? 'staff' : 'hours', ...extra };
    const index = Math.max(0, lessonAt(ctx, sub, date, s.period));
    return { ...s, sub, index, lesson: sub.lessons[index] || null, finished: index >= sub.lessons.length, kind: 'plan', ...extra };
  });
  return { date, off, slots };
}
/* 그날 체크 상황: left(체크할 수 있는데 안 한 칸), marked(체크한 칸), kept(완료·일부 진행 칸) */
export function dayMarks(ctx, date) {
  const ss = dayView(ctx, date).slots.filter(s => s.kind !== 'staff');
  return { left: ss.filter(s => !s.status).length, marked: ss.filter(s => s.status).length, kept: ss.filter(s => s.status === 'done' || s.status === 'part').length };
}
/* 그날 한꺼번에 체크(전담 빼고): only 'left' = 체크하지 않은 칸만, 'all' = 모든 칸. 바꾼 칸 수, 저장하지 못하면 -1, 앞날은 0 */
export function markDay(ctx, date, status, only = 'left') {
  if (!canMark(ctx, date) || !STATUS.includes(status)) return 0;
  const log = getLog(), day = { ...(log[date] || {}) };
  let n = 0;
  for (const s of dayView(ctx, date).slots) {
    if (s.kind === 'staff' || s.status === status || (only === 'left' && s.status)) continue;
    const r = day[s.period];
    day[s.period] = cleanRec({ ...(r && r.subject === s.subject ? r : { subject: s.subject }), status });
    n++;
  }
  if (!n) return 0;
  log[date] = day;
  return set('class:log', log) ? n : -1;
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

/* 시수(스펙 3.5): 실시 = 처음 실시(hours0) + 완료·일부 진행 기록 */
export function hours(ctx, sub) {
  const plan = sub.lessons.length;
  const done = h0Of(sub) + records(ctx, sub).filter(r => r.status !== 'skip').length;
  return { plan, done, left: Math.max(0, plan - done) };
}
/* 연간 실시: 다음 학기 진도표로 바꾼 교과(since)도 그 앞 학기 기록까지 */
export const yearHours = (ctx, sub) => hours(ctx, sub).done + (sub.since ? records(ctx, sub, { all: true }).filter(r => r.date < sub.since && r.status !== 'skip').length : 0);

/* 다음에 할 차시를 n(1부터)으로: 기록·실시 시수는 두고 진도 자리(offset)만 */
export const setNext = (ctx, sub, n) => ({ ...sub, hours0: h0Of(sub), offset: n - 1 - records(ctx, sub).filter(r => r.status === 'done').length });

/* ---------- 진도표 없는 교과(시수만) ---------- */
const ORDER = ['국어', '수학', '사회', '과학', '영어', '음악', '미술', '체육', '도덕', '실과', '창체'];
/* 시간표(지난 판도)·기록에 있는데 진도표가 없는 교과(괄호 뺀 이름, 교과 차례) */
export function extraNames(ctx) {
  const names = [];
  const add = n => { if (!n || findSubject(ctx.subjects, n)) return; const k = extraKey(n); if (k && !names.includes(k)) names.push(k); };
  for (const c of [ctx.tt.cells, ...(ctx.tt.versions || []).map(v => v.cells)]) for (const row of c) row.slice(0, ctx.tt.periods).forEach(add);
  for (const [d, day] of Object.entries(ctx.log || {})) if (d <= ctx.today) for (const r of Object.values(day)) add(r.subject);
  const rank = n => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  return names.map((n, i) => [n, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(x => x[0]);
}
/* 진도표 없는 교과의 시수: 계획(준비에서 적음, 없으면 null)·실시(완료·일부 진행)·남은, 전담 */
export function extraHours(ctx, name) {
  const k = extraKey(name), e = (ctx.extra || {})[k] || {};
  let done = 0;
  for (const [d, day] of Object.entries(ctx.log || {})) {
    if (d > ctx.today) continue;
    for (const r of Object.values(day)) if ((r.status === 'done' || r.status === 'part') && !findSubject(ctx.subjects, r.subject) && extraKey(r.subject) === k) done++;
  }
  const plan = Number.isInteger(e.plan) ? e.plan : null;
  return { name: k, plan, done, left: plan == null ? null : Math.max(0, plan - done), staff: !!e.staff };
}
export const extraSummary = ctx => extraNames(ctx).map(n => extraHours(ctx, n));
/* 창체 영역 시수: 시간표·기록의 「창체(자)」「창체(동)」처럼 괄호 첫 글자로 [[영역, 실시]] (실시가 있는 영역만) */
const AREAS = [['자', '자율·자치'], ['동', '동아리'], ['봉', '봉사'], ['진', '진로']];
export function areaHours(ctx, name) {
  const k = extraKey(name), n = {};
  for (const [d, day] of Object.entries(ctx.log || {})) {
    if (d > ctx.today) continue;
    for (const r of Object.values(day)) {
      const m = /\((.)/.exec(normName(r.subject));
      if (m && (r.status === 'done' || r.status === 'part') && extraKey(r.subject) === k) n[m[1]] = (n[m[1]] || 0) + 1;
    }
  }
  return AREAS.filter(([c]) => n[c]).map(([c, label]) => [label, n[c]]);
}

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
/* 새로 넣은 진도표: 계획 진도에 맞추고, 그만큼을 처음 실시로(가져올 때 한 번) */
const seat = (ctx, sub) => { const a = alignToPlan(ctx, sub); return { ...a, hours0: Math.max(0, a.offset) }; };
/* 있는 교과를 새 진도표로 바꿀 때 기준일(since): 새 진도표의 첫날 앞에 이 교과 체크 기록이 있으면(다음 학기 진도표) 그 첫날.
   첫날이 지금 기준일보다 앞이면(앞 학기 진도표로 되돌림) 기준일을 없앰(''), 그 밖에는 그대로(null).
   날짜가 없는 진도표(주만 있음·직접 씀)는 앞 진도표를 모두 마쳤고 차시가 거의 다르면(다음 학기 진도표) 오늘.
   다만 앞 진도표 차시가 절반 넘게 남아 있으면(뒤에 다음 학기 줄을 덧붙임·글자 고침) 그대로.
   같은 진도표를 고친 것(차시 날짜가 대부분 앞 진도표에 있음)은 그대로 — 첫 주 줄을 지움, 첫날을 기준일 앞으로 당김 등.
   다만 그 가운데 1·2학기를 합친 진도표(첫날이 기준일 앞, 그 앞 기록 없음)는 기준일을 없애고,
   합친 진도표에서 앞 학기 줄을 뺀 것(빠진 앞 차시가 새 차시 수의 절반 이상, 첫날 앞 기록 있음)은 다음 학기 진도표 */
export function termStart(ctx, old, lessons) {
  const list = (lessons || []).filter(isObj), dates = list.map(l => l.from).filter(isDate);
  if (!dates.length) {
    const h = hours(ctx, old), titles = new Set(old.lessons.map(l => l.title));
    const same = list.filter(l => titles.has(String(l.title || '').trim())).length;
    // 앞 진도표 차시가 새 목록에 남은 수: 새 줄 하나는 옛 줄 하나에만 맞춤(「학급 회의」처럼 되풀이되는 제목)
    const left = new Map();
    for (const l of list) { const t = String(l.title || '').trim(); left.set(t, (left.get(t) || 0) + 1); }
    const kept = old.lessons.filter(l => { const n = left.get(l.title) || 0; if (n) left.set(l.title, n - 1); return n > 0; }).length;
    return h.plan > 0 && h.done >= h.plan && same * 2 < list.length && kept * 2 < old.lessons.length ? ctx.today : null;
  }
  const first = dates.sort()[0], back = !!old.since && first < old.since, base = back ? { ...old, since: '' } : old;
  const had = new Set(old.lessons.map(l => l.from).filter(Boolean)), early = records(ctx, base).some(r => r.date < first);
  if (dates.filter(d => had.has(d)).length * 2 >= dates.length) {
    if (back) return early ? null : '';
    const dropped = old.lessons.filter(l => l.from && l.from < first).length;
    if (!(early && dropped * 2 >= dates.length)) return null;
  }
  return early ? first : back ? '' : null;
}
/* 있는 교과의 차시 목록 바꾸기(진도표 파일·AI로 뽑기·고치기 시트): 체크 기록은 그대로. 다음 학기 진도표면 그 첫날(날짜 없으면 오늘)
   앞의 기록은 세지 않고 새 교과처럼 계획 진도에 맞춤. fields: 함께 바꿀 값(이름·총 시수). 저장하지 못하면 null */
export function replaceLessons(old, lessons, fields = {}) {
  const since = termStart(makeCtx(), old, lessons);
  if (since) { const neu = saveSubject({ ...old, ...fields, since, start: since, offset: 0, hours0: 0, lessons }); return neu && saveSubject(seat(makeCtx(), neu)); }
  return saveSubject({ ...old, ...(since === '' ? { since: '' } : {}), ...fields, lessons });
}
/* 새 교과 넣기(진도표 파일·AI로 뽑기·직접 쓰기): 계획 진도에 맞춤. fields: 이름·차시 목록·총 시수. 저장하지 못하면 null.
   지운 교과를 같은 이름으로 다시 넣어 체크 기록이 남아 있으면: 다음 학기 진도표면 그 첫날(termStart) 앞 기록은 세지 않고,
   남은 기록이 있으면 기록대로 이어감(보정 0), 없으면 계획 진도에 맞춤. 기준일이 없으면 시작일은 남은 첫 기록 날 */
export function addSubject(fields) {
  const neu = saveSubject({ start: today(), offset: 0, hours0: 0, total: null, ...fields });
  if (!neu) return null;
  const ctx = makeCtx(), left = records(ctx, neu).map(r => r.date).sort();
  if (!left.length) return saveSubject(seat(ctx, neu));
  const since = termStart(ctx, { ...neu, lessons: [] }, neu.lessons);
  const s = since ? { ...neu, since, start: since } : { ...neu, start: left[0] < neu.start ? left[0] : neu.start };
  return saveSubject(records(ctx, s).length ? s : seat(ctx, s));
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

/* 그날 체크하지 않은 진도표 교과 교시(진도표가 있고, 다음 학기 진도표로 바꾼 교과는 기준일 뒤만) */
export function leftPeriods(ctx, d) {
  return slotsOn(ctx, d).filter(s => {
    if (logged(ctx, d, s.period)) return false;
    const f = findSubject(ctx.subjects, s.subject);
    return !!f && f.lessons.length > 0 && !(f.since && d < f.since);
  }).map(s => s.period);
}
/* 체크하지 않은 날: 처음 체크한 날부터, 오늘 앞 수업일 n일 안에서 진도표 있는 교과 수업 가운데 체크하지 않은 교시가 있는 날(오래된 순, 반만 체크한 날도).
   다음 학기 진도표로 바꾼 교과(since)는 그 앞 날을 세지 않음(체크해도 그 진도표에 세지 않는 날) */
export const missingDays = (ctx, n = 10) => missingList(ctx, n).map(x => x.date);
/* 같은 날들을 [{ date, periods: 남은 교시, part: 그날 체크한 칸이 있음 }]으로 */
export function missingList(ctx, n = 10) {
  const first = Object.keys(ctx.log).filter(d => d < ctx.today && Object.values(ctx.log[d]).some(r => r.status)).sort()[0];
  if (!first) return [];
  const out = [];
  let seen = 0;
  for (let d = addDays(ctx.today, -1), i = 0; seen < n && d >= first && i < 120; d = addDays(d, -1), i++) {
    const slots = slotsOn(ctx, d);
    if (!slots.length) continue;
    seen++;
    const periods = leftPeriods(ctx, d);
    if (periods.length) out.push({ date: d, periods, part: slots.some(s => logged(ctx, d, s.period)) });
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
// 교과서 쪽수가 있으면 「(120~121쪽)」(학부모께 가는 주간학습안내 — 오늘 수업과 같은 꼴)
const pagesOf = p => { const t = String(p || '').trim(); return !t ? '' : /^[\d\s~,.-]+$/.test(t) ? `${t}쪽` : t; };
export const cellText = slot => (slot.lesson ? `${slot.subject} · ${slot.lesson.title}${pagesOf(slot.lesson.pages) ? ` (${pagesOf(slot.lesson.pages)})` : ''}` : slot.subject);
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
/* 문서·복사에 넣을 교시 수: 수업이 있는 마지막 교시와, 글을 쓴 마지막 교시 중 큰 것. max(시간표 교시 수)를 주면 그것까지만(교시 수를 줄인 뒤 화면에 없는 칸은 내보내지 않음) */
export const weekPeriods = (days, weekly, max = Infinity) => Math.max(1, Math.min(max, Math.max(1, ...days.flatMap(d => d.slots.map(s => s.period)),
  ...Object.entries((weekly && weekly.cells) || {}).filter(([, t]) => String(t).trim()).map(([k]) => +k.split('-')[1]))));
/* 한글·워드·PDF 문서. opts: periods(시간표 교시 수), school(맨 위 학교 이름). weekly.announce: 한 주 전체 「알려 드립니다」 */
export function weeklyDoc(days, weekly, { periods = Infinity, school = '' } = {}) {
  const P = weekPeriods(days, weekly, periods);
  const head = ['교시', ...days.map((d, i) => `${WD[i]} ${md(d.date)}`)];
  // 수업 없는 날(고친 칸이 없으면): 1교시 칸에 까닭, 나머지 칸은 「-」
  const own = j => Object.keys((weekly && weekly.cells) || {}).some(k => k.startsWith(`${j}-`));
  const cell = (d, j, p) => (d.off && !own(j) && p > 1 ? '-' : weekCell(days, weekly, j, p));
  const rows = Array.from({ length: P }, (_, i) => [`${i + 1}교시`, ...days.map((d, j) => cell(d, j, i + 1))]);
  const notes = NOTE_ROWS.map(([k, label]) => [label, ...days.map((d, j) => ((weekly.notes || {})[j] || {})[k] || '')]);
  const notice = String((weekly && weekly.announce) || '').trim();
  const W = [0.7, 2, 2, 2, 2, 2];
  return {
    title: weekly.title || '주간학습안내',
    blocks: [
      { type: 'p', text: `${String(school || '').trim() ? `${String(school).trim()} · ` : ''}${fmtDay(days[0].date)} ~ ${fmtDay(days[4].date)}` },
      { type: 'table', head: true, widths: W, rows: [head, ...rows] },
      { type: 'h', text: '요일별 알림' },
      { type: 'table', head: true, widths: W, rows: [['구분', ...head.slice(1)], ...notes] },
      ...(notice ? [{ type: 'h', text: '알려 드립니다' }, { type: 'p', text: notice }] : [])
    ]
  };
}
