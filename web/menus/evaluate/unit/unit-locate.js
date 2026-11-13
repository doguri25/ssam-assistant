/* 단원평가 확인 창: 그 문항 전체 보기 (스펙 2026-11-13-crop-log-flow §1) — 화면 없이 도는 부분.
   문항 자리 찾기 프롬프트(문항 번호·평가 내용·유형만, 학생 번호·이름 없음), AI 답 정리, 여유를 더한 자르기 상자.
   찾은 자리는 평가의 key.boxes = { at, lay(쪽 모양), items: { [문항 no]: { page, box: [x0, y0, x1, y1] (0~1000) } } } — 시험지 모양이라 학생 자료가 아님 */
import { ITEM_TYPES } from './unit-grade.js';

const TYPE_NAME = Object.fromEntries(ITEM_TYPES);
const listOf = (v, k) => (Array.isArray(v) ? v : (v && Array.isArray(v[k]) ? v[k] : []));
const oneLine = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const MIN = 15, HUGE = 0.9 * 1000 * 1000; // 너무 작은 상자(쪽의 1.5% 아래)·쪽 거의 전체인 상자는 자를 까닭이 없음

/* 평가 하나에 한 번: 채점을 마친 첫 학생의 쪽들(채점 AI에 보낸 것과 같은 이름 가린 그림)과 함께 보냄 */
export function locatePrompt(items, pageCount = 0) {
  const n = Math.max(0, pageCount | 0);
  return [
    '[단원평가 문항 자리]',
    `당신은 초등학교 단원평가지에서 문항마다 자리를 찾습니다. 함께 보낸 그림${n ? ` ${n}장` : ''}은 한 학생이 푼 평가지의 쪽들이며, 보낸 차례대로 0부터 쪽 번호를 셉니다. 이름 칸은 가려져 있을 수 있습니다.`,
    '', '[문항] 번호 | 평가 내용 | 유형',
    ...(items || []).map(it => `- ${it.no} | ${oneLine(it.content) || `${it.no}번 문항`} | ${TYPE_NAME[it.type] || '단답'}`),
    '', '[할 일]',
    '1. 문항마다 그 문항이 있는 쪽(page, 0부터)과 그 문항 전체를 감싸는 상자(box)를 찾습니다. 상자에는 문항 번호·물음·보기·그림·답 쓰는 칸을 모두 넣습니다.',
    '2. box는 [x0, y0, x1, y1]입니다. 그 쪽 그림의 왼쪽 위가 [0, 0], 오른쪽 아래가 [1000, 1000]인 정수로 적습니다.',
    '3. 한 문항이 두 쪽에 걸치면 물음이 시작하는 쪽만 적습니다. 찾지 못한 문항은 뺍니다.',
    '4. 학생이 쓴 답이나 학생 이름은 읽거나 적지 않습니다.',
    '', '[출력] JSON 하나만 출력합니다.',
    '{"items":[{"no":1,"page":0,"box":[40,120,960,330]}]}'
  ].join('\n');
}

export const validLocate = v => Array.isArray(v) || !!(v && Array.isArray(v.items));

/* 상자 [x0, y0, x1, y1] → 0~1000 정수, 모서리 차례 바로잡음. 0~1 비율로 답하면 1000배. 모양이 틀리거나 너무 작거나 쪽 거의 전체면 null */
function normBox(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  let v = b.map(x => (x === '' || x == null ? NaN : Number(x)));
  if (!v.every(Number.isFinite)) return null;
  if (v.every(x => x >= 0 && x <= 1)) v = v.map(x => x * 1000);
  v = v.map(x => Math.round(Math.max(0, Math.min(1000, x))));
  const [x0, x1] = v[0] <= v[2] ? [v[0], v[2]] : [v[2], v[0]], [y0, y1] = v[1] <= v[3] ? [v[1], v[3]] : [v[3], v[1]];
  const w = x1 - x0, h = y1 - y0;
  if (w < MIN || h < MIN || w * h >= HUGE) return null;
  return [x0, y0, x1, y1];
}

/* AI 답 → { [문항 no]: { page, box } }. 없는 문항·없는 쪽(0 ≤ page < pageCount)·틀린 상자는 빼고, 같은 문항은 처음 것 */
export function normBoxes(v, items, pageCount) {
  const nos = new Set((items || []).map(i => i.no)), out = {}, n = Math.max(0, pageCount | 0);
  for (const x of listOf(v, 'items')) {
    if (!x || typeof x !== 'object') continue;
    const no = Number(x.no), page = x.page === '' || x.page == null ? NaN : Number(x.page);
    if (!nos.has(no) || out[no] || !Number.isInteger(page) || page < 0 || page >= n) continue;
    const box = normBox(x.box);
    if (box) out[no] = { page, box };
  }
  return out;
}

/* 0~1000 상자 → 그림(가로 W·세로 H 픽셀)에서 자를 곳 { x, y, w, h }. 스캔이 조금 밀려도 보이게 사방에 쪽 가로·세로의 pad만큼 여유, 그림 안으로 */
export function cropRect(box, W, H, pad = 0.03) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) || !(W > 0) || !(H > 0)) return null;
  const px = Math.max(0, pad) * W, py = Math.max(0, pad) * H;
  const x0 = Math.max(0, Math.floor(Math.min(box[0], box[2]) / 1000 * W - px)), y0 = Math.max(0, Math.floor(Math.min(box[1], box[3]) / 1000 * H - py));
  const x1 = Math.min(W, Math.ceil(Math.max(box[0], box[2]) / 1000 * W + px)), y1 = Math.min(H, Math.ceil(Math.max(box[1], box[3]) / 1000 * H + py));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* 평가에 적어 둔 자리 { [no]: { page, box } }: 없거나(예전 평가) 망가졌거나 지금 쪽 모양(lay)과 다르게 찾은 것이면 null */
export function boxesOf(key, lay) {
  const b = key && key.boxes;
  if (!b || typeof b !== 'object' || !b.items || typeof b.items !== 'object' || Array.isArray(b.items)) return null;
  if (b.lay != null && lay != null && b.lay !== lay) return null;
  return b.items;
}
