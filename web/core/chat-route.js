/* 「쌤」 채팅의 글 → 할 일 (스펙 2026-11-06 D·F). 화면 없이 돌아감(시험).
   먼저 앱 규칙(낱말)으로 고르고(routeText), 분명하지 않거나 묻는 글(isQuestion)이면 쌤비서 도우미(chat-assist.js)가 AI로 답하고 할 일을 고름.
   「3번 …」은 행동특성 관찰 메모(parseMemo·maskMemo·memoLine) */
import { stripNames, maskContacts } from './privacy.js';
import { stripPersonal } from './survey.js';
import { maskPersons, rosterLine } from './chat-names.js';

/* 할 일: [id, 이름(후보 버튼 글), AI에 주는 설명] */
export const INTENTS = [
  ['purchase', '품의 초안', '물품 구입·강사 수당·행사 운영 품의서 초안'],
  ['message', '쪽지 쓰기', '선생님들께 보내는 업무 안내 쪽지(메신저)'],
  ['letter', '가정통신문', '보호자께 보내는 가정통신문·안내장'],
  ['translate', '가정통신문 번역', '가정통신문을 베트남어·중국어·러시아어·영어로 번역'],
  ['gongmun', '공문 처리', '받은 공문의 제출 기한·할 일 정리'],
  ['report', '결과 보고', '행사·사업 결과 보고서'],
  ['year', '연간계획', '업무 연간 운영 계획'],
  ['event', '행사계획', '운동회·학예회·현장체험학습 같은 행사 계획'],
  ['classplan', '학급운영계획', '학급 교육과정 운영 계획'],
  ['unit', '단원평가', '단원평가 채점·결과지'],
  ['activity', '활동지', '활동지·학습지 채점'],
  ['gr', '평가지 채점', '수행평가·서술형 평가지 채점과 평어'],
  ['pyeongeo', '교과 평어', '교과 성적 평어(성취기준별 문장)'],
  ['hk', '행동특성', '행동특성 및 종합의견'],
  ['cc', '창체', '창의적 체험활동 특기사항'],
  ['check', '기재 점검', '생기부 기재 점검: 쓰면 안 되는 말·부정 표현·이름·같은 문장·글자 수'],
  ['weekly', '주간학습안내', '다음 주 주간학습안내'],
  ['today', '오늘 수업', '오늘 수업·시간표'],
  ['progress', '진도표', '진도표·시수'],
  ['camp', '기초학력', '기초학력 지원(캠프·교실·수업) 수업 일정·출석 체크·관찰 기록·수업 확인서·출석부·결과 보고서'],
  ['memo', '관찰 메모', '학생 번호로 행동특성 관찰 메모 남기기'],
  ['memoView', '메모 보기', '학생 번호의 관찰 메모 보기'],
  ['briefing', '오늘 할 일', '오늘 할 일·급한 일 모아 보기'],
  ['handover', '인수인계서', '업무 인수인계서 만들기'],
  ['multi', '다면평가', '교사 다면평가: 정량평가 점수 계산·근거자료, 정성평가 자기실적평가서'],
  ['aikey', 'AI 키', '설정 › AI 키 넣기·바꾸기']
];
export const INTENT_IDS = INTENTS.map(i => i[0]);
export const intentLabel = id => (INTENTS.find(i => i[0] === id) || [])[1] || '';
export const LANGS = [['vi', '베트남어'], ['zh', '중국어(간체)'], ['ru', '러시아어'], ['en', '영어']];
export const langLabel = id => (LANGS.find(l => l[0] === id) || [])[1] || '';
const LANG_RE = [['vi', /베트남/], ['zh', /중국|중문|간체/], ['ru', /러시아/], ['en', /영어|영문|english/i]];
const langOf = t => (LANG_RE.find(([, re]) => re.test(t)) || [''])[0];
// 번역을 바라는 말: 언어 이름 바로 뒤 「~로·~으로」「~판·~버전」「~ 가정통신문·안내장」(「베트남어로」「영문으로」「중국어판」「러시아어 가정통신문」).
// 「영어 캠프 안내 가정통신문」「중국 문화 체험 행사 안내장」처럼 언어 낱말이 내용에만 있으면 번역이 아님(「번역」 낱말은 따로 셈)
const LANG_CUE = /(?:(?:베트남|중국|러시아)(?:어|문)?|영어|영문|중문|간체)\s*(?:으로|로|(?:판|버전)(?![가-힣])|가정\s*통신문|통신문|안내장|안내문)/;

/* 낱말 규칙: [할 일, 낱말, 무게]. 한 할 일에서 맞은 무게 중 큰 것만 셈 */
const RULES = [
  ['purchase', /품의/, 3], ['purchase', /구입|구매|사\s*(?:려고|야\s*해|고\s*싶)|주문/, 1.5],
  ['message', /쪽지|메신저/, 3], ['message', /쪽지\s*로/, 3.5], ['message', /선생님들?(?:께|에게)\s*(?:안내|알려)/, 2],
  ['letter', /가정\s*통신문|통신문|안내장/, 3], ['letter', /(?:통신문|안내장)\s*으로/, 3.5], ['letter', /(?:학부모|보호자|부모님)(?:께|에게)?\s*(?:안내|알림|알려)/, 2.5],
  ['gongmun', /공문/, 2.5], ['gongmun', /공문\s*(?:처리|정리|기한|목록)/, 3.5],
  ['report', /결과\s*보고|보고서/, 3], ['report', /결과\s*보고(?:서)?\s*로/, 3.5],
  ['year', /연간\s*(?:업무\s*)?(?:운영\s*)?계획|업무\s*계획/, 3],
  ['event', /행사\s*계획|(?:운동회|학예회|체험\s*학습|수학여행|발표회|축제|행사)\s*(?:운영\s*)?계획/, 3.5], ['event', /운동회|학예회|체험\s*학습|수학여행|발표회/, 1.5], ['event', /행사/, 1],
  ['classplan', /학급\s*(?:운영|교육과정)\s*(?:운영\s*)?계획/, 4],
  ['unit', /단원\s*평가/, 3], ['activity', /활동지|학습지/, 3],
  ['gr', /평가지\s*채점|수행\s*평가|서술형/, 3],
  ['unit', /채점/, 1], ['activity', /채점/, 1], ['gr', /채점/, 1],
  ['pyeongeo', /교과\s*평어|성취\s*기준/, 3], ['pyeongeo', /평어/, 2],
  ['hk', /행특|행동\s*특성|종합\s*의견/, 3],
  ['cc', /창체|창의적\s*체험|자율\s*활동|동아리\s*활동|진로\s*활동/, 3],
  ['check', /기재\s*점검|생기부\s*점검|기재\s*요령/, 4],
  ['weekly', /주간\s*학습|주학|다음\s*주\s*안내/, 3.5],
  ['today', /오늘\s*(?:수업|시간표)/, 3.5],
  ['progress', /진도표|시수/, 3], ['progress', /진도/, 2],
  // 기초학력(교과) 캠프: 「캠프 출석」, 캠프 + 출석·관찰·수업 확인서·보고서는 결과 보고·행특보다 앞섬. 「영어 캠프 안내 가정통신문」은 캠프가 아님
  ['camp', /(?:기초\s*학력|교과)\s*캠프/, 3.5], ['camp', /캠프\s*출석|(?:기초\s*학력|교과)\s*캠프.{0,20}(?:출석|관찰|수업\s*확인|결과\s*보고|보고서|일정|기록)/, 4.5],
  ['briefing', /브리핑|오늘\s*(?:할\s*일|할일|일정)|할\s*일\s*(?:알려|보여|뭐|있)|급한\s*(?:일|것)|챙길\s*(?:일|것)/, 4],
  ['handover', /인수\s*인계/, 4],
  // 교사 다면평가: 「정량평가」「정성평가」「자기실적평가서」도. 쪽지·가정통신문·단원평가·평어·결과 보고서 낱말(3)이 함께 있으면 그 탭이 앞섬
  ['multi', /다면\s*평가|자기\s*실적\s*평가|정량\s*평가|정성\s*평가/, 2.8],
  ['aikey', /(?:AI|ai|Ai|에이아이)\s*(?:키|설정)|API\s*키|api\s*key|키\s*(?:넣|바꾸|바꿔|설정|등록)/i, 4],
  ['translate', /번역/, 4]
];
const SURE = 2.5, GAP = 1; // 이만큼 이상이고 둘째보다 GAP 이상 앞서면 분명함

/* 명령 꼬리(「써 줘」「만들어 주세요」「해 줘」…)와 맨 끝 마침표 */
// 부탁 꼴(「써 줄 수 있어요?」「만들어 주실래요?」「써 주시겠어요?」「해 줄래?」)도 꼬리(검토 M1)
const PLEASE = '(?:줘요|줘|주세요|줄래요?|주라|주겠니|주실래요?|주시겠어요?|줄\\s*수\\s*있(?:어요|어|나요|을까요?|니)|주실\\s*수\\s*있(?:어요|나요|을까요?))';
const TAIL = new RegExp(`(?:^|\\s)(?:좀\\s*)?(?:써|만들어|작성해|올려|해|부탁해|짜|정리해|보내|열어|보여|처리해|넣어|챙겨|알려)\\s*(?:${PLEASE}|봐|볼래|요)?\\s*[.!?~]*\\s*$|(?:^|\\s)부탁(?:해요|합니다|드려요)?\\s*[.!?~]*\\s*$`);
const HEAD = /^(?:좀\s*)?(?:써|만들어|작성해|올려|부탁해)\s*(?:줘|주세요|줄래요?)?\s*[:,.]?\s*/;
const trimTail = t => { let s = String(t || '').trim(), p; do { p = s; s = s.replace(TAIL, '').trim(); } while (s !== p && s); return s.replace(/[\s,.:;·]+$/, '').replace(/^[\s,.:;·]+/, '').replace(HEAD, ''); };
/* 할 일 낱말을 뺀 남은 글 (내용이 있는지 보려고) */
const KW = {
  purchase: /품의\s*(?:서|초안)?(?:\s*초안)?/g, message: /(?:안내\s*)?쪽지(?:로|를|\s*초안)?/g, letter: /가정\s*통신문(?:으로|을|\s*초안)?|안내장(?:으로|을)?/g,
  gongmun: /공문(?:\s*처리)?(?:을|으로)?/g, report: /결과\s*보고(?:서)?(?:를)?/g
};
// 글 앞의 「가정통신문 써 줘」「쪽지:」「공문 처리」+줄바꿈 (뒤에 내용이 이어질 때)
const LEAD_W = '(?:가정\\s*통신문|안내장|(?:안내\\s*)?쪽지|공문(?:[ \\t]*처리)?|결과\\s*보고(?:서)?)';
const LEAD_V = '[ \\t]*(?:좀[ \\t]*)?(?:써|만들어|작성해|처리해|정리해|부탁해)[ \\t]*';
const LEAD = new RegExp(`^${LEAD_W}(?:${LEAD_V}(?:줘|주세요|줄래요?)?)?[ \\t]*(?:[:,.][ \\t]*\\n?|\\n)\\s*|^${LEAD_W}${LEAD_V}(?:줘|주세요|줄래요?)[ \\t]*[:,.]?\\s*`);
const meat = s => String(s || '').replace(/[^가-힣a-zA-Z0-9]/g, '');
// 줄마다 빈칸만 정리(줄바꿈은 살림: 공문·안내 글은 줄로 나뉘고, 전화번호 줄만 빼려면 줄이 남아야 함)
const tidy = s => String(s || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
/* 할 일마다 메뉴에 넘길 것: 품의는 품의 낱말까지 뺀 글(앱이 품목으로 읽음), 쪽지·가정통신문·공문·결과 보고는 명령 꼬리만 뺀 글(내용이 없으면 빈칸).
   줄바꿈은 그대로 둠. 전화번호·전자 우편 가리기는 부르는 쪽(chat.js maskContacts) */
export function payloadFor(intent, text) {
  const t = tidy(text);
  if (intent === 'purchase') { const s = trimTail(tidy(t.replace(KW.purchase, ' '))); return { text: meat(s).length >= 2 ? s : '' }; }
  if (['message', 'letter', 'gongmun', 'report'].includes(intent)) {
    const s = trimTail(t).replace(LEAD, ''), rest = meat(s.replace(KW[intent], ''));
    return { text: rest.length >= 4 ? s : '' };
  }
  if (intent === 'translate') return { lang: langOf(t) };
  if (intent === 'multi') return { view: /정성|자기\s*실적/.test(t) ? 'qual' : /정량/.test(t) ? 'quant' : '' };
  if (intent === 'memo' || intent === 'memoView') { const m = parseMemo(t); return m ? { nos: m.nos, body: m.body } : { nos: [], body: '' }; }
  return {};
}

/* 「3번 …」「3·5번 …」「3, 5번 …」「3번, 5번 …」「3~5번 …」 → { nos, body }. 번호는 1~60, 범위는 40명까지.
   번호 사이(구분 글자 앞뒤 빈칸 또는 빈칸만)는 한 가지로만 읽히게 — 빈칸을 나눠 읽는 길이 여럿이면 숫자가 길게 이어진 글(「1  2  3 … 25」)에서 창이 멈춤 */
const NOS = /^\s*((?:\d{1,2}(?:\s*번)?(?:\s*(?:[·,、/~\-]|와|과|하고|랑)\s*|\s+))*\d{1,2})\s*번(?:\s*학생)?(?:은|는|이|이가|이는|의)?(?=\s|[,:.]|$)\s*[,:.]?\s*/;
export function parseMemo(text) {
  const t = String(text || '');
  const m = NOS.exec(t);
  if (!m) return null;
  const nos = new Set();
  for (const part of m[1].replace(/\s*([~\-])\s*/g, '$1').split(/[·,、/]|와|과|하고|랑|\s+|번/).map(s => s.trim()).filter(Boolean)) {
    const r = /^(\d{1,2})\s*[~\-]\s*(\d{1,2})$/.exec(part);
    if (r) { const a = +r[1], b = +r[2]; if (b >= a && b - a < 40) for (let i = a; i <= b; i++) nos.add(i); continue; }
    for (const n of part.split(/[~\-]/)) if (/^\d{1,2}$/.test(n.trim())) nos.add(+n);
  }
  const list = [...nos].filter(n => n >= 1 && n <= 60).sort((a, b) => a - b);
  if (!list.length) return null;
  return { nos: list, body: t.slice(m[0].length).trim() };
}
const VIEW = /^(?:학생\s*)?(?:행특\s*|관찰\s*|행동\s*특성\s*)?메모\s*(?:좀\s*)?(?:보기|봐|볼래|보자|보여\s*(?:줘|주세요|줄래요?)|확인|알려\s*(?:줘|주세요))?\s*[.?!]*$/;
// 관찰 메모 끝말(「~함」「~임」「~했어요」): 다른 할 일 낱말이 있어도 메모
const MEMO_END = /(?:함|임|음|됨|짐|봄|줌|했다|한다|였다|이다|좋다|있다|없다|해요|했어요|어요|아요|이에요|예요|했음|많음)\s*[.!]*$/;
// 번호 뒤에 와도 메모가 아닌 말(「3번 문항」「3번 단원평가」…)
const NOT_MEMO = /^(?:문항|문제|단원|차시|교시|째|쪽|페이지)/;
/* 학생 관찰 메모 꼴(「3번 …」, 「3번 문항·단원평가 …」는 아님)이면 { nos, body }, 아니면 null */
export const memoParts = text => { const m = parseMemo(text); return m && !NOT_MEMO.test(m.body) ? m : null; };

/* 번호 목록 → 「3번」「3·5번」, 넷 이상 이어지면 「1~25번」 */
export function nosText(nos) {
  const a = [...new Set(nos)].sort((x, y) => x - y), out = [];
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    if (j - i >= 3) out.push(`${a[i]}~${a[j]}`); else for (let k = i; k <= j; k++) out.push(String(a[k]));
    i = j + 1;
  }
  return out.join('·') + '번';
}

/* 글 → { intent, payload, confidence(0~1), candidates([할 일 id], 애매할 때 2~3개) }. 모르면 intent null.
   낱말은 한 줄로 이어 보고, 넘길 글(payload)은 받은 글 그대로(줄바꿈 살림) */
export function routeText(text) {
  const raw = String(text == null ? '' : text), t = raw.replace(/\s+/g, ' ').trim();
  const none = { intent: null, payload: {}, confidence: 0, candidates: [], question: false };
  if (!t) return none;
  let ask = isQuestion(raw);
  const scores = {};
  for (const [id, re, w] of RULES) if (re.test(t)) scores[id] = Math.max(scores[id] || 0, w);
  // 번역: 언어 낱말 + 번역을 바라는 말(「번역」「베트남어로」「영문으로」「러시아어 가정통신문」)이면 번역(가정통신문보다 앞섬)
  const lang = langOf(t);
  if (lang && (/번역/.test(t) || LANG_CUE.test(t))) scores.translate = 5;
  // 다면평가 낱말은 글감일 때가 많음: 쪽지·가정통신문·단원평가·평어·결과 보고서 같은 글 넣는 일이 분명하면 그 일(「다면평가 위원회 안내 쪽지」)
  if (scores.multi && ['message', 'letter', 'unit', 'pyeongeo', 'report', 'gr', 'gongmun', 'purchase'].some(id => (scores[id] || 0) >= 3)) scores.multi = 1;
  // 관찰 메모: 글 앞이 「n번」
  const memo = parseMemo(t);
  if (memo && !NOT_MEMO.test(memo.body)) {
    if (VIEW.test(memo.body)) return { intent: 'memoView', payload: { nos: memo.nos }, confidence: 1, candidates: [], question: false };
    // 묻는 글(「3번 학생 상담 어떻게 하면 좋을까?」)은 메모로 넣지 않음(메모 끝말이면 메모)
    if (meat(memo.body).length >= 2 && (!ask || MEMO_END.test(memo.body))) {
      const other = Object.entries(scores).filter(([id]) => !['briefing'].includes(id)).sort((a, b) => b[1] - a[1]);
      // 번호 뒤 글에 다른 할 일 낱말이 크게 있으면(「3번 단원평가 채점」) 애매함
      if (!other.length || other[0][1] < SURE || MEMO_END.test(memo.body)) return { intent: 'memo', payload: { nos: memo.nos, body: memo.body }, confidence: 0.9, candidates: [], question: false };
      return { intent: null, payload: {}, confidence: 0.4, candidates: ['memo', ...other.slice(0, 2).map(o => o[0])], question: ask };
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { ...none, question: ask };
  const [top, s1] = ranked[0], s2 = ranked[1] ? ranked[1][1] : 0;
  // 부탁 꼬리(써 줘·만들어 주세요 …)가 있고 글 넣는 일이 분명하면 명령(「방과후 신청 방법 안내 가정통신문 만들어 줘」) — 어떻게·하는 법은 그대로 묻는 글
  if (ask && REQUEST.test(t) && WRITE_IDS.includes(top) && s1 >= SURE && !HOW.test(t) && !HOWTO.test(t)) ask = false;
  // 묻는 글(「단원평가 결과지 어떻게 뽑아?」「AI 키 없이 써도 돼?」)은 그 메뉴 낱말이 있어도 바로 하지 않음(쌤비서 도우미가 답함) — 오늘 할 일은 답이 곧 브리핑
  if (ask && !ASK_OK.includes(top)) return { intent: null, payload: {}, confidence: Math.min(0.5, s1 / 8), candidates: ranked.slice(0, 3).map(r => r[0]), question: true };
  if (s1 >= SURE && s1 - s2 >= GAP) return { intent: top, payload: payloadFor(top, raw), confidence: Math.min(1, 0.6 + (s1 - s2) / 10 + s1 / 20), candidates: [], question: ask };
  return { intent: null, payload: {}, confidence: Math.min(0.5, s1 / 8), candidates: ranked.slice(0, 3).map(r => r[0]), question: ask };
}
export const isSure = r => !!(r && r.intent && r.confidence >= 0.6);

/* ---------- 묻는 글 ---------- */
// 글 넣는 일(분명하면 부탁 꼬리가 있을 때 묻는 낱말이 있어도 명령)
const WRITE_IDS = ['purchase', 'message', 'letter', 'gongmun', 'report'];
// 어떻게·왜·뭐·무슨·차이·뜻: 묻는 말(명령 꼬리가 있어도)
export const HOW = /어떻게|어떡|무엇|뭐(?:야|예요|에요|지|가|를|부터|해야|하면|라고|\s*(?:있|써|해|하|넣|골라|고르))|뭔가요|뭔지|무슨|왜(?=\s|[?？요죠지냐]|$)|차이(?:가|는|점|를)?|뜻이|의미가|설명해/;
// 「~하는 법·방법·순서·요령」: 묻는 말(「신청하는 방법 안내 가정통신문」처럼 뒤에 「안내」가 오면 넣을 내용)
export const HOWTO = /(?:하|쓰|만들|작성하|넣|고치|바꾸|뽑|올리|내려받|채점하|정하|읽|보|고르)는\s*(?:법|방법|순서|요령)(?!\s*(?:안내|설명\s*자료))/;
// 언제·어디·누구·몇 시·방법·요령: 묻는 말일 수도, 넣을 내용일 수도(「누구나 참여 가능한 … 쪽지 써 줘」「방과후 신청 방법 안내 …」) —
// 글 넣는 일을 해 달라는 말(써 줘·만들어 주세요 …)이 있으면 넣을 내용(검토 I1)
const WEAK = /언제|어디|누가|누구|몇\s*(?:번째|개|명|시|일|분|쪽|자|번)|방법|요령|노하우/;
const MAKE = /(?:써|만들어|작성해|올려|정리해|보내|넣어|부탁해|짜)\s*(?:주세요|주실래요?|주시겠어요?|주실\s*수|줄래요?|줄\s*수|주라|줘)|부탁(?:해요|합니다|드려요|드립니다)\s*[.!?~]*$/;
// 되나요·돼?·가능해?·있어?·맞아?·괜찮아?: 예·아니오로 묻는 말(명령 꼬리가 없을 때)
const YESNO = /(?:해|써|넣어|봐|돼|되어|보내|올려|바꿔|안\s*써|안\s*해|없이\s*써)도\s*(?:돼|되|될|괜찮)|(?:돼요?|있어요?|없어요?|맞아요?)\s*[?？]|(?:되나요?|될까요?|되니|되죠|가능(?:해|한가|할까|하나|한지|해요)|있나요?|있을까요?|없나요?|맞나요?|괜찮(?:아|나|을까|은가)요?|인가요?|일까요?|나요)\s*[?？]*$/;
// 해 달라는 꼬리(「써 줄래?」「해 줄 수 있어?」는 묻는 말이 아니라 부탁)
const REQUEST = /(?:줘요?|주세요|줄래요?|주실래요?|주시겠어요?|주겠니|주라|줄\s*수\s*있(?:어|어요|나요|을까요?|니)|주실\s*수\s*있(?:어요|나요|을까요?)|할래요?|볼래요?|넣을래요?|하자|가자)\s*[?？!.~]*$/;
const ASK_OK = ['briefing', 'memoView']; // 묻는 꼴이어도 규칙대로(답이 곧 그 일)
/* 글이 묻는 말인지(줄이 여럿이거나 아주 길면 넣을 내용으로 봄) */
export function isQuestion(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t || t.length > 150 || /\n/.test(t)) return false;
  if (HOW.test(t) || HOWTO.test(t)) return true;
  if (WEAK.test(t)) return !MAKE.test(t);
  if (REQUEST.test(t)) return false;
  return YESNO.test(t) || /[?？]\s*$/.test(t);
}

/* ---------- 관찰 메모·기록·넘길 글의 이름 가리기 ---------- */
/* 줄 하나의 이름 가리기: 개인정보 규칙(stripNames: 직책·이름 칸·「김민수 학생」·전화번호 줄)에 더해
   흔한 성 + 흔한 이름(「김민수가」「박지훈」), 목록 밖 이름 + 사람 조사(「김다빈이」), 성 없는 「민준이가」「지호가」도 ○○○로(chat-names.js).
   memo: 행특 메모(을·를·과도, 홀로 쓴 이름도 — 잘못 가려도 덜 아까움) → { text, masked, dropped } */
// 채팅(행특 메모가 아님): 명단 줄이 아니면 이름이 많아 보여도 줄을 빼지 않고 이름만 가림(묻는 글이 남게 — 검토 M3)
const KEEP = line => !rosterLine(line);
function maskLine(text, memo) {
  const r = stripNames(String(text || '').replace(/\s*\n\s*/g, ' '), memo ? {} : { keep: KEEP });
  const p = maskPersons(r.text, { memo });
  return { text: p.text.replace(/\s+/g, ' ').trim(), masked: r.masked + p.masked, dropped: r.dropped };
}
/* 행특 메모에 저장하기 전 이름처럼 보이는 말 가리기(넓게) */
export const maskMemo = text => maskLine(text, true);
/* 채팅 기록·AI로 보내는 글: 전화번호·전자 우편은 그 자리만 가리고(줄을 통째로 빼면 같은 줄 내용까지 없어짐),
   명단·개인정보 열·명단 줄은 빼고(stripPersonal — 이름이 많아 보여도 명단이 아닌 줄은 남김), 줄마다 이름처럼 보이는 말은 가림 */
export function safeText(text) {
  const s = stripPersonal(maskContacts(text), { keep: KEEP }).text;
  return s.split('\n').map(l => maskLine(l, false).text).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/* 메뉴에 넘기는 글: 줄·띄어쓰기는 그대로 두고 전화번호·전자 우편과 사람 이름만 그 자리에서 ○○○로(「박지훈 결석계 가정통신문」 → 「○○○ 결석계 가정통신문」).
   명단 줄 빼기는 그 메뉴의 개인정보 규칙이 다시 함 */
export function handoffText(text) {
  return maskContacts(text).split('\n').map(l => maskPersons(l).text).join('\n');
}
/* 행특 메모 끝에 한 줄 더하기(있던 메모 끝의 빈칸·빈 줄은 정리하고 줄을 바꿔서) */
export const appendMemo = (prev, line) => { const p = String(prev || '').replace(/\s+$/, ''); return p.trim() ? `${p}\n${line}` : String(line || ''); };
/* 「[11. 6.] 토론에서 근거 들어 반론 잘함」 (date: 'YYYY-MM-DD') */
export function memoLine(body, date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return `${m ? `[${+m[2]}. ${+m[3]}.] ` : ''}${String(body || '').replace(/\s+/g, ' ').trim()}`;
}
