/* 2026-11-19 세 번째 멀티에이전트 버그 찾기(확인 34건) — 다시 생기지 않게. 예시 이름은 지어낸 것(남다율·탁보결·남도율도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '남도율'];
const leak = t => NAMES.filter(n => String(t).includes(n));

test('이름 가리기: 명단 이름은 「하고·보다·팀장」 앞에서도, 「미제출(2명):」「미제출자 …」 목록도, 활동지 글은 망가뜨리지 않음', async () => {
  const P = await import('../../web/core/privacy.js');
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  store.set('training:board', { staff: [{ id: 'a', name: '남다율', dept: '' }, { id: 'b', name: '탁보결', dept: '' }, { id: 'c', name: '이산', dept: '' }], courses: [], marks: {} });
  for (const s of ['탁보결하고 남다율이 담당해요', '남다율보다 먼저', '탁보결처럼 해 주세요', '탁보결조리사님께', '남다율팀장님', '탁보결행정실장', '남다율네 반'])
    for (const [tag, out] of [['strip', P.stripNames(s).text], ['staff', P.maskStaff(s).text], ['sheet', cleanSheet(s).text]]) assert.deepEqual(leak(out), [], `${tag}: ${s} → ${out}`);
  assert.equal(P.stripNames('이산화탄소 실험').text, '이산화탄소 실험');
  assert.ok(!P.stripNames('이산하고 같이').text.includes('이산'));
  store.set('training:board', { staff: [], courses: [], marks: {} });
  for (const s of ['미제출(2명): 남다율, 탁보결', '미제출 2명: 남다율, 탁보결', '미제출 - 남다율, 탁보결', '미제출자 남다율, 탁보결', '미제출 선생님: 남다율, 탁보결'])
    for (const [tag, out] of [['strip', P.stripNames(s).text], ['sheet', cleanSheet(s).text]]) assert.deepEqual(leak(out), [], `${tag}: ${s} → ${out}`);
  for (const s of ['미제출: 12월 5일까지 내 주세요', '대상자: 전 교직원', '참석자: 교감, 교무부장, 3학년 담임', '대상자: 신규 임용 교사']) assert.equal(P.stripNames(s).text, s, s);
  // 활동지(staff: false): 「선생님 설명을」「부장 선거」는 그대로, 쌍점 뒤 이름은 가림
  for (const s of ['선생님 설명을 듣고 답하세요', '정답: 선생님 허락을 받는다', '학급 부장 선거 안내']) assert.equal(cleanSheet(s, { staff: false }).text, s, s);
  assert.deepEqual(leak(cleanSheet('강사: 탁보결', { staff: false }).text), []);
});

test('이름 가리기: 쪽지·공문·가정통신문(cleanSheet)·파일 이름·인수인계서·다면평가 줄글·품의·행사계획', async () => {
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const doc = ['2026 수업 나눔 연수 안내', '3. 강사: 김하늘·이바다 선생님', '4. 사회: 한가람, 기록: 박솔빛', '6. 참가 신청서는 11. 27.(금)까지 탁보결에게 제출',
    '7. 문의: 교무부 한가람(교무부장)', '8. 보고자: 김하늘'].join('\n');
  const c = cleanSheet(doc);
  assert.deepEqual(leak(c.text), [], c.text);
  assert.ok(c.text.includes('2026 수업 나눔 연수 안내') && c.text.includes('참가 신청서는'), c.text);
  assert.equal(cleanSheet('청렴교육 이수증 제출 안내\n미제출: 남다율, 탁보결\n12월 5일까지').names, 2, '이미 가린 자리는 두 번 세지 않음');
  assert.ok(!/진단○○○|성취○○○/.test(cleanSheet('진단평가가 끝나면 성취평가를 해요').text), '「…평가」 끝 글자는 조사가 아님');
  // 번역 guard가 미리 넣은 {{n}}은 그대로
  assert.ok(cleanSheet('{{1}} 이후 안내드립니다').text.includes('{{1}}'));
  const { maskName, gongmunPrompt } = await import('../../web/menus/etc/gongmun-ai.js');
  assert.deepEqual(leak(maskName('계획(담당 박솔빛).hwp') + maskName('동의서_김하늘.hwp')), []);
  assert.equal(maskName('진단평가 결과.xlsx'), '진단평가 결과.xlsx');
  assert.ok(maskName('교육청 공문.hwp').endsWith('.hwp'));
  assert.deepEqual(leak(gongmunPrompt({ name: '연수 안내_이바다.hwp', text: '연수 안내', today: '2026-11-19', year: 2026 })), []);
  const { letterPrompt } = await import('../../web/menus/etc/letter-ai.js');
  assert.deepEqual(leak(letterPrompt({ sources: [{ name: '동의서_김하늘.hwp', text: '체험학습 동의서' }] })), []);
  // 인수인계서: 조사가 붙은 이름·맡은 일 쌍점 뒤, 부서만 적은 담당자 칸은 사람 이름 아님
  const H = await import('../../web/menus/etc/handover-model.js');
  for (const s of ['참가 신청서 이바다에게 받기', '결과 보고는 한가람과 협의', '사회: 한가람, 기록: 박솔빛']) assert.deepEqual(leak(H.cleanText(s)), [], s);
  assert.equal(H.cleanText('공문철은 교무실에 있어요'), '공문철은 교무실에 있어요');
  for (const v of ['독서교육부', '정보부', '교무부장', '3학년 부장']) assert.deepEqual(H.nameTokens(v), [], v);
  assert.deepEqual(H.nameTokens('독서교육부 한가람'), ['한가람']);
  assert.ok(H.nameTokens('김수원').includes('김수원'));
  // 다면평가 줄글: 학생·교직원 이름, 명단 줄도 한 일은 남김
  const { maskDraft } = await import('../../web/menus/etc/multi-ai.js');
  const d = maskDraft('학습 부진 학생(박솔빛, 이바다)에게 1:1 보충 지도\n박솔빛에게 주 2회\n상담 학생: 김하늘, 이바다, 박솔빛, 남다율 (각 3회)\n수업 공개 2회·직무연수 60시간', {});
  assert.deepEqual(leak(d), [], d);
  assert.ok(d.includes('수업 공개 2회·직무연수 60시간') && d.includes('상담 학생'), d);
  // 품의 AI 글: 쉼표·가운뎃점으로 이은 이름, 「수상자:」 목록 — 품목 이름은 그대로
  const { maskForAI } = await import('../../web/menus/purchase/intake.js');
  const m = maskForAI('학년말 시상 문화상품권 2매 20,000원\n수상자: 김하늘, 이바다\n최우수 한가람·박솔빛 학생\n한라봉 2박스 40,000원');
  assert.deepEqual(leak(m), [], m);
  assert.ok(m.includes('한라봉') && m.includes('문화상품권'), m);
});

test('「쌤」 채팅: 늘어놓은 이름·관찰 메모 끝말·보기 말·달력 해·다음 주 요일·날짜', async () => {
  const R = await import('../../web/core/chat-route.js');
  for (const q of ['이바다, 남다율, 탁보결 셋이 자꾸 늦어요 어떻게 지도하죠?', '한가람, 남도율 둘이 모둠 활동을 안 해요', '남다율·탁보결 둘이 다퉜어요', '이바다랑 남다율이 다퉜어요 어떻게 하죠?'])
    assert.deepEqual(leak(R.safeText(q)), [], `${q} → ${R.safeText(q)}`);
  for (const q of ['국어, 수학 둘 다 어려워해요 어떻게 하죠?', '안내장, 신청서 둘 다 보내야 해', '한국사, 세계사 어떻게 가르쳐?', '과학실, 음악실 예약', '유치원, 초등학교 연계'])
    assert.equal(R.safeText(q), q, q);
  assert.ok(R.MEMO_END.test('친구에게 숙제를 알려 줌') && !R.MEMO_END.test('성적 알려줘'));
  for (const [intent, q] of [['gongmun', '공문 기한 확인'], ['gongmun', '밀린 공문 정리'], ['message', '지난 쪽지 다시 보기'], ['report', '결과 보고서 다시 열기'], ['letter', '가정통신문 쓰던 거 이어서']])
    assert.deepEqual(R.payloadFor(intent, q), { text: '' }, q);
  for (const [intent, q] of [['message', '오늘 급식 없음 안내 쪽지'], ['letter', '받아쓰기 시험 안내 가정통신문'], ['gongmun', '공문 처리 학교폭력 실태조사 12월 5일까지']])
    assert.equal(R.payloadFor(intent, q).text, q, q);
  assert.deepEqual(R.payloadFor('month', '2027년 3월 일정'), { text: '', mon: 3, year: 2027 });
  assert.deepEqual(R.payloadFor('month', '내년 3월 일정 보여줘'), { text: '', mon: 3, rel: 1 });
  assert.deepEqual(R.payloadFor('month', '12월 일정'), { text: '', mon: 12 });
  const { actionPayload } = await import('../../web/core/chat-assist.js');
  assert.deepEqual(actionPayload({ intent: 'month' }, { said: '12월 일정 뭐 있어?', question: true }), { text: '', mon: 12 });
  const { dataQuestion } = await import('../../web/core/chat-data.js');
  const day = q => (dataQuestion(q, { today: '2026-11-16' }) || {}).day;
  assert.equal(day('다음 주 수요일 시간표 알려 줘'), '2026-11-25');
  assert.equal(day('지난주 금요일 시간표 알려 줘'), '2026-11-13');
  assert.equal(day('11월 24일 3교시 뭐야?'), '2026-11-24');
  assert.equal(day('내일모레 시간표 알려 줘'), '2026-11-18');
  assert.equal(day('수요일 시간표 알려 줘'), '2026-11-18');
});

test('이수번호: 「제주-…」, 지정번호보다 이수번호 줄, 폼의 전화번호 칸, 현황판 합치기에서 번호 남김', async () => {
  const T = await import('../../web/menus/training/training-model.js');
  assert.equal(T.codeNorm('제주-특직-2026-001'), '제주-특직-2026-001');
  assert.equal(T.codeNorm('제 2026-12345 호'), '2026-12345');
  assert.equal(T.certCode('이수번호: 제주-특직-2026-001'), '제주-특직-2026-001');
  assert.equal(T.certCode('제 제주교육연수원-직무-2026-77 호'), '제주교육연수원-직무-2026-77');
  assert.equal(T.certCode('이수증 (교육부 지정 제2015-3호)\n이수번호: 충남-특직-2026-001'), '충남-특직-2026-001');
  assert.equal(T.certCode('연수 (제1-2호 과정)\n제 2026-유초중-직무-000123 호'), '2026-유초중-직무-000123');
  assert.equal(T.certCode('연수 (제2-3호 과정)'), '');
  let b = T.normBoard({ staff: [{ id: 's1', name: '김하늘', dept: '' }], courses: [{ id: 'c1', title: '청렴교육' }], marks: {} });
  for (const [h, want] of [[['타임스탬프', '성명', '휴대폰 번호', '이수번호'], '충남-특직-2026-0009'], [['타임스탬프', '성명', '나이스 개인번호', '이수번호'], '충남-특직-2026-0009'],
    [['타임스탬프', '번호', '성명', '이수증 번호'], '충남-특직-2026-0009']]) {
    const row = h.map(c => (c === '성명' ? '김하늘' : /휴대폰/.test(c) ? '010-1234-5678' : /개인/.test(c) ? 'J10ABC1234' : c === '번호' ? '3' : /타임/.test(c) ? '2026/11/06 10:00:00' : '충남-특직-2026-0009'));
    assert.equal(T.formResponses([h, row], b).hits[0].code, want, h.join(','));
  }
  assert.equal(T.formResponses([['성명', '연락처 번호'], ['김하늘', '010-1234-5678']], b).hits[0].code, '', '전화번호 꼴은 이수번호 아님');
  // 두 컴퓨터에서 나눠 수합: 한쪽은 종이 확인(번호 없음), 한쪽은 제출+번호 → 합친 칸에 번호·이수일
  const mine = T.setMark(b, 'c1', 's1', 'ok', {});
  const theirs = T.setMark(b, 'c1', 's1', 'sent', { date: '2026-11-06', code: '충남-특직-2026-0001' });
  const m = T.mergeBoards(mine, theirs).marks.c1.s1;
  assert.equal(m.s, 'ok'); assert.equal(m.code, '충남-특직-2026-0001'); assert.equal(m.date, '2026-11-06');
  const m2 = T.mergeBoards(theirs, mine).marks.c1.s1;
  assert.equal(m2.s, 'ok'); assert.equal(m2.code, '충남-특직-2026-0001');
});

test('품의 넣기: 수량 칸 단위·「전체 N명」·「× 2」·포장 단위·견적서 아래 줄·연간계획 합계 줄', async () => {
  const { findItems } = await import('../../web/core/sheet.js');
  const it = findItems([['품명', '규격', '수량', '단가', '금액'], ['볼펜', '검정', '10자루', '500', '5,000'], ['공책', '', '20권', '1,000', '20,000'],
    ['위와 같이 견적합니다.', '', '', '', ''], ['새싹문구 대표 이바다 (인)', '', '', '', '']]);
  assert.deepEqual(it.map(x => [x.name, x.qty, x.price, x.unit]), [['볼펜', 10, 500, '자루'], ['공책', 20, 1000, '권']]);
  const { parseLines, tableItems } = await import('../../web/menus/purchase/intake.js');
  const sum = t => parseLines(t).items.reduce((n, x) => n + Number(x.qty) * Number(x.price), 0);
  assert.equal(sum('간식 전체 420명 2,500원'), 1050000);
  assert.equal(sum('현수막 전체 2개 45,000원'), 90000);
  assert.equal(sum('볼펜 총 30자루 15,000원'), 15000);
  assert.equal(sum('현수막 45,000원 × 2'), 90000);
  assert.equal(sum('간식 2,500원 × 420'), 1050000);
  assert.equal(sum('현수막 2 × 45,000원'), 90000);
  assert.equal(parseLines('하드보드지 30x40 1,000원').items[0].qty, '1', '규격 30x40은 수량 아님');
  assert.equal(sum('A4 용지 80g 5BOX 25,000원'), 125000);
  assert.equal(sum('흙 20kg 3포대 15,000원'), 45000);
  assert.equal(sum('건전지 AA 20pcs 500원'), 10000);
  assert.equal(sum('비커 500ml 8개 4,500원'), 36000);
  const tb = tableItems('색종이\t10묶음\t3,000\t30,000\n풀\t20개\t500\t10,000');
  assert.equal((tb.items || tb).reduce((n, x) => n + Number(x.qty) * Number(x.price), 0), 40000);
  const { normDraft } = await import('../../web/menus/plan/year-model.js');
  const d = normDraft({ budget: [{ name: '도서 구입비', amount: 800000 }, { name: '독서 행사 운영비', amount: 400000 }, { name: '합계', amount: 1200000 }, { name: '총 계', amount: 1200000 }, { name: '계량컵', amount: 5000 }] });
  assert.deepEqual(d.budget.map(x => x.name), ['도서 구입비', '독서 행사 운영비', '계량컵']);
});

test('예산 알림은 3분 둘러보기 중에 고치지 않음, 연수 폼 응답 CSV는 이수증 쪽으로', async () => {
  const B = await import('../../web/menus/purchase/budget-model.js');
  store.set('budget:alerts', [{ year: 2026, id: 'p1', name: '과학실 운영', left: 1000000, due: '2027-02-28' }]);
  store.set('years', { current: 9999 });
  B.refreshAlerts(2026, '2027-02-10');
  assert.equal(store.get('budget:alerts', []).length, 1, '체험 자료로 덮지 않음');
  const { classify } = await import('../../web/core/inbox-classify.js');
  const csv = '타임스탬프,성명,부서,연수,이수번호\n2026/11/06 10:00:00,김하늘,3학년,청렴교육,충남-특직-2026-001\n2026/11/06 11:00:00,이바다,4학년,청렴교육,충남-특직-2026-002';
  const r = classify({ name: '이수번호 제출(응답).csv', text: csv });
  assert.equal(r.kind, 'cert'); assert.equal(r.ask, true);
  assert.equal(classify({ name: '운동회 만족도(응답).csv', text: '타임스탬프,학년,만족도\n2026/10/06 10:00:00,3,5' }).kind, 'survey');
});
