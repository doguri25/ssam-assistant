/* 행사계획 자료와 계산 (화면 없음 — Node 시험에서도 씀).
   행사 목록은 ssam:events, 보고 있는 행사는 ssam:event:current. 학사일정 출처는 'event:<id>' */
import { parseOutline } from './classplan-model.js';
import { get, set } from '../../core/store.js';
import { isDate } from '../../core/calendar.js';
import { personalColumn } from '../../core/survey.js';
import { safeText } from '../../core/chat-route.js';
import { normRv } from './plan-rv.js';

const LIST_KEY = 'events', CUR_KEY = 'event:current';

export const KINDS = [['sports', '운동회'], ['arts', '학예회'], ['field', '현장체험학습'], ['other', '기타']];
// 역할 분담표는 뺐음(참여 교직원 이름을 AI로 보내지 않게 — 선생님 요청 2026-11-10)
export const DOCS = [['plan', '계획서'], ['safety', '안전 점검표'], ['letter', '가정통신문']];
export const REF_KINDS = [['upper', '상위 계획'], ['official', '교육청 공문'], ['other', '기타'], ['last', '작년·기존 계획서']];

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : []);
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s원₩]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const won = n => Number(n).toLocaleString('ko-KR');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const step = n => (Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1);

export function newEvent() {
  return {
    id: 'ev' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    kind: 'sports', name: '', purpose: '', grades: '', date: '', place: '', outdoor: false, budget: '',
    lastSurvey: '', options: null, picked: null,
    docs: { plan: '', safety: '', letter: '', rain: '', done: false }, rv: [],
    refs: [], refNotes: { options: [], docs: [] },
    survey: null, status: 'draft', step: 1, maxStep: 1, updatedAt: 0
  };
}

export function normOptions(v) {
  return (Array.isArray(v) ? v : []).filter(isObj).map(o => ({
    label: str(o.label).trim() || '안',
    summary: str(o.summary).trim(),
    timetable: (Array.isArray(o.timetable) ? o.timetable : []).filter(t => isObj(t) && str(t.activity).trim())
      .map(t => ({ time: str(t.time).trim(), activity: str(t.activity).trim(), place: str(t.place).trim() })),
    pros: strs(o.pros),
    staffNeed: str(o.staffNeed).trim(),
    budget: (Array.isArray(o.budget) ? o.budget : []).filter(b => isObj(b) && str(b.name).trim()).map(b => ({ name: str(b.name).trim(), amount: num(b.amount) }))
  })).filter(o => o.timetable.length).slice(0, 3);
}

export function normItems(v) {
  return (Array.isArray(v) ? v : []).filter(i => isObj(i) && str(i.q).trim())
    .map(i => ({ type: i.type === 'scale' ? 'scale' : 'text', q: str(i.q).trim() }));
}

/* 참고 자료(상위 계획·교육청 공문 등): 10개까지, 글은 앞에서부터 합쳐 6만 자까지 (원본 파일은 저장하지 않음) */
const REF_MAX = 10, REF_TOTAL = 60000;
export function normRefs(v) {
  let left = REF_TOTAL;
  return (Array.isArray(v) ? v : []).filter(isObj)
    .map((r, i) => ({ id: str(r.id) || 'ref' + i, kind: REF_KINDS.some(k => k[0] === r.kind) ? r.kind : 'other', name: str(r.name).trim().slice(0, 100) || '참고 자료', text: str(r.text) }))
    .filter(r => r.text.trim()).slice(0, REF_MAX)
    .map(r => { const text = r.text.slice(0, Math.max(0, left)); left -= text.length; return { ...r, text }; })
    .filter(r => r.text.trim());
}
export const guessKind = name => (/작년|전년|지난\s*해|기존/.test(name) ? 'last' : /공문|교육청|교육지원청|교육부/.test(name) ? 'official' : /계획/.test(name) ? 'upper' : 'other');
/* 참고 자료 「작년·기존 계획서」가 있으면 계획서(plan)가 그 목차(큰 제목의 차례·이름·번호 꼴)와 짜임·문체를 그대로 따르게 하는 규칙 줄. 없으면 '' (기본 차례) */
const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';
export function planOutlineRule(refs) {
  const last = (refs || []).find(r => r && r.kind === 'last' && String(r.text || '').trim());
  if (!last) return '';
  const top = parseOutline(last.text).filter(x => x.level === 1).slice(0, 12);
  if (top.length < 3) return '- plan: 「작년·기존 계획서」의 짜임·문체(「가.」「1)」 목록)를 따라 올해 행사 내용으로 씀\n';
  const roman = /^\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.\s*\S/m.test(last.text);
  return `- plan: 「작년·기존 계획서」의 목차를 그대로 따름(이 제목·차례·번호 꼴): ${top.map((x, i) => `${roman ? (ROMAN[i] || i + 1) : i + 1}. ${x.title}`).join(' / ')}. 각 제목 아래는 그 계획서 글의 짜임(「가.」「1)」 목록)과 문체로 올해 행사 내용을 씀\n`;
}
const refKindName = k => (REF_KINDS.find(x => x[0] === k) || REF_KINDS[2])[1];
/* AI에 보낼 참고 자료 글: 합쳐 budget자 안에서, 짧은 자료는 다 넣고 긴 자료는 남은 몫까지 */
export function refsBlock(refs, budget = 24000) {
  if (!refs || !refs.length) return '';
  const alloc = new Map();
  let left = budget;
  [...refs].sort((a, b) => a.text.length - b.text.length).forEach((r, i, arr) => {
    const n = Math.min(r.text.length, Math.floor(left / (arr.length - i)));
    alloc.set(r, n); left -= n;
  });
  return refs.map(r => {
    const t = r.text.slice(0, alloc.get(r));
    return `[${refKindName(r.kind)}] ${r.name}\n"""\n${t}${t.length < r.text.length ? '\n…(뒷부분 줄임)' : ''}\n"""`;
  }).join('\n\n');
}
/* AI가 「참고 자료에서 반영한 것」으로 돌려준 짧은 글들 */
export const normRefNotes = v => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0, 200)).slice(0, 8);

/* 설문 CSV를 읽은 결과(core/survey.js summarize)의 서술형 답: 답 속 학생·보호자 이름, 전화번호·전자 우편은 ○○○로
   (이름·연락처 열은 summarize가 이미 뺌). 저장·화면·결과 보고서 AI 모두 이 글을 씀. 이름만 있던 답은 빠지고 개수 count는 그대로 */
export function maskResult(r) {
  if (!isObj(r) || !Array.isArray(r.questions)) return r;
  return { ...r, questions: r.questions.map(q => (isObj(q) && q.type === 'text' && Array.isArray(q.answers)
    ? { ...q, answers: q.answers.map(a => safeText(String(a == null ? '' : a))).filter(Boolean), count: Number.isInteger(q.count) ? q.count : q.answers.length } : q)) };
}

/* 저장된 설문 결과: 읽을 수 있는 문항만, 서술형 답은 300개까지 저장(개수 count는 그대로) */
const MAX_ANSWERS = 300;
function normResult(v) {
  if (!isObj(v) || !Number.isInteger(v.n) || !Array.isArray(v.questions)) return null;
  // 예전 판에서 저장한 개인정보 열은 읽을 때 뺌
  const excluded = (Array.isArray(v.excluded) ? v.excluded : []).filter(x => typeof x === 'string');
  const personal = q => personalColumn(q.q, Array.isArray(q.answers) ? q.answers : []);
  for (const q of v.questions) if (isObj(q) && personal(q)) excluded.push(str(q.q));
  const questions = v.questions.filter(q => isObj(q) && str(q.q).trim() && !personal(q)).map(q => {
    if (q.type === 'scale') {
      const ok = Array.isArray(q.counts) && q.counts.length === 5 && q.counts.every(c => Number.isInteger(c) && c >= 0) && Number.isFinite(q.mean);
      return ok ? { q: str(q.q), type: 'scale', counts: q.counts.slice(), mean: q.mean } : null;
    }
    if (q.type === 'text' && Array.isArray(q.answers)) {
      const answers = q.answers.filter(a => typeof a === 'string');
      return { q: str(q.q), type: 'text', answers: answers.slice(0, MAX_ANSWERS), count: Number.isInteger(q.count) ? q.count : answers.length };
    }
    return null;
  }).filter(Boolean);
  return { n: v.n, questions, few: v.n < 10, excluded };
}

function normSurvey(v) {
  if (!isObj(v)) return null;
  return {
    target: ['student', 'parent', 'staff'].includes(v.target) ? v.target : 'student',
    items: normItems(v.items), formUrl: str(v.formUrl).trim(),
    result: normResult(v.result),
    textSummary: str(v.textSummary), report: str(v.report), nextMemo: str(v.nextMemo)
  };
}

function normEvent(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const e = newEvent();
  e.id = v.id;
  e.kind = KINDS.some(k => k[0] === v.kind) ? v.kind : 'other';
  for (const k of ['name', 'purpose', 'grades', 'place', 'budget', 'lastSurvey']) e[k] = str(v[k]);
  e.date = isDate(v.date) ? v.date : '';
  e.outdoor = v.outdoor === true;
  // 예전에 넣은 참여 교직원(staff)·역할 분담표(docs.roles)는 읽을 때 버림(다시 저장하면 지워짐)
  e.options = v.options == null ? null : normOptions(v.options);
  e.picked = Number.isInteger(v.picked) && e.options && v.picked >= 0 && v.picked < e.options.length ? v.picked : null;
  const d = isObj(v.docs) ? v.docs : {};
  e.docs = { plan: str(d.plan), safety: str(d.safety), letter: str(d.letter), rain: str(d.rain), done: d.done === true };
  e.rv = normRv(v.rv).filter(x => ['plan', 'safety', 'letter', 'rain'].includes(x.section));
  e.refs = normRefs(v.refs);
  const rn = isObj(v.refNotes) ? v.refNotes : {};
  // stale: 반영한 것을 쓴 뒤에 참고 자료를 바꿈 (다시 만들어야 새 자료가 반영됨)
  e.refNotes = { options: normRefNotes(rn.options), docs: normRefNotes(rn.docs), stale: !!rn.stale };
  e.survey = normSurvey(v.survey);
  e.status = v.status === 'final' ? 'final' : 'draft';
  e.step = step(v.step);
  e.maxStep = Math.max(e.step, step(v.maxStep));
  e.updatedAt = Number.isFinite(v.updatedAt) ? v.updatedAt : 0;
  return e;
}

const raw = () => { const v = get(LIST_KEY, []); return Array.isArray(v) ? v : []; };
export const listEventPlans = () => raw().map(normEvent).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
export const getEvent = id => listEventPlans().find(e => e.id === id) || null;
export function saveEvent(ev) {
  const e = normEvent(ev);
  if (!e) return null;
  const list = listEventPlans();
  e.updatedAt = Math.max(Date.now(), ...list.map(x => x.updatedAt + 1));
  // 저장 공간이 모자라면 null (화면이 알림)
  if (!set(LIST_KEY, [e, ...list.filter(x => x.id !== e.id)])) return null;
  return e;
}
export function deleteEvent(id) { set(LIST_KEY, listEventPlans().filter(e => e.id !== id)); }
export const currentEventId = () => { const v = get(CUR_KEY, null); return typeof v === 'string' ? v : null; };
export const setCurrentEvent = id => set(CUR_KEY, id);

/* 가정통신문 필수 항목 (같은 뜻의 말도 인정) */
const NEED = [['날짜', /날짜|일시|일정/], ['준비물', /준비물|챙길\s*것|가져올\s*것/], ['복장', /복장|옷차림/], ['문의처', /문의|연락처/]];
export const letterMissing = text => NEED.filter(([, re]) => !re.test(String(text || ''))).map(([k]) => k);

export function confirmBlockers(e) {
  const out = [];
  const d = e.docs || {};
  if (e.outdoor && !String(d.safety || '').trim()) out.push('야외 행사는 안전 점검표가 있어야 해요');
  if (e.outdoor && !String(d.rain || '').trim()) out.push('야외 행사는 우천 시 대체 일정이 있어야 해요');
  const miss = letterMissing(d.letter);
  if (miss.length) out.push(`가정통신문에 빠진 항목: ${miss.join('·')}`);
  return out;
}

const pickedOption = e => (e.options && e.picked != null ? e.options[e.picked] : null);

/* 문서마다 한글 파일(.hwpx)로 내보낼 모양 */
export function docDoc(e, docId) {
  const d = e.docs || {};
  const opt = pickedOption(e);
  if (!DOCS.some(x => x[0] === docId)) return null;
  if (docId === 'safety') {
    const blocks = [{ type: 'p', text: d.safety || '' }];
    if (e.outdoor || String(d.rain || '').trim()) blocks.push({ type: 'h', text: '우천 시 대체 일정' }, { type: 'p', text: d.rain || '' });
    return { title: `${e.name} 안전 점검표`, blocks };
  }
  if (docId === 'letter') return { title: `${e.name} 안내`, blocks: [{ type: 'p', text: d.letter || '' }] };
  const blocks = [
    { type: 'h', text: '1. 개요' },
    { type: 'table', head: true, rows: [['항목', '내용'], ['목적', e.purpose], ['일시', e.date], ['대상', e.grades], ['장소', `${e.place} (${e.outdoor ? '야외' : '실내'})`], ['예산', e.budget]] }
  ];
  if (opt) blocks.push({ type: 'h', text: '2. 시간표' }, { type: 'table', head: true, rows: [['시간', '활동', '장소'], ...opt.timetable.map(t => [t.time, t.activity, t.place])] });
  blocks.push({ type: 'h', text: `${opt ? 3 : 2}. 세부 계획` }, { type: 'p', text: d.plan || '' });
  if (opt && opt.budget.length) {
    const sum = opt.budget.reduce((s, b) => s + b.amount, 0);
    blocks.push({ type: 'h', text: '4. 예산 내역' }, { type: 'table', head: true, rows: [['항목', '금액'], ...opt.budget.map(b => [b.name, won(b.amount)]), ['합계', won(sum)]] });
  }
  return { title: `${e.name} 운영 계획`, blocks };
}
