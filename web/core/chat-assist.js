/* 「쌤」 채팅 도우미: 규칙으로 분명하지 않거나 묻는 글이면 선생님 AI(notes)에 쌤비서 안내·최근 대화·앱 상태를 주고
   {"reply","actions","choices"} JSON으로 답을 받음. 화면 없이 돌아감(시험).
   AI로 보내는 글(선생님 글·대화·상태)은 모두 이름·전화번호를 가림(safeText). 답의 할 일은 아는 할 일만, 2개까지.
   답 글은 HTML로 넣지 않고 글자를 바꾼 뒤 줄·목록·굵게만 살림(replyHTML) */
import { INTENTS, INTENT_IDS, LANGS, safeText, handoffText, payloadFor, memoParts, HOW, HOWTO } from './chat-route.js';
import { maskContacts } from './privacy.js';
import { guideText } from './chat-knowledge.js';

export const TAG = '[쌤비서 채팅]';
export const GUIDE_TAG = '[쌤비서 채팅 안내]';
export const MAX_ACTIONS = 2, MAX_CHOICES = 3, TURNS = 10;
const clip = (s, n) => { const t = String(s == null ? '' : s).trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const oneLine = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

// AI가 고를 수 있는 할 일(무엇을 넣는지)
const ACT_NOTE = {
  purchase: 'text: 사려는 것·수량·금액(선생님 글에 있을 때만)', message: 'text: 쪽지에 넣을 안내 내용', letter: 'text: 가정통신문 「넣을 내용」',
  translate: 'lang: vi·zh·ru·en 중 하나', gongmun: 'text: 공문 글', report: 'text: 한 일', memo: 'nos: 학생 번호, text: 메모 한 줄(선생님 글에 「3번」처럼 번호가 있을 때만)',
  memoView: 'nos: 학생 번호'
};

/* 공통 안내(대화마다 같음 — 앞에 두어 AI 회사가 캐시): 역할·답하는 규칙·할 일 목록·쌤비서 안내 */
export function assistGuide() {
  return [GUIDE_TAG,
    '당신은 「쌤비서」(한국 학교 선생님용 업무 앱) 안의 채팅 도우미예요. 선생님의 동료처럼 쌤비서 쓰는 법과 학교 업무를 돕고, 해 달라는 일은 앱의 할 일로 넘겨요.',
    '',
    '답하는 규칙:',
    '- 해요체로 짧고 분명하게(보통 2~7줄). 차례가 있으면 「1. 2. 3.」, 나열은 「- 」로 써요. 표·HTML·코드는 쓰지 않고, 강조는 **굵게**만.',
    '- 쌤비서의 메뉴·버튼·기능은 아래 [안내]에 있는 것만 말해요. 안내에 없는 기능은 「쌤비서에는 아직 그 기능이 없어요」라고 하고 지어내지 않아요. 버튼 이름은 [ ]로 써요.',
    '- 행특·평어 쓰는 법, 품의·공문·가정통신문 쓰는 요령, 학급 운영·평가 같은 학교 업무 일반 질문도 경험 많은 동료처럼 답해요. 쌤비서 기능이 아니면 「(쌤비서 기능이 아닌 일반 안내예요)」라고 밝히고, 확실하지 않은 규정·날짜·금액은 「학교·교육청 지침을 확인해 주세요」라고 덧붙여요.',
    '- 오늘·이번 주 할 일이나 일정을 물으면 [지금 앱 상태]의 「오늘 할 일」만으로 정리해요. 없는 일을 지어내지 않아요.',
    '- 글에 있는 ○○○는 가린 이름·전화번호예요. 사람 이름·전화번호를 짐작해 쓰지 않아요.',
    '- 저장·결재·상신·나이스 저장·보내기는 쌤비서가 하지 않아요. 할 일을 넘겨도 마지막은 선생님이 직접 누른다고 안내해요.',
    '',
    '할 일(actions):',
    `- 선생님이 무엇을 해 달라고 분명히 말했을 때만 actions에 넣어요(${MAX_ACTIONS}개까지). 묻기만 하면 actions는 비우고, 그 화면으로 가면 도움이 될 때 choices에 할 일 id를 넣어요(${MAX_CHOICES}개까지).`,
    '- 할 일을 넣으면 앱이 그 메뉴로 가서 시작하고 결과를 따로 알려요. reply에는 「쪽지 작성에 넣을게요」처럼 짧게만 쓰고, 다 됐다고 단정하지 않아요.',
    '- text에는 선생님 글(또는 최근 대화)에서 그 칸에 넣을 내용만 옮겨요. 묻는 말·명령 말은 빼고, 넣을 내용이 없으면 빈 글. 지어내지 않아요.',
    '- intent는 아래 id 중 하나만 써요:',
    ...INTENTS.map(([id, , d]) => `  - ${id}: ${d}${ACT_NOTE[id] ? ` (${ACT_NOTE[id]})` : ''}`),
    '',
    '[안내]',
    guideText()].join('\n');
}

/* 앱 상태 → 줄(이름·전화번호는 가림). state: { place, brief:[{text, when}], ai:{ ready, name, trial }, letter:{ title, memo }, purchase:{ title, items }, classCount, app } */
export function stateLines(state = {}) {
  const s = state || {}, out = [];
  if (s.place) out.push(`- 보고 있는 화면: ${s.place}`);
  const b = Array.isArray(s.brief) ? s.brief : null;
  if (b) out.push(b.length ? `- 오늘 할 일(앱이 셈, ${b.length}개): ${b.slice(0, 8).map(l => `${oneLine(safeText(l.text))}${l.when ? `(${oneLine(l.when)})` : ''}`).join(' / ')}` : '- 오늘 할 일: 급한 일 없음');
  const a = s.ai || {};
  out.push(`- AI: ${a.ready ? `${oneLine(a.name) || '설정됨'}${a.trial ? '(시험용, 키 없이)' : ''}` : '준비 안 됨(설정 › AI에서 키를 넣거나 시험용 AI)'}`);
  if (s.letter) out.push(s.letter.title || s.letter.memo ? `- 가정통신문: 쓰던 것 있음${s.letter.title ? ` 「${clip(oneLine(safeText(s.letter.title)), 40)}」` : '(넣을 내용만)'}` : '- 가정통신문: 쓰던 것 없음');
  if (s.purchase) out.push(s.purchase.title || s.purchase.items ? `- 품의: 쓰던 초안 있음${s.purchase.title ? ` 「${clip(oneLine(safeText(s.purchase.title)), 40)}」` : ''}${s.purchase.items ? ` · 품목 ${s.purchase.items}개` : ''}` : '- 품의: 쓰던 초안 없음');
  if (s.classCount) out.push(`- 학급 명단: ${s.classCount}명(번호만)`);
  if (s.app) out.push(`- 쓰는 곳: ${s.app === 'windows' ? 'Windows 앱' : '웹판(브라우저)'}`);
  return out;
}

/* 대화마다 다른 부분: 앱 상태·최근 대화·규칙이 짐작한 할 일·선생님 글·답 모양.
   history: [{ who: 'me'|'bot', text }] (저장된 기록, 이미 가린 글 — 한 번 더 가림), hints: 규칙이 짐작한 할 일 id */
export function assistPrompt({ text, history = [], state = {}, hints = [], today = '' } = {}) {
  const turns = (Array.isArray(history) ? history : []).filter(m => m && typeof m.text === 'string' && m.text.trim()).slice(-TURNS)
    .map(m => `${m.who === 'me' ? '선생님' : '쌤비서'}: ${clip(oneLine(safeText(m.text)), 400)}`);
  const said = clip(safeText(text), 1500) || '(이름·전화번호만 있는 글)';
  const hint = (hints || []).filter(h => INTENT_IDS.includes(h)).slice(0, 3);
  const own = [TAG,
    '위 [안내]와 규칙대로 선생님 글에 답하세요.',
    ...(today ? [`오늘: ${today}`] : []),
    '', '[지금 앱 상태]', ...stateLines(state),
    ...(turns.length ? ['', '[최근 대화] (오래된 것부터)', ...turns] : []),
    ...(hint.length ? ['', `[앱 규칙이 짐작한 할 일] ${hint.join(', ')} (분명하지 않아요. 선생님 글로 판단하세요)`] : []),
    '', '[선생님 글]', said,
    '', '답은 JSON 하나만: {"reply":"선생님께 보일 답","actions":[{"intent":"letter","text":"넣을 내용"}],"choices":[]}',
    'actions·choices가 없으면 빈 배열. lang은 translate일 때만, nos는 memo·memoView일 때만.'].join('\n');
  return { shared: assistGuide(), own };
}

/* AI 답 정리: reply(글), actions(아는 할 일만, 2개까지, 같은 할 일 한 번), choices(아는 할 일, 3개까지).
   nos: 선생님 글에 있는 학생 번호(memo·memoView는 이 번호만) */
export function parseAssist(v, { nos = [] } = {}) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const reply = clip(typeof o.reply === 'string' ? o.reply : typeof o.answer === 'string' ? o.answer : '', 2000);
  const ok = id => typeof id === 'string' && INTENT_IDS.includes(id);
  const allowed = new Set((nos || []).map(Number));
  const actions = [], seen = new Set();
  for (const a of Array.isArray(o.actions) ? o.actions : []) {
    if (actions.length >= MAX_ACTIONS) break;
    if (!a || typeof a !== 'object' || !ok(a.intent) || seen.has(a.intent)) continue;
    const x = { intent: a.intent };
    if (typeof a.text === 'string' && a.text.trim()) x.text = clip(handoffText(a.text), 3000);
    if (a.intent === 'translate') x.lang = LANGS.some(l => l[0] === a.lang) ? a.lang : '';
    if (a.intent === 'memo' || a.intent === 'memoView') {
      x.nos = [...new Set((Array.isArray(a.nos) ? a.nos : []).map(Number))].filter(n => Number.isInteger(n) && allowed.has(n)).sort((p, q) => p - q);
      if (!x.nos.length || (a.intent === 'memo' && !x.text)) continue; // 선생님이 말한 번호가 아니거나 메모 글이 없으면 하지 않음
    }
    seen.add(a.intent);
    actions.push(x);
  }
  const choices = [...new Set((Array.isArray(o.choices) ? o.choices : []).filter(ok))].filter(c => !seen.has(c) && c !== 'memo').slice(0, MAX_CHOICES);
  return { reply, actions, choices };
}

/* AI가 고른 할 일 → 메뉴에 넘길 것. said: 선생님 글(이름·전화번호를 가린 글).
   글 넣는 일은 선생님이 내용을 줬으면 늘 선생님 글(AI가 바꿔 쓴 글로 바꾸지 않음 — 검토 I1), 내용이 없을 때만(앞 대화를 가리킴) AI가 옮긴 글 */
export const TEXT_INTENTS = ['purchase', 'message', 'letter', 'gongmun', 'report'];
export function actionPayload(a, { said = '', question = false } = {}) {
  const own = question ? {} : payloadFor(a.intent, said);
  if (TEXT_INTENTS.includes(a.intent)) return { text: own.text || (a.text ? payloadFor(a.intent, a.text).text : '') || '' };
  if (a.intent === 'translate') return { lang: a.lang || own.lang || '' };
  if (a.intent === 'multi') return { view: own.view || '' };
  // 메모는 여기서 만들지 않음(AI가 쓴 글을 넣지 않게 — planActions가 선생님 글로만)
  if (a.intent === 'memoView') return { nos: a.nos || [] };
  return {};
}

/* AI가 고른 할 일 → { run: [{ intent, payload }](할 것), nav: [할 일 id](그 화면으로만 가는 후보 버튼) } (검토 I2).
   - 묻기만 한 글(question): 메모는 버리고, 글 넣는 일·메뉴 일은 후보 버튼으로만(누르면 그 화면으로 가고, 칸을 채우거나 저절로 시작하지 않음).
     답이 곧 그 일인 오늘 할 일·메모 보기만 함
   - 메모: 선생님 글이 「3번 …」 메모일 때만, 넣는 글은 선생님 말(전화번호는 가림, 이름은 넣을 때 maskMemo — AI가 쓴 글은 넣지 않음).
     번호는 선생님이 쓴 것(AI가 그중 몇을 골랐으면 그것) */
const ASK_RUN = ['briefing', 'memoView'];
export function planActions(actions, { raw = '', said = '', question = false } = {}) {
  const run = [], nav = [], pm = memoParts(maskContacts(String(raw || '')));
  for (const a of Array.isArray(actions) ? actions : []) {
    if (!a || !INTENT_IDS.includes(a.intent)) continue;
    if (a.intent === 'memo') {
      if (question || !pm || !pm.body.trim()) continue;
      const nos = (a.nos || []).filter(n => pm.nos.includes(n));
      run.push({ intent: 'memo', payload: { nos: nos.length ? nos : pm.nos, body: pm.body } });
    } else if (question && !ASK_RUN.includes(a.intent)) nav.push(a.intent);
    else run.push({ intent: a.intent, payload: actionPayload(a, { said, question }) });
  }
  return { run, nav };
}

/* 선생님 글의 학생 번호: 글 맨 앞 「3번 …」「3·5번 …」「3~5번 …」 메모 꼴만(붙여 넣은 공문의 「붙임 1번」「2번 신청서」, 「1번 문항」은 학생 번호가 아님 — 검토 I2) */
export function mentionedNos(text) {
  const m = memoParts(String(text || ''));
  return m ? m.nos : [];
}

/* AI 없이 답하는 길(chat.js offline): 'pick'(애매한 명령 — 후보 버튼) | 'greet'(인사) | 'briefing'(할 일·일정을 물음 → 오늘 할 일) | 'guide'(안내에서 찾음).
   「학사일정 어떻게 넣어?」처럼 하는 법을 묻는 글은 「일정·마감·할 일」이 있어도 안내, 「감사 자료 어떻게 …?」(감사 = 점검)는 인사가 아님(검토 M2) */
const GREET = /^(?:안녕|하이|hi|hello|반가|고마워|고맙|감사(?:합니다|해요|해|드려요|드립니다)|수고)/i;
const BRIEF_ASK = /할\s*일|일정|급한|챙길|브리핑|마감/;
export function offlineWay(raw, { question = false, candidates = [], failed = false } = {}) {
  const t = String(raw || '').trim(), how = HOW.test(t) || HOWTO.test(t) || /(?:하는|넣는|쓰는|고치는|바꾸는)\s*(?:법|방법)|방법/.test(t);
  if (!question && candidates.length) return 'pick';
  if (!failed && GREET.test(t) && !how) return 'greet';
  if (BRIEF_ASK.test(t) && !how) return 'briefing';
  return 'guide';
}

/* 답 글 → 안전한 HTML: 글자를 먼저 바꾸고(<·>·&·따옴표) 줄바꿈·「- 」목록·「1. 」목록·**굵게**만 살림 */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inline = s => s.replace(/\*\*([^*\n]+?)\*\*/g, '<b>$1</b>');
export function replyHTML(text) {
  const lines = esc(String(text == null ? '' : text).replace(/\r\n?/g, '\n').trim()).split('\n');
  const out = [];
  let list = null, para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}${list.start > 1 ? ` start="${list.start}"` : ''}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; } };
  for (const l of lines) {
    const ul = /^\s*[-•*·]\s+(.+)$/.exec(l), ol = /^\s*(\d{1,2})[.)]\s+(.+)$/.exec(l);
    if (ul) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(ul[1]); }
    else if (ol) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [], start: +ol[1] }; } list.items.push(ol[2]); }
    else if (!l.trim()) { flushPara(); flushList(); }
    else { flushList(); para.push(l); }
  }
  flushPara(); flushList();
  return out.join('');
}
