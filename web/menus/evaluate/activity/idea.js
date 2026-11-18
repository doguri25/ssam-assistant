/* 평가 › 활동지 › [수업 아이디어] (스펙 2026-11-18-lesson-idea-design): 고르기(진도표 차시 — make-pick.js, 학급 화면은 고치지 않음) → [아이디어 만들기](AI 업무 plan)
   → 아이디어 카드(흐름·준비물·살펴볼 것) → [이 아이디어로 활동지 만들기](activity-maker startFromIdea)·[복사]·내려받기·[다시 만들기].
   최근 받은 아이디어 5묶음은 학년도 자료(activity:ideas). 규칙은 idea-make.js. 학생 자료는 AI로 보내지 않음 */
import * as ai from '../../../core/ai.js';
import { get, set } from '../../../core/store.js';
import { toast, copyText } from '../../../core/ui.js';
import { aiRowHTML } from '../../../core/ai-roles.js';
import { introHTML, aiNoteHTML } from '../../../core/ui-parts.js';
import { exportButton, exportDoc } from '../../../core/doc-export.js';
import { newPick, syncSubjects, pickHTML, pickEvent, pickValue } from '../make-pick.js';
import { unmaskItem } from '../make-scope.js';
import { ideaPrompt, normIdeas, ideaText, ideasDoc, ideaLine, FORMS } from './idea-make.js';
import { startFromIdea } from './activity-maker.js';
import { registerView, A, render, getBox, visible, esc } from './activity.js';

const KEY = 'activity:ideas', MAX = 5;
const I = { pick: null, ideas: [], meta: null, busy: false, msg: '' };
const pick = () => I.pick || (I.pick = newPick({ kinds: [], count: { min: 2, max: 5, d: 3 }, countLabel: '아이디어 수' }));
const inIdea = () => visible() && A.view === 'idea';
const later = () => setTimeout(() => { if (inIdea()) render(); }, 0);
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/* 최근 받은 아이디어: [{ id, at, meta, ideas }] 새것부터 5묶음(망가진 값은 버림) */
export function listIdeaSets() {
  const v = get(KEY, []);
  return (Array.isArray(v) ? v : []).filter(x => isObj(x) && typeof x.id === 'string' && Array.isArray(x.ideas))
    .map(x => ({ id: x.id, at: Number(x.at) || 0, meta: isObj(x.meta) ? x.meta : {}, ideas: normIdeas({ ideas: x.ideas }, { count: 5 }) })).filter(x => x.ideas.length);
}
const keepSet = (meta, ideas) => set(KEY, [{ id: 'id' + Date.now().toString(36), at: Date.now(), meta, ideas }, ...listIdeaSets()].slice(0, MAX));
const whereOf = m => [m.subject, m.unit, m.lesson && m.lesson !== '단원 전체' ? `${m.lesson}차시` : m.lesson].filter(Boolean).join(' ');
const md = at => { const d = new Date(at); return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}. ${d.getDate()}.` : ''; };

/* ---------- 그리기 ---------- */
function ideaHTML(i) {
  return `<li class="yp-card idea-card" data-idea="${i.no}">
    <div class="idea-head"><b class="idea-title">${i.no}. ${esc(i.title)}</b>${i.form ? `<span class="chip">${esc(i.form)}</span>` : ''}</div>
    ${i.summary ? `<p class="idea-sum">${esc(i.summary)}</p>` : ''}
    <ol class="idea-flow">${i.flow.map(f => `<li><b>${esc(f.stage)}${f.min ? ` <span class="muted">${f.min}분</span>` : ''}</b> ${esc(f.text)}</li>`).join('')}</ol>
    ${i.materials ? `<p class="muted idea-more">준비물: ${esc(i.materials)}</p>` : ''}
    ${i.look ? `<p class="muted idea-more">살펴볼 것: ${esc(i.look)}</p>` : ''}
    <div class="row"><button class="btn primary" type="button" data-ix="toAct" data-no="${i.no}"${I.busy ? ' disabled' : ''}>이 아이디어로 활동지 만들기</button>
      <button class="btn text" type="button" data-ix="copy" data-no="${i.no}">복사</button></div>
  </li>`;
}
function html() {
  const S = syncSubjects(pick()), n = I.ideas.length, sets = listIdeaSets();
  const head = `<div class="un-top"><button class="btn text" type="button" data-ac="back">‹ 목록</button><b class="un-title">수업 아이디어</b></div>
    ${introHTML('activity-idea', '진도표 차시를 고르면 AI가 서로 다른 수업 아이디어(흐름·준비물·살펴볼 것)를 내요. 마음에 드는 아이디어는 [이 아이디어로 활동지 만들기]로 ○·△ 기준까지 정해진 활동지가 돼요.')}`;
  const recent = sets.length ? `<div class="row idea-recent"><span class="muted">최근 수업 아이디어</span>${sets.map(s => `<button class="chip" type="button" data-ix="open" data-id="${esc(s.id)}">${esc(whereOf(s.meta) || '수업 아이디어')} · ${md(s.at)}</button>`).join('')}</div>` : '';
  const card = `<div class="yp-card mk-card"><h3>어느 차시의 수업인가요</h3>${pickHTML(S)}${aiRowHTML('plan')}
    ${aiNoteHTML('AI에는 교과·학년, 고른 차시(단원·차시 이름·교과서 쪽)나 직접 쓴 범위, 아이디어 수·수준만 보내요. 직접 쓴 범위의 교직원 이름·전화번호는 가려 보내요. 학생 자료는 보내지 않아요.')}
    <div class="row"><button class="btn primary" type="button" data-ix="make"${I.busy ? ' disabled' : ''}>${n ? '다시 만들기' : '아이디어 만들기'}</button>
      ${I.busy ? '<span class="muted" id="ixBusy" role="status"><span class="spin"></span> AI가 수업 아이디어를 내고 있어요…</span>' : ''}</div>
    ${I.msg ? `<div class="banner err" role="alert" id="ixMsg"><span class="grow">${esc(I.msg)}</span></div>` : ''}${recent}</div>`;
  const list = n ? `<div class="yp-card idea-where"><b>${esc(whereOf(I.meta || {}) || '수업 아이디어')}</b><span class="grow"></span>${exportButton('data-ix="doc"', { prefix: '아이디어 · ' })}</div>
    <ol class="idea-list" id="ixList">${I.ideas.map(ideaHTML).join('')}</ol>` : '';
  return head + card + list;
}

/* ---------- AI ---------- */
const failMsg = e => (e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e));
async function make() {
  if (I.busy) return;
  const v = pickValue(pick());
  if (v.error) { I.msg = v.error; render(); return; }
  if (!ai.ready()) { I.msg = 'AI 키가 없어 만들 수 없어요. 설정 › AI에서 키를 넣거나 시험용 AI를 써 주세요.'; render(); return; }
  I.busy = true; I.msg = ''; render();
  try {
    const out = await ai.generateJSON(ideaPrompt({ scope: v.scope, grade: v.grade, count: v.count, level: v.level }), { task: 'plan', valid: x => normIdeas(x).length > 0 });
    // 직접 쓴 범위에서 가린 이름의 자리 표시는 원래 이름으로(흐름 글까지)
    I.ideas = normIdeas(out, { count: v.count }).map(i => ({ ...unmaskItem(v.scope.back, i), flow: i.flow.map(f => unmaskItem(v.scope.back, f)) }));
    I.meta = { subject: v.scope.subject || '', unit: v.scope.unit || '', lesson: v.scope.lesson || '' };
    if (I.ideas.length < v.count) I.msg = `AI가 아이디어를 ${I.ideas.length}개만 냈어요.`;
    keepSet(I.meta, I.ideas);
  } catch (e) { I.msg = failMsg(e); }
  I.busy = false;
  later();
}

document.addEventListener('click', async e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inIdea()) return;
  const b = e.target.closest('[data-ix]');
  if (!b) return;
  const a = b.dataset.ix, idea = I.ideas.find(x => x.no === Number(b.dataset.no));
  if (a === 'make') make();
  else if (a === 'copy' && idea) copyText(ideaText(idea)).then(ok => toast(ok ? '복사했어요' : '복사하지 못했어요'));
  else if (a === 'toAct' && idea) startFromIdea({ pick: pick(), line: ideaLine(idea) });
  else if (a === 'doc' && I.ideas.length) {
    const d = ideasDoc(I.meta, I.ideas);
    try { toast(await exportDoc(d, d.title), 6000); } catch (err) { toast('파일을 저장하지 못했어요'); }
  } else if (a === 'open') {
    const s = listIdeaSets().find(x => x.id === b.dataset.id);
    if (s) { I.ideas = s.ideas; I.meta = s.meta; I.msg = ''; render(); }
  }
});
const onField = type => e => {
  if (!inIdea() || !getBox().contains(e.target)) return;
  const el = e.target;
  if (el.dataset.mp && pickEvent(pick(), el, type)) render();
};
document.addEventListener('input', onField('input'));
document.addEventListener('change', onField('change'));

registerView('idea', { html, open: () => { I.msg = ''; }, forms: FORMS });
