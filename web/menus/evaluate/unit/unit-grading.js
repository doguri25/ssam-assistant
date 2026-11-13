/* 단원평가 학생 문제지(스캔한 것) 넣기(1단계 줄)·2단계(나누기·이름 가리기)·3단계(문항별 채점·확인 표) (스펙 2.2·3.2).
   스캔 쪽은 이 화면에만 두고 저장하지 않음. 채점은 시작한 평가 id를 붙들고, 결과는 그 평가를 다시 읽어 넣음 */
import { toast } from '../../../core/ui.js';
import * as ai from '../../../core/ai.js';
import { aiRowHTML, pick as pickAI, providerEnv } from '../../../core/ai-roles.js';
import { reviewJSON, gradeReviewParts, normGradeReview, gradeTargets, sameGrade, opinionHTML, reviewBar, REVIEW_FAIL } from '../../../core/ai-review.js';
import { runPool } from '../../../core/ai-pool.js';
import { newMeter, useText } from '../../../core/ai-wire.js';
import * as store from '../../../core/store.js';
import { ITEM_TYPES, autoJudge, gradeCell, mergeCells, needsCheck, studentTotal } from './unit-grade.js';
import { getTest, getSet, saveSet, numbersFor, parseNos, renumber, maskOf, listTests, reattachByNo, spreadSkipNos } from './unit-model.js';
import { registerInbox } from '../../../core/inbox.js';
import { go } from '../../../core/shell.js';
import { gradeParts, normGrade, validGrade } from './unit-ai.js';
import { locatePrompt, validLocate, normBoxes, cropRect, boxesOf } from './unit-locate.js';
import { unitAccuracy, accuracyText } from '../grade-accuracy.js';
import { arrangePages } from './unit-pages.js';
import { readNos, openNoCheck, openNoWait, rosterAllowed, byNoOrder } from '../../../core/student-no.js';
import { esc, SS, AI_KEY, registerStep, registerPapers, inStep, cur, curId, commit, saveOrWarn, refresh, later, render, goStep, getBox, openTest } from './unit.js';

const TYPE = Object.fromEntries(ITEM_TYPES);
/* 세션 상태: 넣은 스캔은 한 평가에만 붙음(raw: 넣은 장, pages: 모아찍기를 자르고 뒷면을 돌린 쪽). 채점은 한 번에 한 평가만(run: 그 평가의 차례·멈춤) */
// usedNow: 이 화면을 켠 뒤 채점한 평가(사용량 줄 앞에 「지난 채점」을 붙이지 않음), loading: 스캔을 읽어 나누는 중인 평가(다른 메뉴에 갔다 와도 「읽는 중」이 보이게)
// holds: 답안을 넣기 전에 받은 학생 문제지, 평가마다 { raw, skipped } (이 화면에만, 저장 안 함) — 그 평가를 보고 있을 때 답안이 들어오면 나눔,
// note: 다른 단추로 넣은 파일을 옮겨 넣었다는 알림 { id, text }
const G = { testId: null, raw: [], pages: [], idx: [], msg: '', running: new Map(), run: null, usedNow: new Set(), loading: null, holds: new Map(), note: null };
const pagesOf = (id, i) => (G.testId === id && G.idx[i]) || [];
const hasPages = id => G.testId === id && G.pages.length > 0;
const busy = id => !!G.run && G.run.id === id && (G.run.queue.length > 0 || G.running.size > 0);
const busyOther = id => !!G.run && G.run.id !== id && busy(G.run.id);

/* ---------- 학생 문제지 넣기(1단계 줄)·2단계 나누기 ---------- */
function split(t, pageCount, per) {
  const n = Math.ceil(pageCount / per);
  G.idx = Array.from({ length: n }, (_, i) => Array.from({ length: Math.min(per, pageCount - i * per) }, (_, j) => i * per + j));
  G.lay = layOf(per); // 이 쪽 모양(학생 한 명 쪽 수·모아찍기·뒷면)으로 찾은 문항 자리만 씀
  if (t.students.length === n) return; // 이미 나눈 학생에 차례대로 다시 붙임 (번호로 맞춘 평가는 번호를 다시 읽을 때 번호로 붙임)
  delete t.noOrdered;
  t.students = numbersFor(n, [...rosterExcept(), ...(t.absent || [])]).map(no => ({ no, skip: false, status: 'idle', items: {}, good: '', cheer: '' }));
}
const rosterExcept = () => (store.get('class', null) || {}).except || [];
const arrange = raw => { const s = getSet(); return arrangePages(raw, { twoUp: !!s.twoUp, flipBack: !!s.flipBack }); };
const pagesMsg = (raw, pages, n, skipped = 0) => `${raw === pages ? `${pages}쪽` : `스캔 ${raw}장 → ${pages}쪽`} · 학생 ${n}명${skipped ? ` · 읽지 못한 파일 ${skipped}개` : ''}`;
function freeScans() { SS().files.freePages(G.pages); SS().files.freePages(G.raw); G.pages = []; G.raw = []; }
const hasKey = t => !!(t && t.key && t.key.items.length);
/* 「적힌 번호로 학생 맞추기」: 평가마다(t.byNo, 활동지와 같게). 정하지 않은 평가는 번호로 맞춘 적이 있으면 켬, 아니면 지난번 설정 —
   다른 평가에서 끄면 번호로 맞춘 평가에 다시 올린 스캔(걷은 차례)을 번호를 읽지 않고 자리대로 붙여 다른 학생 답안으로 채점하던 것 */
const byNo = t => (t && t.byNo != null ? !!t.byNo : !!(t && t.noOrdered) || !!getSet().byNo);
const perNow = () => Math.max(1, getSet().pagesPer | 0);
// 학생 문제지 줄(#unAnsMsg) 글: 그 평가를 보고 있을 때만 바로 바꿈
const sayFor = id => m => { G.msg = m; const el = getBox() && getBox().querySelector('#unAnsMsg'); if (el && curId() === id) el.textContent = m; };
/* 이 평가의 학생 문제지 줄 글: 답안 전이라 받아 둔 것, 읽는 중·나눈 결과, (1단계만) 다른 단추로 넣은 파일을 옮긴 알림 */
const holdMsg = (t, h) => `학생 문제지 스캔 ${h.raw.length}장을 받았어요. ${hasKey(t) ? '2단계에서' : '답안을 넣으면'} 학생별로 나눠요${h.skipped.length ? ` · 읽지 못한 파일 ${h.skipped.length}개` : ''}`;
const ansMsg = (t, note = true) => [G.holds.has(t.id) ? holdMsg(t, G.holds.get(t.id)) : G.testId === t.id || G.loading === t.id ? G.msg : '', note && G.note && G.note.id === t.id ? G.note.text : ''].filter(Boolean).join(' · ');
async function loadAnswers(fileList, t0 = cur()) {
  const id = t0.id, per = perNow(), say = sayFor(id), before = G.msg;
  // 채점하는 동안 스캔을 바꾸면 채점 중인 학생에게 다른 쪽이 붙음: 끝나거나 멈춘 뒤에
  if (busyOther(id)) { say('다른 평가를 채점하는 중이에요. 그 채점이 끝나거나 멈춘 뒤에 넣어 주세요.'); return false; }
  if (busy(id)) { say('채점하는 중이에요. 끝나거나 멈춘 뒤에 다시 넣어 주세요.'); return false; }
  if (G.loading) { toast('학생 문제지를 읽는 중이에요. 다 읽은 뒤에 다시 넣어 주세요.', 5000); return false; }
  G.loading = id;
  try {
    let r;
    try { r = await SS().files.readPages(fileList, say); }
    catch (e) { say(e && e.message === 'PDFJS' ? 'PDF를 읽는 도구를 불러오지 못했어요. 인터넷 연결을 확인하거나 사진으로 넣어 주세요.' : '파일을 읽지 못했어요.'); return false; }
    if (!r.pages.length) { say('읽을 수 있는 PDF·사진이 없어요.'); return false; }
    return await place(t0, id, per, r, say, before);
  } finally { G.loading = null; }
}
/* 이미 읽은 쪽(한꺼번에 넣기·[답안 넣기]에서 학생 쪽으로 나눈 것)을 학생 문제지로 */
export async function loadAnswerPages(raw, t0 = cur()) {
  const id = t0.id, say = sayFor(id);
  if (busyOther(id) || busy(id)) { say('채점하는 중이에요. 끝나거나 멈춘 뒤에 다시 넣어 주세요.'); SS().files.freePages(raw); return false; }
  return place(t0, id, perNow(), { pages: raw, skipped: [] }, say, G.msg);
}
const MAX_HOLDS = 3;
function dropHold(id) { const h = G.holds.get(id); if (h) SS().files.freePages(h.raw); G.holds.delete(id); }
export const heldCount = () => G.holds.size; // 시험용
/* 답안을 넣기 전이면 학생 문제지를 이 화면에 받아 두고 답안이 들어오면 나눔(keyArrived). 답안이 있으면 바로 학생별로 나눔.
   받아 둔 것은 평가마다 따로(다른 평가에 넣어도 버리지 않음), 같은 평가에 다시 넣으면 새것으로 바꿈 */
async function place(t0, id, per, r, say, before) {
  if (hasKey(getTest(id) || t0)) return placeRaw(t0, id, per, r, say, before);
  const old = G.holds.get(id);
  if (old && old.raw !== r.pages) SS().files.freePages(old.raw);
  G.holds.delete(id); // 맨 뒤(가장 최근)로
  G.holds.set(id, { raw: r.pages, skipped: r.skipped || [] });
  // 받아 둔 것은 최근 MAX_HOLDS개 평가까지만(버려진 새 평가 초안의 스캔이 앱을 끌 때까지 남지 않게) — 오래된 것부터 비움
  for (const k of G.holds.keys()) { if (G.holds.size <= MAX_HOLDS) break; if (k !== id) dropHold(k); }
  if (G.testId !== id) G.msg = before; // 다른 평가에 붙은 스캔의 줄 글은 그대로
  refresh(id);
  return true;
}
/* 답안이 들어오면 받아 둔 학생 문제지를 학생별로 나눔(1단계 답안·한꺼번에 넣기, 2단계로 갈 때). 채점하는 중이면 끝난 뒤 2단계로 갈 때.
   그 평가를 보고 있지 않으면(답안을 읽는 동안 다른 평가로 감) 받아 둔 채로 두었다가 그 평가를 열 때(2단계) 나눔 — 지금 보는 평가의 스캔을 치우지 않게 */
function keyArrived(id) {
  const h = G.holds.get(id), t = getTest(id);
  if (!h || !hasKey(t) || busy(id) || busyOther(id) || curId() !== id) return;
  G.holds.delete(id);
  placeRaw(t, id, perNow(), { pages: h.raw, skipped: h.skipped }, sayFor(id));
}
async function placeRaw(t0, id, per, r, say, before = G.msg) {
  let pages;
  try { pages = await arrange(r.pages); }
  catch (e) { SS().files.freePages(r.pages); say('스캔을 나누지 못했어요. 다시 넣어 주세요.'); return false; }
  const t = getTest(id) || t0;
  const n = Math.ceil(pages.length / per);
  const apply = () => {
    if (G.testId) freeScans();
    G.testId = id; G.raw = r.pages; G.pages = pages; G.noMaskFor = null; // 새 스캔이면 이름 칸을 다시 물음
    split(t, pages.length, per);
    G.msg = pagesMsg(r.pages.length, pages.length, t.students.length, r.skipped.length);
    commit(t); refresh(id);
  };
  if (G.run && busy(G.run.id)) { say('채점하는 중이에요. 끝나거나 멈춘 뒤에 다시 넣어 주세요.'); return false; }
  if (t.students.length && t.students.length !== n && t.students.some(s => s.status === 'done')) {
    say(before); // 묻는 동안·[취소]한 뒤에 학생 문제지 줄이 「… 읽는 중」에 멈춰 있지 않게
    let ok = false;
    SS().openSheet(`<h3>학생 수가 달라요</h3><p class="muted" style="margin:0">채점한 학생은 ${t.students.length}명인데 새 스캔은 ${n}명이에요. 새로 나누면 채점한 결과가 지워져요.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="unRedoOk">새로 나누기</button></div>`,
    sh => sh.querySelector('#unRedoOk').addEventListener('click', () => { ok = true; t.students = []; SS().closeSheet(); apply(); }));
    // [취소]하면 새 스캔은 쓰지 않으니 버림
    const root = document.getElementById('sheetRoot');
    if (root) { const obs = new MutationObserver(() => { if (!root.querySelector('#unRedoOk')) { obs.disconnect(); if (!ok) SS().files.freePages([...new Set([...pages, ...r.pages])].filter(p => !G.pages.includes(p) && !G.raw.includes(p))); } }); obs.observe(root, { childList: true, subtree: true }); }
    return false; // 새로 나눌지 묻는 중: 넣은 곳(떠 있는 버튼)이 채점을 시작하지 않게
  }
  apply();
  return true;
}
function stuRow(t, s, i) {
  const pg = pagesOf(t.id, i), p0 = pg.length ? G.pages[pg[0]] : null;
  const chip = s.skip ? '<span class="chip">채점 안 함</span>' : s.status === 'done' ? '<span class="chip ok">채점함</span>' : s.status === 'error' ? '<span class="chip err">오류</span>' : '';
  return `<li class="un-stu" data-st="${s.no}">
    ${p0 ? `<img class="un-thumb" src="${p0.thumb || p0.url}" alt="${s.no}번 첫 쪽" loading="lazy">` : '<span class="un-thumb none" aria-hidden="true"></span>'}
    <label class="cls-inline">번호 <input class="field num" type="number" min="1" max="99" data-stno="${i}" value="${s.no}"></label>
    <span class="muted">${pg.length ? `${pg.length}쪽` : '스캔 없음'}</span>${chip}
    <span class="grow"></span><button class="btn text" type="button" data-un="skip" data-i="${i}">${s.skip ? '채점하기' : '채점 안 함'}</button></li>`;
}
/* [학생 문제지 넣기(스캔한 것)] 줄: 1단계(한글·글 파일을 고르면 답안·빈 문제지로 옮겨 넣음)와 2단계(다시 넣기) */
function ansRowHTML(t, step) {
  const again = step === 2 && (hasPages(t.id) || t.students.length > 0);
  return `<div class="row"><button class="btn primary" type="button" data-un="ansFile" data-drop-pick>${again ? '학생 문제지 다시 넣기' : '학생 문제지 넣기(스캔한 것)'}</button>
        <label class="cls-inline">학생 한 명 <input class="field num" type="number" id="unPagesPer" min="1" max="8" value="${getSet().pagesPer}"> 쪽</label>
        <span class="muted" id="unAnsMsg" role="status">${esc(ansMsg(t, step === 1))}</span></div>
      <input type="file" id="unAnsFile" accept="${step === 1 ? '.pdf,.png,.jpg,.jpeg,.webp,.hwp,.hwpx,.txt' : '.pdf,.png,.jpg,.jpeg,.webp'}" multiple hidden>`;
}
function step2HTML(t) {
  const set = getSet(), m = maskOf(t);
  const note = t.students.length && !hasPages(t.id) ? '<p class="banner warn" style="margin:8px 0 0">스캔 이미지는 저장하지 않아요. 다시 채점하려면 학생 문제지를 다시 넣어 주세요.</p>' : '';
  return `<div class="yp-card">
      <h3>나누기·이름 가리기</h3>
      <p class="muted cls-note">넣은 학생 문제지 스캔을 학생마다 나눠요. 학생마다 쪽 수가 같아야 차례대로 나눠져요. 번호는 학급 명단의 예외 번호와 결석 번호를 건너뛰어 매겨요.</p>
      ${ansRowHTML(t, 2)}
      <div class="row"><label class="switch"><input type="checkbox" id="unTwoUp"${set.twoUp ? ' checked' : ''}>모아찍기(한 면에 2쪽)</label>
        <label class="switch"><input type="checkbox" id="unFlipBack"${set.flipBack ? ' checked' : ''}>양면 스캔 뒷면이 거꾸로</label>
        <span class="muted">모아찍기면 가로로 긴 장을 왼쪽·오른쪽 쪽으로 나눠요. 학생 한 명 쪽 수는 나눈 뒤 쪽 수(문제지 쪽 수)로 적어 주세요.</span></div>
      <div class="row"><label class="switch"><input type="checkbox" id="unByNo"${byNo(t) ? ' checked' : ''}>적힌 번호로 학생 맞추기</label>
        ${byNo(t) ? `<button class="btn" type="button" data-un="noBox"${hasPages(t.id) ? '' : ' disabled'}>번호 칸 정하기</button>
        <span class="muted">${t.noBox ? '번호 칸을 정했어요. 채점 전에 번호를 읽어 확인해요.' : '학생이 번호를 쓰는 칸을 정해 주세요.'}</span>` : '<span class="muted">걷은 순서와 상관없이 첫 쪽에 쓴 번호를 읽어 학생을 맞춰요(AI는 번호 칸만 봐요).</span>'}</div>
      ${byNo(t) ? '' : `<div class="row"><label class="cls-inline">결석 번호 <input class="field" id="unAbsent" value="${esc((t.absent || []).join(', '))}" placeholder="예: 5, 12" aria-describedby="unAbsentNote"></label>
        <span class="muted" id="unAbsentNote">시험을 보지 않은 학생 번호를 적으면 뒤 번호가 한 칸씩 밀려요.</span></div>`}
      <div class="row"><label class="switch"><input type="checkbox" id="unMaskOn"${set.maskOn ? ' checked' : ''}>이름 칸을 가리고 보내기</label>
        <button class="btn" type="button" data-un="mask"${hasPages(t.id) ? '' : ' disabled'}>이름 칸 정하기</button>
        <span class="muted">${m && m.mask.length ? `가릴 곳 ${m.mask.length}개${m.all ? ' · 모든 쪽' : ' · 첫 쪽'}` : '가릴 곳을 아직 정하지 않았어요'}</span></div>
      ${note}${noStale(t) ? '<p class="banner warn" style="margin:8px 0 0">번호를 다시 읽기 전이라 아래 번호와 쪽이 맞지 않을 수 있어요. 채점을 시작하면 번호를 먼저 읽어 맞춰요.</p>' : ''}
    </div>
    ${t.students.length ? `<div class="yp-card"><h3>학생 ${t.students.filter(s => !s.skip).length}명</h3><ul class="un-stus">${t.students.map((s, i) => stuRow(t, s, i)).join('')}</ul></div>` : ''}
    <div class="row un-next"><button class="btn primary" type="button" data-un="toGrade"${t.students.length ? '' : ' disabled'}>다음: 채점</button></div>`;
}
/* 이름 칸은 평가지마다 자리가 달라 평가마다 따로 둠. 정하지 않은 평가는 지난 평가에서 정한 곳을 먼저 보여 줌 */
function openMask(t) {
  const set = getSet(), m = maskOf(t) || { mask: set.mask, all: set.maskAll };
  const shots = t.students.map((s, i) => ({ s, pg: pagesOf(t.id, i) })).filter(x => !x.s.skip && x.pg.length).map(x => ({ url: G.pages[x.pg[0]].url, label: `${x.s.no}번 첫 쪽` }));
  if (!shots.length || !SS().openMaskEditor) return;
  SS().openMaskEditor({ shots, mask: m.mask, all: m.all, what: '학생 문제지', save: (mask, all) => {
    const t2 = getTest(t.id) || t;
    t2.mask = mask; t2.maskAll = all; commit(t2);
    saveSet({ ...getSet(), mask, maskAll: all });
    render();
  } });
}

/* ---------- 적힌 번호로 학생 맞추기 ---------- */
/* 번호 칸은 평가지마다 자리가 달라 평가마다 따로 둠(지난 평가에서 정한 곳을 먼저 보여 줌) */
function openNoBox(t, then) {
  const set = getSet(), box = t.noBox || set.noBox;
  const shots = t.students.map((s, i) => ({ s, pg: pagesOf(t.id, i) })).filter(x => x.pg.length).map(x => ({ url: G.pages[x.pg[0]].url, label: `${x.s.no}번 첫 쪽` }));
  if (!shots.length || !SS().openMaskEditor) return;
  SS().openMaskEditor({ kind: 'no', shots, mask: box ? [box] : [], all: false, what: '학생 문제지', save: mask => {
    const t2 = getTest(t.id) || t;
    if (mask.length) { t2.noBox = mask[mask.length - 1]; saveSet({ ...getSet(), noBox: t2.noBox }); } else delete t2.noBox;
    commit(t2); render();
    if (then && t2.noBox) then();
  } });
}
/* 읽어 확인한 번호가 지금 스캔·학생 차례와 같은지 (스캔을 다시 올리거나 번호를 바꾸면 다시 읽음) */
const noSig = t => G.idx.map((p, i) => `${p[0]}-${t.students[i] ? t.students[i].no : ''}`).join(',');
const nosOk = t => !!G.noOk && G.noOk.pages === G.pages && G.noOk.sig === noSig(t);
// 번호로 맞춘 평가에 다시 올린 스캔은 걷은 차례라, 번호를 다시 읽기 전에는 학생(번호 차례)과 쪽이 맞지 않음
const noStale = t => byNo(t) && !!t.noOrdered && hasPages(t.id) && !nosOk(t);
const CHANGED = '번호를 읽는 동안 학생 문제지 스캔이 바뀌었어요. 채점 시작을 다시 눌러 주세요.';
const freshStudent = no => ({ no, skip: false, status: 'idle', items: {}, good: '', cheer: '' });
const hasResult = s => s.status === 'done' || Object.keys(s.items || {}).length > 0;
async function askNos(t, then) {
  if (!t.noBox) { toast('학생이 번호를 쓰는 칸을 먼저 정해 주세요.', 5000); openNoBox(t, () => askNos(getTest(t.id), then)); return; }
  if (G.noBusy) return;
  // 「채점 안 함」 학생은 번호를 묻지 않음 (빈 답안지 등). 단 번호로 맞춘 적이 있는 평가에 다시 올린 스캔은 걷은 순서라
  // 자리와 학생이 따로 놀아(「채점 안 함」 학생 자리에 다른 학생 쪽이 옴) 쪽이 있는 자리는 모두 읽음
  const id = t.id, list = t.students.map((s, i) => ({ i, pg: pagesOf(id, i) })).filter(x => x.pg.length && (t.noOrdered || !t.students[x.i].skip));
  if (!list.length) return;
  const set = getSet(), m = maskOf(t), pages0 = G.pages, idx0 = G.idx;
  const stale = () => G.testId !== id || G.pages !== pages0 || G.idx !== idx0;
  G.noBusy = true;
  const wait = openNoWait();
  let r;
  try { r = await readNos(list.map(x => G.pages[x.pg[0]]), { box: t.noBox, mask: set.maskOn && m ? m.mask : [], signal: wait.signal }); }
  catch (e) { if (wait.gone()) return; wait.close(); toast(e && e.code === 'NO_AI' ? AI_KEY : ai.errorMessage(e && e.code, e), 6000); return; }
  finally { G.noBusy = false; }
  if (wait.gone()) return; // 그만두기
  if (stale()) { wait.close(); if (G.testId === id) toast(CHANGED, 6000); return; }
  // 다시 올린 스캔(걷은 차례)은 「채점 안 함」 자리를 몰라 모두 읽음: 번호가 없는 빈 답안지 줄은 비워 두면 「채점 안 함」으로
  openNoCheck({ rows: list.map((x, k) => ({ crop: r.crops[k], ...r.nos[k] })), allowed: rosterAllowed(), blank: t.noOrdered ? '번호 없음 · 채점 안 함으로 둬요' : '', onOk: nos => {
    const t2 = getTest(id) || t;
    if (stale() || busy(id)) { toast(CHANGED, 6000); return; }
    // 번호 차례로 학생과 그 학생의 쪽을 함께 늘어놓음
    const order = byNoOrder(nos), inList = new Set(list.map(x => x.i));
    let head, tail, tailIdx;
    if (t2.noOrdered) {
      // 번호로 맞춘 적이 있는 평가에 다시 올린 스캔은 걷은 순서: 결과는 자리가 아니라 번호로 이어 붙임
      head = reattachByNo(t2.students, nos, order, freshStudent, hasResult);
      const used = new Set(head);
      // 이번에 읽히지 않은 학생 중 결과가 있거나(결석 등) 「채점 안 함」인 학생은 뒤에 남김
      const rest = t2.students.map((s, i) => ({ s, i })).filter(x => !used.has(x.s) && (x.s.skip || hasResult(x.s)));
      tail = rest.map(x => x.s); tailIdx = rest.map(x => (x.s.skip && !inList.has(x.i) && G.idx[x.i]) || []);
    } else {
      head = order.map(k => t2.students[list[k].i]);
      const rest = t2.students.map((s, i) => ({ s, i })).filter(x => !inList.has(x.i));
      tail = rest.map(x => x.s); tailIdx = rest.map(x => G.idx[x.i] || []);
    }
    t2.students = [...order.map((k, j) => ({ ...head[j], no: nos[k] ?? head[j].no })), ...tail];
    // 「채점 안 함」 자리가 스캔 차례 번호를 그대로 가져 읽은 번호와 겹치지 않게
    spreadSkipNos(t2.students, (store.get('class', null) || {}).count);
    G.idx = [...order.map(k => G.idx[list[k].i]), ...tailIdx];
    t2.noOrdered = true;
    commit(t2);
    G.noOk = { pages: G.pages, sig: noSig(t2) };
    refresh(id);
    then();
  } });
}

/* ---------- 3단계: 채점 ---------- */
async function imagesFor(id, i) {
  // 채점하는 동안 이름 칸이 지워져도 시작할 때 정해 둔 칸으로 가림(이름이 그대로 AI로 가지 않게)
  const now = maskOf(getTest(id)), run = G.run && G.run.id === id ? G.run : null;
  const set = getSet(), m = now && now.mask.length ? now : (run && run.mask) || now, out = [], pg = pagesOf(id, i);
  for (let j = 0; j < pg.length; j++) {
    const masked = set.maskOn && m && m.mask.length && (m.all || j === 0);
    out.push(await SS().files.pageImage(G.pages[pg[j]], masked ? m.mask : null));
  }
  return out;
}
/* 학생 한 명 채점. AI 한도면 실패로 두지 않고 'rate'(풀이 다시 줄에 넣고 쉬었다가 이어 감) */
async function gradeOne(id, i, meter) {
  const t0 = getTest(id), no = t0 && t0.students[i] && t0.students[i].no;
  if (no == null) return;
  const ctrl = new AbortController();
  G.running.set(i, ctrl); refresh(id);
  try {
    const images = await imagesFor(id, i);
    // 스캔이 없으면 AI를 부르지 않음 (이미지 없이 채점하면 0점이 그대로 저장됨)
    if (!images.length) throw { code: 'no_scan' };
    // 공통(지시·정답표·평가지 글)을 앞에 두어 학생마다 캐시 → 학생 그림 → 학생 줄
    const parts = gradeParts(t0, no);
    const v = await ai.generateJSON(parts.own, { shared: { text: parts.shared }, images, signal: ctrl.signal, valid: validGrade, task: 'grade', meter });
    const res = normGrade(v, t0.key.items);
    const t = getTest(id), st = t && t.students[i];
    if (!st || st.no !== no) return;
    st.items = mergeCells(st.items, Object.fromEntries(t.key.items.map(it => [it.no, gradeCell(it, res[it.no])])));
    st.status = 'done'; st.err = ''; delete st.rvErr;
    // 저장 공간이 꽉 차면 남은 학생은 부르지 않음 (AI를 불러도 결과를 버리게 되므로)
    if (!saveOrWarn(t) && G.run && G.run.id === id) { G.run.stop = true; G.run.queue = []; return; }
    refresh(id);
    await reviewOne(id, i, no, images, ctrl.signal, meter);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    if (e && e.code === 'rate_limited' && G.run && G.run.id === id && !G.run.stop) return e.retryAfter > 0 ? { rate: e.retryAfter * 1000 } : 'rate'; // AI가 알려 준 기다릴 시간(초)
    const t = getTest(id), st = t && t.students[i];
    const why = e && e.code === 'no_scan' ? '스캔이 없어요. 학생 문제지를 다시 넣어 주세요' : e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요' : ai.errorMessage(e && e.code, e);
    if (st && st.no === no) { st.status = 'error'; st.err = why; saveOrWarn(t); }
    // 키가 틀리거나 한도에 걸리면 남은 학생도 똑같이 실패하므로 멈추고 까닭을 한 번 알림
    if (e && ['auth', 'quota'].includes(e.code) && G.run && G.run.id === id && !G.run.stop) {
      G.run.stop = true; G.run.queue = [];
      toast(`채점을 멈췄어요. ${why} 남은 학생은 [채점 시작]으로 이어서 해요.`, 9000);
    }
  } finally { G.running.delete(i); refresh(id); }
}
/* 검토 AI: 확신 없는 칸·서술형 부분 점수만 같은 그림으로 다시 봄. 메인 결과는 그대로 두고 칸에 rv를 붙임.
   검토 AI가 키·한도·연결로 실패하면 「검토하지 못했어요」, 이 차례의 남은 학생은 검토하지 않음 */
const REVIEW_STOP = ['auth', 'quota', 'rate_limited', 'blocked', 'no_engine', 'bad_model', 'upstream_error', 'session_expired'];
async function reviewOne(id, i, no, images, signal, meter) {
  const run = G.run && G.run.id === id ? G.run : null;
  const t = getTest(id), st = t && t.students[i];
  if (!st || st.no !== no) return;
  const nos = gradeTargets(t, st);
  if (!nos.length) return;
  // 이 차례에 검토 AI가 막혔으면 부르지 않되, 검토할 칸이 있던 학생은 말없이 넘기지 않고 표시
  if (run && run.noReview) { st.rvErr = REVIEW_FAIL; saveOrWarn(t); return; }
  const parts = gradeReviewParts(t, no, nos);
  const v = await reviewJSON('grade', parts.own, { shared: { text: parts.shared }, images, signal, valid: validGrade, meter });
  if (v == null || signal.aborted) return;
  const t2 = getTest(id), s2 = t2 && t2.students[i];
  if (!s2 || s2.no !== no) return;
  if (v.error) {
    if (v.error === 'cancelled') return;
    s2.rvErr = REVIEW_FAIL;
    if (run && REVIEW_STOP.includes(v.error)) run.noReview = true;
  } else {
    const res = normGradeReview(v, nos);
    for (const n of nos) {
      const r = res[n], c = s2.items[n], it = t2.key.items.find(x => x.no === n);
      if (!r || !c || !it || c.manual) continue;
      const agree = sameGrade(it, c, r);
      c.rv = { read: r.read, points: r.points, why: r.why, agree };
      if (agree) c.ok = true;
    }
  }
  saveOrWarn(t2);
}
const openRv = c => !!(c && c.rv && !c.rv.agree && !c.rv.done);
const rvCount = t => t.students.filter(s => !s.skip && s.status === 'done').reduce((n, s) => n + t.key.items.filter(it => openRv(s.items[it.no])).length, 0);
/* 처음 3명(Claude 계정은 2명), 잘되면 4명까지. AI 한도면 줄이고 20초 쉬었다가 이어 감(스펙 2026-11-03 4장).
   이 채점에 쓴 AI 양을 모아 평가에 남김(aiUse, 다시 채점하면 바뀜) */
async function runQueue(id, list) {
  const run = { id, queue: list.slice(), stop: false, wait: false, mask: maskOf(getTest(id)) }, meter = newMeter(), acc = ai.isAccount();
  G.run = run;
  refresh(id);
  const r = await runPool(run, i => gradeOne(id, i, meter), { start: acc ? 2 : 3, max: acc ? 2 : 4, warm: true, onWait: on => { run.wait = on; refresh(id); } });
  if (r.gaveUp && G.run === run) toast(`채점을 멈췄어요. ${ai.errorMessage('rate_limited')} 남은 학생은 [채점 시작]으로 이어서 해요.`, 9000);
  const tot = meter.total(), t = getTest(id);
  if (t && (tot.sent || tot.out)) { t.aiUse = { at: Date.now(), ...tot }; G.usedNow.add(id); saveOrWarn(t); }
  refresh(id);
}
/* 이 평가의 이름 칸을 정하지 않았으면 먼저 물어봄 (기본은 가리고 보내기) */
function askMask(go) {
  const set = getSet(), m = maskOf(cur());
  if (!set.maskOn || (m && m.mask.length) || G.noMaskFor === curId()) { go(); return; }
  const last = set.mask.length ? ' 지난 평가에서 정한 곳을 먼저 보여 드려요. 이 학생 문제지에서도 이름이 가려지는지 확인해 주세요.' : '';
  SS().openSheet(`<h3>이 평가의 이름 칸을 아직 정하지 않았어요</h3><p class="muted" style="margin:0">정하지 않으면 학생 이름이 그대로 AI 회사로 보내져요. [이름 칸 정하기]로 이름이 적힌 곳을 상자로 표시해 주세요.${last}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn" type="button" id="unNoMaskOk">가리지 않고 채점</button><button class="btn primary" type="button" id="unMaskGo">이름 칸 정하기</button></div>`,
  sh => {
    // 「가리지 않고 채점」은 이 평가에서 한 번만 물음 (번호 읽기 → 채점으로 이어질 때 또 묻지 않게)
    sh.querySelector('#unNoMaskOk').addEventListener('click', () => { G.noMaskFor = curId(); SS().closeSheet(); go(); });
    sh.querySelector('#unMaskGo').addEventListener('click', () => { SS().closeSheet(); goStep(2); openMask(cur()); });
  });
}
function startGrading(only) {
  const id = curId(), t = getTest(id);
  if (!t) return;
  if (!ai.ready()) { toast(AI_KEY, 5000); return; }
  if (busy(id)) return;
  if (busyOther(id)) { toast('다른 평가를 채점하는 중이에요. 끝나거나 멈춘 뒤에 채점해 주세요.', 5000); return; }
  if (!hasPages(id)) { toast('학생 문제지를 먼저 넣어 주세요(1단계)', 5000); return; }
  if (G.arranging) { toast('학생 문제지를 다시 나누는 중이에요. 끝난 뒤에 채점해 주세요.', 5000); return; }
  // 번호 칸 그림에도 이름이 들어갈 수 있어서 이름 칸을 먼저 묻고, 번호를 읽어 확인한 뒤 채점
  if (byNo(t) && !nosOk(t)) { askMask(() => askNos(t, () => startGrading(only))); return; }
  const all = t.students.map((s, i) => ({ s, i })).filter(x => !x.s.skip && pagesOf(id, x.i).length);
  if (only != null) { const x = all.find(y => y.s.no === only); if (x) askMask(() => runQueue(id, [x.i])); else toast('이 학생의 스캔이 없어요. 번호가 맞는지 확인하거나 학생 문제지를 다시 넣어 주세요(2단계).', 5000); return; }
  const todo = all.filter(x => x.s.status !== 'done');
  if (todo.length) { askMask(() => runQueue(id, todo.map(x => x.i))); return; }
  SS().openSheet(`<h3>모두 다시 채점할까요?</h3><p class="muted" style="margin:0">학생 ${all.length}명을 다시 채점해요. 선생님이 고친 칸은 그대로 둬요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="unRegradeOk">다시 채점</button></div>`,
  sh => sh.querySelector('#unRegradeOk').addEventListener('click', () => { SS().closeSheet(); askMask(() => runQueue(id, all.map(x => x.i))); }));
}
function stopGrading() {
  if (G.run) { G.run.stop = true; G.run.queue = []; }
  for (const c of G.running.values()) c.abort();
}

const pending = t => t.students.filter(s => !s.skip && s.status === 'done').reduce((n, s) => n + t.key.items.filter(it => needsCheck(s.items[it.no])).length, 0);
function mark(it, c) {
  if (!c) return '·';
  const full = Number(it.points) || 0;
  if (!c.read && !c.pts) return '—';
  if (c.pts >= full) return '○';
  if (!c.pts) return '✕';
  return `${c.pts}/${full}`;
}
function step3HTML(t) {
  const id = t.id, items = t.key.items, run = busy(id);
  const done = t.students.filter(s => !s.skip && s.status === 'done').length, total = t.students.filter(s => !s.skip).length;
  const up = /업스테이지/.test(ai.providerName()) ? '<p class="muted cls-note">업스테이지는 이미지를 글자로 바꿔 보내요. 손글씨는 Claude·Gemini·GPT가 더 정확해요.</p>' : '';
  const scanNote = !hasPages(id) ? '<p class="banner warn" style="margin:8px 0 0">스캔 이미지는 저장하지 않아요. 채점하려면 2단계에서 학생 문제지를 다시 넣어 주세요.</p>'
    : noStale(t) ? '<p class="banner warn" style="margin:8px 0 0">번호를 다시 읽기 전이라 학생과 문제지 쪽이 맞지 않을 수 있어요. 칸의 문제지 그림은 번호를 읽은 뒤에 보여요([채점 시작]이나 칸의 [번호 읽기]).</p>' : '';
  const head = `<tr><th scope="col">번호</th>${items.map(it => `<th scope="col"><button class="un-ih" type="button" data-item="${it.no}" title="${esc(it.content)}">${it.no}<small>${TYPE[it.type] || ''}</small></button></th>`).join('')}<th scope="col">총점</th></tr>`;
  const rows = t.students.map((s, i) => {
    if (s.skip) return '';
    const st = (run && G.running.has(i) ? '<span class="spin" aria-label="채점 중"></span>' : s.status === 'error' ? `<span class="chip err" title="${esc(s.err || '')}">오류</span>` : '')
      + (s.status === 'done' && s.rvErr ? `<span class="chip warn" title="검토 AI를 부르지 못했어요. 메인 AI의 채점은 그대로예요.">${esc(s.rvErr)}</span>` : '');
    const cells = items.map(it => {
      const c = s.status === 'done' ? s.items[it.no] : null;
      return `<td><button class="un-cell${needsCheck(c) ? ' chk' : ''}${c && c.manual ? ' man' : ''}${openRv(c) ? ' rvo' : ''}" type="button" data-cell="${s.no}-${it.no}" aria-label="${s.no}번 ${it.no}번 문항${openRv(c) ? ' · 검토 의견' : ''}">${mark(it, c)}</button></td>`;
    }).join('');
    const tot = s.status === 'done' ? studentTotal(t, s) : null;
    return `<tr data-strow="${s.no}"><th scope="row"><span class="un-sno">${s.no}번</span>${st}<button class="btn text tiny" type="button" data-un="retry" data-no="${s.no}">${s.status === 'done' ? '다시' : s.status === 'error' ? '다시 시도' : '채점'}</button></th>${cells}<td class="num">${tot ? `${tot.score}/${tot.total}` : ''}</td></tr>`;
  }).join('');
  return `${aiRowHTML('grade')}<div class="yp-card">
      <div class="row">${run ? `<span class="spin"></span><b>채점하는 중 · ${done}/${total}명</b>${G.run && G.run.id === id && G.run.wait ? '<b class="warn">AI 한도에 걸려 잠깐 쉬어요</b>' : ''}<button class="btn" type="button" data-un="stop">멈추기</button>` : `<button class="btn primary" type="button" data-un="grade">채점 시작</button><span class="muted">${done}/${total}명 채점함</span>`}</div>
      ${t.aiUse && useText(t.aiUse) ? `<p class="muted cls-note" id="unAiUse">${G.usedNow.has(id) ? '' : '지난 채점 '}${esc(useText(t.aiUse))}</p>` : ''}
      ${up}${scanNote}
      ${reviewBar(rvCount(t), 'data-un="nextRv"')}
      <div class="row"><b id="unPending">확인할 칸 ${pending(t)}개</b><button class="btn text" type="button" data-un="nextChk">다음 확인할 칸</button><span class="grow"></span><button class="btn primary" type="button" data-un="finish">채점 마치기</button></div>
      ${done ? `<p class="muted cls-note un-acc" id="unAcc">${esc(accuracyText(unitAccuracy(t), { finished: t.done, graded: true }))}</p>` : ''}
      <p class="muted cls-note">노란 칸은 확인할 칸이에요: AI가 확신하지 못했거나, 앱과 AI의 판단이 다르거나, 단답이 정답과 글자가 다르거나, 서술형이에요. 문항 번호를 누르면 반 전체 답을 모아 봐요.</p>
      ${locRowHTML(t)}
    </div>
    <div class="yp-card un-grid-card"><div class="un-grid-wrap"><table class="un-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div></div>`;
}

const stuIndex = (t, no) => { const i = t.students.findIndex(s => s.no === no && !s.skip); return i >= 0 ? i : t.students.findIndex(s => s.no === no); };

/* ---------- 칸 확인 창: 그 문항 전체 보기 (스펙 2026-11-13-crop-log-flow §1) ----------
   평가마다 AI 한 번: 채점을 마친 첫 학생의 쪽들(채점 AI에 보낸 것과 같은 이름 가린 그림)과 문항 목록(번호·평가 내용·유형)만 보내
   문항마다 그 학생 쪽 차례·자리를 key.boxes에 적음(학생 번호·이름은 보내지 않음). 반 학생 모두의 같은 차례 쪽에 같은 자리를 써서
   화면에서만 잘라 보여 줌(잘린 그림은 저장하지 않음). 자리가 없으면(그 쪽이 없음·못 찾음·AI 키 없음) 지금처럼 쪽 전체 */
// busy: 자리를 찾는 중인 평가, failed: 이 화면을 켠 뒤 찾지 못한 평가(칸을 열 때마다 다시 부르지 않음 — [문항 자리 다시 찾기]로),
// whole: [쪽 전체 보기]를 골랐는지(이 화면에서만 기억), view: 열린 칸 확인 창(찾으면 바로 바꿈)
const L = { busy: new Set(), failed: new Set(), whole: false, view: null };
function layOf(per) { const s = getSet(); return `${per}:${s.twoUp ? 1 : 0}${s.flipBack ? 1 : 0}`; }
// 지금 스캔(그 쪽 모양)에 맞는 적어 둔 자리 { [no]: { page, box } }, 없으면 null
const boxesNow = t => (hasPages(t.id) ? boxesOf(t.key, G.lay || null) : null);
// 채점 AI가 그림을 보는지: 업스테이지는 그림을 글자로 바꿔 보내 자리를 알 수 없음
const seesImages = () => { const g = pickAI('grade', 'main'); return (g ? g.engine : providerEnv().engine) !== 'upstage'; };
// 이름 칸: 채점과 같은 조건(가리고 보내기를 껐거나, 이 평가에 이름 칸을 정했거나, 「가리지 않고 채점」을 고름)일 때만 그림을 보냄
const maskReady = t => { const m = maskOf(t); return !getSet().maskOn || !!(m && m.mask.length) || G.noMaskFor === t.id; };
/* 기준 학생: 채점을 마친 학생 중 쪽이 가장 많은 첫 학생(마지막 학생은 쪽이 모자랄 수 있음). 없으면 -1 */
function refStudent(t) {
  const xs = t.students.map((s, i) => ({ s, i, n: pagesOf(t.id, i).length })).filter(x => !x.s.skip && x.s.status === 'done' && x.n);
  const max = Math.max(0, ...xs.map(x => x.n)), x = xs.find(y => y.n === max);
  return x ? x.i : -1;
}
const canLocate = t => !!t && ai.ready() && seesImages() && hasPages(t.id) && !noStale(t) && maskReady(t) && refStudent(t) >= 0;
const redrawView = id => { if (L.view && L.view.id === id && L.view.el.isConnected) L.view.draw(); };
/* 문항 자리 찾기: 한 평가에 한 번에 하나. 끝나면 그 평가를 다시 읽어 자리만 넣음. say: [문항 자리 다시 찾기]로 부름(까닭을 알림) */
async function locate(id, say = false) {
  const t = getTest(id);
  if (!t || L.busy.has(id)) return;
  const i = refStudent(t);
  if (!ai.ready()) { if (say) toast(AI_KEY, 5000); return; }
  if (!seesImages()) { if (say) toast('업스테이지는 그림을 글자로 바꿔 보내서 문항 자리를 찾을 수 없어요.', 6000); return; }
  if (!hasPages(id) || noStale(t) || i < 0) { if (say) toast('채점한 학생의 문제지 스캔이 있어야 찾을 수 있어요.', 5000); return; }
  if (!maskReady(t)) { if (say) toast('이름 칸을 먼저 정해 주세요(2단계 [이름 칸 정하기]).', 6000); return; }
  const pages0 = G.pages, lay = G.lay;
  L.busy.add(id); L.failed.delete(id); refresh(id); redrawView(id);
  try {
    const images = await imagesFor(id, i);
    const v = await ai.generateJSON(locatePrompt(t.key.items, images.length), { images, valid: validLocate, task: 'grade' });
    const t2 = getTest(id);
    // 찾는 동안 스캔이나 쪽 모양이 바뀌었으면 버림(다음에 칸을 열 때 다시 찾음)
    if (!t2 || G.pages !== pages0 || G.lay !== lay) return;
    const items = normBoxes(v, t2.key.items, images.length), n = Object.keys(items).length;
    t2.key.boxes = { at: Date.now(), lay, items };
    saveOrWarn(t2);
    if (say) toast(n ? `문항 ${n}개 자리를 찾았어요` : '문항 자리를 찾지 못했어요. 칸에서는 쪽 전체를 보여 줘요', 5000);
  } catch (e) {
    L.failed.add(id);
    if (say) toast(`문항 자리를 찾지 못했어요. ${e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요.' : ai.errorMessage(e && e.code, e)}`, 7000);
  } finally { L.busy.delete(id); refresh(id); redrawView(id); }
}
/* 자른 그림: 쪽 그림(원래 크기) 그대로 두고 그 자리만 보이게 — 화면이 줄여 그리므로 또렷함. 너무 크게 늘리지 않음(원래 크기의 2배까지) */
function cropHTML(p, r, alt) {
  const pc = (a, b) => (a / b * 100).toFixed(3);
  return `<div class="un-crop" style="--ar:${(r.w / r.h).toFixed(4)};max-width:${Math.round(r.w * 2)}px"><img src="${p.url}" alt="${esc(alt)}" style="width:${pc(p.w, r.w)}%;left:${pc(-r.x, r.w)}%;top:${pc(-r.y, r.h)}%"></div>`;
}
/* 칸 확인 창의 문제지 칸: 그 문항만(자리가 있으면) 또는 쪽 전체, 아래에 [이 문항만]↔[쪽 전체 보기], 위에 상태 글 */
function drawView(el, id, no, itemNo) {
  const t = getTest(id), si = t ? stuIndex(t, no) : -1, body = el.querySelector('#unCvBody'), say = el.querySelector('#unCvMsg');
  if (!t || si < 0 || !body || !say) return;
  const pg = pagesOf(id, si), whole = `<div class="un-pages">${pg.map(k => `<img src="${G.pages[k].url}" alt="${no}번 학생 문제지">`).join('')}</div>`;
  const items = boxesNow(t), b = items && items[itemNo], k = b ? pg[b.page] : undefined, p = k != null ? G.pages[k] : null;
  const r = p ? cropRect(b.box, p.w, p.h) : null;
  let note = '';
  if (r) {
    body.innerHTML = `${L.whole ? whole : cropHTML(p, r, `${no}번 학생 · ${itemNo}번 문항`)}
      <div class="seg un-cv-seg" role="group" aria-label="문제지 보기"><button type="button" data-cv="item" aria-pressed="${!L.whole}">이 문항만</button><button type="button" data-cv="page" aria-pressed="${L.whole}">쪽 전체 보기</button></div>`;
  } else {
    body.innerHTML = whole;
    note = L.busy.has(id) ? '문항 자리를 찾는 중이에요' : b && !p ? '이 학생 문제지에는 그 쪽이 없어 쪽 전체를 보여 줘요'
      : items || L.failed.has(id) ? '이 문항 자리를 찾지 못해 쪽 전체를 보여 줘요' : '';
  }
  say.innerHTML = note ? `${L.busy.has(id) ? '<span class="spin" aria-hidden="true"></span> ' : ''}${note}` : '';
}
/* 3단계 [문항 자리 다시 찾기] 줄: 채점한 학생의 스캔이 있고 채점 AI가 그림을 볼 때 */
function locRowHTML(t) {
  if (!hasPages(t.id) || noStale(t) || refStudent(t) < 0 || !seesImages()) return '';
  const on = L.busy.has(t.id), items = boxesNow(t), again = !!items || L.failed.has(t.id);
  const text = on ? '문항 자리를 찾는 중이에요' : items ? `칸을 누르면 그 문항만 크게 보여요 · 자리를 찾은 문항 ${Object.keys(items).length}/${t.key.items.length}개`
    : L.failed.has(t.id) ? '문항 자리를 찾지 못했어요. 칸에서는 쪽 전체를 보여 줘요' : '칸을 처음 누르면 문항 자리를 찾아 그 문항만 크게 보여 줘요';
  return `<div class="row un-loc"><span class="muted" id="unLocMsg" role="status">${on ? '<span class="spin" aria-hidden="true"></span> ' : ''}${text}</span>
    <button class="btn" type="button" data-un="relocate"${on ? ' disabled' : ''}>${again ? '문항 자리 다시 찾기' : '문항 자리 찾기'}</button></div>`;
}
const FLAG = { low: 'AI가 확신하지 못했어요.', differ: '앱과 AI의 판단이 달라요. 앱은 정답표와 글자로 맞춰 봤어요.', similar: '정답과 글자가 달라 AI가 뜻을 보고 판단했어요.', essay: '서술형이라 AI가 점수를 제안했어요.' };
function openCell(no, itemNo) {
  // 3단계 표는 「채점 안 함」이 아닌 학생만: 번호가 겹친 옛 자료여도 그 학생을 고름
  const t = cur(), si = stuIndex(t, no), s = t.students[si], it = t.key.items.find(x => x.no === itemNo);
  if (!s || !it) return;
  if (s.status !== 'done') { toast('먼저 이 학생을 채점해 주세요'); return; }
  const c = s.items[itemNo] || gradeCell(it, undefined), full = Number(it.points) || 0;
  let pick = c.pts;
  const pg = pagesOf(t.id, si);
  // 다시 올린 스캔의 번호를 읽기 전이면 다른 학생 답안이 보일 수 있어 그림 대신 [번호 읽기](번호만 맞추고 채점은 안 함)
  const imgs = noStale(t) ? '<div class="row"><span class="muted">다시 넣은 스캔은 걷은 차례라 번호를 다시 읽은 뒤에 이 학생 문제지를 볼 수 있어요.</span><button class="btn" type="button" id="unCellNos">번호 읽기</button></div>'
    : pg.length ? '<div class="un-cv" id="unCellView"><p class="muted un-cv-msg" id="unCvMsg" role="status"></p><div class="un-cv-body" id="unCvBody"></div></div>' : '<p class="muted">스캔 이미지는 저장하지 않아서 지금은 볼 수 없어요.</p>';
  const ptsUI = it.type === 'essay'
    ? `<label class="cls-inline">점수 <input class="field num" type="number" id="unCellPts" min="0" max="${full}" value="${c.pts}"> / ${full}점</label>`
    : `<div class="seg" role="group" aria-label="점수"><button type="button" data-pts="${full}" aria-pressed="${c.pts >= full}">맞음 ${full}점</button><button type="button" data-pts="0" aria-pressed="${!c.pts}">틀림 0점</button></div>`;
  SS().openSheet(`<h3>${no}번 · ${itemNo}번 문항 <span class="muted">${TYPE[it.type] || ''}</span></h3>
    <p class="muted" style="margin:0">${esc(it.content)} · 정답: <b>${esc(it.answer)}</b> · 배점 ${full}점${it.criteria ? ` · 채점 기준: ${esc(it.criteria)}` : ''}</p>
    <label class="yp-f"><span class="lab">학생이 쓴 답 (AI가 읽은 글, 고칠 수 있어요)</span><input class="field" id="unCellRead" value="${esc(c.read)}"></label>
    ${c.flag && !c.ok ? `<p class="banner warn" style="margin:0">${FLAG[c.flag] || ''}</p>` : ''}${c.why ? `<p class="muted" style="margin:0">AI: ${esc(c.why)}</p>` : ''}
    ${openRv(c) ? opinionHTML({ title: '두 AI의 판단이 달라요', main: `${c.read || '(빈칸)'} · ${c.pts}점`, alt: `${c.rv.read || '(빈칸)'} · ${gradeCell(it, c.rv).pts}점`, why: c.rv.why, use: 'cell', keep: 'cell' }) : ''}
    ${ptsUI}${imgs}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" id="unCellOk">확인</button></div>`,
  sh => {
    sh.classList.add('wide');
    const nb = sh.querySelector('#unCellNos');
    if (nb) nb.addEventListener('click', () => { SS().closeSheet(); askMask(() => askNos(getTest(t.id), () => openCell(no, itemNo))); });
    // 그 문항만 ↔ 쪽 전체: 이 평가에 자리가 없으면 처음 열 때 한 번 찾고(그동안 쪽 전체), 찾으면 열린 창을 바로 바꿈
    const cv = sh.querySelector('#unCellView');
    if (cv) {
      const view = L.view = { id: t.id, el: cv, draw: () => drawView(cv, t.id, no, itemNo) };
      cv.addEventListener('click', e => {
        const b = e.target.closest('[data-cv]');
        if (!b) return;
        L.whole = b.dataset.cv === 'page'; view.draw();
        const f = cv.querySelector(`[data-cv="${b.dataset.cv}"]`); if (f) f.focus();
      });
      if (!boxesNow(t) && !L.failed.has(t.id) && canLocate(t)) locate(t.id);
      view.draw();
    }
    sh.querySelectorAll('[data-pts]').forEach(b => b.addEventListener('click', () => { pick = Number(b.dataset.pts); sh.querySelectorAll('[data-pts]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    // 두 의견 고르기: 검토 안은 그 답을 같은 규칙으로 채점한 점수, 그대로 두기는 메인 안
    const choose = useRv => {
      const t2 = getTest(t.id), s2 = t2 && t2.students[stuIndex(t2, no)];
      if (!s2 || !s2.items[itemNo] || !s2.items[itemNo].rv) { SS().closeSheet(); return; }
      const c2 = s2.items[itemNo];
      if (useRv) {
        const g = gradeCell(it, c2.rv);
        s2.items[itemNo] = { ...c2, read: g.read, pts: g.pts, ok: true, manual: c2.manual || g.pts !== c2.pts || g.read !== c2.read, rv: { ...c2.rv, done: 'review' } };
      } else s2.items[itemNo] = { ...c2, ok: true, rv: { ...c2.rv, done: 'main' } };
      saveOrWarn(t2); SS().closeSheet(); render();
    };
    const u = sh.querySelector('[data-rv-use]'), k = sh.querySelector('[data-rv-keep]');
    if (u) u.addEventListener('click', () => choose(true));
    if (k) k.addEventListener('click', () => choose(false));
    sh.querySelector('#unCellOk').addEventListener('click', () => {
      const read = sh.querySelector('#unCellRead').value.trim();
      const ip = sh.querySelector('#unCellPts');
      if (ip) pick = Math.max(0, Math.min(full, Math.round(Number(ip.value) || 0)));
      if (read !== c.read && pick === c.pts) { const a = autoJudge(it, read); if (a != null) pick = a; }
      const t2 = getTest(t.id), s2 = t2 && t2.students[stuIndex(t2, no)];
      if (!s2) { SS().closeSheet(); return; }
      const changed = pick !== c.pts || read !== c.read;
      const next = { ...c, read, pts: pick, ok: true, manual: c.manual || changed };
      // 손으로 고치면 검토 의견은 사라짐, 고치지 않고 확인하면 메인 안을 고른 것
      if (changed) delete next.rv; else if (openRv(c)) next.rv = { ...c.rv, done: 'main' };
      s2.items[itemNo] = next;
      saveOrWarn(t2); SS().closeSheet(); render();
    });
  });
}
function openItem(itemNo) {
  const t = cur(), it = t.key.items.find(x => x.no === itemNo);
  if (!it) return;
  const full = Number(it.points) || 0;
  const list = t.students.filter(s => !s.skip && s.status === 'done');
  const rows = list.map(s => { const c = s.items[itemNo] || {}; return `<li class="un-irow${needsCheck(c) ? ' chk' : ''}${openRv(c) ? ' rvo' : ''}"><b>${s.no}번</b><span class="un-iread">${c.read ? esc(c.read) : '<span class="muted">(빈칸)</span>'}${openRv(c) ? ` <span class="rv-tag" title="${esc(c.rv.why || '')}">검토: ${c.rv.read ? esc(c.rv.read) : '(빈칸)'} · ${gradeCell(it, c.rv).pts}점</span>` : ''}</span>
    <label class="cls-inline"><input class="field num" type="number" min="0" max="${full}" data-ipts="${s.no}" value="${c.pts || 0}"> / ${full}</label></li>`; }).join('');
  SS().openSheet(`<h3>${itemNo}번 문항 모아 보기 <span class="muted">${TYPE[it.type] || ''}</span></h3>
    <p class="muted" style="margin:0">${esc(it.content)} · 정답: <b>${esc(it.answer)}</b>${it.criteria ? ` · 채점 기준: ${esc(it.criteria)}` : ''}</p>
    <ul class="un-items">${rows || '<li class="muted">채점한 학생이 없어요</li>'}</ul>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" data-un="itemOk">지금 점수로 모두 확인</button></div>`,
  sh => {
    sh.classList.add('wide');
    const save = fn => { const t2 = getTest(t.id); if (!t2) return; for (const s of t2.students) if (!s.skip && s.status === 'done' && s.items[itemNo]) fn(s, s.items[itemNo]); saveOrWarn(t2); render(); };
    sh.querySelectorAll('[data-ipts]').forEach(inp => inp.addEventListener('change', () => {
      const no = Number(inp.dataset.ipts), v = Math.max(0, Math.min(full, Math.round(Number(inp.value) || 0)));
      save((s, c) => { if (s.no === no) { if (v !== c.pts) delete c.rv; else if (openRv(c)) c.rv.done = 'main'; Object.assign(c, { pts: v, ok: true, manual: c.manual || v !== c.pts }); } });
      inp.closest('li').classList.remove('chk');
    }));
    // 검토 의견이 있는 칸은 칸을 눌러 두 의견을 보고 고르게 남김
    sh.querySelector('[data-un="itemOk"]').addEventListener('click', () => {
      let left = 0;
      save((s, c) => { if (openRv(c)) { left++; return; } c.ok = true; });
      SS().closeSheet();
      toast(left ? `${itemNo}번 문항을 확인했어요. 검토 의견이 있는 칸 ${left}개는 칸을 눌러 골라 주세요` : `${itemNo}번 문항을 모두 확인했어요`, left ? 6000 : undefined);
    });
  });
}
function nextCheck() {
  const t = cur();
  for (const s of t.students) if (!s.skip && s.status === 'done') for (const it of t.key.items) if (needsCheck(s.items[it.no])) { openCell(s.no, it.no); return; }
  toast('확인할 칸이 없어요');
}
function nextReview() {
  const t = cur();
  for (const s of t.students) if (!s.skip && s.status === 'done') for (const it of t.key.items) if (openRv(s.items[it.no])) { openCell(s.no, it.no); return; }
  toast('검토 의견이 없어요');
}
function askFinish() {
  const t = cur(), n = pending(t);
  SS().openSheet(`<h3>채점 마치기</h3><p class="muted" style="margin:0">${n ? `확인하지 않은 칸 ${n}개가 있어요. 그대로 마칠까요?` : '모두 확인했어요. 마치면 결과 모아 보기에 들어가요.'} 마친 뒤에도 고칠 수 있어요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="unFinishOk">마치기</button></div>`,
  sh => sh.querySelector('#unFinishOk').addEventListener('click', () => {
    const t2 = getTest(t.id); if (!t2) return;
    t2.done = true; saveOrWarn(t2); SS().closeSheet(); toast('채점을 마쳤어요'); goStep(4);
  }));
}

registerStep(2, {
  html: step2HTML,
  // 1단계에서 받아 두었는데 아직 나누지 못한 학생 문제지(답안을 넣을 때 다른 평가를 채점하던 중 등)
  bind: (box, t) => { if (G.holds.has(t.id)) setTimeout(() => keyArrived(t.id), 0); }
});
/* 1단계 [학생 문제지 넣기(스캔한 것)] 줄과 다른 단추·한꺼번에 넣기에서 학생 쪽으로 나눈 것 (unit.js가 씀) */
registerPapers({
  drop: dropHold, // 평가를 지우면 받아 둔 학생 문제지도 비움
  html: t => ansRowHTML(t, 1),
  put: (files, t0) => loadAnswers(files, t0),
  putPages: (pages, t0) => loadAnswerPages(pages, t0),
  keyArrived,
  note(id, text) {
    G.note = text ? { id, text } : G.note && G.note.id === id ? null : G.note;
    const el = getBox() && getBox().querySelector('#unAnsMsg'), t = curId() === id ? cur() : null;
    if (el && t) el.textContent = ansMsg(t, inStep(1));
  }
});
registerStep(3, { html: step3HTML });

document.addEventListener('click', e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !(inStep(2) || inStep(3))) return;
  const cell = e.target.closest('[data-cell]');
  if (cell) { const [s, i] = cell.dataset.cell.split('-').map(Number); openCell(s, i); return; }
  const ih = e.target.closest('[data-item]');
  if (ih) { openItem(Number(ih.dataset.item)); return; }
  const b = e.target.closest('[data-un]'), a = b && b.dataset.un;
  if (!a) return;
  const t = cur();
  if (a === 'ansFile') box.querySelector('#unAnsFile').click();
  else if (a === 'mask') openMask(t);
  else if (a === 'noBox') openNoBox(t);
  else if (a === 'skip') { const s = t.students[Number(b.dataset.i)]; if (s) { s.skip = !s.skip; commit(t); render(); } }
  else if (a === 'toGrade') goStep(3);
  else if (a === 'grade') startGrading();
  else if (a === 'stop') stopGrading();
  else if (a === 'retry') startGrading(Number(b.dataset.no));
  else if (a === 'nextChk') nextCheck();
  else if (a === 'nextRv') nextReview();
  else if (a === 'finish') askFinish();
  else if (a === 'relocate') locate(t.id, true);
});
document.addEventListener('change', e => {
  const box = getBox();
  // 1단계에도 「학생 한 명 n쪽」 칸이 있음([학생 문제지 넣기] 옆)
  if (!box || !box.contains(e.target) || !(inStep(2) || (inStep(1) && e.target.id === 'unPagesPer'))) return;
  const el = e.target, t = cur();
  // 채점하는 동안 쪽 수·쪽 모양·번호를 바꾸면 보내는 중인 학생의 결과가 버려지거나 이름 칸이 지워져 이름이 AI로 감: 끝나거나 멈춘 뒤에
  const locked = ['unPagesPer', 'unTwoUp', 'unFlipBack', 'unAbsent'].includes(el.id) || el.dataset.stno != null;
  if (locked && busy(t.id)) { toast('채점하는 중에는 바꿀 수 없어요.', 4000); render(); return; }
  if (el.id === 'unAnsFile' && el.files.length) { const fs = [...el.files]; el.value = ''; loadAnswers(fs); }
  else if (el.id === 'unPagesPer') {
    const per = Math.max(1, Math.min(8, Math.round(Number(el.value) || 1)));
    saveSet({ ...getSet(), pagesPer: per });
    if (hasPages(t.id) && !t.students.some(s => s.status === 'done')) { t.students = []; split(t, G.pages.length, per); commit(t); }
    else if (t.students.some(s => s.status === 'done')) toast('이미 채점한 학생이 있어서 지금 나눈 것은 그대로예요. 학생 문제지를 다시 넣으면 새 쪽 수로 나눠요.', 6000);
    render();
  } else if (el.id === 'unTwoUp' || el.id === 'unFlipBack') {
    saveSet({ ...getSet(), [el.id === 'unTwoUp' ? 'twoUp' : 'flipBack']: el.checked });
    // 쪽 모양·방향이 바뀌면 정해 둔 이름 칸 자리가 맞지 않아 이름이 AI로 갈 수 있음: 지우고 다시 정하게
    if (maskOf(t) && maskOf(t).mask.length) { delete t.mask; delete t.maskAll; commit(t); toast('쪽 모양이 바뀌어 이름 칸을 지웠어요. [이름 칸 정하기]로 다시 정해 주세요.', 6000); }
    if (G.noMaskFor === t.id) G.noMaskFor = null; // 채점 전에 이름 칸을 다시 물음
    if (t.noBox) { delete t.noBox; commit(t); }
    rearrange(t);
  } else if (el.id === 'unMaskOn') { saveSet({ ...getSet(), maskOn: el.checked }); render(); }
  else if (el.id === 'unByNo') { t.byNo = el.checked; commit(t); saveSet({ ...getSet(), byNo: el.checked }); render(); } // 이 평가에, 그리고 다음 새 평가의 처음 값으로
  else if (el.id === 'unAbsent') {
    // 답안 차례(채점 결과)는 그대로 두고 번호만 다시 매김
    t.absent = parseNos(el.value);
    if (t.students.length) renumber(t, rosterExcept());
    commit(t);
    // 학생 번호 칸만 바로 바꾸고, 다시 그리기는 옮겨 간 칸을 떠날 때까지 미룸(1단계 정답표와 같게)
    box.querySelectorAll('input[data-stno]').forEach(x => { const s = t.students[Number(x.dataset.stno)]; if (s) x.value = s.no; });
    later(t.id);
  }
  else if (el.dataset.stno != null) {
    const i = Number(el.dataset.stno), v = Math.round(Number(el.value));
    if (!(v >= 1 && v <= 99) || t.students.some((s, j) => j !== i && s.no === v)) { toast('번호가 비었거나 겹쳐요'); if (t.students[i]) el.value = t.students[i].no; later(t.id); return; }
    const ok = nosOk(t);
    t.students[i].no = v; commit(t);
    if (ok) G.noOk.sig = noSig(t); // 확인한 번호를 손으로 고친 것은 다시 읽지 않음
    later(t.id);
  }
});

/* 모아찍기·뒷면 설정을 바꾸면 올린 스캔을 다시 나눔 (채점한 학생이 있으면 그대로 두고 안내) */
async function rearrange(t) {
  if (!hasPages(t.id) || busy(t.id)) { render(); return; }
  if (t.students.some(s => s.status === 'done')) { toast('이미 채점한 학생이 있어서 지금 나눈 것은 그대로예요. 학생 문제지를 다시 넣으면 새 설정으로 나눠요.', 6000); render(); return; }
  const raw = G.raw, seq = G.seq = (G.seq || 0) + 1;
  G.msg = '스캔을 다시 나누는 중…'; G.arranging = true;
  const el = getBox() && getBox().querySelector('#unAnsMsg'); if (el) el.textContent = G.msg;
  let pages;
  try { pages = await arrange(raw); } catch (e) { if (G.seq === seq) G.arranging = false; toast('스캔을 나누지 못했어요. 다시 넣어 주세요.'); return; }
  if (G.seq === seq) G.arranging = false;
  // 그 사이 새 스캔을 넣었거나 설정을 또 바꿨거나 채점이 시작됨: 이 결과는 버림
  const now = getTest(t.id);
  if (G.raw !== raw || G.seq !== seq || busy(t.id) || (now && now.students.some(s => s.status === 'done'))) {
    SS().files.freePages(pages.filter(p => !raw.includes(p)));
    if (G.raw === raw && G.seq === seq) { G.msg = pagesMsg(raw.length, G.pages.length, (now || t).students.length); refresh(t.id); }
    return;
  }
  SS().files.freePages(G.pages.filter(p => !raw.includes(p)));
  G.pages = pages;
  const t2 = getTest(t.id) || t;
  t2.students = []; split(t2, pages.length, Math.max(1, getSet().pagesPer | 0));
  G.msg = pagesMsg(raw.length, pages.length, t2.students.length);
  commit(t2); refresh(t2.id);
}

/* 떠 있는 버튼: 학생 문제지 스캔 → 답안을 넣은 단원평가(최근 것이 먼저)에 넣고 채점 시작. 그런 평가가 없으면 평가 › 평가지 채점 */
/* 답안을 넣은 단원평가(최근 것이 먼저). 예시 평가는 그것만 있을 때만 */
const keyed = () => { const l = listTests().filter(s => s.total > 0), real = l.filter(s => !s.sample); return real.length ? real : l; };
const testLabel = s => [s.title, s.date, s.done ? '채점 마침' : s.n ? `${s.n}명 채점함` : '채점 전'].filter(Boolean).join(' · ');
async function legacyGrade(files) {
  const L = SS().inbox;
  if (!L) return '';
  if (L.grBusy()) return '평가지 채점이 채점하는 중이에요. 끝난 뒤에 다시 넣어 주세요.';
  go('evaluate', 'gr');
  await L.grPages(files);
  return '';
}
/* 기준을 확정한 활동지(활동지 탭이 SSAM.activityInbox로 알려 줌) → 받는 곳 「활동지 채점 · …」, 값은 'act:' + id */
const acts = () => { const A = SS().activityInbox; try { return A ? A.list() : []; } catch (e) { return []; } };
registerInbox('unit-scan', {
  act: () => { const k = keyed().length, a = acts().length; return k && a ? '고른 평가(단원평가·활동지)에 학생 것으로 넣기' : k ? '단원평가 학생 문제지로 넣고 채점하기' : a ? '활동지 채점에 학생 활동지로 넣기' : '평가 › 평가지 채점에 넣기 (답안을 넣은 단원평가가 없어요)'; },
  fields: () => {
    const l = keyed(), al = acts();
    const opts = [...l.map(s => [s.id, testLabel(s)]), ...al.map(([id, label]) => ['act:' + id, '활동지 채점 · ' + label])];
    return opts.length ? [{ key: 'test', label: al.length ? '채점할 평가' : '채점할 단원평가', type: 'select', options: opts, value: opts[0][0], required: true, ask: opts.length > 1 }] : [];
  },
  async run(files, v) {
    if (v.test && String(v.test).startsWith('act:') && SS().activityInbox) return SS().activityInbox.put(String(v.test).slice(4), files);
    if (!v.test || !getTest(v.test)) return legacyGrade(files);
    go('evaluate', 'unit');
    openTest(v.test, 2);
    if (!(await loadAnswers(files)) || !hasPages(v.test)) return '';
    goStep(3);
    startGrading();
    return '';
  }
});
