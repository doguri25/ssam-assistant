/* 기타 › 다면평가 정성평가 — 교사 자기실적평가서 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-11-11-multi-eval-design.md
   기준(parseQualText): 정성 기준 표(평가사항 · 평가요소(n점) · 평가지표 1) 2) …) + 자기실적평가서(기초 자료 칸 이름, 영역 가.~라.와 칸 ◦ 추진 목표…).
   넣은 양식에 적힌 기초 자료 값은 남의 작성 예시라 칸 이름만 읽음. 못 읽은 부분은 DEFAULT_QUAL(별지 제3호의2 서식 꼴).
   보고서 report = { basics: { 칸: 값 }, sections: [{ key, name, parts: [{ name, items }] }], self: { 목표달성도…: 만족|보통|미흡|'' }, missing: [{ path, label, hint }] }
   칸 길(path): 'basics.칸 이름' · 'sections.영역 key.칸 이름' · 'self.이름' */
import { allItems, tierOf, toNum } from './multi-quant.js';

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
const tidy = s => str(s).replace(/[ \t]/g, ' ').replace(/\s+/g, ' ').trim();
const flat = s => str(s).replace(/\s/g, '');
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
const clone = o => JSON.parse(JSON.stringify(o));
/* 받침이 있으면 「을」, 없으면 「를」 */
const eul = w => { const c = str(w).trim().slice(-1).charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '을' : '를'; };

export const SELF_LEVELS = ['만족', '보통', '미흡'];
export const DEFAULT_QUAL = deepFreeze({
  criteria: [
    { area: '1. 근무수행태도', element: '교육공무원으로서의 태도', max: 10, indicators: ['교육자로서 품성을 갖추고 직무에 충실한가?', '공직자로서 사명감과 책임감을 갖고 솔선수범하는가?'] },
    { area: '2. 근무실적 및 근무수행능력', element: '가. 학습지도', max: 40, indicators: ['수업 교재 연구를 충실히 하는가?', '학생 수준에 맞는 수업 계획을 세우는가?', '수업 방법 개선에 힘쓰는가?', '평가를 공정하게 하고 결과를 지도에 활용하는가?'] },
    { area: '2. 근무실적 및 근무수행능력', element: '나. 생활지도', max: 30, indicators: ['학생 개개인의 특성을 알려고 노력하는가?', '학생 상담과 생활지도를 꾸준히 하는가?', '학부모와 꾸준히 소통하는가?'] },
    { area: '2. 근무실적 및 근무수행능력', element: '다. 전문성개발', max: 5, indicators: ['전문성을 높이기 위한 연수·연구 활동에 적극적인가?'] },
    { area: '2. 근무실적 및 근무수행능력', element: '라. 담당업무', max: 15, indicators: ['맡은 업무를 정확하고 합리적으로 처리하는가?', '업무 개선에 힘쓰는가?'] }
  ],
  basics: ['담당 학년 및 학급', '담당 과목', '담임 여부', '담당 업무', '보직교사 여부', '주당 수업시간 수', '연간 수업공개 실적', '연간 학생 상담 실적', '연간 학부모 상담 실적', '그 밖의 실적사항'],
  sections: [
    { key: 'learn', name: '학습지도', parts: ['추진 목표', '추진 실적'] }, { key: 'life', name: '생활지도', parts: ['추진 목표', '추진 실적'] },
    { key: 'pro', name: '전문성개발', parts: ['추진 목표', '추진 실적'] }, { key: 'duty', name: '담당 업무', parts: ['추진 목표', '추진 실적', '창의적 업무개선 사항'] }],
  self: [{ name: '목표달성도', desc: '설정한 목표에 대한 달성 정도' }, { name: '창의성', desc: '업무 개선을 위한 창의적 노력 정도' },
    { name: '적시성', desc: '계획한 때에 맞춘 업무 처리 정도' }, { name: '노력도', desc: '목표 달성을 위한 노력, 공헌도' }],
  guide: '근무성적평정의 신뢰성과 타당성이 보장되도록 객관적 근거에 따라 종합적으로 평가하여야 한다.'
});
export const defaultQual = () => ({ ...clone(DEFAULT_QUAL), read: { criteria: false, basics: false, sections: false } });

const KEYS = [['learn', /학습|수업/], ['life', /생활/], ['pro', /전문성|연수|연구/], ['duty', /업무/]];
function keyOf(name, used) {
  let k = (KEYS.find(([, re]) => re.test(name)) || [''])[0];
  if (!k || used.has(k)) { let i = used.size + 1; while (used.has(`s${i}`)) i++; k = `s${i}`; }
  used.add(k);
  return k;
}
const spaced = w => new RegExp('^' + [...flat(w)].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*') + '\\s*');

/* ---------- 기준 양식 글 읽기 ---------- */
const ELEMENT = /^(.*?)\s*\(\s*(\d+(?:\.\d+)?)\s*점\s*\)\s*$/;
function readCriteria(t) {
  const out = [];
  let area = '', cur = null;
  for (const line of t.split('\n')) {
    for (const cell of line.split('|').map(tidy).filter(Boolean)) {
      const em = ELEMENT.exec(cell);
      if (em && em[1]) { cur = { area, element: tidy(em[1]), max: +em[2], indicators: [] }; out.push(cur); continue; }
      if (/^\d+\s*\.\s*\S/.test(cell)) { area = cell; continue; }
      if (/^\d+\s*\)/.test(cell) && cur) for (const x of cell.split(/(?:^|\s)\d+\s*\)\s*/).map(tidy).filter(Boolean)) cur.indicators.push(x.slice(0, 200));
    }
  }
  return out.filter(c => c.indicators.length).slice(0, 20);
}
function readBasics(t) {
  const a = t.search(/기초\s*자료/);
  if (a < 0) return [];
  const rest = t.slice(a), b = rest.search(/5\s*\.\s*자기\s*실적/);
  const part = b > 0 ? rest.slice(0, b) : rest.slice(0, 2000);
  const names = [...part.matchAll(/[○◦]\s*([^○◦：:|\n]+?)\s*[：:]/g)].map(m => tidy(m[1])).filter(n => n && n.length <= 30);
  return [...new Set(names)].slice(0, 20);
}
function readSections(t) {
  const a = /5\s*\.\s*자기\s*실적\s*평가/.exec(t);
  if (!a) return [];
  let s = t.slice(a.index + a[0].length);
  const end = s.search(/※\s*자기\s*평가|자기\s*평가\s*종합/);
  if (end >= 0) s = s.slice(0, end);
  s = ' ' + s.replace(/\s+/g, ' ');
  const heads = [...s.matchAll(/\s([가나다라마바사])\s*\.\s+/g)];
  const used = new Set(), out = [];
  heads.forEach((h, i) => {
    const chunk = s.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : s.length);
    const [nm, ...pieces] = chunk.split(/[◦○]/);
    const name = tidy(nm).replace(/[\s…\-]+$/, '');
    if (!name || name.length > 20) return;
    const re = spaced(name);
    const parts = [...new Set(pieces.map(p => tidy(tidy(p).split(/\s+-\s*|\s*-\s+|…/)[0]).replace(re, '').trim()).filter(p => p && p.length <= 30 && !/^[…\-]+$/.test(p)))];
    out.push({ key: keyOf(name, used), name, parts: parts.length ? parts : ['추진 목표', '추진 실적'] });
  });
  return out.slice(0, 8);
}
function readSelf(t) {
  const a = t.search(/자기\s*평가\s*종합/);
  const s = a >= 0 ? t.slice(a).replace(/\s+/g, ' ') : '';
  const names = DEFAULT_QUAL.self.map(x => x.name);
  return DEFAULT_QUAL.self.map(({ name, desc }) => {
    if (!s) return { name, desc };
    const m = new RegExp([...name].join('\\s*') + '\\s+(.+?)\\s*(?=○|' + names.filter(n => n !== name).map(n => [...n].join('\\s*')).join('|') + '|\\d{4}\\s*년|$)').exec(s);
    const d = m ? tidy(m[1]) : '';
    return { name, desc: d && !/^[…\s.]+$/.test(d) && d.length <= 60 ? d : desc };
  });
}
/* 정성 기준 + 자기실적평가서 글 → { criteria, basics, sections, self, guide, read: { criteria, basics, sections } } (못 읽은 것은 예시 서식) */
export function parseQualText(text) {
  const t = str(text).replace(/\r\n?/g, '\n');
  const cut = [t.search(/자기\s*실적\s*평가서/), t.search(/별지\s*제\s*\d/), t.search(/평가자\s*(?:인적|기초)/)].filter(i => i >= 0);
  const at = cut.length ? Math.min(...cut) : t.length;
  const criteria = readCriteria(t.slice(0, at)), basics = readBasics(t), sections = readSections(t);
  const g = /평가\s*지침\s*[:：]?\s*(.+?)(?=\s*\d\s*\.\s*평가\s*기간|\n|$)/.exec(t);
  const d = DEFAULT_QUAL;
  return {
    criteria: criteria.length ? criteria : clone(d.criteria), basics: basics.length ? basics : [...d.basics], sections: sections.length ? sections : clone(d.sections),
    self: readSelf(t), guide: g && tidy(g[1]).length > 5 ? tidy(g[1]).slice(0, 300) : d.guide,
    read: { criteria: !!criteria.length, basics: !!basics.length, sections: !!sections.length }
  };
}
/* 저장한 기준·AI 답 → 같은 모양(모자란 것은 예시 서식), 못 쓰면 null */
export function normQualCriteria(v) {
  if (!isObj(v)) return null;
  const d = DEFAULT_QUAL, used = new Set();
  const criteria = arr(v.criteria).filter(isObj).map(c => ({ area: tidy(c.area).slice(0, 60), element: tidy(c.element).slice(0, 60), max: toNum(c.max), indicators: arr(c.indicators).filter(x => typeof x === 'string').map(tidy).filter(Boolean).slice(0, 12) }))
    .filter(c => c.element).slice(0, 20);
  const basics = [...new Set(arr(v.basics).filter(x => typeof x === 'string').map(tidy).filter(x => x && x.length <= 30))].slice(0, 20);
  const sections = arr(v.sections).filter(isObj).map(s => {
    const name = tidy(s.name).slice(0, 20);
    if (!name) return null;
    const parts = [...new Set(arr(s.parts).map(p => tidy(isObj(p) ? p.name : p)).filter(p => p && p.length <= 30))].slice(0, 6);
    const k = typeof s.key === 'string' && /^\w{1,12}$/.test(s.key) && !used.has(s.key) ? (used.add(s.key), s.key) : keyOf(name, used);
    return { key: k, name, parts: parts.length ? parts : ['추진 목표', '추진 실적'] };
  }).filter(Boolean).slice(0, 8);
  if (!criteria.length && !basics.length && !sections.length) return null;
  const self = arr(v.self).filter(isObj).map(s => ({ name: tidy(s.name).slice(0, 12), desc: tidy(s.desc).slice(0, 60) })).filter(s => s.name);
  return {
    criteria: criteria.length ? criteria : clone(d.criteria), basics: basics.length ? basics : [...d.basics], sections: sections.length ? sections : clone(d.sections),
    self: self.length ? self.slice(0, 6) : clone(d.self), guide: tidy(v.guide).slice(0, 300) || d.guide,
    read: { criteria: !!criteria.length, basics: !!basics.length, sections: !!sections.length }
  };
}

/* ---------- 정량·내 정보에서 아는 것 ---------- */
/* 정량 값 → { hours(주당 수업시수), open(수업 공개 n회), counsel(학생·학부모 상담 n건), counselStudent, counselParent, training(연수 n시간), duty(업무 곤란도 고른 지표) } */
export function quantFacts(criteria, values = {}) {
  const f = { hours: '', open: '', counsel: '', counselStudent: '', counselParent: '', training: '', duty: '' };
  const v = it => (isObj(values[it.id]) ? values[it.id] : {});
  const n = x => { const k = toNum(x); return k == null ? '' : String(k); };
  for (const it of allItems(criteria)) {
    const name = it.name, labels = it.tiers.map(t => t.label).join(' ');
    if (!f.hours && it.kind === 'range' && /수업\s*시(?:수|간)/.test(name)) f.hours = n(v(it).v);
    else if (!f.open && it.kind === 'count' && /수업\s*공개|공개\s*수업/.test(name + ' ' + labels)) { const c = n(v(it).count); f.open = c ? `${c}회` : ''; }
    else if (it.kind === 'range' && /상담/.test(name)) {
      const c = n(v(it).v), w = c ? `${c}${it.unit || '건'}` : '';
      if (/학생/.test(name) && /학부모/.test(name)) f.counsel = f.counsel || w;
      else if (/학부모/.test(name)) f.counselParent = f.counselParent || w;
      else f.counselStudent = f.counselStudent || w;
    } else if (!f.training && it.kind === 'range' && /연수/.test(name)) { const c = n(v(it).v); f.training = c ? `${c}${it.unit || '시간'}` : ''; }
    else if (!f.duty && it.kind === 'choice' && /업무\s*곤란|보직/.test(name)) { const t = tierOf(it, v(it).v); f.duty = t ? t.tier.label : ''; }
  }
  return f;
}
const BASIC_FROM = [
  [/보직/, (i, f) => i.head], [/담임/, (i, f) => i.homeroom], [/학년|학급/, (i, f) => i.gradeClass], [/과목/, (i, f) => i.subject],
  [/수업\s*시(?:간|수)/, (i, f) => f.hours], [/수업\s*공개|공개\s*수업/, (i, f) => f.open], [/학부모.*상담/, (i, f) => f.counselParent], [/학생.*상담|상담/, (i, f) => f.counselStudent],
  [/업무/, (i, f) => i.duty]];
/* 기초 자료 칸마다 내 정보·정량 값 → { 칸: 값|'' } */
export function prefillBasics(parsed, info = {}, facts = {}) {
  const p = parsed || DEFAULT_QUAL, i = info || {}, f = facts || {};
  return Object.fromEntries(p.basics.map(b => { const r = BASIC_FROM.find(([re]) => re.test(b)); return [b, r ? tidy(r[1](i, f)) : '']; }));
}
const BASIC_HINT = [
  [/학년|학급/, '담당 학년과 반을 적어 주세요. 예) 3-1'], [/과목/, '담당 과목을 적어 주세요. 예) 담임(전 과목), 영어 전담'], [/보직/, '보직교사인지 적어 주세요. 예) 보직교사, 비보직'],
  [/담임/, '담임인지 적어 주세요. 예) 담임, 비담임'], [/수업\s*시(?:간|수)/, '주당 수업 시간 수를 적어 주세요. 예) 22'], [/수업\s*공개|공개\s*수업/, '올해 수업 공개 횟수를 적어 주세요. 예) 2회'],
  [/학부모.*상담/, '올해 학부모 상담 건수를 적어 주세요. 예) 12건'], [/학생.*상담|상담/, '올해 학생 상담 건수를 적어 주세요. 예) 25건'], [/업무/, '맡은 업무를 적어 주세요. 예) 정보부장'],
  [/그\s*밖|기타/, '그 밖의 실적(대회 지도·표창 등)을 적어 주세요. 없으면 「없음」']];
function basicHint(field, facts = {}) {
  const h = (BASIC_HINT.find(([re]) => re.test(field)) || [, `「${field}」${eul(field)} 적어 주세요.`])[1];
  return /상담/.test(field) && facts.counsel ? `${h.replace(/\.?\s*예\).*$/, '')}(정량평가에 적은 학생·학부모 상담 ${facts.counsel} 가운데).` : h;
}
const partHint = (sec, part) => (/목표/.test(part) ? `올해 ${sec.name}에서 세운 ${part}${eul(part)} 한두 줄로 적어 주세요.`
  : /개선/.test(part) ? `${sec.name}에서 새로 바꾸거나 줄인 것(${part})을 적어 주세요. 없으면 「없음」.` : `${sec.name}에서 한 일(${part})을 횟수·건수와 함께 적어 주세요.`);

/* ---------- 줄글 → 칸 (AI가 없을 때: 낱말로) ---------- */
const AREA_WORDS = {
  learn: ['코스웨어', '수업', '학습', '교과', '교재'],
  life: ['학교폭력', '상담', '생활', '인성', '안전'],
  pro: ['전문적학습공동체', '학습공동체', '연구회', '공동체', '연수', '자격'],
  duty: ['업무', '부장', '담당', '운영']
};
const sectionWords = sec => AREA_WORDS[sec.key] || [flat(sec.name)];
const GOAL = /목표|계획|하고자|하려고|할\s*것|겠/;
const BETTER = /개선|새로|새롭게|처음|바꾸|바꿨|바꿈|줄였|줄임|간소|효율/;
/* 줄글을 문장으로: 줄바꿈·문장 끝(한글 뒤 . ! ?)마다, 앞의 •·-·1) 와 끝의 마침표는 뺌 */
export const sentences = draft => str(draft).replace(/\r\n?/g, '\n').split(/\n+|(?<=[가-힣][.!?])\s+/)
  .map(s => tidy(s).replace(/^(?:[-•·*▪◦○]+|\d{1,2}[.)](?=\s))\s*/, '').replace(/[.。!]+$/, '').trim()).filter(s => s.length >= 2);
function scoreOf(sentence, secs) {
  let s = flat(sentence);
  const all = secs.flatMap(sec => sectionWords(sec).map(w => [sec.key, flat(w)])).sort((a, b) => b[1].length - a[1].length);
  const hits = {};
  // 긴 낱말(학습공동체·학교폭력·코스웨어)이 먼저, 더 무겁게: 「전문적 학습공동체에서 수업 나눔」은 전문성개발
  for (const [k, w] of all) { const n = s.split(w).length - 1; if (n) { hits[k] = (hits[k] || 0) + n * (w.length >= 4 ? 2 : 1); s = s.split(w).join(' '); } }
  let best = '', top = 0;
  for (const sec of secs) if ((hits[sec.key] || 0) > top) { top = hits[sec.key]; best = sec.key; }
  return best;
}
const partFor = (sec, sentence) => {
  const better = sec.parts.find(p => /개선/.test(p)), goal = sec.parts.find(p => /목표/.test(p)), done = sec.parts.find(p => /실적/.test(p));
  if (better && BETTER.test(sentence)) return better;
  if (goal && GOAL.test(sentence)) return goal;
  return done || sec.parts.find(p => p !== goal && p !== better) || sec.parts[0];
};
/* 줄글 → 영역별 칸 [{ key, name, parts: [{ name, items }] }]. 낱말이 없는 문장은 앞 문장의 영역(개선 말이면 「개선」 칸이 있는 영역) */
export function splitDraft(draft, parsed) {
  const secs = (parsed || DEFAULT_QUAL).sections;
  const out = secs.map(s => ({ key: s.key, name: s.name, parts: s.parts.map(p => ({ name: p, items: [] })) }));
  let prev = '';
  for (const sen of sentences(draft)) {
    let k = scoreOf(sen, secs);
    if (!k && BETTER.test(sen)) k = (secs.find(s => s.parts.some(p => /개선/.test(p))) || {}).key || '';
    k = k || prev || (secs[0] || {}).key;
    const sec = secs.find(s => s.key === k), o = out.find(s => s.key === k);
    if (!sec) continue;
    o.parts.find(p => p.name === partFor(sec, sen)).items.push(sen.slice(0, 300));
    prev = k;
  }
  return out;
}

/* ---------- 보고서 ---------- */
export function getAt(r, path) {
  const [kind, a, ...rest] = str(path).split('.'), b = rest.join('.');
  if (!r) return undefined;
  if (kind === 'basics') return r.basics[[a, b].filter(Boolean).join('.')];
  if (kind === 'self') return r.self[[a, b].filter(Boolean).join('.')];
  if (kind === 'sections') { const s = r.sections.find(x => x.key === a), p = s && s.parts.find(x => x.name === b); return p ? p.items : undefined; }
  return undefined;
}
export function setAt(r, path, value) {
  const [kind, a, ...rest] = str(path).split('.'), b = rest.join('.');
  if (kind === 'basics') r.basics[[a, b].filter(Boolean).join('.')] = str(value);
  else if (kind === 'self') r.self[[a, b].filter(Boolean).join('.')] = SELF_LEVELS.includes(value) ? value : '';
  else if (kind === 'sections') { const s = r.sections.find(x => x.key === a), p = s && s.parts.find(x => x.name === b); if (p) p.items = arr(value).map(str); }
  return r;
}
/* 빈 칸 → missing(칸 이름과 무엇을 적을지). 전에 준 안내(AI·정량 건수)는 그대로 */
export function refreshMissing(r, parsed, facts = {}) {
  const p = parsed || DEFAULT_QUAL, old = Object.fromEntries(arr(r.missing).filter(m => isObj(m) && m.path).map(m => [m.path, m.hint]));
  const out = [];
  for (const b of p.basics) if (!tidy(r.basics[b])) out.push({ path: `basics.${b}`, label: b, hint: old[`basics.${b}`] || basicHint(b, facts) });
  for (const s of r.sections) for (const part of s.parts) if (!part.items.some(x => tidy(x))) {
    const sec = p.sections.find(x => x.key === s.key) || s;
    out.push({ path: `sections.${s.key}.${part.name}`, label: `${s.name} · ${part.name}`, hint: old[`sections.${s.key}.${part.name}`] || partHint(sec, part.name) });
  }
  for (const s of p.self) if (!r.self[s.name]) out.push({ path: `self.${s.name}`, label: `자기 평가 · ${s.name}`, hint: '만족·보통·미흡 가운데 골라 주세요.' });
  r.missing = out;
  return r;
}
export const missingCount = r => (r && Array.isArray(r.missing) ? r.missing.length : 0);
const cleanItem = x => tidy(x).replace(/^(?:[-•·*▪◦○]+)\s*/, '').slice(0, 300);
/* 아무 모양(저장한 것·AI 답) → 지금 기준의 보고서 모양(모르는 칸은 버림, 영역은 key나 이름으로, 칸은 이름으로) + 입력 필요 */
export function normReport(v, parsed, facts = {}) {
  const p = parsed || DEFAULT_QUAL, o = isObj(v) ? v : {};
  const ob = isObj(o.basics) ? o.basics : {}, os = arr(o.sections).filter(isObj), self = isObj(o.self) ? o.self : {};
  const r = {
    basics: Object.fromEntries(p.basics.map(b => [b, typeof ob[b] === 'string' ? tidy(ob[b]).slice(0, 200) : ''])),
    sections: p.sections.map(s => {
      const src = os.find(x => x.key === s.key) || os.find(x => flat(x.name) && flat(x.name) === flat(s.name)) || {};
      const sp = arr(src.parts).filter(isObj);
      return { key: s.key, name: s.name, parts: s.parts.map(name => {
        const q = sp.find(x => flat(x.name) === flat(name));
        return { name, items: q ? arr(q.items).filter(x => typeof x === 'string').map(cleanItem).filter(Boolean).slice(0, 20) : [] };
      }) };
    }),
    self: Object.fromEntries(p.self.map(s => [s.name, SELF_LEVELS.includes(self[s.name]) ? self[s.name] : ''])),
    missing: arr(o.missing).filter(m => isObj(m) && typeof m.path === 'string').map(m => ({ path: m.path, label: tidy(m.label), hint: tidy(m.hint).slice(0, 200) })).filter(m => m.hint)
  };
  return refreshMissing(r, p, facts);
}
/* 규칙으로 만든 보고서(AI가 없을 때 [넣기]): 기초 자료는 내 정보·정량 값, 영역 칸은 줄글을 낱말로 나눔, 자기 평가는 선생님이 고름 */
export function buildReport({ parsed, info, facts, draft } = {}) {
  const p = parsed || DEFAULT_QUAL;
  const r = { basics: prefillBasics(p, info, facts), sections: splitDraft(draft, p), self: Object.fromEntries(p.self.map(s => [s.name, ''])), missing: [] };
  return refreshMissing(r, p, facts || {});
}
/* 다시 넣기: 선생님이 고친 칸(filled)은 keep이면 전 보고서 값 그대로, 아니면 새 값 */
export function mergeReport(prev, next, filled, keep, parsed) {
  const r = clone(next);
  if (keep && prev) for (const path of Object.keys(filled || {})) { const v = getAt(prev, path); if (v !== undefined) setAt(r, path, Array.isArray(v) ? [...v] : v); }
  return refreshMissing(r, parsed);
}
/* 다시 넣으면 바뀌는 고친 칸 길 */
export const changedFilled = (prev, next, filled) => Object.keys(filled || {}).filter(p => JSON.stringify(getAt(prev, p) ?? '') !== JSON.stringify(getAt(next, p) ?? ''));
