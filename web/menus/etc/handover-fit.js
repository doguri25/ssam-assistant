/* 업무 인수인계서 「몇 쪽으로」 (2026-11-10): 문서({ title, blocks }, 조각마다 part — handover-model.js buildHandover)를
   정한 쪽 수에 들어가게 줄임. 화면 없이 돌아감(시험).
   쪽 수는 줄 수로 어림: A4·10pt(한글 문서 160%·여백 20mm, 워드·PDF도 비슷하게) 한 쪽 PAGE_LINES줄, 한 줄 LINE_CHARS자
   (한글 1, 영문·숫자·빈칸·문장 부호 0.55). 표는 한글 문서처럼 칸 너비를 똑같이 나눠 칸마다 줄을 셈(칸 안쪽 여백 CELL_PAD자).
   넘치면 덜 아까운 것부터 줄이고, 들어가면 그만둠:
   ① 「(없음)」인 항목(월별 할 일·행사·공문)과 빈 「다음 담당자에게」 빼기 ② 일 없는 달끼리 합치기(「5~7월」)
   ③ 긴 표(CAP_ROWS줄 넘게)를 CAP_ROWS줄까지: 줄이 가장 많은 표부터 — 품의는 오래된 것부터 「외 n건 합계」 한 줄(금액 칸에 뺀 품의 합,
      맨 아래 합계는 그대로), 공문은 끝낸 것·기한이 이른 것부터 「외 n건」, 결과 보고·행사(고칠 점 없는 것 먼저)도 「외 n건」
   ④ 긴 메모(행사 「내년에 고칠 점」·공문 할 일·결과 보고 주요 내용)를 한 줄로 ⑤ 표를 더(다 빼면 표 대신 한 줄: 「품의 40건 · 합계 820,000원」)
   ⑥ 일 없는 달 줄 빼기 ⑦ 할 일이 많은 달은 마지막 할 일 끝에 「외 n건」 ⑧ 업무 목표를 한 줄로.
   「1. 맡은 업무 한눈에」의 업무 줄과 예산 합계(합계 줄, 다 뺐으면 「품의 n건 · 합계 ○원」)는 늘 남김. 다 줄여도 넘치면 over */
export const PAGES = [1, 2, 3, 4, 5];
/* 쪽 수: 1~5, 그 밖(0·빈 값·망가진 값)은 제한 없음 0 */
export const normPages = v => (PAGES.includes(Number(v)) && Number.isInteger(Number(v)) ? Number(v) : 0);

export const PAGE_LINES = 38, LINE_CHARS = 44;
const TITLE_LINES = 2.5, HEAD_LINES = 1.7, ROW_PAD = 0.25, TABLE_GAP = 0.5, CELL_PAD = 1, EPS = 1e-9;
// 「긴 표」: 줄이 이보다 많은 표를 먼저 이만큼까지 줄이고(메모보다 먼저), 그래도 넘치면 메모를 줄인 뒤 더 줄임
export const CAP_ROWS = 5;

const won = n => Number(n || 0).toLocaleString('ko-KR');
const width = s => [...String(s)].reduce((w, ch) => w + (ch.codePointAt(0) < 0x2000 ? 0.55 : 1), 0);
/* 글 → 줄 수(줄바꿈마다 한 줄 이상) */
export const textLines = (text, per = LINE_CHARS) => String(text == null ? '' : text).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(width(l) / per - EPS)), 0);
/* 칸 수 → 칸 한 줄 글자 수 */
export const colChars = cols => Math.max(4, Math.floor(LINE_CHARS / Math.max(1, cols)) - CELL_PAD);
const rowLines = (r, per) => Math.max(1, ...r.map(c => textLines(c, per))) + ROW_PAD;

export function blockLines(b) {
  if (!b) return 0;
  if (b.type === 'table') {
    const rows = (b.rows || []).filter(Array.isArray);
    if (!rows.length) return 0;
    const per = colChars(Math.max(...rows.map(r => r.length)));
    return rows.reduce((n, r) => n + rowLines(r, per), 0) + TABLE_GAP;
  }
  if (b.type === 'h') return HEAD_LINES * String(b.text == null ? '' : b.text).split('\n').length;
  if (b.type === 'break') return 0;
  return textLines(b.text);
}
export const docLines = doc => TITLE_LINES + ((doc && doc.blocks) || []).reduce((n, b) => n + blockLines(b), 0);
export const estPages = doc => Math.max(1, Math.ceil(docLines(doc) / PAGE_LINES - EPS));

/* 긴 칸 → 한 줄(줄 머리 「- 」는 떼고 「 · 」로 잇고, 넘치면 「…」) */
export function oneLine(text, per) {
  const flat = String(text == null ? '' : text).split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean).join(' · ');
  if (width(flat) <= per + EPS) return flat;
  let out = '', w = 0;
  for (const ch of flat) { const cw = width(ch); if (w + cw > per - 1 + EPS) break; out += ch; w += cw; }
  return `${out.trimEnd()}…`;
}

/* ---------- 줄일 곳 ---------- */
const NAME = { budget: '품의', docs: '공문', events: '행사', reports: '결과 보고' };
const CUT_KEY = { budget: 'purchases', docs: 'docs', events: 'events', reports: 'reports' };
const DROP_ORDER = ['budget', 'docs', 'reports', 'events'];
const MEMO_CELLS = [['events', 3], ['docs', 2], ['reports', 2]];
const amountOf = c => Number(String(c == null ? '' : c).replace(/[^\d-]/g, '')) || 0;
/* 다음에 뺄 줄 */
const PICK = {
  budget: () => 0, // 작성일 차례라 맨 앞이 가장 오래된 것
  docs: t => { const i = t.detail.findIndex(r => r[3] === '완료'); return i >= 0 ? i : 0; }, // 끝낸 것, 그다음 기한이 이른 것
  reports: t => t.detail.length - 1,
  events: t => { for (let i = t.detail.length - 1; i >= 0; i--) if (!String(t.detail[i][3] || '').trim()) return i; return t.detail.length - 1; }
};

/* 문서 사본 + part별 표 상태 { block, head, detail(남긴 줄), dropped(뺀 줄), tail(품의 합계 줄), label(결과 보고 앞 줄), months(월별) }.
   drop이 붙은 조각은 문서에서 뺌(되돌릴 수 있게 사본에는 남김) */
function work(doc) {
  const blocks = (doc.blocks || []).map(b => (b && Array.isArray(b.rows) ? { ...b, rows: b.rows.map(r => (Array.isArray(r) ? [...r] : r)) } : { ...b }));
  const tables = {};
  blocks.forEach((b, i) => {
    if (b.type !== 'table' || !b.part || tables[b.part] || !(b.rows || []).length) return;
    const t = { block: b, head: b.rows[0], detail: b.rows.slice(1), dropped: [], tail: [], label: null };
    if (b.part === 'budget' && t.detail.length && t.detail[t.detail.length - 1][0] === '합계') t.tail = [t.detail.pop()];
    if (b.part === 'months') t.months = t.detail.map(r => ({ label: String(r[0] || ''), items: String(r[1] || '') ? String(r[1]).split('\n') : [], more: 0 }));
    const prev = blocks[i - 1];
    if (prev && prev.type === 'p' && prev.part === b.part) t.label = prev;
    tables[b.part] = t;
  });
  return { blocks, tables };
}
/* 다 뺀 표는 한 줄 글로: 「품의 40건 · 합계 820,000원」「공문 15건(완료 8건)」「행사 8건」「결과 보고 4건」(결과 보고 앞 줄은 뺌) */
function collapsed(part, t) {
  const n = t.dropped.length;
  if (part === 'budget') return t.tail.length ? `${NAME.budget} ${n}건 · 합계 ${t.tail[0][2]}원` : `${NAME.budget} ${n}건`;
  if (part === 'docs') { const d = t.dropped.filter(r => r[3] === '완료').length; return `${NAME.docs} ${n}건(${d === n ? '모두 완료' : d ? `완료 ${d}건` : '모두 진행 중'})`; }
  return `${NAME[part]} ${n}건`;
}
function sync(part, t) {
  // 월별: 뺀 할 일은 마지막 할 일 끝에 「외 n건」(「21일 과학의 날 외 2건」)
  if (part === 'months') { t.block.rows = [t.head, ...t.months.map(m => [m.label, m.items.join('\n') + (m.more ? ` 외 ${m.more}건` : '')])]; return; }
  if (!t.detail.length && t.dropped.length) {
    Object.assign(t.block, { type: 'p', text: collapsed(part, t) }); delete t.block.rows;
    if (t.label) t.label.drop = true;
    return;
  }
  t.block.type = 'table'; delete t.block.text;
  if (t.label) t.label.drop = false;
  const rows = [...t.detail];
  if (t.dropped.length) {
    if (part === 'budget') rows.push([`외 ${t.dropped.length}건 합계`, '', won(t.dropped.reduce((s, r) => s + amountOf(r[2]), 0)), '']);
    else {
      const row = Array(t.head.length).fill('');
      row[0] = `외 ${t.dropped.length}건`;
      if (part === 'docs') { const n = t.dropped.length, d = t.dropped.filter(r => r[3] === '완료').length; row[3] = d === n ? '완료' : d ? `완료 ${d}건` : '진행 중'; }
      rows.push(row);
    }
  }
  t.block.rows = [t.head, ...rows, ...t.tail];
}
/* 일 없는 달이 이어지면 한 줄로: 두 달은 「5·6월」, 셋 이상은 「5~7월」 */
export function mergeEmptyMonths(ms) {
  const out = [], empty = m => !m.items.length && !m.more;
  for (let i = 0; i < ms.length;) {
    if (!empty(ms[i])) { out.push(ms[i]); i++; continue; }
    let j = i;
    while (j + 1 < ms.length && empty(ms[j + 1])) j++;
    const a = ms[i].label.replace(/월$/, ''), b = ms[j].label.replace(/월$/, '');
    out.push(j === i ? ms[i] : { label: j === i + 1 ? `${a}·${b}월` : `${a}~${b}월`, items: [], more: 0 });
    i = j + 1;
  }
  return out;
}
const renumber = blocks => { let k = 0; for (const b of blocks) if (b.type === 'h' && /^\d+\.\s/.test(b.text)) b.text = b.text.replace(/^\d+\./, `${++k}.`); };

/* 문서 → { doc(줄인 사본, 들어가면 그대로), cut: { pages, before·after(어림 쪽 수), empty(뺀 빈 항목), months(합치거나 뺀 달 줄), memos(한 줄로 줄인 메모),
   purchases·docs·events·reports(「외 n건」으로 줄인 건수), monthItems(「외 n건」으로 줄인 월별 할 일), goals(한 줄로 줄인 업무 목표), over(다 줄여도 넘침) } }.
   pages 0(제한 없음)이면 그대로 */
export function fitPages(doc, pages) {
  const n = normPages(pages), before = doc ? estPages(doc) : 1;
  const cut = { pages: n, before, after: before, empty: 0, months: 0, memos: 0, purchases: 0, docs: 0, events: 0, reports: 0, monthItems: 0, goals: 0, over: false };
  if (!doc || !n) return { doc, cut };
  const limit = n * PAGE_LINES;
  if (docLines(doc) <= limit + EPS) return { doc, cut };
  const w = work(doc), T = w.tables;
  const out = () => ({ ...doc, blocks: w.blocks.filter(b => !b.drop) });
  const lines = () => docLines(out());
  const fits = () => lines() <= limit + EPS;
  const shortened = []; // 한 줄로 줄인 칸 { part, r } — 나중에 그 줄을 「외 n건」으로 뺐으면 세지 않음
  const done = () => {
    cut.memos = shortened.filter(x => x.part !== 'duties' && T[x.part].detail.includes(x.r)).length;
    cut.goals = shortened.filter(x => x.part === 'duties').length;
    renumber(w.blocks);
    const d = out();
    cut.after = estPages(d); cut.over = docLines(d) > limit + EPS;
    return { doc: d, cut };
  };
  /* 칸(rows 안의 r[ci])을 한 줄로 줄여 그 줄이 낮아지는 것 중 가장 많이 낮아지는 것 하나 */
  const shortenBest = cells => {
    let best = null;
    for (const [part, ci] of cells) {
      const t = T[part];
      if (!t) continue;
      const per = colChars(t.head.length);
      for (const r of t.detail) {
        if (textLines(r[ci], per) <= 1) continue;
        const short = oneLine(r[ci], per), gain = rowLines(r, per) - rowLines(r.map((c, k) => (k === ci ? short : c)), per);
        if (gain > EPS && (!best || gain > best.gain)) best = { part, t, r, ci, short, gain };
      }
    }
    if (best) { best.r[best.ci] = best.short; sync(best.part, best.t); shortened.push({ part: best.part, r: best.r }); }
    return !!best;
  };

  // ① 「(없음)」인 항목·빈 「다음 담당자에게」 (맡은 업무·예산은 남김)
  for (const part of ['months', 'events', 'docs', 'note']) {
    const i = w.blocks.findIndex(b => b.type === 'h' && b.part === part), c = w.blocks[i + 1];
    if (i < 0 || !c || c.part !== part || c.type === 'table') continue;
    if (part === 'note' ? String(c.text || '').trim() : c.text !== '(없음)') continue;
    w.blocks.splice(i, 2); cut.empty++;
  }
  if (fits()) return done();
  // ② 일 없는 달 합치기
  if (T.months) {
    const k = T.months.months.length;
    T.months.months = mergeEmptyMonths(T.months.months);
    cut.months = k - T.months.months.length;
    sync('months', T.months);
    if (fits()) return done();
  }
  /* 긴 표 줄이기: 남은 줄이 floor보다 많은 표 중 가장 많은 표에서, 문서가 한 줄이라도 줄 때까지 뺌(floor까지). 다 빼도 줄지 않는 표는 되돌리고 건너뜀 */
  const capTables = floor => {
    for (const skip = new Set(); ;) {
      let t = null, part = '';
      for (const p of DROP_ORDER) if (T[p] && T[p].detail.length > floor && !skip.has(p) && (!t || T[p].detail.length > t.detail.length)) { t = T[p]; part = p; }
      if (!t) return false;
      const base = lines(), was = { detail: [...t.detail], dropped: [...t.dropped], n: cut[CUT_KEY[part]] };
      while (t.detail.length > floor) {
        t.dropped.push(t.detail.splice(PICK[part](t), 1)[0]);
        cut[CUT_KEY[part]]++;
        sync(part, t);
        if (lines() < base - EPS) break;
      }
      if (lines() >= base - EPS) { t.detail = was.detail; t.dropped = was.dropped; cut[CUT_KEY[part]] = was.n; sync(part, t); skip.add(part); continue; }
      if (fits()) return true;
    }
  };
  // ③ 긴 표(CAP_ROWS줄 넘는 표)를 CAP_ROWS줄까지
  if (capTables(CAP_ROWS)) return done();
  // ④ 긴 메모를 한 줄로 (줄이 가장 많이 줄어드는 것부터)
  while (shortenBest(MEMO_CELLS)) if (fits()) return done();
  // ⑤ 표를 더 줄임(남은 줄이 가장 많은 표부터, 다 빼면 표 대신 「품의 n건 · 합계 ○원」「공문 n건(완료 m건)」 한 줄)
  if (capTables(0)) return done();
  // ⑥ 그래도 넘치면 일 없는 달 줄은 뺌
  if (T.months && T.months.months.some(m => m.items.length || m.more)) {
    const k = T.months.months.length;
    T.months.months = T.months.months.filter(m => m.items.length || m.more);
    cut.months += k - T.months.months.length;
    sync('months', T.months);
    if (fits()) return done();
  }
  // ⑦ 할 일이 많은 달: 가장 많은 달에서 그 줄이 낮아질 때까지 「외 n건」으로 (한 건은 남김, 줄지 않으면 되돌리고 건너뜀)
  for (const mt = T.months, skip = new Set(); mt;) {
    let m = null;
    for (const x of mt.months) if (x.items.length > 1 && !skip.has(x) && (!m || x.items.length > m.items.length)) m = x;
    if (!m) break;
    const base = lines(), was = { items: [...m.items], more: m.more, n: cut.monthItems };
    while (m.items.length > 1) { m.items.pop(); m.more++; cut.monthItems++; sync('months', mt); if (lines() < base - EPS) break; }
    if (lines() >= base - EPS) { m.items = was.items; m.more = was.more; cut.monthItems = was.n; sync('months', mt); skip.add(m); continue; }
    if (fits()) return done();
  }
  // ⑧ 업무 목표를 한 줄로 (업무 줄은 그대로)
  while (shortenBest([['duties', 1]])) if (fits()) return done();
  return done();
}

/* 줄인 것 → 알림 글 (해요체, 짧게) */
const josa = (w, a, b) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 ? a : b; };
export function fitNotice(cut) {
  if (!cut) return '';
  if (!cut.pages) return `쪽 수 제한 없이 만들어요(지금 약 ${cut.before}쪽).`;
  if (cut.over) return `${cut.pages}쪽에 다 넣지 못했어요(줄여도 약 ${cut.after}쪽). 넣을 것을 더 빼 주세요.`;
  const parts = [['purchases', '품의', '건'], ['docs', '공문', '건'], ['events', '행사', '건'], ['reports', '결과 보고', '건'], ['monthItems', '월별 할 일', '건'],
    ['memos', '긴 메모', '개'], ['goals', '업무 목표', '개']].filter(([k]) => cut[k] > 0).map(([k, l, u]) => `${l} ${cut[k]}${u}`);
  if (parts.length) { const s = parts.join('·'); return `${cut.pages}쪽에 맞추느라 ${s}${josa(s, '을', '를')} 줄였어요.`; }
  if (cut.empty || cut.months) return `${cut.pages}쪽에 맞추느라 ${cut.empty && cut.months ? '없는 항목은 빼고 일 없는 달은 줄였어요' : cut.empty ? '없는 항목은 뺐어요' : '일 없는 달은 줄였어요'}.`;
  return `${cut.pages}쪽 안에 들어가요(약 ${cut.after}쪽).`;
}
