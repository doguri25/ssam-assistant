/* 사업별 예산 집행 현황 (스펙 2026-11-18-budget-design, 화면 없음 — Node 시험에서도 씀). 화면은 budget.js(예산 탭)·purchase.js(사업 칸·올림 단추).
   학년도 자료: budget:projects(사업: 이름·예산·마감·계획서 비교 글), budget:ledger(품의 하나에 한 줄 — 집행(올림 표시·직접 더함)·예정(올리지 않은 초안)).
   학년도와 상관없는 요약: budget:alerts(학년도를 바꾼 뒤에도 지난 학년도 사업의 마감 알림을 띄우려고 — years.js GLOBAL). AI는 쓰지 않음 */
import { get, set } from '../../core/store.js';
import { sumItems } from './rules.js';
const DEMO_YEAR = 9999; // core/years.js DEMO_YEAR

const P = 'budget:projects', L = 'budget:ledger', ALERTS = 'budget:alerts', MIG = 'budget:migrated';
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n = 120) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const money = v => { const n = Math.round(Number(String(v == null ? '' : v).replace(/[,\s원₩]/g, ''))); return Number.isFinite(n) && n > 0 ? n : 0; };
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const won = n => Number(n || 0).toLocaleString('ko-KR');
const dot = d => (isDay(d) ? `${+d.slice(0, 4)}. ${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '');
const days = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

/* 비교용 글: 「」·(안)·앞 연도·끝의 「운영 계획(서)」「계획(서)」「운영(비)」·띄어쓰기·문장 부호를 뺌 */
export function planKey(s) {
  return String(s == null ? '' : s).replace(/[「」『』"'“”‘’]/g, ' ').replace(/\(\s*안\s*\)|\(\s*案\s*\)/g, ' ')
    .replace(/^\s*\d{4}\s*(?:학년도|년도|년)?\s*/, '').replace(/\s*(?:운영\s*)?계획\s*서?\s*$/, '').replace(/\s*운영\s*비?\s*$/, '')
    .replace(/[^가-힣A-Za-z0-9]/g, '').toLowerCase();
}
/* 학교회계 연도 끝(학년도 다음 해 2월 말일) */
export function defaultDue(year) {
  const y = Number(year) + 1, leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-02-${leap ? 29 : 28}`;
}
export const dueOf = (p, year) => (p && isDay(p.due) ? p.due : defaultDue(year));

/* ---------- 사업 ---------- */
const normProject = x => (isObj(x) && typeof x.id === 'string' && str(x.name)
  ? { id: x.id, name: str(x.name, 80), amount: money(x.amount), due: isDay(x.due) ? x.due : '', planKey: typeof x.planKey === 'string' ? x.planKey : '', at: Number(x.at) || 0 } : null);
export const listProjects = () => { const v = get(P, []); return (Array.isArray(v) ? v : []).map(normProject).filter(Boolean); };
export function saveProject({ id = '', name, amount, due = '', planKey: pk } = {}) {
  const list = listProjects(), old = list.find(p => p.id === id);
  const p = normProject({ id: old ? old.id : newId('bp'), name, amount, due, planKey: pk != null ? pk : old ? old.planKey : planKey(name), at: old ? old.at : Date.now() });
  if (!p) return null;
  set(P, old ? list.map(x => (x.id === p.id ? p : x)) : [...list, p]);
  return p;
}
/* 사업을 지우면 그 품의 줄은 「사업 없음」으로(장부 줄은 남음) */
export function deleteProject(id) {
  set(P, listProjects().filter(p => p.id !== id));
  set(L, listLedger().map(l => (l.project === id ? { ...l, project: '' } : l)));
}

/* ---------- 장부 ---------- */
const normLine = x => {
  if (!isObj(x) || typeof x.id !== 'string') return null;
  const l = { id: x.id, project: typeof x.project === 'string' ? x.project : '', title: str(x.title, 80), kind: str(x.kind, 20), amount: money(x.amount), date: isDay(x.date) ? x.date : '',
    posted: !!x.posted || !!x.manual, postedAt: isDay(x.postedAt) ? x.postedAt : '', manual: !!x.manual };
  if (x.now != null && money(x.now) !== l.amount) l.now = money(x.now);
  return l;
};
export const listLedger = () => { const v = get(L, []); return (Array.isArray(v) ? v : []).map(normLine).filter(Boolean); };
const putLedger = list => set(L, list);
const editLine = (id, fn) => putLedger(listLedger().map(l => (l.id === id ? normLine(fn(l)) || l : l)));
/* 초안을 만들거나 다시 맞출 때(품의 id로 덮어씀). 올린 줄은 금액을 굳혀 두고 바뀐 금액은 now로만 */
export function upsertDraft({ id, project = '', title = '', kind = '', amount = 0, date = '' } = {}) {
  if (!id) return;
  const list = listLedger(), old = list.find(l => l.id === id);
  if (!old) { putLedger([...list, normLine({ id, project, title, kind, amount, date, posted: false })]); return; }
  putLedger(list.map(l => (l.id !== id ? l : normLine({ ...l, project, title: title || l.title, kind: kind || l.kind, ...(l.posted ? { now: amount } : { amount, now: null }), date: l.date || date }))));
}
/* [에듀파인에 올렸어요]: 지금 금액(바뀐 금액이 있으면 그것)으로 굳힘. 풀면 예정(지금 금액) */
export function setPosted(id, on, today = '') {
  editLine(id, l => { const amount = l.now != null ? l.now : l.amount; return { ...l, amount, now: null, posted: !!on || l.manual, postedAt: on ? today : '' }; });
}
export const setLineProject = (id, project) => editLine(id, l => ({ ...l, project: project || '' }));
export const removeLine = id => putLedger(listLedger().filter(l => l.id !== id));
/* [+ 직접 더하기]: 11월 전에 쓴 돈·에듀파인에서 바로 한 품의 — 늘 집행 */
export function addManual({ project = '', title = '', amount = 0, date = '' } = {}) {
  const l = normLine({ id: newId('bm'), project, title: str(title, 80) || '직접 더한 돈', amount, date, posted: true, postedAt: date, manual: true });
  putLedger([...listLedger(), l]);
  return l;
}
/* 「최근 작성」에서 지움: 예정은 장부에서도 빼고, 집행은 남김(쓴 돈) */
export function onRecentDeleted(id) { const l = listLedger().find(x => x.id === id); if (l && !l.posted) removeLine(id); }
/* 이 기능 전에 만든 품의(초안이 있는 최근 작성)를 한 번만 장부에 예정·사업 없음으로 */
export function migrateRecent(recent) {
  if (get(MIG, false)) return;
  const list = listLedger(), have = new Set(list.map(l => l.id)), add = [];
  for (const r of Array.isArray(recent) ? recent : []) {
    if (!r || !r.draft || have.has(r.id)) continue;
    const d = new Date(Number(r.at) || 0), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    add.push(normLine({ id: r.id, project: '', title: (r.draft && r.draft.title) || (r.form && r.form.project) || '', kind: (r.form && r.form.type) || '', amount: sumItems((r.form && r.form.items) || []), date: day, posted: false }));
  }
  if (add.length) putLedger([...list, ...add.filter(Boolean)]);
  set(MIG, true);
}

/* ---------- 셈 ---------- */
export function totals(project, ledger) {
  const lines = (ledger || []).filter(l => l && l.project === (project && project.id));
  const budget = money(project && project.amount);
  const spent = lines.filter(l => l.posted).reduce((s, l) => s + money(l.amount), 0), planned = lines.filter(l => !l.posted).reduce((s, l) => s + money(l.amount), 0);
  const pct = n => (budget > 0 ? Math.round((n / budget) * 100) : 0);
  return { budget, spent, planned, left: budget - spent - planned, rate: pct(spent), rateWithPlan: pct(spent + planned) };
}
/* 예산 탭: 사업마다 합계·마감·품의 줄, 맨 끝에 「사업 없음」(사업을 고르지 않았거나 지운 사업의 줄이 있을 때) */
export function summary(year, today) {
  const projects = listProjects(), ledger = listLedger(), ids = new Set(projects.map(p => p.id));
  const byDate = (a, b) => String(a.date).localeCompare(String(b.date));
  const out = projects.map(p => { const due = dueOf(p, year); return { project: p, ...totals(p, ledger), due, dday: isDay(today) ? days(today, due) : null, lines: ledger.filter(l => l.project === p.id).sort(byDate) }; });
  const loose = ledger.filter(l => !ids.has(l.project)).sort(byDate);
  if (loose.length) out.push({ project: null, lines: loose, spent: loose.filter(l => l.posted).reduce((s, l) => s + l.amount, 0), planned: loose.filter(l => !l.posted).reduce((s, l) => s + l.amount, 0) });
  return out;
}

/* 미리 골라 두기: 관련 칸의 「제목」·관련 칸 전체·사업명의 비교 글이 한 사업과만 맞으면 그 사업. 선생님이 고른 것(projectSet)은 그대로 */
export function matchProject(form, projects) {
  const f = form || {};
  if (f.projectSet) return f.projectId || '';
  const rel = String(f.related || ''), q = /「([^」]+)」/.exec(rel);
  const keys = [q ? q[1] : '', q ? '' : rel, String(f.project || '')].map(planKey).filter(k => k.length >= 2);
  const hit = new Set();
  for (const p of projects || []) { const ks = [p.planKey, planKey(p.name)].filter(Boolean); if (keys.some(k => ks.includes(k))) hit.add(p.id); }
  return hit.size === 1 ? [...hit][0] : '';
}

/* 「쌤」 채팅 「예산 얼마 남았어?」(AI 없이): 사업마다 예산·집행·예정·남음·마감. sum: summary(year, today) */
export function chatAnswer(sum) {
  const ps = (sum || []).filter(s => s && s.project);
  if (!ps.length) return '품의 › 예산에 아직 사업이 없어요. [+ 사업 더하기]로 사업과 예산을 넣으면 품의마다 집행을 세어 드려요.';
  return ['사업별 예산(품의 › 예산 기준 — 에듀파인과 다르면 에듀파인이 맞아요)', ...ps.map(s => `- 「${s.project.name}」 남음 ${won(Math.max(0, s.left))}원`
    + ` (예산 ${won(s.budget)} · 집행 ${won(s.spent)}${s.planned ? ` · 예정 ${won(s.planned)}` : ''}${s.budget ? ` · 집행률 ${s.rate}%` : ''})${s.dday != null ? ` · 마감 ${s.dday < 0 ? '지남' : s.dday === 0 ? '오늘' : `D-${s.dday}`}` : ''}`)].join('\n');
}

/* ---------- 알림 ---------- */
/* 마감 0~30일 안이고 올리지 않은 돈(예산 − 집행) > 0인 사업. others: 지난 학년도 요약(budget:alerts) */
export function briefLines({ projects = [], ledger = [], year, today, others = [] } = {}) {
  if (!isDay(today)) return [];
  const line = (name, t, due, pre) => {
    const n = days(today, due);
    if (n < 0 || n > 30 || t.budget - t.spent <= 0) return null;
    return { n, text: `${pre}예산 「${name}」 ${won(Math.max(0, t.left))}원 남음${t.planned > 0 ? ` · 예정 ${won(t.planned)}원 올리기 전` : ''}`, when: n === 0 ? '오늘' : `D-${n}`, hot: n <= 3, route: { to: 'budget' } };
  };
  const mine = projects.map(p => line(p.name, totals(p, ledger), dueOf(p, year), ''));
  const old = others.filter(a => isObj(a) && a.year !== year && isDay(a.due)).map(a => line(a.name, { budget: money(a.budget), spent: money(a.spent), planned: money(a.planned), left: Number(a.left) || 0 }, a.due, `(${a.year}학년도) `));
  return [...mine, ...old].filter(Boolean).sort((a, b) => a.n - b.n).map(({ n, ...x }) => x);
}
/* 이 학년도 사업의 요약을 budget:alerts에 고쳐 씀(다른 학년도 것은 마감 전만 남김) */
export function refreshAlerts(year, today) {
  // 3분 둘러보기 중(체험용 학년도)에는 고치지 않음 — 체험 자료로 진짜 학년도 요약을 덮지 않게(체험 중 currentYear는 오늘이 든 학년도)
  const y = get('years', null);
  if (isObj(y) && y.current === DEMO_YEAR) return;
  const ledger = listLedger();
  const mine = listProjects().map(p => ({ year, id: p.id, name: p.name, ...totals(p, ledger), due: dueOf(p, year) }));
  const v = get(ALERTS, []), keep = (Array.isArray(v) ? v : []).filter(a => isObj(a) && a.year !== year && isDay(a.due) && (!isDay(today) || a.due >= today));
  set(ALERTS, [...keep, ...mine]);
}
export const otherAlerts = year => { const v = get(ALERTS, []); return (Array.isArray(v) ? v : []).filter(a => isObj(a) && a.year !== year); };

/* ---------- 인수인계서 ---------- */
export function handoverRows(projects, ledger) {
  const name = new Map((projects || []).map(p => [p.id, p.name]));
  const lines = (ledger || []).filter(Boolean);
  const rows = lines.map(l => [name.get(l.project) || '사업 없음', l.title || '품의', won(l.amount), dot(l.date), l.posted ? '집행' : '예정']);
  return { rows, spent: lines.filter(l => l.posted).reduce((s, l) => s + money(l.amount), 0), planned: lines.filter(l => !l.posted).reduce((s, l) => s + money(l.amount), 0) };
}
