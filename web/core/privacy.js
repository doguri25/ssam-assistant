/* 개인정보 규칙: 사람 이름 모양, 명단·담임 표·전화번호 줄 빼기 (학생 이름은 저장하지도 AI로 보내지도 않음) */
export const SURNAME = new Set('김이박최정강조윤장임한오서신권황안송전홍유류고문양손배백허남심노하곽성차주우구민진나지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경'.split(''));
const DOUBLE = /^(남궁|황보|제갈|선우|독고)[가-힣]{2}$/;
// 흔한 성씨 글자로 시작하는 세 글자 낱말 (이름으로 세지 않음)
const COMMON = new Set(['이야기', '우리반', '우리말', '우리들', '도서관', '한국어', '국어과', '기본적', '문제점', '안전한', '공동체', '주제별', '방과후', '진로반', '고학년', '저학년', '중학년', '정리함', '조사표', '기초적', '문화재', '노래방', '한마음', '나눔터']);
const PHONE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;

/* 이름처럼 보이는 낱말: 2~4글자 한글, 흔한 성으로 시작 (설문 답 판단용) */
export const looksLikeName = s => /^[가-힣]{2,4}$/.test(s) && SURNAME.has(s[0]);
/* 줄 안의 이름 세기: 세 글자 이름(흔한 낱말·조사로 끝나는 낱말 빼고)과 두 글자 성 + 두 글자 */
const ENDING = /[을를의에과와한할해요고며로도만적형께]$/;
const nameish = t => (/^[가-힣]{3}$/.test(t) && SURNAME.has(t[0]) && !COMMON.has(t) && !ENDING.test(t)) || DOUBLE.test(t);

/* 명단·담임 표처럼 이름이 늘어선 줄(이름 셋 이상, 한글 낱말의 60% 이상)과 전화번호가 든 줄을 뺌 → { text, dropped } */
export function stripNames(text) {
  const src = String(text || '');
  if (!src) return { text: '', dropped: 0 };
  let dropped = 0;
  const kept = src.split('\n').filter(line => {
    const words = line.split(/[\s|,·/()]+/).filter(t => /^[가-힣]+$/.test(t)), names = words.filter(nameish).length;
    if ((names >= 3 && names / words.length >= 0.6) || PHONE.test(line)) { dropped++; return false; }
    return true;
  });
  return { text: kept.join('\n'), dropped };
}
