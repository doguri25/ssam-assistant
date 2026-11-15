/* 문항·활동지 만들기의 「무엇으로 만들까요」 고르기 칸 (스펙 2026-11-15-docedit-minutes-quiz §3) — 단원평가 문항 만들기(unit-maker.js)·활동지 만들기(activity-maker.js)가 같이 씀.
   교과(진도표 교과, 없으면 직접 쓰기) → 단원 → 차시(기본: 진도표의 다음 차시, 「단원 전체」·여러 차시), 진도표가 없으면 「단원·성취기준·범위」 글 칸.
   학년·문항 수·수준·유형. 진도표·학급 정보는 학급 메뉴 자료를 읽기만 함(class-model) — 학급 화면은 고치지 않음.
   직접 쓴 범위는 교직원 이름·전화번호·이메일을 가려 보내고(core/redact.js, 명단·주민번호 줄은 뺌) 돌아온 문항에서 되돌림(scope.back → make-scope unmaskItem) */
import { listSubjects, makeCtx, progressOf, getInfo } from '../class/class-model.js';
import { redactText } from '../../core/redact.js';
import { unitsOf, defaultPick, scopeOf, freeScope, clampInt, LEVELS, lessonNo } from './make-scope.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SUBJECTS = ['국어', '수학', '사회', '과학', '영어', '도덕', '음악', '미술', '체육', '실과'];
const FREE = '__free';

function subjects() { try { return listSubjects().filter(s => s.lessons.length); } catch (e) { return []; } }
/* 진도표의 다음 차시 자리(아직 안 한 첫 차시)와 진도표대로라면 지금 할 차시 자리. 못 셈하면 null */
function progress(sub) {
  try { const p = progressOf(makeCtx(), sub); return { next: p.actual, expected: p.started ? p.expected : null }; } catch (e) { return { next: null, expected: null }; }
}

/* kinds: [[id, 이름]], count: { min, max, d }, unitAll: 단원을 바꾸면 그 단원 차시를 다 고름(단원평가) */
export function newPick({ kinds, count = { min: 3, max: 20, d: 5 }, unitAll = false } = {}) {
  let grade = null;
  try { grade = getInfo().grade; } catch (e) {}
  const S = { kinds, countRange: count, unitAll, subs: subjects(), mode: 'free', subId: '', unit: 0, picked: [], next: null, subject: '', free: '', grade, count: count.d, level: 'normal', chosen: kinds.map(k => k[0]) };
  if (S.subs.length) selectSub(S, S.subs[0].id);
  return S;
}
/* 진도표가 바뀌었을 수 있어 그릴 때마다 다시 읽음: 고른 교과가 그대로 있으면 고른 차시도 그대로, 없어졌으면 첫 교과(진도표가 비면 직접 쓰기).
   선생님이 고른 「직접 쓰기」는 그대로 */
export function syncSubjects(S) {
  S.subs = subjects();
  if (S.mode !== 'plan' || S.subs.some(s => s.id === S.subId)) return S;
  if (S.subs.length) selectSub(S, S.subs[0].id); else { S.mode = 'free'; S.subId = ''; S.picked = []; }
  return S;
}
const curSub = S => S.subs.find(s => s.id === S.subId) || null;
function selectSub(S, id) {
  const sub = S.subs.find(s => s.id === id);
  if (!sub) return;
  const p = progress(sub);
  S.mode = 'plan'; S.subId = id; S.subject = sub.name; S.next = Number.isInteger(p.next) && p.next < sub.lessons.length ? p.next : null;
  S.picked = defaultPick(sub, p);
  const g = unitsOf(sub).findIndex(u => u.idx.includes(S.picked[0]));
  S.unit = Math.max(0, g);
}

export function pickHTML(S) {
  const sub = S.mode === 'plan' ? curSub(S) : null, units = sub ? unitsOf(sub) : [], u = units[S.unit] || units[0];
  const subSel = S.subs.length ? `<label class="yp-f"><span class="lab">교과</span><select class="field" id="mkSub" data-mp="sub">
      ${S.subs.map(s => `<option value="${esc(s.id)}"${S.mode === 'plan' && s.id === S.subId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
      <option value="${FREE}"${S.mode === 'free' ? ' selected' : ''}>직접 쓰기(진도표 밖)</option></select></label>` : '';
  let scope;
  if (sub && u) {
    const all = u.idx.length > 1 && u.idx.every(i => S.picked.includes(i));
    scope = `<label class="yp-f"><span class="lab">단원</span><select class="field" id="mkUnit" data-mp="unit">
        ${units.map((g, i) => `<option value="${i}"${g === u ? ' selected' : ''}>${esc(g.name || '단원 없음')}</option>`).join('')}</select></label>
      <fieldset class="mk-lessons"><legend class="lab">차시</legend>
        ${u.idx.length > 1 ? `<label class="mk-chk mk-all"><input type="checkbox" data-mp="all"${all ? ' checked' : ''}><span>단원 전체</span></label>` : ''}
        ${u.idx.map(i => { const l = sub.lessons[i]; return `<label class="mk-chk"><input type="checkbox" data-mp="lesson" value="${i}"${S.picked.includes(i) ? ' checked' : ''}><span class="mk-lt">${esc(lessonNo(sub, i))} ${esc(l.title)}${l.pages ? ` <span class="muted">· ${esc(l.pages)}</span>` : ''}</span>${i === S.next ? '<span class="chip mk-next">다음 차시</span>' : ''}</label>`; }).join('')}
      </fieldset>`;
  } else {
    scope = `<label class="yp-f"><span class="lab">교과</span><input class="field" id="mkSubject" data-mp="subject" list="mkSubjects" value="${esc(S.subject)}" autocomplete="off"></label>
      <datalist id="mkSubjects">${SUBJECTS.map(s => `<option value="${s}">`).join('')}</datalist>
      <label class="yp-f mk-wide"><span class="lab">단원·성취기준·범위</span><textarea class="field" id="mkFree" data-mp="free" rows="3" placeholder="예) 2. 동물의 생활 — 동물을 생김새에 따라 분류하기 (교과서 30~37쪽)">${esc(S.free)}</textarea></label>
      ${S.subs.length ? '' : '<p class="muted mk-hint">학급 › 진도표·시수에 진도표를 넣으면 차시를 골라 만들 수 있어요.</p>'}`;
  }
  const r = S.countRange;
  return `<div class="mk-pick">
    <div class="mk-scope">${subSel}${scope}</div>
    <div class="mk-opts">
      <label class="yp-f"><span class="lab">학년</span><input class="field" id="mkGrade" data-mp="grade" type="number" min="1" max="6" value="${esc(S.grade == null ? '' : S.grade)}"></label>
      <label class="yp-f"><span class="lab">문항 수 (${r.min}~${r.max})</span><input class="field" id="mkCount" data-mp="count" type="number" min="${r.min}" max="${r.max}" value="${esc(S.count)}"></label>
      <label class="yp-f"><span class="lab">수준</span><select class="field" id="mkLevel" data-mp="level">${LEVELS.map(([k, l]) => `<option value="${k}"${k === S.level ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <fieldset class="mk-kinds"><legend class="lab">유형 (섞어 만들어요)</legend>
      ${S.kinds.map(([k, l]) => `<label class="mk-chk"><input type="checkbox" data-mp="kind" value="${k}"${S.chosen.includes(k) ? ' checked' : ''}><span>${l}</span></label>`).join('')}
    </fieldset>
  </div>`;
}

/* 고르기 칸의 input·change → 상태. 다시 그려야 하면 true */
export function pickEvent(S, el, type) {
  const k = el && el.dataset && el.dataset.mp;
  if (!k) return false;
  if (k === 'sub' && type === 'change') {
    if (el.value === FREE) { S.mode = 'free'; S.subId = ''; S.picked = []; } else selectSub(S, el.value);
    return true;
  }
  const sub = curSub(S), units = sub ? unitsOf(sub) : [];
  if (k === 'unit' && type === 'change') {
    S.unit = Number(el.value) || 0;
    const g = units[S.unit];
    S.picked = g ? (S.unitAll ? [...g.idx] : [g.idx[0]]) : [];
    return true;
  }
  if (k === 'all' && type === 'change') {
    const g = units[S.unit];
    S.picked = g && el.checked ? [...g.idx] : [];
    return true;
  }
  if (k === 'lesson' && type === 'change') {
    const i = Number(el.value);
    S.picked = el.checked ? [...new Set([...S.picked, i])].sort((a, b) => a - b) : S.picked.filter(x => x !== i);
    const g = units[S.unit], all = el.closest('.mk-lessons') && el.closest('.mk-lessons').querySelector('[data-mp="all"]');
    if (all && g) all.checked = g.idx.every(x => S.picked.includes(x));
    return false;
  }
  if (k === 'kind' && type === 'change') { S.chosen = S.kinds.map(x => x[0]).filter(x => (x === el.value ? el.checked : S.chosen.includes(x))); return false; }
  if (k === 'subject') S.subject = el.value;
  else if (k === 'free') S.free = el.value;
  else if (k === 'grade') S.grade = el.value === '' ? null : clampInt(el.value, 1, 6, null);
  else if (k === 'count') S.count = el.value;
  else if (k === 'level') S.level = el.value;
  return false;
}

/* 만들 때 쓰는 값: { scope, grade, count, level, kinds, error } — error가 있으면 만들지 않음 */
export function pickValue(S) {
  const r = S.countRange, count = clampInt(S.count, r.min, r.max, r.d);
  const base = { grade: S.grade == null ? null : clampInt(S.grade, 1, 6, null), count, level: S.level, kinds: S.chosen.slice() };
  let scope = null, error = '';
  const sub = S.mode === 'plan' ? curSub(S) : null;
  if (sub) { if (S.picked.length) scope = { ...scopeOf(sub, S.picked), titles: S.picked.map(i => sub.lessons[i] && sub.lessons[i].title).filter(Boolean) }; else error = '차시를 하나 넘게 골라 주세요.'; }
  else if (!S.free.trim()) error = '단원·성취기준·범위를 써 주세요.';
  else {
    const r = redactText(S.free);
    if (!r.text.trim()) error = '범위에 명단·주민번호 줄만 있어 보낼 글이 없어요. 단원·성취기준·범위만 써 주세요.';
    else scope = { ...freeScope(S.subject, r.text), titles: [], back: r.back };
  }
  if (!error && !base.kinds.length) error = '유형을 하나 넘게 골라 주세요.';
  return { ...base, scope, error };
}
