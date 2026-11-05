// 2026-11-05 3차 고침(기타 › 가정통신문): 연도 없이 온 관련 공문 날짜도 학년도로(1·2월은 다음 해, 쪽지·공문 처리와 같게), 지난 공문이라 먼 뒤 날이면 한 해 앞
import test from 'node:test';
import assert from 'node:assert/strict';
import { normLetter, composeSend } from '../../web/menus/etc/letter-ai.js';
import { schoolYearOf } from '../../web/core/calendar.js';

const rel = (today, ...dates) => normLetter({ related: dates.map((date, i) => ({ no: `교무부-${i + 1}`, date, title: '공문' })) }, { year: schoolYearOf(today), today }).related.map(x => x.date);

test('[letter-year-2] 1·2월에 쓰면 연도 없는 1·2월 관련 공문 날짜는 그해(지난해가 아님), 12월은 지난해', () => {
  assert.deepEqual(rel('2027-01-12', '01-08', '12-20', '1월 8일'), ['2027-01-08', '2026-12-20', '2027-01-08']);
  assert.deepEqual(rel('2027-01-12', '2027-01-08', '2026-12-20'), ['2027-01-08', '2026-12-20']);
  assert.deepEqual(rel('2027-02-10', '01-08', '02-03', '11-02'), ['2027-01-08', '2027-02-03', '2026-11-02']);
  const n = normLetter({ title: '겨울방학 안내', related: [{ no: '교무부-321', date: '01-08', title: '겨울방학 운영 계획' }] }, { year: 2026, today: '2027-01-12' });
  const s = composeSend({ title: n.title, related: n.related, target: '보호자', date: '2027-01-12' });
  assert.ok(s.body.includes('1. 관련: 교무부-321(2027. 1. 8.) 「겨울방학 운영 계획」'), s.body);
});

test('[letter-year-2] 3~12월은 그대로: 11월에 쓴 12월·8월 공문은 그해, 3월에 쓴 2월 공문은 지난 학년도의 2월', () => {
  // letter-year-1 시험과 같음(조금 뒤 날은 그해)
  assert.deepEqual(rel('2026-11-05', '12-01', '08-20', '03-02'), ['2026-12-01', '2026-08-20', '2026-03-02']);
  // 3월: 학년도 2027이어도 지난 2월 공문을 다음 해(2028)로 읽지 않음
  assert.deepEqual(rel('2027-03-10', '02-20', '01-05', '03-02'), ['2027-02-20', '2027-01-05', '2027-03-02']);
  // 연도가 있으면 그대로, 없는 날은 빈칸
  assert.deepEqual(rel('2027-03-10', '2028-02-20', '02-30', ''), ['2028-02-20', '', '']);
  // today 없이 부르면(예전 꼴) 학년도만으로
  assert.equal(normLetter({ related: [{ no: 'A', date: '01-08' }] }, { year: 2026 }).related[0].date, '2027-01-08');
});
