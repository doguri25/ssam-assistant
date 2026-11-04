/* 설문 CSV(구글 폼 응답) 집계: 5점 척도는 평균·분포, 서술형은 답 모음. 구글 폼에 붙일 문항 글 */
import { looksLikeName, stripNames } from './privacy.js';
import { readText } from './files.js';
import { readTable } from './sheet.js';

export const SCALE = ['전혀 그렇지 않다', '그렇지 않다', '보통이다', '그렇다', '매우 그렇다'];
const WORDS = {
  '전혀그렇지않다': 1, '그렇지않다': 2, '보통이다': 3, '보통': 3, '그렇다': 4, '매우그렇다': 5,
  '매우불만족': 1, '불만족': 2, '만족': 4, '매우만족': 5
};

export function scaleValue(v) {
  const s = String(v == null ? '' : v).replace(/\s/g, '');
  if (/^[1-5]$/.test(s)) return +s;
  return WORDS[s] || null;
}

const SKIP = /타임스탬프|timestamp/i;
// 개인정보 열은 문항이 아님: 저장하지도 AI로 보내지도 않음. 머리 글에 낱말이 들어 있거나, 학년·반·번호만 있거나, 답이 이름·전화번호·전자 우편·학번 모양
const PERSONAL_WORD = /이름|성명|성함|학번|연락처|전화|휴대|핸드폰|폰\s*번호|이메일|메일\s*주소|e-?mail|\bname\b|주소|생년월일/i;
const ONLY_CLASS = h => /학년|반|번호/.test(h) && !h.replace(/학생|학년|반|번호|및|[\s\d/·,.:()\-]/g, '');
const share = (a, f) => a.filter(f).length / a.length;
export function personalColumn(head, answers = []) {
  const h = String(head || '').replace(/\s+/g, ' ').trim();
  if (PERSONAL_WORD.test(h) || ONLY_CLASS(h)) return true;
  const a = answers.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
  if (a.length < 2) return false;
  if (share(a, x => /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(x)) >= 0.5) return true;
  if (share(a, x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) >= 0.5) return true;
  const distinct = new Set(a).size / a.length >= 0.8;
  if (distinct && share(a, x => /^\d{4,6}$/.test(x)) >= 0.8) return true;
  return a.length >= 3 && distinct && share(a, looksLikeName) >= 0.8;
}
/* 표(줄×칸)의 개인정보 열 지우기: 첫 줄이 머리 → { rows, cols(뺀 열 머리) } */
function dropColumns(rows) {
  const width = Math.max(0, ...rows.map(r => r.length)), drop = new Set(), cols = [];
  for (let j = 0; j < width; j++) {
    if (!personalColumn(rows[0][j], rows.slice(1).map(r => r[j]))) continue;
    drop.add(j); cols.push(String(rows[0][j] || '').trim() || `${j + 1}번째 열`);
  }
  return { rows: drop.size ? rows.map(r => r.filter((c, j) => !drop.has(j))) : rows, cols };
}
const rowsText = rows => rows.map(r => r.join('\t').replace(/\t+$/, '')).join('\n');
const done = (text, cols) => { const r = stripNames(text); return { text: r.text, cols, dropped: r.dropped, masked: r.masked }; };

/* 넣은 글(작년 설문 결과 등)의 개인정보 빼기: 표(붙여 넣은 표·엑셀을 읽은 글 — 탭으로 나뉜 줄이 두 줄 넘게 이어짐)는 첫 줄을 머리로 보고
   개인정보 열을 지우고, 그다음 명단·전화번호 줄은 빼고 이름은 가림(stripNames) → { text, cols(뺀 열 머리), dropped(뺀 줄), masked(가린 이름) } */
export function stripPersonal(text) {
  const ls = String(text || '').split('\n'), cols = [];
  for (let a = 0; a < ls.length;) {
    let b = a;
    while (b < ls.length && ls[b].includes('\t')) b++;
    if (b - a >= 2) {
      const d = dropColumns(ls.slice(a, b).map(l => l.split('\t')));
      if (d.cols.length) { cols.push(...d.cols); ls.splice(a, b - a, ...rowsText(d.rows).split('\n')); }
    }
    a = Math.max(b, a + 1);
  }
  return done(ls.join('\n'), cols);
}
/* CSV·엑셀 표 그대로: 위쪽 제목 줄(칸이 하나뿐) 아래 첫 줄이 머리. 칸 안 줄바꿈은 띄어쓰기로(한 줄 = 한 응답) */
export function stripTable(rows) {
  const R = (Array.isArray(rows) ? rows : []).map(r => (Array.isArray(r) ? r : []).map(c => String(c == null ? '' : c).replace(/\s*\n\s*/g, ' ').trim()));
  let h = R.slice(0, 10).findIndex(r => r.filter(Boolean).length >= 2);
  if (h < 0) h = R.length;
  const d = dropColumns(R.slice(h));
  return done(rowsText([...R.slice(0, h), ...d.rows]).trim(), d.cols);
}
/* 파일 → 개인정보를 뺀 글: CSV·엑셀은 표로 읽어 열을 빼고, 다른 파일은 글로 읽어 stripPersonal. 못 읽으면 { code }를 던짐(files.js) */
export async function readStripped(file) {
  const name = String(file && file.name || '');
  if (!/\.(csv|xlsx)$/i.test(name)) return stripPersonal(await readText(file));
  let rows;
  try { rows = await readTable(name, new Uint8Array(await file.arrayBuffer())); } catch (e) { throw { code: 'READ_FAILED' }; }
  return stripTable(rows);
}
export function personalMsg(r) {
  const out = [r.cols.length ? `개인정보로 보이는 열 ${r.cols.length}개(${r.cols.join(', ')})` : '', r.dropped ? `이름·전화번호가 적힌 줄 ${r.dropped}개` : ''].filter(Boolean).join(', ');
  return `${[out ? out + '는 빼고' : '', r.masked ? `이름 ${r.masked}개는 ○○○로 가려` : ''].filter(Boolean).join(', ')} 넣었어요(학생 이름은 저장하지도 AI로 보내지도 않아요).`;
}
const round2 = n => Math.round(n * 100) / 100;

/* rows: 첫 줄은 머리. 답의 80% 이상이 척도로 읽히면 척도 문항 */
export function summarize(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length < 2) return { n: 0, questions: [], few: true, excluded: [] };
  const head = list[0].map(h => String(h || '').trim());
  const body = list.slice(1).filter(r => Array.isArray(r) && r.some(c => String(c || '').trim()));
  const questions = [], excluded = [];
  head.forEach((q, i) => {
    if (!q || SKIP.test(q)) return;
    const answers = body.map(r => String(r[i] == null ? '' : r[i]).trim()).filter(Boolean);
    if (personalColumn(q, answers)) { excluded.push(q); return; }
    const vals = answers.map(scaleValue);
    const ok = vals.filter(v => v != null);
    if (answers.length && ok.length / answers.length >= 0.8) {
      const counts = [0, 0, 0, 0, 0];
      ok.forEach(v => counts[v - 1]++);
      questions.push({ q, type: 'scale', counts, mean: round2(ok.reduce((s, v) => s + v, 0) / ok.length) });
    } else questions.push({ q, type: 'text', answers });
  });
  return { n: body.length, questions, few: body.length < 10, excluded };
}

export function formText(items) {
  return (items || []).map((it, i) => `${i + 1}. ${it.q} ${it.type === 'scale' ? `(5점 척도: ${SCALE[0]} ~ ${SCALE[4]})` : '(서술형)'}`).join('\n');
}
