/* 설문 CSV(구글 폼 응답) 집계: 5점 척도는 평균·분포, 서술형은 답 모음. 구글 폼에 붙일 문항 글 */

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

const SKIP = /타임스탬프|timestamp|이메일|email/i;
const round2 = n => Math.round(n * 100) / 100;

/* rows: 첫 줄은 머리. 답의 80% 이상이 척도로 읽히면 척도 문항 */
export function summarize(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length < 2) return { n: 0, questions: [], few: true };
  const head = list[0].map(h => String(h || '').trim());
  const body = list.slice(1).filter(r => Array.isArray(r) && r.some(c => String(c || '').trim()));
  const questions = [];
  head.forEach((q, i) => {
    if (!q || SKIP.test(q)) return;
    const answers = body.map(r => String(r[i] == null ? '' : r[i]).trim()).filter(Boolean);
    const vals = answers.map(scaleValue);
    const ok = vals.filter(v => v != null);
    if (answers.length && ok.length / answers.length >= 0.8) {
      const counts = [0, 0, 0, 0, 0];
      ok.forEach(v => counts[v - 1]++);
      questions.push({ q, type: 'scale', counts, mean: round2(ok.reduce((s, v) => s + v, 0) / ok.length) });
    } else questions.push({ q, type: 'text', answers });
  });
  return { n: body.length, questions, few: body.length < 10 };
}

export function formText(items) {
  return (items || []).map((it, i) => `${i + 1}. ${it.q} ${it.type === 'scale' ? `(5점 척도: ${SCALE[0]} ~ ${SCALE[4]})` : '(서술형)'}`).join('\n');
}
