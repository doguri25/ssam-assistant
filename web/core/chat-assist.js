/* 「쌤」 채팅 도우미: 규칙으로 분명하지 않거나 묻는 글이면 선생님 AI(notes)에 쌤비서 안내·최근 대화·앱 상태를 주고
   {"reply","actions","choices"} JSON으로 답을 받음. 화면 없이 돌아감(시험).
   AI로 보내는 글(선생님 글·대화·상태)은 모두 이름·전화번호를 가림(safeText). 답의 할 일은 아는 할 일만, 2개까지.
   답 글은 HTML로 넣지 않고 글자를 바꾼 뒤 줄·목록·굵게만 살림(replyHTML) */
import { INTENTS, INTENT_IDS, LANGS, safeText, handoffText } from './chat-route.js';
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

/* 선생님 글의 학생 번호(「3번」「3·5번」「3~5번」) */
export function mentionedNos(text) {
  const out = new Set(), t = String(text || '');
  for (const m of t.matchAll(/(\d{1,2})\s*[~\-]\s*(\d{1,2})\s*번/g)) { const a = +m[1], b = +m[2]; if (b >= a && b - a < 40) for (let i = a; i <= b; i++) out.add(i); }
  for (const m of t.matchAll(/((?:\d{1,2}\s*[·,、/]\s*)*\d{1,2})\s*번/g)) for (const n of m[1].split(/[·,、/]/)) out.add(+n.trim());
  return [...out].filter(n => n >= 1 && n <= 60).sort((a, b) => a - b);
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
