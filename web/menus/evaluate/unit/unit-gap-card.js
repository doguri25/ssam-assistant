/* 결과 모아 보기 › 「도달하지 못한 학생」 카드 (스펙 2026-11-13-gap-evidence §2-1). unit-results.js의 html()이 gapHTML(tests, { subject })로 부름.
   고른 교과·학기의 다 채점한 단원평가에서 영역 점수율이 기준(기본 60%, 단원평가 설정 unit:set의 gapCut에 기억) 아래인 영역이 있는 학생 →
   체크 → [기초학력에 넣기] → 지금 있는 프로그램 또는 새 프로그램. 학생은 학급 정보(학년·반)와 번호로 만들고 이름 칸은 비움(같은 학생은 겹치지 않음),
   가장 낮은 영역의 점수를 사전 점수로 적어 둠(camp-growth.js). 이 카드의 일은 이 파일의 document 듣기만 함(평어 쪽 코드와 따로) */
import { toast } from '../../../core/ui.js';
import { FULL_MSG } from '../../../core/store.js';
import { goRoute } from '../../../core/brief-data.js';
import { getSet, saveSet, makeTitle } from './unit-model.js';
import { gapStudents, normCut } from './unit-gap.js';
import { getInfo } from '../../class/class-model.js';
import { listCamps, getCamp, newCamp, saveCamp, currentCampId, setCurrentCamp } from '../../class/camp-model.js';
import { addGapStudents } from '../../class/camp-growth.js';
import { U, esc, SS, visible, getBox } from './unit.js';

/* sel: 고른 번호(이 화면에만), tests·subject: 마지막으로 그린 카드의 평가(보이는 것을 넣음) */
const G = { sel: new Set(), tests: [], subject: '' };
const cutNow = () => normCut(getSet().gapCut);
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const listNow = () => gapStudents(G.tests, { cut: cutNow() });

function listHTML(list, cut) {
  if (!list.length) return `<p class="muted" style="margin:0">기준 ${cut}%보다 낮은 영역이 있는 학생이 없어요.</p>`;
  const multi = new Set(list.flatMap(g => g.areas.map(a => a.subject))).size > 1; // 교과가 섞이면 영역 앞에 교과
  const line = g => g.areas.slice(0, 3).map(a => `${multi && a.subject ? `${a.subject} ` : ''}${a.name} ${a.pct}%`).join(' · ');
  const n = list.filter(g => G.sel.has(g.no)).length, all = n === list.length;
  return `<div class="row un-gap-bar"><button class="btn" type="button" data-gap="all" aria-pressed="${all}">${all ? '모두 빼기' : '모두 고르기'}</button>
      <span class="muted" id="unGapN" role="status">${n ? `${n}명 골랐어요` : `${list.length}명이에요`}</span><span class="grow"></span>
      <button class="btn primary" type="button" data-gap="add">기초학력에 넣기</button></div>
    <ul class="un-gaps">${list.map(g => `<li class="un-gap-i" data-gap-no="${g.no}"><label><input type="checkbox" data-gapno="${g.no}"${G.sel.has(g.no) ? ' checked' : ''}>
      <span class="un-gap-t"><b>${g.no}번</b> · <span class="un-gap-a">${esc(line(g))}</span>${g.areas.length > 3 ? ` <span class="muted">외 ${g.areas.length - 3}개</span>` : ''} <span class="muted">(평가 ${g.n}개)</span></span></label></li>`).join('')}</ul>
    <p class="muted" style="margin:0">기초학력에는 번호만 넣고 이름 칸은 비워 둬요. 가장 낮은 영역의 점수를 사전 점수로 적어 둬요.</p>`;
}

/* tests: 결과 화면에서 고른 교과·학기의 다 채점한 평가, subject: 고른 교과(전체면 '') */
export function gapHTML(tests, { subject = '' } = {}) {
  G.tests = tests; G.subject = subject;
  const cut = cutNow(), list = gapStudents(tests, { cut }), nos = new Set(list.map(g => g.no));
  for (const no of [...G.sel]) if (!nos.has(no)) G.sel.delete(no);
  return `<div class="yp-card un-gap">
    <div class="row"><b>도달하지 못한 학생</b><span class="muted">평가 ${tests.length}개의 영역별 점수율로 찾아요</span></div>
    <div class="row"><label class="cls-inline">기준 <input class="field num" type="number" id="unGapCut" min="40" max="90" step="1" value="${cut}" inputmode="numeric">% 아래</label>
      <span class="muted">40~90 사이로 바꿀 수 있어요.</span></div>
    <div class="un-gap-list" id="unGapList">${listHTML(list, cut)}</div>
  </div>`;
}

const mine = e => { const box = getBox(); return !!box && box.contains(e.target) && visible() && U.view === 'results' && !!e.target.closest('.un-gap'); };
function paintList() {
  const el = getBox() && getBox().querySelector('#unGapList');
  if (el) el.innerHTML = listHTML(listNow(), cutNow());
}
function paintCount() {
  const list = listNow(), n = list.filter(g => G.sel.has(g.no)).length, all = n === list.length, box = getBox();
  const s = box.querySelector('#unGapN'), b = box.querySelector('[data-gap="all"]');
  if (s) s.textContent = n ? `${n}명 골랐어요` : `${list.length}명이에요`;
  if (b) { b.textContent = all ? '모두 빼기' : '모두 고르기'; b.setAttribute('aria-pressed', String(all)); }
}

/* ---------- [기초학력에 넣기] ---------- */
function openAdd() {
  const picks = listNow().filter(g => G.sel.has(g.no));
  if (!picks.length) { toast('넣을 학생을 골라 주세요'); return; }
  if (!SS().openSheet) return;
  const camps = listCamps(), cid = currentCampId(), def = camps.some(c => c.id === cid) ? cid : camps[0] ? camps[0].id : '';
  const info = getInfo(), subs = [...new Set(picks.map(g => g.areas[0].subject).filter(Boolean))];
  const subj = G.subject || (subs.length === 1 ? subs[0] : '');
  const dflt = [info.grade && info.room ? `${info.grade}-${info.room}` : '', subj, '기초학력'].filter(Boolean).join(' ');
  const cls = info.grade ? `(${info.grade}학년${info.room ? ` ${info.room}반` : ''})` : '';
  SS().openSheet(`<h3>기초학력에 넣기</h3>
    <p class="muted" style="margin:0">${picks.length}명(${picks.map(g => `${g.no}번`).join(', ')})을 넣을 프로그램을 골라 주세요.</p>
    <div class="un-gap-pick" role="radiogroup" aria-label="넣을 프로그램">
      ${camps.map(c => `<label class="un-gap-opt"><input type="radio" name="unGapTo" value="${esc(c.id)}"${c.id === def ? ' checked' : ''}><span>${esc(c.name || '이름 없는 프로그램')}</span><span class="muted">학생 ${c.students.length}명</span></label>`).join('')}
      <label class="un-gap-opt"><input type="radio" name="unGapTo" value=""${def ? '' : ' checked'}><span>새 프로그램</span></label>
      <label class="yp-f un-gap-new"${def ? ' hidden' : ''}><span class="lab">새 프로그램 이름</span><input class="field" id="unGapName" value="${esc(dflt)}" autocomplete="off"></label>
    </div>
    <p class="muted" style="margin:0">학년·반은 학급 정보${esc(cls)}로 넣고 이름 칸은 비워 둬요. 같은 학년·반·번호 학생이 있으면 그 학생을 써요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" id="unGapOk">넣기</button></div>`, sh => {
    const nameBox = sh.querySelector('.un-gap-new');
    sh.addEventListener('change', e => { if (e.target.name === 'unGapTo') nameBox.hidden = e.target.value !== ''; });
    sh.querySelector('#unGapOk').addEventListener('click', () => {
      const to = (sh.querySelector('input[name="unGapTo"]:checked') || {}).value || '';
      let camp = to ? getCamp(to) : null;
      if (to && !camp) { toast('그 프로그램을 찾지 못했어요. 다시 골라 주세요.'); return; }
      if (!camp) {
        const prev = getCamp(currentCampId()) || listCamps()[0]; // 같은 선생님의 지도교사·결재란·출석 단위·양식은 이어서
        camp = newCamp({ name: sh.querySelector('#unGapName').value.trim() || dflt, target: info.grade ? `${info.grade}학년` : '', subjects: subs, ...(prev ? { teacher: prev.teacher, approval: prev.approval, unit: prev.unit, forms: prev.forms } : {}) });
      }
      const titles = Object.fromEntries(G.tests.map(t => [t.id, makeTitle(t.meta)]));
      const r = addGapStudents(camp, picks, { grade: info.grade, cls: info.room, date: today(), titles });
      const saved = saveCamp(r.camp);
      if (!saved) { toast(FULL_MSG, 7000); return; }
      setCurrentCamp(saved.id);
      const nos = new Set(picks.map(g => g.no)), noName = saved.students.some(s => nos.has(s.no) && !s.name.trim());
      const n = r.added + r.existed, name = saved.name || '이름 없는 프로그램';
      const msg = `${n}명을 「${name}」에 넣었어요${noName ? ' — 이름을 넣어 주세요' : ''}`;
      const more = [r.existed ? `이미 있던 ${r.existed}명은 그 학생을 썼어요.` : '', r.over ? `학생이 60명을 넘어 ${r.over}명은 넣지 못했어요.` : ''].filter(Boolean).join(' ');
      G.sel.clear(); paintList();
      toast(more ? `${msg}. ${more}` : msg, 7000);
      sh.innerHTML = `<h3>기초학력에 넣었어요</h3><p style="margin:0" role="status">${esc(msg)}</p>${more ? `<p class="muted" style="margin:0">${esc(more)}</p>` : ''}
        <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" id="unGapGo">기초학력으로 가기</button></div>`;
      const go = sh.querySelector('#unGapGo');
      go.addEventListener('click', () => { SS().closeSheet(); setCurrentCamp(saved.id); goRoute({ to: 'camp', section: 'info' }); });
      go.focus();
    });
  });
}

document.addEventListener('click', e => {
  if (!mine(e)) return;
  const b = e.target.closest('[data-gap]');
  if (!b) return;
  if (b.dataset.gap === 'all') {
    const list = listNow(), all = list.every(g => G.sel.has(g.no));
    G.sel = all ? new Set() : new Set(list.map(g => g.no));
    paintList();
    const f = getBox().querySelector('[data-gap="all"]'); if (f) f.focus();
  } else if (b.dataset.gap === 'add') openAdd();
});
document.addEventListener('change', e => {
  if (!mine(e)) return;
  const el = e.target;
  if (el.id === 'unGapCut') {
    const cut = normCut(el.value);
    el.value = cut;
    if (cut !== cutNow()) saveSet({ ...getSet(), gapCut: cut });
    paintList(); // 기준 칸은 그대로(초점·Tab 차례를 지킴), 줄만 바꿈
  } else if (el.dataset.gapno) {
    const no = Number(el.dataset.gapno);
    if (el.checked) G.sel.add(no); else G.sel.delete(no);
    paintCount();
  }
});
