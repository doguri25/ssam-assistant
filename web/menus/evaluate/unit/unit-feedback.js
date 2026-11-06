/* 단원평가 4단계 피드백 (스펙 2.2·3.3): 잘한 점·격려(AI, 글만), 학생별 미리 보기, 결과지 한글 파일·인쇄(한 쪽에 2명, 또는 번호별로 한 장씩), 번호별 복사.
   결과지 맞춤 복습 문제(스펙 2026-11-06 A): [복습 문제 만들기](AI는 평가 하나에 한 번, 문항 정보만)·「결과지에 복습 문제 넣기」·문항별 고치기 칸 */
import { toast, copyText } from '../../../core/ui.js';
import * as ai from '../../../core/ai.js';
import { aiRowHTML, pick } from '../../../core/ai-roles.js';
import { reviewJSON, notesReviewPrompt, normNotesReview, opinionHTML, reviewBar, REVIEW_FAIL } from '../../../core/ai-review.js';
import { exportButton, exportDoc, downloadsButton } from '../../../core/doc-export.js';
import { onePerPage, setOnePerPage } from '../../../core/slip-layout.js';
import { getTest, graded, makeTitle, feedbackOf, feedbackText } from './unit-model.js';
import { feedbackDoc } from './unit-docs.js';
import { feedbackPrompt, normFeedback, redoPrompt, normRedo } from './unit-ai.js';
import { ITEM_TYPES } from './unit-grade.js';
import { redoFor, redoWant, redoFit, redoTargets, redoBlocks, redoText, redoKind } from './unit-redo.js';
import { unitAccuracy, accuracyText } from '../grade-accuracy.js';
import { esc, AI_KEY, registerStep, inStep, cur, curId, saveOrWarn, refresh, getBox } from './unit.js';

let runId = null; // 잘한 점·격려를 쓰는 중인 평가
let redoRun = null, redoOpen = false; // 복습 문제를 만드는 중인 평가, 「복습 문제 고치기」를 펼쳤는지
const TYPE_NAME = Object.fromEntries(ITEM_TYPES), CIRC = '①②③④';
const rvState = {}; // 평가 id → 'busy' | 'fail' (검토 AI)
const FIELD = { good: '잘한 점', cheer: '격려 한마디' };
const openRv = s => (Array.isArray(s.rv) ? s.rv.filter(r => !r.done) : []);
const rvOf = (s, f) => openRv(s).find(r => r.field === f);

function wrongTable(t, s) {
  const f = feedbackOf(t, s);
  const rows = [
    ...f.wrong.map(w => ({ no: w.no, html: `<td>${w.no}번</td><td>${esc(w.content)}</td><td>${w.read ? esc(w.read) : '<span class="muted">(빈칸)</span>'}</td><td>${esc(w.answer)}</td><td>${esc(w.pages)}</td>` })),
    ...f.partial.map(p => { const it = t.key.items.find(i => i.no === p.no) || {}; return { no: p.no, html: `<td>${p.no}번</td><td>${esc(p.content)}</td><td>부분 점수 ${p.pts}/${p.points}</td><td>${esc(it.answer || '')}</td><td>${esc(it.pages || '')}</td>` }; })
  ].sort((a, b) => a.no - b.no);
  if (!rows.length) return '<p class="muted" style="margin:0">틀린 문항이 없어요. 모두 맞혔어요!</p>';
  return `<div class="un-fb-wrap"><table class="un-fb-t"><thead><tr><th>문항</th><th>평가 내용</th><th>내 답</th><th>정답</th><th>다시 볼 곳</th></tr></thead><tbody>${rows.map(r => `<tr>${r.html}</tr>`).join('')}</tbody></table></div>`;
}
/* 학생 카드의 복습 문제 줄: 넣는 문항 번호, 자리가 모자라 못 넣으면 그렇게 */
function redoWho(t, s, one = onePerPage()) {
  const want = redoWant(t, s);
  if (!want) return '';
  const got = redoFor(t, s, { one });
  return got.length ? `결과지 복습 문제: ${got.map(q => `${q.no}번`).join(' · ')}${got.length < want ? ' (자리가 모자라 덜 넣었어요)' : ''}` : '결과지 복습 문제: 자리가 모자라 넣지 못했어요';
}
function card(t, s) {
  const f = feedbackOf(t, s);
  return `<div class="yp-card un-fb" data-fbno="${s.no}">
    <div class="cls-card-h"><h3>${s.no}번 · ${f.score}/${f.total}점</h3><span class="row"><button class="btn text" type="button" data-un="fbRedo" data-no="${s.no}">다시 쓰기</button><button class="btn text" type="button" data-un="fbCopy" data-no="${s.no}">복사</button></span></div>
    ${wrongTable(t, s)}<p class="muted un-redo-who" data-redo-who="${s.no}">${esc(redoWho(t, s))}</p>
    ${['good', 'cheer'].map(f => { const r = rvOf(s, f); return `<label class="yp-f"><span class="lab">${FIELD[f]}</span><textarea class="field${r ? ' rv-mark' : ''}" data-fb="${s.no}-${f}" rows="2">${esc(s[f])}</textarea></label>${r ? `<div data-rv-for="${s.no}-${f}">${opinionHTML({ title: `${s.no}번 ${FIELD[f]}`, main: s[f], alt: r.fix, why: r.problem, use: `${s.no}-${f}`, keep: `${s.no}-${f}` })}</div>` : ''}`; }).join('\n    ')}
  </div>`;
}
const SLIP_NOTE = one => (one ? '결과지는 번호마다 한 장씩이라 자르지 않고 나눠 주면 돼요.' : '결과지는 한 쪽에 2명이라 가운데를 잘라 나눠 주면 돼요.');
/* 인쇄 틀의 복습 문제: 결과지 문서와 같은 블록으로, 정답(작은 글씨)은 학생 칸 맨 아래 */
function redoPrint(list) {
  const b = redoBlocks(list), ans = b.filter(x => x.type === 'small'), rest = b.filter(x => x.type !== 'small');
  return b.length ? `<div class="un-rq">${rest.map(x => `<p>${x.bold ? `<b>${esc(x.text)}</b>` : esc(x.text)}</p>`).join('')}</div>${ans.map(x => `<p class="un-ans">${esc(x.text)}</p>`).join('')}` : '';
}
/* 인쇄 틀: 학생마다 한 칸, 두 명마다(번호별로 한 장씩이면 한 명마다) 쪽 나눔 (CSS) */
function printHTML(t, list) {
  const title = makeTitle(t.meta), one = onePerPage();
  return `<div class="un-print${one ? ' one' : ''}">${list.map(s => {
    const f = feedbackOf(t, s);
    return `<section class="un-ps"><h2>${esc(title)} · ${s.no}번</h2><p><b>점수 ${f.score} / ${f.total}점</b></p>${wrongTable(t, s)}
      ${s.good ? `<p>잘한 점: ${esc(s.good)}</p>` : ''}${s.cheer ? `<p>한마디: ${esc(s.cheer)}</p>` : ''}${redoPrint(redoFor(t, s, { one }))}</section>`;
  }).join('')}</div>`;
}

/* ---------- 복습 문제 카드 ---------- */
const hasQ = q => !!(q && String(q.q || '').trim());
const redoCount = t => redoTargets(t).filter(it => hasQ(t.redo && t.redo.items && t.redo.items[it.no])).length;
function fitText(t, one = onePerPage()) {
  if (!redoCount(t)) return '';
  if (!(t.redo && t.redo.on)) return '결과지에 넣지 않아요';
  const f = redoFit(t, graded(t), { one });
  return `결과지에 넣은 학생 ${f.put}명${f.short ? ` · 자리가 모자라 덜 넣은 학생 ${f.short}명${one ? '' : ' (「번호별로 한 장씩」이면 더 들어가요)'}` : ''}`;
}
const edSummary = t => `복습 문제 고치기 (${redoCount(t)}/${redoTargets(t).length}문항)`;
function redoItemHTML(it, q = {}) {
  const kind = redoKind(it.type), at = f => `data-redo="${it.no}-${f}"`;
  const ch = kind === 'choice' ? `<div class="un-rq-chs">${[0, 1, 2, 3].map(i => `<label>${CIRC[i]}<input class="field" ${at('c' + i)} value="${esc((q.choices || [])[i] || '')}" aria-label="${it.no}번 복습 문제 보기 ${i + 1}"></label>`).join('')}</div>` : '';
  return `<div class="un-rq-it" data-redo-it="${it.no}"><div><b>${it.no}번 · ${esc(it.content)}</b> <span class="muted">${esc(TYPE_NAME[it.type] || '')} · 정답 ${esc(it.answer)}</span></div>
    <label class="yp-f"><span class="lab">물음</span><textarea class="field" ${at('q')} rows="2" placeholder="비우면 이 문항은 결과지에 넣지 않아요">${esc(q.q || '')}</textarea></label>${ch}
    <div class="un-rq-row"><label class="yp-f"><span class="lab">${kind === 'essay' ? '예시 답' : '정답'}</span><input class="field" ${at('answer')} value="${esc(q.answer || '')}"></label>
      <label class="yp-f"><span class="lab">풀이 (40자 안)</span><input class="field" ${at('explain')} maxlength="40" value="${esc(q.explain || '')}"></label></div></div>`;
}
function redoHTML(t) {
  const targets = redoTargets(t), items = (t.redo && t.redo.items) || {}, run = redoRun === t.id, n = redoCount(t);
  if (!targets.length) return '';
  return `<div class="yp-card un-redo">
      <div class="row"><button class="btn" type="button" data-un="redoAI"${run ? ' disabled' : ''}>${run ? '<span class="spin"></span>만드는 중…' : '복습 문제 만들기'}</button>
        <label class="switch"><input type="checkbox" data-redo-on${t.redo && t.redo.on ? ' checked' : ''}${n ? '' : ' disabled'}>결과지에 복습 문제 넣기</label>
        <span class="muted" id="unRedoFit">${esc(fitText(t))}</span></div>
      <p class="muted cls-note">틀린 문항마다 비슷한 문제를 하나씩 만들어, 학생마다 칸에 남는 자리만큼 최대 3개 넣어요(정답은 칸 맨 아래 작게). AI에는 문항 번호·평가 내용·영역·유형·정답·교과서 쪽만 보내요.</p>
      <details class="un-redo-ed"${redoOpen ? ' open' : ''}><summary>${esc(edSummary(t))}</summary>${targets.map(it => redoItemHTML(it, items[it.no])).join('')}</details>
    </div>`;
}
/* 다시 그리지 않고 복습 문제가 바뀐 곳만: 인쇄 틀·학생 카드 줄·넣은 학생 셈·스위치·고치기 머리 */
function syncRedo(box, t) {
  const p = box.querySelector('.un-print'); if (p) p.outerHTML = printHTML(t, graded(t));
  box.querySelectorAll('[data-redo-who]').forEach(el => { const s = t.students.find(x => x.no === Number(el.dataset.redoWho)); el.textContent = s ? redoWho(t, s) : ''; });
  const f = box.querySelector('#unRedoFit'); if (f) f.textContent = fitText(t);
  const sw = box.querySelector('[data-redo-on]'); if (sw) { sw.checked = !!(t.redo && t.redo.on); sw.disabled = !redoCount(t); }
  const sm = box.querySelector('.un-redo-ed > summary'); if (sm) sm.textContent = edSummary(t);
}
function step4HTML(t) {
  const list = graded(t), run = runId === t.id;
  if (!list.length) return '<div class="yp-card"><p class="muted" style="margin:0">먼저 3단계에서 채점해 주세요.</p></div>';
  const nRv = list.reduce((n, s) => n + openRv(s).length, 0), rs = rvState[t.id];
  const acc = accuracyText(unitAccuracy(t), { finished: t.done, graded: true });
  return `${aiRowHTML('notes')}${rs === 'busy' ? '<p class="muted rv-busy"><span class="spin"></span> 검토 AI가 잘한 점·격려를 살펴보고 있어요…</p>' : rs === 'fail' ? `<p class="rv-fail" role="status">${REVIEW_FAIL} 쓴 글은 그대로 쓸 수 있어요.</p>` : ''}${reviewBar(nRv, 'data-un="fbNextRv"')}<div class="yp-card">
      ${acc ? `<p class="muted un-acc" id="unAcc4" style="margin:0 0 8px">${esc(acc)}</p>` : ''}
      <div class="row"><button class="btn primary" type="button" data-un="fbAI"${run ? ' disabled' : ''}>${run ? '<span class="spin"></span>쓰는 중…' : '잘한 점·격려 쓰기'}</button>
        ${exportButton('data-un="fbHwpx"', { prefix: '결과지 · ' })}${downloadsButton()}<button class="btn" type="button" data-un="fbPrint">인쇄</button><button class="btn" type="button" data-un="fbCopyAll">모두 복사</button><label class="switch"><input type="checkbox" data-one-page${onePerPage() ? ' checked' : ''}>번호별로 한 장씩</label></div>
      <p class="muted cls-note">AI에는 번호·점수·평가 내용만 보내요. 학생이 쓴 답과 이름은 보내지 않아요. <span id="unSlipNote">${SLIP_NOTE(onePerPage())}</span></p>
    </div>
    ${redoHTML(t)}
    <div class="un-fbs">${list.map(s => card(t, s)).join('')}</div>
    ${printHTML(t, list)}`;
}

async function writeFeedback(only) {
  const id = curId(), t = getTest(id);
  if (!t) return;
  // 한 번에 한 평가만 씀: 쓰는 중이면 말없이 끝내지 않고 알림
  if (runId) { toast(runId === id ? '잘한 점·격려를 쓰는 중이에요. 끝난 뒤에 눌러 주세요.' : '다른 평가의 잘한 점·격려를 쓰는 중이에요. 끝난 뒤에 눌러 주세요.', 5000); return; }
  if (!ai.ready()) { toast(AI_KEY, 5000); return; }
  const list = graded(t).filter(s => (only != null ? s.no === only : !(s.good && s.cheer)));
  if (!list.length) { toast('모두 썼어요. 다시 쓰려면 학생마다 [다시 쓰기]를 눌러요.'); return; }
  runId = id; delete rvState[id]; refresh(id);
  const wrote = [];
  try {
    for (let i = 0; i < list.length; i += 10) {
      const chunk = list.slice(i, i + 10), nos = new Set(chunk.map(s => s.no));
      const res = normFeedback(await ai.generateJSON(feedbackPrompt(t, chunk), { task: 'notes', valid: v => Object.keys(normFeedback(v)).length > 0 }));
      const t2 = getTest(id);
      if (!t2) break;
      // 다시 쓰기(only)는 두 칸 모두, 아니면 빈 칸만 채움 (선생님이 쓴 글은 그대로)
      for (const s of t2.students) if (nos.has(s.no) && res[s.no]) {
        if ((only != null || !s.good) && res[s.no].good) { s.good = res[s.no].good; wrote.push([s.no, 'good', s.good]); }
        if ((only != null || !s.cheer) && res[s.no].cheer) { s.cheer = res[s.no].cheer; wrote.push([s.no, 'cheer', s.cheer]); }
        if (s.rv) s.rv = s.rv.filter(r => r.done || !wrote.some(w => w[0] === s.no && w[1] === r.field));
      }
      saveOrWarn(t2);
    }
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 해 보세요.' : ai.errorMessage(e && e.code, e), 6000);
  } finally { runId = null; refresh(id); }
  if (wrote.length) await reviewFeedback(id, wrote);
}
/* 검토 AI: 이번에 쓴 잘한 점·격려를 한 번에 봄 (번호·점수·글만). 고칠 칸만 학생의 rv에 */
async function reviewFeedback(id, wrote) {
  if (!pick('notes', 'review')) return;
  const t = getTest(id);
  if (!t) return;
  const score = no => { const s = t.students.find(x => x.no === no); if (!s) return ''; const f = feedbackOf(t, s); return `점수 ${f.score}/${f.total}`; };
  const entries = wrote.map(([no, field, text]) => ({ key: no, field, label: `${no}번 ${FIELD[field]} (${score(no)})`, text }));
  rvState[id] = 'busy'; refresh(id);
  const v = await reviewJSON('notes', notesReviewPrompt('feedback', entries), { valid: x => Array.isArray(x) || !!(x && Array.isArray(x.items)) });
  if (v && v.error) rvState[id] = 'fail'; else delete rvState[id];
  const t2 = getTest(id);
  if (v && !v.error && t2) {
    const sent = new Map(wrote.map(([no, f, text]) => [`${no}|${f}`, text]));
    for (const r of normNotesReview(v, [...sent.keys()])) {
      const s = t2.students.find(x => String(x.no) === r.key);
      // 검토하는 동안 선생님이 고친 칸은 의견을 버림
      if (!s || s[r.field] !== sent.get(`${r.key}|${r.field}`)) continue;
      s.rv = [...(s.rv || []).filter(x => x.field !== r.field), { field: r.field, problem: r.problem, fix: r.fix }];
    }
    saveOrWarn(t2);
  }
  refresh(id);
}
/* 복습 문제 만들기: 평가 하나에 AI 한 번, 아직 물음이 없는 문항만(선생님이 쓴 문항은 그대로). 만들면 「결과지에 넣기」가 켜짐 */
async function makeRedo() {
  const id = curId(), t = getTest(id);
  if (!t) return;
  if (redoRun) { toast(redoRun === id ? '복습 문제를 만드는 중이에요. 끝난 뒤에 눌러 주세요.' : '다른 평가의 복습 문제를 만드는 중이에요. 끝난 뒤에 눌러 주세요.', 5000); return; }
  if (!ai.ready()) { toast(AI_KEY, 5000); return; }
  const todo = redoTargets(t).filter(it => !hasQ(t.redo && t.redo.items && t.redo.items[it.no]));
  if (!todo.length) { toast('모두 만들었어요. 다시 만들려면 그 문항의 물음을 비우고 눌러요.', 5000); return; }
  redoRun = id; refresh(id);
  try {
    const res = normRedo(await ai.generateJSON(redoPrompt(t, todo), { task: 'notes', valid: v => Object.keys(normRedo(v, todo)).length > 0 }), todo);
    const t2 = getTest(id);
    if (t2) {
      const items = { ...((t2.redo && t2.redo.items) || {}) };
      let n = 0;
      // 기다리는 동안 선생님이 쓴 문항은 그대로
      for (const [no, q] of Object.entries(res)) if (!hasQ(items[no])) { items[no] = q; n++; }
      t2.redo = { ...(t2.redo || {}), on: true, items, at: Date.now() };
      saveOrWarn(t2);
      toast(n < todo.length ? `복습 문제 ${n}개를 만들었어요. ${todo.length - n}개는 만들지 못했어요. 칸에 직접 써도 돼요.` : `복습 문제 ${n}개를 만들었어요. 결과지에 넣었어요.`, 6000);
    }
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 해 보세요.' : ai.errorMessage(e && e.code, e), 6000);
  } finally { redoRun = null; refresh(id); }
}
/* 복습 문제 칸 고치기: 보기는 네 칸, 처음 쓰는 문제면 결과지에 넣기를 켬 */
function editRedo(box, el) {
  const [no, f] = el.dataset.redo.split('-'), t = cur(), it = t && t.key.items.find(i => i.no === Number(no));
  if (!it) return;
  const fresh = !t.redo;
  t.redo = { on: fresh || !!t.redo.on, items: {}, ...(t.redo || {}) };
  const q = { kind: redoKind(it.type), q: '', choices: [], answer: '', explain: '', ...(t.redo.items[no] || {}) }, v = el.value.trim();
  if (/^c\d$/.test(f)) { const c = [0, 1, 2, 3].map(i => (q.choices || [])[i] || ''); c[Number(f[1])] = v; q.choices = c.some(Boolean) ? c : []; }
  else q[f] = f === 'explain' ? v.slice(0, 40) : v;
  t.redo = { ...t.redo, items: { ...t.redo.items, [no]: q } };
  saveOrWarn(t); syncRedo(box, t);
}
function chooseRv(key, useRv) {
  const [no, f] = key.split('-'), t = cur(), s = t && t.students.find(x => x.no === Number(no));
  const r = s && rvOf(s, f);
  if (!r) return;
  if (useRv) s[f] = r.fix;
  s.rv = s.rv.map(x => (x === r ? { ...x, done: useRv ? 'review' : 'main' } : x));
  saveOrWarn(t); refresh(t.id);
}
async function saveHwpx(t) {
  try { toast(await exportDoc(feedbackDoc(t, graded(t), { one: onePerPage() }), `${makeTitle(t.meta)} 결과지`), 6000); }
  catch (e) { toast('파일을 저장하지 못했어요', 5000); }
}
async function copy(text) { toast((await copyText(text)) === false ? '복사하지 못했어요' : '복사했어요'); }
/* 복사 글: 결과지와 같은 복습 문제·정답 */
const fbText = (t, s) => feedbackText(t, s, redoText(redoFor(t, s, { one: onePerPage() })));

registerStep(4, { html: step4HTML });

document.addEventListener('click', e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inStep(4)) return;
  const u = e.target.closest('[data-rv-use]'), k = e.target.closest('[data-rv-keep]');
  if (u || k) { chooseRv((u || k).dataset[u ? 'rvUse' : 'rvKeep'], !!u); return; }
  const b = e.target.closest('[data-un]'), a = b && b.dataset.un;
  if (!a) return;
  const t = cur();
  if (a === 'fbNextRv') { const op = box.querySelector('.un-fbs .rv-op'); if (op) { op.scrollIntoView({ block: 'center', behavior: 'smooth' }); const x = op.querySelector('button'); if (x) x.focus({ preventScroll: true }); } }
  else if (a === 'fbAI') writeFeedback();
  else if (a === 'fbRedo') writeFeedback(Number(b.dataset.no));
  else if (a === 'fbHwpx') saveHwpx(t);
  else if (a === 'fbPrint') window.print();
  else if (a === 'redoAI') makeRedo();
  else if (a === 'fbCopy') { const s = t.students.find(x => x.no === Number(b.dataset.no)); if (s) copy(fbText(t, s)); }
  else if (a === 'fbCopyAll') copy(graded(t).map(s => fbText(t, s)).join('\n\n'));
});
document.addEventListener('change', e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inStep(4)) return;
  if (e.target.matches('[data-one-page]')) {
    // 화면은 다시 그리지 않고 안내 글과 인쇄 틀·복습 문제 줄만 바꿈(한 장씩이면 남는 자리가 달라짐)
    const one = e.target.checked;
    setOnePerPage(one);
    const n = box.querySelector('#unSlipNote'); if (n) n.textContent = SLIP_NOTE(one);
    syncRedo(box, cur());
    return;
  }
  if (e.target.matches('[data-redo-on]')) { const t = cur(); t.redo = { items: {}, ...(t.redo || {}), on: e.target.checked }; saveOrWarn(t); syncRedo(box, t); return; }
  if (e.target.dataset.redo) { editRedo(box, e.target); return; }
  if (!e.target.dataset.fb) return;
  const [no, k] = e.target.dataset.fb.split('-'), t = cur();
  const s = t.students.find(x => x.no === Number(no));
  if (!s) return;
  s[k] = e.target.value.trim();
  // 손으로 고친 칸의 검토 의견은 사라짐
  const had = !!rvOf(s, k);
  if (had) s.rv = s.rv.filter(r => r.done || r.field !== k);
  saveOrWarn(t);
  syncRedo(box, t); // 글 길이가 바뀌면 복습 문제가 들어갈 자리도 바뀜
  if (had) {
    // 글을 치는 중이면 화면 전체는 나중에 그리므로 그 의견만 바로 지움
    const op = box.querySelector(`[data-rv-for="${no}-${k}"]`); if (op) op.remove();
    e.target.classList.remove('rv-mark');
    refresh(t.id);
  }
});
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.un-redo-ed')) redoOpen = e.target.open; }, true);
