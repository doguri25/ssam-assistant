/* 평가 › 한눈에(스펙 2026-11-14-eval-redesign §1·§2).
   - 한눈에: 단원평가·활동지·평가지 채점마다 단계 칸(준비·채점·결과 확인·보충·생활기록부)에 카드, 확인할 것이 있으면 주황.
   - 가로 메뉴 끝 「선생님 차례 n」(확인할 것의 합, 0이면 없음) — 누르면 한눈에.
   - 생활기록부 칸 안 전환(교과 평어·창체·행특): 평가 칸 맨 위, 그 셋 중 하나일 때만.
   단계·확인 수 규칙은 eval-stage.js(순수). 학생 이름은 쓰지 않음(번호·수만) */
import { onEnter, go, REC } from '../../core/shell.js';
import { getSchool } from '../../core/settings.js';
import { STAGES, boardStage, unitStage, unitPending, activityStage, activityPending, grStage, grPending } from './eval-stage.js';
import { listTests, getTest, loadTests, getSet, getPyeongeo, graded } from './unit/unit-model.js';
import { flowSteps } from './unit/unit-flow.js';
import { normCut } from './unit/unit-gap.js';
import { openTest, openReview as openUnitReview } from './unit/unit.js';
import { listActivities, getActivity } from './activity/activity-model.js';
import { openActivity, openReview as openActivityReview } from './activity/activity.js';
import { listCamps, currentCampId } from '../class/camp-model.js';
import { getInfo } from '../class/class-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SSAM = () => window.SSAM || {};
const KIND = { unit: '단원평가', activity: '활동지', gr: '수행평가' };
const live = l => (Array.isArray(l) ? l : []).filter(s => s && !s.skip);
let box = null, sw = null, curTab = '';

/* 평가지 채점 기록(기존 앱이 ssam:grs·ssam:gr:<id>에 둠). 계정 저장소(db)면 여기서 읽지 못해 빼고 보임 */
function grRecords() {
  if (SSAM().storeMode && SSAM().storeMode() === 'db') return [];
  const read = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const ids = read('ssam:grs');
  return (Array.isArray(ids) ? ids : []).map(id => { const b = read('ssam:gr:' + id); return b && { ...b, id }; }).filter(Boolean);
}

function unitItems() {
  const sums = listTests(), real = sums.filter(s => !s.sample);
  const use = real.length ? real : sums; // 진짜 평가가 있으면 예시는 뺌
  const ctx = { tests: loadTests(sums.filter(s => s.done)), camps: listCamps(), cut: normCut(getSet().gapCut), breaks: getSchool().breaks || [], info: getInfo(), current: currentCampId() };
  return use.map(s => {
    const t = getTest(s.id);
    if (!t) return null;
    const steps = flowSteps(t, ctx), g = graded(t), m = live(t.students).length;
    const py = t.meta.subject ? getPyeongeo(t.meta.subject).students || {} : {};
    const pyDone = !!g.length && g.every(x => py[x.no] && py[x.no].text);
    const pending = unitPending(t), stage = boardStage(unitStage(t, steps, { pyDone }), pending);
    const first = steps.find(n => !n.done && !(t.meta.sample && ['gap', 'camp', 'post'].includes(n.id)));
    const line = stage === 'prep' ? (m ? '채점을 시작할 차례' : '학생 답안을 넣을 차례')
      : stage === 'grade' ? (pending ? `판단을 미룬 칸 ${pending}개` : g.length === m && !t.done ? '[채점 마치기]를 누를 차례' : '')
      : stage === 'record' ? (pyDone ? `판단을 미룬 칸 ${pending}개` : '교과 평어를 쓸 차례') : first ? `${first.label} · ${first.status}` : '';
    return { kind: 'unit', id: s.id, subject: '', title: s.title, stage, pending, line, n: g.length, m, at: s.at, sample: !!s.sample }; // 제목에 교과가 들어 있음
  }).filter(Boolean);
}
function activityItems() {
  return listActivities().map(s => {
    const a = getActivity(s.id);
    if (!a) return null;
    const m = live(a.students).length, n = live(a.students).filter(x => x.status === 'done').length;
    const pending = activityPending(a), stage = boardStage(activityStage(a), pending);
    const line = stage === 'prep' ? '학생 활동지를 넣을 차례' : stage === 'grade' ? (pending ? `판단을 미룬 칸 ${pending}개` : '')
      : stage === 'result' ? '결과를 보고 교과 평어로 넘길 차례' : `${pending ? `판단을 미룬 칸 ${pending}개 · ` : ''}교과 평어로 넘겼어요`;
    return { kind: 'activity', id: s.id, subject: s.subject, title: s.title || a.meta.title || '활동지', stage, pending, line, n, m, at: s.at };
  }).filter(Boolean);
}
function grItems() {
  return grRecords().map(b => {
    const st = live(b.students), m = st.length, n = st.filter(x => x.score != null).length, texts = st.filter(x => x.text).length;
    const pending = grPending(b), stage = boardStage(grStage(b), pending);
    const line = stage === 'prep' ? '평가지를 넣을 차례' : stage === 'grade' ? (pending ? `확인할 학생 ${pending}명` : '') : stage === 'result' ? (pending ? `확인할 학생 ${pending}명` : '평어를 쓸 차례')
      : `${pending ? `확인할 학생 ${pending}명 · ` : ''}평어 ${texts}/${m}명`;
    return { kind: 'gr', id: b.id, subject: '', title: b.title || '수행평가', stage, pending, line, n, m, at: b.createdAt || 0 };
  });
}
/* 모든 평가 카드(최근 것 먼저) */
export function boardItems() {
  const all = [...unitItems(), ...activityItems(), ...grItems()];
  return all.sort((a, b) => (b.at || 0) - (a.at || 0));
}
export const turnTotal = (items = boardItems()) => items.reduce((n, x) => n + (x.pending || 0), 0);
/* 가로 메뉴 「선생님 차례 n」용 가벼운 셈(단계는 셈하지 않음 — 끝난 평가는 확인할 것이 없으므로 같음) */
export function pendingTotal() {
  const sums = listTests(), real = sums.filter(s => !s.sample);
  const units = (real.length ? real : sums).reduce((n, s) => n + unitPending(getTest(s.id)), 0);
  const acts = listActivities().reduce((n, s) => n + activityPending(getActivity(s.id)), 0);
  return units + acts + grRecords().reduce((n, b) => n + grPending(b), 0);
}

/* ---------- 열기 ---------- */
function openItem(kind, id) {
  if (kind === 'unit') { go('evaluate', 'unit'); openTest(id); }
  else if (kind === 'activity') { go('evaluate', 'activity'); openActivity(id); }
  else if (kind === 'gr') { go('evaluate', 'gr'); if (SSAM().gr && SSAM().gr.open) SSAM().gr.open(id); }
}
/* 선생님 차례: 판단을 미룬 것만 하나씩 보는 확인 화면으로(단원평가·활동지·평가지 채점) */
function openTurn(kind, id) {
  if (kind === 'unit') { go('evaluate', 'unit'); openUnitReview(id); }
  else if (kind === 'activity') { go('evaluate', 'activity'); openActivityReview(id); }
  else if (kind === 'gr' && SSAM().gr && SSAM().gr.review) { go('evaluate', 'gr'); SSAM().gr.review(id); }
  else openItem(kind, id);
}

/* ---------- 그리기 ---------- */
const title = x => `${x.subject ? esc(x.subject) + ' ' : ''}「${esc(x.title || '(제목 없음)')}」`;
function cardHTML(x) {
  const prog = (x.stage === 'grade' || x.stage === 'prep') && x.m
    ? `<div class="eb-prog"><div class="ev-bar"><i style="width:${Math.round(x.n / x.m * 100)}%"></i></div><span><span>${x.kind === 'gr' ? '점수' : '채점'}</span><span class="ev-num">${x.n} / ${x.m}</span></span></div>` : '';
  return `<article class="eb-card${x.pending ? ' turn' : ''}" data-eb-kind="${x.kind}" data-eb-id="${esc(x.id)}">
    <span class="ev-chip eb-kind">${KIND[x.kind]}${x.sample ? ' · 예시' : ''}</span>
    <h4><button type="button" data-eb-open>${title(x)}</button></h4>
    ${x.line ? `<p class="eb-line">${esc(x.line)}</p>` : ''}${prog}
    ${x.pending ? `<button type="button" class="ev-turn-btn" data-eb-turn aria-label="선생님 차례 ${x.pending}개 확인">선생님 차례 · ${x.pending}개</button>` : ''}
  </article>`;
}
function emptyHTML() {
  return `<div class="ev-card eb-none"><p class="ev-h">아직 평가가 없어요</p>
    <p class="ev-sub" style="margin:0">단원평가 정답지나 활동지, 수행평가 평가지를 넣으면 여기 단계별로 모여요.</p>
    <div class="eb-acts"><button type="button" class="btn primary" data-eb-go="unit">단원평가 시작</button><button type="button" class="btn" data-eb-go="activity">활동지 넣기</button><button type="button" class="btn" data-eb-go="gr">평가지 채점 시작</button></div></div>`;
}
function render() {
  if (!box) return;
  const items = boardItems(), live2 = items.filter(x => x.stage !== 'done'), done = items.filter(x => x.stage === 'done');
  const turn = live2.filter(x => x.pending), total = turnTotal(live2);
  const head = `<div class="eb-head"><div><h2>평가 한눈에</h2><div class="ev-sub">진행 중인 평가 ${live2.length}개${done.length ? ` · 끝난 평가 ${done.length}개` : ''} · 파랑은 쌤비서가 한 일, 주황은 선생님 차례예요</div></div>
    <div class="eb-acts"><button type="button" class="btn" data-eb-go="activity">활동지 넣기</button><button type="button" class="btn primary" data-eb-go="unit">새 단원평가</button></div></div>`;
  if (!items.length) { box.innerHTML = `<div class="m-page eb-page">${head}${emptyHTML()}</div>`; return; }
  const band = turn.length ? `<div class="ev-band eb-band" role="region" aria-label="선생님 차례"><p><b>선생님 차례 ${total}개</b> · 쌤비서가 판단을 미룬 것만 봐 주세요</p>
    ${turn.slice(0, 4).map(x => `<button type="button" class="ev-turn-btn" data-eb-kind="${x.kind}" data-eb-id="${esc(x.id)}" data-eb-turn>${KIND[x.kind]} ${esc(x.title || '')} · ${x.pending}개</button>`).join('')}</div>` : '';
  const cols = STAGES.map(([id, label]) => {
    const list = live2.filter(x => x.stage === id);
    return `<section class="eb-col" aria-label="${label}"><h3 class="eb-col-h">${label}<span class="ev-num">${list.length}</span></h3>
      ${list.length ? list.map(cardHTML).join('') : '<p class="eb-empty">없어요</p>'}</section>`;
  }).join('');
  const fold = done.length ? `<details class="eb-done"><summary>끝난 평가 ${done.length}개 보기</summary><ul>${done.map(x => `<li><button type="button" data-eb-kind="${x.kind}" data-eb-id="${esc(x.id)}" data-eb-open>${KIND[x.kind]} · ${title(x)}</button></li>`).join('')}</ul></details>` : '';
  box.innerHTML = `<div class="m-page eb-page">${head}${band}<div class="eb-scroll"><div class="eb-cols">${cols}</div></div>${fold}</div>`;
}

/* 가로 메뉴 끝 「선생님 차례 n」 */
function drawPill() {
  const tabs = document.getElementById('menuTabs');
  if (!tabs) return;
  const old = tabs.querySelector('.ev-turn-pill');
  if (old) old.remove();
  let n = 0;
  try { n = pendingTotal(); } catch (e) { n = 0; }
  if (!n) return;
  tabs.insertAdjacentHTML('beforeend', `<button type="button" class="ev-turn-pill" data-tab="board" aria-label="선생님 차례 ${n}개 — 한눈에서 보기">선생님 차례 ${n}</button>`);
}

/* 생활기록부 칸 안 전환 */
const REC_LABEL = { pyeongeo: '교과 평어', cc: '창의적 체험활동', hk: '행동특성' };
const REC_SUB = { pyeongeo: '평가 결과로 교과 학습 발달 상황을 써요', cc: '자율·동아리·진로 활동 특기사항을 써요', hk: '관찰 메모로 행동특성 및 종합의견을 써요' };
function drawSwitch(section, tab) {
  if (!sw || !section.contains(sw)) {
    sw = document.createElement('div'); sw.className = 'rec-switch';
    section.prepend(sw);
  }
  sw.hidden = !REC.includes(tab);
  if (sw.hidden) return;
  sw.innerHTML = `<div class="rs-seg" role="group" aria-label="생활기록부 글">${REC.map(id => `<button type="button" data-rec-go="${id}" aria-pressed="${id === tab}">${REC_LABEL[id]}</button>`).join('')}</div>
    <span class="ev-sub">${REC_SUB[tab]}</span>`;
}

function enter(tab, section) {
  curTab = tab;
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'board-box'; section.append(box); }
  box.hidden = tab !== 'board';
  drawSwitch(section, tab);
  if (tab === 'board') render();
  drawPill();
}
if (typeof document !== 'undefined') {
  onEnter('evaluate', enter);
  document.addEventListener('eval:tab', e => {
    const sec = document.querySelector('section[data-menu="evaluate"]');
    if (sec && e.detail) enter(e.detail.tab, sec);
  });
  // 확인 화면·채점 표에서 칸을 정하면 「선생님 차례 n」을 다시 셈(평가 칸에서 누른 뒤 잠깐 뒤에 한 번)
  let pillTimer = 0;
  document.addEventListener('click', e => {
    const sec = e.target && e.target.closest && e.target.closest('section[data-menu="evaluate"]');
    if (!sec) return;
    clearTimeout(pillTimer);
    pillTimer = setTimeout(drawPill, 600);
  }, true);
  document.addEventListener('click', e => {
    const t = e.target;
    if (!t || !t.closest) return;
    const r = t.closest('.rec-switch [data-rec-go]');
    if (r) { go('evaluate', r.dataset.recGo); return; }
    const g = t.closest('.board-box [data-eb-go]');
    if (g) { go('evaluate', g.dataset.ebGo); return; }
    const host = t.closest('[data-eb-kind]');
    if (!host || !host.closest('.board-box')) return;
    if (t.closest('[data-eb-turn]')) openTurn(host.dataset.ebKind, host.dataset.ebId);
    else if (t.closest('[data-eb-open]')) openItem(host.dataset.ebKind, host.dataset.ebId);
  });
}
