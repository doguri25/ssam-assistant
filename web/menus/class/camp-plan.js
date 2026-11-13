/* 기초학력 캠프 › 계획 파일 넣기 (화면 없음 — Node 시험에서도 씀).
   운영 계획서 글 → 캠프 정보(이름·대상·교과·지도교사, 빈 칸만)와 수업 일정.
   기간·요일·시간·교시는 규칙으로 읽음(「기간」 줄을 먼저 — 계획 수립·기안 날짜는 수업 날이 아님).
   AI가 있으면 계획서 글을 일정 AI(camp-ai.js schedulePrompt)에 보내 지도 내용까지, 없으면 규칙으로 날짜 × 교시 줄(지도 내용은 빈칸).
   AI로 가는 글: 지도교사 이름·사람 이름 모양·전화번호·전자 우편은 가리고, 학생 이름은 학생A·학생B(schedulePrompt의 toAlias)
   계획서에 「지도 계획」 표(차시·과목·날짜·학습 내용)가 있으면 그 표 그대로 수업 줄(planTable·tableSessions — AI 안 부름, 2026-11-13).
   시간은 「지도시간」 줄의 요일마다 시간(「수요일 13:40~14:20, 목요일 14:30~15:10」), 표의 날짜가 「/」로 비었으면 기간·요일에서 차시 수만큼 셈 */
import { maskPersons } from '../../core/chat-names.js';
import { maskContacts } from '../../core/privacy.js';
import { findRange, findWeekdays, schedulePrompt, normSchedule } from './camp-ai.js';
import { isDate, weekday, yearOfMonth } from '../../core/calendar.js';
import { newSession } from './camp-model.js';
import { countDates, sessionsByCount } from './camp-sched.js';

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const tidy = s => str(s).replace(/[ \t 　]+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');
const SUBJECTS = ['국어', '수학', '영어', '사회', '과학', '한글', '읽기', '쓰기', '셈하기', '독서', '코딩'];
const WEEK = '일월화수목금토';

/* 「가. 기간: …」「○ 대상 : …」 꼴의 줄 값(라벨 re), 표 꼴 「지도교사 | 3-2 담임: 한가람 | 과목 | 국어, 수학」이면 라벨 칸 다음 칸. 없으면 '' */
function field(lines, re) {
  const lab = new RegExp(`^(?:${re})$`);
  for (const l of lines) {
    const m = new RegExp(`(?:^|[\\s.)○◦•·-])(?:${re})\\s*[:：]\\s*(.+)$`).exec(l);
    const v = m ? tidy(m[1].split('|')[0]) : ''; // 「지도교사: 한가람 | 교과: 국어」는 칸 경계까지
    if (v) return v;
    if (!l.includes('|')) continue;
    const cells = l.split('|').map(tidy);
    for (let i = 0; i < cells.length - 1; i++) if (lab.test(cells[i]) && cells[i + 1]) return cells[i + 1];
  }
  return '';
}
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const TIME = /(\d{1,2})\s*:\s*(\d{2})\s*[~∼〜–-]\s*(\d{1,2})\s*:\s*(\d{2})/;
const hm = (h, m) => `${pad(+h)}:${m}`;

/* 「매주 수요일 13:40~14:20, 목요일 14:30~15:10」 → { 3: { start, end }, 4: { … } } — 시간 앞에 요일이 적힌 것만 */
export function weekTimes(line) {
  const s = str(line), out = {}, re = new RegExp(TIME.source, 'g');
  let m, last = 0;
  while ((m = re.exec(s))) {
    const days = findWeekdays(s.slice(last, m.index));
    last = m.index + m[0].length;
    if (days) for (const d of days) out[d] = { start: hm(m[1], m[2]), end: hm(m[3], m[4]) };
  }
  return out;
}

/* 운영 계획서 글 → { name, target, subjects, teacher, range, weekdays, start, end, periods, minutes, rest } (못 찾은 것은 ''·null·[]) */
export function readPlan(text, { year, today } = {}) {
  const t = str(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n').map(tidy).filter(Boolean);
  // 이름: 앞 줄들에서 「캠프」(없으면 「기초학력」·「교실」) 든 줄, 앞의 학년도·끝의 「운영 계획(서)」은 뺌
  const head = lines.slice(0, 6);
  const nameLine = head.find(l => /캠프/.test(l)) || head.find(l => /기초\s*학력|교실|학급/.test(l)) || '';
  const name = tidy(nameLine.replace(/^20\d{2}\s*(?:학년도|년)?\s*/, '').replace(/\s*(?:운영\s*)?(?:계획서?|계획\s*\(안\)|운영안|추진\s*계획)\s*$/, '')).slice(0, 60);
  // 대상: 「3학년」「1~2학년」이 있으면 그것, 없으면 앞 20자
  const tv = field(lines, '대\\s*상');
  const tm = /(\d)\s*(?:[~·,]\s*(\d)\s*)?학년/.exec(tv) || /(?:^|[^\d])([1-6])\s*-\s*\d{1,2}(?!\d)/.exec(tv); // 「3-2 학생」(학년-반)도 3학년
  const target = tm ? `${tm[1]}${tm[2] ? `~${tm[2]}` : ''}학년` : tv.slice(0, 20);
  // 교과: 「교과·과목」 줄의 낱말, 없으면 글에 나온 교과(나온 차례)
  const sv = field(lines, '교\\s*과|과\\s*목|운영\\s*교과');
  let subjects = sv ? sv.split(/[,·、/및]+|\s+/).map(tidy).filter(w => /^[가-힣]{2,6}$/.test(w) && !/^(?:등|교과|과목|중심|위주)$/.test(w)).map(w => w.replace(/과$/, '') || w) : [];
  if (!subjects.length) subjects = SUBJECTS.map(s => [s, t.indexOf(s)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([s]) => s);
  subjects = [...new Set(subjects)].slice(0, 8);
  // 지도교사(이 컴퓨터 안에서만 — AI로 보내지 않음)
  const teacherV = field(lines, '지도\\s*교사|담당\\s*교사|운영\\s*교사|강\\s*사');
  // 「3-2 담임: 한가람」은 쌍점 뒤, 「한 가 람 (인)」은 띄어 쓴 글자를 붙여 읽음
  const tv2 = tidy(teacherV.split(/[:：]/).pop()).replace(/\(\s*인\s*\)/g, '').replace(/^(?:\d[-\d]*\s*)?(?:교사|담임|담당|선생님)\s*/, '');
  const teacher = ((/([가-힣]{2,4})/.exec(tv2) || /^([가-힣](?:\s[가-힣]){1,3})$/.exec(tv2.trim()) || [, ''])[1].replace(/\s/g, '')).replace(/^(?:교사|담임|선생님)$/, '');
  // 기간: 「기간」 줄 → 「일시·운영일」 줄 → 글 전체
  const pick = res => res.map(re => lines.find(l => re.test(l) && findRange(l, { year, today }))).find(Boolean) || '';
  const rangeLine = pick([/기\s*간/, /일\s*시|운영\s*일|운영\s*날/]);
  const range = findRange(rangeLine || t, { year, today });
  // 시간: 「시간·시각·일과」 줄 → 글 전체. 요일마다 다르면(「수요일 13:40~14:20, 목요일 14:30~15:10」) dayTimes
  const timeLine = lines.find(l => /시\s*간|시\s*각|일\s*과/.test(l) && TIME.test(l)) || lines.find(l => TIME.test(l)) || '';
  const dayTimes = weekTimes(timeLine);
  const dtDays = Object.keys(dayTimes).map(Number).sort((a, b) => a - b);
  const weekdays = findWeekdays(rangeLine) || findWeekdays(field(lines, '요\\s*일')) || (dtDays.length ? dtDays : null);
  const tmm = TIME.exec(timeLine);
  const start = tmm ? `${pad(+tmm[1])}:${tmm[2]}` : '', end = tmm ? `${pad(+tmm[3])}:${tmm[4]}` : '';
  const num = re => { const m = re.exec(t); return m ? +(m.slice(1).find(Boolean)) : null; };
  const periods = num(/(?:하루|1\s*일|매일|일일)\s*(\d{1,2})\s*(?:교시|차시|시간(?!\s*[:：]))/);
  const rest = num(/(?:쉬는\s*시간|휴식(?:\s*시간)?)\s*(\d{1,2})\s*분/);
  let minutes = num(/(?:1\s*교시|한\s*교시|교시\s*당|1\s*차시|차시\s*당)\s*(\d{2,3})\s*분|(\d{2,3})\s*분\s*수업/);
  if (!minutes && periods && start && end) { // 교시 길이가 없으면 시작~끝에서 셈(쉬는 시간을 모르면 10분)
    const r = rest == null ? 10 : rest, m = Math.floor((toMin(end) - toMin(start) - r * (periods - 1)) / periods);
    if (m >= 10) minutes = m;
  }
  return { name, target, subjects, teacher, range, weekdays, dayTimes, start, end, periods, minutes, rest };
}

/* AI 없이: 읽은 기간·요일·시간·교시 → normSchedule 꼴({ dates, slots, order, lessons }). 기간·시작 시각이 없으면 수업 날 없음.
   lessons: 「차시 | 국어 | 수학」 표에서 읽은 교과마다 지도 내용(planTable kind 'lessons') */
export function planSchedule(p, camp, lessons = {}) {
  const subs = p.subjects.length ? p.subjects : camp.subjects;
  if (!p.range || !p.start) return normSchedule({}, { range: null, weekdays: null });
  const v = p.periods
    ? { start: p.start, periods: p.periods, minutes: p.minutes || 40, rest: p.rest == null ? 10 : p.rest }
    : { slots: [{ start: p.start, end: p.end || p.start }] };
  const n = p.periods || 1;
  return normSchedule({ ...v, order: subs.length ? Array.from({ length: n }, (_, i) => subs[i % subs.length]) : [], lessons }, { range: p.range, weekdays: p.weekdays });
}

/* 하루 한 차시 수업 줄의 시간을 그 요일 시간으로(계획서가 요일마다 시간이 다를 때) */
export function applyDayTimes(sessions, p) {
  const dt = (p && p.dayTimes) || {};
  if (!Object.keys(dt).length) return sessions;
  return sessions.map(s => { const t = isDate(s.date) && dt[weekday(s.date)]; return t ? { ...s, start: t.start, end: t.end } : s; });
}

/* ---------- 지도 계획 표 ---------- */
const flatCell = c => tidy(c).replace(/\s+/g, '');
const COL = {
  no: /^(?:차시|회차|순|번호|순번|회|차)$/,
  date: /^(?:날짜|일시|일자|월일|수업일|지도일|운영일)(?:\(.*\))?$/,
  time: /^(?:시간|시각|지도시간|수업시간)(?:\(.*\))?$/,
  subject: /^(?:과목|교과|교과목|영역)$/,
  content: /^(?:(?:학습|지도|활동|수업|교육)?내용|(?:학습|활동)?주제|학습활동|지도계획)(?:\(.*\))?$/
};
const TOTAL = /^(?:누계|합계|총계|소계|계)$/;
/* 표 칸 날짜 「9/2(수)」「9. 2.」「9월 2일」「2026. 9. 2.」 → YYYY-MM-DD. 연도가 없으면 기간 안에 드는 해(없으면 학년도의 달) */
function cellDate(c, { year, range } = {}) {
  const m = /^(?:(20\d{2})\s*[-./년]\s*)?(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?\s*(?:\([^)]{1,4}\))?$/.exec(tidy(c));
  if (!m) return '';
  const mo = pad(+m[2]), d = pad(+m[3]);
  const at = y => `${y}-${mo}-${d}`;
  if (m[1]) return isDate(at(m[1])) ? at(m[1]) : '';
  const ys = range ? [...new Set([range.from.slice(0, 4), range.to.slice(0, 4)])] : [];
  const inR = ys.map(at).find(x => isDate(x) && x >= range.from && x <= range.to);
  const x = inR || (ys.length ? at(ys[0]) : at(yearOfMonth(+m[2], +year || new Date().getFullYear())));
  return isDate(x) ? x : '';
}
const cellTime = c => { const m = TIME.exec(str(c)); return m ? { start: hm(m[1], m[2]), end: hm(m[3], m[4]) } : null; };
const SUBJ = new RegExp(`^(?:${SUBJECTS.join('|')})(?:과)?$`);

/* 계획서 글(표는 「칸 | 칸」 줄) → 지도 계획 표.
   { kind: 'rows', rows: [{ no, date, start, end, subject, content }], dated } — 차시·날짜·과목·내용 표(날짜가 적힌 줄이 가장 많은 표)
   { kind: 'lessons', lessons: { 국어: [...], 수학: [...] } } — 「차시 | 국어 | 수학」 표(교과마다 차시별 내용)
   없으면 null (출석부처럼 날짜·이름만 있는 표는 아님) */
export function planTable(text, { year, today, range = null } = {}) {
  const lines = str(text).replace(/\r\n?/g, '\n').split('\n');
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes('|')) continue;
    const head = lines[i].split('|').map(flatCell);
    const col = {};
    head.forEach((h, j) => { for (const [k, re] of Object.entries(COL)) if (col[k] == null && re.test(h)) col[k] = j; });
    if (col.no == null) continue;
    const subjCols = head.map((h, j) => (SUBJ.test(h) ? j : -1)).filter(j => j >= 0);
    const byRows = col.content != null || (col.date != null && col.subject != null);
    if (!byRows && !subjCols.length) continue;
    const rows = [];
    let j = i + 1;
    for (; j < lines.length && lines[j].includes('|'); j++) {
      const cells = lines[j].split('|').map(tidy);
      const first = flatCell(cells[0]);
      if (TOTAL.test(first) || !/^\d{1,3}$/.test(first)) break;
      rows.push(cells);
    }
    if (!rows.length) continue;
    if (!byRows) {
      const lessons = {};
      for (const k of subjCols) lessons[head[k].replace(/과$/, '')] = rows.map(r => tidy(r[k])).filter(Boolean);
      if (Object.values(lessons).some(l => l.length)) tables.push({ kind: 'lessons', lessons, score: [0, rows.length] });
    } else {
      const same = r => r.length === head.length;
      const out = rows.map(r => {
        const get = k => (col[k] != null && same(r) ? tidy(r[col[k]]) : '');
        // 칸 수가 머리와 다르면(합친 칸) 모양으로 찾음: 날짜 모양·교과 이름·가장 긴 칸
        const date = cellDate(get('date') || (same(r) ? '' : r.find(c => cellDate(c, { year, range })) || ''), { year, range });
        const subject = get('subject') || (same(r) ? '' : r.find(c => SUBJ.test(flatCell(c))) || '');
        const content = get('content') || (same(r) ? '' : [...r.slice(1)].filter(c => !cellDate(c, { year, range }) && !SUBJ.test(flatCell(c)) && !TIME.test(c)).sort((a, b) => b.length - a.length)[0] || '');
        const t = cellTime(get('time'));
        return { no: +flatCell(r[0]), date, start: t ? t.start : '', end: t ? t.end : '', subject: subject.replace(/과$/, '').slice(0, 30), content: content.slice(0, 300) };
      }).filter(r => r.date || r.content);
      if (out.length) tables.push({ kind: 'rows', rows: out, dated: out.filter(r => r.date).length, score: [out.filter(r => r.date).length, out.length] });
    }
    i = j - 1;
  }
  if (!tables.length) return null;
  const rowsT = tables.filter(t => t.kind === 'rows').sort((a, b) => b.score[0] - a.score[0] || b.score[1] - a.score[1])[0];
  const t = rowsT || tables.sort((a, b) => b.score[1] - a.score[1])[0];
  const { score, ...rest } = t;
  return rest;
}

/* 표 줄 → 수업 줄. 날짜가 적힌 줄은 그 날짜(시간: 표 시간 → 그 요일 지도시간 → 계획서 시간).
   날짜가 하나도 없는 표는 기간·요일에서 차시 수만큼 날짜를 셈(못 세면 날짜 없이 내용만 — 「차시 수로 날짜 만들기」로 넣음).
   날마다 캠프는 같은 날 줄을 한 줄로 → { sessions, undated(날짜 없는 줄 수) } */
export function tableSessions(t, p, camp) {
  const rows = t && t.kind === 'rows' ? t.rows : [];
  const dt = (p && p.dayTimes) || {};
  const timeOf = d => (isDate(d) && dt[weekday(d)]) || (p && p.start ? { start: p.start, end: p.end || '' } : { start: '', end: '' });
  let list;
  if (t && t.dated) {
    list = rows.map(r => ({ ...r, ...(r.start ? {} : timeOf(r.date)) }));
  } else {
    const wd = p && p.weekdays && p.weekdays.length ? p.weekdays : [];
    const days = Object.keys(dt).length ? dt : Object.fromEntries(wd.map(d => [d, { start: p.start, end: p.end }]));
    const timed = p && p.range ? sessionsByCount({ from: p.range.from, to: p.range.to, days, n: rows.length }).specs : [];
    const dates = timed.length ? timed : p && p.range && wd.length ? countDates({ from: p.range.from, to: p.range.to, weekdays: wd, n: rows.length }).map(date => ({ date, ...timeOf(date) })) : [];
    list = rows.map((r, i) => ({ ...r, ...(dates[i] ? { date: dates[i].date, start: dates[i].start, end: dates[i].end } : {}) }));
  }
  let sessions = list.map(r => newSession({ date: r.date, start: r.start, end: r.end, subject: r.subject, content: r.content }));
  if (camp && camp.unit === 'day') {
    const by = new Map(), out = [];
    for (const s of sessions) {
      if (!s.date) { out.push(s); continue; }
      if (!by.has(s.date)) { by.set(s.date, []); out.push(s.date); }
      by.get(s.date).push(s);
    }
    sessions = out.map(x => {
      if (typeof x !== 'string') return x;
      const g = by.get(x);
      if (g.length === 1) return g[0];
      const subs = [...new Set(g.map(s => s.subject).filter(Boolean))];
      return newSession({ date: x, start: g.map(s => s.start).filter(Boolean).sort()[0] || '', end: g.map(s => s.end).filter(Boolean).sort().at(-1) || '',
        subject: subs.join('·'), content: g.map(s => (s.subject && s.content ? `${s.subject}: ${s.content}` : s.content)).filter(Boolean).join(' / ') });
    });
  }
  return { sessions, undated: sessions.filter(s => !s.date).length };
}

/* AI 글: 계획서 글(지도교사·사람 이름 모양·연락처 가림)을 일정 AI에. 기간·요일은 규칙으로 읽은 「기간」 줄 것 → { prompt, range, weekdays } */
export function planPrompt(text, camp, ctx = {}, p = null) {
  let s = str(text);
  for (const n of [camp && camp.teacher, p && p.teacher]) { const w = tidy(n); if (w.length >= 2) s = s.split(w).join('지도교사'); }
  s = maskContacts(maskPersons(s).text);
  return schedulePrompt(s, camp, { ...ctx, plan: true, range: p ? p.range : undefined, weekdays: p ? p.weekdays : undefined });
}

/* 일정 칸 한 줄 요약: 「1/8~1/22 평일, 09:00~12:40 하루 5교시(40분·쉬는 5분), 국어·수학, 3학년」(있는 것만) */
export function planDraft(p) {
  const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
  const wd = p.weekdays && p.weekdays.join() !== '1,2,3,4,5' ? p.weekdays.map(d => WEEK[d]).join('·') : '평일';
  const time = p.start ? `${p.start}${p.end ? `~${p.end}` : ''}${p.periods ? ` 하루 ${p.periods}교시${p.minutes ? `(${p.minutes}분${p.rest != null ? `·쉬는 ${p.rest}분` : ''})` : ''}` : ''}` : '';
  return [p.range ? `${md(p.range.from)}~${md(p.range.to)} ${wd}` : '', time, p.subjects.join('·'), p.target].filter(Boolean).join(', ');
}

/* 캠프 정보의 빈 칸만 계획서 값으로 → 채운 칸 이름들 */
export function fillCampInfo(c, p) {
  const got = [];
  if (!tidy(c.name) && p.name) { c.name = p.name; got.push('이름'); }
  if (!tidy(c.target) && p.target) { c.target = p.target; got.push('대상'); }
  if (!c.subjects.length && p.subjects.length) { c.subjects = [...p.subjects]; got.push('교과'); }
  if (!tidy(c.teacher) && p.teacher) { c.teacher = p.teacher; got.push('지도교사'); }
  return got;
}
