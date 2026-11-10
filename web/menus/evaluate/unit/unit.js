/* 평가 › 단원평가 (스펙 2): 평가 목록 · 결과 모아 보기, 평가마다 4단계.
   이 파일은 탭 진입·목록·단계 틀·1단계(학생 문제지·답안). 1단계의 [학생 문제지 넣기(스캔한 것)] 줄과 2·3단계는 unit-grading.js(registerPapers),
   4단계는 unit-feedback.js, 결과 모아 보기는 unit-results.js가 registerStep·registerResults로 붙임.
   단추는 이름대로: [답안 넣기]에 학생 문제지 스캔을, [학생 문제지 넣기]에 답안 한글 파일을 넣어도 맞는 곳에 옮겨 넣음(unit-route.js) */
import { onEnter, go } from '../../../core/shell.js';
import { registerInbox } from '../../../core/inbox.js';
import { toast } from '../../../core/ui.js';
import * as ai from '../../../core/ai.js';
import { readText, fileMessage } from '../../../core/files.js';
import { stepsHTML } from '../../../core/steps.js';
import { parseKey, parsePaper, keyTotal, splitCombined } from './unit-key.js';
import { ITEM_TYPES, rescoreItem } from './unit-grade.js';
import { listTests, getTest, saveTest, removeTest, newTest, makeTitle, graded, maskOf } from './unit-model.js';
import { keyPrompt, normKeyAI } from './unit-ai.js';
import { sampleTests } from './unit-sample.js';
import { readBundle, openBundleCard, needsCard, bundleBoxHTML, onBundle } from '../../../core/bundle.js';
import { isDocFile, keyName, paperFileGoes, keyFileGoes, bundleParts } from './unit-route.js';
import { linkHTML, openLinkSheet } from '../../../core/eval-link.js';
import { accuracyText, yearAccuracy, yearText } from '../grade-accuracy.js';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SS = () => window.SSAM || {};
export const AI_KEY = '설정 › AI에서 키를 넣어 주세요';
const STEPS = ['학생 문제지·답안', '나누기·이름 가리기', '채점·확인', '피드백'];
const PDFJS = 'PDF를 읽는 도구를 불러오지 못했어요. 인터넷 연결을 확인하거나 사진으로 넣어 주세요.';
const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '음악', '미술', '체육', '실과'];

/* 화면 상태: view 'list' | 'results' | 'test'. 저장 전의 새 평가는 draft에 둠(정답표가 생기면 저장) */
export const U = { view: 'list', id: null, draft: null, step: 1, msg: { id: null, key: '', paper: '' } };
const stepViews = {};
let resultsView = null, box = null, curTab = null;
export const registerStep = (n, v) => { stepViews[n] = v; };
export const registerResults = v => { resultsView = v; };
/* 학생 문제지(스캔) 쪽: { html(t), put(files, t0), putPages(pages, t0), keyArrived(id), note(id, text) } — unit-grading.js가 붙임 */
let papers = null;
export const registerPapers = p => { papers = p; };
export const visible = () => curTab === 'unit' && !!box && box.isConnected && !box.hidden && !box.closest('[hidden]');
export const inStep = n => visible() && U.view === 'test' && U.step === n;
export const cur = () => (U.id ? getTest(U.id) : U.draft);
export const curId = () => (U.id || (U.draft && U.draft.id) || null);
export const getBox = () => box;

export function saveOrWarn(t) {
  const ok = saveTest(t);
  if (!ok) toast('저장 공간이 모자라 저장하지 못했어요', 6000);
  return ok;
}
/* [새 단원평가]로 시작한 저장 전 평가: 답안을 읽는 동안 목록으로 나가도 읽은 것을 넣어 저장함(저장하면 뺌) */
const drafts = new WeakSet();
/* 고친 평가 저장: 정답표가 생기기 전의 새 평가는 저장하지 않고 draft에 둠 */
export function commit(t) {
  // 목록으로 나간 뒤 끝난 읽기(시작한 새 평가)는 지금 보는 평가를 바꾸지 않음
  if (!getTest(t.id) && !t.key.items.length) { if (curId() === t.id) U.draft = t; return true; }
  const ok = saveOrWarn(t);
  if (ok) drafts.delete(t);
  if (ok && curId() === t.id) { U.id = t.id; U.draft = null; }
  return ok;
}
/* 같은 평가를 보고 있으면 다시 그림 (AI가 끝났을 때 등). 선생님이 칸에 쓰는 중이면 칸을 떠날 때까지 미룸 */
let pendingRefresh = false;
export const editing = () => {
  const a = document.activeElement;
  return !!(a && box && box.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/^(file|checkbox|radio|button)$/.test(a.type))));
};
/* 단추 등을 누르는 중(누르고 떼기 전): 그 사이 다시 그리면 눌린 단추가 사라져 click이 나지 않으므로 뗀 뒤로 미룸.
   글 칸·고르기 칸을 누를 때는 표시하지 않음(고르기 목록은 뗌이 화면에 오지 않을 수 있음). 혹시 뗌을 놓쳐도 2초 뒤엔 풂 */
let pressAt = 0;
const pressing = () => Date.now() - pressAt < 2000;
const TYPING = 'textarea, select, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file])';
export function refresh(id) {
  if (!visible() || (id && curId() !== id)) return;
  if (editing() || pressing()) { pendingRefresh = true; return; }
  pendingRefresh = false; render();
}
/* 칸을 고친 change는 Tab·다른 칸·단추 누르기로 떠날 때 나고, 그때는 아직 옮겨 간 칸에 초점이 없음:
   초점이 옮겨 간 뒤에 보아, 칸에 쓰는 중이면 그 칸을 떠날 때까지, 단추를 누르는 중이면 뗄 때까지 다시 그리지 않음(옮겨 간 칸·한글 조합·누른 단추를 지킴) */
export const later = id => setTimeout(() => refresh(id), 0);

const reach = t => (!t || !t.key.items.length ? 1 : !t.students.length ? 2 : graded(t).length ? 4 : 3);
export function openTest(id, step) {
  const t = getTest(id);
  if (!t) return;
  U.view = 'test'; U.id = id; U.draft = null;
  U.step = step || (t.done ? 4 : Math.min(3, reach(t)));
  if (U.msg.id !== id) U.msg = { id, key: '', paper: '' };
  render();
}
export const goStep = n => { U.step = n; render(); };

/* ---------- 그리기 ---------- */
/* AI 채점 정확도 글 (이 기능 전에 저장한 요약엔 acc가 없어 「기록 없음」) */
const accOf = s => accuracyText(s.acc || null, { finished: s.done, graded: s.n > 0 });
function listHTML() {
  const list = listTests(), year = yearText(yearAccuracy(list));
  const cards = list.map(s => `<li class="yp-card un-card" data-un-open="${esc(s.id)}">
    <b class="un-c-t">${esc(s.title)}</b>
    <span class="muted">${esc(s.date)} · 학생 ${s.n}명${s.avg != null ? ` · 반 평균 ${s.avg}점` : ''}</span>${accOf(s) ? `<span class="muted un-c-acc">${esc(accOf(s))}</span>` : ''}
    <span class="chip${s.done ? ' ok' : ''}">${s.done ? '마침' : '채점 중'}</span>
    <span class="grow"></span><button class="btn text" type="button" data-un="del" data-id="${esc(s.id)}">지우기</button></li>`).join('');
  return `<div class="row"><button class="btn primary" type="button" id="unNew">새 단원평가</button><button class="btn" type="button" data-un="sample">예시로 채우기</button>${list.some(s => s.sample) ? '<button class="btn text" type="button" data-un="sampleDel">예시 지우기</button>' : ''}</div>
    ${year ? `<p class="un-year" id="unYear">${esc(year)}</p>` : ''}
    ${list.length ? `<ul class="un-list">${cards}</ul>` : '<div class="yp-card"><p class="muted" style="margin:0">아직 단원평가가 없어요. [새 단원평가]로 학생 문제지(스캔한 것)와 답안을 넣어 주세요. 바로 보려면 [예시로 채우기].</p></div>'}`;
}
function metaHTML(m) {
  const f = (id, label, v, attrs = '') => `<label class="yp-f"><span class="lab">${label}</span><input class="field" id="${id}" value="${esc(v == null ? '' : v)}" ${attrs}></label>`;
  return `<div class="un-meta">
    ${f('unSubject', '교과', m.subject, 'list="unSubjects"')}<datalist id="unSubjects">${SUBJECTS.map(s => `<option value="${s}">`).join('')}</datalist>
    ${f('unGrade', '학년', m.grade, 'type="number" min="1" max="6"')}
    ${f('unUnitNo', '단원 번호', m.unitNo, 'type="number" min="1" max="20"')}
    ${f('unUnitName', '단원 이름', m.unitName)}
    ${f('unRound', '회차', m.round, 'type="number" min="1" max="9"')}
    ${f('unDate', '날짜', m.date, 'type="date"')}
  </div>`;
}
const sumHTML = items => { const total = keyTotal(items), zero = items.filter(i => !i.points).map(i => i.no); return `${items.length}문항 · ${total}점${items.length && total !== 100 ? ' <span class="un-warn">배점 합이 100점이 아니에요</span>' : ''}${zero.length ? ` <span class="un-warn">배점이 빈 문항: ${zero.join(', ')}번</span>` : ''}`; };
function keyTableHTML(t) {
  const items = t.key.items;
  const typeSel = it => `<select class="field" data-k="${it.no}-type" aria-label="${it.no}번 유형">${ITEM_TYPES.map(([k, l]) => `<option value="${k}"${k === it.type ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const inp = (it, f, attrs = '') => `<input class="field" data-k="${it.no}-${f}" value="${esc(it[f])}" aria-label="${it.no}번 ${f}" ${attrs}>`;
  const rows = items.map(it => `<tr><td class="no">${it.no}</td><td>${inp(it, 'content')}</td><td>${inp(it, 'domain')}</td><td>${typeSel(it)}</td>
    <td>${inp(it, 'answer')}</td><td>${inp(it, 'points', 'type="number" min="0" max="100"')}</td><td>${inp(it, 'criteria')}</td><td>${inp(it, 'pages')}</td>
    <td><button class="icon-btn" type="button" data-un="delItem" data-no="${it.no}" aria-label="${it.no}번 빼기">✕</button></td></tr>`).join('');
  return `<div class="yp-card">
    <div class="un-sum">${sumHTML(items)}</div>
    ${items.length ? `<div class="un-key-wrap"><table class="un-key"><thead><tr><th>번호</th><th>평가 내용</th><th>영역</th><th>유형</th><th>정답</th><th>배점</th><th>채점 기준</th><th>교과서 쪽</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">답안을 넣으면 문항이 여기에 나와요. 직접 더해도 돼요.</p>'}
    <div class="row"><button class="btn" type="button" data-un="addItem">문항 더하기</button></div>
  </div>`;
}
/* 1단계: [학생 문제지 넣기(스캔한 것)] → [답안 넣기] 차례, 줄마다 알림. 빈 문제지는 접어 둔 작은 칸(학생 문제지와 헷갈리지 않게) */
/* 「빈 문제지도 있으면」을 펼쳤는지, 평가 id마다(이 화면에만): 선생님이 접고 편 대로, 빈 문제지를 넣은 바로 뒤에만 펼침 */
const moreOpen = new Map();
const openMore = id => moreOpen.set(id, true);
function keyHTML(t) {
  const m = U.msg.id === t.id ? U.msg : { key: '', paper: '' }, hasPaper = !!(t.paper && t.paper.text);
  return `<div class="yp-card">
      <h3>학생 문제지·답안</h3>
      <p class="muted cls-note">학생이 푼 문제지를 반 전체 스캔(PDF·사진)으로 넣고, 선생님 답안(정답·이원 분류표)을 넣어요. 「문항 이원 분류 및 모범 답안」 한글 파일은 AI 없이 바로 읽고, 사진이나 스캔 PDF는 AI가 읽어요.</p>
      ${papers ? papers.html(t) : ''}
      <div class="row"><button class="btn primary" type="button" data-un="keyFile">답안 넣기</button><span class="muted" id="unKeyMsg" role="status">${esc(m.key)}</span></div>
      <input type="file" id="unKeyFile" accept=".hwp,.hwpx,.pdf,.txt,.png,.jpg,.jpeg,.webp" hidden>
      ${bundleBoxHTML('unit', '학생 문제지 스캔·답안·빈 문제지를 한꺼번에 넣으면 알아서 나눠요')}
      <details class="un-more" data-more="${esc(t.id)}"${moreOpen.get(t.id) ? ' open' : ''}><summary>빈 문제지도 있으면 (선택)${hasPaper ? ' · 넣었어요' : ''}</summary>
        <p class="muted cls-note">학생이 풀기 전의 빈 문제지(한글·PDF)를 넣으면 채점 AI가 문제를 보고 채점해요. 없어도 돼요.</p>
        <div class="row"><button class="btn" type="button" data-un="paperFile">빈 문제지 넣기</button><span class="muted" id="unPaperMsg" role="status">${esc(m.paper)}</span></div>
        <input type="file" id="unPaperFile" accept=".hwp,.hwpx,.pdf,.txt" hidden>
      </details>
    </div>
    <div class="yp-card"><h3>평가 정보</h3>${metaHTML(t.meta)}${linkHTML(t.link || null, t.meta.subject, 'data-un')}</div>
    ${keyTableHTML(t)}
    <div class="row un-next"><button class="btn primary" type="button" data-un="next"${t.key.items.length ? '' : ' disabled'}>다음: 나누기·이름 가리기</button></div>`;
}
function testHTML(t) {
  const body = U.step === 1 ? keyHTML(t) : stepViews[U.step] ? stepViews[U.step].html(t) : '<div class="yp-card"><p class="muted" style="margin:0">준비 중이에요.</p></div>';
  return `<div class="un-top"><button class="btn text" type="button" data-un="back">‹ 목록</button><b class="un-title">${esc(makeTitle(t.meta))}</b></div>
    ${stepsHTML(STEPS, U.step, reach(t))}<div class="un-body">${body}</div>`;
}
/* 그리는 중에 지워지는 입력 칸의 blur→change가 다시 그리기를 부르면, 끝난 뒤 한 번 더 그림 */
let rendering = false, again = false;
export function render() {
  if (!box) return;
  pendingRefresh = false;
  if (rendering) { again = true; return; }
  rendering = true;
  try { draw(); } finally { rendering = false; }
  if (again) { again = false; render(); }
}
function draw() {
  const t = U.view === 'test' ? cur() : null;
  if (U.view === 'test' && !t) U.view = 'list';
  const head = `<div class="m-head"><h2>단원평가</h2><p class="muted">학생 문제지(스캔한 것)와 답안을 넣으면 문항마다 채점하고, 학생에게 줄 피드백을 만들어요. 결과는 쌓아 두고 모아 봐요.</p></div>`;
  const seg = `<div class="seg un-seg" role="group" aria-label="단원평가 보기"><button type="button" data-unv="list" aria-pressed="${U.view !== 'results'}">평가 목록</button><button type="button" data-unv="results" aria-pressed="${U.view === 'results'}">결과 모아 보기</button></div>`;
  let inner;
  if (U.view === 'test') inner = testHTML(t);
  else if (U.view === 'results') inner = head + seg + (resultsView ? resultsView.html() : '');
  else inner = head + seg + listHTML();
  box.innerHTML = `<div class="m-page un-page">${inner}</div>`;
  if (U.view === 'test' && stepViews[U.step] && stepViews[U.step].bind) stepViews[U.step].bind(box, t);
  if (U.view === 'results' && resultsView && resultsView.bind) resultsView.bind(box);
}

/* ---------- 1단계: 학생 문제지·답안 ---------- */
const setMsg = (id, k, text) => { if (U.msg.id !== id) U.msg = { id, key: '', paper: '' }; U.msg[k] = text; const el = box && box.querySelector(k === 'key' ? '#unKeyMsg' : '#unPaperMsg'); if (el && curId() === id) el.textContent = text; };
/* 파일을 읽는 동안 다른 평가로 가도, 결과는 시작한 평가에 넣음 */
const testOf = (id, t0) => (curId() === id ? cur() : getTest(id) || null) || (U.draft === t0 || drafts.has(t0) ? t0 : null);
const fill = (meta, from, keys) => { for (const k of keys) if ((meta[k] == null || meta[k] === '') && from[k] != null && from[k] !== '') meta[k] = from[k]; };
const isImage = f => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name || '');
const isPdf = f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '');
const maskNow = t => (maskOf(t) || {}).mask || [];
/* 답안 한글 파일은 합친 칸을 풀어 읽음(칸 자리를 지킴). 안 되면 보통 글 읽기(오류 안내도 그쪽에서) */
async function readKeyText(file) {
  if (/\.hwpx?$/i.test(file.name || '') && SS().files && SS().files.readHwpGridText) {
    try { return String(await SS().files.readHwpGridText(new Uint8Array(await file.arrayBuffer()))).replace(/\r\n?/g, '\n').trim(); } catch (e) { /* 아래로 */ }
  }
  return readText(file, { columns: true });
}

/* [답안 넣기]에 넣은 그림이 답안인지 학생 문제지인지 근거가 없을 때 물음(keyFileGoes 'ask') → 'key' | 'papers' | null(창을 닫음) */
function askKeyKind(file, pages) {
  return new Promise(resolve => {
    let v = null;
    SS().openSheet(`<div id="unKindAsk"><h3>이 ${isImage(file) ? '사진' : '파일'}은 답안(정답)인가요, 학생 문제지인가요?</h3>
      <p class="muted" style="margin:0">「${esc(file.name)}」 ${pages.length}쪽이에요. 학생 문제지면 이름 칸을 가린 뒤 채점해요.</p>
      <div class="un-ask-pg">${pages.slice(0, 2).map(p => `<img src="${esc(p.thumb || p.url)}" alt="">`).join('')}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="unKindKey">답안이에요</button><button class="btn primary" type="button" id="unKindPapers">학생 문제지예요</button></div></div>`, sh => {
      sh.querySelector('#unKindKey').addEventListener('click', () => { v = 'key'; SS().closeSheet(); });
      sh.querySelector('#unKindPapers').addEventListener('click', () => { v = 'papers'; SS().closeSheet(); });
    });
    const root = document.getElementById('sheetRoot');
    if (!root || !root.querySelector('#unKindAsk')) { resolve(null); return; }
    const obs = new MutationObserver(() => { if (!root.querySelector('#unKindAsk')) { obs.disconnect(); resolve(v); } });
    obs.observe(root, { childList: true, subtree: true });
  });
}
/* [답안 넣기]: 정답표 글은 AI 없이, 아니면 AI가 읽음. 이름대로 — 정답표로 읽히지 않는 PDF·사진은 한꺼번에 넣기처럼 쪽을 나눠 보고(keyFileGoes)
   학생 문제지면 학생 문제지로 옮겨 넣고 알림, 정답 쪽과 학생 쪽이 섞였으면 나눠 넣음, 어느 쪽인지 근거가 없는 그림(사진·PDF 한두 쪽)은 물어봄.
   파일 이름이 정답·교사용이면 그대로 답안. 나눠 볼 때는 파일 이름 말고 쪽 글·AI로 봄(「…답안-예시.pdf」의 「예시」를 정답 표시로 읽지 않게) */
async function loadKey(file, t0 = cur()) {
  const id = t0.id;
  setMsg(id, 'key', `「${file.name}」 읽는 중…`);
  let k = null, text = '', images;
  if (!isImage(file)) {
    try { text = await readKeyText(file); }
    catch (e) { if (!(e && e.code === 'PDF_NO_TEXT')) { setMsg(id, 'key', fileMessage(e && e.code)); return; } }
    if (text) k = parseKey(text);
  }
  if (!k && (isPdf(file) || isImage(file)) && !keyName(file.name) && papers) {
    let b;
    const scan = isPdf(file) ? 'scan.pdf' : 'scan' + ((/\.[a-z0-9]+$/i.exec(file.name || '') || ['.png'])[0]);
    try { b = await readBundle([new File([file], scan, { type: file.type || (isPdf(file) ? 'application/pdf' : '') })], { say: m => setMsg(id, 'key', m.replace(scan, file.name)), mask: maskNow(t0) }); }
    catch (e) { setMsg(id, 'key', e && e.message === 'PDFJS' ? PDFJS : '파일을 읽지 못했어요.'); return; }
    let go = keyFileGoes({ name: file.name, text, b });
    const asked = go === 'ask';
    if (asked) {
      setMsg(id, 'key', '');
      go = await askKeyKind(file, b.pages);
      if (!go) { SS().files.freePages(b.pages); return; }
    }
    if (go === 'papers') {
      setMsg(id, 'key', asked ? `「${file.name}」 파일을 학생 문제지로 넣었어요` : `「${file.name}」 파일은 학생 문제지로 보여서 학생 문제지로 넣었어요`);
      papers.note(id, '');
      await papers.putPages(b.pages, t0);
      return;
    }
    if (go === 'both') {
      setMsg(id, 'key', `「${file.name}」에 학생 문제지도 들어 있어 나눠 넣어요`);
      b.doc.names = [file.name];
      if (!(await placeBundle(id, t0, b))) setMsg(id, 'key', '');
      return;
    }
    try { if (!text && b.pages.length && ai.ready()) images = await Promise.all(b.pages.map(p => SS().files.pageImage(p, null))); }
    catch (e) { images = undefined; }
    finally { SS().files.freePages(b.pages); }
  }
  if (!k) {
    if (!ai.ready()) { setMsg(id, 'key', `이 답안은 AI가 읽어야 해요. ${AI_KEY}`); return; }
    setMsg(id, 'key', 'AI가 답안을 읽는 중…');
    try {
      if (!text && !images) images = await SS().files.toImages(file);
      k = normKeyAI(await ai.generateJSON(keyPrompt(text), { images: text ? undefined : images, valid: v => !!normKeyAI(v) }));
    } catch (e) {
      setMsg(id, 'key', e && e.code === 'bad_json' ? 'AI가 답안을 읽지 못했어요. 다시 해 보거나 문항을 직접 넣어 주세요.' : ai.errorMessage(e && e.code, e));
      return;
    }
  }
  useKey(id, t0, k, text, file.name);
}
/* 읽은 답안을 평가에 넣음([답안 넣기]·한꺼번에 넣기). 받아 둔 학생 문제지가 있으면 이제 학생별로 나눔 */
function useKey(id, t0, k, text, name) {
  const t = testOf(id, t0);
  if (!t) return;
  t.key = { domains: k.domains, items: k.items };
  // 이미 채점한 평가에 답안을 다시 넣으면 읽은 답으로 다시 맞춤
  for (const it of t.key.items) rescoreItem(t, it.no, 'answer');
  fill(t.meta, k.meta, ['subject', 'grade', 'term', 'unitNo', 'round']);
  // 문제지와 정답이 한 파일이면 문제 부분은 빈 문제지로 (정답 앞까지만 — 정답이 채점 AI에 가지 않게)
  const sp = text ? splitCombined(text) : { paper: '' };
  const withPaper = !!(sp.paper && !(t.paper && t.paper.text));
  if (withPaper) { t.paper = { text: sp.paper.slice(0, 12000) }; fill(t.meta, parsePaper(sp.paper).meta, ['subject', 'grade', 'term', 'unitNo', 'unitName', 'round']); }
  U.msg = { ...U.msg, id, key: `「${name}」에서 ${k.items.length}문항을 읽었어요${withPaper ? '. 문제 부분은 빈 문제지로 넣었어요' : ''}${k.pointsGuessed ? '. 배점이 없어 100점을 문항 수로 나눠 넣었어요(고칠 수 있어요)' : ''}` };
  if (withPaper) { U.msg.paper = `「${name}」 · ${Object.keys(parsePaper(sp.paper).questions).length}문항`; openMore(id); }
  const made = !getTest(id);
  commit(t);
  if (made && curId() !== id && getTest(id)) { toast(`「${name}」에서 답안을 읽어 새 단원평가를 만들었어요`, 6000); if (visible() && U.view === 'list') render(); }
  if (papers && getTest(id)) papers.keyArrived(id);
  refresh(id);
}
async function loadPaper(file, t0 = cur()) {
  const id = t0.id;
  openMore(id); // 읽는 중·못 읽었다는 알림이 접힌 칸에 숨지 않게
  setMsg(id, 'paper', `「${file.name}」 읽는 중…`);
  let text;
  try { text = await readText(file, { columns: true }); } catch (e) { setMsg(id, 'paper', fileMessage(e && e.code)); return; }
  text = splitCombined(text).paper || text; // 정답이 붙은 문제지면 정답 앞까지만
  usePaper(id, t0, text, file.name);
}
function usePaper(id, t0, text, name) {
  const p = parsePaper(text), t = testOf(id, t0);
  if (!t) return;
  t.paper = { text: text.slice(0, 12000) };
  fill(t.meta, p.meta, ['subject', 'grade', 'term', 'unitNo', 'unitName', 'round']);
  U.msg = { ...U.msg, id, paper: `「${name}」 · ${Object.keys(p.questions).length}문항` };
  openMore(id);
  commit(t);
  refresh(id);
}

/* ---------- 한꺼번에 넣기 (학생 문제지 스캔·답안·빈 문제지) ---------- */
async function putBundle(files) {
  const t0 = cur(), id = t0.id;
  setMsg(id, 'key', '읽는 중…');
  let b;
  try { b = await readBundle(files, { say: m => setMsg(id, 'key', m), mask: maskNow(t0) }); }
  catch (e) { setMsg(id, 'key', e && e.message === 'PDFJS' ? PDFJS : '파일을 읽지 못했어요.'); return; }
  setMsg(id, 'key', '');
  await placeBundle(id, t0, b);
}
/* 나눈 것(b)을 넣음(한꺼번에 넣기, [답안 넣기]에 섞여 들어온 PDF): 학생 쪽 → 학생 문제지(답안 전이면 받아 두었다가 답안을 읽으면 나눔),
   답안 글·정답·교사용 쪽 → 답안, 문제 글 → 빈 문제지. 어디에 넣을지는 bundleParts(빈 문제지 쪽은 답안으로 읽지 않음). 카드에서 취소하면 false */
async function placeBundle(id, t0, b) {
  if (needsCard(b)) { const r = await openBundleCard(b, { what: '단원평가' }); if (!r) { SS().files.freePages(b.pages); return false; } b = r; }
  const name = (b.doc.names && b.doc.names[0]) || '한꺼번에 넣은 파일';
  const { keyText, paperText, keyPages, blankPages, stuPages } = bundleParts(b);
  if (stuPages.length && papers) { papers.note(id, ''); await papers.putPages(stuPages, t0); }
  if (keyText || keyPages.length) {
    let k = keyText ? parseKey(keyText) : null;
    if (!k && ai.ready()) {
      setMsg(id, 'key', 'AI가 답안을 읽는 중…');
      try {
        const images = keyText ? undefined : await Promise.all(keyPages.slice(0, 4).map(p => SS().files.pageImage(p, null)));
        k = normKeyAI(await ai.generateJSON(keyPrompt(keyText || ''), { images, valid: v => !!normKeyAI(v) }));
      } catch (e) { k = null; }
    }
    if (k) useKey(id, t0, k, '', name); else setMsg(id, 'key', '답안을 읽지 못했어요. [답안 넣기]로 다시 넣거나 문항을 직접 넣어 주세요.');
  } else if (blankPages.length && !((testOf(id, t0) || t0).key.items.length)) setMsg(id, 'key', '빈 문제지 쪽은 있는데 답안은 없었어요. [답안 넣기]로 답안(정답·이원 분류표)을 넣어 주세요.');
  SS().files.freePages([...keyPages, ...blankPages]);
  if (paperText) usePaper(id, t0, paperText, name);
  const t = testOf(id, t0);
  if (stuPages.length && t && t.key.items.length && curId() === id) goStep(2);
  return true;
}
onBundle('unit', files => { if (visible() && U.view === 'test' && U.step === 1) putBundle(files); });

/* [학생 문제지 넣기(스캔한 것)]: PDF·사진은 학생 문제지로. 한글·글 파일(답안·빈 문제지)과 이름이 정답·교사용인 파일은
   이름대로 맞는 곳에 옮겨 넣고 학생 문제지 줄에 알림(paperFileGoes) */
async function putPaperFiles(files) {
  const t0 = cur(), id = t0.id, scans = [], moved = [];
  if (!papers) return;
  papers.note(id, '');
  for (const f of files) {
    let text = '';
    if (isDocFile(f)) { try { text = await readKeyText(f); } catch (e) { text = ''; } }
    const go = paperFileGoes({ name: f.name, type: f.type, text });
    if (go === 'scan') { scans.push(f); continue; }
    if (go === 'named') { moved.push(`「${f.name}」 파일은 학생 이름이 적힌 글이라 넣지 않았어요. 학생 문제지는 스캔한 PDF·사진으로 넣어 주세요`); papers.note(id, moved.join(' · ')); continue; }
    const where = go === 'key' ? '답안' : '빈 문제지', ro = go === 'key' ? '으로' : '로';
    moved.push(`「${f.name}」 파일은 ${where}${ro} 보여서 ${where}${ro} 넣었어요`);
    papers.note(id, moved.join(' · '));
    if (go === 'key') await loadKey(f, t0); else await loadPaper(f, t0);
  }
  if (scans.length) await papers.put(scans, t0);
}
const META_IDS = { unSubject: ['subject', 's'], unGrade: ['grade', 'n'], unUnitNo: ['unitNo', 'n'], unUnitName: ['unitName', 's'], unRound: ['round', 'n'], unDate: ['date', 's'] };
function editMeta(el) {
  const [k, kind] = META_IDS[el.id], t = cur();
  const v = el.value.trim();
  t.meta[k] = kind === 'n' ? (v === '' ? null : Number(v)) : v;
  commit(t);
  // 제목만 바로 바꾸고, 다시 그리기는 옮겨 간 칸을 떠날 때까지 미룸(later)
  const ti = box.querySelector('.un-title'); if (ti) ti.textContent = makeTitle(t.meta);
  later(t.id);
}
function editItem(el) {
  const [no, f] = el.dataset.k.split('-'), t = cur();
  const it = t.key.items.find(i => i.no === Number(no));
  if (!it) return;
  const prev = it[f];
  it[f] = f === 'points' ? Math.max(0, Number(el.value) || 0) : el.value.trim();
  // 정답·유형·배점·채점 기준을 고치면 채점한 칸을 다시 맞춤 (배점은 고치기 전 배점에서 같은 비율로)
  if (['answer', 'type', 'points', 'criteria'].includes(f)) rescoreItem(t, it.no, f, prev);
  commit(t);
  const sum = box.querySelector('.un-sum'); if (sum) sum.innerHTML = sumHTML(t.key.items);
  later(t.id);
}

/* ---------- 손잡이 ---------- */
function askDelete(id) {
  const s = listTests().find(x => x.id === id);
  if (!s || !SS().openSheet) return;
  SS().openSheet(`<h3>「${esc(s.title)}」 지우기</h3><p class="muted" style="margin:0">채점 결과와 피드백이 모두 지워져요. 되돌릴 수 없어요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="unDelOk">지우기</button></div>`,
  sh => sh.querySelector('#unDelOk').addEventListener('click', () => { removeTest(id); SS().closeSheet(); toast('지웠어요'); render(); }));
}
function fillSample() {
  let ok = true;
  for (const t of sampleTests()) ok = saveOrWarn(t) && ok;
  if (ok) toast('예시 평가 2개를 넣었어요');
  render();
}
document.addEventListener('click', e => {
  if (!visible() || !box.contains(e.target)) return;
  const v = e.target.closest('[data-unv]');
  if (v) { U.view = v.dataset.unv; render(); return; }
  if (e.target.closest('#unNew')) { openNew(); return; }
  const st = e.target.closest('[data-step]');
  if (st && U.view === 'test') { goStep(Number(st.dataset.step)); return; }
  const b = e.target.closest('[data-un]');
  const a = b && b.dataset.un;
  if (a === 'del') { askDelete(b.dataset.id); return; }
  if (a === 'sample') { fillSample(); return; }
  if (a === 'sampleDel') { listTests().filter(s => s.sample).forEach(s => removeTest(s.id)); toast('예시 평가를 지웠어요'); render(); return; }
  if (a === 'back') { U.view = 'list'; U.id = null; U.draft = null; render(); return; }
  if (!a) { const o = e.target.closest('[data-un-open]'); if (o) openTest(o.dataset.unOpen); return; }
  if (!inStep(1)) return;
  const t = cur();
  if (a === 'keyFile') box.querySelector('#unKeyFile').click();
  else if (a === 'ansFile') box.querySelector('#unAnsFile').click();
  else if (a === 'paperFile') box.querySelector('#unPaperFile').click();
  else if (a === 'addItem') {
    const no = Math.max(0, ...t.key.items.map(i => i.no)) + 1;
    t.key.items.push({ no, content: '', domain: '', type: 'short', answer: '', points: 0, criteria: '', pages: '' });
    commit(t); render();
  } else if (a === 'delItem') {
    // 그 문항의 채점 칸도 지움 (같은 번호로 다시 더하면 지난 점수가 새 배점을 넘지 않게)
    const no = Number(b.dataset.no);
    t.key.items = t.key.items.filter(i => i.no !== no);
    for (const st of t.students) if (st.items) delete st.items[no];
    commit(t); render();
  } else if (a === 'next') goStep(2);
  else if (a === 'linkEdit') openLinkSheet({ subject: t.meta.subject, link: t.link, save: l => { const t2 = cur(); t2.link = l; commit(t2); render(); } });
});
document.addEventListener('change', e => {
  if (!inStep(1) || !box.contains(e.target)) return;
  const el = e.target;
  if (el.id === 'unKeyFile' && el.files[0]) { const f = el.files[0]; el.value = ''; loadKey(f); }
  else if (el.id === 'unAnsFile' && el.files.length) { const fs = [...el.files]; el.value = ''; putPaperFiles(fs); }
  else if (el.id === 'unPaperFile' && el.files[0]) { const f = el.files[0]; el.value = ''; loadPaper(f); }
  else if (el.dataset.un === 'link') {
    const t = cur();
    if (!el.checked) { t.link = null; commit(t); render(); }
    else openLinkSheet({ subject: t.meta.subject, link: t.link, save: l => { const t2 = cur(); t2.link = l; commit(t2); render(); }, cancel: () => render() });
  }
  else if (META_IDS[el.id]) editMeta(el);
  else if (el.dataset.k) editItem(el);
});

/* 떠 있는 버튼: 답안(합본 포함)은 새 단원평가로, 빈 문제지는 답안은 있고 빈 문제지가 없는 최근 단원평가에(없으면 새로) */
/* 문제지와 교과(·단원)가 같은 것. 문제지의 교과를 모를 때만 최근 것 — 다른 교과 평가에 붙이지 않음(그 문제지 글이 채점 AI로 감) */
function paperless(text) {
  const m = parsePaper(splitCombined(text || '').paper || text || '').meta;
  const list = listTests().map(s => getTest(s.id)).filter(t => t && t.key.items.length && !(t.paper && t.paper.text));
  if (!m.subject) return list[0] || null;
  return list.find(t => t.meta.subject === m.subject && (!m.unitNo || !t.meta.unitNo || t.meta.unitNo === m.unitNo)) || null;
}
function openNew() {
  const t = newTest();
  drafts.add(t);
  U.view = 'test'; U.id = null; U.draft = t; U.step = 1; U.msg = { id: t.id, key: '', paper: '' };
  render();
}
registerInbox('unit-key', {
  act: files => (files.length > 1 ? `새 단원평가 ${files.length}개를 만들어 답안으로 넣기` : '새 단원평가를 만들어 답안으로 넣기'),
  async run(files) {
    go('evaluate', 'unit');
    for (const f of files) { openNew(); await loadKey(f); }
  }
});
registerInbox('unit-paper', {
  one: true,
  act: (files, ctx) => {
    if (files.length > 1) return `빈 문제지 ${files.length}개를 하나씩 교과·단원이 맞는 단원평가(없으면 새 단원평가)에 넣기`;
    const t = paperless(ctx.texts.get(files[0])); return t ? `「${makeTitle(t.meta)}」의 빈 문제지로 넣기` : '새 단원평가를 만들어 빈 문제지로 넣기';
  },
  async run(files, v, opts) {
    go('evaluate', 'unit');
    const t = paperless(opts.texts.get(files[0]));
    if (t) openTest(t.id, 1); else openNew();
    await loadPaper(files[0]);
  }
});

/* 뗀 뒤(click이 난 뒤) 미뤄 둔 다시 그리기 */
const release = () => {
  const at = pressAt;
  if (!at) return;
  setTimeout(() => { if (pressAt === at) pressAt = 0; if (pendingRefresh && !editing() && !pressing()) { pendingRefresh = false; if (visible()) render(); } }, 0);
};
document.addEventListener('pointerup', release, true);
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.un-more[data-more]')) moreOpen.set(e.target.dataset.more, e.target.open); }, true);
document.addEventListener('pointercancel', release, true);

onEnter('evaluate', (tab, section) => {
  if (!box || !section.contains(box)) {
    box = document.createElement('div'); box.className = 'unit-box'; section.append(box);
    box.addEventListener('focusout', () => setTimeout(() => { if (pendingRefresh && !editing() && !pressing()) { pendingRefresh = false; if (visible()) render(); } }, 0));
    box.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest(TYPING))) pressAt = Date.now(); }, true);
  }
  curTab = tab;
  box.hidden = tab !== 'unit';
  if (tab === 'unit') render();
});
