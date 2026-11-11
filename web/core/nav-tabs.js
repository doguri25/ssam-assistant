/* 메뉴마다 마지막으로 연 탭: 세로 메뉴를 다시 누르면(탭 없이 go(메뉴)) 그 메뉴에서 쓰던 탭으로 돌아감.
   공통 키 ssam:nav:tabs(화면 상태라 학년도와 상관없음 — years.js GLOBAL) = { 메뉴: 탭 } */
export const TABS_KEY = 'ssam:nav:tabs';

/* 저장된 글 → { 메뉴: 탭 } (망가졌거나 없으면 빈 것, 글자가 아닌 값은 버림) */
export function parseTabs(text) {
  let v = null;
  try { v = JSON.parse(text); } catch (e) {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k, t]) => typeof t === 'string' && k));
}

/* 열 탭: 부른 쪽이 정한 탭 → 그 메뉴에서 마지막으로 연 탭 → 첫 탭. 이제 없는 탭은 버림.
   평가는 기존 앱 화면(legacy: 교과 평어·창체·행특·채점)이 마지막이면 기존 앱이 지금 보이는 화면(mode)을 따름
   (기존 앱이 스스로 화면을 바꿨을 수 있어서). menu = { id, tabs: [{ id }] }. 탭이 없는 메뉴(오늘)는 '' */
export function pickTab(menu, asked, last, { legacy = [], mode } = {}) {
  if (!menu.tabs.length) return '';
  const has = id => typeof id === 'string' && menu.tabs.some(t => t.id === id);
  if (has(asked)) return asked;
  const r = last && typeof last === 'object' ? last[menu.id] : null;
  if (has(r) && !legacy.includes(r)) return r;
  if (has(mode) && legacy.includes(mode)) return mode;
  return has(r) ? r : menu.tabs[0].id;
}
