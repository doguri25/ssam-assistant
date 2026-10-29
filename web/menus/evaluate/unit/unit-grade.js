/* 단원평가 채점 규칙 (스펙 3.1·3.2): AI는 학생 답을 읽고, 앱이 정답과 맞춰 점수를 정함.
   서술형만 AI 점수(부분 점수)를 쓰고, 판단이 엇갈리거나 확신이 낮은 칸은 노란 칸(flag) */
import { keyTotal } from './unit-key.js';

export const ITEM_TYPES = [['choice', '고르기'], ['symbol', '기호'], ['match', '선 잇기'], ['short', '단답'], ['essay', '서술형']];

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
const SYL = '가나다라마바사아자차카타파하', JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
const SYL_C = '㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻', JAMO_C = '㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭';
const uniq = a => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'ko', { numeric: true }));
const deCircle = s => String(s || '').replace(/[①-⑩]/g, c => String(CIRCLED.indexOf(c) + 1));
const deSymbol = s => String(s || '').replace(/[㉮-㉻]/g, c => SYL[SYL_C.indexOf(c)]).replace(/[㉠-㉭]/g, c => JAMO[JAMO_C.indexOf(c)]);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const choiceSet = s => uniq(deCircle(s).match(/\d+/g) || []);
export const symbolSet = s => uniq([...deSymbol(s)].filter(c => SYL.includes(c) || JAMO.includes(c)));

export function matchMap(s) {
  const out = {};
  const re = /\(?\s*(\d+)\s*\)?\s*[-–—~→]+\s*([①-⑩]|\d+|[㉠-㉭㉮-㉻]|[ㄱ-ㅎ]|[가-하])/g;
  let m;
  while ((m = re.exec(String(s || '')))) out[m[1]] = deSymbol(deCircle(m[2]));
  return out;
}

export const normShort = s => String(s || '').replace(/[\s.,!?·'"“”‘’()[\]{}<>「」『』~\-…:;]/g, '').toLowerCase();
export function shortAnswers(answer) {
  const a = String(answer || '').replace(/^\s*\(\s*예\s*\)\s*/, '').replace(/\s*등\s*$/, '');
  return a.split(/\s*\/\s*|\s+또는\s+/).map(normShort).filter(Boolean);
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
  if (item.type === 'short') return shortAnswers(item.answer).includes(normShort(read)) ? full : null;
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
  if (!read) return cell('', 0, aiPts, '', why);
  if (item.type === 'essay') return cell(read, aiPts, aiPts, 'essay', why);
  const auto = autoJudge(item, read);
  if (item.type === 'short' && auto == null) {
    const pts = full > 0 && aiPts >= full / 2 ? full : 0;
    return cell(read, pts, aiPts, pts > 0 ? 'similar' : (unsure ? 'low' : ''), why);
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

export function studentTotal(test, st) {
  const items = (test && test.key && test.key.items) || [];
  const total = keyTotal(items);
  const score = items.reduce((s, i) => s + (Number(st && st.items && st.items[i.no] && st.items[i.no].pts) || 0), 0);
  return { score, total, pct: total ? Math.round(score / total * 1000) / 10 : 0 };
}
