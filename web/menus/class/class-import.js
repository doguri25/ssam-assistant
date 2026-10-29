/* 학급: 학교에서 받은 진도표(교과·창체 연간지도계획)와 학년별 기초시간표를 글에서 읽기 (AI 없음, 화면 없음).
   글은 core/files.js의 readText가 한글 표를 「칸 | 칸」 줄로 바꾼 것. 합친 칸 때문에 줄마다 칸 수가 다름 */

export const normName = s => String(s == null ? '' : s).replace(/\s+/g, '');

const PERIOD = /^(\d{1,2})\.(\d{1,2})\.?\s*~\s*\d{1,2}\.\d{1,2}\.?$/;
const LESSON_NO = /^\d+\s*\/\s*\d+$/;
const SUB_AREA = /^(자율.?자치활동|동아리활동|진로활동)$/;
const pad = n => String(n).padStart(2, '0');

/* 학년도: 3~12월은 그해, 1~2월은 전해 */
export function schoolYearOf(date) {
  const y = +String(date).slice(0, 4), m = +String(date).slice(5, 7);
  return m <= 2 ? y - 1 : y;
}

/* 「8.24~8.29」의 첫날. 1~2월은 학년도 다음 해 */
export function periodStart(period, year) {
  const m = PERIOD.exec(String(period || '').trim());
  if (!m) return '';
  const mon = +m[1], day = +m[2];
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return '';
  return `${mon <= 2 ? year + 1 : year}-${pad(mon)}-${pad(day)}`;
}

const cells = line => line.split(/\s*\|\s*/).map(c => c.trim());

/* 진도표 글 → 교과마다 차시 목록. 한 줄 = 1시간 */
export function parseJindo(text, { today } = {}) {
  const src = String(text || '');
  const ym = /(\d{4})\s*학년도/.exec(src);
  const year = ym ? +ym[1] : schoolYearOf(today);
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
    cur.lessons.push({ week, period, from: periodStart(period, year), unit, title, pages: c[k + 1] || '', memo: c[k + 2] || '' });
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
