/* 학년도: 지금 학년도의 자료는 기존 ssam: 키에 그대로 두고, 다른 학년도는 보관함(archive.js)에 둠.
   공통 키(AI 키·테마 등)는 학년도와 상관없이 그대로. 백업 파일에는 공통 키를 넣지 않음 */
import { schoolYearOf } from './calendar.js';

const PREFIX = 'ssam:';
export const GLOBAL = ['engine', 'theme', 'nav', 'mode', 'updSkip', 'years', 't'];
export const isYearKey = k => !!k && !GLOBAL.includes(k) && !k.startsWith('mig:');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function getYears(ls, today = todayStr()) {
  try { const v = JSON.parse(ls.getItem(PREFIX + 'years')); if (isObj(v) && Number.isInteger(v.current)) return { current: v.current }; } catch (e) {}
  return { current: schoolYearOf(today) };
}

const yearKeys = ls => {
  const out = [];
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
/* 새 학년도에 가져가는 것: 연간계획·행사계획, 새 학년도(3월 1일부터) 학사일정, 학교명·학급 수·학생 수 */
export function carryOver(snap, newYear) {
  const out = {};
  for (const k of ['yearplans', 'yearplan:current', 'events', 'event:current']) if (typeof snap[k] === 'string') out[k] = snap[k];
  const cal = parse(snap.calendar);
  if (Array.isArray(cal)) out.calendar = JSON.stringify(cal.filter(e => e && typeof e.date === 'string' && e.date >= `${newYear}-03-01`));
  const sc = parse(snap.school);
  if (isObj(sc)) out.school = JSON.stringify({ name: String(sc.name || ''), classes: Number(sc.classes) || 0, students: Number(sc.students) || 0, breaks: [] });
  return out;
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
export async function moveTo(target, { ls, archive, freeze = () => {}, unfreeze = () => {}, data = null, today } = {}) {
  freeze();
  const cur = getYears(ls, today).current;
  const now = snapshot(ls);
  let next = data;
  try {
    await archive.put(cur, now);
    if (!next) next = (await archive.get(target)) || {};
  } catch (e) { unfreeze(); return { ok: false, code: 'ARCHIVE_FAILED' }; }
  const write = snap => {
    for (const k of yearKeys(ls)) ls.removeItem(k);
    for (const [k, v] of Object.entries(snap)) if (isYearKey(k) && typeof v === 'string') ls.setItem(PREFIX + k, v);
  };
  try {
    write(next);
    ls.setItem(PREFIX + 'years', JSON.stringify({ current: target }));
  } catch (e) {
    try { write(now); } catch (e2) {}
    unfreeze();
    return { ok: false, code: 'WRITE_FAILED' };
  }
  return { ok: true };
}
