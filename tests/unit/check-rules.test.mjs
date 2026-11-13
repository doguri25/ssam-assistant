// 생기부 기재 점검 규칙(스펙 2026-11-13 §4): 기재하면 안 되는 말(학교 밖 대회·수상, 자격증·인증시험, 사교육, 가족 직업·경제, 대학·기관·상호,
// 해외·어학연수, 논문·출간·특허, 장학금) · 단정적인 부정 표현 · 학생 이름·「이 학생은」 주어 · 학생끼리 같은 문장 · 글자 수(바이트) 초과.
// 흔한 학교 말(「교내 대회」「학급 회장」「부모님께 감사」「학습지」…)은 표시하지 않음. 표시 칸(start·end)은 글의 그 낱말
import test from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, KIND_NAME, checkText, checkItems, splitSentences, sentenceKey, findDuplicates, overLimit, neisBytes } from '../../web/menus/evaluate/check/check-rules.js';

const kinds = t => checkText(t).map(i => i.kind);
const words = t => checkText(t).map(i => i.word);
// 글 t에서 낱말 w를 표시하는지(종류 k, 칸이 글의 그 낱말과 같음)
function flags(t, w, k = 'ban') {
  const got = checkText(t);
  const hit = got.find(i => i.kind === k && t.slice(i.start, i.end).includes(w));
  assert.ok(hit, `「${t}」에서 「${w}」(${k})를 찾지 못함: ${JSON.stringify(got)}`);
  assert.equal(t.slice(hit.start, hit.end), hit.word, '표시 칸 = 낱말');
  assert.ok(hit.why && /요$/.test(hit.why), `까닭(해요체): ${hit.why}`);
  return hit;
}
const clean = t => assert.deepEqual(checkText(t), [], `「${t}」: ${JSON.stringify(checkText(t))}`);

test('종류와 이름', () => {
  assert.deepEqual(KINDS, ['ban', 'neg', 'name', 'dup', 'len']);
  assert.deepEqual(KIND_NAME, { ban: '기재 금지', neg: '부정 표현', name: '이름·주어', dup: '같은 문장', len: '글자 수' });
});

test('학교 밖 대회·수상', () => {
  assert.equal(flags('교외 과학 대회에서 금상을 수상함.', '교외 과학 대회').why, '학교 밖 대회·수상은 쓰지 않아요');
  flags('전국 어린이 미술 대회에 나가 입상함.', '전국 어린이 미술 대회');
  flags('교육감상을 받으며 꾸준한 노력을 인정받음.', '교육감상');
  flags('수학 올림피아드를 준비하며 문제를 탐구함.', '올림피아드');
  flags('교육장 표창을 받음.', '교육장 표창');
  // 교내인지 모르는 대회 수상: 「교내 대회가 아니면」
  assert.ok(flags('과학 탐구 대회에서 최우수상을 받음.', '대회에서 최우수상').why.includes('교내'));
  // 교내·학교·학급 대회, 시장(가게), 교외 체험학습은 그대로
  clean('교내 과학 탐구 대회에서 최우수상을 받음.');
  clean('학급 독서 골든벨 대회에서 끝까지 문제를 맞힘.');
  clean('학교 운동회 이어달리기 대회에서 친구들을 응원함.');
  clean('시장 상인의 하는 일을 조사하여 발표함.');
  clean('교외 체험학습 뒤 느낀 점을 글로 정리함.');
  clean('교내 수학 경시대회에 참가하여 끝까지 문제를 풂.');
  flags('줄넘기 대회에서 우승함.', '대회에서 우승');
  clean('반 대항 피구 대회에서 우승함.');
  clean('운동회 줄다리기 대회에서 준우승함.');
});

test('자격증·인증시험', () => {
  assert.equal(flags('토익 점수를 올리려고 꾸준히 공부함.', '토익').why, '자격증·인증시험은 쓰지 않아요');
  flags('한자능력검정시험 5급에 합격함.', '한자능력');
  flags('태권도 2품을 땀.', '태권도 2품');
  flags('컴퓨터활용능력 자격증을 취득함.', '자격증');
  flags('TOEFL 공부를 함.', 'TOEFL');
  flags('한국사능력검정 시험을 준비함.', '한국사능력');
  clean('한자를 익혀 낱말의 뜻을 짐작함.');
  clean('한국사에 관심이 많아 책을 찾아 읽음.');
  clean('1단원 평가에서 받아올림을 정확하게 계산함.');
  clean('1급수에 사는 생물을 조사함.');
});

test('사교육(학원·과외·학습지)', () => {
  assert.equal(flags('영어 학원에서 배운 표현을 씀.', '학원').why, '학원·과외 같은 사교육은 쓰지 않아요');
  flags('수학 과외를 받으며 실력이 늚.', '과외');
  flags('방문 학습지 선생님과 함께 공부함.', '학습지 선생님');
  flags('피아노 레슨을 꾸준히 받음.', '레슨');
  flags('선행 학습으로 미리 배운 내용을 설명함.', '선행 학습');
  // 수업 학습지(활동지), 과외 활동, 대학원, 눈높이(맞춤)는 그대로
  clean('학습지에 자신의 생각을 차근차근 정리함.');
  clean('방과후 과외 활동에 즐겁게 참여함.');
  clean('친구의 눈높이에 맞춰 차근차근 설명함.');
  clean('대학원에서 공부하는 과학자의 이야기를 읽음.');
});

test('부모·가족의 직업·직장·경제 형편', () => {
  assert.equal(flags('부모님이 의사여서 의학에 관심이 많음.', '부모님이 의사').why, '부모·가족의 직업·경제 형편은 쓰지 않아요');
  flags('아버지가 운영하시는 가게 일을 도움.', '아버지가 운영');
  flags('어머니의 직업을 소개함.', '어머니의 직업');
  flags('기초생활수급 가정이지만 밝게 생활함.', '기초생활수급');
  flags('가정 형편이 어려워도 성실함.', '가정 형편');
  // 감사·함께·도움은 그대로
  clean('부모님께 감사하는 마음을 편지로 전함.');
  clean('부모님과 함께 병원에 다녀온 경험을 발표함.');
  clean('어머니를 도와 설거지를 하며 가족의 소중함을 느낌.');
  clean('가족과 함께 식당에서 있었던 일을 일기로 씀.');
  clean('도형의 넓이를 구하는 방법을 설명함.');
  clean('부유물이 가라앉는 까닭을 실험으로 알아봄.');
});

test('특정 대학·기관·상호 이름', () => {
  assert.equal(flags('서울대학교 부설 영재교육원에서 탐구함.', '서울대학교').why, '특정 대학·기관·상호 이름은 쓰지 않아요');
  flags('국립중앙박물관을 견학하고 보고서를 씀.', '국립중앙박물관');
  flags('유튜브 영상을 만들어 학급에 소개함.', '유튜브');
  flags('파워포인트로 발표 자료를 만듦.', '파워포인트');
  flags('엑셀로 자료를 정리함.', '엑셀');
  flags('스크래치로 게임을 만듦.', '스크래치');
  // 이름 없는 기관·흔한 낱말은 그대로
  clean('박물관을 견학하고 보고서를 씀.');
  clean('역사박물관과 어린이박물관에 다녀온 일을 발표함.');
  clean('스크래치 기법으로 밤하늘을 표현함.');
  clean('과학 연구원이 되고 싶다는 꿈을 키움.');
  clean('학교도서관에서 책을 빌려 읽음.');
  clean('서울대공원에서 동물을 관찰함.');
});

test('해외·어학연수 · 논문·출간·특허 · 장학금', () => {
  assert.equal(flags('방학 동안 어학연수를 다녀옴.', '어학연수').why, '해외·어학연수는 쓰지 않아요');
  flags('해외 캠프에서 영어로 소통함.', '해외 캠프');
  flags('홈스테이를 하며 문화를 배움.', '홈스테이');
  assert.equal(flags('과학 논문을 읽고 요약함.', '논문').why, '논문·출간·특허는 쓰지 않아요');
  flags('자기 이야기를 책으로 출간함.', '출간');
  flags('발명품으로 특허를 받음.', '특허');
  assert.equal(flags('장학금을 받을 만큼 성실함.', '장학금').why, '장학금은 쓰지 않아요');
  clean('조선 시대 유학자의 생각을 조사함.');
  clean('학급 문집에 실을 글을 다듬음.');
});

test('단정적인 부정 표현 → 성장 중심으로', () => {
  for (const [t, w] of [['수업 시간에 산만함.', '산만함'], ['과제를 할 때 게으름.', '게으름'], ['기초 연산이 부족함.', '부족함'], ['발표를 잘 못함.', '못함'],
    ['교우 관계에 문제가 있음.', '문제가 있음'], ['수업 태도가 불량함.', '불량'], ['집중하지 못하고 자주 돌아다님.', '못하고'], ['이해력이 떨어짐.', '이해력이 떨어짐']]) {
    assert.equal(flags(t, w, 'neg').why, '성장 중심으로 바꿔 보세요', t);
  }
  // 성장으로 쓴 글은 그대로
  clean('자신의 부족한 점을 찾아 스스로 보완함.');
  clean('처음에는 발표를 어려워했으나 점차 자신감을 얻음.');
  clean('숙제를 게을리하지 않고 꾸준히 해 옴.');
  clean('처음에는 잘 하지 못했으나 끝까지 연습하여 해냄.');
  clean('떨어지는 물체의 빠르기를 비교함.');
  clean('불량 식품의 위험성을 알고 바른 식습관을 다짐함.');
  clean('부족 국가의 생활 모습을 조사함.');
  clean('자신의 잘못을 인정하고 친구에게 먼저 사과함.');
});

test('학생 이름 · 「이 학생은」 같은 주어', () => {
  const h = flags('김하늘은 친구를 잘 도와줌.', '김하늘', 'name');
  assert.equal(h.why, '학생 이름은 쓰지 않아요');
  assert.equal(h.start, 0); assert.equal(h.end, 3);
  flags('한가람이 모둠을 이끔.', '한가람', 'name');
  assert.equal(flags('이 학생은 책임감이 강함.', '이 학생은', 'name').why, '「이 학생은」 같은 주어는 빼요');
  flags('해당 학생은 성실함.', '해당 학생은', 'name');
  flags('○○이는 발표를 잘함.', '○○', 'name');
  clean('이번 활동에서 친구의 의견을 존중함.');
  clean('학급 회장으로서 친구들의 의견을 모음.');
  clean('한결같이 성실하게 1인 1역을 해냄.');
  clean('이해한 내용을 정리하여 발표함.');
  clean('정리정돈을 잘하여 교실을 깨끗하게 가꿈.');
  clean('강한 의지로 끝까지 해냄.');
});

test('흔한 평어는 아무것도 표시하지 않음', () => {
  for (const t of [
    '1인 1역인 우유 당번을 한 학기 동안 성실하게 맡아 학급에 보탬이 됨.',
    '친구가 어려워하면 먼저 다가가 도와주는 따뜻한 마음을 지님.',
    '토론 시간에는 근거를 들어 생각을 또렷하게 밝히며 반론함.',
    '받아올림이 있는 세 자리 수의 덧셈을 바르게 계산할 수 있음.',
    '역할극에서 방어자의 입장을 체험하며 학교폭력 상황에 지혜롭게 대처하는 방법을 익힘.',
    '여러 직업이 하는 일과 필요한 능력을 알아보고 관심 있는 직업의 특징을 꼼꼼하게 탐색함.',
    '교내 독서 감상문 대회에 참여하여 책을 읽고 느낀 점을 진솔하게 표현함.',
    '앞으로의 성장이 더욱 기대됨.',
    '모둠 활동에서 맡은 역할을 끝까지 책임감 있게 해냄.',
    '학급에 필요한 역할이 무엇인지 고민하고 알맞은 1인 1역을 스스로 골라 수행함.'
  ]) clean(t);
});

test('표시 칸: 여럿이면 앞에서부터, 같은 곳 겹침은 하나', () => {
  const t = '김하늘은 영어 학원에서 토익을 공부함.';
  const got = checkText(t);
  assert.deepEqual(got.map(i => i.word), ['김하늘', '학원', '토익']);
  assert.deepEqual(got.map(i => [i.start, i.end]), [[0, 3], [8, 10], [13, 15]]);
  for (const i of got) assert.equal(t.slice(i.start, i.end), i.word);
  assert.deepEqual(kinds('장학재단에서 장학금을 받음.'), ['ban', 'ban']);
  assert.deepEqual(words('장학재단에서 장학금을 받음.'), ['장학재단', '장학금']);
});

test('문장 나누기 · 같은 문장 열쇠(띄어쓰기·끝 마침표 무시)', () => {
  assert.deepEqual(splitSentences('맡은 일을 잘함. 친구를 도와줌.').map(s => s.t), ['맡은 일을 잘함.', '친구를 도와줌.']);
  const s = splitSentences('가 나다. 라마');
  assert.deepEqual(s.map(x => [x.start, x.end]), [[0, 5], [6, 8]]);
  assert.equal(sentenceKey('맡은 일을  끝까지 해냄.'), sentenceKey('맡은 일을 끝까지해냄'));
  assert.notEqual(sentenceKey('맡은 일을 끝까지 해냄.'), sentenceKey('맡은 일을 끝까지 해냄!이'));
});

test('같은 문장: 학생이 2명 이상이면(같은 묶음 안), 한 학생 안 후보끼리는 아님, 짧은 조각은 뺌', () => {
  const S = '앞으로의 성장이 더욱 기대됨.';
  const items = [
    { id: 'a', who: 1, group: 'hk', text: `발표를 즐겨 함. ${S}` },
    { id: 'b', who: 2, group: 'hk', text: `앞으로의  성장이 더욱 기대됨` },
    { id: 'c', who: 1, group: 'hk', text: `책을 즐겨 읽음. ${S}` }, // 1번의 다른 후보
    { id: 'd', who: 3, group: 'cc:auto', text: S }, // 다른 화면 묶음
    { id: 'e', who: 4, group: 'hk', text: '성실함.' },
    { id: 'f', who: 5, group: 'hk', text: '성실함.' }
  ];
  const g = findDuplicates(items);
  assert.equal(g.length, 1, JSON.stringify(g));
  assert.deepEqual(g[0].refs.map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(g[0].whos, [1, 2]);
  const a = g[0].refs[0];
  assert.equal(items[0].text.slice(a.start, a.end), S);
  const one = findDuplicates([{ id: 'x', who: 1, group: 'hk', text: S }, { id: 'y', who: 1, group: 'hk', text: S }]);
  assert.deepEqual(one, [], '한 학생 안');
});

test('글자 수·바이트 초과: 한도를 넘는 곳부터 끝까지 표시', () => {
  assert.equal(neisBytes('가a 나\n'), 3 + 1 + 1 + 3 + 2);
  const t = '가'.repeat(12);
  assert.equal(overLimit(t, { max: 12, unit: 'char' }), null);
  const o = overLimit(t + '나다', { max: 12, unit: 'char' });
  assert.deepEqual(o, { n: 14, max: 12, unit: 'char', cut: 12 });
  const b = overLimit('가나다라', { max: 9, unit: 'byte' });
  assert.deepEqual(b, { n: 12, max: 9, unit: 'byte', cut: 3 });
  const got = checkText(t + '나다', { limit: { max: 12, unit: 'char' } });
  assert.deepEqual(got, [{ kind: 'len', start: 12, end: 14, word: '나다', why: '최대 12자보다 2자 길어요' }]);
  assert.equal(checkText('가나다라', { limit: { max: 9, unit: 'byte' } })[0].why, '최대 9바이트보다 3바이트 길어요');
  assert.deepEqual(checkText(t, { limit: { max: 0 } }), [], '한도 없음');
  const sp = checkText('가'.repeat(12) + ' 나다', { limit: { max: 12, unit: 'char' } })[0];
  assert.deepEqual([sp.start, sp.end, sp.word], [13, 15, '나다'], '넘친 곳 앞 빈칸은 표시하지 않음');
});

test('checkItems: 글마다 표시 + 같은 문장(다른 학생 번호) + 모두 센 수', () => {
  const S = '앞으로의 성장이 더욱 기대됨.';
  const r = checkItems([
    { id: 'a', who: 1, group: 'hk', text: `영어 학원에 다님. ${S}`, limit: { max: 500, unit: 'char' } },
    { id: 'b', who: 2, group: 'hk', text: S },
    { id: 'c', who: 3, group: 'hk', text: '친구를 잘 도와줌.' }
  ]);
  assert.equal(r.texts, 3);
  assert.equal(r.count, 3, JSON.stringify(r.list));
  const a = r.list.find(x => x.id === 'a');
  assert.deepEqual(a.issues.map(i => i.kind), ['ban', 'dup']);
  assert.equal(a.issues[1].why, '다른 학생(2번) 글과 같은 문장이에요');
  assert.equal(r.list.find(x => x.id === 'b').issues[0].why, '다른 학생(1번) 글과 같은 문장이에요');
  assert.deepEqual(r.list.find(x => x.id === 'c').issues, []);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.byKind, { ban: 1, neg: 0, name: 0, dup: 2, len: 0 });
});

test('대회: 교내·학교·학급 경시·경연대회는 그대로, 「학교 밖」「학교 대표로 나간」 대회 수상은 표시(검토 #2)', () => {
  for (const x of ['교내 경시대회에 참가함.', '학교 경시대회에서 금상을 받음.', '학급 경연대회에서 친구들과 협동함.']) assert.deepEqual(checkText(x).filter(i => i.kind === 'ban'), [], x);
  for (const x of ['학교 밖 수영 대회에서 금상을 받음.', '방학 중 학교 밖 미술 대회에서 대상을 받음.', '학교 대표로 참가한 수원시 과학 경진 대회에서 금상을 받음.'])
    assert.ok(checkText(x).some(i => i.kind === 'ban'), x);
});

test('흔한 말 더: 「구구단 2단을 따라 외움」「고려대장경」은 그대로(검토 #7)', () => {
  for (const x of ['구구단 2단을 따라 외우며 곱셈의 뜻을 익힘.', '고려대장경을 조사하여 발표함.']) assert.deepEqual(checkText(x), [], x);
  assert.ok(checkText('고려대학교 견학에서 느낀 점을 씀.').some(i => i.kind === 'ban'));
  assert.ok(checkText('태권도 2단을 땄음.').some(i => i.kind === 'ban'));
});

test('같은 문장: dup:false인 글(고르지 않은 행특 후보)은 견주지 않음(검토 #7)', () => {
  const s = '친구의 말을 귀 기울여 듣고 자기 생각을 차분하게 말함.';
  const r = checkItems([
    { id: 'a', who: 1, group: 'hk', text: s },
    { id: 'b', who: 2, group: 'hk', text: s, dup: false }
  ]);
  assert.ok(r.list.every(x => x.issues.every(i => i.kind !== 'dup')), JSON.stringify(r.list.map(x => x.issues)));
  const r2 = checkItems([{ id: 'a', who: 1, group: 'hk', text: s }, { id: 'b', who: 2, group: 'hk', text: s }]);
  assert.ok(r2.list.every(x => x.issues.some(i => i.kind === 'dup')), '둘 다 견주면 같은 문장');
});
