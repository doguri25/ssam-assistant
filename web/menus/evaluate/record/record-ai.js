/* 생활기록부 글 쓰기 틀의 AI 한 문장(스펙 2026-11-14-eval-redesign §6) — 화면 없이 돌아감(Node 시험).
   [고치기]: 근거가 없거나 기재 점검 규칙에 걸린 문장 하나를 근거 목록의 사실로 고쳐 씀.
   [이 근거로 문장 더하기]: 아직 안 쓴 근거 하나로 글 끝에 붙일 문장 하나를 씀.
   AI에는 글·문장·근거만 보냄 — 학생 이름은 ○○○로 가리고(이름처럼 보이는 말·연락처도), 번호·별칭·출처는 보내지 않음.
   답은 {"t":"문장","src":["m1"]} 하나 → 목록에 있는 근거 번호만 남김(core/evidence.js normSentences) */
import { maskPersons } from '../../../core/chat-names.js';
import { maskContacts } from '../../../core/privacy.js';
import { normSentences, joinSentences, evidencePrompt } from '../../../core/evidence.js';

export const ONE_TAG = '[생기부 문장 하나]';
const FIELD = { hk: '행동특성 및 종합의견', cc: '창의적 체험활동 특기사항', py: '교과학습발달상황(교과 평어)' };
const hide = s => maskContacts(maskPersons(String(s == null ? '' : s)).text);
const ending = da => (da ? "문장은 '~한다.'처럼 '다.'로 끝냅니다." : "문장은 '~함.', '~임.'처럼 명사형 종결어미와 마침표로 끝냅니다.");

/* mode 'fix' { sentence, why: [까닭] } · 'add' { target: 근거 하나 }. text: 지금 글 전체(흐름을 맞추려고), list: 근거 목록, da: '~한다.' 끝맺음 */
export function sentencePrompt({ mode = 'fix', field = 'hk', text = '', sentence = '', why = [], target = null, list = [], da = false } = {}) {
  const safeList = (Array.isArray(list) ? list : []).map(e => ({ ...e, label: hide(e.label), ...(e.ai ? { ai: hide(e.ai) } : {}) }));
  const head = mode === 'add'
    ? `아래 ${FIELD[field] || FIELD.hk} 글 끝에 이어 붙일 문장 하나를 [쓸 근거]의 사실로 써 주세요.`
    : `아래 ${FIELD[field] || FIELD.hk} 글에서 [고칠 문장] 하나만 [근거 목록]의 사실로 고쳐 써 주세요.`;
  return [
    ONE_TAG,
    head,
    ``,
    `[쓰기 규칙]`,
    `1. 마침표가 하나뿐인 한 문장으로 씁니다. ${ending(da)}`,
    `2. 학생 이름(가린 이름 ○○○ 포함)이나 '이 학생은' 같은 주어를 쓰지 않습니다.`,
    `3. 근거 목록에 있는 사실만 쓰고 지어내지 않습니다. 학교 밖 대회 수상, 자격증, 사교육, 가족의 직업·형편, 기관·상호 이름은 쓰지 않습니다.`,
    `4. 단정적인 부정 표현은 쓰지 않고, 노력하는 모습과 성장이 드러나게 씁니다. 글의 다른 문장과 표현이 겹치지 않게 씁니다.`,
    `5. 기댄 근거 번호를 src에 적습니다.`,
    ``,
    evidencePrompt(safeList),
    ``,
    `[글] ${hide(text) || '(아직 없음)'}`,
    mode === 'add' && target ? `[쓸 근거] ${target.id}) ${hide(target.ai || target.label)}` : `[고칠 문장] ${hide(sentence)}`,
    ...(mode === 'fix' && why && why.length ? [`[고칠 까닭] ${why.map(hide).join(' / ')}`] : []),
    ``,
    `[출력] 다른 말 없이 JSON 하나만: {"t": "문장", "src": ["${(safeList[0] && safeList[0].id) || 'e1'}"]}`
  ].join('\n');
}

/* AI 답(글) → { t, src } 또는 null. JSON이 깨졌으면 글 한 줄을 문장으로(근거 없음), 여러 문장이 오면 이어 붙이고 근거는 모음 */
export function normOne(raw, list) {
  const txt = String(raw == null ? '' : raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  let v = null;
  try { v = JSON.parse(txt); } catch (e) {
    const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
    if (a >= 0 && b > a) { try { v = JSON.parse(txt.slice(a, b + 1)); } catch (e2) { v = null; } }
  }
  const arr = v && Array.isArray(v.sentences) ? v.sentences : v && (v.t || v.text) ? [{ t: v.t || v.text, src: v.src }] : null;
  const clean = s => String(s || '').replace(/^["'“”‘’「」]+|["'“”‘’「」]+$/g, '').replace(/○{2,}\s?(?:이는|이가|은|는|이|가|의|을|를)?\s*/g, '').replace(/\s+/g, ' ').trim();
  if (arr) {
    const ss = normSentences(arr.map(x => ({ t: clean(x && x.t), src: x && x.src })), list);
    if (!ss.length) return null;
    return { t: joinSentences(ss), src: [...new Set(ss.flatMap(s => s.src))] };
  }
  const line = clean(txt.split('\n').find(l => l.trim() && !/^[{}\[\]]/.test(l.trim())));
  return line ? { t: line, src: [] } : null;
}
