/* 개인정보 규칙: 사람 이름 모양, 명단·담임 표·전화번호 줄 빼기 (학생 이름은 저장하지도 AI로 보내지도 않음) */
export const SURNAME = new Set('김이박최정강조윤장임한오서신권황안송전홍유류고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경'.split(''));
const DOUBLE = /^(남궁|황보|제갈|선우|독고)[가-힣]{2}$/;
// 흔한 성씨 글자로 시작하는 세 글자 낱말 (이름으로 세지 않음)
const COMMON = new Set(['이야기', '우리반', '우리말', '우리들', '도서관', '한국어', '국어과', '기본적', '문제점', '안전한', '공동체', '주제별', '방과후', '진로반', '고학년', '저학년', '중학년', '정리함', '조사표', '기초적', '문화재', '노래방', '한마음', '나눔터',
  '이해도', '성취도', '주도성', '정체성', '연락처', '주인공', '지킴이', '유형별', '연수회', '정보화', '기본권', '성취감', '안전성', '선생님', '어머니',
  '전문성', '도덕성', '공공성', '우수성', '지속성', '연계성', '진정성', '성실성', '도우미',
  '나머지', '장애인', '한부모', '나이스', '경계선', '전학온', '이주민', '조부모', '임원진', '구글폼', '최우수']);
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
/* 이름 뒤 조사(「김민준과」「이서연이」「김민수에게」「이영희님께」) — 이름만 가리고 조사는 남김 */
const JOSA = /^(?:님|씨)?(?:에게|께서|한테|하고|이랑|까지|부터|처럼|보다|[은는이가을를과와의에도만께랑])?$/;
// 조사가 붙었을 때 이름으로 보지 않는 끝 글자 (이해도를·연수회를·홍보단을·공부방을처럼 「~도·~회·~단·~방」 낱말)
const NOUN_END = /[도감력화회권별제법실부생들표단방작비장품물집책판함증점식터반란]$/;
/* 낱말 → [이름, 조사] (긴 이름부터 — 이름 끝 글자가 조사로 남지 않게), 아니면 null. ok(이름, 조사) */
function nameJosa(w, ok) {
  for (let k = Math.min(4, w.length); k >= 2; k--) {
    const n = w.slice(0, k), j = w.slice(k);
    if (JOSA.test(j) && ok(n, j)) return [n, j];
  }
  return null;
}
const roleOk = (n, j) => cellName(n) && (!j || !NOUN_END.test(n));
/* 「이름 김민수」「이름: 김솔」「이 름 ( 최하은 )」「성명 김철수」(학생 스캔 글자층·양식). 쌍점·닫힌 괄호나 「6번」 바로 뒤면 두 글자 이름도,
   띄어쓰기만이면 세 글자 이름만(「이름 정하기」처럼 「~기」는 빼고). 「모둠·학급 이름: 하늘반」은 사람 이름이 아님 */
const LABEL_NAME = /((?:이\s?름|성\s?명|학생명)(\s*[:：(（[]\s*|\s+))([가-힣]{2,6})(?![가-힣])/g;
const LABEL_WORD = new Set(['한글', '한자', '서명', '기입', '기재', '정자', '정답', '미상', '공란', '실명', '본명', '영문', '도장', '성별', '표기']);
const GROUP = /(?:학급|모둠|(?<![\d)]\s*)반|팀|동아리|모임|단체|학교|기관|업체|회사|상호|단원|활동|행사|프로그램|노래|작품|책|과목|교과|파일|폴더|꽃|나무|동물|식물|곤충)\s*$/;
const labelOk = strong => (n, j) => (strong ? cellName(n) || (n.length === 2 && SURNAME.has(n[0]) && !LABEL_WORD.has(n))
  : cellName(n) && !/기$/.test(n)) && ((strong && !j) || !NOUN_END.test(n));
/* 이름 뒤 「학생·어머니·보호자」(「김민수 학생은」「3월 12일 김민수 어머니와 상담」). 뒤는 조사·띄어쓰기만(「학생회·학생부」는 아님) */
const AFTER = /(^|[^가-힣○])([가-힣]{3,4})(\s*)(학생|어머니|어머님|아버지|아버님|부모님|학부모|보호자)(?=$|[^가-힣]|[은는이가을를과와의에도께랑만한님])/g;
/* 조사 없이 홀로 쓴 이름: 조사·꾸밈말로 끝나는 낱말(정수가·어려운·원하는·나아간·어려움·마지막)과 「~반·~생·~상·~기·~자」 낱말은 빼고.
   「~은·~나·~인·~진·~준·~원」은 가운데가 이름에 흔한 글자일 때만(최하은·김유나·이서인·정우진·강민준 — 기준은·이거나·반장인·정해진·도와준·모둠원은 아님) */
const plainOk = n => cellName(n) && !NOUN_END.test(n) && !/[이가는을를의에도만와과로한할된던운간친른막움님기상왕년자]$/.test(n)
  && (n.length !== 3 || !/[은나인진준원]$/.test(n) || /[가나다도동리미민보서세소수승시아연영예우원유윤은재정주지채태하현혜효희]/.test(n[1]));
/* 쉼표·가운뎃점으로 이은 목록의 한 항목: 이름 + 「(사정)」이나 「-맡은 일」, 다음 쉼표·줄 끝까지 */
const ITEM = /(^|[\s:：]|[,，·、]\s*)(○○○|[가-힣]{3,4})(\s*(?:[(（][^)）\n]*[)）]|[-–]\s*[^,，·、\n]*))?\s*(?=[,，·、]|$)/g;
// 맡은 일 목록 머리(「1인 1역:」「역할:」「당번:」)
const DUTY = /(1인\s*1역|역할|당번)\s*[:：]/;
/* 가린 이름에 이어진 이름(「관심 학생: ○○○(정서 불안), 최하은(교우 관계)」「회장 ○○○, 이서연」)과
   맡은 일 목록의 「이름-맡은 일」(「1인 1역: 김민수-칠판 정리, 이서연-우유 배달」)을 가림. 「정답: 안중근-하얼빈, …」은 그대로 → [줄, 가린 수] */
function maskList(line) {
  const runs = [];
  let end = -1;
  for (const m of line.matchAll(ITEM)) {
    if (m.index !== end) runs.push([]);
    runs[runs.length - 1].push(m);
    end = m.index + m[0].length;
  }
  const hits = [], duty = DUTY.test(line);
  for (const run of runs) {
    const tied = run.some(m => m[2] === MASK);
    for (const m of run) if (m[2] !== MASK && plainOk(m[2]) && (tied || (duty && /^\s*[-–]/.test(m[3] || '')))) hits.push([m.index + m[1].length, m[2].length]);
  }
  let out = line;
  for (const [at, len] of hits.reverse()) out = out.slice(0, at) + MASK + out.slice(at + len);
  return [out, hits.length];
}
const CUE = new RegExp(`^(\\d{1,2}|남|여|남자|여자|${ROLE})$`), HEAD = /^(이름|성명|성 명|학생명|학생 이름)$/;
const NUMBERED = /^(\s*\d{1,2}[.)]?\s+)([가-힣]{3})(?=\s|$)/;
const numName = l => { const m = NUMBERED.exec(l); return !!m && cellName(m[2]); };
export const MASK = '○○○';

/* ---------- 줄 안의 전화번호·전자 우편 (줄은 남기고 그 자리만) ---------- */
export const CONTACT = new RegExp(`${PHONE.source}(?!\\d)|[\\w.+-]+@[\\w-]+\\.[\\w.]+`, 'g');
/* 「문의 031-123-4567」 → 「문의 ○○○」: 전화번호 줄을 통째로 빼면(stripNames) 같은 줄의 내용까지 없어질 때 먼저 */
export const maskContacts = text => String(text == null ? '' : text).replace(CONTACT, m => (m[0] === '(' && !m.includes(')') ? '(' + MASK : MASK)); // 「(031-…)」의 여는 괄호는 남김

/* ---------- 교직원 이름 (업무 인수인계서·가정통신문 번역) ---------- */
// 직함 앞의 이름: 「김가람 선생님」「이나래 부장님께」「김솔 선생님께」 (두 글자 이름은 「님」만 붙은 것은 빼고 — 선배님·원장님)
const STAFF_AFTER = /(^|[^가-힣])([가-힣]{2,3})(\s*)(선생님|선생|교사|부장님?|교감님?|교장님?|주무관님?|실무사님?|강사님?|담당자|님)(?=$|[^가-힣]|[은는이가을를과와의에도께랑만한])/g;
// 직함 뒤의 이름: 「강사 김가람」「담당: 박하늘」「3학년 부장 김솔」「담당 이나래에게」
const STAFF_BEFORE = /((?:강사|담당자?|주무관|선생님|부장|문의)(?:\s*[:：]\s*|\s+))([가-힣]{2,5})(?![가-힣])/g;
// 부서·과목 이름(세 글자)
const STAFF_WORD = new Set(['원어민', '방과후', '행정실', '교무실', '연구부', '정보부', '교무부', '학년부', '진로부', '안전부', '인성부', '체육부', '과학부', '돌봄반', '특수반', '전담반', '정보화', '보건실']);
// 직함 앞뒤에 흔히 오는 두 글자 낱말(흔한 성 글자로 시작해도 이름이 아님): 「전담 교사」「연구 부장」「우리 선생님」「강사 선정」「문의 전화」
const TWO_WORD = new Set(('전담 연구 정보 안전 인성 진로 진학 도서 방송 문화 예술 인권 기획 홍보 공문 문서 국어 국제 한문 한국 도덕 기술 지리 지구 기초 기본 '
  + '우리 모든 여러 전체 전교 전원 전문 명예 원로 신규 신임 기간 남자 여자 이번 이전 지난 선배 하나 한분 한명 모두 연수 선정 기관 전화 '
  + '이름 성함 성명 명단 연락 경력 소개 위촉 배정 지정 신청 안내 지원 지도 지급 진행 채용 모집 공고 구인 선발 추천 문의 변경 인원 장소 '
  + '이상 이하 우선 모임 정함 배치 조정 조회 현황 명의 구성 방문 서명 도장 원고 강의 강연 소속 주소 연령 성별 경험 전공 명함 차량 강당 반별 주번 반장 '
  + '유치 초등 중등 고등 특기 방과 정규 주간 야간 오전 오후 당번 장학 인솔 임시 대체 기존 현장 강사').split(' '));
/* 직함 옆 낱말 하나가 교직원 이름 모양인지: 세 글자(흔한 성, 부서 이름 아님) 또는 두 글자(흔한 성 + 흔한 낱말 아님) */
export const staffName = n => (n.length === 3 ? cellName(n) && !STAFF_WORD.has(n) : n.length === 2 && SURNAME.has(n[0]) && !TWO_WORD.has(n));
/* 「김솔께」「이나래에게」 → [이름, 조사] (세 글자 이름부터) */
const staffJosa = w => { for (const k of [3, 2]) { if (w.length < k) continue; const n = w.slice(0, k), j = w.slice(k); if (JOSA.test(j) && staffName(n)) return [n, j]; } return null; };
/* 직함 앞뒤의 교직원 이름만 ○○○로(그 밖의 글은 그대로 — 가린 자리를 되돌릴 수 있게 바꾸기만 함) → { text, masked } */
export function maskStaff(text) {
  let masked = 0;
  const s = String(text == null ? '' : text)
    .replace(STAFF_AFTER, (m, pre, n, sp, who) => (staffName(n) && !(n.length === 2 && who === '님') ? (masked++, pre + MASK + sp + who) : m))
    .replace(STAFF_BEFORE, (m, pre, w) => { const r = staffJosa(w); return r ? (masked++, pre + MASK + r[1]) : m; });
  return { text: s, masked };
}

/* ---------- 조사가 붙은 이름 (「김민수의 보호자님께」「이서연이 상을 받았어요」) ---------- */
// 이름으로 보지 않는 끝 글자(「도시락을」「안내문을」「구급약을」「박물관을」 같은 낱말) — 이름 끝에 드문 글자
const THING_END = /[락문약료비금권증품물판표실관장소당번처넷스]$/;
// 「~서·~지·~구·~형·~하·~리·~일·~효」는 가운데가 이름에 흔한 글자일 때만 이름(김민서·이은지·김준형 — 신청서·설문지·서술형·소통하는·이메일은 아님)
const NAME_MID = /[나도동리미민보서세소수승시아연영예우유윤은재정주준지채태하현혜효희성경상진용혁인선건]/;
const josaName = n => plainOk(n) && !THING_END.test(n) && (!/[서지구형하리일효]$/.test(n) || NAME_MID.test(n[1]));
/* 흔한 성으로 시작하는 세 글자 낱말 + 조사(빈 조사는 아님)만 ○○○로 → { text, masked } */
export function maskJosaNames(text) {
  let masked = 0;
  const s = String(text == null ? '' : text).replace(/(^|[^가-힣○])([가-힣]{4,6})(?![가-힣])/g, (m, pre, w) => {
    const n = w.slice(0, 3), j = w.slice(3);
    if (!j || !JOSA.test(j) || !josaName(n)) return m;
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
  // 직책 옆 이름 (「회장 김가람」, 「담임: 김준형」, 「회장 | 이나래」)
  for (let i = 0; i < ls.length; i++) ls[i] = ls[i].replace(ROLE_NAME, (m, pre, w) => { const r = nameJosa(w, roleOk); return r ? (masked++, pre + MASK + r[1]) : m; });
  // 이름 칸 (「6번 이름 김민수」「이름: 김솔」)
  for (let i = 0; i < ls.length; i++) ls[i] = ls[i].replace(LABEL_NAME, (m, pre, sep, w, off, str) => {
    const before = str.slice(0, off);
    if (GROUP.test(before)) return m;
    // 쌍점, 닫힌 괄호(「이름( 김솔 )」), 「6번」 바로 뒤면 두 글자 이름도
    const strong = /[:：]/.test(sep) || (/[(（[]/.test(sep) && /^\s*[)）\]]/.test(str.slice(off + m.length))) || /\d\s*\)?\s*번\s*$/.test(before);
    const r = nameJosa(w, labelOk(strong));
    return r ? (masked++, pre + MASK + r[1]) : m;
  });
  // 이름 뒤 「학생·어머니」(「김민수 학생은」), 쉼표로 이은 둘째 이름부터(「관심 학생: ○○○(정서 불안), 최하은(교우 관계)」)
  for (let i = 0; i < ls.length; i++) {
    ls[i] = ls[i].replace(AFTER, (m, pre, n, sp, who) => (plainOk(n) ? (masked++, pre + MASK + sp + who) : m));
    const [line, n] = maskList(ls[i]);
    ls[i] = line; masked += n;
  }
  // 표: 「이름」 머리 칸 아래, 또는 번호·남녀·직책 옆에 이름이 세 줄 이상 있는 칸
  for (let a = 0; a < ls.length;) {
    if (!ls[a].includes('|')) { a++; continue; }
    let b = a;
    while (b < ls.length && ls[b].includes('|')) b++;
    const rows = ls.slice(a, b).map(l => l.split('|')), width = Math.max(...rows.map(r => r.length));
    for (let j = 0; j < width; j++) {
      const cell = r => (r[j] || '').trim(), hits = rows.filter(r => cellName(cell(r)));
      const head = rows.some(r => HEAD.test(cell(r)));
      const cued = hits.filter(r => CUE.test((r[j - 1] || '').trim()) || CUE.test((r[j + 1] || '').trim())).length;
      if (!(head && hits.length) && !(hits.length >= 3 && cued >= 3)) continue;
      for (const r of hits) { r[j] = r[j].replace(cell(r), MASK); masked++; }
    }
    rows.forEach((r, k) => { ls[a + k] = r.join('|'); });
    a = b;
  }
  // 번호 명단 (PDF처럼 칸 구분 없이 「1 김가람 남」이 세 줄 이상 이어짐)
  for (let a = 0; a < ls.length;) {
    let b = a;
    while (b < ls.length && numName(ls[b])) b++;
    if (b - a >= 3) for (let k = a; k < b; k++) { ls[k] = ls[k].replace(NUMBERED, (m, pre) => pre + MASK); masked++; }
    a = Math.max(b, a + 1);
  }
  return { text: ls.join('\n'), dropped, masked };
}
