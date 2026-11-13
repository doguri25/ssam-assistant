/* 학년도: 지금 학년도의 자료는 기존 ssam: 키에 그대로 두고, 다른 학년도는 보관함(archive.js)에 둠.
   공통 키(AI 키·테마 등)는 학년도와 상관없이 그대로. 백업 파일에는 공통 키를 넣지 않음 */
import { schoolYearOf, HOLIDAYS, weekday, addDays } from './calendar.js';
import { dueEvents } from '../menus/etc/gongmun-ai.js';
import { periodStart } from '../menus/class/class-import.js';

const PREFIX = 'ssam:';
// testkey:told(시험용 키 알림을 보였음)·queue(차례로 붙여넣기 설정)·queueCalc(산출 내역 넣는 방식)는 화면 설정이라 학년도 자료가 아님
// chat(「쌤」 채팅 기록 30개)·chat:open(바탕화면 버튼이 채팅을 열라고 적은 때)·nav:tabs(메뉴마다 마지막으로 연 탭)도 학년도와 상관없음
// demo: 3분 둘러보기 중 { from: 원래 학년도, at, ... } (core/tour.js) — 학년도를 옮겨도 남아야 끝낼 때 돌아갈 곳을 앎
export const GLOBAL = ['engine', 'theme', 'nav', 'nav:tabs', 'mode', 'updSkip', 'years', 't', 'backupAt', 'inbox', 'bubble', 'export', 'ai-roles', 'purchase:view', 'purchase:flow', 'camp:attView', 'ui:intro', 'msg:sender', 'testkey:told', 'queue', 'queueCalc', 'slips', 'chat', 'chat:open', 'demo'];
export const isYearKey = k => !!k && !GLOBAL.includes(k) && !k.startsWith('mig:');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/* ls가 없으면(저장소가 막힘) 오늘이 든 학년도 */
export function getYears(ls, today = todayStr()) {
  try { const v = JSON.parse(ls.getItem(PREFIX + 'years')); if (isObj(v) && Number.isInteger(v.current)) return { current: v.current }; } catch (e) {}
  return { current: schoolYearOf(today) };
}
/* 3분 둘러보기(스펙 2026-11-13-miss-tour-check §3)의 체험용 학년도: 진짜 학년도와 겹치지 않는 번호(보관함·학년도 표시에만 씀).
   체험 자료는 이 학년도로 옮겨(moveTo) 쓰고, 끝내면 원래 학년도로 돌아가 이 보관 자료를 지움 */
export const DEMO_YEAR = 9999;
export const isDemoYear = y => y === DEMO_YEAR;
export const DEMO_WAIT = '체험을 끝낸 뒤에 해 주세요';
/* 체험 중 표시 { from(원래 학년도), at, … } 또는 null (ls: 저장소, 막혔으면 null) */
export function demoOf(ls) {
  try { const v = JSON.parse(ls.getItem(PREFIX + 'demo')); return isObj(v) && Number.isInteger(v.from) ? v : null; } catch (e) { return null; }
}
/* 지금 자료의 학년도 (저장소에 닿지 못하면 오늘이 든 학년도). 체험용 학년도면 오늘이 든 학년도(날짜·문서의 학년도를 셈하는 곳이 쓰므로) */
export function currentYear(today = todayStr()) {
  let ls = null;
  try { ls = globalThis.localStorage || null; } catch (e) {}
  const y = getYears(ls, today).current;
  return isDemoYear(y) ? schoolYearOf(today) : y;
}
/* 학년도 첫 수업일: 3월 2일부터 주말·공휴일이 아닌 첫날 */
export function firstSchoolDay(year) {
  let d = `${year}-03-02`;
  for (let i = 0; i < 7 && (weekday(d) === 0 || weekday(d) === 6 || HOLIDAYS[d]); i++) d = addDays(d, 1);
  return d;
}
/* 처음 연 날의 학년도를 저장해 둠 (날짜가 3월을 넘어도 지금 자료의 학년도가 저절로 바뀌지 않게) */
export function ensureYears(ls, today = todayStr()) {
  const y = getYears(ls, today);
  try { if (!isObj(parse(ls.getItem(PREFIX + 'years')))) ls.setItem(PREFIX + 'years', JSON.stringify(y)); } catch (e) {}
  return y;
}

const yearKeys = ls => {
  const out = [];
  if (!ls) return out;
  for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(PREFIX) && isYearKey(k.slice(PREFIX.length))) out.push(k); }
  return out;
};
/* 지금 학년도의 자료 묶음: { 키(ssam: 뺀 것): 저장된 글 } */
export function snapshot(ls) {
  const out = {};
  for (const k of yearKeys(ls)) out[k.slice(PREFIX.length)] = ls.getItem(k);
  return out;
}

const parse = t => { try { return JSON.parse(t); } catch (e) { return null; } };
/* 새 학년도에 가져가는 것: 연간계획·행사계획·학급운영계획, 새 학년도(3월 1일부터) 학사일정·방학·재량휴업일, 학교명·학급 수·학생 수,
   설정(평어·행특 설정, 채점 설정(예외 번호는 비움), 나이스 입력 설정, 품의 기준 금액). 학생 자료는 비움.
   classSetup: 2월에 새 학년도 준비를 미리 넣었으면 학급 명단·학급 정보·시간표·진도표도 (진도 위치는 처음부터, 체크·주간학습안내는 비움.
   진도표 시작일은 새 학년도 첫 수업일 — 새 학년도 날로 정해 둔 것은 그대로, 차시 날짜는 기간(「3.2~3.6」)을 새 학년도로 다시 읽음) */
export function carryOver(snap, newYear, { classSetup = false } = {}) {
  const out = {};
  for (const k of ['yearplans', 'yearplan:current', 'events', 'event:current', 'classplans', 'classplan:current', 'purchaseLimit', 'purchaseMeetCap', 'purchase:templates']) if (typeof snap[k] === 'string') out[k] = snap[k];
  for (const k of Object.keys(snap)) if ((k === 'neis' || k.startsWith('neis:')) && typeof snap[k] === 'string') out[k] = snap[k];
  const pf = parse(snap.prefs);
  if (isObj(pf) && isObj(pf.settings)) out.prefs = JSON.stringify({ current: null, settings: pf.settings });
  const hk = parse(snap.hk);
  if (isObj(hk) && isObj(hk.settings)) out.hk = JSON.stringify({ settings: hk.settings, students: [] });
  const gr = parse(snap.grset);
  if (isObj(gr)) out.grset = JSON.stringify({ ...gr, startNo: 1, except: [] });
  const cal = parse(snap.calendar);
  // 끝나지 않은 공문은 가져가고(2월에 받은 새 학년도 공문), 그 기한·할 일은 달력에 다시 넣음(옛 공문 일정은 버림)
  const gm = parse(snap['gongmun:list']), openDocs = Array.isArray(gm) ? gm.filter(d => isObj(d) && !d.done) : [];
  if (openDocs.length) out['gongmun:list'] = JSON.stringify(openDocs);
  if (Array.isArray(cal) || openDocs.length) out.calendar = JSON.stringify([...(Array.isArray(cal) ? cal : []).filter(e => e && typeof e.date === 'string' && e.date >= `${newYear}-03-01` && e.source !== 'gongmun'),
    ...dueEvents(openDocs).map(e => ({ ...e, source: 'gongmun' }))]);
  const sc = parse(snap.school);
  // 방학·재량휴업일은 새 학년도(3월 1일부터)에 시작하는 것만 (2월에 미리 넣은 새 학년도 일정 — 학사일정과 같게)
  const inNew = b => isObj(b) && typeof b.from === 'string' && typeof b.to === 'string' && b.from >= `${newYear}-03-01` && b.from < `${newYear + 1}-03-01`;
  if (isObj(sc)) out.school = JSON.stringify({ name: String(sc.name || ''), classes: Number(sc.classes) || 0, students: Number(sc.students) || 0,
    breaks: (Array.isArray(sc.breaks) ? sc.breaks : []).filter(inNew).map(b => ({ from: b.from, to: b.to, label: String(b.label || '') })) });
  if (classSetup) {
    for (const k of ['class', 'class:info', 'class:timetable']) if (typeof snap[k] === 'string') out[k] = snap[k];
    const subs = parse(snap['class:subjects']);
    const first = firstSchoolDay(newYear), keep = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= first && d < `${newYear + 1}-03-01`;
    // 2월에 지난 학년도 날짜로 읽은 차시도 새 학년도 날짜로 (기간이 없는 차시는 그대로)
    const redate = list => list.map(l => { const f = isObj(l) && periodStart(l.period, newYear); return f ? { ...l, from: f } : l; });
    if (Array.isArray(subs)) out['class:subjects'] = JSON.stringify(subs.filter(isObj).map(({ since, ...x }) => ({ ...x, offset: 0, start: keep(x.start) ? x.start : first,
      ...(Array.isArray(x.lessons) ? { lessons: redate(x.lessons) } : {}) })));
  }
  return out;
}

/* 1·2월에 아직 지난 학년도에 있으면 새 학년도(그 해 3월부터)를 먼저 시작하라고 알림: 알릴 학년도, 아니면 0 */
export function prepYear(today, current) {
  const m = +String(today).slice(5, 7), next = schoolYearOf(today) + 1;
  return (m === 1 || m === 2) && current < next ? next : 0;
}

export function makeBackup({ current, snap, archives = {} }, now = new Date()) {
  const years = {};
  for (const [y, s] of Object.entries(archives)) years[y] = s;
  years[current] = snap;
  return { app: 'ssam', kind: 'backup', version: 1, createdAt: now.toISOString(), current, years };
}

/* 백업 파일 글 → { current, years }. 쌤비서 백업이 아니면 { code: 'NOT_BACKUP' }을 던짐 */
export function parseBackup(text) {
  const o = parse(text);
  const bad = () => { throw { code: 'NOT_BACKUP' }; };
  if (!isObj(o) || o.app !== 'ssam' || o.kind !== 'backup' || o.version !== 1 || !isObj(o.years)) bad();
  const years = {};
  for (const [y, s] of Object.entries(o.years)) {
    if (!/^\d{4}$/.test(y) || !isObj(s) || !Object.values(s).every(v => typeof v === 'string')) bad();
    years[y] = Object.fromEntries(Object.entries(s).filter(([k]) => isYearKey(k)));
  }
  return { current: Number.isInteger(o.current) ? o.current : null, years };
}

/* 학년도 옮기기: 저장 멈춤 → 지금 학년도를 보관함에 → 학년도 키를 비우고 가려는 학년도 자료를 씀 → 학년도 표시.
   data가 없으면 보관함의 그 학년도(없으면 빈 자료). 성공하면 멈춘 채로 두고(부른 쪽이 다시 엶) */
export async function moveTo(target, { ls, archive, freeze = () => {}, unfreeze = () => {}, data = null, today, timeout = 20000 } = {}) {
  freeze();
  const cur = getYears(ls, today).current;
  const now = snapshot(ls);
  // 보관함(IndexedDB)이 응답하지 않으면 기다리다 멈춤을 풂 (앱이 저장을 멈춘 채로 남지 않게)
  const T = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), timeout))]);
  let next = data;
  try {
    // 보관함에 있는 학년도를 새 자료로 시작하지 않음 (그 학년도의 자료를 덮어쓰게 되므로)
    if (data && target !== cur && await T(archive.get(target))) { unfreeze(); return { ok: false, code: 'EXISTS' }; }
  } catch (e) { unfreeze(); return { ok: false, code: 'ARCHIVE_READ' }; }
  try { await T(archive.put(cur, now)); } catch (e) { unfreeze(); return { ok: false, code: 'ARCHIVE_FAILED' }; }
  try { if (!next) next = (await T(archive.get(target))) || {}; } catch (e) { unfreeze(); return { ok: false, code: 'ARCHIVE_READ' }; }
  const write = snap => {
    for (const k of yearKeys(ls)) ls.removeItem(k);
    for (const [k, v] of Object.entries(snap)) if (isYearKey(k) && typeof v === 'string') ls.setItem(PREFIX + k, v);
  };
  const yv = JSON.stringify({ current: target });
  let wiped = false; // 학년도 표시를 지웠다 다시 쓰는 중
  try {
    write(next);
    // 같은 학년도로 옮기면(백업 파일로 지금 자료를 바꿈) 값이 같아 다른 탭에 storage 알림이 가지 않음 → 지웠다 다시 써서 알림(다른 탭이 다시 열려 지난 자료를 쓰지 않게)
    if (ls.getItem(PREFIX + 'years') === yv) { ls.removeItem(PREFIX + 'years'); wiped = true; }
    ls.setItem(PREFIX + 'years', yv);
  } catch (e) {
    // 지금 자료로 되돌림. 그것도 못 하면 지금 자료는 방금 보관함에 넣은 것으로 남아 있음
    let back = true;
    try { write(now); if (wiped && ls.getItem(PREFIX + 'years') == null) ls.setItem(PREFIX + 'years', yv); } catch (e2) { back = false; }
    unfreeze();
    return { ok: false, code: back ? 'WRITE_FAILED' : 'RESTORE_FAILED' };
  }
  return { ok: true };
}
