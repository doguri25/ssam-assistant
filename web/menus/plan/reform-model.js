/* 계획서 「새 서식으로 바꾸기」 (스펙 2026-11-15 1B, 방식 나 — 제목·본문 자리만 남기고 본문을 새로 채움). 화면 없음(Node 시험에서도 씀).
   새 서식(.hwpx) 글의 큰 제목(목차 읽기 1단계)에 지금 초안 칸(옛 칸)을 맞춤: 규칙 먼저(같은 제목 → 같은 역할 → 비슷한 제목),
   남은 것은 AI 답 { map: [{ to: 새 칸, from: [옛 칸 id] }], write: [{ to: 새 칸, text }] }(모르는 id는 버림). 옮길 곳 없는 옛 칸은 기본으로 가까운 칸에 붙여 두고 화면 [이 칸에 붙이기]에서 바꿈.
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
/* 새 서식 큰 제목의 빈칸 자리(「목적 :」「일시 : 2027.   .   .(   )」「추진 기간 : 2027년   월   일」)는 빼고 쌍점 앞만 제목으로 —
   쌍점 뒤가 빈칸·숫자·점·괄호뿐이고 숫자가 없거나 빈 자리(「.   .」「(   )」「년   월」)가 있을 때만. 채워 쓴 제목(「목적: 협동심 기르기」「일시: 2027. 10. 7.」「시간: 09:00~12:00」)·괄호 안 쌍점은 그대로 */
const SLOT_ONLY = /^[\s\d.,·:：~\-–/()（）년월일시분]*$/, BLANK_SLOT = /[.(（]\s*[.)）]|[년월시]\s+[월일분]/;
export function formTitle(t) {
  const s = str(t).trim(), m = /^(.*?[^\d\s:：])\s*[:：]\s*(.*)$/.exec(s);
  if (!m || /[(（[][^)）\]]*$/.test(m[1])) return s;
  const rest = m[2].trim();
  return SLOT_ONLY.test(rest) && (!/\d/.test(rest) || BLANK_SLOT.test(rest)) ? m[1].trim() : s;
}
/* 새 서식 글 → { heads: [{ title }], roman }. 큰 제목이 셋보다 적으면 heads는 빈 목록(양식으로만 저장) */
export function formHeads(text) {
  const top = parseOutline(text).filter(x => x.level === 1).slice(0, MAX_HEADS).map(x => ({ title: formTitle(x.title) }));
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
/* 여러 글을 한 가리개로 한꺼번에(여러 줄 명단·「이름」 머리 칸 표 규칙, 한 번 알아낸 이름은 모든 글에서) — 보내지 않을 줄만 뺌 */
function redactAll(r, texts) {
  const flat = [], of = [];
  texts.forEach((t, k) => str(t).split('\n').forEach(l => { flat.push(l); of.push(k); }));
  const out = texts.map(() => []);
  r.lines(flat).forEach((x, j) => { if (x) out[of[j]].push(x.text); });
  return out.map(ls => ls.join('\n'));
}
/* AI로 보낼 글: 새 칸 [n1]…(규칙이 맞춘 옛 칸 표시), 옛 칸 [o1]… 제목과 글. 이름·전화번호·이메일은 자리 표시(core/redact.js — 모든 칸을 한 가리개로), 주민번호·명단 줄은 보내지 않음
   → { prompt, back(돌아온 글에 원래 값을 되돌림) } */
export function reformPrompt({ kind, title, context = '', olds, heads, rules }) {
  const r = makeRedactor();
  const [rTitle, rCtx, ...rest] = redactAll(r, [title, context, ...heads.map(h => h.title), ...olds.map(o => o.title), ...olds.map(o => o.text)]);
  const hT = rest.slice(0, heads.length), oT = rest.slice(heads.length, heads.length + olds.length), oX = rest.slice(heads.length + olds.length);
  const ix = new Map(olds.map((o, i) => [o.id, i]));
  const R = (rules || []).map(x => x || []);
  const at = new Map();
  R.forEach((ids, i) => ids.forEach(id => at.set(id, i)));
  const left = olds.filter(o => !at.has(o.id)).map(o => o.id);
  const empty = heads.map((h, i) => i).filter(i => !(R[i] || []).length && !heads[i].fixed).map(i => 'n' + (i + 1));
  let budget = MAX_ALL;
  const clip = t => { const s = t.slice(0, Math.max(0, Math.min(MAX_SEC, budget))); budget -= s.length; return s + (s.length < t.length ? '\n…(뒷부분 줄임)' : ''); };
  const headLines = heads.map((h, i) => `[n${i + 1}] ${hT[i]}${(R[i] || []).length ? ` ← 옛 칸 ${R[i].map(id => `「${oT[ix.get(id)]}」`).join('·')}` : h.fixed ? ` ← ${h.fixed} 그대로` : ''}`);
  const oldLines = olds.map((o, i) => {
    const t = oX[i].trim();
    return `[${o.id}] ${oT[i]}${at.has(o.id) ? ` (n${at.get(o.id) + 1}로 옮김)` : ' (아직 갈 곳 없음)'}${t ? `\n"""\n${clip(t)}\n"""` : ' (글 없음)'}`;
  });
  const ctx = rCtx.trim();
  const prompt = `[새 서식 맞추기]\n학교 계획서(${kind})를 학교의 새 서식 차례로 옮기려고 해요. 지금 초안의 칸(옛 칸)을 새 서식의 큰 제목(새 칸)에 맞춰 주세요.\n`
    + `계획서: ${rTitle}\n${ctx ? ctx + '\n' : ''}\n`
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
/* 규칙 + AI 답 → { to: [{ title, from: [옛 칸 id](옛 차례), write(AI가 새로 쓴 글) }], orphans(옮길 곳 없는 옛 칸), attached({ 옛 칸: 붙인 새 칸 }), order(옛 차례) }.
   AI가 옮긴 옛 칸은 아직 갈 곳 없던 것만(한 곳에만), 새로 쓴 글은 옮겨 오는 칸이 없는 새 칸(표 칸 빼고)만.
   옮길 곳 없는 옛 칸은 글이 빠지지 않게 기본으로 붙여 둠(AI가 없거나 실패해도): 그 칸을 받는 표 칸(연간계획 일정·예산 — 표는 그대로 남음) →
   옛 차례에서 바로 앞에 있던 옛 칸이 옮겨 간 새 칸 → 바로 뒤 옛 칸이 옮겨 간 새 칸 → 마지막 새 칸(받을 수 있는 칸만).
   선생님이 「붙이지 않음」을 고르면 빠짐(attachOrphan) */
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
  const orphans = olds.filter(o => !used.has(o.id)).map(o => o.id), attached = {};
  const headOf = new Map();
  to.forEach((x, i) => x.from.forEach(id => headOf.set(id, i)));
  const fits = (i, o) => !accepts || accepts(heads[i], o);
  const tables = accepts ? [...heads.keys()].filter(j => heads[j].fixed) : [];
  for (const id of orphans) {
    const k = order.get(id), o = byId.get(id);
    const near = [...olds.slice(0, k).reverse(), ...olds.slice(k + 1)].map(x => headOf.get(x.id)).filter(i => i != null);
    const i = [...tables, ...near, ...[...heads.keys()].reverse()].find(j => fits(j, o));
    if (i != null) { to[i].from.push(id); attached[id] = i; }
  }
  for (const x of to) x.from.sort((p, q) => order.get(p) - order.get(q));
  return { to, orphans, attached, order: olds.map(o => o.id) };
}
/* 옮길 곳 없는 옛 칸을 새 칸(i, 0부터)에 붙임(옛 차례 자리에) — -1이면 붙이지 않음. 옮길 곳 없는 칸이 아니면 그대로 */
export function attachOrphan(f, id, i) {
  if (!f || !f.orphans.includes(id)) return f;
  const attached = { ...f.attached };
  const to = f.to.map(x => ({ ...x, from: x.from.filter(y => y !== id) }));
  if (i >= 0 && to[i]) {
    to[i].from.push(id); attached[id] = i;
    if (f.order) to[i].from.sort((p, q) => f.order.indexOf(p) - f.order.indexOf(q));
  } else delete attached[id];
  return { ...f, to, attached };
}

/* ---------- 연간계획: 목차 key·글 ---------- */
const won = n => Number(n || 0).toLocaleString('ko-KR');
const dayText = s => (s.date ? `${+s.date.slice(5, 7)}월 ${+s.date.slice(8, 10)}일` : s.month ? `${s.month}월` : '');
/* 초안 → 옛 칸(화면 차례: 목차, 없으면 기본 차례). 일정·예산 표는 줄 글로(글 칸에 붙이면 그 글). 역할은 새 칸과 같이 제목으로(sectionRole).
   목차 제목에 쌍점으로 함께 적힌 글(작년 계획서 「Ⅰ. 목적: 책을 즐겨 읽는 습관 기르기」)은 lead — 새 제목으로 바꿀 때 그 칸 글 첫 줄로(행사·학급운영계획과 같이).
   목차 제목은 작년 계획서의 큰 제목 줄이므로 쌍점 없이 제목 낱말 뒤에 이어진 말(「예산 확보」「내용 체계」「평가 회의」「일정 표」)은 제목의 일부 — 자르지 않음(words: false) */
export function yearOlds(d) {
  const order = d && d.outline && d.outline.length ? d.outline.map(o => [o.key, o.title]) : SECTIONS;
  return order.map(([key, full], i) => {
    const body = key === 'schedule' ? ((d && d.schedule) || []).map(s => [dayText(s), s.title].filter(Boolean).join(' ')).join('\n')
      : key === 'budget' ? ((d && d.budget) || []).map(b => `${b.name} ${won(b.amount)}원${b.note ? ` (${b.note})` : ''}`).join('\n')
      : str(d && d[key]);
    const { title, lead, cut } = headSplit(str(full).trim(), { words: false });
    return { id: 'o' + (i + 1), key, title: title || full, role: sectionRole(title || full), lead, cut: !!cut, body, text: lead ? join([lead, body]) : body };
  });
}
/* 새 서식 글 → 새 칸(연간계획 목차 읽기 그대로 key를 정함: 목적·방침·세부·일정·예산·평가, 그 밖은 덧붙임 칸). 일정·예산 칸은 표 그대로. 제목의 빈칸 자리는 뺌(formTitle).
   맞추기 역할은 제목 하나만 보고(sectionRole — 행사·학급운영계획과 같이): 목차 읽기가 앞 칸부터 차지한 key(「추진 배경」이 목적 칸)로 맞추지 않게,
   「추진 배경·추진 목표」처럼 목적 같은 제목이 둘이면 어느 쪽인지 몰라 역할로는 맞추지 않음 */
export function yearHeads(text) {
  const o = yearOutline(text);
  return {
    heads: o.items.map(x => { const title = formTitle(x.title); return { title, key: x.key, role: sectionRole(title), ...(x.key === 'schedule' ? { fixed: '일정 표' } : x.key === 'budget' ? { fixed: '예산 표' } : {}) }; }),
    roman: o.roman
  };
}
/* 일정·예산 표 칸에는 그 표만 */
export const yearAccepts = (h, o) => !(h.key === 'schedule' || h.key === 'budget') || o.key === h.key;
/* 바꾼 초안: 새 목차(fromForm — 「다시 만들기」도 이 차례), 글 칸은 옮겨 온 칸 글(제목 줄 글이 첫 줄) + 새로 쓴 글, 일정·예산 표는 그대로.
   일정·예산 표 칸으로 간 옛 칸의 제목 줄 글(「추진 일정: 학기별 2회」)은 표에 넣을 자리가 없으므로 가까운 글 칸에 「옛 제목: 글」로(앞 글 칸 끝, 없으면 뒤 글 칸 첫머리).
   표 머리 괄호 글(「소요 예산 (단위: 원)」)은 옮기지 않음 */
export function applyYear(d, f, H, olds) {
  const byId = new Map(olds.map(o => [o.id, o]));
  const v = { ...d, outline: H.heads.map(h => ({ key: h.key, title: h.title })), roman: H.roman, fromForm: true };
  for (const k of Object.keys(v)) if (isExtra(k)) delete v[k];
  for (const k of TEXT_SECTIONS) v[k] = '';
  const table = h => h.key === 'schedule' || h.key === 'budget';
  const first = H.heads.map(() => []), last = H.heads.map(() => []);
  H.heads.forEach((h, i) => {
    if (!table(h)) return;
    const lines = f.to[i].from.map(id => byId.get(id)).filter(o => o && o.cut && leadLine(o, h)).map(o => `${o.title}: ${o.lead}`);
    if (!lines.length) return;
    let j = i - 1;
    while (j >= 0 && table(H.heads[j])) j--;
    if (j >= 0) last[j].push(...lines);
    else { j = H.heads.findIndex((x, k) => k > i && !table(x)); if (j >= 0) first[j].push(...lines); }
  });
  H.heads.forEach((h, i) => {
    if (table(h)) return;
    v[h.key] = join([...first[i], ...f.to[i].from.map(id => byId.get(id)).filter(Boolean).map(o => oldText(o, h)), f.to[i].write, ...last[i]]);
  });
  return normDraft(v);
}
/* [되돌리기]: 바꾸기 전 목차·글 칸으로. 일정·예산 표는 바꾸기가 건드리지 않으므로 지금 그대로(바꾼 뒤 5단계에서 고친 날짜·4단계 예산이 남게) */
export const yearRestore = (now, snap) => (now ? { ...snap, schedule: now.schedule, budget: now.budget } : snap);

/* ---------- 제목 줄에 함께 적힌 글 ---------- */
/* 큰 제목 → { title(맞출 제목), lead(제목 줄에 함께 적힌 글 — 새 제목으로 바뀌어도 그 칸 글 첫 줄로 남김), cut(쌍점·제목 낱말 뒤에서 자름) }.
   쌍점(:·：) 앞이 제목, 뒤가 글(「목적: 협동심과 체력 증진」, 시각 「09:00」의 쌍점은 아님). 괄호 안 쌍점이면 그 줄 글 전체를 글 첫 줄로도 남김.
   long: 쌍점이 없어도 짧은 제목보다 긴 줄(숫자가 있거나 20자 넘음)은 그 줄 글 전체를 글 첫 줄로도 남김(「일시 2027. 10. 7.(목)」).
   그 밖에 쌍점 없이 계획서 제목 낱말 뒤에 적힌 글(「목적 협동심과 체력 증진」「장소 본교 운동장」)은 그 낱말 뒤에서 자름 —
   뒤가 제목을 잇는 말(「평가 및 환류」「평가 (교사용)」「평가 계획」「대상 학년 및 인원」: 및·과·괄호·가운뎃점으로 시작하거나 첫·끝 낱말이 제목 낱말)이면 제목 그대로.
   뒤가 제목을 마무리하는 한 낱말(「근거 법령」「담당 교사」「예산 집행」)이면 그 낱말도 제목의 일부라 글로 옮기지 않음(맞추기는 전처럼 제목 낱말로).
   words: false(연간계획 목차 제목)면 제목 낱말 뒤에서 자르지 않음 — 쌍점 뒤만 글 */
const COLON = /^(.*?[^\d\s:：])\s*[:：]\s*(.*)$/;
// 제목 낱말: 연간계획 역할 표(목적·방침·일정·예산·평가)·행사 개요 표(일시·대상·장소)·가정통신문 항목(준비물·복장·문의)에서
const HEAD_WORD = /^(목적|목표|필요성|취지|배경|일시|날짜|기간|장소|대상|방침|방향|내용|방법|예산|경비|준비물|복장|담당|근거|일정|평가|기대\s*효과|유의\s*사항|문의처?|연락처)\s+(\S.*)$/;
const TITLE_WORD = new RegExp('^(?:목적|목표|필요성|취지|배경|일시|날짜|기간|장소|대상|방침|방향|내용|방법|예산|경비|재원|사업비|준비물|복장|담당|근거|일정|시기|월별|평가|환류|효과|성과|'
  + '세부|추진|운영|실천|활동|계획|관련|현황|개요|실태|분석|시수|배당|사항|내역|결과|대책|관리|요약|목록|업무|부서|지표|기준|절차|범위|구성|조직|선정|설정|중점|과제|안내|협조|홍보|반성|수립|점검|방안|인원|도구|영역)(?:표|안|서|자)?$');
const titleTail = rest => {
  const w = rest.split(/\s+/);
  return /^(?:(?:및|과|와|또는|그리고)(?:\s|$)|[(（[〔<〈《·ㆍ,、/&+])/.test(rest) || [w[0], w[w.length - 1]].some(x => TITLE_WORD.test(norm(x)));
};
// 제목 낱말 뒤 한 낱말로 제목을 마무리하는 말(「근거 법령」「담당 교사」「예산 집행」「평가 관점」「목표 달성도」「대상 학년」) — 한 낱말 글(「대상 전교생」「장소 강당」)·여러 낱말 글(「담당 체육부 교사」)은 아님
const TAIL_ONE = /^(?:법령|법규|규정|지침|자료|교사|교원|인력|집행|편성|배정|관점|척도|요소|문항|달성도|배치도|섭외|결정|조정|변경|학년|학급|학생)$/;
function headSplit(t, { long = false, words = true } = {}) {
  const m = COLON.exec(t);
  if (m && !/[(（[][^)）\]]*$/.test(m[1])) return { title: m[1].trim(), lead: m[2].trim(), cut: true };
  // 괄호 안 쌍점(「개요 (장소: 강당)」)은 자르지 않고 그 줄 글 전체를 남김
  if (m || (long && (/\d/.test(t) || t.replace(/\s/g, '').length > 20))) return { title: t, lead: t };
  const w = HEAD_WORD.exec(t);
  if (w && TAIL_ONE.test(norm(w[2]))) return { title: w[1], lead: '' };
  return w && words && !titleTail(w[2]) ? { title: w[1], lead: w[2].trim(), cut: true } : { title: t, lead: '' };
}
/* 새 제목(h) 아래 넣을 제목 줄 글: 새 제목이 그 글이나 옛 제목 줄 전체와 같으면 없음(같은 줄을 글로 다시 쓰지 않게), 자른 글이 비슷하지 않은 제목 칸으로 가면 「옛 제목: 글」(「일시: …」가 「운영 개요」 아래로) */
const leadLine = (o, h) => (!o.lead || norm(o.lead) === norm(h.title) || norm(o.title + o.lead) === norm(h.title) ? '' : o.cut && similar(o.title, h.title) < SIMILAR ? `${o.title}: ${o.lead}` : o.lead);
const oldText = (o, h) => (o.lead ? join([leadLine(o, h), o.body]) : o.text);

/* ---------- 행사계획: 계획서 글 ---------- */
const NUM_HEAD = new RegExp(`^\\s*(?:[${ROMAN}]|\\d{1,2})\\.\\s*`);
/* 계획서 글 → { pre(첫 큰 제목 앞 글), olds(큰 제목마다 칸: 제목 줄에 함께 적힌 글(lead) + 제목 줄 다음부터 다음 큰 제목 앞까지(body)) }. 큰 제목이 없으면 글 전체가 한 칸.
   학교 새 서식으로 바꾼 계획서의 서식 제목 줄(docs.form)은 제목만 */
export function eventOlds(e) {
  const text = str(e && e.docs && e.docs.plan), lines = text.split('\n'), at = planHeadLines(e, text);
  if (!at.length) return { pre: '', olds: text.trim() ? [{ id: 'o1', title: '세부 계획', role: 'details', text: tidy(text) }] : [] };
  const formed = new Set(((e && e.docs && e.docs.form) || []).map(norm));
  const olds = at.map((ln, i) => {
    const t = lines[ln].trim().replace(NUM_HEAD, '') || lines[ln].trim();
    const { title, lead, cut } = formed.has(norm(lines[ln])) ? { title: t, lead: '' } : headSplit(t, { long: true });
    const body = tidy(lines.slice(ln + 1, at[i + 1] == null ? lines.length : at[i + 1]).join('\n'));
    return { id: 'o' + (i + 1), title: title || t, role: planRole(title || t), lead, cut: !!cut, body, text: join([lead, body]) };
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
    const body = join([...f.to[i].from.map(id => byId.get(id)).filter(Boolean).map(o => oldText(o, h)), f.to[i].write]);
    if (body) out.push(body);
  });
  return { plan: out.join('\n'), form };
}
/* [되돌리기]로 돌릴 것: 계획서 글·서식 제목 줄·계획서 검토 의견만. 안전 점검표·가정통신문 칸과 그 의견은 바꾸기와 상관없으므로 되돌릴 때 지금 그대로
   (바꾼 뒤 손으로 고쳐 지운 가정통신문 의견이 되살아나 [이대로 고치기]로 고친 글을 덮지 않게) */
export const eventSnap = e => ({ plan: str(e.docs.plan), form: [...(e.docs.form || [])], rv: (e.rv || []).filter(x => x.section === 'plan') });
export const eventRestore = (e, s) => ({ docs: { ...e.docs, plan: s.plan, form: s.form }, rv: [...s.rv, ...(e.rv || []).filter(x => x.section !== 'plan')] });

/* ---------- 학급운영계획: 목차 칸 ---------- */
/* 목차 → 옛 칸(큰 제목 묶음 — 작은 칸은 그 묶음에 따라감). AI에는 묶음의 글과 작은 칸 「제목: 글」.
   큰 제목에 쌍점으로·제목 낱말 뒤에 함께 적힌 글(「급훈: 서로 돕는 반」「목표 서로 돕는 반」)은 lead — 새 제목으로 바꿀 때 그 칸 글 첫 줄로 */
export function classOlds(p) {
  const groups = [];
  let cur = null;
  for (const x of (p && p.outline) || []) {
    if (x.level === 1 || !cur) { cur = { id: 'o' + (groups.length + 1), title: x.title, head: x, kids: [] }; groups.push(cur); }
    else cur.kids.push(x);
  }
  const d = (p && p.draft) || {};
  return groups.map(g => {
    const { title, lead, cut } = headSplit(str(g.title).trim());
    return { ...g, title: title || g.title, role: planRole(title || g.title), lead, cut: !!cut, text: join([lead, d[g.head.id], ...g.kids.map(k => (str(d[k.id]).trim() ? `${k.title}: ${d[k.id]}` : ''))]) };
  });
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
    const own = join([...gs.map(g => join([leadLine(g, h), d[g.head.id]])), f.to[i].write]);
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
