/* 평가지 채점(수행평가)이 참고할 단원평가·활동지 (활동지 스펙 4.8): 그 평가 영역에 이어 둔 것 목록과, 학생 한 명의 참고 줄(번호만).
   기존 평가 화면(evaluate.js)은 window.SSAM.evalRefs로 씀 */
import { linkedTo, getActivity } from '../menus/evaluate/activity/activity-model.js';
import { LEVEL } from '../menus/evaluate/activity/activity-ai.js';
import { unitLinkedTo, getTest, graded, makeTitle } from '../menus/evaluate/unit/unit-model.js';
import { studentTotal } from '../menus/evaluate/unit/unit-grade.js';
import { planUnits } from './eval-link.js';

/* unit: 평가계획 영역 { id, subject, label } → [{ kind: 'unit'|'activity', id, title, date }] (날짜 늦은 것 먼저) */
export function linked(unit) {
  const link = { unitId: unit && unit.id, subject: unit && unit.subject, label: unit && unit.label, known: planUnits().map(u => u.id) };
  return [...linkedTo(link), ...unitLinkedTo(link)].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
/* 체크한 것(refs: [{ kind, id }])에서 그 번호 학생의 결과: 하나마다 한 줄 */
function refLines(refs, no) {
  const out = [];
  for (const r of refs || []) {
    if (r.kind === 'activity') {
      const a = getActivity(r.id), s = a && a.students.find(x => x.no === no && !x.skip && x.status === 'done');
      if (s) out.push(`활동지 「${clip(a.meta.title, 40)}」 ${LEVEL[s.level] || ''} · 잘한 점: ${clip(s.good, 160) || '-'} · 더 해 볼 점: ${clip(s.next, 120) || '-'}`);
    } else if (r.kind === 'unit') {
      const t = getTest(r.id), s = t && graded(t).find(x => x.no === no);
      if (!s) continue;
      const weak = t.key.items.filter(it => (Number(s.items && s.items[it.no] && s.items[it.no].pts) || 0) < (Number(it.points) || 0)).map(it => clip(it.content || `${it.no}번`, 30));
      out.push(`단원평가 「${clip(makeTitle(t.meta), 40)}」 ${studentTotal(t, s).pct}% · 잘한 점: ${clip(s.good, 160) || '-'} · 보완할 것: ${weak.slice(0, 5).join(', ') || '-'}`);
    }
  }
  return out;
}
/* 평어 요청의 「참고:」 한 줄(한 학생 600자까지) */
export const lines = (refs, no) => refLines(refs, no).join(' / ').slice(0, 600);
/* 근거가 보이는 평어(스펙 2026-11-13 §5-2): 참고한 것마다 근거 하나 { kind: 'ref', label }(80자로 줄이는 것은 core/evidence.js) */
export const items = (refs, no) => refLines(refs, no).map(label => ({ kind: 'ref', label }));
if (globalThis.window) { window.SSAM = window.SSAM || {}; window.SSAM.evalRefs = { linked, lines, items }; }
