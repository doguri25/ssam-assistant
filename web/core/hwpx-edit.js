/* 한글 문서(.hwpx) 문단 단위 고치기 (스펙 2026-11-15 1A 문서 다듬기, 방식 가): readForm의 줄(문단·표 칸 문단)마다 글만 바꾸고 모양은 그대로 둠.
   - 바꾸기: 지금 글과 새 글을 글자로 견주어 바뀐 곳만 그 자리 글자 조각에서 바꿈(둘레 글자 모양·탭·줄바꿈은 그대로).
     견줄 수 없는 문단(글자 조각 안에 다른 글이 든 것 등)은 hwpx-form setText처럼 첫 글자 모양으로 통째로.
   - 지우기: 표 칸 밖 문단은 지움, 표 칸 안 문단·구역 설정·조절자·개체가 든 문단은 글만 비움(표·쪽 모양 유지).
   - 뒤에 더하기: 그 문단을 본(문단 모양·글자 모양)으로 복제해 바로 뒤에 새 문단(개체·구역 설정은 복제하지 않음).
   한글이 만든 XML을 통째로 다시 쓰지 않고 바꿀 문단만 잘라 바꿈(fillForm과 같게). 화면 없이 돌아감(시험) */
import { esc, unesc, local, walk, inNested, paraText, setText, openTag, charPrOf, noBreak } from './hwpx-form.js';
import { zipStore } from './zip.js';

const TAB = '<hp:tab width="4000" leader="0" type="1"/>', BR = '<hp:lineBreak/>';
/* 글자 조각에 넣을 글: XML 글자 + 탭·줄바꿈은 한글 요소로 */
const tEsc = s => esc(String(s == null ? '' : s).replace(/\r/g, '')).replace(/\t/g, TAB).replace(/\n/g, BR);
/* 글자 조각(hp:t) 안 요소가 글에서 무엇인지(paraText와 같게) */
const ATOM = { tab: '\t', lineBreak: '\n', fwSpace: ' ', nbSpace: ' ' };
/* 지울 때 문단을 남기고 글만 비울 것: 구역 설정·조절자(머리말·쪽 번호 등)·개체 */
const KEEP = ['secPr', 'ctrl', 'pic', 'rect', 'ellipse', 'line', 'container', 'ole', 'arc', 'polygon', 'curve', 'connectLine', 'textart', 'tbl', 'equation', 'video', 'chart'];
const hasAny = (p, names) => { for (const k of walk(p)) if (names.includes(local(k))) return true; return false; };
const get = (edits, i) => (edits instanceof Map ? edits.get(i) : edits && edits[i]);

/* 고칠 줄: 글이 있는 줄만(빈 줄·그림만 있는 줄은 뺌) → [{ i(form.lines 차례), text, box(표 칸) }] */
export function editableLines(lines) {
  return (lines || []).map((l, i) => ({ i, text: String(l.text || ''), box: !!l.inBox })).filter(x => x.text.trim());
}

/* ---------- 글자로 견주기 ---------- */
const MAX_CELLS = 250000; // 이보다 크면 가운데를 통째로 바꾼 것으로 봄
/* a → b: 바꿀 곳 [{ a, b(옛 글 [a, b)), text(새 글) }] (앞에서부터). 같은 글자 하나를 사이에 둔 바꿀 곳은 하나로 */
function hunksOf(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const A = a.slice(p, a.length - s), B = b.slice(p, b.length - s), n = A.length, m = B.length;
  if (!n && !m) return [];
  const pairs = [];
  if (n && m && n * m <= MAX_CELLS) {
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { pairs.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
  }
  const hs = [];
  let i = 0, j = 0;
  for (const [x, y] of [...pairs, [n, m]]) {
    if (x > i || y > j) hs.push({ a: p + i, b: p + x, text: B.slice(j, y) });
    i = x + 1; j = y + 1;
  }
  const out = [];
  for (const h of hs) {
    const prev = out[out.length - 1];
    if (prev && h.a - prev.b < 2) { prev.text += a.slice(prev.b, h.a) + h.text; prev.b = h.b; } else out.push({ ...h });
  }
  return out;
}

/* 문단 p의 글을 text로: 바뀐 곳만 그 자리 글자 조각에서 바꾼 문단 XML, 그렇게 못 하면 null */
export function spliceText(xml, p, text) {
  const segs = [];
  for (const t of walk(p)) {
    if (local(t) !== 't' || t.self || inNested(t, p)) continue;
    let pos = t.oe;
    for (const c of [...t.kids, null]) {
      const end = c ? c.s : t.cs;
      if (end > pos) segs.push({ s: pos, e: end, text: unesc(xml.slice(pos, end)), atom: false });
      if (c) { segs.push({ s: c.s, e: c.e, text: Object.prototype.hasOwnProperty.call(ATOM, local(c)) && c.self ? ATOM[local(c)] : '', atom: true }); pos = c.e; }
    }
  }
  const old = segs.map(g => g.text).join(''), nw = String(text == null ? '' : text).replace(/\r/g, '');
  if (old !== paraText(xml, p) || !segs.some(g => !g.atom)) return null;
  let off = 0;
  for (const g of segs) { g.a = off; off += g.text.length; }
  const gone = new Uint8Array(old.length), ins = segs.map(() => []);
  const textSeg = f => segs.findIndex(g => !g.atom && f(g));
  for (const h of hunksOf(old, nw)) {
    for (let k = h.a; k < h.b; k++) gone[k] = 1;
    if (!h.text) continue;
    // 넣을 조각: 지우는 첫 글자의 조각, 넣기만 하면 앞 글자의 조각(치는 것처럼), 없으면 뒤·앞의 글자 조각
    let host = h.b > h.a ? textSeg(g => h.a >= g.a && h.a < g.a + g.text.length) : -1;
    if (host < 0) host = textSeg(g => h.a > g.a && h.a <= g.a + g.text.length);
    if (host < 0) host = textSeg(g => g.a >= h.a);
    if (host < 0) host = segs.map((g, k) => (g.atom ? -1 : k)).filter(k => k >= 0).pop();
    const g = segs[host];
    ins[host].push({ at: Math.max(0, Math.min(g.text.length, h.a - g.a)), text: h.text });
  }
  const edits = [];
  let res = '';
  segs.forEach((g, gi) => {
    if (g.atom) {
      const del = g.text.length && gone[g.a];
      if (del) edits.push({ s: g.s, e: g.e, x: '' }); else res += g.text;
      return;
    }
    let raw = '', changed = false, li = 0;
    const list = ins[gi];
    for (let k = 0; k <= g.text.length; k++) {
      while (li < list.length && list[li].at === k) { raw += list[li++].text; changed = true; }
      if (k < g.text.length) { if (gone[g.a + k]) changed = true; else raw += g.text[k]; }
    }
    res += raw;
    if (changed) edits.push({ s: g.s, e: g.e, x: tEsc(raw) });
  });
  if (res !== nw) return null; // 조각 차례가 맞지 않으면 통째로
  for (const k of p.kids) if (local(k) === 'linesegarray') edits.push({ s: k.s, e: k.e, x: '' });
  let out = xml.slice(p.s, p.e);
  for (const ed of edits.sort((x, y) => y.s - x.s)) out = out.slice(0, ed.s - p.s) + ed.x + out.slice(ed.e - p.s);
  return out;
}

/* 첫 글자 모양으로 글을 통째로(hwpx-form setText — 탭·줄바꿈은 한글 요소로) */
const MARK = 'ssam-edit';
const setWhole = (xml, p, text) => setText(xml, p, MARK).replace(MARK, () => tEsc(text)); // 함수로 넣음: 새 글의 「$'」「$&」「$$」는 글자 그대로
/* 본 문단 tp를 복제한 새 문단(문단 모양·글자 모양만, 쪽·단 나누기는 뺌) */
const clonePara = (xml, tp, text, id) => noBreak(openTag(xml, tp).replace(/\bid="[^"]*"/, `id="${id}"`))
  + `<hp:run charPrIDRef="${charPrOf(xml, tp)}"><hp:t>${tEsc(text)}</hp:t></hp:run></hp:p>`;

/* 고친 뒤 줄 글: 지운 줄은 빼고(표 칸은 빈 글로 남음), 더한 줄은 그 뒤에 — 미리 보기 글·쌤비서 기본 문서용 */
export function finalLines(lines, edits = {}) {
  const out = [];
  (lines || []).forEach((l, i) => {
    const ed = get(edits, i), t = String(l.text || '');
    if (!ed) { out.push(t); return; }
    if (!ed.del) out.push(ed.text != null ? String(ed.text) : t);
    else if (l.inBox) out.push('');
    for (const a of ed.after || []) if (a && String(a.text == null ? '' : a.text).trim()) out.push(String(a.text));
  });
  return out;
}

/* form(readForm 결과, 바꾸지 않음) + edits { [줄 차례]: { text?(새 글), del?(지우기), after?: [{ text, tpl?(본 줄 차례 — 없으면 그 줄) }] } } (Map도 됨)
   → { bytes(.hwpx), warn } */
export function writeHwpx(form, edits = {}) {
  const L = form.lines, warn = [];
  const secXml = form.secs.map(s => s.xml), per = form.secs.map(() => []);
  let maxId = 0;
  for (const xml of secXml) for (const m of xml.matchAll(/<hp:p\b[^>]*?\sid="(\d+)"/g)) maxId = Math.max(maxId, +m[1]);
  let next = Math.min(maxId, 2000000000) + 1;
  L.forEach((l, i) => {
    const ed = get(edits, i);
    if (!ed) return;
    const xml = secXml[l.sec], p = l.node;
    const after = (ed.after || []).filter(a => a && String(a.text == null ? '' : a.text).trim());
    const text = ed.text != null ? String(ed.text) : null, changed = text != null && text !== l.text;
    if (!ed.del && !changed && !after.length) return;
    let out;
    if (ed.del) out = l.inBox || hasAny(p, KEEP) ? setWhole(xml, p, '') : '';
    else if (changed) { const sp = spliceText(xml, p, text); out = sp != null ? sp : setWhole(xml, p, text); }
    else out = xml.slice(p.s, p.e);
    for (const a of after) {
      const t = a.tpl != null && L[a.tpl] && L[a.tpl].sec === l.sec ? L[a.tpl] : l;
      out += clonePara(xml, t.node, String(a.text), next++);
    }
    per[l.sec].push({ s: p.s, e: p.e, x: out });
  });
  const outXml = secXml.map((xml, si) => {
    const ok = [];
    for (const ed of per[si].sort((a, b) => a.s - b.s)) { const prev = ok[ok.length - 1]; if (prev && ed.s < prev.e) { if (!warn.includes('overlap')) warn.push('overlap'); continue; } ok.push(ed); }
    let out = xml;
    for (const ed of ok.reverse()) out = out.slice(0, ed.s) + ed.x + out.slice(ed.e);
    return out;
  });
  const prv = finalLines(L, edits).filter(t => t.trim()).join('\r\n');
  const files = form.entries.map(e => {
    const si = form.secs.findIndex(s => s.name === e.name);
    if (si >= 0) return { name: e.name, data: outXml[si] };
    if (/^Preview\/PrvText\.txt$/i.test(e.name)) return { name: e.name, data: prv };
    return { name: e.name, data: e.data };
  });
  return { bytes: zipStore(files), warn };
}
