/* 학급 › 진도표·시수: 교과별 계획·실시·남은 시수와 진도 차이 (스펙 4.2). 아래 「준비」는 setup.js가 그림 */
import { onEnter } from '../../core/shell.js';
import { makeCtx, summary } from './class-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let box = null, curTab = null;
const visible = () => curTab === 'progress' && box && box.isConnected && !box.closest('[hidden]');

function diffHTML(r) {
  if (!r.started) return '<span class="muted">시작 전</span>';
  if (r.diff > 0) return `<b class="cls-ahead">+${r.diff}</b>`;
  if (r.diff < 0) return `<b class="cls-behind">−${-r.diff}</b>`;
  return '<b>0</b> <span class="muted">맞음</span>';
}
function rowHTML(r) {
  const pct = r.plan ? Math.min(100, Math.round(r.done / r.plan * 100)) : 0;
  return `<tr>
    <th scope="row">${esc(r.sub.name)}${r.inTimetable ? '' : '<span class="cls-tag">시간표에 없어요</span>'}</th>
    <td class="num">${r.plan}</td>
    <td class="num"><span class="cls-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>${r.done}</td>
    <td class="num">${r.left}</td>
    <td>${diffHTML(r)}</td>
    <td>${r.next > r.plan ? '끝' : `${r.next}차시`}</td>
    <td class="muted">${r.mode === 'week' ? '진도표 주' : '시간표'}</td>
  </tr>`;
}
function render() {
  if (!box) return;
  const rows = summary(makeCtx());
  box.innerHTML = `<div class="m-page cls-page">
    <div class="m-head"><h2>진도표·시수</h2><p class="muted">교과별 계획·실시·남은 시수와, 진도표보다 앞섰는지 뒤처졌는지 보여요.</p></div>
    <div class="yp-card">${rows.length ? `<div class="cls-tbl-wrap"><table class="cls-sum">
      <thead><tr><th scope="col">교과</th><th scope="col">계획</th><th scope="col">실시</th><th scope="col">남은</th><th scope="col">진도 차이</th><th scope="col">다음 차시</th><th scope="col">기준</th></tr></thead>
      <tbody>${rows.map(rowHTML).join('')}</tbody></table></div>
      <p class="muted cls-note">진도 차이: 진도표대로라면 지금까지 끝냈어야 할 차시와 실제로 끝낸 차시의 차이예요. 오늘 수업은 체크한 시간까지만 셈해요.</p>`
      : '<p class="muted" style="margin:0">진도표를 넣으면 교과별 시수와 진도 차이가 보여요. 아래 「준비」에서 시간표와 진도표를 넣어 주세요.</p>'}</div>
  </div>`;
}

onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-progress'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'progress';
  if (tab === 'progress') render();
});
document.addEventListener('class:changed', () => { if (visible()) render(); });
