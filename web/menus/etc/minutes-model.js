/* 회의록 저장 (스펙 2026-11-15 2장): 학년도 자료 「minutes:list」 최근 20개(늦게 고친 것 먼저), 지금 보는 회의록 「minutes:current」.
   회의록마다 칸·안건·할 일(체크·담당·기한)·다음 회의. 넣은 메모 글·파일은 저장하지 않음(이 화면에만) */
import { get, set } from '../../core/store.js';
import { KINDS, FIELD_KEYS, MAX_AGENDA, MAX_LINES, MAX_TODOS } from './minutes-ai.js';

const KEY = 'minutes:list', CUR = 'minutes:current';
export const MAX_MINUTES = 20;
const IDS = KINDS.map(k => k[0]);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const date = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
export const newMinutesId = () => 'mn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* { id, at, kind, title, date, time, place, attendees, agenda: [{ title, discussion: [], decisions: [] }], todos: [{ task, who, due, done }], next: { date, topic }, touched, read } */
export const blankMinutes = () => ({ id: newMinutesId(), at: 0, kind: 'etc', title: '', date: '', time: '', place: '', attendees: '', agenda: [], todos: [], next: { date: '', topic: '' }, touched: [], read: false });
const lines = v => (Array.isArray(v) ? v : []).map(l => str(l, 200).trim()).filter(Boolean).slice(0, MAX_LINES);
function norm(x) {
  if (!isObj(x) || typeof x.id !== 'string' || !x.id) return null;
  const nx = isObj(x.next) ? x.next : {};
  return {
    id: str(x.id, 40), at: Number(x.at) || 0, kind: IDS.includes(x.kind) ? x.kind : 'etc', title: str(x.title, 100), date: date(x.date), time: str(x.time, 40),
    place: str(x.place, 100), attendees: str(x.attendees, 200),
    agenda: (Array.isArray(x.agenda) ? x.agenda : []).filter(isObj).map(a => ({ title: str(a.title, 120), discussion: lines(a.discussion), decisions: lines(a.decisions) }))
      .filter(a => a.title.trim() || a.discussion.length || a.decisions.length).slice(0, MAX_AGENDA),
    todos: (Array.isArray(x.todos) ? x.todos : []).filter(t => isObj(t) && String(t.task || '').trim())
      .map(t => ({ task: str(t.task, 150), who: str(t.who, 60), due: date(t.due), done: !!t.done })).slice(0, MAX_TODOS),
    next: { date: date(nx.date), topic: str(nx.topic, 150) },
    touched: (Array.isArray(x.touched) ? x.touched : []).filter(k => FIELD_KEYS.includes(k)), read: !!x.read
  };
}
/* 저장할 만한 것이 있나(빈 새 회의록은 목록에 넣지 않음) */
export function hasContent(x) {
  const r = x || {};
  return !!(String(r.title || '').trim() || String(r.place || '').trim() || String(r.attendees || '').trim() || String((r.next || {}).topic || '').trim()
    || (r.agenda || []).some(a => a && (String(a.title || '').trim() || (a.discussion || []).some(l => String(l).trim()) || (a.decisions || []).some(l => String(l).trim())))
    || (r.todos || []).some(t => t && String(t.task || '').trim()));
}
export function listMinutes() {
  const v = get(KEY, []);
  return (Array.isArray(v) ? v : []).map(norm).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, MAX_MINUTES);
}
export const getMinutes = id => listMinutes().find(x => x.id === id) || null;
/* 새 학년도에 가져갈 회의록(core/years.js carryOver): 끝내지 않은 할 일이 있는 것만, 이 모델이 받는 칸만(저장한 차례 그대로) — 2월 회의의 3월 할 일 */
export const carryMinutes = list => (Array.isArray(list) ? list : []).map(norm).filter(x => x && x.todos.some(t => !t.done));
/* 고칠 때마다 맨 앞으로(늦게 고친 것 먼저), 20개를 넘으면 오래된 것부터 뺌 */
export function putMinutes(x) {
  const n = norm({ ...x, at: Date.now() });
  if (!n) return false;
  return set(KEY, [n, ...listMinutes().filter(y => y.id !== n.id)].sort((a, b) => b.at - a.at).slice(0, MAX_MINUTES));
}
export const removeMinutes = id => set(KEY, listMinutes().filter(y => y.id !== id));
export const currentId = () => String(get(CUR, '') || '');
export const setCurrent = id => set(CUR, String(id || ''));
