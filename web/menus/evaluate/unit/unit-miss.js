/* 오답 유형 묶기 → 5분 보충 활동 (스펙 2026-11-13-miss-tour-check §1, 화면 없음 — Node 시험에서도 씀).
   채점을 마친 학생(graded) 가운데 그 문항에서 만점을 받지 못한 학생을 문항마다 모아 묶음:
   - 고르기·기호·선 잇기: 앱이 학생이 쓴 답(정리한 꼴)으로 「③을 고름」. 빈 답·「안 함」은 「답을 쓰지 않음」. AI 안 씀.
   - 단답·서술형: 빈 답만 앱이, 나머지 답은 AI가 틀린 까닭으로. AI에는 문항과 답 글만, 학생마다 a1·a2 같은 임시 번호로(학생 번호·이름은 보내지 않음).
   - 5분 보충 활동: 묶음마다 AI가(고르기 묶음은 g1·g2로 보내 그 답을 고른 까닭 짐작도). 선생님이 고친 활동(src 'manual')은 다시 묶어도 남음.
   저장: 평가의 miss = { at, items: { [문항 no]: { groups: [{ why, nos, act, src, key?, guess? }], sig, ai } } }.
   sig는 그 문항의 틀린 학생·점수·읽은 답·정답의 지문 — 다시 채점해 바뀌면 그 문항 묶음은 낡음(stale) */
import { graded, makeTitle, itemName } from './unit-model.js';
import { choiceSet, symbolSet, matchMap } from './unit-grade.js';
import { maskPersons } from '../../../core/chat-names.js';

export const BLANK = '답을 쓰지 않음', OTHER = '그 밖의 답', PENDING = '아직 묶지 않음';
export const APP_TYPES = ['choice', 'symbol', 'match'];
const WHY_MAX = 40, ACT_MAX = 200;
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩';
const SYL = '가나다라마바사아자차카타파하', JAMO = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
const SYL_C = '㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻', JAMO_C = '㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭';
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const flat = s => String(s == null ? '' : s).replace(/\s+/g, '');
const full = it => Number(it && it.points) || 0;
const byNo = (a, b) => a - b;
export const nosText = nos => `${nos.join('·')}번`;

/* 빈 답·「안 함」(답을 쓰지 않음) */
export const isBlank = read => /^(?:|안함|빈칸|\(빈칸\)|무응답|미응답|[-–—_?？]+)$/.test(flat(read));

/* 그 문항에서 만점을 받지 못한 채점한 학생 [{ no, read, pts }] (번호 차례) */
export function wrongOf(t, it) {
  if (!t || !it) return [];
  const f = full(it);
  return graded(t).map(s => { const c = (s.items && s.items[it.no]) || {}; return { no: Number(s.no), read: String(c.read == null ? '' : c.read).trim(), pts: Number(c.pts) || 0 }; })
    .filter(w => w.pts < f && Number.isFinite(w.no)).sort((a, b) => a.no - b.no);
}
/* 틀린 학생이 있는 문항 */
export const missTargets = t => ((t && t.key && t.key.items) || []).filter(it => wrongOf(t, it).length > 0);

/* ---------- 조사 (「③을 고름」「②를 고름」「(1)-②로 이음」) ---------- */
// 받침: '' 없음 · 'ㄹ' · 'x' 그 밖의 받침 · null 모름. 숫자는 읽는 소리(영·일·이·삼·사·오·육·칠·팔·구, 10·20…은 십)
const DIGIT = { 0: 'x', 1: 'ㄹ', 2: '', 3: 'x', 4: '', 5: '', 6: 'x', 7: 'ㄹ', 8: 'ㄹ', 9: '' };
function finalOf(s) {
  const t = String(s || '').replace(/[\s)\]}」』'"’”.,·]+$/, '');
  const m = /(\d+)$/.exec(t);
  if (m) return m[1].length > 1 && m[1].endsWith('0') ? 'x' : DIGIT[m[1].slice(-1)];
  const ch = t.slice(-1);
  if (!ch) return null;
  const ci = CIRC.indexOf(ch);
  if (ci >= 0) return ci === 9 ? 'x' : DIGIT[ci + 1];
  if (SYL_C.includes(ch)) return '';
  if (JAMO_C.includes(ch) || JAMO.includes(ch)) return ch === 'ㄹ' || ch === '㉣' ? 'ㄹ' : 'x';
  const c = ch.charCodeAt(0) - 0xac00;
  if (c >= 0 && c < 11172) { const j = c % 28; return j === 0 ? '' : j === 8 ? 'ㄹ' : 'x'; }
  return null;
}
const eul = s => { const f = finalOf(s); return f == null ? '을(를)' : f === '' ? '를' : '을'; };
const ro = s => { const f = finalOf(s); return f == null ? '(으)로' : f === '' || f === 'ㄹ' ? '로' : '으로'; };

/* ---------- 고른 답으로 묶기 ---------- */
const circle = d => (Number(d) >= 1 && Number(d) <= 10 ? CIRC[Number(d) - 1] : String(d));
const symbolOf = c => (SYL.includes(c) ? SYL_C[SYL.indexOf(c)] : JAMO.includes(c) ? JAMO_C[JAMO.indexOf(c)] : c);
/* 고르기·기호·선 잇기 답 → { key, why }. 정리한 꼴이 없으면(알아볼 수 없는 글) 그 글 그대로 */
export function answerGroup(it, read) {
  const raw = clip(read, 30), text = { key: 't:' + flat(read), why: `「${raw}」라고 씀` };
  if (it.type === 'choice') {
    const set = choiceSet(read);
    if (!set.length) return text;
    const round = /[①-⑩]/.test(String(it.answer || '')) || !/\(\s*\d+\s*\)/.test(String(it.answer || ''));
    const label = set.map(d => (round ? circle(d) : `(${d})`)).join(', ');
    return { key: 'a:' + set.join(','), why: `${label}${eul(label)} 고름` };
  }
  if (it.type === 'symbol') {
    const set = symbolSet(read);
    if (!set.length) return text;
    const label = set.map(symbolOf).join(', ');
    return { key: 'a:' + set.join(','), why: `${label}${eul(label)} 고름` };
  }
  if (it.type === 'match') {
    const m = matchMap(read), ks = Object.keys(m).sort((a, b) => Number(a) - Number(b));
    if (!ks.length) return text;
    const val = v => (/^\d+$/.test(v) ? circle(v) : symbolOf(v));
    const label = ks.map(k => `(${k})-${val(m[k])}`).join(', ');
    return { key: 'a:' + ks.map(k => `${k}-${m[k]}`).join(','), why: `${label}${ro(label)} 이음` };
  }
  return text;
}
const bySize = (a, b) => b.nos.length - a.nos.length || a.nos[0] - b.nos[0];
/* 묶음 차례: 큰 묶음부터, 「답을 쓰지 않음」·「그 밖의 답」은 끝에 */
const order = gs => [...gs.filter(g => g.key !== 'blank' && g.key !== 'other').sort(bySize), ...gs.filter(g => g.key === 'blank'), ...gs.filter(g => g.key === 'other')];

/* 앱이 묶는 것 → { groups: [{ key, why, nos, act: '', src: 'app' }], rest: 단답·서술형에서 AI로 보낼 답 [{ no, read, pts }] } */
export function appGroups(t, it) {
  const wrong = wrongOf(t, it), m = new Map(), rest = [], blank = [];
  for (const w of wrong) {
    if (isBlank(w.read)) { blank.push(w.no); continue; }
    if (!APP_TYPES.includes(it.type)) { rest.push(w); continue; }
    const g = answerGroup(it, w.read);
    if (!m.has(g.key)) m.set(g.key, { key: g.key, why: g.why, nos: [], act: '', src: 'app' });
    m.get(g.key).nos.push(w.no);
  }
  const groups = [...m.values()];
  if (blank.length) groups.push({ key: 'blank', why: BLANK, nos: blank, act: '', src: 'app' });
  return { groups: order(groups), rest };
}

/* ---------- 낡음 ---------- */
/* 그 문항의 지문: 정답·배점·유형과 틀린 학생마다 번호·점수·읽은 답(띄어쓰기 뺌) */
export function missSig(t, it) {
  const s = [it.type, flat(it.answer), full(it), ...wrongOf(t, it).map(w => `${w.no}:${w.pts}:${flat(w.read)}`)].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36) + '.' + s.length.toString(36);
}
const savedOf = (t, no) => {
  const s = t && t.miss && typeof t.miss === 'object' && t.miss.items && typeof t.miss.items === 'object' ? t.miss.items[no] : null;
  return s && Array.isArray(s.groups) ? s : null;
};

/* ---------- AI 요청 ---------- */
/* items: 묶을 문항 → { items: [{ no, content, type, answer, criteria, points, groups: [{ id, why, n }], answers: [{ id, text, part }] }],
   ids: { a1: { item, no(학생) } }, gs: { g1: { item, key } } }. 임시 번호는 요청 전체에서 하나씩(a1·a2…, g1·g2…), 답 글은 이름처럼 보이는 말을 가림 */
export function missRequest(t, items = missTargets(t)) {
  const ids = {}, gs = {};
  let a = 0, g = 0;
  const list = items.map(it => {
    const { groups, rest } = appGroups(t, it);
    return {
      no: it.no, content: itemName(it), type: it.type, answer: String(it.answer || ''), criteria: String(it.criteria || ''), points: full(it),
      groups: groups.map(x => { const id = `g${++g}`; gs[id] = { item: it.no, key: x.key }; return { id, why: x.why, n: x.nos.length }; }),
      answers: rest.map(r => { const id = `a${++a}`; ids[id] = { item: it.no, no: r.no }; return { id, text: clip(maskPersons(r.read).text, 160), part: r.pts > 0 }; })
    };
  });
  return { items: list, ids, gs };
}
const listOf = (v, k) => (Array.isArray(v) ? v : (v && Array.isArray(v[k]) ? v[k] : []));
const idList = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,·]+/) : []).map(x => String(x == null ? '' : x).trim().toLowerCase()).filter(Boolean);

/* AI 답 → { [문항 no]: { app: { [key]: { guess, act } }, groups: [{ why, nos(학생), act }], rest: 묶지 못한 학생 번호, got } }.
   그 문항의 임시 번호만 받음(모르는 번호·다른 문항 번호·이미 쓴 번호는 버림), 까닭이 빈 묶음은 버림 */
export function normMiss(v, req) {
  const out = {}, used = new Set();
  for (const it of req.items) out[it.no] = { app: {}, groups: [], rest: [], got: false };
  for (const x of listOf(v, 'items')) {
    const o = x && typeof x === 'object' ? out[Number(x.no)] : null;
    if (!o) continue;
    const no = Number(x.no);
    for (const g of Array.isArray(x.groups) ? x.groups : []) {
      if (!g || typeof g !== 'object') continue;
      const why = clip(g.why, WHY_MAX), act = clip(g.act, ACT_MAX);
      if (g.g != null) {
        const id = String(g.g).trim().toLowerCase(), m = req.gs[id];
        if (m && m.item === no && !o.app[m.key] && (why || act)) { o.app[m.key] = { guess: why, act }; o.got = true; }
        continue;
      }
      if (!why) continue;
      const ok = idList(g.ids).filter(id => req.ids[id] && req.ids[id].item === no && !used.has(id));
      if (!ok.length) continue;
      ok.forEach(id => used.add(id));
      o.groups.push({ why, nos: [...new Set(ok.map(id => req.ids[id].no))].sort(byNo), act });
      o.got = true;
    }
  }
  for (const [id, m] of Object.entries(req.ids)) if (!used.has(id) && out[m.item]) out[m.item].rest.push(m.no);
  for (const o of Object.values(out)) o.rest = [...new Set(o.rest)].sort(byNo);
  return out;
}
export const missGot = r => Object.values(r || {}).some(o => o && o.got);

/* ---------- 묶음 맞추기 ---------- */
const clean = g => ({ why: g.why, nos: g.nos, act: g.act || '', src: g.src, ...(g.key ? { key: g.key } : {}), ...(g.guess ? { guess: g.guess } : {}) });
const overlap = (a, b) => a.filter(n => b.includes(n)).length;
/* 문항 하나를 다시 묶음: 지금 채점으로 앱 묶음, ai(normMiss의 그 문항, 없으면 null)가 있으면 까닭 묶음·활동.
   old(저장한 그 문항)의 선생님 활동(src manual)은 같은 답 묶음(key)이나 같은 까닭·겹치는 학생의 까닭 묶음으로 옮김.
   AI 없이(ai 없음) 다시 묶으면 지난 까닭 묶음에서 지금도 틀린 학생만 남김 → { groups, sig, ai(AI가 이 문항을 다 묶었는지) } */
export function mergeItem(t, it, old, ai) {
  const { groups: app, rest } = appGroups(t, it);
  const prev = old && Array.isArray(old.groups) ? old.groups.filter(g => g && Array.isArray(g.nos)) : [];
  const got = !!(ai && ai.got);
  const keyed = app.map(g => {
    const o = prev.find(x => x.key && x.key === g.key), a = got ? ai.app[g.key] : null;
    if (o && o.src === 'manual') return { ...g, act: o.act || '', guess: (a && a.guess) || o.guess || '', src: 'manual' };
    if (a) return { ...g, act: a.act, guess: a.guess, src: 'ai' };
    if (o && o.src === 'ai') return { ...g, act: o.act || '', guess: o.guess || '', src: 'ai' };
    return g;
  });
  const restNos = rest.map(r => r.no), oldReason = prev.filter(x => !x.key || x.key === 'other');
  let reason = [];
  const fromAI = got ? ai.groups.map(g => ({ why: g.why, nos: g.nos.filter(n => restNos.includes(n)), act: g.act, src: 'ai' })).filter(g => g.nos.length) : [];
  if (fromAI.length) {
    const left = restNos.filter(n => !fromAI.some(g => g.nos.includes(n)));
    reason = left.length ? [...fromAI, { key: 'other', why: OTHER, nos: left, act: '', src: 'app' }] : fromAI;
    // 선생님 활동 옮기기: 같은 까닭 글 → 학생이 가장 많이 겹치는 묶음(한 번씩)
    const manual = oldReason.filter(x => x.src === 'manual'), took = new Set();
    for (const g of reason) {
      const cand = manual.filter(x => !took.has(x));
      const o = cand.find(x => (g.key === 'other' ? x.key === 'other' : flat(x.why) === flat(g.why)))
        || cand.filter(x => (g.key === 'other') === (x.key === 'other') && overlap(x.nos, g.nos) > 0).sort((a, b) => overlap(b.nos, g.nos) - overlap(a.nos, g.nos))[0];
      if (o) { took.add(o); g.act = o.act || ''; g.src = 'manual'; }
    }
  } else reason = oldReason.map(x => ({ ...x, nos: x.nos.filter(n => restNos.includes(n)) })).filter(x => x.nos.length);
  return { groups: order([...keyed, ...reason]).map(clean), sig: missSig(t, it), ai: got && (!restNos.length || fromAI.length > 0) };
}

/* ---------- 화면 목록 ---------- */
/* 틀린 학생이 있는 문항마다 { it, no, n(틀린 학생 수), groups, pending(아직 묶지 않은 학생), stale, ai, saved }.
   저장 전이면 앱 묶음만, 낡았으면 저장한 묶음 그대로(「채점이 바뀌었어요」). 묶음(아직 묶지 않은 줄 포함)이 많은 문항부터, 같으면 틀린 학생이 많은 문항, 번호 차례 */
export function missView(t) {
  return missTargets(t).map(it => {
    const s = savedOf(t, it.no), wrong = wrongOf(t, it), stale = !!s && s.sig !== missSig(t, it);
    const groups = s ? s.groups.filter(g => g && Array.isArray(g.nos)) : mergeItem(t, it, null, null).groups;
    const inG = new Set(groups.flatMap(g => g.nos));
    const pending = wrong.map(w => w.no).filter(n => !inG.has(n));
    return { it, no: it.no, n: wrong.length, groups, pending, stale, ai: !!(s && s.ai && !stale), saved: !!s };
  }).sort((a, b) => (b.groups.length + (b.pending.length ? 1 : 0)) - (a.groups.length + (a.pending.length ? 1 : 0)) || b.n - a.n || a.no - b.no);
}

/* 활동 칸 고치기 → 새 miss. 저장 전 문항이면 지금 묶음으로 저장(지금 지문), 저장한 문항이면 지문 그대로(낡은 표시가 남게). 없는 묶음이면 그대로 */
export function setAct(t, no, idx, text) {
  const v = missView(t).find(x => x.no === Number(no)), s = savedOf(t, no);
  if (!v || !v.groups[idx]) return t.miss;
  const groups = v.groups.map((g, i) => (i === Number(idx) ? { ...g, act: clip(text, ACT_MAX), src: 'manual' } : { ...g }));
  const items = { ...((t.miss && t.miss.items && typeof t.miss.items === 'object') ? t.miss.items : {}) };
  items[no] = { groups: groups.map(clean), sig: s ? s.sig : missSig(t, v.it), ai: s ? !!s.ai : false };
  return { at: Date.now(), items };
}

/* ---------- 복사 글 ---------- */
export const missHead = v => `${v.no}번 · ${itemName(v.it)} · 틀린 학생 ${v.n}명${v.stale ? ' · 채점이 바뀌었어요' : ''}`;
export const whyText = g => `${g.why}${g.guess ? ` (짐작: ${g.guess})` : ''}`;
/* 줄: 까닭 · n명 · 번호 · 활동 (아직 묶지 않은 학생도) */
export function missLines(v) {
  return [
    ...v.groups.map(g => [whyText(g), `${g.nos.length}명`, nosText(g.nos), g.act || '']),
    ...(v.pending.length ? [[PENDING, `${v.pending.length}명`, nosText(v.pending), '']] : [])
  ];
}
export function missText(t, view = missView(t)) {
  const out = [`[${makeTitle(t.meta)}] 틀린 까닭`];
  for (const v of view) {
    out.push('', missHead(v));
    for (const [why, n, nos, act] of missLines(v)) out.push(`- ${why} · ${n} · ${nos}${act ? ` · 활동: ${act}` : ''}`);
  }
  if (!view.length) out.push('틀린 학생이 없어요.');
  return out.join('\n');
}
