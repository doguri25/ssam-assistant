/* 보관함: 지금이 아닌 학년도의 자료 묶음을 학년도별로 둠 (IndexedDB — 브라우저 저장소보다 넉넉함).
   묶음 = { '<키(ssam: 뺀 것)>': '<저장된 글 그대로>' } */
const DB = 'ssam-archive', STORE = 'years', INFO = 'info'; // info: 목록용 { year, savedAt, size } (자료를 다 읽지 않게)
const sizeOf = data => Object.entries(data || {}).reduce((n, [k, v]) => n + k.length + String(v).length, 0);
const entry = (year, data) => ({ year, savedAt: Date.now(), size: sizeOf(data), data });
const info = v => ({ year: v.year, savedAt: v.savedAt, size: v.size });
const desc = list => list.sort((a, b) => b.year - a.year);

export function openArchive() {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = e => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'year' });
      if (!d.objectStoreNames.contains(INFO)) {
        const inf = d.createObjectStore(INFO, { keyPath: 'year' });
        // 1판에서 올라오면 지금 있는 학년도의 목록 정보를 한 번 만듦
        if (e.oldVersion >= 1) r.transaction.objectStore(STORE).openCursor().onsuccess = ev => { const c = ev.target.result; if (c) { inf.put(info(c.value)); c.continue(); } };
      }
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; no(r.error); };
    r.onblocked = () => { dbp = null; no(new Error('blocked')); };
  }));
  const run = async (stores, mode, fn) => {
    const d = await db();
    return new Promise((ok, no) => {
      const tx = d.transaction(stores, mode);
      const req = fn(tx);
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = tx.onabort = () => no(tx.error || new Error('archive'));
    });
  };
  return {
    put: (year, data) => run([STORE, INFO], 'readwrite', tx => { const e = entry(year, { ...data }); tx.objectStore(INFO).put(info(e)); return tx.objectStore(STORE).put(e); }),
    get: async year => { const v = await run([STORE], 'readonly', tx => tx.objectStore(STORE).get(year)); return v ? { ...v.data } : null; },
    del: year => run([STORE, INFO], 'readwrite', tx => { tx.objectStore(INFO).delete(year); return tx.objectStore(STORE).delete(year); }),
    list: async () => desc(((await run([INFO], 'readonly', tx => tx.objectStore(INFO).getAll())) || []).map(info))
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
