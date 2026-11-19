/* 한 달 달력 화면 (스펙 2026-11-19-month-calendar-design): 메뉴마다 이미 있는 날짜(학사일정·공문 기한·연수·예산 마감·기초학력 수업·쪽지 회신·회의 할 일)를
   모아(gatherMonth) 한 달 달력 시트로. 규칙은 month-model.js. [data-month-open]이 달린 단추(오늘 화면 머리·공문 기한 카드)·「쌤」 채팅이 openMonth를 부름.
   날짜를 누르면 그날 목록, 줄을 누르면 그 메뉴로(goRoute). AI를 부르지 않음 */
import { get } from '../../core/store.js';
import { listEvents } from '../../core/calendar.js';
import { goRoute } from '../../core/brief-data.js';
import * as M from './month-model.js';

const SS = () => window.SSAM;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const opt = p => import(p).catch(() => null);
const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/* 모으기(AI 없이) */
export async function gatherMonth(t = todayStr()) {
  const [tr, bud, camp, msg, mn, yrs] = await Promise.all(['../training/training-model.js', '../purchase/budget-model.js', '../class/camp-model.js',
    '../etc/message-model.js', '../etc/minutes-model.js', '../../core/years.js'].map(opt));
  const sc = get('school', null), b = tr ? safe(() => tr.getBoard(), null) : null;
  const year = yrs ? safe(() => yrs.currentYear(t), +t.slice(0, 4)) : +t.slice(0, 4);
  return {
    events: safe(() => listEvents(), []),
    breaks: sc && Array.isArray(sc.breaks) ? sc.breaks : [],
    courses: b && b.staff.length ? b.courses.map(c => { const st = tr.courseStats(b, c.id); return { title: c.title, due: c.due, left: st.none + st.back }; }) : [],
    budgets: bud ? safe(() => bud.summary(year, t).filter(p => p.project).map(p => ({ name: p.project.name, due: p.due, left: p.left })), []) : [],
    camps: camp ? safe(() => camp.listCamps().map(c => ({ id: c.id, name: c.name, dates: (c.sessions || []).map(s => s.date) })), []) : [],
    messages: msg ? safe(() => msg.listMessages().map(x => ({ title: x.title, due: x.m && x.m.apply && x.m.apply.due })), []) : [],
    todos: mn ? safe(() => mn.listMinutes().flatMap(x => (x.todos || []).filter(td => td && !td.done && td.due).map(td => ({ id: x.id, meeting: x.title, task: td.task, due: td.due }))), []) : []
  };
}

/* ---------- 시트 ---------- */
let st = null; // { ym, sel, d, t }
function cellHTML(c, items, t) {
  const list = items[c.date] || [], off = list.some(r => r.kind === 'off'), dow = new Date(`${c.date}T00:00:00`).getDay();
  const todo = list.filter(r => r.kind !== 'off'), hot = todo.some(r => r.hot);
  const cls = ['mc-day', c.inMonth ? '' : 'out', c.date === t ? 'today' : '', c.date === st.sel ? 'sel' : '', dow === 0 || off ? 'red' : dow === 6 ? 'blue' : '', off ? 'off' : '', hot ? 'hot' : ''].filter(Boolean).join(' ');
  const labs = list.slice(0, 2).map(r => `<span class="mc-lab k-${r.kind}">${esc(r.text)}</span>`).join('');
  const more = list.length > 2 ? `<span class="mc-more">+${list.length - 2}</span>` : '';
  const dots = todo.length ? `<span class="mc-dots" aria-hidden="true">${[...new Set(todo.map(r => r.kind))].slice(0, 4).map(k => `<i class="k-${k}"></i>`).join('')}</span>` : '';
  const label = `${+c.date.slice(5, 7)}월 ${+c.date.slice(8, 10)}일 ${DOW[dow]}요일${off ? ` · ${list.find(r => r.kind === 'off').text}` : ''}${todo.length ? ` · ${todo.length}개` : ''}`;
  return `<td><button type="button" class="${cls}" data-mc-day="${c.date}" aria-label="${esc(label)}"${c.date === st.sel ? ' aria-pressed="true"' : ' aria-pressed="false"'}>
    <span class="mc-n">${+c.date.slice(8, 10)}</span>${dots}<span class="mc-labs">${labs}${more}</span></button></td>`;
}
function dayHTML(items) {
  const d = st.sel, list = items[d] || [], dow = new Date(`${d}T00:00:00`).getDay();
  const head = `<h4 class="mc-dh">${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일 (${DOW[dow]})</h4>`;
  if (!list.length) return `${head}<p class="muted mc-none">이날은 넣은 일정·기한이 없어요</p>`;
  return `${head}<ul class="mc-dl">${list.map((r, i) => `<li>${r.route
    ? `<button type="button" class="mc-it k-${r.kind}${r.hot ? ' hot' : ''}" data-mc-go="${i}"><span class="mc-k">${esc(M.kindLabel(r.kind))}</span><span class="mc-t">${esc(r.text)}</span><span class="mc-arrow" aria-hidden="true">›</span></button>`
    : `<div class="mc-it k-${r.kind}"><span class="mc-k">${esc(M.kindLabel(r.kind))}</span><span class="mc-t">${esc(r.text)}</span></div>`}</li>`).join('')}</ul>`;
}
function bodyHTML() {
  const items = M.monthItems(st.d, st.ym, st.t), n = M.monthCount(items, st.ym);
  const weeks = M.monthGrid(st.ym);
  return `<div class="mc-head"><button type="button" class="btn text mc-nav" data-mc="prev" aria-label="지난달">‹</button><h3 id="mcTitle" aria-live="polite">${M.monthTitle(st.ym)}</h3>
      <button type="button" class="btn text mc-nav" data-mc="next" aria-label="다음 달">›</button><span class="grow"></span>
      ${M.monthOf(st.t) !== st.ym ? '<button type="button" class="btn text tiny" data-mc="now">이번 달</button>' : ''}<button type="button" class="btn text tiny" data-close>닫기</button></div>
    <p class="muted mc-sum">${n ? `이달 일정·기한 ${n}개` : '이달에는 넣은 일정·기한이 없어요'} · 날짜를 누르면 그날 것을, 줄을 누르면 그 메뉴로 가요</p>
    <div class="mc-legend" aria-hidden="true">${M.KINDS.filter(([k]) => k !== 'off').map(([k, l]) => `<span><i class="k-${k}"></i>${l}</span>`).join('')}</div>
    <table class="mc-grid"><thead><tr>${DOW.map((x, i) => `<th scope="col" class="${i === 0 ? 'red' : i === 6 ? 'blue' : ''}">${x}</th>`).join('')}</tr></thead>
      <tbody>${weeks.map(w => `<tr>${w.map(c => cellHTML(c, items, st.t)).join('')}</tr>`).join('')}</tbody></table>
    <div class="mc-day-list" id="mcDay">${dayHTML(items)}</div>`;
}
function draw(sh, focusDay = false) {
  const box = sh.querySelector('#mcBody');
  if (!box) return;
  box.innerHTML = bodyHTML();
  if (focusDay) { const b = box.querySelector(`[data-mc-day="${st.sel}"]`); if (b) b.focus(); }
}
/* 고른 날: 오늘이 그 달이면 오늘, 아니면 그 달 첫 일정 날(없으면 1일) */
function pickDay(ym) {
  if (M.monthOf(st.t) === ym) return st.t;
  const items = M.monthItems(st.d, ym, st.t), first = Object.keys(items).filter(k => M.monthOf(k) === ym && items[k].some(r => r.kind !== 'off')).sort()[0];
  return first || `${ym}-01`;
}
/* 달력 열기: ym('2026-11')이 없으면 이번 달, day가 있으면 그날을 고름 */
export async function openMonth(ym = '', day = '') {
  const t = todayStr(), d = await gatherMonth(t);
  const y = M.isMonth(ym) ? ym : M.monthOf(t);
  st = { ym: y, t, d, sel: '' };
  st.sel = day && M.monthOf(day) === y ? day : pickDay(y);
  SS().openSheet(`<div id="monthCal" class="mc"><div id="mcBody"></div></div>`, sh => {
    sh.classList.add('mc-sheet');
    draw(sh);
    sh.addEventListener('click', e => {
      const nav = e.target.closest('[data-mc]');
      if (nav) {
        const a = nav.dataset.mc;
        st.ym = a === 'prev' ? M.shiftMonth(st.ym, -1) : a === 'next' ? M.shiftMonth(st.ym, 1) : M.monthOf(st.t);
        st.sel = pickDay(st.ym);
        draw(sh);
        const again = sh.querySelector(`[data-mc="${a === 'now' ? 'next' : a}"]`);
        if (again) again.focus();
        return;
      }
      const day = e.target.closest('[data-mc-day]');
      if (day) {
        st.sel = day.dataset.mcDay;
        // 앞뒤 달 칸을 누르면 그 달로
        if (M.monthOf(st.sel) !== st.ym) st.ym = M.monthOf(st.sel);
        draw(sh, true);
        return;
      }
      const go = e.target.closest('[data-mc-go]');
      if (go) {
        const r = (M.monthItems(st.d, st.ym, st.t)[st.sel] || [])[+go.dataset.mcGo];
        if (r && r.route) { SS().closeSheet(); goRoute(r.route); }
      }
    });
    // 화살표로 날짜 옮기기(←→ 하루, ↑↓ 한 주)
    sh.addEventListener('keydown', e => {
      const day = e.target.closest('[data-mc-day]');
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!day || !step) return;
      e.preventDefault();
      const next = new Date(`${day.dataset.mcDay}T00:00:00`);
      next.setDate(next.getDate() + step);
      st.sel = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
      if (M.monthOf(st.sel) !== st.ym) st.ym = M.monthOf(st.sel);
      draw(sh, true);
    });
  });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-month-open]'); if (b) { e.preventDefault(); openMonth(b.dataset.monthOpen || ''); } });
