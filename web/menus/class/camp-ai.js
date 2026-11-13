/* 기초학력 캠프 AI 글(프롬프트)과 AI 답 정리 (화면 없음 — Node 시험에서도 씀). 업무: 일정·보고서·양식 읽기는 plan, 관찰 글은 writing.
   날짜는 앱이 정함: 선생님 글에서 기간·요일을 읽어(findRange·findWeekdays) 펼치고 주말·공휴일은 뺌(camp-model expandDates).
   AI는 하루 시간(교시)·교과 차례·지도 내용만 쓰고, 앱이 기간을 못 읽었을 때만 AI가 읽은 기간을 씀.
   AI로 가는 글에는 학생 이름 대신 학생A·학생B(toAlias), 지도교사 이름은 보내지 않음 */
import { isDate, weekday, yearOfMonth, addDays, HOLIDAYS } from '../../core/calendar.js';
import { toAlias, aliasMap, attStats, hoursTotal, campDates, sortSessions, expandDates, periodSlots, normTime, newSession, REPORT_HEADS, REPORT_KINDS } from './camp-model.js';
import { DOC_LABEL } from './camp-docs.js';

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
const clip = (s, n) => { const t = str(s).trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const pad = n => String(n).padStart(2, '0');
const WEEK = '일월화수목금토';

/* ---------- 글에서 기간·요일 읽기 ---------- */
const YEAR = '(?:(20\\d{2})\\s*[-./년]\\s*)?';
const RANGE = new RegExp(`${YEAR}(\\d{1,2})\\s*[-./월]\\s*(\\d{1,2})\\s*일?\\.?(?:\\s*\\([^)]{1,4}\\))?\\s*(?:~|∼|〜|–|부터)\\s*${YEAR}(?:(\\d{1,2})\\s*[-./월]\\s*)?(\\d{1,2})(?!\\s*[:시분])`);
/* 「1/8~1/23」「1월 8일~23일」「2027. 1. 8.~1. 23.」「1.8부터 1.15까지」 → { from, to }. 연도 없는 날은 학년도(year)의 달(1·2월은 다음 해),
   그렇게 읽은 기간이 오늘보다 한 달 넘게 지났으면 한 해 뒤 */
export function findRange(text, { year, today } = {}) {
  const m = RANGE.exec(String(text == null ? '' : text));
  if (!m) return null;
  const [, y1, m1, d1, y2, m2, d2] = m;
  const yOf = (y, mo) => (y ? +y : yearOfMonth(+mo, +year || new Date().getFullYear()));
  const sm = +m1, em = m2 ? +m2 : +d2 >= +d1 ? sm : sm % 12 + 1;
  const sy = yOf(y1, sm);
  // 끝 날의 해: 적혀 있으면 그것, 달만 있으면(시작 해가 적혀 있으면 그 해 — 12월→1월은 다음 해, 아니면 학년도의 달), 날만 있으면 시작 해
  const ey = y2 ? +y2 : m2 ? (y1 ? (em >= sm ? sy : sy + 1) : yOf(null, em)) : (em >= sm ? sy : sy + 1);
  let from = `${sy}-${pad(sm)}-${pad(+d1)}`;
  let to = `${ey}-${pad(em)}-${pad(+d2)}`;
  if (!isDate(from) || !isDate(to)) return null;
  if (to < from) to = `${+to.slice(0, 4) + 1}${to.slice(4)}`;
  if (!y1 && !y2 && today && isDate(today) && to < addDays(today, -31)) {
    from = `${+from.slice(0, 4) + 1}${from.slice(4)}`; to = `${+to.slice(0, 4) + 1}${to.slice(4)}`;
  }
  return isDate(from) && isDate(to) && from <= to ? { from, to } : null;
}
const WD = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
/* 「평일」→ 월~금, 「월수금」「화, 목」「수요일」 → 그 요일들, 없으면 null(「수학」「화목한」「1월 8일」은 요일이 아님) */
export function findWeekdays(text) {
  const t = String(text == null ? '' : text);
  if (/평일|주중|월\s*~\s*금/.test(t)) return [1, 2, 3, 4, 5];
  const toks = [...t.matchAll(/[가-힣]+/g)].map(m => ({ w: m[0], i: m.index, e: m.index + m[0].length }));
  const days = new Set();
  let run = [], end = -1;
  const flush = () => { const all = run.flatMap(r => r.days); if (all.length >= 2 || run.some(r => r.yoil)) all.forEach(d => days.add(d)); run = []; };
  for (const tk of toks) {
    const m = /^([일월화수목금토]{1,7})(요일)?(?:마다|에|에만|만|부터|까지)?$/.exec(tk.w);
    // 「1월」「8일」처럼 숫자 바로 뒤 한 글자는 날짜
    const ok = m && !(m[1].length === 1 && !m[2] && tk.i > 0 && /\d/.test(t[tk.i - 1]));
    if (!ok) { flush(); continue; }
    if (run.length && !/^[\s,·、/및]*$/.test(t.slice(end, tk.i))) flush();
    run.push({ days: [...m[1]].map(c => WD[c]), yoil: !!m[2] }); end = tk.e;
  }
  flush();
  return days.size ? [...days].sort((a, b) => a - b) : null;
}

/* ---------- 수업 일정 ---------- */
const subjectsText = camp => (camp.subjects.length ? camp.subjects.join(', ') : '(정하지 않음)');
/* → { prompt, range, weekdays } (range·weekdays: 앱이 글에서 읽은 것, 없으면 null) */
/* plan: 운영 계획서 글(계획 파일 넣기) — 글을 더 길게 보내고, 기간·요일은 부르는 쪽이 「기간」 줄에서 읽은 것(range·weekdays)을 씀 */
export function schedulePrompt(text, camp, { year, today, plan = false, range: r0, weekdays: w0 } = {}) {
  const raw = String(text == null ? '' : text);
  const range = r0 !== undefined && r0 !== null ? r0 : findRange(raw, { year, today }), weekdays = w0 !== undefined && w0 !== null ? w0 : findWeekdays(raw);
  const days = range ? expandDates(range.from, range.to, { weekdays: (weekdays || [1, 2, 3, 4, 5]).filter(d => d >= 1 && d <= 5) }) : null;
  const day = camp.unit === 'day';
  const prompt = ['[기초학력 수업 일정]',
    `초등학교 기초학력 지원(캠프·교실·수업)의 수업 일정을 만듭니다. 오늘: ${today || ''}, 학년도: ${year || ''}(3월~이듬해 2월).`,
    `교과: ${subjectsText(camp)} · 대상: ${toAlias(camp.target, camp) || '(없음)'} · 출석 단위: ${day ? '날마다(하루에 한 줄)' : '교시마다'}`,
    days ? `앱이 읽은 기간: ${range.from} ~ ${range.to} → 주말·공휴일을 빼면 수업 날 ${days.length}일(${days.map(d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${WEEK[weekday(d)]})`).join(', ')})` : '',
    '',
    plan ? '[운영 계획서]' : '[선생님 글]', toAlias(raw, camp).slice(0, plan ? 6000 : 2000) || '(없음)',
    '',
    '규칙:',
    '- 날짜는 앱이 셉니다. from·to(기간 첫날·끝날, YYYY-MM-DD)와 weekdays(수업하는 요일 번호: 1=월 2=화 3=수 4=목 5=금)만 씁니다. 「평일」은 [1,2,3,4,5]. 기간 없이 날짜를 하나하나 말했으면 dates에 그 날짜들을 씁니다. 주말·공휴일은 앱이 뺍니다.',
    '- 하루 시간: start(첫 교시 시작, HH:MM), periods(하루 교시 수), minutes(한 교시 분), rest(쉬는 시간 분). 교시 시각이 고르지 않으면 slots에 [{"start":"09:00","end":"09:40"}, …]를 씁니다.',
    '- order: 하루 교시마다 교과(교시 수만큼, 날마다 같음). 예: ["국어","수학","국어","수학","국어"]',
    `- lessons: 교과마다 지도 내용을 차시 차례대로(${day ? '그 교과가 든 수업 날 수만큼, 하루에 한 줄' : '그 교과 수업 수만큼 = 수업 날 수 × 하루에 든 그 교과 교시 수'}). 한 줄 40자 안쪽으로 구체적으로(예: 「받침 없는 낱말 받아쓰기」「두 자리 수 덧셈(받아올림 없음)」). 기초학력 수준(낮은 학년 내용 복습)에 맞추고, 교재·플랫폼(예: 아이스크림 홈런)을 말했으면 그에 맞게 씁니다.`,
    ...(plan ? ['- 계획서에 차시별 지도 내용이 있으면 그 차례대로 그대로 쓰고, 없으면 교과·차시에 맞게 씁니다. 계획 수립·기안·결과 보고 같은 행정 날짜는 수업 날이 아닙니다.'] : []),
    '- 학생 이름은 쓰지 않습니다.',
    '',
    '[출력] JSON 하나만:',
    '{"from":"","to":"","weekdays":[1,2,3,4,5],"dates":[],"start":"09:00","periods":5,"minutes":40,"rest":5,"slots":[],"order":["국어","수학"],"lessons":[{"subject":"국어","items":["…"]},{"subject":"수학","items":["…"]}]}']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  return { prompt, range, weekdays };
}

const num = (v, lo, hi, dflt) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : dflt; };
const isSchoolDay = d => weekday(d) >= 1 && weekday(d) <= 5 && !HOLIDAYS[d];
const subjKey = s => str(s).replace(/\s+/g, '').replace(/과$/, '');
/* AI 답 → { from, to, dates, dropped(뺀 주말·공휴일 수), slots, order, lessons: { 교과: [지도 내용…] } }.
   range·weekdays: 앱이 글에서 읽은 것(있으면 AI 답보다 앞섬) */
export function normSchedule(v, { range = null, weekdays = null } = {}) {
  const o = isObj(v) ? v : {};
  const wdAI = arr(o.weekdays).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
  const wd = weekdays && weekdays.length ? weekdays : wdAI.length ? wdAI : [1, 2, 3, 4, 5];
  const from = range ? range.from : isDate(o.from) ? o.from : '', to = range ? range.to : isDate(o.to) ? o.to : '';
  let dates = [], dropped = 0;
  if (from && to && from <= to) {
    const want = expandDates(from, to, { weekdays: wd, skipHolidays: false });
    dates = want.filter(isSchoolDay); dropped = want.length - dates.length;
  } else {
    const ds = [...new Set(arr(o.dates).filter(isDate))].sort();
    dates = ds.filter(isSchoolDay); dropped = ds.length - dates.length;
  }
  let slots = arr(o.slots).filter(isObj).map(s => ({ start: normTime(s.start), end: normTime(s.end) })).filter(s => s.start && s.end && s.start < s.end)
    .sort((a, b) => (a.start < b.start ? -1 : 1)).slice(0, 10);
  if (!slots.length) slots = periodSlots(normTime(o.start) || '09:00', num(o.periods, 1, 10, 1), num(o.minutes, 10, 180, 40), num(o.rest, 0, 60, 10));
  if (!slots.length) slots = periodSlots('09:00', 1, 40, 10);
  const order = arr(o.order).map(x => str(x).trim().slice(0, 20)).filter(Boolean).slice(0, 10);
  const lessons = {};
  const add = (s, items) => { const k = str(s).trim().slice(0, 20); if (k) lessons[k] = arr(items).map(x => str(x).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 300); };
  if (Array.isArray(o.lessons)) o.lessons.filter(isObj).forEach(l => add(l.subject, l.items));
  else if (isObj(o.lessons)) Object.entries(o.lessons).forEach(([k, items]) => add(k, items));
  return { from, to, dates, dropped, slots, order, lessons };
}
/* 수업 줄 만들기: 교시마다면 날짜 × 교시, 날마다면 날짜마다 한 줄(첫 교시 시작~끝 교시 끝). 교과마다 지도 내용은 차례대로 → { sessions, empty(지도 내용이 빈 줄 수) } */
export function buildSessions(spec, camp) {
  const subs = spec.order.length ? spec.order : camp.subjects.length ? camp.subjects : [''];
  const keys = Object.keys(spec.lessons);
  const used = {};
  const take = s => {
    const k = keys.find(x => x === s) || keys.find(x => subjKey(x) === subjKey(s));
    const i = used[s] || 0; used[s] = i + 1;
    return k ? spec.lessons[k][i] || '' : '';
  };
  const out = [];
  for (const d of spec.dates) {
    if (out.length >= 300) break;
    const daySubs = spec.slots.map((_, i) => subs[i % subs.length]);
    if (camp.unit === 'day') {
      const uniq = [...new Set(daySubs)];
      const parts = uniq.map(s => { const t = take(s); return t && uniq.length > 1 && s ? `${s}: ${t}` : t; }).filter(Boolean);
      out.push(newSession({ date: d, start: spec.slots[0].start, end: spec.slots[spec.slots.length - 1].end, subject: uniq.filter(Boolean).join('·'), content: parts.join(' / ') }));
    } else spec.slots.forEach((sl, i) => out.push(newSession({ date: d, start: sl.start, end: sl.end, subject: daySubs[i], content: take(daySubs[i]) })));
  }
  const sessions = out.slice(0, 300);
  return { sessions, empty: sessions.filter(s => !s.content.trim()).length };
}

/* ---------- 관찰 및 지도 결과 ---------- */
/* 교과마다 지도 내용(같은 것은 한 번) — 앞에서 n자까지 */
function contentSummary(camp, n = 700) {
  const by = new Map();
  for (const s of sortSessions(camp.sessions)) {
    const t = toAlias(s.content, camp).trim();
    if (!t) continue;
    const k = s.subject || '기타';
    if (!by.has(k)) by.set(k, []);
    if (!by.get(k).includes(t)) by.get(k).push(t);
  }
  return clip([...by].map(([k, l]) => `${k} — ${l.join(', ')}`).join('; '), n) || '(지도 내용 없음)';
}
const campLine = camp => {
  const ds = campDates(camp);
  return `프로그램: ${toAlias(camp.name, camp) || '기초학력 지원'} · 대상: ${toAlias(camp.target, camp) || '(없음)'} · 교과: ${subjectsText(camp)}`
    + (ds.length ? ` · 기간: ${ds[0]} ~ ${ds[ds.length - 1]}(수업 날 ${ds.length}일)` : '') + ` · 지도 시간: 총 ${hoursTotal(camp)}시간 · 학생 ${camp.students.length}명`;
};
const attLine = (camp, st) => { const a = attStats(camp, st.id); return `출석 ${a.present}/${a.total}회${a.absent ? `(결석 ${a.absent}회)` : ''}`; };
const oneLine = s => str(s).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
/* ids: 쓸 학생 id(고친 칸은 빼고 부르는 쪽이 고름) */
export function obsPrompt(camp, ids) {
  const al = aliasMap(camp), pick = camp.students.filter(s => ids.includes(s.id));
  return ['[기초학력 관찰 기록]',
    '초등학교 기초학력 지원(캠프·교실·수업) 학생마다 「관찰 및 지도 결과」를 씁니다.',
    campLine(camp),
    `지도 내용(간추림): ${contentSummary(camp)}`,
    '',
    '[학생]',
    ...pick.map(st => `- ${al[st.id]}: ${attLine(camp, st)} · 선생님 메모: ${clip(oneLine(toAlias(camp.memo[st.id], camp)), 400) || '(없음)'}`),
    '',
    '규칙:',
    '- 학생마다 2~4문장. 문장 끝은 「~함.」「~임.」「~보임.」 꼴로, 개조식·번호·줄바꿈 없이 이어 씁니다.',
    '- 선생님 메모·출석·지도 내용에 있는 것만 씁니다. 없는 점수·성과·가정 사정은 지어내지 않습니다. 메모가 없으면 출석과 지도 내용으로 짧게 씁니다.',
    '- 부족한 점은 나아질 점·지도한 방법으로 씁니다. 학생 이름과 학생A 같은 말은 글에 쓰지 않습니다(이름 칸이 따로 있어요).',
    '',
    '[출력] JSON 하나만:',
    `{"students":[${pick.map(st => `{"id":"${al[st.id]}","text":"…"}`).join(',')}]}`].join('\n');
}
const tidyText = s => str(s).split('\n').map(l => l.replace(/^\s*(?:[-·•*]|\d+[.)])\s*/, '').trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
/* AI 답 → { 학생 id: 글 }(모르는 학생·빈 글은 버림) */
export function normObs(v, camp) {
  const list = Array.isArray(v) ? v : isObj(v) ? arr(v.students) : [];
  const back = Object.fromEntries(Object.entries(aliasMap(camp)).map(([id, a]) => [a, id]));
  const out = {};
  for (const x of list) {
    if (!isObj(x)) continue;
    const id = back[str(x.id).trim()], text = tidyText(x.text).slice(0, 800);
    if (id && text) out[id] = text;
  }
  return out;
}

/* ---------- 결과 보고서 ---------- */
const stripNo = s => str(s).replace(/^\s*(?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+|[가-하])\s*[.)]\s*/, '').trim();
/* 보고서 글 머리: 사업선택제·이끎교사는 서식대로, 학교 양식은 넣은 양식의 글 머리(없으면 사업선택제) */
export function reportHeads(camp, layout) {
  if (camp.report.kind === 'form') {
    const h = isObj(layout) ? arr(layout.heads).map(stripNo).filter(Boolean) : [];
    return h.length ? h : REPORT_HEADS.select;
  }
  return REPORT_HEADS[camp.report.kind] || REPORT_HEADS.select;
}
const KIND_NOTE = {
  select: '사업선택제 [서식 2] 결과 보고서: 2쪽 이내. 섹션마다 4~8줄로 짧게.',
  lead: '이끎교사 [서식 1] 운영 보고서: 5쪽 이상 분량. 섹션마다 충분히(15줄 이상), 추진 내용은 차시·교과별로 자세히, 일반화 방안은 다른 학급·학교에서 쓸 수 있게.',
  form: '학교 양식 결과 보고서: 양식의 글 머리 차례대로.'
};
export function reportPrompt(camp, layout = null) {
  const heads = reportHeads(camp, layout), al = aliasMap(camp);
  const kind = (REPORT_KINDS.find(k => k[0] === camp.report.kind) || REPORT_KINDS[0])[1];
  const obs = camp.students.map(st => [al[st.id], clip(oneLine(toAlias(camp.obs[st.id], camp)), 200)]).filter(([, t]) => t);
  return ['[기초학력 결과 보고서]',
    `${kind}를 씁니다. ${KIND_NOTE[camp.report.kind] || KIND_NOTE.select}`,
    campLine(camp),
    `출석: ${camp.students.map(st => `${al[st.id]} ${attLine(camp, st).replace(/^출석 /, '')}`).join(', ') || '(학생 없음)'}`,
    `지도 내용(간추림): ${contentSummary(camp, 1500)}`,
    obs.length ? `관찰 및 지도 결과(간추림): ${obs.map(([a, t]) => `${a}: ${t}`).join(' / ')}` : '',
    '',
    '[선생님 메모(목적·성과)]', clip(toAlias(camp.report.prompt, camp), 3000) || '(없음)',
    '',
    '규칙:',
    `- sections는 이 글 머리 차례대로: ${heads.map(h => `「${h}」`).join(' ')}`,
    '- 공문서 말투(~함, ~임). 줄마다 「- 」로 시작하는 짧은 개조식으로 씁니다.',
    '- 학생은 이름 대신 학생A·학생B로 씁니다(예: (학생A) 받아쓰기 60점 → 85점).',
    '- 선생님 메모·자료에 없는 숫자·성과·만족도는 지어내지 않습니다. 지도교사 이름은 쓰지 않습니다.',
    '',
    '[출력] JSON 하나만:',
    `{"title":"…","sections":[${heads.map(h => `{"head":"${h}","text":"- …"}`).join(',')}]}`].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
const flat = s => stripNo(s).replace(/\s+/g, '');
/* AI 답 → { title, sections: [{ head, text }] }. heads가 있으면 그 차례로(이름이 같은 섹션, 없으면 남은 것 차례) */
export function normCampReport(v, heads = []) {
  const o = isObj(v) ? v : {};
  const got = arr(o.sections).filter(isObj).map(s => ({ head: stripNo(s.head || s.h).slice(0, 60), text: (str(s.text) || arr(s.lines).map(str).join('\n')).trim().slice(0, 6000) }))
    .filter(s => s.text);
  let sections;
  if (heads.length) {
    const left = [...got];
    const byName = heads.map(h => { const i = left.findIndex(s => flat(s.head) === flat(h) || (flat(s.head) && (flat(s.head).includes(flat(h)) || flat(h).includes(flat(s.head))))); return i >= 0 ? left.splice(i, 1)[0] : null; });
    sections = heads.map((h, i) => ({ head: h, text: (byName[i] || left.shift() || { text: '' }).text })).filter(s => s.text);
  } else sections = got.slice(0, 10);
  return { title: str(o.title).trim().slice(0, 150), sections };
}

/* ---------- 양식 읽기(PDF·사진·.hwp) ---------- */
export function layoutPrompt(docId, { text = '', nImages = 0 } = {}) {
  const label = DOC_LABEL[docId] || '문서';
  return ['[기초학력 양식 읽기]',
    `학교 기초학력 지원 「${label}」 양식의 모양을 읽습니다.${nImages ? ` 첨부한 그림 ${nImages}장이 양식입니다.` : ''}`,
    '- title: 문서 제목 그대로(예: 「3-2 기초학력 중점학급 수업 확인서」)',
    '- columns: 수업·학생 표의 머리 칸 이름을 왼쪽부터 차례대로, 칸 이름 그대로. 학생마다 칸이 있으면 「학생1」「학생2」, 날짜마다 칸이면 「날짜1」「날짜2」처럼 씁니다. 관찰 기록부처럼 머리 칸이 왼쪽 세로 줄이면 위에서부터. 결재란 칸은 넣지 않습니다.',
    '- notes: 안내 글(「※ …」 같은 줄) 그대로',
    '- heads: 결과 보고서면 글 머리(소제목) 차례대로, 아니면 []',
    '- 표에 적힌 사람 이름·전화번호·내용은 옮기지 않습니다.',
    text ? `\n[양식 글]\n${String(text).slice(0, 6000)}` : '',
    '',
    '[출력] JSON 하나만:',
    '{"title":"","columns":[],"notes":[],"heads":[]}'].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
export function normLayout(v) {
  if (!isObj(v)) return null;
  const list = (x, n, len) => arr(x).filter(s => typeof s === 'string').map(s => s.replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, n);
  const l = { title: str(v.title).replace(/\s+/g, ' ').trim().slice(0, 120), columns: list(v.columns, 30, 30), notes: list(v.notes, 6, 200), heads: list(v.heads, 10, 60).map(stripNo).filter(Boolean) };
  return l.title || l.columns.length || l.notes.length || l.heads.length ? l : null;
}
