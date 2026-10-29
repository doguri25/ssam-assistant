/* 학급 명단 엑셀·CSV(나이스 학생 명렬표 등) → 학생 수와 예외 번호. 번호만 쓰고 이름 등 다른 칸은 버림 */
const norm = v => String(v == null ? '' : v).replace(/\s+/g, '');
const HEAD_NO = /^(출석)?번호$/;
const HEAD_STATE = /학적|변동|비고|상태/;
const OUT = /전출|전학|자퇴|제적|면제|유예/;

/* 위 15줄 안에서 「번호」 머리를 찾고 그 열의 1~60을 번호로. 학적 칸의 전출 등과, 1~최대 번호 중 없는 번호는 예외.
   번호·성명이 양옆으로 여러 번 놓인 명렬표는 「번호」 열마다 한 묶음(그 묶음의 상태 칸은 다음 「번호」 열 앞까지) */
export function parseRoster(rows) {
  const R = (Array.isArray(rows) ? rows : []).map(r => (Array.isArray(r) ? r : []));
  for (let h = 0; h < Math.min(15, R.length); h++) {
    const head = R[h].map(norm);
    const cis = head.map((c, i) => (HEAD_NO.test(c) ? i : -1)).filter(i => i >= 0);
    if (!cis.length) continue;
    const blocks = cis.map((ci, k) => ({ ci, si: head.map((c, i) => (i > ci && i < (cis[k + 1] ?? Infinity) && HEAD_STATE.test(c) ? i : -1)).filter(i => i >= 0) }));
    // 첫 묶음 왼쪽에 놓인 상태 칸도 첫 묶음에
    blocks[0].si.push(...head.map((c, i) => (i < cis[0] && HEAD_STATE.test(c) ? i : -1)).filter(i => i >= 0));
    const nos = new Set(), out = new Set();
    for (const r of R.slice(h + 1)) for (const { ci, si } of blocks) {
      const v = norm(r[ci]);
      if (!/^\d{1,2}$/.test(v) || +v < 1 || +v > 60) continue;
      nos.add(+v);
      if (si.some(i => OUT.test(norm(r[i])))) out.add(+v);
    }
    if (!nos.size) return null;
    const count = Math.max(...nos);
    for (let n = 1; n <= count; n++) if (!nos.has(n)) out.add(n);
    const asc = s => [...s].sort((a, b) => a - b);
    return { count, except: asc(out), nos: asc(nos) };
  }
  return null;
}
