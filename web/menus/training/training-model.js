/* 연수 메뉴 규칙·저장 (스펙 2026-11-18-training-design). 화면 없음 — Node 시험에서도 씀. 화면은 training.js.
   AI를 부르지 않음: 이수증·교직원 명단은 이 컴퓨터 안에서만 읽음(교직원 이름은 AI로 보내지 않음).
   저장(학년도 자료): training:mine(내 필수연수 줄), training:board(연수 현황판 — 담당 선생님의 명단·연수·제출 상태) */
import { get, set } from '../../core/store.js';
import { setEvents } from '../../core/calendar.js';
import { maskStaff, looksLikeName } from '../../core/privacy.js';

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
export function certDate(text, today = '') {
  const lines = String(text || '').split(/\n/), ok = d => !today || d <= today; // 앞날(교육 기간 끝·발급 예정)은 이수일이 아님
  const pick = re => { for (const l of lines) { if (!re.test(l)) continue; const ds = datesIn(l).map(x => x.iso).filter(ok); if (ds.length) return ds[ds.length - 1]; } return ''; };
  // 1) 「이수일·수료일(자)」 이름표(띄어 쓴 「이 수 일」도), 2) 끝난 기간의 끝 날, 3) 발급·발행·기간 줄을 뺀 글 속 마지막 날짜,
  // 4) 발급·발행 날짜, 5) 끝나지 않은 기간(「2026. 3. 1. ~ 2026. 12. 31.」 같은 1년 학습 기간)의 첫날 — 그 첫날은 이수일보다 나중 말이 없을 때만
  const a = pick(/이\s*수\s*일\s*자?|수\s*료\s*일\s*자?/);
  if (a) return a;
  const PERIOD = /(?:교\s*육|연\s*수|학\s*습)?\s*기\s*간/, ISSUE = /발\s*급|발\s*행/, iso = l => datesIn(l).map(x => x.iso);
  let start = '';
  for (const l of lines) {
    if (!PERIOD.test(l)) continue;
    const ds = iso(l);
    if (!ds.length) continue;
    if (ok(ds[ds.length - 1])) return ds[ds.length - 1];
    if (!start) start = ds.find(ok) || '';
  }
  const all = lines.filter(l => !ISSUE.test(l) && !PERIOD.test(l)).flatMap(iso).filter(ok);
  if (all.length) return all[all.length - 1];
  // 발급일만 있으면 그 날(오늘보다는 이수일에 가까움)
  const iss = lines.filter(l => ISSUE.test(l)).flatMap(iso).filter(ok);
  return iss.length ? iss[iss.length - 1] : start;
}
/* 이수 시간: 「n시간」(없으면 「n차시」). 없으면 null */
export function certHours(text) {
  const t = String(text || '');
  const hm = /(\d{1,3})\s*시간\s*(\d{1,2})\s*분/.exec(t);
  if (hm) return num(+hm[1] + +hm[2] / 60);
  const h = /(\d{1,3}(?:\.\d)?)\s*시간/.exec(t);
  if (h) return num(h[1]);
  const m = /(\d{2,4})\s*분(?![가-힣])/.exec(t);
  if (m) return num(+m[1] / 60);
  const c = /(\d{1,3})\s*차시/.exec(t);
  return c ? num(c[1]) : null;
}
/* 이수증 한 장 → 어느 줄인지(id, 못 맞추면 null)·이수일·시간. name: 파일 이름, text: 읽은 글(사진·스캔은 '') */
export function readCert({ name = '', text = '' } = {}, items = [], today = '') {
  const pick = bestCourse(items, `${name}\n${text}`);
  return { id: pick ? pick.id : null, doneDate: certDate(text, today), hours: certHours(text) };
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

/* 구분(교육청 실적 칸): 교원·직원·공무직. 명단의 부서·직위 글로 짐작(「보건교사·영양교사·사서교사」는 교원, 「교무실무사·돌봄전담사·조리」는 공무직), 모르면 '' */
export const KINDS = ['교원', '직원', '공무직'];
export function guessKind(dept) {
  const d = String(dept || '');
  if (/교사|교감|교장/.test(d)) return '교원';
  if (/공무직|실무사|실무원|조리|돌봄|전담사|배움터|당직|미화|청소|영양사|사서(?!교사)|시설/.test(d)) return '공무직';
  if (/행정|주무관|실장/.test(d)) return '직원';
  if (/담임|학년|교과|전담|부장|수석|보건|상담|교무|연구|특수|기간제|\d\s*-\s*\d|\d\s*반/.test(d)) return '교원';
  return '';
}
// 저장한 구분(''은 「구분 없음」으로 고른 것)이 있으면 그것, 없으면 짐작
const kindOf = (k, dept) => (KINDS.includes(k) ? k : k === '' ? '' : guessKind(dept));

export function normBoard(v) {
  const o = isObj(v) ? v : {};
  const staff = (Array.isArray(o.staff) ? o.staff : []).filter(isObj).map(s => ({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 40) : newId('st'), name: cleanName(s.name), dept: str(s.dept, 30),
    kind: kindOf(s.kind, s.dept) }))
    .filter(s => s.name).slice(0, 300);
  // target: 연수 대상 구분(비면 전 교직원)
  const courses = (Array.isArray(o.courses) ? o.courses : []).filter(isObj).map(c => ({ id: typeof c.id === 'string' && c.id ? c.id.slice(0, 40) : newId('tc'), title: str(c.title, 100),
    due: isDate(c.due) ? c.due : '', from: str(c.from, 60), target: (Array.isArray(c.target) ? c.target : []).filter(k => KINDS.includes(k)),
    // inhouse: 교내 자율연수(직접 여는 연수) — 일시·시각·장소·강사·연수 시간
    inhouse: isObj(c.inhouse) ? { date: isDate(c.inhouse.date) ? c.inhouse.date : '', time: str(c.inhouse.time, 30), place: str(c.inhouse.place, 60), lecturer: str(c.inhouse.lecturer, 60), hours: num(c.inhouse.hours) } : null
  })).filter(c => c.title).slice(0, 40);
  const sid = new Set(staff.map(s => s.id)), cid = new Set(courses.map(c => c.id)), marks = {};
  for (const [c, row] of Object.entries(isObj(o.marks) ? o.marks : {})) {
    if (!cid.has(c) || !isObj(row)) continue;
    for (const [s, m] of Object.entries(row)) {
      if (!sid.has(s) || !isObj(m) || !MK.includes(m.s)) continue;
      // date·hours: 이수증 글에서 읽은 이수일·시간, link: 구글 폼 파일 주소, kept: 이 기기에 파일을 보관함
      (marks[c] = marks[c] || {})[s] = { s: m.s, file: str(m.file, 120), note: str(m.note, 200), at: Number(m.at) || 0, date: isDate(m.date) ? m.date : '', hours: num(m.hours),
        link: /^https?:\/\//.test(String(m.link || '')) ? String(m.link).slice(0, 300) : '', kept: !!m.kept };
    }
  }
  return { staff, courses, marks };
}
/* 그 연수의 대상인지(대상을 고르지 않았으면 모두) */
export const inTarget = (c, s) => !!c && !!s && (!(c.target || []).length || c.target.includes(s.kind));
export const targetStaff = (b, c) => (b.staff || []).filter(s => inTarget(c, s));
export const targetLabel = c => ((c && c.target && c.target.length) ? c.target.join('·') : '전 교직원');
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
/* 연수마다(대상만): 전체·제출·확인·반려·미제출·이수율(제출+확인). only: 이 사람들 가운데서만(구분별) */
export function courseStats(b, cid, only = null) {
  const c = (b.courses || []).find(x => x.id === cid), row = (b.marks || {})[cid] || {};
  const who = targetStaff(b, c || {}).filter(s => !only || only(s)), total = who.length;
  const n = s => who.filter(x => (row[x.id] || {}).s === s).length;
  const sent = n('sent'), ok = n('ok'), back = n('back');
  return { total, sent, ok, back, none: total - sent - ok - back, done: sent + ok, rate: total ? Math.round(((sent + ok) / total) * 100) : 0 };
}
export const missingStaff = (b, cid) => { const c = (b.courses || []).find(x => x.id === cid); return targetStaff(b, c || {}).filter(s => { const m = markOf(b, cid, s.id); return !m || m.s === 'back'; }); };
/* 구분별 실적: [{ kind, total, done, rate }] — 그 연수 대상이 있는 구분만(구분 없는 사람은 「구분 없음」), 끝에 계 */
export function kindRows(b, cid) {
  const c = (b.courses || []).find(x => x.id === cid), who = targetStaff(b, c || {});
  const ks = [...KINDS, ''].filter(k => who.some(s => s.kind === k));
  const rows = ks.map(k => { const st = courseStats(b, cid, s => s.kind === k); return { kind: k || '구분 없음', total: st.total, done: st.done, rate: st.rate }; });
  const all = courseStats(b, cid);
  return [...rows, { kind: '계', total: all.total, done: all.done, rate: all.rate }];
}
/* 교육청 실적 표(한글·엑셀 표에 붙여 넣는 탭 글): 연수 | 구분 | 대상 | 이수 | 미이수 | 이수율 */
export function statsTsv(b, cids = null) {
  const cs = (b.courses || []).filter(c => !cids || cids.includes(c.id));
  const lines = [['연수', '구분', '대상', '이수', '미이수', '이수율'].join('\t')];
  for (const c of cs) for (const r of kindRows(b, c.id)) lines.push([c.title, r.kind, r.total, r.done, r.total - r.done, `${r.rate}%`].join('\t'));
  return lines.join('\n');
}

/* 명단 붙여 넣기: 한 줄에 한 명(「이름 ⇥ 부서」·「이름, 부서」·「이름  부서」), 머리 줄(이름·성명)은 뺌 → [{ name, dept }] */
// 명단 머리 칸(이름·성명·성함·교직원명, 표에서 붙여 넣은 「성 명」「이 름」도) — 붙여넣기·파일·구글 폼 모두 이것 하나로
const STAFF_H = /^(이\s*름|성\s*명|성\s*함|교직원명)$/;
// 띄어쓰기로 나눈 줄의 이름 낱말: 성으로 시작하는 2~4자(교감·체육·보건은 아님), 맡은 일·과목 말(전담·국어·연구원…)과 부서·직위 끝말은 아님(김지원·최예원은 이름)
const ROLE_TOK = /^(?:전담|조리|조리원|조리사|도서|정보|진로|국어|연구|연구원|원어민|방과후|수석|교감|담임|유아|기간제|강사|주무|서무|방송|당직|특수|돌봄|보건|영양|상담|사서|행정|교무|교사|교장|부장)$/;
const nameTok = t => looksLikeName(t) && !ROLE_TOK.test(t) && !/(?:부|실|과|반|년|장|사|관|무|교사|선생님?|님|팀|전담|담임)$/.test(t);
export function parseStaff(text) {
  // 머리 줄(「연번 ⇥ 부서 ⇥ 성명」)이 있는 엑셀 붙여넣기는 칸 이름대로(성명 칸이 첫 칸이 아니어도)
  const rows = String(text || '').split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t'));
  if (rows.some(r => r.length > 1 && r.some(c => STAFF_H.test(c.trim())))) return staffFromRows(rows);
  return parseStaffLines(text);
}
/* 머리 칸 없는 줄 읽기(staffFromRows가 머리 줄을 못 찾을 때도 — parseStaff를 다시 부르지 않음) */
function parseStaffLines(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim().replace(/^\d+\s*[.)]\s*/, ''); // 「1. 한가람」의 번호
    if (!l) continue;
    let cells = (l.includes('\t') ? l.split('\t') : l.includes(',') ? l.split(',') : l.split(/\s{2,}/)).map(c => c.trim()).filter(Boolean);
    if (!cells.length || cells.some(c => STAFF_H.test(c))) continue;
    // 띄어쓰기 하나로만 나눈 줄(「김하늘 교무부 부장」「김하늘 이바다 한가람」): 모두 이름 모양이면 여러 사람, 아니면 첫 낱말이 이름·나머지는 부서
    if (cells.length === 1 && /\s/.test(cells[0]) && /[가-힣]/.test(cells[0])) {
      const toks = cells[0].split(/\s+/);
      if (toks.length >= 2 && toks.every(nameTok)) { toks.forEach(n => out.push({ name: cleanName(n), dept: '' })); continue; }
      if (/^[가-힣]{2,5}$/.test(toks[0])) cells = [toks[0], toks.slice(1).join(' ')];
    }
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
  const hi = rs.findIndex(r => r.some(c => STAFF_H.test(c)));
  if (hi < 0) return parseStaffLines(rs.map(r => r.join('\t')).join('\n'));
  const h = rs[hi], ni = h.findIndex(c => STAFF_H.test(c));
  const dis = h.map((c, i) => (/^(부서|소속|직위|직급|직종|담당|교과|업무)$/.test(c) ? i : -1)).filter(i => i >= 0), ki = h.findIndex(c => /^(구분|직군)$/.test(c));
  // 구분 칸: 교원·교사 → 교원, 직원·행정직·일반직 → 직원, 공무직·교육공무직 → 공무직
  const kindCell = v => (/공무직/.test(v) ? '공무직' : /교원|교사|교감|교장/.test(v) ? '교원' : /직원|행정|일반직|지방공무원/.test(v) ? '직원' : '');
  return rs.slice(hi + 1).map(r => {
    const dept = str(dis.map(i => r[i] || '').filter(Boolean).join(' '), 30), k = ki >= 0 ? kindCell(r[ki] || '') : '';
    return { name: cleanName(String(r[ni] || '').replace(/^\d+\s*[.)]\s*/, '')), dept, ...(k ? { kind: k } : {}) };
  }).filter(s => s.name && /[가-힣A-Za-z]/.test(s.name));
}
/* 명단 더하기: 같은 이름·부서는 한 번 → { staff, added } */
export function mergeStaff(staff, list) {
  const have = new Set((staff || []).map(s => s.name + '|' + s.dept)), out = [...(staff || [])];
  let added = 0;
  for (const s of list || []) {
    const k = s.name + '|' + (s.dept || '');
    if (!s.name || have.has(k)) continue;
    have.add(k); out.push({ id: newId('st'), name: s.name, dept: s.dept || '', kind: KINDS.includes(s.kind) ? s.kind : guessKind(s.dept) }); added++;
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

/* 칸 글(명단표·결과 보고 명단): 대상 아님·미제출·반려(사유)·제출/확인(이수일) */
const mdot = d => (isDate(d) ? `${+d.slice(5, 7)}. ${+d.slice(8, 10)}.` : '');
export function cellText(b, c, s, { report = false } = {}) {
  if (!inTarget(c, s)) return report ? '대상 아님' : '—';
  const m = markOf(b, c.id, s.id);
  if (!m) return report ? '미이수' : '';
  if (m.s === 'back') return `반려${m.note ? `(${m.note})` : ''}`;
  const lab = report ? '이수' : markLabel(m.s);
  return m.date ? `${lab}(${mdot(m.date)})` : lab;
}
/* 엑셀(CSV): 이름, 구분, 부서, 연수…, 맨 아래 이수율, 그 아래 구분별 실적 */
const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function boardCsv(b) {
  const head = ['이름', '구분', '부서', ...b.courses.map(c => c.title + (c.due ? `(기한 ${c.due})` : ''))];
  const rows = b.staff.map(s => [s.name, s.kind, s.dept, ...b.courses.map(c => cellText(b, c, s))]);
  const rate = ['이수율', '', '', ...b.courses.map(c => `${courseStats(b, c.id).rate}%`)];
  const kinds = statsTsv(b).split('\n').map(l => l.split('\t'));
  return '\uFEFF' + [head, ...rows, rate, [], ['[구분별 실적]'], ...kinds].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* ---------- 수합: 구글 폼 응답·묶음·결과 보고 ---------- */
const NAME_H = STAFF_H;
/* 구글 폼 날짜(「2026. 11. 2 오후 3:15:00」「2026/11/02 15:15:00」「2026-11-02」) → ISO, 아니면 '' */
const formDate = v => { const m = /(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/.exec(String(v || '')); return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : ''; };
/* 설문 응답 표 → { hits: [{ sid, cid, link, date }], miss: [{ name, course, link, date, sid }] }. cid: 연수 열이 없을 때의 연수(고른 것) */
export function formResponses(rows, b, { cid = '' } = {}) {
  const rs = (rows || []).map(r => (r || []).map(c => String(c == null ? '' : c).trim()));
  const hi = rs.findIndex(r => r.some(c => NAME_H.test(c)));
  if (hi < 0) return { hits: [], miss: [], noName: true };
  const h = rs[hi], col = re => h.findIndex(c => re.test(c));
  const ni = col(NAME_H), di = col(/^(부서|소속|직위|학년)/), ti = col(/타임스탬프|timestamp|제출\s*(일|시)|날짜/i);
  const ci = h.findIndex((c, i) => i !== ni && /연수|교육|과정/.test(c) && !/파일|이수증|업로드|첨부/.test(c));
  let fi = col(/파일|이수증|업로드|첨부/);
  if (fi < 0) fi = h.findIndex((_, i) => rs.slice(hi + 1).some(r => /^https?:\/\//.test(r[i] || '')));
  const hits = [], miss = [];
  for (const r of rs.slice(hi + 1)) {
    const name = cleanName(r[ni] || '');
    if (!name) continue;
    const key = name.replace(/\s+/g, '');
    let who = b.staff.filter(s => s.name.replace(/\s+/g, '') === key);
    if (who.length > 1 && di >= 0) who = who.filter(s => s.dept && (r[di] || '').includes(s.dept));
    const course = ci >= 0 ? bestCourse(b.courses, r[ci] || '', { one: true }) : b.courses.find(c => c.id === cid) || (b.courses.length === 1 ? b.courses[0] : null);
    const link = ((fi >= 0 ? r[fi] : '') || '').split(/[,\s]+/).find(x => /^https?:\/\//.test(x)) || '';
    const date = ti >= 0 ? formDate(r[ti]) : '';
    if (who.length === 1 && course) hits.push({ sid: who[0].id, cid: course.id, link, date });
    else miss.push({ name, course: course ? course.id : '', link, date, sid: who.length === 1 ? who[0].id : '' });
  }
  return { hits, miss, courseCol: ci >= 0 };
}
/* 파일 이름에 못 쓰는 글자 빼기 */
const safe = t => String(t || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '이름 없음';
/* 이 기기 보관 열쇠(학년도마다) */
export const fileKey = (year, cid, sid) => `${year}|${cid}|${sid}`;
/* 묶음 안 파일 이름: 연수명/연수명_이름(부서).확장자 */
export function bundleName(c, s, file) {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(String(file || '')) || [, 'pdf'])[1].toLowerCase();
  return `${safe(c.title)}/${safe(c.title)}_${safe(s.name)}${s.dept ? `(${safe(s.dept)})` : ''}.${ext}`;
}
/* 묶음(ZIP) 항목: files Map(fileKey → { name, bytes }) → [{ name, data }] + 「이수 현황.csv」(파일 없는 제출은 「종이·링크」) */
export function bundleEntries(b, files, { year, cids = null } = {}) {
  const out = [], used = new Set();
  const cs = b.courses.filter(c => !cids || cids.includes(c.id));
  const rows = [['연수', '이름', '구분', '부서', '상태', '이수일', '파일']];
  for (const c of cs) for (const s of targetStaff(b, c)) {
    const m = markOf(b, c.id, s.id);
    if (!m || m.s === 'back') { rows.push([c.title, s.name, s.kind, s.dept, m ? '반려' : '미제출', '', '']); continue; }
    const f = files && files.get(fileKey(year, c.id, s.id));
    let name = '';
    if (f && f.bytes) {
      name = bundleName(c, s, f.name);
      for (let i = 2; used.has(name); i++) name = name.replace(/(?: \(\d+\))?(\.[a-z0-9]+)$/i, ` (${i})$1`);
      used.add(name); out.push({ name, data: f.bytes });
    }
    rows.push([c.title, s.name, s.kind, s.dept, markLabel(m.s), m.date || '', name ? name.split('/').pop() : m.link ? `링크 ${m.link}` : '종이·링크']);
  }
  out.push({ name: '이수 현황.csv', data: '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n' });
  return out;
}
/* 사람별 미제출(개별 안내): 고른 연수 가운데 그 사람이 아직 내지 않은(반려 포함) 연수 → [{ s, courses }] */
export function missingByPerson(b, cids = null) {
  const cs = b.courses.filter(c => !cids || cids.includes(c.id));
  return b.staff.map(s => ({ s, courses: cs.filter(c => inTarget(c, s) && (() => { const m = markOf(b, c.id, s.id); return !m || m.s === 'back'; })()) })).filter(x => x.courses.length);
}
/* 개별 안내 글(이 컴퓨터 안에서 복사만): 「김하늘 선생님: 성희롱·성폭력 예방교육(11. 27.까지), 학교폭력 예방교육(반려 — 흐림)」 */
export function personalText(b, cids = null) {
  return missingByPerson(b, cids).map(({ s, courses }) => `${s.name} 선생님${s.dept ? `(${s.dept})` : ''}: ${courses.map(c => {
    const m = markOf(b, c.id, s.id);
    return `${c.title}${m && m.s === 'back' ? `(반려${m.note ? ` — ${m.note}` : ''})` : c.due ? `(${mdot(c.due)}까지)` : ''}`;
  }).join(', ')}`).join('\n');
}
/* 구글 폼 만들기 안내(현황판 연수 이름 그대로 — 응답을 넣을 때 맞추기 쉽게) */
export function formGuide(b, year) {
  const cs = b.courses.map(c => c.title);
  return [`[이수증 제출 구글 폼 만들기]`, `1. 구글 폼 새로 만들기 — 제목 예) ${year}학년도 법정의무교육 이수증 제출`, '2. 질문',
    '  - 성명 (단답형, 필수) ← 쌤비서가 이 칸으로 명단과 맞춰요',
    '  - 부서 (단답형) ← 같은 이름이 있을 때 가려요',
    ...(cs.length > 1 ? [`  - 연수 (객관식, 필수): ${cs.join(' / ')}`] : []),
    '  - 이수증 (파일 업로드, 필수 — PDF·이미지)',
    '3. 응답 탭 › 스프레드시트에 연결 › 파일 › 다운로드 › CSV(또는 엑셀) → 연수 현황판 [구글 폼 응답 넣기]',
    '4. 이수증 파일: 구글 드라이브의 「(파일 응답)」 폴더를 오른쪽 클릭 › 다운로드(ZIP) → [이수증 한꺼번에 넣기]',
    '   (구글 폼은 파일 이름 끝에 「- 응답자 이름」을 붙여 저장해서 이름으로 맞춰요)'].join('\n');
}
/* ---------- 교내 자율연수(스펙 2026-11-19-yearend-design §2) ---------- */
/* 안내 쪽지(AI 없이): 「[연수 안내] ○○」 일시·장소·대상·강사 */
export function inhouseNotice(c) {
  const h = c.inhouse || {};
  return [`[연수 안내] ${c.title}`, '', '안녕하세요 선생님.', `교내 자율연수 「${c.title}」을 다음과 같이 안내드립니다.`, '',
    ...(h.date ? [`□ 일시: ${dotDate(h.date)}${h.time ? ` ${h.time}` : ''}`] : []), ...(h.place ? [`□ 장소: ${h.place}`] : []),
    `□ 대상: ${targetLabel(c)}`, ...(h.lecturer ? [`□ 강사: ${h.lecturer}`] : []), ...(h.hours ? [`□ 연수 시간: ${h.hours}시간`] : []),
    '', '많은 참석 부탁드립니다.', '', '감사합니다.'].join('\n');
}
/* 출석 서명부(한글·워드·PDF): 연번·부서·이름·서명 — 대상 교직원 */
export function signSheetDoc(b, cid, { school = '' } = {}) {
  const c = b.courses.find(x => x.id === cid), h = (c && c.inhouse) || {};
  const head = [h.date ? `일시: ${dotDate(h.date)}${h.time ? ` ${h.time}` : ''}` : '', h.place ? `장소: ${h.place}` : '', h.lecturer ? `강사: ${h.lecturer}` : ''].filter(Boolean).join('   ');
  return { title: `${c.title} 출석 서명부`, blocks: [...(school ? [{ type: 'c', text: school }] : []), ...(head ? [{ type: 'p', text: head }] : []),
    { type: 'table', head: true, widths: [0.6, 1.6, 1.6, 2.2], rows: [['연번', '부서', '이름', '서명'], ...targetStaff(b, c).map((s, i) => [String(i + 1), s.dept, s.name, ''])] }] };
}
/* [모두 참석으로]: 대상 모두 「확인」(이수일 = 연수 날, 시간 = 연수 시간), 반려·확인은 그대로 → 새 판 */
export function allPresent(b, cid) {
  const c = b.courses.find(x => x.id === cid);
  if (!c) return b;
  let out = b;
  for (const s of targetStaff(b, c)) { const m = markOf(out, cid, s.id); if (!m || m.s === 'sent') out = setMark(out, cid, s.id, 'ok', { date: (c.inhouse && c.inhouse.date) || (m && m.date) || '', hours: (c.inhouse && c.inhouse.hours) || (m && m.hours) || null }); }
  return out;
}
/* 교내 연수 운영 결과 보고(내부결재 본문 + 붙임 출석 표). summary: 선생님이 적은 주요 내용 */
export function inhouseReportDoc(b, cid, { summary = '', year, school = '' } = {}) {
  const c = b.courses.find(x => x.id === cid), h = (c && c.inhouse) || {}, st = courseStats(b, cid);
  const P = text => ({ type: 'p', text }), miss = missingStaff(b, cid).length;
  const lines = String(summary || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return { title: `${year}학년도 교내 자율연수(${c.title}) 운영 결과 보고`, blocks: [
    P(`1. ${school ? `${school} ` : ''}교내 자율연수 「${c.title}」 운영 결과를 다음과 같이 보고합니다.`),
    P(`  가. 일시: ${h.date ? `${dotDate(h.date)}${h.time ? ` ${h.time}` : ''}` : ''}`), P(`  나. 장소: ${h.place || ''}`), P(`  다. 강사: ${h.lecturer || ''}`),
    P(`  라. 대상·참석: ${targetLabel(c)} ${st.total}명 중 ${st.done}명 참석(${st.rate}%)${h.hours ? ` · 연수 시간 ${h.hours}시간` : ''}`),
    P('  마. 주요 내용'), ...(lines.length ? lines.map(l => P(`    - ${l.replace(/^[-·•]\s*/, '')}`)) : [P('    - ')]),
    P(`  바. 불참: ${miss ? `${miss}명 — 개별 안내 후 이수하도록 함` : '없음'}`),
    P('붙임  출석부 1부.  끝.'),
    { type: 'break' }, { type: 'h', text: '붙임. 출석부' },
    { type: 'table', head: true, rows: [['연번', '부서', '이름', '참석'], ...targetStaff(b, c).map((s, i) => [String(i + 1), s.dept, s.name, cellText(b, c, s, { report: true }).replace(/^이수/, '참석').replace(/^미이수$/, '불참')])] }] };
}

/* AI로 가는 글(쪽지 작성에 넘김)에서 사람 이름 가리기: 넘긴 이름(강사·명단)은 ○○○, 「강사:」 줄, 직함 앞뒤 이름(maskStaff) */
/* 강사 칸(「새싹대학교 교수 탁보결」「탁보결 외 1명」)의 이름 모양 낱말 — 칸 전체와 함께 가림(연수 제목 속 「탁보결 교수 초청」도). 직함·소속 말은 뺌 */
const LECT_TITLE = /^(?:교수|부교수|경위|경감|경사|경장|순경|박사|강사|장학사|장학관|연구사|연구관|변호사|소장|센터장|팀장|원장|관장|대표|회장|이사|위원|위원장|명예교수)$/;
export const lecturerNames = l => { const s = String(l || '').trim(); return s ? [s, ...s.split(/[\s,，·、()（）\[\]［］/]+/).map(t => t.replace(/(?:님|씨|외)$/, '')).filter(t => looksLikeName(t) && !LECT_TITLE.test(t))] : []; };
export function maskForAI(text, names = []) {
  let t = String(text || '');
  for (const n of [...new Set((names || []).map(x => String(x || '').trim()).filter(x => x.length >= 2))].sort((a, b) => b.length - a.length)) t = t.split(n).join('○○○');
  t = t.replace(/^(□\s*강사\s*[:：]).*$/m, '$1 ○○○');
  return maskStaff(t).text;
}
/* ---------- 현황판 공유(내보내기·가져오기 — 이수증 파일은 빼고) ---------- */
export const BOARD_FILE = 'training-board';
export const exportBoard = (b, year) => JSON.stringify({ app: 'ssam', kind: BOARD_FILE, version: 1, year, at: new Date().toISOString(), board: normBoard(b) }, null, 1);
/* 파일 글 → 현황판(아니면 null). 보관 표시(kept)는 그 기기 파일이라 뺌 */
export function parseBoardFile(text) {
  let v;
  try { v = JSON.parse(String(text || '').replace(/^\uFEFF/, '')); } catch (e) { return null; }
  if (!isObj(v) || v.kind !== BOARD_FILE || !isObj(v.board)) return null;
  const b = normBoard(v.board);
  for (const row of Object.values(b.marks)) for (const m of Object.values(row)) m.kept = false;
  return b;
}
const RANK_MARK = { back: 1, sent: 2, ok: 3 };
/* 합치기: 같은 이름·부서는 한 사람, 같은 연수 이름은 한 연수, 칸은 더 나아간 상태(확인 > 제출 > 반려) */
export function mergeBoards(a, b) {
  const out = normBoard(a), sMap = new Map(), cMap = new Map();
  for (const s of b.staff) {
    const hit = out.staff.find(x => x.name === s.name && x.dept === s.dept);
    if (hit) sMap.set(s.id, hit.id); else { const id = out.staff.some(x => x.id === s.id) ? newId('st') : s.id; out.staff.push({ ...s, id }); sMap.set(s.id, id); }
  }
  for (const c of b.courses) {
    const hit = out.courses.find(x => titleKey(x.title) === titleKey(c.title));
    if (hit) { cMap.set(c.id, hit.id); if (!hit.due && c.due) hit.due = c.due; if (!hit.inhouse && c.inhouse) hit.inhouse = c.inhouse; }
    else { const id = out.courses.some(x => x.id === c.id) ? newId('tc') : c.id; out.courses.push({ ...c, id }); cMap.set(c.id, id); }
  }
  for (const [cid, row] of Object.entries(b.marks)) for (const [sid, m] of Object.entries(row)) {
    const c2 = cMap.get(cid), s2 = sMap.get(sid);
    if (!c2 || !s2) continue;
    const old = markOf(out, c2, s2);
    // 반려가 끼면 나중에 바꾼 쪽(at) — 반려하기 전에 내보낸 파일을 합쳐도 반려가 「제출」로 되돌아가지 않게. 그 밖에는 더 나아간 상태로
    const take = !old || (m.s === 'back' || old.s === 'back' ? (m.at || 0) > (old.at || 0) : RANK_MARK[m.s] > RANK_MARK[old.s]);
    if (take) (out.marks[c2] = out.marks[c2] || {})[s2] = { ...m, kept: old ? old.kept : false };
  }
  return normBoard(out);
}
/* 공문 → 결과 보고 「관련」 줄: 「발신 문서번호(2026. 11. 2.) 「제목」」 */
export function relatedOf(doc) {
  if (!doc) return '';
  const date = isDate(doc.date) ? `${doc.date.slice(0, 4)}. ${+doc.date.slice(5, 7)}. ${+doc.date.slice(8, 10)}.` : '';
  return [doc.from, doc.no ? `${doc.no}${date ? `(${date})` : ''}` : date ? `(${date})` : '', doc.title ? `「${doc.title}」` : ''].filter(Boolean).join(' ');
}
/* 결과 보고 기본 제목 */
export const reportTitle = (b, cids, year) => {
  const cs = b.courses.filter(c => cids.includes(c.id));
  return `${year}학년도 ${cs.length === 1 ? cs[0].title : `${(cs[0] || {}).title || '연수'} 등 법정의무교육`} 이수 결과 보고`;
};
/* 내부결재 결과 보고 문서 { title, blocks }(한글·워드·PDF 내보내기). 사람 이름이 든 문서라 AI로 보내지 않음 */
export function reportDoc(b, { cids, title = '', related = '', year, school = '' } = {}) {
  const cs = b.courses.filter(c => cids.includes(c.id));
  const who = b.staff.filter(s => cs.some(c => inTarget(c, s)));
  const count = list => KINDS.map(k => [k, list.filter(s => s.kind === k).length]).filter(([, n]) => n);
  const kinds = count(who), blocks = [], P = text => blocks.push({ type: 'p', text });
  let n = 1;
  if (related) P(`${n++}. 관련: ${related}`);
  P(`${n}. ${related ? '위 호와 관련하여 ' : ''}${school ? `${school} ` : '본교 '}교직원의 ${cs.length === 1 ? cs[0].title : '법정의무교육'} 이수 결과를 다음과 같이 보고합니다.`);
  P(`  가. 연수명: ${cs.map(c => c.title).join(', ')}`);
  P(`  나. 대상: ${cs.length === 1 && cs[0].target.length ? cs[0].target.join('·') : '교직원'} ${who.length}명${kinds.length > 1 ? `(${kinds.map(([k, x]) => `${k} ${x}명`).join(', ')})` : ''}`);
  P('  다. 이수 현황');
  blocks.push({ type: 'table', head: true, rows: [['연수', '대상', '이수', '미이수', '이수율'], ...cs.map(c => { const st = courseStats(b, c.id); return [c.title, `${st.total}명`, `${st.done}명`, `${st.total - st.done}명`, `${st.rate}%`]; })] });
  const multi = cs.some(c => kindRows(b, c.id).length > 2);
  if (multi) {
    P('  라. 구분별 이수 현황');
    blocks.push({ type: 'table', head: true, rows: [['연수', '구분', '대상', '이수', '이수율'], ...cs.flatMap(c => kindRows(b, c.id).map(r => [c.title, r.kind, `${r.total}명`, `${r.done}명`, `${r.rate}%`]))] });
  }
  const left = cs.map(c => [c, missingStaff(b, c.id).length]).filter(([, x]) => x);
  P(`  ${multi ? '마' : '라'}. 미이수: ${left.length ? `${left.map(([c, x]) => (cs.length > 1 ? `${c.title} ${x}명` : `${x}명`)).join(', ')} — 개별 안내 후 이수하도록 함` : '없음'}`);
  const certs = cs.reduce((t, c) => t + courseStats(b, c.id).done, 0);
  P(`붙임  1. 연수별 이수 현황 명단 1부.${certs ? '' : '  끝.'}`);
  if (certs) P(`      2. 이수증 ${certs}부.  끝.`);
  blocks.push({ type: 'break' }, { type: 'h', text: '붙임 1. 연수별 이수 현황 명단' },
    { type: 'table', head: true, rows: [['연번', '이름', '구분', '부서', ...cs.map(c => c.title)], ...who.map((s, i) => [String(i + 1), s.name, s.kind, s.dept, ...cs.map(c => cellText(b, c, s, { report: true }))])] });
  return { title: title || reportTitle(b, cids, year), blocks };
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
  if (b.staff.length || b.courses.length) out['training:board'] = { staff: b.staff, courses: b.courses.map(c => ({ id: c.id, title: c.title, target: c.target })), marks: {} };
  return out;
}
