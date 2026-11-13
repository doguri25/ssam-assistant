/* 기초학력 캠프 › 차시 수로 날짜 만들기 (화면 없음 — Node 시험에서도 씀). 2026-11-13 선생님 요청
   시작 날부터 고른 요일(공휴일은 뺌)에 차시 수만큼 수업 날을 셈. 요일마다 시간이 다를 수 있고(수 13:40~14:20, 목 14:30~15:10),
   하루에 여러 차시면 그 요일 시간(한 차시 길이)으로 쉬는 시간을 두고 이어 붙임. 끝 날을 주면 거기까지만 */
import { isDate, addDays, weekday, HOLIDAYS } from '../../core/calendar.js';
import { normTime } from './camp-model.js';

const toMin = t => { const n = normTime(t); return n ? +n.slice(0, 2) * 60 + +n.slice(3) : NaN; };
const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const MAX_DAYS = 400; // 1년 남짓까지만 셈

/* 수업 날: from부터(포함) weekdays(0=일 … 6=토)인 날, 공휴일 빼고, ceil(n / perDay)일. to가 있으면 그날까지 */
export function countDates({ from, to = '', weekdays = [], n = 0, perDay = 1 } = {}) {
  const need = Math.ceil(Math.max(0, Math.floor(n) || 0) / Math.max(1, Math.floor(perDay) || 1));
  const wd = (Array.isArray(weekdays) ? weekdays : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!isDate(from) || !need || !wd.length) return [];
  const end = isDate(to) && to >= from ? to : '';
  const out = [];
  for (let d = from, i = 0; out.length < need && i < MAX_DAYS && (!end || d <= end); d = addDays(d, 1), i++) {
    if (wd.includes(weekday(d)) && !HOLIDAYS[d]) out.push(d);
  }
  return out;
}

/* 차시 수 → 수업 줄 모양 [{ date, start, end, subject }] + short(기간 안에 들어가지 못한 차시 수).
   days: { 요일: { start, end } } — 한 차시 시간(끝이 시작보다 뒤여야 함). 교과는 차시마다 subjects를 돌림 */
export function sessionsByCount({ from, to = '', days = {}, n = 0, perDay = 1, rest = 10, subjects = [] } = {}) {
  const k = Math.max(1, Math.min(10, Math.floor(perDay) || 1)), gap = Math.max(0, Math.min(120, Math.floor(rest) || 0));
  const want = Math.max(0, Math.min(300, Math.floor(n) || 0));
  const ok = Object.entries(days || {}).map(([d, t]) => [+d, toMin(t && t.start), toMin(t && t.end)])
    .filter(([d, a, b]) => Number.isInteger(d) && d >= 0 && d <= 6 && Number.isFinite(a) && Number.isFinite(b) && b > a);
  const time = Object.fromEntries(ok.map(([d, a, b]) => [d, [a, b]]));
  const dates = countDates({ from, to, weekdays: ok.map(([d]) => d), n: want, perDay: k });
  const subs = (Array.isArray(subjects) ? subjects : []).map(s => String(s || '').trim()).filter(Boolean);
  const specs = [];
  for (const date of dates) {
    const [a, b] = time[weekday(date)], len = b - a;
    for (let i = 0; i < k && specs.length < want; i++) {
      const s = a + i * (len + gap), e = s + len;
      if (e >= 24 * 60) break;
      specs.push({ date, start: fromMin(s), end: fromMin(e), subject: subs.length ? subs[specs.length % subs.length] : '' });
    }
  }
  return { specs, short: want - specs.length };
}
