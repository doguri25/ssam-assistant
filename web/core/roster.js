/* 학급 명단 엑셀·CSV(나이스 학생 명렬표 등) → 학생 수와 예외 번호. 번호만 쓰고 이름 등 다른 칸은 버림 */
const norm = v => String(v == null ? '' : v).replace(/\s+/g, '');
const HEAD_NO = /^(출석)?번호$/;
const HEAD_STATE = /학적|변동|비고|상태/;
const OUT = /전출|전학|자퇴|제적|면제|유예/;

/* 위 15줄 안에서 「번호」 머리를 찾고 그 열의 1~60을 번호로. 학적 칸의 전출 등과, 1~최대 번호 중 없는 번호는 예외 */
export function parseRoster(rows) {
  const R = (Array.isArray(rows) ? rows : []).map(r => (Array.isArray(r) ? r : []));
  for (let h = 0; h < Math.min(15, R.length); h++) {
    const head = R[h].map(norm);
    const ci = head.findIndex(c => HEAD_NO.test(c));
    if (ci < 0) continue;
    const si = head.findIndex((c, i) => i !== ci && HEAD_STATE.test(c));
    const nos = new Set(), out = new Set();
    for (const r of R.slice(h + 1)) {
      const v = norm(r[ci]);
      if (!/^\d{1,2}$/.test(v) || +v < 1 || +v > 60) continue;
      nos.add(+v);
      if (si >= 0 && OUT.test(norm(r[si]))) out.add(+v);
    }
    if (!nos.size) return null;
    const count = Math.max(...nos);
    for (let n = 1; n <= count; n++) if (!nos.has(n)) out.add(n);
    const asc = s => [...s].sort((a, b) => a - b);
    return { count, except: asc(out), nos: asc(nos) };
  }
  return null;
}
