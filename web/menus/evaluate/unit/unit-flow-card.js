/* 평가 › 단원평가: 평가를 연 화면의 「평가 한 바퀴」 띠 (스펙 2026-11-13-crop-log-flow §3). 4단계 탭 위 한 줄(unit.js registerBand).
   마디 상태는 unit-flow.js(화면 없음), 이 파일은 그리기·누르기·띠만 다시 그리기.
   - 다시 그리기: 화면을 다시 그릴 때마다(채점·묶기·복습 문제 만들기 뒤 refresh, 다른 화면에서 돌아올 때) + 화면 전체를 다시 그리지 않는
     칸 고치기·창의 단추(복습 문제 칸, 채점 칸 확인 창 등) 뒤에는 띠만 — 바뀐 마디가 있을 때만, 띠 단추의 초점은 지킴
   - 누르기: 채점 → 3단계, 틀린 까닭·복습 문제 → 4단계 그 카드, 도달하지 못한 학생 → 결과 모아 보기(이 평가의 교과·학기, 이 평가의 학생을 골라 둠),
     기초학력 → 학급 › 기초학력 그 학생이 든 프로그램의 기본 정보, 사전·사후 → 그 프로그램 결과 보고서 단계의 「사전·사후 점수」 카드.
     기초학력에 아무도 넣지 않았으면 두 마디는 넣는 곳(도달하지 못한 학생)으로 */
import { getSchool } from '../../../core/settings.js';
import { listTests, loadTests, getSet } from './unit-model.js';
import { normCut } from './unit-gap.js';
import { flowSteps, flowAria } from './unit-flow.js';
import { pickGap } from './unit-gap-card.js';
import { showResults } from './unit-results.js';
import { listCamps, currentCampId, setCurrentCamp } from '../../class/camp-model.js';
import { getInfo } from '../../class/class-model.js';
import { openCamp } from '../../class/camp.js';
import { U, esc, registerBand, cur, goStep, visible, getBox } from './unit.js';

const stepsOf = t => flowSteps(t, {
  tests: loadTests(listTests().filter(s => s.done)), camps: listCamps(), cut: normCut(getSet().gapCut),
  breaks: getSchool().breaks || [], info: getInfo(), current: currentCampId()
});
function listHTML(nodes) {
  return `<ol class="un-flow-l">${nodes.map((n, i) => `<li class="un-flow-i"><button type="button" class="un-flow-b${n.done ? ' done' : ''}" data-flow="${n.id}" aria-label="${esc(flowAria(n))}"${n.now ? ' aria-current="step"' : ''}>
      <span class="un-flow-n">${esc(n.label)}${n.now ? ' <span class="un-flow-now">지금</span>' : ''}</span>
      <span class="un-flow-s">${n.done ? '<span class="un-flow-ck">✓</span> ' : ''}${esc(n.status)}</span></button>${i < nodes.length - 1 ? '<span class="un-flow-a" aria-hidden="true">→</span>' : ''}</li>`).join('')}</ol>`;
}
let shown = ''; // 띠에 그린 마디 글(바뀐 것이 없으면 다시 그리지 않음)
function html(t) {
  shown = listHTML(stepsOf(t));
  return `<nav class="un-flow" id="unFlow" aria-label="평가 한 바퀴">${shown}</nav>`;
}
registerBand({ html });

const inTest = () => visible() && U.view === 'test';
/* 띠만 다시 그림 */
function paint() {
  const box = getBox(), el = inTest() && box ? box.querySelector('#unFlow') : null, t = el && cur();
  if (!t) return;
  const h = listHTML(stepsOf(t));
  if (h === shown) return;
  const f = document.activeElement, id = f && el.contains(f) && f.dataset ? f.dataset.flow : null;
  el.innerHTML = h; shown = h;
  if (id) { const b = el.querySelector(`[data-flow="${id}"]`); if (b) b.focus({ preventScroll: true }); }
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
function go(g) {
  if (!g) return;
  if (g.to === 'step') {
    goStep(g.step);
    const box = getBox(), card = g.card === 'miss' ? box.querySelector('.un-miss') : g.card === 'redo' ? box.querySelector('.un-redo') : null;
    if (card) reveal(card);
    else { const b = box.querySelector(`#unFlow [data-flow="${g.card || 'grade'}"]`); if (b) b.focus({ preventScroll: true }); box.querySelector('.steps').scrollIntoView({ block: 'nearest' }); }
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
  const b = e.target.closest && e.target.closest('#unFlow [data-flow]');
  if (b && box.contains(b)) {
    const n = stepsOf(cur()).find(x => x.id === b.dataset.flow);
    if (n) go(n.go);
    return;
  }
  later(); // 화면 전체를 다시 그리지 않는 단추(창 안의 단추 포함) 뒤
});
document.addEventListener('change', () => later());
