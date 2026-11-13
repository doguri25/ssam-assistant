/* 「오늘」 화면 (스펙 2026-11-11 §2): 앱을 켜면 먼저 보임. 머리(날짜·학년도, 오늘 챙길 일 n가지, 사용 중인 AI 칩),
   파일 놓는 칸(끌어 놓기·[파일 고르기] → core/inbox.js receive — 쌤 버튼과 같은 길, 화면의 주 버튼은 이것 하나),
   카드 3개(공문 기한·오늘 수업·교과캠프 출석 — 오늘 캠프 수업이 없으면 캠프 카드는 숨김), 이어서 하기(5줄까지, core/brief-data.js와 같은 줄).
   다 비었으면(처음 쓰는 선생님) 시작 안내 3단계. 셈은 home-model.js(화면 없음), 저장은 각 메뉴 모델 그대로 */
import { onEnter, go } from '../../core/shell.js';
import { receive } from '../../core/inbox.js';
import { get, FULL_MSG } from '../../core/store.js';
import { toast } from '../../core/ui.js';
import { briefing } from '../../core/briefing.js';
import { gather, goRoute, today } from '../../core/brief-data.js';
import { ensureYears, isDemoYear } from '../../core/years.js';
import { listDocs } from '../etc/gongmun-model.js';
import { makeCtx, dayView, hasTimetable } from '../class/class-model.js';
import { listCamps, getCamp, saveCamp, currentCampId, setCurrentCamp, markRest, fmtDate } from '../class/camp-model.js';
import { listRecent } from '../purchase/library.js';
import { getMulti } from '../etc/multi-model.js';
import * as H from './home-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SS = () => window.SSAM || {};
const pad2 = n => String(n).padStart(2, '0');
const hhmm = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
const TRAY = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v10m0 0-4-4m4 4 4-4"/><path d="M4 14v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3h-4.5a3.5 3.5 0 0 1-7 0H4z"/></svg>';
const MARK = { O: ['○', '출석'], X: ['/', '결석'], '': ['—', '아직'], mixed: ['◐', '일부'] };
const NEXT_WORD = { O: '결석', X: '빈칸', '': '출석', mixed: '출석' };

let box = null, view = null, picker = null, brief = null, campPick = '', sig = '', tok = 0, shown = '';
const visible = () => !!(box && box.isConnected && !box.closest('[hidden]'));
function year() { let ls = null; try { ls = window.localStorage; } catch (e) {} return ensureYears(ls).current; }
function aiState() {
  const A = SS().ai;
  const ok = !!(A && A.engineReady && A.engineReady());
  return { ok, name: ok && A.engineName ? A.engineName() : '' };
}
const rosterCount = () => { const c = get('class', null); return Number(c && c.count) || 0; };

/* ---------- 자료 ---------- */
function data() {
  const t = today(), time = hhmm();
  const docs = listDocs();
  const ctx = makeCtx(t), tt = hasTimetable(ctx.tt);
  const lessons = H.lessonCard(tt ? dayView(ctx, t) : null, time, { hasTimetable: tt });
  const camps = listCamps(), todays = H.campsToday(camps, currentCampId(), t);
  const pick = todays.find(x => x.camp.id === campPick) || todays[0] || null;
  const camp = pick ? H.campCard(pick.camp, t) : null;
  const rows = H.continueRows({ brief: brief || [], recent: listRecent(), multi: H.multiLine(getMulti()) });
  const gm = H.gongmunCard(docs, t);
  return { t, time, gm, lessons, camp, todays, rows, blank: H.isBlank({ docs, hasTimetable: tt, camps, rows }) };
}
/* 1분마다: 날짜·지금 교시가 바뀌었으면 다시 그림 */
const sigOf = d => `${d.t}|${d.lessons.rows.map(r => r.now).join(',')}`;

/* ---------- 그리기 ---------- */
function headHTML(d) {
  const a = aiState(), n = H.todoCount({ gongmun: d.gm, lessons: d.lessons, camp: d.camp }), y = year(), demo = isDemoYear(y);
  // [3분 둘러보기](core/tour.js가 누르기를 받음): 체험 중이면 안내를 처음부터
  const tour = demo ? '<button type="button" class="btn tonal hm-tour" data-tour="steps">안내 다시 보기</button>'
    : '<button type="button" class="btn tonal hm-tour" data-tour="start" aria-haspopup="dialog"><span aria-hidden="true">▶</span>3분 둘러보기</button>';
  return `<header class="hm-head">
    <div class="hm-head-t"><p class="hm-date">${esc(H.dateLine(d.t, y, { demo }))}</p><h2 id="hmTitle">${esc(H.headline(n))}</h2></div>
    <div class="hm-head-b">${tour}
    <button type="button" class="hm-ai ${a.ok ? 'ok' : 'need'}" data-hm-go="ai" aria-label="사용 중인 AI: ${esc(a.ok ? `${a.name} 준비됨` : '정해 주세요')} (설정 › AI로 가기)">
      <span class="hm-ai-dot" aria-hidden="true">${a.ok ? '✓' : '!'}</span><span>${a.ok ? `${esc(a.name || 'AI')} · 준비됨` : 'AI를 정해 주세요'}</span></button></div>
  </header>`;
}
const dropHTML = () => `<div class="hm-drop" id="hmDrop" data-hm-drop>
    <span class="hm-drop-ic">${TRAY}</span>
    <div class="hm-drop-t"><b>무엇이든 여기에 놓으세요</b><span>공문·평가계획·진도표·명단·견적서 — 쌤비서가 알아보고 그 메뉴에서 해요.</span></div>
    <button class="btn primary" type="button" data-hm="pick">파일 고르기</button>
  </div>`;

function gmHTML(d) {
  const rows = d.gm.map(x => `<li><button type="button" class="hm-line" data-hm-go="gongmun"><span class="hm-badge t-${x.tone}" title="${esc(x.note)}">${x.sym ? `<span aria-hidden="true">${x.sym}</span>` : ''}${esc(x.badge)}<span class="sr-only"> (${esc(x.note)})</span></span><span class="hm-line-t">${esc(x.title)}</span></button></li>`).join('');
  return `<section class="hm-card hm-gm" aria-labelledby="hmGmH"><div class="hm-card-h"><h3 id="hmGmH">공문 기한</h3></div>
    ${rows ? `<ul class="hm-list">${rows}</ul>` : '<p class="muted hm-none">가까운 기한이 없어요</p>'}
    <div class="hm-card-f"><button type="button" class="btn text" data-hm-go="gongmun">공문 처리</button></div></section>`;
}
function lessonHTML(d) {
  const c = d.lessons;
  let body;
  if (c.state === 'none') body = '<p class="muted hm-none">진도표·시간표를 넣으면 보여요</p>';
  else if (c.state === 'off') body = `<p class="muted hm-none">${esc(c.off)} — 수업이 없는 날이에요</p>`;
  else if (c.state === 'empty') body = '<p class="muted hm-none">오늘은 시간표에 수업이 없어요</p>';
  else body = `<ol class="hm-list hm-lessons">${c.rows.map(r => `<li class="hm-ls s-${r.status}${r.now ? ` is-${r.now}` : ''}"${r.now === 'now' ? ' aria-current="time"' : ''}>
      <span class="hm-ls-p">${r.period}교시</span>
      <span class="hm-ls-main"><b>${esc(r.subject)}</b><span class="hm-ls-l">${esc(r.text)}</span></span>
      ${r.now ? `<span class="hm-now">${r.now === 'now' ? '지금' : '다음'}</span>` : ''}
      ${r.label ? `<span class="hm-st s-${r.status}"><span aria-hidden="true">${r.sym}</span>${esc(r.label)}</span>` : ''}</li>`).join('')}</ol>`;
  const link = c.state === 'none' ? '<button type="button" class="btn text" data-hm-go="progress">진도표·시수로</button>' : '<button type="button" class="btn text" data-hm-go="today">오늘 수업 열기</button>';
  return `<section class="hm-card hm-today" aria-labelledby="hmTodayH"><div class="hm-card-h"><h3 id="hmTodayH">오늘 수업</h3>${c.left ? `<span class="muted">남은 수업 ${c.left}</span>` : ''}</div>
    ${body}<div class="hm-card-f">${link}</div></section>`;
}
function campHTML(d) {
  const k = d.camp;
  if (!k) return '';
  const pick = d.todays.length > 1 ? `<div class="hm-camp-pick" role="group" aria-label="오늘 수업이 있는 기초학력 프로그램">${d.todays.map(x =>
    `<button type="button" class="chip hm-chip" data-hm-camp="${esc(x.camp.id)}" aria-pressed="${x.camp.id === k.id}">${esc(x.camp.name || '이름 없는 프로그램')}</button>`).join('')}</div>` : '';
  const sts = k.students.length ? `<div class="hm-att" role="group" aria-label="학생 출석 (누를 때마다 출석 → 결석 → 빈칸)">${k.students.map(s => {
    const [sym, word] = MARK[s.mark] || MARK[''];
    return `<button type="button" class="hm-att-btn m-${s.mark || 'none'}" data-hm-mark="${esc(s.id)}" aria-label="${esc(s.name)}: ${word} (누르면 ${NEXT_WORD[s.mark] || '출석'})">
      <span class="hm-att-m" aria-hidden="true">${sym}</span><span class="hm-att-n">${esc(s.name)}</span><span class="hm-att-w" aria-hidden="true">${word}</span></button>`;
  }).join('')}</div>` : '<p class="muted hm-none">기초학력에 학생을 넣으면 여기서 출석을 체크해요</p>';
  return `<section class="hm-card hm-camp" aria-labelledby="hmCampH"><div class="hm-card-h"><h3 id="hmCampH">기초학력 출석</h3>
      <span class="muted">${esc(k.name)} · 오늘 ${k.count}번${k.time ? ` · ${esc(k.time)}` : ''}</span></div>
    ${pick}${sts}
    <div class="hm-card-f">${k.students.length ? '<button type="button" class="btn tonal" data-hm="attAll">남은 칸 모두 출석</button>' : ''}<button type="button" class="btn text" data-hm-go="camp">기초학력 열기</button></div></section>`;
}
function contHTML(d) {
  if (brief === null) return '<section class="hm-cont" aria-labelledby="hmContH"><h3 id="hmContH">이어서 하기</h3><p class="muted hm-none"><span class="spin"></span>세는 중…</p></section>';
  if (!d.rows.length) return '';
  return `<section class="hm-cont" aria-labelledby="hmContH"><h3 id="hmContH">이어서 하기</h3>
    <ul class="hm-rows">${d.rows.map((r, i) => `<li><button type="button" class="hm-row" data-hm-row="${i}"><span class="hm-row-t">${esc(r.text)}</span>${r.when ? `<span class="hm-when${r.hot ? ' hot' : ''}">${esc(r.when)}</span>` : ''}<span class="hm-row-go" aria-hidden="true">›</span></button></li>`).join('')}</ul></section>`;
}
function startHTML() {
  const a = aiState(), steps = H.starter({ aiReady: a.ok, roster: rosterCount() > 0 });
  const how = {
    ai: ['설정 › AI에서 키를 넣거나 시험용 AI를 골라요.', '<button type="button" class="btn text" data-hm-go="ai">설정 › AI</button>'],
    roster: ['설정 › 학급 명단에서 학생 수를 넣거나 엑셀에서 가져와요.', '<button type="button" class="btn text" data-hm-go="roster">학급 명단</button>'],
    drop: ['공문·평가계획·진도표를 위 칸에 놓으면 쌤비서가 알아보고 그 메뉴에서 해요.', '']
  };
  return `<section class="hm-start" aria-labelledby="hmStartH"><h3 id="hmStartH">처음이라면 이렇게 시작해요</h3>
    <ol class="hm-steps">${steps.map((s, i) => `<li class="${s.done ? 'done' : ''}"><span class="hm-step-n" aria-hidden="true">${s.done ? '✓' : i + 1}</span>
      <div class="hm-step-t"><b>${esc(s.text)}${s.done ? '<span class="sr-only"> (했어요)</span>' : ''}</b><span class="muted">${how[s.id][0]}</span>${how[s.id][1]}</div></li>`).join('')}</ol></section>`;
}

function draw() {
  if (!box) return;
  const d = data();
  sig = sigOf(d);
  const html = `<div class="m-page hm-page">${headHTML(d)}${dropHTML()}
    ${d.blank ? startHTML() : `<div class="hm-cards">${gmHTML(d)}${lessonHTML(d)}${campHTML(d)}</div>${contHTML(d)}`}</div>`;
  // 바뀐 것이 없으면 그대로 둠(들어올 때·브리핑을 다 모았을 때 같은 내용으로 다시 그려 끌어 오던 칸·누르던 단추가 바뀌지 않게)
  if (html === shown && view.firstChild) return;
  shown = html;
  const keep = document.activeElement && box.contains(document.activeElement) ? keyOf(document.activeElement) : '';
  view.innerHTML = html;
  if (keep) { const el = box.querySelector(keep); if (el) el.focus(); }
}
/* 다시 그린 뒤에도 누르던 단추에 초점이 남게 */
function keyOf(el) {
  for (const a of ['data-hm-mark', 'data-hm-camp', 'data-hm', 'data-hm-row', 'data-hm-go']) if (el.hasAttribute(a)) return `[${a}="${CSS.escape(el.getAttribute(a))}"]`;
  return '';
}
async function refresh() {
  const my = ++tok;
  let lines = [];
  try { lines = briefing(await gather(today())); } catch (e) { lines = []; }
  if (my !== tok || !visible()) return;
  brief = lines;
  draw();
}

/* ---------- 누르기 ---------- */
function camp() { const k = data().camp; return k ? getCamp(k.id) : null; }
function onClick(e) {
  const t = e.target;
  const g = t.closest('[data-hm-go]');
  if (g) {
    const to = g.dataset.hmGo;
    if (to === 'gongmun') go('etc', 'gongmun');
    else if (to === 'today') go('class', 'today');
    else if (to === 'progress') go('class', 'progress');
    else if (to === 'ai') go('settings', 'ai');
    else if (to === 'roster') go('settings', 'roster');
    else if (to === 'camp') { const k = data().camp; if (k && k.id !== currentCampId()) setCurrentCamp(k.id); goRoute({ to: 'camp', section: 'att' }); } // 보던 캠프로
    return;
  }
  const r = t.closest('[data-hm-row]');
  if (r) { const row = data().rows[+r.dataset.hmRow]; if (row) goRoute(row.route); return; }
  const m = t.closest('[data-hm-mark]');
  if (m) {
    const c = camp();
    if (!c) return;
    if (!saveCamp(H.cycleDay(c, today(), m.dataset.hmMark))) { toast(FULL_MSG, 7000); return; }
    draw();
    return;
  }
  const p = t.closest('[data-hm-camp]');
  if (p) { campPick = p.dataset.hmCamp; draw(); return; }
  const b = t.closest('[data-hm]');
  if (!b) return;
  if (b.dataset.hm === 'pick') picker.click();
  else if (b.dataset.hm === 'attAll') {
    const c = camp();
    if (!c) return;
    // 남은 칸만 ○(이미 적은 / 결석은 그대로 — 출석부에 그대로 나감)
    if (!saveCamp(markRest(c, today()))) { toast(FULL_MSG, 7000); return; }
    draw();
    toast(`${fmtDate(today())} ${c.name || '기초학력'} 남은 칸을 출석으로 표시했어요(결석은 그대로)`);
  }
}

function mount(section) {
  box = document.createElement('div');
  box.className = 'hm-box';
  shown = '';
  // 파일 고르기 칸은 다시 그리는 곳 밖에 둠(고르는 창이 닫힐 때 창이 앞에 와 다시 그려도 고른 파일이 사라지지 않게)
  view = document.createElement('div');
  picker = Object.assign(document.createElement('input'), { type: 'file', id: 'hmFile', multiple: true, hidden: true });
  box.append(view, picker);
  section.append(box);
  box.addEventListener('click', onClick);
  picker.addEventListener('change', () => {
    const fs = [...(picker.files || [])];
    picker.value = '';
    if (fs.length) receive(fs);
  });
  // 놓는 칸: 자기에게 온 끌어 놓기만 받고 더 퍼뜨리지 않음(쌤 버튼의 놓기 판·다른 메뉴의 칸과 겹치지 않게)
  const zone = e => (hasFiles(e) && e.target.closest ? e.target.closest('[data-hm-drop]') : null);
  for (const ev of ['dragenter', 'dragover']) box.addEventListener(ev, e => {
    const z = zone(e);
    if (!z) return;
    e.preventDefault(); e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    z.classList.add('over');
  });
  box.addEventListener('dragleave', e => { const z = zone(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  box.addEventListener('drop', e => {
    const z = zone(e);
    if (!z) return;
    e.preventDefault(); e.stopPropagation();
    z.classList.remove('over');
    const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])];
    if (fs.length) receive(fs);
  });
}

onEnter('home', (tab, section) => {
  if (!box || !section.contains(box)) mount(section);
  draw();
  refresh();
});
// 학급 체크·AI 바꿈·창으로 돌아옴(다른 창에서 고쳤을 수 있음): 보이면 다시
document.addEventListener('class:changed', () => { if (visible()) draw(); });
document.addEventListener('ssam:ai-changed', () => { if (visible()) draw(); });
window.addEventListener('focus', () => { if (visible()) refresh(); });
// 켜 둔 채 교시·날이 바뀌면 「지금」을 옮김 (칸에 치는 중이면 건너뜀)
setInterval(() => { if (visible() && !(document.activeElement && box.contains(document.activeElement) && document.activeElement.matches('input,textarea')) && sigOf(data()) !== sig) refresh(); }, 60000);
