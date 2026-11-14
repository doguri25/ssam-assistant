/* 평가 › 기재 점검 화면 자료 (스펙 2026-11-14-eval-redesign §7). 화면 없이 돌아감(시험).
   buildView: 모은 글(check.js의 { ref, src, label, text, who, group, limit }) + 점검 결과(check-rules checkItems) + 그대로 둔 곳(열쇠 모음)
     → 위 숫자 타일의 수(그대로 둔 곳은 세지 않음), 종류별로 묶은 카드(쓰면 안 되는 말·같은 문장·이름·주어·글자 수·부정 표현 차례).
     같은 문장은 문장마다 한 카드(쓴 학생 번호), 그 밖은 글·종류마다 한 카드(걸린 곳이 든 문장만 보임).
   issueKey: 「그대로 두기」 열쇠 — 글(ref)·종류·그 문장·그 낱말. 그 문장이 바뀌면 다시 보임.
   missingWriters: 나이스에 넣기 전 — 학생 글 묶음(행특·창체 영역·평가지 채점 기록·단원평가 교과)마다 글이 없는 번호 */
import { splitSentences, sentenceKey, KIND_NAME, WHY_SHORT } from './check-rules.js';

export const TILE_KINDS = ['ban', 'dup', 'name', 'len', 'neg'];
export const TILE_NAME = { ban: '쓰면 안 되는 말', dup: '같은 문장', name: '이름·주어', len: '글자 수', neg: '부정 표현' };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
export const circ = n => CIRC[n] || `(${n + 1})`;
const SEP = '\u001f';

/* 카드 오른쪽 위에 쓰는 짧은 까닭 */
export function shortWhy(i) {
  if (!i) return '';
  if (i.kind === 'dup') return '같은 문장';
  if (i.kind === 'len') return '글자 수';
  return WHY_SHORT[i.why] || TILE_NAME[i.kind] || KIND_NAME[i.kind] || '';
}

const sentenceAt = (sents, pos) => sents.find(s => pos >= s.start && pos < s.end) || sents.find(s => pos < s.end) || null;
/* 「그대로 두기」 열쇠: ref · 종류 · 걸린 곳이 든 문장 · 걸린 낱말 (빈칸 빼고) */
export function issueKey(ref, text, issue, sents = splitSentences(text)) {
  const s = sentenceAt(sents, issue.start);
  return [ref, issue.kind, s ? sentenceKey(s.t) : '', sentenceKey(issue.word)].join(SEP);
}
export const keyRef = key => String(key || '').split(SEP)[0];

/* 걸린 곳이 든 문장만 보여 줄 자리: { from, to, nos(1부터), total, pre(앞에 글이 더 있음), post } */
export function excerpt(text, issues, sents = splitSentences(text)) {
  const t = String(text == null ? '' : text), list = Array.isArray(issues) ? issues : [];
  const idx = [];
  sents.forEach((s, n) => { if (list.some(i => i.start < s.end && i.end > s.start)) idx.push(n); });
  if (!sents.length || !idx.length) return { from: 0, to: t.length, nos: [], total: sents.length, pre: false, post: false };
  let from = sents[idx[0]].start, to = sents[idx[idx.length - 1]].end;
  for (const i of list) { from = Math.min(from, i.start); to = Math.max(to, i.end); }
  return { from, to, nos: idx.map(n => n + 1), total: sents.length, pre: !!t.slice(0, from).trim(), post: !!t.slice(to).trim() };
}
/* 「n번째 문장」(문장이 하나면 '') */
export function sentLabel(nos, total) {
  if (!Array.isArray(nos) || !nos.length || total <= 1) return '';
  const run = nos.length > 2 && nos.every((n, i) => !i || n === nos[i - 1] + 1);
  return `${run ? `${nos[0]}~${nos[nos.length - 1]}` : nos.join('·')}번째 문장`;
}

/* 글(from~to 자리만) + 표시: 고칠 곳은 <mark>(노란 바탕·밑줄) 뒤에 번호 기호(①), 화면 읽기에는 「고칠 곳 n」 — 색만이 아님 */
export function markHTML(text, issues, { from = 0, to = null } = {}) {
  const t = String(text == null ? '' : text), list = Array.isArray(issues) ? issues : [];
  const a0 = Math.max(0, from), b0 = Math.min(t.length, to == null ? t.length : to);
  const pts = new Set([a0, b0]);
  list.forEach(i => { if (i.start > a0 && i.start < b0) pts.add(i.start); if (i.end > a0 && i.end < b0) pts.add(i.end); });
  const xs = [...pts].sort((a, b) => a - b);
  let html = '';
  for (let k = 0; k < xs.length - 1; k++) {
    const a = xs[k], b = xs[k + 1], seg = esc(t.slice(a, b));
    html += list.some(i => i.start <= a && i.end >= b) ? `<mark class="chk-hit">${seg}</mark>` : seg;
    list.forEach((i, n) => { if (i.end === b) html += `<sup class="chk-n"><span aria-hidden="true">${circ(n)}</span><span class="sr-only">(고칠 곳 ${n + 1})</span></sup>`; });
  }
  return html;
}

/* 「창의적 체험활동 · 자율·자치활동 · 1번 · 1인 1역」 → 「창의적 체험활동 · 자율·자치활동」(번호 앞까지) */
export function labelBase(label) {
  const parts = String(label || '').split(' · ');
  const i = parts.findIndex(p => /^\d+번$/.test(p) || p === '번호 없음');
  return (i > 0 ? parts.slice(0, i) : parts).join(' · ');
}

/* 화면 자료. keep: 그대로 둔 열쇠 Set, src: 화면 거르기('' 모두), kind: 종류 거르기('' 모두) */
export function buildView({ items = [], res = null, keep = new Set(), src = '', kind = '' } = {}) {
  const shown = (Array.isArray(items) ? items : []).filter(x => x && (!src || x.src === src));
  const byRef = new Map(((res && res.list) || []).map(r => [r.id, r.issues || []]));
  const counts = { '': 0 };
  TILE_KINDS.forEach(k => { counts[k] = 0; });
  let kept = 0;
  const live = new Map(); // ref → 그대로 두지 않은 곳(열쇠 붙임)
  for (const x of shown) {
    const sents = splitSentences(x.text);
    const all = (byRef.get(x.ref) || []).map(i => ({ ...i, key: issueKey(x.ref, x.text, i, sents) }));
    const open = all.filter(i => !keep.has(i.key));
    kept += all.length - open.length;
    for (const i of open) { counts[i.kind] = (counts[i.kind] || 0) + 1; counts['']++; }
    live.set(x.ref, { x, sents, open });
  }
  const groups = [];
  for (const k of TILE_KINDS) {
    if (kind && kind !== k) continue;
    const cards = [];
    if (k === 'dup') {
      for (const g of (res && res.groups) || []) {
        const refs = [];
        for (const r of g.refs) {
          const l = live.get(r.id), i = l && l.open.find(o => o.kind === 'dup' && o.start === r.start && o.end === r.end);
          if (i) refs.push({ ref: r.id, who: r.who, start: r.start, end: r.end, key: i.key });
        }
        if (!refs.length) continue;
        const first = live.get(refs[0].ref).x;
        cards.push({ kind: 'dup', id: `dup${SEP}${g.key}${SEP}${g.refs[0].id}`, text: g.text, base: labelBase(first.label), refs, whos: g.whos });
      }
    } else {
      for (const { x, sents, open } of live.values()) {
        const issues = open.filter(i => i.kind === k);
        if (issues.length) cards.push({ kind: k, id: `${k}:${x.ref}`, ref: x.ref, issues, ...excerpt(x.text, issues, sents) });
      }
    }
    if (cards.length) groups.push({ kind: k, n: counts[k], cards });
  }
  return { shown, texts: shown.length, counts, kept, groups, live };
}

/* 학생 글 묶음마다 글이 없는 번호. nos: 학급 명단 번호 Set(없으면 글이 있는 학생 모두) → { total, gaps: [{ base, missing }] } */
export function missingWriters(items, nos) {
  const by = new Map();
  for (const x of Array.isArray(items) ? items : []) {
    if (!x || typeof x.who !== 'number' || !x.group) continue;
    if (!by.has(x.group)) by.set(x.group, { base: labelBase(x.label), whos: new Set() });
    by.get(x.group).whos.add(x.who);
  }
  const all = nos && nos.size ? [...nos].sort((a, b) => a - b) : [...new Set([...by.values()].flatMap(g => [...g.whos]))].sort((a, b) => a - b);
  const gaps = [...by.values()].map(g => ({ base: g.base, missing: all.filter(n => !g.whos.has(n)) })).filter(g => g.missing.length);
  return { total: all.length, gaps };
}
