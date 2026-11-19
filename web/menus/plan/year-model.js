/* 연간계획 자료와 계산 (화면 없음 — Node 시험에서도 씀).
   계획 목록은 ssam:yearplans, 보고 있는 계획은 ssam:yearplan:current. 올린 파일은 저장하지 않고 읽은 글만 저장 */
import { get, set } from '../../core/store.js';
import { isDate, schoolYearOf, yearOfMonth } from '../../core/calendar.js';
import { getSchool } from '../../core/settings.js';
import { maskContacts, maskStaff, staffName, nameCell, MASK, colonNames, maskKnown } from '../../core/privacy.js';
import { accountLine } from '../../core/redact.js';
import { GIVEN } from '../../core/chat-names.js';
import { normRv } from './plan-rv.js';
import { parseOutline } from './classplan-model.js';
import { isTotalName } from '../../core/sheet.js';

const LIST_KEY = 'yearplans', CUR_KEY = 'yearplan:current';

export const SECTIONS = [['purpose', '목적'], ['policy', '방침'], ['details', '세부 추진 계획'], ['schedule', '월별 추진 일정'], ['budget', '예산'], ['evaluation', '평가 계획']];
export const TEXT_SECTIONS = ['purpose', 'policy', 'details', 'evaluation'];
const SRC = ['lastPlan', 'lastResult', 'guide'];

/* ---------- 작년(기존) 계획서 목차 그대로 ----------
   작년 계획서의 큰 제목(Ⅰ.·1.)을 차례대로: 목적·방침·세부 추진·일정·예산·평가에 맞는 제목은 그 칸, 맞지 않는 제목(추진 근거·현황 등)은 덧붙임 칸(x1, x2 …).
   큰 제목이 셋보다 적으면 앱의 기본 차례(SECTIONS). 일정·예산 칸은 표로 */
const SECTION_KEYS = SECTIONS.map(x => x[0]);
const ROLE = [['purpose', /목적|목표|필요성|배경|취지/], ['policy', /방침|방향/], ['schedule', /일정|월별|시기/], ['budget', /예산|경비|재원|사업비|소요\s*액/],
  ['evaluation', /평가|환류|기대\s*효과|성과/], ['details', /세부|추진|운영|실천|내용|활동|방법|계획/]];
const NOT_ROLE = /근거|관련|현황|개요|실태|분석/;
export const isExtra = k => /^x\d{1,2}$/.test(String(k || ''));
/* 제목 하나의 역할(목적·방침·일정·예산·평가·세부 중 처음 맞는 것, 「근거·현황·개요」 등은 없음 '') — 새 서식으로 바꾸기에서 옛 칸과 새 제목을 맞출 때 */
export function sectionRole(title) {
  const t = String(title || '');
  if (NOT_ROLE.test(t)) return '';
  const r = ROLE.find(([, re]) => re.test(t));
  return r ? r[0] : '';
}
export function yearOutline(src) {
  const top = parseOutline(src).filter(x => x.level === 1).slice(0, 12);
  if (top.length < 3) return { items: [], roman: false };
  const used = new Set();
  let n = 0;
  // 제목마다 맞는 칸을 앞 칸부터: 앞 제목이 쓴 칸이면 다음으로 맞는 칸(「월별 세부 추진 계획」은 세부, 「추진 목표 및 방침」은 방침).
  // 세부 칸은 그 제목에 가장 맞는 칸이거나 「세부」가 있을 때만(「운영 목표」가 「운영」 때문에 세부 칸을 차지하지 않게). 맞는 칸이 없으면 덧붙임 칸
  const items = top.map(x => {
    const hits = NOT_ROLE.test(x.title) ? [] : ROLE.filter(([, re]) => re.test(x.title));
    const r = hits.find(([k]) => !used.has(k) && (k !== 'details' || hits[0][0] === 'details' || /세부/.test(x.title)));
    if (r) { used.add(r[0]); return { key: r[0], title: x.title }; }
    return { key: 'x' + (++n), title: x.title };
  });
  return { items, roman: /^\s*[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.\s*\S/m.test(String(src || '')) };
}
const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ';
/* 초안을 쓸 목차: 학교 새 서식으로 바꾼 초안이면 그 목차, 아니면 작년(기존) 계획서 목차(없으면 빈 목록 — 기본 차례) */
export const draftOutline = p => (p && p.draft && p.draft.fromForm && p.draft.outline.length
  ? { items: p.draft.outline.map(o => ({ ...o })), roman: !!p.draft.roman } : yearOutline(p && p.sources ? p.sources.lastPlan : ''));
/* 초안의 글 칸: 기본 넷 + 목차의 덧붙임 칸. 작년(기존) 계획서 목차로 쓴 초안은 목차에 있는 칸만(화면·한글 파일에 나오는 칸 — 없는 칸 글로 지침 「반영됨」을 세거나 검토하지 않게) */
export const textKeys = d => {
  const o = ((d && d.outline) || []).map(x => x.key);
  return o.length ? [...TEXT_SECTIONS.filter(k => o.includes(k)), ...o.filter(isExtra)] : [...TEXT_SECTIONS];
};
/* 지침 문장을 넣을 칸: 그 칸이 초안에 있으면 그 칸, 없으면 세부 추진 계획, 그것도 없으면 목차의 첫 글 칸 */
export function insertKey(draft, section) {
  const keys = textKeys(draft);
  return keys.includes(section) ? section : keys.includes('details') ? 'details' : keys[0] || 'details';
}

const str = v => (typeof v === 'string' ? v : v == null ? '' : typeof v === 'number' ? String(v) : '');
// AI가 섹션을 목록(배열)으로 주면 줄로 이음
const text = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).join('\n') : str(v));
const strs = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : []);
const num = v => { const n = Number(String(v == null ? '' : v).replace(/[,\s원₩]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; };
const won = n => Number(n).toLocaleString('ko-KR');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/* ---------- 계획 ---------- */
export function newPlan() {
  return {
    id: 'yp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: '', year: getSchool().year, goal: '', owner: '', budget: '',
    sources: { lastPlan: '', lastResult: '', guide: '' }, sourceNames: { lastPlan: [], lastResult: [], guide: [] },
    review: null, guide: null, draft: null, rv: [], status: 'draft', step: 1, maxStep: 1, updatedAt: 0
  };
}

function normPlan(v) {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  const p = newPlan();
  p.id = v.id;
  for (const k of ['name', 'goal', 'owner', 'budget']) p[k] = str(v[k]);
  if (Number.isInteger(v.year)) p.year = v.year;
  for (const k of SRC) {
    p.sources[k] = str(isObj(v.sources) ? v.sources[k] : '');
    p.sourceNames[k] = strs(isObj(v.sourceNames) ? v.sourceNames[k] : []);
  }
  p.review = normReview(v.review);
  p.guide = v.guide == null ? null : normGuide(v.guide);
  p.draft = normDraft(v.draft);
  p.rv = p.draft ? normRv(v.rv) : [];
  p.status = v.status === 'final' ? 'final' : 'draft';
  // 화면 단계(1~5)와 가 본 가장 먼 단계
  const st = n => (Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1);
  p.step = st(v.step);
  p.maxStep = Math.max(p.step, st(v.maxStep));
  p.updatedAt = Number.isFinite(v.updatedAt) ? v.updatedAt : 0;
  return p;
}

const raw = () => { const v = get(LIST_KEY, []); return Array.isArray(v) ? v : []; };
export const listPlans = () => raw().map(normPlan).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
export const getPlan = id => listPlans().find(p => p.id === id) || null;

/* 저장하면 맨 앞(최근)으로. 같은 밀리초에 두 번 저장해도 순서가 지켜지게 늘 앞선 값보다 크게 */
export function savePlan(plan) {
  const p = normPlan(plan);
  if (!p) return null;
  const list = listPlans();
  p.updatedAt = Math.max(Date.now(), ...list.map(x => x.updatedAt + 1));
  // 저장 공간이 모자라면 null (화면이 알림)
  if (!set(LIST_KEY, [p, ...list.filter(x => x.id !== p.id)])) return null;
  return p;
}
export function deletePlan(id) { set(LIST_KEY, listPlans().filter(p => p.id !== id)); }
export const currentId = () => { const v = get(CUR_KEY, null); return typeof v === 'string' ? v : null; };
export const setCurrent = id => set(CUR_KEY, id);

/* ---------- AI 답 다듬기 ---------- */
export function normReview(v) {
  if (!isObj(v)) return null;
  return {
    good: strs(v.good),
    bad: (Array.isArray(v.bad) ? v.bad : []).filter(b => isObj(b) && str(b.text).trim()).map(b => ({ text: str(b.text).trim(), ideas: strs(b.ideas) })),
    numbers: strs(v.numbers),
    picked: strs(v.picked)
  };
}

export function normGuide(v) {
  return (Array.isArray(v) ? v : []).filter(g => isObj(g) && str(g.item).trim()).map(g => ({
    item: str(g.item).trim(), keywords: strs(g.keywords), sentence: str(g.sentence).trim(),
    section: TEXT_SECTIONS.includes(g.section) ? g.section : 'details'
  }));
}

export function normDraft(v) {
  if (!isObj(v)) return null;
  const d = {};
  for (const k of TEXT_SECTIONS) d[k] = text(v[k]);
  d.schedule = (Array.isArray(v.schedule) ? v.schedule : []).filter(s => isObj(s) && str(s.title).trim()).map(s => {
    const date = isDate(s.date) ? s.date : '';
    const m = date ? +date.slice(5, 7) : Number.isInteger(+s.month) && +s.month >= 1 && +s.month <= 12 ? +s.month : null;
    return { title: str(s.title).trim(), date, month: m };
  });
  // AI가 넣은 「합계」「총계」 줄은 품목이 아님(앱이 합계 줄을 따로 붙임 — 그대로 두면 합계가 두 배). 행사계획 normOptions와 같게
  d.budget = (Array.isArray(v.budget) ? v.budget : []).filter(b => isObj(b) && str(b.name).trim() && !isTotalName(str(b.name))).map(b => ({ name: str(b.name).trim(), amount: num(b.amount), note: str(b.note).trim() }));
  // 작년(기존) 계획서 목차(없으면 빈 목록 — 기본 차례). 덧붙임 칸 글은 목차에 있는 것만
  const seen = new Set();
  d.outline = [];
  for (const o of Array.isArray(v.outline) ? v.outline : []) {
    const k = isObj(o) ? str(o.key) : '', t = isObj(o) ? str(o.title).trim() : '';
    if (!t || seen.has(k) || !(SECTION_KEYS.includes(k) || isExtra(k))) continue;
    seen.add(k); d.outline.push({ key: k, title: t.slice(0, 60) });
  }
  d.roman = !!v.roman && d.outline.length > 0;
  // 목차가 학교 새 서식(「새 서식으로 바꾸기」)에서 왔는지 — 「다시 만들기」도 이 차례로
  d.fromForm = !!v.fromForm && d.outline.length > 0;
  for (const o of d.outline) if (isExtra(o.key)) d[o.key] = text(v[o.key]);
  return d;
}

/* ---------- AI로 보내는 글 ---------- */
/* 선생님이 친 칸(목표·예산): 전화번호·전자 우편과 직함 앞뒤 교직원 이름(「문의 박하늘」「김솔 선생님」)은 ○○○로 */
export const textForAI = s => maskStaff(maskContacts(s)).text;
/* 계획 자료 글(작년 계획서·작년 결과·지침·참고 공문·작년 설문 — 개인정보 열·명단 줄을 뺀 stripPersonal 글) → AI로 보낼 글:
   계좌 줄은 빼고(강사비 입금 계좌), 교직원 이름·연락처(textForAI)와 맡은 일 머리 쌍점 뒤 이름(「진행: 남다율, 사진 기록: 탁보결」 — 글 다른 곳의 「탁보결과 협의」도)을 ○○○로.
   쪽지·공문의 cleanSheet(조사 붙은 이름 maskJosaNames·「이바다 기록 담당」 규칙)는 쓰지 않음 — 「성교육을」「한글날을」「우수상 발표」를 이름으로 배워 글 전체에서 가렸음.
   쌍점 뒤 무리·작품·곳 낱말(「사진: 방송반」「기록: 기자단」「발표: 우수작·우수상」「사회: 반대표」「사서: 도서실」)은 배우지 않음 — 배우면 글 곳곳의 「방송반 협조」「우수작 전시」까지 ○○○이 됐음.
   흔한 이름(김은실)은 그대로 배움 */
const GROUP_END = /[반단작회실표상장]$/;
export const sourceForAI = s => {
  const t = textForAI(String(s == null ? '' : s).split('\n').filter(l => !accountLine(l)).join('\n'));
  return maskKnown(t, colonNames(t).filter(w => !GROUP_END.test(w) || GIVEN.has(w.slice(1)))).text;
};
/* 담당자 칸: 부서·직함은 두고 교직원 이름과 전화번호는 ○○○로 (「독서교육부 박하늘」 → 「독서교육부 ○○○」). 「~부·~실·~과·~팀·~반」 낱말과 직함은 이름이 아님 */
const NOT_NAME = /^(주무관|기간제|실무사|담당자?)$|[부실과팀반]$/;
const ownerWord = w => !NOT_NAME.test(w) && (w.length === 4 ? nameCell(w) : /^[가-힣]{2,3}$/.test(w) && staffName(w));
export const ownerForAI = s => maskContacts(s).split(/([^가-힣]+)/).map(w => (ownerWord(w) ? MASK : w)).join('');

/* AI가 쓴 일정 날짜가 계획 학년도(year-03-01 ~ 다음 해 2월 끝) 밖이면(작년 계획서 날짜를 그대로 옮김 등) 그 학년도의 같은 달·날로
   (3~12월은 그해, 1·2월은 다음 해, 2월 29일이 없는 해는 28일) → { schedule, moved(옮긴 수) } */
export function fitSchedule(schedule, year) {
  let moved = 0;
  const out = (schedule || []).map(s => {
    if (!s || !isDate(s.date) || !Number.isInteger(year) || schoolYearOf(s.date) === year) return s;
    const m = +s.date.slice(5, 7), y = yearOfMonth(m, year);
    let date = `${y}${s.date.slice(4)}`;
    if (!isDate(date)) date = `${y}-02-28`;
    moved++;
    return { ...s, date, month: m };
  });
  return { schedule: out, moved };
}

/* ---------- 글 계산 ---------- */
export function draftText(draft) {
  if (!draft) return '';
  return [...textKeys(draft).map(k => draft[k] || ''), ...(draft.schedule || []).map(s => s.title), ...(draft.budget || []).map(b => b.name)].join('\n');
}

/* 줄과 문장 끝(. ! ?)에서 나눔. 「가.」「1)」 같은 번호만 있는 조각은 뒤 문장 앞에 붙임 */
const MARK = /^(?:[가-하]|\d{1,2}|[a-z]|[①-⑳])[.)]$/;
export function sentences(text) {
  const out = [];
  for (const line of String(text || '').split(/\n+/)) {
    let carry = '';
    for (const piece of line.split(/(?<=[.!?])\s+/)) {
      const p = piece.trim();
      if (!p) continue;
      if (MARK.test(p)) { carry += p + ' '; continue; }
      out.push(carry + p); carry = '';
    }
    if (carry.trim()) out.push(carry.trim());
  }
  return out;
}

const LAW = /제\s*\d+\s*조/;
const norm = s => String(s).replace(/[\s\p{P}\p{S}]/gu, '');
const bigrams = s => { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2)); return b; };
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return (2 * n) / (a.size + b.size);
}

/* 올해 초안 문장 중 작년 계획과 (거의) 같은 문장의 비율. 법령 문장은 뺌. 작년 글이 비면 null.
   draft는 연간계획 초안({purpose, …}) 또는 글 (학급운영계획) */
export function overlap(lastText, draft) {
  if (!String(lastText || '').trim()) return null;
  const last = sentences(lastText).filter(s => !LAW.test(s)).map(norm).filter(Boolean);
  const exact = new Set(last);
  const lastB = last.map(s => ({ len: s.length, b: bigrams(s) }));
  const mine = sentences(typeof draft === 'string' ? draft : textKeys(draft).map(k => (draft && draft[k]) || '').join('\n')).filter(s => !LAW.test(s));
  const same = [];
  for (const s of mine) {
    const n = norm(s);
    if (!n) continue;
    if (exact.has(n)) { same.push(s); continue; }
    const b = bigrams(n);
    // 길이가 너무 다르면 0.8을 넘을 수 없어서 건너뜀
    if (lastB.some(x => Math.min(x.len, n.length) / Math.max(x.len, n.length) >= 0.6 && dice(b, x.b) >= 0.8)) same.push(s);
  }
  const total = mine.filter(s => norm(s)).length;
  return { percent: total ? Math.round((100 * same.length) / total) : 0, same };
}

/* 지침 항목이 초안에 들어갔는지: 핵심어의 절반 이상(올림)이 있으면 반영됨 (띄어쓰기·문장부호 무시) */
export function guideStatus(items, draft) {
  const text = draft ? norm(draftText(draft)) : '';
  return (items || []).map(g => {
    const kws = (g.keywords && g.keywords.length ? g.keywords : [g.item]).map(norm).filter(Boolean);
    const hit = kws.filter(k => text.includes(k)).length;
    return { ...g, included: !!draft && hit >= Math.max(1, Math.ceil(kws.length / 2)) };
  });
}

export function insertSentence(draft, section, sentence) {
  const d = { ...(draft || normDraft({})) };
  const k = insertKey(d, section);
  const prev = String(d[k] || '').trimEnd();
  d[k] = (prev ? prev + '\n' : '') + String(sentence || '').trim();
  return d;
}

/* 한글 파일(.hwpx)로 내보낼 문서 */
export function planDoc(plan) {
  const d = plan.draft || normDraft({});
  const blocks = [];
  // 작년(기존) 계획서 목차가 있으면 그 차례·제목·번호 꼴(Ⅰ.·1.) 그대로, 없으면 앱의 기본 차례
  const order = d.outline && d.outline.length ? d.outline.map(o => [o.key, o.title]) : SECTIONS;
  order.forEach(([k, label], i) => {
    blocks.push({ type: 'h', text: `${d.roman ? (ROMAN[i] || i + 1) : i + 1}. ${label}` });
    if (k === 'schedule') {
      if (d.schedule.length) blocks.push({ type: 'table', head: true, rows: [['날짜', '내용'], ...d.schedule.map(s => [s.date || (s.month ? `${s.month}월` : ''), s.title])] });
      else blocks.push({ type: 'p', text: '(없음)' });
    } else if (k === 'budget') {
      if (d.budget.length) {
        const sum = d.budget.reduce((s, b) => s + b.amount, 0);
        blocks.push({ type: 'table', head: true, rows: [['항목', '금액', '비고'], ...d.budget.map(b => [b.name, won(b.amount), b.note]), ['합계', won(sum), '']] });
      } else blocks.push({ type: 'p', text: '(없음)' });
    } else blocks.push({ type: 'p', text: d[k] || '' });
  });
  return { title: `${plan.year}학년도 ${plan.name || '업무'} 운영 계획`, blocks };
}

/* 지난 계획을 글로: 다음 해 「작년 계획서」 칸에 넣음 (표는 칸을 ' | '로) */
export function planText(plan) {
  const doc = planDoc(plan);
  return [doc.title, ...doc.blocks.map(b => (b.type === 'table' ? b.rows.map(r => r.join(' | ')).join('\n') : b.text))].join('\n');
}
