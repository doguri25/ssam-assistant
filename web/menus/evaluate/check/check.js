/* 평가 › 기재 점검 (스펙 2026-11-13 §4 · 새 모양 2026-11-14-eval-redesign §7): 교과 평어·창의적 체험활동·행동특성(고른 글·후보)·평가지 채점 평어·
   단원평가 교과 평어를 AI 없이 규칙(check-rules.js)으로 훑어 고칠 곳을 보여 줌.
   - 위 숫자 타일: 전체 · 쓰면 안 되는 말 · 같은 문장 · 이름·주어 · 글자 수 · 부정 표현(0이면 파랑 체크). 누르면 그 종류만(aria-pressed).
   - 종류별로 묶은 카드(check-view.js): 어디(… · n번 · n번째 문장)와 걸린 곳(노란 표시 + 번호 기호, 색만이 아님), 까닭 칩.
     고친 글이 있으면(AI로 고치기 결과, 또는 검토 AI가 이미 낸 고친 문장 — 다리의 fix) 지운 말·더한 말(check-diff.js)
     + [고친 글로 바꾸기] · [그대로 두기] · [그 글로 가기]. 없으면 [AI로 고치기]. 지금 글과 고친 글을 나란히 보는 칸도 접어 둠.
   - 같은 문장: 문장마다 한 카드(쓴 학생 번호 칩 — 누르면 그 글) + [학생마다 다르게 쓰기](한 명씩 차례로 AI로 고치기, 이름·번호는 보내지 않음).
   - 「그대로 두기」는 학년도 저장소 check:keep(check-keep.js)에 남아 다시 열어도 세지 않음.
   - 오른쪽 「나이스에 넣기 전 마지막 점검」: 살펴본 곳/전체 막대, 모든 학생 글이 있는지, 종류별 남은 수, 나이스 차례로 복사하는 화면으로 가기.
   [AI로 고치기]: 그 글 하나와 까닭만 보냄(이름은 ○○○, 학생 번호·출처는 보내지 않음, check-ai.js) → [고친 글로 바꾸기]를 눌러야 그 화면 저장소에 씀
   (옛 평가 화면은 window.SSAM.evalCheck 다리로 — 화면이 쥔 상태와 어긋나지 않게, 단원평가 평어는 unit-model). [그 글로 가기]는 그 탭·그 학생.
   화면에 올 때마다, 바꾼 뒤 바로 다시 점검. 각 화면의 [기재 점검] 단추(data-eval-check="py|cc|hk|gr|unit")는 이 탭을 그 화면 글로 걸러 엶 */
import { onEnter, go } from '../../../core/shell.js';
import * as ai from '../../../core/ai.js';
import * as store from '../../../core/store.js';
import { toast } from '../../../core/ui.js';
import { rosterAllowed } from '../../../core/student-no.js';
import { getPyeongeo, savePyeongeo } from '../unit/unit-model.js';
import { showPyeongeo } from '../unit/unit-results.js';
import { checkItems, overLimit } from './check-rules.js';
import { fixPrompt, normFix } from './check-ai.js';
import { wordDiff } from './check-diff.js';
import { TILE_KINDS, TILE_NAME, circ, shortWhy, sentLabel, markHTML, buildView, missingWriters, issueKey } from './check-view.js';
import { readKeep, addKeep, pruneKeep, clearKeep } from './check-keep.js';
import { introHTML, aiNoteHTML } from '../../../core/ui-parts.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SS = () => window.SSAM || {};
const SRC = [['py', '교과 평어'], ['cc', '창의적 체험활동'], ['hk', '행동특성'], ['gr', '평가지 채점'], ['unit', '단원평가 평어']];
const SRC_SHORT = { py: '교과 평어', cc: '창체', hk: '행동특성', gr: '평가지 채점', unit: '단원평가 평어' };
const TAB = { py: 'pyeongeo', cc: 'cc', hk: 'hk', gr: 'gr', unit: 'unit' };
const SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/></svg>';
const CHECK = '<svg class="chk-ok-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const PY = 'unit:pyeongeo:';
const LIMIT = 6; // 종류마다 처음 보이는 카드 수(나머지는 [n개 더 보기])
const OK_TEXT = { ban: '쓰면 안 되는 말이 없어요', dup: '같은 문장이 없어요', name: '이름·주어가 없어요', len: '글자 수를 넘은 글이 없어요', neg: '부정 표현이 없어요' };
const AI_NOTE = '[AI로 고치기]를 누른 글 하나와 고칠 까닭만 보내요. 이름은 ○○○로 가리고 학생 번호는 보내지 않아요. [학생마다 다르게 쓰기]도 한 명씩 따로 보내요. 고친 글은 [고친 글로 바꾸기]를 눌러야 바뀌어요.';

/* 화면 상태: kind·src 거르기, items 모은 글 [{ ref, src, label, text, who, group, limit, fix? }], res 점검 결과,
   fix 고친 안(ref → { from, text | busy | err }), hint AI 키 안내(ref 또는 같은 문장 카드 id), keep 그대로 둔 곳 열쇠,
   fixed 이번에 고친 곳 수(화면마다), more [더 보기]를 누른 종류, dupBusy 학생마다 다르게 쓰는 중인 같은 문장 카드, cards 그린 카드 → 그대로 둘 열쇠 */
const C = { kind: '', src: '', items: [], res: null, loading: false, seq: 0, fix: new Map(), hint: new Set(), keep: new Set(), fixed: {}, more: new Set(), dupBusy: new Set(), cards: new Map(), view: null };
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
  // 그대로 둔 곳: 읽은 글에서 이제 없는 곳은 지움(고쳤거나 그 문장이 바뀜)
  try {
    const live = new Set();
    for (const r of C.res.list) { const x = item(r.id); if (x) r.issues.forEach(i => live.add(issueKey(x.ref, x.text, i))); }
    pruneKeep(new Set(items.map(x => x.ref)), live);
  } catch (e) {}
  C.keep = readKeep();
  C.loading = false;
  draw();
}
const item = ref => C.items.find(x => x.ref === ref);
const issuesOf = ref => { const r = C.res && C.res.list.find(x => x.id === ref); return r ? r.issues : []; };
// 그대로 두지 않은 곳의 수(모든 화면) — 고친 수를 셀 때
const openTotal = () => buildView({ items: C.items, res: C.res, keep: C.keep }).counts[''];
/* 고친 안: AI로 고친 것이 먼저, 없으면 검토 AI가 이미 낸 고친 문장 */
function proposal(x) {
  if (!x) return null;
  const f = C.fix.get(x.ref);
  if (f) return f;
  const t = typeof x.fix === 'string' ? x.fix.replace(/\s+/g, ' ').trim() : '';
  return t && t !== x.text.replace(/\s+/g, ' ').trim() ? { from: x.text, text: t, legacy: true } : null;
}

/* ---------- 그리기 ---------- */
const locHTML = (label, extra) => esc(label).replace(/(^| · )(\d+번)(?= · |$)/, '$1<b>$2</b>') + (extra ? ` · ${esc(extra)}` : '');
const whyHTML = issues => `<ul class="chk-why" aria-label="고칠 까닭">${issues.map((i, n) => `<li class="chip warn"><span aria-hidden="true">${circ(n)}</span><span class="sr-only">고칠 곳 ${n + 1}: </span>${esc(i.why)}</li>`).join('')}</ul>`;
const busyHTML = '<p class="muted chk-busy" role="status"><span class="spin"></span>AI가 고치는 중이에요</p>';
const hintHTML = '<p class="muted chk-hint">AI 키가 없어요. 설정 › AI에서 키를 넣으면 고쳐 줘요. <button class="btn text" type="button" data-chk-set>AI 설정</button></p>';
const goBtn = '<button class="btn text" type="button" data-chk-go>그 글로 가기</button>';

/* 지운 말 / 더한 말 + 접어 둔 「나란히 보기」(지금 글 · 고친 글) */
function diffHTML(x, f) {
  const left = checkItems([{ id: 'x', text: f.text, limit: x.limit }]).list[0].issues;
  const ops = wordDiff(f.from, f.text);
  const line = ops.map(o => (o.op === 'eq' ? esc(o.t) : o.op === 'del' ? `<del><span class="sr-only">지운 말: </span>${esc(o.t)}</del>` : `<ins><span class="sr-only">더한 말: </span>${esc(o.t)}</ins>`)).join(' ');
  return `<div class="chk-diff" role="group" aria-label="${f.legacy ? '검토 AI가 고친 글' : 'AI가 고친 글'}">
      <p class="chk-dtext">${line}</p>
      <p class="chk-dnote">${f.legacy ? '검토 AI가 이미 고친 글이에요' : 'AI가 고친 글이에요'}${left.length ? ` · <b>고친 글에도 고칠 곳이 ${left.length}곳 있어요</b>` : ''}</p>
      <details class="chk-pair"><summary>지금 글과 나란히 보기</summary>
        <div class="chk-fix" role="group" aria-label="고친 안">
          <div class="chk-col"><small class="lab">지금 글</small><p>${esc(f.from)}</p></div>
          <div class="chk-col chk-new"><small class="lab">고친 안</small><p>${markHTML(f.text, left)}</p>${left.length ? `<p class="muted chk-left">고친 안에도 고칠 곳이 ${left.length}곳 있어요</p>` : ''}</div>
        </div></details>
    </div>`;
}
/* 고친 안이 있을 때의 단추 / 없을 때의 단추 */
function actsHTML(x, f, aiLabel) {
  if (f && f.text) return `<div class="row chk-acts"><button class="btn primary" type="button" data-chk-apply>고친 글로 바꾸기</button><button class="btn" type="button" data-chk-keep>그대로 두기</button>${goBtn}<button class="btn text" type="button" data-chk-ai>다시 고치기</button></div>`;
  const busy = !!(f && f.busy);
  return `<div class="row chk-acts"><button class="btn" type="button" data-chk-ai${busy ? ' disabled' : ''}>${SPARK}${esc(aiLabel || 'AI로 고치기')}</button><button class="btn" type="button" data-chk-keep>그대로 두기</button>${goBtn}</div>`;
}
const stateHTML = (key, f) => `${C.hint.has(key) ? hintHTML : ''}${f && f.busy ? busyHTML : ''}${f && f.err ? `<p class="chk-err" role="alert">${esc(f.err)}</p>` : ''}`;

/* 글·종류 하나의 카드 */
function cardHTML(c) {
  const x = item(c.ref), f = proposal(x);
  C.cards.set(c.id, c.issues.map(i => i.key));
  const tags = [...new Set(c.issues.map(shortWhy))].join(' · ');
  let len = '', aiLabel = '';
  if (c.kind === 'len') {
    const o = overLimit(x.text, x.limit), u = o && o.unit === 'byte' ? '바이트' : '자';
    if (o) {
      len = `<div class="chk-len"><div class="ev-bar turn" aria-hidden="true"><i style="width:100%"></i></div><span class="ev-num">${o.n.toLocaleString()} / ${o.max.toLocaleString()}${u}</span></div>`;
      aiLabel = `AI로 ${(o.n - o.max).toLocaleString()}${u} 줄이기`;
    }
  }
  const text = f && f.text ? diffHTML(x, f)
    : `<p class="chk-text">${c.pre ? '<span aria-hidden="true">… </span>' : ''}${markHTML(x.text, c.issues, c)}${c.post ? '<span aria-hidden="true"> …</span>' : ''}</p>`;
  return `<li class="chk-row" data-chk-ref="${esc(c.ref)}" data-chk-card="${esc(c.id)}">
    <div class="chk-loc"><span class="chk-src">${locHTML(x.label, sentLabel(c.nos, c.total))}</span><span class="chk-tag">${esc(tags)}</span></div>
    ${text}${len}${whyHTML(c.issues)}
    ${stateHTML(c.ref, f)}${actsHTML(x, f, aiLabel)}
  </li>`;
}
/* 같은 문장 카드 안 학생 한 명의 고친 안 */
function subHTML(x, f, keys, id, cls = 'chk-sub') {
  C.cards.set(id, keys);
  return `<li class="${cls}" data-chk-ref="${esc(x.ref)}" data-chk-card="${esc(id)}">
    <b class="chk-src">${locHTML(x.label)}</b>
    ${f && f.text ? diffHTML(x, f) : ''}${stateHTML(x.ref, f)}
    ${f && f.text ? actsHTML(x, f) : ''}
  </li>`;
}
/* 같은 문장 하나의 카드: 쓴 학생 번호 칩 + [학생마다 다르게 쓰기] */
function dupHTML(c) {
  C.cards.set(c.id, c.refs.map(r => r.key));
  const busy = C.dupBusy.has(c.id);
  const subs = c.refs.map(r => { const x = item(r.ref), f = C.fix.get(r.ref); return f ? subHTML(x, f, [r.key], 'dupsub:' + r.ref) : ''; }).join('');
  return `<li class="chk-row chk-dup" data-chk-dup="${esc(c.id)}" data-chk-card="${esc(c.id)}">
    <div class="chk-loc"><span class="chk-src">${esc(c.base)} · ${c.whos.length}명이 똑같이 씀</span><span class="chk-tag">같은 문장</span></div>
    <p class="chk-text"><mark class="chk-hit">${esc(c.text)}</mark></p>
    <div class="chk-whos"><span class="chk-whos-l">쓴 학생</span>
      <span class="chk-whos-b" role="group" aria-label="쓴 학생 번호(누르면 그 글)">${c.refs.map(r => `<button type="button" class="chk-who ev-num" data-chk-who="${esc(r.ref)}" aria-label="${esc(item(r.ref).label)} 글로 가기">${esc(r.who)}</button>`).join('')}</span><span class="chk-whos-l" aria-hidden="true">번</span></div>
    ${C.hint.has(c.id) ? hintHTML : ''}${busy ? '<p class="muted chk-busy" role="status"><span class="spin"></span>학생마다 차례로 고치는 중이에요</p>' : ''}
    <div class="row chk-acts"><button class="btn primary" type="button" data-chk-dupfix${busy ? ' disabled' : ''}>${SPARK}학생마다 다르게 쓰기</button><button class="btn" type="button" data-chk-keep>그대로 두기</button></div>
    ${subs ? `<ul class="chk-subs" aria-label="학생마다 고친 글">${subs}</ul>` : ''}
  </li>`;
}
/* 고친 안이 남았는데 고칠 곳이 없어진 글(같은 문장을 다른 학생 쪽에서 고친 뒤 등) — 고친 안을 버리지 않고 보여 줌 */
function leftHTML(v) {
  if (C.kind && C.kind !== 'dup') return '';
  const rows = [];
  for (const [ref, f] of C.fix) {
    const x = item(ref), l = v.live.get(ref);
    if (!x || !l || l.open.length || x.text !== f.from) continue;
    rows.push(subHTML(x, f, [], 'left:' + ref, 'chk-row chk-sub'));
  }
  return rows.length ? `<section class="chk-group" data-chk-group="left"><h3 class="chk-gh">고친 글이 남은 글 · <span class="ev-num">${rows.length}</span></h3>
    <p class="chk-gsub">이제 고칠 곳은 없지만 AI가 고친 글이 있어요.</p><ul class="chk-list">${rows.join('')}</ul></section>` : '';
}
function groupHTML(g) {
  const all = C.kind === g.kind || C.more.has(g.kind), cards = all ? g.cards : g.cards.slice(0, LIMIT);
  const rest = g.cards.length - cards.length;
  return `<section class="chk-group" data-chk-group="${g.kind}" aria-labelledby="chkG-${g.kind}">
    <h3 class="chk-gh${g.kind === 'ban' ? ' turn' : ''}" id="chkG-${g.kind}">${TILE_NAME[g.kind]} · <span class="ev-num">${g.n}</span></h3>
    <ul class="chk-list">${cards.map(c => (c.kind === 'dup' ? dupHTML(c) : cardHTML(c))).join('')}</ul>
    ${rest > 0 ? `<button class="btn text chk-more" type="button" data-chk-more="${g.kind}">${TILE_NAME[g.kind]} ${rest}개 더 보기</button>` : ''}
  </section>`;
}
function tilesHTML(v) {
  const tile = (k, label, cls) => `<button type="button" class="ev-tile${cls}" data-chk-kind="${k}" aria-pressed="${C.kind === k}"><span class="ev-tl">${label}</span> <span class="ev-num">${v.counts[k]}${k && !v.counts[k] ? CHECK : ''}</span></button>`;
  return `<div class="ev-tiles chk-tiles" role="group" aria-label="고칠 곳 종류">${tile('', '전체', '')}${TILE_KINDS.map(k => tile(k, TILE_NAME[k], !v.counts[k] ? ' ok' : k === 'ban' ? ' turn' : '')).join('')}</div>`;
}
const nosText = l => (l.length > 8 ? `${l.slice(0, 8).join('·')}번 외 ${l.length - 8}명` : `${l.join('·')}번`);
/* 나이스에 넣기 전 마지막 점검 */
function finalHTML(v) {
  const fixed = Object.entries(C.fixed).reduce((n, [s, k]) => n + (!C.src || s === C.src ? k : 0), 0);
  const left = v.counts[''], done = fixed + v.kept, total = done + left;
  const w = missingWriters(v.shown, rosterAllowed());
  const gaps = w.gaps.slice(0, 3).map(g => `<span class="chk-gap">${esc(g.base)} ${nosText(g.missing)}</span>`).join('') + (w.gaps.length > 3 ? `<span class="chk-gap">외 ${w.gaps.length - 3}곳</span>` : '');
  const writers = !w.total ? '' : !w.gaps.length ? `<li>${CHECK}<span>${w.total}명 모두 글이 있어요</span></li>`
    : `<li><span class="chk-bang" aria-hidden="true">!</span><span>글이 없는 학생이 있어요${gaps}</span></li>`;
  const oks = TILE_KINDS.filter(k => !v.counts[k]).map(k => `<li>${CHECK}<span>${OK_TEXT[k]}</span></li>`).join('');
  const rest = TILE_KINDS.filter(k => v.counts[k]).map(k => `<li><span class="chk-bang" aria-hidden="true">!</span><span>${TILE_NAME[k]} <b class="ev-num">${v.counts[k]}</b>곳</span></li>`).join('');
  return `<section class="ev-ink-card chk-final" aria-labelledby="chkFinalH">
      <h3 id="chkFinalH">나이스에 넣기 전 마지막 점검</h3>
      <div class="chk-prog"><div class="ev-bar" role="progressbar" aria-label="살펴본 곳" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><i style="width:${total ? Math.round(done / total * 100) : 100}%"></i></div><span class="ev-num">${done} / ${total} 살펴봄</span></div>
      ${fixed || v.kept ? `<p class="chk-done">고친 곳 <b class="ev-num">${fixed}</b> · 그대로 둔 곳 <b class="ev-num">${v.kept}</b>${v.kept ? ' <button class="chk-linkbtn" type="button" data-chk-unkeep>그대로 둔 곳 다시 보기</button>' : ''}</p>` : ''}
      <ul class="chk-final-list">${writers}${oks}${rest}</ul>
      <button class="chk-neis" type="button" data-chk-neis>나이스 차례로 복사하러 가기</button>
      <p class="chk-neis-sub">창체·평가지 채점 화면의 [전체복사]로 나이스 학생 칸에 차례로 넣어요${left ? ` · 고칠 곳 ${left}곳을 먼저 살펴보세요` : ''}</p>
    </section>
    <p class="ev-sub chk-aiwhy">찾기는 AI 없이 해요. 고칠 때만 AI를 써요.</p>
    ${aiNoteHTML(AI_NOTE)}`;
}
function draw() {
  if (!box) return;
  const intro = introHTML('check', '생기부에 쓰면 안 되는 말·이름·같은 문장·글자 수를 AI 없이 찾아요.');
  const head = (sub, left) => `<div class="m-head m-head-row chk-head"><div class="chk-titles">
      <p class="chk-sum" role="status">${sub}</p>
      <h2 tabindex="-1">기재 점검${left}</h2>${intro}</div>
      ${C.res ? `<div class="m-head-act chk-head-acts"><label class="chk-src-l"><span>화면</span><select class="field" id="chkSrc"><option value="">모든 화면</option>${SRC.map(([k, l]) => `<option value="${k}"${C.src === k ? ' selected' : ''}>${l} (${C.items.filter(x => x.src === k).length})</option>`).join('')}</select></label>
        <button class="btn" type="button" data-chk-reload${C.loading ? ' disabled' : ''}>다시 점검</button></div>` : ''}</div>`;
  if (!C.res) { box.innerHTML = `<div class="m-page chk-page">${head('<span class="spin"></span>점검하는 중이에요', '')}</div>`; return; }
  const focus = document.activeElement && box.contains(document.activeElement) ? focusKey(document.activeElement) : null;
  const v = C.view = buildView({ items: C.items, res: C.res, keep: C.keep, src: C.src, kind: C.kind });
  C.cards = new Map();
  const srcs = SRC.map(([k]) => k).filter(k => v.shown.some(x => x.src === k)).map(k => SRC_SHORT[k]);
  const sub = `${v.texts ? `${srcs.join(' · ')} ${v.texts}편을 AI 없이 훑었어요` : '점검할 글이 아직 없어요'}${C.loading ? ' <span class="spin" aria-label="다시 점검하는 중"></span>' : ''}`;
  const n = v.counts[''];
  const left = v.texts ? ` <span class="chk-left${n ? ' turn' : ''}">· ${n ? `고칠 곳 ${n}곳` : '고칠 곳 없음'}</span>` : '';
  let main;
  if (!v.texts) {
    main = `<div class="chk-empty"><p class="muted">점검할 글이 아직 없어요. ${C.src ? `${esc((SRC.find(s => s[0] === C.src) || [])[1])}에서` : '교과 평어·창체·행특·평가지 채점·단원평가 평어에서'} 글을 쓰면 여기서 살펴봐요.</p></div>`;
    box.innerHTML = `<div class="m-page chk-page">${head(sub, left)}${main}</div>`;
  } else {
    const groups = v.groups.map(groupHTML).join('') + leftHTML(v);
    main = groups || `<div class="chk-empty"><p class="muted">${C.kind ? `${TILE_NAME[C.kind]}에 ` : ''}고칠 곳이 없어요.${v.kept ? ` 그대로 둔 곳 ${v.kept}곳은 세지 않았어요.` : ''}</p></div>`;
    box.innerHTML = `<div class="m-page chk-page">${head(sub, left)}${tilesHTML(v)}
      <div class="chk-body"><div class="chk-main">${main}</div><aside class="chk-aside" aria-label="나이스에 넣기 전">${finalHTML(v)}</aside></div></div>`;
  }
  if (focus) restore(focus);
}
// 다시 그린 뒤에도 누르던 단추·고르기 칸에 초점을 둠(카드가 없어지면 같은 자리의 다음 카드)
function focusKey(el) {
  const card = el.closest('[data-chk-card]');
  const attr = [...el.attributes].map(x => x.name).find(n => n.startsWith('data-chk'));
  const cards = [...box.querySelectorAll('[data-chk-card]')];
  return { card: card && card.dataset.chkCard, at: card ? cards.indexOf(card) : -1, attr, val: attr ? el.getAttribute(attr) : null, id: el.id };
}
function restore(f) {
  let el = null;
  if (f.id) el = box.querySelector('#' + CSS.escape(f.id));
  else if (f.card) {
    const cards = [...box.querySelectorAll('[data-chk-card]')], card = cards.find(x => x.dataset.chkCard === f.card);
    if (card) el = (f.attr && [...card.querySelectorAll(`[${f.attr}]`)].find(b => b.getAttribute(f.attr) === f.val && b.closest('[data-chk-card]') === card)) || card.querySelector('button:not([disabled])');
    else {
      // 그 카드가 없어짐(바꿈·그대로 둠) → 같은 자리의 다음 카드
      const next = cards[Math.min(f.at, cards.length - 1)], b = next && next.querySelector('button:not([disabled])');
      if (b) { b.focus(); return; }
    }
  } else if (f.attr) el = [...box.querySelectorAll(`[${f.attr}]`)].find(b => b.getAttribute(f.attr) === f.val);
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
/* 같은 문장: 쓴 학생마다 차례로(한 명씩 따로 보냄) */
async function dupFix(id) {
  const c = C.view && C.view.groups.flatMap(g => g.cards).find(x => x.id === id);
  if (!c || C.dupBusy.has(id)) return;
  if (!ai.ready()) { C.hint.add(id); draw(); return; }
  C.hint.delete(id);
  C.dupBusy.add(id); draw();
  try { for (const r of c.refs) { const f = C.fix.get(r.ref); if (f && (f.text || f.busy)) continue; await fix(r.ref); } }
  finally { C.dupBusy.delete(id); if (visible()) draw(); }
}
function applyUnit(ref, from, to) {
  const [, sub, no] = ref.split(':'), subject = decodeURIComponent(sub);
  const v = getPyeongeo(subject), s = v.students && v.students[no];
  if (!s || s.text !== from) return false;
  return savePyeongeo(subject, { ...v, students: { ...v.students, [no]: { ...s, text: to } } }); // 근거(ev)는 그대로 → 「고친 글」
}
async function apply(ref) {
  const x = item(ref), f = proposal(x);
  if (!x || !f || !f.text) return;
  const before = openTotal();
  let ok = false;
  try { ok = x.src === 'unit' ? applyUnit(x.ref, f.from, f.text) : !!(SS().evalCheck && await SS().evalCheck.apply(x.ref, f.from, f.text)); } catch (e) {}
  C.fix.delete(ref);
  toast(ok ? '바꿨어요' : '그 글이 그새 바뀌었거나 쓰는 중이라 바꾸지 않았어요. 다시 점검했어요.', ok ? 2200 : 5000);
  await load();
  if (ok) { C.fixed[x.src] = (C.fixed[x.src] || 0) + Math.max(0, before - openTotal()); draw(); }
}
/* 그대로 두기: 그 카드의 고칠 곳을 세지 않음(학년도 저장소에 남음), 고친 안은 버림 */
function keep(cardId, ref) {
  const keys = C.cards.get(cardId) || [];
  const refs = ref ? [ref] : (C.view.groups.flatMap(g => g.cards).find(c => c.id === cardId) || { refs: [] }).refs.map(r => r.ref);
  refs.forEach(r => { C.fix.delete(r); C.hint.delete(r); });
  if (keys.length) {
    if (!addKeep(keys)) toast('저장하지 못했어요. 다시 해 보세요.', 4000);
    C.keep = readKeep();
  }
  draw();
  toast(keys.length ? '그대로 뒀어요 · 고칠 곳으로 세지 않아요' : '그대로 뒀어요', 2600);
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
  const card = b.closest('[data-chk-card]'), cardId = card && card.dataset.chkCard;
  const ref = b.closest('[data-chk-ref]') && b.closest('[data-chk-ref]').dataset.chkRef;
  if (b.dataset.chkKind != null) { C.kind = C.kind === b.dataset.chkKind ? '' : b.dataset.chkKind; draw(); }
  else if (b.hasAttribute('data-chk-ai')) { C.fix.delete(ref); fix(ref); }
  else if (b.hasAttribute('data-chk-apply')) apply(ref);
  else if (b.hasAttribute('data-chk-keep')) keep(cardId, ref);
  else if (b.hasAttribute('data-chk-go')) goTo(ref);
  else if (b.dataset.chkWho) goTo(b.dataset.chkWho);
  else if (b.hasAttribute('data-chk-dupfix')) dupFix(cardId);
  else if (b.dataset.chkMore) { C.more.add(b.dataset.chkMore); draw(); }
  else if (b.hasAttribute('data-chk-unkeep')) { clearKeep(new Set(C.view.shown.map(x => x.ref))); C.keep = readKeep(); draw(); toast('그대로 둔 곳을 다시 보여요'); }
  else if (b.hasAttribute('data-chk-reload')) load();
  else if (b.hasAttribute('data-chk-neis')) go('evaluate', C.src === 'gr' ? 'gr' : 'cc');
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
