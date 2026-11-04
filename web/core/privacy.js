/* 개인정보 규칙: 사람 이름 모양, 명단·담임 표·전화번호 줄 빼기 (학생 이름은 저장하지도 AI로 보내지도 않음) */
export const SURNAME = new Set('김이박최정강조윤장임한오서신권황안송전홍유류고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경'.split(''));
const DOUBLE = /^(남궁|황보|제갈|선우|독고)[가-힣]{2}$/;
// 흔한 성씨 글자로 시작하는 세 글자 낱말 (이름으로 세지 않음)
const COMMON = new Set(['이야기', '우리반', '우리말', '우리들', '도서관', '한국어', '국어과', '기본적', '문제점', '안전한', '공동체', '주제별', '방과후', '진로반', '고학년', '저학년', '중학년', '정리함', '조사표', '기초적', '문화재', '노래방', '한마음', '나눔터',
  '이해도', '성취도', '주도성', '정체성', '연락처', '주인공', '지킴이', '유형별', '연수회', '정보화', '기본권', '성취감', '안전성', '선생님', '어머니',
  '전문성', '도덕성', '공공성', '우수성', '지속성', '연계성', '진정성', '성실성', '도우미']);
const PHONE = /\(?0\d{1,2}\)?[-.\s)]{0,2}\d{3,4}[-.\s]?\d{4}/;

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
const CUE = new RegExp(`^(\\d{1,2}|남|여|남자|여자|${ROLE})$`), HEAD = /^(이름|성명|성 명|학생명|학생 이름)$/;
const NUMBERED = /^(\s*\d{1,2}[.)]?\s+)([가-힣]{3})(?=\s|$)/;
const numName = l => { const m = NUMBERED.exec(l); return !!m && cellName(m[2]); };
export const MASK = '○○○';

/* 명단·담임 표처럼 이름이 늘어선 줄과 전화번호 줄은 빼고, 한 줄에 하나씩 적힌 이름(임원·학생 명단 표, 직책 옆 이름, 「이름 김민수」 칸, 번호 명단)은 ○○○로 가림
   → { text, dropped(뺀 줄), masked(가린 이름) } */
export function stripNames(text) {
  const src = String(text || '');
  if (!src) return { text: '', dropped: 0, masked: 0 };
  let dropped = 0, masked = 0;
  const ls = src.split('\n').filter(line => {
    const words = line.split(/[\s|,·/()]+/).filter(t => /^[가-힣]+$/.test(t)), names = words.filter(nameish).length;
    const cells = line.includes('|') ? line.split('|').map(c => c.trim()).filter(Boolean) : [], cn = cells.filter(cellName).length;
    if ((names >= 3 && names / words.length >= 0.6) || (cn >= 3 && cn / cells.length >= 0.5) || PHONE.test(line)) { dropped++; return false; }
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
