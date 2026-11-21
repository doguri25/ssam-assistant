/* 학급 › 진도표·시수 아래 「준비」: 학급, 시간표, 교과 진도표 목록·고치기, 진도표 없는 교과(시수만·전담), 예시 (스펙 2장, 2026-11-18 class-fix A).
   시간표·진도표가 있으면 탭에 들어올 때 접어 두고 진도표·시수 맨 위 [시간표·진도표 고치기]로 엶('class:setup' { open } → 'class:setup-state').
   시간표 칸을 고칠 때 지난 체크 기록이 있으면 한 번 물음: [오늘부터 바꾸기](지난날은 그때 시간표 그대로) / [처음부터 고치기].
   저장하면 'class:changed'를 보내고, 다른 학급 화면은 그것을 듣고 다시 그림 */
import { onEnter, go } from '../../core/shell.js';
import { introHTML } from '../../core/ui-parts.js';
import { registerInbox } from '../../core/inbox.js';
import { getYears, prepYear, currentYear } from '../../core/years.js';
import { toast } from '../../core/ui.js';
import { keepFiles } from '../../core/keep-files.js';
import * as ai from '../../core/ai.js';
import { readText, fileMessage } from '../../core/files.js';
import { getSchool } from '../../core/settings.js';
import { redactText } from '../../core/redact.js';
import { normName, periodStart, lessonYear, parseJindo, parseTimetable, jindoYear } from './class-import.js';
import {
  getInfo, setInfo, getTimetable, setTimetable, listSubjects, saveSubject, removeSubject, setSubjects, resetRecords,
  nextLessonOf, makeCtx, progressOf, setNext, today, normLessons, normTimetableAI, hasTimetable, importSubjects, termStart, replaceLessons, addSubject,
  editCell, replaceTimetable, hasPastRecords, getLog, unitPos, extraSummary, setExtra, clearExtra
} from './class-model.js';
import { sampleData } from './class-sample.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => window.SSAM || {};
const FULL = '저장 공간이 모자라 저장하지 못했어요';
const NAMES = ['국어', '수학', '사회', '과학', '영어', '음악', '미술', '체육', '도덕', '실과', '창체'];
const DAYS = '월화수목금';
let box = null, curTab = null;
let ed = null; // 진도표 고치기 시트에서 고치는 중인 교과 { id, name, lessons, base }
let ttMsg = null; // 시간표 가져오기 안내 { text, ai: AI로 읽기 버튼, busy }
let lastTt = ''; // 우리 반을 못 찾은 시간표 파일 글(AI로 읽기용)
let lastFile = null; // 방금 읽은 진도표 파일 { name, text } — 이 화면에서만 기억(저장 안 함)
let addToken = 0; // 「교과 추가」 시트마다 번호(AI가 끝났을 때 그 시트가 아직 열려 있는지 봄)
let stale = false; // 칸에 치는 중이라 다시 그리지 못한 교과 목록이 있음
let open = true; // 준비를 펼쳤는지(시간표·진도표가 있으면 탭에 들어올 때 접음)
let entered = false; // 학급 › 진도표·시수에 머무는 중(다른 탭·메뉴에 갔다 오면 false)
let ttMode = null; // 이번에 머무는 동안 고른 시간표 칸 고치기: 'today'(오늘부터) · 'all'(처음부터), 아직 안 물었으면 null
const MAX_SRC = 60000;
/* AI로 보내는 시간표·진도표 글: 사람 이름(담임·전담·작성자)·연락처는 자리 표시(〔이름1〕·{{1}})로 가려 보내고(core/redact.js — 이름만 늘어선 명단 줄은 빼고),
   답의 자리 표시는 되돌림(차시 제목 「박지원의 열하일기」처럼 글에 든 이름이 그대로 돌아오게) → { text, back } */
function hideSrc(text) {
  const r = redactText(String(text || '').slice(0, MAX_SRC));
  const back = t => (typeof t === 'string' ? r.back(t).replace(/〔\s*이름\s*\d+\s*〕|\{\{\s*\d+\s*\}\}/g, '○○○') : t);
  return { text: r.text, back };
}
const ACCEPT = '.hwp,.hwpx,.pdf,.csv,.xlsx,.txt';
const FILES = `<input type="file" id="clsTtFile" accept="${ACCEPT}" hidden><input type="file" id="clsJindoFile" accept="${ACCEPT}" hidden>`;
const AI_KEY = '설정 › AI에서 키를 넣어 주세요';

const visible = () => curTab === 'progress' && box && box.isConnected && !box.closest('[hidden]');
const changed = from => document.dispatchEvent(new CustomEvent('class:changed', { detail: { from } }));
const ready = () => hasTimetable(getTimetable()) && listSubjects().length > 0;
/* 준비를 펼쳤는지(진도표·시수의 [시간표·진도표 고치기] 단추가 봄) */
export const setupOpen = () => open || !ready();
function setOpen(v, { focus = false } = {}) {
  open = !!v;
  if (visible()) render();
  document.dispatchEvent(new CustomEvent('class:setup-state', { detail: { open: setupOpen() } }));
  if (focus && open && box && box.firstElementChild) { box.scrollIntoView({ block: 'start' }); const h = box.querySelector('.cls-h2'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
}
const saved = ok => { if (!ok) toast(FULL, 6000); return ok; };

/* ---------- 그리기 ---------- */
function ttHTML(tt) {
  const head = `<tr><th scope="col">교시</th>${[...DAYS].map(d => `<th scope="col">${d}</th>`).join('')}</tr>`;
  const rows = Array.from({ length: tt.periods }, (_, p) => `<tr><th scope="row">${p + 1}</th>${tt.cells.map((day, d) =>
    `<td><input class="field" data-cell="${d}-${p + 1}" list="clsNames" value="${esc(day[p])}" aria-label="${DAYS[d]}요일 ${p + 1}교시"></td>`).join('')}</tr>`).join('');
  return `<div class="cls-tt-wrap"><table class="cls-tt"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}
/* 다음 차시 고르기: 「단원 n/N차시 · 학습 주제」(줄 번호가 아니라 단원 안 차시로), 끝에 「끝(모두 마침)」 */
function nextHTML(s, p) {
  const opts = s.lessons.map((l, i) => { const u = unitPos(s, i); return `<option value="${i + 1}"${p.next === i + 1 ? ' selected' : ''}>${esc(l.unit ? `${l.unit} ` : '')}${u.n}/${u.of}차시 · ${esc(l.title)}</option>`; }).join('');
  return `<label class="cls-next-l">다음 차시 <select class="field cls-next" data-next="${esc(s.id)}">${opts}<option value="${s.lessons.length + 1}"${p.next > s.lessons.length ? ' selected' : ''}>끝(모두 마침)</option></select></label>`;
}
/* 고른 다음 차시를 한눈에(2026-11-21 다른 선생님 변경분): 단원 · 학습 주제 · 단원 안 차시 — 길면 말줄임, 마우스를 올리거나 초점이 가면 다 보임 */
function nextBoxHTML(s, next) {
  const nx = nextLessonOf(s, next);
  if (!nx) return '';
  const full = `${nx.unit ? `${nx.unit} ` : ''}${nx.title} · ${nx.n}/${nx.of}차시`;
  return `<div class="next-lesson" tabindex="0" title="${esc(full)}" data-next-box="${esc(s.id)}">${nx.unit ? `<span class="nl-unit">${esc(nx.unit)}</span> ` : ''}${esc(nx.title)} <span class="nl-no">· ${nx.n}/${nx.of}차시</span></div>`;
}
function subHTML(ctx, s) {
  const p = progressOf(ctx, s);
  const more = s.total != null && s.total !== s.lessons.length ? ` · 파일에는 ${s.total}시간` : '';
  return `<li class="cls-sub" data-sub="${esc(s.id)}">
    <b>${esc(s.name)}</b><span class="muted">${s.lessons.length}차시${more}</span>
    ${nextHTML(s, p)}${nextBoxHTML(s, p.next)}
    <label title="이 앱에서 체크하기 전에 이미 한 시간이에요(다음 차시를 고쳐도 그대로)">체크 전 실시 <input type="number" class="field num" data-h0="${esc(s.id)}" min="0" max="999" value="${s.hours0}"></label>
    ${s.lessons.some(l => l.from) ? '' : `<label title="${p.mode === 'week' ? '진도표 1주(가장 작은 주)가 시작한 날' : '이 날부터 시간표대로 진도를 셈해요'}">${p.mode === 'week' ? '1주 시작일' : '시작일'} <input type="date" class="field" data-start="${esc(s.id)}" value="${esc(s.start)}"></label>`}
    <span class="grow"></span>
    <button class="btn text" type="button" data-c="editSub" data-id="${esc(s.id)}">진도표 고치기</button>
    <button class="btn text" type="button" data-c="delSub" data-id="${esc(s.id)}">삭제</button>
  </li>`;
}
/* 1·2월에 지난 학년도에서 준비하면: 새 학년도를 먼저 시작하라고 알림 (지금 넣은 것은 새 학년도를 시작할 때 가져갈 수 있음) */
function prepNote() {
  let cur = 0;
  try { cur = getYears(window.localStorage).current; } catch (e) { return ''; }
  const next = prepYear(today(), cur);
  return next ? `<div class="banner warn"><span class="grow">${next}학년도 준비라면 설정 › 학년도에서 새 학년도를 먼저 시작해 주세요. 지금 넣으면 ${cur}학년도 자료에 들어가요. (새 학년도를 시작할 때 학급 준비를 가져갈 수도 있어요)</span><button class="btn" type="button" data-c="toYears">학년도로 가기</button></div>` : '';
}
const subsHTML = (subs, ctx) => (subs.length ? `<ul class="cls-subs">${subs.map(s => subHTML(ctx, s)).join('')}</ul>` : '<p class="muted" style="margin:0">아직 넣은 진도표가 없어요. 학교의 「교과 연간지도계획」 한글 파일을 올리면 교과를 한 번에 넣어요.</p>') + extraListHTML(ctx);
/* 시간표에 있는데 진도표가 없는 교과: 오늘 수업에서 체크한 시간만 세요(시수만). 계획 시수를 적거나 「전담」(체크하지 않음)으로 */
function extraListHTML(ctx) {
  const list = extraSummary(ctx);
  if (!list.length) return '';
  return `<div class="cls-xlist"><h4>진도표 없는 교과 <span class="muted">오늘 수업에서 체크한 시간만 세요</span></h4><ul class="cls-subs">${list.map(e => `<li class="cls-sub" data-x="${esc(e.name)}">
    <b>${esc(e.name)}</b><span class="muted">실시 ${e.done}시간</span>
    <label>계획 <input type="number" class="field num" data-xplan="${esc(e.name)}" min="0" max="999" value="${e.plan == null ? '' : e.plan}" placeholder="—" aria-label="${esc(e.name)} 계획 시수"> 시간</label>
    <label class="cls-check"><input type="checkbox" data-xstaff="${esc(e.name)}"${e.staff ? ' checked' : ''}> 전담(체크하지 않음)</label></li>`).join('')}</ul></div>`;
}
const namesHTML = subs => [...new Set([...subs.map(s => s.name), ...NAMES])].map(n => `<option value="${esc(n)}">`).join('');
function render() {
  if (!box) return;
  stale = false;
  // 접혀 있어도 파일 칸은 둠(떠 있는 버튼·끌어 놓기로 받은 파일, 고르기 창이 열린 채 접혀도 들어가게)
  if (!setupOpen()) { keepFiles(box, () => { box.innerHTML = FILES; }); return; }
  const info = getInfo(), tt = getTimetable(), subs = listSubjects(), ctx = makeCtx();
  const html = `<div class="m-page cls-page cls-setup-page">
    <div class="m-head m-head-row"><div><h2 class="cls-h2">준비</h2>${introHTML('class-setup', '학급·시간표·교과 진도표를 넣어요. 학교 한글 파일을 그대로 올려도 돼요.')}</div>${ready() ? '<div class="m-head-act"><button class="btn text" type="button" data-c="fold">준비 접기</button></div>' : ''}</div>
    ${prepNote()}
    <div class="yp-card">
      <h3>학급</h3>
      <div class="row cls-class">
        <label class="yp-f"><span class="lab">학년</span><select class="field" id="clsGrade"><option value="">고르기</option>${[1, 2, 3, 4, 5, 6].map(g => `<option value="${g}"${info.grade === g ? ' selected' : ''}>${g}학년</option>`).join('')}</select></label>
        <label class="yp-f"><span class="lab">반</span><input class="field num" type="number" id="clsRoom" min="1" max="30" value="${info.room || ''}"></label>
      </div>
    </div>
    <div class="yp-card">
      <div class="cls-card-h"><h3>시간표</h3>
        <div class="row"><label class="cls-inline">교시 수 <select class="field" id="clsPeriods">${[4, 5, 6, 7].map(n => `<option${tt.periods === n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn" type="button" data-c="ttFile" data-drop-pick>시간표 파일에서 가져오기</button></div>
      </div>
      <div id="clsTtMsg">${ttMsgHTML()}</div>
      ${ttHTML(tt)}
      <datalist id="clsNames">${namesHTML(subs)}</datalist>
      <p class="muted cls-note">「국어(자)」, 「창체(동)」처럼 괄호를 붙여도 같은 교과로 봐요. 시간표를 바꾸면 지난 체크 기록은 그대로예요(그날만 바꾼 교체·보강은 오늘 수업의 [교과 바꾸기]).</p>
      <input type="file" id="clsTtFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" hidden>
    </div>
    <div class="yp-card">
      <div class="cls-card-h"><h3>교과 진도표</h3>
        <div class="row"><button class="btn primary" type="button" data-c="jindoFile" data-drop-pick>진도표 파일 올리기</button>
        <button class="btn" type="button" data-c="addSub">교과 추가</button>
        <button class="btn text" type="button" data-c="sample">예시로 채우기</button></div>
      </div>
      <div id="clsSubs">${subsHTML(subs, ctx)}</div>
      <input type="file" id="clsJindoFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" hidden>
    </div>
  </div>`;
  keepFiles(box, () => { box.innerHTML = html; }); // 파일 고르기 창이 열린 채 다시 그려도 고른 파일이 들어가게(core/keep-files.js)
}

function ttMsgHTML() {
  if (!ttMsg) return '';
  return `<div class="banner ${ttMsg.err ? 'err' : 'warn'}"><span class="grow">${esc(ttMsg.text)}</span>${ttMsg.ai
    ? `<button class="btn" type="button" data-c="ttAi"${ttMsg.busy ? ' disabled' : ''}>${ttMsg.busy ? 'AI가 읽는 중…' : 'AI로 읽기'}</button>` : ''}</div>`;
}
const drawTtMsg = () => { const el = box && box.querySelector('#clsTtMsg'); if (el) el.innerHTML = ttMsgHTML(); };

/* ---------- 시간표 파일 ---------- */
async function importTt(file) {
  const info = getInfo();
  let text;
  try { text = await readText(file); } catch (err) { toast(fileMessage(err && err.code), 5000); return; }
  const t = parseTimetable(text, info);
  if (t) {
    ttMsg = null;
    putTimetable(t, '새 시간표 파일로 바꿔요.', () => { setOpen(true); changed('setup'); toast('시간표를 가져왔어요'); });
    return;
  }
  lastTt = text;
  ttMsg = { text: `시간표 파일에서 ${info.grade}-${info.room}반을 찾지 못했어요.${ai.ready() ? '' : ' AI 키가 있으면 AI로 읽을 수 있어요(설정 › AI).'}`, ai: ai.ready() };
  if (!setupOpen()) setOpen(true); else drawTtMsg();
}
function ttPrompt(info, text) {
  return `[시간표 읽기]\n아래는 학교 시간표 파일의 글이에요. ${info.grade}학년 ${info.room}반의 시간표만 읽어 주세요.\n\n`
    + '규칙:\n- cells는 요일 5개(월~금), 요일마다 1교시부터 교시 순서대로 과목 이름(괄호 안 교사 이름·자리 표시는 빼고 과목 이름만)\n- 빈 시간은 ""\n- periods는 교시 수(4~7)\n- 파일에 없는 과목은 지어내지 않음\n\n'
    + '답은 JSON 하나만: {"periods":6,"cells":[["국어","수학","사회","과학","체육",""],["…"],["…"],["…"],["…"]]}\n\n'
    + `시간표 글:\n${text}`;
}
/* AI가 읽은 시간표 칸의 자리 표시(가려 보낸 전담 교사 이름)는 되돌리고, 되돌리지 못한 것(○○○)은 괄호째 뺌 — 「영어(〔이름1〕)」가 시간표·주간학습안내에 남지 않게 */
export function ttBack(v, back) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.cells)) return v;
  const cell = c => (typeof c === 'string' ? back(c).replace(/\(\s*(?:○○○\s*)+\)|○○○/g, '').trim() : c);
  return { ...v, cells: v.cells.map(r => (Array.isArray(r) ? r.map(cell) : r)) };
}
async function runTtAi() {
  if (!ai.ready()) { toast(AI_KEY); return; }
  if (!lastTt || (ttMsg && ttMsg.busy)) return;
  const info = getInfo();
  ttMsg = { ...ttMsg, busy: true }; drawTtMsg();
  try {
    const src = hideSrc(lastTt);
    const v = ttBack(await ai.generateJSON(ttPrompt(info, src.text), { valid: x => !!normTimetableAI(x) }), src.back);
    ttMsg = null;
    putTimetable(normTimetableAI(v), 'AI가 읽은 시간표로 바꿔요.', () => { changed('ttAi'); if (visible()) render(); toast('AI가 읽은 시간표를 넣었어요. 칸을 확인해 주세요', 5000); });
  } catch (err) {
    ttMsg = { text: ai.errorMessage(err && err.code, err), ai: true, err: true };
    drawTtMsg();
  }
}

/* 시간표를 언제부터 바꿀지 물음(지난 체크 기록이 있을 때): run('today' | 'all') */
function askWhen(what, run) {
  S().openSheet(`<h3>시간표를 언제부터 바꿀까요?</h3>
    <p class="muted" style="margin:0">${esc(what)} 지난 체크 기록이 있어요.</p>
    <div class="cls-when">
      <button class="btn primary" type="button" id="clsWhenToday">오늘부터 바꾸기</button><span class="muted">지난날은 그때 시간표와 체크 기록 그대로예요.</span>
      <button class="btn" type="button" id="clsWhenAll">처음부터 고치기</button><span class="muted">잘못 넣었을 때 — 지난날 시간표도 바꿔요. 체크한 칸은 기록된 교과 그대로예요.</span>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button></div>`,
  sh => {
    sh.querySelector('#clsWhenToday').addEventListener('click', () => { S().closeSheet(); run('today'); });
    sh.querySelector('#clsWhenAll').addEventListener('click', () => { S().closeSheet(); run('all'); });
  });
}
const fromOf = mode => (mode === 'today' ? today() : '');
/* 시간표 통째로 바꾸기(파일·AI): 지난 기록이 있으면 언제부터인지 물음 */
function putTimetable(t, what, done) {
  const apply = mode => { if (saved(setTimetable(replaceTimetable(getTimetable(), t, fromOf(mode))))) done(); };
  if (hasTimetable(getTimetable()) && hasPastRecords(getLog(), today())) askWhen(what, apply); else apply('all');
}
/* 시간표 칸 하나: 처음 한 번 물은 것을 이번에 머무는 동안 기억 */
function putCell(el, d, p) {
  const name = normName(el.value), cur = getTimetable();
  el.value = cur.cells[d][p - 1];
  if (name === cur.cells[d][p - 1]) return;
  const apply = mode => {
    if (!saved(setTimetable(editCell(getTimetable(), d, p - 1, name, fromOf(mode))))) return;
    const f = box && box.querySelector(`[data-cell="${d}-${p}"]`); if (f) f.value = name;
    if (box && box.querySelector('#clsSubs')) refreshSubs(typing()); // 진도표 없는 교과 목록이 시간표를 따름
    changed('setup');
  };
  if (ttMode) apply(ttMode);
  else if (!hasPastRecords(getLog(), today())) apply('all');
  else askWhen(`${DAYS[d]}요일 ${p}교시를 「${name || '빈 칸'}」(으)로 바꿔요.`, mode => { ttMode = mode; apply(mode); });
}

/* ---------- 진도표 파일: 교과 고르기 ---------- */
async function importJindo(file) {
  let text;
  try { text = await readText(file); } catch (err) { toast(fileMessage(err && err.code), 5000); return; }
  lastFile = { name: file.name, text };
  const r = parseJindo(text, { today: today(), year: currentYear() });
  if (!r.subjects.length) {
    toast('이 파일에서 연간지도계획 표를 찾지 못했어요. 교과 이름을 쓰고 AI로 뽑거나 직접 써 주세요.', 8000);
    openAdd();
    return;
  }
  openPick(r, file.name);
}
function openPick(r, fileName) {
  const have = listSubjects(), ctx = makeCtx();
  const items = r.subjects.map((s, i) => {
    const n = s.lessons.length, first = s.lessons[0].period, lastP = s.lessons[n - 1].period;
    const warn = s.total != null && s.total !== n ? `<span class="cls-warn">파일에는 ${s.total}시간인데 ${n}줄을 읽었어요</span>` : '';
    const old = have.find(h => h.name === s.name), since = old ? termStart(ctx, old, s.lessons) : '';
    const dup = !old ? '' : `<span class="cls-tag">이미 있어요 — 바꿀까요? ${since ? `${+since.slice(5, 7)}/${+since.slice(8, 10)} 앞 체크 기록은 이 진도표에 세지 않아요` : '체크 기록은 그대로'}</span>`;
    return `<li><label><input type="checkbox" data-jpick="${i}"${s.pick ? ' checked' : ''}>
      <b>${esc(s.name)}</b>${s.source !== s.name ? ` <span class="muted">(${esc(s.source)})</span>` : ''}
      <span class="muted">${n}차시${first && lastP ? ` · ${esc(first)} ~ ${esc(lastP)}` : ''}</span></label>${warn}${dup}</li>`;
  }).join('');
  S().openSheet(`<h3>넣을 교과를 골라 주세요</h3>
    <p class="muted" style="margin:0">「${esc(fileName)}」 · ${r.year}학년도. 창체는 영역별 표 대신 「창의적 체험활동」 합계 표를 골라 두었어요.</p>
    <ul class="cls-pick">${items}</ul>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-c="pickOk">넣기</button></div>`,
  sh => sh.querySelector('[data-c="pickOk"]').addEventListener('click', () => {
    const picked = [...sh.querySelectorAll('[data-jpick]')].filter(c => c.checked).map(c => r.subjects[+c.dataset.jpick]);
    if (!picked.length) { toast('교과를 하나 이상 골라 주세요'); return; }
    const ok = importSubjects(picked);
    S().closeSheet();
    if (saved(ok)) { changed('import'); setOpen(true); toast(`교과 ${picked.length}개를 넣었어요. 「다음 차시」와 「체크 전 실시」를 실제대로 고쳐 주세요`, 6000); }
  }));
}

/* ---------- 교과 추가: 파일·붙여넣기 → AI로 차시 뽑기, 또는 직접 쓰기 ---------- */
function openAdd() {
  const token = ++addToken;
  S().openSheet(`<h3 data-add-token="${token}">교과 추가</h3>
    <label class="yp-f"><span class="lab">교과 이름</span><input class="field" id="clsNewName" placeholder="예: 도덕"></label>
    <label class="yp-f"><span class="lab">진도표 글</span><textarea class="field" id="clsNewText" placeholder="진도표 파일을 올리거나 글을 붙여 넣어 주세요"></textarea></label>
    <div class="row"><button class="btn" type="button" data-c="newFile" data-drop-pick>파일 올리기</button><span class="muted" id="clsNewFileName">${lastFile ? `방금 읽은 파일: ${esc(lastFile.name)} (글 칸이 비면 이 파일에서 뽑아요)` : ''}</span></div>
    <input type="file" id="clsNewFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" hidden>
    <div id="clsNewMsg" class="muted"></div>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button>
      <button class="btn" type="button" data-c="manual">직접 쓰기</button><button class="btn primary" type="button" data-c="lessonAi">AI로 차시 뽑기</button></div>`,
  sh => {
    const msg = t => { sh.querySelector('#clsNewMsg').textContent = t; };
    sh.querySelector('#clsNewFile').addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try { lastFile = { name: f.name, text: await readText(f) }; sh.querySelector('#clsNewFileName').textContent = `읽은 파일: ${f.name}`; msg(''); }
      catch (err) { msg(fileMessage(err && err.code)); }
    });
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const name = normName(sh.querySelector('#clsNewName').value);
      if (b.dataset.c === 'newFile') sh.querySelector('#clsNewFile').click();
      else if (b.dataset.c === 'manual') openEditor(listSubjects().find(s => s.name === name) || { id: '', name, lessons: [] });
      else if (b.dataset.c === 'lessonAi') runLessonAi(token, name, sh.querySelector('#clsNewText').value.trim() || (lastFile ? lastFile.text : ''), msg, b);
    });
  });
}
function lessonPrompt(name, text) {
  return `[진도표 읽기]\n아래는 초등학교 교과 진도표(연간지도계획) 글이에요. 「${name}」 교과의 차시 목록만 뽑아 주세요.\n\n`
    + '규칙:\n- 한 줄 = 1시간. 「3~4차시」처럼 두 시간이면 두 줄로 나눔\n- 진도표 순서대로\n'
    + '- week: 주 번호(정수, 없으면 null), period: 기간(예: 9.7~9.12, 없으면 ""), unit: 단원명, title: 학습 주제, pages: 쪽수, memo: 비고\n'
    + '- 진도표에 없는 내용은 지어내지 않음\n- 〔이름1〕·{{1}} 같은 자리 표시는 고치지 말고 그대로 옮김\n\n'
    + '답은 JSON 하나만: {"lessons":[{"week":1,"period":"8.24~8.29","unit":"1. 단원","title":"학습 주제","pages":"10~11","memo":""}]}\n\n'
    + `진도표 글:\n${text}`;
}
async function runLessonAi(token, name, text, msg, btn) {
  if (!ai.ready()) { msg(AI_KEY); return; }
  if (!name) { msg('교과 이름을 넣어 주세요'); return; }
  if (!text) { msg('진도표 파일을 올리거나 글을 붙여 넣어 주세요'); return; }
  if (text.length > MAX_SRC) toast('앞 6만 자만 AI에 보내요', 4000);
  const ym = /(\d{4})\s*학년도/.exec(text);
  btn.disabled = true; msg('AI가 차시를 뽑는 중이에요…');
  let lessons;
  try {
    const src = hideSrc(text);
    const v = await ai.generateJSON(lessonPrompt(name, src.text), { valid: x => x && Array.isArray(x.lessons) });
    // 가린 이름 되돌리기(차시 제목·단원·비고에 옮겨 쓴 자리 표시)
    v.lessons = v.lessons.map(l => (l && typeof l === 'object' ? { ...l, unit: src.back(l.unit), title: src.back(l.title), pages: src.back(l.pages), memo: src.back(l.memo), period: src.back(l.period) } : l));
    // 파일에 학년도가 없으면 지금 자료의 학년도·오늘·뽑은 기간의 요일로 정함(jindoYear)
    const year = ym ? +ym[1] : jindoYear(v.lessons.map(l => l && l.period), { today: today(), year: currentYear() });
    lessons = normLessons(v.lessons, year);
  } catch (err) {
    const open = document.querySelector(`#sheetRoot [data-add-token="${token}"]`);
    if (open) { msg(ai.errorMessage(err && err.code, err)); btn.disabled = false; } else toast(ai.errorMessage(err && err.code, err), 6000);
    return;
  }
  const open = document.querySelector(`#sheetRoot [data-add-token="${token}"]`);
  if (!lessons.length) {
    const t = '이 교과의 차시를 찾지 못했어요. 교과 이름이 파일에 적힌 이름과 같은지 확인해 주세요.';
    if (open) { msg(t); btn.disabled = false; } else toast(t, 6000);
    return;
  }
  const old = listSubjects().find(s => s.name === name);
  // 시트가 그대로면 고치기 시트로, 그사이 닫았거나 다른 일을 하면 시작한 교과 이름으로 바로 저장
  if (open) { openEditor(old ? { ...old, lessons } : { id: '', name, lessons }); return; }
  // 있는 교과는 차시 목록만 바꿈(다음 학기 진도표면 앞 학기 체크는 세지 않음)
  // 새 교과는 계획 진도에 맞춤(지운 교과를 다시 넣어 체크 기록이 남았으면 이어서)
  const s = old ? replaceLessons(old, lessons) : addSubject({ name, lessons });
  if (saved(!!s)) { changed('lessonAi'); toast(`「${name}」 차시 ${lessons.length}개를 넣었어요`, 5000); }
}

/* ---------- 예시·지우기 ---------- */
const hasData = () => listSubjects().length > 0 || hasTimetable(getTimetable());
function applySample() {
  const d = sampleData(today(), getSchool().breaks);
  const ok = setInfo(d.info) && setTimetable(d.timetable) && setSubjects(d.subjects);
  resetRecords();
  clearExtra();
  if (!saved(ok)) return;
  changed('sample');
  toast('예시 자료를 채웠어요');
}
export function askSample() {
  if (!hasData()) { applySample(); return; }
  S().openSheet(`<h3>지금 자료를 지우고 예시로 바꿀까요?</h3>
    <p class="muted" style="margin:0">학급·시간표·진도표·체크 기록·주간학습안내를 지우고 지어낸 예시(3학년 1반)로 채워요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="clsSampleOk">예시로 바꾸기</button></div>`,
  sh => sh.querySelector('#clsSampleOk').addEventListener('click', () => { S().closeSheet(); applySample(); }));
}
function askDelete(id) {
  const s = listSubjects().find(x => x.id === id);
  if (!s) return;
  S().openSheet(`<h3>「${esc(s.name)}」 진도표를 지울까요?</h3>
    <p class="muted" style="margin:0">체크 기록은 남겨 둬요. 같은 이름으로 다시 넣으면 이어져요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="clsDelOk">지우기</button></div>`,
  sh => sh.querySelector('#clsDelOk').addEventListener('click', () => { S().closeSheet(); if (saved(removeSubject(id))) { changed('delete'); toast('지웠어요'); } }));
}

/* ---------- 진도표 고치기 시트 ---------- */
const COLS = [['week', '주', 'num'], ['period', '기간', ''], ['unit', '단원', ''], ['title', '학습 주제', 'wide'], ['pages', '쪽수', ''], ['memo', '비고', '']];
function edRows() {
  return ed.lessons.map((l, i) => `<tr><td class="muted num">${i + 1}</td>${COLS.map(([k, , cls]) =>
    `<td><input class="field ${cls}" data-l="${i}-${k}" value="${esc(l[k] == null ? '' : l[k])}" aria-label="${i + 1}번째 줄 ${COLS.find(c => c[0] === k)[1]}"></td>`).join('')}
    <td><button class="icon-btn" type="button" data-c="delRow" data-i="${i}" aria-label="${i + 1}번째 줄 지우기">×</button></td></tr>`).join('');
}
export function openEditor(sub) {
  ed = { id: sub.id || '', name: sub.name || '', lessons: sub.lessons.map(l => ({ ...l })), base: sub };
  S().openSheet(`<h3>${ed.id ? `「${esc(ed.name)}」 진도표 고치기` : '교과 추가'}</h3>
    <label class="yp-f"><span class="lab">교과 이름</span><input class="field" id="clsEdName" value="${esc(ed.name)}" placeholder="예: 국어"></label>
    <p class="muted" style="margin:0">한 줄이 1시간이에요. 주·기간은 진도표에 있을 때만 써도 돼요(기간 예: 9.7~9.12).</p>
    <div class="cls-ed-wrap"><table class="cls-ed"><thead><tr><th>#</th>${COLS.map(c => `<th scope="col">${c[1]}</th>`).join('')}<th></th></tr></thead><tbody id="clsEdBody">${edRows()}</tbody></table></div>
    <div class="row"><button class="btn" type="button" data-c="addRow">줄 추가</button><span class="grow"></span>
      <button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-c="saveSub">저장</button></div>`,
  sh => {
    sh.classList.add('wide');
    sh.addEventListener('input', e => {
      const el = e.target;
      if (el.id === 'clsEdName') { ed.name = el.value; return; }
      const m = /^(\d+)-(\w+)$/.exec(el.dataset.l || '');
      if (!m || !ed.lessons[+m[1]]) return;
      ed.lessons[+m[1]][m[2]] = m[2] === 'week' ? (/^\d+$/.test(el.value.trim()) ? +el.value.trim() : null) : el.value;
    });
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const body = sh.querySelector('#clsEdBody');
      if (b.dataset.c === 'addRow') {
        const last = ed.lessons[ed.lessons.length - 1] || {};
        ed.lessons.push({ week: last.week == null ? null : last.week, period: last.period || '', from: '', unit: last.unit || '', title: '', pages: '', memo: '' });
        body.innerHTML = edRows();
        const f = sh.querySelector(`input[data-l="${ed.lessons.length - 1}-title"]`); if (f) f.focus();
      } else if (b.dataset.c === 'delRow') { ed.lessons.splice(+b.dataset.i, 1); body.innerHTML = edRows(); }
      else if (b.dataset.c === 'saveSub') saveEditor();
    });
  });
}
function saveEditor() {
  const name = normName(ed.name);
  if (!name) { toast('교과 이름을 넣어 주세요'); return; }
  if (listSubjects().some(s => s.name === name && s.id !== ed.id)) { toast(`「${name}」 교과가 이미 있어요`); return; }
  const known = ed.base.lessons.find(l => l.from);
  const year = known ? lessonYear(known) : jindoYear(ed.lessons.map(l => l.period), { today: today(), year: currentYear() });
  const lessons = ed.lessons.filter(l => String(l.title || '').trim()).map(l => ({ ...l, from: periodStart(l.period, year) }));
  // 있는 교과: 저장된 차시와 견줘 다음 학기 진도표(AI로 뽑음·새로 씀)면 앞 학기 체크는 세지 않음
  const stored = ed.id ? listSubjects().find(x => x.id === ed.id) : null;
  const s = ed.id ? replaceLessons(stored || ed.base, lessons, { name }) : addSubject({ name, lessons });
  if (!saved(!!s)) return;
  S().closeSheet();
  ed = null;
  changed('editor');
  toast('진도표를 저장했어요');
}

/* ---------- 입력 ---------- */
function onChange(el) {
  if (el.id === 'clsGrade' || el.id === 'clsRoom') {
    saved(setInfo({ grade: box.querySelector('#clsGrade').value, room: box.querySelector('#clsRoom').value }));
    changed('setup');
  } else if (el.dataset.cell) {
    const [d, p] = el.dataset.cell.split('-').map(Number);
    putCell(el, d, p);
  } else if (el.id === 'clsPeriods') {
    const tt = getTimetable();
    saved(setTimetable({ ...tt, periods: +el.value }));
    render();
    changed('setup');
  } else if (el.dataset.next) {
    const s = listSubjects().find(x => x.id === el.dataset.next);
    if (!s) return;
    const n = Math.min(s.lessons.length + 1, Math.max(1, Math.round(+el.value) || 1));
    el.value = n;
    const neu = saveSubject(setNext(makeCtx(), s, n));
    saved(!!neu);
    // 다음 차시 상자만 바꿈(목록을 다시 그리지 않음 — 'setup'에서 온 알림은 이 화면이 다시 그리지 않음)
    const li = el.closest('li'), old = li && li.querySelector('[data-next-box]'), html = nextBoxHTML(neu || s, n);
    if (old) old.outerHTML = html || ''; else if (li && html) el.closest('label').insertAdjacentHTML('afterend', html);
    changed('setup');
  } else if (el.id === 'clsTtFile' || el.id === 'clsJindoFile') {
    const f = el.files[0]; el.value = '';
    if (f) (el.id === 'clsTtFile' ? importTt : importJindo)(f);
  } else if (el.dataset.start) {
    const s = listSubjects().find(x => x.id === el.dataset.start);
    if (s) { saved(!!saveSubject({ ...s, start: el.value })); changed('setup'); }
  } else if (el.dataset.h0) {
    const s = listSubjects().find(x => x.id === el.dataset.h0);
    if (!s) return;
    const n = Math.max(0, Math.round(+el.value) || 0);
    el.value = n;
    saved(!!saveSubject({ ...s, hours0: n }));
    changed('setup');
  } else if (el.dataset.xplan != null) {
    const v = el.value.trim(), n = v === '' ? null : Math.max(0, Math.round(+v) || 0);
    el.value = n == null ? '' : n;
    saved(setExtra(el.dataset.xplan, { plan: n }));
    changed('setup');
  } else if (el.dataset.xstaff != null) {
    saved(setExtra(el.dataset.xstaff, { staff: el.checked }));
    changed('setup');
  }
}

onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-setup'; section.append(box); }
  // 탭에 새로 들어오면: 시간표·진도표가 있으면 접어 두고, 시간표 칸을 언제부터 바꿀지는 다시 물음
  if (tab === 'progress' && (!entered || curTab !== 'progress')) { open = !ready(); ttMode = null; }
  entered = tab === 'progress';
  curTab = tab;
  box.hidden = tab !== 'progress';
  if (tab === 'progress') { render(); document.dispatchEvent(new CustomEvent('class:setup-state', { detail: { open: setupOpen() } })); }
});
document.addEventListener('menu:go', e => { if (e.detail.menu !== 'class') entered = false; });
document.addEventListener('class:setup', e => setOpen(!!(e.detail && e.detail.open), { focus: !!(e.detail && e.detail.focus) }));
/* 다른 일(「교과 추가」 AI 등)이 학급 자료를 바꿈: 이 화면 칸에 글을 치는 중이면 칸을 다시 만들지 않고(포커스·한글 조합이 끊기지 않게)
   교과 목록만 바꾸고, 치는 칸이 교과 목록 안이면 칸을 벗어날 때 바꿈 */
const typing = () => { const a = document.activeElement; return a && box && box.contains(a) && a.matches('input, textarea, select') ? a : null; };
function refreshSubs(active) {
  const list = box.querySelector('#clsSubs'), names = box.querySelector('#clsNames');
  if (!list || list.contains(active)) { stale = true; return; }
  const subs = listSubjects();
  list.innerHTML = subsHTML(subs, makeCtx());
  if (names) names.innerHTML = namesHTML(subs);
  stale = false;
}
document.addEventListener('class:changed', e => {
  if (!visible() || (e.detail && e.detail.from === 'setup')) return;
  const a = typing();
  if (a) refreshSubs(a); else render();
});
document.addEventListener('focusout', e => {
  if (!stale || !box || !box.contains(e.target)) return;
  setTimeout(() => { if (!stale || !visible()) return; const a = typing(); if (a) refreshSubs(a); else render(); }, 0);
});
document.addEventListener('change', e => { if (box && box.contains(e.target) && visible()) onChange(e.target); });
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  const b = e.target.closest('[data-c]');
  if (!b) return;
  const c = b.dataset.c;
  if (c === 'toYears') go('settings', 'years');
  else if (c === 'fold') setOpen(false);
  else if (c === 'sample') askSample();
  else if (c === 'delSub') askDelete(b.dataset.id);
  else if (c === 'editSub') { const s = listSubjects().find(x => x.id === b.dataset.id); if (s) openEditor(s); }
  else if (c === 'addSub') openAdd();
  else if (c === 'ttAi') runTtAi();
  else if (c === 'ttFile') {
    const info = getInfo();
    if (!info.grade || !info.room) { toast('먼저 학년·반을 넣어 주세요'); return; }
    box.querySelector('#clsTtFile').click();
  }
  else if (c === 'jindoFile') box.querySelector('#clsJindoFile').click();
});

/* 떠 있는 버튼: 진도표 → 교과 고르기, 기초시간표 → 우리 반 시간표(학년·반이 없으면 입력 칸) */
registerInbox('jindo', {
  one: true,
  act: files => (files.length > 1 ? `학급 › 진도표·시수에 교과 진도표로 넣기 (${files.length}개를 하나씩)` : '학급 › 진도표·시수에 교과 진도표로 넣기'),
  async run(files) {
    go('class', 'progress');
    await importJindo(files[0]);
    return '';
  }
});
registerInbox('timetable', {
  one: true,
  act: () => '학급 › 우리 반 시간표로 넣기',
  fields: () => {
    const i = getInfo();
    return i.grade && i.room ? [] : [
      { key: 'grade', label: '학년', type: 'select', options: [['', '고르기'], ...[1, 2, 3, 4, 5, 6].map(g => [String(g), `${g}학년`])], value: i.grade ? String(i.grade) : '', required: true },
      { key: 'room', label: '반', type: 'number', value: i.room || '', required: true }];
  },
  async run(files, v) {
    if (v.grade && v.room && !saved(setInfo({ grade: +v.grade, room: +v.room }))) return '';
    go('class', 'progress');
    await importTt(files[0]);
    return '';
  }
});
