/* 기타 › 가정통신문 번역본 (스펙 2026-11-06 K): 다문화 가정에 보낼 번역본 — 베트남어·중국어(간체)·러시아어·영어.
   원문(제목·본문 줄·회신서·알림 글)을 조각으로 나눠 AI로 보냄: 전화번호·날짜·숫자만 있는 줄·칸은 보내지 않고 그대로,
   줄 머리(「1.」「  가.」「□」)·표 짜임(「| 시간 | 내용 |」)은 앱이 지키고, 전화번호·이메일은 {{1}}로, 이름(학생·교직원)은 ○○○로 가려 보냄(명단 줄은 보내지 않음).
   번역은 원문 글을 열쇠로 가정통신문마다·언어마다 저장(원문을 고치면 그 줄만 다시). 문서는 원문과 나란히(문단마다 한국어 뒤에 번역).
   화면 없이 돌아감(시험) */
import { isTableLine, splitCells } from '../../core/body-table.js';
import { replyCells } from '../../core/hwpx-form.js';
import { MASK, maskStaff, maskJosaNames } from '../../core/privacy.js';
import { cleanSheet } from '../evaluate/activity/activity-read.js';

/* no·student·parent·sign: 회신서의 정해진 칸 이름(앱이 넣음, AI 안 부름) */
export const LANGS = [
  { id: 'vi', name: '베트남어', native: 'Tiếng Việt', ai: '베트남어(Tiếng Việt)', no: 'Lớp / Số thứ tự', student: 'Họ tên học sinh', parent: 'Phụ huynh', sign: 'Ký tên' },
  { id: 'zh', name: '중국어(간체)', native: '简体中文', ai: '중국어 간체자(简体中文)', no: '年级 / 班级 / 号码', student: '学生姓名', parent: '家长', sign: '签名' },
  { id: 'ru', name: '러시아어', native: 'Русский', ai: '러시아어(Русский)', no: 'Класс / номер', student: 'Имя ученика', parent: 'Родитель', sign: 'Подпись' },
  { id: 'en', name: '영어', native: 'English', ai: '영어(English)', no: 'Grade / Class / No.', student: 'Student name', parent: 'Parent', sign: 'Signature' }
];
export const LANG_IDS = LANGS.map(l => l.id);
export const langInfo = id => LANGS.find(l => l.id === id) || null;
const ALIAS = {
  vi: ['vi', 'vn', 'vie', 'vietnamese', '베트남', '베트남어', 'tiếngviệt', 'tiengviet'],
  zh: ['zh', 'zh-cn', 'zh-hans', 'zhcn', 'cn', 'chinese', '중국', '중국어', '중국어간체', '간체', '간체자', '简体中文', '中文', '汉语'],
  ru: ['ru', 'rus', 'russian', '러시아', '러시아어', 'русский'],
  en: ['en', 'eng', 'english', '영어', '영문']
};
/* 'vi'·'베트남어'·'Chinese'·'중국어(간체)' → 언어 id, 모르면 '' */
export function langOf(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/[\s()（）]/g, '').replace(/_/g, '-');
  return LANG_IDS.find(id => ALIAS[id].includes(s)) || '';
}

/* ---------- 줄 나누기 ---------- */
/* 줄 머리: 앞 공백 + 「1.」「가.」「1)」「가)」「(1)」「①」「-·○□※▶」 (숫자·한글 머리는 뒤에 빈칸이나 줄 끝.
   「1.5배」, 날짜 「11. 7.(금)까지」는 머리 아님) */
const MARK_RE = /^([ \t　]*)((?:\d{1,2}[.)](?=\s|$)(?!\s*\d{1,2}\s*[.)(일])|[가-하][.)](?=\s|$)|\(\d{1,2}\)|\([가-하]\)|[①-⑳]|[-·∙•○◦□■※▶▷*])[ \t]*)?/;
export function splitMarker(line) {
  const s = String(line == null ? '' : line), m = MARK_RE.exec(s), lead = m[1] || '', mark = m[2] || '';
  return { lead, mark, text: s.slice(lead.length + mark.length) };
}
// 전화번호(0으로 시작하는 국번, privacy.js와 같은 꼴)·이메일
const PHONE = /(?<!\d)\(?0\d{1,2}\)?[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}(?!\d)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const SECRET = new RegExp(`${PHONE.source}|${EMAIL.source}`, 'g');
const DATE_BITS = /\d+\s*(?:년|월|일|시|분|초)|\(\s*[월화수목금토일](?:요일)?\s*\)|[월화수목금토일]요일/g;
const ONLY = /^[\s\d.,:;~\-–—_/\\()（）[\]{}<>〈〉「」『』·•∙%+=#*'"“”‘’!?☎☏℡✆○●◦□■※▶▷→←|]*$/;
/* 전화번호·날짜·시간·숫자(와 꾸밈 표)만 있는 글 → 보내지 않고 그대로 */
export function keepAsIs(text) {
  return ONLY.test(String(text == null ? '' : text).replace(SECRET, ' ').replace(DATE_BITS, ' '));
}

/* 글 하나 → { parts(AI로 보낼 조각), build(조각 번역들) → 번역 글 }. 보낼 조각이 없으면 build는 원문 그대로 */
const same = s => ({ parts: [], build: () => s });
function shapeLine(line) {
  const { lead, mark, text } = splitMarker(line), body = text.trim();
  if (!body || keepAsIs(body)) return same(line);
  return { parts: [body], build: ([t]) => lead + mark + t };
}
function shapeRow(line) {
  const cells = splitCells(line), send = cells.map(c => !!c && !keepAsIs(c));
  if (!send.some(Boolean)) return same(line);
  return { parts: cells.filter((c, i) => send[i]), build: trs => { let k = 0; return `| ${cells.map((c, i) => (send[i] ? String(trs[k++] || '').replace(/\|/g, '/') : c)).join(' | ')} |`; } };
}
const shape1 = line => (isTableLine(line) ? shapeRow(line) : shapeLine(line));
export function shape(ko) {
  const s = String(ko == null ? '' : ko);
  if (!s.includes('\n')) return shape1(s);
  const subs = s.split('\n').map(shape1);
  return { parts: subs.flatMap(x => x.parts), build: trs => { let k = 0; return subs.map(x => x.build(trs.slice(k, (k += x.parts.length)))).join('\n'); } };
}

/* ---------- 개인정보 ---------- */
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function restore(t, keep, names) {
  let s = String(t == null ? '' : t), k = 0;
  if (names.length) s = s.replace(new RegExp(MASK, 'g'), m => (k < names.length ? names[k++] : m));
  const used = new Set();
  s = s.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => { const v = keep[+n - 1]; if (v == null) return ''; used.add(+n); return v; });
  const left = keep.filter((v, i) => !used.has(i + 1));
  return left.length ? `${s} ${left.join(' ')}`.trim() : s;
}
/* 보낼 조각 → { text(AI로 보낼 글), back(번역 → 가린 것을 되돌린 글) }. 명단·주민번호처럼 뺄 줄이거나 이름을 되돌릴 수 없으면 null(보내지 않음).
   전화번호·이메일은 {{n}}, 이름은 ○○○: activity-read의 cleanSheet 규칙에 더해 직함 앞뒤 교직원 이름(「교무부장 박영희 선생님」「강사: 최하은」
   「3학년 부장 김솔」)과 조사가 붙은 이름(「김민수의 보호자님께」) — core/privacy.js maskStaff·maskJosaNames. 문서에는 원래 이름을 되돌려 넣음 */
export function guard(text) {
  const keep = [];
  const s = String(text == null ? '' : text).trim().replace(SECRET, m => { keep.push(m); return `{{${keep.length}}}`; });
  const cl = cleanSheet(s);
  if (cl.lines) return null;
  const st = maskStaff(cl.text), jn = maskJosaNames(st.text), out = jn.text;
  let names = [];
  if (cl.names || st.masked || jn.masked) {
    const m = new RegExp(`^${out.split(MASK).map(reEsc).join('(.+?)')}$`, 's').exec(s);
    if (!m || m.length < 2) return null;
    names = m.slice(1);
  }
  return { text: out, back: t => restore(t, keep, names) };
}

/* ---------- 계획·저장 ---------- */
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const oneLine = t => String(t == null ? '' : t).replace(/\s*\n\s*/g, ' ').trim();
/* 번역할 원문 글(저장 열쇠): 제목·본문 줄·회신서(켰을 때 제목·칸·제출 안내)·알림 글, 같은 글은 한 번 */
export function trSources(out) {
  const o = out || {}, list = [];
  const add = v => { const s = String(v == null ? '' : v); if (s.trim() && !list.includes(s)) list.push(s); };
  add(o.title);
  (o.body || []).forEach(add);
  if (o.replyOn && o.reply) { add(o.reply.title || '회신서'); (o.reply.fields || []).forEach(add); add(o.reply.due); }
  add(o.short);
  return list;
}
/* units(원문 글 → 번역, 저장해 둔 것)에 없는 글만 보낼 계획
   → { jobs: [{ id, text }](같은 조각은 한 번), personal(보내지 않은 개인정보 조각 수), finish(답 { id: 번역 }) → { units(새 번역), miss(못 한 글 수) } } */
export function planTr(out, units = {}) {
  const jobs = [], byText = new Map(), todo = [];
  let personal = 0;
  for (const ko of trSources(out)) {
    if (own(units, ko)) continue;
    const sh = shape(ko);
    if (!sh.parts.length) continue;
    const slots = sh.parts.map(p => {
      const g = guard(p);
      if (!g) { personal++; return { keep: p }; }
      let id = byText.get(g.text);
      if (!id) { id = String(jobs.length + 1); byText.set(g.text, id); jobs.push({ id, text: g.text }); }
      return { id, back: g.back };
    });
    todo.push({ ko, sh, slots });
  }
  return { jobs, personal, finish(ans = {}) {
    const got = {};
    let miss = 0;
    for (const { ko, sh, slots } of todo) {
      const trs = slots.map(s => (s.keep != null ? s.keep : typeof ans[s.id] === 'string' && ans[s.id].trim() ? s.back(oneLine(ans[s.id])) : null));
      if (trs.some(t => t == null)) { miss++; continue; }
      got[ko] = sh.build(trs);
    }
    return { units: got, miss };
  } };
}
/* 번역을 마칠 때 저장할 번역: now(지금 저장해 둔 것 — 번역하는 동안 선생님이 고친 것 포함)와 got(새 번역).
   없는 줄만 번역은 now에 got을 더하고, 처음부터 다시(all)는 got으로 바꾸되 중간에 멈췄거나 빠진 줄이 있으면(partial) 다시 번역하지 못한 줄은 now를 남김.
   번역하는 동안 선생님이 고친 줄(edited)은 now에 있으면 got으로 덮지 않음(고치다 비운 줄은 got) */
export function mergeTr(now, got, { all = false, partial = false, edited = [] } = {}) {
  const n = isObj(now) ? now : {}, keep = new Set(edited);
  const out = !all || partial ? { ...n } : Object.fromEntries(Object.entries(n).filter(([k]) => keep.has(k)));
  for (const [k, v] of Object.entries(got || {})) if (!(keep.has(k) && own(n, k))) out[k] = v;
  return out;
}
/* 지금 원문에 없는 글의 번역은 버림(원문을 고치면 옛 줄 번역이 쌓이지 않게) */
export function pruneUnits(units, out) {
  const keep = new Set(trSources(out));
  return Object.fromEntries(Object.entries(units || {}).filter(([k]) => keep.has(k)));
}
/* 일을 AI 한 번에 보낼 만큼씩 */
export function batches(jobs, { max = 60, chars = 4000 } = {}) {
  const out = [];
  let cur = [], n = 0;
  for (const j of jobs) {
    if (cur.length && (cur.length >= max || n + j.text.length > chars)) { out.push(cur); cur = []; n = 0; }
    cur.push(j); n += j.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/* ---------- AI ---------- */
/* 「[글쓰기 원칙]」을 넣어 두면 한국어 글쓰기 원칙(write-style.js)을 덧붙이지 않음 */
export function trPrompt(jobs, lang) {
  const L = langInfo(lang) || LANGS[0];
  return ['[가정통신문 번역]',
    `학교가 보호자께 보내는 가정통신문을 ${L.ai}로 번역합니다. 읽는 분은 한국어가 서툰 다문화 가정 보호자입니다.`,
    '- [번호]마다 그 줄 하나를 번역해 같은 번호로 답합니다. 줄을 합치거나 나누거나 빼지 않습니다.',
    '- 뜻을 빠짐없이, 쉽고 정중하게 옮깁니다. 한국어·설명·따옴표를 덧붙이지 않습니다.',
    '- 날짜·시간·숫자·금액과 □ 같은 표시는 그대로 둡니다. 「11. 7.(금)」 같은 날짜는 「월. 일.(요일)」 꼴이라 달과 날을 바꾸지 않습니다.',
    '- {{1}} 같은 중괄호 표시와 ○○○는 고치지 않고 그 자리에 둡니다.',
    `[글쓰기 원칙] ${L.ai}를 쓰는 사람이 쓴 자연스러운 글로 씁니다(직역투는 피함). 답은 아래 JSON 꼴로만 씁니다.`,
    '', '[줄]', ...jobs.map(j => `[${j.id}] ${j.text}`),
    '', '[출력] JSON 하나만 출력합니다. 열쇠는 줄 번호, 값은 번역입니다.', '{"1":"…","2":"…"}'].join('\n');
}
/* AI 답 → { id: 번역 }: {"1":"…"} · {"translations":{…}} · ["…"](차례대로) · [{"id":1,"text":"…"}] */
export function normAnswers(v, jobs = []) {
  let o = v;
  if (isObj(o) && !jobs.some(j => own(o, j.id) || own(o, `[${j.id}]`))) { const inner = Object.values(o).find(x => isObj(x) || Array.isArray(x)); if (inner) o = inner; }
  const out = {};
  if (Array.isArray(o)) {
    o.forEach((x, i) => {
      if (typeof x === 'string') { if (jobs[i]) out[jobs[i].id] = x; return; }
      const t = isObj(x) ? [x.text, x.t, x.tr, x.translation].find(s => typeof s === 'string') : null;
      if (t != null && x.id != null) out[String(x.id).replace(/[[\]]/g, '')] = t;
    });
  } else if (isObj(o)) for (const j of jobs) { const val = own(o, j.id) ? o[j.id] : o[`[${j.id}]`]; if (typeof val === 'string') out[j.id] = val; }
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, 3000);
  return out;
}

/* ---------- 화면·문서 ---------- */
/* 원문 글마다 { ko, tr(번역, 없으면 null), fixed(보내지 않고 그대로 두는 글) } */
export function trPairs(out, units = {}) {
  const o = out || {};
  const one = v => { const ko = String(v == null ? '' : v), fixed = !shape(ko).parts.length; return { ko, fixed, tr: fixed ? ko : own(units, ko) ? String(units[ko]) : null }; };
  return { title: one(o.title), body: (o.body || []).map(one),
    reply: o.replyOn && o.reply ? { title: one(o.reply.title || '회신서'), fields: (o.reply.fields || []).map(one), due: one(o.reply.due) } : null,
    short: one(o.short) };
}
const pairsOf = p => [p.title, ...p.body, ...(p.reply ? [p.reply.title, ...p.reply.fields, p.reply.due] : []), p.short];
/* 번역이 없는 글 수(원문을 고쳤거나 못 한 것, 같은 글은 한 번) */
export function missingCount(p) {
  return new Set(pairsOf(p).filter(x => x.ko.trim() && x.tr == null).map(x => x.ko)).size;
}
/* 번역이 한국어 그대로인 글 수(개인정보가 있어 AI로 보내지 않은 줄 — 문서에는 한국어만 들어감, 같은 글은 한 번) */
export function heldCount(p) {
  return new Set(pairsOf(p).filter(x => x.ko.trim() && !x.fixed && x.tr != null && x.tr === x.ko).map(x => x.ko)).size;
}
const trOf = x => (x && x.tr != null && x.tr.trim() && x.tr !== x.ko ? x.tr : '');
/* 원문과 나란히: 제목(한국어 + 번역), 본문 줄마다 한국어 뒤에 번역(같은 줄 머리), 표는 한국어 표 뒤에 번역 표, 회신서 칸은 「한국어\n번역」.
   → fillForm(학교 양식)·plainLetterDoc(기본 양식)에 넣는 글 { title, subTitle, date, body, reply, missing(번역 없는 줄), held(개인정보라 한국어만인 줄) } */
export function bilingualLetter(out, units, lang, { date = '' } = {}) {
  const o = out || {}, L = langInfo(lang) || LANGS[0], p = trPairs(o, units);
  const body = [];
  for (let i = 0; i < p.body.length;) {
    if (isTableLine(p.body[i].ko)) {
      let j = i;
      while (j < p.body.length && isTableLine(p.body[j].ko)) j++;
      const run = p.body.slice(i, j);
      body.push(...run.map(x => x.ko));
      if (run.some(trOf)) body.push('', ...run.map(x => oneLine(trOf(x)) || x.ko));
      i = j; continue;
    }
    const x = p.body[i++], t = trOf(x);
    body.push(x.ko);
    if (t) body.push(...t.split('\n'));
  }
  const d = String(date || o.date || '');
  let reply = null;
  if (p.reply) {
    const bi = (a, b) => (b && b !== a ? `${a}\n${b}` : a);
    const rows = [[bi('학년 반 번호', L.no), '      학년        반        번'], [bi('학생 이름', L.student), ''],
      ...p.reply.fields.map(f => {
        const [a, b] = replyCells(f.ko), t = oneLine(trOf(f));
        if (!t) return [a, b];
        const [ta, tb] = replyCells(t);
        return [bi(a, ta), bi(b, tb)];
      })];
    reply = { title: p.reply.title.ko, subTitle: oneLine(trOf(p.reply.title)), rows,
      due: [p.reply.due.ko, oneLine(trOf(p.reply.due))].filter(s => s.trim()),
      sign: `${d.slice(0, 4) || new Date().getFullYear()} .     .     .        보호자(${L.parent}) :              (서명 / ${L.sign})` };
  }
  return { title: p.title.ko, subTitle: oneLine(trOf(p.title)), date: d, body, reply, missing: missingCount(p), held: heldCount(p) };
}
