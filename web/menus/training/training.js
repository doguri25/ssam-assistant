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
import { forms, MAX_FORM } from '../../core/form-store.js';
import { zipStore, unzip } from '../../core/zip.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import { getSchool } from '../../core/settings.js';

const SS = () => window.SSAM;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const md = d => (T.isDate(d) ? `${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '');
const FULL = '저장 공간이 모자라 저장하지 못했어요. 설정 › 백업에서 지난 자료를 내려받고 정리해 주세요.';
const BOARD_ACCEPT = '.pdf,.hwp,.hwpx,.docx,.txt,image/*,.zip';
const CERT_ACCEPT = BOARD_ACCEPT;
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
    for (const f of (await expand(files)).map(x => x.file)) {
      const text = await certText(f), list = T.listMine();
      const r = T.readCert({ name: f.name, text }, list, today());
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
      <p class="tr-c-num">제출·확인 ${s.sent + s.ok}/${s.total}명 (${s.rate}%) · 미제출 ${s.none}명${s.back ? ` · 반려 ${s.back}명` : ''}${c.target.length ? ` <span class="muted">· 대상 ${esc(T.targetLabel(c))}</span>` : ''}</p>
      ${c.inhouse ? `<p class="muted tr-c-in">교내 연수${c.inhouse.date ? ` · ${md(c.inhouse.date)}${c.inhouse.time ? ` ${esc(c.inhouse.time)}` : ''}` : ''}${c.inhouse.place ? ` · ${esc(c.inhouse.place)}` : ''}</p>` : ''}
      <div class="row"><button class="btn text tiny" type="button" data-tr="course" data-id="${esc(c.id)}">자세히</button>${c.inhouse
        ? `<button class="btn text tiny" type="button" data-tr="inNotice" data-id="${esc(c.id)}">안내 쪽지</button><button class="btn text tiny" type="button" data-tr="inSign" data-id="${esc(c.id)}">출석 서명부</button><button class="btn text tiny" type="button" data-tr="inReport" data-id="${esc(c.id)}">결과 보고</button>`
        : `<button class="btn text tiny" type="button" data-tr="nudge" data-id="${esc(c.id)}">독려 쪽지</button>`}</div></div>`;
  }).join('');
  const th = b.courses.map(c => `<th scope="col"><button class="btn text tiny tr-th" type="button" data-tr="course" data-id="${esc(c.id)}">${esc(c.title)}</button></th>`).join('');
  const rows = b.staff.map(s => `<tr><th scope="row">${esc(s.name)}</th><td class="muted">${esc(s.kind)}</td><td class="muted">${esc(s.dept)}</td>${b.courses.map(c => {
    if (!T.inTarget(c, s)) return '<td class="tr-na" title="대상 아님">—</td>';
    const m = T.markOf(b, c.id, s.id), tip = m ? [m.file, m.date ? `${md(m.date)} 이수` : '', m.link ? '구글 폼' : '', m.kept ? '파일 보관' : ''].filter(Boolean).join(' · ') : '';
    return `<td><button class="tr-cell${cellCls(m)}" type="button" data-tr-cell="${esc(c.id)}|${esc(s.id)}" aria-label="${esc(s.name)} ${esc(c.title)} ${T.markLabel(m && m.s)}"${tip ? ` title="${esc(tip)}"` : ''}>${T.markLabel(m && m.s)}${m && m.kept ? '<span class="tr-clip" aria-hidden="true">📎</span>' : ''}</button></td>`;
  }).join('')}</tr>`).join('');
  return `${b.courses.length ? `<div class="tr-courses">${courses}</div>` : ''}
    ${boardPendHTML(b)}
    ${b.courses.length ? `<div class="tr-tbl-wrap"><table class="tr-table"><thead><tr><th scope="col">이름</th><th scope="col">구분</th><th scope="col">부서</th>${th}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted tr-legend">칸을 누르면 미제출 → 제출 → 확인 → 미제출(종이로 받은 것도 칸을 눌러요). 반려는 연수 이름을 눌러 골라요. 📎는 이 기기에 보관한 이수증, 「—」는 대상이 아닌 사람이에요.</p>
      ${finishHTML(b)}`
    : '<div class="yp-card"><p style="margin:0">[+ 연수 더하기]로 챙길 연수를 넣어 주세요. 공문 처리에서 연수 공문의 [연수 현황판에 넣기]로도 넣을 수 있어요.</p></div>'}`;
}
/* 수합 마무리: 고른 연수로 결과 보고·교육청 실적 표·이수증 묶음·엑셀 명단표 */
function finishHTML(b) {
  const kept = Object.values(b.marks || {}).reduce((n, row) => n + Object.values(row).filter(m => m.kept).length, 0);
  return `<div class="yp-card tr-finish"><h3>수합 마무리</h3>
    <div class="tr-fin-pick">${b.courses.map(c => `<label class="chk"><input type="checkbox" data-tr-fin value="${esc(c.id)}" checked> ${esc(c.title)}</label>`).join('')}</div>
    <div class="row tr-fin-act"><button class="btn primary" type="button" data-tr="report">결과 보고 만들기</button><button class="btn" type="button" data-tr="stats">교육청 실적 표 복사</button>
      <button class="btn" type="button" data-tr="zip">이수증 묶음(ZIP)</button><button class="btn" type="button" data-tr="csv">엑셀 명단표</button>
      <button class="btn text" type="button" data-tr="personal">사람별 미제출 복사</button></div>
    <p class="muted tr-fin-note">이수증 ${kept}개를 이 기기에 보관하고 있어요(백업 파일에는 들어가지 않아요). 결과 보고·명단표에는 이름이 들어가 AI로 보내지 않고 이 컴퓨터에서만 만들어요.</p></div>`;
}
const finCids = () => [...box.querySelectorAll('[data-tr-fin]:checked')].map(x => x.value);
function boardPendHTML(b) {
  if (!boardPend.length) return '';
  const so = b.staff.map(s => `<option value="${esc(s.id)}">${esc(s.name)}${s.dept ? ` (${esc(s.dept)})` : ''}</option>`).join('');
  const co = b.courses.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  return `<div class="yp-card tr-pend"><h3>못 맞춘 이수증·응답 ${boardPend.length}개 — 누구의 어느 연수인지 골라 주세요</h3><ul class="tr-pend-list">${boardPend.map((p, i) => `<li>
    <span class="tr-file">${esc(p.name)}${p.form ? ' <span class="muted">(구글 폼 응답)</span>' : ''}</span>
    <select class="field" data-tr-psid="${i}" aria-label="${esc(p.name)} 사람"><option value="">사람</option>${so.replace(`value="${esc(p.sid || '')}"`, `value="${esc(p.sid || '')}" selected`)}</select>
    <select class="field" data-tr-pcid="${i}" aria-label="${esc(p.name)} 연수"><option value="">연수</option>${co.replace(`value="${esc(p.cid || '')}"`, `value="${esc(p.cid || '')}" selected`)}</select>
    <button class="btn tiny primary" type="button" data-tr="bpPut" data-i="${i}">넣기</button><button class="btn text tiny" type="button" data-tr="bpDrop" data-i="${i}">버리기</button></li>`).join('')}</ul></div>`;
}
function renderBoard() {
  const t = today(), b = T.getBoard(), y = currentYear(t);
  const head = `<div class="m-head m-head-row"><div><h2>연수 현황판 <span class="muted">(${y}학년도)</span></h2>
    ${introHTML('training-board', '연수 담당 선생님이 교직원 이수증을 수합해요. 메신저로 받은 이수증(구글 드라이브 ZIP도)을 한꺼번에 끌어 놓으면 파일 이름·이수증 글에서 이름과 연수를 찾아 「제출」로 체크하고, 구글 폼은 응답 엑셀·CSV를 넣어요. 종이는 칸을 눌러요. 다 모으면 아래 「수합 마무리」에서 결과 보고·교육청 실적 표·이수증 묶음·엑셀 명단표를 만들어요. 명단과 이수증은 이 컴퓨터에만 두고 AI로 보내지 않아요.')}</div>
    <div class="m-head-act"><button class="btn" type="button" data-tr="staff">명단 ${b.staff.length ? `고치기 (${b.staff.length}명)` : '넣기'}</button><button class="btn" type="button" data-tr="addCourse">+ 연수 더하기</button>
      ${b.staff.length && b.courses.length ? `<button class="btn text" type="button" data-tr="formGuide">구글 폼 만들기 안내</button><button class="btn" type="button" data-tr="form" data-drop-pick>구글 폼 응답 넣기</button>
      <button class="btn primary" type="button" data-tr="bcerts" data-drop-pick${busy ? ' disabled' : ''}>${busy ? '<span class="spin"></span>읽는 중…' : '이수증 한꺼번에 넣기'}</button>` : ''}
      ${b.staff.length ? '<button class="btn text" type="button" data-tr="share">현황판 내보내기</button>' : ''}<button class="btn text" type="button" data-tr="import" data-drop-pick>현황판 가져오기</button>
      <input type="file" id="trBoardFiles" hidden multiple accept="${BOARD_ACCEPT}"><input type="file" id="trStaffFile" hidden accept=".xlsx,.csv"><input type="file" id="trFormFile" hidden accept=".xlsx,.csv"><input type="file" id="trImportFile" hidden accept=".json,application/json"></div></div>`;
  box.innerHTML = `<div class="m-page tr-page">${head}${b.staff.length ? boardHTML(b, t) : `<div class="empty"><h3>먼저 교직원 명단을 넣어 주세요</h3>
    <p>한 줄에 한 명씩 붙여 넣거나(엑셀에서 「이름·부서」 두 칸을 복사해도 돼요) 명단 엑셀 파일을 넣어요. 명단은 이 컴퓨터에만 두고 AI로 보내지 않아요.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" type="button" data-tr="staff">명단 넣기</button><button class="btn" type="button" data-tr="import">현황판 파일 가져오기</button></div></div>`}</div>`;
}
const putBoard = b => { if (!T.saveBoard(b)) { toast(FULL, 6000); return false; } return true; };

/* ---------- 이수증 파일 보관(이 기기 IndexedDB — 백업 파일에는 들어가지 않음, 5MB까지) ---------- */
const fileStore = () => forms('training');
const yearNow = () => currentYear(today());
async function keepFile(cid, sid, f) {
  if (!f || !f.bytes || !f.bytes.length || f.bytes.length > MAX_FORM) return false;
  try { await (await fileStore()).put({ id: T.fileKey(yearNow(), cid, sid), name: f.name, bytes: f.bytes, savedAt: Date.now() }); return true; } catch (e) { return false; }
}
async function dropFiles(pairs) {
  try { const st = await fileStore(); for (const [cid, sid] of pairs) await st.del(T.fileKey(yearNow(), cid, sid)).catch(() => {}); } catch (e) {}
}
/* 넣은 파일들 → [{ name, bytes, file }]: ZIP(구글 드라이브 폴더 내려받기 등)은 풀어서 파일마다(폴더 이름은 빼고) */
async function expand(files) {
  const out = [];
  for (const f of files) {
    let u8;
    try { u8 = new Uint8Array(await f.arrayBuffer()); } catch (e) { continue; }
    if (/\.zip$/i.test(f.name)) {
      try {
        for (const [n, bytes] of await unzip(u8)) {
          const name = n.split('/').pop();
          if (!name || name.startsWith('.') || /^__MACOSX/.test(n)) continue;
          out.push({ name, bytes, file: new File([bytes], name) });
        }
      } catch (e) { toast(`「${f.name}」을 풀지 못했어요`); }
    } else out.push({ name: f.name, bytes: u8, file: f });
  }
  return out;
}
function staffSheet() {
  const b = T.getBoard();
  SS().openSheet(`<div id="trStaffSheet"><h3>교직원 명단</h3><p class="muted" style="margin:0">한 줄에 한 명 — 「이름 ⇥ 부서」(엑셀 두 칸 복사)나 「이름, 부서」도 돼요. 같은 이름·부서는 한 번만 넣어요.</p>
    <textarea class="field" id="trStaffText" rows="6" placeholder="김하늘&#9;교무부&#10;이바다&#9;3학년"></textarea>
    <div class="row"><button class="btn" type="button" id="trStaffPick" data-drop-pick>명단 파일 넣기(엑셀·CSV)</button><span class="grow"></span><button class="btn primary" type="button" id="trStaffAdd">더하기</button></div>
    ${b.staff.length ? `<h4 style="margin:6px 0 0">지금 명단 ${b.staff.length}명 <span class="muted">— 구분(교원·직원·공무직)은 부서로 짐작했어요. 다르면 고쳐 주세요(교육청 실적 표에 써요).</span></h4><ul class="tr-staff">${b.staff.map(s => `<li><span>${esc(s.name)}${s.dept ? ` <span class="muted">${esc(s.dept)}</span>` : ''}</span>
      <select class="field tiny" data-tr-kind="${esc(s.id)}" aria-label="${esc(s.name)} 구분">${[['', '구분 없음'], ...T.KINDS.map(k => [k, k])].map(([v, l]) => `<option value="${v}"${s.kind === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <button class="icon-btn tiny" type="button" data-tr-rmstaff="${esc(s.id)}" aria-label="${esc(s.name)} 빼기">×</button></li>`).join('')}</ul>` : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button></div></div>`, sh => {
    sh.querySelector('#trStaffAdd').addEventListener('click', () => {
      const list = T.parseStaff(sh.querySelector('#trStaffText').value);
      if (!list.length) { toast('이름을 한 줄에 한 명씩 넣어 주세요'); return; }
      addStaff(list);
    });
    sh.querySelector('#trStaffPick').addEventListener('click', () => { const f = box && box.querySelector('#trStaffFile'); if (f) f.click(); });
    sh.addEventListener('change', e => {
      const k = e.target.closest('[data-tr-kind]');
      if (!k) return;
      const cur = T.getBoard();
      if (putBoard({ ...cur, staff: cur.staff.map(x => (x.id === k.dataset.trKind ? { ...x, kind: k.value } : x)) })) render();
    });
    sh.addEventListener('click', e => {
      const r = e.target.closest('[data-tr-rmstaff]');
      if (!r) return;
      const cur = T.getBoard(), s = cur.staff.find(x => x.id === r.dataset.trRmstaff);
      if (!s) return;
      const has = cur.courses.some(c => T.markOf(cur, c.id, s.id));
      if (has && !confirm(`${s.name} 선생님의 제출 기록도 지워져요. 뺄까요?`)) return;
      if (putBoard({ ...cur, staff: cur.staff.filter(x => x.id !== s.id) })) dropFiles(cur.courses.map(c => [c.id, s.id]));
      SS().closeSheet(); render(); staffSheet();
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
/* 연수 대상: 아무것도 고르지 않으면 전 교직원 */
const targetHTML = cur => `<fieldset class="tr-target"><legend class="lab">대상 <span class="muted">(고르지 않으면 전 교직원)</span></legend>${T.KINDS.map(k => `<label class="chk"><input type="checkbox" data-tr-tg value="${k}"${cur.includes(k) ? ' checked' : ''}> ${k}</label>`).join('')}</fieldset>`;
const targetOf = sh => [...sh.querySelectorAll('[data-tr-tg]:checked')].map(x => x.value);
/* 교내 자율연수(직접 여는 연수): 켜면 일시·시각·장소·강사·연수 시간 */
const inhouseHTML = h => `<fieldset class="tr-in"><label class="chk"><input type="checkbox" data-tr-in${h ? ' checked' : ''}> 교내 연수(직접 여는 연수) — 안내 쪽지·출석 서명부·결과 보고를 만들어요</label>
  <div class="tr-in-f"${h ? '' : ' hidden'}><div class="row tr-two"><label class="yp-f"><span class="lab">날짜</span><input class="field" type="date" data-tr-inf="date" value="${esc((h && h.date) || '')}"></label>
    <label class="yp-f"><span class="lab">시각</span><input class="field" data-tr-inf="time" value="${esc((h && h.time) || '')}" placeholder="15:00~16:30" autocomplete="off"></label></div>
  <div class="row tr-two"><label class="yp-f"><span class="lab">장소</span><input class="field" data-tr-inf="place" value="${esc((h && h.place) || '')}" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">강사</span><input class="field" data-tr-inf="lecturer" value="${esc((h && h.lecturer) || '')}" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">연수 시간</span><input class="field" data-tr-inf="hours" inputmode="decimal" value="${esc((h && h.hours) || '')}" placeholder="2" autocomplete="off"></label></div></div></fieldset>`;
const inhouseOf = sh => { const on = sh.querySelector('[data-tr-in]'); if (!on || !on.checked) return null; const v = k => (sh.querySelector(`[data-tr-inf="${k}"]`) || {}).value || ''; return { date: v('date'), time: v('time'), place: v('place'), lecturer: v('lecturer'), hours: v('hours') }; };
document.addEventListener('change', e => { const t = e.target.closest && e.target.closest('[data-tr-in]'); if (!t) return; const f = t.closest('.tr-in') && t.closest('.tr-in').querySelector('.tr-in-f'); if (f) f.hidden = !t.checked; });
function courseAddSheet() {
  const have = new Set(T.getBoard().courses.map(c => T.titleKey(c.title)));
  const opts = T.DEFAULTS.filter(n => !have.has(T.titleKey(n))).map(n => `<option value="${esc(n)}">`).join('');
  SS().openSheet(`<div id="trCourseAdd"><h3>연수 더하기</h3>
    <label class="yp-f"><span class="lab">연수 이름</span><input class="field" id="trCTitle" list="trCDefaults" autocomplete="off" placeholder="예) 성희롱·성폭력 예방교육"><datalist id="trCDefaults">${opts}</datalist></label>
    <label class="yp-f"><span class="lab">제출 기한</span><input class="field" id="trCDue" type="date"></label>
    ${targetHTML([])}${inhouseHTML(null)}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trCOk">더하기</button></div></div>`, sh => {
    sh.querySelector('#trCOk').addEventListener('click', () => {
      const title = sh.querySelector('#trCTitle').value.trim();
      if (!title) { toast('연수 이름을 넣어 주세요'); return; }
      const b = T.getBoard();
      if (putBoard({ ...b, courses: [...b.courses, { id: T.newId('tc'), title, due: sh.querySelector('#trCDue').value, target: targetOf(sh), inhouse: inhouseOf(sh) }] })) { SS().closeSheet(); render(); }
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
    ${targetHTML(c.target)}${inhouseHTML(c.inhouse)}
    <ul class="tr-cs-list">${T.targetStaff(b, c).map(s => { const m = T.markOf(b, cid, s.id); return `<li><span>${esc(s.name)}${s.dept ? ` <span class="muted">${esc(s.dept)}</span>` : ''}</span>
      <select class="field" data-tr-cs="${esc(s.id)}" aria-label="${esc(s.name)} 상태">${opt(m && m.s)}</select>
      <input class="field tr-cs-note" data-tr-csn="${esc(s.id)}" value="${esc((m && m.note) || '')}" placeholder="반려 사유" aria-label="${esc(s.name)} 반려 사유"${m && m.s === 'back' ? '' : ' hidden'}>
      ${m && m.file ? `<span class="muted tr-file">${esc(m.file)}</span>` : ''}</li>`; }).join('')}</ul>
    <div class="row">${c.inhouse ? '<button class="btn text" type="button" id="trCsAllIn">모두 참석으로</button>' : ''}<button class="btn text" type="button" id="trCsAllOk">제출한 사람 모두 확인</button><button class="btn text" type="button" id="trCsMiss">미제출 명단 복사</button>
      <button class="btn text" type="button" id="trCsDel">연수 지우기</button><span class="grow"></span>
      <button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trCsOk">저장</button></div></div>`, sh => {
    sh.addEventListener('change', e => { const s = e.target.closest('[data-tr-cs]'); if (s) { const n = sh.querySelector(`[data-tr-csn="${CSS.escape(s.dataset.trCs)}"]`); if (n) n.hidden = s.value !== 'back'; } });
    sh.querySelector('#trCsAllOk').addEventListener('click', () => sh.querySelectorAll('[data-tr-cs]').forEach(s => { if (s.value === 'sent') s.value = 'ok'; }));
    // 교내 연수: 대상 모두 「확인」(이수일 = 연수 날)으로 저장하고 다시 열어 빠진 사람만 고치게
    const allIn = sh.querySelector('#trCsAllIn');
    if (allIn) allIn.addEventListener('click', () => { if (putBoard(T.allPresent(T.getBoard(), cid))) { SS().closeSheet(); render(); courseSheet(cid); toast('대상 모두 참석으로 했어요. 빠진 분만 「미제출」로 바꿔 주세요.', 5000); } });
    sh.querySelector('#trCsMiss').addEventListener('click', () => {
      const names = T.missingStaff(T.getBoard(), cid).map(s => s.name);
      if (!names.length) { toast('미제출한 사람이 없어요'); return; }
      copyText(names.join(', ')); toast(`미제출 ${names.length}명을 복사했어요(이 컴퓨터 안에서만)`);
    });
    sh.querySelector('#trCsDel').addEventListener('click', () => {
      if (!confirm(`「${c.title}」 연수와 그 제출 기록을 지울까요?`)) return;
      const cur = T.getBoard(), marks = { ...cur.marks }; delete marks[cid];
      if (putBoard({ ...cur, courses: cur.courses.filter(x => x.id !== cid), marks })) { dropFiles(cur.staff.map(s => [cid, s.id])); SS().closeSheet(); render(); }
    });
    sh.querySelector('#trCsOk').addEventListener('click', () => {
      const title = sh.querySelector('#trCsTitle').value.trim();
      if (!title) { toast('연수 이름을 넣어 주세요'); return; }
      let cur = T.getBoard();
      cur = { ...cur, courses: cur.courses.map(x => (x.id === cid ? { ...x, title, due: sh.querySelector('#trCsDue').value, target: targetOf(sh), inhouse: inhouseOf(sh) } : x)) };
      const gone = [];
      sh.querySelectorAll('[data-tr-cs]').forEach(s => {
        const sid = s.dataset.trCs, old = T.markOf(cur, cid, sid), note = (sh.querySelector(`[data-tr-csn="${CSS.escape(sid)}"]`) || {}).value || '';
        if ((old && old.s) !== (s.value || undefined) || (s.value === 'back' && note !== ((old && old.note) || ''))) {
          cur = T.setMark(cur, cid, sid, s.value, s.value === 'back' ? { note } : {});
          if (!s.value) gone.push([cid, sid]);
        }
      });
      if (putBoard(cur)) { if (gone.length) dropFiles(gone); SS().closeSheet(); render(); }
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
async function putBoardCert(cid, sid, f, { date = '', hours = null } = {}) {
  const kept = await keepFile(cid, sid, f), b = T.getBoard(), old = T.markOf(b, cid, sid);
  return putBoard(T.setMark(b, cid, sid, old && old.s === 'ok' ? 'ok' : 'sent', { file: f.name, note: '', date: date || (old && old.date) || '', hours: hours || (old && old.hours) || null, kept: kept || !!(old && old.kept) }));
}
async function addBoardCerts(files) {
  busy = true; render();
  let put = 0;
  try {
    for (const f of await expand(files)) {
      const text = await certText(f.file);
      const r = T.matchFile({ name: f.name, text }, T.getBoard());
      const extra = { date: text ? T.certDate(text, today()) : '', hours: text ? T.certHours(text) : null };
      if (r.sid && r.cid) { if (await putBoardCert(r.cid, r.sid, f, extra)) put++; }
      else boardPend.push({ name: f.name, sid: r.sid, cid: r.cid, bytes: f.bytes, ...extra });
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

/* 교내 연수 안내 쪽지(AI 없이) — 복사·쪽지 작성에서 다듬기 */
function inNoticeSheet(cid) {
  const c = T.getBoard().courses.find(x => x.id === cid);
  if (!c) return;
  const text = T.inhouseNotice(c);
  SS().openSheet(`<div id="trInNotice"><h3>안내 쪽지 — ${esc(c.title)}</h3><textarea class="field" id="trInNoticeText" rows="13">${esc(text)}</textarea>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="trInNoticeMsg">쪽지 작성에서 다듬기</button><button class="btn primary" type="button" id="trInNoticeCopy">복사</button></div></div>`, sh => {
    sh.querySelector('#trInNoticeCopy').addEventListener('click', () => { copyText(sh.querySelector('#trInNoticeText').value); toast('안내 쪽지를 복사했어요'); });
    // 쪽지 작성은 AI로 읽음 — 강사·교직원 이름은 가려 보냄(쪽지 칸에는 강사 칸이 없어 잃는 것 없음)
    sh.querySelector('#trInNoticeMsg').addEventListener('click', async () => {
      const v = T.maskForAI(sh.querySelector('#trInNoticeText').value, [c.inhouse && c.inhouse.lecturer, ...T.getBoard().staff.map(s => s.name)]);
      SS().closeSheet(); toast('강사·교직원 이름은 가려서 쪽지 작성으로 보냈어요. 쪽지에 직접 넣어 주세요.', 5000);
      try { (await import('../etc/message.js')).putMessageFiles([], { text: v }); } catch (e) { go('etc', 'message'); }
    });
  });
}
/* 교내 연수 결과 보고: 주요 내용을 적어 한글·워드·PDF로(AI 없이) */
function inReportSheet(cid) {
  const c = T.getBoard().courses.find(x => x.id === cid);
  if (!c) return;
  SS().openSheet(`<div id="trInReport"><h3>교내 연수 결과 보고 — ${esc(c.title)}</h3><p class="muted" style="margin:0">일시·장소·강사·참석(현황판의 확인)은 채워 넣어요. 주요 내용만 한 줄에 하나씩 적어 주세요.</p>
    <textarea class="field" id="trInSum" rows="5" placeholder="예) 학교폭력 사안 처리 절차 안내&#10;사례 나누기"></textarea>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button>${exportButton('id="trInRepGo"', { cls: 'primary' })}</div></div>`, sh => {
    sh.querySelector('#trInRepGo').addEventListener('click', async () => {
      const doc = T.inhouseReportDoc(T.getBoard(), cid, { summary: sh.querySelector('#trInSum').value, year: yearNow(), school: getSchool().name });
      try { const m = await exportDoc(doc, doc.title); if (m) toast(m, 5000); } catch (e) { toast('문서를 만들지 못했어요'); }
    });
  });
}
/* 현황판 가져오기: 비어 있으면 그대로, 있으면 합치기·바꾸기 물음(이수증 파일은 들어 있지 않음) */
async function importBoard(f) {
  let nb;
  try { nb = T.parseBoardFile(await f.text()); } catch (e) { nb = null; }
  if (!nb) { toast('쌤비서 연수 현황판 파일(.ssam-training.json)이 아니에요'); return; }
  const cur = T.getBoard(), put = (b, msg) => { if (putBoard(b)) { render(); toast(msg, 5000); } };
  if (!cur.staff.length && !cur.courses.length) { put(nb, `현황판을 가져왔어요(교직원 ${nb.staff.length}명 · 연수 ${nb.courses.length}개)`); return; }
  SS().openSheet(`<div id="trImport"><h3>현황판 가져오기</h3><p class="muted" style="margin:0">가져올 파일: 교직원 ${nb.staff.length}명 · 연수 ${nb.courses.length}개. 지금 현황판(교직원 ${cur.staff.length}명 · 연수 ${cur.courses.length}개)과 어떻게 할까요?</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn" type="button" id="trImpReplace">바꾸기</button><button class="btn primary" type="button" id="trImpMerge">합치기</button></div></div>`, sh => {
    sh.querySelector('#trImpMerge').addEventListener('click', () => { SS().closeSheet(); put(T.mergeBoards(T.getBoard(), nb), '합쳤어요(같은 이름·연수는 하나로, 상태는 더 나아간 것으로)'); });
    sh.querySelector('#trImpReplace').addEventListener('click', () => { if (!confirm('지금 현황판을 가져온 파일로 바꿀까요? 지금 제출 기록은 없어져요.')) return; SS().closeSheet(); put(nb, '가져온 현황판으로 바꿨어요'); });
  });
}
/* 구글 폼 응답(CSV·엑셀): 이름·연수·파일 주소·날짜로 「제출」. 연수 열이 없고 연수가 여럿이면 어느 연수인지 물음 */
async function formFile(f) {
  let rows;
  try { rows = await readTable(f.name, new Uint8Array(await f.arrayBuffer())); } catch (e) { toast('응답 파일을 읽지 못했어요. 구글 폼 응답을 엑셀(.xlsx)이나 CSV로 내려받아 넣어 주세요.'); return; }
  const b = T.getBoard(), probe = T.formResponses(rows, b);
  if (probe.noName) { toast('응답에서 「이름·성명」 칸을 찾지 못했어요'); return; }
  const apply = cid => {
    const r = T.formResponses(rows, T.getBoard(), { cid });
    let cur = T.getBoard();
    for (const h of r.hits) { const old = T.markOf(cur, h.cid, h.sid); cur = T.setMark(cur, h.cid, h.sid, old && old.s === 'ok' ? 'ok' : 'sent', { file: '구글 폼', link: h.link, date: h.date || (old && old.date) || '', note: '' }); }
    if (!putBoard(cur)) return;
    for (const m of r.miss) boardPend.push({ name: m.name, sid: m.sid, cid: m.course, link: m.link, date: m.date, form: true });
    render();
    toast(`구글 폼 응답 ${r.hits.length}명을 「제출」로 넣었어요${r.miss.length ? ` · ${r.miss.length}명은 골라 주세요` : ''}`, 5000);
  };
  if (probe.courseCol || b.courses.length === 1) { apply(''); return; }
  SS().openSheet(`<div id="trFormSheet"><h3>어느 연수 응답인가요?</h3><p class="muted" style="margin:0">응답에 연수 이름 칸이 없어요. 이 응답이 어느 연수 이수증인지 골라 주세요.</p>
    <select class="field" id="trFormCourse">${b.courses.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('')}</select>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="trFormOk">넣기</button></div></div>`,
  sh => sh.querySelector('#trFormOk').addEventListener('click', () => { const v = sh.querySelector('#trFormCourse').value; SS().closeSheet(); apply(v); }));
}
/* 결과 보고(내부결재 본문): 제목·관련을 고쳐 한글·워드·PDF로. 관련 기본값은 연수를 넣은 공문 */
async function reportSheet(cids) {
  const b = T.getBoard(), y = yearNow();
  let related = '';
  const from = b.courses.filter(c => cids.includes(c.id)).map(c => c.from).find(f => /^gongmun:/.test(f || ''));
  if (from) { try { const G = await import('../etc/gongmun-model.js'); related = T.relatedOf(G.getDoc(from.slice('gongmun:'.length))); } catch (e) { related = ''; } }
  SS().openSheet(`<div id="trReport"><h3>결과 보고 만들기</h3><p class="muted" style="margin:0">내부결재 본문(이수 현황 표·미이수·붙임)과 붙임 1. 이수 현황 명단을 한 문서로 만들어요. 이름이 들어가 AI로 보내지 않아요.</p>
    <label class="yp-f"><span class="lab">제목</span><input class="field" id="trRepTitle" value="${esc(T.reportTitle(b, cids, y))}" autocomplete="off"></label>
    <label class="yp-f"><span class="lab">관련 <span class="muted">(비우면 관련 없이)</span></span><input class="field" id="trRepRel" value="${esc(related)}" autocomplete="off" placeholder="예) ○○교육지원청 교육지원과-1234(2026. 11. 2.) 「법정의무교육 이수 안내」"></label>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button>${exportButton('id="trRepGo"', { cls: 'primary' })}</div></div>`, sh => {
    sh.querySelector('#trRepGo').addEventListener('click', async () => {
      const title = sh.querySelector('#trRepTitle').value.trim();
      const doc = T.reportDoc(T.getBoard(), { cids, title, related: sh.querySelector('#trRepRel').value.trim(), year: y, school: getSchool().name });
      try { const msg = await exportDoc(doc, doc.title); if (msg) toast(msg, 5000); } catch (e) { toast('문서를 만들지 못했어요'); }
    });
  });
}
/* 이수증 묶음(ZIP): 이 기기에 보관한 이수증을 「연수명/연수명_이름(부서)」로 + 이수 현황.csv */
async function saveBundle(cids) {
  const b = T.getBoard(), y = yearNow(), files = new Map();
  try {
    const st = await fileStore();
    for (const c of b.courses.filter(x => cids.includes(x.id))) for (const s of T.targetStaff(b, c)) {
      const m = T.markOf(b, c.id, s.id);
      if (!m || !m.kept) continue;
      const f = await st.get(T.fileKey(y, c.id, s.id));
      if (f && f.bytes) files.set(T.fileKey(y, c.id, s.id), f);
    }
  } catch (e) {}
  const entries = T.bundleEntries(b, files, { year: y, cids });
  const n = entries.length - 1;
  try {
    const name = await saveFile(`연수 이수증 묶음(${today()}).zip`, zipStore(entries), 'application/zip');
    toast(`${n ? `이수증 ${n}개와 ` : ''}이수 현황표를 묶어 저장했어요: ${name}`, 5000);
  } catch (e) { toast('저장하지 못했어요'); }
}

/* ---------- 그리기·누르기 ---------- */
function render() {
  if (!box) return;
  keepFiles(box, () => (tab === 'board' ? renderBoard() : renderMine()));
}
const inPage = e => box && box.isConnected && box.contains(e.target) && !!box.querySelector('.tr-page');
document.addEventListener('click', async e => {
  if (!inPage(e)) return;
  const cell = e.target.closest('[data-tr-cell]');
  if (cell) {
    const [cid, sid] = cell.dataset.trCell.split('|'), b = T.getBoard(), m = T.markOf(b, cid, sid), next = T.nextMark(m && m.s);
    // 미제출로 돌리면 보관한 이수증도 지움
    // 미제출로 돌리면 이수일·파일 이름·보관한 이수증이 지워짐 — 남긴 것이 있으면 먼저 물음(두 번 누르기로 말없이 지우지 않게)
    if (!next && m && (m.kept || m.date || m.link || m.file) && !confirm(`${(b.staff.find(x => x.id === sid) || {}).name || ''} 선생님의 제출 기록${m.kept ? '과 보관한 이수증' : ''}이 지워져요. 미제출로 돌릴까요?`)) return;
    if (putBoard(T.setMark(b, cid, sid, next, next === 'sent' && !m ? { file: '' } : {}))) { if (!next && m && m.kept) dropFiles([[cid, sid]]); render(); }
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
  else if (a === 'form') { const f = box.querySelector('#trFormFile'); if (f) f.click(); }
  else if (a === 'report') { const c = finCids(); if (!c.length) { toast('연수를 골라 주세요'); return; } reportSheet(c); }
  else if (a === 'stats') {
    const c = finCids();
    if (!c.length) { toast('연수를 골라 주세요'); return; }
    copyText(T.statsTsv(T.getBoard(), c)); toast('구분별 실적 표를 복사했어요. 공문 양식의 표나 엑셀에 붙여 넣으세요.', 5000);
  }
  else if (a === 'zip') { const c = finCids(); if (!c.length) { toast('연수를 골라 주세요'); return; } saveBundle(c); }
  else if (a === 'inNotice') inNoticeSheet(id);
  else if (a === 'inSign') { const doc = T.signSheetDoc(T.getBoard(), id, { school: getSchool().name }); exportDoc(doc, doc.title).then(m => m && toast(m, 5000)).catch(() => toast('문서를 만들지 못했어요')); }
  else if (a === 'inReport') inReportSheet(id);
  else if (a === 'share') {
    saveFile(`연수 현황판(${today()}).ssam-training.json`, new TextEncoder().encode(T.exportBoard(T.getBoard(), yearNow())), 'application/json')
      .then(n => toast(`현황판을 내보냈어요(이수증 파일은 빼고): ${n}`, 5000)).catch(() => toast('저장하지 못했어요'));
  }
  else if (a === 'import') { const f = box.querySelector('#trImportFile'); if (f) f.click(); }
  else if (a === 'personal') {
    const t = T.personalText(T.getBoard(), finCids());
    if (!t) { toast('고른 연수에 미제출한 사람이 없어요'); return; }
    copyText(t); toast(`사람별 미제출 ${t.split('\n').length}명을 복사했어요(이 컴퓨터 안에서만 — 개별 쪽지에 붙여 넣으세요)`, 5000);
  }
  else if (a === 'formGuide') {
    const text = T.formGuide(T.getBoard(), yearNow());
    SS().openSheet(`<div id="trFormGuide"><h3>구글 폼 만들기 안내</h3><textarea class="field" id="trFormGuideText" rows="13" readonly>${esc(text)}</textarea>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" id="trFormGuideCopy">복사</button></div></div>`,
    sh => sh.querySelector('#trFormGuideCopy').addEventListener('click', () => { copyText(text); toast('안내를 복사했어요'); }));
  }
  else if (a === 'csv') saveFile(`연수 현황(${today()}).csv`, new TextEncoder().encode(T.boardCsv(T.getBoard())), 'text/csv').then(n => toast(`저장했어요: ${n}`)).catch(() => toast('저장하지 못했어요'));
  else if (a === 'bpPut' || a === 'bpDrop') {
    const i = +btn.dataset.i, p = boardPend[i];
    if (!p) return;
    if (a === 'bpPut') {
      const sid = (box.querySelector(`[data-tr-psid="${i}"]`) || {}).value, cid = (box.querySelector(`[data-tr-pcid="${i}"]`) || {}).value;
      if (!sid || !cid) { toast('사람과 연수를 골라 주세요'); return; }
      if (p.form) { if (!putBoard(T.setMark(T.getBoard(), cid, sid, 'sent', { file: '구글 폼', link: p.link, date: p.date }))) return; }
      else if (!await putBoardCert(cid, sid, { name: p.name, bytes: p.bytes }, p)) return;
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
  else if (el.id === 'trFormFile') { const f = el.files[0]; el.value = ''; if (f) formFile(f); }
  else if (el.id === 'trImportFile') { const f = el.files[0]; el.value = ''; if (f) importBoard(f); }
});

/* 떠 있는 버튼(inbox 'cert'): 이수증 여러 장이고 현황판에 명단이 있으면 현황판에 한꺼번에, 아니면 내 필수연수에 */
export const certTarget = files => (((files || []).length > 1 || (files || []).some(f => /\.zip$/i.test(f.name || ''))) && T.getBoard().staff.length && T.getBoard().courses.length ? 'board' : 'mine');
export async function putCerts(files) {
  const where = certTarget(files);
  go('training', where);
  if (where === 'board') await addBoardCerts([...files]); else await addMineCerts([...files]);
}

/* 공문 처리 [내 필수연수에 넣기]·[연수 현황판에 넣기] → 넣은 뒤 그 탭으로. 이미 넣은 공문이면 그대로 열기 */
export function addFromGongmun(doc, where = 'mine') {
  const g = T.fromGongmun(doc);
  if (where === 'board') return addCourseFrom(g);
  else {
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
/* 연수 현황판에 연수 넣기(공문 처리·쪽지 작성에서): 같은 연수가 있으면 그 연수에 잇고 비어 있는 기한을 채움 → 현황판으로 */
export function addCourseFrom({ title = '', due = '', from = '' } = {}) {
  const t = T.courseTitle(title) || title, b = T.getBoard();
  if (!t) { toast('연수 이름이 없어요'); return false; }
  const d = T.isDate(due) ? due : '';
  const same = b.courses.find(c => (from && c.from === from) || T.titleKey(c.title) === T.titleKey(t));
  if (!same) {
    if (!putBoard({ ...b, courses: [...b.courses, { id: T.newId('tc'), title: t, due: d, from }] })) return false;
    toast(`연수 현황판에 「${t}」을 넣었어요${b.staff.length ? '' : ' — 교직원 명단을 넣어 주세요'}`);
  } else if (same.from !== from) {
    if (!putBoard({ ...b, courses: b.courses.map(c => (c.id === same.id ? { ...c, from: c.from || from, due: c.due || d } : c)) })) return false;
    toast(`「${same.title}」에 이었어요`);
  } else toast('이미 연수 현황판에 있어요');
  go('training', 'board');
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
