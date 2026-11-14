/* 단원평가 채점 확인 — 판단을 미룬 칸만 하나씩 (스펙 2026-11-14-eval-redesign §4). unit.js openReview(id)로 엶(3단계 [확인할 것만 보기]·
   「쌤비서가 찾은 것」 [선생님 차례]·한눈에의 [선생님 차례]).
   - 확인할 칸: 판단을 미룬 칸(flag, 확인 전)·검토 의견이 남은 칸 — 한눈에(eval-stage.js)·unit-view.js confirmList와 같은 규칙. 연 때의 목록을 지키고(정한 칸은 파랑 점),
     그사이 새로 생긴 칸은 끝에 붙임.
   - 왼쪽 목록(번호 · 문항), 가운데 문항(빈 문제지가 있으면 그 물음)과 학생 답(쌤비서가 읽은 글, 스캔이 화면에 남아 있으면 [스캔 원본]),
     오른쪽 채점 기준(정답·채점 기준·배점)·점수 단추(쌤비서 생각 주황)·「왜 미뤘나요」(미룬 까닭·AI 까닭·검토 AI 의견)와 [n점으로 정하기].
   - 저장은 칸 확인 창과 같은 함수(unit-grading.js setCell·pickRv — ok·manual·rv 처리 그대로). 정하면 다음 칸, 다 정하면 「다 확인했어요」.
   - ← → 키: 초점이 이 화면 안에 있을 때만(글 칸 안은 빼고) 앞뒤 칸으로. 학생은 번호로만 보임 */
import { getTest, makeTitle, graded } from './unit-model.js';
import { ITEM_TYPES, gradeCell } from './unit-grade.js';
import { parsePaper } from './unit-key.js';
import { needsConfirm, confirmList, pointChoices } from './unit-view.js';
import { setCell, pickRv, openCellSheet, scanHere } from './unit-grading.js';
import { U, esc, registerReview, render, getBox, openTest, visible } from './unit.js';

const TYPE = Object.fromEntries(ITEM_TYPES);
const WHY = { low: 'AI가 이 답을 확신하지 못했어요.', differ: '앱과 AI의 판단이 달라요. 앱은 정답표와 글자로 맞춰 봤어요.', similar: '정답과 글자가 달라 AI가 뜻을 보고 판단했어요.', essay: '서술형이라 AI가 점수를 제안했어요.' };
/* id: 보는 평가, keys: 확인할 칸 '번호-문항'(연 때의 차례), at: 보는 칸, fin: 마지막 칸을 정해 「다 확인했어요」를 보임 */
const RV = { id: null, keys: [], at: 0, fin: false };
const keyOf = x => `${x.no}-${x.item}`;
function start(id) {
  const t = getTest(id);
  RV.id = id; RV.keys = t ? confirmList(t).map(keyOf) : []; RV.at = 0; RV.fin = false;
}
function cellOf(t, k) {
  const [no, item] = k.split('-').map(Number), s = graded(t).find(x => x.no === no), it = t.key.items.find(x => x.no === item);
  return { no, item, s, it, c: s && it ? s.items[item] || null : null };
}
const isOpen = (t, k) => { const x = cellOf(t, k); return !!(x.s && x.it && needsConfirm(x.c)); };
/* 빈 문제지의 물음(있으면) — 평가마다 한 번 풂 */
const papers = new Map();
function question(t, no) {
  const text = t.paper && t.paper.text;
  if (!text) return '';
  let q = papers.get(t.id);
  if (!q || q.text !== text) { q = { text, list: parsePaper(text).questions || {} }; papers.set(t.id, q); }
  return String(q.list[no] || '').replace(/\s*\(\s*\)\s*$/, '').trim();
}

function listHTML(t) {
  const g = graded(t).length, done = RV.keys.filter(k => !isOpen(t, k)).length;
  return `<aside class="ev-rv-list" aria-label="확인할 칸">
      <div class="ev-rv-lh"><span>확인할 칸</span><span class="ev-num un-rv-count">${done} / ${RV.keys.length}</span></div>
      <div class="un-rv-items">${RV.keys.map((k, i) => { const [no, item] = k.split('-'), d = !isOpen(t, k);
        return `<button type="button" class="ev-rv-item${d ? ' done' : ''}" data-rvw-go="${i}"${i === RV.at && !RV.fin ? ' aria-current="true"' : ''} aria-label="${no}번 · ${item}번 문항${d ? ' · 정했어요' : ' · 확인할 칸'}"><span><b>${no}번</b> · ${item}번 문항</span></button>`; }).join('')}</div>
      <div class="ev-rv-lh un-rv-ai"><span class="ev-sub">쌤비서가 채점한 학생</span><span class="ev-num">${g}명</span></div>
      <button class="btn" type="button" data-rvw="map">표로 모두 보기</button>
    </aside>`;
}
function finHTML(t) {
  const none = !RV.keys.length;
  return `<div class="ev-rv-main"><section class="yp-card un-rv-fin" aria-live="polite"><h3 tabindex="-1">${none ? '확인할 칸이 없어요' : '다 확인했어요'}</h3>
      <p class="ev-sub" style="margin:0">${none ? '쌤비서가 판단을 미룬 칸이 없어요.' : `판단을 미룬 칸 ${RV.keys.length}개를 모두 정했어요.`}${t.done ? '' : ' 채점을 다 했으면 [채점 마치기]를 눌러 결과에 모아요.'}</p>
      <div class="row"><button class="btn primary" type="button" data-rvw="map">결과로 가기</button></div></section></div>`;
}
function mainHTML(t, x) {
  const { no, item, it, c } = x, full = Number(it.points) || 0, q = question(t, item), scan = scanHere(t.id, no);
  return `<div class="ev-rv-main">
    <article class="yp-card un-rv-card" aria-label="${no}번의 답">
      <div class="ev-rv-q"><div class="un-rv-qh"><p class="ev-sub">${item}번 문항 · ${full}점 · ${esc(TYPE[it.type] || '')}</p>
        ${scan ? `<button class="btn" type="button" data-rvw="scan">스캔 원본</button>` : ''}</div>
        <p class="un-rv-qt">${esc(q || it.content || `${item}번 문항`)}</p>${q && it.content ? `<p class="ev-sub">평가 내용: ${esc(it.content)}</p>` : ''}</div>
      <p class="ev-sub un-rv-lab">${no}번이 쓴 답 · 쌤비서가 읽은 글</p>
      <div class="ev-rv-answer">${c && c.read ? esc(c.read) : '<span class="muted">(빈칸)</span>'}</div>
      ${scan ? '' : '<p class="ev-sub un-rv-noscan">스캔 그림은 저장하지 않아서 지금은 볼 수 없어요. 읽은 글이 틀렸으면 [고쳐 쓰기]로 고쳐요.</p>'}
      <div class="row"><button class="btn text" type="button" data-rvw="scan">${scan ? '답 고쳐 쓰기·자세히' : '고쳐 쓰기'}</button></div>
    </article>
    ${whyHTML(t, x)}
    <p class="ev-rv-keys">← → 키로 앞뒤 칸으로 가요(이 화면 안에서). 정하면 다음 칸으로 넘어가요.</p>
  </div>`;
}
function sideHTML(t, x) {
  const { it, c } = x, full = Number(it.points) || 0, open = needsConfirm(c);
  const choices = pointChoices(it, c || { pts: 0 });
  const opt = ch => `<button type="button" class="ev-rv-opt${open && ch.ai ? ' ai' : ''}" data-rvw-pts="${ch.pts}" aria-pressed="${!open && c && c.pts === ch.pts}">
      <span class="ev-num">${ch.pts}</span><span class="un-rv-ol"><b>${esc(ch.label)}</b>${ch.ai ? ' <span class="un-rv-tag">쌤비서 생각</span>' : ''}${ch.rv ? ' <span class="un-rv-tag">검토 AI</span>' : ''}<span class="ev-sub">${ch.pts}점으로 정하기</span></span></button>`;
  return `<aside class="ev-rv-side" aria-label="채점 기준">
    <section class="yp-card un-rv-crit"><h3>채점 기준</h3>
      <p class="un-rv-ans">정답 <b>${esc(it.answer || '(없음)')}</b> · 배점 ${full}점</p>${it.criteria ? `<p class="ev-sub">채점 기준: ${esc(it.criteria)}</p>` : ''}
      <div class="un-rv-opts" role="group" aria-label="점수 고르기">${choices.map(opt).join('')}</div>
      ${it.type === 'essay' || choices.length > 2 ? `<div class="row un-rv-own"><label class="cls-inline">다른 점수 <input class="field num" type="number" id="unRvPts" min="0" max="${full}" value="${c ? c.pts : 0}"> / ${full}점</label><button class="btn" type="button" data-rvw="own">이 점수로</button></div>` : ''}
    </section>
  </aside>`;
}
/* 쌤비서 생각: 미룬 까닭(flag 글)·AI 까닭(why)·검토 AI 의견과 [n점으로 정하기] — 가운데 답 아래(첫 화면에 보이게) */
function whyHTML(t, x) {
  const { it, c } = x, full = Number(it.points) || 0, open = needsConfirm(c), rv = !!(c && c.rv && !c.rv.agree && !c.rv.done);
  const rvPts = rv ? gradeCell(it, c.rv).pts : null, label = v => (v >= full ? '맞음' : v <= 0 ? '틀림' : '부분 점수');
  const why = [c && c.flag && !c.ok ? WHY[c.flag] || '' : '', c && c.why ? `쌤비서: ${c.why}` : '',
    rv ? `검토 AI는 「${c.rv.read || '(빈칸)'}」로 읽고 ${rvPts}점으로 봤어요.${c.rv.why ? ` ${c.rv.why}` : ''}` : ''].filter(Boolean);
  return `<section class="ev-ink-card un-rv-why" aria-label="쌤비서 생각"><p class="ev-sub">${open ? '쌤비서 생각 · 왜 미뤘나요' : '정했어요'}</p>
      <p class="ev-rv-why">${esc(open ? why.join(' ') || '쌤비서가 판단을 미뤘어요.' : `${c.pts}점(${label(c.pts)})으로 정했어요. 오른쪽 다른 점수를 누르면 바꿔요.`)}</p>
      ${open ? `<div class="row"><button class="ev-turn-btn" type="button" data-rvw="accept">${esc(label(c.pts))} ${c.pts}점으로 정하기</button>${rv ? `<button class="btn un-on-ink" type="button" data-rvw="useRv">검토 AI 안 ${rvPts}점으로</button>` : ''}</div>
      <p class="ev-sub">정하면 다음 칸으로 넘어가요</p>` : ''}
    </section>`;
}
function html(t) {
  if (RV.id !== t.id) start(t.id);
  for (const x of confirmList(t)) if (!RV.keys.includes(keyOf(x))) RV.keys.push(keyOf(x)); // 그사이 새로 생긴 칸(채점이 이어짐)
  if (RV.at >= RV.keys.length) RV.at = Math.max(0, RV.keys.length - 1);
  const left = RV.keys.filter(k => isOpen(t, k)).length, g = graded(t).length;
  const x = RV.keys.length ? cellOf(t, RV.keys[RV.at]) : null;
  const fin = !RV.keys.length || (RV.fin && !left) || !x || !x.s || !x.it;
  const head = `<div class="un-top"><button class="btn text" type="button" data-rvw="map">‹ 문항 지도</button><b class="un-title">${esc(makeTitle(t.meta))}</b></div>
    <div class="un-rv-head"><div><p class="ev-sub">단원평가 · ${t.key.items.length}문항 · ${t.students.filter(s => !s.skip).length}명</p><h2>채점 확인</h2></div>
      <p class="un-rv-sum">쌤비서가 ${g}명을 채점했어요 · ${left ? `<b class="un-turn-ink">판단을 미룬 칸 ${left}개</b>만 봐 주세요` : '판단을 미룬 칸을 모두 정했어요'}</p></div>`;
  return `${head}<div class="ev-rv un-rv" id="unRv">${listHTML(t)}${fin ? finHTML(t) : mainHTML(t, x) + sideHTML(t, x)}</div>`;
}

/* ---------- 고르기·옮기기 ---------- */
const box = () => getBox();
function focusNow(what) {
  const b = box();
  if (!b) return;
  const el = what === 'item' ? b.querySelector('.ev-rv-item[aria-current="true"]') : b.querySelector('#unRv [data-rvw="accept"]') || b.querySelector('#unRv .un-rv-fin h3') || b.querySelector('.ev-rv-item[aria-current="true"]');
  if (el) el.focus({ preventScroll: false });
}
/* 정한 뒤: 지금 칸 뒤의 확인할 첫 칸(없으면 앞에서부터), 하나도 없으면 「다 확인했어요」 */
function advance(t) {
  const n = RV.keys.length;
  for (let d = 1; d <= n; d++) { const i = (RV.at + d) % n; if (isOpen(t, RV.keys[i])) { RV.at = i; RV.fin = false; return; } }
  RV.fin = true;
}
function decided(ok) {
  const t = getTest(RV.id);
  if (!t) return;
  if (ok) advance(t);
  render();
  focusNow('next');
}
function move(d) {
  if (!RV.keys.length) return;
  RV.at = Math.max(0, Math.min(RV.keys.length - 1, RV.at + d)); RV.fin = false;
  render();
  focusNow('item');
}
function bind(b) {
  const root = b.querySelector('#unRv');
  // ← →: 이 화면 안에 초점이 있을 때만(이 상자에 붙임 — 문서 전체에는 붙이지 않음), 글 칸·숫자 칸 안에서는 글자 사이 옮기기 그대로
  if (root) root.addEventListener('keydown', e => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    move(e.key === 'ArrowLeft' ? -1 : 1);
  });
}
registerReview({ start, html, bind });

document.addEventListener('click', e => {
  const b = box();
  if (!b || !visible() || U.view !== 'review' || !b.contains(e.target)) return;
  const t = getTest(RV.id);
  if (!t) return;
  const go = e.target.closest('[data-rvw-go]');
  if (go) { RV.at = Number(go.dataset.rvwGo); RV.fin = false; render(); focusNow('item'); return; }
  const x = RV.keys.length ? cellOf(t, RV.keys[RV.at]) : null;
  const p = e.target.closest('[data-rvw-pts]');
  if (p && x && x.c) { decided(setCell(t.id, x.no, x.item, { read: x.c.read, pts: Number(p.dataset.rvwPts) })); return; }
  const a = e.target.closest('[data-rvw]'), act = a && a.dataset.rvw;
  if (!act) return;
  if (act === 'map') { openTest(t.id, 3); return; }
  if (!x || !x.c) return;
  if (act === 'accept') {
    const rv = x.c.rv && !x.c.rv.agree && !x.c.rv.done;
    decided(rv ? pickRv(t.id, x.no, x.item, false) : setCell(t.id, x.no, x.item, { read: x.c.read, pts: x.c.pts }));
  } else if (act === 'useRv') decided(pickRv(t.id, x.no, x.item, true));
  else if (act === 'own') {
    const inp = b.querySelector('#unRvPts');
    if (inp) decided(setCell(t.id, x.no, x.item, { read: x.c.read, pts: inp.value }));
  } else if (act === 'scan') openCellSheet(x.no, x.item);
});
