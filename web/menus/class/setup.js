/* 학급 › 진도표·시수 아래 「준비」: 학급, 시간표, 교과 진도표 목록·고치기, 예시 (스펙 2장).
   저장하면 'class:changed'를 보내고, 다른 학급 화면은 그것을 듣고 다시 그림 */
import { onEnter } from '../../core/shell.js';
import { toast } from '../../core/ui.js';
import { getSchool } from '../../core/settings.js';
import { normName, periodStart, schoolYearOf } from './class-import.js';
import {
  getInfo, setInfo, getTimetable, setTimetable, listSubjects, saveSubject, removeSubject, setSubjects, resetRecords,
  makeCtx, progressOf, setNext, alignToPlan, today
} from './class-model.js';
import { sampleData } from './class-sample.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = () => window.SSAM || {};
const FULL = '저장 공간이 모자라 저장하지 못했어요';
const NAMES = ['국어', '수학', '사회', '과학', '영어', '음악', '미술', '체육', '도덕', '실과', '창체'];
const DAYS = '월화수목금';
let box = null, curTab = null;
let ed = null; // 진도표 고치기 시트에서 고치는 중인 교과 { id, name, lessons, base }

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
    ${p.mode === 'slot' ? `<label>시작일 <input type="date" class="field" data-start="${esc(s.id)}" value="${esc(s.start)}"></label>` : ''}
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

/* ---------- 예시·지우기 ---------- */
const hasData = () => listSubjects().length > 0 || getTimetable().cells.some(d => d.some(Boolean));
function applySample() {
  const d = sampleData(today(), getSchool().breaks);
  const ok = setInfo(d.info) && setTimetable(d.timetable) && setSubjects(d.subjects);
  resetRecords();
  if (!saved(ok)) return;
  changed('sample');
  toast('예시 자료를 채웠어요');
}
function askSample() {
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
  else if (c === 'addSub') openEditor({ id: '', name: '', lessons: [] });
  else if (c === 'ttFile') box.querySelector('#clsTtFile').click();
  else if (c === 'jindoFile') box.querySelector('#clsJindoFile').click();
});
