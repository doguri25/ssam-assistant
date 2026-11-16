/* 문서·소통 › 문서 다듬기 (스펙 2026-11-15 1A): 넣은 문서의 줄(문단·표 칸) 목록과 고친 단계, AI 요청·답 정리. 화면 없이 돌아감(시험).
   줄(item) = { id(AI에 보내는 번호), src(원래 줄 차례, 더한 줄은 null), tpl(본 문단 줄 차례), box(표 칸), orig(원래 글), text(지금 글), del(지움),
   cell(한글 표 칸 줄만 — [표 차례, 줄 차례, 칸 차례]) }.
   함수는 목록을 바꾸지 않고 새 목록을 돌려줌(한 단계 되돌리기가 앞 목록을 그대로 씀).
   보낼 글: 이름·전화번호·이메일은 core/redact.js로 가리고(돌아온 글에 되돌림), 명단·주민번호 줄과 이름만 든 칸은 보내지 않음(그대로 둠) */
import { makeRedactor } from '../../core/redact.js';
import { nameCell, nameHead, nameUnderHead, peopleNames, stripNames, maskContacts } from '../../core/privacy.js';
import { levelOf } from '../../core/hwpx-form.js';
import { finalLines } from '../../core/hwpx-edit.js';

/* 빠른 요청 칩: ask를 요청 칸에 넣음. 날짜·학년도 바꾸기는 AI 없이 글 바꾸기(무엇을 무엇으로 묻고) */
export const CHIPS = [
  { id: 'formal', label: '공문체로', ask: '공문체로 다듬어 줘. 항목은 개조식(~함·~임)으로, 문장은 ~합니다·~바랍니다로 간결하고 정중하게.' },
  { id: 'short', label: '짧게(절반쯤)', ask: '글을 절반쯤으로 줄여 줘. 날짜·장소·대상·숫자 같은 꼭 필요한 내용은 남기고 겹치는 말은 빼 줘.' },
  { id: 'spell', label: '맞춤법·띄어쓰기', ask: '맞춤법과 띄어쓰기만 바로잡아 줘. 말투와 내용은 그대로 둬.' },
  { id: 'easy', label: '쉬운 말로(학부모용)', ask: '학부모님이 읽기 쉽게 쉬운 말로 바꿔 줘. 어려운 한자어·행정 용어는 풀어 쓰고 말투는 정중하게.' },
  { id: 'swap', label: '날짜·학년도 바꾸기', ask: '' },
  { id: 'num', label: '번호 꼴 맞추기', ask: '항목 번호 꼴을 1. → 가. → 1) → 가) → (1) → (가) 차례로 맞춰 줘. 글 내용은 그대로 둬.' }
];
export const HIST_MAX = 10;
export const BATCH_CHARS = 12000, BATCH_LINES = 250;

const tag = n => (n && n.name ? n.name.replace(/^.*:/, '') : '');
/* 칸 주소(<hp:cellAddr colAddr rowAddr>, core/hwpx-table.js와 같게) 속성 값, 없으면 -1 */
const addrOf = (l, tc, a) => {
  const n = typeof l.xml === 'string' && tc.kids.find(k => tag(k) === 'cellAddr');
  const m = n && new RegExp(`\\s${a}="(\\d+)"`).exec(l.xml.slice(n.s, n.oe));
  return m ? +m[1] : -1;
};
/* 한글 표 칸 줄(readForm 줄의 box = 칸의 subList)의 자리 → [표 차례, 줄 차례, 칸 차례], 아니면 null.
   줄·칸 차례는 칸 주소로(세로로 합친 칸 — 「1모둠」이 세 줄을 덮으면 아래 줄은 칸이 하나 적어 형제 차례로는 왼쪽으로 밀림), 주소가 없으면 형제 차례 */
function cellAt(l, tables) {
  const tc = l && l.inBox && l.box && l.box.up, tr = tc && tc.up, tb = tr && tr.up;
  if (tag(tc) !== 'tc' || tag(tr) !== 'tr' || tag(tb) !== 'tbl') return null;
  if (!tables.has(tb)) tables.set(tb, tables.size);
  const row = addrOf(l, tc, 'rowAddr'), col = addrOf(l, tc, 'colAddr');
  return [tables.get(tb), row >= 0 ? row : tb.kids.filter(k => tag(k) === 'tr').indexOf(tr), col >= 0 ? col : tr.kids.filter(k => tag(k) === 'tc').indexOf(tc)];
}
/* 원래 줄(readForm lines 또는 { text, inBox }) → 고칠 줄 목록(빈 줄·그림만 있는 줄은 뺌) */
export function startItems(lines) {
  const out = [], tables = new Map();
  (lines || []).forEach((l, i) => {
    const t = String((l && l.text) || '');
    if (!t.trim()) return;
    const cell = cellAt(l, tables);
    out.push({ id: out.length + 1, src: i, tpl: i, box: !!(l && l.inBox), orig: t, text: t, del: false, ...(cell ? { cell } : {}) });
  });
  return out;
}

/* ---------- 보낼 글 ---------- */
/* 문단 안 줄바꿈(한글 <hp:lineBreak/>)은 AI에 이 표시로 보내고 돌아온 글에서 다시 줄바꿈으로(글의 줄바꿈은 「뒤에 더하기」라서) */
export const BR = '⏎';
const BR_BACK = new RegExp(`[ \\t]*${BR}`, 'g'); // 돌아온 ⏎(앞에 AI가 더한 빈칸까지) → 줄바꿈
/* 보내지 않는 줄(주민번호·계좌 줄, 이름만 든 칸)의 이름 모양 낱말과 사람 명단 줄(「참석: …」)의 이름 — 다른 줄에서도 가리게.
   이름이 늘어선 줄이라도 사람 명단이 아니면(「준비물: 도시락, 우비, 안내문, 신분증」) 배우지 않음 */
function heldNames(texts) {
  const out = makeRedactor().lines(texts);
  return texts.flatMap((t, k) => {
    if (nameCell(t.trim())) return [t.trim()];
    if (out[k]) return [];
    return stripNames(maskContacts(t)).dropped ? peopleNames(t) : (t.match(/[가-힣]+/g) || []).filter(nameCell);
  });
}
/* 줄 목록 + 선생님이 적은 요청 → { sent: [{ id, text, box }], held(보내지 않은 줄 수), ask(가린 요청 — 명단·주민번호 같은 요청이면 null),
   back(돌아온 글의 자리 표시 → 원래 이름·연락처), bad(돌아온 글에 없는 번호·깨진 자리 표시가 있는지) }.
   한 가리개로 문서 전체를 한꺼번에(한 줄에 한 명씩인 명단·「이름」 머리 칸 아래 표, 한 줄에서 알아낸 이름은 다른 줄에서도).
   이 문서의 원래 글·요청에서 이름을 먼저 배움(이어서 고칠 때 AI가 「학생」 같은 말을 뺀 글도 가리게).
   요청도 같은 가리개로(줄과 같은 이름은 같은 번호 — 「〔이름1〕을 〔이름2〕로 바꿔 줘」가 맞게 돌아옴) */
export function payloadOf(items, ask = '') {
  const r = makeRedactor(), all = items || [], sent = [];
  const live = all.filter(x => !x.del && x.text.trim());
  // 한글 표의 「이름·성명」 머리 칸 아래 칸(이솔·박준·김가을처럼 두 글자·조사 끝 글자 이름도)
  const heads = live.filter(x => x.cell && nameHead(x.text));
  const underHead = x => !!x.cell && nameUnderHead(x.text) && heads.some(h => h.cell[0] === x.cell[0] && h.cell[2] === x.cell[2] && h.cell[1] < x.cell[1]);
  const isHeld = x => nameCell(x.text.trim()) || underHead(x);
  const cells = live.filter(isHeld), send = live.filter(x => !isHeld(x)); // 이름만 든 칸·줄(명단 표의 이름 칸 등)은 보내지 않음
  const asks = String(ask || '').split(/\r?\n/), origs = all.map(x => x.orig).filter(t => t && t.trim());
  r.learn([...origs, ...asks]);
  for (const n of [...heldNames([...live.map(x => x.text), ...origs]), ...cells.filter(underHead).map(x => x.text.trim())]) if (!r.names.includes(n)) r.names.push(n);
  const outs = r.lines(send.map(x => x.text.replace(/\r/g, '')));
  let held = cells.length;
  send.forEach((x, k) => { if (outs[k]) sent.push({ id: x.id, text: outs[k].text.replace(/\n/g, BR), box: x.box }); else held++; });
  const parts = r.lines(asks);
  return { sent, held, ask: parts.some(x => !x) ? null : parts.map(x => x.text).join('\n').trim(), back: r.back, bad: r.bad };
}
/* 앞에서부터 약 12,000자·250줄씩 */
export function batchLines(sent, { chars = BATCH_CHARS, max = BATCH_LINES } = {}) {
  const out = [];
  let cur = [], n = 0;
  for (const s of sent || []) {
    if (cur.length && (cur.length >= max || n + s.text.length > chars)) { out.push(cur); cur = []; n = 0; }
    cur.push(s); n += s.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}
/* 번호 목록 → 「3~5, 9」 */
function ranges(ids) {
  const out = [];
  for (let k = 0; k < ids.length;) {
    let j = k;
    while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
    out.push(j > k ? `${ids[k]}~${ids[j]}` : String(ids[k]));
    k = j + 1;
  }
  return out.join(', ');
}
/* part: [몇째, 모두] — 긴 문서를 나눠 보낼 때 */
export function docPrompt({ ask = '', lines = [], part = null } = {}) {
  const cells = lines.filter(l => l.box).map(l => l.id);
  return ['[문서 다듬기]',
    '학교 선생님이 넣은 한글 문서의 줄(문단·표 칸)입니다. 선생님 요청대로 줄의 글만 고칩니다. 표·글꼴·결재란 같은 모양은 앱이 그대로 둡니다.',
    `[요청] ${String(ask).trim()}`,
    '- 고칠 줄만 답합니다. 그대로 둘 줄은 쓰지 않습니다.',
    '- op "replace": 그 줄 글을 text로 바꿈 · "delete": 그 줄을 지움 · "after": 그 줄 바로 뒤에 같은 모양의 새 줄 text를 더함(줄마다 하나씩).',
    '- 한 줄은 한 문단입니다. 두 줄을 합치려면 하나를 replace하고 나머지는 delete합니다. 새 표를 만들거나 차례를 크게 바꾸지 않습니다.',
    ...(cells.length ? [`- 표 칸 줄: ${ranges(cells)}. 칸에 들어갈 만큼 짧게 쓰고, 지우면 그 칸이 비어요.`] : []),
    '- 〔이름1〕·{{1}} 같은 자리 표시는 가린 이름·연락처입니다. 고치지 말고 그 자리에 둡니다.',
    ...(lines.some(l => l.text.includes(BR)) ? [`- ${BR}는 한 줄(문단) 안의 줄바꿈입니다. 고친 글에도 그 자리에 ${BR}를 그대로 둡니다(앞뒤에 빈칸을 더하지 않음).`] : []),
    '- 줄 머리의 번호(1. 가. 1) 가) ①·□·-)와 앞 공백·탭은 요청이 없으면 그대로 둡니다.',
    '- 문서에 없는 날짜·숫자·이름·사실을 지어내지 않고, 뜻이 바뀌지 않게 고칩니다.',
    '- 사람이 쓴 자연스러운 한국어로 씁니다(번역투·「~를 통해」·이중 피동 없이).',
    ...(part && part[1] > 1 ? [`- 문서가 길어 ${part[0]}/${part[1]}번째 부분만 보냅니다. 이 부분의 줄만 고칩니다.`] : []),
    '', '[줄]', ...lines.map(l => `[${l.id}] ${l.text}`),
    '', '[출력] JSON 하나만 출력합니다. note는 무엇을 고쳤는지 한 문장으로 씁니다.',
    '{"changes":[{"id":3,"op":"replace","text":"…"},{"id":5,"op":"delete"},{"id":7,"op":"after","text":"…"}],"note":"…"}'].join('\n');
}

/* ---------- AI 답 ---------- */
const OPS = { replace: 'replace', edit: 'replace', change: 'replace', update: 'replace', delete: 'delete', remove: 'delete', del: 'delete', after: 'after', insert: 'after', add: 'after' };
/* { changes: [{ id, op, text }], note } (배열만 온 답도) → { changes, note, broken }: 보낸 줄(ids)만, 이름 되돌림. 빈 replace·빈 after는 버림,
   글의 줄바꿈은 뒤에 더하기로, ⏎는 문단 안 줄바꿈으로. 자리 표시가 깨진 글(bad — 없는 번호·「{{1」·「[이름1]」)은 버리고 센 수(broken) — 그 줄은 그대로 */
export function normChanges(v, { ids = new Set(), back = t => t, bad = () => false } = {}) {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray(v.changes) ? v.changes : [];
  const changes = [];
  let broken = 0;
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const id = typeof c.id === 'number' ? c.id : parseInt((/\d+/.exec(String(c.id == null ? '' : c.id)) || [''])[0], 10);
    const op = OPS[String(c.op || '').toLowerCase().trim()];
    if (!op || !ids.has(id)) continue;
    if (op === 'delete') { changes.push({ id, op, text: '' }); continue; }
    const raw = String(c.text == null ? '' : c.text).replace(/\r/g, '').replace(/^\s*\[\d+\]\s*/, '');
    if (bad(raw)) { broken++; continue; }
    const parts = back(raw).split('\n').map(s => s.replace(/\s+$/, '').replace(BR_BACK, '\n')).filter(s => s.trim());
    if (!parts.length) continue;
    parts.forEach((t, k) => changes.push({ id, op: k === 0 ? op : 'after', text: t }));
  }
  const note = back(String((v && !Array.isArray(v) && typeof v === 'object' && v.note) || '')).replace(BR_BACK, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  return { changes, note, broken };
}

/* ---------- 고치기·되돌리기 ---------- */
const leadOf = t => (/^[ \t　]*/.exec(String(t || '')) || [''])[0];
/* AI가 앞 공백을 빼먹은 글: 같은 단계 번호(「가.」 줄을 「가.」 줄로)면 원래 줄의 앞 공백을 붙임 */
const withLead = (text, like) => (!leadOf(text) && leadOf(like) && levelOf(text) === levelOf(like) ? leadOf(like) + text : text);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* AI가 ⏎(문단 안 줄바꿈)를 빼먹고 빈칸으로 이은 글: 원래 줄바꿈 앞뒤 낱말이 빈칸을 사이에 두고 그대로 있으면 그 자리에 줄바꿈(다음 줄 앞 공백도) */
function keepBreaks(text, like) {
  if (!like.includes('\n') || text.includes('\n')) return text;
  const segs = like.split('\n');
  let out = text, from = 0;
  for (let k = 0; k + 1 < segs.length; k++) {
    const a = (/\S+(?=\s*$)/.exec(segs[k]) || [''])[0], b = (/\S+/.exec(segs[k + 1]) || [''])[0];
    if (!a || !b) continue;
    const re = new RegExp(`${reEsc(a)}[ \\t]+${reEsc(b)}`, 'g');
    re.lastIndex = from;
    const m = re.exec(out);
    if (!m) continue;
    const at = m.index + a.length, nl = '\n' + leadOf(segs[k + 1]);
    out = out.slice(0, at) + nl + out.slice(m.index + m[0].length - b.length);
    from = at + nl.length;
  }
  return out;
}
export function applyChanges(items, changes) {
  const out = (items || []).map(x => ({ ...x }));
  let next = Math.max(0, ...out.map(x => x.id)) + 1;
  const tail = new Map(); // 같은 줄 뒤에 여러 줄을 더하면 차례대로
  for (const c of changes || []) {
    const k = out.findIndex(x => x.id === c.id);
    if (k < 0) continue;
    const it = out[k];
    if (c.op === 'replace') { it.text = withLead(keepBreaks(c.text, it.text), it.text); it.del = false; }
    else if (c.op === 'delete') { if (it.src == null) out.splice(k, 1); else it.del = true; }
    else if (c.op === 'after') {
      const j = out.findIndex(x => x.id === (tail.get(c.id) || c.id));
      const add = { id: next++, src: null, tpl: it.tpl, box: it.box, orig: null, text: withLead(c.text, it.text), del: false };
      out.splice(j + 1, 0, add);
      tail.set(c.id, add.id);
    }
  }
  return out;
}
const changed = x => x.src == null || x.del || x.text !== x.orig;
/* 바뀐 줄(문서 차례) → [{ id, kind: 'edit'|'del'|'add', before, after, box }] */
export function changesOf(items) {
  return (items || []).filter(changed).map(x => ({ id: x.id, kind: x.src == null ? 'add' : x.del ? 'del' : 'edit', before: x.src == null ? '' : x.orig, after: x.del ? '' : x.text, box: x.box }));
}
/* 미리 보기: 바뀌지 않은 줄은 묶음으로 → [{ type: 'same', items } | { type: 'change', c }] */
export function viewOf(items) {
  const out = [], ch = new Map(changesOf(items).map(c => [c.id, c]));
  for (const x of items || []) {
    if (ch.has(x.id)) { out.push({ type: 'change', c: ch.get(x.id) }); continue; }
    const last = out[out.length - 1];
    if (last && last.type === 'same') last.items.push(x); else out.push({ type: 'same', items: [x] });
  }
  return out;
}
/* 그 줄만 되돌리기: 원래 줄은 원래 글로, 더한 줄은 뺌 */
export function revertOne(items, id) {
  return (items || []).filter(x => !(x.id === id && x.src == null)).map(x => (x.id === id ? { ...x, text: x.orig, del: false } : x));
}
export function revertAll(items) {
  return (items || []).filter(x => x.src != null).map(x => (changed(x) ? { ...x, text: x.orig, del: false } : x));
}
export const pushHist = (hist, items) => [...(hist || []), items].slice(-HIST_MAX);

/* ---------- 날짜·학년도 바꾸기 (AI 없이) ---------- */
export function guessSwap(items) {
  const t = (items || []).filter(x => !x.del).map(x => x.text).join('\n');
  let m = /((?:19|20)\d{2})\s*학년도/.exec(t);
  if (m) return { from: m[0], to: m[0].replace(m[1], String(+m[1] + 1)) };
  m = /((?:19|20)\d{2})년/.exec(t);
  if (m) return { from: m[0], to: `${+m[1] + 1}년` };
  return { from: '', to: '' };
}
/* from이 든 줄의 글을 모두 to로(지운 줄은 그대로) → { items, n(바뀐 줄 수) } */
export function swapItems(items, from, to) {
  const f = String(from || '');
  if (!f) return { items, n: 0 };
  let n = 0;
  const out = (items || []).map(x => {
    if (x.del || !x.text.includes(f)) return x;
    const t = x.text.split(f).join(String(to == null ? '' : to));
    if (t === x.text) return x;
    n++;
    return { ...x, text: t };
  });
  return { items: out, n };
}

/* ---------- 내보내기 ---------- */
/* 목록 → core/hwpx-edit writeHwpx 편집 { [원래 줄 차례]: { text?, del?, after: [{ text, tpl }] } } — 더한 줄은 앞 원래 줄 뒤에 차례대로 */
export function editsOf(items) {
  const ed = {};
  let anchor = null;
  const at = i => (ed[i] || (ed[i] = { after: [] }));
  for (const x of items || []) {
    if (x.src != null) {
      anchor = x.src;
      if (x.del) at(x.src).del = true;
      else if (x.text !== x.orig) at(x.src).text = x.text;
      continue;
    }
    at(anchor != null ? anchor : x.tpl).after.push({ text: x.text, tpl: x.tpl });
  }
  return ed;
}
// 표 줄: .hwp 글(평가 메뉴 blocksToText)은 칸을 「 | 」로 이음(빈 끝 칸은 「|」로 끝남), 워드 표는 칸마다 탭
const PIPE_ROW = /\s\|(?:\s|$)|^\|\s/;
// 워드 문단 안 탭(「1.⇥목적」「붙임⇥계획서 1부.」): 칸 둘이고 앞 칸이 번호·기호·붙임이면 표 줄이 아님
const ITEM_HEAD = /^(?:\d{1,2}[.)]|[가-하][.)]|\(\d{1,2}\)|\([가-하]\)|[①-⑳]|[□■○●◦·•▪※\-–]|붙임(?:\s*\d+\.?)?)$/;
function rowOf(t) {
  const s = t.trim();
  if (PIPE_ROW.test(s)) return { k: '|', cells: s.split(/\s*\|\s*/).map(c => c.trim()) };
  if (!t.includes('\t')) return null;
  const cells = t.split('\t').map(c => c.trim());
  return cells.length === 2 && ITEM_HEAD.test(cells[0]) ? null : { k: '\t', cells };
}
/* 글만 읽은 파일(.hwp·워드·PDF·글) → 쌤비서 기본 문서 { title, blocks }: 첫 줄은 제목, 「칸 | 칸」 줄(.hwp 표)이나 탭으로 나뉜 줄(워드 표)이 이어지면 표,
   빈 줄은 하나로. 탭 줄은 두 줄 넘게 이어지거나 칸이 셋 넘을 때만 표(문단 안 탭 한 줄은 문단 그대로) */
export function plainDoc(lines, items) {
  const all = finalLines(lines, editsOf(items));
  const first = all.findIndex(t => t.trim());
  const title = first >= 0 ? all[first].trim() : '';
  const rest = all.slice(first + 1);
  while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
  const blocks = [];
  for (let i = 0; i < rest.length;) {
    const t = rest[i], row = rowOf(t), last = blocks[blocks.length - 1];
    if (row) {
      let j = i + 1;
      const rows = [row.cells];
      for (let r; j < rest.length && (r = rowOf(rest[j])) && r.k === row.k; j++) rows.push(r.cells);
      if (row.k === '|' || rows.length >= 2 || row.cells.length >= 3) blocks.push({ type: 'table', rows });
      else blocks.push({ type: 'p', text: t });
      i = j;
      continue;
    }
    if (!t.trim()) { if (!(last && last.type === 'p' && !last.text)) blocks.push({ type: 'p', text: '' }); }
    else blocks.push({ type: 'p', text: t });
    i++;
  }
  return { title, blocks };
}
