/* 학년말 마감 도우미 화면 (스펙 2026-11-19-yearend-design §1): 이미 있는 계산을 모아(gatherYearend) 점검표 시트로. 규칙은 yearend-model.js.
   [data-ye-open]이 달린 단추(오늘 화면 카드·설정 › 학년도)·「쌤」 채팅이 openYearend를 부름. [했어요]는 학년도 저장소 yearend:done */
import { get, set } from '../../core/store.js';
import { goRoute } from '../../core/brief-data.js';
import { toast } from '../../core/ui.js';
import * as Y from './yearend-model.js';

const SS = () => window.SSAM;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const opt = p => import(p).catch(() => null);
const doneSet = () => { const v = get('yearend:done', []); return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []); };

/* 모으기(AI 없이, 메뉴마다 이미 있는 계산) */
export async function gatherYearend(t = todayStr()) {
  const [chk, board, cls, camp, steps, tr, bud, gm, yrs] = await Promise.all(['../evaluate/check/check.js', '../evaluate/eval-board.js', '../class/class-model.js',
    '../class/camp-model.js', '../class/camp-steps.js', '../training/training-model.js', '../purchase/budget-model.js', '../etc/gongmun-model.js', '../../core/years.js'].map(opt));
  const safe = (fn, fb) => { try { return fn(); } catch (e) { return fb; } };
  const year = yrs ? yrs.currentYear(t) : +t.slice(0, 4);
  let check = null;
  try { check = chk && chk.checkSummary ? await chk.checkSummary() : null; } catch (e) { check = null; }
  const mine = tr ? safe(() => tr.listMine(), []) : [], b = tr ? safe(() => tr.getBoard(), null) : null;
  return {
    check,
    evals: board ? safe(() => board.boardItems(), []) : [],
    progress: cls ? safe(() => cls.summary(cls.makeCtx(t)).map(p => ({ name: p.sub.name, plan: p.plan, actual: p.actual, diff: p.diff, left: p.left })), []) : [],
    camps: camp && steps ? safe(() => camp.listCamps().map(c => ({ id: c.id, name: c.name || '기초학력', docs: steps.docReadiness(c) })), []) : [],
    training: {
      mineTotal: mine.length, mineLeft: mine.filter(x => !tr.isDone(x.status)).length, boardCourses: b ? b.courses.length : 0, noStaff: !!(b && b.courses.length && !b.staff.length),
      boardLeft: b && b.staff.length ? b.courses.map(c => ({ title: c.title, left: tr.missingStaff(b, c.id).length })).filter(x => x.left) : []
    },
    budget: bud ? safe(() => bud.summary(year, t), []) : [],
    gongmun: gm ? safe(() => gm.listDocs(), []) : [],
    backupAt: Number(get('backupAt', 0)) || 0, now: Date.now(),
    prepYear: yrs ? yrs.prepYear(t, year) : 0
  };
}
export async function yearendState(t = todayStr()) { const rows = Y.yearendRows(await gatherYearend(t), doneSet()); return { rows, ...Y.yearendScore(rows) }; }

const ICON = { done: '✓', todo: '!', none: '–' };
function rowsHTML(rows) {
  return rows.map(r => `<li class="ye-row ye-${r.state}" data-ye-row="${esc(r.id)}"><span class="ye-ic" aria-hidden="true">${ICON[r.state]}</span>
    <div class="ye-t"><b>${esc(r.label)}</b><span class="muted">${esc(r.line)}</span></div>
    <span class="row ye-act">${r.state !== 'none' ? `<button class="btn text tiny" type="button" data-ye-go="${esc(r.id)}">가기</button>` : ''}
      ${r.state === 'todo' || r.marked ? `<button class="btn text tiny" type="button" data-ye-mark="${esc(r.id)}" aria-pressed="${r.marked}">${r.marked ? '했어요 풀기' : '했어요'}</button>` : ''}</span></li>`).join('');
}
/* 점검표 시트 */
export async function openYearend() {
  let st = await yearendState();
  const head = s => `<h3>학년말 마감 <span class="muted">${s.done} / ${s.total} 다 됐어요</span></h3>`;
  SS().openSheet(`<div id="yeSheet">${head(st)}<p class="muted" style="margin:0">위에서부터 차례로 챙기면 돼요. 계산할 수 없는 일(인수인계서 등)이나 직접 확인한 일은 [했어요]로 표시해요.</p>
    <ul class="ye-list">${rowsHTML(st.rows)}</ul>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button></div></div>`, sh => {
    sh.addEventListener('click', async e => {
      const g = e.target.closest('[data-ye-go]'), m = e.target.closest('[data-ye-mark]');
      if (g) { const r = st.rows.find(x => x.id === g.dataset.yeGo); if (!r) return; SS().closeSheet(); goRoute(r.go); return; }
      if (m) {
        const d = doneSet(), id = m.dataset.yeMark;
        if (d.has(id)) d.delete(id); else d.add(id);
        if (!set('yearend:done', [...d])) { toast('저장 공간이 모자라 저장하지 못했어요'); return; }
        st = await yearendState();
        const box = sh.querySelector('#yeSheet');
        if (box) { box.querySelector('h3').outerHTML = head(st); box.querySelector('.ye-list').innerHTML = rowsHTML(st.rows); }
        document.dispatchEvent(new CustomEvent('yearend:changed'));
      }
    });
  });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-ye-open]'); if (b) { e.preventDefault(); openYearend(); } });
