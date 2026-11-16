/* 2026-11-16 버그 찾기 고침 — 이름 가리기(문서 다듬기·회의록이 쓰는 core/redact.js·privacy.js·chat-names.js)와 글만 읽은 문서의 표.
   이름은 모두 지어낸 것(김하늘·이바다·한가람·박솔빛) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskJosaNames, maskStaff, stripNames, maskContacts } from '../../web/core/privacy.js';
import { maskPersons } from '../../web/core/chat-names.js';
import { makeRedactor } from '../../web/core/redact.js';
import { CHIPS, startItems, payloadOf, normChanges, plainDoc } from '../../web/menus/etc/docedit-model.js';
import { redactInput } from '../../web/menus/etc/minutes-ai.js';

const L = (text, inBox = false) => ({ text, inBox });
const NAMES = ['김하늘', '이바다', '한가람', '박솔빛', '김민준'];
const leaks = s => NAMES.filter(n => String(s).includes(n));

test('[fix1116-privacy-C1] 이름 뒤에 「로·으로(부터)」가 붙어도 가림 — 요청·문서 줄 모두, 되돌리면 원래 글', () => {
  const doc = ['가. 담당: 교무부장 김하늘 선생님', '나. 학생회장 선출 결과 안내'].map(t => L(t));
  for (const ask of ['김하늘을 이바다로 바꿔 줘', '담당자를 한가람으로 바꿔 줘', '담당자 이름을 이바다로 고쳐 줘']) {
    const p = payloadOf(startItems(doc), ask);
    assert.deepEqual(leaks(p.ask), [], `${ask} → ${p.ask}`);
    assert.equal(p.back(p.ask), ask, '되돌림');
  }
  const p = payloadOf(startItems(doc), '김하늘을 이바다로 바꿔 줘');
  assert.equal(p.ask, '〔이름1〕을 〔이름2〕로 바꿔 줘', '문서의 김하늘과 같은 번호');
  for (const l of ['학생회장은 김하늘로 정함.', '대표 학생을 이바다로 뽑았다.', '반장은 김민준으로 정했다.', '김민준으로부터 연락이 옴', '김하늘님으로 바뀜']) {
    const r = makeRedactor(), out = r.line(l);
    assert.deepEqual(leaks(out.text), [], `${l} → ${out.text}`);
    assert.equal(r.back(out.text), l);
  }
  // 채팅·행특 메모 쪽(maskPersons)도 「~으로」
  assert.equal(maskPersons('반장은 김민준으로 정했어').text, '반장은 ○○○으로 정했어');
  assert.equal(maskPersons('회장을 이서연으로 바꿈').text, '회장을 ○○○으로 바꿈');
});

test('[fix1116-privacy-C1-neg] 「로·으로」가 붙은 흔한 낱말(곳·방법·차례)은 그대로', () => {
  const plain = ['강당으로 모입니다', '현장으로 이동함', '정문으로 들어와요', '학교로 갑니다', '김치로 담근 반찬', '기본적으로 지킵니다',
    '구체적으로 적어 주세요', '마지막으로 정리함', '도서관으로 가요', '주차장으로 안내', '방송실로 와 주세요', '고속도로로 이동', '이메일로 보내 주세요',
    '기념품으로 줌', '문의 전화로 받음', '담당 강당으로 옮김', '강사 경력으로 봄', '한마음으로 응원', '이야기로 풀어 감', '구성원으로 참여', '유치원으로 감',
    '전체적으로 좋음', '정기적으로 점검', '모둠별로 발표', '연구부로 제출', '운동장으로 나감'];
  for (const l of plain) {
    assert.equal(maskJosaNames(l).text, l, `josa: ${l}`);
    assert.equal(maskStaff(l).text, l, `staff: ${l}`);
    assert.equal(maskPersons(l).text, l, `persons: ${l}`);
    const r = makeRedactor();
    assert.equal(r.line(l).text, l, `redact: ${l}`);
    assert.deepEqual(r.names, [], l);
  }
  // 받침과 맞지 않는 꼴(「강당으」+「로」)로 자르지 않음
  assert.equal(maskJosaNames('학생 강당으로 이동').text, '학생 강당으로 이동');
  // 요청에 흔한 말투·쓰임·차례 낱말 + 로(빠른 요청 칩 글 그대로 가야 AI가 알아들음)
  const doc = startItems([L('가. 담당: 교무부장 김하늘 선생님')]);
  for (const ask of [...CHIPS.map(c => c.ask).filter(Boolean), '공문체로 다듬어 줘', '경어체로 바꿔 줘', '표준어로 고쳐 줘', '명조체로', '안내용으로 짧게', '홍보용으로 바꿔 줘',
    '최종본으로 정리', '소제목으로 나눠 줘', '이름순으로 정렬', '기본값으로 둬', '기차역으로 모임', '민속촌으로 감', '장학사로 바꿈']) {
    assert.equal(payloadOf(doc, ask).ask, ask, ask);
    assert.equal(maskPersons(ask, { memo: true }).text, ask, `memo: ${ask}`);
  }
});

test('[fix1116-privacy-C2] 「이름」 머리 칸 아래 두 글자·조사 끝 글자 이름(이솔·박준·김가을)도 가림 — 글 표(|)와 한글(.hwpx) 표 모두', async () => {
  const rows = [['번호', '이름', '역할'], ['1', '김가을', '모둠장'], ['2', '이솔', '기록'], ['3', '박준', '발표']];
  const st = stripNames([...rows, ['4', '독고하늘', '정리']].map(r => r.join(' | ')).join('\n')).text;
  assert.ok(!st.includes('독고하늘'), '두 글자 성 이름도 그대로 가림');
  for (const n of ['김가을', '이솔', '박준']) assert.ok(!st.includes(n), `${n} → ${st}`);
  for (const w of ['모둠장', '기록', '발표', '이름', '역할']) assert.ok(st.includes(w), `${w}는 그대로`);
  // 글만 읽은 문서(.hwp·글)의 「칸 | 칸」 줄
  const q = payloadOf(startItems(rows.map(r => L(r.join(' | ')))), '공문체로');
  const qs = q.sent.map(x => x.text).join('\n');
  for (const n of ['김가을', '이솔', '박준']) assert.ok(!qs.includes(n), `plain ${n} → ${qs}`);
  assert.ok(qs.includes('모둠장') && qs.includes('발표'));
  // 한글(.hwpx) 표: 칸마다 줄이 따로라도 「이름」 칸 아래 칸은 보내지 않음
  const { makeHwpx } = await import('../../web/core/hwpx.js');
  const { readForm } = await import('../../web/core/hwpx-form.js');
  const form = await readForm(makeHwpx({ title: '모둠 역할', blocks: [{ type: 'table', head: true, rows }, { type: 'p', text: '이솔은 기록을 맡음.' }] }));
  const h = payloadOf(startItems(form.lines), '공문체로');
  const hs = h.sent.map(x => x.text).join('\n');
  for (const n of ['김가을', '이솔', '박준']) assert.ok(!hs.includes(n), `hwpx ${n} → ${hs}`);
  for (const w of ['기록', '발표', '이름', '역할']) assert.ok(hs.includes(w), `hwpx ${w}는 보냄`);
  assert.ok(h.held >= 3, `held ${h.held}`);
  assert.ok(hs.includes('〔이름') && hs.includes('은 기록을 맡음.'), '표 밖 줄의 같은 이름도 가림');
});

test('[fix1116-privacy-C2-neg] 「이름」 칸 아래라도 흔한 낱말(합계·전체·모두)은 그대로, 머리 칸 없는 표의 두 글자 칸도 그대로', async () => {
  const st = stripNames(['이름 | 점수', '김하늘 | 90', '전체 | 25명', '합계 | 300', '모두 | 참여'].join('\n')).text;
  assert.ok(!st.includes('김하늘'));
  for (const w of ['전체', '합계', '모두', '이름']) assert.ok(st.includes(w), `${w} → ${st}`);
  const plain = ['구분 | 내용 | 비고', '기간 | 3월 | 이상', '장소 | 강당 | 전원'].join('\n');
  assert.equal(stripNames(plain).text, plain, '머리 칸이 이름이 아니면 그대로');
  const { makeHwpx } = await import('../../web/core/hwpx.js');
  const { readForm } = await import('../../web/core/hwpx-form.js');
  const form = await readForm(makeHwpx({ title: '일정', blocks: [{ type: 'table', head: true, rows: [['구분', '내용'], ['기간', '3월'], ['장소', '강당']] }] }));
  const h = payloadOf(startItems(form.lines), '공문체로');
  assert.deepEqual(h.sent.map(x => x.text), ['일정', '구분', '내용', '기간', '3월', '장소', '강당']);
  assert.equal(h.held, 0);
});

test('[fix1116-privacy-C3] 쉼표로 이은 목록에서 가린 이름에 이어진 이름도 가림(참석자·위원 목록)', () => {
  for (const l of ['참석자: 김하늘(교장), 이바다(교감), 한가람(교무부장)', '협의 위원: 김하늘, 이바다', '참석자: 이바다, 김하늘', '모둠: 한가람·이바다']) {
    const r = makeRedactor(), out = r.line(l);
    assert.ok(out, l);
    assert.deepEqual(leaks(out.text), [], `${l} → ${out.text}`);
    assert.equal(r.back(out.text), l);
  }
});

test('[fix1116-privacy-C3-neg] 가린 이름이 없는 목록·이름 뒤 낱말 목록은 그대로', () => {
  for (const l of ['준비물: 도시락, 물병, 돗자리', '장소: 강당, 과학실, 운동장', '대상: 전교생, 교직원, 학부모', '안건: 체험학습, 운동회, 학예회']) {
    const r = makeRedactor();
    assert.equal(r.line(l).text, l);
    assert.deepEqual(r.names, []);
  }
  const r = makeRedactor(), out = r.line('담당: 김하늘 선생님, 연구부, 행정실').text;
  assert.equal(out, '담당: 〔이름1〕 선생님, 연구부, 행정실');
});

test('[fix1116-privacy-C10] 회의록: 참석 칸·메모의 「참석: …」 명단 줄 이름을 배워, 다른 줄의 맨 이름(「이바다: 과학관 추천」)도 가림', () => {
  for (const att of ['김하늘, 이바다, 한가람', '김하늘 이바다 한가람', '교장 김하늘, 교감 이바다', '이바다', '김하늘, 이바다']) {
    const r = redactInput('버스 예약은 이바다 담당\n- 김하늘 안내장 작성', { attendees: att });
    assert.deepEqual(leaks(r.text), [], `${att} → ${r.text}`);
    assert.equal(r.back(r.text), '버스 예약은 이바다 담당\n- 김하늘 안내장 작성');
  }
  const memo = '참석: 김하늘, 이바다, 한가람, 박솔빛\n1. 체험학습 장소\n- 이바다: 과학관 추천\n- 박솔빛 버스 예약 11/20까지\n- 한가람 안전교육 자료';
  for (const meta of [{ title: '5학년 협의회', attendees: '김하늘, 이바다, 한가람, 박솔빛' }, {}]) {
    const r = redactInput(memo, meta);
    assert.deepEqual(leaks(r.text), [], r.text);
    assert.equal(r.dropped, 1, '명단 줄은 그대로 보내지 않음');
    assert.equal(r.back(r.text), memo.split('\n').slice(1).join('\n'));
  }
});

test('[fix1116-privacy-C10-neg] 참석 칸의 직함·인원 말(담임·외·명·전원·조리원·주무관)은 이름으로 배우지 않음', () => {
  const memo = '3학년 담임 협의\n조리원 배치는 행정실 주무관이 정함\n전원 찬성\n연구부 의견 모음';
  for (const att of ['3학년 담임 5명', '교무부장 외 3명', '전원 참석', '조리원 2명, 행정실 주무관', '교장, 교감, 연구부', '영양사, 조리사, 지도원']) {
    const r = redactInput(memo, { attendees: att });
    assert.equal(r.text, memo, `${att} → ${r.text}`);
  }
});

test('[fix1116-privacy-C5] 「부장·담당·강사·문의 선생님」의 「선생」을 이름으로 배우지 않음 — 문서의 「선생님」이 〔이름n〕님으로 가지 않음', () => {
  for (const l of ['결과는 부장 선생님께서 취합합니다.', '강사 선생님 섭외', '문의 선생님께 드립니다', '담당 선생님께 제출', '부장 선생님은 회의에 참석', '담당 주임님께 제출', '강사 박사님 모심']) {
    assert.equal(maskStaff(l).text, l, l);
    const r = makeRedactor();
    assert.equal(r.line(l).text, l, l);
    assert.deepEqual(r.names, [], l);
  }
  const it = startItems(['가. 과제는 담임 선생님께 제출합니다.', '나. 결과는 부장 선생님께서 취합합니다.', '다. 선생님들께서는 협조 바랍니다.'].map(t => L(t)));
  assert.deepEqual(payloadOf(it, '공문체로').sent.map(x => x.text), ['가. 과제는 담임 선생님께 제출합니다.', '나. 결과는 부장 선생님께서 취합합니다.', '다. 선생님들께서는 협조 바랍니다.']);
});

test('[fix1116-privacy-C5-pos] 직함 옆 교직원 이름은 그대로 가림', () => {
  for (const [l, n] of [['강사 김솔 선생님께', '김솔'], ['담당 이나래에게 제출', '이나래'], ['담당: 박하늘', '박하늘'], ['3학년 부장 김솔', '김솔'], ['문의: 교무부장 이바다 선생님', '이바다']]) {
    const m = maskStaff(l).text;
    assert.ok(!m.includes(n) && m.includes('○○○'), `${l} → ${m}`);
  }
});

test('[fix1116-privacy-C6] 「이름: 이름을 정자로」의 「이름」을 이름으로 배우지 않고, 아는 이름을 가릴 때 자리 표시 〔이름n〕 안은 건드리지 않음', () => {
  const it = startItems(['3. 작성 요령', '가. 이름: 이름을 정자로 씁니다.', '나. 문의: 교무부장 이바다 선생님'].map(t => L(t)));
  const p = payloadOf(it, '공문체로');
  assert.deepEqual(p.sent.map(x => x.text), ['3. 작성 요령', '가. 이름: 이름을 정자로 씁니다.', '나. 문의: 교무부장 〔이름1〕 선생님']);
  const ai = { changes: [{ id: 3, op: 'replace', text: '나. 문의: 교무부장 〔이름1〕 선생님께 바랍니다' }] };
  const r = normChanges(ai, { ids: new Set(p.sent.map(x => x.id)), back: p.back, bad: p.bad });
  assert.deepEqual(r.changes.map(c => c.text), ['나. 문의: 교무부장 이바다 선생님께 바랍니다']);
  // 「이름」이 이름 목록에 들어 있어도(다른 규칙이 배운 경우) 자리 표시 안은 그대로
  const rd = makeRedactor();
  rd.names.push('이름');
  const out = rd.line('이름 칸에는 교무부장 이바다 선생님').text;
  assert.ok(!out.includes('〔〔'), out);
  assert.equal(rd.back(out), '이름 칸에는 교무부장 이바다 선생님');
  // 쌍점 뒤 진짜 이름은 그대로 가림
  for (const [l, n] of [['이름: 김하늘', '김하늘'], ['성명: 이솔', '이솔'], ['이름: 박준', '박준']]) {
    const x = makeRedactor().line(l).text;
    assert.ok(!x.includes(n), `${l} → ${x}`);
  }
  for (const l of ['성명: 성함을 적어 주세요', '이름: 이름만 적어 주세요']) assert.equal(makeRedactor().line(l).text, l);
});

test('[fix1116-privacy-C7] AI가 자리 표시 괄호를 바꾼 글(【이름1】·［이름1］·(이름1)·{1})은 깨진 것으로 버림', () => {
  const p = payloadOf(startItems([L('담당: 교무부장 이바다 선생님(041-123-4567)')]), '공문체로');
  assert.equal(p.sent[0].text, '담당: 교무부장 〔이름1〕 선생님({{1}})');
  const norm = text => normChanges({ changes: [{ id: 1, op: 'replace', text }] }, { ids: new Set([1]), back: p.back, bad: p.bad });
  for (const t of ['담당: 교무부장 【이름1】 선생님({{1}})', '담당: 교무부장 ［이름1］ 선생님({{1}})', '담당: 교무부장 (이름1) 선생님({{1}})', '담당: 교무부장 （이름 1） 선생님({{1}})',
    '담당: 교무부장 〔이름1〕 선생님({1})', '담당: 교무부장 〔이름1〕 선생님(｛1｝)', '담당: 교무부장 [이름1] 선생님({{1}})']) {
    const r = norm(t);
    assert.equal(r.broken, 1, t);
    assert.deepEqual(r.changes, [], t);
  }
  assert.deepEqual(norm('담당: 교무부장 〔이름 1〕 선생님({{ 1 }})').changes.map(c => c.text), ['담당: 교무부장 이바다 선생님(041-123-4567)']);
});

test('[fix1116-privacy-C7-neg] 자리 표시와 비슷하지만 보통 글(「이름 2자 이내」「(이름) 칸」「[1]」「(1)」)은 깨진 것이 아님', () => {
  const { bad } = makeRedactor();
  for (const t of ['이름 2자 이내로 씁니다', '(이름) 칸에 적기', '이름(한글)', '1) 이름 쓰기', '[1] 목적', '(1) 일시', '「이름」 칸', '학년 반 번호 이름 칸', '[붙임 1] 계획서']) assert.equal(bad(t), false, t);
});

test('[fix1116-privacy-C8] 주민등록번호: 긴 줄표·전각 하이픈(080101–3123456)·뒷자리 가린 꼴(080101-3******)이 든 줄도 보내지 않음', () => {
  for (const l of ['주민등록번호: 080101–3123456', '주민등록번호 080101－3123456', '김하늘 080101-3******', '외국인등록번호 080101 — 5＊＊＊＊＊＊', '생년월일 080101-3xxxxxx', '080101‐3123456']) {
    assert.equal(makeRedactor().line(l), null, l);
    assert.ok(!/080101/.test(maskContacts(l)), `maskContacts ${l} → ${maskContacts(l)}`);
  }
  assert.equal(makeRedactor().line('주민등록번호: 080101-3123456'), null, '예전 꼴도 그대로');
});

test('[fix1116-privacy-C8-neg] 날짜·기간·금액 범위·앞자리만 쓴 생년월일은 그대로 보냄', () => {
  for (const l of ['사업 기간 2026. 3. 1.–2027. 2. 28.', '예산 300000–1500000원', '행사일 2026-11-15', '생년월일: 080101-3', '번호 1–3번, 5–7번', '접수 2026–2027학년도']) {
    const out = makeRedactor().line(l);
    assert.ok(out && out.text === l, `${l} → ${out && out.text}`);
  }
});

test('[fix1116-privacy-C4] 글만 읽은 문서 → 기본 문서: .hwp 표(「칸 | 칸」 줄)는 표로, 워드 문단 안 탭(「1.⇥목적」)은 문단으로', () => {
  const doc = lines => { const ls = lines.map(t => L(t)); return plainDoc(ls, startItems(ls)); };
  // .hwp(blocksToText): 표 칸을 「 | 」로 이은 줄, 빈 끝 칸은 「|」로 끝남
  assert.deepEqual(doc(['체험학습 안내', '구분 | 내용 | 비고', '기간 | 2026. 3. |', '장소 | 과학관 | 버스', '끝.']).blocks, [
    { type: 'table', rows: [['구분', '내용', '비고'], ['기간', '2026. 3.', ''], ['장소', '과학관', '버스']] },
    { type: 'p', text: '끝.' }
  ]);
  // 워드: 번호·붙임 뒤 탭이 든 문단은 표가 아님(서로 합치지도 않음)
  assert.deepEqual(doc(['계획', '1.\t목적', '가.\t즐거움을 알게 함.', '붙임\t계획서 1부.  끝.']).blocks, [
    { type: 'p', text: '1.\t목적' }, { type: 'p', text: '가.\t즐거움을 알게 함.' }, { type: 'p', text: '붙임\t계획서 1부.  끝.' }
  ]);
  // 워드 표(칸마다 탭)는 그대로 표 — 두 줄 넘게, 또는 한 줄이라도 칸이 셋 넘으면
  assert.deepEqual(doc(['결재', '담당\t교감\t교장']).blocks, [{ type: 'table', rows: [['담당', '교감', '교장']] }]);
  assert.deepEqual(doc(['일정', '1.\t3월\t입학식', '2.\t4월\t체험학습']).blocks, [{ type: 'table', rows: [['1.', '3월', '입학식'], ['2.', '4월', '체험학습']] }]);
  // 표 줄 사이 「|」가 없는 보통 줄은 문단
  assert.deepEqual(doc(['안내', '가 또는 나를 고름', 'A|B 꼴 이름']).blocks, [{ type: 'p', text: '가 또는 나를 고름' }, { type: 'p', text: 'A|B 꼴 이름' }]);
});

/* ---------- 2026-11-16 검토 고침(되짚기) ---------- */
// 검토에서 찾은 흔한 공문 낱말 + 로·으로(성 글자로 시작하는 세 글자 낱말)
const RO_WORDS = ['예정대로', '기존대로', '지침대로', '안내대로', '공문대로', '원안대로', '양식대로', '명단대로', '방침대로', '신청대로', '지시대로',
  '노란색으로', '하늘색으로', '주황색으로', '연두색으로', '황금색으로', '지원청으로', '최종안으로', '조정안으로', '기본안으로', '정부안으로',
  '정규직으로', '전문직으로', '최우선으로', '지정석으로', '지하층으로', '기획팀으로', '지원팀으로', '이번주로', '지난주로', '전염병으로', '성희롱으로',
  '소그룹으로', '연장전으로', '전학급으로', '지원청으로부터'];

test('[fix1116-privacy-C1-regress] 흔한 공문 낱말 + 로·으로(예정대로·노란색으로·지원청으로·최종안으로·기획팀으로·이번주로)는 이름으로 보지 않음 — 바꾸는 말이 뒤에 와도', () => {
  for (const w of RO_WORDS) {
    for (const l of [`${w} 진행합니다.`, `관할 ${w} 보고합니다.`, `${w} 바꿔 줘`, `담당을 ${w} 정함`, `${w} 연락이 옴`]) {
      assert.equal(maskJosaNames(l).text, l, `josa: ${l}`);
      assert.equal(maskStaff(l).text, l, `staff: ${l}`);
      for (const memo of [false, true]) assert.equal(maskPersons(l, { memo }).text, l, `persons(${memo}): ${l}`);
      const r = makeRedactor();
      assert.equal(r.line(l).text, l, `redact: ${l}`);
      assert.deepEqual(r.names, [], l);
    }
  }
  // 문서 다듬기: 한 줄에서 이름으로 배워 문서 전체로 퍼지지 않음
  const it = startItems(['가. 일정: 기존 계획은 예정대로 추진함.', '나. 우천 시에도 예정대로 실시하되 장소는 강당으로 함.', '다. 표시는 노란색으로, 보고는 관할 지원청으로 함.'].map(t => L(t)));
  for (const c of CHIPS.filter(c => c.ask)) {
    const p = payloadOf(it, c.ask);
    assert.deepEqual(p.sent.map(x => x.text), it.map(x => x.text), c.ask);
    assert.equal(p.ask, c.ask);
  }
  // 장소·색 같은 것을 바꾸는 요청(「장소를 서울숲으로 바꿔 줘」)
  for (const ask of ['장소를 서울숲으로 바꿔 줘', '글씨 색을 하늘색으로 바꿔 줘', '날짜를 금요일로 바꿔 줘', '말투를 명령조로 바꿔 줘', '인사말로 바꿔 줘', '공지글로 바꿔 줘']) {
    assert.equal(payloadOf(it, ask).ask, ask, ask);
  }
});

test('[fix1116-privacy-C1-ctx] 「이름 + 로·으로」는 바꾸기·고르기 말(바꿔·정함·뽑·선출·변경·추천…) 앞이거나 이미 아는 이름일 때만 가림', () => {
  const doc = startItems([L('가. 담당: 교무부장 김하늘 선생님')]);
  for (const ask of ['김하늘을 이바다로 바꿔 줘', '담당자를 한가람으로 바꿔 줘', '담당자를 박솔빛으로 다시 바꿔 줘', '대표를 박솔빛으로 추천함']) {
    const p = payloadOf(doc, ask);
    assert.deepEqual(leaks(p.ask), [], `${ask} → ${p.ask}`);
    assert.equal(p.back(p.ask), ask);
  }
  for (const l of ['학생회장은 김하늘로 정함', '반장을 박솔빛으로 뽑았다.', '위원장은 한가람으로 선출함.', '담당을 박솔빛으로 변경함', '박솔빛으로부터 연락이 옴']) {
    const r = makeRedactor(), out = r.line(l);
    assert.ok(!out.text.includes(l.match(/김하늘|박솔빛|한가람/)[0]), `${l} → ${out.text}`);
    assert.equal(r.back(out.text), l);
  }
  // 바꾸는 말이 없어도 다른 줄에서 이름으로 안 낱말은 가림
  const p = payloadOf(startItems(['가. 담당: 박솔빛 선생님', '나. 다음 담당도 박솔빛으로 함.'].map(t => L(t))), '공문체로');
  assert.deepEqual(p.sent.map(x => x.text), ['가. 담당: 〔이름1〕 선생님', '나. 다음 담당도 〔이름1〕으로 함.']);
  // 채팅·행특 메모(maskPersons)도 같은 규칙
  assert.equal(maskPersons('담당을 한가람으로 바꿔 줘').text, '담당을 ○○○으로 바꿔 줘');
  assert.equal(maskPersons('담당을 최윤슬로 바꿔 줘', { memo: true }).text, '담당을 ○○○로 바꿔 줘');
  assert.equal(maskPersons('담당은 최윤슬로 해 줘', { memo: true }).text, '담당은 최윤슬로 해 줘', '바꾸는 말이 없으면 목록 밖 이름은 그대로');
  assert.equal(maskPersons('예정대로 바꿔 줘', { memo: true }).text, '예정대로 바꿔 줘');
});

test('[fix1116-privacy-C1-narrow] 끝 글자가 용·순인 이름(재용·영순·정순·병용)도 바꾸는 말 앞에서는 가림 — 홍보용·이름순·성적순 같은 낱말은 그대로', () => {
  for (const [ask, n] of [['담당자를 한재용으로 바꿔 줘', '한재용'], ['담당자를 이영순으로 바꿔 줘', '이영순'], ['담당자를 박정순으로 바꿔 줘', '박정순'], ['담당자를 최병용으로 바꿔 줘', '최병용']]) {
    const p = payloadOf(startItems([L('가. 담당: 교무부장 김하늘 선생님')]), ask);
    assert.ok(!p.ask.includes(n), `${ask} → ${p.ask}`);
    assert.equal(p.back(p.ask), ask);
  }
  for (const ask of ['홍보용으로 바꿔 줘', '안내용으로 바꿔 줘', '이름순으로 바꿔 줘', '성적순으로 바꿔 줘', '성명순으로 정렬해 바꿔 줘', '조정용으로 바꿔 줘', '지정용으로 바꿔 줘', '예정순으로 바꿔 줘']) {
    assert.equal(payloadOf(startItems([L('가. 담당: 교무부장 김하늘 선생님')]), ask).ask, ask, ask);
    assert.equal(maskPersons(ask, { memo: true }).text, ask, `memo: ${ask}`);
  }
});

test('[fix1116-privacy-C5-narrow] 세 글자 직함 + 님(주무관님께·장학사님께·연구사님께·조리사님께…)을 이름으로 배우지 않음', () => {
  const r = makeRedactor();
  const src = ['담당 주무관님께 제출', '행정실 주무관이 처리함', '교육청 장학사 방문', '담당 장학사님께 보고'];
  assert.deepEqual(r.lines(src).map(x => x.text), src);
  assert.deepEqual(r.names, []);
  for (const l of ['연구사님께 문의', '조리사님께 전달', '변호사님께 자문', '경찰관님께 감사', '소방관님께 감사', '담당 연구관님께 보고', '도지사님께 드림', '이사장님께 보고',
    '위원장님께 보고', '구청장님께 드림', '강사 장학관님께', '문의: 담당 주무관님']) {
    assert.equal(maskStaff(l).text, l, `staff: ${l}`);
    assert.equal(maskJosaNames(l).text, l, `josa: ${l}`);
    const x = makeRedactor();
    assert.equal(x.line(l).text, l, l);
    assert.deepEqual(x.names, [], l);
  }
  // 직함 옆 진짜 이름은 그대로 가림
  for (const [l, n] of [['담당 주무관 박솔빛님께', '박솔빛'], ['한가람님께 제출', '한가람'], ['담당 이바다 주무관님께', '이바다']]) {
    const x = makeRedactor().line(l).text;
    assert.ok(!x.includes(n), `${l} → ${x}`);
  }
});

test('[fix1116-privacy-C10-overlearn] 보내지 않는 줄은 사람 명단(머리 말이 참석·명단·위원·대상·학생·담당…)일 때만 이름을 배움 — 준비물·장소 같은 목록은 배우지 않음', () => {
  const r = makeRedactor();
  const doc = ['가. 준비물: 도시락, 우비, 안내문, 신분증', '나. 도시락은 각자 준비하고, 안내문은 미리 읽어 오세요.', '다. 장소: 강당 체육관 운동장 도서관',
    '라. 체육관은 2층입니다.', '준비물 도시락 우비 안내문 신분증', '대상: 전교생, 교직원, 학부모'];
  const out = r.lines(doc);
  assert.deepEqual(out.map(x => x && x.text), [null, doc[1], doc[2], doc[3], null, doc[5]]);
  assert.deepEqual(r.names, []);
  // 문서 다듬기도(보내지 않는 줄의 낱말을 배우지 않음)
  const p = payloadOf(startItems(doc.slice(0, 2).map(t => L(t))), '공문체로');
  assert.deepEqual(p.sent.map(x => x.text), [doc[1]]);
  // 사람 명단 줄은 그대로 배움(머리 말이 쌍점 앞이든 띄어 쓴 앞 낱말이든, 괄호 인원이 붙어도)
  for (const head of ['참석: ', '참석자(4명): ', '3학년 담임: ', '협의 위원 ', '대상 학생: ', '명단 - ', '1. 결석: ']) {
    const x = makeRedactor(), o = x.lines([`${head}김하늘, 이바다, 한가람, 박솔빛`, '- 이바다: 과학관 추천', '한가람 버스 예약']);
    assert.equal(o[0], null, head);
    assert.deepEqual(leaks(o[1].text + o[2].text), [], `${head} → ${o[1].text} / ${o[2].text}`);
  }
  // 표: 「이름」 머리 칸 아래 칸만 배움(이름이 늘어선 표 줄을 통째로 보내지 않을 때)
  const t = makeRedactor(), o = t.lines(['이름 | 이름 | 이름 | 비고', '김하늘 | 이바다 | 한가람 | 도시락', '이바다 발표, 도시락 지참']);
  assert.equal(o[1], null);
  assert.equal(o[2].text, '〔이름2〕 발표, 도시락 지참');
});

test('[fix1116-privacy-C10-narrow] 회의록 참석 칸: 흔한 성으로 시작하는 두~네 글자 이름은 모두 배움(이승기·정영자·김수한·최윤화·김솔·이산) — 직함·인원·부서 말은 아님', () => {
  for (const [att, memo] of [['이승기, 정영자', '- 이승기: 과학관 추천\n- 정영자 버스 예약'], ['최윤화, 김수한', '- 최윤화: 과학관 추천\n- 김수한 버스 예약'],
    ['김솔, 이산', '- 김솔: 과학관 추천\n- 이산 버스 예약'], ['교장 남궁하늘, 교감 이바다', '- 남궁하늘: 과학관 추천\n- 이바다 버스 예약'],
    ['김하늘(교무), 이산(연구), 정영자 주무관', '- 이산: 과학관 추천\n- 정영자 정산']]) {
    const r = redactInput(memo, { attendees: att });
    for (const n of att.split(/[\s,()]+/).filter(t => /^(이승기|정영자|최윤화|김수한|김솔|이산|남궁하늘|이바다)$/.test(t))) assert.ok(!r.text.includes(n), `${att}: ${n} → ${r.text}`);
    assert.equal(r.back(r.text), memo);
  }
  // 직함·인원·부서·쉼 말은 배우지 않음
  const memo = '3학년 담임 협의\n조리원 배치는 행정실 주무관이 정함\n전원 찬성\n연구부 의견 모음\n기타 안건 없음\n서기 지정\n조퇴 1명\n장학사 방문\n진로교사 의견';
  for (const att of ['3학년 담임 5명', '교무부장 외 3명', '전원 참석', '조리원 2명, 행정실 주무관', '교장, 교감, 연구부', '영양사, 조리사, 지도원', '서기, 기타', '조퇴 1명, 연가 1명',
    '장학사, 연구사', '진로교사, 정보교사, 안전요원', '위원장, 지역위원', '전교생', '여러분', '선생님들']) {
    const r = redactInput(memo, { attendees: att });
    assert.equal(r.text, memo, `${att} → ${r.text}`);
  }
});
