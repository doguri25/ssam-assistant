/* 문서·소통 › 문서 다듬기 (스펙 2026-11-15 1A, 방식 가): 한글 문서(.hwpx)를 넣고 「공문체로 다듬어 줘」처럼 말하면 문단·표 칸마다 글만 고치고
   모양(표·글꼴·결재란)은 그대로 둔 .hwpx를 내려받음(core/hwpx-edit.js). .hwp·워드·PDF·글은 글만 읽어 쌤비서 기본 문서로.
   AI(업무 doc)에는 줄 글만 — 이름·연락처는 가려 보내고 돌아온 글에 되돌려 넣음, 명단·주민번호 줄과 이름만 든 칸은 보내지 않음(docedit-model.js).
   바뀐 줄만 「전 → 후」, 줄마다 [되돌리기]·[모두 되돌리기], 이어서 고치기·[한 단계 되돌리기](최근 10), 날짜·학년도 바꾸기는 AI 없이.
   원본 파일·고친 단계는 이 화면(메모리)에만 두고 저장하지 않음. 쌤 채팅 등은 putDoceditFile(파일, { ask })로 넣고 시작 */
import { onEnter, go } from '../../core/shell.js';
import { introHTML, aiNoteHTML } from '../../core/ui-parts.js';
import * as ai from '../../core/ai.js';
import { toast, saveFile } from '../../core/ui.js';
import { readText, fileMessage } from '../../core/files.js';
import { aiRowHTML } from '../../core/ai-roles.js';
import { keepFiles } from '../../core/keep-files.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import { readForm } from '../../core/hwpx-form.js';
import { writeHwpx } from '../../core/hwpx-edit.js';
import { wordDiff } from '../evaluate/check/check-diff.js';
import { CHIPS, startItems, payloadOf, batchLines, docPrompt, normChanges, applyChanges, revertOne, revertAll, changesOf, viewOf, guessSwap, swapItems, editsOf, plainDoc, pushHist } from './docedit-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const baseName = n => String(n || '').replace(/\.[^.]+$/, '').trim() || '문서';
const fileBase = s => String(s || '문서').replace(/[\\/:*?"<>|]/g, '_');
const NOTE = '줄 글만 보내요. 이름·연락처(전화번호·이메일)는 가려서 보내고 돌아온 글에 되돌려 넣어요. 명단·주민번호가 든 줄과 이름만 든 칸은 보내지 않아요. 원본 파일은 저장하지 않아요(이 화면에만 있어요).';
/* 화면에만: doc { name, kind: 'hwpx'|'plain', form, lines }, items(지금 줄), hist(앞 단계들), busy, step(긴 문서 묶음 「2/3」), tok(문서마다),
   ask(요청 칸), note(AI가 고친 것 한 줄), swap({ from, to } — 날짜·학년도 바꾸기 칸을 열었을 때), adding, open(펼친 「바뀌지 않은 줄」) */
const S = { doc: null, items: [], hist: [], busy: false, step: '', tok: 0, ask: '', note: '', swap: null, adding: false, open: new Set() };
let box = null;

const hasWork = () => !!(S.doc && (S.hist.length || changesOf(S.items).length));
const sig = x => `${x.del ? 1 : 0}\u0001${x.text}`;
/* 앞 단계와 견주어 바뀐 줄 수 */
function stepCount(a, b) {
  const m = new Map(a.map(x => [x.id, sig(x)])), ids = new Set();
  let n = 0;
  for (const x of b) { ids.add(x.id); if (m.get(x.id) !== sig(x)) n++; }
  for (const x of a) if (!ids.has(x.id)) n++;
  return n;
}
function step(next) { S.hist = pushHist(S.hist, S.items); S.items = next; }

/* ---------- 넣기 ---------- */
/* 파일 → 이 화면에(저장하지 않음). 다듬던 문서가 있으면 묻고 바꿈 → 넣었으면 true */
export async function addFile(f) {
  if (!f || S.busy || S.adding) return false;
  if (hasWork() && !confirm('다듬던 문서가 있어요. 새 문서를 넣으면 고친 것이 없어져요(원본은 저장하지 않아요). 넣을까요?')) return false;
  S.adding = true; render();
  let doc = null, err = null;
  const name = String(f.name || '문서');
  try {
    const u8 = new Uint8Array(await f.arrayBuffer());
    if (/\.hwpx$/i.test(name) || (u8[0] === 0x50 && u8[1] === 0x4B && !/\.(docx|xlsx)$/i.test(name))) {
      try { const form = await readForm(u8); doc = { name, kind: 'hwpx', form, lines: form.lines }; } catch (e) { err = e; }
    }
    if (!doc) { const text = await readText(f); doc = { name, kind: 'plain', form: null, lines: String(text).split('\n').map(t => ({ text: t, inBox: false })) }; }
  } catch (e) { err = e; doc = null; }
  S.adding = false;
  if (!doc) { render(); toast(err && err.code ? fileMessage(err.code) : '파일을 읽지 못했어요. 한글(.hwpx) 파일을 넣어 주세요.', 6000); return false; }
  S.doc = doc; S.items = startItems(doc.lines); S.hist = []; S.note = ''; S.swap = null; S.open = new Set(); S.tok++;
  render();
  if (!S.items.length) toast('글이 있는 줄을 찾지 못했어요. 다른 파일을 넣어 주세요.', 6000);
  else if (doc.kind === 'plain') toast('글만 읽었어요. 다듬은 글은 쌤비서 기본 문서로 내려받아요. 한글에서 .hwpx로 저장해 넣으면 모양 그대로예요.', 8000);
  return true;
}
function newDoc() {
  if (hasWork() && !confirm('다듬던 문서를 닫을까요? 고친 것이 없어져요(원본은 저장하지 않아요).')) return;
  S.doc = null; S.items = []; S.hist = []; S.note = ''; S.swap = null; S.open = new Set(); S.tok++;
  render();
}

/* ---------- 다듬기 (AI) ---------- */
/* 요청으로 다듬기: 바로 상태를 돌려주고 AI는 이어서. 요청 글도 이름·연락처를 가려 보냄(줄과 같은 자리 표시)
   → 'started' | 'busy' | 'no-doc' | 'no-ask' | 'no-ai' | 'held-ask'(요청에 주민번호·명단) | 'nothing'(보낼 줄 없음) */
export function run(ask = S.ask) {
  const a = String(ask || '').trim();
  if (S.busy) return 'busy';
  if (!S.doc) { toast('먼저 문서를 넣어 주세요.'); return 'no-doc'; }
  if (!a) { toast('어떻게 다듬을지 적거나 빠른 요청을 눌러 주세요.'); const ta = box && box.querySelector('#deAsk'); if (ta) ta.focus(); return 'no-ask'; }
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return 'no-ai'; }
  const p = payloadOf(S.items, a);
  if (p.ask === null) { toast('요청에 주민번호나 명단처럼 보이는 글이 있어 보내지 않았어요. 이름·번호 없이 적어 주세요.', 6000); return 'held-ask'; }
  if (!p.sent.length) { toast('AI로 보낼 줄이 없어요(명단·주민번호가 든 줄과 이름만 든 칸은 보내지 않아요).', 6000); return 'nothing'; }
  S.busy = true; S.step = ''; render();
  job(p.ask, p);
  return 'started';
}
const runLabel = () => (S.busy ? `<span class="spin"></span>다듬는 중…${S.step ? ` (${S.step})` : ''}` : '다듬기');
/* ask: 가린 요청 */
async function job(ask, p) {
  const tok = S.tok, bs = batchLines(p.sent), all = [], notes = [];
  let err = null;
  for (let i = 0; i < bs.length; i++) {
    S.step = bs.length > 1 ? `${i + 1}/${bs.length}` : '';
    const rb = box && box.querySelector('[data-de="run"]');
    if (rb) rb.innerHTML = runLabel();
    try {
      const v = await ai.generateJSON(docPrompt({ ask, lines: bs[i], part: [i + 1, bs.length] }),
        { task: 'doc', valid: o => !!o && typeof o === 'object' && (Array.isArray(o) || Array.isArray(o.changes)) });
      const r = normChanges(v, { ids: new Set(bs[i].map(x => x.id)), back: p.back });
      all.push(...r.changes);
      if (r.note) notes.push(r.note);
    } catch (e) { err = e || {}; break; }
    if (tok !== S.tok) return;
  }
  if (tok !== S.tok) return; // 그새 다른 문서를 넣음
  S.busy = false; S.step = '';
  const next = applyChanges(S.items, all), n = stepCount(S.items, next);
  if (n) step(next);
  if (notes.length || !err) S.note = notes.join(' '); // 실패해 받은 것이 없으면 앞 메모를 둠
  render();
  const held = p.held ? ` 명단·주민번호가 든 줄과 이름만 든 칸 ${p.held}줄은 AI로 보내지 않았어요.` : '';
  if (err) toast(`${err.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(err.code, err)}${n ? ` 앞 부분에서 고친 ${n}줄은 넣어 두었어요.` : ''}`, 7000);
  else toast(n ? `${n}줄을 고쳤어요. 바뀐 줄을 확인해 주세요.${held}` : 'AI가 고칠 줄을 찾지 못했어요. 요청을 조금 더 자세히 적어 주세요.', 6000);
}

/* ---------- 날짜·학년도 바꾸기 (AI 없이) ---------- */
function doSwap() {
  if (!S.doc || S.busy || !S.swap) return;
  const from = String(S.swap.from || ''), to = String(S.swap.to || '');
  if (!from.trim()) { toast('바꿀 글을 적어 주세요. 예) 2026학년도'); return; }
  const r = swapItems(S.items, from, to);
  if (!r.n) { toast(`「${from}」 글이 든 줄이 없어요.`); return; }
  step(r.items); S.swap = null; render();
  toast(`「${from}」 → 「${to}」 ${r.n}줄을 바꿨어요(AI 없이).`, 5000);
}

/* ---------- 내려받기 ---------- */
async function download() {
  if (!S.doc) return;
  const name = fileBase(`${baseName(S.doc.name).replace(/\s*\(다듬음\)$/, '')}(다듬음)`); // 다듬은 파일을 또 다듬어도 「(다듬음)」은 하나
  if (S.doc.kind !== 'hwpx') { toast(await exportDoc(plainDoc(S.doc.lines, S.items), name), 6000); return; }
  let where;
  try {
    const { bytes } = writeHwpx(S.doc.form, editsOf(S.items));
    where = await saveFile(`${name}.hwpx`, bytes, 'application/hwp+zip');
  } catch (e) { toast(`한글 파일을 만들지 못했어요: ${String((e && e.message) || e || '').slice(0, 80)}`, 7000); return; }
  toast(window.__TAURI__ ? `다운로드 폴더에 저장했어요: ${String(where).split(/[\\/]/).pop()}` : '한글 파일을 내려받았어요. 한글에서 열어 확인해 주세요.', 6000);
}

/* ---------- 다른 메뉴에서 ---------- */
/* 쌤 채팅·떠 있는 버튼: 문서 파일 → 문서 다듬기 탭에 넣고, ask가 있으면 그 요청으로 다듬기 시작
   → run()의 상태 | 'put'(넣기만) | 'failed'(읽지 못함·그만둠) | 'busy'(다듬는 중) */
export async function putDoceditFile(file, { ask = '' } = {}) {
  go('etc', 'docedit');
  if (S.busy) { toast('문서를 다듬는 중이에요. 끝나면 다시 넣어 주세요.', 5000); return 'busy'; }
  if (!(await addFile(file))) return 'failed';
  const a = String(ask || '').trim();
  if (!a) return 'put';
  S.ask = a; render();
  return run(a);
}

/* ---------- 그리기 ---------- */
const leadOf = t => (/^[ \t　]*/.exec(String(t || '')) || [''])[0];
/* 고친 줄: 낱말로 견주어 지운 말·더한 말 표시(앞 공백은 그대로) */
function sideHTML(before, after, side) {
  const lead = leadOf(side === 'before' ? before : after);
  return esc(lead) + wordDiff(before, after).filter(o => (side === 'before' ? o.op !== 'ins' : o.op !== 'del'))
    .map(o => (o.op === 'eq' ? esc(o.t) : side === 'before' ? `<del>${esc(o.t)}</del>` : `<ins>${esc(o.t)}</ins>`)).join(' ');
}
const KIND = { edit: '고침', del: '지움', add: '더함' };
function chgHTML(c) {
  const whole = (t, tag) => `${esc(leadOf(t))}<${tag}>${esc(t.slice(leadOf(t).length))}</${tag}>`; // 앞 공백은 표시 밖에
  const before = c.kind === 'add' ? '<span class="de-none">(새 줄)</span>' : c.kind === 'del' ? whole(c.before, 'del') : sideHTML(c.before, c.after, 'before');
  const after = c.kind === 'del' ? '<span class="de-none">(지움)</span>' : c.kind === 'add' ? whole(c.after, 'ins') : sideHTML(c.before, c.after, 'after');
  return `<li class="de-chg de-${c.kind}" data-de-id="${c.id}"><span class="de-tag">${KIND[c.kind]}${c.box ? ' · 표 칸' : ''}</span>
    <div class="de-pair"><p class="de-before"><span class="sr-only">전: </span>${before}</p><span class="de-arrow" aria-hidden="true">→</span><p class="de-after"><span class="sr-only">후: </span>${after}</p></div>
    <button class="btn text tiny" type="button" data-de-revert="${c.id}"${S.busy ? ' disabled' : ''} aria-label="이 줄 되돌리기">되돌리기</button></li>`;
}
function sameHTML(items) {
  const k = String(items[0].id);
  return `<li class="de-same-wrap"><details class="de-same" data-de-same="${k}"${S.open.has(k) ? ' open' : ''}><summary>바뀌지 않은 줄 ${items.length}개</summary>
    <ol class="de-same-list">${items.map(x => `<li${x.box ? ' class="de-cell"' : ''}>${esc(x.text)}</li>`).join('')}</ol></details></li>`;
}
function prevHTML() {
  if (!S.doc) return '';
  const ch = changesOf(S.items);
  const dl = S.doc.kind === 'hwpx' ? '<button class="btn primary" type="button" data-de="download">한글로 내려받기</button>' : exportButton('data-de="download"', { cls: 'primary' });
  return `<section class="pc-card de-prev" id="dePrev">
    <div class="de-prev-h"><h3>바뀐 줄 <span class="muted">${ch.length}개</span></h3>
      <div class="row"><button class="btn text" type="button" data-de="revertAll"${ch.length && !S.busy ? '' : ' disabled'}>모두 되돌리기</button>${dl}</div></div>
    ${ch.length ? '' : '<p class="muted" style="margin:0">아직 바뀐 줄이 없어요. 요청을 적고 [다듬기]를 누르면 바뀐 줄만 여기에 「전 → 후」로 보여요.</p>'}
    <ol class="de-list">${viewOf(S.items).map(b => (b.type === 'same' ? sameHTML(b.items) : chgHTML(b.c))).join('')}</ol></section>`;
}
function swapHTML() {
  if (!S.swap) return '';
  return `<div class="de-swap" id="deSwapBox"><p class="muted" style="margin:0">AI 없이 문서에서 이 글을 모두 바꿔요.</p>
    <div class="de-swap-row"><label class="yp-f"><span class="lab">바꿀 글</span><input class="field" id="deFrom" value="${esc(S.swap.from)}" placeholder="2026학년도" autocomplete="off"></label>
      <span class="de-arrow" aria-hidden="true">→</span>
      <label class="yp-f"><span class="lab">새 글</span><input class="field" id="deTo" value="${esc(S.swap.to)}" placeholder="2027학년도" autocomplete="off"></label></div>
    <div class="row"><button class="btn" type="button" data-de="swap"${S.doc && !S.busy ? '' : ' disabled'}>모두 바꾸기</button><button class="btn text" type="button" data-de="swapClose">닫기</button></div></div>`;
}
function pageHTML() {
  const d = S.doc;
  return `<div class="m-page de-page">
    <div class="m-head m-head-row"><div><h2>문서 다듬기</h2>${introHTML('docedit', '한글 문서(.hwpx)를 넣고 「공문체로 다듬어 줘」처럼 말하면 문단·표 칸마다 글만 고치고, 표·글꼴·결재란 모양은 그대로 둔 한글 파일로 내려받아요.')}</div>
      <div class="m-head-act">${aiRowHTML('doc')}${d ? `<button class="btn text" type="button" data-de="new"${S.busy ? ' disabled' : ''}>새 문서</button>` : ''}</div></div>
    <div class="de-grid">
      <section class="pc-card de-file"><h3>문서</h3>
        <p class="muted" style="margin:0">한글 파일(.hwpx)을 끌어 놓거나 골라 주세요. .hwp·워드·PDF·글(.txt)은 글만 읽어 쌤비서 기본 문서로 만들어요.</p>
        <div class="row"><button class="btn${d ? '' : ' primary'}" type="button" data-de="pick" data-drop-pick${S.busy || S.adding ? ' disabled' : ''}>${S.adding ? '<span class="spin"></span>읽는 중…' : d ? '다른 문서 넣기' : '파일 고르기'}</button>
          <input type="file" id="deFile" hidden accept=".hwpx,.hwp,.docx,.pdf,.txt"></div>
        ${d ? `<p class="de-name"><b>${esc(d.name)}</b> <span class="muted">${d.kind === 'hwpx' ? '한글 문서' : '글만 읽음'} · 고칠 줄 ${S.items.filter(x => x.src != null).length}줄</span></p>` : ''}
        ${d && d.kind !== 'hwpx' ? '<p class="banner warn de-plain" role="note">글만 읽어 쌤비서 기본 문서로 내려받아요. 한글에서 .hwpx로 저장해 넣으면 모양 그대로예요.</p>' : ''}
      </section>
      <section class="pc-card de-ask"><h3>어떻게 다듬을까요?</h3>
        <div class="seg de-chips" role="group" aria-label="빠른 요청">${CHIPS.map(c => `<button type="button" data-de-chip="${c.id}"${c.id === 'swap' ? ` aria-pressed="${!!S.swap}"` : ''}${S.busy ? ' disabled' : ''}>${esc(c.label)}</button>`).join('')}</div>
        ${swapHTML()}
        <label class="yp-f"><span class="lab">요청</span><textarea class="field" id="deAsk" rows="3" placeholder="예) 공문체로 다듬어 줘 · 학부모님이 읽기 쉽게 바꿔 줘 · 2번 항목을 한 줄로 줄여 줘">${esc(S.ask)}</textarea></label>
        <div class="row"><button class="btn primary" type="button" data-de="run"${d && !S.busy ? '' : ' disabled'}>${runLabel()}</button>
          <button class="btn text" type="button" data-de="undo"${S.hist.length && !S.busy ? '' : ' disabled'}>한 단계 되돌리기${S.hist.length ? ` (${S.hist.length})` : ''}</button></div>
        ${S.note ? `<p class="de-note"><b>AI</b> ${esc(S.note)}</p>` : ''}
        ${aiNoteHTML(NOTE)}
      </section>
    </div>
    ${prevHTML()}</div>`;
}
/* 다시 그려도 쓰던 칸(글 칸은 고르던 자리까지)·누른 단추에 초점을 둠. 그 단추가 없어지거나 막히면(다듬는 중) 요청 단추·칩은 요청 칸으로,
   줄 [되돌리기] 등은 [한 단계 되돌리기]로 */
function render() {
  if (!box || box.hidden) return;
  const a = document.activeElement, inBox = a && box.contains(a);
  const id = inBox && a.id ? a.id : '', sel = id && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  const key = inBox && !id ? ([...a.attributes].find(x => /^data-de(-chip|-revert)?$/.test(x.name)) || null) : null;
  keepFiles(box, () => { box.innerHTML = pageHTML(); }); // 파일 고르기 창이 열린 채 다시 그려도 고른 파일이 들어가게(core/keep-files.js)
  let n = id ? box.querySelector(`#${CSS.escape(id)}`) : key ? box.querySelector(`[${key.name}="${CSS.escape(key.value)}"]`) : null;
  if (key && (!n || n.disabled)) n = key.name === 'data-de-chip' || /^(run|undo|swap|swapClose)$/.test(key.value) ? box.querySelector('#deAsk')
    : box.querySelector('[data-de="undo"]:not([disabled])') || box.querySelector('[data-de="download"]:not([disabled])') || box.querySelector('#deAsk');
  if (n && !n.disabled) { n.focus({ preventScroll: true }); if (sel) try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
}

/* ---------- 누르기·입력 ---------- */
const mine = e => box && !box.hidden && e.target && box.contains(e.target);
document.addEventListener('click', e => {
  if (!mine(e)) return;
  const ch = e.target.closest('[data-de-chip]');
  if (ch && !ch.disabled) {
    if (ch.dataset.deChip === 'swap') {
      S.swap = S.swap ? null : guessSwap(S.items); render();
      const f = S.swap && box.querySelector(S.swap.from ? '#deTo' : '#deFrom');
      if (f) f.focus();
      return;
    }
    const c = CHIPS.find(x => x.id === ch.dataset.deChip), ta = box.querySelector('#deAsk');
    if (c && c.ask) { S.ask = c.ask; if (ta) { ta.value = c.ask; ta.focus(); } }
    return;
  }
  const rv = e.target.closest('[data-de-revert]');
  if (rv && !rv.disabled) { step(revertOne(S.items, +rv.dataset.deRevert)); render(); return; }
  const b = e.target.closest('[data-de]');
  if (!b || b.disabled) return;
  const k = b.dataset.de;
  if (k === 'pick') box.querySelector('#deFile').click();
  else if (k === 'run') run();
  else if (k === 'undo') { if (S.hist.length && !S.busy) { S.items = S.hist[S.hist.length - 1]; S.hist = S.hist.slice(0, -1); render(); } }
  else if (k === 'revertAll') { if (changesOf(S.items).length && !S.busy) { step(revertAll(S.items)); render(); toast('모두 원래 글로 되돌렸어요. [한 단계 되돌리기]로 다시 볼 수 있어요.', 5000); } }
  else if (k === 'download') download();
  else if (k === 'swap') doSwap();
  else if (k === 'swapClose') { S.swap = null; render(); }
  else if (k === 'new') newDoc();
});
document.addEventListener('change', e => {
  if (!mine(e) || e.target.id !== 'deFile') return;
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) addFile(f);
});
document.addEventListener('input', e => {
  if (!mine(e)) return;
  const el = e.target;
  if (el.id === 'deAsk') S.ask = el.value;
  else if ((el.id === 'deFrom' || el.id === 'deTo') && S.swap) S.swap[el.id === 'deFrom' ? 'from' : 'to'] = el.value;
});
document.addEventListener('keydown', e => {
  if (!mine(e) || e.key !== 'Enter' || e.isComposing) return;
  const el = e.target;
  if (el.id === 'deAsk' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  else if (el.id === 'deFrom' || el.id === 'deTo') { e.preventDefault(); doSwap(); }
});
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!box || !d || !d.dataset || d.dataset.deSame == null || !box.contains(d)) return;
  if (d.open) S.open.add(d.dataset.deSame); else S.open.delete(d.dataset.deSame);
}, true);

onEnter('etc', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'de-box'; section.append(box); }
  box.hidden = tab !== 'docedit';
  if (!box.hidden) render();
});
