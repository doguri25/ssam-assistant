/* 평가 › 기재 점검 규칙 (스펙 2026-11-13 §4). AI 없이, 화면 없이 돌아감(시험).
   글 하나 → 표시 [{ kind, start, end, word, why }] — start·end는 글의 글자 자리(word = 글.slice(start, end)), why는 칩에 쓰는 까닭.
   종류: ban 기재하면 안 되는 것 · neg 단정적인 부정 표현 · name 학생 이름·「이 학생은」 주어 · dup 학생끼리 같은 문장 · len 글자 수(바이트) 초과.
   흔한 학교 말(「교내 대회」「학급 회장」「부모님께 감사」「수업 학습지」「과외 활동」)은 표시하지 않게 낱말마다 앞뒤를 봄 */
import { personSpans } from '../../../core/chat-names.js';

export const KINDS = ['ban', 'neg', 'name', 'dup', 'len'];
export const KIND_NAME = { ban: '기재 금지', neg: '부정 표현', name: '이름·주어', dup: '같은 문장', len: '글자 수' };

const WHY = {
  award: '학교 밖 대회·수상은 쓰지 않아요',
  award2: '교내 대회가 아니면 쓰지 않아요',
  cert: '자격증·인증시험은 쓰지 않아요',
  private: '학원·과외 같은 사교육은 쓰지 않아요',
  family: '부모·가족의 직업·경제 형편은 쓰지 않아요',
  abroad: '해외·어학연수는 쓰지 않아요',
  paper: '논문·출간·특허는 쓰지 않아요',
  scholar: '장학금은 쓰지 않아요',
  inst: '특정 대학·기관·상호 이름은 쓰지 않아요',
  neg: '성장 중심으로 바꿔 보세요',
  name: '학생 이름은 쓰지 않아요',
  subject: '「이 학생은」 같은 주어는 빼요',
  masked: '가린 이름(○○)은 빼요'
};

/* 문장 안에서 이 자리 앞에 학교 안 활동이라는 말(교내·학교·학급·학년·우리 반)이 있는지 */
const SCHOOL = /교내|학교|학급|학년|우리\s?반|반\s?대항|학생\s?자치|운동회|체육\s?대회|학예회|교실/;
function inSchool(text, m) {
  const head = text.slice(0, m.index), cut = Math.max(head.lastIndexOf('.'), head.lastIndexOf('!'), head.lastIndexOf('?'), head.lastIndexOf('\n'));
  return SCHOOL.test(head.slice(cut + 1));
}
// 이름 없는 기관(「역사박물관」「어린이박물관」「국립박물관」)의 앞말
const GENERIC = new Set(('학교 교내 우리 마을 동네 지역 어린이 작은 학급 시립 구립 국립 공립 도립 과학 역사 미술 자연사 민속 전통 생태 해양 농업 곤충 우주 교육 청소년 '
  + '지역아동 노인 장애인 종합 사회 향토 기상 천체 생명 환경 문화 예술 체육 발명 독도 평화 인권 안전 소방').split(' '));
const named = m => !GENERIC.has(m[1]) && !GENERIC.has(m[1].replace(/^(?:국립|시립|구립|도립|공립)/, ''));

/* 낱말 규칙: 앞에 둔 규칙이 먼저(같은 곳에 여럿 맞으면 앞 규칙의 까닭). skip(글, 맞은 것)이 참이면 넘어감, keep(맞은 것)이 거짓이어도 넘어감 */
const FAM = '(?:외할아버지|외할머니|할아버지|할머니|큰아버지|작은아버지|부모님|부모|아버지|아버님|어머니|어머님|아빠|엄마|부친|모친|보호자|삼촌|이모부|이모|고모부|고모|누나|언니|오빠|가족|형)';
const JOB = '(?:직업|직장|회사|근무|일하|일터|사업|운영|의사|한의사|변호사|판사|교수|교사|공무원|군인|경찰관|소방관|간호사|약사|회사원|사장|목사|기자|연구원|대기업|월급|연봉|수입|재산|형편|실직)';
const AWARD = '(?:금상|은상|동상|대상|최우수상|우수상|장려상|특상|입선|입상|수상|준우승|우승)';
const CONTEST = '(?:대회|올림피아드|공모전|전람회|경진\\s?대회)';
const BAN = [
  // 학교 밖 대회·수상
  ['award', /교외\s?(?:[가-힣]{1,8}\s){0,2}(?:대회|경시\s?대회|경연\s?대회|수상|입상)/g],
  ['award', new RegExp(`(?:전국|국제|세계|(?:시|도|구|군)\\s?단위|지역\\s?예선|본선\\s?진출|교육청|교육지원청|특별시|광역시|특별자치도)\\s?(?:[가-힣]{1,8}\\s){0,2}[가-힣]{0,6}${CONTEST}`, 'g')],
  ['award', /올림피아드/g],
  ['award', /(?:교육감|교육장|시장|도지사|구청장|군수|국회의원|장관|대통령|국무총리|총리|협회장|연맹\s?회장|총재|이사장|청장)\s?(?:상장|상|표창)(?=$|[^가-힣]|을|를|과|와|이|에|으로|도|까지|만)/g],
  ['award', /(?:교육감|교육장|시장|도지사|구청장|군수|일보|신문사?|방송사?)배\s?(?:[가-힣]{1,8}\s){0,2}[가-힣]{0,6}대회/g],
  ['award', /[가-힣]{0,8}\s?(?:경시|경연)\s?대회/g, { skip: inSchool }],
  ['award2', new RegExp(`${CONTEST}(?:에서|에|의)?\\s?(?:[가-힣]{1,6}\\s){0,2}${AWARD}`, 'g'), { skip: inSchool }],
  // 자격증·인증시험
  ['cert', /자격증|인증\s?시험|검정\s?시험|능력\s?(?:검정\s?)?시험|급수\s?(?:시험|취득|자격)|자격(?:을|를)?\s?(?:취득|획득|땄|땀|따)/g],
  ['cert', /토익|토플|텝스|토셀|오픽|아이엘츠|컴활|컴퓨터\s?활용\s?능력|워드\s?프로세서\s?자격|정보처리\s?기능사|한자\s?(?:능력|급수)|한국사\s?능력|한국어\s?능력\s?시험|국가\s?공인|(?:수학|영어|한자|독서)\s?인증/g],
  ['cert', /\b(?:TOEIC|TOEFL|TEPS|TOSEL|HSK|JLPT|JPT|IELTS|OPIc|ITQ|MOS|DIAT|TOPIK)\b/gi],
  ['cert', /(?:태권도|검도|합기도|유도|바둑|주산|암산)\s?(?:[가-힣]{1,4}\s)?\d+\s?(?:급|단|품)/g],
  ['cert', /\d+\s?(?:급|단|품)\s?(?:을|를|에)?\s?(?:취득|획득|합격|땄|땀|딴|따)/g],
  // 사교육
  ['private', /(?<![대과])학원|과외(?!\s?(?:활동|시간))|사교육|선행\s?학습|교습소|공부방|레슨|인강|인터넷\s?강의|(?:방문\s?)?학습지\s?(?:선생님|교사|회원|수업)|방문\s?학습지?/g],
  ['private', /구몬|눈높이\s?(?:수학|영어|국어|학습|교육)|빨간펜|씽크빅|윙크\s?학습|밀크T|엘리하이|홈런\s?학습|아이스크림\s?홈런|튼튼영어|웅진\s?(?:학습|씽크빅)|재능\s?(?:교육|학습지)/g],
  // 부모·가족의 직업·직장·경제 형편: 「부모님이 의사」「아버지가 운영하시는」「어머니의 직업」(「부모님께 감사」「부모님과 함께」는 아님)
  ['family', new RegExp(`(?<![가-힣])${FAM}(?:(?:께서|이|가|은|는|의)\\s?|\\s)(?:[가-힣]{1,6}\\s){0,2}${JOB}`, 'g')],
  ['family', /기초\s?생활\s?수급|수급자|차상위|저소득|가정\s?형편|형편이\s?(?:어려|넉넉|좋지|나쁘|힘들|어렵)|경제적(?:으로)?\s?(?:어려|넉넉|풍족|곤란|여유)|맞벌이/g],
  // 해외·어학연수
  ['abroad', /어학\s?연수|해외\s?(?:연수|캠프|봉사|유학)|조기\s?유학|단기\s?유학|유학(?:을|를)?\s?(?:다녀|가서|간|갔|했|중|생활|경험)|어학\s?캠프|국제\s?캠프|홈스테이|교환\s?학생/g],
  ['abroad', /영어\s?캠프/g, { skip: inSchool }],
  // 논문·출간·특허
  ['paper', /소논문|논문|학술지|출간|저서|특허|실용\s?신안|등단|책을\s?(?:펴냄|펴내|냈|출판)/g],
  ['paper', /출판(?!사)/g, { skip: (t, m) => /문집|신문|학급|교내/.test(t.slice(Math.max(0, m.index - 12), m.index)) }],
  // 장학금
  ['scholar', /장학금|장학생|장학\s?재단|장학\s?증서/g],
  // 특정 대학·기관·상호 이름
  ['inst', /[가-힣]{2,8}대학교|(?:서울대(?!공원)|연세대|고려대|카이스트|포스텍|하버드)|\b(?:KAIST|POSTECH|MIT)\b|영재\s?교육원|영재원/g],
  ['inst', /([가-힣]{2,10})(박물관|과학관|미술관|기념관|천문대|연구소|연구원|재단|협회|복지관|수련원|수련관)/g, { keep: named }],
  ['inst', /유튜브|유튜버|틱톡|인스타그램|페이스북|카카오톡|카톡|네이버|구글|마인크래프트|로블록스|포켓몬|레고|파워포인트|엑셀|스크래치(?!\s?(?:기법|페이퍼|아트|화|북))|엔트리\s?(?:코딩|프로그램|으로|로)|아이패드|갤럭시|크롬북|미리캔버스|캔바(?!스)|패들렛|띵커벨|클래스카드|챗\s?GPT|삼성|롯데|이마트|스타벅스|맥도날드|현대자동차/g],
  ['inst', /\b(?:PPT|ChatGPT|LG)\b/g]
];
// 단정적인 부정 표현 (「부족한 점을 찾아 보완함」「처음에는 하지 못했으나」「게을리하지 않고」는 아님)
const NEG = [
  /산만(?:함|하다|하고|하여|해서|하며|한|해|하나|하지만|했)?/g,
  /게으(?:름|르다|르고|르며|른)|게을러|나태|태만|무기력|무성의|무책임(?:함|하)/g,
  /부족(?:함(?!이\s?없)|하다|하여|해서|하고|하며|하나|하지만|합니다|했|하였)|부족한\s?편/g,
  /(?<!잘)(?:못함|못한다|못하(?:고|며|여|나|지만)(?![가-힣])|못하는\s?편|못했(?:다|음))/g,
  /문제가\s?(?:있음|있다|많음|많다|있는\s?편)(?![가-힣])|문제\s?행동|문제아|말썽/g,
  /불량(?!\s?식품)|폭력적|공격적|반항적|비협조적|소극적(?:임|이다|인\s?편)|이기적(?:임|이다|인\s?(?:편|모습|행동))/g,
  /고집이\s?(?:셈|세다|세고|센\s?편)|버릇(?:이)?\s?없|예의(?:가)?\s?없|의욕(?:이)?\s?없|성의(?:가)?\s?없|주의력(?:이)?\s?(?:없|결핍|부족)/g,
  /(?:이해력|집중력|학습\s?능력|기초\s?학력|실력|사회성|학업\s?성취도?)(?:이|가)?\s?(?:떨어짐|떨어진다|떨어지고|떨어져|낮음|낮다|뒤처짐|뒤처진다|약함)|뒤처짐|뒤떨어짐/g,
  /거짓말을\s?(?:자주|잘|일삼)|지각이\s?잦|자주\s?(?:다툼|싸움|다투|싸우)/g
];
// 「이 학생은」「해당 학생은」 같은 주어, 문장 첫머리의 「학생은」, 가린 이름(○○)
const SUBJECT = [
  [/(?<![가-힣])(?:이|그|본|해당|위|동)\s?(?:학생|아동|어린이)(?:은|는|이|가)(?![가-힣])|(?<![가-힣])본인(?:은|이)(?![가-힣])|(?:^|(?<=[.!?]\s{0,2}))학생(?:은|이)(?=\s)/g, 'subject'],
  [/○{2,}/g, 'masked']
];

const find = (text, re, fn) => { re.lastIndex = 0; let m; while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } fn(m); } };
const issue = (text, kind, start, end, why) => ({ kind, start, end, word: text.slice(start, end), why });
/* 같은 종류에서 겹친 표시는 하나로(앞 규칙의 까닭, 칸은 합침) */
function merge(list) {
  const out = [];
  for (const x of list) {
    const y = out.find(o => o.kind === x.kind && x.start < o.end && o.start < x.end);
    if (y) { y.start = Math.min(y.start, x.start); y.end = Math.max(y.end, x.end); y._m = 1; }
    else out.push({ ...x });
  }
  return out;
}

/* 나이스 기준 세기: 한글 등 3바이트, 영문·숫자·공백 1바이트, 줄바꿈 2바이트 (evaluate.js neisBytes와 같음) */
const enc8 = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const chBytes = ch => (ch === '\n' ? 2 : ch === '\r' ? 0 : enc8 ? enc8.encode(ch).length : (ch.codePointAt(0) < 0x80 ? 1 : ch.codePointAt(0) < 0x800 ? 2 : ch.codePointAt(0) < 0x10000 ? 3 : 4));
export const neisBytes = t => [...String(t == null ? '' : t)].reduce((b, ch) => b + chBytes(ch), 0);
/* 한도 { max, unit: 'char'|'byte' }를 넘으면 { n, max, unit, cut(넘기 시작하는 글자 자리) }, 아니면 null. 글자 수는 공백 포함(줄바꿈 \r은 뺌) */
export function overLimit(text, limit) {
  const t = String(text == null ? '' : text), max = Number(limit && limit.max) || 0, unit = limit && limit.unit === 'byte' ? 'byte' : 'char';
  if (max <= 0) return null;
  let n = 0, cut = -1, i = 0;
  for (const ch of t) {
    n += unit === 'byte' ? chBytes(ch) : ch === '\r' ? 0 : 1;
    if (cut < 0 && n > max) cut = i;
    i += ch.length;
  }
  return n > max ? { n, max, unit, cut } : null;
}

/* 글 하나 점검. limit: { max, unit } — 그 화면 설정의 한도(없으면 글자 수는 보지 않음) */
export function checkText(text, { limit = null } = {}) {
  const t = String(text == null ? '' : text);
  const out = [];
  for (const [cat, re, opt = {}] of BAN) find(t, re, m => {
    if (opt.skip && opt.skip(t, m)) return;
    if (opt.keep && !opt.keep(m)) return;
    // 앞의 빈칸은 표시하지 않음(「\s?경시대회」처럼 낱말 앞을 넓게 본 규칙)
    const lead = m[0].length - m[0].trimStart().length;
    out.push(issue(t, 'ban', m.index + lead, m.index + m[0].trimEnd().length, WHY[cat]));
  });
  for (const re of NEG) find(t, re, m => out.push(issue(t, 'neg', m.index, m.index + m[0].length, WHY.neg)));
  for (const s of personSpans(t)) out.push(issue(t, 'name', s.start, s.end, WHY.name));
  for (const [re, w] of SUBJECT) find(t, re, m => out.push(issue(t, 'name', m.index, m.index + m[0].length, WHY[w])));
  const o = overLimit(t, limit);
  if (o) {
    const u = o.unit === 'byte' ? '바이트' : '자';
    let at = o.cut;
    while (at < t.length - 1 && /\s/.test(t[at])) at++; // 넘친 곳 앞 빈칸은 표시하지 않음
    out.push(issue(t, 'len', at, t.length,`최대 ${o.max.toLocaleString()}${u}보다 ${(o.n - o.max).toLocaleString()}${u} 길어요`));
  }
  return sortIssues(merge(out).map(x => { const { _m, ...y } = x; return _m ? { ...y, word: t.slice(y.start, y.end) } : y; }));
}
const sortIssues = l => l.sort((a, b) => a.start - b.start || KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.end - b.end);

/* 문장 나누기: 마침표·물음표·느낌표(와 뒤따르는 닫는 따옴표·괄호)까지 한 문장 → [{ t, start, end }] (앞뒤 빈칸은 뺌) */
export function splitSentences(text) {
  const t = String(text == null ? '' : text), out = [];
  const re = /[^.!?。\n]+(?:[.!?。]+["'”’)\]]*)?|[.!?。]+/g;
  let m;
  while ((m = re.exec(t))) {
    const raw = m[0], lead = raw.length - raw.trimStart().length, body = raw.trim();
    if (body) out.push({ t: body, start: m.index + lead, end: m.index + lead + body.length });
  }
  return out;
}
/* 같은 문장인지 볼 열쇠: 빈칸을 모두 빼고 끝의 마침표(·물음표·느낌표)를 뺌 */
export const sentenceKey = s => String(s == null ? '' : s).replace(/\s+/g, '').replace(/[.!?。]+$/, '');
const MIN_KEY = 8; // 이보다 짧은 조각(「성실함.」 등)은 같은 문장으로 세지 않음

/* 같은 묶음(group — 같은 화면·같은 평가) 안에서 학생(who) 2명 이상이 쓴 같은 문장 → [{ key, text, refs: [{ id, who, start, end }], whos }] */
export function findDuplicates(items) {
  const by = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || it.who == null || it.who === '') continue;
    for (const s of splitSentences(it.text)) {
      const key = sentenceKey(s.t);
      if (key.length < MIN_KEY) continue;
      const k = `${it.group || ''}\u0000${key}`;
      if (!by.has(k)) by.set(k, { key, text: s.t, refs: [] });
      by.get(k).refs.push({ id: it.id, who: it.who, start: s.start, end: s.end });
    }
  }
  const out = [];
  for (const g of by.values()) {
    const whos = [...new Set(g.refs.map(r => r.who))];
    if (whos.length < 2) continue;
    out.push({ ...g, whos: whos.every(w => typeof w === 'number') ? whos.sort((a, b) => a - b) : whos });
  }
  return out;
}
const whoText = w => (typeof w === 'number' ? `${w}번` : String(w));
function othersText(list) {
  const shown = list.slice(0, 5).map(whoText).join('·');
  return list.length > 5 ? `${shown} 외 ${list.length - 5}명` : shown;
}

/* 여러 글 점검: items [{ id, text, who?, group?, limit? }] → { list: [{ id, issues }], groups(같은 문장), texts(점검한 글 수), count(고칠 곳 수), byKind } */
export function checkItems(items) {
  const arr = (Array.isArray(items) ? items : []).filter(Boolean);
  const groups = findDuplicates(arr);
  const list = arr.map(it => {
    const issues = checkText(it.text, { limit: it.limit });
    for (const g of groups) for (const r of g.refs) {
      if (r.id !== it.id) continue;
      const others = g.whos.filter(w => w !== it.who);
      issues.push(issue(String(it.text), 'dup', r.start, r.end, `다른 학생(${othersText(others)}) 글과 같은 문장이에요`));
    }
    return { id: it.id, issues: sortIssues(issues) };
  });
  const byKind = Object.fromEntries(KINDS.map(k => [k, 0]));
  for (const x of list) for (const i of x.issues) byKind[i.kind]++;
  return { list, groups, texts: arr.length, count: list.reduce((n, x) => n + x.issues.length, 0), byKind };
}
