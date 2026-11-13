/* 단원평가 AI 프롬프트와 답 읽기 (스펙 3.2~3.4). 학생은 번호로만, 이름은 보내지 않음 */
import { itemType } from './unit-key.js';
import { ITEM_TYPES, studentTotal } from './unit-grade.js';
import { makeTitle, LEVEL_NAME, itemName } from './unit-model.js';
import { redoKind } from './unit-redo.js';
import { evidenceList, evidencePrompt, EVIDENCE_RULE, normSentences, joinSentences } from '../../../core/evidence.js';

const TYPE_NAME = Object.fromEntries(ITEM_TYPES);
const TYPES = ITEM_TYPES.map(t => t[0]);
const listOf = (v, k) => (Array.isArray(v) ? v : (v && Array.isArray(v[k]) ? v[k] : []));
// 수, 또는 「4점」처럼 앞에 수가 있는 글 → 수. 아니면 d
const numOr = (v, d = null) => { const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(String(v == null ? '' : v)); return m ? Number(m[1]) : d; };

/* 학생마다 같은 공통(shared, 앞에 두어 캐시)과 학생 글(own). 그림은 그 사이(공통 글 → 학생 그림 → 학생 글) */
export function gradeParts(test, no) {
  const key = test.key.items.map(i => `${i.no} | ${TYPE_NAME[i.type] || '단답'} | ${i.answer} | ${i.points} | ${i.criteria || ''}`);
  const paper = String((test.paper && test.paper.text) || '').slice(0, 12000);
  const shared = [
    '[단원평가 채점]',
    '당신은 초등학교 단원평가를 채점하는 담임교사를 돕습니다. 이 글 뒤에 오는 그림은 한 학생이 답을 쓴 평가지입니다. 이름 칸은 가려져 있을 수 있습니다.',
    `[평가] ${makeTitle(test.meta)}`,
    '', '[정답표] 번호 | 유형 | 정답 | 배점 | 채점 기준', ...key,
    ...(paper ? ['', '[평가지 글]', paper] : []),
    '', '[할 일]',
    '1. 문항마다 학생이 쓴 답을 그대로 읽어 read에 적습니다. 비어 있으면 ""로 둡니다. 맞춤법을 고치지 않습니다.',
    '2. 고르기는 고른 번호를 ③처럼, ○표 문항은 ○표 한 보기 번호를 (3)처럼, 두 개를 골랐으면 ③, ⑤처럼, 기호는 ㉯처럼, 선 잇기는 (1)-①, (2)-②처럼 적습니다.',
    '3. points는 정답표와 채점 기준으로 본 점수입니다(0부터 배점까지 정수). 서술형은 채점 기준과 예시 답안에 비추어 부분 점수를 줄 수 있습니다.',
    '4. 글씨를 알아보기 어렵거나 판단이 애매하면 sure를 false로 둡니다.',
    '5. why에는 단답·서술형을 그렇게 판단한 까닭을 40자 안팎으로 씁니다.',
    '6. 가려진 부분은 무시하고, 학생 이름을 추측하거나 적지 않습니다.',
    '', '[출력] 모든 문항을 담은 JSON 하나만 출력합니다.',
    '{"items":[{"no":1,"read":"학생이 쓴 답","points":0,"sure":true,"why":"판단 까닭"}]}'
  ].join('\n');
  return { shared, own: `[학생] ${no}번 — 바로 위 그림이 이 학생의 평가지예요.` };
}
export function gradePrompt(test, no) { const p = gradeParts(test, no); return `${p.shared}\n\n${p.own}`; }

export const validGrade = v => Array.isArray(v) || !!(v && Array.isArray(v.items));
export function normGrade(v, items) {
  const nos = new Set(items.map(i => i.no)), out = {};
  for (const x of listOf(v, 'items')) {
    const no = Number(x && x.no);
    if (!nos.has(no)) continue;
    out[no] = { read: String(x.read == null ? '' : x.read), points: numOr(x.points, 0), sure: x.sure !== false, why: String(x.why || '') };
  }
  return out;
}

export function keyPrompt(text) {
  const t = String(text || '').slice(0, 20000);
  return [
    '[단원평가 정답지]',
    t ? '아래 단원평가 정답지(문항 이원 분류표·모범 답안)를 읽어 문항마다 정리합니다.' : '첨부한 이미지는 단원평가 정답지(문항 이원 분류표·모범 답안)입니다. 읽어서 문항마다 정리합니다.',
    '- 유형: choice(①~⑤ 고르기, ○표), symbol(㉮·㉠ 같은 기호), match(선 잇기), short(낱말·짧은 답), essay(서술형·예시 답안).',
    '- 정답은 정답지에 적힌 그대로, 배점은 숫자, 행동 영역은 ○가 있는 영역 이름.',
    '', '[출력] JSON 하나만 출력합니다.',
    '{"meta":{"subject":"국어","grade":3,"term":2,"unitNo":1,"round":1},"domains":["지식","이해"],"items":[{"no":1,"content":"평가 내용","domain":"이해","type":"choice","answer":"③","points":4,"criteria":"채점 기준","pages":"교과서 쪽"}]}',
    ...(t ? ['', '[정답지 글]', t] : [])
  ].join('\n');
}

export function normKeyAI(v) {
  if (!v || !Array.isArray(v.items)) return null;
  const items = v.items.map(x => {
    const answer = String(x.answer || ''), criteria = String(x.criteria || '');
    return {
      no: Number(x.no), content: String(x.content || ''), domain: String(x.domain || ''),
      type: TYPES.includes(x.type) ? x.type : itemType(answer, criteria),
      answer, points: numOr(x.points, 0), criteria, pages: String(x.pages || '')
    };
  }).filter(i => Number.isInteger(i.no) && i.no > 0).sort((a, b) => a.no - b.no);
  if (!items.length) return null;
  const m = v.meta || {};
  return {
    meta: { term: numOr(m.term), grade: numOr(m.grade), subject: String(m.subject || ''), unitNo: numOr(m.unitNo), round: numOr(m.round) },
    domains: Array.isArray(v.domains) ? v.domains.map(String).filter(Boolean) : [], items
  };
}

export function feedbackPrompt(test, students) {
  const lines = students.map(st => {
    const t = studentTotal(test, st), good = [], weak = [];
    for (const it of test.key.items) {
      const pts = Number(st.items[it.no] && st.items[it.no].pts) || 0;
      // 평가 내용이 없는 문항은 「3번 문항」(빈 글이면 맞힌 것·다시 볼 것이 모두 「없음」으로 감)
      if (pts >= it.points) good.push(itemName(it));
      else weak.push(pts > 0 ? `${itemName(it)}(부분 점수)` : itemName(it));
    }
    return `- ${st.no}번 | 점수 ${t.score}/${t.total} | 맞힌 것: ${[...new Set(good)].join(', ') || '없음'} | 다시 볼 것: ${[...new Set(weak)].join(', ') || '없음'}`;
  });
  return [
    '[단원평가 피드백]',
    `${test.meta.grade ? test.meta.grade + '학년' : '초등학교'} 학생들에게 ${makeTitle(test.meta)} 결과와 함께 줄 말을 씁니다.`,
    '', '[학생]', ...lines,
    '', '[규칙]',
    '- good: 맞힌 내용에 근거한 잘한 점 1문장. cheer: 다시 볼 내용을 따뜻하게 권하는 격려 1문장.',
    '- 그 학년 학생에게 하는 말로 「~했어요」「~해 봐요」처럼 씁니다. 각 60자 안팎.',
    '- 학생 이름과 점수 숫자는 쓰지 않습니다. 학생마다 다른 문장으로 씁니다.',
    '', '[출력] JSON 하나만 출력합니다.',
    '{"students":[{"no":1,"good":"잘한 점","cheer":"격려 한마디"}]}'
  ].join('\n');
}

export function normFeedback(v) {
  const out = {};
  for (const x of listOf(v, 'students')) {
    const no = Number(x && x.no);
    if (!Number.isInteger(no) || no <= 0) continue;
    out[no] = { good: String(x.good || '').trim().slice(0, 200), cheer: String(x.cheer || '').trim().slice(0, 200) };
  }
  return out;
}

/* 평어 근거(스펙 2026-11-13 §5-1)의 평가 이름: 「3학년 수학 3단원」(학년·교과·단원 — 학생 정보 없음) */
export function evTitle(m = {}) {
  return [m.grade ? `${m.grade}학년` : '', m.subject || '', m.unitNo ? `${m.unitNo}단원` : ''].filter(Boolean).join(' ') || makeTitle({ ...m, sample: false });
}
/* 그 학생의 잘한·보완할 평가 내용 정답률 [{ name, rate, titles }] → 근거 목록. 화면은 「「3학년 수학 3단원」 세 자리 수 덧셈 90%」,
   AI에는 정답률 숫자 없이 「… — 잘함」「… — 보완 필요」(평어에 숫자가 들어가지 않게) */
export function pyeongeoEvidence(rates) {
  return evidenceList((rates || []).map(r => {
    const ts = [...new Set(r.titles || [])];
    const where = ts.length ? `「${ts[0]}${ts.length > 1 ? ` 외 ${ts.length - 1}개` : ''}」 ` : '';
    const how = r.rate >= 0.8 ? '잘함' : r.rate < 0.6 ? '보완 필요' : '보통';
    return { kind: 'unit', label: `${where}${r.name} ${Math.round(r.rate * 100)}%`, ai: `${where}${r.name} — ${how}` };
  }));
}

/* list: [{ no, level, good, weak, ev(근거 목록) }] — 학생마다 학생 줄 아래 근거 목록, 답은 문장마다 기댄 근거 번호(src) */
export function pyeongeoPrompt(subject, list) {
  return [
    '[단원평가 평어]',
    `${subject} 교과 단원평가 결과로 학생마다 교과학습발달상황 문장 초안을 씁니다.`,
    '', '[학생]',
    ...list.map(s => `- ${s.no}번 | 수준 ${LEVEL_NAME[s.level] || s.level} | 잘한 것: ${s.good.join(', ') || '없음'} | 보완할 것: ${s.weak.join(', ') || '없음'}\n${evidencePrompt(s.ev || [], '  ')}`),
    '', '[규칙]',
    '- 1~2문장, 80~150자. 끝맺음은 「~함.」「~임.」처럼 씁니다.',
    '- 학생 이름·대명사·점수를 쓰지 않습니다. 잘한 것은 구체적으로, 보완할 것은 「~하면 더 나아질 것임」처럼 성장 중심으로 씁니다.',
    '- 수준이 같아도 학생마다 다른 문장으로 씁니다.',
    `- ${EVIDENCE_RULE} 근거 번호는 그 학생 줄 아래 [근거 목록]의 번호입니다.`,
    '', '[출력] JSON 하나만 출력합니다. 학생마다 평어 문장을 sentences에 차례대로 나눠 담습니다.',
    '{"students":[{"no":1,"sentences":[{"t":"문장","src":["e1"]}]}]}'
  ].join('\n');
}

/* → { [no]: { text, sentences } } — 새 답은 sentences(문장마다 근거), 예전 답({ no, text })은 sentences: null.
   lists: { [no]: 그 학생 근거 목록 } (목록에 없는 근거 번호는 뺌). 글은 400자까지(넘으면 끝 문장을 뺌) */
export function normPyeongeo(v, lists = {}) {
  const out = {};
  for (const x of listOf(v, 'students')) {
    const no = Number(x && x.no);
    if (!Number.isInteger(no) || no <= 0) continue;
    if (Array.isArray(x.sentences)) {
      const ss = normSentences(x.sentences, lists[no] || []);
      while (ss.length > 1 && joinSentences(ss).length > 400) ss.pop();
      if (ss.length === 1 && ss[0].t.length > 400) ss[0] = { ...ss[0], t: ss[0].t.slice(0, 400).trim() };
      const text = joinSentences(ss);
      if (text) { out[no] = { text, sentences: ss }; continue; }
    }
    if (x.text) out[no] = { text: String(x.text).trim().slice(0, 400), sentences: null };
  }
  return out;
}

/* 결과지 복습 문제 (스펙 2026-11-06 A): 평가 하나에 한 번. 문항 번호·평가 내용·영역·유형·정답·교과서 쪽만 보냄(학생 정보·채점 기준 없음) */
const KIND_NAME = { choice: '고르기(보기 4개)', short: '단답', essay: '서술형' };
export function redoPrompt(test, items) {
  const m = test.meta || {};
  return [
    '[단원평가 복습 문제]',
    `${m.grade ? m.grade + '학년' : '초등학교'} ${makeTitle({ ...m, sample: false })} 단원평가에서 틀린 학생이 있는 문항입니다. 문항마다 같은 개념을 묻는 비슷한 복습 문제를 1개씩 만듭니다.`,
    '', '[문항] 번호 | 평가 내용 | 영역 | 유형 | 정답 | 교과서 쪽 | 만들 꼴',
    ...items.map(it => `- ${it.no} | ${it.content || ''} | ${it.domain || ''} | ${TYPE_NAME[it.type] || '단답'} | ${it.answer || ''} | ${it.pages || ''} | ${KIND_NAME[redoKind(it.type)]}`),
    '', '[규칙]',
    '- 원래 문제를 그대로 베끼지 않고, 같은 개념을 묻는 새 문제로 씁니다. 그 학년 학생이 혼자 풀 수 있게 쉽고 짧게(물음 80자 안).',
    '- 고르기(보기 4개): q에 물음, choices에 보기 글 4개(번호 없이), answer에 정답 번호(①~④ 중 하나).',
    '- 단답: q에 물음, answer에 짧은 정답(낱말·수).',
    '- 서술형: q에 짧은 물음, answer에 예시 답(60자 안).',
    '- explain: 왜 그 답인지 짧은 풀이(40자 안). 「~해요」처럼 씁니다.',
    '- 그림·표를 봐야 풀 수 있는 문제는 만들지 않습니다.',
    '', '[출력] JSON 하나만 출력합니다.',
    '{"items":[{"no":1,"q":"물음","choices":["보기1","보기2","보기3","보기4"],"answer":"②","explain":"짧은 풀이"}]}'
  ].join('\n');
}
const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const CIRC4 = '①②③④';
export function normRedo(v, items) {
  const by = new Map(items.map(i => [i.no, i])), out = {};
  for (const x of listOf(v, 'items')) {
    const it = by.get(Number(x && x.no));
    if (!it || out[it.no]) continue;
    const q = clip(x.q, 200);
    if (!q) continue;
    const kind = redoKind(it.type);
    const choices = kind === 'choice' && Array.isArray(x.choices) ? x.choices.map(c => clip(String(c == null ? '' : c).replace(/^\s*(?:[①-⑩]|\(?\d+\s*[).])\s*/, ''), 60)).filter(Boolean).slice(0, 4) : [];
    let answer = clip(x.answer, 120);
    if (choices.length >= 2) {
      // 정답은 ①~④로: 「2」「(2)」「②」, 또는 보기 글 그대로
      const m = /^\(?\s*([1-4])\s*[).]?$|^([①-④])/.exec(answer), k = choices.indexOf(answer);
      if (m) answer = m[2] || CIRC4[m[1] - 1]; else if (k >= 0) answer = CIRC4[k];
    }
    out[it.no] = { kind, q, choices: choices.length >= 2 ? choices : [], answer, explain: clip(x.explain, 40) };
  }
  return out;
}
