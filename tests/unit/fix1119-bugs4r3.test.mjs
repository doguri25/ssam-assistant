/* 세 번째 버그 찾기 고침의 회귀(2026-11-19 네 번째 버그 찾기) — 다시 생기지 않게. 예시 이름은 지어낸 것 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '김솔', '이산'];
const leak = t => NAMES.filter(n => String(t).includes(n));

test('늘어놓은 이름: 호칭(선생님·어머니·주무관)은 이름이 아니고, 글 전체의 「선생님」을 가리지 않음', async () => {
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const c = cleanSheet('강사: 김하늘 선생님, 이바다 선생님\n교장 선생님 말씀이 있겠습니다.\n담임 선생님께서 지도해 주세요.');
  assert.deepEqual(leak(c.text), [], c.text);
  assert.ok(c.text.includes('교장 선생님 말씀') && c.text.includes('담임 선생님께서'), c.text);
  assert.equal(c.names, 2);
  const m = cleanSheet('협조: 행정실 남다율 주무관, 탁보결 주무관께서 확인해 주세요.\n주무관 업무 분장 참고');
  assert.ok(m.text.includes('주무관 업무 분장') && !leak(m.text).length, m.text);
  const k = cleanSheet('상담 신청: 김하늘 어머니, 이바다 어머니\n학부모(어머니) 참여 바랍니다.');
  assert.ok(k.text.includes('학부모(어머니)') && !leak(k.text).length, k.text);
  assert.equal(cleanSheet('강사: 김하늘 강사님, 이바다 강사님\n강사님 수당은 행정실에서 지급').text, '강사님 수당은 행정실에서 지급');
  const { maskPersons } = await import('../../web/core/chat-names.js');
  // 호칭을 건너뛰어 쉼표로 이은 이름도 가림
  assert.deepEqual(leak(maskPersons('김하늘 선생님, 이바다 선생님').text), []);
  assert.equal(maskPersons('김하늘 선생님과 함께하는 국악').text, '○○○ 선생님과 함께하는 국악');
  assert.equal(maskPersons('강사 김하늘과 함께하는 진로 특강').text, '강사 ○○○과 함께하는 진로 특강');
  const { maskDraft } = await import('../../web/menus/etc/multi-ai.js');
  assert.ok(maskDraft('동학년 김하늘 선생님, 이바다 선생님과 협의\n신규 선생님 멘토링 운영', {}).includes('신규 선생님 멘토링'));
});

test('늘어놓은 땅 이름·시설·생물(경주시·안동시, 경복궁·인사동, 하회마을, 송사리·금붕어)은 이름이 아님 — 늘어놓은 이름은 그대로 가림', async () => {
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const doc = '6학년 수학여행 안내\n1. 장소: 경주시, 안동시 일원\n2. 경주시에서 1박, 안동시에서 1박\n3. 견학: 불국사, 석굴암, 하회마을';
  assert.equal(cleanSheet(doc).text, doc);
  const { maskPersons, personSpans } = await import('../../web/core/chat-names.js');
  for (const s of ['체험 장소: 경복궁, 인사동', '체험학습: 민속촌, 용인시, 수원시', '송사리, 금붕어 각 10마리', '미제출: 교무부 ○○○, 연구부 이바다'.replace('이바다', '○○○')])
    assert.equal(maskPersons(s).text, s, s);
  assert.deepEqual(personSpans('경주시, 안동시 역사 탐방'), []);
  const R = await import('../../web/core/chat-route.js');
  assert.equal(R.safeText('경주시·안동시 수학여행 가정통신문 써 줘'), '경주시·안동시 수학여행 가정통신문 써 줘');
  for (const q of ['이바다, 남다율, 탁보결 셋이 자꾸 늦어요', '한가람, 남도율 둘이', '남다율·탁보결 둘이 다퉜어요', '이바다랑 남다율이 다퉜어요', '김하늘이랑 이바다가 다퉜어요'])
    assert.deepEqual(leak(R.safeText(q)), [], q);
});

test('품의 표 붙여넣기: 규격 칸 「12자루·1000개·1식」은 규격, 「10묶음 | 3,000 | 30,000」은 수량', async () => {
  const { tableItems } = await import('../../web/menus/purchase/intake.js');
  const sum = t => tableItems(t).items.reduce((n, x) => n + Number(x.qty) * Number(x.price), 0);
  assert.equal(sum('색연필\t12자루\t30\t4,500\n종이컵\t1000개\t2\t15,000\n면장갑\t10켤레\t3\t8,000'), 189000);
  assert.equal(sum('현수막\t1식\t1\t90,000'), 90000);
  assert.equal(sum('면장갑\t10켤레\t3\t8,000\t24,000'), 24000);
  assert.equal(tableItems('색연필\t12자루\t30\t4,500').items[0].spec, '12자루');
  assert.equal(sum('색종이\t10묶음\t3,000\t30,000\n풀\t20개\t500\t10,000'), 40000);
  assert.equal(sum('색종이\t10묶음\t3,000'), 30000);
  assert.equal(sum('현수막\t2개\t45,000\t90,000'), 90000);
});

test('활동지·창체·행사 칸(colonOnly): 쌍점 없이 직함 뒤 세 글자 이름도 가림, 「선생님 설명을」「부장 선거」「담당 구역」은 그대로', async () => {
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const P = await import('../../web/core/privacy.js');
  for (const s of ['강사 박솔빛', '담당 김하늘', '선생님 이바다', '주무관 탁보결', '인솔 남다율', '기록 담당 김하늘, 발표 담당 이바다', '담당 이바다에게 제출', '선생님 한가람이 설명'])
    assert.deepEqual(leak(cleanSheet(s, { staff: false }).text), [], s);
  for (const s of ['선생님 설명을 듣고 답하세요', '정답: 선생님 허락을 받는다', '학급 부장 선거 안내', '담당 구역 청소', '선생님 도움을 받아', '선생님 이야기를 듣고',
    '선생님 설명은 짧게', '선생님 이력서 확인', '인솔 지도안', '부장 선거 및 학급 회의', '전교 학생회 임원 및 부장 선거'])
    assert.equal(P.maskStaff(s, { colonOnly: true }).text, s, s);
  // 창체 활동 칸(gr-bundle.js SS().maskAI)과 같은 조합
  const { maskPersons } = await import('../../web/core/chat-names.js');
  const f = s => P.maskContacts(P.maskStaff(maskPersons(s).text, { colonOnly: true }).text);
  assert.equal(f('부장 선거 및 학급 회의'), '부장 선거 및 학급 회의');
  assert.equal(f('선생님 설명을 듣고 실험 설계'), '선생님 설명을 듣고 실험 설계');
  assert.deepEqual(leak(f('강사 박솔빛 초청 진로 특강') + f('한가람 선생님 정년퇴임 기념식')), []);
  const src = (await import('node:fs')).readFileSync(new URL('../../web/menus/evaluate/gr-bundle.js', import.meta.url), 'utf8');
  assert.ok(/maskAI = s => [^\n]*colonOnly: true/.test(src), '창체 칸은 colonOnly');
  const ev = (await import('node:fs')).readFileSync(new URL('../../web/menus/plan/event.js', import.meta.url), 'utf8');
  assert.ok(/const evAI = [^\n]*colonOnly: true/.test(ev), '행사 칸은 colonOnly');
});

test('품의 AI 글(maskForAI): 수량·금액이 있는 품목 줄은 빼지 않고 이름만 가림, 명단 줄은 그대로 뺌', async () => {
  const { maskForAI } = await import('../../web/menus/purchase/intake.js');
  const a = maskForAI('학급 문고 도서 구입\n이순신 장영실 정약용 위인전 3권 36,000원\n안중근 위인전, 유관순 위인전 각 1권 12,000원\n세종대왕 위인전 1권 12,000원');
  assert.ok(a.includes('위인전 3권 36,000원') && a.includes('각 1권 12,000원') && a.includes('세종대왕 위인전 1권'), a);
  assert.equal(maskForAI('상품번호 1234-5678-9012 비커 10개 4,500원'), '상품번호 ○○○ 비커 10개 4,500원');
  const b = maskForAI('체험학습 간식 구입\n참가 학생: 김하늘, 이바다, 한가람, 박솔빛\n간식 30인분 2,500원');
  assert.deepEqual(leak(b), [], b);
  assert.ok(b.includes('간식 30인분'), b);
  assert.deepEqual(leak(maskForAI('김하늘, 이바다, 한가람, 박솔빛 학생 상장 용지 4매 4,000원')), []);
  assert.ok(!maskForAI('계좌 110-123-456789 예금주 김하늘\n색연필 10개 3,000원').includes('110-123'));
});

test('「미제출:」 목록: 학년·부서·반 번호를 앞에 붙인 두 글자 이름도 가림, 「신규 임용 교사」는 그대로', async () => {
  const P = await import('../../web/core/privacy.js');
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  for (const s of ['미제출: 1학년 김솔, 2학년 이산', '미제출: 교무부 김솔, 연구부 이산', '미제출: 1-1 김솔, 1-2 이산', '아직 안 낸 분: 행정실 김솔, 교무실 이산', '미제출: 보건실 김솔'])
    for (const [tag, out] of [['strip', P.stripNames(s).text], ['staff', P.maskStaff(s).text], ['sheet', cleanSheet(s).text]]) assert.deepEqual(leak(out), [], `${tag}: ${s} → ${out}`);
  assert.equal(cleanSheet('미제출: 교무부 김솔, 연구부 이산').text, '미제출: 교무부 ○○○, 연구부 ○○○');
  for (const s of ['대상자: 신규 임용 교사', '참석자: 교감, 교무부장, 3학년 담임', '미제출: 1학년 담임, 2학년 부장', '대상자: 교무부 전원', '미제출: 교무부 2명, 연구부 1명', '미제출: 1학년 2반'])
    assert.equal(P.stripNames(s).text, s, s);
});
