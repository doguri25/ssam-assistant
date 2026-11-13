/* 화면 정리 공통 부품 (스펙 2026-11-14-ui-tidy) — 모든 메뉴가 같은 모양으로 씀(평가 메뉴 옛 화면은 window.SSAM.ui).
   introHTML: 화면 머리말 아래 설명. 처음 3번(앱을 켤 때마다 화면마다 한 번 셈)은 펼쳐 보이고, 그 뒤엔 접힌 「화면 설명」.
   aiNoteHTML: 「AI로 가는 것」 — 무엇을 보내는지 접어 두고, 누르면 펼쳐져 [AI로 보낸 글 보기](설정 › AI)로 이어짐.
   foldHTML: 자주 안 바꾸는 설정 — 요약 한 줄 + [바꾸기], 누르면 펼침. 다시 그려도 펼친 채로(이 실행 동안 기억). */
const KEY = 'ssam:ui:intro';
export const INTRO_SHOW = 3;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let counted = new Set();      // 이번 실행에서 센 화면
const opened = new Map();     // 선생님이 펼치거나 접은 것(다시 그려도 그대로): 'intro:<key>'·'fold:<key>' → true/false
export function _reset() { counted = new Set(); opened.clear(); } // 시험용

function readCounts() { try { const v = JSON.parse(globalThis.localStorage.getItem(KEY)); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return null; } }
/* 이 화면을 몇 번 열었는지(이번 실행에서 처음 그릴 때만 하나 더함). 저장소가 막히면 0(늘 펼침) */
function seen(key) {
  const c = readCounts();
  if (!c) return 0;
  const n = Number(c[key]) || 0;
  if (counted.has(key)) return Math.max(0, n - 1);
  counted.add(key);
  try { globalThis.localStorage.setItem(KEY, JSON.stringify({ ...c, [key]: n + 1 })); } catch (e) {}
  return n;
}

const INFO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/* key: 화면마다 다른 이름(예: 'unit'), text: 한두 문장 */
export function introHTML(key, text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return '';
  const n = seen(key), mem = opened.get('intro:' + key);
  const open = mem != null ? mem : n < INTRO_SHOW;
  return `<details class="intro" data-ui-open="intro:${esc(key)}"${open ? ' open' : ''}><summary class="intro-sum">${INFO}<span>화면 설명</span></summary><p class="intro-text">${esc(t)}</p></details>`;
}

/* text: 이 화면에서 AI로 보내는 것(번호·점수만, 이름은 보내지 않음 등) */
export function aiNoteHTML(text) {
  return `<details class="ai-note"><summary class="ai-note-sum">${LOCK}<span>AI로 가는 것</span></summary>`
    + `<div class="ai-note-body"><p>${esc(text)}</p><button class="btn text" type="button" data-go-ailog>AI로 보낸 글 보기</button></div></details>`;
}

/* key: 화면마다 다른 이름, summary: 지금 설정 요약 한 줄(글), body: 설정 칸(HTML 그대로), open: 처음부터 펼칠지(값이 비어 있어 꼭 정해야 할 때) */
export function foldHTML({ key, summary, body, open = false } = {}) {
  const mem = opened.get('fold:' + key), on = mem != null ? mem : !!open;
  return `<details class="fold" data-fold="${esc(key)}" data-ui-open="fold:${esc(key)}"${on ? ' open' : ''}><summary class="fold-sum"><span class="fold-text">${esc(summary)}</span><span class="fold-act">바꾸기</span></summary>`
    + `<div class="fold-body">${body == null ? '' : body}</div></details>`;
}

if (globalThis.document && !globalThis.__ssamUiParts) {
  globalThis.__ssamUiParts = 1;
  // 펼침·접힘을 기억(화면을 다시 그려도 그대로)
  document.addEventListener('toggle', e => { const d = e.target; if (d && d.dataset && d.dataset.uiOpen) opened.set(d.dataset.uiOpen, d.open); }, true);
  // [AI로 보낸 글 보기] → 설정 › AI의 「AI로 보낸 글」 카드
  document.addEventListener('click', async e => {
    const b = e.target && e.target.closest && e.target.closest('[data-go-ailog]');
    if (!b) return;
    const { go } = await import('./shell.js');
    go('settings', 'ai');
    setTimeout(() => { const card = document.getElementById('setAiLog'); if (card) { card.scrollIntoView({ block: 'start' }); card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true }); } }, 60);
  });
}
if (globalThis.window) {
  window.SSAM = window.SSAM || {}; window.SSAM.ui = { introHTML, aiNoteHTML, foldHTML };
  // 평가 메뉴 옛 화면(evaluate.js, 모듈보다 먼저 도는 보통 스크립트)이 다시 그릴 수 있게 알림
  try { window.dispatchEvent(new Event('ssam:ui-ready')); } catch (e) {}
}
