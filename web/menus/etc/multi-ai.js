/* 기타 › 다면평가 AI 글(프롬프트)과 답 정리 (화면 없음 — Node 시험에서도 씀). 업무: 기준 양식 읽기·근거자료 제목 읽기는 plan, 줄글 나누기는 writing.
   AI로 가는 글에는 선생님 이름·학교 이름을 넣지 않음(maskFor: 내 정보의 학교·성명, 「○○초등학교」 꼴, 사람 이름 모양(maskPersons), 전화번호·전자 우편).
   AI는 규칙이 못 할 때만: 정량 기준을 규칙으로 못 읽었거나 사진·스캔일 때, 근거자료 제목·번호·날짜를 규칙으로 다 못 찾았을 때, 줄글 나누기 */
import { maskPersons } from '../../core/chat-names.js';
import { maskContacts } from '../../core/privacy.js';
import { normCriteria, allItems } from './multi-quant.js';
import { normQualCriteria, normReport, refreshMissing } from './multi-qual.js';

export const QUANT_TAG = '[다면평가 정량 기준 읽기]';
export const EVIDENCE_TAG = '[다면평가 근거자료 제목 읽기]';
export const QUAL_TAG = '[다면평가 자기실적평가서]';
export const QUAL_FORM_TAG = '[다면평가 정성 기준 읽기]';
const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const tidy = s => str(s).replace(/[ \t]/g, ' ').replace(/\s+/g, ' ').trim();
const flat = s => str(s).replace(/\s/g, '');
const pad = n => String(n).padStart(2, '0');

/* AI로 보낼 글 가리기 */
export function maskFor(text, info = {}) {
  let s = str(text);
  const i = info || {};
  for (const [w, to] of [[i.school, '○○학교'], [i.name, '○○○']]) { const t = tidy(w); if (t.length >= 2) s = s.split(t).join(to); }
  s = s.replace(/【\s*[^】\n]{0,20}?(?:학교|초|중|고)\s*】/g, '【○○학교】').replace(/[가-힣]{2,12}(?:초등학교|중학교|고등학교)/g, '○○학교');
  return maskContacts(maskPersons(s).text);
}

/* 정량 기준 글의 첫 표만(「총 계」 뒤 안내·확인 칸까지, 이어지는 작성 예시는 뺌) */
export function cutExample(text) {
  const lines = str(text).replace(/\r\n?/g, '\n').split('\n');
  const title = flat(lines.find(l => l.trim() && !l.includes('|')) || '');
  const isTotal = l => /^(?:총계|합계|총점)$/.test(flat(l.split('|')[0]));
  const t = lines.findIndex(isTotal);
  const from = t >= 0 ? t + 1 : 1;
  for (let k = from; k < lines.length; k++) {
    const l = lines[k];
    if ((title && flat(l) === title) || (t >= 0 && isTotal(l)) || /^\s*평가\s*기간/.test(l) || /(?:^|\|)\s*평가\s*지표\s*(?:\||$)/.test(l)) return lines.slice(0, k).join('\n').trim();
  }
  return lines.join('\n').trim();
}

/* ---------- 정량 기준 읽기(plan) ---------- */
export function quantPrompt(text, info, { nImages = 0 } = {}) {
  const body = maskFor(cutExample(text), info).slice(0, 12000);
  return [QUANT_TAG,
    '학교의 「교사 다면평가 기준(정량평가)」 양식을 읽어 JSON으로 옮깁니다. 양식 글은 표 칸이 「 | 」로, 줄이 줄바꿈으로 나뉘어 있습니다.',
    '규칙:',
    '- groups: 평가요소 묶음(「가. 학습지도 (30점)」 → name "가. 학습지도", max 30). items: 묶음 안 항목(「주당 수업시수 (25점)」 → name "주당 수업시수", max 25).',
    '- tiers: 항목의 평가지표 줄마다 {"label": 지표 글(앞의 • 는 빼고 괄호 글은 그대로), "points": 배점 수}. 「(6개월 이하 4.5점)」「(회당 1점)」도 label에 그대로 둡니다.',
    '- guide: 그 항목의 비고(실적 증빙자료) 칸 글. 감점 규칙(「월 0.2씩 감점」)도 그대로 둡니다.',
    '- total: 총계 배점. notes: ※ 안내 줄들. footer: {"pledge": 확인 다짐 글, "to": 「… 귀하」(학교 이름은 빼고), "checks": 확인 칸 이름들}.',
    '- 작성 예시(확인 ○·점수가 적힌 표)와 학교·사람 이름은 옮기지 않습니다.',
    '',
    nImages ? `[양식 그림] ${nImages}장을 봅니다.` : '[양식 글]', nImages ? '' : body || '(없음)',
    '',
    '[출력] JSON 하나만:',
    '{"title":"","period":"","total":100,"groups":[{"name":"가. 학습지도","max":30,"items":[{"name":"주당 수업시수","max":25,"tiers":[{"label":"22시간 이상","points":25}],"guide":""}]}],"notes":[],"footer":{"pledge":"","to":"","checks":[]}}']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
/* AI 답 → 기준(항목 2개 이상), 못 쓰면 null */
export function normQuant(v) {
  const c = normCriteria(v, { trust: true });
  if (!c || allItems(c).length < 2) return null;
  if (!c.title) c.title = '교사 다면평가 기준(정량평가)';
  const w = c.footer.to.split(' '), k = w.findIndex(x => /위원|교장|귀하/.test(x));
  c.footer.to = w.slice(Math.max(0, k)).join(' ');
  return c;
}

/* ---------- 근거자료 제목 읽기(plan) ---------- */
export function evidencePrompt({ text = '', nImages = 0, item = '' } = {}, info) {
  return [EVIDENCE_TAG,
    `교사 다면평가 정량평가 「${maskSchool(tidy(item), info) || '항목'}」의 근거자료(공문·이수증·상장·사진)예요. 비고 칸에 적을 문서 제목·문서 번호·날짜를 찾습니다.`,
    '- title: 문서 제목(공문은 「제목」 줄, 이수증·상장은 연수·상 이름). 40자 안쪽. 사람·학교 이름은 쓰지 않습니다.',
    '- no: 문서 번호의 숫자만(「○○학교-1234」 → "1234", 「제12호」 → "12"). 없으면 "".',
    '- date: 시행일·발급일(YYYY.MM.DD.). 없으면 "".',
    '',
    nImages ? `[근거자료 그림 ${nImages}장]` : '[근거자료 글]', nImages ? '' : maskFor(text, info).slice(0, 4000) || '(없음)',
    '',
    '[출력] JSON 하나만: {"title":"","no":"","date":""}']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
export function normEvidence(v) {
  const o = isObj(v) ? v : {};
  const n = /(\d{1,6})\D*$/.exec(str(o.no));
  const d = /(20\d{2})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})/.exec(str(o.date));
  const ok = d && +d[2] >= 1 && +d[2] <= 12 && +d[3] >= 1 && +d[3] <= 31;
  const title = typeof o.title === 'string' ? tidy(o.title).slice(0, 80) : '';
  return { title, no: n ? n[1] : '', date: ok ? `${d[1]}.${pad(+d[2])}.${pad(+d[3])}.` : '' };
}

/* ---------- 줄글 → 자기실적평가서 칸(writing) ---------- */
/* 학교 양식에서 온 글(지표·칸 이름)·내 정보 값의 학교 이름 가리기(사람 이름 모양은 줄글에서만 가림 — 지표 낱말이 바뀌지 않게) */
export function maskSchool(text, info = {}) {
  let s = str(text);
  for (const [w, to] of [[(info || {}).school, '○○학교'], [(info || {}).name, '○○○']]) { const t = tidy(w); if (t.length >= 2) s = s.split(t).join(to); }
  return s.replace(/[가-힣]{2,12}(?:초등학교|중학교|고등학교)/g, '○○학교');
}
export function qualPrompt({ parsed, draft = '', facts = {}, basics = {} } = {}, info) {
  const p = parsed, f = facts || {}, m = s => maskSchool(s, info);
  const known = [['주당 수업시수', f.hours], ['수업 공개', f.open], ['학생·학부모 상담', f.counsel], ['학생 상담', f.counselStudent], ['학부모 상담', f.counselParent], ['직무연수', f.training], ['업무', f.duty]]
    .filter(([, x]) => tidy(x)).map(([k, x]) => `- ${k}: ${m(tidy(x))}`);
  const sample = { basics: Object.fromEntries(p.basics.map(b => [b, ''])), sections: p.sections.map(s => ({ key: s.key, parts: s.parts.map(n => ({ name: n, items: ['…'] })) })), missing: [{ path: 'basics.' + p.basics[0], hint: '' }] };
  return [QUAL_TAG,
    '초등 교사가 올해 한 일을 편하게 쓴 줄글을 「교사 자기실적평가서」 칸에 나눠 넣습니다.',
    '[평가 지표]', ...p.criteria.map(c => m(`- ${[c.area, c.element].filter(Boolean).join(' › ')}${c.max != null ? `(${c.max}점)` : ''}: ${c.indicators.join(' / ')}`)),
    '', '[기초 자료 칸] (앱이 아는 값, 모르면 빈칸)', ...p.basics.map(b => m(`- ${b}: ${maskFor(tidy(basics[b]), info)}`)),
    ...(known.length ? ['', '[정량평가에서 아는 수]', ...known] : []),
    '', '[자기실적 평가 영역과 칸] key(영역): 칸', ...p.sections.map(s => m(`- ${s.key}(${s.name}): ${s.parts.join(', ')}`)),
    '', '[선생님 줄글]', maskFor(draft, info).slice(0, 6000) || '(없음)',
    '',
    '규칙:',
    '- 줄글과 위에 적힌 사실만 씁니다. 지어내지 않습니다. 횟수·건수·시간은 글이나 위 수에 있는 것만 씁니다.',
    '- 영역 칸(items)은 개조식 한 줄씩(앞에 「- 」 없이, 한 줄 60자 안쪽, 「~함」「~임」 꼴). 목표·계획은 「추진 목표」, 한 일은 「추진 실적」, 새로 바꾸거나 줄인 것은 「창의적 업무개선」 칸.',
    '- 기초 자료는 앱이 아는 값을 그대로 두고 빈칸만 글에서 찾아 채웁니다.',
    '- 모르는 칸은 ""(기초 자료) 또는 [](영역 칸)로 두고, missing에 그 칸의 path(「basics.칸 이름」 또는 「sections.key.칸 이름」)와 무엇을 적으면 되는지 hint(해요체, 짧게)를 씁니다.',
    '- 자기 평가 종합(만족·보통·미흡)은 선생님이 고르니 쓰지 않습니다. 사람·학교 이름은 쓰지 않습니다.',
    '',
    '[출력] JSON 하나만:', JSON.stringify(sample)]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
/* AI 답 → 보고서: 앱이 아는 기초 자료(prefill)가 앞섬, 자기 평가는 비워 둠(선생님이 고름) */
export function normQualAI(v, parsed, { prefill = {}, facts = {} } = {}) {
  const r = normReport(v, parsed, facts);
  for (const b of parsed.basics) if (tidy(prefill[b])) r.basics[b] = tidy(prefill[b]);
  for (const k of Object.keys(r.self)) r.self[k] = '';
  return refreshMissing(r, parsed, facts);
}

/* ---------- 정성 기준 양식 읽기(사진·스캔, plan) ---------- */
export function qualFormPrompt({ text = '', nImages = 0 } = {}) {
  return [QUAL_FORM_TAG,
    '학교의 「교사 다면평가 기준(정성평가)」과 「교사 자기실적평가서」 양식을 읽어 JSON으로 옮깁니다.',
    '- criteria: 평가요소마다 {"area": 평가사항(「1. 근무수행태도」), "element": 평가요소 이름, "max": 배점, "indicators": [평가지표 질문]}.',
    '- basics: 「평가자 기초 자료」의 칸 이름들(적힌 값은 남의 작성 예시라 옮기지 않습니다).',
    '- sections: 「자기실적 평가」 영역마다 {"name": 「학습지도」, "parts": [「추진 목표」, 「추진 실적」 …]}.',
    '- 사람·학교 이름은 옮기지 않습니다.',
    '',
    nImages ? `[양식 그림] ${nImages}장을 봅니다.` : '[양식 글]', nImages ? '' : str(text).slice(0, 12000) || '(없음)',
    '',
    '[출력] JSON 하나만: {"criteria":[{"area":"","element":"","max":10,"indicators":[""]}],"basics":[""],"sections":[{"name":"","parts":[""]}]}']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}
export const normQualForm = v => normQualCriteria(v);
