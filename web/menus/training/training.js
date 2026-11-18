/* 연수 메뉴 화면 (스펙 2026-11-18-training-design): 내 필수연수(mine) · 연수 현황판(board). 규칙·저장은 training-model.js.
   AI를 부르지 않음 — 이수증·명단은 이 컴퓨터 안에서만 읽고(core/files readText), 파일은 저장하지 않음(이름·이수일·시간만) */
import { onEnter, go } from '../../core/shell.js';
import { toast, copyText, saveFile } from '../../core/ui.js';
import { introHTML } from '../../core/ui-parts.js';
import { keepFiles } from '../../core/keep-files.js';
import { readText } from '../../core/files.js';
import { readTable } from '../../core/sheet.js';
import { currentYear } from '../../core/years.js';
import * as T from './training-model.js';
import { registerInbox } from '../../core/inbox.js';

const SS = () => window.SSAM;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = d => (T.isDate(d) ? `${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '');
const FULL = '저장 공간이 모자라 저장하지 못했어요. 설정 › 백업에서 지난 자료를 내려받고 정리해 주세요.';
const CERT_ACCEPT = '.pdf,.hwp,.hwpx,.docx,.txt,image/*';
const READABLE = /\.(pdf|hwpx?|docx|txt)$/i;
let box = null, tab = 'mine';
// 못 맞춘 이수증(파일 이름·읽은 이수일·시간): 내 필수연수 / 현황판
let minePend = [], boardPend = [], busy = false;

/* 이수증 글 읽기(사진·스캔은 '') */
async function certText(f) {
  if (!READABLE.test(f.name)) return '';
  try { return await readText(f); } catch (e) { return ''; }
}
const ddHTML = (due, t) => { const n = T.dday(due, t); return n == null ? '' : `<span class="tr-dd${n < 0 ? ' late' : n <= 3 ? ' hot' : ''}">${esc(T.ddayText(n))}</span>`; };

/* ---------- 내 필수연수 ---------- */
function itemHTML(x, t) {
  const st = `<span class="tr-st tr-st-${x.status}">${esc(T.statusLabel(x.status))}</span>`;
  const meta = [x.due ? `기한 ${md(x.due)} ${!T.isDone(x.status) ? ddHTML(x.due, t) : ''}` : '', x.hours ? `${x.hours}시간` : '', x.where ? esc(x.where) : ''].filter(Boolean).join(' · ');
  const act = x.status === 'todo' || x.status === 'back' ? `<button class="btn tiny" type="button" data-tr="st" data-st="done" data-id="${esc(x.id)}">이수함</button>`
    : x.status === 'done' ? `<button class="btn tiny" type="button" data-tr="st" data-st="sent" data-id="${esc(x.id)}">제출함</button>`
      : x.status === 'sent' ? `<button class="btn tiny" type="button" data-tr="st" data-st="ok" data-id="${esc(x.id)}">확인 완료</button><button class="btn text tiny" type="button" data-tr="back" data-id="${esc(x.id)}">반려</button>` : '';
  return `<li class="tr-item tr-${x.status}" data-tr-item="${esc(x.id)}">
    <div class="tr-main"><b class="tr-title">${esc(x.title)}</b> ${st}<div class="muted tr-meta">${meta}</div>
      ${x.cert ? `<div class="muted tr-cert">이수증: ${esc(x.cert)}${x.doneDate ? ` (${md(x.doneDate)} 이수)` : ''}</div>` : x.doneDate ? `<div class="muted tr-cert">${md(x.doneDate)} 이수</div>` : ''}
      ${x.status === 'back' && x.note ? `<div class="tr-back">반려: ${esc(x.note)}</div>` : ''}</div>
    <div class="row tr-act">${act}
      <button class="btn text tiny" type="button" data-tr="cert" data-id="${esc(x.id)}" data-drop-pick>이수증 넣기</button>
      <button class="btn text tiny" type="button" data-tr="edit" data-id="${esc(x.id)}">고치기</button>
      <button class="btn text tiny" type="button" data-tr="del" data-id="${esc(x.id)}">지우기</button>
      <input type="file" id="trCert-${esc(x.id)}" hidden accept="${CERT_ACCEPT}"></div>
  </li>`;
}
function pendHTML(list, items) {
  if (!list.length) return '';
  const opts = items.map(x => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join('');
  return `<div class="yp-card tr-pend"><h3>어느 연수 이수증인지 골라 주세요</h3><ul class="tr-pend-list">${list.map((p, i) => `<li>
    <span class="tr-file">${esc(p.name)}</span><select class="field" data-tr-pick="${i}" aria-label="${esc(p.name)} 연수"><option value="">연수 고르기</option>${opts}</select>
    <button class="btn tiny primary" type="button" data-tr="pendPut" data-i="${i}">넣기</button><button class="btn text tiny" type="button" data-tr="pendDrop" data-i="${i}">버리기</button></li>`).join('')}</ul></div>`;
}
function renderMine() {
  const t = today(), list = T.listMine(), s = T.mineSummary(list, t), y = currentYear(t);
  const head = `<div class="m-head m-head-row"><div><h2>내 필수연수 <span class="muted">(${y}학년도)</span></h2>
    ${introHTML('training-mine', '올해 들어야 하는 연수의 기한을 챙기고 이수증을 넣어 이수를 기록해요. 이수증은 이 컴퓨터에서만 읽고(AI로 보내지 않아요) 파일 이름·이수일·시간만 남겨요 — 파일은 컴퓨터에 그대로 두세요. 공문 처리에서 연수 공문을 넣으면 [내 필수연수에 넣기]가 떠요.')}</div>
    <div class="m-head-act"><button class="btn" type="button" data-tr="defaults">기본 목록 넣기</button><button class="btn" type="button" data-tr="add">+ 연수 더하기</button>
      <button class="btn primary" type="button" data-tr="certs" data-drop-pick${busy ? ' disabled' : ''}>${busy ? '<span class="spin"></span>읽는 중…' : '이수증 넣기'}</button>
      <input type="file" id="trMineFiles" hidden multiple accept="${CERT_ACCEPT}"></div></div>`;
  if (!list.length) {
    box.innerHTML = `<div class="m-page tr-page">${head}<div class="empty"><h3>아직 연수가 없어요</h3>
      <p>[기본 목록 넣기]로 흔히 받는 법정 의무연수 이름을 넣거나, 공문 처리에서 연수 공문의 [내 필수연수에 넣기]를 눌러 보세요. 시간·기한은 학교·교육청마다 달라 공문을 보고 넣어 주세요.</p>
      <div class="row" style="justify-content:center"><button class="btn primary" type="button" data-tr="defaults">기본 목록 넣기</button><button class="btn" type="button" data-tr="gongmun">공문 처리로</button></div></div></div>`;
    return;
  }
  box.innerHTML = `<div class="m-page tr-page">${head}
    <div class="yp-card tr-sum"><b>올해 필수연수 ${s.total}개 중 ${s.done}개 이수</b>${s.hours ? ` · 이수 시간 ${s.hours}시간` : ''}
      ${s.late ? `<span class="tr-late">기한 지난 연수 ${s.late}개</span>` : ''}${s.back ? `<span class="tr-late">반려 ${s.back}개</span>` : ''}
      <div class="tr-bar" aria-hidden="true"><i style="width:${s.total ? Math.round((s.done / s.total) * 100) : 0}%"></i></div></div>
    ${pendHTML(minePend, list)}
    <ul class="tr-list">${list.map(x => itemHTML(x, t)).join('')}</ul></div>`;
}
function itemSheet(x = {}) {
  const opts = T.STATUS.map(([v, l]) => `<option value="${v}"${(x.status || 'todo') === v ? ' selected' : ''}>${l}</option>`).join('');
  SS().openSheet(`<div id="trItemSheet"><h3>${x.id ? '연수 고치기' : '연수 더하기'}</h3>
    <label class="yp-f"><span class="lab">연수 이름</span><input class="field" id="trTitle" value="${esc(x.title || '')}" autocomplete="off" placeholder="예) 성희롱·성폭력 예방교육"></label>
    <div class="row tr-two"><label class="yp-f"><span class="lab">기한</span><input class="field" id="trDue" type="date" value="${esc(x.due || '')}"></label>
      <label class="yp-f"><span class="lab">시간</span><input class="field" id="trHours" inputmode="decimal" value="${esc(x.hours || '')}" autocomplete="off" placeholder="예) 2"></label></div>
    <label class="yp-f"><span class="lab">곳 <span class="muted">(연수원·사이트, 비워도 돼요)</span></span><input class="field" id="trWhere" value="${esc(x.where || '')}" autocomplete="off"></label>
    ${x.id ? `<label class="yp-f"><span class="lab">상태</span><select class="field" id="trStatus">${opts}</select></label>
      <label class="yp-f"><span class="lab">이수일</span><input class="field" id="trDone" type="date" value="${esc(x.doneDate || '')}"></label>
      <label class="yp-f"><span class="lab">메모 <span class="muted">(반려 사유 등)</span></span><input class="field" id="trNote" value="${esc(x.note || '')}" autocomplete="off"></label>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trItemOk">${x.id ? '고치기' : '더하기'}</button></div></div>`, sh => {
    sh.querySelector('#trItemOk').addEventListener('click', () => {
      const title = sh.querySelector('#trTitle').value.trim();
      if (!title) { toast('연수 이름을 넣어 주세요'); return; }
      const v = { ...x, title, due: sh.querySelector('#trDue').value, hours: sh.querySelector('#trHours').value, where: sh.querySelector('#trWhere').value, at: x.at || Date.now() };
      if (x.id) Object.assign(v, { status: sh.querySelector('#trStatus').value, doneDate: sh.querySelector('#trDone').value, note: sh.querySelector('#trNote').value });
      const list = T.listMine().filter(y => y.id !== x.id);
      if (!T.saveMine([...list, v])) { toast(FULL, 6000); return; }
      SS().closeSheet(); render();
    });
  });
}
function backSheet(x) {
  SS().openSheet(`<div id="trBackSheet"><h3>반려 — ${esc(x.title)}</h3><label class="yp-f"><span class="lab">반려 사유</span><input class="field" id="trBackNote" autocomplete="off" placeholder="예) 이수증이 흐려요"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trBackOk">반려로</button></div></div>`, sh => {
    sh.querySelector('#trBackOk').addEventListener('click', () => { putItem({ ...x, status: 'back', note: sh.querySelector('#trBackNote').value }); SS().closeSheet(); render(); });
  });
}
const putItem = x => { if (!T.saveMine([...T.listMine().filter(y => y.id !== x.id), x])) { toast(FULL, 6000); return false; } return true; };
/* 이수증 여러 장: 맞는 줄을 찾아 넣고, 못 맞춘 것은 고르게 */
async function addMineCerts(files, only = null) {
  busy = true; render();
  let put = 0;
  try {
    for (const f of files) {
      const text = await certText(f), list = T.listMine();
      const r = T.readCert({ name: f.name, text }, list);
      const id = only || r.id;
      const x = id && list.find(y => y.id === id);
      if (x) { if (putItem(T.applyCert(x, { name: f.name, ...r }, today()))) put++; } else minePend.push({ name: f.name, doneDate: r.doneDate, hours: r.hours });
    }
  } finally { busy = false; }
  render();
  if (put) toast(`이수증 ${put}개를 넣었어요${minePend.length ? ` · ${minePend.length}개는 어느 연수인지 골라 주세요` : ''}`);
  else if (minePend.length) toast('어느 연수 이수증인지 골라 주세요');
}

/* ---------- 연수 현황판 ---------- */
const cellCls = m => (m ? ` tr-m-${m.s}` : '');
function boardHTML(b, t) {
  const courses = b.courses.map(c => {
    const s = T.courseStats(b, c.id);
    return `<div class="yp-card tr-course" data-tr-course="${esc(c.id)}"><div class="tr-c-head"><b>${esc(c.title)}</b>${c.due ? ` <span class="muted">기한 ${md(c.due)}</span> ${ddHTML(c.due, t)}` : ''}</div>
      <div class="tr-bar" aria-hidden="true"><i style="width:${s.rate}%"></i></div>
      <p class="tr-c-num">제출·확인 ${s.sent + s.ok}/${s.total}명 (${s.rate}%) · 미제출 ${s.none}명${s.back ? ` · 반려 ${s.back}명` : ''}</p>
      <div class="row"><button class="btn text tiny" type="button" data-tr="course" data-id="${esc(c.id)}">자세히</button><button class="btn text tiny" type="button" data-tr="nudge" data-id="${esc(c.id)}">독려 쪽지</button></div></div>`;
  }).join('');
  const th = b.courses.map(c => `<th scope="col"><button class="btn text tiny tr-th" type="button" data-tr="course" data-id="${esc(c.id)}">${esc(c.title)}</button></th>`).join('');
  const rows = b.staff.map(s => `<tr><th scope="row">${esc(s.name)}</th><td class="muted">${esc(s.dept)}</td>${b.courses.map(c => {
    const m = T.markOf(b, c.id, s.id);
    return `<td><button class="tr-cell${cellCls(m)}" type="button" data-tr-cell="${esc(c.id)}|${esc(s.id)}" aria-label="${esc(s.name)} ${esc(c.title)} ${T.markLabel(m && m.s)}"${m && m.file ? ` title="${esc(m.file)}"` : ''}>${T.markLabel(m && m.s)}</button></td>`;
  }).join('')}</tr>`).join('');
  return `${b.courses.length ? `<div class="tr-courses">${courses}</div>` : ''}
    ${boardPendHTML(b)}
    ${b.courses.length ? `<div class="tr-tbl-wrap"><table class="tr-table"><thead><tr><th scope="col">이름</th><th scope="col">부서</th>${th}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted tr-legend">칸을 누르면 미제출 → 제출 → 확인 → 미제출. 반려는 연수 이름을 눌러 골라요.</p>`
    : '<div class="yp-card"><p style="margin:0">[+ 연수 더하기]로 챙길 연수를 넣어 주세요. 공문 처리에서 연수 공문의 [연수 현황판에 넣기]로도 넣을 수 있어요.</p></div>'}`;
}
function boardPendHTML(b) {
  if (!boardPend.length) return '';
  const so = b.staff.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.dept ? ` (${esc(s.dept)})` : ''}</option>`).join('');
  const co = b.courses.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  return `<div class="yp-card tr-pend"><h3>못 맞춘 이수증 ${boardPend.length}개 — 누구의 어느 연수인지 골라 주세요</h3><ul class="tr-pend-list">${boardPend.map((p, i) => `<li>
    <span class="tr-file">${esc(p.name)}</span>
    <select class="field" data-tr-psid="${i}" aria-label="${esc(p.name)} 사람"><option value="">사람</option>${so.replace(`value="${esc(p.sid || '')}"`, `value="${esc(p.sid || '')}" selected`)}</select>
    <select class="field" data-tr-pcid="${i}" aria-label="${esc(p.name)} 연수"><option value="">연수</option>${co.replace(`value="${esc(p.cid || '')}"`, `value="${esc(p.cid || '')}" selected`)}</select>
    <button class="btn tiny primary" type="button" data-tr="bpPut" data-i="${i}">넣기</button><button class="btn text tiny" type="button" data-tr="bpDrop" data-i="${i}">버리기</button></li>`).join('')}</ul></div>`;
}
function renderBoard() {
  const t = today(), b = T.getBoard(), y = currentYear(t);
  const head = `<div class="m-head m-head-row"><div><h2>연수 현황판 <span class="muted">(${y}학년도)</span></h2>
    ${introHTML('training-board', '연수 담당 선생님이 교직원 이수증 제출을 한눈에 챙겨요. 이수증 파일을 한꺼번에 끌어 놓으면 파일 이름·이수증 글에서 이름과 연수를 찾아 「제출」로 체크해요. 명단과 이수증은 이 컴퓨터에만 두고 AI로 보내지 않아요.')}</div>
    <div class="m-head-act"><button class="btn" type="button" data-tr="staff">명단 ${b.staff.length ? `고치기 (${b.staff.length}명)` : '넣기'}</button><button class="btn" type="button" data-tr="addCourse">+ 연수 더하기</button>
      ${b.staff.length && b.courses.length ? `<button class="btn" type="button" data-tr="csv">엑셀 내려받기</button>
      <button class="btn primary" type="button" data-tr="bcerts" data-drop-pick${busy ? ' disabled' : ''}>${busy ? '<span class="spin"></span>읽는 중…' : '이수증 한꺼번에 넣기'}</button>` : ''}
      <input type="file" id="trBoardFiles" hidden multiple accept="${CERT_ACCEPT}"><input type="file" id="trStaffFile" hidden accept=".xlsx,.csv"></div></div>`;
  box.innerHTML = `<div class="m-page tr-page">${head}${b.staff.length ? boardHTML(b, t) : `<div class="empty"><h3>먼저 교직원 명단을 넣어 주세요</h3>
    <p>한 줄에 한 명씩 붙여 넣거나(엑셀에서 「이름·부서」 두 칸을 복사해도 돼요) 명단 엑셀 파일을 넣어요. 명단은 이 컴퓨터에만 두고 AI로 보내지 않아요.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" type="button" data-tr="staff">명단 넣기</button></div></div>`}</div>`;
}
const putBoard = b => { if (!T.saveBoard(b)) { toast(FULL, 6000); return false; } return true; };
function staffSheet() {
  const b = T.getBoard();
  SS().openSheet(`<div id="trStaffSheet"><h3>교직원 명단</h3><p class="muted" style="margin:0">한 줄에 한 명 — 「이름 ⇥ 부서」(엑셀 두 칸 복사)나 「이름, 부서」도 돼요. 같은 이름·부서는 한 번만 넣어요.</p>
    <textarea class="field" id="trStaffText" rows="6" placeholder="김하늘&#9;교무부&#10;이바다&#9;3학년"></textarea>
    <div class="row"><button class="btn" type="button" id="trStaffPick" data-drop-pick>명단 파일 넣기(엑셀·CSV)</button><span class="grow"></span><button class="btn primary" type="button" id="trStaffAdd">더하기</button></div>
    ${b.staff.length ? `<h4 style="margin:6px 0 0">지금 명단 ${b.staff.length}명</h4><ul class="tr-staff">${b.staff.map(s => `<li>${esc(s.name)}${s.dept ? ` <span class="muted">${esc(s.dept)}</span>` : ''}<button class="icon-btn tiny" type="button" data-tr-rmstaff="${esc(s.id)}" aria-label="${esc(s.name)} 빼기">×</button></li>`).join('')}</ul>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button></div></div>`, sh => {
    sh.querySelector('#trStaffAdd').addEventListener('click', () => {
      const list = T.parseStaff(sh.querySelector('#trStaffText').value);
      if (!list.length) { toast('이름을 한 줄에 한 명씩 넣어 주세요'); return; }
      addStaff(list);
    });
    sh.querySelector('#trStaffPick').addEventListener('click', () => { const f = box && box.querySelector('#trStaffFile'); if (f) f.click(); });
    sh.addEventListener('click', e => {
      const r = e.target.closest('[data-tr-rmstaff]');
      if (!r) return;
      const cur = T.getBoard(), s = cur.staff.find(x => x.id === r.dataset.trRmstaff);
      if (!s) return;
      const has = cur.courses.some(c => T.markOf(cur, c.id, s.id));
      if (has && !confirm(`${s.name} 선생님의 제출 기록도 지워져요. 뺄까요?`)) return;
      putBoard({ ...cur, staff: cur.staff.filter(x => x.id !== s.id) }); SS().closeSheet(); render(); staffSheet();
    });
  });
}
function addStaff(list) {
  const b = T.getBoard(), m = T.mergeStaff(b.staff, list);
  if (!putBoard({ ...b, staff: m.staff })) return;
  if (SS().closeSheet) SS().closeSheet();
  render();
  toast(m.added ? `교직원 ${m.added}명을 넣었어요` : '이미 있는 이름이에요');
}
function courseAddSheet() {
  const have = new Set(T.getBoard().courses.map(c => T.titleKey(c.title)));
  const opts = T.DEFAULTS.filter(n => !have.has(T.titleKey(n))).map(n => `<option value="${esc(n)}">`).join('');
  SS().openSheet(`<div id="trCourseAdd"><h3>연수 더하기</h3>
    <label class="yp-f"><span class="lab">연수 이름</span><input class="field" id="trCTitle" list="trCDefaults" autocomplete="off" placeholder="예) 성희롱·성폭력 예방교육"><datalist id="trCDefaults">${opts}</datalist></label>
    <label class="yp-f"><span class="lab">제출 기한</span><input class="field" id="trCDue" type="date"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trCOk">더하기</button></div></div>`, sh => {
    sh.querySelector('#trCOk').addEventListener('click', () => {
      const title = sh.querySelector('#trCTitle').value.trim();
      if (!title) { toast('연수 이름을 넣어 주세요'); return; }
      const b = T.getBoard();
      if (putBoard({ ...b, courses: [...b.courses, { id: T.newId('tc'), title, due: sh.querySelector('#trCDue').value }] })) { SS().closeSheet(); render(); }
    });
  });
}
function courseSheet(cid) {
  const b = T.getBoard(), c = b.courses.find(x => x.id === cid);
  if (!c) return;
  const opt = cur => T.MARKS.map(([v, l]) => `<option value="${v}"${(cur || '') === v ? ' selected' : ''}>${l}</option>`).join('');
  SS().openSheet(`<div id="trCourseSheet"><h3>${esc(c.title)}</h3>
    <div class="row tr-two"><label class="yp-f"><span class="lab">연수 이름</span><input class="field" id="trCsTitle" value="${esc(c.title)}" autocomplete="off"></label>
      <label class="yp-f"><span class="lab">제출 기한</span><input class="field" id="trCsDue" type="date" value="${esc(c.due)}"></label></div>
    <ul class="tr-cs-list">${b.staff.map(s => { const m = T.markOf(b, cid, s.id); return `<li><span>${esc(s.name)}${s.dept ? ` <span class="muted">${esc(s.dept)}</span>` : ''}</span>
      <select class="field" data-tr-cs="${esc(s.id)}" aria-label="${esc(s.name)} 상태">${opt(m && m.s)}</select>
      <input class="field tr-cs-note" data-tr-csn="${esc(s.id)}" value="${esc((m && m.note) || '')}" placeholder="반려 사유" aria-label="${esc(s.name)} 반려 사유"${m && m.s === 'back' ? '' : ' hidden'}>
      ${m && m.file ? `<span class="muted tr-file">${esc(m.file)}</span>` : ''}</li>`; }).join('')}</ul>
    <div class="row"><button class="btn text" type="button" id="trCsAllOk">제출한 사람 모두 확인</button><button class="btn text" type="button" id="trCsMiss">미제출 명단 복사</button>
      <button class="btn text" type="button" id="trCsDel">연수 지우기</button><span class="grow"></span>
      <button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trCsOk">저장</button></div></div>`, sh => {
    sh.addEventListener('change', e => { const s = e.target.closest('[data-tr-cs]'); if (s) { const n = sh.querySelector(`[data-tr-csn="${CSS.escape(s.dataset.trCs)}"]`); if (n) n.hidden = s.value !== 'back'; } });
    sh.querySelector('#trCsAllOk').addEventListener('click', () => sh.querySelectorAll('[data-tr-cs]').forEach(s => { if (s.value === 'sent') s.value = 'ok'; }));
    sh.querySelector('#trCsMiss').addEventListener('click', () => {
      const names = T.missingStaff(T.getBoard(), cid).map(s => s.name);
      if (!names.length) { toast('미제출한 사람이 없어요'); return; }
      copyText(names.join(', ')); toast(`미제출 ${names.length}명을 복사했어요(이 컴퓨터 안에서만)`);
    });
    sh.querySelector('#trCsDel').addEventListener('click', () => {
      if (!confirm(`「${c.title}」 연수와 그 제출 기록을 지울까요?`)) return;
      const cur = T.getBoard(), marks = { ...cur.marks }; delete marks[cid];
      if (putBoard({ ...cur, courses: cur.courses.filter(x => x.id !== cid), marks })) { SS().closeSheet(); render(); }
    });
    sh.querySelector('#trCsOk').addEventListener('click', () => {
      const title = sh.querySelector('#trCsTitle').value.trim();
      if (!title) { toast('연수 이름을 넣어 주세요'); return; }
      let cur = T.getBoard();
      cur = { ...cur, courses: cur.courses.map(x => (x.id === cid ? { ...x, title, due: sh.querySelector('#trCsDue').value } : x)) };
      sh.querySelectorAll('[data-tr-cs]').forEach(s => {
        const sid = s.dataset.trCs, old = T.markOf(cur, cid, sid), note = (sh.querySelector(`[data-tr-csn="${CSS.escape(sid)}"]`) || {}).value || '';
        if ((old && old.s) !== (s.value || undefined) || (s.value === 'back' && note !== ((old && old.note) || ''))) cur = T.setMark(cur, cid, sid, s.value, s.value === 'back' ? { note } : {});
      });
      if (putBoard(cur)) { SS().closeSheet(); render(); }
    });
  });
}
function nudgeSheet(cid) {
  const c = T.getBoard().courses.find(x => x.id === cid);
  if (!c) return;
  const text = T.nudgeText(c);
  SS().openSheet(`<div id="trNudge"><h3>독려 쪽지 — ${esc(c.title)}</h3><p class="muted" style="margin:0">선생님 이름은 넣지 않았어요. 이음 쪽지 창에 붙여 넣어 보내세요.</p>
    <textarea class="field" id="trNudgeText" rows="11">${esc(text)}</textarea>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="trNudgeMsg">쪽지 작성에서 다듬기</button><button class="btn primary" type="button" id="trNudgeCopy">복사</button></div></div>`, sh => {
    sh.querySelector('#trNudgeCopy').addEventListener('click', () => { copyText(sh.querySelector('#trNudgeText').value); toast('쪽지 글을 복사했어요'); });
    sh.querySelector('#trNudgeMsg').addEventListener('click', async () => {
      const v = sh.querySelector('#trNudgeText').value;
      SS().closeSheet();
      try { (await import('../etc/message.js')).putMessageFiles([], { text: v }); } catch (e) { go('etc', 'message'); }
    });
  });
}
/* 이수증 한꺼번에: 사람·연수를 찾아 「제출」, 못 맞춘 것은 고르게 */
async function addBoardCerts(files) {
  busy = true; render();
  let put = 0;
  try {
    for (const f of files) {
      const text = await certText(f);
      let b = T.getBoard();
      const r = T.matchFile({ name: f.name, text }, b);
      if (r.sid && r.cid) {
        const old = T.markOf(b, r.cid, r.sid);
        b = T.setMark(b, r.cid, r.sid, old && old.s === 'ok' ? 'ok' : 'sent', { file: f.name, note: '' });
        if (putBoard(b)) put++;
      } else boardPend.push({ name: f.name, sid: r.sid, cid: r.cid });
    }
  } finally { busy = false; }
  render();
  toast(`${put ? `${put}개를 맞췄어요` : '맞춘 이수증이 없어요'}${boardPend.length ? ` · ${boardPend.length}개는 못 맞췄어요` : ''}`, 5000);
}
async function staffFile(f) {
  try {
    const rows = await readTable(f.name, new Uint8Array(await f.arrayBuffer()));
    const list = T.staffFromRows(rows);
    if (!list.length) { toast('명단에서 이름을 찾지 못했어요. 「이름」 칸이 있는 표인지 봐 주세요.'); return; }
    addStaff(list);
  } catch (e) { toast('명단 파일을 읽지 못했어요. 엑셀(.xlsx)이나 CSV로 넣어 주세요.'); }
}

/* ---------- 그리기·누르기 ---------- */
function render() {
  if (!box) return;
  keepFiles(box, () => (tab === 'board' ? renderBoard() : renderMine()));
}
const inPage = e => box && box.isConnected && box.contains(e.target) && !!box.querySelector('.tr-page');
document.addEventListener('click', e => {
  if (!inPage(e)) return;
  const cell = e.target.closest('[data-tr-cell]');
  if (cell) {
    const [cid, sid] = cell.dataset.trCell.split('|'), b = T.getBoard(), m = T.markOf(b, cid, sid);
    if (putBoard(T.setMark(b, cid, sid, T.nextMark(m && m.s)))) render();
    return;
  }
  const btn = e.target.closest('[data-tr]');
  if (!btn) return;
  const a = btn.dataset.tr, id = btn.dataset.id, x = id && T.listMine().find(y => y.id === id);
  if (a === 'add') itemSheet({});
  else if (a === 'edit' && x) itemSheet(x);
  else if (a === 'del' && x) { if (confirm(`「${x.title}」을 지울까요?`) && T.saveMine(T.listMine().filter(y => y.id !== id))) render(); }
  else if (a === 'st' && x) { if (putItem({ ...x, status: btn.dataset.st, ...(btn.dataset.st === 'done' && !x.doneDate ? { doneDate: today() } : {}), ...(btn.dataset.st === 'done' ? { note: '' } : {}) })) render(); }
  else if (a === 'back' && x) backSheet(x);
  else if (a === 'defaults') {
    const r = T.withDefaults(T.listMine());
    if (!r.added) { toast('기본 목록의 연수가 이미 다 있어요'); return; }
    if (T.saveMine(r.list)) { render(); toast(`${r.added}개를 넣었어요. 기한·시간은 공문을 보고 넣어 주세요.`, 5000); } else toast(FULL, 6000);
  }
  else if (a === 'gongmun') go('etc', 'gongmun');
  else if (a === 'certs') { const f = box.querySelector('#trMineFiles'); if (f) f.click(); }
  else if (a === 'cert') { const f = box.querySelector(`#trCert-${CSS.escape(id)}`); if (f) f.click(); }
  else if (a === 'pendPut' || a === 'pendDrop') {
    const i = +btn.dataset.i, p = minePend[i];
    if (!p) return;
    if (a === 'pendPut') {
      const sel = box.querySelector(`[data-tr-pick="${i}"]`), it = sel && T.listMine().find(y => y.id === sel.value);
      if (!it) { toast('연수를 골라 주세요'); return; }
      if (!putItem(T.applyCert(it, p, today()))) return;
    }
    minePend.splice(i, 1); render();
  }
  else if (a === 'staff') staffSheet();
  else if (a === 'addCourse') courseAddSheet();
  else if (a === 'course') courseSheet(id);
  else if (a === 'nudge') nudgeSheet(id);
  else if (a === 'bcerts') { const f = box.querySelector('#trBoardFiles'); if (f) f.click(); }
  else if (a === 'csv') saveFile(`연수 현황(${today()}).csv`, new TextEncoder().encode(T.boardCsv(T.getBoard())), 'text/csv').then(n => toast(`저장했어요: ${n}`)).catch(() => toast('저장하지 못했어요'));
  else if (a === 'bpPut' || a === 'bpDrop') {
    const i = +btn.dataset.i, p = boardPend[i];
    if (!p) return;
    if (a === 'bpPut') {
      const sid = (box.querySelector(`[data-tr-psid="${i}"]`) || {}).value, cid = (box.querySelector(`[data-tr-pcid="${i}"]`) || {}).value;
      if (!sid || !cid) { toast('사람과 연수를 골라 주세요'); return; }
      if (!putBoard(T.setMark(T.getBoard(), cid, sid, 'sent', { file: p.name }))) return;
    }
    boardPend.splice(i, 1); render();
  }
});
document.addEventListener('change', e => {
  if (!inPage(e)) return;
  const el = e.target;
  if (el.id === 'trMineFiles' || /^trCert-/.test(el.id || '')) {
    const fs = [...el.files], only = el.id === 'trMineFiles' ? null : el.id.slice('trCert-'.length); el.value = '';
    if (fs.length) addMineCerts(fs, only);
  } else if (el.id === 'trBoardFiles') { const fs = [...el.files]; el.value = ''; if (fs.length) addBoardCerts(fs); }
  else if (el.id === 'trStaffFile') { const f = el.files[0]; el.value = ''; if (f) staffFile(f); }
});

/* 떠 있는 버튼(inbox 'cert'): 이수증 여러 장이고 현황판에 명단이 있으면 현황판에 한꺼번에, 아니면 내 필수연수에 */
export const certTarget = files => ((files || []).length > 1 && T.getBoard().staff.length && T.getBoard().courses.length ? 'board' : 'mine');
export async function putCerts(files) {
  const where = certTarget(files);
  go('training', where);
  if (where === 'board') await addBoardCerts([...files]); else await addMineCerts([...files]);
}

/* 공문 처리 [내 필수연수에 넣기]·[연수 현황판에 넣기] → 넣은 뒤 그 탭으로. 이미 넣은 공문이면 그대로 열기 */
export function addFromGongmun(doc, where = 'mine') {
  const g = T.fromGongmun(doc);
  if (where === 'board') {
    const b = T.getBoard();
    const same = b.courses.find(c => c.from === g.from || T.titleKey(c.title) === T.titleKey(g.title));
    if (!same) {
      if (!putBoard({ ...b, courses: [...b.courses, { id: T.newId('tc'), title: g.title, due: g.due, from: g.from }] })) return false;
      toast(`연수 현황판에 「${g.title}」을 넣었어요`);
    } else if (same.from !== g.from) {
      if (!putBoard({ ...b, courses: b.courses.map(c => (c.id === same.id ? { ...c, from: g.from, due: c.due || g.due } : c)) })) return false;
      toast(`「${same.title}」에 이 공문을 이었어요`);
    } else toast('이미 연수 현황판에 있어요');
  } else {
    const list = T.listMine(), same = list.find(x => x.from === g.from || T.titleKey(x.title) === T.titleKey(g.title));
    if (!same) {
      if (!T.saveMine([...list, { title: g.title, due: g.due, from: g.from, at: Date.now() }])) { toast(FULL, 6000); return false; }
      toast(`내 필수연수에 「${g.title}」을 넣었어요`);
    } else if (same.from !== g.from) {
      // 같은 연수(기본 목록에서 넣은 줄 등)가 있으면 그 줄에 이 공문을 잇고 비어 있는 기한을 채움
      if (!T.saveMine([...list.filter(x => x.id !== same.id), { ...same, from: g.from, due: same.due || g.due }])) { toast(FULL, 6000); return false; }
      toast(same.due || !g.due ? `「${same.title}」에 이 공문을 이었어요` : `「${same.title}」에 공문 기한(${g.due.slice(5).replace('-', '/')})을 넣었어요`);
    } else toast('이미 내 필수연수에 있어요');
  }
  go('training', where);
  return true;
}
/* 이미 넣은 공문인지(공문 처리 단추 글) */
export const fromDoc = doc => {
  const k = doc && doc.id ? `gongmun:${doc.id}` : '';
  return { mine: !!k && T.listMine().some(x => x.from === k), board: !!k && T.getBoard().courses.some(c => c.from === k) };
};

registerInbox('cert', {
  act: files => (certTarget(files) === 'board' ? `연수 › 연수 현황판에 이수증 ${files.length}개 넣기(이름·연수 맞추기)` : `연수 › 내 필수연수에 이수증 넣기${files.length > 1 ? `(파일 ${files.length}개)` : ''}`),
  async run(files) { await putCerts(files); return ''; }
});

onEnter('training', (t, section) => {
  tab = t === 'board' ? 'board' : 'mine';
  if (!section) return;
  box = section.querySelector('.tr-box');
  if (!box) { box = document.createElement('div'); box.className = 'tr-box'; section.appendChild(box); }
  render();
});
document.addEventListener('year:changed', () => { minePend = []; boardPend = []; if (box && box.isConnected) render(); });
