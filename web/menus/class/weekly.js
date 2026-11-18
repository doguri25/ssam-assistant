/* 학급 › 주간학습안내: 교시별 학습 표(진도표대로 이어지는 예상 차시) + 요일별 알림(한주한장알림장 칸) → 한글 파일·인쇄·복사 (스펙 4.3).
   AI 알림은 시작할 때의 주(월요일)에, 비어 있는 칸만 채움 */
import { onEnter, go } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { aiRowHTML, pick } from '../../core/ai-roles.js';
import { reviewJSON, notesReviewPrompt, normNotesReview, opinionHTML, reviewBar, REVIEW_FAIL } from '../../core/ai-review.js';
import { toast, copyText } from '../../core/ui.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import { listEvents, addDays } from '../../core/calendar.js';
import {
  makeCtx, getInfo, getWeekly, saveWeekly, weekView, defaultWeek, weeklyTitle, weekCell, weeklyDoc, weekPeriods, normNotes, NOTE_ROWS, fmtDay, today, migrateWeeklyEvents, hasTimetable } from './class-model.js';
import { askSample } from './setup.js';
import { getSchool } from '../../core/settings.js';
import { notesPrompt, notesToFill, autoEvents as eventsOn, AI_KEYS } from './weekly-ai.js';
import { introHTML, aiNoteHTML } from '../../core/ui-parts.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = '월화수목금';
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
const dotted = d => `${+d.slice(5, 7)}.${+d.slice(8, 10)}`;
const FULL = '저장 공간이 모자라 저장하지 못했어요';
let box = null, curTab = null, monday = null;
let stale = false; // 글을 치는 동안 표 모양이 바뀌어 칸을 벗어나면 다시 그릴 것
migrateWeeklyEvents();
const busy = {}; // 월요일 → AI가 쓰는 중
const rvState = {}; // 월요일 → 'busy' | 'fail' (검토 AI)
const NOTE_LABEL = Object.fromEntries(NOTE_ROWS);
const openRv = w => (w.rv || []).filter(r => !r.done);
const rvAt = (w, d, k) => openRv(w).find(r => r.key === String(d) && r.field === k);
function rvBoxHTML(mon) {
  const w = getWeekly(mon), open = openRv(w), st = rvState[mon];
  return (st === 'busy' ? '<p class="muted rv-busy"><span class="spin"></span> 검토 AI가 알림을 살펴보고 있어요…</p>' : st === 'fail' ? `<p class="rv-fail" role="status">${REVIEW_FAIL} 쓴 알림은 그대로 쓸 수 있어요.</p>` : '')
    + reviewBar(open.length, 'data-rv-next')
    + open.map(r => opinionHTML({ title: `${WD[+r.key]}요일 ${NOTE_LABEL[r.field] || r.field}`, main: w.notes[r.key][r.field], alt: r.fix, why: r.problem, use: `${r.key}-${r.field}`, keep: `${r.key}-${r.field}` })).join('');
}
function updateRv(mon) {
  if (!visible() || monday !== mon) return;
  const b = box.querySelector('#clsRvBox');
  if (b) b.innerHTML = rvBoxHTML(mon);
  const w = getWeekly(mon);
  box.querySelectorAll('textarea[data-wn]').forEach(t => { const [d, k] = t.dataset.wn.split('-'); t.classList.toggle('rv-mark', !!rvAt(w, d, k)); });
}
const visible = () => curTab === 'weekly' && box && box.isConnected && !box.closest('[hidden]');

/* 학사일정 줄: 고쳐 쓴 글이 있으면 그것, 없으면 그 주 학사일정 — 공문 기한(선생님 일)·연간계획 업무 일정은 보호자께 가는 안내에 넣지 않음(weekly-ai forParents) */
const autoEvents = date => eventsOn(listEvents(), date);
/* 진도표대로라면 그 칸 글(고친 칸이 없을 때의 글) */
const autoCell = (days, d, p) => weekCell(days, { cells: {} }, d, p);
/* 고친 칸 수: 진도표와 다른 교과 칸 + 고쳐 쓴 학사일정 칸 */
function editedCount(days, w) {
  const cells = Object.entries(w.cells || {}).filter(([k, t]) => { const [d, p] = k.split('-').map(Number); return t !== autoCell(days, d, p); }).length;
  const ev = days.filter((d, i) => w.notes[i].events != null && w.notes[i].events !== autoEvents(d.date)).length;
  return cells + ev;
}
const isEdited = (days, w, d, p) => Object.prototype.hasOwnProperty.call(w.cells || {}, `${d}-${p}`) && w.cells[`${d}-${p}`] !== autoCell(days, d, p);
function sheet(mon) {
  const days = weekView(makeCtx(), mon);
  const w = getWeekly(mon);
  const notes = {};
  days.forEach((d, i) => { notes[i] = { ...w.notes[i], events: w.notes[i].events == null ? autoEvents(d.date) : w.notes[i].events }; });
  return { days, w, notes, title: w.title || weeklyTitle(getInfo()) };
}
const save = (mon, w) => { if (!saveWeekly(mon, w)) toast(FULL, 6000); };

function render() {
  if (!box) return;
  stale = false;
  const ctx = makeCtx();
  const head = `<div class="m-head"><h2>주간학습안내</h2>${introHTML('weekly', '진도표대로 다음 주 학습 내용과 요일별 알림을 한 장으로 만들어요.')}</div>`;
  if (!hasTimetable(ctx.tt)) {
    box.innerHTML = `<div class="m-page cls-page">${head}<div class="yp-card"><p style="margin:0">먼저 진도표·시수 › 준비에서 시간표를 넣어 주세요.</p>
      <div class="row"><button class="btn primary" type="button" data-w="setup">준비로 가기</button><button class="btn" type="button" data-w="sample">예시로 채우기</button></div></div></div>`;
    return;
  }
  const { days, w, notes, title } = sheet(monday);
  const th = days.map((d, i) => `<th scope="col">${WD[i]} ${md(d.date)}</th>`).join('');
  const rows = Array.from({ length: ctx.tt.periods }, (_, p) => `<tr><th scope="row">${p + 1}교시</th>${days.map((d, i) =>
    `<td><textarea class="field cls-wc${isEdited(days, w, i, p + 1) ? ' edited' : ''}" data-wc="${i}-${p + 1}" rows="2" aria-label="${WD[i]}요일 ${p + 1}교시${isEdited(days, w, i, p + 1) ? ' (고친 칸)' : ''}">${esc(weekCell(days, w, i, p + 1))}</textarea></td>`).join('')}</tr>`).join('');
  const nrows = NOTE_ROWS.map(([k, label]) => `<tr><th scope="row">${label}</th>${days.map((d, i) =>
    `<td><textarea class="field cls-wn${rvAt(w, i, k) ? ' rv-mark' : ''}" data-wn="${i}-${k}" rows="2" aria-label="${WD[i]}요일 ${label}">${esc(notes[i][k])}</textarea></td>`).join('')}</tr>`).join('');
  const b = busy[monday];
  box.innerHTML = `<div class="m-page cls-page">${head}
    <div class="cls-week-nav">
      <button class="icon-btn" type="button" data-w="prev" aria-label="전 주">‹</button>
      <b class="cls-day">${fmtDay(days[0].date)} ~ ${fmtDay(days[4].date)}</b>
      <button class="icon-btn" type="button" data-w="next" aria-label="다음 주">›</button>
      <span class="grow"></span>
      <button class="btn text" type="button" data-w="refill">다시 채우기</button>
      <button class="btn tonal" type="button" data-w="ai"${b ? ' disabled' : ''}>${b ? 'AI가 쓰는 중…' : 'AI로 알림 쓰기'}</button>
      <button class="btn" type="button" data-w="copy">복사</button>
      <button class="btn" type="button" data-w="print">인쇄</button>
      ${exportButton('data-w="hwpx"', { cls: 'primary' })}
    </div>
    ${aiRowHTML('notes')}${aiNoteHTML('요일별 교과·차시 칸, 교과서 비고, 학사일정, 이미 쓴 알림을 보내요. 사람 이름·전화번호는 가려 보내요. 학생 자료는 보내지 않아요.')}<div id="clsRvBox">${rvBoxHTML(monday)}</div>
    <div class="yp-card cls-sheet">
      <input class="field cls-w-title" id="clsWTitle" value="${esc(title)}" aria-label="제목">
      <p class="muted cls-w-range">${fmtDay(days[0].date)} ~ ${fmtDay(days[4].date)}</p>
      <div class="cls-tbl-wrap"><table class="cls-week"><thead><tr><th scope="col">교시</th>${th}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted cls-w-legend">파란 테두리는 선생님이 고친 칸이에요. [다시 채우기]를 누르면 진도표·학사일정대로 돌아가요.</p>
      <h3 class="cls-w-h">요일별 알림</h3>
      <div class="cls-tbl-wrap"><table class="cls-week"><thead><tr><th scope="col">구분</th>${th}</tr></thead><tbody>${nrows}</tbody></table></div>
      <h3 class="cls-w-h">알려 드립니다</h3>
      <textarea class="field cls-w-announce" id="clsWAnnounce" rows="3" placeholder="한 주 전체에 알릴 말(예: 다음 주 화요일은 현장체험학습이에요. 도시락을 챙겨 주세요.)" aria-label="알려 드립니다">${esc(w.announce || '')}</textarea>
    </div>
  </div>`;
}

/* ---------- AI 알림 (지시·채우기 규칙은 weekly-ai.js — 이름·전화번호는 가려 보내고 답은 되돌림, 수업 없는 날은 채우지 않음) ---------- */
async function runAi() {
  const mon = monday;
  if (busy[mon]) return;
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  busy[mon] = true; delete rvState[mon];
  render();
  let wrote = [], sent = null;
  try {
    const { days, notes, w: w0 } = sheet(mon);
    // 화면 칸 그대로(선생님이 고친 교과 칸 — 「현장체험학습」 등)
    const q = notesPrompt(days, notes, { cellAt: (d, p) => weekCell(days, w0, d, p), periods: makeCtx().tt.periods });
    const v = await ai.generateJSON(q.prompt, { task: 'notes', valid: x => x && Array.isArray(x.days) });
    const got = normNotes(v.days);
    const w = getWeekly(mon); // 그사이 선생님이 쓴 칸은 덮지 않음
    const filled = [];
    for (const [d, k, t] of notesToFill(days, w.notes, got, q)) { w.notes[d][k] = t; filled.push([d, k]); }
    // 저장하지 못하면 「채웠어요」 대신 알리고 칸에도 넣지 않음(다시 그리면 사라질 글)
    if (filled.length && !saveWeekly(mon, w)) toast(FULL, 6000);
    else {
      if (visible() && monday === mon) {
        for (const [d, k] of filled) { const el = box.querySelector(`textarea[data-wn="${d}-${k}"]`); if (el && document.activeElement !== el) el.value = w.notes[d][k]; }
      }
      toast(filled.length ? `빈 칸 ${filled.length}개를 채웠어요` : '채울 빈 칸이 없었어요');
      wrote = filled.map(([d, k]) => [d, k, w.notes[d][k]]);
      sent = days;
    }
  } catch (err) { toast(ai.errorMessage(err && err.code, err), 6000); }
  delete busy[mon];
  if (visible() && monday === mon) { const b = box.querySelector('[data-w="ai"]'); if (b) { b.disabled = false; b.textContent = 'AI로 알림 쓰기'; } }
  if (wrote.length) await reviewNotes(mon, wrote, sent);
}
/* 검토 AI: 이번에 쓴 알림 칸을 한 번에 봄. 고칠 칸만 그 주의 rv에 */
async function reviewNotes(mon, wrote, days) {
  if (!pick('notes', 'review')) return;
  const entries = wrote.map(([d, k, text]) => ({ key: d, field: k, label: `${WD[d]}요일(${md(days[d].date)}) ${NOTE_LABEL[k] || k}`, text }));
  rvState[mon] = 'busy'; updateRv(mon);
  const v = await reviewJSON('notes', notesReviewPrompt('weekly', entries), { valid: x => Array.isArray(x) || !!(x && Array.isArray(x.items)) });
  if (v && v.error) rvState[mon] = 'fail'; else delete rvState[mon];
  if (v && !v.error) {
    const sentText = new Map(wrote.map(([d, k, text]) => [`${d}|${k}`, text]));
    const w = getWeekly(mon);
    for (const r of normNotesReview(v, [...sentText.keys()])) {
      // 검토하는 동안 선생님이 고친 칸은 의견을 버림
      if (w.notes[r.key][r.field] !== sentText.get(`${r.key}|${r.field}`)) continue;
      w.rv = [...w.rv.filter(x => !(x.key === r.key && x.field === r.field)), { key: r.key, field: r.field, problem: r.problem, fix: r.fix }];
    }
    save(mon, w);
  }
  updateRv(mon);
}
function chooseRv(key, useRv) {
  const [d, k] = key.split('-'), w = getWeekly(monday), r = rvAt(w, d, k);
  if (!r) return;
  if (useRv) { w.notes[d][k] = r.fix; const el = box.querySelector(`textarea[data-wn="${d}-${k}"]`); if (el) el.value = r.fix; }
  w.rv = w.rv.map(x => (x === r ? { ...x, done: useRv ? 'review' : 'main' } : x));
  save(monday, w); updateRv(monday);
}

/* ---------- 내보내기 ---------- */
function docOf() {
  const { days, w, notes, title } = sheet(monday);
  return { days, title, doc: weeklyDoc(days, { ...w, title, notes }, { periods: makeCtx().tt.periods, school: getSchool().name }), notes, w };
}
async function downloadHwpx() {
  const { days, title, doc } = docOf();
  try { toast(await exportDoc(doc, `${title}(${dotted(days[0].date)}~${dotted(days[4].date)})`), 6000); }
  catch (err) { toast('파일을 저장하지 못했어요'); }
}
function plainText() {
  const { days, title, w, notes } = docOf();
  const out = [`${title} (${fmtDay(days[0].date)} ~ ${fmtDay(days[4].date)})`];
  const P = weekPeriods(days, w, makeCtx().tt.periods);
  days.forEach((d, i) => {
    out.push('', `[${WD[i]} ${md(d.date)}]`);
    // 수업 없는 날도 선생님이 고쳐 쓴 칸이 있으면 한글 파일처럼 그 칸 글을(고친 칸이 없으면 까닭만)
    const own = Object.keys(w.cells || {}).some(k => k.startsWith(`${i}-`));
    if (d.off && !own) out.push(d.off);
    else for (let p = 1; p <= P; p++) { const c = weekCell(days, w, i, p); if (c) out.push(`${p}교시 ${c}`); }
    for (const [k, label] of NOTE_ROWS) if (notes[i][k]) out.push(`${label}: ${notes[i][k]}`);
  });
  if (String(w.announce || '').trim()) out.push('', '[알려 드립니다]', w.announce.trim());
  return out.join('\n');
}

/* [다시 채우기]: 고친 칸이 있으면 몇 칸인지 알리고 물음 → 교과 칸은 진도표대로, 학사일정 칸은 그 주 학사일정대로(요일별 알림·알려 드립니다는 그대로) */
function askRefill() {
  const days = weekView(makeCtx(), monday), w = getWeekly(monday), n = editedCount(days, w);
  const doIt = () => {
    const x = getWeekly(monday); x.cells = {};
    for (let d = 0; d < 5; d++) x.notes[d].events = null;
    if (!saveWeekly(monday, x)) { toast(FULL, 6000); return; }
    render(); toast('학습 칸과 학사일정을 진도표·학사일정대로 다시 채웠어요');
  };
  if (!n) { doIt(); return; }
  SS().openSheet(`<div id="clsRefill"><h3>고친 칸 ${n}개가 돌아가요</h3><p class="muted" style="margin:0">교과 칸은 진도표대로, 학사일정 칸은 그 주 학사일정대로 다시 채워요. 요일별 알림(준비물·과제·안내장·안전)과 「알려 드립니다」는 그대로예요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그대로 두기</button><button class="btn primary" type="button" id="clsRefillOk">다시 채우기</button></div></div>`,
  sh => sh.querySelector('#clsRefillOk').addEventListener('click', () => { SS().closeSheet(); doIt(); }));
}
const SS = () => window.SSAM;

/* ---------- 입력 ---------- */
function onInput(el) {
  const w = getWeekly(monday);
  if (el.id === 'clsWTitle') w.title = el.value;
  else if (el.id === 'clsWAnnounce') w.announce = el.value;
  else if (el.dataset.wc) {
    // 진도표대로의 글과 같아지면 고친 칸에서 뺌(뒤의 진도를 다시 따라감)
    const days = weekView(makeCtx(), monday), [d, p] = el.dataset.wc.split('-').map(Number);
    if (el.value === autoCell(days, d, p)) delete w.cells[el.dataset.wc]; else w.cells[el.dataset.wc] = el.value;
    el.classList.toggle('edited', Object.prototype.hasOwnProperty.call(w.cells, el.dataset.wc));
  }
  else if (el.dataset.wn) {
    const [d, k] = el.dataset.wn.split('-');
    // 학사일정 칸이 그 주 학사일정과 같아지면 다시 자동으로
    if (k === 'events') { const days = weekView(makeCtx(), monday); w.notes[d][k] = el.value === autoEvents(days[d].date) ? null : el.value; }
    else w.notes[d][k] = el.value;
    // 손으로 고친 칸의 검토 의견은 사라짐
    if (rvAt(w, d, k)) { w.rv = w.rv.filter(r => r.done || !(r.key === d && r.field === k)); save(monday, w); updateRv(monday); return; }
  }
  else return;
  save(monday, w);
}

/* 처음 열 때, 다른 탭에서 올 때, 날이 바뀐 뒤(다른 메뉴에 갔다 오거나 켜 둔 채)에는 그날의 기본 주(pickedOn: 기본 주를 정한 날) */
let pickedOn = '';
const toDefault = () => { pickedOn = today(); monday = defaultWeek(pickedOn); };
window.addEventListener('focus', () => {
  if (!visible() || pickedOn === today() || typing()) return;
  if (monday === defaultWeek(pickedOn)) { toDefault(); render(); } else pickedOn = today(); // 선생님이 고른 다른 주는 그대로
});
onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-weekly'; section.append(box); }
  if (tab === 'weekly' && (curTab !== 'weekly' || pickedOn !== today())) toDefault();
  curTab = tab;
  box.hidden = tab !== 'weekly';
  if (tab === 'weekly') render();
});
/* 다른 화면(준비의 AI 등)이 학급 자료를 바꿈: 이 화면 칸에 글을 치는 중이면 칸을 다시 만들지 않고(포커스·한글 조합이 끊기지 않게)
   다른 칸 글만 바꾸고, 표 모양(교시 수·시간표 있음)이 바뀌었으면 칸을 벗어날 때 다시 그림 */
const typing = () => { const a = document.activeElement; return a && box && box.contains(a) && a.matches('input, textarea') ? a : null; };
function refresh(active) {
  const ctx = makeCtx(), cells = box.querySelectorAll('textarea[data-wc]');
  if (!hasTimetable(ctx.tt) || cells.length !== 5 * ctx.tt.periods) { stale = true; return; }
  const { days, w, notes, title } = sheet(monday);
  cells.forEach(t => { if (t !== active) { const [d, p] = t.dataset.wc.split('-').map(Number); t.value = weekCell(days, w, d, p); } });
  box.querySelectorAll('textarea[data-wn]').forEach(t => { if (t !== active) { const [d, k] = t.dataset.wn.split('-'); t.value = notes[d][k]; } });
  const ti = box.querySelector('#clsWTitle'); if (ti && ti !== active) ti.value = title;
}
document.addEventListener('class:changed', () => { if (!visible()) return; const a = typing(); if (a) refresh(a); else render(); });
document.addEventListener('focusout', e => {
  if (!stale || !box || !box.contains(e.target)) return;
  setTimeout(() => { if (stale && visible() && !typing()) render(); }, 0);
});
document.addEventListener('input', e => { if (box && box.contains(e.target) && visible()) onInput(e.target); });
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  const u = e.target.closest('[data-rv-use]'), kp = e.target.closest('[data-rv-keep]'), nx = e.target.closest('[data-rv-next]');
  if (u || kp) { chooseRv((u || kp).dataset[u ? 'rvUse' : 'rvKeep'], !!u); return; }
  if (nx) { const op = box.querySelector('#clsRvBox .rv-op'); if (op) { op.scrollIntoView({ block: 'center', behavior: 'smooth' }); const x = op.querySelector('button'); if (x) x.focus({ preventScroll: true }); } return; }
  const b = e.target.closest('[data-w]');
  if (!b) return;
  const a = b.dataset.w;
  if (a === 'prev' || a === 'next') { monday = addDays(monday, a === 'prev' ? -7 : 7); render(); }
  else if (a === 'refill') askRefill();
  else if (a === 'ai') runAi();
  else if (a === 'hwpx') downloadHwpx();
  else if (a === 'copy') copyText(plainText()).then(ok => toast(ok ? '복사했어요' : '복사하지 못했어요'));
  else if (a === 'print') window.print();
  else if (a === 'setup') go('class', 'progress');
  else if (a === 'sample') askSample();
});
