/* AI로 보낸 글 (스펙 2026-11-13 §2): AI 요청마다 실제로 보낸 것 — 때, 업무(task·role), AI(회사·모델), 보낸 글(공통 부분 + 요청 글,
   글쓰기 원칙을 붙인 마지막 글), 그림 수와 작게 줄인 그림 3장까지(가로 320px 안팎 JPEG).
   이 기기 메모리에만, 최근 20개, 다시 켜면 비움(저장하지 않음·백업에 없음). 키·인증 머리말은 받지도 적지도 않음(아래 칸만 골라 적음).
   평가 메뉴(evaluate.js)의 AI 부르기가 window.SSAM.aiLog.add로 적고, 설정 › AI의 「AI로 보낸 글」이 list·onChange로 보여 줌. 화면 없이 돌아감(시험) */
export const MAX = 20;
const THUMBS = 3, THUMB_W = 320;

/* 업무 이름(설정 › AI의 업무별 AI와 같은 업무, 줄에 맞게 짧게) */
const TASK_NAMES = {
  grade: '채점', writing: '평어·행특·창체', plan: '계획 초안', notes: '피드백·알림', purchase: '품의', message: '쪽지',
  report: '결과 보고', letter: '가정통신문', gongmun: '공문 처리', reply: '회신서 읽기', test: '연결 확인'
};
export function taskName(task, role) {
  const n = Object.prototype.hasOwnProperty.call(TASK_NAMES, task) ? TASK_NAMES[task] : '';
  if (role === 'review') return n ? `${n} 검토` : '검토';
  return n || '기타';
}

let items = [], seq = 0;
const subs = new Set();
function notify() { for (const fn of [...subs]) { try { fn(); } catch (e) {} } }
const str = v => (typeof v === 'string' ? v : '');

/* 적기: 정한 칸만 골라 새 줄을 앞에 둠(21번째부터 옛것이 빠짐). images는 그림 배열 — 수만 적고 작은 그림은 나중에(화면에서만) */
export function add(e = {}) {
  const imgs = Array.isArray(e.images) ? e.images : [];
  const text = str(e.text);
  const entry = {
    id: ++seq, at: Number.isFinite(e.at) ? e.at : Date.now(),
    task: str(e.task), role: str(e.role), provider: str(e.provider), model: str(e.model),
    text, chars: text.length, images: imgs.length, thumbs: []
  };
  items = [entry, ...items].slice(0, MAX);
  notify();
  if (imgs.length) makeThumbs(entry.id, imgs.slice(0, THUMBS));
  return entry;
}
export const list = () => items.slice();
export function onChange(fn) { subs.add(fn); return () => { subs.delete(fn); }; }
export function clear() { items = []; notify(); }
/* 작은 그림 붙이기(그림 주소 data:image/만, 3장까지). 이미 빠진 줄이면 그냥 둠 */
export function setThumbs(id, thumbs) {
  const ok = (Array.isArray(thumbs) ? thumbs : []).filter(t => typeof t === 'string' && /^data:image\//.test(t)).slice(0, THUMBS);
  const i = items.findIndex(x => x.id === id);
  if (i < 0 || !ok.length) return;
  items = items.map((x, k) => (k === i ? { ...x, thumbs: ok } : x));
  notify();
}

/* 「11:02 · 채점 · Gemini 3.8 Flash · 글 1,240자 · 그림 2장」 */
const pad = n => String(n).padStart(2, '0');
export const timeText = at => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function rowText(e) {
  return [timeText(e.at), taskName(e.task, e.role), e.model || e.provider || 'AI', `글 ${Number(e.chars || 0).toLocaleString('ko-KR')}자`, e.images ? `그림 ${e.images}장` : '']
    .filter(Boolean).join(' · ');
}

/* ---------- 작게 줄인 그림 (화면에서만, 요청은 기다리지 않음) ---------- */
// 차례로 하나씩(채점처럼 요청이 몰려도 화면이 버벅이지 않게)
let queue = Promise.resolve();
const canDraw = () => typeof document !== 'undefined' && typeof createImageBitmap === 'function';
function makeThumbs(id, imgs) {
  if (!canDraw()) return;
  // 그림 객체는 나중에 비워질 수 있어(쪽 그림 정리) 지금 들고 있는 것만 잡아 둠
  const src = imgs.map(im => (im && typeof im === 'object' ? { blob: im.blob, mime: im.mime, b64: im.b64 } : null));
  queue = queue.then(async () => {
    if (!items.some(x => x.id === id)) return;
    const out = [];
    for (const s of src) { try { const t = await thumbOf(s); if (t) out.push(t); } catch (e) {} }
    setThumbs(id, out);
  }).catch(() => {});
}
async function thumbOf(s) {
  if (!s) return '';
  let blob = typeof Blob !== 'undefined' && s.blob instanceof Blob ? s.blob : null;
  if (!blob && typeof s.b64 === 'string' && s.b64) blob = await (await fetch(`data:${s.mime || 'image/png'};base64,${s.b64}`)).blob();
  if (!blob) return '';
  const bmp = await createImageBitmap(blob);
  try {
    const w = Math.min(THUMB_W, bmp.width), h = Math.max(1, Math.round(bmp.height * w / bmp.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); // 투명한 곳은 흰색(JPEG)
    g.drawImage(bmp, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.7);
  } finally { if (bmp.close) bmp.close(); }
}

// 평가 메뉴(옛 IIFE)와 설정 화면이 씀: window.SSAM.aiLog
if (globalThis.window) { window.SSAM = window.SSAM || {}; window.SSAM.aiLog = { add, list, onChange, clear, setThumbs, rowText, taskName, timeText, MAX }; }
