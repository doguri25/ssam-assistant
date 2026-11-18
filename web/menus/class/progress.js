/* 학급 › 진도표·시수: 교과별 계획·실시·남은 시수와 진도 차이 (스펙 4.2, 2026-11-18 class-fix A). 아래 「준비」는 setup.js가 그림.
   진도표 없는 교과는 「시수만」 줄(실시, 계획은 준비에서 적음), 전담은 「전담」. 시간표·진도표가 있으면 준비는 접어 두고 맨 위 [시간표·진도표 고치기] */
import { onEnter } from '../../core/shell.js';
import { toast } from '../../core/ui.js';
import { makeCtx, summary, extraSummary, areaHours, yearHours, alignToPlan, saveSubject, listSubjects, progressOf, hasTimetable } from './class-model.js';
import { introHTML } from '../../core/ui-parts.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let box = null, curTab = null;
let setupOpen = true; // 아래 준비가 펼쳐졌는지(setup.js가 'class:setup-state'로 알림 — 여기서 setup.js를 부르면 화면 차례가 바뀜)
const visible = () => curTab === 'progress' && box && box.isConnected && !box.closest('[hidden]');
const bar = (done, plan) => `<span class="cls-bar" aria-hidden="true"><i style="width:${plan ? Math.min(100, Math.round(done / plan * 100)) : 0}%"></i></span>`;
const areaHTML = (ctx, name) => { const a = areaHours(ctx, name); return a.length ? `<span class="muted cls-area">${a.map(([l, n]) => `${esc(l)} ${n}`).join(' · ')}</span>` : ''; };

function diffHTML(r) {
  if (!r.started) return '<span class="muted">시작 전</span>';
  const fix = `<button class="btn text cls-align" type="button" data-align="${esc(r.sub.id)}" title="진도표대로라면 할 차시를 다음 차시로">진도표대로 맞추기</button>`;
  if (r.diff > 0) return `<b class="cls-ahead">+${r.diff}</b>${fix}`;
  if (r.diff < 0) return `<b class="cls-behind">−${-r.diff}</b>${fix}`;
  return '<b>0</b> <span class="muted">맞음</span>';
}
function rowHTML(ctx, r) {
  const year = r.sub.since ? `<span class="muted cls-year">연간 ${yearHours(ctx, r.sub)}</span>` : '';
  return `<tr>
    <th scope="row">${esc(r.sub.name)}${r.inTimetable ? '' : '<span class="cls-tag">시간표에 없어요</span>'}${areaHTML(ctx, r.sub.name)}</th>
    <td class="num">${r.plan}</td>
    <td class="num">${bar(r.done, r.plan)}${r.done}${year}</td>
    <td class="num">${r.left}</td>
    <td>${diffHTML(r)}</td>
    <td>${r.next > r.plan ? '끝' : `${r.next}차시`}</td>
    <td class="muted">${r.mode === 'week' ? '진도표 주' : '시간표'}</td>
  </tr>`;
}
/* 진도표 없는 교과: 실시만(계획은 준비에서 적은 것), 전담은 체크하지 않음 */
function extraHTML(ctx, e) {
  if (e.staff) return `<tr class="cls-x"><th scope="row">${esc(e.name)}<span class="cls-tag">전담</span></th><td class="num">${e.plan == null ? '—' : e.plan}</td><td class="num muted">—</td><td class="num muted">—</td><td class="muted">전담</td><td class="muted">—</td><td class="muted">—</td></tr>`;
  return `<tr class="cls-x">
    <th scope="row">${esc(e.name)}<span class="cls-tag">시수만</span>${areaHTML(ctx, e.name)}</th>
    <td class="num">${e.plan == null ? '<span class="muted">—</span>' : e.plan}</td>
    <td class="num">${e.plan ? bar(e.done, e.plan) : ''}${e.done}</td>
    <td class="num">${e.left == null ? '<span class="muted">—</span>' : e.left}</td>
    <td class="muted">시수만</td><td class="muted">—</td><td class="muted">체크</td>
  </tr>`;
}
function render() {
  if (!box) return;
  const ctx = makeCtx(), rows = summary(ctx), extra = extraSummary(ctx);
  const ready = hasTimetable(ctx.tt) && ctx.subjects.length > 0;
  const edit = ready && !setupOpen ? '<button class="btn" type="button" data-pg="setup">시간표·진도표 고치기</button>' : '';
  const table = rows.length || extra.length ? `<div class="cls-tbl-wrap"><table class="cls-sum">
      <thead><tr><th scope="col">교과</th><th scope="col">계획</th><th scope="col">실시</th><th scope="col">남은</th><th scope="col">진도 차이</th><th scope="col">다음 차시</th><th scope="col">기준</th></tr></thead>
      <tbody>${rows.map(r => rowHTML(ctx, r)).join('')}${extra.map(e => extraHTML(ctx, e)).join('')}</tbody></table></div>` : '';
  const note = rows.length ? '<p class="muted cls-note">진도 차이: 진도표대로 끝냈어야 할 차시와 끝낸 차시의 차이예요(오늘은 체크한 시간까지). 「시수만」 교과는 오늘 수업에서 체크한 시간만 세요.</p>'
    : '<p class="muted" style="margin:0">진도표를 넣으면 교과별 시수와 진도 차이가 보여요. 아래 「준비」에서 시간표와 진도표를 넣어 주세요.</p>';
  box.innerHTML = `<div class="m-page cls-page">
    <div class="m-head m-head-row"><div><h2>진도표·시수</h2>${introHTML('progress', '교과별 남은 시수와 진도표보다 앞섰는지 뒤처졌는지 보여요.')}</div>${edit ? `<div class="m-head-act">${edit}</div>` : ''}</div>
    <div class="yp-card">${table}${note}</div>
  </div>`;
}

onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-progress'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'progress';
  if (tab === 'progress') render();
});
document.addEventListener('class:changed', () => { if (visible()) render(); });
document.addEventListener('class:setup-state', e => { setupOpen = !!(e.detail && e.detail.open); if (visible()) render(); });
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  if (e.target.closest('[data-pg="setup"]')) { document.dispatchEvent(new CustomEvent('class:setup', { detail: { open: true, focus: true } })); return; }
  const a = e.target.closest('[data-align]');
  if (!a) return;
  const s = listSubjects().find(x => x.id === a.dataset.align);
  if (!s) return;
  const ctx = makeCtx(), neu = saveSubject(alignToPlan(ctx, s));
  if (!neu) { toast('저장 공간이 모자라 저장하지 못했어요', 6000); return; }
  const p = progressOf(makeCtx(), neu);
  toast(`「${s.name}」 다음 차시를 진도표대로 ${p.next > p.plan ? '끝' : `${p.next}차시`}로 맞췄어요`);
  document.dispatchEvent(new CustomEvent('class:changed', { detail: { from: 'progress' } }));
});
