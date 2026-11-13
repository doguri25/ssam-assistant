/* 3분 둘러보기 (스펙 2026-11-13-miss-tour-check §3).
   들어가기: 묻는 창 → 체험 표시(공통 키 demo: { from: 원래 학년도, at, step, nav, tabs })를 적고 → 지금 학년도를 보관함에 넣고 체험용 학년도(years.js DEMO_YEAR)로
   지어낸 자료(demo-data.js, AI 없이)를 씀 — 학년도 옮기기와 같은 흐름(year-switch.js moveYear) → 다시 엶.
   안내: 말풍선 단계(tour-steps.js) — 그 화면으로 가서 가리킬 곳에 테두리, [다음]·[건너뛰기], Esc로 닫기, 말풍선으로 초점. 다시 열어도 하던 단계부터.
   체험 중: 화면 위 「체험 중 · [체험 끝내기]」 띠가 늘 보임. 백업·불러오기·새 학년도·학년도 옮기기는 설정 › 학년도가 막음(DEMO_WAIT).
   끝내기: 원래 학년도로 옮김 → 체험용 보관 자료 지움 → demo 지움(메뉴마다 마지막 탭도 들어오기 전대로) → 다시 열고 「원래 자료로 돌아왔어요」.
   선생님 자료는 그동안 보관함에 그대로 있고, 돌아오면 학년도 자료(ssam: 키)가 들어가기 전과 글자 하나까지 같음 */
import { DEMO_YEAR, demoOf, getYears } from './years.js';
import { moveYear, switchError, getArchive, safeLS } from './year-switch.js';
import { FULL_MSG } from './store.js';
import { tourSteps } from './tour-steps.js';

const KEY = 'ssam:demo', BACK = 'ssam-tour-back'; // BACK: 끝내고 다시 열 때 알림(창마다 — sessionStorage, 학년도 자료가 아님)
const SS = () => window.SSAM || {};
const toast = (m, ms) => { if (SS().toast) SS().toast(m, ms); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const narrow = () => window.matchMedia && window.matchMedia('(max-width:760px)').matches;
/* 보관함(IndexedDB)이 응답하지 않아도 멈춰 있지 않게: ms 안에 끝나지 않으면 그냥 넘어감 */
const soon = (p, ms = 5000) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise(ok => setTimeout(ok, ms))]);

/* 체험 중이면 표시({ from, … }), 체험용 학년도인데 표시가 없어진 경우는 { from: null }(끝낼 때 보관함에서 찾음), 아니면 null */
export function inDemo() {
  const ls = safeLS();
  if (!ls) return null;
  return demoOf(ls) || (getYears(ls).current === DEMO_YEAR ? { from: null } : null);
}
function writeMark(patch) {
  const ls = safeLS(), d = ls && demoOf(ls);
  if (!d) return;
  try { ls.setItem(KEY, JSON.stringify({ ...d, ...patch })); } catch (e) {}
}

/* ---------- 들어가기 ---------- */
/* 「오늘」 [3분 둘러보기]·채팅 「둘러보기」: 체험 중이 아니면 묻는 창('asked'), 체험 중이면 안내를 처음부터('steps') */
export function startTour() {
  if (inDemo()) { showStep(0); return 'steps'; }
  if (!SS().openSheet) return 'error';
  SS().openSheet(`<h3>3분 둘러보기</h3>
    <p style="margin:0">지금 자료는 그대로 두고 체험용 자료로 바꿔요. 끝내면 돌아와요.</p>
    <ul class="tour-sum"><li>지어낸 학급(새싹초등학교 3학년 1반)의 단원평가·기초학력·평어로 ${tourSteps().length}단계를 보여 줘요.</li>
      <li>체험 중에 바꾼 것은 끝낼 때 사라져요. 백업·학년도 옮기기는 체험을 끝낸 뒤에 해요.</li></ul>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" id="tourGo">둘러보기 시작</button></div>`,
  sh => { sh.classList.add('tour-ask'); sh.querySelector('#tourGo').addEventListener('click', () => { SS().closeSheet(); enterDemo(); }); });
  const go = document.querySelector('#sheetRoot #tourGo');
  if (go) go.focus();
  return 'asked';
}
let moving = false;
async function enterDemo() {
  const ls = safeLS();
  if (moving || !ls) { if (!ls) toast('이 브라우저는 저장소를 막아 두어 둘러보기를 할 수 없어요', 6000); return; }
  if (inDemo()) { showStep(0); return; }
  const from = getYears(ls).current;
  let snap;
  try { snap = (await import('./demo-data.js')).demoSnapshot(today()); } catch (e) { toast('체험 자료를 만들지 못했어요', 5000); return; }
  moving = true;
  try {
    // 지난번에 지우지 못한 체험용 보관 자료가 있으면 먼저 지움(남아 있으면 새 체험 자료를 쓰지 못함)
    await soon(getArchive().del(DEMO_YEAR));
    try { ls.setItem(KEY, JSON.stringify({ from, at: Date.now(), step: 0, nav: ls.getItem('ssam:nav'), tabs: ls.getItem('ssam:nav:tabs') })); } catch (e) { toast(FULL_MSG, 7000); return; }
    toast('체험용 자료를 여는 중이에요…', 8000);
    const r = await moveYear(DEMO_YEAR, snap);
    if (!r.ok) { try { ls.removeItem(KEY); } catch (e) {} toast(switchError(r.code), 7000); return; }
    location.reload();
  } finally { moving = false; }
}

/* ---------- 끝내기 ---------- */
/* 표시가 없어져 원래 학년도를 모르면: 보관함에서 가장 최근에 넣은 학년도 */
async function guessFrom() {
  try { const l = ((await soon(getArchive().list())) || []).filter(x => x.year !== DEMO_YEAR).sort((a, b) => b.savedAt - a.savedAt); return l.length ? l[0].year : null; } catch (e) { return null; }
}
export async function exitDemo() {
  const ls = safeLS(), d = inDemo();
  if (!d || !ls || moving) return;
  moving = true;
  try {
    closeSteps({ keep: true });
    const from = Number.isInteger(d.from) ? d.from : await guessFrom();
    if (!Number.isInteger(from)) { toast('원래 학년도를 찾지 못했어요. 설정 › 학년도의 목록에서 원래 학년도로 가 주세요', 8000); return; }
    if (getYears(ls).current !== from) {
      // 원래 자료가 보관함에 있는지 먼저 봄(없으면 옮기지 않음 — 빈 자료로 바뀌지 않게)
      let has = null;
      try { has = await soon(getArchive().get(from), 8000); } catch (e) {}
      if (!has) { toast(`보관함에서 ${from}학년도 자료를 찾지 못했어요. 체험은 그대로예요`, 8000); return; }
      toast('원래 자료로 돌아가는 중이에요…', 8000);
      const r = await moveYear(from);
      if (!r.ok) { toast(switchError(r.code), 7000); return; }
    }
    await soon(getArchive().del(DEMO_YEAR)); // 못 지워도 학년도 목록·백업에는 보이지 않고, 다음 체험 때 지움
    // 저장은 멈춰 있으므로(옮기기) 저장소에 바로 씀: 체험 표시 지우기, 메뉴마다 마지막 탭은 들어오기 전대로
    try {
      ls.removeItem(KEY);
      for (const [k, v] of [['ssam:nav', d.nav], ['ssam:nav:tabs', d.tabs]]) { if (typeof v === 'string') ls.setItem(k, v); else if (v === null) ls.removeItem(k); }
    } catch (e) {}
    try { sessionStorage.setItem(BACK, '1'); } catch (e) {}
    location.reload();
  } finally { moving = false; }
}

/* ---------- 띠 ---------- */
function drawBand() {
  let el = $('tourBand');
  if (!inDemo()) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'tourBand'; el.className = 'tour-band';
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', '체험 중');
    document.body.prepend(el);
  }
  el.innerHTML = `<p class="tour-band-t"><span class="tour-band-ic" aria-hidden="true">▶</span><b>체험 중</b><span class="tour-band-s"> · 지어낸 자료예요. 선생님 자료는 보관함에 그대로 있어요.</span></p>
    <span class="tour-band-b"><button type="button" class="btn" data-tour="steps">안내 보기</button><button type="button" class="btn primary" data-tour="exit">체험 끝내기</button></span>`;
}

/* ---------- 안내 말풍선 ---------- */
let cur = -1, tok = 0, back = null; // cur: 보이는 단계(-1 = 닫힘), back: 닫을 때 초점을 돌려줄 곳
const shown = el => !!el && el.getClientRects().length > 0 && !el.closest('[hidden]');
const find = sel => { if (!sel) return null; try { return [...document.querySelectorAll(sel)].find(shown) || null; } catch (e) { return null; } };
function waitFor(sel, ms = 2500) {
  return new Promise(ok => {
    const t0 = Date.now();
    const look = () => { const el = find(sel); if (el || Date.now() - t0 > ms) ok(el); else setTimeout(look, 60); };
    look();
  });
}
function popHTML(i, s, n) {
  const last = i === n - 1;
  return `<p class="tour-pop-n"><span class="sr-only">안내 </span>${i + 1} / ${n}</p>
    <h3 class="tour-pop-h" id="tourPopT">${esc(s.title)}</h3>
    <p class="tour-pop-d" id="tourPopD">${esc(s.text)}</p>
    <div class="tour-pop-b">${last
      ? '<button type="button" class="btn" data-tour="skip">더 둘러보기</button><button type="button" class="btn primary" data-tour="exit">체험 끝내기</button>'
      : '<button type="button" class="btn" data-tour="skip">건너뛰기</button><button type="button" class="btn primary" data-tour="next">다음</button>'}</div>`;
}
export async function showStep(i) {
  const steps = tourSteps();
  if (!inDemo() || !(i >= 0 && i < steps.length)) { closeSteps(); return; }
  const my = ++tok, s = steps[i];
  if (cur < 0 && document.activeElement && document.activeElement !== document.body) back = document.activeElement;
  cur = i;
  writeMark({ step: i });
  if (SS().closeSheet && $('sheetRoot') && $('sheetRoot').childElementCount) SS().closeSheet();
  try { await s.go(); } catch (e) {}
  if (my !== tok) return;
  const el = s.target ? await waitFor(s.target) : null;
  if (my !== tok) return;
  let pop = $('tourPop'), ring = $('tourRing');
  if (!ring) { ring = document.createElement('div'); ring.id = 'tourRing'; ring.className = 'tour-ring'; ring.setAttribute('aria-hidden', 'true'); document.body.append(ring); }
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'tourPop'; pop.className = 'tour-pop';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'false');
    pop.setAttribute('aria-labelledby', 'tourPopT'); pop.setAttribute('aria-describedby', 'tourPopD');
    document.body.append(pop);
  }
  pop.innerHTML = popHTML(i, s, steps.length);
  if (el) el.scrollIntoView({ block: narrow() ? 'start' : 'center', inline: 'nearest' });
  place();
  const f = pop.querySelector('[data-tour="next"]') || pop.querySelector('[data-tour="exit"]');
  if (f) f.focus({ preventScroll: true });
}
export function closeSteps({ keep = false } = {}) {
  tok++;
  const was = cur >= 0;
  cur = -1;
  for (const id of ['tourPop', 'tourRing']) { const el = $(id); if (el) el.remove(); }
  if (!keep) writeMark({ step: null });
  if (!was) return;
  // 초점은 열기 전 자리로(없어졌으면 띠의 [안내 보기])
  const to = back && back.isConnected && shown(back) ? back : document.querySelector('#tourBand [data-tour="steps"]');
  back = null;
  if (to && !keep) to.focus({ preventScroll: true });
}
/* 테두리·말풍선 자리: 넓은 화면은 가리킨 곳 아래(모자라면 위), 휴대폰은 아래 탭 위에 붙임(가리킨 곳은 위로 스크롤) */
function place() {
  const pop = $('tourPop'), ring = $('tourRing');
  if (!pop || cur < 0) return;
  const s = tourSteps()[cur], el = s ? find(s.target) : null, vw = window.innerWidth, vh = window.innerHeight, m = 12;
  const r = el ? el.getBoundingClientRect() : null;
  const dock = narrow() || !r;
  pop.classList.toggle('dock', dock);
  if (dock) { pop.style.top = ''; pop.style.left = ''; }
  else {
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let top = r.bottom + 14;
    if (top + ph > vh - m) top = r.top - ph - 14;
    if (top < m) top = Math.max(m, vh - ph - m);
    const left = Math.min(Math.max(m, r.left), Math.max(m, vw - pw - m));
    pop.style.top = `${Math.round(top)}px`; pop.style.left = `${Math.round(left)}px`;
  }
  if (!ring) return;
  // 테두리는 보이는 부분만: 본문(#app) 안의 곳은 본문 칸 안(머리 줄·아래 탭에 걸치지 않게), 휴대폰은 아래에 붙은 말풍선 위까지
  const app = document.getElementById('app'), a = app && el && app.contains(el) ? app.getBoundingClientRect() : { top: 0, left: 0, bottom: vh, right: vw };
  const floor = Math.min(a.bottom, vh) - 4, cap = dock ? Math.min(floor, pop.getBoundingClientRect().top - 6) : floor;
  const box = r && { top: Math.max(r.top - 6, a.top + 4), left: Math.max(r.left - 6, a.left + 4), bottom: Math.min(r.bottom + 6, cap), right: Math.min(r.right + 6, Math.min(a.right, vw) - 4) };
  const ok = !!box && box.bottom - box.top > 8 && box.right - box.left > 8;
  ring.hidden = !ok;
  if (ok) Object.assign(ring.style, { top: `${box.top}px`, left: `${box.left}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
}
let raf = 0;
const later = () => { if (cur < 0 || raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };

/* ---------- 누르기·키 ---------- */
document.addEventListener('click', e => {
  if (cur >= 0) setTimeout(later, 60); // 누른 뒤 화면이 바뀌었을 수 있음(보기·탭 바꾸기): 테두리·말풍선 자리를 다시
  const b = e.target.closest && e.target.closest('[data-tour]');
  if (!b) return;
  const a = b.dataset.tour;
  if (a === 'start') startTour();
  else if (a === 'steps') showStep(0);
  else if (a === 'next') showStep(cur + 1);
  else if (a === 'skip') closeSteps();
  else if (a === 'exit') exitDemo();
});
// Esc: 말풍선을 닫음(확인 창이 떠 있거나 채팅 창 안에서 누르면 그쪽이 먼저)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || cur < 0) return;
  const sheet = $('sheetRoot'), chat = document.querySelector('.chat-panel:not([hidden])');
  if ((sheet && sheet.childElementCount) || (chat && chat.contains(document.activeElement))) return;
  closeSteps();
}, true);
window.addEventListener('resize', later);
document.addEventListener('scroll', later, true);
document.addEventListener('menu:go', () => setTimeout(later, 0)); // 다른 메뉴로 가면 가리킬 곳이 숨을 수 있음

function init() {
  drawBand();
  const d = inDemo();
  if (d && Number.isInteger(d.step)) setTimeout(() => showStep(d.step), 0); // 다시 열어도 하던 단계부터
  let backNow = false;
  try { backNow = !!sessionStorage.getItem(BACK); if (backNow) sessionStorage.removeItem(BACK); } catch (e) {}
  if (backNow) setTimeout(() => toast('원래 자료로 돌아왔어요', 5000), 0);
}
// 창 틀(shell.js)이 처음 화면(오늘)을 그린 뒤에: 그 파일처럼 늘 DOMContentLoaded를 기다림(index.html에서 shell.js 뒤에 부름)
if (document.readyState === 'complete') init(); else document.addEventListener('DOMContentLoaded', init);
