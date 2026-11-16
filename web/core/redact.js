/* 가렸다 되돌리기 (스펙 2026-11-15 공통 도우미): AI로 보낼 글의 사람 이름은 번호 붙은 자리 표시 〔이름n〕, 전화번호·이메일은 {{n}}으로 바꾸고,
   AI가 돌려준 글에서 원래 값으로 되돌림(같은 이름은 같은 자리 표시 — AI가 글을 고치거나 차례를 바꿔도 맞게 돌아옴).
   주민·외국인등록번호가 든 줄·계좌 줄·이름이 늘어선 명단 줄은 보내지 않음(null). 이름 찾기는 core/privacy.js 규칙(직함 앞뒤 교직원 이름 maskStaff,
   조사가 붙은 이름 maskJosaNames, 표 칸·번호 명단·「학생 김하늘」 같은 이름 stripNames) + core/chat-names.js maskPersons(반 번호 옆·쉼표로 이은 맨 이름).
   lines()는 여러 줄을 한꺼번에 봄(한 줄에 한 명씩인 번호 명단·「이름」 머리 칸 아래 표), 한 번 알아낸 이름은 다른 줄·다음 줄에서도 글자 그대로 가림.
   자리 표시가 사라진 값은 끝에 붙이지 않음. bad(t): 없는 번호·깨진 자리 표시가 남았는지(되돌린 글에 섞이지 않게 — 부르는 쪽이 그 줄을 버림).
   가정통신문 번역(letter-translate guard)은 따로 그대로 둠 */
import { MASK, maskStaff, maskJosaNames, stripNames, RRN_RE, INTL_RE } from './privacy.js';
import { maskPersons } from './chat-names.js';

const PHONE = /(?<!\d)\(?0\d{1,2}\)?[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}(?!\d)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const SECRET = new RegExp(`${INTL_RE.source}|${PHONE.source}|${EMAIL.source}`, 'g');
// 계좌: 낱말(계좌·예금주) 또는 숫자 묶음 셋 넘게·숫자 열 개 넘게(123456-01-234567). 날짜(2026-11-15)·금액 범위는 아님. 전화번호는 먼저 {{n}}으로 바뀜
const ACCOUNT_WORD = /계좌|예금주/;
const ACCOUNT_NO = /(?<![\d-])\d{2,6}(?:-\d{2,8}){2,3}(?![\d-])/g;
const account = s => ACCOUNT_WORD.test(s) || [...s.matchAll(ACCOUNT_NO)].some(m => m[0].replace(/\D/g, '').length >= 10);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 아는 이름 뒤에 붙어도 되는 것(조사·호칭) — 낱말 안의 같은 글자(「바다이바다」)는 건드리지 않음
const AFTER_NAME = '(?=$|[^가-힣]|(?:으로|에게|한테|부터|처럼|께서|이랑|이가|이는|이를|이의|이와|이도|이에|이한테|이처럼|님|씨|군|양|[이가은는을를의에께와과도로랑만]))';
const TOKEN = /〔\s*이름\s*(\d+)\s*〕/g, SLOT = /\{\{\s*(\d+)\s*\}\}/g;
const NAME = /^[가-힣]{2,4}$/;
const nameRe = n => new RegExp(`(?<![가-힣])${reEsc(n)}${AFTER_NAME}`, 'g');

/* 한 문서·한 글을 가리는 동안 같은 이름에 같은 번호를 주는 가리개
   → { line(text) → { text } | null, lines(texts, { learn }) → [{ text } | null], learn(texts), back(t), bad(t), names, secrets } */
export function makeRedactor() {
  const names = [], secrets = [];
  const nameNo = n => { let i = names.indexOf(n); if (i < 0) { names.push(n); i = names.length - 1; } return i + 1; };
  const secretNo = v => { let i = secrets.indexOf(v); if (i < 0) { secrets.push(v); i = secrets.length - 1; } return i + 1; };

  /* 한 줄 준비: 빈 줄 { blank }, 보내지 않을 줄 null, 아니면 { s(전화·이메일을 {{n}}으로 바꾼 글) } */
  function prep(src) {
    if (!src.trim()) return { blank: true, s: src };
    if (RRN_RE.test(src)) return null;
    // 「(041-…)」의 여는 괄호는 글에 남김(번호만 가림)
    const s = src.replace(SECRET, m => (m[0] === '(' && !m.includes(')') ? `({{${secretNo(m.slice(1))}}}` : `{{${secretNo(m)}}}`));
    if (account(s)) return null;
    return { s };
  }
  /* 아는 이름을 글자 그대로 자리 표시로(긴 이름부터) */
  function known(t) {
    let out = t;
    names.map((n, i) => [n, i + 1]).filter(([n]) => NAME.test(n)).sort((a, b) => b[0].length - a[0].length)
      .forEach(([n, k]) => { out = out.replace(nameRe(n), `〔이름${k}〕`); });
    return out;
  }
  /* 가린 글(stLine — 여러 줄 규칙을 거친 줄)과 원래 글(s)을 맞대어 이름마다 번호 → 보낼 글(아는 이름 가리기 전), 못 맞추면 null */
  function mask(s, stLine) {
    const masked = maskPersons(maskJosaNames(maskStaff(stLine).text).text).text;
    if (!masked.includes(MASK)) return masked;
    const m = new RegExp(`^${masked.split(MASK).map(reEsc).join('(.+?)')}$`, 's').exec(s);
    if (!m) return null;
    let k = 0;
    return masked.replace(new RegExp(MASK, 'g'), () => `〔이름${nameNo(m[++k])}〕`);
  }
  /* 여러 글(한 글에 여러 줄이어도 됨)을 한꺼번에: 줄마다 준비 → 보낼 줄을 이어 stripNames(여러 줄 규칙) → 이름 번호 → 아는 이름 가리기 */
  function run(texts) {
    const flat = [];
    texts.forEach((t, i) => String(t == null ? '' : t).split('\n').forEach(l => flat.push({ i, p: prep(l) })));
    // 명단처럼 이름이 늘어선 줄은 stripNames가 줄 하나만 보고 뺌 — 미리 빼서 이어 붙인 글과 줄이 맞게
    flat.forEach(f => { if (f.p && !f.p.blank && stripNames(f.p.s).dropped) f.p = null; });
    const keep = flat.filter(f => f.p && !f.p.blank);
    const st = stripNames(keep.map(f => f.p.s).join('\n'));
    const stLines = st.text.split('\n');
    keep.forEach((f, k) => { const one = stLines.length === keep.length ? stLines[k] : stripNames(f.p.s).text; f.out = mask(f.p.s, one); if (f.out == null) f.p = null; });
    return { flat, n: texts.length };
  }
  function emit({ flat, n }) {
    const res = Array.from({ length: n }, () => []);
    const dead = new Set(flat.filter(f => !f.p).map(f => f.i));
    flat.forEach(f => { if (!dead.has(f.i)) res[f.i].push(f.p.blank ? f.p.s : known(f.out)); });
    return res.map((ls, i) => (dead.has(i) ? null : { text: ls.join('\n') }));
  }
  /* 이름만 배움(보내지 않는 글 — 다듬기 전 원래 글 같은 것) */
  const learn = texts => { run((Array.isArray(texts) ? texts : [texts]).map(t => String(t == null ? '' : t))); };
  const lines = (texts, { learn: prev = [] } = {}) => { if (prev && prev.length) learn(prev); return emit(run(texts)); };
  const line = text => lines([String(text == null ? '' : text)])[0];
  const back = t => String(t == null ? '' : t)
    .replace(TOKEN, (x, n) => names[+n - 1] ?? '')
    .replace(SLOT, (x, n) => secrets[+n - 1] ?? '');
  const bad = t => {
    const s = String(t == null ? '' : t);
    if ([...s.matchAll(TOKEN)].some(m => !names[+m[1] - 1]) || [...s.matchAll(SLOT)].some(m => !secrets[+m[1] - 1])) return true;
    return /〔\s*이름|\[\s*이름\s*\d|\{\{|\}\}/.test(s.replace(TOKEN, '').replace(SLOT, ''));
  };
  return { line, lines, learn, back, bad, names, secrets };
}

/* 가리개가 이미 알아낸 값(names·secrets — 만든 평가·활동지에 남겨 둔 것)만 글자 그대로 같은 번호의 자리 표시로 다시 가리고 되돌리는 짝.
   AI가 돌려준 글에 원래 이름을 되돌려 넣은 평가 이름·문항을 나중에 채점·피드백 AI로 다시 보낼 때 씀(선생님이 보는 글은 원래 이름 그대로).
   → { hide(t): 보낼 글, back(v): AI 답(글, 글 목록·객체 안 글까지) }. 값이 없으면 둘 다 그대로, 모르는 자리 표시는 지우지 않음 */
export function knownRedactor(known) {
  const { names = [], secrets = [] } = known || {};
  const list = a => (Array.isArray(a) ? a.map(x => String(x == null ? '' : x)) : []);
  const ns = list(names), ss = list(secrets);
  if (!ns.some(Boolean) && !ss.some(Boolean)) return { hide: t => t, back: v => v };
  const longFirst = (a, tag) => a.map((v, i) => [v, tag(i + 1)]).filter(([v]) => v.length >= 2).sort((x, y) => y[0].length - x[0].length);
  const secretTo = longFirst(ss, k => `{{${k}}}`), nameTo = longFirst(ns, k => `〔이름${k}〕`);
  const hide = t => {
    let out = String(t == null ? '' : t);
    secretTo.forEach(([v, to]) => { out = out.split(v).join(to); });
    nameTo.forEach(([n, to]) => { out = NAME.test(n) ? out.replace(nameRe(n), to) : out.split(n).join(to); });
    return out;
  };
  const one = t => t.replace(TOKEN, (x, n) => ns[+n - 1] || x).replace(SLOT, (x, n) => ss[+n - 1] || x);
  const back = v => (typeof v === 'string' ? one(v) : Array.isArray(v) ? v.map(back)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, back(x)])) : v);
  return { hide, back };
}

/* 여러 줄 글 → { text(보낼 글 — 보내지 않는 줄은 뺌), back, dropped(뺀 줄 수) } */
export function redactText(text) {
  const r = makeRedactor();
  const out = r.lines(String(text == null ? '' : text).split('\n'));
  return { text: out.filter(Boolean).map(x => x.text).join('\n'), back: r.back, dropped: out.filter(x => !x).length };
}
