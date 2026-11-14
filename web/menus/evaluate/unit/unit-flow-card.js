/* 평가 › 단원평가: 평가를 연 화면의 단계 줄 (스펙 2026-11-14-eval-redesign §3-2, 옛 「평가 한 바퀴」 띠 자리). 4단계 탭 위(unit.js registerBand).
   - 가로 다섯 칸: 계획·문항 ✓ → 채점 n/m → 결과 확인 → 보충 → 생활기록부(unit-view.js testSteps). 끝난 칸 연파랑(✓), 지금 칸 파랑, 다음 칸 주황 테두리(「다음」 글자).
     평가 한 바퀴 마디(unit-flow.js)에서: 채점 → 채점, 틀린 까닭 → 결과 확인, 복습 문제·도달하지 못한 학생·기초학력·사전·사후 → 보충, 생활기록부 = 그 교과 평어를 채점한 학생 모두에게 씀.
     칸을 누르면 그 마디의 갈 곳(보충은 안 끝난 첫 마디), 계획·문항은 1단계, 생활기록부는 교과 평어로 넘기기(그 교과).
   - 그 아래 「평가 한 바퀴 2/6 · 다음: 틀린 까닭 ▸」 한 줄을 누르면 여섯 마디(옛 띠 그대로 — 기초학력·사전·사후로 바로 가는 곳, 이 실행 동안 펼친 채로 기억)
   - 다시 그리기: 화면을 다시 그릴 때마다 + 화면 전체를 다시 그리지 않는 칸 고치기·창의 단추 뒤에는 줄만 — 바뀐 것이 있을 때만, 단추의 초점은 지킴
   - 누르기(여섯 마디): 채점 → 3단계, 틀린 까닭·복습 문제 → 4단계 그 카드, 도달하지 못한 학생 → 결과 한 화면(이 평가의 교과·학기, 이 평가의 학생을 골라 둠),
     기초학력 → 학급 › 기초학력 그 학생이 든 프로그램의 기본 정보, 사전·사후 → 그 프로그램 결과 보고서 단계의 「사전·사후 점수」 카드.
     기초학력에 아무도 넣지 않았으면 두 마디는 넣는 곳(도달하지 못한 학생)으로 */
import { getSchool } from '../../../core/settings.js';
import { toast } from '../../../core/ui.js';
import { listTests, loadTests, getSet, getPyeongeo, graded } from './unit-model.js';
import { normCut } from './unit-gap.js';
import { flowSteps, flowAria } from './unit-flow.js';
import { testSteps } from './unit-view.js';
import { pickGap } from './unit-gap-card.js';
import { showResults, showPyeongeo } from './unit-results.js';
import { listCamps, currentCampId, setCurrentCamp } from '../../class/camp-model.js';
import { getInfo } from '../../class/class-model.js';
import { openCamp } from '../../class/camp.js';
import { U, esc, registerBand, cur, goStep, visible, getBox, reach } from './unit.js';

const stepsOf = t => flowSteps(t, {
  tests: loadTests(listTests().filter(s => s.done)), camps: listCamps(), cut: normCut(getSet().gapCut),
  breaks: getSchool().breaks || [], info: getInfo(), current: currentCampId()
});
/* 그 교과 평어를 쓴 채점한 학생 수·모두 썼는지 */
function pyOf(t) {
  const sub = t && t.meta && t.meta.subject, g = graded(t);
  if (!sub || !g.length) return { pyDone: false, pyCount: 0 };
  const py = getPyeongeo(sub).students || {}, n = g.filter(x => py[x.no] && py[x.no].text).length;
  return { pyDone: n === g.length, pyCount: n };
}
const fiveOf = t => testSteps(t, stepsOf(t), pyOf(t));

/* ---------- 다섯 칸 ---------- */
const stepName = s => (s.id === 'grade' && s.now ? '채점 중' : s.label);
const stepAria = s => [stepName(s), s.status, s.done ? '다 됨' : '', s.now ? '지금 할 차례' : '', s.next ? '다음 차례' : ''].filter(Boolean).join(', ');
function fiveHTML(steps) {
  return steps.map(s => `<li${s.done ? ' class="done"' : s.next ? ' class="next"' : ''}${s.now ? ' aria-current="step"' : ''}><button type="button" data-flow-step="${s.id}" aria-label="${esc(stepAria(s))}">
      <span class="ev-sl">${s.done ? '<span class="un-st-ck" aria-hidden="true">✓</span> ' : ''}${s.next ? '<span class="ev-st">다음</span> ' : ''}${esc(stepName(s))}</span>${s.status ? ` <span class="ev-sv">${esc(s.status)}</span>` : ''}</button></li>`).join('');
}

/* ---------- 여섯 마디(평가 한 바퀴, 접어 둠) ---------- */
function itemsHTML(nodes) {
  return nodes.map((n, i) => `<li class="un-flow-i"><button type="button" class="un-flow-b${n.done ? ' done' : ''}" data-flow="${n.id}" aria-label="${esc(flowAria(n))}"${n.now ? ' aria-current="step"' : ''}>
      <span class="un-flow-n">${esc(n.label)}${n.now ? ' <span class="un-flow-now">지금</span>' : ''}</span>
      <span class="un-flow-s">${n.done ? '<span class="un-flow-ck">✓</span> ' : ''}${esc(n.status)}</span></button>${i < nodes.length - 1 ? '<span class="un-flow-a" aria-hidden="true">→</span>' : ''}</li>`).join('');
}
/* 접힌 한 줄(스펙 2026-11-14-ui-tidy §3): 「평가 한 바퀴 2/6 · 다음: 틀린 까닭」(다 된 마디 수·지금 마디 이름), 다 끝났으면 「평가 한 바퀴 6/6 ✓」(글자로도 「다 됐어요」) */
function flowSummary(nodes) {
  const d = nodes.filter(n => n.done).length, now = nodes.find(n => n.now);
  return now ? `평가 한 바퀴 ${d}/${nodes.length} · 다음: ${now.label}` : `평가 한 바퀴 ${d}/${nodes.length} ✓`;
}
const sumHTML = nodes => `${esc(flowSummary(nodes))}${nodes.some(n => n.now) ? '' : '<span class="sr-only"> 다 됐어요</span>'}`;
/* 여섯 마디를 펼쳤는지: 기본은 접힌 한 줄 — 이 실행 동안 기억(다른 평가·다시 그리기에도 그대로) */
let open = false;
const CHEV = on => (on ? '▾' : '▸');
let shown = { five: '', list: '', sum: '' }; // 그린 글(바뀐 것이 없으면 다시 그리지 않음)
function html(t) {
  const nodes = stepsOf(t);
  shown = { five: fiveHTML(testSteps(t, nodes, pyOf(t))), list: itemsHTML(nodes), sum: sumHTML(nodes) };
  return `<nav class="un-flow${open ? ' open' : ''}" id="unFlow" aria-label="평가 단계">
    <ol class="ev-steps un-steps" id="unSteps">${shown.five}</ol>
    <button type="button" class="un-flow-sum" aria-expanded="${open}" aria-controls="unFlowL"><span class="un-flow-sum-t">${shown.sum}</span><span class="un-flow-chev" aria-hidden="true">${CHEV(open)}</span></button>
    <ol class="un-flow-l" id="unFlowL"${open ? '' : ' hidden'}>${shown.list}</ol></nav>`;
}
registerBand({ html });

const inTest = () => visible() && U.view === 'test';
/* 줄만 다시 그림(초점이 그 안 단추에 있으면 같은 단추로 돌려 둠) */
function swap(el, html, attr) {
  const f = document.activeElement, key = f && el.contains(f) && f.dataset ? f.dataset[attr] : null;
  el.innerHTML = html;
  if (key) { const b = el.querySelector(`[data-${attr === 'flowStep' ? 'flow-step' : 'flow'}="${key}"]`); if (b) b.focus({ preventScroll: true }); }
}
function paint() {
  const box = getBox(), el = inTest() && box ? box.querySelector('#unFlow') : null, t = el && cur();
  if (!t) return;
  const nodes = stepsOf(t), five = fiveHTML(testSteps(t, nodes, pyOf(t))), h = itemsHTML(nodes), s = sumHTML(nodes);
  if (s !== shown.sum) { const x = el.querySelector('.un-flow-sum-t'); if (x) x.innerHTML = s; shown.sum = s; }
  if (five !== shown.five) { const ol = el.querySelector('#unSteps'); if (ol) { swap(ol, five, 'flowStep'); shown.five = five; } }
  if (h !== shown.list) { const ol = el.querySelector('#unFlowL'); if (ol) { swap(ol, h, 'flow'); shown.list = h; } }
}
/* 접기·펼치기: 다시 그리지 않고 여섯 마디만(초점은 누른 단추에 그대로) */
function toggle(el) {
  open = !open;
  el.classList.toggle('open', open);
  const b = el.querySelector('.un-flow-sum'), ol = el.querySelector('#unFlowL');
  if (b) { b.setAttribute('aria-expanded', String(open)); const c = b.querySelector('.un-flow-chev'); if (c) c.textContent = CHEV(open); }
  if (ol) ol.hidden = !open;
}
let queued = false;
const later = () => { if (queued || !inTest()) return; queued = true; setTimeout(() => { queued = false; paint(); }, 0); };

/* 갈 곳을 보이게 하고 초점을 옮김(카드는 잠깐 초점을 받을 수 있게) */
function reveal(el) {
  if (!el) return;
  if (!el.matches('button, a, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
}
/* 생활기록부: 그 교과 평어로 넘기기(채점을 마친 평가만 모이므로 마치기 전이면 알림) */
function goRecord(t) {
  if (!t.done) { toast('[채점 마치기]를 누르면 교과 평어로 넘길 수 있어요', 5000); return; }
  showPyeongeo(t.meta.subject || '');
  const h = getBox().querySelector('.un-pyview h2');
  if (h) h.focus({ preventScroll: true });
}
function go(g, from) {
  if (!g) return;
  if (g.to === 'record') { goRecord(cur()); return; }
  if (g.to === 'step') {
    // 아직 열리지 않은 단계로는 가지 않음(답안이 없는 새 평가에서 [채점]이 빈 3단계를 열던 것) — 갈 수 있는 데까지
    goStep(Math.min(g.step, reach(cur())));
    const box = getBox(), card = g.card === 'miss' ? box.querySelector('.un-miss') : g.card === 'redo' ? box.querySelector('.un-redo') : null;
    if (card) reveal(card);
    else {
      const b = from && box.querySelector(`#unFlow [${from}]`);
      if (b) b.focus({ preventScroll: true });
      box.querySelector('.steps').scrollIntoView({ block: 'nearest' });
    }
  } else if (g.to === 'results') {
    pickGap(g.nos);
    showResults(g.rv, { subject: g.subject, term: g.term });
    reveal(getBox().querySelector('.un-gap'));
  } else if (g.to === 'camp') {
    if (g.camp) setCurrentCamp(g.camp);
    openCamp(g.section);
    if (g.card === 'growth') {
      const show = () => { const el = document.querySelector('section[data-menu="class"] .cls-camp .cp-growth'); if (el) reveal(el); return !!el; };
      if (!show()) setTimeout(show, 0);
    }
  }
}

document.addEventListener('click', e => {
  const box = getBox();
  if (!box || !inTest()) return;
  const sum = e.target.closest && e.target.closest('#unFlow .un-flow-sum');
  if (sum && box.contains(sum)) { toggle(sum.closest('#unFlow')); return; }
  const st = e.target.closest && e.target.closest('#unFlow [data-flow-step]');
  if (st && box.contains(st)) {
    const s = fiveOf(cur()).find(x => x.id === st.dataset.flowStep);
    if (s) go(s.go, `data-flow-step="${s.id}"`);
    return;
  }
  const b = e.target.closest && e.target.closest('#unFlow [data-flow]');
  if (b && box.contains(b)) {
    const n = stepsOf(cur()).find(x => x.id === b.dataset.flow);
    if (n) go(n.go, `data-flow="${n.id}"`);
    return;
  }
  // 3단계 오른쪽 「생활기록부로 이어서」 [평어 초안 미리 보기]
  const rec = e.target.closest && e.target.closest('[data-go-record]');
  if (rec && box.contains(rec)) { goRecord(cur()); return; }
  later(); // 화면 전체를 다시 그리지 않는 단추(창 안의 단추 포함) 뒤
});
document.addEventListener('change', () => later());
