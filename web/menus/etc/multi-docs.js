/* 기타 › 다면평가 문서 (화면 없음 — Node 시험에서도 씀) — 넣은 학교 기준의 항목·칸 그대로 새로 만든 문서 꼴 { title, blocks } → core/doc-export.js(한글·워드·PDF).
   합친 칸 없는 단순 표: 정량은 지표마다 한 줄(항목 이름·점수·비고는 항목 첫 줄에만, 소계는 묶음 첫 줄에만), 정성은 교사 자기실적평가서(별지 서식 꼴). 빈 칸은 빈칸 */
import { tierOf, itemScore, groupScore, totalScore, fmtPts, isDefaultQuant, toNum } from './multi-quant.js';
import { normReport } from './multi-qual.js';
import { periodText, periodLong, qualParsed } from './multi-model.js';

export const QUANT_HEAD = ['평가요소', '평가지표', '배점', '확인(○)', '점수', '소계', '비고(실적 증빙자료)'];
export const QUAL_TITLE = '교사 자기실적평가서';
export const PLEDGE = '상기 내용이 틀림없음을 확인하여 제출합니다.';
export const SIGN = '\n\n';
const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const pad = n => String(n).padStart(2, '0');
const tidy = s => str(s).replace(/\s+/g, ' ').trim();
const dateLine = today => { const [y, m, d] = str(today).split('-').map(Number); return y ? `${y}년 ${m}월 ${d}일` : ''; };
const LETTERS = '가나다라마바사아자차카타파하';
const ptsText = n => (n == null ? '' : `${fmtPts(n)}점`);

/* 제목: 기준 제목(예시 기준은 「— 예시」를 빼고), 학년도가 없으면 앞에 학년도 */
export function quantTitle(m, year) {
  const c = m.quant.criteria;
  const t = tidy(str(c && c.title).replace(/\s*[—-]\s*예시\s*$/, '')) || '교사 다면평가 기준(정량평가)';
  return /\d{4}\s*학년도/.test(t) || !year ? t : `${year}학년도 ${t}`;
}
/* 비고 칸: 근거자료 비고(선생님이 고친 글) + 감점 줄 */
function noteOf(m, it) {
  const lines = [str(m.quant.notes[it.id]).trim()].filter(Boolean);
  const e = m.quant.values[it.id] || {}, n = toNum(e.deduct);
  if (it.deduct && n > 0) lines.push(`※ ${it.deduct.label || '감점'} ${fmtPts(n)}${it.deduct.unit} 감점(−${fmtPts(n * it.deduct.per)}점)`);
  return lines.join('\n');
}
export function quantRows(m) {
  const c = m.quant.criteria, v = m.quant.values, short = !!m.info.short, rows = [];
  for (const g of c.groups) {
    const gs = groupScore(g, v, short);
    g.items.forEach((it, ii) => {
      const e = v[it.id] || {}, t = tierOf(it, it.kind === 'count' ? e.count : e.v, short), s = itemScore(it, e, short);
      it.tiers.forEach((tier, ti) => {
        const first = ti === 0;
        const mark = it.kind === 'count' ? (first && toNum(e.count) != null ? `${fmtPts(toNum(e.count))}${it.unit || '회'}` : '') : t && t.index === ti ? '○' : '';
        rows.push([
          first ? [ii === 0 ? `${g.name}${g.max != null ? ` (${fmtPts(g.max)}점)` : ''}` : '', `${it.name}${it.max != null ? ` (${fmtPts(it.max)}점)` : ''}`].filter(Boolean).join('\n') : '',
          `•${tier.label}`, ptsText(tier.points), mark, first ? fmtPts(s) : '', first && ii === 0 ? fmtPts(gs) : '', first ? noteOf(m, it) : '']);
      });
    });
  }
  return rows;
}
/* 정량 문서: 제목 · 평가 기간 · 표(+ 총 계) · ※ 안내 · 다짐 · 날짜 · 작성자 · 「… 귀하」 · 확인 표 */
export function quantDoc(m, { year, today } = {}) {
  const c = m.quant.criteria, i = m.info, f = c.footer || {};
  const total = totalScore(c, m.quant.values, !!i.short);
  const checks = f.checks && f.checks.length ? f.checks : ['1차', '2차', '최종'];
  return {
    title: quantTitle(m, year),
    blocks: [
      { type: 'p', text: `평가 기간 : ${periodText(i, isDefaultQuant(c) ? null : c, year)}` },
      { type: 'table', head: true, widths: [2.4, 3.6, 0.9, 0.9, 0.8, 0.8, 3], rows: [QUANT_HEAD, ...quantRows(m), ['총 계', '', ptsText(c.total), '', total == null ? '(     )점' : `( ${fmtPts(total)} )점`, '', '']] },
      ...(c.notes || []).map(text => ({ type: 'small', text })),
      { type: 'p', text: f.pledge || PLEDGE },
      { type: 'c', text: dateLine(today) },
      { type: 'p', text: `작성자 : ${tidy(`${i.position || '교사'} ${i.name || '         '}`)} (서명)` },
      { type: 'p', text: tidy(`${i.school} ${f.to || '다면평가관리위원장 귀하'}`) },
      { type: 'table', head: true, rows: [['확인', ...checks], ['', ...checks.map(() => SIGN)]] }
    ]
  };
}

/* 정성 문서: 교사 자기실적평가서 — 1. 평가 지침 · 2. 평가 기간 · 3. 평가자 인적사항 · 4. 기초 자료 · 5. 자기실적 평가 · 자기 평가 종합(○) · 작성일·서명·확인자 */
export function qualDoc(m, { year, today } = {}) {
  const p = qualParsed(m), i = m.info;
  const r = m.qual.report || normReport(null, p);
  const blocks = [
    { type: 'small', text: '▪교육공무원 승진 규정 【별지 제3호의2 서식】' },
    { type: 'h', text: '1. 평가 지침' }, { type: 'p', text: p.guide },
    { type: 'h', text: '2. 평가 기간' }, { type: 'p', text: periodLong(i, year) },
    { type: 'h', text: '3. 평가자 인적사항' }, { type: 'table', head: true, rows: [['소속', '직위', '성명'], [i.school, i.position, i.name]] },
    { type: 'h', text: '4. 평가자 기초 자료' }, { type: 'table', widths: [2, 3], rows: p.basics.map(b => [b, str(r.basics[b])]) },
    { type: 'h', text: '5. 자기실적 평가' }
  ];
  r.sections.forEach((s, k) => {
    blocks.push({ type: 'p', bold: true, text: `${LETTERS[k] || k + 1}. ${s.name}` });
    for (const part of s.parts) {
      blocks.push({ type: 'p', text: `◦ ${/^추진/.test(part.name) ? `${s.name} ${part.name}` : part.name}` });
      const items = part.items.map(tidy).filter(Boolean);
      blocks.push({ type: 'p', text: items.length ? items.map(x => `- ${x}`).join('\n') : '- ' });
    }
  });
  blocks.push({ type: 'p', text: '※ 자기 평가 종합 상황(해당란에 ○표)' },
    { type: 'table', head: true, widths: [1.4, 4, 0.9, 0.9, 0.9], rows: [['구분', '평가 내용', '만족', '보통', '미흡'], ...p.self.map(s => [s.name, s.desc, ...['만족', '보통', '미흡'].map(l => (r.self[s.name] === l ? '○' : ''))])] },
    { type: 'c', text: dateLine(today) },
    { type: 'p', text: `작성자(본인) 성명 ${i.name || '          '} 서명(인)` },
    { type: 'p', text: '◇ 확인자(직근상급자) : 직위          성명          서명(인)' });
  return { title: QUAL_TITLE, blocks };
}
export const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
