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

/* 학년도를 옮기는 동안 모든 저장을 멈춤 (옮긴 학년도에 지난 자료가 섞이지 않게) */
let frozen = false;
export const freeze = () => { frozen = true; };
export const unfreeze = () => { frozen = false; };

export const FULL_MSG = '저장 공간이 모자라 저장하지 못했어요. 설정 › 학년도에서 백업한 뒤 쓰지 않는 자료를 지워 주세요.';
/* 저장이 실패하면(저장 공간이 꽉 참 등) 부를 함수: 창 틀이 알림을 띄움. 돌려받은 함수를 부르면 뺌 */
const failHooks = new Set();
export function onFail(fn) { failHooks.add(fn); return () => failHooks.delete(fn); }

export function set(key, value) {
  if (frozen) return false;
  try { if (!storage) return false; storage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch (e) { for (const fn of failHooks) { try { fn(key, e); } catch (er) {} } return false; }
}

/* 미뤄 둔 저장(글을 칠 때 잠깐 기다렸다 쓰는 것)을 지금 쓰게 하는 함수들: 창을 닫거나 학년도를 옮기기 전에 부름 */
const flushHooks = new Set();
export function onFlush(fn) { flushHooks.add(fn); return () => flushHooks.delete(fn); }
export function flushAll() { for (const fn of flushHooks) { try { fn(); } catch (e) {} } }

export function remove(key) {
  if (frozen) return;
  try { if (storage) storage.removeItem(PREFIX + key); } catch (e) {}
}

/* 이 사이트 저장소를 얼마나 썼는지 (브라우저는 사이트마다 약 5MB = 글자 5,242,880개까지). 같은 주소의 다른 페이지가 쓴 것도 셈 */
export const LIMIT = 5242880;
export function usage(s = storage) {
  let used = 0;
  try { if (s) for (let i = 0; i < s.length; i++) { const k = s.key(i); used += k.length + String(s.getItem(k) || '').length; } } catch (e) {}
  return { used, limit: LIMIT, ratio: used / LIMIT };
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
