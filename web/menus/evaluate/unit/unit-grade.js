/* 단원평가 채점 규칙 (스펙 3.1·3.2): AI는 학생 답을 읽고, 앱이 정답과 맞춰 점수를 정함.
   서술형만 AI 점수(부분 점수)를 쓰고, 판단이 엇갈리거나 확신이 낮은 칸은 노란 칸(flag) */
import { keyTotal } from './unit-key.js';

export const ITEM_TYPES = [['choice', '고르기'], ['symbol', '기호'], ['match', '선 잇기'], ['short', '단답'], ['essay', '서술형']];

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
const SYL = '가나다라마바사아자차카타파하', JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
const SYL_C = '㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻', JAMO_C = '㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭';
const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'ko', { numeric: true }));
const deCircle = s => String(s || '').replace(/[①-⑩]/g, c => ` ${CIRCLED.indexOf(c) + 1} `);
const deSymbol = s => String(s || '').replace(/[㉮-㉻]/g, c => SYL[SYL_C.indexOf(c)]).replace(/[㉠-㉭]/g, c => JAMO[JAMO_C.indexOf(c)]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const choiceSet = s => uniq(deCircle(s).match(/\d+/g) || []);
export const symbolSet = s => uniq([...deSymbol(s)].filter(c => SYL.includes(c) || JAMO.includes(c)));

export function matchMap(s) {
  const out = {};
  const re = /\(?\s*(\d+)\s*\)?\s*[-–—~→]+\s*([①-⑩]|\d+|[㉠-㉭㉮-㉻]|[ㄱ-ㅎ]|[가-하])/g;
  let m;
  while ((m = re.exec(String(s || '')))) out[m[1]] = deSymbol(deCircle(m[2])).trim();
  return out;
}

// ⑴은 1로, ○× 표시(O·X·⭕·❌ 등)는 ○·×로 맞춤
// 수의 뜻은 지킴: 소수점(12.6, 숫자 사이 가운뎃점 4·19도 점과 같게)·음수(-3)는 남기고, 큰 수 쉼표(1,000)는 빼고, 수 둘(3, 5·1 3/4)은 붙이지 않음.
// list: 세 자리 앞 쉼표도 큰 수가 아니라 목록(300,400)으로 읽음
const PC = String.raw`[\s.,!?·'"“”‘’()[\]{}<>「」『』~\-…:;]`;
const PUNCT = new RegExp(PC, 'g'), NUM_GAP = new RegExp(String.raw`(\d)${PC}+(?=\d)`, 'g');
const DOT = '\uE000', MINUS = '\uE001', SEP = '\uE002'; // 잠깐 남겨 둘 표시(글에 쓰지 않는 글자)
function norm(s, list = false) {
  let t = String(s || '').replace(/[⑴-⑽]/g, c => ` ${c.charCodeAt(0) - 0x2473} `).replace(/−/g, '-').replace(/[‧・･]/g, '·');
  if (!list) t = t.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  return t.replace(/(\d)[.·](?=\d)/g, `$1${DOT}`)
    .replace(/(?<!\d\s*)-\s*(?=\d)/g, MINUS)
    .replace(NUM_GAP, `$1${SEP}`)
    .replace(PUNCT, '').replaceAll(DOT, '.').replaceAll(MINUS, '-').replaceAll(SEP, ',').toLowerCase()
    .replace(/[o◯⭕]/g, '○').replace(/[x✕✖❌]/g, '×');
}
export const normShort = s => norm(s);
// 큰 수로 읽은 것과 목록으로 읽은 것(「1,500」 → 1500 · 1,500): 둘 중 하나라도 같으면 같은 답
const readings = s => [...new Set([norm(s), norm(s, true)])];
// 「/」는 「또는」으로 나눔. 단 양쪽이 수(3/4)면 분수 하나
const splitShort = answer => String(answer || '').replace(/^\s*\(\s*예\s*\)\s*/, '').replace(/\s*등\s*$/, '').split(/\s*(?<!\d\s*)\/\s*|\s*\/(?!\s*\d)\s*|\s+또는\s+/);
export const shortAnswers = answer => splitShort(answer).map(normShort).filter(Boolean);
function sameShort(answer, read) {
  const got = new Set(readings(read).filter(Boolean));
  return splitShort(answer).some(a => readings(a).some(x => x && got.has(x)));
}

/* 앱이 정할 수 있으면 점수, 못 정하면 null */
export function autoJudge(item, read) {
  const full = Number(item.points) || 0;
  if (item.type === 'choice') { const a = choiceSet(item.answer); return a.length ? (same(choiceSet(read), a) ? full : 0) : null; }
  if (item.type === 'symbol') { const a = symbolSet(item.answer); return a.length ? (same(symbolSet(read), a) ? full : 0) : null; }
  if (item.type === 'match') {
    const a = matchMap(item.answer), r = matchMap(read), ks = Object.keys(a);
    if (!ks.length) return null;
    return ks.length === Object.keys(r).length && ks.every(k => r[k] === a[k]) ? full : 0;
  }
  if (item.type === 'short') return sameShort(item.answer, read) ? full : null;
  return null;
}

const cell = (read, pts, ai, flag, why) => ({ read, pts, ai, flag, why, ok: false, manual: false });

export function gradeCell(item, ai) {
  const full = Number(item.points) || 0;
  if (!ai) return cell('', 0, 0, 'low', '');
  const read = String(ai.read == null ? '' : ai.read).trim().slice(0, 120);
  const n = Math.round(Number(ai.points));
  const aiPts = Number.isFinite(n) ? Math.max(0, Math.min(full, n)) : 0;
  const why = String(ai.why || '').slice(0, 80), unsure = ai.sure === false;
  // 빈 답: AI가 확신하지 못했거나 맞다고 봤으면(읽지 못했을 수 있음) 노란 칸
  if (!read) return cell('', 0, aiPts, unsure ? 'low' : aiPts > 0 ? 'differ' : '', why);
  if (item.type === 'essay') return cell(read, aiPts, aiPts, 'essay', why);
  const auto = autoJudge(item, read);
  if (item.type === 'short' && auto == null) {
    // 글자가 다른 단답: AI가 뜻으로 판단한 점수를 쓰고, 맞다고 봤든 틀리다고 봤든 노란 칸
    const pts = full > 0 && aiPts >= full / 2 ? full : 0;
    return cell(read, pts, aiPts, 'similar', why);
  }
  if (auto == null) return cell(read, aiPts, aiPts, 'low', why);
  return cell(read, auto, aiPts, auto !== aiPts ? 'differ' : (unsure ? 'low' : ''), why);
}

/* 다시 채점: 선생님이 고친 칸은 그대로 둠 */
export function mergeCells(old = {}, fresh = {}) {
  const out = { ...fresh };
  for (const k of Object.keys(old)) if (old[k] && old[k].manual) out[k] = old[k];
  return out;
}

export const needsCheck = c => !!(c && c.flag && !c.ok);

/* 정답표의 한 문항을 고친 뒤: 채점한 학생의 그 칸을 읽은 답으로 다시 맞춤.
   선생님이 고친 칸은 그대로 두되 배점 안으로만 줄임. 정답·유형을 고쳤으면 단답의 지난 AI 판단은 쓰지 않음 */
export function rescoreItem(test, no, field = '') {
  const stale = field === 'answer' || field === 'type';
  const it = test.key.items.find(i => i.no === no);
  if (!it) return;
  const full = Number(it.points) || 0;
  for (const st of test.students || []) {
    const c = st.items && st.items[no];
    if (!c) continue;
    if (c.manual) { c.pts = Math.min(Number(c.pts) || 0, full); continue; }
    // 지난 AI 판단이 낡았으면 앱이 맞춘 점수를 AI 점수로 봄(글자가 다른 단답은 0 → 노란 칸)
    const ai = stale && it.type !== 'essay' ? (autoJudge(it, c.read) ?? 0) : Math.min(Number(c.ai) || 0, full);
    st.items[no] = gradeCell(it, { read: c.read, points: ai, sure: c.flag !== 'low', why: stale ? '' : c.why });
  }
}

export function studentTotal(test, st) {
  const items = (test && test.key && test.key.items) || [];
  const total = keyTotal(items);
  const score = items.reduce((s, i) => s + (Number(st && st.items && st.items[i.no] && st.items[i.no].pts) || 0), 0);
  return { score, total, pct: total ? Math.round(score / total * 1000) / 10 : 0 };
}
