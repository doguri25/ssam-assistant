/* zip: 무압축으로 쓰기(.hwpx·.xlsx 샘플), 무압축·deflate 풀기(.xlsx 읽기).
   브라우저와 Node 모두 씀 — 압축 풀기는 DecompressionStream('deflate-raw') */

const enc = new TextEncoder();
const dec = new TextDecoder();

let TABLE = null;
export function crc32(u8) {
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* entries: [{ name, data: Uint8Array | string }] → zip 바이트 (순서 그대로, 무압축, 이름은 UTF-8) */
export function zipStore(entries) {
  const files = entries.map(e => {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    return { name: enc.encode(e.name), data, crc: crc32(data) };
  });
  const localSize = files.reduce((s, f) => s + 30 + f.name.length + f.data.length, 0);
  const cenSize = files.reduce((s, f) => s + 46 + f.name.length, 0);
  const out = new Uint8Array(localSize + cenSize + 22);
  const dv = new DataView(out.buffer);
  let p = 0;
  const offsets = [];
  for (const f of files) {
    offsets.push(p);
    dv.setUint32(p, 0x04034b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 0x0800, true);
    dv.setUint16(p + 8, 0, true); dv.setUint16(p + 10, 0, true); dv.setUint16(p + 12, 0x21, true); // 1980-01-01
    dv.setUint32(p + 14, f.crc, true); dv.setUint32(p + 18, f.data.length, true); dv.setUint32(p + 22, f.data.length, true);
    dv.setUint16(p + 26, f.name.length, true); dv.setUint16(p + 28, 0, true);
    out.set(f.name, p + 30); out.set(f.data, p + 30 + f.name.length);
    p += 30 + f.name.length + f.data.length;
  }
  const cenStart = p;
  files.forEach((f, i) => {
    dv.setUint32(p, 0x02014b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 20, true); dv.setUint16(p + 8, 0x0800, true);
    dv.setUint16(p + 10, 0, true); dv.setUint16(p + 12, 0, true); dv.setUint16(p + 14, 0x21, true);
    dv.setUint32(p + 16, f.crc, true); dv.setUint32(p + 20, f.data.length, true); dv.setUint32(p + 24, f.data.length, true);
    dv.setUint16(p + 28, f.name.length, true); dv.setUint32(p + 42, offsets[i], true);
    out.set(f.name, p + 46);
    p += 46 + f.name.length;
  });
  dv.setUint32(p, 0x06054b50, true); dv.setUint16(p + 8, files.length, true); dv.setUint16(p + 10, files.length, true);
  dv.setUint32(p + 12, p - cenStart, true); dv.setUint32(p + 16, cenStart, true);
  return out;
}

async function inflate(u8) {
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* zip 바이트 → Map(이름 → 내용). zip이 아니면 Error('NOT_ZIP') */
export async function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('NOT_ZIP');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('NOT_ZIP');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const loc = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    const raw = u8.subarray(start, start + csize);
    if (!name.endsWith('/')) out.set(name, method === 0 ? raw.slice() : method === 8 ? await inflate(raw) : raw.slice());
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
