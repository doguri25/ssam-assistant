/* 계획 › 학급운영계획: 1 자료 넣기 → 2 목차 → 3 초안 → 4 첨부·내보내기 (스펙 2026-10-29-class-plan).
   작년 계획서 목차 그대로 올해 초안을 쓰고, 첨부한 진도표·평가계획을 읽어 표로 넣음.
   AI 답은 시작할 때의 계획 id에 저장해서, 그사이 다른 계획·메뉴로 가도 섞이지 않음 */
import { onFlush } from '../../core/store.js';
import { onEnter } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { readText, fileMessage } from '../../core/files.js';
import { toast } from '../../core/ui.js';
import { stepsHTML } from '../../core/steps.js';
import { stripNames } from '../../core/privacy.js';
import {
  STANDARD, MAX_SRC, parseOutline, withRoles, leaves, sectionBodies, newId, newPlan, listPlans, getPlan, savePlan, deletePlan, currentId, setCurrent,
  normSections, normMonthly, normGuide, guideStatus, insertSentence, draftText, hoursRows, planTitle, planText
} from './classplan-model.js';
import { overlap } from './year-model.js';
import { guidePrompt, draftPrompt } from './classplan-ai.js';

const STEPS = ['자료 넣기', '목차', '초안', '첨부·내보내기'];
const SRC = [
  ['lastPlan', '작년 학급운영계획', '작년 학급운영계획(학급 교육과정 운영 계획) 한글·PDF 파일을 넣거나 붙여넣어 주세요. 목차를 그대로 따라 써요. (선택)'],
  ['guide', '올해 지침', '학교 교육과정·교육청 지침에서 학급운영에 해당하는 부분을 넣거나 붙여넣어 주세요. (선택)']
];
const ROLE = { hours: '시수표', eval: '평가 표', monthly: '월별 표' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = t => String(t).slice(0, MAX_SRC);
const S = () => window.SSAM || {};

let box = null, curTab = '';
let plan = getPlan(currentId()) || newPlan();
let saved = !!getPlan(plan.id);
const busy = {}, errs = {}, reading = {};
let warnedFull = false, showPrev = false;
const visible = () => curTab === 'class' && box && box.isConnected && !box.closest('[hidden]');

/* 글을 칠 때는 잠깐 멈춘 뒤 한 번만 저장. 다른 일을 하기 전에는 flushSave */
let saveT = 0;
function persistSoon() { clearTimeout(saveT); saveT = setTimeout(persist, 400); }
function flushSave() { if (saveT) persist(); }
onFlush(flushSave);
document.addEventListener('menu:go', flushSave);
function persist() {
  clearTimeout(saveT); saveT = 0;
  const s = savePlan(plan);
  if (!s) { if (!warnedFull) { warnedFull = true; toast('저장 공간이 모자라 저장하지 못했어요. 쓰지 않는 계획을 지우거나 긴 자료를 줄여 주세요.', 8000); } return; }
  warnedFull = false;
  plan.updatedAt = s.updatedAt;
  saved = true;
  setCurrent(plan.id);
  renderList();
}
/* AI 답 등을 그 계획(id)에 반영. 보고 있는 계획이면 화면 값도 바꿈 */
function apply(id, fn) {
  flushSave();
  const p = plan.id === id ? plan : getPlan(id);
  if (!p) return;
  fn(p);
  const s = savePlan(p);
  if (!s) { toast('저장 공간이 모자라 저장하지 못했어요.', 6000); return; }
  if (plan.id === id) plan = s;
  saved = saved || plan.id === id;
  renderList();
}

/* ---------- 그리기 ---------- */
function render() {
  if (!box) return;
  box.innerHTML = `<div class="m-page yp-page">
    <div class="m-head"><h2>학급운영계획</h2><p class="muted">작년 학급운영계획을 바탕으로 올해 계획서 초안을 만들어요. 진도표·평가계획을 붙이면 읽어서 표로 넣어요.</p></div>
    <div class="yp-grid">
      <aside class="yp-side" aria-labelledby="cpListH">
        <div class="yp-side-h"><b id="cpListH">지난 학급운영계획</b><button class="btn text" type="button" data-c="new">+ 새 계획</button></div>
        <ul class="yp-list" id="cpList"></ul>
      </aside>
      <section class="yp-main" id="cpMain"></section>
    </div>
    <input type="file" id="cpFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" multiple hidden>
  </div>`;
  renderList();
  renderMain();
}
const listShown = new WeakMap();
function renderList() {
  const ul = box && box.querySelector('#cpList');
  if (!ul) return;
  const list = listPlans();
  const html = list.length ? list.map(p => `<li><button type="button" class="yp-item" data-cp="${esc(p.id)}" ${p.id === plan.id ? 'aria-current="true"' : ''}>
      <b>${esc(p.grade && p.room ? `${p.grade}학년 ${p.room}반` : '학급 미정')}</b><span class="muted">${p.year}학년도 · ${p.status === 'final' ? '확정' : '작성 중'}</span></button></li>`).join('')
    : '<li class="muted yp-none">아직 없어요.</li>';
  if (listShown.get(ul) !== html) { ul.innerHTML = html; listShown.set(ul, html); }
}
function renderMain() {
  const main = box && box.querySelector('#cpMain');
  if (!main) return;
  const step = plan.step;
  const body = step === 1 ? step1() : step === 2 ? step2() : step === 3 ? step3() : step4();
  main.innerHTML = stepsHTML(STEPS, step, plan.maxStep)
    + (errs[plan.id] ? `<div class="banner err" role="alert"><span class="grow">${esc(errs[plan.id])}</span></div>` : '')
    + body
    + `<div class="row yp-nav">${step > 1 ? '<button class="btn" type="button" data-c="prev">이전</button>' : ''}<span class="grow"></span>${step < 4 ? '<button class="btn primary" type="button" data-c="next">다음</button>' : ''}</div>`
    + (saved ? `<div class="row yp-del"><button class="btn text yp-danger" type="button" data-c="delete">이 계획 지우기</button></div>` : '');
}

/* ---------- 1단계: 자료 넣기 ---------- */
function rosterCount() { try { const c = JSON.parse(localStorage.getItem('ssam:class') || 'null'); return c && c.count ? c.count : 0; } catch (e) { return 0; } }
function step1() {
  const n = rosterCount();
  const num = (id, k, label, min, max) => `<label class="yp-f"><span class="lab">${label}</span><input class="field num" type="number" id="${id}" data-pk="${k}" min="${min}" max="${max}" value="${plan[k] == null ? '' : plan[k]}"></label>`;
  return `<div class="yp-card">
      <h3>우리 반</h3>
      <div class="cp-class">
        ${num('cpYear', 'year', '학년도', 2020, 2100)}
        <label class="yp-f"><span class="lab">학년</span><select class="field" id="cpGrade" data-pk="grade"><option value="">고르기</option>${[1, 2, 3, 4, 5, 6].map(g => `<option value="${g}"${plan.grade === g ? ' selected' : ''}>${g}학년</option>`).join('')}</select></label>
        ${num('cpRoom', 'room', '반', 1, 30)}
        ${num('cpBoys', 'boys', '남학생 수', 0, 60)}
        ${num('cpGirls', 'girls', '여학생 수', 0, 60)}
        <label class="yp-f wide"><span class="lab">급훈·학급 슬로건 (선택)</span><input class="field" id="cpMotto" data-pk="motto" value="${esc(plan.motto)}" placeholder="예) 배려하고 소통하는 우리 반" autocomplete="off"></label>
      </div>
      <p class="muted">학생 이름은 넣지 않아요. 학생 수는 숫자만 써요.${n ? ` (설정 › 학급 명단: ${n}명)` : ''}</p>
    </div>
    <div class="yp-card">
      <h3>자료</h3>
      ${reading[plan.id] ? `<p class="muted"><span class="spin"></span> ${esc(reading[plan.id])}</p>` : ''}
      ${SRC.map(([k, label, hint]) => `<div class="yp-src">
        <div class="yp-src-h"><span class="lab">${label}</span><span class="row">${k === 'lastPlan' ? '<button class="btn text" type="button" data-c="importPrev">지난 학급운영계획에서 불러오기</button>' : ''}<button class="btn" type="button" data-file="${k}">파일 넣기</button></span></div>
        ${k === 'lastPlan' && showPrev ? prevHTML() : ''}
        <p class="muted">${hint}</p>
        <div class="yp-files muted">${plan.sourceNames[k].length ? '넣은 파일: ' + plan.sourceNames[k].map(esc).join(', ') : ''}</div>
        <textarea class="field" data-src="${k}" rows="4" placeholder="여기에 붙여넣어도 돼요" aria-label="${label}">${esc(plan.sources[k])}</textarea>
      </div>`).join('')}
    </div>`;
}
function prevHTML() {
  const list = listPlans().filter(p => p.status === 'final' && p.id !== plan.id);
  return `<div class="yp-prev" id="cpPrev">${list.length ? list.map(p => `<button class="btn" type="button" data-prev="${esc(p.id)}">${p.year}학년도 ${esc(p.grade && p.room ? `${p.grade}학년 ${p.room}반` : '학급')}</button>`).join('')
    : '<span class="muted">확정한 지난 학급운영계획이 없어요.</span>'}</div>`;
}
/* 파일은 넣기 시작한 계획(id)에 넣음. 이름·전화번호 줄은 빼고 넣고 알림 */
async function addFiles(target, files) {
  const id = plan.id;
  if (!saved) persist();
  const here = () => visible() && plan.id === id && plan.step === 1;
  for (const f of files) {
    reading[id] = `「${f.name}」 읽는 중…`;
    if (here()) renderMain();
    try {
      const r = stripNames(await readText(f));
      apply(id, p => {
        const prev = p.sources[target].trim();
        p.sources[target] = cap((prev ? prev + '\n\n' : '') + r.text);
        p.sourceNames[target] = [...p.sourceNames[target], f.name];
      });
      if (r.dropped) toast(`이름·전화번호가 적힌 줄 ${r.dropped}개는 빼고 넣었어요(학생 이름은 저장하지도 AI로 보내지도 않아요).`, 7000);
    } catch (e) { toast(fileMessage(e && e.code), 5000); }
  }
  delete reading[id];
  if (here()) renderMain();
}

/* ---------- 2단계: 목차 ---------- */
let outlineNote = '';
function ensureOutline() {
  if (plan.outline.length) return;
  const o = plan.sources.lastPlan.trim() ? parseOutline(plan.sources.lastPlan) : [];
  if (o.length) { plan.outline = o; outlineNote = `작년 계획서 목차 그대로예요(${o.length}칸). 이름을 고치거나 빼고 더할 수 있어요.`; }
  else {
    plan.outline = STANDARD.map(x => ({ ...x }));
    outlineNote = plan.sources.lastPlan.trim() ? '작년 계획서에서 목차를 찾지 못해 표준 목차로 시작해요.' : '작년 계획서가 없어 표준 목차로 시작해요. 여러 학교의 학급운영계획과 학급 교육과정 운영 평가 항목을 모아 만든 목차예요.';
  }
  persist();
}
function step2() {
  const o = plan.outline;
  return `<div class="yp-card">
      <h3>목차</h3>
      <p class="banner info" id="cpOutlineNote"><span class="grow">${esc(outlineNote || '목차를 고치면 초안 칸도 따라 바뀌어요.')}</span></p>
      <ol class="cp-outline" id="cpOutline">${o.map((x, i) => `<li class="l${x.level}" data-oi="${i}">
        <input class="field" data-ot="${esc(x.id)}" value="${esc(x.title)}" aria-label="${i + 1}번째 칸 이름">
        ${x.role ? `<span class="cp-role">${ROLE[x.role]}</span>` : ''}
        <button class="btn text tiny" type="button" data-olv="${i}" title="큰 제목·작은 제목 바꾸기">${x.level === 1 ? '작게' : '크게'}</button>
        <button class="icon-btn" type="button" data-oup="${i}" aria-label="위로"${i ? '' : ' disabled'}>↑</button>
        <button class="icon-btn" type="button" data-odown="${i}" aria-label="아래로"${i < o.length - 1 ? '' : ' disabled'}>↓</button>
        <button class="icon-btn" type="button" data-odel="${i}" aria-label="이 칸 빼기">×</button></li>`).join('')}</ol>
      <div class="row"><button class="btn text" type="button" data-c="oAdd">+ 칸 더하기</button><span class="grow"></span>
        ${plan.sources.lastPlan.trim() ? '<button class="btn text" type="button" data-c="oLast">작년 목차로 다시</button>' : ''}<button class="btn text" type="button" data-c="oStd">표준 목차로 바꾸기</button></div>
      <p class="muted">시수표·평가 표·월별 표는 4단계에서 첨부한 진도표·평가계획을 읽어 그 칸 뒤에 넣어요.</p>
    </div>`;
}
/* 칸 역할(시수표 등)은 이름·순서가 바뀔 때마다 다시 정함. 빠진 칸의 초안 글도 뺌 */
function setOutline(o, note) {
  plan.outline = withRoles(o);
  if (plan.draft) plan.draft = Object.fromEntries(Object.entries(plan.draft).filter(([k]) => plan.outline.some(x => x.id === k)));
  outlineNote = note || '';
  persist(); renderMain();
}

/* ---------- 3단계: 초안·지침 점검 ---------- */
const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ';
function overlapHTML() {
  const r = plan.draft ? overlap(plan.sources.lastPlan, draftText(plan.draft)) : null;
  if (!r) return '';
  const hi = r.percent >= 60;
  return `<div class="banner ${hi ? 'warn' : 'info'}" id="cpOverlap"><span class="grow"><b>작년 계획과 ${r.percent}% 같아요.</b>${hi ? ' 아래 문장을 올해 우리 반에 맞게 새로 써 주세요.' : ''}
    ${hi ? `<ul class="yp-same-list">${r.same.slice(0, 12).map(x => `<li class="yp-same">${esc(x)}</li>`).join('')}</ul>` : ''}</span></div>`;
}
function guideHTML() {
  if (!plan.guide || !plan.guide.length) return '';
  const name = Object.fromEntries(plan.outline.map(x => [x.id, x.title]));
  const st = guideStatus(plan.guide, plan.draft);
  return `<div class="yp-card"><h3>올해 지침 점검</h3><p class="muted">빠진 항목은 [넣기]로 그 칸에 더할 수 있어요.</p>
    <ul class="yp-guide" id="cpGuide">${st.map((g, i) => `<li data-g="${i}" class="${g.included ? 'in' : 'out'}">
      <div class="yp-guide-h"><b>${esc(g.item)}</b><span class="yp-tag ${g.included ? 'ok' : 'no'}">${g.included ? '반영됨' : '빠짐'}</span></div>
      ${!g.included && g.sentence ? `<div class="yp-guide-s"><span class="muted cp-guide-sec">「${esc(name[g.section] || '')}」에 넣을 문장: </span>${esc(g.sentence)}
        <button class="btn tonal" type="button" data-insert="${i}">넣기</button></div>` : ''}</li>`).join('')}</ul></div>`;
}
function monthlyHTML() {
  const m = plan.monthly.length ? plan.monthly : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].map(month => ({ month, text: '' }));
  return `<div class="yp-tbl-wrap"><table class="yp-tbl" id="cpMonthly"><thead><tr><th>월</th><th>주요 활동</th></tr></thead><tbody>${m.map((x, i) => `<tr>
    <td class="num">${x.month}월</td><td><input class="field" data-mon="${i}" value="${esc(x.text)}" aria-label="${x.month}월 주요 활동"></td></tr>`).join('')}</tbody></table></div>`;
}
const HINT = { hours: '4단계에서 첨부한 진도표의 교과별 시수표가 이 칸 뒤에 붙어요.', eval: '4단계에서 첨부한 평가계획의 평가 표가 이 칸 뒤에 붙어요.', monthly: '' };
function step3() {
  const b = busy[plan.id];
  if (b === 'guide' || b === 'draft') return `<div class="yp-card"><p class="muted"><span class="spin"></span> ${b === 'guide' ? '올해 지침에서 꼭 넣을 항목을 찾고 있어요…' : '칸마다 올해 초안을 쓰고 있어요. 다른 메뉴로 가도 계속 써요…'}</p></div>`;
  const d = plan.draft;
  if (!d) return `<div class="yp-card"><h3>초안</h3><p class="muted">목차 칸마다 작년 글의 짜임과 문체를 따라 올해 우리 반에 맞게 써요.${plan.sources.guide.trim() ? ' 올해 지침에서 꼭 넣을 항목을 먼저 찾아 함께 넣어요.' : ''} 학생 이름은 보내지 않아요.</p>
    <div class="row"><button class="btn primary" type="button" data-c="draft">AI로 초안 쓰기</button><button class="btn" type="button" data-c="blank">직접 쓰기</button></div></div>`;
  const leafIds = new Set(leaves(plan.outline).map(x => x.id));
  let a = 0, n = 0;
  const secs = plan.outline.map(x => {
    if (x.level === 1) { a++; n = 0; }
    else n++;
    const head = x.level === 1 ? `${ROMAN[a - 1] || a}. ${x.title}` : `${n}. ${x.title}`;
    if (!leafIds.has(x.id)) return `<h3 class="cp-sec-l1">${esc(head)}</h3>`;
    return `<section class="yp-sec cp-sec"><h4>${esc(head)}</h4>
      ${x.role === 'monthly' ? monthlyHTML() : `<textarea class="field" data-sec="${esc(x.id)}" rows="4" aria-label="${esc(x.title)}">${esc(d[x.id] || '')}</textarea>`}
      ${HINT[x.role] ? `<p class="muted">${HINT[x.role]}</p>` : ''}</section>`;
  }).join('');
  return `<div id="cpOverlapBox">${overlapHTML()}</div>${guideHTML()}
    <div class="yp-card" id="cpDraft">${secs}
      <div class="row"><button class="btn text" type="button" data-c="draft">AI로 다시 쓰기 (고친 내용은 사라져요)</button></div></div>`;
}
/* AI 일이 끝나면: 그 계획의 3단계를 보고 있을 때만 다시 그림 */
function finish(id) {
  delete busy[id];
  if (!visible() || plan.id !== id) return;
  if (plan.step === 3) renderMain();
  else if (errs[id]) toast(errs[id], 6000);
}
async function runDraft() {
  const id = plan.id;
  if (busy[id]) return;
  if (!ai.ready()) { errs[id] = '초안을 쓸 AI를 먼저 정해 주세요. 왼쪽 아래 AI에서 정할 수 있어요.'; renderMain(); return; }
  if (!saved) persist();
  delete errs[id];
  try {
    if (plan.sources.guide.trim() && !plan.guide) {
      busy[id] = 'guide'; renderMain();
      const outline = plan.outline;
      const v = await ai.generateJSON(guidePrompt(plan), { valid: x => Array.isArray(x) && normGuide(x, outline).length > 0 });
      apply(id, p => { p.guide = normGuide(v, p.outline); });
    }
    const target = getPlan(id);
    if (!target) return;
    busy[id] = 'draft'; if (visible() && plan.id === id) renderMain();
    const prompt = draftPrompt(target, { bodies: sectionBodies(target.sources.lastPlan, target.outline), hours: hoursRows(target.attach), evalCount: target.evalRows.length });
    const v = await ai.generateJSON(prompt, { valid: x => Object.keys(normSections(x, target.outline)).length > 0 });
    apply(id, p => {
      p.draft = normSections(v, p.outline);
      const m = normMonthly(v);
      if (m.length) p.monthly = m;
      if (p.status === 'final') p.status = 'draft';
    });
  } catch (e) { errs[id] = ai.errorMessage(e && e.code, e); }
  finish(id);
}
let ovT = null;
function refreshOverlap() {
  clearTimeout(ovT);
  ovT = setTimeout(() => { const b = box && box.querySelector('#cpOverlapBox'); if (b) b.innerHTML = overlapHTML(); }, 250);
}

/* ---------- 4단계 ---------- */
function step4() { return '<div class="yp-card"><p class="muted">첨부·내보내기 단계는 준비 중이에요.</p></div>'; }

/* ---------- 단계 옮기기 ---------- */
function goStep(n) {
  plan.step = n;
  plan.maxStep = Math.max(plan.maxStep, n);
  if (n >= 2) ensureOutline();
  persist();
  renderMain();
}

function askDelete() {
  const id = plan.id;
  if (!S().openSheet) return;
  S().openSheet(`<h3>「${esc(planTitle(plan))}」 지우기</h3>
    <p class="muted" style="margin:0">계획서·목차·넣은 자료·첨부 요약이 모두 지워져요. 되돌릴 수 없어요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" data-c="deleteYes">지우기</button></div>`,
  sh => sh.querySelector('[data-c="deleteYes"]').addEventListener('click', () => {
    deletePlan(id);
    S().closeSheet();
    plan = listPlans()[0] || newPlan(); saved = !!getPlan(plan.id);
    if (saved) setCurrent(plan.id);
    render(); toast('지웠어요');
  }));
}

/* ---------- 입력·누르기 ---------- */
const NUMS = { year: [2020, 2100], grade: [1, 6], room: [1, 30], boys: [0, 60], girls: [0, 60] };
document.addEventListener('input', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  const el = e.target;
  if (el.dataset.pk) {
    const k = el.dataset.pk;
    if (NUMS[k]) { const v = Math.round(Number(el.value)); plan[k] = el.value !== '' && v >= NUMS[k][0] && v <= NUMS[k][1] ? v : k === 'year' ? plan.year : null; }
    else plan[k] = el.value;
  } else if (el.dataset.src) {
    if (el.value.length > MAX_SRC) { el.value = cap(el.value); toast('앞 6만 자만 저장해요', 4000); }
    plan.sources[el.dataset.src] = el.value;
    // 지침을 고치면 지침 항목을 다시 뽑음
    if (el.dataset.src === 'guide') plan.guide = null;
  } else if (el.dataset.sec && plan.draft) { plan.draft = { ...plan.draft, [el.dataset.sec]: el.value }; refreshOverlap(); }
  else if (el.dataset.mon != null) {
    const m = plan.monthly.length ? plan.monthly : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].map(month => ({ month, text: '' }));
    const x = m[+el.dataset.mon];
    if (!x) return;
    x.text = el.value; plan.monthly = m;
  } else return;
  if (plan.status === 'final' && (el.dataset.sec || el.dataset.mon != null)) plan.status = 'draft';
  persistSoon();
});
document.addEventListener('change', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  const el = e.target;
  if (el.id === 'cpFile') { const t = el.dataset.target; const files = [...el.files]; el.value = ''; if (t && files.length) addFiles(t, files); return; }
  if (el.id === 'cpGrade') { plan.grade = el.value ? +el.value : null; persist(); return; }
  if (el.dataset.ot != null) {
    const x = plan.outline.find(o => o.id === el.dataset.ot);
    if (x && el.value.trim()) { x.title = el.value.trim().slice(0, 60); setOutline(plan.outline); }
  }
});
const move = (a, i, j) => { if (j < 0 || j >= a.length) return a; const b = a.slice(); [b[i], b[j]] = [b[j], b[i]]; return b; };
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  flushSave();
  const item = e.target.closest('[data-cp]');
  if (item) { const p = getPlan(item.dataset.cp); if (p) { plan = p; saved = true; outlineNote = ''; setCurrent(p.id); render(); } return; }
  const st = e.target.closest('[data-step]');
  if (st) { const n = +st.dataset.step; if (n <= plan.maxStep) goStep(n); return; }
  const fb = e.target.closest('[data-file]');
  if (fb) { const inp = box.querySelector('#cpFile'); inp.dataset.target = fb.dataset.file; inp.click(); return; }
  const pv = e.target.closest('[data-prev]');
  if (pv) {
    const p = getPlan(pv.dataset.prev);
    if (p) {
      const prev = plan.sources.lastPlan.trim();
      plan.sources.lastPlan = cap((prev ? prev + '\n\n' : '') + planText(p));
      plan.sourceNames.lastPlan = [...plan.sourceNames.lastPlan, `지난 계획: ${planTitle(p)}`];
      showPrev = false; persist(); renderMain();
    }
    return;
  }
  const ins = e.target.closest('[data-insert]');
  if (ins && plan.guide && plan.draft) {
    const g = plan.guide[+ins.dataset.insert];
    if (g) { plan.draft = insertSentence(plan.draft, g.section, g.sentence); if (plan.status === 'final') plan.status = 'draft'; persist(); renderMain(); toast('초안에 넣었어요'); }
    return;
  }
  const o = plan.outline, idx = k => +e.target.closest(`[${k}]`).getAttribute(k);
  if (e.target.closest('[data-oup]')) { const i = idx('data-oup'); setOutline(move(o, i, i - 1)); return; }
  if (e.target.closest('[data-odown]')) { const i = idx('data-odown'); setOutline(move(o, i, i + 1)); return; }
  if (e.target.closest('[data-odel]')) { const i = idx('data-odel'); setOutline(o.filter((_, j) => j !== i)); return; }
  if (e.target.closest('[data-olv]')) { const i = idx('data-olv'); setOutline(o.map((x, j) => (j === i ? { ...x, level: x.level === 1 ? 2 : 1 } : x))); return; }
  const b = e.target.closest('[data-c]');
  if (!b) return;
  const a = b.dataset.c;
  if (a === 'new') { plan = newPlan(); saved = false; showPrev = false; outlineNote = ''; render(); }
  else if (a === 'next') goStep(Math.min(4, plan.step + 1));
  else if (a === 'prev') goStep(Math.max(1, plan.step - 1));
  else if (a === 'importPrev') { showPrev = !showPrev; renderMain(); }
  else if (a === 'draft') runDraft();
  else if (a === 'blank') { plan.draft = {}; persist(); renderMain(); }
  else if (a === 'oAdd') { setOutline([...o, { id: newId(), title: '새 칸', level: 2 }]); const ins = box.querySelectorAll('#cpOutline input[data-ot]'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } }
  else if (a === 'oLast') { const p = parseOutline(plan.sources.lastPlan); if (p.length) setOutline(p, `작년 계획서 목차 그대로예요(${p.length}칸).`); else toast('작년 계획서에서 목차를 찾지 못했어요'); }
  else if (a === 'oStd') setOutline(STANDARD.map(x => ({ ...x })), '표준 목차로 바꿨어요.');
  else if (a === 'delete') askDelete();
});

onEnter('plan', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cp-box'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'class';
  flushSave();
  if (tab === 'class') { const p = getPlan(plan.id); if (p) plan = p; render(); }
});
