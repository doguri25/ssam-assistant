/* 기타 › 인수인계서 (스펙 2026-11-06 L, 2026-11-10 설정 › 학년도의 창에서 기타 탭으로): 지금 학년도 자료에서 넣을 업무·항목을 고르고(처음엔 모두),
   「다음 담당자에게」를 쓰거나 [AI로 정리](위 내용만 보냄, 이름·전화번호 없이), 「몇 쪽으로」에 맞춰 줄이고(handover-fit.js) → 한글·워드·PDF.
   학교 인수인계서 양식(.hwpx)을 [양식 넣기]로 넣어 두면 [한글로 내려받기]는 그 양식의 제목·본문 자리에 채움(워드·PDF는 기본 양식).
   양식은 IndexedDB(form-store.js 「handover」 — 가정통신문 양식과 따로), 고른 것·글·쪽 수·고른 양식은 학년도 자료(handover-model.js).
   다른 곳(채팅 「인수인계서」·설정 › 학년도 [업무 인수인계서 만들기])은 openHandover()로 엶 */
import { onEnter, go } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { toast, saveFile } from '../../core/ui.js';
import { exportButton, exportDoc, docHtml, getFormat } from '../../core/doc-export.js';
import { aiRowHTML } from '../../core/ai-roles.js';
import { keepFiles } from '../../core/keep-files.js';
import { readForm, fillForm } from '../../core/hwpx-form.js';
import { forms, newFormId, MAX_FORM } from '../../core/form-store.js';
import { docToLetter } from '../../core/body-table.js';
import { fileMessage } from '../../core/files.js';
import { currentYear } from '../../core/years.js';
import { getSchool } from '../../core/settings.js';
import { GROUPS, collectHandover, pickData, isOn, buildHandover, handoverText, handoverPrompt, normNote, noteRange, getSaved, saveHandover, dotDate, formRoles, formRolesOk } from './handover-model.js';
import { PAGES, fitPages, fitNotice } from './handover-fit.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number(n || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const baseName = n => String(n || '').replace(/\.[^.]+$/, '').trim() || '양식';
const fileBase = s => String(s || '업무 인수인계서').replace(/[\\/:*?"<>|]/g, '_');
const NS = 'handover'; // 양식 저장소 이름(가정통신문 양식과 따로)
const QUOTA = '양식을 저장하지 못했어요(저장 공간이 꽉 찼을 수 있어요).';
const HWP_MSG = '.hwp 양식은 채울 수 없어요. 한글에서 [다른 이름으로 저장] → .hwpx로 저장해 넣어 주세요.';

let box = null;
let st = null; // { data, picks, note, pages, formId } — 탭에 들어올 때마다 새로 모음
// [AI로 정리] 하는 중: 다른 탭·메뉴에 갔다 와도 「정리하는 중」이고, 끝나면 그때의 화면(다시 모은 st)에 넣음
let aiBusy = false;
/* 양식(화면에만): store, list(저장한 양식), form({ rec, parsed, temp }), adding(읽는 중), mapOpen·mapSel(양식 맞추기) */
const F = { store: null, list: [], form: null, adding: 0, mapOpen: false, mapSel: -1 };

/* 기타 › 인수인계서로 감(설정 › 학년도 단추·채팅 「인수인계서」) */
export function openHandover() {
  go('etc', 'handover');
}

/* ---------- 상태 ---------- */
function load() {
  const saved = getSaved();
  st = { data: collectHandover({ year: currentYear(), school: getSchool().name }), picks: saved.picks, note: saved.note, pages: saved.pages, formId: saved.formId };
}
const save = () => saveHandover({ note: st.note, picks: st.picks, pages: st.pages, formId: st.formId });
const fullDoc = () => buildHandover(pickData(st.data, st.picks), { note: st.note, today: today() });
const fitted = () => fitPages(fullDoc(), st.pages);

/* ---------- 양식 ---------- */
const formsSig = () => JSON.stringify([F.list.map(f => [f.id, f.name]), F.form ? [F.form.rec.id, !!F.form.temp] : null]);
async function loadForms() {
  if (!F.store) F.store = await forms(NS);
  // 저장소를 잠깐 읽지 못하면(또는 IndexedDB를 못 열어 메모리로 쓰는 중이면) 고른 양식은 그대로 둠 — 진짜로 읽은 목록에 없을 때만 지움
  let read = F.store.persistent !== false;
  try { F.list = await F.store.list(); } catch (e) { read = false; }
  if (F.form && F.form.temp) return; // 이번에만 쓰는 양식(저장하지 못한 것)은 그대로
  if (st.formId && (!F.form || F.form.rec.id !== st.formId)) { if (read || F.list.some(x => x.id === st.formId)) await selectForm(st.formId, { quiet: true }); }
  else if (!st.formId) F.form = null;
}
let selTok = 0;
async function selectForm(id, { quiet = false } = {}) {
  const tok = ++selTok; // 빨리 바꿔 고르면 마지막 것만
  st.formId = id; save();
  F.form = null; F.mapOpen = false; F.mapSel = -1;
  drawForms();
  if (!id) return;
  if (!F.store) F.store = await forms(NS);
  let rec = null, failed = F.store.persistent === false;
  try { rec = await F.store.get(id); } catch (e) { rec = null; failed = true; }
  if (tok !== selTok) return;
  // 읽지 못한 것(저장소 탈)은 고른 것을 남겨 두고 다음에 다시 읽음, 정말 없는 양식만 기본 양식으로
  if (!rec && failed) { if (!quiet) toast('양식을 읽지 못했어요. 잠시 뒤 다시 골라 주세요.', 5000); drawForms(); return; }
  if (!rec || rec.kind !== 'hwpx') { st.formId = ''; save(); if (!quiet) toast('양식을 찾지 못했어요. 기본 양식으로 만들어요.'); drawForms(); return; }
  let parsed = null;
  try { parsed = await readForm(rec.bytes); } catch (e) { toast('양식 파일을 읽지 못했어요. 다시 넣어 주세요.', 5000); }
  if (tok !== selTok) return;
  F.form = parsed ? { rec, parsed } : null;
  drawForms();
}
/* 양식 넣기: .hwpx만(모양 그대로 채움). .hwp는 .hwpx로 저장해 넣게 안내 */
async function addForm(file) {
  if (/\.hwp$/i.test(file.name)) { toast(HWP_MSG, 8000); return; }
  F.adding++; drawForms();
  try {
    if (!F.store) F.store = await forms(NS); // 탭을 연 바로 그때 넣어도
    const u8 = new Uint8Array(await file.arrayBuffer());
    if (u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) { F.adding--; drawForms(); toast(HWP_MSG, 8000); return; } // 이름만 .hwpx인 .hwp
    const parsed = await readForm(u8);
    const rec = { id: newFormId(), name: baseName(file.name), kind: 'hwpx', bytes: u8, roles: formRoles(parsed.lines), savedAt: Date.now() };
    let temp = '';
    if (u8.length > MAX_FORM) temp = '양식 파일이 5MB보다 커서 저장하지 않고 이번에만 써요.';
    else { try { await F.store.put(rec); F.list = await F.store.list(); } catch (e) { temp = `${QUOTA} 이번에만 써요.`; } }
    ++selTok;
    F.adding--;
    F.form = { rec, parsed, temp: !!temp }; F.mapSel = -1; F.mapOpen = !formRolesOk(rec.roles);
    st.formId = temp ? '' : rec.id; save();
    drawForms();
    if (temp) toast(temp, 7000);
    else if (F.mapOpen) toast('제목·본문 자리를 다 찾지 못했어요. 줄을 눌러 정해 주세요.', 6000);
    else toast(`「${rec.name}」 양식을 저장했어요. 자리가 맞는지 [양식 맞추기]에서 볼 수 있어요.`, 5000);
    if (!temp && !F.store.persistent) toast('이 브라우저는 양식을 저장할 수 없어 이번에만 써요.', 6000);
  } catch (e) {
    F.adding = Math.max(0, F.adding - 1); drawForms();
    toast(e && e.code ? fileMessage(e.code) : '양식 파일을 읽지 못했어요. 한글(.hwpx) 파일을 넣어 주세요.', 6000);
  }
}
/* 양식 맞추기: 줄마다 자리(제목·본문·날짜). 나머지 줄(결재란·서명 칸 등)은 그대로 둠 */
const ROLE_NAMES = [['title', '제목'], ['bodyStart', '본문 시작'], ['bodyEnd', '본문 끝'], ['date', '날짜']];
function roleOf(r, i) {
  if (!r) return '';
  if (i === r.date) return '날짜';
  if (i === r.title) return '제목';
  if (r.bodyStart >= 0 && i >= r.bodyStart && i <= r.bodyEnd) return '본문';
  return '';
}
function mapHTML() {
  const f = F.form;
  if (!F.mapOpen || !f || !f.parsed) return '';
  const r = f.rec.roles, lines = f.parsed.lines.slice(0, 200);
  return `<div class="lf-map ho-map" id="hoMap"><div class="row"><b class="grow">양식 맞추기${formRolesOk(r) ? '' : ' <span class="muted warn">· 제목 → 본문 시작 → 본문 끝 차례로 정해 주세요</span>'}</b><button class="btn primary" type="button" data-ho="mapSave">저장</button><button class="btn text" type="button" data-ho="mapClose">닫기</button></div>
    <p class="muted" style="margin:0">줄을 누르고 자리를 고르세요. 제목 줄에는 문서 제목을, 본문 시작~끝에는 인수인계서 내용을 넣고 나머지 줄(결재란·서명 칸 등)은 그대로 둬요. 양식에 {제목}·{본문}·{날짜}를 적어 두어도 돼요.</p>
    <ol class="lf-lines">${lines.map((l, i) => { const ro = roleOf(r, i); return `<li class="lf-r-${{ 제목: 'title', 본문: 'body', 날짜: 'date' }[ro] || 'none'}${F.mapSel === i ? ' sel' : ''}">
      <button type="button" data-ho-line="${i}"><span class="lf-badge">${ro || '·'}</span><span class="lf-text">${esc(l.text.trim() ? l.text : l.obj ? '(그림·개체)' : '(빈 줄)')}</span></button>
      ${F.mapSel === i ? `<span class="row lf-pick">${ROLE_NAMES.map(([k, n]) => `<button class="btn tiny" type="button" data-ho-role="${k}">${n}</button>`).join('')}<button class="btn text tiny" type="button" data-ho-role="nodate">날짜 없음</button></span>` : ''}</li>`; }).join('')}</ol></div>`;
}
function formsHTML() {
  const f = F.form, id = f ? f.rec.id : st.formId;
  return `<div class="row lf-forms"><label class="yp-f grow"><span class="lab">인수인계서 양식</span><select class="field" id="hoForm">
      <option value="">기본 양식(쌤비서)</option>
      ${F.list.map(x => `<option value="${esc(x.id)}"${x.id === id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
      ${f && f.temp ? `<option value="${esc(f.rec.id)}" selected>${esc(f.rec.name)} (이번에만)</option>` : ''}</select></label>
    <span class="row"><button class="btn" type="button" data-ho="pickForm"${F.adding ? ' disabled' : ''}>${F.adding ? '<span class="spin"></span>읽는 중…' : '양식 넣기'}</button>
      ${f ? '<button class="btn text" type="button" data-ho="map">양식 맞추기</button><button class="btn text" type="button" data-ho="delForm">양식 지우기</button>' : ''}
      <input type="file" id="hoFormFile" hidden accept=".hwpx,.hwp"></span></div>
    <p class="muted" style="margin:0">${f ? `[한글로 내려받기]는 「${esc(f.rec.name)}」 양식의 제목·본문 자리에 채워요(결재란·서명 칸은 그대로). 워드·PDF는 기본 양식으로 만들어요.`
    : '학교 인수인계서 양식(.hwpx)을 한 번 넣어 두면 [한글로 내려받기]가 그 양식에 채워요. 가정통신문 양식과 따로 저장해요.'}</p>
    ${mapHTML()}`;
}
/* 다시 그린 뒤 초점을 돌려 둘 곳: 쓰던 칸(id·줄·단추) → 없어졌으면 가까운 것(자리 단추 → 그 줄, 맞추기 닫기·저장 → [양식 맞추기], 그다음 양식 고르기) */
function focusKeys(a, el) {
  if (!a || !el.contains(a)) return [];
  const ln = a.dataset.hoRole != null && a.closest('li') && a.closest('li').querySelector('[data-ho-line]');
  return [a.id ? `#${a.id}` : '', a.dataset.hoLine != null ? `[data-ho-line="${a.dataset.hoLine}"]` : '', a.dataset.ho ? `[data-ho="${a.dataset.ho}"]` : '',
    ln ? `[data-ho-line="${ln.dataset.hoLine}"]` : '', '[data-ho="map"]', '#hoForm'].filter(Boolean);
}
/* 양식 칸만 다시(치던 「다음 담당자에게」·고른 것은 그대로, 파일 고르기 창이 열린 채여도 고른 파일이 들어가게, 키보드 초점도 그 칸에 — <body>로 가지 않게) */
function drawForms() {
  const el = box && box.querySelector('#hoFormBox');
  if (!el) return;
  const keys = focusKeys(document.activeElement, el);
  keepFiles(box, () => { el.innerHTML = formsHTML(); });
  if (keys.length && !el.contains(document.activeElement)) {
    for (const k of keys) { const n = el.querySelector(k); if (n && !n.disabled) { n.focus({ preventScroll: true }); break; } }
  }
  const hint = box.querySelector('#hoPrevHint');
  if (hint) hint.textContent = prevHint();
}
const prevHint = () => (F.form ? `미리 보기는 기본 양식이에요. 한글로 내려받으면 「${F.form.rec.name}」 양식에 채워요.` : '');

/* ---------- 그리기 ---------- */
/* 고르기 목록의 한 줄: [이름, 덧붙임…] */
const LABEL = {
  duties: d => [d.name, d.year !== st.data.year ? `${d.year}학년도` : '', d.schedule.length ? `일정 ${d.schedule.length}개` : '일정 없음'],
  events: e => [e.name, e.date ? dotDate(e.date) : '날짜 없음', e.status],
  purchases: p => [p.title, p.kind, `${won(p.amount)}원`],
  docs: d => [d.title, d.due ? `기한 ${dotDate(d.due)}` : '기한 없음', d.done ? '완료' : '진행 중'],
  reports: r => [r.title, dotDate(r.date)]
};
function groupHTML([g, label]) {
  const items = st.data[g] || [];
  if (!items.length) return '';
  return `<fieldset class="ho-group" data-hg="${g}"><legend><label><input type="checkbox" data-ho-all="${g}"> <b>${esc(label)}</b> <span class="muted" data-ho-count="${g}"></span></label></legend>
    <ul>${items.map(x => { const [main, ...rest] = LABEL[g](x); return `<li><label><input type="checkbox" data-ho-pick="${esc(x.id)}" data-g="${g}"${isOn(x, st.picks) ? ' checked' : ''}> <span>${esc(main)}</span> <span class="muted">${esc(rest.filter(Boolean).join(' · '))}</span></label></li>`; }).join('')}</ul></fieldset>`;
}
const aiLabel = () => (aiBusy ? '정리하는 중…' : 'AI로 정리');
function pageHTML() {
  const empty = GROUPS.every(([g]) => !(st.data[g] || []).length), [lo, hi] = noteRange(st.pages);
  return `<div class="m-page ho-page">
    <div class="m-head m-head-row"><div><h2>업무 인수인계서</h2><p class="muted">${st.data.year}학년도 연간계획·행사·품의·공문·결과 보고를 모아 다음 담당자에게 넘길 문서를 만들어요. 학생 자료·교직원 이름·전화번호는 넣지 않아요.</p></div>
      <div class="m-head-act">${aiRowHTML('plan')}</div></div>
    <div class="msg-grid">
      <section class="pc-card"><h3>넣을 것</h3>
        ${empty ? '<p class="banner info" style="margin:0"><span class="grow">아직 모을 자료가 없어요. 연간계획·행사계획·품의·공문 처리·결과 보고에 자료가 있으면 여기에 모여요.</span></p>'
    : `<p class="muted" style="margin:0">넣을 것만 골라 주세요. 처음엔 이번 학년도 것을 모두 골라 두어요.</p><div class="ho-groups">${GROUPS.map(groupHTML).join('')}</div>`}
        <label class="ho-note"><span class="lab">다음 담당자에게</span><textarea class="field" id="hoNote" rows="5" placeholder="예) 3월 첫 주에 학부모 총회 자료부터 챙겨요.">${esc(st.note)}</textarea></label>
        <div class="row"><button class="btn" type="button" data-ho="ai" id="hoAi"${aiBusy ? ' disabled' : ''}>${aiLabel()}</button><span class="muted ho-hint" id="hoAiHint">고른 내용만 보내요(이름·전화번호 없이). ${lo}~${hi}줄로 써 주고, 고쳐 써도 돼요.</span></div>
      </section>
      <section class="pc-card"><h3>양식·쪽 수</h3>
        <div id="hoFormBox">${formsHTML()}</div>
        <label class="yp-f ho-pages"><span class="lab">몇 쪽으로</span><select class="field" id="hoPages">
          ${PAGES.map(n => `<option value="${n}"${st.pages === n ? ' selected' : ''}>${n}쪽</option>`).join('')}<option value="0"${st.pages ? '' : ' selected'}>쪽 수 제한 없음</option></select></label>
        <p class="banner info ho-fit" id="hoFit" style="margin:0"><span class="grow"></span></p>
        <h3>미리 보기</h3>
        <p class="muted ho-hint" id="hoPrevHint" style="margin:0">${esc(prevHint())}</p>
        <div class="ho-prev" id="hoPrev"></div>
        <div class="row" style="justify-content:flex-end">${exportButton('data-ho="export"', { cls: 'primary' })}</div>
      </section>
    </div></div>`;
}
export function render() {
  if (!box || box.hidden || !st) return;
  keepFiles(box, () => { box.innerHTML = pageHTML(); });
  refresh();
}
/* 개수·「모두」 체크·쪽 수 알림·미리 보기를 지금 고른 것에 맞춤 (counts: false면 글만 바뀜 → 체크는 그대로) */
function refresh({ counts = true } = {}) {
  if (!box || !st) return;
  if (counts) for (const [g] of GROUPS) {
    const items = st.data[g] || [], all = box.querySelector(`[data-ho-all="${g}"]`);
    if (!all) continue;
    const n = items.filter(x => isOn(x, st.picks)).length;
    all.checked = n === items.length; all.indeterminate = n > 0 && n < items.length;
    box.querySelectorAll(`[data-ho-pick][data-g="${g}"]`).forEach(i => { const x = items.find(y => y.id === i.dataset.hoPick); if (x) i.checked = isOn(x, st.picks); });
    box.querySelector(`[data-ho-count="${g}"]`).textContent = `${n}/${items.length}`;
  }
  const f = fitted();
  const prev = box.querySelector('#hoPrev');
  if (prev) prev.innerHTML = docHtml(f.doc);
  const fit = box.querySelector('#hoFit');
  if (fit) { fit.querySelector('.grow').textContent = fitNotice(f.cut); fit.classList.toggle('warn', f.cut.over); fit.classList.toggle('info', !f.cut.over); }
  const [lo, hi] = noteRange(st.pages), hint = box.querySelector('#hoAiHint');
  if (hint) hint.textContent = `고른 내용만 보내요(이름·전화번호 없이). ${lo}~${hi}줄로 써 주고, 고쳐 써도 돼요.`;
}

/* ---------- AI로 정리 ---------- */
function drawAiBtn() {
  const b = box && box.querySelector('#hoAi');
  if (b) { b.disabled = aiBusy; b.textContent = aiLabel(); }
}
async function runAi() {
  if (aiBusy) return;
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  // 「다음 담당자에게」는 빼고 고른 내용만 보냄(쪽 수로 줄이기 전 것 — 줄인 품의·공문도 보고 챙길 것을 고르게). 이름·전화번호는 모을 때 이미 뺌
  const pages = st.pages, text = handoverText(fullDoc()), names = st.data.names, [, hi] = noteRange(pages);
  aiBusy = true; drawAiBtn();
  try {
    const v = await ai.generateJSON(handoverPrompt(text, { pages }), { task: 'plan', valid: o => normNote(o).length > 0 });
    // 그새 다른 곳에 갔다 와서 다시 모았으면 그 st의 글로(고른 것은 그대로) — 다시 들어와 고쳐도 옛 글로 덮이지 않게
    st.note = normNote(v, names, hi).map(l => `- ${l}`).join('\n');
    save();
    const ta = box && box.querySelector('#hoNote');
    if (ta) { ta.value = st.note; refresh({ counts: false }); }
    const shown = !!ta && !box.hidden && !box.closest('[hidden]');
    toast(shown ? 'AI가 정리했어요. 고쳐 써도 돼요.' : '인수인계서의 「다음 담당자에게」를 AI가 정리해 두었어요. 기타 › 인수인계서에서 열어 보세요.', shown ? undefined : 6000);
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e), 6000);
  }
  aiBusy = false; drawAiBtn();
}

/* ---------- 내려받기 ---------- */
/* 한글(.hwpx)이고 양식을 골랐으면 그 양식에 채움, 아니면 기본 양식으로 한글·워드·PDF. 늘 「몇 쪽으로」에 맞춘 문서 */
async function download() {
  const d = fitted().doc;
  if (getFormat() === 'hwpx' && F.form && F.form.parsed) { await formExport(d); return; }
  try { toast(await exportDoc(d, d.title), 6000); } catch (e) { toast('파일을 만들지 못했어요. 다시 눌러 주세요.', 5000); }
}
async function formExport(d) {
  const f = F.form, r = f.rec.roles;
  if (!formRolesOk(r)) { F.mapOpen = true; drawForms(); toast('양식의 제목·본문 자리를 먼저 정해 주세요.', 5000); return; }
  let bytes, warn, where;
  try {
    ({ bytes, warn } = await fillForm(f.parsed, r, { ...docToLetter(d), date: today(), reply: null }));
    where = await saveFile(`${fileBase(d.title)}.hwpx`, bytes, 'application/hwp+zip');
  } catch (e) { toast(`한글 파일을 만들지 못했어요: ${String((e && e.message) || e || '').slice(0, 80)}`, 7000); return; }
  toast((window.__TAURI__ ? `다운로드 폴더에 저장했어요: ${String(where).split(/[\\/]/).pop()}` : `「${f.rec.name}」 양식으로 한글 파일을 내려받았어요`)
    + (warn.includes('no-border') ? ' · 이 양식에는 표 테두리를 더할 수 없어 표는 글로 넣었어요' : '')
    + (warn.includes('overlap') ? ' · 겹치는 자리가 있어 일부를 바꾸지 못했어요. [양식 맞추기]를 확인해 주세요' : ''), 7000);
}

/* ---------- 이벤트 ---------- */
const mine = e => box && !box.hidden && box.contains(e.target);
document.addEventListener('click', async e => {
  if (!mine(e) || !st) return;
  const ln = e.target.closest('[data-ho-line]');
  if (ln) { F.mapSel = F.mapSel === +ln.dataset.hoLine ? -1 : +ln.dataset.hoLine; drawForms(); return; }
  const ro = e.target.closest('[data-ho-role]');
  if (ro && F.form && F.mapSel >= 0) {
    const r = { ...F.form.rec.roles }, i = F.mapSel, k = ro.dataset.hoRole;
    F.mapSel = -1;
    if (k === 'nodate') r.date = -1;
    else if (k === 'date' && i >= r.bodyStart && i <= r.bodyEnd && r.bodyStart >= 0) { toast('날짜 줄은 본문 밖에서 골라 주세요.', 4000); drawForms(); return; }
    else {
      r[k] = i;
      if (k === 'bodyStart' && r.bodyEnd < i) r.bodyEnd = i;
      if (k === 'bodyEnd' && (r.bodyStart < 0 || r.bodyStart > i)) r.bodyStart = i;
      if (k !== 'date' && r.date >= 0 && (r.date === r.title || (r.date >= r.bodyStart && r.date <= r.bodyEnd))) r.date = -1; // 제목·본문이 된 줄은 날짜가 아님
    }
    F.form.rec.roles = r; drawForms(); return;
  }
  const b = e.target.closest('[data-ho]');
  if (!b) return;
  const a = b.dataset.ho;
  if (a === 'ai') runAi();
  else if (a === 'export') download();
  else if (a === 'pickForm') box.querySelector('#hoFormFile').click();
  else if (a === 'map') { F.mapOpen = !F.mapOpen; F.mapSel = -1; drawForms(); }
  else if (a === 'mapClose') { F.mapOpen = false; F.mapSel = -1; drawForms(); }
  else if (a === 'mapSave' && F.form) {
    if (F.list.some(x => x.id === F.form.rec.id)) { try { await F.store.put(F.form.rec); } catch (er) { toast(QUOTA, 6000); return; } }
    F.mapOpen = false; F.mapSel = -1; drawForms();
    toast(formRolesOk(F.form.rec.roles) ? '양식 자리를 저장했어요.' : '제목·본문 자리가 아직 비어 있어요.', 4000);
  } else if (a === 'delForm' && F.form) {
    if (!F.form.temp) { try { await F.store.del(F.form.rec.id); F.list = await F.store.list(); } catch (er) { toast('양식을 지우지 못했어요. 다시 눌러 주세요.', 5000); return; } }
    await selectForm('');
    toast('양식을 지웠어요.');
  }
});
document.addEventListener('change', e => {
  if (!mine(e) || !st) return;
  const el = e.target;
  if (el.id === 'hoFormFile') { const f = el.files[0]; el.value = ''; if (f) addForm(f); return; }
  if (el.id === 'hoForm') { selectForm(el.value); return; }
  if (el.id === 'hoPages') { st.pages = Number(el.value) || 0; save(); refresh({ counts: false }); return; }
  if (el.dataset.hoPick) st.picks[el.dataset.hoPick] = el.checked;
  else if (el.dataset.hoAll) for (const x of st.data[el.dataset.hoAll] || []) st.picks[x.id] = el.checked;
  else return;
  save(); refresh();
});
document.addEventListener('input', e => {
  if (!mine(e) || !st || e.target.id !== 'hoNote') return;
  st.note = e.target.value; save(); refresh({ counts: false });
});

onEnter('etc', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'ho-box'; section.append(box); }
  box.hidden = tab !== 'handover';
  if (box.hidden) return;
  // 들어올 때마다 다시 모음(다른 메뉴에서 바뀐 계획·품의·공문), 고른 것·글·쪽 수·양식은 저장한 것
  load();
  render();
  // 양식 목록은 들어올 때마다 다시 읽음: 바뀐 것이 있을 때만 양식 칸을 다시 그림
  const sig = formsSig();
  loadForms().then(() => { if (formsSig() !== sig) drawForms(); }).catch(() => {});
});
