/* 2026-11-19 다섯 번째 멀티에이전트 버그 찾기 — AI로 보내는 길(이름·연락처) 확인된 것. 예시 이름은 지어낸 것(남다율·탁보결도 지어낸 이름) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as store from '../../web/core/store.js';

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i], get length() { return m.size; } }; };
beforeEach(() => store.useStorage(mem()));
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '남다율', '탁보결', '김민준', '이서연'];
const leak = t => NAMES.filter(n => String(t).includes(n));
const src = p => readFileSync(new URL('../../web/' + p, import.meta.url), 'utf8');

test('학급운영계획 AI 글: 작년 글·지침·평가계획의 학생 이름(표 칸·조사 붙은 이름)과 주민번호는 가리고, 단원 이름·계획 문체는 그대로', async () => {
  const Mo = await import('../../web/menus/plan/classplan-model.js');
  const C = await import('../../web/menus/plan/classplan-ai.js');
  const P = await import('../../web/core/privacy.js');
  const raw = ['Ⅰ. 학급 경영 목표', '1. 학급 목표', '서로 배려하는 우리 반', 'Ⅱ. 학급 특색 활동', '1. 1인 1역', '| 우유 당번 | 김하늘 |', '- 학급 문고 정리는 남다율이 맡음',
    '- 김민준은 정서 지원이 필요함', '2. 교우 관계', '- 김민준과 이서연의 갈등 해결', 'Ⅲ. 학부모 상담', '1. 상담 주간', '- 보호자 연락: 900101-1234567'].join('\n');
  const stored = P.stripNames(raw).text; // 파일을 넣을 때(classplan.js)처럼
  const p = Mo.newPlan(); p.year = 2026; p.grade = 3; p.room = 2; p.sources.lastPlan = stored; p.outline = Mo.parseOutline(stored);
  const d = C.draftPrompt(p, { bodies: Mo.sectionBodies(stored, p.outline) });
  assert.deepEqual(leak(d), [], d);
  assert.ok(!d.includes('900101-1234567'), '주민번호');
  assert.ok(d.includes('서로 배려하는 우리 반') && d.includes('우유 당번') && d.includes('정서 지원이 필요함'), d);
  // 평가계획·지침: 단원 이름(「옛날과 오늘날의 도구」「진분수와 가분수」)은 ○○○가 아님(평가 표가 틀어지지 않게)
  const ev = C.evalPrompt('사회 | 옛날과 오늘날의 도구 | [4사02-01] | 서술형 | 10월\n수학 | 진분수와 가분수 | [4수01-10] | 지필 | 11월\n담당: 김하늘 학생 지도');
  assert.ok(ev.includes('옛날과 오늘날의 도구') && ev.includes('진분수와 가분수'), ev);
  assert.deepEqual(leak(ev), []);
  p.sources.guide = '학교폭력 예방 교육은 학기마다 1회 이상 학급에서 한다.\n문의 이바다에게(전자 우편 abc@school.kr)';
  const g = C.guidePrompt(p);
  assert.ok(g.includes('학교폭력 예방 교육은 학기마다') && !g.includes('abc@school.kr'), g);
});

test('「인솔 교사」「인솔 선생님께」는 이름이 아님(쪽지·가정통신문·공문 처리·결과 보고 글이 「○○○ 교사」로 망가지지 않게), 「인솔: 박솔빛」은 그대로 가림', async () => {
  const { maskPersons } = await import('../../web/core/chat-names.js');
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const { redactText } = await import('../../web/core/redact.js');
  for (const s of ['4. 인솔 교사: 3학년 담임 5명, 보건 교사 1명', '출발 전 인솔 교사가 버스에서 안전 교육 실시', '인솔 선생님께 미리 알려 주세요', '인솔 강사: 외부 강사 2명']) {
    assert.equal(maskPersons(s).text, s, s);
    assert.equal(cleanSheet(s).text, s, s);
    assert.equal(redactText(s).text, s, s);
  }
  const doc = cleanSheet(['2026 현장체험학습 안내', '4. 인솔 교사: 3학년 담임 5명', '5. 출발 전 인솔 교사가 안전 교육 실시', '7. 인솔: 박솔빛', '8. 인솔 탁보결'].join('\n'));
  assert.deepEqual(leak(doc.text), [], doc.text);
  assert.ok(doc.text.includes('4. 인솔 교사: 3학년 담임 5명') && doc.text.includes('인솔 교사가 안전 교육') && doc.text.includes('7. 인솔: ○○○'), doc.text);
  assert.equal(doc.names, 2, '가린 이름은 둘만');
  // 외자 이름 규칙은 그대로(「김솔 선생님」)
  assert.equal(maskPersons('김솔 선생님께 제출').text, '○○○ 선생님께 제출');
});

test('직함·맡은 일 바로 뒤 괄호 안 이름(「교무부장(남다율)」「사회자(남다율), 기록(탁보결)」)과 「탁보결(교무부장)」도 가림, 교과·부서 괄호는 그대로', async () => {
  const { maskPersons } = await import('../../web/core/chat-names.js');
  const { cleanSheet } = await import('../../web/menus/evaluate/activity/activity-read.js');
  const { redactText } = await import('../../web/core/redact.js');
  for (const s of ['문의: 교무부장(남다율)', '담당: 3학년 부장(탁보결)', '작성자: 연구부장(남다율)', '3학년 학년 협의회 (사회자(남다율), 기록(탁보결))', '진행자(탁보결)가 맡기로 함',
    '담임 선생님(남다율)께 제출', '보고자(남다율)', '교감(남다율), 교무부장(탁보결)', '사회자(남다율 선생님)', '탁보결(교무부장)', '탁보결 (교무부장)'])
    for (const [tag, out] of [['mp', maskPersons(s).text], ['sheet', cleanSheet(s).text], ['redact', redactText(s).text]]) assert.deepEqual(leak(out), [], `${tag}: ${s} → ${out}`);
  assert.equal(maskPersons('진행자(탁보결)가 맡기로 함').text, '진행자(○○○)가 맡기로 함');
  for (const s of ['사회(한국사) 시간', '기록(사진)', '담당(정보부)', '촬영(방송반)', '담당(도서실)', '발표자(모둠장)', '교무부장(교육과정 담당)', '담임(3학년 1반)', '부장(겸임)', '교장(직무대리)',
    '위원(학부모)', '강사(원어민)', '문의(행정실)', '진행(학생회)', '선생님(전담)', '교사(기간제)', '도서관(사서)', '정보부(부장)', '연구실(담당)', '전학년(담임)'])
    assert.equal(maskPersons(s).text, s, s);
});

test('연간계획·행사계획 자료 글(sourceForAI): 맡은 일 쌍점 뒤 이름은 글 전체에서, 계좌 줄은 빼고, 「성교육을」「한글날을」「우수상 발표」는 그대로', async () => {
  const { sourceForAI } = await import('../../web/menus/plan/year-model.js');
  const { stripPersonal } = await import('../../web/core/survey.js');
  const f = t => sourceForAI(stripPersonal(t).text);
  const a = f(['Ⅳ. 추진 조직', '- 위원장: 교장, 간사: 탁보결(교무부장)', '- 독서 행사 진행: 남다율, 사진 기록: 탁보결', '- 도서 구입은 행정실 남다율 주무관과 협의',
    '- 강사비 입금 계좌: 농협 301-1234-5678-91', '4. 사회: 한가람, 기록: 박솔빛', '반성: 탁보결과 협의가 늦어짐'].join('\n'));
  assert.deepEqual(leak(a), [], a);
  assert.ok(!/301-1234/.test(a), '계좌');
  assert.ok(a.includes('Ⅳ. 추진 조직') && a.includes('독서 행사 진행: ○○○') && a.includes('반성: ○○○과 협의가 늦어짐'), a);
  const plain = ['1. 성교육을 학년별 15시간 이상 실시한다.', '2. 한글날을 맞아 우리말 사랑 행사를 연다.', '3. 결과: 우수상 발표 및 시상', '4. 옛날과 오늘날의 생활 모습 비교',
    '5. 기간: 2026-03-02 ~ 2026-12-31', '6. 진학률을 높이는 방안', '7. 진행: 학생회'].join('\n');
  assert.equal(f(plain), plain);
  // 연간계획(year.js)·행사계획 참고 자료·작년 설문(event.js)이 이 길로 보냄
  assert.ok(/const srcAI = t => sourceForAI\(stripPersonal\(t\)\.text\)/.test(src('menus/plan/year.js')));
  const ev = src('menus/plan/event.js');
  assert.ok(/text: sourceForAI\(stripPersonal\(r\.text\)\.text\)/.test(ev) && /sourceForAI\(stripPersonal\(e\.lastSurvey\)\.text\)/.test(ev));
});

test('결과 보고 AI 글: 넣은 파일 이름의 담당자·학생 이름도 가림(공문 처리·가정통신문과 같게)', async () => {
  const { reportPrompt } = await import('../../web/menus/plan/report-ai.js');
  const s = reportPrompt({ sources: [{ kind: 'plan', name: '2026 과학의 날 행사 계획(담당 박솔빛).hwp', text: '과학의 날 행사 계획' },
    { kind: 'last', name: '2025 체험학습 결과보고_한가람.hwp', text: '체험학습 결과' }], memo: '', year: 2026 });
  assert.deepEqual(leak(s), [], s);
  assert.ok(s.includes('[계획서: 2026 과학의 날 행사 계획(담당 ○○○).hwp]') && s.includes('2025 체험학습 결과보고 ○○○.hwp'), s);
  assert.ok(reportPrompt({ sources: [{ kind: 'plan', name: '', text: '계획' }], year: 2026 }).includes('[계획서: 글]'));
});

test('기초학력 관찰·결과 보고서 AI 글: 캠프 밖 다른 학생 이름(「탁보결과」「남다율을」「남다율도」)도 가림, 학생A·지도 글은 그대로', async () => {
  const M = await import('../../web/menus/class/camp-model.js');
  const A = await import('../../web/menus/class/camp-ai.js');
  const camp = M.newCamp({ name: '3학년 받아쓰기 교실', subjects: ['국어'], students: [{ id: 's1', name: '김하늘' }, { id: 's2', name: '이바다' }], teacher: '박솔빛' });
  camp.memo = { s1: '탁보결과 짝 활동을 하며 받침 읽기를 익힘. 남다율을 도와 끝까지 씀. 이바다와 함께 구구단을 외움.' };
  camp.obs = { s1: '모둠 활동에서 남다율도 챙기며 받아쓰기를 끝까지 함.', s2: '곱셈구구를 외우고 받침 있는 낱말을 바르게 읽음.' };
  const o = A.obsPrompt(camp, ['s1']), line = o.split('\n').find(l => l.includes('선생님 메모'));
  assert.deepEqual(leak(o), [], line);
  assert.ok(line.includes('학생A: ') && line.includes('○○○과 짝 활동을 하며 받침 읽기를 익힘') && line.includes('학생B와 함께 구구단을 외움'), line);
  const r = A.reportPrompt(camp);
  assert.deepEqual(leak(r), []);
  assert.ok(r.includes('학생B: 곱셈구구를 외우고 받침 있는 낱말을 바르게 읽음.'), r);
});

// 화면 모듈(gr-bundle.js)을 불러오려고 window·document를 흉내 냄 — 이 파일 맨 끝에 둠
test('행특 메모를 AI로 보낼 때(evaluate.js hkMemoAI → SSAM.memoNames.hide): 다른 학생 이름에 과·을·도가 붙어도 가림, 흔한 메모 글은 그대로', async () => {
  const el = () => ({ addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, style: {}, setAttribute() {}, getAttribute: () => null, dataset: {} });
  globalThis.window = globalThis; globalThis.SSAM = globalThis.SSAM || {};
  globalThis.document = globalThis.document || { addEventListener() {}, removeEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, body: el(), baseURI: 'http://x/', documentElement: el(), head: el() };
  await import('../../web/menus/evaluate/gr-bundle.js');
  const MN = globalThis.SSAM.memoNames, hk = m => MN.hide(MN.forAI(m));
  const out = hk('남다율과 다툰 뒤 먼저 사과함, 탁보결을 도와 수학 문제를 함께 풂, 모둠 활동에서 남다율도 챙김');
  assert.deepEqual(leak(out), [], out);
  assert.equal(out, '○○○과 다툰 뒤 먼저 사과함, ○○○을 도와 수학 문제를 함께 풂, 모둠 활동에서 ○○○도 챙김');
  for (const s of ['구구단을 외움', '모둠원과 협력함', '도서관을 자주 이용함', '정리를 잘함', '친구들과 사이좋게 지냄', '고무줄을 가지고 놂', '지우개를 빌려줌', '민주주의를 배움', '기초 연산을 익힘'])
    assert.equal(hk(s), s, s);
  assert.equal(hk('연락처 010-1234-5678 남김'), '연락처 ○○○ 남김');
});
