/* 가렸다 되돌리기 (스펙 2026-11-15 공통 도우미): AI로 보낼 글의 사람 이름은 번호 붙은 자리 표시 〔이름n〕, 전화번호·이메일은 {{n}}으로 바꾸고,
   AI가 돌려준 글에서 원래 값으로 되돌림(같은 이름은 같은 자리 표시 — AI가 글을 고치거나 차례를 바꿔도 맞게 돌아옴).
   주민번호가 든 줄·이름이 늘어선 명단 줄은 보내지 않음(null). 이름 찾기는 core/privacy.js 규칙(직함 앞뒤 교직원 이름 maskStaff,
   조사가 붙은 이름 maskJosaNames, 표 칸·「학생 김하늘」 같은 이름 stripNames) 그대로. 자리 표시가 사라진 값은 끝에 붙이지 않음.
   가정통신문 번역(letter-translate guard)은 따로 그대로 둠 */
import { MASK, maskStaff, maskJosaNames, stripNames } from './privacy.js';

const PHONE = /(?<!\d)\(?0\d{1,2}\)?[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}(?!\d)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const SECRET = new RegExp(`${PHONE.source}|${EMAIL.source}`, 'g');
const RRN = /\d{6}\s*-\s*[1-4]\d{6}/;
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* 한 문서·한 글을 가리는 동안 같은 이름에 같은 번호를 주는 가리개 → { line(text) → { text } | null, back(t) → 되돌린 글, names, secrets } */
export function makeRedactor() {
  const names = [], secrets = [];
  const nameNo = n => { let i = names.indexOf(n); if (i < 0) { names.push(n); i = names.length - 1; } return i + 1; };
  const secretNo = v => { let i = secrets.indexOf(v); if (i < 0) { secrets.push(v); i = secrets.length - 1; } return i + 1; };
  function line(text) {
    const src = String(text == null ? '' : text);
    if (!src.trim()) return { text: src };
    if (RRN.test(src)) return null;
    // 「(041-…)」의 여는 괄호는 글에 남김(번호만 가림)
    const s = src.replace(SECRET, m => (m[0] === '(' && !m.includes(')') ? `({{${secretNo(m.slice(1))}}}` : `{{${secretNo(m)}}}`));
    const st = stripNames(s);
    if (st.dropped) return null;
    const masked = maskJosaNames(maskStaff(st.text).text).text;
    if (!masked.includes(MASK)) return { text: masked };
    // 가린 글과 원래 글을 맞대어 가린 자리마다 원래 이름을 찾음(못 찾으면 보내지 않음)
    const m = new RegExp(`^${masked.split(MASK).map(reEsc).join('(.+?)')}$`, 's').exec(s);
    if (!m) return null;
    let k = 0;
    return { text: masked.replace(new RegExp(MASK, 'g'), () => `〔이름${nameNo(m[++k])}〕`) };
  }
  const back = t => String(t == null ? '' : t)
    .replace(/〔\s*이름\s*(\d+)\s*〕/g, (x, n) => names[+n - 1] ?? '')
    .replace(/\{\{\s*(\d+)\s*\}\}/g, (x, n) => secrets[+n - 1] ?? '');
  return { line, back, names, secrets };
}

/* 여러 줄 글 → { text(보낼 글 — 보내지 않는 줄은 뺌), back, dropped(뺀 줄 수) } */
export function redactText(text) {
  const r = makeRedactor();
  let dropped = 0;
  const out = String(text == null ? '' : text).split('\n').map(l => { const x = r.line(l); if (!x) { dropped++; return null; } return x.text; }).filter(l => l !== null);
  return { text: out.join('\n'), back: r.back, dropped };
}
