/* 단원평가 2단계(답안 올리기·이름 가리기)·3단계(문항별 채점·확인 표) (스펙 2.2·3.2).
   스캔 쪽은 이 화면에만 두고 저장하지 않음. 채점은 시작한 평가 id를 붙들고, 결과는 그 평가를 다시 읽어 넣음 */
import { toast } from '../../../core/ui.js';
import * as ai from '../../../core/ai.js';
import * as store from '../../../core/store.js';
import { ITEM_TYPES, autoJudge, gradeCell, mergeCells, needsCheck, studentTotal } from './unit-grade.js';
import { getTest, getSet, saveSet, numbersFor } from './unit-model.js';
import { gradePrompt, normGrade, validGrade } from './unit-ai.js';
import { esc, SS, AI_KEY, registerStep, inStep, cur, curId, commit, saveOrWarn, refresh, render, goStep, getBox } from './unit.js';

const TYPE = Object.fromEntries(ITEM_TYPES);
/* 세션 상태: 올린 스캔은 한 평가에만 붙음. 채점은 한 번에 한 평가만(run: 그 평가의 차례·멈춤) */
const G = { testId: null, pages: [], idx: [], msg: '', running: new Map(), run: null };
const pagesOf = (id, i) => (G.testId === id && G.idx[i]) || [];
const hasPages = id => G.testId === id && G.pages.length > 0;
const busy = id => !!G.run && G.run.id === id && (G.run.queue.length > 0 || G.running.size > 0);
const busyOther = id => !!G.run && G.run.id !== id && busy(G.run.id);

/* ---------- 2단계: 답안 올리기 ---------- */
function split(t, pageCount, per) {
  const n = Math.ceil(pageCount / per);
  G.idx = Array.from({ length: n }, (_, i) => Array.from({ length: Math.min(per, pageCount - i * per) }, (_, j) => i * per + j));
  if (t.students.length === n) return; // 이미 나눈 학생에 차례대로 다시 붙임
  const roster = store.get('class', null) || {};
  t.students = numbersFor(n, roster.except || []).map(no => ({ no, skip: false, status: 'idle', items: {}, good: '', cheer: '' }));
}
async function loadAnswers(fileList) {
  const t0 = cur(), id = t0.id, per = Math.max(1, getSet().pagesPer | 0);
  const say = m => { G.msg = m; const el = getBox() && getBox().querySelector('#unAnsMsg'); if (el) el.textContent = m; };
  // 채점하는 동안 스캔을 바꾸면 채점 중인 학생에게 다른 쪽이 붙음: 끝나거나 멈춘 뒤에
  if (busyOther(id)) { say('다른 평가를 채점하는 중이에요. 그 채점이 끝나거나 멈춘 뒤에 올려 주세요.'); return; }
  if (busy(id)) { say('채점하는 중이에요. 끝나거나 멈춘 뒤에 다시 올려 주세요.'); return; }
  let r;
  try { r = await SS().files.readPages(fileList, say); }
  catch (e) { say(e && e.message === 'PDFJS' ? 'PDF를 읽는 도구를 불러오지 못했어요. 인터넷 연결을 확인하거나 사진으로 올려 주세요.' : '파일을 읽지 못했어요.'); return; }
  if (!r.pages.length) { say('읽을 수 있는 PDF·사진이 없어요.'); return; }
  const t = getTest(id) || t0;
  const n = Math.ceil(r.pages.length / per);
  const apply = () => {
    if (G.testId) SS().files.freePages(G.pages);
    G.testId = id; G.pages = r.pages;
    split(t, r.pages.length, per);
    G.msg = `${r.pages.length}쪽 · 학생 ${t.students.length}명${r.skipped.length ? ` · 읽지 못한 파일 ${r.skipped.length}개` : ''}`;
    commit(t); refresh(id);
  };
  if (G.run && busy(G.run.id)) { say('채점하는 중이에요. 끝나거나 멈춘 뒤에 다시 올려 주세요.'); return; }
  if (t.students.length && t.students.length !== n && t.students.some(s => s.status === 'done')) {
    SS().openSheet(`<h3>학생 수가 달라요</h3><p class="muted" style="margin:0">채점한 학생은 ${t.students.length}명인데 새 스캔은 ${n}명이에요. 새로 나누면 채점한 결과가 지워져요.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="unRedoOk">새로 나누기</button></div>`,
    sh => sh.querySelector('#unRedoOk').addEventListener('click', () => { t.students = []; SS().closeSheet(); apply(); }));
    return;
  }
  apply();
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
function step2HTML(t) {
  const set = getSet();
  const note = t.students.length && !hasPages(t.id) ? '<p class="banner warn" style="margin:8px 0 0">스캔 이미지는 저장하지 않아요. 다시 채점하려면 답안 스캔을 다시 올려 주세요.</p>' : '';
  return `<div class="yp-card">
      <h3>답안 올리기</h3>
      <p class="muted cls-note">반 전체 답안을 스캔한 PDF나 사진을 올려요. 학생마다 장 수가 같아야 차례대로 나눠져요. 번호는 학급 명단의 예외 번호를 건너뛰어 매겨요.</p>
      <div class="row"><button class="btn primary" type="button" data-un="ansFile">답안 스캔 올리기</button>
        <label class="cls-inline">학생 한 명 <input class="field num" type="number" id="unPagesPer" min="1" max="8" value="${set.pagesPer}"> 쪽</label>
        <span class="muted" id="unAnsMsg">${esc(G.testId === t.id ? G.msg : '')}</span></div>
      <input type="file" id="unAnsFile" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden>
      <div class="row"><label class="switch"><input type="checkbox" id="unMaskOn"${set.maskOn ? ' checked' : ''}>이름 칸을 가리고 보내기</label>
        <button class="btn" type="button" data-un="mask"${hasPages(t.id) ? '' : ' disabled'}>이름 칸 정하기</button>
        <span class="muted">${set.mask.length ? `가릴 곳 ${set.mask.length}개${set.maskAll ? ' · 모든 쪽' : ' · 첫 쪽'}` : '가릴 곳을 아직 정하지 않았어요'}</span></div>
      ${note}
    </div>
    ${t.students.length ? `<div class="yp-card"><h3>학생 ${t.students.filter(s => !s.skip).length}명</h3><ul class="un-stus">${t.students.map((s, i) => stuRow(t, s, i)).join('')}</ul></div>` : ''}
    <div class="row un-next"><button class="btn primary" type="button" data-un="toGrade"${t.students.length ? '' : ' disabled'}>다음: 채점</button></div>`;
}
function openMask(t) {
  const set = getSet();
  const shots = t.students.map((s, i) => ({ s, pg: pagesOf(t.id, i) })).filter(x => !x.s.skip && x.pg.length).map(x => ({ url: G.pages[x.pg[0]].url, label: `${x.s.no}번 첫 쪽` }));
  if (!shots.length || !SS().openMaskEditor) return;
  SS().openMaskEditor({ shots, mask: set.mask, all: set.maskAll, what: '평가지', save: (mask, all) => { saveSet({ ...getSet(), mask, maskAll: all }); render(); } });
}

/* ---------- 3단계: 채점 ---------- */
async function imagesFor(id, i) {
  const set = getSet(), out = [], pg = pagesOf(id, i);
  for (let j = 0; j < pg.length; j++) {
    const masked = set.maskOn && set.mask.length && (set.maskAll || j === 0);
    out.push(await SS().files.pageImage(G.pages[pg[j]], masked ? set.mask : null));
  }
  return out;
}
async function gradeOne(id, i) {
  const t0 = getTest(id), no = t0 && t0.students[i] && t0.students[i].no;
  if (no == null) return;
  const ctrl = new AbortController();
  G.running.set(i, ctrl); refresh(id);
  try {
    const images = await imagesFor(id, i);
    // 스캔이 없으면 AI를 부르지 않음 (이미지 없이 채점하면 0점이 그대로 저장됨)
    if (!images.length) throw { code: 'no_scan' };
    const v = await ai.generateJSON(gradePrompt(t0, no), { images, signal: ctrl.signal, valid: validGrade });
    const res = normGrade(v, t0.key.items);
    const t = getTest(id), st = t && t.students[i];
    if (!st || st.no !== no) return;
    st.items = mergeCells(st.items, Object.fromEntries(t.key.items.map(it => [it.no, gradeCell(it, res[it.no])])));
    st.status = 'done'; st.err = '';
    // 저장 공간이 꽉 차면 남은 학생은 부르지 않음 (AI를 불러도 결과를 버리게 되므로)
    if (!saveOrWarn(t) && G.run && G.run.id === id) { G.run.stop = true; G.run.queue = []; }
  } catch (e) {
    if (ctrl.signal.aborted) return;
    const t = getTest(id), st = t && t.students[i];
    if (st && st.no === no) { st.status = 'error'; st.err = e && e.code === 'no_scan' ? '스캔이 없어요. 답안 스캔을 다시 올려 주세요' : e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요' : ai.errorMessage(e && e.code, e); saveOrWarn(t); }
  } finally { G.running.delete(i); refresh(id); }
}
async function runQueue(id, list) {
  const run = { id, queue: list.slice(), stop: false };
  G.run = run;
  const worker = async () => { while (run.queue.length && !run.stop) await gradeOne(id, run.queue.shift()); };
  refresh(id);
  await Promise.all([worker(), worker()]);
  refresh(id);
}
/* 이름 칸을 정하지 않았으면 먼저 물어봄 (기본은 가리고 보내기) */
function askMask(go) {
  const set = getSet();
  if (!set.maskOn || set.mask.length) { go(); return; }
  SS().openSheet(`<h3>이름 칸을 아직 정하지 않았어요</h3><p class="muted" style="margin:0">정하지 않으면 학생 이름이 그대로 AI 회사로 보내져요. 2단계에서 [이름 칸 정하기]로 이름이 적힌 곳을 상자로 표시해 주세요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn" type="button" id="unNoMaskOk">가리지 않고 채점</button><button class="btn primary" type="button" id="unMaskGo">이름 칸 정하기</button></div>`,
  sh => {
    sh.querySelector('#unNoMaskOk').addEventListener('click', () => { SS().closeSheet(); go(); });
    sh.querySelector('#unMaskGo').addEventListener('click', () => { SS().closeSheet(); goStep(2); openMask(cur()); });
  });
}
function startGrading(only) {
  const id = curId(), t = getTest(id);
  if (!t) return;
  if (!ai.ready()) { toast(AI_KEY, 5000); return; }
  if (busy(id)) return;
  if (busyOther(id)) { toast('다른 평가를 채점하는 중이에요. 끝나거나 멈춘 뒤에 채점해 주세요.', 5000); return; }
  if (!hasPages(id)) { toast('답안 스캔을 먼저 올려 주세요(2단계)', 5000); return; }
  const all = t.students.map((s, i) => ({ s, i })).filter(x => !x.s.skip && pagesOf(id, x.i).length);
  if (only != null) { const x = all.find(y => y.s.no === only); if (x) askMask(() => runQueue(id, [x.i])); return; }
  const todo = all.filter(x => x.s.status !== 'done');
  if (todo.length) { askMask(() => runQueue(id, todo.map(x => x.i))); return; }
  SS().openSheet(`<h3>모두 다시 채점할까요?</h3><p class="muted" style="margin:0">학생 ${all.length}명을 다시 채점해요. 선생님이 고친 칸은 그대로 둬요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" id="unRegradeOk">다시 채점</button></div>`,
  sh => sh.querySelector('#unRegradeOk').addEventListener('click', () => { SS().closeSheet(); runQueue(id, all.map(x => x.i)); }));
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
  const scanNote = hasPages(id) ? '' : '<p class="banner warn" style="margin:8px 0 0">스캔 이미지는 저장하지 않아요. 채점하려면 2단계에서 답안 스캔을 다시 올려 주세요.</p>';
  const head = `<tr><th scope="col">번호</th>${items.map(it => `<th scope="col"><button class="un-ih" type="button" data-item="${it.no}" title="${esc(it.content)}">${it.no}<small>${TYPE[it.type] || ''}</small></button></th>`).join('')}<th scope="col">총점</th></tr>`;
  const rows = t.students.map((s, i) => {
    if (s.skip) return '';
    const st = run && G.running.has(i) ? '<span class="spin" aria-label="채점 중"></span>' : s.status === 'error' ? `<span class="chip err" title="${esc(s.err || '')}">오류</span>` : '';
    const cells = items.map(it => {
      const c = s.status === 'done' ? s.items[it.no] : null;
      return `<td><button class="un-cell${needsCheck(c) ? ' chk' : ''}${c && c.manual ? ' man' : ''}" type="button" data-cell="${s.no}-${it.no}" aria-label="${s.no}번 ${it.no}번 문항">${mark(it, c)}</button></td>`;
    }).join('');
    const tot = s.status === 'done' ? studentTotal(t, s) : null;
    return `<tr data-strow="${s.no}"><th scope="row"><span class="un-sno">${s.no}번</span>${st}<button class="btn text tiny" type="button" data-un="retry" data-no="${s.no}">${s.status === 'done' ? '다시' : s.status === 'error' ? '다시 시도' : '채점'}</button></th>${cells}<td class="num">${tot ? `${tot.score}/${tot.total}` : ''}</td></tr>`;
  }).join('');
  return `<div class="yp-card">
      <div class="row">${run ? `<span class="spin"></span><b>채점하는 중 · ${done}/${total}명</b><button class="btn" type="button" data-un="stop">멈추기</button>` : `<button class="btn primary" type="button" data-un="grade">채점 시작</button><span class="muted">${done}/${total}명 채점함</span>`}</div>
      ${up}${scanNote}
      <div class="row"><b id="unPending">확인할 칸 ${pending(t)}개</b><button class="btn text" type="button" data-un="nextChk">다음 확인할 칸</button><span class="grow"></span><button class="btn primary" type="button" data-un="finish">채점 마치기</button></div>
      <p class="muted cls-note">노란 칸은 확인할 칸이에요: AI가 확신하지 못했거나, 앱과 AI의 판단이 다르거나, 단답이 정답과 글자가 다르거나, 서술형이에요. 문항 번호를 누르면 반 전체 답을 모아 봐요.</p>
    </div>
    <div class="yp-card un-grid-card"><div class="un-grid-wrap"><table class="un-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div></div>`;
}

const FLAG = { low: 'AI가 확신하지 못했어요.', differ: '앱과 AI의 판단이 달라요. 앱은 정답표와 글자로 맞춰 봤어요.', similar: '정답과 글자가 달라 AI가 뜻을 보고 판단했어요.', essay: '서술형이라 AI가 점수를 제안했어요.' };
function openCell(no, itemNo) {
  const t = cur(), si = t.students.findIndex(s => s.no === no), s = t.students[si], it = t.key.items.find(x => x.no === itemNo);
  if (!s || !it) return;
  if (s.status !== 'done') { toast('먼저 이 학생을 채점해 주세요'); return; }
  const c = s.items[itemNo] || gradeCell(it, undefined), full = Number(it.points) || 0;
  let pick = c.pts;
  const pg = pagesOf(t.id, si);
  const imgs = pg.length ? `<div class="un-pages">${pg.map(k => `<img src="${G.pages[k].url}" alt="${no}번 평가지">`).join('')}</div>` : '<p class="muted">스캔 이미지는 저장하지 않아서 지금은 볼 수 없어요.</p>';
  const ptsUI = it.type === 'essay'
    ? `<label class="cls-inline">점수 <input class="field num" type="number" id="unCellPts" min="0" max="${full}" value="${c.pts}"> / ${full}점</label>`
    : `<div class="seg" role="group" aria-label="점수"><button type="button" data-pts="${full}" aria-pressed="${c.pts >= full}">맞음 ${full}점</button><button type="button" data-pts="0" aria-pressed="${!c.pts}">틀림 0점</button></div>`;
  SS().openSheet(`<h3>${no}번 · ${itemNo}번 문항 <span class="muted">${TYPE[it.type] || ''}</span></h3>
    <p class="muted" style="margin:0">${esc(it.content)} · 정답: <b>${esc(it.answer)}</b> · 배점 ${full}점${it.criteria ? ` · 채점 기준: ${esc(it.criteria)}` : ''}</p>
    <label class="yp-f"><span class="lab">학생이 쓴 답 (AI가 읽은 글, 고칠 수 있어요)</span><input class="field" id="unCellRead" value="${esc(c.read)}"></label>
    ${c.flag && !c.ok ? `<p class="banner warn" style="margin:0">${FLAG[c.flag] || ''}</p>` : ''}${c.why ? `<p class="muted" style="margin:0">AI: ${esc(c.why)}</p>` : ''}
    ${ptsUI}${imgs}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" id="unCellOk">확인</button></div>`,
  sh => {
    sh.classList.add('wide');
    sh.querySelectorAll('[data-pts]').forEach(b => b.addEventListener('click', () => { pick = Number(b.dataset.pts); sh.querySelectorAll('[data-pts]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
    sh.querySelector('#unCellOk').addEventListener('click', () => {
      const read = sh.querySelector('#unCellRead').value.trim();
      const ip = sh.querySelector('#unCellPts');
      if (ip) pick = Math.max(0, Math.min(full, Math.round(Number(ip.value) || 0)));
      if (read !== c.read && pick === c.pts) { const a = autoJudge(it, read); if (a != null) pick = a; }
      const t2 = getTest(t.id), s2 = t2 && t2.students.find(x => x.no === no);
      if (!s2) { SS().closeSheet(); return; }
      s2.items[itemNo] = { ...c, read, pts: pick, ok: true, manual: c.manual || pick !== c.pts || read !== c.read };
      saveOrWarn(t2); SS().closeSheet(); render();
    });
  });
}
function openItem(itemNo) {
  const t = cur(), it = t.key.items.find(x => x.no === itemNo);
  if (!it) return;
  const full = Number(it.points) || 0;
  const list = t.students.filter(s => !s.skip && s.status === 'done');
  const rows = list.map(s => { const c = s.items[itemNo] || {}; return `<li class="un-irow${needsCheck(c) ? ' chk' : ''}"><b>${s.no}번</b><span class="un-iread">${c.read ? esc(c.read) : '<span class="muted">(빈칸)</span>'}</span>
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
      save((s, c) => { if (s.no === no) Object.assign(c, { pts: v, ok: true, manual: c.manual || v !== c.pts }); });
      inp.closest('li').classList.remove('chk');
    }));
    sh.querySelector('[data-un="itemOk"]').addEventListener('click', () => { save((s, c) => { c.ok = true; }); SS().closeSheet(); toast(`${itemNo}번 문항을 모두 확인했어요`); });
  });
}
function nextCheck() {
  const t = cur();
  for (const s of t.students) if (!s.skip && s.status === 'done') for (const it of t.key.items) if (needsCheck(s.items[it.no])) { openCell(s.no, it.no); return; }
  toast('확인할 칸이 없어요');
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

registerStep(2, { html: step2HTML });
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
  else if (a === 'skip') { const s = t.students[Number(b.dataset.i)]; if (s) { s.skip = !s.skip; commit(t); render(); } }
  else if (a === 'toGrade') goStep(3);
  else if (a === 'grade') startGrading();
  else if (a === 'stop') stopGrading();
  else if (a === 'retry') startGrading(Number(b.dataset.no));
  else if (a === 'nextChk') nextCheck();
  else if (a === 'finish') askFinish();
});
document.addEventListener('change', e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inStep(2)) return;
  const el = e.target, t = cur();
  if (el.id === 'unAnsFile' && el.files.length) { const fs = [...el.files]; el.value = ''; loadAnswers(fs); }
  else if (el.id === 'unPagesPer') {
    const per = Math.max(1, Math.min(8, Math.round(Number(el.value) || 1)));
    saveSet({ ...getSet(), pagesPer: per });
    if (hasPages(t.id) && !t.students.some(s => s.status === 'done')) { t.students = []; split(t, G.pages.length, per); commit(t); }
    else if (t.students.some(s => s.status === 'done')) toast('이미 채점한 학생이 있어서 지금 나눈 것은 그대로예요. 답안 스캔을 다시 올리면 새 쪽 수로 나눠요.', 6000);
    render();
  } else if (el.id === 'unMaskOn') { saveSet({ ...getSet(), maskOn: el.checked }); render(); }
  else if (el.dataset.stno != null) {
    const i = Number(el.dataset.stno), v = Math.round(Number(el.value));
    if (!(v >= 1 && v <= 99) || t.students.some((s, j) => j !== i && s.no === v)) { toast('번호가 비었거나 겹쳐요'); render(); return; }
    t.students[i].no = v; commit(t); render();
  }
});
