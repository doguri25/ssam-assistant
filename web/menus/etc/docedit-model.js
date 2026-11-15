/* 문서·소통 › 문서 다듬기 (스펙 2026-11-15 1A): 넣은 문서의 줄(문단·표 칸) 목록과 고친 단계, AI 요청·답 정리. 화면 없이 돌아감(시험).
   줄(item) = { id(AI에 보내는 번호), src(원래 줄 차례, 더한 줄은 null), tpl(본 문단 줄 차례), box(표 칸), orig(원래 글), text(지금 글), del(지움) }.
   함수는 목록을 바꾸지 않고 새 목록을 돌려줌(한 단계 되돌리기가 앞 목록을 그대로 씀).
   보낼 글: 이름·전화번호·이메일은 core/redact.js로 가리고(돌아온 글에 되돌림), 명단·주민번호 줄과 이름만 든 칸은 보내지 않음(그대로 둠) */
import { makeRedactor } from '../../core/redact.js';
import { nameCell } from '../../core/privacy.js';
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

/* 원래 줄(readForm lines 또는 { text, inBox }) → 고칠 줄 목록(빈 줄·그림만 있는 줄은 뺌) */
export function startItems(lines) {
  const out = [];
  (lines || []).forEach((l, i) => {
    const t = String((l && l.text) || '');
    if (t.trim()) out.push({ id: out.length + 1, src: i, tpl: i, box: !!(l && l.inBox), orig: t, text: t, del: false });
  });
  return out;
}

/* ---------- 보낼 글 ---------- */
/* → { sent: [{ id, text, box }], held(보내지 않은 줄 수), back(돌아온 글의 자리 표시 → 원래 이름·연락처) } */
export function payloadOf(items) {
  const r = makeRedactor(), sent = [];
  let held = 0;
  for (const x of items || []) {
    if (x.del || !x.text.trim()) continue;
    if (nameCell(x.text.trim())) { held++; continue; } // 이름만 든 칸·줄(명단 표의 이름 칸 등)
    const y = r.line(x.text.replace(/\r?\n/g, ' '));
    if (!y) { held++; continue; }
    sent.push({ id: x.id, text: y.text, box: x.box });
  }
  return { sent, held, back: r.back };
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
/* { changes: [{ id, op, text }], note } (배열만 온 답도) → 보낸 줄(ids)만, 이름 되돌림. 빈 replace·빈 after는 버림, 글의 줄바꿈은 뒤에 더하기로 */
export function normChanges(v, { ids = new Set(), back = t => t } = {}) {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray(v.changes) ? v.changes : [];
  const changes = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const id = typeof c.id === 'number' ? c.id : parseInt((/\d+/.exec(String(c.id == null ? '' : c.id)) || [''])[0], 10);
    const op = OPS[String(c.op || '').toLowerCase().trim()];
    if (!op || !ids.has(id)) continue;
    if (op === 'delete') { changes.push({ id, op, text: '' }); continue; }
    const parts = back(String(c.text == null ? '' : c.text).replace(/\r/g, '').replace(/^\s*\[\d+\]\s*/, '')).split('\n').map(s => s.replace(/\s+$/, '')).filter(s => s.trim());
    if (!parts.length) continue;
    parts.forEach((t, k) => changes.push({ id, op: k === 0 ? op : 'after', text: t }));
  }
  const note = back(String((v && !Array.isArray(v) && typeof v === 'object' && v.note) || '')).replace(/\s+/g, ' ').trim().slice(0, 300);
  return { changes, note };
}

/* ---------- 고치기·되돌리기 ---------- */
const leadOf = t => (/^[ \t　]*/.exec(String(t || '')) || [''])[0];
/* AI가 앞 공백을 빼먹은 글: 같은 단계 번호(「가.」 줄을 「가.」 줄로)면 원래 줄의 앞 공백을 붙임 */
const withLead = (text, like) => (!leadOf(text) && leadOf(like) && levelOf(text) === levelOf(like) ? leadOf(like) + text : text);
export function applyChanges(items, changes) {
  const out = (items || []).map(x => ({ ...x }));
  let next = Math.max(0, ...out.map(x => x.id)) + 1;
  const tail = new Map(); // 같은 줄 뒤에 여러 줄을 더하면 차례대로
  for (const c of changes || []) {
    const k = out.findIndex(x => x.id === c.id);
    if (k < 0) continue;
    const it = out[k];
    if (c.op === 'replace') { it.text = withLead(c.text, it.text); it.del = false; }
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
/* 글만 읽은 파일(.hwp·워드·PDF·글) → 쌤비서 기본 문서 { title, blocks }: 첫 줄은 제목, 탭으로 나뉜 줄이 이어지면 표, 빈 줄은 하나로 */
export function plainDoc(lines, items) {
  const all = finalLines(lines, editsOf(items));
  const first = all.findIndex(t => t.trim());
  const title = first >= 0 ? all[first].trim() : '';
  const rest = all.slice(first + 1);
  while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
  const blocks = [];
  for (const t of rest) {
    const last = blocks[blocks.length - 1];
    if (t.includes('\t')) {
      const row = t.split('\t').map(c => c.trim());
      if (last && last.type === 'table') last.rows.push(row); else blocks.push({ type: 'table', rows: [row] });
    } else if (!t.trim()) { if (!(last && last.type === 'p' && !last.text)) blocks.push({ type: 'p', text: '' }); }
    else blocks.push({ type: 'p', text: t });
  }
  return { title, blocks };
}
