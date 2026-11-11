/* 학급 › 기초학력 캠프 (스펙 2026-11-11): 캠프 목록·정보·학생 → 수업 일정([+ 줄]·[한 날 여러 교시 더하기]·[AI로 만들기]) → 출석 체크 →
   관찰 기록([AI로 쓰기]) → 결과 보고서([AI로 쓰기]) → 문서 4가지 내보내기(문서마다 [양식 넣기]).
   자료는 학년도 키 camp(camp-model.js), 넣은 양식은 IndexedDB forms('camp')(다른 메뉴 양식과 따로).
   AI 일(일정·관찰·보고서·양식 읽기)은 다른 메뉴·캠프로 가도 이어지고, 끝나면 시작한 캠프에 넣음. AI에는 학생 이름 대신 학생A·학생B */
import { onEnter, go } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { aiRowHTML } from '../../core/ai-roles.js';
import { toast, saveFile } from '../../core/ui.js';
import { FULL_MSG } from '../../core/store.js';
import { exportButton, exportDoc, docHtml, getFormat, fileName } from '../../core/doc-export.js';
import { keepFiles } from '../../core/keep-files.js';
import { forms, newFormId, MAX_FORM } from '../../core/form-store.js';
import { readText, fileMessage, isFileCode } from '../../core/files.js';
import { maskContacts } from '../../core/privacy.js';
import { currentYear } from '../../core/years.js';
import * as M from './camp-model.js';
import { campDoc, docTitle, docLabel } from './camp-docs.js';
import { schedulePrompt, normSchedule, buildSessions, obsPrompt, normObs, reportHeads, reportPrompt, normCampReport, layoutPrompt, normLayout } from './camp-ai.js';
import { fillCampForm, REPORT_DEFAULT_MSG, NO_MATCH_MSG } from './camp-form.js';
import { readPlan, planSchedule, planPrompt, planDraft, fillCampInfo } from './camp-plan.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const SS = () => window.SSAM || {};
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const NS = 'camp';
const SECS = [['info', '캠프 정보'], ['sched', '수업 일정'], ['att', '출석 체크'], ['obs', '관찰 기록'], ['report', '결과 보고서'], ['docs', '문서 내보내기']];
const BLANK_FORM = '학생 이름이 적힌 양식은 빈 양식으로 넣어 주세요(사진·스캔은 이름을 가리지 못하고 AI로 가요).';
const MARK_TEXT = { O: '○', X: '/' }, MARK_WORD = { O: '출석', X: '결석' };

let box = null, curTab = null, sec = 'info', attDate = '', attFor = '';
let stale = false; // 칸에 치는 동안 다시 그릴 일이 생김 → 칸을 벗어나면 다시 그림
const busy = {}; // `${캠프 id}:sched|obs|report` → true
const drafts = {}; // 캠프 id → [AI로 만들기] 칸 글(화면에만)
const openPrev = new Set(); // 펼친 미리 보기
const F = { store: null, list: [], adding: {} };

const visible = () => curTab === 'camp' && box && box.isConnected && !box.closest('[hidden]');
function cur() {
  const id = M.currentCampId();
  return (id && M.getCamp(id)) || M.listCamps()[0] || null;
}
const save = c => { const r = M.saveCamp(c); if (!r) toast(FULL_MSG, 7000); return r; };
const errText = e => (e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e));
const typing = () => { const a = document.activeElement; return a && box && box.contains(a) && a.matches('input:not([type="file"]), textarea') ? a : null; };
/* AI 일이 끝났을 때 등: 칸에 치는 중이면 벗어날 때 다시 그림(포커스·한글 조합이 끊기지 않게) */
function redraw() { if (!visible()) return; if (typing()) stale = true; else render(); }

/* ---------- 그리기 ---------- */
const btnBusy = (k, idle, doing) => (busy[k] ? `<span class="spin"></span>${doing}` : idle);
const PLAN_ACCEPT = '.hwp,.hwpx,.pdf,.docx,.txt,.png,.jpg,.jpeg,.webp,.heic';
/* 계획 파일 넣기 줄(캠프 정보·수업 일정에 하나씩) */
const planRow = (c, where) => `<div class="row cp-plan"><button class="btn tonal" type="button" data-cp="planFile" data-where="${where}"${busy[`${c.id}:plan`] ? ' disabled' : ''}>${btnBusy(`${c.id}:plan`, '계획 파일 넣기', '계획서 읽는 중…')}</button>
  <span class="muted">운영 계획서(한글·PDF·워드)를 넣으면 캠프 이름·대상·교과·지도교사(빈 칸만)와 수업 일정(기간·시간·교시${ai.ready() ? '·지도 내용' : ''})을 채워요.</span>
  <input type="file" id="cpPlanFile-${where}" hidden accept="${PLAN_ACCEPT}"></div>`;
function pickHTML(camps, c) {
  return `<div class="row cp-bar">
    ${camps.length ? `<label class="cp-pick"><span class="lab">캠프</span><select class="field" id="cpPick" aria-label="캠프 고르기">${camps.map(x => `<option value="${esc(x.id)}"${c && x.id === c.id ? ' selected' : ''}>${esc(x.name || '이름 없는 캠프')}</option>`).join('')}</select></label>` : ''}
    <button class="btn" type="button" data-cp="new">새 캠프</button>
    ${c ? '<button class="btn text" type="button" data-cp="del">캠프 지우기</button>' : ''}</div>`;
}
function infoHTML(c) {
  const f = (k, label, ph, cls = '') => `<label class="yp-f ${cls}"><span class="lab">${label}</span><input class="field" data-cf="${k}" value="${esc(k === 'subjects' ? c.subjects.join(', ') : k === 'approval' ? c.approval.join(', ') : c[k])}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
  const al = M.aliasMap(c);
  const rows = c.students.map((s, i) => `<tr><td class="muted">${al[s.id]}</td>
    ${['grade', 'cls', 'no'].map(k => `<td><input class="field num" data-st="${esc(s.id)}" data-k="${k}" value="${s[k] == null ? '' : s[k]}" inputmode="numeric" aria-label="${i + 1}번째 학생 ${{ grade: '학년', cls: '반', no: '번호' }[k]}"></td>`).join('')}
    <td><input class="field" data-st="${esc(s.id)}" data-k="name" value="${esc(s.name)}" aria-label="${i + 1}번째 학생 이름" autocomplete="off"></td>
    <td><button class="icon-btn" type="button" data-cp="delStudent" data-id="${esc(s.id)}" aria-label="${i + 1}번째 학생 빼기">×</button></td></tr>`).join('');
  return `<section class="yp-card">
      ${planRow(c, 'info')}
      <div class="cp-grid">${f('name', '캠프 이름', '예) 3-(1) 느린학습자 지원 중점학급 교과캠프', 'wide')}${f('teacher', '지도교사', '선생님 이름(AI로 보내지 않아요)')}${f('target', '대상', '예) 3학년')}
        ${f('subjects', '교과', '예) 국어, 수학')}${f('approval', '결재란 칸', '예) 계(담당자), 교감, 교장')}</div>
      <div class="yp-f"><span class="lab">출석 단위</span><div class="seg" role="group" aria-label="출석 단위">${M.UNITS.map(([k, l]) => `<button type="button" data-unit="${k}" aria-pressed="${c.unit === k}">${l}</button>`).join('')}</div>
        <p class="muted" style="margin:0">${c.unit === 'day' ? '날짜마다 한 번 체크하고 「학생 출석부」(학생 × 날짜)를 만들어요.' : '수업 줄(교시)마다 체크하고 「학생 출석 및 관찰 기록부」(교시 × 학생)를 만들어요.'}</p></div>
    </section>
    <section class="yp-card">
      <div class="cls-card-h"><h3>학생 ${c.students.length}명</h3><button class="btn" type="button" data-cp="addStudent">+ 학생</button></div>
      <p class="muted" style="margin:0">이름은 이 컴퓨터에만 저장해요(백업 파일에는 들어가요). AI에는 이름 대신 학생A·학생B로 보내요.</p>
      ${c.students.length ? `<div class="cp-tbl-wrap"><table class="cp-tbl cp-students"><thead><tr><th scope="col">AI에는</th><th scope="col">학년</th><th scope="col">반</th><th scope="col">번호</th><th scope="col">이름</th><th scope="col"><span class="sr">빼기</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted" style="margin:0">[+ 학생]으로 학생을 넣어 주세요.</p>'}
    </section>`;
}
function schedHTML(c) {
  const k = `${c.id}:sched`;
  const rows = c.sessions.map((s, i) => `<tr><td class="muted num">${i + 1}</td>
    <td><input class="field" type="date" data-ss="${esc(s.id)}" data-k="date" value="${esc(s.date)}" aria-label="${i + 1}번째 줄 날짜"></td>
    <td><input class="field" type="time" data-ss="${esc(s.id)}" data-k="start" value="${esc(s.start)}" aria-label="${i + 1}번째 줄 시작"></td>
    <td><input class="field" type="time" data-ss="${esc(s.id)}" data-k="end" value="${esc(s.end)}" aria-label="${i + 1}번째 줄 끝"></td>
    <td><input class="field" data-ss="${esc(s.id)}" data-k="subject" value="${esc(s.subject)}" list="cpSubs" aria-label="${i + 1}번째 줄 교과" autocomplete="off"></td>
    <td><input class="field wide" data-ss="${esc(s.id)}" data-k="content" value="${esc(s.content)}" aria-label="${i + 1}번째 줄 지도 내용" autocomplete="off"></td>
    <td><button class="icon-btn" type="button" data-cp="delRow" data-id="${esc(s.id)}" aria-label="${i + 1}번째 줄 지우기">×</button></td></tr>`).join('');
  return `<section class="yp-card cp-ai">
      ${planRow(c, 'sched')}
      <label class="yp-f"><span class="lab">AI로 만들기</span><textarea class="field" id="cpSchedPrompt" rows="3" placeholder="예) 1/8~1/23 평일, 9:00~12:40 하루 5교시(40분·쉬는 5분), 국어·수학, 3학년 2명, 아이스크림 홈런">${esc(drafts[c.id] || '')}</textarea></label>
      <div class="row"><button class="btn tonal" type="button" data-cp="schedAi"${busy[k] ? ' disabled' : ''}>${btnBusy(k, 'AI로 만들기', 'AI가 만드는 중…')}</button>
        <span class="muted">날짜는 앱이 세고 주말·공휴일은 빼요. 지도 내용은 AI가 교과·차시에 맞게 써요.</span></div>
      ${aiRowHTML('plan')}
    </section>
    <section class="yp-card">
      <div class="cls-card-h"><h3>수업 일정 <span class="muted cp-count">${c.sessions.length}줄 · 총 ${M.hoursTotal(c)}시간</span></h3>
        <div class="row"><button class="btn" type="button" data-cp="addRow">+ 줄</button><button class="btn" type="button" data-cp="bulk">한 날 여러 교시 더하기</button>${c.sessions.length > 1 ? '<button class="btn text" type="button" data-cp="sortRows">날짜 차례로</button>' : ''}</div></div>
      ${c.unit === 'day' ? '<p class="muted" style="margin:0">날마다 캠프예요. 날짜마다 한 줄(그날 첫 교시 시작~끝 교시 끝)로 넣어 주세요.</p>' : ''}
      ${c.sessions.length ? `<div class="cp-tbl-wrap"><table class="cp-tbl cp-sched"><thead><tr><th scope="col">#</th><th scope="col">날짜</th><th scope="col">시작</th><th scope="col">끝</th><th scope="col">교과</th><th scope="col">지도 내용</th><th scope="col"><span class="sr">지우기</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p class="muted" style="margin:0">아직 수업이 없어요. [+ 줄]·[한 날 여러 교시 더하기]·[AI로 만들기]로 넣어 주세요.</p>'}
      <datalist id="cpSubs">${c.subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    </section>`;
}
function pickAttDate(c) {
  const ds = M.campDates(c);
  if (!ds.length) return '';
  if (attFor === c.id && ds.includes(attDate)) return attDate;
  const t = today();
  return ds.includes(t) ? t : ds.find(d => d > t) || ds[ds.length - 1];
}
function attHTML(c) {
  if (!c.students.length || !c.sessions.length) {
    return `<section class="yp-card"><p style="margin:0">${!c.students.length ? '먼저 캠프 정보에서 학생을 넣어 주세요.' : '먼저 수업 일정을 넣어 주세요.'}</p>
      <div class="row"><button class="btn primary" type="button" data-sec="${!c.students.length ? 'info' : 'sched'}">${!c.students.length ? '캠프 정보로' : '수업 일정으로'}</button></div></section>`;
  }
  attDate = pickAttDate(c); attFor = c.id;
  const ds = M.campDates(c), i = ds.indexOf(attDate), list = M.sessionsOn(c, attDate);
  const cell = (s, st) => { const m = (c.att[s.id] || {})[st.id] || ''; return `<td><button type="button" class="cp-mark${m ? ' m-' + m : ''}" data-att="${esc(s.id)}|${esc(st.id)}" aria-label="${esc(st.name || '학생')} ${esc(M.fmtTime(s) || '수업')} ${MARK_WORD[m] || '표시 안 함'}">${MARK_TEXT[m] || ''}</button></td>`; };
  const stats = c.students.map(st => { const a = M.attStats(c, st.id); return `<tr><th scope="row">${esc(st.name || '이름 없음')}</th><td class="num">${a.present}/${a.total}</td><td class="num">${a.absent}</td><td class="num">${a.rate == null ? '—' : a.rate + '%'}</td></tr>`; }).join('');
  return `<section class="yp-card">
      <div class="cp-day-nav"><button class="icon-btn" type="button" data-cp="attPrev" aria-label="앞 수업 날"${i > 0 ? '' : ' disabled'}>‹</button>
        <select class="field" id="cpAttDate" aria-label="수업 날 고르기">${ds.map(d => `<option value="${d}"${d === attDate ? ' selected' : ''}>${M.fmtDate(d)}</option>`).join('')}</select>
        <button class="icon-btn" type="button" data-cp="attNext" aria-label="다음 수업 날"${i < ds.length - 1 ? '' : ' disabled'}>›</button>
        <button class="btn text" type="button" data-cp="attToday">오늘</button><span class="grow"></span>
        <button class="btn tonal" type="button" data-cp="attAll">모두 출석</button></div>
      <p class="muted" style="margin:0">칸을 누를 때마다 ○(출석) → /(결석) → 빈칸으로 바뀌어요.</p>
      <div class="cp-tbl-wrap"><table class="cp-tbl cp-att"><thead><tr><th scope="col">시간</th><th scope="col">교과</th>${c.students.map(st => `<th scope="col">${esc(st.name || '이름 없음')}</th>`).join('')}</tr></thead>
        <tbody>${list.map(s => `<tr><th scope="row">${esc(M.fmtTime(s) || '—')}</th><td>${esc(s.subject)}</td>${c.students.map(st => cell(s, st)).join('')}</tr>`).join('')}</tbody></table></div>
    </section>
    <section class="yp-card"><h3>학생별 출석</h3>
      <div class="cp-tbl-wrap"><table class="cp-tbl cp-stats"><thead><tr><th scope="col">학생</th><th scope="col">출석</th><th scope="col">결석</th><th scope="col">출석률</th></tr></thead><tbody>${stats}</tbody></table></div>
      <p class="muted" style="margin:0">출석은 전체 수업 ${c.sessions.length}번 가운데, 출석률은 ○·/를 표시한 수업으로 셈해요.</p></section>`;
}
function obsHTML(c) {
  const k = `${c.id}:obs`;
  if (!c.students.length) return '<section class="yp-card"><p style="margin:0">먼저 캠프 정보에서 학생을 넣어 주세요.</p><div class="row"><button class="btn primary" type="button" data-sec="info">캠프 정보로</button></div></section>';
  return `<section class="yp-card">
      <div class="cls-card-h"><h3>관찰 기록</h3><button class="btn tonal" type="button" data-cp="obsAi"${busy[k] ? ' disabled' : ''}>${btnBusy(k, 'AI로 쓰기', 'AI가 쓰는 중…')}</button></div>
      ${aiRowHTML('writing')}
      <p class="muted" style="margin:0">메모를 짧게 적고 [AI로 쓰기]를 누르면 「관찰 및 지도 결과」를 2~4문장으로 써요. AI에는 이름 대신 학생A·학생B와 출석 수·지도 내용만 보내요. 선생님이 고친 칸은 다시 쓰기 전에 물어요.</p>
      <ol class="cp-obs">${c.students.map(st => { const a = M.attStats(c, st.id); return `<li class="cp-ob">
        <div class="cp-ob-h"><b>${esc(st.name || '이름 없음')}</b><span class="muted">${esc(M.studentLabel({ ...st, name: '' }))}${st.grade || st.no ? ' · ' : ''}출석 ${a.present}/${a.total}</span>${c.obsEdited[st.id] ? '<span class="cls-tag">고친 칸</span>' : ''}</div>
        <label class="yp-f"><span class="lab">메모</span><textarea class="field" data-memo="${esc(st.id)}" rows="2" placeholder="예) 받침 있는 낱말 받아쓰기를 어려워함 → 3주 차에 80점">${esc(c.memo[st.id] || '')}</textarea></label>
        <label class="yp-f"><span class="lab">관찰 및 지도 결과</span><textarea class="field" data-obs="${esc(st.id)}" rows="3">${esc(c.obs[st.id] || '')}</textarea></label></li>`; }).join('')}</ol>
    </section>`;
}
const formOf = id => F.list.find(f => f.id === id) || null;
const reportLayout = c => { const f = formOf(c.forms.report); return (f && f.layout) || null; };
function reportHTML(c) {
  const k = `${c.id}:report`, r = c.report, heads = reportHeads(c, reportLayout(c));
  const note = r.kind === 'select' ? '사업선택제 [서식 2] · 2쪽 이내' : r.kind === 'lead' ? '이끎교사 [서식 1] · 5쪽 이상' : reportLayout(c) && reportLayout(c).heads.length ? '넣은 결과 보고서 양식의 글 머리를 따라요' : '결과 보고서 양식을 [문서 내보내기]에서 넣으면 그 글 머리를 따라요. 지금은 사업선택제 글 머리로 써요';
  return `<section class="yp-card">
      <div class="yp-f"><span class="lab">보고서 꼴</span><div class="seg" role="group" aria-label="보고서 꼴">${M.REPORT_KINDS.map(([id, l]) => `<button type="button" data-rkind="${id}" aria-pressed="${r.kind === id}">${l}</button>`).join('')}</div>
        <p class="muted" style="margin:0">${esc(note)} · 글 머리: ${heads.map(h => `「${esc(h)}」`).join(' ')}</p></div>
      <label class="yp-f"><span class="lab">목적·성과 메모</span><textarea class="field" id="cpRPrompt" rows="4" placeholder="예) 받아쓰기 평균 60점 → 85점, 수학 연산 속도가 빨라짐, 학생 스스로 학습 습관">${esc(r.prompt)}</textarea></label>
      <div class="row"><button class="btn tonal" type="button" data-cp="reportAi"${busy[k] ? ' disabled' : ''}>${btnBusy(k, 'AI로 쓰기', 'AI가 쓰는 중…')}</button><span class="muted">수업 일정·출석·관찰 기록과 이 메모를 학생A·학생B로 보내요.</span></div>
      ${aiRowHTML('plan')}
    </section>
    <section class="yp-card">
      <label class="yp-f"><span class="lab">제목</span><input class="field" id="cpRTitle" value="${esc(r.title)}" placeholder="${esc(docTitle('report', c))}" autocomplete="off"></label>
      ${r.sections.length ? r.sections.map((s, i) => `<div class="cp-rsec"><div class="row"><input class="field" data-rh="${i}" value="${esc(s.head)}" aria-label="${i + 1}번째 글 머리" autocomplete="off"><button class="icon-btn" type="button" data-cp="delRSec" data-i="${i}" aria-label="${i + 1}번째 칸 지우기">×</button></div>
        <textarea class="field" data-rt="${i}" rows="6" aria-label="${esc(s.head || `${i + 1}번째 칸`)} 글">${esc(s.text)}</textarea></div>`).join('')
    : '<p class="muted" style="margin:0">[AI로 쓰기]를 누르면 제목과 칸이 채워져요. [+ 칸]으로 직접 써도 돼요.</p>'}
      <div class="row"><button class="btn" type="button" data-cp="addRSec">+ 칸</button></div>
    </section>`;
}
const docSummary = (d, c) => (d === 'confirm' ? `수업 ${c.sessions.length}줄 · 총 ${M.hoursTotal(c)}시간` : d === 'attend' ? (c.unit === 'day' ? `학생 ${c.students.length}명 × 수업 날 ${M.campDates(c).length}일` : `수업 ${c.sessions.length}줄 × 학생 ${c.students.length}명`)
  : d === 'observe' ? `학생 ${c.students.length}명 · 한 쪽에 5명` : `${c.report.sections.length}칸`);
function formNote(d, f) {
  if (!f) return '';
  if (f.kind === 'hwpx') return d === 'report' ? `「${f.name}」 양식(.hwpx)의 글 머리를 따라요. 결과 보고서는 쓴 글을 기본 양식으로 내려받아요.`
    : `「${f.name}」 양식(.hwpx)의 표에 채워요(한글로 내려받을 때). 결재란·확인(서명) 칸은 그대로 둬요.`;
  const l = f.layout || {};
  return `「${f.name}」 양식의 모양을 따라요${l.title ? `: 제목 「${l.title}」` : ''}${l.columns && l.columns.length ? ` · 칸 ${l.columns.join(', ')}` : ''}${d === 'report' && l.heads && l.heads.length ? ` · 글 머리 ${l.heads.join(', ')}` : ''}`;
}
function docsHTML(c) {
  return `<p class="banner info cp-form-tip"><span class="grow">문서마다 학교 양식을 넣으면 그 양식에 맞춰요. 한글(.hwpx)은 양식의 표에 채우고, PDF·사진·.hwp는 AI가 제목·칸 이름·안내 글을 읽어 그 모양으로 만들어요. ${BLANK_FORM}</span></p>
    ${M.DOC_IDS.map(d => { const f = formOf(c.forms[d]), list = F.list.filter(x => x.doc === d), n = F.adding[d] || 0, lay = f && f.kind === 'layout' ? f.layout : null;
    return `<section class="yp-card cp-doc" data-doc="${d}">
      <div class="cls-card-h"><h3>${esc(docLabel(d, c))}</h3><span class="muted">${esc(docSummary(d, c))}</span></div>
      <div class="row cp-doc-row">
        <select class="field" data-form-pick="${d}" aria-label="${esc(docLabel(d, c))} 양식"><option value="">기본 양식(쌤비서)</option>${list.map(x => `<option value="${esc(x.id)}"${f && x.id === f.id ? ' selected' : ''}>${esc(x.name)}${x.kind === 'hwpx' ? ' (.hwpx)' : ' (모양만)'}</option>`).join('')}</select>
        <button class="btn" type="button" data-cp="pickForm" data-doc="${d}"${n ? ' disabled' : ''}>${n ? '<span class="spin"></span>읽는 중…' : '양식 넣기'}</button>
        ${f ? `<button class="btn text" type="button" data-cp="delForm" data-doc="${d}">양식 지우기</button>` : ''}
        <input type="file" id="cpFile-${d}" hidden accept=".hwpx,.hwp,.pdf,.png,.jpg,.jpeg,.webp,.heic">
        <span class="grow"></span>${exportButton(`data-cp="export" data-doc="${d}"`, { cls: 'primary' })}</div>
      ${f ? `<p class="muted cp-form-note" style="margin:0">${esc(formNote(d, f))}</p>` : ''}
      <details class="cp-prev" data-prev="${d}"${openPrev.has(d) ? ' open' : ''}><summary>미리 보기</summary><div class="cp-prev-doc">${docHtml(campDoc(d, c, lay))}</div></details>
    </section>`; }).join('')}`;
}
const SEC_HTML = { info: infoHTML, sched: schedHTML, att: attHTML, obs: obsHTML, report: reportHTML, docs: docsHTML };
function pageHTML(camps, c) {
  return `<div class="m-page cls-page cp-page">
    <div class="m-head"><h2>기초학력 캠프</h2><p class="muted">수업 일정·출석 체크·관찰 기록을 쌓아 수업 확인서·출석부·관찰 기록부·결과 보고서를 만들어요. 학생 이름은 이 컴퓨터에만 두고 AI에는 학생A·학생B로 보내요.</p></div>
    ${pickHTML(camps, c)}
    ${c ? `<div class="seg cp-secs" role="group" aria-label="캠프 화면">${SECS.map(([k, l]) => `<button type="button" data-sec="${k}" aria-pressed="${sec === k}">${l}</button>`).join('')}</div>
      <div id="cpSec" class="cp-sec">${SEC_HTML[sec](c)}</div>`
    : '<section class="yp-card"><p style="margin:0">이 학년도에 만든 캠프가 없어요. 캠프를 만들고 학생·수업 일정을 넣으면 출석 체크와 문서 만들기를 할 수 있어요.</p><div class="row"><button class="btn primary" type="button" data-cp="new">새 캠프 만들기</button></div></section>'}
  </div>`;
}
/* 다시 그린 뒤 초점을 돌려 둘 곳: 누르던 단추·칸(id나 data- 속성으로 다시 찾음) */
function focusSel(a) {
  if (!a || !box.contains(a)) return '';
  if (a.id && !/^cpFile-/.test(a.id)) return `#${CSS.escape(a.id)}`;
  const at = [...a.attributes].filter(x => x.name.startsWith('data-') && !x.name.startsWith('data-exp') && !x.name.startsWith('data-ai')).map(x => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  return at ? a.tagName.toLowerCase() + at : '';
}
export function render() {
  if (!visible()) return;
  stale = false;
  const sel = focusSel(document.activeElement);
  const camps = M.listCamps(), c = cur();
  keepFiles(box, () => { box.innerHTML = pageHTML(camps, c); });
  if (sel) { const n = box.querySelector(sel); if (n && !n.disabled) n.focus({ preventScroll: true }); }
}

/* ---------- 캠프 ---------- */
function newCampAct() {
  const p = cur();
  // 같은 선생님이 다음 캠프를 만들면 지도교사·결재란·교과·출석 단위·고른 양식은 이어서
  const c = M.newCamp(p ? { teacher: p.teacher, approval: p.approval, subjects: p.subjects, unit: p.unit, forms: p.forms } : {});
  if (!save(c)) return;
  M.setCurrentCamp(c.id); sec = 'info';
  render();
  const n = box.querySelector('[data-cf="name"]'); if (n) n.focus();
  toast('새 캠프를 만들었어요. 캠프 이름과 학생을 넣어 주세요.');
}
function askDelete() {
  const c = cur();
  if (!c || !SS().openSheet) return;
  SS().openSheet(`<h3>「${esc(c.name || '이름 없는 캠프')}」 지우기</h3>
    <p class="muted" style="margin:0">학생·수업 일정·출석·관찰 기록·결과 보고서가 모두 지워져요. 되돌릴 수 없어요. 넣어 둔 양식은 남아요.</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" id="cpDelOk">지우기</button></div>`,
  sh => sh.querySelector('#cpDelOk').addEventListener('click', () => {
    SS().closeSheet();
    if (!M.deleteCamp(c.id)) { toast(FULL_MSG, 7000); return; }
    const next = M.listCamps()[0];
    M.setCurrentCamp(next ? next.id : '');
    render(); toast('캠프를 지웠어요');
  }));
}
/* 고를 것 묻기: buttons [[값, 글, 주된 단추?]] */
function ask(title, body, buttons, onPick) {
  if (!SS().openSheet) return;
  SS().openSheet(`<h3>${esc(title)}</h3><p class="muted" style="margin:0">${esc(body)}</p>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button>${buttons.map(([k, l, p]) => `<button class="btn${p ? ' primary' : ''}" type="button" data-ask="${k}">${esc(l)}</button>`).join('')}</div>`,
  sh => sh.addEventListener('click', e => { const b = e.target.closest('[data-ask]'); if (b) { SS().closeSheet(); onPick(b.dataset.ask); } }));
}

/* ---------- 수업 일정 ---------- */
function addRow() {
  const c = cur(), last = M.sortSessions(c.sessions).at(-1);
  c.sessions.push(M.newSession({ date: last ? last.date : '', subject: c.subjects[0] || '' }));
  if (save(c)) { render(); const r = box.querySelectorAll('[data-k="date"]'); if (r.length) r[r.length - 1].focus(); }
}
function openBulk() {
  const c = cur();
  if (!SS().openSheet) return;
  const ds = M.campDates(c), last = ds[ds.length - 1];
  let next = last || today();
  if (last) { const after = M.expandDates(last, `${+last.slice(0, 4) + 1}${last.slice(4)}`).filter(d => d > last); next = after[0] || last; }
  const day = c.unit === 'day';
  SS().openSheet(`<h3>한 날 여러 교시 더하기</h3>
    <div class="cp-grid cp-bulk">
      <label class="yp-f"><span class="lab">날짜</span><input class="field" type="date" id="cpBDate" value="${next}"></label>
      <label class="yp-f"><span class="lab">첫 교시 시작</span><input class="field" type="time" id="cpBStart" value="${esc((M.sessionsOn(c, last || '')[0] || {}).start || '09:00')}"></label>
      <label class="yp-f"><span class="lab">교시 수</span><input class="field" type="number" id="cpBN" value="5" min="1" max="10"></label>
      <label class="yp-f"><span class="lab">한 교시(분)</span><input class="field" type="number" id="cpBMin" value="40" min="10" max="180"></label>
      <label class="yp-f"><span class="lab">쉬는 시간(분)</span><input class="field" type="number" id="cpBRest" value="10" min="0" max="60"></label>
      <label class="yp-f wide"><span class="lab">교과 차례(교시 수보다 적으면 되풀이)</span><input class="field" id="cpBSubs" value="${esc(c.subjects.join(', '))}" placeholder="예) 국어, 수학" autocomplete="off"></label>
    </div>
    <p class="muted" id="cpBPrev" style="margin:0"></p>
    ${day ? '<p class="muted" style="margin:0">날마다 캠프라 그날 한 줄(첫 교시 시작~끝 교시 끝)로 더해요.</p>' : ''}
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>그만두기</button><button class="btn primary" type="button" id="cpBOk">더하기</button></div>`, sh => {
    const q = id => sh.querySelector('#' + id);
    const plan = () => {
      const slots = M.periodSlots(q('cpBStart').value, +q('cpBN').value, +q('cpBMin').value, +q('cpBRest').value);
      const subs = q('cpBSubs').value.split(/[,·、/]+/).map(s => s.trim()).filter(Boolean);
      return { date: q('cpBDate').value, slots, subs };
    };
    const prev = () => { const p = plan(); q('cpBPrev').textContent = p.slots.length ? p.slots.map((s, i) => `${s.start}~${s.end} ${p.subs.length ? p.subs[i % p.subs.length] : ''}`.trim()).join(' · ') : '시각·교시 수를 확인해 주세요.'; };
    sh.addEventListener('input', prev); prev();
    q('cpBOk').addEventListener('click', () => {
      const p = plan();
      if (!M.expandDates(p.date, p.date, { weekdays: [0, 1, 2, 3, 4, 5, 6], skipHolidays: false }).length) { q('cpBPrev').textContent = '날짜를 골라 주세요.'; return; }
      if (!p.slots.length) { q('cpBPrev').textContent = '시각·교시 수를 확인해 주세요.'; return; }
      const x = cur();
      const add = day ? [M.newSession({ date: p.date, start: p.slots[0].start, end: p.slots[p.slots.length - 1].end, subject: [...new Set(p.subs)].join('·') })]
        : p.slots.map((s, i) => M.newSession({ date: p.date, start: s.start, end: s.end, subject: p.subs.length ? p.subs[i % p.subs.length] : '' }));
      x.sessions = M.sortSessions([...x.sessions, ...add]);
      SS().closeSheet();
      if (save(x)) { render(); toast(`${M.fmtDate(p.date)} 수업 ${add.length}줄을 더했어요. 지도 내용을 채워 주세요.`); }
    });
  });
}
function schedAi() {
  const c = cur(), text = drafts[c.id] || '';
  if (!text.trim()) { toast('만들 일정을 적어 주세요. 예) 1/8~1/23 평일, 9:00~12:40 하루 5교시, 국어·수학', 6000); const t = box.querySelector('#cpSchedPrompt'); if (t) t.focus(); return; }
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  if (!c.sessions.length) { runSched(c.id, text, 'replace'); return; }
  const marked = Object.keys(c.att).length;
  ask('수업 일정에 어떻게 넣을까요?', `지금 수업 줄이 ${c.sessions.length}개 있어요.${marked ? ' 바꾸면 그 줄의 출석 체크도 지워져요.' : ''}`,
    [['add', '뒤에 더하기'], ['replace', '바꾸기', true]], mode => runSched(c.id, text, mode));
}
/* ---------- 계획 파일 넣기 ---------- */
/* 운영 계획서 → 캠프 정보(빈 칸만) + 수업 일정. AI가 있으면 계획서 글(가림)을 일정 AI에, 없으면 규칙으로 날짜 × 교시(지도 내용 빈칸) */
async function addPlan(file) {
  const c0 = cur();
  if (!c0) return;
  const id = c0.id, k = `${id}:plan`;
  if (busy[k]) return;
  const isImg = IMAGE.test(file.name || '') || /^image\//.test(file.type || '');
  if (isImg && !ai.ready()) { toast('사진·스캔 계획서는 AI가 읽어요. 설정 › AI에서 키를 넣거나 한글·PDF·워드 계획서를 넣어 주세요.', 7000); return; }
  busy[k] = true; redraw();
  try {
    let text = '';
    if (!isImg) { try { text = await readText(file); } catch (e) { if (!e || e.code !== 'PDF_NO_TEXT') throw e; } }
    if (!text.trim() && !ai.ready()) { toast(fileMessage('PDF_NO_TEXT'), 7000); return; }
    const ctx = { year: currentYear(), today: today() };
    const p = readPlan(text, ctx);
    let spec, byAI = false;
    if (ai.ready()) {
      const images = text.trim() ? [] : (SS().files && SS().files.toImages ? (await SS().files.toImages(file)).slice(0, 3) : []);
      const c1 = M.getCamp(id);
      if (!c1) return;
      const { prompt, range, weekdays } = planPrompt(text, { ...c1, subjects: c1.subjects.length ? c1.subjects : p.subjects, target: c1.target || p.target }, ctx, p);
      const v = await ai.generateJSON(images.length ? `${prompt}\n\n(계획서는 그림 ${images.length}장으로 보내요. 그림에서 기간·시간·교과·지도 내용을 읽어 주세요.)` : prompt, { images, task: 'plan', valid: o => isObj(o) });
      spec = normSchedule(v, { range, weekdays }); byAI = true;
    }
    const c = M.getCamp(id);
    if (!c) return; // 그사이 지운 캠프
    const got = fillCampInfo(c, p);
    if (!spec) spec = planSchedule(p, c);
    const { sessions, empty } = buildSessions(spec, c);
    if (!drafts[id] && planDraft(p)) drafts[id] = planDraft(p);
    const last = got.length ? got[got.length - 1].charCodeAt(got[got.length - 1].length - 1) - 0xac00 : 0;
    const info = got.length ? `계획서에서 ${got.join('·')}${last >= 0 && last % 28 ? '을' : '를'} 채웠어요. ` : '';
    if (!sessions.length) {
      if (save(c)) render();
      toast(`${info}계획서에서 수업 기간·시간을 찾지 못해 수업 일정은 만들지 못했어요. 수업 일정의 [AI로 만들기] 칸에 읽은 내용을 적어 두었으니 고쳐서 눌러 주세요.`, 9000);
      return;
    }
    const apply = mode => {
      const x = M.getCamp(id);
      if (!x) return;
      Object.assign(x, { name: c.name, target: c.target, subjects: c.subjects, teacher: c.teacher });
      if (mode === 'add') x.sessions = M.sortSessions([...x.sessions, ...sessions]);
      else { x.sessions = sessions; x.att = {}; }
      if (!x.subjects.length) x.subjects = [...new Set(sessions.flatMap(s => s.subject.split('·')).filter(Boolean))].slice(0, 12);
      if (!save(x)) return;
      render();
      toast(`${info}수업 ${sessions.length}줄을 ${mode === 'add' ? '더했어요' : '만들었어요'}${spec.dropped ? ` · 주말·공휴일 ${spec.dropped}일은 뺐어요` : ''}`
        + (empty ? (byAI ? ` · 지도 내용이 빈 ${empty}줄은 채워 주세요` : ' · 지도 내용은 비어 있어요(AI 키가 있으면 계획서의 지도 내용까지 넣어요)') : '') + '. 날짜·시간을 확인해 주세요.', 9000);
    };
    if (!c.sessions.length) { apply('replace'); return; }
    save(c);
    const marked = Object.keys(c.att).length;
    ask('계획서 수업 일정을 어떻게 넣을까요?', `지금 수업 줄이 ${c.sessions.length}개 있어요.${marked ? ' 바꾸면 그 줄의 출석 체크도 지워져요.' : ''}`,
      [['add', '뒤에 더하기'], ['replace', '바꾸기', true]], apply);
  } catch (e) { toast(e && e.code && isFileCode(e.code) ? fileMessage(e.code) : errText(e), 7000); }
  finally { delete busy[k]; redraw(); }
}
async function runSched(id, text, mode) {
  const k = `${id}:sched`;
  if (busy[k]) return;
  busy[k] = true; redraw();
  try {
    const c0 = M.getCamp(id);
    if (!c0) return;
    const { prompt, range, weekdays } = schedulePrompt(text, c0, { year: currentYear(), today: today() });
    const v = await ai.generateJSON(prompt, { task: 'plan', valid: o => isObj(o) });
    const c = M.getCamp(id);
    if (!c) return; // 그사이 지운 캠프
    const spec = normSchedule(v, { range, weekdays });
    const { sessions, empty } = buildSessions(spec, c);
    if (!sessions.length) { toast('수업 날을 찾지 못했어요. 기간(예: 1/8~1/23)과 요일을 적어 다시 눌러 주세요.', 7000); return; }
    if (mode === 'add') c.sessions = M.sortSessions([...c.sessions, ...sessions]);
    else { c.sessions = sessions; c.att = {}; }
    if (!c.subjects.length) c.subjects = [...new Set(sessions.flatMap(s => s.subject.split('·')).filter(Boolean))].slice(0, 12);
    if (!save(c)) return;
    const here = visible() && cur() && cur().id === id;
    toast(`${here ? '' : `기초학력 캠프 「${c.name || '이름 없는 캠프'}」에 `}수업 ${sessions.length}줄을 ${mode === 'add' ? '더했어요' : '만들었어요'}`
      + (spec.dropped ? ` · 주말·공휴일 ${spec.dropped}일은 뺐어요` : '') + (empty ? ` · 지도 내용이 빈 ${empty}줄은 채워 주세요` : '') + '. 날짜·시간을 확인해 주세요.', 7000);
  } catch (e) { toast(errText(e), 6000); }
  finally { delete busy[k]; redraw(); }
}

/* ---------- 출석 ---------- */
function setAttDate(d) { const c = cur(); if (!c || !M.campDates(c).includes(d)) return; attDate = d; attFor = c.id; render(); }
function tapMark(key) {
  const [sid, st] = key.split('|'), c = cur();
  if (!c || !c.sessions.some(s => s.id === sid)) return;
  const next = M.nextMark((c.att[sid] || {})[st] || '');
  if (save(M.setMark(c, sid, st, next))) render();
}

/* ---------- 관찰 기록 ---------- */
function obsAi() {
  const c = cur();
  if (!c.students.length) { toast('먼저 학생을 넣어 주세요.'); return; }
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  const all = c.students.map(s => s.id), edited = all.filter(id => c.obsEdited[id] && String(c.obs[id] || '').trim());
  if (!edited.length) { runObs(c.id, all); return; }
  ask('고친 칸도 다시 쓸까요?', `선생님이 고친 「관찰 및 지도 결과」가 ${edited.length}칸 있어요.`,
    [['all', '고친 칸도 다시 쓰기'], ['keep', '고친 칸은 두고 쓰기', true]], m => {
      const ids = m === 'all' ? all : all.filter(id => !edited.includes(id));
      if (!ids.length) { toast('다시 쓸 칸이 없어요. 고친 칸은 그대로 두었어요.'); return; }
      runObs(c.id, ids);
    });
}
async function runObs(id, ids) {
  const k = `${id}:obs`;
  if (busy[k]) return;
  const c0 = M.getCamp(id);
  if (!c0) return;
  busy[k] = true; redraw();
  const before = Object.fromEntries(ids.map(s => [s, c0.obs[s] || '']));
  try {
    const v = await ai.generateJSON(obsPrompt(c0, ids), { task: 'writing', valid: o => Object.keys(normObs(o, c0)).length > 0 });
    const got = normObs(v, c0), c = M.getCamp(id);
    if (!c) return;
    let n = 0, kept = 0;
    for (const s of ids) {
      if (!got[s] || !c.students.some(x => x.id === s)) continue;
      if ((c.obs[s] || '') !== before[s]) { kept++; continue; } // 쓰는 동안 선생님이 고친 칸
      c.obs[s] = got[s]; delete c.obsEdited[s]; n++;
    }
    if (!save(c)) return;
    if (visible() && cur() && cur().id === id) {
      for (const s of ids) { const t = box.querySelector(`[data-obs="${CSS.escape(s)}"]`); if (t && t !== document.activeElement) t.value = c.obs[s] || ''; }
    }
    toast(`관찰 및 지도 결과 ${n}칸을 썼어요${kept ? ` · 쓰는 동안 고친 ${kept}칸은 그대로 두었어요` : ''}. 내용을 확인해 주세요.`, 6000);
  } catch (e) { toast(errText(e), 6000); }
  finally { delete busy[k]; redraw(); }
}

/* ---------- 결과 보고서 ---------- */
function reportAi() {
  const c = cur();
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  if (!c.report.sections.some(s => s.text.trim())) { runReport(c.id); return; }
  ask('써 둔 보고서를 바꿀까요?', '지금 보고서 칸의 글을 AI가 새로 쓴 글로 바꿔요.', [['go', '바꾸기', true]], () => runReport(c.id));
}
async function runReport(id) {
  const k = `${id}:report`;
  if (busy[k]) return;
  const c0 = M.getCamp(id);
  if (!c0) return;
  busy[k] = true; redraw();
  const layout = reportLayout(c0), heads = reportHeads(c0, layout), was = JSON.stringify(c0.report.sections);
  try {
    const v = await ai.generateJSON(reportPrompt(c0, layout), { task: 'plan', valid: o => normCampReport(o, heads).sections.length > 0 });
    const r = normCampReport(v, heads), c = M.getCamp(id);
    if (!c) return;
    if (JSON.stringify(c.report.sections) !== was) { toast('쓰는 동안 보고서를 고치셔서 AI 글은 넣지 않았어요. 다시 눌러 주세요.', 6000); return; }
    c.report.title = r.title || c.report.title; c.report.sections = r.sections;
    if (!save(c)) return;
    toast(`결과 보고서를 썼어요${visible() && cur() && cur().id === id ? '' : `(기초학력 캠프 「${c.name || '이름 없는 캠프'}」)`}. 숫자·성과는 꼭 확인해 주세요.`, 6000);
  } catch (e) { toast(errText(e), 6000); }
  finally { delete busy[k]; redraw(); }
}

/* ---------- 양식 ---------- */
const sigOf = () => JSON.stringify(F.list.map(f => [f.id, f.name, !!f.layout]));
async function loadForms() {
  if (!F.store) F.store = await forms(NS);
  try { F.list = await F.store.list(); } catch (e) {}
}
const baseName = n => String(n || '').replace(/\.[^.]+$/, '').trim() || '양식';
const IMAGE = /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/i;
/* PDF·사진·.hwp(·결과 보고서 .hwpx) 양식 → AI가 읽은 모양. 글이 있으면 이름·전화번호를 가린 글을, 없으면(사진·스캔) 그림을 보냄 */
async function readLayout(doc, file, camp) {
  let text = '', images = [];
  if (!IMAGE.test(file.name || '') && !/^image\//.test(file.type || '')) {
    try { text = await readText(file); } catch (e) { if (!e || e.code !== 'PDF_NO_TEXT') throw e; }
  }
  if (!String(text).trim()) {
    if (!SS().files || !SS().files.toImages) throw { code: 'READ_FAILED' };
    images = (await SS().files.toImages(file)).slice(0, 3);
  }
  const masked = text ? maskContacts(M.toAlias(text, camp)) : '';
  const v = await ai.generateJSON(layoutPrompt(doc, { text: masked, nImages: images.length }), { images, task: 'plan', valid: o => !!normLayout(o) });
  return normLayout(v);
}
async function addForm(doc, file) {
  const c0 = cur();
  if (!c0) return;
  const hwpx = /\.hwpx$/i.test(file.name || '');
  if (!hwpx && !ai.ready()) { toast('PDF·사진·.hwp 양식은 AI가 모양을 읽어요. 설정 › AI에서 키를 넣거나, 한글(.hwpx) 양식을 넣어 주세요.', 7000); return; }
  F.adding[doc] = (F.adding[doc] || 0) + 1; redraw();
  try {
    if (!F.store) F.store = await forms(NS);
    let bytes = null, isHwpx = hwpx;
    if (hwpx) {
      bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) { isHwpx = false; bytes = null; } // 이름만 .hwpx인 .hwp
      else if (bytes.length > MAX_FORM) { toast('양식 파일이 5MB보다 커서 넣지 못했어요.', 6000); return; }
    }
    if (!isHwpx && !ai.ready()) { toast('이 파일은 .hwp라 AI가 모양을 읽어야 해요. 설정 › AI에서 키를 넣어 주세요.', 7000); return; }
    const rec = { id: newFormId(), name: baseName(file.name), doc, kind: isHwpx ? 'hwpx' : 'layout', layout: null, savedAt: Date.now(), ...(bytes ? { bytes } : {}) };
    // 결과 보고서 .hwpx는 글 머리를 따르려고 모양도 읽음(AI가 있을 때만)
    if (!isHwpx || (doc === 'report' && ai.ready())) {
      try { rec.layout = await readLayout(doc, file, c0); } catch (e) { if (!isHwpx) throw e; }
      if (!isHwpx && !rec.layout) { toast('양식 모양을 읽지 못했어요. 빈 양식 PDF·사진을 다시 넣어 주세요.', 6000); return; }
    }
    try { await F.store.put(rec); F.list = await F.store.list(); } catch (e) { toast('양식을 저장하지 못했어요(저장 공간이 꽉 찼을 수 있어요).', 6000); return; }
    if (!F.store.persistent) toast('이 브라우저는 양식을 저장할 수 없어 이번에만 써요.', 6000);
    const c = M.getCamp(c0.id);
    if (c) { c.forms[doc] = rec.id; save(c); }
    toast(isHwpx ? `「${rec.name}」 양식을 넣었어요. ${doc === 'report' ? '결과 보고서는 글 머리만 따라요.' : '한글로 내려받으면 이 양식의 표에 채워요.'}`
      : `「${rec.name}」 양식의 모양을 읽었어요${rec.layout.title ? `: 「${rec.layout.title}」` : ''}. 미리 보기로 확인해 주세요.`, 7000);
  } catch (e) {
    const code = e && e.code;
    toast(code === 'bad_json' ? 'AI가 양식 모양을 읽지 못했어요. 다시 넣어 주세요.' : isFileCode(code) ? fileMessage(code) : code ? errText(e) : '양식을 읽지 못했어요. 다시 넣어 주세요.', 7000);
  } finally { F.adding[doc] = Math.max(0, (F.adding[doc] || 1) - 1); redraw(); }
}
async function delForm(doc) {
  const c = cur(), id = c && c.forms[doc];
  if (!id) return;
  try { if (!F.store) F.store = await forms(NS); await F.store.del(id); F.list = await F.store.list(); } catch (e) { toast('양식을 지우지 못했어요. 다시 눌러 주세요.', 5000); return; }
  // 이 양식을 고른 다른 캠프도 기본 양식으로
  for (const x of M.listCamps()) if (Object.values(x.forms).includes(id)) { for (const d of M.DOC_IDS) if (x.forms[d] === id) x.forms[d] = ''; M.saveCamp(x); }
  render(); toast('양식을 지웠어요. 기본 양식으로 만들어요.');
}

/* ---------- 내려받기 ---------- */
async function exportCampDoc(doc) {
  const c = cur();
  if (!c) return;
  if (!F.store) await loadForms();
  const f = formOf(c.forms[doc]), name = docTitle(doc, c);
  let fall = '';
  if (f && f.kind === 'hwpx' && getFormat() === 'hwpx') {
    let rec = null;
    try { rec = await F.store.get(f.id); } catch (e) {}
    if (rec && rec.bytes) {
      try {
        const out = await fillCampForm(doc, c, rec.bytes);
        const bytes = out instanceof Uint8Array ? out : out && out.bytes;
        if (!(bytes instanceof Uint8Array)) throw { code: 'BAD_FILL' };
        const warn = (out && Array.isArray(out.warn) ? out.warn : []).join(' ');
        const where = await saveFile(fileName(name, 'hwpx'), bytes, 'application/hwp+zip');
        const done = window.__TAURI__ ? `다운로드 폴더에 저장했어요: ${String(where).split(/[\\/]/).pop()}` : `「${f.name}」 양식에 채워 내려받았어요. 확인(서명) 칸은 직접 날인해 주세요.`;
        toast(warn ? `${done} ${warn}` : done, warn ? 12000 : 7000);
        return;
      } catch (e) {
        const code = e && e.code;
        fall = code === 'REPORT_DEFAULT' ? REPORT_DEFAULT_MSG : code === 'NO_MATCH' ? NO_MATCH_MSG : code === 'NOT_HWPX' ? '양식 파일을 읽지 못해 기본 양식으로 내려받았어요. 한글에서 .hwpx로 다시 저장해 넣어 주세요.' : '학교 양식에 채우지 못해 기본 양식으로 내려받았어요.';
      }
    } else fall = '양식 파일을 읽지 못해 기본 양식으로 내려받았어요.';
  }
  const d = campDoc(doc, c, (f && f.layout) || null);
  try { const msg = await exportDoc(d, name); toast(fall || msg, fall ? 8000 : 6000); }
  catch (e) { toast('파일을 만들지 못했어요. 다시 눌러 주세요.', 5000); }
}

/* ---------- 입력 ---------- */
const splitList = (v, re) => String(v || '').split(re).map(s => s.trim()).filter(Boolean);
function onInput(el) {
  const c = cur();
  if (el.id === 'cpSchedPrompt') { if (c) drafts[c.id] = el.value; return; }
  if (!c) return;
  if (el.dataset.cf) {
    const k = el.dataset.cf;
    if (k === 'subjects') c.subjects = splitList(el.value, /[,·、/]+/);
    else if (k === 'approval') c.approval = splitList(el.value, /[,·、/]+/);
    else c[k] = el.value;
    if (k === 'name') { const o = box.querySelector(`#cpPick option[value="${CSS.escape(c.id)}"]`); if (o) o.textContent = el.value.trim() || '이름 없는 캠프'; }
  } else if (el.dataset.st) {
    const s = c.students.find(x => x.id === el.dataset.st);
    if (!s) return;
    s[el.dataset.k] = el.dataset.k === 'name' ? el.value : el.value.trim();
  } else if (el.dataset.ss) {
    const s = c.sessions.find(x => x.id === el.dataset.ss);
    if (!s) return;
    s[el.dataset.k] = el.value;
  } else if (el.dataset.memo) c.memo[el.dataset.memo] = el.value;
  else if (el.dataset.obs) { c.obs[el.dataset.obs] = el.value; c.obsEdited[el.dataset.obs] = true; }
  else if (el.id === 'cpRPrompt') c.report.prompt = el.value;
  else if (el.id === 'cpRTitle') c.report.title = el.value;
  else if (el.dataset.rh != null) { const s = c.report.sections[+el.dataset.rh]; if (s) s.head = el.value; }
  else if (el.dataset.rt != null) { const s = c.report.sections[+el.dataset.rt]; if (s) s.text = el.value; }
  else return;
  save(c);
}
function onClick(e) {
  const t = e.target;
  const s = t.closest('[data-sec]');
  if (s) { sec = s.dataset.sec; render(); return; }
  const at = t.closest('[data-att]');
  if (at) { tapMark(at.dataset.att); return; }
  const u = t.closest('[data-unit]');
  if (u) { const c = cur(); if (c.unit !== u.dataset.unit) { c.unit = u.dataset.unit; if (save(c)) render(); } return; }
  const rk = t.closest('[data-rkind]');
  if (rk) { const c = cur(); c.report.kind = rk.dataset.rkind; if (save(c)) render(); return; }
  const b = t.closest('[data-cp]');
  if (!b) return;
  const a = b.dataset.cp, c = cur();
  if (a === 'new') newCampAct();
  else if (!c) return;
  else if (a === 'del') askDelete();
  else if (a === 'addStudent') { c.students.push(M.newStudent({ grade: (c.students.at(-1) || {}).grade, cls: (c.students.at(-1) || {}).cls })); if (save(c)) { render(); const n = box.querySelectorAll('[data-k="name"]'); if (n.length) n[n.length - 1].focus(); } }
  else if (a === 'delStudent') {
    const id = b.dataset.id, st = c.students.find(x => x.id === id);
    if (!st) return;
    const drop = () => {
      const x = cur();
      x.students = x.students.filter(y => y.id !== id);
      for (const r of Object.values(x.att)) delete r[id];
      delete x.memo[id]; delete x.obs[id]; delete x.obsEdited[id];
      if (save(x)) render();
    };
    const has = Object.values(c.att).some(r => r[id]) || (c.memo[id] || '').trim() || (c.obs[id] || '').trim();
    if (has) ask(`「${st.name || '이름 없는 학생'}」 빼기`, '이 학생의 출석 체크·메모·관찰 기록도 지워져요.', [['go', '빼기', true]], drop); else drop();
  }
  else if (a === 'addRow') addRow();
  else if (a === 'delRow') { c.sessions = c.sessions.filter(x => x.id !== b.dataset.id); delete c.att[b.dataset.id]; if (save(c)) render(); }
  else if (a === 'sortRows') { c.sessions = M.sortSessions(c.sessions); if (save(c)) render(); }
  else if (a === 'bulk') openBulk();
  else if (a === 'schedAi') schedAi();
  else if (a === 'planFile') { const f = box.querySelector(`#cpPlanFile-${b.dataset.where}`); if (f) f.click(); }
  else if (a === 'attPrev' || a === 'attNext') { const ds = M.campDates(c), i = ds.indexOf(attDate); setAttDate(ds[Math.max(0, Math.min(ds.length - 1, i + (a === 'attPrev' ? -1 : 1)))]); }
  else if (a === 'attToday') { const ds = M.campDates(c), t = today(); if (ds.includes(t)) setAttDate(t); else toast('오늘은 수업이 없어요. 가까운 수업 날을 골라 주세요.'); }
  else if (a === 'attAll') { if (save(M.markAll(c, attDate))) { render(); toast(`${M.fmtDate(attDate)} 수업을 모두 출석으로 표시했어요`); } }
  else if (a === 'obsAi') obsAi();
  else if (a === 'reportAi') reportAi();
  else if (a === 'addRSec') { c.report.sections.push({ head: '', text: '' }); if (save(c)) { render(); const h = box.querySelectorAll('[data-rh]'); if (h.length) h[h.length - 1].focus(); } }
  else if (a === 'delRSec') { c.report.sections.splice(+b.dataset.i, 1); if (save(c)) render(); }
  else if (a === 'pickForm') { const f = box.querySelector(`#cpFile-${b.dataset.doc}`); if (f) f.click(); }
  else if (a === 'delForm') delForm(b.dataset.doc);
  else if (a === 'export') exportCampDoc(b.dataset.doc);
}

const mine = e => box && box.contains(e.target) && visible();
document.addEventListener('input', e => { if (mine(e)) onInput(e.target); });
document.addEventListener('click', e => { if (mine(e)) onClick(e); });
document.addEventListener('change', e => {
  if (!mine(e)) return;
  const el = e.target;
  if (el.id === 'cpPick') { M.setCurrentCamp(el.value); render(); return; }
  if (el.id === 'cpAttDate') { setAttDate(el.value); return; }
  if (el.dataset.formPick) { const c = cur(); c.forms[el.dataset.formPick] = el.value; if (save(c)) render(); return; }
  if (/^cpPlanFile-/.test(el.id || '')) { const f = el.files[0]; el.value = ''; if (f) addPlan(f); return; }
  const m = /^cpFile-(\w+)$/.exec(el.id || '');
  if (m) { const f = el.files[0]; el.value = ''; if (f) addForm(m[1], f); return; }
  // 학생 칸(학년·반·번호)은 칸을 벗어나면 정리한 값으로
  if (el.dataset.st && el.dataset.k !== 'name') { const c = cur(), s = c && c.students.find(x => x.id === el.dataset.st); if (s) el.value = s[el.dataset.k] == null ? '' : s[el.dataset.k]; }
});
document.addEventListener('toggle', e => {
  const d = e.target;
  if (!box || !box.contains(d) || !d.dataset || !d.dataset.prev) return;
  if (d.open) openPrev.add(d.dataset.prev); else openPrev.delete(d.dataset.prev);
}, true);
document.addEventListener('focusout', e => {
  if (!stale || !box || !box.contains(e.target)) return;
  setTimeout(() => { if (stale && visible() && !typing()) render(); }, 0);
});

/* 다른 곳(채팅 「캠프 출석」 등)에서 이 탭으로 */
export function openCamp(section) {
  if (section && SECS.some(s => s[0] === section)) sec = section;
  go('class', 'camp');
}

onEnter('class', (tab, section) => {
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'cls-camp'; section.append(box); }
  curTab = tab;
  box.hidden = tab !== 'camp';
  if (box.hidden) return;
  render();
  const sig = sigOf();
  loadForms().then(() => { if (sigOf() !== sig) redraw(); }).catch(() => {});
});
