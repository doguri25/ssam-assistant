/* 기초학력 캠프 문서 모양 (화면 없음 — Node 시험에서도 씀). core/doc-export.js의 문서 꼴 { title, blocks } → 한글·워드·PDF.
   표는 단순 표(합친 칸 없음): 같은 날짜는 그날 첫 줄에만 적고 나머지 날짜 칸은 비움. 확인(서명) 칸은 늘 비움(지도 교사가 날인).
   layout(넣은 PDF·사진·.hwp 양식을 AI가 읽은 모양 { title, columns, notes, heads })이 있으면 제목·칸 이름·차례·안내 글을 그것으로.
   표 조각(confirmTable·attendTable·observePages)은 학교 한글 양식 채우기(camp-form.js)도 같이 씀 */
import { sortSessions, campDates, attCount, hoursTotal, fmtDate, fmtShort, fmtTime } from './camp-model.js';

export const DOC_LABEL = { confirm: '수업 확인서', attend: '학생 출석 및 관찰 기록부', observe: '관찰 기록부', report: '결과 보고서' };
export const docLabel = (id, camp) => (id === 'attend' && camp && camp.unit === 'day' ? '학생 출석부' : DOC_LABEL[id] || '');
export const docTitle = (id, camp) => [camp && camp.name, docLabel(id, camp)].filter(Boolean).join(' ');
export const CONFIRM_NOTE = '※확인(서명)란은 지도 교사가 반드시 날인(사인)';
export const ATTEND_NOTE = '※ 출석 : ○ , 결석 : /';
export const OBSERVE_PER_PAGE = 5;
const MARK = { O: '○', X: '/' };
export const SIGN_CELL = '\n\n';
export const hoursText = camp => `지도 시간: 총 ( ${hoursTotal(camp)} )시간`;
const teacherLine = camp => (camp.teacher ? [{ type: 'p', text: `지도교사: ${camp.teacher}` }] : []);
const noteBlocks = lines => lines.filter(Boolean).map(text => ({ type: 'small', text }));
const layoutOk = l => l && typeof l === 'object';
const titleOf = (id, camp, layout) => (layoutOk(layout) && String(layout.title || '').trim()) || docTitle(id, camp);
const notesOf = (layout, dflt) => (layoutOk(layout) && Array.isArray(layout.notes) && layout.notes.length ? layout.notes : dflt);

/* ---------- 양식 칸 이름 → 칸 뜻 ---------- */
const FIELD = {
  confirm: [['seq', /^(?:순|순번|연번|번호|no\.?)$/i], ['date', /날짜|일자|일시|월\s*일/], ['sign', /확인|서명|날인|사인/], ['content', /내용|학습|활동/], ['subject', /교과|과목/], ['time', /시간|교시/]],
  attendPeriod: [['seq', /^(?:순|순번|연번|번호|no\.?)$/i], ['date', /날짜|일자|일시|월\s*일/], ['time', /시간|교시/], ['student', /^(?:학생|아동|이름|성명)\s*\d*$|^\d+$/]],
  attendDay: [['seq', /^(?:순|순번|연번|번호|no\.?)$/i], ['total', /^계$|합계|출석\s*(?:수|일)/], ['gradeClass', /학년|반/], ['name', /이름|성명/], ['date', /날짜|일자|^\d{1,2}\s*[./월]\s*\d{1,2}/]]
};
/* 칸 이름 목록 → 칸 뜻 목록(모르는 칸은 '') */
export function mapColumns(cols, kind) {
  const rules = FIELD[kind] || [];
  return (cols || []).map(c => { const t = String(c || '').replace(/\s+/g, ' ').trim(); const r = rules.find(([, re]) => re.test(t)); return r ? r[0] : ''; });
}
const colsOf = layout => (layoutOk(layout) && Array.isArray(layout.columns) ? layout.columns.map(c => String(c || '').trim()).filter(Boolean) : []);

/* ---------- 수업 확인서 ---------- */
/* 수업 줄(날짜·시작 차례) → 칸 값 { seq, date(그날 첫 줄에만), time, subject, content, sign } */
function confirmCells(camp) {
  let prev = null;
  return sortSessions(camp.sessions).map((s, i) => {
    const first = s.date !== prev; prev = s.date;
    return { seq: String(i + 1), date: first ? fmtDate(s.date) : '', time: fmtTime(s), subject: s.subject, content: s.content, sign: '' };
  });
}
const CONFIRM_HEAD = ['순', '날짜', '시간', '교과', '지도 내용', '확인(서명)'];
const CONFIRM_KEYS = ['seq', 'date', 'time', 'subject', 'content', 'sign'];
/* { head, rows, footer } — layout의 칸 이름·차례를 따르되 날짜·지도 내용 칸을 못 찾으면 기본 칸 */
export function confirmTable(camp, layout) {
  const cols = colsOf(layout), keys = mapColumns(cols, 'confirm');
  const use = keys.includes('date') && keys.includes('content');
  const head = use ? cols : CONFIRM_HEAD, k = use ? keys : CONFIRM_KEYS;
  const rows = confirmCells(camp).map(c => k.map(f => (f ? c[f] : '')));
  const at = Math.max(0, k.indexOf('seq'));
  const footer = head.map((_, i) => (i === at ? '계' : i === at + 1 ? hoursText(camp) : ''));
  return { head, rows, footer };
}
export function confirmDoc(camp, layout) {
  const t = confirmTable(camp, layout);
  const ap = camp.approval.length ? camp.approval : [];
  return {
    title: titleOf('confirm', camp, layout),
    blocks: [
      // 결재란: 칸 이름 줄 + 도장 찍을 빈 줄(빈 줄 둘로 높이를 줌)
      ...(ap.length ? [{ type: 'table', head: true, rows: [ap, ap.map(() => SIGN_CELL)] }] : []),
      ...teacherLine(camp),
      { type: 'table', head: true, rows: [t.head, ...t.rows, t.footer] },
      ...noteBlocks(notesOf(layout, [CONFIRM_NOTE]))
    ]
  };
}

/* ---------- 출석부 ---------- */
const markOf = (camp, sessionId, sid) => MARK[camp.att[sessionId] && camp.att[sessionId][sid]] || '';
/* 날짜형: 그날 수업 중 ○가 있으면 ○, /만 있으면 /, 없으면 빈칸 */
function dayMark(camp, date, sid) {
  const ms = camp.sessions.filter(s => s.date === date).map(s => camp.att[s.id] && camp.att[s.id][sid]);
  return ms.includes('O') ? '○' : ms.includes('X') ? '/' : '';
}
const gradeClass = st => (st.grade && st.cls ? `${st.grade}-${st.cls}` : st.grade ? String(st.grade) : '');
/* 교시형 { head, rows, footer }: 수업 줄 × 학생, 끝 줄 「계」 학생별 출석 수. 날짜형 { head, rows, footer: null }: 학생 × 날짜, 끝 칸 「계」 */
export function attendTable(camp, layout) {
  const cols = colsOf(layout);
  if (camp.unit === 'day') {
    const dates = campDates(camp);
    const keys = mapColumns(cols, 'attendDay');
    const use = keys.includes('name') && keys.includes('date');
    // 양식의 날짜 칸 묶음(날짜1·날짜2 …)은 수업 날 수만큼으로
    let head, k;
    if (use) {
      const i = keys.indexOf('date'), j = keys.lastIndexOf('date');
      head = [...cols.slice(0, i), ...dates.map(fmtShort), ...cols.slice(j + 1)];
      k = [...keys.slice(0, i), ...dates.map(() => 'date'), ...keys.slice(j + 1)];
    } else { head = ['순', '학년-반', '이름', ...dates.map(fmtShort), '계']; k = ['seq', 'gradeClass', 'name', ...dates.map(() => 'date'), 'total']; }
    const rows = camp.students.map((st, n) => {
      let di = 0;
      const present = dates.filter(d => dayMark(camp, d, st.id) === '○').length;
      return k.map(f => (f === 'seq' ? String(n + 1) : f === 'gradeClass' ? gradeClass(st) : f === 'name' ? st.name : f === 'date' ? dayMark(camp, dates[di++], st.id) : f === 'total' ? String(present) : ''));
    });
    return { head, rows, footer: null };
  }
  const keys = mapColumns(cols, 'attendPeriod');
  const use = keys.includes('date') && keys.includes('student');
  let head, k;
  if (use) {
    const i = keys.indexOf('student'), j = keys.lastIndexOf('student');
    head = [...cols.slice(0, i), ...camp.students.map(s => s.name), ...cols.slice(j + 1)];
    k = [...keys.slice(0, i), ...camp.students.map(() => 'student'), ...keys.slice(j + 1)];
  } else { head = ['순', '일시', '시간', ...camp.students.map(s => s.name)]; k = ['seq', 'date', 'time', ...camp.students.map(() => 'student')]; }
  const cells = confirmCells(camp), sorted = sortSessions(camp.sessions);
  const rows = sorted.map((s, r) => { let si = 0; return k.map(f => (f === 'student' ? markOf(camp, s.id, camp.students[si++].id) : f ? cells[r][f] || '' : '')); });
  const at = Math.max(0, k.indexOf('seq'));
  let si = 0;
  const footer = k.map((f, i) => (f === 'student' ? String(attCount(camp, camp.students[si++].id)) : i === at ? '계' : ''));
  return { head, rows, footer };
}
export function attendDoc(camp, layout) {
  const t = attendTable(camp, layout);
  const notes = notesOf(layout, [ATTEND_NOTE]);
  return {
    title: titleOf('attend', camp, layout),
    blocks: [
      ...teacherLine(camp),
      ...noteBlocks(notes.some(n => /○/.test(n)) ? notes : [ATTEND_NOTE, ...notes]),
      { type: 'table', head: true, rows: [t.head, ...t.rows, ...(t.footer ? [t.footer] : [])] }
    ]
  };
}

/* ---------- 관찰 기록부 ---------- */
/* [[{ id, name, text }] × 5명씩] */
export function observePages(camp, per = OBSERVE_PER_PAGE) {
  const list = camp.students.map(s => ({ id: s.id, name: s.name, text: String(camp.obs[s.id] || '').trim() }));
  const out = [];
  for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
  return out;
}
function observeLabels(layout) {
  const cols = colsOf(layout);
  const name = cols.find(c => /이름|성명|학생/.test(c));
  const result = cols.find(c => c !== name && /관찰|지도|결과|내용/.test(c));
  return [name || '이름', result || '관찰 및 지도 결과'];
}
export function observeDoc(camp, layout) {
  const [nl, rl] = observeLabels(layout);
  const blocks = [...teacherLine(camp)];
  observePages(camp).forEach((pg, i) => {
    if (i) blocks.push({ type: 'break' });
    const pad = a => [...a, ...Array(Math.max(0, OBSERVE_PER_PAGE - a.length)).fill('')];
    blocks.push({ type: 'table', head: true, rows: [[nl, ...pad(pg.map(p => p.name))], [rl, ...pad(pg.map(p => p.text))]] });
  });
  if (layoutOk(layout) && Array.isArray(layout.notes) && layout.notes.length) blocks.push(...noteBlocks(layout.notes));
  return { title: titleOf('observe', camp, layout), blocks };
}

/* ---------- 결과 보고서 ---------- */
export function reportDoc(camp, layout) {
  const r = camp.report;
  const blocks = [];
  r.sections.forEach((s, i) => {
    if (s.head) blocks.push({ type: 'h', text: `${i + 1}. ${s.head}` });
    if (s.text.trim()) blocks.push({ type: 'p', text: s.text.trim() });
  });
  return { title: r.title.trim() || titleOf('report', camp, layout), blocks };
}

const BUILD = { confirm: confirmDoc, attend: attendDoc, observe: observeDoc, report: reportDoc };
export function campDoc(id, camp, layout = null) {
  if (!BUILD[id]) throw new Error('unknown doc ' + id);
  return BUILD[id](camp, layout);
}
