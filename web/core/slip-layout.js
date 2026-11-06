/* 피드백 쪽지·결과지를 번호별로 한 장씩 (자르지 않고 나눠 주게): 활동지 피드백 쪽지와 단원평가 결과지가 같이 씀.
   선생님이 고른 것을 기억함(학년도와 상관없이). 꺼져 있으면 활동지는 한 쪽에 4명, 단원평가는 한 쪽에 2명 */
import { get, set } from './store.js';

const KEY = 'slips';
export const onePerPage = () => !!(get(KEY, null) || {}).one;
export const setOnePerPage = on => set(KEY, { one: !!on });
