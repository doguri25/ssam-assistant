/* 학급 › 주간학습안내의 규칙(화면 없음 — Node 시험에서도 씀). 화면은 weekly.js.
   AI 알림 지시: 요일마다 화면 칸(선생님이 고친 칸 그대로)·교과서 비고·학사일정·이미 쓴 알림을 보내되, 사람 이름·전화번호는 makeRedactor로 가려 보내고 답은 되돌림.
   학부모께 가는 학사일정 줄에는 공문 기한·연간계획(교직원 업무 일정)을 넣지 않음 */
import { makeRedactor } from '../../core/redact.js';

const WD = '월화수목금';
const md = d => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`;
export const AI_KEYS = ['prep', 'safety', 'homework', 'notice'];

/* 학부모께 보내는 학사일정: 행사계획(source 'event:…')과 직접 넣은 일정('')만 — 공문(선생님 일)·연간계획(「정보통신윤리교육 계획: 교직원 연수」 같은 업무)·
   필수연수 기한(training) 같은 선생님 일정은 넣지 않음(앞으로 생기는 출처도 넣지 않게 정해진 것만) */
export const forParents = e => !!e && (!e.source || String(e.source).startsWith('event:'));
export const autoEvents = (events, date) => (events || []).filter(e => e && e.date === date && forParents(e)).map(e => e.title).join(', ');

/* days: weekView, notes: 요일별 알림(학사일정 포함), cellAt(d, p): 화면 칸 글, periods: 시간표 교시 수 → { prompt, back(답 글 되돌리기) } */
export function notesPrompt(days, notes, { cellAt, periods = 6 } = {}) {
  const rd = makeRedactor();
  const raw = days.map((d, i) => {
    const head = `${WD[i]}요일(${md(d.date)})`;
    const cells = [];
    // 수업 없는 날은 선생님이 고쳐 쓴 칸만(1교시 칸의 까닭 글은 빼고)
    for (let p = 1; p <= periods; p++) { const c = String(cellAt ? cellAt(i, p) : '').trim(); if (c && !(d.off && c === d.off)) cells.push(`${p}교시 ${c}`); }
    if (d.off && !cells.length) return `${head}: 수업 없음(${d.off})`;
    const memo = (d.slots || []).filter(s => s.lesson && s.lesson.memo).map(s => `${s.subject} 비고 ${s.lesson.memo}`);
    const ev = notes[i] && notes[i].events ? ` / 학사일정: ${notes[i].events}` : '';
    const have = AI_KEYS.filter(k => notes[i] && notes[i][k]).map(k => `${k}=${notes[i][k]}`).join(', ');
    return `${head}${d.off ? `(수업 없음: ${d.off})` : ''}: ${cells.join('; ') || '수업 없음'}${memo.length ? ` / ${memo.join(', ')}` : ''}${ev}${have ? ` / 이미 쓴 칸: ${have}` : ''}`;
  });
  // 사람 이름·전화번호는 가려 보냄(명단처럼 이름만 늘어선 줄은 보내지 않음)
  const out = rd.lines(raw);
  const lines = out.map((x, i) => (x ? x.text : `${WD[i]}요일(${md(days[i].date)}): (보내지 않은 줄)`)).join('\n');
  const prompt = `[주간학습안내]\n초등학교 담임이 학부모·학생에게 보내는 주간학습안내의 요일별 알림을 써 주세요.\n\n${lines}\n\n`
    + '규칙:\n- prep(준비물): 그날 수업에 필요한 것만 짧게(예: 색연필, 실내화). 없으면 ""\n- safety(안전): 그날에 맞는 안전 한 줄\n'
    + '- homework(과제), notice(안내장): 학사일정에서 짐작되는 것이 있을 때만, 없으면 ""\n- 학부모·학생이 읽기 쉬운 짧은 말, 학생 이름은 쓰지 않음(〔이름1〕 같은 자리 표시도 그대로 옮기지 않음)\n- 수업 없는 날은 모두 ""\n\n'
    + '답은 JSON 하나만: {"days":[{"prep":"…","safety":"…","homework":"","notice":""}, …5개(월~금)]}';
  return { prompt, back: t => rd.back(t), bad: t => rd.bad(t) };
}

/* AI 답(normNotes) → 채울 칸 [[d, k, 글]]: 비어 있는 칸만, 수업 없는 날은 건너뜀, 자리 표시는 되돌리고 되돌릴 수 없는 글은 버림 */
export function notesToFill(days, notes, got, { back = t => t, bad = () => false } = {}) {
  const out = [];
  for (let d = 0; d < 5; d++) {
    if (days[d] && days[d].off) continue;
    for (const k of AI_KEYS) {
      const g = String((got[d] && got[d][k]) || '').trim();
      if (!g || String((notes[d] && notes[d][k]) || '').trim() || bad(g)) continue;
      out.push([d, k, back(g).trim()]);
    }
  }
  return out.filter(([, , t]) => t);
}
