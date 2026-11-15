/* 단원평가 문항 만들기 (스펙 2026-11-15-docedit-minutes-quiz §3, 화면 없음 — Node 시험에서도 씀). 화면은 unit-maker.js.
   AI(업무 「계획 초안·문항 만들기」 plan)에는 교과·학년·범위(진도표 차시 또는 선생님이 쓴 범위)·문항 수·유형·수준만 보냄 — 학생 자료는 보내지 않음.
   만든 문항 { no, type: 'choice'|'short'|'essay', question, choices[], answer, points, content, domain, criteria, pages }:
   - 객관식 정답은 보기 번호(①~⑤) 안. 「3」·「3번」·보기 글도 번호로 고치고, 보기 밖이면 비워 「확인할 것」으로
   - 배점은 앱이 나눔: 합 100, 서술형은 두 배 비율(선생님이 고칠 수 있음)
   - 정답표(keyItems)는 단원평가 정답지(unit-key.js parseKey)와 같은 모양 → 학생 문제지 스캔만 넣으면 지금처럼 채점
   - 문제지 글(paperText)은 채점 AI가 보는 「평가지 글」, 문제지·정답지 문서는 core/doc-export.js로 한글·워드·PDF */
import { newTest, makeTitle } from './unit-model.js';
import { spread, levelLine } from '../make-scope.js';

export const MAKE_TYPES = [['choice', '객관식'], ['short', '단답'], ['essay', '서술형']];
const TYPE_IDS = MAKE_TYPES.map(t => t[0]);
const TYPE_NAME = Object.fromEntries(MAKE_TYPES);
const WEIGHT = { choice: 3, short: 1, essay: 1 }; // 섞을 때 나누는 비율(객관식이 많게)
export const CIRCLED = '①②③④⑤';
const str = (v, n = 300) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const listOf = (v, k) => (Array.isArray(v) ? v : v && Array.isArray(v[k]) ? v[k] : []);

/* ---------- 요청 글 ---------- */
function head(scope, grade, level) {
  const s = scope || {};
  return [
    `[교과] ${s.subject || '(교과를 적지 않음)'}${grade ? ` · ${grade}학년` : ''}`,
    '[범위]', ...((s.lines && s.lines.length ? s.lines : ['(범위를 적지 않음 — 교과의 기본 개념)']).map(l => `- ${l}`)),
    `[수준] ${levelLine(level)}`
  ];
}
const RULES = [
  '- 범위 안의 내용만 묻습니다. 교과서에 없는 사실·숫자를 지어내지 않습니다.',
  '- 초등학생이 읽기 쉬운 말로, 한 문항에 한 가지만 묻습니다. 학생 이름은 쓰지 않습니다.',
  '- 객관식(choice): 보기 4개(5·6학년은 5개도 됨), 정답은 하나. answer는 정답 보기 번호(①~⑤ 가운데 하나).',
  '- 단답(short): 낱말이나 짧은 말 하나로 답하는 문항. answer는 정답(맞는 답이 여럿이면 「/」로 나눔).',
  '- 서술형(essay): 까닭·방법·과정을 문장으로 쓰는 문항. answer는 예시 답안, criteria는 채점 기준(부분 점수를 줄 기준까지).',
  '- content: 평가 내용(무엇을 아는지 20자 안팎), domain: 행동 영역(지식·이해·적용·분석 가운데 하나), pages: 범위에 교과서 쪽이 있으면 그 쪽.',
  '- 배점은 앱이 나누므로 쓰지 않습니다.'
];
const ITEM_JSON = '{"no":1,"type":"choice","question":"묻는 말","choices":["보기1","보기2","보기3","보기4"],"answer":"②","content":"평가 내용","domain":"이해","criteria":"","pages":"30~31쪽"}';

/* 문항 수(count)를 고른 유형(types)에 객관식이 많게 나눠 「객관식 3문항, 단답 1문항, 서술형 1문항」 */
export function typePlan(count, types) {
  const ks = TYPE_IDS.filter(k => (types || []).includes(k));
  const plan = spread(count, ks.length ? ks : TYPE_IDS, WEIGHT);
  return Object.entries(plan).filter(([, n]) => n > 0).map(([k, n]) => `${TYPE_NAME[k]} ${n}문항`).join(', ');
}

export function makePrompt({ scope, grade = null, count = 5, types = TYPE_IDS, level = 'normal' } = {}) {
  return ['[문항 만들기]',
    '당신은 초등학교 단원평가 문항을 만드는 경력 많은 담임교사입니다. 아래 범위로 학생이 풀 단원평가 문항을 만듭니다.',
    ...head(scope, grade, level),
    `[문항] 모두 ${count}문항: ${typePlan(count, types)} (이 차례로)`,
    '', '[규칙]', ...RULES,
    '', '[출력] JSON 하나만 출력합니다.',
    `{"title":"단원평가 제목","items":[${ITEM_JSON}]}`].join('\n');
}

/* 한 문항 다시 만들기: 그 번호 자리에 같은 유형으로, 다른 문항과 겹치지 않게 */
export function redoPrompt({ scope, grade = null, level = 'normal', items = [], no } = {}) {
  const it = items.find(x => x.no === no) || { type: 'short', question: '' };
  return ['[문항 다시 만들기]',
    '당신은 초등학교 단원평가 문항을 만드는 경력 많은 담임교사입니다. 만든 단원평가에서 한 문항만 새로 바꿉니다.',
    ...head(scope, grade, level),
    `[바꿀 문항] ${no}번 · ${TYPE_NAME[it.type] || '단답'}${it.question ? ` · 지금 문항: ${it.question}` : ''}`,
    '[다른 문항] 아래와 겹치지 않게 만듭니다.', ...items.filter(x => x.no !== no && x.question).map(x => `- ${x.no}. ${x.question}`),
    '', '[규칙]', ...RULES, `- type은 ${it.type || 'short'}로 둡니다.`,
    '', '[출력] JSON 하나만 출력합니다.', `{"item":${ITEM_JSON}}`].join('\n');
}

/* ---------- AI 답 다듬기 ---------- */
// 보기 앞 번호 표시(①·1.·(1)·가.)는 뺌 — 「1.5」「4.19 혁명」처럼 점 뒤가 숫자면 번호가 아님
const unmark = s => str(s, 120).replace(/^(?:[①-⑩]|\(\s*\d{1,2}\s*\)|\d{1,2}\s*[.)](?!\d)|[가-하]\s*[.)])\s*/, '').trim();
const bare = s => String(s || '').replace(/\s+/g, '');
/* 객관식 정답 → 「③」(여럿이면 「②, ④」). 보기 번호 밖이거나 빈 보기를 가리키면 '' */
export function choiceAnswer(answer, choices) {
  const s = str(answer, 120), ch = choices || [];
  if (!s) return '';
  const okNo = n => Number.isInteger(n) && n >= 1 && n <= Math.min(ch.length, CIRCLED.length) && !!String(ch[n - 1] || '').trim();
  let nos = [...s].filter(c => CIRCLED.includes(c) || '⑥⑦⑧⑨⑩'.includes(c)).map(c => '①②③④⑤⑥⑦⑧⑨⑩'.indexOf(c) + 1);
  if (!nos.length && /^[\s(]*\d{1,2}[\s)]*(번)?([\s,·]+\(?\d{1,2}\)?\s*번?)*$/.test(s)) {
    nos = (s.match(/\d{1,2}/g) || []).map(Number);
    // 보기가 숫자이고 그 숫자가 다른 자리의 보기 글이면(보기 3·4·5·6에 「4」) 번호인지 값인지 알 수 없음 → 비워 선생님이 고름
    if (!/번/.test(s) && nos.some(n => { const at = ch.findIndex(c => bare(unmark(c)) === String(n)); return at >= 0 && at !== n - 1; })) return '';
  }
  if (!nos.length) { const i = ch.findIndex(c => bare(unmark(c)) && bare(unmark(c)) === bare(unmark(s))); if (i >= 0) nos = [i + 1]; }
  nos = [...new Set(nos)].sort((a, b) => a - b);
  return nos.length && nos.every(okNo) ? nos.map(n => CIRCLED[n - 1]).join(', ') : '';
}
const TYPE_WORDS = [[/객관|고르|선택|choice/i, 'choice'], [/서술|논술|essay/i, 'essay'], [/단답|빈칸|short/i, 'short']];
function typeOf(x) {
  const t = String((x && x.type) || '').trim();
  if (TYPE_IDS.includes(t)) return t;
  const w = TYPE_WORDS.find(([re]) => re.test(t));
  if (w) return w[1];
  if (listOf(x && x.choices).filter(c => str(c)).length >= 2) return 'choice';
  return str(x && x.criteria) ? 'essay' : 'short';
}
const choiceList = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n|(?=[①-⑤])/) : []).map(unmark).filter(Boolean).slice(0, 5);

/* 한 문항 → 다듬은 문항(물음이 없으면 null). 번호는 부르는 쪽이 매김 */
function normItem(x) {
  if (!x || typeof x !== 'object') return null;
  const question = str(x.question || x.q || x.ask, 400);
  if (!question) return null;
  const type = typeOf(x);
  let choices = [];
  if (type === 'choice') { choices = choiceList(x.choices); while (choices.length < 4) choices.push(''); }
  const answer = type === 'choice' ? choiceAnswer(x.answer, choices) : str(x.answer, 300);
  return {
    no: 0, type, question, choices, answer, content: str(x.content, 60) || question.slice(0, 30), domain: str(x.domain, 30),
    criteria: type === 'essay' ? str(x.criteria, 300) : '', pages: str(x.pages, 40), points: 0
  };
}
/* AI 답 { items } → 문항 목록(빈 물음은 버림, count까지, 번호 1부터) */
export function normMade(v, { count = 20 } = {}) {
  return listOf(v, 'items').map(normItem).filter(Boolean).slice(0, Math.max(1, count | 0)).map((it, i) => ({ ...it, no: i + 1 }));
}
/* 다시 만든 한 문항 { item } (또는 items 첫째) → 문항 또는 null */
export function normOne(v) {
  const x = v && !Array.isArray(v) && v.item ? v.item : listOf(v, 'items')[0] || (v && v.question ? v : null);
  return normItem(x);
}

/* ---------- 배점 ---------- */
/* 합 100: 서술형은 두 배 비율, 남는 점수는 나머지가 큰 문항부터(같으면 뒤 문항) */
export function fixPoints(items) {
  const w = items.map(it => (it.type === 'essay' ? 2 : 1)), W = w.reduce((a, b) => a + b, 0);
  if (!W) return [];
  const raw = w.map(x => 100 * x / W), pts = raw.map(Math.floor);
  let rem = 100 - pts.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - pts[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1]).forEach(([, i]) => { if (rem > 0) { pts[i]++; rem--; } });
  return items.map((it, i) => ({ ...it, points: pts[i] }));
}

/* ---------- 확인할 것 ---------- */
export function warnOf(it) {
  if (!it) return '';
  if (!str(it.question)) return '물음을 써 주세요.';
  if (it.type === 'choice') {
    const filled = (it.choices || []).filter(c => str(c)).length;
    if (filled < 2) return '보기를 두 개 넘게 써 주세요.';
    if (!choiceAnswer(it.answer, it.choices)) return '정답 보기 번호를 골라 주세요(빈 보기는 정답이 될 수 없어요).';
    if (filled < (it.choices || []).length && (it.choices || []).slice(0, filled).some(c => !str(c))) return '보기 사이의 빈칸을 채워 주세요.';
    return '';
  }
  if (it.type === 'short' && !str(it.answer)) return '정답을 써 주세요.';
  if (it.type === 'essay' && !str(it.answer) && !str(it.criteria)) return '예시 답안이나 채점 기준을 써 주세요.';
  return '';
}
/* 평가를 만들기 전에 고칠 것: [{ no, text }] */
export const problems = items => items.map(it => ({ no: it.no, text: warnOf(it) })).filter(p => p.text);

/* ---------- 정답표·문제지 ---------- */
const exampled = a => (!a || /^\(\s*예\s*\)/.test(a) ? a : `(예) ${a}`);
/* 단원평가 정답표 문항(unit-key.js parseKey와 같은 칸·차례) */
export const keyItems = items => items.map((it, i) => ({
  no: Number(it.no) || i + 1, content: str(it.content, 60) || str(it.question, 30), domain: str(it.domain, 30), type: it.type,
  answer: it.type === 'choice' ? choiceAnswer(it.answer, it.choices) : it.type === 'essay' ? exampled(str(it.answer, 300)) : str(it.answer, 300),
  points: Math.max(0, Number(it.points) || 0), criteria: it.type === 'essay' ? str(it.criteria, 300) : '', pages: str(it.pages, 40)
}));
export const paperTitle = meta => { const t = makeTitle({ ...meta, round: meta && meta.round, sample: false }); return t === '단원평가' ? t : `${t} 단원평가`; };
const ask = it => `${it.no}. ${it.question} (${it.type === 'essay' ? '서술형, ' : ''}${Number(it.points) || 0}점)`;
const choiceLines = it => (it.choices || []).map((c, i) => [c, i]).filter(([c]) => str(c)).map(([c, i]) => `${CIRCLED[i]} ${c}`);

/* 채점 AI가 보는 문제지 글(빈 문제지): 제목, 번호 붙은 물음, 보기. 정답·기준은 넣지 않음 */
export function paperText(meta, items) {
  const out = [paperTitle(meta)];
  for (const it of items) { out.push('', ask(it)); if (it.type === 'choice') out.push(...choiceLines(it)); }
  return out.join('\n');
}

/* 학생 문제지 문서: 맨 위에 늘 같은 자리의 「학년 반 번호 이름」 칸(적힌 번호로 학생 맞추기·이름 칸 가리기가 쉽게), 제목, 문항·보기, 단답·서술형 답 칸 */
export const NAME_BOX = { type: 'table', rows: [['학년', '', '반', '', '번호', '', '이름', '']], widths: [1, 1, 1, 1, 1.2, 1, 1, 3] };
export function paperDoc(meta, items) {
  const blocks = [NAME_BOX, { type: 'c', text: paperTitle(meta), bold: true }];
  const info = [meta && meta.subject, meta && meta.lesson && meta.lesson !== '단원 전체' ? `${meta.lesson}차시` : '', `${items.length}문항 · ${items.reduce((a, it) => a + (Number(it.points) || 0), 0)}점`].filter(Boolean).join(' · ');
  blocks.push({ type: 'p', text: info });
  for (const it of items) {
    blocks.push({ type: 'p', text: ask(it), bold: true });
    if (it.type === 'choice') blocks.push({ type: 'p', text: choiceLines(it).join('\n') });
    else if (it.type === 'short') blocks.push({ type: 'table', rows: [['답', '']], widths: [1, 7] });
    else blocks.push({ type: 'table', rows: [['\n\n\n\n']] });
  }
  return { title: '', blocks };
}
/* 정답지 문서: 번호·유형·정답·배점·평가 내용·채점 기준 표 */
export function answerDoc(meta, items) {
  const key = keyItems(items);
  return { title: `${paperTitle(meta)} 정답`, blocks: [
    { type: 'table', head: true, widths: [1, 1.4, 3, 1, 3, 3], rows: [['번호', '유형', '정답', '배점', '평가 내용', '채점 기준'],
      ...key.map(k => [String(k.no), TYPE_NAME[k.type] || '', k.answer, String(k.points), k.content, k.criteria])] }
  ] };
}

/* 만든 평가의 1단계에서 다시 내려받을 문항: 만든 물음·보기(t.made) + 지금 정답표(정답·배점·기준). 1단계에서 정답표에서 뺀 문항은 빼고,
   번호는 정답표 번호 그대로(채점 번호와 같게) */
export function madeItems(t) {
  if (!t || !t.made || !Array.isArray(t.made.items)) return [];
  const key = (t.key && Array.isArray(t.key.items)) ? t.key.items : [];
  return t.made.items.map(m => [m, key.find(k => k.no === m.no)]).filter(([, k]) => k)
    .map(([m, k]) => ({ ...m, answer: k.answer || '', points: k.points ?? m.points, content: k.content || '', criteria: k.criteria || '', type: TYPE_IDS.includes(k.type) ? k.type : m.type }));
}

/* 새 단원평가: 평가 정보(교과·학년·단원·차시), 정답표, 문제지 글. made: 만든 물음·보기(문제지를 다시 내려받을 때) */
export function testFrom({ meta = {}, items = [] } = {}) {
  const key = keyItems(items);
  const t = newTest({
    meta: { subject: meta.subject || '', grade: meta.grade || null, unitNo: meta.unitNo ?? null, unitName: meta.unitName || '', lesson: meta.lesson || '', ...(meta.date ? { date: meta.date } : {}) },
    key: { domains: [...new Set(key.map(k => k.domain).filter(Boolean))], items: key },
    paper: { text: paperText(meta, items).slice(0, 12000) }
  });
  t.made = { items: items.map((it, i) => ({ no: i + 1, type: it.type, question: str(it.question, 400), choices: (it.choices || []).map(c => str(c, 120)), points: Number(it.points) || 0 })) };
  return t;
}
