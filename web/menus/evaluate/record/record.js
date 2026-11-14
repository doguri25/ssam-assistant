/* 생활기록부 글 쓰기 틀(스펙 2026-11-14-eval-redesign §6) — 교과 평어·창체·행동특성이 같은 틀:
   왼쪽 학생 목록(번호 · 다 씀/초안/고칠 곳) · 가운데 그 학생 글(문장마다 근거 칩, 고칠 곳은 주황 + [고치기]) · 아래 글자 수와 단추 ·
   오른쪽 근거 목록(쓴 근거에 번호) + 아직 안 쓴 근거 + [이 근거로 문장 더하기].
   그리는 조각만 여기 두고(상태·저장·AI 부르기는 기존 화면 evaluate.js가 쥠), window.SSAM.record로 내보냄.
   evaluate.js는 모듈보다 먼저 돌아서, 준비되면(ssam:record-ready) 지금 화면을 한 번 다시 그림 */
import * as model from './record-model.js';
import * as ai from './record-ai.js';
import { evidenceRowsHTML } from '../../../core/evidence.js';
import { listTests, getPyeongeo, savePyeongeo, LEVEL_NAME } from '../unit/unit-model.js';
import { showPyeongeo } from '../unit/unit-results.js';
import { go } from '../../../core/shell.js';

/* ---------- 교과 평어 학생별: 단원평가 교과 평어(unit:pyeongeo:<교과>)를 읽고 그 자리에 고친 글을 씀(모양 그대로) ---------- */
const ko = (a, b) => a.localeCompare(b, 'ko');
// 단원평가 교과 평어 글이 있는 교과
export const pyUnitSubjects = () => [...new Set(listTests().map(s => s.subject).filter(Boolean))].filter(sub => Object.values(getPyeongeo(sub).students || {}).some(v => v && String(v.text || '').trim())).sort(ko);
export const pyUnit = sub => (sub ? getPyeongeo(sub) : { students: {} });
export function pyUnitSave(sub, no, { text, ev }) {
  const v = getPyeongeo(sub), cur = (v.students || {})[no] || {};
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  v.students = { ...(v.students || {}), [no]: { level: cur.level || '', text: t, manual: !!cur.manual, ...(ev && t ? { ev } : {}) } };
  return savePyeongeo(sub, v);
}
export const pyLevelName = k => LEVEL_NAME[k] || '';
// [AI로 다시 쓰기](단원평가 평어): 단원평가 결과 › 교과 평어로 넘기기의 그 학생 칸으로
export function pyOpenUnit(sub, no) { go('evaluate', 'unit'); showPyeongeo(sub, no); }

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const KIND = { unit: '단원평가', activity: '활동지', gr: '채점', ref: '참고', memo: '관찰 메모', act: '활동', sheet: '학습지' };

/* 왼쪽 학생 목록. items: [{ attr(누르는 단추의 data 속성), no, sub, st: { k, label }, cur, busy, cls }] */
export function listHTML({ items = [], doneN = 0, fixN = 0, total = 0, label = '학생', top = '', bottom = '' } = {}) {
  return `<div class="rw-lh"><span>다 씀 <b class="ev-num">${doneN}</b><small> / ${total}</small></span>${fixN ? `<span class="rw-lh-fix">고칠 곳 <b class="ev-num">${fixN}</b></span>` : ''}</div>
    ${top}
    <ul class="rw-stus" aria-label="${esc(label)}">${items.map(x => `<li><button type="button" class="rw-stu st-${esc(x.st.k)}${x.cls ? ' ' + x.cls : ''}" ${x.attr} aria-current="${!!x.cur}">
      <span class="rw-no ev-num">${esc(x.no)}번</span>${x.sub ? `<small class="rw-sub">${esc(x.sub)}</small>` : ''}<span class="st">${x.busy ? '<span class="spin"></span>' : ''}${esc(x.st.label)}</span></button></li>`).join('')}</ul>
    ${bottom}`;
}

/* 가운데 글 카드: 머리(어디 · 누구 · 칩) · seg(후보·출처 고르기) · note · body(문장 줄) · after · foot(글자 수·단추) · tools */
export function articleHTML({ cls = '', attrs = '', headCls = '', where = '', who = '', chips = '', seg = '', note = '', body = '', after = '', foot = '', tools = '' } = {}) {
  return `<article class="rw-art${cls ? ' ' + cls : ''}" ${attrs}>
    <header class="rw-head${headCls ? ' ' + headCls : ''}"><div class="rw-who"><span class="rw-where">${where}</span><b class="rw-name">${who}</b></div>${chips ? `<div class="rw-chips">${chips}</div>` : ''}</header>
    ${seg}${note}<div class="rw-body">${body}</div>${after}
    ${foot ? `<footer class="rw-foot">${foot}</footer>` : ''}${tools ? `<div class="rw-tools">${tools}</div>` : ''}
  </article>`;
}

/* 글자 수 줄: 「116 / 500자」 + 자세히(모자람·넘침) + 단추들 */
export function footHTML({ n = 0, max = 0, unit = '자', detail = '', warn = false, acts = '' } = {}) {
  return `<span class="rw-count"><b class="ev-num">${Number(n).toLocaleString()}</b><span>${max ? ` / ${Number(max).toLocaleString()}${esc(unit)}` : esc(unit)}</span></span>
    ${detail ? `<span class="rw-cdet${warn ? ' warn' : ''}">${esc(detail)}</span>` : ''}<span class="rw-grow"></span><span class="rw-acts">${acts}</span>`;
}

/* 문장 줄: rows(sentenceRows의 줄) → 칩·까닭·[고치기]·[문장 빼기]. acts(i, row) → 단추 html(고칠 곳만) */
export function rowsHTML({ rows = [], list = [], key = '', acts = null, label = '' } = {}) {
  return evidenceRowsHTML({
    key, list, label,
    rows: rows.map((r, i) => ({ t: r.t, src: r.src, bad: r.bad, why: [...(r.none ? ['이 문장을 받치는 근거가 없어요'] : []), ...r.issues.map(x => (!x.word || x.word === r.t ? x.why : `「${x.word}」 ${x.why}`))], acts: r.bad && acts ? acts(i, r) : '' }))
  });
}

/* 오른쪽 근거: uses(evidenceUse) — known이면 쓴 문장 번호, 아직 안 쓴 근거마다 [이 근거로 문장 더하기](addAttr(e) → data 속성, 없으면 단추 없음) */
export function sideHTML({ who = '', from = '', uses = [], known = false, addAttr = null, note = '', empty = '근거가 아직 없어요', ai: aiNote = 'AI에는 이름 없이 근거만 보내요.', busy = '' } = {}) {
  const spare = known ? uses.filter(e => !e.use.length) : [];
  const item = e => `<li class="${e.use.length ? 'used' : known ? 'spare' : ''}"><span class="rw-evn ev-num" aria-hidden="true">${e.n}</span><div class="rw-evt"><small>${esc(KIND[e.kind] || '참고')} ${e.n}${e.use.length ? ` · 문장 ${e.use.join('·')}에 씀` : known ? ' · 아직 안 씀' : ''}</small><span>${esc(e.label)}</span></div></li>`;
  const add = e => `<li><small>${esc(KIND[e.kind] || '참고')} ${e.n}</small><p>${esc(e.label)}</p>${addAttr ? `<button type="button" class="btn primary rw-add" ${addAttr(e)}${busy ? ' disabled' : ''}>${busy === e.id ? '<span class="spin"></span>쓰는 중' : '이 근거로 문장 더하기'}</button>` : ''}</li>`;
  return `<section class="rw-evs" aria-label="${esc(who)}의 근거">
      <div class="rw-evh"><h3>${esc(who)}의 근거</h3>${from ? `<span class="ev-sub">${esc(from)}</span>` : ''}</div>
      ${uses.length ? `<ol class="rw-evl">${uses.map(item).join('')}</ol>` : `<p class="ev-sub rw-evnone">${esc(empty)}</p>`}${note}
    </section>
    ${spare.length ? `<section class="rw-spare" aria-label="아직 안 쓴 근거"><h4>아직 안 쓴 근거</h4><ul>${spare.slice(0, 3).map(add).join('')}</ul>
      ${spare.length > 3 ? `<details class="rw-more"><summary>${spare.length - 3}개 더 보기</summary><ul>${spare.slice(3).map(add).join('')}</ul></details>` : ''}</section>` : ''}
    ${aiNote ? `<p class="rw-ai ev-sub">${esc(aiNote)}</p>` : ''}`;
}

/* 후보·출처 고르기 줄. opts: [{ attr, label, on }] */
export const segHTML = (label, opts) => (opts.length > 1 ? `<div class="rw-seg" role="group" aria-label="${esc(label)}">${opts.map(o => `<button type="button" ${o.attr} aria-pressed="${!!o.on}">${o.label}</button>`).join('')}</div>` : '');

if (typeof window !== 'undefined') {
  window.SSAM = window.SSAM || {};
  window.SSAM.record = { ...model, ...ai, KIND, listHTML, articleHTML, footHTML, rowsHTML, sideHTML, segHTML, esc, pyUnitSubjects, pyUnit, pyUnitSave, pyLevelName, pyOpenUnit };
  try { window.dispatchEvent(new Event('ssam:record-ready')); } catch (e) {}
}
