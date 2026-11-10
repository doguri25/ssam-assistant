/* 바탕화면 「쌤」 버튼 창 자리(물리 px). pos: 지난 자리 {x,y}(창 왼쪽 위) 또는 null, mons: 모니터들(Tauri availableMonitors),
   win: 버튼 창 바깥 크기 {width,height}(모르면 SIZE × 배율), cur: 지금 모니터(처음 자리용).
   지난 자리가 든 모니터가 있으면 그 모니터 안으로 당김(창이 커져도 오른쪽·아래로 넘치지 않게), 없으면 cur 오른쪽 아래(작업 표시줄 위) */
export const SIZE = 116; // tauri.conf.json bubble 창(논리 px)과 같게
const has = (m, p) => p.x >= m.position.x && p.y >= m.position.y && p.x < m.position.x + m.size.width && p.y < m.position.y + m.size.height;
export function placeBubble(pos, mons, win, cur) {
  const list = (mons || []).filter(m => m && m.position && m.size);
  const sizeOn = m => (win && win.width ? win : { width: Math.round(SIZE * (m.scaleFactor || 1)), height: Math.round(SIZE * (m.scaleFactor || 1)) });
  const clamp = (p, m) => {
    const w = sizeOn(m);
    return {
      x: Math.max(m.position.x, Math.min(p.x, m.position.x + m.size.width - w.width)),
      y: Math.max(m.position.y, Math.min(p.y, m.position.y + m.size.height - w.height))
    };
  };
  const on = pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) ? list.find(m => has(m, pos)) : null;
  if (on) return clamp(pos, on);
  const m = cur && cur.position && cur.size ? cur : list[0];
  if (!m) return null;
  const s = m.scaleFactor || 1, w = sizeOn(m);
  return clamp({ x: m.position.x + m.size.width - w.width - Math.round(24 * s), y: m.position.y + m.size.height - w.height - Math.round(96 * s) }, m);
}
