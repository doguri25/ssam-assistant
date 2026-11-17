/* 평가 › 수준별 기준표(루브릭) 시트 (스펙 2026-11-16-rubric-design 「화면 › 2」): 평가요소 하나의 「채점 요소 × 수준」 기준표를 만들고 고침.
   과제 설명([한글 파일에서 가져오기])·요소 수·[3단계|4단계] → [기준표 만들기](AI 업무 plan, 과제 설명의 교직원 이름·연락처는 가려 보내고 되돌림)
   → 요소 카드(세로로 쌓음 — 수준마다 글·점수) → [저장](ssam:rubrics, 과목·평가요소 열쇠마다 하나).
   시트는 한 번에 하나라 묻는 것(고친 칸이 있을 때 다시 만들기·저장 안 한 채 닫기·지우기)은 시트 안 띠로 물음. 닫기·Esc·바깥 누르기 모두 같은 물음.
   규칙·저장·문서는 rubric-model.js. evaluate.js(교과 평어·평가지 채점)는 window.SSAM.rubric으로 부름. 학생 자료는 AI로 보내지 않음 */
import * as ai from '../../core/ai.js';
import { toast } from '../../core/ui.js';
import { get, FULL_MSG } from '../../core/store.js';
import { makeRedactor } from '../../core/redact.js';
import { readText, fileMessage } from '../../core/files.js';
import { aiRowHTML, openRoleSheet } from '../../core/ai-roles.js';
import { aiNoteHTML } from '../../core/ui-parts.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import {
  LV_NAME, unitKey, levelsFor, blankRubric, setLevels, levelPts, addRow, makePrompt, normMade, getFor, saveFor, removeFor,
  sumPoints, gradeBlock, normRb, baseScore, clampScore, evidenceLines, aiCell, levelLines, rubricDoc, docName
} from './rubric-model.js';

const L3 = ['high', 'mid', 'low'], L4 = ['top', 'high', 'mid', 'low'];
const TASK_MAX = 1000, CELL_MAX = 200, NAME_MAX = 40, ROWS_MIN = 2, ROWS_MAX = 5;
const NOTE = '학년·과목·단원·성취기준·평가요소·평가기준과 과제 설명을 보내요. 학생 자료는 보내지 않아요. 교직원 이름·연락처는 가려 보내요.';
const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m9 6 6 6-6 6"/></svg>';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SS = () => window.SSAM || {};
const copy = x => JSON.parse(JSON.stringify(x));
const tr = t => String(t == null ? '' : t).trim();
const int = v => Math.max(0, Math.min(100, Math.round(Number(v)) || 0));
const clampN = n => Math.max(ROWS_MIN, Math.min(ROWS_MAX, Math.round(Number(n)) || 3));

/* 열린 시트(한 번에 하나): u(평가요소 줄), rb(고치는 중인 기준표 — 저장한 것과 따로), saved(저장한 것의 글, 없으면 null),
   base(만들거나 열었을 때의 칸 — 「고친 칸이 있어요」), n(만들 요소 수), ask('remake'|'close'|'delete'), after(닫은 뒤 할 일),
   marks(저장할 때 빈 칸 표시), resume(AI 고르는 창을 닫으면 이 시트로 돌아옴) */
let R = null;

/* ---------- 글 비교 ---------- */
const rowsSig = rb => JSON.stringify([rb.levels, rb.rows.map(r => [tr(r.name), Number(r.points) || 0, rb.levels.map(lv => { const c = r.cells[lv] || {}; return [tr(c.text), Number(c.pts) || 0]; })])]);
const sig = rb => JSON.stringify([rowsSig(rb), tr(rb.task)]);
const rowsHaveText = rb => rb.rows.some(r => tr(r.name) || rb.levels.some(lv => tr((r.cells[lv] || {}).text)));
const edited = () => rowsSig(R.rb) !== R.base;
// 저장한 적이 없으면 쓴 글이 있을 때만 「저장하지 않은 것」
const dirty = () => (R.saved == null ? !!tr(R.rb.task) || rowsHaveText(R.rb) : sig(R.rb) !== R.saved);
const wantsAsk = () => !!R && !R.ro && dirty();
const empties = rb => rb.rows.reduce((n, r) => n + (tr(r.name) ? 0 : 1) + rb.levels.filter(lv => !tr((r.cells[lv] || {}).text)).length, 0);

/* 저장된 것·채점 기록 사본을 시트가 쓰는 꼴로(수준 칸이 빠졌으면 빈 칸) */
function shape(x, u) {
  const lv0 = Array.isArray(x && x.levels) ? x.levels : [];
  const levels = lv0.length === 4 ? [...L4] : lv0.length === 3 ? [...L3] : levelsFor(u);
  const rows = (Array.isArray(x && x.rows) ? x.rows : []).filter(r => r && typeof r === 'object').map((r, i) => ({
    id: r.id || `r${i + 1}`, name: String(r.name || ''), points: int(r.points),
    cells: Object.fromEntries(levels.map(lv => { const c = (r.cells && r.cells[lv]) || {}; return [lv, { text: String(c.text || ''), pts: int(c.pts) }]; }))
  }));
  return { ...copy(x), levels, rows, task: String((x && x.task) || '') };
}
/* 저장·내려받기 꼴: 글 다듬기(줄바꿈은 띄어쓰기, 글자 수), 점수 0~100 */
function clean(rb) {
  const one = (t, max) => tr(String(t == null ? '' : t).replace(/\s*[\r\n]+\s*/g, ' ')).slice(0, max).trim();
  return {
    ...copy(rb), task: tr(rb.task).slice(0, TASK_MAX),
    rows: rb.rows.map(r => ({ id: r.id, name: one(r.name, NAME_MAX), points: int(r.points),
      cells: Object.fromEntries(rb.levels.map(lv => { const c = r.cells[lv] || {}; return [lv, { text: one(c.text, CELL_MAX), pts: int(c.pts) }]; })) }))
  };
}
/* 학년: 부르는 쪽이 준 것 → 학급 메뉴의 학년 */
function gradeOf(g) {
  const n = Number(g) || Number((get('class:info', null) || {}).grade);
  return n >= 1 && n <= 6 ? n : '';
}

/* ---------- 그리기 ---------- */
function infoHTML() {
  const u = R.u || {}, c = u.crit || {}, std = u.std || R.rb.std, unit = u.unit || R.rb.unit;
  const crit = L4.filter(lv => c[lv]).map(lv => `<div class="lv-${lv}"><span class="lvtag">${LV_NAME[lv]}</span><span>${esc(c[lv])}</span></div>`).join('');
  const dl = [unit ? `<dt>단원</dt><dd>${esc(unit)}</dd>` : '', std ? `<dt>성취기준</dt><dd>${esc(std)}</dd>` : '', u.focus ? `<dt>수업·평가 방법</dt><dd>${esc(u.focus)}</dd>` : ''].join('');
  if (!dl && !crit) return '';
  return `<details class="info rb-info"${R.infoOpen ? ' open' : ''}><summary>${CHEV}성취기준과 평가기준 보기</summary><div class="info-body">
    ${dl ? `<dl>${dl}</dl>` : ''}${crit ? `<div class="crit">${crit}</div>` : '<p class="muted" style="margin:0">평가기준(상·중·하)이 없어요.</p>'}</div></details>`;
}
const makeLabel = () => (rowsHaveText(R.rb) ? '다시 만들기' : '기준표 만들기');
function setupHTML() {
  const four = R.rb.levels.length === 4, dis = R.busy ? ' disabled' : '';
  return `<div class="rb-setup">
    <label class="rb-f"><span class="lab">과제 설명 (선택)</span>
      <textarea class="field" id="rbTask" data-rbf="task" rows="2" maxlength="${TASK_MAX}" placeholder="예) 두 자리 수 곱셈을 두 가지 방법으로 풀고 까닭을 씀"${dis}>${esc(R.rb.task)}</textarea></label>
    <div class="row rb-file"><button class="btn text" type="button" data-rb-act="import"${dis}>한글 파일에서 가져오기</button><input type="file" id="rbFile" accept=".hwp,.hwpx" hidden>
      <span class="muted">과제 안내 한글 파일(.hwp·.hwpx)의 글을 넣어요</span></div>
    <div class="rb-opts">
      <label class="rb-n"><span class="lab">채점 요소 수</span><select class="field" id="rbN" data-rbf="n"${dis}>${[2, 3, 4, 5].map(n => `<option value="${n}"${n === R.n ? ' selected' : ''}>${n}개</option>`).join('')}</select></label>
      <div class="rb-lv"><span class="lab" id="rbLvLab">수준</span><div class="seg" role="group" aria-labelledby="rbLvLab">
        <button type="button" data-rb-act="lv" data-lv="3" aria-pressed="${!four}"${dis}>3단계</button><button type="button" data-rb-act="lv" data-lv="4" aria-pressed="${four}"${dis}>4단계</button></div></div>
      <button class="btn primary rb-make" type="button" data-rb-act="make"${dis}><span aria-hidden="true">✦</span> <span class="rb-make-t">${makeLabel()}</span></button>
    </div>
    ${aiRowHTML('plan')}${aiNoteHTML(NOTE)}
    ${R.busy ? '<p class="muted rb-busy" id="rbBusy" role="status"><span class="spin"></span> AI가 기준표를 만들고 있어요…</p>' : ''}
    ${R.ask === 'remake' ? askHTML('remake') : ''}
    ${R.msg ? `<div class="banner err" role="alert" id="rbMsg"><span class="grow">${esc(R.msg)}</span></div>` : ''}
    ${R.note ? `<div class="banner info" id="rbNote"><span class="grow">${esc(R.note)}</span></div>` : ''}</div>`;
}
function rowHTML(r, i) {
  const ro = R.ro ? ' readonly' : '', nm = `${i + 1}번째 요소`;
  const bad = v => (R.marks && !tr(v) ? ' rb-empty" aria-invalid="true' : '');
  return `<li class="rb-row" data-rb-row="${i}">
    <div class="rb-rhead"><b class="rb-no" aria-hidden="true">${i + 1}.</b>
      <input class="field rb-name${bad(r.name)}" data-rbf="name" data-r="${i}" value="${esc(r.name)}" maxlength="${NAME_MAX}" placeholder="채점 요소 이름" aria-label="${nm} 이름" autocomplete="off"${ro}>
      <label class="rb-pts"><span>배점</span><input class="field" type="number" min="0" max="100" inputmode="numeric" data-rbf="points" data-r="${i}" value="${esc(r.points)}" aria-label="${nm} 배점"${ro}><span>점</span></label>
      ${R.ro ? '' : `<button class="btn text" type="button" data-rb-act="del" data-r="${i}" aria-label="${nm} 빼기"${R.rb.rows.length <= ROWS_MIN ? ' disabled' : ''}>빼기</button>`}</div>
    ${R.rb.levels.map(lv => { const c = r.cells[lv] || { text: '', pts: 0 }; return `<div class="rb-lvrow lv-${lv}"><span class="lvtag">${LV_NAME[lv]}</span>
      <textarea class="field${bad(c.text)}" rows="2" maxlength="${CELL_MAX}" data-rbf="text" data-r="${i}" data-lv="${lv}" aria-label="${nm} ${LV_NAME[lv]} 수준 설명"${R.ro ? '' : ' placeholder="이 수준이면 학생이 무엇을 쓰거나 하는지"'}${ro}>${esc(c.text)}</textarea>
      <label class="rb-pts"><input class="field" type="number" min="0" max="100" inputmode="numeric" data-rbf="pts" data-r="${i}" data-lv="${lv}" value="${esc(c.pts)}" aria-label="${nm} ${LV_NAME[lv]} 수준 점수"${ro}><span>점</span></label></div>`; }).join('')}
  </li>`;
}
const sumText = () => { const s = sumPoints(R.rb); return s === 100 ? '배점 합 100점' : `배점 합 ${s}점 — 채점은 100점으로 바꿔 셈해요`; };
const ASK = {
  remake: ['고친 칸이 있어요. 새로 만들까요?', '새로 만들면 지금 칸의 글과 점수가 모두 바뀌어요.', [['remakeOk', '새로 만들기', 'primary'], ['askNo', '취소', '']]],
  close: ['저장하지 않은 것이 있어요.', '저장하지 않고 닫으면 고친 것이 없어져요.', [['closeSave', '저장하고 닫기', 'primary'], ['closeDrop', '저장하지 않고 닫기', ''], ['askNo', '계속 고치기', 'text']]],
  delete: ['이 기준표를 지울까요?', '이 평가요소의 채점·평어에 더는 쓰지 않아요. 지난 채점 기록에 남은 기준표는 그대로예요. 지우면 되돌릴 수 없어요.', [['delOk', '지우기', 'primary'], ['askNo', '취소', '']]]
};
function askHTML(kind) {
  const [title, text, acts] = ASK[kind];
  return `<div class="banner warn rb-ask" id="rbAsk" role="group" aria-labelledby="rbAskT" aria-describedby="rbAskD"><div class="grow"><b id="rbAskT">${title}</b><p id="rbAskD">${text}</p>
    <div class="row">${acts.map(([a, l, c]) => `<button class="btn${c ? ' ' + c : ''}" type="button" data-rb-act="${a}">${l}</button>`).join('')}</div></div></div>`;
}
function bodyHTML() {
  const rb = R.rb, g = R.grade ? `${R.grade}학년 ` : '', s = sumPoints(rb), n = rb.rows.length;
  return `<h3>수준별 기준표 · ${esc(`${g}${rb.subject}`)} · ${esc(rb.elem || rb.unit)}</h3>
    ${infoHTML()}
    ${R.ro ? `<p class="muted rb-ro">${R.snap ? '채점할 때의 기준표예요. 보기만 할 수 있어요.' : '보기만 할 수 있어요.'}</p>${tr(rb.task) ? `<div class="rb-f"><span class="lab">과제 설명</span><textarea class="field" id="rbTask" rows="2" readonly>${esc(rb.task)}</textarea></div>` : ''}` : setupHTML()}
    <fieldset class="rb-set"${R.busy ? ' disabled' : ''}><legend class="lab">채점 요소</legend>
      <ol class="rb-rows">${rb.rows.map(rowHTML).join('')}</ol></fieldset>
    ${R.ro ? '' : `<div class="row"><button class="btn" type="button" data-rb-act="add"${n >= ROWS_MAX || R.busy ? ' disabled' : ''}>+ 요소 더하기</button></div>`}
    <p class="rb-sum${s !== 100 ? ' warn' : ''}" id="rbSum" role="status">${esc(sumText())}</p>
    ${R.ask === 'close' || R.ask === 'delete' ? askHTML(R.ask) : ''}
    ${R.saveMsg ? `<p class="rb-state" id="rbState" role="status">${esc(R.saveMsg)}</p>` : ''}
    <div class="row rb-acts">${exportButton('data-rb-act="export"')}
      ${!R.ro && R.saved != null ? '<button class="btn text rb-del" type="button" data-rb-act="delete">이 기준표 지우기</button>' : ''}
      <span class="grow"></span><button class="btn" type="button" data-rb-act="close">닫기</button>
      ${R.ro ? '' : `<button class="btn primary" type="button" data-rb-act="save"${R.busy ? ' disabled' : ''}>저장</button>`}</div>`;
}
/* 다시 그리기 → 초점(focus 고르개, 없으면 묻는 띠의 첫 단추) */
function draw(focus) {
  const box = document.getElementById('rbSheet');
  if (!box || !R) return;
  box.innerHTML = bodyHTML();
  const el = focus && box.querySelector(focus);
  if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); return; }
  const ask = R.ask && box.querySelector('#rbAsk');
  if (ask) { ask.scrollIntoView({ block: 'nearest' }); ask.querySelector('button').focus({ preventScroll: true }); }
}
/* 글을 칠 때는 다시 그리지 않고 배점 합·만들기 단추 이름만 */
function sync() {
  const box = document.getElementById('rbSheet'), sum = box && box.querySelector('#rbSum');
  if (sum) { sum.textContent = sumText(); sum.classList.toggle('warn', sumPoints(R.rb) !== 100); }
  const mk = box && box.querySelector('.rb-make-t');
  if (mk) mk.textContent = makeLabel();
}

/* ---------- 열고 닫기 ---------- */
function mount() {
  SS().openSheet(`<div id="rbSheet" class="rb-sheet">${bodyHTML()}</div>`, sh => {
    sh.classList.add('wide', 'rb-wide');
    const box = sh.querySelector('#rbSheet'), bg = document.getElementById('sheetBg');
    box.addEventListener('click', onClick);
    box.addEventListener('input', onInput);
    box.addEventListener('change', onChange);
    box.addEventListener('toggle', e => { if (R && e.target.classList && e.target.classList.contains('rb-info')) R.infoOpen = e.target.open; }, true);
    // 바깥(어두운 곳)을 눌러 닫을 때도 저장하지 않은 것이 있으면 묻기 (시트 틀의 닫기보다 먼저)
    if (bg) bg.addEventListener('click', e => { if (e.target === bg && wantsAsk()) { e.stopImmediatePropagation(); requestClose(); } }, true);
  });
  watch();
}
/* 시트가 닫히거나 다른 시트로 바뀌면 정리. AI 고르는 창([바꾸기])이었으면 그 창을 닫은 뒤 이 시트를 다시 엶(고친 것 그대로) */
function watch() {
  const me = R, root = document.getElementById('sheetRoot');
  if (!me || me.obs || !root) return;
  me.obs = new MutationObserver(() => {
    if (R !== me) { me.obs.disconnect(); return; }
    if (root.querySelector('#rbSheet')) return;
    if (me.resume) {
      if (root.querySelector('#aiRoleSheet')) return;
      me.resume = false;
      if (!root.children.length) { mount(); return; }
    }
    end();
  });
  me.obs.observe(root, { childList: true });
  window.addEventListener('keydown', onKey, true);
}
function end() {
  if (!R) return;
  if (R.obs) R.obs.disconnect();
  window.removeEventListener('keydown', onKey, true);
  R = null;
}
/* Esc: 형식 고르기 목록이 떠 있으면 그것만, 묻는 띠가 있으면 띠만 닫고, 저장하지 않은 것이 있으면 묻기 (시트 틀의 Esc 닫기보다 먼저) */
function onKey(e) {
  if (e.key !== 'Escape' || !R || !document.getElementById('rbSheet')) return;
  const menu = document.getElementById('expMenu');
  if (menu) { e.stopPropagation(); menu.remove(); return; }
  if (R.ask) { e.stopPropagation(); R.ask = null; R.after = null; draw(); return; }
  if (wantsAsk()) { e.stopPropagation(); requestClose(); }
}
function requestClose(after) {
  if (!R) return;
  if (wantsAsk()) { R.ask = 'close'; R.after = after || null; draw(); return; }
  finish(after);
}
function finish(after) { SS().closeSheet(); if (after) after(); }
// [AI로 보낸 글 보기](ui-parts): 시트를 닫은 뒤 같은 단추를 눌러 설정 › AI로 감
const goAiLog = () => { const b = Object.assign(document.createElement('button'), { type: 'button', hidden: true }); b.dataset.goAilog = ''; document.body.append(b); b.click(); b.remove(); };

/* ---------- 만들기 ---------- */
async function make() {
  const me = R;
  if (!me || me.busy || me.ro) return;
  me.ask = null;
  if (!ai.ready()) { me.msg = 'AI 키가 없어 만들 수 없어요. 설정 › AI에서 키를 넣어 주세요. 칸에 직접 써도 돼요.'; draw(); return; }
  const u = me.u, rows = me.n, levels = [...me.rb.levels];
  const redactor = makeRedactor(); // 같은 가리개로 보내고 되돌림(과제 설명의 교직원 이름)
  const prompt = makePrompt(u, { task: tr(me.rb.task).slice(0, TASK_MAX), rows, levels, grade: me.grade, redactor });
  me.busy = true; me.msg = ''; me.note = ''; me.saveMsg = ''; me.marks = false;
  draw();
  try {
    const out = await ai.generateJSON(prompt, { task: 'plan', valid: x => !!normMade(x, u, { rows, levels }) });
    const made = normMade(out, u, { rows, levels, redactor });
    if (!made) throw { code: 'bad_json' };
    if (R !== me) return;
    made.task = me.rb.task;
    me.rb = made; me.base = rowsSig(made);
    me.note = made.rows.length < rows ? `AI가 요소 ${made.rows.length}개만 만들었어요. [요소 더하기]로 더할 수 있어요.` : '';
  } catch (e) {
    if (R !== me) return;
    me.msg = e && e.code === 'bad_json' ? '기준표를 만들지 못했어요. 다시 해 볼까요?' : ai.errorMessage(e && e.code, e);
  }
  me.busy = false;
  draw();
}

/* ---------- 저장·지우기·내려받기·가져오기 ---------- */
/* → 저장했으면 true. 빈 이름·빈 칸이 있으면 표시하고 저장은 함(채점 글에서는 빈 칸을 뺌), 그때는 닫지 않음(closing이면 닫음) */
function save({ closing = false } = {}) {
  const me = R;
  if (!me || me.ro || me.busy) return false;
  const rb = clean(me.rb);
  if (!rowsHaveText(rb)) { me.ask = null; me.saveMsg = '기준표가 비어 있어요. [기준표 만들기]를 누르거나 칸을 써 주세요.'; draw(); return false; }
  // 바뀐 것이 없으면 다시 쓰지 않음 — 고친 때(at)가 그대로여야 지난 채점 기록에 「바뀐 기준표」 알림이 잘못 뜨지 않음
  const same = me.saved != null && sig(rb) === me.saved && !!getFor(me.u);
  if (!same && !saveFor(me.u, copy(rb))) { me.ask = null; me.saveMsg = FULL_MSG; draw(); return false; }
  const got = shape(getFor(me.u), me.u);
  me.rb = copy(got); me.saved = sig(got); me.ask = null; me.msg = '';
  try { if (me.onSave) me.onSave(copy(got)); } catch (e) {}
  toast('수준별 기준표를 저장했어요');
  const blank = empties(got);
  if (blank && !closing) { me.marks = true; me.saveMsg = `저장했어요. 빈 칸 ${blank}곳(표시한 곳)은 채점·평어에 쓰지 않아요.`; draw(); return true; }
  if (!closing) finish();
  return true;
}
function removeIt() {
  const me = R;
  if (!me || me.ro) return;
  removeFor(me.u);
  try { if (me.onSave) me.onSave(null); } catch (e) {}
  finish();
  toast('수준별 기준표를 지웠어요');
}
async function download() {
  const rb = clean(R.rb), grade = R.grade;
  try { toast(await exportDoc(rubricDoc(rb, { grade }), docName(rb)), 6000); } catch (e) { toast('파일을 저장하지 못했어요'); }
}
async function importFile(file) {
  const me = R;
  if (!file || !me || me.ro) return;
  if (!/\.hwpx?$/i.test(file.name || '')) { toast('한글 파일(.hwp·.hwpx)을 골라 주세요.', 5000); return; }
  let t;
  try { t = tr(await readText(file)); } catch (e) { toast(fileMessage(e && e.code), 6000); return; }
  if (R !== me) return;
  if (!t) { toast('파일에서 글을 찾지 못했어요.', 5000); return; }
  const next = [tr(me.rb.task), t].filter(Boolean).join('\n');
  me.rb.task = next.slice(0, TASK_MAX);
  const ta = document.querySelector('#rbSheet #rbTask');
  if (ta) ta.value = me.rb.task;
  sync();
  toast(next.length > TASK_MAX ? '과제 설명은 1,000자까지라 뒷부분은 뺐어요. 확인해 주세요.' : '파일 글을 과제 설명 칸에 넣었어요. 확인해 주세요(원본 파일은 저장하지 않아요).', 6000);
}

/* ---------- 누르기·쓰기 ---------- */
function onClick(e) {
  if (!R) return;
  const ed = e.target.closest('[data-ai-edit]');
  if (ed) { e.preventDefault(); e.stopPropagation(); R.resume = true; openRoleSheet(ed.dataset.aiEdit); return; }
  if (e.target.closest('[data-go-ailog]')) { if (wantsAsk()) { e.stopPropagation(); requestClose(goAiLog); } else finish(); return; }
  const b = e.target.closest('[data-rb-act]');
  if (!b || b.disabled) return;
  const a = b.dataset.rbAct;
  if (a === 'make') { if (R.busy) return; if (edited()) { R.ask = 'remake'; draw(); } else make(); }
  else if (a === 'remakeOk') make();
  else if (a === 'askNo') { const was = R.ask; R.ask = null; R.after = null; draw(was === 'remake' ? '[data-rb-act="make"]' : was === 'delete' ? '[data-rb-act="delete"]' : '[data-rb-act="close"]'); }
  else if (a === 'closeSave') { const after = R.after; if (save({ closing: true })) finish(after); }
  else if (a === 'closeDrop') finish(R.after);
  else if (a === 'close') requestClose();
  else if (a === 'save') save();
  else if (a === 'delete') { R.ask = 'delete'; draw(); }
  else if (a === 'delOk') removeIt();
  else if (a === 'export') download();
  else if (a === 'import') { const f = document.querySelector('#rbSheet #rbFile'); if (f) f.click(); }
  else if (a === 'lv') {
    const lvs = b.dataset.lv === '4' ? L4 : L3;
    if (R.rb.levels.length === lvs.length) return;
    const was = edited();
    R.rb = setLevels(R.rb, lvs);
    if (!was) R.base = rowsSig(R.rb); // 고치지 않았으면 단계 바꾸기는 「고친 칸」이 아님
    draw(`[data-rb-act="lv"][data-lv="${lvs.length}"]`);
  } else if (a === 'add') {
    if (R.rb.rows.length >= ROWS_MAX) return;
    R.rb = addRow(R.rb);
    draw(`[data-rbf="name"][data-r="${R.rb.rows.length - 1}"]`);
  } else if (a === 'del') {
    const i = Number(b.dataset.r);
    if (R.rb.rows.length <= ROWS_MIN || !R.rb.rows[i]) return;
    R.rb.rows.splice(i, 1);
    draw(`[data-rb-act="del"][data-r="${Math.min(i, R.rb.rows.length - 1)}"]:not([disabled])`);
  }
}
function onInput(e) {
  const el = e.target, f = el.dataset && el.dataset.rbf;
  if (!R || R.ro || !f || f === 'n') return;
  const i = Number(el.dataset.r), r = R.rb.rows[i], lv = el.dataset.lv;
  if (f === 'task') R.rb.task = el.value;
  else if (!r) return;
  else if (f === 'name') r.name = el.value;
  else if (f === 'text' && r.cells[lv]) r.cells[lv].text = el.value;
  else if (f === 'pts' && r.cells[lv]) r.cells[lv].pts = int(el.value);
  else if (f === 'points') {
    // 수준 점수를 고치지 않았으면(그 배점의 기본 점수 그대로) 새 배점에 따라감 — 고친 점수는 그대로
    const lvs = R.rb.levels, was = levelPts(r.points, lvs), follow = lvs.every(l => r.cells[l].pts === was[l]);
    r.points = int(el.value);
    if (follow) {
      const now = levelPts(r.points, lvs);
      lvs.forEach(l => { r.cells[l].pts = now[l]; const x = el.closest('.rb-row').querySelector(`[data-rbf="pts"][data-lv="${l}"]`); if (x) x.value = now[l]; });
    }
  }
  if (el.classList.contains('rb-empty') && tr(el.value)) { el.classList.remove('rb-empty'); el.removeAttribute('aria-invalid'); }
  sync();
}
function onChange(e) {
  const el = e.target;
  if (!R || R.ro) return;
  if (el.id === 'rbFile') { const file = el.files && el.files[0]; el.value = ''; importFile(file); return; }
  const f = el.dataset && el.dataset.rbf, r = R.rb.rows[Number(el.dataset.r)];
  if (f === 'n') {
    R.n = clampN(el.value);
    // 아직 아무것도 쓰지 않은 빈 카드면 고른 수만큼 바꿔 보여 줌(쓴 것이 있으면 다음 만들기에만)
    if (!rowsHaveText(R.rb) && !edited()) { R.rb.rows = blankRubric(R.u, { rows: R.n, levels: R.rb.levels }).rows; R.base = rowsSig(R.rb); draw('#rbN'); }
  } else if (f === 'points' && r) el.value = r.points;
  else if (f === 'pts' && r && r.cells[el.dataset.lv]) el.value = r.cells[el.dataset.lv].pts;
}

/* ---------- 밖에 내보내기 ---------- */
/* 기준표 시트 열기 → 열었으면 true. snapshot(채점 기록 사본)·readOnly면 보기만(만들기·저장·지우기 없음).
   onSave(rb): 저장하면 저장한 기준표, 지우면 null. grade: 학년(없으면 학급 메뉴의 학년) */
export function open(u, { onSave, readOnly = false, snapshot = null, grade } = {}) {
  if (!SS().openSheet) return false;
  if (!snapshot && !unitKey(u)) { toast('과목과 평가요소가 있어야 수준별 기준표를 만들 수 있어요.', 5000); return false; }
  const stored = snapshot ? null : getFor(u);
  if (readOnly && !snapshot && !stored) { toast('아직 수준별 기준표가 없어요.', 4000); return false; }
  end();
  const rb = snapshot ? shape(snapshot, u) : stored ? shape(stored, u) : blankRubric(u);
  R = {
    u: u || null, onSave: typeof onSave === 'function' ? onSave : null, ro: !!(readOnly || snapshot), snap: !!snapshot, grade: gradeOf(grade),
    rb, saved: stored ? sig(rb) : null, base: rowsSig(rb), n: clampN(rb.rows.length),
    busy: false, msg: '', note: '', saveMsg: '', ask: null, after: null, marks: false, resume: false, infoOpen: false, obs: null
  };
  mount();
  return true;
}

/* 교과 평어 평가요소 화면 한 줄: 기준표가 없으면 [수준별 기준표 만들기], 있으면 요약 + [보기·고치기]. same: 같은 과목·평가요소 줄 수 */
export function paneLineHTML(u, { same = 1 } = {}) {
  if (!unitKey(u)) return '';
  const rb = getFor(u), more = same > 1 ? `<span class="muted rb-same">같은 평가요소 ${same}곳에 쓰여요</span>` : '';
  if (!rb) return `<div class="rb-line"><button class="btn tonal" type="button" data-rb="open">수준별 기준표 만들기</button>${more}</div>`;
  return `<div class="rb-line"><span class="rb-line-t">수준별 기준표 · 요소 ${(rb.rows || []).length}개 · ${(rb.levels || L3).length}단계</span><button class="btn text" type="button" data-rb="open">보기·고치기</button>${more}</div>`;
}
/* 평가지 채점 1단계 한 줄: 채점 기록 사본이 있으면 [보기]만, 아니면 기준표가 있으면 [보기·고치기], 없으면 [수준별 기준표 만들기].
   graded(사본 없이 채점한 학생이 있음 — 이 기록의 [다시 채점]·남은 학생은 기준표를 쓰지 않음)면 「이 채점은 … 없이 했어요」를 앞에 두고
   단추는 그대로(지금 기준표를 고쳐 두면 [새 채점]부터 씀). 직접 입력(u 없음)·열쇠 없음·사본 없이 채점 중(locked)이면 '' */
export function grLineHTML(u, { snapshot = null, locked = false, graded = false } = {}) {
  if (!u || !unitKey(u)) return '';
  if (snapshot) return `<div class="rb-line"><span class="rb-line-t">수준별 기준표로 채점했어요 · 요소 ${(snapshot.rows || []).length}개</span><button class="btn text" type="button" data-rb="view">보기</button></div>`;
  if (locked) return '';
  const rb = getFor(u);
  const make = '<button class="btn tonal" type="button" data-rb="open">수준별 기준표 만들기</button>';
  if (graded) return `<div class="rb-line"><span class="rb-line-t">이 채점은 수준별 기준표 없이 했어요. 기준표는 [새 채점]부터 써요.</span>${rb ? '<button class="btn text" type="button" data-rb="open">보기·고치기</button>' : make}</div>`;
  if (!rb) return `<div class="rb-line">${make}</div>`;
  return `<div class="rb-line"><span class="rb-line-t">수준별 기준표로 채점해요 · 요소 ${(rb.rows || []).length}개</span><button class="btn text" type="button" data-rb="open">보기·고치기</button></div>`;
}

if (typeof window !== 'undefined') {
  window.SSAM = window.SSAM || {};
  window.SSAM.rubric = { getFor, unitKey, levelLines, gradeBlock, normRb, baseScore, clampScore, evidenceLines, aiCell, sumPoints, LV_NAME, paneLineHTML, grLineHTML, open };
}
