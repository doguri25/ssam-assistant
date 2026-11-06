/* 업무 인수인계서 (스펙 2026-11-06 L): 지금 학년도의 연간계획·행사계획·품의·공문·결과 보고·학사일정을 모아
   다음 담당자에게 넘길 문서({ title, blocks }, core/hwpx.js 꼴)로. 화면 없이 돌아감(시험).
   학생 자료·명단·교직원 이름(담당자·행사 역할 분담 이름 등)·전화번호는 넣지 않음. 모으는 모델은 읽기만 함 */
import { get, set } from '../../core/store.js';
import { isDate, listEvents } from '../../core/calendar.js';
import { currentYear } from '../../core/years.js';
import { stripNames, nameCell, looksLikeName, MASK } from '../../core/privacy.js';
import { listPlans } from '../plan/year-model.js';
import { listEventPlans } from '../plan/event-model.js';
import { listRecent } from '../purchase/library.js';
import { TYPES, sumItems, toNumber } from '../purchase/rules.js';
import { listDocs } from '../etc/gongmun-model.js';
import { listReports } from '../plan/report-model.js';
import { reportTitle } from '../plan/report-ai.js';

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
// 「김가람 선생님」「이나래 부장님께」처럼 직함 앞의 세 글자 이름, 「강사 김가람」「담당: 박하늘」처럼 직함 뒤의 이름 (부서·과목 이름은 뺌)
const STAFF_AFTER = /(^|[^가-힣])([가-힣]{3})(\s*)(선생님|선생|교사|부장님?|교감님?|교장님?|주무관님?|실무사님?|강사님?|담당자|님)(?=$|[^가-힣]|[은는이가을를과와의에도께랑만한])/g;
const STAFF_BEFORE = /((?:강사|담당자?|주무관|선생님|부장|문의)(?:\s*[:：]\s*|\s+))([가-힣]{3})(?![가-힣])/g;
const STAFF_WORD = new Set(['원어민', '방과후', '행정실', '교무실', '연구부', '정보부', '교무부', '학년부', '진로부', '안전부', '인성부', '체육부', '과학부', '돌봄반', '특수반', '전담반', '정보화', '보건실']);
const staffName = n => nameCell(n) && !STAFF_WORD.has(n);

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
  s = s.replace(STAFF_AFTER, (m, pre, n, sp, who) => (staffName(n) ? pre + MASK + sp + who : m))
    .replace(STAFF_BEFORE, (m, pre, n) => (staffName(n) ? pre + MASK : m));
  s = stripNames(s).text;
  return s.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- 모으기 (읽기만) ---------- */
const typeLabel = id => (TYPES.find(t => t.id === id) || TYPES[0]).label;
const purchaseAmount = f => sumItems((f && f.items) || []) || Math.max(0, Math.round(toNumber(f && f.total)));

/* 지금 학년도 자료 → { year, school, names, duties, events, purchases, docs, reports, calendar }.
   names: 가릴 이름(담당자·행사 교직원·역할 분담) — 「다음 담당자에게」·AI 답을 다듬을 때만 쓰고 문서에는 넣지 않음.
   on: 처음에 고른 것(연간계획은 그 학년도 계획, 행사는 날짜가 그 학년도이거나 없는 것, 나머지는 모두) */
export function collectHandover({ year = currentYear(), school = '' } = {}) {
  const plans = listPlans(), events = listEventPlans();
  const names = new Set();
  for (const p of plans) nameTokens(p.owner).forEach(n => names.add(n));
  for (const e of events) {
    for (const s of e.staff || []) nameTokens(s.name).forEach(n => names.add(n));
    for (const r of (e.docs && e.docs.roles) || []) nameTokens(r.name).forEach(n => names.add(n));
  }
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
  const purchases = listRecent().map(r => ({
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

const NONE = { type: 'p', text: '(없음)' };
const table = (head, rows) => (rows.length ? { type: 'table', head: true, rows: [head, ...rows] } : NONE);

/* 인수인계서 { title, blocks }. data는 고른 것만(pickData). note: 「다음 담당자에게」(비면 빈 칸, 이름·전화번호는 뺌), today: 만든 날 */
export function buildHandover(data, { note = '', today = '' } = {}) {
  const d = data || {};
  const year = d.year;
  const blocks = [];
  const head = [d.school, today ? `${dotDate(today)} 기준` : ''].filter(Boolean).join(' · ');
  if (head) blocks.push({ type: 'p', text: head });
  blocks.push({ type: 'h', text: '1. 맡은 업무 한눈에' }, table(['업무', '목표', '일정'], dutyRows(d.duties)));
  const months = monthRows(monthEntries(d), year);
  blocks.push({ type: 'h', text: '2. 월별 할 일' }, months.some(m => m.items.length)
    ? { type: 'table', head: true, rows: [['월', '할 일'], ...months.map(m => [`${m.month}월`, m.items.join('\n')])] } : NONE);
  blocks.push({ type: 'h', text: '3. 행사와 개선 메모' }, table(['행사', '날짜', '상태', '내년에 고칠 점'], eventRows(d.events)));
  const b = budgetRows(d.purchases);
  blocks.push({ type: 'h', text: '4. 예산 집행' }, b.rows.length ? { type: 'table', head: true, rows: [['품의', '종류', '금액(원)', '작성일'], ...b.rows, ['합계', '', won(b.sum), '']] } : NONE);
  blocks.push({ type: 'h', text: '5. 주요 공문·제출' }, table(['공문', '기한', '할 일', '처리'], docRows(d.docs)));
  if ((d.reports || []).length) blocks.push({ type: 'p', text: '결과 보고' }, table(['결과 보고', '날짜', '주요 내용'], reportRows(d.reports)));
  blocks.push({ type: 'h', text: '6. 다음 담당자에게' }, { type: 'p', text: cleanText(note, d.names || []) });
  return { title: `${year}학년도 업무 인수인계서`, blocks };
}

/* 문서를 글로(AI에 보낼 것): 표는 칸을 ' | '로. noNote면 「6. 다음 담당자에게」는 뺌 */
export function handoverText(doc, { noNote = true } = {}) {
  const out = [doc.title];
  for (const b of doc.blocks || []) {
    if (noNote && b.type === 'h' && /^6\./.test(b.text)) break;
    if (b.type === 'table') out.push(...b.rows.map(r => r.map(c => String(c || '').replace(/\n/g, ' / ')).join(' | ')));
    else if (b.text) out.push(b.text);
  }
  return out.join('\n');
}

export function handoverPrompt(text) {
  return ['[업무 인수인계]',
    '학교 업무를 다음 담당 선생님에게 넘기는 인수인계서의 「다음 담당자에게」 칸을 씁니다.',
    '아래 인수인계서 내용만 보고, 다음 담당자가 꼭 챙길 것을 3~6줄로 씁니다.',
    '- 한 줄은 40자 안팎의 짧은 해요체 문장(예: 3월 첫 주에 학부모 총회 자료부터 챙겨요.)',
    '- 시기·마감이 있는 일, 내년에 고칠 점, 끝나지 않은 공문을 먼저 씁니다.',
    '- 내용에 없는 일·숫자는 지어내지 않습니다. 사람 이름·전화번호는 쓰지 않습니다.',
    '[출력] JSON 하나만: {"lines":["…","…","…"]}',
    '', '[인수인계서]', String(text || '').slice(0, 12000)].join('\n');
}

/* AI 답 → 줄 6개까지(앞의 기호·번호는 떼고, 이름·전화번호는 뺌) */
export function normNote(v, names = []) {
  const arr = Array.isArray(v) ? v : isObj(v) && Array.isArray(v.lines) ? v.lines : [];
  return arr.filter(x => typeof x === 'string')
    .map(x => cleanText(x.replace(/^\s*(?:[-·•*○]|\d{1,2}[.)])\s*/, ''), names).replace(/\s*\n\s*/g, ' ').slice(0, 120))
    .filter(Boolean).slice(0, 6);
}

/* ---------- 저장 (학년도 자료 「handover」): 고른 것을 바꾼 것과 「다음 담당자에게」 글 ---------- */
export function getSaved() {
  const v = get(KEY, null);
  const picks = {};
  if (isObj(v) && isObj(v.picks)) for (const [k, x] of Object.entries(v.picks)) if (typeof x === 'boolean') picks[k] = x;
  return { note: isObj(v) && typeof v.note === 'string' ? v.note.slice(0, 4000) : '', picks };
}
export const saveHandover = ({ note = '', picks = {} } = {}) => set(KEY, { note: String(note).slice(0, 4000), picks });
