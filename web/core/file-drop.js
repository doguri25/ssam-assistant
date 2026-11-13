/* 파일 칸 끌어 놓기 (2026-11-12 선생님 요청: 「기초학력 캠프처럼 파일이 들어갈 곳은 드래그 앤 드롭으로 넣기」)
   파일 고르기 창을 여는 단추에 data-drop-pick을 달면, 그 단추가 있는 카드(카드에 그런 단추가 여럿이면 그 단추가 있는 줄)에
   파일을 끌어다 놓을 수 있음. 놓으면 그 단추를 누르고 파일을 고른 것과 똑같이 넣음:
   단추를 누르는 동안 열리는 파일 칸(input.click)을 가로채서 놓은 파일을 넣고 input·change를 보냄.
   → 단추마다 하는 일(학년·반 먼저 묻기, 어느 자료 칸인지 적기, 읽는 중이면 막기)이 그대로 돎.
   이미 끌어 놓기를 받는 칸(쪽지·가정통신문·공문·결과 보고·품의 넣기·한꺼번에 넣기·오늘·채팅·쌤 버튼 판·평가지 채점·창체)은
   그 칸이 먼저 받음(e.defaultPrevented) — 여기는 window에서 맨 나중에 봄. 쌤 버튼(inbox.js)의 「아무 칸도 안 받은 끌어 놓기 막기」보다 앞에 둠 */
import { toast } from './ui.js';

const PICK = '[data-drop-pick]';
/* 놓는 칸은 이 카드 밖으로 넓어지지 않음 */
const CARD = 'section, .yp-card, .pc-card, .set-card, .mv-item, .sheet, dialog, fieldset, [data-drop-card]';
/* 이미 끌어 놓기를 따로 받는 칸(쪽지·가정통신문·공문·결과 보고·품의 넣기·한꺼번에 넣기·오늘·평가지 채점·창체·평가계획 넣기).
   놓는 칸은 이런 칸을 넘어 넓어지지 않고, 이런 칸 안에 놓은 것은 받지 않음(그 칸 차지) — 새로 그런 칸을 만들면 여기에 더함 */
const OWN = '[data-lf-drop], [data-msg-drop], [data-gm-drop], [data-rp-drop], #pcIntakeBox, [data-bundle-drop], [data-hm-drop], [data-ccsheetbox], #grDrop, #grCritBox, #importView';

/* 칸이 받는 파일인지: accept의 확장자(.hwpx)·MIME(image/*, application/json). accept가 없으면 다 받음 */
export function accepts(file, accept) {
  const toks = String(accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!toks.length) return true;
  const name = String((file && file.name) || '').toLowerCase(), type = String((file && file.type) || '').toLowerCase();
  return toks.some(t => (t.startsWith('.') ? name.endsWith(t) && name.length > t.length
    : t.endsWith('/*') ? type.startsWith(t.slice(0, -1)) : type === t));
}

const KIND = [[/^\.(hwp|hwpx)$/, '한글'], [/^\.pdf$/, 'PDF'], [/^\.(docx?|rtf)$/, '워드'], [/^\.(xlsx?|xlsm)$/, '엑셀'], [/^\.csv$/, 'CSV'],
  [/^\.txt$/, '글(.txt)'], [/^(\.(png|jpe?g|webp|heic|gif|bmp)|image\/.*)$/, '사진'], [/^(\.json|application\/json)$/, '백업(.json)']];
/* 안내 글에 쓸 파일 종류: 「한글·PDF·워드·사진」 */
export function kinds(accept) {
  const out = [];
  for (const t of String(accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
    const k = (KIND.find(([re]) => re.test(t)) || [null, t.startsWith('.') ? t : ''])[1];
    if (k && !out.includes(k)) out.push(k);
  }
  return out.join('·');
}

/* ---------- 화면 ---------- */
const shown = el => el.getClientRects().length > 0;
const picksIn = el => (el.matches(PICK) ? [el] : [...el.querySelectorAll(PICK)]).filter(shown);
/* 끌고 있는 곳의 놓는 칸: 단추 하나만 든 가장 큰 조상(카드까지). 단추가 둘 이상이 되거나 따로 받는 칸(OWN)을 품으면 멈춤, 카드에 단추가 없으면 없음 */
export function zoneOf(target) {
  let e = target && (target.nodeType === 1 ? target : target.parentElement), zone = null, pick = null;
  for (; e && e !== document.body && !e.matches('section[data-menu]'); e = e.parentElement) {
    if (e.matches(OWN) || e.querySelector(OWN)) break;
    const ps = picksIn(e);
    if (ps.length > 1 || (pick && ps[0] !== pick)) break;
    if (ps.length === 1) { pick = ps[0]; zone = e; }
    if (e.matches(CARD) && e !== pick) break;
  }
  return pick ? { zone, pick } : null;
}

/* 단추 이름(읽는 중 표시는 빼고): 「양식 넣기」 */
const label = b => (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim();
const busy = b => b.disabled || b.getAttribute('aria-disabled') === 'true' || !!b.querySelector('.spin');

let pending = null; // 놓은 파일: 단추를 누르는 동안 열리는 파일 칸에 넣음

/* 파일 칸에 넣고 고른 것처럼 알림. 칸이 받지 않는 파일은 빼고, 한 파일 칸이면 첫 파일만 */
export function fill(input, files) {
  const ok = files.filter(f => accepts(f, input.accept));
  if (!ok.length) { toast(`이 칸에는 ${kinds(input.accept) || '다른'} 파일을 넣어 주세요`); return false; }
  const use = input.multiple ? ok : ok.slice(0, 1);
  if (!input.multiple && ok.length > 1) toast(`한 파일씩 넣는 칸이라 「${use[0].name}」만 넣었어요`);
  else if (ok.length < files.length) toast(`이 칸에 맞지 않는 파일 ${files.length - ok.length}개는 뺐어요`);
  const dt = new DataTransfer();
  for (const f of use) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/* 놓은 파일을 그 단추로 넣기: 단추를 누르고, 그때 열리는 파일 칸에 넣음 */
export function dropOn(pick, files) {
  if (!files.length) return;
  if (busy(pick)) { toast('지금은 넣을 수 없어요. 하던 일이 끝나면 다시 놓아 주세요'); return; }
  pending = files;
  try { pick.click(); } finally { pending = null; }
}

let cur = null, hint = null, idle = 0;
function clear() {
  clearTimeout(idle);
  if (cur) { cur.zone.classList.remove('fd-over'); cur.pick.classList.remove('fd-pick'); cur = null; }
  if (hint) hint.hidden = true;
}
function mark(z) {
  if (!cur || cur.zone !== z.zone || cur.pick !== z.pick) {
    clear();
    cur = z; z.zone.classList.add('fd-over'); z.pick.classList.add('fd-pick');
  }
  if (!hint) { hint = Object.assign(document.createElement('div'), { className: 'fd-hint', hidden: true }); hint.setAttribute('aria-hidden', 'true'); document.body.append(hint); }
  const r = z.zone.getBoundingClientRect(), b = busy(z.pick);
  hint.textContent = b ? '읽는 중이에요' : `놓으면 「${label(z.pick)}」`;
  hint.classList.toggle('busy', b);
  hint.hidden = false;
  hint.style.top = `${Math.max(4, r.top + 6)}px`;
  hint.style.left = `${Math.max(4, Math.min(r.right - 6, window.innerWidth - 4))}px`;
  // 창 밖으로 나가거나 Esc로 그만두면 dragover가 끊김 → 잠시 뒤 표시를 지움
  clearTimeout(idle); idle = setTimeout(clear, 400);
}

const hasFiles = e => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
export function installFileDrop() {
  if (typeof window === 'undefined' || window.__ssamFileDrop) return;
  window.__ssamFileDrop = true;
  const native = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function (...a) {
    if (pending && this.type === 'file') { const fs = pending; pending = null; fill(this, fs); return; }
    return native.apply(this, a);
  };
  if (HTMLInputElement.prototype.showPicker) {
    const nativeShow = HTMLInputElement.prototype.showPicker;
    HTMLInputElement.prototype.showPicker = function (...a) {
      if (pending && this.type === 'file') { const fs = pending; pending = null; fill(this, fs); return; }
      return nativeShow.apply(this, a);
    };
  }
  window.addEventListener('dragover', e => {
    if (!hasFiles(e) || e.defaultPrevented) { clear(); return; }
    const z = zoneOf(e.target);
    if (!z) { clear(); return; }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    mark(z);
  });
  window.addEventListener('drop', e => {
    if (!hasFiles(e) || e.defaultPrevented) { clear(); return; }
    const z = zoneOf(e.target);
    clear();
    if (!z) return;
    e.preventDefault();
    dropOn(z.pick, [...e.dataTransfer.files]);
  });
  window.addEventListener('dragend', clear);
}
installFileDrop();
