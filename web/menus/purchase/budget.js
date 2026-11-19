/* 품의 › 예산 탭 (스펙 2026-11-18-budget-design §화면 1): 사업마다 예산·집행·예정·남음·집행률과 품의 줄(올림 표시·사업 바꾸기·장부에서 빼기·열기),
   [+ 사업 더하기]·[고치기]·[지우기]·[+ 직접 더하기], 「사업 없음」 묶음. 규칙·저장은 budget-model.js. 줄의 [열기]는 purchase.js의 data-recent-open이 엶 */
import { toast } from '../../core/ui.js';
import { introHTML } from '../../core/ui-parts.js';
import { currentYear } from '../../core/years.js';
import { listRecent, setRecentProject } from './library.js';
import { TYPES } from './rules.js';
import * as B from './budget-model.js';

const SS = () => window.SSAM;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number(n || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = d => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? `${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '');
const typeLabel = id => (TYPES.find(t => t.id === id) || {}).label || '';
let box = null;

function lineHTML(l, projects, inRecent) {
  const opts = [['', '사업 없음'], ...projects.map(p => [p.id, p.name])].map(([v, n]) => `<option value="${esc(v)}"${v === l.project ? ' selected' : ''}>${esc(n)}</option>`).join('');
  return `<li class="bd-line${l.posted ? ' posted' : ''}" data-bd-line="${esc(l.id)}">
    <span class="bd-ld num">${esc(md(l.date))}</span>
    <span class="bd-lt">${esc(l.title || typeLabel(l.kind) || '품의')}${l.manual ? ' <span class="muted">(직접)</span>' : !inRecent ? ' <span class="muted">(최근 작성에 없음)</span>' : ''}</span>
    <b class="bd-la num">${won(l.amount)}</b>
    <span class="bd-ls">${l.posted ? '✓ 집행' : '예정'}</span>
    <span class="row bd-lact">
      ${l.manual ? '' : `<button class="btn text tiny" type="button" data-bd="post" data-id="${esc(l.id)}">${l.posted ? '올림 풀기' : '에듀파인에 올림'}</button>`}
      <select class="field bd-move" data-bd-move="${esc(l.id)}" aria-label="사업 바꾸기">${opts}</select>
      ${!l.manual && inRecent ? `<button class="btn text tiny" type="button" data-recent-open="${esc(l.id)}">열기</button>` : ''}
      <button class="btn text tiny" type="button" data-bd="rm" data-id="${esc(l.id)}">장부에서 빼기</button></span>
    ${l.now != null ? `<span class="bd-now muted">올린 뒤 금액이 바뀌었어요(${won(l.amount)} → ${won(l.now)}) <button class="btn text tiny" type="button" data-bd="repost" data-id="${esc(l.id)}">다시 올림 표시</button></span>` : ''}
  </li>`;
}
function cardHTML(s, projects, recentIds) {
  const lines = s.lines.length ? `<ul class="bd-lines">${s.lines.map(l => lineHTML(l, projects, recentIds.has(l.id))).join('')}</ul>` : '<p class="muted bd-none">아직 이 사업으로 쓴 품의가 없어요.</p>';
  if (!s.project) return `<section class="pc-card bd-card bd-loose"><div class="bd-head"><h3>사업 없음 <span class="muted">(고르지 않은 품의)</span></h3></div>
    <p class="bd-nums">집행 ${won(s.spent)} · 예정 ${won(s.planned)}</p>${lines}</section>`;
  const p = s.project, bar = n => Math.max(0, Math.min(100, n));
  const dd = s.dday == null ? '' : s.dday < 0 ? '마감 지남' : s.dday === 0 ? '오늘 마감' : `D-${s.dday}`;
  return `<section class="pc-card bd-card" data-bd-card="${esc(p.id)}">
    <div class="bd-head"><h3>${esc(p.name)}</h3><span class="muted bd-due">마감 ${esc(md(s.due))}${p.due ? '' : '(기본)'}${dd ? ` · <b class="${s.dday != null && s.dday <= 3 && s.dday >= 0 ? 'hot' : ''}">${dd}</b>` : ''}</span>
      <span class="row bd-pact"><button class="btn text tiny" type="button" data-bd="edit" data-id="${esc(p.id)}">고치기</button><button class="btn text tiny" type="button" data-bd="del" data-id="${esc(p.id)}">지우기</button></span></div>
    <p class="bd-nums">예산 <b class="num">${won(s.budget)}</b> · 집행 <b class="num">${won(s.spent)}</b> · 예정 <b class="num">${won(s.planned)}</b> · 남음 <b class="num${s.left < 0 ? ' over' : ''}">${won(s.left)}</b></p>
    <div class="bd-bar" role="img" aria-label="집행 ${s.rate}%, 예정까지 ${s.rateWithPlan}%"><span class="bd-spent" style="width:${bar(s.rate)}%"></span><span class="bd-plan" style="width:${bar(s.rateWithPlan - s.rate)}%"></span></div>
    <p class="muted bd-rate">집행 ${s.rate}%${s.planned ? ` (예정까지 ${s.rateWithPlan}%)` : ''}${s.left < 0 ? ` · 예산보다 ${won(-s.left)}원 많아요` : ''}</p>
    ${lines}
    <div class="row"><button class="btn text" type="button" data-bd="manual" data-id="${esc(p.id)}">+ 직접 더하기</button></div>
  </section>`;
}
export function renderBudget(el) {
  box = el || box;
  if (!box) return;
  B.migrateRecent(listRecent());
  const year = currentYear(), t = today(), sum = B.summary(year, t), projects = B.listProjects();
  const recentIds = new Set(listRecent().map(r => r.id));
  B.refreshAlerts(year, t);
  box.innerHTML = `<div class="m-page pc-lib bd-page"><div class="m-head m-head-row"><div><h2>예산 <span class="muted">(${year}학년도)</span></h2>
      ${introHTML('pc-budget', '사업마다 예산·집행·남은 돈을 봐요. 품의 초안 카드에서 [에듀파인에 올렸어요]를 누른 품의가 집행, 누르지 않은 초안은 예정이에요. 앱 밖에서 쓴 돈은 [+ 직접 더하기]로 적어요.')}</div>
      <div class="m-head-act"><button class="btn primary" type="button" data-bd="add">+ 사업 더하기</button></div></div>
    ${sum.length ? sum.map(s => cardHTML(s, projects, recentIds)).join('') : '<div class="empty"><h3>아직 사업이 없어요</h3><p>계획서를 넣거나 행사계획에서 넘어오면 사업으로 등록할지 물어봐요. [+ 사업 더하기]로 직접 적어도 돼요.</p></div>'}
  </div>`;
}

/* 사업 더하기·고치기 시트. done(project)는 등록한 뒤(새 품의의 등록 카드도 씀) */
export function projectSheet({ id = '', name = '', amount = '', due = '', planKey } = {}, done) {
  SS().openSheet(`<div id="bdSheet"><h3>${id ? '사업 고치기' : '사업 더하기'}</h3>
    <label class="yp-f"><span class="lab">사업 이름</span><input class="field" id="bdName" value="${esc(name)}" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">예산(원)</span><input class="field" id="bdAmount" inputmode="numeric" value="${esc(amount ? won(amount) : '')}" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">집행 마감일 <span class="muted">(비우면 2월 말)</span></span><input class="field" id="bdDue" type="date" value="${esc(due)}"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="bdOk">${id ? '고치기' : '등록'}</button></div></div>`, sh => {
    sh.querySelector('#bdOk').addEventListener('click', () => {
      const n = sh.querySelector('#bdName').value.trim();
      if (!n) { toast('사업 이름을 넣어 주세요'); return; }
      const amt = sh.querySelector('#bdAmount').value;
      if (amt.trim() && !B.toWon(amt)) { toast('예산을 숫자로 넣어 주세요. 예) 500,000 또는 50만원'); return; }
      const p = B.saveProject({ id, name: n, amount: amt, due: sh.querySelector('#bdDue').value, ...(planKey != null ? { planKey } : {}) });
      SS().closeSheet();
      B.refreshAlerts(currentYear(), today());
      if (done) done(p);
    });
  });
}
function manualSheet(project) {
  SS().openSheet(`<div id="bdManual"><h3>직접 더하기 <span class="muted">— ${esc(project.name)}</span></h3>
    <p class="muted" style="margin:0">11월 전에 쓴 돈, 에듀파인에서 바로 한 품의처럼 앱 밖에서 쓴 돈을 적어요. 집행으로 셈해요.</p>
    <label class="yp-f"><span class="lab">내용</span><input class="field" id="bdmTitle" placeholder="예) 11월 전에 쓴 돈" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">금액(원)</span><input class="field" id="bdmAmount" inputmode="numeric" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">날짜</span><input class="field" id="bdmDate" type="date" value="${today()}"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="bdmOk">더하기</button></div></div>`, sh => {
    sh.querySelector('#bdmOk').addEventListener('click', () => {
      const l = B.addManual({ project: project.id, title: sh.querySelector('#bdmTitle').value, amount: sh.querySelector('#bdmAmount').value, date: sh.querySelector('#bdmDate').value });
      if (!l.amount) { B.removeLine(l.id); toast('금액을 넣어 주세요'); return; }
      SS().closeSheet(); renderBudget();
    });
  });
}

const inPage = e => box && box.isConnected && box.contains(e.target) && !!box.querySelector('.bd-page');
document.addEventListener('click', e => {
  if (!inPage(e)) return;
  const b = e.target.closest('[data-bd]');
  if (!b) return;
  const a = b.dataset.bd, id = b.dataset.id, p = B.listProjects().find(x => x.id === id);
  if (a === 'add') projectSheet({}, () => renderBudget());
  else if (a === 'edit' && p) projectSheet(p, () => renderBudget());
  else if (a === 'del' && p) {
    SS().openSheet(`<h3>「${esc(p.name)}」 사업을 지울까요?</h3><p class="muted" style="margin:0">이 사업의 품의는 「사업 없음」으로 옮겨요(집행 기록은 남아요).</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="bdDelOk">지우기</button></div>`,
    sh => sh.querySelector('#bdDelOk').addEventListener('click', () => { B.deleteProject(p.id); SS().closeSheet(); renderBudget(); }));
  } else if (a === 'manual' && p) manualSheet(p);
  else if (a === 'post' || a === 'repost') { const l = B.listLedger().find(x => x.id === id); if (l) { B.setPosted(id, a === 'repost' ? true : !l.posted, today()); renderBudget(); } }
  else if (a === 'rm') { B.removeLine(id); renderBudget(); toast('장부에서 뺐어요'); }
});
document.addEventListener('change', e => {
  if (!inPage(e)) return;
  const s = e.target.closest('[data-bd-move]');
  if (!s) return;
  // 품의 쪽(최근 작성·지금 쓰는 품의 — purchase.js가 받음)도 그 사업으로. 장부만 바꾸면 그 품의를 고치거나 [열기]할 때 예전 사업으로 되돌아갔음
  const id = s.dataset.bdMove, project = s.value;
  B.setLineProject(id, project);
  setRecentProject(id, project);
  document.dispatchEvent(new CustomEvent('ssam:budget-move', { detail: { id, project } }));
  renderBudget();
});
