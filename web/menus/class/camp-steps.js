/* 기초학력 캠프 단계 진행 표시·문서 준비 상자 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-11-11-ui-refresh-design.md §3
   campSteps: 6단계마다 { id, label, line(상태 한 줄), done(다 된 단계 ✓) }
   docReadiness: 문서 4종마다 { id, label, state: 'ready'(준비됨) | 'todo'(할 일 남음) | 'none'(아직), note(까닭 한 줄), sec(그 단계) } */
import { DOC_IDS, hoursTotal, sessionChecked, campDates } from './camp-model.js';
import { docLabel } from './camp-docs.js';

export const STEPS = [['info', '기본 정보'], ['sched', '수업 일정'], ['att', '출석 체크'], ['obs', '관찰 기록'], ['report', '결과 보고서'], ['docs', '문서 내보내기']];
const has = s => String(s || '').trim().length > 0;
/* 날마다 캠프는 날짜마다 한 번(출석부도 날짜마다 한 칸): 그날 수업 중 어느 줄에든 학생마다 ○·/가 있으면 그날은 체크됨 */
const MARK = m => m === 'O' || m === 'X';
const dayChecked = (c, d) => c.students.length > 0 && c.students.every(st => c.sessions.some(s => s.date === d && MARK(c.att[s.id] && c.att[s.id][st.id])));
const counts = c => {
  const day = c.unit === 'day', ds = day ? campDates(c) : [];
  const checked = day ? ds.filter(d => dayChecked(c, d)).length : c.sessions.filter(s => sessionChecked(c, s)).length;
  const total = day ? ds.length : c.sessions.length;
  const marked = c.sessions.some(s => c.students.some(st => c.att[s.id] && c.att[s.id][st.id]));
  const obsLeft = c.students.filter(st => !has(c.obs[st.id])).length;
  const written = c.report.sections.filter(s => has(s.text)).length;
  return { checked, total, day, marked, obsLeft, written, nSec: c.report.sections.length };
};

export function docReadiness(c) {
  const n = counts(c), noStudents = !c.students.length, noSessions = !c.sessions.length;
  const out = (id, state, note, sec) => ({ id, label: docLabel(id, c), state, note: state === 'ready' ? '준비됨' : note, sec });
  const blank = c.sessions.filter(s => !has(s.content)).length, noDate = c.sessions.filter(s => !s.date).length;
  const left = n.total - n.checked;
  const docs = {
    confirm: () => (noSessions ? out('confirm', 'none', '수업 일정이 없어요', 'sched')
      : blank ? out('confirm', 'todo', `지도 내용 ${blank}줄 비어 있음`, 'sched') : noDate ? out('confirm', 'todo', `날짜 ${noDate}줄 비어 있음`, 'sched') : out('confirm', 'ready', '', 'sched')),
    attend: () => (noStudents ? out('attend', 'none', '학생을 넣어 주세요', 'info') : noSessions ? out('attend', 'none', '수업 일정이 없어요', 'sched')
      : !left ? out('attend', 'ready', '', 'att') : !n.marked ? out('attend', 'none', '아직 체크 안 함', 'att') : out('attend', 'todo', `출석 ${left}${n.day ? '일' : '줄'} 남음`, 'att')),
    observe: () => (noStudents ? out('observe', 'none', '학생을 넣어 주세요', 'info')
      : !n.obsLeft ? out('observe', 'ready', '', 'obs') : n.obsLeft === c.students.length ? out('observe', 'none', '아직 안 씀', 'obs') : out('observe', 'todo', `관찰 글 ${n.obsLeft}명 남음`, 'obs')),
    report: () => (n.nSec && n.written === n.nSec ? out('report', 'ready', '', 'report') : !n.written ? out('report', 'none', '아직 안 씀', 'report')
      : out('report', 'todo', `${n.nSec - n.written}칸 비어 있음`, 'report'))
  };
  return DOC_IDS.map(id => docs[id]());
}

export function campSteps(c) {
  const n = counts(c), ns = c.students.length, nr = c.sessions.length;
  const ready = docReadiness(c).filter(d => d.state === 'ready').length;
  const line = {
    info: ns ? [has(c.target) ? `대상 ${c.target.trim()}` : `학생 ${ns}명`, c.subjects.join('·')].filter(Boolean).join(' · ') : '학생을 넣어 주세요',
    sched: nr ? `${nr}줄 · 총 ${hoursTotal(c)}시간` : '아직 없어요',
    att: ns && nr ? (n.day ? `${n.checked} / ${n.total}일 체크` : `${n.checked} / ${nr} 수업 체크`) : '학생·일정이 먼저예요',
    obs: !ns ? '학생이 먼저예요' : n.obsLeft ? `입력 필요 ${n.obsLeft}명` : `${ns}명 다 씀`,
    report: !n.written ? '아직 안 씀' : n.written < n.nSec ? `${n.written} / ${n.nSec}칸 씀` : `${n.nSec}칸`,
    docs: `${ready} / ${DOC_IDS.length} 준비됨`
  };
  const done = {
    info: ns > 0, sched: nr > 0, att: ns > 0 && nr > 0 && n.checked === n.total, obs: ns > 0 && !n.obsLeft,
    report: n.nSec > 0 && n.written === n.nSec, docs: ready === DOC_IDS.length
  };
  return STEPS.map(([id, label]) => ({ id, label, line: line[id], done: done[id] }));
}
