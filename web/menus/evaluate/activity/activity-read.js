/* 활동지 머리 읽기(스펙 4.1): 교과·단원·차시·쪽·활동 이름, 그리고 학기. 못 찾으면 빈칸(선생님이 고침) */
import { stripNames, maskStaff } from '../../../core/privacy.js';
import { makeRedactor } from '../../../core/redact.js';

/* 넣은 활동지 글 다듬기: 주민번호 모양 줄은 빼고, 이름·전화번호가 적힌 줄(privacy.js)은 빼거나 가리고, 「이름: 김하늘」은 이름만 지움
   (「이름: 교사용」·빈 이름 칸은 그대로) → { text, cut(뺀 줄·가린 이름 수) } */
const RRN = /\d{6}\s*-\s*[1-4]\d{6}/;
const FILLED = /((?:이\s*름|성\s*명)\s*[:：]\s*)(?!교사용|학생용)[가-힣]{2,4}(?![가-힣])/g;
export function cleanSheet(text, { staff = true } = {}) {
  const src = String(text || '').split('\n');
  let named = 0;
  const kept = src.filter(l => !RRN.test(l)).map(l => l.replace(FILLED, (m, pre) => { named++; return pre.replace(/\s+$/, ''); }));
  const r = stripNames(kept.join('\n'));
  // 직함 앞뒤 교직원 이름(「남다율 선생님께」「강사: 탁보결」)도 — 쪽지·가정통신문·공문 처리·결과 보고가 이 글을 AI로 보냄
  // 활동지(staff: false)는 예전대로 — 「선생님 설명을」「선생님 도움을」을 이름으로 가리면 문항·정답 글이 바뀌어 채점 기준이 틀어짐
  const st = maskStaff(r.text, { colonOnly: !staff });
  let lines = r.dropped + (src.length - kept.length), names = r.masked + named + st.masked; // 뺀 줄 · 가린 이름
  if (!staff) return { text: st.text.trim(), cut: lines + names, lines, names };
  // 쪽지·가정통신문·공문 처리·결과 보고: 조사가 붙은 이름(「이바다에게」)·「이름(직함)」·맡은 일 쌍점 뒤(「사회: 한가람, 기록: 박솔빛」)·다른 줄에서 알게 된 이름도 —
  // 회의록·문서 다듬기 가리개(core/redact.js)와 같게. 원래 글로 이름을 먼저 배움(뺀 명단·전화번호 줄의 이름도 다른 줄에서 가림). 계좌 줄 등 가리개가 보내지 않는 줄은 뺌
  const rd = makeRedactor();
  rd.learn([kept.join('\n')]);
  // 부르는 쪽이 미리 넣은 자리 표시 {{n}}(가정통신문 번역 guard)는 가리개의 {{n}}과 섞이지 않게 잠시 바꿔 둠
  const hide = t => t.replace(/\{\{\s*(\d+)\s*\}\}/g, '\uE000$1\uE001'), show = t => t.replace(/\uE000(\d+)\uE001/g, '{{$1}}');
  const out = rd.lines(hide(st.text).split('\n'));
  const body = out.map(x => {
    if (!x) { lines++; return null; }
    return show(x.text.replace(/〔\s*이름\s*(\d+)\s*〕/g, (m, n) => { if (rd.names[+n - 1] !== '○○○') names++; return '○○○'; })
      .replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => rd.secrets[+n - 1] ?? ''));
  }).filter(x => x != null).join('\n');
  return { text: body.trim(), cut: lines + names, lines, names };
}

export const SUBJECTS = ['국어', '수학', '사회', '과학', '도덕', '영어', '음악', '미술', '체육', '실과', '바른 생활', '슬기로운 생활', '즐거운 생활'];
const SUBJ = new RegExp(`^(${SUBJECTS.join('|')})(?=\\s|\\d|$)`);
const EMPTY = () => ({ subject: '', unit: '', lesson: '', pages: '', title: '' });
const cellsOf = l => l.split('|').map(c => c.trim()).filter(Boolean);

export function readMeta(text) {
  const out = EMPTY();
  const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 8);
  if (!lines.length) return out;
  const all = lines.join('\n');
  // 「[과학] 3-2-4-03 제목 (50~51쪽)」: 학년-학기-단원-차시
  const sci = /\[([^\]]+)\]\s*\d+-\d+-(\d+)-(\d+)\s*(.+?)\s*\((\d+\s*[~\-]\s*\d+)\s*쪽\)/.exec(all);
  if (sci) {
    if (SUBJECTS.includes(sci[1].trim())) out.subject = sci[1].trim();
    out.unit = String(Number(sci[2])); out.lesson = String(Number(sci[3])); out.title = sci[4].trim(); out.pages = sci[5].replace(/\s/g, '') + '쪽';
  }
  if (!out.subject) for (const l of lines) {
    const hit = cellsOf(l).map(c => SUBJ.exec(c)).find(Boolean) || SUBJ.exec(l);
    if (hit) { out.subject = hit[1]; break; }
  }
  const ls = /\[(\d+(?:\s*~\s*\d+)?)\s*차시\]\s*([^(|\n]*)/.exec(all);
  if (ls && !out.lesson) { out.lesson = ls[1].replace(/\s/g, ''); if (!out.title) out.title = ls[2].trim(); }
  if (!out.unit) {
    const gt = /^(.+?)\s*>\s*\[/m.exec(all);
    const cell = lines.flatMap(cellsOf).find(c => /^\d+\.\s*\S/.test(c) && !/[.?]$/.test(c));
    const line = lines.slice(0, 3).find(l => /^\d+\.\s*[가-힣]/.test(l) && !/[.?]$/.test(l) && !l.includes('|'));
    out.unit = (gt && gt[1].trim()) || cell || line || '';
  }
  if (!out.pages) { const pg = /(\d+\s*[~\-]\s*\d+)\s*쪽/.exec(all); if (pg) out.pages = pg[1].replace(/\s/g, '') + '쪽'; }
  return out;
}

/* 학기: 학교 정보의 여름방학 끝 다음 날부터 2학기. 없으면 3~8월 1학기, 9~2월 2학기 */
export function termOf(date, breaks = []) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : new Date().toISOString().slice(0, 10);
  const y = d.slice(0, 4), m = Number(d.slice(5, 7));
  if (m <= 2 || m >= 9) return 2;
  const bs = (breaks || []).filter(b => b && b.from && b.to && String(b.to).slice(0, 4) === y);
  const summer = bs.find(b => /여름/.test(String(b.label || ''))) || bs.find(b => /^\d{4}-0[78]/.test(String(b.from)));
  if (summer && d > String(summer.to)) return 2;
  return 1;
}
