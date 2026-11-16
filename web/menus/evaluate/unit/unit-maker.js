/* 평가 › 단원평가 › [문항 만들기] (스펙 2026-11-15-docedit-minutes-quiz §3): 고르기 → [만들기](AI 업무 plan) → 문항 카드 고치기
   ([이 문항 다시 만들기]·[문항 더하기]·[빼기]) → [평가 만들기](정답이 채워진 새 단원평가를 1단계로 엶 — 학생 문제지 스캔만 넣으면 지금처럼 채점),
   [문제지 내려받기]·[정답지 내려받기](한글·워드·PDF). 규칙·문서 모양은 unit-make.js, 고르기 칸은 make-pick.js. 학생 자료는 AI로 보내지 않음 */
import * as ai from '../../../core/ai.js';
import { toast } from '../../../core/ui.js';
import { aiRowHTML } from '../../../core/ai-roles.js';
import { introHTML, aiNoteHTML } from '../../../core/ui-parts.js';
import { exportButton, exportDoc, downloadsButton } from '../../../core/doc-export.js';
import { newPick, syncSubjects, pickHTML, pickEvent, pickValue } from '../make-pick.js';
import { unmaskItem, maskList } from '../make-scope.js';
import { MAKE_TYPES, CIRCLED, makePrompt, redoPrompt, normMade, normOne, choiceAnswer, fixPoints, warnOf, problems, paperDoc, answerDoc, paperTitle, testFrom, madeItems } from './unit-make.js';
import { keyTotal } from './unit-key.js';
import { registerMaker, U, render, refresh, getBox, visible, saveOrWarn, openTest, cur, esc, SS, AI_KEY } from './unit.js';

/* 만드는 중인 문항(이 화면에만 — 저장은 [평가 만들기]로). scope·meta: 문항을 만든 범위(다시 만들기·문서·평가 정보에 씀) */
const M = { pick: null, items: [], scope: null, opts: null, busy: '', msg: '', note: '', ptsManual: false };
const pick = () => M.pick || (M.pick = newPick({ kinds: MAKE_TYPES, count: { min: 3, max: 20, d: 5 }, unitAll: true }));
const inMaker = () => visible() && U.view === 'make';
const later = () => setTimeout(() => { if (inMaker()) refresh(); }, 0);

/* 문항을 만든 범위(없으면 지금 고른 것) */
const valueNow = () => (M.scope ? { scope: M.scope, grade: M.opts && M.opts.grade } : pickValue(pick()));
/* 평가 정보: 그 범위의 교과·학년·단원·차시 */
function metaNow(v = valueNow()) {
  const s = v.scope || { subject: pick().subject };
  return { subject: s.subject || '', grade: v.grade || null, unitNo: s.unitNo ?? null, unitName: s.unitName || '', lesson: s.lesson || '' };
}
const blank = no => ({ no, type: 'short', question: '', choices: [], answer: '', content: '', domain: '', criteria: '', pages: '', points: 0 });
const renumber = () => { M.items = M.items.map((it, i) => ({ ...it, no: i + 1 })); };
const resplit = () => { if (!M.ptsManual) M.items = fixPoints(M.items); };

/* ---------- 그리기 ---------- */
function choiceHTML(it) {
  const ch = it.choices.length ? it.choices : ['', '', '', ''];
  const slots = Array.from({ length: 5 }, (_, i) => ch[i] || '');
  const opts = ['', ...CIRCLED].map(c => `<option value="${c}"${c === it.answer ? ' selected' : ''}>${c || '고르기'}</option>`).join('')
    + (it.answer && !CIRCLED.includes(it.answer) ? `<option value="${esc(it.answer)}" selected>${esc(it.answer)}</option>` : '');
  return `<div class="mk-choices">${slots.map((c, i) => `<label class="mk-ch"><span class="mk-cn" aria-hidden="true">${CIRCLED[i]}</span><input class="field" data-mf="choice" data-ci="${i}" data-no="${it.no}" value="${esc(c)}" aria-label="${it.no}번 보기 ${CIRCLED[i]}"${i === 4 ? ' placeholder="(없어도 돼요)"' : ''}></label>`).join('')}</div>
    <label class="mk-f mk-ans"><span class="lab">정답</span><select class="field" data-mf="answer" data-no="${it.no}" aria-label="${it.no}번 정답">${opts}</select></label>`;
}
function itemHTML(it) {
  const f = (k, label, v, tag = 'input', more = '') => `<label class="mk-f"><span class="lab">${label}</span>${tag === 'textarea'
    ? `<textarea class="field" rows="2" data-mf="${k}" data-no="${it.no}" aria-label="${it.no}번 ${label}"${more}>${esc(v)}</textarea>`
    : `<input class="field" data-mf="${k}" data-no="${it.no}" value="${esc(v)}" aria-label="${it.no}번 ${label}"${more}>`}</label>`;
  const busy = M.busy === `redo:${it.no}`, w = warnOf(it);
  return `<li class="yp-card mk-item" data-mk-item="${it.no}">
    <div class="mk-ihead"><b class="mk-no">${it.no}번</b>
      <select class="field mk-type" data-mf="type" data-no="${it.no}" aria-label="${it.no}번 유형">${MAKE_TYPES.map(([k, l]) => `<option value="${k}"${k === it.type ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label class="mk-pts"><input class="field" type="number" min="0" max="100" data-mf="points" data-no="${it.no}" value="${esc(it.points)}" aria-label="${it.no}번 배점"><span>점</span></label>
      <span class="grow"></span>
      <button class="btn text" type="button" data-mk="redo" data-no="${it.no}" aria-label="${it.no}번 문항 다시 만들기"${M.busy ? ' disabled' : ''}>이 문항 다시 만들기</button>
      <button class="btn text" type="button" data-mk="del" data-no="${it.no}" aria-label="${it.no}번 빼기"${M.busy ? ' disabled' : ''}>빼기</button></div>
    ${busy ? '<p class="muted mk-busy"><span class="spin"></span> AI가 이 문항을 다시 만들고 있어요…</p>' : ''}
    ${f('question', '물음', it.question, 'textarea')}
    ${it.type === 'choice' ? choiceHTML(it) : it.type === 'short' ? f('answer', '정답', it.answer, 'input', ' placeholder="맞는 답이 여럿이면 / 로 나눠요"')
    : f('answer', '예시 답안', it.answer, 'textarea') + f('criteria', '채점 기준', it.criteria, 'textarea', ' placeholder="예) 까닭 두 가지를 쓰면 만점, 하나면 절반"')}
    <div class="mk-meta3">${f('content', '평가 내용', it.content)}${f('domain', '영역', it.domain)}${f('pages', '교과서 쪽', it.pages)}</div>
    <p class="mk-warn" data-mk-warn="${it.no}" role="status">${esc(w)}</p>
  </li>`;
}
const sumText = () => { const t = keyTotal(M.items); return `${M.items.length}문항 · 배점 합 ${t}점${t !== 100 ? ' (100점이 아니에요)' : ''}`; };
function html() {
  const S = syncSubjects(pick()), n = M.items.length, making = M.busy === 'make';
  const head = `<div class="un-top"><button class="btn text" type="button" data-un="back">‹ 단원평가</button><b class="un-title">문항 만들기</b></div>
    ${introHTML('unit-make', '진도표 차시를 고르면 AI가 단원평가 문항을 만들어요. 고친 뒤 [평가 만들기]를 누르면 정답이 채워진 단원평가가 생겨서, 학생 문제지 스캔만 넣으면 채점해요.')}`;
  const pickCard = `<div class="yp-card mk-card" id="mkPickCard"><h3>무엇으로 만들까요</h3>${pickHTML(S)}${aiRowHTML('plan')}
    ${aiNoteHTML('AI에는 교과·학년, 고른 차시(단원·차시 이름·교과서 쪽)나 직접 쓴 범위, 문항 수·유형·수준만 보내요. 직접 쓴 범위의 교직원 이름·전화번호는 가려 보내요. 학생 이름·답안 같은 학생 자료는 보내지 않아요.')}
    <div class="row"><button class="btn primary" type="button" data-mk="make"${M.busy ? ' disabled' : ''}>${n ? '처음부터 다시 만들기' : '만들기'}</button>
      ${making ? '<span class="muted" id="mkBusy" role="status"><span class="spin"></span> AI가 문항을 만들고 있어요…</span>' : ''}</div>
    ${M.msg ? `<div class="banner err" role="alert" id="mkMsg"><span class="grow">${esc(M.msg)}</span></div>` : ''}
    ${M.note ? `<div class="banner info" id="mkNote"><span class="grow">${esc(M.note)}</span></div>` : ''}</div>`;
  const list = n ? `<ol class="mk-items" id="mkItems">${M.items.map(itemHTML).join('')}</ol>` : '';
  const probs = problems(M.items);
  const done = `<div class="yp-card mk-done"><div class="mk-sum"><b id="mkSum">${esc(sumText())}</b>${n ? `<button class="btn text" type="button" data-mk="split">배점 고르게 나누기</button>` : ''}</div>
      <p class="muted" style="margin:0">배점은 100점을 문항 수로 나누고 서술형은 두 배로 넣어요. 고쳐도 돼요.</p>
      <div class="row"><button class="btn" type="button" data-mk="add"${M.busy ? ' disabled' : ''}>문항 더하기</button></div>
      ${n ? `<p class="mk-probs" id="mkProbs"${probs.length ? '' : ' hidden'}>${esc(probs.map(p => `${p.no}번 ${p.text}`).join(' · '))}</p>
      <div class="row mk-out"><button class="btn primary" type="button" data-mk="create"${M.busy ? ' disabled' : ''}>평가 만들기</button>
        ${exportButton('data-mk="paper"', { prefix: '문제지 · ' })}${exportButton('data-mk="answers"', { prefix: '정답지 · ' })}${downloadsButton()}</div>` : ''}
    </div>`;
  return head + pickCard + list + done;
}

/* ---------- AI ---------- */
async function makeAll() {
  if (M.busy) return;
  const v = pickValue(pick());
  if (v.error) { M.msg = v.error; render(); return; }
  if (!ai.ready()) { M.msg = `AI 키가 없어 만들 수 없어요. ${AI_KEY}. [문항 더하기]로 직접 써도 돼요.`; render(); return; }
  M.busy = 'make'; M.msg = ''; M.note = ''; render();
  try {
    const out = await ai.generateJSON(makePrompt({ scope: v.scope, grade: v.grade, count: v.count, types: v.kinds, level: v.level }), { task: 'plan', valid: x => normMade(x).length > 0 });
    M.items = fixPoints(normMade(out, { count: v.count }).map(it => unmaskItem(v.scope.back, it)));
    M.scope = v.scope; M.opts = { grade: v.grade, level: v.level, count: v.count, kinds: v.kinds }; M.ptsManual = false;
    M.note = M.items.length < v.count ? `AI가 ${M.items.length}문항만 만들었어요. [문항 더하기]로 더할 수 있어요.` : '';
  } catch (e) { M.msg = e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e); }
  M.busy = '';
  later();
}
function askRedoAll() {
  return new Promise(res => {
    let v = false;
    SS().openSheet(`<div id="mkRedoSheet"><h3>만든 문항이 있어요</h3><p class="muted" style="margin:0">처음부터 다시 만들면 고친 문항도 모두 바뀌어요.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그대로 두기</button><button class="btn primary" type="button" id="mkRedoAllOk">다시 만들기</button></div></div>`,
    sh => sh.querySelector('#mkRedoAllOk').addEventListener('click', () => { v = true; SS().closeSheet(); }));
    const root = document.getElementById('sheetRoot');
    if (!root || !root.querySelector('#mkRedoSheet')) { res(true); return; }
    const obs = new MutationObserver(() => { if (!root.querySelector('#mkRedoSheet')) { obs.disconnect(); res(v); } });
    obs.observe(root, { childList: true, subtree: true });
  });
}
async function redoOne(no) {
  if (M.busy) return;
  if (!ai.ready()) { toast(`AI 키가 없어요. ${AI_KEY}`, 5000); return; }
  const v = M.scope ? { scope: M.scope, grade: M.opts.grade, level: M.opts.level } : pickValue(pick());
  if (!v.scope) { M.msg = v.error || '범위를 골라 주세요.'; render(); return; }
  M.busy = `redo:${no}`; M.msg = ''; render();
  try {
    const out = await ai.generateJSON(redoPrompt({ scope: v.scope, grade: v.grade, level: v.level, items: maskList(v.scope, M.items, ['question']), no }), { task: 'plan', valid: x => !!normOne(x) });
    const it = unmaskItem(v.scope.back, normOne(out)), i = M.items.findIndex(x => x.no === no);
    if (it && i >= 0) { M.items[i] = { ...it, no, points: M.items[i].points }; resplit(); if (!M.scope) { M.scope = v.scope; M.opts = { grade: v.grade, level: v.level }; } }
  } catch (e) { M.msg = e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e); }
  M.busy = '';
  later();
}

/* ---------- 평가 만들기·문서 ---------- */
function create() {
  const probs = problems(M.items);
  if (!M.items.length) return;
  if (probs.length) { M.msg = `고칠 것이 있어요: ${probs.map(p => `${p.no}번 ${p.text}`).join(' · ')}`; render(); const b = getBox().querySelector('#mkMsg'); if (b) b.scrollIntoView({ block: 'center' }); return; }
  // 평가 이름은 원래 이름, 만들 때 AI로 보낸 가린 단원 이름도 남겨 채점·피드백 AI로 보낼 때 씀(make-scope aiMeta)
  const v = valueNow();
  const t = testFrom({ meta: metaNow(v), items: M.items, ai: v.scope && v.scope.ai });
  if (!saveOrWarn(t)) return;
  Object.assign(M, { items: [], scope: null, opts: null, busy: '', msg: '', note: '', ptsManual: false });
  U.view = 'list'; U.from = 'list';
  openTest(t.id, 1);
  getBox().scrollIntoView({ block: 'start' });
  toast('단원평가를 만들었어요. 정답이 채워져 있어요 — 학생 문제지 스캔을 넣으면 채점해요.', 6000);
}
async function download(kind, items = M.items, meta = metaNow()) {
  if (!items.length) return;
  const name = `${paperTitle(meta)} ${kind === 'paper' ? '문제지' : '정답지'}`;
  try { toast(await exportDoc(kind === 'paper' ? paperDoc(meta, items) : answerDoc(meta, items), name), 6000); } catch (e) { toast('파일을 저장하지 못했어요'); }
}
/* 만든 평가의 1단계: 문제지·정답지를 다시 내려받는 줄(만든 물음·보기는 t.made에 둠) */
function paperRow(t) {
  if (!t || !t.made || !madeItems(t).length) return '';
  return `<div class="yp-card mk-made"><p class="muted" style="margin:0">[문항 만들기]로 만든 평가예요. 정답표가 채워져 있어요.</p>
    <div class="row">${exportButton('data-mk="madePaper"', { prefix: '문제지 · ' })}${exportButton('data-mk="madeAnswers"', { prefix: '정답지 · ' })}</div></div>`;
}

/* ---------- 고치기 ---------- */
function setWarn(no) {
  const box = getBox(), it = M.items.find(x => x.no === no);
  const w = box && box.querySelector(`[data-mk-warn="${no}"]`);
  if (w && it) w.textContent = warnOf(it);
  const p = box && box.querySelector('#mkProbs'), probs = problems(M.items);
  if (p) { p.textContent = probs.map(x => `${x.no}번 ${x.text}`).join(' · '); p.hidden = !probs.length; }
  const s = box && box.querySelector('#mkSum');
  if (s) s.textContent = sumText();
}
function edit(el, type) {
  const no = Number(el.dataset.no), it = M.items.find(x => x.no === no), f = el.dataset.mf;
  if (!it) return;
  if (f === 'type') {
    if (type !== 'change' || el.value === it.type) return;
    const was = it.type, text = was === 'choice' ? (it.choices[(choiceAnswer(it.answer, it.choices).codePointAt(0) || 0) - 0x2460] || '') : '';
    it.type = el.value;
    if (it.type === 'choice') { while (it.choices.length < 4) it.choices.push(''); it.answer = choiceAnswer(it.answer, it.choices); }
    else if (was === 'choice') it.answer = text;
    resplit(); render(); return;
  }
  if (f === 'choice') { const ci = Number(el.dataset.ci); while (it.choices.length <= ci) it.choices.push(''); it.choices[ci] = el.value; }
  else if (f === 'points') { it.points = Math.max(0, Math.min(100, Number(el.value) || 0)); M.ptsManual = true; }
  else it[f] = el.value;
  setWarn(no);
}

const open = () => { M.msg = ''; if (M.pick && !M.items.length) M.pick = null; };

document.addEventListener('click', async e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !visible()) return;
  const b = e.target.closest('[data-mk]');
  if (!b) return;
  const a = b.dataset.mk;
  if (a === 'madePaper' || a === 'madeAnswers') {
    const t = cur();
    if (t) download(a === 'madePaper' ? 'paper' : 'answers', madeItems(t), t.meta);
    return;
  }
  if (U.view !== 'make') return;
  if (a === 'make') { if (M.items.length && !(await askRedoAll())) return; makeAll(); }
  else if (a === 'redo') redoOne(Number(b.dataset.no));
  else if (a === 'del') { M.items = M.items.filter(x => x.no !== Number(b.dataset.no)); renumber(); resplit(); render(); }
  else if (a === 'add') {
    M.items.push(blank(M.items.length + 1)); resplit(); render();
    const q = getBox().querySelector(`[data-mk-item="${M.items.length}"] [data-mf="question"]`); if (q) { q.focus(); q.scrollIntoView({ block: 'center' }); }
  } else if (a === 'split') { M.ptsManual = false; resplit(); render(); }
  else if (a === 'create') create();
  else if (a === 'paper' || a === 'answers') download(a);
});
const onField = type => e => {
  if (!inMaker() || !getBox().contains(e.target)) return;
  const el = e.target;
  if (el.dataset.mp) { if (pickEvent(pick(), el, type)) render(); return; }
  if (el.dataset.mf) edit(el, type);
};
document.addEventListener('input', onField('input'));
document.addEventListener('change', onField('change'));

registerMaker({ html, open, paperRow });
