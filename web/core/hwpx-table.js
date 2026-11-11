/* 학교 한글 양식(.hwpx)의 표 읽기·채우기 (스펙 2026-11-11 기초학력 캠프 「학교 한글 양식 표 채우기」).
   수업 확인서·출석부·관찰 기록부처럼 학교가 만든 표에: 머리 줄 아래 첫 데이터 줄을 본으로 복제해 줄마다 쓰고(칸 모양·테두리·글자 모양 그대로),
   양식의 빈 줄은 지우고, 끝 줄(「계」)을 찾아 채우고, 제목·「지도교사 :」·「총 (   )시간」 같은 글을 바꿈. 다른 표(결재란)·문단은 그대로.
   한글이 만든 XML을 통째로 다시 쓰지 않고 그 표와 바꿀 글 조각만 잘라 바꿈(hwpx-form.js의 작은 XML 읽개). 화면 없이 돌아감(시험).
   표 차례(index): 모든 구역의 표를 문서 차례(여는 태그 차례)로 — 표 칸 안의 표(겹친 표)도 바깥 표 바로 다음 차례로 셈.
   칸 글: 칸 문단들을 줄바꿈으로 잇고 앞뒤 빈칸을 뺌(칸 안 표의 글은 빼고). 합친 칸의 글은 왼쪽 위 칸에만, 덮인 칸은 ''. */
import { unzip, zipStore } from './zip.js';
import { scanXml, esc, unesc, local, kidsNamed, walk, inNested, paraText, setText, openTag, charPrOf, textRun, noBreak } from './hwpx-form.js';

const fail = code => Object.assign(new Error(code), { code });
const dec = new TextDecoder();
const SEC = /^Contents\/section(\d+)\.xml$/i;
const squash = s => String(s == null ? '' : s).replace(/\s+/g, '');
const tagOf = (xml, n) => xml.slice(n.s, n.self ? n.e : n.oe);
const num = (tag, a) => { const m = new RegExp(`\\s${a}="(-?\\d+)"`).exec(tag); return m ? +m[1] : NaN; };
/* 여는 태그의 속성 값 바꾸기(없으면 더함) */
function setAttr(tag, a, v) {
  const re = new RegExp(`(\\s${a}=")[^"]*(")`);
  return re.test(tag) ? tag.replace(re, `$1${v}$2`) : tag.replace(/\s*(\/?)>$/, ` ${a}="${v}"$1>`);
}
const attrEl = (xml, k, a, v) => setAttr(tagOf(xml, k), a, v) + xml.slice(k.self ? k.e : k.oe, k.e);
/* 요소를 다시 씀: 자식마다 fn(자식)이 글을 주면 그것으로(undefined면 그대로), 자식 사이 글·닫는 태그는 그대로 */
function rebuild(xml, n, fn, open = null) {
  if (n.self) return open != null ? open : xml.slice(n.s, n.e);
  let out = open != null ? open : xml.slice(n.s, n.oe), pos = n.oe;
  for (const k of n.kids) {
    const r = fn(k);
    out += xml.slice(pos, k.s) + (r === undefined ? xml.slice(k.s, k.e) : r);
    pos = k.e;
  }
  return out + xml.slice(pos, n.e);
}
const applyEdits = (xml, edits) => edits.sort((a, b) => b.s - a.s).reduce((s, ed) => s.slice(0, ed.s) + ed.text + s.slice(ed.e), xml);

/* ---------- 읽기 ---------- */
async function load(u8) {
  if (u8 instanceof ArrayBuffer) u8 = new Uint8Array(u8);
  if (!(u8 instanceof Uint8Array) || u8.length < 22) throw fail('NOT_HWPX');
  let files;
  try { files = await unzip(u8); } catch (e) { throw fail('NOT_HWPX'); }
  const entries = [...files].map(([name, data]) => ({ name, data }));
  const names = entries.map(e => e.name).filter(n => SEC.test(n)).sort((a, b) => +SEC.exec(a)[1] - +SEC.exec(b)[1]);
  if (!names.length) throw fail('NOT_HWPX');
  const secs = names.map(name => {
    try { const xml = dec.decode(files.get(name)); return { name, xml, root: scanXml(xml, { strict: true }) }; } catch (e) { throw fail('NOT_HWPX'); }
  });
  return { entries, secs };
}
/* 모든 구역의 표 [{ si(구역 차례), node }] — 문서 차례 */
const tablesOf = secs => secs.flatMap((sec, si) => [...walk(sec.root)].filter(n => local(n) === 'tbl').map(node => ({ si, node })));
const inCell = n => { for (let u = n.up; u; u = u.up) if (local(u) === 'tc') return true; return false; };
function cellText(xml, tc) {
  const sl = kidsNamed(tc, 'subList')[0];
  return sl ? kidsNamed(sl, 'p').map(p => paraText(xml, p)).join('\n').trim() : '';
}
/* 표 → { trs, cells: [{ tc, row(줄 차례), col, colSpan, rowSpan, height, text }], rowCnt, colCnt, slot[r][c](그 칸을 덮는 cell) } */
function gridOf(xml, tb) {
  const trs = kidsNamed(tb, 'tr'), cells = [], taken = new Set();
  trs.forEach((tr, row) => {
    let flow = 0;
    for (const tc of kidsNamed(tr, 'tc')) {
      const kid = nm => kidsNamed(tc, nm)[0];
      const a = kid('cellAddr'), sp = kid('cellSpan'), sz = kid('cellSz');
      let col = a ? num(tagOf(xml, a), 'colAddr') : NaN;
      if (!(col >= 0)) { while (taken.has(`${row},${flow}`)) flow++; col = flow; } // 칸 주소가 없으면 빈 자리 차례로
      const colSpan = Math.max(1, (sp && num(tagOf(xml, sp), 'colSpan')) || 1), rowSpan = Math.max(1, (sp && num(tagOf(xml, sp), 'rowSpan')) || 1);
      for (let r = row; r < row + rowSpan; r++) for (let c = col; c < col + colSpan; c++) taken.add(`${r},${c}`);
      flow = col + colSpan;
      cells.push({ tc, row, col, colSpan, rowSpan, height: sz ? num(tagOf(xml, sz), 'height') : NaN, text: cellText(xml, tc) });
    }
  });
  const rowCnt = trs.length, colCnt = Math.max(num(tagOf(xml, tb), 'colCnt') || 0, 0, ...cells.map(c => c.col + c.colSpan));
  const slot = Array.from({ length: rowCnt }, () => Array(colCnt).fill(null));
  for (const c of cells) for (let r = c.row; r < Math.min(rowCnt, c.row + c.rowSpan); r++) for (let k = c.col; k < c.col + c.colSpan; k++) if (!slot[r][k]) slot[r][k] = c;
  return { trs, cells, rowCnt, colCnt, slot };
}
const gridRows = g => g.slot.map((r, ri) => r.map((c, ci) => (c && c.row === ri && c.col === ci ? c.text : '')));

/* u8 → { tables: [{ index, rows: string[][](rowCnt×colCnt), rowCnt, colCnt }], texts: [표 밖 문단 글(빈 문단은 뺌)] }
   깨진 파일·구역 XML이 없으면 Error code 'NOT_HWPX' */
export async function readTables(u8) {
  const { secs } = await load(u8);
  const tables = tablesOf(secs).map(({ si, node }, index) => {
    const g = gridOf(secs[si].xml, node);
    return { index, rows: gridRows(g), rowCnt: g.rowCnt, colCnt: g.colCnt };
  });
  const texts = [];
  for (const { xml, root } of secs) for (const n of walk(root)) if (local(n) === 'p' && !inCell(n)) { const t = paraText(xml, n); if (t.trim()) texts.push(t); }
  return { tables, texts };
}

/* 머리 1~2줄에 words가 가장 많이 든 표의 index(빈칸 무시·부분 일치, 같으면 앞 표), 하나도 없으면 -1 */
export function pickTable(tables, words) {
  const list = Array.isArray(tables) ? tables : (tables && tables.tables) || [];
  const ws = [...new Set([].concat(words == null ? [] : words).map(squash).filter(Boolean))];
  let best = -1, most = 0;
  list.forEach((t, i) => {
    const head = squash((t && t.rows ? t.rows.slice(0, 2) : []).flat().join(''));
    const n = ws.filter(w => head.includes(w)).length;
    if (n > most) { most = n; best = t.index != null ? t.index : i; }
  });
  return best;
}

/* ---------- 채우기 ---------- */
const NUM = /^(\d{1,3}|[①-⑳])\s*[.)]?$/;
/* 줄 높이(칸 크기에서): 합친 칸은 아는 줄을 뺀 나머지를 나눔, 모르면 평균 */
function rowHeights(g) {
  const R = g.trs.length, h = Array(R).fill(0);
  for (const c of g.cells) if (c.rowSpan === 1 && c.height > 0) h[c.row] = Math.max(h[c.row], c.height);
  for (const c of g.cells) {
    if (!(c.rowSpan > 1 && c.height > 0)) continue;
    const rs = []; for (let r = c.row; r < Math.min(R, c.row + c.rowSpan); r++) rs.push(r);
    const unknown = rs.filter(r => !h[r]);
    if (!unknown.length) continue;
    const each = Math.max(1, Math.round((c.height - rs.reduce((a, r) => a + h[r], 0)) / unknown.length));
    for (const r of unknown) h[r] = each;
  }
  const known = h.filter(Boolean), avg = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 1000;
  return h.map(x => x || avg);
}
/* 무엇을 어디에: { g, t(본 줄 = 머리 줄 수), end(지울 데이터 줄 끝, 안 듦), data(쓸 줄들), foot(끝 줄, 없으면 -1), write(Map 'r,c' → 글, 처음 표 주소) } */
function planOf(xml, tb, o) {
  const g = gridOf(xml, tb), R = g.trs.length;
  const own = r => g.cells.filter(c => c.row === r);
  const at = (r, c) => (g.slot[r] || [])[c] || null;
  const fm = o.footer ? (o.footer.match != null ? o.footer.match : /^(합\s*계|총\s*계|계)/) : null;
  const isFoot = r => { const f = own(r)[0]; return !!(fm && f) && (fm instanceof RegExp ? f.text.search(fm) >= 0 : f.text.includes(String(fm))); };
  const findFoot = from => { if (fm) for (let r = from; r < R; r++) if (isFoot(r)) return r; return -1; };
  let t = R, end = R, data = [], foot;
  if (Array.isArray(o.rows)) {
    // 머리 줄 수: 주지 않으면 「1」로 시작하는 줄이나, 첫 칸이 비었거나 번호이고 반 넘게 빈 줄 앞까지
    // (첫 칸이 「순」 같은 이름이면 날짜 칸이 비어 있어도 머리 — 날짜형 출석부)
    let h = o.headRows;
    if (!(Number.isInteger(h) && h >= 0)) {
      h = -1;
      for (let r = 0; r < R && h < 0; r++) {
        const cs = own(r), f = at(r, 0);
        if (!cs.length || !f || f.row !== r) continue;
        if (/^(1|①)\s*[.)]?$/.test(f.text) || ((!f.text || NUM.test(f.text)) && cs.filter(c => !c.text).length * 2 > cs.length)) h = r;
      }
      if (h < 0) h = 1;
    }
    // 머리 칸이 아래로 이어지면(rowSpan) 그 줄까지 머리
    for (let moved = true; moved;) { moved = false; for (const c of g.cells) if (c.row < h && c.row + c.rowSpan > h) { h = c.row + c.rowSpan; moved = true; } }
    if (h >= R || isFoot(h)) throw fail('NO_ROW');
    t = h;
    // 데이터 줄: 본 줄(과 그 합친 칸이 묶은 줄들)부터, 첫 칸이 비었거나(같은 칸 배치·모두 빔) 번호이거나 본 줄과 같은 모양인 줄까지
    const spanEnd = r => { let e = r + 1; for (let k = r; k < e; k++) for (const c of own(k)) e = Math.max(e, c.row + c.rowSpan); return Math.min(e, R); };
    const layout = r => own(r).map(c => `${c.col}:${c.colSpan}`).join(',');
    const sig = r => own(r).slice(1).map(c => c.text).join('\u0001');
    const tsig = sig(t), tfill = /[^\u0001]/.test(tsig); // 본 줄 칸에 미리 적힌 글(「월 일」 등)이 있으면 같은 글인 줄도 데이터 줄
    end = spanEnd(t);
    while (end < R) {
      const f = at(end, 0);
      if (!f || f.row !== end || isFoot(end)) break;
      const same = layout(end) === layout(t);
      if (!(NUM.test(f.text) || (!f.text && (same || own(end).every(c => !c.text))) || (same && tfill && sig(end) === tsig))) break;
      end = spanEnd(end);
    }
    data = o.rows.map(r => (Array.isArray(r) ? r : []));
    if (!data.length) data.push([]); // 쓸 줄이 없어도 빈 본 줄 하나는 남김(다시 채울 수 있게)
    foot = findFoot(end);
  } else foot = findFoot(0); // rows가 없으면 줄은 그대로, 칸만 씀
  // 칸 쓰기(처음 표 주소): 끝 줄 칸(footer.cells, 칸 번호) + cells [[줄, 칸, 글]]
  const write = new Map();
  if (foot >= 0 && Array.isArray(o.footer.cells)) o.footer.cells.forEach((v, c) => { if (v != null) write.set(`${foot},${c}`, String(v)); });
  for (const x of Array.isArray(o.cells) ? o.cells : []) {
    const [r, c, v] = Array.isArray(x) ? x : [x && x.row, x && x.col, x && x.text];
    if (Number.isInteger(r) && Number.isInteger(c) && v != null && (r < t || r >= end)) write.set(`${r},${c}`, String(v));
  }
  return { g, R, t, end, data, foot, write, heights: rowHeights(g) };
}

/* 칸 글 쓰기: 첫 문단은 글 조각만 바꾸고(문단·글자 모양 그대로, 빈 칸이면 그 칸 첫 글자 모양으로), 줄바꿈은 같은 모양 문단을 더함, 나머지 문단은 지움 */
function subListXml(xml, sl, text, ids) {
  const ps = kidsNamed(sl, 'p'), lines = String(text).split(/\r?\n/);
  if (!ps.length) {
    const paras = lines.map(l => `<hp:p id="${ids()}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${textRun('0', l)}</hp:p>`).join('');
    return sl.self ? xml.slice(sl.s, sl.e).replace(/\s*\/>$/, '>') + paras + '</hp:subList>' : xml.slice(sl.s, sl.cs) + paras + xml.slice(sl.cs, sl.e);
  }
  const p0 = ps[0], open = noBreak(openTag(xml, p0)), cp = charPrOf(xml, p0);
  const more = lines.slice(1).map(l => open.replace(/\sid="[^"]*"/, ` id="${ids()}"`) + textRun(cp, l) + '</hp:p>').join('');
  return rebuild(xml, sl, k => (k === p0 ? setText(xml, p0, lines[0]) + more : local(k) === 'p' ? '' : undefined));
}
/* 칸 하나: rowAddr, (주면) 글·rowSpan·높이 */
function cellXml(xml, tc, o, ids) {
  return rebuild(xml, tc, k => {
    const n = local(k);
    if (n === 'subList') return o.text === undefined ? undefined : subListXml(xml, k, o.text, ids);
    if (n === 'cellAddr') return attrEl(xml, k, 'rowAddr', o.row);
    if (n === 'cellSpan' && o.rowSpan != null) return attrEl(xml, k, 'rowSpan', o.rowSpan);
    if (n === 'cellSz' && o.height != null) return attrEl(xml, k, 'height', o.height);
    return undefined;
  });
}
/* 복제한 줄의 문단 id는 새로 */
const renumber = (s, ids) => s.replace(/<hp:p\b([^>]*?)\sid="[^"]*"/g, (m, pre) => `<hp:p${pre} id="${ids()}"`);

/* 새 표 XML */
function tableXml(xml, tb, p, ids) {
  const { g, R, t, end, data, write, heights: h } = p, n = data.length, delta = n - (end - t);
  const byTc = new Map(g.cells.map(c => [c.tc, c]));
  const trXml = (r, newRow, fn) => rebuild(xml, g.trs[r], k => (local(k) === 'tc' ? cellXml(xml, k, { row: newRow, ...fn(byTc.get(k)) }, ids) : undefined));
  const keep = r => c => (write.has(`${r},${c.col}`) && c.row === r ? { text: write.get(`${r},${c.col}`) } : {});
  const rows = [];
  for (let r = 0; r < t; r++) rows.push(trXml(r, r, keep(r)));
  // 본 줄 복제: 값은 칸 번호(colAddr)로, 없으면 '', null이면 본 줄 글 그대로. 합친 칸(rowSpan>1)은 줄마다 한 칸으로 풀고 본 줄 높이로
  data.forEach((vals, i) => rows.push(renumber(trXml(t, t + i, c => ({
    text: vals[c.col] === null ? undefined : String(vals[c.col] == null ? '' : vals[c.col]),
    ...(c.rowSpan > 1 ? { rowSpan: 1, height: h[t] } : {})
  })), ids)));
  for (let r = end; r < R; r++) rows.push(trXml(r, r + delta, keep(r)));
  // 표 크기: 줄 수, 높이(지운 줄 높이를 빼고 새 줄 높이를 더함), 커지면 쪽 경계에서 나눌 수 있게
  let open = setAttr(tagOf(xml, tb), 'rowCnt', R + delta);
  if (delta > 0) open = open.replace(/(\spageBreak=")NONE(")/, '$1CELL$2');
  const sumOld = h.slice(t, end).reduce((a, b) => a + b, 0), grow = n * (h[t] || 0) - sumOld;
  const mapRow = (r, isEnd) => (r < t ? r : r >= end ? r + delta : isEnd ? t + n - 1 : t);
  let first = true;
  return rebuild(xml, tb, k => {
    const nm = local(k);
    if (nm === 'tr') { if (first) { first = false; return rows.join(''); } return ''; }
    if (nm === 'sz' && grow) { const old = num(tagOf(xml, k), 'height'); return old >= 0 ? attrEl(xml, k, 'height', Math.max(1, old + grow)) : undefined; }
    if (nm === 'cellzoneList' && t < R) return rebuild(xml, k, z => {
      if (local(z) !== 'cellzone') return undefined;
      const tag = tagOf(xml, z), sr = num(tag, 'startRowAddr'), er = num(tag, 'endRowAddr');
      if (!(sr >= 0) || !(er >= 0)) return undefined;
      return setAttr(setAttr(tag, 'startRowAddr', mapRow(sr, false)), 'endRowAddr', mapRow(er, true)) + xml.slice(z.self ? z.e : z.oe, z.e);
    });
    return undefined;
  }, open);
}

/* 문단 글 바꾸기: 글 조각 안의 바뀐 글자만 바꿈(다른 조각·글자 모양·탭은 그대로), 바뀐 문단은 줄 배치 기억을 지움 → [{ s, e, text }] */
function textEdits(xml, p, apply) {
  const segs = [];
  for (const k of walk(p)) {
    if (local(k) !== 't' || k.self || inNested(k, p)) continue;
    let pos = k.oe;
    for (const c of [...k.kids, null]) { const e = c ? c.s : k.cs; if (e > pos) segs.push({ s: pos, e, text: unesc(xml.slice(pos, e)) }); if (c) pos = c.e; }
  }
  if (!segs.length) return [];
  const joined = segs.map(x => x.text).join(''), next = apply(joined);
  if (next === joined) return [];
  let a = 0; while (a < joined.length && a < next.length && joined[a] === next[a]) a++;
  let b = 0; while (b < joined.length - a && b < next.length - a && joined[joined.length - 1 - b] === next[next.length - 1 - b]) b++;
  const ms = a, me = joined.length - b, rep = next.slice(a, next.length - b);
  const edits = [];
  let off = 0, placed = false;
  for (const x of segs) {
    const s0 = off, len = x.text.length; off += len;
    const cl = v => Math.max(0, Math.min(len, v));
    const hit = !placed && ms >= s0 && (ms < s0 + len || (ms === s0 + len && me === ms));
    if (!hit && (s0 + len <= ms || s0 >= me)) continue;
    if (hit) placed = true;
    edits.push({ s: x.s, e: x.e, text: esc(x.text.slice(0, cl(ms - s0)) + (hit ? rep : '') + x.text.slice(cl(me - s0))) });
  }
  for (const k of p.kids) if (local(k) === 'linesegarray') edits.push({ s: k.s, e: k.e, text: '' });
  return edits;
}
function rulesOf(list) {
  const rules = (Array.isArray(list) ? list : []).filter(r => Array.isArray(r) && (r[0] instanceof RegExp || (r[0] != null && String(r[0]) !== '')));
  if (!rules.length) return null;
  return s => rules.reduce((x, [f, to]) => {
    const v = to == null ? '' : String(to);
    return f instanceof RegExp ? x.replace(f, v) : x.split(String(f)).join(v);
  }, s);
}
/* 미리 보기 글(Preview/PrvText.txt): 표 밖 문단, 표는 줄마다 칸 글을 탭으로 */
function previewOf(secs) {
  const out = [];
  const table = (xml, tb) => {
    for (const tr of kidsNamed(tb, 'tr')) {
      out.push(kidsNamed(tr, 'tc').map(tc => cellText(xml, tc).replace(/\s*\n\s*/g, ' ')).join('\t'));
      for (const tc of kidsNamed(tr, 'tc')) for (const sl of kidsNamed(tc, 'subList')) for (const p of kidsNamed(sl, 'p')) for (const k of walk(p)) if (local(k) === 'tbl' && !inNested(k, p)) table(xml, k);
    }
  };
  for (const { xml, root } of secs) {
    const top = root.kids.find(k => local(k) === 'sec');
    if (!top) continue;
    for (const p of kidsNamed(top, 'p')) {
      const t = paraText(xml, p);
      if (t.trim()) out.push(t);
      for (const k of walk(p)) if (local(k) === 'tbl' && !inNested(k, p)) table(xml, k);
    }
  }
  return out.join('\r\n');
}

/* u8(.hwpx) + { table: index, headRows?, rows?: string[][], footer?: { match: RegExp|string, cells: (string|null)[] }, cells?: [[줄, 칸, 글]], replace?: [[찾을 글|RegExp, 바꿀 글]] } → Promise<Uint8Array>
   - rows: 머리 줄 다음 첫 줄을 본으로 줄마다 복제해 씀(값은 칸 번호 colAddr 차례, 없으면 '', null이면 본 줄 글 그대로, 남는 값은 버림). 양식의 데이터 줄은 모두 지우고 새 줄로.
     빈 배열이면 빈 줄 하나. 주지 않으면 줄은 그대로 두고 footer·cells·replace만.
   - footer: 데이터 줄 뒤에서 첫 칸 글이 match에 맞는 첫 줄의 칸에 cells를 칸 번호대로(null은 그대로). match가 없으면 「계·합계·총계」
   - cells: 처음 표 주소(readTables 격자)의 칸에 글(지우는 데이터 줄 안은 무시) — 관찰 기록부처럼 줄을 늘리지 않는 표
   - replace: 문서 모든 문단(다른 표·머리 줄·끝 줄 포함, 방금 쓴 데이터 줄·끝 줄 칸은 빼고)과 문서 제목에, 문단마다 글 조각을 살려 바꿈. 글은 모두, RegExp는 그 플래그대로
   Error code: 'NOT_HWPX'(깨진 파일), 'NO_TABLE'(그런 표 없음), 'NO_ROW'(머리 줄 다음에 본으로 쓸 줄이 없음) */
export async function fillTable(u8, opts) {
  const o = opts || {};
  const { entries, secs } = await load(u8);
  const list = tablesOf(secs), ti = o.table;
  if (!Number.isInteger(ti) || ti < 0 || ti >= list.length) throw fail('NO_TABLE');
  const { si, node: tb } = list[ti], sec = secs[si], inSec = ti - list.findIndex(x => x.si === si);
  let max = 0;
  for (const s of secs) for (const m of s.xml.matchAll(/<hp:p\b[^>]*?\sid="(\d+)"/g)) max = Math.max(max, +m[1]);
  let next = Math.min(max, 2000000000) + 1;
  const ids = () => next++;
  const plan = planOf(sec.xml, tb, o);
  // 1) 표를 새로 쓰고, 표를 품은 문단(겹친 표면 바깥 문단들도)의 줄 배치 기억을 지움(한글이 다시 잼)
  const edits = [{ s: tb.s, e: tb.e, text: tableXml(sec.xml, tb, plan, ids) }];
  for (let u = tb.up; u; u = u.up) if (local(u) === 'p') for (const k of u.kids) if (local(k) === 'linesegarray') edits.push({ s: k.s, e: k.e, text: '' });
  sec.xml = applyEdits(sec.xml, edits);
  // 2) 글 바꾸기(방금 쓴 칸은 빼고)
  const apply = rulesOf(o.replace);
  const { t, end, data, write } = plan, delta = data.length - (end - t);
  for (const [k, s] of secs.entries()) {
    if (!apply) { s.root = scanXml(s.xml, { strict: true }); continue; }
    const root = scanXml(s.xml), skip = new Set();
    if (k === si) {
      const nt = [...walk(root)].filter(x => local(x) === 'tbl')[inSec];
      const written = new Set([...write.keys()].map(key => { const [r, c] = key.split(',').map(Number); return `${r < t ? r : r + delta},${c}`; }));
      for (const c of gridOf(s.xml, nt).cells) if ((c.row >= t && c.row < t + data.length) || written.has(`${c.row},${c.col}`)) skip.add(c.tc);
    }
    const ed = [];
    for (const p of walk(root)) {
      if (local(p) !== 'p') continue;
      let out = false;
      for (let u = p.up; u && !out; u = u.up) if (skip.has(u)) out = true;
      if (!out) ed.push(...textEdits(s.xml, p, apply));
    }
    if (ed.length) s.xml = applyEdits(s.xml, ed);
    s.root = scanXml(s.xml, { strict: true }); // 잘 짜인 XML인지 확인(아니면 Error('XML'))
  }
  const files = entries.map(e => {
    const s = secs.find(x => x.name === e.name);
    if (s) return { name: e.name, data: s.xml };
    if (/^Preview\/PrvText\.txt$/i.test(e.name)) return { name: e.name, data: previewOf(secs) };
    if (/content\.hpf$/i.test(e.name) && apply) {
      return { name: e.name, data: dec.decode(e.data).replace(/(<opf:title>)([\s\S]*?)(<\/opf:title>)/, (m, a, b, c) => a + esc(apply(unesc(b))) + c) };
    }
    return e;
  });
  return zipStore(files);
}
