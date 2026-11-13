/* 평가 한 바퀴 띠 (스펙 2026-11-13-crop-log-flow §3, 화면 없음 — Node 시험에서도 씀). 화면은 unit-flow-card.js.
   평가 하나와 기초학력 자료로 여섯 마디의 상태: 채점 → 틀린 까닭 → 복습 문제 → 도달하지 못한 학생 → 기초학력 → 사전·사후.
   마디마다 { id, label, status(짧은 글), done(✓), now(지금 할 차례 — 다 되지 않은 첫 마디), go(누르면 갈 곳) }.
   - 채점: 채점한 학생/채점할 학생(결석 뺌). [채점 마치기]를 해야 ✓(그래야 결과 모아 보기에 들어감)
   - 틀린 까닭: 묶음 수(missView — 앱이 묶은 고른 답·빈 답 포함). 아직 묶지 않은 학생·채점이 바뀐 문항이 없으면 ✓
   - 복습 문제: 만든 문제 수/틀린 학생이 있는 문항 수(redoTargets). 모두 만들면 ✓
   - 도달하지 못한 학생: 결과 모아 보기처럼 이 평가의 교과·학기(학기는 정답지 학기, 없으면 날짜)의 채점을 마친 평가를 모아 gapStudents(기준 cut)로 찾고,
     그중 기준 아래 영역에 이 평가가 든 학생 수. 같은 교과·학기 다른 평가의 영역에서만 낮은 학생은 이 평가의 띠에서 셈하지 않음(목록에는 보임 —
     누르면 목록에서 이 평가의 학생을 골라 둠, go.nos)
   - 기초학력: 사전 점수에 이 평가가 든 학생(growth[].pre.tests) 수 — 번호로 셈(두 프로그램에 든 같은 번호는 한 번)
   - 사전·사후: 그중 사후 점수가 있는 학생 수. 사후는 기초학력 화면처럼 applyAutoPost로 맞춘 값(여기서는 저장하지 않음)
   기초학력에 아무도 넣지 않았으면 두 마디는 넣는 곳(도달하지 못한 학생 목록)으로, 넣을 학생이 없으면 ✓.
   예시 평가(「예시로 채우기」)는 결손·사전·사후 셈에서 빼므로(unit-gap.js와 같음) 뒤 세 마디는 「예시는 빼요」 */
import { graded, termOf } from './unit-model.js';
import { missView } from './unit-miss.js';
import { redoTargets } from './unit-redo.js';
import { gapStudents } from './unit-gap.js';
import { applyAutoPost } from '../../class/camp-growth.js';

export const FLOW = [['grade', '채점'], ['miss', '틀린 까닭'], ['redo', '복습 문제'], ['gap', '도달하지 못한 학생'], ['camp', '기초학력'], ['post', '사전·사후']];
const YET = '아직', SAMPLE = '예시는 빼요';
const termOfTest = (t, breaks) => ([1, 2].includes(Number(t.meta.term)) ? Number(t.meta.term) : termOf(t.meta.date, breaks));
const hasQ = q => !!(q && String(q.q || '').trim());

function gradeNode(t) {
  const m = ((t && t.students) || []).filter(s => !s.skip).length, n = graded(t).length;
  if (!m) return { status: YET, done: false };
  return { status: `채점 ${n}/${m}명${n === m && !t.done ? ' · 마치기 전' : ''}`, done: !!t.done && n > 0 };
}
function missNode(t) {
  if (!graded(t).length) return { status: YET, done: false };
  const view = missView(t);
  if (!view.length) return { status: '틀린 학생 없음', done: true };
  const nG = view.reduce((n, v) => n + v.groups.length, 0), left = new Set(view.flatMap(v => v.pending)).size, stale = view.some(v => v.stale);
  if (!nG) return { status: YET, done: false };
  return { status: `묶음 ${nG}개${stale ? ' · 채점 바뀜' : left ? ` · ${left}명 남음` : ''}`, done: !stale && !left };
}
function redoNode(t) {
  if (!graded(t).length) return { status: YET, done: false };
  const targets = redoTargets(t);
  if (!targets.length) return { status: '틀린 문항 없음', done: true };
  const items = (t.redo && t.redo.items) || {}, n = targets.filter(it => hasQ(items[it.no])).length;
  if (!n) return { status: YET, done: false };
  const all = n === targets.length;
  return { status: `복습 ${all ? n : `${n}/${targets.length}`}개${t.redo.on ? '' : ' · 안 넣음'}`, done: all };
}
/* 이 평가의 교과·학기, 채점을 마친 평가(이 평가는 넘겨받은 지금 모습으로) */
function sameSet(t, tests, breaks) {
  const subject = t.meta.subject || '', term = termOfTest(t, breaks);
  const list = [t, ...(tests || []).filter(x => x && x.id !== t.id)];
  return { subject, term, set: list.filter(x => x && x.done && x.meta && (!subject || x.meta.subject === subject) && termOfTest(x, breaks) === term) };
}
/* 사전 점수에 이 평가가 든 학생 [{ camp, key(번호), post }] — 사후는 그 프로그램을 지금 단원평가에 맞춘 값 */
function campRefs(t, camps, tests, info) {
  const out = [];
  for (const c0 of camps || []) {
    if (!c0 || !Array.isArray(c0.students) || !c0.growth) continue;
    const mine = st => { const e = c0.growth[st.id]; return !!(e && e.pre && Array.isArray(e.pre.tests) && e.pre.tests.some(x => x && x.id === t.id)); };
    if (!c0.students.some(mine)) continue;
    const c = applyAutoPost(c0, tests, { info }).camp;
    for (const st of c.students) {
      if (!mine(st)) continue;
      const e = c.growth[st.id];
      out.push({ camp: c.id, key: st.no ? `n${st.no}` : `${c.id}:${st.id}`, post: !!(e.post && e.post.pct != null) });
    }
  }
  return out;
}
/* 가장 많이 든 프로그램(같으면 지금 프로그램, 아니면 앞 것) */
function bestCamp(refs, current) {
  const n = new Map();
  for (const r of refs) n.set(r.camp, (n.get(r.camp) || 0) + 1);
  const top = Math.max(...n.values()), ties = [...n].filter(([, k]) => k === top).map(([id]) => id);
  return ties.includes(current) ? current : ties[0];
}

/* tests: 저장한 단원평가(채점을 마친 것만 씀), camps: 기초학력 프로그램(normCamp 모양), cut: 결손 기준(단원평가 설정 gapCut),
   breaks: 학교 방학(학기 셈), info: 학급 정보 { grade, room }(사후 자동), current: 지금 기초학력 프로그램 id */
export function flowSteps(test, { tests = [], camps = [], cut, breaks = [], info = null, current = '' } = {}) {
  const t = test && test.meta && test.key ? test : null;
  const blank = { status: YET, done: false };
  const node = {};
  node.grade = t ? gradeNode(t) : blank;
  node.miss = t ? missNode(t) : blank;
  node.redo = t ? redoNode(t) : blank;
  const { subject, term, set } = t ? sameSet(t, tests, breaks) : { subject: '', term: 0, set: [] };
  const sample = !!(t && t.meta.sample);
  const ready = !!(t && t.done) && !sample;
  const mine = ready ? gapStudents(set, { cut }).filter(g => g.areas.some(a => (a.tests || []).includes(t.id))) : [];
  const gapGo = { to: 'results', rv: 'gap', subject, term, nos: mine.map(g => g.no) };
  node.gap = sample ? { status: SAMPLE, done: false } : !ready ? blank : { status: mine.length ? `${mine.length}명` : '없어요', done: true };
  const done = (tests || []).filter(x => x && x.done && x.id !== (t && t.id));
  const refs = t && !sample ? campRefs(t, camps, t.done ? [t, ...done] : done, info) : [];
  const keys = new Set(refs.map(r => r.key)), posts = new Set(refs.filter(r => r.post).map(r => r.key)), k = keys.size;
  const none = ready && !mine.length && !k; // 넣을 학생이 없음
  const camp = k ? bestCamp(refs, current) : '';
  node.camp = sample ? { status: SAMPLE, done: false } : k ? { status: `${k}명 넣음`, done: true } : none ? { status: '넣을 학생 없음', done: true } : blank;
  node.post = sample ? { status: SAMPLE, done: false } : k ? { status: `사후 ${posts.size}/${k}명`, done: posts.size === k } : none ? { status: '없어요', done: true } : blank;
  const go = {
    grade: { to: 'step', step: 3 }, miss: { to: 'step', step: 4, card: 'miss' }, redo: { to: 'step', step: 4, card: 'redo' }, gap: gapGo,
    camp: k ? { to: 'camp', section: 'info', camp } : mine.length ? gapGo : { to: 'camp', section: 'info', camp: '' },
    post: k ? { to: 'camp', section: 'report', camp, card: 'growth' } : mine.length ? gapGo : { to: 'camp', section: 'report', camp: '', card: 'growth' }
  };
  const list = FLOW.map(([id, label]) => ({ id, label, ...node[id], now: false, go: go[id] }));
  const first = list.find(n => !n.done);
  if (first) first.now = true;
  return list;
}

/* 읽어 주는 글(버튼 aria-label): 「채점, 채점 4/5명, 지금 할 차례」 — 색이 아니라 글로 */
export const flowAria = n => [n.label, n.status, n.done ? '다 됨' : '', n.now ? '지금 할 차례' : ''].filter(Boolean).join(', ');
