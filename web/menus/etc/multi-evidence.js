/* 기타 › 다면평가 근거자료 (화면 없음 — Node 시험에서도 씀). 항목마다 넣은 공문·이수증 PDF·사진·한글 파일은 이 기기(IndexedDB forms('multi'))에만,
   비고 칸에는 「문서 제목 [번호, 날짜.]」: 규칙으로 글에서 찾고(evidenceLabel), 모자라면 화면이 AI(plan)에 묻고, 그래도 없으면 파일 이름 */

const str = v => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const tidy = s => str(s).replace(/[ \t]/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n).trim() + '…' : s);
const pad = n => String(n).padStart(2, '0');

export const MAX_EVIDENCE = 5 * 1024 * 1024;
export const EVIDENCE_ACCEPT = '.pdf,.hwp,.hwpx,.docx,.png,.jpg,.jpeg,.webp,.heic,.heif';
const OK_EXT = /\.(pdf|hwp|hwpx|docx|png|jpe?g|webp|heic|heif)$/i;
export const isImageName = n => /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/i.test(str(n));
export const fileBase = n => str(n).replace(/\.[^.]+$/, '').trim();
/* 넣을 수 있는 파일이면 '', 아니면 'type'(형식) · 'size'(5MB 넘음) */
export function okEvidenceFile(f) {
  if (!f || !OK_EXT.test(str(f.name))) return 'type';
  return (f.size || 0) > MAX_EVIDENCE ? 'size' : '';
}

const DATE = /(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?!\d)/g;
/* 글의 첫 날짜(달·날이 맞는 것) → 「2025.07.22.」, 없으면 '' */
function firstDate(s) {
  for (const m of str(s).matchAll(DATE)) {
    const mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${m[1]}.${pad(mo)}.${pad(d)}.`;
  }
  return '';
}
const DOC_NO = /[가-힣A-Za-z]{2,}\s*[-‐–]\s*(\d{1,6})(?!\d)/;

/* 글·파일 이름 → { title, no, date, label }: 제목은 「제목」 줄, 번호는 시행 줄의 「○○학교-1234」 → 「[1234,」 → 「제1234호」 → 다른 「○○-1234」,
   날짜는 시행 줄 → 「[1234, 날짜]」 → 글의 첫 날짜. 모자라면 있는 것만, 제목이 없으면 파일 이름 */
export function evidenceLabel(text, fileName) {
  const t = str(text).replace(/\r\n?/g, '\n');
  const lines = t.split('\n').map(l => l.replace(/\s*\|\s*/g, ' | ').trim());
  let title = '';
  for (const l of lines) {
    const m = /^제\s*목(?:\s*[:：|]\s*|\s+)(.+)$/.exec(l);
    if (m) { title = clip(tidy(m[1].split(' | ')[0]), 80); if (title) break; }
  }
  const run = lines.find(l => /^시\s*행(?:\s|[:：|])/.test(l)) || '';
  const bracket = /\[\s*(\d{1,6})\s*,\s*([^\]]*)\]/.exec(t);
  let no = '';
  const rm = DOC_NO.exec(run);
  if (rm) no = rm[1];
  else if (bracket) no = bracket[1];
  else { const h = /제\s*(\d{1,6})\s*호/.exec(t); if (h) no = h[1]; else { const o = DOC_NO.exec(t.replace(/20\d{2}\s*-\s*\d/g, ' ')); if (o) no = o[1]; } }
  const date = firstDate(run) || (bracket ? firstDate(bracket[2]) : '') || firstDate(t);
  const r = { title, no, date };
  return { ...r, label: composeLabel(r, fileName) };
}
/* { title, no, date } → 「제목 [번호, 날짜.]」(있는 것만), 제목이 없으면 파일 이름(확장자 뺌) */
export function composeLabel(r, fileName) {
  const o = r || {};
  const base = tidy(o.title) || fileBase(fileName) || '근거자료';
  const tag = [tidy(o.no), tidy(o.date)].filter(Boolean).join(', ');
  return tag ? `${base} [${tag}]` : base;
}
export const isComplete = r => !!(r && tidy(r.title) && tidy(r.no) && tidy(r.date));
/* 항목 비고 칸 글: 근거자료 라벨마다 「• 」 줄 */
export const notesText = list => (Array.isArray(list) ? list : []).map(e => tidy(e && e.label)).filter(Boolean).map(l => `• ${l}`).join('\n');
