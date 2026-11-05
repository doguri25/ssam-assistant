/* 설정 값: 학교 정보(방학·재량휴업일 포함), 품의 계약 기준 금액.
   학급 명단·AI·테마는 각각 평가 메뉴(window.SSAM)·core/theme.js가 맡음 */
import { get, set } from './store.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMIT_DEFAULT = 20000000;
const int0 = v => Math.max(0, Math.floor(Number(v) || 0));

/* 학년도: 9월까지는 올해, 10월부터는 다음 해를 계획하는 때로 봄 */
export function defaultYear(now = new Date()) {
  return now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}

function cleanBreaks(list) {
  return (Array.isArray(list) ? list : [])
    .filter(b => b && DATE.test(b.from) && DATE.test(b.to) && b.from <= b.to)
    .map(b => ({ from: b.from, to: b.to, label: String(b.label || '').trim() }));
}

/* 지금 자료의 학년도(설정 › 학년도, years.js getYears와 같음). 없으면 오늘이 든 학년도(1·2월은 전해) */
function dataYear(now) {
  const v = get('years', null);
  if (v && Number.isInteger(v.current)) return v.current;
  return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

/* 계획 학년도: 선생님이 고른 해(yearSet)는 그대로, 없으면 defaultYear.
   예전에는 학교 정보를 저장할 때 화면의 자동값이 그대로 저장됨(yearSet 없음). 그 값이 지금 자료 학년도 이후인데
   자동값보다 앞서면(10월이 지나 지난 해가 됨) 자동값을 따름. 자료 학년도보다 앞선 해는 일부러 고른 것으로 보고 둠 */
function planYear(v, now) {
  const auto = defaultYear(now);
  if (!Number.isInteger(v.year)) return auto;
  if (!v.yearSet && v.year >= dataYear(now) && v.year < auto) return auto;
  return v.year;
}

export function getSchool(now = new Date()) {
  const v = get('school', null) || {};
  return {
    name: String(v.name || ''),
    year: planYear(v, now),
    classes: int0(v.classes),
    students: int0(v.students),
    breaks: cleanBreaks(v.breaks)
  };
}

/* 계획 학년도(obj.year): 2001 이상 정수면 선생님이 고른 해로 저장, null이면 지워 자동값으로,
   주지 않았거나 틀린 값이면 저장된 그대로 (화면의 자동값을 저장해 그해로 굳지 않게) */
export function setSchool(obj) {
  const cur = getSchool(), old = get('school', null) || {};
  const next = {
    name: obj.name != null ? String(obj.name).trim() : cur.name,
    classes: obj.classes != null ? int0(obj.classes) : cur.classes,
    students: obj.students != null ? int0(obj.students) : cur.students,
    breaks: obj.breaks != null ? cleanBreaks(obj.breaks) : cur.breaks
  };
  if (Number.isInteger(+obj.year) && +obj.year > 2000) Object.assign(next, { year: +obj.year, yearSet: true });
  else if (obj.year !== null && Number.isInteger(old.year)) Object.assign(next, { year: old.year }, old.yearSet ? { yearSet: true } : {});
  // 저장하지 못하면 null (화면이 알림). 돌려주는 값은 getSchool과 같은 모양
  return set('school', next) ? getSchool() : null;
}

export function getPurchaseLimit() {
  const v = get('purchaseLimit', LIMIT_DEFAULT);
  return Number.isFinite(v) && v > 0 ? v : LIMIT_DEFAULT;
}

/* 1원 이상 정수만 받음. 받으면 true, 값이 틀리면 false, 저장 공간이 모자라면 'full' */
export function setPurchaseLimit(won) {
  const v = Number(won);
  if (!Number.isFinite(v) || v < 1) return false;
  return set('purchaseLimit', Math.floor(v)) || 'full';
}

/* 협의회 1인 상한(원, 참고용). 교육청·학교마다 달라서 선생님이 정함. 기본 40,000원 */
const MEET_CAP_DEFAULT = 40000;
export function getMeetCap() {
  const v = get('purchaseMeetCap', MEET_CAP_DEFAULT);
  return Number.isFinite(v) && v > 0 ? v : MEET_CAP_DEFAULT;
}
export function setMeetCap(won) {
  const v = Number(won);
  if (!Number.isFinite(v) || v < 1) return false;
  return set('purchaseMeetCap', Math.floor(v)) || 'full';
}

/* 품의 넣는 방식: 'oneshot'(넣기 칸 → 바로 초안, 기본) · 'ask'(빠진 것만 물어보고 초안). 학년도와 상관없이 */
export const getPurchaseFlow = () => (get('purchase:flow', 'oneshot') === 'ask' ? 'ask' : 'oneshot');
export const setPurchaseFlow = v => set('purchase:flow', v === 'ask' ? 'ask' : 'oneshot');
