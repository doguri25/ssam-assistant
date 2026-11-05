/* 학급: 학교에서 받은 진도표(교과·창체 연간지도계획)와 학년별 기초시간표를 글에서 읽기 (AI 없음, 화면 없음).
   글은 core/files.js의 readText가 한글 표를 「칸 | 칸」 줄로 바꾼 것. 합친 칸 때문에 줄마다 칸 수가 다름 */

import { schoolYearOf, yearOfMonth, weekday, isDate } from '../../core/calendar.js';
export { schoolYearOf };

export const normName = s => String(s == null ? '' : s).replace(/\s+/g, '');

const PERIOD = /^(\d{1,2})\.(\d{1,2})\.?\s*~\s*(\d{1,2})\.(\d{1,2})\.?$/;
const LESSON_NO = /^\d+\s*\/\s*\d+$/;
const SUB_AREA = /^(자율.?자치활동|동아리활동|진로활동)$/;
const pad = n => String(n).padStart(2, '0');

/* 「8.24~8.29」의 첫날. 1~2월은 학년도 다음 해, 다만 2월에 시작해 3월 넘어 끝나는 주(일~토로 적은 학년도 첫 주 「2.28~3.6」)는 그 학년도 */
export function periodStart(period, year) {
  const m = PERIOD.exec(String(period || '').trim());
  if (!m) return '';
  const mon = +m[1], day = +m[2], end = +m[3];
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return '';
  return `${mon <= 2 && end >= 3 ? year : yearOfMonth(mon, year)}-${pad(mon)}-${pad(day)}`;
}
/* 저장된 차시(기간·첫날)의 학년도: 그 기간을 그 학년도로 읽으면 같은 첫날이 나오는 해 */
export function lessonYear(l) {
  const y = +String(l && l.from).slice(0, 4);
  return [y, y - 1].find(x => periodStart(l.period, x) === l.from) || schoolYearOf(l.from);
}

/* 그 학년도로 읽은 기간이 주(월~금, 일~토)에 맞는 정도: 월~금 2, 공휴일로 늦게 시작해 금요일에 끝남 1, 일~토 2, 그 밖 0 */
function weekFit(period, year) {
  const m = PERIOD.exec(String(period || '').trim()), s = periodStart(period, year);
  if (!m || !s) return 0;
  const e = `${+s.slice(0, 4) + (+m[3] < +m[1] ? 1 : 0)}-${pad(+m[3])}-${pad(+m[4])}`;
  if (!isDate(s) || !isDate(e) || e < s) return 0;
  const a = weekday(s), b = weekday(e);
  return b === 5 ? (a === 1 ? 2 : a > 1 && a < 5 ? 1 : 0) : b === 6 && a === 0 ? 2 : 0;
}
/* 글에 학년도가 없는 진도표의 학년도: 1·2월에 지난 학년도 자료에서 준비하면 다음 학년도, 3월이 지나도 학년도를 안 바꿨으면 오늘이 든 학년도,
   그 밖에는 지금 자료의 학년도(year). 다만 기간(「3.2~3.6」)의 요일이 지금 자료의 학년도와 더 잘 맞으면 그 학년도(지난 학년도 진도표를 늦게 넣음).
   year가 없으면 예전처럼 오늘이 든 학년도 */
export function jindoYear(periods, { today, year } = {}) {
  const ty = schoolYearOf(today);
  if (!Number.isInteger(year)) return ty;
  const m = +String(today).slice(5, 7), prep = (m === 1 || m === 2) && year < ty + 1 ? ty + 1 : 0;
  const base = prep || Math.max(year, ty);
  if (base === year) return base;
  const list = [...new Set((periods || []).map(p => String(p == null ? '' : p).trim()).filter(p => PERIOD.test(p)))];
  const fit = y => list.reduce((n, p) => n + weekFit(p, y), 0);
  return fit(year) > fit(base) ? year : base;
}

/* 칸 나누기: 한글 표 글은 「|」, 엑셀·CSV(readText)·붙여 넣은 엑셀 표는 탭(빈 칸도 자리를 지킴). 탭이 「|」보다 많은 줄만 탭으로
   (한글 칸 안의 탭, 엑셀 칸 안의 「|」는 칸을 나누지 않게) */
const count = (s, ch) => s.split(ch).length - 1;
const cells = line => (count(line, '\t') > count(line, '|') ? line.split('\t') : line.split(/\s*\|\s*/)).map(c => c.trim());

/* 진도표 글 → 교과마다 차시 목록. 한 줄 = 1시간. 글에 학년도가 없으면 jindoYear(지금 자료의 학년도 year·오늘·기간 요일), year가 없으면 오늘이 든 학년도 */
export function parseJindo(text, { today, year: dataYear } = {}) {
  const src = String(text || '');
  const ym = /(\d{4})\s*학년도/.exec(src);
  const year = ym ? +ym[1] : jindoYear(src.split(/\r?\n/).flatMap(cells).filter(c => PERIOD.test(c)), { today, year: dataYear });
  const subjects = [];
  let cur = null, week = null, period = '', unit = '';
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const head = /^(.+?)\s*교육과정\s*연간지도계획/.exec(line);
    if (head) {
      const source = head[1].trim();
      const n = normName(source);
      cur = { name: n === '창의적체험활동' ? '창체' : n, source, total: null, pick: !SUB_AREA.test(n), lessons: [] };
      subjects.push(cur);
      week = null; period = ''; unit = '';
      continue;
    }
    if (!cur) continue;
    const tm = /총\s*시수\s*[:：]\s*(\d+)/.exec(line);
    if (tm && cur.total == null) { cur.total = +tm[1]; continue; }
    const c = cells(raw);
    const k = c.findIndex(x => LESSON_NO.test(x));
    if (k < 1) continue;
    const title = c[k - 1];
    if (!title) continue;
    for (const x of c.slice(0, k - 1)) {
      if (!x) continue;
      if (/^\d+$/.test(x)) week = +x;
      else if (PERIOD.test(x)) period = x;
      else unit = x;
    }
    cur.lessons.push({ week, period, from: periodStart(period, year), unit, title, no: c[k].replace(/\s+/g, ''), pages: c[k + 1] || '', memo: c[k + 2] || '' });
  }
  return { year, subjects: subjects.filter(s => s.lessons.length) };
}

const DAYS = ['월', '화', '수', '목', '금'];

/* 학년별 기초시간표 글에서 우리 반({학년}-{반}) 칸 읽기 → { periods, cells[요일][교시-1] } 또는 null */
export function parseTimetable(text, { grade, room } = {}) {
  const label = `${grade}-${room}`;
  const lines = String(text || '').split(/\r?\n/).map(cells);
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    const at = c.findIndex((x, j) => x === label && DAYS.every((d, n) => c[j + 1 + n] === d));
    if (at < 0) continue;
    const rows = [];
    for (let r = i + 1; r < lines.length && /^\d+$/.test(lines[r][at] || '') && rows.length < 7; r++) {
      rows.push(DAYS.map((d, n) => normName(lines[r][at + 1 + n] || '')));
    }
    let periods = rows.length;
    while (periods > 0 && rows[periods - 1].every(x => !x)) periods--;
    if (!periods) return null;
    periods = Math.min(7, Math.max(4, periods));
    return { periods, cells: DAYS.map((d, n) => Array.from({ length: periods }, (_, p) => (rows[p] ? rows[p][n] : ''))) };
  }
  return null;
}
