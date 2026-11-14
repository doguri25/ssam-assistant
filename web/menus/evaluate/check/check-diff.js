/* 평가 › 기재 점검: 지금 글과 고친 글을 낱말(띄어쓰기) 단위로 견줌 (스펙 2026-11-14-eval-redesign §7). 화면 없이 돌아감(시험).
   wordDiff(지금 글, 고친 글) → [{ op: 'eq'|'del'|'ins', t }] — 같은 말은 가장 길게 남기고(LCS), 바뀐 덩어리마다 지운 말 다음에 더한 말.
   빈칸은 하나로 봄: eq·del을 빈칸으로 이으면 지금 글, eq·ins를 이으면 고친 글 */
const words = s => String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean);
const MAX_CELLS = 400000; // 이보다 크면 가운데를 통째로 바꾼 것으로 봄(아주 긴 글에서 멈추지 않게)

/* 같은 말 짝(LCS): a·b의 낱말 자리 쌍 목록 */
function lcsPairs(a, b) {
  const n = a.length, m = b.length;
  if (!n || !m || n * m > MAX_CELLS) return [];
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return out;
}

export function wordDiff(before, after) {
  const a = words(before), b = words(after);
  // 앞뒤 같은 말은 먼저 떼어 냄
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const midA = a.slice(p, a.length - s), midB = b.slice(p, b.length - s);
  const ops = [];
  const push = (op, t) => ops.push({ op, t });
  a.slice(0, p).forEach(t => push('eq', t));
  let i = 0, j = 0;
  for (const [x, y] of [...lcsPairs(midA, midB), [midA.length, midB.length]]) {
    while (i < x) push('del', midA[i++]);
    while (j < y) push('ins', midB[j++]);
    if (x < midA.length) { push('eq', midA[x]); i = x + 1; j = y + 1; }
  }
  a.slice(a.length - s).forEach(t => push('eq', t));
  // 바뀐 덩어리 안에서는 지운 말을 모두 앞에, 더한 말을 뒤에 → 같은 종류끼리 이음
  const out = [];
  for (let k = 0; k < ops.length;) {
    if (ops[k].op === 'eq') { const t = []; while (k < ops.length && ops[k].op === 'eq') t.push(ops[k++].t); out.push({ op: 'eq', t: t.join(' ') }); continue; }
    const del = [], ins = [];
    while (k < ops.length && ops[k].op !== 'eq') (ops[k].op === 'del' ? del : ins).push(ops[k++].t);
    if (del.length) out.push({ op: 'del', t: del.join(' ') });
    if (ins.length) out.push({ op: 'ins', t: ins.join(' ') });
  }
  return out;
}
