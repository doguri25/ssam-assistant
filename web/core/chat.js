/* 「쌤」 채팅 창 (스펙 2026-11-06 D·E·F): 오른쪽 아래 「쌤」 버튼을 누르면 열리고(닫기·Esc), Windows 바탕화면 「쌤」 버튼을 눌러도 열림.
   글 → 할 일(chat-route.js routeText, 모르면 AI notes에 할 일 목록을 주고 고르게) → 분명하면 그 메뉴로 가서 칸을 채우고 바로 시작, 애매하면 후보 버튼.
   열면 맨 위 「오늘 할 일」(briefing.js, AI 없이). 「3번 …」은 평가 › 행동특성 그 번호 메모 끝에 한 줄([되돌리기]).
   파일은 버튼·창에 끌어 놓거나 📎로 — 받는 곳(inbox.js) 흐름 그대로. 기록은 최근 30개(ssam:chat, 학년도와 상관없음, 이름·전화번호는 가려서, 파일 이름은 남기지 않음).
   메뉴에 넘기는 글은 줄바꿈을 살리고 전화번호·전자 우편만 그 자리에서 가림(그 메뉴가 개인정보 규칙으로 다시 거름).
   메뉴가 돌려준 상태('started'·'no-ai'·'busy'·'empty' …)대로 말함 — 시작하지 않았으면 「쓰고 있어요」라고 하지 않음.
   저장·결재·상신은 언제나 선생님이 직접 */
import { get, set, remove } from './store.js';
import { go } from './shell.js';
import * as ai from './ai.js';
import { maskContacts } from './privacy.js';
import { listEvents, addDays, weekday } from './calendar.js';
import { routeText, payloadFor, isSure, aiRoutePrompt, normAiRoute, intentLabel, LANGS, langLabel, parseMemo, maskMemo, memoLine, appendMemo, nosText, safeText } from './chat-route.js';
import { briefing, EMPTY } from './briefing.js';

const KEY = 'chat', FLAG = 'chat:open', MAX = 30;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SS = () => window.SSAM || {};
const pad2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const DAY = '일월화수목금토';
const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let deps = { receive: () => {}, pickFiles: () => {} };
let panel = null, logEl = null, ta = null, brief = null; // brief: 오늘 할 일 줄(처음 세기 전에는 null)
const mem = new Map(); // 메시지 id → { text(보낸 글, 전화번호만 가림), shown(이 창에만 보일 글), undo(관찰 메모 되돌리기) } — 이 창에만(저장하지 않음)
let temp = []; // 저장하지 않는 메시지(기다리는 중·메모 보기)

/* ---------- 기록 ---------- */
const norm = m => m && typeof m === 'object' && typeof m.text === 'string' && (m.who === 'me' || m.who === 'bot');
export const history = () => { const v = get(KEY, []); return (Array.isArray(v) ? v : []).filter(norm).slice(-MAX); };
// 차례: 같은 때에 넣어도(시계가 멈춘 시험 등) 넣은 차례대로
let lastAt = 0;
const stamp = () => (lastAt = Math.max(Date.now(), lastAt + 1, ...[...history(), ...temp].map(m => (Number(m.at) || 0) + 1)));
function push(msg, { keep = true } = {}) {
  const m = { id: newId(), at: stamp(), ...msg };
  if (keep) set(KEY, [...history(), m].slice(-MAX)); else temp.push(m);
  draw();
  return m;
}
const say = (text, extra = {}, opts) => push({ who: 'bot', text, ...extra }, opts);
function drop(m) { temp = temp.filter(x => x !== m); draw(); }
export function clearHistory() { set(KEY, []); temp = []; mem.clear(); draw(); }

/* ---------- 창 ---------- */
export const isChatOpen = () => !!(panel && !panel.hidden);
const fab = () => document.getElementById('inboxFab');
function mount() {
  if (panel || !document.body) return;
  panel = Object.assign(document.createElement('section'), { id: 'chatPanel', className: 'chat-panel', hidden: true });
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '쌤비서 채팅');
  panel.innerHTML = `<header class="chat-head"><b>쌤비서</b><span class="chat-sub">할 일을 말해 주세요</span>
      <button class="btn text tiny" type="button" data-chat="clear">지우기</button>
      <button class="icon-btn chat-x" type="button" data-chat="close" aria-label="채팅 닫기" title="닫기(Esc)">×</button></header>
    <div class="chat-log" id="chatLog" aria-live="polite"></div>
    <form class="chat-in" id="chatForm" autocomplete="off">
      <button class="icon-btn chat-clip" type="button" data-chat="attach" aria-label="파일 넣기" title="파일 넣기(끌어 놓아도 돼요)">📎</button>
      <textarea class="field" id="chatText" rows="1" placeholder="할 일을 써 주세요" aria-label="쌤비서에게 할 말"></textarea>
      <button class="btn primary" type="submit" id="chatSend">보내기</button></form>
    <div class="chat-drop" aria-hidden="true">여기에 놓으면 쌤비서가 알아서 해요</div>`;
  document.body.append(panel);
  logEl = panel.querySelector('#chatLog');
  ta = panel.querySelector('#chatText');
  panel.querySelector('#chatForm').addEventListener('submit', e => { e.preventDefault(); sendBox(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendBox(); } });
  ta.addEventListener('input', grow);
  panel.addEventListener('click', onClick);
  // 창에 끌어 놓은 파일도 받는 곳(inbox.js)으로 — 자기에게 온 끌어 놓기만 받고 더 퍼뜨리지 않음(다른 메뉴의 놓기 칸과 겹치지 않게)
  for (const ev of ['dragenter', 'dragover']) panel.addEventListener(ev, e => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; panel.classList.add('drop'); });
  panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('drop'); });
  panel.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation(); panel.classList.remove('drop');
    takeFiles([...((e.dataTransfer && e.dataTransfer.files) || [])]);
  });
}
function grow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
export function openChat({ focus = true } = {}) {
  mount();
  if (!panel) return;
  const f = fab();
  panel.classList.toggle('nofab', !f || f.hidden);
  panel.hidden = false;
  if (f) f.setAttribute('aria-expanded', 'true');
  const top = document.getElementById('chatTop'); if (top) top.setAttribute('aria-expanded', 'true');
  refreshBrief();
  draw();
  if (focus) ta.focus();
}
export function closeChat() {
  if (!panel || panel.hidden) return;
  const inside = panel.contains(document.activeElement);
  panel.hidden = true;
  const f = fab();
  if (f) { f.setAttribute('aria-expanded', 'false'); if (inside && !f.hidden) f.focus(); }
  const top = document.getElementById('chatTop'); if (top) top.setAttribute('aria-expanded', 'false');
}
export function toggleChat() { if (isChatOpen()) closeChat(); else openChat(); }

/* ---------- 그리기 ---------- */
const dayText = d => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일(${DAY[weekday(d)]})`;
function briefHTML() {
  const t = today();
  return `<section class="chat-brief" aria-label="오늘 할 일"><h4>오늘 할 일 <small>${esc(dayText(t))}</small></h4>
    ${!brief ? '<p class="muted cb-none"><span class="spin"></span>세는 중…</p>' : brief.length ? `<ul>${brief.map((l, i) => `<li><button type="button" class="cb-line" data-brief="${i}">${l.when ? `<span class="cb-when${l.hot ? ' hot' : ''}">${esc(l.when)}</span>` : ''}<span class="cb-t">${esc(l.text)}</span></button></li>`).join('')}</ul>`
    : `<p class="muted cb-none">${EMPTY}</p>`}</section>`;
}
const HELLO = '무엇을 도와드릴까요? 예) 「알코올램프 10개 5,000원 품의」 「3번 토론에서 근거 들어 반론 잘함」 「가정통신문 베트남어로」 「주간학습안내」';
function msgHTML(m) {
  const extra = mem.get(m.id) || {};
  const chips = (m.chips || []).map((c, i) => `<button type="button" class="chip chat-chip" data-chip="${i}" data-msg="${esc(m.id)}">${esc(c.label)}</button>`).join('');
  const links = (m.links || []).map((l, i) => `<button type="button" class="btn text tiny" data-link="${i}" data-msg="${esc(m.id)}">${esc(l.label)}</button>`).join('');
  const undo = extra.undo ? `<button type="button" class="btn text tiny" data-undo="${esc(m.id)}">되돌리기</button>` : '';
  return `<div class="chat-msg ${m.who}${m.wait ? ' wait' : ''}" data-id="${esc(m.id)}"><div class="chat-bub">${m.wait ? '<span class="spin"></span>' : ''}${esc(extra.shown || m.text).replace(/\n/g, '<br>')}</div>
    ${chips || links || undo ? `<div class="chat-acts">${chips}${links}${undo}</div>` : ''}</div>`;
}
function draw() {
  if (!logEl || !panel || panel.hidden) return;
  const all = [...history(), ...temp].sort((a, b) => a.at - b.at);
  logEl.innerHTML = briefHTML() + (all.length ? '' : `<div class="chat-msg bot"><div class="chat-bub">${esc(HELLO)}</div></div>`) + all.map(msgHTML).join('');
  logEl.scrollTop = logEl.scrollHeight;
}
const findMsg = id => [...history(), ...temp].find(m => m.id === id);

/* ---------- 오늘 할 일 ---------- */
async function gather() {
  const t = today(), mods = await Promise.all(['../menus/etc/gongmun-model.js', '../menus/plan/event-model.js', '../menus/evaluate/unit/unit-model.js', '../menus/evaluate/activity/activity-model.js']
    .map(p => import(p).catch(() => null)));
  const [gm, evm, um, am] = mods;
  const units = um ? um.listTests().slice(0, 15).map(s => { const x = um.getTest(s.id); return x && { id: x.id, title: s.title, date: (x.meta && x.meta.date) || s.date, done: !!x.done, sample: !!(x.meta && x.meta.sample), students: x.students || [] }; }).filter(Boolean) : [];
  const activities = am ? am.listActivities().slice(0, 15).map(s => { const x = am.getActivity(s.id); return x && { id: x.id, title: s.title || (x.meta && x.meta.title), date: (x.meta && x.meta.date) || s.date, done: !!x.done, sample: !!(x.meta && x.meta.sample), students: x.students || [] }; }).filter(Boolean) : [];
  const ids = get('grs', []);
  const grs = (Array.isArray(ids) ? ids : []).slice(0, 3).map(id => { const b = get('gr:' + id, null); return b && typeof b === 'object' ? { id, title: b.title, students: Array.isArray(b.students) ? b.students : [] } : null; }).filter(Boolean);
  // 금요일: 다음 주 주간학습안내를 이미 쓰기 시작했는지(글이 있는 칸)
  const w = get('class:weekly:' + addDays(t, 3), null), filled = v => (typeof v === 'string' ? !!v.trim() : v && typeof v === 'object' ? Object.values(v).some(filled) : false);
  return { today: t, docs: gm ? gm.listDocs() : [], events: listEvents(), plans: evm ? evm.listEventPlans() : [], units, activities, grs, weekly: { started: !!(w && (filled(w.notes) || filled(w.cells))) } };
}
let briefTok = 0;
async function refreshBrief() {
  const tok = ++briefTok;
  let lines = [];
  try { lines = briefing(await gather()); } catch (e) { lines = []; }
  if (tok !== briefTok) return;
  brief = lines;
  draw();
}

/* ---------- 누르기 ---------- */
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !panel.contains(b)) return;
  if (b.dataset.chat === 'close') { closeChat(); return; }
  if (b.dataset.chat === 'clear') { clearHistory(); ta.focus(); return; }
  if (b.dataset.chat === 'attach') { deps.pickFiles(); return; }
  if (b.dataset.brief != null) { const l = (brief || [])[+b.dataset.brief]; if (l) { await goRoute(l.route); afterGo(); } return; }
  if (b.dataset.chip != null) {
    const m = findMsg(b.dataset.msg), c = m && (m.chips || [])[+b.dataset.chip];
    if (!c) return;
    const src = (mem.get(m.src) || {}).text || ((findMsg(m.src) || {}).text) || '';
    const p = c.nav ? {} : payloadFor(c.intent, src); // 「잘 모르겠어요」 후보는 그 메뉴로만
    if (c.lang) p.lang = c.lang;
    push({ who: 'me', text: c.label });
    await run(c.intent, p);
    return;
  }
  if (b.dataset.link != null) { const m = findMsg(b.dataset.msg), l = m && (m.links || [])[+b.dataset.link]; if (l) { await goRoute(l.route); afterGo(); } return; }
  if (b.dataset.undo) {
    const x = mem.get(b.dataset.undo), hk = SS().hk;
    if (!x || !x.undo || !hk) return;
    const list = x.undo; delete x.undo;
    const back = await hk.undoMemo(list);
    const kept = list.map(d => d.no).filter(n => !back.includes(n));
    say([back.length ? `${nosText(back)} 메모를 되돌렸어요.` : '', kept.length ? `${nosText(kept)} 메모는 그새 고쳐서 그대로 두었어요.` : ''].filter(Boolean).join(' '));
  }
}
/* 좁은 화면에서는 메뉴로 간 뒤 채팅을 닫아 그 화면이 보이게 */
function afterGo() { if (window.innerWidth < 720) closeChat(); }

async function goRoute(r) {
  if (!r) return;
  if (r.to === 'gongmun') go('etc', 'gongmun');
  else if (r.to === 'event') {
    go('plan', 'event');
    const b = r.id && document.querySelector(`section[data-menu="plan"] [data-ev="${CSS.escape(r.id)}"]`);
    if (b) b.click();
  }
  else if (r.to === 'year') go('plan', 'year');
  else if (r.to === 'today') go('class', 'today');
  else if (r.to === 'weekly') go('class', 'weekly');
  else if (r.to === 'gr') go('evaluate', 'gr');
  else if (r.to === 'hk') { go('evaluate', 'hk'); if (r.no && SS().hk) SS().hk.select(r.no); }
  else if (r.to === 'unit') { go('evaluate', 'unit'); if (r.id) { try { (await import('../menus/evaluate/unit/unit.js')).openTest(r.id, r.step); } catch (e) {} } }
  else if (r.to === 'activity') { go('evaluate', 'activity'); if (r.id) { try { (await import('../menus/evaluate/activity/activity.js')).openActivity(r.id); } catch (e) {} } }
}

/* ---------- 보내기 ---------- */
function sendBox() {
  const text = ta.value.trim();
  if (!text) return;
  ta.value = ''; grow();
  send(text);
}
function takeFiles(files) {
  if (!files.length) return;
  // 파일 이름(「김민수_상담일지.hwp」처럼 학생 이름이 들 수 있음)은 기록에 남기지 않고 이 창에서만 보임
  const m = say(`파일 ${files.length}개를 받았어요. 확인 카드를 봐 주세요.`);
  mem.set(m.id, { shown: `파일 ${files.length}개를 받았어요(${files.slice(0, 3).map(f => `「${f.name}」`).join(', ')}${files.length > 3 ? ' …' : ''}). 확인 카드를 봐 주세요.` });
  draw();
  deps.receive(files);
}
/* 다른 화면·시험이 부름: 글 하나 보내기 */
export async function send(text) {
  const raw = String(text || '').trim();
  if (!raw) return;
  mount();
  // 메뉴에 넘길 글: 전화번호·전자 우편만 그 자리에서 가림(줄을 통째로 빼면 같은 줄의 내용까지 없어짐), 줄바꿈은 그대로
  const said = maskContacts(raw);
  const r = routeText(said), pm = parseMemo(raw);
  // 기록에는 이름을 가린 글: 「3번 …」(학생 이야기)은 관찰 메모에 저장하는 모양, 그 밖은 AI로 보내는 글과 같게(명단 줄 빼기·전화번호·이름 가리기). 너무 긴 글은 줄여서
  const shown = (pm ? `${nosText(pm.nos)} ${maskMemo(pm.body).text}` : safeText(raw)) || '(이름·전화번호만 있는 글)';
  const me = push({ who: 'me', text: shown.length > 1000 ? shown.slice(0, 1000) + '…' : shown });
  mem.set(me.id, { text: said });
  if (isSure(r)) { await run(r.intent, r.payload); return; }
  let cands = r.candidates.slice();
  // 규칙으로 모르면 AI(notes)에 할 일 목록을 주고 고르게(개인정보 줄은 빼고 이름은 가려서)
  if (ai.ready()) {
    const wait = say('무엇을 할지 알아보는 중이에요…', { wait: true }, { keep: false });
    let v = null;
    try {
      // 명단 줄은 빼고(stripPersonal) 전화번호·이름처럼 보이는 말은 가려서(safeText) 보냄
      v = normAiRoute(await ai.generateJSON(aiRoutePrompt(safeText(raw)), { task: 'notes', valid: o => !!o && typeof o === 'object' && !Array.isArray(o) }));
    } catch (e) { v = null; }
    drop(wait);
    if (v && v.intent) { const p = payloadFor(v.intent, said); if (v.intent === 'translate' && v.lang) p.lang = v.lang; await run(v.intent, p); return; }
    if (v) cands = [...new Set([...v.candidates, ...cands])];
  }
  cands = cands.slice(0, 3);
  if (cands.length) say('어느 것을 할까요?', { chips: cands.map(c => ({ intent: c, label: intentLabel(c) })), src: me.id });
  else say(`잘 모르겠어요. 아래에서 골라 주세요.${ai.ready() ? '' : ' AI 키를 넣으면 더 잘 알아들어요.'}`,
    { chips: ['briefing', 'purchase', 'message', 'letter'].map(c => ({ intent: c, label: intentLabel(c), nav: true })), src: me.id });
}

/* 다른 영역이 주는 들어가는 곳(있을 때만) */
async function optional(path, name) {
  try { const m = await import(path); return typeof m[name] === 'function' ? m[name] : null; } catch (e) { return null; }
}
const NAV = {
  year: ['plan', 'year', '계획 › 연간계획으로 왔어요.'], event: ['plan', 'event', '계획 › 행사계획으로 왔어요.'], classplan: ['plan', 'class', '계획 › 학급운영계획으로 왔어요.'],
  unit: ['evaluate', 'unit', '평가 › 단원평가로 왔어요. 채점할 평가를 골라 주세요.'], activity: ['evaluate', 'activity', '평가 › 활동지로 왔어요.'],
  gr: ['evaluate', 'gr', '평가 › 평가지 채점으로 왔어요. 수행평가 평가지를 넣어 주세요.'], pyeongeo: ['evaluate', 'pyeongeo', '평가 › 교과 평어로 왔어요.'],
  hk: ['evaluate', 'hk', '평가 › 행동특성으로 왔어요. 「3번 …」처럼 쓰면 메모에 바로 넣어요.'], cc: ['evaluate', 'cc', '평가 › 창의적 체험활동으로 왔어요.'],
  weekly: ['class', 'weekly', '학급 › 주간학습안내로 왔어요.'], today: ['class', 'today', '학급 › 오늘 수업으로 왔어요.'], progress: ['class', 'progress', '학급 › 진도표·시수로 왔어요.'],
  aikey: ['settings', 'ai', '설정 › AI로 왔어요. 키를 넣어 주세요.']
};
const NO_AI = 'AI가 준비되지 않아 시작하지 못했어요. 설정 › AI에서 키를 넣거나 시험용 AI를 써 주세요.';
/* 메뉴가 돌려준 상태 → 할 말(started: 시작함, no-ai, busy: 이미 하는 중, empty: 넣을 것이 없음). 모르는 상태는 error */
const tell = (st, words) => say(words[st] || words.error || '하지 못했어요. 그 화면에서 다시 해 주세요.');
/* 할 일 하기: 분명하면 그 메뉴로 가서 칸을 채우고 바로 시작(저장·결재·상신은 선생님이 직접) */
async function run(intent, p = {}) {
  if (NAV[intent]) { const [m, t, msg] = NAV[intent]; go(m, t); say(msg); afterGo(); return; }
  if (intent === 'purchase') {
    if (!p.text) { go('purchase', 'new'); say('품의 › 새 품의로 왔어요. 사려는 것을 적어 주세요. 예) 알코올램프 10개 5,000원'); afterGo(); return; }
    (await import('../menus/purchase/purchase.js')).putPurchaseText(p.text);
    say(`품의 넣기 칸에 넣고 초안을 만들어요.${ai.ready() ? '' : ' AI 키가 없으면 품목만 넣어요.'} 에듀파인에는 확인한 뒤 직접 올려 주세요.`);
    afterGo(); return;
  }
  if (intent === 'message') {
    if (!p.text) { go('etc', 'message'); say('기타 › 쪽지 작성으로 왔어요. 공문·계획 파일을 넣거나 내용을 붙여 넣어 주세요.'); afterGo(); return; }
    const st = await (await import('../menus/etc/message.js')).putMessageFiles([], { text: p.text }).catch(() => 'error');
    tell(st, { started: '쪽지 작성에 넣고 쪽지를 쓰고 있어요. 다 되면 칸과 본문을 확인해 주세요. 보내기는 직접 해 주세요.',
      'no-ai': `쪽지 작성에 글을 넣었어요. ${NO_AI}`, busy: '이미 쪽지를 쓰는 중이에요. 다 되면 다시 말해 주세요.',
      empty: '쪽지에 넣을 내용이 없어요(명단·전화번호 줄을 빼니 남은 글이 없어요). 기타 › 쪽지 작성에 안내할 내용을 붙여 넣어 주세요.' });
    afterGo(); return;
  }
  if (intent === 'letter') {
    if (!p.text) { go('etc', 'letter'); say('기타 › 가정통신문으로 왔어요. 넣을 내용을 적어 주세요.'); afterGo(); return; }
    const m = await import('../menus/etc/letter.js');
    // 쓰던 가정통신문(넣을 내용·공문)이 있으면 바꾸지 않고 끝에 덧붙임 — 두 내용이 섞여 써지지 않게 바로 쓰지 않음
    if (m.putLetterSources({ memo: p.text }) === 'added') {
      say('쓰던 가정통신문(넣을 내용·공문)이 있어서 바꾸지 않고 넣을 내용 끝에 덧붙였어요. 두 내용이 섞이지 않게 확인한 뒤 [가정통신문 쓰기]를 눌러 주세요.');
      afterGo(); return;
    }
    let st;
    try { st = m.write(); } catch (e) { st = 'error'; }
    tell(st, { started: '가정통신문 넣을 내용에 넣고 글을 쓰고 있어요. 날짜·장소·금액은 꼭 확인해 주세요.',
      'no-ai': `가정통신문 넣을 내용에 넣었어요. ${NO_AI}`,
      busy: '다른 가정통신문을 쓰는 중이에요. 이 글은 새 가정통신문의 넣을 내용에 넣어 두었으니, 다 쓴 뒤 [가정통신문 쓰기]를 눌러 주세요.',
      empty: '가정통신문에 넣을 내용이 없어요(명단·전화번호 줄을 빼니 남은 글이 없어요). 넣을 내용을 적어 주세요.' });
    afterGo(); return;
  }
  if (intent === 'translate') {
    if (!p.lang) { say('어느 말로 번역할까요?', { chips: LANGS.map(([id, l]) => ({ intent: 'translate', label: l, lang: id })) }); return; }
    const fn = await optional('../menus/etc/letter.js', 'openLetterTranslate');
    if (fn) {
      // 번역이 시작되면 끝까지 기다리지 않음(openLetterTranslate는 곧바로 상태를 돌려줌)
      const st = await Promise.resolve().then(() => fn(p.lang)).catch(() => 'error'), L = langLabel(p.lang);
      tell(st, { started: `가정통신문을 ${L}로 번역하고 있어요. AI 번역이라 보내기 전에 꼭 확인해 주세요.`,
        saved: `저장해 둔 ${L} 번역본을 열었어요. AI 번역이라 보내기 전에 꼭 확인해 주세요.`,
        empty: `먼저 가정통신문을 써 주세요. 기타 › 가정통신문으로 왔어요. 다 쓰면 「가정통신문 ${L}로」라고 다시 말해 주세요.`,
        writing: `가정통신문을 쓰는 중이에요. 다 쓰면 「가정통신문 ${L}로」라고 다시 말해 주세요.`,
        busy: `이미 번역하는 중이에요. 다 되면 「가정통신문 ${L}로」라고 다시 말해 주세요.`,
        'no-ai': `${L} 번역본 칸을 열었어요. ${NO_AI}`, 'no-lang': '어느 말로 번역할지 번역본 칸에서 골라 주세요.' });
    }
    else { go('etc', 'letter'); say('가정통신문 번역은 아직 준비 중이에요. 기타 › 가정통신문으로 왔어요.'); }
    afterGo(); return;
  }
  if (intent === 'gongmun') {
    if (!p.text) { go('etc', 'gongmun'); say('기타 › 공문 처리로 왔어요. 공문 파일을 끌어 놓거나 글을 붙여 넣어 주세요.'); afterGo(); return; }
    const st = await (await import('../menus/etc/gongmun.js')).putGongmunText(p.text).catch(() => 'error');
    tell(st, { started: '공문 처리에 넣고 기한·할 일을 뽑고 있어요.', 'no-ai': '공문 처리에 글만 넣었어요. AI가 준비되지 않아 기한·할 일은 뽑지 못했어요. 설정 › AI에서 키를 넣거나 시험용 AI를 써 주세요.',
      empty: '기타 › 공문 처리로 왔어요. 명단·전화번호 줄을 빼니 넣을 공문 글이 없어요. 공문 파일을 끌어 놓거나 글을 붙여 넣어 주세요.' });
    afterGo(); return;
  }
  if (intent === 'report') {
    if (!p.text) { go('plan', 'report'); say('계획 › 결과 보고로 왔어요. 계획서·공문이나 한 일을 넣어 주세요.'); afterGo(); return; }
    const m = await import('../menus/plan/report.js');
    m.putReportSources({ memo: p.text });
    let st;
    try { st = m.write(); } catch (e) { st = 'error'; }
    tell(st, { started: '결과 보고에 넣고 보고서를 쓰고 있어요. 다 되면 확인해 주세요.', 'no-ai': `결과 보고 한 일 메모에 넣었어요. ${NO_AI}`,
      busy: '다른 결과 보고를 쓰는 중이에요. 이 글은 새 결과 보고에 넣어 두었으니, 다 쓴 뒤 [결과 보고 쓰기]를 눌러 주세요.',
      empty: '결과 보고에 넣을 내용이 없어요(명단·전화번호 줄을 빼니 남은 글이 없어요). 한 일을 적어 주세요.' });
    afterGo(); return;
  }
  if (intent === 'handover') {
    const fn = await optional('../menus/settings/handover.js', 'openHandover');
    if (fn) { Promise.resolve().then(() => fn()).catch(() => {}); say('업무 인수인계서를 열었어요.'); }
    else { go('settings', 'years'); say('업무 인수인계서는 아직 준비 중이에요. 설정 › 학년도로 왔어요.'); }
    afterGo(); return;
  }
  if (intent === 'briefing') { await refreshBrief(); say(brief && brief.length ? `오늘 할 일 ${brief.length}개를 맨 위에 모았어요. 누르면 그 화면으로 가요.` : EMPTY); if (logEl) logEl.scrollTop = 0; return; }
  if (intent === 'memo') { await addMemo(p); return; }
  if (intent === 'memoView') { await viewMemo(p); return; }
  say('그 일은 아직 못 해요.');
}

/* ---------- 한 줄 관찰 메모 (F) ---------- */
async function addMemo({ nos = [], body = '' }) {
  const hk = SS().hk;
  if (!nos.length) { say('몇 번 학생인지 「3번 …」처럼 앞에 번호를 써 주세요.'); return; }
  const m = maskMemo(body);
  if (m.text.replace(/[^가-힣a-zA-Z0-9]/g, '').length < 2) { say('이름·전화번호로 보이는 말을 빼니 남은 글이 없어 넣지 않았어요.'); return; }
  if (!hk) { say('행동특성 메모를 열지 못했어요. 평가 › 행동특성에서 넣어 주세요.'); return; }
  const line = memoLine(m.text, today());
  const done = await hk.addMemo(nos, prev => appendMemo(prev, line));
  // 학급 명단에 없는 번호(학생 수 밖·예외 번호)는 행동특성이 만들지 않음(목록에 보이지 않는 메모가 생기지 않게)
  const put = done.filter(d => !d.skipped), out = done.filter(d => d.skipped).map(d => d.no);
  if (!put.length) { say(`${nosText(out)}은(는) 학급 명단에 없는 번호라 메모를 넣지 않았어요. 번호를 확인해 주세요.`); return; }
  const msg = say([`${nosText(put.map(d => d.no))} 행동특성 메모에 넣었어요.`, `「${line}」`, m.masked ? '이름처럼 보이는 말은 ○○○로 가렸어요.' : '',
    out.length ? `${nosText(out)}은(는) 학급 명단에 없는 번호라 넣지 않았어요.` : ''].filter(Boolean).join('\n'),
  { links: [{ label: '행동특성 보기', route: { to: 'hk', no: put[0].no } }] });
  mem.set(msg.id, { undo: put });
  draw();
}
async function viewMemo({ nos = [] }) {
  const hk = SS().hk;
  if (!hk) { say('행동특성 메모를 열지 못했어요.'); return; }
  const out = [];
  for (const no of nos.slice(0, 5)) { const v = await hk.memoOf(no); out.push(`${no}번 메모\n${v && v.trim() ? v.trim() : '(아직 없어요)'}`); }
  // 메모 내용은 채팅 기록에 남기지 않음(이 창에서만 보임)
  say(out.join('\n\n') + (nos.length > 5 ? `\n…5명까지만 보여요.` : ''), { links: [{ label: '행동특성 보기', route: { to: 'hk', no: nos[0] } }] }, { keep: false });
}

/* ---------- Windows 바탕화면 「쌤」 버튼: 누르면 쌤비서 창과 채팅을 엶 ---------- */
// 버튼 창(bubble.js)이 ssam:chat:open에 누른 때를 적고 창을 열면, 이 창은 저장소 알림(또는 창이 앞에 올 때)으로 채팅을 엶
let lastFlag = 0;
function fromBubble() {
  const v = Number(get(FLAG, 0)) || 0;
  if (!v || v === lastFlag || Math.abs(Date.now() - v) > 15000) return;
  lastFlag = v;
  remove(FLAG);
  openChat();
}

/* inbox.js가 부름: receive(파일 받기), pickFiles(파일 고르기 창) */
export function initChat(d = {}) {
  deps = { ...deps, ...d };
  window.addEventListener('storage', e => { if (e.key === 'ssam:' + FLAG && e.newValue) fromBubble(); });
  window.addEventListener('focus', fromBubble);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') fromBubble(); });
  // Esc: 확인 카드(시트)가 떠 있으면 시트만 닫히게(먼저 봄)
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !isChatOpen()) return;
    const root = document.getElementById('sheetRoot');
    if (root && root.childElementCount) return;
    closeChat();
  }, true);
  fromBubble();
}
