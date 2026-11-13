/* 창 틀: 왼쪽 세로 메뉴 + 상단 헤더(메뉴 제목·가로 메뉴). 메뉴마다 <section data-menu>를 보이고 숨김.
   평가 메뉴의 가로 메뉴는 기존 앱의 화면(mode)과 같음: window.SSAM.setMode로 바꿈.
   휴대폰(≤760px, shell.css): 세로 메뉴 대신 아래 탭 5칸(오늘·평가·학급·품의·더보기 — 더보기는 시트: 계획·연수·문서·소통·설정, 학년도·사용 중인 AI),
   가로 메뉴는 한 줄 가로 스크롤 칩. 앱을 켜면(열기·새로 고침) 늘 「오늘」 (스펙 2026-11-11 §1).
   평가 탭은 두 묶음(스펙 2026-11-14 §4): 「채점」 단원평가·활동지·평가지 채점 | 「생활기록부」 교과 평어·창체·행특·기재 점검 — 탭 줄 안에 묶음 이름(작은 글)과 구분선.
   메뉴 id `etc`의 이름은 「문서·소통」(전에는 「기타」) */
import { icon } from './icons.js';
import { renderPlaceholder } from '../menus/placeholder.js';
import { ensureYears, isDemoYear } from './years.js';
import { freeze, onFail, FULL_MSG, flushAll, usage } from './store.js';
import { TABS_KEY, parseTabs, pickTab } from './nav-tabs.js';
import './file-drop.js'; // 파일 고르기 단추(data-drop-pick)가 있는 칸에 끌어 놓기 — window에 먼저 걸어 둠(쌤 버튼의 막기보다 앞)

export const MENUS = [
  { id: 'home', label: '오늘', tabs: [] },
  { id: 'evaluate', label: '평가', tabs: [['unit', '단원평가', '채점'], ['activity', '활동지', '채점'], ['gr', '평가지 채점', '채점'],
    ['pyeongeo', '교과 평어', '생활기록부'], ['cc', '창의적 체험활동', '생활기록부'], ['hk', '행동특성', '생활기록부'], ['check', '기재 점검', '생활기록부']] },
  { id: 'training', label: '연수', tabs: [['mine', '내 필수연수'], ['board', '연수 현황판']] },
  { id: 'plan', label: '계획', tabs: [['year', '연간계획'], ['event', '행사계획'], ['class', '학급운영계획'], ['report', '결과 보고']] },
  { id: 'class', label: '학급', tabs: [['today', '오늘 수업'], ['progress', '진도표·시수'], ['weekly', '주간학습안내'], ['camp', '기초학력']] },
  { id: 'purchase', label: '품의', tabs: [['new', '새 품의'], ['templates', '저장한 템플릿'], ['recent', '최근 작성']] },
  { id: 'etc', label: '문서·소통', tabs: [['message', '쪽지 작성'], ['letter', '가정통신문'], ['gongmun', '공문 처리'], ['handover', '인수인계서'], ['multi', '다면평가']] },
  { id: 'settings', label: '설정', tabs: [['roster', '학급 명단'], ['ai', 'AI'], ['screen', '화면'], ['school', '학교 정보'], ['years', '학년도'], ['purchase', '품의 기준']] }
].map(m => ({ ...m, icon: m.id, tabs: m.tabs.map(([id, label, group]) => (group ? { id, label, group } : { id, label })) }));

const NAV_KEY = 'ssam:nav'; // 마지막 메뉴·탭(채팅 도우미가 「보고 있는 화면」으로 읽음). 켤 때는 쓰지 않음 — 늘 「오늘」
/* 휴대폰 아래 탭: 이 넷 + 더보기(MORE — 아래 탭에 없는 메뉴, 시트에 이 차례로) */
const BOTTOM = ['home', 'evaluate', 'class', 'purchase'], MORE = ['plan', 'training', 'etc', 'settings'];
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SSAM = () => window.SSAM || {};
const hooks = {};
const EVAL_ACTS = ['new', 'plans', 'pronoun'];
let cur = null;

/* 메뉴에 들어올 때 부를 함수 등록: fn(tab, section) */
export function onEnter(menu, fn) {
  (hooks[menu] || (hooks[menu] = [])).push(fn);
  if (cur && cur.menu === menu) fn(cur.tab, section(menu));
}
const section = menu => document.querySelector(`section[data-menu="${menu}"]`);
const find = id => MENUS.find(m => m.id === id);

/* 메뉴마다 마지막으로 연 탭 (nav-tabs.js) */
function readTabs() {
  try { return parseTabs(localStorage.getItem(TABS_KEY)); } catch (e) { return {}; }
}
function keepTab(menu, tab) {
  try { localStorage.setItem(TABS_KEY, JSON.stringify({ ...readTabs(), [menu]: tab })); } catch (e) {}
}

/* 다른 메뉴에서 AI가 일하는 중이면 그 메뉴 버튼에 작은 점(지금 보는 메뉴는 화면에 진행이 보여서 뺌). 일은 메뉴를 옮겨도 뒤에서 이어짐.
   AI 부르기(평가 메뉴의 generate — 새 메뉴의 core/ai.js도 그것을 부름)가 부를 때마다 window.SSAM_WORK(업무)로 알리고, 끝나면 돌려받은 함수를 부름.
   업무로 메뉴를 앎(채점·평어는 평가 등). 모르는 업무는 부를 때 보던 메뉴, 문서·소통 › 인수인계서에서 부른 계획 AI는 문서·소통,
   학급 › 기초학력 캠프에서 부른 계획·평어 AI(일정·보고서·양식 읽기·관찰 글)는 학급, 문서·소통 › 다면평가에서 부른 계획·평어 AI(기준 양식·근거자료 읽기·줄글 나누기)는 문서·소통.
   work 'none'(쌤 채팅 도우미 — 메뉴 일이 아니어서 보던 메뉴에 점이 잘못 뜨지 않게)은 점을 띄우지 않음 */
const TASK_MENU = { grade: 'evaluate', writing: 'evaluate', letter: 'etc', message: 'etc', reply: 'etc', gongmun: 'etc', purchase: 'purchase', plan: 'plan', report: 'plan' };
const working = {};
function drawWork() {
  const busy = id => !!working[id] && !(cur && cur.menu === id);
  document.querySelectorAll('.side-btn[data-menu-go], .bt-btn[data-menu-go]').forEach(b => {
    const on = busy(b.dataset.menuGo);
    b.classList.toggle('working', on);
    if (on) b.title = `${b.textContent.trim()}에서 AI가 일하는 중이에요`; else b.removeAttribute('title');
  });
  // 휴대폰 더보기: 그 안 메뉴 가운데 하나라도 일하는 중이면 점
  const more = $('#moreBtn');
  if (more) {
    const on = MORE.some(busy);
    more.classList.toggle('working', on);
    if (on) more.title = '더보기 안 메뉴에서 AI가 일하는 중이에요'; else more.removeAttribute('title');
  }
}
if (typeof window !== 'undefined') window.SSAM_WORK = (task, work) => {
  if (work === 'none') return () => {};
  const here = cur ? cur.menu : 'evaluate';
  const m = task === 'plan' && here === 'etc' && cur.tab === 'handover' ? 'etc'
    : (task === 'plan' || task === 'writing') && here === 'etc' && cur.tab === 'multi' ? 'etc'
    : (task === 'plan' || task === 'writing') && here === 'class' && cur.tab === 'camp' ? 'class' : TASK_MENU[task] || here;
  working[m] = (working[m] || 0) + 1; drawWork();
  let done = false;
  return () => { if (done) return; done = true; if (!--working[m]) delete working[m]; drawWork(); };
};

/* 헤더 오른쪽(⋮ 왼쪽)에 메뉴별 버튼을 둠. 메뉴·탭이 바뀔 때마다 비워짐 */
export function setActions(html) {
  const el = $('#topExtra');
  if (el) el.innerHTML = html || '';
  return el;
}

const LEGACY = ['pyeongeo', 'cc', 'hk', 'gr'];
/* 탭을 정하지 않으면(세로 메뉴를 누름 등) 그 메뉴에서 마지막으로 연 탭. 평가의 기존 앱 화면은 기존 앱의 mode를 따름 */
export function go(menuId, tabId) {
  const m = find(menuId) || MENUS[0];
  setActions('');
  const tab = pickTab(m, tabId, readTabs(), m.id === 'evaluate' ? { legacy: LEGACY, mode: SSAM().getMode && SSAM().getMode() } : {});
  // 다른 메뉴로 가면 본문을 맨 위부터 (본문 칸 하나를 메뉴가 같이 써서, 아래로 내린 채 다른 메뉴가 열리지 않게)
  if (cur && cur.menu !== m.id && $('#app')) $('#app').scrollTop = 0;
  cur = { menu: m.id, tab };
  document.querySelectorAll('section[data-menu]').forEach(s => { s.hidden = s.dataset.menu !== m.id; });
  document.querySelectorAll('[data-menu-go]').forEach(b => {
    if (b.dataset.menuGo === m.id) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  // 휴대폰: 지금 메뉴가 더보기 안 것이면 더보기 칸이 켜짐
  const more = $('#moreBtn');
  if (more) { if (BOTTOM.includes(m.id)) more.removeAttribute('aria-current'); else more.setAttribute('aria-current', 'page'); }
  drawWork();
  $('#menuTitle').textContent = m.label;
  drawTabs(m);
  if (m.id === 'evaluate') {
    // 기존 앱의 화면(mode)이 아닌 탭(단원평가)은 새 모듈이 그림: 기존 화면을 숨김
    const ev = section('evaluate');
    if (ev) ev.classList.toggle('ev-new', !LEGACY.includes(tab));
    if (LEGACY.includes(tab) && SSAM().getMode && SSAM().getMode() !== tab) SSAM().setMode(tab);
  }
  try { localStorage.setItem(NAV_KEY, JSON.stringify(cur)); } catch (e) {}
  if (tab) keepTab(m.id, tab);
  drawAi();
  document.dispatchEvent(new CustomEvent('menu:go', { detail: { menu: m.id, tab } }));
  const fns = hooks[m.id];
  if (fns && fns.length) {
    const ph = section(m.id) && section(m.id).querySelector('.ph');
    if (ph) ph.remove();
    fns.forEach(fn => fn(tab, section(m.id)));
  } else if (m.id !== 'evaluate') renderPlaceholder(section(m.id), m, tab);
}

function drawTabs(m) {
  const el = $('#menuTabs');
  el.setAttribute('aria-label', `${m.label} 메뉴`);
  el.hidden = !m.tabs.length; // 오늘은 탭 없음
  // 묶음이 있는 메뉴(평가): 묶음이 바뀌는 곳에 구분선, 묶음 앞에 이름(작은 글 — 누르는 칸이 아님)
  el.innerHTML = m.tabs.map((t, i) => {
    const prev = m.tabs[i - 1], head = t.group && (!prev || prev.group !== t.group)
      ? `${prev ? '<span class="tab-sep" aria-hidden="true"></span>' : ''}<span class="tab-grp">${esc(t.group)}</span>` : '';
    return `${head}<button type="button" data-tab="${t.id}"${t.id === cur.tab ? ' aria-current="page"' : ''}>${esc(t.label)}</button>`;
  }).join('');
  el.classList.toggle('grouped', m.tabs.some(t => t.group));
  // 휴대폰의 가로 스크롤 칩: 지금 탭이 보이게 (넘칠 때만 — 페이지는 움직이지 않음)
  const b = el.querySelector('[aria-current="page"]');
  if (b && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2);
}

function drawSide() {
  const btn = m => `<button type="button" class="side-btn" data-menu-go="${m.id}">${icon(m.icon)}<span>${esc(m.label)}</span></button>`;
  $('#sideMenus').innerHTML = MENUS.filter(m => m.id !== 'settings').map(btn).join('');
  $('#sideSettings').innerHTML = btn(find('settings'));
}

/* 휴대폰 아래 탭 5칸: 오늘·평가·학급·품의(바로 감) + 더보기(시트) */
function drawBottom() {
  const el = $('#bottomTabs');
  if (!el) return;
  el.innerHTML = BOTTOM.map(find).map(m => `<button type="button" class="bt-btn" data-menu-go="${m.id}">${icon(m.icon, 22)}<span>${esc(m.label)}</span></button>`).join('')
    + `<button type="button" class="bt-btn" id="moreBtn" aria-haspopup="dialog" aria-expanded="false">${icon('more', 22)}<span>더보기</span></button>`;
}
/* 「2026학년도」, 3분 둘러보기 중(체험용 학년도)이면 「체험용 자료」 */
const yearLabel = y => (isDemoYear(y) ? '체험용 자료' : `${y}학년도`);
const yearText = () => { let ls = null; try { ls = window.localStorage; } catch (e) {} return yearLabel(ensureYears(ls).current); };
const aiText = () => (SSAM().ai && SSAM().ai.engineReady && SSAM().ai.engineReady() ? SSAM().ai.engineName() : '') || 'AI를 정해 주세요';
/* 더보기 시트: 아래 탭에 없는 메뉴(계획·연수·문서·소통·설정) + 학년도·사용 중인 AI(누르면 설정 그 탭) */
function openMore() {
  if (!SSAM().openSheet) return;
  const item = m => `<button type="button" class="more-go" data-more-go="${m.id}"${cur && cur.menu === m.id ? ' aria-current="page"' : ''}>${icon(m.icon, 22)}<span>${esc(m.label)}</span></button>`;
  SSAM().openSheet(`<h3>더보기</h3>
    <nav class="more-grid" aria-label="다른 메뉴">${MORE.map(find).map(item).join('')}</nav>
    <div class="more-foot">
      <button type="button" class="more-info" data-more-go="settings" data-more-tab="years"><small>학년도</small><b>${esc(yearText())}</b></button>
      <button type="button" class="more-info" data-more-go="settings" data-more-tab="ai"><small>사용 중인 AI</small><b>${esc(aiText())}</b></button>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button></div>`, sh => {
    sh.classList.add('more-sheet');
    sh.setAttribute('aria-label', '더보기');
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-more-go]');
      if (!b) return;
      SSAM().closeSheet();
      go(b.dataset.moreGo, b.dataset.moreTab);
    });
  });
  const f = document.querySelector('#sheetRoot .more-sheet [aria-current="page"]') || document.querySelector('#sheetRoot .more-sheet .more-go');
  if (f) f.focus();
  syncMore();
}
/* 더보기 버튼의 펼침 표시: 시트가 닫히면(바깥 누르기·Esc·닫기·메뉴 고르기) 되돌리고, 시트 안에 초점이 있었으면 버튼으로 */
let moreOpen = false;
function syncMore() {
  const b = $('#moreBtn');
  const open = !!document.querySelector('#sheetRoot .more-sheet');
  if (b) b.setAttribute('aria-expanded', String(open));
  if (moreOpen && !open && b && (!document.activeElement || document.activeElement === document.body) && getComputedStyle(b).display !== 'none') b.focus();
  moreOpen = open;
}

/* 세로 메뉴 아래 「2026학년도」 (누르면 설정 › 학년도) */
function drawYear() {
  const el = $('#sideYear');
  if (!el) return;
  let ls = null;
  try { ls = window.localStorage; } catch (e) {}
  // 처음 연 날의 학년도를 저장해 둠 (저장소가 막혀 있으면 오늘이 든 학년도만 보임)
  el.innerHTML = `<small>학년도</small><b>${yearLabel(ensureYears(ls).current)}</b>`;
}

/* 세로 메뉴 아래 「사용 중인 AI」 */
function drawAi() {
  $('#sideAiName').textContent = aiText();
}

function init() {
  drawSide();
  drawBottom();
  drawYear();
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-menu-go]'); if (g) { go(g.dataset.menuGo); return; }
    if (e.target.closest('#moreBtn')) { openMore(); return; }
    const t = e.target.closest('#menuTabs [data-tab]'); if (t) { go(cur.menu, t.dataset.tab); return; }
    if (e.target.closest('#sideAi')) { go('settings', 'ai'); return; }
    if (e.target.closest('#sideYear')) { go('settings', 'years'); return; }
    // ⋮ 메뉴의 평가계획 일(새로 넣기·저장된 계획·대명사 줄이기)은 평가 화면에서 보이게 함
    const a = e.target.closest('#menu [data-act]');
    // 기존 앱이 먼저 바꾼 화면(mode)으로 감 — 마지막 탭(단원평가 등)으로 가면 평가계획 화면이 가려짐
    if (a && EVAL_ACTS.includes(a.dataset.act) && cur && cur.menu !== 'evaluate') go('evaluate', SSAM().getMode && SSAM().getMode());
  });
  // 기존 앱이 스스로 화면을 바꾸면(새 평가계획 넣기 등) 가로 메뉴도 맞춤
  if (SSAM().onModeChange) SSAM().onModeChange(mode => {
    if (!cur || cur.menu !== 'evaluate' || cur.tab === mode) return;
    if (!LEGACY.includes(cur.tab)) { go('evaluate', mode); return; }
    cur.tab = mode; drawTabs(find('evaluate'));
    try { localStorage.setItem(NAV_KEY, JSON.stringify(cur)); } catch (e) {}
    keepTab('evaluate', mode);
  });
  // 다른 탭에서 학년도를 옮기면 이 탭은 저장을 멈추고 다시 엶 (지난 학년도 자료를 새 학년도에 쓰지 않게)
  window.addEventListener('storage', e => {
    if (e.key !== 'ssam:years' && e.key !== null) return;
    freeze(); if (SSAM().freeze) SSAM().freeze(true);
    location.reload();
  });
  // 저장 공간이 70%를 넘으면 열 때 한 번 알림 (처음 뜨는 다른 알림에 덮이지 않게 조금 뒤에)
  setTimeout(() => {
    let r = 0;
    try { r = usage(window.localStorage).ratio; } catch (e) {}
    if (r >= 0.7 && SSAM().toast) SSAM().toast(`저장 공간이 ${Math.round(r * 100)}% 찼어요. 설정 › 학년도에서 백업 파일을 만든 뒤 쓰지 않는 자료를 지워 주세요.`, 9000);
  }, 1200);
  // 창을 닫거나 다른 창으로 가면 미뤄 둔 저장을 바로 씀
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
  // 저장 공간이 꽉 차 저장하지 못하면 알림 (20초에 한 번까지: 쓰는 동안 계속 뜨지 않게)
  let failAt = -1e9;
  onFail(() => {
    if (Date.now() - failAt < 20000) return;
    failAt = Date.now();
    if (SSAM().toast) SSAM().toast(FULL_MSG, 8000);
  });
  // 설정 시트를 닫으면 AI 이름을 다시 읽음
  const root = $('#sheetRoot');
  if (root) new MutationObserver(() => { drawAi(); syncMore(); }).observe(root, { childList: true });
  document.addEventListener('ssam:ai-changed', drawAi); // 시험용 업스테이지를 알게 됐을 때 등
  // 켜면 늘 「오늘」 (마지막 메뉴는 저장만 함, 메뉴마다 마지막 탭은 그 메뉴에 들어갈 때 씀)
  go('home');
}

// 메뉴 모듈들이 onEnter를 등록한 뒤에 처음 화면을 그림.
// 모듈은 문서를 다 읽은 뒤(readyState 'interactive') DOMContentLoaded 전에 실행되므로 늘 그 이벤트를 기다림
if (document.readyState === 'complete') init();
else document.addEventListener('DOMContentLoaded', init);
