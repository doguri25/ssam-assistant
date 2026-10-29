/* 보관함: 지금이 아닌 학년도의 자료 묶음을 학년도별로 둠 (IndexedDB — 브라우저 저장소보다 넉넉함).
   묶음 = { '<키(ssam: 뺀 것)>': '<저장된 글 그대로>' } */
const DB = 'ssam-archive', STORE = 'years';
const sizeOf = data => Object.entries(data || {}).reduce((n, [k, v]) => n + k.length + String(v).length, 0);
const entry = (year, data) => ({ year, savedAt: Date.now(), size: sizeOf(data), data });
const info = v => ({ year: v.year, savedAt: v.savedAt, size: v.size });
const desc = list => list.sort((a, b) => b.year - a.year);

export function openArchive() {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'year' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; no(r.error); };
  }));
  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((ok, no) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = tx.onabort = () => no(tx.error || new Error('archive'));
    });
  };
  return {
    put: (year, data) => run('readwrite', s => s.put(entry(year, { ...data }))),
    get: async year => { const v = await run('readonly', s => s.get(year)); return v ? { ...v.data } : null; },
    del: year => run('readwrite', s => s.delete(year)),
    list: async () => desc(((await run('readonly', s => s.getAll())) || []).map(info))
  };
}

/* 시험용: 메모리 보관함 */
export function memArchive() {
  const m = new Map();
  return {
    put: async (year, data) => { m.set(year, entry(year, { ...data })); },
    get: async year => (m.has(year) ? { ...m.get(year).data } : null),
    del: async year => { m.delete(year); },
    list: async () => desc([...m.values()].map(info))
  };
}
