/* 떠 있는 버튼: 아무 파일이나 넣으면 종류를 판단해(AI 없음) 확인 카드 뒤 그 메뉴의 기능으로 (스펙 2026-10-30-inbox-button).
   메뉴 모듈은 registerInbox(kind, { act(files, ctx), fields?(files, ctx), run(files, values, opts), one? })로 자기 일을 등록.
   one: 한 번에 파일 하나만 처리 — 여러 개면 카드는 한 번, run은 파일마다 차례로(메뉴가 띄운 창이 닫힌 뒤에 다음)
   입력 칸 { key, label, type, options?, value?, required?, ask? } — ask: 바로 실행이어도 카드로 물어봄(여럿 중 고르기)
   ctx = opts = { texts: Map(파일 → 읽은 글) } (+ opts.plan) — 처리 함수가 파일을 다시 읽지 않아도 되게
   웹판·Windows 쌤비서 창 안에서는 오른쪽 아래 버튼(누르면 파일 고르기, 끌고 오면 놓기 판) */
import { get, set } from './store.js';
import { readText, fileMessage } from './files.js';
import { classify, groupFiles, KINDS, kindLabel } from './inbox-classify.js';

const KEY = 'inbox';
export const DEFAULTS = { on: true, mode: 'confirm', plan: 'draft', keepOnClose: true, autostart: false };
const CHOICES = { mode: ['confirm', 'direct'], plan: ['draft', 'open'] };
const SS = () => window.SSAM || {};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m, ms) => SS().toast && SS().toast(m, ms);

/* ---------- 설정 ---------- */
export function getInboxSettings() {
  const v = get(KEY, null) || {}, s = { ...DEFAULTS };
  for (const k of ['on', 'keepOnClose', 'autostart']) if (typeof v[k] === 'boolean') s[k] = v[k];
  for (const k of Object.keys(CHOICES)) if (CHOICES[k].includes(v[k])) s[k] = v[k];
  return s;
}
export function setInboxSettings(patch) {
  const s = { ...getInboxSettings(), ...patch };
  set(KEY, s);
  document.dispatchEvent(new CustomEvent('inbox:settings', { detail: s }));
  syncFab();
  return s;
}

/* ---------- 처리 함수 등록 ---------- */
const handlers = {};
export function registerInbox(kind, handler) { handlers[kind] = handler; }
const actOf = (kind, files, ctx) => (handlers[kind] && handlers[kind].act ? handlers[kind].act(files, ctx) : (KINDS.find(k => k[0] === kind) || [])[2] || '');

/* ---------- 받기: 줄 세워 한 번에 한 묶음씩 ---------- */
const queue = [];
let running = false;
export function receive(files) {
  const list = [...(files || [])].filter(Boolean);
  if (!list.length) return;
  if (running) toast('앞 파일을 마친 뒤 이어서 할게요.', 4000);
  queue.push(list);
  if (!running) pump();
}
/* 메뉴가 띄운 창(교과 고르기·명단 확인·이름 칸 등)이나 선생님이 연 창이 닫힐 때까지 기다림 — 다음 카드가 그 창을 덮지 않게 */
function sheetIdle() {
  const root = document.getElementById('sheetRoot');
  if (!root || !root.childElementCount) return Promise.resolve();
  return new Promise(res => {
    const obs = new MutationObserver(() => { if (!root.childElementCount) { obs.disconnect(); res(); } });
    obs.observe(root, { childList: true });
  });
}
async function pump() {
  running = true;
  try {
    while (queue.length) {
      const files = queue.shift();
      // 한 묶음에서 문제가 나도 다음 파일은 이어서
      try { await handleBatch(files); } catch (e) { toast(`${files.map(f => `「${f.name}」`).join(', ')}을(를) 처리하지 못했어요.`, 6000); }
    }
  } finally { running = false; }
}

const isImage = f => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|bmp|gif|heic)$/i.test(f.name || '');
async function readOne(file) {
  if (isImage(file)) return { file, text: '', scan: true };
  try { return { file, text: await readText(file), scan: false }; } catch (e) {
    if (e && e.code === 'PDF_NO_TEXT') return { file, text: '', scan: true };
    return { file, error: fileMessage(e && e.code) };
  }
}

async function handleBatch(files) {
  const read = await Promise.all(files.map(readOne));
  const bad = read.filter(r => r.error), ok = read.filter(r => !r.error);
  const notes = bad.map(r => `「${r.file.name}」: ${r.error}`);
  if (!ok.length) { await sheetIdle(); await askCard({ files: bad.map(r => r.file), notes }); return; }
  const info = new Map(ok.map(r => [r.file, classify({ name: r.file.name, text: r.text, scan: r.scan })]));
  const ctx = { texts: new Map(ok.map(r => [r.file, r.text || ''])) };
  const groups = groupFiles(ok.map(r => ({ file: r.file, kind: info.get(r.file).kind })));
  for (const [i, g] of groups.entries()) await handleGroup(g, info.get(g.files[0]), i ? [] : notes, ctx);
}

async function handleGroup({ kind, files }, guess, notes, ctx) {
  const s = getInboxSettings();
  let pick = { kind, values: {} };
  const fields = await fieldsOf(kind, files, ctx);
  // 바로 실행이어도 모자란 필수 값, 여럿 중 고를 것(ask: 어느 평가·계획·행사)이 있으면 카드
  const direct = s.mode === 'direct' && kind !== 'unknown' && handlers[kind] && !notes.length && !fields.some(f => f.ask || (f.required && !String(f.value || '').trim()));
  if (direct) fields.forEach(f => { pick.values[f.key] = f.value == null ? '' : f.value; });
  else {
    await sheetIdle();
    pick = await askCard({ files, kind, guess, notes, ctx });
    if (!pick) return;
  }
  const h = handlers[pick.kind];
  if (!h) return;
  const opts = { plan: s.plan, texts: ctx.texts };
  for (const [i, part] of (h.one && files.length > 1 ? files.map(f => [f]) : [files]).entries()) {
    if (i) await sheetIdle();
    try {
      const msg = await h.run(part, pick.values, opts);
      if (msg) toast(msg, 6000);
    } catch (e) { toast(`하지 못했어요: ${String((e && e.message) || e || '')}`.trim(), 6000); }
  }
  await sheetIdle();
}
async function fieldsOf(kind, files, ctx) {
  const h = handlers[kind];
  if (!h || !h.fields) return [];
  try { return (await h.fields(files, ctx)) || []; } catch (e) { return []; }
}

/* ---------- 확인 카드 ---------- */
const fieldHTML = f => {
  const id = `data-ib-field="${esc(f.key)}"`, v = f.value == null ? '' : f.value;
  const input = f.type === 'select'
    ? `<select class="field" ${id}>${(f.options || []).map(([val, lab]) => `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`).join('')}</select>`
    : `<input class="field" ${id} type="${f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}" value="${esc(v)}" autocomplete="off">`;
  return `<label class="yp-f"><span class="lab">${esc(f.label)}${f.required ? ' *' : ''}</span>${input}</label>`;
};
function askCard({ files, kind = '', guess = null, notes = [], ctx = { texts: new Map() } }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const names = files.map(f => `「${esc(f.name)}」`).join(', ');
    const kinds = KINDS.filter(([k]) => k !== 'unknown' && handlers[k]);
    const html = `<h3>파일을 받았어요</h3>
      <p class="muted" style="margin:0">${names}</p>
      ${notes.length ? `<ul class="ib-notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${guess ? `<p class="ib-guess"><b>${esc(kind === 'unknown' ? '모르는 파일' : kindLabel(kind))}</b>${kind === 'unknown' ? '' : '(으)로 보여요.'} <span class="muted">${esc(guess.why)}</span></p>
      <label class="yp-f"><span class="lab">할 일</span><select class="field" id="ibKind">
        ${kind === 'unknown' || !handlers[kind] ? '<option value="">골라 주세요</option>' : ''}
        ${kinds.map(([k, label]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(label)} — ${esc(actOf(k, files, ctx))}</option>`).join('')}</select></label>
      <div id="ibFields" class="ib-fields"></div>
      <p class="set-msg err" role="alert" id="ibErr" hidden></p>` : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>${guess ? '그만두기' : '닫기'}</button>${guess ? '<button class="btn primary" type="button" id="ibRun">실행</button>' : ''}</div>`;
    SS().openSheet(html, sh => {
      const root = document.getElementById('sheetRoot');
      const obs = new MutationObserver(() => { if (!sh.isConnected) { obs.disconnect(); finish(null); } });
      if (root) obs.observe(root, { childList: true, subtree: true });
      if (!guess) return;
      const sel = sh.querySelector('#ibKind'), run = sh.querySelector('#ibRun'), err = sh.querySelector('#ibErr'), box = sh.querySelector('#ibFields');
      let fields = [];
      const draw = async () => {
        const k = sel.value;
        run.disabled = !k;
        err.hidden = true;
        fields = k ? await fieldsOf(k, files, ctx) : [];
        if (sel.value === k) box.innerHTML = fields.map(fieldHTML).join('');
      };
      sel.addEventListener('change', draw);
      draw();
      run.addEventListener('click', () => {
        const k = sel.value;
        if (!k) return;
        const values = {};
        for (const f of fields) values[f.key] = (sh.querySelector(`[data-ib-field="${CSS.escape(f.key)}"]`) || {}).value ?? '';
        const miss = fields.find(f => f.required && !String(values[f.key] || '').trim());
        if (miss) { err.textContent = `「${miss.label}」을(를) 넣어 주세요.`; err.hidden = false; sh.querySelector(`[data-ib-field="${CSS.escape(miss.key)}"]`).focus(); return; }
        obs.disconnect();
        finish({ kind: k, values });
        SS().closeSheet();
      });
    });
  });
}

/* ---------- 오른쪽 아래 버튼과 놓기 판 ---------- */
let fab = null, pad = null, input = null, hideFab = false;
const DROP_ICON = '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>';
const TRAY_ICON = '<svg viewBox="0 0 24 24"><path d="M12 3v10m0 0-4-4m4 4 4-4"/><path d="M4 14v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3h-4.5a3.5 3.5 0 0 1-7 0H4z"/></svg>';
const NEAR = { w: 340, h: 240 }; // 버튼 근처: 오른쪽 아래 이만큼 (판 280×170보다 조금 넓게)
const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
/* Windows 버튼 창을 쓰면 창 안 버튼은 숨김 (Task 6) */
export function setFabHidden(v) { hideFab = !!v; syncFab(); }
function syncFab() {
  if (!fab) return;
  const show = getInboxSettings().on && !hideFab;
  fab.hidden = !show;
  if (!show) pad.hidden = true;
}
function mount() {
  if (fab || !document.body) return;
  fab = Object.assign(document.createElement('button'), { type: 'button', id: 'inboxFab', className: 'inbox-fab', title: '아무 파일이나 넣으면 쌤비서가 알아서 해요' });
  fab.setAttribute('aria-label', '파일 넣기 — 쌤비서가 알아서 해요');
  fab.innerHTML = `<span class="ib-glyph" aria-hidden="true">쌤</span><span class="ib-badge" aria-hidden="true">${DROP_ICON}</span>`;
  input = Object.assign(document.createElement('input'), { type: 'file', id: 'inboxFile', multiple: true, hidden: true });
  pad = Object.assign(document.createElement('div'), { id: 'inboxPad', className: 'inbox-pad', hidden: true });
  pad.innerHTML = `<span class="ib-pad-icon" aria-hidden="true">${TRAY_ICON}</span><b>여기에 놓으면</b><span>쌤비서가 알아서 해요</span>`;
  document.body.append(fab, input, pad);
  fab.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { const f = [...input.files]; input.value = ''; receive(f); });
  // 판은 자기에게 온 끌어 놓기만 받고 더 퍼뜨리지 않음 (다른 메뉴의 문서 전체 끌어 놓기 처리와 겹치지 않게)
  for (const ev of ['dragenter', 'dragover']) pad.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; pad.classList.add('on'); });
  pad.addEventListener('dragleave', e => { e.stopPropagation(); pad.classList.remove('on'); });
  pad.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    pad.hidden = true; pad.classList.remove('on');
    receive(e.dataTransfer ? [...e.dataTransfer.files] : []);
  });
  // 창 안으로 파일을 끌고 오면 버튼만 조금 커지고, 오른쪽 아래 버튼 근처로 오면 판을 띄움 (다른 메뉴의 끌어 놓기 칸을 가리지 않게)
  let depth = 0;
  const reset = () => { depth = 0; pad.hidden = true; pad.classList.remove('on'); fab.classList.remove('drag'); };
  const near = e => e.clientX >= window.innerWidth - NEAR.w && e.clientY >= window.innerHeight - NEAR.h;
  window.addEventListener('dragenter', e => { if (!hasFiles(e) || fab.hidden) return; depth++; fab.classList.add('drag'); }, true);
  window.addEventListener('dragover', e => { if (hasFiles(e) && !fab.hidden) pad.hidden = !near(e); }, true);
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) reset(); }, true);
  for (const ev of ['drop', 'dragend']) window.addEventListener(ev, reset, true);
  // 판·메뉴의 칸이 아닌 곳에 놓으면 브라우저가 파일을 열어 창이 넘어감: 아무 칸도 받지 않은 끌어 놓기는 막음
  window.addEventListener('dragover', e => { if (hasFiles(e) && !e.defaultPrevented) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'; } });
  window.addEventListener('drop', e => { if (hasFiles(e) && !e.defaultPrevented) e.preventDefault(); });
  syncFab();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

/* ---------- Windows 앱: 바탕화면 위 버튼 창(bubble)과 잇기 ---------- */
// 버튼 창은 끌어 놓은 경로만 Rust에 넘기고, Rust가 이 창에 inbox:files로 알림 → 그 경로만 inbox_read로 읽어 받음
function askPick() {
  SS().openSheet(`<h3>넣을 파일을 골라 주세요</h3><p class="muted" style="margin:0">어떤 파일이든 넣으면 쌤비서가 알아보고 그 메뉴에서 해 줘요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" id="ibPick">파일 고르기</button></div>`,
  sh => sh.querySelector('#ibPick').addEventListener('click', () => { SS().closeSheet(); if (input) input.click(); }));
}
function bridge() {
  const T = window.__TAURI__;
  if (!T || !T.core || !T.event) return;
  // 버튼을 끄면 자동 시작도 끔 (컴퓨터를 켤 때 창 없이 켜지지 않게)
  const sync = s => { setFabHidden(true); Promise.resolve(T.core.invoke('bubble_config', { enabled: s.on, keepOnClose: s.keepOnClose, autostart: s.on && s.autostart })).catch(() => {}); };
  sync(getInboxSettings());
  document.addEventListener('inbox:settings', e => sync(e.detail));
  // 버튼 창은 놓을 때마다 알림(앞 알림을 놓쳤을 수 있어서): 3초 안에 또 온 같은 파일은 한 번만(읽기에 실패한 파일은 바로 다시 받음)
  const recent = new Map();
  T.event.listen('inbox:files', async ({ payload }) => {
    const files = [], now = Date.now();
    for (const [p, at] of recent) if (now - at > 3000) recent.delete(p);
    for (const f of payload || []) {
      if (recent.has(f.path)) { toast(`「${f.name}」은(는) 방금 넣었어요.`, 3000); continue; }
      recent.set(f.path, now);
      try { files.push(new File([await T.core.invoke('inbox_read', { path: f.path })], f.name)); }
      catch (e) { recent.delete(f.path); toast(`「${f.name}」을(를) 읽지 못했어요${String(e) === 'TOO_BIG' ? ' (60MB보다 커요)' : ''}.`, 6000); }
    }
    receive(files);
  }).catch(() => {});
  T.event.listen('bubble:off', () => { setInboxSettings({ on: false }); toast('떠 있는 버튼을 숨겼어요. 설정 › 화면에서 다시 켤 수 있어요.', 6000); }).catch(() => {});
  T.event.listen('inbox:pick', () => askPick()).catch(() => {});
}
bridge();
