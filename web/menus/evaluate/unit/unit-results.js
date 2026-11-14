/* 단원평가 결과 한 화면 (스펙 2026-11-14-eval-redesign §3-1, 단원평가 탭 첫 화면): 평가 카드 줄 · 학생별 점수 표(100점으로, 흐름 선·평균·수준) ·
   오른쪽 반이 약한 영역 · 도달하지 못한 학생 · 교과 평어로. 번호를 누르면 그 학생의 누적이 그 자리에 펼쳐짐. 교과·학기 거르기, 엑셀·한글 내려받기.
   교과 평어로 넘기기는 [평어 쓰러 가기]로 여는 따로 보기(R.rv 'pyeongeo'). 평가 하나의 「반 약한 부분」은 평가 화면 3단계(unit-grading.js)로 옮김.
   채점을 마친 평가만 모음(채점 중인 평가는 카드 줄에만) */
import { toast, copyText, saveFile } from '../../../core/ui.js';
import * as ai from '../../../core/ai.js';
import { aiRowHTML } from '../../../core/ai-roles.js';
import { exportButton, exportDoc, downloadsButton } from '../../../core/doc-export.js';
import { studentTotal } from './unit-grade.js';
import {
  listTests, loadTests, graded, makeTitle, filterTests, summaryTable, studentHistory, domainStats,
  levelOf, LEVEL_NAME, getPyeongeo, savePyeongeo, contentKey
} from './unit-model.js';
import { tableDoc, tableCsv } from './unit-docs.js';
import { pyeongeoPrompt, normPyeongeo, pyeongeoEvidence, evTitle } from './unit-ai.js';
import { evidenceHTML } from '../../../core/evidence.js';
import { itemName } from './unit-model.js';
import { U, esc, AI_KEY, registerResults, visible, render, refresh, later, editing, getBox, introLine, viewSeg } from './unit.js';
import { scoreTone, dateLabel, cardTitle, colLabel, sparkPath, trendValues, weakAdvice } from './unit-view.js';
import { openWeak } from './unit-grading.js';
import { aiNoteHTML, foldHTML } from '../../../core/ui-parts.js';
import { gapHTML } from './unit-gap-card.js'; // 「도달하지 못한 학생」 카드(스펙 2026-11-13 §2-1): 그 파일이 그리고 듣기도 함

/* rv: 'table'(결과 한 화면) | 'pyeongeo'(교과 평어로 넘기기), stuNo: 누적을 펼친 학생(없으면 null) */
const R = { rv: 'table', subject: '', term: 0, stuNo: null, pySubject: null, pyRun: null };
const pct = r => `${Math.round(r * 100)}%`;
const doneTests = () => listTests().filter(s => s.done);
const loaded = list => loadTests(list);
const inView = () => visible() && U.view === 'results';
const fileName = s => s.replace(/[\\/:*?"<>|]/g, '_');
const copy = async text => toast((await copyText(text)) === false ? '복사하지 못했어요' : '복사했어요');

function filtersHTML(all) {
  const subs = [...new Set(all.map(s => s.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const o = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${esc(l)}</option>`;
  return `<div class="row un-filters" role="group" aria-label="거르기">
    <label class="cls-inline">교과 <select class="field" id="unFSubject">${o('', '전체', R.subject)}${subs.map(s => o(s, s, R.subject)).join('')}</select></label>
    <label class="cls-inline">학기 <select class="field" id="unFTerm">${o(0, '전체', R.term)}${o(1, '1학기', R.term)}${o(2, '2학기', R.term)}</select></label>
  </div>`;
}

/* ---------- 학생별 점수 표(성적 일람표) ---------- */
const cutsNow = () => (R.subject ? getPyeongeo(R.subject).cuts : undefined);
const sparkSVG = vals => {
  const p = sparkPath(vals);
  return p ? `<svg class="un-spark" width="64" height="24" viewBox="0 0 64 24" aria-hidden="true" focusable="false"><path d="${p.d}"/><circle cx="${p.x}" cy="${p.y}" r="2.5"/></svg>` : '';
};
function tableHTML(tests) {
  const tb = summaryTable(tests), n = tb.cols.length + 4;
  const cell = v => (v == null ? '<td class="muted">-</td>' : `<td class="num sc${scoreTone(v) ? ' ' + scoreTone(v) : ''}">${v}</td>`);
  const meta = Object.fromEntries(tests.map(t => [t.id, t.meta]));
  const rows = tb.rows.map(r => {
    const lv = r.avg == null ? '' : levelOf(r.avg, cutsNow()), open = R.stuNo === r.no;
    return `<tr data-no="${r.no}"${lv === 'low' ? ' class="low"' : ''}><th scope="row"><button type="button" class="un-stno" data-stu="${r.no}" aria-expanded="${open}" aria-label="${r.no}번 학생별 누적 ${open ? '접기' : '보기'}">${r.no}</button></th>${tb.cols.map(c => cell(r.cells[c.id])).join('')}<td class="un-trend">${sparkSVG(trendValues(r, tests))}</td><td class="num un-avg">${r.avg ?? '-'}</td><td>${lv ? `<span class="ev-chip${lv === 'low' ? ' turn' : ''}">${LEVEL_NAME[lv]}</span>` : ''}</td></tr>${open ? `<tr class="un-stu-x"><td colspan="${n}">${studentHTML(tests)}</td></tr>` : ''}`;
  }).join('');
  return `<section class="yp-card un-sc" aria-label="학생별 점수">
    <div class="un-sc-h"><h3>학생별 점수</h3><span class="un-legend" aria-hidden="true"><span><i class="sw hi"></i>90점 이상</span><span><i class="sw lo"></i>60점 아래</span></span></div>
    <div class="un-grid-wrap"><table class="un-sumt"><thead><tr><th scope="col">번호</th>${tb.cols.map(c => `<th scope="col" data-col="${esc(c.id)}" title="${esc(c.title)}">${esc(colLabel(meta[c.id]))}</th>`).join('')}<th scope="col">흐름</th><th scope="col">평균</th><th scope="col">수준</th></tr></thead>
    <tbody>${rows}<tr class="avg"><th scope="row">반 평균</th>${tb.cols.map(c => cell(tb.colAvg[c.id])).join('')}<td></td><td></td><td></td></tr></tbody></table></div>
    <p class="ev-sub un-sc-note">100점으로 바꾼 점수예요. 흐름 선은 평가 날짜 차례예요. 번호를 누르면 그 학생의 누적이 펼쳐져요.</p></section>`;
}

/* ---------- 학생별 누적(표 안에 펼침) ---------- */
function studentText(no, h) {
  return [`[단원평가 누적] ${no}번`,
    ...h.rows.map(r => `- ${r.date} ${r.title}: ${r.score}/${r.total} (${r.pct}점, 반 평균 ${r.classAvg}점)`),
    `영역별 정답률: ${h.domains.map(d => `${d.name} ${pct(d.rate)}`).join(', ') || '없음'}`,
    `자주 틀린 평가 내용: ${h.weak.map(w => `${w.content}${w.pages ? `(${w.pages})` : ''}`).join(', ') || '없음'}`].join('\n');
}
function studentHTML(tests) {
  const nos = summaryTable(tests).rows.map(r => r.no);
  const h = studentHistory(tests, R.stuNo);
  return `<div class="un-stu-panel" role="region" aria-label="${R.stuNo}번 학생별 누적">
    <div class="row"><b>${R.stuNo}번 학생별 누적</b><label class="cls-inline">학생 <select class="field" id="unStuNo">${nos.map(n => `<option value="${n}"${n === R.stuNo ? ' selected' : ''}>${n}번</option>`).join('')}</select></label><span class="grow"></span><button class="btn" type="button" data-un="stuCopy">복사</button><button class="btn text" type="button" data-un="stuClose">접기</button></div>
    <div class="un-grid-wrap"><table class="un-hist cls-sum"><thead><tr><th>날짜</th><th>평가</th><th>점수</th><th>100점으로</th><th>반 평균</th></tr></thead>
    <tbody>${h.rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.title)}</td><td class="num">${r.score}/${r.total}</td><td class="num">${r.pct}</td><td class="num">${r.classAvg ?? '-'}</td></tr>`).join('')}</tbody></table></div>
    <h4>영역별 정답률</h4><p style="margin:0">${h.domains.map(d => `<span class="chip">${esc(d.name)} ${pct(d.rate)}</span>`).join(' ') || '<span class="muted">없음</span>'}</p>
    <h4>자주 틀린 평가 내용</h4>${h.weak.length ? `<ol class="un-weaklist">${h.weak.map(w => `<li>${esc(w.content)} <span class="muted">잃은 점수 ${w.lost}${w.pages ? ` · ${esc(w.pages)}` : ''}</span></li>`).join('')}</ol>` : '<p class="muted" style="margin:0">없어요</p>'}
  </div>`;
}

/* ---------- 오른쪽: 반이 약한 영역 · 교과 평어로 ---------- */
function domainHTML(tests) {
  const stats = domainStats(tests), adv = weakAdvice(stats);
  if (!adv) return '<section class="yp-card un-dom-card" aria-label="반이 약한 영역"><h3>반이 약한 영역</h3><p class="ev-sub" style="margin:0">문항에 영역이 적혀 있지 않아요. 답안의 영역 칸을 채우면 여기에 보여요.</p></section>';
  const row = d => { const low = d.name === adv.low, p = Math.round(d.rate * 100); return `<li${low ? ' class="low"' : ''}><span class="un-dom-n">${esc(d.name)}</span><span class="ev-bar${low ? ' turn' : ''}"><i style="width:${p}%"></i></span><span class="ev-num">${p}%</span></li>`; };
  return `<section class="yp-card un-dom-card" aria-label="반이 약한 영역"><h3>반이 약한 영역</h3>
    <ul class="un-dom">${stats.map(row).join('')}</ul><p class="un-dom-line">${esc(adv.line)}</p></section>`;
}
function pyCardHTML(tests) {
  const subs = [...new Set(tests.map(t => t.meta.subject).filter(Boolean))];
  const sub = R.subject || subs[0] || '';
  return `<section class="ev-ink-card un-pycard" aria-label="교과 평어로"><p class="ev-sub">교과 평어로 이어서</p>
    <p class="un-pycard-t">평가 ${tests.length}개의 점수와 잘한·보완할 내용이 학생마다 근거로 모였어요.</p>
    <button class="btn un-on-ink" type="button" data-rv="pyeongeo" data-py-sub="${esc(sub)}">${sub ? `${esc(sub)} ` : ''}평어 쓰러 가기</button></section>`;
}

/* ---------- 평가 카드 줄: 채점을 마친 평가(평균) + 채점 중인 평가(파랑 테두리·막대) — 누르면 그 평가 ---------- */
const live = t => (t.students || []).filter(s => !s.skip);
function cardsHTML(tests) {
  const tb = summaryTable(tests), byId = Object.fromEntries(tests.map(t => [t.id, t]));
  const done = tb.cols.map(c => byId[c.id]).filter(Boolean);
  const run = loaded(filterTests(listTests().filter(s => !s.done), { subject: R.subject, term: R.term }));
  if (!done.length && !run.length) return '';
  const card = (t, on) => {
    const m = t.meta, n = graded(t).length, all = live(t).length, w = all ? Math.round(n / all * 100) : 0;
    const head = `${m.subject ? `${esc(m.subject)} · ` : ''}${on ? '채점 중' : esc(dateLabel(m.date) || m.date || '')}`;
    const body = on ? `<span class="un-tc-bar"><span class="ev-bar"><i style="width:${w}%"></i></span><span class="ev-num">${n} / ${all}</span></span>`
      : `<span class="un-tc-n"><span class="ev-num">${tb.colAvg[t.id] ?? '-'}</span> 평균</span>`;
    return `<button type="button" class="un-tc${on ? ' run' : ''}" data-un-open="${esc(t.id)}" aria-label="${esc(`${makeTitle(m)} ${on ? `채점 중 ${n}/${all}명` : `반 평균 ${tb.colAvg[t.id] ?? '-'}점`} — 열기`)}">
      <span class="un-tc-k">${head}</span><span class="un-tc-t">${esc(cardTitle(m))}</span>${body}</button>`;
  };
  return `<ul class="un-tcards" aria-label="평가">${[...done.map(t => card(t, false)), ...run.map(t => card(t, true))].map(c => `<li>${c}</li>`).join('')}</ul>`;
}

/* ---------- 교과 평어로 넘기기 ---------- */
function pyState(all) {
  const subs = [...new Set(all.map(t => t.meta.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  if (!subs.includes(R.pySubject)) R.pySubject = subs[0] || null;
  const mine = all.filter(t => t.meta.subject === R.pySubject);
  const saved = R.pySubject ? getPyeongeo(R.pySubject) : null;
  const ids = mine.map(t => t.id).filter(id => !(saved && saved.off.includes(id)));
  const chosen = mine.filter(t => ids.includes(t.id));
  const nos = [...new Set(chosen.flatMap(t => graded(t).map(s => s.no)))].sort((a, b) => a - b);
  const students = nos.map(no => {
    const ps = chosen.map(t => { const s = graded(t).find(x => x.no === no); return s ? studentTotal(t, s).pct : null; }).filter(v => v != null);
    const avg = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length * 10) / 10 : 0;
    const sv = (saved && saved.students[no]) || {};
    return { no, avg, level: sv.manual ? sv.level : levelOf(avg, saved ? saved.cuts : undefined), manual: !!sv.manual, text: sv.text || '', ev: sv.ev || null };
  });
  return { subs, mine, saved, ids, chosen, students };
}
// 근거(ev: { list, sentences })는 글이 있을 때만 평어 옆에 둠 — 칸을 비우면 근거도 지움
const pyOut = list => Object.fromEntries(list.map(s => [s.no, { level: s.level, text: s.text, manual: s.manual, ...(s.ev && s.text ? { ev: s.ev } : {}) }]));
function savePy(st, patch = {}) {
  const v = { off: st.mine.map(t => t.id).filter(id => !st.ids.includes(id)), cuts: st.saved.cuts, students: pyOut(st.students), ...patch };
  savePyeongeo(R.pySubject, v);
}
/* 고치는 칸 아래 근거 표시(근거가 없는 옛 평어는 그대로 아무것도 없음) */
const pyEvHTML = s => (s.ev && s.text ? evidenceHTML({ ...s.ev, text: s.text, key: `py:${R.pySubject}:${s.no}` }) : '');
/* 수준 기준(자주 안 바꿈) 요약 한 줄 */
const cutSum = c => `수준 기준(평균 점수): 최상 ${c.top} · 상 ${c.high} · 중 ${c.mid}점 이상`;
function pyHTML(all) {
  const st = pyState(all);
  if (!st.subs.length) return '';
  const c = st.saved.cuts;
  const lvSel = s => `<select class="field" data-pylv="${s.no}" aria-label="${s.no}번 수준">${Object.entries(LEVEL_NAME).map(([k, l]) => `<option value="${k}"${k === s.level ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="yp-card">
    <div class="row"><label class="cls-inline">교과 <select class="field" id="unPySubject">${st.subs.map(s => `<option value="${esc(s)}"${s === R.pySubject ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label></div>
    <div class="un-pytests">${st.mine.map(t => `<label class="cls-inline"><input type="checkbox" data-pytest="${esc(t.id)}"${st.ids.includes(t.id) ? ' checked' : ''}>${esc(makeTitle(t.meta))}</label>`).join('')}</div>
    ${foldHTML({ key: 'unit-cuts', summary: cutSum(c), body: `<div class="row"><span class="muted">수준 기준(평균 점수)</span>
      <label class="cls-inline">최상 <input class="field num" type="number" id="unCutTop" min="0" max="100" value="${c.top}"></label>
      <label class="cls-inline">상 <input class="field num" type="number" id="unCutHigh" min="0" max="100" value="${c.high}"></label>
      <label class="cls-inline">중 <input class="field num" type="number" id="unCutMid" min="0" max="100" value="${c.mid}"></label><span class="muted">이상</span></div>` })}
    ${aiRowHTML('writing')}
    <div class="row"><button class="btn primary" type="button" data-un="pyAI"${R.pyRun ? ' disabled' : ''}>${R.pyRun ? '<span class="spin"></span>쓰는 중…' : '평어 쓰기'}</button><button class="btn" type="button" data-un="pyCopyAll">모두 복사</button><button class="btn text" type="button" data-eval-check="unit">기재 점검</button></div>
    ${aiNoteHTML('AI에는 번호·수준·평가 내용만 보내요. 점수와 이름은 보내지 않아요.')}
    <ul class="un-pys">${st.students.map(s => `<li class="un-py"><div class="row"><b>${s.no}번</b><span class="muted">평균 ${s.avg}점</span>${lvSel(s)}<span class="grow"></span><button class="btn text" type="button" data-un="pyCopy" data-no="${s.no}">복사</button></div>
      <textarea class="field" data-py="${s.no}" rows="2" placeholder="[평어 쓰기]를 누르거나 직접 써요">${esc(s.text)}</textarea><div class="un-pyev" data-pyev="${s.no}">${pyEvHTML(s)}</div></li>`).join('')}</ul>
  </div>`;
}
/* 잘한·보완할 평가 내용: 고른 평가의 문항을 평가 내용으로 묶어 정답률.
   근거(스펙 §5-1)에 쓰게 문항 이름(name: 평가 내용 또는 「3번 문항」)과 그 평가 이름(titles: 「3학년 수학 3단원」)도 */
function contentRates(tests, no) {
  const m = new Map();
  for (const t of tests) {
    const s = graded(t).find(x => x.no === no);
    if (!s) continue;
    for (const it of t.key.items) {
      const k = contentKey(t, it), v = m.get(k) || { pts: 0, max: 0, name: itemName(it), titles: [] }; // 평가 내용이 없는 문항끼리 뭉치지 않게
      v.pts += Number(s.items[it.no] && s.items[it.no].pts) || 0; v.max += Number(it.points) || 0;
      if (!v.titles.includes(evTitle(t.meta))) v.titles.push(evTitle(t.meta));
      m.set(k, v);
    }
  }
  return [...m].filter(([, v]) => v.max).map(([content, v]) => ({ content, rate: v.pts / v.max, name: v.name, titles: v.titles }));
}
async function writePyeongeo() {
  if (R.pyRun) return;
  if (!ai.ready()) { toast(AI_KEY, 5000); return; }
  const subject = R.pySubject, st = pyState(loaded(doneTests()));
  const todo = st.students.filter(s => !s.text);
  if (!todo.length) { toast('모두 썼어요. 다시 쓰려면 칸을 비우고 눌러요.'); return; }
  R.pyRun = subject; refreshView();
  try {
    for (let i = 0; i < todo.length; i += 10) {
      const chunk = todo.slice(i, i + 10).map(s => {
        const rates = contentRates(st.chosen, s.no);
        const good = rates.filter(r => r.rate >= 0.8).sort((a, b) => b.rate - a.rate).slice(0, 3), weak = rates.filter(r => r.rate < 0.6).sort((a, b) => a.rate - b.rate).slice(0, 3);
        // 근거: 잘한 것·보완할 것 평가 내용(화면엔 정답률도, AI에는 평가 이름·평가 내용·잘함/보완 필요만, 이름 없음)
        return { no: s.no, level: s.level, good: good.map(r => r.content), weak: weak.map(r => r.content), ev: pyeongeoEvidence([...good, ...weak]) };
      });
      const lists = Object.fromEntries(chunk.map(c => [c.no, c.ev]));
      const res = normPyeongeo(await ai.generateJSON(pyeongeoPrompt(subject, chunk), { task: 'writing', valid: v => Object.keys(normPyeongeo(v)).length > 0 }), lists);
      const cur = getPyeongeo(subject), now = pyStateFor(subject);
      for (const s of now.students) {
        if (!res[s.no] || s.text) continue;
        s.text = res[s.no].text;
        s.ev = res[s.no].sentences ? { list: lists[s.no], sentences: res[s.no].sentences } : null; // 예전 모양 답이면 근거 없이
      }
      savePyeongeo(subject, { off: now.mine.map(t => t.id).filter(id => !now.ids.includes(id)), cuts: cur.cuts, students: pyOut(now.students) });
    }
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 해 보세요.' : ai.errorMessage(e && e.code, e), 6000);
  } finally { R.pyRun = null; refreshView(); }
}
/* AI가 끝났을 때: 그사이 다른 교과를 봐도 시작한 교과의 상태로 저장 */
function pyStateFor(subject) { const keep = R.pySubject; R.pySubject = subject; const st = pyState(loaded(doneTests())); R.pySubject = keep; return st; }
/* 선생님이 칸에 쓰는 중이면 통째로 다시 그리지 않고(칸을 떠나면 그림), 쓰는 칸 말고 다른 학생 칸과 단추만 바로 바꿈 */
function refreshView() {
  if (!inView()) return;
  refresh();
  if (!editing()) return;
  const box = getBox(), st = pyState(loaded(doneTests()));
  for (const s of st.students) {
    const el = box.querySelector(`textarea[data-py="${s.no}"]`);
    if (el && el !== document.activeElement) { el.value = s.text; const ev = box.querySelector(`[data-pyev="${s.no}"]`); if (ev) ev.innerHTML = pyEvHTML(s); }
  }
  const b = box.querySelector('[data-un="pyAI"]');
  if (b) { b.disabled = !!R.pyRun; b.innerHTML = R.pyRun ? '<span class="spin"></span>쓰는 중…' : '평어 쓰기'; }
}

function headHTML(all, tests) {
  const nos = new Set(tests.flatMap(t => graded(t).map(x => x.no)));
  const where = [R.subject, R.term ? `${R.term}학기` : ''].filter(Boolean).join(' ') || '전체';
  return `<div class="un-rhead"><div class="un-rhead-t"><h2>단원평가</h2>
      <p class="ev-sub">${esc(where)} · 채점 끝난 평가 ${tests.length}개${nos.size ? ` · ${nos.size}명` : ''} · 점수는 모두 100점으로 바꿔 보여요</p></div>
    <div class="un-racts"><button class="btn" type="button" data-un="csv" title="엑셀(CSV)로 내려받기"${tests.length ? '' : ' disabled'}>엑셀로</button>${exportButton('data-un="tableHwpx"', { disabled: !tests.length })}${downloadsButton()}<button class="btn primary" type="button" id="unNew">새 단원평가</button></div></div>
    ${introLine()}<div class="row un-rbar">${viewSeg()}${filtersHTML(all)}</div>`;
}
const EMPTY = '<div class="yp-card"><p class="muted" style="margin:0">마친 단원평가가 없어요. 평가 목록에서 채점을 마치면 여기에 모여요. 바로 보려면 [예시로 채우기].</p></div>';
function html() {
  const all = doneTests(), list = filterTests(all, { subject: R.subject, term: R.term }), tests = loaded(list);
  if (R.rv === 'pyeongeo') {
    const body = all.length ? pyHTML(loaded(all)) : '';
    return `<div class="un-results un-pyview"><div class="un-top"><button class="btn text" type="button" data-rv="table">‹ 결과</button><b class="un-title">교과 평어로 넘기기</b></div>${body || EMPTY}</div>`;
  }
  if (R.stuNo != null && !summaryTable(tests).rows.some(r => r.no === R.stuNo)) R.stuNo = null;
  const main = tests.length ? `<div class="un-rgrid">${tableHTML(tests)}<aside class="un-rside" aria-label="반 전체">${domainHTML(tests)}${gapHTML(tests, { subject: R.subject })}${pyCardHTML(tests)}</aside></div>` : EMPTY;
  return `<div class="un-results un-one">${headHTML(all, tests)}${cardsHTML(tests)}${main}</div>`;
}
registerResults({ html });
/* 평가 › 기재 점검 [그 글로 가기]·평가 화면 단계 줄 「생활기록부」·[평어 초안 미리 보기]: 교과 평어로 넘기기의 그 교과, (번호를 주면) 그 학생 칸에 초점 */
export function showPyeongeo(subject, no) {
  U.view = 'results'; R.rv = 'pyeongeo'; R.pySubject = subject;
  render();
  const el = getBox() && getBox().querySelector(`textarea[data-py="${Number(no)}"]`);
  if (el) { el.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true }); }
}

async function download(kind) {
  const tests = loaded(filterTests(doneTests(), { subject: R.subject, term: R.term }));
  const tb = summaryTable(tests), base = fileName(`${R.subject || '전체'} 단원평가 성적 일람표`);
  try {
    if (kind !== 'csv') { toast(await exportDoc(tableDoc(base, tb), base), 6000); return; }
    toast(`저장했어요: ${await saveFile(base + '.csv', new TextEncoder().encode(tableCsv(tb)), 'text/csv')}`);
  } catch (e) { toast('파일을 저장하지 못했어요', 5000); }
}

document.addEventListener('click', e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inView()) return;
  const v = e.target.closest('[data-rv]');
  if (v) { R.rv = v.dataset.rv; if (v.dataset.pySub) R.pySubject = v.dataset.pySub; render(); if (R.rv === 'table') focusTop(); return; }
  const st = e.target.closest('[data-stu]');
  if (st) { const no = Number(st.dataset.stu); R.stuNo = R.stuNo === no ? null : no; render(); const f = getBox().querySelector(`[data-stu="${no}"]`); if (f) f.focus(); return; }
  const b = e.target.closest('[data-un]'), a = b && b.dataset.un;
  if (a === 'csv' || a === 'tableHwpx') download(a === 'csv' ? 'csv' : 'hwpx');
  else if (a === 'stuClose') { const no = R.stuNo; R.stuNo = null; render(); const f = getBox().querySelector(`[data-stu="${no}"]`); if (f) f.focus(); }
  else if (a === 'stuCopy') copy(studentText(R.stuNo, studentHistory(loaded(filterTests(doneTests(), { subject: R.subject, term: R.term })), R.stuNo)));
  else if (a === 'pyAI') writePyeongeo();
  else if (a === 'pyCopy') { const s = pyState(loaded(doneTests())).students.find(x => x.no === Number(b.dataset.no)); if (s) copy(s.text); }
  else if (a === 'pyCopyAll') copy(pyState(loaded(doneTests())).students.filter(s => s.text).map(s => `${s.no}번\t${s.text}`).join('\n'));
});
document.addEventListener('change', e => {
  const box = getBox();
  if (!box || !box.contains(e.target) || !inView()) return;
  const el = e.target;
  if (el.id === 'unFSubject') { R.subject = el.value; render(); }
  else if (el.id === 'unFTerm') { R.term = Number(el.value); render(); }
  else if (el.id === 'unStuNo') { R.stuNo = Number(el.value); render(); const f = getBox().querySelector('#unStuNo'); if (f) f.focus(); }
  else if (el.id === 'unPySubject') { R.pySubject = el.value; render(); }
  else {
    const st = pyState(loaded(doneTests()));
    if (!R.pySubject) return;
    if (el.dataset.pytest) {
      const ids = new Set(st.ids); if (el.checked) ids.add(el.dataset.pytest); else ids.delete(el.dataset.pytest);
      savePy({ ...st, ids: st.mine.map(t => t.id).filter(id => ids.has(id)) }); render();
    } else if (['unCutTop', 'unCutHigh', 'unCutMid'].includes(el.id)) {
      const k = { unCutTop: 'top', unCutHigh: 'high', unCutMid: 'mid' }[el.id];
      const cuts = { ...st.saved.cuts, [k]: Math.max(0, Math.min(100, Number(el.value) || 0)) };
      const students = st.students.map(s => (s.manual ? s : { ...s, level: levelOf(s.avg, cuts) }));
      savePy({ ...st, students }, { cuts });
      // 학생 수준 칸만 바로 바꾸고, 다시 그리기는 옮겨 간 칸을 떠날 때까지 미룸(Tab으로 기준 세 칸을 차례로 고침)
      for (const s of students) { const sel = box.querySelector(`select[data-pylv="${s.no}"]`); if (sel) sel.value = s.level; }
      const sum = box.querySelector('[data-fold="unit-cuts"] .fold-text'); if (sum) sum.textContent = cutSum(cuts);
      later();
    } else if (el.dataset.pylv) {
      const s = st.students.find(x => x.no === Number(el.dataset.pylv)); if (s) { s.level = el.value; s.manual = true; savePy(st); }
    } else if (el.dataset.py) {
      const s = st.students.find(x => x.no === Number(el.dataset.py));
      if (s) {
        s.text = el.value.trim(); savePy(st);
        // 손으로 고치면 근거 위에 「고친 글」(칸을 비우면 근거도 사라짐)
        const ev = box.querySelector(`[data-pyev="${s.no}"]`); if (ev) ev.innerHTML = pyEvHTML(s);
      }
    }
  }
});

/* 결과의 한 보기를 바로 엶 — 3분 둘러보기(core/tour-steps.js)·평가 단계 줄(unit-flow-card.js)이 부름. 교과·학기 거르기는 전체로.
   rv: 'table'·'gap'(결과 한 화면 — 도달하지 못한 학생은 오른쪽 칸), 'student'(첫 학생 누적을 펼침), 'pyeongeo'(교과 평어로 넘기기),
   'weak'(평가 하나의 반 약한 부분 — 가장 최근 마친 평가의 3단계로 옮김).
   단계 줄은 그 평가의 교과·학기로(마친 평가에 없는 교과면 전체 — 고르기 칸에 없는 교과로 거르지 않게) */
export function showResults(rv, { subject = '', term = 0 } = {}) {
  R.subject = subject && doneTests().some(s => s.subject === subject) ? subject : '';
  R.term = [1, 2].includes(Number(term)) ? Number(term) : 0;
  if (rv === 'weak') {
    const last = filterTests(doneTests(), { subject: R.subject, term: R.term })[0] || doneTests()[0];
    if (last) { openWeak(last.id); return; }
  }
  U.view = 'results';
  R.rv = rv === 'pyeongeo' ? 'pyeongeo' : 'table';
  if (rv === 'student' && R.stuNo == null) { const r = summaryTable(loaded(filterTests(doneTests(), { subject: R.subject, term: R.term }))).rows[0]; R.stuNo = r ? r.no : null; }
  render();
}
/* 결과 한 화면으로 돌아오면(평어 보기 [‹ 결과]) 머리에 초점 */
function focusTop() {
  const box = getBox(), h = box && box.querySelector('.un-rhead h2');
  if (!h) return;
  h.setAttribute('tabindex', '-1');
  h.focus({ preventScroll: true });
}
