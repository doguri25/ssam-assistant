/* 평가 한눈에(스펙 2026-11-14-eval-redesign §2, 화면 없음 — Node 시험에서도 씀).
   평가마다 단계: prep 준비 · grade 채점 · result 결과 확인 · help 보충 · record 생활기록부 · done 끝(한눈에서는 접음).
   확인할 수(선생님 차례): 쌤비서가 판단을 미뤘거나 다시 보기 AI와 다른 칸·학생 중 선생님이 아직 정하지 않은 것.
   - 단원평가: 채점한 학생 0 → 준비. 그다음은 평가 한 바퀴(flowSteps)의 첫 안 끝난 칸 — 채점 → 채점, 틀린 까닭 → 결과 확인,
     복습 문제·도달하지 못한 학생·기초학력·사전사후 → 보충, 모두 끝 → 생활기록부(그 교과 평어를 다 썼으면 끝).
     예시 평가는 결손·기초학력·사전사후 칸을 보지 않음(그 칸은 예시에서 늘 「예시는 빼요」라 끝나지 않음).
   - 활동지: 채점 0 → 준비, 채점 중(마치기 전) → 채점, 마침 → 결과 확인, 교과 평어로 넘김(link) → 끝(평어는 교과 평어에서 씀).
   - 평가지 채점: 점수 0 → 준비, 점수 일부 → 채점, 모두 점수·글 없음 → 결과 확인, 글 일부 → 생활기록부, 글 모두 → 끝.
   한눈에서는 끝났어도 확인할 것이 남은 평가를 접지 않고 생활기록부 칸에 둠(boardStage — 띠와 가로 메뉴 「선생님 차례」 수가 같게). */
export const STAGES = [['prep', '준비'], ['grade', '채점'], ['result', '결과 확인'], ['help', '보충'], ['record', '생활기록부']];
export const boardStage = (stage, pending) => (stage === 'done' && pending ? 'record' : stage);
export const stageLabel = id => (STAGES.find(s => s[0] === id) || [id, '끝'])[1];
/* 한눈에 [마치기]로 마친 평가(eval-close.js)는 끝(접음)·선생님 차례 0, 아니면 지금 규칙(boardStage) */
export const closedView = (stage, pending, closed) => (closed ? { stage: 'done', pending: 0 } : { stage: boardStage(stage, pending), pending });

const live = list => (Array.isArray(list) ? list : []).filter(s => s && !s.skip);
const gradedOf = t => live(t && t.students).filter(s => s.status === 'done');
const SAMPLE_SKIP = ['gap', 'camp', 'post'];

export function unitStage(t, steps = [], { pyDone = false } = {}) {
  if (!t || !gradedOf(t).length) return 'prep';
  const sample = !!(t.meta && t.meta.sample);
  const first = (steps || []).find(n => n && !n.done && !(sample && SAMPLE_SKIP.includes(n.id)));
  if (!first) return pyDone ? 'done' : 'record';
  return first.id === 'grade' ? 'grade' : first.id === 'miss' ? 'result' : 'help';
}
const unitNeeds = c => !!(c && ((c.flag && !c.ok) || (c.rv && !c.rv.agree && !c.rv.done)));
export function unitPending(t) {
  if (!t || !t.key) return 0;
  const items = Array.isArray(t.key.items) ? t.key.items : [];
  return gradedOf(t).reduce((n, s) => n + items.filter(it => unitNeeds(s.items && s.items[it.no])).length, 0);
}

/* [바로 마치기]: 판단을 미룬 칸·다시 보기 AI와 다른 칸을 쌤비서(메인 AI) 점수 그대로 정함(점수는 바꾸지 않음) → 정한 칸 수 */
export function acceptUnit(t) {
  if (!t || !t.key) return 0;
  const items = Array.isArray(t.key.items) ? t.key.items : [];
  let n = 0;
  for (const s of gradedOf(t)) for (const it of items) {
    const c = s.items && s.items[it.no];
    if (!unitNeeds(c)) continue;
    if (c.rv && !c.rv.agree && !c.rv.done) c.rv = { ...c.rv, done: 'main' };
    c.ok = true; n++;
  }
  return n;
}

export function activityStage(a) {
  if (!a || !live(a.students).some(s => s.status === 'done')) return 'prep';
  if (!a.done) return 'grade';
  return a.link ? 'done' : 'result';
}
export function activityPending(a) {
  if (!a) return 0;
  return live(a.students).reduce((n, s) => n + Object.values(s.marks || {}).filter(c => c && c.chk).length, 0);
}

/* [바로 마치기]: 노란 칸·다시 보기 AI 의견 칸(채점 확인 화면이 보이는 칸)을 쌤비서 표시 그대로 정함 → 정한 칸 수 */
export function acceptActivity(a) {
  let n = 0;
  if (a) for (const s of live(a.students)) for (const c of Object.values(s.marks || {})) if (c && (c.chk || c.rv)) { c.chk = false; delete c.rv; n++; }
  return n;
}

export function grStage(b) {
  const st = live(b && b.students);
  const scored = st.filter(s => s.score != null).length;
  if (!scored) return 'prep';
  if (scored < st.length) return 'grade';
  const texts = st.filter(s => s.text).length;
  return !texts ? 'result' : texts < st.length ? 'record' : 'done';
}
export function grPending(b) {
  // 글 검토 제안은 trv.done이 생길 때까지(trvd는 「검토를 돌렸다」 표시라 셈과 상관없음 — evaluate.js 평가지 채점 확인과 같은 규칙)
  return live(b && b.students).filter(s => (s.unreadable && !s.manual) || (s.rv && !s.rv.done) || (s.trv && !s.trv.done)).length;
}
