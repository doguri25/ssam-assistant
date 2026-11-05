// 11-05 버그 고치기(공통·설정): 견적서를 학생 답안으로 보지 않음, 이름 뒤 「학생·어머니」·쉼표로 이은 이름 가리기, 금액 줄은 전화번호가 아님
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripNames, nameCell, looksLikeName } from '../../web/core/privacy.js';
import { classify } from '../../web/core/inbox-classify.js';

/* 흔한 견적서: 「공급자」 줄 아래 「상 호 : …」「성 명 : … (인)」을 따로 적음 */
const QUOTE = ['견 적 서', '2026년 11월 5일', '쌤초등학교 귀하', '공급자', '등록번호: 123-45-67890', '상 호: 쌤문구', '성 명: 홍길동 (인)', '주 소: 서울시 중구',
  '품명\t규격\t수량\t단가\t금액', '색연필\t24색\t30\t5000\t150000', '합계\t\t\t\t150000'].join('\n');
const QUOTE_FULL = ['견 적 서', '견적일자 : 2026. 11. 5.', '공급받는자', '상 호 : 쌤초등학교', '공급자', '사업자등록번호 : 123-45-67890', '상 호 : 쌤문구',
  '대표자 성명 : 홍길동 (인)', '업 태 : 도소매', '종 목 : 문구', '아래와 같이 견적합니다.', '번호 | 품명 | 규격 | 수량 | 단가 | 금액',
  '1 | 색연필 | 24색 | 30 | 5,000 | 150,000', '2 | 스케치북 | 8절 | 30 | 1,500 | 45,000', '합계 | | | | | 195,000'].join('\n');
test('[inbox-quote-1] 「공급자」 아래 「상 호」「성 명: 홍길동 (인)」을 따로 적은 견적서는 견적서 (학생 답안 스캔 아님)', () => {
  for (const name of ['견적서.xlsx', '쌤문구_20261105.pdf', 'quote.pdf', '20261105.pdf']) {
    assert.equal(classify({ name, text: QUOTE }).kind, 'quote', name);
    assert.equal(classify({ name, text: QUOTE_FULL }).kind, 'quote', name + ' (공급자·공급받는자·사업자등록번호)');
  }
  // 한 줄에 「상호 : 쌤문구   성명 : 홍길동 (인)」
  const one = '견 적 서\n상호 : 쌤문구   성명 : 홍길동 (인)\n품명 규격 수량 단가 금액\n공책 A4 30 1000 30000';
  assert.equal(classify({ name: '견적서.pdf', text: one }).kind, 'quote');
  assert.equal(classify({ name: '쌤문구.pdf', text: one }).kind, 'quote');
  // 학생 답안 스캔으로 보지 않으므로 다른 할 일 목록 맨 앞에도 오지 않음
  assert.notEqual(classify({ name: '쌤문구_20261105.pdf', text: QUOTE }).alts[0], 'unit-scan');
});

test('[inbox-quote-1] 강사 인적사항 서류(「강사 인적사항」 아래 「성 명 : 홍길동」)도 학생 답안 스캔이 아님', () => {
  const t = ['강사 인적사항', '성 명 : 홍길동', '생년월일 : 1980. 1. 1.', '소 속 : 쌤교육연구소', '직 위 : 연구원', '강의 주제 : 학교폭력 예방 교육'].join('\n');
  assert.notEqual(classify({ name: '강사 인적사항.hwp', text: t }).kind, 'unit-scan');
  assert.notEqual(classify({ name: '홍길동.pdf', text: t }).kind, 'unit-scan');
});

test('[inbox-quote-1] 이름이 적힌 학생 답안은 그대로 학생 답안 스캔. 이름 칸 하나로만 판단한 글 파일은 「바로 실행」이어도 물어봄(ask)', () => {
  const a = classify({ name: '3반.pdf', text: '수학 단원평가\n3학년 2반 이름: 김하늘\n1. 3 × 4 = (  12  )' });
  assert.equal(a.kind, 'unit-scan');
  assert.equal(a.ask, true);
  const b = classify({ name: '3반.pdf', text: '수학 단원평가\n3학년 2반 5번\n이름: 김하늘\n1. 3 × 4 = (  12  )\n2. 5 × 6 = (  30  )' });
  assert.equal(b.kind, 'unit-scan');
  assert.equal(b.ask, true);
  // 문제 글에 「공급자」「대표자」「상호」가 낱말로 나와도(6학년 사회 경제) 이름이 적힌 학생 답안
  const soc = ['사회 4단원 평가', '6학년 2반 7번 이름: 김하늘', '1. 시장에서 물건을 사는 수요자와 파는 공급자의 관계를 쓰시오.', '2. 학급 대표자를 뽑을 때 지켜야 할 점은?', '3. 상호 존중의 뜻을 쓰시오.'].join('\n');
  assert.equal(classify({ name: '6-2 사회.pdf', text: soc }).kind, 'unit-scan');
  // 파일 이름에 「답안」, 같은 문제지가 여러 번이면 더 분명하므로 묻지 않음
  assert.ok(!classify({ name: '3반 답안.pdf', text: '수학 단원평가\n3학년 2반 이름: 김하늘\n1. 3 × 4 = (  12  )' }).ask);
  assert.ok(!classify({ name: 'IMG_0001.jpg', text: '', scan: true }).ask);
  assert.ok(!classify({ name: '견적서.xlsx', text: QUOTE }).ask);
});

const masked = s => stripNames(s).text;
test('[privacy-after-1] 이름 뒤에 「학생·어머니·아버지·보호자」가 오면 이름을 가림', () => {
  assert.equal(masked('김민수 학생은 수업 시간에 자주 자리를 이탈함'), '○○○ 학생은 수업 시간에 자주 자리를 이탈함');
  assert.equal(masked('상담 기록: 3월 12일 김민수 어머니와 상담'), '상담 기록: 3월 12일 ○○○ 어머니와 상담');
  assert.equal(masked('특히 이서연 학생이 발표를 잘함'), '특히 ○○○ 학생이 발표를 잘함');
  assert.equal(masked('박지훈 아버지께서 전화하심'), '○○○ 아버지께서 전화하심');
  assert.equal(masked('최하은 보호자와 통화'), '○○○ 보호자와 통화');
  assert.equal(masked('김민수 부모님과 상담함'), '○○○ 부모님과 상담함');
  assert.equal(masked('남궁민수 학생은 성실함'), '○○○ 학생은 성실함');
  assert.equal(stripNames('김민수 학생은 수업 중 자리를 자주 이탈함').masked, 1);
});

test('[privacy-after-1] 쉼표로 이은 둘째 이름부터도 가림 (가린 이름 뒤에 이어질 때, 1인 1역 목록의 「이름-맡은 일」)', () => {
  assert.equal(masked('관심 학생: 박지훈(정서 불안), 최하은(교우 관계)'), '관심 학생: ○○○(정서 불안), ○○○(교우 관계)');
  assert.equal(masked('특별 관리 학생: 김민수(ADHD 약 복용), 이서연(다문화 가정)'), '특별 관리 학생: ○○○(ADHD 약 복용), ○○○(다문화 가정)');
  assert.equal(masked('관심 학생: 박지훈(정서 불안), 최하은(교우 관계), 정다온(학습 부진)'), '관심 학생: ○○○(정서 불안), ○○○(교우 관계), ○○○(학습 부진)');
  assert.equal(masked('회장 김민수, 이서연'), '회장 ○○○, ○○○');
  // 가린 이름 뒤라도 흔한 낱말은 그대로
  assert.equal(masked('학생 김민수, 공동체'), '학생 ○○○, 공동체');
  assert.equal(masked('1인 1역: 김민수-칠판 정리, 이서연-우유 배달'), '1인 1역: ○○○-칠판 정리, ○○○-우유 배달');
  assert.equal(stripNames('관심 학생: 박지훈(정서 불안), 최하은(교우 관계)').masked, 2);
});

test('[privacy-after-1] 잘못 가리는 경우가 늘지 않음: 이름 아닌 낱말 뒤 「학생·어머니」, 이름 없는 쉼표 목록', () => {
  for (const s of ['나머지 학생은 교실에서 자습', '어려운 학생을 돕는다', '원하는 학생은 신청', '선정된 학생', '조용한 학생도 발표', '신청한 학생', '모든 학생',
    '도움반 학생과 함께', '우리반 학생', '고학년 학생', '장애인 학생 지원', '한부모 가정 학생', '전학생 학생', '다문화 학생', '나이스 학생부 입력', '나이스 학생 정보',
    '우리 어머니', '친구 어머니', '학생 어머니', '선생님 어머니', '고학년 학부모', '신입생 학부모', '전교생 학부모 연수', '김민수의 일기',
    '준비물: 색연필(12색), 도화지(8절), 가위', '교과: 국어(4), 수학(3), 사회(3)', '장소: 운동장(1층), 강당(2층)', '구분: 국어, 수학, 사회',
    '정답: 안중근(1909), 윤봉길(1932)', '정답: 안중근-하얼빈, 윤봉길-상하이', '오각형, 육각형, 원기둥', '1. 오각형 2. 육각형 3. 원기둥', '도서관(2층), 정리함(교실 뒤)',
    '성교육(4시간), 안전교육(6시간)'])
    assert.deepEqual(stripNames(s), { text: s, dropped: 0, masked: 0 }, s);
  // 정답·도형 이름 줄은 이름 모양이 셋 이상이어도 쉼표 목록 규칙으로 더 가리지 않음(줄 빼기는 예전과 같음)
  assert.equal(nameCell('나머지'), false);
  assert.equal(looksLikeName('김민수'), true);
});

/* 실적 표의 7자리 금액·큰 수 줄은 전화번호가 아님 (plan-strip-numbers-1에서 이어짐) */
test('[plan-strip-numbers-1] 금액·숫자 표 줄은 전화번호로 보고 빼지 않음', () => {
  for (const s of ['강사비\t1200000\t1150000', '1200000 1150000', '도서 구입비\t1500000\t1498000', '강사비 | 1200000 | 1150000', '합계\t3,000,000\t2,950,000',
    '1. 3000 4000 5000', '연도\t2023\t2024\t2025', '참가 학생 수 1020 1030 1045', '예산 10000000 집행 9800000',
    '번호,학번,점수\n3,20301,1000 2000 3000'])
    assert.deepEqual(stripNames(s), { text: s, dropped: 0, masked: 0 }, s);
  const t = ['항목\t예산(원)\t집행(원)', '강사비\t1200000\t1150000', '도서 구입비\t1500000\t1498000', '독서 골든벨\t150000\t148000'].join('\n');
  assert.deepEqual(stripNames(t), { text: t, dropped: 0, masked: 0 });
});

test('[plan-strip-numbers-1] 진짜 전화번호 줄은 그대로 뺌', () => {
  for (const s of ['보호자 연락: 010-1234-5678', '01012345678', '연락처 (041) 123-4567', '학교 041-123-4567', '교무실 02 123 4567', '전화:010.1234.5678',
    '담임 연락처010-1234-5678', '휴대폰 010 1234 5678', '(02)123-4567', 'Tel.041-123-4567',
    // 엑셀·CSV 줄: 앞 칸이 숫자여도 쉼표·탭 뒤의 전화번호는 잡음
    '3,김민수,010-1234-5678', '3,20301,010-1234-5678', '3\t20301\t010-1234-5678', '1.010-1234-5678'])
    assert.equal(stripNames(s).dropped, 1, s);
});
