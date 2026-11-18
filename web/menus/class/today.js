/* 학급 › 오늘 수업: 그날 교시별 교과·차시를 보이고 [완료 / 일부 진행 / 못 함]을 체크 (스펙 4.1, 3.3, 2026-11-18 class-fix A).
   진도표 없는 교과도 체크(시수만), 전담은 체크하지 않음. 앞날은 체크할 수 없음(교과 바꾸기·메모는 미리 됨).
   하루 한꺼번에([남은 칸 모두 완료]·[이 날 모두 못 함]), 교시마다 [교과 바꾸기](교체·보강 — 그날 기록에만)·[메모](다음 시간 줄에 「지난 시간」) */
import { onEnter, go } from '../../core/shell.js';
import { toast } from '../../core/ui.js';
import { listEvents, addDays, isDate } from '../../core/calendar.js';
import { normName } from './class-import.js';
import {
  makeCtx, dayView, setMark, setSwap, setMemo, markDay, dayMarks, canMark, missingList, fmtDay, fmtShort, today, unitPos, hasTimetable, extraNames
} from './class-model.js';
import { askSample } from './setup.js';
import { introHTML } from '../../core/ui-parts.js';
import { listDocs } from '../etc/gongmun-model.js';
import { ddayText } from '../etc/gongmun-ai.js';
import { dueBand } from '../home/home-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => window.SSAM || {};
const FULL = '저장 공간이 모자라 저장하지 못했어요';
const NAMES = ['국어', '수학', '사회', '과학', '영어', '음악', '미술', '체육', '도덕', '실과', '창체'];
const MARKS = [['done', '완료'], ['part', '일부 진행'], ['skip', '못 함']];
let box = null, curTab = null, date = null, memoAt = 0; // memoAt: 메모 칸을 연 교시(0 = 없음)
let closedAt = { p: 0, t: 0 }; // 방금 칸을 벗어나 저장하며 닫은 메모(그 [메모] 단추를 눌러 닫은 것이면 다시 열지 않게)
const visible = () => curTab === 'today' && box && box.isConnected && !box.closest('[hidden]');
const pagesText = p => (/^[\d\s~,.-]+$/.test(p) ? `${p}쪽` : p);
const changed = () => document.dispatchEvent(new CustomEvent('class:changed', { detail: { from: 'today' } }));

function slotHTML(s, ro) {
  let body;
  if (s.kind === 'staff') body = '<span class="cls-tag">전담</span><span class="muted">체크하지 않아요</span>';
  else if (s.kind === 'hours') body = '<span class="muted">진도표 없음 · 시수만 세요</span>';
  else if (!s.lesson) body = '<span class="muted">진도표의 차시를 모두 마쳤어요</span>';
  else {
    const l = s.lesson, pos = unitPos(s.sub, s.index);
    body = `${l.unit ? `<span class="muted cls-l-unit">${esc(l.unit)}</span>` : ''}<span class="cls-l-n">${pos.n}/${pos.of}차시</span>
      <span class="cls-l-t">${esc(l.title)}</span>${l.pages ? `<span class="muted">${esc(pagesText(l.pages))}</span>` : ''}${l.memo ? `<span class="cls-tag">${esc(l.memo)}</span>` : ''}`;
  }
  const swap = s.swap ? `<span class="cls-tag cls-swap">${s.planned ? `교체 · 시간표는 ${esc(s.planned)}` : '보강'}</span>` : '';
  const last = s.last ? `<span class="cls-last">지난 시간: ${esc(s.last)}</span>` : '';
  const memo = memoAt === s.period
    ? `<label class="cls-memo-f"><span class="sr-only">${s.period}교시 수업 메모</span><input class="field" data-memo="${s.period}" maxlength="120" value="${esc(s.memo)}" placeholder="예: 활동 3 못 함, 다음 시간에"></label>`
    : s.memo ? `<span class="cls-memo">메모: ${esc(s.memo)}</span>` : '';
  const marks = s.kind === 'staff' ? '' : `<div class="seg cls-marks" role="group" aria-label="${s.period}교시 ${esc(s.subject)} 체크">${MARKS.map(([k, label]) =>
    `<button type="button" data-mark="${k}" data-p="${s.period}" aria-pressed="${s.status === k}"${ro ? ' disabled' : ''}>${label}</button>`).join('')}</div>`;
  const tools = `<div class="cls-l-tools"><button class="btn text" type="button" data-swap="${s.period}">교과 바꾸기</button>`
    + `<button class="btn text" type="button" data-memo-open="${s.period}" aria-expanded="${memoAt === s.period}">${s.memo ? '메모 고치기' : '메모'}</button></div>`;
  return `<li class="cls-lesson${s.status ? ' marked' : ''}" data-p="${s.period}" data-kind="${s.kind}"${s.index != null ? ` data-index="${s.index}"` : ''}>
    <span class="cls-l-p">${s.period}교시</span>
    <div class="cls-l-main"><b class="cls-l-s">${esc(s.subject)}</b>${swap}${body}${last}${memo}${tools}</div>${marks}</li>`;
}
/* 하루 한꺼번에: 학사일정이 있는 날은 [이 날 모두 못 함]을 칩 옆에(eventsHTML), 앞날은 안내만 */
function dayActsHTML(ctx, v, withEvents) {
  if (!v.slots.length) return '';
  if (!canMark(ctx, date)) return '<p class="muted cls-note cls-ahead-note">앞날은 체크할 수 없어요. 교과 바꾸기·메모는 미리 할 수 있어요.</p>';
  const m = dayMarks(ctx, date);
  if (!m.left && !m.marked) return '';
  const left = m.left ? '<button class="btn text" type="button" data-day="done">남은 칸 모두 완료</button>' : '';
  const skip = withEvents ? '' : '<button class="btn text" type="button" data-day="skip">이 날 모두 못 함</button>';
  return left || skip ? `<div class="cls-day-acts">${left}${skip}</div>` : '';
}
function listHTML(ctx) {
  const v = dayView(ctx, date);
  if (v.off) return `<div class="yp-card cls-off"><b>${esc(v.off)}</b><span class="muted">수업이 없는 날이에요.</span></div>`;
  if (!v.slots.length) return '<div class="yp-card"><p class="muted" style="margin:0">이 요일에는 시간표에 수업이 없어요.</p></div>';
  const ro = !canMark(ctx, date), withEvents = listEvents().some(e => e.date === date);
  return `<ol class="cls-lessons yp-card">${v.slots.map(s => slotHTML(s, ro)).join('')}</ol>${dayActsHTML(ctx, v, withEvents)}`;
}
function eventsHTML(ctx) {
  const events = listEvents().filter(e => e.date === date);
  if (!events.length) return '';
  const v = dayView(ctx, date), m = !v.off && canMark(ctx, date) ? dayMarks(ctx, date) : null;
  const skip = m && (m.left || m.marked) ? '<button class="btn" type="button" data-day="skip">이 날 모두 못 함</button>' : '';
  return `<div class="cls-events">${events.map(e => `<span class="cls-chip">${esc(e.title)}</span>`).join('')}${skip}</div>`;
}
function missingHTML(ctx) {
  const days = missingList(ctx);
  if (!days.length) return '';
  return `<div class="banner warn cls-missing"><span>체크하지 않은 날:</span>${days.map(d => `<button class="btn text" type="button" data-go-day="${d.date}">${fmtShort(d.date)}${d.part ? ` ${d.periods.join('·')}교시 남음` : ''}</button>`).join('')}</div>`;
}
/* 공문 기한 띠(스펙 2026-11-04 5.3): 「오늘」 공문 카드와 같은 차례(오늘·가까운 것 먼저, 지난 것은 뒤 — home-model dueBand) 3개 + 「외 n건」,
   누르면 문서·소통 › 공문 처리 */
function bandHTML() {
  const b = dueBand(listDocs(), today());
  return b.items.length ? `<div class="gm-band banner warn" id="gmBand"><b>공문 기한</b>${b.items.map(d => `<button class="btn text" type="button" data-gm-band><b>${esc(ddayText(d.n))}</b> ${esc(d.title || d.name || '공문')}</button>`).join('')}${b.more ? `<button class="btn text" type="button" data-gm-band>외 ${b.more}건</button>` : ''}</div>` : '';
}
function render() {
  if (!box) return;
  const ctx = makeCtx();
  const head = `<div class="m-head"><h2>오늘 수업</h2>${introHTML('today', '교시마다 수업한 만큼 체크하면 시수와 진도가 저절로 계산돼요.')}</div>` + bandHTML();
  if (!hasTimetable(ctx.tt)) {
    box.innerHTML = `<div class="m-page cls-page">${head}<div class="yp-card"><p style="margin:0">먼저 진도표·시수 › 준비에서 시간표를 넣어 주세요.</p>
      <div class="row"><button class="btn primary" type="button" data-t="setup">준비로 가기</button><button class="btn" type="button" data-t="sample">예시로 채우기</button></div></div></div>`;
    return;
  }
  box.innerHTML = `<div class="m-page cls-page">${head}
    <div class="cls-day-nav">
      <button class="icon-btn" type="button" data-t="prev" aria-label="전날">‹</button>
      <b class="cls-day" aria-live="polite">${fmtDay(date)}</b>
      <button class="icon-btn" type="button" data-t="next" aria-label="다음 날">›</button>
      <button class="btn text" type="button" data-t="today">오늘</button>
      <input class="field" type="date" id="clsDate" value="${date}" aria-label="날짜 고르기">
    </div>
    <div id="clsEvents">${eventsHTML(ctx)}</div>
    <div id="clsMissing">${missingHTML(ctx)}</div>
    <div id="clsLessons">${listHTML(ctx)}</div>
  </div>`;
}
/* 체크하면 교시 목록·학사일정 줄·「체크하지 않은 날」만 다시 그림 (같은 교과 뒤 시간의 차시가 바뀌므로 목록 전체) */
function redrawLessons() {
  const ctx = makeCtx();
  const l = box.querySelector('#clsLessons'), m = box.querySelector('#clsMissing'), ev = box.querySelector('#clsEvents');
  if (l) l.innerHTML = listHTML(ctx);
  if (m) m.innerHTML = missingHTML(ctx);
  if (ev) ev.innerHTML = eventsHTML(ctx);
}
function setDate(d) { if (isDate(d)) { date = d; memoAt = 0; render(); } }
const slotAt = p => dayView(makeCtx(), date).slots.find(s => s.period === p);
const saved = ok => { if (!ok) toast(FULL, 6000); return ok; };

/* 하루 한꺼번에. 「이 날 모두 못 함」은 완료·일부 진행한 칸이 있으면 먼저 물음 */
function dayAll(status) {
  const ctx = makeCtx();
  if (!canMark(ctx, date)) return;
  const apply = only => {
    const n = markDay(makeCtx(), date, status, only);
    if (n < 0) { toast(FULL, 6000); return; }
    redrawLessons(); changed();
    if (n) toast(status === 'done' ? `${n}칸을 「완료」로 체크했어요` : `${n}칸을 「못 함」으로 체크했어요`);
  };
  if (status === 'skip') {
    const m = dayMarks(ctx, date);
    if (m.kept) {
      S().openSheet(`<h3>${esc(fmtShort(date))} 모두 「못 함」으로 할까요?</h3>
        <p class="muted" style="margin:0">「완료」·「일부 진행」으로 체크한 ${m.kept}칸도 「못 함」으로 바뀌어요.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button>
          ${m.left ? '<button class="btn" type="button" id="clsSkipLeft">남은 칸만</button>' : ''}<button class="btn primary" type="button" id="clsSkipAll">모두 못 함</button></div>`,
      sh => {
        sh.querySelector('#clsSkipAll').addEventListener('click', () => { S().closeSheet(); apply('all'); });
        const l = sh.querySelector('#clsSkipLeft'); if (l) l.addEventListener('click', () => { S().closeSheet(); apply('left'); });
      });
      return;
    }
    apply('all');
    return;
  }
  apply('left');
}
/* 교과 바꾸기(교체·보강): 그날 그 교시 기록에만, 시간표는 그대로 */
function openSwap(p) {
  const s = slotAt(p);
  if (!s) return;
  const at = date, planned = s.planned != null ? s.planned : s.subject;
  const names = [...new Set([...extraNames(makeCtx()), ...makeCtx().subjects.map(x => x.name), ...NAMES])];
  S().openSheet(`<h3>${esc(fmtShort(at))} ${p}교시 교과 바꾸기</h3>
    <p class="muted" style="margin:0">교체·보강한 그날만 바꿔요. 시간표는 그대로예요.${planned ? ` (시간표: ${esc(planned)})` : ''}</p>
    <label class="yp-f"><span class="lab">이 시간에 한 교과</span><input class="field" id="clsSwapName" list="clsSwapNames" value="${esc(s.subject)}"></label>
    <datalist id="clsSwapNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="row" style="justify-content:flex-end">${s.swap && planned ? '<button class="btn text" type="button" id="clsSwapBack">시간표대로</button>' : ''}
      <button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="clsSwapOk">바꾸기</button></div>`,
  sh => {
    const done = name => {
      if (!normName(name)) { toast('교과 이름을 넣어 주세요'); return; }
      S().closeSheet();
      if (!saved(setSwap(at, p, name, planned))) return;
      if (at === date && visible()) redrawLessons();
      changed();
    };
    sh.querySelector('#clsSwapOk').addEventListener('click', () => done(sh.querySelector('#clsSwapName').value));
    sh.querySelector('#clsSwapName').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) done(e.target.value); });
    const back = sh.querySelector('#clsSwapBack'); if (back) back.addEventListener('click', () => done(planned));
  });
}
/* 메모 저장: 그 칸만 고쳐 그림(칸을 벗어나며 누른 다른 단추가 그대로 눌리게 — 목록 전체를 다시 그리지 않음) */
function saveMemo(el) {
  const p = +el.dataset.memo, s = slotAt(p);
  memoAt = 0; closedAt = { p, t: Date.now() };
  if (!s) return;
  const text = el.value.trim().slice(0, 200);
  if (text !== s.memo && !saved(setMemo(date, p, s.subject, text))) return;
  const li = el.closest('li'), f = el.closest('.cls-memo-f');
  if (f) f.outerHTML = text ? `<span class="cls-memo">메모: ${esc(text)}</span>` : '';
  const b = li && li.querySelector('[data-memo-open]');
  if (b) { b.textContent = text ? '메모 고치기' : '메모'; b.setAttribute('aria-expanded', 'false'); }
  if (text !== s.memo) changed();
}

/* 다른 메뉴에 갔다 오거나 켜 둔 채 날이 바뀌면 오늘로 (shownOn: 그 날짜를 보기 시작한 실제 날). 학급 탭끼리 오가면 고른 날 그대로 */
let away = false, shownOn = '';
const toToday = () => { date = today(); shownOn = date; memoAt = 0; };
document.addEventListener('menu:go', e => { if (e.detail.menu !== 'class') away = true; });
window.addEventListener('focus', () => {
  if (!visible() || shownOn === today()) return;
  if (date === shownOn) { toToday(); render(); } else shownOn = today(); // 선생님이 고른 다른 날은 그대로
});
onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-today'; section.append(box); }
  if (tab === 'today' && (away || !date || shownOn !== today())) toToday();
  away = false;
  curTab = tab;
  box.hidden = tab !== 'today';
  if (tab === 'today') render();
});
document.addEventListener('class:changed', e => { if (visible() && !(e.detail && e.detail.from === 'today')) render(); });
document.addEventListener('change', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  if (e.target.id === 'clsDate') setDate(e.target.value);
  else if (e.target.dataset.memo) saveMemo(e.target);
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if (!box || !box.contains(el) || !el.dataset || !el.dataset.memo || e.isComposing) return;
  if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
  else if (e.key === 'Escape') { memoAt = 0; redrawLessons(); }
});
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  const m = e.target.closest('[data-mark]');
  if (m) {
    const p = +m.dataset.p, ctx = makeCtx();
    if (!canMark(ctx, date)) { toast('앞날은 체크할 수 없어요'); return; }
    const slot = dayView(ctx, date).slots.find(s => s.period === p);
    if (!slot || slot.kind === 'staff') return;
    const next = slot.status === m.dataset.mark ? null : m.dataset.mark;
    if (!saved(setMark(date, p, slot.subject, next))) return;
    redrawLessons();
    changed();
    return;
  }
  const dd = e.target.closest('[data-day]');
  if (dd) { dayAll(dd.dataset.day); return; }
  const sw = e.target.closest('[data-swap]');
  if (sw) { openSwap(+sw.dataset.swap); return; }
  const mo = e.target.closest('[data-memo-open]');
  if (mo) {
    const p = +mo.dataset.memoOpen;
    if (closedAt.p === p && Date.now() - closedAt.t < 800) { closedAt = { p: 0, t: 0 }; return; }
    memoAt = memoAt === p ? 0 : p;
    redrawLessons();
    const f = memoAt && box.querySelector(`[data-memo="${p}"]`); if (f) f.focus();
    return;
  }
  if (e.target.closest('[data-gm-band]')) { go('etc', 'gongmun'); return; }
  const g = e.target.closest('[data-go-day]');
  if (g) { setDate(g.dataset.goDay); return; }
  const b = e.target.closest('[data-t]');
  if (!b) return;
  const t = b.dataset.t;
  if (t === 'prev') setDate(addDays(date, -1));
  else if (t === 'next') setDate(addDays(date, 1));
  else if (t === 'today') setDate(today());
  else if (t === 'setup') go('class', 'progress');
  else if (t === 'sample') askSample();
});
