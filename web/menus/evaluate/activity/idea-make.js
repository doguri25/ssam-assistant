/* 수업 아이디어 (스펙 2026-11-18-lesson-idea-design, 화면 없음 — Node 시험에서도 씀). 화면은 idea.js.
   AI(업무 「계획 초안·문항 만들기」 plan)에는 교과·학년·범위(진도표 차시나 직접 쓴 범위 — 가린 글)·아이디어 수·수준만 보냄 — 학생 자료는 보내지 않음.
   아이디어마다 이름·한 줄 소개·활동 형태·흐름(도입·전개·정리)·준비물·살펴볼 것 → [이 아이디어로 활동지 만들기]는 ideaLine을 범위 줄로 더함 */
import { levelLine } from '../make-scope.js';

export const FORMS = ['개별', '짝', '모둠', '전체'];
const STAGES = ['도입', '전개', '정리'];
const str = (v, n = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const listOf = (v, k) => (Array.isArray(v) ? v : v && Array.isArray(v[k]) ? v[k] : []);

export function ideaPrompt({ scope, grade = null, count = 3, level = 'normal' } = {}) {
  const s = scope || {};
  return ['[수업 아이디어]',
    '당신은 초등학교 수업을 잘 짜는 경력 많은 담임교사입니다. 아래 차시를 40분 수업으로 가르칠 수업 아이디어를 서로 다르게 냅니다.',
    `[교과] ${s.subject || '(교과를 적지 않음)'}${grade ? ` · ${grade}학년` : ''}`,
    '[범위]', ...((s.lines && s.lines.length ? s.lines : ['(범위를 적지 않음 — 교과의 기본 개념)']).map(l => `- ${l}`)),
    `[수준] ${levelLine(level)}`,
    `[아이디어] 아이디어 ${count}개. 활동 형태(개별·짝·모둠·전체)와 활동 방법이 서로 겹치지 않게.`,
    '', '[규칙]',
    '- 교과서 범위 안의 내용으로, 교실에서 바로 할 수 있게 씁니다. 준비물은 학교에 흔한 것으로. 학생 이름은 쓰지 않습니다.',
    '- title: 활동 이름(짧게), summary: 무엇을 하는지 한 문장, form: 개별·짝·모둠·전체 중 하나.',
    '- flow: 도입·전개·정리 차례로, 단계마다 무엇을 하는지 한두 문장(text)과 걸리는 분(min, 숫자). 모두 합쳐 40분 안팎.',
    '- materials: 준비물(쉼표로), look: 수업 중 살펴볼 것(관찰·평가 포인트) 한 문장.',
    '', '[출력] JSON 하나만 출력합니다.',
    '{"ideas":[{"title":"…","summary":"…","form":"모둠","flow":[{"stage":"도입","min":5,"text":"…"},{"stage":"전개","min":25,"text":"…"},{"stage":"정리","min":10,"text":"…"}],"materials":"…","look":"…"}]}'].join('\n');
}

const formOf = v => FORMS.find(f => str(v).startsWith(f)) || '';
const minOf = v => { const n = parseInt(String(v == null ? '' : v), 10); return Number.isFinite(n) && n > 0 && n <= 120 ? n : null; };
function normFlow(v) {
  const steps = listOf(v, 'flow').filter(x => x && typeof x === 'object' && str(x.text))
    .map(x => ({ stage: STAGES.find(s => str(x.stage).startsWith(s)) || str(x.stage, 10), min: minOf(x.min), text: str(x.text, 300) }));
  const at = s => (STAGES.includes(s.stage) ? STAGES.indexOf(s.stage) : 3);
  return steps.map((s, i) => ({ s, i })).sort((a, b) => at(a.s) - at(b.s) || a.i - b.i).map(x => x.s).slice(0, 6);
}
/* AI 답 → [{ no, title, summary, form, flow:[{stage,min,text}], materials, look }] — 이름·흐름이 없는 것은 버림, count까지 */
export function normIdeas(v, { count = 5 } = {}) {
  return listOf(v, 'ideas').filter(x => x && typeof x === 'object')
    .map(x => ({ title: str(x.title, 60), summary: str(x.summary, 200), form: formOf(x.form), flow: normFlow(x), materials: str(x.materials, 200), look: str(x.look, 200) }))
    .filter(x => x.title && x.flow.length).slice(0, Math.max(1, count | 0)).map((x, i) => ({ no: i + 1, ...x }));
}

const stepLine = f => `${f.stage}${f.min ? `(${f.min}분)` : ''}: ${f.text}`;
/* [이 아이디어로 활동지 만들기]: 활동지 만들기 범위 끝에 더하는 줄 */
export const ideaLine = i => `수업 활동: ${i.title}${i.summary ? ` — ${i.summary}` : ''}`;
/* [복사]: 아이디어 하나를 글로 */
export function ideaText(i) {
  return [`${i.title}${i.form ? ` (${i.form})` : ''}`, ...(i.summary ? [i.summary] : []), ...i.flow.map(f => `- ${stepLine(f)}`),
    ...(i.materials ? [`준비물: ${i.materials}`] : []), ...(i.look ? [`살펴볼 것: ${i.look}`] : [])].join('\n');
}
/* 내려받기(한글·워드·PDF): 받은 아이디어 모두 */
export function ideasDoc(meta, ideas) {
  const m = meta || {};
  const where = [m.subject, m.unit, m.lesson && m.lesson !== '단원 전체' ? `${m.lesson}차시` : m.lesson].filter(Boolean).join(' ');
  const blocks = [];
  for (const i of ideas || []) {
    blocks.push({ type: 'h', text: `${i.no}. ${i.title}${i.form ? ` (${i.form})` : ''}` });
    if (i.summary) blocks.push({ type: 'p', text: i.summary });
    blocks.push({ type: 'table', head: true, rows: [['단계', '시간', '활동'], ...i.flow.map(f => [f.stage, f.min ? `${f.min}분` : '', f.text])] });
    if (i.materials) blocks.push({ type: 'p', text: `준비물: ${i.materials}` });
    if (i.look) blocks.push({ type: 'p', text: `살펴볼 것: ${i.look}` });
  }
  return { title: `수업 아이디어${where ? ` — ${where}` : ''}`, blocks };
}
