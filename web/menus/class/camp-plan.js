/* 기초학력 캠프 › 계획 파일 넣기 (화면 없음 — Node 시험에서도 씀).
   운영 계획서 글 → 캠프 정보(이름·대상·교과·지도교사, 빈 칸만)와 수업 일정.
   기간·요일·시간·교시는 규칙으로 읽음(「기간」 줄을 먼저 — 계획 수립·기안 날짜는 수업 날이 아님).
   AI가 있으면 계획서 글을 일정 AI(camp-ai.js schedulePrompt)에 보내 지도 내용까지, 없으면 규칙으로 날짜 × 교시 줄(지도 내용은 빈칸).
   AI로 가는 글: 지도교사 이름·사람 이름 모양·전화번호·전자 우편은 가리고, 학생 이름은 학생A·학생B(schedulePrompt의 toAlias) */
import { maskPersons } from '../../core/chat-names.js';
import { maskContacts } from '../../core/privacy.js';
import { findRange, findWeekdays, schedulePrompt, normSchedule } from './camp-ai.js';

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const tidy = s => str(s).replace(/[ \t 　]+/g, ' ').trim();
const pad = n => String(n).padStart(2, '0');
const SUBJECTS = ['국어', '수학', '영어', '사회', '과학', '한글', '읽기', '쓰기', '셈하기', '독서', '코딩'];
const WEEK = '일월화수목금토';

/* 「가. 기간: …」「○ 대상 : …」 꼴의 줄 값(라벨 re), 없으면 '' */
function field(lines, re) {
  for (const l of lines) {
    const m = new RegExp(`(?:^|[\\s.)○◦•·-])(?:${re})\\s*[:：]\\s*(.+)$`).exec(l);
    if (m && tidy(m[1])) return tidy(m[1]);
  }
  return '';
}
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const TIME = /(\d{1,2})\s*:\s*(\d{2})\s*[~∼〜–-]\s*(\d{1,2})\s*:\s*(\d{2})/;

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
  const tm = /(\d)\s*(?:[~·,]\s*(\d)\s*)?학년/.exec(tv);
  const target = tm ? `${tm[1]}${tm[2] ? `~${tm[2]}` : ''}학년` : tv.slice(0, 20);
  // 교과: 「교과·과목」 줄의 낱말, 없으면 글에 나온 교과(나온 차례)
  const sv = field(lines, '교\\s*과|과\\s*목|운영\\s*교과');
  let subjects = sv ? sv.split(/[,·、/및]+|\s+/).map(tidy).filter(w => /^[가-힣]{2,6}$/.test(w) && !/^(?:등|교과|과목|중심|위주)$/.test(w)).map(w => w.replace(/과$/, '') || w) : [];
  if (!subjects.length) subjects = SUBJECTS.map(s => [s, t.indexOf(s)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]).map(([s]) => s);
  subjects = [...new Set(subjects)].slice(0, 8);
  // 지도교사(이 컴퓨터 안에서만 — AI로 보내지 않음)
  const teacherV = field(lines, '지도\\s*교사|담당\\s*교사|운영\\s*교사|강\\s*사');
  const teacher = (/([가-힣]{2,4})/.exec(teacherV.replace(/^(?:교사|담임|담당|선생님)\s*/, '')) || [, ''])[1].replace(/^(?:교사|담임|선생님)$/, '');
  // 기간: 「기간」 줄 → 「일시·운영일」 줄 → 글 전체
  const pick = res => res.map(re => lines.find(l => re.test(l) && findRange(l, { year, today }))).find(Boolean) || '';
  const rangeLine = pick([/기\s*간/, /일\s*시|운영\s*일|운영\s*날/]);
  const range = findRange(rangeLine || t, { year, today });
  const weekdays = findWeekdays(rangeLine) || findWeekdays(field(lines, '요\\s*일')) || null;
  // 시간: 「시간·시각·일과」 줄 → 글 전체
  const timeLine = lines.find(l => /시\s*간|시\s*각|일\s*과/.test(l) && TIME.test(l)) || lines.find(l => TIME.test(l)) || '';
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
  return { name, target, subjects, teacher, range, weekdays, start, end, periods, minutes, rest };
}

/* AI 없이: 읽은 기간·요일·시간·교시 → normSchedule 꼴({ dates, slots, order, lessons: {} }). 기간·시작 시각이 없으면 수업 날 없음 */
export function planSchedule(p, camp) {
  const subs = p.subjects.length ? p.subjects : camp.subjects;
  if (!p.range || !p.start) return normSchedule({}, { range: null, weekdays: null });
  const v = p.periods
    ? { start: p.start, periods: p.periods, minutes: p.minutes || 40, rest: p.rest == null ? 10 : p.rest }
    : { slots: [{ start: p.start, end: p.end || p.start }] };
  const n = p.periods || 1;
  return normSchedule({ ...v, order: subs.length ? Array.from({ length: n }, (_, i) => subs[i % subs.length]) : [], lessons: {} }, { range: p.range, weekdays: p.weekdays });
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
  if (!tidy(c.name) && p.name) { c.name = p.name; got.push('캠프 이름'); }
  if (!tidy(c.target) && p.target) { c.target = p.target; got.push('대상'); }
  if (!c.subjects.length && p.subjects.length) { c.subjects = [...p.subjects]; got.push('교과'); }
  if (!tidy(c.teacher) && p.teacher) { c.teacher = p.teacher; got.push('지도교사'); }
  return got;
}
