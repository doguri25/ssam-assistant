/* 계획 › 행사계획: 1 행사 정보 → 2 구성안 → 3 문서 → 4 설문·결과 (PRD 5.4).
   연간계획(year.js)과 같은 틀: 지난 행사 목록 + 단계. AI 답은 시작할 때의 행사 id에 저장 */
import { onEnter } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { readText, fileMessage } from '../../core/files.js';
import { getSchool } from '../../core/settings.js';
import { toast } from '../../core/ui.js';
import { stepsHTML } from '../../core/steps.js';
import { listEvents as listCalendar, removeEvents, dayIssues, suggestDates, weekday, isDate } from '../../core/calendar.js';
import { KINDS, newEvent, listEventPlans, getEvent, saveEvent, deleteEvent, currentEventId, setCurrentEvent, normOptions } from './event-model.js';

const STEPS = ['행사 정보', '구성안', '문서', '설문·결과'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number(n || 0).toLocaleString('ko-KR');
const fmtDay = d => `${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일(${'일월화수목금토'[weekday(d)]})`;
const kindName = id => (KINDS.find(k => k[0] === id) || KINDS[3])[1];

let box = null, curTab = null;
let ev = getEvent(currentEventId()) || newEvent();
let saved = !!getEvent(ev.id);
const busy = {}, errs = {};
const MAX_SRC = 60000;                 // 작년 설문 칸에 저장하는 글자 수
const STEP_OF = { options: 2, docs: 3, items: 4, result: 4 }; // AI 일 → 결과를 보이는 단계
const cap = t => String(t).slice(0, MAX_SRC);
let warnedFull = false;

function persist() {
  if (!saved && !ev.name.trim()) return;
  const s = saveEvent(ev);
  if (!s) { if (!warnedFull) { warnedFull = true; toast('저장 공간이 모자라 저장하지 못했어요. 쓰지 않는 행사를 지우거나 긴 자료를 줄여 주세요.', 8000); } return; }
  warnedFull = false;
  ev.updatedAt = s.updatedAt;
  saved = true;
  setCurrentEvent(ev.id);
  renderList();
}
function apply(id, fn) {
  const e = getEvent(id);
  if (!e) return;
  fn(e);
  const s = saveEvent(e);
  if (!s) { toast('저장 공간이 모자라 저장하지 못했어요.', 6000); return; }
  if (ev.id === id) ev = s;
  renderList();
}
/* AI 일이 끝나면 그 결과를 보이는 단계를 보고 있을 때만 다시 그림 (다른 단계에서 치는 글이 끊기지 않게) */
function finish(id, kind) {
  delete busy[id];
  if (!visible() || ev.id !== id) return;
  if (ev.step === STEP_OF[kind]) renderMain();
  else if (errs[id]) toast(errs[id], 6000);
}
const visible = () => curTab === 'event' && box && box.isConnected && !box.hidden && !box.closest('[hidden]');
const calCtx = () => ({ breaks: getSchool().breaks, events: listCalendar(), source: 'event:' + ev.id });

/* ---------- 그리기 ---------- */
function render() {
  box.innerHTML = `<div class="m-page yp-page ev-page">
    <div class="m-head"><h2>행사계획</h2><p class="muted">행사 정보를 넣으면 구성안 2~3개, 계획서·역할 분담표·안전 점검표·가정통신문, 설문과 결과 보고서까지 만들어요.</p></div>
    <div class="yp-grid">
      <aside class="yp-side" aria-labelledby="evListH">
        <div class="yp-side-h"><b id="evListH">지난 행사</b><button class="btn text" type="button" data-e="new">+ 새 행사</button></div>
        <ul class="yp-list" id="evList"></ul>
      </aside>
      <section class="yp-main" id="evMain"></section>
    </div>
    <input type="file" id="evFile" accept=".csv,.xlsx,.hwp,.hwpx,.pdf,.txt" hidden>
  </div>`;
  renderList();
  renderMain();
}

function renderList() {
  const ul = box && box.querySelector('#evList');
  if (!ul) return;
  const list = listEventPlans();
  ul.innerHTML = list.length ? list.map(e => `<li><button type="button" class="yp-item" data-ev="${esc(e.id)}" ${e.id === ev.id ? 'aria-current="true"' : ''}>
      <b>${esc(e.name || '이름 없는 행사')}</b><span class="muted">${esc(kindName(e.kind))}${e.date ? ' · ' + e.date : ''} · ${e.status === 'final' ? '확정' : '작성 중'}</span></button></li>`).join('')
    : '<li class="muted yp-none">아직 없어요.</li>';
}

function renderMain() {
  const main = box && box.querySelector('#evMain');
  if (!main) return;
  const s = ev.step;
  const body = s === 1 ? step1() : s === 2 ? step2() : `<div class="yp-card"><p class="muted">곧 만들어요.</p></div>`;
  main.innerHTML = stepsHTML(STEPS, s, ev.maxStep)
    + (errs[ev.id] ? `<div class="banner err" role="alert"><span class="grow">${esc(errs[ev.id])}</span></div>` : '')
    + body
    + `<div class="row yp-nav">${s > 1 ? '<button class="btn" type="button" data-e="prev">이전</button>' : ''}<span class="grow"></span>${s < 4 ? '<button class="btn primary" type="button" data-e="next">다음</button>' : ''}</div>`
    + (saved ? `<div class="row yp-del"><button class="btn text yp-danger" type="button" data-e="delete">이 행사 지우기</button></div>` : '');
}

function dateWarnHTML() {
  if (!isDate(ev.date)) return '';
  const ctx = calCtx(), issues = dayIssues(ev.date, ctx);
  if (!issues.length) return '';
  return `<div class="banner warn" id="evDateWarn"><span class="grow"><b>${esc(issues.join(' · '))}</b><br>가까운 가능한 날:
    ${suggestDates(ev.date, ctx).map(d => `<button class="btn tonal" type="button" data-suggest="${d}">${fmtDay(d)}</button>`).join(' ')}</span></div>`;
}

function step1() {
  const f = (id, k, label, { req, ph, type } = {}) => `<label class="yp-f"><span class="lab">${label}${req ? ' <b class="req" aria-hidden="true">*</b>' : ''}</span>
    <input class="field" id="${id}" data-ek="${k}" ${type ? `type="${type}"` : ''} value="${esc(ev[k])}" placeholder="${esc(ph || '')}" autocomplete="off"></label>`;
  return `<div class="yp-card">
      <h3>행사</h3>
      <div class="seg ev-kinds" role="radiogroup" aria-label="행사 종류">${KINDS.map(([id, label]) => `<button type="button" role="radio" data-kind="${id}" aria-pressed="${ev.kind === id}" aria-checked="${ev.kind === id}">${label}</button>`).join('')}</div>
      <div class="yp-fields">
        ${f('evName', 'name', '행사명', { req: true, ph: '예) 가을 운동회' })}
        ${f('evGrades', 'grades', '대상', { req: true, ph: '예) 전교생, 3~4학년' })}
        <label class="yp-f wide"><span class="lab">목적</span><textarea class="field" id="evPurpose" data-ek="purpose" rows="2" placeholder="예) 협동심과 체력 기르기">${esc(ev.purpose)}</textarea></label>
        ${f('evDate', 'date', '날짜', { req: true, type: 'date' })}
        ${f('evPlace', 'place', '장소', { req: true, ph: '예) 운동장' })}
        <div class="yp-f"><span class="lab">실내·야외</span><div class="seg" role="radiogroup" aria-label="실내·야외">
          <button type="button" role="radio" data-outdoor="0" aria-pressed="${!ev.outdoor}" aria-checked="${!ev.outdoor}">실내</button>
          <button type="button" role="radio" data-outdoor="1" aria-pressed="${ev.outdoor}" aria-checked="${ev.outdoor}">야외</button></div></div>
        ${f('evBudget', 'budget', '예산', { ph: '예) 150만 원' })}
      </div>
      <div id="evDateBox">${dateWarnHTML()}</div>
    </div>
    <div class="yp-card">
      <h3>참여 교직원 <span class="muted">(선택 · 이름과 맡은 업무만)</span></h3>
      <div class="ev-staff" id="evStaff">${ev.staff.map((s, i) => `<div class="ev-staff-row">
        <input class="field" data-staff="${i}" data-f="name" value="${esc(s.name)}" placeholder="이름" aria-label="${i + 1}번째 교직원 이름" autocomplete="off">
        <input class="field" data-staff="${i}" data-f="duty" value="${esc(s.duty)}" placeholder="맡은 업무(예: 체육부)" aria-label="${i + 1}번째 교직원 업무" autocomplete="off">
        <button class="icon-btn" type="button" data-staffdel="${i}" aria-label="빼기">×</button></div>`).join('') || '<p class="muted">없으면 역할 분담표를 역할만으로 만들어요.</p>'}</div>
      <div class="row"><button class="btn text" type="button" data-e="staffAdd">+ 교직원 더하기</button></div>
    </div>
    <div class="yp-card">
      <div class="yp-src-h"><h3>작년 설문 결과 <span class="muted">(선택)</span></h3><span class="row"><button class="btn text" type="button" data-e="importMemo">지난 행사 개선 메모 불러오기</button><button class="btn" type="button" data-e="lastFile">파일 넣기</button></span></div>
      <p class="muted">있으면 아쉬운 점을 고친 「보완안」도 만들어요. CSV·엑셀·한글 파일이나 붙여넣기.</p>
      <textarea class="field" id="evLast" rows="4" placeholder="작년 설문 결과나 반성 메모" aria-label="작년 설문 결과">${esc(ev.lastSurvey)}</textarea>
    </div>`;
}

function step2() {
  if (busy[ev.id] === 'options') return `<div class="yp-card"><p class="muted"><span class="spin"></span> 구성안을 만들고 있어요…</p></div>`;
  if (!ev.options || !ev.options.length) return `<div class="yp-card"><p class="muted">구성안을 아직 만들지 않았어요.</p><div class="row"><button class="btn primary" type="button" data-e="options">구성안 만들기</button></div></div>`;
  const card = (o, i) => {
    const picked = ev.picked === i, sum = o.budget.reduce((s, b) => s + b.amount, 0);
    return `<article class="ev-opt${picked ? ' picked' : ''}" data-opt="${i}">
      <div class="ev-opt-h"><span class="yp-tag ${o.label === '보완안' ? 'ok' : 'new'}">${esc(o.label)}</span>${picked ? '<b class="ev-picked">고른 안</b>' : ''}</div>
      ${o.summary ? `<p class="ev-sum">${esc(o.summary)}</p>` : ''}
      <ol class="ev-tt">${o.timetable.map(t => `<li><span class="num">${esc(t.time)}</span> ${esc(t.activity)}${t.place ? ` <span class="muted">· ${esc(t.place)}</span>` : ''}</li>`).join('')}</ol>
      ${o.pros.length ? `<p class="muted">장점: ${o.pros.map(esc).join(', ')}</p>` : ''}
      ${o.staffNeed ? `<p class="muted">필요 인력: ${esc(o.staffNeed)}</p>` : ''}
      ${o.budget.length ? `<p class="muted">예산: ${o.budget.map(b => `${esc(b.name)} ${won(b.amount)}원`).join(', ')} (합계 ${won(sum)}원)</p>` : ''}
      ${picked ? '' : `<button class="btn" type="button" data-pick="${i}">이 안으로</button>`}
    </article>`;
  };
  const p = ev.picked != null ? ev.options[ev.picked] : null;
  return `<div class="ev-opts">${ev.options.map(card).join('')}</div>
    ${p ? `<div class="yp-card"><h3>고른 안의 시간표 <span class="muted">(고칠 수 있어요)</span></h3>
      <div class="yp-tbl-wrap"><table class="yp-tbl" id="evTT"><thead><tr><th>시간</th><th>활동</th><th>장소</th><th></th></tr></thead><tbody>${p.timetable.map((t, j) => `<tr>
        <td><input class="field" data-tt="${j}" data-f="time" value="${esc(t.time)}" aria-label="시간"></td>
        <td><input class="field" data-tt="${j}" data-f="activity" value="${esc(t.activity)}" aria-label="활동"></td>
        <td><input class="field" data-tt="${j}" data-f="place" value="${esc(t.place)}" aria-label="장소"></td>
        <td><button class="icon-btn" type="button" data-ttdel="${j}" aria-label="이 줄 빼기">×</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row"><button class="btn text" type="button" data-e="ttAdd">+ 줄 더하기</button></div></div>` : '<p class="muted">하나를 골라 주세요. 고른 안으로 문서를 만들어요.</p>'}
    <div class="row"><button class="btn text" type="button" data-e="options">다시 만들기 (고른 안·고친 시간표는 사라져요)</button></div>`;
}

/* ---------- AI: 구성안 ---------- */
function optionsPrompt(e) {
  const s = getSchool();
  const hasLast = !!e.lastSurvey.trim();
  return `[행사 구성안]\n학교 행사 계획을 돕는 도우미예요. 아래 행사의 구성안을 ${hasLast ? '3' : '2'}개 만들어 주세요.\n\n`
    + `종류: ${kindName(e.kind)}\n행사명: ${e.name}\n목적: ${e.purpose || '(없음)'}\n대상: ${e.grades}\n날짜: ${e.date}\n장소: ${e.place} (${e.outdoor ? '야외' : '실내'})\n예산: ${e.budget || '(정하지 않음)'}\n`
    + `학교: ${s.name || '(학교명 없음)'}, 학급 ${s.classes || '-'}개, 학생 ${s.students || '-'}명\n`
    + (e.staff.length ? `참여 교직원 ${e.staff.length}명\n` : '')
    + (hasLast ? `\n작년 설문 결과:\n"""\n${e.lastSurvey.slice(0, 8000)}\n"""\n` : '')
    + '\n규칙:\n'
    + (hasLast ? '- 첫 안은 label "보완안": 작년 설문의 아쉬운 점을 고친 안. 나머지는 label "새로운 안": 새 활동을 넣은 안\n' : '- 작년 자료가 없으니 보완안은 만들지 마세요. 모두 label "새로운 안"\n')
    + '- summary: 한 줄 소개\n- timetable: 6~12줄, [{"time":"09:00","activity":"…","place":"…"}]\n- pros: 장점 2~3개\n- staffNeed: 필요 인력 한 줄\n'
    + '- budget: [{"name":"…","amount":0}] (원, 숫자. 예산이 있으면 그 안으로)\n- 안전을 먼저 생각하고, 메모에 없는 사실은 지어내지 않음\n\n'
    + '답은 JSON 하나만: {"options":[{"label":"…","summary":"…","timetable":[…],"pros":["…"],"staffNeed":"…","budget":[…]}]}';
}
async function runOptions() {
  const id = ev.id;
  if (busy[id]) return;
  if (!ai.ready()) { errs[id] = '구성안을 만들 AI를 먼저 정해 주세요. 왼쪽 아래 AI에서 정할 수 있어요.'; renderMain(); return; }
  busy[id] = 'options'; delete errs[id];
  renderMain();
  try {
    const v = await ai.generateJSON(optionsPrompt(ev), { valid: x => x && normOptions(x.options).length > 0 });
    apply(id, e => { e.options = normOptions(v.options); e.picked = null; });
  } catch (err) { errs[id] = ai.errorMessage(err && err.code, err); }
  finish(id, 'options');
}

/* ---------- 단계 이동 ---------- */
function goStep(n) {
  ev.step = n;
  ev.maxStep = Math.max(ev.maxStep, n);
  persist();
  renderMain();
  if (n === 2 && !ev.options) runOptions();
}
function next() {
  if (ev.step === 1) {
    const need = [['evName', 'name'], ['evGrades', 'grades'], ['evDate', 'date'], ['evPlace', 'place']];
    box.querySelectorAll('.field.bad').forEach(el => el.classList.remove('bad'));
    const bad = need.filter(([, k]) => k === 'date' ? !isDate(ev.date) : !String(ev[k]).trim());
    bad.forEach(([id]) => box.querySelector('#' + id).classList.add('bad'));
    if (bad.length) { box.querySelector('.field.bad').focus(); return; }
  }
  if (ev.step === 2 && ev.picked == null) { toast('구성안 하나를 골라 주세요'); return; }
  goStep(Math.min(4, ev.step + 1));
}

function picked() { return ev.options && ev.picked != null ? ev.options[ev.picked] : null; }

function askDelete() {
  const id = ev.id, S = window.SSAM;
  if (!S || !S.openSheet) return;
  S.openSheet(`<h3>「${esc(ev.name || '이름 없는 행사')}」 지우기</h3>
    <p class="muted" style="margin:0">구성안·문서·설문 결과가 모두 지워지고, 학사일정에 넣은 행사 날짜도 빠져요. 되돌릴 수 없어요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" data-e="deleteYes">지우기</button></div>`,
  sh => sh.querySelector('[data-e="deleteYes"]').addEventListener('click', () => {
    deleteEvent(id); removeEvents('event:' + id);
    S.closeSheet();
    ev = listEventPlans()[0] || newEvent(); saved = !!getEvent(ev.id);
    if (saved) setCurrentEvent(ev.id);
    render(); toast('지웠어요');
  }));
}

/* ---------- 입력·누르기 ---------- */
document.addEventListener('input', e => {
  if (!box || !box.contains(e.target) || curTab !== 'event') return;
  const el = e.target;
  if (el.dataset.ek && el.type !== 'date') { ev[el.dataset.ek] = el.value; if (el.value.trim()) el.classList.remove('bad'); }
  else if (el.id === 'evLast') { if (el.value.length > MAX_SRC) { el.value = cap(el.value); toast('앞 6만 자만 저장해요', 4000); } ev.lastSurvey = el.value; }
  else if (el.dataset.staff != null) { const s = ev.staff[+el.dataset.staff]; if (s) s[el.dataset.f] = el.value; }
  else if (el.dataset.tt != null) { const t = picked() && picked().timetable[+el.dataset.tt]; if (t) t[el.dataset.f] = el.value; }
  else return;
  persist();
});
document.addEventListener('change', e => {
  if (!box || !box.contains(e.target) || curTab !== 'event') return;
  const el = e.target;
  if (el.id === 'evDate') {
    ev.date = el.value; if (isDate(el.value)) el.classList.remove('bad');
    persist();
    const b = box.querySelector('#evDateBox'); if (b) b.innerHTML = dateWarnHTML();
  } else if (el.id === 'evFile') {
    const files = [...el.files]; el.value = '';
    // 넣기 시작한 행사(id)에 넣음 — 읽는 동안 다른 행사로 가도 섞이지 않게
    const id = ev.id;
    if (!saved) persist();
    (async () => {
      for (const f of files) {
        try {
          const t = await readText(f);
          const add = x => { x.lastSurvey = cap((x.lastSurvey.trim() ? x.lastSurvey.trim() + '\n\n' : '') + `(파일 「${f.name}」)\n${t}`); };
          if (ev.id === id) { add(ev); persist(); } else apply(id, add);
        } catch (err) { toast(fileMessage(err && err.code), 5000); }
      }
      if (visible() && ev.id === id && ev.step === 1) renderMain();
    })();
  }
});
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || curTab !== 'event') return;
  const item = e.target.closest('[data-ev]');
  if (item) { const x = getEvent(item.dataset.ev); if (x) { ev = x; saved = true; setCurrentEvent(x.id); render(); } return; }
  const st = e.target.closest('[data-step]');
  if (st) { const n = +st.dataset.step; if (n <= ev.maxStep) goStep(n); return; }
  const k = e.target.closest('[data-kind]');
  if (k) { ev.kind = k.dataset.kind; persist(); box.querySelectorAll('[data-kind]').forEach(b => { const on = b === k; b.setAttribute('aria-pressed', on); b.setAttribute('aria-checked', on); }); return; }
  const od = e.target.closest('[data-outdoor]');
  if (od) { ev.outdoor = od.dataset.outdoor === '1'; persist(); box.querySelectorAll('[data-outdoor]').forEach(b => { const on = b === od; b.setAttribute('aria-pressed', on); b.setAttribute('aria-checked', on); }); return; }
  const sg = e.target.closest('[data-suggest]');
  if (sg) { ev.date = sg.dataset.suggest; persist(); const d = box.querySelector('#evDate'); if (d) d.value = ev.date; const b = box.querySelector('#evDateBox'); if (b) b.innerHTML = dateWarnHTML(); return; }
  const sd = e.target.closest('[data-staffdel]');
  if (sd) { ev.staff.splice(+sd.dataset.staffdel, 1); persist(); renderMain(); return; }
  const pk = e.target.closest('[data-pick]');
  if (pk) { ev.picked = +pk.dataset.pick; persist(); renderMain(); return; }
  const td = e.target.closest('[data-ttdel]');
  if (td && picked()) { picked().timetable.splice(+td.dataset.ttdel, 1); persist(); renderMain(); return; }
  const b = e.target.closest('[data-e]');
  if (!b) return;
  const a = b.dataset.e;
  if (a === 'new') { ev = newEvent(); saved = false; render(); box.querySelector('#evName').focus(); }
  else if (a === 'next') next();
  else if (a === 'prev') goStep(Math.max(1, ev.step - 1));
  else if (a === 'options') { if (ev.options) apply(ev.id, x => { x.options = null; x.picked = null; }); runOptions(); }
  else if (a === 'staffAdd') { ev.staff.push({ name: '', duty: '' }); persist(); renderMain(); const r = box.querySelector(`[data-staff="${ev.staff.length - 1}"][data-f="name"]`); if (r) r.focus(); }
  else if (a === 'ttAdd' && picked()) { picked().timetable.push({ time: '', activity: '', place: '' }); persist(); renderMain(); }
  else if (a === 'lastFile') box.querySelector('#evFile').click();
  else if (a === 'delete') askDelete();
});

onEnter('plan', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'ev-box'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'event';
  if (tab === 'event') { const x = getEvent(ev.id); if (x) ev = x; render(); }
});
