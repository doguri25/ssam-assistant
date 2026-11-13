/* 평가 › 기재 점검 (스펙 2026-11-13 §4): 교과 평어·창의적 체험활동·행동특성(고른 글·후보)·평가지 채점 평어·단원평가 교과 평어를
   AI 없이 규칙(check-rules.js)으로 훑어 고칠 곳을 보여 줌. 문제 낱말은 노란 표시 + 번호 기호(색만이 아님), 까닭은 같은 번호의 칩.
   [AI로 고치기]: 그 글 하나와 까닭만 보냄(이름은 ○○○, 학생 번호·출처는 보내지 않음, check-ai.js) → 고친 안을 나란히 → [바꾸기]를 눌러야 그 화면 저장소에 씀
   (옛 평가 화면은 window.SSAM.evalCheck 다리로 — 화면이 쥔 상태와 어긋나지 않게, 단원평가 평어는 unit-model). [그 글로 가기]는 그 탭·그 학생.
   화면에 올 때마다, 바꾼 뒤 바로 다시 점검. 각 화면의 [기재 점검] 단추(data-eval-check="py|cc|hk|gr|unit")는 이 탭을 그 화면 글로 걸러 엶 */
import { onEnter, go } from '../../../core/shell.js';
import * as ai from '../../../core/ai.js';
import * as store from '../../../core/store.js';
import { toast } from '../../../core/ui.js';
import { getPyeongeo, savePyeongeo } from '../unit/unit-model.js';
import { showPyeongeo } from '../unit/unit-results.js';
import { checkItems, KINDS, KIND_NAME } from './check-rules.js';
import { fixPrompt, normFix } from './check-ai.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SS = () => window.SSAM || {};
const SRC = [['py', '교과 평어'], ['cc', '창의적 체험활동'], ['hk', '행동특성'], ['gr', '평가지 채점'], ['unit', '단원평가 평어']];
const TAB = { py: 'pyeongeo', cc: 'cc', hk: 'hk', gr: 'gr', unit: 'unit' };
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const circ = n => CIRC[n] || `(${n + 1})`;
const SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/></svg>';
const PY = 'unit:pyeongeo:';

/* 화면 상태: kind·src 거르기, items 모은 글 [{ ref, src, label, text, who, group, limit }], res 점검 결과, fix 고친 안(ref → { from, text | busy | err }), hint AI 키 안내 */
const C = { kind: '', src: '', items: [], res: null, loading: false, seq: 0, fix: new Map(), hint: new Set() };
let box = null;
const visible = () => !!box && box.isConnected && !box.hidden && !box.closest('[hidden]');

/* ---------- 글 모으기 ---------- */
// 단원평가 교과 평어: 교과마다 unit:pyeongeo:<교과> 의 학생 글
function unitItems() {
  const out = [];
  for (const key of store.list(PY).sort((a, b) => a.localeCompare(b, 'ko'))) {
    const subject = key.slice(PY.length), v = getPyeongeo(subject);
    for (const [no, s] of Object.entries(v.students || {}).sort((a, b) => a[0] - b[0])) {
      if (s && s.text) out.push({ ref: `unit:${encodeURIComponent(subject)}:${Number(no)}`, src: 'unit', label: `단원평가 평어 · ${subject} · ${Number(no)}번`, who: Number(no), group: 'unit:' + subject, text: s.text });
    }
  }
  return out;
}
async function load() {
  const seq = ++C.seq;
  C.loading = true; draw();
  let items = [];
  try { const b = SS().evalCheck; if (b) items = await b.items(); } catch (e) {}
  try { items = items.concat(unitItems()); } catch (e) {}
  if (seq !== C.seq) return;
  C.items = items;
  C.res = checkItems(items.map(x => ({ id: x.ref, text: x.text, who: x.who, group: x.group, limit: x.limit })));
  // 그새 글이 바뀐 고친 안은 버림
  for (const [ref, f] of C.fix) { const x = item(ref); if (!x || x.text !== f.from) C.fix.delete(ref); }
  C.loading = false;
  draw();
}
const item = ref => C.items.find(x => x.ref === ref);
const issuesOf = ref => { const r = C.res && C.res.list.find(x => x.id === ref); return r ? r.issues : []; };

/* ---------- 그리기 ---------- */
/* 글 + 표시: 고칠 곳은 <mark>(노란 바탕·밑줄) 뒤에 번호 기호(①), 화면 읽기에는 「고칠 곳 1」 */
function marked(text, issues) {
  const t = String(text || ''), pts = new Set([0, t.length]);
  issues.forEach(i => { pts.add(i.start); pts.add(i.end); });
  const xs = [...pts].filter(n => n >= 0 && n <= t.length).sort((a, b) => a - b);
  let html = '';
  for (let k = 0; k < xs.length - 1; k++) {
    const a = xs[k], b = xs[k + 1], seg = esc(t.slice(a, b));
    html += issues.some(i => i.start <= a && i.end >= b) ? `<mark class="chk-hit">${seg}</mark>` : seg;
    issues.forEach((i, n) => { if (i.end === b) html += `<sup class="chk-n"><span aria-hidden="true">${circ(n)}</span><span class="sr-only">(고칠 곳 ${n + 1})</span></sup>`; });
  }
  return html;
}
function fixHTML(x, f) {
  if (!f) return '';
  if (f.busy) return '<p class="muted chk-busy" role="status"><span class="spin"></span>AI가 고치는 중이에요</p>';
  if (f.err) return `<p class="chk-err" role="alert">${esc(f.err)}</p>`;
  const left = issuesOf(x.ref).length ? checkItems([{ id: 'x', text: f.text, limit: x.limit }]).list[0].issues : [];
  return `<div class="chk-fix" role="group" aria-label="고친 안">
      <div class="chk-col"><small class="lab">지금 글</small><p>${esc(x.text)}</p></div>
      <div class="chk-col chk-new"><small class="lab">고친 안</small><p>${marked(f.text, left)}</p>${left.length ? `<p class="muted chk-left">고친 안에도 고칠 곳이 ${left.length}곳 있어요</p>` : ''}</div>
    </div>
    <div class="row chk-acts"><button class="btn primary" type="button" data-chk-apply>바꾸기</button><button class="btn" type="button" data-chk-keep>그대로 두기</button></div>`;
}
function rowHTML(x, issues) {
  return `<li class="chk-row" data-chk-ref="${esc(x.ref)}">
    <b class="chk-src">${esc(x.label)}</b>
    <p class="chk-text">${marked(x.text, issues)}</p>
    <ul class="chk-why" aria-label="고칠 까닭">${issues.map((i, n) => `<li class="chip warn"><span aria-hidden="true">${circ(n)}</span><span class="sr-only">고칠 곳 ${n + 1}: </span>${esc(i.why)}</li>`).join('')}</ul>
    <div class="row chk-acts"><button class="btn" type="button" data-chk-ai${C.fix.get(x.ref) && C.fix.get(x.ref).busy ? ' disabled' : ''}>${SPARK}AI로 고치기</button><button class="btn text" type="button" data-chk-go>그 글로 가기</button></div>
    ${C.hint.has(x.ref) ? '<p class="muted chk-hint">AI 키가 없어요. 설정 › AI에서 키를 넣으면 고쳐 줘요. <button class="btn text" type="button" data-chk-set>AI 설정</button></p>' : ''}
    ${fixHTML(x, C.fix.get(x.ref))}
  </li>`;
}
function draw() {
  if (!box) return;
  const head = `<div class="m-head"><h2 tabindex="-1">기재 점검</h2><p class="muted">생기부에 쓰면 안 되는 말·부정 표현·이름·같은 문장·글자 수를 AI 없이 찾아요. 고친 안은 [바꾸기]를 눌러야 바뀌어요.</p></div>`;
  if (!C.res) { box.innerHTML = `<div class="m-page chk-page">${head}<p class="muted chk-sum" role="status"><span class="spin"></span>점검하는 중이에요</p></div>`; return; }
  const inSrc = C.items.filter(x => !C.src || x.src === C.src);
  const rows = inSrc.map(x => [x, issuesOf(x.ref)]).filter(([, l]) => l.length);
  const count = k => rows.reduce((n, [, l]) => n + l.filter(i => !k || i.kind === k).length, 0);
  const shown = rows.filter(([, l]) => !C.kind || l.some(i => i.kind === C.kind));
  const srcN = s => C.items.filter(x => x.src === s).length;
  const kinds = [['', '전체'], ...KINDS.map(k => [k, KIND_NAME[k]])];
  const focus = document.activeElement && box.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  box.innerHTML = `<div class="m-page chk-page">${head}
    <p class="chk-sum" role="status">점검한 글 ${inSrc.length}개 · 고칠 곳 ${count('')}곳${C.loading ? ' <span class="spin" aria-label="다시 점검하는 중"></span>' : ''}</p>
    <div class="chk-tools">
      <div class="seg chk-kinds" role="group" aria-label="고칠 곳 종류">${kinds.map(([k, l]) => `<button type="button" data-chk-kind="${k}" aria-pressed="${C.kind === k}">${l} <b class="num">${count(k)}</b></button>`).join('')}</div>
      <label class="chk-src-l"><span>화면</span><select class="field" id="chkSrc"><option value="">모든 화면</option>${SRC.map(([k, l]) => `<option value="${k}"${C.src === k ? ' selected' : ''}>${l} (${srcN(k)})</option>`).join('')}</select></label>
    </div>
    ${!inSrc.length ? `<div class="chk-empty"><p class="muted">점검할 글이 아직 없어요. ${C.src ? `${esc((SRC.find(s => s[0] === C.src) || [])[1])}에서` : '교과 평어·창체·행특·평가지 채점·단원평가 평어에서'} 글을 쓰면 여기서 살펴봐요.</p></div>`
      : !shown.length ? '<div class="chk-empty"><p class="muted">고칠 곳이 없어요.</p></div>'
        : `<ul class="chk-list">${shown.map(([x, l]) => rowHTML(x, l)).join('')}</ul>`}</div>`;
  if (focus) restore(focus);
}
// 다시 그린 뒤에도 누르던 단추·고르기 칸에 초점을 둠
const focusKey = el => { const r = el.closest('[data-chk-ref]'); const a = [...el.attributes].map(x => x.name).find(n => n.startsWith('data-chk')); return { ref: r && r.dataset.chkRef, attr: a, id: el.id, kind: el.dataset.chkKind }; };
function restore(f) {
  let el = null;
  if (f.id) el = box.querySelector('#' + f.id);
  else if (f.attr === 'data-chk-kind') el = box.querySelector(`[data-chk-kind="${f.kind}"]`);
  else if (f.ref) { const r = [...box.querySelectorAll('[data-chk-ref]')].find(x => x.dataset.chkRef === f.ref); el = r && (r.querySelector(`[${f.attr}]`) || r.querySelector('[data-chk-ai]')); }
  (el || box.querySelector('h2')).focus({ preventScroll: true });
}

/* ---------- 할 일 ---------- */
async function fix(ref) {
  const x = item(ref);
  if (!x) return;
  if (!ai.ready()) { C.hint.add(ref); draw(); return; }
  C.hint.delete(ref);
  C.fix.set(ref, { from: x.text, busy: true }); draw();
  let f;
  try {
    const v = await ai.generateJSON(fixPrompt({ text: x.text, issues: issuesOf(ref), src: x.src, limit: x.limit }), { task: 'writing', valid: v => !!normFix(v) });
    f = { from: x.text, text: normFix(v) };
  } catch (e) {
    f = { from: x.text, err: e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 해 보세요.' : ai.errorMessage(e && e.code, e) };
  }
  if (C.fix.has(ref)) C.fix.set(ref, f);
  if (visible()) draw();
}
function applyUnit(ref, from, to) {
  const [, sub, no] = ref.split(':'), subject = decodeURIComponent(sub);
  const v = getPyeongeo(subject), s = v.students && v.students[no];
  if (!s || s.text !== from) return false;
  return savePyeongeo(subject, { ...v, students: { ...v.students, [no]: { ...s, text: to } } }); // 근거(ev)는 그대로 → 「고친 글」
}
async function apply(ref) {
  const x = item(ref), f = C.fix.get(ref);
  if (!x || !f || !f.text) return;
  let ok = false;
  try { ok = x.src === 'unit' ? applyUnit(x.ref, f.from, f.text) : !!(SS().evalCheck && await SS().evalCheck.apply(x.ref, f.from, f.text)); } catch (e) {}
  C.fix.delete(ref);
  toast(ok ? '바꿨어요' : '그 글이 그새 바뀌었거나 쓰는 중이라 바꾸지 않았어요. 다시 점검했어요.', ok ? 2200 : 5000);
  await load();
}
async function goTo(ref) {
  const x = item(ref);
  if (!x) return;
  go('evaluate', TAB[x.src]);
  if (x.src === 'unit') { const [, sub, no] = x.ref.split(':'); showPyeongeo(decodeURIComponent(sub), Number(no)); }
  else if (SS().evalCheck) await SS().evalCheck.show(x.ref);
}

document.addEventListener('click', e => {
  // 각 화면의 [기재 점검] 단추: 그 화면 글만
  const ec = e.target.closest && e.target.closest('[data-eval-check]');
  if (ec) { C.src = SRC.some(s => s[0] === ec.dataset.evalCheck) ? ec.dataset.evalCheck : ''; C.kind = ''; go('evaluate', 'check'); return; }
  if (!box || !box.contains(e.target)) return;
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  const ref = b.closest('[data-chk-ref]') && b.closest('[data-chk-ref]').dataset.chkRef;
  if (b.dataset.chkKind != null) { C.kind = b.dataset.chkKind; draw(); }
  else if (b.hasAttribute('data-chk-ai')) fix(ref);
  else if (b.hasAttribute('data-chk-apply')) apply(ref);
  else if (b.hasAttribute('data-chk-keep')) { C.fix.delete(ref); draw(); }
  else if (b.hasAttribute('data-chk-go')) goTo(ref);
  else if (b.hasAttribute('data-chk-set')) go('settings', 'ai');
});
document.addEventListener('change', e => {
  if (!box || !box.contains(e.target) || e.target.id !== 'chkSrc') return;
  C.src = e.target.value; draw();
});

onEnter('evaluate', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'chk-box'; section.append(box); }
  box.hidden = tab !== 'check';
  if (tab === 'check') load();
});
