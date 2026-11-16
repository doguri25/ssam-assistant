/* 문항·활동지 만들기의 범위 (스펙 2026-11-15-docedit-minutes-quiz §3, 화면 없음 — Node 시험에서도 씀).
   진도표 교과(class-model listSubjects 모양 — 읽기만)의 단원 묶기, 기본 차시(진도표의 다음 차시), AI에 보낼 범위 줄, 평가 정보(단원 번호·이름·차시·쪽),
   진도표가 없을 때 선생님이 쓴 「단원·성취기준·범위」, 유형·종류 나누기, 수준 글. 학생 자료는 다루지 않음 */

export const LEVELS = [['basic', '기본'], ['normal', '보통'], ['hard', '도전']];
const LEVEL_TEXT = {
  basic: '기본 — 교과서의 핵심 낱말·개념을 바로 묻는 쉬운 문항',
  normal: '보통 — 교과서 수준. 개념을 이해했는지와 간단한 적용을 묻는 문항',
  hard: '도전 — 배운 것을 새 상황에 적용하거나 까닭을 따지는 문항을 섞음(교과서 범위 안)'
};
export const levelLine = level => LEVEL_TEXT[level] || LEVEL_TEXT.normal;

/* 수 칸 값 → lo~hi 정수(반올림), 비었거나 수가 아니면 d */
export function clampInt(v, lo, hi, d) {
  const s = String(v == null ? '' : v).trim(), n = Number(s);
  if (!s || !Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/* 진도표 교과의 단원 묶음: 단원 이름이 같은 차시를 처음 나온 차례로 → [{ name, idx: [차시 자리] }] */
export function unitsOf(sub) {
  const out = [], at = new Map();
  ((sub && sub.lessons) || []).forEach((l, i) => {
    const name = String((l && l.unit) || '').trim();
    if (!at.has(name)) { at.set(name, out.length); out.push({ name, idx: [] }); }
    out[at.get(name)].idx.push(i);
  });
  return out;
}
const unitOfIdx = (sub, i) => unitsOf(sub).find(g => g.idx.includes(i)) || null;

/* 기본 차시: 진도표의 다음 차시(next: 아직 안 한 첫 차시 자리). 다 했으면 마지막 단원의 첫 차시,
   다음 차시를 모르면 진도표대로라면 지금 할 차시(expected)의 단원 첫 차시, 그것도 모르면 첫 차시 */
export function defaultPick(sub, { next = null, expected = null } = {}) {
  const n = ((sub && sub.lessons) || []).length;
  if (!n) return [];
  if (Number.isInteger(next) && next >= 0 && next < n) return [next];
  const at = Number.isInteger(next) && next >= n ? n - 1 : Number.isInteger(expected) && expected >= 0 ? Math.min(expected, n - 1) : 0;
  const g = unitOfIdx(sub, at);
  return [g ? g.idx[0] : 0];
}

/* 「3. 동물의 생활」·「3단원 동물의 생활」·「(3) …」 → { unitNo, unitName } (번호가 없으면 unitNo null) */
export function parseUnit(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  // 번호 뒤에 「.」·「)」·「단원」이 있어야 단원 번호(「3학년 …」은 아님)
  const m = /^(?:\(\s*(\d{1,2})\s*\)|(\d{1,2})\s*(?:단원\s*[.:]?|[.)]))\s*(\S.*)$/.exec(s);
  if (m && (m[1] || m[2])) return { unitNo: Number(m[1] || m[2]), unitName: m[3].trim() };
  return { unitNo: null, unitName: s };
}

/* 단원 안 차시 「5/14」: 진도표 차시 칸, 없으면 같은 단원 묶음 안 차례 */
export function lessonNo(sub, i) {
  const l = sub && sub.lessons && sub.lessons[i];
  if (!l) return '';
  if (/^\d+\/\d+$/.test(String(l.no || ''))) return l.no;
  const g = unitOfIdx(sub, i);
  return g ? `${g.idx.indexOf(i) + 1}/${g.idx.length}` : '';
}
const withPage = p => { const s = String(p || '').trim(); return !s ? '' : /쪽$/.test(s) ? s : `${s}쪽`; };
const uniq = a => [...new Set(a.filter(Boolean))];

/* 고른 차시(자리) → 범위: { subject, unit, unitNo, unitName, lesson(「1/3, 2/3」·「단원 전체」), pages, lines(AI에 보낼 줄) } */
export function scopeOf(sub, idx) {
  const lessons = (sub && sub.lessons) || [];
  const pick = uniq([...(idx || [])].map(Number).filter(i => Number.isInteger(i) && lessons[i]).map(String)).map(Number).sort((a, b) => a - b);
  const units = uniq(pick.map(i => String(lessons[i].unit || '').trim()));
  const one = units.length === 1 ? parseUnit(units[0]) : { unitNo: null, unitName: units.map(u => parseUnit(u).unitName).join(' · ') };
  const g = units.length === 1 ? unitsOf(sub).find(x => x.name === units[0]) : null;
  const whole = !!g && g.idx.length > 1 && g.idx.every(i => pick.includes(i));
  return {
    subject: (sub && sub.name) || '', unit: units.join(' · '), unitNo: one.unitNo, unitName: one.unitName,
    lesson: whole ? '단원 전체' : pick.map(i => lessonNo(sub, i)).filter(Boolean).join(', '),
    pages: uniq(pick.map(i => withPage(lessons[i].pages))).join(', '),
    lines: pick.map(i => { const l = lessons[i], p = withPage(l.pages); return `${[l.unit, `${lessonNo(sub, i)}차시 ${l.title}`].filter(Boolean).join(' · ')}${p ? ` (교과서 ${p})` : ''}`; })
  };
}

/* 진도표가 없을 때 선생님이 쓴 범위: 줄마다 보냄. 첫 줄이 「3. 단원 이름」 꼴이면 단원 번호·이름으로 */
export function freeScope(subject, text) {
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => l.slice(0, 200)).slice(0, 20);
  const u = lines[0] ? parseUnit(lines[0]) : { unitNo: null, unitName: '' };
  const numbered = u.unitNo != null && u.unitName.length <= 30;
  return { subject: String(subject || '').trim(), unit: numbered ? lines[0] : '', unitNo: numbered ? u.unitNo : null, unitName: numbered ? u.unitName : '', lesson: '', pages: '', lines };
}

/* 직접 쓴 범위를 가려 보냈으면(core/redact.js) AI가 만든 문항의 글·글 목록에 남은 자리 표시를 원래 값으로 (back이 없으면 그대로) */
export function unmaskItem(back, it) {
  if (typeof back !== 'function' || !it) return it;
  const one = v => (typeof v === 'string' ? back(v) : Array.isArray(v) ? v.map(one) : v);
  return Object.fromEntries(Object.entries(it).map(([k, v]) => [k, one(v)]));
}

/* AI로 다시 보내는 문항 글(keys 칸)을 범위의 가리개(scope.mask — make-pick pickValue)로 가림: 처음 만들 때 되돌려 받은 이름·선생님이 써 넣은 이름도 가려 보냄 */
export function maskList(scope, list, keys) {
  if (!scope || typeof scope.mask !== 'function' || !Array.isArray(list)) return list;
  return list.map(x => (x && typeof x === 'object' ? { ...x, ...Object.fromEntries(keys.filter(k => typeof x[k] === 'string').map(k => [k, scope.mask(x[k])])) } : x));
}

/* ---------- 만든 평가·활동지가 AI로 보낼 이름 ----------
   직접 쓴 범위의 교직원 이름·전화번호·이메일은 만들 때 한 번 가려 보내고(make-pick), 돌아온 단원·활동 이름은 원래 이름으로 되돌려
   선생님이 보는 곳(화면 제목·문서·파일 이름)에 씀. 그 이름을 나중에 채점·검토·피드백·평어 AI로 보낼 때는 만들 때 보낸 가린 글을 씀.
   made.ai: { 칸: [보이는 값, AI로 보낼 값] }. 문항·정답표·학생 답은 다시 가리지 않음(김구·세종대왕 같은 배움 내용 이름이 그대로 가야 채점됨) */
/* 보이는 값(meta)과 AI로 보낼 값(sent: { 칸: 가린 글 })이 다른 칸만 → made.ai, 없으면 null */
export function aiPairs(meta, sent) {
  const out = {};
  for (const [k, v] of Object.entries(sent || {})) {
    const shown = meta && typeof meta[k] === 'string' ? meta[k] : '';
    if (shown && typeof v === 'string' && v && v !== shown) out[k] = [shown, v];
  }
  return Object.keys(out).length ? out : null;
}
const pairsOf = x => {
  const p = x && x.made && x.made.ai;
  return p && typeof p === 'object' ? Object.entries(p).filter(([, v]) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0] && v[1]) : [];
};
/* AI로 보낼 평가·활동지 정보: 보이는 값이 만들 때 그대로인 칸만 가린 글로(선생님이 고쳐 쓴 칸은 고친 글 그대로) */
export function aiMeta(x) {
  const m = (x && x.meta) || {}, ps = pairsOf(x).filter(([k, [shown]]) => m[k] === shown);
  return ps.length ? { ...m, ...Object.fromEntries(ps.map(([k, [, sent]]) => [k, sent])) } : m;
}
/* AI로 보낼 문제지 글·활동지 글: 만들 때 넣은 머리(첫 빈 줄 앞 — 제목·교과·단원 줄)의 보이는 이름만 가린 글로. 문항 글은 그대로 */
export function aiText(x, text) {
  const s = String(text == null ? '' : text), ps = pairsOf(x);
  if (!ps.length) return s;
  const cut = s.indexOf('\n\n'), head = cut < 0 ? s : s.slice(0, cut), rest = cut < 0 ? '' : s.slice(cut);
  return ps.map(([, p]) => p).sort((a, b) => b[0].length - a[0].length).reduce((h, [shown, sent]) => h.split(shown).join(sent), head) + rest;
}

/* count를 고른 것(keys)에 비율(weights)대로 나눔: 남는 수는 큰 나머지부터(같으면 앞 것), 문항 수가 되면 고른 것마다 적어도 하나 */
export function spread(count, keys, weights = {}) {
  const ks = [...new Set(keys)].filter(Boolean);
  if (!ks.length) return {};
  const n = Math.max(0, count | 0), w = ks.map(k => Math.max(0, Number(weights[k]) || 1)), W = w.reduce((a, b) => a + b, 0);
  const raw = w.map(x => n * x / W), out = raw.map(Math.floor);
  let rem = n - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rem > 0) { out[i]++; rem--; } });
  if (n >= ks.length) {
    for (let i = 0; i < ks.length; i++) {
      if (out[i]) continue;
      const big = out.indexOf(Math.max(...out));
      out[big]--; out[i]++;
    }
  }
  return Object.fromEntries(ks.map((k, i) => [k, out[i]]));
}
