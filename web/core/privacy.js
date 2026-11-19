/* 개인정보 규칙: 사람 이름 모양, 명단·담임 표·전화번호 줄 빼기 (학생 이름은 저장하지도 AI로 보내지도 않음) */
import { getRaw } from './store.js';
export const SURNAME = new Set('김이박최정강조윤장임한오서신권황안송전홍유류고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경'.split(''));
const DOUBLE = /^(남궁|황보|제갈|선우|독고)[가-힣]{2}$/;
// 흔한 성씨 글자로 시작하는 세 글자 낱말 (이름으로 세지 않음)
const COMMON = new Set(['이야기', '우리반', '우리말', '우리들', '도서관', '한국어', '국어과', '기본적', '문제점', '안전한', '공동체', '주제별', '방과후', '진로반', '고학년', '저학년', '중학년', '정리함', '조사표', '기초적', '문화재', '노래방', '한마음', '나눔터',
  '이해도', '성취도', '주도성', '정체성', '연락처', '주인공', '지킴이', '유형별', '연수회', '정보화', '기본권', '성취감', '안전성', '선생님', '어머니',
  '전문성', '도덕성', '공공성', '우수성', '지속성', '연계성', '진정성', '성실성', '도우미',
  '나머지', '장애인', '한부모', '나이스', '경계선', '전학온', '이주민', '조부모', '임원진', '구글폼', '최우수', '모둠장',
  // 성씨 글자로 시작하는 흔한 외래어(「인터뷰를」을 이름 + 조사로 보던 것)
  '인터뷰', '유튜브', '마라톤', '오디션', '유니폼', '하모니', '마스크',
  // 「로·으로」가 흔히 붙는 낱말(「최우선으로」「지정석으로」「이번주로」「최종안으로」「방학중으로」 — 끝 글자가 이름에도 흔해 끝 글자 규칙으로 못 거르는 것.
  // 성 뒤 두 글자가 이름 같은 낱말(고정석·최근호·임시안)은 넣지 않음 — 바꾸는 말 앞에서 이름으로 가림)
  '최우선', '지정석', '이번주', '지난주', '성희롱', '예정순', '기재용', '소재용', '정동진', '최종안', '조정안', '기본안', '정부안', '수정안', '개선안', '계획안',
  '전염병', '연장전', '주관식', '방학중', '오전중', '오후중', '진행중', '공사중', '기간중', '최대치', '최소치', '최고치', '최저치', '연필심', '이월분', '원단위',
  '우체국', '진주성', '공산성', '연수원', '유치원', '변경안', '신설안', '명령조', '경어조', '구어조', '문어조', '기본조', '강약조', '홍보지', '정보지', '안내지',
  '이번호', '지난호', '소규모', '민원인', '지역민', '장마철', '소재지', '주소지',
  '강낭콩', '봉선화', '반대편', '육성회', '마무리', '금요일', '공휴일', '기념일', '서술형']);
// 전화번호: 0으로 시작하는 국번(앞에 숫자가 붙지 않음) — 「1200000 1150000」「3000 4000 5000」 같은 금액·숫자 줄은 아님
const PHONE = /(?<!\d)\(?0\d{1,2}\)?[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}/;

/* 이름처럼 보이는 낱말: 2~4글자 한글, 흔한 성으로 시작 (설문 답 판단용) */
export const looksLikeName = s => /^[가-힣]{2,4}$/.test(s) && SURNAME.has(s[0]);
/* 줄 안의 이름 세기: 세 글자 이름(흔한 낱말·조사로 끝나는 낱말 빼고)과 두 글자 성 + 두 글자 */
const ENDING = /[을를의에과와한할해요고며로도만적형께]$/;
const nameish = t => (/^[가-힣]{3}$/.test(t) && SURNAME.has(t[0]) && !COMMON.has(t) && !ENDING.test(t)) || DOUBLE.test(t);

/* 표 칸·직책 옆의 이름: 칸 전체가 세 글자 이름 모양 (조사·어미로 끝나면 낱말. 이름 끝에 흔한 「한·형·도」는 이름으로 봄) */
const PART = /[을를의에과와할해요고며로만적께]$/;
const cellName = c => (/^[가-힣]{3}$/.test(c) && SURNAME.has(c[0]) && !COMMON.has(c) && !PART.test(c)) || DOUBLE.test(c);
/* 칸·낱말 하나가 사람 이름 모양인지(세 글자 흔한 성 + 흔한 낱말 아님, 두 글자 성 + 두 글자) */
export const nameCell = c => cellName(String(c || ''));
const ROLE = '부?담임|부?회장|부?반장|서기|총무|학생|교사|전담|대표|교감|교장';
const ROLE_NAME = new RegExp(`((?:${ROLE})(?:\\s*[:：|]\\s*|\\s+))([가-힣]{3,6})(?![가-힣])`, 'g');
/* 이름 뒤 조사(「김민준과」「이서연이」「김민수에게」「이영희님께」「김하늘로」「김민준으로부터」) — 이름만 가리고 조사는 남김 */
const JOSA = /^(?:님|씨)?(?:에게|께서|한테|하고|이랑|까지|부터|처럼|보다|(?:으로|로)(?:부터)?|[은는이가을를과와의에도만께랑])?$/;
const batchimOf = ch => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : -1; };
/* ----- 「로·으로」: 흔한 조사가 아니라 이름 자리에서만 (core/chat-names.js도 같은 규칙) -----
   「예정대로」「노란색으로」「지원청으로」「최종안으로」처럼 성 글자로 시작하는 낱말에 아주 흔히 붙어서, 이름 + 로는
   같은 마디 몇 글자 안에 바꾸기·고르기 말이 올 때만(「김하늘을 이바다로 바꿔 줘」「학생회장은 김하늘로 정함」「한가람으로 뽑았다」),
   「로부터」는 연락·받기 말이 올 때만(「박솔빛으로부터 연락이 옴」). 다른 줄에서 이름으로 안 낱말은 core/redact.js가 어디서나 가림 */
// 「로·으로」가 흔히 붙는 말투·쓰임·차례·곳·색·부서·물건 낱말의 끝 글자 — 사람 이름 끝에는 드문 글자만(공문체로·표준어로·개조식으로·최종본으로·안내용으로·
// 이름순으로·인사말로·시간표로·공지글로·게시판으로·문법으로·노란색으로·지원청으로·기획팀으로·정규직으로·지하층으로·예정대로·소제목으로·기본값으로·기차역으로·
// 경복궁으로·민속촌으로·한글날로·소그룹으로·전학급으로·손글씨로·노트북으로·공용폰으로·서울숲으로·남이섬으로·임진각으로·정문쪽으로·이번달로·지우개로·고화질로·
// 반팔티로·강당앞으로·이월드로·안산시로). 호·석·원·철·모·조·인·지·안처럼 이름 끝에 흔한 글자는 넣지 않음(이상호·김동석·박상원·최광철·이승모·이상조·박재인 —
// 「최종안으로」「전염병으로」 같은 낱말은 흔한 낱말 목록 COMMON으로)
const RO_END = /[체어식본용순말표글판법색청팀직층대형목값역궁촌날룹급씨북폰숲섬각쪽달개질티앞뒤옆드시]$/;
// 끝 글자가 용·순·식·대·표·형이어도 흔한 이름(한재용·이영순·박정식·김종대·이영표·김태형). 「표준형으로」는 이준형과 같아 가림
const RO_GIVEN = new Set(('재용 병용 태용 영순 정순 미순 옥순 금순 복순 말순 '
  + '영식 정식 동식 태식 재식 경식 진식 성식 기식 명식 봉식 만식 덕식 용식 창식 원식 효식 병식 승식 광식 규식 근식 길식 남식 범식 순식 윤식 준식 춘식 충식 '
  + '택식 필식 혁식 현식 호식 홍식 환식 희식 관식 상식 종식 형식 '
  + '종대 영대 성대 진대 용대 석대 덕대 만대 봉대 춘대 정대 진표 영표 태표 동표 재표 성표 '
  + '태형 준형 민형 지형 승형 재형 상형 동형 진형 주형 우형 현형 영형 석형 용형 혁형 윤형 경형 호형 명형 범형 병형 은형').split(' '));
// 「~대로」로 흔히 쓰는 낱말(예정대로·지정대로·규정대로·정반대로) — 이름 「김정대」와 끝 두 글자가 같아 앞 글자로 가름
const DAERO = new Set('예정 지정 설정 규정 결정 확정 인정 약정 측정 책정 고정 선정 판정 조정 수정 배정 산정 개정 추정 협정 내정 특정 가정 정반'.split(' '));
const daeroNoun = n => /대$/.test(n) && DAERO.has(n.slice(0, -1));
export const roNoun = n => daeroNoun(n) || (RO_END.test(n) && !RO_GIVEN.has(n.slice(-2)));
/* 끝 글자가 낱말 끝과 같아도 흔한 이름인 것(박정식·김정대·이영표) — chat-names(「로」 자리)도 씀 */
export const roGivenName = n => RO_GIVEN.has(String(n).slice(-2)) && !daeroNoun(n);
// 바꾸기·고르기·적기 말(「김하늘을 이바다로 바꿔 줘」「학생회장은 김하늘로 정함」「담당자는 이바다로 적어 줘」)
const RO_VERB = '바꾸|바꿔|바꿈|바꿨|바꾼|바뀌|바뀜|바뀐|고쳐|고치|고침|고쳤|고친|정함|정했|정하|정해|정한|뽑|선출|변경|교체|임명|위촉|지정|추천|선정|선발|결정|'
  + '수정|대체|넣어|넣고|넣음|넣기|적어|적고|적음|적기|써\\s*(?:줘|주|넣)|올려|올림|기재|입력';
// 같은 마디 몇 글자 안, 또는 쉼표로 이은 둘째 자리 뒤(「회장은 이서연으로, 부회장은 김도윤으로 정함」)
const cueRe = verbs => new RegExp(`^(?:[^.,;:!?。\\n]{0,8}?(?:${verbs})|\\s*,\\s*[^.,;:!?。\\n]{0,12}?로\\s*[^.,;:!?。\\n]{0,8}?(?:${verbs}))`);
const RO_CUE = cueRe(RO_VERB);
// 흔한 이름 목록의 이름(core/chat-names.js)은 「로 해 줘·로 함」 앞에서도(「담당자를 김민준으로 해 줘」)
const RO_CUE_WIDE = cueRe(`${RO_VERB}|해\\s*(?:줘|주|달)|하기로|합니다|함(?![가-힣])|했|하였`);
// 「A에서 B로 바꿈」의 A(「발표자는 김하늘에서 이바다로 변경」)
const FROM_TO = new RegExp(`^\\s*[가-힣]{2,5}?(?:으로|로)\\s*[^.,;:!?。\\n]{0,8}?(?:${RO_VERB})`);
const FROM_CUE = /^[^.,;:!?。\n]{0,8}?(?:연락|전화|문자|편지|메일|메시지|소식|말씀|얘기|받|들었|들음|전해|부탁|요청|문의)/;
// 앞 낱말이 곳·색·날·꼴을 가리키면(「장소를 서울숲으로 바꿔 줘」「글씨 색을 하늘색으로」) 이름이 아님
const RO_THING = /(?:장소|곳|위치|색|색깔|색상|글꼴|글씨|날짜|요일|시간|형식|양식|방법|말투|문체|순서|차례|배경)\s*(?:을|를|은|는|도|만)?\s*$/;
/* 「로·으로(부터)」(j)가 붙은 자리가 이름 자리인지(바꾸기·고르기 말 앞, 곳·색 말 뒤가 아님): before·after = 낱말 앞·조사 뒤 글, wide: 흔한 이름 목록의 이름(「로 해 줘」도) */
export const roSpot = (j, before = '', after = '', wide = false) => !RO_THING.test(String(before)) && (/부터$/.test(j) ? FROM_CUE : wide ? RO_CUE_WIDE : RO_CUE).test(String(after));
/* 낱말 n + 「로·으로(부터)」가 이름인지: 이름 자리이고 n이 말투·쓰임·곳 낱말(roNoun)·흔한 낱말·직함(「장학사로 바꿈」)이 아님 */
export const roName = (n, j, before = '', after = '') => !roNoun(n) && !COMMON.has(n) && !TITLE.has(n) && roSpot(j, before, after);
/* 이름(n) + 조사(j)가 맞는 꼴인지: 「로」는 받침 없거나 ㄹ 받침 뒤, 「으로」는 그 밖의 받침 뒤(「강당으로」를 「강당으」+「로」로 자르지 않게).
   「로·으로」는 세 글자 넘는 이름만(「담당 주제로」「담당 지역으로」 같은 두 글자 낱말은 아님), 이름 자리일 때만(roName — 「님으로·씨로」는 늘).
   「에서」는 「A에서 B로 바꿈」의 A만 */
function josaOk(n, j, before = '', after = '') {
  if (j === '에서') return n.length >= 3 && !roNoun(n) && !COMMON.has(n) && !TITLE.has(n) && !RO_THING.test(String(before)) && FROM_TO.test(String(after));
  if (!JOSA.test(j)) return false;
  const m = /^(님|씨)?(으?)로/.exec(j);
  if (!m) return true;
  const b = batchimOf((m[1] || n).slice(-1));
  return n.length >= 3 && !/으$/.test(n) && (m[1] || roName(n, j, before, after)) && (m[2] ? b > 0 && b !== 8 : b === 0 || b === 8);
}
// 조사가 붙었을 때 이름으로 보지 않는 끝 글자 (이해도를·연수회를·홍보단을·공부방을처럼 「~도·~회·~단·~방」 낱말)
const NOUN_END = /[도감력화회권별제법실부생들표단방작비장품물집책판함증점식터반란]$/;
/* 낱말 → [이름, 조사] (긴 이름부터 — 이름 끝 글자가 조사로 남지 않게), 아니면 null. ok(이름, 조사), before·after: 낱말 앞·뒤 글(「로」 자리 보기) */
function nameJosa(w, ok, before = '', after = '') {
  for (let k = Math.min(4, w.length); k >= 2; k--) {
    const n = w.slice(0, k), j = w.slice(k);
    if (josaOk(n, j, before, after) && ok(n, j)) return [n, j];
  }
  return null;
}
const roleOk = (n, j) => cellName(n) && (!j || !NOUN_END.test(n));
/* 「이름 김민수」「이름: 김솔」「이 름 ( 최하은 )」「성명 김철수」(학생 스캔 글자층·양식). 쌍점·닫힌 괄호나 「6번」 바로 뒤면 두 글자 이름도,
   띄어쓰기만이면 세 글자 이름만(「이름 정하기」처럼 「~기」는 빼고). 「모둠·학급 이름: 하늘반」은 사람 이름이 아님 */
const LABEL_NAME = /((?:이\s?름|성\s?명|학생명)(\s*[:：(（[]\s*|\s+))([가-힣]{2,6})(?![가-힣])/g;
const LABEL_WORD = new Set(['한글', '한자', '서명', '기입', '기재', '정자', '정답', '미상', '공란', '실명', '본명', '영문', '도장', '성별', '표기', '이름', '성명', '성함']);
const GROUP = /(?:학급|모둠|(?<![\d)]\s*)반|팀|동아리|모임|단체|학교|기관|업체|회사|상호|단원|활동|행사|프로그램|노래|작품|책|과목|교과|파일|폴더|꽃|나무|동물|식물|곤충)\s*$/;
const labelOk = strong => (n, j) => (strong ? cellName(n) || (n.length === 2 && SURNAME.has(n[0]) && !LABEL_WORD.has(n))
  : cellName(n) && !/기$/.test(n)) && ((strong && !j) || !NOUN_END.test(n));
/* 이름 뒤 「학생·어머니·보호자」(「김민수 학생은」「3월 12일 김민수 어머니와 상담」). 뒤는 조사·띄어쓰기만(「학생회·학생부」는 아님) */
const AFTER = /(^|[^가-힣○])([가-힣]{3,4})(\s*)(학생|어머니|어머님|아버지|아버님|부모님|학부모|보호자)(?=$|[^가-힣]|[은는이가을를과와의에도께랑만한님])/g;
/* 조사 없이 홀로 쓴 이름: 조사·꾸밈말로 끝나는 낱말(정수가·어려운·원하는·나아간·어려움·마지막)과 「~반·~생·~상·~기·~자」 낱말은 빼고.
   「~은·~나·~인·~진·~준·~원」은 가운데가 이름에 흔한 글자일 때만(최하은·김유나·이서인·정우진·강민준 — 기준은·이거나·반장인·정해진·도와준·모둠원은 아님).
   ro: 바꾸는 말 앞 「로·으로」(「김성원으로 바꿔 줘」「박종인으로 정함」) — 가운데 글자를 더 넓게(상·성·종·경·기·명·광·덕·용·진·형·석·인) */
const plainOk = (n, ro = false) => cellName(n) && !NOUN_END.test(n) && !/[이가는을를의에도만와과로한할된던운간친른막움님기상왕년자]$/.test(n)
  && (n.length !== 3 || !/[은나인진준원]$/.test(n) || /[가나다도동리미민보서세소수승시아연영예우원유윤은재정주지채태하현혜효희]/.test(n[1])
    || (ro && /[상성종경기명광덕용진형석인]/.test(n[1])));
/* ---------- 사람 이름만 늘어놓은 칸·줄 (회의록 참석 칸, 보내지 않는 「참석: …」 명단 줄) ---------- */
// 사람이 아닌 말: 「~원·~자」 사람 무리(조리원·구성원·봉사자), 맡은 일·인원·쉼(서기·고문·기타·전부·조퇴·연가·출장)
const LIST_WORD = new Set(['조리원', '지도원', '구성원', '연구원', '공무원', '안내원', '경비원', '봉사자', '진행자', '기록자', '신청자', '지원자', '추천자', '인솔자', '기간제', '여러분',
  '서기', '고문', '기타', '정도', '전부', '남녀', '지각', '조퇴', '연가', '공가', '출장', '휴직', '인턴', '전산', '조원', '반원', '임원', '정원', '배석', '기록', '공석', '추가',
  '주관', '주최', '주무', '공동']);
// 직함·부서·무리 말의 끝(진로교사·지역위원·안전요원·전교생·연구부·기획팀·지원청·정규직·전학년·전학급). 「~관·~사·~장」 직함은 끝 글자가 아니라
// 직함 목록(TITLE)으로 — 끝 글자로 거르면 이재관·박정관·김태관 같은 이름도 빠짐
const ROLE_END = /(?:교사|강사|위원|요원|직원|[생부팀청과직년급])$/;
/* 사람만 적는 칸·줄의 낱말이 이름인지: 흔한 성으로 시작하는 두~세 글자(이승기·정영자·김수한·김솔·이산 — 조사 같은 끝 글자도), 두 글자 성 + 두 글자(남궁하늘).
   네 글자는 두 글자 성만(진로교사·안전요원은 아님). 흔한 낱말·직함·부서·인원·쉼 말(교장·담임·전원·주무관·연구부·조퇴)은 아님 */
const personWord = t => DOUBLE.test(t) || (/^[가-힣]{2,3}$/.test(t) && SURNAME.has(t[0]) && !COMMON.has(t) && !TWO_WORD.has(t) && !STAFF_WORD.has(t)
  && !LIST_WORD.has(t) && !TITLE.has(t) && !ROLE_END.test(t));
const LIST_SPLIT = /[\s|,，·、/()（）:：;[\]【】<>〈〉《》「」『』→←~]+/;
const words = text => String(text == null ? '' : text).split(LIST_SPLIT).map(t => t.replace(/^\d+[.)번]?/, '').replace(/^[^가-힣]+|[^가-힣]+$/g, ''));
/* 사람 이름만 늘어놓는 칸(회의록 참석 칸 — 「김하늘(교무), 이산, 정영자 주무관」)의 이름 → [이름] */
export const personNames = text => words(text).filter(personWord);
// 사람 명단 줄의 머리 말(쌍점 앞, 쌍점이 없으면 첫 이름 앞의 낱말): 참석·명단·위원·대상·학생·담당·출석·결석·담임·1모둠·신청자·발표자·우수상 …
// — 이 줄은 두 글자 이름(김솔·이산)도 배움
const PEOPLE_HEAD = /(?:참석|참석자|참가자|참여자|불참|명단|위원|대상|대상자|학생|담당|담당자|출석|결석|지각|조퇴|담임|교사|교원|강사|교직원|회원|임원|부원|모둠원|팀원|반원|당번|수상자|인솔|인솔자|보호자|학부모|모둠|조|반|팀|신청자|희망자|지원자|발표자|합격자|후보자|입상자|선수|대표|회장|반장|짝|[가-힣]단원|상)$/;
// 사람이 아닌 것을 늘어놓는 줄의 머리 말(준비물·물품·장소·일정·메뉴 …) — 그 줄의 낱말은 이름으로 배우지 않음(사람 머리 말이 같이 있으면 배움)
const THING_HEAD = /(?:준비물|물품|품목|재료|준비|장소|일정|내용|과목|교과|메뉴|식단|장비|도서|교재|예산|비품|교구|간식|학용품|기자재|견학지|방문지|체험지)$|^단원$/;
const PEOPLE_WORD = /학생|학부모|보호자|어머니|아버지|선생님|교사|담임|[가-힣]님(?![가-힣])/;
const BULLET = /^\s*(?:[-–—·•○◦▪■□*※>]+|\(?\d{1,2}[.)]|[가-하][.)])\s*/;
/* 보내지 않는 명단 줄에서 배울 이름 → [이름]: 이름 모양 낱말(세 글자 흔한 성 이름·두 글자 성 이름 — 직함·부서·인원 말은 빼고)을 모두,
   머리 말이 사람 무리면(「참석: …」「신청자: …」「(1모둠) …」) 두 글자 이름도.
   머리 말이 사람이 아닌 것의 목록이면(「준비물: 도시락, 우비, 안내문, 신분증」「[준비물] …」「메뉴: …」) 그 마디는 배우지 않음.
   머리 말 없는 목록(「김하늘, 이바다, 한가람」「1. 김하늘 2. 이바다 …」)·상 이름(「최우수상: …」)·「6-1: …」은 배움 */
/* 물건 머리 줄(「준비물: 도시락, 이바다, …」)의 이름 모양 낱말이 다른 줄에서 사람으로 쓰이는지(「이바다 기록 담당」「박솔빛은 사진 촬영」) — 그때만 이름으로 배움 */
// 바로 뒤 사람·맡은 일 말(「이바다 기록 담당」「박솔빛 학생」), 또는 주어(은·는·이·가) 뒤 같은 마디의 맡은 일 말(「이바다는 김치전 담당」 — 이때 「김치전 담당」의 김치전은 사람 아님)
const ROLE_NEXT = '학생|선생님|(?:님|씨|군|양)(?=$|[^가-힣]|[은는이가을를의께도만과와랑])|반장|회장|부장|대표|모둠장|도우미|기록|촬영|발표|사회|인솔|결석|지각|조퇴|발언|제안';
const ROLE_LATER = '담당|맡|기록|촬영|발표|사회|인솔';
export const personUse = (w, text) => new RegExp(`(?<![가-힣])${w}(?:\\s*(?:${ROLE_NEXT})|(?:은|는|이|가)\\s*[^.,;\\n]{0,12}?(?:${ROLE_LATER}))`).test(String(text || ''));
/* 맡은 일 말 앞의 세 글자 이름 모양 낱말(「사전 교육(이바다 인솔)」「박솔빛 기록 담당」) — 흔한 이름 목록에 없어도 사람으로 봄(지나치게 가리는 것이 새는 것보다 나음) */
// 사람 이름 모양(「연설문·소감문·모둠별·원어민·정보부」 같은 낱말은 아님 — -별, 가운데가 이름에 드문 -문·-서·-지…)
const roleWord = w => cellName(w) && personWord(w) && !/별$/.test(w) && (!(/[서지구형하리일효문이]$/.test(w) || NOUN_END.test(w)) || NAME_MID.test(w[1]));
// 맡은 일 머리 쌍점 뒤(「사회: 이규리」「기록: 박해리」「촬영: 김샛별」) — 이름 자리라서 끝 글자 규칙을 넓게(낱말 끝 -문·-별만 빼고, 한별·샛별·은별은 이름)
const colonWord = w => cellName(w) && personWord(w) && (!/[문별]$/.test(w) || /[한샛은새하]별$/.test(w) || (/문$/.test(w) && NAME_MID.test(w[1])));
const ROLE_COLON = /(?:사회자?|기록자?|촬영|발표자?|진행자?|도우미|심판|반주|인솔|인솔자|사진|사서|후보자?)\s*[:：]\s*([가-힣]{3}(?:\s*[,，·、]\s*[가-힣]{3}(?![가-힣]|\s*[:：]))*)(?![가-힣])|사서\s+([가-힣]{3})(?![가-힣])/g;
export const roleNames = (text, known = []) => {
  const t = String(text || ''), out = new Set([...new Set(words(t))].filter(w => roleWord(w) && personUse(w, t)));
  // 맡은 일 머리 뒤(「사회: 탁보결, 기록: 남다율」「도우미: 박솔빛, 이바다」「사서 탁보결」)
  for (const m of t.matchAll(ROLE_COLON)) for (const x of (m[1] || m[2] || '').split(/[,，·、]/).map(y => y.trim())) if (colonWord(x)) out.add(x);
  // 맡은 일 말 앞 이름에 쉼표로 이어진 이름(「(이바다, 남다율 인솔)」)
  for (const w of new Set([...out, ...[...new Set(words(t))].filter(w => cellName(w) && personUse(w, t)), ...known])) for (const m of t.matchAll(new RegExp(`((?:[가-힣]{3}\\s*[,，·、]\\s*)+)${w}(?![가-힣])`, 'g'))) for (const x of m[1].split(/[,，·、]/).map(y => y.trim())) if (roleWord(x)) out.add(x);
  return [...out];
};
/* weak: 물건 머리 마디의 이름 모양 낱말을 담을 배열(부르는 쪽이 personUse로 다른 줄에서 확인한 것만 배움) */
export function peopleNames(line, { weak = null } = {}) {
  const s = String(line == null ? '' : line), out = [];
  const seg = (head, body) => {
    const toks = head.replace(BULLET, '').match(/[가-힣]+/g) || [];
    const people = toks.some(t => PEOPLE_HEAD.test(t));
    // 사람이 아닌 것의 목록이라도 몸에 사람 말이 있으면(「내용: 김하늘, 이바다, 한가람 학생 표창」) 배움
    if (!people && toks.some(t => THING_HEAD.test(t)) && !PEOPLE_WORD.test(body)) {
      if (weak) for (const w of words(body)) if (cellName(w) && personWord(w) && !THING_END.test(w)) weak.push(w);
      return;
    }
    for (const w of words(body)) if (people ? personWord(w) : cellName(w) && personWord(w)) out.push(w);
  };
  // 쌍점이 없는 마디: 첫 이름 모양 낱말 앞이 머리 말
  const bare = t => { const m = [...t.matchAll(/[가-힣]+/g)].find(x => cellName(x[0]) || personWord(x[0])); if (m) seg(t.slice(0, m.index), t.slice(m.index)); };
  // 머리 말 쌍점: 시각(「09:00」)의 쌍점은 빼고. 머리 말 = 쌍점 바로 앞에 띄어쓰기로만 이어진 낱말들(「참석자 명단:」, 「(시상:」의 「시상」).
  // 그 앞쪽의 이름 모양 낱말(「…, 박솔빛 ※ 장소:」「박솔빛 (시상:」의 박솔빛)은 앞 목록 몫 — 머리 말에 묻혀 배우지 못하는 일이 없게
  const heads = [...s.matchAll(/[:：]/g)].map(m => m.index).filter(c => !(/\d/.test(s[c - 1] || '') && /\d/.test(s[c + 1] || ''))).map(c => {
    const m = /[0-9A-Za-z가-힣]+(?:[ \t]+[0-9A-Za-z가-힣]+)*[ \t]*$/.exec(s.slice(0, c));
    let at = m ? m.index : c;
    // 마지막 이름 모양 낱말 뒤부터가 머리 말(「1번 김하늘 … 정우진 외 2명 참석:」의 「외 2명 참석」)
    if (m) for (const w of m[0].matchAll(/[0-9A-Za-z가-힣]+/g)) {
      if (/^[가-힣]+$/.test(w[0]) && (cellName(w[0]) || personWord(w[0])) && !PEOPLE_HEAD.test(w[0]) && !THING_HEAD.test(w[0])) at = m.index + w.index + w[0].length;
    }
    return { at, c };
  });
  // 마디 k: 머리 말 = 그 쌍점 앞 머리 말, 몸 = 쌍점 뒤부터 다음 머리 말 앞까지
  bare(s.slice(0, heads.length ? heads[0].at : s.length));
  heads.forEach((h, k) => seg(s.slice(h.at, h.c), s.slice(h.c + 1, k + 1 < heads.length ? heads[k + 1].at : s.length)));
  return out;
}
/* 쉼표·가운뎃점으로 이은 목록의 한 항목: 이름 + 「(사정)」이나 「-맡은 일」, 다음 쉼표·줄 끝까지 */
// 괄호 안 목록(「(인솔: ○○○, 이바다)」「회장(○○○, 이바다)」)도: 앞 「(」·뒤 「)」를 항목 끝으로 봄
const ITEM = /(^|[\s:：(（]|[,，·、]\s*)(○○○|〔이름\d+〕|[가-힣]{3,4})(\s*(?:[(（][^)）\n]*[)）]|[-–]\s*[^,，·、\n]*))?\s*(?=[,，·、)）]|$)/g;
// 맡은 일 목록 머리(「1인 1역:」「역할:」「당번:」)
const DUTY = /(1인\s*1역|역할|당번)\s*[:：]/;
/* 가린 이름에 이어진 이름(「관심 학생: ○○○(정서 불안), 최하은(교우 관계)」「회장 ○○○, 이서연」)과
   맡은 일 목록의 「이름-맡은 일」(「1인 1역: 김민수-칠판 정리, 이서연-우유 배달」)을 가림. 「정답: 안중근-하얼빈, …」은 그대로 → [줄, 가린 수]
   (core/redact.js도 다른 규칙으로 가린 뒤 한 번 더 — 「협의 위원: ○○○, 이바다」) */
export function maskList(line) {
  const runs = [];
  let end = -1;
  for (const m of line.matchAll(ITEM)) {
    if (m.index !== end) runs.push([]);
    runs[runs.length - 1].push(m);
    end = m.index + m[0].length;
  }
  const hits = [], duty = DUTY.test(line);
  for (const run of runs) {
    const tied = run.some(m => m[2] === MASK || m[2][0] === '〔');
    for (const m of run) if (m[2] !== MASK && m[2][0] !== '〔' && plainOk(m[2]) && (tied || (duty && /^\s*[-–]/.test(m[3] || '')))) hits.push([m.index + m[1].length, m[2].length]);
  }
  let out = line;
  for (const [at, len] of hits.reverse()) out = out.slice(0, at) + MASK + out.slice(at + len);
  return [out, hits.length];
}
const CUE = new RegExp(`^(\\d{1,2}|남|여|남자|여자|${ROLE})$`), HEAD = /^(이름|성명|성 명|학생명|학생 이름)$/;
/* 표의 「이름·성명」 머리 칸인지 */
export const nameHead = c => HEAD.test(String(c || '').trim());
/* 「이름」 머리 칸 아래 칸이 이름인지: 세 글자 이름·두 글자 성 이름, 또는 흔한 성으로 시작하는 두~네 글자(이솔·박준·김가을처럼 두 글자·조사 끝 글자도).
   흔한 낱말(전체·합계·모두)·부서 이름은 아님 */
export const nameUnderHead = c => {
  const t = String(c || '').trim();
  return !HEAD.test(t) && (cellName(t) || (/^[가-힣]{2,4}$/.test(t) && SURNAME.has(t[0]) && !COMMON.has(t) && !TWO_WORD.has(t) && !STAFF_WORD.has(t)));
};
const NUMBERED = /^(\s*\d{1,2}[.)]?\s+)([가-힣]{3})(?=\s|$)/;
const numName = l => { const m = NUMBERED.exec(l); return !!m && cellName(m[2]); };
const NUM_SEX = /^\s*\d{1,2}[.)]?\s+[가-힣]{3}\s+(?:남|여|남자|여자)(?=\s|$)/;
export const MASK = '○○○';

/* ---------- 줄 안의 전화번호·전자 우편·주민등록번호 (줄은 남기고 그 자리만) ---------- */
// 주민등록번호·외국인등록번호(6자리-7자리, 뒷자리 첫 수 1~8), 나라 번호를 붙인 전화번호(+82 10-…, +82-2-…).
// 하이픈은 긴 줄표·전각(–·—·－)도, 뒷자리는 가린 꼴(3******·3xxxxxx)도
const RRN = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\s*[-‐‑‒–—−－]\s*[1-8][\d*＊xX●]{6}(?![\d*＊xX●])/, // 앞 여섯 자리가 생년월일 꼴일 때만(「300000-1500000원」 같은 금액 범위는 아님)
      INTL = /\+82[-.\s]?\(?0?\)?\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/;
export const RRN_RE = RRN, INTL_RE = INTL; // core/redact.js가 같은 규칙을 씀
export const CONTACT = new RegExp(`${PHONE.source}(?!\\d)|${RRN.source}|${INTL.source}|[\\w.+-]+@[\\w-]+\\.[\\w.]+`, 'g');
/* 「문의 031-123-4567」 → 「문의 ○○○」: 전화번호 줄을 통째로 빼면(stripNames) 같은 줄의 내용까지 없어질 때 먼저 */
export const maskContacts = text => String(text == null ? '' : text).replace(CONTACT, m => (m[0] === '(' && !m.includes(')') ? '(' + MASK : MASK)); // 「(031-…)」의 여는 괄호는 남김

/* ---------- 교직원 이름 (업무 인수인계서·가정통신문 번역) ---------- */
// 직함 앞의 이름: 「김가람 선생님」「이나래 부장님께」「김솔 선생님께」 (두 글자 이름은 「님」만 붙은 것은 빼고 — 선배님·원장님)
const STAFF_AFTER = /(^|[^가-힣])([가-힣]{2,3})(\s*)(선생님|선생|교사|부장님?|교감님?|교장님?|주무관님?|실무사님?|강사님?|담당자|님)(?=$|[^가-힣]|으로|로|부터|처럼|에게|한테|[은는이가을를과와의에도께랑만한])/g;
// 직함 뒤의 이름: 「강사 김가람」「담당: 박하늘」「3학년 부장 김솔」「담당 이나래에게」「인솔: 박솔빛」
// 「인솔」은 쌍점 뒤만(「인솔 방법은」「인솔 경로」는 이름이 아님) — 띄어 쓴 「인솔 박솔빛」은 maskStaff의 따로 규칙
const STAFF_BEFORE = /((?:강사|담당자?|주무관|선생님|부장|문의)(?:\s*[:：]\s*|\s+)|인솔자?\s*[:：]\s*)([가-힣]{2,5})(?![가-힣])/g;
const INSOL_SPACE = /(인솔자?\s+)([가-힣]{3})(?![가-힣])/g;
// 부서·과목 이름(세 글자)
const STAFF_WORD = new Set(['원어민', '방과후', '행정실', '교무실', '연구부', '정보부', '교무부', '학년부', '진로부', '안전부', '인성부', '체육부', '과학부', '돌봄반', '특수반', '전담반', '정보화', '보건실']);
// 직함 앞뒤에 흔히 오는 두 글자 낱말(흔한 성 글자로 시작해도 이름이 아님): 「전담 교사」「연구 부장」「우리 선생님」「강사 선정」「문의 전화」,
// 「님」이 붙는 직함(「부장 선생님께서」「담당 주임님께」의 선생·주임)
const TWO_WORD = new Set(('전담 연구 정보 안전 인성 진로 진학 도서 방송 문화 예술 인권 기획 홍보 공문 문서 국어 국제 한문 한국 도덕 기술 지리 지구 기초 기본 '
  + '우리 모든 여러 전체 전교 전원 전문 명예 원로 신규 신임 기간 남자 여자 이번 이전 지난 선배 하나 한분 한명 모두 연수 선정 기관 전화 '
  + '이름 성함 성명 명단 연락 경력 소개 위촉 배정 지정 신청 안내 지원 지도 지급 진행 채용 모집 공고 구인 선발 추천 문의 변경 인원 장소 '
  + '이상 이하 우선 모임 정함 배치 조정 조회 현황 명의 구성 방문 서명 도장 원고 강의 강연 소속 주소 연령 성별 경험 전공 명함 차량 강당 반별 주번 반장 '
  + '유치 초등 중등 고등 특기 방과 정규 주간 야간 오전 오후 당번 장학 인솔 임시 대체 기존 현장 강사 '
  + '선생 원장 주임 위원 박사 소장 차장 국장 기사').split(' '));
// 흔한 성 글자로 시작하는 직함(「주무관님께」「장학사님께」를 이름 + 님께로 보던 것). 끝 글자(관·사·장)로 거르면 이재관·박정관·김태관 같은 이름도 빠져서 목록으로
const TITLE = new Set(('주무관 장학관 장학사 연구관 연구사 교육연구관 교육연구사 조리사 영양사 사서 실무사 지도사 상담사 전담사 위생사 서기관 이사관 '
  + '공보관 정책관 기획관 조정관 지원관 경찰관 소방관 변호사 노무사 정원사 기관사 조종사 전도사 마술사 '
  + '위원장 이사장 교육장 교육감 구청장 공장장 도지사 시장 군수 '
  + '경관 이사 지사 이장 조장 기장 소장 원장 국장 차장 반장 주장 선장 함장').split(' '));
/* 직함 옆 낱말 하나가 교직원 이름 모양인지: 세 글자(흔한 성, 부서 이름·「~님」(주임님·원장님)·직함(주무관·장학사)·조리원 아님) 또는 두 글자(흔한 성 + 흔한 낱말 아님) */
export const staffName = n => (n.length === 3 ? cellName(n) && !STAFF_WORD.has(n) && !LIST_WORD.has(n) && !/님$/.test(n) && !TITLE.has(n)
  : n.length === 2 && SURNAME.has(n[0]) && !TWO_WORD.has(n) && !TITLE.has(n));
/* 「김솔께」「이나래에게」 → [이름, 조사] (세 글자 이름부터) */
const staffJosa = (w, before = '', after = '') => { for (const k of [3, 2]) { if (w.length < k) continue; const n = w.slice(0, k), j = w.slice(k); if (josaOk(n, j, before, after) && staffName(n)) return [n, j]; } return null; };
// 「인솔:」 뒤 — 사람 무리 말(남교사·전학년·정규직은 personWord가 뺌, 정담임·우천시는 목록)은 이름이 아님. 두 글자는 줄 끝·쉼표·괄호·「선생님」 앞만(「인솔: 이동 시」는 아님)
const INSOL_GROUP = new Set(['정담임', '부담임', '전담임', '우천시', '이동시', '각반별']);
const insolName = (n, after) => (n.length === 3 ? personWord(n) && !INSOL_GROUP.has(n) : /^\s*(?:$|[,，)）]|선생님|교사)/.test(after));
/* 직함 앞뒤의 교직원 이름만 ○○○로(그 밖의 글은 그대로 — 가린 자리를 되돌릴 수 있게 바꾸기만 함) → { text, masked } */
/* ---------- 연수 현황판 교직원 명단의 이름 ---------- */
/* 흔한 이름 목록에 없어도(「남다율」「탁보결」) 명단에 넣은 이름은 어느 메뉴에서든 가림 — 쪽지·공문·채팅·회의록 … (stripNames·maskStaff·maskPersons가 부름) */
let staffRaw, staffList = [], staffRe = null;
export function knownStaff() {
  const raw = getRaw('training:board');
  if (raw === staffRaw) return staffList;
  staffRaw = raw; staffList = []; staffRe = null;
  try {
    const b = raw ? JSON.parse(raw) : null;
    const ns = b && Array.isArray(b.staff) ? b.staff.map(s => String((s && s.name) || '').replace(/\s+/g, '')).filter(n => /^[가-힣]{2,4}$/.test(n) && !TITLE.has(n)) : [];
    staffList = [...new Set(ns)].sort((a, b) => b.length - a.length);
  } catch (e) { staffList = []; }
  return staffList;
}
// 이름 뒤: 끝·한글 아닌 글자·조사·호칭(「남다율님께」「탁보결 선생님」「남다율이랑」) — 「이산화탄소」처럼 이름 뒤에 다른 글자가 바로 붙은 낱말은 아님
const KNOWN_NEXT = '(?=$|[^가-힣]|은|는|이|가|을|를|의|에|께|와|과|도|만|님|씨|샘|쌤|한테|랑|부터|까지|로|으로|선생|교사|부장|주무관|실무사|강사|담임|교감|교장)';
export function maskKnown(text, names = knownStaff()) {
  const s = String(text == null ? '' : text);
  if (!names.length || !s) return { text: s, masked: 0 };
  const re = names === staffList ? (staffRe = staffRe || new RegExp(`(?<![가-힣])(?:${names.join('|')})${KNOWN_NEXT}`, 'g'))
    : new RegExp(`(?<![가-힣])(?:${names.join('|')})${KNOWN_NEXT}`, 'g');
  let masked = 0;
  const out = s.replace(re, () => (masked++, MASK));
  return { text: out, masked };
}
/* 사람 명단 머리 뒤(「미제출: 남다율, 탁보결」「아직 안 낸 분: …」「참석자: …」) — 목록의 이름 모양 낱말(두 글자 성 이름도)을 가림 */
const LIST_HEAD = /((?:미\s*제출(?:자)?|미\s*이수(?:자)?|미\s*응답(?:자)?|미\s*회신(?:자)?|미\s*참석(?:자)?|미\s*신청(?:자)?|미\s*완료(?:자)?|안\s*(?:낸|내신|하신|한)\s*(?:분|사람|선생님)들?|제출\s*안\s*(?:한|하신)\s*(?:분|사람|선생님)들?|참석자|참가자|참여자|불참자?|대상자|교직원)\s*(?:명단|현황)?\s*[:：]\s*)([^\n]*)/g;
const maskListBody = body => { let n = 0; const out = body.replace(/(^|[^가-힣])([가-힣]{2,6})(?![가-힣])/g, (m, pre, w, off, str) => {
  const r = staffJosa(w, str.slice(0, off + pre.length), str.slice(off + m.length));
  return r && (r[0].length === 2 || personWord(r[0])) ? (n++, pre + MASK + r[1]) : m;
}); return [out, n]; };
// 명단에 넣은 이름 + 사람 명단 머리 뒤 목록 → { text, masked } (stripNames·maskStaff가 먼저 부름)
export function maskPeopleList(text) {
  const k = maskKnown(text);
  let masked = k.masked;
  const s = k.text.replace(LIST_HEAD, (m, head, body) => { const [b, n] = maskListBody(body); masked += n; return head + b; });
  return { text: s, masked };
}
export function maskStaff(text) {
  const p = maskPeopleList(text);
  let masked = p.masked;
  const s = p.text
    .replace(STAFF_AFTER, (m, pre, n, sp, who) => (staffName(n) && !(n.length === 2 && who === '님') ? (masked++, pre + MASK + sp + who) : m))
    .replace(STAFF_BEFORE, (m, pre, w, off, str) => { const r = staffJosa(w, str.slice(0, off + pre.length), str.slice(off + m.length)); return r && (!/^인솔/.test(pre) || insolName(w.slice(0, w.length - r[1].length), str.slice(off + m.length))) ? (masked++, pre + MASK + r[1]) : m; })
    .replace(INSOL_SPACE, (m, pre, w) => (plainOk(w) && staffName(w) && personWord(w) && !INSOL_GROUP.has(w) && !(TWO_WORD.has(w.slice(0, 2)) && /[은는이가을를]$/.test(w)) ? (masked++, pre + MASK) : m));
  return { text: s, masked };
}

/* ---------- 조사가 붙은 이름 (「김민수의 보호자님께」「이서연이 상을 받았어요」) ---------- */
// 이름으로 보지 않는 끝 글자(「도시락을」「안내문을」「구급약을」「박물관을」 같은 낱말, 「장학사님께」「연구사님께」 같은 직함, 「공문체를」「표준어와」 같은 말투 낱말, 「지우개는」「정문앞에」) — 이름 끝에 드문 글자
const THING_END = /[락문약료비금권증품물판표실관장소당번처넷스사체어개앞]$/;
// 「~서·~지·~구·~형·~하·~리·~일·~효」는 가운데가 이름에 흔한 글자일 때만 이름(김민서·이은지·김준형 — 신청서·설문지·서술형·소통하는·이메일은 아님)
const NAME_MID = /[나도동리미민보서세소수승시아연영예우유윤은재정주준지채태하현혜효희성경상진용혁인선건]/;
/* ro: 바꾸는 말 앞 「로·으로」(josaOk가 이름 자리로 본 것) — 끝 글자가 낱말 끝과 같아도 흔한 이름(박정식·김영식·이영표, privacy RO_GIVEN)은 이름 */
const josaName = (n, ro = false) => (ro && roGivenName(n) && cellName(n))
  || (plainOk(n, ro) && !THING_END.test(n) && (!/[서지구형하리일효]$/.test(n) || NAME_MID.test(n[1])));
/* 흔한 성으로 시작하는 세 글자 낱말 + 조사(빈 조사는 아님)만 ○○○로 → { text, masked } */
export function maskJosaNames(text) {
  let masked = 0;
  const s = String(text == null ? '' : text).replace(/(^|[^가-힣○])([가-힣]{4,8})(?![가-힣])/g, (m, pre, w, off, str) => {
    const n = w.slice(0, 3), j = w.slice(3);
    if (!j || !josaOk(n, j, str.slice(0, off + pre.length), str.slice(off + m.length)) || !josaName(n, /^(?:님|씨)?으?로|^에서$/.test(j))) return m;
    masked++;
    return pre + MASK + j;
  });
  return { text: s, masked };
}

/* 명단·담임 표처럼 이름이 늘어선 줄과 전화번호 줄은 빼고, 한 줄에 하나씩 적힌 이름(임원·학생 명단 표, 직책 옆 이름, 「이름 김민수」 칸, 번호 명단)은 ○○○로 가림
   → { text, dropped(뺀 줄), masked(가린 이름) } */
/* keep(line): 이름이 많아 보여도 빼지 않을 줄(채팅의 묻는 글처럼 명단이 아닌 줄 — 이름만 가림). 전화번호 줄은 늘 뺌 */
export function stripNames(text, { keep = null } = {}) {
  const src = String(text || '');
  if (!src) return { text: '', dropped: 0, masked: 0 };
  let dropped = 0, masked = 0;
  const ls = src.split('\n').filter(line => {
    const words = line.split(/[\s|,·/()]+/).filter(t => /^[가-힣]+$/.test(t)), names = words.filter(nameish).length;
    const cells = line.includes('|') ? line.split('|').map(c => c.trim()).filter(Boolean) : [], cn = cells.filter(cellName).length;
    const many = (names >= 3 && names / words.length >= 0.6) || (cn >= 3 && cn / cells.length >= 0.5);
    if ((many && !(keep && keep(line))) || PHONE.test(line)) { dropped++; return false; }
    return true;
  });
  // 연수 현황판 교직원 명단의 이름·「미제출: …」 같은 사람 명단 머리 뒤 목록
  for (let i = 0; i < ls.length; i++) { const p = maskPeopleList(ls[i]); ls[i] = p.text; masked += p.masked; }
  // 직책 옆 이름 (「회장 김가람」, 「담임: 김준형」, 「회장 | 이나래」)
  for (let i = 0; i < ls.length; i++) ls[i] = ls[i].replace(ROLE_NAME, (m, pre, w, off, str) => { const r = nameJosa(w, roleOk, str.slice(0, off + pre.length), str.slice(off + m.length)); return r ? (masked++, pre + MASK + r[1]) : m; });
  // 이름 칸 (「6번 이름 김민수」「이름: 김솔」)
  for (let i = 0; i < ls.length; i++) ls[i] = ls[i].replace(LABEL_NAME, (m, pre, sep, w, off, str) => {
    const before = str.slice(0, off);
    if (GROUP.test(before)) return m;
    // 쌍점, 닫힌 괄호(「이름( 김솔 )」), 「6번」 바로 뒤면 두 글자 이름도
    const strong = /[:：]/.test(sep) || (/[(（[]/.test(sep) && /^\s*[)）\]]/.test(str.slice(off + m.length))) || /\d\s*\)?\s*번\s*$/.test(before);
    const r = nameJosa(w, labelOk(strong), before + pre, str.slice(off + m.length));
    return r ? (masked++, pre + MASK + r[1]) : m;
  });
  // 이름 뒤 「학생·어머니」(「김민수 학생은」), 쉼표로 이은 둘째 이름부터(「관심 학생: ○○○(정서 불안), 최하은(교우 관계)」)
  for (let i = 0; i < ls.length; i++) {
    ls[i] = ls[i].replace(AFTER, (m, pre, n, sp, who) => (plainOk(n) ? (masked++, pre + MASK + sp + who) : m));
    const [line, n] = maskList(ls[i]);
    ls[i] = line; masked += n;
  }
  // 표: 「이름」 머리 칸 아래(두 글자 이름도), 또는 번호·남녀·직책 옆에 이름이 세 줄 이상 있는 칸
  for (let a = 0; a < ls.length;) {
    if (!ls[a].includes('|')) { a++; continue; }
    let b = a;
    while (b < ls.length && ls[b].includes('|')) b++;
    const rows = ls.slice(a, b).map(l => l.split('|')), width = Math.max(...rows.map(r => r.length));
    for (let j = 0; j < width; j++) {
      const cell = r => (r[j] || '').trim(), head = rows.some(r => HEAD.test(cell(r)));
      // 「이름」 머리 칸 아래는 두 글자·조사 끝 글자 이름도(이솔·박준·김가을), 아니면 세 글자 이름만
      const hits = rows.filter(r => (head ? nameUnderHead : cellName)(cell(r)));
      const cued = hits.filter(r => CUE.test((r[j - 1] || '').trim()) || CUE.test((r[j + 1] || '').trim())).length;
      if (!(head && hits.length) && !(hits.length >= 3 && cued >= 3)) continue;
      for (const r of hits) { r[j] = r[j].replace(cell(r), MASK); masked++; }
    }
    rows.forEach((r, k) => { ls[a + k] = r.join('|'); });
    a = b;
  }
  // 번호 명단 (PDF처럼 칸 구분 없이 「1 김가람 남」이 세 줄 이상 이어짐 — 이름 뒤에 성별이 붙으면 두 줄도)
  for (let a = 0; a < ls.length;) {
    let b = a;
    while (b < ls.length && numName(ls[b])) b++;
    if (b - a >= 3 || (b - a === 2 && ls.slice(a, b).every(l => NUM_SEX.test(l)))) for (let k = a; k < b; k++) { ls[k] = ls[k].replace(NUMBERED, (m, pre) => pre + MASK); masked++; }
    a = Math.max(b, a + 1);
  }
  return { text: ls.join('\n'), dropped, masked };
}
