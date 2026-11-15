/* 활동지 만들기 (스펙 2026-11-15-docedit-minutes-quiz §3, 화면 없음 — Node 시험에서도 씀). 화면은 activity-maker.js.
   AI(업무 「계획 초안·문항 만들기」 plan)에는 교과·학년·범위·문항 수·종류·수준만 보냄 — 학생 자료는 보내지 않음.
   열린 문항(쓰기·그리기·생각 정리)마다 묻는 말·예시 답안·○(잘함)·△(조금 더) 기준 → activity-model newActivity로
   문항·기준을 확정한 새 활동지(sheet.student = 활동지 글). 채점은 지금 활동지 3·4단계 그대로(그리기는 「그림·색칠」, 쓰기·생각 정리는 「쓰기」) */
import { newActivity } from './activity-model.js';
import { spread, levelLine } from '../make-scope.js';
import { NAME_BOX } from '../unit/unit-make.js';

export const KINDS = [['write', '쓰기'], ['draw', '그리기'], ['think', '생각 정리']];
const KIND_IDS = KINDS.map(k => k[0]);
const KIND_NAME = Object.fromEntries(KINDS);
const TYPE_OF = { write: 'write', draw: 'draw', think: 'write' }; // 활동지 채점 종류(activity-ai TYPES)
const str = (v, n = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const listOf = (v, k) => (Array.isArray(v) ? v : v && Array.isArray(v[k]) ? v[k] : []);

function head(scope, grade, level) {
  const s = scope || {};
  return [
    `[교과] ${s.subject || '(교과를 적지 않음)'}${grade ? ` · ${grade}학년` : ''}`,
    '[범위]', ...((s.lines && s.lines.length ? s.lines : ['(범위를 적지 않음 — 교과의 기본 개념)']).map(l => `- ${l}`)),
    `[수준] ${levelLine(level)}`
  ];
}
const RULES = [
  '- 정답이 하나로 정해지지 않는 열린 문항만 만듭니다. 범위 안의 내용으로, 초등학생이 읽기 쉬운 말로 씁니다. 학생 이름은 쓰지 않습니다.',
  '- kind: write(쓰기 — 경험·까닭·느낌을 문장으로), draw(그리기 — 그림·색칠·지도로 나타내기), think(생각 정리 — 표·생각그물·차례로 정리하기).',
  '- ask: 학생에게 묻는 말(한두 문장), answer: 예시 답안(그리기는 무엇이 있으면 되는지).',
  '- ok: ○(잘함)로 볼 기준, part: △(조금 더)로 볼 기준. 쓰기는 꼭 들어갈 내용, 그리기는 요구한 것·자세함·정성, 생각 정리는 빠짐없이 정리했는지를 씁니다.'
];
const TASK_JSON = '{"no":1,"kind":"write","ask":"묻는 말","answer":"예시 답안","ok":"○ 기준","part":"△ 기준"}';

export function kindPlan(count, kinds) {
  const ks = KIND_IDS.filter(k => (kinds || []).includes(k));
  return Object.entries(spread(count, ks.length ? ks : KIND_IDS)).filter(([, n]) => n > 0).map(([k, n]) => `${KIND_NAME[k]} ${n}문항`).join(', ');
}
export function actPrompt({ scope, grade = null, count = 3, kinds = KIND_IDS, level = 'normal' } = {}) {
  return ['[활동지 만들기]',
    '당신은 초등학교 수업 활동지를 만드는 경력 많은 담임교사입니다. 아래 범위로 학생이 수업 중에 쓰는 활동지 문항과 채점 기준을 만듭니다.',
    ...head(scope, grade, level),
    `[문항] 모두 ${count}문항: ${kindPlan(count, kinds)}`,
    '', '[규칙]', ...RULES,
    '', '[출력] JSON 하나만 출력합니다.', `{"title":"활동 이름(짧게)","items":[${TASK_JSON}]}`].join('\n');
}
export function redoTaskPrompt({ scope, grade = null, level = 'normal', tasks = [], no } = {}) {
  const t = tasks.find(x => x.no === no) || { kind: 'write', ask: '' };
  return ['[활동지 문항 다시 만들기]',
    '당신은 초등학교 수업 활동지를 만드는 경력 많은 담임교사입니다. 만든 활동지에서 한 문항만 새로 바꿉니다.',
    ...head(scope, grade, level),
    `[바꿀 문항] ${no}번 · ${KIND_NAME[t.kind] || '쓰기'}${t.ask ? ` · 지금 문항: ${t.ask}` : ''}`,
    '[다른 문항] 아래와 겹치지 않게 만듭니다.', ...tasks.filter(x => x.no !== no && x.ask).map(x => `- ${x.no}. ${x.ask}`),
    '', '[규칙]', ...RULES, `- kind는 ${t.kind || 'write'}로 둡니다.`,
    '', '[출력] JSON 하나만 출력합니다.', `{"item":${TASK_JSON}}`].join('\n');
}

const kindOf = x => {
  const k = String((x && (x.kind || x.type)) || '').trim();
  if (KIND_IDS.includes(k)) return k;
  if (/그리|그림|색칠|draw/i.test(k)) return 'draw';
  if (/정리|think/i.test(k)) return 'think';
  if (/쓰기|write/i.test(k)) return 'write';
  const a = String((x && x.ask) || '');
  return /그려|그림|색칠|지도/.test(a) ? 'draw' : /정리|생각그물|마인드맵|표로|차례대로/.test(a) ? 'think' : 'write';
};
function normOneTask(x) {
  if (!x || typeof x !== 'object') return null;
  const ask = str(x.ask || x.question, 300);
  if (!ask) return null;
  const kind = kindOf(x);
  return { no: 0, kind, type: TYPE_OF[kind], ask, answer: str(x.answer, 300), ok: str(x.ok, 300), part: str(x.part, 300) };
}
export function normTasks(v, { count = 10 } = {}) {
  return listOf(v, 'items').map(normOneTask).filter(Boolean).slice(0, Math.max(1, count | 0)).map((t, i) => ({ ...t, no: i + 1 }));
}
export function normTask(v) {
  const x = v && !Array.isArray(v) && v.item ? v.item : listOf(v, 'items')[0] || (v && v.ask ? v : null);
  return normOneTask(x);
}
export function taskWarn(t) {
  if (!t) return '';
  if (!str(t.ask)) return '묻는 말을 써 주세요.';
  if (!str(t.ok)) return '○ 기준을 써 주세요.';
  if (!str(t.part)) return '△ 기준을 써 주세요.';
  return '';
}
export const taskProblems = tasks => tasks.map(t => ({ no: t.no, text: taskWarn(t) })).filter(p => p.text);

const infoLine = m => [m.subject, m.unit, m.lesson && m.lesson !== '단원 전체' ? `${m.lesson}차시` : '', m.pages].filter(Boolean).join(' · ');
const titleOf = m => str(m && m.title, 60) || '활동지';
/* 활동지 글(sheet.student — 1단계 「읽은 글 보기」): 제목, 교과·단원·차시·쪽, 번호 붙은 묻는 말. 기준·예시 답안은 넣지 않음 */
export function sheetText(meta, tasks) {
  const out = [titleOf(meta)], info = infoLine(meta || {});
  if (info) out.push(info);
  for (const t of tasks) out.push('', `${t.no}. ${t.ask}`);
  return out.join('\n');
}
/* 학생 활동지 문서: 맨 위 「학년 반 번호 이름」 칸(단원평가 문제지와 같은 자리), 제목, 문항마다 쓸 칸(그리기는 더 큼) */
const BOX = { write: 6, think: 8, draw: 12 };
export function sheetDoc(meta, tasks) {
  const blocks = [NAME_BOX, { type: 'c', text: titleOf(meta), bold: true }];
  const info = infoLine(meta || {});
  if (info) blocks.push({ type: 'p', text: info });
  for (const t of tasks) {
    blocks.push({ type: 'p', text: `${t.no}. ${t.ask}`, bold: true });
    blocks.push({ type: 'table', rows: [['\n'.repeat((BOX[t.kind] || 6) - 1)]] });
  }
  return { title: '', blocks };
}

/* 새 활동지: 정보, 문항·기준(출처 AI, 확정), 활동지 글 */
export function activityFrom({ meta = {}, tasks = [] } = {}) {
  const a = newActivity({ subject: meta.subject || '', unit: meta.unit || '', lesson: meta.lesson || '', pages: meta.pages || '', title: titleOf(meta),
    ...(meta.date ? { date: meta.date } : {}), term: meta.term ?? null });
  a.items = tasks.map((t, i) => ({ no: i + 1, type: TYPE_OF[t.kind] || t.type || 'write', ask: str(t.ask, 200), answer: str(t.answer, 300), ok: str(t.ok, 300), part: str(t.part, 300), src: 'ai' }));
  a.confirmed = a.items.length > 0;
  a.sheet = { student: sheetText({ ...meta, title: titleOf(meta) }, tasks).slice(0, 12000), teacher: '' };
  return a;
}
