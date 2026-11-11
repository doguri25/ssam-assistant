/* 기타 › 다면평가 정량평가 (화면 없음 — Node 시험에서도 씀). 스펙: docs/superpowers/specs/2026-11-11-multi-eval-design.md
   학교 기준 양식 글(core/files.js readText — 표 칸은 ` | `, 줄은 줄바꿈)을 규칙으로 읽어 기준 모양으로, 항목마다 넣은 값으로 점수·소계·총점.
   기준 = { title, period, total, groups: [{ id, name, max, items: [{ id, name, max, kind: 'range'|'choice'|'count', unit, per, guide,
     tiers: [{ label, min, minInc, max, maxInc, points, short }], deduct: null | { per, unit, label } }] }], notes, footer: { pledge, to, checks } }
   값 = { [항목 id]: { v(range는 수, choice는 지표 차례), count(count), deduct(감점 단위 수) } } */

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);
const round2 = n => Math.round(n * 100) / 100;
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const tidy = s => str(s).replace(/[ \t]/g, ' ').replace(/\s+/g, ' ').trim();
/* 「22.8」「22.8시간」「2점」 → 수, 아니면 null */
export function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /^\s*(-?\d+(?:\.\d+)?)/.exec(str(v));
  return m ? +m[1] : null;
}
/* 점수 글: 24.4 → 「24.4」, 25 → 「25」, 없으면 '' */
export const fmtPts = n => (n == null || !Number.isFinite(n) ? '' : String(round2(n)));
export const allItems = c => (c && Array.isArray(c.groups) ? c.groups.flatMap(g => g.items) : []);

/* ---------- 지표 글 읽기 ---------- */
const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(시간|시수|차시|개월|건|회|일|년|명|개|점|%)?';
const LO = new RegExp(`${NUM}\\s*${UNIT}\\s*(이상|초과)`);
const HI = new RegExp(`${NUM}\\s*${UNIT}\\s*(미만|이하)`);
const SPAN = new RegExp(`${NUM}\\s*${UNIT}\\s*[~～∼〜–-]\\s*${NUM}\\s*${UNIT}`);
const SHORT = /\(\s*\d+\s*개월\s*이하\s*(\d+(?:\.\d+)?)\s*점\s*\)/;
const PER = /(회|건|번)\s*당\s*(\d+(?:\.\d+)?)\s*점/;
/* 지표 글 + 점수 → { label, min, minInc, max, maxInc, points, short, unit, per }.
   「(6개월 이하 n점)」은 short, 「회당 n점」은 per(횟수), 그 밖의 괄호 글은 범위로 읽지 않음 */
export function parseTier(label, points) {
  const t = tidy(label);
  const sm = SHORT.exec(t), pm = PER.exec(t);
  const rest = t.replace(SHORT, ' ').replace(/\([^)]*\)/g, ' ');
  let min = null, minInc = false, max = null, maxInc = false, unit = '';
  const lo = LO.exec(rest), hi = HI.exec(rest);
  if (lo) { min = +lo[1]; minInc = lo[3] === '이상'; unit = lo[2] || ''; }
  if (hi) { max = +hi[1]; maxInc = hi[3] === '이하'; unit = unit || hi[2] || ''; }
  if (!lo && !hi) { const sp = SPAN.exec(rest); if (sp) { min = +sp[1]; minInc = true; max = +sp[3]; maxInc = true; unit = sp[2] || sp[4] || ''; } }
  return { label: t, min, minInc, max, maxInc, points: toNum(points), short: sm ? +sm[1] : null, unit, per: pm ? +pm[2] : null, perUnit: pm ? (pm[1] === '번' ? '회' : pm[1]) : '' };
}

/* 비고 글의 감점 규칙: 「※ 수업일 휴직 기간은 월 0.2씩 감점」 → { per: 0.2, unit: '개월', label: '수업일 휴직 기간' } */
const DEDUCT = /(월|회당|건당|일당)\s*(\d+(?:\.\d+)?)\s*점?\s*씩?\s*감점/;
const DEDUCT_UNIT = { 월: '개월', 회당: '회', 건당: '건', 일당: '일' };
export function parseDeduct(guide) {
  const g = str(guide), m = DEDUCT.exec(g);
  if (!m) return null;
  const label = (g.slice(0, m.index).split(/※|\n/).pop() || '').replace(/^.*\)\s+/, '').replace(/\s*(?:은|는|이|가)\s*$/, '').trim();
  return { per: +m[2], unit: DEDUCT_UNIT[m[1]], label: label.slice(0, 40) };
}

/* 항목을 지표 글에서 다시 읽음: kind(회당 → count, 모든 지표에 범위 → range, 나머지 choice)·단위·감점·최대.
   trust: 저장한 기준·AI 답의 kind/per/short/범위를 글에서 못 읽었을 때 그대로 둠(고친 기준은 글만 봄) */
export function deriveItem(it, { trust = false } = {}) {
  const src = arr(it.tiers);
  const tiers = src.map(t => {
    const p = parseTier(t.label, t.points);
    if (trust) {
      if (p.short == null && toNum(t.short) != null) p.short = toNum(t.short);
      if (p.min == null && p.max == null && (toNum(t.min) != null || toNum(t.max) != null)) {
        p.min = toNum(t.min); p.max = toNum(t.max); p.minInc = p.min != null && t.minInc !== false; p.maxInc = !!t.maxInc && p.max != null;
      }
    }
    return p;
  });
  let per = (tiers.find(t => t.per != null) || {}).per ?? null;
  let kind = per != null ? 'count' : tiers.length && tiers.every(t => t.min != null || t.max != null) ? 'range' : 'choice';
  if (trust && kind !== 'count' && it.kind === 'count' && toNum(it.per) > 0) { kind = 'count'; per = toNum(it.per); }
  const unit = kind === 'count' ? (/^(회|건)$/.test(str(it.unit)) ? it.unit : (tiers.find(t => t.perUnit) || {}).perUnit || '회')
    : kind === 'range' ? (tiers.find(t => t.unit) || {}).unit || tidy(it.unit).slice(0, 6) : '';
  const guide = str(it.guide).trim().slice(0, 500);
  let deduct = parseDeduct(guide);
  if (!deduct && trust && isObj(it.deduct) && toNum(it.deduct.per) > 0) deduct = { per: toNum(it.deduct.per), unit: tidy(it.deduct.unit).slice(0, 6) || '개월', label: tidy(it.deduct.label).slice(0, 40) };
  const ptsList = tiers.map(t => t.points).filter(n => n != null);
  const max = toNum(it.max) ?? (kind === 'count' ? (tiers[0] || {}).points ?? null : ptsList.length ? Math.max(...ptsList) : null);
  return {
    id: it.id, name: tidy(it.name), max, kind, unit, per: kind === 'count' ? per : null, guide,
    tiers: tiers.map(({ label, min, minInc, max: mx, maxInc, points, short }) => ({ label, min, minInc, max: mx, maxInc, points, short })),
    deduct
  };
}

/* ---------- 기준 양식 글 읽기 ---------- */
const GROUP = /^([가나다라마바사아자차카타파하])\s*[.．)]\s*(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*점\s*\)\s*$/;
const ITEM = /^(.*?)\s*\(\s*(\d+(?:\.\d+)?)\s*점\s*\)\s*$/;
const POINTS = /^(\d+(?:\.\d+)?)\s*점$/;
const BULLET = /^[•·∙●◦○▪*-]/;
const flat = s => str(s).replace(/\s/g, '');
const splitCells = line => line.split(/\s*\|\s*/).map(c => tidy(c));
const isHeader = cells => cells.some(c => /^(?:평가지표|평가요소|배점|평가사항)$/.test(flat(c)));
const firstCell = cells => cells.find(Boolean) || '';
const isTotal = cells => /^(?:총계|합계|총점|계)$/.test(flat(firstCell(cells))) && cells.filter(Boolean).length >= 2;
/* 「•학생 교육감 이상 수상 •학교 표창 교육감 이상」 → 지표 하나 「학생 교육감 이상 수상 / 학교 표창 교육감 이상」 */
const cleanLabel = s => tidy(s).replace(/^[\s•·∙●◦▪*-]+/, '').split(/\s*[•∙●◦▪]\s*/).map(x => x.trim()).filter(Boolean).join(' / ');
/* 지표 점수 칸: 「25점」(처음 것), 없으면 • 칸 바로 뒤의 수 */
function pointsAt(cells) {
  for (let k = 1; k < cells.length; k++) if (POINTS.test(cells[k]) && cells[k - 1]) return k;
  for (let k = 1; k < cells.length; k++) if (/^\d+(?:\.\d+)?$/.test(cells[k]) && BULLET.test(cells[k - 1])) return k;
  return -1;
}
/* 「…위원장 귀하」 앞의 학교 이름은 뺌 */
function toLine(line) {
  const w = tidy(line).split(' '), k = w.findIndex(x => /위원|교장|귀하/.test(x));
  return w.slice(Math.max(0, k)).join(' ');
}

/* 학교 기준 글 → 기준, 못 읽으면 null(묶음 1개·항목 2개 미만). 첫 표만 읽고 「총 계」 뒤의 안내·다짐·귀하·확인 칸까지, 이어지는 작성 예시는 버림 */
export function parseQuantText(text) {
  const lines = str(text).replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  let title = '', period = '', total = null, tail = false, g = null, it = null, n = 0;
  const groups = [], notes = [], footer = { pledge: '', to: '', checks: [] };
  const newGroup = (name, max) => { g = { id: `g${groups.length + 1}`, name, max, items: [] }; groups.push(g); it = null; };
  const newItem = cell => {
    const m = ITEM.exec(cell);
    if (!g) newGroup('가. 평가', null);
    it = { id: `q${++n}`, name: m ? m[1] : cell, max: m ? +m[2] : null, unit: '', guide: '', tiers: [] };
    g.items.push(it);
  };
  const addGuide = s => { const t = tidy(s); if (it && t) it.guide = it.guide ? `${it.guide}\n${t}` : t; };
  for (const line of lines) {
    const cells = splitCells(line);
    const again = groups.length && (flat(line) === flat(title) || isHeader(cells) || /^평가\s*기간/.test(line));
    if (tail) {
      if (again || isTotal(cells)) break; // 작성 예시가 이어짐
      if (/^※/.test(line)) notes.push(tidy(line));
      else if (/틀림없|확인하여\s*제출|제출합니다/.test(line)) footer.pledge = tidy(line);
      else if (/귀하\s*$/.test(line)) footer.to = toLine(line);
      else if (cells.length >= 2 && /^(?:확인|결재)$/.test(flat(cells[0]))) footer.checks = cells.slice(1).filter(Boolean);
      continue;
    }
    if (again) break;
    if (isTotal(cells)) { total = toNum(cells.slice(1).find(c => POINTS.test(c))); tail = true; continue; }
    if (!groups.length) {
      const pm = /평가\s*기간\s*[:：]?\s*(.+)$/.exec(line);
      if (pm) { period = tidy(pm[1].replace(/【[^】]*】/g, ' ')); continue; }
      if (!title && !line.includes('|') && /평가|기준/.test(line)) { title = tidy(line); continue; }
    }
    if (isHeader(cells)) continue;
    const p = pointsAt(cells);
    if (p < 1) {
      const gc = cells.find(c => GROUP.test(c));
      if (gc) { const m = GROUP.exec(gc); newGroup(`${m[1]}. ${m[2]}`, +m[3]); }
      else if (it && !line.includes('|')) addGuide(line); // 칸 속 줄바꿈으로 나뉜 비고 글
      continue;
    }
    let gi = -1;
    for (let k = p - 2; k >= 0; k--) if (GROUP.test(cells[k])) { gi = k; break; }
    if (gi >= 0) { const m = GROUP.exec(cells[gi]); newGroup(`${m[1]}. ${m[2]}`, +m[3]); }
    const ic = p >= 2 && p - 2 !== gi ? cells[p - 2] : '';
    if (ic && !BULLET.test(ic)) newItem(ic);
    else if (!it) { if (!g) continue; newItem(`${g.name.replace(/^[가-힣]\.\s*/, '')} (${g.max ?? ''}점)`); }
    const label = cleanLabel(cells[p - 1]);
    if (!label) continue;
    it.tiers.push({ label, points: toNum(cells[p]) });
    for (const c of cells.slice(p + 1)) {
      if (!c || /^[○◯O]$/.test(c) || /^\d+(?:\.\d+)?$/.test(c) || POINTS.test(c)) continue;
      if (/^(?:회|건|번)$/.test(c)) { it.unit = c === '번' ? '회' : c; continue; }
      addGuide(c);
    }
  }
  const out = groups.map(x => ({ ...x, items: x.items.filter(i => i.tiers.length).map(i => deriveItem(i)) })).filter(x => x.items.length);
  if (!out.length || allItems({ groups: out }).length < 2) return null;
  for (const x of out) if (x.max == null) x.max = round2(x.items.reduce((s, i) => s + (i.max || 0), 0));
  return {
    title, period, total: total ?? round2(out.reduce((s, x) => s + (x.max || 0), 0)),
    groups: out, notes, footer: { pledge: footer.pledge, to: footer.to, checks: footer.checks }
  };
}

/* 저장한 기준·AI 답·고친 기준 → 기준(망가진 칸은 버림), 못 쓰면 null. trust: 글에서 못 읽은 kind/per/범위를 그대로 둠 */
export function normCriteria(v, { trust = true } = {}) {
  if (!isObj(v) || !Array.isArray(v.groups)) return null;
  const used = new Set();
  const idOf = (x, p) => { const s = typeof x === 'string' && /^[\w-]{1,40}$/.test(x) && !used.has(x) ? x : rid(p); used.add(s); return s; };
  const groups = v.groups.filter(isObj).map(g => {
    const items = arr(g.items).filter(isObj).map(it => {
      const tiers = arr(it.tiers).filter(isObj).map(t => ({ ...t, label: tidy(t.label).slice(0, 200), points: toNum(t.points) })).filter(t => t.label && t.points != null).slice(0, 20);
      if (!tiers.length) return null;
      return deriveItem({ ...it, id: idOf(it.id, 'q'), name: tidy(it.name).slice(0, 100) || '항목', tiers }, { trust });
    }).filter(Boolean).slice(0, 40);
    if (!items.length) return null;
    return { id: idOf(g.id, 'g'), name: tidy(g.name).slice(0, 60) || '묶음', max: toNum(g.max) ?? round2(items.reduce((s, i) => s + (i.max || 0), 0)), items };
  }).filter(Boolean).slice(0, 12);
  if (!groups.length) return null;
  const f = isObj(v.footer) ? v.footer : {};
  return {
    title: tidy(v.title).slice(0, 120), period: tidy(v.period).slice(0, 80),
    total: toNum(v.total) ?? round2(groups.reduce((s, g) => s + (g.max || 0), 0)), groups,
    notes: arr(v.notes).map(tidy).filter(Boolean).slice(0, 12),
    footer: { pledge: tidy(f.pledge).slice(0, 200), to: tidy(f.to).slice(0, 80), checks: arr(f.checks).map(tidy).filter(Boolean).slice(0, 6) }
  };
}

/* ---------- 예시 기준(학교 기준 양식을 넣기 전까지) ---------- */
const SAMPLE = `교사 다면평가 기준(정량평가) — 예시
구분 | 평가요소 | 평가지표 | 배점 | 비고(실적 증빙자료)
가. 학습지도 (30점) | 주당 수업시수 (25점) | •22시간 이상 | 25점 | 학교 교육과정 운영계획 ※ 수업일 휴직 기간은 월 0.2씩 감점
•20시간 이상 ~ 22시간 미만 | 24점
•20시간 미만 | 23점
수업 공개 횟수 (3점) | •동료장학 수업 유 | 3점 | 공문 기안(해당 일자 장학 수업)
•동료장학 수업 무 | 2점
수업 컨설팅 횟수 (2점) | •자발적 수업 공개 (컨설팅 의뢰, 회당 1점) | 2점 | 회 | 수업장학 증빙자료(공문, 수업안, 협의록 등)
나. 생활지도 (30점) | 학생·학부모 상담 실적 (15점) | •10건 이상 | 15점 | 나이스 출력(상담기록)
•10건 미만 | 14점
생활지도 곤란도 (5점) | •통합학급, 비교과 (6개월 이하 4.5점) | 5점 | 업무분장 공문
•통합학급 무, 교과전담, 특수 (6개월 이하 3.5점) | 4점
학년 곤란도 (10점) | •1학년, 6학년, 비교과 (6개월 이하 9.5점) | 10점
•2·3·4·5학년, 특수 (6개월 이하 8.5점) | 9점
•교과전담 | 8점
다. 전문성계발 (10점) | 직무연수 이수 (7점) | •90시간 이상 | 7점 | 나이스 연수 실적
•75시간～89시간 | 6점
•60시간～74시간 | 5점
•60시간 미만 | 4점
전문적학습공동체 참여 실적 (3점) | •학습공동체 소속 유 | 3점 | 운영 계획 공문(명단 포함)
•학습공동체 소속 무 | 1점
라. 담당업무 (30점) | 업무 곤란도 (25점) | •교무부장, 비교과 | 25점 | 업무분장 공문
•연구부장 | 23점
•보직교사 | 18점
•일반 업무 담당자 (6개월 이하 8점) | 9점
학교 공헌도 (3점) | •업무 추진 주무자 (공모·선도학교 등, 회당 1점) | 3점 | 회 | 계획·보고서 제출 시 인정
학생 지도 실적 (2점) | •학생 교육감 이상 수상 •학교 표창 교육감 이상 | 2점 | 상장·표창장
•학생 교육장상 수상 •학교 표창 교육장상 수상 | 1점
총 계 | 100점
※ 동점자 처리 기준 : 담당업무 → 학습지도 → 생활지도 → 전문성 계발 → 교육경력이 많은 순으로 한다.
※ 각종 증빙자료는 교사 다면평가 기간에 제출한 것만 인정한다.
상기 내용이 틀림없음을 확인하여 제출합니다.
다면평가관리위원장 귀하
확인 | 1차 | 2차 | 최종`;
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
export const DEFAULT_QUANT = deepFreeze(parseQuantText(SAMPLE));
export const defaultQuant = () => JSON.parse(JSON.stringify(DEFAULT_QUANT));
export const isDefaultQuant = c => !!c && c.title === DEFAULT_QUANT.title;

/* ---------- 점수 ---------- */
const inRange = (t, x) => (t.min == null || (t.minInc ? x >= t.min : x > t.min)) && (t.max == null || (t.maxInc ? x <= t.max : x < t.max)) && (t.min != null || t.max != null);
/* 값이 든 지표 → { index, tier, points } 또는 null. range: 위 지표 먼저, 어느 범위에도 없으면(89와 90 사이 등) 아래 끝이 가장 높은 지표.
   choice: v는 지표 차례. count: 첫 지표, points = min(횟수 × 회당, 최대). short(근무 6개월 이하)면 short 점수가 있는 지표는 그 점수 */
export function tierOf(item, value, short = false) {
  const tiers = (item && item.tiers) || [];
  const pts = t => (short && t.short != null ? t.short : t.points);
  if (item.kind === 'count') {
    const c = toNum(value), t = tiers[0];
    if (c == null || c < 0 || !t) return null;
    return { index: 0, tier: t, points: round2(Math.min(c * (item.per || 0), t.points ?? item.max ?? 0)) };
  }
  if (item.kind === 'choice') {
    const s = str(value).trim();
    if (!/^\d+$/.test(s) || !tiers[+s]) return null;
    return { index: +s, tier: tiers[+s], points: pts(tiers[+s]) };
  }
  const x = toNum(value);
  if (x == null) return null;
  let i = tiers.findIndex(t => inRange(t, x));
  if (i < 0) {
    let best = -1;
    tiers.forEach((t, k) => { if (t.min != null && t.min <= x && (best < 0 || t.min > tiers[best].min)) best = k; });
    i = best;
  }
  return i < 0 ? null : { index: i, tier: tiers[i], points: pts(tiers[i]) };
}
/* 항목 점수: 지표 점수 − 감점(0 아래로는 안 내려감, 항목 최대까지), 값이 없으면 null(빈칸) */
export function itemScore(item, entry, short = false) {
  const e = isObj(entry) ? entry : {};
  const t = tierOf(item, item.kind === 'count' ? e.count : e.v, short);
  if (!t || t.points == null) return null;
  const d = item.deduct && toNum(e.deduct) > 0 ? toNum(e.deduct) * item.deduct.per : 0;
  let s = Math.max(0, t.points - d);
  if (item.max != null) s = Math.min(s, item.max);
  return round2(s);
}
/* 묶음 소계(묶음 최대를 넘지 않음), 하나도 안 넣었으면 null */
export function groupScore(group, values = {}, short = false) {
  const ss = group.items.map(i => itemScore(i, values[i.id], short)).filter(s => s != null);
  if (!ss.length) return null;
  const sum = ss.reduce((a, b) => a + b, 0);
  return round2(group.max != null ? Math.min(sum, group.max) : sum);
}
export function totalScore(criteria, values = {}, short = false) {
  const ss = (criteria ? criteria.groups : []).map(g => groupScore(g, values, short)).filter(s => s != null);
  return ss.length ? round2(ss.reduce((a, b) => a + b, 0)) : null;
}
