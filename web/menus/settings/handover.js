/* 설정 › 학년도 › 업무 인수인계서 (스펙 2026-11-06 L): 지금 학년도 자료에서 넣을 업무·항목을 고르고(처음엔 모두),
   「다음 담당자에게」를 쓰거나 [AI로 정리](위 내용만 보냄, 이름·전화번호 없이) → 한글·워드·PDF.
   다른 곳(채팅 「인수인계서」 등)은 import('./menus/settings/handover.js')의 openHandover()로 엶 */
import { go } from '../../core/shell.js';
import * as ai from '../../core/ai.js';
import { exportButton, exportDoc, docHtml } from '../../core/doc-export.js';
import { currentYear } from '../../core/years.js';
import { getSchool } from '../../core/settings.js';
import { GROUPS, collectHandover, pickData, isOn, buildHandover, handoverText, handoverPrompt, normNote, getSaved, saveHandover, dotDate } from './handover-model.js';

const SSAM = () => window.SSAM || {};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m, ms) => SSAM().toast && SSAM().toast(m, ms);
const won = n => Number(n || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

let st = null; // { data, picks, note } — 창을 열 때마다 새로
// [AI로 정리] 하는 중: 창을 닫고 다른 메뉴에 갔다 와서 다시 열어도 「정리하는 중」이고, 끝나면 그때 열린 창(다시 연 창)에 넣음
let aiBusy = false;

/* 설정 › 학년도로 가서 인수인계서 만들기 창을 엶 */
export function openHandover() {
  go('settings', 'years');
  openBuilder();
}

/* 고르기 목록의 한 줄: [이름, 덧붙임…] */
const LABEL = {
  duties: d => [d.name, d.year !== st.data.year ? `${d.year}학년도` : '', d.schedule.length ? `일정 ${d.schedule.length}개` : '일정 없음'],
  events: e => [e.name, e.date ? dotDate(e.date) : '날짜 없음', e.status],
  purchases: p => [p.title, p.kind, `${won(p.amount)}원`],
  docs: d => [d.title, d.due ? `기한 ${dotDate(d.due)}` : '기한 없음', d.done ? '완료' : '진행 중'],
  reports: r => [r.title, dotDate(r.date)]
};
const doc = () => buildHandover(pickData(st.data, st.picks), { note: st.note, today: today() });
const save = () => saveHandover({ note: st.note, picks: st.picks });

function groupHTML([g, label]) {
  const items = st.data[g] || [];
  if (!items.length) return '';
  return `<fieldset class="ho-group" data-hg="${g}"><legend><label><input type="checkbox" data-ho-all="${g}"> <b>${esc(label)}</b> <span class="muted" data-ho-count="${g}"></span></label></legend>
    <ul>${items.map(x => { const [main, ...rest] = LABEL[g](x); return `<li><label><input type="checkbox" data-ho-pick="${esc(x.id)}" data-g="${g}"${isOn(x, st.picks) ? ' checked' : ''}> <span>${esc(main)}</span> <span class="muted">${esc(rest.filter(Boolean).join(' · '))}</span></label></li>`; }).join('')}</ul></fieldset>`;
}

function openBuilder() {
  const saved = getSaved();
  st = { data: collectHandover({ year: currentYear(), school: getSchool().name }), picks: saved.picks, note: saved.note };
  const empty = GROUPS.every(([g]) => !(st.data[g] || []).length);
  SSAM().openSheet(`<h3>업무 인수인계서</h3>
    <p class="muted" style="margin:0">${st.data.year}학년도 자료를 모아 다음 담당자에게 넘길 문서를 만들어요. 넣을 것만 골라 주세요. 학생 자료·교직원 이름·전화번호는 넣지 않아요.</p>
    ${empty ? '<p class="banner info" style="margin:0"><span class="grow">아직 모을 자료가 없어요. 연간계획·행사계획·품의·공문 처리·결과 보고에 자료가 있으면 여기에 모여요.</span></p>' : `<div class="ho-groups">${GROUPS.map(groupHTML).join('')}</div>`}
    <label class="ho-note"><span class="lab">6. 다음 담당자에게</span><textarea class="field" id="hoNote" rows="5" placeholder="예) 3월 첫 주에 학부모 총회 자료부터 챙겨요.">${esc(st.note)}</textarea></label>
    <div class="row"><button class="btn" type="button" data-ho="ai" id="hoAi"${aiBusy ? ' disabled' : ''}>${aiBusy ? '정리하는 중…' : 'AI로 정리'}</button><span class="muted ho-hint">위에서 고른 내용만 보내요(이름·전화번호 없이). 3~6줄로 써 주고, 고쳐 써도 돼요.</span></div>
    <details class="ho-prev-wrap" open><summary>미리 보기</summary><div class="ho-prev" id="hoPrev"></div></details>
    <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-close>닫기</button>${exportButton('data-ho="export"', { cls: 'primary' })}</div>`,
  sh => {
    sh.classList.add('wide', 'ho-sheet');
    sh.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.hoPick) st.picks[el.dataset.hoPick] = el.checked;
      else if (el.dataset.hoAll) for (const x of st.data[el.dataset.hoAll] || []) st.picks[x.id] = el.checked;
      else return;
      save(); refresh(sh);
    });
    sh.addEventListener('input', e => { if (e.target.id === 'hoNote') { st.note = e.target.value; save(); refresh(sh, { note: true }); } });
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-ho]');
      if (!b) return;
      if (b.dataset.ho === 'ai') runAi();
      else if (b.dataset.ho === 'export') download();
    });
    refresh(sh);
  });
}

/* 개수·「모두」 체크·미리 보기를 지금 고른 것에 맞춤 (note: 글만 바뀜 → 체크는 그대로) */
function refresh(sh, { note = false } = {}) {
  if (!note) for (const [g] of GROUPS) {
    const items = st.data[g] || [], all = sh.querySelector(`[data-ho-all="${g}"]`);
    if (!all) continue;
    const n = items.filter(x => isOn(x, st.picks)).length;
    all.checked = n === items.length; all.indeterminate = n > 0 && n < items.length;
    sh.querySelectorAll(`[data-ho-pick][data-g="${g}"]`).forEach(i => { const x = items.find(y => y.id === i.dataset.hoPick); if (x) i.checked = isOn(x, st.picks); });
    sh.querySelector(`[data-ho-count="${g}"]`).textContent = `${n}/${items.length}`;
  }
  const prev = sh.querySelector('#hoPrev');
  if (prev) prev.innerHTML = docHtml(doc());
}

const openSh = () => document.querySelector('#sheetRoot .ho-sheet');
function drawAiBtn() {
  const b = openSh() && openSh().querySelector('#hoAi');
  if (b) { b.disabled = aiBusy; b.textContent = aiBusy ? '정리하는 중…' : 'AI로 정리'; }
}
async function runAi() {
  if (aiBusy) return;
  if (!ai.ready()) { toast('설정 › AI에서 키를 넣어 주세요', 5000); return; }
  // 「다음 담당자에게」는 빼고 1~5만 보냄 (이름·전화번호는 모을 때 이미 뺌)
  const text = handoverText(doc()), names = st.data.names;
  aiBusy = true; drawAiBtn();
  try {
    const v = await ai.generateJSON(handoverPrompt(text), { task: 'plan', valid: o => normNote(o).length > 0 });
    // 그새 창을 닫았다 다시 열었으면 다시 연 창의 글로(고른 것은 그 창 것 그대로) — 다시 연 창에서 고쳐도 옛 글로 덮이지 않게
    st.note = normNote(v, names).map(l => `- ${l}`).join('\n');
    save();
    const sh = openSh(), ta = sh && sh.querySelector('#hoNote');
    if (ta) { ta.value = st.note; refresh(sh, { note: true }); }
    toast(ta ? 'AI가 정리했어요. 고쳐 써도 돼요.' : '인수인계서의 「다음 담당자에게」를 AI가 정리해 두었어요. 설정 › 학년도에서 열어 보세요.', ta ? undefined : 6000);
  } catch (e) {
    toast(e && e.code === 'bad_json' ? 'AI 답을 읽지 못했어요. 다시 눌러 주세요.' : ai.errorMessage(e && e.code, e), 6000);
  }
  aiBusy = false; drawAiBtn();
}

async function download() {
  const d = doc();
  try { toast(await exportDoc(d, d.title), 6000); } catch (e) { toast('파일을 만들지 못했어요. 다시 눌러 주세요.', 5000); }
}
