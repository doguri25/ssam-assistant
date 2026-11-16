/* 평가 › 한눈에 [마치기] (2026-11-16): 결과 확인 칸의 평가를 선생님이 마친 것으로 — 학년도 자료 「eval:closed」({ '종류:id': 마친 때 }).
   마친 평가는 한눈에서 끝난 평가로 접고 선생님 차례에서 빼요. 점수·글은 그대로이고 [다시 열기]로 되돌려요. 화면 없음(Node 시험에서도 씀) */
import * as store from '../../core/store.js';

const KEY = 'eval:closed';
const all = () => { const v = store.get(KEY, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
const k = (kind, id) => `${kind}:${id}`;
export const isClosed = (kind, id) => !!all()[k(kind, id)];
/* on: true 마침, false 다시 열기 → 저장했으면 true */
export function setClosed(kind, id, on) {
  const v = { ...all() };
  if (on) v[k(kind, id)] = Date.now(); else delete v[k(kind, id)];
  return store.set(KEY, v);
}
