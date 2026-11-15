/* 평가 › 활동지 › [활동지 만들기] (스펙 2026-11-15-docedit-minutes-quiz §3): 고르기 → [만들기](AI 업무 plan) → 열린 문항(쓰기·그리기·생각 정리)과 ○·△ 기준 고치기
   ([이 문항 다시 만들기]·[문항 더하기]·[빼기]) → [이대로 활동지 만들기](문항·기준을 확정한 새 활동지를 엶 — 학생 활동지 스캔만 넣으면 지금처럼 채점),
   [학생 활동지 내려받기](한글·워드·PDF). 규칙·문서 모양은 activity-make.js, 고르기 칸은 make-pick.js. 학생 자료는 AI로 보내지 않음 */
import * as ai from '../../../core/ai.js';
import { toast } from '../../../core/ui.js';
import { aiRowHTML } from '../../../core/ai-roles.js';
import { introHTML, aiNoteHTML } from '../../../core/ui-parts.js';
import { exportButton, exportDoc, downloadsButton } from '../../../core/doc-export.js';
import { getSchool } from '../../../core/settings.js';
import { newPick, syncSubjects, pickHTML, pickEvent, pickValue } from '../make-pick.js';
import { unmaskItem } from '../make-scope.js';
import { KINDS, actPrompt, redoTaskPrompt, normTasks, normTask, taskWarn, taskProblems, sheetDoc, activityFrom } from './activity-make.js';
import { saveActivity } from './activity-model.js';
import { termOf } from './activity-read.js';
import { registerView, A, render, refresh, getBox, visible, openActivity, esc, SS } from './activity.js';

const M = { pick: null, tasks: [], scope: null, opts: null, title: '', busy: '', msg: '', note: '' };
const AI_KEY = '설정 › AI에서 키를 넣어 주세요';
const pick = () => M.pick || (M.pick = newPick({ kinds: KINDS, count: { min: 1, max: 10, d: 3 } }));
const inMaker = () => visible() && A.view === 'make';
const later = () => setTimeout(() => { if (inMaker()) refresh(); }, 0);
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const blank = no => ({ no, kind: 'write', type: 'write', ask: '', answer: '', ok: '', part: '' });
const renumber = () => { M.tasks = M.tasks.map((t, i) => ({ ...t, no: i + 1 })); };

/* 활동지 정보: 문항을 만든 범위(없으면 지금 고른 것). 차시는 활동지 칸처럼 번호만(「3/8」 → 「3」) */
function metaNow() {
  const v = M.scope ? { scope: M.scope } : pickValue(pick());
  const s = v.scope || { subject: pick().subject };
  const lesson = s.lesson && s.lesson !== '단원 전체' ? s.lesson.split(', ').map(x => x.split('/')[0]).join(', ') : '';
  const date = today();
  return { subject: s.subject || '', unit: s.unit || '', lesson, pages: s.pages || '', title: M.title.trim() || (s.titles && s.titles[0]) || '활동지', date, term: termOf(date, getSchool().breaks) };
}

/* ---------- 그리기 ---------- */
function taskHTML(t) {
  const f = (k, label, v, ph = '') => `<label class="mk-f"><span class="lab">${label}</span><textarea class="field" rows="2" data-mf="${k}" data-no="${t.no}" aria-label="${t.no}번 ${label}"${ph ? ` placeholder="${ph}"` : ''}>${esc(v)}</textarea></label>`;
  return `<li class="yp-card mk-item" data-mk-item="${t.no}">
    <div class="mk-ihead"><b class="mk-no">${t.no}번</b>
      <select class="field mk-type" data-mf="kind" data-no="${t.no}" aria-label="${t.no}번 종류">${KINDS.map(([k, l]) => `<option value="${k}"${k === t.kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <span class="grow"></span>
      <button class="btn text" type="button" data-mk="redo" data-no="${t.no}" aria-label="${t.no}번 문항 다시 만들기"${M.busy ? ' disabled' : ''}>이 문항 다시 만들기</button>
      <button class="btn text" type="button" data-mk="del" data-no="${t.no}" aria-label="${t.no}번 빼기"${M.busy ? ' disabled' : ''}>빼기</button></div>
    ${M.busy === `redo:${t.no}` ? '<p class="muted mk-busy"><span class="spin"></span> AI가 이 문항을 다시 만들고 있어요…</p>' : ''}
    ${f('ask', '묻는 말', t.ask)}${f('answer', '예시 답안', t.answer, t.kind === 'draw' ? '그림에 무엇이 있으면 되는지' : '')}
    <div class="mk-two">${f('ok', '○ 기준(잘함)', t.ok)}${f('part', '△ 기준(조금 더)', t.part)}</div>
    <p class="mk-warn" data-mk-warn="${t.no}" role="status">${esc(taskWarn(t))}</p>
  </li>`;
}
function html() {
  const S = syncSubjects(pick()), n = M.tasks.length;
  const head = `<div class="un-top"><button class="btn text" type="button" data-ac="back">‹ 목록</button><b class="un-title">활동지 만들기</b></div>
    ${introHTML('activity-make', '진도표 차시를 고르면 AI가 쓰기·그리기·생각 정리 문항과 ○·△ 기준을 만들어요. [이대로 활동지 만들기]를 누르면 기준이 정해진 활동지가 생겨서, 학생 활동지 스캔만 넣으면 채점해요.')}`;
  const card = `<div class="yp-card mk-card"><h3>무엇으로 만들까요</h3>${pickHTML(S)}${aiRowHTML('plan')}
    ${aiNoteHTML('AI에는 교과·학년, 고른 차시(단원·차시 이름·교과서 쪽)나 직접 쓴 범위, 문항 수·종류·수준만 보내요. 직접 쓴 범위의 교직원 이름·전화번호는 가려 보내요. 학생 이름·활동지 같은 학생 자료는 보내지 않아요.')}
    <div class="row"><button class="btn primary" type="button" data-mk="make"${M.busy ? ' disabled' : ''}>${n ? '처음부터 다시 만들기' : '만들기'}</button>
      ${M.busy === 'make' ? '<span class="muted" id="mkBusy" role="status"><span class="spin"></span> AI가 활동지를 만들고 있어요…</span>' : ''}</div>
    ${M.msg ? `<div class="banner err" role="alert" id="mkMsg"><span class="grow">${esc(M.msg)}</span></div>` : ''}
    ${M.note ? `<div class="banner info" id="mkNote"><span class="grow">${esc(M.note)}</span></div>` : ''}</div>`;
  const list = n ? `<div class="yp-card mk-titlecard"><label class="yp-f mk-title"><span class="lab">활동 이름</span><input class="field" id="mkTitle" data-mf="title" value="${esc(M.title)}" autocomplete="off"></label></div>
    <ol class="mk-items" id="mkItems">${M.tasks.map(taskHTML).join('')}</ol>` : '';
  const probs = taskProblems(M.tasks);
  const done = `<div class="yp-card mk-done">
      <div class="row"><button class="btn" type="button" data-mk="add"${M.busy ? ' disabled' : ''}>문항 더하기</button></div>
      ${n ? `<p class="mk-probs" id="mkProbs"${probs.length ? '' : ' hidden'}>${esc(probs.map(p => `${p.no}번 ${p.text}`).join(' · '))}</p>
      <div class="row mk-out"><button class="btn primary" type="button" data-mk="create"${M.busy ? ' disabled' : ''}>이대로 활동지 만들기</button>
        ${exportButton('data-mk="sheet"', { prefix: '학생 활동지 · ' })}${downloadsButton()}</div>` : ''}</div>`;
  return head + card + list + done;
}

/* ---------- AI ---------- */
const failMsg = e => (e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e));
async function makeAll() {
  if (M.busy) return;
  const v = pickValue(pick());
  if (v.error) { M.msg = v.error; render(); return; }
  if (!ai.ready()) { M.msg = `AI 키가 없어 만들 수 없어요. ${AI_KEY}. [문항 더하기]로 직접 써도 돼요.`; render(); return; }
  M.busy = 'make'; M.msg = ''; M.note = ''; render();
  try {
    const out = await ai.generateJSON(actPrompt({ scope: v.scope, grade: v.grade, count: v.count, kinds: v.kinds, level: v.level }), { task: 'plan', valid: x => normTasks(x).length > 0 });
    M.tasks = normTasks(out, { count: v.count }).map(t => unmaskItem(v.scope.back, t));
    M.title = String((out && out.title) || '').trim().slice(0, 60) || (v.scope.titles && v.scope.titles[0]) || '';
    M.scope = v.scope; M.opts = { grade: v.grade, level: v.level };
    M.note = M.tasks.length < v.count ? `AI가 ${M.tasks.length}문항만 만들었어요. [문항 더하기]로 더할 수 있어요.` : '';
  } catch (e) { M.msg = failMsg(e); }
  M.busy = '';
  later();
}
function askRedoAll() {
  return new Promise(res => {
    let v = false;
    SS().openSheet(`<div id="mkRedoSheet"><h3>만든 문항이 있어요</h3><p class="muted" style="margin:0">처음부터 다시 만들면 고친 문항과 기준도 모두 바뀌어요.</p>
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
  if (!ai.ready()) { toast(AI_KEY, 5000); return; }
  const v = M.scope ? { scope: M.scope, grade: M.opts.grade, level: M.opts.level } : pickValue(pick());
  if (!v.scope) { M.msg = v.error || '범위를 골라 주세요.'; render(); return; }
  M.busy = `redo:${no}`; M.msg = ''; render();
  try {
    const out = await ai.generateJSON(redoTaskPrompt({ scope: v.scope, grade: v.grade, level: v.level, tasks: M.tasks, no }), { task: 'plan', valid: x => !!normTask(x) });
    const t = unmaskItem(v.scope.back, normTask(out)), i = M.tasks.findIndex(x => x.no === no);
    if (t && i >= 0) { M.tasks[i] = { ...t, no }; if (!M.scope) { M.scope = v.scope; M.opts = { grade: v.grade, level: v.level }; } }
  } catch (e) { M.msg = failMsg(e); }
  M.busy = '';
  later();
}

/* ---------- 활동지 만들기·문서 ---------- */
function create() {
  if (!M.tasks.length) return;
  const probs = taskProblems(M.tasks);
  if (probs.length) { M.msg = `고칠 것이 있어요: ${probs.map(p => `${p.no}번 ${p.text}`).join(' · ')}`; render(); const b = getBox().querySelector('#mkMsg'); if (b) b.scrollIntoView({ block: 'center' }); return; }
  const a = activityFrom({ meta: metaNow(), tasks: M.tasks });
  if (!saveActivity(a)) { toast('저장 공간이 모자라 저장하지 못했어요. 설정 › 학년도에서 백업하고 지난 자료를 정리해 주세요.', 7000); return; }
  Object.assign(M, { tasks: [], scope: null, opts: null, title: '', busy: '', msg: '', note: '' });
  openActivity(a.id);
  getBox().scrollIntoView({ block: 'start' });
  toast('활동지를 만들었어요. 기준이 정해져 있어요 — 학생 활동지 스캔을 넣으면 채점해요.', 6000);
}
async function download() {
  if (!M.tasks.length) return;
  const meta = metaNow();
  try { toast(await exportDoc(sheetDoc(meta, M.tasks), `${meta.title} 학생 활동지`), 6000); } catch (e) { toast('파일을 저장하지 못했어요'); }
}

/* ---------- 고치기 ---------- */
function setWarn(no) {
  const box = getBox(), t = M.tasks.find(x => x.no === no);
  const w = box && box.querySelector(`[data-mk-warn="${no}"]`);
  if (w && t) w.textContent = taskWarn(t);
  const p = box && box.querySelector('#mkProbs'), probs = taskProblems(M.tasks);
  if (p) { p.textContent = probs.map(x => `${x.no}번 ${x.text}`).join(' · '); p.hidden = !probs.length; }
}
function edit(el, type) {
  if (el.dataset.mf === 'title') { M.title = el.value; return; }
  const no = Number(el.dataset.no), t = M.tasks.find(x => x.no === no), f = el.dataset.mf;
  if (!t) return;
  if (f === 'kind') { if (type !== 'change') return; t.kind = el.value; t.type = el.value === 'draw' ? 'draw' : 'write'; render(); return; }
  t[f] = el.value;
  setWarn(no);
}
const open = () => { M.msg = ''; if (M.pick && !M.tasks.length) M.pick = null; };

document.addEventListener('click', async e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inMaker()) return;
  const b = e.target.closest('[data-mk]');
  if (!b) return;
  const a = b.dataset.mk;
  if (a === 'make') { if (M.tasks.length && !(await askRedoAll())) return; makeAll(); }
  else if (a === 'redo') redoOne(Number(b.dataset.no));
  else if (a === 'del') { M.tasks = M.tasks.filter(x => x.no !== Number(b.dataset.no)); renumber(); render(); }
  else if (a === 'add') {
    M.tasks.push(blank(M.tasks.length + 1)); render();
    const q = getBox().querySelector(`[data-mk-item="${M.tasks.length}"] [data-mf="ask"]`); if (q) { q.focus(); q.scrollIntoView({ block: 'center' }); }
  } else if (a === 'create') create();
  else if (a === 'sheet') download();
});
const onField = type => e => {
  if (!inMaker() || !getBox().contains(e.target)) return;
  const el = e.target;
  if (el.dataset.mp) { if (pickEvent(pick(), el, type)) render(); return; }
  if (el.dataset.mf) edit(el, type);
};
document.addEventListener('input', onField('input'));
document.addEventListener('change', onField('change'));

registerView('make', { html, open });
