/* 학습 결손 찾기 (스펙 2026-11-13-gap-evidence §2-1, 화면 없음 — Node 시험에서도 씀).
   다 채점한 단원평가를 모아 학생 번호마다 영역(문항의 domain, 「영역·영역」이면 두 영역 모두)별 점수율을 셈.
   영역이 없는 평가는 그 평가 총점을 「평가 이름」(회차 뺌 — 같은 단원 재평가는 한 영역) 한 영역으로.
   결석(채점 안 함)·아직 채점하지 않은 학생은 뺌(graded). 교과가 다르면 이름이 같은 영역도 따로.
   areaPct: 한 평가에서 한 학생의 영역 점수율 — 기초학력 사후 점수(camp-growth.js)가 씀 */
import { graded, makeTitle } from './unit-model.js';
import { studentTotal } from './unit-grade.js';

export const GAP_CUT = 60;
/* 기준 칸: 40~90(정수), 숫자가 아니면 60 */
export function normCut(v) {
  const n = typeof v === 'string' ? (v.trim() ? Number(v) : NaN) : Number(v);
  return Number.isFinite(n) && v !== null ? Math.min(90, Math.max(40, Math.round(n))) : GAP_CUT;
}
const doms = it => [...new Set(String((it && it.domain) || '').split('·').map(s => s.trim()).filter(Boolean))];
const flat = s => String(s || '').replace(/\s+/g, '');
/* 점수율: 소수 한 자리(59.5%가 60%로 보여 기준 아래인데 빠져 보이지 않게). 기준과는 반올림 전 값으로 견줌 */
const pctOf = (got, full) => Math.round(got / full * 1000) / 10;
/* 예시(「예시로 채우기」) 평가는 셈에서 뺌 — 진짜 학생의 결손·사후 점수가 되지 않게 */
const okTest = t => t && t.key && Array.isArray(t.key.items) && Array.isArray(t.students) && t.meta && !t.meta.sample;
const hasDomains = t => t.key.items.some(it => doms(it).length > 0);
/* 영역이 없는 평가의 영역 이름: 평가 이름에서 회차·(예시)를 뺌 */
export const areaTitle = meta => makeTitle({ ...(meta || {}), round: null, sample: false });

/* 한 평가에서 한 학생(채점한 학생 s)의 영역마다 { subject, name, got, full } */
function areasOf(t, s) {
  const subject = String(t.meta.subject || '').trim();
  if (!hasDomains(t)) {
    const tot = studentTotal(t, s);
    return tot.total ? [{ subject, name: areaTitle(t.meta), got: tot.score, full: tot.total, byTitle: true }] : [];
  }
  const m = new Map();
  for (const it of t.key.items) {
    const full = Number(it.points) || 0;
    if (!full) continue;
    const got = Number(s.items && s.items[it.no] && s.items[it.no].pts) || 0;
    for (const d of doms(it)) {
      const v = m.get(flat(d)) || { subject, name: d, got: 0, full: 0 };
      v.got += got; v.full += full; m.set(flat(d), v);
    }
  }
  return [...m.values()];
}

/* → [{ no, areas: [{ name, subject, pct, tests: [평가 id] }](기준 아래만, 낮은 차례), worst(가장 낮은 점수율), n(본 평가 수) }], 번호 차례 */
export function gapStudents(tests, { cut } = {}) {
  const c = normCut(cut), by = new Map();
  // 날짜 차례로 모음(영역마다 평가 id도 본 차례로)
  const ts = (tests || []).filter(okTest).map((t, i) => [t, i]).sort((a, b) => String(a[0].meta.date || '').localeCompare(String(b[0].meta.date || '')) || a[1] - b[1]).map(x => x[0]);
  for (const t of ts) {
    for (const s of graded(t)) {
      const list = areasOf(t, s);
      if (!list.length) continue;
      const b = by.get(s.no) || { no: s.no, tests: new Set(), areas: new Map() };
      b.tests.add(t.id);
      for (const a of list) {
        const k = `${flat(a.subject)}\u0000${flat(a.name)}`, v = b.areas.get(k) || { subject: a.subject, name: a.name, got: 0, full: 0, tests: [], byTitle: !!a.byTitle };
        v.got += a.got; v.full += a.full;
        if (!v.tests.includes(t.id)) v.tests.push(t.id);
        b.areas.set(k, v);
      }
      by.set(s.no, b);
    }
  }
  const out = [];
  for (const b of by.values()) {
    const low = [...b.areas.values()].filter(a => a.full > 0 && a.got / a.full * 100 < c).map(a => ({ name: a.name, subject: a.subject, pct: pctOf(a.got, a.full), tests: a.tests, ...(a.byTitle ? { byTitle: true } : {}) }))
      .sort((x, y) => x.pct - y.pct || x.subject.localeCompare(y.subject, 'ko') || x.name.localeCompare(y.name, 'ko'));
    if (low.length) out.push({ no: b.no, areas: low, worst: low[0].pct, n: b.tests.size });
  }
  return out.sort((a, b) => a.no - b.no);
}

/* 한 평가에서 학생 번호 no의 영역(area) 점수율(정수 %). 「수와 연산·도형」처럼 여러 영역이면 그 영역 문항을 모두 합쳐 셈(한 문항은 한 번).
   영역이 없는 평가는 평가 이름(회차 뺌)이 같을 때 그 평가 총점. 그 학생·영역이 없으면 null */
export function areaPct(t, no, area) {
  const want = String(area || '').trim();
  if (!want || !okTest(t)) return null;
  const s = graded(t).find(x => x.no === no);
  if (!s) return null;
  if (!hasDomains(t)) {
    if (flat(areaTitle(t.meta)) !== flat(want)) return null;
    const tot = studentTotal(t, s);
    return tot.total ? pctOf(tot.score, tot.total) : null;
  }
  const names = new Set(want.split('·').map(flat).filter(Boolean)); // 문항 영역(doms)과 같은 규칙 — 「자료/가능성」은 한 영역
  let got = 0, full = 0;
  for (const it of t.key.items) {
    if (!doms(it).some(d => names.has(flat(d)))) continue;
    const f = Number(it.points) || 0;
    full += f; got += f ? Number(s.items && s.items[it.no] && s.items[it.no].pts) || 0 : 0;
  }
  return full ? pctOf(got, full) : null;
}
