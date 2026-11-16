/* 계획서 「새 서식으로 바꾸기」 화면 부품 (스펙 2026-11-15 1B) — 연간·행사·학급운영계획이 함께 씀.
   내려받기 줄(formSlotHTML 옆)에 [새 서식으로 바꾸기]: 학교 새 서식(.hwpx)을 넣으면 그 글의 큰 제목에 지금 초안 칸을 맞추고(규칙 → 남은 것은 AI),
   미리 보기 창에서 확인 → [이대로 바꾸기]: 초안을 새 차례로 바꾸고 그 서식을 학교 양식으로 저장해 골라 둠. [되돌리기](한 단계)는 바꾸기 전 초안.
   큰 제목이 셋보다 적은 서식은 양식으로만 저장. 작년 계획서를 .hwpx로 넣으면 그 서식도 학교 양식으로 저장(keepLastForm).
   계획서 화면은 registerReform(이름, 맞춤 도우미)로 초안 읽기·바꾸기·되돌리기를 알려 줌. 원본 파일은 저장하지 않음(양식 저장소에 넣는 .hwpx만) */
import * as ai from '../../core/ai.js';
import { readText, fileMessage } from '../../core/files.js';
import { toast } from '../../core/ui.js';
import { MAX_FORM } from '../../core/form-store.js';
import { saveForm, pickedForm, pickForm, formError } from '../../core/school-form.js';
import { aiNoteHTML } from '../../core/ui-parts.js';
import { lastFormName, ruleMap, needsAI, reformPrompt, normReform, mergeReform, attachOrphan } from './reform-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';
export const HWPX_HINT = '한글에서 .hwpx로 저장해 넣으면 모양까지 따라가요';
const NO_ROLES = ' 제목·본문 자리는 문서·소통 › 가정통신문 › [양식 맞추기]에서 정해 주세요.';

/* 계획서마다 맞춤 도우미: { kind, id(), ready(), busy()(그 계획의 다른 AI 일이 도는 중), title(), context(), heads(서식 글) → { heads, roman }, accepts?(새 칸, 옛 칸),
   read() → { olds, apply(맞춤, heads) }(그때의 초안으로), snapshot(), restore(snap), rerender(), done(바꾼 뒤 알림 끝말) } */
const ADAPT = new Map();
export const registerReform = (key, a) => { ADAPT.set(key, a); };
const undo = new Map(); // '이름:계획 id' → { snap, form(바꾸기 전에 고른 양식), picked(이 바꾸기가 고른 양식) } — 한 단계

/* 내려받기 줄의 단추: [새 서식으로 바꾸기] (바꾼 뒤에는 [되돌리기]도) */
export function reformHTML(key) {
  const a = ADAPT.get(key), id = a && a.id();
  return `<button class="btn" type="button" data-rf="${esc(key)}">새 서식으로 바꾸기</button>`
    + (id && undo.has(`${key}:${id}`) ? `<button class="btn text" type="button" data-rf-undo="${esc(key)}" title="새 서식으로 바꾸기 전 초안으로">되돌리기</button>` : '');
}

/* 작년 계획서 파일을 넣을 때: .hwpx면 그 서식도 학교 양식 「작년 계획서 서식 · 파일 이름」으로 저장(이 계획서 종류의 작년 계획서 서식 중 같은 이름은 바꿈)하고 이 계획서 종류에 고른 양식이 없으면 골라 둠.
   .hwp·PDF면 .hwpx로 넣으라는 안내. → 알림 한 줄(없으면 '') */
export async function keepLastForm(key, file) {
  const name = String((file && file.name) || '');
  if (/\.hwpx$/i.test(name)) {
    try {
      const n = lastFormName(name);
      const { picked, ok } = await saveForm(key, new Uint8Array(await file.arrayBuffer()), n, { pick: 'empty', replace: true, from: 'lastPlan:' + key });
      return picked ? `작년 계획서 서식도 학교 양식에 저장해 골라 두었어요(「${n}」). 내려받으면 그 모양으로 나가요.`
        : `작년 계획서 서식도 학교 양식에 저장했어요(「${n}」).${ok ? '' : NO_ROLES}`;
    } catch (e) { return ''; }
  }
  return /\.(hwp|pdf)$/i.test(name) ? HWPX_HINT + '.' : '';
}

/* ---------- 새 서식 넣기 → 맞추기 ---------- */
let token = 0;
async function start(key, file) {
  const a = ADAPT.get(key);
  if (!a || !a.ready()) return;
  // 초안을 쓰는 AI가 끝나면 바꾼 초안을 덮으므로 기다림
  if (a.busy && a.busy()) { toast('AI가 이 계획의 다른 일을 하고 있어요. 끝나면 다시 눌러 주세요.', 5000); return; }
  const id = a.id(), name = String(file.name || '새 서식').replace(/\.[^.]+$/, '') || '새 서식';
  let u8;
  try { u8 = new Uint8Array(await file.arrayBuffer()); } catch (e) { toast(formError('READ'), 6000); return; }
  if (!(u8[0] === 0x50 && u8[1] === 0x4B)) { toast(formError('NOT_HWPX'), 6000); return; }
  if (u8.length > MAX_FORM) { toast(formError('TOO_BIG'), 6000); return; }
  let text;
  try { text = await readText(file); } catch (e) { toast(fileMessage(e && e.code), 6000); return; }
  const H = a.heads(text);
  if (H.heads.length < 3) {
    try { const { ok } = await saveForm(key, u8, name, { pick: true, replace: true, from: 'reform:' + key }); toast('큰 제목을 찾지 못해 양식으로만 저장했어요.' + (ok ? '' : NO_ROLES), 7000); }
    catch (e) { toast(formError(e && e.code), 6000); }
    a.rerender();
    return;
  }
  const r = a.read();
  const rules = ruleMap(r.olds, H.heads, { accepts: a.accepts });
  const st = { key, id, name, u8, H, r, final: null, note: '', t: ++token };
  open(st);
  let answer = null;
  if (needsAI(r.olds, H.heads, rules)) {
    if (!ai.ready()) st.note = 'AI를 정하지 않아 제목·역할이 같은 칸만 옮겼어요. 빈 칸은 바꾼 뒤 직접 써 주세요.';
    else {
      const { prompt, back } = reformPrompt({ kind: a.kind, title: a.title(), context: a.context(), olds: r.olds, heads: H.heads, rules });
      try {
        const v = await ai.generateJSON(prompt, { task: 'plan', valid: x => !!x && typeof x === 'object' && !Array.isArray(x) && (Array.isArray(x.map) || Array.isArray(x.write)) });
        answer = normReform(v, r.olds.map(o => o.id), H.heads.length);
        answer.write = answer.write.map(w => ({ ...w, text: back(w.text).trim() })).filter(w => w.text);
      } catch (e) { st.note = `AI가 칸을 맞추지 못했어요(${ai.errorMessage(e && e.code, e)}). 제목·역할이 같은 칸만 옮겼어요.`; }
    }
  }
  st.final = mergeReform(H.heads, r.olds, rules, answer, { accepts: a.accepts });
  if (sheet(st)) paint(st);
}

/* ---------- 미리 보기 창 ---------- */
const S = () => window.SSAM || {};
const sheet = st => { const el = document.getElementById('rfSheet'); return el && +el.dataset.t === st.t ? el : null; };
function open(st) {
  if (!S().openSheet) return;
  S().openSheet(`<div id="rfSheet" class="rf-sheet" data-t="${st.t}"><h3>새 서식으로 바꾸기</h3>
    ${aiNoteHTML('새 서식의 큰 제목과 지금 초안 칸의 제목·글을 보내요. 이름·전화번호·이메일은 가려서 보내고, 돌아온 글에 다시 넣어요.')}
    <div id="rfBody"><p class="muted"><span class="spin"></span> 「${esc(st.name)}」의 큰 제목 ${st.H.heads.length}개에 지금 초안 칸을 맞추고 있어요…</p></div>
    <div class="row rf-btns"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" data-rf-ok disabled>이대로 바꾸기</button></div></div>`,
  sh => {
    sh.addEventListener('click', e => { if (e.target.closest('[data-rf-ok]') && st.final) confirm(st); });
    sh.addEventListener('change', e => {
      const s = e.target.closest('select[data-rf-attach]');
      if (!s || !st.final) return;
      st.final = attachOrphan(st.final, s.dataset.rfAttach, +s.value);
      const m = sheet(st) && sheet(st).querySelector('#rfMap');
      if (m) m.innerHTML = mapItems(st);
    });
  });
}
const num = (st, i) => `${st.H.roman ? ROMAN[i] || i + 1 : i + 1}. `;
function mapItems(st) {
  const title = id => (st.r.olds.find(o => o.id === id) || {}).title || id;
  return st.final.to.map((x, i) => {
    const h = st.H.heads[i];
    const src = x.from.length ? `<span class="rf-src">← ${x.from.map(id => esc(title(id))).join(' · ')}${x.write ? ' · AI가 새로 씀' : ''}</span>`
      : x.write ? '<span class="rf-src ai">AI가 새로 씀</span>'
        : h.fixed ? `<span class="rf-src">← ${esc(h.fixed)} 그대로</span>` : '<span class="rf-src none">빈 칸 — 바꾼 뒤 직접 써요</span>';
    const peek = x.write ? `<span class="rf-peek">${esc(x.write.replace(/\s+/g, ' ').slice(0, 80))}${x.write.length > 80 ? '…' : ''}</span>` : '';
    return `<li data-rf-to="${i}"><b>${esc(num(st, i) + h.title)}</b>${src}${peek}</li>`;
  }).join('');
}
function paint(st) {
  const el = sheet(st), body = el && el.querySelector('#rfBody');
  if (!body) return;
  const a = ADAPT.get(st.key), f = st.final, olds = st.r.olds;
  const orphans = f.orphans.map(id => olds.find(o => o.id === id)).filter(Boolean);
  body.innerHTML = `<p class="muted rf-lead">「${esc(st.name)}」의 큰 제목 ${st.H.heads.length}개에 지금 초안 칸을 맞췄어요. 확인하고 [이대로 바꾸기]를 눌러 주세요.</p>
    ${st.note ? `<p class="banner warn" role="status"><span class="grow">${esc(st.note)}</span></p>` : ''}
    <ol class="rf-map" id="rfMap">${mapItems(st)}</ol>
    ${orphans.length ? `<div class="rf-orphans" id="rfOrphans"><h4>옮길 곳 없음</h4><p class="muted">글이 빠지지 않게 가까운 칸에 붙여 두었어요. 「붙이지 않음」을 고르면 그 칸의 글은 바꾼 초안에서 빠져요.</p>
      <ul>${orphans.map(o => `<li><b>${esc(o.title)}</b><label class="rf-attach"><span class="lab">이 칸에 붙이기</span>
        <select class="field" data-rf-attach="${esc(o.id)}" aria-label="「${esc(o.title)}」을 붙일 새 칸"><option value="-1">붙이지 않음</option>
        ${st.H.heads.map((h, i) => (!a.accepts || a.accepts(h, o) ? `<option value="${i}"${f.attached[o.id] === i ? ' selected' : ''}>${esc(num(st, i) + h.title)}</option>` : '')).join('')}</select></label></li>`).join('')}</ul></div>` : ''}`;
  const ok = el.querySelector('[data-rf-ok]');
  if (ok) ok.disabled = false;
}

/* [이대로 바꾸기]: 초안을 새 차례로 → 그 서식을 학교 양식으로 저장해 골라 둠. 되돌리기는 한 단계 */
async function confirm(st) {
  const a = ADAPT.get(st.key);
  if (st.busy) return;
  if (!a || a.id() !== st.id) { S().closeSheet && S().closeSheet(); toast('다른 계획을 보고 있어 바꾸지 않았어요.', 5000); return; }
  st.busy = true;
  const snap = a.snapshot(), prev = pickedForm(st.key), u = { snap, form: prev, picked: '' };
  st.r.apply(st.final, st.H);
  undo.set(`${st.key}:${st.id}`, u);
  let msg = '새 서식 차례로 바꿨어요.';
  try {
    const { rec, ok } = await saveForm(st.key, st.u8, st.name, { pick: true, replace: true, from: 'reform:' + st.key });
    u.picked = rec.id;
    msg += ` 「${rec.name}」 양식으로 내려받아요.` + (ok ? '' : NO_ROLES);
  } catch (e) { msg += ` 서식을 학교 양식으로 저장하지 못했어요: ${formError(e && e.code)}`; }
  if (S().closeSheet) S().closeSheet();
  a.rerender();
  toast(`${msg} ${a.done || ''}`.trim(), 8000);
}
function undoReform(key) {
  const a = ADAPT.get(key), id = a && a.id(), u = id && undo.get(`${key}:${id}`);
  if (!u) return;
  undo.delete(`${key}:${id}`);
  a.restore(u.snap);
  // 고른 양식은 계획 종류마다 하나: 이 바꾸기가 고른 양식이 아직 골라져 있을 때만 그 전 양식으로(그 뒤 다른 계획을 바꾸거나 선생님이 고른 양식은 그대로)
  if (u.picked && pickedForm(key) === u.picked) pickForm(key, u.form);
  a.rerender();
  toast('새 서식으로 바꾸기 전 초안으로 되돌렸어요.', 5000);
}

if (typeof document !== 'undefined' && !globalThis.__ssamReform) {
  globalThis.__ssamReform = 1;
  let input = null;
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-rf]');
    if (b) {
      if (!input) { input = Object.assign(document.createElement('input'), { type: 'file', accept: '.hwpx', hidden: true, id: 'rfFile' }); document.body.append(input); }
      input.dataset.key = b.dataset.rf;
      input.onchange = () => { const f = input.files && input.files[0]; input.value = ''; if (f) start(input.dataset.key, f); };
      input.click();
      return;
    }
    const u = e.target && e.target.closest && e.target.closest('[data-rf-undo]');
    if (u) undoReform(u.dataset.rfUndo);
  });
}
