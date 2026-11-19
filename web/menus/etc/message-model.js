/* 쪽지 저장 (스펙 2026-11-02 4.4·4.6): 보내는 사람(GLOBAL), 지금 쓰는 쪽지·최근 쪽지 5개(학년도 자료). 붙임 파일은 저장하지 않고 이름만 */
import { get, set } from '../../core/store.js';

const SENDER = 'msg:sender', DRAFT = 'msg:draft', LIST = 'msg:list';
export const MAX_MESSAGES = 5; // 최근 쪽지(예전 판은 20개)
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const LENS = ['short', 'base', 'long'];
const TOUCH = ['title', 'date', 'time', 'place', 'target', 'due', 'how', 'bring', 'notes']; // 선생님이 고친 칸(다시 읽어도 그대로)
export const newMessageId = () => 'msg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const getSender = () => String(get(SENDER, '') || '').trim();
export const setSender = s => set(SENDER, String(s || '').trim().slice(0, 80));

/* 지금 쪽지: { id, m(쪽지 칸), len, attach: [{ name, on }], edited(본문을 손으로 고침), body, title } */
function normDraft(d) {
  if (!isObj(d) || typeof d.id !== 'string' || !isObj(d.m)) return null;
  return { id: d.id, m: d.m, len: LENS.includes(d.len) ? d.len : 'base',
    attach: (Array.isArray(d.attach) ? d.attach : []).filter(isObj).map(a => ({ name: String(a.name || '').slice(0, 80), on: a.on !== false })).filter(a => a.name),
    edited: !!d.edited, body: String(d.body || ''), title: String(d.title || ''), again: !!d.again,
    touched: (Array.isArray(d.touched) ? d.touched : []).filter(k => TOUCH.includes(k)) };
}
export const getDraft = () => normDraft(get(DRAFT, null));
export const saveDraft = d => { const n = normDraft(d); return n ? set(DRAFT, n) : false; };
export const clearDraft = () => set(DRAFT, null);

/* 최근 쪽지: [{ id, at, title, kind, m, len, attach: [{ name, on }], attachNames }] 늦은 것 먼저.
   attach: 붙임 이름과 체크(뺀 붙임은 [열기]·[다시 안내]에서도 빠지게), 예전 쪽지(attachNames만)는 모두 체크 */
const normAttach = x => (Array.isArray(x.attach)
  ? x.attach.filter(isObj).map(a => ({ name: String(a.name || '').slice(0, 80), on: a.on !== false })).filter(a => a.name)
  : (Array.isArray(x.attachNames) ? x.attachNames : []).map(String).filter(Boolean).map(name => ({ name, on: true }))).slice(0, 20);
const normItem = x => {
  if (!(isObj(x) && typeof x.id === 'string' && isObj(x.m))) return null;
  const attach = normAttach(x);
  return { id: x.id, at: Number(x.at) || 0, title: String(x.title || ''), kind: String(x.kind || 'etc'), m: x.m, len: LENS.includes(x.len) ? x.len : 'base',
    attach, attachNames: attach.map(a => a.name), body: String(x.body || '').slice(0, 6000), edited: !!x.edited, again: !!x.again,
    touched: (Array.isArray(x.touched) ? x.touched : []).filter(k => TOUCH.includes(k)) }; // 고친 칸([열기] 뒤 다시 읽어도 그대로)
};
export function listMessages() {
  const v = get(LIST, []), l = (Array.isArray(v) ? v : []).map(normItem).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, MAX_MESSAGES);
  if (Array.isArray(v) && v.length > MAX_MESSAGES) set(LIST, l); // 예전 판이 20개까지 저장한 목록은 늦은 5개로 줄여 저장
  return l;
}
/* 같은 id는 그 자리를 고쳐 맨 앞으로, 5개까지 */
export function pushMessage(x) {
  const e = normItem({ at: Date.now(), ...x });
  if (!e) return false;
  return set(LIST, [e, ...listMessages().filter(y => y.id !== e.id)].sort((a, b) => b.at - a.at).slice(0, MAX_MESSAGES));
}
/* 넣은 파일을 붙임 자리에: 파일이 없는(다시 연·새로 고친) 붙임과 이름이 같으면 그 자리에(filled), 아니면 붙임을 더함(added).
   attach는 그 자리에서 고침, has(k): k번째 붙임에 파일이 있나 → { slots: [[붙임 번호, 파일]], filled, added } */
export function placeFiles(attach, has, files, nameOf) {
  const slots = [], taken = new Set();
  let filled = 0, added = 0;
  for (const f of files || []) {
    const nm = nameOf(f.name), i = attach.findIndex((a, k) => !has(k) && !taken.has(k) && a.name === nm);
    if (i >= 0) { slots.push([i, f]); taken.add(i); filled++; }
    else { attach.push({ name: nm, on: true }); slots.push([attach.length - 1, f]); taken.add(attach.length - 1); added++; }
  }
  return { slots, filled, added };
}
/* AI가 채운(선생님이 고치지 않은) 칸이 있나 — 다시 읽으면 바뀔 칸 */
export function aiFilled(m, touched = []) {
  if (!isObj(m)) return false;
  const t = k => touched.includes(k), w = (m.when || [])[0] || {}, ap = m.apply || {};
  return !!((m.title && !t('title')) || ((m.when || []).length && (w.date || w.time) && !(t('date') && t('time'))) || (m.place && !t('place')) || (m.target && !t('target'))
    || (ap.due && !t('due')) || (ap.how && !t('how')) || (m.bring && !t('bring')) || (m.notes && !t('notes')));
}
/* 파일을 넣은 뒤 바로 AI로 읽나(r: placeFiles 결과). filled: AI가 채운 칸이 있나(aiFilled), held: 이 쪽지를 쓴 파일·글이 넣기 전에 화면에 다 있었나.
   AI가 채운 쪽지인데 그 파일·글이 화면에 없으면(새로 고친 뒤·최근 쪽지 [열기] 뒤 — 붙임은 이름만) 읽지 않음: 넣은 파일(신청서 양식 등)만 읽어
   써 둔 칸·본문을 덮지 않게(앱이 「파일을 다시 넣어 주세요」라고 알려 다시 넣는 붙임도). 같은 화면에서 새 파일을 더 넣으면 다시 읽음(고친 칸은 그대로) */
export const readsAfterAdd = (r, { filled = false, held = false } = {}) => !filled || !!(held && r && r.added > 0);
/* 최근 쪽지에서 지우기([삭제]). 붙임 파일(다운로드 폴더)은 건드리지 않음 */
export const removeMessage = id => set(LIST, listMessages().filter(y => y.id !== id));
/* 「오늘 할 일」 줄(스펙 2026-11-19-yearend-design §3): 최근 쪽지의 신청·회신 기한이 지났거나(3일까지) 7일 안 — 보낸 쪽지의 회신을 모을 때 */
const dayNo = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
export function deadlineLines(list, today) {
  const t = dayNo(today), out = [], seen = new Set();
  if (t == null) return out;
  for (const x of list || []) {
    const due = x && x.m && x.m.apply && x.m.apply.due, d = dayNo(due);
    if (d == null) continue;
    const n = Math.round(d - t);
    if (n < -3 || n > 7) continue;
    // [다시 안내]로 다시 보낸 같은 쪽지(같은 제목·같은 마감)는 한 줄 — 목록은 새것부터라 다시 안내한 쪽이 남음
    const title = String(x.title || '안내').replace(/^\[[^\]]*\]\s*/, ''), key = `${title}|${due}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ n, text: `쪽지 「${title}」 신청·회신 마감`, when: n === 0 ? '오늘' : n > 0 ? `D-${n}` : `${-n}일 지남`, hot: n <= 1, route: { to: 'message' } });
  }
  return out.sort((a, b) => a.n - b.n).map(({ n, ...r }) => r);
}
