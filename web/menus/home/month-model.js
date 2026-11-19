/* 한 달 달력 규칙(스펙 2026-11-19-month-calendar-design). 화면 없음 — Node 시험에서도 씀. 모으기·시트는 month.js.
   모은 자료 d + 달 ym('2026-11') → monthGrid(일~토 줄) · monthItems(날짜 → 그날 할 것). AI를 부르지 않음 */
import { HOLIDAYS, addDays, isDate, weekday } from '../../core/calendar.js';

/* 종류(차례 = 그날 목록의 차례): 쉬는 날·학사일정·공문 기한·연수·예산·기초학력·쪽지 회신·회의 할 일 */
export const KINDS = [['off', '쉬는 날'], ['school', '학사일정'], ['gongmun', '공문 기한'], ['training', '연수'], ['budget', '예산 마감'],
  ['camp', '기초학력'], ['message', '쪽지 회신'], ['minutes', '회의 할 일']];
export const kindLabel = k => (KINDS.find(x => x[0] === k) || [k, k])[1];
const RANK = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
const won = n => Number(n || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');

export const isMonth = ym => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || ''));
export const monthOf = date => String(date || '').slice(0, 7);
export const monthTitle = ym => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;
/* 달 옮기기: shiftMonth('2026-12', 1) → '2027-01' */
export function shiftMonth(ym, n) {
  const i = +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}
const lastDay = ym => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();

/* 달력 칸: 일요일부터 토요일까지 줄(앞뒤 달 날짜도 칸을 채우고 inMonth=false) → [[{ date, inMonth }] ×7] */
export function monthGrid(ym) {
  const first = `${ym}-01`, last = `${ym}-${pad(lastDay(ym))}`;
  const weeks = [];
  for (let d = addDays(first, -weekday(first)); d <= last || weekday(d) !== 0; d = addDays(d, 1)) {
    if (weekday(d) === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ date: d, inMonth: d >= first && d <= last });
    if (weeks.length > 6) break;
  }
  return weeks;
}

/* 학사일정 출처 → 갈 곳: 공문 기한·연수 기한은 그 메뉴, 연간계획(year:…)·행사계획(event:…)은 그 계획 */
function eventRow(e) {
  const s = String(e.source || '');
  if (s === 'gongmun') return { kind: 'gongmun', text: e.title, route: { to: 'gongmun' } };
  if (s === 'training') return { kind: 'training', text: `필수연수 ${e.title}`, route: { to: 'training', tab: 'mine' } };
  if (s.startsWith('event:')) return { kind: 'school', text: e.title, route: { to: 'event', id: s.slice(6) } };
  return { kind: 'school', text: e.title, route: { to: 'year' } };
}

/* d: { events, breaks, courses: [{ title, due, left }], budgets: [{ name, due, left }], camps: [{ id, name, dates }], messages: [{ title, due }],
   todos: [{ id, meeting, task, due }] } → { 'YYYY-MM-DD': [{ kind, text, route, hot }] } (그 달 칸에 보이는 날짜만, 종류 차례) */
export function monthItems(d = {}, ym, today = '') {
  const weeks = monthGrid(ym), from = weeks[0][0].date, to = weeks[weeks.length - 1][6].date;
  const out = {}, seen = new Set();
  const put = (date, row) => {
    if (!isDate(date) || date < from || date > to) return;
    const key = `${date}|${row.kind}|${row.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    (out[date] = out[date] || []).push({ hot: false, ...row });
  };
  // 쉬는 날: 공휴일, 설정 › 학교 정보의 방학·재량휴업일(한 기간은 90일까지)
  for (let x = from; x <= to; x = addDays(x, 1)) if (HOLIDAYS[x]) put(x, { kind: 'off', text: HOLIDAYS[x], route: null });
  for (const b of d.breaks || []) {
    if (!b || !isDate(b.from) || !isDate(b.to) || b.from > b.to) continue;
    for (let x = b.from > from ? b.from : from, i = 0; x <= b.to && x <= to && i < 90; x = addDays(x, 1), i++) put(x, { kind: 'off', text: String(b.label || '방학').trim() || '방학', route: { to: 'settings', tab: 'school' } });
  }
  for (const e of d.events || []) if (e && isDate(e.date) && e.title) put(e.date, eventRow(e));
  // 연수 현황판 제출 기한(미제출이 남았으면 몇 명인지)
  // need: 남은 것이 없으면(미제출 0명·남은 돈 0원) 기한이 가까워도 눈에 띄게 하지 않음
  for (const c of d.courses || []) if (c && isDate(c.due)) put(c.due, { kind: 'training', text: `연수 현황 「${c.title}」 제출 기한${c.left ? ` · 미제출 ${c.left}명` : ''}`, route: { to: 'training', tab: 'board' }, need: !!c.left });
  // 예산 집행 마감(남은 돈이 있으면 얼마인지)
  for (const p of d.budgets || []) if (p && isDate(p.due)) put(p.due, { kind: 'budget', text: `예산 「${p.name}」 집행 마감${p.left > 0 ? ` · 남은 ${won(p.left)}원` : ''}`, route: { to: 'budget' }, need: p.left > 0 });
  // 기초학력 수업(같은 날 여러 줄이면 한 번, 몇 번인지)
  for (const c of d.camps || []) {
    const n = {};
    for (const x of c.dates || []) if (isDate(x)) n[x] = (n[x] || 0) + 1;
    for (const [x, k] of Object.entries(n)) put(x, { kind: 'camp', text: `기초학력 「${c.name || '기초학력'}」 수업${k > 1 ? ` ${k}번` : ''}`, route: { to: 'camp' } });
  }
  for (const m of d.messages || []) if (m && isDate(m.due)) put(m.due, { kind: 'message', text: `쪽지 「${String(m.title || '안내').replace(/^\[[^\]]*\]\s*/, '')}」 신청·회신 마감`, route: { to: 'message' } });
  for (const t of d.todos || []) if (t && isDate(t.due) && t.task) put(t.due, { kind: 'minutes', text: `회의 할 일: ${t.task}`, route: { to: 'minutes', id: t.id } });
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    // 오늘부터 사흘 안의 기한은 눈에 띄게(쉬는 날·학사일정 빼고)
    for (const r of out[k]) {
      if (isDate(today) && r.need !== false && !['off', 'school', 'camp'].includes(r.kind) && k >= today && k <= addDays(today, 3)) r.hot = true;
      delete r.need;
    }
  }
  return out;
}
/* 그 달(칸에 보이는 앞뒤 달 날짜 빼고) 할 것 수 — 쉬는 날은 빼고 */
export const monthCount = (items, ym) => Object.entries(items).filter(([k]) => monthOf(k) === ym).reduce((n, [, l]) => n + l.filter(r => r.kind !== 'off').length, 0);
