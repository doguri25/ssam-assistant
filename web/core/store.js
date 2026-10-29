/* 저장: 지금은 이 컴퓨터(브라우저 저장소). 키 앞에 'ssam:'을 붙이고 JSON으로 저장.
   나중에 학교 서버를 붙일 때 이 파일만 바꾼다 */
const PREFIX = 'ssam:';
let storage = (() => { try { return globalThis.localStorage || null; } catch (e) { return null; } })();

/* 시험용: 다른 저장소 끼우기 */
export function useStorage(s) { storage = s; }

export function get(key, fallback = null) {
  try {
    const v = storage && storage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) { return fallback; }
}

export function set(key, value) {
  try { if (!storage) return false; storage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

export function remove(key) {
  try { if (storage) storage.removeItem(PREFIX + key); } catch (e) {}
}

/* 접두어로 시작하는 키 목록 ('ssam:'은 뺀 이름) */
export function list(prefix = '') {
  const out = [];
  try {
    if (!storage) return out;
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
    }
  } catch (e) {}
  return out;
}
