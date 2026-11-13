/* 기타 › 다면평가 (스펙 2026-11-11): 내 정보 → [정량평가]·[정성평가] 두 쪽(누른 쪽 기억).
   정량: 학교 기준 양식 넣기(규칙으로 읽고, 못 읽거나 사진·스캔이면 AI, 둘 다 못 하면 예시 기준) → 항목마다 숫자·고르기·횟수·감점 → 점수·소계·총점
         (위에 고정한 점수 요약 줄: 총점·묶음 막대·입력 필요 n곳·내려받기 — 스펙 2026-11-11-ui-refresh §4),
         항목마다 근거자료(이 기기 IndexedDB forms('multi'))와 비고(「문서 제목 [번호, 날짜.]」), 기준 고치기, 양식 모양대로 한글·워드·PDF.
   정성: 기준 양식(정성 기준 + 자기실적평가서) 넣기 → 줄글 → [AI로 넣기](AI가 없으면 [넣기] — 낱말로 나눔) → 입력 필요 칸 채우기 → 교사 자기실적평가서.
   자료는 학년도 키 multi(multi-model.js). 학교·성명은 문서에만, AI로 가는 글은 가림(multi-ai.js maskFor). AI 일은 다른 메뉴로 가도 이어짐 */
import { onEnter, go } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { aiRowHTML } from '../../core/ai-roles.js';
import { toast, saveFile } from '../../core/ui.js';
import { FULL_MSG } from '../../core/store.js';
import { exportButton, exportDoc } from '../../core/doc-export.js';
import { keepFiles } from '../../core/keep-files.js';
import { forms, newFormId, MAX_FORM } from '../../core/form-store.js';
import { readText, fileMessage, isFileCode } from '../../core/files.js';
import { currentYear } from '../../core/years.js';
import { getSchool } from '../../core/settings.js';
import { getMulti, saveMulti, remapQuant, shiftPick, syncNotes, qualParsed, VIEWS, HOMEROOM, HEAD } from './multi-model.js';
import { parseQuantText, defaultQuant, isDefaultQuant, deriveItem, tierOf, itemScore, groupScore, totalScore, allItems, fmtPts, toNum, missingItems, groupBar, countCalc, stepCount } from './multi-quant.js';
import { parseQualText, quantFacts, prefillBasics, buildReport, refreshMissing, normReport, remapFilled, getAt, setAt, mergeReport, missingCount, SELF_LEVELS } from './multi-qual.js';
import { evidenceLabel, composeLabel, isComplete, okEvidenceFile, isImageName, fileBase, EVIDENCE_ACCEPT } from './multi-evidence.js';
import { maskFor, quantPrompt, normQuant, evidencePrompt, normEvidence, qualPrompt, normQualAI, qualFormPrompt, normQualForm } from './multi-ai.js';
import { quantDoc, qualDoc, QUAL_TITLE } from './multi-docs.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const SS = () => window.SSAM || {};
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const NS = 'multi';
const FORM_ACCEPT = '.hwp,.hwpx,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.heic';
const NO_KID = '학생 이름이 보이는 자료는 넣지 마세요.';
const DRAFT_PH = '예) 3학년 담임으로 코스웨어를 써서 수학 기초 학습을 매주 했어요. 학생 상담 25건, 학부모 상담 12건을 했어요. 직무연수 90시간을 이수했어요. 정보부장으로 학교 누리집을 운영했고, 출장 신청 절차를 간소화했어요.';

let box = null, curTab = null, st = null, stale = false;
const busy = { quantForm: false, qualForm: false, fill: false, ev: {} };
const open = { info: null, edit: false, crit: false };
const F = { store: null, told: false };

const visible = () => curTab === 'multi' && box && box.isConnected && !box.hidden && !box.closest('[hidden]');
const load = () => {
  st = getMulti();
  if (!st.info.school && getSchool().name) st.info.school = getSchool().name;
  if (open.info == null) open.info = !st.info.name; // 처음엔 이름이 없을 때만 펼침(그 뒤로는 선생님이 펼친 대로)
};
const save = () => { if (!saveMulti(st)) { toast(FULL_MSG, 7000); return false; } return true; };
const errText = e => (e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : isFileCode(e && e.code) ? fileMessage(e.code) : ai.errorMessage(e && e.code, e));
const typing = () => { const a = document.activeElement; return a && box && box.contains(a) && a.matches('input:not([type="file"]):not([type="checkbox"]), textarea') ? a : null; };
function redraw() { if (!visible()) return; if (typing()) stale = true; else render(); }
async function store() {
  if (!F.store) F.store = await forms(NS);
  if (!F.store.persistent && !F.told) { F.told = true; toast('이 브라우저는 파일을 저장할 수 없어 이번에만 써요.', 6000); }
  return F.store;
}
/* 고를 것 묻기: buttons [[값, 글, 주된 단추?]] */
function ask(title, body, buttons, onPick) {
  if (!SS().openSheet) { onPick(buttons.find(b => b[2])[0]); return; }
  SS().openSheet(`<h3>${esc(title)}</h3><p class="muted" style="margin:0">${esc(body)}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button>${buttons.map(([k, l, p]) => `<button class="btn${p ? ' primary' : ''}" type="button" data-ask="${k}">${esc(l)}</button>`).join('')}</div>`,
  sh => sh.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) { SS().closeSheet(); onPick(b.dataset.ask); } }));
}

/* ---------- 그리기: 내 정보 ---------- */
function infoHTML() {
  const i = st.info;
  const f = (k, label, ph = '') => `<label class="yp-f"><span class="lab">${label}</span><input class="field" data-mi="${k}" value="${esc(i[k])}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
  const sel = (k, label, opts) => `<label class="yp-f"><span class="lab">${label}</span><select class="field" data-mi="${k}"><option value="">고르기</option>${opts.map(o => `<option${i[k] === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  const who = i.school || i.name ? [i.school, i.position, i.name].filter(Boolean).join(' ') : '';
  return `<details class="yp-card mv-info" data-mv-open="info"${open.info ? ' open' : ''}><summary><b>내 정보</b><span class="muted">${esc(who || '학교·성명·담당 업무를 넣어 주세요')}</span></summary>
    <div class="mv-grid">${f('school', '학교', '예) ○○초등학교')}${f('position', '직위', '교사')}${f('name', '성명')}
      ${f('gradeClass', '담당 학년 및 학급', '예) 3-1')}${f('subject', '담당 과목', '예) 담임(전 과목)')}${sel('homeroom', '담임 여부', HOMEROOM)}
      ${f('duty', '담당 업무', '예) 정보부장')}${sel('head', '보직교사 여부', HEAD)}
      <div class="yp-f mv-period"><span class="lab">평가 기간</span><div class="row"><input class="field" type="date" data-mi="from" value="${esc(i.from)}" aria-label="평가 기간 시작"><span class="muted">~</span><input class="field" type="date" data-mi="to" value="${esc(i.to)}" aria-label="평가 기간 끝"></div></div>
      <label class="mv-check"><input type="checkbox" data-mi="short"${i.short ? ' checked' : ''}> 근무 6개월 이하(지표에 「6개월 이하 n점」이 있으면 그 점수)</label></div>
    <p class="muted" style="margin:0">이 기기에만 저장해요. 학교·성명은 문서에만 넣고 AI로 보내지 않아요.</p></details>`;
}

/* ---------- 그리기: 정량 ---------- */
const kindWord = { range: '수 넣기', choice: '고르기', count: '횟수' };
const CLIP_SVG = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.4-8.4a3.7 3.7 0 0 1 5.2 5.2l-8.4 8.4a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>';
/* 칩 속 비고 글 칸의 너비(글자 수, 한글은 두 칸) — field-sizing을 못 쓰는 브라우저용 */
const chipSize = s => Math.max(6, Math.min(48, [...String(s || '')].reduce((n, ch) => n + (/[ㄱ-힣]/.test(ch) ? 2 : 1), 1)));
/* 항목 카드: 고른 지표 ✓ 칩·나머지 회색 칩(범위 항목은 숫자 칸 옆에 어느 구간인지), 횟수 항목 [−] n회 [+]·셈 글,
   값이 빈 항목은 주황 테두리 + 「입력 필요」(paintScores가 칠함), 근거자료는 칩(라벨 + ×) + [+ 근거자료] */
function itemHTML(it) {
  const e = st.quant.values[it.id] || {}, ev = st.quant.evidence[it.id] || [], n = busy.ev[it.id] || 0, edited = !!st.quant.notesEdited[it.id];
  const id = esc(it.id), name = esc(it.name), u = esc(it.unit || '회');
  let input = '';
  if (it.kind === 'range') input = `<label class="mv-num"><input class="field" inputmode="decimal" data-mv-v="${id}" value="${esc(e.v)}" aria-label="${name} 값" autocomplete="off"><span class="muted">${esc(it.unit)}</span></label>`;
  else if (it.kind === 'count') input = `<div class="mv-count" role="group" aria-label="${name} 횟수">
      <button class="mv-step" type="button" data-mv-step="${id}" data-d="-1" aria-label="${name} 1${u} 줄이기">−</button>
      <label class="mv-num"><input class="field" inputmode="numeric" data-mv-count="${id}" value="${esc(e.count)}" aria-label="${name} 횟수" autocomplete="off"><span class="muted">${u}</span></label>
      <button class="mv-step" type="button" data-mv-step="${id}" data-d="1" aria-label="${name} 1${u} 늘리기">+</button></div>
    <span class="mv-calc" data-mv-calc="${id}" aria-live="polite"></span>`;
  else input = `<div class="mv-pick" role="group" aria-label="${name} 지표 고르기">${it.tiers.map((t, k) => `<button type="button" class="mv-tchip" data-mv-pick="${id}" data-i="${k}" aria-pressed="${String(e.v) === String(k)}">${esc(t.label)} · ${fmtPts(t.points)}점</button>`).join('')}</div>`;
  const deduct = it.deduct ? `<label class="mv-num mv-deduct"><span class="muted">${esc(it.deduct.label || '감점')}</span><input class="field" inputmode="decimal" data-mv-deduct="${id}" value="${esc(e.deduct)}" aria-label="${esc(it.deduct.label || '감점')}(${esc(it.deduct.unit)})" autocomplete="off"><span class="muted">${esc(it.deduct.unit)} · ${fmtPts(it.deduct.per)}점씩 감점</span></label>` : '';
  const tiers = it.kind === 'choice' ? '' : `<ul class="mv-tiers" aria-label="${name} 지표">${it.tiers.map((t, k) => `<li class="chip" data-mv-tier="${id}" data-i="${k}">${esc(t.label)} · ${fmtPts(t.points)}점</li>`).join('')}</ul>`;
  return `<li class="mv-item" data-item="${id}">
    <div class="mv-item-h"><b>${name}</b><span class="muted">${it.max != null ? `${fmtPts(it.max)}점` : ''} · ${kindWord[it.kind]}</span><span class="mv-q-need" hidden>입력 필요</span><span class="grow"></span><span class="mv-score" data-mv-score="${id}"></span></div>
    <div class="mv-inputs">${input}${it.kind === 'range' ? tiers : ''}${deduct}</div>${it.kind === 'range' ? '' : tiers}
    ${it.guide ? `<p class="muted mv-guide">증빙: ${esc(it.guide)}</p>` : ''}
    <div class="mv-ev">
      <ul class="mv-ev-list" aria-label="${name} 근거자료">${ev.map(x => `<li class="mv-evchip">
        <button class="mv-evchip-file" type="button" data-mv-evfile="${id}|${esc(x.id)}" title="「${esc(x.name)}」 내려받기" aria-label="「${esc(x.name)}」 파일 내려받기">${CLIP_SVG}</button>
        <input class="mv-evchip-label" data-mv-evlabel="${id}|${esc(x.id)}" value="${esc(x.label)}" size="${chipSize(x.label)}" aria-label="${esc(x.name)} 비고 글" title="${esc(x.label)}" autocomplete="off">
        <button class="mv-evchip-del" type="button" data-mv-evdel="${id}|${esc(x.id)}" aria-label="${esc(x.name)} 빼기">×</button></li>`).join('')}
        <li class="mv-ev-addli"><button class="btn mv-ev-add" type="button" data-mv="evAdd" data-drop-pick data-item="${id}" title="PDF·한글·워드·사진, 5MB까지. ${NO_KID}"${n ? ' disabled' : ''}>${n ? '<span class="spin"></span>읽는 중…' : '+ 근거자료'}</button>
        <input type="file" id="mvEv-${id}" data-mv-evinput="${id}" hidden multiple accept="${EVIDENCE_ACCEPT}"></li></ul>
      <label class="yp-f"><span class="lab">비고${edited ? ' <span class="cls-tag">고친 글</span>' : ''}</span><textarea class="field" data-mv-note="${id}" rows="2" placeholder="근거자료를 넣으면 「• 문서 제목 [번호, 날짜.]」가 들어가요">${esc(st.quant.notes[it.id] || '')}</textarea></label>
      ${edited && ev.length ? `<button class="btn text" type="button" data-mv="noteAuto" data-item="${id}">근거자료로 다시 채우기</button>` : ''}
    </div></li>`;
}
function groupHTML(g) {
  return `<section class="yp-card mv-group" data-group="${esc(g.id)}">
    <div class="cls-card-h"><h3>${esc(g.name)}</h3><span class="mv-sub" data-mv-gsum="${esc(g.id)}"></span></div>
    <ol class="mv-items">${g.items.map(itemHTML).join('')}</ol></section>`;
}
const totalHTML = () => `<div class="mv-total"><span>총점</span><b data-mv-total></b><span class="muted">/ ${fmtPts(st.quant.criteria.total)}점</span>${st.info.short ? '<span class="cls-tag">근무 6개월 이하</span>' : ''}</div>`;
/* 점수 요약 줄(위에 고정): 총점 큰 글씨, 묶음마다 소계 막대(절반 미만이면 주황), 「입력 필요 n곳」(첫 빈 항목으로), [한글로 내려받기] */
function barHTML() {
  const c = st.quant.criteria;
  return `<div class="mv-bar-wrap"><section class="mv-bar" aria-label="점수 요약">
      <div class="mv-bar-top">
        <p class="mv-bar-total"><span class="mv-bar-lab">총점</span><b data-mv-total></b><span class="mv-bar-of">/ ${fmtPts(c.total)}점</span>${st.info.short ? '<span class="cls-tag">6개월 이하</span>' : ''}</p>
        <button class="btn mv-need-go" type="button" data-mv="quantNeed"></button>
        <span class="grow"></span>${exportButton('data-mv="exportQuant"', { cls: 'primary' })}
      </div>
      <ul class="mv-bars" aria-label="묶음 소계">${c.groups.map(g => `<li class="mv-gbar" data-mv-gbar="${esc(g.id)}"><span class="mv-gbar-name" title="${esc(g.name)}">${esc(g.name)}</span>
        <span class="mv-gbar-num"></span><span class="mv-meter" aria-hidden="true"><i></i></span></li>`).join('')}</ul>
    </section></div>`;
}
/* 위 고정은 CSS sticky(#app이 스크롤될 때). 틀이 #app 대신 문서를 스크롤하면(좁은 화면) sticky가 듣지 않으므로
   그때만 요약 줄을 화면 맨 위에 띄우고(fixed) 제자리는 같은 높이로 비워 둠 */
let floatRaf = 0;
function floatBar() {
  floatRaf = 0;
  const wrap = box && box.querySelector('.mv-bar-wrap'), bar = wrap && wrap.firstElementChild;
  if (!bar || (!visible() && !bar.classList.contains('float'))) return;
  const app = document.getElementById('app'), doc = document.scrollingElement || document.documentElement;
  const docScrolls = !!app && app.scrollHeight <= app.clientHeight + 1 && doc.scrollHeight > innerHeight + 1;
  const r = wrap.getBoundingClientRect(), view = wrap.parentElement.getBoundingClientRect();
  const on = visible() && docScrolls && r.top < 0 && view.bottom > bar.offsetHeight + 24;
  bar.classList.toggle('float', on);
  wrap.style.minHeight = on ? `${bar.offsetHeight}px` : '';
  bar.style.left = on ? `${r.left}px` : '';
  bar.style.width = on ? `${r.width}px` : '';
}
const floatSoon = () => { if (!floatRaf) floatRaf = requestAnimationFrame(floatBar); };
addEventListener('scroll', floatSoon, { passive: true });
addEventListener('resize', floatSoon);
function editHTML() {
  const c = st.quant.criteria;
  const inp = (attrs, v, label, cls = '') => `<input class="field${cls}" ${attrs} value="${esc(v)}" aria-label="${esc(label)}" autocomplete="off">`;
  return `<details class="yp-card mv-edit" data-mv-open="edit"${open.edit ? ' open' : ''}><summary>기준 고치기</summary>
    <p class="muted" style="margin:0">고치면 바로 저장돼요. 지표 글에 「22시간 이상」「75시간～89시간」은 수 넣기, 「회당 1점」은 횟수, 「(6개월 이하 4.5점)」은 근무 6개월 이하 점수, 비고에 「월 0.2씩 감점」은 감점 칸이 돼요.</p>
    <label class="yp-f"><span class="lab">제목</span>${inp('data-ce="title"', c.title, '기준 제목')}</label>
    ${c.groups.map((g, gi) => `<fieldset class="mv-eg"><legend class="row">${inp(`data-ce="gname" data-g="${gi}"`, g.name, `${gi + 1}번째 묶음 이름`)}${inp(`data-ce="gmax" data-g="${gi}" inputmode="decimal"`, fmtPts(g.max), `${g.name} 배점`, ' num')}<span class="muted">점</span>
        <button class="btn text" type="button" data-mv="ceDelGroup" data-g="${gi}">묶음 빼기</button></legend>
      ${g.items.map((it, ii) => `<div class="mv-ei"><div class="row">${inp(`data-ce="iname" data-g="${gi}" data-i="${ii}"`, it.name, `${g.name} ${ii + 1}번째 항목 이름`)}${inp(`data-ce="imax" data-g="${gi}" data-i="${ii}" inputmode="decimal"`, fmtPts(it.max), `${it.name} 배점`, ' num')}<span class="muted">점 · ${kindWord[it.kind]}</span>
          <button class="btn text" type="button" data-mv="ceDelItem" data-g="${gi}" data-i="${ii}">항목 빼기</button></div>
        ${it.tiers.map((t, ti) => `<div class="row mv-et">${inp(`data-ce="tlabel" data-g="${gi}" data-i="${ii}" data-t="${ti}"`, t.label, `${it.name} ${ti + 1}번째 지표 글`)}${inp(`data-ce="tpoints" data-g="${gi}" data-i="${ii}" data-t="${ti}" inputmode="decimal"`, fmtPts(t.points), `${it.name} ${ti + 1}번째 지표 점수`, ' num')}<span class="muted">점</span>
          <button class="icon-btn" type="button" data-mv="ceDelTier" data-g="${gi}" data-i="${ii}" data-t="${ti}" aria-label="${esc(it.name)} ${ti + 1}번째 지표 빼기">✕</button></div>`).join('')}
        <div class="row"><button class="btn text" type="button" data-mv="ceAddTier" data-g="${gi}" data-i="${ii}">+ 지표</button></div>
        <label class="yp-f"><span class="lab">증빙 안내·감점(비고)</span>${inp(`data-ce="iguide" data-g="${gi}" data-i="${ii}"`, it.guide, `${it.name} 증빙 안내`)}</label></div>`).join('')}
      <div class="row"><button class="btn" type="button" data-mv="ceAddItem" data-g="${gi}">+ 항목</button></div></fieldset>`).join('')}
    <div class="row"><button class="btn" type="button" data-mv="ceAddGroup">+ 묶음</button></div></details>`;
}
function quantHTML() {
  const q = st.quant, c = q.criteria, dflt = isDefaultQuant(c) && !q.formName;
  return `${barHTML()}
    <section class="yp-card mv-form">
      <div class="cls-card-h"><h3>정량평가 기준</h3><span class="muted">${esc(q.formName ? `「${q.formName}」 · ` : '')}묶음 ${c.groups.length}개 · 항목 ${allItems(c).length}개</span></div>
      ${dflt ? '<p class="banner info"><span class="grow">예시 기준이에요. 학교 기준 양식을 넣어 주세요.</span></p>' : ''}
      <div class="row"><button class="btn" type="button" data-mv="quantForm" data-drop-pick${busy.quantForm ? ' disabled' : ''}>${busy.quantForm ? '<span class="spin"></span>읽는 중…' : '기준 양식 넣기'}</button>
        ${q.formName ? '<button class="btn text" type="button" data-mv="quantFormDel">기준 양식 지우기</button>' : ''}
        <input type="file" id="mvQuantFile" hidden accept="${FORM_ACCEPT}"></div>
      <p class="muted" style="margin:0">한글(.hwp·.hwpx)·PDF·워드 기준 양식은 AI 없이 읽어요. 사진·스캔이거나 규칙으로 못 읽으면 AI가 읽어요(글은 학교·이름을 가려 보내고, 사진·스캔은 그림 그대로 가요).</p>
      <p class="muted" style="margin:0">항목마다 [+ 근거자료]로 공문·이수증 PDF·사진·한글 파일(5MB까지)을 넣으면 비고 칸에 「문서 제목 [번호, 날짜.]」가 들어가요. ${NO_KID}</p>
      ${aiRowHTML('plan')}
    </section>
    ${c.groups.map(groupHTML).join('')}
    ${editHTML()}
    <section class="yp-card mv-sum">${totalHTML()}
      <p class="muted" style="margin:0">근거자료 파일은 이 기기에만 있어요(백업 파일에는 들어가지 않아요). ${NO_KID}</p>
      <div class="row"><span class="grow"></span>${exportButton('data-mv="exportQuant"', { cls: 'primary' })}</div></section>`;
}

/* ---------- 그리기: 정성 ---------- */
const needText = n => (n ? `입력 필요 <b data-mv-needn>${n}</b>곳 — 빨간 「입력 필요」 칸을 채워 주세요.` : '입력 필요한 칸이 없어요.');
const needTag = (r, path) => `<span class="mv-need-tag" data-need="${esc(path)}"${r.missing.some(m => m.path === path) ? '' : ' hidden'}>입력 필요</span>`;
const hintOf = (r, path) => (r.missing.find(m => m.path === path) || {}).hint || '';
/* 좁은 칸의 자리 글: 안내의 「예) …」만(칸 이름이 무엇을 적을지 말해 줌) */
const shortHint = h => { const m = /예\)\s*(.+)$/.exec(h); return m ? `예) ${m[1]}` : h; };
function reportHTML(r, p) {
  const n = missingCount(r);
  const lines = (path, items) => {
    const list = items.length ? items : [''];
    return `<ul class="mv-lines">${list.map((x, k) => `<li><span class="muted">-</span><input class="field" data-mv-line="${esc(path)}" data-k="${k}" value="${esc(x)}" placeholder="${esc(k === 0 ? hintOf(r, path) : '')}" aria-label="${esc(path.split('.').slice(2).join('.'))} ${k + 1}번째 줄" autocomplete="off">
      ${items.length ? `<button class="icon-btn" type="button" data-mv="lineDel" data-path="${esc(path)}" data-k="${k}" aria-label="${k + 1}번째 줄 지우기">✕</button>` : ''}</li>`).join('')}</ul>`;
  };
  return `<p class="banner ${n ? 'warn' : 'ok'} mv-need" data-mv-need><span class="grow">${needText(n)}</span><button class="btn text" type="button" data-mv="needGo"${n ? '' : ' hidden'}>첫 칸으로</button></p>
    <section class="yp-card"><h3>4. 평가자 기초 자료</h3>
      <div class="mv-grid">${p.basics.map(b => { const path = `basics.${b}`; return `<label class="yp-f mv-cell"><span class="lab">${esc(b)} ${needTag(r, path)}</span><input class="field" data-mv-path="${esc(path)}" value="${esc(r.basics[b] || '')}" placeholder="${esc(shortHint(hintOf(r, path)))}" title="${esc(hintOf(r, path))}" autocomplete="off"></label>`; }).join('')}</div></section>
    <section class="yp-card"><h3>5. 자기실적 평가</h3>
      ${r.sections.map((s, k) => `<div class="mv-sec"><h4>${'가나다라마바사'[k] || k + 1}. ${esc(s.name)}</h4>
        ${s.parts.map(part => { const path = `sections.${s.key}.${part.name}`; return `<div class="mv-part mv-cell"><div class="lab">◦ ${esc(/^추진/.test(part.name) ? `${s.name} ${part.name}` : part.name)} ${needTag(r, path)}</div>
          ${lines(path, part.items)}<button class="btn text" type="button" data-mv="lineAdd" data-path="${esc(path)}">+ 줄</button></div>`; }).join('')}</div>`).join('')}</section>
    <section class="yp-card"><h3>자기 평가 종합</h3>
      <ul class="mv-self">${p.self.map(s => { const path = `self.${s.name}`; return `<li><div><b>${esc(s.name)}</b> ${needTag(r, path)}<p class="muted">${esc(s.desc)}</p></div>
        <div class="seg" role="group" aria-label="${esc(s.name)}">${SELF_LEVELS.map(l => `<button type="button" data-mv-self="${esc(s.name)}" data-level="${l}" aria-pressed="${r.self[s.name] === l}">${l}</button>`).join('')}</div></li>`; }).join('')}</ul></section>
    <section class="yp-card"><div class="row"><span class="muted">「${QUAL_TITLE}」 서식으로 내려받아요.</span><span class="grow"></span>${exportButton('data-mv="exportQual"', { cls: 'primary' })}</div></section>`;
}
function qualHTML() {
  const q = st.qual, p = qualParsed(st), ready = ai.ready();
  return `<section class="yp-card mv-form">
      <div class="cls-card-h"><h3>정성평가 기준</h3><span class="muted">${esc(q.formName ? `「${q.formName}」` : '예시 서식(교사 자기실적평가서)')}</span></div>
      ${q.formName ? '' : '<p class="banner info"><span class="grow">예시 서식이에요. 학교 정성평가 기준·자기실적평가서 양식을 넣어 주세요.</span></p>'}
      <div class="row"><button class="btn" type="button" data-mv="qualForm" data-drop-pick${busy.qualForm ? ' disabled' : ''}>${busy.qualForm ? '<span class="spin"></span>읽는 중…' : '기준 양식 넣기'}</button>
        ${q.formName ? '<button class="btn text" type="button" data-mv="qualFormDel">기준 양식 지우기</button>' : ''}
        <input type="file" id="mvQualFile" hidden accept="${FORM_ACCEPT}"></div>
      <details class="mv-crit" data-mv-open="crit"${open.crit ? ' open' : ''}><summary>평가 지표 보기</summary>
        <ul>${p.criteria.map(c => `<li><b>${esc([c.area, c.element].filter(Boolean).join(' › '))}${c.max != null ? ` (${fmtPts(c.max)}점)` : ''}</b><ol>${c.indicators.map(x => `<li>${esc(x)}</li>`).join('')}</ol></li>`).join('')}</ul></details>
    </section>
    <section class="yp-card">
      <label class="yp-f"><span class="lab">올해 한 일을 편하게 적어 주세요</span><textarea class="field" id="mvDraft" rows="7" placeholder="${esc(DRAFT_PH)}">${esc(q.draft)}</textarea></label>
      <div class="row"><button class="btn tonal" type="button" data-mv="fill"${busy.fill ? ' disabled' : ''}>${busy.fill ? '<span class="spin"></span>넣는 중…' : ready ? 'AI로 넣기' : '넣기'}</button>
        <span class="muted">${ready ? '학교·이름은 가려서 보내요. 쓴 사실만 칸에 넣고, 모르는 칸은 「입력 필요」로 남겨요.' : 'AI 없이 문장마다 낱말로 영역(학습지도·생활지도·전문성개발·담당 업무)을 나눠요.'}</span></div>
      ${aiRowHTML('writing')}
    </section>
    ${q.report ? reportHTML(q.report, p) : ''}`;
}

function pageHTML() {
  return `<div class="m-page mv-page">
    <div class="m-head"><h2>교사 다면평가</h2><p class="muted">정량평가는 항목마다 숫자를 넣으면 점수가 바로 계산되고, 정성평가는 줄글로 쓰면 자기실적평가서 칸에 나눠 넣어요. 학교 기준 양식을 넣으면 그 항목·칸 그대로 문서를 만들어요.</p></div>
    ${infoHTML()}
    <div class="seg mv-views" role="group" aria-label="평가 고르기">${VIEWS.map(v => `<button type="button" data-mv-view="${v}" aria-pressed="${st.view === v}">${v === 'quant' ? '정량평가' : '정성평가'}</button>`).join('')}</div>
    <div class="mv-view">${st.view === 'quant' ? quantHTML() : qualHTML()}</div>
  </div>`;
}
/* 점수·소계·총점·고른 지표·입력 필요·묶음 막대만 다시 칠함(칸에 치는 동안 화면을 다시 그리지 않게) */
function paintScores() {
  if (!box || st.view !== 'quant') return;
  const c = st.quant.criteria, v = st.quant.values, short = !!st.info.short;
  const miss = new Set(missingItems(c, v, short).map(i => i.id));
  for (const it of allItems(c)) {
    const e = v[it.id] || {}, s = itemScore(it, e, short), t = tierOf(it, it.kind === 'count' ? e.count : e.v, short), q = CSS.escape(it.id);
    const el = box.querySelector(`[data-mv-score="${q}"]`);
    if (el) { el.textContent = s == null ? '—' : `${fmtPts(s)}점`; el.classList.toggle('on', s != null); }
    box.querySelectorAll(`[data-mv-tier="${q}"]`).forEach(x => x.classList.toggle('on', !!t && +x.dataset.i === t.index));
    const li = box.querySelector(`.mv-item[data-item="${q}"]`);
    if (li) { li.classList.toggle('need', miss.has(it.id)); const tag = li.querySelector('.mv-q-need'); if (tag) tag.hidden = !miss.has(it.id); }
    const calc = it.kind === 'count' && box.querySelector(`[data-mv-calc="${q}"]`);
    if (calc) calc.textContent = countCalc(it, e.count);
  }
  for (const g of c.groups) {
    const el = box.querySelector(`[data-mv-gsum="${CSS.escape(g.id)}"]`);
    if (el) el.textContent = `소계 ${fmtPts(groupScore(g, v, short)) || '—'} / ${fmtPts(g.max)}점`;
    const bar = box.querySelector(`[data-mv-gbar="${CSS.escape(g.id)}"]`);
    if (!bar) continue;
    const b = groupBar(g, v, short);
    bar.classList.toggle('low', b.low);
    bar.querySelector('.mv-meter i').style.width = `${b.pct}%`;
    bar.querySelector('.mv-gbar-num').innerHTML = `${b.score == null ? '—' : fmtPts(b.score)} / ${fmtPts(b.max)}${b.low ? '<span class="sr"> (절반 미만)</span>' : ''}`;
  }
  const tt = totalScore(c, v, short);
  box.querySelectorAll('[data-mv-total]').forEach(x => { x.textContent = tt == null ? '—' : fmtPts(tt); });
  const nb = box.querySelector('[data-mv="quantNeed"]');
  if (nb) {
    nb.innerHTML = miss.size ? `<span>입력 필요 <b data-mv-qneed>${miss.size}</b>곳</span>` : '<span><span aria-hidden="true">✓ </span>모두 넣었어요</span>';
    nb.classList.toggle('warn', !!miss.size);
    nb.disabled = !miss.size;
  }
}
/* 「입력 필요 n곳」: 첫 빈 항목으로 스크롤·초점 */
function goNeed() {
  const it = missingItems(st.quant.criteria, st.quant.values, !!st.info.short)[0];
  const li = it && box.querySelector(`.mv-item[data-item="${CSS.escape(it.id)}"]`);
  const f = li && (li.querySelector('.mv-inputs input') || li.querySelector('.mv-inputs button'));
  if (!f) return;
  li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  f.focus({ preventScroll: true });
}
/* 입력 필요 표시·띠만 다시 칠함 */
function paintNeed() {
  const r = st.qual.report;
  if (!box || !r) return;
  box.querySelectorAll('[data-need]').forEach(x => { x.hidden = !r.missing.some(m => m.path === x.dataset.need); });
  const n = missingCount(r), band = box.querySelector('[data-mv-need]');
  if (!band) return;
  band.classList.toggle('warn', !!n); band.classList.toggle('ok', !n);
  band.querySelector('.grow').innerHTML = needText(n);
  const b = band.querySelector('[data-mv="needGo"]');
  if (b) b.hidden = !n;
}
/* 다시 그린 뒤 초점을 돌려 둘 곳 */
function focusSel(a) {
  if (!a || !box.contains(a)) return '';
  if (a.id && !/^mv(?:Ev-|QuantFile|QualFile)/.test(a.id)) return `#${CSS.escape(a.id)}`;
  const at = [...a.attributes].filter(x => x.name.startsWith('data-') && !x.name.startsWith('data-exp') && !x.name.startsWith('data-ai')).map(x => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  return at ? a.tagName.toLowerCase() + at : '';
}
export function render() {
  if (!visible() || !st) return;
  stale = false;
  const sel = focusSel(document.activeElement);
  keepFiles(box, () => { box.innerHTML = pageHTML(); });
  if (sel) { const n = box.querySelector(sel); if (n && !n.disabled) n.focus({ preventScroll: true }); }
  paintScores();
  floatBar();
}

/* ---------- 파일 읽기 ---------- */
const isImage = f => isImageName(f && f.name) || /^image\//.test((f && f.type) || '');
/* 글(없으면 ''), 스캔 PDF는 '' */
async function textOf(file) {
  if (isImage(file)) return '';
  try { return await readText(file); } catch (e) { if (e && e.code === 'PDF_NO_TEXT') return ''; throw e; }
}
async function imagesOf(file, n) {
  if (!SS().files || !SS().files.toImages) throw { code: 'READ_FAILED' };
  return (await SS().files.toImages(file)).slice(0, n);
}
async function keepForm(file, kind) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length > MAX_FORM) return '';
  const id = newFormId();
  try { await (await store()).put({ id, name: file.name, kind, type: file.type || '', bytes, savedAt: Date.now() }); return id; } catch (e) { return ''; }
}
async function dropFile(id) { if (!id) return; try { await (await store()).del(id); } catch (e) {} }

/* ---------- 정량 기준 양식 ---------- */
async function addQuantForm(file) {
  if (busy.quantForm) return;
  if (isImage(file) && !ai.ready()) { toast('사진·스캔 기준 양식은 AI가 읽어요. 설정 › AI에서 키를 넣거나 한글·PDF 양식을 넣어 주세요.', 7000); return; }
  busy.quantForm = true; redraw();
  try {
    const text = await textOf(file);
    let c = text ? parseQuantText(text) : null, by = '';
    if (!c && ai.ready()) {
      const images = text.trim() ? [] : await imagesOf(file, 3);
      c = normQuant(await ai.generateJSON(quantPrompt(text, st.info, { nImages: images.length }), { images, task: 'plan', valid: o => !!normQuant(o) }));
      by = 'AI가 ';
    }
    if (!c) {
      toast(`기준 양식을 읽지 못했어요. 예시 기준을 그대로 둘게요.${ai.ready() ? '' : ' 설정 › AI에서 키를 넣으면 AI가 읽어요.'} [기준 고치기]에서 항목을 고칠 수 있어요.`, 8000);
      return;
    }
    const apply = async () => {
      const { quant, dropped } = remapQuant(st.quant, c);
      const id = await keepForm(file, 'quant-form');
      await dropFile(st.quant.formId);
      st.quant = { ...quant, formId: id, formName: fileBase(file.name) || '기준 양식' };
      for (const e of dropped) await dropFile(e.fileId);
      if (save()) render();
      toast(`「${st.quant.formName}」 기준을 ${by}읽었어요: 묶음 ${c.groups.length}개 · 항목 ${allItems(c).length}개. 항목·점수를 확인해 주세요.${dropped.length ? ` 맞는 항목이 없는 근거자료 ${dropped.length}개는 지웠어요.` : ''}`, 8000);
    };
    // 새 기준에 같은 항목이 없는 근거자료가 있으면 먼저 물음(지우면 되돌릴 수 없음)
    const lost = lostEvidence(c);
    if (lost.count) ask('근거자료를 지울까요?', `새 기준에는 「${lost.names.join('」·「')}」 항목이 없어 그 근거자료 ${lost.count}개를 지워요. 파일은 다시 넣어야 해요.`, [['go', '지우고 바꾸기', true]], apply);
    else await apply();
  } catch (e) { toast(errText(e), 7000); }
  finally { busy.quantForm = false; redraw(); }
}
/* 기준 c로 바꾸면 옮길 곳이 없는 근거자료: { count, names(항목 이름) } */
function lostEvidence(c) {
  const { dropped } = remapQuant(st.quant, c);
  const ids = new Set(dropped.map(e => e.id));
  const names = allItems(st.quant.criteria).filter(it => (st.quant.evidence[it.id] || []).some(e => ids.has(e.id))).map(it => it.name);
  return { count: dropped.length, names: names.slice(0, 4) };
}
function delQuantForm() {
  const lost = lostEvidence(defaultQuant());
  ask('기준 양식을 지울까요?', `예시 기준으로 돌아가요. 같은 이름 항목의 값·근거자료는 남아요.${lost.count ? ` 예시 기준에 없는 「${lost.names.join('」·「')}」 항목의 근거자료 ${lost.count}개는 지워져요.` : ''}`, [['go', '지우기', true]], async () => {
    await dropFile(st.quant.formId);
    const { quant, dropped } = remapQuant(st.quant, defaultQuant());
    st.quant = { ...quant, formId: '', formName: '' };
    for (const e of dropped) await dropFile(e.fileId);
    if (save()) { render(); toast(`기준 양식을 지웠어요. 예시 기준으로 계산해요.${dropped.length ? ` 맞는 항목이 없는 근거자료 ${dropped.length}개는 뺐어요.` : ''}`); }
  });
}

/* ---------- 근거자료 ---------- */
const itemOf = id => allItems(st.quant.criteria).find(i => i.id === id) || null;
async function addEvidence(itemId, files) {
  const it = itemOf(itemId);
  if (!it) return;
  let added = 0;
  for (const f of files) {
    const bad = okEvidenceFile(f);
    if (bad) { toast(bad === 'size' ? `「${f.name}」은 5MB보다 커서 넣지 못했어요.` : `「${f.name}」은 넣을 수 없는 형식이에요. PDF·한글·워드·사진을 넣어 주세요.`, 6000); continue; }
    busy.ev[itemId] = (busy.ev[itemId] || 0) + 1; redraw();
    try {
      const fileId = newFormId();
      try { await (await store()).put({ id: fileId, name: f.name, kind: 'evidence', type: f.type || '', bytes: new Uint8Array(await f.arrayBuffer()), savedAt: Date.now() }); }
      catch (e) { toast('근거자료를 저장하지 못했어요(저장 공간이 꽉 찼을 수 있어요).', 6000); continue; }
      let text = '';
      try { text = await textOf(f); } catch (e) {}
      const r = evidenceLabel(text, f.name), ev = { id: rid('ev'), fileId, name: f.name, label: r.label, edited: false };
      if (!itemOf(itemId)) { await dropFile(fileId); continue; } // 그사이 기준이 바뀜
      st.quant.evidence[itemId] = [...(st.quant.evidence[itemId] || []), ev];
      syncNotes(st.quant, itemId); save(); redraw(); added++;
      if (!isComplete(r) && ai.ready()) await labelByAI(itemId, ev.id, f, text, r, it.name);
    } finally { busy.ev[itemId] = Math.max(0, (busy.ev[itemId] || 1) - 1); redraw(); }
  }
  if (added) toast(`근거자료 ${added}개를 넣었어요. 비고 글을 확인해 주세요. 파일은 이 기기에만 있어요.`, 5000);
}
/* 규칙으로 다 못 찾은 제목·번호·날짜를 AI(plan)에 물음 — 글은 가려서, 글이 없으면(사진·스캔) 그림 */
async function labelByAI(itemId, evId, file, text, r, itemName) {
  try {
    const images = text.trim() ? [] : await imagesOf(file, 2);
    const v = normEvidence(await ai.generateJSON(evidencePrompt({ text, nImages: images.length, item: itemName }, st.info), { images, task: 'plan', valid: isObj }));
    const ev = (st.quant.evidence[itemId] || []).find(x => x.id === evId);
    if (!ev || ev.edited) return;
    ev.label = composeLabel({ title: r.title || v.title, no: r.no || v.no, date: r.date || v.date }, file.name);
    syncNotes(st.quant, itemId); save();
    if (visible() && !typing()) render();
    else if (visible()) { const n = box.querySelector(`[data-mv-evlabel="${CSS.escape(itemId)}|${CSS.escape(evId)}"]`); if (n && n !== document.activeElement) n.value = ev.label; }
  } catch (e) { /* AI가 못 읽어도 규칙·파일 이름 라벨은 그대로 */ }
}
async function delEvidence(itemId, evId) {
  const list = st.quant.evidence[itemId] || [], ev = list.find(x => x.id === evId);
  if (!ev) return;
  st.quant.evidence[itemId] = list.filter(x => x.id !== evId);
  if (!st.quant.evidence[itemId].length) delete st.quant.evidence[itemId];
  syncNotes(st.quant, itemId);
  await dropFile(ev.fileId);
  if (save()) render();
}
async function openEvidence(itemId, evId) {
  const ev = (st.quant.evidence[itemId] || []).find(x => x.id === evId);
  if (!ev) return;
  let rec = null;
  try { rec = await (await store()).get(ev.fileId); } catch (e) {}
  if (!rec || !rec.bytes) { toast('이 기기에 파일이 없어요(다른 기기·지운 파일). 다시 넣어 주세요.', 6000); return; }
  try { await saveFile(rec.name || ev.name, rec.bytes, rec.type || 'application/octet-stream'); } catch (e) { toast('파일을 내려받지 못했어요.', 5000); }
}

/* ---------- 기준 고치기 ---------- */
function editCriteria(el) {
  const c = st.quant.criteria, k = el.dataset.ce, g = c.groups[+el.dataset.g], it = g && g.items[+el.dataset.i];
  const v = el.value;
  if (k === 'title') c.title = v;
  else if (k === 'gname' && g) g.name = v;
  else if (k === 'gmax' && g) { g.max = toNum(v); c.total = c.groups.reduce((s, x) => s + (x.max || 0), 0); }
  else if (it) {
    if (k === 'iname') it.name = v;
    else if (k === 'imax') it.max = toNum(v);
    else if (k === 'iguide') it.guide = v;
    else if (k === 'tlabel' && it.tiers[+el.dataset.t]) it.tiers[+el.dataset.t].label = v;
    else if (k === 'tpoints' && it.tiers[+el.dataset.t]) it.tiers[+el.dataset.t].points = toNum(v) ?? 0; // 비운 점수는 0(점수 없는 지표는 저장할 때 빠짐)
    Object.assign(it, deriveItem(it));
  }
  save(); stale = true;
}
function editAct(a, b) {
  const c = st.quant.criteria, g = c.groups[+b.dataset.g], it = g && g.items[+b.dataset.i];
  if (a === 'ceAddGroup') c.groups.push({ id: rid('g'), name: `${'가나다라마바사아자차카타파하'[c.groups.length] || '새'}. 새 묶음`, max: 10, items: [deriveItem({ id: rid('q'), name: '새 항목', max: 10, tiers: [{ label: '있음', points: 10 }, { label: '없음', points: 0 }] })] });
  else if (a === 'ceDelGroup' && g) {
    if (c.groups.length < 2) { toast('묶음이 하나는 있어야 해요.'); return; }
    dropItems(g.items, () => c.groups.splice(c.groups.indexOf(g), 1)); return;
  }
  else if (a === 'ceAddItem' && g) g.items.push(deriveItem({ id: rid('q'), name: '새 항목', max: 5, tiers: [{ label: '있음', points: 5 }, { label: '없음', points: 0 }] }));
  else if (a === 'ceDelItem' && it) {
    if (g.items.length < 2) { toast('묶음에 항목이 하나는 있어야 해요. 묶음 빼기를 눌러 주세요.'); return; }
    dropItems([it], () => g.items.splice(g.items.indexOf(it), 1)); return;
  }
  else if (a === 'ceAddTier' && it) { it.tiers.push({ label: '새 지표', points: 0 }); Object.assign(it, deriveItem(it)); }
  else if (a === 'ceDelTier' && it) { if (it.tiers.length < 2) { toast('지표가 하나는 있어야 해요.'); return; } it.tiers.splice(+b.dataset.t, 1); shiftPick(st.quant.values, it.id, +b.dataset.t); Object.assign(it, deriveItem(it)); }
  else return;
  c.total = c.groups.reduce((s, x) => s + (x.max || 0), 0);
  if (save()) render();
}

/* 기준 고치기에서 항목·묶음 빼기: 그 항목의 값·비고·근거자료(파일까지)도 지움 — 근거자료가 있으면 먼저 물음 */
function dropItems(items, remove) {
  const n = items.reduce((k, it) => k + (st.quant.evidence[it.id] || []).length, 0);
  const go = async () => {
    for (const it of items) {
      for (const e of st.quant.evidence[it.id] || []) await dropFile(e.fileId);
      for (const k of ['values', 'evidence', 'notes', 'notesEdited']) delete st.quant[k][it.id];
    }
    remove();
    const c = st.quant.criteria;
    c.total = c.groups.reduce((s, x) => s + (x.max || 0), 0);
    if (save()) render();
  };
  if (n) ask('근거자료도 지울까요?', `빼는 항목에 근거자료 ${n}개가 있어요. 함께 지워져요.`, [['go', '빼고 지우기', true]], go);
  else go();
}

/* ---------- 정성 ---------- */
async function addQualForm(file) {
  if (busy.qualForm) return;
  if (isImage(file) && !ai.ready()) { toast('사진·스캔 양식은 AI가 읽어요. 설정 › AI에서 키를 넣거나 한글·PDF 양식을 넣어 주세요.', 7000); return; }
  busy.qualForm = true; redraw();
  try {
    const text = await textOf(file);
    let p = text ? parseQualText(text) : null, by = '';
    const any = x => !!x && (x.read.criteria || x.read.basics || x.read.sections);
    if (!any(p) && ai.ready()) {
      const images = text.trim() ? [] : await imagesOf(file, 3);
      p = normQualForm(await ai.generateJSON(qualFormPrompt({ text: maskFor(text, st.info), nImages: images.length }), { images, task: 'plan', valid: o => !!normQualForm(o) }));
      by = 'AI가 ';
    }
    if (!any(p)) { toast(`기준 양식을 읽지 못했어요. 예시 서식을 그대로 둘게요.${ai.ready() ? '' : ' 사진·스캔은 AI가 읽어요(설정 › AI).'}`, 8000); return; }
    const id = await keepForm(file, 'qual-form');
    await dropFile(st.qual.formId);
    st.qual = { ...st.qual, criteria: p, formId: id, formName: fileBase(file.name) || '기준 양식', filled: remapFilled(st.qual.filled, p) };
    if (st.qual.report) st.qual.report = normReport(st.qual.report, p);
    save();
    const miss = [!p.read.criteria && '평가 지표', !p.read.basics && '기초 자료', !p.read.sections && '자기실적 평가 칸'].filter(Boolean);
    toast(`「${st.qual.formName}」 양식을 ${by}읽었어요: 평가 지표 ${p.criteria.length}개 · 기초 자료 ${p.basics.length}칸 · 영역 ${p.sections.length}개.${miss.length ? ` ${miss.join('·')}은 예시 서식으로 채웠어요.` : ''}`, 8000);
  } catch (e) { toast(errText(e), 7000); }
  finally { busy.qualForm = false; redraw(); }
}
function delQualForm() {
  ask('기준 양식을 지울까요?', '예시 서식(교사 자기실적평가서)으로 돌아가요. 쓴 칸은 같은 이름 칸에 남아요.', [['go', '지우기', true]], async () => {
    await dropFile(st.qual.formId);
    st.qual = { ...st.qual, criteria: null, formId: '', formName: '' };
    st.qual.filled = remapFilled(st.qual.filled, qualParsed(st));
    if (st.qual.report) st.qual.report = normReport(st.qual.report, qualParsed(st));
    if (save()) { render(); toast('기준 양식을 지웠어요. 예시 서식으로 만들어요.'); }
  });
}
function fill() {
  if (busy.fill) return;
  const filled = Object.keys(st.qual.filled).filter(p => getAt(st.qual.report, p) !== undefined);
  if (st.qual.report && filled.length) {
    ask('고친 칸도 새로 넣을까요?', `선생님이 고친 칸이 ${filled.length}곳 있어요.`, [['over', '고친 칸도 바꾸기'], ['keep', '고친 칸은 두기', true]], m => runFill(m === 'keep'));
    return;
  }
  runFill(true);
}
async function runFill(keep) {
  const draft = st.qual.draft.trim(), p = qualParsed(st), facts = quantFacts(st.quant.criteria, st.quant.values), prefill = prefillBasics(p, st.info, facts);
  let next;
  if (!ai.ready() || !draft) {
    next = buildReport({ parsed: p, info: st.info, facts, draft });
    apply(next, keep, p);
    toast(draft ? '문장마다 낱말로 칸에 나눠 넣었어요. 영역이 맞는지 확인하고 「입력 필요」 칸을 채워 주세요.' : '줄글이 비어 있어 기초 자료만 채웠어요. 칸마다 적어 주세요.', 7000);
    return;
  }
  busy.fill = true; redraw();
  try {
    const v = await ai.generateJSON(qualPrompt({ parsed: p, draft, facts, basics: prefill }, st.info), { task: 'writing', valid: o => isObj(o) && (isObj(o.basics) || Array.isArray(o.sections)) });
    next = normQualAI(v, p, { prefill, facts });
    apply(next, keep, p);
    toast(visible() ? 'AI가 칸에 나눠 넣었어요. 내용을 확인하고 「입력 필요」 칸을 채워 주세요.' : '다면평가 정성평가 칸을 AI가 채워 두었어요. 기타 › 다면평가에서 확인해 주세요.', 7000);
  } catch (e) { toast(errText(e), 6000); }
  finally { busy.fill = false; redraw(); }
}
function apply(next, keep, p) {
  const prev = st.qual.report;
  st.qual.report = prev ? mergeReport(prev, next, st.qual.filled, keep, p) : next;
  if (!keep) st.qual.filled = {};
  if (save()) redraw();
}
function editCell(path, value) {
  const r = st.qual.report;
  if (!r) return;
  setAt(r, path, value);
  st.qual.filled[path] = true;
  refreshMissing(r, qualParsed(st));
  save(); paintNeed();
}
function editLine(el) {
  const r = st.qual.report, path = el.dataset.mvLine, k = +el.dataset.k;
  const items = [...(getAt(r, path) || [])];
  while (items.length <= k) items.push('');
  items[k] = el.value;
  editCell(path, items);
}

/* ---------- 내려받기 ---------- */
async function download(doc) {
  try { toast(await exportDoc(doc, doc.title), 6000); } catch (e) { toast('파일을 만들지 못했어요. 다시 눌러 주세요.', 5000); }
}
function exportQuant() { download(quantDoc(st, { year: currentYear(), today: today() })); }
function exportQual() {
  const r = st.qual.report, n = missingCount(r);
  const go = () => download(qualDoc(st, { year: currentYear(), today: today() }));
  if (!r) { ask('아직 칸을 넣지 않았어요', '빈 서식으로 내려받을까요? 줄글을 적고 [넣기]를 누르면 칸이 채워져요.', [['go', '빈 서식 내려받기', true]], go); return; }
  if (n) { ask(`입력 필요 ${n}곳이 남았어요. 그대로 내려받을까요?`, '비어 있는 칸은 빈칸으로 내려받아요.', [['go', '그대로 내려받기', true]], go); return; }
  go();
}

/* ---------- 입력 ---------- */
function onInput(el) {
  if (!st) return;
  if (el.dataset.mi && el.type !== 'checkbox' && el.tagName !== 'SELECT') { st.info[el.dataset.mi] = el.value; save(); return; }
  if (el.dataset.mvV || el.dataset.mvCount || el.dataset.mvDeduct) {
    const id = el.dataset.mvV || el.dataset.mvCount || el.dataset.mvDeduct, k = el.dataset.mvV ? 'v' : el.dataset.mvCount ? 'count' : 'deduct';
    st.quant.values[id] = { v: '', count: '', deduct: '', ...st.quant.values[id], [k]: el.value.trim() };
    save(); paintScores(); return;
  }
  if (el.dataset.mvNote) { st.quant.notes[el.dataset.mvNote] = el.value; st.quant.notesEdited[el.dataset.mvNote] = true; save(); return; }
  if (el.dataset.mvEvlabel) {
    const [itemId, evId] = el.dataset.mvEvlabel.split('|'), ev = (st.quant.evidence[itemId] || []).find(x => x.id === evId);
    if (!ev) return;
    ev.label = el.value; ev.edited = true; syncNotes(st.quant, itemId); save();
    el.size = chipSize(el.value);
    const n = box.querySelector(`[data-mv-note="${CSS.escape(itemId)}"]`);
    if (n && !st.quant.notesEdited[itemId]) n.value = st.quant.notes[itemId] || '';
    return;
  }
  if (el.dataset.ce) { editCriteria(el); return; }
  if (el.id === 'mvDraft') { st.qual.draft = el.value; save(); return; }
  if (el.dataset.mvPath) { editCell(el.dataset.mvPath, el.value); return; }
  if (el.dataset.mvLine) editLine(el);
}
function onChange(el) {
  if (!st) return;
  if (el.dataset.mi && (el.type === 'checkbox' || el.tagName === 'SELECT')) {
    st.info[el.dataset.mi] = el.type === 'checkbox' ? el.checked : el.value;
    if (save()) { if (el.dataset.mi === 'short') render(); }
    return;
  }
  if (el.id === 'mvQuantFile' || el.id === 'mvQualFile') { const f = el.files[0]; el.value = ''; if (f) (el.id === 'mvQuantFile' ? addQuantForm : addQualForm)(f); return; }
  if (el.dataset.mvEvinput) { const fs = [...el.files]; el.value = ''; if (fs.length) addEvidence(el.dataset.mvEvinput, fs); }
}
function onClick(e) {
  const t = e.target;
  const v = t.closest('[data-mv-view]');
  if (v) { if (st.view !== v.dataset.mvView) { st.view = v.dataset.mvView; save(); render(); } return; }
  const pk = t.closest('[data-mv-pick]');
  if (pk) {
    const id = pk.dataset.mvPick, cur = (st.quant.values[id] || {}).v, i = pk.dataset.i;
    st.quant.values[id] = { v: '', count: '', deduct: '', ...st.quant.values[id], v: cur === i ? '' : i };
    save();
    box.querySelectorAll(`[data-mv-pick="${CSS.escape(id)}"]`).forEach(b => b.setAttribute('aria-pressed', String(st.quant.values[id].v === b.dataset.i)));
    paintScores(); return;
  }
  const sp = t.closest('[data-mv-step]');
  if (sp) {
    const id = sp.dataset.mvStep, next = stepCount((st.quant.values[id] || {}).count, +sp.dataset.d);
    st.quant.values[id] = { v: '', count: '', deduct: '', ...st.quant.values[id], count: next };
    save();
    const n = box.querySelector(`[data-mv-count="${CSS.escape(id)}"]`);
    if (n) n.value = next;
    paintScores(); return;
  }
  const sf = t.closest('[data-mv-self]');
  if (sf && st.qual.report) {
    const name = sf.dataset.mvSelf, cur = st.qual.report.self[name], l = sf.dataset.level;
    editCell(`self.${name}`, cur === l ? '' : l);
    box.querySelectorAll(`[data-mv-self="${CSS.escape(name)}"]`).forEach(b => b.setAttribute('aria-pressed', String(st.qual.report.self[name] === b.dataset.level)));
    return;
  }
  const ef = t.closest('[data-mv-evfile]');
  if (ef) { const [a, b] = ef.dataset.mvEvfile.split('|'); openEvidence(a, b); return; }
  const ed = t.closest('[data-mv-evdel]');
  if (ed) { const [a, b] = ed.dataset.mvEvdel.split('|'); delEvidence(a, b); return; }
  const b = t.closest('[data-mv]');
  if (!b) return;
  const a = b.dataset.mv;
  if (a === 'quantForm') box.querySelector('#mvQuantFile').click();
  else if (a === 'quantFormDel') delQuantForm();
  else if (a === 'qualForm') box.querySelector('#mvQualFile').click();
  else if (a === 'qualFormDel') delQualForm();
  else if (a === 'evAdd') { const f = box.querySelector(`#mvEv-${CSS.escape(b.dataset.item)}`); if (f) f.click(); }
  else if (a === 'noteAuto') { delete st.quant.notesEdited[b.dataset.item]; syncNotes(st.quant, b.dataset.item); if (save()) render(); }
  else if (a.startsWith('ce')) editAct(a, b);
  else if (a === 'fill') fill();
  else if (a === 'lineAdd' || a === 'lineDel') {
    const path = b.dataset.path, items = [...(getAt(st.qual.report, path) || [])];
    if (a === 'lineAdd') items.push(''); else items.splice(+b.dataset.k, 1);
    setAt(st.qual.report, path, items); st.qual.filled[path] = true; refreshMissing(st.qual.report, qualParsed(st));
    if (save()) { render(); if (a === 'lineAdd') { const n = box.querySelectorAll(`[data-mv-line="${CSS.escape(path)}"]`); if (n.length) n[n.length - 1].focus(); } }
  } else if (a === 'needGo') {
    const m = (st.qual.report.missing || [])[0], tag = m && box.querySelector(`[data-need="${CSS.escape(m.path)}"]`);
    const cell = tag && tag.closest('.mv-cell, li');
    const f = cell && cell.querySelector('input, button');
    if (f) { f.scrollIntoView({ block: 'center' }); f.focus(); }
  } else if (a === 'quantNeed') goNeed();
  else if (a === 'exportQuant') exportQuant();
  else if (a === 'exportQual') exportQual();
}

const mine = e => box && box.contains(e.target) && visible();
document.addEventListener('input', e => { if (mine(e)) onInput(e.target); });
document.addEventListener('change', e => { if (mine(e)) onChange(e.target); });
document.addEventListener('click', e => { if (mine(e)) onClick(e); });
document.addEventListener('toggle', e => { const d = e.target; if (box && box.contains(d) && d.dataset && d.dataset.mvOpen) open[d.dataset.mvOpen] = d.open; }, true);
document.addEventListener('focusout', e => {
  if (!stale || !box || !box.contains(e.target)) return;
  setTimeout(() => { if (stale && visible() && !typing()) render(); }, 0);
});

/* 다른 곳(채팅 「다면평가」「정성평가」 등)에서 이 탭으로 */
export function openMulti(view) {
  if (!st) load();
  if (VIEWS.includes(view) && st.view !== view) { st.view = view; save(); }
  go('etc', 'multi');
}

onEnter('etc', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'mv-box'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'multi';
  if (box.hidden) return;
  // AI·파일 일이 없을 때만 다시 읽음(학년도를 옮겼을 수 있음). 하는 중이면 지금 자료에 이어서 넣음
  if (!st || !(busy.quantForm || busy.qualForm || busy.fill || Object.values(busy.ev).some(Boolean))) load();
  render();
});
