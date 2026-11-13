/* 평가 › 기재 점검 [AI로 고치기] (스펙 2026-11-13 §4): AI에 보내는 글과 답 정리. 화면 없이 돌아감(시험).
   그 글 하나와 까닭만 보냄 — 학생 이름은 ○○○로 가리고, 학생 번호·출처(「행동특성 · 3번」)·같은 문장을 쓴 다른 학생 번호는 보내지 않음 */
import { maskPersons } from '../../../core/chat-names.js';
import { maskContacts, MASK } from '../../../core/privacy.js';

export const FIX_TAG = '[생기부 글 고치기]';
const SRC_NAME = {
  py: '교과학습발달상황(교과 평어)', cc: '창의적 체험활동 특기사항', hk: '행동특성 및 종합의견',
  gr: '교과학습발달상황(평가지 채점 평어)', unit: '교과학습발달상황(단원평가 평어)'
};
const NAME_WHY = '학생 이름은 쓰지 않아요';
const limitText = l => (l && l.unit === 'byte' ? `나이스 ${l.max}바이트 안(한글 3바이트, 영문·숫자·공백 1바이트)` : `${l.max}자 안`);

/* 이름 표시(name·학생 이름)를 ○○○로 바꾼 글. 그 밖의 이름처럼 보이는 말·연락처도 가림 */
function masked(text, issues) {
  const t = String(text == null ? '' : text);
  const names = issues.filter(i => i.kind === 'name' && i.why === NAME_WHY).sort((a, b) => b.start - a.start);
  let out = t;
  for (const n of names) out = out.slice(0, n.start) + MASK + out.slice(n.end);
  return { text: maskContacts(maskPersons(out).text), names: [...new Set(names.map(n => n.word).filter(Boolean))] };
}
const hide = (s, names) => maskContacts(maskPersons(names.reduce((x, n) => x.split(n).join(MASK), String(s))).text);

/* { text, issues(check-rules 표시), src: 'py'|'cc'|'hk'|'gr'|'unit', limit } → AI에 보낼 글 */
export function fixPrompt({ text, issues = [], src = 'hk', limit = null } = {}) {
  const m = masked(text, issues);
  const lines = [];
  const add = l => { if (!lines.includes(l)) lines.push(l); };
  for (const i of issues) {
    if (i.kind === 'name' && i.why === NAME_WHY) add(`가린 이름(${MASK}): ${NAME_WHY}`);
    else if (i.kind === 'dup') add(`다른 학생 글과 같은 문장「${hide(i.word, m.names)}」: 뜻은 살리고 표현을 바꿔요`);
    else if (i.kind === 'len') add(`글자 수: ${i.why}`);
    else add(`「${hide(i.word, m.names)}」: ${i.why}`);
  }
  const lim = limit && Number(limit.max) > 0 ? limit : null;
  return [
    FIX_TAG,
    `아래는 초등학교 학교생활기록부 '${SRC_NAME[src] || SRC_NAME.hk}'에 쓸 글이에요. [고칠 곳]만 고치고, 나머지 내용·말투·끝맺음(~함. 또는 ~한다.)은 지금 글 그대로 두세요.`,
    ``,
    `[고칠 곳]`,
    ...lines.map(l => `- ${l}`),
    ``,
    `[고치는 법]`,
    `1. 기재하면 안 되는 말(학교 밖 대회·수상, 자격증·인증시험, 사교육, 가족의 직업·경제 형편, 대학·기관·상호 이름, 해외·어학연수, 논문·출간·특허, 장학금)은 빼거나 학교 안 활동·일반적인 말로 바꿔요. 없는 사실을 지어내지 않아요.`,
    `2. 단정적인 부정 표현은 노력하는 모습과 나아진 점이 드러나게 성장 중심으로 바꿔요.`,
    `3. 가린 이름(${MASK})과 '이 학생은' 같은 주어는 빼요.`,
    `4. 다른 학생 글과 같은 문장은 뜻은 살리고 표현을 바꿔요.`,
    `5. ${lim ? `공백을 포함해 ${limitText(lim)}으로 써요.` : '길이는 지금 글과 비슷하게 써요.'}`,
    ``,
    `[글]`,
    m.text,
    ``,
    `[출력] 다른 말 없이 JSON 하나만: {"text": "고친 글"}`
  ].join('\n');
}

/* AI 답 → 고친 글(한 줄, 앞뒤 따옴표·남은 ○○○ 빼기). 못 읽으면 '' */
export function normFix(v) {
  const raw = typeof v === 'string' ? v : v && typeof v.text === 'string' ? v.text : '';
  return raw.replace(/\s+/g, ' ').trim()
    .replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, '').trim()
    .replace(/○{2,}\s?(?:이는|이가|은|는|이|가|의|을|를)?\s*/g, '').trim();
}
