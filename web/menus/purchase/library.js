/* 품의 보관: 최근 작성(초안을 만든 품의·구입처별로 나눈 품의, 20개)과 저장한 템플릿(50개). 학년도 자료 */
import { get, set } from '../../core/store.js';

const RECENT = 'purchase:recent', TPL = 'purchase:templates';
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export const newId = () => 'pc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- 최근 작성 ---------- */
const normRecent = x => (isObj(x) && typeof x.id === 'string' && isObj(x.form)
  ? { id: x.id, at: Number(x.at) || 0, form: x.form, draft: isObj(x.draft) && typeof x.draft.title === 'string' ? x.draft : null } : null);
export const listRecent = () => { const v = get(RECENT, []); return (Array.isArray(v) ? v : []).map(normRecent).filter(Boolean); };
/* 같은 id는 그 자리를 고쳐 맨 앞으로, 20개까지. 저장하지 못하면 false */
export function pushRecent(entry) {
  const e = normRecent({ at: Date.now(), ...entry });
  if (!e) return false;
  return set(RECENT, [e, ...listRecent().filter(x => x.id !== e.id)].slice(0, 20));
}
export const deleteRecent = id => set(RECENT, listRecent().filter(x => x.id !== id));
/* 예산 탭에서 그 품의 줄의 사업을 바꿈: 최근 작성의 품의도 그 사업으로(선생님이 고른 것 — 자리·시각은 그대로).
   그대로 두면 그 품의를 [열기]할 때 예전 사업으로 장부를 덮어썼음 */
export function setRecentProject(id, project) {
  const list = listRecent();
  if (!list.some(x => x.id === id)) return false;
  return set(RECENT, list.map(x => (x.id === id ? { ...x, form: { ...x.form, projectId: String(project || ''), projectSet: true } } : x)));
}

/* ---------- 저장한 템플릿 ---------- */
const normTpl = x => (isObj(x) && typeof x.id === 'string' && isObj(x.form) ? { id: x.id, name: String(x.name || '이름 없는 템플릿').slice(0, 60), savedAt: Number(x.savedAt) || 0, form: x.form } : null);
export const listTemplates = () => { const v = get(TPL, []); return (Array.isArray(v) ? v : []).map(normTpl).filter(Boolean); };
/* 일시·메모·총액은 비우고 저장(불러오면 날짜만 고치면 되게, 지난 총액이 경고를 내지 않게). 50개를 넘으면 오래된 것부터 뺌 */
export function saveTemplate(name, form) {
  const t = { id: newId(), name: String(name || '').trim().slice(0, 60) || String(form.project || '').trim().slice(0, 60) || '이름 없는 템플릿', savedAt: Date.now(), form: { ...form, date: '', memo: '', total: '' } };
  return set(TPL, [t, ...listTemplates()].slice(0, 50)) ? t : null;
}
export function renameTemplate(id, name) {
  const n = String(name || '').trim().slice(0, 60);
  if (!n) return false;
  return set(TPL, listTemplates().map(t => (t.id === id ? { ...t, name: n } : t)));
}
export const deleteTemplate = id => set(TPL, listTemplates().filter(t => t.id !== id));
export const templateForm = tpl => ({ ...tpl.form, date: '', memo: '', total: '' });
