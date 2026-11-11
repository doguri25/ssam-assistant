/* 「오늘 할 일」 자료 모으기와 줄을 누르면 갈 곳 — 「쌤」 채팅 맨 위 목록(chat.js)과 「오늘」 화면(menus/home/home.js)이 같이 씀.
   gather(): 저장소에서 briefing.js에 넘길 것을 모음(AI 없이). goRoute(route): 줄의 route({ to, id?, step?, no? })대로 그 화면으로 */
import { get } from './store.js';
import { go } from './shell.js';
import { listEvents, addDays } from './calendar.js';

const SS = () => window.SSAM || {};
const pad2 = n => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

export async function gather(t = today()) {
  const mods = await Promise.all(['../menus/etc/gongmun-model.js', '../menus/plan/event-model.js', '../menus/evaluate/unit/unit-model.js', '../menus/evaluate/activity/activity-model.js']
    .map(p => import(p).catch(() => null)));
  const [gm, evm, um, am] = mods;
  const units = um ? um.listTests().slice(0, 15).map(s => { const x = um.getTest(s.id); return x && { id: x.id, title: s.title, date: (x.meta && x.meta.date) || s.date, done: !!x.done, sample: !!(x.meta && x.meta.sample), students: x.students || [] }; }).filter(Boolean) : [];
  const activities = am ? am.listActivities().slice(0, 15).map(s => { const x = am.getActivity(s.id); return x && { id: x.id, title: s.title || (x.meta && x.meta.title), date: (x.meta && x.meta.date) || s.date, done: !!x.done, sample: !!(x.meta && x.meta.sample), students: x.students || [] }; }).filter(Boolean) : [];
  const ids = get('grs', []);
  const grs = (Array.isArray(ids) ? ids : []).slice(0, 3).map(id => { const b = get('gr:' + id, null); return b && typeof b === 'object' ? { id, title: b.title, students: Array.isArray(b.students) ? b.students : [] } : null; }).filter(Boolean);
  // 금요일: 다음 주 주간학습안내를 이미 쓰기 시작했는지(글이 있는 칸)
  const w = get('class:weekly:' + addDays(t, 3), null), filled = v => (typeof v === 'string' ? !!v.trim() : v && typeof v === 'object' ? Object.values(v).some(filled) : false);
  return { today: t, docs: gm ? gm.listDocs() : [], events: listEvents(), plans: evm ? evm.listEventPlans() : [], units, activities, grs, weekly: { started: !!(w && (filled(w.notes) || filled(w.cells))) } };
}

async function optional(path, name) {
  try { const m = await import(path); return typeof m[name] === 'function' ? m[name] : null; } catch (e) { return null; }
}
export async function goRoute(r) {
  if (!r) return;
  if (r.to === 'gongmun') go('etc', 'gongmun');
  else if (r.to === 'event') {
    go('plan', 'event');
    const b = r.id && document.querySelector(`section[data-menu="plan"] [data-ev="${CSS.escape(r.id)}"]`);
    if (b) b.click();
  }
  else if (r.to === 'year') go('plan', 'year');
  else if (r.to === 'today') go('class', 'today');
  else if (r.to === 'progress') go('class', 'progress');
  else if (r.to === 'weekly') go('class', 'weekly');
  else if (r.to === 'gr') go('evaluate', 'gr');
  else if (r.to === 'hk') { go('evaluate', 'hk'); if (r.no && SS().hk) SS().hk.select(r.no); }
  else if (r.to === 'unit') { go('evaluate', 'unit'); if (r.id) { try { (await import('../menus/evaluate/unit/unit.js')).openTest(r.id, r.step); } catch (e) {} } }
  else if (r.to === 'activity') { go('evaluate', 'activity'); if (r.id) { try { (await import('../menus/evaluate/activity/activity.js')).openActivity(r.id); } catch (e) {} } }
  else if (r.to === 'purchase') go('purchase', 'recent');
  else if (r.to === 'multi') { const fn = await optional('../menus/etc/multi.js', 'openMulti'); if (fn) fn(r.view); else go('etc', 'multi'); }
  else if (r.to === 'camp') { const fn = await optional('../menus/class/camp.js', 'openCamp'); if (fn) fn(r.section); else go('class', 'camp'); }
  else if (r.to === 'settings') go('settings', r.tab);
  else if (r.to === 'home') go('home');
}
