/* 학급 › 진도표·시수 아래 「준비」: 학급, 시간표, 교과 진도표 목록·고치기, 예시 (스펙 2장).
   저장하면 'class:changed'를 보내고, 다른 학급 화면은 그것을 듣고 다시 그림 */
import { onEnter } from '../../core/shell.js';
import { toast } from '../../core/ui.js';
import * as ai from '../../core/ai.js';
import { readText, fileMessage } from '../../core/files.js';
import { getSchool } from '../../core/settings.js';
import { normName, periodStart, schoolYearOf, parseJindo, parseTimetable } from './class-import.js';
import {
  getInfo, setInfo, getTimetable, setTimetable, listSubjects, saveSubject, removeSubject, setSubjects, resetRecords,
  makeCtx, progressOf, setNext, alignToPlan, today, normLessons, normTimetableAI, hasTimetable
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
const MAX_SRC = 60000;
const AI_KEY = '설정 › AI에서 키를 넣어 주세요';

const visible = () => curTab === 'progress' && box && box.isConnected && !box.closest('[hidden]');
const changed = from => document.dispatchEvent(new CustomEvent('class:changed', { detail: { from } }));
const saved = ok => { if (!ok) toast(FULL, 6000); return ok; };

/* ---------- 그리기 ---------- */
function ttHTML(tt) {
  const head = `<tr><th scope="col">교시</th>${[...DAYS].map(d => `<th scope="col">${d}</th>`).join('')}</tr>`;
  const rows = Array.from({ length: tt.periods }, (_, p) => `<tr><th scope="row">${p + 1}</th>${tt.cells.map((day, d) =>
    `<td><input class="field" data-cell="${d}-${p + 1}" list="clsNames" value="${esc(day[p])}" aria-label="${DAYS[d]}요일 ${p + 1}교시"></td>`).join('')}</tr>`).join('');
  return `<div class="cls-tt-wrap"><table class="cls-tt"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}
function subHTML(ctx, s) {
  const p = progressOf(ctx, s);
  const more = s.total != null && s.total !== s.lessons.length ? ` · 파일에는 ${s.total}시간` : '';
  return `<li class="cls-sub" data-sub="${esc(s.id)}">
    <b>${esc(s.name)}</b><span class="muted">${s.lessons.length}차시${more}</span>
    <label>다음 차시 <input type="number" class="field num" data-next="${esc(s.id)}" min="1" max="${s.lessons.length + 1}" value="${p.next}"></label>
    ${s.lessons.some(l => l.from) ? '' : `<label title="${p.mode === 'week' ? '진도표 1주(가장 작은 주)가 시작한 날' : '이 날부터 시간표대로 진도를 셈해요'}">${p.mode === 'week' ? '1주 시작일' : '시작일'} <input type="date" class="field" data-start="${esc(s.id)}" value="${esc(s.start)}"></label>`}
    <span class="grow"></span>
    <button class="btn text" type="button" data-c="editSub" data-id="${esc(s.id)}">진도표 고치기</button>
    <button class="btn text" type="button" data-c="delSub" data-id="${esc(s.id)}">삭제</button>
  </li>`;
}
function render() {
  if (!box) return;
  const info = getInfo(), tt = getTimetable(), subs = listSubjects(), ctx = makeCtx();
  const names = [...new Set([...subs.map(s => s.name), ...NAMES])];
  box.innerHTML = `<div class="m-page cls-page cls-setup-page">
    <div class="m-head"><h2 class="cls-h2">준비</h2><p class="muted">학급, 시간표, 교과 진도표를 넣어요. 학교에서 받은 한글 파일을 그대로 올려도 돼요.</p></div>
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
        <button class="btn" type="button" data-c="ttFile">시간표 파일에서 가져오기</button></div>
      </div>
      <div id="clsTtMsg">${ttMsgHTML()}</div>
      ${ttHTML(tt)}
      <datalist id="clsNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <p class="muted cls-note">「국어(자)」, 「창체(동)」처럼 괄호를 붙여도 같은 교과로 봐요.</p>
      <input type="file" id="clsTtFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" hidden>
    </div>
    <div class="yp-card">
      <div class="cls-card-h"><h3>교과 진도표</h3>
        <div class="row"><button class="btn primary" type="button" data-c="jindoFile">진도표 파일 올리기</button>
        <button class="btn" type="button" data-c="addSub">교과 추가</button>
        <button class="btn text" type="button" data-c="sample">예시로 채우기</button></div>
      </div>
      ${subs.length ? `<ul class="cls-subs">${subs.map(s => subHTML(ctx, s)).join('')}</ul>` : '<p class="muted" style="margin:0">아직 넣은 진도표가 없어요. 학교의 「교과 연간지도계획」 한글 파일을 올리면 교과를 한 번에 넣어요.</p>'}
      <input type="file" id="clsJindoFile" accept=".hwp,.hwpx,.pdf,.csv,.xlsx,.txt" hidden>
    </div>
  </div>`;
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
    if (saved(setTimetable(t))) { render(); changed('setup'); toast('시간표를 가져왔어요'); }
    return;
  }
  lastTt = text;
  ttMsg = { text: `시간표 파일에서 ${info.grade}-${info.room}반을 찾지 못했어요.${ai.ready() ? '' : ' AI 키가 있으면 AI로 읽을 수 있어요(설정 › AI).'}`, ai: ai.ready() };
  drawTtMsg();
}
function ttPrompt(info, text) {
  return `[시간표 읽기]\n아래는 학교 시간표 파일의 글이에요. ${info.grade}학년 ${info.room}반의 시간표만 읽어 주세요.\n\n`
    + '규칙:\n- cells는 요일 5개(월~금), 요일마다 1교시부터 교시 순서대로 과목 이름\n- 빈 시간은 ""\n- periods는 교시 수(4~7)\n- 파일에 없는 과목은 지어내지 않음\n\n'
    + '답은 JSON 하나만: {"periods":6,"cells":[["국어","수학","사회","과학","체육",""],["…"],["…"],["…"],["…"]]}\n\n'
    + `시간표 글:\n${text.slice(0, MAX_SRC)}`;
}
async function runTtAi() {
  if (!ai.ready()) { toast(AI_KEY); return; }
  if (!lastTt || (ttMsg && ttMsg.busy)) return;
  const info = getInfo();
  ttMsg = { ...ttMsg, busy: true }; drawTtMsg();
  try {
    const v = await ai.generateJSON(ttPrompt(info, lastTt), { valid: x => !!normTimetableAI(x) });
    ttMsg = null;
    if (saved(setTimetable(normTimetableAI(v)))) { changed('ttAi'); if (visible()) render(); toast('AI가 읽은 시간표를 넣었어요. 칸을 확인해 주세요', 5000); }
  } catch (err) {
    ttMsg = { text: ai.errorMessage(err && err.code, err), ai: true, err: true };
    drawTtMsg();
  }
}

/* ---------- 진도표 파일: 교과 고르기 ---------- */
async function importJindo(file) {
  let text;
  try { text = await readText(file); } catch (err) { toast(fileMessage(err && err.code), 5000); return; }
  lastFile = { name: file.name, text };
  const r = parseJindo(text, { today: today() });
  if (!r.subjects.length) {
    toast('이 파일에서 연간지도계획 표를 찾지 못했어요. 교과 이름을 쓰고 AI로 뽑거나 직접 써 주세요.', 8000);
    openAdd();
    return;
  }
  openPick(r, file.name);
}
function openPick(r, fileName) {
  const have = listSubjects();
  const items = r.subjects.map((s, i) => {
    const n = s.lessons.length, first = s.lessons[0].period, lastP = s.lessons[n - 1].period;
    const warn = s.total != null && s.total !== n ? `<span class="cls-warn">파일에는 ${s.total}시간인데 ${n}줄을 읽었어요</span>` : '';
    const dup = have.some(h => h.name === s.name) ? '<span class="cls-tag">이미 있어요 — 바꿀까요? 체크 기록은 그대로</span>' : '';
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
    let ok = true;
    for (const s of picked) {
      const old = listSubjects().find(h => h.name === s.name);
      if (old) { ok = !!saveSubject({ ...old, total: s.total, lessons: s.lessons }) && ok; continue; }
      const neu = saveSubject({ name: s.name, start: today(), offset: 0, total: s.total, lessons: s.lessons });
      ok = !!(neu && saveSubject(alignToPlan(makeCtx(), neu))) && ok;
    }
    S().closeSheet();
    if (saved(ok)) { changed('import'); toast(`교과 ${picked.length}개를 넣었어요. 「다음 차시」를 실제 위치로 고쳐 주세요`, 6000); }
  }));
}

/* ---------- 교과 추가: 파일·붙여넣기 → AI로 차시 뽑기, 또는 직접 쓰기 ---------- */
function openAdd() {
  const token = ++addToken;
  S().openSheet(`<h3 data-add-token="${token}">교과 추가</h3>
    <label class="yp-f"><span class="lab">교과 이름</span><input class="field" id="clsNewName" placeholder="예: 도덕"></label>
    <label class="yp-f"><span class="lab">진도표 글</span><textarea class="field" id="clsNewText" placeholder="진도표 파일을 올리거나 글을 붙여 넣어 주세요"></textarea></label>
    <div class="row"><button class="btn" type="button" data-c="newFile">파일 올리기</button><span class="muted" id="clsNewFileName">${lastFile ? `방금 읽은 파일: ${esc(lastFile.name)} (글 칸이 비면 이 파일에서 뽑아요)` : ''}</span></div>
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
    + '- 진도표에 없는 내용은 지어내지 않음\n\n'
    + '답은 JSON 하나만: {"lessons":[{"week":1,"period":"8.24~8.29","unit":"1. 단원","title":"학습 주제","pages":"10~11","memo":""}]}\n\n'
    + `진도표 글:\n${text.slice(0, MAX_SRC)}`;
}
async function runLessonAi(token, name, text, msg, btn) {
  if (!ai.ready()) { msg(AI_KEY); return; }
  if (!name) { msg('교과 이름을 넣어 주세요'); return; }
  if (!text) { msg('진도표 파일을 올리거나 글을 붙여 넣어 주세요'); return; }
  if (text.length > MAX_SRC) toast('앞 6만 자만 AI에 보내요', 4000);
  const ym = /(\d{4})\s*학년도/.exec(text);
  const year = ym ? +ym[1] : schoolYearOf(today());
  btn.disabled = true; msg('AI가 차시를 뽑는 중이에요…');
  let lessons;
  try {
    const v = await ai.generateJSON(lessonPrompt(name, text), { valid: x => x && Array.isArray(x.lessons) });
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
  let s = saveSubject(old ? { ...old, lessons } : { name, start: today(), offset: 0, total: null, lessons });
  if (s && !old) s = saveSubject(alignToPlan(makeCtx(), s));
  if (saved(!!s)) { changed('lessonAi'); toast(`「${name}」 차시 ${lessons.length}개를 넣었어요`, 5000); }
}

/* ---------- 예시·지우기 ---------- */
const hasData = () => listSubjects().length > 0 || hasTimetable(getTimetable());
function applySample() {
  const d = sampleData(today(), getSchool().breaks);
  const ok = setInfo(d.info) && setTimetable(d.timetable) && setSubjects(d.subjects);
  resetRecords();
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
  const year = known ? schoolYearOf(known.from) : schoolYearOf(today());
  const lessons = ed.lessons.filter(l => String(l.title || '').trim()).map(l => ({ ...l, from: periodStart(l.period, year) }));
  let s = saveSubject(ed.id ? { ...ed.base, name, lessons } : { name, start: today(), offset: 0, total: null, lessons });
  if (s && !ed.id) s = saveSubject(alignToPlan(makeCtx(), s));
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
    const tt = getTimetable();
    tt.cells[d][p - 1] = el.value;
    el.value = normName(el.value);
    saved(setTimetable(tt));
    changed('setup');
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
    saved(!!saveSubject(setNext(makeCtx(), s, n)));
    changed('setup');
  } else if (el.id === 'clsTtFile' || el.id === 'clsJindoFile') {
    const f = el.files[0]; el.value = '';
    if (f) (el.id === 'clsTtFile' ? importTt : importJindo)(f);
  } else if (el.dataset.start) {
    const s = listSubjects().find(x => x.id === el.dataset.start);
    if (s) { saved(!!saveSubject({ ...s, start: el.value })); changed('setup'); }
  }
}

onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-setup'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'progress';
  if (tab === 'progress') render();
});
document.addEventListener('class:changed', e => { if (visible() && !(e.detail && e.detail.from === 'setup')) render(); });
document.addEventListener('change', e => { if (box && box.contains(e.target) && visible()) onChange(e.target); });
document.addEventListener('click', e => {
  if (!box || !box.contains(e.target) || !visible()) return;
  const b = e.target.closest('[data-c]');
  if (!b) return;
  const c = b.dataset.c;
  if (c === 'sample') askSample();
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
