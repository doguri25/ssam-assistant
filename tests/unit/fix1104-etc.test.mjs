// 2026-11-04 고침(기타 › 쪽지·공문 처리·가정통신문 회신서): 연도 없는 1·2월 날짜, 붙임 체크 남기기, 회신서 칸 나누기, 며칠짜리 일정 끝 날짜
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/core/store.js';
import { normMessage, composeMessage, schoolDate, moveStart } from '../../web/menus/etc/message-ai.js';
import { normGongmun } from '../../web/menus/etc/gongmun-ai.js';
import { listMessages, pushMessage } from '../../web/menus/etc/message-model.js';
import { replyRows, replyCells, plainLetterDoc, defaultPlain } from '../../web/menus/etc/letter-ai.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }
store.useStorage(mem());

test('[msg-year-1] 12월에 넣은 계획의 연도 없는 1·2월 날짜는 다음 해(공문 처리와 같은 규칙), 요일도 그 해로', () => {
  const m = normMessage({ when: [{ date: '01-08', time: '09:00~12:00' }], place: '시청각실', apply: { due: '12-28' } }, { year: 2026, today: '2026-12-10' });
  assert.equal(m.when[0].date, '2027-01-08');
  assert.equal(m.apply.due, '2026-12-28');
  const b = composeMessage(m, { thisYear: 2026 }).body;
  assert.ok(b.includes('2027. 1. 8.(금) 09:00~12:00, 시청각실') && b.includes('12. 28.(월)까지'), b);
  // 해를 넘기는 기간(연도 없음)은 끝도 다음 해
  assert.deepEqual(normMessage({ when: [{ date: '01-05~01-07' }] }, { year: 2026, today: '2026-12-10' }).when[0], { date: '2027-01-05', end: '2027-01-07', time: '', note: '' });
  // 2월에 받은 새 학년도 계획(3월): 오늘보다 60일 넘게 앞이면 한 해 뒤
  assert.equal(normMessage({ when: [{ date: '03-05' }] }, { year: 2026, today: '2027-02-20' }).when[0].date, '2027-03-05');
  // 연도가 있으면 그대로, 오늘·학년도가 없으면 예전처럼
  assert.equal(normMessage({ when: [{ date: '2026-01-08' }] }, { year: 2026, today: '2026-12-10' }).when[0].date, '2026-01-08');
  assert.equal(normMessage({ when: [{ date: '11-12' }] }, { year: 2026 }).when[0].date, '2026-11-12');
  // 공문 처리도 같은 함수
  assert.equal(schoolDate('01-08', 2026, '2026-12-10'), '2027-01-08');
  assert.equal(normGongmun({ due: '01-08' }, { year: 2026, today: '2026-12-10' }).due, '2027-01-08');
});

test('[msg-attach-1] 최근 쪽지에 붙임 체크(뺀 붙임)도 남김, 예전 쪽지(이름만)는 모두 체크', () => {
  pushMessage({ id: 'a1', at: 1, title: 'T', kind: 'etc', m: {}, len: 'base', attach: [{ name: '연수 공문', on: true }, { name: '연수 계획', on: false }] });
  const r = listMessages().find(x => x.id === 'a1');
  assert.deepEqual(r.attach, [{ name: '연수 공문', on: true }, { name: '연수 계획', on: false }]);
  assert.deepEqual(r.attachNames, ['연수 공문', '연수 계획']);
  pushMessage({ id: 'a2', at: 2, title: 'T', kind: 'etc', m: {}, len: 'base', attachNames: ['옛 붙임'] });
  assert.deepEqual(listMessages().find(x => x.id === 'a2').attach, [{ name: '옛 붙임', on: true }]);
});

test('[reply-colon-1] 회신서 칸 이름에 시간(13:00)이 있어도 □ 앞 콜론에서 나눔(회신서 모으기와 같게)', () => {
  assert.deepEqual(replyCells('1부(13:00~14:00): □ 신청 □ 미신청'), ['1부(13:00~14:00)', '□ 신청 □ 미신청']);
  assert.deepEqual(replyCells('참가 여부: □ 참가  □ 불참'), ['참가 여부', '□ 참가  □ 불참']);
  // □가 없으면 숫자 사이가 아닌 첫 콜론
  assert.deepEqual(replyCells('상담 시간(13:30): '), ['상담 시간(13:30)', '']);
  assert.deepEqual(replyCells('희망 시간: 13:00 이후'), ['희망 시간', '13:00 이후']);
  assert.deepEqual(replyCells('보호자 서명'), ['보호자 서명', '']);
  const rows = replyRows({ fields: ['1부(13:00~14:00): □ 신청 □ 미신청', '2부(14:10~15:10): □ 신청 □ 미신청'] });
  assert.deepEqual(rows.slice(2), [['1부(13:00~14:00)', '□ 신청 □ 미신청'], ['2부(14:10~15:10)', '□ 신청 □ 미신청']]);
  const doc = plainLetterDoc(defaultPlain('새싹초등학교'), { title: 'T', date: '2026-11-04', body: ['안녕하십니까?'], reply: { title: '신청서', fields: ['1부(13:00~14:00): □ 신청 □ 미신청'], due: '' } });
  assert.deepEqual(doc.blocks.find(b => b.type === 'table').rows[2], ['1부(13:00~14:00)', '□ 신청 □ 미신청']);
});

test('[msg-end-1] 며칠짜리 일정: 시작 날짜를 옮기면 끝도 같은 날 수만큼(고치는 중간 값이면 끝은 그대로), 거꾸로 된 끝·시작 없는 끝은 쓰지 않음', () => {
  const w = { date: '2026-11-12', end: '2026-11-13', time: '', note: '' };
  assert.deepEqual(moveStart(w, '2026-11-19'), { date: '2026-11-19', end: '2026-11-20', time: '', note: '' });
  assert.deepEqual(moveStart(w, ''), { date: '', end: '2026-11-13', time: '', note: '' });
  assert.deepEqual(moveStart(w, '0002-11-12'), { date: '0002-11-12', end: '2026-11-13', time: '', note: '' });
  assert.deepEqual(moveStart({ date: '2026-11-12', end: '', time: '15:00', note: '' }, '2026-11-19'), { date: '2026-11-19', end: '', time: '15:00', note: '' });
  // 끝 날짜가 시작보다 이르거나 시작이 없으면 끝은 쓰지 않음
  const m = { kind: 'training', title: '연수', place: '수련원', when: [{ date: '2026-11-19', end: '2026-11-13', time: '', note: '' }] };
  const b = composeMessage(m, { thisYear: 2026 }).body;
  assert.ok(b.includes('□ 일시·장소: 11. 19.(목), 수련원') && !b.includes('~11. 13.'), b);
  const b2 = composeMessage({ ...m, when: [{ date: '', end: '2026-11-13', time: '', note: '' }] }, { thisYear: 2026 }).body;
  assert.ok(!b2.includes('~') && !b2.includes('11. 13.'), b2);
  assert.ok(composeMessage({ ...m, when: [{ date: '2026-11-12', end: '2026-11-13', time: '', note: '' }] }, { thisYear: 2026 }).body.includes('11. 12.(목)~11. 13.(금), 수련원'), '바른 기간');
});
