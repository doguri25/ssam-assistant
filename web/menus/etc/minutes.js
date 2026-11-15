/* 문서·소통 › 회의록 (스펙 2026-11-15 2장): 협의회 메모(붙여 넣기가 주, 한글·워드·PDF·글 파일은 글만 넣기 칸으로) → [정리하기] AI 한 번(업무 doc)
   → 칸·안건 카드(협의 내용·결정 사항 줄 더하기·빼기)·할 일 표(체크·담당·기한)·다음 회의. 선생님이 고친 칸은 다시 정리해도 그대로(쪽지 keepFields처럼).
   AI로는 가린 글만(core/redact.js — 교직원·학생 이름 〔이름n〕, 연락처 {{n}}, 명단·주민번호 줄은 뺌)·칸(종류·이름·날짜·시간·장소) — 참석 칸은 보내지 않음,
   돌아온 글에 이름을 되돌려 넣음. 판서·메모 사진은 AI가 있을 때만 그림 그대로(쪽지처럼 알림). 메모 글·파일은 저장하지 않음(이 화면에만).
   내보내기: [복사](개조식), 쌤비서 기본 회의록 문서(한글·워드·PDF), 학교 양식(.hwpx — formSlotHTML·registerFormDoc 'minutes').
   끝내지 않은 할 일(7일 안·지남)은 「오늘」 기한 카드·채팅 「오늘 할 일」에 「회의 할 일」로(home-model minutesCard, core/briefing.js) */
import { onEnter, go } from '../../core/shell.js';
import { introHTML, aiNoteHTML } from '../../core/ui-parts.js';
import * as ai from '../../core/ai.js';
import { toast, copyText } from '../../core/ui.js';
import { readText, fileMessage } from '../../core/files.js';
import { aiRowHTML } from '../../core/ai-roles.js';
import { keepFiles } from '../../core/keep-files.js';
import { schoolYearOf } from '../../core/calendar.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import { formSlotHTML, registerFormDoc } from '../../core/school-form.js';
import { normDate, fmtDay } from './message-ai.js';
import { KINDS, kindLabel, redactInput, minutesPrompt, validMinutes, backAll, normMinutes, keepFields, keptKeys, minutesText, minutesDoc, docName, MAX_AGENDA, MAX_LINES, MAX_TODOS } from './minutes-ai.js';
import { blankMinutes, hasContent, listMinutes, getMinutes, putMinutes, removeMinutes, currentId, setCurrent, MAX_MINUTES } from './minutes-model.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SS = () => window.SSAM || {};
const IMAGE = /\.(png|jpe?g|webp|gif|bmp|heic)$/i;
const MAX_IMAGES = 4;
const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
// 날짜 칸: 비었거나 2000~2100년의 맞는 날만(키보드로 연도를 고치는 중간 값 「0002-…」은 저장하지 않음)
const okDate = v => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && +v.slice(0, 4) >= 2000 && +v.slice(0, 4) <= 2100 && normDate(v) === v);
const NOTE = '메모 글과 칸(회의 종류·이름·날짜·시간·장소)을 보내요. 교직원·학생 이름과 전화번호·이메일은 가려 보내고, 돌아온 글에 원래 이름을 되돌려 넣어요. 명단·주민번호가 적힌 줄은 보내지 않아요. 참석 칸은 보내지 않아요. 판서·메모 사진은 가릴 수 없어 그림 그대로 가요. 메모·원본 파일은 저장하지 않아요.';

/* 화면 상태(저장 안 함): paste(넣기 칸 글), images(넣은 사진·스캔 — 이 화면에만), busy, msg */
export const M = { paste: '', images: [], busy: false, msg: '' };
let box = null, d = null;
const gone = new Set(); // [삭제]한 회의록 id(읽던 AI가 끝나도 다시 넣지 않게)
const cur = () => (d || (d = getMinutes(currentId()) || blankMinutes()));
let readTok = 0, reading = null, readingTok = 0;
function switchTo(x) { d = x; setCurrent(x.id); readTok++; M.busy = false; M.msg = ''; }
function persist(x = cur()) { if (hasContent(x) && !gone.has(x.id)) putMinutes(x); }
const touch = (x, k) => { x.touched = [...new Set([...(x.touched || []), k])]; };

/* ---------- 그리기 ---------- */
const field = (k, label, v, type = 'text', ph = '') => `<label class="yp-f"><span class="lab">${label}</span><input class="field" data-mnf="${k}" type="${type}" value="${esc(v)}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
const fieldsHTML = x => `<div class="mn-fields" id="mnFields">
    <div class="mn-two"><label class="yp-f"><span class="lab">회의 종류</span><select class="field" data-mnf="kind">${KINDS.map(([k, l]) => `<option value="${k}"${x.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${field('title', '회의 이름', x.title, 'text', '예) 3학년 학년 협의회')}</div>
    <div class="mn-two">${field('date', '날짜', x.date, 'date')}${field('time', '시간', x.time, 'text', '예) 15:00~16:00')}</div>
    ${field('place', '장소', x.place, 'text', '예) 3학년 연구실')}
    ${field('attendees', '참석', x.attendees, 'text', '예) 3학년 담임 5명')}
    <p class="muted mn-hint">참석 칸은 이 기기에만 남고 AI로 보내지 않아요.</p></div>`;
const LINE = { discussion: '협의 내용', decisions: '결정 사항' };
const lineHTML = (i, k, j, v) => `<li class="mn-line"><input class="field" data-mnl="${i}" data-mnk="${k}" data-mnj="${j}" value="${esc(v)}" aria-label="${i + 1}번째 안건 ${LINE[k]} ${j + 1}" autocomplete="off">
    <button class="icon-btn tiny mn-x" type="button" data-mn-dell="${i}" data-mnk="${k}" data-mnj="${j}" aria-label="${i + 1}번째 안건 ${LINE[k]} ${j + 1}줄 빼기">✕</button></li>`;
function agendaHTML(x) {
  if (!x.agenda.length) return '<p class="muted" style="margin:0">[정리하기]를 누르면 안건이 여기에 생겨요. [안건 더하기]로 직접 써도 돼요.</p>';
  return x.agenda.map((a, i) => `<div class="mn-ag" data-ag="${i}">
      <div class="mn-ag-h"><span class="mn-no" aria-hidden="true">${i + 1}</span><input class="field" data-mna="${i}" value="${esc(a.title)}" placeholder="안건" aria-label="${i + 1}번째 안건" autocomplete="off">
        <button class="btn text tiny" type="button" data-mn-dela="${i}">안건 빼기</button></div>
      ${['discussion', 'decisions'].map(k => `<div class="mn-sub"><span class="lab">${LINE[k]}</span>
        ${(a[k] || []).length ? `<ul class="mn-lines">${a[k].map((v, j) => lineHTML(i, k, j, v)).join('')}</ul>` : ''}
        <button class="btn text tiny mn-addl" type="button" data-mn-addl="${i}" data-mnk="${k}"${(a[k] || []).length >= MAX_LINES ? ' disabled' : ''}>+ 줄 더하기</button></div>`).join('')}</div>`).join('');
}
function todosHTML(x) {
  if (!x.todos.length) return '<p class="muted" style="margin:0">회의에서 정한 할 일이 여기에 생겨요. 기한이 7일 안이면 「오늘」 화면에도 떠요.</p>';
  return `<ul class="mn-todos">${x.todos.map((t, j) => `<li class="mn-todo${t.done ? ' done' : ''}">
      <label class="mn-chk"><input type="checkbox" data-mnt-done="${j}"${t.done ? ' checked' : ''} aria-label="${j + 1}번째 할 일 끝냄"></label>
      <input class="field mn-task" data-mnt="${j}" data-mnk="task" value="${esc(t.task)}" placeholder="할 일" aria-label="${j + 1}번째 할 일" autocomplete="off">
      <input class="field mn-who" data-mnt="${j}" data-mnk="who" value="${esc(t.who)}" placeholder="담당" aria-label="${j + 1}번째 할 일 담당" autocomplete="off">
      <input class="field mn-due" type="date" data-mnt="${j}" data-mnk="due" value="${esc(t.due)}" aria-label="${j + 1}번째 할 일 기한">
      <button class="icon-btn tiny mn-x" type="button" data-mn-delt="${j}" aria-label="${j + 1}번째 할 일 빼기">✕</button></li>`).join('')}</ul>`;
}
const nextHTML = x => `<div class="mn-two" id="mnNext"><label class="yp-f"><span class="lab">날짜</span><input class="field" type="date" data-mnn="date" value="${esc(x.next.date)}"></label>
    <label class="yp-f"><span class="lab">안건</span><input class="field" data-mnn="topic" value="${esc(x.next.topic)}" placeholder="예) 체험학습 사전 교육" autocomplete="off"></label></div>`;
const imgsHTML = () => `<div id="mnImgs">${M.images.length ? `<ul class="mn-imgs">${M.images.map((f, k) => `<li><span class="mn-img-n">${esc(f.name || `사진 ${k + 1}`)}</span><button class="icon-btn tiny mn-x" type="button" data-mn-img-del="${k}" aria-label="${esc(f.name || `사진 ${k + 1}`)} 빼기">✕</button></li>`).join('')}</ul>
    <p class="muted mn-hint">사진·스캔 ${M.images.length}개는 이름을 가릴 수 없어 그림 그대로 AI로 가요.</p>` : ''}</div>`;
function recentHTML() {
  const l = listMinutes(), id = cur().id;
  if (!l.length) return `<p class="muted" id="mnRecent" style="margin:0">정리한 회의록이 최근 ${MAX_MINUTES}개까지 남아요.</p>`;
  return `<ul class="pc-lib-list" id="mnRecent">${l.map(r => {
    const left = r.todos.filter(t => !t.done).length;
    const meta = [fmtDay(r.date) || new Date(r.at).toLocaleDateString('ko-KR'), r.kind !== 'etc' ? kindLabel(r.kind) : '', left ? `할 일 ${left}개 남음` : r.todos.length ? '할 일 다 함' : ''].filter(Boolean).join(' · ');
    return `<li class="pc-lib-row${r.id === id ? ' mn-on' : ''}"><div class="grow"><b>${esc(r.title || '제목 없는 회의록')}</b><span class="muted">${esc(meta)}</span></div>
      <span class="row"><button class="btn text" type="button" data-mn-open="${esc(r.id)}">열기</button><button class="btn text" type="button" data-mn-del="${esc(r.id)}">삭제</button></span></li>`;
  }).join('')}</ul>`;
}
const accept = () => (ai.ready() ? '.hwp,.hwpx,.docx,.pdf,.txt,.png,.jpg,.jpeg,.webp' : '.hwp,.hwpx,.docx,.pdf,.txt');
const readLabel = () => (M.busy ? '<span class="spin"></span>정리하는 중…' : '정리하기');
export function render() {
  if (!box || box.hidden) return;
  const x = cur();
  const html = `<div class="m-page mn-page">
    <div class="m-head m-head-row"><div><h2>회의록</h2>${introHTML('minutes', '협의회 메모를 붙여 넣으면 안건·협의 내용·결정 사항·할 일로 정리해요. 할 일은 「오늘」 화면에도 떠요.')}</div>
      <div class="m-head-act">${aiRowHTML('doc')}<button class="btn text" type="button" data-mn="new">새 회의록</button></div></div>
    <div class="mn-grid">
      <section class="pc-card"><h3>넣기</h3>
        <div class="mn-drop" data-mn-drop>
          <textarea class="field" id="mnPaste" rows="8" placeholder="협의회 메모·받아쓴 글을 붙여 넣거나, 파일(한글·워드·PDF·글)을 여기에 끌어 놓으세요. 판서·메모 사진도 돼요(AI가 있을 때).">${esc(M.paste)}</textarea>
          ${imgsHTML()}
          <div class="row"><button class="btn primary" type="button" data-mn="read"${M.busy ? ' disabled' : ''}>${readLabel()}</button>
            <button class="btn text" type="button" data-mn="pick">파일 고르기</button><input type="file" id="mnFile" multiple hidden accept="${accept()}">
            <span class="muted" id="mnState" role="status">${esc(M.msg)}</span></div>
          ${aiNoteHTML(NOTE)}</div>
        <h3>칸</h3>${fieldsHTML(x)}
      </section>
      <section class="pc-card mn-out"><h3>안건</h3>
        <div id="mnAgenda" class="mn-agenda">${agendaHTML(x)}</div>
        <div class="row"><button class="btn" type="button" data-mn="addAgenda">안건 더하기</button></div>
        <h3>할 일</h3><div id="mnTodos">${todosHTML(x)}</div>
        <div class="row"><button class="btn" type="button" data-mn="addTodo">할 일 더하기</button></div>
        <h3>다음 회의</h3>${nextHTML(x)}
        <div class="row mn-export"><button class="btn" type="button" data-mn="copy">복사</button>${formSlotHTML('minutes', exportButton('data-mn="export"', { cls: 'primary' }))}</div>
      </section>
    </div>
    <section class="pc-card"><h3>최근 회의록</h3>${recentHTML()}</section></div>`;
  keepFiles(box, () => { box.innerHTML = html; }); // 파일 고르기 창이 열린 채 다시 그려도 고른 파일이 들어가게(core/keep-files.js)
  const fi = box.querySelector('#mnFile'); if (fi) fi.accept = accept();
}
/* 다시 그린 뒤에도 쓰던 칸·누르던 단추에 초점(AI가 다 정리했을 때·줄을 빼고 더했을 때) */
const KEYS = ['data-mnf', 'data-mna', 'data-mnl', 'data-mnk', 'data-mnj', 'data-mnt', 'data-mnt-done', 'data-mnn', 'data-mn', 'data-mn-addl', 'data-mn-dela', 'data-mn-delt', 'data-mn-open', 'data-mn-del'];
const selOf = el => (el.id ? `#${CSS.escape(el.id)}` : KEYS.filter(n => el.hasAttribute(n)).map(n => `[${n}="${CSS.escape(el.getAttribute(n))}"]`).join(''));
function renderKeep(focus = '') {
  const a = document.activeElement, mine = a && box && box.contains(a) && a !== box;
  const key = focus || (mine ? selOf(a) : '');
  const sel = !focus && mine && a.matches('textarea, input:not([type=checkbox]):not([type=date])') ? [a.selectionStart, a.selectionEnd] : null;
  render();
  const el = key && box && box.querySelector(key);
  if (!el) return;
  el.focus({ preventScroll: !focus });
  if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {}
}
const refreshRecent = () => { const rc = box && box.querySelector('#mnRecent'); if (rc) rc.outerHTML = recentHTML(); };
const setState = m => { M.msg = m; const el = box && box.querySelector('#mnState'); if (el) el.textContent = m; };
function setBusy() { const b = box && box.querySelector('[data-mn="read"]'); if (b) { b.disabled = M.busy; b.innerHTML = readLabel(); } setState(M.msg); }

/* ---------- 넣기 ---------- */
/* 파일: 글(한글·워드·PDF·글)은 읽어 넣기 칸 끝에(무엇이 가는지 보고 [정리하기]), 사진·글자 없는 PDF는 AI가 있을 때만 그림 그대로 보낼 것으로 */
export async function addFiles(files) {
  const texts = [], fails = [];
  let pics = 0, skipped = 0;
  setState('파일 읽는 중…');
  for (const f of files || []) {
    const pic = IMAGE.test(f.name || '') || /^image\//.test(f.type || '');
    if (!pic) {
      try { const t = await readText(f); if (String(t).trim()) texts.push(String(t).trim()); continue; }
      catch (e) { if (!(e && e.code === 'PDF_NO_TEXT')) { fails.push(`${f.name}(${fileMessage(e && e.code)})`); continue; } }
    }
    if (!ai.ready()) { skipped++; continue; }
    if (M.images.length >= MAX_IMAGES) { skipped++; continue; }
    M.images.push(f); pics++;
  }
  if (texts.length) M.paste = [M.paste.trim(), ...texts].filter(Boolean).join('\n\n');
  setState('');
  renderKeep();
  const say = [];
  if (texts.length) say.push(`파일 글을 넣기 칸에 옮겼어요. 확인하고 [정리하기]를 눌러 주세요(원본 파일은 저장하지 않아요)`);
  if (pics) say.push(`사진·스캔 ${pics}개를 넣었어요. [정리하기]를 누르면 그림 그대로 AI로 가요(이름을 가릴 수 없어요)`);
  if (skipped) say.push(ai.ready() ? `사진은 ${MAX_IMAGES}개까지 넣을 수 있어요` : '사진은 AI가 있을 때만 그림 그대로 보내 정리해요. 설정 › AI에서 정하거나 메모 글을 붙여 넣어 주세요');
  if (fails.length) say.push(`읽지 못한 파일: ${fails.join(', ')}`);
  if (say.length) toast(say.join(' · '), 7000);
}

/* [정리하기]: 넣기 칸 글(가린 것)·사진 → AI 한 번 → 칸. 바로 상태를 돌려주고 정리는 이어서
   → 'started' | 'busy' | 'empty'(넣은 것이 없거나 명단·주민번호 줄을 빼니 남은 글이 없음) | 'no-ai' */
export function readMinutes() {
  if (M.busy) return 'busy';
  const x = cur(), images = M.images.slice();
  if (!M.paste.trim() && !images.length) { toast('회의 메모를 붙여 넣거나 파일을 넣어 주세요.', 5000); return 'empty'; }
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요. 안건·할 일은 [안건 더하기]·[할 일 더하기]로 직접 써도 돼요.', 6000); return 'no-ai'; }
  const r = redactInput(M.paste, x);
  if (!r.text.trim() && !images.length) { toast('명단·주민번호가 적힌 줄을 빼니 남은 글이 없어요. 회의 메모를 붙여 넣어 주세요.', 6000); return 'empty'; }
  const tok = ++readTok;
  M.busy = true; M.msg = '정리하는 중…'; setBusy();
  readJob(x, tok, r, images);
  return 'started';
}
async function readJob(x, tok, r, files) {
  const here = () => tok === readTok && cur() === x; // 정리하는 동안 다른 회의록으로 옮기지 않았나
  reading = x; readingTok = tok;
  try {
    const images = [];
    for (const f of files) {
      if (images.length >= MAX_IMAGES) break;
      try { images.push(...(await SS().files.toImages(f)).slice(0, MAX_IMAGES - images.length)); } catch (e) {}
    }
    if (!r.text.trim() && !images.length) throw { code: 'empty' };
    if (here()) setState('AI가 회의록을 정리하는 중…');
    const t = today(), year = schoolYearOf(t); // 연도 없는 날: 오늘이 든 학년도(1·2월은 다음 해, 쪽지·공문 처리와 같게)
    const v = await ai.generateJSON(minutesPrompt({ text: r.text, meta: r.meta, today: t, year, nImages: images.length }), { images, task: 'doc', valid: validMinutes });
    const touched = (x.touched || []).slice();
    const kept = keptKeys(x, touched).length > 0;
    Object.assign(x, keepFields(normMinutes(backAll(v, r.back), { year, today: t }), x, touched), { read: true });
    persist(x);
    if (!here()) { if (hasContent(x) && !gone.has(x.id)) toast(`「${x.title || '회의록'}」 회의록을 정리해 최근 회의록에 넣었어요.`, 5000); refreshRecent(); return; }
    M.busy = false; M.msg = '';
    const cut = [r.dropped ? `명단·주민번호가 적힌 줄 ${r.dropped}곳은 보내지 않았어요` : '', r.masked ? `이름·연락처 ${r.masked}개는 가려 보내고 되돌려 넣었어요` : ''].filter(Boolean).join(' · ');
    const img = images.length ? ` · 사진·스캔 ${images.length}쪽은 그림 그대로 AI로 보냈어요` : '';
    toast(`회의록을 정리했어요${cut ? ` · ${cut}` : ''}${img}${kept ? ' · 고치신 칸은 그대로 두었어요' : ''}. 안건·할 일을 확인해 주세요.`, cut || img ? 7000 : 5000);
  } catch (e) {
    if (!here()) return;
    M.busy = false; M.msg = '';
    toast(e && e.code === 'empty' ? '글을 읽지 못했어요. 메모를 붙여 넣어 주세요.' : e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e), 6000);
  } finally { if (reading === x) reading = null; }
  renderKeep();
}

/* 최근 회의록·「오늘」 카드·채팅 「오늘 할 일」: 그 회의록을 열고 문서·소통 › 회의록으로. 정리하는 중인 회의록이면 「정리하는 중」 그대로 */
export function openMinutes(id) {
  const r = id ? getMinutes(id) : null;
  if (r && cur().id !== r.id) {
    if (reading && reading.id === r.id) { d = reading; setCurrent(r.id); readTok = readingTok; M.busy = true; M.msg = '정리하는 중…'; }
    else switchTo(r);
    M.paste = ''; M.images = [];
  }
  go('etc', 'minutes');
  render();
}
/* 「쌤」 채팅 등(리드가 이음): 새 회의록에 글(·파일)을 넣고 바로 정리 → readMinutes 상태 */
export async function putMinutesText(text, { files = [] } = {}) {
  go('etc', 'minutes');
  switchTo(blankMinutes()); M.paste = String(text || ''); M.images = [];
  if (files.length) await addFiles(files); else render();
  return readMinutes();
}
function newRecord() { switchTo(blankMinutes()); M.paste = ''; M.images = []; render(); }

/* ---------- 누르기·입력 ---------- */
const mine = e => box && !box.hidden && box.contains(e.target);
const filled = a => !!(a && (String(a.title || '').trim() || (a.discussion || []).some(l => String(l).trim()) || (a.decisions || []).some(l => String(l).trim())));
document.addEventListener('click', e => {
  if (!mine(e)) return;
  const t = e.target, x = cur();
  const del = t.closest('[data-mn-del]');
  if (del) {
    const r = listMinutes().find(y => y.id === del.dataset.mnDel);
    if (!r || !confirm(`「${r.title || '제목 없는 회의록'}」 회의록을 지울까요? 할 일도 「오늘」 화면에서 빠져요.`)) return;
    gone.add(r.id); removeMinutes(r.id);
    if (r.id === x.id) { newRecord(); return; }
    refreshRecent(); return;
  }
  const op = t.closest('[data-mn-open]');
  if (op) { openMinutes(op.dataset.mnOpen); return; }
  const addl = t.closest('[data-mn-addl]');
  if (addl) {
    const i = +addl.dataset.mnAddl, k = addl.dataset.mnk, a = x.agenda[i];
    if (!a || !LINE[k] || (a[k] || []).length >= MAX_LINES) return;
    a[k] = [...(a[k] || []), '']; touch(x, 'agenda'); persist(x);
    renderKeep(`[data-mnl="${i}"][data-mnk="${k}"][data-mnj="${a[k].length - 1}"]`); return;
  }
  const dell = t.closest('[data-mn-dell]');
  if (dell) {
    const i = +dell.dataset.mnDell, k = dell.dataset.mnk, a = x.agenda[i];
    if (!a || !Array.isArray(a[k])) return;
    a[k].splice(+dell.dataset.mnj, 1); touch(x, 'agenda'); persist(x); refreshRecent();
    renderKeep(`[data-mn-addl="${i}"][data-mnk="${k}"]`); return;
  }
  const dela = t.closest('[data-mn-dela]');
  if (dela) {
    const i = +dela.dataset.mnDela, a = x.agenda[i];
    if (!a || (filled(a) && !confirm(`「${a.title || `${i + 1}번째 안건`}」 안건을 뺄까요?`))) return;
    x.agenda.splice(i, 1); touch(x, 'agenda'); persist(x); refreshRecent();
    renderKeep('[data-mn="addAgenda"]'); return;
  }
  const delt = t.closest('[data-mn-delt]');
  if (delt) { x.todos.splice(+delt.dataset.mnDelt, 1); touch(x, 'todos'); persist(x); refreshRecent(); renderKeep('[data-mn="addTodo"]'); return; }
  const imd = t.closest('[data-mn-img-del]');
  if (imd) { M.images.splice(+imd.dataset.mnImgDel, 1); const el = box.querySelector('#mnImgs'); if (el) el.outerHTML = imgsHTML(); return; }
  const b = t.closest('[data-mn]');
  if (!b) return;
  const act = b.dataset.mn;
  if (act === 'pick') box.querySelector('#mnFile').click();
  else if (act === 'read') readMinutes();
  else if (act === 'new') newRecord();
  else if (act === 'addAgenda') {
    if (x.agenda.length >= MAX_AGENDA) { toast(`안건은 ${MAX_AGENDA}개까지 넣을 수 있어요.`, 5000); return; }
    x.agenda.push({ title: '', discussion: [], decisions: [] }); touch(x, 'agenda');
    renderKeep(`[data-mna="${x.agenda.length - 1}"]`);
  } else if (act === 'addTodo') {
    if (x.todos.length >= MAX_TODOS) { toast(`할 일은 ${MAX_TODOS}개까지 넣을 수 있어요. 끝낸 할 일을 [✕]로 빼고 더해 주세요.`, 6000); return; }
    x.todos.push({ task: '', who: '', due: '', done: false }); touch(x, 'todos');
    renderKeep(`[data-mnt="${x.todos.length - 1}"][data-mnk="task"]`);
  } else if (act === 'copy') copyText(minutesText(x)).then(ok => toast(ok ? '회의록 글을 복사했어요. 쪽지·메신저에 붙여 넣으세요.' : '복사하지 못했어요'));
  else if (act === 'export') {
    if (!hasContent(x)) { toast('내려받을 회의록이 없어요. 먼저 [정리하기]를 눌러 주세요.', 5000); return; }
    exportDoc(minutesDoc(x), docName(x)).then(m => toast(m, 6000), () => toast('파일을 만들지 못했어요. 다시 눌러 주세요.', 5000));
  }
});
document.addEventListener('change', e => {
  if (!mine(e)) return;
  const el = e.target, x = cur();
  if (el.id === 'mnFile') { const fs = [...el.files]; el.value = ''; if (fs.length) addFiles(fs); return; }
  if (el.dataset.mnf === 'kind') { x.kind = el.value; touch(x, 'kind'); persist(x); refreshRecent(); return; }
  if (el.dataset.mntDone != null) {
    const td = x.todos[+el.dataset.mntDone];
    if (!td) return;
    td.done = el.checked; persist(x); refreshRecent(); // 체크는 고친 칸이 아님(다시 정리하면 같은 할 일의 체크를 이어 감)
    const li = el.closest('.mn-todo'); if (li) li.classList.toggle('done', el.checked);
  }
});
document.addEventListener('input', e => {
  if (!mine(e)) return;
  const el = e.target, x = cur(), v = el.value;
  if (el.id === 'mnPaste') { M.paste = v; return; }
  if (el.dataset.mnf && el.dataset.mnf !== 'kind') {
    const k = el.dataset.mnf;
    if (k === 'date' && !okDate(v)) return;
    x[k] = v; touch(x, k);
  } else if (el.dataset.mna != null) { const a = x.agenda[+el.dataset.mna]; if (!a) return; a.title = v; touch(x, 'agenda'); }
  else if (el.dataset.mnl != null) { const a = x.agenda[+el.dataset.mnl], k = el.dataset.mnk; if (!a || !Array.isArray(a[k])) return; a[k][+el.dataset.mnj] = v; touch(x, 'agenda'); }
  else if (el.dataset.mnt != null) {
    const td = x.todos[+el.dataset.mnt], k = el.dataset.mnk;
    if (!td || !['task', 'who', 'due'].includes(k) || (k === 'due' && !okDate(v))) return;
    td[k] = v; touch(x, 'todos');
  } else if (el.dataset.mnn) {
    const k = el.dataset.mnn;
    if (k === 'date' && !okDate(v)) return;
    x.next = { ...x.next, [k]: v }; touch(x, 'next');
  } else return;
  persist(x); refreshRecent();
});
document.addEventListener('dragover', e => { const z = box && e.target.closest && e.target.closest('[data-mn-drop]'); if (z && box.contains(z)) { e.preventDefault(); z.classList.add('over'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest('[data-mn-drop]'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', e => {
  const z = box && e.target.closest && e.target.closest('[data-mn-drop]');
  if (!z || !box.contains(z)) return;
  e.preventDefault(); z.classList.remove('over');
  const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (fs.length) { addFiles(fs); return; }
  const t = e.dataTransfer && e.dataTransfer.getData('text/plain');
  if (t) { M.paste = [M.paste.trim(), t.trim()].filter(Boolean).join('\n\n'); const p = box.querySelector('#mnPaste'); if (p) p.value = M.paste; }
});

/* 학교 양식(.hwpx)으로 내려받기: 제목·본문 자리에 회의록, 날짜 자리에 회의 날 */
registerFormDoc('minutes', () => { const x = cur(); return hasContent(x) ? { doc: minutesDoc(x), name: docName(x), date: x.date } : null; });

onEnter('etc', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'mn-box'; section.append(box); }
  box.hidden = tab !== 'minutes';
  if (!box.hidden) render();
});
