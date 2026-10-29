/* QR 만들기 (라이브러리 없이): 바이트 모드(UTF-8), 버전 1~10, 오류 정정 M(기본).
   ISO/IEC 18004 규칙: 리드-솔로몬(GF(256), 0x11D), 블록 나누기·섞기, 마스크 8개 중 벌점이 가장 낮은 것.
   decodeMatrix는 시험용 해석기(우리가 만든 그림을 다시 읽어 확인) */

const ECL = { L: 1, M: 0, Q: 3, H: 2 }; // 형식 정보의 두 비트
/* 버전별 [블록당 EC 수, 1그룹 블록 수, 1그룹 데이터 수, 2그룹 블록 수, 2그룹 데이터 수] */
const BLOCKS = {
  L: [[7, 1, 19], [10, 1, 34], [15, 1, 55], [20, 1, 80], [26, 1, 108], [18, 2, 68], [20, 2, 78], [24, 2, 97], [30, 2, 116], [18, 2, 68, 2, 69]],
  M: [[10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27], [18, 4, 31], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44]],
  Q: [[13, 1, 13], [22, 1, 22], [18, 2, 17], [26, 2, 24], [18, 2, 15, 2, 16], [24, 4, 19], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19], [20, 4, 16, 4, 17], [24, 6, 19, 2, 20]],
  H: [[17, 1, 9], [28, 1, 16], [22, 2, 13], [16, 4, 9], [22, 2, 11, 2, 12], [28, 4, 15], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15], [24, 4, 12, 4, 13], [28, 6, 15, 2, 16]]
};
const ALIGN = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/* ---------- GF(256)과 리드-솔로몬 ---------- */
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
export function rsEncode(data, ecLen) {
  const div = rsDivisor(ecLen);
  const r = new Array(ecLen).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

/* ---------- 형식·버전 정보 ---------- */
function formatValue(ecl, mask) {
  const data = (ECL[ecl] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
export const formatBits = (ecl, mask) => formatValue(ecl, mask).toString(2).padStart(15, '0');
function versionValue(v) {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
  return (v << 12) | rem;
}
const bit = (x, i) => ((x >>> i) & 1) !== 0;

/* ---------- 틀(기능 무늬) ---------- */
function frame(version) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const put = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { put(6, i, i % 2 === 0); put(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) put(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[version - 1], n = al.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) put(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // 형식 정보 자리(값은 마스크를 정한 뒤 씀)와 어두운 점
  drawFormat(m, fn, size, 0);
  if (version >= 7) {
    const bits = versionValue(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3), d = bit(bits, i);
      put(a, b, d); put(b, a, d);
    }
  }
  return { m, fn, size };
}
function drawFormat(m, fn, size, bits) {
  const put = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i <= 5; i++) put(8, i, bit(bits, i));
  put(8, 7, bit(bits, 6)); put(8, 8, bit(bits, 7)); put(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) put(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) put(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) put(8, size - 15 + i, bit(bits, i));
  put(8, size - 8, true);
}

/* 오른쪽 아래부터 두 칸씩 지그재그로 (기능 무늬는 건너뜀) */
function* zigzag(size, fn) {
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x]) yield [x, y];
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => (((x + y) % 2) + (x * y) % 3) % 2 === 0
];
function applyMask(m, fn, k) {
  const f = MASKS[k];
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (!fn[y][x] && f(x, y)) m[y][x] = !m[y][x];
}

/* 벌점: 같은 색 5개 이상 연속, 2×2 덩어리, 찾기 무늬 닮은꼴, 어두운 비율 */
function penalty(m) {
  const n = m.length;
  let p = 0;
  const lines = [];
  for (let i = 0; i < n; i++) { lines.push(m[i]); lines.push(m.map(r => r[i])); }
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && line[i] === line[i - 1]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
    const s = line.map(b => (b ? '1' : '0')).join('');
    for (const pat of ['10111010000', '00001011101']) { let k = s.indexOf(pat); while (k >= 0) { p += 40; k = s.indexOf(pat, k + 1); } }
  }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  const dark = m.reduce((s, r) => s + r.filter(Boolean).length, 0);
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

const blockSpec = (ecl, v) => { const [ec, b1, d1, b2 = 0, d2 = 0] = BLOCKS[ecl][v - 1]; return { ec, groups: [[b1, d1], [b2, d2]] }; };
const dataCount = (ecl, v) => { const s = blockSpec(ecl, v); return s.groups.reduce((t, [b, d]) => t + b * d, 0); };

/* 글 → 모듈(참이 검은 칸) */
export function qrMatrix(text, ecl = 'M') {
  const bytes = [...new TextEncoder().encode(String(text))];
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    const cap = dataCount(ecl, v) * 8 - 4 - (v < 10 ? 8 : 16);
    if (bytes.length * 8 <= cap) { version = v; break; }
  }
  if (!version) throw new Error('QR_TOO_LONG');
  // 비트 흐름: 모드 0100, 길이, 바이트, 끝 표시, 0xEC·0x11 채움
  const total = dataCount(ecl, version);
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4); push(bytes.length, version < 10 ? 8 : 16); bytes.forEach(b => push(b, 8));
  push(0, Math.min(4, total * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xEC; data.length < total; pad ^= 0xEC ^ 0x11) data.push(pad);
  // 블록 나누기 → 블록마다 EC → 섞기
  const spec = blockSpec(ecl, version);
  const blocks = [];
  let k = 0;
  for (const [b, d] of spec.groups) for (let i = 0; i < b; i++) { const dat = data.slice(k, k + d); k += d; blocks.push({ dat, ec: rsEncode(dat, spec.ec) }); }
  const out = [];
  const maxD = Math.max(...blocks.map(b => b.dat.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.dat.length) out.push(b.dat[i]);
  for (let i = 0; i < spec.ec; i++) for (const b of blocks) out.push(b.ec[i]);
  // 그리기
  const { m, fn, size } = frame(version);
  let i = 0;
  for (const [x, y] of zigzag(size, fn)) { m[y][x] = i < out.length * 8 ? bit(out[i >>> 3], 7 - (i & 7)) : false; i++; }
  let best = null;
  for (let mk = 0; mk < 8; mk++) {
    const c = m.map(r => r.slice());
    const f = fn.map(r => r.slice());
    applyMask(c, f, mk);
    drawFormat(c, f, size, formatValue(ecl, mk));
    const p = penalty(c);
    if (!best || p < best.p) best = { p, c };
  }
  return best.c;
}

/* 시험용 해석기: 형식 정보 → 마스크 풀기 → 지그재그 읽기 → 블록 풀기(EC 확인) → 바이트 모드 */
export function decodeMatrix(mat) {
  const size = mat.length, version = (size - 17) / 4;
  let fbits = 0;
  const g = (x, y) => mat[y][x];
  const read = [];
  for (let i = 0; i <= 5; i++) read.push(g(8, i));
  read.push(g(8, 7), g(8, 8), g(7, 8));
  for (let i = 9; i < 15; i++) read.push(g(14 - i, 8));
  read.forEach((b, i) => { if (b) fbits |= 1 << i; });
  let ecl = null, mask = null;
  for (const e of Object.keys(ECL)) for (let mk = 0; mk < 8; mk++) if (formatValue(e, mk) === fbits) { ecl = e; mask = mk; }
  if (ecl == null) throw new Error('FORMAT');
  const { fn } = frame(version);
  const m = mat.map(r => r.slice());
  applyMask(m, fn, mask);
  const cw = [];
  let cur = 0, n = 0;
  for (const [x, y] of zigzag(size, fn)) { cur = (cur << 1) | (m[y][x] ? 1 : 0); if (++n % 8 === 0) { cw.push(cur); cur = 0; } }
  const spec = blockSpec(ecl, version);
  const sizes = spec.groups.flatMap(([b, d]) => new Array(b).fill(d));
  const blocks = sizes.map(() => ({ dat: [], ec: [] }));
  let p = 0;
  for (let i = 0; i < Math.max(...sizes); i++) blocks.forEach((b, j) => { if (i < sizes[j]) b.dat.push(cw[p++]); });
  for (let i = 0; i < spec.ec; i++) blocks.forEach(b => b.ec.push(cw[p++]));
  for (const b of blocks) if (rsEncode(b.dat, spec.ec).join() !== b.ec.join()) throw new Error('EC');
  const bitsArr = blocks.flatMap(b => b.dat).flatMap(byte => Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1));
  let q = 0;
  const take = len => { let v = 0; for (let i = 0; i < len; i++) v = (v << 1) | bitsArr[q++]; return v; };
  if (take(4) !== 4) throw new Error('MODE');
  const len = take(version < 10 ? 8 : 16);
  return new TextDecoder().decode(new Uint8Array(Array.from({ length: len }, () => take(8))));
}

/* 브라우저: QR PNG (흰 여백 4칸) */
export function qrPng(text, scale = 8) {
  const m = qrMatrix(text);
  const n = m.length + 8;
  const c = document.createElement('canvas');
  c.width = c.height = n * scale;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  m.forEach((row, y) => row.forEach((d, x) => { if (d) g.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale); }));
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('PNG'))), 'image/png'));
}
