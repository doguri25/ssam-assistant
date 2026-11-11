/* 기타 › 다면평가 저장 (화면 없음 — Node 시험에서도 씀). 학년도 키 multi(core/years.js 규칙 — 공통 키가 아니어서 학년도·백업을 따라감).
   multi = { view: 'quant'|'qual',
     info: { school, position, name, gradeClass, subject, homeroom, duty, head, from, to, short },   // short: 근무 6개월 이하. 학교·성명은 문서에만(AI로 보내지 않음)
     quant: { criteria, formId, formName, values: { [항목 id]: { v, count, deduct } }, evidence: { [항목 id]: [{ id, fileId, name, label, edited }] }, notes, notesEdited },
     qual: { criteria(null이면 예시 서식), formId, formName, draft, report, filled: { [칸 길]: true } } }
   넣은 기준 양식 원본·근거자료 파일은 IndexedDB forms('multi')(백업 파일에 들어가지 않음) */
import { get, set } from '../../core/store.js';
import { normCriteria, defaultQuant, allItems } from './multi-quant.js';
import { normQualCriteria, defaultQual, normReport } from './multi-qual.js';
import { notesText } from './multi-evidence.js';

export const KEY = 'multi';
export const VIEWS = ['quant', 'qual'];
export const HOMEROOM = ['담임', '비담임'];
export const HEAD = ['보직교사', '비보직'];
const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
const clip = (v, n) => str(v).slice(0, n);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(str(s)) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const objOf = (v, fn) => Object.fromEntries(Object.entries(isObj(v) ? v : {}).map(([k, x]) => [k, fn(x)]).filter(([k, x]) => x !== undefined && /^[\w-]{1,40}$/.test(k)));

export function normInfo(v) {
  const o = isObj(v) ? v : {};
  return {
    school: clip(o.school, 60), position: o.position == null ? '교사' : clip(o.position, 30), name: clip(o.name, 30),
    gradeClass: clip(o.gradeClass, 30), subject: clip(o.subject, 60), homeroom: clip(o.homeroom, 20), duty: clip(o.duty, 80), head: clip(o.head, 20),
    from: isDate(o.from) ? o.from : '', to: isDate(o.to) ? o.to : '', short: !!o.short
  };
}
const normEntry = e => (isObj(e) ? { v: clip(e.v, 20).trim(), count: clip(e.count, 20).trim(), deduct: clip(e.deduct, 20).trim() } : undefined);
const normEvidence = list => {
  const out = arr(list).filter(e => isObj(e) && typeof e.fileId === 'string' && e.fileId)
    .map(e => ({ id: typeof e.id === 'string' && e.id ? e.id : rid('ev'), fileId: e.fileId, name: clip(e.name, 120), label: clip(e.label, 200), edited: !!e.edited })).slice(0, 30);
  return out.length ? out : undefined;
};
export function normMulti(v) {
  const o = isObj(v) ? v : {}, q = isObj(o.quant) ? o.quant : {}, l = isObj(o.qual) ? o.qual : {};
  const qualCriteria = normQualCriteria(l.criteria);
  return {
    view: VIEWS.includes(o.view) ? o.view : 'quant',
    info: normInfo(o.info),
    quant: {
      criteria: normCriteria(q.criteria) || defaultQuant(), formId: clip(q.formId, 60), formName: clip(q.formName, 120),
      values: objOf(q.values, normEntry), evidence: objOf(q.evidence, normEvidence),
      notes: objOf(q.notes, x => (typeof x === 'string' ? x.slice(0, 2000) : undefined)), notesEdited: objOf(q.notesEdited, x => (x === true ? true : undefined))
    },
    qual: {
      criteria: qualCriteria, formId: clip(l.formId, 60), formName: clip(l.formName, 120), draft: clip(l.draft, 20000),
      report: isObj(l.report) ? normReport(l.report, qualCriteria || defaultQual()) : null, filled: normFilled(l.filled)
    }
  };
}
/* 선생님이 고친 칸 길(basics.담당 과목 · sections.learn.추진 목표 · self.노력도) */
const normFilled = v => Object.fromEntries(Object.entries(isObj(v) ? v : {}).filter(([k, x]) => x === true && /^(?:basics|sections|self)\./.test(k) && k.length <= 80).slice(0, 200));
export const getMulti = () => normMulti(get(KEY, null));
/* 저장하지 못하면(저장 공간이 꽉 참) null */
export const saveMulti = m => (set(KEY, m) ? m : null);
export const qualParsed = m => (m && m.qual && m.qual.criteria) || defaultQual();

/* 기준을 바꿈: 같은 이름(빈칸 무시) 항목의 값·근거자료·비고는 새 항목으로 옮기고, 옮길 곳이 없는 근거자료는 dropped(파일을 지울 수 있게) */
export function remapQuant(quant, criteria) {
  const key = n => str(n).replace(/\s/g, '');
  const oldBy = new Map(allItems(quant.criteria).map(i => [key(i.name), i.id]));
  const out = { ...quant, criteria, values: {}, evidence: {}, notes: {}, notesEdited: {} };
  const moved = new Set();
  for (const it of allItems(criteria)) {
    const o = oldBy.get(key(it.name));
    if (!o || moved.has(o)) continue;
    moved.add(o);
    for (const k of ['values', 'evidence', 'notes', 'notesEdited']) if (quant[k] && quant[k][o] !== undefined) out[k][it.id] = quant[k][o];
  }
  const dropped = Object.entries(quant.evidence || {}).filter(([id]) => !moved.has(id)).flatMap(([, list]) => arr(list));
  return { quant: out, dropped };
}
/* 근거자료가 바뀌면 비고 칸을 라벨 줄로(선생님이 고친 비고는 그대로) */
export function syncNotes(quant, itemId) {
  if (quant.notesEdited[itemId]) return quant;
  const t = notesText(quant.evidence[itemId]);
  if (t) quant.notes[itemId] = t; else delete quant.notes[itemId];
  return quant;
}

/* ---------- 평가 기간 ---------- */
const parts = d => [+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10)];
const febEnd = y => (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28);
const range = (info, year) => {
  const i = info || {};
  if (isDate(i.from) && isDate(i.to)) return [parts(i.from), parts(i.to)];
  const y = +year || new Date().getFullYear();
  return [[y, 3, 1], [y + 1, 2, febEnd(y + 1)]];
};
/* 「2025. 3. 1. ~ 2026. 2. 28.」: 내 정보의 평가 기간 → 기준 양식의 글 → 학년도 */
export function periodText(info, criteria, year) {
  const i = info || {};
  if (!(isDate(i.from) && isDate(i.to)) && criteria && str(criteria.period).trim()) return str(criteria.period).trim();
  return range(i, year).map(([y, m, d]) => `${y}. ${m}. ${d}.`).join(' ~ ');
}
/* 「2025년 3월 1일부터 2026년 2월 28일까지」(자기실적평가서) */
export const periodLong = (info, year) => { const [[a, b, c], [d, e, f]] = range(info, year); return `${a}년 ${b}월 ${c}일부터 ${d}년 ${e}월 ${f}일까지`; };
