/* 평가 › 활동지 5단계(결과·확정, 스펙 4.5)와 학생별 모아 보기(4.6), 교과 평어에 참고하기(4.7). 표·쪽지·기록은 번호만.
   5단계 첫 화면은 활동지 한눈에(스펙 2026-11-14-eval-redesign §5): 숫자 타일(누르면 거름)·학생 카드·반 전체로 보면. 지금까지의 표는 [표로 보기] */
import { toast, copyText } from '../../../core/ui.js';
import { exportButton, exportDoc, downloadsButton } from '../../../core/doc-export.js';
import { linkHTML, openLinkSheet } from '../../../core/eval-link.js';
import { listActivities, getActivity, records } from './activity-model.js';
import { TYPES, LEVEL, MARK } from './activity-ai.js';
import { graded, markOf, titleOf, tableRows, tableDoc, slipsDoc } from './activity-docs.js';
import { onePerPage, setOnePerPage } from '../../../core/slip-layout.js';
import { SUBJECTS } from './activity-read.js';
import { A, registerStep, registerView, curAct, commitAct, render, esc, getBox, visible } from './activity.js';
import { activityAccuracy, accuracyText } from '../grade-accuracy.js';
import { foldHTML } from '../../../core/ui-parts.js';
import { FILTERS, galleryCards, tileCounts, filterCards, topMissed, levelSplit, statsOrder, reviewQueue } from './activity-board.js';
import './activity-review.js'; // 채점 확인 화면(판단을 미룬 칸만 하나씩)

const TYPE_NAME = Object.fromEntries(TYPES);
export { statsOrder };

/* ---------- 5단계 ---------- */
/* 보기 상태: f 숫자 타일 거르기, table [표로 보기]. 다른 활동지를 열면 거르기는 처음으로 */
const V = { id: null, f: 'all', table: false };
const SLIP_NOTE = one => (one ? '피드백 쪽지는 번호마다 한 장씩, 번호만 적혀요. 자르지 않고 나눠 주면 돼요.' : '피드백 쪽지는 한 쪽에 4명, 번호만 적혀요.');
/* 쪽지 모양(자주 안 바꿈): 접힌 요약 한 줄, [바꾸기]로 「번호별로 한 장씩」 */
const SLIP_SUM = one => (one ? '피드백 쪽지: 번호마다 한 장씩' : '피드백 쪽지: 한 쪽에 4명');
const slipFold = () => foldHTML({ key: 'act-slip', summary: SLIP_SUM(onePerPage()), body: `<label class="switch"><input type="checkbox" data-one-page${onePerPage() ? ' checked' : ''}>번호별로 한 장씩</label>
        <p class="muted" id="acSlipNote" style="margin:0">${SLIP_NOTE(onePerPage())}</p>` });
/* [표로 보기]: 문항별 통계 전부와 반 표(지금까지의 5단계) */
function tableHTML(a, g) {
  const stats = statsOrder(a).map(r => `<li><b>${r.it.no}번</b> ${esc(TYPE_NAME[r.it.type] || '')} · ${esc(r.it.ask)}: ○ ${r.o} · △ ${r.t} · × ${r.x} · 안 함 ${r.n}</li>`).join('');
  const head = `<tr><th>번호</th>${a.items.map(it => `<th>${it.no}</th>`).join('')}<th>수준</th><th>잘한 점</th></tr>`;
  const rows = g.map(s => `<tr><td>${s.no}번</td>${a.items.map(it => `<td>${markOf(s, it)}</td>`).join('')}<td>${esc(LEVEL[s.level] || '')}</td><td class="ac-good">${esc(s.good)}</td></tr>`).join('');
  return `<div class="yp-card"><h3>문항별</h3><p class="muted" style="margin:0">× · 안 함이 많은 문항 먼저예요.</p><ul class="ac-stats" id="acStats">${stats}</ul></div>
    <div class="yp-card"><h3>반 표 · 학생 ${g.length}명</h3>
      <div class="ac-grid-wrap"><table class="ac-grid" id="acTable"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <div class="row">${exportButton('data-ac="exportTable"', { prefix: '반 표 · ' })}<button class="btn text" type="button" data-ac="copyTable">표 복사</button>${exportButton('data-ac="exportSlips"', { prefix: '피드백 쪽지 · ' })}${downloadsButton()}</div>
      ${slipFold()}</div>`;
}
/* 학생 카드: 번호 · 수준 칩(잘함 파랑 · 보통 회색 · 노력은 「더 도와줄」 주황) · 문항 칸 · 한 줄. 확인할 칸이 남으면 주황 점선 + 「선생님 차례」.
   누르면 4단계 표에서 그 학생 줄(칸을 눌러 고침) */
const LV_CHIP = { good: ['done', '잘함'], ok: ['', '보통'], try: ['turn', '더 도와줄'] };
const MARK_CLS = { o: 'm-o', t: 'm-t', x: 'm-x', n: 'm-n' };
function cardHTML(c) {
  const lv = LV_CHIP[c.level], turn = c.turn.length > 0;
  const cls = turn ? ' turn-dash' : c.level === 'try' ? ' turn' : '';
  const marks = c.marks.map(m => `<span class="ac-m ${MARK_CLS[m.mark] || 'm-none'}${m.look ? ' look' : ''}"><span class="ac-m-no">${m.no}</span>${esc(MARK[m.mark] || '?')}</span>`).join('');
  return `<li><button type="button" class="ev-card ac-gc${cls}" data-ac-stu="${c.no}">
    <span class="ac-gc-top"><span class="ac-gc-no"><span class="ev-num">${c.no}</span>번</span>${lv ? `<span class="ev-chip${lv[0] ? ' ' + lv[0] : ''}">${lv[1]}</span>` : ''}</span>
    <span class="ac-gc-marks"><span class="sr-only">문항별 표시: </span>${marks}</span>
    ${c.line ? `<span class="ac-gc-line">${esc(c.line)}</span>` : ''}
    ${turn ? `<span class="ac-gc-turn"><span class="ev-chip turn-soft"><span class="ev-dot turn"></span>선생님 차례</span> <span class="ac-gc-q">${c.turn.map(n => n + '번').join('·')} 문항</span></span>` : ''}
  </button></li>`;
}
function tilesHTML(cnt) {
  const cls = { good: ' ok', try: ' turn', turn: ' ac-tile-dash' };
  return `<div class="ev-tiles ac-tiles" role="group" aria-label="학생 거르기">${FILTERS.map(([f, label]) => `<button type="button" class="ev-tile${cls[f] || ''}" data-ac-f="${f}" aria-pressed="${V.f === f}"><span class="ev-tl">${label}</span><span class="ev-num">${cnt[f]}</span></button>`).join('')}</div>`;
}
/* 반 전체로 보면: 많이 놓친 문항 2~3개 · 수준 나눔 · 판단을 미룬 칸, 그리고 다음으로(피드백 쪽지·반 표) */
function wholeHTML(a, g, pend) {
  const miss = topMissed(a).map(r => {
    const who = r.x + r.n;
    return `<li><b class="ac-w-t">${r.it.no}번 ${esc(TYPE_NAME[r.it.type] || '')} · ${who ? `${who}명이 놓쳤어요` : `△ ${r.t}명`}</b>
      <span class="ac-w-ask">${esc(r.it.ask)}</span><span class="ac-w-n">○ ${r.o} · △ ${r.t} · × ${r.x} · 안 함 ${r.n}</span></li>`;
  }).join('');
  const lv = levelSplit(a), bar = (cls, label, n) => `<li class="${cls}"><span class="ac-w-l">${label}</span><span class="ev-bar"><i style="width:${g.length ? Math.round(n / g.length * 100) : 0}%"></i></span><span class="ev-num">${n}</span></li>`;
  return `<section class="ev-card ac-whole" aria-labelledby="acWholeH"><h3 class="ev-h" id="acWholeH">반 전체로 보면</h3>
      ${miss ? `<ol class="ac-w-miss" id="acStats">${miss}</ol>` : '<p class="ev-sub ac-w-none">틀리거나 비운 문항이 없어요.</p>'}
      <h4 class="ac-w-h">수준 나눔</h4>
      <ul class="ac-w-lv">${bar('lv-good', '잘함', lv.good)}${bar('lv-ok', '보통', lv.ok)}${bar('lv-try', '더 도와줄', lv.try)}${lv.none ? bar('lv-none', '수준 없음', lv.none) : ''}</ul>
      ${pend ? `<div class="ac-w-turn"><b>판단을 미룬 칸 ${pend}개</b><span class="ev-sub">쌤비서가 확신하지 못했거나 검토 AI와 다르게 본 칸이에요.</span><button type="button" class="ev-turn-btn" data-ac="review">확인할 것만 보기</button></div>` : ''}
    </section>
    <section class="ev-ink-card ac-next" aria-label="다음으로"><span class="ev-sub">다음으로</span>
      <p class="ac-next-p">학생마다 한 줄 피드백이 생겼어요. 피드백 쪽지로 나눠 주고, 교과 평어의 근거로도 써요.</p>
      <div class="row">${exportButton('data-ac="exportSlips"', { prefix: `피드백 쪽지 ${g.length}장 · ` })}${exportButton('data-ac="exportTable"', { prefix: '반 표 · ' })}${downloadsButton()}</div>
      ${slipFold()}
    </section>`;
}
function galleryHTML(a, g, pend) {
  const cards = galleryCards(a), shown = filterCards(cards, V.f);
  return `${tilesHTML(tileCounts(cards))}
    <div class="ac-r-grid"><div class="ac-gal-wrap">${shown.length ? `<ul class="ac-gal" id="acGallery" aria-label="학생 활동지">${shown.map(cardHTML).join('')}</ul>` : '<p class="ev-sub ac-gal-none">고른 학생이 없어요.</p>'}</div>
      <aside class="ac-r-side" aria-label="반 전체로 보면">${wholeHTML(a, g, pend)}</aside></div>`;
}
function step5HTML(a) {
  if (V.id !== a.id) { V.id = a.id; V.f = 'all'; }
  const g = graded(a), pend = reviewQueue(a).length;
  const bar = `<div class="ac-r-bar"><p class="ac-r-sum">학생 ${g.length}명을 채점했어요${pend ? ` · <b class="ac-turn-ink">판단을 미룬 칸 ${pend}개</b>만 봐 주세요` : ''}</p>
      <div class="row">${pend ? `<button type="button" class="ev-turn-btn" data-ac="review">확인할 것만 보기 · ${pend}칸</button>` : ''}<button class="btn" type="button" data-ac="tableView" aria-pressed="${V.table}">${V.table ? '카드로 보기' : '표로 보기'}</button></div></div>
    ${g.length ? `<p class="muted act-acc" id="acAcc5">${esc(accuracyText(activityAccuracy(a), { finished: a.done, graded: true }))}</p>` : ''}`;
  const body = !g.length ? '<div class="yp-card"><p class="muted" style="margin:0">아직 채점한 학생이 없어요. 4단계에서 채점하면 학생 카드가 생겨요.</p></div>'
    : V.table ? tableHTML(a, g) : galleryHTML(a, g, pend);
  return `${bar}${body}
    <div class="yp-card"><h3>교과 평어</h3>${linkHTML(a.link, a.meta.subject, 'data-ac')}${a.link && !a.done ? '<p class="muted" id="acLinkWait" style="margin:0">[확정]하면 평가지 채점의 참고 목록에 나와요.</p>' : ''}</div>
    <div class="row act-next">${a.done ? '<span class="chip ok">확정함 · 학생별 모아 보기에 남아요</span><button class="btn text" type="button" data-ac="undone">확정 풀기</button>' : `<button class="btn primary" type="button" data-ac="done"${g.length ? '' : ' disabled'}>확정</button>`}</div>`;
}
registerStep(5, { html: step5HTML });

/* ---------- 학생별 모아 보기 ---------- */
const R = { no: null, subject: '', term: '' };
function allNos() {
  const set = new Set();
  for (const s of listActivities()) { if (!s.done) continue; const a = getActivity(s.id); if (a) graded(a).forEach(x => set.add(x.no)); }
  return [...set].sort((a, b) => a - b);
}
function recList() { return R.no == null ? [] : records(R.no, { subject: R.subject, term: R.term ? Number(R.term) : null }); }
function recordsHTML() {
  const nos = allNos();
  if (R.no == null || !nos.includes(R.no)) R.no = nos[0] == null ? null : nos[0];
  const subs = [...new Set([...SUBJECTS, ...listActivities().map(s => s.subject).filter(Boolean)])];
  const list = recList();
  const body = !nos.length ? '<p class="muted" style="margin:0">아직 확정한 활동지가 없어요. 5단계에서 [확정]을 누르면 여기에 남아요.</p>'
    : list.length ? `<table class="ac-grid" id="recTable"><thead><tr><th>날짜</th><th>교과</th><th>활동</th><th>수준</th><th>잘한 점</th><th>더 해 볼 점</th></tr></thead><tbody>${list.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.subject)}</td><td>${esc(r.title)}</td><td>${esc(LEVEL[r.level] || '')}</td><td class="ac-good">${esc(r.good)}</td><td class="ac-good">${esc(r.next)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted" style="margin:0">고른 조건의 기록이 없어요.</p>';
  return `<div class="un-top"><button class="btn text" type="button" data-ac="back">‹ 목록</button><b class="un-title">학생별 모아 보기</b></div>
    <div class="yp-card"><div class="act-set">
      <label class="yp-f"><span class="lab">번호</span><select class="field" id="recNo">${nos.map(n => `<option value="${n}"${n === R.no ? ' selected' : ''}>${n}번</option>`).join('')}</select></label>
      <label class="yp-f"><span class="lab">교과</span><select class="field" id="recSubject"><option value="">모든 교과</option>${subs.map(s => `<option${s === R.subject ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
      <label class="yp-f"><span class="lab">학기</span><select class="field" id="recTerm"><option value="">모두</option><option value="1"${R.term === '1' ? ' selected' : ''}>1학기</option><option value="2"${R.term === '2' ? ' selected' : ''}>2학기</option></select></label>
      <button class="btn text" type="button" data-ac="recCopy"${list.length ? '' : ' disabled'}>복사</button></div>
      <div id="recBody">${body}</div></div>`;
}
registerView('records', { html: recordsHTML });

/* ---------- 누르기 ---------- */
const mine = e => { const box = getBox(); return box && box.contains(e.target) && visible(); };
document.addEventListener('click', async e => {
  if (!mine(e)) return;
  const at5 = A.view === 'act' && A.step === 5;
  // 숫자 타일: 그 학생 카드만(다시 그린 뒤에도 누른 타일에 초점)
  const tile = at5 && e.target.closest('[data-ac-f]');
  if (tile) { V.f = tile.dataset.acF; render(); const t = getBox().querySelector(`[data-ac-f="${V.f}"]`); if (t) t.focus(); return; }
  // 학생 카드: 4단계 표에서 그 학생 줄
  const card = at5 && e.target.closest('[data-ac-stu]');
  if (card) { A.focusNo = Number(card.dataset.acStu); A.step = 4; render(); return; }
  const b = e.target.closest('[data-ac]');
  if (!b) return;
  const act = b.dataset.ac, a = at5 ? curAct() : null;
  if (act === 'tableView' && a) { V.table = !V.table; render(); const t = getBox().querySelector('[data-ac="tableView"]'); if (t) t.focus(); return; }
  if (act === 'recCopy') {
    const text = recList().map(r => `${r.date} ${r.subject} 「${r.title}」 ${LEVEL[r.level] || ''} · 잘한 점: ${r.good} · 더 해 볼 점: ${r.next}`).join('\n');
    copyText(`${R.no}번 활동지 기록\n${text}`).then(ok => toast(ok ? '복사했어요' : '복사하지 못했어요'));
    return;
  }
  if (!a) return;
  if (act === 'exportTable') { try { toast(await exportDoc(tableDoc(a), `${titleOf(a)} 결과`), 6000); } catch (er) { toast('파일을 저장하지 못했어요'); } }
  else if (act === 'exportSlips') { try { toast(await exportDoc(slipsDoc(a, { one: onePerPage() }), `${titleOf(a)} 피드백 쪽지`), 6000); } catch (er) { toast('파일을 저장하지 못했어요'); } }
  else if (act === 'copyTable') copyText(tableRows(a).map(r => r.join('\t')).join('\n')).then(ok => toast(ok ? '표를 복사했어요. 한글·엑셀에 붙여넣으세요' : '복사하지 못했어요'));
  else if (act === 'done') { a.done = true; commitAct(a); render(); toast('확정했어요. 학생별 모아 보기에 남아요'); }
  else if (act === 'undone') { a.done = false; commitAct(a); render(); }
  else if (act === 'linkEdit') openLinkSheet({ subject: a.meta.subject, link: a.link, save: l => { const a2 = curAct(); a2.link = l; commitAct(a2); render(); } });
});
document.addEventListener('change', e => {
  if (!mine(e)) return;
  const el = e.target;
  if (el.matches('[data-one-page]')) {
    // 화면은 다시 그리지 않고 안내 글만 바꿈
    setOnePerPage(el.checked);
    const n = getBox().querySelector('#acSlipNote'); if (n) n.textContent = SLIP_NOTE(el.checked);
    const sum = getBox().querySelector('[data-fold="act-slip"] .fold-text'); if (sum) sum.textContent = SLIP_SUM(el.checked);
    return;
  }
  if (el.id === 'recNo') { R.no = Number(el.value); render(); return; }
  if (el.id === 'recSubject') { R.subject = el.value; render(); return; }
  if (el.id === 'recTerm') { R.term = el.value; render(); return; }
  if (el.dataset.ac === 'link' && A.view === 'act' && A.step === 5) {
    const a = curAct();
    if (!a) return;
    if (!el.checked) { a.link = null; commitAct(a); render(); return; }
    openLinkSheet({ subject: a.meta.subject, link: a.link, save: l => { const a2 = curAct(); a2.link = l; commitAct(a2); render(); }, cancel: () => render() });
  }
});
