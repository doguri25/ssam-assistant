/* 연수 메뉴 규칙·저장 (스펙 2026-11-18-training-design). 화면 없음 — Node 시험에서도 씀. 화면은 training.js.
   AI를 부르지 않음: 이수증·교직원 명단은 이 컴퓨터 안에서만 읽음(교직원 이름은 AI로 보내지 않음).
   저장(학년도 자료): training:mine(내 필수연수 줄), training:board(연수 현황판 — 담당 선생님의 명단·연수·제출 상태) */
import { get, set } from '../../core/store.js';
import { setEvents } from '../../core/calendar.js';

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
export const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 10) / 10 : null; };
export const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = n => String(n).padStart(2, '0');
const DAY = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
export const dday = (due, today) => { const a = DAY(due), b = DAY(today); return a == null || b == null ? null : Math.round(a - b); };
export const ddayText = n => (n == null ? '' : n === 0 ? '오늘' : n > 0 ? `D-${n}` : `${-n}일 지남`);
const WD = '일월화수목금토';
export const dotDate = d => (isDate(d) ? `${d.slice(0, 4)}. ${+d.slice(5, 7)}. ${+d.slice(8, 10)}.(${WD[new Date(DAY(d) * 864e5).getUTCDay()]})` : '');

/* 법정 의무연수로 흔히 받는 것(이름만 — 시간·주기는 학교·교육청마다 달라 공문을 보고 넣음) */
export const DEFAULTS = ['성희롱·성폭력 예방교육', '아동학대 예방 및 신고의무자 교육', '장애인식개선 교육', '청렴교육(부패방지)', '개인정보보호 교육', '학교폭력 예방교육',
  '생명존중(자살예방) 교육', '심폐소생술 등 응급처치 교육', '직장 내 괴롭힘 예방교육', '가정폭력 예방교육', '성매매 예방교육'];

/* 연수 이름 열쇠: 띄어쓰기·가운뎃점·괄호 같은 것을 뺀 것(같은 연수인지) */
export const titleKey = t => String(t || '').toLowerCase().replace(/[\s·・‧ㆍ.,()（）[\]［］「」『』<>〈〉_\-–—/]+/g, '');

/* ---------- 내 필수연수 ---------- */
export const STATUS = [['todo', '미이수'], ['done', '이수함'], ['sent', '제출함'], ['ok', '확인 완료'], ['back', '반려']];
const ST = STATUS.map(s => s[0]);
export const statusLabel = s => (STATUS.find(x => x[0] === s) || STATUS[0])[1];
/* 이수한 것(이수함·제출함·확인 완료) */
export const isDone = s => s === 'done' || s === 'sent' || s === 'ok';

export function normItem(v) {
  if (!isObj(v) || !str(v.title, 100)) return null;
  return { id: typeof v.id === 'string' && v.id ? v.id.slice(0, 40) : newId('tm'), title: str(v.title, 100), hours: num(v.hours), due: isDate(v.due) ? v.due : '',
    where: str(v.where, 60), status: ST.includes(v.status) ? v.status : 'todo', doneDate: isDate(v.doneDate) ? v.doneDate : '', cert: str(v.cert, 120),
    note: str(v.note, 200), from: str(v.from, 60), at: Number(v.at) || 0 };
}
/* 차례: 미이수·반려(기한 가까운 것 먼저, 기한 없는 것은 뒤) → 이수함 → 제출함 → 확인 완료, 같으면 이름 */
const RANK = { back: 0, todo: 0, done: 1, sent: 2, ok: 3 };
export function sortMine(list) {
  return [...(list || [])].sort((a, b) => (RANK[a.status] - RANK[b.status]) || ((a.due ? 0 : 1) - (b.due ? 0 : 1)) || String(a.due).localeCompare(String(b.due))
    || a.title.localeCompare(b.title, 'ko'));
}
export const listMine = () => { const v = get('training:mine', []); return sortMine((Array.isArray(v) ? v : []).map(normItem).filter(Boolean)); };
/* 저장 + 학사일정의 연수 일정(training)을 다시 맞춤. 저장하지 못하면 false */
export function saveMine(list) {
  const clean = (list || []).map(normItem).filter(Boolean).slice(0, 60);
  if (!set('training:mine', clean)) return false;
  setEvents('training', mineEvents(clean));
  return true;
}
/* 학사일정 일정: 이수하지 않은 연수의 기한(선생님 일 — 학부모 안내에는 넣지 않음) */
export const mineEvents = list => (list || []).filter(x => x && !isDone(x.status) && isDate(x.due)).map(x => ({ date: x.due, title: `[연수] ${x.title} 이수 기한` }));
/* 기본 목록 더하기: 이미 있는 이름(열쇠가 같은 것)은 빼고 → 더한 줄 */
export function withDefaults(list, names = DEFAULTS) {
  const have = new Set((list || []).map(x => titleKey(x.title)));
  const add = names.filter(n => !have.has(titleKey(n))).map(title => normItem({ title, at: Date.now() }));
  return { list: [...(list || []), ...add], added: add.length };
}
export function mineSummary(list, today) {
  const l = list || [];
  const done = l.filter(x => isDone(x.status));
  const late = l.filter(x => !isDone(x.status) && isDate(x.due) && dday(x.due, today) < 0).length;
  return { total: l.length, done: done.length, hours: Math.round(done.reduce((s, x) => s + (x.hours || 0), 0) * 10) / 10, late, back: l.filter(x => x.status === 'back').length };
}

/* ---------- 이수증 읽기(AI 없이) ---------- */
// 연수 이름에서 견주지 않는 낱말(어느 연수에나 붙는 말)
const SKIP = /교육|연수|예방|이수증|수료증|이수|수료|온라인|원격|집합|과정|직무|증명서|확인서|및|등|교직원|교원|대상|필수|법정|의무|실시|안내|pdf|hwpx?|docx|jpe?g|png/g;
const words = t => String(t || '').toLowerCase().split(/[\s·・‧ㆍ.,()（）[\]［］「」『』<>〈〉_\-–—/]+/).map(w => w.replace(SKIP, '')).filter(w => w.length >= 2);
const grams = w => { const out = []; for (let i = 0; i + 1 < w.length; i++) out.push(w.slice(i, i + 2)); return out; };
/* 연수 이름이 글(파일 이름·이수증 글)과 얼마나 겹치는지: { whole(글에 통째로 든 낱말 수 — 「청렴」), hits(겹친 두 글자 묶음 수), ratio } */
export function courseScore(title, text) {
  const ws = [...new Set(words(title))], g = [...new Set(ws.flatMap(grams))];
  if (!g.length) return { whole: 0, hits: 0, ratio: 0 };
  const k = titleKey(text);
  const hits = g.filter(x => k.includes(x)).length;
  return { whole: ws.filter(w => k.includes(w)).length, hits, ratio: hits / g.length };
}
/* 글에 맞는 연수 하나(겹침이 두 묶음 넘거나 절반 넘게, 가장 많이 겹친 것이 하나일 때). 없으면 null. one: 연수가 하나뿐이면 그것 */
export function bestCourse(courses, text, { one = false } = {}) {
  const list = (courses || []).filter(c => c && c.title);
  if (one && list.length === 1) return list[0];
  const sc = list.map(c => ({ c, ...courseScore(c.title, text) })).filter(x => x.whole >= 1 || x.hits >= 2 || (x.hits >= 1 && x.ratio >= 0.5))
    .sort((a, b) => b.whole - a.whole || b.hits - a.hits || b.ratio - a.ratio);
  if (!sc.length) return null;
  if (sc.length > 1 && sc[1].whole === sc[0].whole && sc[1].hits === sc[0].hits && sc[1].ratio === sc[0].ratio) return null;
  return sc[0].c;
}
/* 글 속 날짜들(2026. 11. 3. · 2026-11-03 · 2026년 11월 3일 · 2026.11.03) → [{ iso, at }] */
const DATE_RE = /(20\d{2})\s*(?:[.\-/]|년)\s*(\d{1,2})\s*(?:[.\-/]|월)\s*(\d{1,2})\s*(?:일|\.)?/g;
function datesIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(DATE_RE)) {
    const mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push({ iso: `${m[1]}-${pad(mo)}-${pad(d)}`, at: m.index });
  }
  return out;
}
/* 이수일: 「이수일·수료일·이수 일자·교육 기간·기간」 이름표가 있는 줄의 날짜(기간이면 끝 날), 없으면 글 속 마지막 날짜. 없으면 '' */
export function certDate(text) {
  const lines = String(text || '').split(/\n/);
  for (const l of lines) {
    if (!/이수\s*일|수료\s*일|이수\s*일자|수료\s*일자|교육\s*기간|연수\s*기간|학습\s*기간|기\s*간/.test(l)) continue;
    const ds = datesIn(l);
    if (ds.length) return ds[ds.length - 1].iso;
  }
  const all = datesIn(text);
  return all.length ? all[all.length - 1].iso : '';
}
/* 이수 시간: 「n시간」(없으면 「n차시」). 없으면 null */
export function certHours(text) {
  const t = String(text || '');
  const h = /(\d{1,3}(?:\.\d)?)\s*시간/.exec(t) || /(\d{1,3})\s*차시/.exec(t);
  return h ? num(h[1]) : null;
}
/* 이수증 한 장 → 어느 줄인지(id, 못 맞추면 null)·이수일·시간. name: 파일 이름, text: 읽은 글(사진·스캔은 '') */
export function readCert({ name = '', text = '' } = {}, items = []) {
  const pick = bestCourse(items, `${name}\n${text}`);
  return { id: pick ? pick.id : null, doneDate: certDate(text), hours: certHours(text) };
}
/* 이수증을 그 줄에 넣기 → 바뀐 줄 */
export const applyCert = (item, { name, doneDate, hours }, today) => ({ ...item, status: item.status === 'sent' || item.status === 'ok' ? item.status : 'done',
  cert: str(name, 120), doneDate: doneDate || item.doneDate || today, hours: item.hours || hours || null, note: item.status === 'back' ? '' : item.note });

/* ---------- 공문에서 ---------- */
/* 연수 공문인지: 제목·요약·할 일·제출 내용에 연수·교육이 있고 이수·수료 말이 있음 */
export function trainingLike(doc) {
  if (!doc) return false;
  const t = [doc.title, doc.name, doc.summary, doc.dueNote, ...(doc.tasks || []).map(x => x && x.text)].filter(Boolean).join(' ');
  return /연수|교육/.test(t) && /이수|수료/.test(t);
}
/* 공문 제목 → 연수 이름: 앞의 [..]·학년도, 뒤의 「(이수) 실시 안내·알림·협조·요청·계획·…에 대한」 같은 꼬리를 뺌 */
export function courseTitle(title) {
  let t = String(title || '').replace(/^\s*(?:\[[^\]]*\]|【[^】]*】|\([^)]*\))\s*/, '').replace(/^\s*20\d{2}\s*(?:학년도|년)?\s*(?:[12]\s*학기)?\s*/, '').trim();
  for (let i = 0; i < 4; i++) {
    const n = t.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*(?:에\s*대한|관련|건)\s*$/, '')
      .replace(/\s*(?:이수|실시|운영|참여|수강|이수증\s*제출|결과\s*제출|제출)?\s*(?:안내|알림|협조|요청|공문|계획|통보|알림\s*및\s*협조)\s*$/, '').trim();
    if (n === t) break;
    t = n;
  }
  t = t.replace(/^(?:교직원|교원|전\s*교직원)\s+/, '').trim();
  return str(t || title, 100);
}
/* 공문 → 내 필수연수 줄(또는 현황판 연수)의 이름·기한 */
export function fromGongmun(doc) {
  const due = isDate(doc && doc.due) ? doc.due : ((doc && doc.tasks) || []).map(x => x && x.due).filter(isDate).sort()[0] || '';
  return { title: courseTitle((doc && (doc.title || doc.name)) || '연수'), due, from: doc && doc.id ? `gongmun:${doc.id}` : '' };
}

/* ---------- 연수 현황판 ---------- */
export const MARKS = [['', '미제출'], ['sent', '제출'], ['ok', '확인'], ['back', '반려']];
export const markLabel = s => (MARKS.find(x => x[0] === (s || '')) || MARKS[0])[1];
const MK = ['sent', 'ok', 'back'];
/* 칸 누르기: 미제출 → 제출 → 확인 → 미제출(반려는 그 연수 시트에서) */
export const nextMark = s => (s === 'sent' ? 'ok' : s === 'ok' || s === 'back' ? '' : 'sent');
// 이름 뒤 호칭(「김하늘 선생님」)은 뺌
const cleanName = n => str(n, 30).replace(/\s*(?:선생님|선생|교사|님|주무관|실무사)$/, '').trim();

export function normBoard(v) {
  const o = isObj(v) ? v : {};
  const staff = (Array.isArray(o.staff) ? o.staff : []).filter(isObj).map(s => ({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newId('st'), name: cleanName(s.name), dept: str(s.dept, 30) }))
    .filter(s => s.name).slice(0, 300);
  const courses = (Array.isArray(o.courses) ? o.courses : []).filter(isObj).map(c => ({ id: typeof c.id === 'string' && c.id ? c.id.slice(0, 40) : newId('tc'), title: str(c.title, 100),
    due: isDate(c.due) ? c.due : '', from: str(c.from, 60) })).filter(c => c.title).slice(0, 40);
  const sid = new Set(staff.map(s => s.id)), cid = new Set(courses.map(c => c.id)), marks = {};
  for (const [c, row] of Object.entries(isObj(o.marks) ? o.marks : {})) {
    if (!cid.has(c) || !isObj(row)) continue;
    for (const [s, m] of Object.entries(row)) {
      if (!sid.has(s) || !isObj(m) || !MK.includes(m.s)) continue;
      (marks[c] = marks[c] || {})[s] = { s: m.s, file: str(m.file, 120), note: str(m.note, 200), at: Number(m.at) || 0 };
    }
  }
  return { staff, courses, marks };
}
export const getBoard = () => normBoard(get('training:board', null));
export const saveBoard = b => set('training:board', normBoard(b));
export const markOf = (b, cid, sid) => ((b.marks || {})[cid] || {})[sid] || null;
/* 칸 바꾸기(s가 ''면 미제출로) → 새 판 */
export function setMark(b, cid, sid, s, extra = {}) {
  const marks = { ...(b.marks || {}) }, row = { ...(marks[cid] || {}) };
  if (!s) delete row[sid]; else row[sid] = { ...(row[sid] || {}), ...extra, s, at: Date.now() };
  marks[cid] = row;
  return { ...b, marks };
}
/* 연수마다: 전체·제출·확인·반려·미제출·이수율(제출+확인) */
export function courseStats(b, cid) {
  const row = (b.marks || {})[cid] || {}, total = (b.staff || []).length;
  const n = s => (b.staff || []).filter(x => (row[x.id] || {}).s === s).length;
  const sent = n('sent'), ok = n('ok'), back = n('back');
  return { total, sent, ok, back, none: total - sent - ok - back, rate: total ? Math.round(((sent + ok) / total) * 100) : 0 };
}
export const missingStaff = (b, cid) => (b.staff || []).filter(s => { const m = markOf(b, cid, s.id); return !m || m.s === 'back'; });

/* 명단 붙여 넣기: 한 줄에 한 명(「이름 ⇥ 부서」·「이름, 부서」·「이름  부서」), 머리 줄(이름·성명)은 뺌 → [{ name, dept }] */
export function parseStaff(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim().replace(/^\d+\s*[.)]\s*/, ''); // 「1. 한가람」의 번호
    if (!l) continue;
    const cells = (l.includes('\t') ? l.split('\t') : l.includes(',') ? l.split(',') : l.split(/\s{2,}/)).map(c => c.trim()).filter(Boolean);
    if (!cells.length || cells.some(c => /^(이름|성명|교직원명|성\s*명)$/.test(c))) continue;
    // 한 줄에 이름만 여러 개(「김하늘 이바다 한가람」)
    if (cells.length === 1 && /^[가-힣]{2,5}(?:\s+[가-힣]{2,5}){2,}$/.test(cells[0])) { cells[0].split(/\s+/).forEach(n => out.push({ name: cleanName(n), dept: '' })); continue; }
    // 번호 칸(「1」「1.」)은 건너뜀
    const c = cells.filter(x => !/^\d+[.)]?$/.test(x));
    const name = cleanName(c[0] || '');
    if (name && /[가-힣A-Za-z]/.test(name)) out.push({ name, dept: str(c.slice(1).join(' '), 30) });
  }
  return out;
}
/* 명단 파일(엑셀·CSV) 표 → [{ name, dept }]: 「이름·성명」 열, 「부서·소속·직위·직급·담당·교과」 열. 머리 줄이 없으면 첫 열 */
export function staffFromRows(rows) {
  const rs = (rows || []).map(r => (r || []).map(c => String(c == null ? '' : c).trim()));
  const hi = rs.findIndex(r => r.some(c => /^(이름|성명|교직원명|성\s*명)$/.test(c)));
  if (hi < 0) return parseStaff(rs.map(r => r.join('\t')).join('\n'));
  const h = rs[hi], ni = h.findIndex(c => /^(이름|성명|교직원명|성\s*명)$/.test(c)), di = h.findIndex(c => /^(부서|소속|직위|직급|담당|교과|업무)$/.test(c));
  return rs.slice(hi + 1).map(r => ({ name: cleanName(r[ni] || ''), dept: di >= 0 ? str(r[di], 30) : '' })).filter(s => s.name && /[가-힣A-Za-z]/.test(s.name));
}
/* 명단 더하기: 같은 이름·부서는 한 번 → { staff, added } */
export function mergeStaff(staff, list) {
  const have = new Set((staff || []).map(s => s.name + '|' + s.dept)), out = [...(staff || [])];
  let added = 0;
  for (const s of list || []) {
    const k = s.name + '|' + (s.dept || '');
    if (!s.name || have.has(k)) continue;
    have.add(k); out.push({ id: newId('st'), name: s.name, dept: s.dept || '' }); added++;
  }
  return { staff: out, added };
}

/* 이수증 파일 하나 → 누구(sid)·어느 연수(cid). 이름은 파일 이름에서 먼저, 없으면 글에서(띄어 쓴 「김 하늘」도). 둘 이상이면 못 맞춤(null) */
export function matchFile({ name = '', text = '' } = {}, b) {
  const staff = (b && b.staff) || [];
  const who = src => {
    const k = String(src || '').replace(/\s+/g, '');
    // 더 긴 이름 안에 든 이름(「김하늘」 안의 「하늘」 같은 것)은 빼고
    const hit = staff.filter(s => s.name && k.includes(s.name.replace(/\s+/g, '')));
    const longest = hit.filter(s => !hit.some(o => o !== s && o.name.length > s.name.length && o.name.includes(s.name)));
    const names = [...new Set(longest.map(s => s.name))];
    return names.length === 1 ? longest : names.length ? 'many' : [];
  };
  let w = who(name.replace(/\.[a-z0-9]+$/i, ''));
  if (Array.isArray(w) && !w.length && text) w = who(text);
  // 같은 이름이 둘(부서가 다름)이면 부서 이름이 파일·글에 있는 쪽
  if (Array.isArray(w) && w.length > 1) { const d = w.filter(s => s.dept && `${name} ${text}`.includes(s.dept)); w = d.length === 1 ? d : 'many'; }
  const course = bestCourse((b && b.courses) || [], `${name}\n${text}`, { one: true });
  return { sid: Array.isArray(w) && w.length === 1 ? w[0].id : null, cid: course ? course.id : null, many: w === 'many' };
}

/* 엑셀(CSV): 이름, 부서, 연수…, 맨 아래 이수율 */
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function boardCsv(b) {
  const head = ['이름', '부서', ...b.courses.map(c => c.title + (c.due ? `(기한 ${c.due})` : ''))];
  const rows = b.staff.map(s => [s.name, s.dept, ...b.courses.map(c => { const m = markOf(b, c.id, s.id); return m ? markLabel(m.s) + (m.s === 'back' && m.note ? `(${m.note})` : '') : ''; })]);
  const rate = ['이수율', '', ...b.courses.map(c => `${courseStats(b, c.id).rate}%`)];
  return '﻿' + [head, ...rows, rate].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
/* 독려 쪽지 글(이름 없음, AI 없이) */
export function nudgeText(course) {
  const t = course.title;
  return [`[제출 안내] ${t} 이수증 제출 안내`, '', '안녕하세요 선생님.', `${t} 이수증 제출을 다시 한번 안내드립니다.`, '',
    ...(course.due ? [`□ 기한: ${dotDate(course.due)}까지`] : []),
    '□ 제출: 이수 후 이수증(PDF)을 보내 주세요.', '', '아직 이수증을 내지 않으신 선생님께서는 기한 안에 이수해 주시기 바랍니다.', '', '감사합니다.'].join('\n');
}

/* ---------- 다른 메뉴로 ---------- */
/* 「오늘 할 일」 줄(briefing): 미이수 연수 기한이 지났거나 14일 안, 현황판 연수 기한이 7일 안(지난 것은 30일까지)이고 미제출이 있으면 */
export function briefLines({ mine = [], board = null, today } = {}) {
  const out = [];
  for (const x of mine) {
    if (isDone(x.status) || !isDate(x.due)) continue;
    const n = dday(x.due, today);
    if (n == null || n > 14 || n < -60) continue;
    out.push({ n, text: `필수연수 「${x.title}」 ${x.status === 'back' ? '다시 이수(반려)' : '이수'}`, when: ddayText(n), hot: n <= 3, route: { to: 'training', tab: 'mine' } });
  }
  for (const c of (board && board.courses) || []) {
    if (!isDate(c.due) || !board.staff.length) continue;
    const n = dday(c.due, today), st = courseStats(board, c.id), left = st.none + st.back;
    if (n == null || n > 7 || n < -30 || !left) continue;
    out.push({ n, text: `연수 현황 「${c.title}」 미제출 ${left}명`, when: ddayText(n), hot: n <= 1, route: { to: 'training', tab: 'board' } });
  }
  return out.sort((a, b) => a.n - b.n).map(({ n, ...x }) => x);
}
/* 인수인계서 줄: 연수마다 이름·기한·이수율(사람 이름 없음) */
export const handoverRows = b => ((b && b.courses) || []).map(c => { const s = courseStats(b, c.id); return [c.title, c.due || '', `${s.sent + s.ok}/${s.total}명(${s.rate}%)`]; });
/* 「쌤」 채팅 답(AI 없이): 남은 필수연수 */
export function chatAnswer(mine, today) {
  const left = (mine || []).filter(x => !isDone(x.status));
  if (!(mine || []).length) return '연수 › 내 필수연수에 아직 연수가 없어요. [기본 목록 넣기]나 공문 처리의 [내 필수연수에 넣기]로 넣어 보세요.';
  if (!left.length) return `올해 필수연수 ${mine.length}개를 모두 이수했어요.`;
  const near = sortMine(left).find(x => isDate(x.due));
  return `아직 이수하지 않은 필수연수가 ${left.length}개예요${near ? ` — 가장 가까운 기한은 「${near.title}」 ${dotDate(near.due)}(${ddayText(dday(near.due, today))})` : ''}.`;
}
/* 새 학년도로 넘길 것: 내 필수연수·현황판 연수는 이름만(기한·상태는 새로), 현황판 명단은 그대로 */
export function carry(mineRaw, boardRaw) {
  const out = {};
  const mine = (Array.isArray(mineRaw) ? mineRaw : []).map(normItem).filter(Boolean);
  if (mine.length) out['training:mine'] = mine.map(x => ({ id: x.id, title: x.title, where: x.where, status: 'todo' }));
  const b = normBoard(boardRaw);
  if (b.staff.length || b.courses.length) out['training:board'] = { staff: b.staff, courses: b.courses.map(c => ({ id: c.id, title: c.title })), marks: {} };
  return out;
}
