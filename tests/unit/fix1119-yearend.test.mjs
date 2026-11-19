/* 학년말 마감 도우미·교내 자율연수·쪽지 회신 기한·현황판 공유(스펙 2026-11-19-yearend-design). 예시 이름은 지어낸 것 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from '../../web/menus/home/yearend-model.js';
import * as T from '../../web/menus/training/training-model.js';

test('학년말 마감: 줄마다 상태·설명·가는 곳, [했어요], 12~2월', () => {
  assert.deepEqual(['2026-11-30', '2026-12-01', '2027-01-15', '2027-02-28', '2027-03-01'].map(Y.yearendSeason), [false, true, true, true, false]);
  const d = {
    check: { texts: 40, open: 3, gaps: [{ base: '행동특성', missing: [3, 7] }], writers: 25 },
    evals: [{ title: '분수 단원평가', stage: 'result', pending: 2 }, { title: '활동지', stage: 'done' }, { title: '끝낸 것', stage: 'grade', closed: true }],
    progress: [{ name: '국어', plan: 100, actual: 96, diff: -2 }, { name: '수학', plan: 80, actual: 80, diff: 0 }],
    camps: [{ name: '수학 캠프', docs: [{ label: '수업 확인서', state: 'ready', note: '' }, { label: '결과 보고서', state: 'todo', note: '2칸 비어 있음' }] }],
    training: { mineTotal: 5, mineLeft: 1, boardCourses: 2, boardLeft: [{ title: '청렴교육', left: 3 }] },
    budget: [{ project: { name: '사진전' }, left: 154000 }, { project: null, left: 0 }],
    gongmun: [{ done: true }, { done: false }], backupAt: Date.UTC(2026, 11, 1), now: Date.UTC(2026, 11, 10), prepYear: 0
  };
  const rows = Y.yearendRows(d);
  const by = id => rows.find(r => r.id === id);
  assert.deepEqual(rows.map(r => r.id), Y.ROWS.map(r => r[0]));
  assert.equal(by('writers').line, '글이 없는 학생 — 행동특성 3·7번');
  assert.equal(by('check').line, '고칠 곳 3곳(쓰면 안 되는 말·같은 문장·글자 수 등)');
  assert.equal(by('evals').line, '마치지 않은 평가 1개 · 선생님 차례 2곳 — 「분수 단원평가」');
  assert.equal(by('progress').line, '남은 시수 4시간 · 진도가 뒤처진 교과 국어(-2)');
  assert.equal(by('camp').line, '「수학 캠프」 결과 보고서 2칸 비어 있음');
  assert.equal(by('training').line, '내 필수연수 미이수 1개 · 현황판 미제출 — 청렴교육 3명');
  assert.equal(by('budget').line, '남은 예산 154,000원(1개 사업) — 불용·이월을 확인하세요');
  assert.equal(by('gongmun').line, '다 하지 않은 공문 1개');
  assert.equal(by('backup').state, 'done');
  assert.equal(by('newyear').state, 'none');
  assert.deepEqual(by('budget').go, { to: 'budget' });
  assert.deepEqual(Y.yearendScore(rows), { done: 1, total: 10 });
  const marked = Y.yearendRows(d, new Set(['handover', 'gongmun']));
  assert.ok(marked.find(r => r.id === 'handover').state === 'done' && marked.find(r => r.id === 'handover').marked);
  // 아무 자료가 없으면 대부분 해당 없음, 1·2월 새 학년도
  const empty = Y.yearendRows({ prepYear: 2027, now: 0 });
  assert.equal(empty.find(r => r.id === 'newyear').state, 'todo');
  assert.equal(empty.find(r => r.id === 'writers').state, 'none');
  assert.equal(empty.find(r => r.id === 'backup').line, '아직 백업 파일을 만들지 않았어요');
});

const board = () => T.normBoard({ staff: [{ id: 'a', name: '김하늘', dept: '3학년' }, { id: 'b', name: '이바다', dept: '보건교사' }, { id: 'c', name: '한가람', dept: '행정실' }],
  courses: [{ id: 'c1', title: '학교폭력 사안 처리 연수', target: ['교원'], inhouse: { date: '2026-11-25', time: '15:00~16:30', place: '시청각실', lecturer: '새싹교육지원청 장학사', hours: 2 } }] });

test('교내 자율연수: 안내 쪽지·출석 서명부·모두 참석·결과 보고', () => {
  let b = board();
  const c = b.courses[0];
  assert.deepEqual(c.inhouse, { date: '2026-11-25', time: '15:00~16:30', place: '시청각실', lecturer: '새싹교육지원청 장학사', hours: 2 });
  const n = T.inhouseNotice(c);
  assert.ok(n.startsWith('[연수 안내] 학교폭력 사안 처리 연수') && n.includes('□ 일시: 2026. 11. 25.(수) 15:00~16:30') && n.includes('□ 대상: 교원') && n.includes('□ 연수 시간: 2시간'), n);
  const sign = T.signSheetDoc(b, 'c1', { school: '새싹초등학교' });
  assert.equal(sign.title, '학교폭력 사안 처리 연수 출석 서명부');
  assert.deepEqual(sign.blocks.find(x => x.type === 'table').rows, [['연번', '부서', '이름', '서명'], ['1', '3학년', '김하늘', ''], ['2', '보건교사', '이바다', '']], '대상(교원)만');
  b = T.setMark(b, 'c1', 'b', 'back', { note: '불참' });
  b = T.allPresent(b, 'c1');
  assert.deepEqual([T.markOf(b, 'c1', 'a').s, T.markOf(b, 'c1', 'a').date, T.markOf(b, 'c1', 'a').hours, T.markOf(b, 'c1', 'b').s], ['ok', '2026-11-25', 2, 'back'], '반려는 그대로');
  const r = T.inhouseReportDoc(b, 'c1', { summary: '사안 처리 절차\n- 사례 나누기', year: 2026, school: '새싹초등학교' });
  assert.equal(r.title, '2026학년도 교내 자율연수(학교폭력 사안 처리 연수) 운영 결과 보고');
  const txt = r.blocks.filter(x => x.type === 'p').map(x => x.text);
  assert.ok(txt.includes('  라. 대상·참석: 교원 2명 중 1명 참석(50%) · 연수 시간 2시간') && txt.includes('    - 사례 나누기') && txt.includes('  바. 불참: 1명 — 개별 안내 후 이수하도록 함'), txt.join('\n'));
  assert.deepEqual(r.blocks.find(x => x.type === 'table').rows.slice(1), [['1', '3학년', '김하늘', '참석(11. 25.)'], ['2', '보건교사', '이바다', '반려(불참)']]);
  assert.equal(T.normBoard({ courses: [{ id: 'x', title: '청렴교육' }] }).courses[0].inhouse, null);
});

test('현황판 공유: 내보내기·가져오기(보관 표시 뺌)·합치기', () => {
  let a = board();
  a = T.setMark(a, 'c1', 'a', 'sent', { kept: true });
  const file = T.exportBoard(a, 2026);
  const back = T.parseBoardFile(file);
  assert.equal(back.staff.length, 3); assert.equal(T.markOf(back, 'c1', 'a').kept, false);
  assert.equal(T.parseBoardFile('{"kind":"other"}'), null); assert.equal(T.parseBoardFile('not json'), null);
  // 다른 선생님 판: 같은 사람(이름·부서)·같은 연수 이름은 하나로, 상태는 더 나아간 것
  const other = T.normBoard({ staff: [{ id: 'x1', name: '김하늘', dept: '3학년' }, { id: 'x2', name: '박솔빛', dept: '교무실무사' }],
    courses: [{ id: 'y1', title: '학교폭력 사안 처리 연수' }, { id: 'y2', title: '청렴교육', due: '2026-12-01' }],
    marks: { y1: { x1: { s: 'ok', date: '2026-11-25' } }, y2: { x2: { s: 'sent' } } } });
  const m = T.mergeBoards(a, other);
  assert.deepEqual(m.staff.map(s => s.name), ['김하늘', '이바다', '한가람', '박솔빛']);
  assert.deepEqual(m.courses.map(c => c.title), ['학교폭력 사안 처리 연수', '청렴교육']);
  assert.equal(T.markOf(m, 'c1', 'a').s, 'ok', '제출 → 확인(더 나아간 것)');
  assert.equal(T.markOf(m, 'c1', 'a').kept, true, '이 기기 보관 표시는 그대로');
  const pid = m.staff.find(s => s.name === '박솔빛').id, cid = m.courses.find(c => c.title === '청렴교육').id;
  assert.equal(T.markOf(m, cid, pid).s, 'sent');
});

test('쪽지 회신 기한 → 오늘 할 일, 채팅 「학년말 마감」', async () => {
  const { deadlineLines } = await import('../../web/menus/etc/message-model.js');
  const list = [{ title: '[제출 안내] 방과후 수요 조사', m: { apply: { due: '2026-11-21' } } }, { title: '[연수 안내] 청렴교육', m: { apply: { due: '2026-11-10' } } },
    { title: '회의 안내', m: { apply: { due: '' } } }, { title: '지난 안내', m: { apply: { due: '2026-11-17' } } }];
  assert.deepEqual(deadlineLines(list, '2026-11-19'), [{ text: '쪽지 「지난 안내」 신청·회신 마감', when: '2일 지남', hot: true, route: { to: 'message' } },
    { text: '쪽지 「방과후 수요 조사」 신청·회신 마감', when: 'D-2', hot: false, route: { to: 'message' } }]);
  const { briefing } = await import('../../web/core/briefing.js');
  assert.ok(briefing({ today: '2026-11-19', messages: deadlineLines(list, '2026-11-19') }).some(l => l.kind === 'message' && l.text.includes('방과후')));
  const { routeText } = await import('../../web/core/chat-route.js');
  assert.equal(routeText('학년말 마감 도와줘').intent, 'yearend');
  assert.equal(routeText('학년말 성적 처리 안내').intent, null);
});
