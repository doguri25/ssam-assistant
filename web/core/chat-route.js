/* 「쌤」 채팅의 글 → 할 일 (스펙 2026-11-06 D·F). 화면 없이 돌아감(시험).
   먼저 앱 규칙(낱말)으로 고르고(routeText), 모르면 AI(notes)에 할 일 목록을 주고 하나 고르게 함(aiRoutePrompt·normAiRoute).
   「3번 …」은 행동특성 관찰 메모(parseMemo·maskMemo·memoLine) */
import { stripNames, nameCell, MASK } from './privacy.js';

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
  ['weekly', '주간학습안내', '다음 주 주간학습안내'],
  ['today', '오늘 수업', '오늘 수업·시간표'],
  ['progress', '진도표', '진도표·시수'],
  ['memo', '관찰 메모', '학생 번호로 행동특성 관찰 메모 남기기'],
  ['memoView', '메모 보기', '학생 번호의 관찰 메모 보기'],
  ['briefing', '오늘 할 일', '오늘 할 일·급한 일 모아 보기'],
  ['handover', '인수인계서', '업무 인수인계서 만들기'],
  ['aikey', 'AI 키', '설정 › AI 키 넣기·바꾸기']
];
const IDS = INTENTS.map(i => i[0]);
export const intentLabel = id => (INTENTS.find(i => i[0] === id) || [])[1] || '';
export const LANGS = [['vi', '베트남어'], ['zh', '중국어(간체)'], ['ru', '러시아어'], ['en', '영어']];
export const langLabel = id => (LANGS.find(l => l[0] === id) || [])[1] || '';
const LANG_RE = [['vi', /베트남/], ['zh', /중국|중문|간체/], ['ru', /러시아/], ['en', /영어|영문|english/i]];
const langOf = t => (LANG_RE.find(([, re]) => re.test(t)) || [''])[0];

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
  ['weekly', /주간\s*학습|주학|다음\s*주\s*안내/, 3.5],
  ['today', /오늘\s*(?:수업|시간표)/, 3.5],
  ['progress', /진도표|시수/, 3], ['progress', /진도/, 2],
  ['briefing', /브리핑|오늘\s*(?:할\s*일|할일|일정)|할\s*일\s*(?:알려|보여|뭐|있)|급한\s*(?:일|것)|챙길\s*(?:일|것)/, 4],
  ['handover', /인수\s*인계/, 4],
  ['aikey', /(?:AI|ai|Ai|에이아이)\s*(?:키|설정)|API\s*키|api\s*key|키\s*(?:넣|바꾸|바꿔|설정|등록)/i, 4],
  ['translate', /번역/, 4]
];
const SURE = 2.5, GAP = 1; // 이만큼 이상이고 둘째보다 GAP 이상 앞서면 분명함

/* 명령 꼬리(「써 줘」「만들어 주세요」「해 줘」…)와 맨 끝 마침표 */
const TAIL = /(?:^|\s)(?:좀\s*)?(?:써|만들어|작성해|올려|해|부탁해|짜|정리해|보내|열어|보여|처리해|넣어|챙겨|알려)\s*(?:줘|주세요|줄래요?|주라|봐|볼래|요)?\s*[.!?~]*\s*$|(?:^|\s)부탁(?:해요|합니다|드려요)?\s*[.!?~]*\s*$/;
const HEAD = /^(?:좀\s*)?(?:써|만들어|작성해|올려|부탁해)\s*(?:줘|주세요|줄래요?)?\s*[:,.]?\s*/;
const trimTail = t => { let s = String(t || '').trim(), p; do { p = s; s = s.replace(TAIL, '').trim(); } while (s !== p && s); return s.replace(/[\s,.:;·]+$/, '').replace(/^[\s,.:;·]+/, '').replace(HEAD, ''); };
/* 할 일 낱말을 뺀 남은 글 (내용이 있는지 보려고) */
const KW = {
  purchase: /품의\s*(?:서|초안)?(?:\s*초안)?/g, message: /(?:안내\s*)?쪽지(?:로|를|\s*초안)?/g, letter: /가정\s*통신문(?:으로|을|\s*초안)?|안내장(?:으로|을)?/g,
  gongmun: /공문(?:\s*처리)?(?:을|으로)?/g, report: /결과\s*보고(?:서)?(?:를)?/g
};
// 글 앞의 「가정통신문 써 줘」「쪽지:」 (뒤에 내용이 이어질 때)
const LEAD = /^(?:가정\s*통신문|안내장|(?:안내\s*)?쪽지|공문|결과\s*보고(?:서)?)(?:\s*(?:좀\s*)?(?:써|만들어|작성해|처리해|정리해)\s*(?:줘|주세요|줄래요?)?)?\s*[:,.]\s*|^(?:가정\s*통신문|안내장|(?:안내\s*)?쪽지|공문|결과\s*보고(?:서)?)\s*(?:좀\s*)?(?:써|만들어|작성해|처리해|정리해)\s*(?:줘|주세요|줄래요?)\s*[:,.]?\s*/;
const meat = s => String(s || '').replace(/[^가-힣a-zA-Z0-9]/g, '');
/* 할 일마다 메뉴에 넘길 것: 품의는 품의 낱말까지 뺀 글(앱이 품목으로 읽음), 쪽지·가정통신문·공문·결과 보고는 명령 꼬리만 뺀 글(내용이 없으면 빈칸) */
export function payloadFor(intent, text) {
  const t = String(text || '').trim();
  if (intent === 'purchase') { const s = trimTail(t.replace(KW.purchase, ' ').replace(/\s+/g, ' ')); return { text: meat(s).length >= 2 ? s : '' }; }
  if (['message', 'letter', 'gongmun', 'report'].includes(intent)) {
    const s = trimTail(t).replace(LEAD, ''), rest = meat(s.replace(KW[intent], ''));
    return { text: rest.length >= 4 ? s : '' };
  }
  if (intent === 'translate') return { lang: langOf(t) };
  if (intent === 'memo' || intent === 'memoView') { const m = parseMemo(t); return m ? { nos: m.nos, body: m.body } : { nos: [], body: '' }; }
  return {};
}

/* 「3번 …」「3·5번 …」「3, 5번 …」「3번, 5번 …」「3~5번 …」 → { nos, body }. 번호는 1~60, 범위는 40명까지 */
const NOS = /^\s*((?:\d{1,2}\s*번?\s*(?:[·,、/~\-]|와|과|하고|랑|\s)\s*)*\d{1,2})\s*번(?:\s*학생)?(?:은|는|이|이가|이는|의)?(?=\s|[,:.]|$)\s*[,:.]?\s*/;
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

/* 글 → { intent, payload, confidence(0~1), candidates([할 일 id], 애매할 때 2~3개) }. 모르면 intent null */
export function routeText(text) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const none = { intent: null, payload: {}, confidence: 0, candidates: [] };
  if (!t) return none;
  const scores = {};
  for (const [id, re, w] of RULES) if (re.test(t)) scores[id] = Math.max(scores[id] || 0, w);
  // 번역: 언어 낱말 + (번역·통신문·안내장·「~어로」)면 번역(가정통신문보다 앞섬)
  const lang = langOf(t);
  if (lang && /번역|통신문|안내장|(?:어|문)\s*으?로/.test(t)) scores.translate = 5;
  // 관찰 메모: 글 앞이 「n번」
  const memo = parseMemo(t);
  if (memo && !NOT_MEMO.test(memo.body)) {
    if (VIEW.test(memo.body)) return { intent: 'memoView', payload: { nos: memo.nos }, confidence: 1, candidates: [] };
    if (meat(memo.body).length >= 2) {
      const other = Object.entries(scores).filter(([id]) => !['briefing'].includes(id)).sort((a, b) => b[1] - a[1]);
      // 번호 뒤 글에 다른 할 일 낱말이 크게 있으면(「3번 단원평가 채점」) 애매함
      if (!other.length || other[0][1] < SURE || MEMO_END.test(memo.body)) return { intent: 'memo', payload: { nos: memo.nos, body: memo.body }, confidence: 0.9, candidates: [] };
      return { intent: null, payload: {}, confidence: 0.4, candidates: ['memo', ...other.slice(0, 2).map(o => o[0])] };
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return none;
  const [top, s1] = ranked[0], s2 = ranked[1] ? ranked[1][1] : 0;
  if (s1 >= SURE && s1 - s2 >= GAP) return { intent: top, payload: payloadFor(top, t), confidence: Math.min(1, 0.6 + (s1 - s2) / 10 + s1 / 20), candidates: [] };
  return { intent: null, payload: {}, confidence: Math.min(0.5, s1 / 8), candidates: ranked.slice(0, 3).map(r => r[0]) };
}
export const isSure = r => !!(r && r.intent && r.confidence >= 0.6);

/* ---------- AI에 묻기 (규칙으로 모를 때) ---------- */
const AI_IDS = IDS.filter(id => !['memo', 'memoView'].includes(id)); // 번호 메모는 규칙으로만
export function aiRoutePrompt(text) {
  return ['[채팅 할 일 고르기]',
    '학교 선생님이 업무 도우미 앱의 채팅 칸에 쓴 글입니다. 아래 할 일 중 선생님이 바라는 것을 고르세요.',
    ...INTENTS.filter(([id]) => AI_IDS.includes(id)).map(([id, , d]) => `- ${id}: ${d}`),
    '분명하면 intent에 하나, 애매하면 intent는 ""로 두고 candidates에 가까운 차례로 2~3개, 맞는 것이 없으면 intent "none".',
    'translate면 lang에 vi(베트남어)·zh(중국어 간체)·ru(러시아어)·en(영어) 중 하나(모르면 "").',
    'JSON 하나로만 답하세요. {"intent":"purchase","candidates":[],"lang":""}',
    '[글]', String(text || '').slice(0, 1500)].join('\n');
}
export function normAiRoute(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const ok = id => AI_IDS.includes(id);
  const intent = ok(o.intent) ? o.intent : null;
  const candidates = [...new Set((Array.isArray(o.candidates) ? o.candidates : []).filter(ok))].filter(c => c !== intent).slice(0, 3);
  const lang = LANGS.some(l => l[0] === o.lang) ? o.lang : '';
  return { intent, candidates, lang, none: o.intent === 'none' };
}

/* ---------- 관찰 메모 ---------- */
const JOSA = /^(?:님|씨)?(?:에게|께서|한테|하고|이랑|까지|부터|처럼|보다|[은는이가을를과와의에도만께랑])?$/;
// 이름으로 보지 않는 끝 글자(「~함·~임·~음」 같은 메모 끝말, 「~감·~력·~기」 같은 낱말)
const WORD_END = /[이가는을를의에도만와과로한할된던운간친른막움님기상왕년자함임음됨옴짐줌봄둠씀큼냄킴림침힘히게서말글길날일들적력감]$/;
/* 메모에 저장하기 전 이름처럼 보이는 말 가리기: 개인정보 규칙(stripNames: 직책·이름 칸·「김민수 학생」·전화번호 줄)에 더해
   흔한 성으로 시작하는 세 글자 낱말(+조사)도 ○○○로 → { text, masked } */
export function maskMemo(text) {
  const r = stripNames(String(text || '').replace(/\s*\n\s*/g, ' '));
  let masked = r.masked;
  const t = r.text.replace(/[가-힣]{2,8}/g, w => {
    for (const k of [4, 3]) {
      const n = w.slice(0, k), j = w.slice(k);
      if (n.length === k && JOSA.test(j) && nameCell(n) && !WORD_END.test(n)) { masked++; return MASK + j; }
    }
    return w;
  });
  return { text: t.replace(/\s+/g, ' ').trim(), masked, dropped: r.dropped };
}
/* 행특 메모 끝에 한 줄 더하기(있던 메모 끝의 빈칸·빈 줄은 정리하고 줄을 바꿔서) */
export const appendMemo = (prev, line) => { const p = String(prev || '').replace(/\s+$/, ''); return p.trim() ? `${p}\n${line}` : String(line || ''); };
/* 「[11. 6.] 토론에서 근거 들어 반론 잘함」 (date: 'YYYY-MM-DD') */
export function memoLine(body, date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return `${m ? `[${+m[2]}. ${+m[3]}.] ` : ''}${String(body || '').replace(/\s+/g, ' ').trim()}`;
}
