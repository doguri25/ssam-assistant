/* 평가 › 활동지 › 채점 확인(스펙 2026-11-14-eval-redesign §4): 쌤비서가 판단을 미룬 칸(노란 칸)과 검토 AI가 다르게 본 칸만 하나씩.
   왼쪽 확인할 칸 목록(번호 · 문항), 가운데 문항과 학생 답(읽은 글)·피드백, 오른쪽 기준과 쌤비서 생각 — 정하면 다음 칸.
   ← → 는 이 화면 안에 초점이 있을 때만 앞뒤로. 저장은 4단계 칸 고치기와 같은 함수(saveCell·saveNote). 스캔 그림은 저장하지 않아 없음. 학생은 번호만 */
import { A, registerView, curAct, render, esc, getBox, visible, reach } from './activity.js';
import { saveCell, saveNote } from './activity-grading.js';
import { reviewQueue, needsLook, nextOpen } from './activity-board.js';
import { TYPES, MARK } from './activity-ai.js';
import { graded } from './activity-docs.js';

const TYPE_NAME = Object.fromEntries(TYPES);
const OBJ = ['choice', 'match', 'short'];
/* list: 화면을 연 때의 확인할 칸(정한 칸도 목록에 남아 「정함」으로), cur: 지금 칸, end: 다 확인함, focus: 다시 그린 뒤 초점 */
const RV = { id: null, list: [], cur: 0, end: false, focus: null };

const studentOf = (a, q) => a.students.find(s => s.no === q.no && !s.skip);
const cellOf = (a, q) => { const s = studentOf(a, q); return (s && s.marks && s.marks[q.item]) || null; };
const itemOf = (a, q) => a.items.find(it => it.no === q.item);
const isOpen = (a, q) => needsLook(cellOf(a, q));
const josa = m => (m === 'n' ? '으로' : '로'); // 안 함으로 · ○로

function open(a) {
  RV.id = a.id; RV.list = reviewQueue(a); RV.cur = 0; RV.end = !RV.list.length; RV.focus = 'card';
  A.view = 'review';
}
/* 채점이 이어지며 새로 생긴 확인할 칸은 뒤에 붙이고, 학생·문항이 없어진 칸(번호를 다시 매김 등)은 뺌 */
function sync(a) {
  if (RV.id !== a.id) { open(a); return; }
  const key = q => q.no + '|' + q.item, have = new Set(RV.list.map(key));
  const curKey = RV.list[RV.cur] && key(RV.list[RV.cur]);
  RV.list = [...RV.list, ...reviewQueue(a).filter(q => !have.has(key(q)))].filter(q => studentOf(a, q) && itemOf(a, q));
  const i = RV.list.findIndex(q => key(q) === curKey);
  RV.cur = i >= 0 ? i : Math.min(RV.cur, Math.max(0, RV.list.length - 1));
  if (!RV.list.length) RV.end = true;
}

/* ---------- 그리기 ---------- */
function listHTML(a, openNow) {
  const items = RV.list.map((q, i) => `<button type="button" class="ev-rv-item${openNow[i] ? '' : ' done'}" data-rv-go="${i}" aria-current="${!RV.end && i === RV.cur}">
      <span><b>${q.no}번</b> · ${q.item}번 문항</span><span class="sr-only">${openNow[i] ? ' (아직)' : ' (정함)'}</span></button>`).join('');
  return `<aside class="ev-rv-list ac-rv-list" aria-label="확인할 칸">
      <div class="ev-rv-lh"><span>확인할 칸</span><span class="ev-num ac-turn-ink">${RV.list.length ? `${RV.end ? RV.list.length : RV.cur + 1} / ${RV.list.length}` : '0'}</span></div>
      <div class="ac-rv-items">${items}</div>
      <div class="ac-rv-sum"><span>쌤비서가 채점</span><span class="ev-num">${graded(a).length}</span></div>
      <button class="btn" type="button" data-ac="rvGrid">채점 표 훑어보기</button>
    </aside>`;
}
function optsHTML(it, c, ai, decided) {
  const obj = OBJ.includes(it.type) && String(it.answer || '').trim();
  const desc = { o: obj ? '정답과 같아요' : it.ok || '기준을 다 담았어요', t: it.part || '기준의 일부만 담았어요', x: obj ? '정답과 달라요' : '기준과 달라요', n: '비었어요' };
  const name = { o: '잘함', t: '조금 더', x: '틀림', n: '안 함' };
  return Object.keys(MARK).map(m => `<button type="button" class="ev-rv-opt${m === ai ? ' ai' : ''}" data-rv-mark="${m}" aria-pressed="${m === decided}">
      <span class="ev-num" aria-hidden="true">${m === 'n' ? '–' : MARK[m]}</span><span class="ac-rv-opt-t"><span><b>${name[m]}</b>${m === ai ? ' <span class="ac-rv-ai">쌤비서 생각</span>' : ''}</span><span class="ev-sub">${esc(desc[m])}</span></span></button>`).join('');
}
function itemHTML(a, q, openNow) {
  const s = studentOf(a, q), it = itemOf(a, q), c = cellOf(a, q) || {};
  const ai = c.manual ? c.ai0 || '' : c.mark || ''; // 쌤비서(AI·앱 판정) 값
  const decided = needsLook(c) ? '' : c.manual ? c.mark || '' : '';
  const rest = openNow.map((o, i) => o && i !== RV.cur), nx = nextOpen(rest, RV.cur), nq = nx >= 0 ? RV.list[nx] : null;
  const why = c.why ? esc(c.why) : c.mark ? '쌤비서가 이 칸은 확신하지 못했어요.' : '쌤비서가 이 칸의 답을 읽지 못했어요.';
  const answer = OBJ.includes(it.type) ? '정답' : '예시 답안';
  return `<div class="ev-rv-main">
      <article class="ev-card ac-rv-card" tabindex="-1" aria-labelledby="acRvQ">
        <div class="ev-rv-q"><span class="ev-sub">${q.no}번 학생 · ${it.no}번 문항 · ${esc(TYPE_NAME[it.type] || '쓰기')}</span><p class="ac-rv-ask" id="acRvQ">${esc(it.ask || '(묻는 말 없음)')}</p></div>
        <div class="ev-rv-answer" aria-label="${q.no}번이 쓴 답(읽은 글)">${String(c.read || '').trim() ? esc(c.read) : '<span class="ev-sub">읽은 답이 없어요</span>'}</div>
        <label class="yp-f ac-rv-read"><span class="lab">읽은 답이 다르면 고쳐 주세요(정할 때 같이 저장해요)</span><input class="field" id="acRvRead" value="${esc(c.read || '')}" autocomplete="off"></label>
      </article>
    </div>
    <aside class="ev-rv-side" aria-label="기준과 쌤비서 생각">
      <section class="ev-card ac-rv-crit" aria-labelledby="acRvCritH"><h3 class="ev-h" id="acRvCritH">채점 기준</h3>
        <p class="ac-rv-ans"><span class="ev-sub">${answer}</span> ${esc(it.answer || '-')}</p>
        <div class="ac-rv-opts" role="group" aria-label="표시 정하기 — 누르면 정하고 다음 칸으로">${optsHTML(it, c, ai, decided)}</div>
      </section>
      <section class="ev-ink-card ac-rv-why" aria-label="왜 미뤘나요"><span class="ev-sub">왜 미뤘나요</span>
        <p class="ev-rv-why">${why}</p>
        ${c.rv ? `<p class="ev-rv-why">검토 AI는 <b>${esc(MARK[c.rv.mark] || '-')}</b>${josa(c.rv.mark)} 봤어요${c.rv.why ? ` · ${esc(c.rv.why)}` : ''}</p>` : ''}
        <div class="row ac-rv-acts">${ai ? `<button type="button" class="ev-turn-btn" data-rv-mark="${ai}">${MARK[ai]}${josa(ai)} 정하기</button>` : ''}${c.rv && c.rv.mark !== ai ? `<button type="button" class="btn" data-rv-mark="${c.rv.mark}">검토 AI 생각 ${MARK[c.rv.mark]}${josa(c.rv.mark)}</button>` : ''}</div>
        <span class="ev-rv-keys ac-rv-keys">${nq ? `정하면 다음 칸(${nq.no}번 · ${nq.item}번 문항)으로 넘어가요` : '정하면 확인이 끝나요'} · ← → 로 앞뒤 칸</span>
      </section>
    </aside>
    <section class="ev-card ac-rv-fb" aria-labelledby="acRvFbH"><h3 class="ac-rv-h3" id="acRvFbH">${q.no}번에게 줄 피드백</h3>
      <label class="yp-f"><span class="lab">잘한 점</span><textarea class="field" rows="2" data-rv-note="good">${esc(s.good || '')}</textarea></label>
      <label class="yp-f"><span class="lab">더 해 볼 점</span><textarea class="field" rows="2" data-rv-note="next">${esc(s.next || '')}</textarea></label>
      <span class="ev-sub">이 글은 피드백 쪽지와 교과 평어의 근거로도 모여요.</span>
    </section>`;
}
function doneHTML(total) {
  return `<div class="ev-rv-main ac-rv-wide"><section class="ev-card ac-rv-done" tabindex="-1" aria-labelledby="acRvDoneH">
      <h3 class="ac-rv-title" id="acRvDoneH">${total ? '다 확인했어요' : '확인할 칸이 없어요'}</h3>
      <p class="ev-sub" style="margin:0">${total ? `판단을 미룬 칸 ${total}개를 모두 정했어요. 정한 칸은 채점 표에도 그대로 있어요.` : '쌤비서가 판단을 미룬 칸이 없어요.'}</p>
      <div class="row"><button class="btn primary" type="button" data-ac="rvBack">결과로 가기</button><button class="btn" type="button" data-ac="rvGrid">채점 표 보기</button></div>
    </section></div>`;
}
function html() {
  const a = curAct();
  sync(a);
  const openNow = RV.list.map(q => isOpen(a, q)), left = openNow.filter(Boolean).length;
  const q = RV.list[RV.cur];
  const top = `<div class="un-top"><button class="btn text" type="button" data-ac="rvBack">‹ 결과로</button><b class="un-title">${esc(a.meta.title || '활동지')}</b>${a.meta.subject ? `<span class="muted">${esc(a.meta.subject)}</span>` : ''}</div>
    <div class="ac-rv-head"><div><span class="ev-sub">${esc([a.meta.subject && `${a.meta.subject} 활동지`, `문항 ${a.items.length}개`, `학생 ${graded(a).length}명`].filter(Boolean).join(' · '))}</span><h2 class="ac-rv-title">채점 확인</h2></div>
      <p class="ev-sub ac-rv-say">쌤비서가 ${graded(a).length}명을 채점했어요${left ? ` · <b class="ac-turn-ink">판단을 미룬 칸 ${left}개</b>만 봐 주세요` : ''}</p></div>`;
  return `${top}<div class="ev-rv ac-rv" data-ac-rv role="region" aria-label="채점 확인 — ← → 로 앞뒤 칸">
      ${listHTML(a, openNow)}${RV.end || !q ? doneHTML(RV.list.length) : itemHTML(a, q, openNow)}</div>`;
}
/* ← → : 이 화면(.ac-rv) 안에 초점이 있을 때만 — 화면을 그릴 때마다 새 칸에 붙임(문서 전체에 붙이지 않음). 글을 쓰는 칸에서는 글자 사이를 움직임 */
function onKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || A.view !== 'review') return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  e.preventDefault();
  move(e.key === 'ArrowLeft' ? -1 : 1);
}
function bind(box) {
  const root = box.querySelector('.ac-rv');
  if (root) root.addEventListener('keydown', onKey);
  const f = RV.focus;
  RV.focus = null;
  const el = f && root && root.querySelector('.ac-rv-card, .ac-rv-done');
  if (el) el.focus();
}
registerView('review', { open, html, bind });

/* ---------- 누르기·입력 ---------- */
const mine = e => { const box = getBox(); return box && box.contains(e.target) && visible() && A.view === 'review'; };
function toResults(step) {
  const a = curAct();
  A.view = 'act'; A.step = step || (a ? reach(a) : 5);
  render();
  const box = getBox();
  if (box) box.scrollIntoView({ block: 'start' });
}
function decide(mark) {
  const a = curAct(), q = RV.list[RV.cur];
  if (!a || !q || !MARK[mark]) return;
  const read = getBox().querySelector('#acRvRead');
  if (!saveCell(q.no, q.item, { mark, read: read ? read.value : undefined })) return;
  const a2 = curAct(), nx = nextOpen(RV.list.map(x => isOpen(a2, x)), RV.cur);
  if (nx < 0) RV.end = true; else RV.cur = nx;
  RV.focus = 'card';
  render();
}
function move(d) {
  if (!RV.list.length) return;
  const to = RV.end ? RV.cur : Math.max(0, Math.min(RV.list.length - 1, RV.cur + d));
  if (to === RV.cur && !RV.end) return;
  RV.cur = to; RV.end = false; RV.focus = 'card';
  render();
}
document.addEventListener('click', e => {
  if (!mine(e)) return;
  const go = e.target.closest('[data-rv-go]');
  if (go) { RV.cur = +go.dataset.rvGo; RV.end = false; RV.focus = 'card'; render(); return; }
  const m = e.target.closest('[data-rv-mark]');
  if (m) { decide(m.dataset.rvMark); return; }
  const b = e.target.closest('[data-ac]');
  if (!b) return;
  if (b.dataset.ac === 'rvBack') toResults(0);
  else if (b.dataset.ac === 'rvGrid') toResults(4);
});
document.addEventListener('input', e => {
  if (!mine(e) || !e.target.dataset.rvNote) return;
  const q = RV.list[RV.cur];
  if (q) saveNote(q.no, e.target.dataset.rvNote, e.target.value);
});
