/* 단원평가 답안 스캔 쪽 정리: 모아찍기(한 면에 2쪽)는 왼쪽·오른쪽으로 자르고, 양면 스캔에서 거꾸로 나온 뒷면(둘째·넷째… 장)은 180° 돌림.
   쪽: { name, blob, url, thumb, w, h } (평가 메뉴의 readPages와 같은 꼴) */

/* 쪽 크기 [{ w, h }] → 차례 [{ src, rotate, half }] (half: 'L'|'R'|null). 가로로 긴 쪽만 자름 */
export function pagePlan(shapes, { twoUp = false, flipBack = false } = {}) {
  const out = [];
  (shapes || []).forEach((p, i) => {
    const rotate = flipBack && i % 2 ? 180 : 0;
    if (twoUp && p.w > p.h) out.push({ src: i, rotate, half: 'L' }, { src: i, rotate, half: 'R' });
    else out.push({ src: i, rotate, half: null });
  });
  return out;
}

const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
async function loadBitmap(blob) {
  if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch (e) {} }
  const url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function whiteCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  return [c, g];
}

/* 쪽 하나를 돌리고(180°) 반쪽을 잘라 새 쪽으로. 돌린 뒤의 왼쪽이 'L' */
export async function cutPage(page, { rotate = 0, half = null } = {}) {
  const bmp = await loadBitmap(page.blob);
  const W = bmp.width, H = bmp.height, sw = half ? Math.floor(W / 2) : W, sx = half === 'R' ? W - sw : 0;
  const [c, g] = whiteCanvas(sw, H);
  if (rotate === 180) { g.translate(sw, H); g.rotate(Math.PI); g.drawImage(bmp, W - sx - sw, 0, sw, H, 0, 0, sw, H); }
  else g.drawImage(bmp, sx, 0, sw, H, 0, 0, sw, H);
  try { if (bmp.close) bmp.close(); } catch (e) {}
  const blob = await toBlob(c, 'image/jpeg', 0.9);
  const s = Math.min(1, 200 / c.width);
  const [t, tg] = whiteCanvas(c.width * s, c.height * s);
  tg.drawImage(c, 0, 0, t.width, t.height);
  const tb = await toBlob(t, 'image/jpeg', 0.8);
  const name = `${page.name}${half ? (half === 'L' ? ' 왼쪽' : ' 오른쪽') : ''}${rotate ? ' (돌림)' : ''}`;
  const out = { name, blob, url: URL.createObjectURL(blob), thumb: URL.createObjectURL(tb), w: c.width, h: c.height };
  c.width = 0; t.width = 0;
  return out;
}

/* 올린 쪽 → 정리한 쪽. 바꿀 것이 없는 쪽은 그대로(같은 객체) 씀 */
export async function arrangePages(pages, set) {
  const out = [];
  for (const x of pagePlan(pages, set)) {
    const p = pages[x.src];
    out.push(!x.rotate && !x.half ? p : await cutPage(p, x));
  }
  return out;
}
