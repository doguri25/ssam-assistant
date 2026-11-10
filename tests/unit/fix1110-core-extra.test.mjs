// 2026-11-10 공통 영역 버그 찾기(core) — 다른 영역에서 찾아 넘긴 것:
// 설문·작년 결과 글의 칸 안 이름(core/survey.js), 엑셀 칸 안 줄바꿈이 다음 학생 메모로 밀리던 것(core/bundle.js memoRows),
// 저장 공간이 꽉 차 업무별 AI를 저장하지 못해도 「저장했어요」라고 하던 것(core/ai-roles.js가 성공 여부를 돌려줌)
// 글은 모두 지어낸 것
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { stripPersonal, stripTable } from '../../web/core/survey.js';
import { memoRows } from '../../web/core/bundle.js';
import { setTaskRole, setDefaultReview, resetRoles, getRoles } from '../../web/core/ai-roles.js';

function mem({ full = false } = {}) {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); m.set(k, String(v)); }, removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

test('[core-survey-names] 작년 설문·결과 글의 칸 안 이름(「김민수랑」「이서연 엄마예요」)도 가림, 칸(탭)·낱말은 그대로', () => {
  const r = stripPersonal(['좋았던 점\t아쉬운 점', '김민수랑 같이 해서 좋았어요\t없음', '이서연 엄마예요. 체험이 알찼어요\t시간이 짧았어요', '모둠 활동이 재미있었어요\t민준이가 다쳤어요'].join('\n'));
  assert.ok(!/김민수|이서연|민준/.test(r.text), r.text);
  assert.equal(r.text.split('\n')[1], '○○○랑 같이 해서 좋았어요\t없음');
  assert.equal(r.text.split('\n')[2].split('\t').length, 2, '칸 수');
  assert.ok(r.masked >= 3, String(r.masked));
  // 줄글(작년 결과 보고)도
  assert.equal(stripPersonal('운동회는 박지훈 학생 덕분에 잘 끝났어요. 정리정돈이 잘됨').text, '운동회는 ○○○ 학생 덕분에 잘 끝났어요. 정리정돈이 잘됨');
  // 구글 폼 CSV 표
  const t = stripTable([['타임스탬프', '좋았던 점', '바라는 점'], ['2026/10/01', '김민수랑 같이 달려서 좋았어요', '더 길게'], ['2026/10/01', '줄다리기', '최윤슬이 아파서 못 했어요']]);
  assert.ok(!/김민수|최윤슬/.test(t.text), t.text);
  assert.ok(t.text.includes('줄다리기') && t.text.includes('더 길게'), t.text);
  // 흔한 낱말은 그대로
  const s = '진로 탐색 활동이 유익했어요\n안전 지도가 잘 되었어요\n도서관 행사 참여율이 높았어요';
  assert.equal(stripPersonal(s).text, s);
});

test('[core-hk-bulk-excel] 엑셀 칸 안 줄바꿈(Alt+Enter, 「"…"」로 감싼 칸)은 한 학생 메모 — 다음 학생이 밀리지 않음', () => {
  assert.deepEqual(memoRows('1\t"성실함\n책임감 강함"\n2\t친구를 잘 도와줌\n3\t독서를 즐김').rows,
    [{ no: 1, memo: '성실함, 책임감 강함' }, { no: 2, memo: '친구를 잘 도와줌' }, { no: 3, memo: '독서를 즐김' }]);
  // 번호 없이 메모 한 칸만(차례대로 들어감)
  assert.deepEqual(memoRows('"성실함.\n책임감 강함"\n친구를 잘 도와줌\n"독서를 즐김\r\n질문이 많음"').rows.map(r => r.memo), ['성실함. 책임감 강함', '친구를 잘 도와줌', '독서를 즐김, 질문이 많음']);
  // 번호·이름·메모 세 칸, 칸 안 따옴표(「""」)
  const r = memoRows('1\t김민수\t"발표 잘함\n""꾸준함"""\n2\t이서연\t차분함');
  assert.deepEqual(r.rows, [{ no: 1, memo: '발표 잘함, "꾸준함"' }, { no: 2, memo: '차분함' }]);
  assert.equal(r.names, 2);
  // 손으로 친 따옴표는 그대로
  assert.deepEqual(memoRows('1\t"성실함" 친구를 도움\n2\t차분함').rows, [{ no: 1, memo: '"성실함" 친구를 도움' }, { no: 2, memo: '차분함' }]);
});

test('[core-save-result] 업무별 AI·기본 검토 AI·되돌리기: 저장하면 true, 저장 공간이 꽉 차면 false(저장된 값은 그대로)', () => {
  store.useStorage(mem());
  assert.equal(setTaskRole('grade', { main: { engine: 'claude', model: 'm1' } }), true);
  assert.equal(setDefaultReview({ engine: 'gemini', model: 'g1' }), true);
  assert.equal(resetRoles(), true);
  assert.equal(setTaskRole('nope', {}), false, '모르는 업무');
  const full = mem({ full: true });
  store.useStorage(full);
  assert.equal(setTaskRole('grade', { main: { engine: 'claude', model: 'm1' } }), false);
  assert.equal(setDefaultReview({ engine: 'gemini', model: 'g1' }), false);
  assert.equal(resetRoles(), false);
  assert.equal(getRoles().tasks.grade.main, null);
});
