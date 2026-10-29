/* 학급운영계획 AI 프롬프트 (화면 없음 — 시험에서도 씀). 모든 글은 이름·전화번호 줄을 뺀 뒤 넣음 */
import { leaves } from './classplan-model.js';
import { stripNames } from '../../core/privacy.js';

const clean = (t, n) => stripNames(String(t || '').slice(0, n)).text;
const ids = p => leaves(p.outline).map(x => `${x.id}: ${x.title}`).join('\n');

export function guidePrompt(p) {
  return `[학급운영계획 지침]\n담임교사의 학급운영계획(학급 교육과정 운영 계획)을 돕는 도우미예요. 아래 올해 지침에서 학급운영계획에 꼭 들어가야 할 항목을 3~8개 뽑아 주세요.\n\n`
    + `지침:\n"""\n${clean(p.sources.guide, 15000)}\n"""\n\n`
    + `계획서 칸(id: 이름):\n${ids(p)}\n\n`
    + '규칙:\n- item: 항목 이름(짧게)\n- keywords: 계획서에 그대로 나올 만한 핵심어 2~3개\n- sentence: 계획서에 넣을 한 문장(학교 문서 문체 「~한다」)\n'
    + '- section: 그 문장이 들어갈 칸 id (위 목록에서)\n- 지침에 없는 항목은 지어내지 않음\n\n'
    + '답은 JSON 배열 하나만: [{"item":"…","keywords":["…","…"],"sentence":"…","section":"칸 id"}]';
}

/* bodies: 칸 id → 작년 글, hours: 시수표 줄, evalCount: 평가 표 줄 수 */
export function draftPrompt(p, { bodies = {}, hours = [], evalCount = 0 } = {}) {
  const total = (p.boys || 0) + (p.girls || 0);
  const info = [
    `학년도: ${p.year}학년도 (${p.year}-03-01 ~ ${p.year + 1}-02-28)`,
    `학급: ${p.year}학년도 ${p.grade || '?'}학년 ${p.room || '?'}반`,
    p.boys != null || p.girls != null ? `학생 수: 남 ${p.boys || 0}명, 여 ${p.girls || 0}명, 모두 ${total}명` : '',
    p.motto.trim() ? `급훈(학급 슬로건): ${p.motto.trim()}` : '',
    hours.length ? `첨부한 진도표의 교과별 시수: ${hours.map(r => r.join(' ')).join(', ')}` : '',
    evalCount ? `첨부한 평가계획 ${evalCount}줄을 평가 칸 표로 넣음 (글에는 평가 방침만)` : '',
    p.guide && p.guide.length ? `지침에서 꼭 넣을 문장(칸 id):\n${p.guide.map(g => `- [${g.section}] ${g.sentence}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');
  let budget = 18000;
  const secs = p.outline.map(x => {
    const head = `${x.level === 1 ? '■' : '  -'} [${x.id}] ${x.title}${x.role === 'hours' ? ' (뒤에 시수표가 붙음)' : x.role === 'eval' ? ' (뒤에 평가 표가 붙음)' : x.role === 'monthly' ? ' (월별 표: monthly에 씀)' : ''}`;
    const body = clean(bodies[x.id] || '', Math.min(1500, Math.max(0, budget)));
    budget -= body.length;
    return body ? `${head}\n작년 글:\n${body}` : `${head}\n(작년 글 없음)`;
  }).join('\n\n');
  return `[학급운영계획 초안]\n담임교사의 올해 학급운영계획(학급 교육과정 운영 계획) 초안을 칸마다 써 주세요.\n\n${info}\n\n`
    + `계획서 칸(작년 계획서 목차 그대로, ■는 큰 제목):\n${secs}\n\n`
    + '규칙:\n- 작년 글의 짜임과 문체(「가.」「1)」 목록, 「~한다」)를 따르되 학년도·학급·학생 수·날짜를 올해에 맞게 고침\n'
    + '- 작년 글이 없는 칸은 칸 이름에 맞게 3~5줄로 씀\n- 학생 이름은 쓰지 않음. 주어지지 않은 숫자·사실은 지어내지 않음\n'
    + '- 지침 문장은 그 칸에 자연스럽게 넣음\n- sections에는 ■가 아닌 칸(아래 「-」 칸, 아래 칸이 없는 ■ 칸)만 씀\n'
    + `- monthly: 3월부터 다음 해 2월까지 달마다 주요 학급 활동 한두 줄\n\n`
    + '답은 JSON 하나만: {"sections":{"칸 id":"글"},"monthly":[{"month":3,"text":"…"}]}';
}

export function evalPrompt(text) {
  return `[평가계획 읽기]\n학교에서 받은 교과 평가계획(교수학습 및 평가 계획)에서 평가 표를 줄마다 뽑아 주세요.\n\n`
    + `평가계획:\n"""\n${clean(text, 20000)}\n"""\n\n`
    + '규칙:\n- 한 줄 = 평가 하나. subject(교과), unit(단원 또는 영역), standard(성취기준 코드와 짧은 내용), method(평가 방법), when(시기, 예: 4월)\n'
    + '- 글에 없는 내용은 비워 둠. 지어내지 않음\n\n'
    + '답은 JSON 하나만: {"rows":[{"subject":"…","unit":"…","standard":"…","method":"…","when":"…"}]}';
}
