/* 기초학력 캠프 › 학교 한글 양식(.hwpx) 표 채우기 (스펙 2026-11-11 「학교 한글 양식 표 채우기」).
   넣은 양식에서 맞는 표를 찾아(core/hwpx-table.js) 칸 이름으로 칸 뜻을 알아보고 캠프 값을 채움. 다른 표(결재란)·문단·제목은 그대로,
   「총 (   )시간」·「지도교사 :」 뒤 이름만 바꿈. 확인(서명)·비고처럼 모르는 칸은 본 줄 글 그대로(비어 있으면 빈칸).

   fillCampForm(docId, camp, formBytes) → Promise<{ bytes: Uint8Array, warn: string[] }>
     - docId: 'confirm'(수업 확인서) | 'attend'(출석부: camp.unit 'period'면 교시형, 'day'면 날짜형 — 양식에 관찰 표가 있으면 그것도) | 'observe'(관찰 기록부) | 'report'(결과 보고서)
     - camp: camp-model.js normCamp 꼴(학생 이름 포함 — 이 컴퓨터 안에서만 씀, AI로 보내지 않음)
     - formBytes: 넣은 .hwpx 파일(Uint8Array·ArrayBuffer)
     - warn: 양식 칸이 모자라거나 합쳐져 다 못 적은 것(학생 칸·날짜 칸·지도 시간) — 화면이 알림
   Error code: 'NOT_HWPX'(깨진 파일) · 'NO_MATCH'(채울 표를 못 찾음) · 'REPORT_DEFAULT'(결과 보고서는 글 머리만 따라 기본 양식으로) */
import { readTables, pickTable, fillTable, headRows } from '../../core/hwpx-table.js';
import { mapColumns, confirmCells, markOf, dayMark, gradeClass, hoursText } from './camp-docs.js';
import { sortSessions, campDates, attCount, hoursTotal, fmtShort } from './camp-model.js';

export const REPORT_DEFAULT_MSG = '결과 보고서는 쓴 글을 기본 양식으로 내려받았어요(학교 양식은 글 머리만 따라요).';
export const NO_MATCH_MSG = '학교 양식에서 채울 표를 찾지 못해 기본 양식으로 내려받았어요.';
const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
const squash = s => String(s == null ? '' : s).replace(/\s+/g, '');
const HOURS = /총\s*\(\s*\d*\s*\)\s*시간/;
const FOOT = /^(합계|총계|계)$/;
/* 학생·날짜 칸이 아닌 칸: 계·비고·확인·서명·사인·출석률 … */
const EXCL = /^(합|총)?계$|비고|확인|서명|날인|사인|출석률|출석수|결석수/;
/* 두~네 글자라도 이름이 아닌 칸 이름 */
const NOT_NAME = /^(교과|과목|교과명|성별|학년|반|번호|순서|결석|지각|조퇴|장소|단원|차시|활동|내용|지도내용|학습내용|교사|지도교사|교시|시간|날짜|일시|요일|기타|메모|특이사항|출석|합계|총계)$/;
const SLOT = /^(학생|아동|이름|성명)?\d+$/;          // 「학생1」·「1」 같은 빈 학생 칸
const DATEISH = /^(\d{1,2}(월|일)?|\d{1,2}[./월]\d{1,2}일?)$/;
const WEEK = /^[월화수목금토일](요일)?$/;
const WD = '일월화수목금토';
const wday = d => WD[new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay()];

/* ---------- 표 격자 ---------- */
/* slot[r][c] → 그 자리를 덮는 칸 { row, col, rowSpan, colSpan, text } */
function grid(t) {
  const slot = Array.from({ length: t.rowCnt }, () => Array(t.colCnt).fill(null));
  for (const c of t.cells) for (let r = c.row; r < Math.min(t.rowCnt, c.row + c.rowSpan); r++) for (let k = c.col; k < Math.min(t.colCnt, c.col + c.colSpan); k++) if (!slot[r][k]) slot[r][k] = c;
  return slot;
}
/* 머리 줄 수: 적어도 1(첫 머리 칸이 비어 있어도), 머리 칸이 아래로 이어지면 그 줄까지. 머리 다음이 바로 「계」 줄이거나 표 끝이면 -1(채울 줄 없음) */
function headOf(t) {
  let h = Math.max(1, headRows(t));
  for (let moved = true; moved;) { moved = false; for (const c of t.cells) if (c.row < h && c.row + c.rowSpan > h) { h = c.row + c.rowSpan; moved = true; } }
  if (h >= t.rowCnt) return -1;
  const f = t.cells.find(c => c.row === h && c.col === 0);
  return f && FOOT.test(squash(f.text)) ? -1 : h;
}
/* 머리 줄(0 ~ h-1)의 칸마다: 이름(위아래 칸 글을 이음 — 표 너비 전체를 합친 제목 줄은 뺌), 맨 아래 칸 글, 쓸 자리(맨 아래 칸이 그 칸 하나만 덮을 때 [줄, 칸]),
   위 자리(바로 위 줄에도 그 칸만의 칸이 있을 때 — 날짜 칸 위 줄 월·아래 줄 일), 위 합친 칸(바로 위 줄 칸이 여러 칸을 합쳤을 때 — 「9월」) */
function heads(t, h) {
  const slot = grid(t);
  return Array.from({ length: t.colCnt }, (_, c) => {
    const owners = [];
    for (let r = 0; r < h; r++) { const o = slot[r][c]; if (o && !owners.includes(o) && !(t.colCnt > 1 && o.colSpan >= t.colCnt)) owners.push(o); }
    const low = h > 0 ? slot[h - 1][c] : null, up = h > 1 ? slot[h - 2][c] : null;
    const own = (o, r) => o && o.col === c && o.colSpan === 1 && (r == null || o.row === r);
    const twoRows = own(low, h - 1) && up && up !== low && up.row === h - 2;
    return {
      name: owners.map(o => o.text).filter(Boolean).join(' '),
      low: low ? low.text : '',
      at: own(low) ? [low.row, c] : null,
      up: twoRows && own(up, h - 2) ? [up.row, c] : null,
      upCell: twoRows && up.colSpan > 1 ? up : null
    };
  });
}
/* 머리 아래 첫 「계」 줄의 칸들(칸 차례), 없으면 null */
function footCells(t, h) {
  for (let r = h; r < t.rowCnt; r++) {
    const own = t.cells.filter(c => c.row === r).sort((a, b) => a.col - b.col);
    if (own.length && own[0].col === 0 && FOOT.test(squash(own[0].text))) return own;
  }
  return null;
}
/* 고른 표를 먼저, 그다음 문서 차례로 */
function order(tables, words) {
  const best = pickTable(tables, words);
  return [...tables.filter(t => t.index === best), ...tables.filter(t => t.index !== best)];
}
/* 시간 칸 이름이 없고 날짜 뜻 칸이 둘이면(「이름·일시」처럼 두 칸을 합친 머리) 둘째는 시간 칸 */
function timeAfterDate(keys) {
  const d = keys.map((k, c) => (k === 'date' ? c : -1)).filter(c => c >= 0);
  return !keys.includes('time') && d.length > 1 ? keys.map((k, c) => (c === d[1] ? 'time' : k)) : keys;
}
const byCol = (n, map) => Array.from({ length: n }, (_, c) => (map.has(c) ? map.get(c) : null));
/* 학생 칸: 칸 뜻이 학생이거나, 머리가 비었거나(위 합친 칸이 「학생」·「이름」이면), 「학생1」·「1」이거나, 이름처럼 보이는 두~네 글자(지난번에 적은 이름) */
function isStudentCol(hd, key) {
  if (key === 'student') return true;
  if (key) return false;
  const low = squash(hd.low), name = squash(hd.name);
  if (EXCL.test(low) || EXCL.test(name)) return false;
  if (!low) return !name || /학생|이름|성명|아동/.test(name);
  return SLOT.test(low) || (/^[가-힣]{2,4}$/.test(low) && !NOT_NAME.test(low));
}
/* 날짜 칸: 칸 뜻이 날짜이거나, 머리가 비었거나, 숫자·날짜·요일만 적힌 칸 */
function isDateCol(hd, key) {
  if (key === 'date') return true;
  if (key) return false;
  const low = squash(hd.low), name = squash(hd.name);
  if (EXCL.test(low) || EXCL.test(name)) return false;
  return !low || DATEISH.test(low) || WEEK.test(low);
}

/* ---------- 글 바꾸기: 「총 (   )시간」, 「지도교사 :」 뒤 이름(「보조·협력 지도교사」 줄은 그대로) ---------- */
function replaceRules(camp) {
  const rules = [[HOURS, `총 ( ${hoursTotal(camp)} )시간`]];
  const tn = String(camp.teacher || '').trim().replace(/\$/g, '$$$$');
  if (tn) {
    const sp = '[ \\t\\u00a0\\u3000]*', head = `(?<![가-힣])(?<!(?:보조|협력|외부|강사|부)${sp})(지도\\s*교사\\s*[:：])`;
    rules.push([new RegExp(`${head}${sp}[^\\n(:：]*?${sp}(\\((?:인|서명)\\))`), `$1 ${tn} $2`]);
    rules.push([new RegExp(`${head}${sp}$`), `$1 ${tn}`]);
  }
  return rules;
}
const hasHours = form => form.texts.some(x => HOURS.test(x)) || form.tables.some(t => t.rows.some(r => r.some(x => HOURS.test(x))));

/* ---------- 수업 확인서 ---------- */
function planConfirm(camp, t, form, warn) {
  const h = headOf(t);
  if (h < 0) return null;
  const hs = heads(t, h), keys = timeAfterDate(mapColumns(hs.map(x => squash(x.name)), 'confirm'));
  if (!keys.includes('date') || !keys.includes('content')) return null;
  const noTime = !keys.includes('time');
  const rows = confirmCells(camp).map(c => keys.map(k => {
    if (k === 'date' && noTime) return [c.date, c.time].filter(Boolean).join(' ');
    return !k || k === 'sign' ? null : c[k];
  }));
  const fixed = new Map();
  if (!hasHours(form)) { // 「총 (   )시간」 글이 없으면 계 줄 다음 칸에
    const foot = footCells(t, h);
    if (foot && foot[1]) fixed.set(foot[1].col, hoursText(camp));
    else warn.push(`양식에 「계」 줄이나 「총 (   )시간」 칸이 없어 지도 시간(총 ${hoursTotal(camp)}시간)은 적지 못했어요.`);
  }
  return [{ table: t.index, headRows: h, rows, footer: { cells: byCol(t.colCnt, fixed) } }];
}

/* ---------- 출석부(교시형): 수업 줄 × 학생 칸 ---------- */
function planPeriod(camp, t, form, warn) {
  const h = headOf(t);
  if (h < 0) return null;
  const hs = heads(t, h), keys = timeAfterDate(mapColumns(hs.map(x => squash(x.name)), 'attendPeriod'));
  const di = keys.indexOf('date');
  if (di < 0) return null;
  const last = Math.max(di, keys.indexOf('time'), keys.indexOf('seq'));
  const stu = hs.map((x, c) => c).filter(c => c > last && isStudentCol(hs[c], keys[c]));
  if (!stu.length) return null;
  const S = camp.students, n = Math.min(S.length, stu.length);
  if (S.length > stu.length) warn.push(`양식에 학생 칸이 ${stu.length}개라 앞의 ${stu.length}명만 적었어요. 나머지 학생은 기본 양식(쌤비서)으로 내려받아 주세요.`);
  const cells = [];
  let lost = false;
  stu.forEach((c, j) => {
    const at = hs[c].at;
    if (!at) { if (j < n) lost = true; return; }
    if (j < n) cells.push([at[0], at[1], S[j].name]);
    else if (hs[c].low) cells.push([at[0], at[1], '']); // 남는 학생 칸(「학생4」·지난번 이름)은 지움
  });
  if (lost) warn.push('양식의 학생 칸 머리가 합쳐져 있어 학생 이름은 적지 못했어요. 이름은 직접 적어 주세요.');
  const noTime = !keys.includes('time'), info = confirmCells(camp);
  const rows = sortSessions(camp.sessions).map((s, r) => keys.map((k, c) => {
    const j = stu.indexOf(c);
    if (j >= 0) return j < n ? markOf(camp, s.id, S[j].id) : '';
    if (k === 'date') return noTime ? [info[r].date, info[r].time].filter(Boolean).join(' ') : info[r].date;
    return k === 'seq' || k === 'time' ? info[r][k] : null;
  }));
  const counts = new Map(stu.map((c, j) => [c, j < n ? String(attCount(camp, S[j].id)) : '']));
  return [{ table: t.index, headRows: h, rows, cells, footer: { cells: byCol(t.colCnt, counts) } }];
}

/* ---------- 출석부(날짜형): 학생 줄 × 날짜 칸 ---------- */
function planDay(camp, t, form, warn) {
  const h = headOf(t);
  if (h < 0) return null;
  const hs = heads(t, h), sq = hs.map(x => squash(x.name)), keys = mapColumns(sq, 'attendDay');
  const ni = keys.indexOf('name');
  if (ni < 0) return null;
  const ti = keys.indexOf('total', ni + 1);
  const dc = hs.map((x, c) => c).filter(c => c > ni && (ti < 0 || c < ti) && isDateCol(hs[c], keys[c]));
  if (!dc.length) return null;
  const dates = campDates(camp), n = Math.min(dates.length, dc.length);
  if (dates.length > dc.length) warn.push(`양식에 날짜 칸이 ${dc.length}개라 앞의 ${dc.length}날만 적었어요(계는 모든 날로 셈). 나머지 날은 기본 양식(쌤비서)으로 내려받아 주세요.`);
  const cells = [], dateOf = j => (j < n ? dates[j] : '');
  const weekRow = dc.some(c => WEEK.test(squash(hs[c].low))); // 날짜 아래 요일 줄
  // 위 줄 합친 칸(「9월」)이 날짜 칸만 덮으면 그 칸에 월, 아래 줄에 일
  const groups = new Map();
  dc.forEach((c, j) => { const u = hs[c].upCell; if (u && !weekRow) { if (!groups.has(u)) groups.set(u, []); groups.get(u).push(j); } });
  for (const [u, js] of groups) {
    const covered = Array.from({ length: u.colSpan }, (_, k) => u.col + k);
    if (!covered.every(c => dc.includes(c))) { groups.delete(u); continue; }
    const months = [...new Set(js.map(dateOf).filter(Boolean).map(d => +d.slice(5, 7)))];
    cells.push([u.row, u.col, months.length ? `${months.join('·')}월` : '']);
  }
  let lost = false;
  dc.forEach((c, j) => {
    const { at, up, upCell } = hs[c], d = dateOf(j);
    if (!at) { if (d) lost = true; return; }
    if (weekRow) { if (up) cells.push([up[0], up[1], d ? fmtShort(d) : '']); cells.push([at[0], at[1], d ? wday(d) : '']); } // 위 줄 날짜 · 아래 줄 요일
    else if (upCell && groups.has(upCell)) cells.push([at[0], at[1], d ? String(+d.slice(8, 10)) : '']);
    else if (up) cells.push([up[0], up[1], d ? String(+d.slice(5, 7)) : ''], [at[0], at[1], d ? String(+d.slice(8, 10)) : '']); // 위 줄 월 · 아래 줄 일
    else cells.push([at[0], at[1], d ? fmtShort(d) : '']);
  });
  if (lost) warn.push('양식의 날짜 칸 머리가 합쳐져 있어 날짜는 적지 못했어요. 날짜는 직접 적어 주세요.');
  const seqs = keys.map((k, c) => (k === 'seq' ? c : -1)).filter(c => c >= 0);
  const rows = camp.students.map((st, i) => {
    const present = String(dates.filter(d => dayMark(camp, d, st.id) === '○').length);
    return keys.map((k, c) => {
      const j = dc.indexOf(c);
      if (j >= 0) return j < n ? dayMark(camp, dates[j], st.id) : '';
      if (c === ti) return present;
      if (c === ni) return st.name;
      if (k === 'seq') return sq[c] === '번호' && seqs.length > 1 ? String(st.no || '') : String(i + 1);
      if (k === 'gradeClass') return sq[c] === '학년' ? String(st.grade || '') : sq[c] === '반' ? String(st.cls || '') : gradeClass(st);
      return null;
    });
  });
  return [{ table: t.index, headRows: h, rows, cells, footer: { cells: [] } }];
}

/* ---------- 관찰 기록부 ---------- */
const NAME_ROW = /^(이름|성명|학생|학생명|학생이름)$/, RESULT = /관찰|결과/, RESULT_WEAK = /내용/;
/* 가로 꼴(첫 칸 「이름」 줄 + 그 아래 「관찰 및 지도 결과」 줄, 학생은 칸마다)의 묶음들 → [{ nr, rr, cols: [[칸, 이름 칸 글]] }]
   결과 줄은 다음 「이름」 줄 앞까지에서 「관찰·결과」를 먼저, 없으면 「내용」(「지도 교과」 같은 줄은 건너뜀) */
function sideways(t) {
  const slot = grid(t), out = [];
  const first = r => { const o = slot[r] && slot[r][0]; return o && o.row === r ? squash(o.text) : ''; };
  const names = [];
  for (let r = 0; r < t.rowCnt; r++) if (NAME_ROW.test(first(r))) names.push(r);
  names.forEach((r, i) => {
    const end = i + 1 < names.length ? names[i + 1] : t.rowCnt;
    const pick = re => { for (let k = r + 1; k < end; k++) if (re.test(first(k))) return k; return -1; };
    const rr = pick(RESULT) >= 0 ? pick(RESULT) : pick(RESULT_WEAK);
    if (rr < 0) return;
    const cols = t.cells.filter(c => c.row === r && c.col > 0).sort((a, b) => a.col - b.col)
      .filter(c => { const o = slot[rr][c.col]; return o && o.row === rr && o.col === c.col; }).map(c => [c.col, c.text]);
    if (cols.length) out.push({ nr: r, rr, cols });
  });
  return out;
}
/* 가로 꼴 관찰 표들(skip 표는 빼고)에 학생을 차례로 → 표마다 plan, 없으면 [] */
function sidewaysPlans(camp, form, warn, skip = -1) {
  const list = camp.students.map(s => ({ st: s, text: String(camp.obs[s.id] || '').trim() }));
  const plans = [];
  let i = 0, room = 0;
  for (const t of form.tables) {
    if (t.index === skip) continue;
    const cells = [];
    for (const s of sideways(t)) for (const [c] of s.cols) {
      const p = list[i++]; room++;
      cells.push([s.nr, c, p ? p.st.name : ''], [s.rr, c, p ? p.text : '']); // 남는 칸(「학생3」·지난번 이름)은 지움
    }
    if (cells.length) plans.push({ table: t.index, cells });
  }
  if (plans.length && list.length > room) warn.push(`양식의 관찰 표 학생 칸이 ${room}개라 앞의 ${room}명만 적었어요. 나머지 학생은 기본 양식(쌤비서)으로 내려받아 주세요.`);
  return plans;
}
function planObserve(camp, form, warn) {
  const side = sidewaysPlans(camp, form, warn);
  if (side.length) return side;
  // 줄 꼴: 머리 「번호·이름·관찰 및 지도 결과」 아래 학생마다 한 줄
  const list = camp.students.map(s => ({ st: s, text: String(camp.obs[s.id] || '').trim() }));
  for (const t of order(form.tables, ['이름', '관찰', '결과'])) {
    const h = headOf(t);
    if (h < 0) continue;
    const sq = heads(t, h).map(x => squash(x.name));
    const ni = sq.findIndex(x => /이름|성명/.test(x)), ri = sq.findIndex((x, c) => c !== ni && (RESULT.test(x) || RESULT_WEAK.test(x)));
    if (ni < 0 || ri < 0) continue;
    const seqs = sq.map((x, c) => (/^(순|순번|순서|연번|번호)$/.test(x) ? c : -1)).filter(c => c >= 0);
    const rows = list.map((p, i) => sq.map((x, c) => (c === ni ? p.st.name : c === ri ? p.text
      : seqs.includes(c) ? (x === '번호' && seqs.length > 1 ? String(p.st.no || '') : String(i + 1))
        : /학년|반/.test(x) ? gradeClass(p.st) : null)));
    return [{ table: t.index, headRows: h, rows, footer: { cells: [] } }];
  }
  return null;
}

/* ---------- 채우기 ---------- */
const PLAN = {
  confirm: { words: ['날짜', '일시', '시간', '교과', '지도', '확인'], fn: planConfirm },
  period: { words: ['일시', '날짜', '시간', '학생', '순'], fn: planPeriod },
  day: { words: ['학년', '이름', '계', '순', '날짜'], fn: planDay }
};
export async function fillCampForm(docId, camp, formBytes) {
  if (docId === 'report') throw fail('REPORT_DEFAULT', REPORT_DEFAULT_MSG);
  const form = await readTables(formBytes); // 깨진 파일이면 NOT_HWPX
  const warn = [];
  let plans = null;
  if (docId === 'observe') plans = planObserve(camp, form, warn);
  else {
    const p = PLAN[docId === 'attend' ? (camp.unit === 'day' ? 'day' : 'period') : docId];
    if (p) for (const t of order(form.tables, p.words)) { const w = []; plans = p.fn(camp, t, form, w); if (plans) { warn.push(...w); break; } }
    // 출석 및 관찰 기록부: 양식 뒤쪽 관찰 표도
    if (plans && docId === 'attend') plans.push(...sidewaysPlans(camp, form, warn, plans[0].table));
  }
  if (!plans || !plans.length) throw fail('NO_MATCH', NO_MATCH_MSG);
  let bytes = formBytes instanceof ArrayBuffer ? new Uint8Array(formBytes) : formBytes;
  for (const [i, o] of plans.entries()) bytes = await fillTable(bytes, i ? o : { ...o, replace: replaceRules(camp) }); // 글 바꾸기는 한 번만
  return { bytes, warn };
}
