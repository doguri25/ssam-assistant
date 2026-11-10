/* 업무 인수인계서 (스펙 2026-11-06 L, 2026-11-10 기타 › 인수인계서): 지금 학년도의 연간계획·행사계획·품의·공문·결과 보고·학사일정을 모아
   다음 담당자에게 넘길 문서({ title, blocks }, core/hwpx.js 꼴)로. 화면 없이 돌아감(시험).
   학생 자료·명단·교직원 이름(담당자·행사 역할 분담 이름 등)·전화번호는 넣지 않음. 모으는 모델은 읽기만 함.
   문서 조각에는 part(head·duties·months·events·budget·docs·reports·note)를 달아 「몇 쪽으로」(handover-fit.js)가 줄일 곳을 앎 */
import { get, set } from '../../core/store.js';
import { isDate, listEvents } from '../../core/calendar.js';
import { currentYear } from '../../core/years.js';
import { stripNames, nameCell, looksLikeName, maskStaff, staffName, MASK } from '../../core/privacy.js';
import { listPlans } from '../plan/year-model.js';
import { listEventPlans } from '../plan/event-model.js';
import { listRecent } from '../purchase/library.js';
import { TYPES, sumItems, toNumber } from '../purchase/rules.js';
import { listDocs } from './gongmun-model.js';
import { listReports } from '../plan/report-model.js';
import { reportTitle } from '../plan/report-ai.js';
import { isSign, isDateLine } from '../../core/hwpx-form.js';
import { normPages } from './handover-fit.js';

export { PAGES, PAGE_LINES, LINE_CHARS, normPages, docLines, estPages, fitPages, fitNotice } from './handover-fit.js';

const KEY = 'handover';
export const GROUPS = [['duties', '업무(연간계획)'], ['events', '행사계획'], ['purchases', '품의'], ['docs', '공문'], ['reports', '결과 보고']];
/* 학년도 달 차례: 3월~다음 해 2월 */
export const MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const won = n => Number(n || 0).toLocaleString('ko-KR');
const pad = n => String(n).padStart(2, '0');
/* 2026-11-06 → 2026. 11. 6. */
export const dotDate = iso => (isDate(iso) ? `${+iso.slice(0, 4)}. ${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}.` : '');
const shortDate = iso => (isDate(iso) ? `${+iso.slice(5, 7)}. ${+iso.slice(8, 10)}.` : '');
const isoOf = t => { const d = new Date(Number(t) || 0); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const inSchoolYear = (iso, year) => isDate(iso) && iso >= `${year}-03-01` && iso < `${+year + 1}-03-01`;

/* ---------- 이름·전화번호 빼기 ---------- */
const PHONE = /(?<!\d)\(?0\d{1,2}\)?[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}(?!\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
// 직함 앞뒤의 교직원 이름(「김가람 선생님」「김솔 선생님께」「강사 김가람」「3학년 부장 김솔」)은 core/privacy.js maskStaff(가정통신문 번역과 같게)

/* 강사 수당 품의 품목 이름의 강사 이름: 「강사수당(김가람)」「김솔」 → 이름만(「강사 수당(외부 강사)」「강사료」「전문가」는 이름 아님) */
const LECT_WORD = /강사|수당|전문가|연구원|해설가|[사료비금]$/;
export function lecturerNames(v) {
  const out = new Set();
  for (const w of String(v == null ? '' : v).split(/[\s,·/()（）[\]\-–:：]+/)) if (/^[가-힣]{2,3}$/.test(w) && !LECT_WORD.test(w) && staffName(w)) out.add(w);
  return [...out];
}

/* 사람 이름으로 쓴 칸(담당자·행사 교직원·역할 분담)에서 가릴 이름들: 칸 전체와 그 안의 이름 모양 낱말 */
export function nameTokens(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s) return [];
  const out = new Set();
  if (/^[가-힣]{2,5}$/.test(s)) out.add(s);
  for (const w of s.split(/[\s,·/()]+/)) if (/^[가-힣]{2,4}$/.test(w) && (nameCell(w) || looksLikeName(w))) out.add(w);
  return [...out];
}

/* 글에서 아는 이름(names)·전화번호·전자 우편을 빼고, 이름처럼 보이는 말은 ○○○로 (core/privacy.js stripNames) */
export function cleanText(v, names = []) {
  let s = String(v == null ? '' : v);
  if (!s.trim()) return '';
  for (const n of [...names].sort((a, b) => b.length - a.length)) if (n && n.length >= 2) s = s.split(n).join(MASK);
  // 전화번호·전자 우편은 앞의 「문의」「연락처:」와 함께 빼고, 남은 빈 괄호·쉼표도 정리
  s = s.replace(PHONE, '\u0000').replace(EMAIL, '\u0000')
    .replace(/(?:문의|연락처|전화|휴대폰|☎|tel|e-?mail|이메일)?\s*[:：]?\s*\u0000/gi, '')
    .replace(/\(\s*[,，·]?\s*\)/g, '').replace(/[,，·]\s*(?=[)\n]|$)/g, '').replace(/\(\s*[,，]\s*/g, '(').replace(/^\s*[,，·]\s*/gm, '');
  s = maskStaff(s).text;
  s = stripNames(s).text;
  return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- 모으기 (읽기만) ---------- */
const typeLabel = id => (TYPES.find(t => t.id === id) || TYPES[0]).label;
const purchaseAmount = f => sumItems((f && f.items) || []) || Math.max(0, Math.round(toNumber(f && f.total)));

/* 지금 학년도 자료 → { year, school, names, duties, events, purchases, docs, reports, calendar }.
   names: 가릴 이름(담당자·행사 교직원·역할 분담·강사 수당 품의의 강사) — 「다음 담당자에게」·AI 답을 다듬을 때만 쓰고 문서에는 넣지 않음.
   on: 처음에 고른 것(연간계획은 그 학년도 계획, 행사는 날짜가 그 학년도이거나 없는 것, 나머지는 모두) */
export function collectHandover({ year = currentYear(), school = '' } = {}) {
  const plans = listPlans(), events = listEventPlans();
  const names = new Set();
  for (const p of plans) nameTokens(p.owner).forEach(n => names.add(n));
  for (const e of events) {
    for (const s of e.staff || []) nameTokens(s.name).forEach(n => names.add(n));
    for (const r of (e.docs && e.docs.roles) || []) nameTokens(r.name).forEach(n => names.add(n));
  }
  const recent = listRecent();
  for (const r of recent) if (r.form && r.form.type === 'lecturer') for (const it of r.form.items || []) lecturerNames(it && it.name).forEach(n => names.add(n));
  const c = t => cleanText(t, names);
  const duties = plans.map(p => ({
    id: p.id, name: c(p.name) || '이름 없는 업무', goal: c(p.goal), year: p.year, on: p.year === year,
    schedule: ((p.draft && p.draft.schedule) || []).map(s => ({ date: isDate(s.date) ? s.date : '', month: s.month, title: c(s.title) })).filter(s => s.title)
  }));
  // 그 학년도 계획이 하나도 없으면(학년도를 다르게 적어 둠 등) 모두 고름
  if (!duties.some(d => d.on)) duties.forEach(d => { d.on = true; });
  const evs = events.map(e => ({
    id: e.id, name: c(e.name) || '이름 없는 행사', date: e.date, status: e.status === 'final' ? '확정' : '준비 중',
    memo: c(e.survey && e.survey.nextMemo), on: !e.date || inSchoolYear(e.date, year)
  }));
  const purchases = recent.map(r => ({
    id: r.id, title: c((r.draft && r.draft.title) || r.form.project) || '제목 없는 품의', kind: typeLabel(r.form.type),
    amount: purchaseAmount(r.form), date: r.at ? isoOf(r.at) : '', on: true
  })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const docs = listDocs().map(d => ({
    id: d.id, title: c(d.title || d.name) || '공문', due: d.due, date: d.date, done: d.done, dueNote: c(d.dueNote),
    tasks: (d.tasks || []).map(t => ({ text: c(t.text), due: t.due, done: t.done })).filter(t => t.text), on: true
  })).sort((a, b) => { const x = a.due || a.date || '9999', y = b.due || b.date || '9999'; return x < y ? -1 : x > y ? 1 : 0; });
  const reports = listReports().map(r => ({
    id: r.id, title: c(r.title || reportTitle(r.r)) || '결과 보고', date: (r.r.period && r.r.period.start) || '', summary: c(r.r.summary), on: true
  }));
  // 학사일정: 연간계획·행사계획·공문이 넣은 일정은 위에서 모으므로 그 밖의 것만(그 학년도)
  const calendar = listEvents().filter(e => !/^(year:|event:|gongmun$)/.test(e.source) && inSchoolYear(e.date, year))
    .map(e => ({ date: e.date, title: c(e.title) })).filter(e => e.title);
  return { year, school: c(school), names: [...names], duties, events: evs, purchases, docs, reports, calendar };
}

/* ---------- 고르기 ---------- */
/* picks: { [id]: true|false } 선생님이 바꾼 것만. 없으면 처음 고른 값(on) */
export const isOn = (item, picks = {}) => (isObj(picks) && typeof picks[item.id] === 'boolean' ? picks[item.id] : !!item.on);
export function pickData(data, picks = {}) {
  const out = { ...data };
  for (const [g] of GROUPS) out[g] = (data[g] || []).filter(x => isOn(x, picks));
  return out;
}

/* ---------- 문서 조각 (순수) ---------- */
/* 월별 할 일: entries [{ date?, month?, text }] → 3월~2월 12줄 [{ month, items: [글] }].
   날짜는 그달에(학년도 밖 날짜는 연도를 붙여 그달에), 날짜 없이 달만 있으면 그달 끝에. 날짜 차례 */
export function monthRows(entries, year) {
  const rows = new Map(MONTHS.map(m => [m, []]));
  for (const e of entries || []) {
    if (!e || !String(e.text || '').trim()) continue;
    const text = String(e.text).trim();
    if (isDate(e.date)) {
      const m = +e.date.slice(5, 7), d = +e.date.slice(8, 10);
      rows.get(m).push({ key: d, text: inSchoolYear(e.date, year) ? `${d}일 ${text}` : `${dotDate(e.date)} ${text}` });
    } else if (Number.isInteger(e.month) && e.month >= 1 && e.month <= 12) rows.get(e.month).push({ key: 99, text });
  }
  return MONTHS.map(m => ({ month: m, items: rows.get(m).sort((a, b) => a.key - b.key).map(x => x.text) }));
}

/* 월별 할 일에 넣을 것: 고른 업무의 일정, 행사 날, 공문 제출 기한·할 일, 그 밖의 학사일정 */
export function monthEntries(data) {
  const out = [];
  for (const d of data.duties || []) for (const s of d.schedule || []) out.push({ date: s.date, month: s.month, text: `${d.name}: ${s.title}` });
  for (const e of data.events || []) if (e.date) out.push({ date: e.date, text: `행사: ${e.name}` });
  for (const d of data.docs || []) {
    if (d.due) out.push({ date: d.due, text: `제출: ${d.title}` });
    for (const t of d.tasks || []) if (t.due && t.due !== d.due) out.push({ date: t.due, text: `할 일: ${t.text}` });
  }
  for (const e of data.calendar || []) out.push({ date: e.date, text: e.title });
  return out;
}

const monthsOf = d => {
  const ms = [...new Set((d.schedule || []).map(s => (isDate(s.date) ? +s.date.slice(5, 7) : +s.month)).filter(m => m >= 1 && m <= 12))];
  return MONTHS.filter(m => ms.includes(m));
};
export function dutyRows(duties) {
  return (duties || []).map(d => {
    const ms = monthsOf(d), n = (d.schedule || []).length;
    return [d.name, d.goal, n ? `${ms.length ? `${ms.join('·')}월 · ` : ''}${n}개` : ''];
  });
}
export const eventRows = events => (events || []).map(e => [e.name, dotDate(e.date), e.status, e.memo]);
export function budgetRows(purchases) {
  const list = purchases || [];
  const sum = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { rows: list.map(p => [p.title, p.kind, won(p.amount), dotDate(p.date)]), sum };
}
export function docRows(docs) {
  return (docs || []).map(d => {
    const tasks = (d.tasks || []).map(t => `- ${t.text}${t.due ? ` (${shortDate(t.due)})` : ''}${t.done ? ' ✓' : ''}`);
    return [d.title, dotDate(d.due), tasks.length ? tasks.join('\n') : d.dueNote, d.done ? '완료' : '진행 중'];
  });
}
export const reportRows = reports => (reports || []).map(r => [r.title, dotDate(r.date), r.summary]);

const NONE = part => ({ type: 'p', text: '(없음)', part });
const table = (part, head, rows) => (rows.length ? { type: 'table', head: true, rows: [head, ...rows], part } : NONE(part));

/* 인수인계서 { title, blocks }. data는 고른 것만(pickData). note: 「다음 담당자에게」(비면 빈 칸, 이름·전화번호는 뺌), today: 만든 날 */
export function buildHandover(data, { note = '', today = '' } = {}) {
  const d = data || {};
  const year = d.year;
  const blocks = [];
  const h = (part, text) => ({ type: 'h', text, part });
  const head = [d.school, today ? `${dotDate(today)} 기준` : ''].filter(Boolean).join(' · ');
  if (head) blocks.push({ type: 'p', text: head, part: 'head' });
  blocks.push(h('duties', '1. 맡은 업무 한눈에'), table('duties', ['업무', '목표', '일정'], dutyRows(d.duties)));
  const months = monthRows(monthEntries(d), year);
  blocks.push(h('months', '2. 월별 할 일'), months.some(m => m.items.length)
    ? { type: 'table', head: true, rows: [['월', '할 일'], ...months.map(m => [`${m.month}월`, m.items.join('\n')])], part: 'months' } : NONE('months'));
  blocks.push(h('events', '3. 행사와 개선 메모'), table('events', ['행사', '날짜', '상태', '내년에 고칠 점'], eventRows(d.events)));
  const b = budgetRows(d.purchases);
  blocks.push(h('budget', '4. 예산 집행'), b.rows.length ? { type: 'table', head: true, rows: [['품의', '종류', '금액(원)', '작성일'], ...b.rows, ['합계', '', won(b.sum), '']], part: 'budget' } : NONE('budget'));
  blocks.push(h('docs', '5. 주요 공문·제출'), table('docs', ['공문', '기한', '할 일', '처리'], docRows(d.docs)));
  if ((d.reports || []).length) blocks.push({ type: 'p', text: '결과 보고', part: 'reports' }, table('reports', ['결과 보고', '날짜', '주요 내용'], reportRows(d.reports)));
  blocks.push(h('note', '6. 다음 담당자에게'), { type: 'p', text: cleanText(note, d.names || []), part: 'note' });
  return { title: `${year}학년도 업무 인수인계서`, blocks };
}

/* 문서를 글로(AI에 보낼 것): 표는 칸을 ' | '로. noNote면 「다음 담당자에게」(쪽 수에 맞춰 번호가 바뀌어도)는 뺌 */
const isNoteHead = b => b.type === 'h' && (b.part === 'note' || /다음 담당자에게\s*$/.test(String(b.text || '')));
export function handoverText(doc, { noNote = true } = {}) {
  const out = [doc.title];
  for (const b of doc.blocks || []) {
    if (noNote && isNoteHead(b)) break;
    if (b.type === 'table') out.push(...b.rows.map(r => r.map(c => String(c || '').replace(/\n/g, ' / ')).join(' | ')));
    else if (b.text) out.push(b.text);
  }
  return out.join('\n');
}

/* 「다음 담당자에게」 줄 수: 「몇 쪽으로」가 1~2쪽이면 줄여서(1쪽 2~3줄, 2쪽 3~4줄, 3쪽 3~5줄, 그 밖·제한 없음 3~6줄) */
export function noteRange(pages = 0) {
  const p = normPages(pages);
  return p === 1 ? [2, 3] : p === 2 ? [3, 4] : p === 3 ? [3, 5] : [3, 6];
}
export function handoverPrompt(text, { pages = 0 } = {}) {
  const [lo, hi] = noteRange(pages);
  return ['[업무 인수인계]',
    '학교 업무를 다음 담당 선생님에게 넘기는 인수인계서의 「다음 담당자에게」 칸을 씁니다.',
    `아래 인수인계서 내용만 보고, 다음 담당자가 꼭 챙길 것을 ${lo}~${hi}줄로 씁니다.${normPages(pages) ? ` 인수인계서를 ${normPages(pages)}쪽에 맞추므로 ${hi}줄을 넘기지 않습니다.` : ''}`,
    '- 한 줄은 40자 안팎의 짧은 해요체 문장(예: 3월 첫 주에 학부모 총회 자료부터 챙겨요.)',
    '- 시기·마감이 있는 일, 내년에 고칠 점, 끝나지 않은 공문을 먼저 씁니다.',
    '- 내용에 없는 일·숫자는 지어내지 않습니다. 사람 이름·전화번호는 쓰지 않습니다.',
    '[출력] JSON 하나만: {"lines":["…","…","…"]}',
    '', '[인수인계서]', String(text || '').slice(0, 12000)].join('\n');
}

/* AI 답 → 줄 max개까지(앞의 기호·번호는 떼고, 이름·전화번호는 뺌). max는 noteRange(쪽 수)[1] */
export function normNote(v, names = [], max = 6) {
  const arr = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.lines) ? v.lines : [];
  return arr.filter(x => typeof x === 'string')
    .map(x => cleanText(x.replace(/^\s*(?:[-·•*○]|\d{1,2}[.)])\s*/, ''), names).replace(/\s*\n\s*/g, ' ').slice(0, 120))
    .filter(Boolean).slice(0, Math.max(1, max));
}

/* ---------- 학교 인수인계서 양식(.hwpx) 자리 (순수) ---------- */
/* readForm(양식).lines → { title, bodyStart, bodyEnd, date, sign: -1, reply: -1 } (줄 번호, 없으면 -1).
   {제목}·{본문}·{날짜} 표시가 있으면 그 줄. 없으면 제목은 표 밖에서 「인수인계」가 든 첫 줄(없으면 표 밖 첫 줄),
   본문은 제목 아래 표 밖의 이어진 글 줄(여럿이면 맨 아래 묶음) — 결재란·인계자/인수자 칸(표)·「인계자: (서명)」 줄·맨 아래 날짜·학교장 줄은 그대로 둠.
   학교장·회신서는 보지 않음(가정통신문처럼 학교장 줄 아래를 회신서로 알고 지우지 않게). 못 찾으면 -1(양식 맞추기) */
const SIGN_LINE = /인\s*계\s*자|인\s*수\s*자|작\s*성\s*자|확\s*인\s*자|담당\s*자?\s*[:：]|[(（]\s*(?:서명|인|印)\s*[)）]|서명\s*$|결\s*재/;
export function formRoles(lines) {
  const L = Array.isArray(lines) ? lines : [], text = i => String((L[i] && L[i].text) || '');
  const filled = i => !!text(i).trim(), free = i => filled(i) && !L[i].inBox;
  const at = mk => L.findIndex(l => String((l && l.text) || '').includes(mk));
  const r = { title: -1, bodyStart: -1, bodyEnd: -1, date: -1, sign: -1, reply: -1 };
  if (at('{본문}') >= 0) {
    r.bodyStart = r.bodyEnd = at('{본문}'); r.title = at('{제목}'); r.date = at('{날짜}');
    if (r.title < 0) r.title = L.findIndex((l, i) => i < r.bodyStart && free(i));
    return r;
  }
  r.title = L.findIndex((l, i) => free(i) && /인\s*수\s*인\s*계|인\s*계\s*서/.test(text(i)));
  if (r.title < 0) r.title = L.findIndex((l, i) => free(i));
  if (r.title < 0) return r;
  // 맨 아래 날짜·학교장·서명 줄과 표(뒤에서부터 이어진 것)는 본문이 아님. 그 날짜 줄은 만든 날로 바꿀 자리
  let end = L.length;
  for (let k = L.length - 1; k > r.title; k--) {
    if (!filled(k)) continue;
    const t = text(k);
    if (!(L[k].inBox || isDateLine(t) || isSign(t) || SIGN_LINE.test(t))) break;
    if (r.date < 0 && !L[k].inBox && isDateLine(t)) r.date = k;
    end = k;
  }
  // 본문은 이어진 글 줄 한 묶음(맨 아래 것): 표 칸·서명·날짜 줄이 끼면 끊음 — 채우기는 시작~끝 사이를 모두 바꾸므로
  // 그 사이에 든 인계자·인수자 표나 서명 줄이 지워지지 않게
  let run = null;
  for (let k = r.title + 1; k < end; k++) {
    const t = text(k);
    if (L[k] && L[k].inBox || (filled(k) && (SIGN_LINE.test(t) || isDateLine(t) || isSign(t)))) { run = null; continue; }
    if (!filled(k)) continue;
    if (!run) { run = [k, k]; r.bodyStart = k; }
    run[1] = r.bodyEnd = k;
  }
  return r;
}
/* 제목 줄이 본문 위, 본문 시작 ≤ 끝. 날짜는 없어도 되고, 있으면 제목·본문과 겹치지 않음(머리의 「인계일」 줄도 됨) */
export function formRolesOk(r) {
  if (!isObj(r) || !(r.title >= 0) || !(r.bodyStart > r.title) || !(r.bodyEnd >= r.bodyStart)) return false;
  return !(r.date >= 0) || (r.date !== r.title && (r.date < r.bodyStart || r.date > r.bodyEnd));
}

/* ---------- 저장 (학년도 자료 「handover」): 고른 것을 바꾼 것, 「다음 담당자에게」 글, 몇 쪽으로(0: 제한 없음), 고른 양식 ---------- */
export function getSaved() {
  const v = get(KEY, null);
  const picks = {};
  if (isObj(v) && isObj(v.picks)) for (const [k, x] of Object.entries(v.picks)) if (typeof x === 'boolean') picks[k] = x;
  return {
    note: isObj(v) && typeof v.note === 'string' ? v.note.slice(0, 4000) : '', picks,
    pages: isObj(v) ? normPages(v.pages) : 0, formId: isObj(v) && typeof v.formId === 'string' ? v.formId.slice(0, 40) : ''
  };
}
export const saveHandover = ({ note = '', picks = {}, pages = 0, formId = '' } = {}) =>
  set(KEY, { note: String(note).slice(0, 4000), picks, pages: normPages(pages), formId: String(formId || '').slice(0, 40) });
