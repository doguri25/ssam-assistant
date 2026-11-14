/* 평가 › 기재 점검 「그대로 두기」(스펙 2026-11-14-eval-redesign §7): 둔 곳의 열쇠(check-view issueKey)를 학년도 저장소 check:keep에 목록으로 둠.
   다시 열어도 그대로 둔 곳은 세지 않음. 점검에 들어온 글에서 그 곳이 이제 없으면(고쳤거나 그 문장이 바뀜) 열쇠를 지움 */
import * as store from '../../../core/store.js';
import { keyRef } from './check-view.js';

export const KEEP_KEY = 'check:keep';
const MAX = 2000; // 넘으면 오래된 것부터 버림

const readList = () => { const v = store.get(KEEP_KEY, []); return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : []; };
const write = list => store.set(KEEP_KEY, list.slice(-MAX));

export const readKeep = () => new Set(readList());
/* 열쇠 더하기(같은 것은 한 번, 새로 둔 것이 뒤로). 저장하지 못하면 false */
export function addKeep(keys) {
  const add = (Array.isArray(keys) ? keys : [...(keys || [])]).filter(x => typeof x === 'string' && x);
  const set = new Set(add);
  return write([...readList().filter(x => !set.has(x)), ...set]);
}
/* loaded: 이번에 점검한 글(ref) Set, live: 지금 있는 곳의 열쇠 Set → 읽은 글에서 지금 없는 곳만 지움 */
export function pruneKeep(loaded, live) {
  const list = readList(), next = list.filter(k => !loaded.has(keyRef(k)) || live.has(k));
  if (next.length !== list.length) write(next);
}
/* refs(없으면 모두)의 그대로 둔 곳을 다시 보이게 */
export function clearKeep(refs = null) {
  if (!refs) { store.remove(KEEP_KEY); return; }
  write(readList().filter(k => !refs.has(keyRef(k))));
}
