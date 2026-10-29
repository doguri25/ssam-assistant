/* 설정 메뉴: 학급 명단 · AI · 화면 · 학교 정보 · 품의 기준 */
import { onEnter } from '../../core/shell.js';
import { THEMES, getTheme, setTheme } from '../../core/theme.js';
import { getSchool, setSchool, getPurchaseLimit, setPurchaseLimit } from '../../core/settings.js';
import * as ai from '../../core/ai.js';

const SSAM = () => window.SSAM || {};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m, ms) => SSAM().toast && SSAM().toast(m, ms);
const won = n => Number(n).toLocaleString('ko-KR');

// 테마 미리보기 색 (core/theme.css와 같은 값): 틀, 바탕, 카드, 포인트
const PREVIEW = {
  'dark-nav': ['#15171c', '#f5f6f8', '#ffffff', '#4f46e5', '#e4e6eb'],
  mono: ['#ffffff', '#fafafa', '#ffffff', '#111111', '#ebebeb'],
  soft: ['#ffffff', '#f2f4f6', '#ffffff', '#2563eb', '#eceef1'],
  paper: ['#efebe2', '#f7f5f0', '#fffefb', '#1f3a5f', '#ddd7ca'],
  rail: ['#eef3f2', '#ffffff', '#ffffff', '#0f766e', '#dde5e3']
};

let box = null, school = null, msg = '', aiMsg = null; // aiMsg: { ok, text } | { busy }

function page(title, desc, body) {
  return `<div class="m-page set-page"><div class="m-head"><h2>${title}</h2>${desc ? `<p class="muted">${desc}</p>` : ''}</div>${body}</div>`;
}
const card = (title, body) => `<section class="set-card"><h3>${title}</h3>${body}</section>`;

const VIEWS = {
  roster: () => page('학급 명단', '창의적 체험활동·행동특성·평가지 채점이 같은 명단을 써요.',
    card('학생 수와 예외 번호', SSAM().rosterHTML ? SSAM().rosterHTML() : '')),
  ai: () => {
    const ready = SSAM().ai && SSAM().ai.engineReady();
    return page('AI', 'Claude·Gemini·GPT·업스테이지 중 하나의 키를 넣어 써요. 키는 이 컴퓨터에만 저장돼요.',
      card('지금 쓰는 AI', `<p class="set-big">${esc(ready ? SSAM().ai.engineName() : '아직 정하지 않았어요')}</p>
        <div class="row"><button class="btn primary" type="button" data-set="openAi">AI 바꾸기</button>
          <button class="btn" type="button" data-set="testAi" ${ready && !(aiMsg && aiMsg.busy) ? '' : 'disabled'}>연결 확인</button></div>
        ${aiMsg ? `<p class="set-msg ${aiMsg.busy ? '' : aiMsg.ok ? 'ok' : 'err'}" role="status">${aiMsg.busy ? '확인하는 중…' : esc(aiMsg.text)}</p>` : ''}`));
  },
  screen: () => {
    const cur = getTheme();
    return page('화면', '고른 테마는 이 컴퓨터에 저장되고 바로 바뀌어요.',
      card('테마', `<div class="theme-grid" role="radiogroup" aria-label="테마">${THEMES.map(t => {
        const [f, p, c, a, l] = PREVIEW[t.id];
        const narrow = t.id === 'rail' ? ' narrow' : '';
        return `<label class="theme-card" data-theme-pick="${t.id}">
          <span class="tp${narrow}" aria-hidden="true" style="--tf:${f};--tp:${p};--tc:${c};--ta:${a};--tl:${l}"><i class="tp-side"></i><i class="tp-top"></i><i class="tp-body"><b></b><b class="acc"></b></i></span>
          <span class="tn"><input type="radio" name="theme" value="${t.id}" ${t.id === cur ? 'checked' : ''}>${esc(t.label)}${t.id === 'dark-nav' ? ' · 기본' : ''}</span>
          <span class="muted">${esc(t.desc)}</span></label>`;
      }).join('')}</div>`));
  },
  school: () => {
    const s = school || (school = getSchool());
    return page('학교 정보', '연간계획·행사계획이 학교 현황과 방학·재량휴업일을 여기서 가져가요.',
      card('학교', `<div class="set-fields">
          <label class="set-f"><span class="lab">학교명</span><input class="field" id="schName" value="${esc(s.name)}" autocomplete="off"></label>
          <label class="set-f"><span class="lab">학년도</span><input class="field" id="schYear" type="number" min="2020" max="2100" value="${s.year}"></label>
          <label class="set-f"><span class="lab">학급 수</span><input class="field" id="schClasses" type="number" min="0" value="${s.classes || ''}"></label>
          <label class="set-f"><span class="lab">학생 수</span><input class="field" id="schStudents" type="number" min="0" value="${s.students || ''}"></label>
        </div>`) +
      card('방학·재량휴업일', `<div class="break-list">${s.breaks.map((b, i) => `<div class="break-row">
          <input class="field" data-break="${i}" data-f="label" value="${esc(b.label)}" placeholder="예) 여름방학" aria-label="이름">
          <input class="field" type="date" data-break="${i}" data-f="from" value="${esc(b.from)}" aria-label="시작일">
          <span aria-hidden="true">~</span>
          <input class="field" type="date" data-break="${i}" data-f="to" value="${esc(b.to)}" aria-label="끝일">
          <button class="btn text" type="button" data-set="delBreak" data-i="${i}">빼기</button></div>`).join('') || '<p class="muted">아직 없어요.</p>'}</div>
        <div class="row"><button class="btn text" type="button" data-set="addBreak">+ 더하기</button></div>`) +
      `${msg ? `<p class="set-msg err" role="alert">${esc(msg)}</p>` : ''}<div class="row"><button class="btn primary" type="button" data-set="saveSchool">저장</button></div>`);
  },
  purchase: () => page('품의 기준', '',
    card('계약 기준 금액', `<label class="set-f"><span class="lab">원 (합계가 이 금액을 넘으면 「별도 계약 절차 확인 필요」라고 알려요)</span>
        <input class="field" id="limitWon" type="number" min="1" step="10000" value="${getPurchaseLimit()}"></label>
      <p class="muted">지금: ${won(getPurchaseLimit())}원 · 학교마다 다를 수 있어요. 행정실에 확인해 주세요.</p>
      ${msg ? `<p class="set-msg err" role="alert">${esc(msg)}</p>` : ''}
      <div class="row"><button class="btn primary" type="button" data-set="saveLimit">저장</button></div>`))
};

let curTab = 'roster';
function render(tab, section) {
  if (tab !== curTab) { msg = ''; school = null; aiMsg = null; }
  curTab = tab;
  if (!box || !section.contains(box)) { box = document.createElement('div'); box.className = 'set-box'; section.prepend(box); }
  box.innerHTML = (VIEWS[tab] || VIEWS.roster)();
}
const again = () => box && render(curTab, box.parentElement);

/* 짧은 요청으로 키·모델이 맞는지 확인 (PRD S-2) */
async function testAi() {
  aiMsg = { busy: true }; again();
  try {
    await ai.generate('연결 확인입니다. "확인"이라고만 답하세요.');
    aiMsg = { ok: true, text: `연결됐어요 · ${ai.providerName()}` };
  } catch (e) {
    aiMsg = { ok: false, text: ai.errorMessage(e && e.code, e) };
  }
  if (curTab === 'ai') again();
}

/* 화면의 방학 칸을 school.breaks로 읽어 옴 (저장 전 편집 상태 유지) */
function readBreaks() {
  const rows = [];
  box.querySelectorAll('[data-break]').forEach(el => { const i = +el.dataset.break; (rows[i] || (rows[i] = {}))[el.dataset.f] = el.value; });
  return rows.filter(Boolean).map(r => ({ label: r.label || '', from: r.from || '', to: r.to || '' }));
}
function readSchool() {
  return { name: box.querySelector('#schName').value, year: +box.querySelector('#schYear').value, classes: box.querySelector('#schClasses').value, students: box.querySelector('#schStudents').value, breaks: readBreaks() };
}

document.addEventListener('click', e => {
  if (!box || !box.contains(e.target)) return;
  const b = e.target.closest('[data-set]');
  if (b) {
    const a = b.dataset.set;
    if (a === 'openAi') { aiMsg = null; SSAM().ai.openSettings(); }
    else if (a === 'testAi') testAi();
    else if (a === 'addBreak') { school = { ...readSchool(), breaks: [...readBreaks(), { label: '', from: '', to: '' }] }; again(); }
    else if (a === 'delBreak') { const br = readBreaks(); br.splice(+b.dataset.i, 1); school = { ...readSchool(), breaks: br }; again(); }
    else if (a === 'saveSchool') {
      const s = readSchool();
      const bad = s.breaks.find(x => x.from && x.to && x.from > x.to);
      const empty = s.breaks.find(x => !x.from || !x.to);
      if (bad) { msg = `「${bad.label || '이름 없는 기간'}」의 시작일이 끝일보다 늦어요.`; school = s; again(); return; }
      if (empty) { msg = `「${empty.label || '이름 없는 기간'}」의 시작일과 끝일을 모두 넣어 주세요.`; school = s; again(); return; }
      msg = ''; school = setSchool(s); again(); toast('학교 정보를 저장했어요');
    } else if (a === 'saveLimit') {
      const v = box.querySelector('#limitWon').value;
      if (!setPurchaseLimit(v)) { msg = '기준 금액은 1원 이상으로 넣어 주세요.'; again(); return; }
      msg = ''; again(); toast(`계약 기준 금액을 ${won(getPurchaseLimit())}원으로 정했어요`);
    }
    return;
  }
  const pick = e.target.closest('[data-theme-pick]');
  if (pick) {
    setTheme(pick.dataset.themePick);
    box.querySelectorAll('[data-theme-pick] input').forEach(i => { i.checked = i.value === pick.dataset.themePick; });
  }
});

onEnter('settings', render);
