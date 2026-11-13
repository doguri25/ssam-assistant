/* 4단계 피드백 › 「틀린 까닭」 카드 (스펙 2026-11-13-miss-tour-check §1). unit-feedback.js의 step4HTML이 missHTML(t)로 부름(복습 문제 카드 아래).
   묶기·임시 번호·AI 답 정리·낡음은 unit-miss.js(화면 없음), 프롬프트는 unit-ai.js missPrompt, 문서는 unit-docs.js missDoc.
   [틀린 까닭 묶기]: 평가 하나에 AI 한 번(아직 AI로 묶지 않은 문항·채점이 바뀐 문항만), 문항마다 [다시 묶기]는 채점이 바뀐 문항에만.
   AI 키가 없으면 앱 묶음(고른 답·빈 답)만 보여 주고 활동 칸은 선생님이 써요. 이 카드의 일은 이 파일의 document 듣기만 함 */
import { toast, copyText } from '../../../core/ui.js';
import * as ai from '../../../core/ai.js';
import { exportButton, exportDoc } from '../../../core/doc-export.js';
import { getTest, makeTitle } from './unit-model.js';
import { ITEM_TYPES } from './unit-grade.js';
import { missView, missRequest, normMiss, missGot, mergeItem, missSig, setAct, missText, missHead, nosText, PENDING } from './unit-miss.js';
import { missPrompt } from './unit-ai.js';
import { missDoc } from './unit-docs.js';
import { esc, AI_KEY, inStep, cur, curId, saveOrWarn, refresh, getBox } from './unit.js';

let run = null, open = true; // 묶는 중인 평가 id, 묶음 목록을 펼쳤는지(이 화면에만)
const TYPE_NAME = Object.fromEntries(ITEM_TYPES);
const NOTE = 'AI에는 문항·정답·틀린 답 글만 보내요. 번호와 이름은 보내지 않아요.';
const tagOf = src => (src === 'manual' ? '<span class="chip">고친 활동</span>' : src === 'ai' ? '<span class="chip">AI</span>' : '');

function groupHTML(v, g, i) {
  return `<li class="un-miss-g" data-miss-g="${v.no}-${i}">
      <div class="un-miss-gh"><b>${esc(g.why)}</b> · ${g.nos.length}명 · ${esc(nosText(g.nos))} <span class="un-miss-tag">${tagOf(g.src)}</span></div>
      ${g.guess ? `<p class="muted un-miss-guess">짐작: ${esc(g.guess)}</p>` : ''}
      <label class="yp-f"><span class="lab">5분 보충 활동</span><textarea class="field" data-miss="${v.no}-${i}" rows="2" maxlength="200" placeholder="${g.act ? '' : '다음 시간에 5분 동안 할 일(무엇을·어떻게)'}" aria-label="${v.no}번 ${esc(g.why)} 5분 보충 활동">${esc(g.act)}</textarea></label>
    </li>`;
}
function itemHTML(v, busy) {
  const hint = ai.ready() ? '[틀린 까닭 묶기]를 누르면 AI가 까닭으로 묶어요.' : 'AI 키를 넣으면 AI가 까닭으로 묶어요.';
  return `<section class="un-miss-it" data-miss-it="${v.no}">
      <h4 class="un-miss-h">${esc(missHead({ ...v, stale: false }))} <span class="muted">${esc(TYPE_NAME[v.it.type] || '')}</span></h4>
      ${v.stale ? `<p class="un-miss-stale" role="status"><span aria-hidden="true">⚠</span> 채점이 바뀌었어요 · <button class="btn" type="button" data-un="missRe" data-no="${v.no}"${busy ? ' disabled' : ''}>다시 묶기</button></p>` : ''}
      <ul class="un-miss-gs">${v.groups.map((g, i) => groupHTML(v, g, i)).join('')}${v.pending.length ? `<li class="un-miss-g pending"><div class="un-miss-gh"><b>${PENDING}</b> · ${v.pending.length}명 · ${esc(nosText(v.pending))}</div><p class="muted un-miss-guess">${hint}</p></li>` : ''}</ul>
    </section>`;
}
/* 틀린 학생이 있는 문항이 없으면 그리지 않음 */
export function missHTML(t) {
  const view = missView(t), busy = run === t.id;
  if (!view.length) return '';
  const nG = view.reduce((n, v) => n + v.groups.length, 0);
  return `<div class="yp-card un-miss" id="unMiss">
      <div class="cls-card-h"><h3>틀린 까닭</h3><span class="muted">틀린 학생이 있는 문항 ${view.length}개</span></div>
      <div class="row"><button class="btn" type="button" data-un="missAI"${busy ? ' disabled' : ''}>${busy ? '<span class="spin"></span>묶는 중…' : '틀린 까닭 묶기'}</button>
        <button class="btn" type="button" data-un="missCopy">복사</button>${exportButton('data-un="missDoc"', { prefix: '틀린 까닭 · ' })}</div>
      <p class="muted cls-note">고른 답·빈 답은 앱이, 단답·서술형은 AI가 틀린 까닭으로 묶고 묶음마다 5분 보충 활동을 써요. ${NOTE}</p>
      ${ai.ready() ? '' : '<p class="muted un-miss-key">AI 키가 없어 고른 답·빈 답으로만 묶었어요. 활동 칸은 직접 써도 돼요.</p>'}
      <details class="un-miss-ed"${open ? ' open' : ''}><summary>문항 ${view.length}개 · 묶음 ${nG}개</summary>
        <div class="un-miss-list">${view.map(v => itemHTML(v, busy)).join('')}</div></details>
    </div>`;
}

/* [틀린 까닭 묶기](only 없음): 아직 AI로 묶지 않았거나 채점이 바뀐 문항을 AI 한 번에. [다시 묶기](only: 문항 번호): 그 문항만.
   AI 키가 없으면 [다시 묶기]는 앱 묶음만 지금 채점으로 다시(까닭 묶음은 지금도 틀린 학생만 남김) */
async function groupMiss(only = null) {
  const id = curId(), t = getTest(id);
  if (!t) return;
  if (run) { toast(run === id ? '틀린 까닭을 묶는 중이에요. 끝난 뒤에 눌러 주세요.' : '다른 평가의 틀린 까닭을 묶는 중이에요. 끝난 뒤에 눌러 주세요.', 5000); return; }
  const todo = missView(t).filter(v => (only != null ? v.no === only : !v.ai));
  if (!todo.length) { if (only == null) toast('모두 묶었어요. 채점이 바뀐 문항은 [다시 묶기]가 떠요.', 5000); return; }
  if (!ai.ready()) {
    if (only == null) { toast(AI_KEY, 5000); return; }
    const v = todo[0], items = { ...((t.miss && t.miss.items && typeof t.miss.items === 'object') ? t.miss.items : {}) };
    items[v.no] = mergeItem(t, v.it, v.saved ? items[v.no] : null, null);
    t.miss = { at: Date.now(), items };
    saveOrWarn(t); refresh(id);
    toast('고른 답·빈 답으로 다시 묶었어요. 단답·서술형 까닭은 AI 키를 넣으면 묶어요.', 6000);
    return;
  }
  const req = missRequest(t, todo.map(v => v.it)), sig0 = Object.fromEntries(todo.map(v => [v.no, missSig(t, v.it)]));
  run = id; refresh(id);
  try {
    const res = normMiss(await ai.generateJSON(missPrompt(t, req), { task: 'notes', valid: v => missGot(normMiss(v, req)) }), req);
    const t2 = getTest(id);
    if (t2) {
      const items = { ...((t2.miss && t2.miss.items && typeof t2.miss.items === 'object') ? t2.miss.items : {}) };
      let n = 0;
      for (const v of todo) {
        const it = t2.key.items.find(i => i.no === v.no);
        if (!it) continue;
        const old = items[v.no] && Array.isArray(items[v.no].groups) ? items[v.no] : null;
        const rec = mergeItem(t2, it, old, res[v.no] || null);
        if (rec.sig !== sig0[v.no]) { rec.sig = sig0[v.no]; rec.ai = false; } // 기다리는 동안 다시 채점했으면 낡은 표시가 남게
        items[v.no] = rec;
        if (res[v.no] && res[v.no].got) n++;
      }
      t2.miss = { at: Date.now(), items };
      saveOrWarn(t2);
      toast(n < todo.length ? `${n}문항을 묶었어요. ${todo.length - n}문항은 묶지 못했어요. 다시 눌러 보세요.` : `${n}문항의 틀린 까닭을 묶고 5분 활동을 썼어요.`, 6000);
    }
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 해 보세요.' : ai.errorMessage(e && e.code, e), 6000);
  } finally { run = null; refresh(id); }
}
async function saveDoc(t) {
  try { toast(await exportDoc(missDoc(t, missView(t)), `${makeTitle(t.meta)} 틀린 까닭`), 6000); }
  catch (e) { toast('파일을 저장하지 못했어요', 5000); }
}

document.addEventListener('click', async e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inStep(4)) return;
  const b = e.target.closest('[data-un]'), a = b && b.dataset.un, t = cur();
  if (!t) return;
  if (a === 'missAI') groupMiss();
  else if (a === 'missRe') groupMiss(Number(b.dataset.no));
  else if (a === 'missCopy') toast((await copyText(missText(t))) === false ? '복사하지 못했어요' : '복사했어요');
  else if (a === 'missDoc') saveDoc(t);
});
/* 활동 칸: 다시 그리지 않고 저장(src manual)하고 그 줄 표시만 「고친 활동」으로 */
document.addEventListener('change', e => {
  const box = getBox(), el = e.target;
  if (!box || !box.contains(el) || !inStep(4) || !el.dataset || !el.dataset.miss) return;
  const [no, i] = el.dataset.miss.split('-').map(Number), t = cur();
  if (!t) return;
  const next = setAct(t, no, i, el.value);
  if (next === t.miss) return;
  t.miss = next;
  saveOrWarn(t);
  const tag = el.closest('.un-miss-g') && el.closest('.un-miss-g').querySelector('.un-miss-tag');
  if (tag) tag.innerHTML = tagOf('manual');
});
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.un-miss-ed')) open = e.target.open; }, true);
