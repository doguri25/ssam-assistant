/* 계획서 「새 서식으로 바꾸기」 (스펙 2026-11-15 1B, 방식 나 — 제목·본문 자리만 남기고 본문을 새로 채움). 화면 없음(Node 시험에서도 씀).
   새 서식(.hwpx) 글의 큰 제목(목차 읽기 1단계)에 지금 초안 칸(옛 칸)을 맞춤: 규칙 먼저(같은 제목 → 같은 역할 → 비슷한 제목),
   남은 것은 AI 답 { map: [{ to: 새 칸, from: [옛 칸 id] }], write: [{ to: 새 칸, text }] }(모르는 id는 버림). 옮길 곳 없는 옛 칸은 화면에서 [이 칸에 붙이기].
   옛 칸 읽기와 바꾼 초안 만들기는 계획서마다: 연간계획(목차 key·글, 일정·예산 표) · 행사계획(계획서 글의 큰 제목 칸) · 학급운영계획(큰 제목 묶음, 작은 칸은 따라감) */
import { parseOutline, roleOf, withRoles, newId, normGuide } from './classplan-model.js';
import { SECTIONS, TEXT_SECTIONS, yearOutline, sectionRole, isExtra, normDraft } from './year-model.js';
import { planHeadLines } from './event-model.js';
import { makeRedactor } from '../../core/redact.js';

const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';
const MAX_HEADS = 12, MAX_SEC = 1500, MAX_ALL = 12000;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : '');
const norm = s => String(s || '').replace(/[\s\p{P}\p{S}]/gu, '');
// 앞뒤 빈 줄만 뺌(줄 앞 들여쓰기는 그대로)
const tidy = s => str(s).replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '');
const join = parts => parts.map(tidy).filter(x => x.trim()).join('\n');

/* 작년 계획서(.hwpx)를 함께 저장할 학교 양식 이름 */
export const lastFormName = file => `작년 계획서 서식 · ${String(file || '').replace(/\.[^.]+$/, '').trim() || '계획서'}`;

/* ---------- 새 서식 읽기 ---------- */
/* 새 서식 글 → { heads: [{ title }], roman }. 큰 제목이 셋보다 적으면 heads는 빈 목록(양식으로만 저장) */
export function formHeads(text) {
  const top = parseOutline(text).filter(x => x.level === 1).slice(0, MAX_HEADS).map(x => ({ title: x.title }));
  return { heads: top.length >= 3 ? top : [], roman: /^\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.\s*\S/m.test(str(text)) };
}
/* 제목의 역할: 학급운영계획 표 칸(시수·월별·평가 표) 먼저, 그다음 연간계획 칸 역할(목적·방침·일정·예산·평가·세부) */
export const planRole = title => roleOf(title) || sectionRole(title);
export const withPlanRoles = heads => heads.map(h => ({ ...h, role: planRole(h.title) }));

/* ---------- 규칙으로 맞추기 ---------- */
const bigrams = s => { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b; };
function similar(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x))) return 0.9;
  const p = bigrams(x), q = bigrams(y);
  if (!p.size || !q.size) return 0;
  let n = 0;
  for (const g of p) if (q.has(g)) n++;
  return (2 * n) / (p.size + q.size);
}
const SIMILAR = 0.5;
/* olds: [{ id, title, role }], heads: [{ title, role }] → 새 칸마다 옮겨 올 옛 칸 id 목록(옛 칸은 한 곳에만).
   1) 같은 제목 2) 같은 역할(그 역할이 옛 칸·새 칸에 하나씩일 때만 — 어느 것인지 모르면 맞추지 않음) 3) 비슷한 제목(가장 비슷한 짝부터).
   accepts(head, old): 그 칸에 받을 수 있는지(연간계획 일정·예산 표 칸은 표만) */
export function ruleMap(olds, heads, { accepts } = {}) {
  const ok = (h, o) => !accepts || accepts(h, o);
  const to = heads.map(() => []), used = new Set(), done = new Set();
  const take = (i, o) => { to[i].push(o.id); used.add(o.id); done.add(i); };
  heads.forEach((h, i) => {
    const o = olds.find(x => !used.has(x.id) && norm(x.title) && norm(x.title) === norm(h.title) && ok(h, x));
    if (o) take(i, o);
  });
  const count = (list, r) => list.filter(x => x.role === r).length;
  heads.forEach((h, i) => {
    if (done.has(i) || !h.role || count(heads, h.role) !== 1 || count(olds, h.role) !== 1) return;
    const o = olds.find(x => x.role === h.role && !used.has(x.id) && ok(h, x));
    if (o) take(i, o);
  });
  const pairs = [];
  heads.forEach((h, i) => {
    if (done.has(i)) return;
    olds.forEach((o, k) => { if (used.has(o.id) || !ok(h, o)) return; const s = similar(h.title, o.title); if (s >= SIMILAR) pairs.push({ i, o, s, k }); });
  });
  pairs.sort((a, b) => b.s - a.s || a.i - b.i || a.k - b.k);
  for (const p of pairs) if (!done.has(p.i) && !used.has(p.o.id)) take(p.i, p.o);
  return to;
}
/* 규칙으로 다 맞지 않았는지(갈 곳 없는 옛 칸이나, 옮겨 올 칸 없는 새 칸 — 표 칸은 빼고) → AI를 부름 */
export function needsAI(olds, heads, rules) {
  const used = new Set((rules || []).flat());
  return olds.some(o => !used.has(o.id)) || heads.some((h, i) => !h.fixed && !((rules && rules[i]) || []).length);
}

/* ---------- AI ---------- */
/* AI로 보낼 글: 새 칸 [n1]…(규칙이 맞춘 옛 칸 표시), 옛 칸 [o1]… 제목과 글. 이름·전화번호·이메일은 자리 표시(core/redact.js), 주민번호·명단 줄은 보내지 않음
   → { prompt, back(돌아온 글에 원래 값을 되돌림) } */
export function reformPrompt({ kind, title, context = '', olds, heads, rules }) {
  const r = makeRedactor();
  const red = t => str(t).split('\n').map(l => r.line(l)).filter(Boolean).map(x => x.text).join('\n');
  const byId = new Map(olds.map(o => [o.id, o]));
  const R = (rules || []).map(x => x || []);
  const at = new Map();
  R.forEach((ids, i) => ids.forEach(id => at.set(id, i)));
  const left = olds.filter(o => !at.has(o.id)).map(o => o.id);
  const empty = heads.map((h, i) => i).filter(i => !(R[i] || []).length && !heads[i].fixed).map(i => 'n' + (i + 1));
  let budget = MAX_ALL;
  const clip = t => { const s = t.slice(0, Math.max(0, Math.min(MAX_SEC, budget))); budget -= s.length; return s + (s.length < t.length ? '\n…(뒷부분 줄임)' : ''); };
  const headLines = heads.map((h, i) => `[n${i + 1}] ${red(h.title)}${(R[i] || []).length ? ` ← 옛 칸 ${R[i].map(id => `「${red(byId.get(id).title)}」`).join('·')}` : h.fixed ? ` ← ${h.fixed} 그대로` : ''}`);
  const oldLines = olds.map(o => {
    const t = red(o.text).trim();
    return `[${o.id}] ${red(o.title)}${at.has(o.id) ? ` (n${at.get(o.id) + 1}로 옮김)` : ' (아직 갈 곳 없음)'}${t ? `\n"""\n${clip(t)}\n"""` : ' (글 없음)'}`;
  });
  const ctx = red(context).trim();
  const prompt = `[새 서식 맞추기]\n학교 계획서(${kind})를 학교의 새 서식 차례로 옮기려고 해요. 지금 초안의 칸(옛 칸)을 새 서식의 큰 제목(새 칸)에 맞춰 주세요.\n`
    + `계획서: ${red(title)}\n${ctx ? ctx + '\n' : ''}\n`
    + `새 칸(새 서식의 큰 제목, 이 차례 그대로):\n${headLines.join('\n')}\n\n`
    + `지금 초안의 옛 칸:\n${oldLines.join('\n')}\n\n`
    + '규칙:\n'
    + `- map: 아직 갈 곳 없는 옛 칸${left.length ? `(${left.join('·')})` : ''}을 뜻이 같거나 그 안에 들어갈 새 칸으로 옮김 — {"to": 새 칸 id, "from": [옛 칸 id]}. 맞는 새 칸이 없는 옛 칸은 넣지 않음(선생님이 정함)\n`
    + `- write: 옮겨 올 옛 칸이 없는 새 칸${empty.length ? `(${empty.join('·')})` : ''}만, 그 제목 아래 들어갈 글을 지금 초안 내용을 바탕으로 학교 계획서 문체(「~한다」, 「가.」「1)」 목록)로 새로 씀. 제목 줄은 쓰지 않음\n`
    + '- 초안에 없는 숫자·날짜·사실은 지어내지 않음. 〔이름1〕·{{1}} 같은 자리 표시는 그대로 둠\n\n'
    + '답은 JSON 하나만: {"map":[{"to":"n2","from":["o1"]}],"write":[{"to":"n3","text":"…"}]}';
  return { prompt, back: r.back };
}
/* 새 칸 id(「n2」·2·"2" — 1부터) → 0부터 번호, 없는 칸은 -1 */
const headIdx = (t, n) => { const m = /^\s*n?\s*(\d{1,2})\s*$/i.exec(str(t)); const i = m ? +m[1] - 1 : -1; return i >= 0 && i < n ? i : -1; };
/* AI 답 다듬기: 모르는 새 칸·옛 칸 id, 빈 글은 버림 → { map: [{ to(0부터), from }], write: [{ to, text }] } */
export function normReform(v, oldIds, n) {
  if (!isObj(v)) return { map: [], write: [] };
  const ids = new Set(oldIds);
  const map = (Array.isArray(v.map) ? v.map : []).filter(isObj)
    .map(m => ({ to: headIdx(m.to, n), from: [...new Set((Array.isArray(m.from) ? m.from : [m.from]).map(x => str(x).trim()).filter(id => ids.has(id)))] }))
    .filter(m => m.to >= 0 && m.from.length);
  const write = (Array.isArray(v.write) ? v.write : []).filter(isObj).map(w => ({ to: headIdx(w.to, n), text: str(w.text).trim() })).filter(w => w.to >= 0 && w.text);
  return { map, write };
}

/* ---------- 합치기 ---------- */
/* 규칙 + AI 답 → { to: [{ title, from: [옛 칸 id](옛 차례), write(AI가 새로 쓴 글) }], orphans(옮길 곳 없는 옛 칸), attached({ 옛 칸: 붙인 새 칸 }) }.
   AI가 옮긴 옛 칸은 아직 갈 곳 없던 것만(한 곳에만), 새로 쓴 글은 옮겨 오는 칸이 없는 새 칸(표 칸 빼고)만 */
export function mergeReform(heads, olds, rules, answer, { accepts } = {}) {
  const order = new Map(olds.map((o, k) => [o.id, k])), byId = new Map(olds.map(o => [o.id, o]));
  const to = heads.map((h, i) => ({ title: h.title, from: [...((rules && rules[i]) || [])], write: '' }));
  const used = new Set(to.flatMap(x => x.from));
  const a = answer || {};
  for (const m of a.map || []) {
    if (!to[m.to]) continue;
    for (const id of m.from || []) if (byId.has(id) && !used.has(id) && (!accepts || accepts(heads[m.to], byId.get(id)))) { used.add(id); to[m.to].from.push(id); }
  }
  for (const w of a.write || []) if (to[w.to] && !to[w.to].from.length && !to[w.to].write && !heads[w.to].fixed) to[w.to].write = w.text;
  for (const x of to) x.from.sort((p, q) => order.get(p) - order.get(q));
  return { to, orphans: olds.filter(o => !used.has(o.id)).map(o => o.id), attached: {} };
}
/* 옮길 곳 없는 옛 칸을 새 칸(i, 0부터)에 붙임 — -1이면 붙이지 않음. 옮길 곳 없는 칸이 아니면 그대로 */
export function attachOrphan(f, id, i) {
  if (!f || !f.orphans.includes(id)) return f;
  const attached = { ...f.attached };
  const to = f.to.map(x => ({ ...x, from: x.from.filter(y => y !== id) }));
  if (i >= 0 && to[i]) { to[i].from.push(id); attached[id] = i; } else delete attached[id];
  return { ...f, to, attached };
}

/* ---------- 연간계획: 목차 key·글 ---------- */
const won = n => Number(n || 0).toLocaleString('ko-KR');
const dayText = s => (s.date ? `${+s.date.slice(5, 7)}월 ${+s.date.slice(8, 10)}일` : s.month ? `${s.month}월` : '');
/* 초안 → 옛 칸(화면 차례: 목차, 없으면 기본 차례). 일정·예산 표는 줄 글로(글 칸에 붙이면 그 글) */
export function yearOlds(d) {
  const order = d && d.outline && d.outline.length ? d.outline.map(o => [o.key, o.title]) : SECTIONS;
  return order.map(([key, title], i) => ({
    id: 'o' + (i + 1), key, title, role: isExtra(key) ? '' : key,
    text: key === 'schedule' ? ((d && d.schedule) || []).map(s => [dayText(s), s.title].filter(Boolean).join(' ')).join('\n')
      : key === 'budget' ? ((d && d.budget) || []).map(b => `${b.name} ${won(b.amount)}원${b.note ? ` (${b.note})` : ''}`).join('\n')
      : str(d && d[key])
  }));
}
/* 새 서식 글 → 새 칸(연간계획 목차 읽기 그대로 key를 정함: 목적·방침·세부·일정·예산·평가, 그 밖은 덧붙임 칸). 일정·예산 칸은 표 그대로 */
export function yearHeads(text) {
  const o = yearOutline(text);
  return {
    heads: o.items.map(x => ({ title: x.title, key: x.key, role: isExtra(x.key) ? '' : x.key, ...(x.key === 'schedule' ? { fixed: '일정 표' } : x.key === 'budget' ? { fixed: '예산 표' } : {}) })),
    roman: o.roman
  };
}
/* 일정·예산 표 칸에는 그 표만 */
export const yearAccepts = (h, o) => !(h.key === 'schedule' || h.key === 'budget') || o.key === h.key;
/* 바꾼 초안: 새 목차(fromForm — 「다시 만들기」도 이 차례), 글 칸은 옮겨 온 칸 글 + 새로 쓴 글, 일정·예산 표는 그대로 */
export function applyYear(d, f, H, olds) {
  const byId = new Map(olds.map(o => [o.id, o]));
  const v = { ...d, outline: H.heads.map(h => ({ key: h.key, title: h.title })), roman: H.roman, fromForm: true };
  for (const k of Object.keys(v)) if (isExtra(k)) delete v[k];
  for (const k of TEXT_SECTIONS) v[k] = '';
  H.heads.forEach((h, i) => {
    if (h.key === 'schedule' || h.key === 'budget') return;
    v[h.key] = join([...f.to[i].from.map(id => (byId.get(id) || {}).text), f.to[i].write]);
  });
  return normDraft(v);
}

/* ---------- 행사계획: 계획서 글 ---------- */
const NUM_HEAD = new RegExp(`^\\s*(?:[${ROMAN}]|\\d{1,2})\\.\\s*`);
/* 계획서 글 → { pre(첫 큰 제목 앞 글), olds(큰 제목마다 칸: 제목 줄 다음부터 다음 큰 제목 앞까지) }. 큰 제목이 없으면 글 전체가 한 칸 */
export function eventOlds(e) {
  const text = str(e && e.docs && e.docs.plan), lines = text.split('\n'), at = planHeadLines(e, text);
  if (!at.length) return { pre: '', olds: text.trim() ? [{ id: 'o1', title: '세부 계획', role: 'details', text: tidy(text) }] : [] };
  const olds = at.map((ln, i) => {
    const title = lines[ln].trim().replace(NUM_HEAD, '') || lines[ln].trim();
    return { id: 'o' + (i + 1), title, role: planRole(title), text: tidy(lines.slice(ln + 1, at[i + 1] == null ? lines.length : at[i + 1]).join('\n')) };
  });
  return { pre: tidy(lines.slice(0, at[0]).join('\n')), olds };
}
/* 바꾼 계획서 글: 앞 글 + 새 제목 줄(서식 번호 꼴 Ⅰ.·1.) + 옮겨 온 글·새로 쓴 글 → { plan, form(제목 줄 — 한글 파일·다시 만들기가 이 차례) } */
export function applyEvent(e, f, H, pre, olds) {
  const byId = new Map(olds.map(o => [o.id, o]));
  const form = H.heads.map((h, i) => `${H.roman ? ROMAN[i] || i + 1 : i + 1}. ${h.title}`);
  const out = pre ? [pre] : [];
  H.heads.forEach((h, i) => {
    out.push(form[i]);
    const body = join([...f.to[i].from.map(id => (byId.get(id) || {}).text), f.to[i].write]);
    if (body) out.push(body);
  });
  return { plan: out.join('\n'), form };
}

/* ---------- 학급운영계획: 목차 칸 ---------- */
/* 목차 → 옛 칸(큰 제목 묶음 — 작은 칸은 그 묶음에 따라감). AI에는 묶음의 글과 작은 칸 「제목: 글」 */
export function classOlds(p) {
  const groups = [];
  let cur = null;
  for (const x of (p && p.outline) || []) {
    if (x.level === 1 || !cur) { cur = { id: 'o' + (groups.length + 1), title: x.title, head: x, kids: [] }; groups.push(cur); }
    else cur.kids.push(x);
  }
  const d = (p && p.draft) || {};
  return groups.map(g => ({ ...g, role: planRole(g.title), text: join([d[g.head.id], ...g.kids.map(k => (str(d[k.id]).trim() ? `${k.title}: ${d[k.id]}` : ''))]) }));
}
/* 바꾼 목차·칸 글: 새 큰 제목마다(옮겨 온 묶음이 하나면 그 칸 id 그대로) 묶음의 작은 칸이 그 아래로, 큰 제목 글은 옮겨 온 글 + 새로 쓴 글.
   지침 항목의 칸은 옮겨 간 칸으로, 칸 역할(시수·월별·평가 표)은 다시 정함 → { outline, draft, guide } */
export function applyClass(p, f, H, olds) {
  const byId = new Map(olds.map(o => [o.id, o])), d = (p && p.draft) || {};
  const outline = [], draft = {}, idMap = {};
  H.heads.forEach((h, i) => {
    const gs = f.to[i].from.map(id => byId.get(id)).filter(Boolean);
    const id = gs.length === 1 ? gs[0].head.id : newId();
    outline.push({ id, title: h.title, level: 1 });
    const own = join([...gs.map(g => d[g.head.id]), f.to[i].write]);
    if (own) draft[id] = own;
    for (const g of gs) {
      idMap[g.head.id] = id;
      for (const k of g.kids) { outline.push({ id: k.id, title: k.title, level: 2 }); if (typeof d[k.id] === 'string') draft[k.id] = d[k.id]; }
    }
  });
  const o = withRoles(outline);
  const guide = p && Array.isArray(p.guide) ? normGuide(p.guide.map(g => ({ ...g, section: idMap[g.section] || g.section })), o) : (p ? p.guide : null);
  return { outline: o, draft, guide };
}
