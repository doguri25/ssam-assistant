/* 학교 양식 저장 (스펙 2026-11-03 가정통신문 3.5): IndexedDB 「ssam-forms」(학년도와 상관없음 — 다음 해에도 씀).
   양식 = { id, name, kind: 'hwpx'|'plain', bytes(hwpx, 5MB까지), plain, roles, savedAt }. 저장소를 못 쓰면 이 화면에서만(메모리).
   forms(ns): 다른 문서 양식은 따로 둠(「handover」 → 「ssam-forms-handover」, 기타 › 인수인계서). 이름 없으면 가정통신문·결과 보고가 같이 쓰는 「ssam-forms」 */
const DB = 'ssam-forms', STORE = 'forms';
export const MAX_FORM = 5 * 1024 * 1024;
export const newFormId = () => 'fm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function memForms() {
  const m = new Map();
  return {
    put: async f => { m.set(f.id, { ...f }); },
    get: async id => (m.has(id) ? { ...m.get(id) } : null),
    del: async id => { m.delete(id); },
    list: async () => [...m.values()].map(({ bytes, ...r }) => ({ ...r, size: bytes ? bytes.length : 0 })).sort((a, b) => b.savedAt - a.savedAt)
  };
}

export const dbName = (ns = '') => (ns ? `${DB}-${String(ns).replace(/[^\w-]/g, '')}` : DB);
export function openForms(name = DB) {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; no(r.error); };
    r.onblocked = () => { dbp = null; no(new Error('blocked')); };
  }));
  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((ok, no) => {
      const tx = d.transaction([STORE], mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = tx.onabort = () => no(tx.error || new Error('forms'));
    });
  };
  return {
    put: f => run('readwrite', s => s.put(f)),
    get: async id => (await run('readonly', s => s.get(id))) || null,
    del: id => run('readwrite', s => s.delete(id)),
    list: async () => ((await run('readonly', s => s.getAll())) || []).map(({ bytes, ...r }) => ({ ...r, size: bytes ? bytes.length : 0 })).sort((a, b) => b.savedAt - a.savedAt)
  };
}

/* 저장소를 쓸 수 있으면 IndexedDB, 아니면 메모리(알림은 부르는 쪽에서). 이름(ns)마다 하나 */
const shared = new Map();
async function make(ns) {
  try { if (typeof indexedDB === 'undefined') throw new Error('no idb'); const f = openForms(dbName(ns)); await f.list(); f.persistent = true; return f; }
  catch (e) { const m = memForms(); m.persistent = false; return m; }
}
export function forms(ns = '') {
  const k = dbName(ns);
  if (!shared.has(k)) shared.set(k, make(ns));
  return shared.get(k);
}
