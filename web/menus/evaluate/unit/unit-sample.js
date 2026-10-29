/* 단원평가 시연 자료 (모두 지어낸 예시): 정답지·평가지 한글 파일, 채점까지 끝난 평가 2개, 답안 PDF용 학생 답 */
import { itemType } from './unit-key.js';
import { gradeCell, autoJudge } from './unit-grade.js';
import { newTest } from './unit-model.js';

export const SAMPLE_META = { subject: '국어', grade: 3, term: 2, unitNo: 2, unitName: '중요한 내용을 적어요', round: 1 };
const P1 = '<국어> 70~75쪽', P2 = '<국어> 76~81쪽', P3 = '<국어> 82~87쪽', P4 = '<국어> 88~95쪽';
export const SAMPLE_ITEMS = [
  [1, '글의 내용 파악하기', '이해', '(2) ○', 5, '', P1],
  [2, '중요한 내용 찾기', '이해', '③', 10, '', P1],
  [3, '낱말의 뜻 알기', '지식', '㉯', 10, '', P1],
  [4, '글의 내용 파악하기', '이해', '민수', 10, '', P2],
  [5, '문단의 중심 문장 찾기', '이해', '②, ④', 10, '', P2],
  [6, '글과 그림 연결하기', '이해', '(1) - ②  (2) - ①', 10, '', P2],
  [7, '글의 내용 파악하기', '이해', '마을 도서관', 10, '', P3],
  [8, '낱말의 뜻 알기', '지식', '⑤', 5, '', P3],
  [9, '중요한 내용을 간추려 쓰기', '이해', '(예) 마을 도서관에서 책 읽기 잔치가 열린다. 등', 15, '예시 답안과 비슷한 내용으로 썼으면 정답 처리', P4],
  [10, '글을 읽고 자신의 생각 쓰기', '이해', '책 읽기 잔치에 가고 싶다. 친구와 함께 책을 고를 수 있기 때문이다.', 15, '까닭을 들어 자신의 생각을 썼으면 정답 처리', P4]
].map(([no, content, domain, answer, points, criteria, pages]) => ({ no, content, domain, type: itemType(answer, criteria), answer, points, criteria, pages }));

export function sampleKeyDoc() {
  const head = [['문항번호', '평가 내용', '행동 영역', '', '정답', '배점 및 채점 기준', '', '교과서 관련 쪽수'], ['', '', '지식', '이해', '', '배점', '채점 기준', '']];
  const rows = SAMPLE_ITEMS.map(i => [String(i.no), i.content, i.domain === '지식' ? '○' : '', i.domain === '이해' ? '○' : '', i.answer, String(i.points), i.criteria, i.pages]);
  return { title: '2학기 단원평가 문항 이원 분류 및 모범 답안 ( 3 )학년 ( 국어 )과 2단원 (1회)', blocks: [{ type: 'table', head: true, rows: [...head, ...rows] }] };
}

/* 평가지: [번호, 발문, 보기·답 칸] */
export const SAMPLE_QUESTIONS = [
  [1, '이 글은 무엇을 알리는 글인지 알맞은 것에 ○표를 하시오.', '(1) 운동회 소식  (      )\n(2) 책 읽기 잔치 소식  (      )'],
  [2, '이 글에서 가장 중요한 내용은 무엇입니까?\t(      )', '① 날씨가 좋다.\n② 그림책이 많다.\n③ 책 읽기 잔치가 열린다.'],
  [3, '‘잔치’의 뜻으로 알맞은 것을 찾아 기호를 쓰시오.', '㉮ 혼자 조용히 쉬는 일.\n㉯ 기쁜 일이 있을 때 여럿이 모여 즐기는 일.\n(                    )'],
  [4, '잔치에서 사회를 보는 친구의 이름을 쓰시오.', '(                    )'],
  [5, '이 글의 중심 문장 두 개를 고르시오.\t(       ,       )', '① 날씨가 맑다.\n② 마을 도서관에서 잔치가 열린다.\n③ 도서관은 크다.\n④ 누구나 책을 읽을 수 있다.'],
  [6, '알맞은 것끼리 선으로 이으시오.', '(1) 그림책 만들기 ⦁    ⦁① 4학년\n(2) 책 읽어 주기 ⦁    ⦁② 3학년'],
  [7, '책 읽기 잔치가 열리는 곳은 어디인지 쓰시오.', '(                    )'],
  [8, '‘간추리다’의 뜻으로 알맞은 것은 무엇입니까?\t(      )', '① 길게 늘이다.\n② 모두 지우다.\n③ 크게 말하다.\n④ 새로 만들다.\n⑤ 중요한 것만 골라 짧게 정리하다.'],
  [9, '이 글의 중요한 내용을 간추려 한 문장으로 쓰시오.', ''],
  [10, '이 글을 읽고 자신의 생각을 까닭과 함께 쓰시오.', '']
];
export const SAMPLE_PASSAGE = '우리 마을 도서관 소식\n다음 주 토요일에 마을 도서관에서 책 읽기 잔치가 열립니다. 3학년 친구들은 그림책을 만들고, 4학년 친구들은 동생들에게 책을 읽어 줍니다. 사회는 3학년 민수가 봅니다. 누구나 와서 책을 읽을 수 있습니다.';

export function samplePaperDoc() {
  const blocks = [
    { type: 'table', rows: [['국어 3-2', '', '2. 중요한 내용을 적어요 (1회)', '', '초등학교 학년     반     번 이름:'], ['', '<국어> 66~95쪽 / <국어활동> 22~35쪽', '', '', '']] },
    { type: 'p', text: '※ 다음 글을 읽고 물음에 답하시오. (1~10)' },
    { type: 'p', text: SAMPLE_PASSAGE }
  ];
  for (const [no, q, body] of SAMPLE_QUESTIONS) blocks.push({ type: 'p', text: [String(no), q, body].filter(Boolean).join('\n') });
  return { title: '', blocks };
}

/* 학생 답: [1~10번 답, 9·10번 AI 점수], 7번처럼 글자가 다른 단답은 AI가 같은 뜻으로 봄(similar) */
const ANS = [
  [['(2)', '③', '㉯', '민수', '②, ④', '(1)-②, (2)-①', '마을 도서관', '⑤', '마을 도서관에서 책 읽기 잔치가 열린다.', '잔치에 가고 싶다. 그림책을 만들어 보고 싶기 때문이다.'], 15, 15],
  [['(2)', '③', '㉮', '민수', '②', '(1)-②, (2)-①', '도서관', '⑤', '도서관에서 잔치를 한다.', '가고 싶다.'], 10, 8],
  [['(1)', '①', '㉯', '민지', '②, ④', '(1)-①, (2)-②', '마을 도서관', '③', '책을 읽는다.', ''], 5, 0],
  [['(2)', '③', '㉯', '민수', '②, ④', '(1)-②, (2)-①', '학교', '⑤', '토요일에 도서관에서 책 잔치가 있다.', '동생에게 책을 읽어 주고 싶다. 동생이 좋아하기 때문이다.'], 12, 15],
  [['(2)', '②', '㉯', '', '④, ②', '(1)-②, (2)-②', '마을 도서관', '⑤', '잔치가 열린다.', '재미있을 것 같다.'], 8, 6],
  [['(2)', '③', '㉯', '민수', '①, ④', '(1)-②, (2)-①', '마을 도서관', '⑤', '마을 도서관에서 토요일에 책 읽기 잔치가 열린다.', '책을 많이 읽고 싶다. 책이 재미있기 때문이다.'], 15, 12]
];
export const SAMPLE_ANSWERS = Object.fromEntries(ANS.slice(0, 4).map((a, s) => [s + 1, Object.fromEntries(a[0].map((v, i) => [i + 1, v]))]));
const GOOD = ['중요한 내용을 정확히 찾고 간추려 썼어요.', '사회를 보는 친구를 잘 찾았어요.', '낱말의 뜻을 잘 알고 있어요.', '글의 중요한 내용을 잘 간추렸어요.', '낱말의 뜻을 정확히 알고 있어요.', '자신의 생각을 까닭과 함께 잘 썼어요.'];
const CHEER = ['지금처럼 꼼꼼히 읽어 봐요!', '중심 문장을 다시 찾아 보면 더 좋아질 거예요.', '글을 한 번 더 천천히 읽어 봐요.', '잔치가 열리는 곳을 다시 확인해 봐요.', '선 잇기 문제를 다시 풀어 봐요.', '중심 문장 고르기를 한 번 더 연습해 봐요.'];

function graded(meta, date, shift, id) {
  const t = newTest({ meta: { ...SAMPLE_META, ...meta, date }, key: { domains: ['지식', '이해'], items: SAMPLE_ITEMS.map(i => ({ ...i })) }, paper: { text: '' } });
  t.id = id; t.done = true; t.createdAt = Date.parse(date + 'T09:00:00Z');
  t.students = ANS.map((_, s) => {
    const [reads, p9, p10] = ANS[(s + shift) % ANS.length];
    const items = {};
    for (const it of t.key.items) {
      const read = reads[it.no - 1];
      const auto = autoJudge(it, read);
      const pts = it.no === 9 ? p9 : it.no === 10 ? p10 : auto != null ? auto : (it.no === 7 && read === '도서관' ? it.points : 0);
      items[it.no] = { ...gradeCell(it, { read, points: pts, sure: true, why: it.type === 'essay' ? '채점 기준에 비추어 판단' : '' }), ok: true };
    }
    return { no: s + 1, skip: false, status: 'done', items, good: GOOD[(s + shift) % 6], cheer: CHEER[(s + shift) % 6] };
  });
  return t;
}
/* 예시로 채우기: 같은 단원 1회·2회 (학생 6명, 채점·확인·잘한 점까지 끝남) */
export const sampleTests = () => [graded({ round: 1 }, '2026-10-20', 0, 'sample-1'), graded({ round: 2 }, '2026-10-27', 1, 'sample-2')];
