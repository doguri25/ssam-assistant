/* 계획 › 연간계획: 1 자료 넣기 → 2 작년 평가 → 3 지침 점검 → 4 초안 → 5 일정 (PRD 5.3).
   AI 답은 시작할 때의 계획 id에 저장해서, 그사이 다른 계획·메뉴로 가도 섞이지 않음 */
import { onEnter, go as goMenu } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { readText, fileMessage } from '../../core/files.js';
import { getSchool } from '../../core/settings.js';
import { toast } from '../../core/ui.js';
import { stepsHTML } from '../../core/steps.js';
import { newPlan, listPlans, getPlan, savePlan, currentId, setCurrent, normReview } from './year-model.js';

const STEPS = ['자료 넣기', '작년 평가', '지침 점검', '초안', '일정'];
const SRC = [
  ['lastPlan', '작년 계획서', '.hwp·.hwpx·PDF 파일을 넣거나 붙여넣어 주세요. (선택)'],
  ['lastResult', '작년 결과', '만족도 설문, 실적, 반성 메모 — 파일(.hwp·.hwpx·PDF·CSV·엑셀)이나 붙여넣기 (선택)'],
  ['guide', '올해 지침·공문', '교육청 지침·공문을 넣거나 붙여넣어 주세요. (선택)']
];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let box = null, curTab = 'year';
let plan = getPlan(currentId()) || newPlan();
let saved = !!getPlan(plan.id);
const busy = {};   // 계획 id → 하는 일 ('review' 등)
const errs = {};   // 계획 id → 오류 문구
let reading = '';  // 파일 읽는 중 안내

/* 이름을 넣었거나 이미 저장된 계획이면 저장하고 목록을 고침 */
function persist() {
  if (!saved && !plan.name.trim()) return;
  plan = savePlan(plan);
  saved = true;
  setCurrent(plan.id);
  renderList();
}
/* AI 답 등을 그 계획(id)에 반영. 보고 있는 계획이면 화면 값도 바꿈 */
function apply(id, fn) {
  const p = getPlan(id);
  if (!p) return;
  fn(p);
  const s = savePlan(p);
  if (plan.id === id) plan = s;
  renderList();
}
const visible = () => curTab === 'year' && box && box.isConnected && !box.closest('[hidden]');

/* ---------- 그리기 ---------- */
function render() {
  if (!box) return;
  box.innerHTML = `<div class="m-page yp-page">
    <div class="m-head"><h2>연간계획</h2><p class="muted">작년 자료와 올해 지침으로 올해 계획서 초안과 월별 일정을 만들어요.</p></div>
    <div class="yp-grid">
      <aside class="yp-side" aria-labelledby="ypListH">
        <div class="yp-side-h"><b id="ypListH">지난 계획</b><button class="btn text" type="button" data-y="new">+ 새 계획</button></div>
        <ul class="yp-list" id="ypList"></ul>
      </aside>
      <section class="yp-main" id="ypMain"></section>
    </div>
    <input type="file" id="ypFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" multiple hidden>
  </div>`;
  renderList();
  renderMain();
}

function renderList() {
  const ul = box && box.querySelector('#ypList');
  if (!ul) return;
  const list = listPlans();
  ul.innerHTML = list.length ? list.map(p => `<li><button type="button" class="yp-item" data-yp="${esc(p.id)}" ${p.id === plan.id ? 'aria-current="true"' : ''}>
      <b>${esc(p.name || '이름 없는 계획')}</b><span class="muted">${p.year}학년도 · ${p.status === 'final' ? '확정' : '작성 중'}</span></button></li>`).join('')
    : '<li class="muted yp-none">아직 없어요.</li>';
}

function renderMain() {
  const main = box && box.querySelector('#ypMain');
  if (!main) return;
  const step = plan.step;
  const body = step === 1 ? step1() : step === 2 ? step2() : `<div class="yp-card"><p class="muted">곧 만들어요.</p></div>`;
  main.innerHTML = stepsHTML(STEPS, step, plan.maxStep)
    + (errs[plan.id] ? `<div class="banner err" role="alert"><span class="grow">${esc(errs[plan.id])}</span></div>` : '')
    + body
    + `<div class="row yp-nav">${step > 1 ? '<button class="btn" type="button" data-y="prev">이전</button>' : ''}<span class="grow"></span>${step < 5 ? '<button class="btn primary" type="button" data-y="next">다음</button>' : ''}</div>`;
}

function step1() {
  const s = getSchool();
  const f = (k, label, { req, ph, area, type } = {}) => `<label class="yp-f${area ? ' wide' : ''}"><span class="lab">${label}${req ? ' <b class="req" aria-hidden="true">*</b>' : ''}</span>`
    + (area ? `<textarea class="field" id="yp${k[0].toUpperCase() + k.slice(1)}" data-pk="${k}" rows="2" placeholder="${esc(ph || '')}">${esc(plan[k])}</textarea>`
      : `<input class="field" id="yp${k[0].toUpperCase() + k.slice(1)}" data-pk="${k}" ${type ? `type="${type}"` : ''} value="${esc(plan[k])}" placeholder="${esc(ph || '')}" autocomplete="off">`) + '</label>';
  return `<div class="yp-card">
      <h3>업무</h3>
      <div class="yp-fields">
        ${f('name', '업무명', { req: true, ph: '예) 독서교육' })}
        ${f('year', '학년도', { type: 'number' })}
        ${f('goal', '올해 목표', { req: true, ph: '한두 문장. 예) 스스로 책을 고르고 즐기는 독서 습관을 기른다.', area: true })}
        ${f('owner', '담당자', { ph: '예) 독서교육부 ○○○' })}
        ${f('budget', '예산', { ph: '예) 120만 원 (도서 구입비 포함)' })}
      </div>
      <p class="muted yp-school">학교 현황: ${esc(s.name || '학교명 없음')} · 학급 ${s.classes || '-'}개 · 학생 ${s.students || '-'}명
        <button class="btn text" type="button" data-y="school">설정 › 학교 정보에서 바꾸기</button></p>
    </div>
    <div class="yp-card">
      <h3>자료</h3>
      ${reading ? `<p class="muted"><span class="spin"></span> ${esc(reading)}</p>` : ''}
      ${SRC.map(([k, label, hint]) => `<div class="yp-src">
        <div class="yp-src-h"><span class="lab">${label}</span><button class="btn" type="button" data-file="${k}">파일 넣기</button></div>
        <p class="muted">${hint}</p>
        <div class="yp-files muted" data-for="${k}">${plan.sourceNames[k].length ? '넣은 파일: ' + plan.sourceNames[k].map(esc).join(', ') : ''}</div>
        <textarea class="field" data-src="${k}" rows="4" placeholder="여기에 붙여넣어도 돼요" aria-label="${label}">${esc(plan.sources[k])}</textarea>
      </div>`).join('')}
    </div>`;
}

function step2() {
  if (!plan.sources.lastResult.trim()) return `<div class="yp-card"><p class="banner info" id="ypNote"><span class="grow">작년 결과 없이 목표와 지침으로 만들어요.</span></p></div>`;
  if (busy[plan.id] === 'review') return `<div class="yp-card" id="ypReview"><p class="muted"><span class="spin"></span> 작년 결과를 살펴보고 있어요…</p></div>`;
  const r = plan.review;
  if (!r) return `<div class="yp-card" id="ypReview"><p class="muted">작년 결과를 아직 평가하지 않았어요.</p><div class="row"><button class="btn primary" type="button" data-y="review">작년 결과 평가하기</button></div></div>`;
  const list = (items, empty) => items.length ? `<ul class="yp-ul">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`;
  return `<div class="yp-card" id="ypReview">
      <div class="yp-review">
        <section><h3>잘된 점</h3>${list(r.good, '없어요.')}</section>
        <section><h3>아쉬운 점</h3>${r.bad.length ? r.bad.map(b => `<div class="yp-bad"><p class="yp-bad-t">${esc(b.text)}</p>
          <p class="muted">올해 개선 방향 — 반영할 것을 고르세요</p>
          ${b.ideas.map(i => `<label class="yp-idea"><input type="checkbox" data-idea="${esc(i)}" ${r.picked.includes(i) ? 'checked' : ''}>${esc(i)}</label>`).join('')}</div>`).join('') : '<p class="muted">없어요.</p>'}</section>
        <section><h3>수치 변화</h3>${list(r.numbers, '결과에 수치가 없어요.')}</section>
      </div>
      <div class="row"><button class="btn text" type="button" data-y="review">다시 평가</button></div>
    </div>`;
}

/* ---------- AI: 작년 평가 ---------- */
function reviewPrompt(p) {
  return `[작년 평가]\n학교 업무 연간계획을 돕는 도우미예요. 아래 작년 운영 결과(설문·실적·반성)를 보고 평가해 주세요.\n`
    + `업무: ${p.name}\n올해 목표: ${p.goal}\n\n작년 결과:\n"""\n${p.sources.lastResult.slice(0, 20000)}\n"""\n\n`
    + '규칙:\n- good: 잘된 점 2~4개(짧은 문장)\n- bad: 아쉬운 점 1~4개, 각각 ideas에 올해 개선 방향 2~3개(실행할 수 있는 짧은 문장)\n'
    + '- numbers: 결과에 나온 수치 변화(없으면 빈 배열). 결과에 없는 숫자는 지어내지 않음\n\n'
    + '답은 JSON 하나만: {"good":["…"],"bad":[{"text":"…","ideas":["…","…"]}],"numbers":["…"]}';
}
async function runReview() {
  const id = plan.id;
  if (busy[id] || !plan.sources.lastResult.trim()) return;
  if (!ai.ready()) { errs[id] = '작년 결과를 살펴볼 AI를 먼저 정해 주세요. 왼쪽 아래 AI에서 정할 수 있어요.'; renderMain(); return; }
  busy[id] = 'review'; delete errs[id];
  renderMain();
  try {
    const v = await ai.generateJSON(reviewPrompt(plan), { valid: x => x && !Array.isArray(x) && (Array.isArray(x.good) || Array.isArray(x.bad)) });
    const r = normReview(v);
    apply(id, p => { p.review = { ...r, picked: [] }; });
  } catch (e) {
    errs[id] = ai.errorMessage(e && e.code, e);
  }
  delete busy[id];
  if (visible() && plan.id === id) renderMain();
}

/* ---------- 단계 이동 ---------- */
function goStep(n) {
  plan.step = n;
  plan.maxStep = Math.max(plan.maxStep, n);
  persist();
  renderMain();
  if (n === 2 && plan.sources.lastResult.trim() && !plan.review) runReview();
}
function next() {
  if (plan.step === 1) {
    const bad = ['name', 'goal'].filter(k => !String(plan[k]).trim());
    box.querySelectorAll('.field.bad').forEach(el => el.classList.remove('bad'));
    bad.forEach(k => { const el = box.querySelector(`[data-pk="${k}"]`); if (el) el.classList.add('bad'); });
    if (bad.length) { box.querySelector('.field.bad').focus(); return; }
  }
  goStep(Math.min(5, plan.step + 1));
}

async function addFiles(target, files) {
  for (const f of files) {
    reading = `「${f.name}」 읽는 중…`;
    if (plan.step === 1) renderMain();
    try {
      const text = await readText(f);
      const prev = plan.sources[target].trim();
      plan.sources[target] = (prev ? prev + '\n\n' : '') + `(파일 「${f.name}」)\n${text}`;
      plan.sourceNames[target] = [...plan.sourceNames[target], f.name];
      persist();
    } catch (e) { toast(fileMessage(e && e.code), 5000); }
  }
  reading = '';
  if (visible() && plan.step === 1) renderMain();
}

/* ---------- 입력·누르기 ---------- */
document.addEventListener('input', e => {
  if (!box || !box.contains(e.target) || curTab !== 'year') return;
  const el = e.target;
  if (el.dataset.pk) {
    plan[el.dataset.pk] = el.dataset.pk === 'year' ? (parseInt(el.value, 10) || plan.year) : el.value;
    if (String(el.value).trim()) el.classList.remove('bad');
  } else if (el.dataset.src) plan.sources[el.dataset.src] = el.value;
  else return;
  persist();
});
document.addEventListener('change', e => {
  if (!box || !box.contains(e.target) || curTab !== 'year') return;
  const el = e.target;
  if (el.id === 'ypFile') { const t = el.dataset.target; const files = [...el.files]; el.value = ''; if (t && files.length) addFiles(t, files); return; }
  if (el.dataset.idea != null && plan.review) {
    const set = new Set(plan.review.picked);
    if (el.checked) set.add(el.dataset.idea); else set.delete(el.dataset.idea);
    plan.review = { ...plan.review, picked: [...set] };
    persist();
  }
});
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || curTab !== 'year') return;
  const item = e.target.closest('[data-yp]');
  if (item) { const p = getPlan(item.dataset.yp); if (p) { plan = p; saved = true; setCurrent(p.id); render(); } return; }
  const st = e.target.closest('[data-step]');
  if (st) { const n = +st.dataset.step; if (n <= plan.maxStep) goStep(n); return; }
  const fb = e.target.closest('[data-file]');
  if (fb) { const inp = box.querySelector('#ypFile'); inp.dataset.target = fb.dataset.file; inp.click(); return; }
  const b = e.target.closest('[data-y]');
  if (!b) return;
  const a = b.dataset.y;
  if (a === 'new') { plan = newPlan(); saved = false; render(); box.querySelector('#ypName').focus(); }
  else if (a === 'next') next();
  else if (a === 'prev') goStep(Math.max(1, plan.step - 1));
  else if (a === 'review') { if (plan.review) apply(plan.id, p => { p.review = null; }); runReview(); }
  else if (a === 'school') goMenu('settings', 'school');
});

function renderEvent() {
  box.innerHTML = '<div class="m-page"><div class="m-head"><h2>행사계획</h2><p class="muted">곧 만들어요.</p></div></div>';
}

onEnter('plan', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'yp-box'; section.prepend(box); }
  curTab = tab;
  if (tab === 'year') { const p = getPlan(plan.id); if (p) plan = p; render(); } else renderEvent();
});
