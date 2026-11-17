/* 수준별 기준표(루브릭) 규칙 — 화면 없이 순수 함수만 (스펙 2026-11-16 rubric-design).
   평가요소마다 「채점 요소 × 수준」 기준표를 만들어 두고, 평가지 채점·교과 평어가 같은 과목·같은 평가요소일 때만 쓴다.
   rubric = { v: 1, subject, elem, unit, std, levels, rows: [{ id, name, points, cells: { [lv]: { text, pts } } }], task, at }
   저장: core/store.js 「rubrics」 = { v: 1, items: { [열쇠]: rubric } } (학년도마다) */
import { get, set, remove } from '../../core/store.js';
import { makeRedactor } from '../../core/redact.js';

export const LV_NAME = { top: '최상', high: '상', mid: '중', low: '하', none: '안 함' };
const L3 = ['high', 'mid', 'low'], L4 = ['top', 'high', 'mid', 'low'];
// 수준 점수 비율(배점에 곱해 반올림): 3단계 1 / 0.7 / 0.4, 4단계 1 / 0.8 / 0.6 / 0.4
const RATIO3 = [1, 0.7, 0.4], RATIO4 = [1, 0.8, 0.6, 0.4];
const ROWS_MIN = 2, ROWS_MAX = 5, ROWS_DEF = 3, CELL_MAX = 200, NAME_MAX = 40;

const str = t => String(t == null ? '' : t);
/* 열쇠 글: 띄어쓰기·문장부호를 뺌(evaluate.js normKey와 같은 규칙) */
const bare = t => str(t).replace(/[\s.,·ㆍ'"‘’“”~()!?;:\-]/g, '');
const num = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);
const nrows = n => Math.max(ROWS_MIN, Math.min(ROWS_MAX, Math.round(Number(n)) || ROWS_DEF));
const rowName = (r, i) => str(r && r.name).trim() || `요소 ${i + 1}`;
/* 요소 이름 맞추기 글: AI가 채점 블록(「1. 곱셈 원리 이해 (34점)」)을 따라 붙인 앞 번호(「1.」「2)」)·뒤 배점(「(34점)」)을 떼고 열쇠 글로 */
const nameKey = t => bare(str(t).replace(/^\s*\d+\s*[.)]\s*/, '').replace(/\(\s*\d+\s*점\s*\)\s*$/, ''));
/* 채점에 쓰는 요소: 칸 글이 하나라도 있는 요소. 칸 글이 하나도 없는 요소([요소 더하기]로 넣고 비워 둔 것)는
   AI로 보내지 않고 요소별 수준·기준 점수·「모든 요소」 셈에도 넣지 않음 */
const gradable = (r, lvs) => !!r && lvs.some(lv => { const c = r.cells && r.cells[lv]; return !!(c && str(c.text).trim()); });
// 학교 수준 낱말(띄어쓰기 뺀 글) → 수준 키: 3단계 잘함·보통·노력 요함, 4단계 매우 잘함·잘함·보통·노력 요함
const WORDS = { 3: { 잘함: 'high', 보통: 'mid', 노력요함: 'low' }, 4: { 매우잘함: 'top', 잘함: 'high', 보통: 'mid', 노력요함: 'low' } };

/* ---------- 열쇠·수준·배점 ---------- */

/* 과목·평가요소 → 열쇠 (어느 하나라도 비면 '' — 기준표를 붙이지 않음) */
export function rubricKey(subject, elem) {
  const a = bare(subject), b = bare(elem);
  return a && b ? `${a}|${b}` : '';
}
/* 평가계획 단원 줄 → 열쇠. 평가요소가 비면 화면 제목과 같게 단원 이름 */
export function unitKey(u) { return u ? rubricKey(u.subject, u.elem || u.unit) : ''; }

/* 평가기준에 「최상」이 있으면 4단계, 없으면 3단계 */
export function levelsFor(u) { return u && u.crit && u.crit.top ? [...L4] : [...L3]; }

/* 요소 n개의 기본 배점(100을 나눠 나머지는 앞 요소부터 1점씩)과 수준 점수 → [{ points, pts: { [lv]: n } }] */
export function defaultPoints(n, levels) {
  const lvs = Array.isArray(levels) && levels.length ? levels : L3, cnt = Math.max(1, Math.round(n) || 1);
  const base = Math.floor(100 / cnt), rest = 100 - base * cnt;
  return Array.from({ length: cnt }, (_, i) => {
    const points = base + (i < rest ? 1 : 0);
    return { points, pts: ptsFor(points, lvs) };
  });
}
function ptsFor(points, levels) {
  const ratio = levels.length === 4 ? RATIO4 : RATIO3, pts = {};
  levels.forEach((lv, i) => { pts[lv] = Math.round(points * (ratio[i] == null ? ratio[ratio.length - 1] : ratio[i])); });
  return pts;
}
/* 배점 하나의 기본 수준 점수 { [lv]: n } (시트에서 배점을 고치면 고치지 않은 수준 점수가 따라감) */
export function levelPts(points, levels) {
  return ptsFor(Number(points) || 0, Array.isArray(levels) && levels.length ? levels : L3);
}

/* 칸 하나 만들기(빈 글) */
const emptyCells = pts => { const c = {}; for (const lv of Object.keys(pts)) c[lv] = { text: '', pts: pts[lv] }; return c; };
const nextId = rows => { let n = 1; const used = new Set(rows.map(r => r.id)); while (used.has(`r${n}`)) n++; return `r${n}`; };

/* 빈 기준표 (요소 2~5개, 기본 3) */
export function blankRubric(u, { rows = ROWS_DEF, levels } = {}) {
  const lvs = Array.isArray(levels) && levels.length ? levels : levelsFor(u);
  const def = defaultPoints(nrows(rows), lvs);
  return {
    v: 1, subject: str(u && u.subject), elem: str(u && (u.elem || u.unit)), unit: str(u && u.unit), std: str(u && u.std),
    levels: [...lvs], rows: def.map((d, i) => ({ id: `r${i + 1}`, name: '', points: d.points, cells: emptyCells(d.pts) })),
    task: '', at: 0
  };
}

/* 요소 더하기 → 새 기준표(빈 이름·빈 칸, 요소 n+1개일 때의 기본 배점). 5개면 그대로(복사본) */
export function addRow(rb) {
  const out = JSON.parse(JSON.stringify(rb)), lvs = out.levels && out.levels.length ? out.levels : L3;
  if (out.rows.length >= ROWS_MAX) return out;
  const d = defaultPoints(out.rows.length + 1, lvs)[out.rows.length];
  out.rows.push({ id: nextId(out.rows), name: '', points: d.points, cells: emptyCells(d.pts) });
  return out;
}

/* 3단계 ↔ 4단계 바꾸기 → 새 기준표. 있던 칸의 글·고친 점수는 그대로, 없어진 수준 칸은 빼고, 새 수준 칸은 빈 글·기본 점수 */
export function setLevels(rb, levels) {
  const lvs = [...levels], out = JSON.parse(JSON.stringify(rb));
  out.levels = lvs;
  out.rows.forEach(r => {
    const def = ptsFor(Number(r.points) || 0, lvs), cells = {};
    for (const lv of lvs) {
      const c = r.cells && r.cells[lv];
      cells[lv] = c ? { text: str(c.text), pts: Number(c.pts) || 0 } : { text: '', pts: def[lv] };
    }
    r.cells = cells;
  });
  return out;
}

/* ---------- AI 기준표 만들기 ---------- */

/* AI로 보낼 요청 글. 학년·과목·단원·성취기준·평가요소·평가기준과 과제 설명만(과제 설명은 교직원 이름·연락처를 가림). 학생 자료는 없음.
   redactor를 넘기면 그 가리개로 가려서, 부르는 쪽이 돌아온 글을 normMade({ redactor })로 되돌릴 수 있음 */
export function makePrompt(u, { task, rows = ROWS_DEF, levels, grade, redactor } = {}) {
  const lvs = Array.isArray(levels) && levels.length ? levels : levelsFor(u), n = nrows(rows), c = (u && u.crit) || {};
  const g = grade ? `${grade}학년 ` : '';
  const crit = (lvs.includes('top') ? [['top', c.top]] : []).concat([['high', c.high], ['mid', c.mid], ['low', c.low]])
    .map(([lv, t]) => `${LV_NAME[lv]}: ${t || '-'}`).join(' / ');
  const r = redactor || makeRedactor();
  const tk = str(task).trim() ? r.lines(str(task).trim().slice(0, 1000).split('\n')).filter(Boolean).map(x => x.text).join('\n').trim() : '';
  const names = lvs.map(lv => LV_NAME[lv]).join('·');
  const cellEx = lvs.map(lv => `"${lv}": { "text": "...", "pts": 0 }`).join(', ');
  return [
    `당신은 초등학교 수행평가의 수준별 채점 기준표를 만드는 경력 많은 초등 교사입니다.`,
    `아래 평가 정보를 바탕으로 채점 요소 ${n}개짜리 수준별 채점 기준표를 만드세요.`,
    ``,
    `[학년·과목] ${g}${str(u && u.subject)}`,
    u && u.unit ? `[단원] ${u.unit}` : null,
    u && u.area ? `[평가영역] ${u.area}` : null,
    u && u.elem ? `[평가요소] ${u.elem}` : null,
    u && u.std ? `[성취기준] ${str(u.std).slice(0, 700)}` : null,
    u && u.focus ? `[수업·평가 방법과 주안점] ${str(u.focus).slice(0, 700)}` : null,
    `[평가기준] ${crit}`,
    tk ? `[과제 설명] ${tk}` : null,
    ``,
    `[만드는 규칙]`,
    `1. 성취기준과 평가기준에서 나온, 서로 겹치지 않는 채점 요소를 정확히 ${n}개 만드세요. 요소마다 이름(${NAME_MAX}자 안쪽)과 배점(요소 ${n}개의 배점 합은 100)을 주세요.`,
    `2. 수준은 ${names} ${lvs.length}단계입니다. 수준마다 관찰할 수 있는 행동으로 쓰세요(무엇을 쓰거나 하면 그 수준인지). 위 수준은 아래 수준을 포함하게 쓰세요.`,
    `3. 부정적인 말 대신 해낸 것 중심으로 쓰세요(가장 낮은 수준도). 개조식 한 문장, 80자 안쪽, 줄바꿈과 따옴표는 쓰지 마세요.`,
    `4. 수준마다 pts는 그 수준의 점수입니다. 배점 이하이고, 위 수준일수록 크거나 같아야 합니다.`,
    ``,
    `[답 형식] 설명 없이 아래 JSON만 쓰세요.`,
    `{ "rows": [ { "name": "요소 이름", "points": 34, "cells": { ${cellEx} } } ] }`
  ].filter(x => x != null).join('\n');
}

/* 칸 글 다듬기: 줄바꿈·따옴표 빼고 공백을 줄임 */
const tidy = t => str(t).replace(/[\r\n]+/g, ' ').replace(/["'“”‘’`]/g, '').replace(/\s+/g, ' ').trim();

/* AI 답(JSON을 읽은 것) → 기준표, 요소가 하나도 없으면 null.
   요소 수 맞추기(넘치면 자르고 모자라면 있는 만큼) · 수준 키 맞추기(없는 수준 칸은 빈 글·기본 점수) · 배점·점수 범위(0~배점, 위 수준 ≥ 아래 수준) · 글 다듬기.
   opts.redactor를 넘기면 가린 이름을 되돌리고(깨진 자리 표시가 남은 칸은 빈 글) */
export function normMade(json, u, { rows = ROWS_DEF, levels, redactor } = {}) {
  const lvs = Array.isArray(levels) && levels.length ? levels : levelsFor(u);
  const src = json && (Array.isArray(json.rows) ? json.rows : Array.isArray(json) ? json : null);
  if (!src) return null;
  const clean = (t, max) => {
    let s = tidy(t);
    if (redactor) s = redactor.bad(s) ? '' : redactor.back(s);
    return s.slice(0, max).trim();
  };
  const kept = src.filter(r => r && typeof r === 'object').map(r => {
    const name = clean(r.name, NAME_MAX), cells = r.cells && typeof r.cells === 'object' ? r.cells : {};
    const text = lv => { const c = cells[lv]; return clean(c && typeof c === 'object' ? c.text : c, CELL_MAX); };
    return { r, name, cells, text };
  }).filter(x => x.name || lvs.some(lv => x.text(lv))).slice(0, nrows(rows));
  if (!kept.length) return null;
  const def = defaultPoints(kept.length, lvs);
  const out = [];
  kept.forEach((x, i) => {
    const p = num(x.r.points);
    const points = Number.isFinite(p) ? Math.max(0, Math.min(100, Math.round(p))) : def[i].points;
    const dpts = ptsFor(points, lvs), cells = {};
    let low = 0; // 아래 수준에서 위로 올라가며 점수를 고침(위 수준 ≥ 아래 수준, 0~배점)
    for (let k = lvs.length - 1; k >= 0; k--) {
      const lv = lvs[k], c = x.cells[lv], v = num(c && typeof c === 'object' ? c.pts : NaN);
      const pts = Math.min(points, Math.max(low, Number.isFinite(v) ? Math.round(v) : dpts[lv]));
      cells[lv] = { text: x.text(lv), pts };
      low = pts;
    }
    const ordered = {}; lvs.forEach(lv => { ordered[lv] = cells[lv]; });
    out.push({ id: nextId(out), name: x.name, points, cells: ordered });
  });
  return {
    v: 1, subject: str(u && u.subject), elem: str(u && (u.elem || u.unit)), unit: str(u && u.unit), std: str(u && u.std),
    levels: [...lvs], rows: out, task: '', at: 0
  };
}

/* ---------- 저장 (평가요소 열쇠마다 하나) ---------- */

export function loadAll() {
  const d = get('rubrics', null);
  return d && typeof d === 'object' && d.items && typeof d.items === 'object' ? d.items : {};
}
export function getFor(u) {
  const k = unitKey(u);
  return k ? loadAll()[k] || null : null;
}
/* 저장 → 됐으면 true (열쇠가 없거나 저장이 안 되면 false). 과목·평가요소·단원·성취기준은 단원 줄에서 다시 적고 고친 때를 남김 */
export function saveFor(u, rb) {
  const k = unitKey(u);
  if (!k || !rb) return false;
  rb.subject = str(u.subject); rb.elem = str(u.elem || u.unit); rb.unit = str(u.unit); rb.std = str(u.std); rb.at = Date.now();
  return set('rubrics', { v: 1, items: { ...loadAll(), [k]: rb } });
}
export function removeFor(u) {
  const k = unitKey(u);
  if (!k) return;
  const items = { ...loadAll() };
  if (!(k in items)) return;
  delete items[k];
  if (Object.keys(items).length) set('rubrics', { v: 1, items }); else remove('rubrics');
}

/* ---------- 채점 ---------- */

/* AI로 보낼 칸 글: 사람 이름·전화번호·이메일은 ○○○로(과제 설명에서 되돌린 교직원 이름이 칸에 남아도 채점·평어 AI로 가지 않게 — 화면 글은 그대로).
   주민번호·계좌가 든 글은 보내지 않음('') */
const TOKEN_ANY = /〔\s*이름\s*\d+\s*〕|\{\{\s*\d+\s*\}\}/g;
export function aiCell(text) {
  const t = str(text);
  if (!t.trim()) return t;
  const out = makeRedactor().line(t);
  return out ? out.text.replace(TOKEN_ANY, '○○○') : '';
}
export const sumPoints = rb => ((rb && rb.rows) || []).reduce((a, r) => a + (Number(r.points) || 0), 0);

/* 평가지 채점 요청에 더할 글. 칸 글이 하나도 없는 요소는 빼고(번호는 이어서, 배점 합에도 넣지 않음), 빈 칸 글도 뺌 */
export function gradeBlock(rb) {
  const lvs = (rb && rb.levels) || L3, rows = ((rb && rb.rows) || []).map((r, i) => [r, i]).filter(([r]) => gradable(r, lvs));
  const sum = rows.reduce((a, [r]) => a + (Number(r.points) || 0), 0);
  return [`[수준별 채점 기준표] (배점 합 ${sum}점)`, ...rows.map(([r, i], k) => {
    const cells = lvs.map(lv => { const c = r.cells && r.cells[lv]; return c && str(c.text).trim() ? `${LV_NAME[lv]}(${Number(c.pts) || 0}점): ${aiCell(str(c.text).trim())}` : ''; }).filter(Boolean);
    return `${k + 1}. ${rowName(r, i)} (${Number(r.points) || 0}점) — ${cells.join(' / ')}`;
  })].join('\n');
}

/* AI가 준 요소별 수준 → [{ name(기준표의 이름), level(키 또는 'none') }].
   이름은 앞 번호·뒤 배점을 떼고 맞춤(nameKey). 수준은 키(high)·이름(상·안 함)·학교 수준 낱말(잘함·보통·노력 요함, 4단계는 매우 잘함도)로 받음.
   모르는 요소·수준·칸 글이 없는 요소는 버리고 같은 요소는 처음 것만 */
export function normRb(list, rb) {
  const rows = (rb && rb.rows) || [], lvs = (rb && rb.levels) || L3, out = [], seen = new Set();
  if (!Array.isArray(list)) return out;
  const byName = new Map(rows.map((r, i) => [r, i]).filter(([r]) => gradable(r, lvs)).map(([r, i]) => [nameKey(rowName(r, i)), rowName(r, i)]));
  const words = WORDS[lvs.length] || {};
  for (const it of list) {
    if (!it || typeof it !== 'object') continue;
    const k = nameKey(it.name), name = byName.get(k);
    if (!name || seen.has(k)) continue;
    const raw = str(it.level).trim(), b = bare(raw).toLowerCase();
    let lv = null;
    if (b === 'none' || b === bare(LV_NAME.none)) lv = 'none';
    else if (lvs.includes(raw) || lvs.includes(b)) lv = lvs.includes(raw) ? raw : b;
    else lv = lvs.find(x => bare(LV_NAME[x]) === b) || (lvs.includes(words[b]) ? words[b] : null);
    if (!lv) continue;
    seen.add(k);
    out.push({ name, level: lv });
  }
  return out;
}

/* 기준 점수 = 고른 수준 점수 합 ÷ 배점 합 × 100 (반올림). 「안 함」은 0점으로 배점은 분모에 남김.
   채점에 쓰는 요소(칸 글이 있는 요소) 하나라도 수준이 없으면(AI가 요소를 빠뜨림·모르는 수준) null — 점수를 자르지 않음
   (빠진 요소를 버리고 셈하면 남은 요소만으로 점수가 부풀 수 있어서). 칸 글이 없는 요소는 셈하지 않음. 배점 합이 0이어도 null */
export function baseScore(rbList, rb) {
  if (!Array.isArray(rbList) || !rbList.length || !rb) return null;
  const rows = rb.rows || [], lvs = rb.levels || L3, seen = new Set();
  let got = 0, total = 0;
  for (const it of rbList) {
    if (!it || (it.level !== 'none' && !lvs.includes(it.level))) continue;
    const i = rows.findIndex((r, j) => gradable(r, lvs) && nameKey(rowName(r, j)) === nameKey(it.name));
    if (i < 0 || seen.has(i)) continue;
    seen.add(i);
    total += Number(rows[i].points) || 0;
    const c = it.level === 'none' ? null : rows[i].cells && rows[i].cells[it.level];
    got += c ? Number(c.pts) || 0 : 0;
  }
  if (rows.some((r, j) => gradable(r, lvs) && !seen.has(j))) return null;
  return total > 0 ? Math.round(got / total * 100) : null;
}

/* 최종 점수를 기준 점수 −4~+4(0~100)로 자름. 기준 점수가 없으면 그대로 */
export function clampScore(score, base) {
  const s = Number(score);
  if (base == null || !Number.isFinite(Number(base))) return s;
  const b = Number(base);
  if (!Number.isFinite(s)) return Math.max(0, Math.min(100, b));
  return Math.max(0, Math.min(100, Math.round(Math.min(b + 4, Math.max(b - 4, s)))));
}

/* ---------- 평어 ---------- */

/* 평가지 채점 평어의 근거 줄: 학생이 한 일(고른 수준의 칸 글)만. 수준 이름은 넣지 않고 「안 함」·빈 칸 글은 뺌 */
export function evidenceLines(rbList, rb) {
  const rows = (rb && rb.rows) || [], out = [];
  for (const it of Array.isArray(rbList) ? rbList : []) {
    if (!it || it.level === 'none') continue;
    const i = rows.findIndex((r, j) => nameKey(rowName(r, j)) === nameKey(it.name));
    const c = i < 0 ? null : rows[i].cells && rows[i].cells[it.level], t = c ? str(c.text).trim() : '';
    if (t) out.push(`기준표 「${rowName(rows[i], i)}」: ${t}`);
  }
  return out;
}

/* 교과 평어 요청에 더할 그 수준의 요소별 설명 (기준표가 없거나 쓸 글이 없으면 '').
   최상인데 3단계 기준표면 상 설명에 「이보다 한 걸음 더 나아간 모습」을 덧붙임 */
export function levelLines(rb, lv) {
  if (!rb || !Array.isArray(rb.rows)) return '';
  const lvs = rb.levels || L3, over = lv === 'top' && !lvs.includes('top'), use = over ? 'high' : lv;
  if (!lvs.includes(use)) return '';
  const parts = rb.rows.map((r, i) => { const c = r.cells && r.cells[use], t = c ? str(c.text).trim() : ''; return t ? `${rowName(r, i)}: ${aiCell(t)}` : ''; }).filter(Boolean);
  if (!parts.length) return '';
  const line = `[수준별 기준표 — ${LV_NAME[use]}] ${parts.join(' / ')}`;
  return over ? `${line}\n이보다 한 걸음 더 나아간 모습을 바탕으로 써요.` : line;
}

/* ---------- 내려받기 ---------- */

const fileSafe = t => str(t).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
/* 파일 이름 (확장자 없이) */
export function docName(rb) { return `수준별 기준표-${fileSafe(rb && rb.subject)}-${fileSafe(rb && (rb.elem || rb.unit))}`; }

/* core/hwpx.js 문서 꼴 — 한글·워드·PDF */
export function rubricDoc(rb, { grade } = {}) {
  const x = rb || {}, lvs = x.levels || L3, rows = x.rows || [], blocks = [];
  const g = grade ? `${grade}학년 ` : '';
  const info = [`${g}${str(x.subject)}`.trim(), str(x.unit).trim(), str(x.std).trim() ? `성취기준 ${str(x.std).trim()}` : ''].filter(Boolean).join(' · ');
  if (info) blocks.push({ type: 'p', text: info });
  if (str(x.task).trim()) blocks.push({ type: 'p', text: `과제: ${str(x.task).trim()}` });
  blocks.push({
    type: 'table', head: true, widths: [3, 1, ...lvs.map(() => 4)],
    rows: [['채점 요소', '배점', ...lvs.map(lv => LV_NAME[lv])], ...rows.map((r, i) => [rowName(r, i), `${Number(r.points) || 0}점`,
      ...lvs.map(lv => { const c = (r.cells && r.cells[lv]) || {}, t = str(c.text).trim(); return t ? `${t} (${Number(c.pts) || 0}점)` : `(${Number(c.pts) || 0}점)`; })])]
  });
  return { title: `${str(x.elem || x.unit).trim()} 수준별 채점 기준표`, blocks };
}
