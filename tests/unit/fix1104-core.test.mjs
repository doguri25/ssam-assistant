// 11-04 버그 고치기(공통·설정): 글 다듬기·이름 가리기·떠 있는 버튼 판단·옛 엑셀 안내
import test from 'node:test';
import assert from 'node:assert/strict';
import { tidyKo } from '../../web/core/write-style.js';
import { stripNames } from '../../web/core/privacy.js';
import { classify } from '../../web/core/inbox-classify.js';
import { readText, fileMessage } from '../../web/core/files.js';

test('[core-1] tidyKo: 자리를 뜻하는 「~에 있어(서)」는 그대로, 「이에 있어서」만 「여기서」', () => {
  for (const s of ['체험 장소가 산속에 있어 모기 기피제를 챙겨 주세요.', '도서관이 2층에 있어서 이용이 편리합니다.',
    '공사 구간이 정문 앞에 있어 후문으로 등교해 주세요.', '급식실이 1층에 있어서 이동이 편합니다.', '보건실이 1층에 있어서 필요할 때 바로 가요.',
    '{"intro":"체험 장소가 산속에 있어 모기 기피제를 챙겨 주세요."}', '교실에 있어도 됩니다.'])
    assert.equal(tidyKo(s), s);
  assert.equal(tidyKo('이에 있어서 협조 바랍니다.'), '여기서 협조 바랍니다.');
  // 「놀이에 있어서」의 「이에 있어서」는 낱말 가운데라 그대로
  assert.equal(tidyKo('놀이에 있어서 안전이 먼저예요.'), '놀이에 있어서 안전이 먼저예요.');
});

const masked = s => stripNames(s).text;
test('[core-2] 직책·「학생」 옆 이름에 조사가 붙어도 이름만 ○○○로 가리고 조사는 남김', () => {
  assert.equal(masked('1학기 회장 김민준과 부회장 이서연이 학급 회의를 이끌었다.'), '1학기 회장 ○○○과 부회장 ○○○이 학급 회의를 이끌었다.');
  assert.equal(masked('학생 김민준은 수업 태도가 좋음'), '학생 ○○○은 수업 태도가 좋음');
  assert.equal(masked('회장 김민준이 회의를 진행함'), '회장 ○○○이 회의를 진행함');
  assert.equal(masked('반장 박지호가 발표했다'), '반장 ○○○가 발표했다');
  assert.equal(masked('학생 김민수가 담임 이영희 선생님께 편지를 썼다.'), '학생 ○○○가 담임 ○○○ 선생님께 편지를 썼다.');
  assert.equal(masked('담임 이영희께 드림'), '담임 ○○○께 드림');
  assert.equal(masked('학생 김민준에게 상장을 줌'), '학생 ○○○에게 상장을 줌');
  assert.equal(masked('회장 남궁민수가 발표함'), '회장 ○○○가 발표함');
  assert.equal(stripNames('회장 김민준과 부회장 이서연이').masked, 2);
});

test('[core-2] 「이름 김민수」(쌍점 없이)·「이름: 김솔」·「성명 김철수」도 가림 (학생 스캔 글자층)', () => {
  assert.equal(masked('3학년 2반 6번 이름 이서연'), '3학년 2반 6번 이름 ○○○');
  assert.equal(masked('3학년 2반 7번 이름 박지훈 점수'), '3학년 2반 7번 이름 ○○○ 점수');
  assert.equal(masked('( 3 )학년 ( 2 )반 ( 8 )번 이 름 최하은'), '( 3 )학년 ( 2 )반 ( 8 )번 이 름 ○○○');
  assert.equal(masked('이름: 김민수'), '이름: ○○○');
  assert.equal(masked('이름 ( 김민수 )'), '이름 ( ○○○ )');
  assert.equal(masked('이름: 김솔'), '이름: ○○○');
  assert.equal(masked('6번 이름 김솔'), '6번 이름 ○○○');
  assert.equal(masked('성명 김철수'), '성명 ○○○');
  assert.equal(masked('학생 이름 정다온'), '학생 이름 ○○○');
  assert.equal(stripNames('3학년 2반 6번 이름 이서연').masked, 1);
});

test('[core-2] 잘못 가리는 경우가 늘지 않음: 「이름 칸」「이름표」「이름을 쓰세요」「모둠 이름 정하기」, 「학생」 뒤 낱말+조사', () => {
  for (const s of ['이름 칸에 이름을 쓰세요.', '이름표를 만들어요.', '이름을 쓰세요.', '모둠 이름 정하기', '우리 반 이름 짓기', '이름 소개하기',
    '이름 도장 찍기', '이름 쓰기', '이름 한글로 쓰기', '이름: 교사용', '이름 칸', '친구 이름 부르기', '이름 소개', '이름 표시', '이름 대신 번호로 불러요.',
    '이름 모으기', '이름 고르기', '이름 정하기 활동', '이름: 한글로 또박또박', '성명서를 냈다', '이름이 같은 친구',
    '학생 이해도를 높이기 위해', '학생 이야기를 듣고', '학생 주도로 운영', '학생 안전교육을 실시', '학생 성장과 발달', '학생 자치회 운영',
    '학생 상담을 해요', '교사 연수를 들어요', '학생 개개인의 특성', '학생 중심 수업', '학생 참여도가 높음', '학생 성취도를 분석', '학생 만족도 조사',
    '학생 주도성을 기름', '학생 정체성 형성', '학생 공동체 활동', '대표 선수를 뽑아요', '회장 선거를 해요', '담임 교사와 상담', '전담 시간에'])
    assert.deepEqual(stripNames(s), { text: s, dropped: 0, masked: 0 }, s);
});

const QUOTE = ['견 적 서', '2026년 11월 4일', '공급자 상호: 한빛문구 | 대표자 성명: 김철수', '사업자등록번호: 123-45-67890',
  '품명 | 규격 | 수량 | 단가 | 금액', '색연필 | 12색 | 30 | 3000 | 90000', '스케치북 | 8절 | 30 | 1500 | 45000', '합계 | | | | 135000'].join('\n');
const CLASSPLAN = ['2026학년도 5학년 3반 학급 운영 계획', '담임 성명: 김민수', '1. 급훈: 서로 돕는 우리 반', '2. 학급 실태', '남 12명 여 13명'].join('\n');
test('[core-4] 대표자·담임 성명이 든 견적서·학급운영계획은 학생 답안 스캔이 아님', () => {
  for (const name of ['quote.pdf', '한빛문구 견적서.pdf', '견적서.pdf']) assert.equal(classify({ name, text: QUOTE }).kind, 'quote', name);
  assert.equal(classify({ name: '2026 계획.hwpx', text: CLASSPLAN }).kind, 'class-plan');
  assert.equal(classify({ name: '학급운영계획.hwpx', text: CLASSPLAN }).kind, 'class-plan');
  assert.equal(classify({ name: '계획.hwpx', text: CLASSPLAN.replace('담임 성명:', '담임교사 성명:') }).kind, 'class-plan');
  // 학생 이름 칸은 그대로 답안 스캔
  assert.equal(classify({ name: '3반.pdf', text: '수학 단원평가\n3학년 2반 이름: 김하늘\n1. 3 × 4 = (  12  )' }).kind, 'unit-scan');
});

test('[core-8] 옛 엑셀(.xls)·워드(.doc)는 「다시 저장해 넣어 주세요」 안내', async () => {
  const err = async name => { try { await readText(new File(['x'], name)); return null; } catch (e) { return e && e.code; } };
  const xls = await err('명렬표.xls'), doc = await err('계획.doc');
  assert.equal(xls, 'XLS_OLD');
  assert.match(fileMessage(xls), /옛 엑셀\(\.xls\).*\.xlsx로 다시 저장/);
  assert.equal(doc, 'DOC_OLD');
  assert.match(fileMessage(doc), /옛 워드\(\.doc\).*\.docx로 다시 저장/);
  assert.equal(await err('발표.pptx'), 'UNSUPPORTED');
});
