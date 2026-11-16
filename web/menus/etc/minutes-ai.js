/* 문서·소통 › 회의록 (스펙 2026-11-15 2장): 협의회 메모 → 가려 보내기(core/redact.js) → AI 한 번(업무 doc) → 안건·협의 내용·결정 사항·할 일·다음 회의.
   개조식(~함·~임), 메모에 없는 결정·숫자는 지어내지 않음, 연도 없는 날은 학년도 규칙(쪽지·공문 처리와 같게).
   복사 글·쌤비서 기본 회의록 문서, 끝내지 않은 할 일(7일 안·지남 → 「오늘」). 화면 없이 돌아감(시험) */
import { makeRedactor } from '../../core/redact.js';
import { schoolDate, normDate, fmtDay } from './message-ai.js';

export const KINDS = [['grade', '학년 협의회'], ['subject', '교과 협의회'], ['dept', '부서 협의회'], ['council', '학교운영위원회'], ['etc', '기타']];
const KIND_IDS = KINDS.map(k => k[0]);
export const kindLabel = id => (KINDS.find(k => k[0] === id) || KINDS[KINDS.length - 1])[1];
export const MAX_TEXT = 12000, MAX_AGENDA = 12, MAX_LINES = 12, MAX_TODOS = 20;

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const one = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// 줄 앞 기호·번호(「- 」「· 」「○ 」「1. 」「가. 」「(2) 」)는 뺌 — 앱이 다시 붙임
const BULLET = /^\s*(?:[-–—·•○◦▪■□*※>]+|\(?\d{1,2}[.)]|[가-하][.)])\s*/;
const lineOf = (v, n) => one(String(v == null ? '' : v).replace(BULLET, ''), n);

/* 회의 이름 → 회의 종류 짐작(선생님이 고르지 않았을 때) */
export function guessKind(title) {
  const t = String(title == null ? '' : title);
  if (/학교\s*운영\s*위원회|운영\s*위원회/.test(t)) return 'council';
  if (/교과|(?:국어|수학|사회|과학|영어|음악|미술|체육|도덕|실과|정보)\s*과?\s*(?:교과\s*)?협의/.test(t)) return 'subject';
  if (/학년\s*(?:협의|회의)/.test(t)) return 'grade';
  if (/부서|[가-힣]부\s*(?:협의|회의)/.test(t)) return 'dept';
  return 'etc';
}

/* AI로 보낼 메모·칸을 한 가리개로 가림(같은 이름은 같은 자리 표시): 명단·주민번호·계좌 줄은 뺌(dropped).
   메모는 줄을 한꺼번에(core/redact.js lines — 한 줄에 한 명씩인 번호 명단·「이름」 머리 칸 아래 표, 다른 줄(앞 줄도)에서 알아낸 이름),
   칸(참석 칸도 — 보내지는 않음)의 이름도 먼저 배워 메모에서 가림(참석 칸은 이름이 하나여도, 메모의 「참석: …」 명단 줄도). 보내는 칸은 회의 종류·이름·날짜·시간·장소(이름·시간·장소도 가림) */
export function redactInput(memo, meta = {}) {
  const r = makeRedactor(), m = isObj(meta) ? meta : {};
  const cells = { title: one(m.title, 200), time: one(m.time, 40), place: one(m.place, 200) };
  const memoLines = String(memo == null ? '' : memo).split('\n');
  r.learn(memoLines); // 자리 표시 번호는 메모에 나온 차례(〔이름1〕이 메모의 첫 이름), 칸에서만 나온 이름은 그 뒤
  r.learnList(one(m.attendees, 200));
  const out = r.lines(memoLines, { learn: [cells.title, cells.time, cells.place, one(m.attendees, 200)].filter(Boolean) });
  const text = out.filter(Boolean).map(x => x.text).join('\n');
  const hide = s => { if (!s) return ''; const x = r.line(s); return x ? x.text : ''; };
  const sent = { kind: KIND_IDS.includes(m.kind) ? m.kind : '', title: hide(cells.title), date: one(m.date, 20), time: hide(cells.time), place: hide(cells.place) };
  // 가린 수: 보내는 글에 실제로 든 자리 표시(참석 칸에서만 배운 이름은 세지 않음)
  const masked = new Set([text, sent.title, sent.time, sent.place].join('\n').match(/〔이름\d+〕|\{\{\d+\}\}/g) || []).size;
  return { text, meta: sent, back: r.back, dropped: out.filter(x => !x).length, masked };
}

export function minutesPrompt({ text = '', meta = {}, today = '', year, nImages = 0 } = {}) {
  const m = isObj(meta) ? meta : {};
  const known = [['회의 종류', m.kind && m.kind !== 'etc' ? kindLabel(m.kind) : ''], ['회의 이름', m.title], ['날짜', m.date], ['시간', m.time], ['장소', m.place]]
    .map(([k, v]) => [k, one(v, 200)]).filter(([, v]) => v);
  return ['[회의록 정리]',
    `학교 선생님이 적은 회의(협의회) 메모입니다.${today ? ` 오늘: ${today}.` : ''}${year ? ` 학년도: ${year}(3월~다음 해 2월).` : ''}`,
    `메모를 회의록으로 정리해 JSON 하나로만 답하세요.${nImages ? ` 첨부한 그림 ${nImages}장도 같은 회의의 판서·메모 사진입니다.` : ''}`,
    '- title: 회의 이름(예: 3학년 학년 협의회), date: 회의 날짜(YYYY-MM-DD, 연도가 없으면 MM-DD), time: 시간(예: 15:00~16:00), place: 장소',
    '- attendees: 참석(직함·인원만, 예: 3학년 담임 5명)',
    '- agenda: 안건마다 {"title":"안건","discussion":["협의 내용"],"decisions":["결정 사항"]}',
    '- todos: 회의에서 정한 할 일마다 {"task":"할 일","who":"담당","due":"YYYY-MM-DD 또는 MM-DD"} — 담당·기한이 메모에 없으면 빈 글',
    '- next: 다음 회의 {"date":"","topic":"다음 회의 안건"}',
    '- 줄은 개조식으로 짧게 쓰고 끝은 「~함」「~임」으로 맺습니다(예: 체험학습 장소를 과학관으로 정함).',
    '- 메모에 없는 결정·숫자·날짜·담당은 지어내지 않습니다. 정하지 않은 것은 협의 내용에만 쓰고 결정 사항에 넣지 않습니다. 없는 것은 빈 글·빈 목록.',
    '- 〔이름1〕·{{1}} 같은 자리 표시는 가린 이름·연락처입니다. 그대로 옮겨 쓰고 지우거나 바꾸거나 짐작하지 않습니다.',
    ...(known.length ? ['', '[선생님이 적은 칸]', ...known.map(([k, v]) => `${k}: ${v}`)] : []),
    '', '[메모]', String(text == null ? '' : text).slice(0, MAX_TEXT),
    '', '[출력] JSON 하나만 출력합니다.',
    '{"title":"…","date":"2026-11-12","time":"15:00","place":"…","attendees":"…","agenda":[{"title":"…","discussion":["…"],"decisions":["…"]}],"todos":[{"task":"…","who":"…","due":""}],"next":{"date":"","topic":""}}'].join('\n');
}

export const validMinutes = o => !!isObj(o) && (Array.isArray(o.agenda) || Array.isArray(o.todos) || typeof o.title === 'string');

/* 돌아온 답의 모든 글에 원래 이름·연락처를 되돌림 */
export function backAll(v, back) {
  if (typeof v === 'string') return back(v);
  if (Array.isArray(v)) return v.map(x => backAll(x, back));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, backAll(x, back)]));
  return v;
}

function lines(v, n = 200, max = MAX_LINES) {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : [];
  return raw.map(x => (typeof x === 'string' || typeof x === 'number' ? lineOf(x, n) : isObj(x) ? lineOf(x.text || x.content || '', n) : '')).filter(Boolean).slice(0, max);
}
/* 연도 없이 온 회의 날: 학년도 규칙(1·2월은 다음 해)으로 붙인 날이 오늘보다 7일 넘게 뒤면 지난해(회의록은 지난 회의 — 3월 초에 적은 2월 말 협의회) */
const AHEAD = 7;
function meetingDate(v, year, today) {
  const iso = schoolDate(v, year);
  if (!iso || /^\d{4}/.test(String(v == null ? '' : v).trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return iso;
  if ((Date.parse(iso) - Date.parse(today)) / 864e5 <= AHEAD) return iso;
  return normDate(`${+iso.slice(0, 4) - 1}${iso.slice(4)}`) || iso;
}
/* 날의 학년도(1·2월은 지난해 학년도) */
const yearOfDay = iso => (+iso.slice(5, 7) <= 2 ? +iso.slice(0, 4) - 1 : +iso.slice(0, 4));
/* AI 답 → 회의록 칸. year: 연도 없는 날에 붙일 학년도(1·2월은 다음 해), today: 오늘.
   회의 날은 지난 날이라 학년도 규칙에 7일 넘는 앞날은 지난해(meetingDate), 할 일 기한·다음 회의는 회의 날(없으면 오늘)의 학년도·그 날을 기준으로 60일 규칙까지(공문 처리와 같게) */
export function normMinutes(v, { year, today = '' } = {}) {
  const o = isObj(v) ? v : {};
  const title = one(o.title, 100), date = meetingDate(o.date, year, today), ref = date || today;
  if (date && year) year = yearOfDay(date);
  const agenda = (Array.isArray(o.agenda) ? o.agenda : []).map(a => (typeof a === 'string' ? { title: a } : isObj(a) ? a : null)).filter(Boolean)
    .map(a => ({ title: lineOf(a.title || a.name || '', 120), discussion: lines(a.discussion || a.discussions), decisions: lines(a.decisions || a.decision) }))
    .filter(a => a.title || a.discussion.length || a.decisions.length).slice(0, MAX_AGENDA);
  const todos = (Array.isArray(o.todos) ? o.todos : []).map(t => (typeof t === 'string' ? { task: t } : isObj(t) ? t : null)).filter(Boolean)
    .map(t => ({ task: lineOf(t.task || t.text || '', 150), who: one(t.who, 60), due: schoolDate(t.due, year, ref), done: false })).filter(t => t.task).slice(0, MAX_TODOS);
  const nx = isObj(o.next) ? o.next : { topic: typeof o.next === 'string' ? o.next : '' };
  const att = Array.isArray(o.attendees) ? o.attendees.map(x => one(x, 80)).filter(Boolean).join(', ') : o.attendees;
  return {
    kind: KIND_IDS.includes(o.kind) ? o.kind : guessKind(title), title, date, time: one(o.time, 40), place: one(o.place, 100), attendees: one(att, 200),
    agenda, todos, next: { date: schoolDate(nx.date, year, ref), topic: one(nx.topic, 150) }
  };
}

/* 다시 정리할 때 선생님이 고친 칸(touched)은 그대로 — 고쳤어도 비어 있으면(잘못 누른 [안건 더하기] 등) AI 값. 고치지 않은 글 칸은 AI가 못 찾았으면(빈 글) 전 값 그대로.
   할 일 체크는 고친 칸이 아님 — 할 일을 고치지 않았으면 같은 할 일의 체크를 이어 감 */
export const FIELD_KEYS = ['kind', 'title', 'date', 'time', 'place', 'attendees', 'agenda', 'todos', 'next'];
const SCALAR = ['title', 'date', 'time', 'place', 'attendees'];
const copy = v => JSON.parse(JSON.stringify(v == null ? null : v));
const same = s => String(s || '').replace(/\s+/g, '');
const filledVal = v => (typeof v === 'string' ? !!v.trim() : Array.isArray(v) ? v.some(filledVal) : isObj(v) ? Object.values(v).some(filledVal) : false);
/* 다시 정리해도 그대로 둘 칸: 고친 칸 가운데 글이 있는 것 */
export const keptKeys = (prev, touched = []) => FIELD_KEYS.filter(k => (Array.isArray(touched) ? touched : []).includes(k) && filledVal((prev || {})[k]));
/* 끝낸 할 일 → 다시 정리한 할 일: AI가 문장을 조금 바꿔 써도(「계획서 작성」 → 「계획서를 작성함」) 같은 할 일이면 체크를 이어 감.
   글자 두 개씩 묶음이 많이 겹치고(0.6 이상) 글 속 숫자가 같을 때만 — 다른 할 일을 끝냄으로 잘못 넘기지 않게.
   같은 글은 먼저, 끝낸 할 일 하나는 한 곳에만 */
const bare = s => same(s).replace(/[^\p{L}\p{N}]/gu, '');
const pairsOf = s => { const out = new Map(); for (let i = 0; i + 1 < s.length; i++) { const g = s.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; };
function overlap(a, b) {
  const A = pairsOf(a), B = pairsOf(b);
  let na = 0, nb = 0, both = 0;
  A.forEach(v => { na += v; }); B.forEach(v => { nb += v; });
  A.forEach((v, g) => { both += Math.min(v, B.get(g) || 0); });
  return na + nb ? (2 * both) / (na + nb) : 0;
}
const numsOf = s => (String(s || '').match(/\d+/g) || []).join(',');
function carryDone(prevTodos, nextTodos) {
  const done = (Array.isArray(prevTodos) ? prevTodos : []).filter(x => x && x.done && bare(x.task));
  const out = nextTodos.map(x => ({ ...x, done: !!x.done }));
  const pairs = [];
  done.forEach((d, i) => out.forEach((x, j) => {
    if (x.done || !bare(x.task) || numsOf(d.task) !== numsOf(x.task)) return;
    const exact = bare(d.task) === bare(x.task);
    const score = exact ? 2 : overlap(bare(d.task), bare(x.task));
    if (score >= 0.6) pairs.push({ i, j, score });
  }));
  const usedD = new Set(), usedX = new Set();
  pairs.sort((a, b) => b.score - a.score).forEach(({ i, j }) => {
    if (usedD.has(i) || usedX.has(j)) return;
    usedD.add(i); usedX.add(j); out[j].done = true;
  });
  return out;
}
export function keepFields(next, prev, touched = []) {
  const n = copy(next) || {}, p = prev || {}, t = Array.isArray(touched) ? touched : [];
  for (const k of keptKeys(p, t)) n[k] = copy(p[k]);
  for (const k of SCALAR) if (!t.includes(k) && !String(n[k] || '').trim() && p[k]) n[k] = p[k];
  if (!t.includes('todos')) n.todos = carryDone(p.todos, Array.isArray(n.todos) ? n.todos : []);
  return n;
}

/* ---------- 내보내기 ---------- */
const agendaOf = x => (Array.isArray(x.agenda) ? x.agenda : []).filter(isObj).map(a => ({ title: one(a.title, 120), discussion: (a.discussion || []).map(l => one(l, 200)).filter(Boolean), decisions: (a.decisions || []).map(l => one(l, 200)).filter(Boolean) }))
  .filter(a => a.title || a.discussion.length || a.decisions.length);
const todosOf = x => (Array.isArray(x.todos) ? x.todos : []).filter(t => isObj(t) && one(t.task, 150));
const whenOf = x => [fmtDay(x.date), one(x.time, 40)].filter(Boolean).join(' ');
/* 회의 날과 같은 해의 날은 연도 없이 「11. 20.(금)」 */
const dayIn = (iso, x) => fmtDay(iso, { noYear: !!x.date && String(iso).slice(0, 4) === String(x.date).slice(0, 4) });

/* 문서 이름: 「○○ 협의회 회의록」(이름이 회의록·협의록으로 끝나면 그대로) */
export function docName(rec) {
  const x = rec || {}, t = one(x.title, 100) || (x.kind && x.kind !== 'etc' && KIND_IDS.includes(x.kind) ? kindLabel(x.kind) : '');
  if (!t) return '회의록';
  return /(?:회의록|협의록)$/.test(t) ? t : `${t} 회의록`;
}

/* [복사] 개조식 글 */
export function minutesText(rec) {
  const x = rec || {}, out = [];
  const head = x.kind && x.kind !== 'etc' && KIND_IDS.includes(x.kind) ? `[${kindLabel(x.kind)}] ` : '';
  out.push(`${head}${one(x.title, 100) || '회의록'}`);
  const when = whenOf(x);
  if (when) out.push(`□ 일시: ${when}`);
  if (one(x.place, 100)) out.push(`□ 장소: ${one(x.place, 100)}`);
  if (one(x.attendees, 200)) out.push(`□ 참석: ${one(x.attendees, 200)}`);
  const ag = agendaOf(x);
  if (ag.length) {
    out.push('');
    ag.forEach((a, i) => {
      out.push(`${i + 1}. ${a.title || '안건'}`);
      if (a.discussion.length) out.push('  ○ 협의 내용', ...a.discussion.map(l => `    - ${l}`));
      if (a.decisions.length) out.push('  ○ 결정 사항', ...a.decisions.map(l => `    - ${l}`));
    });
  }
  const td = todosOf(x);
  if (td.length) {
    out.push('', '□ 할 일', ...td.map(t => {
      const meta = [one(t.who, 60) && `담당: ${one(t.who, 60)}`, fmtDay(t.due) && `기한: ${dayIn(t.due, x)}`].filter(Boolean);
      return `  - ${t.done ? '[완료] ' : ''}${one(t.task, 150)}${meta.length ? ` (${meta.join(', ')})` : ''}`;
    }));
  }
  const nx = x.next || {}, nt = [fmtDay(nx.date) && dayIn(nx.date, x), one(nx.topic, 150)].filter(Boolean).join(' / ');
  if (nt) out.push('', `□ 다음 회의: ${nt}`);
  return out.join('\n');
}

/* 쌤비서 기본 회의록 문서(core/hwpx.js 문서 꼴 — 한글·워드·PDF, 학교 양식 채우기에도) */
export function minutesDoc(rec) {
  const x = rec || {}, blocks = [];
  const info = [['회의 종류', x.kind && x.kind !== 'etc' && KIND_IDS.includes(x.kind) ? kindLabel(x.kind) : ''], ['일시', whenOf(x)], ['장소', one(x.place, 100)], ['참석', one(x.attendees, 200)]].filter(r => r[1]);
  if (info.length) blocks.push({ type: 'table', rows: info, widths: [1, 4] });
  const L = ['가', '나'];
  agendaOf(x).forEach((a, i) => {
    blocks.push({ type: 'h', text: `${i + 1}. ${a.title || '안건'}` });
    let k = 0;
    if (a.discussion.length) blocks.push({ type: 'p', text: [`${L[k++]}. 협의 내용`, ...a.discussion.map(l => `  - ${l}`)].join('\n') });
    if (a.decisions.length) blocks.push({ type: 'p', text: [`${L[k++]}. 결정 사항`, ...a.decisions.map(l => `  - ${l}`)].join('\n') });
  });
  const td = todosOf(x);
  if (td.length) {
    blocks.push({ type: 'h', text: '할 일' });
    blocks.push({ type: 'table', head: true, widths: [5, 2, 2, 1], rows: [['할 일', '담당', '기한', '확인'], ...td.map(t => [one(t.task, 150), one(t.who, 60), fmtDay(t.due), t.done ? '완료' : ''])] });
  }
  const nx = x.next || {}, nt = [fmtDay(nx.date), one(nx.topic, 150)].filter(Boolean).join(' · ');
  if (nt) blocks.push({ type: 'h', text: '다음 회의' }, { type: 'p', text: nt });
  return { title: docName(x), blocks };
}

/* ---------- 할 일 → 「오늘」 ---------- */
const dayNo = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m && fmtDay(iso) ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null; };
/* 끝내지 않은 할 일 가운데 기한이 days일 안(지남 포함), 가까운 차례 max개 → [{ id(회의록), i(할 일 번호), task, who, due, n(남은 날), title(회의 이름) }] */
export function dueTodos(list, today, { days = 7, max = Infinity } = {}) {
  const t = dayNo(today), out = [];
  if (t == null) return out;
  for (const m of Array.isArray(list) ? list : []) {
    if (!isObj(m) || !Array.isArray(m.todos)) continue;
    m.todos.forEach((x, i) => {
      if (!isObj(x) || x.done || !one(x.task, 150)) return;
      const d = dayNo(x.due);
      if (d == null || d - t > days) return;
      out.push({ id: m.id, i, task: one(x.task, 150), who: one(x.who, 60), due: x.due, n: Math.round(d - t), title: one(m.title, 100) });
    });
  }
  return out.sort((a, b) => a.n - b.n).slice(0, max);
}
