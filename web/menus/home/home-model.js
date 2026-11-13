/* 「오늘」 화면 자료와 계산 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-11-11-ui-refresh-design.md §2
   화면(home.js)이 저장소에서 모은 것을 넘기면 카드·줄을 돌려줌. 저장 모양은 각 메뉴 그대로(여기서는 읽고, 캠프 출석만 고친 캠프를 돌려줌) */
import { isDate, weekday } from '../../core/calendar.js';
import { unitPos } from '../class/class-model.js';
import { dueSoon } from '../etc/gongmun-ai.js';
import { sessionsOn, nextMark, setMark, fmtTime } from '../class/camp-model.js';
import { totalScore, missingItems } from '../etc/multi-quant.js';
import { missingCount } from '../etc/multi-qual.js';
import { EMPTY } from '../../core/briefing.js';

const DAY = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const str = v => (typeof v === 'string' ? v : '');

/* 머리 첫 줄: 「11월 11일 수요일 · 2026학년도」 */
export function dateLine(today, year) {
  const y = `${year}학년도`;
  return isDate(today) ? `${+today.slice(5, 7)}월 ${+today.slice(8, 10)}일 ${DAY[weekday(today)]} · ${y}` : y;
}

/* 교시 시간(초등 40분 수업·10분 쉬는 시간, 4교시 뒤 점심). 앱에 학교 시정표가 없어서 이 시간으로 「지금」을 셈 */
export const BELL = [['09:00', '09:40'], ['09:50', '10:30'], ['10:40', '11:20'], ['11:30', '12:10'], ['13:00', '13:40'], ['13:50', '14:30'], ['14:40', '15:20']];
const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(str(t)); return m ? +m[1] * 60 + +m[2] : NaN; };
/* 그 시각의 교시: 수업 시간 안이면 { kind: 'now' }, 아니면 그날 다음 수업 { kind: 'next' }, 다 끝났으면 null. periods: 그날 수업이 있는 교시 */
export function periodNow(time, periods = []) {
  const t = toMin(time);
  if (!Number.isFinite(t)) return null;
  const ps = [...new Set(periods)].filter(p => BELL[p - 1]).sort((a, b) => a - b);
  for (const p of ps) {
    const [s, e] = BELL[p - 1].map(toMin);
    if (t >= s && t < e) return { period: p, kind: 'now' };
    if (t < s) return { period: p, kind: 'next' };
  }
  return null;
}

const STATUS = { done: ['완료', '✓'], part: ['일부', '◐'], skip: ['못 함', '✕'], left: ['남음', '○'], none: ['', ''] };
/* 오늘 수업 카드. view: class-model dayView 결과, time: 'HH:MM'.
   state: none(시간표 없음) · off(쉬는 날, off에 까닭) · empty(그 요일 수업 없음) · list. left: 진도표가 있어 체크할 수 있는데 아직 안 한 교시 수.
   줄 status: done·part·skip·left(남음), 진도표 없는 교과는 none(오늘 수업에서 체크하지 않음) */
export function lessonCard(view, time, { hasTimetable = true } = {}) {
  if (!hasTimetable) return { state: 'none', rows: [], left: 0, off: '' };
  const v = isObj(view) ? view : { off: '', slots: [] };
  if (v.off) return { state: 'off', rows: [], left: 0, off: v.off };
  const slots = Array.isArray(v.slots) ? v.slots : [];
  if (!slots.length) return { state: 'empty', rows: [], left: 0, off: '' };
  const at = periodNow(time, slots.map(s => s.period));
  const rows = slots.map(s => {
    let text = '진도표 없음';
    if (s.sub && s.lesson) { const p = unitPos(s.sub, s.index); text = `${p.n}/${p.of}차시 · ${s.lesson.title}`; }
    else if (s.sub) text = '진도표를 다 마쳤어요';
    const status = !s.sub ? 'none' : ['done', 'part', 'skip'].includes(s.status) ? s.status : 'left';
    return { period: s.period, subject: s.subject, text, status, label: STATUS[status][0], sym: STATUS[status][1], now: at && at.period === s.period ? at.kind : '' };
  });
  return { state: 'list', rows, left: rows.filter(r => r.status === 'left').length, off: '' };
}

/* 공문 기한 카드: 지남·오늘·D-n(7일 안, 다 한 것 빼고) 3개까지. tone: err(지남·오늘) · warn(D-1·D-2) · info */
export function gongmunCard(docs, today) {
  return dueSoon(Array.isArray(docs) ? docs : [], today).map(d => ({
    id: d.id, title: d.title || d.name || '공문', n: d.n,
    badge: d.n < 0 ? '지남' : d.n === 0 ? '오늘' : `D-${d.n}`,
    note: d.n < 0 ? `${-d.n}일 지났어요` : d.n === 0 ? '오늘까지예요' : `${d.n}일 남았어요`,
    tone: d.n <= 0 ? 'err' : d.n <= 2 ? 'warn' : 'info',
    sym: d.n <= 0 ? '!' : ''
  }));
}

/* ---------- 교과캠프 출석 ---------- */
/* 오늘 수업이 있는 캠프 [{ camp, sessions }] — 지금 고른 캠프 먼저, 나머지는 목록 차례 */
export function campsToday(camps, currentId, today) {
  const list = (Array.isArray(camps) ? camps : []).filter(isObj).map(camp => ({ camp, sessions: sessionsOn(camp, today) })).filter(x => x.sessions.length);
  const i = list.findIndex(x => x.camp.id === currentId);
  return i > 0 ? [list[i], ...list.slice(0, i), ...list.slice(i + 1)] : list;
}
const stateOf = (camp, ss, sid) => {
  const ms = ss.map(s => (camp.att[s.id] && camp.att[s.id][sid]) || '');
  return ms.every(m => m === ms[0]) ? ms[0] : 'mixed';
};
/* 학생마다 그날 수업 모두의 표시: O(모두 출석) · X(모두 결석) · ''(체크 안 함) · mixed(섞임) */
export function dayMarks(camp, date) {
  const ss = sessionsOn(camp, date);
  return camp.students.map(st => ({ id: st.id, name: st.name || '이름 없는 학생', mark: ss.length ? stateOf(camp, ss, st.id) : '' }));
}
/* 학생 버튼: 그날 수업 모두 ○ → / → 빈칸 → ○ (섞여 있으면 ○부터) */
export function cycleDay(camp, date, sid) {
  if (!camp.students.some(s => s.id === sid)) return camp;
  const ss = sessionsOn(camp, date);
  const cur = stateOf(camp, ss, sid), next = nextMark(cur === 'mixed' ? '' : cur);
  return ss.reduce((c, s) => setMark(c, s.id, sid, next), camp);
}
/* 캠프 카드: 이름·오늘 수업 수·시간(첫 수업 시작~끝 수업 끝)·학생·덜 체크한 학생 수 */
export function campCard(camp, date) {
  const ss = sessionsOn(camp, date), students = dayMarks(camp, date);
  const a = ss[0], b = ss[ss.length - 1];
  const time = a && a.start ? fmtTime({ start: a.start, end: (b && (b.end || b.start)) || '' }) : '';
  return { id: camp.id, name: camp.name || '이름 없는 프로그램', count: ss.length, time, students, left: students.filter(s => s.mark !== 'O' && s.mark !== 'X').length };
}

/* ---------- 이어서 하기 ---------- */
const filled = e => isObj(e) && ['v', 'count', 'deduct'].some(k => str(e[k]).trim());
/* 다면평가: 시작한 경우만(정량 값을 하나라도 넣었거나 정성 보고서가 있음)
   「다면평가 정량 63/100점 · 빈 항목 3곳 · 정성 입력 필요 2곳」 — 빈 항목은 정량 화면 「입력 필요」와 같은 셈(missingItems), 정성은 보고서의 빈 칸 */
export function multiLine(m) {
  if (!isObj(m) || !isObj(m.quant)) return null;
  const values = isObj(m.quant.values) ? m.quant.values : {}, report = m.qual && m.qual.report;
  const quant = Object.values(values).some(filled);
  if (!quant && !isObj(report)) return null;
  const c = m.quant.criteria, groups = c && Array.isArray(c.groups) ? c.groups : [], short = !!(m.info && m.info.short);
  const max = groups.length && groups.every(g => Number.isFinite(g.max)) ? groups.reduce((s, g) => s + g.max, 0) : 100;
  const total = totalScore(c, values, short) || 0;
  let missing = 0;
  try { missing = quant && c ? missingItems(c, values, short).length : 0; } catch (e) { missing = 0; }
  const qual = isObj(report) ? missingCount(report) : 0;
  const parts = [quant ? `정량 ${total}/${max}점${missing ? ` · 빈 항목 ${missing}곳` : ''}` : '', qual ? `정성 입력 필요 ${qual}곳` : ''].filter(Boolean);
  return { kind: 'multi', total, max, missing, qual, text: `다면평가 ${parts.join(' · ') || '정성평가 이어서 쓰기'}`, when: '', route: { to: 'multi' } };
}
const RECENT_DAYS = 14; // 이보다 오래된 품의 초안은 이어서 하기에 넣지 않음
/* brief: briefing.js 줄(공문은 카드에 있어 뺌), recent: 품의 최근 작성(library.js listRecent), multi: multiLine 결과. 5줄까지 — 품의·다면평가 자리를 남김 */
export function continueRows({ brief = [], recent = [], multi = null, now = Date.now() } = {}) {
  const lines = (Array.isArray(brief) ? brief : []).filter(l => isObj(l) && l.kind !== 'gongmun');
  const d = (Array.isArray(recent) ? recent : []).filter(r => isObj(r) && isObj(r.draft) && now - (Number(r.at) || 0) <= RECENT_DAYS * 864e5)
    .sort((a, b) => b.at - a.at)[0];
  const extras = [
    d && { kind: 'purchase', text: `품의 「${str(d.draft.title).trim() || str(d.form && d.form.project).trim() || '제목 없는 품의'}」 초안 이어서 쓰기`, when: '', route: { to: 'purchase', id: d.id } },
    isObj(multi) && { kind: 'multi', ...multi }
  ].filter(Boolean);
  return [...lines.slice(0, Math.max(0, 5 - extras.length)), ...extras].slice(0, 5);
}

/* 「오늘 챙길 일 n가지」: 공문 기한 줄 + 오늘 남은 수업 + 캠프 출석(덜 했으면 한 가지) */
export const todoCount = ({ gongmun = [], lessons = null, camp = null } = {}) =>
  (Array.isArray(gongmun) ? gongmun.length : 0) + ((lessons && lessons.left) || 0) + (camp && camp.left ? 1 : 0);
export const headline = n => (n > 0 ? `오늘 챙길 일 ${n}가지` : EMPTY);

/* 처음 쓰는 선생님: 공문·시간표·캠프·이어서 할 일이 하나도 없음 → 시작 안내 3단계 */
export const isBlank = ({ docs = [], hasTimetable = false, camps = [], rows = [] } = {}) => !docs.length && !hasTimetable && !camps.length && !rows.length;
export const starter = ({ aiReady = false, roster = false } = {}) => [
  { id: 'ai', text: 'AI 정하기', done: !!aiReady },
  { id: 'roster', text: '학급 명단 넣기', done: !!roster },
  { id: 'drop', text: '파일 놓기', done: false }
];
