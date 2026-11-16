/* 2026-11-16 버그 찾기 고침 — 이름 가리기(문서 다듬기·회의록이 쓰는 core/redact.js·privacy.js·chat-names.js)와 글만 읽은 문서의 표.
   이름은 모두 지어낸 것(김하늘·이바다·한가람·박솔빛) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { maskJosaNames, maskStaff, stripNames } from '../../web/core/privacy.js';
import { maskPersons } from '../../web/core/chat-names.js';
import { makeRedactor } from '../../web/core/redact.js';
import { startItems, payloadOf } from '../../web/menus/etc/docedit-model.js';
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
});

test('[fix1116-privacy-C2] 「이름」 머리 칸 아래 두 글자·조사 끝 글자 이름(이솔·박준·김가을)도 가림 — 글 표(|)와 한글(.hwpx) 표 모두', async () => {
  const rows = [['번호', '이름', '역할'], ['1', '김가을', '모둠장'], ['2', '이솔', '기록'], ['3', '박준', '발표']];
  const st = stripNames(rows.map(r => r.join(' | ')).join('\n')).text;
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
