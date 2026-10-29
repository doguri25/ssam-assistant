// 단원평가: 정답지(이원 분류표)·평가지 글 읽기 — AI 없이
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseKey, parsePaper, itemType, keyTotal } from '../../web/menus/evaluate/unit/unit-key.js';

const fx = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

test('정답지: 제목 줄에서 학기·학년·교과·단원·회차, 영역 이름, 10문항 100점', () => {
  const k = parseKey(fx('unit-key.txt'));
  assert.deepEqual(k.meta, { term: 2, grade: 3, subject: '국어', unitNo: 2, round: 1 });
  assert.deepEqual(k.domains, ['지식', '이해']);
  assert.equal(k.items.length, 10);
  assert.equal(keyTotal(k.items), 100);
  assert.deepEqual(k.items[0], { no: 1, content: '글의 내용 파악하기', domain: '이해', type: 'choice', answer: '(2) ○', points: 5, criteria: '', pages: '<국어> 70~75쪽' });
  assert.equal(k.items[2].domain, '지식');
});

test('정답지: 문항 유형 짐작', () => {
  const t = parseKey(fx('unit-key.txt')).items.map(i => i.type);
  assert.deepEqual(t, ['choice', 'choice', 'symbol', 'short', 'choice', 'match', 'short', 'choice', 'essay', 'essay']);
  assert.equal(itemType('③', ''), 'choice');
  assert.equal(itemType('③, ⑤', ''), 'choice');
  assert.equal(itemType('(3) ○', ''), 'choice');
  assert.equal(itemType('㉯', ''), 'symbol');
  assert.equal(itemType('(1) - ①  (2) - ②', ''), 'match');
  assert.equal(itemType('준호', ''), 'short');
  assert.equal(itemType('(예) 친구와 계속 이야기하려고 노력해야 함. 등', ''), 'essay');
  assert.equal(itemType('책을 많이 읽는다.', '까닭을 들어 썼으면 정답 처리'), 'essay');
});

test('정답지: 영역이 3개인 표', () => {
  const text = [
    '1학기 단원평가 문항 이원 분류 및 모범 답안 ( 4 )학년 ( 수학 )과 3단원 (2회)',
    '문항번호 | 평가 내용 | 행동 영역 | 정답 | 배점 및 채점 기준 | 교과서 관련 쪽수',
    '계산 | 이해 | 문제해결 | 배점 | 채점 기준',
    '1 | 곱셈하기 | ○ |  |  | 345 | 10 |  | <수학> 50쪽',
    '2 | 곱셈의 뜻 알기 |  | ○ |  | ② | 10 |  | <수학> 52쪽'
  ].join('\n');
  const k = parseKey(text);
  assert.deepEqual(k.meta, { term: 1, grade: 4, subject: '수학', unitNo: 3, round: 2 });
  assert.deepEqual(k.domains, ['계산', '이해', '문제해결']);
  assert.equal(k.items[0].domain, '계산');
  assert.equal(k.items[0].answer, '345');
  assert.equal(k.items[1].domain, '이해');
  assert.equal(k.items[1].type, 'choice');
});

test('정답지: 칸을 합치지 않은 머리(둘째 머리 줄이 빈 칸으로 시작)', () => {
  const text = [
    '2학기 단원평가 문항 이원 분류 및 모범 답안 ( 3 )학년 ( 국어 )과 2단원 (1회)',
    '문항번호 | 평가 내용 | 행동 영역 |  | 정답 | 배점 및 채점 기준 |  | 교과서 관련 쪽수',
    ' |  | 지식 | 이해 |  | 배점 | 채점 기준 | ',
    '1 | 글의 내용 파악하기 |  | ○ | (2) ○ | 5 |  | <국어> 70~75쪽',
    '2 | 생각 쓰기 | ○ |  | (예) 좋다. | 15 | 비슷하면 정답 | <국어> 88쪽'
  ].join('\n');
  const k = parseKey(text);
  assert.deepEqual(k.domains, ['지식', '이해']);
  assert.deepEqual(k.items[0], { no: 1, content: '글의 내용 파악하기', domain: '이해', type: 'choice', answer: '(2) ○', points: 5, criteria: '', pages: '<국어> 70~75쪽' });
  assert.equal(k.items[1].domain, '지식'); assert.equal(k.items[1].criteria, '비슷하면 정답'); assert.equal(k.items[1].points, 15);
});

test('정답지: 머리 위 학교 이름·빈 줄, 숫자가 아닌 배점, 이어지는 줄', () => {
  const text = [
    '가나초등학교',
    '',
    '2학기 단원평가 문항 이원 분류 및 모범 답안 ( 3 )학년 ( 국어 )과 1단원 (1회)',
    '문항번호 | 평가 내용 | 행동 영역 | 정답 | 배점 및 채점 기준 | 교과서 관련 쪽수',
    '지식 | 이해 | 배점 | 채점 기준',
    '1 | 시 읽기 |  | ○ | (예) 즐거웠다. | 가 | 비슷하면 정답 | <국어> 36쪽',
    ' |  |  |  | 등 |  | 처리 | ',
    '2 | 낱말 알기 | ○ |  | ③ | 4 |  | <국어> 40쪽'
  ].join('\n');
  const k = parseKey(text);
  assert.equal(k.items.length, 2);
  assert.equal(k.items[0].points, 0);
  assert.equal(k.items[0].answer, '(예) 즐거웠다. 등');
  assert.equal(k.items[0].criteria, '비슷하면 정답 처리');
  assert.equal(k.items[1].no, 2);
  assert.equal(keyTotal(k.items), 4);
});

test('정답지: 표가 없는 글은 null', () => {
  assert.equal(parseKey('다음 시를 읽고 물음에 답하시오.\n1\n은행잎 편지'), null);
  assert.equal(parseKey(''), null);
});

test('평가지: 머리에서 교과·학년·학기·단원·회차, 번호 줄로 문항 발문', () => {
  const p = parsePaper(fx('unit-paper.txt'));
  assert.deepEqual(p.meta, { subject: '국어', grade: 3, term: 2, unitNo: 2, unitName: '중요한 내용을 적어요', round: 1 });
  assert.equal(Object.keys(p.questions).length, 10);
  assert.equal(p.questions[1], '이 글은 무엇을 알리는 글인지 알맞은 것에 ○표를 하시오.');
  assert.equal(p.questions[3], '‘잔치’의 뜻으로 알맞은 것을 찾아 기호를 쓰시오.');
  assert.equal(p.questions[10], '이 글을 읽고 자신의 생각을 까닭과 함께 쓰시오.');
});

test('평가지: 머리가 없어도 문항은 읽음', () => {
  const p = parsePaper('1\n첫 문제입니다.\n2\n둘째 문제입니다.');
  assert.deepEqual(p.meta, { subject: '', grade: null, term: null, unitNo: null, unitName: '', round: null });
  assert.deepEqual(p.questions, { 1: '첫 문제입니다.', 2: '둘째 문제입니다.' });
});

test('시연 자료: 정답지·평가지 한글 파일 글이 그대로 읽힘(10문항·100점)', async () => {
  const { sampleKeyDoc, samplePaperDoc, SAMPLE_ITEMS } = await import('../../web/menus/evaluate/unit/unit-sample.js');
  const docText = d => [d.title, ...d.blocks.flatMap(b => (b.type === 'table' ? b.rows.map(r => r.join(' | ')) : String(b.text || '').split('\n')))].join('\n');
  const k = parseKey(docText(sampleKeyDoc()));
  assert.equal(k.items.length, 10); assert.equal(keyTotal(k.items), 100);
  assert.deepEqual(k.items.map(i => i.type), SAMPLE_ITEMS.map(i => i.type));
  assert.deepEqual(k.meta, { term: 2, grade: 3, subject: '국어', unitNo: 2, round: 1 });
  const p = parsePaper(docText(samplePaperDoc()));
  assert.equal(p.meta.unitName, '중요한 내용을 적어요');
  assert.equal(Object.keys(p.questions).length, 10);
});

test('검토 고침: 합친 칸을 풀어 쓴 표(둘째 머리 줄이 머리 이름을 되풀이)도 읽음', () => {
  const text = [
    '2학기 단원평가 문항 이원 분류 및 모범 답안 ( 3 )학년 ( 국어 )과 1단원 (1회)',
    '문항번호 | 평가 내용 | 행동 영역 | 행동 영역 | 정답 | 배점 및 채점 기준 | 배점 및 채점 기준 | 교과서 관련 쪽수',
    '문항번호 | 평가 내용 | 지식 | 이해 | 정답 | 배점 | 채점 기준 | 교과서 관련 쪽수',
    '1 | 시의 내용 파악 |  | ○ | ③ | 5 |  | <국어> 36~41쪽',
    '2 | 시의 내용 파악 | ○ |  | ㉯ | 5 |  | <국어> 36~41쪽'
  ].join('\n');
  const k = parseKey(text);
  assert.deepEqual(k.domains, ['지식', '이해']);
  assert.deepEqual(k.items[1], { no: 2, content: '시의 내용 파악', domain: '지식', type: 'symbol', answer: '㉯', points: 5, criteria: '', pages: '<국어> 36~41쪽' });
});

test('검토 고침: 「배 점」·「배점(점)」·「점수」 머리도 읽고, 엉뚱하게 읽히면 null(AI로 넘김)', () => {
  const mk = h => ['( 3 )학년 ( 국어 )과 1단원 (1회)', '문항번호 | 평가 내용 | 행동 영역 | 정답 | 배점 및 채점 기준 | 교과서 관련 쪽수', `지식 | 이해 | ${h} | 채점 기준`,
    '1 | 시 읽기 |  | ○ | ③ | 5 |  | <국어> 36쪽', '2 | 낱말 | ○ |  | ㉯ | 5 |  | <국어> 40쪽'].join('\n');
  for (const h of ['배 점', '배점(점)', '점수']) {
    const k = parseKey(mk(h));
    assert.ok(k, h);
    assert.deepEqual(k.items.map(i => [i.answer, i.points]), [['③', 5], ['㉯', 5]], h);
  }
  assert.equal(parseKey(mk('채 점 표')), null);
});
